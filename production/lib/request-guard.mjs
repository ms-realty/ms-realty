// Cross-origin write protection shared by both runtimes (bare Node server and
// the Next App Router adapters).
//
// The deployment authenticates operators at the edge (Caddy attaches the admin
// bearer to /admin/*), so a browser on any site could otherwise drive an
// authenticated admin mutation with a plain cross-origin <form> POST. Admin
// forms still work without JavaScript, so the fix cannot be "reject
// urlencoded" — it has to be an origin check.
//
// Rule: for state-changing methods, if the request carries browser-set origin
// evidence (Sec-Fetch-Site or Origin), it must say same-origin. Requests with
// neither header are non-browser clients (curl, server-to-server), which
// cannot be CSRF'd, so they pass.

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

export function requestHost(headers) {
  return normalizedHost(readHeader(headers, "x-forwarded-host") || readHeader(headers, "host"));
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
          return normalizedHost(new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).host);
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
  if (fetchSite && !SAME_SITE_VALUES.has(fetchSite)) return "cross_site_request";

  const origin = readHeader(headers, "origin").trim();
  // Some browsers send `Origin: null` for sandboxed/opaque contexts.
  if (!origin || origin.toLowerCase() === "null") return fetchSite ? null : origin ? "opaque_origin" : null;

  let originHost;
  try {
    originHost = normalizedHost(new URL(origin).host);
  } catch {
    return "invalid_origin";
  }
  const host = requestHost(headers);
  if (!host) return "unknown_host";
  if (originHost === host) return null;
  return trustedWriteHosts(env).has(originHost) ? null : "cross_origin_request";
}
