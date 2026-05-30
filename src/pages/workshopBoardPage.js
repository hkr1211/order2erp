export const WORKSHOP_ROUTE_TO_KEY = {
  "/workshop-board/rolling": "rolling",
  "/workshop-board/stamping": "stamping",
  "/workshop-board/tungsten-molybdenum": "tungsten_molybdenum"
};

const WORKSHOP_SCREEN_PLAN_COLUMNS = ["status", "work_assignment_id", "sales_order_no", "product_name", "procedure_name", "work_center_name", "planned_qty", "finished_qty", "remaining_qty", "planned_finish_date"];
const WORKSHOP_SCREEN_WARNING_COLUMNS = ["warning_type", "level", "related_object", "related_id", "message"];

export function createWorkshopBoardPageRenderers({ modulePage, escapeHtml, formatCell, labelFor, parseBoolean }) {
  function workshopBoardPage(body) {
    const summary = body.summary || {};
    return modulePage({
      title: "车间电子看板",
      subtitle: `按轧制、冲压、钨钼三大工段显示当日进行中计划、完成进度和异常预警。数据日期：${escapeHtml(body.today || "")}`,
      summary: [
        ["进行中计划", summary.active_plans || 0],
        ["已完成计划", summary.completed_plans || 0],
        ["延期计划", summary.delayed_plans || 0],
        ["物料预警", summary.material_alerts || 0],
        ["今日汇报数量", summary.today_report_qty || 0]
      ],
      panels: [
        workshopSectionCards(body.sections || []),
        ...((body.sections || []).map((section) => workshopSectionPanel(section)))
      ],
      notes: body.notes,
      actions: [["轮播大屏", "/workshop-board/rolling?rotate=1"], ["轧制大屏", "/workshop-board/rolling"], ["冲压大屏", "/workshop-board/stamping"], ["钨钼大屏", "/workshop-board/tungsten-molybdenum"], ["派工追踪", "/dispatch"], ["刷新本地看板", "/workshop-board"]]
    });
  }

  function workshopSectionCards(sections) {
    return `<section class="panel full-width">
      <h2>三大工段总览 <span class="pill">${sections.length}</span></h2>
      <div class="summary workshop-overview-sections" style="margin:0;padding:14px 16px;">
        ${sections.map((section) => `<a class="metric" href="${escapeHtml(section.page_path || `#${section.key}`)}">
          <span>${escapeHtml(section.title)}</span>
          <strong>${escapeHtml(section.completion_rate)}%</strong>
          <span>进行中 ${escapeHtml(section.active_plans)} / 延期 ${escapeHtml(section.delayed_plans)} / 预警 ${escapeHtml(section.warnings.length)}</span>
        </a>`).join("")}
      </div>
    </section>`;
  }

  function workshopSectionScreenPage(body, sectionKey, params = {}) {
    const sections = body.sections || [];
    const section = sections.find((row) => row.key === sectionKey) || sections[0] || {};
    const currentIndex = Math.max(0, sections.findIndex((row) => row.key === section.key));
    const previous = sections[(currentIndex + sections.length - 1) % Math.max(1, sections.length)] || section;
    const next = sections[(currentIndex + 1) % Math.max(1, sections.length)] || section;
    const activePlans = workshopScreenRows((section.plans || []).filter((row) => row.status !== "已完成" && row.status !== "延期")).slice(0, 60);
    const delayedPlans = workshopScreenRows((section.plans || []).filter((row) => row.status === "延期" || row.status === "未完成")).slice(0, 80);
    const tone = section.delayed_plans > 0 || section.material_alerts > 0 ? "预警" : section.active_plans > 0 ? "进行中" : "平稳";
    const rotateEnabled = parseBoolean(params.rotate);
    const nextHref = workshopScreenHref(next, rotateEnabled);

    return modulePage({
      title: `${section.title || "工段"}大屏`,
      subtitle: `${section.description || "车间工段计划"}。按 planned_start_date <= 今天 <= planned_finish_date 统计进行中计划，数据日期：${escapeHtml(body.today || "")}${rotateEnabled ? "。轮播模式已开启" : ""}`,
      summary: [
        ["状态", tone],
        ["进行中计划", section.active_plans || 0],
        ["完成率", `${section.completion_rate || 0}%`],
        ["延期计划", section.delayed_plans || 0],
        ["红黄预警", (section.warnings || []).length],
        ["今日汇报数量", section.today_report_qty || 0],
        ["计划数量", formatWorkshopNumber(section.planned_qty)],
        ["完成数量", formatWorkshopNumber(section.finished_qty)],
        ["剩余数量", formatWorkshopNumber(section.remaining_qty)]
      ],
      panels: [
        workshopScreenHero(section, tone),
        workshopScreenTablePanel("红黄预警", section.top_warnings || [], WORKSHOP_SCREEN_WARNING_COLUMNS),
        workshopScreenTablePanel("今日进行中派工", activePlans, WORKSHOP_SCREEN_PLAN_COLUMNS),
        workshopScreenTablePanel("延期/未完成派工", delayedPlans, WORKSHOP_SCREEN_PLAN_COLUMNS)
      ],
      notes: [
        ...(body.notes || []),
        "本页为车间大屏滚动版，只读取 SQLite，不实时访问 ERP。",
        "数量字段统一保留两位小数，方便大屏快速核对。",
        rotateEnabled ? "轮播模式：本页停留约 60 秒后自动切换到下一工段；鼠标滚动或键盘操作会临时暂停。" : "点击“开启轮播”后，可在一台大屏上自动循环展示三大工段。"
      ],
      actions: [
        ["返回总览", "/workshop-board"],
        [previous.title ? `${previous.title}大屏` : "上一工段", workshopScreenHref(previous, rotateEnabled)],
        [next.title ? `${next.title}大屏` : "下一工段", nextHref],
        [rotateEnabled ? "停止轮播" : "开启轮播", workshopScreenHref(section, !rotateEnabled)],
        ["刷新本工段", workshopScreenHref(section, rotateEnabled)]
      ],
      pageClass: "workshop-screen",
      afterMain: workshopAutoScrollScript({ rotateEnabled, nextHref })
    });
  }

  function workshopScreenHref(section = {}, rotateEnabled = false) {
    const href = section.page_path || "/workshop-board";
    return rotateEnabled ? `${href}?rotate=1` : href;
  }

  function workshopScreenRows(rows) {
    return [...rows].sort((a, b) => workshopScreenRowWeight(b) - workshopScreenRowWeight(a) || String(a.planned_finish_date || "").localeCompare(String(b.planned_finish_date || "")));
  }

  function workshopScreenRowWeight(row) {
    if (row.status === "延期") return 5;
    if (!String(row.sales_order_no || "").trim()) return 4;
    if (!String(row.owner || "").trim()) return 3;
    if (row.status === "进行中") return 2;
    return 1;
  }

  function workshopAutoScrollScript({ rotateEnabled = false, nextHref = "" } = {}) {
    const target = rotateEnabled ? JSON.stringify(nextHref || "/workshop-board/rolling?rotate=1") : "null";
    return `<script>
  (() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let direction = 1;
    let pausedUntil = 0;
    const rotateTarget = ${target};
    const startedAt = Date.now();
    const step = () => {
      const now = Date.now();
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (rotateTarget && now - startedAt > 60000 && now >= pausedUntil) {
        window.location.href = rotateTarget;
        return;
      }
      if (maxY < 80 || now < pausedUntil) return;
      if (window.scrollY >= maxY - 4) { direction = -1; pausedUntil = now + 2400; return; }
      if (window.scrollY <= 4) { direction = 1; pausedUntil = now + 1800; return; }
      window.scrollBy({ top: direction * 1.2, behavior: "auto" });
    };
    window.addEventListener("wheel", () => { pausedUntil = Date.now() + 12000; }, { passive: true });
    window.addEventListener("keydown", () => { pausedUntil = Date.now() + 12000; });
    setInterval(step, 35);
  })();
  </script>`;
  }

  function workshopScreenHero(section, tone) {
    return `<section class="panel full-width">
      <h2>${escapeHtml(section.title || "工段")}滚动看板 <span class="pill">${escapeHtml(tone)}</span></h2>
      <div class="summary workshop-section-metrics" style="margin:0;padding:14px 16px;">
        <div class="metric"><span>计划数量</span><strong>${escapeHtml(formatWorkshopNumber(section.planned_qty))}</strong></div>
        <div class="metric"><span>完成数量</span><strong>${escapeHtml(formatWorkshopNumber(section.finished_qty))}</strong></div>
        <div class="metric"><span>剩余数量</span><strong>${escapeHtml(formatWorkshopNumber(section.remaining_qty))}</strong></div>
        <div class="metric"><span>物料预警</span><strong>${escapeHtml(section.material_alerts || 0)}</strong></div>
        <div class="metric"><span>今日汇报行数</span><strong>${escapeHtml(section.today_report_rows || 0)}</strong></div>
        <div class="metric"><span>今日汇报数量</span><strong>${escapeHtml(formatWorkshopNumber(section.today_report_qty))}</strong></div>
      </div>
    </section>`;
  }

  function workshopScreenTablePanel(title, rows, columns) {
    return `<section class="panel full-width">${workshopMiniTable(title, rows, columns)}</section>`;
  }

  function workshopSectionPanel(section) {
    const tone = section.delayed_plans > 0 || section.material_alerts > 0 ? "预警" : section.active_plans > 0 ? "进行中" : "平稳";
    return `<section class="panel full-width" id="${escapeHtml(section.key)}">
      <h2>${escapeHtml(section.title)} <span class="pill">${escapeHtml(section.description || "")}</span></h2>
      <div class="summary workshop-section-metrics" style="margin:0;padding:14px 16px;">
        <div class="metric"><span>状态</span><strong>${escapeHtml(tone)}</strong></div>
        <div class="metric"><span>进行中计划</span><strong>${escapeHtml(section.active_plans)}</strong></div>
        <div class="metric"><span>完成率</span><strong>${escapeHtml(section.completion_rate)}%</strong></div>
        <div class="metric"><span>计划数量</span><strong>${escapeHtml(formatWorkshopNumber(section.planned_qty))}</strong></div>
        <div class="metric"><span>完成数量</span><strong>${escapeHtml(formatWorkshopNumber(section.finished_qty))}</strong></div>
        <div class="metric"><span>剩余数量</span><strong>${escapeHtml(formatWorkshopNumber(section.remaining_qty))}</strong></div>
        <div class="metric"><span>延期/预警</span><strong>${escapeHtml(`${section.delayed_plans}/${section.warnings.length}`)}</strong></div>
        <div class="metric"><span>今日汇报数量</span><strong>${escapeHtml(section.today_report_qty)}</strong></div>
      </div>
      ${workshopMiniTable("异常预警", section.top_warnings || [], ["warning_type", "level", "related_object", "related_id", "message"])}
      ${workshopMiniTable("重点派工", section.top_plans || [], ["status", "work_assignment_id", "sales_order_no", "order_match_by", "product_name", "procedure_name", "work_center_name", "planned_qty", "finished_qty", "remaining_qty", "planned_start_date", "planned_finish_date", "owner", "link_action"])}
    </section>`;
  }

  function workshopMiniTable(title, rows, columns) {
    if (!rows.length) {
      return `<h2>${escapeHtml(title)} <span class="pill">0</span></h2><div class="empty">当前没有记录。</div>`;
    }
    return `<h2>${escapeHtml(title)} <span class="pill">${rows.length}</span></h2>
      ${workshopTabletCards(rows, columns)}
      <div class="table-wrap workshop-desktop-table workshop-fit-table">
        <table>
          <thead><tr>${columns.map((column) => `<th>${escapeHtml(labelFor(column))}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((row) => `<tr class="${escapeHtml(workshopRowClass(row))}">${columns.map((column) => `<td>${formatWorkshopCell(column, row[column])}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>`;
  }

  function workshopTabletCards(rows, columns) {
    const detailColumns = columns.slice(0, 8);
    return `<div class="workshop-tablet-list">
      ${rows.map((row) => {
        const titleColumn = row.work_assignment_id ? "work_assignment_id" : row.related_id ? "related_id" : columns[0];
        const titleValue = formatWorkshopCell(titleColumn, row[titleColumn]) || escapeHtml("未命名记录");
        const metaColumns = columns.filter((column) => column !== titleColumn).slice(0, 2);
        const meta = metaColumns
          .map((column) => stripHtml(formatWorkshopCell(column, row[column])))
          .filter(Boolean)
          .join(" · ");
        return `<article class="workshop-tablet-card ${escapeHtml(workshopRowClass(row))}">
          <div class="workshop-tablet-title">${titleValue}</div>
          ${meta ? `<div class="workshop-tablet-meta">${escapeHtml(meta)}</div>` : ""}
          <div class="workshop-tablet-fields">
            ${detailColumns.map((column) => `<div class="workshop-tablet-field"><div class="workshop-tablet-label">${escapeHtml(labelFor(column))}</div><div class="workshop-tablet-value">${formatWorkshopCell(column, row[column])}</div></div>`).join("")}
          </div>
        </article>`;
      }).join("")}
    </div>`;
  }

  function workshopRowClass(row = {}) {
    if (row.status === "延期" || row.level === "高" || row.warning_type === "缺料") return "row-danger";
    if (row.status === "未完成" || row.level === "中" || row.warning_type) return "row-warning";
    if (row.status === "已完成") return "row-ok";
    return "";
  }

  function formatWorkshopCell(column, value) {
    if (["planned_qty", "finished_qty", "remaining_qty", "today_report_qty"].includes(column)) {
      return workshopNoWrap(formatWorkshopNumber(value));
    }
    if (["planned_start_date", "planned_finish_date", "work_assignment_id", "related_id"].includes(column)) {
      return workshopNoWrap(value);
    }
    if (column === "link_action" && value) {
      return `<a class="button" href="${escapeHtml(value)}">绑定销售订单</a>`;
    }
    return formatCell(value);
  }

  function formatWorkshopNumber(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue.toFixed(2) : String(value ?? "");
  }

  function stripHtml(value) {
    return String(value ?? "").replace(/<[^>]*>/g, "").trim();
  }

  function workshopNoWrap(value) {
    return `<span class="workshop-nowrap">${escapeHtml(value ?? "")}</span>`;
  }

  return {
    workshopBoardPage,
    workshopSectionScreenPage
  };
}
