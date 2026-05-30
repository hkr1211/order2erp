import test from "node:test";
import assert from "node:assert/strict";

import { standardRisksForDomain } from "../src/models/standardRiskAccess.js";

const orderRiskA = {
  risk_id: "RISK-ORDER-A",
  risk_level: "红牌",
  risk_type: "交期超期",
  related_object: "订单",
  related_no: "PO-A",
  responsible_owner: "王少花",
  customer: "印度客户A",
  suggested_action: "客户沟通"
};

const orderRiskB = {
  risk_id: "RISK-ORDER-B",
  risk_level: "黄牌",
  risk_type: "生产延误",
  related_object: "订单",
  related_no: "PO-B",
  responsible_owner: "其他跟单",
  customer: "客户B",
  suggested_action: "确认排产"
};

const financeRisk = {
  risk_id: "RISK-FIN-A",
  risk_level: "红牌",
  risk_type: "逾期应收",
  related_object: "财务",
  related_no: "AR-A",
  responsible_owner: "财务",
  counterparty: "印度客户A",
  suggested_action: "催收"
};

test("standardRisksForDomain prefers persisted standard risks over PMC snapshot risks", () => {
  const risks = standardRisksForDomain({
    domain: "orders",
    rows: [{ order_no: "PO-A" }],
    listStandardRisks: () => [orderRiskA],
    snapshot: {
      payload: {
        sections: {
          red_risks: [{ ...orderRiskB, related_no: "PO-A" }]
        }
      }
    }
  });

  assert.deepEqual(risks.map((row) => row.risk_id), ["RISK-ORDER-A"]);
});

test("standardRisksForDomain scopes order risks to the authenticated user's data range", () => {
  const risks = standardRisksForDomain({
    domain: "orders",
    rows: [{ order_no: "PO-A" }, { order_no: "PO-B" }],
    listStandardRisks: () => [orderRiskA, orderRiskB],
    authUser: { username: "wsh", display_name: "王少花", roles: ["跟单员"], scopes: {} }
  });

  assert.deepEqual(risks.map((row) => row.risk_id), ["RISK-ORDER-A"]);
});

test("standardRisksForDomain returns finance risks through the same standard model", () => {
  const risks = standardRisksForDomain({
    domain: "finance",
    rows: [{ bill_no: "AR-A", counterparty: "印度客户A" }],
    listStandardRisks: () => [orderRiskA, financeRisk],
    authUser: { username: "fin", display_name: "财务", roles: ["财务"], scopes: {} }
  });

  assert.deepEqual(risks.map((row) => row.risk_id), ["RISK-FIN-A"]);
});

test("standardRisksForDomain filters followup risks by selected owner", () => {
  const risks = standardRisksForDomain({
    domain: "followup",
    owner: "王少花",
    listStandardRisks: () => [orderRiskA, orderRiskB, financeRisk],
    authUser: { username: "wsh", display_name: "王少花", roles: ["跟单员"], scopes: {} }
  });

  assert.deepEqual(risks.map((row) => row.risk_id), ["RISK-ORDER-A"]);
});
