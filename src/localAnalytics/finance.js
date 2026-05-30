import {
  addDays,
  daysBetween,
  firstPresent,
  formatDate,
  number,
  parseDate,
  parseJson,
  startOfDay
} from "./utils.js";

export function mapFinanceRowForLocal(row, direction, today = new Date()) {
  const currentDay = startOfDay(today);
  const amount = number(firstPresent(row.amount, row.moneyall, row.MoneyAll, row.money1, row.Money1, row.money, row.Money, row.cmoney, row.CMoney));
  const paidAmount = number(firstPresent(row.paid_amount, row.hkmoney, row.HkMoney, row.money2, row.Money2, row.paymoney, row.PayMoney));
  const statusText = firstPresent(row.status, row.Status, row.zt, row.Zt, row.skzt, row.fkzt);
  const unpaidAmount = financeUnpaidAmount(row, amount, paidAmount, statusText, direction);
  const billDateText = firstPresent(row.bill_date, row.date1, row.Date1, row.dateadd, row.DateAdd, row.tdate, row.TDate);
  const paymentTermsDays = number(firstPresent(row.paydays, row.PayDays, row.daynum, row.DayNum, row.zq, row.Zq));
  const dueDateText = firstPresent(row.due_date, row.date2, row.Date2, row.dateend, row.DateEnd);
  const billDate = parseDate(billDateText);
  const dueDate = parseDate(dueDateText) || (billDate && paymentTermsDays !== null ? addDays(billDate, paymentTermsDays) : null);
  const dueDays = dueDate ? daysBetween(currentDay, startOfDay(dueDate)) : null;
  const ageDays = billDate ? daysBetween(startOfDay(billDate), currentDay) : null;
  return {
    direction,
    counterparty: firstPresent(row.counterparty, row.khmc, row.gysname, row.cateName, row.CateName, row.title2),
    bill_no: firstPresent(row.bill_no, row.htid, row.rkbh, row.billno, row.BillNo, row.order1, row.Order1),
    business_title: firstPresent(row.business_title, row.title, row.Title, row.intro, row.Intro),
    amount,
    paid_amount: paidAmount,
    unpaid_amount: unpaidAmount,
    bill_date: billDate ? formatDate(billDate) : billDateText,
    due_date: dueDate ? formatDate(dueDate) : dueDateText,
    payment_terms: paymentTermsDays !== null ? `${paymentTermsDays}天` : firstPresent(row.payment_terms, row.paytype, row.PayType),
    age_days: ageDays,
    due_days: dueDays,
    risk_status: financeRiskStatus(unpaidAmount, dueDays),
    status: statusText,
    owner: firstPresent(row.owner, row.xsry, row.person, row.Person),
    raw: row.raw || row
  };
}

export function buildLocalFinanceCenter({ financeRows = [], detailLimit = null, detailOffset = 0, pageIndex = 1, pageSize = null, rankingLimit = 100, rankingPageIndex = 1, rankingPageSize = 20, filters = {} } = {}) {
  const normalizedRows = financeRows.map(normalizeStoredFinanceRow);
  const receivableRows = normalizedRows.filter((row) => row.direction === "receivable");
  const payableRows = normalizedRows.filter((row) => row.direction === "payable");
  const safeLimit = detailLimit === null || detailLimit === undefined ? null : Math.max(0, Number(detailLimit) || 0);
  const safeOffset = Math.max(0, Number(detailOffset) || 0);
  const visibleReceivableRows = safeLimit === null ? receivableRows : receivableRows.slice(safeOffset, safeOffset + safeLimit);
  const visiblePayableRows = safeLimit === null ? payableRows : payableRows.slice(safeOffset, safeOffset + safeLimit);
  const safeRankingLimit = Math.max(1, Math.min(100, Number(rankingLimit) || 100));
  const safeRankingPageSize = Math.max(1, Math.min(100, Number(rankingPageSize) || 20));
  const allReceivableDebtRows = topFinanceCounterpartiesForLocal(receivableRows, safeRankingLimit);
  const allPayableDebtRows = topFinanceCounterpartiesForLocal(payableRows, safeRankingLimit);
  const rankingTotalRows = Math.max(allReceivableDebtRows.length, allPayableDebtRows.length);
  const rankingTotalPages = Math.max(1, Math.ceil(rankingTotalRows / safeRankingPageSize));
  const safeRankingPageIndex = Math.max(1, Math.min(rankingTotalPages, Number(rankingPageIndex) || 1));
  const rankingOffset = (safeRankingPageIndex - 1) * safeRankingPageSize;
  const receivableDebtRows = allReceivableDebtRows.slice(rankingOffset, rankingOffset + safeRankingPageSize);
  const payableDebtRows = allPayableDebtRows.slice(rankingOffset, rankingOffset + safeRankingPageSize);
  const overdueReceivables = financeRowsByRiskForLocal(receivableRows, "已逾期");
  const upcomingPayables = payableRows
    .filter((row) => number(row.unpaid_amount) > 0 && row.due_days !== null && row.due_days <= 7)
    .sort(compareFinanceDueRowsForLocal);

  return {
    model: "finance_center",
    generated_at: new Date().toISOString(),
    cached: true,
    summary: {
      receivable_records: receivableRows.length,
      payable_records: payableRows.length,
      receivable_unpaid: sumAmount(receivableRows, "unpaid_amount"),
      payable_unpaid: sumAmount(payableRows, "unpaid_amount"),
      overdue_receivables: overdueReceivables.length,
      due_soon_payables: upcomingPayables.length,
      source_errors: 0
    },
    pagination: {
      page_index: pageIndex,
      page_size: pageSize || safeLimit || normalizedRows.length,
      total_finance_rows: normalizedRows.length,
      receivable_rows: receivableRows.length,
      payable_rows: payableRows.length,
      detail_offset: safeOffset,
      detail_limit: safeLimit ?? normalizedRows.length,
      receivable_page_rows: visibleReceivableRows.length,
      payable_page_rows: visiblePayableRows.length
    },
    ranking_pagination: {
      page_index: safeRankingPageIndex,
      page_size: safeRankingPageSize,
      total_pages: rankingTotalPages,
      ranking_limit: safeRankingLimit,
      offset: rankingOffset,
      receivable_total: allReceivableDebtRows.length,
      payable_total: allPayableDebtRows.length,
      page_start: rankingTotalRows ? rankingOffset + 1 : 0,
      page_end: Math.min(rankingOffset + safeRankingPageSize, rankingTotalRows)
    },
    filters,
    sections: {
      receivables: visibleReceivableRows,
      payables: visiblePayableRows,
      receivable_debts: receivableDebtRows,
      overdue_receivables: overdueReceivables,
      due_soon_payables: upcomingPayables,
      payable_debts: payableDebtRows
    },
    source_status: {
      sqlite_finance_records: { ok: true, rows: normalizedRows.length }
    },
    notes: [
      "当前读取本地 SQLite 应收应付数据。",
      "ERP 不可用时，应收应付中心继续使用最近同步成功的数据。"
    ]
  };
}

function financeRiskStatus(unpaidAmount, dueDays) {
  const unpaid = number(unpaidAmount) || 0;
  if (unpaid <= 0) return "已结清";
  if (dueDays === null) return "未清";
  if (dueDays < 0) return "已逾期";
  if (dueDays <= 7) return "7天内到期";
  return "未到期";
}

function financeUnpaidAmount(row, amount, paidAmount, statusText, direction) {
  const explicit = number(firstPresent(row.unpaid_amount, row.wsmoney, row.WsMoney, row.leftmoney, row.LeftMoney));
  if (explicit !== null) return explicit;
  if (amount !== null && paidAmount !== null) return Math.max(0, Number((amount - paidAmount).toFixed(2)));
  if (isFinanceUnpaidStatus(statusText, direction)) return amount;
  if (isFinanceSettledStatus(statusText, direction)) return 0;
  return null;
}

function normalizeStoredFinanceRow(row) {
  const raw = parseJson(row.raw_json, row.raw || row);
  const amount = number(firstPresent(row.amount, raw?.amount, raw?.moneyall, raw?.MoneyAll, raw?.money1, raw?.Money1, raw?.money, raw?.Money));
  const paidAmount = number(firstPresent(row.paid_amount, raw?.paid_amount, raw?.hkmoney, raw?.HkMoney, raw?.money2, raw?.Money2, raw?.paymoney, raw?.PayMoney));
  const statusText = firstPresent(row.status, raw?.status, raw?.Status, raw?.zt, raw?.Zt, raw?.skzt, raw?.fkzt);
  const unpaidAmount = financeUnpaidAmount({ ...raw, unpaid_amount: row.unpaid_amount }, amount, paidAmount, statusText, row.direction);
  const dueDays = row.due_days === undefined ? null : row.due_days;
  return {
    ...row,
    counterparty: row.counterparty || raw?.counterparty || raw?.name || raw?.khmc || raw?.gysname || raw?.cateName || raw?.title2 || "",
    owner: row.owner || raw?.owner || raw?.xsry || raw?.person || raw?.Person || raw?.catename || "",
    status: statusText,
    amount,
    paid_amount: paidAmount,
    unpaid_amount: unpaidAmount,
    risk_status: financeRiskStatus(unpaidAmount, dueDays)
  };
}

function isFinanceUnpaidStatus(statusText, direction) {
  const text = String(statusText || "");
  return direction === "payable" ? /未付款/.test(text) : /未收款/.test(text);
}

function isFinanceSettledStatus(statusText, direction) {
  const text = String(statusText || "");
  return direction === "payable" ? /已付款/.test(text) : /已收款/.test(text);
}

function financeRowsByRiskForLocal(rows, riskStatus) {
  return rows
    .filter((row) => row.risk_status === riskStatus && number(row.unpaid_amount) > 0)
    .sort(compareFinanceDueRowsForLocal);
}

function compareFinanceDueRowsForLocal(a, b) {
  const aDays = a.due_days === null ? Number.POSITIVE_INFINITY : a.due_days;
  const bDays = b.due_days === null ? Number.POSITIVE_INFINITY : b.due_days;
  if (aDays !== bDays) return aDays - bDays;
  return (number(b.unpaid_amount) || 0) - (number(a.unpaid_amount) || 0);
}

function topFinanceCounterpartiesForLocal(rows, limit = 20) {
  const grouped = new Map();
  for (const row of rows) {
    const unpaid = number(row.unpaid_amount) || 0;
    if (unpaid <= 0) continue;
    const key = row.counterparty || "未识别往来单位";
    const current = grouped.get(key) || {
      counterparty: key,
      unpaid_amount: 0,
      records: 0,
      overdue_records: 0,
      earliest_due_date: null,
      earliest_due_days: null,
      risk_status: "未清"
    };
    current.unpaid_amount += unpaid;
    current.records += 1;
    if (row.risk_status === "已逾期") current.overdue_records += 1;
    if (row.due_days !== null && (current.earliest_due_days === null || row.due_days < current.earliest_due_days)) {
      current.earliest_due_days = row.due_days;
      current.earliest_due_date = row.due_date;
    }
    if (current.overdue_records > 0) {
      current.risk_status = "已逾期";
    } else if (current.earliest_due_days !== null && current.earliest_due_days <= 7) {
      current.risk_status = "7天内到期";
    }
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map((row) => ({ ...row, unpaid_amount: Number(row.unpaid_amount.toFixed(2)) }))
    .sort((a, b) => b.unpaid_amount - a.unpaid_amount)
    .slice(0, Math.max(1, Number(limit) || 20));
}

function sumAmount(rows, key) {
  return Number(rows.reduce((sum, row) => sum + (number(row[key]) || 0), 0).toFixed(2));
}
