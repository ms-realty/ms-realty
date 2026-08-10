export const DURABLE_CASE_AUTHORITY_PATHS = new Set([
  "/api/admin/cases",
  "/api/admin/cases/actions",
  "/api/admin/cases/conditions",
  "/api/admin/cases/conditions/actions",
]);

export const LEAD_PROBE_HEADER = "x-ms-realty-lead-probe";

// Payload's cookiePrefix is pinned by the config contract test. Keeping the
// exact cookie name here means a language/theme preference cookie cannot wake
// the Container for a mutation; Payload still verifies the JWT, role, CSRF
// origin, and collection access after the request reaches the app.
export const PAYLOAD_SESSION_COOKIE = "payload-token";

// Only human-managed collections are reachable from the browser mutation
// gate. Server-owned append-only/event/outbox/encrypted-contact collections
// stay closed even when a caller presents a Payload-shaped cookie.
export const PAYLOAD_ADMIN_CRUD_COLLECTIONS = new Set([
  "admins",
  "locales",
  "listings",
  "listing_translations",
  "properties",
  "locations",
  "media_assets",
  "listing_tours",
  "realty_cases",
  "realty_case_conditions",
  "public_leads",
]);

const PAYLOAD_ADMIN_AUTH_SEGMENTS = new Set([
  "first-register",
  "forgot-password",
  "init",
  "login",
  "logout",
  "me",
  "refresh-token",
  "reset-password",
  "unlock",
  "verify",
]);

const PAYLOAD_ADMIN_MUTATION_METHODS = new Set(["POST", "PATCH", "DELETE"]);
const NEXT_SERVER_ACTION_ID = /^[0-9a-f]{40}$/i;

function fullyDecodePathSegment(segment) {
  let decoded = segment;
  for (let pass = 0; pass < 5; pass += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    if (next === decoded) return decoded;
    decoded = next;
  }

  // More encoding layers are not a legitimate Payload collection/id shape.
  // Failing closed here also prevents a downstream router from revealing a
  // blocked auth endpoint after one more decode than the Worker performed.
  try {
    return decodeURIComponent(decoded) === decoded ? decoded : null;
  } catch {
    return null;
  }
}

function decodedPathSegments(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return null;
  const raw = pathname.split("/").slice(1);
  while (raw.at(-1) === "") raw.pop();
  if (!raw.length || raw.some((segment) => !segment)) return null;
  const decoded = raw.map(fullyDecodePathSegment);
  if (decoded.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) {
    return null;
  }
  return decoded;
}

function hasPayloadSessionCookie(request) {
  return String(request?.headers?.get("cookie") || "")
    .split(";")
    .some((part) => {
      const [name, ...value] = part.trim().split("=");
      return name === PAYLOAD_SESSION_COOKIE && Boolean(value.join("=").trim());
    });
}

export function isPayloadFirstRegisterPath(pathname) {
  const segments = decodedPathSegments(pathname);
  return Boolean(segments && segments.length === 3 && segments[0] === "api" && segments[1] === "admins" && segments[2] === "first-register");
}

export function allowsPayloadAdminMutation({ request, pathname }) {
  const method = request?.method;
  if (!PAYLOAD_ADMIN_MUTATION_METHODS.has(method)) return false;
  const segments = decodedPathSegments(pathname);
  if (!segments || segments[0] !== "api") return false;

  // The sole anonymous mutation is credential login. First-user registration,
  // password reset, unlock, and verification are deliberately not production
  // entrypoints; an existing admin creates and maintains every operator.
  if (segments.length === 3 && segments[1] === "admins" && segments[2] === "login") {
    return method === "POST";
  }
  if (!hasPayloadSessionCookie(request)) return false;
  if (segments[1] === "admins" && PAYLOAD_ADMIN_AUTH_SEGMENTS.has(segments[2])) {
    return method === "POST" && segments.length === 3 && (segments[2] === "logout" || segments[2] === "refresh-token");
  }

  // Payload preferences are authenticated, user-scoped records that the Admin
  // UI writes through POST/DELETE rather than collection CRUD.
  if (segments[1] === "payload-preferences") {
    return segments.length === 3 && (method === "POST" || method === "DELETE");
  }

  const collection = segments[1];
  if (!PAYLOAD_ADMIN_CRUD_COLLECTIONS.has(collection)) return false;
  const tail = segments.slice(2);
  if (method === "PATCH" || method === "DELETE") return tail.length <= 1;
  if (method !== "POST") return false;
  if (tail.length === 0) return true;
  if (tail.length === 1 && request.headers.get("x-payload-http-method-override")?.toUpperCase() === "GET") return true;
  if ((tail[0] === "access" && tail.length <= 2) || (tail.length === 2 && tail[1] === "duplicate")) return true;
  return tail.length === 2 && tail[0] === "versions";
}

// Payload Admin v3 invokes a Next Server Action for authenticated form state,
// document operations, and navigation. Admit only real action-shaped POSTs on
// the configured Admin prefix. Cookie presence is an edge admission hint, not
// authentication: Next/Payload still validates the action ID, JWT, CSRF origin,
// RBAC, and collection access before executing anything.
export function allowsPayloadAdminServerAction({ request, pathname }) {
  if (request?.method !== "POST" || !hasPayloadSessionCookie(request)) return false;
  const segments = decodedPathSegments(pathname);
  if (!segments || segments[0] !== "payload-admin" || segments.includes("create-first-user")) return false;
  return NEXT_SERVER_ACTION_ID.test(request.headers.get("next-action") || "");
}

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
