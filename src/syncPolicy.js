export const SYNC_SOURCES = [
  { source_key: "sales_orders", label: "销售订单", recommended_interval: "15分钟", risk_level: "中" },
  { source_key: "procedure_plans", label: "派工/工序计划", recommended_interval: "30分钟", risk_level: "中" },
  { source_key: "material_alerts", label: "物料/库存告警", recommended_interval: "30分钟", risk_level: "高" },
  { source_key: "quote_projects", label: "待报价项目", recommended_interval: "60分钟", risk_level: "低" },
  { source_key: "finance_records", label: "应收应付", recommended_interval: "120分钟", risk_level: "低" }
];

export function buildSyncPolicyRows({ latestRuns = [], now = new Date(), cooldownSeconds = 300 } = {}) {
  return SYNC_SOURCES.map((source) => {
    const latest = latestRuns.find((row) => row.source_key === source.source_key);
    const finishedAt = parseDate(latest?.finished_at || latest?.started_at);
    const elapsedSeconds = finishedAt ? Math.floor((now.getTime() - finishedAt.getTime()) / 1000) : null;
    const inCooldown = elapsedSeconds !== null && elapsedSeconds >= 0 && elapsedSeconds < cooldownSeconds;
    const nextAllowedAt = inCooldown ? new Date(finishedAt.getTime() + cooldownSeconds * 1000) : null;
    const failed = latest?.status === "failed";
    const healthStatus = failed ? "最近失败" : inCooldown ? "冷却中" : latest ? "可同步" : "未同步";
    return {
      ...source,
      last_status: latest?.status || "无记录",
      last_rows: latest?.rows_synced ?? "",
      last_finished_at: finishedAt ? formatDateTime(finishedAt) : "",
      next_allowed_at: nextAllowedAt ? formatDateTime(nextAllowedAt) : "现在可同步",
      health_status: healthStatus,
      action: syncPolicyAction({ failed, inCooldown, source })
    };
  });
}

function syncPolicyAction({ failed, inCooldown, source }) {
  if (failed) {
    return "暂停重复同步，先确认 ERP 服务稳定或改用本地旧数据。";
  }
  if (inCooldown) {
    return "等待冷却结束，避免连续请求 ERP。";
  }
  return `可按需小批量同步${source.label}。`;
}

function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
