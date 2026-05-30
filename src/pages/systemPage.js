export function createSystemPageRenderers({ modulePage, modulePanel }) {
  function systemStatusPage(body) {
    const erpOnlineText = body.summary.erp_online === null ? "未检测" : body.summary.erp_online ? "是" : "否";
    return modulePage({
      title: "数据源状态中心",
      subtitle: "查看 ERP 登录接口、本地 SQLite 快照和关键业务页面的可用状态。",
      summary: [
        ["ERP在线", erpOnlineText],
        ["保护模式", body.summary.erp_protection_mode],
        ["同步暂停", body.summary.sync_paused],
        ["ERP耗时ms", body.summary.erp_latency_ms],
        ["请求间隔ms", body.summary.erp_request_min_interval_ms],
        ["ERP排队", body.summary.erp_queue_queued],
        ["ERP运行中", body.summary.erp_queue_running],
        ["请求失败", body.summary.erp_request_failed],
        ["日志失败", body.summary.erp_request_log_failures],
        ["熔断状态", body.sections.erp_queue[0]?.circuit_state || "closed"],
        ["本地快照", body.summary.has_snapshot ? "有" : "无"],
        ["同步源", body.summary.sync_sources],
        ["同步失败", body.summary.sync_failures],
        ["冷却中", body.summary.sync_in_cooldown],
        ["业务入口", body.summary.module_count]
      ],
      panels: [
        modulePanel("手机常用操作", systemMobileActionRows(body), ["tool_name", "tool_path", "tool_desc"], { fullWidth: true, mobileCards: true, mobileTitleColumn: "tool_name", mobileSubtitleColumns: ["tool_desc"], className: "system-mobile-essential" }),
        modulePanel("ERP 登录状态", body.sections.erp_status, ["ok", "message", "latency_ms", "session_tail"], { mobileHidden: true }),
        modulePanel("同步暂停状态", body.sections.sync_pause, ["paused", "message", "flag_path"]),
        modulePanel("ERP 请求队列", body.sections.erp_queue, ["queued", "running", "completed", "failed", "consecutive_failures", "circuit_state", "circuit_failure_threshold", "circuit_cooldown_ms", "circuit_open_until", "min_interval_ms", "last_started_at", "last_finished_at", "last_error"], { mobileHidden: true }),
        modulePanel("最近 ERP 请求日志", body.sections.erp_request_logs, ["requested_at", "method", "path", "status", "duration_ms", "error_message"], { mobileHidden: true }),
        modulePanel("最近驾驶舱快照", body.sections.snapshot, ["created_at", "today_orders", "month_orders", "overdue_orders", "shortage_orders", "low_stock"], { mobileHidden: true }),
        modulePanel("统一风险模型", body.sections.standard_risk_summary, ["generated_at", "total_risks", "open_risks", "red_risks", "yellow_risks", "source_table"], { fullWidth: true, mobileCards: true, mobileTitleColumn: "source_table", mobileSubtitleColumns: ["generated_at", "open_risks"] }),
        modulePanel("数据可信度总览", body.sections.data_trust_summary, ["trust_status", "trust_score", "trusted_sources", "attention_sources", "latest_synced_at", "decision_guardrail", "suggested_action"], { fullWidth: true, mobileCards: true, mobileTitleColumn: "trust_status", mobileSubtitleColumns: ["decision_guardrail", "suggested_action"] }),
        modulePanel("当前判断依据", body.sections.data_freshness, ["source_name", "row_count", "latest_synced_at", "freshness_status", "impact", "action"], { fullWidth: true, mobileCards: true, mobileTitleColumn: "source_name", mobileSubtitleColumns: ["freshness_status", "action"] }),
        modulePanel("同步策略", body.sections.sync_policy, ["label", "recommended_interval", "risk_level", "last_status", "last_rows", "last_finished_at", "next_allowed_at", "health_status", "action"], { mobileHidden: true }),
        modulePanel("最近同步状态", body.sections.sync_runs, ["source_key", "started_at", "finished_at", "status", "rows_synced", "error_message"], { mobileCards: true, mobileTitleColumn: "source_key", mobileSubtitleColumns: ["status", "finished_at"] }),
        modulePanel("系统工具", systemToolRows(), ["tool_name", "tool_path", "tool_desc"], { mobileCards: true, mobileTitleColumn: "tool_name", mobileSubtitleColumns: ["tool_desc"] }),
        modulePanel("用户信息维护", body.sections.user_roles, ["name", "role", "is_followup", "note", "password_reset_at", "updated_at"], { mobileHidden: true }),
        modulePanel("业务入口状态", body.sections.modules, ["name", "path", "status"])
      ],
      notes: body.notes,
      actions: [
        ...(body.summary.sync_paused === "已暂停" ? [["恢复同步", "/sync-pause?state=off"]] : [["暂停同步", "/sync-pause?state=on"]]),
        ["谨慎同步订单20条", "/sync?sources=sales_orders&pagesize=20"],
        ["同步ERP组织用户", "/sync?sources=org_users&pagesize=200&force_sync=1"],
        ["检测ERP登录", "/system?check_erp=1"],
        ["用户信息维护", "/user-roles"],
        ["ERP请求日志", "/erp-logs"],
        ["刷新状态", "/system"],
        ["PMC驾驶舱", "/pmc"]
      ],
      pageClass: "system-page"
    });
  }

  function systemMobileActionRows(body) {
    const paused = body.summary.sync_paused === "已暂停";
    return [
      {
        tool_name: paused ? "恢复同步" : "暂停同步",
        tool_path: paused ? "/sync-pause?state=off" : "/sync-pause?state=on",
        tool_desc: paused ? "恢复后台同步任务。" : "发现 ERP 卡顿时，先暂停后台同步。"
      },
      {
        tool_name: "刷新状态",
        tool_path: "/system",
        tool_desc: "重新查看 ERP 在线、同步暂停和最近同步状态。"
      },
      {
        tool_name: "SQLite 数据覆盖率",
        tool_path: "/sqlite-coverage",
        tool_desc: "查看各页面本地数据是否齐全。"
      },
      {
        tool_name: "历史同步任务",
        tool_path: "/history-sync",
        tool_desc: "安全分批补齐 90 天数据。"
      },
      {
        tool_name: "用户信息维护",
        tool_path: "/user-roles",
        tool_desc: "维护角色、跟单识别和临时密码。"
      },
      {
        tool_name: "同步ERP组织用户",
        tool_path: "/sync?sources=org_users&pagesize=200&force_sync=1",
        tool_desc: "从ERP组织架构刷新姓名下拉列表。"
      },
      {
        tool_name: "PMC驾驶舱",
        tool_path: "/pmc",
        tool_desc: "回到老板/管理者重点风险页面。"
      }
    ];
  }

  function systemToolRows() {
    return [
      {
        tool_name: "用户信息维护",
        tool_path: "/user-roles",
        tool_desc: "维护本地人员资料、跟单识别规则，并为用户生成一次性临时密码。"
      },
      {
        tool_name: "同步ERP组织用户",
        tool_path: "/sync?sources=org_users&pagesize=200&force_sync=1",
        tool_desc: "从ERP组织架构账号列表刷新本地姓名和部门。"
      },
      {
        tool_name: "SQLite 数据覆盖率",
        tool_path: "/sqlite-coverage",
        tool_desc: "查看各页面依赖的本地表、同步行数、最近同步时间和缺失数据源。"
      },
      {
        tool_name: "历史同步任务",
        tool_path: "/history-sync",
        tool_desc: "按90天范围安全分批补齐本地 SQLite 数据，执行前可预演。"
      },
      {
        tool_name: "ERP 请求日志",
        tool_path: "/erp-logs",
        tool_desc: "查看本地记录的 ERP 请求成败、耗时、错误信息，并支持导出。"
      },
      {
        tool_name: "干预记录台账",
        tool_path: "/interventions",
        tool_desc: "查看 PMC 风险处理留痕、处理人、处理备注，并支持导出。"
      }
    ];
  }

  return { systemStatusPage };
}
