// The public site has no custom domain attached yet: it runs on a *.workers.dev
// preview host in front of a review origin, and the domain that is supposed to
// hold thirteen years of search equity is still configuration. Canonical,
// hreflang, og:url and the JSON-LD identifiers must nonetheless be absolute
// URLs -- Google drops relative hreflang, and the Open Graph spec cannot
// resolve a bare path -- so they all read the origin from here, the same place
// the sitemap and robots.txt read it, and the two channels can never disagree.
//
// This does not weaken the preview posture: *.workers.dev keeps serving
// `x-robots-tag: noindex` and `Disallow: /` from the worker, so pointing the
// head at the configured domain is what stops the preview from ever competing
// with it.
export const FALLBACK_PUBLIC_ORIGIN = "https://makler-realty.com";

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
