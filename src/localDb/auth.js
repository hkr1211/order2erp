import crypto from "node:crypto";

export function createLocalAuthStore({ getDb }) {
  const database = () => getDb();
  return {
    saveLocalUserRole: (entry) => saveLocalUserRole(database(), entry),
    listLocalUserRoles: (params) => listLocalUserRoles(database(), params),
    resetLocalUserPassword: (entry) => resetLocalUserPassword(database(), entry),
    saveLocalAuthUser: (entry) => saveLocalAuthUser(database(), entry),
    listLocalAuthUsers: (params) => listLocalAuthUsers(database(), params),
    upsertOrgUsers: (rows) => upsertOrgUsers(database(), rows),
    replaceOrgUsers: (rows) => replaceOrgUsers(database(), rows),
    listOrgUsers: (params) => listOrgUsers(database(), params),
    verifyLocalAuthUser: (username, password) => verifyLocalAuthUser(database(), username, password),
    validateLocalAuthPassword,
    changeLocalAuthPassword: (entry) => changeLocalAuthPassword(database(), entry),
    createLocalAuthSession: (user, options) => createLocalAuthSession(database(), user, options),
    getLocalAuthSession: (sessionId, options) => getLocalAuthSession(database(), sessionId, options),
    deleteLocalAuthSession: (sessionId) => deleteLocalAuthSession(database(), sessionId),
    deleteLocalUserRole: (name) => deleteLocalUserRole(database(), name)
  };
}

export function seedDefaultLocalUserRoles(database) {
  const existing = database.prepare("SELECT name FROM local_user_roles WHERE name = ?").get("葛梓");
  if (existing) {
    return;
  }
  database
    .prepare("INSERT INTO local_user_roles (name, role, is_followup, note, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run("葛梓", "财务经理", 0, "财务应收负责人，不进入跟单员工作台", new Date().toISOString());
}

export function seedDefaultAuthUser(database) {
  const existing = database.prepare("SELECT username FROM local_auth_users LIMIT 1").get();
  if (existing) {
    return;
  }
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO local_auth_users
       (username, display_name, password_hash, roles_json, scopes_json, is_active, password_reset_required, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "admin",
      "系统管理员",
      hashLocalPassword(process.env.AUTH_ADMIN_PASSWORD || "YJ-Admin-2026"),
      JSON.stringify(["系统管理员"]),
      JSON.stringify({ owners: [], customers: [], workshops: [], warehouses: [], counterparties: [] }),
      1,
      0,
      now,
      now
    );
}

export function requireInitialPasswordResetForExistingUsers(database) {
  const migrationKey = "auth_initial_password_reset_20260529";
  const existing = database.prepare("SELECT key FROM local_meta WHERE key = ?").get(migrationKey);
  if (existing) {
    return;
  }
  const now = new Date().toISOString();
  database.prepare("UPDATE local_auth_users SET password_reset_required = 0, updated_at = ? WHERE lower(username) = 'admin'").run(now);
  database.prepare("UPDATE local_auth_users SET password_reset_required = 1, updated_at = ? WHERE lower(username) != 'admin'").run(now);
  database.prepare("INSERT INTO local_meta (key, value, updated_at) VALUES (?, ?, ?)").run(migrationKey, "done", now);
}

function saveLocalUserRole(database, entry = {}) {
  const name = String(entry.name || "").trim();
  if (!name) {
    throw new Error("name is required");
  }
  const payload = {
    name,
    role: String(entry.role || "未分类").trim() || "未分类",
    is_followup: entry.is_followup === false || Number(entry.is_followup) === 0 ? 0 : 1,
    note: String(entry.note || "").trim(),
    updated_at: entry.updated_at || new Date().toISOString()
  };
  database
    .prepare(
      `INSERT INTO local_user_roles (name, role, is_followup, note, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         role = excluded.role,
         is_followup = excluded.is_followup,
         note = excluded.note,
         updated_at = excluded.updated_at`
    )
    .run(payload.name, payload.role, payload.is_followup, payload.note, payload.updated_at);
  return payload;
}

function listLocalUserRoles(database, { limit = 200 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 1000));
  return database
    .prepare("SELECT name, role, is_followup, note, password_hash, password_reset_required, password_reset_at, updated_at FROM local_user_roles ORDER BY is_followup ASC, role, name LIMIT ?")
    .all(safeLimit);
}

function resetLocalUserPassword(database, entry = {}) {
  const name = String(entry.name || "").trim();
  if (!name) {
    throw new Error("name is required");
  }
  const temporaryPassword = String(entry.temporary_password || generateTemporaryPassword()).trim();
  if (!temporaryPassword) {
    throw new Error("temporary_password is required");
  }
  const resetAt = entry.reset_at || new Date().toISOString();
  const existing = database.prepare("SELECT name FROM local_user_roles WHERE name = ?").get(name);
  if (!existing) {
    saveLocalUserRole(database, { name, role: "未分类", is_followup: 1, note: "通过重置密码创建" });
  }
  const passwordHash = hashLocalPassword(temporaryPassword);
  database
    .prepare(
      `UPDATE local_user_roles
       SET password_hash = ?, password_reset_required = 1, password_reset_at = ?, updated_at = ?
       WHERE name = ?`
    )
    .run(passwordHash, resetAt, resetAt, name);
  return {
    name,
    temporary_password: temporaryPassword,
    password_reset_at: resetAt,
    password_reset_required: 1
  };
}

function saveLocalAuthUser(database, entry = {}) {
  const username = String(entry.username || entry.name || "").trim();
  if (!username) {
    throw new Error("username is required");
  }
  const existing = database.prepare("SELECT * FROM local_auth_users WHERE username = ?").get(username);
  const now = entry.updated_at || new Date().toISOString();
  const displayName = String(entry.display_name || entry.name || username).trim();
  const passwordProvided = String(entry.password || "").length > 0;
  const passwordHash = passwordProvided ? hashLocalPassword(String(entry.password)) : existing?.password_hash;
  if (!passwordHash) {
    throw new Error("password is required for new auth user");
  }
  const roles = normalizeJsonList(entry.roles || entry.role || "跟单员");
  const scopes = normalizeAuthScopes(entry.scopes || entry);
  const resetRequired = authPasswordResetRequiredForSave({ username, existing, passwordProvided });
  database
    .prepare(
      `INSERT INTO local_auth_users
       (username, display_name, password_hash, roles_json, scopes_json, is_active, password_reset_required, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET
         display_name = excluded.display_name,
         password_hash = excluded.password_hash,
         roles_json = excluded.roles_json,
         scopes_json = excluded.scopes_json,
         is_active = excluded.is_active,
         password_reset_required = excluded.password_reset_required,
         updated_at = excluded.updated_at`
    )
    .run(
      username,
      displayName,
      passwordHash,
      JSON.stringify(roles),
      JSON.stringify(scopes),
      entry.is_active === false || Number(entry.is_active) === 0 ? 0 : 1,
      resetRequired,
      existing?.created_at || now,
      now
    );
  return localAuthUserFromRow(database.prepare("SELECT * FROM local_auth_users WHERE username = ?").get(username));
}

function listLocalAuthUsers(database, { limit = 200 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 1000));
  return database
    .prepare("SELECT username, display_name, roles_json, scopes_json, is_active, password_reset_required, created_at, updated_at FROM local_auth_users ORDER BY username LIMIT ?")
    .all(safeLimit)
    .map(localAuthUserFromRow);
}

function upsertOrgUsers(database, rows = []) {
  runInTransaction(database, () => {
    insertOrgUsers(database, rows);
  });
}

function replaceOrgUsers(database, rows = []) {
  runInTransaction(database, () => {
    database.prepare("DELETE FROM erp_org_users").run();
    insertOrgUsers(database, rows);
  });
}

function listOrgUsers(database, { limit = 500, activeOnly = true } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 5000));
  const whereClause = activeOnly ? "WHERE is_active != 0" : "";
  return database
    .prepare(
      `SELECT user_id, username, employee_no, display_name, employee_status, department_id, department_name, is_active, synced_at
       FROM erp_org_users
       ${whereClause}
       ORDER BY user_id, display_name
       LIMIT ?`
    )
    .all(safeLimit);
}

function verifyLocalAuthUser(database, username, password) {
  const row = database.prepare("SELECT * FROM local_auth_users WHERE username = ?").get(String(username || "").trim());
  if (!row || Number(row.is_active) === 0 || !verifyLocalPassword(password, row.password_hash)) {
    return null;
  }
  return localAuthUserFromRow(row);
}

function validateLocalAuthPassword(password) {
  const value = String(password || "");
  if (value.length <= 6) {
    return { valid: false, error: "密码长度必须大于6位。" };
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return { valid: false, error: "密码必须包含字母和数字。" };
  }
  return { valid: true, error: "" };
}

function changeLocalAuthPassword(database, entry = {}) {
  const username = String(entry.username || "").trim();
  const row = database.prepare("SELECT * FROM local_auth_users WHERE username = ?").get(username);
  if (!row || Number(row.is_active) === 0 || !verifyLocalPassword(entry.current_password, row.password_hash)) {
    throw new Error("当前密码不正确。");
  }
  const validation = validateLocalAuthPassword(entry.new_password);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  const now = entry.now || new Date().toISOString();
  database
    .prepare("UPDATE local_auth_users SET password_hash = ?, password_reset_required = 0, updated_at = ? WHERE username = ?")
    .run(hashLocalPassword(String(entry.new_password)), now, username);
  return localAuthUserFromRow(database.prepare("SELECT * FROM local_auth_users WHERE username = ?").get(username));
}

function createLocalAuthSession(database, user, { now = new Date().toISOString(), ttlHours = 12 } = {}) {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(new Date(now).getTime() + Math.max(1, Number(ttlHours) || 12) * 60 * 60 * 1000).toISOString();
  database
    .prepare("INSERT INTO local_auth_sessions (session_id, username, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(sessionId, user.username, now, now, expiresAt);
  return { session_id: sessionId, username: user.username, created_at: now, last_seen_at: now, expires_at: expiresAt };
}

function getLocalAuthSession(database, sessionId, { now = new Date().toISOString() } = {}) {
  const id = String(sessionId || "").trim();
  if (!id) {
    return null;
  }
  const row = database
    .prepare(
      `SELECT s.session_id, s.created_at, s.last_seen_at, s.expires_at, u.*
       FROM local_auth_sessions s
       JOIN local_auth_users u ON u.username = s.username
       WHERE s.session_id = ?`
    )
    .get(id);
  if (!row || Number(row.is_active) === 0 || new Date(row.expires_at).getTime() <= new Date(now).getTime()) {
    if (row) database.prepare("DELETE FROM local_auth_sessions WHERE session_id = ?").run(id);
    return null;
  }
  database.prepare("UPDATE local_auth_sessions SET last_seen_at = ? WHERE session_id = ?").run(now, id);
  return {
    ...localAuthUserFromRow(row),
    session_id: row.session_id,
    session_expires_at: row.expires_at
  };
}

function deleteLocalAuthSession(database, sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) {
    return { deleted: false };
  }
  const result = database.prepare("DELETE FROM local_auth_sessions WHERE session_id = ?").run(id);
  return { deleted: result.changes > 0 };
}

function deleteLocalUserRole(database, name) {
  const userName = String(name || "").trim();
  if (!userName) {
    throw new Error("name is required");
  }
  const result = database.prepare("DELETE FROM local_user_roles WHERE name = ?").run(userName);
  return { name: userName, deleted: result.changes > 0 };
}

function insertOrgUsers(database, rows) {
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO erp_org_users
    (user_id, username, employee_no, display_name, employee_status, department_id, department_name, is_active, raw_json, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    const displayName = String(row.display_name || row.name || row.username || "").trim();
    const userId = String(row.user_id || row.username || displayName || "").trim();
    if (!displayName || !userId) {
      continue;
    }
    stmt.run(
      userId,
      row.username || "",
      row.employee_no || "",
      displayName,
      row.employee_status || "",
      row.department_id || "",
      row.department_name || "",
      row.is_active === false || Number(row.is_active) === 0 ? 0 : 1,
      JSON.stringify(row.raw || row),
      row.synced_at || new Date().toISOString()
    );
  }
}

function generateTemporaryPassword() {
  return `YJ-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function isAdminUsername(username) {
  return String(username || "").trim().toLowerCase() === "admin";
}

function authPasswordResetRequiredForSave({ username, existing, passwordProvided }) {
  if (isAdminUsername(username)) {
    return 0;
  }
  if (!existing || passwordProvided) {
    return 1;
  }
  return Number(existing.password_reset_required) === 1 ? 1 : 0;
}

function hashLocalPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `sha256:${salt}:${digest}`;
}

function verifyLocalPassword(password, storedHash = "") {
  const [, salt, digest] = String(storedHash || "").split(":");
  if (!salt || !digest) {
    return false;
  }
  const candidate = crypto.createHash("sha256").update(`${salt}:${String(password || "")}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(digest));
}

function localAuthUserFromRow(row) {
  if (!row) return null;
  return {
    username: row.username,
    display_name: row.display_name,
    name: row.display_name,
    roles: parseJsonArray(row.roles_json),
    scopes: parseJsonObject(row.scopes_json),
    is_active: Number(row.is_active) === 1,
    password_reset_required: !isAdminUsername(row.username) && Number(row.password_reset_required) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizeJsonList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  }
  return [...new Set(String(value || "").split(/[,，、]/).map((item) => item.trim()).filter(Boolean))];
}

function normalizeAuthScopes(value = {}) {
  const source = typeof value === "string" ? parseJsonObject(value) : value || {};
  return {
    owners: normalizeJsonList(source.owners || source.owner_scope || source.owner || ""),
    customers: normalizeJsonList(source.customers || source.customer_scope || source.customer || ""),
    workshops: normalizeJsonList(source.workshops || source.workshop_scope || source.workshop || ""),
    warehouses: normalizeJsonList(source.warehouses || source.warehouse_scope || source.warehouse || ""),
    counterparties: normalizeJsonList(source.counterparties || source.counterparty_scope || source.counterparty || "")
  };
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function runInTransaction(database, action) {
  database.exec("BEGIN");
  try {
    action();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
