import { renderAppRobotsResponse } from "../_ms-realty/render.js";

// robots.txt advertises the per-domain sitemap, so it varies by Host.
export const dynamic = "force-dynamic";

export async function GET(request) {
  return renderAppRobotsResponse({
    host: request.headers.get("x-forwarded-host") || request.headers.get("host"),
  });
}
