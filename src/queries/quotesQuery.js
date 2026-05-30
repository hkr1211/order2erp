import { clampInt, daysBetween, parseDate, parseJson, parseNumber, startOfDay } from "../displayUtils.js";
import { scopeRowsForUser } from "../auth.js";

export function createQuotesQueries({
  buildForeignTradeBoard,
  client,
  erpProtectionMode,
  listMaterialAlerts,
  listQuoteFollowups,
  listSalesOrders,
  queryPendingQuotes,
  quoteOwnerSummaryForLocal,
  summarizeDataSourceError,
  withTimeout
}) {
  async function queryQuoteCenter(params = {}) {
    if (params.refresh !== "1" && !params.searchKey) {
      const quoteRows = listQuoteFollowups({ limit: clampInt(params.limit || params.pagesize || 100, 1, 500) }).map((row) => ({
        ...row,
        raw: parseJson(row.raw_json, row)
      }));
      if (quoteRows.length) {
        const ownerRows = quoteOwnerSummaryForLocal(quoteRows);
        return {
          header: { status: 0, message: "ok" },
          body: {
            model: "quote_center",
            generated_at: new Date().toISOString(),
            cached: true,
            summary: {
              scanned_projects: quoteRows.length,
              pending_quote_projects: quoteRows.length,
              quote_followups: quoteRows.length,
              urgent_quotes: quoteRows.filter((row) => row.priority === "高").length,
              owner_count: ownerRows.length
            },
            rows: quoteRows,
            sections: {
              quote_followups: quoteRows,
              owner_summary: ownerRows
            },
            source_status: {
              sqlite_quote_followups: { ok: true, rows: quoteRows.length }
            },
            notes: [
              "当前读取本地 SQLite 待报价项目。",
              "点击“谨慎同步报价20条”可从 ERP 小批量更新本地待报价数据。"
            ]
          }
        };
      }
      if (erpProtectionMode) {
        return {
          header: { status: 0, message: "ok" },
          body: emptyQuoteCenterBody("ERP保护模式已开启，待报价中心未找到本地 SQLite 数据时不再自动请求 ERP。")
        };
      }
    }

    let pending;
    let sourceError = null;
    const timeoutMs = clampInt(params.timeout_ms || 5000, 1000, 15000);
    const today = startOfDay(parseDate(params.today) || new Date());
    try {
      pending = await withTimeout(queryPendingQuotes(client, {
        pageindex: params.pageindex || 1,
        pagesize: params.pagesize || 20,
        limit: params.limit || 30,
        searchKey: params.searchKey || "",
        include_all: params.include_all || ""
      }), timeoutMs);
    } catch (error) {
      sourceError = summarizeDataSourceError(error);
    }
    const quoteRows = (pending?.body?.rows || []).map((row) => mapQuoteFollowup(row, today));
    const ownerRows = quoteOwnerSummary(quoteRows);
    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "quote_center",
        generated_at: new Date().toISOString(),
        offline: Boolean(sourceError),
        summary: {
          scanned_projects: pending?.body?.summary?.scanned_projects ?? 0,
          pending_quote_projects: pending?.body?.summary?.pending_quote_projects ?? 0,
          quote_followups: quoteRows.length,
          urgent_quotes: quoteRows.filter((row) => row.priority === "高").length,
          owner_count: ownerRows.length
        },
        rows: quoteRows,
        sections: {
          quote_followups: quoteRows,
          owner_summary: ownerRows
        },
        source_status: {
          pending_quotes: { ok: !sourceError, message: sourceError }
        },
        notes: [
          ...(sourceError ? [`ERP 数据源暂不可用：${sourceError}`] : []),
          "待报价中心基于项目/商机阶段、金额状态和创建日期生成报价跟进池。",
          "后续可补充报价截止时间、跟进记录和一键提醒。"
        ]
      }
    };
  }

  function queryForeignTradeBoard(params = {}) {
    const limit = clampInt(params.limit || params.pagesize || 1000, 1, 5000);
    return buildForeignTradeBoard({
      salesOrders: scopeRowsForUser(listSalesOrders({ limit }), params.auth_user, "orders"),
      materialAlerts: scopeRowsForUser(listMaterialAlerts({ limit: 2000 }), params.auth_user, "material")
    });
  }

  return { queryForeignTradeBoard, queryQuoteCenter };
}

function emptyQuoteCenterBody(message) {
  return {
    model: "quote_center",
    generated_at: new Date().toISOString(),
    cached: true,
    offline: true,
    summary: {
      scanned_projects: 0,
      pending_quote_projects: 0,
      quote_followups: 0,
      urgent_quotes: 0,
      owner_count: 0
    },
    rows: [],
    sections: {
      quote_followups: [],
      owner_summary: []
    },
    source_status: {
      sqlite_quote_followups: { ok: false, rows: 0, message }
    },
    notes: [
      message,
      "请在 ERP 稳定时点击“谨慎同步”更新本地待报价数据。"
    ]
  };
}

function mapQuoteFollowup(row, today) {
  const createdDate = parseDate(row.created_date);
  const ageDays = createdDate ? daysBetween(startOfDay(createdDate), today) : null;
  const estimatedAmount = parseNumber(row.estimated_amount) || 0;
  const quotedAmount = parseNumber(row.quoted_amount) || 0;
  const stageText = [row.follow_stage, row.project_stage, row.approval_status, row.lead_status].filter(Boolean).join(" ");
  const priority = quotePriority(ageDays, estimatedAmount, stageText);
  const quoteStatus = quotedAmount > 0 ? "已报价待确认" : /询价|报价|核价|定价/.test(stageText) ? "待报价" : "待确认需求";
  return {
    quote_no: row.project_no || row.erp_id,
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

function quotePriority(ageDays, amount, stageText) {
  if (ageDays !== null && ageDays >= 7) {
    return "高";
  }
  if (amount >= 100000 || /核价|定价/.test(stageText)) {
    return "高";
  }
  if (ageDays !== null && ageDays >= 3) {
    return "中";
  }
  return "低";
}

function quoteAction(priority, quoteStatus) {
  if (quoteStatus === "已报价待确认") {
    return "跟进客户反馈并推动确认";
  }
  if (priority === "高") {
    return "优先确认规格、成本和报价截止时间";
  }
  return "补齐需求资料并安排报价";
}

function quoteOwnerSummary(rows) {
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
    current.estimated_amount += parseNumber(row.estimated_amount) || 0;
    current.max_age_days = Math.max(current.max_age_days, parseNumber(row.age_days) || 0);
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
