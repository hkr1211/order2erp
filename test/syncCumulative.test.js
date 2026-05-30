import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

test("syncSalesOrders keeps previous history pages instead of replacing them", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-sales-history-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const nonce = Date.now();
  const { listSalesOrders } = await import(`../src/localDb.js?syncSalesHistory=${nonce}`);
  const { syncSalesOrders } = await import(`../src/syncService.js?syncSalesHistory=${nonce}`);

  const pages = new Map([
    ["1", [{ ord: "1001", htid: "SO-1001", khmc: "客户A", dateQD: "2026-05-01" }]],
    ["2", [{ ord: "1002", htid: "SO-1002", khmc: "客户B", dateQD: "2026-05-02" }]]
  ]);
  const client = {
    async queryView(viewName, params) {
      assert.equal(viewName, "sales_orders");
      return {
        Rows: pages.get(String(params.pageindex)) || [],
        Cols: [],
        Page: { PageIndex: params.pageindex, PageSize: params.pagesize }
      };
    }
  };

  await syncSalesOrders(client, { pageindex: 1, pagesize: 20 });
  await syncSalesOrders(client, { pageindex: 2, pagesize: 20 });

  assert.deepEqual(listSalesOrders({ limit: 10 }).map((row) => row.order_no).sort(), ["SO-1001", "SO-1002"]);
});

test("local purchase orders and suppliers can be accumulated", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-procurement-history-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const nonce = Date.now();
  const {
    listPurchaseOrders,
    listSuppliers,
    upsertPurchaseOrders,
    upsertSuppliers
  } = await import(`../src/localDb.js?procurementHistory=${nonce}`);

  upsertPurchaseOrders([
    { purchase_id: "P-1", purchase_no: "CG-001", supplier: "供应商A", title: "钼粉采购", buyer: "采购员", amount: 1000, order_date: "2026-05-01", expected_arrival_date: "2026-05-10", status: "已下单", raw: {}, synced_at: "2026-05-24T00:00:00.000Z" }
  ]);
  upsertPurchaseOrders([
    { purchase_id: "P-2", purchase_no: "CG-002", supplier: "供应商B", title: "钽锭采购", buyer: "采购员", amount: 2000, order_date: "2026-05-02", expected_arrival_date: "2026-05-11", status: "已确认", raw: {}, synced_at: "2026-05-24T00:00:00.000Z" }
  ]);
  upsertSuppliers([
    { supplier_id: "S-1", name: "供应商A", contact: "张三", phone: "13800000000", status: "正常", level: "A", address: "西安", raw: {}, synced_at: "2026-05-24T00:00:00.000Z" }
  ]);

  assert.deepEqual(listPurchaseOrders({ limit: 10 }).map((row) => row.purchase_no).sort(), ["CG-001", "CG-002"]);
  assert.equal(listSuppliers({ limit: 10 })[0].name, "供应商A");
});

test("local ERP organization users can be accumulated", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "org-users-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const nonce = Date.now();
  const {
    listOrgUsers,
    upsertOrgUsers
  } = await import(`../src/localDb.js?orgUsers=${nonce}`);

  upsertOrgUsers([
    { user_id: "U-1", username: "wangsh", employee_no: "E001", display_name: "王少花", employee_status: "在职", department_id: "16", department_name: "供销部", raw: {}, synced_at: "2026-05-29T00:00:00.000Z" }
  ]);
  upsertOrgUsers([
    { user_id: "U-2", username: "gez", employee_no: "E002", display_name: "葛梓", employee_status: "在职", department_id: "34", department_name: "财务部", raw: {}, synced_at: "2026-05-29T00:01:00.000Z" }
  ]);

  const users = listOrgUsers({ limit: 10 });

  assert.deepEqual(users.map((row) => row.display_name), ["王少花", "葛梓"]);
  assert.equal(users[0].department_name, "供销部");
});

test("local database creates indexes for common query fields", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "local-indexes-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const nonce = Date.now();
  const { initLocalDb } = await import(`../src/localDb.js?localIndexes=${nonce}`);

  const database = initLocalDb();
  const indexNames = new Set(
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex%'")
      .all()
      .map((row) => row.name)
  );

  for (const expected of [
    "idx_sales_orders_order_no",
    "idx_sales_orders_customer",
    "idx_sales_orders_owner",
    "idx_sales_orders_delivery_date",
    "idx_procedure_plans_work_assignment_id",
    "idx_procedure_plans_order_no",
    "idx_material_alerts_warehouse",
    "idx_inventory_summary_warehouse",
    "idx_inventory_details_warehouse",
    "idx_finance_records_counterparty",
    "idx_purchase_orders_supplier"
  ]) {
    assert.equal(indexNames.has(expected), true, `${expected} should exist`);
  }
});
