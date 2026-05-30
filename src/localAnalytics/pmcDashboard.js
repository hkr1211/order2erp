import {
  buildBatchFlowSuggestions,
  buildBomKitChecks,
  buildOrderFlowLinks
} from "../models/materialPlanning.js";
import { buildLocalFinanceCenter } from "./finance.js";
import {
  buildCrossWorkshopFlowCoverage,
  buildCrossWorkshopFlowHandoffs,
  buildCrossWorkshopFlowRisks,
  buildSemiFinishedInventoryBatches
} from "./orderFlow.js";
import {
  buildPmcRiskSections,
  isStampingProcedure
} from "./pmcRisks.js";
import { buildPmcCommandSections } from "./pmcCommand.js";
import { buildPmcDataTrust } from "./pmcDataTrust.js";
import {
  buildPmcDashboardBattleContext
} from "./pmcDashboardBattleMap.js";
import {
  buildPmcDashboardCommandCenter,
  buildPmcDashboardKpiSummary
} from "./pmcDashboardKpis.js";
import {
  buildPmcDashboardFollowupTasks,
  buildPmcDashboardOwnerWorkbenches
} from "./pmcDashboardFollowup.js";
import {
  ownerMatches,
  procedureMatchesOwner
} from "./followupWorkbench.js";
import {
  buildProcedureOrderMatchMap,
  enrichProcedureOrderMatch,
  normalizeProcedurePlan,
  procedureKey
} from "./workshopBoard.js";
import {
  daysBetween,
  parseDate,
  parseJson,
  startOfDay
} from "./utils.js";

export {
  buildPmcDashboardBattleContext
} from "./pmcDashboardBattleMap.js";
export {
  buildPmcDashboardCommandCenter,
  buildPmcDashboardKpiSummary
} from "./pmcDashboardKpis.js";
export {
  buildPmcDashboardFollowupTasks,
  buildPmcDashboardOwnerWorkbenches
} from "./pmcDashboardFollowup.js";

export function buildLocalPmcDashboard({ salesOrders = [], materialAlerts = [], quoteFollowups = [], procedurePlans = [], procedureLinks = [], processReports = [], inventoryDetails = [], bomRows = [], financeRows = [], userRoles = [], today = new Date(), owner = "" } = {}) {
  const day = startOfDay(today);
  const monthStart = new Date(day.getFullYear(), day.getMonth(), 1);
  const monthEnd = new Date(day.getFullYear(), day.getMonth() + 1, 0);
  const ownerFilter = String(owner || "").trim();
  const ownerWorkbenches = buildPmcDashboardOwnerWorkbenches({ salesOrders, materialAlerts, procedurePlans, procedureLinks, processReports, userRoles });
  const orderOwnerByNo = new Map(salesOrders.map((row) => [row.order_no, row.owner || "未分配"]).filter(([orderNo]) => orderNo));
  const scopedSalesOrders = ownerFilter ? salesOrders.filter((row) => ownerMatches(row.owner, ownerFilter)) : salesOrders;
  const scopedMaterialAlerts = ownerFilter
    ? materialAlerts.filter((row) => ownerMatches(row.owner || orderOwnerByNo.get(row.order_no), ownerFilter))
    : materialAlerts;
  const scopedFinanceRows = ownerFilter ? financeRows.filter((row) => ownerMatches(row.owner, ownerFilter)) : financeRows;
  const normalizedOrders = scopedSalesOrders.map((row) => normalizeOrder(row, day));
  const overdueOrders = normalizedOrders.filter((row) => row.days_from_today !== null && row.days_from_today < 0);
  const dueSoonOrders = normalizedOrders.filter((row) => row.days_from_today !== null && row.days_from_today >= 0 && row.days_from_today <= 7);
  const shortageRows = scopedMaterialAlerts.filter((row) => row.alert_type === "shortage").map(normalizeMaterialAlert);
  const lowStockRows = scopedMaterialAlerts.filter((row) => row.alert_type === "low_stock").map(normalizeMaterialAlert);
  const procedureCandidates = procedurePlans.map((source, index) => ({
    source,
    raw: normalizeProcedurePlan(source),
    index
  }));
  const procedureOrderMatches = buildProcedureOrderMatchMap(procedureCandidates.map((row) => row.raw), normalizedOrders, procedureLinks, processReports);
  const scopedProcedurePairs = procedureCandidates
    .map((row) => {
      const enriched = enrichProcedureOrderMatch(row.raw, procedureOrderMatches.get(procedureKey(row.raw, row.index)));
      return { ...row, enriched };
    })
    .filter((row) => !ownerFilter || procedureMatchesOwner(row.enriched, ownerFilter, orderOwnerByNo));
  const scopedProcedurePlans = scopedProcedurePairs.map((row) => row.source);
  const rawProcedures = scopedProcedurePairs.map((row) => row.raw);
  const normalizedProcedures = scopedProcedurePairs.map((row) => row.enriched);
  const delayedProcedures = normalizedProcedures
    .filter((row) => row.remaining_qty === null || row.remaining_qty > 0)
    .filter((row) => {
      const finishDate = parseDate(row.planned_finish_date);
      return finishDate && startOfDay(finishDate) < day;
    });
  const stampingDelayedProcedures = delayedProcedures.filter(isStampingProcedure);
  const financeCenter = buildLocalFinanceCenter({ financeRows: scopedFinanceRows });
  const { orderBattle, procedureCoverage, workloadByCenter } = buildPmcDashboardBattleContext({
    normalizedOrders,
    normalizedProcedures,
    rawProcedures,
    procedureLinks,
    processReports,
    day
  });
  const semiFinishedBatches = buildSemiFinishedInventoryBatches(inventoryDetails);
  const upstreamFlowRisks = buildCrossWorkshopFlowRisks(normalizedProcedures, day, semiFinishedBatches);
  const upstreamFlowCoverage = buildCrossWorkshopFlowCoverage(normalizedProcedures, upstreamFlowRisks, day, semiFinishedBatches);
  const upstreamFlowHandoffs = buildCrossWorkshopFlowHandoffs(normalizedProcedures, day, semiFinishedBatches);
  const { dataFreshness, dataTrust } = buildPmcDataTrust({
    sources: {
      salesOrders: scopedSalesOrders,
      materialAlerts: scopedMaterialAlerts,
      procedurePlans: scopedProcedurePlans,
      inventoryDetails,
      financeRows: scopedFinanceRows
    },
    today: day
  });
  const { priorityRisks, redRisks, yellowRisks } = buildPmcRiskSections({
    upstreamFlowRisks,
    delayedProcedures,
    stampingDelayedProcedures,
    shortageRows,
    lowStockRows,
    overdueOrders,
    dueSoonOrders,
    today: day
  });
  const bomKitChecks = buildBomKitChecks({ orders: normalizedOrders, bomRows, inventoryRows: inventoryDetails });
  const batchFlowSuggestions = buildBatchFlowSuggestions({ today: day, procedurePlans: normalizedProcedures, inventoryRows: inventoryDetails });
  const orderFlowLinks = buildOrderFlowLinks({
    orders: normalizedOrders,
    procedurePlans: normalizedProcedures,
    materialAlerts: [...shortageRows, ...lowStockRows],
    inventoryRows: inventoryDetails
  });
  const interventionTasks = buildPmcDashboardFollowupTasks({ redRisks, yellowRisks });
  const {
    morningBrief,
    riskTypeSummary,
    riskOwnerSummary,
    commandInsights,
    commandMeetingActions,
    commandRiskPool
  } = buildPmcCommandSections({
    redRisks,
    yellowRisks,
    dataFreshness,
    orders: normalizedOrders,
    procedures: normalizedProcedures,
    materialAlerts: [...shortageRows, ...lowStockRows],
    financeRows: financeCenter.sections.overdue_receivables.concat(financeCenter.sections.due_soon_payables)
  });

  return {
    model: "pmc_console",
    generated_at: new Date().toISOString(),
    cached: true,
    owner_filter: ownerFilter,
    summary: buildPmcDashboardKpiSummary({
      normalizedOrders,
      overdueOrders,
      dueSoonOrders,
      shortageRows,
      lowStockRows,
      normalizedProcedures,
      delayedProcedures,
      stampingDelayedProcedures,
      upstreamFlowRisks,
      upstreamFlowCoverage,
      upstreamFlowHandoffs,
      semiFinishedBatches,
      bomKitChecks,
      batchFlowSuggestions,
      orderFlowLinks,
      dataFreshness,
      dataTrust,
      priorityRisks,
      orderBattle,
      procedureCoverage,
      financeCenter,
      monthStart,
      monthEnd,
      day
    }),
    command_center: buildPmcDashboardCommandCenter({
      redRisks,
      yellowRisks,
      normalizedOrders,
      overdueOrders,
      dueSoonOrders,
      commandRiskPool
    }),
    sections: {
      overdue_orders: overdueOrders,
      due_soon_orders: dueSoonOrders,
      shortage_orders: shortageRows,
      low_stock: lowStockRows,
      delayed_procedures: delayedProcedures,
      stamping_delayed_procedures: stampingDelayedProcedures,
      upstream_flow_risks: upstreamFlowRisks,
      upstream_flow_coverage: [upstreamFlowCoverage.summary],
      upstream_flow_gaps: upstreamFlowCoverage.gaps,
      upstream_flow_handoffs: upstreamFlowHandoffs,
      bom_kit_checks: bomKitChecks,
      batch_flow_suggestions: batchFlowSuggestions,
      order_flow_links: orderFlowLinks,
      data_trust_summary: [dataTrust],
      data_freshness: dataFreshness,
      priority_risks: priorityRisks,
      red_risks: redRisks,
      yellow_risks: yellowRisks,
      risk_type_summary: riskTypeSummary,
      risk_owner_summary: riskOwnerSummary,
      command_insights: commandInsights,
      command_meeting_actions: commandMeetingActions,
      morning_brief: morningBrief,
      intervention_tasks: interventionTasks,
      owner_workbenches: ownerWorkbenches,
      order_battle_stages: orderBattle.stages,
      order_battle_map: orderBattle.rows,
      order_battle_summary: orderBattle.summary,
      order_procedure_coverage: [procedureCoverage.summary],
      order_procedure_matches: procedureCoverage.matches,
      unmatched_procedure_plans: procedureCoverage.unmatched_procedure_plans,
      workload_by_center: workloadByCenter,
      overdue_receivables: financeCenter.sections.overdue_receivables,
      due_soon_payables: financeCenter.sections.due_soon_payables
    },
    source_status: {
      sqlite_sales_orders: { ok: true, rows: scopedSalesOrders.length, total_rows: salesOrders.length },
      sqlite_material_alerts: { ok: true, rows: scopedMaterialAlerts.length, total_rows: materialAlerts.length },
      sqlite_procedure_plans: { ok: true, rows: scopedProcedurePlans.length, total_rows: procedurePlans.length },
      sqlite_inventory_details: { ok: true, rows: inventoryDetails.length },
      sqlite_bom_rows: { ok: true, rows: bomRows.length },
      sqlite_finance_records: { ok: true, rows: scopedFinanceRows.length, total_rows: financeRows.length }
    },
    notes: [
      "当前读取本地 SQLite 销售订单、物料告警、派工进度、库存明细和应收应付汇总。",
      "同步暂停时本页不会访问 ERP，只使用最近已同步成功的数据重新生成。"
    ]
  };
}

function normalizeOrder(row, today) {
  const deliveryDate = parseDate(row.delivery_date);
  return {
    erp_id: row.erp_id,
    order_no: row.order_no,
    customer: row.customer,
    owner: row.owner,
    product_name: row.product_name,
    product_code: row.product_code,
    product_model: row.product_model,
    remaining_qty: row.remaining_qty,
    amount: row.amount,
    signed_date: row.signed_date,
    delivery_date: row.delivery_date,
    days_from_today: deliveryDate ? daysBetween(today, startOfDay(deliveryDate)) : null,
    raw: parseJson(row.raw_json, row)
  };
}

function normalizeMaterialAlert(row) {
  const raw = parseJson(row.raw_json, row);
  return {
    order_no: row.order_no,
    customer: row.customer,
    product_code: row.product_code,
    product_name: row.product_name,
    warehouse: row.warehouse,
    demand_qty: row.demand_qty,
    available_qty: row.available_qty,
    stock_qty: row.stock_qty,
    shortage_qty: row.shortage_qty,
    unit: row.unit || raw?.unit || raw?.raw?.Unit || raw?.raw?.单位,
    delivery_date: row.delivery_date,
    raw
  };
}
