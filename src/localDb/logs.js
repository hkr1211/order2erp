export function createLocalLogStore({ getDb }) {
  const database = () => getDb();
  return {
    startSyncRun: (sourceKey) => startSyncRun(database(), sourceKey),
    finishSyncRun: (id, result) => finishSyncRun(database(), id, result),
    latestSyncRuns: () => latestSyncRuns(database()),
    logErpRequest: (entry) => logErpRequest(database(), entry),
    latestErpRequestLogs: (options) => latestErpRequestLogs(database(), options),
    saveAiChatLog: (entry) => saveAiChatLog(database(), entry),
    listAiChatLogs: (params) => listAiChatLogs(database(), params),
    startHistorySyncRun: (entry) => startHistorySyncRun(database(), entry),
    finishHistorySyncRun: (id, result) => finishHistorySyncRun(database(), id, result),
    latestHistorySyncRuns: () => latestHistorySyncRuns(database())
  };
}

function startSyncRun(database, sourceKey) {
  const startedAt = new Date().toISOString();
  const result = database
    .prepare("INSERT INTO sync_runs (source_key, started_at, status) VALUES (?, ?, ?)")
    .run(sourceKey, startedAt, "running");
  return { id: result.lastInsertRowid, source_key: sourceKey, started_at: startedAt };
}

function finishSyncRun(database, id, { status, rows_synced = 0, error_message = null }) {
  const finishedAt = new Date().toISOString();
  database
    .prepare("UPDATE sync_runs SET finished_at = ?, status = ?, rows_synced = ?, error_message = ? WHERE id = ?")
    .run(finishedAt, status, rows_synced, error_message, id);
  return { id, finished_at: finishedAt, status, rows_synced, error_message };
}

function latestSyncRuns(database) {
  return database
    .prepare(
      `SELECT source_key, started_at, finished_at, status, rows_synced, error_message
       FROM sync_runs
       WHERE id IN (SELECT MAX(id) FROM sync_runs GROUP BY source_key)
       ORDER BY source_key`
    )
    .all();
}

function logErpRequest(database, entry = {}) {
  database
    .prepare(
      "INSERT INTO erp_request_logs (requested_at, method, path, status, duration_ms, error_message) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      entry.requested_at || new Date().toISOString(),
      entry.method || "POST",
      entry.path || "",
      entry.status || "unknown",
      Number(entry.duration_ms) || 0,
      entry.error_message || ""
    );
}

function latestErpRequestLogs(database, options = 20) {
  const normalized = typeof options === "object" && options !== null ? options : { limit: options };
  const limit = Math.max(1, Math.min(Number(normalized.limit) || 20, 500));
  const filters = [];
  const values = [];
  if (normalized.status) {
    filters.push("status = ?");
    values.push(String(normalized.status));
  }
  if (normalized.path) {
    filters.push("path LIKE ?");
    values.push(`%${String(normalized.path)}%`);
  }
  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  return database
    .prepare(
      `SELECT requested_at, method, path, status, duration_ms, error_message
       FROM erp_request_logs
       ${whereClause}
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(...values, limit);
}

function saveAiChatLog(database, { question, answer, intent = "unknown", sources = [], payload = {}, created_at = "" } = {}) {
  const createdAt = created_at || new Date().toISOString();
  const result = database
    .prepare("INSERT INTO ai_chat_logs (created_at, question, answer, intent, sources_json, payload_json) VALUES (?, ?, ?, ?, ?, ?)")
    .run(createdAt, String(question || ""), String(answer || ""), String(intent || "unknown"), JSON.stringify(sources || []), JSON.stringify(payload || {}));
  return { id: result.lastInsertRowid, created_at: createdAt, question, answer, intent, sources, payload };
}

function listAiChatLogs(database, { limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
  return database
    .prepare("SELECT id, created_at, question, answer, intent, sources_json, payload_json FROM ai_chat_logs ORDER BY id DESC LIMIT ?")
    .all(safeLimit);
}

function startHistorySyncRun(database, { source, page_index = 1, page_size = 20, start_date = "", end_date = "" }) {
  const startedAt = new Date().toISOString();
  const result = database
    .prepare(
      "INSERT INTO history_sync_runs (source, started_at, status, page_index, page_size, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(source, startedAt, "running", page_index, page_size, start_date, end_date);
  return { id: result.lastInsertRowid, source, started_at: startedAt };
}

function finishHistorySyncRun(database, id, { status, rows_synced = 0, error_message = "" }) {
  const finishedAt = new Date().toISOString();
  database
    .prepare("UPDATE history_sync_runs SET finished_at = ?, status = ?, rows_synced = ?, error_message = ? WHERE id = ?")
    .run(finishedAt, status, rows_synced, error_message, id);
  return { id, finished_at: finishedAt, status, rows_synced, error_message };
}

function latestHistorySyncRuns(database) {
  return database
    .prepare(
      `SELECT source, started_at, finished_at, status, rows_synced, page_index, page_size, start_date, end_date, error_message
       FROM history_sync_runs
       WHERE id IN (SELECT MAX(id) FROM history_sync_runs GROUP BY source)
       ORDER BY source`
    )
    .all();
}
