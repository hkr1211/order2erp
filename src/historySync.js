import { normalizeTable, toBusinessView } from "./erpClient.js";
import { upsertProcedurePlans, upsertSalesOrders } from "./localDb.js";
import { mapProcedurePlan, mapSalesOrder } from "./syncService.js";

export const HISTORY_SYNC_SOURCES = [
  {
    source: "sales_orders",
    label: "销售订单",
    viewName: "sales_orders",
    dateSupport: "支持签订日期 dateQD_0/dateQD_1",
    suggestedRange: "最近90天 + 未交付订单",
    riskNote: "每次只拉一页20条，按日期过滤，写入 SQLite upsert。"
  },
  {
    source: "procedure_plans",
    label: "派工/工序计划",
    viewName: "procedure_plans",
    dateSupport: "接口暂未确认日期参数",
    suggestedRange: "先按页小批量补齐，再确认日期字段后改增量",
    riskNote: "每次只拉一页20条，不带日期过滤，写入 SQLite upsert。"
  }
];

export function defaultHistoryRange(now = new Date()) {
  const end = startOfDay(now);
  const start = new Date(end);
  start.setDate(start.getDate() - 90);
  return {
    start_date: formatDate(start),
    end_date: formatDate(end)
  };
}

export function historySyncParams(options = {}) {
  const sourceConfig = HISTORY_SYNC_SOURCES.find((item) => item.source === options.source) || HISTORY_SYNC_SOURCES[0];
  const pageIndex = clampInt(options.pageindex || options.page_index || 1, 1, 100000);
  const pageSize = clampInt(options.pagesize || options.page_size || 20, 1, 20);
  const range = {
    start_date: options.start_date || options.date_start || defaultHistoryRange().start_date,
    end_date: options.end_date || options.date_end || defaultHistoryRange().end_date
  };
  const erpParams = sourceConfig.source === "sales_orders"
    ? {
        pageindex: pageIndex,
        pagesize: pageSize,
        dateQD_0: range.start_date,
        dateQD_1: range.end_date,
        searchKey: options.searchKey || ""
      }
    : {
        page_index: pageIndex,
        page_size: pageSize,
        searchKey: options.searchKey || ""
      };
  return {
    ...sourceConfig,
    pageIndex,
    pageSize,
    range,
    erpParams
  };
}

export function historySyncDryRun(options = {}) {
  const plan = historySyncParams(options);
  return {
    generated_at: new Date().toISOString(),
    source: plan.source,
    label: plan.label,
    view_name: plan.viewName,
    page_index: plan.pageIndex,
    page_size: plan.pageSize,
    start_date: plan.range.start_date,
    end_date: plan.range.end_date,
    erp_params_json: JSON.stringify(plan.erpParams),
    safety: plan.riskNote,
    will_access_erp: "否",
    notes: [
      "这是预演模式，不访问 ERP，不写 SQLite。",
      "确认参数无误后，再点击执行单页同步。",
      "真实执行仍会经过队列、请求间隔、冷却和熔断保护。"
    ]
  };
}

export function historySyncWindowParams(options = {}) {
  const plan = historySyncParams(options);
  const maxPages = clampInt(options.max_pages || options.maxPages || 2, 1, 5);
  const delayMs = clampInt(options.delay_ms || options.delayMs || 5000, 5000, 60000);
  const pages = Array.from({ length: maxPages }, (_, index) => {
    const pageIndex = plan.pageIndex + index;
    return {
      source: plan.source,
      label: plan.label,
      page_index: pageIndex,
      page_size: plan.pageSize,
      start_date: plan.range.start_date,
      end_date: plan.range.end_date,
      dry_run: historySyncHref("/history-sync/dry-run", plan, pageIndex),
      run: historySyncHref("/history-sync/run", plan, pageIndex)
    };
  });
  return {
    generated_at: new Date().toISOString(),
    source: plan.source,
    label: plan.label,
    view_name: plan.viewName,
    startPageIndex: plan.pageIndex,
    pageSize: plan.pageSize,
    start_date: plan.range.start_date,
    end_date: plan.range.end_date,
    maxPages,
    delayMs,
    pages,
    safety: [
      `每次最多连续 ${maxPages} 页，每页最多 ${plan.pageSize} 条。`,
      `两页之间至少等待 ${delayMs}ms。`,
      "执行期间仍会经过 ERP 队列、请求间隔、冷却和熔断保护。"
    ]
  };
}

export async function runHistorySyncBatch(client, options = {}) {
  const plan = historySyncParams(options);
  const response = await client.queryView(plan.viewName, plan.erpParams);
  const table = normalizeTable(response);
  const rows = plan.source === "sales_orders"
    ? toBusinessView("sales_orders", table).rows.map((row, index) => mapSalesOrder(row, index))
    : table.rows.map((row, index) => mapProcedurePlan(row, index));

  if (plan.source === "sales_orders") {
    upsertSalesOrders(rows);
  } else {
    upsertProcedurePlans(rows);
  }

  const hasNext = rows.length >= plan.pageSize;
  return {
    generated_at: new Date().toISOString(),
    source: plan.source,
    label: plan.label,
    status: "success",
    rows_synced: rows.length,
    page_index: plan.pageIndex,
    page_size: plan.pageSize,
    start_date: plan.range.start_date,
    end_date: plan.range.end_date,
    has_next: hasNext,
    next_page_index: hasNext ? plan.pageIndex + 1 : null,
    notes: [
      "本次只执行一个小批次，避免长时间占用 ERP。",
      "数据写入使用 upsert，不会清空旧成功数据。",
      plan.riskNote
    ]
  };
}

export function buildHistorySyncProgress({ sources = HISTORY_SYNC_SOURCES, latestRuns = [] } = {}) {
  return sources.map((source) => {
    const latest = latestRuns.find((row) => row.source === source.source);
    const lastStatus = latest?.status || "未执行";
    const rowsSynced = Number(latest?.rows_synced) || 0;
    const pageIndex = Number(latest?.page_index) || 0;
    const pageSize = Number(latest?.page_size) || 20;
    const hasNext = lastStatus === "success" && rowsSynced >= pageSize;
    const nextPageIndex = hasNext ? pageIndex + 1 : "";
    const nextRun = hasNext
      ? `/history-sync/run?source=${encodeURIComponent(source.source)}&start_date=${encodeURIComponent(latest.start_date || "")}&end_date=${encodeURIComponent(latest.end_date || "")}&pageindex=${nextPageIndex}&pagesize=${pageSize}`
      : "";
    return {
      source: source.source,
      label: source.label,
      last_status: lastStatus,
      last_rows_synced: latest?.rows_synced ?? "",
      last_page_index: latest?.page_index ?? "",
      page_size: latest?.page_size ?? "",
      start_date: latest?.start_date || "",
      end_date: latest?.end_date || "",
      finished_at: latest?.finished_at || "",
      error_message: latest?.error_message || "",
      next_page_index: nextPageIndex,
      next_action: hasNext ? `继续第 ${pageIndex + 1} 页` : lastStatus === "failed" ? "检查错误后重试当前页" : "从第 1 页开始",
      next_run: nextRun
    };
  });
}

function historySyncHref(path, plan, pageIndex) {
  return `${path}?source=${encodeURIComponent(plan.source)}&start_date=${encodeURIComponent(plan.range.start_date)}&end_date=${encodeURIComponent(plan.range.end_date)}&pageindex=${pageIndex}&pagesize=${plan.pageSize}`;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampInt(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.max(min, Math.min(max, number));
}
