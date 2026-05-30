export function createProcedureLinksPageRenderer({ escapeHtml, modulePage, modulePanel }) {
  function procedureLinksPage(body) {
    return modulePage({
      title: "派工人工绑定",
      subtitle: "用于把缺少订单号的派工进度记录手工关联到销售订单。只写入本地 SQLite，不回写 ERP。",
      summary: [
        ["销售订单", body.summary.sales_orders],
        ["派工记录", body.summary.procedure_plans],
        ["已绑定", body.summary.links],
        ["未关联派工", body.summary.unmatched_procedure_plans],
        ["匹配率", `${body.summary.match_rate}%`]
      ],
      panels: [
        body.saved ? procedureLinkSavedPanel(body.saved) : "",
        procedureLinkFormPanel(body.params),
        modulePanel("ERP字段检查结果", body.erp_field_audit, ["source", "rows", "order_no_status", "useful_fields", "conclusion"], { fullWidth: true }),
        modulePanel("建议绑定线索", body.link_suggestions, ["work_assignment_id", "product_name", "procedure_name", "report_subject", "subject_ref", "candidate_order_no", "candidate_customer", "suggestion_basis", "confidence", "bind_action", "supplement_path"], { fullWidth: true }),
        modulePanel("已绑定关系", body.links, ["order_no", "work_assignment_id", "procedure_name", "product_name", "reason", "actor", "created_at"], { fullWidth: true }),
        modulePanel("待绑定派工", body.unmatched, ["work_assignment_id", "order_no", "product_name", "procedure_name", "work_center_name", "remaining_qty", "reason", "supplement_path", "link_action"], { fullWidth: true }),
        modulePanel("销售订单参考", body.orders, ["order_no", "customer", "owner", "product_name", "remaining_qty", "delivery_date"], { fullWidth: true })
      ].filter(Boolean),
      notes: [
        "优先绑定派工单ID为空订单号、但现场能确认归属订单的记录。",
        "如果“建议绑定线索”有候选订单号，请先人工核对 ERP 合同/派工单，再点击预填绑定。",
        "如果没有候选订单号，优先补齐90天销售订单/合同明细，或在 ERP 派工单详情中查来源单据后手工绑定。",
        "绑定后返回 PMC 页面点击“从 SQLite 重新生成”，订单-工序覆盖率和匹配明细会使用人工绑定结果。"
      ],
      actions: [["返回PMC作战台", "/pmc?rebuild=1"]]
    });
  }

  function procedureLinkSavedPanel(saved) {
    return `<section class="panel full-width"><h2>已保存 <span class="pill">${escapeHtml(saved.id)}</span></h2><div class="empty">已把派工单 ${escapeHtml(saved.work_assignment_id)} 绑定到订单 ${escapeHtml(saved.order_no)}。请返回 PMC 重新生成页面查看结果。</div></section>`;
  }

  function procedureLinkFormPanel(params = {}) {
    const inputStyle = "width:100%;min-height:36px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text);font-size:14px;";
    const labelStyle = "display:block;margin-bottom:6px;color:var(--muted);font-size:13px;";
    const field = (name, label, value = "") => `<label><span style="${labelStyle}">${escapeHtml(label)}</span><input style="${inputStyle}" name="${escapeHtml(name)}" value="${escapeHtml(value)}"></label>`;
    return `<section class="panel full-width">
    <h2>新增绑定</h2>
    <form action="/procedure-links/save" method="post" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;padding:14px 16px;align-items:end;">
      ${field("order_no", "销售订单号", params.order_no || "")}
      ${field("work_assignment_id", "派工单ID", params.work_assignment_id || "")}
      ${field("procedure_name", "工序", params.procedure_name || "")}
      ${field("product_name", "产品名称", params.product_name || "")}
      ${field("reason", "绑定原因", params.reason || "人工确认归属订单")}
      ${field("actor", "操作人", params.actor || "内网用户")}
      <button class="button primary" type="submit" style="min-height:36px;cursor:pointer;">保存绑定</button>
    </form>
  </section>`;
  }

  return { procedureLinksPage };
}
