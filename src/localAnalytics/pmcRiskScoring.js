// PMC command risk scoring and standard risk row creation.

import { createStandardRisk } from "../models/riskModel.js";
import {
  daysBetween,
  number,
  parseDate,
  startOfDay
} from "./utils.js";
import {
  commandProblemText,
  escalationRuleForIntervention,
  expectedRiskOutput,
  feedbackDeadlineForRisk,
  interventionButtons,
  ruleReasonForRisk
} from "./pmcRiskActions.js";
import { formatQuantity } from "./pmcRiskTasks.js";

export function sortCommandRisks(rows = []) {
  return [...rows].sort((a, b) =>
    Number(b.risk_score || 0) - Number(a.risk_score || 0) ||
    riskLevelWeight(b.risk_level) - riskLevelWeight(a.risk_level) ||
    riskTypeWeight(b.risk_type) - riskTypeWeight(a.risk_type) ||
    String(a.due_date || "").localeCompare(String(b.due_date || ""))
  );
}

export function commandRiskRows(rows, riskType, fallbackType, today = new Date()) {
  return rows.map((row) => {
    const type = riskType || fallbackType || row.exception_type;
    const buttons = interventionButtons(type);
    const riskLevel = isRedRiskType(type) ? "红牌" : "黄牌";
    const score = commandRiskScore({ ...row, risk_level: riskLevel, risk_type: type }, today);
    return createStandardRisk({
      risk_level: riskLevel,
      risk_type: type,
      risk_score: score.risk_score,
      score_reason: score.score_reason,
      related_no: row.related_no,
      related_object: row.related_object,
      source_table: row.source_table,
      source_key: row.source_key || row.related_no,
      source_rule: row.source_rule || `pmc.${type}`,
      match_method: row.match_method || row.match_basis || row.order_match_by,
      problem: commandProblemText(type, row),
      item: row.item,
      upstream_section: row.upstream_section,
      downstream_section: row.downstream_section,
      upstream_work_assignment_id: row.upstream_work_assignment_id,
      downstream_work_assignment_id: row.downstream_work_assignment_id,
      match_basis: row.match_basis,
      upstream_finish_date: row.upstream_finish_date,
      downstream_start_date: row.downstream_start_date,
      flow_gap: row.flow_gap,
      quantity: row.quantity,
      quantity_text: row.quantity_text || formatQuantity(row.quantity, row.unit),
      due_date: row.due_date,
      owner_role: row.responsible_role,
      responsible_owner: row.responsible_role || "PMC",
      feedback_deadline: feedbackDeadlineForRisk({ risk_level: riskLevel, risk_type: type }),
      escalation_rule: escalationRuleForIntervention({ risk_level: riskLevel, risk_type: type }),
      expected_output: expectedRiskOutput(type),
      primary_action: row.action,
      rule_reason: ruleReasonForRisk(type, row),
      buttons,
      source_status: row.status
    });
  });
}

export function priorityWeight(priority) {
  if (priority === "高") return 3;
  if (priority === "中") return 2;
  return 1;
}

export function riskTypeWeight(type) {
  if (type === "前道断点") return 6;
  if (type === "前道预警") return 5;
  if (type === "产能瓶颈") return 5;
  if (type === "物料断供") return 5;
  if (type === "冲压延期") return 5;
  if (type === "交期超期") return 4;
  if (type === "交期预警") return 3;
  if (type === "产能预警") return 3;
  if (type === "物料预警") return 3;
  if (type === "订单缺料") return 4;
  if (type === "交期逾期") return 3;
  if (type === "临期交付") return 2;
  return 1;
}

function commandRiskScore(row, today) {
  const reasons = [];
  let score = String(row.risk_level || "").includes("红") ? 60 : 30;
  reasons.push(String(row.risk_level || "").includes("红") ? "红牌基础60" : "黄牌基础30");

  const typeBonus = riskTypeWeight(row.risk_type) * 5;
  score += typeBonus;
  reasons.push(`${row.risk_type || "风险"}权重+${typeBonus}`);

  const dueDate = parseDate(row.due_date);
  if (dueDate) {
    const gap = daysBetween(today, startOfDay(dueDate));
    if (gap < 0) {
      score += 20;
      reasons.push("已超过计划/交期+20");
    } else if (gap <= 1) {
      score += 15;
      reasons.push("今天/明天到期+15");
    } else if (gap <= 3) {
      score += 10;
      reasons.push("3天内到期+10");
    } else if (gap <= 7) {
      score += 5;
      reasons.push("7天内到期+5");
    }
  }

  if ((number(row.quantity) || 0) > 0) {
    score += 5;
    reasons.push("存在剩余/缺口数量+5");
  }

  return {
    risk_score: Math.min(100, score),
    score_reason: reasons.join("；")
  };
}

function isRedRiskType(type) {
  return ["前道断点", "冲压延期", "产能瓶颈", "物料断供", "交期超期"].includes(type);
}

function riskLevelWeight(level) {
  return String(level || "").includes("红") ? 2 : 1;
}
