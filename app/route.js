import { renderAppSiteRootResponse } from "./_ms-realty/render.js";

export const revalidate = 300;

export async function GET(request) {
  return renderAppSiteRootResponse({
    url: request.url,
    host: request.headers.get("x-forwarded-host") || request.headers.get("host"),
    accept: request.headers.get("accept"),
  });
}
