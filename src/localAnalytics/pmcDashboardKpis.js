import {
  betweenDays,
  parseDate,
  sameDay,
  uniqueCount
} from "./utils.js";

export function buildPmcDashboardKpiSummary({
  normalizedOrders = [],
  overdueOrders = [],
  dueSoonOrders = [],
  shortageRows = [],
  lowStockRows = [],
  normalizedProcedures = [],
  delayedProcedures = [],
  stampingDelayedProcedures = [],
  upstreamFlowRisks = [],
  upstreamFlowCoverage = { summary: {}, gaps: [] },
  upstreamFlowHandoffs = [],
  semiFinishedBatches = [],
  bomKitChecks = [],
  batchFlowSuggestions = [],
  orderFlowLinks = [],
  dataFreshness = [],
  dataTrust = {},
  priorityRisks = [],
  orderBattle = { rows: [], red_nodes: 0, yellow_nodes: 0 },
  procedureCoverage = { summary: {}, match_rate: 0, manual_matched_orders: 0, report_subject_matched_orders: 0, assisted_matched_orders: 0 },
  financeCenter = { summary: {} },
  monthStart,
  monthEnd,
  day
} = {}) {
  return {
    today_orders: normalizedOrders.filter((row) => sameDay(parseDate(row.signed_date), day)).length,
    month_orders: normalizedOrders.filter((row) => betweenDays(parseDate(row.signed_date), monthStart, monthEnd)).length,
    overdue_orders: uniqueCount(overdueOrders, "order_no"),
    due_soon_orders: uniqueCount(dueSoonOrders, "order_no"),
    shortage_orders: uniqueCount(shortageRows, "order_no"),
    low_stock: lowStockRows.length,
    procedure_plan_rows: normalizedProcedures.length,
    delayed_procedures: delayedProcedures.length,
    stamping_delayed_procedures: stampingDelayedProcedures.length,
    upstream_flow_risks: upstreamFlowRisks.length,
    upstream_flow_gaps: upstreamFlowCoverage.gaps.length,
    upstream_flow_handoffs: upstreamFlowHandoffs.length,
    semi_finished_batches: semiFinishedBatches.length,
    upstream_flow_coverage_rate: upstreamFlowCoverage.summary.flow_coverage_rate,
    bom_kit_checks: bomKitChecks.length,
    bom_shortage_orders: bomKitChecks.filter((row) => row.kit_status === "短缺").length,
    batch_flow_suggestions: batchFlowSuggestions.length,
    order_flow_links: orderFlowLinks.length,
    stale_data_sources: dataFreshness.filter((row) => row.freshness_status === "需关注" || row.freshness_status === "无数据").length,
    data_trust_score: dataTrust.trust_score,
    data_trust_status: dataTrust.trust_status,
    priority_risks: priorityRisks.length,
    battle_map_orders: orderBattle.rows.length,
    battle_map_red_nodes: orderBattle.red_nodes,
    battle_map_yellow_nodes: orderBattle.yellow_nodes,
    procedure_order_match_rate: procedureCoverage.match_rate,
    unmatched_procedure_plans: procedureCoverage.summary.unmatched_procedure_plans,
    manual_matched_orders: procedureCoverage.manual_matched_orders,
    report_subject_matched_orders: procedureCoverage.report_subject_matched_orders,
    assisted_matched_orders: procedureCoverage.assisted_matched_orders,
    overdue_receivables: financeCenter.summary.overdue_receivables,
    due_soon_payables: financeCenter.summary.due_soon_payables
  };
}

export function buildPmcDashboardCommandCenter({
  redRisks = [],
  yellowRisks = [],
  normalizedOrders = [],
  overdueOrders = [],
  dueSoonOrders = [],
  commandRiskPool = {}
} = {}) {
  return {
    red_count: redRisks.length,
    yellow_count: yellowRisks.length,
    green_count: Math.max(0, normalizedOrders.length - uniqueCount([...overdueOrders, ...dueSoonOrders], "order_no")),
    today_todos: redRisks.length + yellowRisks.length,
    risk_item_count: commandRiskPool.risk_item_count,
    monitored_item_count: commandRiskPool.monitored_item_count,
    risk_item_ratio: commandRiskPool.risk_item_ratio,
    risk_order_ratio: commandRiskPool.risk_item_ratio
  };
}
