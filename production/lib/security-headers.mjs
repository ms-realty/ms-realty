// Content-Security-Policy for HTML pages (public site + admin).
//
// Notes on the pragmatic allowances:
// - script-src keeps 'unsafe-inline' because pages embed JSON-LD blocks and
//   the string-render pipeline has no nonce plumbing; external scripts still
//   restricted to 'self'. Tighten to hashes when the renderer supports it.
// - style-src keeps 'unsafe-inline' for the inline critical-CSS block.
// - img-src allows any https origin because legacy crawl media and Open
//   Graph images can live off-origin.

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: https:",
  // Fonts and their stylesheet are self-hosted (see build-self-hosted-fonts.mjs),
  // so no Google origin needs to be allowed.
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "media-src 'self' https:",
].join("; ");

export const CSP_HEADER = { "content-security-policy": CONTENT_SECURITY_POLICY };

// Shared transport/response hardening for every runtime. HSTS is only emitted
// under NODE_ENV=production: on plain-HTTP local previews it would pin the
// developer's browser to https://localhost.
export function securityHeaders(env = process.env) {
  const headers = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  };
  if (env.NODE_ENV === "production" && env.MS_REALTY_DISABLE_HSTS !== "1") {
    headers["strict-transport-security"] = "max-age=63072000; includeSubDomains; preload";
  }
  return headers;
}
