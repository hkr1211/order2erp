import test from "node:test";
import assert from "node:assert/strict";
import { buildSqliteCoverage } from "../src/sqliteCoverage.js";

test("buildSqliteCoverage summarizes page table dependencies and missing sources", () => {
  const coverage = buildSqliteCoverage({
    tableStats: {
      erp_sales_orders: { row_count: 20, latest_at: "2026-05-23T08:00:00.000Z", min_date: "2026-02-23", max_date: "2026-05-23" },
      erp_material_alerts: { row_count: 0, latest_at: "" },
      erp_finance_records: { row_count: 2200, latest_at: "2026-05-24T01:00:00.000Z", min_date: "2026-02-14", max_date: "2026-05-23" },
      erp_procedure_plans: { row_count: 768, latest_at: "2026-05-24T01:20:00.000Z", min_date: "2026-05-16", max_date: "2026-06-22" },
      pmc_dashboard_snapshots: { row_count: 1, latest_at: "2026-05-23T08:30:00.000Z" }
    },
    now: new Date("2026-05-24T08:00:00+08:00"),
    latestSyncRuns: [
      { source_key: "sales_orders", status: "success", finished_at: "2026-05-23T08:00:00.000Z" }
    ]
  });

  const pmc = coverage.pages.find((row) => row.page_path === "/pmc");
  const materials = coverage.pages.find((row) => row.page_path === "/materials");

  assert.ok(pmc.sqlite_tables.includes("erp_sales_orders"));
  assert.equal(materials.coverage_status, "缺数据");
  assert.match(materials.missing_sources, /物料\/库存告警为空/);
  assert.equal(coverage.tables.find((row) => row.table_name === "erp_sales_orders").history_status, "90天已覆盖");
  assert.equal(coverage.tables.find((row) => row.table_name === "erp_finance_records").history_status, "90天已覆盖");
  assert.equal(coverage.tables.find((row) => row.table_name === "erp_procedure_plans").history_status, "未覆盖90天");
  assert.equal(coverage.summary.history_ready_tables, 2);
  assert.equal(coverage.summary.pages, coverage.pages.length);
  assert.ok(coverage.tables.some((row) => row.table_name === "erp_material_alerts"));
});
