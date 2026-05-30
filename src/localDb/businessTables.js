let getDatabase = null;

export function createLocalBusinessTableStore({ getDb }) {
  getDatabase = getDb;
  return {
    excludeQuoteFollowup,
    listQuoteExclusions,
    replaceSalesOrders,
    upsertSalesOrders,
    replaceProcedurePlans,
    upsertProcedurePlans,
    upsertProcessReports,
    existingProcessReportIds,
    replaceMaterialAlerts,
    upsertWarehouses,
    upsertInventorySummary,
    upsertInventoryDetails,
    existingInventorySummaryIds,
    existingInventoryDetailIds,
    upsertPurchaseOrders,
    upsertSuppliers,
    replaceQuoteFollowups,
    upsertQuoteFollowups,
    replaceFinanceRecords,
    upsertFinanceRecords,
    listSalesOrders,
    listProcedurePlans,
    listProcessReports,
    listMaterialAlerts,
    listQuoteFollowups,
    listFinanceRecords,
    listPurchaseOrders,
    listSuppliers,
    listInventorySummary,
    listInventoryDetails,
    tableStats
  };
}

function initLocalDb() {
  if (typeof getDatabase !== "function") {
    throw new Error("local business table store is not initialized");
  }
  return getDatabase();
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

export function upsertProcessReports(rows) {
  const database = initLocalDb();
  runInTransaction(database, () => {
    insertProcessReports(database, rows);
  });
}

export function existingProcessReportIds(ids = []) {
  const cleanIds = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!cleanIds.length) {
    return new Set();
  }
  const database = initLocalDb();
  const stmt = database.prepare("SELECT report_id FROM erp_process_reports WHERE report_id = ?");
  return new Set(cleanIds.filter((id) => stmt.get(id)));
}

function existingIds(tableName, idColumn, ids = []) {
  const cleanIds = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!cleanIds.length) {
    return new Set();
  }
  const database = initLocalDb();
  const stmt = database.prepare(`SELECT ${idColumn} FROM ${tableName} WHERE ${idColumn} = ?`);
  return new Set(cleanIds.filter((id) => stmt.get(id)));
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

export function upsertWarehouses(rows) {
  const database = initLocalDb();
  runInTransaction(database, () => {
    insertWarehouses(database, rows);
  });
}

export function upsertInventorySummary(rows) {
  const database = initLocalDb();
  runInTransaction(database, () => {
    insertInventorySummary(database, rows);
  });
}

export function upsertInventoryDetails(rows) {
  const database = initLocalDb();
  runInTransaction(database, () => {
    insertInventoryDetails(database, rows);
  });
}

export function existingInventorySummaryIds(ids) {
  return existingIds("erp_inventory_summary", "inventory_id", ids);
}

export function existingInventoryDetailIds(ids) {
  return existingIds("erp_inventory_details", "inventory_id", ids);
}

export function upsertPurchaseOrders(rows) {
  const database = initLocalDb();
  runInTransaction(database, () => {
    insertPurchaseOrders(database, rows);
  });
}

export function upsertSuppliers(rows) {
  const database = initLocalDb();
  runInTransaction(database, () => {
    insertSuppliers(database, rows);
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

export function listProcessReports({ limit = 100 } = {}) {
  return initLocalDb().prepare("SELECT * FROM erp_process_reports ORDER BY added_at DESC LIMIT ?").all(limit);
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

export function listPurchaseOrders({ limit = 100 } = {}) {
  return initLocalDb().prepare("SELECT * FROM erp_purchase_orders ORDER BY order_date DESC, synced_at DESC LIMIT ?").all(limit);
}

export function listSuppliers({ limit = 100 } = {}) {
  return initLocalDb().prepare("SELECT * FROM erp_suppliers ORDER BY name LIMIT ?").all(limit);
}

export function listInventorySummary({ limit = 1000 } = {}) {
  return initLocalDb().prepare("SELECT * FROM erp_inventory_summary ORDER BY warehouse, product_code LIMIT ?").all(limit);
}

export function listInventoryDetails({ limit = 1000 } = {}) {
  return initLocalDb().prepare("SELECT * FROM erp_inventory_details ORDER BY stock_age_days DESC, initial_inbound_time LIMIT ?").all(limit);
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

function insertProcessReports(database, rows) {
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO erp_process_reports
    (report_id, subject, product_name, procedure_name, batch_no, serial_no, report_qty, work_hours, operator, machine, report_result, scrap_reason, creator, added_at, audit_status, raw_json, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(row.report_id, row.subject, row.product_name, row.procedure_name, row.batch_no, row.serial_no, row.report_qty, row.work_hours, row.operator, row.machine, row.report_result, row.scrap_reason, row.creator, row.added_at, row.audit_status, JSON.stringify(row.raw || row), row.synced_at);
  }
}

function insertWarehouses(database, rows) {
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO erp_warehouses
    (warehouse_id, name, full_path, root_path, status, raw_json, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(row.warehouse_id, row.name, row.full_path, row.root_path, row.status, JSON.stringify(row.raw || row), row.synced_at);
  }
}

function insertInventorySummary(database, rows) {
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO erp_inventory_summary
    (inventory_id, product_code, product_name, product_model, product_category, unit, warehouse, batch_no, serial_no, stock_qty, available_qty, frozen_qty, reserved_qty, in_transit_qty, raw_json, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(row.inventory_id, row.product_code, row.product_name, row.product_model, row.product_category, row.unit, row.warehouse, row.batch_no, row.serial_no, row.stock_qty, row.available_qty, row.frozen_qty, row.reserved_qty, row.in_transit_qty, JSON.stringify(row.raw || row), row.synced_at);
  }
}

function insertInventoryDetails(database, rows) {
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO erp_inventory_details
    (inventory_id, product_code, product_name, product_model, product_category, unit, warehouse, batch_no, serial_no, stock_qty, available_qty, frozen_qty, reserved_qty, in_transit_qty, production_date, expiry_date, package_text, pieces, spec, finished_weight, process, location, stock_age_days, supplier, inbound_order, initial_inbound_time, inbound_confirmed_time, remark, raw_json, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(row.inventory_id, row.product_code, row.product_name, row.product_model, row.product_category, row.unit, row.warehouse, row.batch_no, row.serial_no, row.stock_qty, row.available_qty, row.frozen_qty, row.reserved_qty, row.in_transit_qty, row.production_date, row.expiry_date, row.package_text, row.pieces, row.spec, row.finished_weight, row.process, row.location, row.stock_age_days, row.supplier, row.inbound_order, row.initial_inbound_time, row.inbound_confirmed_time, row.remark, JSON.stringify(row.raw || row), row.synced_at);
  }
}

function insertPurchaseOrders(database, rows) {
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO erp_purchase_orders
    (purchase_id, purchase_no, supplier, title, buyer, amount, order_date, expected_arrival_date, status, raw_json, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(row.purchase_id, row.purchase_no, row.supplier, row.title, row.buyer, row.amount, row.order_date, row.expected_arrival_date, row.status, JSON.stringify(row.raw || row), row.synced_at);
  }
}

function insertSuppliers(database, rows) {
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO erp_suppliers
    (supplier_id, name, contact, phone, status, level, address, raw_json, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(row.supplier_id, row.name, row.contact, row.phone, row.status, row.level, row.address, JSON.stringify(row.raw || row), row.synced_at);
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
