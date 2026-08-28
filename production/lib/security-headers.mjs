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
  "font-src 'self' https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net",
  "connect-src 'self' https://graph.facebook.com",
  "frame-src 'self' https://www.facebook.com https://web.facebook.com",
  "media-src 'self' https:",
].join("; ");

export const CSP_HEADER = { "content-security-policy": CONTENT_SECURITY_POLICY };
