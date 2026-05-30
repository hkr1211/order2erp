export function createFollowupPageRenderers({
  briefCopyPage,
  emptyPmcConsoleBody,
  escapeHtml,
  filterPmcOpenRisks,
  formatDateTime,
  latestPmcSnapshot,
  modulePage,
  modulePanel,
  parseBoolean,
  pmcClosureSummary,
  pmcMorningBriefText
}) {
  function roleWorkbenchesPage(snapshot = latestPmcSnapshot()) {
    const summary = snapshot?.summary || {};
    const roleRows = [
      {
        role: "老板",
        focus: `看交付风险和经营结果：本月订单 ${summary.month_orders ?? "--"}，缺料订单 ${summary.shortage_orders ?? "--"}，低库存 ${summary.low_stock ?? "--"}。`,
        primary_action: "先看 PMC 驾驶舱，再看报表和应收应付。",
        entry_1: "/pmc",
        entry_2: "/reports",
        entry_3: "/finance",
        entry_4: ""
      },
      {
        role: "PMC",
        focus: `处理生产交付阻塞：7天内交期 ${summary.due_soon_orders ?? "--"}，缺料订单 ${summary.shortage_orders ?? "--"}。`,
        primary_action: "先处理 PMC 红黄牌，再看订单、物料和生产压力。",
        entry_1: "/pmc?rebuild=1&open_only=1",
        entry_2: "/orders",
        entry_3: "/materials",
        entry_4: "/production"
      },
      {
        role: "销售",
        focus: `跟进客户交期和收款风险：7天内交期 ${summary.due_soon_orders ?? "--"}，逾期应收 ${summary.overdue_receivables ?? "--"}。`,
        primary_action: "先看订单阻塞，再同步客户交期和收款风险。",
        entry_1: "/orders",
        entry_2: "/pmc",
        entry_3: "/finance",
        entry_4: ""
      },
      {
        role: "跟单员",
        focus: `处理本人订单风险：红黄牌 ${summary.priority_risks ?? "--"}，缺料订单 ${summary.shortage_orders ?? "--"}，延期工序 ${summary.delayed_procedures ?? "--"}。`,
        primary_action: "先进入跟单工作台，按负责人过滤我的订单、缺料和延期工序。",
        entry_1: "/followup",
        entry_2: "/pmc?rebuild=1",
        entry_3: "/orders",
        entry_4: "/materials"
      }
    ];
    const workflowRows = [
      { workflow: "每日晨会", owner: "PMC", step_1: "打开 /pmc 看总览", step_2: "处理红黄牌待响应风险", step_3: "必要时进入生产中心看插单影响" },
      { workflow: "客户交期沟通", owner: "销售", step_1: "打开 /orders 查看阻塞点", step_2: "确认 /materials 缺料或生产中心派工", step_3: "同步客户交期和下一步动作" },
      { workflow: "采购跟催", owner: "PMC/采购", step_1: "打开 /materials 看跟催清单", step_2: "结合缺料任务排序", step_3: "反馈预计到货和替代方案" },
      { workflow: "老板日报", owner: "老板/PMC", step_1: "打开 /reports 看指标", step_2: "导出 /reports/export.xls", step_3: "必要时打印 /reports/print" }
    ];
    return modulePage({
      title: "角色工作台",
      subtitle: "按老板、PMC、销售、跟单员组织常用入口和日常处理流程。",
      summary: [
        ["今日订单", summary.today_orders ?? "--"],
        ["本月订单", summary.month_orders ?? "--"],
        ["缺料订单", summary.shortage_orders ?? "--"],
        ["延期工序", summary.delayed_procedures ?? "--"],
        ["低库存", summary.low_stock ?? "--"]
      ],
      panels: [
        modulePanel("角色入口", roleRows, ["role", "focus", "primary_action", "entry_1", "entry_2", "entry_3", "entry_4"]),
        modulePanel("日常流程", workflowRows, ["workflow", "owner", "step_1", "step_2", "step_3"])
      ],
      notes: [
        snapshot ? `当前角色工作台读取本地快照：${formatDateTime(snapshot.created_at)}。` : "当前没有本地快照，打开 PMC 驾驶舱后会自动生成。",
        "这是内网免登录版，入口按角色分组但不做权限拦截。"
      ],
      actions: [["首页", "/"]]
    });
  }

  function followupWorkbenchPage(body) {
    const dashboard = body.dashboard || emptyPmcConsoleBody({ today: new Date(), monthStart: new Date(), monthEnd: new Date(), dashboardParams: {}, message: "当前没有本地 SQLite 订单数据，请先同步订单。" });
    const owner = body.owner || "";
    const openOnly = Boolean(body.open_only);
    const displayDashboard = openOnly ? filterPmcOpenRisks(dashboard) : dashboard;
    const briefHref = owner ? `/followup/brief?owner=${encodeURIComponent(owner)}&open_only=1` : "/followup/brief?open_only=1";
    const openOnlyHref = owner ? `/followup?owner=${encodeURIComponent(owner)}&open_only=1` : "/followup?open_only=1";
    const allHref = owner ? `/followup?owner=${encodeURIComponent(owner)}` : "/followup";
    const closure = pmcClosureSummary(dashboard.sections || {});
    const ownerLinks = (body.owners || []).slice(0, 20).map((row) => [
      `${row.owner}(${row.todos})`,
      `/followup?owner=${encodeURIComponent(row.owner)}`
    ]);
    return modulePage({
      title: "跟单员工作台",
      subtitle: owner ? `当前负责人：${owner}。按“先红牌、再黄牌、再正常”的顺序处理。${openOnly ? " 当前只看待响应风险。" : ""}` : "按负责人查看我的订单、缺料和延期工序。",
      summary: [
        ["负责人", owner || "--", owner ? `/pmc?rebuild=1&owner=${encodeURIComponent(owner)}` : "/pmc?rebuild=1"],
        ["今日待办", dashboard.command_center?.today_todos ?? 0, openOnlyHref],
        ["待响应风险", closure.open_total, openOnlyHref],
        ["超时未闭环", closure.overdue_closures, openOnlyHref],
        ["已关闭风险", closure.responded_total, owner ? `/reports?owner=${encodeURIComponent(owner)}` : "/reports"],
        ["红牌", dashboard.command_center?.red_count ?? 0, openOnlyHref],
        ["黄牌", dashboard.command_center?.yellow_count ?? 0, openOnlyHref],
        ["缺料订单", dashboard.summary?.shortage_orders ?? 0, "/materials"],
        ["延期工序", dashboard.summary?.delayed_procedures ?? 0, "/production"],
        ["逾期应收", dashboard.summary?.overdue_receivables ?? 0, "/finance"]
      ],
      panels: [
        modulePanel("负责人切换", body.owners || [], ["owner", "active_orders", "shortage_orders", "open_procedures", "todos", "owner_link"], { mobileCards: true, mobileTitleColumn: "owner", mobileSubtitleColumns: ["todos", "active_orders"] }),
        modulePanel("我的待干预动作", displayDashboard.sections?.intervention_tasks || [], ["task_no", "risk_level", "risk_type", "related_no", "problem", "responsible_owner", "feedback_deadline", "intervention_state", "response_sla", "escalation_state", "latest_intervention", "intervention_log", "primary_action", "expected_output", "escalation_rule", "buttons"], { fullWidth: true, mobileCards: true, mobileTitleColumn: "related_no", mobileSubtitleColumns: ["risk_level", "risk_type", "intervention_state"] }),
        modulePanel("我的红牌", displayDashboard.sections?.red_risks || [], ["risk_type", "related_no", "problem", "rule_reason", "intervention_state", "response_sla", "escalation_state", "latest_intervention", "intervention_log", "owner_role", "buttons"], { fullWidth: true, mobileCards: true, mobileTitleColumn: "related_no", mobileSubtitleColumns: ["risk_type", "intervention_state"] }),
        modulePanel("我的黄牌", displayDashboard.sections?.yellow_risks || [], ["risk_type", "related_no", "problem", "rule_reason", "intervention_state", "response_sla", "escalation_state", "latest_intervention", "intervention_log", "owner_role", "buttons"], { fullWidth: true, mobileCards: true, mobileTitleColumn: "related_no", mobileSubtitleColumns: ["risk_type", "intervention_state"] }),
        modulePanel("我的交期订单", [...(dashboard.sections?.overdue_orders || []), ...(dashboard.sections?.due_soon_orders || [])], ["order_no", "customer", "product_name", "remaining_qty", "delivery_date", "owner"], { mobileCards: true, mobileTitleColumn: "order_no", mobileSubtitleColumns: ["customer", "delivery_date"] }),
        modulePanel("我的缺料订单", dashboard.sections?.shortage_orders || [], ["order_no", "customer", "product_name", "demand_qty", "available_qty", "shortage_qty"], { mobileCards: true, mobileTitleColumn: "order_no", mobileSubtitleColumns: ["customer", "shortage_qty"] }),
        modulePanel("我的延期工序", dashboard.sections?.delayed_procedures || [], ["work_assignment_id", "order_no", "product_name", "procedure_name", "work_center_name", "remaining_qty", "planned_finish_date", "owner"], { mobileCards: true, mobileTitleColumn: "work_assignment_id", mobileSubtitleColumns: ["order_no", "procedure_name", "planned_finish_date"] })
      ],
      notes: body.notes,
      actions: [
        ...ownerLinks,
        openOnly ? ["显示全部", allHref] : ["只看待响应", openOnlyHref],
        ["我的摘要", briefHref],
        ["PMC作战台", owner ? `/pmc?rebuild=1&owner=${encodeURIComponent(owner)}` : "/pmc?rebuild=1"],
        ["角色工作台", "/roles"]
      ]
    });
  }

  function followupBriefText(body = {}, params = {}) {
    const dashboard = body.dashboard || emptyPmcConsoleBody({ today: new Date(), monthStart: new Date(), monthEnd: new Date(), dashboardParams: {}, message: "当前没有本地 SQLite 订单数据，请先同步订单。" });
    return pmcMorningBriefText(dashboard, { ...params, open_only: params.open_only ?? "1" });
  }

  function followupBriefPage(body = {}, params = {}) {
    const owner = body.owner || params.owner || "";
    const text = followupBriefText(body, params);
    const query = new URLSearchParams();
    if (owner) query.set("owner", owner);
    if (parseBoolean(params.open_only) || params.open_only === undefined) query.set("open_only", "1");
    const queryText = query.toString();
    const textHref = `/followup/brief.txt${queryText ? `?${queryText}` : ""}`;
    const backHref = `/followup${owner ? `?owner=${encodeURIComponent(owner)}` : ""}`;
    return briefCopyPage({
      title: owner ? `${owner} 跟单摘要` : "跟单员摘要",
      subtitle: "只读取本地 SQLite，按当前负责人过滤，用于跟单早会、客户沟通和内部催办。",
      text,
      textHref,
      backHref,
      backLabel: "返回跟单"
    });
  }

  return {
    followupBriefPage,
    followupBriefText,
    followupWorkbenchPage,
    roleWorkbenchesPage
  };
}
