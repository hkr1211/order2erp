import test from "node:test";
import assert from "node:assert/strict";

import { createQuotesQueries } from "../src/queries/quotesQuery.js";

test("foreign trade board applies authenticated order and material scope", () => {
  let capturedInput = null;
  const { queryForeignTradeBoard } = createQuotesQueries({
    buildForeignTradeBoard: (input) => {
      capturedInput = input;
      return input;
    },
    client: {},
    erpProtectionMode: true,
    listMaterialAlerts: () => [
      { order_no: "PO-1", owner: "田小静", customer: "印度客户A" },
      { order_no: "PO-2", owner: "其他销售", customer: "印度客户B" }
    ],
    listQuoteFollowups: () => [],
    listSalesOrders: () => [
      { order_no: "PO-1", owner: "田小静", customer: "印度客户A" },
      { order_no: "PO-2", owner: "其他销售", customer: "印度客户B" }
    ],
    queryPendingQuotes: async () => ({ body: { rows: [] } }),
    quoteOwnerSummaryForLocal: () => [],
    summarizeDataSourceError: (error) => error.message,
    withTimeout: (promise) => promise
  });

  queryForeignTradeBoard({
    auth_user: { username: "sales", display_name: "田小静", roles: ["销售"], scopes: { owners: ["田小静"] } }
  });

  assert.deepEqual(capturedInput.salesOrders.map((row) => row.order_no), ["PO-1"]);
  assert.deepEqual(capturedInput.materialAlerts.map((row) => row.order_no), ["PO-1"]);
});
