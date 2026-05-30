import { scopeRowsForUser } from "../auth.js";
import { collectDashboardRisks, selectRisks, selectRisksForFinance, selectRisksForOrders } from "./riskSelectors.js";

export function standardRisksForDomain({
  domain = "pmc",
  rows = [],
  snapshot = null,
  listStandardRisks = () => [],
  authUser = null,
  owner = "",
  openOnly = false
} = {}) {
  const sourceRisks = standardRiskSource({ snapshot, listStandardRisks, openOnly });
  const scopedRisks = scopeStandardRisksForUser(sourceRisks, authUser, domain);
  const ownerRisks = owner ? selectRisks(scopedRisks, { owner }) : scopedRisks;

  if (domain === "orders") {
    return selectRisksForOrders(ownerRisks, rows);
  }
  if (domain === "finance") {
    return selectRisksForFinance(ownerRisks, rows);
  }
  return selectRisks(ownerRisks);
}

export function standardRiskSource({ snapshot = null, listStandardRisks = () => [], openOnly = false } = {}) {
  const persisted = listStandardRisks({ limit: 5000, open_only: openOnly });
  if (persisted.length) {
    return persisted;
  }
  if (!snapshot) {
    return [];
  }
  return collectDashboardRisks(snapshot?.payload || snapshot);
}

export function scopeStandardRisksForUser(risks = [], authUser = null, domain = "pmc") {
  return scopeRowsForUser(risks, authUser, riskResourceForDomain(domain));
}

function riskResourceForDomain(domain = "pmc") {
  if (domain === "finance") return "finance";
  if (domain === "production") return "production";
  if (domain === "material") return "material";
  if (domain === "procurement") return "procurement";
  if (domain === "orders" || domain === "followup" || domain === "pmc") return "orders";
  return "orders";
}
