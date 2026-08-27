// Canonical URLs, hreflang, og:url and JSON-LD identifiers all use this one
// production public origin. Isolated workers.dev drill hosts are handled at the
// edge and remain noindex; they are never another canonical authority.
export const FALLBACK_PUBLIC_ORIGIN = "https://ms-realty.ms-realty-bg.workers.dev";

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
