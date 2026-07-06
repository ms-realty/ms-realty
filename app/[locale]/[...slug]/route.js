import { renderAppRouteResponse } from "../../_ms-realty/render.js";

export const revalidate = 300;

export async function GET(request) {
  return renderAppRouteResponse({ pathname: new URL(request.url).pathname, url: request.url });
}
