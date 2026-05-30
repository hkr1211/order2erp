import { clampInt } from "../displayUtils.js";
import { HISTORY_SYNC_SOURCES, buildHistorySyncProgress, defaultHistoryRange, historySyncParams } from "../historySync.js";
import { initLocalDb, latestErpRequestLogs, latestHistorySyncRuns, latestSyncRuns, tableStats } from "../localDb.js";
import { SQLITE_TABLES, buildSqliteCoverage } from "../sqliteCoverage.js";

export function createSystemQueries({ erpRequestMinIntervalMs }) {
  function queryErpRequestLogCenter(params = {}) {
    const status = params.status || "";
    const pathFilter = params.path || "";
    const limit = clampInt(params.limit || 100, 1, 500);
    const rows = latestErpRequestLogs({ status, path: pathFilter, limit });
    const failedRows = rows.filter((row) => row.status === "failed");
    const averageDuration = rows.length
      ? Math.round(rows.reduce((sum, row) => sum + (Number(row.duration_ms) || 0), 0) / rows.length)
      : 0;
    const byPath = summarizeErpLogsByPath(rows);
    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "erp_request_logs",
        generated_at: new Date().toISOString(),
        filters: { status, path: pathFilter, limit },
        summary: {
          request_logs: rows.length,
          failed_logs: failedRows.length,
          success_logs: rows.filter((row) => row.status === "success").length,
          average_duration_ms: averageDuration,
          paths: byPath.length
        },
        rows,
        sections: {
          failed_logs: failedRows,
          by_path: byPath
        },
        notes: [
          "本页只读取本地 SQLite erp_request_logs 表，不访问 ERP。",
          "如果 ERP 卡死或 503，优先查看失败请求的 path 和 error_message。"
        ]
      }
    };
  }

  function querySqliteCoverage() {
    const stats = Object.fromEntries(SQLITE_TABLES.map((table) => [
      table.table_name,
      coverageTableStats(table)
    ]));
    const coverage = buildSqliteCoverage({
      tableStats: stats,
      latestSyncRuns: latestSyncRuns()
    });
    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "sqlite_coverage",
        generated_at: new Date().toISOString(),
        ...coverage,
        notes: [
          "本页只读取本地 SQLite 元数据和同步记录，不访问 ERP。",
          "覆盖率为“缺数据”不代表页面不能打开，而是说明该页面仍有数据源缺口或本地表为空。",
          "下一步可按本页建议范围开发低频、分批、可恢复的历史同步任务。"
        ]
      }
    };
  }

  function queryHistorySyncCenter(params = {}) {
    const range = defaultHistoryRange(params.today ? new Date(params.today) : new Date());
    const progressRows = buildHistorySyncProgress({
      sources: HISTORY_SYNC_SOURCES,
      latestRuns: latestHistorySyncRuns()
    });
    const sourceRows = HISTORY_SYNC_SOURCES.map((source) => {
      const plan = historySyncParams({
        source: source.source,
        start_date: params.start_date || range.start_date,
        end_date: params.end_date || range.end_date,
        pageindex: 1,
        pagesize: params.pagesize || 20
      });
      const queryString = `source=${encodeURIComponent(source.source)}&start_date=${encodeURIComponent(plan.range.start_date)}&end_date=${encodeURIComponent(plan.range.end_date)}&pageindex=1&pagesize=${plan.pageSize}`;
      const dryRunHref = `/history-sync/dry-run?${queryString}`;
      const windowHref = `/history-sync/window?${queryString}&max_pages=3&delay_ms=5000`;
      const runHref = `/history-sync/run?${queryString}`;
      return {
        source: source.source,
        label: source.label,
        date_support: source.dateSupport,
        suggested_range: source.suggestedRange,
        page_size: plan.pageSize,
        start_date: plan.range.start_date,
        end_date: plan.range.end_date,
        safety: source.riskNote,
        latest_progress: progressRows.find((row) => row.source === source.source)?.next_action || "从第 1 页开始",
        dry_run: dryRunHref,
        safe_window: windowHref,
        run: runHref
      };
    });
    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "history_sync_center",
        generated_at: new Date().toISOString(),
        summary: {
          sources: sourceRows.length,
          days: 90,
          page_size: clampInt(params.pagesize || 20, 1, 20),
          request_interval_ms: erpRequestMinIntervalMs,
          circuit_breaker: "开启"
        },
        rows: sourceRows,
        progress: progressRows,
        notes: [
          "本页默认不执行同步，只生成安全补数入口。",
          "点击执行时每次只同步一页，最大20条；成功后再点下一页继续。",
          "所有请求仍经过 ERP 队列、请求间隔、冷却和熔断保护。"
        ]
      }
    };
  }

  return { queryErpRequestLogCenter, queryHistorySyncCenter, querySqliteCoverage };
}

function summarizeErpLogsByPath(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row.path || "unknown";
    const current = grouped.get(key) || {
      path: key,
      requests: 0,
      failed: 0,
      average_duration_ms: 0,
      total_duration_ms: 0,
      last_status: "",
      last_requested_at: ""
    };
    current.requests += 1;
    current.total_duration_ms += Number(row.duration_ms) || 0;
    if (row.status === "failed") {
      current.failed += 1;
    }
    if (!current.last_requested_at || row.requested_at > current.last_requested_at) {
      current.last_status = row.status;
      current.last_requested_at = row.requested_at;
    }
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map((row) => ({
      ...row,
      average_duration_ms: Math.round(row.total_duration_ms / row.requests)
    }))
    .sort((a, b) => b.failed - a.failed || b.requests - a.requests)
    .map(({ total_duration_ms, ...row }) => row);
}

function coverageTableStats(table) {
  const stats = tableStats(table.table_name, table.timestamp_column);
  if (!table.coverage_date_column) {
    return stats;
  }
  const database = initLocalDb();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table.table_name) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table.coverage_date_column)) {
    return stats;
  }
  const range = database
    .prepare(`SELECT MIN(${table.coverage_date_column}) AS min_date, MAX(${table.coverage_date_column}) AS max_date FROM ${table.table_name} WHERE ${table.coverage_date_column} IS NOT NULL AND ${table.coverage_date_column} != ''`)
    .get();
  return {
    ...stats,
    min_date: range?.min_date || "",
    max_date: range?.max_date || ""
  };
}
