export function buildBomKitChecks({ orders = [], bomRows = [], inventoryRows = [] } = {}) {
  const inventoryIndex = buildInventoryIndex(inventoryRows);

  return orders.map((order) => {
    const orderNo = text(order.order_no || order.sales_order_no || order.ord);
    const orderProductCode = text(order.product_code);
    const orderProductName = text(order.product_name || order.item);
    const orderQty = positiveNumber(order.remaining_qty ?? order.quantity ?? order.order_qty ?? order.planned_qty) || 1;
    const components = bomRows.filter((row) => bomMatchesOrder(row, orderProductCode, orderProductName));

    if (!components.length) {
      return {
        order_no: orderNo,
        product_code: orderProductCode,
        product_name: orderProductName,
        demand_qty: orderQty,
        kit_status: "数据不足",
        data_status: "缺BOM",
        shortage_components: 0,
        components: [],
        suggested_action: "补齐BOM后再判断齐套状态"
      };
    }

    const componentRows = components.map((component) => {
      const componentCode = text(component.component_code || component.material_code || component.product_code);
      const componentName = text(component.component_name || component.material_name || component.product_name);
      const unitUsage = positiveNumber(component.usage_qty ?? component.qty_per ?? component.quantity) || 0;
      const requiredQty = roundQty(orderQty * unitUsage);
      const availableQty = roundQty(inventoryQty(inventoryIndex, componentCode, componentName));
      const shortageQty = roundQty(Math.max(0, requiredQty - availableQty));

      return {
        component_code: componentCode,
        component_name: componentName,
        unit: text(component.unit) || "kg",
        usage_qty: unitUsage,
        required_qty: requiredQty,
        available_qty: availableQty,
        shortage_qty: shortageQty,
        component_status: shortageQty > 0 ? "短缺" : "齐套"
      };
    });
    const shortageComponents = componentRows.filter((row) => row.shortage_qty > 0).length;

    return {
      order_no: orderNo,
      product_code: orderProductCode,
      product_name: orderProductName,
      demand_qty: orderQty,
      kit_status: shortageComponents > 0 ? "短缺" : "齐套",
      data_status: "已匹配BOM",
      shortage_components: shortageComponents,
      components: componentRows,
      suggested_action: shortageComponents > 0 ? "优先确认库存、在途采购和替代料" : "按计划开工并保留齐套记录"
    };
  });
}

export function buildBatchFlowSuggestions({ today = new Date(), procedurePlans = [], inventoryRows = [] } = {}) {
  const day = startOfDay(today);

  return procedurePlans
    .filter((row) => isOpenPlan(row))
    .filter((row) => isDownstreamPlan(row))
    .filter((row) => isNearStart(row, day))
    .map((plan) => {
      const neededQty = positiveNumber(plan.remaining_qty ?? plan.planned_qty ?? plan.quantity) || 0;
      const match = bestInventoryMatch(plan, inventoryRows);
      const availableQty = roundQty(positiveNumber(match?.available_qty ?? match?.stock_qty) || 0);
      const hasBatch = Boolean(match && availableQty > 0);

      return {
        work_assignment_id: text(plan.work_assignment_id || plan.procedure_id || plan.id),
        order_no: text(plan.order_no || plan.sales_order_no),
        product_name: text(plan.product_name),
        procedure_name: text(plan.procedure_name),
        work_center_name: text(plan.work_center_name),
        needed_qty: neededQty,
        planned_start_date: text(plan.planned_start_date),
        warehouse: text(match?.warehouse),
        batch_no: text(match?.batch_no || match?.lot_no),
        available_qty: availableQty,
        flow_status: hasBatch ? "可用批次" : "缺少可用批次",
        suggested_action: hasBatch ? "确认批次可用并安排转序/领料" : "确认轧制前道完工、入库批次或替代库存"
      };
    });
}

export function buildOrderFlowLinks({ orders = [], procedurePlans = [], materialAlerts = [], inventoryRows = [] } = {}) {
  const proceduresByOrder = groupBy(procedurePlans, (row) => text(row.order_no || row.sales_order_no));
  const alertsByOrder = groupBy(materialAlerts, (row) => text(row.order_no || row.sales_order_no));

  return orders
    .map((order) => {
      const orderNo = text(order.order_no || order.sales_order_no || order.ord);
      if (!orderNo) return null;
      const procedures = proceduresByOrder.get(orderNo) || [];
      const alerts = alertsByOrder.get(orderNo) || [];
      const batches = inventoryRows.filter((row) => inventoryMatchesProduct(row, order));
      const materialRiskCount = alerts.filter((row) => /shortage|缺料|短缺/.test(`${row.alert_type || ""} ${row.priority || ""}`) || positiveNumber(row.shortage_qty) > 0).length;
      const availableBatchCount = batches.filter((row) => (positiveNumber(row.available_qty ?? row.stock_qty) || 0) > 0).length;
      const flowStatus = flowStatusForLink({ procedures, materialRiskCount, availableBatchCount });

      return {
        order_no: orderNo,
        customer: text(order.customer),
        owner: text(order.owner),
        product_name: text(order.product_name),
        delivery_date: text(order.delivery_date),
        procedure_count: procedures.length,
        latest_work_assignment_id: procedures[0]?.work_assignment_id || procedures[0]?.procedure_id || "",
        latest_procedure_name: procedures[0]?.procedure_name || "",
        latest_work_center_name: procedures[0]?.work_center_name || "",
        material_risk_count: materialRiskCount,
        available_batch_count: availableBatchCount,
        available_batch_nos: batches.map((row) => text(row.batch_no || row.lot_no)).filter(Boolean).slice(0, 5).join("、"),
        flow_status: flowStatus,
        suggested_action: flowSuggestionForLink(flowStatus)
      };
    })
    .filter(Boolean)
    .filter((row) => row.procedure_count || row.material_risk_count || row.available_batch_count);
}

export function attachPredictionSuggestions(risks = [], { today = new Date() } = {}) {
  const day = startOfDay(today);
  return risks.map((risk) => {
    const prediction = predictionForRisk(risk, day);
    return {
      ...risk,
      prediction_level: prediction.prediction_level,
      prediction_reason: prediction.prediction_reason,
      planning_suggestion: prediction.planning_suggestion
    };
  });
}

function predictionForRisk(risk = {}, today) {
  const type = text(risk.risk_type || risk.exception_type);
  const level = text(risk.risk_level);
  const dueGap = daysUntil(risk.due_date || risk.planned_finish_date || risk.delivery_date, today);
  const isUrgent = level.includes("红") || (dueGap !== null && dueGap <= 1);

  if (/物料|缺料|断供/.test(type)) {
    return {
      prediction_level: isUrgent ? "高" : "中",
      prediction_reason: dueGap === null ? "物料风险已触发，需要确认库存和到货口径" : `物料风险距离计划节点${dueGap}天`,
      planning_suggestion: "先确认可替代库存、在途到货和是否需要调整排产"
    };
  }

  if (/前道|转序|批次/.test(type)) {
    return {
      prediction_level: isUrgent ? "高" : "中",
      prediction_reason: dueGap === null ? "前道转序数据存在断点" : `前道转序距离后道开工${dueGap}天`,
      planning_suggestion: "先确认前道完工、半成品入库和后道开工窗口"
    };
  }

  if (/产能|工序|瓶颈/.test(type)) {
    return {
      prediction_level: /瓶颈/.test(type) || isUrgent ? "高" : "中",
      prediction_reason: dueGap === null ? "产能或工序风险需要确认设备、班次和外协资源" : `产能风险距离计划节点${dueGap}天`,
      planning_suggestion: "先确认瓶颈设备、可用班次和外协选择"
    };
  }

  if (/交期|逾期|超期/.test(type)) {
    return {
      prediction_level: isUrgent ? "高" : "中",
      prediction_reason: dueGap === null ? "交期风险已触发，需要确认实际发货状态" : `交期距离今天${dueGap}天`,
      planning_suggestion: "先确认能否发货、是否通知客户和新的承诺交期"
    };
  }

  if (/财务|应收|应付|欠款|付款/.test(type)) {
    return {
      prediction_level: isUrgent ? "高" : "中",
      prediction_reason: dueGap === null ? "财务风险需要核对应收应付状态" : `财务风险距离到期${dueGap}天`,
      planning_suggestion: "先确认责任人、付款计划和是否影响发货/采购"
    };
  }

  return {
    prediction_level: isUrgent ? "中" : "低",
    prediction_reason: dueGap === null ? "标准风险模型已识别，缺少更细预测字段" : `距离关联日期${dueGap}天`,
    planning_suggestion: "确认责任人、处理时限和下一次反馈节点"
  };
}

function buildInventoryIndex(rows = []) {
  const index = new Map();
  for (const row of rows) {
    const qty = positiveNumber(row.available_qty ?? row.stock_qty ?? row.qty ?? row.quantity) || 0;
    for (const key of uniqueKeys(row.product_code, row.component_code, row.material_code, row.product_name, row.component_name, row.material_name)) {
      index.set(key, (index.get(key) || 0) + qty);
    }
  }
  return index;
}

function inventoryQty(index, code, name) {
  const codeKey = text(code);
  const nameKey = text(name);
  if (codeKey && index.has(codeKey)) return index.get(codeKey);
  if (nameKey && index.has(nameKey)) return index.get(nameKey);
  return 0;
}

function bomMatchesOrder(row, productCode, productName) {
  const parentCode = text(row.parent_product_code || row.parent_code || row.product_code);
  const parentName = text(row.parent_product_name || row.parent_name || row.product_name);
  return Boolean(
    (productCode && parentCode && productCode === parentCode) ||
    (productName && parentName && productName === parentName)
  );
}

function bestInventoryMatch(plan, inventoryRows = []) {
  const productName = text(plan.product_name);
  const productModel = text(plan.product_model || plan.spec || plan.model);
  const candidates = inventoryRows
    .map((row) => ({ row, score: inventoryMatchScore(row, productName, productModel) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || (positiveNumber(b.row.available_qty ?? b.row.stock_qty) || 0) - (positiveNumber(a.row.available_qty ?? a.row.stock_qty) || 0));
  return candidates[0]?.row || null;
}

function inventoryMatchesProduct(row = {}, order = {}) {
  const rowName = text(row.product_name || row.material_name);
  const orderName = text(order.product_name || order.item);
  const rowCode = text(row.product_code || row.material_code);
  const orderCode = text(order.product_code);
  if (orderCode && rowCode && orderCode === rowCode) return true;
  return Boolean(orderName && rowName && (orderName.includes(rowName) || rowName.includes(orderName)));
}

function flowStatusForLink({ procedures = [], materialRiskCount = 0, availableBatchCount = 0 } = {}) {
  if (materialRiskCount && availableBatchCount) return "有风险可调度";
  if (materialRiskCount) return "缺料待处理";
  if (procedures.length && availableBatchCount) return "可转序/领料";
  if (procedures.length) return "生产跟踪中";
  return "数据不足";
}

function flowSuggestionForLink(status = "") {
  if (status === "有风险可调度") return "确认缺料是否可由现有批次调拨，并同步调整后续工序";
  if (status === "缺料待处理") return "确认采购到货、替代料或排程调整方案";
  if (status === "可转序/领料") return "确认批次可用并安排转序/领料";
  if (status === "生产跟踪中") return "跟踪当前工序完工时间和后续工段开工窗口";
  return "补齐订单、工序、物料或批次关联数据";
}

function groupBy(rows = [], keyFn) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const bucket = grouped.get(key) || [];
    bucket.push(row);
    grouped.set(key, bucket);
  }
  return grouped;
}

function inventoryMatchScore(row, productName, productModel) {
  const rowName = text(row.product_name || row.material_name);
  const rowModel = text(row.product_model || row.model || row.spec);
  const warehouse = text(row.warehouse);
  let score = /带箔材产成品|半成品|可利用|产成品/.test(warehouse) ? 2 : 0;
  if (productName && rowName && (productName.includes(rowName) || rowName.includes(productName))) score += 5;
  if (productModel && rowModel && (productModel.includes(rowModel) || rowModel.includes(productModel))) score += 2;
  return score;
}

function isOpenPlan(row) {
  const state = text(row.state || row.status);
  const remainingQty = positiveNumber(row.remaining_qty);
  if (/完工|完成|关闭|已结/.test(state)) return false;
  return remainingQty === null || remainingQty > 0;
}

function isDownstreamPlan(row) {
  const textValue = `${text(row.procedure_name)} ${text(row.work_center_name)}`;
  if (/轧制|冷轧|热轧/.test(textValue)) return false;
  return /冲压|冲圆|落料|钨钼|钨|钼|机加|机加工/.test(textValue);
}

function isNearStart(row, today) {
  const start = parseDate(row.planned_start_date || row.start_date);
  if (!start) return true;
  const gap = daysBetween(today, startOfDay(start));
  return gap >= -1 && gap <= 7;
}

function uniqueKeys(...values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function daysUntil(value, today) {
  const date = parseDate(value);
  if (!date) return null;
  return daysBetween(today, startOfDay(date));
}

function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function startOfDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function positiveNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function roundQty(value) {
  const number = positiveNumber(value);
  return number === null ? 0 : Math.round(number * 100) / 100;
}

function text(value) {
  return String(value ?? "").trim();
}
