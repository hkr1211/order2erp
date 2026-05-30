import test from "node:test";
import assert from "node:assert/strict";
import { buildForeignTradeBoard, buildLocalExceptionCenter as buildLocalExceptionCenterFromFacade, buildLocalFinanceCenter, buildLocalPmcDashboard, buildLocalPmcDashboard as buildLocalPmcDashboardFromFacade, buildUserRoleCandidates, buildWorkshopBoard, mapFinanceRowForLocal, mapQuoteFollowupForLocal } from "../src/localAnalytics.js";
import { buildLocalExceptionCenter } from "../src/localAnalytics/exceptionCenter.js";
import { buildLocalPmcDashboard as buildLocalPmcDashboardFromModule, buildPmcDashboardBattleContext as buildPmcDashboardBattleContextFromDashboard, buildPmcDashboardFollowupTasks as buildPmcDashboardFollowupTasksFromDashboard, buildPmcDashboardKpiSummary as buildPmcDashboardKpiSummaryFromDashboard } from "../src/localAnalytics/pmcDashboard.js";
import { buildPmcDashboardBattleContext } from "../src/localAnalytics/pmcDashboardBattleMap.js";
import { buildPmcDashboardFollowupTasks } from "../src/localAnalytics/pmcDashboardFollowup.js";
import { buildPmcDashboardKpiSummary } from "../src/localAnalytics/pmcDashboardKpis.js";
import { buildCrossWorkshopFlowHandoffs as buildCrossWorkshopFlowHandoffsFromFacade, buildSemiFinishedInventoryBatches as buildSemiFinishedInventoryBatchesFromFacade } from "../src/localAnalytics/crossWorkshopFlow.js";
import { buildCrossWorkshopFlowHandoffs } from "../src/localAnalytics/crossWorkshopHandoffs.js";
import { buildSemiFinishedInventoryBatches, findSemiFinishedBatchForDownstream } from "../src/localAnalytics/semiFinishedBatches.js";
import { deliveryTasks as deliveryTasksFromFacade, feedbackDeadlineForRisk as feedbackDeadlineForRiskFromFacade, sortCommandRisks as sortCommandRisksFromFacade } from "../src/localAnalytics/pmcRisks.js";
import { buildCommandInsights as buildCommandInsightsFromFacade, buildCommandMeetingActions as buildCommandMeetingActionsFromFacade, buildMorningBrief as buildMorningBriefFromFacade, buildRiskTypeSummary as buildRiskTypeSummaryFromFacade } from "../src/localAnalytics/pmcCommand.js";
import { buildCommandInsights } from "../src/localAnalytics/pmcCommandInsights.js";
import { buildCommandMeetingActions } from "../src/localAnalytics/pmcCommandMeeting.js";
import { buildMorningBrief, buildRiskTypeSummary } from "../src/localAnalytics/pmcCommandSummary.js";
import { feedbackDeadlineForRisk } from "../src/localAnalytics/pmcRiskActions.js";
import { sortCommandRisks } from "../src/localAnalytics/pmcRiskScoring.js";
import { deliveryTasks } from "../src/localAnalytics/pmcRiskTasks.js";
import { WORKSHOP_SECTIONS, classifyWorkshopSection } from "../src/localAnalytics/workshopSections.js";

test("shared workshop section classifier keeps rolling stamping and tungsten molybdenum consistent", () => {
  assert.deepEqual(WORKSHOP_SECTIONS.map((section) => section.key), ["rolling", "stamping", "tungsten_molybdenum"]);
  assert.equal(classifyWorkshopSection({ procedure_name: "冷轧", work_center_name: "420四辊轧机" }).key, "rolling");
  assert.equal(classifyWorkshopSection({ procedure_name: "冲圆", work_center_name: "冲压工段" }).key, "stamping");
  assert.equal(classifyWorkshopSection({ procedure_name: "无心磨", work_center_name: "磨工" }).key, "tungsten_molybdenum");
});

test("cross workshop flow facade delegates to split modules", () => {
  assert.equal(buildSemiFinishedInventoryBatchesFromFacade, buildSemiFinishedInventoryBatches);
  assert.equal(buildCrossWorkshopFlowHandoffsFromFacade, buildCrossWorkshopFlowHandoffs);
  assert.equal(typeof findSemiFinishedBatchForDownstream, "function");
});

test("PMC risk facade delegates task scoring and action helpers to split modules", () => {
  assert.equal(deliveryTasksFromFacade, deliveryTasks);
  assert.equal(sortCommandRisksFromFacade, sortCommandRisks);
  assert.equal(feedbackDeadlineForRiskFromFacade, feedbackDeadlineForRisk);
});

test("PMC command facade delegates summary insight and meeting helpers to split modules", () => {
  assert.equal(buildMorningBriefFromFacade, buildMorningBrief);
  assert.equal(buildRiskTypeSummaryFromFacade, buildRiskTypeSummary);
  assert.equal(buildCommandInsightsFromFacade, buildCommandInsights);
  assert.equal(buildCommandMeetingActionsFromFacade, buildCommandMeetingActions);
});

test("local analytics facade delegates PMC dashboard and exception center to split modules", () => {
  assert.equal(buildLocalPmcDashboardFromFacade, buildLocalPmcDashboardFromModule);
  assert.equal(buildLocalExceptionCenterFromFacade, buildLocalExceptionCenter);
});

test("PMC dashboard delegates KPI battle map and followup assembly to split modules", () => {
  assert.equal(buildPmcDashboardKpiSummaryFromDashboard, buildPmcDashboardKpiSummary);
  assert.equal(buildPmcDashboardBattleContextFromDashboard, buildPmcDashboardBattleContext);
  assert.equal(buildPmcDashboardFollowupTasksFromDashboard, buildPmcDashboardFollowupTasks);
});

test("buildLocalPmcDashboard summarizes SQLite orders and material alerts", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-23T08:00:00+08:00"),
    salesOrders: [
      { erp_id: "1", order_no: "SO-1", customer: "A", product_name: "钼板", signed_date: "2026-05-23", delivery_date: "2026-05-22", raw_json: "{}" },
      { erp_id: "2", order_no: "SO-2", customer: "B", product_name: "钨棒", signed_date: "2026-05-10", delivery_date: "2026-05-27", raw_json: "{}" },
      { erp_id: "3", order_no: "SO-3", customer: "C", product_name: "钽片", signed_date: "2026-04-30", delivery_date: "2026-06-20", raw_json: "{}" }
    ],
    materialAlerts: [
      { alert_type: "shortage", order_no: "SO-2", customer: "B", product_name: "钨棒", product_code: "W-1", shortage_qty: 5 },
      { alert_type: "low_stock", product_name: "钼粉", product_code: "MO-1", warehouse: "原料库", available_qty: 0, stock_qty: 0 }
    ]
  });

  assert.equal(body.summary.today_orders, 1);
  assert.equal(body.summary.month_orders, 2);
  assert.equal(body.summary.overdue_orders, 1);
  assert.equal(body.summary.due_soon_orders, 1);
  assert.equal(body.summary.shortage_orders, 1);
  assert.equal(body.summary.low_stock, 1);
  assert.equal(body.sections.overdue_orders[0].order_no, "SO-1");
  assert.equal(body.sections.due_soon_orders[0].order_no, "SO-2");
  assert.equal(body.sections.shortage_orders[0].order_no, "SO-2");
  assert.equal(body.sections.low_stock[0].product_code, "MO-1");
});

test("buildWorkshopBoard groups active plans by the three main workshop sections", () => {
  const body = buildWorkshopBoard({
    today: new Date("2026-05-26T09:00:00+08:00"),
    procedurePlans: [
      { work_assignment_id: "R-1", order_no: "PO-R", product_name: "钼带", procedure_name: "冷轧420轧机", work_center_name: "420四辊轧机", planned_qty: 100, finished_qty: 30, remaining_qty: 70, planned_start_date: "2026-05-25", planned_finish_date: "2026-05-27", owner: "轧制班", state: "生产中" },
      { work_assignment_id: "S-1", order_no: "PO-S", product_name: "钽杯", procedure_name: "落料", work_center_name: "冲压工", planned_qty: 80, finished_qty: 80, remaining_qty: 0, planned_start_date: "2026-05-26", planned_finish_date: "2026-05-26", owner: "冲压班", state: "已完工" },
      { work_assignment_id: "S-2", order_no: "PO-S2", product_name: "锥形铌杯", procedure_name: "三引", work_center_name: "工段长", planned_qty: 20, finished_qty: 5, remaining_qty: 15, planned_start_date: "2026-05-25", planned_finish_date: "2026-05-27", owner: "冲压班", state: "生产中" },
      { work_assignment_id: "W-1", order_no: "PO-W", product_name: "钨棒", procedure_name: "无心磨", work_center_name: "磨工", planned_qty: 50, finished_qty: 10, remaining_qty: 40, planned_start_date: "2026-05-24", planned_finish_date: "2026-05-25", owner: "", state: "生产中" },
      { work_assignment_id: "F-1", order_no: "PO-F", product_name: "钼片", procedure_name: "质检", work_center_name: "质检", planned_qty: 20, finished_qty: 0, remaining_qty: 20, planned_start_date: "2026-05-27", planned_finish_date: "2026-05-28", owner: "质检", state: "未开始" }
    ],
    processReports: [
      { report_id: "REP-1", procedure_name: "落料", product_name: "钽杯", report_qty: 12, added_at: "2026-05-26T10:20:00+08:00" },
      { report_id: "REP-2", procedure_name: "无心磨", product_name: "钨棒", report_qty: 5, added_at: "2026-05-25T10:20:00+08:00" }
    ],
    materialAlerts: [
      { alert_id: "A-1", alert_type: "shortage", order_no: "PO-R", product_name: "钼带", shortage_qty: 3 }
    ],
    salesOrders: [
      { order_no: "PO-R", product_name: "钼带", delivery_date: "2026-05-28" },
      { order_no: "PO-W-LINKED", product_name: "钨棒", delivery_date: "2026-05-30" }
    ],
    procedureLinks: [
      { order_no: "PO-W-LINKED", work_assignment_id: "W-1", procedure_name: "无心磨" }
    ]
  });

  assert.equal(body.summary.active_plans, 3);
  assert.equal(body.summary.delayed_plans, 1);
  assert.equal(body.sections.length, 3);

  const byKey = new Map(body.sections.map((section) => [section.key, section]));
  assert.equal(byKey.get("rolling").page_path, "/workshop-board/rolling");
  assert.equal(byKey.get("stamping").page_path, "/workshop-board/stamping");
  assert.equal(byKey.get("tungsten_molybdenum").page_path, "/workshop-board/tungsten-molybdenum");
  assert.equal(byKey.get("rolling").active_plans, 1);
  assert.equal(byKey.get("rolling").material_alerts, 1);
  assert.equal(byKey.get("rolling").warnings[0].related_object, "订单");
  assert.equal(byKey.get("rolling").warnings[0].related_id, "PO-R");
  assert.equal(byKey.get("rolling").completion_rate, 30);
  assert.equal(byKey.get("stamping").completed_plans, 1);
  assert.equal(byKey.get("stamping").active_plans, 2);
  assert.equal(byKey.get("stamping").plans.some((row) => row.work_assignment_id === "S-2"), true);
  assert.equal(byKey.get("stamping").today_report_qty, 12);
  assert.equal(byKey.get("tungsten_molybdenum").delayed_plans, 1);
  assert.equal(byKey.get("tungsten_molybdenum").warnings.some((row) => row.warning_type === "无负责人"), true);
  assert.equal(byKey.get("tungsten_molybdenum").warnings[0].related_object, "派工");
  assert.equal(byKey.get("tungsten_molybdenum").warnings[0].related_id, "W-1");
  assert.equal(byKey.get("tungsten_molybdenum").plans[0].sales_order_no, "PO-W-LINKED");
  assert.equal(byKey.get("tungsten_molybdenum").plans[0].order_match_by, "人工绑定");
  assert.equal(byKey.get("tungsten_molybdenum").plans[0].link_action.includes("/procedure-links?"), true);
  assert.equal(byKey.get("tungsten_molybdenum").plans[0].work_assignment_id, "W-1");
});

test("buildForeignTradeBoard summarizes USD and foreign trade orders from SQLite rows", () => {
  const body = buildForeignTradeBoard({
    salesOrders: [
      { order_no: "YJ外贸出口20260500011", customer: "日本", owner: "田小静", signed_date: "2026-05-23", amount: 3615, status_text: "未出库 / 未发货 / 未收款 / 审批通过", raw_json: JSON.stringify({ htbz: "USD", htfl: "外贸出口", kpjz: "不开票", title: "57696/日本YJ外贸出口20260500011" }) },
      { order_no: "YJ外贸出口20260500012", customer: "Apex Life Inc", owner: "田小静", signed_date: "2026-05-20", amount: 1200, status_text: "出库完毕 / 发货完毕 / 已收款 / 审批通过", raw_json: JSON.stringify({ htbz: "USD", htfl: "外贸出口", title: "57697/Apex Life Inc YJ外贸出口20260500012" }) },
      { order_no: "YJ生产销售20260500214", customer: "内贸客户", owner: "王五", signed_date: "2026-05-20", amount: 1000, status_text: "未发货 / 未收款", raw_json: JSON.stringify({ htbz: "RMB", htfl: "生产销售" }) }
    ],
    materialAlerts: [
      { alert_type: "shortage", order_no: "YJ外贸出口20260500011", customer: "日本", product_name: "钼板", product_code: "Mo-1", shortage_qty: 2, unit: "件" },
      { alert_type: "shortage", order_no: "YJ生产销售20260500214", customer: "内贸客户", product_name: "钽片", shortage_qty: 1 }
    ]
  });

  assert.equal(body.summary.foreign_orders, 2);
  assert.equal(body.summary.usd_amount, 4815);
  assert.equal(body.summary.unshipped_orders, 1);
  assert.equal(body.summary.unpaid_orders, 1);
  assert.equal(body.summary.shortage_orders, 1);
  assert.equal(body.sections.risk_orders[0].order_no, "YJ外贸出口20260500011");
  assert.equal(body.sections.risk_orders[0].currency, "USD");
  assert.equal(body.sections.shortage_rows[0].order_no, "YJ外贸出口20260500011");
  assert.equal(body.sections.owner_summary[0].owner, "田小静");
});

test("buildLocalPmcDashboard includes synced procedure and finance data", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-23T08:00:00+08:00"),
    salesOrders: [],
    materialAlerts: [],
    procedurePlans: [
      { work_assignment_id: "W-1", order_no: "SO-1", product_name: "钼板", procedure_name: "冲压", work_center_name: "冲压工段", planned_qty: 10, finished_qty: 2, remaining_qty: 8, planned_finish_date: "2026-05-20", owner: "张三", state: "生产中" },
      { work_assignment_id: "W-2", order_no: "SO-2", product_name: "钨棒", procedure_name: "质检", work_center_name: "质检", planned_qty: 5, finished_qty: 5, remaining_qty: 0, planned_finish_date: "2026-05-22", owner: "李四", state: "已完工" }
    ],
    financeRows: [
      { direction: "receivable", counterparty: "客户A", bill_no: "R-1", business_title: "钼板订单", unpaid_amount: 800, due_date: "2026-05-10", due_days: -13, risk_status: "已逾期" },
      { direction: "payable", counterparty: "供应商B", bill_no: "P-1", business_title: "原料采购", unpaid_amount: 400, due_date: "2026-05-28", due_days: 5, risk_status: "7天内到期" }
    ]
  });

  assert.equal(body.summary.procedure_plan_rows, 2);
  assert.equal(body.summary.delayed_procedures, 1);
  assert.equal(body.summary.overdue_receivables, 1);
  assert.equal(body.summary.due_soon_payables, 1);
  assert.equal(body.sections.delayed_procedures[0].work_center_name, "冲压工段");
  assert.equal(body.sections.overdue_receivables[0].bill_no, "R-1");
});

test("buildUserRoleCandidates summarizes owners across ERP sources", () => {
  const rows = buildUserRoleCandidates({
    salesOrders: [
      { order_no: "SO-OPEN", owner: "张三", status_text: "生产中" },
      { order_no: "SO-DONE", owner: "葛梓", status_text: "出库完毕 / 发货完毕 / 未收款" }
    ],
    procedurePlans: [
      { work_assignment_id: "W-1", owner: "张三" }
    ],
    quoteFollowups: [
      { quote_no: "Q-1", owner: "李四", quote_status: "待报价" }
    ],
    financeRows: [
      { record_id: "F-1", owner: "葛梓", direction: "receivable" }
    ],
    userRoles: [
      { name: "葛梓", role: "财务经理", is_followup: 0 }
    ]
  });

  const byName = new Map(rows.map((row) => [row.name, row]));

  assert.equal(byName.get("张三").suggested_role, "跟单员");
  assert.equal(byName.get("张三").active_orders, 1);
  assert.equal(byName.get("张三").procedure_plans, 1);
  assert.equal(byName.get("李四").suggested_role, "销售");
  assert.equal(byName.get("葛梓").configured_role, "财务经理");
  assert.equal(byName.get("葛梓").configured_followup, "否");
  assert.equal(byName.get("葛梓").suggested_role, "财务");
});

test("buildUserRoleCandidates keeps numeric ERP owner ids as mapping candidates", () => {
  const rows = buildUserRoleCandidates({
    procedurePlans: [
      { work_assignment_id: "W-151", owner: "151", product_name: "固定座" }
    ]
  });

  assert.equal(rows[0].name, "151");
  assert.equal(rows[0].suggested_role, "ERP编号待映射");
  assert.equal(rows[0].procedure_plans, 1);
});

test("buildLocalPmcDashboard promotes stamping delays into first-screen risks", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    procedurePlans: [
      { work_assignment_id: "W-1", order_no: "SO-1", product_name: "铌杯", procedure_name: "落料", work_center_name: "冲压工", planned_qty: 100, finished_qty: 20, remaining_qty: 80, planned_finish_date: "2026-05-20", owner: "张三", state: "生产中" },
      { work_assignment_id: "W-2", order_no: "SO-2", product_name: "钼带", procedure_name: "轧制", work_center_name: "420四辊轧机", planned_qty: 50, finished_qty: 10, remaining_qty: 40, planned_finish_date: "2026-05-21", owner: "李四", state: "生产中" }
    ],
    materialAlerts: [
      { alert_type: "shortage", order_no: "SO-3", customer: "客户C", product_name: "钽杯", shortage_qty: 5 }
    ]
  });

  assert.equal(body.summary.delayed_procedures, 2);
  assert.equal(body.summary.stamping_delayed_procedures, 1);
  assert.equal(body.sections.stamping_delayed_procedures[0].work_assignment_id, "W-1");
  assert.equal(body.sections.priority_risks[0].exception_type, "冲压延期");
  assert.equal(body.sections.priority_risks.some((row) => row.exception_type === "订单缺料"), true);
});

test("buildLocalPmcDashboard flags rolling upstream delays that block downstream workshops", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    salesOrders: [
      { order_no: "PO-FLOW", customer: "客户A", product_name: "钼冲压件", delivery_date: "2026-05-30" }
    ],
    procedurePlans: [
      { work_assignment_id: "R-FLOW", order_no: "PO-FLOW", product_name: "钼板箔材", procedure_name: "冷轧", work_center_name: "420四辊轧机", planned_qty: 100, finished_qty: 40, remaining_qty: 60, planned_start_date: "2026-05-22", planned_finish_date: "2026-05-25", owner: "轧制班", state: "生产中" },
      { work_assignment_id: "S-FLOW", order_no: "PO-FLOW", product_name: "钼冲压件", procedure_name: "落料", work_center_name: "冲压工段", planned_qty: 100, finished_qty: 0, remaining_qty: 100, planned_start_date: "2026-05-24", planned_finish_date: "2026-05-27", owner: "冲压班", state: "未开始" }
    ]
  });

  assert.equal(body.summary.upstream_flow_risks, 1);
  assert.equal(body.sections.upstream_flow_risks[0].upstream_section, "轧制");
  assert.equal(body.sections.upstream_flow_risks[0].downstream_section, "冲压");
  assert.equal(body.sections.upstream_flow_risks[0].upstream_work_assignment_id, "R-FLOW");
  assert.equal(body.sections.upstream_flow_risks[0].downstream_work_assignment_id, "S-FLOW");
  assert.equal(body.sections.red_risks.some((row) => row.risk_type === "前道断点" && row.related_no === "PO-FLOW"), true);
  assert.equal(body.sections.intervention_tasks.some((row) => row.risk_type === "前道断点" && row.buttons.includes("前道加急")), true);
});

test("buildLocalPmcDashboard uses semi finished inventory batches for cross workshop handoff coverage", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-28T08:00:00+08:00"),
    procedurePlans: [
      { work_assignment_id: "S-BATCH", order_no: "PO-BATCH", product_name: "钼箔", procedure_name: "冲圆", work_center_name: "冲压工段", planned_qty: 5, finished_qty: 0, remaining_qty: 5, planned_start_date: "2026-05-29", planned_finish_date: "2026-05-30", owner: "冲压班", state: "未开始" }
    ],
    inventoryDetails: [
      { product_code: "Mo10204000058", product_name: "钼箔", product_model: "T0.05", warehouse: "16带箔材产成品库", batch_no: "57631 钼箔", stock_qty: 8, available_qty: 8, initial_inbound_time: "2026-05-27 11:00:33" }
    ]
  });

  assert.equal(body.summary.upstream_flow_gaps, 0);
  assert.equal(body.summary.upstream_flow_handoffs, 1);
  assert.equal(body.sections.upstream_flow_handoffs[0].match_basis, "库存批次匹配");
  assert.equal(body.sections.upstream_flow_handoffs[0].upstream_section, "半成品库存");
  assert.equal(body.sections.upstream_flow_handoffs[0].upstream_work_assignment_id, "57631 钼箔");
});

test("buildLocalPmcDashboard uses manual procedure links for cross workshop flow risks", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    salesOrders: [
      { order_no: "PO-LINK-FLOW", customer: "客户A", product_name: "钼冲压件", delivery_date: "2026-05-30" }
    ],
    procedurePlans: [
      { work_assignment_id: "R-LINK", order_no: "", product_name: "钼板箔材", procedure_name: "冷轧", work_center_name: "420四辊轧机", planned_qty: 100, finished_qty: 40, remaining_qty: 60, planned_start_date: "2026-05-22", planned_finish_date: "2026-05-25", owner: "轧制班", state: "生产中" },
      { work_assignment_id: "S-LINK", order_no: "", product_name: "钼冲压件", procedure_name: "落料", work_center_name: "冲压工段", planned_qty: 100, finished_qty: 0, remaining_qty: 100, planned_start_date: "2026-05-24", planned_finish_date: "2026-05-27", owner: "冲压班", state: "未开始" }
    ],
    procedureLinks: [
      { order_no: "PO-LINK-FLOW", work_assignment_id: "R-LINK", procedure_name: "冷轧", actor: "PMC" },
      { order_no: "PO-LINK-FLOW", work_assignment_id: "S-LINK", procedure_name: "落料", actor: "PMC" }
    ]
  });

  assert.equal(body.summary.upstream_flow_risks, 1);
  assert.equal(body.sections.upstream_flow_risks[0].related_no, "PO-LINK-FLOW");
  assert.equal(body.sections.upstream_flow_risks[0].match_basis, "人工绑定");
  assert.equal(body.sections.order_battle_map[0].order_no, "PO-LINK-FLOW");
});

test("buildLocalPmcDashboard reports cross workshop monitoring gaps", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    salesOrders: [
      { order_no: "PO-NO-ROLLING", customer: "客户A", product_name: "钼冲压件", delivery_date: "2026-05-30" }
    ],
    procedurePlans: [
      { work_assignment_id: "S-NO-ORDER", order_no: "", product_name: "未识别冲压半成品", procedure_name: "落料", work_center_name: "冲压工段", planned_qty: 100, finished_qty: 0, remaining_qty: 100, planned_start_date: "2026-05-24", planned_finish_date: "2026-05-27", owner: "冲压班", state: "未开始" },
      { work_assignment_id: "W-NO-UPSTREAM", order_no: "PO-NO-ROLLING", product_name: "钼机加件", procedure_name: "机加工", work_center_name: "钨钼工段", planned_qty: 50, finished_qty: 0, remaining_qty: 50, planned_start_date: "2026-05-25", planned_finish_date: "2026-05-28", owner: "钨钼班", state: "未开始" }
    ]
  });

  assert.equal(body.summary.upstream_flow_gaps, 2);
  assert.equal(body.sections.upstream_flow_coverage[0].downstream_need_material_3d, 2);
  assert.equal(body.sections.upstream_flow_coverage[0].flow_coverage_rate, 0);
  assert.equal(body.sections.upstream_flow_gaps[0].reason, "后道派工缺少销售订单号");
  assert.equal(body.sections.upstream_flow_gaps[1].reason, "已关联订单但没有可识别的轧制前道");
});

test("buildLocalPmcDashboard lists ready cross workshop handoffs", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    salesOrders: [
      { order_no: "PO-HANDOFF", customer: "客户A", product_name: "钼冲压件", delivery_date: "2026-05-30" }
    ],
    procedurePlans: [
      { work_assignment_id: "R-HANDOFF", order_no: "PO-HANDOFF", product_name: "钼板箔材", procedure_name: "冷轧", work_center_name: "420四辊轧机", planned_qty: 100, finished_qty: 100, remaining_qty: 0, planned_start_date: "2026-05-20", planned_finish_date: "2026-05-23", owner: "轧制班", state: "已完工" },
      { work_assignment_id: "S-HANDOFF", order_no: "PO-HANDOFF", product_name: "钼冲压件", procedure_name: "落料", work_center_name: "冲压工段", planned_qty: 100, finished_qty: 0, remaining_qty: 100, planned_start_date: "2026-05-25", planned_finish_date: "2026-05-27", owner: "冲压班", state: "未开始" }
    ]
  });

  assert.equal(body.summary.upstream_flow_gaps, 0);
  assert.equal(body.summary.upstream_flow_handoffs, 1);
  assert.equal(body.sections.upstream_flow_handoffs[0].handoff_status, "可转序");
  assert.equal(body.sections.upstream_flow_handoffs[0].upstream_work_assignment_id, "R-HANDOFF");
  assert.equal(body.sections.upstream_flow_handoffs[0].downstream_work_assignment_id, "S-HANDOFF");
  assert.deepEqual(body.sections.upstream_flow_handoffs[0].buttons, ["确认已入库", "确认已转序", "后道已接收"]);
});

test("buildLocalPmcDashboard reports data freshness for PMC sources", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    salesOrders: [
      { order_no: "PO-FRESH", customer: "客户A", product_name: "钼板", delivery_date: "2026-05-30", synced_at: "2026-05-24T01:00:00.000Z" }
    ],
    materialAlerts: [
      { alert_type: "low_stock", product_code: "MO-1", product_name: "钼粉", available_qty: 1, synced_at: "2026-05-20T01:00:00.000Z" }
    ],
    procedurePlans: [
      { work_assignment_id: "W-FRESH", order_no: "PO-FRESH", product_name: "钼板", procedure_name: "冷轧", work_center_name: "轧制", remaining_qty: 10, planned_finish_date: "2026-05-25", synced_at: "2026-05-24T02:00:00.000Z" }
    ]
  });

  const salesSource = body.sections.data_freshness.find((row) => row.source_name === "销售订单");
  const materialSource = body.sections.data_freshness.find((row) => row.source_name === "物料/库存告警");
  const inventorySource = body.sections.data_freshness.find((row) => row.source_name === "库存明细批次");

  assert.equal(body.summary.stale_data_sources, 3);
  assert.equal(salesSource.row_count, 1);
  assert.equal(salesSource.freshness_status, "今日已同步");
  assert.equal(materialSource.freshness_status, "需关注");
  assert.equal(inventorySource.freshness_status, "无数据");
  assert.equal(body.summary.data_trust_status, "需复核");
  assert.equal(body.sections.data_trust_summary[0].trust_score, 40);
  assert.equal(body.sections.data_trust_summary[0].attention_sources.includes("物料/库存告警"), true);
  assert.equal(body.sections.data_trust_summary[0].decision_guardrail, "关键决策需人工复核");
});

test("buildLocalPmcDashboard groups red and yellow risks with intervention actions", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    salesOrders: [
      { order_no: "PO-RED", customer: "客户A", product_name: "钼板", delivery_date: "2026-05-20", signed_date: "2026-05-01", remaining_qty: 5 },
      { order_no: "PO-YELLOW", customer: "客户B", product_name: "钽杯", delivery_date: "2026-05-28", signed_date: "2026-05-02", remaining_qty: 3 }
    ],
    materialAlerts: [
      { alert_type: "shortage", order_no: "PO-RED", customer: "客户A", product_name: "钼板", shortage_qty: 2, delivery_date: "2026-05-20" },
      { alert_type: "low_stock", product_code: "MO-1", product_name: "钼粉", available_qty: 1, stock_qty: 1 }
    ],
    procedurePlans: [
      { work_assignment_id: "W-RED", order_no: "PO-RED", product_name: "钼板", procedure_name: "落料", work_center_name: "冲压工", remaining_qty: 8, planned_finish_date: "2026-05-20", state: "生产中" }
    ]
  });

  assert.equal(body.command_center.red_count, 3);
  assert.equal(body.command_center.yellow_count, 2);
  assert.equal(body.command_center.today_todos, 5);
  assert.equal(body.sections.red_risks.some((row) => row.risk_type === "交期超期" && row.buttons.includes("客户沟通")), true);
  assert.equal(body.sections.yellow_risks.some((row) => row.risk_type === "交期预警" && row.buttons.includes("协调工序")), true);
  assert.equal([...body.sections.red_risks, ...body.sections.yellow_risks].every((row) => row.risk_id && row.related_object && row.source_table && row.source_key && row.source_rule && row.suggested_action), true);
  assert.equal([...body.sections.red_risks, ...body.sections.yellow_risks].every((row) => row.prediction_level && row.prediction_reason && row.planning_suggestion), true);
  assert.equal(body.sections.red_risks.find((row) => row.risk_type === "产能瓶颈").related_object, "派工");
  assert.equal(body.sections.red_risks.find((row) => row.risk_type === "物料断供").source_table, "erp_material_alerts");
  assert.equal(body.sections.yellow_risks.find((row) => row.risk_type === "交期预警").source_table, "erp_sales_orders");
  assert.equal(body.sections.red_risks.every((row) => Number(row.risk_score) >= 80), true);
  assert.deepEqual(body.sections.red_risks.map((row) => row.risk_score), [...body.sections.red_risks.map((row) => row.risk_score)].sort((a, b) => b - a));
  assert.deepEqual(body.sections.morning_brief.map((row) => row.risk_score), [...body.sections.morning_brief.map((row) => row.risk_score)].sort((a, b) => b - a));
  assert.equal(body.sections.red_risks[0].score_reason.includes("红牌"), true);
  assert.equal(body.sections.red_risks.some((row) => row.rule_reason.includes("必须今天处理")), true);
  assert.equal(body.sections.yellow_risks.some((row) => row.rule_reason.includes("3天内可能恶化")), true);
  assert.equal(body.sections.intervention_tasks[0].primary_action, "优先确认冲压产能、模具和插单影响");
  assert.equal(body.sections.intervention_tasks[0].responsible_owner, "PMC/冲压工段");
  assert.equal(body.sections.intervention_tasks[0].feedback_deadline, "4小时内反馈");
  assert.equal(body.sections.intervention_tasks[0].escalation_rule, "4小时内无反馈升级给管理者");
  assert.equal(body.sections.intervention_tasks[0].expected_output, "明确处理方案、负责人和可承诺完成时间");
  assert.equal(body.sections.intervention_tasks.some((row) => row.buttons.includes("生成催货文本")), true);
  assert.equal(body.sections.morning_brief[0].risk_level, "红牌");
  assert.equal(body.sections.morning_brief[0].headline.includes("产能瓶颈"), true);
  assert.equal(body.sections.morning_brief[0].meeting_focus, "今天确认产能、班次和外协选择");
  assert.equal(body.sections.morning_brief[0].action_label, "加班协调");
  assert.equal(body.sections.intervention_tasks.some((row) => row.buttons.includes("标记处理中")), true);
  assert.equal(body.sections.risk_type_summary[0].risk_type, "产能瓶颈");
  assert.equal(body.sections.risk_type_summary[0].red_count, 1);
  assert.equal(body.sections.risk_type_summary[0].next_action, "今天确认产能、班次和外协选择");
  assert.equal(body.sections.risk_owner_summary.some((row) => row.owner_role === "PMC/冲压工段" && row.red_count === 1), true);
  assert.equal(body.sections.risk_owner_summary.some((row) => row.owner_role === "PMC/采购" && row.red_count === 1), true);
  assert.equal(body.sections.command_insights[0].insight_type, "最高风险");
  assert.equal(body.sections.command_insights[0].related_no, body.sections.morning_brief[0].related_no);
  assert.equal(body.sections.command_insights[0].meeting_topic, "今天确认产能、班次和外协选择");
  assert.equal(body.sections.command_insights[0].responsible_owner, "PMC/冲压工段");
  assert.equal(body.sections.command_insights[0].feedback_deadline, "4小时内反馈");
  assert.equal(body.sections.command_insights[0].decision_request, "请确认是否立即执行：优先确认冲压产能、模具和插单影响");
  assert.equal(body.sections.command_insights.some((row) => row.insight_type === "责任压力" && row.owner_role === "PMC/冲压工段"), true);
  const ownerInsight = body.sections.command_insights.find((row) => row.insight_type === "责任压力");
  assert.equal(ownerInsight.meeting_topic, "请PMC/冲压工段说明红牌1项、黄牌0项的处理顺序");
  assert.equal(ownerInsight.feedback_deadline, "今天下班前更新处理结果");
  assert.equal(body.sections.command_meeting_actions[0].action_no, "MEET-001");
  assert.equal(body.sections.command_meeting_actions[0].related_no, body.sections.morning_brief[0].related_no);
  assert.equal(body.sections.command_meeting_actions[0].responsible_owner, "PMC/冲压工段");
  assert.equal(body.sections.command_meeting_actions[0].meeting_question, "今天确认产能、班次和外协选择");
  assert.equal(body.sections.command_meeting_actions[0].expected_output, "明确处理方案、负责人和可承诺完成时间");
  assert.equal(body.sections.command_meeting_actions[0].escalation_rule, "4小时内无反馈升级给管理者");
  assert.equal(body.sections.command_meeting_actions.some((row) => row.meeting_question.includes("请PMC/冲压工段说明红牌1项")), true);
});

test("buildLocalPmcDashboard calculates risk ratio from the full command risk pool", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    materialAlerts: [
      { alert_type: "low_stock", product_code: "MO-LOW", product_name: "钼粉", available_qty: 1, stock_qty: 1 }
    ],
    procedurePlans: [
      { work_assignment_id: "W-DELAY", product_name: "钼板", procedure_name: "冷轧", work_center_name: "轧制", remaining_qty: 8, planned_finish_date: "2026-05-20", state: "生产中" }
    ]
  });

  assert.equal(body.command_center.red_count, 0);
  assert.equal(body.command_center.yellow_count, 2);
  assert.equal(body.command_center.risk_item_count, 2);
  assert.equal(body.command_center.monitored_item_count, 2);
  assert.equal(body.command_center.risk_item_ratio, 100);
  assert.equal(body.command_center.risk_order_ratio, 100);
});

test("buildLocalPmcDashboard formats shortage quantities with kg precision", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    materialAlerts: [
      { alert_type: "shortage", order_no: "PO-ZR", customer: "客户A", product_name: "锆废料", product_code: "Zr106000001", shortage_qty: 0.3699999999999999, unit: "kg" }
    ]
  });

  const risk = body.sections.red_risks.find((row) => row.related_no === "PO-ZR");

  assert.equal(risk.problem, "锆废料缺口0.37kg，影响订单PO-ZR");
  assert.equal(risk.quantity_text, "0.37kg");
});

test("buildLocalPmcDashboard filters a merchandiser workbench by owner", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    owner: "张三",
    salesOrders: [
      { order_no: "PO-ZS", customer: "客户A", owner: "张三", product_name: "钼板", delivery_date: "2026-05-25", signed_date: "2026-05-01", remaining_qty: 5 },
      { order_no: "PO-LS", customer: "客户B", owner: "李四", product_name: "钽杯", delivery_date: "2026-05-25", signed_date: "2026-05-01", remaining_qty: 3 }
    ],
    materialAlerts: [
      { alert_type: "shortage", order_no: "PO-ZS", customer: "客户A", product_name: "钼板", shortage_qty: 2 },
      { alert_type: "shortage", order_no: "PO-LS", customer: "客户B", product_name: "钽杯", shortage_qty: 4 }
    ],
    procedurePlans: [
      { work_assignment_id: "W-ZS", order_no: "PO-ZS", product_name: "钼板", procedure_name: "落料", work_center_name: "冲压工", remaining_qty: 8, planned_finish_date: "2026-05-20", owner: "张三", state: "生产中" },
      { work_assignment_id: "W-LS", order_no: "PO-LS", product_name: "钽杯", procedure_name: "落料", work_center_name: "冲压工", remaining_qty: 8, planned_finish_date: "2026-05-20", owner: "李四", state: "生产中" }
    ]
  });

  assert.equal(body.owner_filter, "张三");
  assert.equal(body.summary.month_orders, 1);
  assert.equal(body.sections.due_soon_orders[0].order_no, "PO-ZS");
  assert.equal(body.sections.shortage_orders[0].order_no, "PO-ZS");
  assert.equal(body.sections.delayed_procedures[0].work_assignment_id, "W-ZS");
  assert.equal(body.sections.owner_workbenches.some((row) => row.owner === "张三" && row.active_orders === 1), true);
});

test("buildLocalPmcDashboard keeps matched procedure risks in owner workbench", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    owner: "王少花",
    salesOrders: [
      { order_no: "PO-WSH", customer: "客户A", owner: "王少花", product_name: "钽杯", delivery_date: "2026-06-10", status_text: "生产中" },
      { order_no: "PO-OTHER", customer: "客户B", owner: "其他跟单", product_name: "钼板", delivery_date: "2026-06-10", status_text: "生产中" }
    ],
    procedurePlans: [
      { work_assignment_id: "W-WSH", order_no: "", product_name: "钽杯现场描述", procedure_name: "落料", work_center_name: "冲压工", remaining_qty: 10, planned_finish_date: "2026-05-20", state: "生产中" },
      { work_assignment_id: "W-OTHER", order_no: "PO-OTHER", product_name: "钼板", procedure_name: "冷轧", work_center_name: "轧制", remaining_qty: 5, planned_finish_date: "2026-05-20", state: "生产中" }
    ],
    procedureLinks: [
      { order_no: "PO-WSH", work_assignment_id: "W-WSH", procedure_name: "落料", actor: "PMC" }
    ]
  });

  assert.equal(body.owner_filter, "王少花");
  assert.equal(body.sections.delayed_procedures.length, 1);
  assert.equal(body.sections.delayed_procedures[0].work_assignment_id, "W-WSH");
  assert.equal(body.sections.delayed_procedures[0].order_no, "PO-WSH");
  assert.equal(body.sections.delayed_procedures[0].order_match_by, "人工绑定");
  assert.equal(body.sections.red_risks.some((row) => row.related_no === "W-WSH"), true);
  assert.equal(body.sections.red_risks.some((row) => row.related_no === "W-OTHER"), false);
});

test("buildLocalPmcDashboard excludes finance and completed orders from followup owners", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    userRoles: [
      { name: "葛梓", role: "财务经理", is_followup: 0 }
    ],
    salesOrders: [
      { order_no: "PO-FIN", customer: "客户A", owner: "葛梓", product_name: "来料加工", signed_date: "2026-02-28", status_text: "出库完毕 / 发货完毕 / 未收款 / 审批通过" },
      { order_no: "PO-DONE", customer: "客户B", owner: "李四", product_name: "钼板", signed_date: "2026-05-01", status_text: "发货完毕 / 已收款" },
      { order_no: "PO-OPEN", customer: "客户C", owner: "张三", product_name: "钽杯", delivery_date: "2026-05-28", signed_date: "2026-05-01", status_text: "生产中" }
    ]
  });

  const owners = body.sections.owner_workbenches.map((row) => row.owner);

  assert.equal(owners.includes("葛梓"), false);
  assert.equal(owners.includes("李四"), false);
  assert.equal(owners.includes("张三"), true);
});

test("buildLocalPmcDashboard uses local role config to exclude non-followup owners", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    userRoles: [
      { name: "王财务", role: "财务", is_followup: 0 }
    ],
    salesOrders: [
      { order_no: "PO-FIN-OPEN", customer: "客户A", owner: "王财务", product_name: "钼板", delivery_date: "2026-05-29", signed_date: "2026-05-01", status_text: "生产中" },
      { order_no: "PO-SALES-OPEN", customer: "客户B", owner: "赵跟单", product_name: "钽杯", delivery_date: "2026-05-29", signed_date: "2026-05-01", status_text: "生产中" }
    ]
  });

  const owners = body.sections.owner_workbenches.map((row) => row.owner);

  assert.equal(owners.includes("王财务"), false);
  assert.equal(owners.includes("赵跟单"), true);
});

test("buildLocalPmcDashboard excludes numeric ERP owner ids from followup workbench", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    procedurePlans: [
      { work_assignment_id: "W-151", owner: "151", product_name: "固定座", procedure_name: "无心磨", remaining_qty: 10, planned_finish_date: "2026-05-28" },
      { work_assignment_id: "W-ZS", owner: "张三", product_name: "钼板", procedure_name: "冲压", remaining_qty: 10, planned_finish_date: "2026-05-28" }
    ]
  });

  const owners = body.sections.owner_workbenches.map((row) => row.owner);

  assert.equal(owners.includes("151"), false);
  assert.equal(owners.includes("张三"), true);
});

test("buildLocalPmcDashboard builds an order battle map from procedure stages", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    procedurePlans: [
      { work_assignment_id: "W-1", order_no: "PO-1", product_name: "钼带", procedure_name: "熔炼", work_center_name: "熔炼炉", remaining_qty: 0, planned_finish_date: "2026-05-20", state: "已完工" },
      { work_assignment_id: "W-1", order_no: "PO-1", product_name: "钼带", procedure_name: "0.4轧至0.25", work_center_name: "420四辊轧机", remaining_qty: 20, planned_finish_date: "2026-05-23", state: "生产中" },
      { work_assignment_id: "W-2", order_no: "PO-2", product_name: "钽杯", procedure_name: "质检", work_center_name: "质检", remaining_qty: 5, planned_finish_date: "2026-05-27", state: "待检" }
    ]
  });

  assert.deepEqual(body.sections.order_battle_stages, ["熔炼", "轧制", "机加工", "热处理", "表面处理", "质检", "包装", "待发"]);
  assert.equal(body.summary.battle_map_orders, 2);
  assert.equal(body.summary.battle_map_red_nodes, 1);
  assert.equal(body.summary.battle_map_yellow_nodes, 1);
  assert.equal(body.sections.order_battle_map[0].order_no, "PO-1");
  assert.equal(body.sections.order_battle_map[0].current_stage, "轧制");
  assert.equal(body.sections.order_battle_map[0].stage_轧制.status, "red");
  assert.equal(body.sections.order_battle_map[1].stage_质检.status, "yellow");
  assert.equal(body.sections.order_battle_summary[0].stage, "轧制");
  assert.equal(body.sections.order_battle_summary[0].red_nodes, 1);
  assert.equal(body.sections.order_battle_summary.find((row) => row.stage === "质检").yellow_nodes, 1);
});

test("buildLocalPmcDashboard reports order-procedure match coverage", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    salesOrders: [
      { order_no: "PO-1", customer: "客户A", product_name: "钼带", delivery_date: "2026-05-30" },
      { order_no: "PO-2", customer: "客户B", product_name: "钽杯", delivery_date: "2026-06-02" },
      { order_no: "PO-3", customer: "客户C", product_name: "铌杯", delivery_date: "2026-06-05" }
    ],
    procedurePlans: [
      { work_assignment_id: "W-1", order_no: "PO-1", product_name: "钼带", procedure_name: "轧制", remaining_qty: 10, planned_finish_date: "2026-05-28" },
      { work_assignment_id: "W-2", order_no: "", product_name: "未知件", procedure_name: "机加工", remaining_qty: 5, planned_finish_date: "2026-05-29" },
      { work_assignment_id: "W-3", order_no: "PO-X", product_name: "外部派工", procedure_name: "质检", remaining_qty: 1, planned_finish_date: "2026-05-29" }
    ]
  });

  assert.equal(body.summary.procedure_order_match_rate, 33.3);
  assert.equal(body.summary.unmatched_procedure_plans, 2);
  assert.equal(body.sections.order_procedure_coverage[0].matched_orders, 1);
  assert.equal(body.sections.order_procedure_coverage[0].sales_orders_without_procedure, 2);
  assert.equal(body.sections.unmatched_procedure_plans.length, 2);
  assert.equal(body.sections.unmatched_procedure_plans[0].work_assignment_id, "W-2");
});

test("buildLocalPmcDashboard supports conservative assisted order-procedure matching", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    salesOrders: [
      { order_no: "PO-100", customer: "客户A", product_name: "锥形铌杯", delivery_date: "2026-05-30" },
      { order_no: "PO-200", customer: "客户B", product_name: "钼带", delivery_date: "2026-06-15" }
    ],
    procedurePlans: [
      { work_assignment_id: "W-A", order_no: "", product_name: "锥形铌杯", procedure_name: "落料", remaining_qty: 10, planned_finish_date: "2026-05-28" },
      { work_assignment_id: "W-B", order_no: "", product_name: "钨棒", procedure_name: "质检", remaining_qty: 2, planned_finish_date: "2026-05-28" }
    ]
  });

  assert.equal(body.summary.procedure_order_match_rate, 50);
  assert.equal(body.summary.assisted_matched_orders, 1);
  assert.equal(body.sections.order_procedure_matches[0].matched_by, "产品+日期辅助匹配");
  assert.equal(body.sections.order_procedure_matches[0].order_no, "PO-100");
  assert.equal(body.sections.unmatched_procedure_plans.length, 1);
  assert.equal(body.sections.unmatched_procedure_plans[0].work_assignment_id, "W-B");
});

test("buildLocalPmcDashboard reports total unmatched procedure count even when list is truncated", () => {
  const procedurePlans = Array.from({ length: 35 }, (_, index) => ({
    work_assignment_id: `W-${index + 1}`,
    order_no: "",
    product_name: `未匹配产品${index + 1}`,
    procedure_name: "机加工",
    remaining_qty: 1,
    planned_finish_date: "2026-05-28"
  }));
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    salesOrders: [
      { order_no: "PO-1", customer: "客户A", product_name: "钼带", delivery_date: "2026-05-30" }
    ],
    procedurePlans
  });

  assert.equal(body.summary.unmatched_procedure_plans, 35);
  assert.equal(body.sections.order_procedure_coverage[0].unmatched_procedure_plans, 35);
  assert.equal(body.sections.unmatched_procedure_plans.length, 30);
});

test("buildLocalPmcDashboard matches procedures by unique process report subject reference", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    salesOrders: [
      {
        order_no: "YJ生产销售20260500158",
        customer: "客户A",
        product_name: "钼杯",
        delivery_date: "2026-07-30",
        raw_json: JSON.stringify({ title: "57658 客户A YJ生产销售20260500158" })
      }
    ],
    procedurePlans: [
      { work_assignment_id: "44692", order_no: "", product_name: "钼杯", procedure_name: "引伸", remaining_qty: 10, planned_finish_date: "2026-05-28" }
    ],
    processReports: [
      { subject: "57658 钼杯", product_name: "钼杯", procedure_name: "引伸" }
    ]
  });

  assert.equal(body.summary.procedure_order_match_rate, 100);
  assert.equal(body.summary.report_subject_matched_orders, 1);
  assert.equal(body.sections.order_procedure_matches[0].order_no, "YJ生产销售20260500158");
  assert.equal(body.sections.order_procedure_matches[0].matched_by, "工序汇报主题匹配");
  assert.equal(body.sections.unmatched_procedure_plans.length, 0);
});

test("buildLocalPmcDashboard does not match ambiguous process report subject references", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    salesOrders: [
      { order_no: "PO-A", product_name: "钼杯", delivery_date: "2026-07-30", raw_json: JSON.stringify({ title: "57658 客户A PO-A" }) },
      { order_no: "PO-B", product_name: "钼杯", delivery_date: "2026-07-31", raw_json: JSON.stringify({ title: "57658 客户B PO-B" }) }
    ],
    procedurePlans: [
      { work_assignment_id: "44692", order_no: "", product_name: "钼杯", procedure_name: "引伸", remaining_qty: 10, planned_finish_date: "2026-05-28" }
    ],
    processReports: [
      { subject: "57658 钼杯", product_name: "钼杯", procedure_name: "引伸" }
    ]
  });

  assert.equal(body.summary.procedure_order_match_rate, 0);
  assert.equal(body.summary.report_subject_matched_orders, 0);
  assert.equal(body.sections.unmatched_procedure_plans.length, 1);
});

test("buildLocalPmcDashboard applies manual order-procedure links", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-24T08:00:00+08:00"),
    salesOrders: [
      { order_no: "PO-100", customer: "客户A", product_name: "钽杯", delivery_date: "2026-06-10" }
    ],
    procedurePlans: [
      { work_assignment_id: "W-A", order_no: "", product_name: "现场描述不一致", procedure_name: "落料", remaining_qty: 10, planned_finish_date: "2026-05-28" }
    ],
    procedureLinks: [
      { order_no: "PO-100", work_assignment_id: "W-A", procedure_name: "落料", actor: "PMC" }
    ]
  });

  assert.equal(body.summary.procedure_order_match_rate, 100);
  assert.equal(body.summary.manual_matched_orders, 1);
  assert.equal(body.sections.order_procedure_coverage[0].manual_matched_orders, 1);
  assert.equal(body.sections.order_procedure_matches[0].matched_by, "人工绑定");
  assert.equal(body.sections.order_procedure_matches[0].order_no, "PO-100");
  assert.equal(body.sections.unmatched_procedure_plans.length, 0);
});

test("buildLocalFinanceCenter summarizes receivables and payables by risk", () => {
  const today = new Date("2026-05-23T08:00:00+08:00");
  const receivable = mapFinanceRowForLocal({
    counterparty: "客户A",
    bill_no: "R-1",
    business_title: "钼板订单",
    amount: 1000,
    paid_amount: 200,
    unpaid_amount: 800,
    bill_date: "2026-05-01",
    due_date: "2026-05-10"
  }, "receivable", today);
  const payable = mapFinanceRowForLocal({
    counterparty: "供应商B",
    bill_no: "P-1",
    business_title: "原料采购",
    amount: 500,
    paid_amount: 100,
    unpaid_amount: 400,
    bill_date: "2026-05-20",
    due_date: "2026-05-28"
  }, "payable", today);

  const body = buildLocalFinanceCenter({ financeRows: [receivable, payable] });

  assert.equal(body.summary.receivable_records, 1);
  assert.equal(body.summary.payable_records, 1);
  assert.equal(body.summary.receivable_unpaid, 800);
  assert.equal(body.summary.payable_unpaid, 400);
  assert.equal(body.summary.overdue_receivables, 1);
  assert.equal(body.summary.due_soon_payables, 1);
  assert.equal(body.sections.receivable_debts[0].counterparty, "客户A");
  assert.equal(body.sections.due_soon_payables[0].risk_status, "7天内到期");
});

test("mapFinanceRowForLocal derives unpaid amount from ERP unpaid status", () => {
  const today = new Date("2026-05-23T08:00:00+08:00");
  const unpaidReceivable = mapFinanceRowForLocal({
    name: "客户A",
    title: "销售订单",
    money1: "34,357.00",
    date1: "2026-05-22",
    status: "未收款"
  }, "receivable", today);
  const settledReceivable = mapFinanceRowForLocal({
    name: "客户B",
    title: "销售订单",
    money1: "500.00",
    date1: "2026-05-22",
    status: "已收款"
  }, "receivable", today);
  const unpaidPayable = mapFinanceRowForLocal({
    name: "供应商A",
    title: "采购订单",
    money1: "7,317.39",
    date1: "2026-05-23",
    status: "未付款 未收票"
  }, "payable", today);

  assert.equal(unpaidReceivable.unpaid_amount, 34357);
  assert.equal(unpaidReceivable.risk_status, "未清");
  assert.equal(settledReceivable.unpaid_amount, 0);
  assert.equal(settledReceivable.risk_status, "已结清");
  assert.equal(unpaidPayable.unpaid_amount, 7317.39);
  assert.equal(unpaidPayable.risk_status, "未清");
});

test("buildLocalFinanceCenter repairs stored rows with raw ERP unpaid status", () => {
  const body = buildLocalFinanceCenter({
    financeRows: [
      {
        direction: "receivable",
        counterparty: "",
        business_title: "销售订单",
        amount: 80,
        paid_amount: null,
        unpaid_amount: null,
        bill_date: "2026-05-23",
        due_date: "",
        due_days: null,
        risk_status: "已结清",
        raw_json: JSON.stringify({ name: "美国SDI", status: "未收款", money1: "80.00", catename: "田小静" })
      }
    ]
  });

  assert.equal(body.summary.receivable_unpaid, 80);
  assert.equal(body.sections.receivables[0].counterparty, "美国SDI");
  assert.equal(body.sections.receivables[0].unpaid_amount, 80);
  assert.equal(body.sections.receivables[0].risk_status, "未清");
});

test("mapQuoteFollowupForLocal marks old or high value quote items urgent", () => {
  const row = mapQuoteFollowupForLocal({
    project_no: "Q-1",
    title: "钼板询价",
    customer: "A",
    owner: "",
    project_stage: "核价",
    estimated_amount: 120000,
    quoted_amount: 0,
    created_date: "2026-05-10"
  }, new Date("2026-05-23T08:00:00+08:00"));

  assert.equal(row.quote_no, "Q-1");
  assert.equal(row.priority, "高");
  assert.equal(row.quote_status, "待报价");
  assert.equal(row.owner, "未分配");
  assert.equal(row.age_days, 13);
});
