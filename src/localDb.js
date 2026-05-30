import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createLocalAuthStore, requireInitialPasswordResetForExistingUsers, seedDefaultAuthUser, seedDefaultLocalUserRoles } from "./localDb/auth.js";
import { createLocalLogStore } from "./localDb/logs.js";
import { createLocalBusinessTableStore } from "./localDb/businessTables.js";
import { initializeLocalSchema } from "./localDb/schema.js";
import { createStandardRisk } from "./models/riskModel.js";
import { collectDashboardRisks } from "./models/riskSelectors.js";

const DEFAULT_DB_PATH = path.resolve("data/pmc.db");

let db;

export function initLocalDb(dbPath = process.env.PMC_DB_PATH || DEFAULT_DB_PATH) {
  if (db) {
    return db;
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  initializeLocalSchema(db);
  seedDefaultAuthUser(db);
  requireInitialPasswordResetForExistingUsers(db);
  seedDefaultLocalUserRoles(db);
  return db;
}

const localAuthStore = createLocalAuthStore({ getDb: initLocalDb });
const localLogStore = createLocalLogStore({ getDb: initLocalDb });
const localBusinessTableStore = createLocalBusinessTableStore({ getDb: initLocalDb });

export const saveLocalUserRole = localAuthStore.saveLocalUserRole;
export const listLocalUserRoles = localAuthStore.listLocalUserRoles;
export const resetLocalUserPassword = localAuthStore.resetLocalUserPassword;
export const saveLocalAuthUser = localAuthStore.saveLocalAuthUser;
export const listLocalAuthUsers = localAuthStore.listLocalAuthUsers;
export const upsertOrgUsers = localAuthStore.upsertOrgUsers;
export const replaceOrgUsers = localAuthStore.replaceOrgUsers;
export const listOrgUsers = localAuthStore.listOrgUsers;
export const verifyLocalAuthUser = localAuthStore.verifyLocalAuthUser;
export const validateLocalAuthPassword = localAuthStore.validateLocalAuthPassword;
export const changeLocalAuthPassword = localAuthStore.changeLocalAuthPassword;
export const createLocalAuthSession = localAuthStore.createLocalAuthSession;
export const getLocalAuthSession = localAuthStore.getLocalAuthSession;
export const deleteLocalAuthSession = localAuthStore.deleteLocalAuthSession;
export const deleteLocalUserRole = localAuthStore.deleteLocalUserRole;

export const startSyncRun = localLogStore.startSyncRun;
export const finishSyncRun = localLogStore.finishSyncRun;
export const latestSyncRuns = localLogStore.latestSyncRuns;
export const logErpRequest = localLogStore.logErpRequest;
export const latestErpRequestLogs = localLogStore.latestErpRequestLogs;
export const saveAiChatLog = localLogStore.saveAiChatLog;
export const listAiChatLogs = localLogStore.listAiChatLogs;
export const startHistorySyncRun = localLogStore.startHistorySyncRun;
export const finishHistorySyncRun = localLogStore.finishHistorySyncRun;
export const latestHistorySyncRuns = localLogStore.latestHistorySyncRuns;

export const excludeQuoteFollowup = localBusinessTableStore.excludeQuoteFollowup;
export const listQuoteExclusions = localBusinessTableStore.listQuoteExclusions;
export const replaceSalesOrders = localBusinessTableStore.replaceSalesOrders;
export const upsertSalesOrders = localBusinessTableStore.upsertSalesOrders;
export const replaceProcedurePlans = localBusinessTableStore.replaceProcedurePlans;
export const upsertProcedurePlans = localBusinessTableStore.upsertProcedurePlans;
export const upsertProcessReports = localBusinessTableStore.upsertProcessReports;
export const existingProcessReportIds = localBusinessTableStore.existingProcessReportIds;
export const replaceMaterialAlerts = localBusinessTableStore.replaceMaterialAlerts;
export const upsertWarehouses = localBusinessTableStore.upsertWarehouses;
export const upsertInventorySummary = localBusinessTableStore.upsertInventorySummary;
export const upsertInventoryDetails = localBusinessTableStore.upsertInventoryDetails;
export const existingInventorySummaryIds = localBusinessTableStore.existingInventorySummaryIds;
export const existingInventoryDetailIds = localBusinessTableStore.existingInventoryDetailIds;
export const upsertPurchaseOrders = localBusinessTableStore.upsertPurchaseOrders;
export const upsertSuppliers = localBusinessTableStore.upsertSuppliers;
export const replaceQuoteFollowups = localBusinessTableStore.replaceQuoteFollowups;
export const upsertQuoteFollowups = localBusinessTableStore.upsertQuoteFollowups;
export const replaceFinanceRecords = localBusinessTableStore.replaceFinanceRecords;
export const upsertFinanceRecords = localBusinessTableStore.upsertFinanceRecords;
export const listSalesOrders = localBusinessTableStore.listSalesOrders;
export const listProcedurePlans = localBusinessTableStore.listProcedurePlans;
export const listProcessReports = localBusinessTableStore.listProcessReports;
export const listMaterialAlerts = localBusinessTableStore.listMaterialAlerts;
export const listQuoteFollowups = localBusinessTableStore.listQuoteFollowups;
export const listFinanceRecords = localBusinessTableStore.listFinanceRecords;
export const listPurchaseOrders = localBusinessTableStore.listPurchaseOrders;
export const listSuppliers = localBusinessTableStore.listSuppliers;
export const listInventorySummary = localBusinessTableStore.listInventorySummary;
export const listInventoryDetails = localBusinessTableStore.listInventoryDetails;
export const tableStats = localBusinessTableStore.tableStats;

export function savePmcSnapshot(payload) {
  const database = initLocalDb();
  const createdAt = payload.generated_at || new Date().toISOString();
  const summary = payload.summary || {};
  database
    .prepare(
      "INSERT INTO pmc_dashboard_snapshots (created_at, summary_json, payload_json) VALUES (?, ?, ?)"
    )
    .run(createdAt, JSON.stringify(summary), JSON.stringify(payload));
  saveStandardRisks(collectDashboardRisks(payload), { generated_at: createdAt });
}

export function latestPmcSnapshot() {
  const database = initLocalDb();
  const row = database
    .prepare("SELECT created_at, summary_json, payload_json FROM pmc_dashboard_snapshots ORDER BY id DESC LIMIT 1")
    .get();
  if (!row) {
    return null;
  }
  return {
    created_at: row.created_at,
    summary: JSON.parse(row.summary_json),
    payload: JSON.parse(row.payload_json)
  };
}

export function saveStandardRisks(risks = [], { generated_at = new Date().toISOString(), replace = true } = {}) {
  const database = initLocalDb();
  const rows = risks.map((risk) => createStandardRisk(risk));
  const updatedAt = new Date().toISOString();
  database.exec("BEGIN");
  try {
    if (replace) {
      database.prepare("DELETE FROM standard_risks").run();
    }
    const statement = database.prepare(
      `INSERT OR REPLACE INTO standard_risks
       (risk_id, generated_at, risk_level, risk_type, related_object, related_no, source_table, source_key, source_rule, match_method,
        responsible_owner, owner_role, customer, counterparty, problem, suggested_action, planning_suggestion, prediction_level,
        prediction_reason, risk_score, due_date, status, raw_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const row of rows) {
      statement.run(
        row.risk_id,
        generated_at,
        row.risk_level || "",
        row.risk_type || "",
        row.related_object || "",
        row.related_no || "",
        row.source_table || "",
        row.source_key || "",
        row.source_rule || "",
        row.match_method || "",
        row.responsible_owner || "",
        row.owner_role || "",
        row.customer || "",
        row.counterparty || "",
        row.problem || "",
        row.suggested_action || row.primary_action || "",
        row.planning_suggestion || "",
        row.prediction_level || "",
        row.prediction_reason || "",
        Number.isFinite(Number(row.risk_score)) ? Number(row.risk_score) : null,
        row.due_date || "",
        row.status || "",
        JSON.stringify(row),
        updatedAt
      );
    }
    database
      .prepare("INSERT OR REPLACE INTO local_meta (key, value, updated_at) VALUES (?, ?, ?)")
      .run("standard_risks_generated_at", generated_at, updatedAt);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return { generated_at, rows_saved: rows.length };
}

export function latestStandardRisks({ limit = 5000, related_no = "", related_object = "", risk_level = "", risk_type = "", owner = "", open_only = false } = {}) {
  const database = initLocalDb();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5000, 10000));
  const filters = [];
  const values = [];
  if (related_no) {
    filters.push("related_no LIKE ?");
    values.push(`%${String(related_no).trim()}%`);
  }
  if (related_object) {
    filters.push("related_object = ?");
    values.push(String(related_object).trim());
  }
  if (risk_level) {
    filters.push("risk_level = ?");
    values.push(String(risk_level).trim());
  }
  if (risk_type) {
    filters.push("risk_type = ?");
    values.push(String(risk_type).trim());
  }
  if (owner) {
    filters.push("(responsible_owner LIKE ? OR owner_role LIKE ?)");
    const value = `%${String(owner).trim()}%`;
    values.push(value, value);
  }
  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = database
    .prepare(
      `SELECT risk_id, generated_at, risk_level, risk_type, related_object, related_no, source_table, source_key, source_rule, match_method,
              responsible_owner, owner_role, customer, counterparty, problem, suggested_action, planning_suggestion, prediction_level,
              prediction_reason, risk_score, due_date, status, raw_json, updated_at
       FROM standard_risks
       ${whereClause}
       ORDER BY CASE WHEN risk_level LIKE '%红%' THEN 1 WHEN risk_level LIKE '%黄%' THEN 2 ELSE 3 END,
                COALESCE(risk_score, 0) DESC,
                related_no
       LIMIT ?`
    )
    .all(...values, safeLimit)
    .map(rowFromStandardRisk);
  const enrichedRows = enrichStandardRisksWithInterventions(rows);
  return open_only ? enrichedRows.filter((row) => row.is_open) : enrichedRows;
}

export function standardRiskSummary() {
  const rows = latestStandardRisks({ limit: 10000 });
  return {
    generated_at: rows[0]?.generated_at || initLocalDb().prepare("SELECT value FROM local_meta WHERE key = ?").get("standard_risks_generated_at")?.value || "",
    total_risks: rows.length,
    open_risks: rows.filter((row) => row.is_open).length,
    red_risks: rows.filter((row) => String(row.risk_level || "").includes("红")).length,
    yellow_risks: rows.filter((row) => String(row.risk_level || "").includes("黄")).length
  };
}

export function savePmcIntervention(entry) {
  const database = initLocalDb();
  const createdAt = entry.created_at || new Date().toISOString();
  const payload = {
    risk_level: entry.risk_level || "",
    risk_type: entry.risk_type || "",
    related_no: entry.related_no || "",
    action_label: entry.action_label || "",
    intervention_state: normalizeInterventionState(entry.intervention_state || entry.state || entry.status || entry.action_label),
    result_type: entry.result_type || defaultResultType(entry.action_label || entry.risk_type || ""),
    promised_date: entry.promised_date || "",
    next_owner: entry.next_owner || "",
    problem: entry.problem || "",
    note: entry.note || "",
    actor: entry.actor || "内网用户"
  };
  const result = database
    .prepare(
      `INSERT INTO pmc_intervention_logs
       (created_at, risk_level, risk_type, related_no, action_label, intervention_state, result_type, promised_date, next_owner, problem, note, actor, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(createdAt, payload.risk_level, payload.risk_type, payload.related_no, payload.action_label, payload.intervention_state, payload.result_type, payload.promised_date, payload.next_owner, payload.problem, payload.note, payload.actor, JSON.stringify({ ...entry, ...payload }));
  return { id: result.lastInsertRowid, created_at: createdAt, ...payload };
}

function defaultResultType(value = "") {
  const text = String(value || "");
  if (/调拨/.test(text)) return "调拨库存";
  if (/替代/.test(text)) return "替代料";
  if (/催|供应商|物流/.test(text)) return "供应商跟催";
  if (/加班|增班/.test(text)) return "加班增产";
  if (/外协/.test(text)) return "外协处理";
  if (/排程|协调|顺序/.test(text)) return "调整排程";
  if (/客户|沟通|通知/.test(text)) return "客户沟通";
  return "其他处理";
}

function normalizeInterventionState(value = "") {
  const text = String(value || "").trim();
  if (/关闭|完成|闭环|已处理/.test(text)) return "已关闭";
  if (/响应|已响应/.test(text)) return "已响应";
  if (/处理中|处理|跟踪|催|协调|沟通|调拨|替代|排程|加班|外协|通知/.test(text)) return "处理中";
  return "处理中";
}

export function latestPmcInterventions({ limit = 20, related_no = "", risk_type = "", actor = "", intervention_state = "", date_from = "", date_to = "" } = {}) {
  const database = initLocalDb();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 200));
  const filters = [];
  const values = [];
  if (related_no) {
    filters.push("related_no LIKE ?");
    values.push(`%${String(related_no).trim()}%`);
  }
  if (risk_type) {
    filters.push("risk_type = ?");
    values.push(String(risk_type).trim());
  }
  if (actor) {
    filters.push("actor LIKE ?");
    values.push(`%${String(actor).trim()}%`);
  }
  if (intervention_state) {
    filters.push("intervention_state = ?");
    values.push(String(intervention_state).trim());
  }
  if (date_from) {
    filters.push("created_at >= ?");
    values.push(String(date_from).trim());
  }
  if (date_to) {
    filters.push("created_at <= ?");
    values.push(String(date_to).trim());
  }
  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  return database
    .prepare(
      `SELECT id, created_at, risk_level, risk_type, related_no, action_label, intervention_state, result_type, promised_date, next_owner, problem, note, actor, payload_json
       FROM pmc_intervention_logs
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(...values, safeLimit)
    .map(withClosureQuality);
}

export function latestPmcInterventionsByRelatedNos(relatedNos = []) {
  const keys = [...new Set(relatedNos.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!keys.length) {
    return new Map();
  }
  const database = initLocalDb();
  const placeholders = keys.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `SELECT id, created_at, risk_level, risk_type, related_no, action_label, intervention_state, result_type, promised_date, next_owner, problem, note, actor, payload_json
       FROM pmc_intervention_logs
       WHERE related_no IN (${placeholders})
       ORDER BY created_at DESC, id DESC`
    )
    .all(...keys)
    .map(withClosureQuality);
  const latestByNo = new Map();
  for (const row of rows) {
    if (!latestByNo.has(row.related_no)) {
      latestByNo.set(row.related_no, row);
    }
  }
  return latestByNo;
}

export function saveOrderProcedureLink(entry = {}) {
  const database = initLocalDb();
  const orderNo = String(entry.order_no || "").trim();
  const workAssignmentId = String(entry.work_assignment_id || "").trim();
  const procedureName = String(entry.procedure_name || "").trim();
  if (!orderNo || !workAssignmentId) {
    throw new Error("order_no and work_assignment_id are required");
  }
  const payload = {
    order_no: orderNo,
    work_assignment_id: workAssignmentId,
    procedure_name: procedureName,
    product_name: String(entry.product_name || "").trim(),
    reason: String(entry.reason || "").trim(),
    actor: String(entry.actor || "内网用户").trim() || "内网用户",
    created_at: entry.created_at || new Date().toISOString()
  };
  const result = database
    .prepare(
      `INSERT OR REPLACE INTO order_procedure_links
       (order_no, work_assignment_id, procedure_name, product_name, reason, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(payload.order_no, payload.work_assignment_id, payload.procedure_name, payload.product_name, payload.reason, payload.actor, payload.created_at);
  return { id: result.lastInsertRowid, ...payload };
}

export function listOrderProcedureLinks({ limit = 200 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 1000));
  return initLocalDb()
    .prepare(
      `SELECT id, order_no, work_assignment_id, procedure_name, product_name, reason, actor, created_at
       FROM order_procedure_links
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(safeLimit);
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function pmcInterventionSummary({ today = new Date(), limit = 8 } = {}) {
  const database = initLocalDb();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 50));
  const dayStart = startOfLocalDay(today).toISOString();
  const dayEnd = endOfLocalDay(today).toISOString();
  const totalActions = database.prepare("SELECT COUNT(*) AS count FROM pmc_intervention_logs").get()?.count || 0;
  const todayActions = database
    .prepare("SELECT COUNT(*) AS count FROM pmc_intervention_logs WHERE created_at >= ? AND created_at <= ?")
    .get(dayStart, dayEnd)?.count || 0;
  const recentActions = database
    .prepare(
      `SELECT id, created_at, risk_level, risk_type, related_no, action_label, intervention_state, result_type, promised_date, next_owner, problem, note, actor, payload_json
       FROM pmc_intervention_logs
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(safeLimit)
    .map(withClosureQuality);
  const byRiskType = database
    .prepare(
      `SELECT COALESCE(NULLIF(risk_type, ''), '未分类') AS risk_type, COUNT(*) AS actions
       FROM pmc_intervention_logs
       GROUP BY COALESCE(NULLIF(risk_type, ''), '未分类')
       ORDER BY actions DESC, risk_type`
    )
    .all();
  const byResultType = database
    .prepare(
      `SELECT COALESCE(NULLIF(result_type, ''), '未分类') AS result_type, COUNT(*) AS actions
       FROM pmc_intervention_logs
       GROUP BY COALESCE(NULLIF(result_type, ''), '未分类')
       ORDER BY actions DESC, result_type`
    )
    .all();
  const qualityRows = database
    .prepare(
      `SELECT intervention_state, result_type, promised_date, next_owner, note
       FROM pmc_intervention_logs`
    )
    .all()
    .map(withClosureQuality);
  const byClosureQuality = interventionQualitySummary(qualityRows);
  return {
    today_actions: todayActions,
    total_actions: totalActions,
    recent_actions: recentActions,
    by_risk_type: byRiskType,
    by_result_type: byResultType,
    by_closure_quality: byClosureQuality,
    incomplete_closures: byClosureQuality.find((row) => row.closure_quality === "闭环不完整")?.actions || 0,
    improvement_suggestions: interventionImprovementSuggestions(byResultType)
  };
}

function withClosureQuality(row = {}) {
  const quality = interventionClosureQuality(row);
  return {
    ...row,
    closure_quality: quality.closure_quality,
    closure_gap: quality.closure_gap
  };
}

function rowFromStandardRisk(row = {}) {
  const raw = parseJsonObject(row.raw_json);
  return {
    ...raw,
    risk_id: row.risk_id,
    generated_at: row.generated_at,
    risk_level: row.risk_level,
    risk_type: row.risk_type,
    related_object: row.related_object,
    related_no: row.related_no,
    source_table: row.source_table,
    source_key: row.source_key,
    source_rule: row.source_rule,
    match_method: row.match_method,
    responsible_owner: row.responsible_owner,
    owner_role: row.owner_role,
    customer: row.customer,
    counterparty: row.counterparty,
    problem: row.problem,
    suggested_action: row.suggested_action,
    planning_suggestion: row.planning_suggestion,
    prediction_level: row.prediction_level,
    prediction_reason: row.prediction_reason,
    risk_score: row.risk_score,
    due_date: row.due_date,
    status: row.status,
    raw_json: row.raw_json,
    updated_at: row.updated_at
  };
}

function enrichStandardRisksWithInterventions(rows = []) {
  const latestByNo = latestPmcInterventionsByRelatedNos(rows.map((row) => row.related_no));
  return rows.map((row) => {
    const latest = latestByNo.get(row.related_no);
    const state = latest?.intervention_state || "待响应";
    return {
      ...row,
      intervention_state: state,
      risk_status: state,
      latest_intervention: latest?.action_label || "",
      latest_action_label: latest?.action_label || "",
      latest_actor: latest?.actor || "",
      latest_at: latest?.created_at || "",
      result_type: latest?.result_type || "",
      promised_date: latest?.promised_date || "",
      next_owner: latest?.next_owner || "",
      is_open: isFinalInterventionState(state) ? 0 : 1
    };
  });
}

function isFinalInterventionState(value = "") {
  return String(value || "") === "已关闭";
}

function interventionClosureQuality(row = {}) {
  const state = row.intervention_state || "";
  const gaps = [];
  if (!row.result_type) gaps.push("处理结果");
  if (!row.promised_date) gaps.push("承诺日期");
  if (!row.next_owner) gaps.push("下一责任人");
  if (!row.note) gaps.push("处理备注");
  if (state === "已关闭" && gaps.length) {
    return { closure_quality: "闭环不完整", closure_gap: gaps.join("、") };
  }
  if (state === "已关闭") {
    return { closure_quality: "闭环完整", closure_gap: "" };
  }
  return { closure_quality: "处理中", closure_gap: gaps.join("、") };
}

function interventionQualitySummary(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row.closure_quality || "未分类";
    const current = grouped.get(key) || { closure_quality: key, actions: 0 };
    current.actions += 1;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => b.actions - a.actions || a.closure_quality.localeCompare(b.closure_quality, "zh-CN"));
}

function interventionImprovementSuggestions(byResultType = []) {
  return byResultType
    .filter((row) => row.actions > 0)
    .slice(0, 8)
    .map((row) => ({
      result_type: row.result_type,
      actions: row.actions,
      review_focus: improvementReviewFocus(row.result_type),
      recommendation: improvementRecommendation(row.result_type)
    }));
}

function improvementReviewFocus(resultType = "") {
  if (resultType === "供应商跟催") return "采购交付稳定性";
  if (resultType === "调拨库存") return "库存布局和安全库存";
  if (resultType === "替代料") return "替代料标准和审批";
  if (resultType === "加班增产") return "产能负荷和班次";
  if (resultType === "外协处理") return "外协资源池";
  if (resultType === "调整排程") return "排程规则和插单影响";
  if (resultType === "客户沟通") return "客户预警和交期承诺";
  return "处理闭环质量";
}

function improvementRecommendation(resultType = "") {
  if (resultType === "供应商跟催") return "供应商交付问题占比高，建议采购建立到货承诺台账、供应商分级和提前预警。";
  if (resultType === "调拨库存") return "调拨库存频繁，建议复核安全库存、库位分布和常用规格备货策略。";
  if (resultType === "替代料") return "替代料使用频繁，建议沉淀可替代料清单、质量确认规则和审批路径。";
  if (resultType === "加班增产") return "加班增产频繁，建议复盘瓶颈工序产能、班次安排和关键设备负荷。";
  if (resultType === "外协处理") return "外协处理频繁，建议建立合格外协资源池、价格周期和质量验收标准。";
  if (resultType === "调整排程") return "调整排程频繁，建议复盘插单规则、冻结周期和订单优先级机制。";
  if (resultType === "客户沟通") return "客户沟通频繁，建议提前暴露交期风险，统一延期说明和新交期承诺口径。";
  return "建议复盘处理备注完整性，统一原因分类和责任人填写。";
}

function startOfLocalDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfLocalDay(date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}
