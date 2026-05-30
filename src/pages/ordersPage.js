export function createOrdersPageRenderers({
  escapeHtml,
  formatDetailCell,
  formatNumber,
  labelFor,
  renderTopNav,
  sharedNavCss
}) {
  function orderCenterPage(body) {
    const current = body.scan || {};
    const queryBase = new URLSearchParams();
    if (current.searchKey) {
      queryBase.set("searchKey", current.searchKey);
    }
    queryBase.set("pageindex", String(current.pageindex || 1));
    queryBase.set("pagesize", String(current.pagesize || 100));
    queryBase.set("contract_limit", String(current.contract_limit || 20));
    queryBase.set("due_soon_days", String(current.due_soon_days || 7));
    queryBase.set("scan_size", String(current.scan_size || 100));
    if (current.status) {
      queryBase.set("status", current.status);
    }

    const statusLinks = [
      ["全部", ""],
      ["红灯", "red"],
      ["黄灯", "yellow"],
      ["绿灯", "green"]
    ];
    const statusNav = statusLinks
      .map(([label, status]) => {
        const next = new URLSearchParams(queryBase);
        next.set("pageindex", "1");
        if (status) {
          next.set("status", status);
        } else {
          next.delete("status");
        }
        const active = (current.status || "") === status ? " active" : "";
        return `<a class="filter${active}" href="/orders?${escapeHtml(next.toString())}">${escapeHtml(label)}</a>`;
      })
      .join("");

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>订单管理中心 - 蕴杰金属数字 PMC 控制台</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f6f8;
      --panel: #ffffff;
      --text: #172033;
      --muted: #667085;
      --border: #d9dee7;
      --green: #16803c;
      --green-soft: #e8f5eb;
      --amber: #a15c00;
      --amber-soft: #fff3d8;
      --red: #b42318;
      --red-soft: #fee4e2;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    main { width: min(1440px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 36px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 18px; border-bottom: 1px solid var(--border); }
    h1 { margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: 0; }
    .sub { margin-top: 8px; color: var(--muted); font-size: 14px; }
    .actions, .filters { display: flex; gap: 8px; flex-wrap: wrap; }
    .actions { justify-content: flex-end; }
    .button, .filter { min-height: 36px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); text-decoration: none; font-size: 14px; }
    .button.primary, .filter.active { background: #176b58; border-color: #176b58; color: #ffffff; }
    .toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: flex-end; margin: 18px 0; }
    header > *, .toolbar > *, .metrics > * { min-width: 0; }
    form { display: flex; gap: 8px; flex-wrap: wrap; }
    input { min-height: 36px; width: 280px; max-width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; }
    .pager { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin: 0 0 14px; color: var(--muted); font-size: 13px; }
    .pager strong { color: var(--text); }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 14px; }
    .metric { padding: 13px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
    .metric span { display: block; color: var(--muted); font-size: 13px; }
    .metric strong { display: block; margin-top: 8px; font-size: 24px; line-height: 1; overflow-wrap: anywhere; }
    .table-wrap { max-width: 100%; overflow: auto; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
    table { width: 100%; min-width: 1180px; border-collapse: collapse; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; font-size: 13px; line-height: 1.45; }
    td { overflow-wrap: break-word; word-break: normal; }
    th { position: sticky; top: 0; z-index: 1; background: #f0f3f6; color: #344054; font-weight: 650; white-space: nowrap; }
    .amount-cell { min-width: 118px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .date-cell, .days-cell { min-width: 86px; white-space: nowrap; }
    .days-cell { text-align: right; font-variant-numeric: tabular-nums; }
    .light { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-weight: 650; }
    .dot { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
    .dot.red { background: var(--red); }
    .dot.yellow { background: #f4a000; }
    .dot.green { background: var(--green); }
    .pill { display: inline-block; margin: 0 4px 4px 0; padding: 3px 7px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
    .pill.red { background: var(--red-soft); color: var(--red); }
    .pill.yellow { background: var(--amber-soft); color: var(--amber); }
    .pill.green { background: var(--green-soft); color: var(--green); }
    .order-link { color: #176b58; font-weight: 650; text-decoration: none; }
    .order-link:hover { text-decoration: underline; }
    .orders-mobile-list { display: none; }
    .order-mobile-card { padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
    .order-mobile-card.red { border-color: #f2a7a3; background: var(--red-soft); }
    .order-mobile-card.yellow { border-color: #f3c77b; background: var(--amber-soft); }
    .order-mobile-card.green { border-color: #b7dfc8; background: var(--green-soft); }
    .order-mobile-top { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
    .order-mobile-no { color: #176b58; font-size: 15px; line-height: 1.35; font-weight: 750; text-decoration: none; overflow-wrap: anywhere; }
    .order-mobile-meta { margin-top: 5px; color: var(--muted); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
    .order-mobile-problem { margin-top: 8px; font-size: 13px; line-height: 1.55; }
    .order-mobile-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
    .order-mobile-field { padding: 8px; border: 1px solid rgba(23, 32, 51, .08); border-radius: 6px; background: rgba(255,255,255,.72); }
    .order-mobile-field span { display: block; color: var(--muted); font-size: 11.5px; line-height: 1.35; }
    .order-mobile-field strong { display: block; margin-top: 3px; font-size: 13px; line-height: 1.35; overflow-wrap: anywhere; }
    .notes { margin-top: 12px; color: var(--muted); font-size: 13px; line-height: 1.7; }
    @media (max-width: 880px) {
      header, .toolbar { display: block; }
      .actions, .filters { margin-top: 12px; justify-content: flex-start; }
      h1 { font-size: 24px; }
    }
    @media (max-width: 720px) {
      main { width: min(100% - 20px, 1440px); padding: 14px 0 28px; }
      .actions { display: flex; flex-wrap: nowrap; justify-content: flex-start; overflow-x: auto; gap: 8px; padding-bottom: 2px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
      .actions::-webkit-scrollbar { display: none; }
      .actions .button { flex: 0 0 auto; }
      .button, .filter { min-height: 44px; padding: 9px 10px; white-space: nowrap; }
      form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
      input { width: 100%; min-height: 44px; }
      .filters { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 2px; }
      .filter { flex: 0 0 auto; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .metric { padding: 10px; }
      .metric strong { font-size: 22px; }
      .pager .actions { width: 100%; }
      .orders-mobile-list { display: grid; gap: 8px; }
      .orders-desktop-table { display: none; }
    }
    ${sharedNavCss()}
  </style>
</head>
<body>
  <main>
    ${renderTopNav("/orders")}
    <header>
      <div>
        <h1>订单管理中心</h1>
        <div class="sub">按销售订单产品库存口径聚合缺料，按合同明细交期识别逾期和临期。</div>
      </div>
      <div class="actions">
        <form class="inline-post" method="post" action="/sync"><input type="hidden" name="sources" value="sales_orders"><input type="hidden" name="pagesize" value="20"><button class="button" type="submit">谨慎同步订单20条</button></form>
        <a class="button" href="/orders?refresh=1">刷新实时订单</a>
      </div>
    </header>
    <section class="toolbar">
      <form action="/orders" method="GET">
        <input name="searchKey" value="${escapeHtml(current.searchKey || "")}" placeholder="搜索订单号、客户、标题">
        <input type="hidden" name="pageindex" value="1">
        <input type="hidden" name="pagesize" value="${escapeHtml(current.pagesize || 100)}">
        <input type="hidden" name="contract_limit" value="${escapeHtml(current.contract_limit || 20)}">
        <input type="hidden" name="due_soon_days" value="${escapeHtml(current.due_soon_days || 7)}">
        <input type="hidden" name="scan_size" value="${escapeHtml(current.scan_size || 100)}">
        ${current.status ? `<input type="hidden" name="status" value="${escapeHtml(current.status)}">` : ""}
        <button class="button primary" type="submit">查询</button>
      </form>
      <div class="filters">${statusNav}</div>
    </section>
    <section class="metrics">
      ${orderMetric("SQLite订单总数", body.pagination?.total_sqlite_rows ?? body.summary.total_rows)}
      ${orderMetric("筛选总数", body.summary.visible_rows)}
      ${orderMetric("本页行数", body.pagination?.page_rows ?? body.rows.length)}
      ${orderMetric("红灯订单", body.summary.red_orders)}
      ${orderMetric("黄灯订单", body.summary.yellow_orders)}
      ${orderMetric("绿灯订单", body.summary.green_orders)}
      ${orderMetric("缺料订单", body.summary.shortage_orders)}
      ${orderMetric("阻塞订单", body.summary.blocked_orders)}
      ${orderMetric("临期订单", body.summary.due_soon_orders)}
    </section>
    ${orderPaginationHtml(body.pagination, queryBase)}
    ${orderMobileCardsHtml(body.rows)}
    <section class="table-wrap orders-desktop-table">
      <table>
        <thead>
          <tr>
            <th>状态灯</th><th>优先级</th><th>订单号</th><th>客户</th><th>负责人</th><th class="date-cell">交期</th><th class="days-cell">距今天数</th><th>阻塞点</th><th>下一步动作</th><th>责任角色</th><th>交期状态</th><th>缺料状态</th><th>相关产品</th><th class="amount-cell">金额</th><th>审批</th>
          </tr>
        </thead>
        <tbody>
          ${body.rows.map(orderCenterRowHtml).join("")}
        </tbody>
      </table>
    </section>
    <section class="notes">${(body.notes || []).map((note) => `<div>${escapeHtml(note)}</div>`).join("")}</section>
  </main>
</body>
</html>`;
  }

  function orderMetric(label, value) {
    return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function orderPaginationHtml(pagination, queryBase) {
    if (!pagination) {
      return "";
    }
    const pageIndex = pagination.page_index || 1;
    const totalPages = pagination.total_pages || 1;
    const previous = new URLSearchParams(queryBase);
    previous.set("pageindex", String(Math.max(1, pageIndex - 1)));
    const next = new URLSearchParams(queryBase);
    next.set("pageindex", String(Math.min(totalPages, pageIndex + 1)));
    const pageSize100 = new URLSearchParams(queryBase);
    pageSize100.set("pageindex", "1");
    pageSize100.set("pagesize", "100");
    const pageSize20 = new URLSearchParams(queryBase);
    pageSize20.set("pageindex", "1");
    pageSize20.set("pagesize", "20");
    return `<section class="pager">
      <div>当前第 <strong>${escapeHtml(pageIndex)}</strong> / <strong>${escapeHtml(totalPages)}</strong> 页，每页 <strong>${escapeHtml(pagination.page_size)}</strong> 条；SQLite 共 <strong>${escapeHtml(pagination.total_sqlite_rows)}</strong> 条，筛选后 <strong>${escapeHtml(pagination.filtered_rows)}</strong> 条。</div>
      <div class="actions">
        <a class="button" href="/orders?${escapeHtml(previous.toString())}">上一页</a>
        <a class="button" href="/orders?${escapeHtml(next.toString())}">下一页</a>
        <a class="button" href="/orders?${escapeHtml(pageSize100.toString())}">每页100条</a>
        <a class="button" href="/orders?${escapeHtml(pageSize20.toString())}">每页20条</a>
      </div>
    </section>`;
  }

  function orderCenterRowHtml(row) {
    const tone = row.status_code === "red" ? "red" : row.status_code === "yellow" ? "yellow" : "green";
    const orderLink = row.erp_id
      ? `<a class="order-link" href="/order?ord=${encodeURIComponent(row.erp_id)}">${escapeHtml(row.order_no)}</a>`
      : escapeHtml(row.order_no);
    return `<tr>
      <td><span class="light"><span class="dot ${tone}"></span>${escapeHtml(row.status_text)}</span></td>
      <td><span class="pill ${tone}">${escapeHtml(row.priority || "")}</span></td>
      <td>${orderLink}</td>
      <td>${escapeHtml(row.customer)}</td>
      <td>${escapeHtml(row.owner)}</td>
      <td class="date-cell">${escapeHtml(row.delivery_date || "")}</td>
      <td class="days-cell">${escapeHtml(row.days_from_today ?? "")}</td>
      <td>${escapeHtml(row.blocker || "")}</td>
      <td>${escapeHtml(row.next_action || "")}</td>
      <td>${escapeHtml(row.responsible_role || "")}</td>
      <td><span class="pill ${row.due_status === "逾期" ? "red" : row.due_status === "7天内到期" ? "yellow" : "green"}">${escapeHtml(row.due_status)}</span></td>
      <td><span class="pill ${row.shortage_status === "缺料" ? "red" : "green"}">${escapeHtml(row.shortage_status)}</span></td>
      <td>${(row.risk_products || []).map((item) => `<span class="pill ${tone}">${escapeHtml(item)}</span>`).join("")}</td>
      <td class="amount-cell">${escapeHtml(row.amount ?? "")}</td>
      <td>${escapeHtml(row.approval_status ?? "")}</td>
    </tr>`;
  }

  function orderMobileCardsHtml(rows = []) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return `<section class="orders-mobile-list"><div class="order-mobile-card"><div class="order-mobile-no">当前没有订单</div></div></section>`;
    }
    return `<section class="orders-mobile-list" aria-label="订单手机卡片">${rows.map(orderMobileCardHtml).join("")}</section>`;
  }

  function orderMobileCardHtml(row) {
    const tone = row.status_code === "red" ? "red" : row.status_code === "yellow" ? "yellow" : "green";
    const orderContent = escapeHtml(row.order_no || "");
    const orderNo = row.erp_id
      ? `<a class="order-mobile-no" href="/order?ord=${encodeURIComponent(row.erp_id)}">${orderContent}</a>`
      : `<div class="order-mobile-no">${orderContent}</div>`;
    const products = Array.isArray(row.risk_products) ? row.risk_products.join("、") : "";
    return `<article class="order-mobile-card ${escapeHtml(tone)}">
      <div class="order-mobile-top">
        ${orderNo}
        <span class="pill ${escapeHtml(tone)}">${escapeHtml(row.priority || row.status_text || "")}</span>
      </div>
      <div class="order-mobile-meta">${escapeHtml(row.customer || "")} · ${escapeHtml(row.owner || "负责人待确认")} · ${escapeHtml(row.delivery_date || "无交期")}</div>
      <div class="order-mobile-problem">${escapeHtml(row.blocker || row.next_action || "暂无阻塞点")}</div>
      <div class="order-mobile-fields">
        <div class="order-mobile-field"><span>距今天数</span><strong>${escapeHtml(row.days_from_today ?? "")}</strong></div>
        <div class="order-mobile-field"><span>金额</span><strong>${escapeHtml(row.amount ?? "")}</strong></div>
        <div class="order-mobile-field"><span>交期状态</span><strong>${escapeHtml(row.due_status || "")}</strong></div>
        <div class="order-mobile-field"><span>缺料状态</span><strong>${escapeHtml(row.shortage_status || "")}</strong></div>
      </div>
      <div class="order-mobile-meta">${escapeHtml(row.responsible_role || "")}${products ? ` · ${escapeHtml(products)}` : ""}</div>
      <div class="order-mobile-problem">${escapeHtml(row.next_action || "")}</div>
    </article>`;
  }

  function orderDetailPage(body) {
    const contract = body.contract || {};
    const title = contract.order_no || `合同 ${body.scan?.ord || ""}`;
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - 订单详情</title>
  <style>
    :root { color-scheme: light; --bg: #f4f6f8; --panel: #ffffff; --text: #172033; --muted: #667085; --border: #d9dee7; --green: #176b58; --green-soft: #e8f3ef; --amber: #a15c00; --amber-soft: #fff3d8; --red: #b42318; --red-soft: #fee4e2; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    main { width: min(1440px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 36px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 18px; border-bottom: 1px solid var(--border); }
    h1 { margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: 0; }
    h2 { margin: 0; padding: 14px 16px; border-bottom: 1px solid var(--border); font-size: 17px; letter-spacing: 0; }
    .sub { margin-top: 8px; color: var(--muted); font-size: 14px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .button { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); text-decoration: none; font-size: 14px; line-height: 1.2; white-space: nowrap; }
    .button.primary { background: var(--green); border-color: var(--green); color: #ffffff; }
    .action-buttons { display: flex; flex-wrap: wrap; gap: 6px; min-width: 180px; align-items: flex-start; }
    .action-buttons .button { min-height: 32px; padding: 6px 10px; font-size: 13px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin: 18px 0; }
    .metric, .info { padding: 13px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
    .metric span, .info span { display: block; color: var(--muted); font-size: 13px; }
    .metric strong, .info strong { display: block; margin-top: 8px; font-size: 23px; line-height: 1.15; overflow-wrap: anywhere; }
    .info strong { font-size: 15px; font-weight: 650; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
    header > *, .summary > *, .grid > * { min-width: 0; }
    .panel { margin-top: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); overflow: hidden; }
    .table-wrap { max-width: 100%; overflow: auto; }
    table { width: 100%; min-width: 980px; border-collapse: collapse; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; font-size: 13px; line-height: 1.45; }
    td { overflow-wrap: anywhere; word-break: break-word; }
    th { background: #f0f3f6; color: #344054; font-weight: 650; white-space: nowrap; }
    tr:last-child td { border-bottom: 0; }
    .pill { display: inline-block; padding: 3px 7px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
    .pill.red { background: var(--red-soft); color: var(--red); }
    .pill.yellow { background: var(--amber-soft); color: var(--amber); }
    .pill.green { background: var(--green-soft); color: var(--green); }
    .empty { padding: 20px 16px; color: var(--muted); font-size: 14px; }
    .notes { margin-top: 12px; color: var(--muted); font-size: 13px; line-height: 1.7; }
    @media (max-width: 900px) { header { display: block; } .actions { justify-content: flex-start; margin-top: 14px; } .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } h1 { font-size: 24px; } }
    @media (max-width: 720px) {
      .actions { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 2px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
      .actions::-webkit-scrollbar { display: none; }
      .actions .button { flex: 0 0 auto; }
      .button { min-height: 44px; padding: 9px 10px; white-space: nowrap; }
    }
    @media (max-width: 560px) { main { width: min(100% - 24px, 1440px); } .grid { grid-template-columns: 1fr; } }
    ${sharedNavCss()}
  </style>
</head>
<body>
  <main>
    ${renderTopNav("/orders")}
    <header>
      <div>
        <h1>${escapeHtml(title)}</h1>
        <div class="sub">订单穿透详情 · 合同 ord ${escapeHtml(body.scan?.ord || "")}</div>
      </div>
      <div class="actions">
      </div>
    </header>
    <section class="summary">
      ${orderMetric("产品明细", body.summary.lines)}
      ${orderMetric("交期风险", body.summary.delivery_risks)}
      ${orderMetric("缺料明细", body.summary.shortage_rows)}
      ${orderMetric("缺口合计", formatNumber(body.summary.shortage_qty))}
    </section>
    <section class="grid">
      ${orderInfo("客户", contract.customer)}
      ${orderInfo("负责人", contract.owner)}
      ${orderInfo("PO编号", contract.po_no || "未识别")}
      ${orderInfo("签订日期", contract.signed_date)}
      ${orderInfo("合同金额", formatNumber(contract.amount))}
      ${orderInfo("收款金额", formatNumber(contract.received_amount))}
      ${orderInfo("审批状态", contract.approval_status)}
      ${orderInfo("发货状态", contract.delivery_status)}
    </section>
    ${detailTablePanel("产品明细", body.rows, ["product_name", "product_code", "product_model", "unit", "demand_qty", "delivered_qty", "remaining_qty", "delivery_date"])}
    ${detailTablePanel("交期风险", body.sections.delivery_risks, ["risk_type", "days_from_today", "product_name", "product_code", "remaining_qty", "delivery_date"], true)}
    ${detailTablePanel("缺料分析", body.sections.shortage_rows, ["product_name", "product_code", "product_model", "demand_qty", "available_qty", "stock_qty", "shortage_qty", "matched_by"], true)}
    <section class="notes">${body.notes.map((note) => `<div>${escapeHtml(note)}</div>`).join("")}</section>
  </main>
</body>
</html>`;
  }

  function orderInfo(label, value) {
    return `<div class="info"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "")}</strong></div>`;
  }

  function detailTablePanel(title, rows, columns, compact = false) {
    const safeRows = Array.isArray(rows) ? rows : [];
    return `<section class="panel">
      <h2>${escapeHtml(title)} <span class="pill ${safeRows.length ? "yellow" : "green"}">${safeRows.length}</span></h2>
      ${
        safeRows.length
          ? `<div class="table-wrap"><table${compact ? ' style="min-width:820px"' : ""}><thead><tr>${columns.map((column) => `<th>${escapeHtml(labelFor(column))}</th>`).join("")}</tr></thead><tbody>${safeRows.map((row) => `<tr>${columns.map((column) => `<td>${formatDetailCell(column, row?.[column], row)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
          : `<div class="empty">当前没有${escapeHtml(title)}。</div>`
      }
    </section>`;
  }

  return {
    orderCenterPage,
    orderDetailPage
  };
}
