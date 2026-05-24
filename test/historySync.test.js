import test from "node:test";
import assert from "node:assert/strict";
import { buildHistorySyncProgress, defaultHistoryRange, historySyncDryRun, historySyncParams, historySyncWindowParams, runHistorySyncWindow } from "../src/historySync.js";

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

test("historySyncParams applies 90 day range to finance records", () => {
  const params = historySyncParams({
    source: "finance_records",
    start_date: "2026-02-24",
    end_date: "2026-05-24",
    pageindex: 4,
    pagesize: 10
  });

  assert.equal(params.viewName, "finance_records");
  assert.equal(params.erpParams.receivables.tdate1, "2026-02-24");
  assert.equal(params.erpParams.receivables.tdate2, "2026-05-24");
  assert.equal(params.erpParams.payables.tdate1, "2026-02-24");
  assert.equal(params.erpParams.payables.tdate2, "2026-05-24");
  assert.equal(params.erpParams.receivables.pageindex, 4);
  assert.equal(params.erpParams.payables.pagesize, 10);
});

test("historySyncParams applies 90 day range to quote projects", () => {
  const params = historySyncParams({
    source: "quote_projects",
    start_date: "2026-02-24",
    end_date: "2026-05-24",
    pageindex: 3,
    pagesize: 10
  });

  assert.equal(params.viewName, "quote_projects");
  assert.equal(params.erpParams.tdate1, "2026-02-24");
  assert.equal(params.erpParams.tdate2, "2026-05-24");
  assert.equal(params.erpParams.pageindex, 3);
  assert.equal(params.erpParams.pagesize, 10);
  assert.equal(params.erpParams.include_all, "1");
});

test("historySyncDryRun does not access ERP and shows request parameters", () => {
  const dryRun = historySyncDryRun({
    source: "sales_orders",
    start_date: "2026-02-22",
    end_date: "2026-05-23",
    pageindex: 1,
    pagesize: 20
  });

  assert.equal(dryRun.will_access_erp, "否");
  assert.match(dryRun.erp_params_json, /dateQD_0/);
  assert.match(dryRun.notes.join(" "), /不访问 ERP/);
});

test("historySyncWindowParams clamps page count and delay for ERP safety", () => {
  const windowParams = historySyncWindowParams({
    source: "sales_orders",
    start_date: "2026-02-22",
    end_date: "2026-05-23",
    pageindex: 3,
    pagesize: 99,
    max_pages: 99,
    delay_ms: 10
  });

  assert.equal(windowParams.pageSize, 20);
  assert.equal(windowParams.startPageIndex, 3);
  assert.equal(windowParams.maxPages, 5);
  assert.equal(windowParams.delayMs, 5000);
  assert.equal(windowParams.pages[0].page_index, 3);
  assert.equal(windowParams.pages.at(-1).page_index, 7);
});

test("runHistorySyncWindow executes pages sequentially and stops after short final page", async () => {
  const calls = [];
  const waits = [];
  const result = await runHistorySyncWindow({
    source: "sales_orders",
    start_date: "2026-02-22",
    end_date: "2026-05-23",
    pageindex: 2,
    pagesize: 20,
    max_pages: 5,
    delay_ms: 5000,
    runPage: async (params) => {
      calls.push(params.pageindex);
      return {
        source: params.source,
        status: "success",
        rows_synced: params.pageindex === 3 ? 7 : 20,
        page_index: params.pageindex,
        page_size: params.pagesize,
        has_next: params.pageindex !== 3
      };
    },
    wait: async (delayMs) => {
      waits.push(delayMs);
    }
  });

  assert.deepEqual(calls, [2, 3]);
  assert.deepEqual(waits, [5000]);
  assert.equal(result.status, "stopped");
  assert.equal(result.stop_reason, "最后一页返回不足页大小，窗口已停止。");
  assert.equal(result.pages_executed, 2);
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
