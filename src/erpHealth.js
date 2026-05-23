export function buildErpHealthSummary({ queue = {}, requestLogs = [], syncPolicyRows = [] } = {}) {
  const failedLogs = requestLogs.filter((row) => row.status === "failed");
  const failedSyncPolicies = syncPolicyRows.filter((row) => row.health_status === "最近失败");
  const cooldownPolicies = syncPolicyRows.filter((row) => row.health_status === "冷却中");

  if (queue.circuit_state === "open") {
    return {
      status: "critical",
      message: "ERP 请求熔断中，系统正在保护 ERP，暂停实时请求。",
      recent_failed_requests: failedLogs.length,
      failed_sync_sources: failedSyncPolicies.length,
      cooldown_sources: cooldownPolicies.length
    };
  }
  if ((Number(queue.running) || 0) > 0 || (Number(queue.queued) || 0) > 0) {
    return {
      status: "busy",
      message: "ERP 请求队列正在处理实时请求，请等待队列清空。",
      recent_failed_requests: failedLogs.length,
      failed_sync_sources: failedSyncPolicies.length,
      cooldown_sources: cooldownPolicies.length
    };
  }
  if (failedLogs.length > 0 || failedSyncPolicies.length > 0) {
    return {
      status: "warning",
      message: "最近存在 ERP 请求或同步失败，建议先查看 ERP 请求日志。",
      recent_failed_requests: failedLogs.length,
      failed_sync_sources: failedSyncPolicies.length,
      cooldown_sources: cooldownPolicies.length
    };
  }
  return {
    status: "healthy",
    message: "本地保护模式运行正常，当前没有 ERP 实时请求压力。",
    recent_failed_requests: 0,
    failed_sync_sources: 0,
    cooldown_sources: cooldownPolicies.length
  };
}

export function shouldBlockErpBusinessQuery({ protectionMode, health, params = {} } = {}) {
  if (!protectionMode) {
    return { blocked: false };
  }
  if (isTruthy(params.force_erp) || isTruthy(params.force)) {
    return { blocked: false };
  }
  if (health?.status !== "critical") {
    return { blocked: false };
  }
  return {
    blocked: true,
    reason: "ERP保护模式：当前健康状态为 critical，已阻止业务 API 实时查询；确认 ERP 稳定后可加 force_erp=1 强制执行。"
  };
}

function isTruthy(value) {
  if (value === true || value === 1) {
    return true;
  }
  const text = value === undefined || value === null ? "" : String(value).trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}
