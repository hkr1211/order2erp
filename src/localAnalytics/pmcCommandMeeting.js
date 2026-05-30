// PMC meeting action rows derived from management insights.

export function buildCommandMeetingActions(commandInsights = []) {
  return commandInsights.map((row, index) => ({
    action_no: `MEET-${String(index + 1).padStart(3, "0")}`,
    insight_type: row.insight_type,
    related_no: row.related_no,
    responsible_owner: row.responsible_owner || row.owner_role || "PMC",
    meeting_question: row.meeting_topic || row.conclusion || "确认今日重点事项",
    expected_output: expectedMeetingOutput(row),
    feedback_deadline: row.feedback_deadline || "今天下班前反馈",
    escalation_rule: escalationRuleForMeeting(row),
    decision_request: row.decision_request,
    next_action: row.next_action
  }));
}

function expectedMeetingOutput(row = {}) {
  if (row.insight_type === "数据可信度") return "明确可信数据源、需人工核对的数据和补同步安排";
  if (row.insight_type === "责任压力") return "明确每项红黄牌的处理顺序、责任人和预计完成时间";
  return "明确处理方案、负责人和可承诺完成时间";
}

function escalationRuleForMeeting(row = {}) {
  if (String(row.feedback_deadline || "").includes("4小时")) return "4小时内无反馈升级给管理者";
  if (String(row.feedback_deadline || "").includes("下班")) return "下班前无更新列入明日早会";
  if (row.insight_type === "数据可信度") return "早会前未确认则关键决策需人工复核";
  return "逾期未反馈列入明日早会";
}
