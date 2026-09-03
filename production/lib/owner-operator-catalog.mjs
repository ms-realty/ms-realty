import { canAdminAccess, requiredAdminCapability } from "./admin-auth.mjs";

/**
 * The owner/operator surface is deliberately an operation registry rather
 * than an HTTP proxy.  Every operation below is tied to one route and one
 * verb; callers never supply a path or method.  The adapter remains the
 * authority for authentication, RBAC, workspace scoping, 2FA, audit, and
 * route-level validation.
 */
export const OWNER_OPERATOR_PLUGIN_ID = "ms-realty-operator";
export const OWNER_OPERATOR_ADMIN_READ_TOOL = "ms_realty_admin_read";
export const OWNER_OPERATOR_ADMIN_WRITE_TOOL = "ms_realty_admin_write";
export const OWNER_OPERATOR_HERMES_TOOL = "ms_realty_hermes";
export const OWNER_OPERATOR_CONTEXT_TOOL = "ms_realty_admin_context";
export const ADMIN_PAGE_SURFACES = Object.freeze([
  { id: "today", group: "today", path: "/admin/today", icon: "layout-dashboard", kind: "admin_today", capability: "operations:read" },
  { id: "tasks", group: "today", path: "/admin/tasks", icon: "list-checks", kind: "admin_task_queue", capability: "operations:read" },
  { id: "lead_inbox", group: "crm", path: "/admin/leads", icon: "inbox", kind: "admin_lead_inbox", capability: "operations:read" },
  { id: "contacts", group: "crm", path: "/admin/contacts", icon: "users", kind: "admin_contacts", capability: "operations:read" },
  { id: "consents", group: "crm", path: "/admin/consents", icon: "shield-check", kind: "admin_consents", capability: "operations:read" },
  { id: "documents", group: "crm", path: "/admin/documents", icon: "file-check", kind: "admin_document_checklists", capability: "operations:read" },
  { id: "realty_cases", group: "crm", path: "/admin/cases", icon: "kanban-square", kind: "admin_realty_cases", capability: "cases:read" },
  { id: "lead_pipeline", group: "crm", path: "/admin/pipeline", icon: "kanban-square", kind: "admin_lead_pipeline", capability: "operations:read" },
  { id: "requests", group: "crm", path: "/admin/requests", icon: "bell", kind: "admin_requests", capability: "operations:read" },
  { id: "viewings", group: "crm", path: "/admin/viewings", icon: "calendar-days", kind: "admin_viewings", capability: "operations:read" },
  { id: "reports", group: "crm", path: "/admin/reports", icon: "bar-chart-3", kind: "admin_operations_reports", capability: "operations:read" },
  { id: "activity", group: "workspace", path: "/admin/activity", icon: "list", kind: "admin_activity", capability: "activity:read" },
  { id: "listing_manager", group: "cms", path: "/admin/listings", icon: "building-2", kind: "admin_listing_manager", capability: "content:read" },
  { id: "translation_queue", group: "cms", path: "/admin/translations", icon: "languages", kind: "admin_translation_queue", capability: "translations:read" },
  { id: "approved_content", group: "cms", path: "/admin/approved-content", icon: "check-circle-2", kind: "admin_approved_content_review", capability: "content:read" },
  { id: "document_records", group: "crm", path: "/admin/documents/records", icon: "file-text", kind: "admin_document_records", capability: "documents:read" },
  { id: "media_library", group: "cms", path: "/admin/media", icon: "camera", kind: "admin_media_library", capability: "content:read" },
  { id: "locale_rollout", group: "cms", path: "/admin/locales", icon: "globe", kind: "admin_locale_rollout", capability: "content:read" },
  { id: "migration_review", group: "cms", path: "/admin/migration/review", icon: "file-check", kind: "admin_migration_review", capability: "administration:read" },
  { id: "hermes", group: "hermes", path: "/admin/hermes", icon: "sparkles", kind: "admin_hermes", capability: "administration:read" },
  { id: "connections", group: "workspace", path: "/admin/connect", icon: "link", kind: "admin_connections", capability: "settings:manage" },
  { id: "settings", group: "workspace", path: "/admin/settings", icon: "settings", kind: "admin_workspace_settings", capability: "workspace:read" },
  { id: "team", group: "workspace", path: "/admin/team", icon: "users", kind: "admin_team", capability: "team:manage" },
]);
export const OWNER_CONSOLE_NAV_DESTINATIONS = Object.freeze([
  { id: "today", group: "today", primary: "today", children: ["tasks"] },
  { id: "leads", group: "crm", primary: "lead_inbox", children: ["contacts", "consents", "documents", "document_records", "realty_cases", "lead_pipeline", "requests", "viewings", "reports"] },
  { id: "listings", group: "cms", primary: "listing_manager", children: ["media_library"] },
  { id: "translations", group: "cms", primary: "translation_queue", children: ["approved_content", "locale_rollout", "migration_review"] },
  { id: "hermes", group: "hermes", primary: "hermes", children: [] },
  { id: "integrations", group: "workspace", primary: "connections", children: [] },
  { id: "settings", group: "workspace", primary: "settings", children: ["team", "activity"] },
]);
export const OWNER_OPERATOR_CHALLENGE = Object.freeze({
  kind: "signed_expiring_challenge",
  version: "c1",
  algorithm: "HMAC-SHA256",
  ttl_seconds: 120,
  binds: ["operator_id", "session_id", "operation", "input_hash"],
});

const ADMIN_ROUTE_METHODS = [
  ["POST", "/api/admin/accounts/link"],
  ["POST", "/api/admin/accounts"],
  ["GET", "/api/admin/activity"],
  ["GET", "/api/admin/approved-content"],
  ["GET", "/api/admin/availability"],
  ["POST", "/api/admin/availability"],
  ["POST", "/api/admin/broker-contacts"],
  ["POST", "/api/admin/cases/actions"],
  ["POST", "/api/admin/cases/conditions/actions"],
  ["GET", "/api/admin/cases/conditions"],
  ["POST", "/api/admin/cases/conditions"],
  ["GET", "/api/admin/cases/intents"],
  ["GET", "/api/admin/cases"],
  ["POST", "/api/admin/cases"],
  ["GET", "/api/admin/cms-collections"],
  ["GET", "/api/admin/connections/agent-config"],
  ["POST", "/api/admin/connections/agent-config"],
  ["POST", "/api/admin/connections/disconnect"],
  ["GET", "/api/admin/connections"],
  ["POST", "/api/admin/connections"],
  ["GET", "/api/admin/consents"],
  ["POST", "/api/admin/consents/withdraw"],
  ["GET", "/api/admin/contacts"],
  ["GET", "/api/admin/data-exports/download"],
  ["GET", "/api/admin/data-exports"],
  ["POST", "/api/admin/data-exports"],
  ["POST", "/api/admin/deals/close"],
  ["POST", "/api/admin/deployable-redirects/export"],
  ["GET", "/api/admin/documents/{documentId}"],
  ["GET", "/api/admin/documents/{documentId}/revisions"],
  ["POST", "/api/admin/documents/{documentId}/revisions"],
  ["POST", "/api/admin/documents/outcome"],
  ["GET", "/api/admin/documents/records"],
  ["GET", "/api/admin/documents"],
  ["POST", "/api/admin/documents"],
  ["GET", "/api/admin/hermes"],
  ["POST", "/api/admin/hermes"],
  ["GET", "/api/admin/integrations"],
  ["POST", "/api/admin/integrations"],
  ["GET", "/api/admin/launch-input-checklist"],
  ["POST", "/api/admin/launch-readiness/export"],
  ["GET", "/api/admin/launch-readiness"],
  ["POST", "/api/admin/lead-pipeline/outcome"],
  ["POST", "/api/admin/leads/assign"],
  ["POST", "/api/admin/leads/bulk"],
  ["GET", "/api/admin/leads"],
  ["POST", "/api/admin/leads"],
  ["POST", "/api/admin/leads/snooze"],
  ["POST", "/api/admin/leads/unsnooze"],
  ["GET", "/api/admin/listing-quality-review-draft"],
  ["GET", "/api/admin/listing-quality-review-packet"],
  ["GET", "/api/admin/listing-quality-workbook"],
  ["POST", "/api/admin/listing-quality/import"],
  ["GET", "/api/admin/listing-quality"],
  ["POST", "/api/admin/listings/edit"],
  ["POST", "/api/admin/listings/publication-schedules/cancel"],
  ["POST", "/api/admin/listings/publication-schedules"],
  ["POST", "/api/admin/listings/publication-schedules/run-due"],
  ["GET", "/api/admin/listings"],
  ["POST", "/api/admin/listings/slug"],
  ["POST", "/api/admin/listings/status"],
  ["POST", "/api/admin/live-service-provisioning/import"],
  ["GET", "/api/admin/live-service-provisioning"],
  ["GET", "/api/admin/live-service-report-template"],
  ["POST", "/api/admin/live-service-reports/import"],
  ["GET", "/api/admin/live-services"],
  ["POST", "/api/admin/listings/copy/draft"],
  ["GET", "/api/admin/locales"],
  ["POST", "/api/admin/locales"],
  ["POST", "/api/admin/media/reviews"],
  ["GET", "/api/admin/media/uploads/{assetId}"],
  ["GET", "/api/admin/media/uploads"],
  ["POST", "/api/admin/media/uploads"],
  ["GET", "/api/admin/migration/review"],
  ["GET", "/api/admin/payload-collections"],
  ["GET", "/api/admin/payload-runtime-bootstrap"],
  ["POST", "/api/admin/payload-runtime/import"],
  ["GET", "/api/admin/payload-runtime"],
  ["GET", "/api/admin/pipeline"],
  ["GET", "/api/admin/preflight-reports"],
  ["POST", "/api/admin/profile"],
  ["GET", "/api/admin/production-recovery-template"],
  ["POST", "/api/admin/production-recovery/import"],
  ["GET", "/api/admin/production-recovery"],
  ["POST", "/api/admin/public-requests/outcome"],
  ["GET", "/api/admin/redirect-approval-workbook"],
  ["POST", "/api/admin/redirect-approvals/import"],
  ["POST", "/api/admin/redirect-approvals"],
  ["POST", "/api/admin/replies/delivery"],
  ["POST", "/api/admin/replies/draft"],
  ["POST", "/api/admin/replies"],
  ["GET", "/api/admin/reports/export"],
  ["GET", "/api/admin/reports"],
  ["GET", "/api/admin/requests"],
  ["POST", "/api/admin/saved-search-alerts/run-due"],
  ["GET", "/api/admin/security/audit-retention"],
  ["POST", "/api/admin/security/sessions/revoke"],
  ["GET", "/api/admin/security/sessions"],
  ["POST", "/api/admin/security/two-factor/activate"],
  ["POST", "/api/admin/security/two-factor/disable"],
  ["POST", "/api/admin/security/two-factor/enrol"],
  ["GET", "/api/admin/security/two-factor"],
  ["POST", "/api/admin/security/two-factor/verify"],
  ["POST", "/api/admin/seller-pipeline/outcome"],
  ["POST", "/api/admin/signature-requests/{requestId}/status"],
  ["GET", "/api/admin/signature-requests"],
  ["POST", "/api/admin/signature-requests"],
  ["POST", "/api/admin/social-marketing/publish"],
  ["GET", "/api/admin/seo-evidence/export"],
  ["POST", "/api/admin/seo-evidence/import"],
  ["GET", "/api/admin/seo-evidence"],
  ["GET", "/api/admin/seo-evidence/template"],
  ["GET", "/api/admin/seo-preflight"],
  ["GET", "/api/admin/settings"],
  ["POST", "/api/admin/settings"],
  ["GET", "/api/admin/team"],
  ["POST", "/api/admin/team"],
  ["GET", "/api/admin/tasks"],
  ["POST", "/api/admin/tasks"],
  ["POST", "/api/admin/tasks/action"],
  ["GET", "/api/admin/today"],
  ["POST", "/api/admin/tours/approve"],
  ["POST", "/api/admin/translations/approve"],
  ["POST", "/api/admin/translations/draft"],
  ["POST", "/api/admin/translations/publish"],
  ["GET", "/api/admin/translations"],
  ["GET", "/api/admin/viewings.ics"],
  ["POST", "/api/admin/viewings/follow-up"],
  ["GET", "/api/admin/viewings"],
  ["POST", "/api/admin/viewings"],
  ["GET", "/api/admin/viewings/week"],
  ["GET", "/api/admin/views"],
  ["POST", "/api/admin/views"],
  ["DELETE", "/api/admin/views"],
];

const HERMES_TOOL_COVERAGE = [
  {
    operation: "hermes_status",
    tool: OWNER_OPERATOR_HERMES_TOOL,
    source: "production/scripts/hermes-mcp-server.mjs",
    read_only: true,
    draft_only: true,
    prohibited_actions: ["publish", "send", "mark_indexable", "approve_legal"],
  },
  {
    operation: "hermes_next_tasks",
    tool: OWNER_OPERATOR_HERMES_TOOL,
    source: "production/scripts/hermes-mcp-server.mjs",
    read_only: true,
    draft_only: true,
    prohibited_actions: ["publish", "send", "mark_indexable", "approve_legal"],
  },
  {
    operation: "hermes_submit_draft",
    tool: OWNER_OPERATOR_HERMES_TOOL,
    source: "production/scripts/hermes-mcp-server.mjs",
    read_only: false,
    draft_only: true,
    confirmation: Object.freeze({ ...OWNER_OPERATOR_CHALLENGE, operation: "hermes_submit_draft" }),
    prohibited_actions: ["publish", "send", "mark_indexable", "approve_legal"],
  },
];

function operationSlug(method, pathname) {
  return `${method.toLowerCase()}_${pathname
    .replace(/^\/api\/admin\//, "")
    .replace(/\{([^}]+)\}/g, "by_$1")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
}

function operationFamily(pathname) {
  if (/\/hermes(?:\/|$)/.test(pathname)) return "hermes";
  if (/\/security\/|\/data-exports/.test(pathname)) return "security";
  if (/\/cases(?:\/|$)/.test(pathname)) return "cases";
  if (
    /\/listings?|\/listing-quality|\/media\/|\/social-marketing\/|\/tours\/|\/translations?|\/locales$|\/approved-content|\/cms-collections|\/redirect-/.test(
      pathname,
    )
  ) {
    return "content";
  }
  if (
    /\/accounts?|\/availability|\/broker-contacts|\/consents|\/deals\/|\/documents|\/lead|\/leads|\/pipeline|\/public-requests|\/replies|\/requests|\/saved-search|\/viewings|\/views/.test(
      pathname,
    )
  ) {
    return "operations";
  }
  return "administration";
}

function isSensitivePath(pathname) {
  return /\/accounts?|\/broker-contacts|\/connections\/agent-config|\/consents|\/contacts|\/data-exports|\/documents|\/hermes|\/leads?|\/replies|\/security\/|\/team/.test(
    pathname,
  );
}

function hermesAccess(method, pathname) {
  if (method === "POST" && ["/api/admin/hermes", "/api/admin/replies/draft", "/api/admin/translations/draft"].includes(pathname)) {
    return "draft_only";
  }
  return "none";
}

function executionBoundary(pathname) {
  // These routes intentionally go through the workspace-security or Payload
  // session implementation, or carry file/secret material. A delegated MCP
  // bearer must not pretend it can satisfy an interactive browser session or
  // a step-up challenge. Browser WebMCP is intentionally read/open only;
  // mutations stay on the signed delegated MCP path or visible forms.
  if (
    /\/security\//.test(pathname) ||
    /\/data-exports/.test(pathname) ||
    /\/(?:connections|integrations)(?:\/|$)/.test(pathname) ||
    pathname === "/api/admin/profile" ||
    pathname === "/api/admin/team" ||
    /\/media\/uploads(?:\/|$)/.test(pathname) ||
    /\/import$/.test(pathname)
  ) {
    return "browser_session";
  }
  return "mcp_delegated";
}

function browserUiPath(pathname) {
  if (/(?:\/connections|\/integrations)(?:\/|$)/.test(pathname)) return "/admin/connect";
  if (/\/security\/|\/data-exports/.test(pathname)) return "/admin/settings#settings-security";
  if (pathname === "/api/admin/profile") return "/admin/settings#owner-profile";
  if (pathname === "/api/admin/team") return "/admin/team";
  if (/\/media\/uploads(?:\/|$)/.test(pathname)) return "/admin/listings/edit";
  if (/\/import$/.test(pathname)) return "/admin/migration/review";
  return "/admin";
}

export const ADMIN_ROUTE_COVERAGE = Object.freeze(
  ADMIN_ROUTE_METHODS.map(([method, pathname]) => {
    const readOnly = method === "GET";
    const operation = `admin_${operationSlug(method, pathname)}`;
    const execution = executionBoundary(pathname);
    return Object.freeze({
      operation,
      method,
      pathname,
      family: operationFamily(pathname),
      tool: readOnly ? OWNER_OPERATOR_ADMIN_READ_TOOL : OWNER_OPERATOR_ADMIN_WRITE_TOOL,
      capability: requiredAdminCapability(method, pathname),
      read_only: readOnly,
      sensitive: isSensitivePath(pathname),
      confirmation: readOnly ? null : OWNER_OPERATOR_CHALLENGE,
      idempotency: "existing_admin_route",
      hermes_access: hermesAccess(method, pathname),
      execution,
      ...(execution === "browser_session" ? { ui_path: browserUiPath(pathname) } : {}),
      source: "app/api/admin/**/route.js",
    });
  }),
);

export const OWNER_OPERATOR_OPERATIONS = Object.freeze([
  ...ADMIN_ROUTE_COVERAGE,
  ...HERMES_TOOL_COVERAGE.map((row) => Object.freeze({ ...row, family: "hermes", source_kind: "hermes_tool" })),
]);

export const OWNER_OPERATOR_BROWSER_OPERATIONS = Object.freeze(
  ADMIN_ROUTE_COVERAGE.filter((row) => row.execution === "browser_session"),
);

export const OWNER_OPERATOR_REMOTE_OPERATIONS = Object.freeze(
  ADMIN_ROUTE_COVERAGE.filter((row) => row.execution === "mcp_delegated"),
);

const OWNER_OPERATOR_OPERATION_INDEX = new Map(ADMIN_ROUTE_COVERAGE.map((row) => [row.operation, row]));
const ADMIN_PAGE_SURFACE_INDEX = new Map(ADMIN_PAGE_SURFACES.map((row) => [row.id, row]));

export { HERMES_TOOL_COVERAGE };

export function ownerOperatorOperation(method, pathname) {
  const operation = `admin_${operationSlug(String(method || "GET").toUpperCase(), pathname)}`;
  return ADMIN_ROUTE_COVERAGE.find((row) => row.operation === operation) || null;
}

export function ownerOperatorOperationById(operation) {
  return OWNER_OPERATOR_OPERATION_INDEX.get(String(operation || "")) || null;
}

export function ownerOperatorConfirmation(operation) {
  const row = ownerOperatorOperationById(operation);
  if (!row || row.read_only) return null;
  return Object.freeze({ ...OWNER_OPERATOR_CHALLENGE, operation: row.operation });
}

export function adminPageSurfaceById(id) {
  return ADMIN_PAGE_SURFACE_INDEX.get(String(id || "")) || null;
}

export function ownerConsoleNavigation() {
  return OWNER_CONSOLE_NAV_DESTINATIONS.map((destination) =>
    Object.freeze({
      ...destination,
      route: adminPageSurfaceById(destination.primary),
      children: destination.children.map((id) => adminPageSurfaceById(id)).filter(Boolean),
    }),
  );
}

export function ownerOperatorCatalog(principal) {
  const operations = ADMIN_ROUTE_COVERAGE.filter((row) => canAdminAccess(principal, row.capability)).map((row) => ({
    operation: row.operation,
    method: row.method,
    pathname: row.pathname,
    capability: row.capability,
    family: row.family,
    read_only: row.read_only,
    sensitive: row.sensitive,
    execution: row.execution,
    ...(row.ui_path ? { ui_path: row.ui_path } : {}),
    ...(row.read_only ? {} : { confirmation: ownerOperatorConfirmation(row.operation) }),
  }));
  return {
    kind: "owner_operator_catalog",
    schema_version: 1,
    operator_id: principal.id,
    roles: principal.roles,
    summary: {
      total: operations.length,
      mcp_delegated: operations.filter((row) => row.execution === "mcp_delegated").length,
      browser_session: operations.filter((row) => row.execution === "browser_session").length,
    },
    operations,
  };
}

export function validateOwnerOperatorInput(input, { allowEmpty = true, maxKeys = 48 } = {}) {
  if (input === undefined && allowEmpty) return {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Owner/operator operation input must be an object");
  }
  const keys = Object.keys(input);
  if (keys.length > maxKeys) throw new Error("Owner/operator operation input has too many fields");
  const visit = (value, depth = 0) => {
    if (depth > 5) throw new Error("Owner/operator operation input is too deeply nested");
    if (typeof value === "string") {
      if (value.length > 20_000) throw new Error("Owner/operator operation input contains an oversized string");
      return;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("Owner/operator operation input contains an invalid number");
      return;
    }
    if (typeof value === "boolean" || value === null) return;
    if (Array.isArray(value)) {
      if (value.length > 100) throw new Error("Owner/operator operation input contains an oversized array");
      value.forEach((entry) => visit(entry, depth + 1));
      return;
    }
    if (typeof value === "object") {
      const objectKeys = Object.keys(value);
      if (objectKeys.length > maxKeys) throw new Error("Owner/operator operation input has too many nested fields");
      objectKeys.forEach((key) => {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) throw new Error("Owner/operator input contains an invalid field name");
        visit(value[key], depth + 1);
      });
      return;
    }
    throw new Error("Owner/operator operation input contains an unsupported value");
  };
  keys.forEach((key) => {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) throw new Error("Owner/operator input contains an invalid field name");
    visit(input[key]);
  });
  return input;
}

export function assertOwnerOperatorCatalog() {
  const seen = new Set();
  for (const row of ADMIN_ROUTE_COVERAGE) {
    if (seen.has(row.operation)) throw new Error(`Duplicate owner/operator operation: ${row.operation}`);
    seen.add(row.operation);
    if (!row.capability) throw new Error(`Missing capability for owner/operator operation: ${row.operation}`);
    if (!row.pathname.startsWith("/api/admin/")) throw new Error(`Non-admin route in owner/operator catalog: ${row.pathname}`);
    if (
      !row.read_only &&
      (row.confirmation?.kind !== OWNER_OPERATOR_CHALLENGE.kind ||
        row.confirmation?.version !== OWNER_OPERATOR_CHALLENGE.version ||
        row.confirmation?.algorithm !== OWNER_OPERATOR_CHALLENGE.algorithm)
    ) {
      throw new Error(`Mutating operation lacks confirmation: ${row.operation}`);
    }
  }
  for (const row of HERMES_TOOL_COVERAGE) {
    if (!row.draft_only || row.prohibited_actions?.includes("publish") !== true || row.prohibited_actions?.includes("send") !== true) {
      throw new Error(`Hermes operation is missing draft-only guardrails: ${row.operation}`);
    }
  }
  const pageIds = new Set();
  const pageKinds = new Set();
  for (const row of ADMIN_PAGE_SURFACES) {
    if (pageIds.has(row.id)) throw new Error(`Duplicate admin page id: ${row.id}`);
    if (pageKinds.has(row.kind)) throw new Error(`Duplicate admin page kind: ${row.kind}`);
    if (!row.path.startsWith("/admin/")) throw new Error(`Non-admin page in page surface catalog: ${row.path}`);
    if (!row.capability) throw new Error(`Missing capability for admin page: ${row.id}`);
    pageIds.add(row.id);
    pageKinds.add(row.kind);
  }
  for (const destination of OWNER_CONSOLE_NAV_DESTINATIONS) {
    if (!adminPageSurfaceById(destination.primary)) throw new Error(`Owner console destination is missing a primary page: ${destination.id}`);
    for (const childId of destination.children) {
      if (!adminPageSurfaceById(childId)) throw new Error(`Owner console destination child is missing a page: ${destination.id}.${childId}`);
    }
  }
  return true;
}

assertOwnerOperatorCatalog();
