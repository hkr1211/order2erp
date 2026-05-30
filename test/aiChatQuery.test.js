import test from "node:test";
import assert from "node:assert/strict";
import { createAiChatQuery } from "../src/queries/aiChatQuery.js";

test("AI chat answers workshop delay questions from SQLite scoped data with sources", () => {
  const savedLogs = [];
  const { queryAiChat } = createAiChatQuery({
    buildLocalPmcDashboard: () => ({
      sections: {
        red_risks: [{ risk_level: "红牌", risk_type: "产能瓶颈", related_no: "44336", problem: "冲压一次成型已延误", owner_role: "PMC/冲压工段", primary_action: "确认冲压产能" }],
        yellow_risks: [],
        morning_brief: []
      },
      summary: { delayed_procedures: 1 }
    }),
    latestSyncRuns: () => [{ source_key: "procedure_plans", finished_at: "2026-05-29T00:10:00.000Z", status: "success", rows_synced: 20 }],
    listAiChatLogs: () => [],
    listFinanceRecords: () => [],
    listInventoryDetails: () => [],
    listInventorySummary: () => [],
    listMaterialAlerts: () => [],
    listProcedurePlans: () => [
      { work_assignment_id: "OLD-0", order_no: "PO-OLD", product_name: "铌杯", procedure_name: "一次成型冲压", work_center_name: "冲压工", remaining_qty: 0, planned_finish_date: "2024-03-17", state: "完工", synced_at: "2026-05-29T00:10:00.000Z" },
      { work_assignment_id: "44336", order_no: "YJ生产销售20260500076", product_name: "铌杯", procedure_name: "一次成型冲压", work_center_name: "工段长", remaining_qty: 130, planned_finish_date: "2026-05-16", state: "未完工", synced_at: "2026-05-29T00:10:00.000Z" }
    ],
    listSalesOrders: () => [],
    saveAiChatLog: (row) => {
      savedLogs.push(row);
      return { id: 7, ...row };
    }
  });

  const result = queryAiChat({ message: "冲压工段有哪些逾期工序？", today: "2026-05-29" });

  assert.equal(result.scope, "local_sqlite_only");
  assert.equal(result.intent, "production");
  assert.match(result.answer, /44336/);
  assert.match(result.answer, /一次成型冲压/);
  assert.doesNotMatch(result.answer, /OLD-0/);
  assert.match(result.answer, /数据来源/);
  assert.deepEqual(result.sources.map((row) => row.table), ["procedure_plans"]);
  assert.deepEqual(result.sources.map((row) => row.standard_model), ["procedure"]);
  assert.equal(result.log_id, 7);
  assert.equal(savedLogs.length, 1);
  assert.equal(savedLogs[0].question, "冲压工段有哪些逾期工序？");
  assert.match(savedLogs[0].answer, /44336/);
});

test("AI chat explains persisted standard risks with risk id and planning suggestion", () => {
  const { queryAiChat } = createAiChatQuery({
    buildLocalPmcDashboard: () => ({ sections: { red_risks: [], yellow_risks: [] } }),
    latestSyncRuns: () => [],
    listAiChatLogs: () => [],
    listFinanceRecords: () => [],
    listInventoryDetails: () => [],
    listInventorySummary: () => [],
    listMaterialAlerts: () => [],
    listProcedurePlans: () => [],
    listSalesOrders: () => [],
    listStandardRisks: () => [
      {
        risk_id: "RISK-AI-1",
        risk_level: "红牌",
        risk_type: "物料断供",
        related_object: "订单",
        related_no: "PO-AI-1",
        problem: "钼粉缺口8kg",
        owner_role: "PMC/采购",
        suggested_action: "确认替代库存",
        planning_suggestion: "先确认可替代库存、在途到货和是否需要调整排产",
        source_table: "standard_risks",
        source_key: "RISK-AI-1"
      }
    ],
    saveAiChatLog: () => ({ id: 1 })
  });

  const result = queryAiChat({ message: "今天老板最该关注什么风险？", today: new Date("2026-05-29T08:00:00+08:00") });

  assert.equal(result.rows[0].risk_id, "RISK-AI-1");
  assert.equal(result.sources[0].table, "standard_risks");
  assert.equal(result.structured_query.standard_model, "risk");
  assert.match(result.answer, /RISK-AI-1/);
  assert.match(result.answer, /先确认可替代库存/);
});

test("AI chat refuses out-of-scope questions and still writes a log", () => {
  const savedLogs = [];
  const { queryAiChat } = createAiChatQuery({
    buildLocalPmcDashboard: () => ({ sections: { red_risks: [], yellow_risks: [], morning_brief: [] }, summary: {} }),
    latestSyncRuns: () => [],
    listAiChatLogs: () => [],
    listFinanceRecords: () => [],
    listInventoryDetails: () => [],
    listInventorySummary: () => [],
    listMaterialAlerts: () => [],
    listProcedurePlans: () => [],
    listSalesOrders: () => [],
    saveAiChatLog: (row) => {
      savedLogs.push(row);
      return { id: 8, ...row };
    }
  });

  const result = queryAiChat({ message: "明天上海天气怎么样？" });

  assert.equal(result.intent, "out_of_scope");
  assert.match(result.answer, /当前中台没有该数据/);
  assert.equal(result.sources.length, 0);
  assert.equal(result.log_id, 8);
  assert.equal(savedLogs[0].intent, "out_of_scope");
});

test("AI chat covers order, material, finance and PMC risk scopes", () => {
  const { queryAiChat } = createAiChatQuery({
    buildLocalPmcDashboard: () => ({
      sections: {
        red_risks: [{ risk_level: "红牌", risk_score: 90, risk_type: "交期风险", related_no: "PO-1", problem: "订单超期", owner_role: "PMC", next_action: "早会确认发货资源" }],
        yellow_risks: [],
        morning_brief: []
      },
      summary: {}
    }),
    latestSyncRuns: () => [],
    listAiChatLogs: () => [],
    listFinanceRecords: () => [
      { direction: "receivable", counterparty: "客户A", bill_no: "AR-1", business_title: "销售应收", unpaid_amount: 12000, due_date: "2026-05-20", risk_status: "已逾期", synced_at: "2026-05-29T00:00:00.000Z" }
    ],
    listInventoryDetails: () => [],
    listInventorySummary: () => [
      { product_code: "MO-1", product_name: "钼板", warehouse: "16带箔材产成品库", available_qty: 2, stock_qty: 2, unit: "kg", synced_at: "2026-05-29T00:00:00.000Z" }
    ],
    listMaterialAlerts: () => [
      { alert_type: "shortage", order_no: "PO-1", product_name: "钼板", warehouse: "16带箔材产成品库", demand_qty: 5, available_qty: 2, shortage_qty: 3, synced_at: "2026-05-29T00:00:00.000Z" }
    ],
    listProcedurePlans: () => [],
    listSalesOrders: () => [
      { order_no: "PO-1", customer: "客户A", product_name: "钼板", owner: "销售A", delivery_date: "2026-05-30", amount: 80000, status_text: "未发货", synced_at: "2026-05-29T00:00:00.000Z" }
    ],
    saveAiChatLog: (row) => ({ id: 9, ...row })
  });

  const order = queryAiChat({ message: "客户A订单交期是什么？" });
  const material = queryAiChat({ message: "哪些订单缺料？" });
  const finance = queryAiChat({ message: "有哪些应收欠款风险？" });
  const pmc = queryAiChat({ message: "今天老板最应该关注什么风险？" });

  assert.equal(order.intent, "order");
  assert.match(order.answer, /销售订单/);
  assert.equal(material.intent, "material");
  assert.match(material.answer, /物料告警/);
  assert.equal(finance.intent, "finance");
  assert.match(finance.answer, /应收应付/);
  assert.equal(pmc.intent, "pmc_risk");
  assert.match(pmc.answer, /统一风险事项/);
});

test("AI chat always answers with SQLite table source and structured query", () => {
  const { queryAiChat } = createAiChatQuery({
    buildLocalPmcDashboard: () => ({ sections: { red_risks: [], yellow_risks: [], morning_brief: [] }, summary: {} }),
    latestSyncRuns: () => [],
    listAiChatLogs: () => [],
    listFinanceRecords: () => [],
    listInventoryDetails: () => [],
    listInventorySummary: () => [],
    listMaterialAlerts: () => [],
    listProcedurePlans: () => [],
    listSalesOrders: () => [
      { order_no: "PO-SRC-1", customer: "印度Godrej & Boyce", owner: "田小静", product_name: "钼板", delivery_date: "2026-05-30", amount: 6500, status_text: "未出库 / 未发货", synced_at: "2026-05-29T00:00:00.000Z" }
    ],
    saveAiChatLog: (row) => ({ id: 12, ...row })
  });

  const result = queryAiChat({ message: "印度客户的在制订单有哪些？", today: "2026-05-29" });

  assert.equal(result.structured_query.table, "sales_orders");
  assert.equal(result.structured_query.standard_model, "order");
  assert.equal(result.sources[0].standard_model, "order");
  assert.equal(result.rows[0].record_type, "order");
  assert.equal(result.rows[0].source_table, "erp_sales_orders");
  assert.deepEqual(result.structured_query.filters.status, "在制/未完成");
  assert.match(result.answer, /结构化查询：表=sales_orders；标准模型=销售订单/);
  assert.match(result.answer, /来自 sales_orders 表，共筛选出 1 条/);
});

test("AI chat only queries standard models instead of rebuilding page dashboard data", () => {
  const { queryAiChat } = createAiChatQuery({
    buildLocalPmcDashboard: () => {
      throw new Error("AI should not query temporary page dashboard data");
    },
    latestSyncRuns: () => [],
    listAiChatLogs: () => [],
    listFinanceRecords: () => [],
    listInventoryDetails: () => [],
    listInventorySummary: () => [],
    listMaterialAlerts: () => [],
    listProcedurePlans: () => [
      { work_assignment_id: "STAMP-AI", order_no: "PO-AI", product_name: "铌杯", procedure_name: "一次成型冲压", work_center_name: "冲压工段", remaining_qty: 20, planned_finish_date: "2026-05-20", state: "未完工", synced_at: "2026-05-29T00:00:00.000Z" }
    ],
    listSalesOrders: () => [],
    listStandardRisks: () => [
      {
        risk_id: "STD-RISK-1",
        risk_level: "红牌",
        risk_type: "产能瓶颈",
        related_object: "派工",
        related_no: "STAMP-AI",
        problem: "冲压延期",
        owner_role: "PMC/冲压",
        suggested_action: "确认夜班",
        source_table: "standard_risks",
        source_key: "STD-RISK-1"
      }
    ],
    saveAiChatLog: (row) => ({ id: 15, ...row })
  });

  const production = queryAiChat({ message: "冲压工段有哪些逾期工序？", today: "2026-05-29" });
  const risk = queryAiChat({ message: "今天红牌风险有哪些？", today: "2026-05-29" });

  assert.deepEqual(production.sources.map((row) => row.standard_model), ["procedure"]);
  assert.deepEqual(production.rows.map((row) => row.record_type), ["procedure"]);
  assert.equal(production.sources.some((row) => row.table === "pmc_risk_view"), false);
  assert.equal(risk.sources[0].table, "standard_risks");
  assert.equal(risk.sources[0].standard_model, "risk");
  assert.deepEqual(risk.rows.map((row) => row.record_type), ["risk"]);
  assert.match(risk.answer, /统一风险事项/);
});

test("AI chat asks for clarification when a country customer scope matches multiple customers", () => {
  const { queryAiChat } = createAiChatQuery({
    buildLocalPmcDashboard: () => ({ sections: { red_risks: [], yellow_risks: [], morning_brief: [] }, summary: {} }),
    latestSyncRuns: () => [],
    listAiChatLogs: () => [],
    listFinanceRecords: () => [],
    listInventoryDetails: () => [],
    listInventorySummary: () => [],
    listMaterialAlerts: () => [],
    listProcedurePlans: () => [],
    listSalesOrders: () => [
      { order_no: "IN-A", customer: "印度Godrej & Boyce", owner: "田小静", product_name: "钼板", delivery_date: "2026-05-30", amount: 6500, status_text: "未出库 / 未发货", synced_at: "2026-05-29T00:00:00.000Z" },
      { order_no: "IN-B", customer: "印度客户Bharat Forge", owner: "刘晓琴", product_name: "钽件", delivery_date: "2026-06-02", amount: 8400, status_text: "未出库 / 未发货", synced_at: "2026-05-29T00:00:00.000Z" },
      { order_no: "CN-A", customer: "上海久裕金属科技有限公司", owner: "杨娟娟", product_name: "钼板", delivery_date: "2026-05-31", amount: 12000, status_text: "未出库 / 未发货", synced_at: "2026-05-29T00:00:00.000Z" }
    ],
    saveAiChatLog: (row) => ({ id: 13, ...row })
  });

  const result = queryAiChat({ message: "印度客户的在制订单有哪些？", today: "2026-05-29" });

  assert.equal(result.needs_clarification, true);
  assert.equal(result.rows.length, 0);
  assert.deepEqual(result.clarification_options.map((row) => row.customer), ["印度Godrej & Boyce", "印度客户Bharat Forge"]);
  assert.match(result.answer, /请先确认你指的是哪个客户/);
  assert.match(result.answer, /印度Godrej & Boyce/);
  assert.match(result.answer, /印度客户Bharat Forge/);
  assert.match(result.answer, /来自 sales_orders 表，共匹配到 2 个客户、2 条记录/);
  assert.doesNotMatch(result.answer, /CN-A/);
});

test("AI chat structures warehouse workshop finance direction and amount filters", () => {
  const { queryAiChat } = createAiChatQuery({
    buildLocalPmcDashboard: () => ({ sections: { red_risks: [], yellow_risks: [], morning_brief: [] }, summary: {} }),
    latestSyncRuns: () => [],
    listAiChatLogs: () => [],
    listFinanceRecords: () => [
      { direction: "receivable", counterparty: "印度Godrej & Boyce", bill_no: "AR-HIGH", business_title: "销售应收", unpaid_amount: 28000, due_date: "2026-05-20", due_days: -9, risk_status: "已逾期", owner: "田小静", synced_at: "2026-05-29T00:00:00.000Z" },
      { direction: "payable", counterparty: "供应商A", bill_no: "AP-1", business_title: "采购应付", unpaid_amount: 32000, due_date: "2026-06-01", due_days: 3, risk_status: "7天内到期", owner: "采购", synced_at: "2026-05-29T00:00:00.000Z" },
      { direction: "receivable", counterparty: "印度客户Bharat Forge", bill_no: "AR-LOW", business_title: "销售应收", unpaid_amount: 3000, due_date: "2026-05-22", due_days: -7, risk_status: "已逾期", owner: "刘晓琴", synced_at: "2026-05-29T00:00:00.000Z" }
    ],
    listInventoryDetails: () => [
      { product_code: "ZR-WASTE", product_name: "锆废料", warehouse: "20号废料库", batch_no: "B-20", available_qty: 12, stock_qty: 12, unit: "kg", synced_at: "2026-05-29T00:00:00.000Z" },
      { product_code: "MO-FIN", product_name: "钼箔", warehouse: "16带箔材产成品库", batch_no: "B-16", available_qty: 8, stock_qty: 8, unit: "kg", synced_at: "2026-05-29T00:00:00.000Z" }
    ],
    listInventorySummary: () => [],
    listMaterialAlerts: () => [],
    listProcedurePlans: () => [
      { work_assignment_id: "ROLL-1", order_no: "PO-R", product_name: "钼板", procedure_name: "冷轧", work_center_name: "轧制工段", remaining_qty: 10, planned_finish_date: "2026-05-20", state: "未完工", owner: "PMC/轧制", synced_at: "2026-05-29T00:00:00.000Z" },
      { work_assignment_id: "STAMP-1", order_no: "PO-S", product_name: "铌杯", procedure_name: "一次成型冲压", work_center_name: "冲压工段", remaining_qty: 20, planned_finish_date: "2026-05-20", state: "未完工", owner: "PMC/冲压", synced_at: "2026-05-29T00:00:00.000Z" }
    ],
    listSalesOrders: () => [],
    saveAiChatLog: (row) => ({ id: 14, ...row })
  });

  const warehouse = queryAiChat({ message: "20号废料库有哪些库存？", today: "2026-05-29" });
  const workshop = queryAiChat({ message: "轧制工段有哪些逾期工序？", today: "2026-05-29" });
  const finance = queryAiChat({ message: "印度客户逾期应收金额超过5000的有哪些？", today: "2026-05-29" });

  assert.equal(warehouse.structured_query.table, "inventory_details");
  assert.deepEqual(warehouse.structured_query.filters.warehouse, ["20号废料库"]);
  assert.deepEqual(warehouse.rows.map((row) => row.product_code), ["ZR-WASTE"]);
  assert.equal(workshop.structured_query.filters.workshop, "轧制");
  assert.deepEqual(workshop.rows.map((row) => row.work_assignment_id), ["ROLL-1"]);
  assert.equal(finance.structured_query.table, "finance_records");
  assert.equal(finance.structured_query.filters.direction, "应收");
  assert.equal(finance.structured_query.filters.amount, "> 5,000");
  assert.deepEqual(finance.rows.map((row) => row.bill_no), ["AR-HIGH"]);
  assert.match(finance.answer, /来自 finance_records 表，共筛选出 1 条/);
});

test("AI chat understands country customer and in-progress order filters", () => {
  const { queryAiChat } = createAiChatQuery({
    buildLocalPmcDashboard: () => ({ sections: { red_risks: [], yellow_risks: [], morning_brief: [] }, summary: {} }),
    latestSyncRuns: () => [],
    listAiChatLogs: () => [],
    listFinanceRecords: () => [],
    listInventoryDetails: () => [],
    listInventorySummary: () => [],
    listMaterialAlerts: () => [],
    listProcedurePlans: () => [],
    listSalesOrders: () => [
      { order_no: "IN-OPEN-1", customer: "印度Godrej & Boyce", owner: "田小静", product_name: "钼板", delivery_date: "2026-05-30", amount: 6500, status_text: "未出库 / 未发货 / 未收款 / 审批通过", synced_at: "2026-05-29T00:00:00.000Z" },
      { order_no: "IN-OPEN-2", customer: "印度Godrej & Boyce", owner: "田小静", product_name: "钽件", delivery_date: "2026-06-02", amount: 8400, status_text: "未出库 / 未发货 / 未收款 / 审批通过", synced_at: "2026-05-29T00:00:00.000Z" },
      { order_no: "IN-CLOSED", customer: "印度Godrej & Boyce", owner: "田小静", product_name: "铌杯", delivery_date: "2026-05-20", amount: 9000, status_text: "出库完毕 / 发货完毕 / 已收款 / 审批通过", synced_at: "2026-05-29T00:00:00.000Z" },
      { order_no: "CN-OPEN", customer: "上海久裕金属科技有限公司", owner: "杨娟娟", product_name: "钼板", delivery_date: "2026-05-31", amount: 12000, status_text: "未出库 / 未发货 / 未收款 / 审批通过", synced_at: "2026-05-29T00:00:00.000Z" }
    ],
    saveAiChatLog: (row) => ({ id: 10, ...row })
  });

  const result = queryAiChat({ message: "印度客户的在制订单有哪些？", today: "2026-05-29" });

  assert.equal(result.intent, "order");
  assert.deepEqual(result.rows.map((row) => row.order_no), ["IN-OPEN-1", "IN-OPEN-2"]);
  assert.match(result.answer, /印度Godrej & Boyce/);
  assert.match(result.answer, /共 2 单/);
  assert.match(result.answer, /总金额 14,900/);
  assert.doesNotMatch(result.answer, /CN-OPEN/);
  assert.doesNotMatch(result.answer, /IN-CLOSED/);
});

test("AI chat applies owner amount overdue and shortage semantic filters", () => {
  const { queryAiChat } = createAiChatQuery({
    buildLocalPmcDashboard: () => ({ sections: { red_risks: [], yellow_risks: [], morning_brief: [] }, summary: {} }),
    latestSyncRuns: () => [],
    listAiChatLogs: () => [],
    listFinanceRecords: () => [],
    listInventoryDetails: () => [],
    listInventorySummary: () => [],
    listMaterialAlerts: () => [
      { alert_type: "shortage", order_no: "IN-SHORT", customer: "印度Godrej & Boyce", product_name: "钼板", warehouse: "16带箔材产成品库", demand_qty: 10, available_qty: 4, shortage_qty: 6, priority: "高", synced_at: "2026-05-29T00:00:00.000Z" },
      { alert_type: "shortage", order_no: "CN-SHORT", customer: "上海久裕金属科技有限公司", product_name: "钼板", warehouse: "16带箔材产成品库", demand_qty: 10, available_qty: 1, shortage_qty: 9, priority: "高", synced_at: "2026-05-29T00:00:00.000Z" }
    ],
    listProcedurePlans: () => [],
    listSalesOrders: () => [
      { order_no: "IN-OVERDUE-HIGH", customer: "印度Godrej & Boyce", owner: "田小静", product_name: "钼板", delivery_date: "2026-05-20", amount: 12000, status_text: "未出库 / 未发货 / 未收款 / 审批通过", synced_at: "2026-05-29T00:00:00.000Z" },
      { order_no: "IN-OVERDUE-LOW", customer: "印度Godrej & Boyce", owner: "田小静", product_name: "铌杯", delivery_date: "2026-05-21", amount: 3000, status_text: "未出库 / 未发货 / 未收款 / 审批通过", synced_at: "2026-05-29T00:00:00.000Z" },
      { order_no: "IN-OTHER-OWNER", customer: "印度Godrej & Boyce", owner: "销售B", product_name: "钽件", delivery_date: "2026-05-20", amount: 15000, status_text: "未出库 / 未发货 / 未收款 / 审批通过", synced_at: "2026-05-29T00:00:00.000Z" }
    ],
    saveAiChatLog: (row) => ({ id: 11, ...row })
  });

  const orderResult = queryAiChat({ message: "田小静负责的印度客户金额超过5000的逾期订单", today: "2026-05-29" });
  const shortageResult = queryAiChat({ message: "印度客户有哪些缺料订单？", today: "2026-05-29" });

  assert.deepEqual(orderResult.rows.map((row) => row.order_no), ["IN-OVERDUE-HIGH"]);
  assert.match(orderResult.answer, /筛选条件/);
  assert.match(orderResult.answer, /田小静/);
  assert.equal(shortageResult.intent, "material");
  assert.deepEqual(shortageResult.rows.map((row) => row.order_no), ["IN-SHORT"]);
  assert.doesNotMatch(shortageResult.answer, /CN-SHORT/);
});
