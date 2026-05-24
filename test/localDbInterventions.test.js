import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

test("PMC intervention logs can be saved and listed from SQLite", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pmc-interventions-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const { latestPmcInterventions, savePmcIntervention } = await import("../src/localDb.js");

  const saved = savePmcIntervention({
    risk_level: "红牌",
    risk_type: "物料断供",
    related_no: "PO51969",
    action_label: "生成催货文本",
    problem: "缺钼粉15kg",
    note: "已联系采购确认到货日期",
    actor: "PMC"
  });

  assert.ok(saved.id > 0);
  const rows = latestPmcInterventions({ limit: 5 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].related_no, "PO51969");
  assert.equal(rows[0].action_label, "生成催货文本");
  assert.equal(rows[0].actor, "PMC");
});

test("PMC intervention summary counts today's actions and recent risk types", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pmc-intervention-summary-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const modulePath = `../src/localDb.js?summary=${Date.now()}`;
  const { pmcInterventionSummary, savePmcIntervention } = await import(modulePath);

  savePmcIntervention({
    created_at: "2026-05-24T09:00:00.000Z",
    risk_level: "红牌",
    risk_type: "物料断供",
    related_no: "PO-1",
    action_label: "生成催货文本",
    actor: "PMC"
  });
  savePmcIntervention({
    created_at: "2026-05-24T10:00:00.000Z",
    risk_level: "红牌",
    risk_type: "产能瓶颈",
    related_no: "PO-2",
    action_label: "加班协调",
    actor: "生产经理"
  });
  savePmcIntervention({
    created_at: "2026-05-23T10:00:00.000Z",
    risk_level: "黄牌",
    risk_type: "报价预警",
    related_no: "Q-1",
    action_label: "客户沟通",
    actor: "销售"
  });

  const summary = pmcInterventionSummary({ today: new Date("2026-05-24T12:00:00+08:00") });

  assert.equal(summary.today_actions, 2);
  assert.equal(summary.total_actions, 3);
  assert.equal(summary.recent_actions[0].related_no, "PO-2");
  assert.equal(summary.by_risk_type.find((row) => row.risk_type === "物料断供").actions, 1);
  assert.equal(summary.by_risk_type.find((row) => row.risk_type === "产能瓶颈").actions, 1);
});
