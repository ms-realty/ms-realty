import { renderRootRedirectResponse } from "./_ms-realty/render.js";

// The bare domain root is the highest-authority URL on both legacy sites and
// must never 404. Language negotiation is per-visitor, so this is a 307 rather
// than a cacheable permanent redirect.
export const dynamic = "force-dynamic";

export async function GET(request) {
  return renderRootRedirectResponse({
    host: request.headers.get("x-forwarded-host") || request.headers.get("host"),
    acceptLanguage: request.headers.get("accept-language"),
  });
}

export async function HEAD(request) {
  return GET(request);
}
