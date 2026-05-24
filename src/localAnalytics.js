export function buildLocalPmcDashboard({ salesOrders = [], materialAlerts = [], quoteFollowups = [], procedurePlans = [], financeRows = [], today = new Date() } = {}) {
  const day = startOfDay(today);
  const monthStart = new Date(day.getFullYear(), day.getMonth(), 1);
  const monthEnd = new Date(day.getFullYear(), day.getMonth() + 1, 0);
  const normalizedOrders = salesOrders.map((row) => normalizeOrder(row, day));
  const overdueOrders = normalizedOrders.filter((row) => row.days_from_today !== null && row.days_from_today < 0);
  const dueSoonOrders = normalizedOrders.filter((row) => row.days_from_today !== null && row.days_from_today >= 0 && row.days_from_today <= 7);
  const shortageRows = materialAlerts.filter((row) => row.alert_type === "shortage").map(normalizeMaterialAlert);
  const lowStockRows = materialAlerts.filter((row) => row.alert_type === "low_stock").map(normalizeMaterialAlert);
  const pendingQuotes = quoteFollowups.map(normalizeQuoteFollowup).filter((row) => row.quote_status !== "已报价待确认");
  const normalizedProcedures = procedurePlans.map(normalizeProcedurePlan);
  const delayedProcedures = normalizedProcedures
    .filter((row) => row.remaining_qty === null || row.remaining_qty > 0)
    .filter((row) => {
      const finishDate = parseDate(row.planned_finish_date);
      return finishDate && startOfDay(finishDate) < day;
    });
  const stampingDelayedProcedures = delayedProcedures.filter(isStampingProcedure);
  const financeCenter = buildLocalFinanceCenter({ financeRows });
  const priorityRisks = [
    ...delayedProcedureTasks(stampingDelayedProcedures, "冲压延期"),
    ...shortageTasks(shortageRows),
    ...deliveryTasks(overdueOrders, "交期逾期"),
    ...deliveryTasks(dueSoonOrders, "临期交付"),
    ...delayedProcedureTasks(delayedProcedures.filter((row) => !isStampingProcedure(row)), "工序延期"),
    ...lowStockTasks(lowStockRows)
  ]
    .sort((a, b) => riskTypeWeight(b.exception_type) - riskTypeWeight(a.exception_type) || priorityWeight(b.priority) - priorityWeight(a.priority) || String(a.due_date || "").localeCompare(String(b.due_date || "")))
    .slice(0, 12);
  const redRisks = [
    ...commandRiskRows(delayedProcedureTasks(stampingDelayedProcedures, "冲压延期"), "产能瓶颈", "交期超期"),
    ...commandRiskRows(shortageTasks(shortageRows), "物料断供", "物料断供"),
    ...commandRiskRows(deliveryTasks(overdueOrders, "交期逾期"), "交期超期", "交期超期")
  ];
  const yellowRisks = [
    ...commandRiskRows(deliveryTasks(dueSoonOrders, "临期交付"), "交期预警", "交期预警"),
    ...commandRiskRows(delayedProcedureTasks(delayedProcedures.filter((row) => !isStampingProcedure(row)), "工序延期"), "产能预警", "产能预警"),
    ...commandRiskRows(lowStockTasks(lowStockRows), "物料预警", "物料预警"),
    ...quoteRiskRows(pendingQuotes)
  ];
  const interventionTasks = [...redRisks, ...yellowRisks].map((row, index) => ({
    task_no: `ACT-${String(index + 1).padStart(3, "0")}`,
    risk_level: row.risk_level,
    risk_type: row.risk_type,
    related_no: row.related_no,
    problem: row.problem,
    primary_action: row.primary_action,
    buttons: row.buttons,
    owner_role: row.owner_role,
    due_date: row.due_date
  }));

  return {
    model: "pmc_console",
    generated_at: new Date().toISOString(),
    cached: true,
    summary: {
      today_orders: normalizedOrders.filter((row) => sameDay(parseDate(row.signed_date), day)).length,
      month_orders: normalizedOrders.filter((row) => betweenDays(parseDate(row.signed_date), monthStart, monthEnd)).length,
      overdue_orders: uniqueCount(overdueOrders, "order_no"),
      due_soon_orders: uniqueCount(dueSoonOrders, "order_no"),
      shortage_orders: uniqueCount(shortageRows, "order_no"),
      pending_quote_projects: pendingQuotes.length,
      low_stock: lowStockRows.length,
      procedure_plan_rows: normalizedProcedures.length,
      delayed_procedures: delayedProcedures.length,
      stamping_delayed_procedures: stampingDelayedProcedures.length,
      priority_risks: priorityRisks.length,
      overdue_receivables: financeCenter.summary.overdue_receivables,
      due_soon_payables: financeCenter.summary.due_soon_payables
    },
    command_center: {
      red_count: redRisks.length,
      yellow_count: yellowRisks.length,
      green_count: Math.max(0, normalizedOrders.length - uniqueCount([...overdueOrders, ...dueSoonOrders], "order_no")),
      today_todos: redRisks.length + yellowRisks.length,
      risk_order_ratio: normalizedOrders.length ? Number(((uniqueCount([...overdueOrders, ...dueSoonOrders, ...shortageRows], "order_no") / normalizedOrders.length) * 100).toFixed(1)) : 0
    },
    sections: {
      overdue_orders: overdueOrders,
      due_soon_orders: dueSoonOrders,
      shortage_orders: shortageRows,
      pending_quotes: pendingQuotes,
      low_stock: lowStockRows,
      delayed_procedures: delayedProcedures,
      stamping_delayed_procedures: stampingDelayedProcedures,
      priority_risks: priorityRisks,
      red_risks: redRisks,
      yellow_risks: yellowRisks,
      intervention_tasks: interventionTasks,
      workload_by_center: procedureWorkloadByCenter(normalizedProcedures, day),
      overdue_receivables: financeCenter.sections.overdue_receivables,
      due_soon_payables: financeCenter.sections.due_soon_payables
    },
    source_status: {
      sqlite_sales_orders: { ok: true, rows: salesOrders.length },
      sqlite_material_alerts: { ok: true, rows: materialAlerts.length },
      sqlite_quote_followups: { ok: true, rows: quoteFollowups.length },
      sqlite_procedure_plans: { ok: true, rows: procedurePlans.length },
      sqlite_finance_records: { ok: true, rows: financeRows.length }
    },
    notes: [
      "当前读取本地 SQLite 销售订单、物料告警、待报价、派工进度和应收应付汇总。",
      "同步暂停时本页不会访问 ERP，只使用最近已同步成功的数据重新生成。"
    ]
  };
}

export function buildLocalExceptionCenter(dashboard) {
  const sections = dashboard.sections || {};
  const tasks = [
    ...deliveryTasks(sections.overdue_orders || [], "交期逾期"),
    ...deliveryTasks(sections.due_soon_orders || [], "临期交付"),
    ...shortageTasks(sections.shortage_orders || []),
    ...lowStockTasks(sections.low_stock || [])
  ]
    .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority) || String(a.due_date || "").localeCompare(String(b.due_date || "")))
    .slice(0, 80)
    .map((task, index) => ({ task_no: `PMC-${String(index + 1).padStart(3, "0")}`, ...task }));

  return {
    model: "exception_center",
    generated_at: new Date().toISOString(),
    cached: true,
    summary: {
      open_tasks: tasks.length,
      critical_tasks: tasks.filter((task) => task.priority === "高").length,
      overdue_orders: dashboard.summary?.overdue_orders || 0,
      due_soon_orders: dashboard.summary?.due_soon_orders || 0,
      shortage_orders: dashboard.summary?.shortage_orders || 0,
      pending_quotes: dashboard.summary?.pending_quote_projects || 0,
      low_stock: dashboard.summary?.low_stock || 0
    },
    sections: {
      overdue_orders: sections.overdue_orders || [],
      due_soon_orders: sections.due_soon_orders || [],
      shortage_rows: sections.shortage_orders || [],
      pending_quotes: sections.pending_quotes || [],
      low_stock: sections.low_stock || [],
      tasks
    },
    source_status: dashboard.source_status || {},
    notes: [
      "当前读取本地 SQLite 汇总生成异常待办。",
      "ERP 不可用时，异常中心继续使用最近同步成功的数据。"
    ]
  };
}

export function mapQuoteFollowupForLocal(row, today = new Date()) {
  const currentDay = startOfDay(today);
  const createdDate = parseDate(row.created_date);
  const ageDays = createdDate ? daysBetween(startOfDay(createdDate), currentDay) : null;
  const estimatedAmount = number(row.estimated_amount) || 0;
  const quotedAmount = number(row.quoted_amount) || 0;
  const stageText = [row.follow_stage, row.project_stage, row.approval_status, row.lead_status].filter(Boolean).join(" ");
  const priority = quotePriority(ageDays, estimatedAmount, stageText);
  const quoteStatus = quotedAmount > 0 ? "已报价待确认" : /询价|报价|核价|定价/.test(stageText) ? "待报价" : "待确认需求";
  return {
    quote_no: row.project_no || row.erp_id || row.quote_no,
    priority,
    quote_status: quoteStatus,
    customer: row.customer,
    title: row.title,
    owner: row.owner || "未分配",
    project_stage: row.project_stage || row.follow_stage,
    estimated_amount: row.estimated_amount,
    quoted_amount: row.quoted_amount,
    created_date: row.created_date,
    age_days: ageDays,
    action: quoteAction(priority, quoteStatus),
    risk_flags: row.risk_flags,
    raw: row.raw || row
  };
}

export function quoteOwnerSummaryForLocal(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const owner = row.owner || "未分配";
    const current = grouped.get(owner) || {
      owner,
      quote_followups: 0,
      urgent_quotes: 0,
      estimated_amount: 0,
      max_age_days: 0,
      latest_action: ""
    };
    current.quote_followups += 1;
    if (row.priority === "高") {
      current.urgent_quotes += 1;
    }
    current.estimated_amount += number(row.estimated_amount) || 0;
    current.max_age_days = Math.max(current.max_age_days, number(row.age_days) || 0);
    if (!current.latest_action && row.action) {
      current.latest_action = row.action;
    }
    grouped.set(owner, current);
  }
  return [...grouped.values()]
    .map((row) => ({ ...row, estimated_amount: Number(row.estimated_amount.toFixed(2)) }))
    .sort((a, b) => b.urgent_quotes - a.urgent_quotes || b.max_age_days - a.max_age_days || b.estimated_amount - a.estimated_amount)
    .slice(0, 20);
}

export function mapFinanceRowForLocal(row, direction, today = new Date()) {
  const currentDay = startOfDay(today);
  const amount = number(firstPresent(row.amount, row.moneyall, row.MoneyAll, row.money1, row.Money1, row.money, row.Money, row.cmoney, row.CMoney));
  const paidAmount = number(firstPresent(row.paid_amount, row.hkmoney, row.HkMoney, row.money2, row.Money2, row.paymoney, row.PayMoney));
  const unpaidAmount = number(firstPresent(row.unpaid_amount, row.wsmoney, row.WsMoney, row.leftmoney, row.LeftMoney, amount !== null && paidAmount !== null ? amount - paidAmount : null));
  const billDateText = firstPresent(row.bill_date, row.date1, row.Date1, row.dateadd, row.DateAdd, row.tdate, row.TDate);
  const paymentTermsDays = number(firstPresent(row.paydays, row.PayDays, row.daynum, row.DayNum, row.zq, row.Zq));
  const dueDateText = firstPresent(row.due_date, row.date2, row.Date2, row.dateend, row.DateEnd);
  const billDate = parseDate(billDateText);
  const dueDate = parseDate(dueDateText) || (billDate && paymentTermsDays !== null ? addDays(billDate, paymentTermsDays) : null);
  const dueDays = dueDate ? daysBetween(currentDay, startOfDay(dueDate)) : null;
  const ageDays = billDate ? daysBetween(startOfDay(billDate), currentDay) : null;
  return {
    direction,
    counterparty: firstPresent(row.counterparty, row.khmc, row.gysname, row.cateName, row.CateName, row.title2),
    bill_no: firstPresent(row.bill_no, row.htid, row.rkbh, row.billno, row.BillNo, row.order1, row.Order1),
    business_title: firstPresent(row.business_title, row.title, row.Title, row.intro, row.Intro),
    amount,
    paid_amount: paidAmount,
    unpaid_amount: unpaidAmount,
    bill_date: billDate ? formatDate(billDate) : billDateText,
    due_date: dueDate ? formatDate(dueDate) : dueDateText,
    payment_terms: paymentTermsDays !== null ? `${paymentTermsDays}天` : firstPresent(row.payment_terms, row.paytype, row.PayType),
    age_days: ageDays,
    due_days: dueDays,
    risk_status: financeRiskStatus(unpaidAmount, dueDays),
    status: firstPresent(row.status, row.Status, row.zt, row.Zt, row.skzt, row.fkzt),
    owner: firstPresent(row.owner, row.xsry, row.person, row.Person),
    raw: row.raw || row
  };
}

export function buildLocalFinanceCenter({ financeRows = [] } = {}) {
  const receivableRows = financeRows.filter((row) => row.direction === "receivable");
  const payableRows = financeRows.filter((row) => row.direction === "payable");
  const receivableDebtRows = topFinanceCounterpartiesForLocal(receivableRows);
  const payableDebtRows = topFinanceCounterpartiesForLocal(payableRows);
  const overdueReceivables = financeRowsByRiskForLocal(receivableRows, "已逾期");
  const upcomingPayables = payableRows
    .filter((row) => number(row.unpaid_amount) > 0 && row.due_days !== null && row.due_days <= 7)
    .sort(compareFinanceDueRowsForLocal);

  return {
    model: "finance_center",
    generated_at: new Date().toISOString(),
    cached: true,
    summary: {
      receivable_records: receivableRows.length,
      payable_records: payableRows.length,
      receivable_unpaid: sumAmount(receivableRows, "unpaid_amount"),
      payable_unpaid: sumAmount(payableRows, "unpaid_amount"),
      overdue_receivables: overdueReceivables.length,
      due_soon_payables: upcomingPayables.length,
      source_errors: 0
    },
    sections: {
      receivables: receivableRows,
      payables: payableRows,
      receivable_debts: receivableDebtRows,
      overdue_receivables: overdueReceivables,
      due_soon_payables: upcomingPayables,
      payable_debts: payableDebtRows
    },
    source_status: {
      sqlite_finance_records: { ok: true, rows: financeRows.length }
    },
    notes: [
      "当前读取本地 SQLite 应收应付数据。",
      "ERP 不可用时，应收应付中心继续使用最近同步成功的数据。"
    ]
  };
}

function normalizeOrder(row, today) {
  const deliveryDate = parseDate(row.delivery_date);
  return {
    erp_id: row.erp_id,
    order_no: row.order_no,
    customer: row.customer,
    owner: row.owner,
    product_name: row.product_name,
    product_code: row.product_code,
    product_model: row.product_model,
    remaining_qty: row.remaining_qty,
    amount: row.amount,
    signed_date: row.signed_date,
    delivery_date: row.delivery_date,
    days_from_today: deliveryDate ? daysBetween(today, startOfDay(deliveryDate)) : null,
    raw: parseJson(row.raw_json, row)
  };
}

function normalizeMaterialAlert(row) {
  return {
    order_no: row.order_no,
    customer: row.customer,
    product_code: row.product_code,
    product_name: row.product_name,
    warehouse: row.warehouse,
    demand_qty: row.demand_qty,
    available_qty: row.available_qty,
    stock_qty: row.stock_qty,
    shortage_qty: row.shortage_qty,
    delivery_date: row.delivery_date,
    raw: parseJson(row.raw_json, row)
  };
}

function normalizeQuoteFollowup(row) {
  return {
    quote_no: row.quote_no,
    project_no: row.quote_no,
    priority: row.priority,
    quote_status: row.quote_status,
    customer: row.customer,
    title: row.title,
    owner: row.owner || "未分配",
    project_stage: row.project_stage,
    estimated_amount: row.estimated_amount,
    quoted_amount: row.quoted_amount,
    created_date: row.created_date,
    age_days: row.age_days,
    action: row.action,
    risk_flags: row.risk_flags,
    raw: parseJson(row.raw_json, row)
  };
}

function normalizeProcedurePlan(row) {
  return {
    work_assignment_id: row.work_assignment_id,
    order_no: row.order_no,
    product_name: row.product_name,
    product_code: row.product_code,
    product_model: row.product_model,
    procedure_name: row.procedure_name,
    work_center_name: row.work_center_name || "未识别工作中心",
    planned_qty: row.planned_qty,
    finished_qty: row.finished_qty,
    remaining_qty: row.remaining_qty,
    planned_start_date: row.planned_start_date,
    planned_finish_date: row.planned_finish_date,
    owner: row.owner,
    state: row.state,
    raw: parseJson(row.raw_json, row)
  };
}

function procedureWorkloadByCenter(rows, today) {
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
    const planned = number(row.planned_qty) || 0;
    const finished = number(row.finished_qty) || 0;
    const remaining = number(row.remaining_qty) || 0;
    const finishDate = parseDate(row.planned_finish_date);
    current.procedure_count += 1;
    current.planned_qty += planned;
    current.finished_qty += finished;
    current.remaining_qty += remaining;
    if (finishDate && remaining > 0 && startOfDay(finishDate) < today) {
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

function deliveryTasks(rows, type) {
  return rows.map((row) => {
    const overdue = Number(row.days_from_today) < 0;
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

function shortageTasks(rows) {
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

function lowStockTasks(rows) {
  return rows.map((row) => ({
    exception_type: "低库存",
    priority: Number(row.available_qty || 0) <= 0 ? "高" : "中",
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

function delayedProcedureTasks(rows, type) {
  return rows.map((row) => ({
    exception_type: type,
    priority: type === "冲压延期" ? "高" : "中",
    related_no: row.work_assignment_id || row.order_no,
    customer: "",
    item: [row.product_name, row.procedure_name, row.work_center_name].filter(Boolean).join(" / "),
    quantity: row.remaining_qty,
    due_date: row.planned_finish_date,
    responsible_role: type === "冲压延期" ? "PMC/冲压工段" : "PMC/生产",
    action: type === "冲压延期" ? "优先确认冲压产能、模具和插单影响" : "确认延期原因并调整工序计划",
    status: row.state || "待处理"
  }));
}

function commandRiskRows(rows, riskType, fallbackType) {
  return rows.map((row) => {
    const type = riskType || fallbackType || row.exception_type;
    const buttons = interventionButtons(type);
    return {
      risk_level: isRedRiskType(type) ? "红牌" : "黄牌",
      risk_type: type,
      related_no: row.related_no,
      problem: commandProblemText(type, row),
      item: row.item,
      quantity: row.quantity,
      due_date: row.due_date,
      owner_role: row.responsible_role,
      primary_action: row.action,
      buttons,
      source_status: row.status
    };
  });
}

function quoteRiskRows(rows) {
  return rows.map((row) => ({
    risk_level: "黄牌",
    risk_type: "报价预警",
    related_no: row.quote_no,
    problem: `${row.title || "报价项目"}待处理${row.customer ? `，客户：${row.customer}` : ""}`,
    item: row.title,
    quantity: row.estimated_amount,
    due_date: row.created_date,
    owner_role: row.owner || "销售/报价",
    primary_action: row.action || "补齐需求资料并安排报价",
    buttons: ["生成报价跟进", "客户沟通", "标记处理中"],
    source_status: row.quote_status
  }));
}

function commandProblemText(type, row) {
  if (type === "冲压延期") return `${row.item || "冲压工序"}未按计划完成，剩余${row.quantity ?? ""}`;
  if (type === "物料断供") return `${row.item || "物料"}缺口${row.quantity ?? ""}，影响订单${row.related_no || ""}`;
  if (type === "交期超期") return `${row.related_no || "订单"}已超过承诺交期，需今天处理`;
  if (type === "交期预警") return `${row.related_no || "订单"}即将到期，需提前协调生产/发货`;
  if (type === "产能瓶颈") return `${row.item || "工序"}已延误，需今天确认资源安排`;
  if (type === "产能预警") return `${row.item || "工序"}存在延期，需确认产能安排`;
  if (type === "物料预警") return `${row.item || "物料"}库存偏低，需确认补料或替代方案`;
  return row.action || row.item || type;
}

function interventionButtons(type) {
  if (type === "冲压延期") return ["加班协调", "外协申请", "模拟排程", "标记处理中"];
  if (type === "产能瓶颈") return ["加班协调", "外协申请", "模拟排程", "标记处理中"];
  if (type === "物料断供") return ["生成催货文本", "申请调拨", "找替代料", "标记处理中"];
  if (type === "交期超期") return ["紧急发货", "客户沟通", "改排程", "标记处理中"];
  if (type === "交期预警") return ["加急排产", "协调工序", "客户预沟通", "标记处理中"];
  if (type === "产能预警") return ["加班/增班", "外协评估", "调整顺序", "标记处理中"];
  if (type === "物料预警") return ["确认物流", "备选方案", "生成催货文本", "标记处理中"];
  return ["标记处理中", "查看详情"];
}

function isRedRiskType(type) {
  return ["冲压延期", "产能瓶颈", "物料断供", "交期超期"].includes(type);
}

function isStampingProcedure(row) {
  const text = [row.work_center_name, row.procedure_name, row.owner].filter(Boolean).join(" ");
  return /冲压|冲床|落料|引伸|拉伸|切边|压型/.test(text);
}

function priorityWeight(priority) {
  if (priority === "高") return 3;
  if (priority === "中") return 2;
  return 1;
}

function riskTypeWeight(type) {
  if (type === "冲压延期") return 5;
  if (type === "订单缺料") return 4;
  if (type === "交期逾期") return 3;
  if (type === "临期交付") return 2;
  return 1;
}

function financeRiskStatus(unpaidAmount, dueDays) {
  const unpaid = number(unpaidAmount) || 0;
  if (unpaid <= 0) return "已结清";
  if (dueDays === null) return "未清";
  if (dueDays < 0) return "已逾期";
  if (dueDays <= 7) return "7天内到期";
  return "未到期";
}

function financeRowsByRiskForLocal(rows, riskStatus) {
  return rows
    .filter((row) => row.risk_status === riskStatus && number(row.unpaid_amount) > 0)
    .sort(compareFinanceDueRowsForLocal);
}

function compareFinanceDueRowsForLocal(a, b) {
  const aDays = a.due_days === null ? Number.POSITIVE_INFINITY : a.due_days;
  const bDays = b.due_days === null ? Number.POSITIVE_INFINITY : b.due_days;
  if (aDays !== bDays) return aDays - bDays;
  return (number(b.unpaid_amount) || 0) - (number(a.unpaid_amount) || 0);
}

function topFinanceCounterpartiesForLocal(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const unpaid = number(row.unpaid_amount) || 0;
    if (unpaid <= 0) continue;
    const key = row.counterparty || "未识别往来单位";
    const current = grouped.get(key) || {
      counterparty: key,
      unpaid_amount: 0,
      records: 0,
      overdue_records: 0,
      earliest_due_date: null,
      earliest_due_days: null,
      risk_status: "未清"
    };
    current.unpaid_amount += unpaid;
    current.records += 1;
    if (row.risk_status === "已逾期") current.overdue_records += 1;
    if (row.due_days !== null && (current.earliest_due_days === null || row.due_days < current.earliest_due_days)) {
      current.earliest_due_days = row.due_days;
      current.earliest_due_date = row.due_date;
    }
    if (current.overdue_records > 0) {
      current.risk_status = "已逾期";
    } else if (current.earliest_due_days !== null && current.earliest_due_days <= 7) {
      current.risk_status = "7天内到期";
    }
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map((row) => ({ ...row, unpaid_amount: Number(row.unpaid_amount.toFixed(2)) }))
    .sort((a, b) => b.unpaid_amount - a.unpaid_amount)
    .slice(0, 20);
}

function sumAmount(rows, key) {
  return Number(rows.reduce((sum, row) => sum + (number(row[key]) || 0), 0).toFixed(2));
}

function quotePriority(ageDays, amount, stageText) {
  if (ageDays !== null && ageDays >= 7) return "高";
  if (amount >= 100000 || /核价|定价/.test(stageText)) return "高";
  if (ageDays !== null && ageDays >= 3) return "中";
  return "低";
}

function quoteAction(priority, quoteStatus) {
  if (quoteStatus === "已报价待确认") return "跟进客户反馈并推动确认";
  if (priority === "高") return "优先确认规格、成本和报价截止时间";
  return "补齐需求资料并安排报价";
}

function uniqueCount(rows, key) {
  return new Set(rows.map((row) => row?.[key]).filter(Boolean)).size;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getFullYear() < 2000 ? null : date;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function sameDay(left, right) {
  return Boolean(left) && startOfDay(left).getTime() === startOfDay(right).getTime();
}

function betweenDays(value, start, end) {
  if (!value) return false;
  const day = startOfDay(value).getTime();
  return day >= startOfDay(start).getTime() && day <= startOfDay(end).getTime();
}

function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function number(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
