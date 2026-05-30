import { addDays, clampInt, daysBetween, formatDate, parseDate, parseJson, parseNumber, startOfDay } from "../displayUtils.js";
import { normalizeTable } from "../erpClient.js";
import { scopeRowsForUser } from "../auth.js";
import { standardRisksForDomain } from "../models/standardRiskAccess.js";
import { attachRiskSummary, riskIndexByRelatedNo } from "../models/riskSelectors.js";

export function createFinanceQueries({ buildLocalFinanceCenter, client, erpProtectionMode, latestPmcSnapshot = () => null, listStandardRisks = () => [], listFinanceRecords, summarizeDataSourceError }) {
  async function queryFinanceCenter(params = {}) {
    const pageIndex = clampInt(params.pageindex || 1, 1, 100000);
    const pageSize = clampInt(params.pagesize || 100, 1, 500);
    const rankingPageIndex = clampInt(params.rank_page || 1, 1, 100000);
    const rankingPageSize = clampInt(params.rank_pagesize || 20, 1, 100);
    if (params.refresh !== "1") {
      const localLimit = clampInt(params.local_limit || 100000, 1, 100000);
      const scopedRows = scopeRowsForUser(listFinanceRecords({ limit: localLimit }).map((row) => ({
        ...row,
        raw: parseJson(row.raw_json, row)
      })), params.auth_user, "finance");
      if (scopedRows.length) {
        const dateRange = defaultFinanceDateRange(params.today);
        const dateScopedRows = filterFinanceRowsByBillDate(scopedRows, dateRange);
        const financeRows = filterFinanceRows(dateScopedRows, params.searchKey);
        const body = buildLocalFinanceCenter({
            financeRows,
            detailLimit: pageSize,
            detailOffset: (pageIndex - 1) * pageSize,
            pageIndex,
            pageSize,
            rankingLimit: 100,
            rankingPageIndex,
            rankingPageSize,
            filters: {
              searchKey: params.searchKey || "",
              date_start: dateRange.start_date,
              date_end: dateRange.end_date,
              date_scope: "近一年"
            }
          });
        body.source_status = {
          ...(body.source_status || {}),
          sqlite_finance_records: {
            ...(body.source_status?.sqlite_finance_records || {}),
            rows: financeRows.length,
            date_filtered_rows: dateScopedRows.length,
            total_rows: scopedRows.length,
            date_start: dateRange.start_date,
            date_end: dateRange.end_date
          }
        };
        body.notes = [
          ...(body.notes || []),
          `财务页面默认只统计单据日期 ${dateRange.start_date} 至 ${dateRange.end_date} 的近一年数据；范围外旧数据仍保留在 SQLite。`
        ];
        return {
          header: { status: 0, message: "ok" },
          body: enrichFinanceCenterRisks(body, { snapshot: latestPmcSnapshot(), listStandardRisks, authUser: params.auth_user })
        };
      }
      if (erpProtectionMode) {
        return {
          header: { status: 0, message: "ok" },
          body: emptyFinanceCenterBody("ERP保护模式已开启，应收应付中心未找到本地 SQLite 数据时不再自动请求 ERP。")
        };
      }
    }

    const pageindex = params.pageindex || 1;
    const pagesize = params.pagesize || 20;
    const today = startOfDay(parseDate(params.today) || new Date());
    const [receivableResult, payableResult] = await Promise.allSettled([
      client.queryView("receivables", {
        pageindex,
        pagesize,
        searchKey: params.searchKey || ""
      }),
      client.queryView("payables", {
        pageindex,
        pagesize,
        searchKey: params.searchKey || ""
      })
    ]);
    const sourceStatus = {
      receivables: {
        ok: receivableResult.status === "fulfilled",
        message: receivableResult.status === "rejected" ? summarizeDataSourceError(receivableResult.reason) : null
      },
      payables: {
        ok: payableResult.status === "fulfilled",
        message: payableResult.status === "rejected" ? summarizeDataSourceError(payableResult.reason) : null
      }
    };
    const sourceNotes = Object.entries(sourceStatus)
      .filter(([, status]) => !status.ok)
      .map(([name, status]) => `${name} 数据源暂不可用：${status.message}`);
    const receivableTable = receivableResult.status === "fulfilled" ? normalizeTable(receivableResult.value) : { rows: [], page: null };
    const payableTable = payableResult.status === "fulfilled" ? normalizeTable(payableResult.value) : { rows: [], page: null };
    const receivableRows = scopeRowsForUser(receivableTable.rows.map((row) => mapFinanceRow(row, "receivable", today)), params.auth_user, "finance");
    const payableRows = scopeRowsForUser(payableTable.rows.map((row) => mapFinanceRow(row, "payable", today)), params.auth_user, "finance");
    const receivableDebtRows = topFinanceCounterparties(receivableRows);
    const payableDebtRows = topFinanceCounterparties(payableRows);
    const overdueReceivables = financeRowsByRisk(receivableRows, "已逾期");
    const upcomingPayables = payableRows
      .filter((row) => parseNumber(row.unpaid_amount) > 0 && row.due_days !== null && row.due_days <= 7)
      .sort(compareFinanceDueRows);

    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "finance_center",
        generated_at: new Date().toISOString(),
        offline: sourceNotes.length > 0,
        summary: {
          receivable_records: receivableRows.length,
          payable_records: payableRows.length,
          receivable_unpaid: sumFinanceAmount(receivableRows, "unpaid_amount"),
          payable_unpaid: sumFinanceAmount(payableRows, "unpaid_amount"),
          overdue_receivables: overdueReceivables.length,
          due_soon_payables: upcomingPayables.length,
          source_errors: sourceNotes.length
        },
        sections: {
          receivables: receivableRows,
          payables: payableRows,
          receivable_debts: receivableDebtRows,
          overdue_receivables: overdueReceivables,
          due_soon_payables: upcomingPayables,
          payable_debts: payableDebtRows
        },
        source_status: sourceStatus,
        notes: [
          ...sourceNotes,
          "应收应付中心 V1 聚合收款/应收和付款/应付记录，先用于老板和销售查看往来风险。",
          "逾期判断优先使用到期日；如果 ERP 返回付款条件天数且有单据日期，则自动推算到期日。"
        ]
      }
    };
  }

  return { queryFinanceCenter };
}

function defaultFinanceDateRange(todayValue) {
  const today = startOfDay(parseDate(todayValue) || new Date());
  return {
    start_date: formatDate(addDays(today, -365)),
    end_date: formatDate(today)
  };
}

function filterFinanceRowsByBillDate(rows, { start_date: startDate, end_date: endDate }) {
  return rows.filter((row) => {
    const billDate = parseDate(firstText(row.bill_date, row.raw?.bill_date, row.raw?.date1, row.raw?.Date1, row.raw?.tdate, row.raw?.TDate));
    if (!billDate) return true;
    const dateText = formatDate(startOfDay(billDate));
    return dateText >= startDate && dateText <= endDate;
  });
}

function enrichFinanceCenterRisks(body, { snapshot = null, listStandardRisks = () => [], authUser = null } = {}) {
  const financeRows = [...(body.sections?.receivables || []), ...(body.sections?.payables || [])];
  const financeRisks = standardRisksForDomain({ domain: "finance", rows: financeRows, snapshot, listStandardRisks, authUser });
  const riskIndex = riskIndexByRelatedNo(financeRisks);
  return {
    ...body,
    sections: {
      ...(body.sections || {}),
      receivables: attachRiskSummary(body.sections?.receivables || [], riskIndex, "bill_no"),
      payables: attachRiskSummary(body.sections?.payables || [], riskIndex, "bill_no"),
      finance_risks: financeRisks
    }
  };
}

function filterFinanceRows(rows, searchKey = "") {
  const keyword = String(searchKey || "").trim().toLowerCase();
  if (!keyword) return rows;
  const fields = ["counterparty", "bill_no", "business_title", "risk_status", "status", "owner", "direction", "amount", "paid_amount", "unpaid_amount", "bill_date", "due_date", "payment_terms"];
  return rows.filter((row) => fields.some((field) => String(row?.[field] ?? "").toLowerCase().includes(keyword)));
}

function emptyFinanceCenterBody(message) {
  return {
    model: "finance_center",
    generated_at: new Date().toISOString(),
    cached: true,
    offline: true,
    summary: {
      receivable_records: 0,
      payable_records: 0,
      receivable_unpaid: 0,
      payable_unpaid: 0,
      overdue_receivables: 0,
      due_soon_payables: 0,
      source_errors: 0
    },
    sections: {
      receivables: [],
      payables: [],
      receivable_debts: [],
      overdue_receivables: [],
      due_soon_payables: [],
      payable_debts: []
    },
    source_status: {
      sqlite_finance_records: { ok: false, rows: 0, message }
    },
    notes: [
      message,
      "请在 ERP 稳定时点击“谨慎同步”更新本地应收应付数据。"
    ]
  };
}

export function mapFinanceRow(row, direction, today) {
  const amount = firstNumber(row.moneyall, row.MoneyAll, row.money1, row.Money1, row.money, row.Money, row.cmoney, row.CMoney, row["金额"], row["应收金额"], row["应付金额"]);
  const paidAmount = firstNumber(row.hkmoney, row.HkMoney, row.money2, row.Money2, row.paymoney, row.PayMoney, row["已收金额"], row["已付金额"], row["收款金额"], row["付款金额"]);
  const statusText = firstText(row.status, row.Status, row.zt, row.Zt, row.skzt, row.fkzt, row["状态"], row["收款状态"], row["付款状态"]);
  const unpaidAmount = financeUnpaidAmount(row, amount, paidAmount, statusText, direction);
  const billDateText = firstText(row.date1, row.Date1, row.dateadd, row.DateAdd, row.tdate, row.TDate, row["单据日期"], row["申请日期"]);
  const paymentTermsDays = firstNumber(row.paydays, row.PayDays, row.daynum, row.DayNum, row.zq, row.Zq, row["账期"], row["付款条件"], row["付款条件天数"]);
  const dueDateText = firstText(row.date2, row.Date2, row.dateend, row.DateEnd, row["到期日"], row["计划日期"]);
  const billDate = parseDate(billDateText);
  const dueDate = parseDate(dueDateText) || (billDate && paymentTermsDays !== null ? addDays(billDate, paymentTermsDays) : null);
  const dueDays = dueDate ? daysBetween(today, startOfDay(dueDate)) : null;
  const ageDays = billDate ? daysBetween(startOfDay(billDate), today) : null;
  const riskStatus = financeRiskStatus(unpaidAmount, dueDays);
  return {
    direction,
    counterparty: firstText(row.khmc, row.gysname, row.cateName, row.CateName, row.title2, row["客户"], row["供应商"], row["往来单位"], row["单位名称"]),
    bill_no: firstText(row.htid, row.rkbh, row.billno, row.BillNo, row.order1, row.Order1, row["单号"], row["合同编号"], row["付款单号"], row["收款单号"]),
    business_title: firstText(row.title, row.Title, row.intro, row.Intro, row["摘要"], row["标题"]),
    amount,
    paid_amount: paidAmount,
    unpaid_amount: unpaidAmount,
    bill_date: billDate ? formatDate(billDate) : billDateText,
    due_date: dueDate ? formatDate(dueDate) : dueDateText,
    payment_terms: paymentTermsDays !== null ? `${paymentTermsDays}天` : firstText(row.paytype, row.PayType, row["付款方式"], row["结算方式"]),
    age_days: ageDays,
    due_days: dueDays,
    risk_status: riskStatus,
    status: statusText,
    owner: firstText(row.xsry, row.person, row.Person, row.owner, row["负责人"], row["经办人"]),
    raw: row
  };
}

function financeRiskStatus(unpaidAmount, dueDays) {
  const unpaid = parseNumber(unpaidAmount) || 0;
  if (unpaid <= 0) {
    return "已结清";
  }
  if (dueDays === null) {
    return "未清";
  }
  if (dueDays < 0) {
    return "已逾期";
  }
  if (dueDays <= 7) {
    return "7天内到期";
  }
  return "未到期";
}

function financeUnpaidAmount(row, amount, paidAmount, statusText, direction) {
  const explicit = firstNumber(row.wsmoney, row.WsMoney, row.leftmoney, row.LeftMoney, row["未收金额"], row["未付金额"]);
  if (explicit !== null) return explicit;
  if (amount !== null && paidAmount !== null) return Math.max(0, Number((amount - paidAmount).toFixed(2)));
  if (direction === "payable" ? /未付款/.test(statusText || "") : /未收款/.test(statusText || "")) return amount;
  if (direction === "payable" ? /已付款/.test(statusText || "") : /已收款/.test(statusText || "")) return 0;
  return null;
}

function financeRowsByRisk(rows, riskStatus) {
  return rows
    .filter((row) => row.risk_status === riskStatus && parseNumber(row.unpaid_amount) > 0)
    .sort(compareFinanceDueRows);
}

function compareFinanceDueRows(a, b) {
  const aDays = a.due_days === null ? Number.POSITIVE_INFINITY : a.due_days;
  const bDays = b.due_days === null ? Number.POSITIVE_INFINITY : b.due_days;
  if (aDays !== bDays) {
    return aDays - bDays;
  }
  return (parseNumber(b.unpaid_amount) || 0) - (parseNumber(a.unpaid_amount) || 0);
}

function topFinanceCounterparties(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const unpaid = parseNumber(row.unpaid_amount) || 0;
    if (unpaid <= 0) {
      continue;
    }
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
    if (row.risk_status === "已逾期") {
      current.overdue_records += 1;
    }
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
    .slice(0, 20);
}

function firstNumber(...values) {
  for (const value of values) {
    const number = parseNumber(value);
    if (number !== null) {
      return number;
    }
  }
  return null;
}

function firstText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return null;
}

function sumFinanceAmount(rows, key) {
  const total = rows.reduce((sum, row) => sum + (parseNumber(row[key]) || 0), 0);
  return Number(total.toFixed(2));
}
