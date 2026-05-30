export function createReportsPageRenderers({
  escapeHtml,
  formatDateTime,
  formatDetailCell,
  labelFor,
  modulePage,
  modulePanel,
  renderTopNav,
  sharedNavCss
}) {
  function interventionLogPage(body) {
    const exportHref = `/interventions/export.csv?${interventionFilterParams(body.filters).toString()}`;
    const activeFilters = [
      body.filters.related_no ? `关联单号：${body.filters.related_no}` : "",
      body.filters.risk_type ? `风险类型：${body.filters.risk_type}` : "",
      body.filters.actor ? `处理人：${body.filters.actor}` : "",
      body.filters.date_from ? `开始：${body.filters.date_from}` : "",
      body.filters.date_to ? `结束：${body.filters.date_to}` : ""
    ].filter(Boolean).join("；");
    return modulePage({
      title: "干预记录台账",
      subtitle: activeFilters ? `当前筛选 ${activeFilters}` : "查看 PMC 风险处理留痕、处理人和备注。",
      summary: [
        ["显示记录", body.summary.shown_actions],
        ["今日处理", body.summary.today_actions],
        ["累计处理", body.summary.total_actions],
        ["风险类型", body.summary.risk_types],
        ["处理结果", body.summary.result_types],
        ["闭环不完整", body.summary.incomplete_closures],
        ["改进建议", body.summary.suggestions]
      ],
      panels: [
        interventionFilterPanel(body.filters),
        modulePanel("干预记录", body.sections.rows, ["created_at", "risk_level", "risk_type", "related_no", "action_label", "intervention_state", "closure_quality", "closure_gap", "result_type", "promised_date", "next_owner", "problem", "note", "actor"], { fullWidth: true, limit: "all", tall: true }),
        modulePanel("风险类型汇总", body.sections.by_risk_type, ["risk_type", "actions"]),
        modulePanel("处理结果汇总", body.sections.by_result_type, ["result_type", "actions"]),
        modulePanel("闭环质量汇总", body.sections.by_closure_quality, ["closure_quality", "actions"]),
        modulePanel("改进建议", body.sections.improvement_suggestions, ["result_type", "actions", "review_focus", "recommendation"], { fullWidth: true })
      ],
      notes: body.notes,
      actions: [["导出CSV", exportHref], ["PMC作战台", "/pmc?rebuild=1"], ["待响应风险", "/pmc?rebuild=1&open_only=1"], ["系统状态", "/system"]]
    });
  }

  function interventionFilterParams(filters = {}) {
    const params = new URLSearchParams();
    for (const key of ["related_no", "risk_type", "actor", "intervention_state", "date_from", "date_to", "limit"]) {
      const value = filters[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        params.set(key, String(value));
      }
    }
    return params;
  }

  function interventionFilterPanel(filters = {}) {
    const inputStyle = "width:100%;min-height:36px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text);font-size:14px;";
    const labelStyle = "display:block;margin-bottom:6px;color:var(--muted);font-size:13px;";
    const field = (name, label, value = "") => `<label><span style="${labelStyle}">${escapeHtml(label)}</span><input style="${inputStyle}" name="${escapeHtml(name)}" value="${escapeHtml(value)}"></label>`;
    return `<section class="panel full-width">
      <h2>筛选条件</h2>
      <form action="/interventions" method="get" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;padding:14px 16px;align-items:end;">
        ${field("related_no", "关联单号", filters.related_no || "")}
        ${field("risk_type", "风险类型", filters.risk_type || "")}
        ${field("actor", "处理人", filters.actor || "")}
        ${field("intervention_state", "闭环状态", filters.intervention_state || "")}
        ${field("date_from", "开始时间", filters.date_from || "")}
        ${field("date_to", "结束时间", filters.date_to || "")}
        ${field("limit", "显示条数", filters.limit || 100)}
        <button class="button primary" type="submit" style="min-height:36px;cursor:pointer;">筛选</button>
        <a class="button" href="/interventions" style="text-align:center;">清空</a>
      </form>
    </section>`;
  }

  function interventionLogCsv(body) {
    const lines = [];
    appendCsvSection(lines, "干预记录", tableRowsForCsv(body.sections.rows, ["created_at", "risk_level", "risk_type", "related_no", "action_label", "intervention_state", "closure_quality", "closure_gap", "result_type", "promised_date", "next_owner", "problem", "note", "actor"]));
    appendCsvSection(lines, "风险类型汇总", tableRowsForCsv(body.sections.by_risk_type, ["risk_type", "actions"]));
    appendCsvSection(lines, "处理结果汇总", tableRowsForCsv(body.sections.by_result_type, ["result_type", "actions"]));
    appendCsvSection(lines, "闭环质量汇总", tableRowsForCsv(body.sections.by_closure_quality, ["closure_quality", "actions"]));
    appendCsvSection(lines, "改进建议", tableRowsForCsv(body.sections.improvement_suggestions, ["result_type", "actions", "review_focus", "recommendation"]));
    return lines.map((row) => row.map(csvCell).join(",")).join("\r\n");
  }

  function reportCenterPage(body) {
    return modulePage({
      title: "报表中心",
      subtitle: "形成管理指标汇总，并提供打印版、CSV 和 Excel 日报导出。",
      summary: [
        ["今日订单", body.summary.today_orders],
        ["本月订单", body.summary.month_orders],
        ["红灯订单", body.summary.red_orders],
        ["黄灯订单", body.summary.yellow_orders],
        ["绿灯订单", body.summary.green_orders],
        ["缺料订单", body.summary.shortage_orders],
        ["临期订单", body.summary.due_soon_orders],
        ["低库存", body.summary.low_stock],
        ["待响应风险", body.summary.pending_response_tasks || 0],
        ["已关闭风险", body.summary.closed_tasks ?? body.summary.responded_tasks ?? 0],
        ["今日处理", body.summary.today_interventions || 0],
        ["处理结果", body.summary.result_types || 0],
        ["闭环不完整", body.summary.incomplete_closures || 0],
        ["改进建议", body.summary.suggestions || 0],
        ["早会重点", body.summary.morning_brief_items || 0]
      ],
      panels: [
        modulePanel("今日早会风险摘要", body.sections.morning_brief || [], ["priority_no", "risk_level", "headline", "related_no", "owner_role", "intervention_state", "response_sla", "escalation_state", "latest_intervention", "latest_actor", "next_action", "meeting_focus", "intervention_log", "morning_action"], { fullWidth: true }),
        modulePanel("风险闭环待办", body.sections.exception_tasks || [], ["task_no", "priority", "exception_type", "related_no", "item", "status", "response_sla", "latest_intervention", "responsible_role", "action"], { fullWidth: true }),
        modulePanel("今日/最近处理", body.sections.intervention_actions || [], ["created_at", "risk_type", "related_no", "action_label", "intervention_state", "closure_quality", "closure_gap", "result_type", "promised_date", "next_owner", "note", "actor"], { fullWidth: true }),
        modulePanel("处理结果汇总", body.sections.intervention_result_types || [], ["result_type", "actions"]),
        modulePanel("闭环质量汇总", body.sections.intervention_closure_quality || [], ["closure_quality", "actions"]),
        modulePanel("改进建议", body.sections.improvement_suggestions || [], ["result_type", "actions", "review_focus", "recommendation"], { fullWidth: true }),
        modulePanel("订单状态样本", body.sections.order_rows, ["status_light", "order_no", "customer", "owner", "amount", "due_status", "shortage_status"]),
        modulePanel("低库存预警", body.sections.low_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"])
      ],
      notes: body.notes,
      actions: [
        ["打印版", "/reports/print"],
        ["导出 Excel", "/reports/export.xls"],
        ["导出 CSV", "/reports/export.csv"],
        ["刷新", "/reports?refresh=1"]
      ]
    });
  }

  function reportPrintPage(body) {
    const summaryRows = [
      ["今日订单", body.summary.today_orders],
      ["本月订单", body.summary.month_orders],
      ["红灯订单", body.summary.red_orders],
      ["黄灯订单", body.summary.yellow_orders],
      ["绿灯订单", body.summary.green_orders],
      ["缺料订单", body.summary.shortage_orders],
      ["临期订单", body.summary.due_soon_orders],
      ["低库存", body.summary.low_stock],
      ["待响应风险", body.summary.pending_response_tasks || 0],
      ["已关闭风险", body.summary.closed_tasks ?? body.summary.responded_tasks ?? 0],
      ["今日处理", body.summary.today_interventions || 0],
      ["早会重点", body.summary.morning_brief_items || 0]
    ];
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PMC 日报打印版</title>
  <style>
    :root { color-scheme: light; --text: #172033; --muted: #667085; --border: #cfd6e2; --soft: #f3f6f8; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: #eef2f6; }
    main { width: min(1020px, calc(100% - 32px)); margin: 24px auto; padding: 28px; background: #ffffff; border: 1px solid var(--border); }
    header { display: flex; justify-content: space-between; gap: 20px; padding-bottom: 14px; border-bottom: 2px solid var(--text); }
    h1 { margin: 0; font-size: 28px; letter-spacing: 0; }
    h2 { margin: 24px 0 10px; font-size: 16px; letter-spacing: 0; }
    .meta { color: var(--muted); font-size: 13px; line-height: 1.7; text-align: right; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--border); border-bottom: 0; border-right: 0; margin-top: 18px; }
    .metric { min-height: 72px; padding: 10px 12px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); }
    .metric span { display: block; color: var(--muted); font-size: 12px; }
    .metric strong { display: block; margin-top: 8px; font-size: 24px; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
    th, td { padding: 8px 9px; border: 1px solid var(--border); text-align: left; vertical-align: top; font-size: 12px; line-height: 1.4; }
    td { overflow-wrap: anywhere; word-break: break-word; }
    th { background: var(--soft); font-weight: 650; }
    .notes { margin-top: 18px; color: var(--muted); font-size: 12px; line-height: 1.7; }
    .toolbar { margin-bottom: 12px; text-align: right; }
    .button { display: inline-block; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; color: var(--text); text-decoration: none; font-size: 13px; background: #ffffff; }
    ${sharedNavCss()}
    @media print {
      body { background: #ffffff; }
      main { width: 100%; margin: 0; padding: 0; border: 0; }
      .toolbar, .global-nav { display: none; }
      h2 { page-break-after: avoid; }
    }
  </style>
</head>
<body>
  <main>
    ${renderTopNav("/reports")}
    <div class="toolbar"><a class="button" href="/reports">返回报表中心</a> <a class="button" href="javascript:window.print()">打印</a></div>
    <header>
      <div>
        <h1>蕴杰金属 PMC 日报</h1>
        <div class="notes">订单、交期、缺料、库存综合摘要</div>
      </div>
      <div class="meta">
        <div>生成时间：${escapeHtml(formatDateTime(body.generated_at))}</div>
        <div>数据口径：ERP API + 本地快照</div>
      </div>
    </header>
    <section class="summary">
      ${summaryRows.map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "")}</strong></div>`).join("")}
    </section>
    ${printTable("今日早会风险摘要", body.sections.morning_brief || [], ["priority_no", "risk_level", "headline", "related_no", "owner_role", "intervention_state", "response_sla", "escalation_state", "latest_intervention", "latest_actor", "next_action", "meeting_focus"])}
    ${printTable("风险闭环待办", body.sections.exception_tasks || [], ["task_no", "priority", "exception_type", "related_no", "item", "status", "response_sla", "latest_intervention"])}
    ${printTable("今日/最近处理", body.sections.intervention_actions || [], ["created_at", "risk_type", "related_no", "action_label", "intervention_state", "closure_quality", "closure_gap", "result_type", "promised_date", "next_owner", "note", "actor"])}
    ${printTable("处理结果汇总", body.sections.intervention_result_types || [], ["result_type", "actions"])}
    ${printTable("闭环质量汇总", body.sections.intervention_closure_quality || [], ["closure_quality", "actions"])}
    ${printTable("改进建议", body.sections.improvement_suggestions || [], ["result_type", "actions", "review_focus", "recommendation"])}
    ${printTable("订单状态样本", body.sections.order_rows, ["status_light", "order_no", "customer", "owner", "amount", "due_status", "shortage_status"])}
    ${printTable("低库存预警", body.sections.low_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"])}
    <section class="notes">${(body.notes || []).map((note) => `<div>${escapeHtml(note)}</div>`).join("")}</section>
  </main>
</body>
</html>`;
  }

  function printTable(title, rows, columns) {
    const safeRows = Array.isArray(rows) ? rows.slice(0, 12) : [];
    return `<section>
      <h2>${escapeHtml(title)}</h2>
      ${
        safeRows.length
          ? `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(labelFor(column))}</th>`).join("")}</tr></thead><tbody>${safeRows.map((row) => `<tr>${columns.map((column) => `<td>${formatDetailCell(column, row?.[column], row)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
          : `<table><tbody><tr><td>当前没有${escapeHtml(title)}。</td></tr></tbody></table>`
      }
    </section>`;
  }

  function reportCenterCsv(body) {
    const lines = [];
    appendCsvSection(lines, "PMC指标汇总", [
      ["指标", "数值"],
      ...Object.entries({
        今日订单: body.summary.today_orders,
        本月订单: body.summary.month_orders,
        红灯订单: body.summary.red_orders,
        黄灯订单: body.summary.yellow_orders,
        绿灯订单: body.summary.green_orders,
        缺料订单: body.summary.shortage_orders,
        临期订单: body.summary.due_soon_orders,
        低库存: body.summary.low_stock,
        待响应风险: body.summary.pending_response_tasks || 0,
        已关闭风险: body.summary.closed_tasks ?? body.summary.responded_tasks ?? 0,
        今日处理: body.summary.today_interventions || 0,
        处理结果: body.summary.result_types || 0,
        闭环不完整: body.summary.incomplete_closures || 0,
        改进建议: body.summary.suggestions || 0,
        早会重点: body.summary.morning_brief_items || 0
      })
    ]);
    appendCsvSection(lines, "今日早会风险摘要", tableRowsForCsv(body.sections.morning_brief || [], ["priority_no", "risk_level", "headline", "related_no", "owner_role", "intervention_state", "response_sla", "escalation_state", "latest_intervention", "latest_actor", "next_action", "meeting_focus"]));
    appendCsvSection(lines, "风险闭环待办", tableRowsForCsv(body.sections.exception_tasks || [], ["task_no", "priority", "exception_type", "related_no", "item", "status", "response_sla", "latest_intervention"]));
    appendCsvSection(lines, "今日/最近处理", tableRowsForCsv(body.sections.intervention_actions || [], ["created_at", "risk_type", "related_no", "action_label", "intervention_state", "closure_quality", "closure_gap", "result_type", "promised_date", "next_owner", "note", "actor"]));
    appendCsvSection(lines, "处理结果汇总", tableRowsForCsv(body.sections.intervention_result_types || [], ["result_type", "actions"]));
    appendCsvSection(lines, "闭环质量汇总", tableRowsForCsv(body.sections.intervention_closure_quality || [], ["closure_quality", "actions"]));
    appendCsvSection(lines, "改进建议", tableRowsForCsv(body.sections.improvement_suggestions || [], ["result_type", "actions", "review_focus", "recommendation"]));
    appendCsvSection(lines, "订单状态样本", tableRowsForCsv(body.sections.order_rows, ["status_light", "order_no", "customer", "owner", "amount", "due_status", "shortage_status"]));
    appendCsvSection(lines, "低库存预警", tableRowsForCsv(body.sections.low_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"]));
    appendCsvSection(lines, "备注", [["内容"], ...(body.notes || []).map((note) => [note])]);
    return lines.map((row) => row.map(csvCell).join(",")).join("\r\n");
  }

  function reportCenterExcel(body) {
    const summaryRows = [
      ["指标", "数值"],
      ["今日订单", body.summary.today_orders],
      ["本月订单", body.summary.month_orders],
      ["红灯订单", body.summary.red_orders],
      ["黄灯订单", body.summary.yellow_orders],
      ["绿灯订单", body.summary.green_orders],
      ["缺料订单", body.summary.shortage_orders],
      ["临期订单", body.summary.due_soon_orders],
      ["低库存", body.summary.low_stock],
      ["待响应风险", body.summary.pending_response_tasks || 0],
      ["已关闭风险", body.summary.closed_tasks ?? body.summary.responded_tasks ?? 0],
      ["今日处理", body.summary.today_interventions || 0],
      ["处理结果", body.summary.result_types || 0],
      ["闭环不完整", body.summary.incomplete_closures || 0],
      ["改进建议", body.summary.suggestions || 0],
      ["早会重点", body.summary.morning_brief_items || 0]
    ];
    const generatedAt = formatDateTime(body.generated_at);
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: "Microsoft YaHei", Arial, sans-serif; color: #172033; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    h2 { font-size: 15px; margin: 18px 0 6px; }
    .meta { color: #667085; margin-bottom: 14px; }
    table { border-collapse: collapse; margin-bottom: 14px; }
    th { background: #d9ead3; font-weight: 700; }
    th, td { border: 1px solid #9aa4b2; padding: 6px 8px; mso-number-format:"\\@"; }
    .danger { background: #fce4e4; }
    .warning { background: #fff2cc; }
  </style>
</head>
<body>
  <h1>蕴杰金属 PMC 日报</h1>
  <div class="meta">生成时间：${escapeHtml(generatedAt)}</div>
  ${excelTable("指标汇总", summaryRows)}
  ${excelTable("今日早会风险摘要", tableRowsForCsv(body.sections.morning_brief || [], ["priority_no", "risk_level", "headline", "related_no", "owner_role", "intervention_state", "response_sla", "escalation_state", "latest_intervention", "latest_actor", "next_action", "meeting_focus"]))}
  ${excelTable("风险闭环待办", tableRowsForCsv(body.sections.exception_tasks || [], ["task_no", "priority", "exception_type", "related_no", "item", "status", "response_sla", "latest_intervention"]))}
  ${excelTable("今日/最近处理", tableRowsForCsv(body.sections.intervention_actions || [], ["created_at", "risk_type", "related_no", "action_label", "intervention_state", "closure_quality", "closure_gap", "result_type", "promised_date", "next_owner", "note", "actor"]))}
  ${excelTable("处理结果汇总", tableRowsForCsv(body.sections.intervention_result_types || [], ["result_type", "actions"]))}
  ${excelTable("闭环质量汇总", tableRowsForCsv(body.sections.intervention_closure_quality || [], ["closure_quality", "actions"]))}
  ${excelTable("改进建议", tableRowsForCsv(body.sections.improvement_suggestions || [], ["result_type", "actions", "review_focus", "recommendation"]))}
  ${excelTable("订单状态样本", tableRowsForCsv(body.sections.order_rows, ["status_light", "order_no", "customer", "owner", "amount", "due_status", "shortage_status"]))}
  ${excelTable("低库存预警", tableRowsForCsv(body.sections.low_stock, ["product_code", "product_name", "warehouse", "available_qty", "stock_qty"]))}
  ${excelTable("备注", [["内容"], ...(body.notes || []).map((note) => [note])])}
</body>
</html>`;
  }

  function excelTable(title, rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    if (!safeRows.length) {
      return "";
    }
    return `<h2>${escapeHtml(title)}</h2><table>${safeRows.map((row, rowIndex) => {
      const tag = rowIndex === 0 ? "th" : "td";
      return `<tr>${row.map((cell) => `<${tag}>${escapeHtml(cell ?? "")}</${tag}>`).join("")}</tr>`;
    }).join("")}</table>`;
  }

  function appendCsvSection(lines, title, rows) {
    if (lines.length) {
      lines.push([]);
    }
    lines.push([title]);
    lines.push(...rows);
  }

  function tableRowsForCsv(rows, columns) {
    const safeRows = Array.isArray(rows) ? rows : [];
    return [
      columns.map(labelFor),
      ...safeRows.map((row) => columns.map((column) => row?.[column] ?? ""))
    ];
  }

  function csvCell(value) {
    const text = value === undefined || value === null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  return {
    interventionLogCsv,
    interventionLogPage,
    reportCenterCsv,
    reportCenterExcel,
    reportCenterPage,
    reportPrintPage
  };
}
