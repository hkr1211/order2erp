export function buildUserRoleCandidates({ salesOrders = [], procedurePlans = [], quoteFollowups = [], financeRows = [], userRoles = [] } = {}) {
  const grouped = new Map();
  const roleByOwner = userRoleMap(userRoles);
  const rowFor = (name) => {
    const key = String(name || "").trim();
    if (!key || key === "未分配") return null;
    if (!grouped.has(key)) {
      grouped.set(key, {
        name: key,
        sales_orders: 0,
        active_orders: 0,
        completed_orders: 0,
        procedure_plans: 0,
        quote_followups: 0,
        finance_records: 0
      });
    }
    return grouped.get(key);
  };

  for (const order of salesOrders) {
    const row = rowFor(order.owner);
    if (!row) continue;
    row.sales_orders += 1;
    if (isCompletedForFollowup(order)) {
      row.completed_orders += 1;
    } else {
      row.active_orders += 1;
    }
  }
  for (const plan of procedurePlans) {
    const row = rowFor(plan.owner);
    if (row) row.procedure_plans += 1;
  }
  for (const quote of quoteFollowups) {
    const row = rowFor(quote.owner);
    if (row && quote.quote_status !== "已报价待确认") row.quote_followups += 1;
  }
  for (const finance of financeRows) {
    const row = rowFor(finance.owner);
    if (row) row.finance_records += 1;
  }

  return [...grouped.values()]
    .map((row) => {
      const configured = roleByOwner.get(row.name);
      return {
        ...row,
        configured_role: configured?.role || "",
        configured_followup: configured ? Number(configured.is_followup) === 0 ? "否" : "是" : "未配置",
        suggested_role: suggestedUserRole(row)
      };
    })
    .sort((a, b) => userRoleCandidateWeight(b) - userRoleCandidateWeight(a) || a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, 200);
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

function suggestedUserRole(row) {
  if (isNumericOwnerId(row.name)) return "ERP编号待映射";
  if (row.finance_records > 0 && row.active_orders === 0 && row.procedure_plans === 0 && row.quote_followups === 0) return "财务";
  if (row.quote_followups > 0 && row.active_orders === 0 && row.procedure_plans === 0) return "销售";
  if (row.active_orders > 0 || row.procedure_plans > 0) return "跟单员";
  if (row.completed_orders > 0) return "财务/销售复核";
  return "待确认";
}

function userRoleCandidateWeight(row) {
  return row.active_orders * 5 + row.procedure_plans * 4 + row.quote_followups * 3 + row.finance_records * 2 + row.completed_orders;
}

function isNumericOwnerId(value) {
  return /^\d+$/.test(String(value || "").trim());
}
