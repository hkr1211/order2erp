import fs from "node:fs";
import path from "node:path";
import { ErpClient } from "../src/erpClient.js";
import { historySyncParams, runHistorySyncBatch } from "../src/historySync.js";
import { finishHistorySyncRun, initLocalDb, logErpRequest, startHistorySyncRun } from "../src/localDb.js";

loadEnvFile();
initLocalDb();

const client = new ErpClient({ requestLogger: logErpRequest });
const delayMs = numberArg("delay_ms", Number(process.env.SAFE_BACKFILL_DELAY_MS || 5000));
const source = stringArg("source", "sales_orders");
const maxPages = numberArg("max_pages", 5);
const startPage = numberArg("pageindex", numberArg("page_index", 1));
const pagesize = numberArg("pagesize", numberArg("page_size", 20));
const startDate = stringArg("start_date", "");
const endDate = stringArg("end_date", "");
const cks = stringArg("cks", "");
const searchKey = stringArg("searchKey", "");
const stopNoNew = stringArg("stop_no_new", "1") !== "0";

const result = await runBackfillWindow({
  source,
  startPage,
  pagesize,
  maxPages,
  delayMs,
  startDate,
  endDate,
  cks,
  searchKey,
  stopNoNew
});

console.log(JSON.stringify(result, null, 2));

async function runBackfillWindow(options) {
  const results = [];
  const seenFingerprints = new Map();
  let stopReason = "达到本次安全页数上限";
  for (let index = 0; index < options.maxPages; index += 1) {
    const pageindex = options.startPage + index;
    const pageResult = await runRecordedPage({
      source: options.source,
      pageindex,
      pagesize: options.pagesize,
      start_date: options.startDate,
      end_date: options.endDate,
      cks: options.cks,
      searchKey: options.searchKey
    });
    results.push(pageResult);
    console.log(JSON.stringify({
      source: pageResult.source,
      page_index: pageResult.page_index,
      rows_synced: pageResult.rows_synced,
      new_rows: pageResult.new_rows,
      has_next: pageResult.has_next
    }));

    if (pageResult.row_fingerprint) {
      const previousPage = seenFingerprints.get(pageResult.row_fingerprint);
      if (previousPage) {
        stopReason = `第 ${pageResult.page_index} 页与第 ${previousPage} 页重复，停止`;
        break;
      }
      seenFingerprints.set(pageResult.row_fingerprint, pageResult.page_index);
    }
    const supportsNoNewStop = ["process_reports", "inventory_summary", "inventory_details"].includes(options.source);
    if (options.stopNoNew && supportsNoNewStop && pageResult.new_rows !== "" && Number(pageResult.rows_synced) > 0 && Number(pageResult.new_rows) === 0) {
      stopReason = "本页无新增，停止";
      break;
    }
    if (options.source === "finance_records" && Number(pageResult.raw_rows) > 0 && Number(pageResult.rows_synced) === 0 && Number(pageResult.filtered_out_rows) >= Number(pageResult.raw_rows)) {
      stopReason = "本页财务记录全部超出请求日期范围，停止";
      break;
    }
    const canUseSyncedRowsForShortPage = options.source !== "finance_records" || pageResult.raw_rows === undefined;
    if (!pageResult.has_next || (canUseSyncedRowsForShortPage && Number(pageResult.rows_synced) < pageResult.page_size)) {
      stopReason = "返回不足页大小，已到末页";
      break;
    }
    if (index < options.maxPages - 1) {
      await sleep(options.delayMs);
    }
  }
  return {
    generated_at: new Date().toISOString(),
    source: options.source,
    pages_executed: results.length,
    rows_synced: results.reduce((sum, row) => sum + (Number(row.rows_synced) || 0), 0),
    start_page_index: options.startPage,
    next_page_index: results.at(-1)?.has_next ? Number(results.at(-1).page_index) + 1 : null,
    stop_reason: stopReason,
    results
  };
}

async function runRecordedPage(params) {
  const plan = historySyncParams(params);
  const run = startHistorySyncRun({
    source: plan.source,
    page_index: plan.pageIndex,
    page_size: plan.pageSize,
    start_date: plan.range.start_date,
    end_date: plan.range.end_date
  });
  try {
    const result = await runHistorySyncBatch(client, params);
    finishHistorySyncRun(run.id, { status: "success", rows_synced: result.rows_synced });
    return result;
  } catch (error) {
    finishHistorySyncRun(run.id, { status: "failed", rows_synced: 0, error_message: summarizeError(error) });
    throw error;
  }
}

function loadEnvFile() {
  const envPath = path.resolve(".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = rest.join("=");
    }
  }
}

function stringArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function numberArg(name, fallback) {
  const value = Number(stringArg(name, ""));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeError(error) {
  const message = error?.message || String(error || "未知错误");
  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}
