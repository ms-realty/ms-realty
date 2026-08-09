export const DURABLE_CASE_AUTHORITY_PATHS = new Set([
  "/api/admin/cases",
  "/api/admin/cases/actions",
  "/api/admin/cases/conditions",
  "/api/admin/cases/conditions/actions",
]);

// The browser login exchanges the operator key for a cookie; both routes
// only set or clear that cookie — nothing touches the ephemeral disk.
const ADMIN_SESSION_PATHS = new Set(["/admin/login", "/admin/logout"]);
export function allowsAdminSessionMutation({ method, pathname }) {
  return method === "POST" && ADMIN_SESSION_PATHS.has(pathname);
}

// The MCP endpoint speaks JSON-RPC over POST (and DELETE for session close).
// It is safe to admit through the edge mutation gate because the app 401s
// unauthenticated calls and the Worker disables ledger-writing MCP tools via
// MS_REALTY_MCP_WRITES_DISABLED, so nothing can write to the ephemeral disk.
// MS_REALTY_PUBLIC_ORIGIN doubles as the operator's deliberate "MCP is
// configured" switch — unset, the endpoint stays 503 like every mutation.
export function allowsMcpRequest({ method, pathname, env }) {
  return (
    (method === "POST" || method === "DELETE") &&
    pathname === "/mcp" &&
    Boolean(env.MS_REALTY_PUBLIC_ORIGIN?.trim())
  );
}

export function allowsDurableCaseAuthorityMutation({ method, pathname, env }) {
  return (
    method === "POST" &&
    DURABLE_CASE_AUTHORITY_PATHS.has(pathname) &&
    env.MS_REALTY_CASE_PAYLOAD_AUTHORITY_ENABLED === "true" &&
    env.MS_REALTY_CASE_REQUEST_PROJECTION_ENABLED !== "true" &&
    Boolean(env.MS_REALTY_WORKSPACE_ID?.trim()) &&
    Boolean(env.PAYLOAD_SECRET?.trim()) &&
    Boolean(env.DATABASE_URL?.trim())
  );
}
