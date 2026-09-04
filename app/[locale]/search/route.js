import { renderAppSearchRouteResponse } from "../../_ms-realty/render.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  // The forwarded host selects the canonical public origin. Without it every
  // page this route renders published the operational workers.dev origin as its
  // own canonical link and og:url — and because only the locales whose search
  // segment is literally "search" reach this file, that was en, ru and he while
  // bg, de, nl and el were correct.
  return renderAppSearchRouteResponse({
    pathname: new URL(request.url).pathname,
    url: request.url,
    host: request.headers.get("x-forwarded-host") || request.headers.get("host"),
    accept: request.headers.get("accept"),
  });
}
