import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { canAccessPath, effectivePermissions, homePathForUser, requiresPasswordChange, scopeRowsForUser } from "../src/auth.js";
import { createAiChatQuery } from "../src/queries/aiChatQuery.js";
import { createFinanceQueries } from "../src/queries/financeQuery.js";
import { createMaterialExceptionQueries } from "../src/queries/materialExceptionQuery.js";
import { createOrdersQueries } from "../src/queries/ordersQuery.js";
import { createPmcQueries } from "../src/queries/pmcQuery.js";
import { createProcurementQueries } from "../src/queries/procurementQuery.js";
import { createProductionQueries } from "../src/queries/productionQuery.js";
import { createUserRolesQueries } from "../src/queries/userRolesQuery.js";
import { createUserRolesPageRenderers } from "../src/pages/userRolesPage.js";

test("multi-role users receive the union of role permissions", () => {
  const user = {
    username: "sales_finance",
    display_name: "销售财务",
    roles: ["销售", "财务"],
    scopes: { owners: ["田小静"], customers: ["印度客户A"] }
  };

  const permissions = effectivePermissions(user);

  assert.equal(permissions.has("page:orders"), true);
  assert.equal(permissions.has("page:finance"), true);
  assert.equal(canAccessPath(user, "/orders"), true);
  assert.equal(canAccessPath(user, "/finance"), true);
  assert.equal(canAccessPath(user, "/system"), false);
});

test("login home path sends restricted users to their role workspace", () => {
  const followupUser = {
    username: "wsh",
    display_name: "王少花",
    roles: ["跟单员"],
    scopes: {}
  };
  const financeUser = {
    username: "gz",
    display_name: "葛梓",
    roles: ["财务"],
    scopes: {}
  };
  const adminUser = {
    username: "admin",
    display_name: "系统管理员",
    roles: ["系统管理员"],
    scopes: {}
  };

  assert.equal(homePathForUser(followupUser, "/"), "/followup");
  assert.equal(homePathForUser(followupUser, "/user-roles"), "/followup");
  assert.equal(homePathForUser(followupUser, "/orders"), "/orders");
  assert.equal(canAccessPath(followupUser, "/workshop-board"), true);
  assert.equal(canAccessPath(followupUser, "/workshop-board/rolling"), true);
  assert.equal(homePathForUser(financeUser, "/"), "/finance");
  assert.equal(homePathForUser(adminUser, "/user-roles"), "/user-roles");
});

test("password reset gate applies to non-admin users only", () => {
  assert.equal(requiresPasswordChange({ username: "wsh", roles: ["跟单员"], password_reset_required: true }), true);
  assert.equal(requiresPasswordChange({ username: "admin", roles: ["系统管理员"], password_reset_required: true }), false);
  assert.equal(requiresPasswordChange({ username: "boss", roles: ["老板"], password_reset_required: false }), false);
});

test("data scope keeps sales users inside their owner and customer ranges", () => {
  const rows = [
    { order_no: "PO-1", owner: "田小静", customer: "印度客户A" },
    { order_no: "PO-2", owner: "其他销售", customer: "印度客户A" },
    { order_no: "PO-3", owner: "田小静", customer: "其他客户" },
    { order_no: "PO-4", owner: "其他销售", customer: "其他客户" }
  ];
  const user = {
    username: "sales",
    display_name: "田小静",
    roles: ["销售"],
    scopes: { owners: ["田小静"], customers: ["印度客户A"] }
  };

  assert.deepEqual(scopeRowsForUser(rows, user, "orders").map((row) => row.order_no), ["PO-1", "PO-2", "PO-3"]);
  assert.deepEqual(scopeRowsForUser(rows, { ...user, scopes: { customers: ["印度客户A"] } }, "orders").map((row) => row.order_no), ["PO-1", "PO-2", "PO-3"]);
});

test("local auth users support password verification roles scopes and sessions", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "local-auth-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const nonce = Date.now();
  const {
    createLocalAuthSession,
    getLocalAuthSession,
    saveLocalAuthUser,
    verifyLocalAuthUser
  } = await import(`../src/localDb.js?auth=${nonce}`);

  saveLocalAuthUser({
    username: "sales_finance",
    display_name: "销售财务",
    password: "Temp-123456",
    roles: ["销售", "财务"],
    scopes: { owners: ["田小静"], customers: ["印度客户A"] }
  });

  const verified = verifyLocalAuthUser("sales_finance", "Temp-123456");
  assert.equal(verified.username, "sales_finance");
  assert.deepEqual(verified.roles, ["销售", "财务"]);
  assert.deepEqual(verified.scopes.owners, ["田小静"]);
  assert.equal(verifyLocalAuthUser("sales_finance", "wrong"), null);

  const session = createLocalAuthSession(verified, { now: "2026-05-29T08:00:00.000Z" });
  const loaded = getLocalAuthSession(session.session_id, { now: "2026-05-29T09:00:00.000Z" });
  assert.equal(loaded.username, "sales_finance");
  assert.deepEqual(loaded.roles, ["销售", "财务"]);
});

test("non-admin local auth users must change initial password before normal use", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "local-auth-reset-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const nonce = Date.now();
  const {
    changeLocalAuthPassword,
    saveLocalAuthUser,
    validateLocalAuthPassword,
    verifyLocalAuthUser
  } = await import(`../src/localDb.js?authReset=${nonce}`);

  const admin = saveLocalAuthUser({
    username: "admin",
    display_name: "系统管理员",
    password: "Admin1234",
    roles: ["系统管理员"],
    password_reset_required: 1
  });
  assert.equal(admin.password_reset_required, false);

  const followupUser = saveLocalAuthUser({
    username: "wsh",
    display_name: "王少花",
    password: "Temp1234",
    roles: ["跟单员"]
  });
  assert.equal(followupUser.password_reset_required, true);
  assert.equal(verifyLocalAuthUser("wsh", "Temp1234").password_reset_required, true);

  assert.equal(validateLocalAuthPassword("abcdefg").valid, false);
  assert.equal(validateLocalAuthPassword("1234567").valid, false);
  assert.equal(validateLocalAuthPassword("abc123").valid, false);
  assert.equal(validateLocalAuthPassword("abc1234").valid, true);
  assert.throws(
    () => changeLocalAuthPassword({ username: "wsh", current_password: "wrong", new_password: "abc1234" }),
    /当前密码不正确/
  );
  assert.throws(
    () => changeLocalAuthPassword({ username: "wsh", current_password: "Temp1234", new_password: "abcdefg" }),
    /字母和数字/
  );

  const changed = changeLocalAuthPassword({
    username: "wsh",
    current_password: "Temp1234",
    new_password: "abc1234",
    now: "2026-05-29T09:00:00.000Z"
  });
  assert.equal(changed.password_reset_required, false);
  assert.equal(verifyLocalAuthUser("wsh", "Temp1234"), null);
  assert.equal(verifyLocalAuthUser("wsh", "abc1234").password_reset_required, false);
});

test("order center applies authenticated data scope before summaries and rows", async () => {
  const { queryOrderCenter } = createOrdersQueries({
    client: {},
    erpProtectionMode: true,
    latestPmcSnapshot: () => null,
    listMaterialAlerts: () => [],
    listSalesOrders: () => [
      { erp_id: "1", order_no: "PO-1", customer: "印度客户A", owner: "田小静", delivery_date: "2026-05-30", status_text: "未发货", raw_json: "{}" },
      { erp_id: "2", order_no: "PO-2", customer: "印度客户B", owner: "其他销售", delivery_date: "2026-05-30", status_text: "未发货", raw_json: "{}" }
    ],
    summarizeDataSourceError: (error) => error.message,
    withTimeout: (promise) => promise
  });

  const result = await queryOrderCenter({
    today: "2026-05-29",
    auth_user: { username: "sales", display_name: "田小静", roles: ["销售"], scopes: { owners: ["田小静"] } }
  });

  assert.deepEqual(result.body.rows.map((row) => row.order_no), ["PO-1"]);
  assert.equal(result.body.summary.total_rows, 1);
});

test("finance center limits sales roles but allows finance roles to see all finance rows", async () => {
  const rows = [
    { direction: "receivable", counterparty: "印度客户A", owner: "田小静", unpaid_amount: 100, raw_json: "{}" },
    { direction: "receivable", counterparty: "印度客户B", owner: "其他销售", unpaid_amount: 200, raw_json: "{}" }
  ];
  const { queryFinanceCenter } = createFinanceQueries({
    buildLocalFinanceCenter: ({ financeRows }) => ({
      model: "finance_center",
      summary: { finance_rows: financeRows.length },
      sections: { receivables: financeRows, payables: [] },
      notes: []
    }),
    client: {},
    erpProtectionMode: true,
    listFinanceRecords: () => rows,
    summarizeDataSourceError: (error) => error.message
  });

  const salesResult = await queryFinanceCenter({
    auth_user: { username: "sales", display_name: "田小静", roles: ["销售"], scopes: { owners: ["田小静"] } }
  });
  const financeResult = await queryFinanceCenter({
    auth_user: { username: "finance", display_name: "财务", roles: ["财务"], scopes: {} }
  });

  assert.deepEqual(salesResult.body.sections.receivables.map((row) => row.counterparty), ["印度客户A"]);
  assert.deepEqual(financeResult.body.sections.receivables.map((row) => row.counterparty), ["印度客户A", "印度客户B"]);
});

test("AI chat answers are scoped to the authenticated user's data range", () => {
  const { queryAiChat } = createAiChatQuery({
    buildLocalPmcDashboard: () => ({ sections: { red_risks: [], yellow_risks: [] } }),
    latestSyncRuns: () => [],
    listAiChatLogs: () => [],
    listFinanceRecords: () => [],
    listInventoryDetails: () => [],
    listInventorySummary: () => [],
    listMaterialAlerts: () => [],
    listProcedurePlans: () => [],
    listSalesOrders: () => [
      { order_no: "PO-1", customer: "印度客户A", owner: "田小静", product_name: "钼板", delivery_date: "2026-05-30", status_text: "未发货" },
      { order_no: "PO-2", customer: "印度客户B", owner: "其他销售", product_name: "钽件", delivery_date: "2026-05-30", status_text: "未发货" }
    ],
    saveAiChatLog: () => ({ id: 1 })
  });

  const result = queryAiChat({
    message: "印度客户的在制订单有哪些？",
    auth_user: { username: "sales", display_name: "田小静", roles: ["销售"], scopes: { owners: ["田小静"] } }
  });

  assert.deepEqual(result.rows.map((row) => row.order_no), ["PO-1"]);
  assert.equal(result.sources[0].filtered_rows, 1);
});

test("production center applies workshop scope to local procedure plans", async () => {
  const { queryLocalProductionCenter } = createProductionQueries({
    buildWorkshopBoard: () => ({}),
    client: {},
    enrichProcedurePlansWithOrderMatches: ({ procedurePlans }) => procedurePlans,
    listMaterialAlerts: () => [],
    listOrderProcedureLinks: () => [],
    listProcedurePlans: () => [
      { work_assignment_id: "W-1", procedure_name: "冲压落料", work_center_name: "冲压工段", remaining_qty: 10, planned_finish_date: "2026-05-20" },
      { work_assignment_id: "W-2", procedure_name: "轧制", work_center_name: "轧制工段", remaining_qty: 10, planned_finish_date: "2026-05-20" }
    ],
    listProcessReports: () => [],
    listSalesOrders: () => [],
    summarizeDataSourceError: (error) => error.message,
    withTimeout: (promise) => promise
  });

  const result = await queryLocalProductionCenter({
    today: "2026-05-28",
    auth_user: { username: "shop", display_name: "冲压主管", roles: ["车间"], scopes: { workshops: ["冲压"] } }
  });

  assert.deepEqual(result.body.sections.procedure_plans.map((row) => row.work_assignment_id), ["W-1"]);
  assert.equal(result.body.summary.procedure_plan_rows, 1);
});

test("material center applies warehouse scope to local inventory rows", async () => {
  const { queryMaterialControl } = createMaterialExceptionQueries({
    buildLocalExceptionCenter: () => ({}),
    client: {},
    erpProtectionMode: true,
    interventionLogHref: () => "",
    isInterventionFinal: () => false,
    latestPmcInterventionsByRelatedNos: () => new Map(),
    latestPmcSnapshot: () => null,
    listInventoryDetails: () => [],
    listInventorySummary: () => [
      { product_code: "SCRAP-20", product_name: "废料A", warehouse: "20号废料库", available_qty: 2, stock_qty: 2, unit: "kg" },
      { product_code: "TN-01", product_name: "钽铌料", warehouse: "1号钽铌库", available_qty: 2, stock_qty: 2, unit: "kg" }
    ],
    listMaterialAlerts: () => [],
    pmcInterventionHref: () => "",
    pmcRiskClosure: () => ({}),
    queryLocalPmcDashboard: () => null,
    queryPmcDashboard: async () => ({}),
    summarizeDataSourceError: (error) => error.message,
    withTimeout: (promise) => promise
  });

  const result = await queryMaterialControl({
    low_stock_threshold: 5,
    auth_user: { username: "warehouse", display_name: "废料库", roles: ["仓库"], scopes: { warehouses: ["20号废料库"] } }
  });

  assert.deepEqual(result.body.sections.low_stock.map((row) => row.product_code), ["SCRAP-20"]);
  assert.equal(result.body.summary.low_stock, 1);
});

test("procurement center applies supplier scope to purchase and payable rows", async () => {
  const { queryProcurementCenter } = createProcurementQueries({
    client: {
      queryView: async () => {
        throw new Error("ERP should not be called");
      }
    },
    erpProtectionMode: true,
    listFinanceRecords: () => [
      { direction: "payable", counterparty: "供应商A", bill_no: "FIN-A", unpaid_amount: 100, due_date: "2026-05-20", risk_status: "已逾期" },
      { direction: "payable", counterparty: "供应商B", bill_no: "FIN-B", unpaid_amount: 100, due_date: "2026-05-20", risk_status: "已逾期" }
    ],
    listPurchaseOrders: () => [
      { purchase_no: "CG-A", supplier: "供应商A", title: "钼粉", expected_arrival_date: "2026-05-20", status: "已下单" },
      { purchase_no: "CG-B", supplier: "供应商B", title: "钽锭", expected_arrival_date: "2026-05-20", status: "已下单" }
    ],
    listSuppliers: () => [
      { name: "供应商A", contact: "张三" },
      { name: "供应商B", contact: "李四" }
    ],
    summarizeDataSourceError: (error) => error.message,
    withTimeout: (promise) => promise
  });

  const result = await queryProcurementCenter({
    today: "2026-05-28",
    auth_user: { username: "buyer", display_name: "采购A", roles: ["采购"], scopes: { counterparties: ["供应商A"] } }
  });

  assert.deepEqual(result.body.sections.purchase_orders.map((row) => row.purchase_no), ["CG-A"]);
  assert.deepEqual(result.body.sections.payables.map((row) => row.bill_no), ["FIN-A"]);
  assert.equal(result.body.summary.supplier_count, 1);
});

test("PMC local dashboard applies authenticated data scope before aggregation", () => {
  let received = null;
  const { queryLocalPmcDashboard } = createPmcQueries({
    buildLocalPmcDashboard: (input) => {
      received = input;
      return {
        summary: { total_orders: input.salesOrders.length },
        sections: { orders: input.salesOrders }
      };
    },
    client: {},
    enrichPmcInterventionStatus: (dashboard) => dashboard,
    latestPmcSnapshot: () => null,
    listFinanceRecords: () => [
      { direction: "receivable", counterparty: "印度客户A", owner: "田小静", unpaid_amount: 100 },
      { direction: "receivable", counterparty: "印度客户B", owner: "其他销售", unpaid_amount: 100 }
    ],
    listInventoryDetails: () => [
      { product_code: "MO-1", warehouse: "20号废料库" },
      { product_code: "MO-2", warehouse: "1号钽铌库" }
    ],
    listLocalUserRoles: () => [],
    listMaterialAlerts: () => [
      { order_no: "PO-1", owner: "田小静", customer: "印度客户A" },
      { order_no: "PO-2", owner: "其他销售", customer: "印度客户B" }
    ],
    listOrderProcedureLinks: () => [],
    listProcedurePlans: () => [
      { work_assignment_id: "W-1", owner: "田小静", work_center_name: "冲压工段" },
      { work_assignment_id: "W-2", owner: "其他销售", work_center_name: "轧制工段" }
    ],
    listProcessReports: () => [],
    listSalesOrders: () => [
      { order_no: "PO-1", owner: "田小静", customer: "印度客户A" },
      { order_no: "PO-2", owner: "其他销售", customer: "印度客户B" }
    ],
    savePmcSnapshot: () => {},
    summarizeDataSourceError: (error) => error.message,
    withTimeout: (promise) => promise
  });

  const result = queryLocalPmcDashboard({
    auth_user: { username: "sales", display_name: "田小静", roles: ["销售"], scopes: { owners: ["田小静"], customers: ["印度客户A"], warehouses: ["20号废料库"] } }
  });

  assert.equal(result.summary.total_orders, 1);
  assert.deepEqual(received.salesOrders.map((row) => row.order_no), ["PO-1"]);
  assert.deepEqual(received.materialAlerts.map((row) => row.order_no), ["PO-1"]);
  assert.deepEqual(received.procedurePlans.map((row) => row.work_assignment_id), ["W-1"]);
  assert.deepEqual(received.inventoryDetails.map((row) => row.product_code), ["MO-1"]);
  assert.deepEqual(received.financeRows.map((row) => row.counterparty), ["印度客户A"]);
});

test("PMC local dashboard keeps ambiguous procedure rows for followup order matching", () => {
  let received = null;
  const { queryLocalPmcDashboard } = createPmcQueries({
    buildLocalPmcDashboard: (input) => {
      received = input;
      return {
        summary: { total_orders: input.salesOrders.length },
        sections: { orders: input.salesOrders }
      };
    },
    client: {},
    enrichPmcInterventionStatus: (dashboard) => dashboard,
    latestPmcSnapshot: () => null,
    listFinanceRecords: () => [],
    listInventoryDetails: () => [],
    listLocalUserRoles: () => [],
    listMaterialAlerts: () => [
      { order_no: "PO-WSH", product_name: "钽杯" },
      { order_no: "PO-OTHER", product_name: "钼板" }
    ],
    listOrderProcedureLinks: () => [
      { order_no: "PO-WSH", work_assignment_id: "W-UNOWNED", procedure_name: "落料" }
    ],
    listProcedurePlans: () => [
      { work_assignment_id: "W-UNOWNED", owner: "", order_no: "", procedure_name: "落料" },
      { work_assignment_id: "W-NUMERIC", owner: "151", order_no: "", procedure_name: "引伸" },
      { work_assignment_id: "W-OTHER", owner: "其他跟单", order_no: "PO-OTHER", procedure_name: "冷轧" }
    ],
    listProcessReports: () => [],
    listSalesOrders: () => [
      { order_no: "PO-WSH", owner: "王少花", customer: "客户A" },
      { order_no: "PO-OTHER", owner: "其他跟单", customer: "客户B" }
    ],
    savePmcSnapshot: () => {},
    summarizeDataSourceError: (error) => error.message,
    withTimeout: (promise) => promise
  });

  queryLocalPmcDashboard({
    auth_user: { username: "wsh", display_name: "王少花", roles: ["跟单员"], scopes: {} }
  });

  assert.equal(received.owner, "王少花");
  assert.deepEqual(received.salesOrders.map((row) => row.order_no), ["PO-WSH"]);
  assert.deepEqual(received.materialAlerts.map((row) => row.order_no), ["PO-WSH"]);
  assert.deepEqual(received.procedurePlans.map((row) => row.work_assignment_id), ["W-UNOWNED", "W-NUMERIC"]);
});

test("followup workbench exposes the selected owner's standard risks", () => {
  const risk = {
    risk_id: "RISK-WSH",
    risk_level: "红牌",
    risk_type: "产能瓶颈",
    related_object: "派工",
    related_no: "W-1",
    source_table: "erp_procedure_plans",
    source_key: "W-1",
    responsible_owner: "王少花",
    suggested_action: "确认夜班"
  };
  const { queryFollowupWorkbench } = createPmcQueries({
    buildLocalPmcDashboard: (input) => ({
      owner_filter: input.owner || "",
      summary: {},
      command_center: { today_todos: 1 },
      sections: {
        owner_workbenches: [{ owner: "王少花", active_orders: 1, todos: 1 }],
        red_risks: [risk],
        yellow_risks: [],
        intervention_tasks: []
      }
    }),
    client: {},
    enrichPmcInterventionStatus: (dashboard) => dashboard,
    latestPmcSnapshot: () => null,
    listFinanceRecords: () => [],
    listInventoryDetails: () => [],
    listLocalUserRoles: () => [],
    listMaterialAlerts: () => [],
    listOrderProcedureLinks: () => [],
    listProcedurePlans: () => [],
    listProcessReports: () => [],
    listSalesOrders: () => [
      { order_no: "PO-WSH", owner: "王少花", customer: "客户A" }
    ],
    savePmcSnapshot: () => {},
    summarizeDataSourceError: (error) => error.message,
    withTimeout: (promise) => promise
  });

  const result = queryFollowupWorkbench({
    auth_user: { username: "wsh", display_name: "王少花", roles: ["跟单员"], scopes: {} }
  });

  assert.equal(result.body.owner, "王少花");
  assert.deepEqual(result.body.standard_risks.map((row) => row.risk_id), ["RISK-WSH"]);
});

test("user role query exposes ERP user choices and fixed role choices", () => {
  const { queryUserRoles } = createUserRolesQueries({
    buildUserRoleCandidates: () => [
      { name: "王少花", suggested_role: "跟单员", sales_orders: 10 },
      { name: "151", suggested_role: "ERP编号待映射", procedure_plans: 20 }
    ],
    listFinanceRecords: () => [],
    listLocalAuthUsers: () => [{ username: "admin", display_name: "系统管理员", roles: ["系统管理员"], scopes: {}, is_active: 1 }],
    listLocalUserRoles: () => [{ name: "葛梓", role: "财务经理", is_followup: 0 }],
    listOrgUsers: () => [
      { display_name: "李经理", username: "lijili", department_name: "总经理" },
      { display_name: "赵采购", username: "zhaocaigou", department_name: "采购部" }
    ],
    listProcedurePlans: () => [],
    listSalesOrders: () => [],
    queryLocalPmcDashboard: () => ({ sections: { owner_workbenches: [{ owner: "田小静" }] } })
  });

  const result = queryUserRoles();
  const names = result.body.form_options.users.map((row) => row.name);

  assert.deepEqual(names.slice(0, 2), ["李经理", "赵采购"]);
  assert.equal(names.includes("王少花"), true);
  assert.equal(names.includes("葛梓"), true);
  assert.equal(names.includes("田小静"), true);
  assert.equal(names.includes("系统管理员"), true);
  assert.equal(names.includes("151"), false);
  assert.equal(result.body.form_options.users[0].source, "ERP组织架构");
  assert.equal(result.body.summary.erp_org_users, 2);
  assert.equal(result.body.form_options.roles.includes("销售"), true);
  assert.equal(result.body.form_options.roles.includes("系统管理员"), true);
});

test("user role page renders ERP user selects and checkbox role dropdowns", () => {
  const { userRolesPage } = createUserRolesPageRenderers({
    escapeHtml: (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
    modulePanel: (title) => `<section>${title}</section>`,
    modulePage: ({ panels }) => panels.join("\n")
  });

  const html = userRolesPage({
    summary: {},
    sections: {
      erp_org_users: [{ name: "ERP用户", username: "erp001", department_name: "生产部" }],
      auth_users: [],
      configured_roles: [],
      role_candidates: [{ name: "候选人" }],
      detected_followup_owners: [{ name: "跟单负责人" }]
    },
    form_options: {
      users: [{ name: "王少花" }, { name: "葛梓" }],
      roles: ["老板", "管理层", "PMC", "销售", "跟单员", "财务"]
    },
    notes: []
  });

  assert.match(html, /<select[^>]+name="display_name"[^>]*>/);
  assert.match(html, /<select[^>]+name="name"[^>]*>/);
  assert.match(html, /<details[^>]+class="role-check-dropdown"/);
  assert.match(html, /<input[^>]+type="checkbox"[^>]+name="roles"[^>]+value="销售"/);
  assert.match(html, /<input[^>]+type="checkbox"[^>]+name="role"[^>]+value="销售"/);
  assert.match(html, /<option value="王少花"/);
  assert.match(html, /登录用户权限/);
  assert.match(html, /本地用户信息/);
  assert.doesNotMatch(html, /ERP组织架构用户/);
  assert.doesNotMatch(html, /ERP负责人候选池/);
  assert.doesNotMatch(html, /当前跟单负责人池/);
});
