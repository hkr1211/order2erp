import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

test("standard risks are saved as the current SQLite risk model and replace stale rows", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "standard-risks-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const modulePath = `../src/localDb.js?standard=${Date.now()}`;
  const { latestStandardRisks, saveStandardRisks, standardRiskSummary } = await import(modulePath);

  saveStandardRisks([
    {
      risk_id: "RISK-1",
      risk_level: "红牌",
      risk_type: "交期超期",
      related_object: "订单",
      related_no: "PO-1",
      source_table: "erp_sales_orders",
      source_key: "PO-1",
      source_rule: "pmc.交期超期",
      responsible_owner: "王少花",
      suggested_action: "客户沟通"
    },
    {
      risk_id: "RISK-2",
      risk_level: "黄牌",
      risk_type: "物料预警",
      related_object: "物料",
      related_no: "MO-1",
      source_table: "erp_material_alerts",
      source_key: "MO-1",
      source_rule: "pmc.物料预警",
      responsible_owner: "PMC/采购",
      suggested_action: "确认库存"
    }
  ], { generated_at: "2026-05-29T01:00:00.000Z" });

  let rows = latestStandardRisks({ limit: 10 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].risk_id, "RISK-1");
  assert.equal(rows[0].intervention_state, "待响应");
  assert.equal(rows[0].is_open, 1);
  assert.equal(rows[0].generated_at, "2026-05-29T01:00:00.000Z");

  saveStandardRisks([
    {
      risk_id: "RISK-3",
      risk_level: "红牌",
      risk_type: "产能瓶颈",
      related_object: "派工",
      related_no: "W-1",
      source_table: "erp_procedure_plans",
      source_key: "W-1",
      source_rule: "pmc.产能瓶颈",
      responsible_owner: "PMC/生产",
      suggested_action: "加班协调"
    }
  ], { generated_at: "2026-05-29T02:00:00.000Z" });

  rows = latestStandardRisks({ limit: 10 });
  const summary = standardRiskSummary();

  assert.deepEqual(rows.map((row) => row.risk_id), ["RISK-3"]);
  assert.equal(summary.total_risks, 1);
  assert.equal(summary.red_risks, 1);
  assert.equal(summary.generated_at, "2026-05-29T02:00:00.000Z");
});

test("standard risks expose latest intervention state for the same related number", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "standard-risk-closure-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const modulePath = `../src/localDb.js?closure=${Date.now()}`;
  const { latestStandardRisks, savePmcIntervention, saveStandardRisks } = await import(modulePath);

  saveStandardRisks([
    {
      risk_id: "RISK-CLOSE",
      risk_level: "红牌",
      risk_type: "物料断供",
      related_object: "订单",
      related_no: "PO-CLOSE",
      source_table: "erp_material_alerts",
      source_key: "A-1",
      source_rule: "pmc.物料断供",
      responsible_owner: "PMC/采购",
      suggested_action: "生成催货文本"
    }
  ], { generated_at: "2026-05-29T01:00:00.000Z" });
  savePmcIntervention({
    created_at: "2026-05-29T03:00:00.000Z",
    risk_type: "物料断供",
    related_no: "PO-CLOSE",
    action_label: "关闭问题",
    intervention_state: "已关闭",
    result_type: "供应商跟催",
    promised_date: "2026-05-30",
    next_owner: "采购经理",
    note: "已确认到货",
    actor: "PMC"
  });

  const rows = latestStandardRisks({ open_only: false });

  assert.equal(rows[0].intervention_state, "已关闭");
  assert.equal(rows[0].is_open, 0);
  assert.equal(rows[0].latest_intervention, "关闭问题");
  assert.equal(rows[0].latest_actor, "PMC");
  assert.equal(rows[0].latest_at, "2026-05-29T03:00:00.000Z");
});
