import {
  daysBetween,
  formatDate,
  number,
  parseDate,
  parseJson,
  round2,
  sameDay,
  startOfDay
} from "./utils.js";
import {
  buildProcedureOrderMatchMap,
  enrichProcedureOrderMatch,
  normalizeProcedurePlan,
  procedureKey,
  procedureLinkHref
} from "./procedureMatching.js";
import { WORKSHOP_SECTIONS, classifyWorkshopSection } from "./workshopSections.js";

export {
  buildProcedureOrderMatchMap,
  enrichProcedureOrderMatch,
  normalizeProcedurePlan,
  procedureKey
} from "./procedureMatching.js";

export function enrichProcedurePlansWithOrderMatches({ procedurePlans = [], salesOrders = [], procedureLinks = [], processReports = [], today = new Date() } = {}) {
  const day = startOfDay(today);
  const normalizedOrders = salesOrders.map((row) => normalizeOrder(row, day));
  const normalizedProcedures = procedurePlans.map(normalizeProcedurePlan);
  const matches = buildProcedureOrderMatchMap(normalizedProcedures, normalizedOrders, procedureLinks, processReports);
  return normalizedProcedures.map((row, index) => enrichProcedureOrderMatch(row, matches.get(procedureKey(row, index))));
}

export function buildWorkshopBoard({ procedurePlans = [], processReports = [], materialAlerts = [], salesOrders = [], procedureLinks = [], today = new Date() } = {}) {
  const day = startOfDay(today);
  const sections = WORKSHOP_SECTIONS.map((section) => createWorkshopSection(section));
  const byKey = new Map(sections.map((section) => [section.key, section]));
  const normalizedOrders = salesOrders.map((row) => normalizeOrder(row, day));
  const boardPlans = procedurePlans
    .map(normalizeProcedurePlan)
    .filter((row) => isActiveOnDay(row, day) || isOpenDelayed(row, day));
  const procedureOrderMatches = buildProcedureOrderMatchMap(boardPlans, normalizedOrders, procedureLinks, processReports);
  const todayReports = processReports
    .map((row) => ({ ...row, report_qty: number(row.report_qty) || 0 }))
    .filter((row) => sameDay(parseDate(row.added_at), day));

  boardPlans.forEach((row, index) => {
    const section = byKey.get(classifyWorkshopSection(row).key);
    addWorkshopPlan(section, row, day, procedureOrderMatches.get(procedureKey(row, index)));
  });

  for (const row of todayReports) {
    const section = byKey.get(classifyWorkshopSection(row).key);
    section.today_report_rows += 1;
    section.today_report_qty = round2(section.today_report_qty + (number(row.report_qty) || 0));
  }

  for (const alert of materialAlerts || []) {
    const orderNo = String(alert.order_no || "").trim();
    const matchedSections = sections.filter((section) => orderNo && section.plans.some((row) => row.order_no === orderNo));
    const targets = matchedSections.length ? matchedSections : sections.filter((section) => classifyWorkshopSection(alert).key === section.key);
    for (const section of targets) {
      const relatedObject = alert.order_no ? "订单" : "物料";
      section.material_alerts += 1;
      section.warnings.push({
        warning_type: alert.alert_type === "shortage" ? "缺料" : "物料预警",
        level: alert.priority || "中",
        related_object: relatedObject,
        related_id: alert.order_no || alert.product_code || "",
        message: [alert.product_name, formatQty(alert.shortage_qty || alert.available_qty || alert.stock_qty)].filter(Boolean).join(" ")
      });
    }
  }

  for (const section of sections) {
    section.plans.sort((a, b) => statusWeight(b.status) - statusWeight(a.status) || String(a.planned_finish_date || "").localeCompare(String(b.planned_finish_date || "")));
    section.warnings.sort((a, b) => warningWeight(b.warning_type) - warningWeight(a.warning_type));
    section.completion_rate = section.planned_qty > 0 ? Number(((section.finished_qty / section.planned_qty) * 100).toFixed(1)) : 0;
    section.open_plans = section.active_plans - section.completed_plans;
    section.top_plans = section.plans.slice(0, 12);
    section.top_warnings = section.warnings.slice(0, 8);
  }

  return {
    model: "workshop_board",
    generated_at: new Date().toISOString(),
    today: formatDate(day),
    summary: {
      active_plans: sections.reduce((sum, row) => sum + row.active_plans, 0),
      completed_plans: sections.reduce((sum, row) => sum + row.completed_plans, 0),
      delayed_plans: sections.reduce((sum, row) => sum + row.delayed_plans, 0),
      material_alerts: sections.reduce((sum, row) => sum + row.material_alerts, 0),
      today_report_qty: round2(sections.reduce((sum, row) => sum + row.today_report_qty, 0))
    },
    sections,
    notes: [
      "今日计划口径：planned_start_date <= 今天 <= planned_finish_date。",
      "机加类工序归入钨钼板块。",
      "本看板只读取 SQLite，不实时访问 ERP。"
    ]
  };
}

function createWorkshopSection(section) {
  return {
    ...section,
    active_plans: 0,
    completed_plans: 0,
    delayed_plans: 0,
    open_plans: 0,
    planned_qty: 0,
    finished_qty: 0,
    remaining_qty: 0,
    completion_rate: 0,
    today_report_rows: 0,
    today_report_qty: 0,
    material_alerts: 0,
    plans: [],
    top_plans: [],
    warnings: [],
    top_warnings: []
  };
}

function addWorkshopPlan(section, row, day, orderMatch = null) {
  const plannedQty = number(row.planned_qty) || 0;
  const finishedQty = number(row.finished_qty) || 0;
  const remainingQty = row.remaining_qty === null ? Math.max(0, plannedQty - finishedQty) : number(row.remaining_qty) || 0;
  const status = workshopPlanStatus(row, day);
  if (isActiveOnDay(row, day)) section.active_plans += 1;
  section.planned_qty = round2(section.planned_qty + plannedQty);
  section.finished_qty = round2(section.finished_qty + finishedQty);
  section.remaining_qty = round2(section.remaining_qty + remainingQty);
  if (status === "已完成") section.completed_plans += 1;
  if (status === "延期") section.delayed_plans += 1;

  const plan = {
    work_assignment_id: row.work_assignment_id,
    order_no: row.order_no,
    sales_order_no: orderMatch?.order_no || row.order_no || "",
    order_match_by: orderMatch?.matched_by || (row.order_no ? "ERP自带" : "未匹配"),
    product_name: row.product_name,
    procedure_name: row.procedure_name,
    work_center_name: row.work_center_name,
    planned_qty: plannedQty,
    finished_qty: finishedQty,
    remaining_qty: remainingQty,
    planned_start_date: row.planned_start_date,
    planned_finish_date: row.planned_finish_date,
    owner: row.owner,
    state: row.state,
    status,
    link_action: procedureLinkHref(row)
  };
  section.plans.push(plan);

  if (status === "延期") {
    section.warnings.push({
      warning_type: "延期",
      level: "高",
      related_object: row.work_assignment_id ? "派工" : "订单",
      related_id: row.work_assignment_id || row.order_no || "",
      message: `${row.procedure_name || "工序"}计划完工 ${row.planned_finish_date || "未填"}，剩余 ${formatQty(remainingQty)}`
    });
  }
  if (!String(row.owner || "").trim()) {
    section.warnings.push({
      warning_type: "无负责人",
      level: "中",
      related_object: row.work_assignment_id ? "派工" : "订单",
      related_id: row.work_assignment_id || row.order_no || "",
      message: `${row.procedure_name || "工序"}未分配负责人`
    });
  }
}

function isActiveOnDay(row, day) {
  const start = parseDate(row.planned_start_date);
  const finish = parseDate(row.planned_finish_date);
  if (start && finish) return startOfDay(start) <= day && day <= startOfDay(finish);
  if (finish) return sameDay(finish, day);
  return false;
}

function isOpenDelayed(row, day) {
  const finish = parseDate(row.planned_finish_date);
  if (!finish || startOfDay(finish) >= day) return false;
  const remaining = number(row.remaining_qty);
  const finished = number(row.finished_qty) || 0;
  const planned = number(row.planned_qty) || 0;
  return !((remaining !== null && remaining <= 0) || (planned > 0 && finished >= planned) || /完工|完成/.test(String(row.state || "")));
}

function workshopPlanStatus(row, day) {
  const remaining = number(row.remaining_qty);
  const finished = number(row.finished_qty) || 0;
  const planned = number(row.planned_qty) || 0;
  const finish = parseDate(row.planned_finish_date);
  if ((remaining !== null && remaining <= 0) || (planned > 0 && finished >= planned) || /完工|完成/.test(String(row.state || ""))) return "已完成";
  if (finish && startOfDay(finish) < day) return "延期";
  if (/生产|进行|开工/.test(String(row.state || ""))) return "进行中";
  return "未完成";
}

function statusWeight(status) {
  if (status === "延期") return 4;
  if (status === "进行中") return 3;
  if (status === "未完成") return 2;
  return 1;
}

function warningWeight(type) {
  if (type === "延期") return 4;
  if (type === "缺料") return 3;
  if (type === "无负责人") return 2;
  return 1;
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

function formatQty(value) {
  const parsed = number(value);
  return parsed === null ? "" : parsed.toFixed(2);
}
