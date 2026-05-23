import test from "node:test";
import assert from "node:assert/strict";
import { buildLocalPmcDashboard, mapQuoteFollowupForLocal } from "../src/localAnalytics.js";

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
