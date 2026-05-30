export function createStandardRisk(input = {}) {
  const riskType = text(input.risk_type || input.exception_type || "未分类风险");
  const riskLevel = text(input.risk_level || riskLevelForType(riskType));
  const relatedObject = text(input.related_object || inferRelatedObject(riskType));
  const relatedNo = text(input.related_no || input.order_no || input.work_assignment_id || input.product_code || input.bill_no);
  const sourceTable = text(input.source_table || inferSourceTable(riskType));
  const sourceKey = text(input.source_key || input.alert_id || input.procedure_id || input.work_assignment_id || input.order_no || input.product_code || input.bill_no || relatedNo);
  const sourceRule = text(input.source_rule || `pmc.${riskType}`);
  const ownerRole = text(input.owner_role || input.responsible_role || input.responsible_owner || "PMC");
  const suggestedAction = text(input.suggested_action || input.primary_action || input.action || "确认责任人和完成时间");
  const seed = riskIdentitySeed({
    risk_level: riskLevel,
    risk_type: riskType,
    related_object: relatedObject,
    related_no: relatedNo,
    source_table: sourceTable,
    source_key: sourceKey,
    source_rule: sourceRule
  });

  return {
    ...input,
    risk_id: input.risk_id || `RISK-${hashSeed(seed)}`,
    risk_level: riskLevel,
    risk_type: riskType,
    related_object: relatedObject,
    related_no: relatedNo,
    source_table: sourceTable,
    source_key: sourceKey,
    source_rule: sourceRule,
    match_method: text(input.match_method || input.match_basis || input.order_match_by || "ERP字段"),
    owner_role: ownerRole,
    responsible_owner: text(input.responsible_owner || ownerRole),
    suggested_action: suggestedAction,
    primary_action: text(input.primary_action || suggestedAction),
    problem: text(input.problem || input.headline || relatedNo),
    status: text(input.status || input.source_status || "待处理"),
    buttons: Array.isArray(input.buttons) ? input.buttons : []
  };
}

export function riskIdentitySeed(row = {}) {
  return [
    row.risk_level,
    row.risk_type,
    row.related_object,
    row.related_no,
    row.source_table,
    row.source_key,
    row.source_rule
  ].map(text).join("|");
}

export function inferSourceTable(riskType = "") {
  const type = text(riskType);
  if (/物料|缺料|库存/.test(type)) return "erp_material_alerts";
  if (/产能|工序|前道|派工|转序/.test(type)) return "erp_procedure_plans";
  if (/交期|订单|客户/.test(type)) return "erp_sales_orders";
  if (/应收|应付|财务|欠款|付款/.test(type)) return "erp_finance_records";
  return "standard_risks";
}

export function inferRelatedObject(riskType = "") {
  const type = text(riskType);
  if (/物料预警|低库存|库存/.test(type)) return "物料";
  if (/物料断供|缺料|交期|订单|前道/.test(type)) return "订单";
  if (/产能|工序|派工/.test(type)) return "派工";
  if (/应收|应付|财务|欠款|付款/.test(type)) return "财务";
  return "事项";
}

function riskLevelForType(riskType = "") {
  return /超期|断供|瓶颈|逾期|断点/.test(text(riskType)) ? "红牌" : "黄牌";
}

function hashSeed(seed = "") {
  let hash = 5381;
  for (const char of String(seed)) {
    hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(6, "0");
}

function text(value) {
  return String(value ?? "").trim();
}
