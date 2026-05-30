import { clampInt } from "../displayUtils.js";
import { hasFullDataAccess, scopeRowsForUser } from "../auth.js";

export function createActionQueries({
  buildLocalPmcDashboard,
  latestPmcInterventions,
  listOrderProcedureLinks,
  listProcedurePlans,
  listProcessReports,
  listSalesOrders,
  pmcInterventionSummary
}) {
  function queryProcedureLinks(params = {}, saved = null) {
    const limit = clampInt(params.local_limit || 5000, 1, 5000);
    const salesOrders = scopeRowsForUser(listSalesOrders({ limit }), params.auth_user, "orders");
    const procedurePlans = scopeRowsForUser(listProcedurePlans({ limit }), params.auth_user, "production");
    const processReports = scopeRowsForUser(typeof listProcessReports === "function" ? listProcessReports({ limit }) : [], params.auth_user, "production");
    const procedureLinks = scopeProcedureLinks(listOrderProcedureLinks({ limit: 1000 }), { salesOrders, procedurePlans, authUser: params.auth_user });
    const dashboard = buildLocalPmcDashboard({
      today: new Date(),
      salesOrders,
      procedurePlans,
      procedureLinks
    });
    return {
      params,
      saved,
      summary: {
        sales_orders: salesOrders.length,
        procedure_plans: procedurePlans.length,
        links: procedureLinks.length,
        unmatched_procedure_plans: dashboard.summary.unmatched_procedure_plans,
        match_rate: dashboard.summary.procedure_order_match_rate
      },
      links: procedureLinks,
      erp_field_audit: procedureLinkFieldAudit({ procedurePlans, processReports, salesOrders }),
      link_suggestions: procedureLinkSuggestions({
        procedures: dashboard.sections.unmatched_procedure_plans,
        processReports,
        salesOrders
      }),
      unmatched: dashboard.sections.unmatched_procedure_plans.map((row) => ({
        ...row,
        supplement_path: procedureSupplementPath(row)
      })),
      orders: salesOrders.slice(0, 80)
    };
  }

  function queryInterventionLogCenter(params = {}) {
    const limit = clampInt(params.limit || 100, 1, 200);
    const filters = {
      related_no: String(params.related_no || "").trim(),
      risk_type: String(params.risk_type || "").trim(),
      actor: String(params.actor || "").trim(),
      intervention_state: String(params.intervention_state || "").trim(),
      date_from: String(params.date_from || "").trim(),
      date_to: String(params.date_to || "").trim(),
      limit
    };
    const rows = scopeInterventionRows(latestPmcInterventions(filters), params.auth_user);
    const summary = pmcInterventionSummary({ today: new Date(), limit: 20 });
    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "intervention_log_center",
        generated_at: new Date().toISOString(),
        filters,
        summary: {
          shown_actions: rows.length,
          today_actions: summary.today_actions,
          total_actions: summary.total_actions,
          risk_types: summary.by_risk_type.length,
          result_types: summary.by_result_type.length,
          incomplete_closures: summary.incomplete_closures,
          suggestions: summary.improvement_suggestions.length
        },
        sections: {
          rows,
          by_risk_type: summary.by_risk_type,
          by_result_type: summary.by_result_type,
          by_closure_quality: summary.by_closure_quality,
          improvement_suggestions: summary.improvement_suggestions
        },
        notes: [
          "本页只读取本地 SQLite 干预记录，不访问 ERP。",
          "这些记录用于 PMC 首页、待响应风险和报表中心的闭环状态判断。",
          "如果要查某个订单或项目，可在地址后加 related_no，例如 /interventions?related_no=PO51969。"
        ]
      }
    };
  }

  function scopeInterventionRows(rows = [], authUser = null) {
    if (!authUser || hasFullDataAccess(authUser, "pmc")) {
      return rows;
    }
    const scopedOrders = scopeRowsForUser(listSalesOrders({ limit: 5000 }), authUser, "orders");
    const scopedProcedures = scopeRowsForUser(listProcedurePlans({ limit: 5000 }), authUser, "production");
    const allowedRelatedNos = new Set([
      ...scopedOrders.map((row) => cleanKey(row.order_no || row.related_no || row.erp_id)),
      ...scopedProcedures.map((row) => cleanKey(row.work_assignment_id || row.dispatch_no || row.related_no))
    ].filter(Boolean));
    const ownNames = new Set([authUser.display_name, authUser.name, authUser.username].map(cleanKey).filter(Boolean));
    return rows.filter((row) => {
      const relatedNo = cleanKey(row.related_no);
      const actor = cleanKey(row.actor);
      const nextOwner = cleanKey(row.next_owner);
      return allowedRelatedNos.has(relatedNo) || ownNames.has(actor) || ownNames.has(nextOwner);
    });
  }

  return { queryInterventionLogCenter, queryProcedureLinks };
}

function scopeProcedureLinks(links = [], { salesOrders = [], procedurePlans = [], authUser = null } = {}) {
  if (!authUser || hasFullDataAccess(authUser, "production")) {
    return links;
  }
  const orderNos = new Set(salesOrders.map((row) => cleanKey(row.order_no || row.related_no || row.erp_id)).filter(Boolean));
  const procedureNos = new Set(procedurePlans.map((row) => cleanKey(row.work_assignment_id || row.dispatch_no || row.related_no)).filter(Boolean));
  return links.filter((row) => orderNos.has(cleanKey(row.order_no || row.related_no)) || procedureNos.has(cleanKey(row.work_assignment_id || row.dispatch_no)));
}

function cleanKey(value) {
  return String(value || "").trim();
}

function procedureLinkFieldAudit({ procedurePlans = [], processReports = [], salesOrders = [] } = {}) {
  const procedureKeys = rawJsonKeys(procedurePlans);
  const reportKeys = rawJsonKeys(processReports);
  const salesKeys = rawJsonKeys(salesOrders);
  const procedureHasOrder = procedureKeys.some((key) => /订单|合同|销售|来源|关联|主题|htid|order/i.test(key));
  const reportHasSubject = reportKeys.some((key) => /单据主题|主题|title|subject/i.test(key));
  const salesHasTitle = salesKeys.some((key) => /title|htid|合同|订单/i.test(key));
  return [
    {
      source: "派工/工序计划",
      rows: procedurePlans.length,
      order_no_status: procedureHasOrder ? "存在疑似订单字段，需确认映射" : "未返回订单号字段",
      useful_fields: procedureKeys.slice(0, 12).join("、") || "无raw_json字段",
      conclusion: procedureHasOrder ? "可继续核对字段含义，谨慎加入自动映射。" : "当前接口不能直接补销售订单号，需要借助工序汇报、合同明细或人工绑定。"
    },
    {
      source: "工序汇报历史",
      rows: processReports.length,
      order_no_status: reportHasSubject ? "单据主题含外部编号线索" : "未发现单据主题线索",
      useful_fields: reportKeys.slice(0, 12).join("、") || "无raw_json字段",
      conclusion: reportHasSubject ? "可用单据主题编号反查销售合同标题，再生成建议绑定。" : "无法作为自动补全依据。"
    },
    {
      source: "销售订单/合同",
      rows: salesOrders.length,
      order_no_status: salesHasTitle ? "合同标题可用于反查外部编号" : "本地订单缺合同标题",
      useful_fields: salesKeys.slice(0, 12).join("、") || "无raw_json字段",
      conclusion: salesOrders.length < 100 ? "本地订单样本偏少，建议先补齐90天销售订单和合同明细。" : "可用于编号反查和候选绑定。"
    }
  ];
}

function procedureLinkSuggestions({ procedures = [], processReports = [], salesOrders = [] } = {}) {
  const orders = salesOrders.map((order) => ({
    order,
    searchText: [order.order_no, order.customer, order.product_name, order.raw_json, safeJson(order.raw_json)?.title, safeJson(order.raw_json)?.htid].filter(Boolean).join(" ")
  }));
  return procedures
    .map((procedure) => {
      const report = bestReportForProcedure(procedure, processReports);
      const subjectRef = extractSubjectRef(report?.subject || "");
      const matchedOrder = subjectRef ? orders.find(({ searchText }) => searchText.includes(subjectRef))?.order : null;
      return {
        work_assignment_id: procedure.work_assignment_id,
        product_name: procedure.product_name,
        procedure_name: procedure.procedure_name,
        work_center_name: procedure.work_center_name,
        report_subject: report?.subject || "",
        subject_ref: subjectRef,
        candidate_order_no: matchedOrder?.order_no || "",
        candidate_customer: matchedOrder?.customer || "",
        suggestion_basis: matchedOrder
          ? "工序汇报单据主题编号+产品工序"
          : subjectRef
            ? "工序汇报单据主题编号，需补齐销售订单/合同明细后反查"
            : "未找到可用编号线索，需人工核对ERP派工单",
        confidence: matchedOrder ? "建议人工确认后绑定" : "需人工补充",
        bind_action: matchedOrder ? procedureBindHref(procedure, matchedOrder.order_no, "工序汇报主题编号反查") : "",
        supplement_path: procedureSupplementPath(procedure, subjectRef)
      };
    })
    .filter((row) => row.subject_ref || row.candidate_order_no)
    .slice(0, 50);
}

function bestReportForProcedure(procedure, processReports) {
  const product = normalizeText(procedure.product_name);
  const procedureName = normalizeText(procedure.procedure_name);
  if (!product || !procedureName) return null;
  return processReports.find((report) =>
    normalizeText(report.product_name) === product &&
    normalizeText(report.procedure_name) === procedureName
  ) || null;
}

function procedureBindHref(procedure, orderNo, reason) {
  const params = new URLSearchParams();
  params.set("order_no", orderNo || "");
  params.set("work_assignment_id", procedure.work_assignment_id || "");
  params.set("procedure_name", procedure.procedure_name || "");
  params.set("product_name", procedure.product_name || "");
  params.set("reason", reason || "人工确认归属订单");
  return `/procedure-links?${params.toString()}`;
}

function procedureSupplementPath(row, subjectRef = "") {
  return `先在ERP派工单/工序计划中查询派工单ID ${row.work_assignment_id || ""} 的来源单据；再到销售合同按产品${row.product_name ? `“${row.product_name}”` : ""}${subjectRef ? `或外部编号“${subjectRef}”` : ""}核对；确认后在本页保存绑定。`;
}

function rawJsonKeys(rows) {
  const keys = new Set();
  for (const row of rows.slice(0, 50)) {
    const raw = safeJson(row.raw_json) || row.raw || {};
    Object.keys(raw).forEach((key) => keys.add(key));
  }
  return [...keys];
}

function safeJson(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractSubjectRef(value) {
  const matches = String(value || "").match(/\d{5,6}/g) || [];
  return matches[0] || "";
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, "").toLowerCase();
}
