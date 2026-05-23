import http from "node:http";
import fs from "node:fs";
import { ErpClient, ERP_VIEWS, normalizeTable, toBusinessView } from "./erpClient.js";
import { queryOrderDeliveryRisks } from "./orderDeliveryRisks.js";
import { queryOrderShortages } from "./orderShortages.js";
import { queryPendingQuotes } from "./pendingQuotes.js";
import { initLocalDb, latestPmcSnapshot, latestSyncRuns, listFinanceRecords, listMaterialAlerts, listProcedurePlans, listQuoteFollowups, listSalesOrders, savePmcSnapshot } from "./localDb.js";
import { syncCoreData } from "./syncService.js";
import { buildSyncPolicyRows } from "./syncPolicy.js";
import { buildLocalExceptionCenter, buildLocalFinanceCenter, buildLocalPmcDashboard, quoteOwnerSummaryForLocal } from "./localAnalytics.js";

loadEnvFile();
initLocalDb();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const ERP_PROTECTION_MODE = process.env.ERP_PROTECTION_MODE !== "0";
const DEFAULT_SYNC_PAGE_SIZE = Number.parseInt(process.env.DEFAULT_SYNC_PAGE_SIZE || "20", 10) || 20;
const DEFAULT_SYNC_COOLDOWN_SECONDS = Number.parseInt(process.env.SYNC_COOLDOWN_SECONDS || "300", 10) || 300;
const client = new ErpClient();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/") {
      return sendHtml(res, 200, homePage());
    }

    if (req.method === "GET" && url.pathname === "/roles") {
      return sendHtml(res, 200, roleWorkbenchesPage());
    }

    if (req.method === "GET" && url.pathname === "/pmc") {
      const params = Object.fromEntries(url.searchParams);
      const result = await queryPmcConsole(params);
      return sendHtml(res, 200, pmcConsolePage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/orders") {
      const params = Object.fromEntries(url.searchParams);
      const result = await queryOrderCenter(params);
      return sendHtml(res, 200, orderCenterPage(result.body, url));
    }

    if (req.method === "GET" && url.pathname === "/order") {
      const params = Object.fromEntries(url.searchParams);
      const result = await queryOrderDetail(params);
      return sendHtml(res, 200, orderDetailPage(result.body, url));
    }

    if (req.method === "GET" && url.pathname === "/materials") {
      const params = Object.fromEntries(url.searchParams);
      const result = await queryMaterialControl(params);
      return sendHtml(res, 200, materialControlPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/procurement") {
      const params = Object.fromEntries(url.searchParams);
      const result = await queryProcurementCenter(params);
      return sendHtml(res, 200, procurementCenterPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/finance") {
      const params = Object.fromEntries(url.searchParams);
      const result = await queryFinanceCenter(params);
      return sendHtml(res, 200, financeCenterPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/quotes") {
      const params = Object.fromEntries(url.searchParams);
      const result = await queryQuoteCenter(params);
      return sendHtml(res, 200, quoteCenterPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/production") {
      const params = Object.fromEntries(url.searchParams);
      const result = parseBoolean(params.refresh) ? await queryProductionCenter(params) : await queryLocalProductionCenter(params);
      return sendHtml(res, 200, productionCenterPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/dispatch") {
      const params = Object.fromEntries(url.searchParams);
      const result = parseBoolean(params.refresh) ? await queryProductionCenter(params) : await queryLocalProductionCenter(params);
      return sendHtml(res, 200, dispatchTrackingPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/scheduling") {
      const params = Object.fromEntries(url.searchParams);
      const result = await querySchedulingCenter(params);
      return sendHtml(res, 200, schedulingCenterPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/exceptions") {
      const params = Object.fromEntries(url.searchParams);
      const result = await queryExceptionCenter(params);
      return sendHtml(res, 200, exceptionCenterPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/reports") {
      const params = Object.fromEntries(url.searchParams);
      const result = await queryReportCenter(params);
      return sendHtml(res, 200, reportCenterPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/reports/export.csv") {
      const params = Object.fromEntries(url.searchParams);
      const result = await queryReportCenter(params);
      return sendCsv(res, "pmc-report.csv", reportCenterCsv(result.body));
    }

    if (req.method === "GET" && url.pathname === "/reports/export.xls") {
      const params = Object.fromEntries(url.searchParams);
      const result = await queryReportCenter(params);
      return sendExcel(res, "pmc-report.xls", reportCenterExcel(result.body));
    }

    if (req.method === "GET" && url.pathname === "/reports/print") {
      const params = Object.fromEntries(url.searchParams);
      const result = await queryReportCenter(params);
      return sendHtml(res, 200, reportPrintPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/goal") {
      return sendHtml(res, 200, pmcGoalPage());
    }

    if (req.method === "GET" && url.pathname === "/system") {
      const params = Object.fromEntries(url.searchParams);
      const result = await querySystemStatus(params);
      return sendHtml(res, 200, systemStatusPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/sync") {
      const params = { pagesize: DEFAULT_SYNC_PAGE_SIZE, ...Object.fromEntries(url.searchParams) };
      const result = await syncCoreData(client, params);
      return sendHtml(res, 200, syncStatusPage(result));
    }

    if (req.method === "GET" && url.pathname === "/api/sync") {
      const params = { pagesize: DEFAULT_SYNC_PAGE_SIZE, ...Object.fromEntries(url.searchParams) };
      const result = await syncCoreData(client, params);
      return sendJson(res, 200, result);
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
          },
          pmc_console: {
            name: "PMC驾驶舱首页",
            allowedParams: ["today", "scan_size", "scan_pages", "alert_limit", "contract_limit", "due_soon_days", "quote_limit", "low_stock_threshold", "old_stock_days"]
          },
          order_center: {
            name: "订单管理中心",
            allowedParams: ["searchKey", "pageindex", "pagesize", "contract_limit", "due_soon_days", "scan_size", "status"]
          },
          order_detail: {
            name: "订单穿透详情",
            allowedParams: ["ord", "due_soon_days", "scan_size", "cks", "today"]
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
          : viewName === "pmc_console"
            ? await queryPmcConsole(params)
          : viewName === "order_center"
            ? await queryOrderCenter(params)
          : viewName === "order_detail"
            ? await queryOrderDetail(params)
          : await client.queryView(viewName, params);

      const normalized =
        viewName === "pmc_exceptions" ||
        viewName === "contract_lines" ||
        viewName === "contract_shortages" ||
        viewName === "order_shortages" ||
        viewName === "order_delivery_risks" ||
        viewName === "pending_quotes" ||
        viewName === "inventory_alerts" ||
        viewName === "pmc_dashboard" ||
        viewName === "pmc_console" ||
        viewName === "order_center" ||
        viewName === "order_detail"
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
  if (ERP_PROTECTION_MODE) {
    console.log("ERP protection mode enabled: startup sync and automatic ERP status login are disabled.");
    return;
  }
  syncCoreData(client, { pagesize: DEFAULT_SYNC_PAGE_SIZE, sources: "sales_orders" }).then((result) => {
    console.log(`Startup sync finished: ${result.results.map((row) => `${row.status}:${row.rows_synced}`).join(", ")}`);
  }).catch((error) => {
    console.error("Startup sync failed", error);
  });
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

function sendCsv(res, filename, csv) {
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`
  });
  res.end(`\ufeff${csv}`);
}

function sendExcel(res, filename, html) {
  res.writeHead(200, {
    "Content-Type": "application/vnd.ms-excel; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`
  });
  res.end(`\ufeff${html}`);
}

function homePage() {
  const snapshot = latestPmcSnapshot();
  const summary = snapshot?.summary || {};
  const businessLinks = [
    ["角色工作台", "/roles", "老板、PMC、销售的常用入口和处理重点"],
    ["PMC 驾驶舱", "/pmc", "老板、PMC、销售共用的一屏总览"],
    ["订单管理中心", "/orders", "订单作战清单、阻塞点、下一步动作"],
    ["物料控制中心", "/materials", "缺料、低库存、冻结、长库龄统一处理"],
    ["异常管理中心", "/exceptions", "交期、缺料、报价、库存异常待办池"],
    ["排产甘特视图", "/scheduling", "交期时间轴、压力分布、插单影响评估"],
    ["采购跟催中心", "/procurement", "供应商跟催、入库、应付付款跟踪"],
    ["生产进度中心", "/production", "延期工序、工作中心负荷、BOM 数据"],
    ["派工进度追踪", "/dispatch", "查看派工单ID、工序计划、完工数量和延期派工"],
    ["待报价中心", "/quotes", "销售报价跟进池、负责人汇总"],
    ["应收应付中心", "/finance", "客户欠款、逾期应收、近期应付"]
  ];
  const outputLinks = [
    ["报表中心", "/reports", "订单、交期、缺料、报价、库存指标汇总"],
    ["报表导出", "/reports/export.csv", "导出 Excel 可打开的 PMC 指标 CSV"],
    ["Excel报表", "/reports/export.xls", "导出带格式的 PMC 日报 Excel 文件"],
    ["报表打印版", "/reports/print", "适合打印成 PDF 的 PMC 日报"],
    ["PMC 全功能路线", "/goal", "查看完整 PMC 平台实施目标和当前完成度"],
    ["数据源状态中心", "/system", "查看 ERP 连通性、本地快照和系统状态"]
  ];
  const apiLinks = [
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
  const metricRows = [
    ["今日订单", summary.today_orders ?? "--"],
    ["本月订单", summary.month_orders ?? "--"],
    ["逾期订单", summary.overdue_orders ?? "--"],
    ["7天内交期", summary.due_soon_orders ?? "--"],
    ["缺料订单", summary.shortage_orders ?? "--"],
    ["待报价", summary.pending_quote_projects ?? "--"],
    ["低库存", summary.low_stock ?? "--"]
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
      margin-top: 14px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 10px;
      margin: 22px 0 18px;
    }
    .metric {
      min-height: 82px;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
    }
    .metric span {
      display: block;
      color: var(--muted);
      font-size: 13px;
    }
    .metric strong {
      display: block;
      margin-top: 8px;
      font-size: 24px;
      line-height: 1;
    }
    h2 {
      margin: 24px 0 0;
      font-size: 18px;
      line-height: 1.3;
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
        <p>蕴杰金属数字 PMC 控制台，本地内网免登录版。优先打开图形化业务页面，API 入口放在底部。</p>
      </div>
      <div class="status">Running on ${HOST}:${PORT}</div>
    </header>
    <section class="metrics">
      ${metricRows.map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
    </section>
    ${snapshot ? `<p>最近快照：${escapeHtml(formatDateTime(snapshot.created_at))}。多数页面默认读取快照，点击刷新按钮时再实时扫描 ERP。</p>` : `<p>当前还没有本地快照，打开 PMC 驾驶舱后会自动生成。</p>`}
    ${homeSection("日常业务", businessLinks)}
    ${homeSection("管理输出", outputLinks)}
    ${homeSection("系统与 API", apiLinks)}
  </main>
</body>
</html>`;
}

function homeSection(title, links) {
  return `<h2>${escapeHtml(title)}</h2>
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
    </section>`;
}

function roleWorkbenchesPage() {
  const snapshot = latestPmcSnapshot();
  const summary = snapshot?.summary || {};
  const roleRows = [
    {
      role: "老板",
      focus: `看交付风险和经营结果：本月订单 ${summary.month_orders ?? "--"}，缺料订单 ${summary.shortage_orders ?? "--"}，低库存 ${summary.low_stock ?? "--"}。`,
      primary_action: "先看 PMC 驾驶舱，再看报表和应收应付。",
      entry_1: "/pmc",
      entry_2: "/reports",
      entry_3: "/finance",
      entry_4: ""
    },
    {
      role: "PMC",
      focus: `处理生产交付阻塞：7天内交期 ${summary.due_soon_orders ?? "--"}，缺料订单 ${summary.shortage_orders ?? "--"}。`,
      primary_action: "先处理异常待办，再看订单、物料和排产压力。",
      entry_1: "/exceptions",
      entry_2: "/orders",
      entry_3: "/materials",
      entry_4: "/dispatch"
    },
    {
      role: "销售",
      focus: `跟进客户交期和报价：待报价 ${summary.pending_quote_projects ?? "--"}，7天内交期 ${summary.due_soon_orders ?? "--"}。`,
      primary_action: "先看待报价和订单阻塞，再同步客户和收款风险。",
      entry_1: "/quotes",
      entry_2: "/orders",
      entry_3: "/finance",
      entry_4: ""
    }
  ];
  const workflowRows = [
    { workflow: "每日晨会", owner: "PMC", step_1: "打开 /pmc 看总览", step_2: "进入 /exceptions 处理高优先级", step_3: "必要时进入 /scheduling 看插单影响" },
    { workflow: "客户交期沟通", owner: "销售", step_1: "打开 /orders 查看阻塞点", step_2: "确认 /materials 缺料或 /dispatch 派工", step_3: "同步客户交期和下一步动作" },
    { workflow: "采购跟催", owner: "PMC/采购", step_1: "打开 /procurement 看跟催清单", step_2: "结合 /materials 缺料任务排序", step_3: "反馈预计到货和替代方案" },
    { workflow: "老板日报", owner: "老板/PMC", step_1: "打开 /reports 看指标", step_2: "导出 /reports/export.xls", step_3: "必要时打印 /reports/print" }
  ];
  return modulePage({
    title: "角色工作台",
    subtitle: "按老板、PMC、销售三类用户组织常用入口和日常处理流程。",
    summary: [
      ["今日订单", summary.today_orders ?? "--"],
      ["本月订单", summary.month_orders ?? "--"],
      ["缺料订单", summary.shortage_orders ?? "--"],
      ["待报价", summary.pending_quote_projects ?? "--"],
      ["低库存", summary.low_stock ?? "--"]
    ],
    panels: [
      modulePanel("角色入口", roleRows, ["role", "focus", "primary_action", "entry_1", "entry_2", "entry_3", "entry_4"]),
      modulePanel("日常流程", workflowRows, ["workflow", "owner", "step_1", "step_2", "step_3"])
    ],
    notes: [
      snapshot ? `当前角色工作台读取本地快照：${formatDateTime(snapshot.created_at)}。` : "当前没有本地快照，打开 PMC 驾驶舱后会自动生成。",
      "这是内网免登录版，入口按角色分组但不做权限拦截。"
    ],
    actions: [
      ["首页", "/"]
    ]
  });
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
      return value.map((item) => `<span class="pill">${escapeHtml(displayValue(item))}</span>`).join("");
    }
    return escapeHtml(`${value.length} 项`);
  }
  if (value && typeof value === "object") {
    return escapeHtml(JSON.stringify(value).slice(0, 120));
  }
  if (value === undefined || value === null || value === "") {
    return "";
  }
  return escapeHtml(displayValue(value));
}

function displayValue(value) {
  const text = String(value);
  const translations = {
    due_soon: "7天内到期",
    overdue: "逾期",
    normal: "正常",
    red: "红",
    yellow: "黄",
    green: "绿",
    true: "是",
    false: "否"
  };
  return translations[text] || text;
}

function viewTitle(viewName) {
  const names = {
    sales_orders: "销售订单",
    contract_detail: "销售合同详情",
    contract_lines: "销售合同明细",
    contract_shortages: "合同缺料分析",
    order_shortages: "订单缺料扫描",
    order_delivery_risks: "订单交期风险",
    order_detail: "订单穿透详情",
    projects: "项目/商机",
    pending_quotes: "待报价项目",
    inventory: "库存查询",
    inventory_details: "库存明细",
    inventory_alerts: "库存异常",
    pmc_dashboard: "PMC 综合看板",
    pmc_console: "PMC 驾驶舱首页",
    order_center: "订单管理中心",
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
    role: "角色",
    focus: "工作重点",
    primary_action: "建议动作",
    entry_1: "入口1",
    entry_2: "入口2",
    entry_3: "入口3",
    entry_4: "入口4",
    workflow: "流程",
    step_1: "步骤1",
    step_2: "步骤2",
    step_3: "步骤3",
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
    demand_qty: "需求数量",
    remaining_qty: "未交数量",
    risk_type: "风险类型",
    days_from_today: "距今天数",
    delivery_date: "交期",
    signed_date: "签订日期",
    created_date: "创建日期",
    amount: "金额",
    estimated_amount: "预计金额",
    quoted_amount: "报价金额",
    project_stage: "项目阶段",
    po_no: "PO编号",
    unit: "单位",
    delivered_qty: "已交数量",
    line_id: "明细ID",
    matched_by: "匹配方式",
    receipt_no: "入库单号",
    quantity: "数量",
    warehouse_keeper: "库管员",
    applicant: "申请人",
    receipt_status: "入库状态",
    receipt_type: "入库类别",
    application_time: "申请时间",
    confirmed_time: "确认时间",
    warehouse_title: "仓库",
    source_errors: "数据源异常",
    counterparty: "往来单位",
    bill_no: "单号",
    business_title: "业务摘要",
    paid_amount: "已收/已付",
    unpaid_amount: "未收/未付",
    bill_date: "单据日期",
    due_date: "到期日",
    payment_terms: "付款条件",
    age_days: "账龄天数",
    due_days: "到期天数",
    risk_status: "风险状态",
    task_no: "待办编号",
    followup_no: "跟催编号",
    followup_type: "跟催类型",
    quote_no: "报价编号",
    quote_status: "报价状态",
    quote_followups: "报价跟进",
    urgent_quotes: "紧急报价",
    material_task_no: "物料任务编号",
    material_task_type: "物料任务类型",
    material_tasks: "物料任务",
    urgent_material_tasks: "紧急物料任务",
    owner_count: "负责人数",
    max_age_days: "最长停留天数",
    bucket: "时间窗口",
    order_count: "订单数",
    high_impact_orders: "高影响订单",
    this_week_orders: "7天内订单",
    impact_level: "影响等级",
    schedule_advice: "排产建议",
    exception_type: "异常类型",
    priority: "优先级",
    related_no: "关联单号",
    item: "事项",
    responsible_role: "责任角色",
    action: "处理建议",
    supplier: "供应商",
    followup_tasks: "跟催事项",
    urgent_followups: "紧急跟催",
    latest_action: "最近建议",
    dispatch_records: "派工记录",
    delayed_dispatches: "延期派工",
    blocked_orders: "阻塞订单",
    blocker: "阻塞点",
    next_action: "下一步动作",
    work_centers: "工作中心",
    work_center_name: "工作中心",
    work_assignment_id: "派工单ID",
    bom_id: "BOM ID",
    bom_title: "清单主题",
    bom_no: "清单编号",
    parent_product: "父件产品",
    effective_status: "生效状态",
    enabled_status: "启用状态",
    bom_type: "BOM类型",
    customer_scope: "适用客户",
    procedure_count: "工序数",
    delayed_procedures: "延期工序",
    procedure_name: "工序",
    planned_qty: "计划数量",
    finished_qty: "完成数量",
    planned_start_date: "计划开工",
    planned_finish_date: "计划完工",
    open_tasks: "未关闭待办",
    critical_tasks: "高优先级待办",
    records: "记录数",
    overdue_records: "逾期记录",
    earliest_due_date: "最近到期日",
    earliest_due_days: "最近到期天数",
    receivable_unpaid: "未收合计",
    payable_unpaid: "未付合计",
    overdue_receivables: "逾期应收",
    due_soon_payables: "7天内应付",
    status: "状态",
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
    ,
    status_light: "状态灯",
    status_text: "订单状态",
    due_status: "交期状态",
    shortage_status: "缺料状态"
  };
  return labels[key] || key;
}

function pmcConsolePage(body) {
  const cards = [
    ["今日订单", body.summary.today_orders ?? "--", "今日签订订单数量", "neutral"],
    ["本月订单", body.summary.month_orders ?? "--", "本月签订订单数量", "neutral"],
    ["逾期订单", body.summary.overdue_orders, "交期已过且未交付", "danger"],
    ["7天内交期", body.summary.due_soon_orders, "临近交付窗口", "warning"],
    ["缺料订单", body.summary.shortage_orders, "按销售订单产品库存计算", "danger"],
    ["待报价项目", body.summary.pending_quote_projects, "项目/商机待报价", "warning"],
    ["低库存预警", body.summary.low_stock, "可用库存低于阈值", "warning"]
  ];
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>蕴杰金属数字 PMC 控制台</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f6f8;
      --panel: #ffffff;
      --text: #172033;
      --muted: #667085;
      --border: #d9dee7;
      --green: #176b58;
      --green-soft: #e8f3ef;
      --amber: #a15c00;
      --amber-soft: #fff3d8;
      --red: #b42318;
      --red-soft: #fee4e2;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    main { width: min(1440px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 36px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 18px; border-bottom: 1px solid var(--border); }
    h1 { margin: 0; font-size: 30px; line-height: 1.2; letter-spacing: 0; }
    .sub { margin-top: 8px; color: var(--muted); font-size: 14px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .button { min-height: 36px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); text-decoration: none; font-size: 14px; }
    .button.primary { background: var(--green); border-color: var(--green); color: #ffffff; }
    .kpis { display: grid; grid-template-columns: repeat(7, minmax(132px, 1fr)); gap: 10px; margin: 18px 0; }
    .kpi { min-height: 112px; padding: 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
    .kpi.warning { background: var(--amber-soft); border-color: #f3c77b; }
    .kpi.danger { background: var(--red-soft); border-color: #f2a7a3; }
    .kpi .label { color: var(--muted); font-size: 13px; }
    .kpi .value { margin-top: 10px; font-size: 30px; line-height: 1; font-weight: 750; }
    .kpi .hint { margin-top: 12px; color: var(--muted); font-size: 12px; line-height: 1.4; }
    .layout { display: grid; grid-template-columns: 1.05fr 1fr; gap: 12px; align-items: start; }
    .panel { border: 1px solid var(--border); border-radius: 8px; background: var(--panel); overflow: hidden; }
    .panel h2 { margin: 0; padding: 14px 16px; border-bottom: 1px solid var(--border); font-size: 17px; letter-spacing: 0; }
    .panel h2.danger { color: var(--red); }
    .panel h2.warning { color: var(--amber); }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; font-size: 13px; line-height: 1.45; }
    th { background: #f0f3f6; color: #344054; font-weight: 650; white-space: nowrap; }
    tr:last-child td { border-bottom: 0; }
    .empty { padding: 20px 16px; color: var(--muted); font-size: 14px; }
    .stack { display: grid; gap: 12px; }
    .tag { display: inline-block; padding: 3px 7px; border-radius: 999px; background: var(--green-soft); color: var(--green); font-size: 12px; white-space: nowrap; }
    .tag.danger { background: var(--red-soft); color: var(--red); }
    .tag.warning { background: var(--amber-soft); color: var(--amber); }
    .notes { margin-top: 12px; color: var(--muted); font-size: 13px; line-height: 1.7; }
    @media (max-width: 1180px) {
      .kpis { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
      .layout { grid-template-columns: 1fr; }
    }
    @media (max-width: 720px) {
      main { width: min(100% - 24px, 1440px); }
      header { display: block; }
      .actions { justify-content: flex-start; margin-top: 14px; }
      h1 { font-size: 24px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>蕴杰金属数字 PMC 控制台</h1>
        <div class="sub">内网免登录版 · 老板 / PMC / 销售共用 · 更新时间 ${escapeHtml(formatDateTime(body.generated_at))}${body.cached ? " · 读取本地快照" : ""}</div>
      </div>
      <div class="actions">
        <a class="button" href="/">首页</a>
        <a class="button" href="/orders">订单中心</a>
        <a class="button" href="/materials">物料中心</a>
        <a class="button" href="/exceptions">异常中心</a>
        <a class="button" href="/reports">报表中心</a>
        <a class="button" href="/api/pmc_console?format=json">查看 JSON</a>
        <a class="button primary" href="/pmc?refresh=1">刷新驾驶舱</a>
      </div>
    </header>
    <section class="kpis">
      ${cards.map(([label, value, hint, tone]) => `<div class="kpi ${tone}"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div><div class="hint">${escapeHtml(hint)}</div></div>`).join("\n")}
    </section>
    <section class="layout">
      <div class="stack">
        ${pmcTablePanel("逾期订单", body.sections.overdue_orders, ["order_no", "customer", "product_name", "remaining_qty", "delivery_date"], "danger")}
        ${pmcTablePanel("7天内交期订单", body.sections.due_soon_orders, ["order_no", "customer", "product_name", "remaining_qty", "delivery_date"], "warning")}
        ${pmcTablePanel("缺料订单", body.sections.shortage_orders, ["order_no", "customer", "product_name", "demand_qty", "available_qty", "shortage_qty"], "danger")}
      </div>
      <div class="stack">
        ${pmcTablePanel("待报价项目", body.sections.pending_quotes, ["project_no", "title", "customer", "project_stage", "estimated_amount"], "warning")}
        ${pmcTablePanel("低库存预警", body.sections.low_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"], "warning")}
      </div>
    </section>
    <section class="notes">
      ${body.notes.map((note) => `<div>${escapeHtml(note)}</div>`).join("")}
    </section>
  </main>
</body>
</html>`;
}

function pmcTablePanel(title, rows, columns, tone = "") {
  const safeRows = Array.isArray(rows) ? rows.slice(0, 10) : [];
  return `<section class="panel">
    <h2 class="${escapeHtml(tone)}">${escapeHtml(title)} <span class="tag ${escapeHtml(tone)}">${safeRows.length}</span></h2>
    ${
      safeRows.length
        ? `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(labelFor(column))}</th>`).join("")}</tr></thead><tbody>${safeRows.map((row) => `<tr>${columns.map((column) => `<td>${formatCell(row?.[column])}</td>`).join("")}</tr>`).join("")}</tbody></table>`
        : `<div class="empty">当前没有${escapeHtml(title)}。</div>`
    }
  </section>`;
}

async function queryOrderCenter(params = {}) {
  const pageIndex = clampInt(params.pageindex || 1, 1, 10000);
  const pageSize = clampInt(params.pagesize || 20, 1, 100);
  const contractLimit = clampInt(params.contract_limit || pageSize, 1, 30);
  const dueSoonDays = clampInt(params.due_soon_days || 7, 1, 60);
  const scanSize = clampInt(params.scan_size || 100, 1, 500);
  const searchKey = params.searchKey || "";
  const statusFilter = params.status || "";
  const refresh = parseBoolean(params.refresh);
  const snapshot = latestPmcSnapshot();

  if (!refresh && !searchKey) {
    const localRows = localOrderCenterRows({ limit: pageSize, statusFilter });
    if (localRows.allRows.length) {
      return {
        header: { status: 0, message: "ok" },
        body: {
          model: "order_center",
          cached: true,
          scan: {
            pageindex: pageIndex,
            pagesize: pageSize,
            contract_limit: contractLimit,
            due_soon_days: dueSoonDays,
            scan_size: scanSize,
            searchKey,
            status: statusFilter
          },
          page: null,
          summary: orderCenterSummary(localRows.allRows, localRows.filteredRows),
          rows: localRows.filteredRows,
          source_status: {
            sqlite_sales_orders: { ok: true, rows: localRows.allRows.length }
          },
          notes: [
            "当前读取本地 SQLite 销售订单表。",
            "点击“刷新实时订单”会直接访问 ERP；点击“谨慎同步订单20条”可小批量更新本地 SQLite。"
          ]
        }
      };
    }
  }

  if (snapshot && !refresh && !searchKey) {
    const rows = orderCenterRowsFromSnapshot(snapshot.payload);
    const filteredRows = statusFilter ? rows.filter((row) => row.status_code === statusFilter) : rows;
    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "order_center",
        cached: true,
        cache_created_at: snapshot.created_at,
        scan: {
          pageindex: pageIndex,
          pagesize: pageSize,
          contract_limit: contractLimit,
          due_soon_days: dueSoonDays,
          scan_size: scanSize,
          searchKey,
          status: statusFilter
        },
        page: null,
        summary: orderCenterSummary(rows, filteredRows),
        rows: filteredRows,
        source_status: {
          pmc_snapshot: { ok: true, created_at: snapshot.created_at }
        },
        notes: [
          `当前读取本地驾驶舱快照：${formatDateTime(snapshot.created_at)}。`,
          "点击“刷新实时订单”可重新扫描 ERP 销售订单、合同明细、交期风险和缺料风险。"
        ]
      }
    };
  }

  if (ERP_PROTECTION_MODE && !refresh && !searchKey) {
    return {
      header: { status: 0, message: "offline order center" },
      body: emptyOrderCenterBody({
        pageIndex,
        pageSize,
        contractLimit,
        dueSoonDays,
        scanSize,
        searchKey,
        statusFilter,
        message: "ERP保护模式已开启，订单中心未找到本地 SQLite/快照数据时不再自动请求 ERP。"
      })
    };
  }

  try {
    const timeoutMs = clampInt(params.timeout_ms || 12000, 1000, 30000);
    const [salesResult, deliveryRisks, shortages] = await Promise.all([
      withTimeout(client.queryView("sales_orders", {
        searchKey,
        pageindex: String(pageIndex),
        pagesize: String(pageSize)
      }), timeoutMs),
      withTimeout(queryOrderDeliveryRisks(client, {
        searchKey,
        pageindex: String(pageIndex),
        pagesize: String(pageSize),
        contract_limit: String(contractLimit),
        due_soon_days: String(dueSoonDays)
      }), timeoutMs),
      withTimeout(queryOrderShortages(client, {
        searchKey,
        pageindex: String(pageIndex),
        pagesize: String(pageSize),
        contract_limit: String(contractLimit),
        scan_size: String(scanSize)
      }), timeoutMs)
    ]);

    const salesTable = normalizeTable(salesResult);
    const salesOrders = toBusinessView("sales_orders", salesTable).rows;
    const riskIndex = indexOrderRisks(deliveryRisks.body.rows || []);
    const shortageIndex = indexOrderShortages(shortages.body.rows || []);
    const rows = salesOrders.map((order) => mapOrderCenterRow(order, riskIndex, shortageIndex));
    const filteredRows = statusFilter ? rows.filter((row) => row.status_code === statusFilter) : rows;

    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "order_center",
        scan: {
          pageindex: pageIndex,
          pagesize: pageSize,
          contract_limit: contractLimit,
          due_soon_days: dueSoonDays,
          scan_size: scanSize,
          searchKey,
          status: statusFilter
        },
        page: salesTable.page,
        summary: orderCenterSummary(rows, filteredRows),
        rows: filteredRows,
        source_status: {
          sales_orders: { ok: true, rows: salesOrders.length, page: salesTable.page },
          order_delivery_risks: {
            ok: (deliveryRisks.body.errors || []).length === 0,
            checked_orders: deliveryRisks.body.summary.checked_orders,
            risk_rows: deliveryRisks.body.summary.risk_rows
          },
          order_shortages: {
            ok: (shortages.body.errors || []).length === 0,
            checked_orders: shortages.body.summary.checked_orders,
            shortage_rows: shortages.body.summary.shortage_rows
          }
        },
        notes: [
          "订单管理中心第一版按销售订单列表聚合交期风险和缺料风险。",
          "PO 编号后续从合同明细提取；当前列表先显示 ERP 合同号。",
          "每条订单会按交期和缺料状态推导阻塞点、优先级和下一步动作。"
        ]
      }
    };
  } catch (error) {
    return {
      header: { status: 0, message: "offline order center" },
      body: emptyOrderCenterBody({
        pageIndex,
        pageSize,
        contractLimit,
        dueSoonDays,
        scanSize,
        searchKey,
        statusFilter,
        message: summarizeDataSourceError(error)
      })
    };
  }
}

function localOrderCenterRows({ limit, statusFilter }) {
  const today = startOfDay(new Date());
  const salesOrders = listSalesOrders({ limit }).map((row) => mapLocalSalesOrder(row, today));
  const materialAlerts = listMaterialAlerts({ limit: 500 }).filter((row) => row.alert_type === "shortage");
  const shortageIndex = indexOrderShortages(materialAlerts);
  const rows = salesOrders.map((order) => mapOrderCenterRow(order, new Map(), shortageIndex));
  const enrichedRows = rows.map((row) => {
    if (row.due_status !== "正常" || !row.delivery_date) {
      return row;
    }
    const deliveryDate = parseDate(row.delivery_date);
    if (!deliveryDate) {
      return row;
    }
    const days = daysBetween(today, startOfDay(deliveryDate));
    const dueStatus = days < 0 ? "逾期" : days <= 7 ? "7天内到期" : "正常";
    return enrichOrderCenterAction({ ...row, due_status: dueStatus, days_from_today: days });
  });
  const filteredRows = statusFilter ? enrichedRows.filter((row) => row.status_code === statusFilter) : enrichedRows;
  return { allRows: enrichedRows, filteredRows };
}

function mapLocalSalesOrder(row, today) {
  const deliveryDate = row.delivery_date || "";
  const parsedDelivery = parseDate(deliveryDate);
  return {
    erp_id: row.erp_id,
    order_no: row.order_no,
    title: row.product_name || row.order_no,
    customer: row.customer,
    owner: row.owner,
    amount: row.amount,
    signed_date: row.signed_date,
    delivery_date: deliveryDate,
    days_from_today: parsedDelivery ? daysBetween(today, startOfDay(parsedDelivery)) : null,
    warehouse_status: "",
    delivery_status: "",
    payment_status: "",
    approval_status: row.status_text,
    raw: parseJson(row.raw_json, row)
  };
}

function orderCenterRowsFromSnapshot(payload) {
  const rows = [
    ...(payload?.sections?.overdue_orders || []).map((row) => ({ ...row, due_status: "逾期" })),
    ...(payload?.sections?.due_soon_orders || []).map((row) => ({ ...row, due_status: "7天内到期" })),
    ...(payload?.sections?.shortage_orders || []).map((row) => ({ ...row, shortage_status: "缺料" }))
  ];
  const merged = new Map();
  for (const row of rows) {
    const key = row.order_no || `${row.customer || ""}-${row.product_name || ""}-${row.delivery_date || ""}`;
    const current = merged.get(key) || {
      erp_id: row.erp_id,
      order_no: row.order_no,
      title: row.title,
      customer: row.customer,
      owner: row.owner,
      amount: row.amount,
      signed_date: row.signed_date,
      delivery_date: row.delivery_date,
      days_from_today: row.days_from_today,
      due_status: row.due_status || "正常",
      shortage_status: row.shortage_status || "未发现缺料",
      shortage_rows: 0,
      shortage_qty: 0,
      risk_products: [],
      warehouse_status: row.warehouse_status,
      delivery_status: row.delivery_status,
      payment_status: row.payment_status,
      approval_status: row.approval_status,
      raw: row.raw || row
    };
    if (row.due_status === "逾期" || row.risk_type === "overdue") {
      current.due_status = "逾期";
    } else if (row.due_status === "7天内到期" || row.risk_type === "due_soon") {
      current.due_status = current.due_status === "逾期" ? "逾期" : "7天内到期";
    }
    if (row.shortage_status === "缺料" || parseNumber(row.shortage_qty) > 0) {
      current.shortage_status = "缺料";
      current.shortage_rows += 1;
      current.shortage_qty += parseNumber(row.shortage_qty) || 0;
    }
    if (row.product_name) {
      current.risk_products.push(row.product_name);
    }
    current.delivery_date = current.delivery_date || row.delivery_date;
    current.days_from_today = current.days_from_today ?? row.days_from_today;
    merged.set(key, current);
  }
  return [...merged.values()].map((row) => enrichOrderCenterAction(row));
}

function orderCenterSummary(rows, filteredRows) {
  return {
    total_rows: rows.length,
    visible_rows: filteredRows.length,
    red_orders: rows.filter((row) => row.status_code === "red").length,
    yellow_orders: rows.filter((row) => row.status_code === "yellow").length,
    green_orders: rows.filter((row) => row.status_code === "green").length,
    shortage_orders: rows.filter((row) => row.shortage_status === "缺料").length,
    overdue_orders: rows.filter((row) => row.due_status === "逾期").length,
    due_soon_orders: rows.filter((row) => row.due_status === "7天内到期").length,
    blocked_orders: rows.filter((row) => row.blocker && row.blocker !== "无").length
  };
}

function emptyOrderCenterBody({ pageIndex, pageSize, contractLimit, dueSoonDays, scanSize, searchKey, statusFilter, message }) {
  return {
    model: "order_center",
    offline: true,
    scan: {
      pageindex: pageIndex,
      pagesize: pageSize,
      contract_limit: contractLimit,
      due_soon_days: dueSoonDays,
      scan_size: scanSize,
      searchKey,
      status: statusFilter
    },
    page: null,
    summary: {
      total_rows: 0,
      visible_rows: 0,
      red_orders: 0,
      yellow_orders: 0,
      green_orders: 0,
      shortage_orders: 0,
      overdue_orders: 0,
      due_soon_orders: 0
    },
    rows: [],
    source_status: {
      erp_realtime: { ok: false, message }
    },
    notes: [
      `ERP 数据源暂不可用：${message}`,
      "当前无法读取实时订单列表；请稍后刷新订单中心。"
    ]
  };
}

function indexOrderRisks(rows) {
  const index = new Map();
  for (const row of rows) {
    const current = index.get(row.order_no) || {
      overdue: 0,
      dueSoon: 0,
      earliestDays: null,
      nearestDeliveryDate: null,
      products: []
    };
    if (row.risk_type === "overdue") {
      current.overdue += 1;
    }
    if (row.risk_type === "due_soon") {
      current.dueSoon += 1;
    }
    if (current.earliestDays === null || row.days_from_today < current.earliestDays) {
      current.earliestDays = row.days_from_today;
      current.nearestDeliveryDate = row.delivery_date;
    }
    if (row.product_name) {
      current.products.push(row.product_name);
    }
    index.set(row.order_no, current);
  }
  return index;
}

function indexOrderShortages(rows) {
  const index = new Map();
  for (const row of rows) {
    const current = index.get(row.order_no) || {
      rows: 0,
      shortageQty: 0,
      products: []
    };
    current.rows += 1;
    current.shortageQty += Number(row.shortage_qty || 0);
    if (row.product_name) {
      current.products.push(row.product_name);
    }
    index.set(row.order_no, current);
  }
  return index;
}

function mapOrderCenterRow(order, riskIndex, shortageIndex) {
  const risk = riskIndex.get(order.order_no) || {};
  const shortage = shortageIndex.get(order.order_no) || {};
  const dueStatus = risk.overdue > 0 ? "逾期" : risk.dueSoon > 0 ? "7天内到期" : "正常";
  const shortageStatus = shortage.rows > 0 ? "缺料" : "未发现缺料";
  const statusCode = dueStatus === "逾期" || shortageStatus === "缺料" ? "red" : dueStatus === "7天内到期" ? "yellow" : "green";
  const statusText = statusCode === "red" ? "紧急" : statusCode === "yellow" ? "预警" : "正常";
  return enrichOrderCenterAction({
    erp_id: order.erp_id,
    status_light: statusCode === "red" ? "红" : statusCode === "yellow" ? "黄" : "绿",
    status_code: statusCode,
    status_text: statusText,
    order_no: order.order_no,
    po_no: null,
    title: order.title,
    customer: order.customer,
    owner: order.owner,
    amount: order.amount,
    signed_date: order.signed_date,
    delivery_date: risk.nearestDeliveryDate || order.delivery_date || null,
    days_from_today: risk.earliestDays ?? order.days_from_today,
    due_status: dueStatus,
    shortage_status: shortageStatus,
    shortage_rows: shortage.rows || 0,
    shortage_qty: shortage.shortageQty || 0,
    risk_products: uniqueList([...(risk.products || []), ...(shortage.products || [])]).slice(0, 5),
    warehouse_status: order.warehouse_status,
    delivery_status: order.delivery_status,
    payment_status: order.payment_status,
    approval_status: order.approval_status,
    raw: order.raw
  });
}

function enrichOrderCenterAction(row) {
  const dueStatus = row.due_status || "正常";
  const shortageStatus = row.shortage_status || "未发现缺料";
  const statusCode = dueStatus === "逾期" || shortageStatus === "缺料" ? "red" : dueStatus === "7天内到期" ? "yellow" : "green";
  const blocker = shortageStatus === "缺料" ? "缺料" : dueStatus === "逾期" ? "交期逾期" : dueStatus === "7天内到期" ? "临期交付" : "无";
  const nextAction = orderNextAction(blocker);
  return {
    ...row,
    status_light: statusCode === "red" ? "红" : statusCode === "yellow" ? "黄" : "绿",
    status_code: statusCode,
    status_text: statusCode === "red" ? "紧急" : statusCode === "yellow" ? "预警" : "正常",
    priority: statusCode === "red" ? "高" : statusCode === "yellow" ? "中" : "低",
    blocker,
    next_action: nextAction,
    responsible_role: orderResponsibleRole(blocker),
    risk_products: uniqueList(row.risk_products || []).slice(0, 5)
  };
}

function orderNextAction(blocker) {
  if (blocker === "缺料") {
    return "先确认库存/采购到货，再排生产或调整交期";
  }
  if (blocker === "交期逾期") {
    return "确认延期原因并同步销售/客户";
  }
  if (blocker === "临期交付") {
    return "锁定生产、质检和发货资源";
  }
  return "按计划跟进";
}

function orderResponsibleRole(blocker) {
  if (blocker === "缺料") {
    return "PMC/采购";
  }
  if (blocker === "交期逾期") {
    return "PMC/销售";
  }
  if (blocker === "临期交付") {
    return "PMC";
  }
  return "销售/PMC";
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function orderCenterPage(body, url) {
  const current = body.scan || {};
  const queryBase = new URLSearchParams();
  if (current.searchKey) {
    queryBase.set("searchKey", current.searchKey);
  }
  queryBase.set("pageindex", String(current.pageindex || 1));
  queryBase.set("pagesize", String(current.pagesize || 20));
  queryBase.set("contract_limit", String(current.contract_limit || 20));
  queryBase.set("due_soon_days", String(current.due_soon_days || 7));
  queryBase.set("scan_size", String(current.scan_size || 100));

  const statusLinks = [
    ["全部", ""],
    ["红灯", "red"],
    ["黄灯", "yellow"],
    ["绿灯", "green"]
  ];
  const statusNav = statusLinks
    .map(([label, status]) => {
      const next = new URLSearchParams(queryBase);
      if (status) {
        next.set("status", status);
      }
      const active = (current.status || "") === status ? " active" : "";
      return `<a class="filter${active}" href="/orders?${escapeHtml(next.toString())}">${escapeHtml(label)}</a>`;
    })
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>订单管理中心 - 蕴杰金属数字 PMC 控制台</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f6f8;
      --panel: #ffffff;
      --text: #172033;
      --muted: #667085;
      --border: #d9dee7;
      --green: #16803c;
      --green-soft: #e8f5eb;
      --amber: #a15c00;
      --amber-soft: #fff3d8;
      --red: #b42318;
      --red-soft: #fee4e2;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    main { width: min(1440px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 36px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 18px; border-bottom: 1px solid var(--border); }
    h1 { margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: 0; }
    .sub { margin-top: 8px; color: var(--muted); font-size: 14px; }
    .actions, .filters { display: flex; gap: 8px; flex-wrap: wrap; }
    .actions { justify-content: flex-end; }
    .button, .filter { min-height: 36px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); text-decoration: none; font-size: 14px; }
    .button.primary, .filter.active { background: #176b58; border-color: #176b58; color: #ffffff; }
    .toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: flex-end; margin: 18px 0; }
    form { display: flex; gap: 8px; flex-wrap: wrap; }
    input { min-height: 36px; width: 280px; max-width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 14px; }
    .metric { padding: 13px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
    .metric span { display: block; color: var(--muted); font-size: 13px; }
    .metric strong { display: block; margin-top: 8px; font-size: 24px; line-height: 1; }
    .table-wrap { overflow: auto; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
    table { width: 100%; min-width: 1180px; border-collapse: collapse; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; font-size: 13px; line-height: 1.45; }
    th { position: sticky; top: 0; z-index: 1; background: #f0f3f6; color: #344054; font-weight: 650; white-space: nowrap; }
    .light { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-weight: 650; }
    .dot { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
    .dot.red { background: var(--red); }
    .dot.yellow { background: #f4a000; }
    .dot.green { background: var(--green); }
    .pill { display: inline-block; margin: 0 4px 4px 0; padding: 3px 7px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
    .pill.red { background: var(--red-soft); color: var(--red); }
    .pill.yellow { background: var(--amber-soft); color: var(--amber); }
    .pill.green { background: var(--green-soft); color: var(--green); }
    .order-link { color: #176b58; font-weight: 650; text-decoration: none; }
    .order-link:hover { text-decoration: underline; }
    .notes { margin-top: 12px; color: var(--muted); font-size: 13px; line-height: 1.7; }
    @media (max-width: 880px) {
      header, .toolbar { display: block; }
      .actions, .filters { margin-top: 12px; justify-content: flex-start; }
      h1 { font-size: 24px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>订单管理中心</h1>
        <div class="sub">按销售订单产品库存口径聚合缺料，按合同明细交期识别逾期和临期。</div>
      </div>
      <div class="actions">
        <a class="button" href="/pmc">PMC 驾驶舱</a>
        <a class="button" href="/">首页</a>
        <a class="button" href="/sync?sources=sales_orders&pagesize=20">谨慎同步订单20条</a>
        <a class="button" href="/orders?refresh=1">刷新实时订单</a>
        <a class="button primary" href="${escapeHtml(orderCenterJsonHref(url))}">查看 JSON</a>
      </div>
    </header>
    <section class="toolbar">
      <form action="/orders" method="GET">
        <input name="searchKey" value="${escapeHtml(current.searchKey || "")}" placeholder="搜索订单号、客户、标题">
        <input type="hidden" name="pagesize" value="${escapeHtml(current.pagesize || 20)}">
        <input type="hidden" name="contract_limit" value="${escapeHtml(current.contract_limit || 20)}">
        <input type="hidden" name="due_soon_days" value="${escapeHtml(current.due_soon_days || 7)}">
        <input type="hidden" name="scan_size" value="${escapeHtml(current.scan_size || 100)}">
        <button class="button primary" type="submit">查询</button>
      </form>
      <div class="filters">${statusNav}</div>
    </section>
    <section class="metrics">
      ${orderMetric("当前行数", body.summary.visible_rows)}
      ${orderMetric("红灯订单", body.summary.red_orders)}
      ${orderMetric("黄灯订单", body.summary.yellow_orders)}
      ${orderMetric("绿灯订单", body.summary.green_orders)}
      ${orderMetric("缺料订单", body.summary.shortage_orders)}
      ${orderMetric("阻塞订单", body.summary.blocked_orders)}
      ${orderMetric("临期订单", body.summary.due_soon_orders)}
    </section>
    <section class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>状态灯</th><th>优先级</th><th>订单号</th><th>客户</th><th>负责人</th><th>最近交期</th><th>距今天数</th><th>阻塞点</th><th>下一步动作</th><th>责任角色</th><th>交期状态</th><th>缺料状态</th><th>相关产品</th><th>金额</th><th>审批</th>
          </tr>
        </thead>
        <tbody>
          ${body.rows.map(orderCenterRowHtml).join("")}
        </tbody>
      </table>
    </section>
    <section class="notes">${(body.notes || []).map((note) => `<div>${escapeHtml(note)}</div>`).join("")}</section>
  </main>
</body>
</html>`;
}

function orderMetric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function orderCenterJsonHref(url) {
  const params = new URLSearchParams(url.searchParams);
  params.set("format", "json");
  return `/api/order_center?${params}`;
}

function orderCenterRowHtml(row) {
  const tone = row.status_code === "red" ? "red" : row.status_code === "yellow" ? "yellow" : "green";
  const orderLink = row.erp_id
    ? `<a class="order-link" href="/order?ord=${encodeURIComponent(row.erp_id)}">${escapeHtml(row.order_no)}</a>`
    : escapeHtml(row.order_no);
  return `<tr>
    <td><span class="light"><span class="dot ${tone}"></span>${escapeHtml(row.status_text)}</span></td>
    <td><span class="pill ${tone}">${escapeHtml(row.priority || "")}</span></td>
    <td>${orderLink}</td>
    <td>${escapeHtml(row.customer)}</td>
    <td>${escapeHtml(row.owner)}</td>
    <td>${escapeHtml(row.delivery_date || "")}</td>
    <td>${escapeHtml(row.days_from_today ?? "")}</td>
    <td>${escapeHtml(row.blocker || "")}</td>
    <td>${escapeHtml(row.next_action || "")}</td>
    <td>${escapeHtml(row.responsible_role || "")}</td>
    <td><span class="pill ${row.due_status === "逾期" ? "red" : row.due_status === "7天内到期" ? "yellow" : "green"}">${escapeHtml(row.due_status)}</span></td>
    <td><span class="pill ${row.shortage_status === "缺料" ? "red" : "green"}">${escapeHtml(row.shortage_status)}</span></td>
    <td>${(row.risk_products || []).map((item) => `<span class="pill ${tone}">${escapeHtml(item)}</span>`).join("")}</td>
    <td>${escapeHtml(row.amount ?? "")}</td>
    <td>${escapeHtml(row.approval_status ?? "")}</td>
  </tr>`;
}

async function queryOrderDetail(params = {}) {
  const ord = params.ord || params.contract_ord;
  if (!ord) {
    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "order_detail",
        contract: null,
        rows: [],
        sections: { delivery_risks: [], shortage_rows: [] },
        summary: { lines: 0, delivery_risks: 0, shortage_rows: 0 },
        notes: ["请传入合同 ord，例如 /order?ord=17328。"]
      }
    };
  }

  const dueSoonDays = clampInt(params.due_soon_days || 7, 0, 365);
  const scanSize = clampInt(params.scan_size || 100, 1, 500);
  const today = startOfDay(params.today ? new Date(params.today) : new Date());
  const dueSoonCutoff = addDays(today, dueSoonDays);

  const [contractLines, shortages, salesResult] = await Promise.all([
    client.queryContractLines({ ord }),
    client.queryContractShortages({ ...params, ord, scan_size: scanSize }),
    client.queryView("sales_orders", {
      ord,
      pageindex: "1",
      pagesize: "1"
    })
  ]);

  const salesRows = toBusinessView("sales_orders", normalizeTable(salesResult)).rows;
  const salesOrder = salesRows.find((row) => String(row.erp_id) === String(ord)) || salesRows[0] || {};
  const contract = {
    ...contractLines.body.contract,
    order_no: contractLines.body.contract?.order_no || salesOrder.order_no || null,
    title: contractLines.body.contract?.title || salesOrder.title || null,
    customer: salesOrder.customer || contractLines.body.contract?.customer || null,
    owner: salesOrder.owner || contractLines.body.contract?.owner || null,
    warehouse_status: salesOrder.warehouse_status || contractLines.body.contract?.detail_status || null,
    payment_status: salesOrder.payment_status || null,
    po_no: extractPoNumber(contractLines.body.contract?.raw) || extractPoNumber(contractLines.body.rows)
  };
  const deliveryRisks = (contractLines.body.rows || [])
    .map((line) => mapOrderDetailDeliveryRisk(contract, line, today, dueSoonCutoff))
    .filter(Boolean);
  const shortageRows = shortages.body.rows || [];

  return {
    header: { status: 0, message: "ok" },
    body: {
      model: "order_detail",
      scan: {
        ord,
        today: formatDate(today),
        due_soon_days: dueSoonDays,
        scan_size: scanSize,
        cks: params.cks || ""
      },
      contract,
      rows: contractLines.body.rows || [],
      sections: {
        delivery_risks: deliveryRisks,
        shortage_rows: shortageRows
      },
      summary: {
        lines: contractLines.body.counts?.lines || 0,
        delivery_risks: deliveryRisks.length,
        overdue_rows: deliveryRisks.filter((row) => row.risk_type === "overdue").length,
        due_soon_rows: deliveryRisks.filter((row) => row.risk_type === "due_soon").length,
        shortage_rows: shortageRows.length,
        shortage_qty: shortageRows.reduce((sum, row) => sum + Number(row.shortage_qty || 0), 0)
      },
      notes: [
        "订单详情页从合同明细读取产品、数量和交期。",
        "缺料分析第一版按销售订单产品库存计算，不展开 BOM。"
      ]
    }
  };
}

function mapOrderDetailDeliveryRisk(contract, line, today, dueSoonCutoff) {
  const deliveryDate = parseDate(line.delivery_date);
  if (!deliveryDate) {
    return null;
  }
  const deliveryDay = startOfDay(deliveryDate);
  const remainingQty = firstNumber(line.remaining_qty, line.demand_qty);
  if (remainingQty !== null && remainingQty <= 0) {
    return null;
  }

  const riskType = deliveryDay < today ? "overdue" : deliveryDay <= dueSoonCutoff ? "due_soon" : null;
  if (!riskType) {
    return null;
  }
  return {
    order_erp_id: contract?.erp_id || null,
    order_no: contract?.order_no || null,
    customer: contract?.customer || null,
    owner: contract?.owner || null,
    risk_type: riskType,
    days_from_today: daysBetween(today, deliveryDay),
    line_id: line.line_id,
    product_name: line.product_name,
    product_code: line.product_code,
    product_model: line.product_model,
    unit: line.unit,
    demand_qty: line.demand_qty,
    delivered_qty: line.delivered_qty,
    remaining_qty: remainingQty,
    delivery_date: line.delivery_date
  };
}

function orderDetailPage(body, url) {
  const contract = body.contract || {};
  const title = contract.order_no || `合同 ${body.scan?.ord || ""}`;
  const jsonParams = new URLSearchParams(url.searchParams);
  jsonParams.set("format", "json");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - 订单详情</title>
  <style>
    :root { color-scheme: light; --bg: #f4f6f8; --panel: #ffffff; --text: #172033; --muted: #667085; --border: #d9dee7; --green: #176b58; --green-soft: #e8f3ef; --amber: #a15c00; --amber-soft: #fff3d8; --red: #b42318; --red-soft: #fee4e2; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    main { width: min(1440px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 36px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 18px; border-bottom: 1px solid var(--border); }
    h1 { margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: 0; }
    h2 { margin: 0; padding: 14px 16px; border-bottom: 1px solid var(--border); font-size: 17px; letter-spacing: 0; }
    .sub { margin-top: 8px; color: var(--muted); font-size: 14px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .button { min-height: 36px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); text-decoration: none; font-size: 14px; }
    .button.primary { background: var(--green); border-color: var(--green); color: #ffffff; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin: 18px 0; }
    .metric, .info { padding: 13px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
    .metric span, .info span { display: block; color: var(--muted); font-size: 13px; }
    .metric strong, .info strong { display: block; margin-top: 8px; font-size: 23px; line-height: 1.15; overflow-wrap: anywhere; }
    .info strong { font-size: 15px; font-weight: 650; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
    .panel { margin-top: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); overflow: hidden; }
    .table-wrap { overflow: auto; }
    table { width: 100%; min-width: 980px; border-collapse: collapse; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; font-size: 13px; line-height: 1.45; }
    th { background: #f0f3f6; color: #344054; font-weight: 650; white-space: nowrap; }
    tr:last-child td { border-bottom: 0; }
    .pill { display: inline-block; padding: 3px 7px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
    .pill.red { background: var(--red-soft); color: var(--red); }
    .pill.yellow { background: var(--amber-soft); color: var(--amber); }
    .pill.green { background: var(--green-soft); color: var(--green); }
    .empty { padding: 20px 16px; color: var(--muted); font-size: 14px; }
    .notes { margin-top: 12px; color: var(--muted); font-size: 13px; line-height: 1.7; }
    @media (max-width: 900px) { header { display: block; } .actions { justify-content: flex-start; margin-top: 14px; } .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } h1 { font-size: 24px; } }
    @media (max-width: 560px) { main { width: min(100% - 24px, 1440px); } .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>${escapeHtml(title)}</h1>
        <div class="sub">订单穿透详情 · 合同 ord ${escapeHtml(body.scan?.ord || "")}</div>
      </div>
      <div class="actions">
        <a class="button" href="/orders">订单中心</a>
        <a class="button" href="/pmc">PMC 驾驶舱</a>
        <a class="button primary" href="/api/order_detail?${escapeHtml(jsonParams.toString())}">查看 JSON</a>
      </div>
    </header>
    <section class="summary">
      ${orderMetric("产品明细", body.summary.lines)}
      ${orderMetric("交期风险", body.summary.delivery_risks)}
      ${orderMetric("缺料明细", body.summary.shortage_rows)}
      ${orderMetric("缺口合计", formatNumber(body.summary.shortage_qty))}
    </section>
    <section class="grid">
      ${orderInfo("客户", contract.customer)}
      ${orderInfo("负责人", contract.owner)}
      ${orderInfo("PO编号", contract.po_no || "未识别")}
      ${orderInfo("签订日期", contract.signed_date)}
      ${orderInfo("合同金额", formatNumber(contract.amount))}
      ${orderInfo("收款金额", formatNumber(contract.received_amount))}
      ${orderInfo("审批状态", contract.approval_status)}
      ${orderInfo("发货状态", contract.delivery_status)}
    </section>
    ${detailTablePanel("产品明细", body.rows, ["product_name", "product_code", "product_model", "unit", "demand_qty", "delivered_qty", "remaining_qty", "delivery_date"])}
    ${detailTablePanel("交期风险", body.sections.delivery_risks, ["risk_type", "days_from_today", "product_name", "product_code", "remaining_qty", "delivery_date"], true)}
    ${detailTablePanel("缺料分析", body.sections.shortage_rows, ["product_name", "product_code", "product_model", "demand_qty", "available_qty", "stock_qty", "shortage_qty", "matched_by"], true)}
    <section class="notes">${body.notes.map((note) => `<div>${escapeHtml(note)}</div>`).join("")}</section>
  </main>
</body>
</html>`;
}

function orderInfo(label, value) {
  return `<div class="info"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "")}</strong></div>`;
}

function detailTablePanel(title, rows, columns, compact = false) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return `<section class="panel">
    <h2>${escapeHtml(title)} <span class="pill ${safeRows.length ? "yellow" : "green"}">${safeRows.length}</span></h2>
    ${
      safeRows.length
        ? `<div class="table-wrap"><table${compact ? ' style="min-width:820px"' : ""}><thead><tr>${columns.map((column) => `<th>${escapeHtml(labelFor(column))}</th>`).join("")}</tr></thead><tbody>${safeRows.map((row) => `<tr>${columns.map((column) => `<td>${formatDetailCell(column, row?.[column])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
        : `<div class="empty">当前没有${escapeHtml(title)}。</div>`
    }
  </section>`;
}

function formatDetailCell(column, value) {
  if (/^entry_\d+$/.test(column) && value) {
    return `<a href="${escapeHtml(value)}">${escapeHtml(value)}</a>`;
  }
  if (column === "risk_type") {
    const label = value === "overdue" ? "逾期" : value === "due_soon" ? "7天内到期" : value;
    const tone = value === "overdue" ? "red" : value === "due_soon" ? "yellow" : "green";
    return `<span class="pill ${tone}">${escapeHtml(label || "")}</span>`;
  }
  if (["demand_qty", "delivered_qty", "remaining_qty", "available_qty", "stock_qty", "shortage_qty"].includes(column)) {
    return escapeHtml(formatNumber(value));
  }
  return formatCell(value);
}

function extractPoNumber(value) {
  const candidates = [];
  collectPoCandidates(value, candidates, 0);
  const direct = candidates.find((item) => item.keyScore > 0 && item.text);
  if (direct) {
    return direct.text;
  }
  const pattern = candidates.find((item) => /\bPO[\w/-]{3,}\b/i.test(item.text));
  return pattern ? pattern.text.match(/\bPO[\w/-]{3,}\b/i)?.[0] || pattern.text : null;
}

function collectPoCandidates(value, candidates, depth) {
  if (!value || depth > 3) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPoCandidates(item, candidates, depth + 1);
    }
    return;
  }
  if (typeof value !== "object") {
    const text = String(value).trim();
    if (text) {
      candidates.push({ text, keyScore: 0 });
    }
    return;
  }
  for (const [key, raw] of Object.entries(value)) {
    const text = raw === undefined || raw === null ? "" : String(raw).trim();
    const keyScore = /(^|_)(po|pono|po_no|purchaseorder|purchase_order)($|_)/i.test(key) || /客户.*单|采购.*单|外贸.*单|PO/i.test(key) ? 1 : 0;
    if (text && keyScore) {
      candidates.push({ text, keyScore });
    }
    if (raw && typeof raw === "object") {
      collectPoCandidates(raw, candidates, depth + 1);
    }
  }
}

async function queryMaterialControl(params = {}) {
  const timeoutMs = clampInt(params.timeout_ms || 6000, 1000, 20000);
  const snapshot = latestPmcSnapshot();
  let cached = false;
  let shortageResult;
  let inventoryResult;
  if (params.refresh !== "1") {
    const localAlerts = listMaterialAlerts({ limit: clampInt(params.pagesize || 100, 1, 500) });
    if (localAlerts.length) {
      const shortageRows = localAlerts.filter((row) => row.alert_type === "shortage");
      const lowStockRows = localAlerts.filter((row) => row.alert_type === "low_stock");
      const materialTasks = buildMaterialTasks({ shortageRows, lowStockRows, frozenStockRows: [], oldStockRows: [] });
      return {
        header: { status: 0, message: "ok" },
        body: {
          model: "material_control",
          generated_at: new Date().toISOString(),
          cached: true,
          summary: {
            material_tasks: materialTasks.length,
            urgent_material_tasks: materialTasks.filter((row) => row.priority === "高").length,
            shortage_orders: uniqueCount(shortageRows, "order_no"),
            shortage_rows: shortageRows.length,
            low_stock: lowStockRows.length,
            frozen_stock: 0,
            old_stock: 0,
            source_errors: 0
          },
          sections: {
            material_tasks: materialTasks,
            shortage_rows: shortageRows,
            low_stock: lowStockRows,
            frozen_stock: [],
            old_stock: []
          },
          source_status: {
            sqlite_material_alerts: { ok: true, rows: localAlerts.length }
          },
          notes: [
            "当前读取本地 SQLite 物料告警表。",
            "点击“谨慎同步物料20条”可从 ERP 小批量更新缺料和低库存。"
          ]
        }
      };
    }
  }

  if (snapshot && params.refresh !== "1") {
    cached = true;
    shortageResult = { status: "rejected", reason: new Error("使用本地快照") };
    inventoryResult = { status: "rejected", reason: new Error("使用本地快照") };
  } else if (ERP_PROTECTION_MODE && params.refresh !== "1" && !params.searchKey) {
    return {
      header: { status: 0, message: "ok" },
      body: emptyMaterialControlBody("ERP保护模式已开启，物料中心未找到本地 SQLite/快照数据时不再自动请求 ERP。")
    };
  } else {
    [shortageResult, inventoryResult] = await Promise.allSettled([
      withTimeout(queryOrderShortages(client, {
        pageindex: params.pageindex || 1,
        pagesize: params.pagesize || 10,
        contract_limit: params.contract_limit || 5,
        scan_size: params.scan_size || 100,
        cks: params.cks || ""
      }), timeoutMs),
      withTimeout(client.queryInventoryAlerts({
        scan_pages: params.scan_pages || 1,
        scan_size: params.inventory_scan_size || params.scan_size || 20,
        alert_limit: params.alert_limit || 20,
        low_stock_threshold: params.low_stock_threshold || 5,
        old_stock_days: params.old_stock_days || 180,
        cks: params.cks || ""
      }), timeoutMs)
    ]);
  }
  let shortageRows = shortageResult.status === "fulfilled" ? shortageResult.value?.body?.rows || [] : [];
  let lowStockRows = inventoryResult.status === "fulfilled" ? inventoryResult.value?.body?.sections?.low_stock || [] : [];
  let frozenStockRows = inventoryResult.status === "fulfilled" ? inventoryResult.value?.body?.sections?.frozen_stock || [] : [];
  let oldStockRows = inventoryResult.status === "fulfilled" ? inventoryResult.value?.body?.sections?.old_stock || [] : [];
  if ((cached || shortageResult.status === "rejected" || inventoryResult.status === "rejected") && snapshot) {
    cached = true;
    shortageRows = shortageRows.length ? shortageRows : snapshot.payload?.sections?.shortage_orders || [];
    lowStockRows = lowStockRows.length ? lowStockRows : snapshot.payload?.sections?.low_stock || [];
  }
  const materialTasks = buildMaterialTasks({ shortageRows, lowStockRows, frozenStockRows, oldStockRows });
  const sourceStatus = {
    order_shortages: {
      ok: shortageResult.status === "fulfilled" || cached,
      message: shortageResult.status === "rejected" && !cached ? summarizeDataSourceError(shortageResult.reason) : null
    },
    inventory_alerts: {
      ok: inventoryResult.status === "fulfilled" || cached,
      message: inventoryResult.status === "rejected" && !cached ? summarizeDataSourceError(inventoryResult.reason) : null
    }
  };
  const sourceNotes = Object.entries(sourceStatus)
    .filter(([, status]) => !status.ok)
    .map(([name, status]) => `${name} 数据源暂不可用：${status.message}`);
  return {
    header: { status: 0, message: "ok" },
    body: {
      model: "material_control",
      generated_at: new Date().toISOString(),
      cached,
      summary: {
        material_tasks: materialTasks.length,
        urgent_material_tasks: materialTasks.filter((row) => row.priority === "高").length,
        shortage_orders: uniqueCount(shortageRows, "order_no"),
        shortage_rows: shortageRows.length,
        low_stock: lowStockRows.length,
        frozen_stock: frozenStockRows.length,
        old_stock: oldStockRows.length,
        source_errors: sourceNotes.length
      },
      sections: {
        material_tasks: materialTasks,
        shortage_rows: shortageRows,
        low_stock: lowStockRows,
        frozen_stock: frozenStockRows,
        old_stock: oldStockRows
      },
      source_status: sourceStatus,
      notes: [
        ...sourceNotes,
        ...(cached && snapshot ? [`当前读取本地驾驶舱快照：${formatDateTime(snapshot.created_at)}。`] : []),
        "物料控制中心聚焦缺料订单、低库存、冻结库存和长库龄，并生成统一处理清单。",
        "齐套口径沿用销售订单产品库存，后续可接 BOM 展开和采购在途。"
      ]
    }
  };
}

function emptyMaterialControlBody(message) {
  return {
    model: "material_control",
    generated_at: new Date().toISOString(),
    cached: true,
    summary: {
      material_tasks: 0,
      urgent_material_tasks: 0,
      shortage_orders: 0,
      shortage_rows: 0,
      low_stock: 0,
      frozen_stock: 0,
      old_stock: 0,
      source_errors: 0
    },
    sections: {
      material_tasks: [],
      shortage_rows: [],
      low_stock: [],
      frozen_stock: [],
      old_stock: []
    },
    source_status: {
      erp_protection_mode: { ok: true, message }
    },
    notes: [
      message,
      "请在 ERP 稳定时点击“谨慎同步物料20条”更新本地物料告警。"
    ]
  };
}

function buildMaterialTasks({ shortageRows, lowStockRows, frozenStockRows, oldStockRows }) {
  const rows = [
    ...shortageRows.map((row) => ({
      material_task_type: "订单缺料",
      priority: "高",
      related_no: row.order_no,
      customer: row.customer,
      product_code: row.product_code,
      product_name: row.product_name,
      warehouse: row.warehouse,
      demand_qty: row.demand_qty,
      available_qty: row.available_qty,
      shortage_qty: row.shortage_qty,
      responsible_role: "PMC/采购",
      action: "确认替代库存、采购到货或调整排产"
    })),
    ...lowStockRows.map((row) => ({
      material_task_type: "低库存",
      priority: parseNumber(row.available_qty) <= 0 ? "高" : "中",
      related_no: row.product_code,
      customer: "",
      product_code: row.product_code,
      product_name: row.product_name,
      warehouse: row.warehouse,
      demand_qty: "",
      available_qty: row.available_qty,
      shortage_qty: "",
      responsible_role: "PMC/仓库",
      action: "确认安全库存和补料需求"
    })),
    ...frozenStockRows.map((row) => ({
      material_task_type: "冻结库存",
      priority: "中",
      related_no: row.product_code,
      customer: "",
      product_code: row.product_code,
      product_name: row.product_name,
      warehouse: row.warehouse,
      demand_qty: "",
      available_qty: row.available_qty,
      shortage_qty: "",
      responsible_role: "仓库/财务",
      action: "确认冻结原因并判断是否可释放"
    })),
    ...oldStockRows.map((row) => ({
      material_task_type: "长库龄",
      priority: "低",
      related_no: row.product_code,
      customer: "",
      product_code: row.product_code,
      product_name: row.product_name,
      warehouse: row.warehouse,
      demand_qty: "",
      available_qty: row.available_qty,
      shortage_qty: "",
      responsible_role: "PMC/仓库",
      action: "评估消耗计划或呆滞处理"
    }))
  ];
  return rows
    .sort((a, b) => materialPriorityWeight(b.priority) - materialPriorityWeight(a.priority) || (parseNumber(b.shortage_qty) || 0) - (parseNumber(a.shortage_qty) || 0))
    .slice(0, 80)
    .map((row, index) => ({ material_task_no: `WL-${String(index + 1).padStart(3, "0")}`, ...row }));
}

function materialPriorityWeight(priority) {
  if (priority === "高") {
    return 3;
  }
  if (priority === "中") {
    return 2;
  }
  return 1;
}

function summarizeDataSourceError(error) {
  const message = error?.message || String(error || "未知错误");
  if (/Service Unavailable|HTTP Error 503|503/.test(message)) {
    return "ERP 服务临时不可用，请稍后刷新。";
  }
  if (/non-JSON response/i.test(message)) {
    return "ERP 返回了非标准数据，请稍后刷新或检查接口状态。";
  }
  return message.length > 120 ? `${message.slice(0, 120)}...` : message;
}

async function queryProcurementCenter(params = {}) {
  if (ERP_PROTECTION_MODE && params.refresh !== "1" && !params.searchKey) {
    return {
      header: { status: 0, message: "ok" },
      body: emptyProcurementCenterBody("ERP保护模式已开启，采购跟催中心暂不自动访问 ERP；请确认 ERP 稳定后再使用实时刷新或接口按钮。")
    };
  }
  const pageindex = params.pageindex || 1;
  const pagesize = params.pagesize || 20;
  const timeoutMs = clampInt(params.timeout_ms || 5000, 1000, 15000);
  const today = startOfDay(parseDate(params.today) || new Date());
  const [stockInResult, payablesResult] = await Promise.allSettled([
    withTimeout(client.queryView("stock_in_records", {
      pageindex,
      pagesize,
      rkzt: params.rkzt || "",
      searchKey: params.searchKey || ""
    }), timeoutMs),
    withTimeout(client.queryView("payables", {
      pageindex,
      pagesize,
      searchKey: params.searchKey || ""
    }), timeoutMs)
  ]);
  const sourceStatus = {
    stock_in_records: {
      ok: stockInResult.status === "fulfilled",
      message: stockInResult.status === "rejected" ? summarizeDataSourceError(stockInResult.reason) : null
    },
    payables: {
      ok: payablesResult.status === "fulfilled",
      message: payablesResult.status === "rejected" ? summarizeDataSourceError(payablesResult.reason) : null
    }
  };
  const sourceNotes = Object.entries(sourceStatus)
    .filter(([, status]) => !status.ok)
    .map(([name, status]) => `${name} 数据源暂不可用：${status.message}`);
  const stockInTable = stockInResult.status === "fulfilled" ? normalizeTable(stockInResult.value) : { rows: [], page: null };
  const stockInRows = stockInResult.status === "fulfilled" ? toBusinessView("stock_in_records", stockInTable).rows : [];
  const payableTable = payablesResult.status === "fulfilled" ? normalizeTable(payablesResult.value) : { rows: [], page: null };
  const payableRows = payableTable.rows.map((row) => mapFinanceRow(row, "payable", today));
  const followupRows = buildProcurementFollowups(stockInRows, payableRows, today);
  const supplierRows = topProcurementSuppliers(followupRows);

  return {
    header: { status: 0, message: "ok" },
    body: {
      model: "procurement_center",
      generated_at: new Date().toISOString(),
      offline: sourceNotes.length > 0,
      summary: {
        followup_tasks: followupRows.length,
        urgent_followups: followupRows.filter((row) => row.priority === "高").length,
        inbound_records: stockInRows.length,
        payable_records: payableRows.length,
        supplier_count: supplierRows.length,
        source_errors: sourceNotes.length
      },
      sections: {
        stock_in_records: stockInRows,
        payables: payableRows,
        followups: followupRows,
        suppliers: supplierRows
      },
      source_status: sourceStatus,
      notes: [
        ...sourceNotes,
        "采购跟催中心先使用入库流水和应付付款生成跟催清单。",
        "后续确认智邦采购订单接口和供应商联系人字段后，可补预计到货日、跟催记录和一键邮件。"
      ]
    }
  };
}

function emptyProcurementCenterBody(message) {
  return {
    model: "procurement_center",
    generated_at: new Date().toISOString(),
    cached: true,
    offline: true,
    summary: {
      followup_tasks: 0,
      urgent_followups: 0,
      inbound_records: 0,
      payable_records: 0,
      supplier_count: 0,
      source_errors: 0
    },
    sections: {
      stock_in_records: [],
      payables: [],
      followups: [],
      suppliers: []
    },
    source_status: {
      erp_protection_mode: { ok: true, message }
    },
    notes: [
      message,
      "后续把采购订单/供应商跟催同步到 SQLite 后，本页会默认读取本地数据。"
    ]
  };
}

function buildProcurementFollowups(stockInRows, payableRows, today) {
  const inboundTasks = stockInRows.map((row) => {
    const confirmedDate = parseDate(row.confirmed_time);
    const applicationDate = parseDate(row.application_time);
    const ageDays = applicationDate ? daysBetween(startOfDay(applicationDate), today) : null;
    const pendingInbound = !confirmedDate && !/完成|已入库|确认|关闭/.test(String(row.receipt_status || ""));
    return {
      followup_type: pendingInbound ? "待入库确认" : "入库记录",
      priority: pendingInbound && ageDays !== null && ageDays >= 3 ? "高" : pendingInbound ? "中" : "低",
      supplier: firstText(row.raw?.gysname, row.raw?.glgys, row.raw?.supplier, row.applicant, row.warehouse_keeper),
      related_no: row.receipt_no,
      item: row.title,
      quantity: row.quantity,
      amount: "",
      status: row.receipt_status,
      due_date: row.confirmed_time || row.application_time,
      age_days: ageDays,
      responsible_role: "采购/仓库",
      action: pendingInbound ? "确认供应商到货与仓库入库状态" : "核对入库与应付是否匹配"
    };
  });
  const payableTasks = payableRows
    .filter((row) => parseNumber(row.unpaid_amount) > 0)
    .map((row) => ({
      followup_type: row.risk_status === "已逾期" ? "逾期应付" : row.risk_status === "7天内到期" ? "近期应付" : "未付应付",
      priority: row.risk_status === "已逾期" ? "高" : row.risk_status === "7天内到期" ? "中" : "低",
      supplier: row.counterparty,
      related_no: row.bill_no,
      item: row.business_title,
      quantity: "",
      amount: row.unpaid_amount,
      status: row.risk_status,
      due_date: row.due_date,
      age_days: row.age_days,
      responsible_role: "采购/财务",
      action: row.risk_status === "已逾期" ? "确认付款安排并反馈供应商" : "跟进付款计划和发票/入库资料"
    }));
  return [...inboundTasks, ...payableTasks]
    .filter((row) => row.followup_type !== "入库记录" || row.priority !== "低")
    .sort((a, b) => procurementPriorityWeight(b.priority) - procurementPriorityWeight(a.priority) || (parseNumber(b.amount) || 0) - (parseNumber(a.amount) || 0))
    .slice(0, 80)
    .map((row, index) => ({ followup_no: `CG-${String(index + 1).padStart(3, "0")}`, ...row }));
}

function topProcurementSuppliers(followupRows) {
  const grouped = new Map();
  for (const row of followupRows) {
    const supplier = row.supplier || "未识别供应商";
    const current = grouped.get(supplier) || {
      supplier,
      followup_tasks: 0,
      urgent_followups: 0,
      unpaid_amount: 0,
      latest_action: ""
    };
    current.followup_tasks += 1;
    if (row.priority === "高") {
      current.urgent_followups += 1;
    }
    current.unpaid_amount += parseNumber(row.amount) || 0;
    if (!current.latest_action && row.action) {
      current.latest_action = row.action;
    }
    grouped.set(supplier, current);
  }
  return [...grouped.values()]
    .map((row) => ({ ...row, unpaid_amount: Number(row.unpaid_amount.toFixed(2)) }))
    .sort((a, b) => b.urgent_followups - a.urgent_followups || b.unpaid_amount - a.unpaid_amount || b.followup_tasks - a.followup_tasks)
    .slice(0, 20);
}

function procurementPriorityWeight(priority) {
  if (priority === "高") {
    return 3;
  }
  if (priority === "中") {
    return 2;
  }
  return 1;
}

async function queryQuoteCenter(params = {}) {
  if (params.refresh !== "1" && !params.searchKey) {
    const quoteRows = listQuoteFollowups({ limit: clampInt(params.limit || params.pagesize || 100, 1, 500) }).map((row) => ({
      ...row,
      raw: parseJson(row.raw_json, row)
    }));
    if (quoteRows.length) {
      const ownerRows = quoteOwnerSummaryForLocal(quoteRows);
      return {
        header: { status: 0, message: "ok" },
        body: {
          model: "quote_center",
          generated_at: new Date().toISOString(),
          cached: true,
          summary: {
            scanned_projects: quoteRows.length,
            pending_quote_projects: quoteRows.length,
            quote_followups: quoteRows.length,
            urgent_quotes: quoteRows.filter((row) => row.priority === "高").length,
            owner_count: ownerRows.length
          },
          rows: quoteRows,
          sections: {
            quote_followups: quoteRows,
            owner_summary: ownerRows
          },
          source_status: {
            sqlite_quote_followups: { ok: true, rows: quoteRows.length }
          },
          notes: [
            "当前读取本地 SQLite 待报价项目。",
            "点击“谨慎同步报价20条”可从 ERP 小批量更新本地待报价数据。"
          ]
        }
      };
    }
    if (ERP_PROTECTION_MODE) {
      return {
        header: { status: 0, message: "ok" },
        body: emptyQuoteCenterBody("ERP保护模式已开启，待报价中心未找到本地 SQLite 数据时不再自动请求 ERP。")
      };
    }
  }

  let pending;
  let sourceError = null;
  const timeoutMs = clampInt(params.timeout_ms || 5000, 1000, 15000);
  const today = startOfDay(parseDate(params.today) || new Date());
  try {
    pending = await withTimeout(queryPendingQuotes(client, {
      pageindex: params.pageindex || 1,
      pagesize: params.pagesize || 20,
      limit: params.limit || 30,
      searchKey: params.searchKey || "",
      include_all: params.include_all || ""
    }), timeoutMs);
  } catch (error) {
    sourceError = summarizeDataSourceError(error);
  }
  const quoteRows = (pending?.body?.rows || []).map((row) => mapQuoteFollowup(row, today));
  const ownerRows = quoteOwnerSummary(quoteRows);
  return {
    header: { status: 0, message: "ok" },
    body: {
      model: "quote_center",
      generated_at: new Date().toISOString(),
      offline: Boolean(sourceError),
      summary: {
        scanned_projects: pending?.body?.summary?.scanned_projects ?? 0,
        pending_quote_projects: pending?.body?.summary?.pending_quote_projects ?? 0,
        quote_followups: quoteRows.length,
        urgent_quotes: quoteRows.filter((row) => row.priority === "高").length,
        owner_count: ownerRows.length
      },
      rows: quoteRows,
      sections: {
        quote_followups: quoteRows,
        owner_summary: ownerRows
      },
      source_status: {
        pending_quotes: { ok: !sourceError, message: sourceError }
      },
      notes: [
        ...(sourceError ? [`ERP 数据源暂不可用：${sourceError}`] : []),
        "待报价中心基于项目/商机阶段、金额状态和创建日期生成报价跟进池。",
        "后续可补充报价截止时间、跟进记录和一键提醒。"
      ]
    }
  };
}

function emptyQuoteCenterBody(message) {
  return {
    model: "quote_center",
    generated_at: new Date().toISOString(),
    cached: true,
    offline: true,
    summary: {
      scanned_projects: 0,
      pending_quote_projects: 0,
      quote_followups: 0,
      urgent_quotes: 0,
      owner_count: 0
    },
    rows: [],
    sections: {
      quote_followups: [],
      owner_summary: []
    },
    source_status: {
      sqlite_quote_followups: { ok: false, rows: 0, message }
    },
    notes: [
      message,
      "请在 ERP 稳定时点击“谨慎同步”更新本地待报价数据。"
    ]
  };
}

function mapQuoteFollowup(row, today) {
  const createdDate = parseDate(row.created_date);
  const ageDays = createdDate ? daysBetween(startOfDay(createdDate), today) : null;
  const estimatedAmount = parseNumber(row.estimated_amount) || 0;
  const quotedAmount = parseNumber(row.quoted_amount) || 0;
  const stageText = [row.follow_stage, row.project_stage, row.approval_status, row.lead_status].filter(Boolean).join(" ");
  const priority = quotePriority(ageDays, estimatedAmount, stageText);
  const quoteStatus = quotedAmount > 0 ? "已报价待确认" : /询价|报价|核价|定价/.test(stageText) ? "待报价" : "待确认需求";
  return {
    quote_no: row.project_no || row.erp_id,
    priority,
    quote_status: quoteStatus,
    customer: row.customer,
    title: row.title,
    owner: row.owner || "未分配",
    project_stage: row.project_stage || row.follow_stage,
    estimated_amount: row.estimated_amount,
    quoted_amount: row.quoted_amount,
    created_date: row.created_date,
    age_days: ageDays,
    action: quoteAction(priority, quoteStatus),
    risk_flags: row.risk_flags,
    raw: row.raw || row
  };
}

function quotePriority(ageDays, amount, stageText) {
  if (ageDays !== null && ageDays >= 7) {
    return "高";
  }
  if (amount >= 100000 || /核价|定价/.test(stageText)) {
    return "高";
  }
  if (ageDays !== null && ageDays >= 3) {
    return "中";
  }
  return "低";
}

function quoteAction(priority, quoteStatus) {
  if (quoteStatus === "已报价待确认") {
    return "跟进客户反馈并推动确认";
  }
  if (priority === "高") {
    return "优先确认规格、成本和报价截止时间";
  }
  return "补齐需求资料并安排报价";
}

function quoteOwnerSummary(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const owner = row.owner || "未分配";
    const current = grouped.get(owner) || {
      owner,
      quote_followups: 0,
      urgent_quotes: 0,
      estimated_amount: 0,
      max_age_days: 0,
      latest_action: ""
    };
    current.quote_followups += 1;
    if (row.priority === "高") {
      current.urgent_quotes += 1;
    }
    current.estimated_amount += parseNumber(row.estimated_amount) || 0;
    current.max_age_days = Math.max(current.max_age_days, parseNumber(row.age_days) || 0);
    if (!current.latest_action && row.action) {
      current.latest_action = row.action;
    }
    grouped.set(owner, current);
  }
  return [...grouped.values()]
    .map((row) => ({ ...row, estimated_amount: Number(row.estimated_amount.toFixed(2)) }))
    .sort((a, b) => b.urgent_quotes - a.urgent_quotes || b.max_age_days - a.max_age_days || b.estimated_amount - a.estimated_amount)
    .slice(0, 20);
}

async function queryProductionCenter(params = {}) {
  const pageindex = params.pageindex || 1;
  const pagesize = params.pagesize || 20;
  const timeoutMs = clampInt(params.timeout_ms || 5000, 1000, 15000);
  const today = startOfDay(parseDate(params.today) || new Date());
  const [progressResult, materialResult, bomResult, procedureResult] = await Promise.allSettled([
    withTimeout(client.queryView("production_progress", { pageindex, pagesize, searchKey: params.searchKey || "" }), timeoutMs),
    withTimeout(client.queryView("material_orders", { pageindex, pagesize, searchKey: params.searchKey || "" }), timeoutMs),
    withTimeout(client.queryView("production_boms", { page_index: pageindex, page_size: pagesize, searchKey: params.searchKey || "" }), timeoutMs),
    withTimeout(client.queryView("procedure_plans", { page_index: pageindex, page_size: pagesize, searchKey: params.searchKey || "" }), timeoutMs)
  ]);
  const sourceStatus = {
    production_progress: settledStatus(progressResult),
    material_orders: settledStatus(materialResult),
    production_boms: settledStatus(bomResult),
    procedure_plans: settledStatus(procedureResult)
  };
  const sourceNotes = Object.entries(sourceStatus)
    .filter(([, status]) => !status.ok)
    .map(([name, status]) => `${name} 数据源暂不可用：${status.message}`);
  const progress = progressResult.status === "fulfilled" ? normalizeTable(progressResult.value) : { rows: [], page: null };
  const materials = materialResult.status === "fulfilled" ? normalizeTable(materialResult.value) : { rows: [], page: null };
  const boms = bomResult.status === "fulfilled" ? normalizeTable(bomResult.value) : { rows: [], page: null };
  const procedures = procedureResult.status === "fulfilled" ? normalizeTable(procedureResult.value) : { rows: [], page: null };
  const bomRows = boms.rows.map(mapProductionBomForCenter);
  const procedureRows = procedures.rows.map(mapProcedurePlanForCenter);
  const delayedProcedures = procedureRows.filter((row) => row.remaining_qty === null || row.remaining_qty > 0).filter((row) => parseDate(row.planned_finish_date) && daysBetween(today, startOfDay(parseDate(row.planned_finish_date))) < 0);
  const workloadRows = productionWorkloadByCenter(procedureRows, today);
  return {
    header: { status: 0, message: "ok" },
    body: {
      model: "production_center",
      generated_at: new Date().toISOString(),
      offline: sourceNotes.length > 0,
      summary: {
        progress_rows: progress.rows.length,
        material_order_rows: materials.rows.length,
        bom_rows: bomRows.length,
        procedure_plan_rows: procedureRows.length,
        delayed_procedures: delayedProcedures.length,
        work_centers: workloadRows.length,
        source_errors: sourceNotes.length
      },
      sections: {
        progress: progress.rows,
        material_orders: materials.rows,
        boms: bomRows,
        procedure_plans: procedureRows,
        delayed_procedures: delayedProcedures,
        workload_by_center: workloadRows
      },
      source_status: sourceStatus,
      notes: [
        ...sourceNotes,
        "生产进度中心聚合 ERP 生产进度、领料、BOM、工序计划接口，并识别延期工序。",
        "当前公司车间报工继续使用 ERP；本中台不新增报工入口。"
      ]
    }
  };
}

async function queryLocalProductionCenter(params = {}) {
  const pageSize = clampInt(params.pagesize || 100, 1, 500);
  const today = startOfDay(parseDate(params.today) || new Date());
  const procedureRows = listProcedurePlans({ limit: pageSize });
  const delayedProcedures = procedureRows
    .filter((row) => row.remaining_qty === null || row.remaining_qty > 0)
    .filter((row) => parseDate(row.planned_finish_date) && daysBetween(today, startOfDay(parseDate(row.planned_finish_date))) < 0);
  const workloadRows = productionWorkloadByCenter(procedureRows, today);
  return {
    header: { status: 0, message: "ok" },
    body: {
      model: "production_center",
      generated_at: new Date().toISOString(),
      cached: true,
      offline: false,
      summary: {
        progress_rows: 0,
        material_order_rows: 0,
        bom_rows: 0,
        procedure_plan_rows: procedureRows.length,
        delayed_procedures: delayedProcedures.length,
        work_centers: workloadRows.length,
        source_errors: 0
      },
      sections: {
        progress: [],
        material_orders: [],
        boms: [],
        procedure_plans: procedureRows,
        delayed_procedures: delayedProcedures,
        workload_by_center: workloadRows
      },
      source_status: {
        sqlite_procedure_plans: { ok: true, message: null }
      },
      notes: [
        "当前读取本地 SQLite 派工/工序计划表。",
        "点击“谨慎同步工序20条”可从 ERP 小批量更新工序计划。"
      ]
    }
  };
}

function settledStatus(result) {
  return {
    ok: result.status === "fulfilled",
    message: result.status === "rejected" ? summarizeDataSourceError(result.reason) : null
  };
}

function mapProcedurePlanForCenter(row) {
  return {
    work_assignment_id: firstText(row.workAssignmentId, row.work_assignment_id, row["派工单ID"], row["派工单号"]),
    order_no: firstText(row.orderNo, row.OrderNo, row["订单编号"], row["生产单号"], row["派工单号"]),
    product_name: firstText(row.productName, row.product_name, row["产品名称"], row.title),
    product_code: firstText(row.productCode, row.product_code, row["产品编号"], row.order1),
    procedure_name: firstText(row.procedureName, row.procedure_name, row["工序名称"]),
    work_center_name: firstText(row.workCenterName, row.work_center_name, row["工作中心名称"]),
    planned_qty: firstNumber(row.planNum, row.planned_qty, row["加工数量"], row.num),
    finished_qty: firstNumber(row.finishNum, row.qualified_qty, row["合格数量"], row["完工数量"]),
    remaining_qty: firstNumber(row.remainingNum, row.remaining_qty, row["剩余数量"]),
    planned_start_date: firstText(row.planStartDate, row.planned_start_date, row["计划开工期"]),
    planned_finish_date: firstText(row.planEndDate, row.planned_finish_date, row["计划完工期"]),
    owner: firstText(row.owner, row.person, row["工序计划负责人"], row["负责人"]),
    state: firstText(row.state, row.status, row["状态"]),
    raw: row
  };
}

function mapProductionBomForCenter(row) {
  return {
    bom_id: firstText(row.bomId, row.id, row["物料清单ID"]),
    bom_title: firstText(row.title, row.bomTitle, row["清单主题"]),
    bom_no: firstText(row.order1, row.bomNo, row["清单编号"]),
    parent_product: firstText(row.cpname, row.productName, row["父件产品"]),
    effective_status: firstText(row.status, row["生效状态"]),
    enabled_status: firstText(row.enabled, row["启用状态"]),
    bom_type: firstText(row.type, row["主辅清单"]),
    customer_scope: firstText(row.customer, row["适用客户"]),
    owner: firstText(row.owner, row["添加人员"]),
    created_date: firstText(row.createdDate, row["添加日期"]),
    raw: row
  };
}

function productionWorkloadByCenter(rows, today) {
  const grouped = new Map();
  for (const row of rows) {
    const center = row.work_center_name || "未识别工作中心";
    const current = grouped.get(center) || {
      work_center_name: center,
      procedure_count: 0,
      planned_qty: 0,
      finished_qty: 0,
      remaining_qty: 0,
      delayed_procedures: 0
    };
    current.procedure_count += 1;
    current.planned_qty += parseNumber(row.planned_qty) || 0;
    current.finished_qty += parseNumber(row.finished_qty) || 0;
    current.remaining_qty += parseNumber(row.remaining_qty) || 0;
    if (parseDate(row.planned_finish_date) && (parseNumber(row.remaining_qty) || 0) > 0 && startOfDay(parseDate(row.planned_finish_date)) < today) {
      current.delayed_procedures += 1;
    }
    grouped.set(center, current);
  }
  return [...grouped.values()]
    .map((row) => ({
      ...row,
      planned_qty: Number(row.planned_qty.toFixed(4)),
      finished_qty: Number(row.finished_qty.toFixed(4)),
      remaining_qty: Number(row.remaining_qty.toFixed(4))
    }))
    .sort((a, b) => b.delayed_procedures - a.delayed_procedures || b.remaining_qty - a.remaining_qty)
    .slice(0, 20);
}

async function queryExceptionCenter(params = {}) {
  if (params.refresh !== "1") {
    const dashboard = queryLocalPmcDashboard(params);
    if (dashboard) {
      return {
        header: { status: 0, message: "ok" },
        body: buildLocalExceptionCenter(dashboard)
      };
    }
  }

  let dashboard;
  let sourceError = null;
  let cached = false;
  const snapshot = latestPmcSnapshot();
  const dashboardParams = {
    scan_pages: params.scan_pages || 1,
    scan_size: params.scan_size || 20,
    contract_limit: params.contract_limit || 5,
    alert_limit: params.alert_limit || 20,
    low_stock_threshold: params.low_stock_threshold || 5,
    old_stock_days: params.old_stock_days || 180,
    due_soon_days: params.due_soon_days || 7,
    quote_limit: params.quote_limit || 20
  };
  if (snapshot && params.refresh !== "1") {
    dashboard = { body: snapshot.payload };
    cached = true;
  } else {
    try {
      dashboard = await withTimeout(queryPmcDashboard(dashboardParams), clampInt(params.timeout_ms || 5000, 1000, 15000));
    } catch (error) {
      sourceError = summarizeDataSourceError(error);
      if (snapshot) {
        dashboard = { body: snapshot.payload };
        cached = true;
      }
    }
  }
  const body = dashboard?.body || { summary: {}, sections: {} };
  const tasks = buildExceptionTasks(body.sections || []);
  return {
    header: { status: 0, message: "ok" },
    body: {
      model: "exception_center",
      generated_at: new Date().toISOString(),
      offline: Boolean(sourceError),
      cached,
      summary: {
        open_tasks: tasks.length,
        critical_tasks: tasks.filter((task) => task.priority === "高").length,
        overdue_orders: body.summary.overdue_delivery_rows || 0,
        due_soon_orders: body.summary.due_soon_delivery_rows || 0,
        shortage_orders: body.summary.order_shortage_orders || 0,
        pending_quotes: body.summary.pending_quote_projects || 0,
        low_stock: body.summary.low_stock || 0
      },
      sections: {
        overdue_orders: body.sections.overdue_delivery_rows || [],
        due_soon_orders: body.sections.due_soon_delivery_rows || [],
        shortage_rows: body.sections.order_shortage_rows || [],
        pending_quotes: body.sections.pending_quotes || [],
        low_stock: body.sections.low_stock || [],
        tasks
      },
      source_status: {
        pmc_dashboard: { ok: !sourceError, message: sourceError }
      },
      notes: [
        ...(sourceError ? [`ERP 数据源暂不可用：${sourceError}`] : []),
        ...(cached ? [`当前读取本地驾驶舱快照：${formatDateTime(snapshot.created_at)}。`] : []),
        "异常管理中心把交期、缺料、待报价、低库存聚合成统一待办。",
        "每条待办包含优先级、责任角色、处理建议和当前状态。",
        "责任角色按异常类型自动推导；关闭状态和操作日志后续接本地数据库。"
      ]
    }
  };
}

function buildExceptionTasks(sections) {
  const tasks = [
    ...exceptionTasksFromDelivery(sections.overdue_delivery_rows || [], "交期逾期"),
    ...exceptionTasksFromDelivery(sections.due_soon_delivery_rows || [], "临期交付"),
    ...exceptionTasksFromShortage(sections.order_shortage_rows || []),
    ...exceptionTasksFromQuotes(sections.pending_quotes || []),
    ...exceptionTasksFromLowStock(sections.low_stock || [])
  ];
  return tasks
    .sort((a, b) => exceptionPriorityWeight(b.priority) - exceptionPriorityWeight(a.priority) || String(a.due_date || "").localeCompare(String(b.due_date || "")))
    .slice(0, 80)
    .map((task, index) => ({ task_no: `PMC-${String(index + 1).padStart(3, "0")}`, ...task }));
}

function exceptionTasksFromDelivery(rows, type) {
  return rows.map((row) => {
    const days = parseNumber(row.days_from_today);
    const overdue = days !== null && days < 0;
    return {
      exception_type: type,
      priority: overdue ? "高" : "中",
      related_no: row.order_no,
      customer: row.customer,
      item: row.product_name || row.product_code,
      quantity: row.remaining_qty,
      due_date: row.delivery_date,
      responsible_role: overdue ? "PMC/销售" : "PMC",
      action: overdue ? "确认延期原因并同步客户交期" : "跟进生产与发货准备",
      status: "待处理"
    };
  });
}

function exceptionTasksFromShortage(rows) {
  return rows.map((row) => ({
    exception_type: "订单缺料",
    priority: "高",
    related_no: row.order_no,
    customer: row.customer,
    item: row.product_name || row.product_code,
    quantity: row.shortage_qty,
    due_date: row.delivery_date,
    responsible_role: "PMC/采购",
    action: "确认替代库存、采购到货或调整排产",
    status: "待处理"
  }));
}

function exceptionTasksFromQuotes(rows) {
  return rows.map((row) => ({
    exception_type: "待报价",
    priority: "中",
    related_no: row.project_no,
    customer: row.customer,
    item: row.title,
    quantity: "",
    due_date: row.created_date,
    responsible_role: "销售",
    action: "确认报价资料并推进报价",
    status: "待处理"
  }));
}

function exceptionTasksFromLowStock(rows) {
  return rows.map((row) => ({
    exception_type: "低库存",
    priority: parseNumber(row.available_qty) <= 0 ? "高" : "中",
    related_no: row.product_code,
    customer: "",
    item: row.product_name,
    quantity: row.available_qty,
    due_date: "",
    responsible_role: "PMC/仓库",
    action: "确认安全库存、冻结量和补料需求",
    status: "待处理"
  }));
}

function exceptionPriorityWeight(priority) {
  if (priority === "高") {
    return 3;
  }
  if (priority === "中") {
    return 2;
  }
  return 1;
}

async function queryReportCenter(params = {}) {
  if (params.refresh !== "1") {
    const consoleBody = queryLocalPmcDashboard(params);
    if (consoleBody) {
      const orderCenter = await queryOrderCenter({
        pageindex: params.pageindex || 1,
        pagesize: params.pagesize || 20,
        contract_limit: params.contract_limit || 5,
        due_soon_days: params.due_soon_days || 7
      });
      return {
        header: { status: 0, message: "ok" },
        body: {
          model: "report_center",
          generated_at: new Date().toISOString(),
          cached: true,
          summary: {
            today_orders: consoleBody.summary.today_orders,
            month_orders: consoleBody.summary.month_orders,
            red_orders: orderCenter.body.summary.red_orders,
            yellow_orders: orderCenter.body.summary.yellow_orders,
            green_orders: orderCenter.body.summary.green_orders,
            shortage_orders: orderCenter.body.summary.shortage_orders,
            due_soon_orders: consoleBody.summary.due_soon_orders,
            pending_quote_projects: consoleBody.summary.pending_quote_projects,
            low_stock: consoleBody.summary.low_stock
          },
          sections: {
            order_rows: orderCenter.body.rows,
            pending_quotes: consoleBody.sections.pending_quotes,
            low_stock: consoleBody.sections.low_stock
          },
          notes: [
            "当前报表读取本地 SQLite 汇总。",
            "ERP 不可用时，报表继续使用最近同步成功的数据。"
          ]
        }
      };
    }
  }

  const [consoleData, orderCenter, quotes] = await Promise.all([
    queryPmcConsole({ ...params, refresh: params.refresh || "" }),
    queryOrderCenter({
      pageindex: params.pageindex || 1,
      pagesize: params.pagesize || 20,
      contract_limit: params.contract_limit || 5,
      due_soon_days: params.due_soon_days || 7
    }),
    queryQuoteCenter({ pageindex: 1, pagesize: 20, limit: 20 })
  ]);
  const sourceNotes = [
    ...(consoleData.body.offline ? ["驾驶舱实时数据源暂不可用，报表使用本地快照或空数据。"] : []),
    ...(orderCenter.body.offline ? ["订单中心实时数据源暂不可用，订单状态样本为空。"] : []),
    ...(quotes.body.offline ? ["待报价实时数据源暂不可用，待报价样本为空。"] : [])
  ];
  return {
    header: { status: 0, message: "ok" },
    body: {
      model: "report_center",
      generated_at: new Date().toISOString(),
      summary: {
        today_orders: consoleData.body.summary.today_orders,
        month_orders: consoleData.body.summary.month_orders,
        red_orders: orderCenter.body.summary.red_orders,
        yellow_orders: orderCenter.body.summary.yellow_orders,
        green_orders: orderCenter.body.summary.green_orders,
        shortage_orders: orderCenter.body.summary.shortage_orders,
        due_soon_orders: consoleData.body.summary.due_soon_orders,
        pending_quote_projects: quotes.body.summary.pending_quote_projects,
        low_stock: consoleData.body.summary.low_stock
      },
      sections: {
        order_rows: orderCenter.body.rows,
        pending_quotes: quotes.body.rows,
        low_stock: consoleData.body.sections.low_stock
      },
      notes: [
        ...sourceNotes,
        "报表中心提供可浏览指标、打印版、CSV 导出和 Excel 日报导出。",
        "月报模板、供应商绩效和设备利用率需要在后续阶段补齐。"
      ]
    }
  };
}

function modulePage({ title, subtitle, summary = [], panels = [], notes = [], actions = [] }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - 蕴杰金属数字 PMC 控制台</title>
  <style>
    :root { color-scheme: light; --bg: #f4f6f8; --panel: #ffffff; --text: #172033; --muted: #667085; --border: #d9dee7; --green: #176b58; --green-soft: #e8f3ef; --amber: #a15c00; --amber-soft: #fff3d8; --red: #b42318; --red-soft: #fee4e2; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    main { width: min(1440px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 36px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 18px; border-bottom: 1px solid var(--border); }
    h1 { margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: 0; }
    h2 { margin: 0; padding: 14px 16px; border-bottom: 1px solid var(--border); font-size: 17px; letter-spacing: 0; }
    .sub { margin-top: 8px; color: var(--muted); font-size: 14px; line-height: 1.6; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .button { min-height: 36px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); text-decoration: none; font-size: 14px; }
    .button.primary { background: var(--green); border-color: var(--green); color: #ffffff; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 18px 0; }
    .metric { min-height: 92px; padding: 13px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
    .metric span { display: block; color: var(--muted); font-size: 13px; }
    .metric strong { display: block; margin-top: 9px; font-size: 25px; line-height: 1; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
    .panel { border: 1px solid var(--border); border-radius: 8px; background: var(--panel); overflow: hidden; }
    .table-wrap { overflow: auto; }
    table { width: 100%; min-width: 820px; border-collapse: collapse; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; font-size: 13px; line-height: 1.45; }
    th { background: #f0f3f6; color: #344054; font-weight: 650; white-space: nowrap; }
    tr:last-child td { border-bottom: 0; }
    .empty { padding: 20px 16px; color: var(--muted); font-size: 14px; }
    .notes { margin-top: 12px; color: var(--muted); font-size: 13px; line-height: 1.7; }
    .pill { display: inline-block; padding: 3px 7px; border-radius: 999px; background: var(--green-soft); color: var(--green); font-size: 12px; white-space: nowrap; }
    .timeline { min-width: 820px; padding: 14px 16px 18px; }
    .timeline-scale { position: relative; height: 24px; margin-left: 220px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: 12px; }
    .timeline-scale span { position: absolute; top: 0; transform: translateX(-50%); white-space: nowrap; }
    .timeline-row { display: grid; grid-template-columns: 210px 1fr; gap: 10px; min-height: 54px; align-items: center; border-bottom: 1px solid var(--border); }
    .timeline-row:last-child { border-bottom: 0; }
    .timeline-label strong { display: block; font-size: 13px; }
    .timeline-label span { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    .timeline-track { position: relative; height: 18px; border-radius: 999px; background: #eef2f6; }
    .timeline-dot { position: absolute; top: 50%; width: 14px; height: 14px; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 0 3px #ffffff; }
    .timeline-dot.red { background: var(--red); }
    .timeline-dot.yellow { background: #f4a000; }
    .timeline-dot.green { background: var(--green); }
    .timeline-text { position: absolute; top: 22px; color: var(--muted); font-size: 12px; white-space: nowrap; }
    @media (max-width: 980px) { header, .grid { display: block; } .actions { justify-content: flex-start; margin-top: 14px; } .panel { margin-top: 12px; } h1 { font-size: 24px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>${escapeHtml(title)}</h1>
        <div class="sub">${escapeHtml(subtitle)}</div>
      </div>
      <div class="actions">
        <a class="button" href="/pmc">PMC 驾驶舱</a>
        <a class="button" href="/orders">订单中心</a>
        <a class="button" href="/goal">全功能路线</a>
        ${actions.map(([label, href]) => `<a class="button primary" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`).join("")}
      </div>
    </header>
    <section class="summary">${summary.map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "")}</strong></div>`).join("")}</section>
    <section class="grid">${panels.join("")}</section>
    <section class="notes">${notes.map((note) => `<div>${escapeHtml(note)}</div>`).join("")}</section>
  </main>
</body>
</html>`;
}

function modulePanel(title, rows, columns) {
  const safeRows = Array.isArray(rows) ? rows.slice(0, 20) : [];
  return `<section class="panel">
    <h2>${escapeHtml(title)} <span class="pill">${safeRows.length}</span></h2>
    ${
      safeRows.length
        ? `<div class="table-wrap"><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(labelFor(column))}</th>`).join("")}</tr></thead><tbody>${safeRows.map((row) => `<tr>${columns.map((column) => `<td>${formatDetailCell(column, row?.[column])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
        : `<div class="empty">当前没有${escapeHtml(title)}。</div>`
    }
  </section>`;
}

function materialControlPage(body) {
  return modulePage({
    title: "物料控制中心",
    subtitle: "按销售订单产品库存计算缺料，并把低库存、冻结、长库龄统一成物料处理清单。",
    summary: [
      ["物料任务", body.summary.material_tasks],
      ["紧急任务", body.summary.urgent_material_tasks],
      ["缺料订单", body.summary.shortage_orders],
      ["缺料明细", body.summary.shortage_rows],
      ["低库存", body.summary.low_stock],
      ["冻结库存", body.summary.frozen_stock],
      ["长库龄", body.summary.old_stock],
      ["数据源异常", body.summary.source_errors]
    ],
    panels: [
      modulePanel("物料处理清单", body.sections.material_tasks, ["material_task_no", "priority", "material_task_type", "related_no", "customer", "product_name", "product_code", "warehouse", "demand_qty", "available_qty", "shortage_qty", "responsible_role", "action"]),
      modulePanel("缺料明细", body.sections.shortage_rows, ["order_no", "customer", "product_name", "product_code", "demand_qty", "available_qty", "shortage_qty"]),
      modulePanel("低库存预警", body.sections.low_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"]),
      modulePanel("冻结库存", body.sections.frozen_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"]),
      modulePanel("长库龄库存", body.sections.old_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"])
    ],
    notes: body.notes,
    actions: [["谨慎同步物料20条", "/sync?sources=material_alerts&pagesize=20&scan_size=20&contract_limit=3"], ["刷新实时ERP", "/materials?refresh=1"], ["查看 JSON", "/api/pmc_dashboard?format=json"]]
  });
}

function quoteCenterPage(body) {
  return modulePage({
    title: "待报价中心",
    subtitle: "集中查看项目/商机中的待报价项目，按优先级生成销售报价跟进池。",
    summary: [
      ["扫描项目", body.summary.scanned_projects],
      ["待报价项目", body.summary.pending_quote_projects],
      ["报价跟进", body.summary.quote_followups],
      ["紧急报价", body.summary.urgent_quotes],
      ["负责人数", body.summary.owner_count]
    ],
    panels: [
      modulePanel("报价跟进池", body.sections.quote_followups, ["quote_no", "priority", "quote_status", "customer", "title", "owner", "project_stage", "estimated_amount", "quoted_amount", "created_date", "age_days", "action"]),
      modulePanel("负责人汇总", body.sections.owner_summary, ["owner", "quote_followups", "urgent_quotes", "estimated_amount", "max_age_days", "latest_action"])
    ],
    notes: body.notes,
    actions: [["谨慎同步报价20条", "/sync?sources=quote_projects&pagesize=20&limit=20"], ["刷新实时ERP", "/quotes?refresh=1"], ["查看 JSON", "/api/pending_quotes?format=json&pageindex=1&pagesize=20&limit=20"]]
  });
}

function procurementCenterPage(body) {
  return modulePage({
    title: "采购跟催中心",
    subtitle: "用入库流水和应付付款生成采购到货、付款和供应商跟催清单。",
    summary: [
      ["跟催事项", body.summary.followup_tasks],
      ["紧急跟催", body.summary.urgent_followups],
      ["入库记录", body.summary.inbound_records],
      ["应付记录", body.summary.payable_records],
      ["供应商数", body.summary.supplier_count],
      ["数据源异常", body.summary.source_errors]
    ],
    panels: [
      modulePanel("采购跟催清单", body.sections.followups, ["followup_no", "priority", "followup_type", "supplier", "related_no", "item", "quantity", "amount", "status", "due_date", "age_days", "responsible_role", "action"]),
      modulePanel("供应商跟催汇总", body.sections.suppliers, ["supplier", "followup_tasks", "urgent_followups", "unpaid_amount", "latest_action"]),
      modulePanel("采购到货/入库记录", body.sections.stock_in_records, ["receipt_no", "title", "quantity", "receipt_status", "receipt_type", "warehouse_keeper", "applicant", "confirmed_time"]),
      modulePanel("应付/付款记录", body.sections.payables, ["counterparty", "bill_no", "business_title", "amount", "paid_amount", "unpaid_amount", "due_date", "risk_status", "owner"])
    ],
    notes: body.notes,
    actions: [
      ["入库接口", "/api/stock_in_records?pageindex=1&pagesize=20"],
      ["应付接口", "/api/payables?pageindex=1&pagesize=20"]
    ]
  });
}

async function queryFinanceCenter(params = {}) {
  if (params.refresh !== "1" && !params.searchKey) {
    const financeRows = listFinanceRecords({ limit: clampInt(params.pagesize || 200, 1, 1000) }).map((row) => ({
      ...row,
      raw: parseJson(row.raw_json, row)
    }));
    if (financeRows.length) {
      return {
        header: { status: 0, message: "ok" },
        body: buildLocalFinanceCenter({ financeRows })
      };
    }
    if (ERP_PROTECTION_MODE) {
      return {
        header: { status: 0, message: "ok" },
        body: emptyFinanceCenterBody("ERP保护模式已开启，应收应付中心未找到本地 SQLite 数据时不再自动请求 ERP。")
      };
    }
  }

  const pageindex = params.pageindex || 1;
  const pagesize = params.pagesize || 20;
  const today = startOfDay(parseDate(params.today) || new Date());
  const [receivableResult, payableResult] = await Promise.allSettled([
    client.queryView("receivables", {
      pageindex,
      pagesize,
      searchKey: params.searchKey || ""
    }),
    client.queryView("payables", {
      pageindex,
      pagesize,
      searchKey: params.searchKey || ""
    })
  ]);
  const sourceStatus = {
    receivables: {
      ok: receivableResult.status === "fulfilled",
      message: receivableResult.status === "rejected" ? summarizeDataSourceError(receivableResult.reason) : null
    },
    payables: {
      ok: payableResult.status === "fulfilled",
      message: payableResult.status === "rejected" ? summarizeDataSourceError(payableResult.reason) : null
    }
  };
  const sourceNotes = Object.entries(sourceStatus)
    .filter(([, status]) => !status.ok)
    .map(([name, status]) => `${name} 数据源暂不可用：${status.message}`);
  const receivableTable = receivableResult.status === "fulfilled" ? normalizeTable(receivableResult.value) : { rows: [], page: null };
  const payableTable = payableResult.status === "fulfilled" ? normalizeTable(payableResult.value) : { rows: [], page: null };
  const receivableRows = receivableTable.rows.map((row) => mapFinanceRow(row, "receivable", today));
  const payableRows = payableTable.rows.map((row) => mapFinanceRow(row, "payable", today));
  const receivableDebtRows = topFinanceCounterparties(receivableRows);
  const payableDebtRows = topFinanceCounterparties(payableRows);
  const overdueReceivables = financeRowsByRisk(receivableRows, "已逾期");
  const upcomingPayables = payableRows
    .filter((row) => parseNumber(row.unpaid_amount) > 0 && row.due_days !== null && row.due_days <= 7)
    .sort(compareFinanceDueRows);

  return {
    header: { status: 0, message: "ok" },
    body: {
      model: "finance_center",
      generated_at: new Date().toISOString(),
      offline: sourceNotes.length > 0,
      summary: {
        receivable_records: receivableRows.length,
        payable_records: payableRows.length,
        receivable_unpaid: sumFinanceAmount(receivableRows, "unpaid_amount"),
        payable_unpaid: sumFinanceAmount(payableRows, "unpaid_amount"),
        overdue_receivables: overdueReceivables.length,
        due_soon_payables: upcomingPayables.length,
        source_errors: sourceNotes.length
      },
      sections: {
        receivables: receivableRows,
        payables: payableRows,
        receivable_debts: receivableDebtRows,
        overdue_receivables: overdueReceivables,
        due_soon_payables: upcomingPayables,
        payable_debts: payableDebtRows
      },
      source_status: sourceStatus,
      notes: [
        ...sourceNotes,
        "应收应付中心 V1 聚合收款/应收和付款/应付记录，先用于老板和销售查看往来风险。",
        "逾期判断优先使用到期日；如果 ERP 返回付款条件天数且有单据日期，则自动推算到期日。"
      ]
    }
  };
}

function emptyFinanceCenterBody(message) {
  return {
    model: "finance_center",
    generated_at: new Date().toISOString(),
    cached: true,
    offline: true,
    summary: {
      receivable_records: 0,
      payable_records: 0,
      receivable_unpaid: 0,
      payable_unpaid: 0,
      overdue_receivables: 0,
      due_soon_payables: 0,
      source_errors: 0
    },
    sections: {
      receivables: [],
      payables: [],
      receivable_debts: [],
      overdue_receivables: [],
      due_soon_payables: [],
      payable_debts: []
    },
    source_status: {
      sqlite_finance_records: { ok: false, rows: 0, message }
    },
    notes: [
      message,
      "请在 ERP 稳定时点击“谨慎同步”更新本地应收应付数据。"
    ]
  };
}

function mapFinanceRow(row, direction, today) {
  const amount = firstNumber(row.moneyall, row.MoneyAll, row.money1, row.Money1, row.money, row.Money, row.cmoney, row.CMoney, row["金额"], row["应收金额"], row["应付金额"]);
  const paidAmount = firstNumber(row.hkmoney, row.HkMoney, row.money2, row.Money2, row.paymoney, row.PayMoney, row["已收金额"], row["已付金额"], row["收款金额"], row["付款金额"]);
  const unpaidAmount = firstNumber(row.wsmoney, row.WsMoney, row.leftmoney, row.LeftMoney, row["未收金额"], row["未付金额"], amount !== null && paidAmount !== null ? amount - paidAmount : null);
  const billDateText = firstText(row.date1, row.Date1, row.dateadd, row.DateAdd, row.tdate, row.TDate, row["单据日期"], row["申请日期"]);
  const paymentTermsDays = firstNumber(row.paydays, row.PayDays, row.daynum, row.DayNum, row.zq, row.Zq, row["账期"], row["付款条件"], row["付款条件天数"]);
  const dueDateText = firstText(row.date2, row.Date2, row.dateend, row.DateEnd, row["到期日"], row["计划日期"]);
  const billDate = parseDate(billDateText);
  const dueDate = parseDate(dueDateText) || (billDate && paymentTermsDays !== null ? addDays(billDate, paymentTermsDays) : null);
  const dueDays = dueDate ? daysBetween(today, startOfDay(dueDate)) : null;
  const ageDays = billDate ? daysBetween(startOfDay(billDate), today) : null;
  const riskStatus = financeRiskStatus(unpaidAmount, dueDays);
  return {
    direction,
    counterparty: firstText(row.khmc, row.gysname, row.cateName, row.CateName, row.title2, row["客户"], row["供应商"], row["往来单位"], row["单位名称"]),
    bill_no: firstText(row.htid, row.rkbh, row.billno, row.BillNo, row.order1, row.Order1, row["单号"], row["合同编号"], row["付款单号"], row["收款单号"]),
    business_title: firstText(row.title, row.Title, row.intro, row.Intro, row["摘要"], row["标题"]),
    amount,
    paid_amount: paidAmount,
    unpaid_amount: unpaidAmount,
    bill_date: billDate ? formatDate(billDate) : billDateText,
    due_date: dueDate ? formatDate(dueDate) : dueDateText,
    payment_terms: paymentTermsDays !== null ? `${paymentTermsDays}天` : firstText(row.paytype, row.PayType, row["付款方式"], row["结算方式"]),
    age_days: ageDays,
    due_days: dueDays,
    risk_status: riskStatus,
    status: firstText(row.status, row.Status, row.zt, row.Zt, row.skzt, row.fkzt, row["状态"], row["收款状态"], row["付款状态"]),
    owner: firstText(row.xsry, row.person, row.Person, row.owner, row["负责人"], row["经办人"]),
    raw: row
  };
}

function financeRiskStatus(unpaidAmount, dueDays) {
  const unpaid = parseNumber(unpaidAmount) || 0;
  if (unpaid <= 0) {
    return "已结清";
  }
  if (dueDays === null) {
    return "未清";
  }
  if (dueDays < 0) {
    return "已逾期";
  }
  if (dueDays <= 7) {
    return "7天内到期";
  }
  return "未到期";
}

function financeRowsByRisk(rows, riskStatus) {
  return rows
    .filter((row) => row.risk_status === riskStatus && parseNumber(row.unpaid_amount) > 0)
    .sort(compareFinanceDueRows);
}

function compareFinanceDueRows(a, b) {
  const aDays = a.due_days === null ? Number.POSITIVE_INFINITY : a.due_days;
  const bDays = b.due_days === null ? Number.POSITIVE_INFINITY : b.due_days;
  if (aDays !== bDays) {
    return aDays - bDays;
  }
  return (parseNumber(b.unpaid_amount) || 0) - (parseNumber(a.unpaid_amount) || 0);
}

function topFinanceCounterparties(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const unpaid = parseNumber(row.unpaid_amount) || 0;
    if (unpaid <= 0) {
      continue;
    }
    const key = row.counterparty || "未识别往来单位";
    const current = grouped.get(key) || {
      counterparty: key,
      unpaid_amount: 0,
      records: 0,
      overdue_records: 0,
      earliest_due_date: null,
      earliest_due_days: null,
      risk_status: "未清"
    };
    current.unpaid_amount += unpaid;
    current.records += 1;
    if (row.risk_status === "已逾期") {
      current.overdue_records += 1;
    }
    if (row.due_days !== null && (current.earliest_due_days === null || row.due_days < current.earliest_due_days)) {
      current.earliest_due_days = row.due_days;
      current.earliest_due_date = row.due_date;
    }
    if (current.overdue_records > 0) {
      current.risk_status = "已逾期";
    } else if (current.earliest_due_days !== null && current.earliest_due_days <= 7) {
      current.risk_status = "7天内到期";
    }
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map((row) => ({ ...row, unpaid_amount: Number(row.unpaid_amount.toFixed(2)) }))
    .sort((a, b) => b.unpaid_amount - a.unpaid_amount)
    .slice(0, 20);
}

function firstText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return null;
}

function sumFinanceAmount(rows, key) {
  const total = rows.reduce((sum, row) => sum + (parseNumber(row[key]) || 0), 0);
  return Number(total.toFixed(2));
}

function financeCenterPage(body) {
  return modulePage({
    title: "应收应付中心",
    subtitle: "集中查看客户应收、收款状态和供应商应付/付款情况。",
    summary: [
      ["应收记录", body.summary.receivable_records],
      ["应付记录", body.summary.payable_records],
      ["未收合计", body.summary.receivable_unpaid],
      ["未付合计", body.summary.payable_unpaid],
      ["逾期应收", body.summary.overdue_receivables],
      ["7天内应付", body.summary.due_soon_payables],
      ["数据源异常", body.summary.source_errors]
    ],
    panels: [
      modulePanel("客户欠款排行", body.sections.receivable_debts, ["counterparty", "unpaid_amount", "records", "overdue_records", "earliest_due_date", "earliest_due_days", "risk_status"]),
      modulePanel("逾期应收", body.sections.overdue_receivables, ["counterparty", "bill_no", "business_title", "unpaid_amount", "due_date", "due_days", "owner"]),
      modulePanel("7天内应付", body.sections.due_soon_payables, ["counterparty", "bill_no", "business_title", "unpaid_amount", "due_date", "due_days", "status"]),
      modulePanel("供应商未付排行", body.sections.payable_debts, ["counterparty", "unpaid_amount", "records", "overdue_records", "earliest_due_date", "earliest_due_days", "risk_status"]),
      modulePanel("应收/收款明细", body.sections.receivables, ["counterparty", "bill_no", "business_title", "amount", "paid_amount", "unpaid_amount", "bill_date", "due_date", "payment_terms", "age_days", "due_days", "risk_status"]),
      modulePanel("应付/付款明细", body.sections.payables, ["counterparty", "bill_no", "business_title", "amount", "paid_amount", "unpaid_amount", "bill_date", "due_date", "payment_terms", "age_days", "due_days", "risk_status"])
    ],
    notes: body.notes,
    actions: [
      ["谨慎同步财务20条", "/sync?sources=finance_records&pagesize=20"],
      ["刷新实时ERP", "/finance?refresh=1"],
      ["应收接口", "/api/receivables?pageindex=1&pagesize=20"],
      ["应付接口", "/api/payables?pageindex=1&pagesize=20"]
    ]
  });
}

async function querySchedulingCenter(params = {}) {
  const horizonDays = clampInt(params.horizon_days || 30, 7, 90);
  const today = startOfDay(params.today ? new Date(params.today) : new Date());
  const snapshot = latestPmcSnapshot();
  let orderCenter = null;
  let cached = false;
  let sourceError = null;
  if (snapshot && params.refresh !== "1") {
    cached = true;
  } else {
    try {
      orderCenter = await withTimeout(queryOrderCenter({
        pageindex: params.pageindex || 1,
        pagesize: params.pagesize || 30,
        contract_limit: params.contract_limit || 10,
        due_soon_days: params.due_soon_days || 7,
        scan_size: params.scan_size || 100,
        searchKey: params.searchKey || ""
      }), clampInt(params.timeout_ms || 8000, 1000, 20000));
    } catch (error) {
      sourceError = summarizeDataSourceError(error);
      cached = Boolean(snapshot);
    }
  }
  const sourceRows = orderCenter?.body?.rows || (cached && snapshot ? scheduleRowsFromSnapshot(snapshot.payload) : []);
  const items = sourceRows.map((row) => mapScheduleItem(row, today, horizonDays));
  const visibleItems = items.filter((item) => item.in_window || item.status_code !== "green").slice(0, 30);
  const pressureRows = schedulePressureBuckets(items);
  const impactRows = scheduleImpactRows(visibleItems);

  return {
    header: { status: 0, message: "ok" },
    body: {
      model: "scheduling_center",
      generated_at: new Date().toISOString(),
      offline: Boolean(orderCenter?.body?.offline || sourceError),
      cached,
      scan: {
        today: formatDate(today),
        horizon_days: horizonDays
      },
      summary: {
        schedule_items: visibleItems.length,
        red_orders: visibleItems.filter((item) => item.status_code === "red").length,
        yellow_orders: visibleItems.filter((item) => item.status_code === "yellow").length,
        no_delivery_date: items.filter((item) => !item.delivery_date).length,
        high_impact_orders: impactRows.filter((row) => row.impact_level === "高").length,
        this_week_orders: pressureRows.find((row) => row.bucket === "7天内")?.order_count || 0
      },
      rows: visibleItems,
      sections: {
        pressure_buckets: pressureRows,
        impact_rows: impactRows
      },
      source_status: orderCenter?.body?.source_status || {
        order_center: { ok: !sourceError && !cached, message: sourceError }
      },
      notes: [
        ...(orderCenter?.body?.offline ? orderCenter.body.notes || [] : []),
        ...(sourceError ? [`订单实时扫描暂不可用：${sourceError}`] : []),
        ...(cached && snapshot ? [`当前读取本地驾驶舱快照：${formatDateTime(snapshot.created_at)}。`] : []),
        "排产甘特视图按订单最近交期生成时间轴，并推导交期压力与插单影响。",
        "当前不回写 ERP；后续接工单、设备、工序计划和产能后，再升级为可拖拽排产。"
      ]
    }
  };
}

function scheduleRowsFromSnapshot(payload) {
  const rows = [
    ...(payload?.sections?.overdue_orders || []),
    ...(payload?.sections?.due_soon_orders || []),
    ...(payload?.sections?.shortage_orders || [])
  ];
  const seen = new Set();
  return rows.filter((row) => {
    const key = row.order_no || `${row.customer || ""}-${row.product_name || ""}-${row.delivery_date || ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function mapScheduleItem(row, today, horizonDays) {
  const delivery = parseDate(row.delivery_date);
  const days = delivery ? daysBetween(today, startOfDay(delivery)) : null;
  const clamped = days === null ? horizonDays : Math.max(0, Math.min(horizonDays, days));
  return {
    order_no: row.order_no,
    customer: row.customer,
    owner: row.owner,
    product_name: Array.isArray(row.risk_products) ? row.risk_products.join(" / ") : row.product_name || row.product_code || "",
    delivery_date: row.delivery_date,
    days_from_today: days,
    due_status: row.due_status || row.risk_type || "",
    shortage_status: row.shortage_status || (row.shortage_qty ? "缺料" : ""),
    status_code: row.status_code || (days !== null && days < 0 ? "red" : days !== null && days <= 7 ? "yellow" : "green"),
    status_text: row.status_text || (days !== null && days < 0 ? "紧急" : days !== null && days <= 7 ? "预警" : "正常"),
    impact_level: scheduleImpactLevel(days, row),
    schedule_advice: scheduleAdvice(days, row),
    timeline_left: Math.round((clamped / horizonDays) * 100),
    in_window: days !== null && days >= 0 && days <= horizonDays
  };
}

function schedulePressureBuckets(items) {
  const buckets = [
    { bucket: "已逾期", min: Number.NEGATIVE_INFINITY, max: -1 },
    { bucket: "7天内", min: 0, max: 7 },
    { bucket: "8-14天", min: 8, max: 14 },
    { bucket: "15-30天", min: 15, max: 30 },
    { bucket: "30天后", min: 31, max: Number.POSITIVE_INFINITY },
    { bucket: "无交期", noDate: true }
  ];
  return buckets.map((bucket) => {
    const rows = bucket.noDate
      ? items.filter((item) => item.days_from_today === null)
      : items.filter((item) => item.days_from_today !== null && item.days_from_today >= bucket.min && item.days_from_today <= bucket.max);
    return {
      bucket: bucket.bucket,
      order_count: rows.length,
      red_orders: rows.filter((row) => row.status_code === "red").length,
      yellow_orders: rows.filter((row) => row.status_code === "yellow").length,
      shortage_orders: rows.filter((row) => /缺料|短缺/.test(String(row.shortage_status || ""))).length,
      action: scheduleBucketAction(bucket.bucket, rows)
    };
  });
}

function scheduleImpactRows(rows) {
  return rows
    .map((row) => ({
      order_no: row.order_no,
      customer: row.customer,
      owner: row.owner,
      product_name: row.product_name,
      delivery_date: row.delivery_date,
      days_from_today: row.days_from_today,
      due_status: row.due_status,
      shortage_status: row.shortage_status,
      impact_level: row.impact_level,
      schedule_advice: row.schedule_advice
    }))
    .sort((a, b) => scheduleImpactWeight(b.impact_level) - scheduleImpactWeight(a.impact_level) || (a.days_from_today ?? 9999) - (b.days_from_today ?? 9999));
}

function scheduleImpactLevel(days, row) {
  if (days !== null && days < 0) {
    return "高";
  }
  if (/缺料|短缺/.test(String(row.shortage_status || ""))) {
    return "高";
  }
  if (days !== null && days <= 7) {
    return "中";
  }
  return "低";
}

function scheduleAdvice(days, row) {
  if (days !== null && days < 0) {
    return "先确认延期原因，必要时重排并同步销售";
  }
  if (/缺料|短缺/.test(String(row.shortage_status || ""))) {
    return "先解除缺料，再安排生产窗口";
  }
  if (days !== null && days <= 7) {
    return "锁定本周资源，避免插单冲突";
  }
  if (days === null) {
    return "补充交期后再进入排产";
  }
  return "按交期窗口滚动排产";
}

function scheduleBucketAction(bucket, rows) {
  if (!rows.length) {
    return "暂无处理";
  }
  if (bucket === "已逾期") {
    return "优先复盘并同步销售/客户";
  }
  if (bucket === "7天内") {
    return "锁定设备、物料和发货资源";
  }
  if (bucket === "无交期") {
    return "补齐承诺交期";
  }
  return "滚动关注，准备插单影响评估";
}

function scheduleImpactWeight(level) {
  if (level === "高") {
    return 3;
  }
  if (level === "中") {
    return 2;
  }
  return 1;
}

function schedulingCenterPage(body) {
  return modulePage({
    title: "排产甘特视图",
    subtitle: `按订单最近交期生成 ${body.scan.horizon_days} 天时间轴，先看交期压力和缺料风险。`,
    summary: [
      ["时间轴订单", body.summary.schedule_items],
      ["红灯订单", body.summary.red_orders],
      ["黄灯订单", body.summary.yellow_orders],
      ["高影响订单", body.summary.high_impact_orders],
      ["7天内订单", body.summary.this_week_orders],
      ["无交期", body.summary.no_delivery_date]
    ],
    panels: [
      scheduleTimelinePanel(body.rows, body.scan.horizon_days),
      modulePanel("交期压力分布", body.sections.pressure_buckets, ["bucket", "order_count", "red_orders", "yellow_orders", "shortage_orders", "action"]),
      modulePanel("插单影响评估", body.sections.impact_rows, ["impact_level", "order_no", "customer", "owner", "product_name", "delivery_date", "due_status", "shortage_status", "schedule_advice"]),
      modulePanel("排产订单列表", body.rows, ["status_text", "order_no", "customer", "owner", "delivery_date", "due_status", "shortage_status", "schedule_advice"])
    ],
    notes: body.notes,
    actions: [
      ["订单中心", "/orders"],
      ["刷新", "/scheduling?refresh=1"]
    ]
  });
}

function scheduleTimelinePanel(rows, horizonDays) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return `<section class="panel">
    <h2>交期时间轴 <span class="pill">${safeRows.length}</span></h2>
    ${
      safeRows.length
        ? `<div class="timeline">${timelineScale(horizonDays)}${safeRows.map(scheduleTimelineRow).join("")}</div>`
        : `<div class="empty">当前没有可排入时间轴的订单。</div>`
    }
  </section>`;
}

function timelineScale(horizonDays) {
  const marks = [0, Math.round(horizonDays / 4), Math.round(horizonDays / 2), Math.round((horizonDays * 3) / 4), horizonDays];
  return `<div class="timeline-scale">${marks.map((day) => `<span style="left:${Math.round((day / horizonDays) * 100)}%">${day}天</span>`).join("")}</div>`;
}

function scheduleTimelineRow(row) {
  const tone = row.status_code === "red" ? "red" : row.status_code === "yellow" ? "yellow" : "green";
  const left = row.delivery_date ? row.timeline_left : 100;
  return `<div class="timeline-row">
    <div class="timeline-label">
      <strong>${escapeHtml(row.order_no || "")}</strong>
      <span>${escapeHtml(row.customer || "")}</span>
    </div>
    <div class="timeline-track">
      <span class="timeline-dot ${tone}" style="left:${left}%"></span>
      <span class="timeline-text" style="left:${Math.max(0, Math.min(78, left))}%">${escapeHtml(row.delivery_date || "无交期")}</span>
    </div>
  </div>`;
}

function productionCenterPage(body) {
  return modulePage({
    title: "生产进度中心",
    subtitle: "聚合 ERP 生产进度、领料、BOM 和工序计划，识别延期工序与工作中心负荷。",
    summary: [
      ["生产进度", body.summary.progress_rows],
      ["领料记录", body.summary.material_order_rows],
      ["BOM记录", body.summary.bom_rows],
      ["工序计划", body.summary.procedure_plan_rows],
      ["延期工序", body.summary.delayed_procedures],
      ["工作中心", body.summary.work_centers],
      ["数据源异常", body.summary.source_errors]
    ],
    panels: [
      modulePanel("延期工序", body.sections.delayed_procedures, ["work_assignment_id", "order_no", "product_name", "procedure_name", "work_center_name", "remaining_qty", "planned_finish_date", "owner", "state"]),
      modulePanel("工作中心负荷", body.sections.workload_by_center, ["work_center_name", "procedure_count", "planned_qty", "finished_qty", "remaining_qty", "delayed_procedures"]),
      modulePanel("生产进度", body.sections.progress, ["orderNo", "productName", "procedureName", "planNum", "finishNum", "state"]),
      modulePanel("领料记录", body.sections.material_orders, ["orderNo", "productName", "materialName", "num", "state"]),
      modulePanel("BOM 数据", body.sections.boms, ["bom_no", "bom_title", "parent_product", "effective_status", "enabled_status", "bom_type", "customer_scope", "owner", "created_date"]),
      modulePanel("工序计划", body.sections.procedure_plans, ["work_assignment_id", "order_no", "product_name", "procedure_name", "work_center_name", "planned_qty", "finished_qty", "remaining_qty", "planned_start_date", "planned_finish_date", "owner"])
    ],
    notes: body.notes,
    actions: [["谨慎同步工序20条", "/sync?sources=procedure_plans&pagesize=20"], ["派工追踪", "/dispatch"], ["刷新实时ERP", "/production?refresh=1"]]
  });
}

function dispatchTrackingPage(body) {
  return modulePage({
    title: "派工进度追踪",
    subtitle: "基于 ERP 工序计划表显示派工单ID、工序、计划起止、完成数量、剩余数量和延期状态。",
    summary: [
      ["派工记录", body.summary.procedure_plan_rows],
      ["延期派工", body.summary.delayed_procedures],
      ["工作中心", body.summary.work_centers],
      ["生产进度", body.summary.progress_rows],
      ["数据源异常", body.summary.source_errors]
    ],
    panels: [
      modulePanel("延期派工", body.sections.delayed_procedures, ["work_assignment_id", "order_no", "product_name", "procedure_name", "work_center_name", "remaining_qty", "planned_finish_date", "owner", "state"]),
      modulePanel("派工进度追踪表", body.sections.procedure_plans, ["work_assignment_id", "order_no", "product_name", "procedure_name", "work_center_name", "planned_qty", "finished_qty", "remaining_qty", "planned_start_date", "planned_finish_date", "owner", "state"]),
      modulePanel("工作中心负荷", body.sections.workload_by_center, ["work_center_name", "procedure_count", "planned_qty", "finished_qty", "remaining_qty", "delayed_procedures"]),
      modulePanel("ERP生产进度原始表", body.sections.progress, ["orderNo", "productName", "procedureName", "planNum", "finishNum", "state"])
    ],
    notes: [
      ...body.notes,
      "当前 ERP 的 production_progress 接口返回 0 行时，本页优先使用 procedure_plans 工序计划作为派工追踪主数据。"
    ],
    actions: [["谨慎同步工序20条", "/sync?sources=procedure_plans&pagesize=20"], ["返回生产中心", "/production"], ["刷新实时ERP", "/dispatch?refresh=1"]]
  });
}

function exceptionCenterPage(body) {
  return modulePage({
    title: "异常管理中心",
    subtitle: "把交期、缺料、待报价、库存异常统一成按优先级排序的 PMC 待办池。",
    summary: [
      ["未关闭待办", body.summary.open_tasks],
      ["高优先级", body.summary.critical_tasks],
      ["逾期订单", body.summary.overdue_orders],
      ["7天内交期", body.summary.due_soon_orders],
      ["缺料订单", body.summary.shortage_orders],
      ["待报价", body.summary.pending_quotes],
      ["低库存", body.summary.low_stock]
    ],
    panels: [
      modulePanel("统一异常待办", body.sections.tasks, ["task_no", "priority", "exception_type", "related_no", "customer", "item", "quantity", "due_date", "responsible_role", "action", "status"]),
      modulePanel("逾期订单", body.sections.overdue_orders, ["order_no", "customer", "product_name", "remaining_qty", "delivery_date"]),
      modulePanel("7天内交期", body.sections.due_soon_orders, ["order_no", "customer", "product_name", "remaining_qty", "delivery_date"]),
      modulePanel("缺料明细", body.sections.shortage_rows, ["order_no", "customer", "product_name", "available_qty", "shortage_qty"]),
      modulePanel("待报价项目", body.sections.pending_quotes, ["project_no", "title", "customer", "project_stage", "estimated_amount"]),
      modulePanel("低库存预警", body.sections.low_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"])
    ],
    notes: body.notes,
    actions: [["刷新", "/exceptions"]]
  });
}

function reportCenterPage(body) {
  return modulePage({
    title: "报表中心",
    subtitle: "形成管理指标汇总，并提供打印版、CSV 和 Excel 日报导出。",
    summary: [
      ["今日订单", body.summary.today_orders],
      ["本月订单", body.summary.month_orders],
      ["红灯订单", body.summary.red_orders],
      ["黄灯订单", body.summary.yellow_orders],
      ["绿灯订单", body.summary.green_orders],
      ["缺料订单", body.summary.shortage_orders],
      ["临期订单", body.summary.due_soon_orders],
      ["待报价", body.summary.pending_quote_projects],
      ["低库存", body.summary.low_stock]
    ],
    panels: [
      modulePanel("订单状态样本", body.sections.order_rows, ["status_light", "order_no", "customer", "owner", "amount", "due_status", "shortage_status"]),
      modulePanel("待报价项目", body.sections.pending_quotes, ["project_no", "title", "customer", "project_stage", "estimated_amount"]),
      modulePanel("低库存预警", body.sections.low_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"])
    ],
    notes: body.notes,
    actions: [
      ["打印版", "/reports/print"],
      ["导出 Excel", "/reports/export.xls"],
      ["导出 CSV", "/reports/export.csv"],
      ["刷新", "/reports?refresh=1"]
    ]
  });
}

function reportPrintPage(body) {
  const summaryRows = [
    ["今日订单", body.summary.today_orders],
    ["本月订单", body.summary.month_orders],
    ["红灯订单", body.summary.red_orders],
    ["黄灯订单", body.summary.yellow_orders],
    ["绿灯订单", body.summary.green_orders],
    ["缺料订单", body.summary.shortage_orders],
    ["临期订单", body.summary.due_soon_orders],
    ["待报价", body.summary.pending_quote_projects],
    ["低库存", body.summary.low_stock]
  ];
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PMC 日报打印版</title>
  <style>
    :root { color-scheme: light; --text: #172033; --muted: #667085; --border: #cfd6e2; --soft: #f3f6f8; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: #eef2f6; }
    main { width: min(1020px, calc(100% - 32px)); margin: 24px auto; padding: 28px; background: #ffffff; border: 1px solid var(--border); }
    header { display: flex; justify-content: space-between; gap: 20px; padding-bottom: 14px; border-bottom: 2px solid var(--text); }
    h1 { margin: 0; font-size: 28px; letter-spacing: 0; }
    h2 { margin: 24px 0 10px; font-size: 16px; letter-spacing: 0; }
    .meta { color: var(--muted); font-size: 13px; line-height: 1.7; text-align: right; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--border); border-bottom: 0; border-right: 0; margin-top: 18px; }
    .metric { min-height: 72px; padding: 10px 12px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); }
    .metric span { display: block; color: var(--muted); font-size: 12px; }
    .metric strong { display: block; margin-top: 8px; font-size: 24px; }
    table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
    th, td { padding: 8px 9px; border: 1px solid var(--border); text-align: left; vertical-align: top; font-size: 12px; line-height: 1.4; }
    th { background: var(--soft); font-weight: 650; }
    .notes { margin-top: 18px; color: var(--muted); font-size: 12px; line-height: 1.7; }
    .toolbar { margin-bottom: 12px; text-align: right; }
    .button { display: inline-block; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; color: var(--text); text-decoration: none; font-size: 13px; background: #ffffff; }
    @media print {
      body { background: #ffffff; }
      main { width: 100%; margin: 0; padding: 0; border: 0; }
      .toolbar { display: none; }
      h2 { page-break-after: avoid; }
    }
  </style>
</head>
<body>
  <main>
    <div class="toolbar"><a class="button" href="/reports">返回报表中心</a> <a class="button" href="javascript:window.print()">打印</a></div>
    <header>
      <div>
        <h1>蕴杰金属 PMC 日报</h1>
        <div class="notes">订单、交期、缺料、报价、库存综合摘要</div>
      </div>
      <div class="meta">
        <div>生成时间：${escapeHtml(formatDateTime(body.generated_at))}</div>
        <div>数据口径：ERP API + 本地快照</div>
      </div>
    </header>
    <section class="summary">
      ${summaryRows.map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "")}</strong></div>`).join("")}
    </section>
    ${printTable("订单状态样本", body.sections.order_rows, ["status_light", "order_no", "customer", "owner", "amount", "due_status", "shortage_status"])}
    ${printTable("待报价项目", body.sections.pending_quotes, ["project_no", "title", "customer", "project_stage", "estimated_amount"])}
    ${printTable("低库存预警", body.sections.low_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"])}
    <section class="notes">${(body.notes || []).map((note) => `<div>${escapeHtml(note)}</div>`).join("")}</section>
  </main>
</body>
</html>`;
}

function printTable(title, rows, columns) {
  const safeRows = Array.isArray(rows) ? rows.slice(0, 12) : [];
  return `<section>
    <h2>${escapeHtml(title)}</h2>
    ${
      safeRows.length
        ? `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(labelFor(column))}</th>`).join("")}</tr></thead><tbody>${safeRows.map((row) => `<tr>${columns.map((column) => `<td>${formatDetailCell(column, row?.[column])}</td>`).join("")}</tr>`).join("")}</tbody></table>`
        : `<table><tbody><tr><td>当前没有${escapeHtml(title)}。</td></tr></tbody></table>`
    }
  </section>`;
}

function reportCenterCsv(body) {
  const lines = [];
  appendCsvSection(lines, "PMC指标汇总", [
    ["指标", "数值"],
    ...Object.entries({
      今日订单: body.summary.today_orders,
      本月订单: body.summary.month_orders,
      红灯订单: body.summary.red_orders,
      黄灯订单: body.summary.yellow_orders,
      绿灯订单: body.summary.green_orders,
      缺料订单: body.summary.shortage_orders,
      临期订单: body.summary.due_soon_orders,
      待报价: body.summary.pending_quote_projects,
      低库存: body.summary.low_stock
    })
  ]);
  appendCsvSection(lines, "订单状态样本", tableRowsForCsv(body.sections.order_rows, ["status_light", "order_no", "customer", "owner", "amount", "due_status", "shortage_status"]));
  appendCsvSection(lines, "待报价项目", tableRowsForCsv(body.sections.pending_quotes, ["project_no", "title", "customer", "project_stage", "estimated_amount"]));
  appendCsvSection(lines, "低库存预警", tableRowsForCsv(body.sections.low_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"]));
  appendCsvSection(lines, "备注", [["内容"], ...(body.notes || []).map((note) => [note])]);
  return lines.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function reportCenterExcel(body) {
  const summaryRows = [
    ["指标", "数值"],
    ["今日订单", body.summary.today_orders],
    ["本月订单", body.summary.month_orders],
    ["红灯订单", body.summary.red_orders],
    ["黄灯订单", body.summary.yellow_orders],
    ["绿灯订单", body.summary.green_orders],
    ["缺料订单", body.summary.shortage_orders],
    ["临期订单", body.summary.due_soon_orders],
    ["待报价", body.summary.pending_quote_projects],
    ["低库存", body.summary.low_stock]
  ];
  const generatedAt = formatDateTime(body.generated_at);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: "Microsoft YaHei", Arial, sans-serif; color: #172033; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    h2 { font-size: 15px; margin: 18px 0 6px; }
    .meta { color: #667085; margin-bottom: 14px; }
    table { border-collapse: collapse; margin-bottom: 14px; }
    th { background: #d9ead3; font-weight: 700; }
    th, td { border: 1px solid #9aa4b2; padding: 6px 8px; mso-number-format:"\\@"; }
    .danger { background: #fce4e4; }
    .warning { background: #fff2cc; }
  </style>
</head>
<body>
  <h1>蕴杰金属 PMC 日报</h1>
  <div class="meta">生成时间：${escapeHtml(generatedAt)}</div>
  ${excelTable("指标汇总", summaryRows)}
  ${excelTable("订单状态样本", tableRowsForCsv(body.sections.order_rows, ["status_light", "order_no", "customer", "owner", "amount", "due_status", "shortage_status"]))}
  ${excelTable("待报价项目", tableRowsForCsv(body.sections.pending_quotes, ["project_no", "title", "customer", "project_stage", "estimated_amount"]))}
  ${excelTable("低库存预警", tableRowsForCsv(body.sections.low_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"]))}
  ${excelTable("备注", [["内容"], ...(body.notes || []).map((note) => [note])])}
</body>
</html>`;
}

function excelTable(title, rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) {
    return "";
  }
  return `<h2>${escapeHtml(title)}</h2><table>${safeRows.map((row, rowIndex) => {
    const tag = rowIndex === 0 ? "th" : "td";
    return `<tr>${row.map((cell) => `<${tag}>${escapeHtml(cell ?? "")}</${tag}>`).join("")}</tr>`;
  }).join("")}</table>`;
}

function appendCsvSection(lines, title, rows) {
  if (lines.length) {
    lines.push([]);
  }
  lines.push([title]);
  lines.push(...rows);
}

function tableRowsForCsv(rows, columns) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return [
    columns.map(labelFor),
    ...safeRows.map((row) => columns.map((column) => row?.[column] ?? ""))
  ];
}

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function querySystemStatus(params = {}) {
  const startedAt = Date.now();
  let erpStatus;
  const shouldCheckErp = parseBoolean(params.check_erp) || !ERP_PROTECTION_MODE;
  if (!shouldCheckErp) {
    erpStatus = {
      ok: null,
      message: "ERP保护模式已开启，未主动登录检测。",
      latency_ms: 0,
      session_tail: ""
    };
  } else {
    try {
      const session = await client.login();
      erpStatus = {
        ok: true,
        message: "ERP 登录接口正常",
        latency_ms: Date.now() - startedAt,
        session_tail: session ? String(session).slice(-6) : ""
      };
    } catch (error) {
      erpStatus = {
        ok: false,
        message: summarizeDataSourceError(error),
        latency_ms: Date.now() - startedAt,
        session_tail: ""
      };
    }
  }
  const snapshot = latestPmcSnapshot();
  const syncRuns = latestSyncRuns();
  const syncPolicyRows = buildSyncPolicyRows({
    latestRuns: syncRuns,
    cooldownSeconds: DEFAULT_SYNC_COOLDOWN_SECONDS
  });
  const modules = [
    ["PMC 驾驶舱", "/pmc", snapshot ? "可用：支持本地快照" : "可用：无快照时显示离线空看板"],
    ["角色工作台", "/roles", "可用：老板/PMC/销售入口和日常流程"],
    ["订单管理中心", "/orders", "可用：默认读取本地快照，支持刷新实时订单"],
    ["物料控制中心", "/materials", "可用：默认读取本地快照，支持统一物料任务"],
    ["采购跟催中心", "/procurement", "可用：入库/应付数据源局部容错"],
    ["应收应付中心", "/finance", "可用：应收/应付数据源局部容错"],
    ["排产甘特视图", "/scheduling", "可用：默认读取本地快照，支持插单影响评估"],
    ["派工进度追踪", "/dispatch", "可用：读取 ERP 工序计划，显示派工单ID和延期派工"],
    ["异常管理中心", "/exceptions", "可用：默认读取本地快照，支持统一待办"],
    ["报表中心", "/reports", "可用：支持快照、CSV、Excel、打印版"]
  ];

  return {
    header: { status: 0, message: "ok" },
    body: {
      model: "system_status",
      generated_at: new Date().toISOString(),
      summary: {
        erp_online: erpStatus.ok === null ? null : erpStatus.ok ? 1 : 0,
        erp_protection_mode: ERP_PROTECTION_MODE ? "开启" : "关闭",
        erp_latency_ms: erpStatus.latency_ms,
        has_snapshot: snapshot ? 1 : 0,
        module_count: modules.length,
        sync_sources: syncRuns.length,
        sync_failures: syncRuns.filter((row) => row.status === "failed").length,
        sync_in_cooldown: syncPolicyRows.filter((row) => row.health_status === "冷却中").length
      },
      sections: {
        erp_status: [erpStatus],
        snapshot: snapshot
          ? [{
              created_at: snapshot.created_at,
              today_orders: snapshot.summary.today_orders,
              month_orders: snapshot.summary.month_orders,
              overdue_orders: snapshot.summary.overdue_orders,
              shortage_orders: snapshot.summary.shortage_orders,
              low_stock: snapshot.summary.low_stock
            }]
          : [],
        modules: modules.map(([name, path, status]) => ({ name, path, status })),
        sync_runs: syncRuns,
        sync_policy: syncPolicyRows
      },
      notes: [
        erpStatus.ok === null ? erpStatus.message : erpStatus.ok ? "ERP 实时接口当前可用。" : `ERP 实时接口当前不可用：${erpStatus.message}`,
        snapshot ? `最近本地快照时间：${formatDateTime(snapshot.created_at)}。` : "当前没有本地驾驶舱快照。",
        syncRuns.length ? "最近同步状态来自本地 SQLite sync_runs 表。" : "当前还没有业务数据同步记录。",
        "此页面默认只读本地状态；点击“检测ERP登录”才会访问 ERP 登录接口。"
      ]
    }
  };
}

function systemStatusPage(body) {
  const erpOnlineText = body.summary.erp_online === null ? "未检测" : body.summary.erp_online ? "是" : "否";
  return modulePage({
    title: "数据源状态中心",
    subtitle: "查看 ERP 登录接口、本地 SQLite 快照和关键业务页面的可用状态。",
    summary: [
      ["ERP在线", erpOnlineText],
      ["保护模式", body.summary.erp_protection_mode],
      ["ERP耗时ms", body.summary.erp_latency_ms],
      ["本地快照", body.summary.has_snapshot ? "有" : "无"],
      ["同步源", body.summary.sync_sources],
      ["同步失败", body.summary.sync_failures],
      ["冷却中", body.summary.sync_in_cooldown],
      ["业务入口", body.summary.module_count]
    ],
    panels: [
      modulePanel("ERP 登录状态", body.sections.erp_status, ["ok", "message", "latency_ms", "session_tail"]),
      modulePanel("最近驾驶舱快照", body.sections.snapshot, ["created_at", "today_orders", "month_orders", "overdue_orders", "shortage_orders", "low_stock"]),
      modulePanel("同步策略", body.sections.sync_policy, ["label", "recommended_interval", "risk_level", "last_status", "last_rows", "last_finished_at", "next_allowed_at", "health_status", "action"]),
      modulePanel("最近同步状态", body.sections.sync_runs, ["source_key", "started_at", "finished_at", "status", "rows_synced", "error_message"]),
      modulePanel("业务入口状态", body.sections.modules, ["name", "path", "status"])
    ],
    notes: body.notes,
    actions: [
      ["谨慎同步订单20条", "/sync?sources=sales_orders&pagesize=20"],
      ["检测ERP登录", "/system?check_erp=1"],
      ["刷新状态", "/system"],
      ["PMC驾驶舱", "/pmc"]
    ]
  });
}

function syncStatusPage(body) {
  return modulePage({
    title: "数据同步",
    subtitle: "手动同步 ERP 核心数据到本地 SQLite，页面优先读取本地业务表。",
    summary: [
      ["同步源", body.results.length],
      ["成功", body.results.filter((row) => row.status === "success").length],
      ["跳过", body.results.filter((row) => row.status === "skipped").length],
      ["失败", body.results.filter((row) => row.status === "failed").length],
      ["同步行数", body.results.reduce((sum, row) => sum + (Number(row.rows_synced) || 0), 0)]
    ],
    panels: [
      modulePanel("本次同步", body.results, ["source_key", "started_at", "finished_at", "status", "rows_synced", "error_message"]),
      modulePanel("最近同步状态", body.latest || latestSyncRuns(), ["source_key", "started_at", "finished_at", "status", "rows_synced", "error_message"])
    ],
    notes: [
      "ERP保护模式下，服务启动不会自动同步；本页默认只同步销售订单20条。",
      "同一个同步源默认 5 分钟内重复点击会跳过，不访问 ERP；确认 ERP 稳定时可在链接后加 force_sync=1。",
      "同步失败不会清空旧数据，业务页面继续显示最近一次成功数据。"
    ],
    actions: [["再次同步订单20条", "/sync?sources=sales_orders&pagesize=20"], ["强制同步订单20条", "/sync?sources=sales_orders&pagesize=20&force_sync=1"], ["系统状态", "/system"]]
  });
}

function pmcGoalPage() {
  const rows = [
    ["PMC驾驶舱首页", "已完成V1", "KPI、逾期、临期、缺料、待报价、低库存"],
    ["角色工作台", "已完成V1", "老板、PMC、销售常用入口和日常处理流程"],
    ["订单管理中心", "已完成V1", "订单作战清单、状态灯、阻塞点、下一步动作、订单详情穿透"],
    ["物料控制中心", "已完成V1", "缺料、低库存、冻结、长库龄统一物料处理清单"],
    ["待报价中心", "已完成V1", "项目/商机报价跟进池，含优先级、负责人汇总和处理建议"],
    ["生产进度中心", "已完成V1", "ERP生产进度、领料、BOM、工序计划，含延期工序和工作中心负荷"],
    ["派工进度追踪", "已完成V1", "基于 ERP 工序计划显示派工单ID、工序计划、完成数量、剩余数量和延期派工"],
    ["异常管理中心", "已完成V1", "交期、缺料、库存、报价统一异常待办池，含优先级和责任角色"],
    ["报表中心", "已完成V1", "管理指标汇总、打印版、CSV导出、Excel日报导出"],
    ["排产甘特图", "已完成V1", "按订单交期生成时间轴、交期压力分布和插单影响评估"],
    ["采购跟催", "已完成V1", "入库流水、应付付款、供应商汇总、跟催优先级和处理建议"],
    ["应收应付", "已完成V1", "聚合应收/应付、客户欠款排行、逾期应收、7天内应付、付款条件推算"],
    ["数据源状态", "已完成V1入口", "轻量检查 ERP 登录、本地快照、业务入口可用性"],
    ["图形化首页", "已完成V1", "按日常业务、管理输出、系统/API 分组，并显示关键快照指标"],
    ["权限登录", "暂缓", "当前按用户要求为内网免登录版"]
  ];
  return modulePage({
    title: "PMC 全功能路线",
    subtitle: "目标是逐步实现 KIMI 设计文档中的完整 PMC 平台；先用智邦 ERP API 和 SQLite 做内网免登录 V1。",
    summary: [
      ["已完成V1", 15],
      ["待开发V2", 0],
      ["暂缓项", 1]
    ],
    panels: [
      `<section class="panel"><h2>功能路线 <span class="pill">${rows.length}</span></h2><div class="table-wrap"><table><thead><tr><th>模块</th><th>状态</th><th>说明</th></tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>`
    ],
    notes: [
      "短期优先：让老板/PMC/销售能看到真实订单、交期、缺料、库存和待报价。",
      "中期重点：补采购订单和供应商跟催，再做排产甘特图。",
      "长期重点：权限、审批、通知、月报模板、移动端适配。"
    ]
  });
}

function queryLocalPmcDashboard(params = {}) {
  const limit = clampInt(params.local_limit || 1000, 1, 5000);
  const salesOrders = listSalesOrders({ limit });
  if (!salesOrders.length) {
    return null;
  }
  const materialAlerts = listMaterialAlerts({ limit });
  return buildLocalPmcDashboard({
    today: params.today ? new Date(params.today) : new Date(),
    salesOrders,
    materialAlerts
  });
}

async function queryPmcConsole(params = {}) {
  const refresh = parseBoolean(params.refresh);
  if (!refresh) {
    const localDashboard = queryLocalPmcDashboard(params);
    if (localDashboard) {
      return {
        header: { status: 0, message: "ok" },
        body: localDashboard
      };
    }
  }

  const cached = latestPmcSnapshot();
  if (!refresh && cached && Date.now() - new Date(cached.created_at).getTime() < 5 * 60 * 1000) {
    return {
      header: { status: 0, message: "ok" },
      body: {
        ...cached.payload,
        cached: true,
        cache_created_at: cached.created_at
      }
    };
  }

  const today = startOfDay(params.today ? new Date(params.today) : new Date());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const dashboardParams = {
    scan_pages: params.scan_pages || 1,
    scan_size: params.scan_size || 20,
    contract_limit: params.contract_limit || 3,
    alert_limit: params.alert_limit || 10,
    low_stock_threshold: params.low_stock_threshold || 5,
    old_stock_days: params.old_stock_days || 180,
    due_soon_days: params.due_soon_days || 7,
    quote_limit: params.quote_limit || 10,
    today: formatDate(today)
  };

  try {
    const [dashboard, todayOrders, monthOrders] = await Promise.all([
      queryPmcDashboard(dashboardParams),
      querySalesOrderCount({ dateQD_0: formatDate(today), dateQD_1: formatDate(today) }),
      querySalesOrderCount({ dateQD_0: formatDate(monthStart), dateQD_1: formatDate(monthEnd) })
    ]);

    const source = dashboard.body;
    const summary = {
      today_orders: todayOrders.count,
      month_orders: monthOrders.count,
      overdue_orders: uniqueCount(source.sections.overdue_delivery_rows || [], "order_no"),
      due_soon_orders: uniqueCount(source.sections.due_soon_delivery_rows || [], "order_no"),
      shortage_orders: source.summary.order_shortage_orders || 0,
      pending_quote_projects: source.summary.pending_quote_projects || 0,
      low_stock: source.summary.low_stock || 0
    };

    const body = {
      model: "pmc_console",
      generated_at: new Date().toISOString(),
      scan: {
        today: formatDate(today),
        month_start: formatDate(monthStart),
        month_end: formatDate(monthEnd),
        dashboard: dashboardParams
      },
      summary,
      sections: {
        overdue_orders: source.sections.overdue_delivery_rows || [],
        due_soon_orders: source.sections.due_soon_delivery_rows || [],
        shortage_orders: source.sections.order_shortage_rows || [],
        pending_quotes: source.sections.pending_quotes || [],
        low_stock: source.sections.low_stock || []
      },
      source_status: {
        ...source.source_status,
        today_orders: todayOrders,
        month_orders: monthOrders
      },
      notes: [
        "PMC 驾驶舱面向老板、PMC、销售共用，第一版聚焦订单、交期、缺料、待报价和低库存。",
        "物料齐套第一版按销售订单产品库存计算，不做 BOM 展开；车间报工继续使用 ERP。"
      ]
    };

    savePmcSnapshot(body);
    return {
      header: { status: 0, message: "ok" },
      body
    };
  } catch (error) {
    const message = summarizeDataSourceError(error);
    const fallback = latestPmcSnapshot();
    if (fallback) {
      return {
        header: { status: 0, message: "using local snapshot" },
        body: {
          ...fallback.payload,
          cached: true,
          offline: true,
          generated_at: new Date().toISOString(),
          cache_created_at: fallback.created_at,
          source_status: {
            ...(fallback.payload.source_status || {}),
            erp_realtime: { ok: false, message }
          },
          notes: [
            `ERP 数据源暂不可用：${message}`,
            `当前显示本地快照，快照时间：${formatDateTime(fallback.created_at)}。`,
            ...(fallback.payload.notes || [])
          ]
        }
      };
    }
    return {
      header: { status: 0, message: "offline empty dashboard" },
      body: emptyPmcConsoleBody({
        today,
        monthStart,
        monthEnd,
        dashboardParams,
        message
      })
    };
  }
}

function emptyPmcConsoleBody({ today, monthStart, monthEnd, dashboardParams, message }) {
  return {
    model: "pmc_console",
    generated_at: new Date().toISOString(),
    offline: true,
    scan: {
      today: formatDate(today),
      month_start: formatDate(monthStart),
      month_end: formatDate(monthEnd),
      dashboard: dashboardParams
    },
    summary: {
      today_orders: null,
      month_orders: null,
      overdue_orders: 0,
      due_soon_orders: 0,
      shortage_orders: 0,
      pending_quote_projects: 0,
      low_stock: 0
    },
    sections: {
      overdue_orders: [],
      due_soon_orders: [],
      shortage_orders: [],
      pending_quotes: [],
      low_stock: []
    },
    source_status: {
      erp_realtime: { ok: false, message }
    },
    notes: [
      `ERP 数据源暂不可用：${message}`,
      "本地还没有可用快照；请稍后刷新驾驶舱。"
    ]
  };
}

async function querySalesOrderCount(params) {
  try {
    const result = await client.queryView("sales_orders", {
      ...params,
      pageindex: "1",
      pagesize: "1"
    });
    const table = normalizeTable(result);
    const page = table.page || {};
    return {
      ok: true,
      count: Number(page.recordcount ?? page.RecordCount ?? table.rows.length ?? 0),
      page
    };
  } catch (error) {
    return {
      ok: false,
      count: null,
      message: error.message
    };
  }
}

function uniqueCount(rows, key) {
  return new Set(rows.map((row) => row?.[key]).filter(Boolean)).size;
}

function firstNumber(...values) {
  for (const value of values) {
    const number = parseNumber(value);
    if (number !== null) {
      return number;
    }
  }
  return null;
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function parseJson(value, fallback = null) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function formatNumber(value) {
  const number = parseNumber(value);
  if (number === null) {
    return value ?? "";
  }
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(4)));
}

function parseDate(value) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  const yearMatch = text.match(/^(\d{4})-/);
  if (yearMatch && Number(yearMatch[1]) < 2000) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) {
    return null;
  }
  return date;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${formatDate(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function parseBoolean(value) {
  if (value === true || value === 1) {
    return true;
  }
  const text = value === undefined || value === null ? "" : String(value).trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`数据源响应超过 ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

function clampInt(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.max(min, Math.min(max, number));
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
            "pmc_dashboard",
            "pmc_console",
            "order_center",
            "order_detail"
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
        user: "打开这个订单的穿透详情",
        call: { view: "order_detail", filters: { ord: 12345, due_soon_days: 7, scan_size: 100 } }
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
      },
      {
        user: "打开 PMC 驾驶舱首页",
        call: { view: "pmc_console", filters: { scan_pages: 1, scan_size: 20, contract_limit: 3, alert_limit: 10 } }
      },
      {
        user: "查看订单管理中心",
        call: { view: "order_center", filters: { pageindex: 1, pagesize: 20, contract_limit: 10, due_soon_days: 7 } }
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
