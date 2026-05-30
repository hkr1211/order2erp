export const STANDARD_MODEL_DICTIONARY = {
  order: {
    label: "销售订单",
    source_table: "erp_sales_orders",
    primary_key: "order_no",
    roles: ["老板", "管理层", "PMC", "跟单员", "销售"],
    fields: {
      order_no: field("销售订单号", "ERP销售合同/订单号", ["跟单员", "销售"]),
      customer: field("客户", "客户名称", ["老板", "管理层", "跟单员", "销售"]),
      owner: field("负责人", "销售/跟单负责人", ["管理层", "跟单员", "销售"]),
      product_name: field("产品名称", "订单产品或主产品名称", ["PMC", "跟单员", "销售"]),
      product_code: field("产品编码", "ERP产品编码", ["PMC"]),
      amount: field("订单金额", "订单金额，按ERP原币种口径", ["老板", "销售", "财务"]),
      signed_date: field("签订日期", "订单签订日期", ["管理层", "销售"]),
      delivery_date: field("交期", "承诺交付日期", ["老板", "管理层", "跟单员", "销售"]),
      status_text: field("订单状态", "ERP状态文本", ["跟单员", "销售"]),
      is_completed: field("是否完成", "发货/出库/收款完成的保守判断", ["管理层"])
    }
  },
  procedure: {
    label: "工序派工",
    source_table: "erp_procedure_plans",
    primary_key: "procedure_id",
    roles: ["管理层", "PMC", "跟单员", "车间"],
    fields: {
      procedure_id: field("派工单ID", "ERP工序派工记录ID", ["PMC", "车间"]),
      sales_order_no: field("销售订单号", "匹配后的销售订单号", ["PMC", "跟单员"]),
      procedure_name: field("工序", "工序名称", ["PMC", "车间"]),
      work_center_name: field("工作中心", "车间/设备/工段", ["管理层", "PMC", "车间"]),
      planned_qty: field("计划数量", "计划生产数量", ["PMC", "车间"]),
      finished_qty: field("完成数量", "已完成数量", ["PMC", "车间"]),
      remaining_qty: field("剩余数量", "剩余未完成数量", ["PMC", "车间"]),
      planned_start_date: field("计划开始", "计划开工日期", ["PMC", "车间"]),
      planned_finish_date: field("计划完工", "计划完工日期", ["PMC", "车间"]),
      owner: field("工序负责人", "ERP工序责任人或编号", ["PMC"]),
      match_method: field("订单匹配方式", "工序与销售订单的匹配来源", ["PMC", "跟单员"]),
      is_open: field("是否未完工", "剩余数量或状态判断", ["管理层", "PMC"])
    }
  },
  material_alert: {
    label: "物料告警",
    source_table: "erp_material_alerts",
    primary_key: "alert_id",
    roles: ["管理层", "PMC", "采购", "仓库", "跟单员"],
    fields: {
      alert_id: field("告警ID", "本地物料告警ID", ["PMC"]),
      alert_type: field("告警类型", "缺料/低库存等类型", ["管理层", "PMC"]),
      order_no: field("销售订单号", "影响的销售订单号", ["跟单员", "销售"]),
      product_code: field("物料编码", "ERP物料编码", ["PMC", "采购", "仓库"]),
      product_name: field("物料名称", "ERP物料名称", ["PMC", "采购", "仓库"]),
      warehouse: field("仓库", "库存所在仓库", ["仓库"]),
      demand_qty: field("需求数量", "订单或计划需求数量", ["PMC"]),
      available_qty: field("可用库存", "可用库存数量", ["PMC", "仓库"]),
      shortage_qty: field("缺口数量", "需求减可用后的缺口", ["PMC", "采购"]),
      unit: field("单位", "数量单位", ["PMC"])
    }
  },
  inventory_item: {
    label: "库存项目",
    source_table: "erp_inventory_details",
    primary_key: "inventory_key",
    roles: ["PMC", "采购", "仓库"],
    fields: {
      product_code: field("物料编码", "ERP物料编码", ["PMC", "仓库"]),
      product_name: field("物料名称", "ERP物料名称", ["PMC", "仓库"]),
      product_model: field("规格型号", "ERP规格型号", ["PMC", "仓库"]),
      warehouse: field("仓库", "库存仓库", ["仓库"]),
      batch_no: field("批次", "库存批次号", ["PMC", "仓库"]),
      stock_qty: field("账面库存", "账面数量", ["PMC", "仓库"]),
      available_qty: field("可用库存", "可用数量", ["PMC", "仓库"])
    }
  },
  finance_record: {
    label: "财务往来",
    source_table: "erp_finance_records",
    primary_key: "record_id",
    roles: ["老板", "管理层", "财务", "销售"],
    fields: {
      record_id: field("财务记录ID", "本地财务记录ID", ["财务"]),
      direction: field("收付方向", "应收或应付", ["财务"]),
      counterparty: field("往来单位", "客户或供应商", ["老板", "财务", "销售"]),
      bill_no: field("单据号", "ERP财务单据号", ["财务"]),
      amount: field("单据金额", "单据总金额", ["老板", "财务"]),
      paid_amount: field("已收/已付", "已收款或已付款金额", ["财务"]),
      unpaid_amount: field("未收/未付", "未清金额", ["老板", "财务"]),
      due_date: field("到期日", "收付款到期日", ["财务", "销售"]),
      risk_status: field("风险状态", "逾期/临期/未清/已结清", ["老板", "财务"])
    }
  },
  purchase_order: {
    label: "采购订单",
    source_table: "erp_purchase_orders",
    primary_key: "purchase_no",
    roles: ["PMC", "采购", "财务"],
    fields: {
      purchase_no: field("采购单号", "ERP采购单号", ["采购"]),
      supplier: field("供应商", "供应商名称", ["采购", "财务"]),
      buyer: field("采购员", "采购负责人", ["采购"]),
      expected_arrival_date: field("预计到货", "预计到货日期", ["PMC", "采购"]),
      status: field("采购状态", "ERP采购状态", ["采购"])
    }
  },
  supplier: {
    label: "供应商",
    source_table: "erp_suppliers",
    primary_key: "supplier",
    roles: ["采购", "财务", "管理层"],
    fields: {
      supplier: field("供应商", "供应商名称", ["采购"]),
      contact: field("联系人", "供应商联系人", ["采购"]),
      phone: field("电话", "供应商联系电话", ["采购"])
    }
  },
  risk: {
    label: "统一风险事项",
    source_table: "standard_risks",
    primary_key: "risk_id",
    roles: ["老板", "管理层", "PMC", "跟单员", "销售", "财务"],
    fields: {
      risk_id: field("风险ID", "稳定风险唯一标识", ["PMC"]),
      risk_level: field("风险等级", "红牌/黄牌/绿牌", ["老板", "管理层"]),
      risk_type: field("风险类型", "交期、物料、产能、财务等类型", ["老板", "管理层"]),
      related_object: field("关联对象", "订单/派工/物料/财务", ["PMC"]),
      related_no: field("关联编号", "订单号、派工单ID或单据号", ["PMC", "跟单员"]),
      source_table: field("来源表", "生成风险的SQLite表", ["系统管理员"]),
      source_rule: field("来源规则", "生成风险的规则名称", ["PMC"]),
      responsible_owner: field("责任人/角色", "建议责任人或责任角色", ["管理层", "PMC"]),
      suggested_action: field("建议动作", "系统建议的下一步处理动作", ["跟单员", "PMC"])
    }
  }
};

export function dataDictionaryRows(dictionary = STANDARD_MODEL_DICTIONARY) {
  return Object.entries(dictionary).flatMap(([model, config]) =>
    Object.entries(config.fields || {}).map(([fieldName, meta]) => ({
      model,
      model_label: config.label,
      source_table: config.source_table,
      primary_key: config.primary_key,
      field: fieldName,
      label: meta.label,
      description: meta.description,
      roles: meta.roles
    }))
  );
}

export function normalizeStandardRecord(model, row = {}) {
  if (model === "order") return normalizeStandardOrder(row);
  if (model === "procedure") return normalizeStandardProcedure(row);
  if (model === "material_alert") return normalizeStandardMaterialAlert(row);
  if (model === "inventory_item") return normalizeStandardInventoryItem(row);
  if (model === "finance_record") return normalizeStandardFinanceRecord(row);
  throw new Error(`Unsupported standard model: ${model}`);
}

export function normalizeStandardOrder(row = {}) {
  const raw = parseRaw(row.raw_json, row.raw);
  const orderNo = firstText(row.order_no, row.ord, raw.order_no, raw.ord, raw.htbh, raw.htid);
  const statusText = firstText(row.status_text, row.status, raw.status, raw.htzt);
  return {
    record_type: "order",
    source_table: "erp_sales_orders",
    source_key: orderNo || firstText(row.erp_id, row.id),
    synced_at: firstText(row.synced_at, raw.synced_at),
    raw,
    order_no: orderNo,
    erp_id: firstText(row.erp_id, row.id, raw.id),
    customer: firstText(row.customer, row.name, raw.customer, raw.name),
    owner: firstText(row.owner, row.sales_owner, row.catename, raw.owner, raw.catename) || "未分配",
    product_code: firstText(row.product_code, raw.product_code, raw.cpbh),
    product_name: firstText(row.product_name, row.title, raw.product_name, raw.title),
    amount: number(row.amount ?? row.money ?? raw.amount ?? raw.money1),
    signed_date: firstText(row.signed_date, row.order_date, raw.signed_date, raw.date, raw.dateQD),
    delivery_date: firstText(row.delivery_date, row.due_date, raw.delivery_date, raw.Date7, raw.dateZZ),
    status_text: statusText,
    is_completed: isCompletedOrder(statusText)
  };
}

export function normalizeStandardProcedure(row = {}) {
  const raw = parseRaw(row.raw_json, row.raw);
  const procedureId = firstText(row.work_assignment_id, row.procedure_id, row.erp_id, row.id, raw.work_assignment_id, raw.id);
  const orderNo = firstText(row.order_no, row.sales_order_no, raw.order_no, raw.ord, raw.htbh);
  const remainingQty = number(row.remaining_qty ?? raw.remaining_qty);
  const state = firstText(row.state, row.status, raw.state, raw.status);
  return {
    record_type: "procedure",
    source_table: "erp_procedure_plans",
    source_key: procedureId,
    synced_at: firstText(row.synced_at, raw.synced_at),
    raw,
    procedure_id: procedureId,
    work_assignment_id: procedureId,
    order_no: orderNo,
    sales_order_no: orderNo,
    product_code: firstText(row.product_code, raw.product_code),
    product_name: firstText(row.product_name, raw.product_name),
    product_model: firstText(row.product_model, raw.product_model),
    procedure_name: firstText(row.procedure_name, raw.procedure_name),
    work_center_name: firstText(row.work_center_name, raw.work_center_name) || "未识别工作中心",
    planned_qty: number(row.planned_qty ?? raw.planned_qty),
    finished_qty: number(row.finished_qty ?? raw.finished_qty),
    remaining_qty: remainingQty,
    planned_start_date: firstText(row.planned_start_date, raw.planned_start_date),
    planned_finish_date: firstText(row.planned_finish_date, raw.planned_finish_date),
    owner: firstText(row.owner, row.responsible_owner, raw.owner, raw.responsible_owner),
    state,
    match_method: firstText(row.order_match_by, row.match_method, raw.order_match_by, raw.match_method),
    is_open: isOpenProcedure(remainingQty, state)
  };
}

export function normalizeStandardMaterialAlert(row = {}) {
  const raw = parseRaw(row.raw_json, row.raw);
  const alertId = firstText(row.alert_id, row.id, raw.alert_id, raw.id);
  return {
    record_type: "material_alert",
    source_table: "erp_material_alerts",
    source_key: alertId || firstText(row.order_no, row.product_code),
    synced_at: firstText(row.synced_at, raw.synced_at),
    raw,
    alert_id: alertId,
    alert_type: firstText(row.alert_type, raw.alert_type),
    order_no: firstText(row.order_no, raw.order_no),
    customer: firstText(row.customer, raw.customer),
    product_code: firstText(row.product_code, raw.product_code),
    product_name: firstText(row.product_name, raw.product_name),
    warehouse: firstText(row.warehouse, raw.warehouse),
    demand_qty: number(row.demand_qty ?? raw.demand_qty),
    available_qty: number(row.available_qty ?? raw.available_qty),
    stock_qty: number(row.stock_qty ?? raw.stock_qty),
    shortage_qty: number(row.shortage_qty ?? raw.shortage_qty),
    unit: firstText(row.unit, raw.unit) || "kg"
  };
}

export function normalizeStandardInventoryItem(row = {}) {
  const raw = parseRaw(row.raw_json, row.raw);
  const productCode = firstText(row.product_code, raw.product_code, row.cpbh, raw.cpbh);
  const warehouse = firstText(row.warehouse, raw.warehouse, row.ckname, raw.ckname);
  const batchNo = firstText(row.batch_no, row.serial_no, raw.batch_no, raw.serial_no, row.ph, raw.ph);
  return {
    record_type: "inventory_item",
    source_table: firstText(row.source_table, raw.source_table) || (batchNo ? "erp_inventory_details" : "erp_inventory_summary"),
    source_key: firstText(row.inventory_key, row.source_key, raw.inventory_key, raw.source_key) || [productCode, warehouse, batchNo].filter(Boolean).join("|"),
    synced_at: firstText(row.synced_at, raw.synced_at),
    raw,
    product_code: productCode,
    product_name: firstText(row.product_name, raw.product_name, row.cpmc, raw.cpmc),
    product_model: firstText(row.product_model, raw.product_model, row.ggxh, raw.ggxh),
    warehouse,
    batch_no: batchNo,
    stock_qty: number(row.stock_qty ?? row.qty ?? raw.stock_qty ?? raw.qty),
    available_qty: number(row.available_qty ?? row.stock_qty ?? row.qty ?? raw.available_qty ?? raw.stock_qty ?? raw.qty),
    unit: firstText(row.unit, raw.unit, row.dw, raw.dw)
  };
}

export function normalizeStandardFinanceRecord(row = {}) {
  const raw = parseRaw(row.raw_json, row.raw);
  const recordId = firstText(row.record_id, row.bill_no, row.id, raw.record_id, raw.bill_no, raw.id);
  return {
    record_type: "finance_record",
    source_table: "erp_finance_records",
    source_key: recordId,
    synced_at: firstText(row.synced_at, raw.synced_at),
    raw,
    record_id: recordId,
    direction: firstText(row.direction, raw.direction),
    counterparty: firstText(row.counterparty, row.customer, row.supplier, raw.counterparty, raw.name),
    bill_no: firstText(row.bill_no, raw.bill_no),
    business_title: firstText(row.business_title, row.title, raw.business_title, raw.title),
    amount: number(row.amount ?? raw.amount ?? raw.money1),
    paid_amount: number(row.paid_amount ?? raw.paid_amount),
    unpaid_amount: number(row.unpaid_amount ?? raw.unpaid_amount ?? raw.money1),
    bill_date: firstText(row.bill_date, raw.bill_date),
    due_date: firstText(row.due_date, raw.due_date),
    due_days: number(row.due_days ?? raw.due_days),
    risk_status: firstText(row.risk_status, raw.risk_status, row.status, raw.status),
    owner: firstText(row.owner, row.sales_owner, raw.owner, raw.catename)
  };
}

function field(label, description, roles = []) {
  return { label, description, roles };
}

function parseRaw(rawJson, raw = null) {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).length) return raw;
  if (!rawJson || typeof rawJson !== "string") return {};
  try {
    return JSON.parse(rawJson);
  } catch {
    return {};
  }
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isCompletedOrder(statusText = "") {
  const text = String(statusText || "");
  return /出库完毕|发货完毕|已发货|已完成/.test(text) && !/未出库|未发货/.test(text);
}

function isOpenProcedure(remainingQty, state = "") {
  if (remainingQty !== null) return remainingQty > 0;
  return !/完工|完成|已结束/.test(String(state || ""));
}
