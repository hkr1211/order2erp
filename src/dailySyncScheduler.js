const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const DAILY_SYNC_BEIJING_HOUR = 1;

export const DAILY_HISTORY_SOURCES = ["sales_orders", "procedure_plans", "process_reports", "finance_records", "inventory_summary", "inventory_details", "purchase_orders", "suppliers"];
export const DAILY_SNAPSHOT_SOURCES = ["material_alerts", "org_users"];

export function previousBeijingDateRange(now = new Date()) {
  const beijing = new Date(now.getTime() + BEIJING_OFFSET_MS);
  const yesterdayUtc = Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth(), beijing.getUTCDate() - 1);
  const date = formatUtcDate(new Date(yesterdayUtc));
  return { start_date: date, end_date: date };
}

export function millisecondsUntilNextBeijingDailyRun(now = new Date()) {
  const beijing = new Date(now.getTime() + BEIJING_OFFSET_MS);
  let nextRunUtcMs = Date.UTC(
    beijing.getUTCFullYear(),
    beijing.getUTCMonth(),
    beijing.getUTCDate(),
    DAILY_SYNC_BEIJING_HOUR - 8,
    0,
    0,
    0
  );
  if (nextRunUtcMs <= now.getTime()) {
    nextRunUtcMs += DAY_MS;
  }
  const delay = nextRunUtcMs - now.getTime();
  return delay > 0 ? delay : DAY_MS;
}

export function millisecondsUntilNextBeijingMidnight(now = new Date()) {
  return millisecondsUntilNextBeijingDailyRun(now);
}

export function buildDailySyncPlan({
  now = new Date(),
  historySources = DAILY_HISTORY_SOURCES,
  snapshotSources = DAILY_SNAPSHOT_SOURCES,
  maxPages = 3,
  delayMs = 5000,
  pageSize = 20,
  sourceDelayMs = 5000
} = {}) {
  const range = previousBeijingDateRange(now);
  return {
    generated_at: new Date().toISOString(),
    timezone: "Asia/Shanghai",
    start_date: range.start_date,
    end_date: range.end_date,
    history_sources: [...historySources],
    snapshot_sources: [...snapshotSources],
    page_size: pageSize,
    max_pages: maxPages,
    delay_ms: delayMs,
    source_delay_ms: sourceDelayMs
  };
}

export async function runDailyIncrementalSync({
  now = new Date(),
  historySources,
  snapshotSources,
  runHistoryWindow,
  syncSnapshots,
  syncPauseGuard = () => ({ blocked: false }),
  wait = sleep,
  logger = console,
  maxPages = 3,
  delayMs = 5000,
  pageSize = 20,
  sourceDelayMs = 5000
} = {}) {
  if (typeof runHistoryWindow !== "function") {
    throw new Error("runDailyIncrementalSync requires runHistoryWindow");
  }
  if (typeof syncSnapshots !== "function") {
    throw new Error("runDailyIncrementalSync requires syncSnapshots");
  }
  const pauseGuard = syncPauseGuard();
  const plan = buildDailySyncPlan({ now, historySources, snapshotSources, maxPages, delayMs, pageSize, sourceDelayMs });
  if (pauseGuard.blocked) {
    return {
      ...plan,
      status: "skipped",
      reason: pauseGuard.reason || "同步暂停中，已跳过每日增量同步。",
      results: []
    };
  }

  const results = [];
  for (const source of plan.history_sources) {
    try {
      const result = await runHistoryWindow({
        source,
        start_date: plan.start_date,
        end_date: plan.end_date,
        pageindex: 1,
        pagesize: plan.page_size,
        max_pages: plan.max_pages,
        delay_ms: plan.delay_ms
      });
      results.push({ kind: "history", source, status: result.status || "success", rows_synced: result.rows_synced ?? 0, result });
    } catch (error) {
      results.push({ kind: "history", source, status: "failed", rows_synced: 0, error_message: summarizeError(error) });
      logger.warn?.(`Daily history sync failed for ${source}: ${summarizeError(error)}`);
    }
    await wait(plan.source_delay_ms);
  }

  if (plan.snapshot_sources.length) {
    try {
      const snapshot = await syncSnapshots({
        sources: plan.snapshot_sources.join(","),
        pagesize: 20,
        scan_size: 20,
        contract_limit: 3,
        cooldown_seconds: 0,
        force_sync: "1",
        daily_sync: "1"
      });
      results.push({ kind: "snapshot", source: plan.snapshot_sources.join(","), status: "success", rows_synced: sumRows(snapshot?.results), result: snapshot });
    } catch (error) {
      results.push({ kind: "snapshot", source: plan.snapshot_sources.join(","), status: "failed", rows_synced: 0, error_message: summarizeError(error) });
      logger.warn?.(`Daily snapshot sync failed: ${summarizeError(error)}`);
    }
  }

  const failed = results.filter((row) => row.status === "failed");
  return {
    ...plan,
    status: failed.length ? "partial_failed" : "success",
    rows_synced: results.reduce((sum, row) => sum + (Number(row.rows_synced) || 0), 0),
    results
  };
}

export function startDailySyncScheduler({
  enabled = true,
  nowFn = () => new Date(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  runDailySync,
  logger = console
} = {}) {
  if (!enabled) {
    return {
      enabled: false,
      stop: () => {},
      status: () => ({ enabled: false, message: "每日增量同步未启用。" })
    };
  }
  if (typeof runDailySync !== "function") {
    throw new Error("startDailySyncScheduler requires runDailySync");
  }

  let stopped = false;
  let timer = null;
  let nextRunAt = "";
  let lastRun = null;

  const scheduleNext = () => {
    if (stopped) {
      return;
    }
    const now = nowFn();
    const delay = millisecondsUntilNextBeijingDailyRun(now);
    nextRunAt = new Date(now.getTime() + delay).toISOString();
    timer = setTimeoutFn(async () => {
      if (stopped) {
        return;
      }
      const scheduledRunAt = new Date(new Date(nextRunAt).getTime() + 1000);
      try {
        lastRun = await runDailySync({ now: scheduledRunAt });
      } catch (error) {
        lastRun = { status: "failed", error_message: summarizeError(error), generated_at: new Date().toISOString() };
        logger.error?.("Daily incremental sync failed", error);
      } finally {
        scheduleNext();
      }
    }, delay);
    timer?.unref?.();
    logger.log?.(`Daily incremental sync scheduled at ${nextRunAt} (Beijing 01:00).`);
  };

  scheduleNext();

  return {
    enabled: true,
    stop: () => {
      stopped = true;
      if (timer) {
        clearTimeoutFn(timer);
      }
    },
    status: () => ({
      enabled: true,
      timezone: "Asia/Shanghai",
      run_hour_beijing: DAILY_SYNC_BEIJING_HOUR,
      next_run_at: nextRunAt,
      last_run: lastRun
    })
  };
}

function formatUtcDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function sumRows(rows = []) {
  return rows.reduce((sum, row) => sum + (Number(row.rows_synced) || 0), 0);
}

function summarizeError(error) {
  const message = error?.message || String(error || "未知错误");
  return message.length > 160 ? `${message.slice(0, 160)}...` : message;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
