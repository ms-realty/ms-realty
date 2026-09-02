import { CANONICAL_PUBLIC_ORIGIN, FALLBACK_PUBLIC_ORIGIN } from "./public-origin.mjs";

// Cross-origin write protection shared by both runtimes (bare Node server and
// the Next App Router adapters).
//
// The compose deployment authenticates operators at the edge:
// production/Caddyfile.production-review attaches the admin bearer to every
// /admin/* and /api/admin/* request. That makes the credential ambient, so a
// browser on any site could otherwise drive an authenticated admin mutation
// with a plain cross-origin <form> POST — Basic Auth does not stop it, because
// browsers re-send cached credentials to that origin. Admin forms still work
// without JavaScript, so the fix cannot be "reject urlencoded" — it has to be
// an origin check.
//
// The Cloudflare edge now admits custom-admin mutations only when the request
// carries the Payload session cookie name. This app-level guard remains
// mandatory: the Worker does not parse or trust the signed session and cannot
// replace same-origin, role, workspace, and Payload access validation.
//
// Rule: for state-changing methods, browser-set origin evidence must identify
// either the request host or an explicitly trusted application origin.
// Requests with neither header are non-browser clients (curl,
// server-to-server), which cannot be CSRF'd, so they pass.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SAME_SITE_VALUES = new Set(["same-origin", "none"]);

export function readHeader(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return String(headers.get(name) || "");
  const direct = headers[name];
  if (direct) return String(direct);
  const pascal = name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
  return headers[pascal] ? String(headers[pascal]) : "";
}

function normalizedHost(value) {
  return String(value || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
}

function canonicalWriteHost(value) {
  const host = normalizedHost(value).replace(/\.$/, "");
  if (host === "www.makler-realty.com") return "makler-realty.com";
  if (host === "www.makler-realty.ru") return "makler-realty.ru";
  return host;
}

const OWNED_ADMIN_LOGIN_HOSTS = new Set(
  [CANONICAL_PUBLIC_ORIGIN, FALLBACK_PUBLIC_ORIGIN].map((origin) => canonicalWriteHost(new URL(origin).host)),
);

export function requestHost(headers) {
  return canonicalWriteHost(readHeader(headers, "x-forwarded-host") || readHeader(headers, "host"));
}

// Extra hosts that may drive writes (e.g. an admin subdomain in front of the
// same app). Comma-separated origins or bare hostnames.
export function trustedWriteHosts(env = process.env) {
  return new Set(
    String(env.MS_REALTY_TRUSTED_WRITE_ORIGINS || "")
      .split(",")
      .map((value) => {
        const trimmed = value.trim();
        if (!trimmed) return "";
        try {
          return canonicalWriteHost(new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).host);
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );
}

// Returns null when the write is allowed, or a short reason string when it is not.
export function crossOriginWriteRejection(method, headers, { env = process.env } = {}) {
  if (SAFE_METHODS.has(String(method || "GET").toUpperCase())) return null;

  const fetchSite = readHeader(headers, "sec-fetch-site").trim().toLowerCase();
  const origin = readHeader(headers, "origin").trim();
  // Some browsers send `Origin: null` for sandboxed/opaque contexts.
  if (!origin || origin.toLowerCase() === "null") return fetchSite ? null : origin ? "opaque_origin" : null;

  let originHost;
  try {
    originHost = canonicalWriteHost(new URL(origin).host);
  } catch {
    return "invalid_origin";
  }
  const host = requestHost(headers);
  if (!host) return fetchSite && !SAME_SITE_VALUES.has(fetchSite) ? "cross_site_request" : "unknown_host";
  if (originHost === host) return null;
  if (trustedWriteHosts(env).has(originHost)) return null;
  if (fetchSite && !SAME_SITE_VALUES.has(fetchSite)) return "cross_site_request";
  return "cross_origin_request";
}

// The canonical domain may currently hand a signed-out owner to the durable
// workers.dev login route (and vice versa). Keep that cutover exception scoped
// to the first credential POST: a session cookie or Authorization header means
// the request must obey the normal cross-origin write policy.
export function adminLoginWriteRejection(
  method,
  headers,
  { pathname = "", hasAdminCredential = false, env = process.env } = {},
) {
  const rejection = crossOriginWriteRejection(method, headers, { env });
  if (
    !rejection ||
    String(method || "GET").toUpperCase() !== "POST" ||
    pathname !== "/admin/login" ||
    hasAdminCredential
  ) {
    return rejection;
  }

  const origin = readHeader(headers, "origin").trim();
  let originHost;
  try {
    originHost = canonicalWriteHost(new URL(origin).host);
  } catch {
    return rejection;
  }
  const host = requestHost(headers);
  return OWNED_ADMIN_LOGIN_HOSTS.has(originHost) && OWNED_ADMIN_LOGIN_HOSTS.has(host) ? null : rejection;
}

// Public lead intake is intentionally browser-only once the durable store is
// enabled. Unlike authenticated automation, it must carry a browser Origin
// that exactly matches the request URL; missing Origin is not treated as a
// server-to-server exception on this endpoint.
export function sameOriginWriteRejection(method, headers, { requestUrl } = {}) {
  if (SAFE_METHODS.has(String(method || "GET").toUpperCase())) return null;

  const fetchSite = readHeader(headers, "sec-fetch-site").trim().toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") return "cross_site_request";

  const origin = readHeader(headers, "origin").trim();
  if (!origin) return "missing_origin";
  if (origin.toLowerCase() === "null") return "opaque_origin";

  try {
    const source = new URL(origin);
    const target = new URL(String(requestUrl || ""));
    if (
      source.username ||
      source.password ||
      source.pathname !== "/" ||
      source.search ||
      source.hash ||
      !["http:", "https:"].includes(source.protocol) ||
      !["http:", "https:"].includes(target.protocol)
    ) {
      return "invalid_origin";
    }
    return source.origin === target.origin ? null : "cross_origin_request";
  } catch {
    return "invalid_origin";
  }
}
