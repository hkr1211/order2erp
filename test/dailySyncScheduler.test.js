import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDailySyncPlan,
  millisecondsUntilNextBeijingDailyRun,
  previousBeijingDateRange,
  runDailyIncrementalSync,
  startDailySyncScheduler
} from "../src/dailySyncScheduler.js";

test("previousBeijingDateRange returns yesterday in Beijing time", () => {
  const range = previousBeijingDateRange(new Date("2026-05-28T10:00:00.000Z"));

  assert.deepEqual(range, {
    start_date: "2026-05-27",
    end_date: "2026-05-27"
  });
});

test("millisecondsUntilNextBeijingDailyRun targets the next 01:00 Beijing time", () => {
  assert.equal(millisecondsUntilNextBeijingDailyRun(new Date("2026-05-28T16:59:00.000Z")), 60_000);
  assert.equal(millisecondsUntilNextBeijingDailyRun(new Date("2026-05-28T17:00:00.000Z")), 86_400_000);
});

test("buildDailySyncPlan uses yesterday and conservative sources", () => {
  const plan = buildDailySyncPlan({ now: new Date("2026-05-28T10:00:00.000Z") });

  assert.equal(plan.start_date, "2026-05-27");
  assert.equal(plan.end_date, "2026-05-27");
  assert.deepEqual(plan.history_sources, ["sales_orders", "procedure_plans", "process_reports", "finance_records", "inventory_summary", "inventory_details", "purchase_orders", "suppliers"]);
  assert.deepEqual(plan.snapshot_sources, ["material_alerts", "org_users"]);
  assert.equal(plan.max_pages, 3);
  assert.equal(plan.delay_ms, 5000);
});

test("runDailyIncrementalSync skips all ERP work when sync is paused", async () => {
  let historyCalls = 0;
  let snapshotCalls = 0;
  const result = await runDailyIncrementalSync({
    now: new Date("2026-05-28T10:00:00.000Z"),
    syncPauseGuard: () => ({ blocked: true, reason: "同步暂停中" }),
    runHistoryWindow: async () => {
      historyCalls += 1;
    },
    syncSnapshots: async () => {
      snapshotCalls += 1;
    }
  });

  assert.equal(result.status, "skipped");
  assert.equal(historyCalls, 0);
  assert.equal(snapshotCalls, 0);
});

test("runDailyIncrementalSync runs yesterday history windows and current snapshot sync", async () => {
  const historyCalls = [];
  const snapshotCalls = [];
  const result = await runDailyIncrementalSync({
    now: new Date("2026-05-28T10:00:00.000Z"),
    syncPauseGuard: () => ({ blocked: false }),
    runHistoryWindow: async (params) => {
      historyCalls.push(params);
      return { source: params.source, status: "completed", rows_synced: 1 };
    },
    syncSnapshots: async (params) => {
      snapshotCalls.push(params);
      return { results: [{ source_key: "material_alerts", status: "success", rows_synced: 2 }, { source_key: "org_users", status: "success", rows_synced: 3 }] };
    },
    wait: async () => {}
  });

  assert.equal(result.status, "success");
  assert.deepEqual(historyCalls.map((call) => call.source), ["sales_orders", "procedure_plans", "process_reports", "finance_records", "inventory_summary", "inventory_details", "purchase_orders", "suppliers"]);
  assert.equal(historyCalls[0].start_date, "2026-05-27");
  assert.equal(historyCalls[0].end_date, "2026-05-27");
  assert.equal(historyCalls[0].max_pages, 3);
  assert.equal(historyCalls[0].delay_ms, 5000);
  assert.deepEqual(snapshotCalls, [{
    sources: "material_alerts,org_users",
    pagesize: 20,
    scan_size: 20,
    contract_limit: 3,
    cooldown_seconds: 0,
    force_sync: "1",
    daily_sync: "1"
  }]);
});

test("daily scheduler uses scheduled Beijing 01:00 when timer fires a little early", async () => {
  let timerCallback = null;
  const received = [];
  const scheduler = startDailySyncScheduler({
    nowFn: () => new Date("2026-05-28T16:59:59.944Z"),
    setTimeoutFn: (callback) => {
      timerCallback = callback;
      return { unref: () => {} };
    },
    clearTimeoutFn: () => {},
    runDailySync: async ({ now }) => {
      const plan = buildDailySyncPlan({ now });
      received.push(plan);
      return plan;
    },
    logger: { log: () => {}, error: () => {} }
  });

  await timerCallback();
  scheduler.stop();

  assert.equal(received[0].start_date, "2026-05-28");
  assert.equal(received[0].end_date, "2026-05-28");
});
