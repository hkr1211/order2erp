import {
  buildOrderBattleMap,
  buildOrderProcedureCoverage,
  procedureWorkloadByCenter
} from "./orderFlow.js";

export function buildPmcDashboardBattleContext({
  normalizedOrders = [],
  normalizedProcedures = [],
  rawProcedures = [],
  procedureLinks = [],
  processReports = [],
  day = new Date()
} = {}) {
  const orderBattle = buildOrderBattleMap(normalizedProcedures, day);
  const procedureCoverage = buildOrderProcedureCoverage(normalizedOrders, rawProcedures, procedureLinks, processReports);
  const workloadByCenter = procedureWorkloadByCenter(normalizedProcedures, day);

  return {
    orderBattle,
    procedureCoverage,
    workloadByCenter
  };
}
