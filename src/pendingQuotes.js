import { normalizeTable, toBusinessView } from "./erpClient.js";

export async function queryPendingQuotes(client, params = {}) {
  const pageIndex = clampInt(params.pageindex || 1, 1, 10000);
  const pageSize = clampInt(params.pagesize || 20, 1, 100);
  const limit = clampInt(params.limit || params.quote_limit || 20, 1, 200);
  const includeAll = parseBoolean(params.include_all);
  const projectResult = await client.queryView("projects", {
    searchKey: params.searchKey || "",
    title: params.title || "",
    xmid: params.xmid || "",
    cateName: params.cateName || params.customer || "",
    complete1: params.complete1 || "",
    complete2: params.complete2 || "",
    pageindex: String(pageIndex),
    pagesize: String(pageSize)
  });
  const projectTable = normalizeTable(projectResult);
  const projects = toBusinessView("projects", projectTable).rows;
  const rows = (includeAll ? projects : projects.filter(isPendingQuote)).slice(0, limit);

  return {
    header: { status: 0, message: "ok" },
    body: {
      model: "pending_quotes",
      scan: {
        pageindex: pageIndex,
        pagesize: pageSize,
        limit,
        include_all: includeAll,
        filters: {
          searchKey: params.searchKey || "",
          title: params.title || "",
          xmid: params.xmid || "",
          customer: params.cateName || params.customer || "",
          complete1: params.complete1 || "",
          complete2: params.complete2 || ""
        }
      },
      page: projectTable.page,
      summary: {
        scanned_projects: projects.length,
        pending_quote_projects: rows.length
      },
      rows,
      notes: [
        "本视图基于项目/商机列表识别待报价项目。",
        "第一版规则：阶段含报价、询价、方案、核价、定价，或金额均为 0 且未关闭/成交的项目。"
      ]
    }
  };
}

function isPendingQuote(project) {
  const stageText = [
    project.follow_stage,
    project.project_stage,
    project.approval_status,
    project.lead_status
  ]
    .filter(Boolean)
    .join(" ");
  if (/报价|询价|方案|核价|定价/.test(stageText)) {
    return true;
  }
  if (/成交|签约|合同|失败|关闭|作废/.test(stageText)) {
    return false;
  }
  return isZero(project.estimated_amount) && isZero(project.quoted_amount);
}

function isZero(value) {
  return value === 0 || value === null;
}

function clampInt(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.max(min, Math.min(max, number));
}

function parseBoolean(value) {
  if (value === true || value === 1) {
    return true;
  }
  const text = value === undefined || value === null ? "" : String(value).trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}
