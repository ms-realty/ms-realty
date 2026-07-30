import { timingSafeEqual } from "node:crypto";

const LOCAL_ADMIN_TOKEN = "local-admin-smoke";
const CREDENTIALS_ENV = "MS_REALTY_ADMIN_CREDENTIALS_JSON";
const OPERATOR_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/i;
const MIN_OPERATOR_TOKEN_LENGTH = 24;

export const ADMIN_ROLES = ["admin", "broker", "editor", "translator", "agent"];

const ROLE_CAPABILITIES = {
  admin: ["*"],
  broker: ["workspace:read", "operations:read", "operations:write", "cases:read", "cases:write", "content:read", "activity:read"],
  editor: ["workspace:read", "content:read", "content:write", "translations:read", "translations:write", "translations:publish", "activity:read"],
  translator: ["workspace:read", "content:read", "translations:read", "translations:write", "activity:read"],
  agent: ["workspace:read", "cases:read", "cases:write", "activity:read"],
};

const AGENT_REALTY_CASE_ACTIONS = new Set(["step_completed", "step_blocked", "case_closed"]);
const AGENT_REALTY_CASE_CONDITION_ACTIONS = new Set([
  "condition_opened",
  "condition_satisfied",
  "condition_blocked",
  "condition_expired",
]);

const OPERATIONS_READ_PATHS = new Set([
  "/admin/today",
  "/api/admin/today",
  "/admin/leads",
  "/api/admin/leads",
  "/admin/contacts",
  "/api/admin/contacts",
  "/admin/documents",
  "/api/admin/documents",
  "/admin/consents",
  "/api/admin/consents",
  "/admin/pipeline",
  "/api/admin/pipeline",
  "/admin/requests",
  "/api/admin/requests",
  "/admin/viewings",
  "/api/admin/viewings",
  "/admin/reports",
  "/api/admin/reports",
  "/api/admin/reports/export",
  "/api/admin/viewings.ics",
]);

const CONTENT_READ_PATHS = new Set([
  "/admin/listings",
  "/api/admin/listings",
  "/admin/listings/edit",
]);

const TRANSLATION_READ_PATHS = new Set(["/admin/translations", "/api/admin/translations"]);
const OPERATIONS_WRITE_PATHS = new Set([
  "/api/admin/replies",
  "/api/admin/replies/delivery",
  "/api/admin/replies/draft",
  "/api/admin/leads",
  "/api/admin/lead-pipeline/outcome",
  "/api/admin/leads/assign",
  "/api/admin/accounts",
  "/api/admin/accounts/link",
  "/api/admin/documents/outcome",
  "/api/admin/consents/withdraw",
  "/api/admin/viewings",
  "/api/admin/viewings/follow-up",
  "/api/admin/seller-pipeline/outcome",
  "/api/admin/public-requests/outcome",
  "/api/admin/deals/close",
]);

const CONTENT_WRITE_PATHS = new Set([
  "/api/admin/listings/edit",
  "/api/admin/listings/status",
  "/api/admin/listings/slug",
  "/api/admin/listings/publication-schedules",
  "/api/admin/listings/publication-schedules/cancel",
  "/api/admin/listings/publication-schedules/run-due",
  "/api/admin/media/reviews",
  "/api/admin/tours/approve",
]);

function timingSafeMatch(actual, expected) {
  if (!actual || Buffer.byteLength(actual) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function operatorId(value, label) {
  const id = String(value || "").trim();
  if (!OPERATOR_ID.test(id)) throw new Error(`${label} must be a stable operator ID`);
  return id;
}

function normalizedRoles(value, label, { fallbackAdmin = false } = {}) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : fallbackAdmin && (value === undefined || value === null || value === "")
        ? ["admin"]
        : [];
  const roles = [...new Set(values.map((role) => String(role || "").trim().toLowerCase()).filter(Boolean))].sort();
  if (!roles.length || roles.some((role) => !ADMIN_ROLES.includes(role))) {
    throw new Error(`${label} must contain one or more of: ${ADMIN_ROLES.join(", ")}`);
  }
  return roles;
}

export function adminCapabilities(principal) {
  const capabilities = new Set();
  for (const role of principal?.roles || []) {
    for (const capability of ROLE_CAPABILITIES[role] || []) capabilities.add(capability);
  }
  return [...capabilities].sort();
}

export function canAdminAccess(principal, capability) {
  if (!principal || !capability) return false;
  const capabilities = adminCapabilities(principal);
  return capabilities.includes("*") || capabilities.includes(capability);
}

export function requiredAdminCapability(method, pathname) {
  const verb = String(method || "GET").toUpperCase();
  if (pathname === "/admin") return "workspace:read";
  if (verb === "GET" && ["/admin/activity", "/api/admin/activity"].includes(pathname)) return "activity:read";
  if (
    verb === "GET" &&
    ["/admin/cases", "/api/admin/cases", "/api/admin/cases/intents", "/api/admin/cases/conditions"].includes(pathname)
  ) {
    return "cases:read";
  }
  if (
    verb !== "GET" &&
    ["/api/admin/cases", "/api/admin/cases/actions", "/api/admin/cases/conditions", "/api/admin/cases/conditions/actions"].includes(
      pathname,
    )
  ) {
    return "cases:write";
  }
  if (verb === "GET" && OPERATIONS_READ_PATHS.has(pathname)) return "operations:read";
  if (verb === "GET" && CONTENT_READ_PATHS.has(pathname)) return "content:read";
  if (verb === "GET" && TRANSLATION_READ_PATHS.has(pathname)) return "translations:read";
  if (verb !== "GET" && OPERATIONS_WRITE_PATHS.has(pathname)) return "operations:write";
  if (verb !== "GET" && CONTENT_WRITE_PATHS.has(pathname)) return "content:write";
  if (verb !== "GET" && ["/api/admin/translations/draft", "/api/admin/translations/approve"].includes(pathname)) {
    return "translations:write";
  }
  if (verb !== "GET" && pathname === "/api/admin/translations/publish") return "translations:publish";
  if (pathname === "/api/admin/locales" && verb === "GET") return "content:read";
  if (pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/")) {
    return verb === "GET" ? "administration:read" : "administration:write";
  }
  return null;
}

export function adminHomePath(principal) {
  if (principal?.roles?.includes("admin") || principal?.roles?.includes("broker")) return "/admin/today";
  if (principal?.roles?.includes("agent")) return "/admin/cases";
  if (principal?.roles?.includes("editor")) return "/admin/listings";
  if (principal?.roles?.includes("translator")) return "/admin/translations";
  return "/admin";
}

export function publicAdminPrincipal(principal) {
  if (!principal) return null;
  return {
    id: principal.id || null,
    source: principal.source,
    can_mutate: Boolean(principal.can_mutate),
    roles: [...(principal.roles || [])],
    capabilities: adminCapabilities(principal),
  };
}

export function adminCredentials(env = process.env) {
  const raw = String(env[CREDENTIALS_ENV] || "").trim();
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${CREDENTIALS_ENV} must be valid JSON`);
  }
  if (!Array.isArray(parsed) || !parsed.length) throw new Error(`${CREDENTIALS_ENV} must be a non-empty array`);

  const tokens = new Set();
  const rolesByOperator = new Map();
  return parsed.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`${CREDENTIALS_ENV} entry ${index + 1} must be an object`);
    }
    const id = operatorId(row.id, `${CREDENTIALS_ENV} entry ${index + 1} id`);
    const token = row.token;
    if (typeof token !== "string" || token.length < MIN_OPERATOR_TOKEN_LENGTH || token.trim() !== token || /\s/.test(token)) {
      throw new Error(`${CREDENTIALS_ENV} entry ${index + 1} token must be a ${MIN_OPERATOR_TOKEN_LENGTH}+ character bearer secret`);
    }
    if (tokens.has(token)) throw new Error(`${CREDENTIALS_ENV} entries must use unique bearer tokens`);
    tokens.add(token);
    const roles = normalizedRoles(row.roles, `${CREDENTIALS_ENV} entry ${index + 1} roles`);
    const priorRoles = rolesByOperator.get(id);
    if (priorRoles && priorRoles.join(",") !== roles.join(",")) {
      throw new Error(`${CREDENTIALS_ENV} entries for ${id} must use the same roles`);
    }
    rolesByOperator.set(id, roles);
    return { id, token, roles };
  });
}

export function adminBearerToken(env = process.env) {
  const token = env.MS_REALTY_ADMIN_TOKEN || (env.NODE_ENV === "production" ? "" : LOCAL_ADMIN_TOKEN);
  return token ? `Bearer ${token}` : "";
}

export function resolveAdminPrincipal(auth, env = process.env) {
  let credentials;
  try {
    credentials = adminCredentials(env);
  } catch {
    return null;
  }
  for (const credential of credentials) {
    if (timingSafeMatch(auth, `Bearer ${credential.token}`)) {
      return { id: credential.id, source: "credential_registry", can_mutate: true, roles: credential.roles };
    }
  }
  // Once individual credentials are configured, do not leave the shared token as a second path.
  if (credentials.length) return null;

  const expected = adminBearerToken(env);
  if (!timingSafeMatch(auth, expected)) return null;
  const id = String(env.MS_REALTY_ADMIN_ACTOR || "").trim();
  if (id) {
    try {
      return {
        id: operatorId(id, "MS_REALTY_ADMIN_ACTOR"),
        source: "named_legacy_token",
        can_mutate: true,
        roles: normalizedRoles(env.MS_REALTY_ADMIN_ROLES, "MS_REALTY_ADMIN_ROLES", { fallbackAdmin: true }),
      };
    } catch {
      return null;
    }
  }
  return {
    id: null,
    source: "shared_token",
    // Local fixtures can keep exercising workflows; a deployed shared token cannot claim a human action.
    can_mutate: env.NODE_ENV !== "production",
    roles: ["admin"],
  };
}

export function isAdminAuthorized(auth, env = process.env) {
  return Boolean(resolveAdminPrincipal(auth, env));
}

export function canAdminMutate(principal) {
  return Boolean(principal?.can_mutate);
}

export function assertAgentRealtyCaseMutation(principal, input) {
  if (!principal?.roles?.includes("agent")) return;
  if (AGENT_REALTY_CASE_ACTIONS.has(String(input?.action || "").trim())) return;
  const error = new Error("Agents may only complete or block case steps, or close a complete autonomous case");
  error.status = 403;
  error.capability = "human_case_control";
  throw error;
}

export function assertAgentRealtyCaseConditionMutation(principal, input) {
  if (!principal?.roles?.includes("agent")) return;
  if (AGENT_REALTY_CASE_CONDITION_ACTIONS.has(String(input?.action || "").trim())) return;
  const error = new Error("Agents may only open, satisfy, block, or expire case conditions");
  error.status = 403;
  error.capability = "human_case_control";
  throw error;
}

export function bindAuthenticatedOperator(input, principal, fields = ["actor"]) {
  if (!principal?.id) return input;
  const output = { ...(input || {}) };
  for (const field of fields) {
    const submitted = String(input?.[field] || "").trim();
    if (submitted && submitted !== principal.id) {
      throw new Error(`Submitted ${field} must match the authenticated operator`);
    }
    output[field] = principal.id;
  }
  return output;
}

export function withAuthenticatedAuditActor(input, principal) {
  return principal?.id ? { ...input, actor: principal.id } : input;
}
