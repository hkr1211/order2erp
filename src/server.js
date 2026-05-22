import http from "node:http";
import fs from "node:fs";
import { ErpClient, ERP_VIEWS, normalizeTable, toBusinessView } from "./erpClient.js";
import { queryOrderDeliveryRisks } from "./orderDeliveryRisks.js";
import { queryOrderShortages } from "./orderShortages.js";
import { queryPendingQuotes } from "./pendingQuotes.js";

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const client = new ErpClient();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/") {
      return sendHtml(res, 200, homePage());
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true, service: "erp-query-hub" });
    }

    if (req.method === "GET" && url.pathname === "/views") {
      return sendJson(res, 200, {
        views: {
          ...Object.fromEntries(Object.entries(ERP_VIEWS).map(([key, view]) => [key, describeView(view)])),
          pmc_exceptions: {
            name: "PMC异常视图",
            allowedParams: ["searchKey", "pageindex", "pagesize"]
          },
          contract_lines: {
            name: "销售合同明细视图",
            allowedParams: ["ord"]
          },
          contract_shortages: {
            name: "合同缺料分析视图",
            allowedParams: ["ord", "contract_ord", "cks", "scan_size", "scan_pages"]
          },
          order_shortages: {
            name: "订单缺料扫描视图",
            allowedParams: ["searchKey", "pageindex", "pagesize", "contract_limit", "limit", "scan_size", "cks", "stype", "include_all"]
          },
          order_delivery_risks: {
            name: "订单交期风险视图",
            allowedParams: ["searchKey", "pageindex", "pagesize", "contract_limit", "limit", "due_soon_days", "today", "stype", "include_all"]
          },
          pending_quotes: {
            name: "待报价项目视图",
            allowedParams: ["searchKey", "title", "xmid", "customer", "cateName", "complete1", "complete2", "pageindex", "pagesize", "limit", "quote_limit", "include_all"]
          },
          inventory_alerts: {
            name: "库存异常视图",
            allowedParams: ["cks", "searchKey", "title", "order1", "scan_size", "scan_pages", "alert_limit", "low_stock_threshold", "old_stock_days"]
          },
          pmc_dashboard: {
            name: "PMC综合看板",
            allowedParams: [
              "searchKey",
              "pageindex",
              "pagesize",
              "scan_size",
              "scan_pages",
              "alert_limit",
              "low_stock_threshold",
              "old_stock_days",
              "today",
              "contract_limit",
              "order_pagesize",
              "order_scan_size",
              "due_soon_days",
              "quote_pagesize",
              "quote_limit",
              "cks"
            ]
          }
        }
      });
    }

    if (req.method === "GET" && url.pathname === "/agent/tool-schema") {
      return sendJson(res, 200, agentToolSchema());
    }

    const viewMatch = url.pathname.match(/^\/api\/([^/]+)$/);
    if (viewMatch && (req.method === "GET" || req.method === "POST")) {
      const viewName = viewMatch[1];
      const params = req.method === "GET" ? Object.fromEntries(url.searchParams) : await readJson(req);

      const result =
        viewName === "pmc_exceptions"
          ? await client.queryPmcExceptions(params)
          : viewName === "contract_lines"
            ? await client.queryContractLines(params)
          : viewName === "contract_shortages"
            ? await client.queryContractShortages(params)
          : viewName === "order_shortages"
            ? await queryOrderShortages(client, params)
          : viewName === "order_delivery_risks"
            ? await queryOrderDeliveryRisks(client, params)
          : viewName === "pending_quotes"
            ? await queryPendingQuotes(client, params)
          : viewName === "inventory_alerts"
            ? await client.queryInventoryAlerts(params)
          : viewName === "pmc_dashboard"
            ? await queryPmcDashboard(params)
          : await client.queryView(viewName, params);

      const normalized =
        viewName === "pmc_exceptions" ||
        viewName === "contract_lines" ||
        viewName === "contract_shortages" ||
        viewName === "order_shortages" ||
        viewName === "order_delivery_risks" ||
        viewName === "pending_quotes" ||
        viewName === "inventory_alerts" ||
        viewName === "pmc_dashboard"
          ? result.body
          : normalizeTable(result);

      const payload = {
        view: viewName,
        business: toBusinessView(viewName, normalized),
        normalized,
        raw: result
      };
      if (wantsHtml(req, url)) {
        return sendHtml(res, 200, apiResultPage(payload, url));
      }
      return sendJson(res, 200, payload);
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ERP query hub listening on http://${HOST}:${PORT}`);
});

function describeView(view) {
  return {
    name: view.name,
    path: view.path,
    allowedParams: view.allowedParams
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function sendHtml(res, status, html) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function homePage() {
  const links = [
    ["健康检查", "/health", "确认本地中台是否正在运行"],
    ["全部视图", "/views", "查看可调用的 ERP 查询视图"],
    ["Agent 工具定义", "/agent/tool-schema", "给 OpenClaw 或 Hermes 注册工具时使用"],
    ["PMC 综合看板", "/api/pmc_dashboard?scan_pages=1&scan_size=20&contract_limit=3&alert_limit=10&low_stock_threshold=5&old_stock_days=180&due_soon_days=7&quote_limit=10", "库存、缺料、交期、待报价项目汇总"],
    ["销售订单", "/api/sales_orders?pageindex=1&pagesize=10", "查询最近销售合同/订单"],
    ["订单缺料", "/api/order_shortages?pageindex=1&pagesize=10&contract_limit=3&scan_size=100", "扫描最近未发货订单缺料情况"],
    ["订单交期风险", "/api/order_delivery_risks?pageindex=1&pagesize=10&contract_limit=5&due_soon_days=7", "查看延期和 7 天内临期交付明细"],
    ["待报价项目", "/api/pending_quotes?pageindex=1&pagesize=20&limit=20", "查看项目/商机中的待报价项目"],
    ["库存查询", "/api/inventory?pageindex=1&pagesize=20", "查询库存余额汇总"],
    ["库存异常", "/api/inventory_alerts?scan_pages=1&scan_size=20&alert_limit=10&low_stock_threshold=5&old_stock_days=180", "低库存、冻结库存、长库龄库存"]
  ];

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ERP 查询中台</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #172033;
      --muted: #647083;
      --border: #d9dee7;
      --accent: #176b58;
      --accent-soft: #e8f3ef;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 40px 0;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: flex-end;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
    }
    h1 {
      margin: 0;
      font-size: 32px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    p {
      margin: 8px 0 0;
      color: var(--muted);
      line-height: 1.6;
    }
    .status {
      flex: 0 0 auto;
      padding: 8px 12px;
      border-radius: 6px;
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 600;
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
      margin-top: 24px;
    }
    a.card {
      display: block;
      min-height: 116px;
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      color: inherit;
      text-decoration: none;
    }
    a.card:hover {
      border-color: var(--accent);
      box-shadow: 0 8px 24px rgba(23, 32, 51, 0.08);
    }
    .card strong {
      display: block;
      font-size: 17px;
      margin-bottom: 8px;
    }
    code {
      display: block;
      margin-top: 12px;
      color: var(--muted);
      font-size: 12px;
      word-break: break-all;
    }
    @media (max-width: 720px) {
      main { width: min(100% - 24px, 1120px); padding: 24px 0; }
      header { display: block; }
      .status { display: inline-block; margin-top: 16px; }
      h1 { font-size: 26px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>ERP 查询中台</h1>
        <p>本地只读 API 入口，用于连接智邦 ERP，并提供给 OpenClaw、Hermes 或对话系统调用。</p>
      </div>
      <div class="status">Running on ${HOST}:${PORT}</div>
    </header>
    <section class="grid">
      ${links
        .map(
          ([title, href, description]) => `<a class="card" href="${escapeHtml(href)}">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(description)}</span>
        <code>${escapeHtml(href)}</code>
      </a>`
        )
        .join("\n")}
    </section>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wantsHtml(req, url) {
  if (url.searchParams.get("format") === "json") {
    return false;
  }
  if (url.searchParams.get("format") === "html") {
    return true;
  }
  return (req.headers.accept || "").includes("text/html");
}

function apiResultPage(payload, url) {
  const business = payload.business || {};
  const rows = getDisplayRows(business);
  const summary = getSummary(business);
  const columns = getDisplayColumns(rows);
  const title = viewTitle(payload.view);
  const jsonSearch = new URLSearchParams(url.searchParams);
  jsonSearch.set("format", "json");
  const jsonUrl = `${url.pathname}?${jsonSearch}`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - ERP 查询中台</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #172033;
      --muted: #647083;
      --border: #d9dee7;
      --accent: #176b58;
      --accent-soft: #e8f3ef;
      --warning: #a25b00;
      --warning-soft: #fff5df;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    main { width: min(1280px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 40px; }
    .topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; }
    h1 { margin: 0; font-size: 28px; line-height: 1.25; letter-spacing: 0; }
    .meta { margin-top: 6px; color: var(--muted); font-size: 14px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .button { display: inline-flex; align-items: center; min-height: 36px; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--panel); color: var(--text); text-decoration: none; font-size: 14px; }
    .button.primary { background: var(--accent); border-color: var(--accent); color: #ffffff; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin: 18px 0; }
    .metric { min-height: 82px; padding: 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
    .metric .label { color: var(--muted); font-size: 13px; }
    .metric .value { margin-top: 8px; font-size: 24px; line-height: 1; font-weight: 700; }
    .table-wrap { overflow: auto; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
    table { width: 100%; border-collapse: collapse; min-width: 920px; }
    th, td { padding: 11px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; font-size: 14px; line-height: 1.45; }
    th { position: sticky; top: 0; z-index: 1; background: #f0f3f6; color: #334155; font-weight: 650; white-space: nowrap; }
    tr:hover td { background: #fbfcfd; }
    .empty { padding: 32px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); color: var(--muted); }
    .pill { display: inline-block; margin: 0 4px 4px 0; padding: 3px 7px; border-radius: 999px; background: var(--warning-soft); color: var(--warning); font-size: 12px; white-space: nowrap; }
    .notes { margin-top: 14px; color: var(--muted); font-size: 14px; line-height: 1.7; }
    @media (max-width: 760px) {
      main { width: min(100% - 24px, 1280px); padding-top: 20px; }
      .topbar { display: block; }
      .actions { justify-content: flex-start; margin-top: 14px; }
      h1 { font-size: 24px; }
    }
  </style>
</head>
<body>
  <main>
    <div class="topbar">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">视图：${escapeHtml(payload.view)} · 数据行：${rows.length}</div>
      </div>
      <div class="actions">
        <a class="button" href="/">首页</a>
        <a class="button" href="/views">全部视图</a>
        <a class="button primary" href="${escapeHtml(jsonUrl)}">查看 JSON</a>
      </div>
    </div>
    ${renderSummary(summary)}
    ${renderTable(rows, columns)}
    ${renderNotes(business.notes)}
  </main>
</body>
</html>`;
}

function getDisplayRows(business) {
  if (Array.isArray(business.rows)) {
    return business.rows;
  }
  if (Array.isArray(business.lines)) {
    return business.lines;
  }
  if (business.sections && typeof business.sections === "object") {
    return Object.entries(business.sections).flatMap(([sectionName, section]) => {
      if (Array.isArray(section)) {
        return section.map((row) => ({ section: sectionName, ...row }));
      }
      if (Array.isArray(section?.rows)) {
        return section.rows.map((row) => ({ section: sectionName, ...row }));
      }
      return [];
    });
  }
  return [];
}

function getSummary(business) {
  if (business.summary && typeof business.summary === "object") {
    return business.summary;
  }
  if (business.counts && typeof business.counts === "object") {
    return business.counts;
  }
  if (business.page && typeof business.page === "object") {
    return business.page;
  }
  return {};
}

function getDisplayColumns(rows) {
  const preferred = [
    "section", "order_no", "project_no", "title", "customer", "owner", "product_name", "product_code",
    "product_model", "warehouse", "stock_qty", "available_qty", "shortage_qty", "risk_type", "days_from_today",
    "delivery_date", "signed_date", "created_date", "amount", "estimated_amount", "quoted_amount",
    "warehouse_status", "delivery_status", "payment_status", "approval_status", "risk_flags"
  ];
  const keys = new Set();
  for (const row of rows.slice(0, 50)) {
    for (const key of Object.keys(row || {})) {
      if (key !== "raw" && !key.endsWith("_rows") && !["contract", "counts", "lines"].includes(key)) {
        keys.add(key);
      }
    }
  }
  const ordered = preferred.filter((key) => keys.has(key));
  const rest = [...keys].filter((key) => !ordered.includes(key)).slice(0, 8);
  return [...ordered, ...rest].slice(0, 16);
}

function renderSummary(summary) {
  const entries = Object.entries(summary || {}).filter(([, value]) => typeof value !== "object").slice(0, 12);
  if (entries.length === 0) {
    return "";
  }
  return `<section class="summary">
      ${entries.map(([key, value]) => `<div class="metric"><div class="label">${escapeHtml(labelFor(key))}</div><div class="value">${escapeHtml(value)}</div></div>`).join("\n")}
    </section>`;
}

function renderTable(rows, columns) {
  if (!rows.length || !columns.length) {
    return `<div class="empty">当前查询没有返回可展示的数据行。</div>`;
  }
  return `<section class="table-wrap">
      <table>
        <thead><tr>${columns.map((column) => `<th>${escapeHtml(labelFor(column))}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${columns.map((column) => `<td>${formatCell(row?.[column])}</td>`).join("")}</tr>`).join("\n")}
        </tbody>
      </table>
    </section>`;
}

function renderNotes(notes) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return "";
  }
  return `<section class="notes">${notes.map((note) => `<div>${escapeHtml(note)}</div>`).join("")}</section>`;
}

function formatCell(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "";
    }
    if (value.every((item) => typeof item !== "object")) {
      return value.map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("");
    }
    return escapeHtml(`${value.length} 项`);
  }
  if (value && typeof value === "object") {
    return escapeHtml(JSON.stringify(value).slice(0, 120));
  }
  if (value === undefined || value === null || value === "") {
    return "";
  }
  return escapeHtml(value);
}

function viewTitle(viewName) {
  const names = {
    sales_orders: "销售订单",
    contract_detail: "销售合同详情",
    contract_lines: "销售合同明细",
    contract_shortages: "合同缺料分析",
    order_shortages: "订单缺料扫描",
    order_delivery_risks: "订单交期风险",
    projects: "项目/商机",
    pending_quotes: "待报价项目",
    inventory: "库存查询",
    inventory_details: "库存明细",
    inventory_alerts: "库存异常",
    pmc_dashboard: "PMC 综合看板",
    warehouses: "仓库列表",
    products: "产品列表",
    stock_in_records: "入库流水",
    stock_in_details: "入库产品明细",
    receivables: "应收/收款",
    payables: "应付/付款"
  };
  return names[viewName] || viewName;
}

function labelFor(key) {
  const labels = {
    section: "分区",
    order_no: "订单号",
    project_no: "项目编号",
    title: "标题",
    customer: "客户",
    owner: "负责人",
    product_name: "产品名称",
    product_code: "产品编号",
    product_model: "规格型号",
    warehouse: "仓库",
    stock_qty: "库存数量",
    available_qty: "可用数量",
    shortage_qty: "缺口数量",
    risk_type: "风险类型",
    days_from_today: "距今天数",
    delivery_date: "交期",
    signed_date: "签订日期",
    created_date: "创建日期",
    amount: "金额",
    estimated_amount: "预计金额",
    quoted_amount: "报价金额",
    warehouse_status: "出库状态",
    delivery_status: "发货状态",
    payment_status: "收款状态",
    approval_status: "审批状态",
    risk_flags: "风险标签",
    scanned_orders: "扫描订单",
    candidate_orders: "候选订单",
    checked_orders: "已检查订单",
    orders_with_shortage: "缺料订单",
    shortage_rows: "缺料明细",
    risk_orders: "风险订单",
    risk_rows: "风险明细",
    overdue_rows: "延期明细",
    due_soon_rows: "临期明细",
    pending_quote_projects: "待报价项目",
    scanned_projects: "扫描项目",
    errors: "错误数"
  };
  return labels[key] || key;
}

async function queryPmcDashboard(params) {
  const dashboard = await client.queryPmcDashboard(params);
  try {
    const orderShortages = await queryOrderShortages(client, {
      ...params,
      pagesize: params.order_pagesize || params.pagesize || 10,
      contract_limit: params.contract_limit || 5,
      scan_size: params.order_scan_size || params.scan_size || 100
    });
    const body = dashboard.body;
    body.scan.order_shortages = orderShortages.body.scan;
    body.summary.order_shortage_orders = orderShortages.body.summary.orders_with_shortage;
    body.summary.order_shortage_rows = orderShortages.body.summary.shortage_rows;
    body.sections.order_shortages = orderShortages.body.orders;
    body.sections.order_shortage_rows = orderShortages.body.rows;
    body.source_status.order_shortages = {
      ok: orderShortages.body.summary.errors === 0,
      scanned_orders: orderShortages.body.summary.scanned_orders,
      checked_orders: orderShortages.body.summary.checked_orders,
      issue_count: orderShortages.body.summary.shortage_rows,
      errors: orderShortages.body.errors
    };
    const deliveryRisks = await queryOrderDeliveryRisks(client, {
      ...params,
      pagesize: params.order_pagesize || params.pagesize || 10,
      contract_limit: params.contract_limit || 5
    });
    body.scan.order_delivery_risks = deliveryRisks.body.scan;
    body.summary.delivery_risk_orders = deliveryRisks.body.summary.risk_orders;
    body.summary.delivery_risk_rows = deliveryRisks.body.summary.risk_rows;
    body.summary.overdue_delivery_rows = deliveryRisks.body.summary.overdue_rows;
    body.summary.due_soon_delivery_rows = deliveryRisks.body.summary.due_soon_rows;
    body.sections.delivery_risk_orders = deliveryRisks.body.orders;
    body.sections.overdue_delivery_rows = deliveryRisks.body.sections.overdue;
    body.sections.due_soon_delivery_rows = deliveryRisks.body.sections.due_soon;
    body.source_status.order_delivery_risks = {
      ok: deliveryRisks.body.summary.errors === 0,
      scanned_orders: deliveryRisks.body.summary.scanned_orders,
      checked_orders: deliveryRisks.body.summary.checked_orders,
      issue_count: deliveryRisks.body.summary.risk_rows,
      errors: deliveryRisks.body.errors
    };
    const pendingQuotes = await queryPendingQuotes(client, {
      ...params,
      pagesize: params.quote_pagesize || params.pagesize || 20,
      limit: params.quote_limit || params.alert_limit || 20
    });
    body.scan.pending_quotes = pendingQuotes.body.scan;
    body.summary.pending_quote_projects = pendingQuotes.body.summary.pending_quote_projects;
    body.sections.pending_quotes = pendingQuotes.body.rows;
    body.source_status.pending_quotes = {
      ok: true,
      scanned_projects: pendingQuotes.body.summary.scanned_projects,
      issue_count: pendingQuotes.body.summary.pending_quote_projects
    };
    body.notes = [
      "PMC 综合看板已聚合库存风险、工序计划延期、生产数据源状态、订单缺料、订单交期风险和待报价项目。",
      "订单类风险默认只检查最近少量未发货/未出库合同；可用 contract_limit 调整扫描量。"
    ];
  } catch (error) {
    dashboard.body.source_status.order_shortages = {
      ok: false,
      message: error.message
    };
  }
  return dashboard;
}

function agentToolSchema() {
  return {
    name: "query_erp",
    description: "查询智邦 ERP 的只读业务视图，返回适合对话分析的结构化 business 数据。",
    input_schema: {
      type: "object",
      required: ["view"],
      properties: {
        view: {
          type: "string",
          enum: [
            "sales_orders",
            "contract_detail",
            "contract_lines",
            "contract_shortages",
            "order_shortages",
            "order_delivery_risks",
            "pending_quotes",
            "projects",
            "inventory",
            "inventory_details",
            "warehouses",
            "products",
            "stock_in_records",
            "stock_in_details",
            "production_progress",
            "material_orders",
            "production_boms",
            "procedure_plans",
            "receivables",
            "payables",
            "pmc_exceptions",
            "inventory_alerts",
            "pmc_dashboard"
          ],
          description: "要查询的业务视图。"
        },
        filters: {
          type: "object",
          description: "查询条件。常用：pageindex、pagesize、searchKey、khmc、htbh、title、ord。"
        }
      }
    },
    examples: [
      {
        user: "查一下今天最新的销售订单",
        call: { view: "sales_orders", filters: { pageindex: 1, pagesize: 10 } }
      },
      {
        user: "有哪些未发货未收款订单？",
        call: { view: "pmc_exceptions", filters: { pageindex: 1, pagesize: 10 } }
      },
      {
        user: "查一下合同明细",
        call: { view: "contract_lines", filters: { ord: 12345 } }
      },
      {
        user: "分析这个合同有没有缺料",
        call: { view: "contract_shortages", filters: { ord: 12345, scan_size: 100 } }
      },
      {
        user: "最近哪些订单缺料？",
        call: { view: "order_shortages", filters: { pageindex: 1, pagesize: 10, contract_limit: 5, scan_size: 100 } }
      },
      {
        user: "哪些订单快到交期或者已经延期？",
        call: { view: "order_delivery_risks", filters: { pageindex: 1, pagesize: 10, contract_limit: 5, due_soon_days: 7 } }
      },
      {
        user: "有哪些待报价项目？",
        call: { view: "pending_quotes", filters: { pageindex: 1, pagesize: 20, limit: 20 } }
      },
      {
        user: "查一下钼产品库存",
        call: { view: "inventory", filters: { title: "钼", pageindex: 1, pagesize: 10 } }
      },
      {
        user: "有哪些仓库？",
        call: { view: "warehouses", filters: { pageindex: 1, pagesize: 20 } }
      },
      {
        user: "查最近已入库的物料",
        call: { view: "stock_in_records", filters: { rkzt: "3", pageindex: 1, pagesize: 10 } }
      },
      {
        user: "查一下领料记录",
        call: { view: "material_orders", filters: { pageindex: 1, pagesize: 10 } }
      },
      {
        user: "查一下工序计划",
        call: { view: "procedure_plans", filters: { pageindex: 1, pagesize: 10 } }
      },
      {
        user: "查一下库存异常",
        call: { view: "inventory_alerts", filters: { scan_pages: 3, alert_limit: 20, low_stock_threshold: 5, old_stock_days: 180 } }
      },
      {
        user: "给我看 PMC 综合异常",
        call: { view: "pmc_dashboard", filters: { scan_pages: 2, scan_size: 50, contract_limit: 5, alert_limit: 20, low_stock_threshold: 5, old_stock_days: 180 } }
      }
    ]
  };
}

function loadEnvFile(path = ".env") {
  if (!fs.existsSync(path)) {
    return;
  }

  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
