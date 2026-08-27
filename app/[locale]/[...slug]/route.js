import { isAppSearchPath, renderAppRouteResponse, renderAppSearchRouteResponse } from "../../_ms-realty/render.js";

export const revalidate = 300;

export async function GET(request) {
  const pathname = new URL(request.url).pathname;
  const input = {
    pathname,
    url: request.url,
    host: request.headers.get("x-forwarded-host") || request.headers.get("host"),
    accept: request.headers.get("accept"),
  };
  return isAppSearchPath(input) ? renderAppSearchRouteResponse(input) : renderAppRouteResponse(input);
}
