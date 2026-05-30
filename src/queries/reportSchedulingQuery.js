import { clampInt, daysBetween, formatDate, formatDateTime, parseDate, startOfDay } from "../displayUtils.js";

export function createReportSchedulingQueries({
  buildLocalExceptionCenter,
  enrichExceptionCenterStatus,
  enrichPmcInterventionStatus,
  latestPmcSnapshot,
  pmcInterventionSummary,
  queryLocalPmcDashboard,
  queryOrderCenter,
  queryPmcConsole,
  summarizeDataSourceError,
  withTimeout
}) {
  async function queryReportCenter(params = {}) {
    if (params.refresh !== "1") {
      const consoleBody = queryLocalPmcDashboard(params);
      if (consoleBody) {
        const enrichedConsoleBody = enrichPmcInterventionStatus(consoleBody);
        const orderCenter = await queryOrderCenter({
          pageindex: params.pageindex || 1,
          pagesize: params.pagesize || 20,
          contract_limit: params.contract_limit || 5,
          due_soon_days: params.due_soon_days || 7,
          auth_user: params.auth_user
        });
        const exceptions = enrichExceptionCenterStatus(buildLocalExceptionCenter(enrichedConsoleBody));
        const interventionSummary = pmcInterventionSummary({ today: new Date(), limit: 8 });
        return {
          header: { status: 0, message: "ok" },
          body: {
            model: "report_center",
            generated_at: new Date().toISOString(),
            cached: true,
            summary: {
              today_orders: enrichedConsoleBody.summary.today_orders,
              month_orders: enrichedConsoleBody.summary.month_orders,
              red_orders: orderCenter.body.summary.red_orders,
              yellow_orders: orderCenter.body.summary.yellow_orders,
              green_orders: orderCenter.body.summary.green_orders,
              shortage_orders: orderCenter.body.summary.shortage_orders,
              due_soon_orders: enrichedConsoleBody.summary.due_soon_orders,
              low_stock: enrichedConsoleBody.summary.low_stock,
              pending_response_tasks: exceptions.summary.pending_response_tasks || 0,
              closed_tasks: exceptions.summary.responded_tasks || 0,
              responded_tasks: exceptions.summary.responded_tasks || 0,
              today_interventions: interventionSummary.today_actions || 0,
              result_types: interventionSummary.by_result_type.length,
              incomplete_closures: interventionSummary.incomplete_closures,
              suggestions: interventionSummary.improvement_suggestions.length,
              morning_brief_items: (enrichedConsoleBody.sections.morning_brief || []).length
            },
            sections: {
              morning_brief: enrichedConsoleBody.sections.morning_brief || [],
              order_rows: orderCenter.body.rows,
              low_stock: enrichedConsoleBody.sections.low_stock,
              exception_tasks: exceptions.sections.tasks,
              intervention_actions: interventionSummary.recent_actions,
              intervention_result_types: interventionSummary.by_result_type,
              intervention_closure_quality: interventionSummary.by_closure_quality,
              improvement_suggestions: interventionSummary.improvement_suggestions
            },
            notes: [
              "当前报表读取本地 SQLite 汇总。",
              "ERP 不可用时，报表继续使用最近同步成功的数据。"
            ]
          }
        };
      }
    }

    const [consoleData, orderCenter] = await Promise.all([
      queryPmcConsole({ ...params, refresh: params.refresh || "" }),
      queryOrderCenter({
        pageindex: params.pageindex || 1,
        pagesize: params.pagesize || 20,
        contract_limit: params.contract_limit || 5,
        due_soon_days: params.due_soon_days || 7,
        auth_user: params.auth_user
      })
    ]);
    const enrichedConsoleBody = enrichPmcInterventionStatus(consoleData.body);
    const exceptions = enrichExceptionCenterStatus(buildLocalExceptionCenter(enrichedConsoleBody));
    const interventionSummary = pmcInterventionSummary({ today: new Date(), limit: 8 });
    const sourceNotes = [
      ...(consoleData.body.offline ? ["驾驶舱实时数据源暂不可用，报表使用本地快照或空数据。"] : []),
      ...(orderCenter.body.offline ? ["订单中心实时数据源暂不可用，订单状态样本为空。"] : [])
    ];
    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "report_center",
        generated_at: new Date().toISOString(),
        summary: {
          today_orders: enrichedConsoleBody.summary.today_orders,
          month_orders: enrichedConsoleBody.summary.month_orders,
          red_orders: orderCenter.body.summary.red_orders,
          yellow_orders: orderCenter.body.summary.yellow_orders,
          green_orders: orderCenter.body.summary.green_orders,
          shortage_orders: orderCenter.body.summary.shortage_orders,
          due_soon_orders: enrichedConsoleBody.summary.due_soon_orders,
          low_stock: enrichedConsoleBody.summary.low_stock,
          pending_response_tasks: exceptions.summary.pending_response_tasks || 0,
          closed_tasks: exceptions.summary.responded_tasks || 0,
          responded_tasks: exceptions.summary.responded_tasks || 0,
          today_interventions: interventionSummary.today_actions || 0,
          result_types: interventionSummary.by_result_type.length,
          incomplete_closures: interventionSummary.incomplete_closures,
          suggestions: interventionSummary.improvement_suggestions.length,
          morning_brief_items: (enrichedConsoleBody.sections.morning_brief || []).length
        },
        sections: {
          morning_brief: enrichedConsoleBody.sections.morning_brief || [],
          order_rows: orderCenter.body.rows,
          low_stock: enrichedConsoleBody.sections.low_stock,
          exception_tasks: exceptions.sections.tasks,
          intervention_actions: interventionSummary.recent_actions,
          intervention_result_types: interventionSummary.by_result_type,
          intervention_closure_quality: interventionSummary.by_closure_quality,
          improvement_suggestions: interventionSummary.improvement_suggestions
        },
        notes: [
          ...sourceNotes,
          "报表中心提供可浏览指标、打印版、CSV 导出和 Excel 日报导出。",
          "月报模板、供应商绩效和设备利用率需要在后续阶段补齐。"
        ]
      }
    };
  }

  async function querySchedulingCenter(params = {}) {
    const horizonDays = clampInt(params.horizon_days || 30, 7, 90);
    const today = startOfDay(params.today ? new Date(params.today) : new Date());
    const snapshot = latestPmcSnapshot();
    let orderCenter = null;
    let cached = false;
    let sourceError = null;
    if (snapshot && params.refresh !== "1") {
      cached = true;
    } else {
      try {
        orderCenter = await withTimeout(queryOrderCenter({
          pageindex: params.pageindex || 1,
          pagesize: params.pagesize || 30,
          contract_limit: params.contract_limit || 10,
          due_soon_days: params.due_soon_days || 7,
          scan_size: params.scan_size || 100,
          searchKey: params.searchKey || "",
          auth_user: params.auth_user
        }), clampInt(params.timeout_ms || 8000, 1000, 20000));
      } catch (error) {
        sourceError = summarizeDataSourceError(error);
        cached = Boolean(snapshot);
      }
    }
    const sourceRows = orderCenter?.body?.rows || (cached && snapshot ? scheduleRowsFromSnapshot(snapshot.payload) : []);
    const items = sourceRows.map((row) => mapScheduleItem(row, today, horizonDays));
    const visibleItems = items.filter((item) => item.in_window || item.status_code !== "green").slice(0, 30);
    const pressureRows = schedulePressureBuckets(items);
    const impactRows = scheduleImpactRows(visibleItems);

    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "scheduling_center",
        generated_at: new Date().toISOString(),
        offline: Boolean(orderCenter?.body?.offline || sourceError),
        cached,
        scan: {
          today: formatDate(today),
          horizon_days: horizonDays
        },
        summary: {
          schedule_items: visibleItems.length,
          red_orders: visibleItems.filter((item) => item.status_code === "red").length,
          yellow_orders: visibleItems.filter((item) => item.status_code === "yellow").length,
          no_delivery_date: items.filter((item) => !item.delivery_date).length,
          high_impact_orders: impactRows.filter((row) => row.impact_level === "高").length,
          this_week_orders: pressureRows.find((row) => row.bucket === "7天内")?.order_count || 0
        },
        rows: visibleItems,
        sections: {
          pressure_buckets: pressureRows,
          impact_rows: impactRows
        },
        source_status: orderCenter?.body?.source_status || {
          order_center: { ok: !sourceError && !cached, message: sourceError }
        },
        notes: [
          ...(orderCenter?.body?.offline ? orderCenter.body.notes || [] : []),
          ...(sourceError ? [`订单实时扫描暂不可用：${sourceError}`] : []),
          ...(cached && snapshot ? [`当前读取本地驾驶舱快照：${formatDateTime(snapshot.created_at)}。`] : []),
          "排产甘特视图按订单最近交期生成时间轴，并推导交期压力与插单影响。",
          "当前不回写 ERP；后续接工单、设备、工序计划和产能后，再升级为可拖拽排产。"
        ]
      }
    };
  }

  return { queryReportCenter, querySchedulingCenter };
}

function scheduleRowsFromSnapshot(payload) {
  const rows = [
    ...(payload?.sections?.overdue_orders || []),
    ...(payload?.sections?.due_soon_orders || []),
    ...(payload?.sections?.shortage_orders || [])
  ];
  const seen = new Set();
  return rows.filter((row) => {
    const key = row.order_no || `${row.customer || ""}-${row.product_name || ""}-${row.delivery_date || ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function mapScheduleItem(row, today, horizonDays) {
  const delivery = parseDate(row.delivery_date);
  const days = delivery ? daysBetween(today, startOfDay(delivery)) : null;
  const clamped = days === null ? horizonDays : Math.max(0, Math.min(horizonDays, days));
  return {
    order_no: row.order_no,
    customer: row.customer,
    owner: row.owner,
    product_name: Array.isArray(row.risk_products) ? row.risk_products.join(" / ") : row.product_name || row.product_code || "",
    delivery_date: row.delivery_date,
    days_from_today: days,
    due_status: row.due_status || row.risk_type || "",
    shortage_status: row.shortage_status || (row.shortage_qty ? "缺料" : ""),
    status_code: row.status_code || (days !== null && days < 0 ? "red" : days !== null && days <= 7 ? "yellow" : "green"),
    status_text: row.status_text || (days !== null && days < 0 ? "紧急" : days !== null && days <= 7 ? "预警" : "正常"),
    impact_level: scheduleImpactLevel(days, row),
    schedule_advice: scheduleAdvice(days, row),
    timeline_left: Math.round((clamped / horizonDays) * 100),
    in_window: days !== null && days >= 0 && days <= horizonDays
  };
}

function schedulePressureBuckets(items) {
  const buckets = [
    { bucket: "已逾期", min: Number.NEGATIVE_INFINITY, max: -1 },
    { bucket: "7天内", min: 0, max: 7 },
    { bucket: "8-14天", min: 8, max: 14 },
    { bucket: "15-30天", min: 15, max: 30 },
    { bucket: "30天后", min: 31, max: Number.POSITIVE_INFINITY },
    { bucket: "无交期", noDate: true }
  ];
  return buckets.map((bucket) => {
    const rows = bucket.noDate
      ? items.filter((item) => item.days_from_today === null)
      : items.filter((item) => item.days_from_today !== null && item.days_from_today >= bucket.min && item.days_from_today <= bucket.max);
    return {
      bucket: bucket.bucket,
      order_count: rows.length,
      red_orders: rows.filter((row) => row.status_code === "red").length,
      yellow_orders: rows.filter((row) => row.status_code === "yellow").length,
      shortage_orders: rows.filter((row) => /缺料|短缺/.test(String(row.shortage_status || ""))).length,
      action: scheduleBucketAction(bucket.bucket, rows)
    };
  });
}

function scheduleImpactRows(rows) {
  return rows
    .map((row) => ({
      order_no: row.order_no,
      customer: row.customer,
      owner: row.owner,
      product_name: row.product_name,
      delivery_date: row.delivery_date,
      days_from_today: row.days_from_today,
      due_status: row.due_status,
      shortage_status: row.shortage_status,
      impact_level: row.impact_level,
      schedule_advice: row.schedule_advice
    }))
    .sort((a, b) => scheduleImpactWeight(b.impact_level) - scheduleImpactWeight(a.impact_level) || (a.days_from_today ?? 9999) - (b.days_from_today ?? 9999));
}

function scheduleImpactLevel(days, row) {
  if (days !== null && days < 0) {
    return "高";
  }
  if (/缺料|短缺/.test(String(row.shortage_status || ""))) {
    return "高";
  }
  if (days !== null && days <= 7) {
    return "中";
  }
  return "低";
}

function scheduleAdvice(days, row) {
  if (days !== null && days < 0) {
    return "先确认延期原因，必要时重排并同步销售";
  }
  if (/缺料|短缺/.test(String(row.shortage_status || ""))) {
    return "先解除缺料，再安排生产窗口";
  }
  if (days !== null && days <= 7) {
    return "锁定本周资源，避免插单冲突";
  }
  if (days === null) {
    return "补充交期后再进入排产";
  }
  return "按交期窗口滚动排产";
}

function scheduleBucketAction(bucket, rows) {
  if (!rows.length) {
    return "暂无处理";
  }
  if (bucket === "已逾期") {
    return "优先复盘并同步销售/客户";
  }
  if (bucket === "7天内") {
    return "锁定设备、物料和发货资源";
  }
  if (bucket === "无交期") {
    return "补齐承诺交期";
  }
  return "滚动关注，准备插单影响评估";
}

function scheduleImpactWeight(level) {
  if (level === "高") {
    return 3;
  }
  if (level === "中") {
    return 2;
  }
  return 1;
}
