import test from "node:test";
import assert from "node:assert/strict";
import { mapSalesOrder, shouldSkipSyncSource } from "../src/syncService.js";

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

test("mapSalesOrder maps Zhibang contract list fields", () => {
  const row = mapSalesOrder({
    ord: "13684",
    htid: "YJ外贸出口20260200006",
    khmc: "马万吉（Apex Life Inc）",
    xsry: "田小静",
    moneyall: "531.00",
    dateQD: "2026-02-23",
    ckjz: "出库完毕",
    fhjz: "发货完毕",
    skjz: "未收款",
    spzt: "审批通过"
  }, 0);

  assert.equal(row.order_no, "YJ外贸出口20260200006");
  assert.equal(row.customer, "马万吉（Apex Life Inc）");
  assert.equal(row.owner, "田小静");
  assert.equal(row.amount, 531);
  assert.equal(row.signed_date, "2026-02-23");
  assert.equal(row.status_text, "出库完毕 / 发货完毕 / 未收款 / 审批通过");
});
