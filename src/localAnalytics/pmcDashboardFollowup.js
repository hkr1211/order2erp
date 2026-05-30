import {
  escalationRuleForIntervention,
  expectedRiskOutput,
  feedbackDeadlineForRisk,
  nextCheckpointForRisk
} from "./pmcRisks.js";
import { buildOwnerWorkbenches } from "./followupWorkbench.js";

export function buildPmcDashboardOwnerWorkbenches({
  salesOrders = [],
  materialAlerts = [],
  procedurePlans = [],
  procedureLinks = [],
  processReports = [],
  userRoles = []
} = {}) {
  return buildOwnerWorkbenches({
    salesOrders,
    materialAlerts,
    procedurePlans,
    procedureLinks,
    processReports,
    userRoles
  });
}

export function buildPmcDashboardFollowupTasks({ redRisks = [], yellowRisks = [] } = {}) {
  return [...redRisks, ...yellowRisks].map((row, index) => ({
    task_no: `ACT-${String(index + 1).padStart(3, "0")}`,
    risk_level: row.risk_level,
    risk_type: row.risk_type,
    related_no: row.related_no,
    problem: row.problem,
    primary_action: row.primary_action,
    responsible_owner: row.responsible_owner || row.owner_role || "PMC",
    feedback_deadline: row.feedback_deadline || feedbackDeadlineForRisk(row),
    escalation_rule: row.escalation_rule || escalationRuleForIntervention(row),
    expected_output: row.expected_output || expectedRiskOutput(row.risk_type),
    next_checkpoint: row.next_checkpoint || nextCheckpointForRisk(row),
    buttons: row.buttons,
    owner_role: row.owner_role,
    due_date: row.due_date
  }));
}
