import { renderAppSearchRouteResponse } from "../../_ms-realty/render.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  return renderAppSearchRouteResponse({ pathname: new URL(request.url).pathname, url: request.url });
}
