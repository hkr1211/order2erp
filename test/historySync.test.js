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

test("historySyncParams applies added date range to process reports", () => {
  const params = historySyncParams({
    source: "process_reports",
    start_date: "2026-02-24",
    end_date: "2026-05-24",
    pageindex: 500,
    pagesize: 10
  });

  assert.equal(params.viewName, "process_reports");
  assert.equal(params.erpParams.page_index, 500);
  assert.equal(params.erpParams.page_size, 5);
  assert.equal(params.erpParams.InDate_0, "2026-02-24");
  assert.equal(params.erpParams.InDate_1, "2026-05-24");
});

test("historySyncParams supports warehouse scoped inventory tables", () => {
  const summary = historySyncParams({
    source: "inventory_summary",
    pageindex: 2,
    pagesize: 50,
    cks: "钽铌库"
  });
  const details = historySyncParams({
    source: "inventory_details",
    start_date: "2026-02-24",
    end_date: "2026-05-24",
    pageindex: 3,
    pagesize: 50,
    cks: "废料库"
  });

  assert.equal(summary.viewName, "inventory");
  assert.equal(summary.pageSize, 20);
  assert.equal(summary.erpParams.page_index, 2);
  assert.equal(summary.erpParams.page_size, 20);
  assert.equal(summary.erpParams.cks, "钽铌库");
  assert.equal(details.viewName, "inventory_details");
  assert.equal(details.erpParams.page_index, 3);
  assert.equal(details.erpParams.cks, "废料库");
  assert.equal(details.erpParams.Daterk, "2026-02-24 00:00:00,2026-05-24 23:59:59");
});

test("historySyncParams supports purchase orders and supplier profiles", () => {
  const purchase = historySyncParams({
    source: "purchase_orders",
    start_date: "2026-02-24",
    end_date: "2026-05-24",
    pageindex: 2,
    pagesize: 20
  });
  const suppliers = historySyncParams({
    source: "suppliers",
    pageindex: 3,
    pagesize: 20,
    searchKey: "金属"
  });

  assert.equal(purchase.viewName, "purchase_orders");
  assert.equal(purchase.erpParams.pageindex, 2);
  assert.equal(purchase.erpParams.pagesize, 20);
  assert.equal(purchase.erpParams.tdate1, "2026-02-24");
  assert.equal(purchase.erpParams.tdate2, "2026-05-24");
  assert.equal(suppliers.viewName, "suppliers");
  assert.equal(suppliers.erpParams.page_index, 3);
  assert.equal(suppliers.erpParams.page_size, 20);
  assert.equal(suppliers.erpParams.title, "金属");
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

test("runHistorySyncWindow ignores unique page fingerprints", async () => {
  const calls = [];
  const result = await runHistorySyncWindow({
    source: "process_reports",
    start_date: "2026-02-22",
    end_date: "2026-05-23",
    pageindex: 105,
    pagesize: 5,
    max_pages: 5,
    delay_ms: 5000,
    runPage: async (params) => {
      calls.push(params.pageindex);
      return {
        source: params.source,
        status: "success",
        rows_synced: 5,
        page_index: params.pageindex,
        page_size: params.pagesize,
        has_next: true,
        row_fingerprint: params.pageindex === 106 ? "75093|75094|75095|75096|75097" : `page-${params.pageindex}`
      };
    },
    wait: async () => {}
  });

  assert.deepEqual(calls, [105, 106, 107, 108, 109]);
  assert.equal(result.status, "completed");
  assert.equal(result.pages_executed, 5);
  assert.equal(result.stop_reason, "已达到安全窗口页数上限。");
});

test("runHistorySyncWindow stops when a duplicate process report page repeats a previous fingerprint", async () => {
  const calls = [];
  const result = await runHistorySyncWindow({
    source: "process_reports",
    start_date: "2026-02-22",
    end_date: "2026-05-23",
    pageindex: 105,
    pagesize: 5,
    max_pages: 5,
    delay_ms: 5000,
    runPage: async (params) => {
      calls.push(params.pageindex);
      return {
        source: params.source,
        status: "success",
        rows_synced: 5,
        page_index: params.pageindex,
        page_size: params.pagesize,
        has_next: true,
        row_fingerprint: params.pageindex <= 106 ? `page-${params.pageindex}` : "page-106"
      };
    },
    wait: async () => {}
  });

  assert.deepEqual(calls, [105, 106, 107]);
  assert.equal(result.status, "stopped");
  assert.match(result.stop_reason, /完全重复/);
  assert.equal(result.results.at(-1).duplicate_page, true);
  assert.match(result.results.at(-1).warning, /第 106 页/);
});

test("runHistorySyncWindow stops process reports when a page has no new rows", async () => {
  const calls = [];
  const result = await runHistorySyncWindow({
    source: "process_reports",
    start_date: "2026-02-22",
    end_date: "2026-05-23",
    pageindex: 105,
    pagesize: 5,
    max_pages: 5,
    delay_ms: 5000,
    runPage: async (params) => {
      calls.push(params.pageindex);
      return {
        source: params.source,
        status: "success",
        rows_synced: 5,
        new_rows: params.pageindex === 105 ? 5 : 0,
        page_index: params.pageindex,
        page_size: params.pagesize,
        has_next: true,
        row_fingerprint: `page-${params.pageindex}`
      };
    },
    wait: async () => {}
  });

  assert.deepEqual(calls, [105, 106]);
  assert.equal(result.status, "stopped");
  assert.match(result.stop_reason, /全部已存在/);
  assert.equal(result.results.at(-1).no_new_rows, true);
});

test("runHistorySyncWindow stops inventory details when a page has no new rows", async () => {
  const calls = [];
  const result = await runHistorySyncWindow({
    source: "inventory_details",
    start_date: "2026-02-27",
    end_date: "2026-05-28",
    pageindex: 51,
    pagesize: 20,
    max_pages: 5,
    delay_ms: 5000,
    runPage: async (params) => {
      calls.push(params.pageindex);
      return {
        source: params.source,
        status: "success",
        rows_synced: 20,
        new_rows: params.pageindex === 51 ? 20 : 0,
        page_index: params.pageindex,
        page_size: params.pagesize,
        has_next: true,
        row_fingerprint: `inventory-${params.pageindex}`
      };
    },
    wait: async () => {}
  });

  assert.deepEqual(calls, [51, 52]);
  assert.equal(result.status, "stopped");
  assert.match(result.stop_reason, /全部已存在/);
  assert.equal(result.results.at(-1).no_new_rows, true);
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
