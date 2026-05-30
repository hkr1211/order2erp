export function labelFor(key) {
  const labels = {
    section: "分区",
    role: "角色",
    name: "姓名",
    is_followup: "是否跟单",
    followup_text: "是否跟单",
    detected_from: "识别来源",
    configured: "配置状态",
    focus: "工作重点",
    primary_action: "建议动作",
    entry_1: "入口1",
    entry_2: "入口2",
    entry_3: "入口3",
    entry_4: "入口4",
    workflow: "流程",
    step_1: "步骤1",
    step_2: "步骤2",
    step_3: "步骤3",
    order_no: "订单号",
    project_no: "项目编号",
    title: "标题",
    customer: "客户",
    owner: "负责人",
    currency: "币种",
    category: "合同分类",
    sales_order_no: "销售订单号",
    order_match_by: "订单匹配方式",
    match_basis: "关联依据",
    product_name: "产品名称",
    product_code: "产品编号",
    product_model: "规格型号",
    warehouse: "仓库",
    stock_qty: "库存数量",
    available_qty: "可用数量",
    shortage_qty: "缺口数量",
    demand_qty: "需求数量",
    remaining_qty: "未交数量",
    risk_type: "风险类型",
    risk_level: "风险等级",
    problem: "问题描述",
    rule_reason: "判定原因",
    morning_action: "处理入口",
    buttons: "干预按钮",
    owner_role: "责任角色",
    action_label: "动作",
    note: "备注",
    actor: "处理人",
    actions: "处理次数",
    latest_intervention: "最近干预",
    latest_actor: "最近处理人",
    latest_at: "最近处理时间",
    intervention_state: "闭环状态",
    result_type: "处理结果",
    promised_date: "承诺日期",
    next_owner: "下一责任人",
    closure_quality: "闭环质量",
    closure_gap: "缺失项",
    review_focus: "复盘重点",
    recommendation: "改进建议",
    response_sla: "响应时限",
    escalation_state: "升级状态",
    intervention_action: "处理入口",
    intervention_log: "处理记录",
    role_action: "标记跟单",
    exclude_action: "标记非跟单",
    edit_action: "编辑",
    delete_action: "删除配置",
    toggle_action: "切换跟单",
    reset_action: "重置密码",
    password_reset_at: "密码重置时间",
    password_reset_required: "需改密",
    password_state: "密码状态",
    suggested_role: "建议角色",
    configured_role: "已配置角色",
    configured_followup: "已配置跟单",
    sales_orders: "销售订单数",
    active_orders: "在制订单",
    completed_orders: "完成订单",
    procedure_plans: "派工记录",
    quote_followups: "报价跟进",
    finance_records: "财务记录",
    days_from_today: "距今天数",
    delivery_date: "交期",
    signed_date: "签订日期",
    created_date: "创建日期",
    amount: "金额",
    estimated_amount: "预计金额",
    quoted_amount: "报价金额",
    usd_amount: "USD金额",
    project_stage: "项目阶段",
    po_no: "PO编号",
    unit: "单位",
    delivered_qty: "已交数量",
    line_id: "明细ID",
    matched_by: "匹配方式",
    matched_orders: "已关联订单",
    manual_matched_orders: "人工绑定",
    exact_matched_orders: "订单号匹配",
    report_subject_matched_orders: "汇报主题匹配",
    assisted_matched_orders: "辅助匹配",
    sales_orders_without_procedure: "未关联工序订单",
    unmatched_procedure_plans: "未关联派工",
    match_rate: "匹配率",
    reason: "原因",
    link_action: "人工绑定",
    bind_action: "预填绑定",
    order_no_status: "订单号字段状态",
    useful_fields: "可用字段",
    source: "数据来源",
    report_subject: "工序汇报主题",
    subject_ref: "主题编号",
    candidate_order_no: "候选订单号",
    candidate_customer: "候选客户",
    suggestion_basis: "建议依据",
    confidence: "可信度",
    supplement_path: "补充途径",
    receipt_no: "入库单号",
    quantity: "数量",
    warehouse_keeper: "库管员",
    applicant: "申请人",
    receipt_status: "入库状态",
    receipt_type: "入库类别",
    application_time: "申请时间",
    confirmed_time: "确认时间",
    warehouse_title: "仓库",
    source_errors: "数据源异常",
    counterparty: "往来单位",
    bill_no: "单号",
    business_title: "业务摘要",
    paid_amount: "已收/已付",
    unpaid_amount: "未收/未付",
    bill_date: "单据日期",
    due_date: "到期日",
    payment_terms: "付款条件",
    age_days: "账龄天数",
    due_days: "到期天数",
    risk_status: "风险状态",
    priority_no: "序号",
    headline: "摘要",
    meeting_focus: "早会关注点",
    task_no: "待办编号",
    followup_no: "跟催编号",
    followup_type: "跟催类型",
    quote_no: "报价编号",
    quote_status: "报价状态",
    urgent_quotes: "紧急报价",
    material_task_no: "物料任务编号",
    material_task_type: "物料任务类型",
    material_tasks: "物料任务",
    urgent_material_tasks: "紧急物料任务",
    owner_count: "负责人数",
    owner_link: "进入视图",
    shortage_orders: "缺料订单",
    pending_quotes: "待报价",
    open_procedures: "未完工序",
    todos: "待办合计",
    max_age_days: "最长停留天数",
    bucket: "时间窗口",
    order_count: "订单数",
    high_impact_orders: "高影响订单",
    this_week_orders: "7天内订单",
    impact_level: "影响等级",
    schedule_advice: "排产建议",
    exception_type: "异常类型",
    priority: "优先级",
    related_no: "关联单号",
    item: "事项",
    responsible_role: "责任角色",
    action: "处理建议",
    supplier: "供应商",
    purchase_no: "采购单号",
    supplier_contact: "联系人",
    supplier_phone: "联系电话",
    supplier_level: "供应商等级",
    buyer: "采购员",
    order_date: "下单日期",
    expected_arrival_date: "预计到货日",
    followup_tasks: "跟催事项",
    urgent_followups: "紧急跟催",
    latest_action: "最近建议",
    dispatch_records: "派工记录",
    delayed_dispatches: "延期派工",
    blocked_orders: "阻塞订单",
    blocker: "阻塞点",
    next_action: "下一步动作",
    stage: "工序阶段",
    red_nodes: "红牌节点",
    yellow_nodes: "黄牌节点",
    active_nodes: "进行中节点",
    done_nodes: "已完成节点",
    work_centers: "工作中心",
    work_center_name: "工作中心",
    work_assignment_id: "派工单ID",
    bom_id: "BOM ID",
    bom_title: "清单主题",
    bom_no: "清单编号",
    parent_product: "父件产品",
    effective_status: "生效状态",
    enabled_status: "启用状态",
    bom_type: "BOM类型",
    customer_scope: "适用客户",
    procedure_count: "工序数",
    delayed_procedures: "延期工序",
  upstream_flow_risks: "前后工段断点",
  upstream_flow_gaps: "前后监控缺口",
  upstream_flow_handoffs: "前后转序交接",
  upstream_flow_coverage_rate: "前后监控覆盖率",
  stale_data_sources: "需关注数据源",
  risk_item_count: "风险事项",
  monitored_item_count: "监控事项",
  risk_item_ratio: "风险事项占比",
  risk_score: "风险评分",
  score_reason: "评分依据",
  insight_type: "结论类型",
  conclusion: "指挥结论",
  meeting_topic: "早会重点",
  meeting_question: "早会追问",
  responsible_owner: "责任人",
  feedback_deadline: "反馈时限",
  decision_request: "需拍板事项",
  expected_output: "要求结果",
  escalation_rule: "升级规则",
  action_no: "行动编号",
  risk_count: "风险数",
  red_count: "红牌数",
  yellow_count: "黄牌数",
  todo_count: "待办数",
  top_risk_type: "主要风险",
  sample_problem: "代表问题",
  source_key: "数据源编码",
  source_name: "数据源",
  latest_synced_at: "最近同步时间",
  freshness_status: "可信状态",
  impact: "影响范围",
  data_trust_score: "数据可信度",
  data_trust_status: "可信结论",
  trust_status: "可信结论",
  trust_score: "可信度",
  total_sources: "数据源数",
  trusted_source_count: "可信源数",
  attention_source_count: "需关注源数",
  trusted_sources: "可信数据源",
  attention_sources: "需关注数据源",
  missing_sources: "缺失数据源",
  decision_guardrail: "决策护栏",
  suggested_action: "建议动作",
  next_checkpoint: "复核节点",
  rolling_open_plans: "轧制未完派工",
  rolling_tracked_plans: "轧制可追溯派工",
  downstream_open_plans: "后道未完派工",
  downstream_need_material_3d: "3天内要料后道",
  flow_risks: "已识别断点",
  flow_gaps: "监控缺口",
  semi_finished_batches: "半成品批次",
  flow_coverage_rate: "监控覆盖率",
  handoff_status: "交接状态",
  batch_no: "批号",
    upstream_section: "前道工段",
    downstream_section: "后道工段",
    upstream_work_assignment_id: "前道派工",
    downstream_work_assignment_id: "后道派工",
    upstream_procedure: "前道工序",
    downstream_procedure: "后道工序",
    upstream_remaining_qty: "前道剩余",
    downstream_remaining_qty: "后道剩余",
    upstream_finish_date: "前道计划完工",
    downstream_start_date: "后道计划开工",
    flow_gap: "流转风险",
    procedure_name: "工序",
    planned_qty: "计划数量",
    finished_qty: "完成数量",
    planned_start_date: "计划开工",
    planned_finish_date: "计划完工",
    open_tasks: "未关闭待办",
    critical_tasks: "高优先级待办",
    records: "记录数",
    overdue_records: "逾期记录",
    earliest_due_date: "最近到期日",
    earliest_due_days: "最近到期天数",
    receivable_unpaid: "未收合计",
    payable_unpaid: "未付合计",
    overdue_receivables: "逾期应收",
    due_soon_payables: "7天内应付",
    source: "数据源",
    label: "名称",
    date_support: "日期条件",
    start_date: "开始日期",
    end_date: "结束日期",
    page_size: "每页条数",
    suggested_range: "建议范围",
    safety: "安全说明",
    latest_progress: "最近进度",
    tool_name: "工具名称",
    tool_path: "入口",
    tool_desc: "用途",
    last_status: "最近状态",
    last_rows_synced: "最近同步行数",
    last_page_index: "最近页码",
    finished_at: "完成时间",
    error_message: "错误信息",
    next_page_index: "下一页",
    next_run: "继续执行",
    rows_synced: "同步行数",
    new_rows: "新增行数",
    unique_row_count: "唯一记录数",
    row_key_sample: "记录样例",
    row_fingerprint: "页面指纹",
    duplicate_page: "重复页",
    no_new_rows: "无新增停止",
    warning: "告警",
    has_next: "是否还有下一页",
    max_pages: "最大页数",
    delay_ms: "页间等待ms",
    start_page_index: "起始页",
    pages_executed: "执行页数",
    stop_reason: "停止原因",
    dry_run: "预演",
    safe_window: "安全窗口",
    run: "执行",
    view_name: "ERP视图",
    page_index: "页码",
    erp_params_json: "ERP请求参数",
    will_access_erp: "是否访问ERP",
    status: "状态",
    warning_type: "预警类型",
    level: "等级",
    related_object: "关联对象",
    related_id: "关联编号",
    message: "提示内容",
    warehouse_status: "出库状态",
    delivery_status: "发货状态",
    payment_status: "收款状态",
    invoice_status: "开票状态",
    approval_status: "审批状态",
    risk_flags: "风险标签",
    foreign_orders: "外贸订单",
    unshipped_orders: "未发货订单",
    unpaid_orders: "未收款订单",
    pending_approval_orders: "待审批订单",
    latest_signed_date: "最近签订日期",
    scanned_orders: "扫描订单",
    candidate_orders: "候选订单",
    checked_orders: "已检查订单",
    orders_with_shortage: "缺料订单",
    shortage_rows: "缺料明细",
    risk_orders: "风险订单",
    risk_rows: "风险明细",
    overdue_rows: "延期明细",
    due_soon_rows: "临期明细",
    pending_quote_projects: "待报价项目",
    scanned_projects: "扫描项目",
    errors: "错误数",
    status_light: "状态灯",
    status_text: "订单状态",
    due_status: "交期状态",
    shortage_status: "缺料状态"
  };
  return labels[key] || key;
}

export function parseNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

export function parseJson(value, fallback = null) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function formatNumber(value) {
  const number = parseNumber(value);
  if (number === null) {
    return value ?? "";
  }
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(4)));
}

export function parseDate(value) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  const yearMatch = text.match(/^(\d{4})-/);
  if (yearMatch && Number(yearMatch[1]) < 2000) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) {
    return null;
  }
  return date;
}

export function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${formatDate(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function parseBoolean(value) {
  if (value === true || value === 1) {
    return true;
  }
  const text = value === undefined || value === null ? "" : String(value).trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}

export function clampInt(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.max(min, Math.min(max, number));
}
