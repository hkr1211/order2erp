export const SQLITE_TABLES = [
  { table_name: "pmc_dashboard_snapshots", label: "PMC驾驶舱快照", timestamp_column: "created_at", sync_source: "pmc_snapshot", incremental: "否", suggested_range: "保留最近30-90天快照" },
  { table_name: "pmc_intervention_logs", label: "PMC干预记录", timestamp_column: "created_at", sync_source: "pmc_interventions", incremental: "人工维护", suggested_range: "保留全部处理留痕，必要时按年度归档" },
  { table_name: "standard_risks", label: "统一风险模型", timestamp_column: "generated_at", sync_source: "standard_risks", incremental: "本地生成", suggested_range: "每次PMC风险重算后覆盖当前风险池，处理留痕由干预记录保留" },
  { table_name: "erp_sales_orders", label: "销售订单", timestamp_column: "synced_at", coverage_date_column: "signed_date", history_target_days: 90, sync_source: "sales_orders", incremental: "部分支持", suggested_range: "未交付订单 + 近90天订单，夜间补近1年" },
  { table_name: "erp_material_alerts", label: "物料/库存告警", timestamp_column: "synced_at", sync_source: "material_alerts", incremental: "否", suggested_range: "当前缺料和低库存，每15-30分钟小批量刷新" },
  { table_name: "erp_warehouses", label: "仓库清单", timestamp_column: "synced_at", sync_source: "warehouses", incremental: "主数据", suggested_range: "全量仓库，重点核对钽铌库、废料库、原料库、半成品库、成品库" },
  { table_name: "erp_inventory_summary", label: "库存余额汇总", timestamp_column: "synced_at", sync_source: "inventory_summary", incremental: "当前快照", suggested_range: "按仓库逐个同步当前库存余额" },
  { table_name: "erp_inventory_details", label: "库存明细批次", timestamp_column: "synced_at", coverage_date_column: "initial_inbound_time", history_target_days: 90, sync_source: "inventory_details", incremental: "部分支持", suggested_range: "按仓库逐个同步库存明细批次，覆盖近90天入库批次" },
  { table_name: "erp_procedure_plans", label: "派工/工序计划", timestamp_column: "synced_at", coverage_date_column: "planned_start_date", history_target_days: 90, sync_source: "procedure_plans", incremental: "部分支持", suggested_range: "未完工派工 + 近90天工序" },
  { table_name: "erp_process_reports", label: "工序汇报历史", timestamp_column: "synced_at", coverage_date_column: "added_at", history_target_days: 90, sync_source: "process_reports", incremental: "部分支持", suggested_range: "近90天工序汇报明细，按页小批量补齐" },
  { table_name: "order_procedure_links", label: "订单-派工人工绑定", timestamp_column: "created_at", sync_source: "manual_order_procedure_links", incremental: "人工维护", suggested_range: "只维护未关联且现场确认归属订单的派工记录" },
  { table_name: "erp_purchase_orders", label: "采购订单", timestamp_column: "synced_at", coverage_date_column: "order_date", history_target_days: 90, sync_source: "purchase_orders", incremental: "部分支持", suggested_range: "近90天采购订单，重点关注未到货和延期订单" },
  { table_name: "erp_suppliers", label: "供应商档案", timestamp_column: "synced_at", sync_source: "suppliers", incremental: "主数据", suggested_range: "全量供应商档案，含联系人、电话、状态、等级" },
  { table_name: "erp_quote_followups", label: "报价项目归档（已停用）", timestamp_column: "synced_at", coverage_date_column: "created_date", history_target_days: 90, sync_source: "quote_projects", incremental: "已停用", suggested_range: "保留历史表，不再作为默认同步源和前台页面依赖" },
  { table_name: "erp_finance_records", label: "应收应付", timestamp_column: "synced_at", coverage_date_column: "bill_date", history_target_days: 90, sync_source: "finance_records", incremental: "部分支持", suggested_range: "未结清单据 + 近1年" },
  { table_name: "erp_org_users", label: "ERP组织用户", timestamp_column: "synced_at", sync_source: "org_users", incremental: "主数据", suggested_range: "全量组织账号，每天轻量同步一次" },
  { table_name: "sync_runs", label: "同步记录", timestamp_column: "finished_at", sync_source: "internal", incremental: "本地自动", suggested_range: "保留全部或近1年" },
  { table_name: "erp_request_logs", label: "ERP请求日志", timestamp_column: "requested_at", sync_source: "internal", incremental: "本地自动", suggested_range: "保留近30天或最近5000条" }
];

export const SQLITE_PAGE_DEPENDENCIES = [
  { page_name: "PMC驾驶舱", page_path: "/pmc", tables: ["pmc_dashboard_snapshots", "standard_risks", "pmc_intervention_logs", "erp_sales_orders", "erp_material_alerts", "erp_procedure_plans", "erp_inventory_details", "order_procedure_links", "erp_purchase_orders", "erp_finance_records"], missing_sources: ["合同明细全量"] },
  { page_name: "订单管理中心", page_path: "/orders", tables: ["erp_sales_orders", "erp_material_alerts", "standard_risks"], missing_sources: ["合同明细历史", "订单交期风险明细"] },
  { page_name: "订单详情", page_path: "/order", tables: ["erp_sales_orders", "erp_material_alerts"], missing_sources: ["合同明细本地表", "质检/物流记录"] },
  { page_name: "物料采购中心", page_path: "/materials", tables: ["erp_material_alerts", "erp_warehouses", "erp_inventory_summary", "erp_inventory_details", "erp_purchase_orders", "erp_suppliers"], missing_sources: ["BOM展开", "90天出入库流水"] },
  { page_name: "生产进度中心", page_path: "/production", tables: ["erp_procedure_plans", "erp_process_reports"], missing_sources: ["领料历史", "BOM本地表"] },
  { page_name: "车间电子看板", page_path: "/workshop-board", tables: ["erp_procedure_plans", "erp_process_reports", "erp_material_alerts", "order_procedure_links"], missing_sources: ["设备状态"] },
  { page_name: "派工人工绑定", page_path: "/procedure-links", tables: ["erp_sales_orders", "erp_procedure_plans", "order_procedure_links"], missing_sources: [] },
  { page_name: "应收应付中心", page_path: "/finance", tables: ["erp_finance_records", "standard_risks"], missing_sources: ["收付款明细历史", "账期配置"] },
  { page_name: "报表中心", page_path: "/reports", tables: ["pmc_dashboard_snapshots", "standard_risks", "pmc_intervention_logs", "erp_sales_orders", "erp_material_alerts", "erp_finance_records"], missing_sources: ["历史月报宽表", "供应商绩效"] },
  { page_name: "系统状态中心", page_path: "/system", tables: ["sync_runs", "erp_request_logs", "erp_org_users"], missing_sources: [] },
  { page_name: "用户信息维护", page_path: "/user-roles", tables: ["erp_org_users", "sync_runs"], missing_sources: [] },
  { page_name: "干预记录台账", page_path: "/interventions", tables: ["pmc_intervention_logs"], missing_sources: [] },
  { page_name: "ERP请求日志", page_path: "/erp-logs", tables: ["erp_request_logs"], missing_sources: [] }
];

export function buildSqliteCoverage({ tableStats = {}, latestSyncRuns = [], now = new Date() } = {}) {
  const syncBySource = new Map(latestSyncRuns.map((row) => [row.source_key, row]));
  const tables = SQLITE_TABLES.map((table) => {
    const stats = tableStats[table.table_name] || { row_count: 0, latest_at: "" };
    const sync = syncBySource.get(table.sync_source) || null;
    const dateRange = [stats.min_date, stats.max_date].filter(Boolean).join(" 至 ");
    const historyStatus = historyCoverageStatus({ table, stats, now });
    return {
      ...table,
      row_count: Number(stats.row_count) || 0,
      latest_at: stats.latest_at || "",
      date_range: dateRange || "未统计",
      history_status: historyStatus,
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
      history_status: summarizeHistoryStatus(dependencyTables),
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
      empty_tables: tables.filter((row) => row.row_count <= 0).length,
      history_ready_tables: tables.filter((row) => row.history_status === "90天已覆盖").length
    },
    pages,
    tables
  };
}

function historyCoverageStatus({ table, stats, now }) {
  if (!table.history_target_days) {
    return "当前快照/不适用";
  }
  if (Number(stats.row_count) <= 0) {
    return "无数据";
  }
  if (!stats.min_date) {
    return "未统计日期";
  }
  const target = startOfDay(now);
  target.setDate(target.getDate() - table.history_target_days);
  const minDate = parseDate(stats.min_date);
  if (!minDate) {
    return "日期不可识别";
  }
  return startOfDay(minDate) <= target ? `${table.history_target_days}天已覆盖` : `未覆盖${table.history_target_days}天`;
}

function summarizeHistoryStatus(tables) {
  const values = [...new Set(tables.map((table) => table.history_status).filter(Boolean))];
  return values.length ? values.join(" / ") : "待建本地表";
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

function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
