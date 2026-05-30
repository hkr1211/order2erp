export function initializeLocalSchema(db) {
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

    CREATE TABLE IF NOT EXISTS standard_risks (
      risk_id TEXT PRIMARY KEY,
      generated_at TEXT NOT NULL,
      risk_level TEXT,
      risk_type TEXT,
      related_object TEXT,
      related_no TEXT,
      source_table TEXT,
      source_key TEXT,
      source_rule TEXT,
      match_method TEXT,
      responsible_owner TEXT,
      owner_role TEXT,
      customer TEXT,
      counterparty TEXT,
      problem TEXT,
      suggested_action TEXT,
      planning_suggestion TEXT,
      prediction_level TEXT,
      prediction_reason TEXT,
      risk_score REAL,
      due_date TEXT,
      status TEXT,
      raw_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_chat_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      intent TEXT NOT NULL,
      sources_json TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_auth_users (
      username TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      roles_json TEXT NOT NULL,
      scopes_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      password_reset_required INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_auth_sessions (
      session_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS erp_org_users (
      user_id TEXT PRIMARY KEY,
      username TEXT,
      employee_no TEXT,
      display_name TEXT NOT NULL,
      employee_status TEXT,
      department_id TEXT,
      department_name TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      raw_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS erp_process_reports (
      report_id TEXT PRIMARY KEY,
      subject TEXT,
      product_name TEXT,
      procedure_name TEXT,
      batch_no TEXT,
      serial_no TEXT,
      report_qty REAL,
      work_hours REAL,
      operator TEXT,
      machine TEXT,
      report_result TEXT,
      scrap_reason TEXT,
      creator TEXT,
      added_at TEXT,
      audit_status TEXT,
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

    CREATE TABLE IF NOT EXISTS erp_purchase_orders (
      purchase_id TEXT PRIMARY KEY,
      purchase_no TEXT,
      supplier TEXT,
      title TEXT,
      buyer TEXT,
      amount REAL,
      order_date TEXT,
      expected_arrival_date TEXT,
      status TEXT,
      raw_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS erp_suppliers (
      supplier_id TEXT PRIMARY KEY,
      name TEXT,
      contact TEXT,
      phone TEXT,
      status TEXT,
      level TEXT,
      address TEXT,
      raw_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS erp_warehouses (
      warehouse_id TEXT PRIMARY KEY,
      name TEXT,
      full_path TEXT,
      root_path TEXT,
      status TEXT,
      raw_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS erp_inventory_summary (
      inventory_id TEXT PRIMARY KEY,
      product_code TEXT,
      product_name TEXT,
      product_model TEXT,
      product_category TEXT,
      unit TEXT,
      warehouse TEXT,
      batch_no TEXT,
      serial_no TEXT,
      stock_qty REAL,
      available_qty REAL,
      frozen_qty REAL,
      reserved_qty REAL,
      in_transit_qty REAL,
      raw_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS erp_inventory_details (
      inventory_id TEXT PRIMARY KEY,
      product_code TEXT,
      product_name TEXT,
      product_model TEXT,
      product_category TEXT,
      unit TEXT,
      warehouse TEXT,
      batch_no TEXT,
      serial_no TEXT,
      stock_qty REAL,
      available_qty REAL,
      frozen_qty REAL,
      reserved_qty REAL,
      in_transit_qty REAL,
      production_date TEXT,
      expiry_date TEXT,
      package_text TEXT,
      pieces REAL,
      spec TEXT,
      finished_weight REAL,
      process TEXT,
      location TEXT,
      stock_age_days REAL,
      supplier TEXT,
      inbound_order TEXT,
      initial_inbound_time TEXT,
      inbound_confirmed_time TEXT,
      remark TEXT,
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
      password_hash TEXT,
      password_reset_required INTEGER NOT NULL DEFAULT 0,
      password_reset_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sales_orders_order_no ON erp_sales_orders(order_no);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON erp_sales_orders(customer);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_owner ON erp_sales_orders(owner);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_delivery_date ON erp_sales_orders(delivery_date);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_signed_date ON erp_sales_orders(signed_date);

    CREATE INDEX IF NOT EXISTS idx_procedure_plans_work_assignment_id ON erp_procedure_plans(work_assignment_id);
    CREATE INDEX IF NOT EXISTS idx_procedure_plans_order_no ON erp_procedure_plans(order_no);
    CREATE INDEX IF NOT EXISTS idx_procedure_plans_work_center_finish ON erp_procedure_plans(work_center_name, planned_finish_date);
    CREATE INDEX IF NOT EXISTS idx_procedure_plans_planned_finish_date ON erp_procedure_plans(planned_finish_date);

    CREATE INDEX IF NOT EXISTS idx_process_reports_added_at ON erp_process_reports(added_at);
    CREATE INDEX IF NOT EXISTS idx_process_reports_procedure_name ON erp_process_reports(procedure_name);

    CREATE INDEX IF NOT EXISTS idx_material_alerts_order_no ON erp_material_alerts(order_no);
    CREATE INDEX IF NOT EXISTS idx_material_alerts_customer ON erp_material_alerts(customer);
    CREATE INDEX IF NOT EXISTS idx_material_alerts_warehouse ON erp_material_alerts(warehouse);
    CREATE INDEX IF NOT EXISTS idx_material_alerts_priority ON erp_material_alerts(priority);

    CREATE INDEX IF NOT EXISTS idx_inventory_summary_warehouse ON erp_inventory_summary(warehouse);
    CREATE INDEX IF NOT EXISTS idx_inventory_summary_product_code ON erp_inventory_summary(product_code);
    CREATE INDEX IF NOT EXISTS idx_inventory_details_warehouse ON erp_inventory_details(warehouse);
    CREATE INDEX IF NOT EXISTS idx_inventory_details_product_code ON erp_inventory_details(product_code);
    CREATE INDEX IF NOT EXISTS idx_inventory_details_stock_age ON erp_inventory_details(stock_age_days);

    CREATE INDEX IF NOT EXISTS idx_finance_records_counterparty ON erp_finance_records(counterparty);
    CREATE INDEX IF NOT EXISTS idx_finance_records_due_date ON erp_finance_records(due_date);
    CREATE INDEX IF NOT EXISTS idx_finance_records_direction ON erp_finance_records(direction);
    CREATE INDEX IF NOT EXISTS idx_finance_records_risk_status ON erp_finance_records(risk_status);

    CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON erp_purchase_orders(supplier);
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_purchase_no ON erp_purchase_orders(purchase_no);
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_expected_arrival_date ON erp_purchase_orders(expected_arrival_date);

    CREATE INDEX IF NOT EXISTS idx_order_procedure_links_work_assignment_id ON order_procedure_links(work_assignment_id);
    CREATE INDEX IF NOT EXISTS idx_order_procedure_links_order_no ON order_procedure_links(order_no);

    CREATE INDEX IF NOT EXISTS idx_sync_runs_source_key ON sync_runs(source_key);
    CREATE INDEX IF NOT EXISTS idx_history_sync_runs_source ON history_sync_runs(source);
    CREATE INDEX IF NOT EXISTS idx_pmc_intervention_logs_related_no ON pmc_intervention_logs(related_no);
    CREATE INDEX IF NOT EXISTS idx_pmc_intervention_logs_created_at ON pmc_intervention_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_standard_risks_related_no ON standard_risks(related_no);
    CREATE INDEX IF NOT EXISTS idx_standard_risks_related_object ON standard_risks(related_object);
    CREATE INDEX IF NOT EXISTS idx_standard_risks_owner ON standard_risks(responsible_owner);
    CREATE INDEX IF NOT EXISTS idx_standard_risks_level_type ON standard_risks(risk_level, risk_type);
    CREATE INDEX IF NOT EXISTS idx_standard_risks_generated_at ON standard_risks(generated_at);
    CREATE INDEX IF NOT EXISTS idx_local_auth_sessions_username ON local_auth_sessions(username);
    CREATE INDEX IF NOT EXISTS idx_local_auth_sessions_expires_at ON local_auth_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_org_users_display_name ON erp_org_users(display_name);
    CREATE INDEX IF NOT EXISTS idx_org_users_username ON erp_org_users(username);
    CREATE INDEX IF NOT EXISTS idx_org_users_department ON erp_org_users(department_name);
  `);
  ensureColumn(db, "pmc_intervention_logs", "intervention_state", "TEXT");
  ensureColumn(db, "pmc_intervention_logs", "result_type", "TEXT");
  ensureColumn(db, "pmc_intervention_logs", "promised_date", "TEXT");
  ensureColumn(db, "pmc_intervention_logs", "next_owner", "TEXT");
  ensureColumn(db, "local_user_roles", "password_hash", "TEXT");
  ensureColumn(db, "local_user_roles", "password_reset_required", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "local_user_roles", "password_reset_at", "TEXT");
}

function ensureColumn(database, tableName, columnName, columnType) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
  }
}
