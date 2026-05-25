import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_DB_PATH = path.resolve("data/pmc.db");

let db;

export function initLocalDb(dbPath = process.env.PMC_DB_PATH || DEFAULT_DB_PATH) {
  if (db) {
    return db;
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS pmc_dashboard_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      rows_synced INTEGER NOT NULL DEFAULT 0,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS erp_request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requested_at TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS history_sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      rows_synced INTEGER NOT NULL DEFAULT 0,
      page_index INTEGER NOT NULL DEFAULT 1,
      page_size INTEGER NOT NULL DEFAULT 20,
      start_date TEXT,
      end_date TEXT,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS pmc_intervention_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      risk_level TEXT,
      risk_type TEXT,
      related_no TEXT,
      action_label TEXT NOT NULL,
      intervention_state TEXT,
      result_type TEXT,
      promised_date TEXT,
      next_owner TEXT,
      problem TEXT,
      note TEXT,
      actor TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_procedure_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL,
      work_assignment_id TEXT NOT NULL,
      procedure_name TEXT,
      product_name TEXT,
      reason TEXT,
      actor TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(order_no, work_assignment_id, procedure_name)
    );

    CREATE TABLE IF NOT EXISTS erp_sales_orders (
      erp_id TEXT PRIMARY KEY,
      order_no TEXT,
      customer TEXT,
      owner TEXT,
      product_name TEXT,
      product_code TEXT,
      product_model TEXT,
      quantity REAL,
      remaining_qty REAL,
      delivery_date TEXT,
      signed_date TEXT,
      amount REAL,
      status_text TEXT,
      raw_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS erp_procedure_plans (
      erp_id TEXT PRIMARY KEY,
      work_assignment_id TEXT,
      order_no TEXT,
      product_name TEXT,
      product_code TEXT,
      product_model TEXT,
      procedure_name TEXT,
      work_center_name TEXT,
      planned_qty REAL,
      finished_qty REAL,
      remaining_qty REAL,
      planned_start_date TEXT,
      planned_finish_date TEXT,
      owner TEXT,
      state TEXT,
      raw_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS erp_material_alerts (
      alert_id TEXT PRIMARY KEY,
      alert_type TEXT NOT NULL,
      order_no TEXT,
      customer TEXT,
      product_code TEXT,
      product_name TEXT,
      warehouse TEXT,
      demand_qty REAL,
      available_qty REAL,
      stock_qty REAL,
      shortage_qty REAL,
      priority TEXT,
      raw_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS erp_quote_followups (
      quote_no TEXT PRIMARY KEY,
      priority TEXT,
      quote_status TEXT,
      customer TEXT,
      title TEXT,
      owner TEXT,
      project_stage TEXT,
      estimated_amount REAL,
      quoted_amount REAL,
      created_date TEXT,
      age_days INTEGER,
      action TEXT,
      risk_flags TEXT,
      raw_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS erp_quote_exclusions (
      quote_no TEXT PRIMARY KEY,
      reason TEXT,
      actor TEXT,
      excluded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS erp_finance_records (
      record_id TEXT PRIMARY KEY,
      direction TEXT NOT NULL,
      counterparty TEXT,
      bill_no TEXT,
      business_title TEXT,
      amount REAL,
      paid_amount REAL,
      unpaid_amount REAL,
      bill_date TEXT,
      due_date TEXT,
      payment_terms TEXT,
      age_days INTEGER,
      due_days INTEGER,
      risk_status TEXT,
      status TEXT,
      owner TEXT,
      raw_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_user_roles (
      name TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      is_followup INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  ensureColumn(db, "pmc_intervention_logs", "intervention_state", "TEXT");
  ensureColumn(db, "pmc_intervention_logs", "result_type", "TEXT");
  ensureColumn(db, "pmc_intervention_logs", "promised_date", "TEXT");
  ensureColumn(db, "pmc_intervention_logs", "next_owner", "TEXT");
  seedDefaultLocalUserRoles(db);
  return db;
}

function ensureColumn(database, tableName, columnName, columnType) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
  }
}

export function savePmcSnapshot(payload) {
  const database = initLocalDb();
  const createdAt = payload.generated_at || new Date().toISOString();
  const summary = payload.summary || {};
  database
    .prepare(
      "INSERT INTO pmc_dashboard_snapshots (created_at, summary_json, payload_json) VALUES (?, ?, ?)"
    )
    .run(createdAt, JSON.stringify(summary), JSON.stringify(payload));
}

export function latestPmcSnapshot() {
  const database = initLocalDb();
  const row = database
    .prepare("SELECT created_at, summary_json, payload_json FROM pmc_dashboard_snapshots ORDER BY id DESC LIMIT 1")
    .get();
  if (!row) {
    return null;
  }
  return {
    created_at: row.created_at,
    summary: JSON.parse(row.summary_json),
    payload: JSON.parse(row.payload_json)
  };
}

export function savePmcIntervention(entry) {
  const database = initLocalDb();
  const createdAt = entry.created_at || new Date().toISOString();
  const payload = {
    risk_level: entry.risk_level || "",
    risk_type: entry.risk_type || "",
    related_no: entry.related_no || "",
    action_label: entry.action_label || "",
    intervention_state: normalizeInterventionState(entry.intervention_state || entry.state || entry.status || entry.action_label),
    result_type: entry.result_type || defaultResultType(entry.action_label || entry.risk_type || ""),
    promised_date: entry.promised_date || "",
    next_owner: entry.next_owner || "",
    problem: entry.problem || "",
    note: entry.note || "",
    actor: entry.actor || "内网用户"
  };
  const result = database
    .prepare(
      `INSERT INTO pmc_intervention_logs
       (created_at, risk_level, risk_type, related_no, action_label, intervention_state, result_type, promised_date, next_owner, problem, note, actor, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(createdAt, payload.risk_level, payload.risk_type, payload.related_no, payload.action_label, payload.intervention_state, payload.result_type, payload.promised_date, payload.next_owner, payload.problem, payload.note, payload.actor, JSON.stringify({ ...entry, ...payload }));
  return { id: result.lastInsertRowid, created_at: createdAt, ...payload };
}

function defaultResultType(value = "") {
  const text = String(value || "");
  if (/调拨/.test(text)) return "调拨库存";
  if (/替代/.test(text)) return "替代料";
  if (/催|供应商|物流/.test(text)) return "供应商跟催";
  if (/加班|增班/.test(text)) return "加班增产";
  if (/外协/.test(text)) return "外协处理";
  if (/排程|协调|顺序/.test(text)) return "调整排程";
  if (/客户|沟通|通知/.test(text)) return "客户沟通";
  return "其他处理";
}

function normalizeInterventionState(value = "") {
  const text = String(value || "").trim();
  if (/关闭|完成|闭环|已处理/.test(text)) return "已关闭";
  if (/响应|已响应/.test(text)) return "已响应";
  if (/处理中|处理|跟踪|催|协调|沟通|调拨|替代|排程|加班|外协|通知/.test(text)) return "处理中";
  return "处理中";
}

export function latestPmcInterventions({ limit = 20, related_no = "", risk_type = "", actor = "", intervention_state = "", date_from = "", date_to = "" } = {}) {
  const database = initLocalDb();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 200));
  const filters = [];
  const values = [];
  if (related_no) {
    filters.push("related_no LIKE ?");
    values.push(`%${String(related_no).trim()}%`);
  }
  if (risk_type) {
    filters.push("risk_type = ?");
    values.push(String(risk_type).trim());
  }
  if (actor) {
    filters.push("actor LIKE ?");
    values.push(`%${String(actor).trim()}%`);
  }
  if (intervention_state) {
    filters.push("intervention_state = ?");
    values.push(String(intervention_state).trim());
  }
  if (date_from) {
    filters.push("created_at >= ?");
    values.push(String(date_from).trim());
  }
  if (date_to) {
    filters.push("created_at <= ?");
    values.push(String(date_to).trim());
  }
  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  return database
    .prepare(
      `SELECT id, created_at, risk_level, risk_type, related_no, action_label, intervention_state, result_type, promised_date, next_owner, problem, note, actor, payload_json
       FROM pmc_intervention_logs
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(...values, safeLimit);
}

export function latestPmcInterventionsByRelatedNos(relatedNos = []) {
  const keys = [...new Set(relatedNos.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!keys.length) {
    return new Map();
  }
  const database = initLocalDb();
  const placeholders = keys.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `SELECT id, created_at, risk_level, risk_type, related_no, action_label, intervention_state, result_type, promised_date, next_owner, problem, note, actor, payload_json
       FROM pmc_intervention_logs
       WHERE related_no IN (${placeholders})
       ORDER BY created_at DESC, id DESC`
    )
    .all(...keys);
  const latestByNo = new Map();
  for (const row of rows) {
    if (!latestByNo.has(row.related_no)) {
      latestByNo.set(row.related_no, row);
    }
  }
  return latestByNo;
}

export function saveOrderProcedureLink(entry = {}) {
  const database = initLocalDb();
  const orderNo = String(entry.order_no || "").trim();
  const workAssignmentId = String(entry.work_assignment_id || "").trim();
  const procedureName = String(entry.procedure_name || "").trim();
  if (!orderNo || !workAssignmentId) {
    throw new Error("order_no and work_assignment_id are required");
  }
  const payload = {
    order_no: orderNo,
    work_assignment_id: workAssignmentId,
    procedure_name: procedureName,
    product_name: String(entry.product_name || "").trim(),
    reason: String(entry.reason || "").trim(),
    actor: String(entry.actor || "内网用户").trim() || "内网用户",
    created_at: entry.created_at || new Date().toISOString()
  };
  const result = database
    .prepare(
      `INSERT OR REPLACE INTO order_procedure_links
       (order_no, work_assignment_id, procedure_name, product_name, reason, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(payload.order_no, payload.work_assignment_id, payload.procedure_name, payload.product_name, payload.reason, payload.actor, payload.created_at);
  return { id: result.lastInsertRowid, ...payload };
}

export function listOrderProcedureLinks({ limit = 200 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 1000));
  return initLocalDb()
    .prepare(
      `SELECT id, order_no, work_assignment_id, procedure_name, product_name, reason, actor, created_at
       FROM order_procedure_links
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(safeLimit);
}

export function saveLocalUserRole(entry = {}) {
  const database = initLocalDb();
  const name = String(entry.name || "").trim();
  if (!name) {
    throw new Error("name is required");
  }
  const payload = {
    name,
    role: String(entry.role || "未分类").trim() || "未分类",
    is_followup: entry.is_followup === false || Number(entry.is_followup) === 0 ? 0 : 1,
    note: String(entry.note || "").trim(),
    updated_at: entry.updated_at || new Date().toISOString()
  };
  database
    .prepare("INSERT OR REPLACE INTO local_user_roles (name, role, is_followup, note, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(payload.name, payload.role, payload.is_followup, payload.note, payload.updated_at);
  return payload;
}

export function listLocalUserRoles({ limit = 200 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 1000));
  return initLocalDb()
    .prepare("SELECT name, role, is_followup, note, updated_at FROM local_user_roles ORDER BY is_followup ASC, role, name LIMIT ?")
    .all(safeLimit);
}

export function deleteLocalUserRole(name) {
  const userName = String(name || "").trim();
  if (!userName) {
    throw new Error("name is required");
  }
  const result = initLocalDb().prepare("DELETE FROM local_user_roles WHERE name = ?").run(userName);
  return { name: userName, deleted: result.changes > 0 };
}

export function pmcInterventionSummary({ today = new Date(), limit = 8 } = {}) {
  const database = initLocalDb();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 50));
  const dayStart = startOfLocalDay(today).toISOString();
  const dayEnd = endOfLocalDay(today).toISOString();
  const totalActions = database.prepare("SELECT COUNT(*) AS count FROM pmc_intervention_logs").get()?.count || 0;
  const todayActions = database
    .prepare("SELECT COUNT(*) AS count FROM pmc_intervention_logs WHERE created_at >= ? AND created_at <= ?")
    .get(dayStart, dayEnd)?.count || 0;
  const recentActions = database
    .prepare(
      `SELECT id, created_at, risk_level, risk_type, related_no, action_label, intervention_state, result_type, promised_date, next_owner, problem, note, actor, payload_json
       FROM pmc_intervention_logs
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(safeLimit);
  const byRiskType = database
    .prepare(
      `SELECT COALESCE(NULLIF(risk_type, ''), '未分类') AS risk_type, COUNT(*) AS actions
       FROM pmc_intervention_logs
       GROUP BY COALESCE(NULLIF(risk_type, ''), '未分类')
       ORDER BY actions DESC, risk_type`
    )
    .all();
  const byResultType = database
    .prepare(
      `SELECT COALESCE(NULLIF(result_type, ''), '未分类') AS result_type, COUNT(*) AS actions
       FROM pmc_intervention_logs
       GROUP BY COALESCE(NULLIF(result_type, ''), '未分类')
       ORDER BY actions DESC, result_type`
    )
    .all();
  return {
    today_actions: todayActions,
    total_actions: totalActions,
    recent_actions: recentActions,
    by_risk_type: byRiskType,
    by_result_type: byResultType
  };
}

export function excludeQuoteFollowup({ quote_no, reason = "", actor = "内网用户", excluded_at = "" } = {}) {
  const quoteNo = String(quote_no || "").trim();
  if (!quoteNo) {
    throw new Error("quote_no is required");
  }
  const database = initLocalDb();
  const excludedAt = excluded_at || new Date().toISOString();
  runInTransaction(database, () => {
    database
      .prepare("INSERT OR REPLACE INTO erp_quote_exclusions (quote_no, reason, actor, excluded_at) VALUES (?, ?, ?, ?)")
      .run(quoteNo, reason, actor, excludedAt);
    database.prepare("DELETE FROM erp_quote_followups WHERE quote_no = ?").run(quoteNo);
  });
  return { quote_no: quoteNo, reason, actor, excluded_at: excludedAt };
}

export function listQuoteExclusions({ limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 1000));
  return initLocalDb()
    .prepare("SELECT quote_no, reason, actor, excluded_at FROM erp_quote_exclusions ORDER BY excluded_at DESC LIMIT ?")
    .all(safeLimit);
}

export function startSyncRun(sourceKey) {
  const database = initLocalDb();
  const startedAt = new Date().toISOString();
  const result = database
    .prepare("INSERT INTO sync_runs (source_key, started_at, status) VALUES (?, ?, ?)")
    .run(sourceKey, startedAt, "running");
  return { id: result.lastInsertRowid, source_key: sourceKey, started_at: startedAt };
}

export function finishSyncRun(id, { status, rows_synced = 0, error_message = null }) {
  const database = initLocalDb();
  const finishedAt = new Date().toISOString();
  database
    .prepare("UPDATE sync_runs SET finished_at = ?, status = ?, rows_synced = ?, error_message = ? WHERE id = ?")
    .run(finishedAt, status, rows_synced, error_message, id);
  return { id, finished_at: finishedAt, status, rows_synced, error_message };
}

export function latestSyncRuns() {
  const database = initLocalDb();
  return database
    .prepare(
      `SELECT source_key, started_at, finished_at, status, rows_synced, error_message
       FROM sync_runs
       WHERE id IN (SELECT MAX(id) FROM sync_runs GROUP BY source_key)
       ORDER BY source_key`
    )
    .all();
}

export function logErpRequest(entry) {
  const database = initLocalDb();
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

export function latestErpRequestLogs(options = 20) {
  const database = initLocalDb();
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

export function startHistorySyncRun({ source, page_index = 1, page_size = 20, start_date = "", end_date = "" }) {
  const database = initLocalDb();
  const startedAt = new Date().toISOString();
  const result = database
    .prepare(
      "INSERT INTO history_sync_runs (source, started_at, status, page_index, page_size, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(source, startedAt, "running", page_index, page_size, start_date, end_date);
  return { id: result.lastInsertRowid, source, started_at: startedAt };
}

export function finishHistorySyncRun(id, { status, rows_synced = 0, error_message = "" }) {
  const database = initLocalDb();
  const finishedAt = new Date().toISOString();
  database
    .prepare("UPDATE history_sync_runs SET finished_at = ?, status = ?, rows_synced = ?, error_message = ? WHERE id = ?")
    .run(finishedAt, status, rows_synced, error_message, id);
  return { id, finished_at: finishedAt, status, rows_synced, error_message };
}

export function latestHistorySyncRuns() {
  const database = initLocalDb();
  return database
    .prepare(
      `SELECT source, started_at, finished_at, status, rows_synced, page_index, page_size, start_date, end_date, error_message
       FROM history_sync_runs
       WHERE id IN (SELECT MAX(id) FROM history_sync_runs GROUP BY source)
       ORDER BY source`
    )
    .all();
}

export function replaceSalesOrders(rows) {
  const database = initLocalDb();
  runInTransaction(database, () => {
    database.prepare("DELETE FROM erp_sales_orders").run();
    insertSalesOrders(database, rows);
  });
}

export function upsertSalesOrders(rows) {
  const database = initLocalDb();
  runInTransaction(database, () => {
    insertSalesOrders(database, rows);
  });
}

export function replaceProcedurePlans(rows) {
  const database = initLocalDb();
  runInTransaction(database, () => {
    database.prepare("DELETE FROM erp_procedure_plans").run();
    insertProcedurePlans(database, rows);
  });
}

export function upsertProcedurePlans(rows) {
  const database = initLocalDb();
  runInTransaction(database, () => {
    insertProcedurePlans(database, rows);
  });
}

export function replaceMaterialAlerts(rows) {
  const database = initLocalDb();
  runInTransaction(database, () => {
    database.prepare("DELETE FROM erp_material_alerts").run();
    const stmt = database.prepare(`
      INSERT INTO erp_material_alerts
      (alert_id, alert_type, order_no, customer, product_code, product_name, warehouse, demand_qty, available_qty, stock_qty, shortage_qty, priority, raw_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows) {
      stmt.run(row.alert_id, row.alert_type, row.order_no, row.customer, row.product_code, row.product_name, row.warehouse, row.demand_qty, row.available_qty, row.stock_qty, row.shortage_qty, row.priority, JSON.stringify(row.raw || row), row.synced_at);
    }
  });
}

export function replaceQuoteFollowups(rows) {
  const database = initLocalDb();
  runInTransaction(database, () => {
    database.prepare("DELETE FROM erp_quote_followups").run();
    insertQuoteFollowups(database, rows);
  });
}

export function upsertQuoteFollowups(rows) {
  const database = initLocalDb();
  runInTransaction(database, () => {
    insertQuoteFollowups(database, rows);
  });
}

export function replaceFinanceRecords(rows) {
  const database = initLocalDb();
  runInTransaction(database, () => {
    database.prepare("DELETE FROM erp_finance_records").run();
    insertFinanceRecords(database, rows);
  });
}

export function upsertFinanceRecords(rows) {
  const database = initLocalDb();
  runInTransaction(database, () => {
    insertFinanceRecords(database, rows);
  });
}

export function listSalesOrders({ limit = 100, offset = 0 } = {}) {
  return initLocalDb().prepare("SELECT * FROM erp_sales_orders ORDER BY delivery_date IS NULL, delivery_date, signed_date DESC LIMIT ? OFFSET ?").all(limit, offset);
}

export function listProcedurePlans({ limit = 100 } = {}) {
  return initLocalDb().prepare("SELECT * FROM erp_procedure_plans ORDER BY planned_finish_date IS NULL, planned_finish_date LIMIT ?").all(limit);
}

export function listMaterialAlerts({ limit = 100 } = {}) {
  return initLocalDb().prepare("SELECT * FROM erp_material_alerts ORDER BY CASE priority WHEN '高' THEN 1 WHEN '中' THEN 2 ELSE 3 END, alert_type LIMIT ?").all(limit);
}

export function listQuoteFollowups({ limit = 100 } = {}) {
  return initLocalDb().prepare("SELECT * FROM erp_quote_followups ORDER BY CASE priority WHEN '高' THEN 1 WHEN '中' THEN 2 ELSE 3 END, age_days DESC LIMIT ?").all(limit);
}

export function listFinanceRecords({ limit = 100 } = {}) {
  return initLocalDb().prepare("SELECT * FROM erp_finance_records ORDER BY CASE risk_status WHEN '已逾期' THEN 1 WHEN '7天内到期' THEN 2 WHEN '未清' THEN 3 ELSE 4 END, due_days LIMIT ?").all(limit);
}

export function tableStats(tableName, timestampColumn = null) {
  const database = initLocalDb();
  assertSafeIdentifier(tableName);
  const rowCount = database.prepare(`SELECT COUNT(*) AS row_count FROM ${tableName}`).get()?.row_count || 0;
  let latestAt = "";
  if (timestampColumn) {
    assertSafeIdentifier(timestampColumn);
    latestAt = database.prepare(`SELECT MAX(${timestampColumn}) AS latest_at FROM ${tableName}`).get()?.latest_at || "";
  }
  return {
    table_name: tableName,
    row_count: rowCount,
    latest_at: latestAt
  };
}

function assertSafeIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value))) {
    throw new Error(`Unsafe SQLite identifier: ${value}`);
  }
}

function seedDefaultLocalUserRoles(database) {
  const existing = database.prepare("SELECT name FROM local_user_roles WHERE name = ?").get("葛梓");
  if (existing) {
    return;
  }
  database
    .prepare("INSERT INTO local_user_roles (name, role, is_followup, note, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run("葛梓", "财务经理", 0, "财务应收负责人，不进入跟单员工作台", new Date().toISOString());
}

function insertSalesOrders(database, rows) {
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO erp_sales_orders
    (erp_id, order_no, customer, owner, product_name, product_code, product_model, quantity, remaining_qty, delivery_date, signed_date, amount, status_text, raw_json, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(row.erp_id, row.order_no, row.customer, row.owner, row.product_name, row.product_code, row.product_model, row.quantity, row.remaining_qty, row.delivery_date, row.signed_date, row.amount, row.status_text, JSON.stringify(row.raw || row), row.synced_at);
  }
}

function insertProcedurePlans(database, rows) {
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO erp_procedure_plans
    (erp_id, work_assignment_id, order_no, product_name, product_code, product_model, procedure_name, work_center_name, planned_qty, finished_qty, remaining_qty, planned_start_date, planned_finish_date, owner, state, raw_json, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(row.erp_id, row.work_assignment_id, row.order_no, row.product_name, row.product_code, row.product_model, row.procedure_name, row.work_center_name, row.planned_qty, row.finished_qty, row.remaining_qty, row.planned_start_date, row.planned_finish_date, row.owner, row.state, JSON.stringify(row.raw || row), row.synced_at);
  }
}

function insertQuoteFollowups(database, rows) {
  const excludedQuoteNos = quoteExclusionSet(database);
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO erp_quote_followups
    (quote_no, priority, quote_status, customer, title, owner, project_stage, estimated_amount, quoted_amount, created_date, age_days, action, risk_flags, raw_json, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    if (excludedQuoteNos.has(String(row.quote_no || "").trim())) {
      continue;
    }
    stmt.run(row.quote_no, row.priority || "", row.quote_status || "", row.customer || "", row.title || "", row.owner || "", row.project_stage || "", row.estimated_amount ?? null, row.quoted_amount ?? null, row.created_date || "", row.age_days ?? null, row.action || "", stringifyScalar(row.risk_flags), JSON.stringify(row.raw || row), row.synced_at || new Date().toISOString());
  }
}

function quoteExclusionSet(database) {
  return new Set(
    database
      .prepare("SELECT quote_no FROM erp_quote_exclusions")
      .all()
      .map((row) => String(row.quote_no || "").trim())
      .filter(Boolean)
  );
}

function insertFinanceRecords(database, rows) {
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO erp_finance_records
    (record_id, direction, counterparty, bill_no, business_title, amount, paid_amount, unpaid_amount, bill_date, due_date, payment_terms, age_days, due_days, risk_status, status, owner, raw_json, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(row.record_id, row.direction, row.counterparty, row.bill_no, row.business_title, row.amount, row.paid_amount, row.unpaid_amount, row.bill_date, row.due_date, row.payment_terms, row.age_days, row.due_days, row.risk_status, row.status, row.owner, JSON.stringify(row.raw || row), row.synced_at);
  }
}

function runInTransaction(database, action) {
  database.exec("BEGIN");
  try {
    action();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function stringifyScalar(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function startOfLocalDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfLocalDay(date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}
