const PUBLIC_PATHS = new Set(["/login", "/logout", "/health"]);

export const ROLE_PERMISSIONS = {
  系统管理员: ["*"],
  老板: [
    "page:home",
    "page:pmc",
    "page:orders",
    "page:production",
    "page:workshop-board",
    "page:materials",
    "page:procurement",
    "page:finance",
    "page:reports",
    "api:ai_chat"
  ],
  管理层: [
    "page:home",
    "page:pmc",
    "page:orders",
    "page:production",
    "page:workshop-board",
    "page:materials",
    "page:procurement",
    "page:finance",
    "page:reports",
    "page:scheduling",
    "api:ai_chat"
  ],
  PMC: [
    "page:home",
    "page:pmc",
    "page:orders",
    "page:followup",
    "page:production",
    "page:workshop-board",
    "page:materials",
    "page:procurement",
    "page:scheduling",
    "page:reports",
    "api:ai_chat"
  ],
  销售: ["page:home", "page:pmc", "page:orders", "page:followup", "page:finance", "api:ai_chat"],
  跟单员: ["page:home", "page:pmc", "page:orders", "page:followup", "page:production", "page:workshop-board", "page:materials", "api:ai_chat"],
  财务: ["page:home", "page:pmc", "page:orders", "page:finance", "page:reports", "api:ai_chat"],
  采购: ["page:home", "page:pmc", "page:materials", "page:procurement", "api:ai_chat"],
  仓库: ["page:home", "page:materials", "page:workshop-board", "api:ai_chat"],
  车间: ["page:home", "page:production", "page:workshop-board"]
};

export function effectivePermissions(user = {}) {
  const roles = normalizeRoles(user.roles);
  const permissions = new Set();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] || []) {
      permissions.add(permission);
    }
  }
  if (permissions.has("*")) {
    for (const rolePermissions of Object.values(ROLE_PERMISSIONS)) {
      for (const permission of rolePermissions) {
        if (permission !== "*") permissions.add(permission);
      }
    }
    permissions.add("page:system");
    permissions.add("admin:users");
    permissions.add("admin:sync");
    permissions.add("api:raw_erp");
  }
  return permissions;
}

export function canAccessPath(user, path = "") {
  const normalized = normalizePath(path);
  if (PUBLIC_PATHS.has(normalized)) {
    return true;
  }
  if (!user) {
    return false;
  }
  const required = permissionForPath(normalized);
  if (!required) {
    return true;
  }
  const permissions = effectivePermissions(user);
  return required.some((permission) => permissions.has(permission) || permissions.has("*"));
}

export function homePathForUser(user, requestedPath = "/") {
  const safePath = safeInternalPath(requestedPath);
  if (safePath !== "/" && canAccessPath(user, safePath)) {
    return safePath;
  }
  const roles = normalizeRoles(user?.roles);
  const candidates = [
    roles.includes("系统管理员") ? "/system" : "",
    roles.some((role) => ["老板", "管理层", "PMC"].includes(role)) ? "/pmc" : "",
    roles.includes("跟单员") || roles.includes("销售") ? "/followup" : "",
    roles.includes("财务") ? "/finance" : "",
    roles.includes("采购") || roles.includes("仓库") ? "/materials" : "",
    roles.includes("车间") ? "/workshop-board" : "",
    "/"
  ].filter(Boolean);
  return candidates.find((path) => canAccessPath(user, path)) || "/";
}

export function requiresPasswordChange(user = {}) {
  return String(user?.username || "").trim().toLowerCase() !== "admin" && user?.password_reset_required === true;
}

export function permissionForPath(path = "") {
  const normalized = normalizePath(path);
  if (normalized === "/") return ["page:home"];
  if (normalized === "/roles" || normalized.startsWith("/followup")) return ["page:followup", "page:pmc"];
  if (normalized.startsWith("/pmc")) return ["page:pmc"];
  if (normalized === "/orders" || normalized === "/order" || normalized === "/foreign-trade") return ["page:orders"];
  if (normalized === "/finance") return ["page:finance"];
  if (normalized === "/materials") return ["page:materials"];
  if (normalized === "/procurement") return ["page:procurement", "page:materials"];
  if (normalized === "/production" || normalized === "/dispatch" || normalized.startsWith("/procedure-links")) return ["page:production"];
  if (normalized.startsWith("/workshop-board")) return ["page:workshop-board"];
  if (normalized === "/scheduling") return ["page:scheduling"];
  if (normalized.startsWith("/reports") || normalized.startsWith("/interventions")) return ["page:reports", "page:pmc"];
  if (normalized === "/api/ai/chat") return ["api:ai_chat"];
  if (normalized === "/api/ai/logs") return ["page:system"];
  if (normalized.startsWith("/api/history_sync") || normalized === "/api/sync") return ["admin:sync"];
  if (normalized.startsWith("/api/") || normalized === "/views" || normalized === "/agent/tool-schema") return ["api:raw_erp"];
  if (
    normalized === "/system" ||
    normalized === "/goal" ||
    normalized === "/sqlite-coverage" ||
    normalized.startsWith("/history-sync") ||
    normalized === "/erp-logs" ||
    normalized === "/sync" ||
    normalized === "/sync-pause"
  ) {
    return ["page:system", "admin:sync"];
  }
  if (normalized.startsWith("/user-roles")) return ["admin:users"];
  return null;
}

export function scopeRowsForUser(rows = [], user = null, resource = "orders") {
  if (!user || hasFullDataAccess(user, resource)) {
    return rows;
  }
  const scopes = normalizeScopes(user.scopes);
  const roles = normalizeRoles(user.roles);
  const ownNames = new Set([user.display_name, user.name, user.username].map(cleanText).filter(Boolean));
  const owners = new Set([...scopes.owners, ...ownNames]);
  const customers = new Set(scopes.customers);
  const workshops = new Set(scopes.workshops);
  const warehouses = new Set(scopes.warehouses);
  const counterparties = new Set(scopes.counterparties);

  if (resource === "finance" && !roles.some((role) => ["财务", "老板", "管理层", "系统管理员"].includes(role))) {
    return rows.filter((row) => matchAny(row, ["owner", "sales_owner", "handler"], owners) || matchAny(row, ["counterparty", "customer"], customers) || matchAny(row, ["counterparty"], counterparties));
  }
  if (resource === "production") {
    return rows.filter((row) => matchAny(row, ["owner", "responsible_owner"], owners) || matchAny(row, ["work_center_name", "procedure_name"], workshops));
  }
  if (resource === "material" || resource === "inventory") {
    return rows.filter((row) => matchAny(row, ["owner", "responsible_owner"], owners) || matchAny(row, ["customer"], customers) || matchAny(row, ["warehouse"], warehouses));
  }
  if (resource === "procurement") {
    return rows.filter((row) => matchAny(row, ["owner", "buyer", "handler"], owners) || matchAny(row, ["supplier", "counterparty", "name"], counterparties));
  }
  return rows.filter((row) => matchAny(row, ["owner", "responsible_owner", "sales_owner"], owners) || matchAny(row, ["customer", "counterparty"], customers));
}

export function hasFullDataAccess(user = {}, resource = "orders") {
  const roles = normalizeRoles(user.roles);
  if (roles.some((role) => ["系统管理员", "老板", "管理层"].includes(role))) {
    return true;
  }
  if (resource === "finance") {
    return roles.includes("财务");
  }
  if (["orders", "production", "material", "inventory", "pmc", "procurement"].includes(resource)) {
    return roles.includes("PMC");
  }
  return false;
}

export function normalizeRoles(roles = []) {
  const values = Array.isArray(roles) ? roles : String(roles || "").split(/[,，、]/);
  return [...new Set(values.map((role) => String(role || "").trim()).filter(Boolean))];
}

export function normalizeScopes(scopes = {}) {
  const source = typeof scopes === "string" ? safeJson(scopes, {}) : scopes || {};
  return {
    owners: normalizeScopeList(source.owners),
    customers: normalizeScopeList(source.customers),
    workshops: normalizeScopeList(source.workshops),
    warehouses: normalizeScopeList(source.warehouses),
    counterparties: normalizeScopeList(source.counterparties)
  };
}

function normalizeScopeList(value) {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean);
  }
  return String(value || "")
    .split(/[,，、\n]/)
    .map(cleanText)
    .filter(Boolean);
}

function matchAny(row, fields, allowed) {
  if (!allowed.size) {
    return false;
  }
  return fields.some((field) => {
    const value = cleanText(row?.[field]);
    if (!value) return false;
    return [...allowed].some((allowedValue) => value === allowedValue || value.includes(allowedValue) || allowedValue.includes(value));
  });
}

function cleanText(value) {
  return String(value || "").trim();
}

function safeInternalPath(value = "/") {
  const path = String(value || "/").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) {
    return "/";
  }
  return path;
}

function normalizePath(path = "") {
  return String(path || "/").split("?")[0] || "/";
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
