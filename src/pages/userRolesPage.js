export function createUserRolesPageRenderers({ modulePage, modulePanel, escapeHtml }) {
  function userRolesPage(body) {
    return modulePage({
      title: "用户信息维护",
      subtitle: "维护内网登录账号、角色权限和关键数据范围。",
      summary: [
        ["登录用户", body.summary.auth_users || 0],
        ["ERP可选人员", body.summary.erp_org_users || 0],
        ["人员角色", body.summary.configured_roles],
        ["非跟单人员", body.summary.non_followup_roles]
      ],
      panels: [
        body.saved ? userRoleSavedPanel(body.saved) : "",
        authUserFormPanel(body.form_options || {}),
        modulePanel("登录用户权限", body.sections.auth_users || [], ["username", "display_name", "roles_text", "scopes_text", "active_text", "password_state", "updated_at"], { fullWidth: true, mobileCards: true, mobileTitleColumn: "display_name", mobileSubtitleColumns: ["roles_text", "active_text"] }),
        userRoleFormPanel(body.edit_role || body.saved || {}, body.form_options || {}),
        modulePanel("本地用户信息", body.sections.configured_roles, ["name", "role", "followup_text", "note", "edit_action", "toggle_action", "reset_action", "delete_action"], { fullWidth: true, mobileCards: true, mobileTitleColumn: "name", mobileSubtitleColumns: ["role", "followup_text"] })
      ].filter(Boolean),
      notes: body.notes,
      actions: [
        ["同步ERP组织用户", "/sync?sources=org_users&pagesize=200&force_sync=1"],
        ["系统状态", "/system"],
        ["退出登录", "/logout"]
      ],
      afterMain: body.saved ? cleanUrlScript("/user-roles") : ""
    });
  }

  function userRoleSavedPanel(saved) {
    if (saved.deleted_role) {
      return `<section class="panel full-width"><h2>已删除 <span class="pill">${escapeHtml(saved.name)}</span></h2><div class="empty">${escapeHtml(saved.name)} 已恢复为自动识别。</div></section>`;
    }
    if (saved.temporary_password) {
      return `<section class="panel full-width"><h2>已重置密码 <span class="pill">${escapeHtml(saved.name)}</span></h2><div class="empty">临时密码：<strong>${escapeHtml(saved.temporary_password)}</strong>。请立即转交给用户，刷新后将不再显示。</div></section>`;
    }
    if (saved.auth_saved) {
      return `<section class="panel full-width"><h2>已保存登录用户 <span class="pill">${escapeHtml(saved.name)}</span></h2><div class="empty">${escapeHtml(saved.name)} 的登录角色和数据范围已更新。</div></section>`;
    }
    const followupText = Number(saved.is_followup) === 0 ? "非跟单" : "跟单";
    return `<section class="panel full-width"><h2>已保存 <span class="pill">${escapeHtml(saved.name)}</span></h2><div class="empty">${escapeHtml(saved.name)} 已标记为 ${escapeHtml(saved.role)} / ${escapeHtml(followupText)}。</div></section>`;
  }

  function authUserFormPanel(formOptions = {}) {
    const inputStyle = "width:100%;min-height:36px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text);font-size:14px;";
    const labelStyle = "display:block;margin-bottom:6px;color:var(--muted);font-size:13px;";
    const field = (name, label, value = "", type = "text") => `<label><span style="${labelStyle}">${escapeHtml(label)}</span><input type="${escapeHtml(type)}" style="${inputStyle}" name="${escapeHtml(name)}" value="${escapeHtml(value)}"></label>`;
    const users = formOptions.users || [];
    const roles = formOptions.roles || [];
    const scopeFields = [
      field("owners", "负责人范围"),
      field("customers", "客户范围"),
      field("workshops", "工段范围"),
      field("warehouses", "仓库范围"),
      field("counterparties", "往来单位范围")
    ].join("");
    return `<section class="panel full-width">
      <h2>维护登录用户权限</h2>
      <form action="/user-roles/auth-save" method="post" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;padding:14px 16px;align-items:end;">
        ${field("username", "登录名")}
        ${userSelect("display_name", "姓名", users)}
        ${field("password", "新密码", "", "password")}
        ${roleMultiSelect("roles", "角色", roles, ["跟单员"], inputStyle, labelStyle)}
        <label><span style="${labelStyle}">账号状态</span><select style="${inputStyle}" name="is_active"><option value="1">启用</option><option value="0">停用</option></select></label>
        <details style="grid-column:1/-1;border:1px solid var(--border);border-radius:6px;background:#fff;">
          <summary style="min-height:36px;padding:8px 10px;cursor:pointer;color:var(--text);">数据范围</summary>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;padding:12px;border-top:1px solid var(--border);">${scopeFields}</div>
        </details>
        <button class="button primary" type="submit" style="min-height:36px;cursor:pointer;">保存登录用户</button>
      </form>
    </section>`;
  }

  function userRoleFormPanel(params = {}, formOptions = {}) {
    const inputStyle = "width:100%;min-height:36px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text);font-size:14px;";
    const labelStyle = "display:block;margin-bottom:6px;color:var(--muted);font-size:13px;";
    const field = (name, label, value = "") => `<label><span style="${labelStyle}">${escapeHtml(label)}</span><input style="${inputStyle}" name="${escapeHtml(name)}" value="${escapeHtml(value)}"></label>`;
    const selected = (value) => Number(params.is_followup ?? 1) === value ? " selected" : "";
    const users = formOptions.users || [];
    const roles = formOptions.roles || [];
    return `<section class="panel full-width">
      <h2>维护人员角色</h2>
      <form action="/user-roles/save" method="post" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;padding:14px 16px;align-items:end;">
        ${userSelect("name", "姓名", users, params.name || "")}
        ${roleMultiSelect("role", "角色", roles, splitMulti(params.role || "跟单员"), inputStyle, labelStyle)}
        <label><span style="${labelStyle}">是否跟单</span><select style="${inputStyle}" name="is_followup"><option value="1"${selected(1)}>是</option><option value="0"${selected(0)}>否</option></select></label>
        ${field("note", "备注", params.note || "")}
        <button class="button primary" type="submit" style="min-height:36px;cursor:pointer;">保存角色</button>
      </form>
    </section>`;
  }

  function userSelect(name, label, users = [], selectedValue = "") {
    const inputStyle = "width:100%;min-height:36px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text);font-size:14px;";
    const labelStyle = "display:block;margin-bottom:6px;color:var(--muted);font-size:13px;";
    const selected = String(selectedValue || "").trim();
    const optionRows = ensureSelectedUser(users, selected);
    const options = [
      `<option value="">请选择</option>`,
      ...optionRows.map((row) => `<option value="${escapeHtml(row.name)}"${row.name === selected ? " selected" : ""}>${escapeHtml(userOptionLabel(row))}</option>`)
    ].join("");
    return `<label><span style="${labelStyle}">${escapeHtml(label)}</span><select name="${escapeHtml(name)}" style="${inputStyle}">${options}</select></label>`;
  }

  function roleMultiSelect(name, label, roles = [], selectedValues = [], inputStyle, labelStyle) {
    const selected = new Set(splitMulti(selectedValues));
    const optionValues = uniqueList([...roles, ...selected]);
    const summaryText = [...selected].join("、") || "请选择角色";
    const dropdownStyle = `${inputStyle}position:relative;padding:0;`;
    const summaryStyle = "min-height:36px;padding:8px 10px;cursor:pointer;list-style:none;";
    const menuStyle = "display:grid;gap:6px;padding:8px 10px;border-top:1px solid var(--border);background:#fff;max-height:220px;overflow:auto;";
    const optionStyle = "display:flex;align-items:center;gap:7px;min-height:28px;font-size:14px;color:var(--text);";
    const options = optionValues
      .map((role) => `<label style="${optionStyle}"><input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(role)}"${selected.has(role) ? " checked" : ""}>${escapeHtml(role)}</label>`)
      .join("");
    return `<div><span style="${labelStyle}">${escapeHtml(label)}</span><details class="role-check-dropdown" style="${dropdownStyle}"><summary style="${summaryStyle}">${escapeHtml(summaryText)}</summary><div style="${menuStyle}">${options}</div></details></div>`;
  }

  function ensureSelectedUser(users = [], selected = "") {
    const rows = users
      .map((row) => ({
        name: String(row.name || "").trim(),
        username: String(row.username || "").trim(),
        department_name: String(row.department_name || "").trim(),
        source: String(row.source || "").trim()
      }))
      .filter((row) => row.name);
    if (selected && !rows.some((row) => row.name === selected)) {
      rows.unshift({ name: selected });
    }
    return rows;
  }

  function userOptionLabel(row = {}) {
    const meta = [row.department_name, row.username].filter(Boolean).join(" / ");
    return meta ? `${row.name}（${meta}）` : row.name;
  }

  function splitMulti(value) {
    const values = Array.isArray(value) ? value : String(value || "").split(/[,，、]/);
    return uniqueList(values.map((item) => String(item || "").trim()).filter(Boolean));
  }

  function uniqueList(values = []) {
    return [...new Set(values.filter(Boolean))];
  }

  function cleanUrlScript(path) {
    return `<script>if (window.history && window.location.search) window.history.replaceState({}, "", "${escapeHtml(path)}");</script>`;
  }

  return { userRolesPage };
}
