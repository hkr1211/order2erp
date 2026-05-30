import { clampInt, formatDateTime, parseNumber } from "../displayUtils.js";
import { queryOrderShortages } from "../orderShortages.js";
import { scopeRowsForUser } from "../auth.js";

export function createMaterialExceptionQueries({
  buildLocalExceptionCenter,
  client,
  erpProtectionMode,
  interventionLogHref,
  isInterventionFinal,
  listInventoryDetails = () => [],
  listInventorySummary = () => [],
  latestPmcInterventionsByRelatedNos,
  latestPmcSnapshot,
  listMaterialAlerts,
  pmcInterventionHref,
  pmcRiskClosure,
  queryLocalPmcDashboard,
  queryPmcDashboard,
  summarizeDataSourceError,
  withTimeout
}) {
  async function queryMaterialControl(params = {}) {
    const timeoutMs = clampInt(params.timeout_ms || 6000, 1000, 20000);
    const snapshot = latestPmcSnapshot();
    let cached = false;
    let shortageResult;
    let inventoryResult;
    if (params.refresh !== "1") {
      const localAlerts = scopeRowsForUser(listMaterialAlerts({ limit: clampInt(params.pagesize || 100, 1, 500) }), params.auth_user, "material");
      const inventorySummary = scopeRowsForUser(listInventorySummary({ limit: clampInt(params.inventory_limit || 20000, 1, 100000) }), params.auth_user, "inventory");
      const inventoryDetails = scopeRowsForUser(listInventoryDetails({ limit: clampInt(params.inventory_detail_limit || 20000, 1, 100000) }), params.auth_user, "inventory");
      if (localAlerts.length || inventorySummary.length || inventoryDetails.length) {
        const shortageRows = localAlerts.filter((row) => row.alert_type === "shortage");
        const stockAlerts = buildLocalInventoryAlerts({
          inventorySummary,
          inventoryDetails,
          lowStockThreshold: parseNumber(params.low_stock_threshold) ?? 5,
          oldStockDays: parseNumber(params.old_stock_days) ?? 180
        });
        const lowStockRows = mergeMaterialRows(localAlerts.filter((row) => row.alert_type === "low_stock"), stockAlerts.lowStockRows);
        const materialTasks = buildMaterialTasks({ shortageRows, lowStockRows, frozenStockRows: stockAlerts.frozenStockRows, oldStockRows: stockAlerts.oldStockRows });
        return {
          header: { status: 0, message: "ok" },
          body: {
            model: "material_control",
            generated_at: new Date().toISOString(),
            cached: true,
            summary: {
              material_tasks: materialTasks.length,
              urgent_material_tasks: materialTasks.filter((row) => row.priority === "高").length,
              shortage_orders: uniqueCount(shortageRows, "order_no"),
              shortage_rows: shortageRows.length,
              low_stock: lowStockRows.length,
              frozen_stock: stockAlerts.frozenStockRows.length,
              old_stock: stockAlerts.oldStockRows.length,
              source_errors: 0
            },
            sections: {
              material_tasks: materialTasks,
              shortage_rows: shortageRows,
              low_stock: lowStockRows,
              frozen_stock: stockAlerts.frozenStockRows,
              old_stock: stockAlerts.oldStockRows
            },
            source_status: {
              sqlite_material_alerts: { ok: true, rows: localAlerts.length },
              sqlite_inventory_summary: { ok: true, rows: inventorySummary.length },
              sqlite_inventory_details: { ok: true, rows: inventoryDetails.length }
            },
            notes: [
              "当前读取本地 SQLite 物料告警、库存余额和库存明细。",
              "低库存、冻结库存和长库龄由本地库存表重算；缺料仍沿用销售订单产品库存告警。"
            ]
          }
        };
      }
    }

    if (snapshot && params.refresh !== "1") {
      cached = true;
      shortageResult = { status: "rejected", reason: new Error("使用本地快照") };
      inventoryResult = { status: "rejected", reason: new Error("使用本地快照") };
    } else if (erpProtectionMode && params.refresh !== "1" && !params.searchKey) {
      return {
        header: { status: 0, message: "ok" },
        body: emptyMaterialControlBody("ERP保护模式已开启，物料中心未找到本地 SQLite/快照数据时不再自动请求 ERP。")
      };
    } else {
      [shortageResult, inventoryResult] = await Promise.allSettled([
        withTimeout(queryOrderShortages(client, {
          pageindex: params.pageindex || 1,
          pagesize: params.pagesize || 10,
          contract_limit: params.contract_limit || 5,
          scan_size: params.scan_size || 100,
          cks: params.cks || ""
        }), timeoutMs),
        withTimeout(client.queryInventoryAlerts({
          scan_pages: params.scan_pages || 1,
          scan_size: params.inventory_scan_size || params.scan_size || 20,
          alert_limit: params.alert_limit || 20,
          low_stock_threshold: params.low_stock_threshold || 5,
          old_stock_days: params.old_stock_days || 180,
          cks: params.cks || ""
        }), timeoutMs)
      ]);
    }
    let shortageRows = shortageResult.status === "fulfilled" ? shortageResult.value?.body?.rows || [] : [];
    let lowStockRows = inventoryResult.status === "fulfilled" ? inventoryResult.value?.body?.sections?.low_stock || [] : [];
    let frozenStockRows = inventoryResult.status === "fulfilled" ? inventoryResult.value?.body?.sections?.frozen_stock || [] : [];
    let oldStockRows = inventoryResult.status === "fulfilled" ? inventoryResult.value?.body?.sections?.old_stock || [] : [];
    if ((cached || shortageResult.status === "rejected" || inventoryResult.status === "rejected") && snapshot) {
      cached = true;
      shortageRows = shortageRows.length ? shortageRows : snapshot.payload?.sections?.shortage_orders || [];
      lowStockRows = lowStockRows.length ? lowStockRows : snapshot.payload?.sections?.low_stock || [];
    }
    shortageRows = scopeRowsForUser(shortageRows, params.auth_user, "material");
    lowStockRows = scopeRowsForUser(lowStockRows, params.auth_user, "material");
    frozenStockRows = scopeRowsForUser(frozenStockRows, params.auth_user, "inventory");
    oldStockRows = scopeRowsForUser(oldStockRows, params.auth_user, "inventory");
    const materialTasks = buildMaterialTasks({ shortageRows, lowStockRows, frozenStockRows, oldStockRows });
    const sourceStatus = {
      order_shortages: {
        ok: shortageResult.status === "fulfilled" || cached,
        message: shortageResult.status === "rejected" && !cached ? summarizeDataSourceError(shortageResult.reason) : null
      },
      inventory_alerts: {
        ok: inventoryResult.status === "fulfilled" || cached,
        message: inventoryResult.status === "rejected" && !cached ? summarizeDataSourceError(inventoryResult.reason) : null
      }
    };
    const sourceNotes = Object.entries(sourceStatus)
      .filter(([, status]) => !status.ok)
      .map(([name, status]) => `${name} 数据源暂不可用：${status.message}`);
    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "material_control",
        generated_at: new Date().toISOString(),
        cached,
        summary: {
          material_tasks: materialTasks.length,
          urgent_material_tasks: materialTasks.filter((row) => row.priority === "高").length,
          shortage_orders: uniqueCount(shortageRows, "order_no"),
          shortage_rows: shortageRows.length,
          low_stock: lowStockRows.length,
          frozen_stock: frozenStockRows.length,
          old_stock: oldStockRows.length,
          source_errors: sourceNotes.length
        },
        sections: {
          material_tasks: materialTasks,
          shortage_rows: shortageRows,
          low_stock: lowStockRows,
          frozen_stock: frozenStockRows,
          old_stock: oldStockRows
        },
        source_status: sourceStatus,
        notes: [
          ...sourceNotes,
          ...(cached && snapshot ? [`当前读取本地驾驶舱快照：${formatDateTime(snapshot.created_at)}。`] : []),
          "物料控制中心聚焦缺料订单、低库存、冻结库存和长库龄，并生成统一处理清单。",
          "齐套口径沿用销售订单产品库存，后续可接 BOM 展开和采购在途。"
        ]
      }
    };
  }

  async function queryExceptionCenter(params = {}) {
    if (params.refresh !== "1") {
      const dashboard = queryLocalPmcDashboard(params);
      if (dashboard) {
        const body = enrichExceptionCenterStatus(buildLocalExceptionCenter(dashboard));
        return {
          header: { status: 0, message: "ok" },
          body
        };
      }
    }

    let dashboard;
    let sourceError = null;
    let cached = false;
    const snapshot = latestPmcSnapshot();
    const dashboardParams = {
      scan_pages: params.scan_pages || 1,
      scan_size: params.scan_size || 20,
      contract_limit: params.contract_limit || 5,
      alert_limit: params.alert_limit || 20,
      low_stock_threshold: params.low_stock_threshold || 5,
      old_stock_days: params.old_stock_days || 180,
      due_soon_days: params.due_soon_days || 7
    };
    if (snapshot && params.refresh !== "1") {
      dashboard = { body: snapshot.payload };
      cached = true;
    } else {
      try {
        dashboard = await withTimeout(queryPmcDashboard(dashboardParams), clampInt(params.timeout_ms || 5000, 1000, 15000));
      } catch (error) {
        sourceError = summarizeDataSourceError(error);
        if (snapshot) {
          dashboard = { body: snapshot.payload };
          cached = true;
        }
      }
    }
    const body = dashboard?.body || { summary: {}, sections: {} };
    const tasks = buildExceptionTasks(body.sections || []);
    const exceptionBody = enrichExceptionCenterStatus({
      model: "exception_center",
      generated_at: new Date().toISOString(),
      offline: Boolean(sourceError),
      cached,
      summary: {
        open_tasks: tasks.length,
        critical_tasks: tasks.filter((task) => task.priority === "高").length,
        overdue_orders: body.summary.overdue_delivery_rows || 0,
        due_soon_orders: body.summary.due_soon_delivery_rows || 0,
        shortage_orders: body.summary.order_shortage_orders || 0,
        low_stock: body.summary.low_stock || 0
      },
      sections: {
        overdue_orders: body.sections.overdue_delivery_rows || [],
        due_soon_orders: body.sections.due_soon_delivery_rows || [],
        shortage_rows: body.sections.order_shortage_rows || [],
        low_stock: body.sections.low_stock || [],
        tasks
      },
      source_status: {
        pmc_dashboard: { ok: !sourceError, message: sourceError }
      },
      notes: [
        ...(sourceError ? [`ERP 数据源暂不可用：${sourceError}`] : []),
        ...(cached ? [`当前读取本地驾驶舱快照：${formatDateTime(snapshot.created_at)}。`] : []),
        "PMC 待响应风险把交期、缺料、低库存聚合成统一待办。",
        "每条待办包含优先级、责任角色、处理建议和当前状态。",
        "责任角色按异常类型自动推导；关闭状态和操作日志后续接本地数据库。"
      ]
    });
    return {
      header: { status: 0, message: "ok" },
      body: exceptionBody
    };
  }

  function enrichExceptionCenterStatus(body) {
    const tasks = Array.isArray(body?.sections?.tasks) ? body.sections.tasks : [];
    const relatedNos = tasks.map((row) => row.related_no).filter(Boolean);
    const latestByNo = latestPmcInterventionsByRelatedNos(relatedNos);
    const nextTasks = tasks.map((row) => {
      const latest = latestByNo.get(row.related_no);
      const closure = pmcRiskClosure(row, latest);
      return {
        ...row,
        status: closure.intervention_state,
        intervention_state: closure.intervention_state,
        response_sla: closure.response_sla,
        escalation_state: closure.escalation_state,
        latest_intervention: latest?.action_label || "",
        latest_actor: latest?.actor || "",
        latest_at: latest?.created_at || "",
        closure_overdue: closure.closure_overdue,
        overdue_hours: closure.overdue_hours,
        intervention_log: interventionLogHref(row.related_no),
        intervention_action: pmcInterventionHref(row, row.action || "记录处理")
      };
    });
    const pending = nextTasks.filter((row) => !isInterventionFinal(row.intervention_state)).length;
    return {
      ...body,
      summary: {
        ...(body.summary || {}),
        open_tasks: pending,
        pending_response_tasks: pending,
        overdue_closures: nextTasks.filter((row) => !isInterventionFinal(row.intervention_state) && row.closure_overdue).length,
        responded_tasks: nextTasks.length - pending
      },
      sections: {
        ...(body.sections || {}),
        tasks: nextTasks
      }
    };
  }

  return { enrichExceptionCenterStatus, queryExceptionCenter, queryMaterialControl };
}

function emptyMaterialControlBody(message) {
  return {
    model: "material_control",
    generated_at: new Date().toISOString(),
    cached: true,
    summary: {
      material_tasks: 0,
      urgent_material_tasks: 0,
      shortage_orders: 0,
      shortage_rows: 0,
      low_stock: 0,
      frozen_stock: 0,
      old_stock: 0,
      source_errors: 0
    },
    sections: {
      material_tasks: [],
      shortage_rows: [],
      low_stock: [],
      frozen_stock: [],
      old_stock: []
    },
    source_status: {
      erp_protection_mode: { ok: true, message }
    },
    notes: [
      message,
      "请在 ERP 稳定时点击“谨慎同步物料20条”更新本地物料告警。"
    ]
  };
}

function buildLocalInventoryAlerts({ inventorySummary = [], inventoryDetails = [], lowStockThreshold = 5, oldStockDays = 180 }) {
  const lowStockRows = uniqueMaterialRows(inventorySummary
    .map(normalizeInventoryRow)
    .filter((row) => row.product_code && (parseNumber(row.available_qty) ?? parseNumber(row.stock_qty) ?? 0) <= lowStockThreshold)
    .map((row) => ({
      ...row,
      alert_type: "low_stock",
      priority: (parseNumber(row.available_qty) ?? 0) <= 0 ? "高" : "中"
    })));
  const frozenStockRows = uniqueMaterialRows(inventoryDetails
    .map(normalizeInventoryRow)
    .filter((row) => (parseNumber(row.frozen_qty) || 0) > 0)
    .map((row) => ({ ...row, alert_type: "frozen_stock", priority: "中" })));
  const oldStockRows = uniqueMaterialRows(inventoryDetails
    .map(normalizeInventoryRow)
    .filter((row) => (parseNumber(row.stock_age_days) || 0) >= oldStockDays)
    .map((row) => ({ ...row, alert_type: "old_stock", priority: "低" })));
  return { lowStockRows, frozenStockRows, oldStockRows };
}

function normalizeInventoryRow(row = {}) {
  return {
    product_code: row.product_code || "",
    product_name: row.product_name || "",
    warehouse: row.warehouse || "",
    unit: row.unit || "",
    available_qty: parseNumber(row.available_qty),
    stock_qty: parseNumber(row.stock_qty),
    frozen_qty: parseNumber(row.frozen_qty),
    batch_no: row.batch_no || "",
    initial_inbound_time: row.initial_inbound_time || "",
    stock_age_days: parseNumber(row.stock_age_days)
  };
}

function mergeMaterialRows(...groups) {
  return uniqueMaterialRows(groups.flat());
}

function uniqueMaterialRows(rows = []) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const key = [row.alert_type || "", row.product_code || "", row.warehouse || "", row.batch_no || ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

function buildMaterialTasks({ shortageRows, lowStockRows, frozenStockRows, oldStockRows }) {
  const rows = [
    ...shortageRows.map((row) => ({
      material_task_type: "订单缺料",
      priority: "高",
      related_no: row.order_no,
      customer: row.customer,
      product_code: row.product_code,
      product_name: row.product_name,
      warehouse: row.warehouse,
      demand_qty: row.demand_qty,
      available_qty: row.available_qty,
      shortage_qty: row.shortage_qty,
      responsible_role: "PMC/采购",
      action: "确认替代库存、采购到货或调整排产"
    })),
    ...lowStockRows.map((row) => ({
      material_task_type: "低库存",
      priority: parseNumber(row.available_qty) <= 0 ? "高" : "中",
      related_no: row.product_code,
      customer: "",
      product_code: row.product_code,
      product_name: row.product_name,
      warehouse: row.warehouse,
      demand_qty: "",
      available_qty: row.available_qty,
      shortage_qty: "",
      responsible_role: "PMC/仓库",
      action: "确认安全库存和补料需求"
    })),
    ...frozenStockRows.map((row) => ({
      material_task_type: "冻结库存",
      priority: "中",
      related_no: row.product_code,
      customer: "",
      product_code: row.product_code,
      product_name: row.product_name,
      warehouse: row.warehouse,
      demand_qty: "",
      available_qty: row.available_qty,
      shortage_qty: "",
      responsible_role: "仓库/财务",
      action: "确认冻结原因并判断是否可释放"
    })),
    ...oldStockRows.map((row) => ({
      material_task_type: "长库龄",
      priority: "低",
      related_no: row.product_code,
      customer: "",
      product_code: row.product_code,
      product_name: row.product_name,
      warehouse: row.warehouse,
      demand_qty: "",
      available_qty: row.available_qty,
      shortage_qty: "",
      responsible_role: "PMC/仓库",
      action: "评估消耗计划或呆滞处理"
    }))
  ];
  return rows
    .sort((a, b) => materialPriorityWeight(b.priority) - materialPriorityWeight(a.priority) || (parseNumber(b.shortage_qty) || 0) - (parseNumber(a.shortage_qty) || 0))
    .slice(0, 80)
    .map((row, index) => ({ material_task_no: `WL-${String(index + 1).padStart(3, "0")}`, ...row }));
}

function materialPriorityWeight(priority) {
  if (priority === "高") {
    return 3;
  }
  if (priority === "中") {
    return 2;
  }
  return 1;
}

function buildExceptionTasks(sections) {
  const tasks = [
    ...exceptionTasksFromDelivery(sections.overdue_delivery_rows || [], "交期逾期"),
    ...exceptionTasksFromDelivery(sections.due_soon_delivery_rows || [], "临期交付"),
    ...exceptionTasksFromShortage(sections.order_shortage_rows || []),
    ...exceptionTasksFromLowStock(sections.low_stock || [])
  ];
  return tasks
    .sort((a, b) => exceptionPriorityWeight(b.priority) - exceptionPriorityWeight(a.priority) || String(a.due_date || "").localeCompare(String(b.due_date || "")))
    .slice(0, 80)
    .map((task, index) => ({ task_no: `PMC-${String(index + 1).padStart(3, "0")}`, ...task }));
}

function exceptionTasksFromDelivery(rows, type) {
  return rows.map((row) => {
    const days = parseNumber(row.days_from_today);
    const overdue = days !== null && days < 0;
    return {
      exception_type: type,
      priority: overdue ? "高" : "中",
      related_no: row.order_no,
      customer: row.customer,
      item: row.product_name || row.product_code,
      quantity: row.remaining_qty,
      due_date: row.delivery_date,
      responsible_role: overdue ? "PMC/销售" : "PMC",
      action: overdue ? "确认延期原因并同步客户交期" : "跟进生产与发货准备",
      status: "待处理"
    };
  });
}

function exceptionTasksFromShortage(rows) {
  return rows.map((row) => ({
    exception_type: "订单缺料",
    priority: "高",
    related_no: row.order_no,
    customer: row.customer,
    item: row.product_name || row.product_code,
    quantity: row.shortage_qty,
    due_date: row.delivery_date,
    responsible_role: "PMC/采购",
    action: "确认替代库存、采购到货或调整排产",
    status: "待处理"
  }));
}

function exceptionTasksFromLowStock(rows) {
  return rows.map((row) => ({
    exception_type: "低库存",
    priority: parseNumber(row.available_qty) <= 0 ? "高" : "中",
    related_no: row.product_code,
    customer: "",
    item: row.product_name,
    quantity: row.available_qty,
    due_date: "",
    responsible_role: "PMC/仓库",
    action: "确认安全库存、冻结量和补料需求",
    status: "待处理"
  }));
}

function exceptionPriorityWeight(priority) {
  if (priority === "高") {
    return 3;
  }
  if (priority === "中") {
    return 2;
  }
  return 1;
}

function uniqueCount(rows, key) {
  return new Set(rows.map((row) => row[key]).filter(Boolean)).size;
}
