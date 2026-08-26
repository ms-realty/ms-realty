export const DURABLE_CASE_AUTHORITY_PATHS = new Set([
  "/api/admin/cases",
  "/api/admin/cases/actions",
  "/api/admin/cases/conditions",
  "/api/admin/cases/conditions/actions",
]);

export const DURABLE_LISTING_AUTHORITY_PATHS = new Set([
  "/api/admin/listings/edit",
  "/api/admin/listings/status",
]);

export const LEAD_PROBE_HEADER = "x-ms-realty-lead-probe";

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

// Comparing digests rather than raw strings keeps the comparison constant-time
// and avoids leaking the configured secret length.
export async function secretMatches(presented, expected) {
  const [a, b] = await Promise.all([sha256(presented), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function allowsLeadProbeMutation({ request, pathname, env }) {
  if (request.method !== "POST" || pathname !== "/api/leads") return false;
  const expected = env.MS_REALTY_LEAD_PROBE_TOKEN?.trim() || "";
  const presented = request.headers.get(LEAD_PROBE_HEADER)?.trim() || "";
  return Boolean(expected && presented) && secretMatches(presented, expected);
}

export function allowsPublicLeadMutation({ method, pathname, env }) {
  return (
    method === "POST" &&
    pathname === "/api/leads" &&
    String(env.MS_REALTY_LEAD_DURABLE_STORE_ENABLED || "").trim() === "true" &&
    Boolean(env.PAYLOAD_SECRET?.trim()) &&
    Boolean(env.DATABASE_URL?.trim()) &&
    String(env.MS_REALTY_LEAD_CONTACT_KEY || "").length >= 32 &&
    Boolean(env.MS_REALTY_WORKSPACE_ID?.trim())
  );
}

export function allowsPublicEventMutation({ method, pathname, env }) {
  return (
    method === "POST" &&
    pathname === "/api/events" &&
    String(env.MS_REALTY_EVENT_DURABLE_STORE_ENABLED || "").trim() === "true" &&
    Boolean(env.PAYLOAD_SECRET?.trim()) &&
    Boolean(env.DATABASE_URL?.trim())
  );
}

export function allowsProviderWebhookMutation({ method, pathname, env }) {
  if (method !== "POST" || !["/api/webhooks/whatsapp", "/api/webhooks/viber"].includes(pathname)) return false;
  if (
    !env.PAYLOAD_SECRET?.trim() ||
    !env.DATABASE_URL?.trim() ||
    String(env.MS_REALTY_PROVIDER_TOKEN_KEY || "").length < 32
  ) {
    return false;
  }
  return pathname === "/api/webhooks/viber" || String(env.MS_REALTY_META_APP_SECRET || "").length >= 16;
}

const ADMIN_SESSION_COOKIE = "ms_admin";

function decodedSecurityPath(pathname) {
  let current = String(pathname || "");
  // Every successful decode shortens the string, so the original length is a
  // finite upper bound even for deliberately over-encoded bypass attempts.
  const maxDepth = current.length + 1;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    let decoded;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (decoded === current) break;
    current = decoded;
  }
  // Backslashes are path separators in several downstream routers. Treating
  // them as slashes here prevents an edge/app interpretation mismatch.
  current = current.replaceAll("\\", "/");
  // eslint-disable-next-line no-control-regex -- path controls are never valid routes
  if (!current.startsWith("/") || /[\u0000-\u001f\u007f]/.test(current)) return null;
  return current;
}

function securityPathSegments(pathname) {
  const decoded = decodedSecurityPath(pathname);
  return decoded ? decoded.split("/").filter(Boolean) : [];
}

export function hasAdminSessionCookie(cookieHeader) {
  for (const part of String(cookieHeader || "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ADMIN_SESSION_COOKIE && rest.join("=").trim()) return true;
  }
  return false;
}

export function isPayloadPrivatePath(pathname) {
  const [first, second] = securityPathSegments(pathname);
  return (
    first === "payload-admin" ||
    first === "graphql" ||
    first === "graphql-playground" ||
    (first === "api" && second === "admins") ||
    (first === "api" && second === "graphql") ||
    (first === "api" && second === "graphql-playground")
  );
}

export function isPublicAdminPath(pathname) {
  const [first, second] = securityPathSegments(pathname);
  return first === "admin" || (first === "api" && second === "admin");
}

function isExactSecurityPath(pathname, expected) {
  return String(pathname || "") === expected;
}

// Login is the only anonymous browser mutation. Logout and team management use
// the exact Payload session cookie name; Payload then validates the signed
// token, database session, role, workspace, and CSRF. Business mutations are
// admitted separately only when their durable authority is configured.
export function allowsAdminSessionMutation({ request, method, pathname }) {
  const verb = String(method || "").toUpperCase();
  if (verb === "POST" && isExactSecurityPath(pathname, "/admin/login")) return true;
  if (verb !== "POST") return false;
  const hasSession = hasAdminSessionCookie(request?.headers?.get("cookie") || "");
  if (!hasSession) return false;
  if (verb === "POST" && isExactSecurityPath(pathname, "/admin/logout")) return true;
  return isExactSecurityPath(pathname, "/api/admin/team");
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

export function allowsDurableListingAuthorityMutation({ method, pathname, env }) {
  return (
    method === "POST" &&
    DURABLE_LISTING_AUTHORITY_PATHS.has(pathname) &&
    Boolean(env.PAYLOAD_SECRET?.trim()) &&
    Boolean(env.DATABASE_URL?.trim())
  );
}
