import { clampInt, daysBetween, parseDate, parseNumber, startOfDay } from "../displayUtils.js";
import { normalizeTable } from "../erpClient.js";
import { scopeRowsForUser } from "../auth.js";

export function createProductionQueries({
  buildWorkshopBoard,
  client,
  enrichProcedurePlansWithOrderMatches = ({ procedurePlans }) => procedurePlans,
  listMaterialAlerts,
  listOrderProcedureLinks,
  listProcedurePlans,
  listProcessReports,
  listSalesOrders,
  summarizeDataSourceError,
  withTimeout
}) {
  async function queryProductionCenter(params = {}) {
    const pageindex = params.pageindex || 1;
    const pagesize = params.pagesize || 20;
    const timeoutMs = clampInt(params.timeout_ms || 5000, 1000, 15000);
    const today = startOfDay(parseDate(params.today) || new Date());
    const [progressResult, materialResult, bomResult, procedureResult] = await Promise.allSettled([
      withTimeout(client.queryView("production_progress", { pageindex, pagesize, searchKey: params.searchKey || "" }), timeoutMs),
      withTimeout(client.queryView("material_orders", { pageindex, pagesize, searchKey: params.searchKey || "" }), timeoutMs),
      withTimeout(client.queryView("production_boms", { page_index: pageindex, page_size: pagesize, searchKey: params.searchKey || "" }), timeoutMs),
      withTimeout(client.queryView("procedure_plans", { page_index: pageindex, page_size: pagesize, searchKey: params.searchKey || "" }), timeoutMs)
    ]);
    const sourceStatus = {
      production_progress: settledStatus(progressResult),
      material_orders: settledStatus(materialResult),
      production_boms: settledStatus(bomResult),
      procedure_plans: settledStatus(procedureResult)
    };
    const sourceNotes = Object.entries(sourceStatus)
      .filter(([, status]) => !status.ok)
      .map(([name, status]) => `${name} 数据源暂不可用：${status.message}`);
    const progress = progressResult.status === "fulfilled" ? normalizeTable(progressResult.value) : { rows: [], page: null };
    const materials = materialResult.status === "fulfilled" ? normalizeTable(materialResult.value) : { rows: [], page: null };
    const boms = bomResult.status === "fulfilled" ? normalizeTable(bomResult.value) : { rows: [], page: null };
    const procedures = procedureResult.status === "fulfilled" ? normalizeTable(procedureResult.value) : { rows: [], page: null };
    const progressRows = scopeRowsForUser(progress.rows, params.auth_user, "production");
    const materialRows = scopeRowsForUser(materials.rows, params.auth_user, "material");
    const bomRows = scopeRowsForUser(boms.rows.map(mapProductionBomForCenter), params.auth_user, "material");
    const rawProcedureRows = procedures.rows.map(mapProcedurePlanForCenter);
    const procedureRows = scopeRowsForUser(enrichProcedurePlansWithOrderMatches({
      today,
      procedurePlans: rawProcedureRows,
      salesOrders: listSalesOrders({ limit: 5000 }),
      procedureLinks: listOrderProcedureLinks({ limit: 1000 }),
      processReports: listProcessReports({ limit: 1000 })
    }), params.auth_user, "production");
    const delayedProcedures = procedureRows
      .filter((row) => row.remaining_qty === null || row.remaining_qty > 0)
      .filter((row) => parseDate(row.planned_finish_date) && daysBetween(today, startOfDay(parseDate(row.planned_finish_date))) < 0);
    const workloadRows = productionWorkloadByCenter(procedureRows, today);
    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "production_center",
        generated_at: new Date().toISOString(),
        offline: sourceNotes.length > 0,
        summary: {
          progress_rows: progressRows.length,
          material_order_rows: materialRows.length,
          bom_rows: bomRows.length,
          procedure_plan_rows: procedureRows.length,
          delayed_procedures: delayedProcedures.length,
          work_centers: workloadRows.length,
          source_errors: sourceNotes.length
        },
        sections: {
          progress: progressRows,
          material_orders: materialRows,
          boms: bomRows,
          procedure_plans: procedureRows,
          delayed_procedures: delayedProcedures,
          workload_by_center: workloadRows
        },
        source_status: sourceStatus,
        notes: [
          ...sourceNotes,
          "生产进度中心聚合 ERP 生产进度、领料、BOM、工序计划接口，并识别延期工序。",
          "当前公司车间报工继续使用 ERP；本中台不新增报工入口。"
        ]
      }
    };
  }

  async function queryLocalProductionCenter(params = {}) {
    const pageSize = clampInt(params.pagesize || 100, 1, 500);
    const today = startOfDay(parseDate(params.today) || new Date());
    const procedureRows = scopeRowsForUser(enrichProcedurePlansWithOrderMatches({
      today,
      procedurePlans: listProcedurePlans({ limit: pageSize }),
      salesOrders: listSalesOrders({ limit: 5000 }),
      procedureLinks: listOrderProcedureLinks({ limit: 1000 }),
      processReports: listProcessReports({ limit: 1000 })
    }), params.auth_user, "production");
    const delayedProcedures = procedureRows
      .filter((row) => row.remaining_qty === null || row.remaining_qty > 0)
      .filter((row) => parseDate(row.planned_finish_date) && daysBetween(today, startOfDay(parseDate(row.planned_finish_date))) < 0);
    const workloadRows = productionWorkloadByCenter(procedureRows, today);
    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "production_center",
        generated_at: new Date().toISOString(),
        cached: true,
        offline: false,
        summary: {
          progress_rows: 0,
          material_order_rows: 0,
          bom_rows: 0,
          procedure_plan_rows: procedureRows.length,
          delayed_procedures: delayedProcedures.length,
          work_centers: workloadRows.length,
          source_errors: 0
        },
        sections: {
          progress: [],
          material_orders: [],
          boms: [],
          procedure_plans: procedureRows,
          delayed_procedures: delayedProcedures,
          workload_by_center: workloadRows
        },
        source_status: {
          sqlite_procedure_plans: { ok: true, message: null }
        },
        notes: [
          "当前读取本地 SQLite 派工/工序计划表。",
          "点击“谨慎同步工序20条”可从 ERP 小批量更新工序计划。"
        ]
      }
    };
  }

  function queryWorkshopBoard(params = {}) {
    const limit = clampInt(params.limit || 5000, 1, 10000);
    const reportLimit = clampInt(params.report_limit || 1000, 1, 5000);
    const today = parseDate(params.today) || new Date();
    return buildWorkshopBoard({
      today,
      procedurePlans: scopeRowsForUser(listProcedurePlans({ limit }), params.auth_user, "production"),
      processReports: listProcessReports({ limit: reportLimit }),
      materialAlerts: scopeRowsForUser(listMaterialAlerts({ limit: 1000 }), params.auth_user, "material"),
      salesOrders: scopeRowsForUser(listSalesOrders({ limit: 5000 }), params.auth_user, "orders"),
      procedureLinks: listOrderProcedureLinks({ limit: 1000 })
    });
  }

  function settledStatus(result) {
    return {
      ok: result.status === "fulfilled",
      message: result.status === "rejected" ? summarizeDataSourceError(result.reason) : null
    };
  }

  return { queryLocalProductionCenter, queryProductionCenter, queryWorkshopBoard };
}

function mapProcedurePlanForCenter(row) {
  return {
    work_assignment_id: firstText(row.workAssignmentId, row.work_assignment_id, row["派工单ID"], row["派工单号"]),
    order_no: firstText(row.orderNo, row.OrderNo, row["订单编号"], row["生产单号"], row["派工单号"]),
    product_name: firstText(row.productName, row.product_name, row["产品名称"], row.title),
    product_code: firstText(row.productCode, row.product_code, row["产品编号"], row.order1),
    procedure_name: firstText(row.procedureName, row.procedure_name, row["工序名称"]),
    work_center_name: firstText(row.workCenterName, row.work_center_name, row["工作中心名称"]),
    planned_qty: firstNumber(row.planNum, row.planned_qty, row["加工数量"], row.num),
    finished_qty: firstNumber(row.finishNum, row.qualified_qty, row["合格数量"], row["完工数量"]),
    remaining_qty: firstNumber(row.remainingNum, row.remaining_qty, row["剩余数量"]),
    planned_start_date: firstText(row.planStartDate, row.planned_start_date, row["计划开工期"]),
    planned_finish_date: firstText(row.planEndDate, row.planned_finish_date, row["计划完工期"]),
    owner: firstText(row.owner, row.person, row["工序计划负责人"], row["负责人"]),
    state: firstText(row.state, row.status, row["状态"]),
    raw: row
  };
}

function mapProductionBomForCenter(row) {
  return {
    bom_id: firstText(row.bomId, row.id, row["物料清单ID"]),
    bom_title: firstText(row.title, row.bomTitle, row["清单主题"]),
    bom_no: firstText(row.order1, row.bomNo, row["清单编号"]),
    parent_product: firstText(row.cpname, row.productName, row["父件产品"]),
    effective_status: firstText(row.status, row["生效状态"]),
    enabled_status: firstText(row.enabled, row["启用状态"]),
    bom_type: firstText(row.type, row["主辅清单"]),
    customer_scope: firstText(row.customer, row["适用客户"]),
    owner: firstText(row.owner, row["添加人员"]),
    created_date: firstText(row.createdDate, row["添加日期"]),
    raw: row
  };
}

function productionWorkloadByCenter(rows, today) {
  const grouped = new Map();
  for (const row of rows) {
    const center = row.work_center_name || "未识别工作中心";
    const current = grouped.get(center) || {
      work_center_name: center,
      procedure_count: 0,
      planned_qty: 0,
      finished_qty: 0,
      remaining_qty: 0,
      delayed_procedures: 0
    };
    current.procedure_count += 1;
    current.planned_qty += parseNumber(row.planned_qty) || 0;
    current.finished_qty += parseNumber(row.finished_qty) || 0;
    current.remaining_qty += parseNumber(row.remaining_qty) || 0;
    if (parseDate(row.planned_finish_date) && (parseNumber(row.remaining_qty) || 0) > 0 && startOfDay(parseDate(row.planned_finish_date)) < today) {
      current.delayed_procedures += 1;
    }
    grouped.set(center, current);
  }
  return [...grouped.values()]
    .map((row) => ({
      ...row,
      planned_qty: Number(row.planned_qty.toFixed(4)),
      finished_qty: Number(row.finished_qty.toFixed(4)),
      remaining_qty: Number(row.remaining_qty.toFixed(4))
    }))
    .sort((a, b) => b.delayed_procedures - a.delayed_procedures || b.remaining_qty - a.remaining_qty)
    .slice(0, 20);
}

function firstText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function firstNumber(...values) {
  for (const value of values) {
    const number = parseNumber(value);
    if (number !== null) {
      return number;
    }
  }
  return null;
}
