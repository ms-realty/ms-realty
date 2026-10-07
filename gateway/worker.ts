// Thin Cloudflare gateway: no catalogue, user identity, permissions or listing database.
// Deploy only with the exact reviewed route artifact bound to the release manifest.

import { type AccessEnv, accessAuthorized } from "./access";
import { type LegacyMediaEnv, legacyMedia } from "./legacy-media";
import { type MapAssetsEnv, mapAsset } from "./map-assets";
import { recoverNotFoundDocument } from "./not-found-document";

export interface LegacyRoute {
  host: string;
  path: string;
  query: string;
  status: 200 | 301 | 404 | 410;
  targetPath?: string;
  targetHost?: string;
}
export interface GatewayEnv extends MapAssetsEnv, AccessEnv, LegacyMediaEnv {
  STAGING: "true" | "false";
  ORIGIN_URL: string;
  ORIGIN_VERIFY_SECRET: string;
  PUBLIC_ORIGIN: string;
  CLIENT_ORIGIN: string;
  STAFF_ORIGIN: string;
  LEGACY_ROUTES_JSON: string;
  /** SHA-256 of the exact UTF-8 JSON route artifact, pinned by the release manifest. */
  LEGACY_ROUTES_SHA256: string;
  /** Logical artifact target remains identical when exercised on staging hosts. */
  LEGACY_TARGET_HOST?: string;
}

const denied = (status = 404) =>
  new Response(null, {
    status,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
const internal = (name: string) =>
  /^(x-msr-|x-app-|x-internal-|x-middleware-|x-nextjs-)/i.test(name) ||
  [
    "host",
    "x-forwarded-host",
    "x-forwarded-for",
    "x-forwarded-proto",
    "forwarded",
    "x-nonce",
    "content-security-policy",
  ].includes(name.toLowerCase());
const digest = async (value: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const bareHttps = (raw: string) => {
  const u = new URL(raw);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/"
  )
    throw new Error("Invalid gateway origin");
  return u;
};
const safePath = (path: unknown): path is string =>
  typeof path === "string" &&
  path.startsWith("/") &&
  !path.startsWith("//") &&
  !/[\\\r\n#]/.test(path);

async function forward(
  request: Request,
  env: GatewayEnv,
  upstream: typeof fetch = fetch,
): Promise<Response> {
  let origin: URL, publicOrigin: URL, origins: URL[], rules: LegacyRoute[];
  try {
    origin = bareHttps(env.ORIGIN_URL);
    publicOrigin = bareHttps(env.PUBLIC_ORIGIN);
    origins = [publicOrigin, bareHttps(env.CLIENT_ORIGIN), bareHttps(env.STAFF_ORIGIN)];
    if (
      env.ORIGIN_VERIFY_SECRET.length < 32 ||
      origins.some((u) => u.host === origin.host) ||
      new Set(origins.map((u) => u.host)).size !== 3
    )
      return denied(503);
    if (
      !/^[0-9a-f]{64}$/.test(env.LEGACY_ROUTES_SHA256) ||
      (await digest(env.LEGACY_ROUTES_JSON)) !== env.LEGACY_ROUTES_SHA256
    )
      return denied(503);
    rules = JSON.parse(env.LEGACY_ROUTES_JSON) as LegacyRoute[];
    if (!Array.isArray(rules) || rules.length > 20000) return denied(503);
    const keys = new Set<string>();
    for (const rule of rules) {
      const key = JSON.stringify([rule.host, rule.path, rule.query]);
      if (
        !rule ||
        ![200, 301].includes(rule.status) ||
        typeof rule.host !== "string" ||
        !/^makler-realty\.(com|ru)$/.test(rule.host) ||
        !safePath(rule.path) ||
        /[%?]/.test(rule.path) ||
        typeof rule.query !== "string" ||
        (rule.query !== "" && !rule.query.startsWith("?")) ||
        keys.has(key)
      )
        return denied(503);
      keys.add(key);
      if (
        (rule.status === 200 || rule.status === 301) &&
        (!safePath(rule.targetPath) ||
          rule.targetHost !== (env.LEGACY_TARGET_HOST ?? publicOrigin.host))
      )
        return denied(503);
    }
    for (const rule of rules) {
      if (rule.status !== 301) continue;
      const target = new URL(rule.targetPath as string, publicOrigin);
      if (
        rules.some(
          (next) =>
            next.host === (env.LEGACY_TARGET_HOST ?? publicOrigin.host) &&
            next.path === decodeURIComponent(target.pathname) &&
            next.query === target.search &&
            next.status === 301,
        )
      )
        return denied(503);
    }
  } catch {
    return denied(503);
  }
  const url = new URL(request.url),
    host = url.host.toLowerCase();
  const sourceHeader = request.headers.get("x-msr-legacy-host");
  if (
    sourceHeader &&
    (env.STAGING !== "true" ||
      host !== publicOrigin.host ||
      !/^(?:www\.)?makler-realty\.(?:com|ru)$/.test(sourceHeader))
  )
    return denied(400);
  const sourceHost = (sourceHeader ?? host).replace(/^www\./, "");
  let sourcePath: string | null = null;
  try {
    if (!/%(?:2f|5c)/i.test(url.pathname)) sourcePath = decodeURIComponent(url.pathname);
  } catch {
    /* An invalid source spelling cannot match a reviewed identity. */
  }
  const legacyPhoto =
    url.pathname.startsWith("/wp-content/uploads/") && /^makler-realty\.(com|ru)$/.test(sourceHost);
  const rule = rules.find(
    (entry) => entry.host === sourceHost && entry.path === sourcePath && entry.query === url.search,
  );
  const current = origins.some((u) => u.host === host) || host === `www.${publicOrigin.host}`;
  if (!rule && (!current || sourceHeader) && !legacyPhoto) return denied();
  // Compute the final equivalent page before canonicalising host/protocol. This avoids
  // http → https → www/apex → legacy mapping chains. Only safe read requests canonicalise.
  const destination = new URL(publicOrigin);
  if (rule?.status === 301) {
    const target = new URL(rule.targetPath as string, publicOrigin);
    destination.pathname = target.pathname;
    destination.search = target.search;
  } else {
    destination.pathname = url.pathname;
    destination.search = url.search;
    if (rule?.status === 200 || legacyPhoto)
      destination.host = env.STAGING === "true" ? publicOrigin.host : sourceHost;
    else if (host !== `www.${publicOrigin.host}`) destination.host = host;
  }
  if (rule && !["GET", "HEAD"].includes(request.method)) return denied(405);
  if (
    rule?.status === 301 ||
    url.protocol !== "https:" ||
    (sourceHeader ?? host).startsWith("www.")
  ) {
    if (!["GET", "HEAD"].includes(request.method)) return denied(405);
    return Response.redirect(destination.toString(), 301);
  }
  if (legacyPhoto) return legacyMedia(request, env, sourceHost);
  if (url.pathname.startsWith("/legacy-media/"))
    return host === publicOrigin.host ? legacyMedia(request, env) : denied();
  if (url.pathname.startsWith("/maps/")) {
    if (host !== publicOrigin.host) return denied();
    return mapAsset(request, env);
  }
  // Historical route dispositions are read semantics; a POST must not become a GET redirect
  // or be submitted to a retained page which never accepted that operation.
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (internal(name)) headers.delete(name);
  const cfIp = request.headers.get("cf-connecting-ip");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-access-jwt-assertion");
  headers.delete("cf-access-client-id");
  headers.delete("cf-access-client-secret");
  if (cfIp) headers.set("x-msr-client-ip", cfIp);
  headers.set("x-msr-origin-token", env.ORIGIN_VERIFY_SECRET);
  headers.set("x-msr-public-host", rule?.status === 200 ? publicOrigin.host : host);
  headers.set("x-msr-rendered-path", `${url.pathname}${url.search}`);
  headers.set("x-forwarded-proto", "https");
  const target = new URL(origin);
  if (rule?.status === 200) {
    const reviewedTarget = new URL(rule.targetPath as string, origin);
    target.pathname = reviewedTarget.pathname;
    target.search = reviewedTarget.search;
  } else {
    // Assign untrusted paths as paths. Resolving a //path as a URL reference would
    // replace the fixed host and disclose gateway credentials to another origin.
    target.pathname = url.pathname;
    target.search = url.search;
  }
  if (target.origin !== origin.origin) return denied(503);
  // No cache API and no provider redirects followed: current publication truth and private
  // sessions must reach the origin. Response bodies stream; uploads keep their method/body.
  const outbound = new Request(target, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? null : request.body,
    redirect: "manual",
    ...(request.body ? { duplex: "half" } : {}),
  } as RequestInit);
  let response: Response;
  try {
    response = await upstream(outbound);
  } catch {
    return denied(503);
  }
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("x-msr-origin-token");
  const location = responseHeaders.get("location");
  if (location) {
    const destination = new URL(location, target);
    // Never expose a provider origin in a user-facing redirect.
    if (destination.host === origin.host) {
      destination.host = host;
      responseHeaders.set("location", destination.toString());
    }
  }
  responseHeaders.set("Cache-Control", "private, no-store");
  const surface =
    host === new URL(env.STAFF_ORIGIN).host
      ? "staff"
      : host === new URL(env.CLIENT_ORIGIN).host
        ? "client"
        : "public";
  return recoverNotFoundDocument(
    request,
    new Response(response.body, { status: response.status, headers: responseHeaders }),
    target.pathname,
    surface,
  );
}

export async function gateway(
  request: Request,
  env: GatewayEnv,
  upstream: typeof fetch = fetch,
  authorize: typeof accessAuthorized = accessAuthorized,
): Promise<Response> {
  let response: Response;
  if (!["true", "false"].includes(env.STAGING)) response = denied(503);
  else if (env.STAGING === "true" && !(await authorize(request, env))) response = denied(403);
  else response = await forward(request, env, upstream);
  // Includes assets, robots, redirects, errors, API replies and upstream responses.
  if (env.STAGING !== "false") {
    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("Cache-Control", "private, no-store");
    return new Response(response.body, { status: response.status, headers });
  }
  return response;
}

export default { fetch: (request: Request, env: GatewayEnv) => gateway(request, env) };
