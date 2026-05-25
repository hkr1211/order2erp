import test from "node:test";
import assert from "node:assert/strict";
import { buildLocalFinanceCenter, buildLocalPmcDashboard, buildUserRoleCandidates, mapFinanceRowForLocal, mapQuoteFollowupForLocal } from "../src/localAnalytics.js";

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

test("buildLocalPmcDashboard includes synced quote, procedure, and finance data", () => {
  const body = buildLocalPmcDashboard({
    today: new Date("2026-05-23T08:00:00+08:00"),
    salesOrders: [],
    materialAlerts: [],
    quoteFollowups: [
      { quote_no: "Q-1", title: "钼板询价", customer: "客户A", project_stage: "核价", estimated_amount: 120000, quoted_amount: 0, created_date: "2026-05-10", age_days: 13, priority: "高", quote_status: "待报价", action: "优先报价" },
      { quote_no: "Q-2", title: "钽片复购", customer: "客户B", project_stage: "已报价", estimated_amount: 50000, quoted_amount: 48000, created_date: "2026-05-21", age_days: 2, priority: "低", quote_status: "已报价待确认" }
    ],
    procedurePlans: [
      { work_assignment_id: "W-1", order_no: "SO-1", product_name: "钼板", procedure_name: "冲压", work_center_name: "冲压工段", planned_qty: 10, finished_qty: 2, remaining_qty: 8, planned_finish_date: "2026-05-20", owner: "张三", state: "生产中" },
      { work_assignment_id: "W-2", order_no: "SO-2", product_name: "钨棒", procedure_name: "质检", work_center_name: "质检", planned_qty: 5, finished_qty: 5, remaining_qty: 0, planned_finish_date: "2026-05-22", owner: "李四", state: "已完工" }
    ],
    financeRows: [
      { direction: "receivable", counterparty: "客户A", bill_no: "R-1", business_title: "钼板订单", unpaid_amount: 800, due_date: "2026-05-10", due_days: -13, risk_status: "已逾期" },
      { direction: "payable", counterparty: "供应商B", bill_no: "P-1", business_title: "原料采购", unpaid_amount: 400, due_date: "2026-05-28", due_days: 5, risk_status: "7天内到期" }
    ]
  });

  assert.equal(body.summary.pending_quote_projects, 1);
  assert.equal(body.summary.procedure_plan_rows, 2);
  assert.equal(body.summary.delayed_procedures, 1);
  assert.equal(body.summary.overdue_receivables, 1);
  assert.equal(body.summary.due_soon_payables, 1);
  assert.equal(body.sections.pending_quotes[0].quote_no, "Q-1");
  assert.equal(body.sections.delayed_procedures[0].work_center_name, "冲压工段");
  assert.equal(body.sections.overdue_receivables[0].bill_no, "R-1");
  assert.equal(body.source_status.sqlite_quote_followups.rows, 2);
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
  assert.equal(byName.get("李四").suggested_role, "销售/报价");
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
    ],
    quoteFollowups: [
      { quote_no: "Q-YELLOW", title: "铌件询价", customer: "客户C", project_stage: "核价", quoted_amount: 0, priority: "高", quote_status: "待报价" }
    ]
  });

  assert.equal(body.command_center.red_count, 3);
  assert.equal(body.command_center.yellow_count, 3);
  assert.equal(body.command_center.today_todos, 6);
  assert.equal(body.sections.red_risks.some((row) => row.risk_type === "交期超期" && row.buttons.includes("客户沟通")), true);
  assert.equal(body.sections.yellow_risks.some((row) => row.risk_type === "交期预警" && row.buttons.includes("协调工序")), true);
  assert.equal(body.sections.red_risks.some((row) => row.rule_reason.includes("必须今天处理")), true);
  assert.equal(body.sections.yellow_risks.some((row) => row.rule_reason.includes("3天内可能恶化")), true);
  assert.equal(body.sections.intervention_tasks[0].primary_action, "优先确认冲压产能、模具和插单影响");
  assert.equal(body.sections.intervention_tasks.some((row) => row.buttons.includes("生成催货文本")), true);
  assert.equal(body.sections.morning_brief[0].risk_level, "红牌");
  assert.equal(body.sections.morning_brief[0].headline.includes("产能瓶颈"), true);
  assert.equal(body.sections.morning_brief[0].meeting_focus, "今天确认产能、班次和外协选择");
  assert.equal(body.sections.morning_brief[0].action_label, "加班协调");
  assert.equal(body.sections.morning_brief.some((row) => row.buttons.includes("标记处理中")), true);
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
    ],
    quoteFollowups: [
      { quote_no: "Q-ZS", owner: "张三", title: "钼板询价", quoted_amount: 0, priority: "高", quote_status: "待报价" },
      { quote_no: "Q-LS", owner: "李四", title: "钽杯询价", quoted_amount: 0, priority: "高", quote_status: "待报价" }
    ]
  });

  assert.equal(body.owner_filter, "张三");
  assert.equal(body.summary.month_orders, 1);
  assert.equal(body.sections.due_soon_orders[0].order_no, "PO-ZS");
  assert.equal(body.sections.shortage_orders[0].order_no, "PO-ZS");
  assert.equal(body.sections.delayed_procedures[0].work_assignment_id, "W-ZS");
  assert.equal(body.sections.pending_quotes[0].quote_no, "Q-ZS");
  assert.equal(body.sections.owner_workbenches.some((row) => row.owner === "张三" && row.active_orders === 1), true);
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
