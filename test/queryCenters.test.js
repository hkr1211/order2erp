import test from "node:test";
import assert from "node:assert/strict";
import { buildLocalFinanceCenter } from "../src/localAnalytics.js";
import { formatDate, formatDateTime, labelFor, parseBoolean, parseNumber } from "../src/displayUtils.js";
import { createFinanceQueries } from "../src/queries/financeQuery.js";
import { createMaterialExceptionQueries } from "../src/queries/materialExceptionQuery.js";
import { createOrdersQueries } from "../src/queries/ordersQuery.js";
import { createFinancePageRenderers } from "../src/pages/financePage.js";
import { createFollowupPageRenderers } from "../src/pages/followupPage.js";
import { createHtmlRenderers } from "../src/pages/html.js";
import { createOperationsPageRenderers } from "../src/pages/operationsPage.js";
import { createPmcPageRenderers } from "../src/pages/pmcPage.js";
import { createPmcQueries } from "../src/queries/pmcQuery.js";
import { createProcurementQueries } from "../src/queries/procurementQuery.js";
import { createProductionQueries } from "../src/queries/productionQuery.js";
import { createOrdersPageRenderers } from "../src/pages/ordersPage.js";
import { createSystemPageRenderers } from "../src/pages/systemPage.js";
import { createWorkshopBoardPageRenderers } from "../src/pages/workshopBoardPage.js";

test("finance center summarizes all local finance rows while paginating details", async () => {
  const rows = Array.from({ length: 1200 }, (_, index) => ({
    direction: index % 2 === 0 ? "receivable" : "payable",
    counterparty: index % 2 === 0 ? "客户A" : "供应商B",
    bill_no: `FIN-${index}`,
    business_title: "往来单据",
    amount: 100,
    paid_amount: 0,
    unpaid_amount: 100,
    due_date: index % 2 === 0 ? "2026-05-01" : "2026-05-30",
    due_days: index % 2 === 0 ? -10 : 5,
    risk_status: index % 2 === 0 ? "已逾期" : "7天内到期",
    raw_json: "{}"
  }));
  const calls = [];
  const { queryFinanceCenter } = createFinanceQueries({
    buildLocalFinanceCenter,
    client: {},
    erpProtectionMode: true,
    listFinanceRecords: ({ limit }) => {
      calls.push(limit);
      return rows.slice(0, limit);
    },
    summarizeDataSourceError: (error) => error.message
  });

  const result = await queryFinanceCenter({ pagesize: 20, pageindex: 2 });

  assert.equal(result.body.summary.receivable_records, 600);
  assert.equal(result.body.summary.payable_records, 600);
  assert.equal(result.body.sections.receivables.length, 20);
  assert.equal(result.body.sections.payables.length, 20);
  assert.equal(result.body.pagination.page_index, 2);
  assert.equal(result.body.pagination.total_finance_rows, 1200);
  assert.equal(calls[0] >= 1200, true);
});

test("finance center defaults to a one year local view", async () => {
  const rows = [
    {
      direction: "receivable",
      counterparty: "一年内客户",
      bill_no: "AR-IN",
      amount: 1000,
      paid_amount: 0,
      unpaid_amount: 1000,
      bill_date: "2025-05-30",
      due_date: "2026-05-01",
      due_days: -29,
      risk_status: "已逾期",
      raw_json: "{}"
    },
    {
      direction: "payable",
      counterparty: "一年内供应商",
      bill_no: "AP-IN",
      amount: 500,
      paid_amount: 0,
      unpaid_amount: 500,
      bill_date: "2026-05-30",
      due_date: "2026-06-05",
      due_days: 6,
      risk_status: "7天内到期",
      raw_json: "{}"
    },
    {
      direction: "receivable",
      counterparty: "旧客户",
      bill_no: "AR-OLD",
      amount: 9000,
      paid_amount: 0,
      unpaid_amount: 9000,
      bill_date: "2025-05-29",
      due_date: "2025-06-30",
      due_days: -334,
      risk_status: "已逾期",
      raw_json: "{}"
    },
    {
      direction: "payable",
      counterparty: "未来供应商",
      bill_no: "AP-FUTURE",
      amount: 8000,
      paid_amount: 0,
      unpaid_amount: 8000,
      bill_date: "2026-06-01",
      due_date: "2026-06-08",
      due_days: 9,
      risk_status: "未到期",
      raw_json: "{}"
    }
  ];
  const { queryFinanceCenter } = createFinanceQueries({
    buildLocalFinanceCenter,
    client: {},
    erpProtectionMode: true,
    listFinanceRecords: () => rows,
    summarizeDataSourceError: (error) => error.message
  });

  const result = await queryFinanceCenter({ today: "2026-05-30", pagesize: 20 });

  assert.equal(result.body.summary.receivable_records, 1);
  assert.equal(result.body.summary.payable_records, 1);
  assert.equal(result.body.summary.receivable_unpaid, 1000);
  assert.equal(result.body.summary.payable_unpaid, 500);
  assert.deepEqual(result.body.sections.receivables.map((row) => row.bill_no), ["AR-IN"]);
  assert.deepEqual(result.body.sections.payables.map((row) => row.bill_no), ["AP-IN"]);
  assert.equal(result.body.source_status.sqlite_finance_records.rows, 2);
  assert.equal(result.body.source_status.sqlite_finance_records.total_rows, 4);
  assert.equal(result.body.filters.date_start, "2025-05-30");
  assert.equal(result.body.filters.date_end, "2026-05-30");
});

test("order center attaches standard risk summaries from PMC risk pool", async () => {
  const { queryOrderCenter } = createOrdersQueries({
    client: {},
    erpProtectionMode: true,
    latestPmcSnapshot: () => ({
      payload: {
        sections: {
          red_risks: [
            {
              risk_id: "RISK-PO-1",
              risk_level: "红牌",
              risk_type: "交期超期",
              related_object: "订单",
              related_no: "PO-1",
              source_table: "erp_sales_orders",
              source_key: "PO-1",
              suggested_action: "客户沟通"
            }
          ],
          yellow_risks: []
        }
      }
    }),
    listMaterialAlerts: () => [],
    listSalesOrders: () => [
      { order_no: "PO-1", customer: "客户A", owner: "王少花", product_name: "钼板", delivery_date: "2026-06-05", status_text: "生产中" },
      { order_no: "PO-2", customer: "客户B", owner: "田小静", product_name: "钽杯", delivery_date: "2026-06-05", status_text: "生产中" }
    ],
    summarizeDataSourceError: (error) => error.message,
    withTimeout: (promise) => promise
  });

  const result = await queryOrderCenter({ today: "2026-05-29", pagesize: 20 });
  const byOrder = new Map(result.body.rows.map((row) => [row.order_no, row]));

  assert.equal(byOrder.get("PO-1").risk_count, 1);
  assert.equal(byOrder.get("PO-1").top_risk_level, "红牌");
  assert.equal(byOrder.get("PO-1").risk_next_action, "客户沟通");
  assert.equal(byOrder.get("PO-2").risk_summary, "无红黄牌");
});

test("order center prefers persisted standard risks over transient PMC snapshots", async () => {
  const { queryOrderCenter } = createOrdersQueries({
    client: {},
    erpProtectionMode: true,
    latestPmcSnapshot: () => null,
    listStandardRisks: () => [
      {
        risk_id: "RISK-PO-PERSISTED",
        risk_level: "红牌",
        risk_type: "物料断供",
        related_object: "订单",
        related_no: "PO-PERSISTED",
        source_table: "standard_risks",
        source_key: "RISK-PO-PERSISTED",
        suggested_action: "确认替代库存"
      }
    ],
    listMaterialAlerts: () => [],
    listSalesOrders: () => [
      { order_no: "PO-PERSISTED", customer: "客户A", owner: "王少花", product_name: "钼板", delivery_date: "2026-06-05", status_text: "生产中" }
    ],
    summarizeDataSourceError: (error) => error.message,
    withTimeout: (promise) => promise
  });

  const result = await queryOrderCenter({ today: "2026-05-29", pagesize: 20 });

  assert.equal(result.body.sections.standard_risks[0].risk_id, "RISK-PO-PERSISTED");
  assert.equal(result.body.rows[0].risk_next_action, "确认替代库存");
});

test("finance center fuzzy-searches local SQLite and paginates top 100 rankings", async () => {
  const rows = [];
  for (let index = 1; index <= 120; index += 1) {
    const suffix = String(index).padStart(3, "0");
    rows.push({
      direction: "receivable",
      counterparty: `客户-${suffix}`,
      bill_no: `AR-${suffix}`,
      business_title: `销售应收-${suffix}`,
      amount: 200000 - index,
      paid_amount: 0,
      unpaid_amount: 200000 - index,
      due_date: "2026-06-30",
      due_days: 32,
      risk_status: "未清",
      raw_json: "{}"
    });
    rows.push({
      direction: "payable",
      counterparty: `供应商-${suffix}`,
      bill_no: `AP-${suffix}`,
      business_title: `采购应付-${suffix}`,
      amount: 100000 - index,
      paid_amount: 0,
      unpaid_amount: 100000 - index,
      due_date: "2026-06-30",
      due_days: 32,
      risk_status: "未清",
      raw_json: "{}"
    });
  }
  const { queryFinanceCenter } = createFinanceQueries({
    buildLocalFinanceCenter,
    client: {
      queryView: async () => {
        throw new Error("ERP should not be called for local fuzzy search");
      }
    },
    erpProtectionMode: true,
    listFinanceRecords: () => rows,
    summarizeDataSourceError: (error) => error.message
  });

  const ranked = await queryFinanceCenter({ rank_page: 2, rank_pagesize: 20 });
  const searched = await queryFinanceCenter({ searchKey: "客户-025", rank_page: 1, rank_pagesize: 20 });

  assert.equal(ranked.body.ranking_pagination.ranking_limit, 100);
  assert.equal(ranked.body.ranking_pagination.total_pages, 5);
  assert.equal(ranked.body.sections.receivable_debts.length, 20);
  assert.equal(ranked.body.sections.payable_debts.length, 20);
  assert.equal(ranked.body.sections.receivable_debts[0].counterparty, "客户-021");
  assert.equal(ranked.body.sections.payable_debts[0].counterparty, "供应商-021");
  assert.equal(searched.body.summary.receivable_records, 1);
  assert.equal(searched.body.summary.payable_records, 0);
  assert.equal(searched.body.sections.receivable_debts[0].counterparty, "客户-025");
  assert.equal(searched.body.filters.searchKey, "客户-025");
});

test("finance center exposes standard finance risks from PMC risk pool", async () => {
  const { queryFinanceCenter } = createFinanceQueries({
    buildLocalFinanceCenter,
    client: {},
    erpProtectionMode: true,
    latestPmcSnapshot: () => ({
      payload: {
        sections: {
          red_risks: [],
          yellow_risks: [
            {
              risk_id: "RISK-AR-1",
              risk_level: "黄牌",
              risk_type: "逾期应收",
              related_object: "财务",
              related_no: "AR-1",
              source_table: "erp_finance_records",
              source_key: "F-1",
              counterparty: "客户A",
              suggested_action: "联系客户付款"
            }
          ]
        }
      }
    }),
    listFinanceRecords: () => [
      { direction: "receivable", counterparty: "客户A", bill_no: "AR-1", amount: 1000, paid_amount: 0, unpaid_amount: 1000, due_date: "2026-05-20", due_days: -9, risk_status: "已逾期" }
    ],
    summarizeDataSourceError: (error) => error.message
  });

  const result = await queryFinanceCenter({ pagesize: 20 });

  assert.equal(result.body.sections.finance_risks.length, 1);
  assert.equal(result.body.sections.receivables[0].risk_count, 1);
  assert.equal(result.body.sections.receivables[0].risk_next_action, "联系客户付款");
});

test("finance center prefers persisted standard finance risks", async () => {
  const { queryFinanceCenter } = createFinanceQueries({
    buildLocalFinanceCenter,
    client: {},
    erpProtectionMode: true,
    latestPmcSnapshot: () => null,
    listStandardRisks: () => [
      {
        risk_id: "RISK-AR-PERSISTED",
        risk_level: "黄牌",
        risk_type: "逾期应收",
        related_object: "财务",
        related_no: "AR-PERSISTED",
        source_table: "standard_risks",
        source_key: "RISK-AR-PERSISTED",
        counterparty: "客户A",
        suggested_action: "确认回款计划"
      }
    ],
    listFinanceRecords: () => [
      { direction: "receivable", counterparty: "客户A", bill_no: "AR-PERSISTED", amount: 1000, paid_amount: 0, unpaid_amount: 1000, due_date: "2026-05-20", due_days: -9, risk_status: "已逾期" }
    ],
    summarizeDataSourceError: (error) => error.message
  });

  const result = await queryFinanceCenter({ pagesize: 20 });

  assert.equal(result.body.sections.finance_risks[0].risk_id, "RISK-AR-PERSISTED");
  assert.equal(result.body.sections.receivables[0].risk_next_action, "确认回款计划");
});

test("finance center can show all top 100 ranking rows on one page", async () => {
  const rows = Array.from({ length: 120 }, (_, index) => ({
    direction: "receivable",
    counterparty: `客户-${String(index + 1).padStart(3, "0")}`,
    bill_no: `AR-${index + 1}`,
    business_title: "销售应收",
    amount: 100000 - index,
    paid_amount: 0,
    unpaid_amount: 100000 - index,
    risk_status: "未清",
    raw_json: "{}"
  }));
  const { queryFinanceCenter } = createFinanceQueries({
    buildLocalFinanceCenter,
    client: {},
    erpProtectionMode: true,
    listFinanceRecords: () => rows,
    summarizeDataSourceError: (error) => error.message
  });

  const result = await queryFinanceCenter({ rank_pagesize: 100 });

  assert.equal(result.body.sections.receivable_debts.length, 100);
  assert.equal(result.body.ranking_pagination.page_size, 100);
  assert.equal(result.body.ranking_pagination.total_pages, 1);
});

test("procurement center reads local purchase orders and suppliers before touching ERP", async () => {
  const { queryProcurementCenter } = createProcurementQueries({
    client: {
      queryView: async () => {
        throw new Error("ERP should not be called");
      }
    },
    erpProtectionMode: true,
    listFinanceRecords: () => [],
    listPurchaseOrders: () => [
      { purchase_no: "CG-001", supplier: "供应商A", title: "钼粉采购", buyer: "采购员", amount: 1000, order_date: "2026-05-01", expected_arrival_date: "2026-05-20", status: "已下单" }
    ],
    listSuppliers: () => [
      { name: "供应商A", contact: "张三", phone: "13800000000", level: "A", status: "正常" }
    ],
    summarizeDataSourceError: (error) => error.message,
    withTimeout: (promise) => promise
  });

  const result = await queryProcurementCenter({ today: "2026-05-28" });

  assert.equal(result.body.cached, true);
  assert.equal(result.body.summary.purchase_orders, 1);
  assert.equal(result.body.summary.supplier_count, 1);
  assert.equal(result.body.sections.followups[0].related_no, "CG-001");
  assert.equal(result.body.sections.followups[0].supplier_contact, "张三");
  assert.equal(result.body.sections.purchase_orders[0].purchase_no, "CG-001");
});

test("material control recomputes local stock alerts from inventory summary and details", async () => {
  const { queryMaterialControl } = createMaterialExceptionQueries({
    buildLocalExceptionCenter: () => ({}),
    client: {},
    erpProtectionMode: true,
    interventionLogHref: () => "",
    isInterventionFinal: () => false,
    latestPmcInterventionsByRelatedNos: () => new Map(),
    latestPmcSnapshot: () => null,
    listInventoryDetails: () => [
      { product_code: "MO-OLD", product_name: "钼旧料", warehouse: "20号废料库", available_qty: 12, stock_qty: 12, stock_age_days: 220, initial_inbound_time: "2025-10-01", batch_no: "B-OLD" },
      { product_code: "MO-FROZEN", product_name: "冻结钼", warehouse: "1号钽铌库", available_qty: 0, stock_qty: 5, frozen_qty: 5, stock_age_days: 10, batch_no: "B-FRZ" }
    ],
    listInventorySummary: () => [
      { product_code: "MO-LOW", product_name: "低库存钼", warehouse: "1号钽铌库", available_qty: 2, stock_qty: 2, unit: "kg" }
    ],
    listMaterialAlerts: () => [],
    pmcInterventionHref: () => "",
    pmcRiskClosure: () => ({}),
    queryLocalPmcDashboard: () => null,
    queryPmcDashboard: async () => ({}),
    summarizeDataSourceError: (error) => error.message,
    withTimeout: (promise) => promise
  });

  const result = await queryMaterialControl({ low_stock_threshold: 5, old_stock_days: 180 });

  assert.equal(result.body.cached, true);
  assert.equal(result.body.summary.low_stock, 1);
  assert.equal(result.body.summary.frozen_stock, 1);
  assert.equal(result.body.summary.old_stock, 1);
  assert.equal(result.body.sections.low_stock[0].product_code, "MO-LOW");
  assert.equal(result.body.sections.frozen_stock[0].product_code, "MO-FROZEN");
  assert.equal(result.body.sections.old_stock[0].product_code, "MO-OLD");
});

test("PMC open risk view keeps responded items until they are closed", () => {
  const { pmcConsolePage } = createPmcPageRenderers({
    escapeHtml: (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
    formatCell: (value) => String(value ?? ""),
    labelFor,
    latestPmcInterventions: () => [],
    latestPmcInterventionsByRelatedNos: () => new Map([["PO-RESP", {
      related_no: "PO-RESP",
      created_at: "2026-05-28T08:00:00.000Z",
      action_label: "已响应",
      intervention_state: "已响应",
      actor: "PMC"
    }]]),
    parseBoolean,
    parseNumber,
    pmcInterventionSummary: () => ({
      today_actions: 0,
      recent_actions: [],
      by_risk_type: [],
      by_result_type: [],
      by_closure_quality: [],
      improvement_suggestions: []
    }),
    renderTopNav: () => "",
    sharedNavCss: () => "",
    formatDate,
    formatDateTime
  });
  const body = {
    generated_at: "2026-05-28T08:00:00.000Z",
    summary: {},
    command_center: {},
    notes: [],
    sections: {
      red_risks: [{ risk_level: "红牌", risk_type: "物料断供", related_no: "PO-RESP", problem: "缺料已响应但未关闭", buttons: ["标记处理中"] }],
      yellow_risks: [],
      morning_brief: [{ priority_no: 1, risk_level: "红牌", risk_type: "物料断供", related_no: "PO-RESP", headline: "缺料已响应但未关闭", buttons: ["标记处理中"] }],
      intervention_tasks: [{ risk_level: "红牌", risk_type: "物料断供", related_no: "PO-RESP", problem: "缺料已响应但未关闭", buttons: ["标记处理中"] }],
      command_insights: [],
      command_meeting_actions: [],
      data_freshness: [],
      risk_type_summary: [],
      risk_owner_summary: [],
      upstream_flow_risks: [],
      upstream_flow_handoffs: [],
      upstream_flow_coverage: [],
      upstream_flow_gaps: []
    }
  };

  const html = pmcConsolePage(body, { open_only: "1", command_view: "1" });

  assert.match(html, /PO-RESP/);
  assert.match(html, /已响应待关闭|已响应/);
});

test("PMC command tables use compact column classes for wide risk data", () => {
  const { pmcConsolePage } = createPmcPageRenderers({
    escapeHtml: (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
    formatCell: (value) => String(value ?? ""),
    labelFor,
    latestPmcInterventions: () => [],
    latestPmcInterventionsByRelatedNos: () => new Map(),
    parseBoolean,
    parseNumber,
    pmcInterventionSummary: () => ({
      today_actions: 0,
      recent_actions: [],
      by_risk_type: [],
      by_result_type: [],
      by_closure_quality: [],
      improvement_suggestions: []
    }),
    renderTopNav: () => "",
    sharedNavCss: () => "",
    formatDate,
    formatDateTime
  });
  const html = pmcConsolePage({
    generated_at: "2026-05-28T08:00:00.000Z",
    summary: {},
    command_center: {},
    notes: [],
    sections: {
      red_risks: [{ risk_score: 95, risk_level: "红牌", risk_type: "物料断供", related_no: "PO-1", problem: "缺料影响订单", rule_reason: "必须今天处理", score_reason: "红牌", buttons: ["标记处理中"] }],
      yellow_risks: [],
      morning_brief: [],
      intervention_tasks: [],
      command_insights: [],
      command_meeting_actions: [],
      data_freshness: [],
      risk_type_summary: [],
      risk_owner_summary: [],
      upstream_flow_risks: [],
      upstream_flow_handoffs: [],
      upstream_flow_coverage: [],
      upstream_flow_gaps: []
    }
  }, { command_view: "1" });

  assert.match(html, /\.command-panel table \{ min-width: 1180px;/);
  assert.match(html, /class="col-problem"/);
  assert.match(html, /overflow-wrap:\s*break-word/);
});

test("PMC page exposes local SQLite AI chat entry", () => {
  const { pmcConsolePage } = createPmcPageRenderers({
    escapeHtml: (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
    formatCell: (value) => String(value ?? ""),
    labelFor,
    latestPmcInterventions: () => [],
    latestPmcInterventionsByRelatedNos: () => new Map(),
    parseBoolean,
    parseNumber,
    pmcInterventionSummary: () => ({
      today_actions: 0,
      recent_actions: [],
      by_risk_type: [],
      by_result_type: [],
      by_closure_quality: [],
      improvement_suggestions: []
    }),
    renderTopNav: () => "",
    sharedNavCss: () => "",
    formatDate,
    formatDateTime
  });
  const html = pmcConsolePage({
    generated_at: "2026-05-28T08:00:00.000Z",
    summary: {},
    command_center: {},
    notes: [],
    sections: {
      red_risks: [],
      yellow_risks: [],
      morning_brief: [],
      intervention_tasks: [],
      command_insights: [],
      command_meeting_actions: [],
      data_freshness: [],
      risk_type_summary: [],
      risk_owner_summary: [],
      upstream_flow_risks: [],
      upstream_flow_handoffs: [],
      upstream_flow_coverage: [],
      upstream_flow_gaps: []
    }
  }, { command_view: "1" });

  assert.match(html, /AI数据助手/);
  assert.match(html, /id="pmcAiChatForm"/);
  assert.match(html, /\/api\/ai\/chat/);
  assert.match(html, /只基于本地 SQLite 已同步数据回答/);
});

test("PMC page does not expose score reason text in management views", () => {
  const { pmcConsolePage } = createPmcPageRenderers({
    escapeHtml: (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
    formatCell: (value) => String(value ?? ""),
    labelFor,
    latestPmcInterventions: () => [],
    latestPmcInterventionsByRelatedNos: () => new Map(),
    parseBoolean,
    parseNumber,
    pmcInterventionSummary: () => ({
      today_actions: 0,
      recent_actions: [],
      by_risk_type: [],
      by_result_type: [],
      by_closure_quality: [],
      improvement_suggestions: []
    }),
    renderTopNav: () => "",
    sharedNavCss: () => "",
    formatDate,
    formatDateTime
  });
  const html = pmcConsolePage({
    generated_at: "2026-05-28T08:00:00.000Z",
    summary: {},
    command_center: {},
    notes: [],
    sections: {
      red_risks: [{
        risk_score: 100,
        risk_level: "红牌",
        risk_type: "产能瓶颈",
        related_no: "PO-1",
        problem: "冲压延期：工序未完成",
        rule_reason: "必须今天处理",
        score_reason: "红牌基础60；前道断点权重+40",
        buttons: ["标记处理中"]
      }],
      yellow_risks: [{
        risk_score: 80,
        risk_level: "黄牌",
        risk_type: "交期预警",
        related_no: "PO-2",
        problem: "剩余工序周期偏紧",
        rule_reason: "3天内可能恶化",
        score_reason: "黄牌基础40；剩余周期不足+20",
        buttons: ["协调工序"]
      }],
      morning_brief: [{
        priority_no: 1,
        risk_level: "红牌",
        risk_score: 100,
        headline: "冲压延期：工序未完成",
        related_no: "PO-1",
        owner_role: "PMC/冲压工段",
        meeting_focus: "今天确认产能、班次和外协选择",
        score_reason: "红牌基础60；前道断点权重+40；已超过计划/交期+20；存在剩余/缺口数量+5",
        buttons: ["标记处理中"]
      }],
      intervention_tasks: [],
      command_insights: [],
      command_meeting_actions: [],
      data_freshness: [],
      risk_type_summary: [],
      risk_owner_summary: [],
      upstream_flow_risks: [],
      upstream_flow_handoffs: [],
      upstream_flow_coverage: [],
      upstream_flow_gaps: []
    }
  }, { command_view: "1" });

  assert.match(html, /class="panel command-panel morning-brief-panel"/);
  assert.match(html, /\.morning-brief-panel table \{ min-width: 1760px; table-layout: auto;/);
  assert.match(html, /\.morning-brief-panel \.col-meeting_focus/);
  assert.doesNotMatch(html, /评分依据/);
  assert.doesNotMatch(html, /score_reason|col-score_reason|reason-list|reason-item/);
  assert.doesNotMatch(html, /红牌基础60|前道断点权重|黄牌基础40|剩余周期不足/);
});

test("PMC page provides a mobile-first command summary without removing desktop detail", () => {
  const { pmcConsolePage } = createPmcPageRenderers({
    escapeHtml: (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
    formatCell: (value) => String(value ?? ""),
    labelFor,
    latestPmcInterventions: () => [],
    latestPmcInterventionsByRelatedNos: () => new Map(),
    parseBoolean,
    parseNumber,
    pmcInterventionSummary: () => ({
      today_actions: 0,
      recent_actions: [],
      by_risk_type: [],
      by_result_type: [],
      by_closure_quality: [],
      improvement_suggestions: []
    }),
    renderTopNav: () => "",
    sharedNavCss: () => "",
    formatDate,
    formatDateTime
  });
  const html = pmcConsolePage({
    generated_at: "2026-05-28T08:00:00.000Z",
    summary: { shortage_orders: 1, delayed_procedures: 2 },
    command_center: { red_count: 1, yellow_count: 1, risk_item_count: 2, monitored_item_count: 10 },
    notes: [],
    sections: {
      red_risks: [{ risk_level: "红牌", risk_type: "交期风险", related_no: "PO-RED", problem: "订单已经逾期", owner_role: "PMC", next_action: "今天确认发货", buttons: ["标记处理中"] }],
      yellow_risks: [{ risk_level: "黄牌", risk_type: "物料预警", related_no: "PO-YELLOW", problem: "物料即将短缺", owner_role: "采购", next_action: "确认到货", buttons: ["标记处理中"] }],
      morning_brief: [{
        priority_no: 1,
        risk_level: "红牌",
        risk_score: 95,
        headline: "优先处理逾期订单",
        related_no: "PO-RED",
        owner_role: "PMC",
        next_action: "今天确认发货",
        meeting_focus: "早会确认责任人和反馈时间",
        score_reason: "红牌基础60；已超过计划/交期+20",
        buttons: ["标记处理中"]
      }],
      intervention_tasks: [],
      command_insights: [{ insight_type: "早会重点", risk_level: "红牌", conclusion: "先处理PO-RED", next_action: "PMC 2小时内反馈" }],
      command_meeting_actions: [],
      data_freshness: [],
      risk_type_summary: [],
      risk_owner_summary: [],
      owner_workbenches: [],
      order_procedure_coverage: [],
      order_procedure_matches: [],
      unmatched_procedure_plans: [],
      order_battle_map: [],
      order_battle_stages: [],
      order_battle_summary: [],
      priority_risks: [],
      upstream_flow_risks: [],
      upstream_flow_handoffs: [],
      upstream_flow_coverage: [],
      upstream_flow_gaps: [],
      stamping_delayed_procedures: [],
      overdue_orders: [],
      due_soon_orders: [],
      shortage_orders: [],
      delayed_procedures: [],
      low_stock: [],
      overdue_receivables: [],
      due_soon_payables: []
    }
  }, { command_view: "1" });

  assert.match(html, /class="pmc-mobile-priority"/);
  assert.match(html, /手机重点/);
  assert.match(html, /class="pmc-mobile-risk-card danger"/);
  assert.match(html, /class="pmc-mobile-risk-card warning"/);
  assert.match(html, /PO-RED/);
  assert.match(html, /PO-YELLOW/);
  assert.match(html, /class="pmc-desktop-detail"/);
  assert.match(html, /@media \(max-width: 720px\)[\s\S]*\.pmc-mobile-priority\s*\{[\s\S]*display:\s*block/);
  assert.match(html, /@media \(max-width: 720px\)[\s\S]*\.pmc-desktop-detail\s*\{[\s\S]*display:\s*none/);
});

test("PMC page renders textual action guide and leaves data trust to system page", () => {
  const { pmcConsolePage } = createPmcPageRenderers({
    escapeHtml: (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
    formatCell: (value) => String(value ?? ""),
    labelFor,
    latestPmcInterventions: () => [],
    latestPmcInterventionsByRelatedNos: () => new Map(),
    parseBoolean,
    parseNumber,
    pmcInterventionSummary: () => ({
      today_actions: 0,
      recent_actions: [],
      by_risk_type: [],
      by_result_type: [],
      by_closure_quality: [],
      improvement_suggestions: []
    }),
    renderTopNav: () => "",
    sharedNavCss: () => "",
    formatDate,
    formatDateTime
  });
  const html = pmcConsolePage({
    generated_at: "2026-05-28T08:00:00.000Z",
    summary: { data_trust_status: "需复核", data_trust_score: 60 },
    command_center: {},
    notes: [],
    sections: {
      red_risks: [],
      yellow_risks: [],
      morning_brief: [],
      intervention_tasks: [{
        task_no: "ACT-001",
        risk_level: "红牌",
        risk_type: "物料断供",
        related_no: "PO-TRUST",
        problem: "缺料影响交付",
        responsible_owner: "PMC/采购",
        feedback_deadline: "4小时内反馈",
        escalation_rule: "4小时内无反馈升级给管理者",
        expected_output: "明确到料、替代或调拨方案",
        primary_action: "生成催货文本",
        buttons: ["生成催货文本"]
      }],
      command_insights: [{
        insight_type: "最高风险",
        risk_score: 88,
        risk_level: "红牌",
        related_no: "PO-TRUST",
        responsible_owner: "PMC/采购",
        feedback_deadline: "4小时内反馈",
        meeting_topic: "确认缺料订单的到料、替代和调拨方案",
        decision_request: "请确认是否立即催供应商并找替代料",
        conclusion: "缺料订单需要今天处理",
        next_action: "先催供应商，再核对可调拨库存"
      }],
      command_meeting_actions: [{
        action_no: "MEET-001",
        insight_type: "物料断供",
        related_no: "PO-TRUST",
        responsible_owner: "PMC/采购",
        meeting_question: "PO-TRUST 今天能否确定到料时间",
        expected_output: "明确到料、替代或调拨方案",
        feedback_deadline: "4小时内反馈",
        escalation_rule: "4小时内无反馈升级给管理者",
        decision_request: "需要确认是否外采替代料"
      }],
      data_trust_summary: [{ trust_status: "需复核", trust_score: 60, trusted_sources: "销售订单、派工计划、应收应付", attention_sources: "物料/库存告警、库存明细批次", latest_synced_at: "2026-05-28 01:00", decision_guardrail: "关键决策需人工复核", suggested_action: "优先补同步/核对：物料/库存告警、库存明细批次" }],
      data_freshness: [],
      risk_type_summary: [],
      risk_owner_summary: [],
      upstream_flow_risks: [],
      upstream_flow_handoffs: [],
      upstream_flow_coverage: [],
      upstream_flow_gaps: []
    }
  }, { command_view: "1" });

  assert.match(html, /今日行动指南/);
  assert.match(html, /确认缺料订单的到料、替代和调拨方案/);
  assert.match(html, /PO-TRUST 今天能否确定到料时间/);
  assert.doesNotMatch(html, /今日管理判断/);
  assert.doesNotMatch(html, /早会行动清单/);
  assert.doesNotMatch(html, /数据可信度总览/);
  assert.doesNotMatch(html, /关键决策需人工复核/);
  assert.match(html, /PMC\/采购/);
  assert.match(html, /4小时内反馈/);
  assert.match(html, /4小时内无反馈升级给管理者/);
  assert.match(html, /明确到料、替代或调拨方案/);
});

test("PMC action guide highlights one urgent red/yellow risk for each core workshop", () => {
  const { pmcConsolePage } = createPmcPageRenderers({
    escapeHtml: (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
    formatCell: (value) => String(value ?? ""),
    labelFor,
    latestPmcInterventions: () => [],
    latestPmcInterventionsByRelatedNos: () => new Map(),
    parseBoolean,
    parseNumber,
    pmcInterventionSummary: () => ({
      today_actions: 0,
      recent_actions: [],
      by_risk_type: [],
      by_result_type: [],
      by_closure_quality: [],
      improvement_suggestions: []
    }),
    renderTopNav: () => "",
    sharedNavCss: () => "",
    formatDate,
    formatDateTime
  });
  const html = pmcConsolePage({
    generated_at: "2026-05-28T08:00:00.000Z",
    summary: {},
    command_center: {},
    notes: [],
    sections: {
      red_risks: [
        { risk_level: "红牌", risk_score: 91, risk_type: "产能瓶颈", related_no: "PO-STAMP-RED", problem: "冲压工段延期2天", owner_role: "PMC/冲压工段", next_action: "今天确认夜班和外协" },
        { risk_level: "红牌", risk_score: 82, risk_type: "前道断点", related_no: "PO-ROLL-LOW", problem: "轧制半成品晚于后道开工", owner_role: "PMC/轧制/后道工段", next_action: "确认转序时间" },
        { risk_level: "红牌", risk_score: 96, risk_type: "前道断点", related_no: "PO-ROLL-HIGH", problem: "轧制工段关键半成品未完成", owner_role: "PMC/轧制", next_action: "立即确认轧制完工时间" }
      ],
      yellow_risks: [
        { risk_level: "黄牌", risk_score: 75, risk_type: "产能预警", related_no: "PO-STAMP-YELLOW", problem: "冲压明日负荷偏高", owner_role: "PMC/冲压工段", next_action: "提前排班" },
        { risk_level: "黄牌", risk_score: 88, risk_type: "工序预警", related_no: "PO-TM-YELLOW", problem: "钨钼工段机加工排队", owner_role: "PMC/钨钼工段", next_action: "确认机加产能" }
      ],
      morning_brief: [],
      intervention_tasks: [],
      command_insights: [],
      command_meeting_actions: [],
      data_freshness: [],
      risk_type_summary: [],
      risk_owner_summary: [],
      upstream_flow_risks: [],
      upstream_flow_handoffs: [],
      upstream_flow_coverage: [],
      upstream_flow_gaps: []
    }
  }, { command_view: "1" });

  const guideHtml = html.slice(html.indexOf("今日行动指南"), html.indexOf("今日早会风险摘要"));
  assert.match(guideHtml, /三大工段红黄牌/);
  assert.match(guideHtml, /冲压/);
  assert.match(guideHtml, /PO-STAMP-RED/);
  assert.doesNotMatch(guideHtml, /PO-STAMP-YELLOW/);
  assert.match(guideHtml, /钨钼/);
  assert.match(guideHtml, /PO-TM-YELLOW/);
  assert.match(guideHtml, /轧制/);
  assert.match(guideHtml, /PO-ROLL-HIGH/);
  assert.doesNotMatch(guideHtml, /PO-ROLL-LOW/);
});

test("orders page renders mobile cards while keeping desktop table detail", () => {
  const { orderCenterPage } = createOrdersPageRenderers({
    escapeHtml: (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
    formatDetailCell: (_column, value) => String(value ?? ""),
    formatNumber: (value) => String(value ?? ""),
    labelFor,
    renderTopNav: () => "",
    sharedNavCss: () => ""
  });
  const html = orderCenterPage({
    scan: { pageindex: 1, pagesize: 20 },
    pagination: { page_index: 1, total_pages: 1, page_size: 20, total_sqlite_rows: 1, filtered_rows: 1, page_rows: 1 },
    summary: { total_rows: 1, visible_rows: 1, red_orders: 1, yellow_orders: 0, green_orders: 0, shortage_orders: 1, blocked_orders: 1, due_soon_orders: 0 },
    rows: [{
      status_code: "red",
      status_text: "红灯",
      priority: "高",
      order_no: "PO-MOBILE",
      customer: "印度客户",
      owner: "田小静",
      delivery_date: "2026-05-30",
      days_from_today: 1,
      blocker: "缺料",
      next_action: "催采购确认到货",
      responsible_role: "采购",
      due_status: "7天内到期",
      shortage_status: "缺料",
      risk_products: ["钼板"],
      amount: "12,000",
      approval_status: "审批通过"
    }],
    notes: []
  });

  assert.match(html, /class="orders-mobile-list"/);
  assert.match(html, /class="order-mobile-card red"/);
  assert.match(html, /class="table-wrap orders-desktop-table"/);
  assert.match(html, /PO-MOBILE/);
  assert.match(html, /@media \(max-width: 720px\)[\s\S]*\.orders-mobile-list\s*\{[\s\S]*display:\s*grid/);
  assert.match(html, /@media \(max-width: 720px\)[\s\S]*\.orders-desktop-table\s*\{[\s\S]*display:\s*none/);
  assert.match(html, /@media \(max-width: 720px\)[\s\S]*\.actions\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(html, /@media \(max-width: 720px\)[\s\S]*\.actions \.button\s*\{[\s\S]*flex:\s*0 0 auto/);
});

test("finance page uses shared mobile cards for receivable and payable panels", () => {
  const renderers = createHtmlRenderers({
    labelFor,
    formatDetailCell: (_column, value) => String(value ?? ""),
    clampInt: (value, min, max) => Math.max(min, Math.min(max, Number.parseInt(value, 10) || min))
  });
  const { financeCenterPage } = createFinancePageRenderers(renderers);
  const html = financeCenterPage({
    summary: {
      receivable_records: 1,
      payable_records: 1,
      receivable_unpaid: 12000,
      payable_unpaid: 8000,
      overdue_receivables: 1,
      due_soon_payables: 1,
      source_errors: 0
    },
    sections: {
      receivable_debts: [{ counterparty: "客户A", unpaid_amount: 12000, records: 1, overdue_records: 1, earliest_due_date: "2026-05-20", earliest_due_days: -9, risk_status: "已逾期" }],
      overdue_receivables: [{ counterparty: "客户A", bill_no: "AR-1", business_title: "销售应收", unpaid_amount: 12000, due_date: "2026-05-20", due_days: -9, owner: "销售" }],
      due_soon_payables: [{ counterparty: "供应商B", bill_no: "AP-1", business_title: "采购应付", unpaid_amount: 8000, due_date: "2026-06-01", due_days: 3, status: "待付" }],
      payable_debts: [{ counterparty: "供应商B", unpaid_amount: 8000, records: 1, overdue_records: 0, earliest_due_date: "2026-06-01", earliest_due_days: 3, risk_status: "7天内到期" }],
      receivables: [{ counterparty: "客户A", bill_no: "AR-1", business_title: "销售应收", amount: 12000, paid_amount: 0, unpaid_amount: 12000, bill_date: "2026-05-01", due_date: "2026-05-20", payment_terms: "月结", age_days: 28, due_days: -9, risk_status: "已逾期" }],
      payables: [{ counterparty: "供应商B", bill_no: "AP-1", business_title: "采购应付", amount: 8000, paid_amount: 0, unpaid_amount: 8000, bill_date: "2026-05-10", due_date: "2026-06-01", payment_terms: "30天", age_days: 19, due_days: 3, risk_status: "7天内到期" }]
    },
    ranking_pagination: { page_index: 1, page_size: 20, total_pages: 5, ranking_limit: 100, receivable_total: 100, payable_total: 80, page_start: 1, page_end: 20 },
    notes: []
  }, { searchKey: "客户A", rank_page: 1, rank_pagesize: 20, pagesize: 100 });

  assert.match(html, /class="panel mobile-card-panel/);
  assert.match(html, /<body class="finance-page">/);
  assert.match(html, /财务搜索/);
  assert.match(html, /name="searchKey" value="客户A"/);
  assert.match(html, /AI财务搜索/);
  assert.match(html, /\/api\/ai\/chat/);
  assert.match(html, /body\.finance-page \.finance-ai-chat \.ai-chat-messages\s*\{[^}]*min-height:\s*72px/);
  assert.match(html, /排行分页/);
  assert.match(html, /显示前100/);
  assert.doesNotMatch(html, /客户欠款排行 12\/20/);
  assert.match(html, /class="metric metric-money metric-receivable"/);
  assert.match(html, /12,000\.00/);
  assert.match(html, /finance-ranking-panel/);
  assert.match(html, /finance-risk-panel/);
  assert.match(html, /finance-detail-panel/);
  assert.match(html, /grid-template-columns:\s*repeat\(2,\s*minmax\(120px,\s*\.8fr\)\)\s*repeat\(2,\s*minmax\(210px,\s*1\.3fr\)\)/);
  assert.match(html, /\.money-cell/);
  assert.match(html, /\.pill\.red/);
  assert.match(html, /class="mobile-record-list"/);
  assert.match(html, /class="mobile-record-card"/);
  assert.match(html, /class="table-wrap[^"]* desktop-table-detail/);
  assert.match(html, /客户A/);
  assert.match(html, /@media \(max-width: 720px\)[\s\S]*\.panel\.mobile-card-panel \.mobile-record-list\s*\{[\s\S]*display:\s*grid/);
  assert.match(html, /@media \(max-width: 720px\)[\s\S]*\.panel\.mobile-card-panel \.desktop-table-detail\s*\{[\s\S]*display:\s*none/);
});

test("shared mobile cards can expose a short list with an expand-more control", () => {
  const renderers = createHtmlRenderers({
    labelFor,
    formatDetailCell: (_column, value) => String(value ?? ""),
    clampInt: (value, min, max) => Math.max(min, Math.min(max, Number.parseInt(value, 10) || min))
  });
  const rows = Array.from({ length: 6 }, (_, index) => ({
    related_no: `PO-${index + 1}`,
    problem: `问题${index + 1}`,
    owner: "PMC"
  }));
  const panelHtml = renderers.modulePanel("移动测试", rows, ["related_no", "problem", "owner"], {
    mobileCards: true,
    mobileLimit: 2,
    mobileTitleColumn: "related_no",
    mobileSubtitleColumns: ["owner"]
  });
  const pageHtml = renderers.modulePage({
    title: "移动测试页",
    subtitle: "验证手机卡片展开控件",
    panels: [panelHtml]
  });

  assert.match(panelHtml, /class="mobile-record-list"/);
  assert.match(panelHtml, /class="mobile-record-primary"/);
  assert.match(panelHtml, /class="mobile-record-more"/);
  assert.match(panelHtml, /展开剩余 4 条/);
  assert.match(pageHtml, /@media \(max-width: 720px\)[\s\S]*\.mobile-record-more summary/);
});

test("followup workbench uses shared mobile cards for intervention tasks", () => {
  const renderers = createHtmlRenderers({
    labelFor,
    formatDetailCell: (_column, value) => String(value ?? ""),
    clampInt: (value, min, max) => Math.max(min, Math.min(max, Number.parseInt(value, 10) || min))
  });
  const { followupWorkbenchPage } = createFollowupPageRenderers({
    briefCopyPage: () => "",
    emptyPmcConsoleBody: () => ({}),
    escapeHtml: (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
    filterPmcOpenRisks: (dashboard) => dashboard,
    formatDateTime,
    latestPmcSnapshot: () => null,
    modulePage: renderers.modulePage,
    modulePanel: renderers.modulePanel,
    parseBoolean,
    pmcClosureSummary: () => ({ open_total: 1, overdue_closures: 0, responded_total: 0 }),
    pmcMorningBriefText: () => ""
  });
  const html = followupWorkbenchPage({
    owner: "田小静",
    open_only: false,
    owners: [{ owner: "田小静", active_orders: 1, shortage_orders: 1, open_procedures: 0, todos: 1 }],
    dashboard: {
      command_center: { today_todos: 1, red_count: 1, yellow_count: 0 },
      summary: { shortage_orders: 1, delayed_procedures: 0, overdue_receivables: 0 },
      sections: {
        intervention_tasks: [{ task_no: "TASK-1", risk_level: "红牌", risk_type: "缺料", related_no: "PO-1", problem: "缺钼板", intervention_state: "待响应", response_sla: "4小时", escalation_state: "未升级", primary_action: "催采购", buttons: "标记处理中" }],
        red_risks: [],
        yellow_risks: [],
        overdue_orders: [],
        due_soon_orders: [],
        shortage_orders: [],
        delayed_procedures: []
      }
    },
    notes: []
  });

  assert.match(html, /class="panel full-width mobile-card-panel/);
  assert.match(html, /class="mobile-record-list"/);
  assert.match(html, /class="mobile-record-title">PO-1<\/div>/);
  assert.match(html, /缺钼板/);
  assert.match(html, /@media \(max-width: 720px\)[\s\S]*\.panel\.mobile-card-panel \.desktop-table-detail\s*\{[\s\S]*display:\s*none/);
});

test("production material and procurement pages use shared mobile cards", () => {
  const renderers = createHtmlRenderers({
    labelFor,
    formatDetailCell: (_column, value) => String(value ?? ""),
    clampInt: (value, min, max) => Math.max(min, Math.min(max, Number.parseInt(value, 10) || min))
  });
  const pages = createOperationsPageRenderers({
    modulePage: renderers.modulePage,
    modulePanel: renderers.modulePanel,
    escapeHtml: (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char])
  });
  const productionHtml = pages.productionCenterPage({
    summary: { progress_rows: 1, material_order_rows: 1, bom_rows: 1, procedure_plan_rows: 1, delayed_procedures: 1, work_centers: 1, source_errors: 0 },
    sections: {
      delayed_procedures: [{ work_assignment_id: "WG-1", order_no: "PO-1", product_name: "钼板", procedure_name: "轧制", work_center_name: "轧制", remaining_qty: 3, planned_finish_date: "2026-05-28", owner: "PMC", state: "延期" }],
      workload_by_center: [{ work_center_name: "轧制", procedure_count: 1, planned_qty: 10, finished_qty: 7, remaining_qty: 3, delayed_procedures: 1 }],
      progress: [{ orderNo: "PO-1", productName: "钼板", procedureName: "轧制", planNum: 10, finishNum: 7, state: "生产中" }],
      material_orders: [{ orderNo: "PO-1", productName: "钼板", materialName: "钼坯", num: 10, state: "已领料" }],
      boms: [{ bom_no: "BOM-1", bom_title: "钼板BOM", parent_product: "钼板", effective_status: "有效", enabled_status: "启用", bom_type: "生产", customer_scope: "", owner: "工艺", created_date: "2026-05-01" }],
      procedure_plans: [{ work_assignment_id: "WG-1", order_no: "PO-1", product_name: "钼板", procedure_name: "轧制", work_center_name: "轧制", planned_qty: 10, finished_qty: 7, remaining_qty: 3, planned_start_date: "2026-05-26", planned_finish_date: "2026-05-28", owner: "PMC" }]
    },
    notes: []
  });
  const materialHtml = pages.materialControlPage({
    summary: { material_tasks: 1, urgent_material_tasks: 1, shortage_orders: 1, shortage_rows: 1, low_stock: 1, frozen_stock: 1, old_stock: 1, source_errors: 0 },
    sections: {
      material_tasks: [{ material_task_no: "MAT-1", priority: "高", material_task_type: "缺料", related_no: "PO-1", customer: "客户A", product_name: "钼板", product_code: "MO-1", warehouse: "20号废料库", demand_qty: 10, available_qty: 4, shortage_qty: 6, responsible_role: "采购", action: "催货" }],
      shortage_rows: [{ order_no: "PO-1", customer: "客户A", product_name: "钼板", product_code: "MO-1", demand_qty: 10, available_qty: 4, shortage_qty: 6 }],
      low_stock: [{ product_code: "MO-1", product_name: "钼板", warehouse: "20号废料库", available_qty: 2, stock_qty: 2 }],
      frozen_stock: [{ product_code: "MO-2", product_name: "冻结料", warehouse: "1号库", available_qty: 0, stock_qty: 5 }],
      old_stock: [{ product_code: "MO-3", product_name: "长库龄料", warehouse: "1号库", available_qty: 5, stock_qty: 5 }]
    },
    notes: []
  });
  const procurementHtml = pages.procurementCenterPage({
    summary: { followup_tasks: 1, urgent_followups: 1, purchase_orders: 1, inbound_records: 1, payable_records: 1, supplier_count: 1, source_errors: 0 },
    sections: {
      followups: [{ followup_no: "F-1", priority: "高", followup_type: "到货", supplier: "供应商A", related_no: "CG-1", item: "钼粉", quantity: 10, amount: 1000, status: "未到货", due_date: "2026-05-28", age_days: 2, responsible_role: "采购", action: "催货" }],
      purchase_orders: [{ purchase_no: "CG-1", supplier: "供应商A", supplier_contact: "张三", supplier_phone: "138", title: "钼粉采购", buyer: "采购", amount: 1000, order_date: "2026-05-20", expected_arrival_date: "2026-05-28", due_days: -1, status: "未到货" }],
      suppliers: [{ supplier: "供应商A", followup_tasks: 1, urgent_followups: 1, unpaid_amount: 1000, latest_action: "催货" }],
      stock_in_records: [{ receipt_no: "RK-1", title: "钼粉入库", quantity: 10, receipt_status: "待入库", receipt_type: "采购", warehouse_keeper: "仓库", applicant: "采购", confirmed_time: "" }],
      payables: [{ counterparty: "供应商A", bill_no: "AP-1", business_title: "钼粉采购", amount: 1000, paid_amount: 0, unpaid_amount: 1000, due_date: "2026-05-30", risk_status: "未清", owner: "财务" }]
    },
    notes: []
  });

  for (const html of [productionHtml, materialHtml, procurementHtml]) {
    assert.equal((html.match(/mobile-card-panel/g) || []).length >= 5, true);
    assert.match(html, /class="mobile-record-list"/);
    assert.match(html, /class="table-wrap[^"]* desktop-table-detail/);
  }
  assert.match(productionHtml, /WG-1/);
  assert.match(materialHtml, /MAT-1/);
  assert.match(procurementHtml, /CG-1/);
});

test("workshop section screen exposes tablet card mode while keeping desktop table", () => {
  const renderers = createHtmlRenderers({
    labelFor,
    formatDetailCell: (_column, value) => String(value ?? ""),
    clampInt: (value, min, max) => Math.max(min, Math.min(max, Number.parseInt(value, 10) || min))
  });
  const { workshopSectionScreenPage } = createWorkshopBoardPageRenderers({
    modulePage: renderers.modulePage,
    escapeHtml: (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
    formatCell: (value) => String(value ?? ""),
    labelFor,
    parseBoolean
  });
  const html = workshopSectionScreenPage({
    today: "2026-05-29",
    sections: [{
      key: "rolling",
      title: "轧制",
      description: "轧制工段",
      page_path: "/workshop-board/rolling",
      active_plans: 1,
      delayed_plans: 1,
      material_alerts: 1,
      completion_rate: 70,
      today_report_qty: 7,
      today_report_rows: 1,
      planned_qty: 10,
      finished_qty: 7,
      remaining_qty: 3,
      warnings: [{ warning_type: "缺料", level: "高", related_object: "派工", related_id: "WG-1", message: "钼坯不足" }],
      top_warnings: [{ warning_type: "缺料", level: "高", related_object: "派工", related_id: "WG-1", message: "钼坯不足" }],
      plans: [{ status: "进行中", work_assignment_id: "WG-1", sales_order_no: "PO-1", product_name: "钼板", procedure_name: "轧制", work_center_name: "轧制", planned_qty: 10, finished_qty: 7, remaining_qty: 3, planned_finish_date: "2026-05-29" }]
    }]
  }, "rolling");

  assert.match(html, /class="workshop-tablet-list"/);
  assert.match(html, /class="workshop-tablet-card/);
  assert.match(html, /class="table-wrap workshop-desktop-table(?: workshop-fit-table)?"/);
  assert.match(html, /class="workshop-nowrap">2026-05-29/);
  assert.match(html, /class="workshop-nowrap">10\.00/);
  assert.doesNotMatch(html, /计划\/完成\/剩余/);
  assert.match(html, /body\.workshop-screen \.metric strong \{[^}]*white-space:\s*nowrap/);
  assert.match(html, /@media \(max-width: 1180px\)[\s\S]*\.workshop-tablet-list\s*\{[\s\S]*display:\s*grid/);
  assert.match(html, /@media \(max-width: 1180px\)[\s\S]*\.workshop-desktop-table\s*\{[\s\S]*display:\s*none/);
});

test("workshop overview keeps workshop metrics in one desktop row", () => {
  const renderers = createHtmlRenderers({
    labelFor,
    formatDetailCell: (_column, value) => String(value ?? ""),
    clampInt: (value, min, max) => Math.max(min, Math.min(max, Number.parseInt(value, 10) || min))
  });
  const { workshopBoardPage } = createWorkshopBoardPageRenderers({
    modulePage: renderers.modulePage,
    escapeHtml: (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
    formatCell: (value) => String(value ?? ""),
    labelFor,
    parseBoolean
  });
  const html = workshopBoardPage({
    today: "2026-05-29",
    summary: { active_plans: 920, completed_plans: 757, delayed_plans: 37, material_alerts: 12, today_report_qty: 0 },
    sections: [{
      key: "rolling",
      title: "轧制",
      description: "轧制工段",
      page_path: "/workshop-board/rolling",
      active_plans: 9,
      delayed_plans: 13,
      material_alerts: 0,
      completion_rate: 0.5,
      today_report_qty: 0,
      planned_qty: 3024,
      finished_qty: 15.75,
      remaining_qty: 3626.85,
      warnings: [],
      top_warnings: [],
      top_plans: []
    }],
    notes: []
  });

  assert.match(html, /class="summary workshop-section-metrics"/);
  assert.match(html, /grid-template-columns:\s*repeat\(8,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(html, /\.workshop-tablet-list\s*\{\s*display:\s*none/);
  assert.doesNotMatch(html, /计划\/完成\/剩余/);
});

test("system page keeps essential mobile actions and hides technical panels on phone", () => {
  const renderers = createHtmlRenderers({
    labelFor,
    formatDetailCell: (_column, value) => String(value ?? ""),
    clampInt: (value, min, max) => Math.max(min, Math.min(max, Number.parseInt(value, 10) || min))
  });
  const { systemStatusPage } = createSystemPageRenderers(renderers);
  const html = systemStatusPage({
    summary: {
      erp_online: true,
      erp_protection_mode: "开启",
      sync_paused: "否",
      erp_latency_ms: 20,
      erp_request_min_interval_ms: 1500,
      erp_queue_queued: 0,
      erp_queue_running: 0,
      erp_request_failed: 0,
      erp_request_log_failures: 0,
      has_snapshot: true,
      sync_sources: 8,
      sync_failures: 0,
      sync_in_cooldown: 0,
      module_count: 8
    },
    sections: {
      erp_status: [{ ok: true, message: "ok", latency_ms: 20, session_tail: "abc" }],
      sync_pause: [{ paused: false, message: "未暂停", flag_path: "" }],
      erp_queue: [{ queued: 0, running: 0, completed: 1, failed: 0, consecutive_failures: 0, circuit_state: "closed", circuit_failure_threshold: 3, circuit_cooldown_ms: 60000, circuit_open_until: "", min_interval_ms: 1500, last_started_at: "", last_finished_at: "", last_error: "" }],
      erp_request_logs: [{ requested_at: "2026-05-29", method: "POST", path: "/login", status: "ok", duration_ms: 20, error_message: "" }],
      snapshot: [{ created_at: "2026-05-29", today_orders: 1, month_orders: 10, overdue_orders: 0, shortage_orders: 1, low_stock: 1 }],
      data_trust_summary: [{ trust_status: "需复核", trust_score: 60, trusted_sources: "销售订单、派工计划、应收应付", attention_sources: "物料/库存告警、库存明细批次", latest_synced_at: "2026-05-28 01:00", decision_guardrail: "关键决策需人工复核", suggested_action: "优先补同步/核对：物料/库存告警、库存明细批次" }],
      data_freshness: [{ source_name: "物料/库存告警", row_count: 0, latest_synced_at: "", freshness_status: "缺数据", impact: "缺料判断需人工复核", action: "补同步物料/库存告警" }],
      standard_risk_summary: [{ source_table: "standard_risks", generated_at: "2026-05-29T01:00:00.000Z", total_risks: 12, open_risks: 9, red_risks: 4, yellow_risks: 8 }],
      sync_policy: [{ label: "销售订单", recommended_interval: "每天", risk_level: "低", last_status: "success", last_rows: 20, last_finished_at: "2026-05-29", next_allowed_at: "", health_status: "可同步", action: "同步" }],
      sync_runs: [{ source_key: "sales_orders", started_at: "2026-05-29", finished_at: "2026-05-29", status: "success", rows_synced: 20, error_message: "" }],
      user_roles: [{ name: "田小静", role: "跟单", is_followup: 1, note: "", password_reset_at: "", updated_at: "2026-05-29" }],
      modules: [{ name: "PMC", path: "/pmc", status: "正常" }]
    },
    notes: []
  });

  assert.match(html, /body class="system-page"/);
  assert.match(html, /手机常用操作/);
  assert.match(html, /数据可信度总览/);
  assert.match(html, /统一风险模型/);
  assert.match(html, /standard_risks/);
  assert.match(html, /当前判断依据/);
  assert.match(html, /关键决策需人工复核/);
  assert.match(html, /class="panel full-width mobile-card-panel system-mobile-essential"/);
  assert.match(html, /class="panel[^"]*mobile-hidden-panel/);
  assert.match(html, /@media \(max-width: 720px\)[\s\S]*\.mobile-hidden-panel\s*\{[\s\S]*display:\s*none/);
});

test("PMC console uses a fresh snapshot before recomputing local dashboard", async () => {
  let listSalesOrdersCalls = 0;
  const { queryPmcConsole } = createPmcQueries({
    buildLocalPmcDashboard: () => {
      throw new Error("local dashboard should not recompute when fresh cache exists");
    },
    client: {},
    enrichPmcInterventionStatus: (dashboard) => dashboard,
    latestPmcSnapshot: () => ({
      created_at: new Date().toISOString(),
      summary: { shortage_orders: 2 },
      payload: {
        model: "pmc_console",
        generated_at: "2026-05-29T01:00:00.000Z",
        summary: { shortage_orders: 2 },
        sections: { red_risks: [] },
        notes: ["cached"]
      }
    }),
    listFinanceRecords: () => [],
    listInventoryDetails: () => [],
    listLocalUserRoles: () => [],
    listMaterialAlerts: () => [],
    listOrderProcedureLinks: () => [],
    listProcedurePlans: () => [],
    listProcessReports: () => [],
    listSalesOrders: () => {
      listSalesOrdersCalls += 1;
      return [{ order_no: "PO-1" }];
    },
    savePmcSnapshot: () => {},
    summarizeDataSourceError: (error) => error.message,
    withTimeout: (promise) => promise
  });

  const result = await queryPmcConsole({});

  assert.equal(result.body.cached, true);
  assert.equal(result.body.cache_source, "pmc_dashboard_snapshots");
  assert.equal(result.body.summary.shortage_orders, 2);
  assert.equal(listSalesOrdersCalls, 0);
});

test("local order center fills delivery date from stored ERP raw fields", async () => {
  const { queryOrderCenter } = createOrdersQueries({
    client: {},
    erpProtectionMode: true,
    latestPmcSnapshot: () => null,
    listMaterialAlerts: () => [],
    listSalesOrders: () => [
      {
        erp_id: "17333",
        order_no: "YJ生产销售20260500216",
        customer: "客户A",
        owner: "销售A",
        amount: 1234567.89,
        signed_date: "2026-05-20",
        delivery_date: "",
        status_text: "未发货",
        raw_json: JSON.stringify({ Date7: "2026-05-30", dateZZ: "2026-06-01" })
      }
    ],
    summarizeDataSourceError: (error) => error.message,
    withTimeout: (promise) => promise
  });

  const result = await queryOrderCenter({ today: "2026-05-28", pagesize: 20 });

  assert.equal(result.body.rows[0].delivery_date, "2026-05-30");
  assert.equal(result.body.rows[0].days_from_today, 2);
  assert.equal(result.body.rows[0].due_status, "7天内到期");
});

test("order page labels delivery date as 交期 and keeps amount column nowrap", () => {
  const { orderCenterPage } = createOrdersPageRenderers({
    escapeHtml: (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
    formatDetailCell: (column, value) => String(value ?? ""),
    formatNumber: (value) => String(value ?? ""),
    labelFor,
    renderTopNav: () => "",
    sharedNavCss: () => ""
  });
  const html = orderCenterPage({
    scan: { pageindex: 1, pagesize: 20, contract_limit: 20, due_soon_days: 7, scan_size: 100 },
    pagination: { page_index: 1, page_size: 20, total_pages: 1, total_sqlite_rows: 1, filtered_rows: 1, page_rows: 1 },
    summary: { total_rows: 1, visible_rows: 1, red_orders: 0, yellow_orders: 1, green_orders: 0, shortage_orders: 0, blocked_orders: 0, due_soon_orders: 1 },
    rows: [{
      status_code: "yellow",
      status_text: "预警",
      priority: "中",
      erp_id: "17333",
      order_no: "YJ生产销售20260500216",
      customer: "客户A",
      owner: "销售A",
      delivery_date: "2026-05-30",
      days_from_today: 2,
      blocker: "临期交付",
      next_action: "锁定生产、质检和发货资源",
      responsible_role: "PMC",
      due_status: "7天内到期",
      shortage_status: "未发现缺料",
      risk_products: [],
      amount: 1234567.89,
      approval_status: "审批通过"
    }],
    notes: []
  });

  assert.doesNotMatch(html, /最近交期/);
  assert.match(html, /<th[^>]*>交期<\/th>/);
  assert.match(html, /amount-cell/);
  assert.match(html, /white-space:\s*nowrap/);
});

test("local production center fills order number from known procedure-order matches", async () => {
  const { queryLocalProductionCenter } = createProductionQueries({
    buildWorkshopBoard: () => ({}),
    client: {},
    enrichProcedurePlansWithOrderMatches: ({ procedurePlans }) => procedurePlans.map((row) => ({
      ...row,
      order_no: "PO-LINKED",
      order_match_by: "人工绑定"
    })),
    listMaterialAlerts: () => [],
    listOrderProcedureLinks: () => [{ work_assignment_id: "W-1", order_no: "PO-LINKED", procedure_name: "落料" }],
    listProcedurePlans: () => [
      { work_assignment_id: "W-1", order_no: "", product_name: "钽杯", procedure_name: "落料", remaining_qty: 10, planned_finish_date: "2026-05-20" }
    ],
    listProcessReports: () => [],
    listSalesOrders: () => [{ order_no: "PO-LINKED", product_name: "钽杯", delivery_date: "2026-05-30" }],
    summarizeDataSourceError: (error) => error.message,
    withTimeout: (promise) => promise
  });

  const result = await queryLocalProductionCenter({ today: "2026-05-28" });

  assert.equal(result.body.sections.procedure_plans[0].order_no, "PO-LINKED");
  assert.equal(result.body.sections.procedure_plans[0].order_match_by, "人工绑定");
  assert.equal(result.body.sections.delayed_procedures[0].order_no, "PO-LINKED");
});
