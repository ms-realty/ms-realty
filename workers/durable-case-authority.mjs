export const DURABLE_CASE_AUTHORITY_PATHS = new Set([
  "/api/admin/cases",
  "/api/admin/cases/actions",
  "/api/admin/cases/conditions",
  "/api/admin/cases/conditions/actions",
]);

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
