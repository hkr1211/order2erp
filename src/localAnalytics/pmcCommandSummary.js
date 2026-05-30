// PMC command summaries for morning brief, risk type, owner, and pool metrics.

import { meetingFocusForRisk } from "./pmcRiskActions.js";
import { riskTypeWeight, sortCommandRisks } from "./pmcRiskScoring.js";

export function buildMorningBrief({ redRisks = [], yellowRisks = [] } = {}) {
  const headlineRows = sortCommandRisks([...redRisks, ...yellowRisks]).slice(0, 6);

  return headlineRows.map((row, index) => {
    const buttons = Array.isArray(row.buttons) ? row.buttons.slice(0, 3) : ["标记处理中"];
    return {
      priority_no: index + 1,
      risk_level: row.risk_level,
      risk_type: row.risk_type,
      headline: `${row.risk_type || "风险"}：${row.problem || row.related_no || "待确认"}`,
      problem: row.problem,
      related_no: row.related_no,
      risk_score: row.risk_score,
      score_reason: row.score_reason,
      owner_role: row.owner_role || "PMC",
      next_action: row.primary_action || "确认责任人和完成时间",
      primary_action: row.primary_action,
      meeting_focus: meetingFocusForRisk(row.risk_type),
      action_label: buttons[0] || "标记处理中",
      buttons
    };
  });
}

export function buildRiskTypeSummary({ redRisks = [], yellowRisks = [] } = {}) {
  const grouped = new Map();
  for (const row of [...redRisks, ...yellowRisks]) {
    const riskType = row.risk_type || "未分类风险";
    const current = grouped.get(riskType) || {
      risk_type: riskType,
      red_count: 0,
      yellow_count: 0,
      risk_count: 0,
      owner_role: row.owner_role || "PMC",
      next_action: meetingFocusForRisk(riskType),
      sample_problem: row.problem || ""
    };
    if (String(row.risk_level || "").includes("红")) {
      current.red_count += 1;
    } else {
      current.yellow_count += 1;
    }
    current.risk_count += 1;
    if (!current.sample_problem && row.problem) current.sample_problem = row.problem;
    if (!current.owner_role && row.owner_role) current.owner_role = row.owner_role;
    grouped.set(riskType, current);
  }
  return [...grouped.values()]
    .sort((a, b) => b.red_count - a.red_count || b.risk_count - a.risk_count || riskTypeWeight(b.risk_type) - riskTypeWeight(a.risk_type))
    .slice(0, 12);
}

export function buildRiskOwnerSummary({ redRisks = [], yellowRisks = [] } = {}) {
  const grouped = new Map();
  for (const row of [...redRisks, ...yellowRisks]) {
    const ownerRole = row.owner_role || "未分配责任";
    const current = grouped.get(ownerRole) || {
      owner_role: ownerRole,
      red_count: 0,
      yellow_count: 0,
      todo_count: 0,
      top_risk_type: row.risk_type || "",
      next_action: row.primary_action || meetingFocusForRisk(row.risk_type),
      sample_problem: row.problem || ""
    };
    if (String(row.risk_level || "").includes("红")) {
      current.red_count += 1;
    } else {
      current.yellow_count += 1;
    }
    current.todo_count += 1;
    if (!current.sample_problem && row.problem) current.sample_problem = row.problem;
    if (!current.next_action && row.primary_action) current.next_action = row.primary_action;
    grouped.set(ownerRole, current);
  }
  return [...grouped.values()]
    .sort((a, b) => b.red_count - a.red_count || b.todo_count - a.todo_count || String(a.owner_role || "").localeCompare(String(b.owner_role || "")))
    .slice(0, 12);
}

export function buildCommandRiskPoolSummary({ redRisks = [], yellowRisks = [], orders = [], procedures = [], materialAlerts = [], financeRows = [] } = {}) {
  const riskItemCount = redRisks.length + yellowRisks.length;
  const monitoredItemCount = orders.length + procedures.length + materialAlerts.length + financeRows.length;
  return {
    risk_item_count: riskItemCount,
    monitored_item_count: monitoredItemCount,
    risk_item_ratio: monitoredItemCount ? Number(((riskItemCount / monitoredItemCount) * 100).toFixed(1)) : 0
  };
}
