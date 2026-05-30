import {
  daysBetween,
  normalizeKey,
  parseDate,
  parseJson,
  startOfDay
} from "./utils.js";

export function buildProcedureOrderMatchMap(procedures, orders, procedureLinks = [], processReports = []) {
  const orderByNo = new Map(orders.map((row) => [normalizeKey(row.order_no), row]).filter(([key]) => Boolean(key)));
  const matches = new Map();

  procedures.forEach((row, index) => {
    const link = findManualProcedureLink(row, procedureLinks);
    const orderNo = normalizeKey(link?.order_no);
    if (!orderNo || !orderByNo.has(orderNo)) return;
    matches.set(procedureKey(row, index), { order_no: orderByNo.get(orderNo).order_no, matched_by: "人工绑定" });
  });

  procedures.forEach((row, index) => {
    const key = procedureKey(row, index);
    if (matches.has(key)) return;
    const orderNo = normalizeKey(row.order_no);
    if (orderNo && orderByNo.has(orderNo)) {
      matches.set(key, { order_no: orderByNo.get(orderNo).order_no, matched_by: "ERP自带" });
    }
  });

  procedures.forEach((row, index) => {
    const key = procedureKey(row, index);
    if (matches.has(key)) return;
    const reportSubjectOrder = findReportSubjectOrderMatch(row, orders, processReports, new Set());
    if (!reportSubjectOrder) return;
    matches.set(key, { order_no: reportSubjectOrder.order_no, matched_by: "工序汇报主题匹配" });
  });

  procedures.forEach((row, index) => {
    const key = procedureKey(row, index);
    if (matches.has(key)) return;
    const assistedOrder = findAssistedOrderMatch(row, orders, new Set());
    if (!assistedOrder) return;
    matches.set(key, { order_no: assistedOrder.order_no, matched_by: "产品+日期辅助匹配" });
  });

  return matches;
}

export function normalizeProcedurePlan(row) {
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

export function enrichProcedureOrderMatch(row, match = null) {
  if (!match?.order_no || normalizeKey(row.order_no) === normalizeKey(match.order_no)) {
    return {
      ...row,
      order_match_by: match?.matched_by || (row.order_no ? "ERP自带" : "")
    };
  }
  return {
    ...row,
    original_order_no: row.order_no || "",
    order_no: match.order_no,
    order_match_by: match.matched_by || "匹配补齐"
  };
}

export function procedureKey(row, index) {
  return row.work_assignment_id || row.erp_id || `${row.product_name || "procedure"}-${row.procedure_name || ""}-${index}`;
}

export function procedureLinkHref(row) {
  const params = new URLSearchParams();
  params.set("work_assignment_id", row.work_assignment_id || "");
  params.set("procedure_name", row.procedure_name || "");
  params.set("product_name", row.product_name || "");
  return `/procedure-links?${params.toString()}`;
}

export function findManualProcedureLink(procedure, links) {
  const workAssignmentId = normalizeKey(procedure.work_assignment_id);
  if (!workAssignmentId || !Array.isArray(links)) return null;
  const procedureName = productMatchKey(procedure.procedure_name);
  return links.find((link) => {
    if (normalizeKey(link.work_assignment_id) !== workAssignmentId) return false;
    const linkedProcedure = productMatchKey(link.procedure_name);
    return !linkedProcedure || linkedProcedure === procedureName;
  }) || null;
}

export function findAssistedOrderMatch(procedure, orders, alreadyMatchedOrderNos) {
  const procedureProduct = productMatchKey(procedure.product_name);
  const finishDate = parseDate(procedure.planned_finish_date);
  if (!procedureProduct || !finishDate) return null;
  const candidates = orders
    .filter((order) => !alreadyMatchedOrderNos.has(normalizeKey(order.order_no)))
    .map((order) => {
      const orderProduct = productMatchKey(order.product_name);
      const deliveryDate = parseDate(order.delivery_date);
      if (!orderProduct || !deliveryDate) return null;
      const productScore = productSimilarity(procedureProduct, orderProduct);
      const dateGap = Math.abs(daysBetween(startOfDay(finishDate), startOfDay(deliveryDate)));
      if (productScore < 0.9 || dateGap > 14) return null;
      return { order, productScore, dateGap };
    })
    .filter(Boolean)
    .sort((a, b) => b.productScore - a.productScore || a.dateGap - b.dateGap);
  return candidates[0]?.order || null;
}

export function findReportSubjectOrderMatch(procedure, orders, processReports = [], alreadyMatchedOrderNos = new Set()) {
  const product = productMatchKey(procedure.product_name);
  const procedureName = productMatchKey(procedure.procedure_name);
  if (!product || !procedureName) return null;
  const report = processReports.find((row) =>
    productMatchKey(row.product_name) === product &&
    productMatchKey(row.procedure_name) === procedureName
  );
  const subjectRef = extractSubjectReference(report?.subject);
  if (!subjectRef) return null;
  const candidates = orders.filter((order) => {
    if (alreadyMatchedOrderNos.has(normalizeKey(order.order_no))) return false;
    const raw = order.raw || safeParseJson(order.raw_json) || {};
    const text = [order.order_no, order.customer, order.product_name, order.raw_json, raw.title, raw.htid, raw.ord, raw.order_no]
      .filter(Boolean)
      .join(" ");
    return text.includes(subjectRef);
  });
  return candidates.length === 1 ? candidates[0] : null;
}

export function productMatchKey(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[()（）\[\]【】,，;；:_\-—/\\]/g, "");
}

function extractSubjectReference(value) {
  const matches = String(value || "").match(/\d{5,6}/g) || [];
  return matches[0] || "";
}

function safeParseJson(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function productSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  }
  return 0;
}
