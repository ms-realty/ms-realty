// The operational Worker remains the safe fallback for direct/internal
// rendering. Requests for the allowlisted public domain select the canonical
// authority below without changing admin/OAuth origin configuration.
export const FALLBACK_PUBLIC_ORIGIN = "https://ms-realty.ms-realty-bg.workers.dev";
export const CANONICAL_PUBLIC_ORIGIN = "https://makler-realty.com";

function forwardedHostname(value) {
  const host = String(value || "").split(",")[0].trim();
  if (!host) return "";
  try {
    return new URL(`https://${host}`).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

export function publicOrigin(env = process.env) {
  const configured = String(env?.MS_REALTY_PUBLIC_ORIGIN || "").trim();
  if (!configured) return FALLBACK_PUBLIC_ORIGIN;
  try {
    return new URL(configured).origin;
  } catch {
    // A malformed origin must not take the whole head down with it; the site
    // still has one true public domain to fall back on.
    return FALLBACK_PUBLIC_ORIGIN;
  }
}

// Only the two known .com hosts may select the canonical authority. Falling
// back for every other Host value prevents an untrusted forwarded Host header
// from poisoning canonical, hreflang, Open Graph, robots, or sitemap URLs.
export function publicOriginForHost(host, env = process.env) {
  const hostname = forwardedHostname(host);
  return ["makler-realty.com", "www.makler-realty.com"].includes(hostname)
    ? CANONICAL_PUBLIC_ORIGIN
    : publicOrigin(env);
}

export function isAbsoluteHttpUrl(value) {
  return /^https?:\/\//i.test(String(value ?? "").trim());
}

// Absolute values pass through untouched: media already published from the
// legacy WordPress host is a full URL, and mailto:/tel: are absolute for their
// own scheme.
export function absolutePublicUrl(value, { origin = publicOrigin() } = {}) {
  const raw = String(value ?? "").trim();
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  try {
    return new URL(raw, origin).toString();
  } catch {
    return raw;
  }
}
