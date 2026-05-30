import test from "node:test";
import assert from "node:assert/strict";

import {
  createStandardRisk,
  inferRelatedObject,
  inferSourceTable,
  riskIdentitySeed
} from "../src/models/riskModel.js";

test("createStandardRisk returns a stable unified risk contract", () => {
  const risk = createStandardRisk({
    risk_level: "红牌",
    risk_type: "产能瓶颈",
    risk_score: 95,
    related_no: "W-1",
    problem: "冲压工序延期",
    owner_role: "PMC/冲压工段",
    suggested_action: "安排夜班",
    status: "待处理",
    buttons: ["加班协调"],
    source_key: "W-1",
    match_method: "人工绑定"
  });
  const same = createStandardRisk({
    risk_level: "红牌",
    risk_type: "产能瓶颈",
    related_no: "W-1",
    source_key: "W-1"
  });

  assert.match(risk.risk_id, /^RISK-/);
  assert.equal(risk.risk_id, same.risk_id);
  assert.equal(risk.related_object, "派工");
  assert.equal(risk.source_table, "erp_procedure_plans");
  assert.equal(risk.source_rule, "pmc.产能瓶颈");
  assert.equal(risk.responsible_owner, "PMC/冲压工段");
  assert.equal(risk.suggested_action, "安排夜班");
  assert.deepEqual(risk.buttons, ["加班协调"]);
  assert.equal(risk.match_method, "人工绑定");
});

test("createStandardRisk accepts explicit source trace fields", () => {
  const risk = createStandardRisk({
    risk_level: "黄牌",
    risk_type: "逾期应收",
    related_object: "财务",
    related_no: "AR-1",
    source_table: "erp_finance_records",
    source_key: "F-1",
    source_rule: "finance.overdue_receivable",
    responsible_owner: "财务",
    suggested_action: "联系客户付款"
  });

  assert.equal(risk.source_table, "erp_finance_records");
  assert.equal(risk.source_key, "F-1");
  assert.equal(risk.source_rule, "finance.overdue_receivable");
  assert.equal(risk.related_object, "财务");
  assert.equal(risk.risk_id, createStandardRisk({ ...risk }).risk_id);
});

test("risk inference maps known PMC risk types to source tables and objects", () => {
  assert.equal(inferSourceTable("物料断供"), "erp_material_alerts");
  assert.equal(inferSourceTable("物料预警"), "erp_material_alerts");
  assert.equal(inferSourceTable("交期超期"), "erp_sales_orders");
  assert.equal(inferSourceTable("前道断点"), "erp_procedure_plans");
  assert.equal(inferSourceTable("逾期应收"), "erp_finance_records");
  assert.equal(inferRelatedObject("物料预警"), "物料");
  assert.equal(inferRelatedObject("交期预警"), "订单");
  assert.equal(inferRelatedObject("产能预警"), "派工");
});

test("riskIdentitySeed includes source fields for traceability", () => {
  const seed = riskIdentitySeed({
    risk_level: "红牌",
    risk_type: "物料断供",
    related_object: "订单",
    related_no: "PO-1",
    source_table: "erp_material_alerts",
    source_key: "A-1",
    source_rule: "pmc.物料断供"
  });

  assert.equal(seed, "红牌|物料断供|订单|PO-1|erp_material_alerts|A-1|pmc.物料断供");
});
