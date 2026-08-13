import { Container, getContainer } from "@cloudflare/containers";
import {
  LEAD_PROBE_HEADER,
  allowsAdminSessionMutation,
  allowsDurableCaseAuthorityMutation,
  allowsDurableListingAuthorityMutation,
  allowsLeadProbeMutation,
  allowsMcpRequest,
  allowsProviderWebhookMutation,
  allowsPublicEventMutation,
  allowsPublicLeadMutation,
  isPayloadPrivatePath,
  secretMatches,
} from "./durable-case-authority.mjs";
import { PREVIEW_NOINDEX, isPreviewHost } from "./preview-host.mjs";
import {
  OriginProxyError,
  requestForOrigin,
  responseForPublicOrigin,
  responseWithEdgeBuildMarker,
} from "./origin-proxy.mjs";

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
    MS_REALTY_TRUST_PROXY: "1",
    // This runtime's disk is ephemeral; MCP ledger-writing tools must not
    // register here or drafts would vanish on container sleep.
    MS_REALTY_MCP_WRITES_DISABLED: "1",
    MS_REALTY_ADMIN_CREDENTIALS_JSON: this.env.MS_REALTY_ADMIN_CREDENTIALS_JSON ?? "",
    MS_REALTY_ADMIN_TOKEN: this.env.MS_REALTY_ADMIN_TOKEN ?? "",
    MS_REALTY_LEAD_CONTACT_KEY: this.env.MS_REALTY_LEAD_CONTACT_KEY ?? "",
    MS_REALTY_LEAD_DURABLE_STORE_ENABLED: this.env.MS_REALTY_LEAD_DURABLE_STORE_ENABLED ?? "",
    MS_REALTY_EVENT_DURABLE_STORE_ENABLED: this.env.MS_REALTY_EVENT_DURABLE_STORE_ENABLED ?? "",
    MS_REALTY_PUBLIC_CONTACT_KEY: this.env.MS_REALTY_PUBLIC_CONTACT_KEY ?? "",
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
    MS_REALTY_PUBLIC_ORIGIN: this.env.MS_REALTY_PUBLIC_ORIGIN ?? "",
    MS_REALTY_MAX_BODY_BYTES: this.env.MS_REALTY_MAX_BODY_BYTES ?? "",
    MS_REALTY_PROVIDER_TOKEN_KEY: this.env.MS_REALTY_PROVIDER_TOKEN_KEY ?? "",
    MS_REALTY_PROVIDER_OAUTH_STATE_SECRET: this.env.MS_REALTY_PROVIDER_OAUTH_STATE_SECRET ?? "",
    MS_REALTY_GOOGLE_OAUTH_CLIENT_ID: this.env.MS_REALTY_GOOGLE_OAUTH_CLIENT_ID ?? "",
    MS_REALTY_GOOGLE_OAUTH_CLIENT_SECRET: this.env.MS_REALTY_GOOGLE_OAUTH_CLIENT_SECRET ?? "",
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
const MEDIA_TYPES = {
  avif: "image/avif", gif: "image/gif", jpeg: "image/jpeg", jpg: "image/jpeg",
  mp4: "video/mp4", pdf: "application/pdf", png: "image/png",
  svg: "image/svg+xml", webm: "video/webm", webp: "image/webp",
};

async function serveMedia(request, env, url) {
  // Mirror keys are host-prefixed so the two legacy domains cannot collide on a
  // shared upload path. Until the real domains are attached everything arrives
  // on workers.dev, so .com is the default and .ru is tried as a fallback.
  const host = url.hostname.replace(/^www\./, "");
  const candidates = host.endsWith("makler-realty.ru")
    ? [`makler-realty.ru${url.pathname}`]
    : host.endsWith("makler-realty.com")
      ? [`makler-realty.com${url.pathname}`]
      : [`makler-realty.com${url.pathname}`, `makler-realty.ru${url.pathname}`];

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

// Bulk media ingest. The obvious route — `wrangler r2 object put` — goes
// through Cloudflare's management API, which is rate limited per account and
// reports "Upload complete" on a throttled write; pushing 1714 objects that
// way silently dropped most of them. Writing through this binding is the same
// code path the site reads from, so a 200 here means the object is really
// there. The endpoint does not exist unless MEDIA_INGEST_SECRET is set.
const INGEST_PREFIX = "/__media/";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// R2 keys are arbitrary UTF-8, and 13 years of WordPress uploads include
// Cyrillic filenames ("схема.jpg") that carry their own search equity. An
// ASCII allowlist silently dropped them, so the guard now rejects only what is
// genuinely dangerous: control characters and the parent-directory token.
// eslint-disable-next-line no-control-regex -- matching control characters is the whole point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const isSafeKey = (key) => key.length > 0 && key.length <= 1024 && !CONTROL_CHARS.test(key) && !key.includes("..");

// Uploads may only land under the two legacy-host media trees. Even with the
// secret, the endpoint cannot plant objects at arbitrary keys — a leaked
// credential defaces images, it does not gain a free file host.
const INGEST_KEY_PREFIXES = ["makler-realty.com/wp-content/", "makler-realty.ru/wp-content/"];
// Largest mirrored file is 9.8MB; the cap bounds Worker memory, not R2.
const MAX_INGEST_BYTES = 32 * 1024 * 1024;

async function ingestMedia(request, env, url) {
  const expected = env.MEDIA_INGEST_SECRET;
  if (!expected) return new Response("Not found", { status: 404 });
  if (request.method !== "PUT") return new Response("Method not allowed", { status: 405 });

  const presented = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!presented || !(await secretMatches(presented, expected))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_INGEST_BYTES) return new Response("Too large", { status: 413 });

  let key;
  try {
    key = decodeURIComponent(url.pathname.slice(INGEST_PREFIX.length));
  } catch {
    return new Response("Bad key", { status: 400 });
  }
  if (!isSafeKey(key) || !INGEST_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return new Response("Bad key", { status: 400 });
  }

  const body = await request.arrayBuffer();
  if (!body.byteLength) return new Response("Empty body", { status: 400 });
  if (body.byteLength > MAX_INGEST_BYTES) return new Response("Too large", { status: 413 });
  await env.MEDIA.put(key, body, {
    httpMetadata: { contentType: request.headers.get("content-type") ?? "application/octet-stream" },
  });
  // Echo the stored length so the uploader can verify rather than trust.
  return new Response(JSON.stringify({ key, size: body.byteLength }), {
    headers: { "content-type": "application/json" },
  });
}

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
    const upstreamRequest = requestForOrigin(request, env.MS_REALTY_ORIGIN_URL);
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
    return preview ? withPreviewNoindex(versionedResponse) : versionedResponse;
  } catch (error) {
    const status = error instanceof OriginProxyError ? error.status : 502;
    return new Response(JSON.stringify({ kind: status === 403 ? "cross_origin_write_blocked" : "origin_unavailable" }), {
      status,
      headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (isPayloadPrivatePath(url.pathname)) return payloadPrivateResponse();
    if (url.pathname.startsWith(INGEST_PREFIX)) return ingestMedia(request, env, url);
    const preview = isPreviewHost(url.hostname);
    if (preview && url.pathname === "/robots.txt") return previewRobotsResponse();
    if (url.pathname.startsWith(MEDIA_PREFIX)) {
      // Media paths are static bytes: only GET/HEAD mean anything here, and a
      // DELETE must not wake the container or pretend to have deleted a file.
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", {
          status: 405,
          headers: { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" },
        });
      }
      const media = await serveMedia(request, env, url);
      if (media) return media;
      if (env.MS_REALTY_ORIGIN_URL) return proxyDurableOrigin(request, env, url, preview);
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    }

    // The durable handoff runtime lives on the agency's fixed origin. Keeping
    // this switch optional preserves the Container as a fail-closed fallback
    // for accounts that have not provisioned that origin.
    if (env.MS_REALTY_ORIGIN_URL) return proxyDurableOrigin(request, env, url, preview);

    // Container disk resets on sleep, so only the existing Payload/Postgres
    // authority routes can write. Every other mutation remains read-only.
    // MCP is admitted as well: the app authenticates it and the Worker strips
    // its ledger-writing tools (MS_REALTY_MCP_WRITES_DISABLED below).
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
    return preview ? withPreviewNoindex(response) : response;
  },
};
