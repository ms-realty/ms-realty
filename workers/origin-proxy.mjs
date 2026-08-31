const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SAME_SITE_VALUES = new Set(["same-origin", "none"]);
export const ORIGIN_TOKEN_HEADER = "x-ms-realty-origin-token";

export class OriginProxyError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "OriginProxyError";
    this.status = status;
  }
}

function configuredOrigin(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new OriginProxyError("MS_REALTY_ORIGIN_URL must be an absolute HTTPS origin");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new OriginProxyError("MS_REALTY_ORIGIN_URL must be a credential-free HTTPS origin");
  }
  return url;
}

function configuredOriginToken(value) {
  const token = String(value || "").trim();
  if (token.length < 32) {
    throw new OriginProxyError("MS_REALTY_ORIGIN_TOKEN must be at least 32 characters");
  }
  return token;
}

function assertSameOriginBrowserWrite(request, publicUrl) {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const fetchSite = (request.headers.get("sec-fetch-site") || "").trim().toLowerCase();
  if (fetchSite && !SAME_SITE_VALUES.has(fetchSite)) {
    throw new OriginProxyError("Cross-site writes are not allowed", 403);
  }

  const presented = (request.headers.get("origin") || "").trim();
  if (!presented) return;
  let browserOrigin;
  try {
    browserOrigin = new URL(presented).origin;
  } catch {
    throw new OriginProxyError("Invalid browser origin", 403);
  }
  if (browserOrigin !== publicUrl.origin) {
    throw new OriginProxyError("Cross-origin writes are not allowed", 403);
  }
}

export function requestForOrigin(request, originValue, originTokenValue) {
  const origin = configuredOrigin(originValue);
  const originToken = configuredOriginToken(originTokenValue);
  const publicUrl = new URL(request.url);
  assertSameOriginBrowserWrite(request, publicUrl);

  const upstreamUrl = new URL(`${publicUrl.pathname}${publicUrl.search}`, origin);
  const headers = new Headers(request.headers);
  headers.delete("x-forwarded-for");
  headers.delete("x-forwarded-host");
  headers.delete("x-forwarded-proto");
  headers.delete(ORIGIN_TOKEN_HEADER);
  headers.set("x-forwarded-host", publicUrl.host);
  headers.set(ORIGIN_TOKEN_HEADER, originToken);
  if (headers.has("origin")) headers.set("origin", origin.origin);

  return new Request(new Request(upstreamUrl, request), { headers, redirect: "manual" });
}

export function responseForPublicOrigin(response, { originValue, publicUrl }) {
  const origin = configuredOrigin(originValue);
  const external = new URL(publicUrl);
  const headers = new Headers(response.headers);
  const location = headers.get("location");

  if (location) {
    const target = new URL(location, origin);
    if (target.origin === origin.origin) {
      target.protocol = external.protocol;
      target.host = external.host;
      headers.set("location", target.href);
    }
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function responseWithEdgeBuildMarker(response, marker, pathname) {
  if (pathname !== "/api/health" || !/^[0-9a-f]{40}$/i.test(String(marker || "")) || (![200, 503].includes(response.status))) return response;

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new OriginProxyError("Origin health response must be JSON");
  }
  if (payload?.service !== "ms-realty" || !["ok", "degraded"].includes(payload?.status)) {
    throw new OriginProxyError("Origin health response is invalid");
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("etag");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(
    JSON.stringify({
      ...payload,
      build_marker: marker,
      origin_build_marker: payload.build_marker,
      runtime: "cloudflare_origin_proxy",
    }),
    { status: response.status, headers },
  );
}
