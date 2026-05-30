export function createHomePageRenderer({ escapeHtml, formatDateTime, host, latestPmcSnapshot, port, renderTopNav, sharedNavCss }) {
  function homePage() {
    const snapshot = latestPmcSnapshot();
    const summary = snapshot?.summary || {};
    const businessLinks = [
      ["PMC 驾驶舱", "/pmc", "老板、PMC、销售共用的一屏总览"],
      ["订单管理中心", "/orders", "订单作战清单、阻塞点、下一步动作"],
      ["物料采购中心", "/materials", "缺料、库存批次、采购跟催和供应商到货风险"],
      ["生产进度中心", "/production", "延期工序、工作中心负荷、BOM 数据"],
      ["车间电子看板", "/workshop-board", "轧制、冲压、钨钼三大工段当日计划、进度和异常预警"],
      ["应收应付中心", "/finance", "客户欠款、逾期应收、近期应付"]
    ];
    const outputLinks = [
      ["报表中心", "/reports", "订单、交期、缺料、库存和财务指标汇总"],
      ["报表导出", "/reports/export.csv", "导出 Excel 可打开的 PMC 指标 CSV"],
      ["Excel报表", "/reports/export.xls", "导出带格式的 PMC 日报 Excel 文件"],
      ["报表打印版", "/reports/print", "适合打印成 PDF 的 PMC 日报"],
      ["PMC 全功能路线", "/goal", "查看完整 PMC 平台实施目标和当前完成度"],
      ["数据源状态中心", "/system", "查看 ERP 连通性、本地快照、同步工具和系统状态"]
    ];
    const apiLinks = [
      ["健康检查", "/health", "确认本地中台是否正在运行"],
      ["ERP健康状态", "/api/erp_health", "只读本地状态，判断 ERP 请求是否熔断或异常"],
      ["全部视图", "/views", "查看可调用的 ERP 查询视图"],
      ["Agent 工具定义", "/agent/tool-schema", "给 OpenClaw 或 Hermes 注册工具时使用"],
      ["PMC 综合看板", "/api/pmc_dashboard?scan_pages=1&scan_size=20&contract_limit=3&alert_limit=10&low_stock_threshold=5&old_stock_days=180&due_soon_days=7", "库存、缺料、交期和生产风险汇总"],
      ["销售订单", "/api/sales_orders?pageindex=1&pagesize=10", "查询最近销售合同/订单"],
      ["订单缺料", "/api/order_shortages?pageindex=1&pagesize=10&contract_limit=3&scan_size=100", "扫描最近未发货订单缺料情况"],
      ["订单交期风险", "/api/order_delivery_risks?pageindex=1&pagesize=10&contract_limit=5&due_soon_days=7", "查看延期和 7 天内临期交付明细"],
      ["库存查询", "/api/inventory?pageindex=1&pagesize=20", "查询库存余额汇总"],
      ["库存异常", "/api/inventory_alerts?scan_pages=1&scan_size=20&alert_limit=10&low_stock_threshold=5&old_stock_days=180", "低库存、冻结库存、长库龄库存"]
    ];
    const metricRows = [
      ["今日订单", summary.today_orders ?? "--"],
      ["本月订单", summary.month_orders ?? "--"],
      ["逾期订单", summary.overdue_orders ?? "--"],
      ["7天内交期", summary.due_soon_orders ?? "--"],
      ["缺料订单", summary.shortage_orders ?? "--"],
      ["低库存", summary.low_stock ?? "--"]
    ];

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ERP 查询中台</title>
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
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 40px 0;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: flex-end;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
    }
    h1 {
      margin: 0;
      font-size: 32px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    p {
      margin: 8px 0 0;
      color: var(--muted);
      line-height: 1.6;
    }
    .status {
      flex: 0 0 auto;
      padding: 8px 12px;
      border-radius: 6px;
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 600;
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 10px;
      margin: 22px 0 18px;
    }
    .metric {
      min-height: 82px;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
    }
    .metric span {
      display: block;
      color: var(--muted);
      font-size: 13px;
    }
    .metric strong {
      display: block;
      margin-top: 8px;
      font-size: 24px;
      line-height: 1;
      overflow-wrap: anywhere;
    }
    h2 {
      margin: 24px 0 0;
      font-size: 18px;
      line-height: 1.3;
    }
    a.card {
      display: block;
      min-height: 116px;
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      color: inherit;
      text-decoration: none;
    }
    a.card:hover {
      border-color: var(--accent);
      box-shadow: 0 8px 24px rgba(23, 32, 51, 0.08);
    }
    .card strong {
      display: block;
      font-size: 17px;
      margin-bottom: 8px;
      overflow-wrap: anywhere;
    }
    code {
      display: block;
      margin-top: 12px;
      color: var(--muted);
      font-size: 12px;
      word-break: break-all;
    }
    @media (max-width: 720px) {
      main { width: min(100% - 24px, 1120px); padding: 24px 0; }
      header { display: block; }
      .status { display: inline-block; margin-top: 16px; }
      h1 { font-size: 26px; }
    }
    ${sharedNavCss()}
  </style>
</head>
<body>
  <main>
    ${renderTopNav("/")}
    <header>
      <div>
        <h1>ERP 查询中台</h1>
        <p>蕴杰金属数字 PMC 控制台，本地内网免登录版。优先打开图形化业务页面，API 入口放在底部。</p>
      </div>
      <div class="status">Running on ${escapeHtml(host)}:${escapeHtml(port)}</div>
    </header>
    <section class="metrics">
      ${metricRows.map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
    </section>
    ${snapshot ? `<p>最近快照：${escapeHtml(formatDateTime(snapshot.created_at))}。多数页面默认读取快照，点击刷新按钮时再实时扫描 ERP。</p>` : `<p>当前还没有本地快照，打开 PMC 驾驶舱后会自动生成。</p>`}
    ${homeSection("日常业务", businessLinks)}
    ${homeSection("管理输出", outputLinks)}
    ${homeSection("系统与 API", apiLinks)}
  </main>
</body>
</html>`;
  }

  function homeSection(title, links) {
    return `<h2>${escapeHtml(title)}</h2>
    <section class="grid">
      ${links
        .map(
          ([linkTitle, href, description]) => `<a class="card" href="${escapeHtml(href)}">
        <strong>${escapeHtml(linkTitle)}</strong>
        <span>${escapeHtml(description)}</span>
        <code>${escapeHtml(href)}</code>
      </a>`
        )
        .join("\n")}
    </section>`;
  }

  return { homePage };
}
