import test from "node:test";
import assert from "node:assert/strict";

import {
  attachPredictionSuggestions,
  buildOrderFlowLinks,
  buildBatchFlowSuggestions,
  buildBomKitChecks
} from "../src/models/materialPlanning.js";

test("buildBomKitChecks reports conservative kit status and shortages", () => {
  const rows = buildBomKitChecks({
    orders: [
      { order_no: "PO-KIT", product_code: "FIN-1", product_name: "钼杯", remaining_qty: 10 },
      { order_no: "PO-NOBOM", product_code: "FIN-2", product_name: "未知件", remaining_qty: 5 }
    ],
    bomRows: [
      { parent_product_code: "FIN-1", component_code: "MO-POWDER", component_name: "钼粉", usage_qty: 2, unit: "kg" },
      { parent_product_code: "FIN-1", component_code: "MO-NAME-ONLY", component_name: "钼棒", usage_qty: 1, unit: "kg" }
    ],
    inventoryRows: [
      { product_code: "MO-POWDER", product_name: "钼粉", available_qty: 12, stock_qty: 12, warehouse: "原料库" },
      { product_name: "钼棒", available_qty: 10, stock_qty: 10, warehouse: "原料库" }
    ]
  });

  const byOrder = new Map(rows.map((row) => [row.order_no, row]));

  assert.equal(byOrder.get("PO-KIT").kit_status, "短缺");
  assert.equal(byOrder.get("PO-KIT").shortage_components, 1);
  assert.equal(byOrder.get("PO-KIT").components[0].required_qty, 20);
  assert.equal(byOrder.get("PO-KIT").components[0].shortage_qty, 8);
  assert.equal(byOrder.get("PO-KIT").components[1].available_qty, 10);
  assert.equal(byOrder.get("PO-NOBOM").kit_status, "数据不足");
  assert.match(byOrder.get("PO-NOBOM").suggested_action, /补齐BOM/);
});

test("buildBatchFlowSuggestions matches downstream plans to available batches", () => {
  const rows = buildBatchFlowSuggestions({
    today: new Date("2026-05-29T08:00:00+08:00"),
    procedurePlans: [
      { work_assignment_id: "S-1", order_no: "PO-1", product_name: "钼箔", procedure_name: "冲圆", work_center_name: "冲压工段", remaining_qty: 5, planned_start_date: "2026-05-30" }
    ],
    inventoryRows: [
      { product_code: "MO-FOIL", product_name: "钼箔", product_model: "0.05", warehouse: "16带箔材产成品库", batch_no: "B-16", available_qty: 8 }
    ]
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].flow_status, "可用批次");
  assert.equal(rows[0].batch_no, "B-16");
  assert.equal(rows[0].suggested_action, "确认批次可用并安排转序/领料");
});

test("attachPredictionSuggestions adds advisory fields without changing risk identity", () => {
  const rows = attachPredictionSuggestions([
    { risk_id: "RISK-MAT", risk_type: "物料断供", risk_level: "红牌", related_no: "PO-1", due_date: "2026-05-30" },
    { risk_id: "RISK-CAP", risk_type: "产能预警", risk_level: "黄牌", related_no: "W-1", due_date: "2026-06-03" }
  ], { today: new Date("2026-05-29T08:00:00+08:00") });

  assert.equal(rows[0].risk_id, "RISK-MAT");
  assert.equal(rows[0].prediction_level, "高");
  assert.match(rows[0].planning_suggestion, /先确认可替代库存/);
  assert.equal(rows[1].prediction_level, "中");
  assert.match(rows[1].prediction_reason, /产能/);
});

test("buildOrderFlowLinks connects order procedure material and batch context", () => {
  const links = buildOrderFlowLinks({
    orders: [
      { order_no: "PO-LINK", customer: "印度客户A", owner: "王少花", product_name: "钼箔", delivery_date: "2026-06-05" }
    ],
    procedurePlans: [
      { work_assignment_id: "W-LINK", order_no: "PO-LINK", product_name: "钼箔", procedure_name: "冲圆", work_center_name: "冲压工段", remaining_qty: 5, planned_start_date: "2026-05-30" }
    ],
    materialAlerts: [
      { alert_type: "shortage", order_no: "PO-LINK", product_name: "钼箔", shortage_qty: 2 }
    ],
    inventoryRows: [
      { product_name: "钼箔", warehouse: "16带箔材产成品库", batch_no: "B-LINK", available_qty: 8 }
    ]
  });

  assert.equal(links.length, 1);
  assert.equal(links[0].order_no, "PO-LINK");
  assert.equal(links[0].procedure_count, 1);
  assert.equal(links[0].material_risk_count, 1);
  assert.equal(links[0].available_batch_count, 1);
  assert.equal(links[0].flow_status, "有风险可调度");
  assert.match(links[0].suggested_action, /确认缺料/);
});
