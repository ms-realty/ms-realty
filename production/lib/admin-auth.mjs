import { timingSafeEqual } from "node:crypto";

const LOCAL_ADMIN_TOKEN = "local-admin-smoke";
const CREDENTIALS_ENV = "MS_REALTY_ADMIN_CREDENTIALS_JSON";
const OPERATOR_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/i;
const MIN_OPERATOR_TOKEN_LENGTH = 24;

export const ADMIN_ROLES = ["admin", "broker", "editor", "translator", "agent"];

// security:self is every operator's own second factor and own session list.
// data:export is deliberately admin-only (through the admin wildcard): a
// workspace export is a bulk personal-data release, not an operations read.
const ROLE_CAPABILITIES = {
  admin: ["*"],
  broker: [
    "workspace:read",
    "operations:read",
    "operations:write",
    "documents:read",
    "documents:write",
    "cases:read",
    "cases:write",
    "content:read",
    "activity:read",
    "security:self",
  ],
  editor: ["workspace:read", "content:read", "content:write", "translations:read", "translations:write", "translations:publish", "activity:read", "security:self"],
  translator: ["workspace:read", "content:read", "translations:read", "translations:write", "activity:read", "security:self"],
  agent: ["workspace:read", "cases:read", "cases:write", "activity:read", "security:self"],
};

// B6 workspace security and data
const SECURITY_SELF_PATHS = new Set([
  "/api/admin/security/two-factor",
  "/api/admin/security/two-factor/enrol",
  "/api/admin/security/two-factor/activate",
  "/api/admin/security/two-factor/verify",
  "/api/admin/security/two-factor/disable",
  "/api/admin/security/sessions",
  "/api/admin/security/sessions/revoke",
]);
const DATA_EXPORT_PATHS = new Set(["/api/admin/data-exports", "/api/admin/data-exports/download"]);
// Reachable with only a bearer token while a required second factor is not yet
// active, so turning the requirement on never locks an operator out of the very
// routes that let them enrol.
export const TWO_FACTOR_SELF_SERVICE_PATHS = new Set([
  "/api/admin/security/two-factor",
  "/api/admin/security/two-factor/enrol",
  "/api/admin/security/two-factor/activate",
  "/api/admin/security/two-factor/verify",
  "/api/admin/security/two-factor/disable",
]);

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
  "/api/admin/availability",
  "/api/admin/viewings/week",
  "/admin/reports",
  "/api/admin/reports",
  "/api/admin/reports/export",
  "/api/admin/viewings.ics",
  // B1: an operator reads their own saved views for the inbox and pipeline.
  "/api/admin/views",
  "/api/admin/tasks",
  "/api/admin/automations",
  "/api/admin/automations/runs",
  "/api/admin/hermes/runs",
]);

const CONTENT_READ_PATHS = new Set([
  "/admin/listings",
  "/api/admin/listings",
  "/admin/listings/edit",
  // Package B2: the approved-content review surface (team profiles, area
  // guides, financing partners, purchase fee table).
  "/admin/approved-content",
  "/api/admin/approved-content",
]);

const TRANSLATION_READ_PATHS = new Set(["/admin/translations", "/api/admin/translations"]);
const OPERATIONS_WRITE_PATHS = new Set([
  "/api/admin/replies",
  "/api/admin/replies/delivery",
  "/api/admin/replies/draft",
  "/api/admin/leads",
  "/api/admin/lead-pipeline/outcome",
  "/api/admin/leads/assign",
  // B1 lead operations: deferral, batch work, and saved views.
  "/api/admin/leads/snooze",
  "/api/admin/leads/unsnooze",
  "/api/admin/leads/bulk",
  "/api/admin/views",
  "/api/admin/accounts",
  "/api/admin/accounts/link",
  "/api/admin/documents/outcome",
  "/api/admin/consents/withdraw",
  "/api/admin/viewings",
  "/api/admin/viewings/follow-up",
  "/api/admin/availability",
  "/api/admin/seller-pipeline/outcome",
  "/api/admin/public-requests/outcome",
  "/api/admin/saved-search-alerts/run-due",
  "/api/admin/deals/close",
  "/api/admin/tasks",
  "/api/admin/automations",
]);

// Document metadata, immutable revisions, and signature-request state are a
// separate capability from the older checklist ledger at /documents. The
// checklist GET/POST outcome routes retain their operations capability; the
// durable records below are served by the Payload-backed document service.
const DOCUMENT_READ_PATHS = new Set([
  "/api/admin/documents/records",
  "/api/admin/signature-requests",
]);
const DOCUMENT_WRITE_PATHS = new Set([
  "/api/admin/documents",
  "/api/admin/signature-requests",
]);

const CONTENT_WRITE_PATHS = new Set([
  "/api/admin/listings/edit",
  "/api/admin/listings/status",
  "/api/admin/listings/slug",
  "/api/admin/listings/publication-schedules",
  "/api/admin/listings/publication-schedules/cancel",
  "/api/admin/listings/publication-schedules/run-due",
  "/api/admin/media/reviews",
  "/api/admin/media/uploads",
  "/api/admin/social-marketing/publish",
  "/api/admin/tours/approve",
]);

function timingSafeMatch(actual, expected) {
  if (!actual || Buffer.byteLength(actual) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

// Off unless an operator entry opts in, so shipping the feature cannot lock
// anybody out. Only an explicit true turns it on.
function twoFactorRequirement(row, label) {
  const value = row?.require_two_factor ?? row?.require_2fa;
  if (value === undefined || value === null || value === "") return false;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new Error(`${label} must be true or false`);
}

function workspaceIds(value) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(values.map((workspaceId) => String(workspaceId || "").trim()).filter(Boolean))].sort();
}

export function operatorId(value, label) {
  const id = String(value || "").trim();
  if (!OPERATOR_ID.test(id)) throw new Error(`${label} must be a stable operator ID`);
  return id;
}

export function normalizedRoles(value, label, { fallbackAdmin = false } = {}) {
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

export function canAdminAccessWorkspace(principal, workspaceId) {
  if (!principal) return false;
  if (principal.roles?.includes("admin")) return true;
  const required = String(workspaceId || "").trim();
  if (!required) return false;
  return (principal.workspace_ids || []).map((value) => String(value || "").trim()).includes(required);
}

export function requiredAdminCapability(method, pathname) {
  const verb = String(method || "GET").toUpperCase();
  if (pathname === "/admin") return "workspace:read";
  // B6 workspace security and data
  if (SECURITY_SELF_PATHS.has(pathname)) return "security:self";
  if (DATA_EXPORT_PATHS.has(pathname)) return "data:export";
  if (verb === "GET" && pathname === "/api/admin/security/audit-retention") return "activity:read";
  // Every signed-in Payload operator may update their own non-privileged
  // profile fields. Payload collection access still fences the record and the
  // role/workspace fields; this capability only makes the self-service route
  // reachable through the custom admin shell.
  if (pathname === "/api/admin/profile") return "workspace:read";
  if (["/admin/team", "/api/admin/team"].includes(pathname)) return "team:manage";
  // Connecting the agency's own tools, disconnecting them, and minting the
  // assistant's delegated access all change what this workspace can reach, so
  // they are settings changes. Reads keep falling through to administration:read
  // below, which is where they already were.
  if (
    verb !== "GET" &&
    [
      "/admin/connect",
      "/api/admin/connections",
      "/api/admin/connections/disconnect",
      "/api/admin/integrations",
    ].includes(pathname)
  ) {
    return "settings:manage";
  }
  if (pathname === "/api/admin/connections/agent-config") return "settings:manage";
  if (verb === "GET" && DOCUMENT_READ_PATHS.has(pathname)) return "documents:read";
  if (verb === "POST" && DOCUMENT_WRITE_PATHS.has(pathname)) return "documents:write";
  if (pathname !== "/api/admin/documents/outcome" && /^\/api\/admin\/documents\/[^/]+$/.test(pathname)) {
    return verb === "GET" ? "documents:read" : "documents:write";
  }
  if (/^\/api\/admin\/documents\/[^/]+\/revisions$/.test(pathname)) return verb === "GET" ? "documents:read" : "documents:write";
  if (/^\/api\/admin\/signature-requests\/[^/]+\/status$/.test(pathname)) {
    return verb === "GET" ? "documents:read" : "documents:write";
  }
  // Every operator may read the workspace settings screen; only an admin saves.
  if (["/admin/settings", "/api/admin/settings"].includes(pathname)) {
    return verb === "GET" ? "workspace:read" : "settings:manage";
  }
  if (verb === "GET" && ["/admin/activity", "/api/admin/activity"].includes(pathname)) return "activity:read";
  const operationsReadRoute =
    /^\/api\/admin\/(?:tasks(?:\/[^/]+)?|automations(?:\/runs(?:\/[^/]+)?|\/[^/]+)?|hermes\/runs(?:\/[^/]+)?)$/.test(
      pathname,
    );
  const operationsWriteRoute =
    /^\/api\/admin\/(?:tasks(?:\/[^/]+(?:\/complete)?)?|automations(?:\/[^/]+(?:\/run)?)?)$/.test(
      pathname,
    );
  if (operationsReadRoute && verb === "GET") return "operations:read";
  if (operationsWriteRoute && verb !== "GET") return "operations:write";
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
  // Uploaded media: listing and enquiry photo bytes are unreviewed and private,
  // so reading one is a content read and writing one is a content write.
  if (pathname === "/api/admin/media/uploads" || pathname.startsWith("/api/admin/media/uploads/")) {
    return verb === "GET" ? "content:read" : "content:write";
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
    workspace_ids: [...(principal.workspace_ids || [])],
    capabilities: adminCapabilities(principal),
    require_two_factor: principal.require_two_factor === true,
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
  const workspacesByOperator = new Map();
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
    const assignedWorkspaces = workspaceIds(row.workspace_ids);
    const requireTwoFactor = twoFactorRequirement(row, `${CREDENTIALS_ENV} entry ${index + 1} require_two_factor`);
    const priorRoles = rolesByOperator.get(id);
    if (priorRoles && priorRoles.join(",") !== roles.join(",")) {
      throw new Error(`${CREDENTIALS_ENV} entries for ${id} must use the same roles`);
    }
    const priorWorkspaces = workspacesByOperator.get(id);
    if (priorWorkspaces && priorWorkspaces.join(",") !== assignedWorkspaces.join(",")) {
      throw new Error(`${CREDENTIALS_ENV} entries for ${id} must use the same workspace_ids`);
    }
    rolesByOperator.set(id, roles);
    workspacesByOperator.set(id, assignedWorkspaces);
    return { id, token, roles, workspace_ids: assignedWorkspaces, require_two_factor: requireTwoFactor };
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
      return {
        id: credential.id,
        source: "credential_registry",
        can_mutate: true,
        roles: credential.roles,
        workspace_ids: credential.workspace_ids,
        require_two_factor: credential.require_two_factor === true,
      };
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
  if (auth && typeof auth === "object" && auth.source === "payload_session") return true;
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
