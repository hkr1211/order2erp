import test from "node:test";
import assert from "node:assert/strict";
import { buildSqliteCoverage } from "../src/sqliteCoverage.js";

test("buildSqliteCoverage summarizes page table dependencies and missing sources", () => {
  const coverage = buildSqliteCoverage({
    tableStats: {
      erp_sales_orders: { row_count: 20, latest_at: "2026-05-23T08:00:00.000Z" },
      erp_material_alerts: { row_count: 0, latest_at: "" },
      pmc_dashboard_snapshots: { row_count: 1, latest_at: "2026-05-23T08:30:00.000Z" }
    },
    latestSyncRuns: [
      { source_key: "sales_orders", status: "success", finished_at: "2026-05-23T08:00:00.000Z" }
    ]
  });

  const pmc = coverage.pages.find((row) => row.page_path === "/pmc");
  const materials = coverage.pages.find((row) => row.page_path === "/materials");

  assert.ok(pmc.sqlite_tables.includes("erp_sales_orders"));
  assert.equal(materials.coverage_status, "缺数据");
  assert.match(materials.missing_sources, /物料\/库存告警为空/);
  assert.equal(coverage.summary.pages, coverage.pages.length);
  assert.ok(coverage.tables.some((row) => row.table_name === "erp_material_alerts"));
});
