import { clampInt, formatDate, formatDateTime, parseBoolean, startOfDay } from "../displayUtils.js";
import { normalizeTable } from "../erpClient.js";
import { hasFullDataAccess, scopeRowsForUser } from "../auth.js";
import { queryOrderDeliveryRisks } from "../orderDeliveryRisks.js";
import { queryOrderShortages } from "../orderShortages.js";
import { standardRisksForDomain } from "../models/standardRiskAccess.js";
import { collectDashboardRisks } from "../models/riskSelectors.js";

export function createPmcQueries({
  buildLocalPmcDashboard,
  client,
  enrichPmcInterventionStatus,
  latestPmcSnapshot,
  latestStandardRisks = () => [],
  listFinanceRecords,
  listInventoryDetails = () => [],
  listLocalUserRoles,
  listMaterialAlerts,
  listOrderProcedureLinks,
  listProcedurePlans,
  listProcessReports,
  listSalesOrders,
  savePmcSnapshot,
  saveStandardRisks = () => null,
  summarizeDataSourceError,
  withTimeout
}) {
  function queryFollowupWorkbench(params = {}) {
    const dashboard = queryLocalPmcDashboard(params);
    const owners = dashboard?.sections?.owner_workbenches || [];
    const requestedOwner = String(params.owner || "").trim();
    const knownOwner = requestedOwner ? owners.some((row) => row.owner === requestedOwner) : false;
    const selectedOwner = requestedOwner ? (knownOwner ? requestedOwner : "") : owners[0]?.owner || "";
    const scopedDashboard = selectedOwner ? queryLocalPmcDashboard({ ...params, owner: selectedOwner }) : requestedOwner ? null : dashboard;
    const enrichedDashboard = scopedDashboard ? enrichPmcInterventionStatus(scopedDashboard) : scopedDashboard;
    const standardRisks = standardRisksForDomain({
      domain: "followup",
      snapshot: enrichedDashboard,
      listStandardRisks: latestStandardRisks,
      authUser: params.auth_user,
      owner: selectedOwner,
      openOnly: false
    });
    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "followup_workbench",
        generated_at: new Date().toISOString(),
        owner: selectedOwner,
        open_only: parseBoolean(params.open_only),
        owners,
        dashboard: enrichedDashboard,
        standard_risks: standardRisks,
        notes: [
          "跟单工作台只读取本地 SQLite，不访问 ERP。",
          requestedOwner && !knownOwner ? `${requestedOwner} 当前不在跟单负责人名单内，可能属于财务/管理等非跟单角色。` : "",
          selectedOwner ? `当前按负责人过滤：${selectedOwner}。` : "当前没有可识别负责人，显示空工作台。"
        ].filter(Boolean)
      }
    };
  }

  function queryLocalPmcDashboard(params = {}) {
    const limit = clampInt(params.local_limit || 5000, 1, 5000);
    const salesOrders = scopeRowsForUser(listSalesOrders({ limit }), params.auth_user, "orders");
    if (!salesOrders.length) {
      return null;
    }
    const effectiveOwner = effectivePmcOwnerFilter(params, params.auth_user);
    const materialAlertRows = listMaterialAlerts({ limit });
    const materialAlerts = expandMaterialAlertsForPmcOwnerMatching(
      materialAlertRows,
      scopeRowsForUser(materialAlertRows, params.auth_user, "material"),
      salesOrders,
      params.auth_user
    );
    const procedurePlanRows = listProcedurePlans({ limit });
    const procedurePlans = expandProcedurePlansForPmcOwnerMatching(
      procedurePlanRows,
      scopeRowsForUser(procedurePlanRows, params.auth_user, "production"),
      salesOrders,
      params.auth_user
    );
    const procedureLinks = listOrderProcedureLinks({ limit });
    const processReports = typeof listProcessReports === "function" ? listProcessReports({ limit }) : [];
    const inventoryDetails = scopeRowsForUser(listInventoryDetails({ limit }), params.auth_user, "inventory");
    const financeRows = scopeRowsForUser(listFinanceRecords({ limit }), params.auth_user, "finance");
    const userRoles = listLocalUserRoles({ limit });
    return buildLocalPmcDashboard({
      today: params.today ? new Date(params.today) : new Date(),
      owner: effectiveOwner,
      salesOrders,
      materialAlerts,
      procedurePlans,
      procedureLinks,
      processReports,
      inventoryDetails,
      financeRows,
      userRoles
    });
  }

  async function queryPmcConsole(params = {}) {
    const refresh = parseBoolean(params.refresh);
    const rebuild = parseBoolean(params.rebuild);
    const cached = latestPmcSnapshot();
    if (canUsePmcSnapshotCache(params, { refresh, rebuild }) && isFreshPmcSnapshot(cached)) {
      return cachedPmcResponse(cached);
    }
    if (!refresh || rebuild) {
      const localDashboard = queryLocalPmcDashboard(params);
      if (localDashboard) {
        if (!params.auth_user && !params.owner) {
          saveStandardRisks(collectDashboardRisks(localDashboard), { generated_at: localDashboard.generated_at });
        }
        if (rebuild) {
          savePmcSnapshot(localDashboard);
        }
        return {
          header: { status: 0, message: "ok" },
          body: localDashboard
        };
      }
    }

    if (canUsePmcSnapshotCache(params, { refresh, rebuild }) && isFreshPmcSnapshot(cached)) {
      return cachedPmcResponse(cached);
    }

    const today = startOfDay(params.today ? new Date(params.today) : new Date());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const dashboardParams = {
      scan_pages: params.scan_pages || 1,
      scan_size: params.scan_size || 20,
      contract_limit: params.contract_limit || 3,
      alert_limit: params.alert_limit || 10,
      low_stock_threshold: params.low_stock_threshold || 5,
      old_stock_days: params.old_stock_days || 180,
      due_soon_days: params.due_soon_days || 7,
      today: formatDate(today)
    };

    try {
      const [dashboard, todayOrders, monthOrders] = await Promise.all([
        queryPmcDashboard(dashboardParams),
        querySalesOrderCount({ dateQD_0: formatDate(today), dateQD_1: formatDate(today) }),
        querySalesOrderCount({ dateQD_0: formatDate(monthStart), dateQD_1: formatDate(monthEnd) })
      ]);

      const source = dashboard.body;
      const summary = {
        today_orders: todayOrders.count,
        month_orders: monthOrders.count,
        overdue_orders: uniqueCount(source.sections.overdue_delivery_rows || [], "order_no"),
        due_soon_orders: uniqueCount(source.sections.due_soon_delivery_rows || [], "order_no"),
        shortage_orders: source.summary.order_shortage_orders || 0,
        low_stock: source.summary.low_stock || 0
      };

      const body = {
        model: "pmc_console",
        generated_at: new Date().toISOString(),
        scan: {
          today: formatDate(today),
          month_start: formatDate(monthStart),
          month_end: formatDate(monthEnd),
          dashboard: dashboardParams
        },
        summary,
        sections: {
          overdue_orders: source.sections.overdue_delivery_rows || [],
          due_soon_orders: source.sections.due_soon_delivery_rows || [],
          shortage_orders: source.sections.order_shortage_rows || [],
          low_stock: source.sections.low_stock || []
        },
        source_status: {
          ...source.source_status,
          today_orders: todayOrders,
          month_orders: monthOrders
        },
        notes: [
          "PMC 驾驶舱面向老板、PMC、销售共用，聚焦订单、交期、缺料、生产、库存和财务风险。",
          "物料齐套第一版按销售订单产品库存计算，不做 BOM 展开；车间报工继续使用 ERP。"
        ]
      };

      savePmcSnapshot(body);
      return {
        header: { status: 0, message: "ok" },
        body
      };
    } catch (error) {
      const message = summarizeDataSourceError(error);
      const fallback = latestPmcSnapshot();
      if (fallback) {
        return {
          header: { status: 0, message: "using local snapshot" },
          body: {
            ...fallback.payload,
            cached: true,
            offline: true,
            generated_at: new Date().toISOString(),
            cache_created_at: fallback.created_at,
            source_status: {
              ...(fallback.payload.source_status || {}),
              erp_realtime: { ok: false, message }
            },
            notes: [
              `ERP 数据源暂不可用：${message}`,
              `当前显示本地快照，快照时间：${formatDateTime(fallback.created_at)}。`,
              ...(fallback.payload.notes || [])
            ]
          }
        };
      }
      return {
        header: { status: 0, message: "offline empty dashboard" },
        body: emptyPmcConsoleBody({
          today,
          monthStart,
          monthEnd,
          dashboardParams,
          message
        })
      };
    }
  }

  function canUsePmcSnapshotCache(params = {}, { refresh = false, rebuild = false } = {}) {
    if (params.auth_user && !hasFullDataAccess(params.auth_user, "pmc")) {
      return false;
    }
    return !refresh && !rebuild && !params.owner && !params.today;
  }

  function isFreshPmcSnapshot(cached) {
    if (!cached?.created_at) {
      return false;
    }
    const createdAt = new Date(cached.created_at).getTime();
    return Number.isFinite(createdAt) && Date.now() - createdAt < 5 * 60 * 1000;
  }

  function cachedPmcResponse(cached) {
    return {
      header: { status: 0, message: "ok" },
      body: {
        ...cached.payload,
        cached: true,
        cache_source: "pmc_dashboard_snapshots",
        cache_created_at: cached.created_at
      }
    };
  }

  async function querySalesOrderCount(params) {
    try {
      const result = await client.queryView("sales_orders", {
        ...params,
        pageindex: "1",
        pagesize: "1"
      });
      const table = normalizeTable(result);
      const page = table.page || {};
      return {
        ok: true,
        count: Number(page.recordcount ?? page.RecordCount ?? table.rows.length ?? 0),
        page
      };
    } catch (error) {
      return {
        ok: false,
        count: null,
        message: error.message
      };
    }
  }

  async function queryPmcDashboard(params) {
    const dashboard = await client.queryPmcDashboard(params);
    try {
      const orderShortages = await queryOrderShortages(client, {
        ...params,
        pagesize: params.order_pagesize || params.pagesize || 10,
        contract_limit: params.contract_limit || 5,
        scan_size: params.order_scan_size || params.scan_size || 100
      });
      const body = dashboard.body;
      body.scan.order_shortages = orderShortages.body.scan;
      body.summary.order_shortage_orders = orderShortages.body.summary.orders_with_shortage;
      body.summary.order_shortage_rows = orderShortages.body.summary.shortage_rows;
      body.sections.order_shortages = orderShortages.body.orders;
      body.sections.order_shortage_rows = orderShortages.body.rows;
      body.source_status.order_shortages = {
        ok: orderShortages.body.summary.errors === 0,
        scanned_orders: orderShortages.body.summary.scanned_orders,
        checked_orders: orderShortages.body.summary.checked_orders,
        issue_count: orderShortages.body.summary.shortage_rows,
        errors: orderShortages.body.errors
      };
      const deliveryRisks = await queryOrderDeliveryRisks(client, {
        ...params,
        pagesize: params.order_pagesize || params.pagesize || 10,
        contract_limit: params.contract_limit || 5
      });
      body.scan.order_delivery_risks = deliveryRisks.body.scan;
      body.summary.delivery_risk_orders = deliveryRisks.body.summary.risk_orders;
      body.summary.delivery_risk_rows = deliveryRisks.body.summary.risk_rows;
      body.summary.overdue_delivery_rows = deliveryRisks.body.summary.overdue_rows;
      body.summary.due_soon_delivery_rows = deliveryRisks.body.summary.due_soon_rows;
      body.sections.delivery_risk_orders = deliveryRisks.body.orders;
      body.sections.overdue_delivery_rows = deliveryRisks.body.sections.overdue;
      body.sections.due_soon_delivery_rows = deliveryRisks.body.sections.due_soon;
      body.source_status.order_delivery_risks = {
        ok: deliveryRisks.body.summary.errors === 0,
        scanned_orders: deliveryRisks.body.summary.scanned_orders,
        checked_orders: deliveryRisks.body.summary.checked_orders,
        issue_count: deliveryRisks.body.summary.risk_rows,
        errors: deliveryRisks.body.errors
      };
      body.notes = [
        "PMC 综合看板已聚合库存风险、工序计划延期、生产数据源状态、订单缺料和订单交期风险。",
        "订单类风险默认只检查最近少量未发货/未出库合同；可用 contract_limit 调整扫描量。"
      ];
    } catch (error) {
      dashboard.body.source_status.order_shortages = {
        ok: false,
        message: error.message
      };
    }
    return dashboard;
  }

  return {
    emptyPmcConsoleBody,
    queryFollowupWorkbench,
    queryLocalPmcDashboard,
    queryPmcConsole,
    queryPmcDashboard
  };
}

export function emptyPmcConsoleBody({ today, monthStart, monthEnd, dashboardParams, message }) {
  return {
    model: "pmc_console",
    generated_at: new Date().toISOString(),
    offline: true,
    scan: {
      today: formatDate(today),
      month_start: formatDate(monthStart),
      month_end: formatDate(monthEnd),
      dashboard: dashboardParams
    },
    summary: {
      today_orders: null,
      month_orders: null,
      overdue_orders: 0,
      due_soon_orders: 0,
      shortage_orders: 0,
      low_stock: 0
    },
    sections: {
      overdue_orders: [],
      due_soon_orders: [],
      shortage_orders: [],
      low_stock: []
    },
    source_status: {
      erp_realtime: { ok: false, message }
    },
    notes: [
      `ERP 数据源暂不可用：${message}`,
      "本地还没有可用快照；请稍后刷新驾驶舱。"
    ]
  };
}

function uniqueCount(rows, key) {
  return new Set(rows.map((row) => row?.[key]).filter(Boolean)).size;
}

function effectivePmcOwnerFilter(params = {}, user = null) {
  const requestedOwner = String(params.owner || "").trim();
  if (requestedOwner) return requestedOwner;
  if (!user || hasFullDataAccess(user, "pmc")) return "";
  return String(user.display_name || user.name || user.username || "").trim();
}

function expandMaterialAlertsForPmcOwnerMatching(allRows = [], scopedRows = [], scopedSalesOrders = [], user = null) {
  if (!user || hasFullDataAccess(user, "pmc")) return scopedRows;
  const allowedOrderNos = new Set(scopedSalesOrders.map((row) => normalizeLookupKey(row.order_no)).filter(Boolean));
  return uniqueRowsByReference([
    ...scopedRows,
    ...allRows.filter((row) => allowedOrderNos.has(normalizeLookupKey(row.order_no)))
  ]);
}

function expandProcedurePlansForPmcOwnerMatching(allRows = [], scopedRows = [], scopedSalesOrders = [], user = null) {
  if (!user || hasFullDataAccess(user, "pmc")) return scopedRows;
  const allowedOrderNos = new Set(scopedSalesOrders.map((row) => normalizeLookupKey(row.order_no)).filter(Boolean));
  return uniqueRowsByReference([
    ...scopedRows,
    ...allRows.filter((row) => allowedOrderNos.has(normalizeLookupKey(row.order_no)) || hasAmbiguousProcedureOwner(row))
  ]);
}

function hasAmbiguousProcedureOwner(row = {}) {
  const owner = String(row.owner || row.responsible_owner || "").trim();
  return !owner || /^\d+$/.test(owner);
}

function normalizeLookupKey(value) {
  return String(value || "").trim().toUpperCase();
}

function uniqueRowsByReference(rows = []) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    if (seen.has(row)) continue;
    seen.add(row);
    result.push(row);
  }
  return result;
}
