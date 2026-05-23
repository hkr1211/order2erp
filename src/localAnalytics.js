export function buildLocalPmcDashboard({ salesOrders = [], materialAlerts = [], today = new Date() } = {}) {
  const day = startOfDay(today);
  const monthStart = new Date(day.getFullYear(), day.getMonth(), 1);
  const monthEnd = new Date(day.getFullYear(), day.getMonth() + 1, 0);
  const normalizedOrders = salesOrders.map((row) => normalizeOrder(row, day));
  const overdueOrders = normalizedOrders.filter((row) => row.days_from_today !== null && row.days_from_today < 0);
  const dueSoonOrders = normalizedOrders.filter((row) => row.days_from_today !== null && row.days_from_today >= 0 && row.days_from_today <= 7);
  const shortageRows = materialAlerts.filter((row) => row.alert_type === "shortage").map(normalizeMaterialAlert);
  const lowStockRows = materialAlerts.filter((row) => row.alert_type === "low_stock").map(normalizeMaterialAlert);

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
      pending_quote_projects: 0,
      low_stock: lowStockRows.length
    },
    sections: {
      overdue_orders: overdueOrders,
      due_soon_orders: dueSoonOrders,
      shortage_orders: shortageRows,
      pending_quotes: [],
      low_stock: lowStockRows
    },
    source_status: {
      sqlite_sales_orders: { ok: true, rows: salesOrders.length },
      sqlite_material_alerts: { ok: true, rows: materialAlerts.length }
    },
    notes: [
      "当前读取本地 SQLite 销售订单和物料告警汇总。",
      "点击“立即同步”可从 ERP 更新本地业务表。"
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

function priorityWeight(priority) {
  if (priority === "高") return 3;
  if (priority === "中") return 2;
  return 1;
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

function number(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
