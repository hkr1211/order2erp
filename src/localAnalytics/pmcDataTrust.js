import {
  daysBetween,
  parseDate,
  startOfDay
} from "./utils.js";

export function buildPmcDataTrust({ sources = {}, today = new Date() } = {}) {
  const dataFreshness = buildPmcDataFreshness(sources, today);
  const dataTrust = buildPmcDataTrustSummary(dataFreshness);
  return { dataFreshness, dataTrust };
}

function buildPmcDataFreshness(sources, today) {
  return [
    dataFreshnessRow("sales_orders", "销售订单", sources.salesOrders, today, "影响交期、订单作战地图和跟单员视图"),
    dataFreshnessRow("material_alerts", "物料/库存告警", sources.materialAlerts, today, "影响缺料、低库存和物料风险"),
    dataFreshnessRow("procedure_plans", "派工计划", sources.procedurePlans, today, "影响工序延期、前后工段和车间看板"),
    dataFreshnessRow("inventory_details", "库存明细批次", sources.inventoryDetails, today, "影响半成品批次、前后工段转序和库存批次判断"),
    dataFreshnessRow("finance_records", "应收应付", sources.financeRows, today, "影响财务风险")
  ];
}

function buildPmcDataTrustSummary(dataFreshness = []) {
  const rows = Array.isArray(dataFreshness) ? dataFreshness : [];
  const trustedRows = rows.filter((row) => !["需关注", "无数据"].includes(row.freshness_status));
  const attentionRows = rows.filter((row) => row.freshness_status === "需关注");
  const missingRows = rows.filter((row) => row.freshness_status === "无数据");
  const attentionSources = [...attentionRows, ...missingRows].map((row) => row.source_name).filter(Boolean);
  const trustedSources = trustedRows.map((row) => row.source_name).filter(Boolean);
  const latestSyncedAt = rows.map((row) => row.latest_synced_at).filter(Boolean).sort().at(-1) || "";
  const trustScore = rows.length ? Math.round((trustedRows.length / rows.length) * 100) : 0;
  const trustStatus = trustScore >= 80 ? "可信" : trustScore >= 40 ? "需复核" : "数据不足";
  return {
    trust_status: trustStatus,
    trust_score: trustScore,
    total_sources: rows.length,
    trusted_source_count: trustedRows.length,
    attention_source_count: attentionSources.length,
    trusted_sources: trustedSources.join("、") || "暂无",
    attention_sources: attentionSources.join("、") || "无",
    missing_sources: missingRows.map((row) => row.source_name).filter(Boolean).join("、") || "无",
    latest_synced_at: latestSyncedAt,
    decision_guardrail: dataTrustGuardrail(trustStatus),
    suggested_action: dataTrustAction(attentionSources)
  };
}

function dataTrustGuardrail(status) {
  if (status === "可信") return "可以用于早会判断";
  if (status === "需复核") return "关键决策需人工复核";
  return "先补同步再决策";
}

function dataTrustAction(attentionSources = []) {
  return attentionSources.length
    ? `优先补同步/核对：${attentionSources.join("、")}`
    : "保持每日1点增量同步，并关注接口异常";
}

function dataFreshnessRow(sourceKey, sourceName, rows = [], today, impact) {
  const rowCount = rows.length;
  const latestSyncedAt = latestSyncedAtForRows(rows);
  const freshnessStatus = freshnessStatusForSyncedAt(latestSyncedAt, rowCount, today);
  return {
    source_key: sourceKey,
    source_name: sourceName,
    row_count: rowCount,
    latest_synced_at: latestSyncedAt,
    freshness_status: freshnessStatus,
    impact,
    action: freshnessAction(freshnessStatus)
  };
}

function latestSyncedAtForRows(rows = []) {
  return rows
    .map((row) => row.synced_at)
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

function freshnessStatusForSyncedAt(value, rowCount, today) {
  if (!rowCount || !value) return "无数据";
  const syncedAt = parseDate(value);
  if (!syncedAt) return "需关注";
  const ageDays = daysBetween(startOfDay(syncedAt), today);
  if (ageDays <= 0) return "今日已同步";
  if (ageDays <= 1) return "1天内";
  if (ageDays <= 2) return "可用";
  return "需关注";
}

function freshnessAction(status) {
  if (status === "今日已同步" || status === "1天内") return "可用于判断";
  if (status === "可用") return "建议确认是否需要补同步";
  if (status === "无数据") return "先检查接口权限或同步任务";
  return "建议补同步后再决策";
}
