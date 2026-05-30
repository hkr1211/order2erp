import { normalizeTable, toBusinessView } from "./erpClient.js";
import { queryOrderShortages } from "./orderShortages.js";
import { queryPendingQuotes } from "./pendingQuotes.js";
import { mapFinanceRowForLocal, mapQuoteFollowupForLocal } from "./localAnalytics.js";
import {
  finishSyncRun,
  latestSyncRuns,
  replaceFinanceRecords,
  replaceMaterialAlerts,
  replaceOrgUsers,
  replaceProcedurePlans,
  replaceQuoteFollowups,
  startSyncRun,
  upsertOrgUsers,
  upsertSalesOrders
} from "./localDb.js";

export async function syncCoreData(client, options = {}) {
  const sources = normalizeSources(options.sources);
  const results = [];
  const latestBeforeSync = latestSyncRuns();
  for (const source of sources) {
    const skipped = shouldSkipSyncSource(source, latestBeforeSync, options);
    if (skipped) {
      results.push(skipped);
      continue;
    }
    if (source === "sales_orders") {
      results.push(await syncSalesOrders(client, options));
    }
    if (source === "procedure_plans") {
      results.push(await syncProcedurePlans(client, options));
    }
    if (source === "material_alerts") {
      results.push(await syncMaterialAlerts(client, options));
    }
    if (source === "quote_projects") {
      results.push(await syncQuoteProjects(client, options));
    }
    if (source === "finance_records") {
      results.push(await syncFinanceRecords(client, options));
    }
    if (source === "org_users") {
      results.push(await syncOrgUsers(client, options));
    }
  }
  return { generated_at: new Date().toISOString(), results, latest: latestSyncRuns() };
}

export function shouldSkipSyncSource(sourceKey, latestRuns = [], options = {}) {
  if (isTruthy(options.force_sync) || isTruthy(options.force)) {
    return null;
  }
  const cooldownSeconds = parsePositiveInt(
    options.cooldown_seconds ?? process.env.SYNC_COOLDOWN_SECONDS,
    300
  );
  if (cooldownSeconds <= 0) {
    return null;
  }
  const latest = latestRuns.find((row) => row.source_key === sourceKey);
  if (!latest) {
    return null;
  }
  const lastTime = new Date(latest.finished_at || latest.started_at || "");
  if (Number.isNaN(lastTime.getTime())) {
    return null;
  }
  const elapsedSeconds = Math.floor((Date.now() - lastTime.getTime()) / 1000);
  if (elapsedSeconds >= cooldownSeconds) {
    return null;
  }
  return {
    source_key: sourceKey,
    started_at: latest.started_at,
    finished_at: new Date().toISOString(),
    status: "skipped",
    rows_synced: 0,
    error_message: `ERP保护模式：${sourceKey} 距离上次同步 ${Math.max(0, elapsedSeconds)} 秒，小于 ${cooldownSeconds} 秒冷却时间；如确认 ERP 稳定可加 force_sync=1。`,
    skipped_due_to_cooldown: true
  };
}

export async function syncSalesOrders(client, options = {}) {
  return runSync("sales_orders", async () => {
    const response = await client.queryView("sales_orders", {
      pageindex: options.pageindex || 1,
      pagesize: options.sales_pagesize || options.pagesize || 20,
      searchKey: options.searchKey || ""
    });
    const table = normalizeTable(response);
    const rows = toBusinessView("sales_orders", table).rows.map((row, index) => mapSalesOrder(row, index));
    upsertSalesOrders(rows);
    return rows.length;
  });
}

export async function syncProcedurePlans(client, options = {}) {
  return runSync("procedure_plans", async () => {
    const response = await client.queryView("procedure_plans", {
      page_index: options.page_index || options.pageindex || 1,
      page_size: options.procedure_pagesize || options.pagesize || 20,
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
        contract_limit: options.contract_limit || 3,
        scan_size: options.scan_size || 20,
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

export async function syncQuoteProjects(client, options = {}) {
  return runSync("quote_projects", async () => {
    const pending = await queryPendingQuotes(client, {
      pageindex: options.pageindex || 1,
      pagesize: options.quote_pagesize || options.pagesize || 20,
      limit: options.quote_limit || options.limit || 20,
      searchKey: options.searchKey || "",
      include_all: options.include_all || ""
    });
    const today = options.today ? new Date(options.today) : new Date();
    const rows = (pending?.body?.rows || []).map((row) => ({
      ...mapQuoteFollowupForLocal(row, today),
      synced_at: new Date().toISOString()
    }));
    replaceQuoteFollowups(rows);
    return rows.length;
  });
}

export async function syncFinanceRecords(client, options = {}) {
  return runSync("finance_records", async () => {
    const today = options.today ? new Date(options.today) : new Date();
    const [receivableResult, payableResult] = await Promise.allSettled([
      client.queryView("receivables", {
        pageindex: options.pageindex || 1,
        pagesize: options.finance_pagesize || options.pagesize || 20,
        searchKey: options.searchKey || ""
      }),
      client.queryView("payables", {
        pageindex: options.pageindex || 1,
        pagesize: options.finance_pagesize || options.pagesize || 20,
        searchKey: options.searchKey || ""
      })
    ]);
    if (receivableResult.status === "rejected" && payableResult.status === "rejected") {
      throw new Error(`${summarizeError(receivableResult.reason)}；${summarizeError(payableResult.reason)}`);
    }
    const receivableRows = receivableResult.status === "fulfilled" ? normalizeTable(receivableResult.value).rows : [];
    const payableRows = payableResult.status === "fulfilled" ? normalizeTable(payableResult.value).rows : [];
    const rows = [
      ...receivableRows.map((row, index) => ({
        record_id: `receivable-${row.id || row.billno || row.order1 || index}`,
        ...mapFinanceRowForLocal(row, "receivable", today),
        synced_at: new Date().toISOString()
      })),
      ...payableRows.map((row, index) => ({
        record_id: `payable-${row.id || row.billno || row.order1 || index}`,
        ...mapFinanceRowForLocal(row, "payable", today),
        synced_at: new Date().toISOString()
      }))
    ];
    if (!rows.length) {
      throw new Error("ERP 本次未返回应收或应付记录，保留本地旧财务数据。");
    }
    replaceFinanceRecords(rows);
    return rows.length;
  });
}

export async function syncOrgUsers(client, options = {}) {
  return runSync("org_users", async () => {
    const startPage = parsePositiveInt(options.page_index || options.pageindex || 1, 1);
    const pageSize = parsePositiveInt(options.org_pagesize || options.pagesize || options.page_size || 100, 100);
    const maxPages = parsePositiveInt(options.org_max_pages || options.max_pages || 10, 10);
    const baseParams = {
      page_size: pageSize,
      userName: options.searchKey || options.userName || "",
      empName: options.empName || "",
      deptId: options.deptId || "",
      Del: options.Del ?? ""
    };
    const rows = [];
    for (let pageIndex = startPage; pageIndex < startPage + maxPages; pageIndex += 1) {
      const response = await client.queryView("org_users", {
        ...baseParams,
        page_index: pageIndex
      });
      const table = normalizeTable(response);
      rows.push(...table.rows.map((row, index) => mapOrgUser(row, rows.length + index)));
      const pageCount = Number(response?.Page?.PageCount || table.page?.PageCount || 0);
      if (pageCount && pageIndex >= pageCount) {
        break;
      }
      if (!pageCount && table.rows.length < pageSize) {
        break;
      }
    }
    if (isFullOrgUserSync(options)) {
      replaceOrgUsers(rows);
    } else {
      upsertOrgUsers(rows);
    }
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
    return ["sales_orders"];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return String(value)
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean);
}

function parsePositiveInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function isTruthy(value) {
  if (value === true || value === 1) {
    return true;
  }
  const text = value === undefined || value === null ? "" : String(value).trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}

export function mapSalesOrder(row, index) {
  const statusText = [
    row.status_text || row.status,
    row.warehouse_status || row.ckjz,
    row.delivery_status || row.fhjz,
    row.payment_status || row.skjz,
    row.approval_status || row.spzt
  ].map(text).filter(Boolean).join(" / ");
  return {
    erp_id: text(row.erp_id || row.ord || row.id || row.order_no || `sales-${index}`),
    order_no: text(row.order_no || row.htid),
    customer: text(row.customer || row.khmc),
    owner: text(row.owner || row.xsry),
    product_name: text(row.product_name),
    product_code: text(row.product_code),
    product_model: text(row.product_model),
    quantity: number(row.quantity),
    remaining_qty: number(row.remaining_qty),
    delivery_date: text(row.delivery_date),
    signed_date: text(row.signed_date || row.dateQD),
    amount: number(row.amount || row.moneyall),
    status_text: statusText,
    raw: row.raw || row,
    synced_at: new Date().toISOString()
  };
}

export function mapProcedurePlan(row, index) {
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

export function mapOrgUser(row, index) {
  const displayName = firstText(row["员工姓名"], row.display_name, row.displayName, row.name, row.Name, row.realname, row.RealName, row.username, row["账号名称"]);
  const username = firstText(row["账号名称"], row.username, row.userName, row.loginName, row.account, row.accountName);
  const employeeStatus = firstText(row["员工状态"], row.employee_status, row.status, row.Status, row.Del, row.del);
  return {
    user_id: String(firstText(row["账号ID"], row.user_id, row.userId, row.userid, row.id, row.ID, username, displayName, `org-user-${index}`)),
    username,
    employee_no: firstText(row["员工编号"], row.employee_no, row.employeeNo, row.empNo),
    display_name: displayName,
    employee_status: employeeStatus,
    department_id: firstText(row["部门id"], row.department_id, row.departmentId, row.deptId),
    department_name: firstText(row["部门名称"], row.department_name, row.departmentName, row.deptName),
    is_active: isActiveOrgUser(employeeStatus),
    raw: row,
    synced_at: new Date().toISOString()
  };
}

function text(value) {
  return value === undefined || value === null ? "" : String(value);
}

function firstText(...values) {
  for (const value of values) {
    const clean = text(value).trim();
    if (clean) {
      return clean;
    }
  }
  return "";
}

function isActiveOrgUser(value) {
  const status = text(value).trim();
  if (!status) {
    return 1;
  }
  if (/离职|停用|禁用|删除|失效|冻结/.test(status)) {
    return 0;
  }
  if (status === "1") {
    return 0;
  }
  return 1;
}

function isFullOrgUserSync(options = {}) {
  return ![
    options.searchKey,
    options.userName,
    options.empName,
    options.deptId,
    options.Del
  ].some((value) => text(value).trim());
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
