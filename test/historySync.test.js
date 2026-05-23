import test from "node:test";
import assert from "node:assert/strict";
import { buildHistorySyncProgress, defaultHistoryRange, historySyncParams } from "../src/historySync.js";

test("defaultHistoryRange returns the last 90 days", () => {
  const range = defaultHistoryRange(new Date("2026-05-23T08:00:00+08:00"));

  assert.equal(range.end_date, "2026-05-23");
  assert.equal(range.start_date, "2026-02-22");
});

test("historySyncParams limits sales order batch size and applies date range", () => {
  const params = historySyncParams({
    source: "sales_orders",
    start_date: "2026-02-22",
    end_date: "2026-05-23",
    pageindex: 2,
    pagesize: 200
  });

  assert.equal(params.viewName, "sales_orders");
  assert.equal(params.pageSize, 20);
  assert.equal(params.erpParams.dateQD_0, "2026-02-22");
  assert.equal(params.erpParams.dateQD_1, "2026-05-23");
  assert.equal(params.erpParams.pageindex, 2);
});

test("buildHistorySyncProgress suggests next page after success", () => {
  const progress = buildHistorySyncProgress({
    sources: [{ source: "sales_orders", label: "销售订单" }],
    latestRuns: [{
      source: "sales_orders",
      status: "success",
      rows_synced: 20,
      page_index: 3,
      page_size: 20,
      start_date: "2026-02-22",
      end_date: "2026-05-23",
      finished_at: "2026-05-23T12:00:00.000Z"
    }]
  });

  assert.equal(progress[0].last_status, "success");
  assert.equal(progress[0].next_page_index, 4);
  assert.match(progress[0].next_action, /继续第 4 页/);
  assert.match(progress[0].next_run, /pageindex=4/);
});
