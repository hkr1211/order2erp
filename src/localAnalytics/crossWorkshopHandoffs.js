// Cross-workshop risk, coverage, and handoff analytics.

import {
  daysBetween,
  normalizeKey,
  number,
  parseDate,
  startOfDay
} from "./utils.js";
import {
  batchAvailableQty,
  findSemiFinishedBatchForDownstream
} from "./semiFinishedBatches.js";
import { classifyWorkshopSection } from "./workshopSections.js";

export function procedureWorkloadByCenter(rows, today) {
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

export function buildCrossWorkshopFlowRisks(rows, today, semiFinishedBatches = []) {
  const openRows = rows.filter(isProcedureOpen);
  const rollingRows = openRows.filter((row) => classifyWorkshopSection(row).key === "rolling");
  const downstreamRows = openRows.filter((row) => {
    const key = classifyWorkshopSection(row).key;
    return key === "stamping" || key === "tungsten_molybdenum";
  });
  const rollingByOrder = groupByOrderNo(rollingRows);
  const risks = [];

  for (const downstream of downstreamRows) {
    if (findSemiFinishedBatchForDownstream(downstream, semiFinishedBatches)) continue;
    const orderNo = normalizeKey(downstream.order_no);
    if (!orderNo || !rollingByOrder.has(orderNo)) {
      continue;
    }
    const upstream = pickMostRelevantRollingPlan(rollingByOrder.get(orderNo), downstream, today);
    if (!upstream) continue;
    const downstreamStart = parseDate(downstream.planned_start_date) || parseDate(downstream.planned_finish_date);
    const upstreamFinish = parseDate(upstream.planned_finish_date);
    const startGap = downstreamStart ? daysBetween(today, startOfDay(downstreamStart)) : 0;
    const upstreamLateForDownstream = upstreamFinish && downstreamStart && startOfDay(upstreamFinish) > startOfDay(downstreamStart);
    const upstreamDelayed = upstreamFinish && startOfDay(upstreamFinish) < today;
    const inMonitorWindow = downstreamStart ? startGap <= 3 : true;
    if (!inMonitorWindow && !upstreamLateForDownstream && !upstreamDelayed) continue;

    const downstreamSection = classifyWorkshopSection(downstream);
    const riskLevel = upstreamDelayed || upstreamLateForDownstream || startGap <= 1 ? "红牌" : "黄牌";
    risks.push({
      risk_level: riskLevel,
      related_no: downstream.order_no || upstream.order_no,
      upstream_section: "轧制",
      downstream_section: downstreamSection.title,
      upstream_work_assignment_id: upstream.work_assignment_id,
      downstream_work_assignment_id: downstream.work_assignment_id,
      match_basis: downstream.order_match_by || upstream.order_match_by || "ERP自带",
      product_name: downstream.product_name || upstream.product_name,
      upstream_procedure: upstream.procedure_name,
      downstream_procedure: downstream.procedure_name,
      upstream_remaining_qty: number(upstream.remaining_qty) || 0,
      downstream_remaining_qty: number(downstream.remaining_qty) || 0,
      upstream_finish_date: upstream.planned_finish_date,
      downstream_start_date: downstream.planned_start_date || downstream.planned_finish_date,
      flow_gap: flowGapText({ upstreamFinish, downstreamStart, upstreamDelayed, upstreamLateForDownstream, startGap }),
      owner_role: "PMC/轧制/后道工段",
      primary_action: riskLevel === "红牌" ? "立即确认轧制完工时间，必要时调整后道开工或插单顺序" : "提前确认轧制交付时间和半成品转序安排"
    });
  }

  return risks
    .sort((a, b) => riskLevelWeight(b.risk_level) - riskLevelWeight(a.risk_level) || String(a.downstream_start_date || "").localeCompare(String(b.downstream_start_date || "")))
    .slice(0, 30);
}

export function buildCrossWorkshopFlowCoverage(rows, risks, today, semiFinishedBatches = []) {
  const openRows = rows.filter(isProcedureOpen);
  const rollingRows = rows.filter((row) => classifyWorkshopSection(row).key === "rolling");
  const rollingOpenRows = openRows.filter((row) => classifyWorkshopSection(row).key === "rolling");
  const downstreamRows = openRows.filter((row) => {
    const key = classifyWorkshopSection(row).key;
    return key === "stamping" || key === "tungsten_molybdenum";
  });
  const rollingByOrder = groupByOrderNo(rollingRows);
  const riskDownstreamIds = new Set((risks || []).map((row) => normalizeKey(row.downstream_work_assignment_id)).filter(Boolean));
  const downstreamNeedMaterial = downstreamRows.filter((row) => downstreamNeedsMaterialSoon(row, today));
  const gaps = downstreamNeedMaterial
    .map((row) => flowCoverageGapRow(row, rollingByOrder, riskDownstreamIds, semiFinishedBatches))
    .filter(Boolean)
    .sort((a, b) => String(a.downstream_start_date || "").localeCompare(String(b.downstream_start_date || "")))
    .slice(0, 30);
  return {
    summary: {
      rolling_open_plans: rollingOpenRows.length,
      rolling_tracked_plans: rollingRows.length,
      downstream_open_plans: downstreamRows.length,
      downstream_need_material_3d: downstreamNeedMaterial.length,
      semi_finished_batches: semiFinishedBatches.length,
      flow_risks: risks.length,
      flow_gaps: gaps.length,
      flow_coverage_rate: downstreamNeedMaterial.length ? Number((((downstreamNeedMaterial.length - gaps.length) / downstreamNeedMaterial.length) * 100).toFixed(1)) : 100
    },
    gaps
  };
}

export function buildCrossWorkshopFlowHandoffs(rows, today, semiFinishedBatches = []) {
  const rollingRows = rows.filter((row) => classifyWorkshopSection(row).key === "rolling");
  const downstreamRows = rows.filter((row) => {
    const key = classifyWorkshopSection(row).key;
    return (key === "stamping" || key === "tungsten_molybdenum") && isProcedureOpen(row) && downstreamNeedsMaterialSoon(row, today);
  });
  const rollingByOrder = groupByOrderNo(rollingRows);
  const handoffs = [];

  for (const downstream of downstreamRows) {
    const batch = findSemiFinishedBatchForDownstream(downstream, semiFinishedBatches);
    if (batch) {
      handoffs.push(batchHandoffRow(downstream, batch));
      continue;
    }
    const orderNo = normalizeKey(downstream.order_no);
    if (!orderNo || !rollingByOrder.has(orderNo)) {
      continue;
    }
    const upstream = pickMostRelevantRollingPlan(rollingByOrder.get(orderNo), downstream, today);
    if (!upstream) continue;
    const upstreamRemainingQty = procedureRemainingQty(upstream);
    const downstreamStart = parseDate(downstream.planned_start_date) || parseDate(downstream.planned_finish_date);
    const upstreamFinish = parseDate(upstream.planned_finish_date);
    const downstreamSection = classifyWorkshopSection(downstream);
    const handoffStatus = crossWorkshopHandoffStatus({ upstreamRemainingQty, upstreamFinish, downstreamStart, today });

    handoffs.push({
      related_no: downstream.order_no || upstream.order_no,
      handoff_status: handoffStatus,
      upstream_section: "轧制",
      downstream_section: downstreamSection.title,
      upstream_work_assignment_id: upstream.work_assignment_id,
      downstream_work_assignment_id: downstream.work_assignment_id,
      product_name: downstream.product_name || upstream.product_name,
      upstream_procedure: upstream.procedure_name,
      downstream_procedure: downstream.procedure_name,
      upstream_remaining_qty: upstreamRemainingQty,
      upstream_finish_date: upstream.planned_finish_date,
      downstream_start_date: downstream.planned_start_date || downstream.planned_finish_date,
      match_basis: downstream.order_match_by || upstream.order_match_by || "ERP自带",
      risk_level: handoffStatus === "可转序" ? "黄牌" : "红牌",
      risk_type: "转序交接",
      problem: `${upstream.work_assignment_id || "轧制前道"} → ${downstream.work_assignment_id || "后道"}：${handoffStatus}`,
      primary_action: crossWorkshopHandoffAction(handoffStatus),
      action: crossWorkshopHandoffAction(handoffStatus),
      buttons: ["确认已入库", "确认已转序", "后道已接收"]
    });
  }

  return handoffs
    .sort((a, b) => handoffStatusWeight(b.handoff_status) - handoffStatusWeight(a.handoff_status) || String(a.downstream_start_date || "").localeCompare(String(b.downstream_start_date || "")))
    .slice(0, 30);
}

function downstreamNeedsMaterialSoon(row, today) {
  const downstreamStart = parseDate(row.planned_start_date) || parseDate(row.planned_finish_date);
  if (!downstreamStart) return true;
  return daysBetween(today, startOfDay(downstreamStart)) <= 3;
}

function procedureRemainingQty(row) {
  const remaining = number(row.remaining_qty);
  if (remaining !== null) return remaining;
  const planned = number(row.planned_qty) || 0;
  const finished = number(row.finished_qty) || 0;
  return Math.max(planned - finished, 0);
}

function crossWorkshopHandoffStatus({ upstreamRemainingQty, upstreamFinish, downstreamStart, today }) {
  if (upstreamRemainingQty <= 0) return "可转序";
  if (upstreamFinish && downstreamStart && startOfDay(upstreamFinish) > startOfDay(downstreamStart)) return "前道晚于后道";
  if (upstreamFinish && startOfDay(upstreamFinish) < today) return "前道已延期";
  return "待跟进";
}

function crossWorkshopHandoffAction(status) {
  if (status === "可转序") return "确认半成品入库/转序到后道，避免后道等料";
  if (status === "前道晚于后道") return "调整后道开工或压缩轧制完工时间";
  if (status === "前道已延期") return "催轧制确认完工时间，并同步后道计划";
  return "跟进轧制完工进度，提前安排转序交接";
}

function handoffStatusWeight(status) {
  if (status === "前道已延期") return 4;
  if (status === "前道晚于后道") return 3;
  if (status === "待跟进") return 2;
  if (status === "可转序") return 1;
  return 0;
}

function batchHandoffRow(downstream, batch) {
  const downstreamSection = classifyWorkshopSection(downstream);
  const availableQty = batchAvailableQty(batch);
  const batchNo = batch.batch_no || batch.inventory_id || "";
  return {
    related_no: downstream.order_no || "未关联订单",
    handoff_status: "半成品可用",
    upstream_section: "半成品库存",
    downstream_section: downstreamSection.title,
    upstream_work_assignment_id: batchNo,
    downstream_work_assignment_id: downstream.work_assignment_id,
    product_name: downstream.product_name || batch.product_name,
    upstream_procedure: "库存批次",
    downstream_procedure: downstream.procedure_name,
    upstream_remaining_qty: Number(availableQty.toFixed(2)),
    upstream_finish_date: batch.initial_inbound_time || batch.inbound_confirmed_time || "",
    downstream_start_date: downstream.planned_start_date || downstream.planned_finish_date,
    match_basis: "库存批次匹配",
    warehouse: batch.warehouse,
    batch_no: batchNo,
    risk_level: "黄牌",
    risk_type: "转序交接",
    problem: `${batch.warehouse || "半成品库存"} ${batchNo || batch.product_name || "库存批次"} → ${downstream.work_assignment_id || "后道"}：半成品可用`,
    primary_action: "确认库存批次锁定、转序出库和后道接收时间",
    action: "确认库存批次锁定、转序出库和后道接收时间",
    buttons: ["锁定批次", "确认已转序", "后道已接收"]
  };
}

function flowCoverageGapRow(row, rollingByOrder, riskDownstreamIds, semiFinishedBatches = []) {
  const orderNo = normalizeKey(row.order_no);
  const downstreamId = normalizeKey(row.work_assignment_id);
  const downstreamSection = classifyWorkshopSection(row);
  const matchedBatch = findSemiFinishedBatchForDownstream(row, semiFinishedBatches);
  if (matchedBatch) {
    return null;
  }
  if (!orderNo) {
    return {
      downstream_section: downstreamSection.title,
      downstream_work_assignment_id: row.work_assignment_id,
      product_name: row.product_name,
      downstream_procedure: row.procedure_name,
      downstream_start_date: row.planned_start_date || row.planned_finish_date,
      match_basis: row.order_match_by || "未关联",
      reason: "后道派工缺少销售订单号",
      action: "先在派工-订单绑定页确认销售订单"
    };
  }
  if (!rollingByOrder.has(orderNo)) {
    return {
      related_no: row.order_no,
      downstream_section: downstreamSection.title,
      downstream_work_assignment_id: row.work_assignment_id,
      product_name: row.product_name,
      downstream_procedure: row.procedure_name,
      downstream_start_date: row.planned_start_date || row.planned_finish_date,
      match_basis: row.order_match_by || "ERP自带",
      reason: "已关联订单但没有可识别的轧制前道",
      action: "确认该订单是否需要轧制半成品，必要时绑定前道轧制派工"
    };
  }
  if (!riskDownstreamIds.has(downstreamId)) {
    return null;
  }
  return null;
}

function isProcedureOpen(row) {
  const remaining = number(row.remaining_qty);
  const finished = number(row.finished_qty) || 0;
  const planned = number(row.planned_qty) || 0;
  if (remaining !== null) return remaining > 0;
  if (planned > 0) return finished < planned;
  return !/完工|完成/.test(String(row.state || ""));
}

function groupByOrderNo(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const orderNo = normalizeKey(row.order_no);
    if (!orderNo) continue;
    if (!grouped.has(orderNo)) grouped.set(orderNo, []);
    grouped.get(orderNo).push(row);
  }
  return grouped;
}

function pickMostRelevantRollingPlan(rows, downstream, today) {
  const downstreamStart = parseDate(downstream.planned_start_date) || parseDate(downstream.planned_finish_date);
  return [...rows]
    .sort((a, b) => rollingPlanWeight(b, downstreamStart, today) - rollingPlanWeight(a, downstreamStart, today))
    [0] || null;
}

function rollingPlanWeight(row, downstreamStart, today) {
  const finish = parseDate(row.planned_finish_date);
  const remaining = number(row.remaining_qty) || 0;
  let score = remaining;
  if (finish && startOfDay(finish) < today) score += 10000;
  if (finish && downstreamStart && startOfDay(finish) > startOfDay(downstreamStart)) score += 5000;
  if (finish && downstreamStart) score -= Math.abs(daysBetween(startOfDay(finish), startOfDay(downstreamStart))) * 10;
  return score;
}

function flowGapText({ upstreamFinish, downstreamStart, upstreamDelayed, upstreamLateForDownstream, startGap }) {
  if (upstreamDelayed) return "轧制已延期";
  if (upstreamLateForDownstream) return "轧制晚于后道开工";
  if (downstreamStart && startGap <= 1) return "后道今天/明天要料";
  if (downstreamStart && startGap <= 3) return "后道3天内要料";
  return "需确认转序";
}

function riskLevelWeight(level) {
  return String(level || "").includes("红") ? 2 : 1;
}
