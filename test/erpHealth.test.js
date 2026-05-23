import test from "node:test";
import assert from "node:assert/strict";
import { buildErpHealthSummary } from "../src/erpHealth.js";

test("buildErpHealthSummary marks circuit open as critical", () => {
  const summary = buildErpHealthSummary({
    queue: { circuit_state: "open", queued: 0, running: 0, failed: 3 },
    requestLogs: [{ status: "failed", path: "/webapi/v3/ov1/login" }],
    syncPolicyRows: []
  });

  assert.equal(summary.status, "critical");
  assert.match(summary.message, /熔断/);
  assert.equal(summary.recent_failed_requests, 1);
});

test("buildErpHealthSummary marks local-only state as healthy", () => {
  const summary = buildErpHealthSummary({
    queue: { circuit_state: "closed", queued: 0, running: 0, failed: 0 },
    requestLogs: [],
    syncPolicyRows: [{ health_status: "可同步" }]
  });

  assert.equal(summary.status, "healthy");
  assert.match(summary.message, /本地保护/);
});
