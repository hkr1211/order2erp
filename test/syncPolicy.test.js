import test from "node:test";
import assert from "node:assert/strict";
import { buildSyncPolicyRows } from "../src/syncPolicy.js";

test("buildSyncPolicyRows reports cooldown and failed sync state", () => {
  const rows = buildSyncPolicyRows({
    now: new Date("2026-05-23T10:00:00.000Z"),
    cooldownSeconds: 300,
    latestRuns: [
      {
        source_key: "sales_orders",
        status: "success",
        rows_synced: 20,
        finished_at: "2026-05-23T09:58:00.000Z",
        error_message: ""
      },
      {
        source_key: "material_alerts",
        status: "failed",
        rows_synced: 0,
        finished_at: "2026-05-23T09:30:00.000Z",
        error_message: "ERP 服务临时不可用"
      }
    ]
  });

  const sales = rows.find((row) => row.source_key === "sales_orders");
  const material = rows.find((row) => row.source_key === "material_alerts");

  assert.equal(sales.health_status, "冷却中");
  assert.equal(sales.next_allowed_at, "2026-05-23 18:03");
  assert.equal(material.health_status, "最近失败");
  assert.match(material.action, /暂停/);
});
