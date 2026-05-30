import test from "node:test";
import assert from "node:assert/strict";

import {
  STANDARD_MODEL_DICTIONARY,
  dataDictionaryRows,
  normalizeStandardFinanceRecord,
  normalizeStandardInventoryItem,
  normalizeStandardMaterialAlert,
  normalizeStandardOrder,
  normalizeStandardProcedure,
  normalizeStandardRecord
} from "../src/models/businessModels.js";

test("standard model dictionary defines core ERP business entities", () => {
  assert.deepEqual(Object.keys(STANDARD_MODEL_DICTIONARY).sort(), [
    "finance_record",
    "inventory_item",
    "material_alert",
    "order",
    "procedure",
    "purchase_order",
    "risk",
    "supplier"
  ]);
  assert.equal(STANDARD_MODEL_DICTIONARY.order.source_table, "erp_sales_orders");
  assert.equal(STANDARD_MODEL_DICTIONARY.procedure.primary_key, "procedure_id");
  assert.equal(STANDARD_MODEL_DICTIONARY.risk.primary_key, "risk_id");
  assert.equal(STANDARD_MODEL_DICTIONARY.order.fields.order_no.label, "销售订单号");
  assert.equal(STANDARD_MODEL_DICTIONARY.finance_record.fields.counterparty.label, "往来单位");
});

test("dataDictionaryRows flattens fields with source and role guidance", () => {
  const rows = dataDictionaryRows();
  const orderNo = rows.find((row) => row.model === "order" && row.field === "order_no");
  const riskLevel = rows.find((row) => row.model === "risk" && row.field === "risk_level");

  assert.equal(orderNo.source_table, "erp_sales_orders");
  assert.equal(orderNo.label, "销售订单号");
  assert.equal(orderNo.roles.includes("跟单员"), true);
  assert.equal(riskLevel.source_table, "standard_risks");
  assert.equal(riskLevel.label, "风险等级");
});

test("normalizeStandardOrder creates a stable order contract", () => {
  const row = normalizeStandardOrder({
    erp_id: "17333",
    order_no: "YJ生产销售20260500216",
    customer: "印度客户A",
    owner: "王少花",
    product_name: "钼板",
    amount: "12,345.67",
    signed_date: "2026-05-20",
    delivery_date: "2026-05-30",
    status_text: "未出库 / 未发货 / 未收款",
    raw_json: JSON.stringify({ title: "57631 印度客户A YJ生产销售20260500216" })
  });

  assert.equal(row.record_type, "order");
  assert.equal(row.source_table, "erp_sales_orders");
  assert.equal(row.source_key, "YJ生产销售20260500216");
  assert.equal(row.order_no, "YJ生产销售20260500216");
  assert.equal(row.owner, "王少花");
  assert.equal(row.amount, 12345.67);
  assert.equal(row.is_completed, false);
  assert.equal(row.raw.title, "57631 印度客户A YJ生产销售20260500216");
});

test("normalizeStandardProcedure keeps match metadata and open status", () => {
  const row = normalizeStandardProcedure({
    work_assignment_id: "44692",
    order_no: "YJ生产销售20260500158",
    product_name: "钼杯",
    procedure_name: "引伸",
    work_center_name: "冲压工",
    planned_qty: "100",
    finished_qty: "25",
    remaining_qty: "75",
    planned_start_date: "2026-05-20",
    planned_finish_date: "2026-05-24",
    owner: "151",
    state: "生产中",
    order_match_by: "工序汇报主题匹配"
  });

  assert.equal(row.record_type, "procedure");
  assert.equal(row.procedure_id, "44692");
  assert.equal(row.sales_order_no, "YJ生产销售20260500158");
  assert.equal(row.remaining_qty, 75);
  assert.equal(row.is_open, true);
  assert.equal(row.match_method, "工序汇报主题匹配");
});

test("normalizeStandardMaterialAlert and finance record preserve source traces", () => {
  const material = normalizeStandardMaterialAlert({
    alert_id: "A-1",
    alert_type: "shortage",
    order_no: "PO-1",
    product_code: "MO-1",
    product_name: "钼粉",
    warehouse: "1号钽铌库",
    demand_qty: "50",
    available_qty: "20",
    shortage_qty: "30",
    unit: "kg"
  });
  const finance = normalizeStandardFinanceRecord({
    record_id: "F-1",
    direction: "receivable",
    counterparty: "客户A",
    bill_no: "AR-1",
    amount: "1000",
    paid_amount: "200",
    unpaid_amount: "800",
    due_date: "2026-05-20",
    risk_status: "已逾期",
    owner: "田小静"
  });

  assert.equal(material.record_type, "material_alert");
  assert.equal(material.source_table, "erp_material_alerts");
  assert.equal(material.source_key, "A-1");
  assert.equal(material.shortage_qty, 30);
  assert.equal(finance.record_type, "finance_record");
  assert.equal(finance.source_table, "erp_finance_records");
  assert.equal(finance.source_key, "F-1");
  assert.equal(finance.unpaid_amount, 800);
});

test("normalizeStandardInventoryItem keeps stock source as a standard inventory model", () => {
  const row = normalizeStandardInventoryItem({
    source_table: "erp_inventory_details",
    product_code: "ZR-WASTE",
    product_name: "锆废料",
    warehouse: "20号废料库",
    batch_no: "B-20",
    stock_qty: "12.35",
    available_qty: "10.25",
    unit: "kg"
  });

  assert.equal(row.record_type, "inventory_item");
  assert.equal(row.source_table, "erp_inventory_details");
  assert.equal(row.source_key, "ZR-WASTE|20号废料库|B-20");
  assert.equal(row.available_qty, 10.25);
});

test("normalizeStandardRecord dispatches by model name", () => {
  assert.equal(normalizeStandardRecord("order", { order_no: "PO-1" }).record_type, "order");
  assert.equal(normalizeStandardRecord("procedure", { work_assignment_id: "W-1" }).record_type, "procedure");
  assert.equal(normalizeStandardRecord("inventory_item", { product_code: "MO-1", warehouse: "1号库" }).record_type, "inventory_item");
  assert.throws(() => normalizeStandardRecord("unknown", {}), /Unsupported standard model/);
});
