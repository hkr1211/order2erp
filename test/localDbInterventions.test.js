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
