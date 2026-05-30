const NAV_ITEMS = [
  ["首页", "/"],
  ["PMC", "/pmc"],
  ["订单", "/orders"],
  ["生产", "/production"],
  ["车间看板", "/workshop-board"],
  ["物料采购", "/materials"],
  ["财务", "/finance"],
  ["系统", "/system"],
  ["退出登录", "/logout"]
];

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const MUTATING_HREF_PATHS = new Set([
  "/pmc/intervention/save",
  "/procedure-links/save",
  "/user-roles/save",
  "/user-roles/reset-password",
  "/user-roles/delete",
  "/history-sync/window/run",
  "/history-sync/run",
  "/api/history_sync/run",
  "/api/history_sync/window/run",
  "/sync",
  "/api/sync",
  "/sync-pause"
]);

export function isMutatingHref(href = "") {
  try {
    const url = new URL(String(href || ""), "http://local");
    return MUTATING_HREF_PATHS.has(url.pathname);
  } catch {
    return false;
  }
}

export function renderPostButtonFromHref(label, href, className = "button primary") {
  const text = label || "执行";
  try {
    const url = new URL(String(href || ""), "http://local");
    const hiddenInputs = [...url.searchParams.entries()]
      .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`)
      .join("");
    return `<form class="inline-post" method="post" action="${escapeHtml(url.pathname)}">${hiddenInputs}<button class="${escapeHtml(className)}" type="submit">${escapeHtml(text)}</button></form>`;
  } catch {
    return "";
  }
}

export function createHtmlRenderers({ labelFor, formatDetailCell, clampInt }) {
  function sharedNavCss() {
    return `
      .global-nav {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        align-items: center;
        margin: 0 0 18px;
        padding: 10px;
        border: 1px solid var(--border, #d9dee7);
        border-radius: 8px;
        background: var(--panel, #ffffff);
      }
      .global-nav a {
        min-height: 32px;
        padding: 7px 10px;
        border-radius: 6px;
        color: var(--text, #172033);
        text-decoration: none;
        font-size: 13px;
        line-height: 1.2;
        white-space: nowrap;
      }
      .global-nav a:hover {
        background: #eef2f6;
      }
      .global-nav a.active {
        background: var(--accent, var(--green, #176b58));
        color: #ffffff;
        font-weight: 650;
      }
      .inline-post {
        display: inline-flex;
        margin: 0;
      }
      button.button {
        font-family: inherit;
        cursor: pointer;
      }
      .mobile-only {
        display: none;
      }
      @media (max-width: 720px) {
        .global-nav {
          flex-wrap: nowrap;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          -webkit-overflow-scrolling: touch;
          margin-bottom: 12px;
          padding: 8px;
          scrollbar-width: none;
        }
        .global-nav::-webkit-scrollbar {
          display: none;
        }
        .global-nav a {
          display: inline-flex;
          flex: 0 0 auto;
          align-items: center;
          min-height: 44px;
          padding: 10px 13px;
          font-size: 14px;
        }
        .mobile-only {
          display: block;
        }
        .desktop-only {
          display: none;
        }
      }
      @media print {
        .global-nav { display: none; }
      }`;
  }

  function renderTopNav(activePath = "") {
    const normalized = normalizeNavPath(activePath);
    return `<nav class="global-nav" aria-label="主导航">${NAV_ITEMS.map(([label, href]) => {
      const active = normalizeNavPath(href) === normalized ? " active" : "";
      return `<a class="${active.trim()}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
    }).join("")}</nav>`;
  }

  function normalizeNavPath(value) {
    const path = String(value || "/").split("?")[0] || "/";
    if (path === "/order") return "/orders";
    if (path === "/foreign-trade") return "/orders";
    if (path === "/procurement") return "/materials";
    if (path === "/dispatch" || path === "/scheduling" || path === "/procedure-links") return "/production";
    if (path === "/reports" || path.startsWith("/reports/") || path === "/followup" || path.startsWith("/followup") || path === "/interventions") return "/pmc";
    if (path === "/roles" || path === "/sqlite-coverage" || path.startsWith("/history-sync") || path === "/erp-logs" || path === "/user-roles") return "/system";
    if (path.startsWith("/workshop-board/")) return "/workshop-board";
    return path;
  }

  function modulePathForTitle(title) {
    const text = String(title || "");
    if (text.includes("角色")) return "/roles";
    if (text.includes("跟单")) return "/followup";
    if (text.includes("外贸")) return "/foreign-trade";
    if (text.includes("物料")) return "/materials";
    if (text.includes("待报价")) return "/pmc";
    if (text.includes("采购")) return "/materials";
    if (text.includes("应收应付")) return "/finance";
    if (text.includes("排产")) return "/scheduling";
    if (text.includes("车间") || text.includes("看板") || text.includes("大屏") || text.includes("工位")) return "/workshop-board";
    if (text.includes("生产")) return "/production";
    if (text.includes("派工")) return "/dispatch";
    if (text.includes("异常")) return "/pmc";
    if (text.includes("干预")) return "/system";
    if (text.includes("报表")) return "/reports";
    if (text.includes("数据源")) return "/system";
    if (text.includes("SQLite")) return "/system";
    if (text.includes("历史同步")) return "/system";
    if (text.includes("同步")) return "/system";
    if (text.includes("ERP 请求日志")) return "/system";
    if (text.includes("全功能")) return "/goal";
    return "/";
  }

  function modulePage({ title, subtitle, summary = [], panels = [], notes = [], actions = [], afterMain = "", pageClass = "" }) {
    const visibleActions = actions.filter((action) => {
      const label = Array.isArray(action) ? action[0] : action?.label;
      return !/JSON|Jason/i.test(String(label || ""));
    });
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - 蕴杰金属数字 PMC 控制台</title>
  <style>
    :root { color-scheme: light; --bg: #f4f6f8; --panel: #ffffff; --text: #172033; --muted: #667085; --border: #d9dee7; --green: #176b58; --green-soft: #e8f3ef; --amber: #a15c00; --amber-soft: #fff3d8; --red: #b42318; --red-soft: #fee4e2; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    main { width: min(1440px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 36px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 18px; border-bottom: 1px solid var(--border); }
    h1 { margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: 0; }
    h2 { margin: 0; padding: 14px 16px; border-bottom: 1px solid var(--border); font-size: 17px; letter-spacing: 0; }
    .sub { margin-top: 8px; color: var(--muted); font-size: 14px; line-height: 1.6; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .button { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); text-decoration: none; font-size: 14px; line-height: 1.2; white-space: nowrap; }
    .button.primary { background: var(--green); border-color: var(--green); color: #ffffff; }
      .action-buttons { display: flex; flex-wrap: wrap; gap: 6px; min-width: 180px; align-items: flex-start; }
      .action-buttons .button { min-height: 32px; padding: 6px 10px; font-size: 13px; }
      .inline-post { display: inline-flex; margin: 0; }
      button.button { font-family: inherit; cursor: pointer; }
      .button.disabled { color: var(--muted); background: #f8fafc; pointer-events: none; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 18px 0; }
    .metric { min-height: 92px; padding: 13px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
    a.metric { color: inherit; text-decoration: none; transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease; }
    a.metric:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(23, 32, 51, .08); border-color: #98a2b3; }
    .metric span { display: block; color: var(--muted); font-size: 13px; }
    .metric strong { display: block; margin-top: 9px; font-size: 25px; line-height: 1; overflow-wrap: anywhere; }
    .metric.metric-money strong, .metric.metric-count strong { font-variant-numeric: tabular-nums; white-space: nowrap; overflow-wrap: normal; word-break: keep-all; }
    .metric.metric-danger { border-color: #fda29b; background: var(--red-soft); }
    .metric.metric-warning { border-color: #f4c46b; background: var(--amber-soft); }
    .metric.metric-ok { border-color: #a6d8c7; background: var(--green-soft); }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
    header > *, .summary > *, .grid > * { min-width: 0; }
    .panel { border: 1px solid var(--border); border-radius: 8px; background: var(--panel); overflow: hidden; }
    .panel.full-width, .panel.auto-wide { grid-column: 1 / -1; }
    .panel.full-width table, .panel.auto-wide table { min-width: 1280px; }
    .table-wrap { max-width: 100%; overflow: auto; }
    .table-wrap.tall { max-height: 620px; }
    .mobile-record-list { display: none; }
    .workshop-tablet-list { display: none; }
    .workshop-tablet-card { display: grid; gap: 8px; padding: 12px; border-bottom: 1px solid var(--border); background: #fff; }
    .workshop-tablet-card.row-danger { background: var(--red-soft); }
    .workshop-tablet-card.row-warning { background: var(--amber-soft); }
    .workshop-tablet-card.row-ok { background: var(--green-soft); }
    .workshop-tablet-title { font-size: 15px; line-height: 1.35; font-weight: 750; overflow-wrap: anywhere; }
    .workshop-tablet-meta { color: var(--muted); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
    .workshop-tablet-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 10px; }
    .workshop-tablet-field { display: grid; gap: 3px; min-width: 0; }
    .workshop-tablet-label { color: var(--muted); font-size: 12px; line-height: 1.35; }
    .workshop-tablet-value { font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
    .workshop-nowrap { white-space: nowrap; overflow-wrap: normal; word-break: keep-all; }
    .ai-chat { margin: 14px 0 0; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); overflow: hidden; }
    .ai-chat-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding: 14px 16px; border-bottom: 1px solid var(--border); }
    .ai-chat h2 { margin: 0; padding: 0; border-bottom: 0; font-size: 17px; letter-spacing: 0; }
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
    .mobile-record-primary, .mobile-record-extra { display: grid; gap: 8px; }
    .mobile-record-card { padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: #fff; }
    .mobile-record-title { font-size: 15px; line-height: 1.35; font-weight: 750; overflow-wrap: anywhere; }
    .mobile-record-meta { margin-top: 5px; color: var(--muted); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
    .mobile-record-fields { display: grid; gap: 7px; margin-top: 10px; }
    .mobile-record-field { display: grid; grid-template-columns: minmax(72px, .42fr) minmax(0, 1fr); gap: 8px; align-items: start; }
    .mobile-record-label { color: var(--muted); font-size: 12px; line-height: 1.45; }
    .mobile-record-value { font-size: 13px; line-height: 1.45; overflow-wrap: anywhere; }
    table { width: 100%; min-width: 820px; border-collapse: collapse; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; font-size: 13px; line-height: 1.45; }
    td { overflow-wrap: anywhere; word-break: break-word; }
    th { background: #f0f3f6; color: #344054; font-weight: 650; white-space: nowrap; }
    tr:last-child td { border-bottom: 0; }
    .empty { padding: 20px 16px; color: var(--muted); font-size: 14px; }
    .notes { margin-top: 12px; color: var(--muted); font-size: 13px; line-height: 1.7; }
    .pill { display: inline-block; padding: 3px 7px; border-radius: 999px; background: var(--green-soft); color: var(--green); font-size: 12px; white-space: nowrap; }
    .pill.red { background: var(--red-soft); color: var(--red); }
    .pill.yellow { background: var(--amber-soft); color: var(--amber); }
    .pill.green { background: var(--green-soft); color: var(--green); }
    .pill.gray { background: #eef2f6; color: #475467; }
    .money-cell { display: inline-block; min-width: 96px; text-align: right; white-space: nowrap; overflow-wrap: normal; word-break: keep-all; font-variant-numeric: tabular-nums; font-weight: 650; }
    .due-days-pill { font-variant-numeric: tabular-nums; }
    .timeline { min-width: 820px; padding: 14px 16px 18px; }
    .timeline-scale { position: relative; height: 24px; margin-left: 220px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: 12px; }
    .timeline-scale span { position: absolute; top: 0; transform: translateX(-50%); white-space: nowrap; }
    .timeline-row { display: grid; grid-template-columns: 210px 1fr; gap: 10px; min-height: 54px; align-items: center; border-bottom: 1px solid var(--border); }
    .timeline-row:last-child { border-bottom: 0; }
    .timeline-label strong { display: block; font-size: 13px; }
    .timeline-label span { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    .timeline-track { position: relative; height: 18px; border-radius: 999px; background: #eef2f6; }
    .timeline-dot { position: absolute; top: 50%; width: 14px; height: 14px; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 0 3px #ffffff; }
    .timeline-dot.red { background: var(--red); }
    .timeline-dot.yellow { background: #f4a000; }
    .timeline-dot.green { background: var(--green); }
    .timeline-text { position: absolute; top: 22px; color: var(--muted); font-size: 12px; white-space: nowrap; }
    .workshop-section-metrics { grid-template-columns: repeat(8, minmax(0, 1fr)); }
    .workshop-section-metrics .metric { min-width: 0; min-height: 84px; padding: 10px; }
    .workshop-section-metrics .metric span { font-size: 12px; }
    .workshop-section-metrics .metric strong { font-size: clamp(20px, 1.7vw, 24px); overflow-wrap: normal; word-break: keep-all; white-space: nowrap; }
    .panel.full-width .workshop-fit-table table { min-width: 100%; }
    body.finance-page main { width: min(1500px, calc(100% - 32px)); }
    body.finance-page .summary { grid-template-columns: repeat(2, minmax(120px, .8fr)) repeat(2, minmax(210px, 1.3fr)) repeat(3, minmax(135px, .85fr)); }
    body.finance-page .metric { min-height: 88px; border-left-width: 4px; }
    body.finance-page .metric strong { font-size: clamp(20px, 1.7vw, 26px); white-space: nowrap; overflow-wrap: normal; word-break: keep-all; }
    body.finance-page .metric-receivable { border-left-color: var(--green); }
    body.finance-page .metric-payable { border-left-color: var(--amber); }
    body.finance-page .finance-risk-panel { border-top: 3px solid var(--red); }
    body.finance-page .finance-payable-risk { border-top-color: var(--amber); }
    body.finance-page .finance-ranking-panel table, body.finance-page .finance-risk-panel table { min-width: 100%; }
    body.finance-page .finance-detail-panel table { min-width: 1180px; }
    body.finance-page .finance-detail-panel .table-wrap.tall { max-height: 560px; }
    body.finance-page .finance-risk-panel .empty { min-height: 84px; display: flex; align-items: center; color: var(--muted); }
    body.finance-page td:nth-child(2), body.finance-page td:nth-child(3), body.finance-page th:nth-child(2), body.finance-page th:nth-child(3) { white-space: nowrap; }
    body.finance-page .finance-search-panel { grid-column: 1 / -1; }
    body.finance-page .finance-search-layout { padding: 14px 16px 0; }
    body.finance-page .finance-search-form { display: grid; grid-template-columns: minmax(260px, 1fr) auto auto; gap: 10px; align-items: end; }
    body.finance-page .finance-search-form label { display: grid; gap: 6px; color: var(--muted); font-size: 13px; }
    body.finance-page .finance-search-form input { width: 100%; min-height: 38px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: #fff; }
    body.finance-page .finance-search-form input:focus { outline: 2px solid rgba(23, 107, 88, .18); border-color: var(--green); }
    body.finance-page .finance-search-hint { margin-top: 8px; color: var(--muted); font-size: 12px; line-height: 1.6; }
    body.finance-page .finance-ai-chat { margin-top: 12px; }
    body.finance-page .finance-ai-chat .ai-chat-head { padding: 10px 14px; }
    body.finance-page .finance-ai-chat .ai-chat-body { padding: 10px 14px 12px; grid-template-columns: minmax(0, 1fr) 240px; }
    body.finance-page .finance-ai-chat .ai-chat-messages { min-height: 72px; max-height: 140px; }
    body.finance-page .finance-ai-chat textarea { min-height: 46px; }
    body.finance-page .finance-ai-chat .ai-chip { min-height: 30px; padding: 6px 9px; }
    body.finance-page .finance-rank-pager { grid-column: 1 / -1; }
    body.finance-page .finance-pager-row { display: flex; gap: 12px; justify-content: space-between; align-items: center; padding: 12px 16px; }
    body.finance-page .finance-pager-summary { color: var(--muted); font-size: 13px; line-height: 1.55; }
    body.finance-page .finance-pager-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    body.workshop-screen { background: #eef2f6; }
    body.workshop-screen main { width: min(1920px, calc(100% - 24px)); padding: 14px 0 28px; }
    body.workshop-screen .global-nav { margin-bottom: 10px; padding: 8px; }
    body.workshop-screen header { position: sticky; top: 0; z-index: 4; padding: 14px 0; background: #eef2f6; }
    body.workshop-screen h1 { font-size: clamp(30px, 3vw, 48px); }
    body.workshop-screen h2 { padding: 16px 18px; font-size: 24px; }
    body.workshop-screen .sub { font-size: 16px; }
    body.workshop-screen .summary { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin: 14px 0; }
    body.workshop-screen .metric { min-height: 116px; padding: 16px; border-width: 2px; }
    body.workshop-screen .metric span { font-size: 16px; }
    body.workshop-screen .metric strong { font-size: clamp(28px, 2.6vw, 40px); overflow-wrap: normal; word-break: keep-all; white-space: nowrap; }
    body.workshop-screen .panel { border-width: 2px; }
    body.workshop-screen .panel.full-width table { min-width: 0; }
    body.workshop-screen table { min-width: 0; table-layout: fixed; }
    body.workshop-screen th, body.workshop-screen td { padding: 13px 12px; font-size: 18px; line-height: 1.35; }
    body.workshop-screen th { position: sticky; top: 0; z-index: 2; }
    body.workshop-screen .button { font-size: 16px; min-height: 40px; }
    body.workshop-screen .pill { font-size: 15px; border-radius: 6px; }
    body.workshop-screen .notes { font-size: 15px; }
    body.workshop-screen td:first-child { font-weight: 700; }
    body.workshop-screen tr.row-danger td { background: var(--red-soft); }
    body.workshop-screen tr.row-warning td { background: var(--amber-soft); }
    body.workshop-screen tr.row-ok td { background: var(--green-soft); }
    body.workshop-screen .workshop-tablet-list { display: none; }
    body.workshop-screen .workshop-tablet-card { display: grid; gap: 10px; padding: 16px; border-bottom: 1px solid var(--border); background: #fff; }
    body.workshop-screen .workshop-tablet-card.row-danger { background: var(--red-soft); }
    body.workshop-screen .workshop-tablet-card.row-warning { background: var(--amber-soft); }
    body.workshop-screen .workshop-tablet-card.row-ok { background: var(--green-soft); }
    body.workshop-screen .workshop-tablet-title { font-size: 22px; line-height: 1.25; font-weight: 800; overflow-wrap: anywhere; }
    body.workshop-screen .workshop-tablet-meta { color: var(--muted); font-size: 16px; line-height: 1.4; overflow-wrap: anywhere; }
    body.workshop-screen .workshop-tablet-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; }
    body.workshop-screen .workshop-tablet-field { display: grid; gap: 3px; }
    body.workshop-screen .workshop-tablet-label { color: var(--muted); font-size: 14px; line-height: 1.35; }
    body.workshop-screen .workshop-tablet-value { font-size: 18px; line-height: 1.35; overflow-wrap: anywhere; }
    @media (max-width: 1180px) {
      .workshop-section-metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      body.workshop-screen .workshop-tablet-list { display: grid; }
      body.workshop-screen .workshop-desktop-table { display: none; }
      body.workshop-screen .grid { display: block; }
    }
    @media (max-width: 980px) { header, .grid { display: block; } .actions { justify-content: flex-start; margin-top: 14px; } .panel { margin-top: 12px; } h1 { font-size: 24px; } }
    @media (max-width: 720px) {
      main { width: min(100% - 20px, 1440px); padding: 14px 0 28px; }
      .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 12px 0; }
      body.finance-page .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      body.finance-page .metric { min-height: 82px; }
      body.finance-page .metric strong { font-size: 21px; }
      .workshop-section-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .metric { min-height: 82px; padding: 10px; }
      .metric strong { font-size: 22px; }
      .actions { display: flex; flex-wrap: nowrap; justify-content: flex-start; overflow-x: auto; gap: 8px; padding-bottom: 2px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
      .actions::-webkit-scrollbar { display: none; }
      .actions .button { flex: 0 0 auto; }
      .button { min-height: 44px; padding: 9px 10px; white-space: nowrap; }
      .panel.mobile-card-panel .desktop-table-detail { display: none; }
      .panel.mobile-card-panel .mobile-record-list { display: grid; gap: 8px; padding: 12px; }
      .panel.mobile-card-panel table { min-width: 0; }
      .ai-chat-body { grid-template-columns: 1fr; }
      .ai-chat textarea { min-height: 86px; }
      .ai-chat-submit, .ai-chip { min-height: 44px; }
      body.finance-page .finance-ai-chat .ai-chat-body { grid-template-columns: 1fr; }
      body.finance-page .finance-search-form { grid-template-columns: 1fr; }
      body.finance-page .finance-pager-row { display: grid; }
      body.finance-page .finance-pager-actions { justify-content: flex-start; overflow-x: auto; flex-wrap: nowrap; padding-bottom: 2px; }
      body.finance-page .finance-pager-actions .button { flex: 0 0 auto; }
      .workshop-tablet-list { display: grid; }
      .workshop-desktop-table { display: none; }
      .mobile-hidden-panel { display: none; }
      .mobile-record-more { border: 1px dashed var(--border); border-radius: 8px; background: #f8fafc; overflow: hidden; }
      .mobile-record-more summary { cursor: pointer; padding: 10px 12px; color: var(--green); font-size: 13px; font-weight: 650; line-height: 1.4; }
      .mobile-record-more[open] { padding-bottom: 12px; }
      .mobile-record-more .mobile-record-extra { padding: 0 12px 12px; }
    }
    ${sharedNavCss()}
  </style>
</head>
<body class="${escapeHtml(pageClass)}">
  <main>
    ${renderTopNav(modulePathForTitle(title))}
    <header>
      <div>
        <h1>${escapeHtml(title)}</h1>
        <div class="sub">${escapeHtml(subtitle)}</div>
      </div>
      <div class="actions">
        ${visibleActions.map(renderActionControl).join("")}
      </div>
    </header>
    <section class="summary">${summary.map(([label, value, href, className]) => renderModuleMetric(label, value, href, className)).join("")}</section>
    <section class="grid">${panels.join("")}</section>
    <section class="notes">${notes.map((note) => `<div>${escapeHtml(note)}</div>`).join("")}</section>
  </main>
  ${afterMain}
</body>
</html>`;
  }

  function renderActionControl(action) {
    const [label, href, method] = Array.isArray(action) ? action : [action?.label, action?.href, action?.method];
    if (String(method || "").toLowerCase() === "post" || isMutatingHref(href)) {
      return renderPostButtonFromHref(label, href, "button primary");
    }
    return `<a class="button primary" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
  }

  function renderModuleMetric(label, value, href = "", className = "") {
    const metricClass = ["metric", className || ""].filter(Boolean).join(" ");
    const content = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "")}</strong>`;
    return href ? `<a class="${escapeHtml(metricClass)}" href="${escapeHtml(href)}">${content}</a>` : `<div class="${escapeHtml(metricClass)}">${content}</div>`;
  }

  function modulePanel(title, rows, columns, options = {}) {
    const allRows = Array.isArray(rows) ? rows : [];
    const limit = options.limit === "all" ? allRows.length : clampInt(options.limit ?? 20, 1, 1000);
    const safeRows = allRows.slice(0, limit);
    const countText = allRows.length > safeRows.length ? `${safeRows.length}/${allRows.length}` : `${safeRows.length}`;
    const isWideTable = Array.isArray(columns) && columns.length >= 8;
    const useMobileCards = Boolean(options.mobileCards);
    const sectionClass = [
      "panel",
      options.fullWidth ? "full-width" : "",
      !options.fullWidth && isWideTable ? "auto-wide" : "",
      useMobileCards ? "mobile-card-panel" : "",
      options.mobileHidden ? "mobile-hidden-panel" : "",
      options.className || ""
    ].filter(Boolean).join(" ");
    const wrapClass = ["table-wrap", options.tall ? "tall" : "", useMobileCards ? "desktop-table-detail" : ""].filter(Boolean).join(" ");
    return `<section class="${sectionClass}">
      <h2>${escapeHtml(title)} <span class="pill">${escapeHtml(countText)}</span></h2>
      ${
        safeRows.length
          ? `<div class="${wrapClass}"><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(labelFor(column))}</th>`).join("")}</tr></thead><tbody>${safeRows.map((row) => `<tr>${columns.map((column) => `<td>${formatDetailCell(column, row?.[column], row)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${useMobileCards ? renderMobileRecordList(safeRows, columns, options) : ""}`
          : `<div class="empty">当前没有${escapeHtml(title)}。</div>`
      }
    </section>`;
  }

  function renderMobileRecordList(rows, columns, options = {}) {
    const titleColumn = options.mobileTitleColumn || columns[0];
    const subtitleColumns = options.mobileSubtitleColumns || columns.filter((column) => column !== titleColumn).slice(0, 2);
    const detailColumns = options.mobileDetailColumns || columns.filter((column) => column !== titleColumn).slice(0, 8);
    const mobileLimit = options.mobileLimit === "all" ? rows.length : clampInt(options.mobileLimit ?? 12, 1, 1000);
    const primaryRows = rows.slice(0, mobileLimit);
    const extraRows = rows.slice(mobileLimit);
    const renderCard = (row) => {
      const titleValue = formatDetailCell(titleColumn, row?.[titleColumn], row) || escapeHtml("未命名记录");
      const subtitle = subtitleColumns
        .map((column) => stripTags(formatDetailCell(column, row?.[column], row)))
        .filter(Boolean)
        .join(" · ");
      return `<article class="mobile-record-card">
        <div class="mobile-record-title">${titleValue}</div>
        ${subtitle ? `<div class="mobile-record-meta">${escapeHtml(subtitle)}</div>` : ""}
        <div class="mobile-record-fields">
          ${detailColumns.map((column) => `<div class="mobile-record-field"><div class="mobile-record-label">${escapeHtml(labelFor(column))}</div><div class="mobile-record-value">${formatDetailCell(column, row?.[column], row)}</div></div>`).join("")}
        </div>
      </article>`;
    };
    return `<div class="mobile-record-list">
      <div class="mobile-record-primary">${primaryRows.map(renderCard).join("")}</div>
      ${extraRows.length ? `<details class="mobile-record-more"><summary>展开剩余 ${escapeHtml(String(extraRows.length))} 条</summary><div class="mobile-record-extra">${extraRows.map(renderCard).join("")}</div></details>` : ""}
    </div>`;
  }

  return {
    modulePage,
    modulePanel,
    renderTopNav,
    sharedNavCss
  };
}

export function formatCell(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    if (value.every((item) => typeof item !== "object")) {
      return value.map((item) => `<span class="pill">${escapeHtml(displayValue(item))}</span>`).join("");
    }
    return escapeHtml(`${value.length} 项`);
  }
  if (value && typeof value === "object") return escapeHtml(JSON.stringify(value).slice(0, 120));
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string" && /^\/[A-Za-z0-9/_?=&.%:-]+$/.test(value)) {
    if (isMutatingHref(value)) {
      return renderPostButtonFromHref("执行", value, "button");
    }
    return `<a href="${escapeHtml(value)}">${escapeHtml(value)}</a>`;
  }
  return escapeHtml(displayValue(value));
}

function displayValue(value) {
  const text = String(value);
  const translations = {
    due_soon: "7天内到期",
    overdue: "逾期",
    normal: "正常",
    red: "红",
    yellow: "黄",
    green: "绿",
    true: "是",
    false: "否"
  };
  return translations[text] || text;
}

function stripTags(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}
