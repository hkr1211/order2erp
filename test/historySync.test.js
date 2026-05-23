import test from "node:test";
import assert from "node:assert/strict";
import { defaultHistoryRange, historySyncParams } from "../src/historySync.js";

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
