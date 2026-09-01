import { renderAppRobotsResponse } from "../_ms-realty/render.js";

export const revalidate = 300;

export async function GET(request) {
  return renderAppRobotsResponse({ host: request.headers.get("x-forwarded-host") || request.headers.get("host") });
}
