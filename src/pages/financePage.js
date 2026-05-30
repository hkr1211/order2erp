export function createFinancePageRenderers({ modulePage, modulePanel }) {
  function financeCenterPage(body, params = {}) {
    const summary = body.summary || {};
    return modulePage({
      title: "应收应付中心",
      subtitle: "集中查看客户应收、收款状态和供应商应付/付款情况。",
      summary: [
        ["应收记录", formatFinanceCount(summary.receivable_records), "", "metric-count"],
        ["应付记录", formatFinanceCount(summary.payable_records), "", "metric-count"],
        ["未收合计", formatFinanceMoney(summary.receivable_unpaid), "", "metric-money metric-receivable"],
        ["未付合计", formatFinanceMoney(summary.payable_unpaid), "", "metric-money metric-payable"],
        ["逾期应收", formatFinanceCount(summary.overdue_receivables), "", Number(summary.overdue_receivables || 0) > 0 ? "metric-danger" : "metric-ok"],
        ["7天内应付", formatFinanceCount(summary.due_soon_payables), "", Number(summary.due_soon_payables || 0) > 0 ? "metric-warning" : "metric-ok"],
        ["数据源异常", formatFinanceCount(summary.source_errors), "", Number(summary.source_errors || 0) > 0 ? "metric-warning" : "metric-ok"]
      ],
      panels: [
        financeSearchPanel(body, params),
        modulePanel("客户欠款排行", body.sections.receivable_debts, ["counterparty", "unpaid_amount", "records", "overdue_records", "risk_status"], { ...financeMobileOptions(["risk_status", "unpaid_amount"]), className: "finance-ranking-panel", limit: "all" }),
        modulePanel("供应商未付排行", body.sections.payable_debts, ["counterparty", "unpaid_amount", "records", "overdue_records", "risk_status"], { ...financeMobileOptions(["risk_status", "unpaid_amount"]), className: "finance-ranking-panel", limit: "all" }),
        financeRankingPager(body.ranking_pagination, params),
        financeAiSearchPanel(),
        modulePanel("逾期应收", body.sections.overdue_receivables, ["counterparty", "bill_no", "unpaid_amount", "due_date", "due_days", "owner"], { ...financeMobileOptions(["bill_no", "due_date"]), className: "finance-risk-panel finance-receivable-risk", limit: 12 }),
        modulePanel("7天内应付", body.sections.due_soon_payables, ["counterparty", "bill_no", "unpaid_amount", "due_date", "due_days", "status"], { ...financeMobileOptions(["bill_no", "due_date"]), className: "finance-risk-panel finance-payable-risk", limit: 12 }),
        modulePanel("应收/收款明细", body.sections.receivables, ["counterparty", "bill_no", "business_title", "amount", "paid_amount", "unpaid_amount", "bill_date", "due_date", "payment_terms", "age_days", "due_days", "risk_status"], { fullWidth: true, limit: "all", tall: true, ...financeMobileOptions(["bill_no", "risk_status"]), className: "finance-detail-panel" }),
        modulePanel("应付/付款明细", body.sections.payables, ["counterparty", "bill_no", "business_title", "amount", "paid_amount", "unpaid_amount", "bill_date", "due_date", "payment_terms", "age_days", "due_days", "risk_status"], { fullWidth: true, limit: "all", tall: true, ...financeMobileOptions(["bill_no", "risk_status"]), className: "finance-detail-panel" })
      ],
      notes: body.notes,
      actions: [
        ["谨慎同步财务20条", "/sync?sources=finance_records&pagesize=20"],
        ["本地查看500条", "/finance?pagesize=500"],
        ["刷新实时ERP", "/finance?refresh=1"],
        ["应收接口", "/api/receivables?pageindex=1&pagesize=20"],
        ["应付接口", "/api/payables?pageindex=1&pagesize=20"]
      ],
      pageClass: "finance-page",
      afterMain: financeAiSearchScript()
    });
  }

  function financeMobileOptions(subtitleColumns = []) {
    return {
      mobileCards: true,
      mobileTitleColumn: "counterparty",
      mobileSubtitleColumns: subtitleColumns
    };
  }

  function formatFinanceCount(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue.toLocaleString("zh-CN") : value ?? 0;
  }

  function formatFinanceMoney(value) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return value ?? 0;
    return numberValue.toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function financeSearchPanel(body = {}, params = {}) {
    const searchKey = params.searchKey || body.filters?.searchKey || "";
    const ranking = body.ranking_pagination || {};
    return `<section class="panel full-width finance-search-panel">
      <h2>财务搜索 <span class="pill">本地 SQLite</span></h2>
      <div class="finance-search-layout">
        <form class="finance-search-form" method="get" action="/finance">
          <input type="hidden" name="rank_page" value="1">
          <input type="hidden" name="rank_pagesize" value="${financeEscapeHtml(ranking.page_size || params.rank_pagesize || 20)}">
          <input type="hidden" name="pagesize" value="${financeEscapeHtml(params.pagesize || 100)}">
          <label>
            <span>模糊搜索</span>
            <input name="searchKey" value="${financeEscapeHtml(searchKey)}" placeholder="客户、供应商、单号、摘要、负责人、状态">
          </label>
          <button class="button primary" type="submit">搜索</button>
          ${searchKey ? `<a class="button" href="/finance">清空</a>` : ""}
        </form>
        <div class="finance-search-hint">普通搜索会筛选本页排行和明细；AI 财务搜索可直接问“印度客户逾期应收金额超过5000的有哪些？”。</div>
      </div>
    </section>`;
  }

  function financeAiSearchPanel() {
    const examples = [
      "有哪些应收欠款风险？",
      "印度客户逾期应收金额超过5000的有哪些？",
      "7天内应付有哪些？",
      "某个客户的未收款明细有哪些？"
    ];
    return `<section class="panel full-width ai-chat finance-ai-chat" aria-label="AI财务搜索">
      <div class="ai-chat-head">
        <div>
          <h2>AI财务搜索</h2>
          <div class="ai-chat-scope">沿用 PMC 的 AI 数据助手，只基于本地 SQLite 已同步数据回答。</div>
        </div>
      </div>
      <div class="ai-chat-body">
        <div class="ai-chat-form">
          <div id="pmcAiChatMessages" class="ai-chat-messages">
            <p class="ai-chat-message assistant">可以直接问应收、应付、客户、供应商、金额、逾期和负责人。回答会带数据来源。</p>
          </div>
          <form id="pmcAiChatForm">
            <textarea id="pmcAiChatInput" name="message" placeholder="输入问题，例如：印度客户逾期应收金额超过5000的有哪些？" autocomplete="off"></textarea>
            <button id="pmcAiChatSubmit" class="ai-chat-submit" type="submit">发送</button>
          </form>
        </div>
        <div class="ai-chat-suggestions">
          <div class="ai-chat-suggestions-title">常用问题</div>
          ${examples.map((text) => `<button class="ai-chip" type="button" data-question="${financeEscapeHtml(text)}">${financeEscapeHtml(text)}</button>`).join("")}
        </div>
      </div>
    </section>`;
  }

  function financeAiSearchScript() {
    return `<script>
      (() => {
        const form = document.getElementById("pmcAiChatForm");
        const input = document.getElementById("pmcAiChatInput");
        const messages = document.getElementById("pmcAiChatMessages");
        const submit = document.getElementById("pmcAiChatSubmit");
        if (!form || !input || !messages || !submit) return;

        function appendMessage(role, text) {
          const node = document.createElement("p");
          node.className = "ai-chat-message " + role;
          node.textContent = (role === "user" ? "我：\\n" : role === "error" ? "提示：\\n" : "AI：\\n") + text;
          messages.appendChild(node);
          messages.scrollTop = messages.scrollHeight;
        }

        async function ask(message) {
          const text = String(message || "").trim();
          if (!text) return;
          appendMessage("user", text);
          input.value = "";
          submit.disabled = true;
          submit.textContent = "查询中...";
          try {
            const response = await fetch("/api/ai/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: text })
            });
            const payload = await response.json();
            if (!response.ok) {
              appendMessage("error", payload.error || "查询失败，请稍后再试。");
              return;
            }
            appendMessage("assistant", payload.answer || "没有生成回答。");
          } catch (error) {
            appendMessage("error", "本地服务暂时无法响应：" + (error && error.message ? error.message : "未知错误"));
          } finally {
            submit.disabled = false;
            submit.textContent = "发送";
          }
        }

        form.addEventListener("submit", (event) => {
          event.preventDefault();
          ask(input.value);
        });
        document.querySelectorAll("[data-question]").forEach((button) => {
          button.addEventListener("click", () => ask(button.getAttribute("data-question")));
        });
      })();
    </script>`;
  }

  function financeRankingPager(pagination = {}, params = {}) {
    const pageIndex = Number(pagination.page_index || 1);
    const totalPages = Number(pagination.total_pages || 1);
    const pageSize = Number(pagination.page_size || params.rank_pagesize || 20);
    const rankingLimit = Number(pagination.ranking_limit || 100);
    const range = pagination.page_start && pagination.page_end ? `${pagination.page_start}-${pagination.page_end}` : "0";
    return `<section class="panel full-width finance-rank-pager">
      <h2>排行分页 <span class="pill">前${financeEscapeHtml(rankingLimit)}名</span></h2>
      <div class="finance-pager-row">
        <div class="finance-pager-summary">当前显示第 ${financeEscapeHtml(pageIndex)} / ${financeEscapeHtml(totalPages)} 页，范围 ${financeEscapeHtml(range)}；客户排行 ${financeEscapeHtml(pagination.receivable_total || 0)} 名，供应商排行 ${financeEscapeHtml(pagination.payable_total || 0)} 名。</div>
        <div class="finance-pager-actions">
          ${pageIndex > 1 ? `<a class="button" href="${financeRankHref(params, pageIndex - 1, pageSize)}">上一页</a>` : `<span class="button disabled">上一页</span>`}
          ${pageIndex < totalPages ? `<a class="button" href="${financeRankHref(params, pageIndex + 1, pageSize)}">下一页</a>` : `<span class="button disabled">下一页</span>`}
          <a class="button${pageSize === 20 ? " primary" : ""}" href="${financeRankHref(params, 1, 20)}">每页20</a>
          <a class="button${pageSize === 50 ? " primary" : ""}" href="${financeRankHref(params, 1, 50)}">每页50</a>
          <a class="button${pageSize === 100 ? " primary" : ""}" href="${financeRankHref(params, 1, 100)}">显示前100</a>
        </div>
      </div>
    </section>`;
  }

  function financeRankHref(params = {}, pageIndex = 1, pageSize = 20) {
    const query = new URLSearchParams();
    if (params.searchKey) query.set("searchKey", params.searchKey);
    query.set("rank_page", String(pageIndex));
    query.set("rank_pagesize", String(pageSize));
    query.set("pagesize", String(params.pagesize || 100));
    return `/finance?${query.toString()}`;
  }

  function financeEscapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  return { financeCenterPage };
}
