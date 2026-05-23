import test from "node:test";
import assert from "node:assert/strict";
import { shouldSkipSyncSource } from "../src/syncService.js";

test("shouldSkipSyncSource skips repeated sync inside cooldown", () => {
  const now = Date.now();
  const skipped = shouldSkipSyncSource("sales_orders", [{
    source_key: "sales_orders",
    started_at: new Date(now - 20_000).toISOString(),
    finished_at: new Date(now - 10_000).toISOString(),
    status: "success"
  }], { cooldown_seconds: 300 });

  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.source_key, "sales_orders");
  assert.equal(skipped.rows_synced, 0);
  assert.match(skipped.error_message, /冷却时间/);
});

test("shouldSkipSyncSource allows force sync and expired cooldown", () => {
  const latestRuns = [{
    source_key: "sales_orders",
    started_at: "2026-05-23T00:00:00.000Z",
    finished_at: "2026-05-23T00:00:00.000Z",
    status: "success"
  }];

  assert.equal(shouldSkipSyncSource("sales_orders", latestRuns, { force_sync: "1" }), null);
  assert.equal(shouldSkipSyncSource("sales_orders", latestRuns, { cooldown_seconds: 1 }), null);
});
