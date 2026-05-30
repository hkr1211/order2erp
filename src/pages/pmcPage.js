export function createPmcPageRenderers({
  escapeHtml,
  formatCell,
  labelFor,
  latestPmcInterventions,
  latestPmcInterventionsByRelatedNos,
  parseBoolean,
  parseNumber,
  pmcInterventionSummary,
  renderTopNav,
  sharedNavCss,
  formatDate,
  formatDateTime
}) {
  function pmcConsolePage(body, params = {}) {
    body = enrichPmcInterventionStatus(body);
    const openOnly = parseBoolean(params.open_only);
    const commandMode = parseBoolean(params.command_view);
    const command = body.command_center || {};
    const interventions = pmcInterventionSummary({ today: new Date(), limit: 8 });
    const ownerFilter = body.owner_filter || "";
    const closure = pmcClosureSummary(body.sections);
    const displayBody = openOnly ? filterPmcOpenRisks(body) : body;
    const viewParams = new URLSearchParams();
    viewParams.set("rebuild", "1");
    if (ownerFilter) viewParams.set("owner", ownerFilter);
    if (commandMode) viewParams.set("command_view", "1");
    const allHref = `/pmc?${viewParams.toString()}`;
    viewParams.set("open_only", "1");
    const openOnlyHref = `/pmc?${viewParams.toString()}`;
    const commandParams = new URLSearchParams();
    commandParams.set("rebuild", "1");
    commandParams.set("command_view", "1");
    if (ownerFilter) commandParams.set("owner", ownerFilter);
    if (openOnly) commandParams.set("open_only", "1");
    const commandHref = `/pmc?${commandParams.toString()}`;
    const fullParams = new URLSearchParams();
    fullParams.set("rebuild", "1");
    if (ownerFilter) fullParams.set("owner", ownerFilter);
    if (openOnly) fullParams.set("open_only", "1");
    const fullHref = `/pmc?${fullParams.toString()}`;
    const briefParams = new URLSearchParams();
    briefParams.set("rebuild", "1");
    if (ownerFilter) briefParams.set("owner", ownerFilter);
    if (openOnly) briefParams.set("open_only", "1");
    if (commandMode) briefParams.set("command_view", "1");
    const briefHref = `/pmc/brief?${briefParams.toString()}`;
    const todayText = formatDate(new Date());
    const cards = [
      ["待响应风险", closure.open_total, "红黄牌尚未留痕", closure.open_red > 0 ? "danger" : closure.open_yellow > 0 ? "warning" : "neutral", openOnlyHref],
      ["超时未闭环", closure.overdue_closures, "处理中超过响应时限", closure.overdue_closures > 0 ? "danger" : "neutral", openOnlyHref],
      ["今日已处理", interventions.today_actions ?? 0, "本地干预留痕", "neutral", `/interventions?date_from=${todayText}&date_to=${todayText}`],
      ["红牌待响应", closure.open_red, `红牌总数 ${command.red_count ?? 0}`, closure.open_red > 0 ? "danger" : "neutral", openOnlyHref],
      ["黄牌待响应", closure.open_yellow, `黄牌总数 ${command.yellow_count ?? 0}`, closure.open_yellow > 0 ? "warning" : "neutral", openOnlyHref],
      ["已关闭风险", closure.responded_total, "按关联单号统计", "neutral", "/reports"],
      ["风险占比", `${command.risk_item_ratio ?? command.risk_order_ratio ?? 0}%`, `红黄牌事项 ${command.risk_item_count ?? 0}/${command.monitored_item_count ?? 0}`, (command.risk_item_ratio ?? command.risk_order_ratio ?? 0) > 20 ? "danger" : (command.risk_item_ratio ?? command.risk_order_ratio ?? 0) >= 10 ? "warning" : "neutral", "/reports"],
      ["延期工序", body.summary.delayed_procedures ?? 0, "派工进度追踪表", "danger", "/dispatch"],
      ["前后断点", body.summary.upstream_flow_risks ?? 0, "轧制影响冲压/钨钼", (body.summary.upstream_flow_risks ?? 0) > 0 ? "danger" : "neutral", "/pmc"],
      ["前后覆盖率", `${body.summary.upstream_flow_coverage_rate ?? 100}%`, "3天内要料后道可追溯程度", (body.summary.upstream_flow_gaps ?? 0) > 0 ? "warning" : "neutral", "/procedure-links"],
      ["转序待办", body.summary.upstream_flow_handoffs ?? 0, "轧制到后道交接清单", (body.summary.upstream_flow_handoffs ?? 0) > 0 ? "warning" : "neutral", "/pmc"],
      ["订单工序匹配率", `${body.summary.procedure_order_match_rate ?? 0}%`, "销售订单与派工关联程度", (body.summary.procedure_order_match_rate ?? 0) < 50 ? "warning" : "neutral", "/procedure-links"],
      ["冲压延期", body.summary.stamping_delayed_procedures ?? 0, "冲压相关逾期派工", "danger", "/dispatch"],
      ["缺料订单", body.summary.shortage_orders, "按销售订单产品库存计算", "danger", "/materials"]
    ];
    const crossWorkshopSection = `
      <div class="zone-title">前后工段闭环</div>
      <section class="risk-focus">
        ${pmcTablePanel("前后工段断点", body.sections.upstream_flow_risks, ["risk_level", "related_no", "match_basis", "upstream_work_assignment_id", "downstream_section", "downstream_work_assignment_id", "upstream_remaining_qty", "upstream_finish_date", "downstream_start_date", "flow_gap", "primary_action"], "danger")}
        ${pmcTablePanel("前后转序交接", body.sections.upstream_flow_handoffs, ["handoff_status", "related_no", "match_basis", "upstream_work_assignment_id", "downstream_section", "downstream_work_assignment_id", "upstream_remaining_qty", "upstream_finish_date", "downstream_start_date", "action", "buttons"], "warning")}
        ${pmcTablePanel("前后监控覆盖", body.sections.upstream_flow_coverage, ["rolling_open_plans", "rolling_tracked_plans", "downstream_open_plans", "downstream_need_material_3d", "semi_finished_batches", "flow_risks", "flow_gaps", "flow_coverage_rate"], "warning")}
        ${pmcTablePanel("前后监控缺口", body.sections.upstream_flow_gaps, ["reason", "related_no", "downstream_section", "downstream_work_assignment_id", "product_name", "downstream_start_date", "match_basis", "action"], "warning")}
      </section>`;
    const commandOnlySections = `
      <div class="zone-title">我的干预清单</div>
      <section class="intervention-list">
        ${pmcTablePanel("待干预动作", displayBody.sections.intervention_tasks, ["task_no", "risk_level", "risk_type", "related_no", "problem", "responsible_owner", "feedback_deadline", "intervention_state", "response_sla", "escalation_state", "latest_intervention", "intervention_log", "primary_action", "expected_output", "escalation_rule", "buttons"], "danger")}
      </section>
      ${crossWorkshopSection}`;
    const fullDetailSections = `
      <div class="zone-title">跟单员视图</div>
      <section class="intervention-list">
        ${pmcTablePanel("负责人入口", displayBody.sections.owner_workbenches, ["owner", "active_orders", "shortage_orders", "open_procedures", "todos", "owner_link"], "neutral")}
      </section>
      <div class="zone-title">我的干预清单</div>
      <section class="intervention-list">
        ${pmcTablePanel("待干预动作", displayBody.sections.intervention_tasks, ["task_no", "risk_level", "risk_type", "related_no", "problem", "responsible_owner", "feedback_deadline", "intervention_state", "response_sla", "escalation_state", "latest_intervention", "intervention_log", "primary_action", "expected_output", "escalation_rule", "buttons"], "danger")}
      </section>
      <div class="zone-title">干预复盘</div>
      <section class="risk-board">
        ${pmcTablePanel("最近处理记录", interventions.recent_actions, ["created_at", "risk_type", "related_no", "action_label", "intervention_state", "closure_quality", "closure_gap", "result_type", "promised_date", "next_owner", "note", "actor"], "neutral")}
        ${pmcTablePanel("处理类型汇总", interventions.by_risk_type, ["risk_type", "actions"], "neutral")}
        ${pmcTablePanel("处理结果汇总", interventions.by_result_type, ["result_type", "actions"], "neutral")}
        ${pmcTablePanel("闭环质量汇总", interventions.by_closure_quality, ["closure_quality", "actions"], "neutral")}
        ${pmcTablePanel("改进建议", interventions.improvement_suggestions, ["result_type", "actions", "review_focus", "recommendation"], "neutral")}
      </section>
      <div class="zone-title">订单作战地图</div>
      <section class="risk-board">
        ${pmcTablePanel("订单-工序覆盖率", body.sections.order_procedure_coverage, ["sales_orders", "procedure_plans", "matched_orders", "manual_matched_orders", "exact_matched_orders", "report_subject_matched_orders", "assisted_matched_orders", "sales_orders_without_procedure", "unmatched_procedure_plans", "match_rate"], "warning")}
        ${pmcTablePanel("匹配明细", body.sections.order_procedure_matches, ["order_no", "product_name", "work_assignment_id", "procedure_name", "planned_finish_date", "matched_by"], "neutral")}
        ${pmcTablePanel("未关联派工", body.sections.unmatched_procedure_plans, ["work_assignment_id", "order_no", "product_name", "procedure_name", "work_center_name", "remaining_qty", "reason", "link_action"], "warning")}
      </section>
      <section class="battle-grid">
        ${pmcBattleMapPanel(body.sections.order_battle_map, body.sections.order_battle_stages)}
        ${pmcTablePanel("工序瓶颈汇总", body.sections.order_battle_summary, ["stage", "red_nodes", "yellow_nodes", "active_nodes", "done_nodes"], "warning")}
      </section>
      <div class="zone-title">订单作战重点</div>
      <section class="risk-focus">
        ${pmcTablePanel("重点风险", body.sections.priority_risks, ["exception_type", "priority", "related_no", "item", "quantity", "due_date", "responsible_role", "action"], "danger")}
        ${pmcTablePanel("前后工段断点", body.sections.upstream_flow_risks, ["risk_level", "related_no", "match_basis", "upstream_work_assignment_id", "downstream_section", "downstream_work_assignment_id", "upstream_remaining_qty", "upstream_finish_date", "downstream_start_date", "flow_gap", "primary_action"], "danger")}
        ${pmcTablePanel("前后转序交接", body.sections.upstream_flow_handoffs, ["handoff_status", "related_no", "match_basis", "upstream_work_assignment_id", "downstream_section", "downstream_work_assignment_id", "upstream_remaining_qty", "upstream_finish_date", "downstream_start_date", "action", "buttons"], "warning")}
        ${pmcTablePanel("前后监控覆盖", body.sections.upstream_flow_coverage, ["rolling_open_plans", "rolling_tracked_plans", "downstream_open_plans", "downstream_need_material_3d", "semi_finished_batches", "flow_risks", "flow_gaps", "flow_coverage_rate"], "warning")}
        ${pmcTablePanel("前后监控缺口", body.sections.upstream_flow_gaps, ["reason", "related_no", "downstream_section", "downstream_work_assignment_id", "product_name", "downstream_start_date", "match_basis", "action"], "warning")}
        ${pmcTablePanel("冲压延期", body.sections.stamping_delayed_procedures, ["work_assignment_id", "product_name", "procedure_name", "work_center_name", "remaining_qty", "planned_finish_date", "owner"], "danger")}
      </section>
      <div class="zone-title">原始明细</div>
      <section class="layout">
        <div class="stack">
          ${pmcTablePanel("逾期订单", body.sections.overdue_orders, ["order_no", "customer", "product_name", "remaining_qty", "delivery_date"], "danger")}
          ${pmcTablePanel("7天内交期订单", body.sections.due_soon_orders, ["order_no", "customer", "product_name", "remaining_qty", "delivery_date"], "warning")}
          ${pmcTablePanel("缺料订单", body.sections.shortage_orders, ["order_no", "customer", "product_name", "demand_qty", "available_qty", "shortage_qty"], "danger")}
          ${pmcTablePanel("延期工序", body.sections.delayed_procedures, ["work_assignment_id", "order_no", "product_name", "procedure_name", "work_center_name", "remaining_qty", "planned_finish_date"], "danger")}
        </div>
        <div class="stack">
          ${pmcTablePanel("低库存预警", body.sections.low_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"], "warning")}
          ${pmcTablePanel("逾期应收", body.sections.overdue_receivables, ["counterparty", "bill_no", "business_title", "unpaid_amount", "due_date", "risk_status"], "warning")}
          ${pmcTablePanel("7天内应付", body.sections.due_soon_payables, ["counterparty", "bill_no", "business_title", "unpaid_amount", "due_date", "risk_status"], "warning")}
        </div>
      </section>`;
    return `<!doctype html>
  <html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>蕴杰金属数字 PMC 控制台</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f6f8;
        --panel: #ffffff;
        --text: #172033;
        --muted: #667085;
        --border: #d9dee7;
        --green: #176b58;
        --green-soft: #e8f3ef;
        --amber: #a15c00;
        --amber-soft: #fff3d8;
        --red: #b42318;
        --red-soft: #fee4e2;
      }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
      main { width: min(1440px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 36px; }
      header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 18px; border-bottom: 1px solid var(--border); }
      h1 { margin: 0; font-size: 30px; line-height: 1.2; letter-spacing: 0; }
      .sub { margin-top: 8px; color: var(--muted); font-size: 14px; }
      .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .button { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); text-decoration: none; font-size: 14px; line-height: 1.2; white-space: nowrap; }
      .button.primary { background: var(--green); border-color: var(--green); color: #ffffff; }
      .action-buttons { display: flex; flex-wrap: wrap; gap: 6px; min-width: 180px; align-items: flex-start; }
      .action-buttons .button { min-height: 32px; padding: 6px 10px; font-size: 13px; }
      .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 10px; margin: 18px 0; }
      .kpi { min-height: 112px; padding: 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
      a.kpi { color: inherit; text-decoration: none; transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease; }
      a.kpi:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(23, 32, 51, .08); border-color: #98a2b3; }
      .kpi.warning { background: var(--amber-soft); border-color: #f3c77b; }
      .kpi.danger { background: var(--red-soft); border-color: #f2a7a3; }
      .kpi .label { color: var(--muted); font-size: 13px; }
      .kpi .value { margin-top: 10px; font-size: 30px; line-height: 1; font-weight: 750; overflow-wrap: anywhere; }
      .kpi .hint { margin-top: 12px; color: var(--muted); font-size: 12px; line-height: 1.4; }
      .ai-chat { margin: 18px 0; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); overflow: hidden; }
      .ai-chat-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding: 14px 16px; border-bottom: 1px solid var(--border); }
      .ai-chat h2 { margin: 0; font-size: 17px; letter-spacing: 0; }
      .ai-chat-scope { color: var(--muted); font-size: 12px; line-height: 1.5; }
      .ai-chat-body { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 14px; padding: 14px 16px 16px; }
      .ai-chat-form { display: grid; gap: 8px; }
      .ai-chat textarea { width: 100%; min-height: 72px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 6px; resize: vertical; font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: #fff; }
      .ai-chat textarea:focus { outline: 2px solid rgba(23, 107, 88, .18); border-color: var(--green); }
      .ai-chat-submit { width: fit-content; min-height: 34px; padding: 7px 12px; border: 1px solid var(--green); border-radius: 6px; background: var(--green); color: #fff; cursor: pointer; font-size: 14px; }
      .ai-chat-submit:disabled { opacity: .65; cursor: not-allowed; }
      .ai-chat-messages { min-height: 132px; max-height: 300px; overflow: auto; padding: 10px; border: 1px solid var(--border); border-radius: 6px; background: #f8fafc; white-space: pre-wrap; }
      .ai-chat-message { margin: 0 0 10px; font-size: 13px; line-height: 1.65; }
      .ai-chat-message:last-child { margin-bottom: 0; }
      .ai-chat-message.user { color: #344054; font-weight: 650; }
      .ai-chat-message.assistant { color: var(--text); }
      .ai-chat-message.error { color: var(--red); }
      .ai-chat-suggestions { display: grid; align-content: start; gap: 8px; }
      .ai-chat-suggestions-title { color: var(--muted); font-size: 12px; }
      .ai-chip { width: 100%; min-height: 32px; padding: 7px 10px; border: 1px solid var(--border); border-radius: 6px; background: #fff; color: var(--text); text-align: left; cursor: pointer; font-size: 13px; line-height: 1.35; }
      .ai-chip:hover { border-color: var(--green); color: var(--green); }
      .zone-title { margin: 20px 0 10px; font-size: 18px; font-weight: 750; }
      .layout { display: grid; grid-template-columns: 1.05fr 1fr; gap: 12px; align-items: start; }
      .risk-board { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; align-items: start; }
      .risk-board-command { grid-template-columns: 1fr; }
      .risk-focus { display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; margin-bottom: 12px; align-items: start; }
      .intervention-list { margin-bottom: 12px; }
      .action-guide { display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 12px; margin-bottom: 12px; align-items: stretch; }
      .guide-card { min-width: 0; padding: 15px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
      .guide-card.primary { border-color: #f2a7a3; background: #fff7f6; }
      .guide-card h2, .guide-card h3 { margin: 0; letter-spacing: 0; }
      .guide-card h2 { font-size: 18px; line-height: 1.3; }
      .guide-card h3 { font-size: 15px; }
      .guide-card p { margin: 8px 0 0; color: #344054; font-size: 14px; line-height: 1.6; }
      .guide-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
      .guide-meta span { padding: 4px 7px; border-radius: 6px; background: #f0f3f6; color: #344054; font-size: 12px; line-height: 1.25; }
      .guide-list { margin: 10px 0 0; padding-left: 20px; color: #344054; font-size: 13px; line-height: 1.6; }
      .guide-list li { margin: 0 0 7px; }
      .workshop-guide { grid-column: 1 / -1; }
      .workshop-risk-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
      .workshop-risk-item { min-width: 0; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: #f8fafc; }
      .workshop-risk-item.danger { border-color: #f2a7a3; background: var(--red-soft); }
      .workshop-risk-item.warning { border-color: #f3c77b; background: var(--amber-soft); }
      .workshop-risk-head { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
      .workshop-risk-head strong { font-size: 15px; line-height: 1.25; }
      .workshop-risk-title { margin-top: 8px; font-weight: 700; font-size: 14px; line-height: 1.45; color: var(--text); }
      .workshop-risk-meta, .workshop-risk-action { margin-top: 6px; color: #344054; font-size: 12.5px; line-height: 1.45; }
      .layout > *, .risk-board > *, .risk-focus > *, .battle-grid > *, .kpis > *, .stack > * { min-width: 0; }
      .panel { border: 1px solid var(--border); border-radius: 8px; background: var(--panel); overflow: hidden; }
      .panel.command-panel { border-color: #cfd6e2; }
      .panel h2 { margin: 0; padding: 14px 16px; border-bottom: 1px solid var(--border); font-size: 17px; letter-spacing: 0; }
      .panel h2.danger { color: var(--red); }
      .panel h2.warning { color: var(--amber); }
      .table-scroll { width: 100%; max-width: 100%; overflow: auto; }
      .command-panel .table-scroll { max-height: 430px; }
      .command-panel thead th { position: sticky; top: 0; z-index: 1; }
      .command-panel table { min-width: 1180px; table-layout: fixed; }
      .morning-brief-panel table { min-width: 1760px; table-layout: auto; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 8px 9px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; font-size: 12.5px; line-height: 1.42; }
      td { overflow-wrap: break-word; word-break: normal; }
      th { background: #f0f3f6; color: #344054; font-weight: 650; white-space: nowrap; }
      .col-priority_no, .col-red_count, .col-yellow_count, .col-risk_count, .col-todo_count, .col-row_count, .col-risk_score, .col-active_orders, .col-shortage_orders, .col-open_procedures, .col-todos {
        width: 74px; min-width: 64px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums;
      }
      .col-risk_level, .col-risk_type, .col-owner_role, .col-responsible_owner, .col-feedback_deadline, .col-response_sla, .col-escalation_state, .col-related_no {
        width: 108px; min-width: 88px;
      }
      .col-problem, .col-rule_reason, .col-headline, .col-meeting_topic, .col-meeting_focus, .col-decision_request, .col-conclusion, .col-next_action, .col-primary_action, .col-sample_problem {
        width: 190px; min-width: 140px;
      }
      .morning-brief-panel .col-headline { width: 280px; min-width: 260px; }
      .morning-brief-panel .col-next_action, .morning-brief-panel .col-meeting_focus {
        width: 230px; min-width: 210px; word-break: keep-all; overflow-wrap: normal;
      }
      .morning-brief-panel .col-latest_intervention, .morning-brief-panel .col-latest_actor { width: 120px; min-width: 100px; }
      .col-buttons, .col-intervention_log {
        width: 150px; min-width: 128px;
      }
      tr:last-child td { border-bottom: 0; }
      .empty { padding: 20px 16px; color: var(--muted); font-size: 14px; }
      .stack { display: grid; gap: 12px; }
      .tag { display: inline-block; padding: 3px 7px; border-radius: 999px; background: var(--green-soft); color: var(--green); font-size: 12px; white-space: nowrap; }
      .tag.danger { background: var(--red-soft); color: var(--red); }
      .tag.warning { background: var(--amber-soft); color: var(--amber); }
      .mini-button { display: inline-block; margin: 2px 4px 2px 0; padding: 4px 7px; border: 1px solid var(--border); border-radius: 6px; background: #fff; color: var(--text); text-decoration: none; font-size: 12px; white-space: nowrap; }
      .mini-button:hover { border-color: var(--green); color: var(--green); }
      .pmc-mobile-priority { display: none; }
      .pmc-mobile-head { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; margin-bottom: 10px; }
      .pmc-mobile-head h2 { margin: 0; font-size: 18px; line-height: 1.25; }
      .pmc-mobile-head p { margin: 5px 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
      .pmc-mobile-command { padding: 12px; border: 1px solid #cfd6e2; border-radius: 8px; background: #fff; }
      .pmc-mobile-command strong { display: block; margin-bottom: 5px; font-size: 15px; }
      .pmc-mobile-command span { display: block; color: var(--muted); font-size: 13px; line-height: 1.5; }
      .pmc-mobile-risk-list { display: grid; gap: 8px; margin-top: 10px; }
      .pmc-mobile-risk-card { padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: #fff; }
      .pmc-mobile-risk-card.danger { border-color: #f2a7a3; background: var(--red-soft); }
      .pmc-mobile-risk-card.warning { border-color: #f3c77b; background: var(--amber-soft); }
      .pmc-mobile-risk-top { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; margin-bottom: 6px; }
      .pmc-mobile-risk-title { font-weight: 750; line-height: 1.35; }
      .pmc-mobile-risk-no { color: var(--muted); font-size: 12px; white-space: nowrap; }
      .pmc-mobile-risk-meta { color: var(--muted); font-size: 12px; line-height: 1.45; }
      .pmc-mobile-risk-problem { margin-top: 6px; font-size: 13px; line-height: 1.55; }
      .pmc-mobile-risk-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .pmc-mobile-risk-actions .mini-button { min-height: 34px; padding: 7px 9px; background: #fff; }
      .pmc-desktop-detail { display: block; }
      .battle-wrap { max-width: 100%; overflow-x: auto; }
      .battle-table { min-width: 1120px; }
      .battle-node { display: inline-flex; min-width: 54px; min-height: 28px; align-items: center; justify-content: center; padding: 4px 8px; border-radius: 999px; border: 1px solid var(--border); font-size: 12px; font-weight: 700; white-space: nowrap; }
      .battle-node.none { background: #f8fafc; color: #98a2b3; }
      .battle-node.done { background: var(--green-soft); color: var(--green); border-color: #b7dfc8; }
      .battle-node.active { background: #eef4ff; color: #175cd3; border-color: #b2ccff; }
      .battle-node.yellow { background: var(--amber-soft); color: var(--amber); border-color: #f3c77b; }
      .battle-node.red { background: var(--red-soft); color: var(--red); border-color: #f2a7a3; }
      a.battle-node { text-decoration: none; }
      .battle-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, .65fr); gap: 12px; margin-bottom: 12px; align-items: start; }
      .notes { margin-top: 12px; color: var(--muted); font-size: 13px; line-height: 1.7; }
      @media (max-width: 1180px) {
        .kpis { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
        .risk-board { grid-template-columns: 1fr; }
        .risk-focus { grid-template-columns: 1fr; }
        .action-guide { grid-template-columns: 1fr; }
        .workshop-risk-grid { grid-template-columns: 1fr; }
        .battle-grid { grid-template-columns: 1fr; }
        .ai-chat-body { grid-template-columns: 1fr; }
        .layout { grid-template-columns: 1fr; }
      }
      @media (max-width: 720px) {
        main { width: min(100% - 20px, 1440px); padding: 14px 0 28px; }
        header { display: block; }
        .actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); justify-content: stretch; margin-top: 14px; }
        .actions .button { min-height: 44px; padding: 9px 10px; white-space: normal; }
        h1 { font-size: 24px; }
        .sub { font-size: 13px; line-height: 1.55; }
        .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 12px 0; }
        .kpi { min-height: 86px; padding: 10px; }
        .kpi .value { margin-top: 8px; font-size: 24px; }
        .kpi .hint { margin-top: 8px; font-size: 11.5px; }
        .kpis .kpi:nth-child(n+7) { display: none; }
        .ai-chat { margin: 12px 0; }
        .ai-chat-head { display: block; padding: 12px; }
        .ai-chat-body { padding: 12px; }
        .ai-chat textarea { min-height: 86px; }
        .ai-chat-submit, .ai-chip { min-height: 44px; }
        .pmc-mobile-priority { display: block; margin: 12px 0; }
        .pmc-mobile-head { display: block; }
        .pmc-mobile-head .button { margin-top: 8px; width: 100%; min-height: 44px; }
        .pmc-desktop-detail { display: none; }
        .zone-title { margin: 16px 0 8px; font-size: 16px; }
      }
      ${sharedNavCss()}
    </style>
  </head>
  <body>
    <main>
      ${renderTopNav("/pmc")}
      <header>
        <div>
          <h1>蕴杰金属数字 PMC 控制台</h1>
          <div class="sub">内网免登录版 · 老板 / PMC / 销售共用 · 更新时间 ${escapeHtml(formatDateTime(body.generated_at))}${body.cached ? " · 读取本地快照" : ""}${ownerFilter ? ` · 跟单员视图：${escapeHtml(ownerFilter)}` : ""}${openOnly ? " · 当前只看待响应风险" : ""}${commandMode ? " · 指挥模式" : ""}</div>
        </div>
        <div class="actions">
          ${ownerFilter ? '<a class="button" href="/pmc?rebuild=1">返回全局</a>' : ""}
          ${openOnly ? `<a class="button primary" href="${escapeHtml(allHref)}">显示全部</a>` : `<a class="button primary" href="${escapeHtml(openOnlyHref)}">只看待响应</a>`}
          ${commandMode ? `<a class="button" href="${escapeHtml(fullHref)}">完整模式</a>` : `<a class="button" href="${escapeHtml(commandHref)}">指挥模式</a>`}
          <a class="button" href="${escapeHtml(briefHref)}">早会文本</a>
          <a class="button" href="/procedure-links">人工绑定派工</a>
          <a class="button" href="/interventions">干预台账</a>
          <a class="button" href="/pmc?rebuild=1">从 SQLite 重新生成</a>
        </div>
      </header>
      <section class="kpis">
        ${cards.map(([label, value, hint, tone, href]) => renderKpiCard(label, value, hint, tone, href)).join("\n")}
      </section>
      ${pmcAiChatPanel()}
      ${pmcMobilePriorityPanel(displayBody, body, openOnlyHref)}
      <div class="pmc-desktop-detail">
      <div class="zone-title">今日行动指南</div>
      ${pmcActionGuidePanel(body.sections.command_insights, body.sections.command_meeting_actions, displayBody.sections.morning_brief, displayBody.sections)}
      <div class="zone-title">今日早会风险摘要</div>
      <section class="intervention-list">
        ${pmcTablePanel("老板/管理层重点", displayBody.sections.morning_brief, ["priority_no", "risk_level", "risk_score", "headline", "related_no", "owner_role", "intervention_state", "response_sla", "escalation_state", "latest_intervention", "latest_actor", "next_action", "meeting_focus", "intervention_log", "buttons"], "danger", "command-panel morning-brief-panel")}
      </section>
      <div class="zone-title">红黄牌风险区</div>
      <section class="risk-board risk-board-command">
        ${pmcTablePanel("红牌：今天必须处理", displayBody.sections.red_risks, ["risk_score", "risk_type", "related_no", "problem", "rule_reason", "intervention_state", "response_sla", "escalation_state", "latest_intervention", "intervention_log", "owner_role", "buttons"], "danger", "command-panel")}
        ${pmcTablePanel("黄牌：3天内可能恶化", displayBody.sections.yellow_risks, ["risk_score", "risk_type", "related_no", "problem", "rule_reason", "intervention_state", "response_sla", "escalation_state", "latest_intervention", "intervention_log", "owner_role", "buttons"], "warning", "command-panel")}
        ${pmcTablePanel("风险来源汇总", displayBody.sections.risk_type_summary, ["risk_type", "red_count", "yellow_count", "risk_count", "owner_role", "next_action", "sample_problem"], "warning")}
        ${pmcTablePanel("责任部门待办", displayBody.sections.risk_owner_summary, ["owner_role", "red_count", "yellow_count", "todo_count", "top_risk_type", "next_action", "sample_problem"], "warning")}
      </section>
      ${commandMode ? commandOnlySections : fullDetailSections}
      </div>
      <section class="notes">
        ${body.notes.map((note) => `<div>${escapeHtml(note)}</div>`).join("")}
      </section>
    </main>
    ${pmcAiChatScript()}
  </body>
  </html>`;
  }

  function pmcMobilePriorityPanel(displayBody = {}, body = {}, openOnlyHref = "/pmc?rebuild=1&open_only=1") {
    const sections = displayBody.sections || {};
    const sourceSections = body.sections || {};
    const insight = firstRow(sections.command_insights) || firstRow(sourceSections.command_insights) || firstRow(sections.morning_brief) || {};
    const redRows = Array.isArray(sections.red_risks) ? sections.red_risks : [];
    const yellowRows = Array.isArray(sections.yellow_risks) ? sections.yellow_risks : [];
    const morningRows = Array.isArray(sections.morning_brief) ? sections.morning_brief : [];
    const riskRows = uniqueMobileRisks([...morningRows, ...redRows, ...yellowRows]).slice(0, 6);
    const commandTitle = insight.conclusion || insight.headline || insight.meeting_topic || "先处理红黄牌风险";
    const commandAction = insight.next_action || insight.decision_request || insight.meeting_focus || "早会确认责任人、反馈时限和下一步动作。";
    return `<section class="pmc-mobile-priority" aria-label="手机重点">
        <div class="pmc-mobile-head">
          <div>
            <h2>手机重点</h2>
            <p>给老板、管理层和跟单员先看结论，再看需要今天处理的风险。</p>
          </div>
          <a class="button primary" href="${escapeHtml(openOnlyHref)}">只看待响应</a>
        </div>
        <div class="pmc-mobile-command">
          <strong>${escapeHtml(commandTitle)}</strong>
          <span>${escapeHtml(commandAction)}</span>
        </div>
        <div class="pmc-mobile-risk-list">
          ${
            riskRows.length
              ? riskRows.map(pmcMobileRiskCard).join("")
              : '<div class="pmc-mobile-risk-card"><div class="pmc-mobile-risk-title">当前没有待响应红黄牌</div><div class="pmc-mobile-risk-meta">可继续关注数据可信度和同步状态。</div></div>'
          }
        </div>
      </section>`;
  }

  function firstRow(rows) {
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  function pmcActionGuidePanel(insights = [], meetingActions = [], morningBrief = [], sections = {}) {
    const safeInsights = Array.isArray(insights) ? insights.filter(Boolean) : [];
    const safeActions = Array.isArray(meetingActions) ? meetingActions.filter(Boolean) : [];
    const firstInsight = safeInsights[0] || {};
    const firstRisk = firstRow(morningBrief) || {};
    const workshopHighlights = coreWorkshopRiskHighlights(sections);
    const headline = firstInsight.conclusion || firstInsight.meeting_topic || firstRisk.headline || "今天先处理待响应红黄牌";
    const meetingTopic = firstInsight.meeting_topic && firstInsight.meeting_topic !== headline ? firstInsight.meeting_topic : "";
    const nextAction = firstInsight.next_action || firstInsight.decision_request || firstRisk.next_action || firstRisk.meeting_focus || "早会确认责任人、反馈时限和下一步动作。";
    const owner = firstInsight.responsible_owner || firstInsight.owner_role || firstRisk.owner_role || "待确认";
    const deadline = firstInsight.feedback_deadline || firstRisk.response_sla || "今天下班前";
    const focusRows = safeActions.length
      ? safeActions.slice(0, 5)
      : safeInsights.slice(0, 5).map((row, index) => ({
          action_no: `FOCUS-${String(index + 1).padStart(3, "0")}`,
          meeting_question: row.meeting_topic || row.conclusion || row.related_no || "确认当前风险",
          related_no: row.related_no,
          responsible_owner: row.responsible_owner || row.owner_role,
          expected_output: row.decision_request || row.next_action,
          feedback_deadline: row.feedback_deadline
        }));
    const feedbackRows = focusRows.length ? focusRows : [{
      meeting_question: firstRisk.meeting_focus || "确认红黄牌风险是否已有处理动作",
      related_no: firstRisk.related_no,
      responsible_owner: firstRisk.owner_role,
      expected_output: firstRisk.next_action || "明确处理方案、负责人和可承诺完成时间",
      feedback_deadline: firstRisk.response_sla || "今天下班前"
    }];
    return `<section class="action-guide">
      <article class="guide-card primary">
        <h2>今天先做什么</h2>
        <p>${escapeHtml(headline)}</p>
        ${meetingTopic ? `<p>早会重点：${escapeHtml(meetingTopic)}</p>` : ""}
        <p>${escapeHtml(nextAction)}</p>
        <div class="guide-meta">
          <span>负责人：${escapeHtml(owner)}</span>
          <span>反馈：${escapeHtml(deadline)}</span>
          ${firstInsight.related_no || firstRisk.related_no ? `<span>关联：${escapeHtml(firstInsight.related_no || firstRisk.related_no)}</span>` : ""}
        </div>
      </article>
      <article class="guide-card">
        <h3>今天早会优先讨论</h3>
        ${guideList(focusRows, (row) => `${row.meeting_question || row.conclusion || row.related_no || "确认风险"}${row.related_no ? `（${row.related_no}）` : ""}`)}
      </article>
      ${pmcWorkshopRiskGuide(workshopHighlights)}
      <article class="guide-card">
        <h3>会后反馈要求</h3>
        ${guideList(feedbackRows, (row) => {
          const ownerText = row.responsible_owner || row.owner_role || "待确认";
          const output = row.expected_output || row.decision_request || row.next_action || "明确处理方案";
          const rowDeadline = row.feedback_deadline || row.response_sla || "今天下班前";
          return `${ownerText}：${output}，${rowDeadline}`;
        })}
      </article>
    </section>`;
  }

  function pmcWorkshopRiskGuide(items = []) {
    return `<article class="guide-card workshop-guide">
      <h3>三大工段红黄牌</h3>
      <div class="workshop-risk-grid">
        ${items.map(({ title, row }) => row ? pmcWorkshopRiskItem(title, row) : `<div class="workshop-risk-item"><div class="workshop-risk-head"><strong>${escapeHtml(title)}</strong><span class="tag">暂无</span></div><div class="workshop-risk-meta">暂无红黄牌事件。</div></div>`).join("")}
      </div>
    </article>`;
  }

  function pmcWorkshopRiskItem(title, row = {}) {
    const riskLevel = row.risk_level || (/红/.test(row.priority || row.risk_type || "") ? "红牌" : "黄牌");
    const tone = /红/.test(riskLevel) ? "danger" : /黄/.test(riskLevel) ? "warning" : "";
    const riskTitle = row.problem || row.headline || row.risk_type || "待处理风险";
    const relatedNo = row.related_no || row.order_no || row.work_assignment_id || "";
    const owner = row.owner_role || row.responsible_owner || row.owner || "待确认";
    const action = row.next_action || row.primary_action || row.meeting_focus || row.rule_reason || "确认责任人、反馈时限和下一步动作";
    const score = parseNumber(row.risk_score);
    const meta = [relatedNo, score === null ? "" : `风险${score}`, owner].filter(Boolean).join(" · ");
    return `<div class="workshop-risk-item ${escapeHtml(tone)}">
      <div class="workshop-risk-head"><strong>${escapeHtml(title)}</strong><span class="tag ${escapeHtml(tone)}">${escapeHtml(riskLevel)}</span></div>
      <div class="workshop-risk-title">${escapeHtml(riskTitle)}</div>
      <div class="workshop-risk-meta">${escapeHtml(meta || "待确认关联信息")}</div>
      <div class="workshop-risk-action">${escapeHtml(action)}</div>
    </div>`;
  }

  function coreWorkshopRiskHighlights(sections = {}) {
    const riskRows = [
      ...(Array.isArray(sections.red_risks) ? sections.red_risks : []),
      ...(Array.isArray(sections.yellow_risks) ? sections.yellow_risks : [])
    ].filter((row) => row && !isInterventionFinal(row.intervention_state));
    return [
      { key: "stamping", title: "冲压" },
      { key: "tungsten_molybdenum", title: "钨钼" },
      { key: "rolling", title: "轧制" }
    ].map((workshop) => ({
      ...workshop,
      row: riskRows
        .filter((row) => classifyPmcWorkshopRisk(row) === workshop.key)
        .sort((a, b) => pmcRiskUrgencyScore(b) - pmcRiskUrgencyScore(a))[0] || null
    }));
  }

  function classifyPmcWorkshopRisk(row = {}) {
    const text = [
      row.owner_role,
      row.responsible_owner,
      row.risk_type,
      row.problem,
      row.headline,
      row.rule_reason,
      row.next_action,
      row.primary_action,
      row.procedure_name,
      row.work_center_name,
      row.downstream_section,
      row.upstream_section,
      row.product_name,
      row.item
    ].filter(Boolean).join(" ");
    if (/冲压|冲床|落料|冲圆|引伸|拉伸|拉深|切边|整形|冲铆|压形|压型|成型|一引|二引|三引|四引|五引|六引/.test(text)) {
      return "stamping";
    }
    if (/轧制|轧|压延|辊|冷轧|热轧|带材|箔材/.test(text)) {
      return "rolling";
    }
    if (/钨钼|机加|机加工|车床|铣|磨|钻|线切割|加工中心/.test(text)) {
      return "tungsten_molybdenum";
    }
    return "";
  }

  function pmcRiskUrgencyScore(row = {}) {
    const text = [row.risk_level, row.priority, row.risk_type, row.rule_reason, row.problem, row.headline, row.response_sla].filter(Boolean).join(" ");
    const levelScore = /红/.test(text) ? 200000 : /黄/.test(text) ? 100000 : 0;
    const riskScore = (parseNumber(row.risk_score) || 0) * 100;
    const todayScore = /今天|必须|逾期|超期|延期|4小时/.test(text) ? 50 : 0;
    return levelScore + riskScore + todayScore;
  }

  function guideList(rows = [], formatter = (row) => String(row || "")) {
    const safeRows = Array.isArray(rows) ? rows.slice(0, 5) : [];
    if (!safeRows.length) {
      return '<div class="empty">当前没有需要生成的行动项。</div>';
    }
    return `<ol class="guide-list">${safeRows.map((row) => `<li>${escapeHtml(formatter(row))}</li>`).join("")}</ol>`;
  }

  function uniqueMobileRisks(rows = []) {
    const seen = new Set();
    const result = [];
    for (const row of rows) {
      const key = [row?.related_no, row?.risk_type, row?.headline || row?.problem].filter(Boolean).join("|");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(row);
    }
    return result;
  }

  function pmcMobileRiskCard(row = {}) {
    const tone = mobileRiskTone(row);
    const title = row.headline || row.problem || row.risk_type || row.exception_type || "待处理风险";
    const relatedNo = row.related_no || row.order_no || "";
    const owner = row.owner_role || row.responsible_owner || row.owner || "待确认";
    const action = row.next_action || row.primary_action || row.action || row.meeting_focus || "确认责任人和反馈时间";
    const state = row.intervention_state || "待响应";
    const buttons = Array.isArray(row.buttons) && row.buttons.length ? row.buttons.slice(0, 2) : ["标记处理中"];
    return `<article class="pmc-mobile-risk-card ${escapeHtml(tone)}">
        <div class="pmc-mobile-risk-top">
          <div class="pmc-mobile-risk-title">${escapeHtml(title)}</div>
          <div class="pmc-mobile-risk-no">${escapeHtml(relatedNo)}</div>
        </div>
        <div class="pmc-mobile-risk-meta">${escapeHtml(row.risk_level || toneLabel(tone))} · ${escapeHtml(row.risk_type || row.exception_type || "风险")} · ${escapeHtml(owner)} · ${escapeHtml(state)}</div>
        <div class="pmc-mobile-risk-problem">${escapeHtml(action)}</div>
        <div class="pmc-mobile-risk-actions">${buttons.map((label) => `<a class="mini-button" href="${escapeHtml(pmcInterventionHref(row, label))}">${escapeHtml(label)}</a>`).join("")}${relatedNo ? `<a class="mini-button" href="${escapeHtml(interventionLogHref(relatedNo))}">处理记录</a>` : ""}</div>
      </article>`;
  }

  function mobileRiskTone(row = {}) {
    const text = `${row.risk_level || ""} ${row.priority || ""} ${row.risk_type || ""}`;
    if (/红|高|逾期|断供|超期/.test(text)) return "danger";
    if (/黄|中|预警|临期/.test(text)) return "warning";
    return "neutral";
  }

  function toneLabel(tone = "") {
    if (tone === "danger") return "红牌";
    if (tone === "warning") return "黄牌";
    return "关注";
  }
  
  function enrichPmcInterventionStatus(body) {
    const sections = body?.sections || {};
    const targetSections = ["red_risks", "yellow_risks", "morning_brief", "intervention_tasks"];
    const relatedNos = targetSections
      .flatMap((name) => (Array.isArray(sections[name]) ? sections[name] : []))
      .map((row) => row.related_no)
      .filter(Boolean);
    const latestByNo = latestPmcInterventionsByRelatedNos(relatedNos);
    const nextSections = { ...sections };
    for (const name of targetSections) {
      const enrichedRows = (Array.isArray(sections[name]) ? sections[name] : []).map((row) => {
        const latest = latestByNo.get(row.related_no);
        const closure = pmcRiskClosure(row, latest);
        return {
          ...row,
          intervention_state: closure.intervention_state,
          response_sla: closure.response_sla,
          escalation_state: closure.escalation_state,
          latest_intervention: latest?.action_label || row.latest_intervention || "",
          latest_actor: latest?.actor || row.latest_actor || "",
          latest_at: latest?.created_at || row.latest_at || "",
          closure_overdue: closure.closure_overdue,
          overdue_hours: closure.overdue_hours,
          intervention_log: interventionLogHref(row.related_no)
        };
      });
      nextSections[name] = name === "morning_brief" ? sortMorningBriefByResponse(enrichedRows) : enrichedRows;
    }
    return { ...body, sections: nextSections };
  }
  
  function sortMorningBriefByResponse(rows = []) {
    return [...rows].sort((a, b) => {
      const aOverdue = a.closure_overdue ? 0 : 1;
      const bOverdue = b.closure_overdue ? 0 : 1;
      const aOpen = isInterventionFinal(a.intervention_state) ? 1 : 0;
      const bOpen = isInterventionFinal(b.intervention_state) ? 1 : 0;
      return aOverdue - bOverdue || aOpen - bOpen || Number(a.priority_no || 999) - Number(b.priority_no || 999);
    });
  }
  
  function pmcRiskClosure(row = {}, latest = null) {
    const riskLevel = String(row.risk_level || row.priority || "").trim();
    const riskType = String(row.risk_type || row.exception_type || "").trim();
    const isRed = riskLevel.includes("红") || riskLevel === "高" || /超期|断供|瓶颈/.test(riskType);
    const responseHours = isRed ? 4 : 24;
    if (latest?.created_at) {
      const hours = hoursSince(latest.created_at);
      const state = latest.intervention_state || defaultInterventionState(latest.action_label);
      const overdue = !isInterventionFinal(state) && hours !== null && hours >= responseHours;
      if (state === "已关闭") {
        return {
          intervention_state: "已关闭",
          response_sla: `已关闭${hours === null ? "" : ` · ${hours}小时前`}`,
          escalation_state: "已闭环，进入复盘",
          closure_overdue: false,
          overdue_hours: 0
        };
      }
      if (state === "已响应") {
        return {
          intervention_state: "已响应待关闭",
          response_sla: `已响应待验证${hours === null ? "" : ` · ${hours}小时前`}`,
          escalation_state: "已响应但未关闭，继续跟踪结果",
          closure_overdue: false,
          overdue_hours: 0
        };
      }
      return {
        intervention_state: "处理中",
        response_sla: overdue ? `处理中超时 · ${hours}小时前` : `处理中${hours === null ? "" : ` · ${hours}小时前`}`,
        escalation_state: overdue ? "已超时，立即升级老板/管理层" : isRed ? "处理中，超时需升级" : "处理中，24小时内复核",
        closure_overdue: overdue,
        overdue_hours: overdue ? hours : 0
      };
    }
    return {
      intervention_state: "待响应",
      response_sla: `${responseHours}小时内响应`,
      escalation_state: isRed ? "超时需升级老板/管理层" : "24小时未处理转红牌",
      closure_overdue: false,
      overdue_hours: 0
    };
  }
  
  function hoursSince(value, now = new Date()) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 36e5));
  }
  
  function pmcClosureSummary(sections = {}) {
    const rows = [...(sections.red_risks || []), ...(sections.yellow_risks || [])];
    const openRows = rows.filter((row) => !isInterventionFinal(row.intervention_state));
    return {
      open_total: openRows.length,
      open_red: (sections.red_risks || []).filter((row) => !isInterventionFinal(row.intervention_state)).length,
      open_yellow: (sections.yellow_risks || []).filter((row) => !isInterventionFinal(row.intervention_state)).length,
      overdue_closures: openRows.filter((row) => row.closure_overdue).length,
      processing_total: openRows.filter((row) => row.intervention_state === "处理中").length,
      responded_total: rows.length - openRows.length
    };
  }
  
  function filterPmcOpenRisks(body = {}) {
    const sections = body.sections || {};
    const openRow = (row) => !isInterventionFinal(row?.intervention_state);
    return {
      ...body,
      sections: {
        ...sections,
        morning_brief: (sections.morning_brief || []).filter(openRow),
        red_risks: (sections.red_risks || []).filter(openRow),
        yellow_risks: (sections.yellow_risks || []).filter(openRow),
        intervention_tasks: (sections.intervention_tasks || []).filter(openRow)
      }
    };
  }
  
  function isInterventionFinal(state = "") {
    return state === "已关闭";
  }
  
  function pmcMorningBriefText(body = {}, params = {}) {
    const enriched = enrichPmcInterventionStatus(body);
    const displayBody = parseBoolean(params.open_only) ? filterPmcOpenRisks(enriched) : enriched;
    const sections = displayBody.sections || {};
    const rows = (sections.morning_brief || []).slice(0, 10);
    const closure = pmcClosureSummary(enriched.sections || {});
    const scope = [
      enriched.owner_filter ? `负责人：${enriched.owner_filter}` : "范围：全公司",
      parseBoolean(params.open_only) ? "口径：只看待响应" : "口径：全部风险"
    ].join("；");
    const lines = [
      "蕴杰金属 PMC 早会风险摘要",
      `生成时间：${formatDateTime(new Date())}`,
      scope,
      `待响应：${closure.open_total}（红牌${closure.open_red}，黄牌${closure.open_yellow}）；已关闭：${closure.responded_total}`,
      `超时未闭环：${closure.overdue_closures}`,
      ""
    ];
    if (!rows.length) {
      lines.push("当前没有需要展示的早会风险。");
      return lines.join("\n");
    }
    rows.forEach((row, index) => {
      lines.push(`${index + 1}. [${row.risk_level || "风险"}][${row.intervention_state || "待响应"}] ${row.headline || row.related_no || "待确认风险"}`);
      lines.push(`   关联单号：${row.related_no || "--"}；责任角色：${row.owner_role || "--"}；响应时限：${row.response_sla || "--"}；升级状态：${row.escalation_state || "--"}`);
      lines.push(`   早会关注：${row.meeting_focus || "--"}`);
      lines.push(`   下一步：${row.next_action || row.primary_action || "--"}`);
      if (row.latest_intervention || row.latest_actor) {
        lines.push(`   最近处理：${[row.latest_intervention, row.latest_actor].filter(Boolean).join(" / ")}`);
      }
    });
    return lines.join("\n");
  }
  
  function pmcMorningBriefPage(body = {}, params = {}) {
    const text = pmcMorningBriefText(body, params);
    const query = new URLSearchParams();
    query.set("rebuild", "1");
    if (params.owner) query.set("owner", params.owner);
    if (parseBoolean(params.open_only)) query.set("open_only", "1");
    const queryText = query.toString();
    const textHref = `/pmc/brief.txt?${queryText}`;
    const backHref = `/pmc?${queryText || "rebuild=1"}`;
    return briefCopyPage({
      title: "PMC 早会文本",
      subtitle: "可直接复制到微信、邮件或早会纪要。页面只读取本地 SQLite 生成的摘要，不访问 ERP。",
      text,
      textHref,
      backHref,
      backLabel: "返回PMC"
    });
  }
  
  function briefCopyPage({ title, subtitle, text, textHref, backHref, backLabel }) {
    return `<!doctype html>
  <html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root { --bg:#f4f6f8; --panel:#fff; --text:#172033; --muted:#667085; --border:#d9dee7; --green:#176b58; }
      * { box-sizing:border-box; }
      body { margin:0; min-height:100vh; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--bg); color:var(--text); }
      main { width:min(980px, calc(100% - 32px)); margin:0 auto; padding:24px 0 36px; }
      header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; padding-bottom:16px; border-bottom:1px solid var(--border); }
      h1 { margin:0; font-size:28px; letter-spacing:0; }
      .sub { margin-top:8px; color:var(--muted); font-size:14px; line-height:1.6; }
      .actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
      .button { display:inline-block; min-height:36px; padding:8px 12px; border:1px solid var(--border); border-radius:6px; background:var(--panel); color:var(--text); text-decoration:none; font-size:14px; cursor:pointer; }
      .button.primary { background:var(--green); border-color:var(--green); color:#fff; }
      .panel { margin-top:18px; border:1px solid var(--border); border-radius:8px; background:var(--panel); overflow:hidden; }
      .panel h2 { margin:0; padding:14px 16px; border-bottom:1px solid var(--border); font-size:17px; }
      textarea { display:block; width:100%; min-height:520px; padding:16px; border:0; resize:vertical; font:14px/1.75 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color:var(--text); background:#fff; }
      .copy-status { margin-top:10px; color:var(--muted); font-size:13px; min-height:20px; }
      @media (max-width: 720px) { header { display:block; } .actions { justify-content:flex-start; margin-top:12px; } h1 { font-size:24px; } textarea { min-height:460px; } }
      ${sharedNavCss()}
    </style>
  </head>
  <body>
    <main>
      ${renderTopNav("/pmc")}
      <header>
        <div>
          <h1>${escapeHtml(title)}</h1>
          <div class="sub">${escapeHtml(subtitle)}</div>
        </div>
        <div class="actions">
          <button class="button primary" type="button" onclick="copyBrief()">复制文本</button>
          <a class="button" href="${escapeHtml(textHref)}">打开纯文本</a>
          <a class="button" href="${escapeHtml(backHref)}">${escapeHtml(backLabel)}</a>
        </div>
      </header>
      <section class="panel">
        <h2>转发内容</h2>
        <textarea id="briefText" readonly>${escapeHtml(text)}</textarea>
      </section>
      <div class="copy-status" id="copyStatus"></div>
    </main>
    <script>
      async function copyBrief() {
        const text = document.getElementById("briefText").value;
        const status = document.getElementById("copyStatus");
        try {
          await navigator.clipboard.writeText(text);
          status.textContent = "已复制，可直接粘贴发送。";
        } catch {
          document.getElementById("briefText").select();
          status.textContent = "浏览器未允许自动复制，已选中文本，可按 Ctrl+C 或 Command+C。";
        }
      }
    </script>
  </body>
  </html>`;
  }
  
  function renderKpiCard(label, value, hint, tone = "", href = "") {
    const content = `<div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div><div class="hint">${escapeHtml(hint)}</div>`;
    const className = `kpi ${tone || ""}`.trim();
    return href
      ? `<a class="${escapeHtml(className)}" href="${escapeHtml(href)}">${content}</a>`
      : `<div class="${escapeHtml(className)}">${content}</div>`;
  }

  function pmcAiChatPanel() {
    const examples = [
      "今天老板最应该先处理哪几个风险？",
      "冲压工段有哪些逾期工序？",
      "哪些订单可能缺料？",
      "最近有哪些应收应付风险？"
    ];
    return `<section class="ai-chat" aria-label="AI数据助手">
      <div class="ai-chat-head">
        <div>
          <h2>AI数据助手</h2>
          <div class="ai-chat-scope">只基于本地 SQLite 已同步数据回答：订单、工序、物料、财务和 PMC 风险。</div>
        </div>
      </div>
      <div class="ai-chat-body">
        <div class="ai-chat-form">
          <div id="pmcAiChatMessages" class="ai-chat-messages">
            <p class="ai-chat-message assistant">可以直接提问，例如“今天老板最应该先处理哪几个风险？”。回答会标注数据来源，并写入本地聊天日志。</p>
          </div>
          <form id="pmcAiChatForm">
            <textarea id="pmcAiChatInput" name="message" placeholder="输入问题，例如：冲压工段有哪些逾期工序？" autocomplete="off"></textarea>
            <button id="pmcAiChatSubmit" class="ai-chat-submit" type="submit">发送</button>
          </form>
        </div>
        <div class="ai-chat-suggestions">
          <div class="ai-chat-suggestions-title">常用问题</div>
          ${examples.map((text) => `<button class="ai-chip" type="button" data-question="${escapeHtml(text)}">${escapeHtml(text)}</button>`).join("")}
        </div>
      </div>
    </section>`;
  }

  function pmcAiChatScript() {
    return `<script>
      (() => {
        const form = document.getElementById("pmcAiChatForm");
        const input = document.getElementById("pmcAiChatInput");
        const messages = document.getElementById("pmcAiChatMessages");
        const submit = document.getElementById("pmcAiChatSubmit");
        if (!form || !input || !messages || !submit) return;

        function appendMessage(role, text) {
          const node = document.createElement("p");
          node.className = "ai-chat-message " + role;
          node.textContent = (role === "user" ? "我：\\n" : role === "error" ? "提示：\\n" : "AI：\\n") + text;
          messages.appendChild(node);
          messages.scrollTop = messages.scrollHeight;
        }

        async function ask(message) {
          const text = String(message || "").trim();
          if (!text) return;
          appendMessage("user", text);
          input.value = "";
          submit.disabled = true;
          submit.textContent = "查询中...";
          try {
            const response = await fetch("/api/ai/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: text })
            });
            const payload = await response.json();
            if (!response.ok) {
              appendMessage("error", payload.error || "查询失败，请稍后再试。");
              return;
            }
            appendMessage("assistant", payload.answer || "没有生成回答。");
          } catch (error) {
            appendMessage("error", "本地服务暂时无法响应：" + (error && error.message ? error.message : "未知错误"));
          } finally {
            submit.disabled = false;
            submit.textContent = "发送";
          }
        }

        form.addEventListener("submit", (event) => {
          event.preventDefault();
          ask(input.value);
        });
        document.querySelectorAll("[data-question]").forEach((button) => {
          button.addEventListener("click", () => ask(button.getAttribute("data-question")));
        });
      })();
    </script>`;
  }
  
  function pmcTablePanel(title, rows, columns, tone = "", extraClass = "") {
    const safeRows = Array.isArray(rows) ? rows.slice(0, 10) : [];
    return `<section class="panel ${escapeHtml(extraClass)}">
      <h2 class="${escapeHtml(tone)}">${escapeHtml(title)} <span class="tag ${escapeHtml(tone)}">${safeRows.length}</span></h2>
      ${
        safeRows.length
          ? `<div class="table-scroll"><table><thead><tr>${columns.map((column) => `<th class="${escapeHtml(pmcColumnClass(column))}">${escapeHtml(labelFor(column))}</th>`).join("")}</tr></thead><tbody>${safeRows.map((row) => `<tr>${columns.map((column) => `<td class="${escapeHtml(pmcColumnClass(column))}">${formatPmcCell(row, column)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
          : `<div class="empty">当前没有${escapeHtml(title)}。</div>`
      }
    </section>`;
  }

  function pmcColumnClass(column) {
    return `col-${String(column || "").replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase()}`;
  }
  
  function pmcBattleMapPanel(rows, stages) {
    const safeRows = Array.isArray(rows) ? rows.slice(0, 12) : [];
    const safeStages = Array.isArray(stages) && stages.length ? stages : ["熔炼", "轧制", "机加工", "热处理", "表面处理", "质检", "包装", "待发"];
    return `<section class="panel">
      <h2>订单作战地图 <span class="tag">${safeRows.length}</span></h2>
      ${
        safeRows.length
          ? `<div class="battle-wrap"><table class="battle-table"><thead><tr><th>订单/派工</th><th>产品</th><th>当前卡点</th>${safeStages.map((stage) => `<th>${escapeHtml(stage)}</th>`).join("")}</tr></thead><tbody>${safeRows.map((row) => `<tr><td>${escapeHtml(row.order_no || row.work_assignment_id || "")}</td><td>${escapeHtml(row.product_name || "")}</td><td>${escapeHtml(row.current_stage || "")}<br><span class="sub">${escapeHtml(row.blocker || "")}</span></td>${safeStages.map((stage) => `<td>${formatBattleNode(row[`stage_${stage}`])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
          : `<div class="empty">当前没有可生成作战地图的派工数据。</div>`
      }
    </section>`;
  }
  
  function formatBattleNode(cell = {}) {
    const status = cell.status || "none";
    const title = [cell.procedure_name, cell.work_center_name, cell.remaining_qty !== "" && cell.remaining_qty !== undefined ? `剩余${cell.remaining_qty}` : "", cell.planned_finish_date ? `计划${cell.planned_finish_date}` : "", cell.problem].filter(Boolean).join(" / ");
    const label = escapeHtml(cell.label || "○");
    if (status === "red" || status === "yellow" || status === "active") {
      const row = {
        risk_level: status === "red" ? "红牌" : status === "yellow" ? "黄牌" : "关注",
        risk_type: status === "red" ? "产能瓶颈" : status === "yellow" ? "产能预警" : "工序跟进",
        related_no: cell.order_no || cell.work_assignment_id || "",
        problem: title,
        primary_action: status === "red" ? "确认资源安排并处理延期工序" : "确认工序进度和完成时间",
        buttons: []
      };
      return `<a class="battle-node ${escapeHtml(status)}" title="${escapeHtml(title)}" href="${escapeHtml(pmcInterventionHref(row, status === "red" ? "加班协调" : "协调工序"))}">${label}</a>`;
    }
    return `<span class="battle-node ${escapeHtml(status)}" title="${escapeHtml(title)}">${label}</span>`;
  }
  
  function formatPmcCell(row, column) {
    if (column === "buttons" && Array.isArray(row?.buttons)) {
      return row.buttons
        .map((label) => `<a class="mini-button" href="${escapeHtml(pmcInterventionHref(row, label))}">${escapeHtml(label)}</a>`)
        .join("");
    }
    if (column === "owner_link") {
      const owner = row?.owner_link || row?.owner || "";
      if (!owner) return "";
      return `<a class="mini-button" href="/pmc?rebuild=1&owner=${encodeURIComponent(owner)}">进入</a>`;
    }
    if (column === "link_action" && row?.link_action) {
      return `<a class="mini-button" href="${escapeHtml(row.link_action)}">绑定</a>`;
    }
    if (column === "intervention_log" && row?.intervention_log) {
      return `<a class="mini-button" href="${escapeHtml(row.intervention_log)}">查看</a>`;
    }
    if (column === "intervention_state") {
      return escapeHtml(row?.intervention_state || "待处理");
    }
    if (column === "latest_at") {
      return escapeHtml(row?.latest_at ? formatDateTime(row.latest_at) : "");
    }
    if (["quantity", "demand_qty", "available_qty", "stock_qty", "shortage_qty"].includes(column)) {
      return escapeHtml(formatPmcQuantity(row?.[column], row?.unit || row?.raw?.unit || row?.raw?.raw?.Unit || row?.raw?.raw?.单位));
    }
    return formatCell(row?.[column]);
  }
  
  function formatPmcQuantity(value, unit = "") {
    if (value === undefined || value === null || value === "") {
      return "";
    }
    const number = parseNumber(value);
    if (number === null) {
      return String(value ?? "");
    }
    const text = unit === "kg" || unit === "公斤" ? number.toFixed(2) : Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
    return `${text}${unit || ""}`;
  }
  
  function pmcInterventionHref(row, actionLabel) {
    const params = new URLSearchParams();
    params.set("action_label", actionLabel || "查看详情");
    params.set("intervention_state", defaultInterventionState(actionLabel));
    params.set("risk_level", row?.risk_level || row?.priority || "");
    params.set("risk_type", row?.risk_type || row?.exception_type || "");
    params.set("related_no", row?.related_no || "");
    params.set("problem", row?.problem || row?.item || "");
    params.set("primary_action", row?.primary_action || row?.action || "");
    params.set("actor", "内网用户");
    return `/pmc/intervention?${params.toString()}`;
  }
  
  function defaultInterventionState(actionLabel = "") {
    const text = String(actionLabel || "");
    if (/关闭|完成|闭环|已处理/.test(text)) return "已关闭";
    if (/响应|已响应/.test(text)) return "已响应";
    return "处理中";
  }
  
  function interventionLogHref(relatedNo = "") {
    const value = String(relatedNo || "").trim();
    return value ? `/interventions?related_no=${encodeURIComponent(value)}` : "/interventions";
  }
  
  function pmcInterventionPage(params = {}, saved = null) {
    const relatedNo = params.related_no || "";
    const recentRows = latestPmcInterventions({ related_no: relatedNo, limit: 10 });
    const template = interventionTemplate(params);
    const defaultNote = params.note || defaultInterventionNote(params);
    const actor = params.actor || "内网用户";
    const state = params.intervention_state || defaultInterventionState(params.action_label);
    const resultType = params.result_type || defaultResultTypeForAction(params.action_label || params.risk_type);
    const promisedDate = params.promised_date || "";
    const nextOwner = params.next_owner || defaultNextOwnerForRisk(params.risk_type);
    return `<!doctype html>
  <html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>PMC 干预处理</title>
    <style>
      :root { --bg:#f4f6f8; --panel:#fff; --text:#172033; --muted:#667085; --border:#d9dee7; --green:#176b58; --red:#b42318; --red-soft:#fee4e2; }
      * { box-sizing: border-box; }
      body { margin:0; min-height:100vh; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--bg); color:var(--text); }
      main { width:min(1180px, calc(100% - 32px)); margin:0 auto; padding:24px 0 36px; }
      header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; padding-bottom:16px; border-bottom:1px solid var(--border); }
      h1 { margin:0; font-size:28px; }
      .sub { margin-top:8px; color:var(--muted); font-size:14px; }
      .button { display:inline-block; min-height:36px; padding:8px 12px; border:1px solid var(--border); border-radius:6px; background:var(--panel); color:var(--text); text-decoration:none; font-size:14px; }
      .button.primary { background:var(--green); border-color:var(--green); color:#fff; }
      .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:16px; align-items:start; }
      .panel { border:1px solid var(--border); border-radius:8px; background:var(--panel); overflow:hidden; }
      .panel h2 { margin:0; padding:14px 16px; border-bottom:1px solid var(--border); font-size:17px; }
      .body { padding:14px 16px; line-height:1.7; font-size:14px; }
      .success { margin-top:14px; padding:12px 14px; border:1px solid #b7dfc8; border-radius:8px; background:#e8f3ef; color:var(--green); }
      .tag { display:inline-block; padding:3px 7px; border-radius:999px; background:#e8f3ef; color:var(--green); font-size:12px; white-space:nowrap; }
      .template { white-space:pre-wrap; padding:12px; border:1px solid var(--border); border-radius:8px; background:#f8fafc; }
      label { display:block; margin-bottom:10px; color:var(--muted); font-size:13px; }
      input, textarea { width:100%; margin-top:6px; padding:9px 10px; border:1px solid var(--border); border-radius:6px; background:#fff; color:var(--text); font:inherit; }
      textarea { min-height:112px; resize:vertical; line-height:1.6; }
      form .button { cursor:pointer; }
      table { width:100%; border-collapse:collapse; }
      th, td { padding:9px 10px; border-bottom:1px solid var(--border); text-align:left; vertical-align:top; font-size:13px; }
      th { background:#f0f3f6; color:#344054; }
      @media (max-width: 900px) { .grid { grid-template-columns:1fr; } header { display:block; } .actions { margin-top:12px; } }
      ${sharedNavCss()}
    </style>
  </head>
  <body>
    <main>
      ${renderTopNav("/pmc")}
      <header>
        <div>
          <h1>PMC 干预处理</h1>
          <div class="sub">本页只写入本地 SQLite 留痕，不回写 ERP，不发送外部消息。</div>
        </div>
        <div class="actions">
          <a class="button" href="/pmc?rebuild=1">返回作战台</a>
        </div>
      </header>
      ${saved ? `<div class="success">已保存本地干预记录：#${escapeHtml(saved.id)}，${escapeHtml(formatDateTime(saved.created_at))}</div>` : ""}
      <section class="grid">
        <section class="panel"><h2>问题与动作</h2><div class="body">
          <div><strong>风险等级：</strong>${escapeHtml(params.risk_level || "")}</div>
          <div><strong>风险类型：</strong>${escapeHtml(params.risk_type || "")}</div>
          <div><strong>关联单号：</strong>${escapeHtml(relatedNo || "")}</div>
          <div><strong>问题描述：</strong>${escapeHtml(params.problem || "")}</div>
          <div><strong>选择动作：</strong>${escapeHtml(params.action_label || "")}</div>
          <div><strong>闭环状态：</strong>${escapeHtml(state)}</div>
          <div><strong>处理结果：</strong>${escapeHtml(resultType)}</div>
          <div><strong>建议动作：</strong>${escapeHtml(params.primary_action || "")}</div>
        </div></section>
        <section class="panel"><h2>处理留痕</h2><div class="body">
          <div class="template">${escapeHtml(template)}</div>
          <form action="/pmc/intervention/save" method="post" style="margin-top:12px;">
            ${interventionHiddenInputs(params)}
            <label>处理人<input name="actor" value="${escapeHtml(actor)}"></label>
            <label>闭环状态<select name="intervention_state" style="width:100%;margin-top:6px;padding:9px 10px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text);font:inherit;">
              ${["处理中", "已响应", "已关闭"].map((item) => `<option value="${escapeHtml(item)}"${item === state ? " selected" : ""}>${escapeHtml(item)}</option>`).join("")}
            </select></label>
            <label>处理结果<select name="result_type" style="width:100%;margin-top:6px;padding:9px 10px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text);font:inherit;">
              ${["供应商跟催", "调拨库存", "替代料", "转序交接", "加班增产", "外协处理", "调整排程", "客户沟通", "其他处理"].map((item) => `<option value="${escapeHtml(item)}"${item === resultType ? " selected" : ""}>${escapeHtml(item)}</option>`).join("")}
            </select></label>
            <label>承诺完成/到货日期<input type="date" name="promised_date" value="${escapeHtml(promisedDate)}"></label>
            <label>下一责任人<input name="next_owner" value="${escapeHtml(nextOwner)}"></label>
            <label>处理备注<textarea name="note">${escapeHtml(defaultNote)}</textarea></label>
            <button class="button primary" type="submit">保存处理记录</button>
          </form>
        </div></section>
      </section>
      <section class="panel" style="margin-top:12px;"><h2>最近处理记录 <span class="tag">${recentRows.length}</span></h2>
        ${
          recentRows.length
            ? `<table><thead><tr>${["created_at", "risk_type", "related_no", "action_label", "intervention_state", "closure_quality", "closure_gap", "result_type", "promised_date", "next_owner", "note", "actor"].map((column) => `<th>${escapeHtml(labelFor(column))}</th>`).join("")}</tr></thead><tbody>${recentRows.map((row) => `<tr>${["created_at", "risk_type", "related_no", "action_label", "intervention_state", "closure_quality", "closure_gap", "result_type", "promised_date", "next_owner", "note", "actor"].map((column) => `<td>${formatCell(row[column])}</td>`).join("")}</tr>`).join("")}</tbody></table>`
            : `<div class="body">当前关联单号还没有本地处理记录。</div>`
        }
      </section>
    </main>
  </body>
  </html>`;
  }
  
  function interventionHiddenInputs(params = {}) {
    const keys = ["risk_level", "risk_type", "related_no", "action_label", "problem", "primary_action"];
    return keys
      .map((key) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(params[key] || "")}">`)
      .join("");
  }
  
  function defaultResultTypeForAction(value = "") {
    const text = String(value || "");
    if (/入库|转序|接收/.test(text)) return "转序交接";
    if (/调拨/.test(text)) return "调拨库存";
    if (/替代/.test(text)) return "替代料";
    if (/催|供应商|物流/.test(text)) return "供应商跟催";
    if (/加班|增班/.test(text)) return "加班增产";
    if (/外协/.test(text)) return "外协处理";
    if (/排程|协调|顺序/.test(text)) return "调整排程";
    if (/客户|沟通|通知/.test(text)) return "客户沟通";
    return "其他处理";
  }
  
  function defaultNextOwnerForRisk(value = "") {
    const text = String(value || "");
    if (/物料|断供/.test(text)) return "采购/仓库";
    if (/前道|转序/.test(text)) return "PMC/轧制/后道工段";
    if (/产能|工序|冲压/.test(text)) return "生产/工段长";
    if (/交期|客户/.test(text)) return "销售/跟单";
    if (/报价/.test(text)) return "销售";
    return "责任部门";
  }
  
  function defaultInterventionNote(params = {}) {
    return `${params.action_label || "处理"}：${params.primary_action || params.problem || "已进入处理"}`;
  }
  
  function interventionTemplate(params = {}) {
    const action = params.action_label || "处理";
    const riskType = params.risk_type || "风险";
    const relatedNo = params.related_no || "相关单号";
    const problem = params.problem || "待处理问题";
    if (/催货|供应商|物流/.test(action)) {
      return `供应商您好：\n${relatedNo} 当前存在 ${riskType}：${problem}。\n请确认具体到货时间、物流状态和可提前交付方案。如有延迟，请今天回复原因和新的到厂时间。\n\n蕴杰金属 PMC`;
    }
    if (/客户|沟通|通知/.test(action)) {
      return `客户您好：\n${relatedNo} 当前进度我们正在重点跟进，问题为：${problem}。\n我们会在确认生产/物料方案后同步最新交付安排。`;
    }
    if (/加班|外协|排程|协调/.test(action)) {
      return `内部协调：\n${relatedNo} 需处理 ${riskType}：${problem}。\n建议动作：${params.primary_action || action}。\n请责任部门确认资源、完成时间和对交期的影响。`;
    }
    return `${relatedNo} ${riskType}：${problem}\n处理动作：${action}\n建议：${params.primary_action || "请确认责任人、处理时限和下一步结果。"}`;
  }

  return {
    briefCopyPage,
    defaultInterventionState,
    defaultNextOwnerForRisk,
    defaultResultTypeForAction,
    enrichPmcInterventionStatus,
    filterPmcOpenRisks,
    interventionLogHref,
    isInterventionFinal,
    pmcClosureSummary,
    pmcConsolePage,
    pmcInterventionPage,
    pmcInterventionHref,
    pmcMorningBriefPage,
    pmcMorningBriefText,
    pmcRiskClosure
  };
}
