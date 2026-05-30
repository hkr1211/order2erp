import test from "node:test";
import assert from "node:assert/strict";

import { createReportSchedulingQueries } from "../src/queries/reportSchedulingQuery.js";

test("report center forwards auth_user to nested order center queries", async () => {
  const authUser = { username: "sales", display_name: "田小静", roles: ["销售"], scopes: { owners: ["田小静"] } };
  let localDashboardParams = null;
  let orderCenterParams = null;

  const { queryReportCenter } = createReportSchedulingQueries({
    buildLocalExceptionCenter: () => ({ summary: {}, sections: { tasks: [] } }),
    enrichExceptionCenterStatus: (body) => body,
    enrichPmcInterventionStatus: (body) => body,
    latestPmcSnapshot: () => null,
    pmcInterventionSummary: () => ({
      today_actions: 0,
      by_risk_type: [],
      by_result_type: [],
      by_closure_quality: [],
      improvement_suggestions: [],
      recent_actions: []
    }),
    queryLocalPmcDashboard: (params) => {
      localDashboardParams = params;
      return {
        summary: {
          today_orders: 0,
          month_orders: 0,
          due_soon_orders: 0,
          low_stock: 0
        },
        sections: {
          morning_brief: [],
          low_stock: []
        }
      };
    },
    queryOrderCenter: async (params) => {
      orderCenterParams = params;
      return {
        body: {
          summary: {
            red_orders: 0,
            yellow_orders: 0,
            green_orders: 0,
            shortage_orders: 0
          },
          rows: []
        }
      };
    },
    queryPmcConsole: async () => ({ body: {} }),
    queryQuoteCenter: async () => ({ body: {} }),
    summarizeDataSourceError: (error) => error.message,
    withTimeout: (promise) => promise
  });

  await queryReportCenter({ auth_user: authUser });

  assert.equal(localDashboardParams.auth_user, authUser);
  assert.equal(orderCenterParams.auth_user, authUser);
});

test("scheduling center forwards auth_user to nested order center queries", async () => {
  const authUser = { username: "shop", display_name: "冲压主管", roles: ["车间"], scopes: { workshops: ["冲压"] } };
  let orderCenterParams = null;

  const { querySchedulingCenter } = createReportSchedulingQueries({
    buildLocalExceptionCenter: () => ({ summary: {}, sections: { tasks: [] } }),
    enrichExceptionCenterStatus: (body) => body,
    enrichPmcInterventionStatus: (body) => body,
    latestPmcSnapshot: () => null,
    pmcInterventionSummary: () => ({
      today_actions: 0,
      by_risk_type: [],
      by_result_type: [],
      by_closure_quality: [],
      improvement_suggestions: [],
      recent_actions: []
    }),
    queryLocalPmcDashboard: () => null,
    queryOrderCenter: async (params) => {
      orderCenterParams = params;
      return {
        body: {
          rows: [
            {
              order_no: "PO-1",
              customer: "客户A",
              product_name: "钼板",
              delivery_date: "2026-06-05",
              status_code: "yellow"
            }
          ]
        }
      };
    },
    queryPmcConsole: async () => ({ body: {} }),
    queryQuoteCenter: async () => ({ body: {} }),
    summarizeDataSourceError: (error) => error.message,
    withTimeout: (promise) => promise
  });

  await querySchedulingCenter({ today: "2026-05-30", auth_user: authUser });

  assert.equal(orderCenterParams.auth_user, authUser);
});
