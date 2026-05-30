export function createApiResultPageRenderer({ escapeHtml, formatCell, labelFor, renderTopNav, sharedNavCss }) {
  function apiResultPage(payload, url) {
    const business = payload.business || {};
    const rows = getDisplayRows(business);
    const summary = getSummary(business);
    const columns = getDisplayColumns(rows);
    const title = viewTitle(payload.view);

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - ERP 查询中台</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #172033;
      --muted: #647083;
      --border: #d9dee7;
      --accent: #176b58;
      --accent-soft: #e8f3ef;
      --warning: #a25b00;
      --warning-soft: #fff5df;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    main { width: min(1280px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 40px; }
    .topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; }
    h1 { margin: 0; font-size: 28px; line-height: 1.25; letter-spacing: 0; }
    .meta { margin-top: 6px; color: var(--muted); font-size: 14px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .button { display: inline-flex; align-items: center; min-height: 36px; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--panel); color: var(--text); text-decoration: none; font-size: 14px; }
    .button.primary { background: var(--accent); border-color: var(--accent); color: #ffffff; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin: 18px 0; }
    .topbar > *, .summary > * { min-width: 0; }
    .metric { min-height: 82px; padding: 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
    .metric .label { color: var(--muted); font-size: 13px; }
    .metric .value { margin-top: 8px; font-size: 24px; line-height: 1; font-weight: 700; overflow-wrap: anywhere; }
    .table-wrap { max-width: 100%; overflow: auto; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
    table { width: 100%; border-collapse: collapse; min-width: 920px; }
    th, td { padding: 11px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; font-size: 14px; line-height: 1.45; }
    td { overflow-wrap: anywhere; word-break: break-word; }
    th { position: sticky; top: 0; z-index: 1; background: #f0f3f6; color: #334155; font-weight: 650; white-space: nowrap; }
    tr:hover td { background: #fbfcfd; }
    .empty { padding: 32px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); color: var(--muted); }
    .pill { display: inline-block; margin: 0 4px 4px 0; padding: 3px 7px; border-radius: 999px; background: var(--warning-soft); color: var(--warning); font-size: 12px; white-space: nowrap; }
    .notes { margin-top: 14px; color: var(--muted); font-size: 14px; line-height: 1.7; }
    @media (max-width: 760px) {
      main { width: min(100% - 24px, 1280px); padding-top: 20px; }
      .topbar { display: block; }
      .actions { justify-content: flex-start; margin-top: 14px; }
      h1 { font-size: 24px; }
    }
    ${sharedNavCss()}
  </style>
</head>
<body>
  <main>
    ${renderTopNav(url.pathname)}
    <div class="topbar">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">视图：${escapeHtml(payload.view)} · 数据行：${rows.length}</div>
      </div>
      <div class="actions">
        <a class="button" href="/">首页</a>
        <a class="button" href="/views">全部视图</a>
      </div>
    </div>
    ${renderSummary(summary)}
    ${renderTable(rows, columns)}
    ${renderNotes(business.notes)}
  </main>
</body>
</html>`;
  }

  function getDisplayRows(business) {
    if (Array.isArray(business.rows)) {
      return business.rows;
    }
    if (Array.isArray(business.lines)) {
      return business.lines;
    }
    if (business.sections && typeof business.sections === "object") {
      return Object.entries(business.sections).flatMap(([sectionName, section]) => {
        if (Array.isArray(section)) {
          return section.map((row) => ({ section: sectionName, ...row }));
        }
        if (Array.isArray(section?.rows)) {
          return section.rows.map((row) => ({ section: sectionName, ...row }));
        }
        return [];
      });
    }
    return [];
  }

  function getSummary(business) {
    if (business.summary && typeof business.summary === "object") {
      return business.summary;
    }
    if (business.counts && typeof business.counts === "object") {
      return business.counts;
    }
    if (business.page && typeof business.page === "object") {
      return business.page;
    }
    return {};
  }

  function getDisplayColumns(rows) {
    const preferred = [
      "section", "order_no", "project_no", "title", "customer", "owner", "product_name", "product_code",
      "product_model", "warehouse", "stock_qty", "available_qty", "shortage_qty", "risk_type", "days_from_today",
      "delivery_date", "signed_date", "created_date", "amount", "estimated_amount", "quoted_amount",
      "warehouse_status", "delivery_status", "payment_status", "approval_status", "risk_flags"
    ];
    const keys = new Set();
    for (const row of rows.slice(0, 50)) {
      for (const key of Object.keys(row || {})) {
        if (key !== "raw" && !key.endsWith("_rows") && !["contract", "counts", "lines"].includes(key)) {
          keys.add(key);
        }
      }
    }
    const ordered = preferred.filter((key) => keys.has(key));
    const rest = [...keys].filter((key) => !ordered.includes(key)).slice(0, 8);
    return [...ordered, ...rest].slice(0, 16);
  }

  function renderSummary(summary) {
    const entries = Object.entries(summary || {}).filter(([, value]) => typeof value !== "object").slice(0, 12);
    if (entries.length === 0) {
      return "";
    }
    return `<section class="summary">
      ${entries.map(([key, value]) => `<div class="metric"><div class="label">${escapeHtml(labelFor(key))}</div><div class="value">${escapeHtml(value)}</div></div>`).join("\n")}
    </section>`;
  }

  function renderTable(rows, columns) {
    if (!rows.length || !columns.length) {
      return `<div class="empty">当前查询没有返回可展示的数据行。</div>`;
    }
    return `<section class="table-wrap">
      <table>
        <thead><tr>${columns.map((column) => `<th>${escapeHtml(labelFor(column))}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${columns.map((column) => `<td>${formatCell(row?.[column])}</td>`).join("")}</tr>`).join("\n")}
        </tbody>
      </table>
    </section>`;
  }

  function renderNotes(notes) {
    if (!Array.isArray(notes) || notes.length === 0) {
      return "";
    }
    return `<section class="notes">${notes.map((note) => `<div>${escapeHtml(note)}</div>`).join("")}</section>`;
  }

  function viewTitle(viewName) {
    const names = {
      sales_orders: "销售订单",
      procedure_plans: "派工/工序",
      matched_orders: "已关联订单",
      manual_matched_orders: "人工绑定",
      exact_matched_orders: "精确匹配",
      assisted_matched_orders: "辅助匹配",
      sales_orders_without_procedure: "无派工订单",
      unmatched_procedure_plans: "未关联派工",
      match_rate: "匹配率",
      reason: "原因",
      contract_detail: "销售合同详情",
      contract_lines: "销售合同明细",
      contract_shortages: "合同缺料分析",
      order_shortages: "订单缺料扫描",
      order_delivery_risks: "订单交期风险",
      order_detail: "订单穿透详情",
      projects: "项目/商机",
      pending_quotes: "待报价项目",
      inventory: "库存查询",
      inventory_details: "库存明细",
      inventory_alerts: "库存异常",
      pmc_dashboard: "PMC 综合看板",
      pmc_console: "PMC 驾驶舱首页",
      order_center: "订单管理中心",
      warehouses: "仓库列表",
      products: "产品列表",
      stock_in_records: "入库流水",
      stock_in_details: "入库产品明细",
      receivables: "应收/收款",
      payables: "应付/付款"
    };
    return names[viewName] || viewName;
  }

  return { apiResultPage };
}
