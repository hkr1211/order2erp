import test from "node:test";
import assert from "node:assert/strict";

import {
  attachRiskSummary,
  collectDashboardRisks,
  riskIndexByRelatedNo,
  selectRisks,
  selectRisksForFinance,
  selectRisksForOrders,
  summarizeRisks
} from "../src/models/riskSelectors.js";

const redOrderRisk = {
  risk_id: "RISK-ORDER-1",
  risk_level: "红牌",
  risk_type: "交期超期",
  related_object: "订单",
  related_no: "PO-1",
  customer: "印度客户A",
  responsible_owner: "王少花",
  status: "待处理",
  problem: "PO-1交期超期",
  suggested_action: "客户沟通"
};
const yellowFinanceRisk = {
  risk_id: "RISK-FIN-1",
  risk_level: "黄牌",
  risk_type: "逾期应收",
  related_object: "财务",
  related_no: "AR-1",
  counterparty: "印度客户A",
  responsible_owner: "财务",
  status: "待处理",
  problem: "客户欠款逾期",
  suggested_action: "联系客户付款"
};

test("collectDashboardRisks reads unified red and yellow risks once", () => {
  const risks = collectDashboardRisks({
    sections: {
      red_risks: [redOrderRisk],
      yellow_risks: [yellowFinanceRisk, redOrderRisk]
    }
  });

  assert.deepEqual(risks.map((row) => row.risk_id), ["RISK-ORDER-1", "RISK-FIN-1"]);
});

test("selectRisks filters by object, related number, owner, customer and status", () => {
  const risks = [redOrderRisk, yellowFinanceRisk];

  assert.deepEqual(selectRisks(risks, { relatedObject: "订单" }).map((row) => row.risk_id), ["RISK-ORDER-1"]);
  assert.deepEqual(selectRisks(risks, { relatedNo: "AR-1" }).map((row) => row.risk_id), ["RISK-FIN-1"]);
  assert.deepEqual(selectRisks(risks, { owner: "王少花" }).map((row) => row.risk_id), ["RISK-ORDER-1"]);
  assert.deepEqual(selectRisks(risks, { customer: "印度客户A" }).map((row) => row.risk_id), ["RISK-ORDER-1", "RISK-FIN-1"]);
  assert.deepEqual(selectRisks(risks, { status: "待处理", riskLevel: "红牌" }).map((row) => row.risk_id), ["RISK-ORDER-1"]);
});

test("order and finance selectors return matching risk rows", () => {
  const risks = [redOrderRisk, yellowFinanceRisk];
  const orderRisks = selectRisksForOrders(risks, [{ order_no: "PO-1" }, { order_no: "PO-2" }]);
  const financeRisks = selectRisksForFinance(risks, [{ bill_no: "AR-1", counterparty: "印度客户A" }]);

  assert.deepEqual(orderRisks.map((row) => row.risk_id), ["RISK-ORDER-1"]);
  assert.deepEqual(financeRisks.map((row) => row.risk_id), ["RISK-FIN-1"]);
});

test("riskIndexByRelatedNo and attachRiskSummary add compact row context", () => {
  const index = riskIndexByRelatedNo([redOrderRisk, yellowFinanceRisk]);
  const rows = attachRiskSummary([{ order_no: "PO-1" }, { order_no: "PO-2" }], index, "order_no");

  assert.equal(index.get("PO-1")[0].risk_type, "交期超期");
  assert.equal(rows[0].risk_count, 1);
  assert.equal(rows[0].top_risk_level, "红牌");
  assert.equal(rows[0].risk_summary, "红牌 1 / 黄牌 0");
  assert.equal(rows[1].risk_count, 0);
  assert.equal(rows[1].risk_summary, "无红黄牌");
});

test("summarizeRisks returns red yellow totals and top action", () => {
  const summary = summarizeRisks([redOrderRisk, yellowFinanceRisk]);

  assert.equal(summary.risk_count, 2);
  assert.equal(summary.red_count, 1);
  assert.equal(summary.yellow_count, 1);
  assert.equal(summary.top_risk_level, "红牌");
  assert.equal(summary.top_action, "客户沟通");
});
