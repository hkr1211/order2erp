export const SQLITE_TABLES = [
  { table_name: "pmc_dashboard_snapshots", label: "PMC驾驶舱快照", timestamp_column: "created_at", sync_source: "pmc_snapshot", incremental: "否", suggested_range: "保留最近30-90天快照" },
  { table_name: "erp_sales_orders", label: "销售订单", timestamp_column: "synced_at", sync_source: "sales_orders", incremental: "部分支持", suggested_range: "未交付订单 + 近90天订单，夜间补近1年" },
  { table_name: "erp_material_alerts", label: "物料/库存告警", timestamp_column: "synced_at", sync_source: "material_alerts", incremental: "否", suggested_range: "当前缺料和低库存，每15-30分钟小批量刷新" },
  { table_name: "erp_procedure_plans", label: "派工/工序计划", timestamp_column: "synced_at", sync_source: "procedure_plans", incremental: "部分支持", suggested_range: "未完工派工 + 近90天工序" },
  { table_name: "erp_quote_followups", label: "待报价项目", timestamp_column: "synced_at", sync_source: "quote_projects", incremental: "部分支持", suggested_range: "未报价/未关闭项目 + 近180天" },
  { table_name: "erp_finance_records", label: "应收应付", timestamp_column: "synced_at", sync_source: "finance_records", incremental: "部分支持", suggested_range: "未结清单据 + 近1年" },
  { table_name: "sync_runs", label: "同步记录", timestamp_column: "finished_at", sync_source: "internal", incremental: "本地自动", suggested_range: "保留全部或近1年" },
  { table_name: "erp_request_logs", label: "ERP请求日志", timestamp_column: "requested_at", sync_source: "internal", incremental: "本地自动", suggested_range: "保留近30天或最近5000条" }
];

export const SQLITE_PAGE_DEPENDENCIES = [
  { page_name: "PMC驾驶舱", page_path: "/pmc", tables: ["pmc_dashboard_snapshots", "erp_sales_orders", "erp_material_alerts", "erp_quote_followups"], missing_sources: ["合同明细全量", "采购在途"] },
  { page_name: "订单管理中心", page_path: "/orders", tables: ["erp_sales_orders", "erp_material_alerts"], missing_sources: ["合同明细历史", "订单交期风险明细"] },
  { page_name: "订单详情", page_path: "/order", tables: ["erp_sales_orders", "erp_material_alerts"], missing_sources: ["合同明细本地表", "质检/物流记录"] },
  { page_name: "物料控制中心", page_path: "/materials", tables: ["erp_material_alerts"], missing_sources: ["库存余额全量", "BOM展开", "采购在途"] },
  { page_name: "生产进度中心", page_path: "/production", tables: ["erp_procedure_plans"], missing_sources: ["生产进度历史", "领料历史", "BOM本地表"] },
  { page_name: "派工进度追踪", page_path: "/dispatch", tables: ["erp_procedure_plans"], missing_sources: ["报工完成历史", "设备状态"] },
  { page_name: "排产甘特视图", page_path: "/scheduling", tables: ["pmc_dashboard_snapshots", "erp_sales_orders", "erp_material_alerts"], missing_sources: ["设备产能日历", "模具/人员约束"] },
  { page_name: "采购跟催中心", page_path: "/procurement", tables: [], missing_sources: ["采购订单本地表", "供应商档案", "入库流水本地表"] },
  { page_name: "待报价中心", page_path: "/quotes", tables: ["erp_quote_followups"], missing_sources: ["报价单历史", "跟进记录"] },
  { page_name: "应收应付中心", page_path: "/finance", tables: ["erp_finance_records"], missing_sources: ["收付款明细历史", "账期配置"] },
  { page_name: "异常管理中心", page_path: "/exceptions", tables: ["erp_sales_orders", "erp_material_alerts", "erp_quote_followups"], missing_sources: ["异常处理记录", "责任人配置"] },
  { page_name: "报表中心", page_path: "/reports", tables: ["pmc_dashboard_snapshots", "erp_sales_orders", "erp_material_alerts", "erp_quote_followups"], missing_sources: ["历史月报宽表", "供应商绩效"] },
  { page_name: "系统状态中心", page_path: "/system", tables: ["sync_runs", "erp_request_logs"], missing_sources: [] },
  { page_name: "ERP请求日志", page_path: "/erp-logs", tables: ["erp_request_logs"], missing_sources: [] }
];

export function buildSqliteCoverage({ tableStats = {}, latestSyncRuns = [] } = {}) {
  const syncBySource = new Map(latestSyncRuns.map((row) => [row.source_key, row]));
  const tables = SQLITE_TABLES.map((table) => {
    const stats = tableStats[table.table_name] || { row_count: 0, latest_at: "" };
    const sync = syncBySource.get(table.sync_source) || null;
    return {
      ...table,
      row_count: Number(stats.row_count) || 0,
      latest_at: stats.latest_at || "",
      last_sync_status: sync?.status || (table.sync_source === "internal" || table.sync_source === "pmc_snapshot" ? "本地生成" : "无同步记录"),
      last_sync_finished_at: sync?.finished_at || "",
      last_sync_error: sync?.error_message || ""
    };
  });
  const tableByName = new Map(tables.map((table) => [table.table_name, table]));
  const pages = SQLITE_PAGE_DEPENDENCIES.map((page) => {
    const dependencyTables = page.tables.map((tableName) => tableByName.get(tableName)).filter(Boolean);
    const emptyTables = dependencyTables.filter((table) => table.row_count <= 0);
    const missingSources = [
      ...page.missing_sources,
      ...emptyTables.map((table) => `${table.label}为空`)
    ];
    return {
      page_name: page.page_name,
      page_path: page.page_path,
      sqlite_tables: page.tables.join(", "),
      table_rows: dependencyTables.map((table) => `${table.table_name}:${table.row_count}`).join(", "),
      latest_sync_at: latestTime(dependencyTables.map((table) => table.latest_at || table.last_sync_finished_at)),
      incremental_support: summarizeIncremental(dependencyTables),
      suggested_range: summarizeRanges(dependencyTables),
      missing_sources: missingSources.join("；"),
      coverage_status: page.tables.length === 0 || emptyTables.length || page.missing_sources.length ? "缺数据" : "可用"
    };
  });
  return {
    summary: {
      pages: pages.length,
      tables: tables.length,
      available_pages: pages.filter((row) => row.coverage_status === "可用").length,
      missing_pages: pages.filter((row) => row.coverage_status !== "可用").length,
      empty_tables: tables.filter((row) => row.row_count <= 0).length
    },
    pages,
    tables
  };
}

function latestTime(values) {
  return values.filter(Boolean).sort().at(-1) || "";
}

function summarizeIncremental(tables) {
  const values = [...new Set(tables.map((table) => table.incremental).filter(Boolean))];
  return values.length ? values.join(" / ") : "待建本地表";
}

function summarizeRanges(tables) {
  const values = [...new Set(tables.map((table) => table.suggested_range).filter(Boolean))];
  return values.length ? values.join("；") : "先建本地同步源";
}
