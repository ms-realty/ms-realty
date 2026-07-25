import { renderAppSitemapResponse } from "../_ms-realty/render.js";

// Each domain publishes its own sitemap; the route cache does not key on Host.
export const dynamic = "force-dynamic";

export async function GET(request) {
  return renderAppSitemapResponse({
    host: request.headers.get("x-forwarded-host") || request.headers.get("host"),
  });
}
