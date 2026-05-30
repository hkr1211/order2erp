import http from "node:http";
import fs from "node:fs";
import { canAccessPath, hasFullDataAccess, homePathForUser, requiresPasswordChange } from "./auth.js";
import { clampInt, formatDate, formatDateTime, formatNumber, labelFor, parseBoolean, parseNumber } from "./displayUtils.js";
import { ErpClient, ERP_VIEWS, normalizeTable, toBusinessView } from "./erpClient.js";
import { queryOrderDeliveryRisks } from "./orderDeliveryRisks.js";
import { queryOrderShortages } from "./orderShortages.js";
import { changeLocalAuthPassword, createLocalAuthSession, deleteLocalAuthSession, deleteLocalUserRole, finishHistorySyncRun, getLocalAuthSession, initLocalDb, latestErpRequestLogs, latestPmcInterventions, latestPmcInterventionsByRelatedNos, latestPmcSnapshot, latestStandardRisks, latestSyncRuns, listAiChatLogs, listFinanceRecords, listInventoryDetails, listInventorySummary, listLocalAuthUsers, listLocalUserRoles, listMaterialAlerts, listOrderProcedureLinks, listOrgUsers, listProcedurePlans, listProcessReports, listPurchaseOrders, listQuoteFollowups, listSalesOrders, listSuppliers, logErpRequest, pmcInterventionSummary, resetLocalUserPassword, saveAiChatLog, saveLocalAuthUser, saveLocalUserRole, saveOrderProcedureLink, savePmcIntervention, savePmcSnapshot, saveStandardRisks, standardRiskSummary, startHistorySyncRun, verifyLocalAuthUser } from "./localDb.js";
import { syncCoreData } from "./syncService.js";
import { buildSyncPolicyRows } from "./syncPolicy.js";
import { buildErpHealthSummary, shouldBlockErpBusinessQuery } from "./erpHealth.js";
import { setSyncPaused, syncPauseGuard, syncPauseStatus } from "./syncPause.js";
import { historySyncDryRun, historySyncParams, historySyncWindowParams, runHistorySyncBatch, runHistorySyncWindow } from "./historySync.js";
import { runDailyIncrementalSync, startDailySyncScheduler } from "./dailySyncScheduler.js";
import { buildForeignTradeBoard, buildLocalExceptionCenter, buildLocalFinanceCenter, buildLocalPmcDashboard, buildUserRoleCandidates, buildWorkshopBoard, enrichProcedurePlansWithOrderMatches, quoteOwnerSummaryForLocal } from "./localAnalytics.js";
import { queryPendingQuotes } from "./pendingQuotes.js";
import { createApiResultPageRenderer } from "./pages/apiResultPage.js";
import { createFinancePageRenderers } from "./pages/financePage.js";
import { createFollowupPageRenderers } from "./pages/followupPage.js";
import { createHomePageRenderer } from "./pages/homePage.js";
import { createHtmlRenderers, escapeHtml, formatCell, renderPostButtonFromHref } from "./pages/html.js";
import { createOperationsPageRenderers } from "./pages/operationsPage.js";
import { createOrdersPageRenderers } from "./pages/ordersPage.js";
import { createPmcPageRenderers } from "./pages/pmcPage.js";
import { createProcedureLinksPageRenderer } from "./pages/procedureLinksPage.js";
import { createReportsPageRenderers } from "./pages/reportsPage.js";
import { createSystemPageRenderers } from "./pages/systemPage.js";
import { createSystemToolsPageRenderers } from "./pages/systemToolsPage.js";
import { createUserRolesPageRenderers } from "./pages/userRolesPage.js";
import { WORKSHOP_ROUTE_TO_KEY, createWorkshopBoardPageRenderers } from "./pages/workshopBoardPage.js";
import { createActionQueries } from "./queries/actionQueries.js";
import { createAiChatQuery } from "./queries/aiChatQuery.js";
import { createFinanceQueries, mapFinanceRow } from "./queries/financeQuery.js";
import { createMaterialExceptionQueries } from "./queries/materialExceptionQuery.js";
import { createOrdersQueries } from "./queries/ordersQuery.js";
import { createPmcQueries } from "./queries/pmcQuery.js";
import { createProductionQueries } from "./queries/productionQuery.js";
import { createProcurementQueries } from "./queries/procurementQuery.js";
import { createQuotesQueries } from "./queries/quotesQuery.js";
import { createReportSchedulingQueries } from "./queries/reportSchedulingQuery.js";
import { createSystemQueries } from "./queries/systemQueries.js";
import { createUserRolesQueries } from "./queries/userRolesQuery.js";

loadEnvFile();
initLocalDb();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const ERP_PROTECTION_MODE = process.env.ERP_PROTECTION_MODE !== "0";
const DEFAULT_SYNC_PAGE_SIZE = Number.parseInt(process.env.DEFAULT_SYNC_PAGE_SIZE || "20", 10) || 20;
const DEFAULT_SYNC_COOLDOWN_SECONDS = Number.parseInt(process.env.SYNC_COOLDOWN_SECONDS || "300", 10) || 300;
const ERP_REQUEST_MIN_INTERVAL_MS = Number.parseInt(process.env.ERP_REQUEST_MIN_INTERVAL_MS || "800", 10) || 800;
const DAILY_SYNC_ENABLED = process.env.DAILY_SYNC_ENABLED !== "0";
const client = new ErpClient({ requestLogger: logErpRequest });
let dailySyncScheduler = null;
const { queryErpRequestLogCenter, queryHistorySyncCenter, querySqliteCoverage } = createSystemQueries({
  erpRequestMinIntervalMs: ERP_REQUEST_MIN_INTERVAL_MS
});
const { queryInterventionLogCenter, queryProcedureLinks } = createActionQueries({
  buildLocalPmcDashboard,
  latestPmcInterventions,
  listOrderProcedureLinks,
  listProcedurePlans,
  listProcessReports,
  listSalesOrders,
  pmcInterventionSummary
});
const { queryFinanceCenter } = createFinanceQueries({
  buildLocalFinanceCenter,
  client,
  erpProtectionMode: ERP_PROTECTION_MODE,
  latestPmcSnapshot,
  listStandardRisks: latestStandardRisks,
  listFinanceRecords,
  summarizeDataSourceError
});
const { queryProcurementCenter } = createProcurementQueries({
  client,
  erpProtectionMode: ERP_PROTECTION_MODE,
  listFinanceRecords,
  listPurchaseOrders,
  listSuppliers,
  summarizeDataSourceError,
  withTimeout
});
const { queryOrderCenter, queryOrderDetail } = createOrdersQueries({
  client,
  erpProtectionMode: ERP_PROTECTION_MODE,
  latestPmcSnapshot,
  listStandardRisks: latestStandardRisks,
  listMaterialAlerts,
  listSalesOrders,
  summarizeDataSourceError,
  withTimeout
});
const { queryLocalProductionCenter, queryProductionCenter, queryWorkshopBoard } = createProductionQueries({
  buildWorkshopBoard,
  client,
  enrichProcedurePlansWithOrderMatches,
  listMaterialAlerts,
  listOrderProcedureLinks,
  listProcedurePlans,
  listProcessReports,
  listSalesOrders,
  summarizeDataSourceError,
  withTimeout
});
const { queryForeignTradeBoard, queryQuoteCenter } = createQuotesQueries({
  buildForeignTradeBoard,
  client,
  erpProtectionMode: ERP_PROTECTION_MODE,
  listMaterialAlerts,
  listQuoteFollowups,
  listSalesOrders,
  queryPendingQuotes,
  quoteOwnerSummaryForLocal,
  summarizeDataSourceError,
  withTimeout
});
const { modulePage, modulePanel, renderTopNav, sharedNavCss } = createHtmlRenderers({ labelFor, formatDetailCell, clampInt });
const { apiResultPage } = createApiResultPageRenderer({ escapeHtml, formatCell, labelFor, renderTopNav, sharedNavCss });
const { financeCenterPage } = createFinancePageRenderers({ modulePage, modulePanel });
const { homePage } = createHomePageRenderer({
  escapeHtml,
  formatDateTime,
  host: HOST,
  latestPmcSnapshot,
  port: PORT,
  renderTopNav,
  sharedNavCss
});
const {
  dispatchTrackingPage,
  exceptionCenterPage,
  foreignTradeBoardPage,
  materialControlPage,
  procurementCenterPage,
  productionCenterPage,
  quoteCenterPage,
  schedulingCenterPage
} = createOperationsPageRenderers({ modulePage, modulePanel, escapeHtml });
const {
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
} = createPmcPageRenderers({
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
});
const {
  emptyPmcConsoleBody,
  queryFollowupWorkbench,
  queryLocalPmcDashboard,
  queryPmcConsole,
  queryPmcDashboard
} = createPmcQueries({
  buildLocalPmcDashboard,
  client,
  enrichPmcInterventionStatus,
  latestPmcSnapshot,
  listFinanceRecords,
  listInventoryDetails,
  listLocalUserRoles,
  listMaterialAlerts,
  listOrderProcedureLinks,
  listProcedurePlans,
  listProcessReports,
  listQuoteFollowups,
  listSalesOrders,
  queryPendingQuotes,
  latestStandardRisks,
  savePmcSnapshot,
  saveStandardRisks,
  summarizeDataSourceError,
  withTimeout
});
const { queryAiChat } = createAiChatQuery({
  buildLocalPmcDashboard,
  latestSyncRuns,
  listAiChatLogs,
  listFinanceRecords,
  listInventoryDetails,
  listInventorySummary,
  listMaterialAlerts,
  listProcedurePlans,
  listSalesOrders,
  listStandardRisks: latestStandardRisks,
  saveAiChatLog
});
const { queryUserRoles, userRoleResultHref } = createUserRolesQueries({
  buildUserRoleCandidates,
  listFinanceRecords,
  listLocalAuthUsers,
  listLocalUserRoles,
  listOrgUsers,
  listProcedurePlans,
  listQuoteFollowups,
  listSalesOrders,
  queryLocalPmcDashboard
});
const { enrichExceptionCenterStatus, queryExceptionCenter, queryMaterialControl } = createMaterialExceptionQueries({
  buildLocalExceptionCenter,
  client,
  erpProtectionMode: ERP_PROTECTION_MODE,
  interventionLogHref,
  isInterventionFinal,
  listInventoryDetails,
  listInventorySummary,
  latestPmcInterventionsByRelatedNos,
  latestPmcSnapshot,
  listMaterialAlerts,
  pmcInterventionHref,
  pmcRiskClosure,
  queryLocalPmcDashboard,
  queryPmcDashboard,
  summarizeDataSourceError,
  withTimeout
});
const { queryReportCenter, querySchedulingCenter } = createReportSchedulingQueries({
  buildLocalExceptionCenter,
  enrichExceptionCenterStatus,
  enrichPmcInterventionStatus,
  latestPmcSnapshot,
  pmcInterventionSummary,
  queryLocalPmcDashboard,
  queryOrderCenter,
  queryPmcConsole,
  queryQuoteCenter,
  summarizeDataSourceError,
  withTimeout
});
const {
  followupBriefPage,
  followupBriefText,
  followupWorkbenchPage,
  roleWorkbenchesPage
} = createFollowupPageRenderers({
  briefCopyPage,
  emptyPmcConsoleBody,
  escapeHtml,
  filterPmcOpenRisks,
  formatDateTime,
  latestPmcSnapshot,
  modulePage,
  modulePanel,
  parseBoolean,
  pmcClosureSummary,
  pmcMorningBriefText
});
const { orderCenterPage, orderDetailPage } = createOrdersPageRenderers({
  escapeHtml,
  formatDetailCell,
  formatNumber,
  labelFor,
  renderTopNav,
  sharedNavCss
});
const { procedureLinksPage } = createProcedureLinksPageRenderer({ escapeHtml, modulePage, modulePanel });
const {
  interventionLogCsv,
  interventionLogPage,
  reportCenterCsv,
  reportCenterExcel,
  reportCenterPage,
  reportPrintPage
} = createReportsPageRenderers({
  escapeHtml,
  formatDateTime,
  formatDetailCell,
  labelFor,
  modulePage,
  modulePanel,
  renderTopNav,
  sharedNavCss
});
const { systemStatusPage } = createSystemPageRenderers({ modulePage, modulePanel });
const {
  erpRequestLogCsv,
  erpRequestLogPage,
  historySyncBlockedPage,
  historySyncDryRunPage,
  historySyncFailurePage,
  historySyncPage,
  historySyncResultPage,
  historySyncWindowPage,
  historySyncWindowResultPage,
  pmcGoalPage,
  sqliteCoveragePage,
  syncPausePage,
  syncPausedPage,
  syncStatusPage
} = createSystemToolsPageRenderers({ escapeHtml, latestSyncRuns, modulePage, modulePanel });
const { userRolesPage } = createUserRolesPageRenderers({ modulePage, modulePanel, escapeHtml });
const { workshopBoardPage, workshopSectionScreenPage } = createWorkshopBoardPageRenderers({ modulePage, escapeHtml, formatCell, labelFor, parseBoolean });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const currentUser = currentAuthUser(req);

    if (req.method === "GET" && url.pathname === "/login") {
      return sendHtml(res, 200, loginPage({ next: url.searchParams.get("next") || "/", user: currentUser }));
    }

    if (req.method === "POST" && url.pathname === "/login") {
      const form = await readForm(req);
      const verified = verifyLocalAuthUser(form.username, form.password);
      if (!verified) {
        return sendHtml(res, 401, loginPage({ error: "用户名或密码不正确。", next: form.next || "/" }));
      }
      const session = createLocalAuthSession(verified);
      const nextPath = safeNextPath(form.next || "/");
      const redirectPath = requiresPasswordChange(verified) ? `/change-password?next=${encodeURIComponent(nextPath)}` : homePathForUser(verified, nextPath);
      return sendRedirect(res, redirectPath, {
        "Set-Cookie": sessionCookie(session)
      });
    }

    if (req.method === "GET" && url.pathname === "/logout") {
      const sessionId = cookieValue(req, "pmc_session");
      if (sessionId) {
        deleteLocalAuthSession(sessionId);
      }
      return sendRedirect(res, "/login", {
        "Set-Cookie": "pmc_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
      });
    }

    if (url.pathname === "/change-password") {
      if (!currentUser) {
        return sendAuthRequired(res, req, url);
      }
      if (req.method === "GET" || req.method === "HEAD") {
        return sendHtml(res, 200, changePasswordPage({ user: currentUser, next: url.searchParams.get("next") || "/" }));
      }
      if (req.method === "POST") {
        const form = await readForm(req);
        const nextPath = safeNextPath(form.next || "/");
        if (String(form.new_password || "") !== String(form.confirm_password || "")) {
          return sendHtml(res, 400, changePasswordPage({ user: currentUser, next: nextPath, error: "两次输入的新密码不一致。" }));
        }
        try {
          const changed = changeLocalAuthPassword({
            username: currentUser.username,
            current_password: form.current_password,
            new_password: form.new_password
          });
          return sendRedirect(res, homePathForUser(changed, nextPath));
        } catch (error) {
          return sendHtml(res, 400, changePasswordPage({ user: currentUser, next: nextPath, error: error.message }));
        }
      }
    }

    const authBlocked = authGuard(req, url, currentUser);
    if (authBlocked) {
      return authBlocked.status === 401
        ? sendAuthRequired(res, req, url)
        : authBlocked.status === 428
          ? sendPasswordResetRequired(res, req, url)
          : sendForbidden(res, req, currentUser, url.pathname);
    }

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/") {
      return sendHtml(res, 200, homePage());
    }

    if (req.method === "GET" && url.pathname === "/roles") {
      return sendHtml(res, 200, roleWorkbenchesPage());
    }

    if (req.method === "GET" && url.pathname === "/followup") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "pmc");
      const result = queryFollowupWorkbench(params);
      return sendHtml(res, 200, followupWorkbenchPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/followup/brief") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "pmc");
      const result = queryFollowupWorkbench(params);
      return sendHtml(res, 200, followupBriefPage(result.body, params));
    }

    if (req.method === "GET" && url.pathname === "/followup/brief.txt") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "pmc");
      const result = queryFollowupWorkbench(params);
      return sendText(res, 200, followupBriefText(result.body, params));
    }

    if (req.method === "GET" && url.pathname === "/pmc") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "pmc");
      const result = await queryPmcConsole(params);
      return sendHtml(res, 200, pmcConsolePage(result.body, params));
    }

    if (req.method === "GET" && url.pathname === "/pmc/brief.txt") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "pmc");
      const result = await queryPmcConsole(params);
      return sendText(res, 200, pmcMorningBriefText(result.body, params));
    }

    if (req.method === "GET" && url.pathname === "/pmc/brief") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "pmc");
      const result = await queryPmcConsole(params);
      return sendHtml(res, 200, pmcMorningBriefPage(result.body, params));
    }

    if (req.method === "GET" && url.pathname === "/pmc/intervention") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "pmc");
      return sendHtml(res, 200, pmcInterventionPage(params));
    }

    if (req.method === "POST" && url.pathname === "/pmc/intervention/save") {
      const rawParams = await readBodyParams(req);
      const params = authParams(rawParams, currentUser, "pmc");
      const saved = savePmcIntervention({
        ...rawParams,
        actor: rawParams.actor || currentUser?.display_name || currentUser?.username || "内网用户"
      });
      return sendHtml(res, 200, pmcInterventionPage(params, saved));
    }

    if (req.method === "GET" && url.pathname === "/procedure-links") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "production");
      return sendHtml(res, 200, procedureLinksPage(queryProcedureLinks(params)));
    }

    if (req.method === "POST" && url.pathname === "/procedure-links/save") {
      const rawParams = await readBodyParams(req);
      const params = authParams(rawParams, currentUser, "production");
      const saved = saveOrderProcedureLink({
        ...rawParams,
        actor: rawParams.actor || currentUser?.display_name || currentUser?.username || "内网用户"
      });
      return sendHtml(res, 200, procedureLinksPage(queryProcedureLinks(params, saved)));
    }

    if (req.method === "GET" && url.pathname === "/orders") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "orders");
      const result = await queryOrderCenter(params);
      return sendHtml(res, 200, orderCenterPage(result.body, url));
    }

    if (req.method === "GET" && url.pathname === "/order") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "orders");
      const result = await queryOrderDetail(params);
      return sendHtml(res, 200, orderDetailPage(result.body, url));
    }

    if (req.method === "GET" && url.pathname === "/materials") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "material");
      const result = await queryMaterialControl(params);
      return sendHtml(res, 200, materialControlPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/procurement") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "procurement");
      const result = await queryProcurementCenter(params);
      return sendHtml(res, 200, procurementCenterPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/finance") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "finance");
      const result = await queryFinanceCenter(params);
      return sendHtml(res, 200, financeCenterPage(result.body, params));
    }

    if (req.method === "GET" && url.pathname === "/quotes") {
      return sendRedirect(res, "/pmc?rebuild=1");
    }

    if (req.method === "GET" && url.pathname === "/foreign-trade") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "orders");
      return sendHtml(res, 200, foreignTradeBoardPage(queryForeignTradeBoard(params)));
    }

    if (req.method === "GET" && url.pathname === "/production") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "production");
      const result = parseBoolean(params.refresh) ? await queryProductionCenter(params) : await queryLocalProductionCenter(params);
      return sendHtml(res, 200, productionCenterPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/dispatch") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "production");
      const result = parseBoolean(params.refresh) ? await queryProductionCenter(params) : await queryLocalProductionCenter(params);
      return sendHtml(res, 200, dispatchTrackingPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/workshop-board") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "production");
      return sendHtml(res, 200, workshopBoardPage(queryWorkshopBoard(params)));
    }

    if (req.method === "GET" && WORKSHOP_ROUTE_TO_KEY[url.pathname]) {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "production");
      return sendHtml(res, 200, workshopSectionScreenPage(queryWorkshopBoard(params), WORKSHOP_ROUTE_TO_KEY[url.pathname], params));
    }

    if (req.method === "GET" && url.pathname === "/scheduling") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "orders");
      const result = await querySchedulingCenter(params);
      return sendHtml(res, 200, schedulingCenterPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/exceptions") {
      return sendRedirect(res, "/pmc?rebuild=1&open_only=1");
    }

    if (req.method === "GET" && url.pathname === "/interventions") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "pmc");
      return sendHtml(res, 200, interventionLogPage(queryInterventionLogCenter(params).body));
    }

    if (req.method === "GET" && url.pathname === "/interventions/export.csv") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "pmc");
      return sendCsv(res, "pmc-interventions.csv", interventionLogCsv(queryInterventionLogCenter(params).body));
    }

    if (req.method === "GET" && url.pathname === "/reports") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "reports");
      const result = await queryReportCenter(params);
      return sendHtml(res, 200, reportCenterPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/reports/export.csv") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "reports");
      const result = await queryReportCenter(params);
      return sendCsv(res, "pmc-report.csv", reportCenterCsv(result.body));
    }

    if (req.method === "GET" && url.pathname === "/reports/export.xls") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "reports");
      const result = await queryReportCenter(params);
      return sendExcel(res, "pmc-report.xls", reportCenterExcel(result.body));
    }

    if (req.method === "GET" && url.pathname === "/reports/print") {
      const params = authParams(Object.fromEntries(url.searchParams), currentUser, "reports");
      const result = await queryReportCenter(params);
      return sendHtml(res, 200, reportPrintPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/goal") {
      return sendHtml(res, 200, pmcGoalPage());
    }

    if (req.method === "GET" && url.pathname === "/system") {
      const params = Object.fromEntries(url.searchParams);
      const result = await querySystemStatus(params);
      return sendHtml(res, 200, systemStatusPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/user-roles") {
      const params = paramsObject(url.searchParams);
      return sendHtml(res, 200, userRolesPage(queryUserRoles(null, params).body));
    }

    if (req.method === "POST" && url.pathname === "/user-roles/auth-save") {
      const form = await readForm(req);
      const saved = saveLocalAuthUser({
        username: form.username,
        display_name: form.display_name,
        password: form.password,
        roles: form.roles,
        is_active: form.is_active === "0" ? 0 : 1,
        scopes: {
          owners: form.owners,
          customers: form.customers,
          workshops: form.workshops,
          warehouses: form.warehouses,
          counterparties: form.counterparties
        }
      });
      return sendRedirect(res, `/user-roles?result=auth_saved&name=${encodeURIComponent(saved.username)}`);
    }

    if (req.method === "POST" && url.pathname === "/user-roles/save") {
      const params = await readBodyParams(req);
      const saved = saveLocalUserRole(params);
      return sendRedirect(res, userRoleResultHref(saved));
    }

    if (req.method === "POST" && url.pathname === "/user-roles/reset-password") {
      const params = await readBodyParams(req);
      const reset = resetLocalUserPassword(params);
      return sendHtml(res, 200, userRolesPage(queryUserRoles(reset, params).body));
    }

    if (req.method === "POST" && url.pathname === "/user-roles/delete") {
      const params = await readBodyParams(req);
      const deleted = deleteLocalUserRole(params.name);
      return sendRedirect(res, userRoleResultHref({ ...deleted, deleted_role: true }));
    }

    if (req.method === "GET" && url.pathname === "/sqlite-coverage") {
      const result = querySqliteCoverage();
      return sendHtml(res, 200, sqliteCoveragePage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/history-sync") {
      const params = Object.fromEntries(url.searchParams);
      return sendHtml(res, 200, historySyncPage(queryHistorySyncCenter(params).body));
    }

    if (req.method === "GET" && url.pathname === "/history-sync/dry-run") {
      const params = Object.fromEntries(url.searchParams);
      return sendHtml(res, 200, historySyncDryRunPage(historySyncDryRun(params)));
    }

    if (req.method === "GET" && url.pathname === "/history-sync/window") {
      const params = Object.fromEntries(url.searchParams);
      return sendHtml(res, 200, historySyncWindowPage(historySyncWindowParams(params)));
    }

    if (req.method === "POST" && url.pathname === "/history-sync/window/run") {
      const params = await readBodyParams(req);
      const pauseGuard = syncPauseGuard();
      if (pauseGuard.blocked) {
        return sendHtml(res, 423, syncPausedPage(pauseGuard.status));
      }
      const guard = shouldBlockErpBusinessQuery({
        protectionMode: ERP_PROTECTION_MODE,
        health: queryErpHealth().health,
        params
      });
      if (guard.blocked) {
        return sendHtml(res, 503, historySyncBlockedPage(guard.reason));
      }
      try {
        const result = await runHistorySyncWindowWithRecord(params);
        return sendHtml(res, 200, historySyncWindowResultPage(result));
      } catch (error) {
        return sendHtml(res, 500, historySyncFailurePage(params, summarizeDataSourceError(error)));
      }
    }

    if (req.method === "POST" && url.pathname === "/history-sync/run") {
      const params = await readBodyParams(req);
      const pauseGuard = syncPauseGuard();
      if (pauseGuard.blocked) {
        return sendHtml(res, 423, syncPausedPage(pauseGuard.status));
      }
      const guard = shouldBlockErpBusinessQuery({
        protectionMode: ERP_PROTECTION_MODE,
        health: queryErpHealth().health,
        params
      });
      if (guard.blocked) {
        return sendHtml(res, 503, historySyncBlockedPage(guard.reason));
      }
      try {
        const result = await runHistorySyncBatchWithRecord(params);
        return sendHtml(res, 200, historySyncResultPage(result));
      } catch (error) {
        return sendHtml(res, 500, historySyncFailurePage(params, summarizeDataSourceError(error)));
      }
    }

    if (req.method === "POST" && url.pathname === "/api/history_sync/run") {
      const params = await readBodyParams(req);
      const pauseGuard = syncPauseGuard();
      if (pauseGuard.blocked) {
        return sendJson(res, 423, { error: pauseGuard.reason, sync_pause: pauseGuard.status });
      }
      const guard = shouldBlockErpBusinessQuery({
        protectionMode: ERP_PROTECTION_MODE,
        health: queryErpHealth().health,
        params
      });
      if (guard.blocked) {
        return sendJson(res, 503, { error: guard.reason, health: queryErpHealth().health });
      }
      return sendJson(res, 200, await runHistorySyncBatchWithRecord(params));
    }

    if (req.method === "GET" && url.pathname === "/api/history_sync/dry-run") {
      const params = Object.fromEntries(url.searchParams);
      return sendJson(res, 200, historySyncDryRun(params));
    }

    if (req.method === "GET" && url.pathname === "/api/history_sync/window") {
      const params = Object.fromEntries(url.searchParams);
      return sendJson(res, 200, historySyncWindowParams(params));
    }

    if (req.method === "POST" && url.pathname === "/api/history_sync/window/run") {
      const params = await readBodyParams(req);
      const pauseGuard = syncPauseGuard();
      if (pauseGuard.blocked) {
        return sendJson(res, 423, { error: pauseGuard.reason, sync_pause: pauseGuard.status });
      }
      const guard = shouldBlockErpBusinessQuery({
        protectionMode: ERP_PROTECTION_MODE,
        health: queryErpHealth().health,
        params
      });
      if (guard.blocked) {
        return sendJson(res, 503, { error: guard.reason, health: queryErpHealth().health });
      }
      return sendJson(res, 200, await runHistorySyncWindowWithRecord(params));
    }

    if (req.method === "GET" && url.pathname === "/erp-logs") {
      const params = Object.fromEntries(url.searchParams);
      const result = queryErpRequestLogCenter(params);
      return sendHtml(res, 200, erpRequestLogPage(result.body));
    }

    if (req.method === "GET" && url.pathname === "/erp-logs/export.csv") {
      const params = Object.fromEntries(url.searchParams);
      const result = queryErpRequestLogCenter(params);
      return sendCsv(res, "erp-request-logs.csv", erpRequestLogCsv(result.body));
    }

    if (req.method === "GET" && url.pathname === "/sync") {
      return sendHtml(res, 200, syncStatusPage({ results: [], latest: latestSyncRuns() }));
    }

    if (req.method === "POST" && url.pathname === "/sync") {
      const params = { pagesize: DEFAULT_SYNC_PAGE_SIZE, ...(await readBodyParams(req)) };
      const pauseGuard = syncPauseGuard();
      if (pauseGuard.blocked) {
        return sendHtml(res, 423, syncPausedPage(pauseGuard.status));
      }
      const result = await syncCoreData(client, params);
      return sendHtml(res, 200, syncStatusPage(result));
    }

    if (req.method === "POST" && url.pathname === "/api/sync") {
      const params = { pagesize: DEFAULT_SYNC_PAGE_SIZE, ...(await readBodyParams(req)) };
      const pauseGuard = syncPauseGuard();
      if (pauseGuard.blocked) {
        return sendJson(res, 423, { error: pauseGuard.reason, sync_pause: pauseGuard.status });
      }
      const result = await syncCoreData(client, params);
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && url.pathname === "/sync-pause") {
      return sendHtml(res, 200, syncPausePage(syncPauseStatus()));
    }

    if (req.method === "POST" && url.pathname === "/sync-pause") {
      const params = await readBodyParams(req);
      const state = params.state;
      const status = state === "off" || state === "0"
        ? setSyncPaused(false)
        : state === "on" || state === "1"
          ? setSyncPaused(true)
          : syncPauseStatus();
      return sendHtml(res, 200, syncPausePage(status));
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true, service: "erp-query-hub" });
    }

    if (req.method === "GET" && url.pathname === "/api/erp_health") {
      return sendJson(res, 200, queryErpHealth());
    }

    if (req.method === "GET" && url.pathname === "/api/daily_sync/status") {
      return sendJson(res, 200, dailySyncScheduler?.status?.() || { enabled: false, message: "每日增量同步尚未启动。" });
    }

    if (req.method === "POST" && url.pathname === "/api/ai/chat") {
      const payload = { ...(await readJson(req)), auth_user: currentUser };
      return sendJson(res, 200, queryAiChat(payload));
    }

    if (req.method === "GET" && url.pathname === "/api/ai/logs") {
      return sendJson(res, 200, { rows: listAiChatLogs({ limit: clampInt(url.searchParams.get("limit") || 20, 1, 100) }) });
    }

    if (req.method === "GET" && url.pathname === "/views") {
      return sendJson(res, 200, {
        views: {
          ...Object.fromEntries(Object.entries(ERP_VIEWS).map(([key, view]) => [key, describeView(view)])),
          pmc_exceptions: {
            name: "PMC异常视图",
            allowedParams: ["searchKey", "pageindex", "pagesize"]
          },
          contract_lines: {
            name: "销售合同明细视图",
            allowedParams: ["ord"]
          },
          contract_shortages: {
            name: "合同缺料分析视图",
            allowedParams: ["ord", "contract_ord", "cks", "scan_size", "scan_pages"]
          },
          order_shortages: {
            name: "订单缺料扫描视图",
            allowedParams: ["searchKey", "pageindex", "pagesize", "contract_limit", "limit", "scan_size", "cks", "stype", "include_all"]
          },
          order_delivery_risks: {
            name: "订单交期风险视图",
            allowedParams: ["searchKey", "pageindex", "pagesize", "contract_limit", "limit", "due_soon_days", "today", "stype", "include_all"]
          },
          inventory_alerts: {
            name: "库存异常视图",
            allowedParams: ["cks", "searchKey", "title", "order1", "scan_size", "scan_pages", "alert_limit", "low_stock_threshold", "old_stock_days"]
          },
          pmc_dashboard: {
            name: "PMC综合看板",
            allowedParams: [
              "searchKey",
              "pageindex",
              "pagesize",
              "scan_size",
              "scan_pages",
              "alert_limit",
              "low_stock_threshold",
              "old_stock_days",
              "today",
              "contract_limit",
              "order_pagesize",
              "order_scan_size",
              "due_soon_days",
              "quote_pagesize",
              "quote_limit",
              "cks"
            ]
          },
          pmc_console: {
            name: "PMC驾驶舱首页",
            allowedParams: ["today", "owner", "scan_size", "scan_pages", "alert_limit", "contract_limit", "due_soon_days", "quote_limit", "low_stock_threshold", "old_stock_days"]
          },
          order_center: {
            name: "订单管理中心",
            allowedParams: ["searchKey", "pageindex", "pagesize", "contract_limit", "due_soon_days", "scan_size", "status"]
          },
          order_detail: {
            name: "订单穿透详情",
            allowedParams: ["ord", "due_soon_days", "scan_size", "cks", "today"]
          }
        }
      });
    }

    if (req.method === "GET" && url.pathname === "/agent/tool-schema") {
      return sendJson(res, 200, agentToolSchema());
    }

    const viewMatch = url.pathname.match(/^\/api\/([^/]+)$/);
    if (viewMatch && (req.method === "GET" || req.method === "POST")) {
      const viewName = viewMatch[1];
      const params = req.method === "GET" ? Object.fromEntries(url.searchParams) : await readJson(req);
      const healthPayload = queryErpHealth();
      const apiGuard = shouldBlockErpBusinessQuery({
        protectionMode: ERP_PROTECTION_MODE,
        health: healthPayload.health,
        params
      });
      if (apiGuard.blocked) {
        return sendJson(res, 503, {
          error: apiGuard.reason,
          view: viewName,
          health: healthPayload.health,
          queue: healthPayload.queue,
          hint: "先查看 /api/erp_health 或 /erp-logs；确认 ERP 稳定后可加 force_erp=1。"
        });
      }

      const result =
        viewName === "pmc_exceptions"
          ? await client.queryPmcExceptions(params)
          : viewName === "contract_lines"
            ? await client.queryContractLines(params)
          : viewName === "contract_shortages"
            ? await client.queryContractShortages(params)
          : viewName === "order_shortages"
            ? await queryOrderShortages(client, params)
          : viewName === "order_delivery_risks"
            ? await queryOrderDeliveryRisks(client, params)
          : viewName === "pending_quotes"
            ? await queryPendingQuotes(client, params)
          : viewName === "inventory_alerts"
            ? await client.queryInventoryAlerts(params)
          : viewName === "pmc_dashboard"
            ? await queryPmcDashboard(params)
          : viewName === "pmc_console"
            ? await queryPmcConsole(params)
          : viewName === "order_center"
            ? await queryOrderCenter(params)
          : viewName === "order_detail"
            ? await queryOrderDetail(params)
          : await client.queryView(viewName, params);

      const normalized =
        viewName === "pmc_exceptions" ||
        viewName === "contract_lines" ||
        viewName === "contract_shortages" ||
        viewName === "order_shortages" ||
        viewName === "order_delivery_risks" ||
        viewName === "pending_quotes" ||
        viewName === "inventory_alerts" ||
        viewName === "pmc_dashboard" ||
        viewName === "pmc_console" ||
        viewName === "order_center" ||
        viewName === "order_detail"
          ? result.body
          : normalizeTable(result);

      const payload = {
        view: viewName,
        business: toBusinessView(viewName, normalized),
        normalized,
        raw: result
      };
      if (wantsHtml(req, url)) {
        return sendHtml(res, 200, apiResultPage(payload, url));
      }
      return sendJson(res, 200, payload);
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ERP query hub listening on http://${HOST}:${PORT}`);
  dailySyncScheduler = startDailySyncScheduler({
    enabled: DAILY_SYNC_ENABLED,
    logger: console,
    runDailySync: ({ now }) => runDailyIncrementalSync({
      now,
      runHistoryWindow: runHistorySyncWindowWithRecord,
      syncSnapshots: (params) => syncCoreData(client, params),
      syncPauseGuard,
      logger: console
    })
  });
  if (ERP_PROTECTION_MODE) {
    console.log("ERP protection mode enabled: startup sync and automatic ERP status login are disabled.");
    return;
  }
  syncCoreData(client, { pagesize: DEFAULT_SYNC_PAGE_SIZE, sources: "sales_orders" }).then((result) => {
    console.log(`Startup sync finished: ${result.results.map((row) => `${row.status}:${row.rows_synced}`).join(", ")}`);
  }).catch((error) => {
    console.error("Startup sync failed", error);
  });
});

function describeView(view) {
  return {
    name: view.name,
    path: view.path,
    allowedParams: view.allowedParams
  };
}

function currentAuthUser(req) {
  const sessionId = cookieValue(req, "pmc_session");
  return sessionId ? getLocalAuthSession(sessionId) : null;
}

function authGuard(req, url, user) {
  if (url.pathname === "/health" || url.pathname === "/login" || url.pathname === "/logout") {
    return null;
  }
  if (!user) {
    return { status: 401 };
  }
  if (requiresPasswordChange(user) && url.pathname !== "/change-password") {
    return { status: 428 };
  }
  if (!canAccessPath(user, url.pathname)) {
    return { status: 403 };
  }
  return null;
}

function authParams(params, user, resource) {
  const nextParams = { ...params, auth_user: user };
  if (user && resource === "pmc" && !hasFullDataAccess(user, "pmc") && !nextParams.owner) {
    nextParams.owner = user.display_name || user.name || user.username;
  }
  return nextParams;
}

function cookieValue(req, name) {
  const cookie = String(req.headers.cookie || "");
  const prefix = `${name}=`;
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length) || "";
}

function sessionCookie(session) {
  return `pmc_session=${session.session_id}; HttpOnly; Path=/; SameSite=Lax; Expires=${new Date(session.expires_at).toUTCString()}`;
}

function safeNextPath(value = "/") {
  const next = String(value || "/").trim();
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("://")) {
    return "/";
  }
  return next;
}

function sendAuthRequired(res, req, url) {
  if (isApiRequest(req, url)) {
    return sendJson(res, 401, { error: "未登录，请先登录。", login: "/login" });
  }
  return sendRedirect(res, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
}

function sendPasswordResetRequired(res, req, url) {
  const next = encodeURIComponent(url.pathname + url.search);
  if (isApiRequest(req, url)) {
    return sendJson(res, 428, { error: "首次登录需先修改密码。", change_password: `/change-password?next=${next}` });
  }
  return sendRedirect(res, `/change-password?next=${next}`);
}

function sendForbidden(res, req, user, path) {
  if (isApiRequest(req, { pathname: path })) {
    return sendJson(res, 403, { error: "无权访问该功能。", user: user?.username || "" });
  }
  return sendHtml(res, 403, accessDeniedPage(user, path));
}

function isApiRequest(req, url) {
  return String(url.pathname || "").startsWith("/api/") || String(req.headers.accept || "").includes("application/json");
}

function loginPage({ error = "", next = "/", user = null } = {}) {
  if (user) {
    const homePath = requiresPasswordChange(user) ? `/change-password?next=${encodeURIComponent(safeNextPath(next))}` : homePathForUser(user, next);
    const actionText = requiresPasswordChange(user) ? "修改密码" : "进入工作台";
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>已登录</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f6f8;color:#172033;"><main style="max-width:520px;margin:12vh auto;padding:24px;background:white;border:1px solid #d9dee7;border-radius:8px;"><h1>已登录</h1><p>${escapeHtml(user.display_name || user.username)} 已登录。</p><p><a href="${escapeHtml(homePath)}">${escapeHtml(actionText)}</a> · <a href="/logout">退出登录</a></p></main></body></html>`;
  }
  const safeNext = safeNextPath(next);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>登录 - 蕴杰金属数字 PMC 控制台</title>
  <style>
    body { margin:0; min-height:100vh; display:grid; place-items:center; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:#f4f6f8; color:#172033; }
    main { width:min(420px, calc(100% - 28px)); padding:24px; border:1px solid #d9dee7; border-radius:8px; background:#fff; }
    h1 { margin:0 0 8px; font-size:24px; }
    p { margin:0 0 18px; color:#667085; line-height:1.6; }
    label { display:block; margin-top:12px; color:#667085; font-size:13px; }
    input { width:100%; min-height:42px; margin-top:6px; padding:9px 10px; border:1px solid #d9dee7; border-radius:6px; font-size:15px; box-sizing:border-box; }
    button { width:100%; min-height:44px; margin-top:18px; border:0; border-radius:6px; background:#176b58; color:#fff; font-size:15px; font-weight:650; cursor:pointer; }
    .error { margin:12px 0 0; padding:10px 12px; border-radius:6px; background:#fee4e2; color:#b42318; }
  </style>
</head>
<body>
  <main>
    <h1>登录 PMC 控制台</h1>
    <p>请输入本地中台账号。默认管理员账号可在系统页中维护其他用户、多角色和数据范围。</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    <form method="post" action="/login">
      <input type="hidden" name="next" value="${escapeHtml(safeNext)}">
      <label>用户名<input name="username" autocomplete="username" required></label>
      <label>密码<input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit">登录</button>
    </form>
  </main>
</body>
</html>`;
}

function changePasswordPage({ error = "", next = "/", user = null } = {}) {
  const safeNext = safeNextPath(next);
  const isRequired = requiresPasswordChange(user);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>修改密码 - 蕴杰金属数字 PMC 控制台</title>
  <style>
    body { margin:0; min-height:100vh; display:grid; place-items:center; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:#f4f6f8; color:#172033; }
    main { width:min(440px, calc(100% - 28px)); padding:24px; border:1px solid #d9dee7; border-radius:8px; background:#fff; }
    h1 { margin:0 0 8px; font-size:24px; }
    p { margin:0 0 18px; color:#667085; line-height:1.6; }
    label { display:block; margin-top:12px; color:#667085; font-size:13px; }
    input { width:100%; min-height:42px; margin-top:6px; padding:9px 10px; border:1px solid #d9dee7; border-radius:6px; font-size:15px; box-sizing:border-box; }
    button { width:100%; min-height:44px; margin-top:18px; border:0; border-radius:6px; background:#176b58; color:#fff; font-size:15px; font-weight:650; cursor:pointer; }
    .error { margin:12px 0 0; padding:10px 12px; border-radius:6px; background:#fee4e2; color:#b42318; }
    .tip { margin-top:12px; padding:10px 12px; border-radius:6px; background:#f2f4f7; color:#475467; font-size:13px; line-height:1.6; }
  </style>
</head>
<body>
  <main>
    <h1>${isRequired ? "首次登录请修改密码" : "修改密码"}</h1>
    <p>${escapeHtml(user?.display_name || user?.username || "当前用户")}，密码需同时包含字母和数字，长度大于 6 位。</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    <form method="post" action="/change-password">
      <input type="hidden" name="next" value="${escapeHtml(safeNext)}">
      <label>当前密码<input name="current_password" type="password" autocomplete="current-password" required></label>
      <label>新密码<input name="new_password" type="password" autocomplete="new-password" required></label>
      <label>确认新密码<input name="confirm_password" type="password" autocomplete="new-password" required></label>
      <button type="submit">保存新密码</button>
    </form>
    <div class="tip">非 admin 用户首次登录必须完成改密。忘记当前密码时，请联系管理员重置。</div>
    <p style="margin-top:16px;"><a href="/logout">退出登录</a></p>
  </main>
</body>
</html>`;
}

function accessDeniedPage(user, path) {
  return modulePage({
    title: "无权访问",
    subtitle: `${user?.display_name || user?.username || "当前用户"} 没有访问 ${path} 的权限。`,
    summary: [
      ["当前用户", user?.display_name || user?.username || ""],
      ["角色", (user?.roles || []).join("、") || "未配置"]
    ],
    panels: [
      modulePanel("可尝试入口", [
        { name: "PMC驾驶舱", path: "/pmc", note: "查看与当前角色相关的风险和待办。" },
        { name: "首页", path: "/", note: "回到当前角色可访问的入口。" },
        { name: "退出登录", path: "/logout", note: "切换其他账号。" }
      ], ["name", "path", "note"])
    ],
    notes: ["如需访问该功能，请联系系统管理员在“用户信息维护”中补充角色或数据范围。"]
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function readBodyParams(req) {
  const contentType = String(req.headers["content-type"] || "");
  return contentType.includes("application/json") ? readJson(req) : readForm(req);
}

function readForm(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      resolve(paramsObject(new URLSearchParams(body)));
    });
    req.on("error", reject);
  });
}

function paramsObject(searchParams) {
  const result = {};
  for (const [key, value] of searchParams) {
    if (Object.hasOwn(result, key) && result[key]) {
      result[key] = `${result[key]}、${value}`;
    } else {
      result[key] = value;
    }
  }
  return result;
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(payload, null, 2));
}

function sendHtml(res, status, html, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", ...headers });
  res.end(html);
}

function sendRedirect(res, location, headers = {}) {
  res.writeHead(303, { Location: location, ...headers });
  res.end();
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendCsv(res, filename, csv) {
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`
  });
  res.end(`\ufeff${csv}`);
}

function sendExcel(res, filename, html) {
  res.writeHead(200, {
    "Content-Type": "application/vnd.ms-excel; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`
  });
  res.end(`\ufeff${html}`);
}

function formatDetailCell(column, value, row = {}) {
  if (/^entry_\d+$/.test(column) && value) {
    return `<a href="${escapeHtml(value)}">${escapeHtml(value)}</a>`;
  }
  if (column === "risk_type") {
    const label = value === "overdue" ? "逾期" : value === "due_soon" ? "7天内到期" : value;
    const tone = value === "overdue" ? "red" : value === "due_soon" ? "yellow" : "green";
    return `<span class="pill ${tone}">${escapeHtml(label || "")}</span>`;
  }
  if (column === "risk_status") {
    return `<span class="pill ${escapeHtml(financeRiskTone(value))}">${escapeHtml(value || "")}</span>`;
  }
  if (["amount", "paid_amount", "unpaid_amount", "estimated_amount", "quoted_amount", "usd_amount"].includes(column)) {
    return `<span class="money-cell">${escapeHtml(formatMoneyCell(value))}</span>`;
  }
  if (column === "due_days" || column === "earliest_due_days") {
    return formatDueDaysCell(value);
  }
  if (column === "buttons" && Array.isArray(value)) {
    return `<div class="action-buttons">${value
      .map((label) => `<a class="button" href="${escapeHtml(pmcInterventionHref(row, label))}">${escapeHtml(label)}</a>`)
      .join("")}</div>`;
  }
  if (column === "owner_link") {
    const owner = row?.owner_link || row?.owner || "";
    return owner ? `<a href="/followup?owner=${encodeURIComponent(owner)}">进入</a>` : "";
  }
  if (column === "link_action" && value) {
    return `<a class="button" href="${escapeHtml(value)}">绑定</a>`;
  }
  if (column === "bind_action" && value) {
    return `<a class="button" href="${escapeHtml(value)}">预填绑定</a>`;
  }
  if (column === "intervention_action" && value) {
    return `<a class="button" href="${escapeHtml(value)}">处理</a>`;
  }
  if (column === "morning_action") {
    return `<a class="button" href="${escapeHtml(pmcInterventionHref(row, row.action_label || "记录处理"))}">处理</a>`;
  }
  if (column === "intervention_log" && value) {
    return `<div class="action-buttons"><a class="button" href="${escapeHtml(value)}">查看</a></div>`;
  }
  if (column === "role_action" && value) {
    return renderActionCell(value, "标记跟单");
  }
  if (column === "exclude_action" && value) {
    return renderActionCell(value, "标记非跟单");
  }
  if (column === "edit_action" && value) {
    return `<a class="button" href="${escapeHtml(value)}">编辑</a>`;
  }
  if (column === "delete_action" && value) {
    return renderActionCell(value, "删除");
  }
  if (column === "toggle_action" && value) {
    return renderActionCell(value, "切换");
  }
  if (column === "reset_action" && value) {
    return renderActionCell(value, "重置密码");
  }
  if (["quantity", "demand_qty", "delivered_qty", "remaining_qty", "available_qty", "stock_qty", "shortage_qty", "planned_qty", "finished_qty"].includes(column)) {
    return escapeHtml(formatPmcQuantity(value, row?.unit || row?.raw?.unit || row?.raw?.raw?.Unit || row?.raw?.raw?.单位));
  }
  return formatCell(value);
}

function renderActionCell(value, fallbackLabel) {
  if (value && typeof value === "object") {
    const label = value.label || fallbackLabel;
    const href = value.href || value.action || "";
    return String(value.method || "").toLowerCase() === "post"
      ? renderPostButtonFromHref(label, href, "button")
      : `<a class="button" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
  }
  return `<a class="button" href="${escapeHtml(value)}">${escapeHtml(fallbackLabel)}</a>`;
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

function financeRiskTone(value) {
  if (value === "已逾期") return "red";
  if (value === "7天内到期" || value === "未清") return "yellow";
  if (value === "未到期" || value === "已结清") return "green";
  return "gray";
}

function formatMoneyCell(value) {
  if (value === undefined || value === null || value === "") return "";
  const number = parseNumber(value);
  if (number === null) return String(value ?? "");
  return number.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDueDaysCell(value) {
  if (value === undefined || value === null || value === "") return "";
  const number = parseNumber(value);
  if (number === null) return escapeHtml(value);
  const rounded = Math.round(number);
  const text = rounded < 0 ? `逾期${Math.abs(rounded)}天` : rounded === 0 ? "今天到期" : `${rounded}天`;
  const tone = rounded < 0 ? "red" : rounded <= 7 ? "yellow" : "green";
  return `<span class="pill ${tone} due-days-pill">${escapeHtml(text)}</span>`;
}

function wantsHtml(req, url) {
  if (url.searchParams.get("format") === "json") {
    return false;
  }
  if (url.searchParams.get("format") === "html") {
    return true;
  }
  return (req.headers.accept || "").includes("text/html");
}

function summarizeDataSourceError(error) {
  const message = error?.message || String(error || "未知错误");
  if (/Service Unavailable|HTTP Error 503|503/.test(message)) {
    return "ERP 服务临时不可用，请稍后刷新。";
  }
  if (/non-JSON response/i.test(message)) {
    return "ERP 返回了非标准数据，请稍后刷新或检查接口状态。";
  }
  return message.length > 120 ? `${message.slice(0, 120)}...` : message;
}

function cleanUrlScript(pathname) {
  return `<script>if (window.history && window.history.replaceState) window.history.replaceState(null, "", ${JSON.stringify(pathname)});</script>`;
}

async function runHistorySyncWindowWithRecord(params = {}) {
  return runHistorySyncWindow({
    ...params,
    runPage: async (pageParams) => {
      const guard = shouldBlockErpBusinessQuery({
        protectionMode: ERP_PROTECTION_MODE,
        health: queryErpHealth().health,
        params: pageParams
      });
      if (guard.blocked) {
        throw new Error(guard.reason);
      }
      return runHistorySyncBatchWithRecord(pageParams);
    }
  });
}

async function runHistorySyncBatchWithRecord(params = {}) {
  const plan = historySyncParams(params);
  const run = startHistorySyncRun({
    source: plan.source,
    page_index: plan.pageIndex,
    page_size: plan.pageSize,
    start_date: plan.range.start_date,
    end_date: plan.range.end_date
  });
  try {
    const result = await runHistorySyncBatch(client, params);
    finishHistorySyncRun(run.id, { status: "success", rows_synced: result.rows_synced });
    return result;
  } catch (error) {
    finishHistorySyncRun(run.id, { status: "failed", rows_synced: 0, error_message: summarizeDataSourceError(error) });
    throw error;
  }
}

function queryErpHealth() {
  const syncRuns = latestSyncRuns();
  const requestLogs = latestErpRequestLogs(20);
  const queue = client.requestQueue.snapshot();
  const syncPolicyRows = buildSyncPolicyRows({
    latestRuns: syncRuns,
    cooldownSeconds: DEFAULT_SYNC_COOLDOWN_SECONDS
  });
  const health = buildErpHealthSummary({ queue, requestLogs, syncPolicyRows });
  return {
    generated_at: new Date().toISOString(),
    service: "erp-query-hub",
    protection_mode: ERP_PROTECTION_MODE ? "enabled" : "disabled",
    health,
    queue,
    sync_policy: syncPolicyRows,
    recent_request_logs: requestLogs
  };
}

async function querySystemStatus(params = {}) {
  const startedAt = Date.now();
  let erpStatus;
  const shouldCheckErp = parseBoolean(params.check_erp) || !ERP_PROTECTION_MODE;
  if (!shouldCheckErp) {
    erpStatus = {
      ok: null,
      message: "ERP保护模式已开启，未主动登录检测。",
      latency_ms: 0,
      session_tail: ""
    };
  } else {
    try {
      const session = await client.login();
      erpStatus = {
        ok: true,
        message: "ERP 登录接口正常",
        latency_ms: Date.now() - startedAt,
        session_tail: session ? String(session).slice(-6) : ""
      };
    } catch (error) {
      erpStatus = {
        ok: false,
        message: summarizeDataSourceError(error),
        latency_ms: Date.now() - startedAt,
        session_tail: ""
      };
    }
  }
  const snapshot = latestPmcSnapshot();
  const riskSummary = standardRiskSummary();
  const syncRuns = latestSyncRuns();
  const erpRequestLogs = latestErpRequestLogs(20);
  const erpQueue = client.requestQueue.snapshot();
  const syncPolicyRows = buildSyncPolicyRows({
    latestRuns: syncRuns,
    cooldownSeconds: DEFAULT_SYNC_COOLDOWN_SECONDS
  });
  let pmcTrustSections = { data_trust_summary: [], data_freshness: [] };
  try {
    const localPmcDashboard = queryLocalPmcDashboard({ local_limit: 5000 });
    pmcTrustSections = {
      data_trust_summary: localPmcDashboard?.sections?.data_trust_summary || [],
      data_freshness: localPmcDashboard?.sections?.data_freshness || []
    };
  } catch (error) {
    pmcTrustSections = {
      data_trust_summary: [{
        trust_status: "需复核",
        trust_score: 0,
        trusted_sources: "",
        attention_sources: "PMC本地看板",
        latest_synced_at: "",
        decision_guardrail: "数据可信度生成失败，关键决策需人工复核",
        suggested_action: summarizeDataSourceError(error)
      }],
      data_freshness: []
    };
  }
  const modules = [
    ["PMC 驾驶舱", "/pmc", snapshot ? "可用：支持本地快照" : "可用：无快照时显示离线空看板"],
    ["订单管理中心", "/orders", "可用：默认读取本地快照，支持刷新实时订单"],
    ["生产进度中心", "/production", "可用：派工、工序汇报、产能压力和排产视图已合并"],
    ["车间电子看板", "/workshop-board", "可用：轧制、冲压、钨钼三大工段大屏"],
    ["物料采购中心", "/materials", "可用：物料风险、库存批次、采购跟催已合并"],
    ["应收应付中心", "/finance", "可用：应收/应付数据源局部容错"],
    ["报表中心", "/reports", "可用：支持快照、CSV、Excel、打印版"],
    ["系统页面", "/system", "可用：同步、覆盖率、日志、角色维护集中入口"]
  ];

  return {
    header: { status: 0, message: "ok" },
    body: {
      model: "system_status",
      generated_at: new Date().toISOString(),
      summary: {
        erp_online: erpStatus.ok === null ? null : erpStatus.ok ? 1 : 0,
        erp_protection_mode: ERP_PROTECTION_MODE ? "开启" : "关闭",
        sync_paused: syncPauseStatus().paused ? "已暂停" : "未暂停",
        erp_latency_ms: erpStatus.latency_ms,
        erp_request_min_interval_ms: ERP_REQUEST_MIN_INTERVAL_MS,
        erp_queue_queued: erpQueue.queued,
        erp_queue_running: erpQueue.running,
        erp_request_failed: erpQueue.failed,
        erp_request_log_failures: erpRequestLogs.filter((row) => row.status === "failed").length,
        has_snapshot: snapshot ? 1 : 0,
        module_count: modules.length,
        sync_sources: syncRuns.length,
        sync_failures: syncRuns.filter((row) => row.status === "failed").length,
        sync_in_cooldown: syncPolicyRows.filter((row) => row.health_status === "冷却中").length
      },
      sections: {
        erp_status: [erpStatus],
        sync_pause: [syncPauseStatus()],
        erp_queue: [erpQueue],
        erp_request_logs: erpRequestLogs,
        snapshot: snapshot
          ? [{
              created_at: snapshot.created_at,
              today_orders: snapshot.summary.today_orders,
              month_orders: snapshot.summary.month_orders,
              overdue_orders: snapshot.summary.overdue_orders,
              shortage_orders: snapshot.summary.shortage_orders,
              low_stock: snapshot.summary.low_stock
            }]
          : [],
        standard_risk_summary: [{
          source_table: "standard_risks",
          generated_at: riskSummary.generated_at,
          total_risks: riskSummary.total_risks,
          open_risks: riskSummary.open_risks,
          red_risks: riskSummary.red_risks,
          yellow_risks: riskSummary.yellow_risks
        }],
        modules: modules.map(([name, path, status]) => ({ name, path, status })),
        data_trust_summary: pmcTrustSections.data_trust_summary,
        data_freshness: pmcTrustSections.data_freshness,
        user_roles: listLocalUserRoles({ limit: 20 }),
        sync_runs: syncRuns,
        sync_policy: syncPolicyRows
      },
      notes: [
        erpStatus.ok === null ? erpStatus.message : erpStatus.ok ? "ERP 实时接口当前可用。" : `ERP 实时接口当前不可用：${erpStatus.message}`,
        syncPauseStatus().paused ? "同步暂停模式已开启，手动同步和历史同步执行入口不会访问 ERP。" : "同步暂停模式未开启。",
        snapshot ? `最近本地快照时间：${formatDateTime(snapshot.created_at)}。` : "当前没有本地驾驶舱快照。",
        syncRuns.length ? "最近同步状态来自本地 SQLite sync_runs 表。" : "当前还没有业务数据同步记录。",
        "此页面默认只读本地状态；点击“检测ERP登录”才会访问 ERP 登录接口。"
      ]
    }
  };
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`数据源响应超过 ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

function agentToolSchema() {
  return {
    name: "query_erp",
    description: "查询智邦 ERP 的只读业务视图和本地保护状态，返回适合对话分析的结构化数据。",
    input_schema: {
      type: "object",
      required: ["view"],
      properties: {
        view: {
          type: "string",
          enum: [
            "sales_orders",
            "contract_detail",
            "contract_lines",
            "contract_shortages",
            "order_shortages",
            "order_delivery_risks",
            "projects",
            "inventory",
            "inventory_details",
            "warehouses",
            "products",
            "stock_in_records",
            "stock_in_details",
            "production_progress",
            "material_orders",
            "production_boms",
            "procedure_plans",
            "receivables",
            "payables",
            "pmc_exceptions",
            "inventory_alerts",
            "pmc_dashboard",
            "pmc_console",
            "order_center",
            "order_detail",
            "erp_health"
          ],
          description: "要查询的业务视图。"
        },
        filters: {
          type: "object",
          description: "查询条件。常用：pageindex、pagesize、searchKey、khmc、htbh、title、ord。"
        }
      }
    },
    examples: [
      {
        user: "先检查 ERP 中台现在是否适合查询",
        call: { view: "erp_health", filters: {} }
      },
      {
        user: "查一下今天最新的销售订单",
        call: { view: "sales_orders", filters: { pageindex: 1, pagesize: 10 } }
      },
      {
        user: "有哪些未发货未收款订单？",
        call: { view: "pmc_exceptions", filters: { pageindex: 1, pagesize: 10 } }
      },
      {
        user: "查一下合同明细",
        call: { view: "contract_lines", filters: { ord: 12345 } }
      },
      {
        user: "打开这个订单的穿透详情",
        call: { view: "order_detail", filters: { ord: 12345, due_soon_days: 7, scan_size: 100 } }
      },
      {
        user: "分析这个合同有没有缺料",
        call: { view: "contract_shortages", filters: { ord: 12345, scan_size: 100 } }
      },
      {
        user: "最近哪些订单缺料？",
        call: { view: "order_shortages", filters: { pageindex: 1, pagesize: 10, contract_limit: 5, scan_size: 100 } }
      },
      {
        user: "哪些订单快到交期或者已经延期？",
        call: { view: "order_delivery_risks", filters: { pageindex: 1, pagesize: 10, contract_limit: 5, due_soon_days: 7 } }
      },
      {
        user: "查一下钼产品库存",
        call: { view: "inventory", filters: { title: "钼", pageindex: 1, pagesize: 10 } }
      },
      {
        user: "有哪些仓库？",
        call: { view: "warehouses", filters: { pageindex: 1, pagesize: 20 } }
      },
      {
        user: "查最近已入库的物料",
        call: { view: "stock_in_records", filters: { rkzt: "3", pageindex: 1, pagesize: 10 } }
      },
      {
        user: "查一下领料记录",
        call: { view: "material_orders", filters: { pageindex: 1, pagesize: 10 } }
      },
      {
        user: "查一下工序计划",
        call: { view: "procedure_plans", filters: { pageindex: 1, pagesize: 10 } }
      },
      {
        user: "查一下库存异常",
        call: { view: "inventory_alerts", filters: { scan_pages: 3, alert_limit: 20, low_stock_threshold: 5, old_stock_days: 180 } }
      },
      {
        user: "给我看 PMC 综合异常",
        call: { view: "pmc_dashboard", filters: { scan_pages: 2, scan_size: 50, contract_limit: 5, alert_limit: 20, low_stock_threshold: 5, old_stock_days: 180 } }
      },
      {
        user: "打开 PMC 驾驶舱首页",
        call: { view: "pmc_console", filters: { scan_pages: 1, scan_size: 20, contract_limit: 3, alert_limit: 10 } }
      },
      {
        user: "查看订单管理中心",
        call: { view: "order_center", filters: { pageindex: 1, pagesize: 20, contract_limit: 10, due_soon_days: 7 } }
      }
    ]
  };
}

function loadEnvFile(path = ".env") {
  if (!fs.existsSync(path)) {
    return;
  }

  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
