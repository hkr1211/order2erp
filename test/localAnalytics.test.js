import test from "node:test";
import assert from "node:assert/strict";
import { buildLocalFinanceCenter, buildLocalPmcDashboard, mapFinanceRowForLocal, mapQuoteFollowupForLocal } from "../src/localAnalytics.js";

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
