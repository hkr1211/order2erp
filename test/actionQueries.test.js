import test from "node:test";
import assert from "node:assert/strict";
import { buildLocalPmcDashboard } from "../src/localAnalytics.js";
import { createActionQueries } from "../src/queries/actionQueries.js";

test("queryProcedureLinks reports ERP field gaps and suggests order links from process reports", () => {
  const salesOrders = [
    {
      order_no: "YJ生产销售20260500158",
      product_name: "钼杯",
      delivery_date: "2026-06-30",
      raw_json: JSON.stringify({ title: "57658 客户A YJ生产销售20260500158" })
    }
  ];
  const procedurePlans = [
    {
      work_assignment_id: "44692",
      order_no: "",
      product_name: "钼杯",
      procedure_name: "引伸",
      work_center_name: "冲压工",
      planned_start_date: "2026-05-21",
      planned_finish_date: "2026-05-31",
      raw_json: JSON.stringify({ "派工单ID": 44692, "产品名称": "钼杯", "工序名称": "引伸" })
    }
  ];
  const processReports = [
    {
      subject: "57658 钼杯",
      product_name: "钼杯",
      procedure_name: "引伸",
      added_at: "2026-05-25 09:43:21"
    }
  ];
  const { queryProcedureLinks } = createActionQueries({
    buildLocalPmcDashboard,
    latestPmcInterventions: () => [],
    listOrderProcedureLinks: () => [],
    listProcedurePlans: () => procedurePlans,
    listProcessReports: () => processReports,
    listSalesOrders: () => salesOrders,
    pmcInterventionSummary: () => ({
      today_actions: 0,
      total_actions: 0,
      by_risk_type: [],
      by_result_type: [],
      by_closure_quality: [],
      improvement_suggestions: [],
      incomplete_closures: 0
    })
  });

  const body = queryProcedureLinks();

  assert.equal(body.erp_field_audit[0].source, "派工/工序计划");
  assert.equal(body.erp_field_audit[0].order_no_status, "未返回订单号字段");
  assert.equal(body.link_suggestions[0].work_assignment_id, "44692");
  assert.equal(body.link_suggestions[0].subject_ref, "57658");
  assert.equal(body.link_suggestions[0].candidate_order_no, "YJ生产销售20260500158");
  assert.equal(body.link_suggestions[0].suggestion_basis, "工序汇报单据主题编号+产品工序");
  assert.match(body.link_suggestions[0].bind_action, /order_no=YJ%E7%94%9F%E4%BA%A7/);
  assert.match(body.unmatched[0].supplement_path, /ERP派工单/);
});

test("queryProcedureLinks applies authenticated order and production scope", () => {
  const { queryProcedureLinks } = createActionQueries({
    buildLocalPmcDashboard: ({ procedurePlans }) => ({
      summary: {
        unmatched_procedure_plans: procedurePlans.length,
        procedure_order_match_rate: 0
      },
      sections: {
        unmatched_procedure_plans: procedurePlans
      }
    }),
    latestPmcInterventions: () => [],
    listOrderProcedureLinks: () => [
      { order_no: "PO-1", work_assignment_id: "W-1" },
      { order_no: "PO-2", work_assignment_id: "W-2" }
    ],
    listProcedurePlans: () => [
      { work_assignment_id: "W-1", owner: "田小静", procedure_name: "冲压" },
      { work_assignment_id: "W-2", owner: "其他销售", procedure_name: "轧制" }
    ],
    listProcessReports: () => [],
    listSalesOrders: () => [
      { order_no: "PO-1", owner: "田小静", customer: "印度客户A" },
      { order_no: "PO-2", owner: "其他销售", customer: "印度客户B" }
    ],
    pmcInterventionSummary: () => ({})
  });

  const body = queryProcedureLinks({
    auth_user: { username: "sales", display_name: "田小静", roles: ["销售"], scopes: { owners: ["田小静"] } }
  });

  assert.deepEqual(body.orders.map((row) => row.order_no), ["PO-1"]);
  assert.deepEqual(body.unmatched.map((row) => row.work_assignment_id), ["W-1"]);
  assert.deepEqual(body.links.map((row) => row.order_no), ["PO-1"]);
  assert.equal(body.summary.sales_orders, 1);
  assert.equal(body.summary.procedure_plans, 1);
});
