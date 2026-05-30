import { ROLE_PERMISSIONS } from "../auth.js";

const ROLE_OPTIONS = Object.keys(ROLE_PERMISSIONS);

export function createUserRolesQueries({
  buildUserRoleCandidates,
  listFinanceRecords,
  listLocalAuthUsers = () => [],
  listLocalUserRoles,
  listOrgUsers = () => [],
  listProcedurePlans,
  listSalesOrders,
  queryLocalPmcDashboard
}) {
  function queryUserRoles(saved = null, params = {}) {
    const dashboard = queryLocalPmcDashboard({ local_limit: 5000 });
    const limit = 5000;
    const salesOrders = listSalesOrders({ limit });
    const procedurePlans = listProcedurePlans({ limit });
    const financeRows = listFinanceRecords({ limit });
    const configuredRoles = listLocalUserRoles({ limit: 500 });
    const authUsers = listLocalAuthUsers({ limit: 500 });
    const orgUsers = listOrgUsers({ limit: 1000 });
    const detectedOwners = dashboard?.sections?.owner_workbenches || [];
    const configuredNames = new Set(configuredRoles.map((row) => row.name));
    const editRole = selectedUserRole(configuredRoles, params);
    const resultNotice = saved || userRoleNoticeFromParams(params);
    const candidates = buildUserRoleCandidates({ salesOrders, procedurePlans, financeRows, userRoles: configuredRoles }).map((row) => ({
      ...row,
      role_action: roleSaveAction({ label: "标记跟单", name: row.name, role: row.suggested_role === "财务" ? "财务" : row.suggested_role === "销售" ? "销售" : "跟单员", is_followup: row.suggested_role === "财务" ? 0 : 1, note: `按候选池建议标记：${row.suggested_role}` }),
      exclude_action: roleSaveAction({ label: "标记非跟单", name: row.name, role: row.suggested_role || "非跟单", is_followup: 0, note: "人工标记为非跟单" })
    }));
    const detectedRows = detectedOwners.map((row) => ({
      name: row.owner,
      detected_from: "跟单负责人池",
      active_orders: row.active_orders,
      shortage_orders: row.shortage_orders,
      open_procedures: row.open_procedures,
      todos: row.todos,
      configured: configuredNames.has(row.owner) ? "已配置" : "自动识别",
      role_action: roleSaveAction({ label: "标记跟单", name: row.owner, role: "跟单员", is_followup: 1, note: "从跟单负责人池确认" }),
      exclude_action: roleSaveAction({ label: "标记非跟单", name: row.owner, role: "非跟单", is_followup: 0, note: "人工标记为非跟单" })
    }));
    return {
      header: { status: 0, message: "ok" },
      body: {
        model: "user_roles",
        generated_at: new Date().toISOString(),
        saved: resultNotice,
        summary: {
          configured_roles: configuredRoles.length,
          non_followup_roles: configuredRoles.filter((row) => Number(row.is_followup) === 0).length,
          auth_users: authUsers.length,
          erp_org_users: orgUsers.length,
          detected_followup_owners: detectedRows.length,
          candidate_owners: candidates.length
        },
        form_options: {
          users: buildUserOptions({ orgUsers, candidates, configuredRoles, detectedRows, authUsers }),
          roles: ROLE_OPTIONS
        },
        sections: {
          erp_org_users: orgUsers.map((row) => ({
            name: row.display_name || row.name || row.username,
            username: row.username,
            employee_no: row.employee_no,
            department_name: row.department_name,
            employee_status: row.employee_status,
            synced_at: row.synced_at
          })),
          auth_users: authUsers.map((row) => ({
            ...row,
            roles_text: (row.roles || []).join("、"),
            scopes_text: authScopesText(row.scopes),
            active_text: row.is_active ? "启用" : "停用",
            password_state: row.password_reset_required ? "需改密" : "正常"
          })),
          configured_roles: configuredRoles.map((row) => ({
            ...row,
            followup_text: Number(row.is_followup) === 0 ? "否" : "是",
            password_state: row.password_reset_at ? "已重置" : "未设置",
            edit_action: userRoleEditHref(row),
            toggle_action: roleSaveAction({
              label: "切换",
              name: row.name,
              role: row.role,
              is_followup: Number(row.is_followup) === 0 ? 1 : 0,
              note: row.note || "切换是否跟单"
            }),
            reset_action: userPasswordResetAction(row),
            delete_action: { label: "删除", href: `/user-roles/delete?name=${encodeURIComponent(row.name)}`, method: "post" }
          })),
          detected_followup_owners: detectedRows,
          role_candidates: candidates
        },
        edit_role: editRole,
        notes: [
          "姓名下拉框优先使用 ERP 组织架构中的正常账号。",
          "非 admin 登录用户首次登录或管理员重新设置密码后，必须先修改密码。",
          "密码要求字母和数字组合，长度大于 6 位。",
          "角色和数据范围保存后立即生效。"
        ]
      }
    };
  }

  return { queryUserRoles, userRoleResultHref };
}

function buildUserOptions({ orgUsers = [], candidates = [], configuredRoles = [], detectedRows = [], authUsers = [] } = {}) {
  const rows = [];
  const seen = new Set();
  const push = (name, source, extra = {}) => {
    const cleanName = String(name || "").trim();
    if (!cleanName || seen.has(cleanName)) return;
    if (!isSelectableErpUserName(cleanName)) return;
    seen.add(cleanName);
    rows.push({ name: cleanName, source, ...extra });
  };
  for (const row of orgUsers) {
    push(row.display_name || row.name || row.username, "ERP组织架构", {
      username: row.username || "",
      employee_no: row.employee_no || "",
      department_name: row.department_name || "",
      employee_status: row.employee_status || ""
    });
  }
  for (const row of candidates) {
    if (String(row.suggested_role || "").includes("ERP编号待映射")) continue;
    push(row.name, "ERP负责人候选");
  }
  for (const row of configuredRoles) {
    push(row.name, "本地配置");
  }
  for (const row of detectedRows) {
    push(row.owner || row.name, "跟单负责人池");
  }
  for (const row of authUsers) {
    push(row.display_name || row.username, "登录用户");
  }
  return rows;
}

function isSelectableErpUserName(name) {
  return !/^\d+$/.test(String(name || "").trim());
}

function roleSaveAction({ label = "保存", name, role, is_followup, note }) {
  const query = new URLSearchParams({
    name: name || "",
    role: role || "",
    is_followup: String(is_followup),
    note: note || ""
  });
  return { label, href: `/user-roles/save?${query.toString()}`, method: "post" };
}

function userRoleResultHref(result = {}) {
  const query = new URLSearchParams({
    result: result.deleted_role ? "deleted" : "saved",
    name: result.name || "",
    role: result.role || "",
    is_followup: String(result.is_followup ?? ""),
    deleted: result.deleted ? "1" : ""
  });
  return `/user-roles?${query.toString()}`;
}

function userRoleNoticeFromParams(params = {}) {
  const result = String(params.result || "");
  const name = String(params.name || "").trim();
  if (!result || !name) {
    return null;
  }
  if (result === "deleted") {
    return { name, deleted_role: true, deleted: params.deleted === "1" };
  }
  if (result === "auth_saved") {
    return { name, auth_saved: true };
  }
  return {
    name,
    role: params.role || "",
    is_followup: params.is_followup === "" ? undefined : Number(params.is_followup)
  };
}

function authScopesText(scopes = {}) {
  const parts = [
    ["负责人", scopes.owners],
    ["客户", scopes.customers],
    ["工段", scopes.workshops],
    ["仓库", scopes.warehouses],
    ["往来单位", scopes.counterparties]
  ]
    .map(([label, values]) => {
      const text = Array.isArray(values) ? values.filter(Boolean).join("、") : "";
      return text ? `${label}:${text}` : "";
    })
    .filter(Boolean);
  return parts.join("；") || "全局或按角色默认";
}

function userRoleEditHref(row = {}) {
  const query = new URLSearchParams({
    edit_name: row.name || ""
  });
  return `/user-roles?${query.toString()}`;
}

function userPasswordResetAction(row = {}) {
  const query = new URLSearchParams({
    name: row.name || ""
  });
  return { label: "重置密码", href: `/user-roles/reset-password?${query.toString()}`, method: "post" };
}

function selectedUserRole(configuredRoles = [], params = {}) {
  const editName = String(params.edit_name || "").trim();
  if (!editName) {
    return null;
  }
  return configuredRoles.find((row) => row.name === editName) || { name: editName, role: "跟单员", is_followup: 1, note: "" };
}
