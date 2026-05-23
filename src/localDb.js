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
  `);
  return db;
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
    const stmt = database.prepare(`
      INSERT INTO erp_quote_followups
      (quote_no, priority, quote_status, customer, title, owner, project_stage, estimated_amount, quoted_amount, created_date, age_days, action, risk_flags, raw_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows) {
      stmt.run(row.quote_no, row.priority, row.quote_status, row.customer, row.title, row.owner, row.project_stage, row.estimated_amount, row.quoted_amount, row.created_date, row.age_days, row.action, stringifyScalar(row.risk_flags), JSON.stringify(row.raw || row), row.synced_at);
    }
  });
}

export function replaceFinanceRecords(rows) {
  const database = initLocalDb();
  runInTransaction(database, () => {
    database.prepare("DELETE FROM erp_finance_records").run();
    const stmt = database.prepare(`
      INSERT INTO erp_finance_records
      (record_id, direction, counterparty, bill_no, business_title, amount, paid_amount, unpaid_amount, bill_date, due_date, payment_terms, age_days, due_days, risk_status, status, owner, raw_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows) {
      stmt.run(row.record_id, row.direction, row.counterparty, row.bill_no, row.business_title, row.amount, row.paid_amount, row.unpaid_amount, row.bill_date, row.due_date, row.payment_terms, row.age_days, row.due_days, row.risk_status, row.status, row.owner, JSON.stringify(row.raw || row), row.synced_at);
    }
  });
}

export function listSalesOrders({ limit = 100 } = {}) {
  return initLocalDb().prepare("SELECT * FROM erp_sales_orders ORDER BY delivery_date IS NULL, delivery_date LIMIT ?").all(limit);
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
