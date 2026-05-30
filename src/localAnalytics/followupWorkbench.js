import {
  buildProcedureOrderMatchMap,
  enrichProcedureOrderMatch,
  normalizeProcedurePlan,
  procedureKey
} from "./workshopBoard.js";
import {
  daysBetween,
  number,
  parseDate,
  parseJson,
  startOfDay
} from "./utils.js";

export function buildOwnerWorkbenches({ salesOrders = [], materialAlerts = [], procedurePlans = [], procedureLinks = [], processReports = [], userRoles = [] } = {}) {
  const grouped = new Map();
  const orderOwnerByNo = new Map();
  const roleByOwner = userRoleMap(userRoles);
  for (const row of salesOrders) {
    const owner = row.owner || "未分配";
    if (!isFollowupOwner(owner, roleByOwner) || isCompletedForFollowup(row)) continue;
    if (row.order_no) orderOwnerByNo.set(row.order_no, owner);
    const current = ownerWorkbenchRow(grouped, owner);
    current.active_orders += 1;
  }
  for (const row of materialAlerts.filter((item) => item.alert_type === "shortage")) {
    const owner = row.owner || orderOwnerByNo.get(row.order_no) || "未分配";
    if (!isFollowupOwner(owner, roleByOwner)) continue;
    ownerWorkbenchRow(grouped, owner).shortage_orders += 1;
  }
  const normalizedOrders = salesOrders.map((row) => normalizeOrder(row, new Date()));
  const rawProcedures = procedurePlans.map(normalizeProcedurePlan);
  const procedureOrderMatches = buildProcedureOrderMatchMap(rawProcedures, normalizedOrders, procedureLinks, processReports);
  for (const [index, rawProcedure] of rawProcedures.entries()) {
    const row = enrichProcedureOrderMatch(rawProcedure, procedureOrderMatches.get(procedureKey(rawProcedure, index)));
    const owner = row.owner || orderOwnerByNo.get(row.order_no) || "未分配";
    if (!isFollowupOwner(owner, roleByOwner)) continue;
    const current = ownerWorkbenchRow(grouped, owner);
    current.procedure_plans += 1;
    if ((number(row.remaining_qty) || 0) > 0) current.open_procedures += 1;
  }
  return [...grouped.values()]
    .map((row) => ({
      ...row,
      todos: row.shortage_orders + row.open_procedures,
      owner_link: row.owner
    }))
    .sort((a, b) => b.todos - a.todos || b.active_orders - a.active_orders || a.owner.localeCompare(b.owner, "zh-CN"))
    .slice(0, 20);
}

export function ownerMatches(value, ownerFilter) {
  return (value || "未分配") === ownerFilter;
}

export function procedureMatchesOwner(row, ownerFilter, orderOwnerByNo) {
  return ownerMatches(row.owner, ownerFilter) || ownerMatches(orderOwnerByNo.get(row.order_no), ownerFilter);
}

function ownerWorkbenchRow(grouped, owner) {
  const key = owner || "未分配";
  if (!grouped.has(key)) {
    grouped.set(key, {
      owner: key,
      active_orders: 0,
      shortage_orders: 0,
      procedure_plans: 0,
      open_procedures: 0
    });
  }
  return grouped.get(key);
}

function userRoleMap(userRoles = []) {
  return new Map(userRoles.map((row) => [String(row.name || "").trim(), row]).filter(([name]) => name));
}

function isFollowupOwner(owner, roleByOwner = new Map()) {
  const name = String(owner || "").trim();
  if (!name || name === "未分配") return false;
  if (isNumericOwnerId(name)) return false;
  const role = roleByOwner.get(name);
  if (role && Number(role.is_followup) === 0) return false;
  return true;
}

function isCompletedForFollowup(row) {
  const statusText = [row.status_text, row.ckjz, row.fhjz, row.raw?.ckjz, row.raw?.fhjz].filter(Boolean).join(" ");
  return /发货完毕|已发货|出库完毕|已出库/.test(statusText);
}

function isNumericOwnerId(value) {
  return /^\d+$/.test(String(value || "").trim());
}

function normalizeOrder(row, today) {
  const deliveryDate = parseDate(row.delivery_date);
  return {
    erp_id: row.erp_id,
    order_no: row.order_no,
    customer: row.customer,
    owner: row.owner,
    product_name: row.product_name,
    product_code: row.product_code,
    product_model: row.product_model,
    remaining_qty: row.remaining_qty,
    amount: row.amount,
    signed_date: row.signed_date,
    delivery_date: row.delivery_date,
    days_from_today: deliveryDate ? daysBetween(today, startOfDay(deliveryDate)) : null,
    raw: parseJson(row.raw_json, row)
  };
}
