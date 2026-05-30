// Order-flow facade. Domain analytics live in focused modules.

export {
  buildCrossWorkshopFlowCoverage,
  buildCrossWorkshopFlowHandoffs,
  buildCrossWorkshopFlowRisks,
  buildSemiFinishedInventoryBatches,
  procedureWorkloadByCenter
} from "./crossWorkshopFlow.js";

export { buildOrderBattleMap } from "./orderBattleMap.js";
export { buildOrderProcedureCoverage } from "./procedureCoverage.js";
