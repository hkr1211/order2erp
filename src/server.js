import http from "node:http";
import fs from "node:fs";
import { ErpClient, ERP_VIEWS, normalizeTable, toBusinessView } from "./erpClient.js";

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
          inventory_alerts: {
            name: "库存异常视图",
            allowedParams: ["cks", "searchKey", "title", "order1", "scan_size", "scan_pages", "alert_limit", "low_stock_threshold", "old_stock_days"]
          },
          pmc_dashboard: {
            name: "PMC综合看板",
            allowedParams: ["searchKey", "pageindex", "pagesize", "scan_size", "scan_pages", "alert_limit", "low_stock_threshold", "old_stock_days", "today"]
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
          : viewName === "inventory_alerts"
            ? await client.queryInventoryAlerts(params)
          : viewName === "pmc_dashboard"
            ? await client.queryPmcDashboard(params)
          : await client.queryView(viewName, params);

      const normalized =
        viewName === "pmc_exceptions" ||
        viewName === "contract_lines" ||
        viewName === "contract_shortages" ||
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
        call: { view: "contract_shortages", filters: { ord: 12345, scan_pages: 5, scan_size: 100 } }
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
        call: { view: "pmc_dashboard", filters: { scan_pages: 2, scan_size: 50, alert_limit: 20, low_stock_threshold: 5, old_stock_days: 180 } }
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
