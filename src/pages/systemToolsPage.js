export function createSystemToolsPageRenderers({ escapeHtml, latestSyncRuns, modulePage, modulePanel }) {
  function erpRequestLogPage(body) {
    return modulePage({
      title: "ERP 请求日志",
      subtitle: "查看本地记录的 ERP API 请求结果，用于排查 503、非 JSON 和熔断问题。",
      summary: [
        ["日志条数", body.summary.request_logs],
        ["失败", body.summary.failed_logs],
        ["成功", body.summary.success_logs],
        ["平均耗时ms", body.summary.average_duration_ms],
        ["接口数", body.summary.paths]
      ],
      panels: [
        modulePanel("失败请求", body.sections.failed_logs, ["requested_at", "method", "path", "status", "duration_ms", "error_message"]),
        modulePanel("按接口汇总", body.sections.by_path, ["path", "requests", "failed", "average_duration_ms", "last_status", "last_requested_at"]),
        modulePanel("最近请求", body.rows, ["requested_at", "method", "path", "status", "duration_ms", "error_message"])
      ],
      notes: body.notes,
      actions: [
        ["只看失败", "/erp-logs?status=failed&limit=100"],
        ["导出CSV", "/erp-logs/export.csv?limit=500"],
        ["系统状态", "/system"]
      ]
    });
  }

  function erpRequestLogCsv(body) {
    const rows = [
      ["requested_at", "method", "path", "status", "duration_ms", "error_message"],
      ...body.rows.map((row) => [row.requested_at, row.method, row.path, row.status, row.duration_ms, row.error_message])
    ];
    return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  }

  function sqliteCoveragePage(body) {
    return modulePage({
      title: "SQLite 数据覆盖率",
      subtitle: "查看每个页面依赖哪些本地表、当前同步行数、最近同步时间、增量能力和缺失数据源。",
      summary: [
        ["页面数", body.summary.pages],
        ["本地表", body.summary.tables],
        ["可用页面", body.summary.available_pages],
        ["缺数据页面", body.summary.missing_pages],
        ["空表", body.summary.empty_tables],
        ["90天达标表", body.summary.history_ready_tables]
      ],
      panels: [
        modulePanel("页面覆盖率", body.pages, ["page_name", "page_path", "coverage_status", "sqlite_tables", "table_rows", "latest_sync_at", "history_status", "incremental_support", "suggested_range", "missing_sources"]),
        modulePanel("SQLite 表状态", body.tables, ["label", "table_name", "row_count", "date_range", "history_status", "latest_at", "sync_source", "last_sync_status", "last_sync_finished_at", "incremental", "suggested_range", "last_sync_error"])
      ],
      notes: body.notes,
      actions: [
        ["系统状态", "/system"],
        ["同步状态", "/sync"],
        ["ERP请求日志", "/erp-logs"]
      ]
    });
  }

  function historySyncPage(body) {
    return modulePage({
      title: "历史同步任务中心",
      subtitle: "按最近90天范围安全分批补齐本地 SQLite 数据；默认只显示计划，不自动访问 ERP。",
      summary: [
        ["同步源", body.summary.sources],
        ["范围天数", body.summary.days],
        ["每页上限", body.summary.page_size],
        ["请求间隔ms", body.summary.request_interval_ms],
        ["熔断保护", body.summary.circuit_breaker]
      ],
      panels: [
        modulePanel("最近进度", body.progress, ["label", "source", "last_status", "last_rows_synced", "last_page_index", "page_size", "start_date", "end_date", "finished_at", "next_page_index", "next_action", "next_run", "error_message"]),
        modulePanel("可执行同步源", body.rows, ["label", "source", "date_support", "start_date", "end_date", "page_size", "suggested_range", "latest_progress", "safety", "dry_run", "safe_window", "run"])
      ],
      notes: body.notes,
      actions: [
        ["SQLite覆盖率", "/sqlite-coverage"],
        ["ERP健康状态", "/api/erp_health"],
        ["ERP请求日志", "/erp-logs"]
      ]
    });
  }

  function historySyncWindowPage(result) {
    const runQuery = `source=${encodeURIComponent(result.source)}&start_date=${encodeURIComponent(result.start_date)}&end_date=${encodeURIComponent(result.end_date)}&pageindex=${result.startPageIndex}&pagesize=${result.pageSize}&max_pages=${result.maxPages}&delay_ms=${result.delayMs}`;
    return modulePage({
      title: "历史同步安全窗口",
      subtitle: `${result.label} 从第 ${result.startPageIndex} 页开始，按受控节奏补齐。页面本身不访问 ERP。`,
      summary: [
        ["同步源", result.label],
        ["起始页", result.startPageIndex],
        ["计划页数", result.maxPages],
        ["每页条数", result.pageSize],
        ["页间等待ms", result.delayMs]
      ],
      panels: [
        modulePanel("窗口内页面", result.pages, ["label", "source", "page_index", "page_size", "start_date", "end_date", "dry_run", "run"])
      ],
      notes: [
        ...result.safety,
        "建议先点每一页的预演，确认参数无误后再逐页执行。",
        "如果 ERP 当天已经出现卡顿，先不要执行窗口内的同步。"
      ],
      actions: [
        ["执行这个安全窗口", `/history-sync/window/run?${runQuery}`],
        ["返回历史同步", "/history-sync"],
        ["ERP健康状态", "/api/erp_health"],
        ["ERP请求日志", "/erp-logs"]
      ]
    });
  }

  function historySyncDryRunPage(result) {
    const queryString = `source=${encodeURIComponent(result.source)}&start_date=${encodeURIComponent(result.start_date)}&end_date=${encodeURIComponent(result.end_date)}&pageindex=${result.page_index}&pagesize=${result.page_size}`;
    return modulePage({
      title: "历史同步预演",
      subtitle: `${result.label} 第 ${result.page_index} 页预演，不访问 ERP，不写 SQLite。`,
      summary: [
        ["同步源", result.label],
        ["页码", result.page_index],
        ["页大小", result.page_size],
        ["日期范围", `${result.start_date} 至 ${result.end_date}`],
        ["是否访问ERP", result.will_access_erp]
      ],
      panels: [
        modulePanel("预演参数", [result], ["source", "label", "view_name", "page_index", "page_size", "start_date", "end_date", "erp_params_json", "will_access_erp", "safety"])
      ],
      notes: result.notes,
      actions: [
        ["确认执行这一页", `/history-sync/run?${queryString}`],
        ["返回历史同步", "/history-sync"],
        ["ERP健康状态", "/api/erp_health"]
      ]
    });
  }

  function historySyncWindowResultPage(result) {
    return modulePage({
      title: "安全窗口执行结果",
      subtitle: `${result.label} 已按受控窗口执行 ${result.pages_executed} 页。`,
      summary: [
        ["同步源", result.label],
        ["状态", result.status],
        ["执行页数", result.pages_executed],
        ["同步行数", result.rows_synced],
        ["停止原因", result.stop_reason]
      ],
      panels: [
        modulePanel("窗口执行明细", result.results, ["source", "status", "rows_synced", "new_rows", "page_index", "page_size", "start_date", "end_date", "has_next", "next_page_index", "duplicate_page", "no_new_rows", "warning", "unique_row_count", "row_key_sample"])
      ],
      notes: [
        "窗口执行仍然是一页一页请求 ERP，中间包含安全等待。",
        "如果 ERP 健康状态变差，后续页面会停止执行。"
      ],
      actions: [
        ["返回历史同步", "/history-sync"],
        ["ERP请求日志", "/erp-logs"],
        ["SQLite覆盖率", "/sqlite-coverage"]
      ]
    });
  }

  function historySyncResultPage(result) {
    const nextHref = result.has_next
      ? `/history-sync/run?source=${encodeURIComponent(result.source)}&start_date=${encodeURIComponent(result.start_date)}&end_date=${encodeURIComponent(result.end_date)}&pageindex=${result.next_page_index}&pagesize=${result.page_size}`
      : "";
    return modulePage({
      title: "历史同步结果",
      subtitle: `${result.label} 第 ${result.page_index} 页已完成。`,
      summary: [
        ["同步源", result.label],
        ["本页行数", result.rows_synced],
        ["页码", result.page_index],
        ["页大小", result.page_size],
        ["还有下一页", result.has_next ? "是" : "否"]
      ],
      panels: [
        modulePanel("本次批次", [result], ["source", "status", "rows_synced", "new_rows", "page_index", "page_size", "start_date", "end_date", "has_next", "next_page_index", "unique_row_count", "row_key_sample"])
      ],
      notes: result.notes,
      actions: [
        ...(nextHref ? [["继续下一页", nextHref]] : []),
        ["返回历史同步", "/history-sync"],
        ["SQLite覆盖率", "/sqlite-coverage"]
      ]
    });
  }

  function historySyncFailurePage(params, message) {
    return modulePage({
      title: "历史同步失败",
      subtitle: "本次批次没有完成，已记录失败进度。",
      summary: [
        ["同步源", params.source || ""],
        ["页码", params.pageindex || params.page_index || 1],
        ["状态", "失败"]
      ],
      panels: [
        modulePanel("失败信息", [{ source: params.source || "", page_index: params.pageindex || params.page_index || 1, error_message: message }], ["source", "page_index", "error_message"])
      ],
      notes: [
        "请先查看 ERP 健康状态和请求日志。",
        "确认 ERP 稳定后，可以回到历史同步中心从同一页重试。"
      ],
      actions: [["返回历史同步", "/history-sync"], ["ERP健康状态", "/api/erp_health"], ["ERP请求日志", "/erp-logs"]]
    });
  }

  function historySyncBlockedPage(reason) {
    return modulePage({
      title: "历史同步已暂停",
      subtitle: "ERP 当前处于保护状态，已阻止本次历史同步。",
      summary: [["状态", "已阻止"]],
      panels: [],
      notes: [reason, "请先查看 ERP 健康状态和请求日志，确认 ERP 稳定后再继续。"],
      actions: [["ERP健康状态", "/api/erp_health"], ["ERP请求日志", "/erp-logs"], ["返回历史同步", "/history-sync"]]
    });
  }

  function syncPausePage(status) {
    return modulePage({
      title: "同步暂停开关",
      subtitle: status.paused ? "同步暂停模式已开启。" : "同步暂停模式未开启。",
      summary: [
        ["状态", status.paused ? "已暂停" : "未暂停"],
        ["保护范围", "手动同步 / 历史同步执行"]
      ],
      panels: [
        modulePanel("暂停状态", [status], ["paused", "message", "flag_path"])
      ],
      notes: [
        status.paused
          ? "当前所有 /sync、/api/sync、历史同步执行入口都会被阻止，不会访问 ERP。"
          : "恢复后，同步入口仍会经过 ERP 健康检查、队列、请求间隔和熔断保护。"
      ],
      actions: [
        ...(status.paused ? [["恢复同步", "/sync-pause?state=off"]] : [["暂停同步", "/sync-pause?state=on"]]),
        ["系统状态", "/system"],
        ["SQLite覆盖率", "/sqlite-coverage"],
        ["历史同步", "/history-sync"]
      ]
    });
  }

  function syncPausedPage(status) {
    return modulePage({
      title: "同步已暂停",
      subtitle: "本次请求已被本地暂停开关阻止，没有访问 ERP。",
      summary: [
        ["状态", "已阻止"],
        ["同步暂停", status.paused ? "已暂停" : "未暂停"]
      ],
      panels: [
        modulePanel("暂停状态", [status], ["paused", "message", "flag_path"])
      ],
      notes: [
        "这是本地保护，不是 ERP 错误。",
        "需要继续同步时，可以先到本页恢复同步。"
      ],
      actions: [["恢复同步", "/sync-pause?state=off"], ["系统状态", "/system"], ["SQLite覆盖率", "/sqlite-coverage"]]
    });
  }

  function syncStatusPage(body) {
    return modulePage({
      title: "数据同步",
      subtitle: "手动同步 ERP 核心数据到本地 SQLite，页面优先读取本地业务表。",
      summary: [
        ["同步源", body.results.length],
        ["成功", body.results.filter((row) => row.status === "success").length],
        ["跳过", body.results.filter((row) => row.status === "skipped").length],
        ["失败", body.results.filter((row) => row.status === "failed").length],
        ["同步行数", body.results.reduce((sum, row) => sum + (Number(row.rows_synced) || 0), 0)]
      ],
      panels: [
        modulePanel("本次同步", body.results, ["source_key", "started_at", "finished_at", "status", "rows_synced", "error_message"]),
        modulePanel("最近同步状态", body.latest || latestSyncRuns(), ["source_key", "started_at", "finished_at", "status", "rows_synced", "error_message"])
      ],
      notes: [
        "ERP保护模式下，服务启动不会自动同步；本页默认只同步销售订单20条。",
        "同一个同步源默认 5 分钟内重复点击会跳过，不访问 ERP；确认 ERP 稳定时可在链接后加 force_sync=1。",
        "同步失败不会清空旧数据，业务页面继续显示最近一次成功数据。"
      ],
      actions: [["再次同步订单20条", "/sync?sources=sales_orders&pagesize=20"], ["强制同步订单20条", "/sync?sources=sales_orders&pagesize=20&force_sync=1"], ["系统状态", "/system"]]
    });
  }

  function pmcGoalPage() {
    const rows = [
      ["PMC驾驶舱首页", "主入口", "KPI、红黄牌、早会建议、交期、缺料、生产、库存和财务风险"],
      ["角色/跟单工作台", "并入PMC体系", "老板、PMC、销售、跟单员常用入口和责任人待办"],
      ["订单管理中心", "已完成V1", "订单作战清单、状态灯、阻塞点、下一步动作、订单详情穿透"],
      ["物料采购中心", "主入口", "缺料、低库存、冻结、长库龄、采购跟催和供应商到货风险"],
      ["生产进度中心", "主入口", "ERP生产进度、派工计划、延期工序、工作中心负荷和排产压力"],
      ["车间电子看板", "主入口", "轧制、冲压、钨钼三大工段当日计划、完成进度和异常预警"],
      ["报表中心", "管理输出", "管理指标汇总、打印版、CSV导出、Excel日报导出"],
      ["应收应付", "已完成V1", "聚合应收/应付、客户欠款排行、逾期应收、7天内应付、付款条件推算"],
      ["数据源状态", "已完成V1入口", "轻量检查 ERP 登录、本地快照、业务入口可用性"],
      ["图形化首页", "已完成V1", "按日常业务、管理输出、系统/API 分组，并显示关键快照指标"],
      ["权限登录", "暂缓", "当前按用户要求为内网免登录版"]
    ];
    return modulePage({
      title: "PMC 全功能路线",
      subtitle: "目标是逐步实现 KIMI 设计文档中的完整 PMC 平台；先用智邦 ERP API 和 SQLite 做内网免登录 V1。",
      summary: [
        ["主入口", 8],
        ["待开发V2", 0],
        ["暂缓项", 1]
      ],
      panels: [
        `<section class="panel"><h2>功能路线 <span class="pill">${rows.length}</span></h2><div class="table-wrap"><table><thead><tr><th>模块</th><th>状态</th><th>说明</th></tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>`
      ],
      notes: [
        "短期优先：让老板、管理者、销售、跟单员和财务能看到真实订单、交期、缺料、库存、生产和资金风险。",
        "中期重点：继续打磨 PMC 红黄牌闭环、跨工段调度和采购供应风险。",
        "长期重点：权限、审批、通知、月报模板、移动端适配。"
      ]
    });
  }

  return {
    erpRequestLogCsv,
    erpRequestLogPage,
    historySyncBlockedPage,
    historySyncDryRunPage,
    historySyncFailurePage,
    historySyncPage,
    historySyncResultPage,
    historySyncWindowPage,
    historySyncWindowResultPage,
    pmcGoalPage,
    sqliteCoveragePage,
    syncPausePage,
    syncPausedPage,
    syncStatusPage
  };
}

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
