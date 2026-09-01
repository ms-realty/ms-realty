import { Container, getContainer } from "@cloudflare/containers";
import {
  LEAD_PROBE_HEADER,
  allowsAdminSessionMutation,
  allowsDurableCaseAuthorityMutation,
  allowsDurableLeadAuthorityMutation,
  allowsDurableListingAuthorityMutation,
  allowsLeadProbeMutation,
  allowsMcpRequest,
  allowsProviderWebhookMutation,
  allowsPublicEventMutation,
  allowsPublicLeadMutation,
  isPublicAdminPath,
  isPayloadPrivatePath,
} from "./durable-case-authority.mjs";
import { PREVIEW_NOINDEX, PRODUCTION_PUBLIC_HOST, canonicalLegacyHost, isPreviewHost, mediaCandidateKeys } from "./preview-host.mjs";
import {
  OriginProxyError,
  requestForOrigin,
  responseForCanonicalPublicIndex,
  responseForPublicOrigin,
  responseWithEdgeBuildMarker,
} from "./origin-proxy.mjs";
import { edgeCacheHit, edgeCacheKey, requestMayUseEdgeCache, storeInEdgeCache } from "./edge-cache.mjs";
import { INGEST_PREFIX, ingestMedia } from "./media-ingest-boundary.mjs";

// The MS Realty runtime runs inside a container because the app is a real Node
// process that reads the filesystem — the CMS seed and (for now) the JSONL
// ledgers. A plain Worker isolate has no filesystem, so
// the container is what makes the app deployable unchanged.
//
// Container disk is ephemeral: on every wake it resets to the image. Read-only
// app data (including the seed) is baked in and therefore safe. Legacy media
// lives in R2 and is served at the edge below. Mutable state must not live here
// — public deployment requires a deliberately wired durable store.
export class MsRealtyContainer extends Container {
  defaultPort = 8080;
  pingEndpoint = "localhost/api/health";

  // Long enough that a visitor after a quiet spell usually hits a warm
  // instance; short enough that an idle night is not billed. Cloudflare bills
  // memory only while awake.
  sleepAfter = "20m";

  // Secrets reach the container through the Worker's env, never the image.
  envVars = {
    NODE_ENV: "production",
    MS_REALTY_RUNTIME_DATA_AUTHORITY: "payload",
    MS_REALTY_TRUST_PROXY: "1",
    // This runtime's disk is ephemeral; MCP ledger-writing tools must not
    // register here or drafts would vanish on container sleep.
    MS_REALTY_MCP_WRITES_DISABLED: "1",
    MS_REALTY_MCP_DURABLE_LISTING_WRITES: this.env.MS_REALTY_MCP_DURABLE_LISTING_WRITES ?? "",
    MS_REALTY_ADMIN_CREDENTIALS_JSON: this.env.MS_REALTY_ADMIN_CREDENTIALS_JSON ?? "",
    MS_REALTY_ADMIN_TOKEN: this.env.MS_REALTY_ADMIN_TOKEN ?? "",
    MS_REALTY_LEAD_CONTACT_KEY: this.env.MS_REALTY_LEAD_CONTACT_KEY ?? "",
    MS_REALTY_LEAD_DURABLE_STORE_ENABLED: this.env.MS_REALTY_LEAD_DURABLE_STORE_ENABLED ?? "",
    MS_REALTY_LEAD_OPS_DURABLE_STORE_ENABLED: this.env.MS_REALTY_LEAD_OPS_DURABLE_STORE_ENABLED ?? "",
    MS_REALTY_EVENT_DURABLE_STORE_ENABLED: this.env.MS_REALTY_EVENT_DURABLE_STORE_ENABLED ?? "",
    MS_REALTY_PUBLIC_CONTACT_KEY: this.env.MS_REALTY_PUBLIC_CONTACT_KEY ?? "",
    MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY: this.env.MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY ?? "",
    MS_REALTY_ALLOW_PRIVATE_DATABASE_HOST: this.env.MS_REALTY_ALLOW_PRIVATE_DATABASE_HOST ?? "",
    MS_REALTY_CASE_PAYLOAD_AUTHORITY_ENABLED: this.env.MS_REALTY_CASE_PAYLOAD_AUTHORITY_ENABLED ?? "",
    MS_REALTY_CASE_REQUEST_PROJECTION_ENABLED: this.env.MS_REALTY_CASE_REQUEST_PROJECTION_ENABLED ?? "",
    MS_REALTY_WORKSPACE_ID: this.env.MS_REALTY_WORKSPACE_ID ?? "",
    PAYLOAD_SECRET: this.env.PAYLOAD_SECRET ?? "",
    DATABASE_URL: this.env.DATABASE_URL ?? "",
    MS_REALTY_SEARCH_ENGINE: "postgres",
    HERMES_CHAT_COMPLETIONS_URL: this.env.HERMES_CHAT_COMPLETIONS_URL ?? "",
    HERMES_API_KEY: this.env.HERMES_API_KEY ?? "",
    HERMES_MODEL: this.env.HERMES_MODEL ?? "",
    HERMES_PROVIDER_MODE: this.env.HERMES_PROVIDER_MODE ?? "",
    MS_REALTY_RATE_LIMIT_WINDOW_MS: this.env.MS_REALTY_RATE_LIMIT_WINDOW_MS ?? "",
    MS_REALTY_RATE_LIMIT_MAX: this.env.MS_REALTY_RATE_LIMIT_MAX ?? "",
    MS_REALTY_RATE_LIMIT_DISABLED: this.env.MS_REALTY_RATE_LIMIT_DISABLED ?? "",
    MS_REALTY_TRUSTED_WRITE_ORIGINS: this.env.MS_REALTY_TRUSTED_WRITE_ORIGINS ?? "",
    MS_REALTY_MCP_ALLOWED_ORIGINS: this.env.MS_REALTY_MCP_ALLOWED_ORIGINS ?? "",
    MS_REALTY_PUBLIC_ORIGIN: this.env.MS_REALTY_WORKER_PUBLIC_ORIGIN ?? "",
    MS_REALTY_MAX_BODY_BYTES: this.env.MS_REALTY_MAX_BODY_BYTES ?? "",
    MS_REALTY_PROVIDER_TOKEN_KEY: this.env.MS_REALTY_PROVIDER_TOKEN_KEY ?? "",
    MS_REALTY_PROVIDER_OAUTH_STATE_SECRET: this.env.MS_REALTY_PROVIDER_OAUTH_STATE_SECRET ?? "",
    MS_REALTY_GOOGLE_OAUTH_CLIENT_ID: this.env.MS_REALTY_GOOGLE_OAUTH_CLIENT_ID ?? "",
    MS_REALTY_GOOGLE_OAUTH_CLIENT_SECRET: this.env.MS_REALTY_GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    MS_REALTY_GITHUB_OAUTH_CLIENT_ID: this.env.MS_REALTY_GITHUB_OAUTH_CLIENT_ID ?? "",
    MS_REALTY_GITHUB_OAUTH_CLIENT_SECRET: this.env.MS_REALTY_GITHUB_OAUTH_CLIENT_SECRET ?? "",
    MS_REALTY_META_APP_ID: this.env.MS_REALTY_META_APP_ID ?? "",
    MS_REALTY_META_APP_SECRET: this.env.MS_REALTY_META_APP_SECRET ?? "",
    MS_REALTY_META_EMBEDDED_SIGNUP_CONFIG_ID: this.env.MS_REALTY_META_EMBEDDED_SIGNUP_CONFIG_ID ?? "",
    MS_REALTY_META_GRAPH_VERSION: this.env.MS_REALTY_META_GRAPH_VERSION ?? "",
    MS_REALTY_META_WEBHOOK_VERIFY_TOKEN: this.env.MS_REALTY_META_WEBHOOK_VERIFY_TOKEN ?? "",
    MS_REALTY_VIBER_COMMERCIAL_READY: this.env.MS_REALTY_VIBER_COMMERCIAL_READY ?? "",
    MS_REALTY_PROVIDER_WEBHOOK_MAX_BYTES: this.env.MS_REALTY_PROVIDER_WEBHOOK_MAX_BYTES ?? "",
    MS_REALTY_VIEWING_DURABLE_STORE_ENABLED: this.env.MS_REALTY_VIEWING_DURABLE_STORE_ENABLED ?? "",
  };

  onStart() {
    console.log(JSON.stringify({ kind: "container_started", port: this.defaultPort }));
  }

  onError(error) {
    console.error(JSON.stringify({ kind: "container_error", message: String(error) }));
    throw error;
  }
}

// Legacy image URLs carry 13 years of image-search equity, so they must keep
// resolving at their original paths. Serving them from R2 at the edge also
// avoids waking the container for what is just a byte range.
const MEDIA_PREFIX = "/wp-content/uploads/";
const OWNED_MEDIA_PREFIX = "/media/";
const MEDIA_TYPES = {
  avif: "image/avif", gif: "image/gif", jpeg: "image/jpeg", jpg: "image/jpeg",
  mp4: "video/mp4", pdf: "application/pdf", png: "image/png",
  svg: "image/svg+xml", webm: "video/webm", webp: "image/webp",
};

async function serveMedia(request, env, url, candidates = mediaCandidateKeys(url.hostname, url.pathname)) {
  // Mirror keys are host-prefixed so the two legacy domains cannot collide on a
  // shared upload path. The public workers.dev origin is a read-through for
  // both historical host namespaces; direct legacy hosts retain their own key.
  for (const key of candidates) {
    // The runtime rejects malformed percent-encoding before we run, but a
    // decode failure here must degrade to "not found", never to a 500.
    let decoded;
    try {
      decoded = decodeURIComponent(key);
    } catch {
      continue;
    }
    const object = await env.MEDIA.get(decoded);
    if (!object) continue;
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    // Filenames encode the upload, so the bytes never change under a given URL.
    headers.set("cache-control", "public, max-age=31536000, immutable");
    headers.set("x-content-type-options", "nosniff");
    if (!headers.get("content-type")) {
      const ext = key.split(".").pop()?.toLowerCase() ?? "";
      headers.set("content-type", MEDIA_TYPES[ext] ?? "application/octet-stream");
    }
    return new Response(object.body, { headers });
  }
  return null;
}

function ownedMediaKey(pathname) {
  const relative = pathname.slice(OWNED_MEDIA_PREFIX.length);
  const slash = relative.indexOf("/");
  const host = relative.slice(0, slash);
  const mediaPath = relative.slice(slash);
  if (slash < 1 || !["makler-realty.com", "makler-realty.ru"].includes(host) || !mediaPath.startsWith(MEDIA_PREFIX)) return "";
  return `${host}${mediaPath}`;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function previewRobotsResponse() {
  return new Response("User-agent: *\nDisallow: /\n", {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": PREVIEW_NOINDEX },
  });
}

function withPreviewNoindex(response) {
  // Response headers from the container are immutable, so clone to add ours.
  const headers = new Headers(response.headers);
  headers.set("x-robots-tag", PREVIEW_NOINDEX);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function ephemeralRuntimeDataResponse() {
  return new Response(JSON.stringify({ kind: "runtime_data_unavailable", message: "Writes are disabled until durable runtime data is configured" }), {
    status: 503,
    headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
  });
}


function payloadPrivateResponse() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

async function proxyDurableOrigin(request, env, url, preview) {
  try {
    const upstreamRequest = requestForOrigin(request, env.MS_REALTY_ORIGIN_URL, env.MS_REALTY_ORIGIN_TOKEN);
    const upstreamResponse = await fetch(upstreamRequest);
    const publicResponse = responseForPublicOrigin(upstreamResponse, {
      originValue: env.MS_REALTY_ORIGIN_URL,
      publicUrl: url,
    });
    const versionedResponse = await responseWithEdgeBuildMarker(
      publicResponse,
      env.MS_REALTY_EDGE_BUILD_MARKER,
      url.pathname,
    );
    return preview
      ? withPreviewNoindex(versionedResponse)
      : responseForCanonicalPublicIndex(versionedResponse, { hostname: url.hostname, pathname: url.pathname });
  } catch (error) {
    const status = error instanceof OriginProxyError ? error.status : 502;
    return new Response(JSON.stringify({ kind: status === 403 ? "cross_origin_write_blocked" : "origin_unavailable" }), {
      status,
      headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
    });
  }
}

// Container disk resets on sleep, so only the existing Payload/Postgres
// authority routes can write. Every other mutation remains read-only. MCP is
// admitted as well: the app authenticates it and the Worker strips its
// ledger-writing tools (MS_REALTY_MCP_WRITES_DISABLED on the container).
async function serveFromContainer(request, env, url, preview) {
  const mutating = MUTATING_METHODS.has(request.method);
  const leadProbe = mutating && (await allowsLeadProbeMutation({ request, pathname: url.pathname, env }));
  const publicLead = mutating && allowsPublicLeadMutation({ method: request.method, pathname: url.pathname, env });
  const publicEvent = mutating && allowsPublicEventMutation({ method: request.method, pathname: url.pathname, env });
  const providerWebhook = mutating && allowsProviderWebhookMutation({ method: request.method, pathname: url.pathname, env });
  if (
    mutating &&
    !allowsAdminSessionMutation({ request, method: request.method, pathname: url.pathname }) &&
    !leadProbe &&
    !publicLead &&
    !publicEvent &&
    !providerWebhook &&
    !allowsMcpRequest({ method: request.method, pathname: url.pathname, env }) &&
    !allowsDurableLeadAuthorityMutation({ method: request.method, pathname: url.pathname, env }) &&
    !allowsDurableListingAuthorityMutation({ method: request.method, pathname: url.pathname, env }) &&
    !allowsDurableCaseAuthorityMutation({ method: request.method, pathname: url.pathname, env })
  ) {
    return ephemeralRuntimeDataResponse();
  }

  // One shared instance: the app keeps in-process state (rate-limit buckets,
  // the stat-validated file cache) that must not be split across instances.
  // Fanning out would silently multiply rate limits and desync the caches.
  let forwardedRequest = request;
  if (leadProbe) {
    const headers = new Headers(request.headers);
    headers.delete(LEAD_PROBE_HEADER);
    forwardedRequest = new Request(request, { headers });
  }
  const response = await getContainer(env.MS_REALTY, "ms-realty-singleton").fetch(forwardedRequest);
  return preview
    ? withPreviewNoindex(response)
    : responseForCanonicalPublicIndex(response, { hostname: url.hostname, pathname: url.pathname });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const canonicalHost = canonicalLegacyHost(url.hostname);
    if (canonicalHost) {
      url.hostname = canonicalHost;
      return Response.redirect(url, 301);
    }
    const preview = isPreviewHost(url.hostname);
    if (preview && isPublicAdminPath(url.pathname)) return payloadPrivateResponse();
    if (isPayloadPrivatePath(url.pathname)) return payloadPrivateResponse();
    if (url.pathname.startsWith(INGEST_PREFIX)) return ingestMedia(request, env, url);
    if (preview && url.pathname === "/robots.txt") return previewRobotsResponse();
    if (url.pathname.startsWith(MEDIA_PREFIX) || url.pathname.startsWith(OWNED_MEDIA_PREFIX)) {
      // Media paths are static bytes: only GET/HEAD mean anything here, and a
      // DELETE must not wake the container or pretend to have deleted a file.
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", {
          status: 405,
          headers: { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" },
        });
      }
      const ownedKey = url.pathname.startsWith(OWNED_MEDIA_PREFIX) ? ownedMediaKey(url.pathname) : "";
      if (url.pathname.startsWith(OWNED_MEDIA_PREFIX) && !ownedKey) {
        return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
      const media = await serveMedia(request, env, url, ownedKey ? [ownedKey] : undefined);
      if (media) return media;
      if (ownedKey) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
      if (env.MS_REALTY_ORIGIN_URL) return proxyDurableOrigin(request, env, url, preview);
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    }

    // Cloudflare stores nothing for an HTML document on its own, so the
    // `s-maxage` the runtime prints is inert until we act on it here. Only an
    // anonymous plain navigation consults the shared cache, and only a response
    // the runtime itself marked `public` with an `s-maxage` is ever stored.
    const cache = globalThis.caches?.default ?? null;
    const cacheKey = cache && requestMayUseEdgeCache(request)
      ? edgeCacheKey(request, env.MS_REALTY_EDGE_BUILD_MARKER)
      : null;
    if (cacheKey) {
      const cached = await cache.match(cacheKey);
      if (cached) return edgeCacheHit(cached);
    }

    // The durable handoff runtime lives on the agency's fixed origin. Keeping
    // this switch optional preserves the Container as a fail-closed fallback
    // for accounts that have not provisioned that origin.
    const response = env.MS_REALTY_ORIGIN_URL
      ? await proxyDurableOrigin(request, env, url, preview)
      : await serveFromContainer(request, env, url, preview);

    return storeInEdgeCache(response, cacheKey, ctx, cache);
  },
};
