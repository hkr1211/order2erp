// Sales order and procedure-plan coverage analytics.

import {
  normalizeKey
} from "./utils.js";
import {
  findAssistedOrderMatch,
  findManualProcedureLink,
  findReportSubjectOrderMatch,
  procedureKey,
  procedureLinkHref,
  productMatchKey
} from "./procedureMatching.js";

export function buildOrderProcedureCoverage(orders, procedures, procedureLinks = [], processReports = []) {
  const orderNos = new Set(orders.map((row) => normalizeKey(row.order_no)).filter(Boolean));
  const orderByNo = new Map(orders.map((row) => [normalizeKey(row.order_no), row]).filter(([key]) => Boolean(key)));
  const matchedOrderNos = new Set();
  const matchedProcedureKeys = new Set();
  const matches = [];

  procedures.forEach((row, index) => {
    const link = findManualProcedureLink(row, procedureLinks);
    const orderNo = normalizeKey(link?.order_no);
    if (!orderNo || !orderByNo.has(orderNo)) return;
    matchedOrderNos.add(orderNo);
    matchedProcedureKeys.add(procedureKey(row, index));
    matches.push(matchRow(orderByNo.get(orderNo), row, "人工绑定"));
  });

  procedures.forEach((row, index) => {
    const key = procedureKey(row, index);
    if (matchedProcedureKeys.has(key)) return;
    const orderNo = normalizeKey(row.order_no);
    if (orderNo && orderByNo.has(orderNo)) {
      matchedOrderNos.add(orderNo);
      matchedProcedureKeys.add(key);
      matches.push(matchRow(orderByNo.get(orderNo), row, "订单号精确匹配"));
    }
  });

  procedures.forEach((row, index) => {
    const key = procedureKey(row, index);
    if (matchedProcedureKeys.has(key)) return;
    const reportSubjectOrder = findReportSubjectOrderMatch(row, orders, processReports, matchedOrderNos);
    if (!reportSubjectOrder) return;
    matchedOrderNos.add(normalizeKey(reportSubjectOrder.order_no));
    matchedProcedureKeys.add(key);
    matches.push(matchRow(reportSubjectOrder, row, "工序汇报主题匹配"));
  });

  procedures.forEach((row, index) => {
    const key = procedureKey(row, index);
    if (matchedProcedureKeys.has(key)) return;
    const assistedOrder = findAssistedOrderMatch(row, orders, matchedOrderNos);
    if (!assistedOrder) return;
    matchedOrderNos.add(normalizeKey(assistedOrder.order_no));
    matchedProcedureKeys.add(key);
    matches.push(matchRow(assistedOrder, row, "产品+日期辅助匹配"));
  });

  const allUnmatchedProcedures = procedures
    .filter((row, index) => {
      return !matchedProcedureKeys.has(procedureKey(row, index));
    })
    .map((row) => ({
      work_assignment_id: row.work_assignment_id,
      order_no: row.order_no,
      product_name: row.product_name,
      procedure_name: row.procedure_name,
      work_center_name: row.work_center_name,
      remaining_qty: row.remaining_qty,
      planned_finish_date: row.planned_finish_date,
      reason: unmatchedProcedureReason(row, orderNos),
      link_action: procedureLinkHref(row)
    }));
  const unmatchedProcedures = allUnmatchedProcedures.slice(0, 30);
  const salesOrdersWithoutProcedure = orders.filter((row) => !matchedOrderNos.has(normalizeKey(row.order_no))).length;
  const manualMatches = matches.filter((row) => row.matched_by === "人工绑定").length;
  const assistedMatches = matches.filter((row) => row.matched_by === "产品+日期辅助匹配").length;
  const exactMatches = matches.filter((row) => row.matched_by === "订单号精确匹配").length;
  const reportSubjectMatches = matches.filter((row) => row.matched_by === "工序汇报主题匹配").length;
  const matchRate = orderNos.size ? Number(((matchedOrderNos.size / orderNos.size) * 100).toFixed(1)) : 0;
  return {
    match_rate: matchRate,
    manual_matched_orders: manualMatches,
    report_subject_matched_orders: reportSubjectMatches,
    assisted_matched_orders: assistedMatches,
    unmatched_procedure_plans: unmatchedProcedures,
    matches: matches.slice(0, 30),
    summary: {
      sales_orders: orderNos.size,
      procedure_plans: procedures.length,
      matched_orders: matchedOrderNos.size,
      manual_matched_orders: manualMatches,
      exact_matched_orders: exactMatches,
      report_subject_matched_orders: reportSubjectMatches,
      assisted_matched_orders: assistedMatches,
      sales_orders_without_procedure: salesOrdersWithoutProcedure,
      unmatched_procedure_plans: allUnmatchedProcedures.length,
      match_rate: matchRate
    }
  };
}

function matchRow(order, procedure, matchedBy) {
  return {
    order_no: order.order_no,
    customer: order.customer,
    product_name: order.product_name,
    delivery_date: order.delivery_date,
    work_assignment_id: procedure.work_assignment_id,
    procedure_name: procedure.procedure_name,
    work_center_name: procedure.work_center_name,
    planned_finish_date: procedure.planned_finish_date,
    matched_by: matchedBy
  };
}

function unmatchedProcedureReason(row, orderNos) {
  const orderNo = normalizeKey(row.order_no);
  if (orderNo && !orderNos.has(orderNo)) return "派工订单号未命中销售订单";
  if (!orderNo && productMatchKey(row.product_name)) return "派工缺少订单号且未找到可靠产品/日期匹配";
  return "派工缺少订单号";
}
