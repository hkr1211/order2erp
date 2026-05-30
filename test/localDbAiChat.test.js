import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("AI chat logs are persisted in local SQLite", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pmc-ai-chat-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const { initLocalDb, listAiChatLogs, saveAiChatLog } = await import(`../src/localDb.js?ai-chat-${Date.now()}`);
  initLocalDb(process.env.PMC_DB_PATH);

  const saved = saveAiChatLog({
    question: "今天老板最该关注什么？",
    answer: "优先处理红牌风险。",
    intent: "pmc_risk",
    sources: [{ table: "pmc_risk_view", rows: 2 }],
    payload: { scope: "local_sqlite_only" },
    created_at: "2026-05-29T08:40:00.000Z"
  });
  const rows = listAiChatLogs({ limit: 5 });

  assert.equal(saved.id > 0, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].question, "今天老板最该关注什么？");
  assert.equal(rows[0].intent, "pmc_risk");
  assert.deepEqual(JSON.parse(rows[0].sources_json), [{ table: "pmc_risk_view", rows: 2 }]);
});
