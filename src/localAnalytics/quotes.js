import {
  daysBetween,
  number,
  parseDate,
  startOfDay
} from "./utils.js";

export function mapQuoteFollowupForLocal(row, today = new Date()) {
  const currentDay = startOfDay(today);
  const createdDate = parseDate(row.created_date);
  const ageDays = createdDate ? daysBetween(startOfDay(createdDate), currentDay) : null;
  const estimatedAmount = number(row.estimated_amount) || 0;
  const quotedAmount = number(row.quoted_amount) || 0;
  const stageText = [row.follow_stage, row.project_stage, row.approval_status, row.lead_status].filter(Boolean).join(" ");
  const priority = quotePriority(ageDays, estimatedAmount, stageText);
  const quoteStatus = quotedAmount > 0 ? "已报价待确认" : /询价|报价|核价|定价/.test(stageText) ? "待报价" : "待确认需求";
  return {
    quote_no: row.project_no || row.erp_id || row.quote_no,
    priority,
    quote_status: quoteStatus,
    customer: row.customer,
    title: row.title,
    owner: row.owner || "未分配",
    project_stage: row.project_stage || row.follow_stage,
    estimated_amount: row.estimated_amount,
    quoted_amount: row.quoted_amount,
    created_date: row.created_date,
    age_days: ageDays,
    action: quoteAction(priority, quoteStatus),
    risk_flags: row.risk_flags,
    raw: row.raw || row
  };
}

export function quoteOwnerSummaryForLocal(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const owner = row.owner || "未分配";
    const current = grouped.get(owner) || {
      owner,
      quote_followups: 0,
      urgent_quotes: 0,
      estimated_amount: 0,
      max_age_days: 0,
      latest_action: ""
    };
    current.quote_followups += 1;
    if (row.priority === "高") {
      current.urgent_quotes += 1;
    }
    current.estimated_amount += number(row.estimated_amount) || 0;
    current.max_age_days = Math.max(current.max_age_days, number(row.age_days) || 0);
    if (!current.latest_action && row.action) {
      current.latest_action = row.action;
    }
    grouped.set(owner, current);
  }
  return [...grouped.values()]
    .map((row) => ({ ...row, estimated_amount: Number(row.estimated_amount.toFixed(2)) }))
    .sort((a, b) => b.urgent_quotes - a.urgent_quotes || b.max_age_days - a.max_age_days || b.estimated_amount - a.estimated_amount)
    .slice(0, 20);
}

function quotePriority(ageDays, amount, stageText) {
  if (ageDays !== null && ageDays >= 7) return "高";
  if (amount >= 100000 || /核价|定价/.test(stageText)) return "高";
  if (ageDays !== null && ageDays >= 3) return "中";
  return "低";
}

function quoteAction(priority, quoteStatus) {
  if (quoteStatus === "已报价待确认") return "跟进客户反馈并推动确认";
  if (priority === "高") return "优先确认规格、成本和报价截止时间";
  return "补齐需求资料并安排报价";
}
