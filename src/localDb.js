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
