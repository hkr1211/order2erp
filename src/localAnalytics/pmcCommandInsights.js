// PMC management conclusions for morning meetings.

import {
  decisionRequestForRisk,
  feedbackDeadlineForRisk,
  meetingFocusForRisk
} from "./pmcRiskActions.js";

export function buildCommandInsights({ morningBrief = [], riskOwnerSummary = [], dataFreshness = [] } = {}) {
  const insights = [];
  const topRisk = morningBrief[0];
  if (topRisk) {
    insights.push({
      insight_type: "最高风险",
      risk_level: topRisk.risk_level,
      risk_score: topRisk.risk_score,
      related_no: topRisk.related_no,
      owner_role: topRisk.owner_role,
      conclusion: `${topRisk.risk_type || "风险"}优先处理：${topRisk.problem || topRisk.headline || topRisk.related_no || "待确认"}`,
      meeting_topic: topRisk.meeting_focus || meetingFocusForRisk(topRisk.risk_type),
      responsible_owner: topRisk.owner_role || "PMC",
      feedback_deadline: feedbackDeadlineForRisk(topRisk),
      decision_request: decisionRequestForRisk(topRisk),
      next_action: topRisk.next_action || topRisk.primary_action || "确认责任人和完成时间"
    });
  }

  const topOwner = riskOwnerSummary[0];
  if (topOwner) {
    insights.push({
      insight_type: "责任压力",
      owner_role: topOwner.owner_role,
      red_count: topOwner.red_count,
      yellow_count: topOwner.yellow_count,
      todo_count: topOwner.todo_count,
      conclusion: `${topOwner.owner_role}当前待办${topOwner.todo_count}项，其中红牌${topOwner.red_count}项`,
      meeting_topic: `请${topOwner.owner_role}说明红牌${topOwner.red_count}项、黄牌${topOwner.yellow_count}项的处理顺序`,
      responsible_owner: topOwner.owner_role,
      feedback_deadline: topOwner.red_count > 0 ? "今天下班前更新处理结果" : "明天早会前更新处理结果",
      decision_request: `请确认${topOwner.owner_role}是否需要资源协调或上级拍板`,
      next_action: topOwner.next_action || "确认责任人和完成时间",
      sample_problem: topOwner.sample_problem
    });
  }

  const staleSources = dataFreshness.filter((row) => row.freshness_status === "需关注" || row.freshness_status === "无数据");
  if (staleSources.length) {
    insights.push({
      insight_type: "数据可信度",
      conclusion: `${staleSources.length}个数据源需关注：${staleSources.map((row) => row.source_name).join("、")}`,
      meeting_topic: "先确认关键数据是否可信，再决定交期、采购和产能动作",
      responsible_owner: "系统/PMC",
      feedback_deadline: "早会前确认",
      decision_request: "请确认是否需要先补同步或改用人工核对数据",
      next_action: "先确认同步状态，再做关键决策"
    });
  }

  if (!insights.length) {
    insights.push({
      insight_type: "整体状态",
      conclusion: "当前暂无红黄牌重点，继续观察数据同步和交期变化",
      meeting_topic: "确认今日是否有新插单、临期交付或物料变化",
      responsible_owner: "PMC",
      feedback_deadline: "今日例行巡检",
      decision_request: "暂无需要立即拍板事项",
      next_action: "保持日常巡检"
    });
  }

  return insights.slice(0, 3);
}
