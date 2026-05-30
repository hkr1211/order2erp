import { attachPredictionSuggestions } from "../models/materialPlanning.js";
import { startOfDay } from "./utils.js";
import {
  crossWorkshopFlowTasks,
  delayedProcedureTasks,
  deliveryTasks,
  isStampingProcedure,
  lowStockTasks,
  shortageTasks
} from "./pmcRiskTasks.js";
import {
  commandRiskRows,
  priorityWeight,
  riskTypeWeight,
  sortCommandRisks
} from "./pmcRiskScoring.js";

export {
  commandProblemText,
  decisionRequestForRisk,
  escalationRuleForIntervention,
  expectedRiskOutput,
  feedbackDeadlineForRisk,
  interventionButtons,
  meetingFocusForRisk,
  nextCheckpointForRisk,
  ruleReasonForRisk
} from "./pmcRiskActions.js";
export {
  crossWorkshopFlowTasks,
  delayedProcedureTasks,
  deliveryTasks,
  formatQuantity,
  isStampingProcedure,
  lowStockTasks,
  shortageTasks
} from "./pmcRiskTasks.js";
export {
  commandRiskRows,
  priorityWeight,
  riskTypeWeight,
  sortCommandRisks
} from "./pmcRiskScoring.js";

export function buildPmcRiskSections({
  upstreamFlowRisks = [],
  delayedProcedures = [],
  stampingDelayedProcedures = [],
  shortageRows = [],
  lowStockRows = [],
  overdueOrders = [],
  dueSoonOrders = [],
  today = new Date()
} = {}) {
  const day = startOfDay(today);
  const redUpstreamFlowRisks = upstreamFlowRisks.filter((row) => row.risk_level === "红牌");
  const yellowUpstreamFlowRisks = upstreamFlowRisks.filter((row) => row.risk_level !== "红牌");
  const nonStampingDelayedProcedures = delayedProcedures.filter((row) => !isStampingProcedure(row));

  const priorityRisks = [
    ...crossWorkshopFlowTasks(redUpstreamFlowRisks),
    ...delayedProcedureTasks(stampingDelayedProcedures, "冲压延期"),
    ...shortageTasks(shortageRows),
    ...crossWorkshopFlowTasks(yellowUpstreamFlowRisks),
    ...deliveryTasks(overdueOrders, "交期逾期"),
    ...deliveryTasks(dueSoonOrders, "临期交付"),
    ...delayedProcedureTasks(nonStampingDelayedProcedures, "工序延期"),
    ...lowStockTasks(lowStockRows)
  ]
    .sort((a, b) => riskTypeWeight(b.exception_type) - riskTypeWeight(a.exception_type) || priorityWeight(b.priority) - priorityWeight(a.priority) || String(a.due_date || "").localeCompare(String(b.due_date || "")))
    .slice(0, 12);

  const redRisks = attachPredictionSuggestions(sortCommandRisks([
    ...commandRiskRows(crossWorkshopFlowTasks(redUpstreamFlowRisks), "前道断点", "前道断点", day),
    ...commandRiskRows(delayedProcedureTasks(stampingDelayedProcedures, "冲压延期"), "产能瓶颈", "交期超期", day),
    ...commandRiskRows(shortageTasks(shortageRows), "物料断供", "物料断供", day),
    ...commandRiskRows(deliveryTasks(overdueOrders, "交期逾期"), "交期超期", "交期超期", day)
  ]), { today: day });

  const yellowRisks = attachPredictionSuggestions(sortCommandRisks([
    ...commandRiskRows(crossWorkshopFlowTasks(yellowUpstreamFlowRisks), "前道预警", "前道预警", day),
    ...commandRiskRows(deliveryTasks(dueSoonOrders, "临期交付"), "交期预警", "交期预警", day),
    ...commandRiskRows(delayedProcedureTasks(nonStampingDelayedProcedures, "工序延期"), "产能预警", "产能预警", day),
    ...commandRiskRows(lowStockTasks(lowStockRows), "物料预警", "物料预警", day)
  ]), { today: day });

  return { priorityRisks, redRisks, yellowRisks };
}
