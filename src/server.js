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

      return sendJson(res, 200, {
        view: viewName,
        business: toBusinessView(viewName, normalized),
        normalized,
        raw: result
      });
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
