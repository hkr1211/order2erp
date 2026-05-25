import { normalizeTable, toBusinessView } from "./erpClient.js";
import { mapFinanceRowForLocal, mapQuoteFollowupForLocal } from "./localAnalytics.js";
import { upsertFinanceRecords, upsertProcedurePlans, upsertProcessReports, upsertQuoteFollowups, upsertSalesOrders } from "./localDb.js";
import { queryPendingQuotes } from "./pendingQuotes.js";
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
  },
  {
    source: "process_reports",
    label: "工序汇报历史",
    viewName: "process_reports",
    dateSupport: "日期参数暂不生效，按页翻取历史汇报",
    suggestedRange: "近90天工序汇报明细，按页小批量补齐",
    riskNote: "每次只拉一页20条，通过页码回溯历史，写入 SQLite upsert。"
  },
  {
    source: "quote_projects",
    label: "待报价项目",
    viewName: "quote_projects",
    dateSupport: "支持项目日期 tdate1/tdate2",
    suggestedRange: "最近90天项目，后续可扩为180天",
    riskNote: "每次只拉一页20条，按日期过滤，写入 SQLite upsert。"
  },
  {
    source: "finance_records",
    label: "应收应付",
    viewName: "finance_records",
    dateSupport: "支持单据日期 tdate1/tdate2",
    suggestedRange: "最近90天应收应付，后续可扩为1年",
    riskNote: "每次同步应收和应付各一页，按日期过滤，写入 SQLite upsert。"
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
  const erpParams = historyErpParams(sourceConfig.source, {
    pageIndex,
    pageSize,
    range,
    searchKey: options.searchKey || ""
  });
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

export async function runHistorySyncWindow(options = {}) {
  const plan = historySyncWindowParams(options);
  const runPage = options.runPage;
  if (typeof runPage !== "function") {
    throw new Error("runHistorySyncWindow requires runPage");
  }
  const wait = typeof options.wait === "function" ? options.wait : sleep;
  const results = [];
  let stopReason = "已达到安全窗口页数上限。";

  for (const page of plan.pages) {
    const result = await runPage({
      source: plan.source,
      start_date: plan.start_date,
      end_date: plan.end_date,
      pageindex: page.page_index,
      pagesize: page.page_size
    });
    results.push(result);
    if (!result.has_next || Number(result.rows_synced) < plan.pageSize) {
      stopReason = "最后一页返回不足页大小，窗口已停止。";
      break;
    }
    if (results.length < plan.pages.length) {
      await wait(plan.delayMs);
    }
  }

  return {
    generated_at: new Date().toISOString(),
    source: plan.source,
    label: plan.label,
    status: results.length === plan.pages.length ? "completed" : "stopped",
    pages_executed: results.length,
    rows_synced: results.reduce((sum, row) => sum + (Number(row.rows_synced) || 0), 0),
    start_page_index: plan.startPageIndex,
    page_size: plan.pageSize,
    max_pages: plan.maxPages,
    delay_ms: plan.delayMs,
    stop_reason: stopReason,
    results
  };
}

export async function runHistorySyncBatch(client, options = {}) {
  const plan = historySyncParams(options);
  if (plan.source === "sales_orders") {
    const response = await client.queryView(plan.viewName, plan.erpParams);
    const table = normalizeTable(response);
    const rows = toBusinessView("sales_orders", table).rows.map((row, index) => mapSalesOrder(row, index));
    upsertSalesOrders(rows);
    return historyBatchResult(plan, rows.length);
  }
  if (plan.source === "procedure_plans") {
    const response = await client.queryView(plan.viewName, plan.erpParams);
    const table = normalizeTable(response);
    const rows = table.rows.map((row, index) => mapProcedurePlan(row, index));
    upsertProcedurePlans(rows);
    return historyBatchResult(plan, rows.length);
  }
  if (plan.source === "process_reports") {
    const response = await client.callModern("/webapi/v3/produceV2/processreportlist/detail", plan.erpParams);
    const table = normalizeTable(response);
    const rows = table.rows.map((row, index) => mapProcessReport(row, index, plan));
    upsertProcessReports(rows);
    return historyBatchResult(plan, rows.length);
  }
  if (plan.source === "quote_projects") {
    const pending = await queryPendingQuotes(client, plan.erpParams);
    const today = options.today ? new Date(options.today) : new Date();
    const rows = (pending?.body?.rows || []).map((row) => ({
      ...mapQuoteFollowupForLocal(row, today),
      synced_at: new Date().toISOString()
    }));
    upsertQuoteFollowups(rows);
    return historyBatchResult(plan, rows.length);
  }
  if (plan.source === "finance_records") {
    const today = options.today ? new Date(options.today) : new Date();
    const [receivableResult, payableResult] = await Promise.allSettled([
      client.queryView("receivables", plan.erpParams.receivables),
      client.queryView("payables", plan.erpParams.payables)
    ]);
    if (receivableResult.status === "rejected" && payableResult.status === "rejected") {
      throw new Error(`${summarizeError(receivableResult.reason)}；${summarizeError(payableResult.reason)}`);
    }
    const receivableRows = receivableResult.status === "fulfilled" ? normalizeTable(receivableResult.value).rows : [];
    const payableRows = payableResult.status === "fulfilled" ? normalizeTable(payableResult.value).rows : [];
    const rows = [
      ...receivableRows.map((row, index) => ({
        record_id: `receivable-${row.id || row.billno || row.order1 || `${plan.pageIndex}-${index}`}`,
        ...mapFinanceRowForLocal(row, "receivable", today),
        synced_at: new Date().toISOString()
      })),
      ...payableRows.map((row, index) => ({
        record_id: `payable-${row.id || row.billno || row.order1 || `${plan.pageIndex}-${index}`}`,
        ...mapFinanceRowForLocal(row, "payable", today),
        synced_at: new Date().toISOString()
      }))
    ];
    upsertFinanceRecords(rows);
    return historyBatchResult(plan, rows.length);
  }
  throw new Error(`Unsupported history sync source: ${plan.source}`);
}

function historyBatchResult(plan, rowsSynced) {
  return {
    generated_at: new Date().toISOString(),
    source: plan.source,
    label: plan.label,
    status: "success",
    rows_synced: rowsSynced,
    page_index: plan.pageIndex,
    page_size: plan.pageSize,
    start_date: plan.range.start_date,
    end_date: plan.range.end_date,
    has_next: rowsSynced >= plan.pageSize,
    next_page_index: rowsSynced >= plan.pageSize ? plan.pageIndex + 1 : null,
    notes: [
      "本次只执行一个小批次，避免长时间占用 ERP。",
      "数据写入使用 upsert，不会清空旧成功数据。",
      plan.riskNote
    ]
  };
}

function historyErpParams(source, { pageIndex, pageSize, range, searchKey }) {
  if (source === "sales_orders") {
    return {
      pageindex: pageIndex,
      pagesize: pageSize,
      dateQD_0: range.start_date,
      dateQD_1: range.end_date,
      searchKey
    };
  }
  if (source === "procedure_plans") {
    return {
      page_index: pageIndex,
      page_size: pageSize,
      searchKey
    };
  }
  if (source === "process_reports") {
    return {
      page_index: pageIndex,
      page_size: pageSize,
      dateStart: range.start_date,
      dateEnd: range.end_date,
      searchKey
    };
  }
  if (source === "quote_projects") {
    return {
      pageindex: pageIndex,
      pagesize: pageSize,
      limit: pageSize,
      include_all: "1",
      tdate1: range.start_date,
      tdate2: range.end_date,
      searchKey
    };
  }
  if (source === "finance_records") {
    const params = {
      pageindex: pageIndex,
      pagesize: pageSize,
      tdate1: range.start_date,
      tdate2: range.end_date,
      searchKey
    };
    return {
      receivables: { ...params },
      payables: { ...params }
    };
  }
  return { pageindex: pageIndex, pagesize: pageSize, searchKey };
}

function summarizeError(error) {
  const message = error?.message || String(error || "未知错误");
  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}

function mapProcessReport(row, index, plan) {
  return {
    report_id: String(row["工序汇报ID"] || `${plan.pageIndex}-${index}`),
    subject: row["单据主题"] || "",
    product_name: row["产品名称"] || "",
    procedure_name: row["加工工序"] || "",
    batch_no: row["批号"] || "",
    serial_no: row["序列号"] || "",
    report_qty: parseNumber(row["汇报数量"]),
    work_hours: parseNumber(row["加工工时"]),
    operator: row["生产人员"] || "",
    machine: row["生产设备"] || "",
    report_result: row["汇报结果"] || "",
    scrap_reason: row["报废原因"] || "",
    creator: row["添加人员"] || "",
    added_at: row["添加时间"] || "",
    audit_status: row["审核状态"] || "",
    raw: row,
    synced_at: new Date().toISOString()
  };
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
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

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
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
