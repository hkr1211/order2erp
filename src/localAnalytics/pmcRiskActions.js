// PMC intervention wording, meeting guidance, and action controls.

import { formatQuantity } from "./pmcRiskTasks.js";

export function meetingFocusForRisk(type) {
  if (type === "前道断点" || type === "前道预警") return "今天确认轧制完工、半成品转序和后道开工顺序";
  if (type === "物料断供" || type === "物料预警") return "今天确认到料、替代料或调拨方案";
  if (type === "交期超期" || type === "交期预警") return "今天明确新交期和客户沟通口径";
  if (type === "冲压延期" || type === "产能瓶颈" || type === "产能预警") return "今天确认产能、班次和外协选择";
  return "今天确认责任人、截止时间和下一步结果";
}

export function expectedRiskOutput(type = "") {
  if (type === "物料断供" || type === "物料预警") return "明确到料、替代或调拨方案";
  if (type === "前道断点" || type === "前道预警") return "明确轧制完工、转序时间和后道开工顺序";
  if (type === "交期超期" || type === "交期预警") return "明确新交期、发货安排和客户沟通口径";
  if (type === "冲压延期" || type === "产能瓶颈" || type === "产能预警") return "明确处理方案、负责人和可承诺完成时间";
  return "明确处理方案、负责人和可承诺完成时间";
}

export function escalationRuleForIntervention(row = {}) {
  const deadline = row.feedback_deadline || feedbackDeadlineForRisk(row);
  if (String(deadline).includes("4小时")) return "4小时内无反馈升级给管理者";
  if (String(deadline).includes("下班")) return "下班前无更新列入明日早会";
  if (String(row.risk_level || "").includes("黄")) return "24小时未处理转红牌并通知管理者";
  return "逾期未反馈列入明日早会";
}

export function nextCheckpointForRisk(row = {}) {
  if (String(row.risk_level || "").includes("红")) return "今天早会后复核";
  if (String(row.risk_level || "").includes("黄")) return "明日早会前复核";
  return "例行巡检复核";
}

export function feedbackDeadlineForRisk(row = {}) {
  if (String(row.risk_level || "").includes("红")) return "4小时内反馈";
  if (String(row.risk_level || "").includes("黄")) return "今天下班前反馈";
  return "今日例行巡检";
}

export function decisionRequestForRisk(row = {}) {
  const action = row.next_action || row.primary_action || "确认责任人和完成时间";
  return `请确认是否立即执行：${action}`;
}

export function commandProblemText(type, row) {
  if (type === "前道断点") return `${row.item || "轧制前道"}未齐套，${row.flow_gap || "影响后道开工"}，影响订单${row.related_no || ""}`;
  if (type === "前道预警") return `${row.item || "轧制前道"}需提前转序，${row.flow_gap || "后道即将要料"}，影响订单${row.related_no || ""}`;
  if (type === "冲压延期") return `${row.item || "冲压工序"}未按计划完成，剩余${row.quantity ?? ""}`;
  if (type === "物料断供") return `${row.item || "物料"}缺口${row.quantity_text || formatQuantity(row.quantity, row.unit)}，影响订单${row.related_no || ""}`;
  if (type === "交期超期") return `${row.related_no || "订单"}已超过承诺交期，需今天处理`;
  if (type === "交期预警") return `${row.related_no || "订单"}即将到期，需提前协调生产/发货`;
  if (type === "产能瓶颈") return `${row.item || "工序"}已延误，需今天确认资源安排`;
  if (type === "产能预警") return `${row.item || "工序"}存在延期，需确认产能安排`;
  if (type === "物料预警") return `${row.item || "物料"}库存偏低，需确认补料或替代方案`;
  return row.action || row.item || type;
}

export function ruleReasonForRisk(type, row) {
  if (type === "前道断点") return "轧制半成品未完成且后道今天/明天要料，必须今天处理";
  if (type === "前道预警") return "后道3天内要料，轧制半成品仍未齐套，3天内可能恶化";
  if (type === "冲压延期" || type === "产能瓶颈") return "计划完工日已过且剩余数量 > 0，必须今天处理";
  if (type === "物料断供") return "库存/订单缺口数量 > 0，必须今天处理";
  if (type === "交期超期") return "当前日期已超过承诺交期，必须今天处理";
  if (type === "交期预警") return "承诺交期进入7天窗口，3天内可能恶化";
  if (type === "产能预警") return "工序计划存在延期风险，3天内可能恶化";
  if (type === "物料预警") return "库存可用量偏低，3天内可能恶化";
  return row.action || "按当前规则识别为需关注";
}

export function interventionButtons(type) {
  if (type === "前道断点") return ["前道加急", "调整后道开工", "模拟排程", "标记处理中"];
  if (type === "前道预警") return ["确认转序", "协调工序", "调整顺序", "标记处理中"];
  if (type === "冲压延期") return ["加班协调", "外协申请", "模拟排程", "标记处理中"];
  if (type === "产能瓶颈") return ["加班协调", "外协申请", "模拟排程", "标记处理中"];
  if (type === "物料断供") return ["生成催货文本", "申请调拨", "找替代料", "标记处理中"];
  if (type === "交期超期") return ["紧急发货", "客户沟通", "改排程", "标记处理中"];
  if (type === "交期预警") return ["加急排产", "协调工序", "客户预沟通", "标记处理中"];
  if (type === "产能预警") return ["加班/增班", "外协评估", "调整顺序", "标记处理中"];
  if (type === "物料预警") return ["确认物流", "备选方案", "生成催货文本", "标记处理中"];
  return ["标记处理中", "查看详情"];
}
