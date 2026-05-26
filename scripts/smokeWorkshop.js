import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

const cases = [
  { path: "/workshop-board", title: "车间电子看板", rotate: false, overview: true },
  { path: "/workshop-board/rolling", title: "轧制大屏", rotate: false },
  { path: "/workshop-board/rolling?rotate=1", title: "轧制大屏", rotate: true, target: "/workshop-board/stamping?rotate=1" },
  { path: "/workshop-board/stamping?rotate=1", title: "冲压大屏", rotate: true, target: "/workshop-board/tungsten-molybdenum?rotate=1" },
  { path: "/workshop-board/tungsten-molybdenum?rotate=1", title: "钨钼大屏", rotate: true, target: "/workshop-board/rolling?rotate=1" }
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const results = [];

try {
  for (const item of cases) {
    await page.goto(`${BASE_URL}${item.path}`, { waitUntil: "networkidle" });
    const title = await page.locator("h1").first().textContent();
    const activeNav = await page.locator("nav.global-nav a.active").first().textContent();
    const tableCount = await page.locator("table").count();
    const bodyText = await page.locator("body").innerText();
    const scriptText = await page.locator("script").evaluateAll((nodes) => nodes.map((node) => node.textContent).join("\n"));
    const rotateTarget = (scriptText.match(/const rotateTarget = ([^;]+);/) || [])[1] || "";
    const columns = item.overview || tableCount < 2 ? [] : await page.locator("table").nth(1).locator("th").allTextContents();

    const ok = [
      title === item.title,
      activeNav === "看板",
      item.overview ? bodyText.includes("三大工段总览") : tableCount === 3,
      item.overview || columns.includes("派工单ID"),
      item.overview || columns.includes("销售订单号"),
      item.overview || !bodyText.includes("订单匹配方式"),
      item.overview || !bodyText.includes("绑定销售订单"),
      item.rotate ? bodyText.includes("轮播模式已开启") : !bodyText.includes("轮播模式已开启"),
      item.rotate ? rotateTarget.includes(item.target) : true
    ].every(Boolean);

    results.push({
      path: item.path,
      title,
      activeNav,
      tableCount,
      rotateTarget,
      ok
    });
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));

if (results.some((row) => !row.ok)) {
  process.exitCode = 1;
}
