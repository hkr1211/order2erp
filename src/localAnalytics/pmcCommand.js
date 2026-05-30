import { buildCommandInsights } from "./pmcCommandInsights.js";
import { buildCommandMeetingActions } from "./pmcCommandMeeting.js";
import {
  buildCommandRiskPoolSummary,
  buildMorningBrief,
  buildRiskOwnerSummary,
  buildRiskTypeSummary
} from "./pmcCommandSummary.js";

export {
  buildCommandInsights
} from "./pmcCommandInsights.js";
export {
  buildCommandMeetingActions
} from "./pmcCommandMeeting.js";
export {
  buildCommandRiskPoolSummary,
  buildMorningBrief,
  buildRiskOwnerSummary,
  buildRiskTypeSummary
} from "./pmcCommandSummary.js";

export function buildPmcCommandSections({
  redRisks = [],
  yellowRisks = [],
  dataFreshness = [],
  orders = [],
  procedures = [],
  materialAlerts = [],
  financeRows = []
} = {}) {
  const morningBrief = buildMorningBrief({ redRisks, yellowRisks });
  const riskTypeSummary = buildRiskTypeSummary({ redRisks, yellowRisks });
  const riskOwnerSummary = buildRiskOwnerSummary({ redRisks, yellowRisks });
  const commandInsights = buildCommandInsights({ morningBrief, riskOwnerSummary, dataFreshness });
  const commandMeetingActions = buildCommandMeetingActions(commandInsights);
  const commandRiskPool = buildCommandRiskPoolSummary({
    redRisks,
    yellowRisks,
    orders,
    procedures,
    materialAlerts,
    financeRows
  });

  return {
    morningBrief,
    riskTypeSummary,
    riskOwnerSummary,
    commandInsights,
    commandMeetingActions,
    commandRiskPool
  };
}
