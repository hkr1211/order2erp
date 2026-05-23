# SQLite Sync Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the first PMC modules from live-only ERP calls to a SQLite-backed sync hub that auto-syncs once on service start and supports manual sync.

**Architecture:** Add focused sync storage and sync service modules. Keep ERP field normalization close to sync code, then let `/dispatch`, `/production`, `/orders`, `/materials`, and `/system` read synchronized SQLite data first. Existing real-time API paths stay available as fallback during migration.

**Tech Stack:** Node.js ESM, built-in `node:sqlite` `DatabaseSync`, existing `ErpClient`, existing HTML rendering helpers in `src/server.js`.

---

## File Structure

- Modify `src/localDb.js`: create business sync tables and CRUD helpers for sync runs, sales orders, procedure plans, and material alerts.
- Create `src/syncService.js`: orchestrate startup/manual sync, call ERP APIs, normalize rows, write tables, and return sync summaries.
- Modify `src/server.js`: wire startup sync, add `/sync` and `/api/sync` routes, update `/dispatch` and `/production` to read local procedure plans first, extend `/system` sync status.
- Modify `package.json`: include `src/syncService.js` in `npm run check`.
- Modify `README.md`: document sync mode, manual sync URLs, and startup behavior.

## Task 1: Expand SQLite Schema And Storage Helpers

**Files:**
- Modify: `src/localDb.js`
- Test: `npm run check`

- [ ] **Step 1: Add sync table creation to `initLocalDb`**

Insert the following SQL after the existing `pmc_dashboard_snapshots` table creation in `src/localDb.js`:

```js
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      rows_synced INTEGER NOT NULL DEFAULT 0,
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
  `);
```

- [ ] **Step 2: Export sync run helpers from `src/localDb.js`**

Add these functions below `latestPmcSnapshot()`:

```js
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
```

- [ ] **Step 3: Export table replacement and read helpers from `src/localDb.js`**

Add these helpers:

```js
export function replaceSalesOrders(rows) {
  const database = initLocalDb();
  const tx = database.transaction((items) => {
    database.prepare("DELETE FROM erp_sales_orders").run();
    const stmt = database.prepare(`
      INSERT INTO erp_sales_orders
      (erp_id, order_no, customer, owner, product_name, product_code, product_model, quantity, remaining_qty, delivery_date, signed_date, amount, status_text, raw_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of items) {
      stmt.run(row.erp_id, row.order_no, row.customer, row.owner, row.product_name, row.product_code, row.product_model, row.quantity, row.remaining_qty, row.delivery_date, row.signed_date, row.amount, row.status_text, JSON.stringify(row.raw || row), row.synced_at);
    }
  });
  tx(rows);
}

export function replaceProcedurePlans(rows) {
  const database = initLocalDb();
  const tx = database.transaction((items) => {
    database.prepare("DELETE FROM erp_procedure_plans").run();
    const stmt = database.prepare(`
      INSERT INTO erp_procedure_plans
      (erp_id, work_assignment_id, order_no, product_name, product_code, product_model, procedure_name, work_center_name, planned_qty, finished_qty, remaining_qty, planned_start_date, planned_finish_date, owner, state, raw_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of items) {
      stmt.run(row.erp_id, row.work_assignment_id, row.order_no, row.product_name, row.product_code, row.product_model, row.procedure_name, row.work_center_name, row.planned_qty, row.finished_qty, row.remaining_qty, row.planned_start_date, row.planned_finish_date, row.owner, row.state, JSON.stringify(row.raw || row), row.synced_at);
    }
  });
  tx(rows);
}

export function replaceMaterialAlerts(rows) {
  const database = initLocalDb();
  const tx = database.transaction((items) => {
    database.prepare("DELETE FROM erp_material_alerts").run();
    const stmt = database.prepare(`
      INSERT INTO erp_material_alerts
      (alert_id, alert_type, order_no, customer, product_code, product_name, warehouse, demand_qty, available_qty, stock_qty, shortage_qty, priority, raw_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of items) {
      stmt.run(row.alert_id, row.alert_type, row.order_no, row.customer, row.product_code, row.product_name, row.warehouse, row.demand_qty, row.available_qty, row.stock_qty, row.shortage_qty, row.priority, JSON.stringify(row.raw || row), row.synced_at);
    }
  });
  tx(rows);
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
```

- [ ] **Step 4: Run syntax check**

Run: `npm run check`  
Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/localDb.js
git commit -m "Add SQLite sync storage tables"
```

## Task 2: Add Sync Service

**Files:**
- Create: `src/syncService.js`
- Modify: `package.json`
- Test: `npm run check`

- [ ] **Step 1: Create `src/syncService.js`**

Create this file:

```js
import { normalizeTable, toBusinessView } from "./erpClient.js";
import { queryOrderShortages } from "./orderShortages.js";
import {
  finishSyncRun,
  latestSyncRuns,
  replaceMaterialAlerts,
  replaceProcedurePlans,
  replaceSalesOrders,
  startSyncRun
} from "./localDb.js";

export async function syncCoreData(client, options = {}) {
  const sources = options.sources || ["sales_orders", "procedure_plans", "material_alerts"];
  const results = [];
  for (const source of sources) {
    if (source === "sales_orders") results.push(await syncSalesOrders(client, options));
    if (source === "procedure_plans") results.push(await syncProcedurePlans(client, options));
    if (source === "material_alerts") results.push(await syncMaterialAlerts(client, options));
  }
  return { generated_at: new Date().toISOString(), results, latest: latestSyncRuns() };
}

export async function syncSalesOrders(client, options = {}) {
  return runSync("sales_orders", async () => {
    const response = await client.queryView("sales_orders", {
      pageindex: options.pageindex || 1,
      pagesize: options.sales_pagesize || options.pagesize || 100,
      searchKey: options.searchKey || ""
    });
    const table = normalizeTable(response);
    const rows = toBusinessView("sales_orders", table).rows.map((row, index) => mapSalesOrder(row, index));
    replaceSalesOrders(rows);
    return rows.length;
  });
}

export async function syncProcedurePlans(client, options = {}) {
  return runSync("procedure_plans", async () => {
    const response = await client.queryView("procedure_plans", {
      page_index: options.page_index || options.pageindex || 1,
      page_size: options.procedure_pagesize || options.pagesize || 100,
      searchKey: options.searchKey || ""
    });
    const table = normalizeTable(response);
    const rows = table.rows.map((row, index) => mapProcedurePlan(row, index));
    replaceProcedurePlans(rows);
    return rows.length;
  });
}

export async function syncMaterialAlerts(client, options = {}) {
  return runSync("material_alerts", async () => {
    const shortageResult = await queryOrderShortages(client, {
      pageindex: options.pageindex || 1,
      pagesize: options.shortage_pagesize || 20,
      contract_limit: options.contract_limit || 5,
      scan_size: options.scan_size || 100,
      cks: options.cks || ""
    });
    const shortageRows = shortageResult?.body?.rows || [];
    const rows = shortageRows.map((row, index) => ({
      alert_id: `shortage-${row.order_no || index}-${row.product_code || index}`,
      alert_type: "shortage",
      order_no: text(row.order_no),
      customer: text(row.customer),
      product_code: text(row.product_code),
      product_name: text(row.product_name),
      warehouse: text(row.warehouse),
      demand_qty: number(row.demand_qty),
      available_qty: number(row.available_qty),
      stock_qty: number(row.stock_qty),
      shortage_qty: number(row.shortage_qty),
      priority: "高",
      raw: row,
      synced_at: new Date().toISOString()
    }));
    replaceMaterialAlerts(rows);
    return rows.length;
  });
}

async function runSync(sourceKey, action) {
  const run = startSyncRun(sourceKey);
  try {
    const rows = await action();
    return finishSyncRun(run.id, { status: "success", rows_synced: rows });
  } catch (error) {
    return finishSyncRun(run.id, {
      status: "failed",
      rows_synced: 0,
      error_message: summarizeError(error)
    });
  }
}

function mapSalesOrder(row, index) {
  return {
    erp_id: text(row.erp_id || row.ord || row.id || row.order_no || `sales-${index}`),
    order_no: text(row.order_no),
    customer: text(row.customer),
    owner: text(row.owner),
    product_name: text(row.product_name),
    product_code: text(row.product_code),
    product_model: text(row.product_model),
    quantity: number(row.quantity),
    remaining_qty: number(row.remaining_qty),
    delivery_date: text(row.delivery_date),
    signed_date: text(row.signed_date),
    amount: number(row.amount),
    status_text: text(row.status_text || row.status),
    raw: row.raw || row,
    synced_at: new Date().toISOString()
  };
}

function mapProcedurePlan(row, index) {
  const workAssignmentId = text(row.workAssignmentId || row.work_assignment_id || row["派工单ID"] || row["派工单号"]);
  const procedureId = text(row.procedurePlanId || row.id || row["工序计划ID"]);
  return {
    erp_id: procedureId || `${workAssignmentId || "procedure"}-${index}`,
    work_assignment_id: workAssignmentId,
    order_no: text(row.orderNo || row.OrderNo || row["订单编号"] || row["生产单号"] || row["派工单号"]),
    product_name: text(row.productName || row.product_name || row["产品名称"] || row.title),
    product_code: text(row.productCode || row.product_code || row["产品编号"] || row.order1),
    product_model: text(row.productModel || row.product_model || row["产品型号"]),
    procedure_name: text(row.procedureName || row.procedure_name || row["工序名称"]),
    work_center_name: text(row.workCenterName || row.work_center_name || row["工作中心名称"]),
    planned_qty: number(row.planNum || row.planned_qty || row["加工数量"] || row.num),
    finished_qty: number(row.finishNum || row.qualified_qty || row["合格数量"] || row["完工数量"]),
    remaining_qty: number(row.remainingNum || row.remaining_qty || row["剩余数量"]),
    planned_start_date: text(row.planStartDate || row.planned_start_date || row["计划开工期"]),
    planned_finish_date: text(row.planEndDate || row.planned_finish_date || row["计划完工期"]),
    owner: text(row.owner || row.person || row["工序计划负责人"] || row["负责人"]),
    state: text(row.state || row.status || row["状态"]),
    raw: row,
    synced_at: new Date().toISOString()
  };
}

function text(value) {
  return value === undefined || value === null ? "" : String(value);
}

function number(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function summarizeError(error) {
  const message = error?.message || String(error || "未知错误");
  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}
```

- [ ] **Step 2: Update `package.json` check script**

Change the `check` script to include `src/syncService.js`:

```json
"check": "node --check src/server.js && node --check src/erpClient.js && node --check src/orderShortages.js && node --check src/orderDeliveryRisks.js && node --check src/pendingQuotes.js && node --check src/localDb.js && node --check src/syncService.js"
```

- [ ] **Step 3: Run syntax check**

Run: `npm run check`  
Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/syncService.js package.json
git commit -m "Add ERP sync service"
```

## Task 3: Wire Startup And Manual Sync Routes

**Files:**
- Modify: `src/server.js`
- Test: `npm run check`, `node -e "fetch('http://127.0.0.1:3000/sync').then(r=>console.log(r.status))"`

- [ ] **Step 1: Import sync service and latest runs**

Update the imports at the top of `src/server.js`:

```js
import { initLocalDb, latestPmcSnapshot, latestSyncRuns, savePmcSnapshot } from "./localDb.js";
import { syncCoreData } from "./syncService.js";
```

- [ ] **Step 2: Start background sync after server starts**

Replace the `server.listen` callback with:

```js
server.listen(PORT, HOST, () => {
  console.log(`ERP query hub listening on http://${HOST}:${PORT}`);
  syncCoreData(client, { pagesize: 100 }).then((result) => {
    console.log(`Startup sync finished: ${result.results.map((row) => `${row.status}:${row.rows_synced}`).join(", ")}`);
  }).catch((error) => {
    console.error("Startup sync failed", error);
  });
});
```

- [ ] **Step 3: Add manual sync routes**

Add these routes before `/health`:

```js
    if (req.method === "GET" && url.pathname === "/sync") {
      const params = Object.fromEntries(url.searchParams);
      const result = await syncCoreData(client, params);
      return sendHtml(res, 200, syncStatusPage(result));
    }

    if (req.method === "GET" && url.pathname === "/api/sync") {
      const params = Object.fromEntries(url.searchParams);
      const result = await syncCoreData(client, params);
      return sendJson(res, 200, result);
    }
```

- [ ] **Step 4: Add sync status page helper**

Add near `systemStatusPage`:

```js
function syncStatusPage(body) {
  return modulePage({
    title: "数据同步",
    subtitle: "手动同步 ERP 核心数据到本地 SQLite，页面优先读取本地业务表。",
    summary: [
      ["同步源", body.results.length],
      ["成功", body.results.filter((row) => row.status === "success").length],
      ["失败", body.results.filter((row) => row.status === "failed").length],
      ["同步行数", body.results.reduce((sum, row) => sum + (Number(row.rows_synced) || 0), 0)]
    ],
    panels: [
      modulePanel("本次同步", body.results, ["source_key", "started_at", "finished_at", "status", "rows_synced", "error_message"]),
      modulePanel("最近同步状态", body.latest || latestSyncRuns(), ["source_key", "started_at", "finished_at", "status", "rows_synced", "error_message"])
    ],
    notes: [
      "服务启动时会自动同步一次；之后由本页手动触发同步。",
      "同步失败不会清空旧数据，业务页面继续显示最近一次成功数据。"
    ],
    actions: [["再次同步", "/sync"], ["系统状态", "/system"]]
  });
}
```

- [ ] **Step 5: Run checks and commit**

Run: `npm run check`  
Expected: PASS.

Run:

```bash
git add src/server.js
git commit -m "Wire manual ERP sync routes"
```

## Task 4: Read Procedure Plans From SQLite In Dispatch And Production

**Files:**
- Modify: `src/server.js`
- Test: `npm run check`, browser `/dispatch`

- [ ] **Step 1: Import `listProcedurePlans`**

Update the `src/localDb.js` import in `src/server.js`:

```js
import { initLocalDb, latestPmcSnapshot, latestSyncRuns, listProcedurePlans, savePmcSnapshot } from "./localDb.js";
```

- [ ] **Step 2: Add local production query function**

Add near `queryProductionCenter`:

```js
async function queryLocalProductionCenter(params = {}) {
  const pageSize = clampInt(params.pagesize || 100, 1, 500);
  const today = startOfDay(parseDate(params.today) || new Date());
  const procedureRows = listProcedurePlans({ limit: pageSize });
  const delayedProcedures = procedureRows
    .filter((row) => row.remaining_qty === null || row.remaining_qty > 0)
    .filter((row) => parseDate(row.planned_finish_date) && daysBetween(today, startOfDay(parseDate(row.planned_finish_date))) < 0);
  const workloadRows = productionWorkloadByCenter(procedureRows, today);
  return {
    header: { status: 0, message: "ok" },
    body: {
      model: "production_center",
      generated_at: new Date().toISOString(),
      cached: true,
      offline: false,
      summary: {
        progress_rows: 0,
        material_order_rows: 0,
        bom_rows: 0,
        procedure_plan_rows: procedureRows.length,
        delayed_procedures: delayedProcedures.length,
        work_centers: workloadRows.length,
        source_errors: 0
      },
      sections: {
        progress: [],
        material_orders: [],
        boms: [],
        procedure_plans: procedureRows,
        delayed_procedures: delayedProcedures,
        workload_by_center: workloadRows
      },
      source_status: {
        sqlite_procedure_plans: { ok: true, message: null }
      },
      notes: [
        "当前读取本地 SQLite 派工/工序计划表。",
        "点击“立即同步”可从 ERP 重新同步工序计划。"
      ]
    }
  };
}
```

- [ ] **Step 3: Update `/production` and `/dispatch` routes**

Change both routes to:

```js
      const result = parseBoolean(params.refresh) ? await queryProductionCenter(params) : await queryLocalProductionCenter(params);
```

For `/dispatch`, keep rendering `dispatchTrackingPage(result.body)`. For `/production`, keep rendering `productionCenterPage(result.body)`.

- [ ] **Step 4: Add sync action buttons**

In `productionCenterPage`, change actions to:

```js
actions: [["立即同步", "/sync?sources=procedure_plans"], ["派工追踪", "/dispatch"], ["刷新实时ERP", "/production?refresh=1"]]
```

In `dispatchTrackingPage`, change actions to:

```js
actions: [["立即同步", "/sync?sources=procedure_plans"], ["返回生产中心", "/production"], ["刷新实时ERP", "/dispatch?refresh=1"]]
```

- [ ] **Step 5: Run checks and commit**

Run: `npm run check`  
Expected: PASS.

Run:

```bash
git add src/server.js
git commit -m "Read dispatch data from SQLite"
```

## Task 5: Extend System Status And README

**Files:**
- Modify: `src/server.js`
- Modify: `README.md`
- Test: `npm run check`, browser `/system`

- [ ] **Step 1: Add sync status to `/system` data**

In `querySystemStatus`, add:

```js
  const syncRuns = latestSyncRuns();
```

Add to summary:

```js
sync_sources: syncRuns.length,
sync_failures: syncRuns.filter((row) => row.status === "failed").length
```

Add to sections:

```js
sync_runs: syncRuns
```

- [ ] **Step 2: Add sync panel to `systemStatusPage`**

Add this panel:

```js
modulePanel("最近同步状态", body.sections.sync_runs, ["source_key", "started_at", "finished_at", "status", "rows_synced", "error_message"])
```

Add action:

```js
["立即同步", "/sync"]
```

- [ ] **Step 3: Update `README.md`**

Add under “PMC 控制台 V1”:

```md
- 数据同步：`http://localhost:3000/sync`，手动同步 ERP 核心数据到 SQLite
- 同步策略：服务启动时自动同步一次，之后手动同步；同步失败保留旧数据
```

- [ ] **Step 4: Run checks and commit**

Run: `npm run check`  
Expected: PASS.

Run:

```bash
git add src/server.js README.md
git commit -m "Show ERP sync status"
```

## Task 6: End-To-End Verification

**Files:**
- No code changes unless verification finds defects.

- [ ] **Step 1: Restart the server**

Run:

```bash
lsof -ti tcp:3000
kill <pids>
npm start
```

Expected: console includes `ERP query hub listening` and `Startup sync finished`.

- [ ] **Step 2: Verify manual sync JSON**

Run:

```bash
node -e "fetch('http://127.0.0.1:3000/api/sync?sources=procedure_plans').then(async r=>{const j=await r.json(); console.log(r.status, j.results?.[0]?.source_key, j.results?.[0]?.status, j.results?.[0]?.rows_synced);})"
```

Expected: status `200`, source `procedure_plans`, status `success`, rows greater than `0`.

- [ ] **Step 3: Verify dispatch page reads local data**

Run:

```bash
node -e "fetch('http://127.0.0.1:3000/dispatch').then(async r=>{const t=await r.text(); console.log(r.status, t.includes('当前读取本地 SQLite'), t.includes('派工单ID'), t.includes('派工进度追踪表'));})"
```

Expected: `200 true true true`.

- [ ] **Step 4: Verify system page**

Run:

```bash
node -e "fetch('http://127.0.0.1:3000/system').then(async r=>{const t=await r.text(); console.log(r.status, t.includes('最近同步状态'), t.includes('procedure_plans'));})"
```

Expected: `200 true true`.

- [ ] **Step 5: Final commit if fixes were needed**

If verification required fixes, commit them:

```bash
git add src README.md package.json
git commit -m "Fix SQLite sync verification issues"
```
