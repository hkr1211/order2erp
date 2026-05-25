import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

test("PMC intervention logs can be saved and listed from SQLite", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pmc-interventions-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const { latestPmcInterventions, savePmcIntervention } = await import("../src/localDb.js");

  const saved = savePmcIntervention({
    risk_level: "红牌",
    risk_type: "物料断供",
    related_no: "PO51969",
    action_label: "生成催货文本",
    problem: "缺钼粉15kg",
    note: "已联系采购确认到货日期",
    actor: "PMC"
  });

  assert.ok(saved.id > 0);
  const rows = latestPmcInterventions({ limit: 5 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].related_no, "PO51969");
  assert.equal(rows[0].action_label, "生成催货文本");
  assert.equal(rows[0].actor, "PMC");
});

test("PMC intervention summary counts today's actions and recent risk types", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pmc-intervention-summary-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const modulePath = `../src/localDb.js?summary=${Date.now()}`;
  const { pmcInterventionSummary, savePmcIntervention } = await import(modulePath);

  savePmcIntervention({
    created_at: "2026-05-24T09:00:00.000Z",
    risk_level: "红牌",
    risk_type: "物料断供",
    related_no: "PO-1",
    action_label: "生成催货文本",
    actor: "PMC"
  });
  savePmcIntervention({
    created_at: "2026-05-24T10:00:00.000Z",
    risk_level: "红牌",
    risk_type: "产能瓶颈",
    related_no: "PO-2",
    action_label: "加班协调",
    actor: "生产经理"
  });
  savePmcIntervention({
    created_at: "2026-05-23T10:00:00.000Z",
    risk_level: "黄牌",
    risk_type: "报价预警",
    related_no: "Q-1",
    action_label: "客户沟通",
    actor: "销售"
  });

  const summary = pmcInterventionSummary({ today: new Date("2026-05-24T12:00:00+08:00") });

  assert.equal(summary.today_actions, 2);
  assert.equal(summary.total_actions, 3);
  assert.equal(summary.recent_actions[0].related_no, "PO-2");
  assert.equal(summary.by_risk_type.find((row) => row.risk_type === "物料断供").actions, 1);
  assert.equal(summary.by_risk_type.find((row) => row.risk_type === "产能瓶颈").actions, 1);
  assert.equal(summary.by_result_type.find((row) => row.result_type === "供应商跟催").actions, 1);
  assert.equal(summary.by_result_type.find((row) => row.result_type === "加班增产").actions, 1);
  assert.equal(summary.improvement_suggestions[0].result_type, "供应商跟催");
  assert.match(summary.improvement_suggestions[0].recommendation, /供应商交付|采购/);
});

test("latestPmcInterventionsByRelatedNos returns the latest action for each related number", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pmc-intervention-latest-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const modulePath = `../src/localDb.js?latest=${Date.now()}`;
  const { latestPmcInterventionsByRelatedNos, savePmcIntervention } = await import(modulePath);

  savePmcIntervention({
    created_at: "2026-05-24T09:00:00.000Z",
    risk_type: "物料断供",
    related_no: "PO-1",
    action_label: "生成催货文本",
    actor: "PMC"
  });
  savePmcIntervention({
    created_at: "2026-05-24T10:00:00.000Z",
    risk_type: "物料断供",
    related_no: "PO-1",
    action_label: "标记处理中",
    actor: "PMC经理"
  });
  savePmcIntervention({
    created_at: "2026-05-24T08:00:00.000Z",
    risk_type: "产能瓶颈",
    related_no: "PO-2",
    action_label: "加班协调",
    actor: "生产经理"
  });

  const rowsByNo = latestPmcInterventionsByRelatedNos(["PO-1", "PO-2", "PO-3"]);

  assert.equal(rowsByNo.get("PO-1").action_label, "标记处理中");
  assert.equal(rowsByNo.get("PO-1").actor, "PMC经理");
  assert.equal(rowsByNo.get("PO-2").action_label, "加班协调");
  assert.equal(rowsByNo.has("PO-3"), false);
});

test("PMC interventions persist and normalize closure state", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pmc-intervention-state-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const modulePath = `../src/localDb.js?state=${Date.now()}`;
  const { latestPmcInterventionsByRelatedNos, savePmcIntervention } = await import(modulePath);

  const processing = savePmcIntervention({
    created_at: "2026-05-24T09:00:00.000Z",
    risk_type: "物料断供",
    related_no: "PO-STATE",
    action_label: "标记处理中",
    actor: "跟单员"
  });
  savePmcIntervention({
    created_at: "2026-05-24T10:00:00.000Z",
    risk_type: "物料断供",
    related_no: "PO-STATE",
    action_label: "关闭问题",
    intervention_state: "已关闭",
    actor: "PMC经理"
  });

  const rowsByNo = latestPmcInterventionsByRelatedNos(["PO-STATE"]);

  assert.equal(processing.intervention_state, "处理中");
  assert.equal(rowsByNo.get("PO-STATE").intervention_state, "已关闭");
  assert.match(rowsByNo.get("PO-STATE").payload_json, /"intervention_state":"已关闭"/);
});

test("PMC interventions persist structured handling result", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pmc-intervention-result-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const modulePath = `../src/localDb.js?result=${Date.now()}`;
  const { latestPmcInterventionsByRelatedNos, savePmcIntervention } = await import(modulePath);

  savePmcIntervention({
    created_at: "2026-05-24T11:00:00.000Z",
    risk_type: "物料断供",
    related_no: "PO-RESULT",
    action_label: "申请调拨",
    intervention_state: "处理中",
    result_type: "调拨库存",
    promised_date: "2026-05-26",
    next_owner: "仓库主管",
    actor: "PMC"
  });

  const latest = latestPmcInterventionsByRelatedNos(["PO-RESULT"]).get("PO-RESULT");

  assert.equal(latest.result_type, "调拨库存");
  assert.equal(latest.promised_date, "2026-05-26");
  assert.equal(latest.next_owner, "仓库主管");
  assert.match(latest.payload_json, /"result_type":"调拨库存"/);
});

test("latestPmcInterventions filters by risk type actor and date range", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pmc-intervention-filters-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const modulePath = `../src/localDb.js?filters=${Date.now()}`;
  const { latestPmcInterventions, savePmcIntervention } = await import(modulePath);

  savePmcIntervention({
    created_at: "2026-05-24T09:00:00.000Z",
    risk_type: "物料断供",
    related_no: "PO-1",
    action_label: "生成催货文本",
    actor: "PMC张三"
  });
  savePmcIntervention({
    created_at: "2026-05-23T09:00:00.000Z",
    risk_type: "产能瓶颈",
    related_no: "PO-2",
    action_label: "加班协调",
    actor: "生产经理"
  });

  const rows = latestPmcInterventions({
    risk_type: "物料断供",
    actor: "张三",
    date_from: "2026-05-24T00:00:00.000Z",
    date_to: "2026-05-24T23:59:59.999Z",
    limit: 10
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].related_no, "PO-1");
  assert.equal(rows[0].actor, "PMC张三");
});

test("excluded quote followups do not return after replacement sync", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quote-exclusions-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const modulePath = `../src/localDb.js?quoteExclusions=${Date.now()}`;
  const { excludeQuoteFollowup, listQuoteExclusions, listQuoteFollowups, replaceQuoteFollowups } = await import(modulePath);

  const excluded = excludeQuoteFollowup({
    quote_no: "XM_2022051001",
    reason: "2022年历史项目，不进入待报价池",
    actor: "老板"
  });

  replaceQuoteFollowups([
    { quote_no: "XM_2022051001", priority: "高", quote_status: "待报价", customer: "李大斌", title: "电子束炉制造", project_stage: "方案制定", estimated_amount: 0, quoted_amount: 0, created_date: "2022-05-10", age_days: 1475, action: "跟进报价", risk_flags: "", raw: {}, synced_at: "2026-05-24T00:00:00.000Z" },
    { quote_no: "Q-KEEP", priority: "中", quote_status: "待报价", customer: "客户A", title: "钼板询价", project_stage: "核价", estimated_amount: 1000, quoted_amount: 0, created_date: "2026-05-20", age_days: 4, action: "安排报价", risk_flags: "", raw: {}, synced_at: "2026-05-24T00:00:00.000Z" }
  ]);

  const rows = listQuoteFollowups({ limit: 10 });
  const exclusions = listQuoteExclusions({ limit: 10 });

  assert.equal(excluded.quote_no, "XM_2022051001");
  assert.deepEqual(rows.map((row) => row.quote_no), ["Q-KEEP"]);
  assert.equal(exclusions[0].quote_no, "XM_2022051001");
  assert.equal(exclusions[0].reason, "2022年历史项目，不进入待报价池");
});

test("order procedure links can be saved and listed from SQLite", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "procedure-links-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const modulePath = `../src/localDb.js?procedureLinks=${Date.now()}`;
  const { listOrderProcedureLinks, saveOrderProcedureLink } = await import(modulePath);

  const saved = saveOrderProcedureLink({
    order_no: "PO-100",
    work_assignment_id: "W-A",
    procedure_name: "落料",
    product_name: "钽杯",
    reason: "现场确认归属订单",
    actor: "PMC"
  });

  const rows = listOrderProcedureLinks({ limit: 10 });

  assert.ok(saved.id > 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].order_no, "PO-100");
  assert.equal(rows[0].work_assignment_id, "W-A");
  assert.equal(rows[0].reason, "现场确认归属订单");
});

test("local user roles can mark finance staff as non-followup", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "local-user-roles-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const modulePath = `../src/localDb.js?userRoles=${Date.now()}`;
  const { listLocalUserRoles, saveLocalUserRole } = await import(modulePath);

  saveLocalUserRole({
    name: "葛梓",
    role: "财务经理",
    is_followup: 0,
    note: "财务应收负责人，不进入跟单员工作台",
    updated_at: "2026-05-24T09:00:00.000Z"
  });
  saveLocalUserRole({
    name: "葛梓",
    role: "财务经理",
    is_followup: 1,
    note: "临时允许查看跟单池",
    updated_at: "2026-05-24T10:00:00.000Z"
  });

  const rows = listLocalUserRoles({ limit: 10 });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "葛梓");
  assert.equal(rows[0].role, "财务经理");
  assert.equal(rows[0].is_followup, 1);
  assert.equal(rows[0].note, "临时允许查看跟单池");
});

test("local user roles can be deleted to restore automatic detection", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "local-user-role-delete-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const modulePath = `../src/localDb.js?userRoleDelete=${Date.now()}`;
  const { deleteLocalUserRole, listLocalUserRoles, saveLocalUserRole } = await import(modulePath);

  saveLocalUserRole({
    name: "王测试",
    role: "非跟单",
    is_followup: 0,
    note: "测试删除"
  });

  const deleted = deleteLocalUserRole("王测试");
  const rows = listLocalUserRoles({ limit: 10 });

  assert.equal(deleted.name, "王测试");
  assert.equal(deleted.deleted, true);
  assert.equal(rows.some((row) => row.name === "王测试"), false);
});
