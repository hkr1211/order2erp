export function createOperationsPageRenderers({ modulePage, modulePanel, escapeHtml }) {
  function materialControlPage(body) {
    return modulePage({
      title: "物料控制中心",
      subtitle: "按销售订单产品库存计算缺料，并把低库存、冻结、长库龄统一成物料处理清单。",
      summary: [
        ["物料任务", body.summary.material_tasks],
        ["紧急任务", body.summary.urgent_material_tasks],
        ["缺料订单", body.summary.shortage_orders],
        ["缺料明细", body.summary.shortage_rows],
        ["低库存", body.summary.low_stock],
        ["冻结库存", body.summary.frozen_stock],
        ["长库龄", body.summary.old_stock],
        ["数据源异常", body.summary.source_errors]
      ],
      panels: [
        modulePanel("物料处理清单", body.sections.material_tasks, ["material_task_no", "priority", "material_task_type", "related_no", "customer", "product_name", "product_code", "warehouse", "demand_qty", "available_qty", "shortage_qty", "responsible_role", "action"], { fullWidth: true, ...mobilePanel("material_task_no", ["priority", "material_task_type", "related_no"]) }),
        modulePanel("缺料明细", body.sections.shortage_rows, ["order_no", "customer", "product_name", "product_code", "demand_qty", "available_qty", "shortage_qty"], mobilePanel("order_no", ["customer", "shortage_qty"])),
        modulePanel("低库存预警", body.sections.low_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"], mobilePanel("product_code", ["warehouse", "available_qty"])),
        modulePanel("冻结库存", body.sections.frozen_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"], mobilePanel("product_code", ["warehouse", "stock_qty"])),
        modulePanel("长库龄库存", body.sections.old_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"], mobilePanel("product_code", ["warehouse", "stock_qty"]))
      ],
      notes: body.notes,
      actions: [["采购跟催", "/procurement"], ["谨慎同步物料20条", "/sync?sources=material_alerts&pagesize=20&scan_size=20&contract_limit=3"], ["刷新实时ERP", "/materials?refresh=1"]]
    });
  }

  function quoteCenterPage(body) {
    return modulePage({
      title: "待报价中心",
      subtitle: "集中查看项目/商机中的待报价项目，按优先级生成销售报价跟进池。",
      summary: [
        ["扫描项目", body.summary.scanned_projects],
        ["待报价项目", body.summary.pending_quote_projects],
        ["报价跟进", body.summary.quote_followups],
        ["紧急报价", body.summary.urgent_quotes],
        ["负责人数", body.summary.owner_count]
      ],
      panels: [
        modulePanel("报价跟进池", body.sections.quote_followups, ["quote_no", "priority", "quote_status", "customer", "title", "owner", "project_stage", "estimated_amount", "quoted_amount", "created_date", "age_days", "action"]),
        modulePanel("负责人汇总", body.sections.owner_summary, ["owner", "quote_followups", "urgent_quotes", "estimated_amount", "max_age_days", "latest_action"])
      ],
      notes: body.notes,
      actions: [["谨慎同步报价20条", "/sync?sources=quote_projects&pagesize=20&limit=20"], ["刷新实时ERP", "/quotes?refresh=1"]]
    });
  }

  function foreignTradeBoardPage(body) {
    return modulePage({
      title: "外贸订单看板",
      subtitle: "按外贸出口和非 RMB 币种识别订单，集中查看发货、收款、审批和缺料风险。",
      summary: [
        ["外贸订单", body.summary.foreign_orders],
        ["USD金额", body.summary.usd_amount],
        ["未发货", body.summary.unshipped_orders],
        ["未收款", body.summary.unpaid_orders],
        ["待审批", body.summary.pending_approval_orders],
        ["缺料订单", body.summary.shortage_orders],
        ["客户数", body.summary.customers]
      ],
      panels: [
        modulePanel("外贸风险订单", body.sections.risk_orders, ["risk_flags", "order_no", "customer", "owner", "currency", "amount", "signed_date", "warehouse_status", "delivery_status", "payment_status", "approval_status"], { fullWidth: true }),
        modulePanel("外贸订单列表", body.sections.order_rows, ["order_no", "customer", "owner", "currency", "category", "amount", "signed_date", "warehouse_status", "delivery_status", "payment_status", "invoice_status", "approval_status"], { fullWidth: true }),
        modulePanel("外贸缺料明细", body.sections.shortage_rows, ["order_no", "customer", "product_name", "product_code", "demand_qty", "available_qty", "shortage_qty", "unit"], { fullWidth: true }),
        modulePanel("负责人汇总", body.sections.owner_summary, ["owner", "foreign_orders", "usd_amount", "unshipped_orders", "unpaid_orders", "shortage_orders"]),
        modulePanel("客户/国家汇总", body.sections.customer_summary, ["customer", "foreign_orders", "usd_amount", "latest_signed_date"])
      ],
      notes: body.notes,
      actions: [["订单中心", "/orders"], ["物料中心", "/materials"], ["谨慎同步订单20条", "/sync?sources=sales_orders&pagesize=20"]]
    });
  }

  function procurementCenterPage(body) {
    return modulePage({
      title: "采购跟催中心",
      subtitle: "默认读取本地 SQLite 采购订单、供应商档案和应付数据，生成到货、付款和供应商跟催清单。",
      summary: [
        ["跟催事项", body.summary.followup_tasks],
        ["紧急跟催", body.summary.urgent_followups],
        ["采购订单", body.summary.purchase_orders || 0],
        ["入库记录", body.summary.inbound_records],
        ["应付记录", body.summary.payable_records],
        ["供应商数", body.summary.supplier_count],
        ["数据源异常", body.summary.source_errors]
      ],
      panels: [
        modulePanel("采购跟催清单", body.sections.followups, ["followup_no", "priority", "followup_type", "supplier", "related_no", "item", "quantity", "amount", "status", "due_date", "age_days", "responsible_role", "action"], { fullWidth: true, ...mobilePanel("followup_no", ["priority", "supplier", "due_date"]) }),
        modulePanel("采购订单", body.sections.purchase_orders || [], ["purchase_no", "supplier", "supplier_contact", "supplier_phone", "title", "buyer", "amount", "order_date", "expected_arrival_date", "due_days", "status"], { fullWidth: true, ...mobilePanel("purchase_no", ["supplier", "expected_arrival_date"]) }),
        modulePanel("供应商跟催汇总", body.sections.suppliers, ["supplier", "followup_tasks", "urgent_followups", "unpaid_amount", "latest_action"], mobilePanel("supplier", ["urgent_followups", "unpaid_amount"])),
        modulePanel("采购到货/入库记录", body.sections.stock_in_records, ["receipt_no", "title", "quantity", "receipt_status", "receipt_type", "warehouse_keeper", "applicant", "confirmed_time"], mobilePanel("receipt_no", ["receipt_status", "confirmed_time"])),
        modulePanel("应付/付款记录", body.sections.payables, ["counterparty", "bill_no", "business_title", "amount", "paid_amount", "unpaid_amount", "due_date", "risk_status", "owner"], mobilePanel("counterparty", ["bill_no", "risk_status"]))
      ],
      notes: body.notes,
      actions: [
        ["同步采购订单", "/history-sync/window?source=purchase_orders&pagesize=20&max_pages=2"],
        ["同步供应商", "/history-sync/window?source=suppliers&pagesize=20&max_pages=2"],
        ["刷新实时ERP", "/procurement?refresh=1"]
      ]
    });
  }

  function schedulingCenterPage(body) {
    return modulePage({
      title: "排产甘特视图",
      subtitle: `按订单最近交期生成 ${body.scan.horizon_days} 天时间轴，先看交期压力和缺料风险。`,
      summary: [
        ["时间轴订单", body.summary.schedule_items],
        ["红灯订单", body.summary.red_orders],
        ["黄灯订单", body.summary.yellow_orders],
        ["高影响订单", body.summary.high_impact_orders],
        ["7天内订单", body.summary.this_week_orders],
        ["无交期", body.summary.no_delivery_date]
      ],
      panels: [
        scheduleTimelinePanel(body.rows, body.scan.horizon_days),
        modulePanel("交期压力分布", body.sections.pressure_buckets, ["bucket", "order_count", "red_orders", "yellow_orders", "shortage_orders", "action"]),
        modulePanel("插单影响评估", body.sections.impact_rows, ["impact_level", "order_no", "customer", "owner", "product_name", "delivery_date", "due_status", "shortage_status", "schedule_advice"]),
        modulePanel("排产订单列表", body.rows, ["status_text", "order_no", "customer", "owner", "delivery_date", "due_status", "shortage_status", "schedule_advice"])
      ],
      notes: body.notes,
      actions: [
        ["订单中心", "/orders"],
        ["刷新", "/scheduling?refresh=1"]
      ]
    });
  }

  function scheduleTimelinePanel(rows, horizonDays) {
    const safeRows = Array.isArray(rows) ? rows : [];
    return `<section class="panel">
      <h2>交期时间轴 <span class="pill">${safeRows.length}</span></h2>
      ${
        safeRows.length
          ? `<div class="timeline">${timelineScale(horizonDays)}${safeRows.map(scheduleTimelineRow).join("")}</div>`
          : `<div class="empty">当前没有可排入时间轴的订单。</div>`
      }
    </section>`;
  }

  function timelineScale(horizonDays) {
    const marks = [0, Math.round(horizonDays / 4), Math.round(horizonDays / 2), Math.round((horizonDays * 3) / 4), horizonDays];
    return `<div class="timeline-scale">${marks.map((day) => `<span style="left:${Math.round((day / horizonDays) * 100)}%">${day}天</span>`).join("")}</div>`;
  }

  function scheduleTimelineRow(row) {
    const tone = row.status_code === "red" ? "red" : row.status_code === "yellow" ? "yellow" : "green";
    const left = row.delivery_date ? row.timeline_left : 100;
    return `<div class="timeline-row">
      <div class="timeline-label">
        <strong>${escapeHtml(row.order_no || "")}</strong>
        <span>${escapeHtml(row.customer || "")}</span>
      </div>
      <div class="timeline-track">
        <span class="timeline-dot ${tone}" style="left:${left}%"></span>
        <span class="timeline-text" style="left:${Math.max(0, Math.min(78, left))}%">${escapeHtml(row.delivery_date || "无交期")}</span>
      </div>
    </div>`;
  }

  function productionCenterPage(body) {
    return modulePage({
      title: "生产进度中心",
      subtitle: "聚合 ERP 生产进度、领料、BOM 和工序计划，识别延期工序与工作中心负荷。",
      summary: [
        ["生产进度", body.summary.progress_rows],
        ["领料记录", body.summary.material_order_rows],
        ["BOM记录", body.summary.bom_rows],
        ["工序计划", body.summary.procedure_plan_rows],
        ["延期工序", body.summary.delayed_procedures],
        ["工作中心", body.summary.work_centers],
        ["数据源异常", body.summary.source_errors]
      ],
      panels: [
        modulePanel("延期工序", body.sections.delayed_procedures, ["work_assignment_id", "order_no", "product_name", "procedure_name", "work_center_name", "remaining_qty", "planned_finish_date", "owner", "state"], { fullWidth: true, ...mobilePanel("work_assignment_id", ["order_no", "procedure_name", "planned_finish_date"]) }),
        modulePanel("工作中心负荷", body.sections.workload_by_center, ["work_center_name", "procedure_count", "planned_qty", "finished_qty", "remaining_qty", "delayed_procedures"], mobilePanel("work_center_name", ["delayed_procedures", "remaining_qty"])),
        modulePanel("生产进度", body.sections.progress, ["orderNo", "productName", "procedureName", "planNum", "finishNum", "state"], mobilePanel("orderNo", ["procedureName", "state"])),
        modulePanel("领料记录", body.sections.material_orders, ["orderNo", "productName", "materialName", "num", "state"], mobilePanel("orderNo", ["materialName", "state"])),
        modulePanel("BOM 数据", body.sections.boms, ["bom_no", "bom_title", "parent_product", "effective_status", "enabled_status", "bom_type", "customer_scope", "owner", "created_date"], mobilePanel("bom_no", ["parent_product", "enabled_status"])),
        modulePanel("工序计划", body.sections.procedure_plans, ["work_assignment_id", "order_no", "product_name", "procedure_name", "work_center_name", "planned_qty", "finished_qty", "remaining_qty", "planned_start_date", "planned_finish_date", "owner"], { fullWidth: true, ...mobilePanel("work_assignment_id", ["order_no", "procedure_name", "planned_finish_date"], 16) })
      ],
      notes: body.notes,
      actions: [["谨慎同步工序20条", "/sync?sources=procedure_plans&pagesize=20"], ["派工追踪", "/dispatch"], ["刷新实时ERP", "/production?refresh=1"]]
    });
  }

  function dispatchTrackingPage(body) {
    return modulePage({
      title: "派工进度追踪",
      subtitle: "基于 ERP 工序计划表显示派工单ID、工序、计划起止、完成数量、剩余数量和延期状态。",
      summary: [
        ["派工记录", body.summary.procedure_plan_rows],
        ["延期派工", body.summary.delayed_procedures],
        ["工作中心", body.summary.work_centers],
        ["生产进度", body.summary.progress_rows],
        ["数据源异常", body.summary.source_errors]
      ],
      panels: [
        modulePanel("延期派工", body.sections.delayed_procedures, ["work_assignment_id", "order_no", "product_name", "procedure_name", "work_center_name", "remaining_qty", "planned_finish_date", "owner", "state"]),
        modulePanel("派工进度追踪表", body.sections.procedure_plans, ["work_assignment_id", "order_no", "product_name", "procedure_name", "work_center_name", "planned_qty", "finished_qty", "remaining_qty", "planned_start_date", "planned_finish_date", "owner", "state"]),
        modulePanel("工作中心负荷", body.sections.workload_by_center, ["work_center_name", "procedure_count", "planned_qty", "finished_qty", "remaining_qty", "delayed_procedures"]),
        modulePanel("ERP生产进度原始表", body.sections.progress, ["orderNo", "productName", "procedureName", "planNum", "finishNum", "state"])
      ],
      notes: [
        ...body.notes,
        "当前 ERP 的 production_progress 接口返回 0 行时，本页优先使用 procedure_plans 工序计划作为派工追踪主数据。"
      ],
      actions: [["谨慎同步工序20条", "/sync?sources=procedure_plans&pagesize=20"], ["返回生产中心", "/production"], ["刷新实时ERP", "/dispatch?refresh=1"]]
    });
  }

  function exceptionCenterPage(body) {
    return modulePage({
      title: "异常管理中心",
      subtitle: "把交期、缺料、待报价、库存异常统一成按优先级排序的 PMC 待办池。",
      summary: [
        ["未关闭待办", body.summary.open_tasks],
        ["超时未闭环", body.summary.overdue_closures || 0],
        ["已响应", body.summary.responded_tasks || 0],
        ["高优先级", body.summary.critical_tasks],
        ["逾期订单", body.summary.overdue_orders],
        ["7天内交期", body.summary.due_soon_orders],
        ["缺料订单", body.summary.shortage_orders],
        ["待报价", body.summary.pending_quotes],
        ["低库存", body.summary.low_stock]
      ],
      panels: [
        modulePanel("统一异常待办", body.sections.tasks, ["task_no", "priority", "exception_type", "related_no", "customer", "item", "quantity", "due_date", "responsible_role", "action", "status", "response_sla", "escalation_state", "latest_intervention", "intervention_log", "intervention_action"]),
        modulePanel("逾期订单", body.sections.overdue_orders, ["order_no", "customer", "product_name", "remaining_qty", "delivery_date"]),
        modulePanel("7天内交期", body.sections.due_soon_orders, ["order_no", "customer", "product_name", "remaining_qty", "delivery_date"]),
        modulePanel("缺料明细", body.sections.shortage_rows, ["order_no", "customer", "product_name", "available_qty", "shortage_qty"]),
        modulePanel("待报价项目", body.sections.pending_quotes, ["project_no", "title", "customer", "project_stage", "estimated_amount"]),
        modulePanel("低库存预警", body.sections.low_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"])
      ],
      notes: body.notes,
      actions: [["返回PMC待响应", "/pmc?rebuild=1&open_only=1"]]
    });
  }

  function mobilePanel(titleColumn, subtitleColumns = [], mobileLimit = 12) {
    return {
      mobileCards: true,
      mobileTitleColumn: titleColumn,
      mobileSubtitleColumns: subtitleColumns,
      mobileLimit
    };
  }

  return {
    dispatchTrackingPage,
    exceptionCenterPage,
    foreignTradeBoardPage,
    materialControlPage,
    procurementCenterPage,
    productionCenterPage,
    quoteCenterPage,
    schedulingCenterPage
  };
}
