import { renderAppSearchRouteResponse } from "../../_ms-realty/render.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  return renderAppSearchRouteResponse({
    pathname: new URL(request.url).pathname,
    url: request.url,
    // The sibling catch-all route already forwards both. Without them this
    // route cannot tell a browser from an API client, and it renders the
    // canonical origin from a default rather than the host that was asked for.
    host: request.headers.get("x-forwarded-host") || request.headers.get("host"),
    accept: request.headers.get("accept"),
  });
}
