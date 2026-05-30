import test from "node:test";
import assert from "node:assert/strict";
import { buildDailySyncPlan } from "../src/dailySyncScheduler.js";
import { labelFor } from "../src/displayUtils.js";
import { createHomePageRenderer } from "../src/pages/homePage.js";
import { createHtmlRenderers } from "../src/pages/html.js";
import { SYNC_SOURCES } from "../src/syncPolicy.js";

const renderers = createHtmlRenderers({
  labelFor,
  formatDetailCell: (_column, value) => String(value ?? ""),
  clampInt: (value, min, max) => Math.max(min, Math.min(max, Number.parseInt(value, 10) || min))
});

test("top navigation exposes only simplified management entries", () => {
  const nav = renderers.renderTopNav("/pmc");

  for (const label of ["首页", "PMC", "订单", "生产", "车间看板", "物料采购", "财务", "系统", "退出登录"]) {
    assert.match(nav, new RegExp(`>${label}<`));
  }
  assert.match(nav, /href="\/logout"/);
  for (const hiddenHref of ["/quotes", "/exceptions", "/roles", "/followup", "/foreign-trade", "/dispatch", "/scheduling", "/procurement"]) {
    assert.doesNotMatch(nav, new RegExp(`href="${hiddenHref}"`));
  }
});

test("shared navigation has a single-row mobile treatment", () => {
  const css = renderers.sharedNavCss();

  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /\.global-nav\s*\{[^}]*flex-wrap:\s*nowrap/s);
  assert.match(css, /\.global-nav\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.global-nav a\s*\{[^}]*min-height:\s*44px/s);
});

test("module pages use a horizontal mobile action rail", () => {
  const html = renderers.modulePage({
    title: "测试页面",
    subtitle: "测试手机操作区",
    actions: [["动作一", "/a"], ["动作二", "/b"], ["动作三", "/c"]]
  });

  assert.match(html, /@media \(max-width: 720px\)[\s\S]*\.actions\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(html, /@media \(max-width: 720px\)[\s\S]*\.actions \.button\s*\{[\s\S]*flex:\s*0 0 auto/);
});

test("home page hides quote and exception centers from user-facing entry lists", () => {
  const { homePage } = createHomePageRenderer({
    escapeHtml: (value) => String(value ?? ""),
    formatDateTime: () => "2026-05-28 12:00",
    host: "0.0.0.0",
    latestPmcSnapshot: () => ({ created_at: "2026-05-28T04:00:00.000Z", summary: {} }),
    port: 3000,
    renderTopNav: renderers.renderTopNav,
    sharedNavCss: renderers.sharedNavCss
  });
  const html = homePage();

  assert.doesNotMatch(html, /href="\/quotes"/);
  assert.doesNotMatch(html, /href="\/exceptions"/);
  assert.doesNotMatch(html, /待报价中心|异常管理中心|待报价项目/);
});

test("default sync policies stop pulling quote projects after quote center soft-offline", () => {
  const plan = buildDailySyncPlan({ now: new Date("2026-05-28T10:00:00+08:00") });
  assert.equal(plan.history_sources.includes("quote_projects"), false);
  assert.equal(SYNC_SOURCES.some((row) => row.source_key === "quote_projects"), false);
});
