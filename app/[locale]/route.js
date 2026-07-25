import { renderAppRouteResponse } from "../_ms-realty/render.js";

// Host-dependent output (canonical/hreflang/og:url differ per domain) cannot use
// the Next route cache, which does not key on Host — .ru would be served .com's
// canonical. Edge/CDN caching still applies via the cache-control header.
export const dynamic = "force-dynamic";

export async function GET(request) {
  return renderAppRouteResponse({
    pathname: new URL(request.url).pathname,
    url: request.url,
    host: request.headers.get("x-forwarded-host") || request.headers.get("host"),
  });
}
