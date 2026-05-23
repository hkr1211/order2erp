import { normalizeTable, toBusinessView } from "./erpClient.js";
import { queryOrderShortages } from "./orderShortages.js";
import {
  finishSyncRun,
  latestSyncRuns,
  replaceMaterialAlerts,
  replaceProcedurePlans,
  replaceSalesOrders,
  startSyncRun
} from "./localDb.js";

export async function syncCoreData(client, options = {}) {
  const sources = normalizeSources(options.sources);
  const results = [];
  for (const source of sources) {
    if (source === "sales_orders") {
      results.push(await syncSalesOrders(client, options));
    }
    if (source === "procedure_plans") {
      results.push(await syncProcedurePlans(client, options));
    }
    if (source === "material_alerts") {
      results.push(await syncMaterialAlerts(client, options));
    }
  }
  return { generated_at: new Date().toISOString(), results, latest: latestSyncRuns() };
}

export async function syncSalesOrders(client, options = {}) {
  return runSync("sales_orders", async () => {
    const response = await client.queryView("sales_orders", {
      pageindex: options.pageindex || 1,
      pagesize: options.sales_pagesize || options.pagesize || 100,
      searchKey: options.searchKey || ""
    });
    const table = normalizeTable(response);
    const rows = toBusinessView("sales_orders", table).rows.map((row, index) => mapSalesOrder(row, index));
    replaceSalesOrders(rows);
    return rows.length;
  });
}

export async function syncProcedurePlans(client, options = {}) {
  return runSync("procedure_plans", async () => {
    const response = await client.queryView("procedure_plans", {
      page_index: options.page_index || options.pageindex || 1,
      page_size: options.procedure_pagesize || options.pagesize || 100,
      searchKey: options.searchKey || ""
    });
    const table = normalizeTable(response);
    const rows = table.rows.map((row, index) => mapProcedurePlan(row, index));
    replaceProcedurePlans(rows);
    return rows.length;
  });
}

export async function syncMaterialAlerts(client, options = {}) {
  return runSync("material_alerts", async () => {
    const [shortageResult, inventoryResult] = await Promise.allSettled([
      queryOrderShortages(client, {
        pageindex: options.pageindex || 1,
        pagesize: options.shortage_pagesize || 20,
        contract_limit: options.contract_limit || 5,
        scan_size: options.scan_size || 100,
        cks: options.cks || ""
      }),
      client.queryInventoryAlerts({
        scan_pages: options.scan_pages || 1,
        scan_size: options.inventory_scan_size || options.scan_size || 20,
        alert_limit: options.alert_limit || 20,
        low_stock_threshold: options.low_stock_threshold || 5,
        old_stock_days: options.old_stock_days || 180,
        cks: options.cks || ""
      })
    ]);
    if (shortageResult.status === "rejected" && inventoryResult.status === "rejected") {
      throw new Error(`${summarizeError(shortageResult.reason)}；${summarizeError(inventoryResult.reason)}`);
    }
    const shortageRows = shortageResult.status === "fulfilled" ? shortageResult.value?.body?.rows || [] : [];
    const lowStockRows = inventoryResult.status === "fulfilled" ? inventoryResult.value?.body?.sections?.low_stock || [] : [];
    const rows = [
      ...shortageRows.map((row, index) => ({
      alert_id: `shortage-${row.order_no || index}-${row.product_code || index}`,
      alert_type: "shortage",
      order_no: text(row.order_no),
      customer: text(row.customer),
      product_code: text(row.product_code),
      product_name: text(row.product_name),
      warehouse: text(row.warehouse),
      demand_qty: number(row.demand_qty),
      available_qty: number(row.available_qty),
      stock_qty: number(row.stock_qty),
      shortage_qty: number(row.shortage_qty),
      priority: "高",
      raw: row,
      synced_at: new Date().toISOString()
      })),
      ...lowStockRows.map((row, index) => ({
        alert_id: `low_stock-${row.product_code || index}-${row.warehouse || index}`,
        alert_type: "low_stock",
        order_no: "",
        customer: "",
        product_code: text(row.product_code),
        product_name: text(row.product_name),
        warehouse: text(row.warehouse),
        demand_qty: null,
        available_qty: number(row.available_qty),
        stock_qty: number(row.stock_qty),
        shortage_qty: null,
        priority: number(row.available_qty) <= 0 ? "高" : "中",
        raw: row,
        synced_at: new Date().toISOString()
      }))
    ];
    if (!rows.length) {
      throw new Error("ERP 本次未返回缺料或低库存告警，保留本地旧物料告警数据。");
    }
    replaceMaterialAlerts(rows);
    return rows.length;
  });
}

async function runSync(sourceKey, action) {
  const run = startSyncRun(sourceKey);
  try {
    const rows = await action();
    return { source_key: sourceKey, ...finishSyncRun(run.id, { status: "success", rows_synced: rows }) };
  } catch (error) {
    return {
      source_key: sourceKey,
      ...finishSyncRun(run.id, {
        status: "failed",
        rows_synced: 0,
        error_message: summarizeError(error)
      })
    };
  }
}

function normalizeSources(value) {
  if (!value) {
    return ["sales_orders", "procedure_plans", "material_alerts"];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return String(value)
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean);
}

function mapSalesOrder(row, index) {
  return {
    erp_id: text(row.erp_id || row.ord || row.id || row.order_no || `sales-${index}`),
    order_no: text(row.order_no),
    customer: text(row.customer),
    owner: text(row.owner),
    product_name: text(row.product_name),
    product_code: text(row.product_code),
    product_model: text(row.product_model),
    quantity: number(row.quantity),
    remaining_qty: number(row.remaining_qty),
    delivery_date: text(row.delivery_date),
    signed_date: text(row.signed_date),
    amount: number(row.amount),
    status_text: text(row.status_text || row.status),
    raw: row.raw || row,
    synced_at: new Date().toISOString()
  };
}

function mapProcedurePlan(row, index) {
  const workAssignmentId = text(row.workAssignmentId || row.work_assignment_id || row["派工单ID"] || row["派工单号"]);
  const procedureId = text(row.procedurePlanId || row.id || row["工序计划ID"]);
  return {
    erp_id: procedureId || `${workAssignmentId || "procedure"}-${index}`,
    work_assignment_id: workAssignmentId,
    order_no: text(row.orderNo || row.OrderNo || row["订单编号"] || row["生产单号"] || row["派工单号"]),
    product_name: text(row.productName || row.product_name || row["产品名称"] || row.title),
    product_code: text(row.productCode || row.product_code || row["产品编号"] || row.order1),
    product_model: text(row.productModel || row.product_model || row["产品型号"]),
    procedure_name: text(row.procedureName || row.procedure_name || row["工序名称"]),
    work_center_name: text(row.workCenterName || row.work_center_name || row["工作中心名称"]),
    planned_qty: number(row.planNum || row.planned_qty || row["加工数量"] || row.num),
    finished_qty: number(row.finishNum || row.qualified_qty || row["合格数量"] || row["完工数量"]),
    remaining_qty: number(row.remainingNum || row.remaining_qty || row["剩余数量"]),
    planned_start_date: text(row.planStartDate || row.planned_start_date || row["计划开工期"]),
    planned_finish_date: text(row.planEndDate || row.planned_finish_date || row["计划完工期"]),
    owner: text(row.owner || row.person || row["工序计划负责人"] || row["负责人"]),
    state: text(row.state || row.status || row["状态"]),
    raw: row,
    synced_at: new Date().toISOString()
  };
}

function text(value) {
  return value === undefined || value === null ? "" : String(value);
}

function number(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function summarizeError(error) {
  const message = error?.message || String(error || "未知错误");
  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}
