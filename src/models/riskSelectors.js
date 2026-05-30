export function collectDashboardRisks(dashboard = {}) {
  const sections = dashboard.sections || dashboard.payload?.sections || {};
  return uniqueRisks([
    ...(sections.red_risks || []),
    ...(sections.yellow_risks || []),
    ...(sections.standard_risks || [])
  ]);
}

export function selectRisks(risks = [], filters = {}) {
  const {
    relatedObject = "",
    relatedNo = "",
    owner = "",
    customer = "",
    counterparty = "",
    status = "",
    riskLevel = "",
    riskType = ""
  } = filters;
  return uniqueRisks(risks).filter((row) => {
    if (relatedObject && clean(row.related_object) !== clean(relatedObject)) return false;
    if (relatedNo && !sameText(row.related_no, relatedNo)) return false;
    if (owner && !matchesAny(row, ["owner", "responsible_owner", "owner_role", "sales_owner"], owner)) return false;
    if (customer && !matchesAny(row, ["customer", "counterparty", "problem"], customer)) return false;
    if (counterparty && !matchesAny(row, ["counterparty", "customer", "problem"], counterparty)) return false;
    if (status && clean(row.status || row.intervention_state || row.source_status) !== clean(status)) return false;
    if (riskLevel && clean(row.risk_level) !== clean(riskLevel)) return false;
    if (riskType && clean(row.risk_type) !== clean(riskType)) return false;
    return true;
  }).sort(compareRisks);
}

export function selectRisksForOrders(risks = [], orders = []) {
  const orderNos = new Set(orders.map((row) => clean(row.order_no)).filter(Boolean));
  return selectRisks(risks, { relatedObject: "订单" })
    .filter((row) => orderNos.has(clean(row.related_no)));
}

export function selectRisksForFinance(risks = [], financeRows = []) {
  const billNos = new Set(financeRows.map((row) => clean(row.bill_no || row.record_id)).filter(Boolean));
  const counterparties = new Set(financeRows.map((row) => clean(row.counterparty || row.customer || row.supplier)).filter(Boolean));
  return selectRisks(risks, { relatedObject: "财务" })
    .filter((row) => billNos.has(clean(row.related_no || row.source_key)) || counterparties.has(clean(row.counterparty || row.customer)));
}

export function riskIndexByRelatedNo(risks = []) {
  const index = new Map();
  for (const risk of uniqueRisks(risks).sort(compareRisks)) {
    const key = clean(risk.related_no);
    if (!key) continue;
    const rows = index.get(key) || [];
    rows.push(risk);
    index.set(key, rows);
  }
  return index;
}

export function attachRiskSummary(rows = [], riskIndex = new Map(), keyField = "related_no") {
  return rows.map((row) => {
    const risks = riskIndex.get(clean(row[keyField])) || [];
    const summary = summarizeRisks(risks);
    return {
      ...row,
      standard_risks: risks,
      risk_count: summary.risk_count,
      red_risk_count: summary.red_count,
      yellow_risk_count: summary.yellow_count,
      top_risk_level: summary.top_risk_level,
      top_risk_type: summary.top_risk_type,
      risk_summary: summary.risk_summary,
      risk_next_action: summary.top_action
    };
  });
}

export function summarizeRisks(risks = []) {
  const rows = uniqueRisks(risks).sort(compareRisks);
  const redCount = rows.filter((row) => clean(row.risk_level).includes("红")).length;
  const yellowCount = rows.filter((row) => clean(row.risk_level).includes("黄")).length;
  const top = rows[0] || null;
  return {
    risk_count: rows.length,
    red_count: redCount,
    yellow_count: yellowCount,
    top_risk_level: top?.risk_level || "",
    top_risk_type: top?.risk_type || "",
    top_action: top?.suggested_action || top?.primary_action || "",
    risk_summary: rows.length ? `红牌 ${redCount} / 黄牌 ${yellowCount}` : "无红黄牌"
  };
}

function uniqueRisks(risks = []) {
  const seen = new Set();
  const result = [];
  for (const risk of risks.filter(Boolean)) {
    const key = risk.risk_id || [risk.risk_level, risk.risk_type, risk.related_object, risk.related_no, risk.source_table, risk.source_key].map(clean).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(risk);
  }
  return result;
}

function compareRisks(a, b) {
  return riskLevelWeight(b.risk_level) - riskLevelWeight(a.risk_level)
    || Number(b.risk_score || 0) - Number(a.risk_score || 0)
    || String(a.related_no || "").localeCompare(String(b.related_no || ""), "zh-CN");
}

function riskLevelWeight(value) {
  const text = clean(value);
  if (text.includes("红")) return 3;
  if (text.includes("黄")) return 2;
  if (text.includes("绿")) return 1;
  return 0;
}

function matchesAny(row, fields, expected) {
  const target = clean(expected);
  return fields.some((field) => {
    const value = clean(row[field]);
    return value && (value === target || value.includes(target) || target.includes(value));
  });
}

function sameText(left, right) {
  return clean(left) === clean(right);
}

function clean(value) {
  return String(value ?? "").trim();
}
