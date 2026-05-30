import { parseNumber } from "../displayUtils.js";
import { scopeRowsForUser } from "../auth.js";
import { STANDARD_MODEL_DICTIONARY, normalizeStandardFinanceRecord, normalizeStandardInventoryItem, normalizeStandardMaterialAlert, normalizeStandardOrder, normalizeStandardProcedure } from "../models/businessModels.js";
import { standardRisksForDomain } from "../models/standardRiskAccess.js";

const INTENT_LABELS = {
  order: "订单",
  production: "工序",
  material: "物料",
  finance: "财务",
  pmc_risk: "PMC风险",
  out_of_scope: "超出范围"
};

const COUNTRY_ALIASES = [
  ["印度", ["印度", "India", "Indian"]],
  ["美国", ["美国", "USA", "U.S.", "United States", "America"]],
  ["德国", ["德国", "Germany", "German"]],
  ["英国", ["英国", "UK", "United Kingdom", "Britain"]],
  ["日本", ["日本", "Japan", "Japanese"]],
  ["韩国", ["韩国", "Korea", "Korean"]],
  ["越南", ["越南", "Vietnam"]],
  ["俄罗斯", ["俄罗斯", "Russia"]],
  ["法国", ["法国", "France", "French"]],
  ["意大利", ["意大利", "Italy", "Italian"]],
  ["加拿大", ["加拿大", "Canada"]],
  ["澳大利亚", ["澳大利亚", "Australia"]],
  ["土耳其", ["土耳其", "Turkey"]],
  ["巴西", ["巴西", "Brazil"]],
  ["新加坡", ["新加坡", "Singapore"]],
  ["泰国", ["泰国", "Thailand"]],
  ["马来西亚", ["马来西亚", "Malaysia"]],
  ["印尼", ["印尼", "印度尼西亚", "Indonesia"]],
  ["菲律宾", ["菲律宾", "Philippines"]],
  ["阿联酋", ["阿联酋", "UAE"]],
  ["沙特", ["沙特", "Saudi"]]
];

export function createAiChatQuery({
  buildLocalPmcDashboard,
  latestSyncRuns,
  listAiChatLogs,
  listFinanceRecords,
  listInventoryDetails,
  listInventorySummary,
  listMaterialAlerts,
  listProcedurePlans,
  listSalesOrders,
  listStandardRisks = () => [],
  saveAiChatLog
}) {
  function queryAiChat({ message = "", today = new Date(), limit = 8, auth_user = null } = {}) {
    const question = String(message || "").trim();
    const safeLimit = clamp(limit, 3, 20);
    const intent = classifyIntent(question);
    const generatedAt = new Date().toISOString();

    if (!question) {
      return {
        scope: "local_sqlite_only",
        intent: "out_of_scope",
        answer: "请先输入要查询的问题。",
        sources: [],
        rows: [],
        suggestions: []
      };
    }

    const context = intent === "out_of_scope"
      ? { rows: [], sources: [], suggestions: ["可以问：今天老板最该关注什么？", "可以问：冲压有哪些逾期工序？", "可以问：哪些订单缺料？"] }
      : collectContext({ intent, question, today, limit: safeLimit, authUser: auth_user });
    const answer = intent === "out_of_scope"
      ? outOfScopeAnswer()
      : context.needs_clarification
        ? composeClarificationAnswer({ context })
        : composeAnswer({ intent, question, context, limit: safeLimit });
    const payload = {
      scope: "local_sqlite_only",
      intent,
      question,
      rows: context.needs_clarification ? [] : context.rows,
      structured_query: context.structured_query || null,
      needs_clarification: Boolean(context.needs_clarification),
      clarification_options: context.clarification_options || [],
      suggestions: context.suggestions,
      generated_at: generatedAt
    };
    const saved = saveAiChatLog?.({
      question,
      answer,
      intent,
      sources: context.sources,
      payload,
      created_at: generatedAt
    });

    return {
      ...payload,
      answer,
      sources: context.sources,
      log_id: saved?.id || null,
      recent_logs: listAiChatLogs ? listAiChatLogs({ limit: 3 }) : []
    };
  }

  function collectContext({ intent, question, today, limit, authUser = null }) {
    if (intent === "order") {
      return orderContext(question, today, limit, authUser);
    }
    if (intent === "production") {
      return productionContext(question, today, limit, authUser);
    }
    if (intent === "material") {
      return materialContext(question, limit, authUser);
    }
    if (intent === "finance") {
      return financeContext(question, limit, authUser);
    }
    return pmcRiskContext(today, limit, authUser);
  }

  function orderContext(question, today, limit, authUser) {
    const rows = scopeRowsForUser(listSalesOrders({ limit: 5000 }), authUser, "orders").map(normalizeStandardOrder);
    const plan = buildSemanticPlan(question, "order");
    const structuredQuery = structuredQueryForPlan("sales_orders", plan);
    const matchedRows = applySalesOrderPlan(rows, question, plan, today);
    const clarification = customerClarification({
      plan,
      matchedRows,
      sourceRows: rows,
      table: "sales_orders",
      label: "销售订单",
      field: "customer",
      structuredQuery
    });
    if (clarification) return clarification;
    const scoped = matchedRows
      .sort((a, b) => dateText(a.delivery_date).localeCompare(dateText(b.delivery_date)))
      .slice(0, limit)
      .map((row) => ({
        record_type: row.record_type,
        source_table: row.source_table,
        source_key: row.source_key,
        order_no: row.order_no,
        customer: row.customer,
        product_name: row.product_name,
        owner: row.owner,
        delivery_date: row.delivery_date,
        amount: row.amount,
        status_text: row.status_text
      }));
    return {
      rows: scoped,
      sources: [sourceMeta("sales_orders", rows, "销售订单", matchedRows.length)],
      analysis: summarizeOrders(scoped, plan),
      filter_description: describePlan(plan),
      structured_query: structuredQuery,
      suggestions: ["可继续问某个订单号当前风险。", "可按客户、国家、负责人、状态或金额继续追问。"]
    };
  }

  function productionContext(question, today, limit, authUser) {
    const rows = scopeRowsForUser(listProcedurePlans({ limit: 5000 }), authUser, "production").map(normalizeStandardProcedure);
    const day = startOfDay(new Date(today));
    const plan = buildSemanticPlan(question, "production");
    const structuredQuery = structuredQueryForPlan("procedure_plans", plan);
    const matchedRows = applyProcedurePlan(rows, question, plan, day);
    const matched = matchedRows
      .sort((a, b) => dateText(a.planned_finish_date).localeCompare(dateText(b.planned_finish_date)))
      .slice(0, limit)
      .map((row) => ({
        record_type: row.record_type,
        source_table: row.source_table,
        source_key: row.source_key,
        work_assignment_id: row.work_assignment_id,
        order_no: row.order_no,
        product_name: row.product_name,
        procedure_name: row.procedure_name,
        work_center_name: row.work_center_name,
        remaining_qty: row.remaining_qty,
        planned_finish_date: row.planned_finish_date,
        state: row.state
      }));
    return {
      rows: matched,
      sources: [sourceMeta("procedure_plans", rows, "工序派工", matchedRows.length)],
      filter_description: describePlan(plan),
      structured_query: structuredQuery,
      suggestions: ["可继续问某个派工单的订单号。", "可追问冲压、轧制或钨钼单独风险。"]
    };
  }

  function materialContext(question, limit, authUser) {
    const alerts = scopeRowsForUser(listMaterialAlerts({ limit: 1000 }), authUser, "material").map(normalizeStandardMaterialAlert);
    const summaries = scopeRowsForUser(listInventorySummary({ limit: 5000 }), authUser, "inventory").map((row) => normalizeStandardInventoryItem({ ...row, source_table: "erp_inventory_summary" }));
    const details = scopeRowsForUser(listInventoryDetails({ limit: 5000 }), authUser, "inventory").map((row) => normalizeStandardInventoryItem({ ...row, source_table: "erp_inventory_details" }));
    const plan = buildSemanticPlan(question, "material");
    const matchedAlerts = applyMaterialAlertPlan(alerts, question, plan);
    const matchedInventory = planHasCustomerScope(plan)
      ? []
      : applyInventoryPlan([...summaries, ...details], question, plan);
    const selectedTable = matchedAlerts.length ? "material_alerts" : "inventory_details";
    const structuredQuery = structuredQueryForPlan(selectedTable, plan);
    const clarification = matchedAlerts.length
      ? customerClarification({
        plan,
        matchedRows: matchedAlerts,
        sourceRows: alerts,
        table: "material_alerts",
        label: "物料告警",
        field: "customer",
        structuredQuery
      })
      : null;
    if (clarification) return clarification;
    const alertRows = matchedAlerts
      .slice(0, limit)
      .map((row) => ({
        record_type: row.record_type,
        source_table: row.source_table,
        source_key: row.source_key,
        alert_type: alertLabel(row.alert_type),
        order_no: row.order_no,
        customer: row.customer,
        product_name: row.product_name,
        warehouse: row.warehouse,
        demand_qty: row.demand_qty,
        available_qty: row.available_qty,
        shortage_qty: row.shortage_qty,
        priority: row.priority
      }));
    const inventoryRows = matchedInventory
      .slice(0, limit)
      .map((row) => ({
        record_type: row.record_type,
        source_table: row.source_table,
        source_key: row.source_key,
        product_code: row.product_code,
        product_name: row.product_name,
        warehouse: row.warehouse,
        batch_no: row.batch_no,
        available_qty: row.available_qty,
        stock_qty: row.stock_qty,
        unit: row.unit
      }));
    return {
      rows: alertRows.length ? alertRows : inventoryRows,
      sources: [
        sourceMeta("material_alerts", alerts, "物料告警", matchedAlerts.length),
        sourceMeta("inventory_summary", summaries, "库存余额", matchedInventory.filter((row) => summaries.includes(row)).length),
        sourceMeta("inventory_details", details, "库存明细", matchedInventory.filter((row) => details.includes(row)).length)
      ],
      analysis: summarizeMaterialRows(alertRows.length ? alertRows : inventoryRows, plan),
      filter_description: describePlan(plan),
      structured_query: structuredQuery,
      suggestions: ["可继续问某个物料在哪些仓库。", "可追问缺料影响哪些订单。"]
    };
  }

  function financeContext(question, limit, authUser) {
    const rows = scopeRowsForUser(listFinanceRecords({ limit: 5000 }), authUser, "finance").map(normalizeStandardFinanceRecord);
    const plan = buildSemanticPlan(question, "finance");
    const structuredQuery = structuredQueryForPlan("finance_records", plan);
    const matchedRows = applyFinancePlan(rows, question, plan);
    const clarification = customerClarification({
      plan,
      matchedRows,
      sourceRows: rows,
      table: "finance_records",
      label: "应收应付",
      field: "counterparty",
      structuredQuery
    });
    if (clarification) return clarification;
    const matched = matchedRows
      .sort((a, b) => riskFinanceWeight(a) - riskFinanceWeight(b))
      .slice(0, limit)
      .map((row) => ({
        record_type: row.record_type,
        source_table: row.source_table,
        source_key: row.source_key,
        direction: row.direction === "payable" ? "应付" : "应收",
        counterparty: row.counterparty,
        bill_no: row.bill_no,
        business_title: row.business_title,
        unpaid_amount: row.unpaid_amount,
        due_date: row.due_date,
        due_days: row.due_days,
        risk_status: row.risk_status,
        owner: row.owner
      }));
    return {
      rows: matched,
      sources: [sourceMeta("finance_records", rows, "应收应付", matchedRows.length)],
      analysis: summarizeFinanceRows(matched, plan),
      filter_description: describePlan(plan),
      structured_query: structuredQuery,
      suggestions: ["可继续问逾期应收客户排行。", "可追问7天内应付明细。"]
    };
  }

  function pmcRiskContext(today, limit, authUser) {
    const sourceRisks = standardRisksForDomain({
      domain: "pmc",
      listStandardRisks,
      authUser
    });
    const riskRows = sourceRisks
      .slice(0, limit)
      .map((row) => ({
        risk_level: row.risk_level,
        risk_id: row.risk_id,
        record_type: "risk",
        source_table: row.source_table,
        source_key: row.source_key,
        risk_score: row.risk_score,
        risk_type: row.risk_type,
        related_no: row.related_no,
        problem: row.problem || row.headline,
        owner_role: row.owner_role,
        next_action: row.planning_suggestion || row.suggested_action || row.next_action || row.primary_action,
        planning_suggestion: row.planning_suggestion || "",
        intervention_state: row.intervention_state || ""
      }));
    return {
      rows: riskRows,
      sources: [sourceMeta("standard_risks", sourceRisks, "统一风险事项", riskRows.length)],
      structured_query: {
        table: "standard_risks",
        standard_model: "risk",
        filters: { scope: "红黄牌/早会重点" }
      },
      suggestions: ["可继续问红牌风险按责任部门汇总。", "可追问某个关联单号的处理建议。"]
    };
  }

  function sourceMeta(table, rows, label, filteredRows = undefined) {
    const latestFromRows = latestSyncedAt(rows);
    const latestFromSync = latestSyncFor(table);
    return {
      table,
      standard_model: standardModelForTable(table),
      label,
      scope: "SQLite",
      rows: Array.isArray(rows) ? rows.length : 0,
      filtered_rows: Number.isFinite(filteredRows) ? filteredRows : (Array.isArray(rows) ? rows.length : 0),
      latest_synced_at: latestFromRows || latestFromSync || ""
    };
  }

  function latestSyncFor(table) {
    const sourceKey = tableToSourceKey(table);
    const row = (latestSyncRuns?.() || []).find((item) => item.source_key === sourceKey);
    return row?.finished_at || "";
  }

  return { queryAiChat };
}

function classifyIntent(question) {
  const text = String(question || "");
  if (/天气|股价|股票|新闻|汇率|航班|路线|百科|写诗|翻译/.test(text)) return "out_of_scope";
  if (/应收|应付|欠款|回款|付款|收款|逾期.*款|财务|客户.*钱|供应商.*款/.test(text)) return "finance";
  if (/缺料|库存|物料|仓库|低库存|废料库|可用量|库存量|齐套|材料/.test(text)) return "material";
  if (/工序|派工|生产|冲压|轧制|钨钼|机加|延期工序|逾期工序|工作中心|车间/.test(text)) return "production";
  if (/订单|交期|客户|销售|合同|发货|逾期订单|临期/.test(text)) return "order";
  if (/老板|管理|风险|红牌|黄牌|早会|重点|关注|问题|建议|汇总|PMC/i.test(text)) return "pmc_risk";
  return "out_of_scope";
}

function composeAnswer({ intent, context, limit }) {
  const title = INTENT_LABELS[intent] || "中台";
  const rows = context.rows || [];
  const lines = [`基于本地 SQLite 的${title}数据，当前找到 ${rows.length} 条重点记录。`];
  if (context.structured_query) {
    lines.push(`结构化查询：${formatStructuredQuery(context.structured_query)}`);
  }
  if (context.filter_description) {
    lines.push(`筛选条件：${context.filter_description}`);
  }
  if (context.analysis) {
    lines.push(context.analysis);
  }
  if (!rows.length) {
    lines.push("没有查到匹配记录。可以换订单号、客户、物料、工段或风险类型再问。");
  } else {
    lines.push(...rows.slice(0, limit).map((row, index) => `${index + 1}. ${rowSummary(intent, row)}`));
  }
  lines.push("");
  lines.push(`数据来源：${sourceSummaryText(context.sources)}`);
  lines.push("范围限制：本回答只基于中台已同步到本地 SQLite 的数据，不访问 ERP 实时接口，也不使用外部资料。");
  if (context.suggestions?.length) {
    lines.push(`可继续追问：${context.suggestions.slice(0, 2).join("；")}`);
  }
  return lines.join("\n");
}

function composeClarificationAnswer({ context }) {
  const options = context.clarification_options || [];
  const lines = [
    "请先确认你指的是哪个客户，然后我再继续查询。",
    `这个问题匹配到 ${options.length} 个可能客户：`
  ];
  lines.push(...options.map((row, index) => `${index + 1}. ${row.customer}（匹配记录${row.matched_rows}条）`));
  lines.push("你可以直接回复完整客户名称，或把客户名加到问题里再问。");
  lines.push("");
  const source = context.sources?.[0];
  if (source) {
    lines.push(`数据来源：来自 ${source.table} 表，共匹配到 ${options.length} 个客户、${source.filtered_rows} 条记录${source.latest_synced_at ? `，最近同步${formatDateTimeText(source.latest_synced_at)}` : ""}。`);
  } else {
    lines.push("数据来源：无。");
  }
  lines.push("范围限制：本回答只基于中台已同步到本地 SQLite 的数据，不访问 ERP 实时接口，也不使用外部资料。");
  return lines.join("\n");
}

function rowSummary(intent, row) {
  if (intent === "production") {
    return `派工${row.work_assignment_id || "-"}，订单${row.order_no || "未匹配"}，${joinText(row.product_name, row.procedure_name, row.work_center_name)}，剩余${formatQty(row.remaining_qty)}，计划完工${row.planned_finish_date || "-"}。`;
  }
  if (intent === "material") {
    if (row.alert_type) {
      return `${row.alert_type}：订单${row.order_no || "-"}，${row.product_name || "-"}，仓库${row.warehouse || "-"}，需求${formatQty(row.demand_qty)}，可用${formatQty(row.available_qty)}，缺口${formatQty(row.shortage_qty)}。`;
    }
    return `${row.product_name || "-"}，仓库${row.warehouse || "-"}，批号${row.batch_no || "-"}，可用${formatQty(row.available_qty)}${row.unit || ""}，库存${formatQty(row.stock_qty)}${row.unit || ""}。`;
  }
  if (intent === "finance") {
    return `${row.direction || ""}：${row.counterparty || "-"}，单号${row.bill_no || "-"}，未清${formatMoney(row.unpaid_amount)}，到期${row.due_date || "-"}，状态${row.risk_status || "-"}。`;
  }
  if (intent === "order") {
    return `订单${row.order_no || "-"}，客户${row.customer || "-"}，产品${row.product_name || "-"}，交期${row.delivery_date || "-"}，负责人${row.owner || "-"}，金额${formatMoney(row.amount)}。`;
  }
  return `${row.risk_id ? `${row.risk_id} ` : ""}${row.risk_level || ""}${row.risk_type || ""}：${row.related_no || "-"}，${row.problem || "-"}，状态${row.intervention_state || "待响应"}，责任${row.owner_role || "-"}，建议${row.next_action || "-"}。`;
}

function sourceSummaryText(sources = []) {
  if (!sources.length) return "无";
  return sources
    .map((row) => {
      const filteredRows = Number.isFinite(row.filtered_rows) ? row.filtered_rows : row.rows;
      const syncText = row.latest_synced_at ? `，最近同步${formatDateTimeText(row.latest_synced_at)}` : "";
      const modelText = row.standard_model ? `标准模型：${standardModelLabel(row.standard_model)}；` : "";
      const label = row.label ? `${row.label}：` : "";
      return `${label}${modelText}来自 ${row.table} 表，共筛选出 ${filteredRows} 条（表内共 ${row.rows} 条${syncText}）`;
    })
    .join("；");
}

function outOfScopeAnswer() {
  return [
    "当前中台没有该数据，无法在限定范围内回答。",
    "我只能查询本地 SQLite 中已同步的订单、工序、物料、财务和 PMC 风险数据。",
    "范围限制：本回答不访问 ERP 实时接口，也不使用外部资料。"
  ].join("\n");
}

function buildSemanticPlan(question, domain) {
  const text = String(question || "");
  const countries = extractCountries(text);
  const countryTerms = uniqueStrings(countries.flatMap((country) => country.terms));
  const ownerTerms = extractOwnerTerms(text);
  const customerTerms = extractCustomerTerms(text, countries);
  const amount = extractAmountFilter(text);
  const status = extractStatusFilter(text, domain);
  const due = extractDueFilter(text);
  const warehouseTerms = extractWarehouseTerms(text);
  const workshop = extractWorkshopFilter(text);
  const financeDirection = extractFinanceDirection(text);
  return {
    domain,
    customer_terms: uniqueStrings([...countryTerms, ...customerTerms]),
    country_terms: countryTerms,
    explicit_customer_terms: customerTerms,
    country_labels: countries.map((country) => country.label),
    owner_terms: ownerTerms,
    warehouse_terms: warehouseTerms,
    workshop,
    finance_direction: financeDirection,
    amount,
    status,
    due,
    overdue: due.type === "overdue",
    shortage: /缺料|短缺|不齐套|齐套不足/.test(text)
  };
}

function applySalesOrderPlan(rows, question, plan, today = new Date()) {
  const semantic = hasSemanticFilters(plan);
  const baseRows = semantic ? rows : filterRows(rows, question, ["order_no", "customer", "owner", "product_name", "status_text"]);
  return baseRows.filter((row) => {
    if (!matchTextTerms(row.customer, plan.customer_terms)) return false;
    if (!matchTextTerms(row.owner, plan.owner_terms)) return false;
    if (!matchAmount(row.amount, plan.amount)) return false;
    if (plan.status === "open" && !isOpenSalesOrder(row)) return false;
    if (plan.status === "closed" && isOpenSalesOrder(row)) return false;
    if (!matchDueDate(row.delivery_date, plan.due, today, () => isOpenSalesOrder(row))) return false;
    return true;
  });
}

function applyMaterialAlertPlan(rows, question, plan) {
  const semantic = hasSemanticFilters(plan);
  const baseRows = semantic ? rows : filterRows(rows, question, ["order_no", "customer", "product_code", "product_name", "warehouse", "alert_type", "priority"]);
  return baseRows.filter((row) => {
    if (!matchTextTerms(row.customer, plan.customer_terms)) return false;
    if (!matchTextTerms(row.owner || row.responsible_owner, plan.owner_terms)) return false;
    if (!matchTextTerms(row.warehouse, plan.warehouse_terms)) return false;
    if (plan.shortage && !/shortage|缺料|短缺/.test(String(row.alert_type || row.priority || ""))) return false;
    return true;
  });
}

function applyInventoryPlan(rows, question, plan) {
  const semantic = hasSemanticFilters(plan);
  const baseRows = semantic ? rows : filterRows(rows, question, ["product_code", "product_name", "warehouse", "batch_no", "serial_no", "product_category"]);
  return baseRows.filter((row) => {
    if (!matchTextTerms(row.warehouse, plan.warehouse_terms)) return false;
    return true;
  });
}

function applyProcedurePlan(rows, question, plan, today) {
  const semantic = hasSemanticFilters(plan);
  const baseRows = semantic ? rows : filterRows(rows, question, ["work_assignment_id", "order_no", "product_name", "procedure_name", "work_center_name", "owner", "state"]);
  return baseRows
    .filter((row) => matchTextTerms(row.owner, plan.owner_terms))
    .filter((row) => matchWorkshop(row, plan.workshop))
    .filter((row) => {
      if (plan.status === "open" && !isActiveProcedure(row)) return false;
      if (plan.status === "closed" && isActiveProcedure(row)) return false;
      if (!matchDueDate(row.planned_finish_date, plan.due, today, () => isActiveProcedure(row))) return false;
      if (!plan.due.type && plan.status !== "closed" && !(isActiveProcedure(row) || isDelayedProcedure(row, today))) return false;
      return true;
    });
}

function applyFinancePlan(rows, question, plan) {
  const semantic = hasSemanticFilters(plan);
  const baseRows = semantic ? rows : filterRows(rows, question, ["counterparty", "bill_no", "business_title", "risk_status", "direction", "owner"]);
  return baseRows.filter((row) => {
    if (!matchTextTerms(row.counterparty, plan.customer_terms)) return false;
    if (!matchTextTerms(row.owner, plan.owner_terms)) return false;
    if (!matchAmount(row.unpaid_amount ?? row.amount, plan.amount)) return false;
    if (plan.finance_direction && row.direction !== plan.finance_direction) return false;
    if (plan.overdue && !/逾期/.test(String(row.risk_status || "")) && !(parseNumber(row.due_days) < 0)) return false;
    if (plan.due.type === "due_soon" && !(parseNumber(row.due_days) >= 0 && parseNumber(row.due_days) <= plan.due.days)) return false;
    if (plan.status === "open" && /已结清|已清|已收款|已付款/.test(String(row.risk_status || ""))) return false;
    return true;
  });
}

function hasSemanticFilters(plan = {}) {
  return Boolean(
    plan.customer_terms?.length ||
    plan.owner_terms?.length ||
    plan.warehouse_terms?.length ||
    plan.workshop ||
    plan.finance_direction ||
    plan.amount ||
    plan.status ||
    plan.due?.type ||
    plan.shortage
  );
}

function planHasCustomerScope(plan = {}) {
  return Boolean(plan.customer_terms?.length || plan.country_labels?.length);
}

function customerClarification({ plan = {}, matchedRows = [], sourceRows = [], table, label, field, structuredQuery }) {
  if (!plan.country_labels?.length || plan.explicit_customer_terms?.length) return null;
  const grouped = new Map();
  for (const row of matchedRows) {
    const customer = String(row?.[field] || "").trim();
    if (!customer) continue;
    grouped.set(customer, (grouped.get(customer) || 0) + 1);
  }
  if (grouped.size <= 1) return null;
  const options = [...grouped.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([customer, matched_rows]) => ({ customer, matched_rows }));
  return {
    needs_clarification: true,
    rows: [],
    sources: [sourceMetaForClarification(table, sourceRows, label, matchedRows.length)],
    structured_query: structuredQuery,
    clarification_options: options,
    suggestions: options.slice(0, 3).map((row) => `查询${row.customer}的在制订单`)
  };
}

function sourceMetaForClarification(table, rows, label, filteredRows) {
  const latestFromRows = latestSyncedAt(rows);
  return {
    table,
    standard_model: standardModelForTable(table),
    label,
    scope: "SQLite",
    rows: Array.isArray(rows) ? rows.length : 0,
    filtered_rows: filteredRows,
    latest_synced_at: latestFromRows || ""
  };
}

function extractCountries(text) {
  return COUNTRY_ALIASES
    .filter(([, aliases]) => aliases.some((alias) => includesLoose(text, alias)))
    .map(([label, aliases]) => ({ label, terms: aliases }));
}

function extractCustomerTerms(text, countries = []) {
  const terms = [];
  const countryLabels = new Set(countries.map((country) => country.label));
  const beforeCustomer = text.match(/([\p{Script=Han}A-Za-z0-9& .·-]{2,40}?)(?:客户|公司)/u)?.[1];
  if (beforeCustomer && !/哪些|什么|有没有|负责|跟单|销售/.test(beforeCustomer) && !countryLabels.has(beforeCustomer)) {
    terms.push(beforeCustomer);
  }
  const afterCustomer = text.match(/客户[：:是为]?([\p{Script=Han}A-Za-z0-9& .·-]{1,40}?)(?:的|订单|有哪些|逾期|在制|金额|$)/u)?.[1];
  if (afterCustomer && !/的|订单|哪些|有哪些|逾期|在制|金额/.test(afterCustomer)) {
    terms.push(afterCustomer);
  }
  return uniqueStrings(terms.map((term) => term.trim()).filter(Boolean));
}

function extractOwnerTerms(text) {
  const terms = [];
  const beforeResponsible = text.match(/([\p{Script=Han}A-Za-z]{2,8})(?:负责|跟单|销售)/u)?.[1];
  if (beforeResponsible && !/客户|订单|哪些|金额|印度/.test(beforeResponsible)) terms.push(beforeResponsible);
  const afterResponsible = text.match(/(?:负责人|跟单员|销售)[：:是为]?([\p{Script=Han}A-Za-z]{2,8})/u)?.[1];
  if (afterResponsible) terms.push(afterResponsible);
  return uniqueStrings(terms);
}

function extractAmountFilter(text) {
  const match = text.match(/(?:金额|货值|合同额|未清|欠款)?(?:超过|大于|高于|不少于|>=|＞|>)(\d+(?:\.\d+)?)(万)?/u);
  if (!match) return null;
  const value = Number(match[1]) * (match[2] ? 10000 : 1);
  return Number.isFinite(value) ? { op: "gt", value } : null;
}

function extractStatusFilter(text, domain) {
  if (/在制|进行中|未完成|未出库|未发货|未交付|待发货|生产中|未关闭/.test(text)) return "open";
  if (/已完成|已发货|已出库|出库完毕|发货完毕|已关闭|已结清/.test(text)) return "closed";
  if (domain === "finance" && /未清|欠款|待收|待付/.test(text)) return "open";
  return "";
}

function extractDueFilter(text) {
  if (/逾期|超期|延期/.test(text)) return { type: "overdue" };
  if (/今天/.test(text)) return { type: "due_soon", days: 0 };
  if (/明天/.test(text)) return { type: "due_soon", days: 1 };
  const dayMatch = text.match(/(\d+)\s*天内/u);
  if (dayMatch) return { type: "due_soon", days: Number(dayMatch[1]) };
  if (/临期|近期|即将到期|到期/.test(text)) return { type: "due_soon", days: 7 };
  return { type: "" };
}

function extractWarehouseTerms(text) {
  const terms = [];
  for (const match of String(text || "").matchAll(/\d+号(?:废料|废品可利用|带箔材产成品|钽铌|原料|成品|半成品)?库/gu)) {
    terms.push(match[0]);
  }
  for (const keyword of ["废料库", "废品可利用库", "带箔材产成品库", "钽铌库", "原料库", "成品库", "半成品库"]) {
    if (String(text || "").includes(keyword) && !terms.some((term) => term.includes(keyword))) terms.push(keyword);
  }
  return uniqueStrings(terms);
}

function extractWorkshopFilter(text) {
  if (/冲压/.test(text)) return "冲压";
  if (/轧制|轧/.test(text)) return "轧制";
  if (/钨钼|机加|机加工/.test(text)) return "钨钼/机加";
  return "";
}

function extractFinanceDirection(text) {
  if (/应收|回款|收款|客户.*款/.test(text)) return "receivable";
  if (/应付|付款|供应商.*款/.test(text)) return "payable";
  return "";
}

function structuredQueryForPlan(table, plan = {}) {
  const filters = {};
  if (plan.country_labels?.length) filters.country_or_region = plan.country_labels;
  if (plan.explicit_customer_terms?.length) filters.customer = plan.explicit_customer_terms;
  if (plan.owner_terms?.length) filters.owner = plan.owner_terms;
  if (plan.status === "open") filters.status = "在制/未完成";
  if (plan.status === "closed") filters.status = "已完成/已关闭";
  if (plan.due?.type === "overdue") filters.due = "逾期";
  if (plan.due?.type === "due_soon") filters.due = `${plan.due.days}天内到期`;
  if (plan.shortage) filters.shortage = "缺料";
  if (plan.amount) filters.amount = `${plan.amount.op === "gt" ? "> " : ""}${formatMoney(plan.amount.value)}`;
  if (plan.warehouse_terms?.length) filters.warehouse = plan.warehouse_terms;
  if (plan.workshop) filters.workshop = plan.workshop;
  if (plan.finance_direction) filters.direction = plan.finance_direction === "payable" ? "应付" : "应收";
  return { table, standard_model: standardModelForTable(table), filters };
}

function formatStructuredQuery(query = {}) {
  const filters = Object.entries(query.filters || {})
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join("、") : value}`)
    .join("；");
  return `表=${query.table || "-"}${query.standard_model ? `；标准模型=${standardModelLabel(query.standard_model)}` : ""}${filters ? `；${filters}` : ""}`;
}

function describePlan(plan = {}) {
  const parts = [];
  if (plan.country_labels?.length) parts.push(`国家/地区包含${plan.country_labels.join("、")}`);
  const countryTerms = new Set(COUNTRY_ALIASES.flatMap(([label, aliases]) => plan.country_labels?.includes(label) ? aliases : []));
  const customTerms = (plan.customer_terms || []).filter((term) => !countryTerms.has(term));
  if (customTerms.length) parts.push(`客户包含${customTerms.slice(0, 3).join("、")}`);
  if (plan.owner_terms?.length) parts.push(`负责人包含${plan.owner_terms.join("、")}`);
  if (plan.workshop) parts.push(`工段为${plan.workshop}`);
  if (plan.warehouse_terms?.length) parts.push(`仓库包含${plan.warehouse_terms.join("、")}`);
  if (plan.status === "open") parts.push("状态为在制/未完成");
  if (plan.status === "closed") parts.push("状态为已完成/已关闭");
  if (plan.due?.type === "overdue") parts.push("交期或到期状态为逾期");
  if (plan.due?.type === "due_soon") parts.push(`${plan.due.days}天内到期`);
  if (plan.shortage) parts.push("存在缺料风险");
  if (plan.finance_direction) parts.push(plan.finance_direction === "payable" ? "方向为应付" : "方向为应收");
  if (plan.amount) parts.push(`金额${plan.amount.op === "gt" ? "超过" : ""}${formatMoney(plan.amount.value)}`);
  return parts.join("；");
}

function summarizeOrders(rows, plan = {}) {
  const totalAmount = rows.reduce((sum, row) => sum + (parseNumber(row.amount) || 0), 0);
  const owners = uniqueStrings(rows.map((row) => row.owner).filter(Boolean));
  const customers = uniqueStrings(rows.map((row) => row.customer).filter(Boolean));
  const overdueCount = rows.filter((row) => isOverdueSalesOrder(row, new Date())).length;
  const openCount = rows.filter(isOpenSalesOrder).length;
  const parts = [`汇总：共 ${rows.length} 单`, `总金额 ${formatMoney(totalAmount)}`];
  if (customers.length) parts.push(`客户 ${customers.slice(0, 3).join("、")}${customers.length > 3 ? `等${customers.length}家` : ""}`);
  if (owners.length) parts.push(`负责人 ${owners.join("、")}`);
  if (openCount) parts.push(`未完成 ${openCount} 单`);
  if (overdueCount) parts.push(`逾期 ${overdueCount} 单`);
  const suggestion = rows.length
    ? "建议：优先确认交期、排产/发货状态、缺料和客户沟通安排。"
    : "建议：检查客户名称、国家名称或同步覆盖范围。";
  return `${parts.join("；")}。${suggestion}`;
}

function summarizeMaterialRows(rows, plan = {}) {
  const shortageCount = rows.filter((row) => row.alert_type || parseNumber(row.shortage_qty) > 0).length;
  const customers = uniqueStrings(rows.map((row) => row.customer).filter(Boolean));
  const products = uniqueStrings(rows.map((row) => row.product_name).filter(Boolean));
  const shortageQty = rows.reduce((sum, row) => sum + (parseNumber(row.shortage_qty) || 0), 0);
  const parts = [`汇总：共 ${rows.length} 条`];
  if (shortageCount) parts.push(`缺料 ${shortageCount} 条`);
  if (shortageQty) parts.push(`缺口合计 ${formatQty(shortageQty)}`);
  if (customers.length) parts.push(`客户 ${customers.slice(0, 3).join("、")}`);
  if (products.length) parts.push(`物料/产品 ${products.slice(0, 3).join("、")}`);
  const suggestion = rows.length
    ? "建议：优先确认可调库存、采购到货日和受影响订单。"
    : "建议：检查是否已有物料告警同步，或换订单号/客户继续追问。";
  return `${parts.join("；")}。${suggestion}`;
}

function summarizeFinanceRows(rows, plan = {}) {
  const totalUnpaid = rows.reduce((sum, row) => sum + (parseNumber(row.unpaid_amount ?? row.amount) || 0), 0);
  const overdueCount = rows.filter((row) => /逾期/.test(String(row.risk_status || "")) || parseNumber(row.due_days) < 0).length;
  const counterparties = uniqueStrings(rows.map((row) => row.counterparty).filter(Boolean));
  const parts = [`汇总：共 ${rows.length} 条`, `未清金额 ${formatMoney(totalUnpaid)}`];
  if (overdueCount) parts.push(`逾期 ${overdueCount} 条`);
  if (counterparties.length) parts.push(`对象 ${counterparties.slice(0, 3).join("、")}`);
  return `${parts.join("；")}。建议：优先确认逾期原因、责任人和预计回款/付款日期。`;
}

function isOpenSalesOrder(row = {}) {
  const status = String(row.status_text || row.status || "");
  if (/作废|取消|关闭/.test(status)) return false;
  if (/出库完毕|发货完毕|已发货|已完成/.test(status)) return false;
  if (/未出库|未发货|未完成|待发货|生产中|未交付/.test(status)) return true;
  const remaining = parseNumber(row.remaining_qty);
  if (remaining !== null) return remaining > 0;
  return true;
}

function isOverdueSalesOrder(row = {}, today = new Date()) {
  const date = new Date(row.delivery_date || "");
  return isOpenSalesOrder(row) && Number.isFinite(date.getTime()) && startOfDay(date) < startOfDay(today);
}

function matchTextTerms(value, terms = []) {
  if (!terms?.length) return true;
  const text = normalizeText(value);
  return terms.some((term) => text.includes(normalizeText(term)));
}

function matchAmount(value, amount) {
  if (!amount) return true;
  const number = parseNumber(value);
  if (number === null) return false;
  return amount.op === "gt" ? number > amount.value : true;
}

function matchDueDate(value, due = {}, today = new Date(), openPredicate = () => true) {
  if (!due?.type) return true;
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return false;
  const gap = daysBetween(startOfDay(today), startOfDay(date));
  if (due.type === "overdue") return openPredicate() && gap < 0;
  if (due.type === "due_soon") return openPredicate() && gap >= 0 && gap <= due.days;
  return true;
}

function matchWorkshop(row = {}, workshop = "") {
  if (!workshop) return true;
  const text = [row.product_name, row.procedure_name, row.work_center_name, row.owner, row.state].filter(Boolean).join(" ");
  if (workshop === "冲压") return /冲压|冲床|冲圆|冲孔|成型|落料|切边|引伸|拉伸|拉深/.test(text);
  if (workshop === "轧制") return /轧制|轧机|冷轧|热轧|开坯|退火/.test(text);
  if (workshop === "钨钼/机加") return /钨|钼|机加|车|铣|磨|线切割|加工中心/.test(text);
  return true;
}

function includesLoose(text, term) {
  return normalizeText(text).includes(normalizeText(term));
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function filterRows(rows, question, fields) {
  const keywords = questionKeywords(question);
  if (!keywords.length) {
    return rows;
  }
  const exactMatches = rows.filter((row) => keywords.some((keyword) => fields.some((field) => String(row[field] || "").includes(keyword))));
  return exactMatches.length ? exactMatches : rows;
}

function questionKeywords(question) {
  return String(question || "")
    .split(/[^\p{Script=Han}A-Za-z0-9_-]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
    .filter((word) => !/^(哪些|什么|怎么|如何|当前|今天|本月|一下|帮我|查询|汇总|分析|重点|有没有)$/.test(word));
}

function isDelayedProcedure(row, today) {
  const finish = new Date(row.planned_finish_date || "");
  return Number.isFinite(finish.getTime()) && startOfDay(finish) < today && ((parseNumber(row.remaining_qty) || 0) > 0 || row.remaining_qty === null || row.remaining_qty === undefined);
}

function isActiveProcedure(row) {
  const remaining = parseNumber(row.remaining_qty);
  if (remaining !== null) {
    return remaining > 0;
  }
  return !/完工|关闭|结束|完成/.test(String(row.state || row.status || ""));
}

function filterProductionScope(rows, question) {
  const rules = [];
  if (/冲压/.test(question)) rules.push(/冲压|冲床|冲圆|冲孔|成型|落料|切边/);
  if (/轧制|轧/.test(question)) rules.push(/轧制|轧机|冷轧|热轧|开坯|退火/);
  if (/钨钼|机加|机加工/.test(question)) rules.push(/钨|钼|机加|车|铣|磨|线切割|加工中心/);
  if (!rules.length) return rows;
  const scoped = rows.filter((row) => {
    const text = [row.product_name, row.procedure_name, row.work_center_name, row.owner, row.state].filter(Boolean).join(" ");
    return rules.some((rule) => rule.test(text));
  });
  return scoped.length ? scoped : rows;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysBetween(start, end) {
  return Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000);
}

function latestSyncedAt(rows) {
  return (rows || [])
    .map((row) => row.synced_at || row.generated_at || row.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

function tableToSourceKey(table) {
  return {
    erp_sales_orders: "sales_orders",
    erp_procedure_plans: "procedure_plans",
    erp_material_alerts: "material_alerts",
    erp_inventory_summary: "inventory_summary",
    erp_inventory_details: "inventory_details",
    erp_finance_records: "finance_records",
    standard_risks: "standard_risks"
  }[table] || table;
}

function standardModelForTable(table) {
  return {
    sales_orders: "order",
    erp_sales_orders: "order",
    procedure_plans: "procedure",
    erp_procedure_plans: "procedure",
    material_alerts: "material_alert",
    erp_material_alerts: "material_alert",
    inventory_summary: "inventory_item",
    inventory_details: "inventory_item",
    erp_inventory_summary: "inventory_item",
    erp_inventory_details: "inventory_item",
    finance_records: "finance_record",
    erp_finance_records: "finance_record",
    standard_risks: "risk"
  }[table] || "";
}

function standardModelLabel(model = "") {
  return STANDARD_MODEL_DICTIONARY[model]?.label || model || "-";
}

function riskFinanceWeight(row) {
  if (row.risk_status === "已逾期") return 1;
  if (row.risk_status === "7天内到期") return 2;
  if (row.risk_status === "未清") return 3;
  return 4;
}

function alertLabel(value) {
  return value === "shortage" ? "缺料" : value === "low_stock" ? "低库存" : value || "物料预警";
}

function formatQty(value) {
  const number = parseNumber(value);
  if (number === null) return value ?? "-";
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
}

function formatMoney(value) {
  const number = parseNumber(value);
  if (number === null) return value ?? "-";
  return number.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function formatDateTimeText(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function joinText(...values) {
  return values.filter(Boolean).join(" / ") || "-";
}

function dateText(value) {
  return value || "9999-99-99";
}

function clamp(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}
