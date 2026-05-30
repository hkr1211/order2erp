// PMC risk task generators.

export function deliveryTasks(rows, type) {
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

export function shortageTasks(rows) {
  return rows.map((row) => ({
    exception_type: "订单缺料",
    priority: "高",
    related_no: row.order_no,
    customer: row.customer,
    item: row.product_name || row.product_code,
    quantity: row.shortage_qty,
    quantity_text: formatQuantity(row.shortage_qty, row.unit),
    unit: row.unit,
    due_date: row.delivery_date,
    responsible_role: "PMC/采购",
    action: "确认替代库存、采购到货或调整排产",
    status: "待处理"
  }));
}

export function lowStockTasks(rows) {
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

export function delayedProcedureTasks(rows, type) {
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

export function crossWorkshopFlowTasks(rows) {
  return rows.map((row) => ({
    exception_type: row.risk_level === "红牌" ? "前道断点" : "前道预警",
    priority: row.risk_level === "红牌" ? "高" : "中",
    related_no: row.related_no,
    customer: "",
    item: `${row.upstream_section}${row.upstream_work_assignment_id ? `(${row.upstream_work_assignment_id})` : ""} → ${row.downstream_section}${row.downstream_work_assignment_id ? `(${row.downstream_work_assignment_id})` : ""}`,
    quantity: row.upstream_remaining_qty,
    unit: "",
    due_date: row.downstream_start_date,
    responsible_role: row.owner_role,
    action: row.primary_action,
    status: row.flow_gap,
    upstream_section: row.upstream_section,
    downstream_section: row.downstream_section,
    upstream_work_assignment_id: row.upstream_work_assignment_id,
    downstream_work_assignment_id: row.downstream_work_assignment_id,
    match_basis: row.match_basis,
    upstream_finish_date: row.upstream_finish_date,
    downstream_start_date: row.downstream_start_date,
    flow_gap: row.flow_gap
  }));
}

export function isStampingProcedure(row) {
  const text = [row.work_center_name, row.procedure_name, row.owner].filter(Boolean).join(" ");
  return /冲压|冲床|落料|冲圆|引伸|拉伸|拉深|切边|压形|压型|成型|一引|二引|三引|四引|五引|六引/.test(text);
}

export function formatQuantity(value, unit = "") {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const numberValue = Number(value);
  const formatted = Number.isFinite(numberValue) ? numberValue.toFixed(2) : String(value);
  return `${formatted}${unit || ""}`;
}
