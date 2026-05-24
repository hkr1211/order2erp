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
      order_procedure_links: { row_count: 3, latest_at: "2026-05-24T02:00:00.000Z" },
      pmc_intervention_logs: { row_count: 5, latest_at: "2026-05-24T03:00:00.000Z" },
      pmc_dashboard_snapshots: { row_count: 1, latest_at: "2026-05-23T08:30:00.000Z" }
    },
    now: new Date("2026-05-24T08:00:00+08:00"),
    latestSyncRuns: [
      { source_key: "sales_orders", status: "success", finished_at: "2026-05-23T08:00:00.000Z" }
    ]
  });

  const pmc = coverage.pages.find((row) => row.page_path === "/pmc");
  const materials = coverage.pages.find((row) => row.page_path === "/materials");
  const procedureLinks = coverage.pages.find((row) => row.page_path === "/procedure-links");
  const interventions = coverage.pages.find((row) => row.page_path === "/interventions");

  assert.ok(pmc.sqlite_tables.includes("erp_sales_orders"));
  assert.ok(pmc.sqlite_tables.includes("pmc_intervention_logs"));
  assert.ok(pmc.sqlite_tables.includes("order_procedure_links"));
  assert.ok(procedureLinks.sqlite_tables.includes("order_procedure_links"));
  assert.equal(interventions.coverage_status, "可用");
  assert.match(interventions.table_rows, /pmc_intervention_logs:5/);
  assert.match(procedureLinks.table_rows, /order_procedure_links:3/);
  assert.equal(materials.coverage_status, "缺数据");
  assert.match(materials.missing_sources, /物料\/库存告警为空/);
  assert.equal(coverage.tables.find((row) => row.table_name === "erp_sales_orders").history_status, "90天已覆盖");
  assert.equal(coverage.tables.find((row) => row.table_name === "erp_finance_records").history_status, "90天已覆盖");
  assert.equal(coverage.tables.find((row) => row.table_name === "erp_procedure_plans").history_status, "未覆盖90天");
  assert.equal(coverage.summary.history_ready_tables, 2);
  assert.equal(coverage.summary.pages, coverage.pages.length);
  assert.ok(coverage.tables.some((row) => row.table_name === "erp_material_alerts"));
  assert.equal(coverage.tables.find((row) => row.table_name === "order_procedure_links").incremental, "人工维护");
  assert.equal(coverage.tables.find((row) => row.table_name === "pmc_intervention_logs").incremental, "人工维护");
});
