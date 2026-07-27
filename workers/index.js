import { Container, getContainer } from "@cloudflare/containers";

// The MS Realty runtime runs inside a container because the app is a real Node
// process that reads the filesystem — the CMS seed, the mirrored legacy media,
// and (for now) the JSONL ledgers. A plain Worker isolate has no filesystem, so
// the container is what makes the app deployable unchanged.
//
// Container disk is ephemeral: on every wake it resets to the image. Read-only
// data (seed, media) is baked in and therefore safe. Mutable state must not
// live here — that migration to Durable Object SQLite is tracked separately.
export class MsRealtyContainer extends Container {
  defaultPort = 8080;

  // Long enough that a visitor after a quiet spell usually hits a warm
  // instance; short enough that an idle night is not billed. Cloudflare bills
  // memory only while awake.
  sleepAfter = "20m";

  // Secrets reach the container through the Worker's env, never the image.
  envVars = {
    NODE_ENV: "production",
    MS_REALTY_TRUST_PROXY: "1",
    MS_REALTY_SESSION_SECRET: this.env.MS_REALTY_SESSION_SECRET ?? "",
    MS_REALTY_ADMIN_OPERATORS_JSON: this.env.MS_REALTY_ADMIN_OPERATORS_JSON ?? "",
    MS_REALTY_LEAD_CONTACT_KEY: this.env.MS_REALTY_LEAD_CONTACT_KEY ?? "",
    PAYLOAD_SECRET: this.env.PAYLOAD_SECRET ?? "",
    DATABASE_URL: this.env.DATABASE_URL ?? "",
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
    const object = await env.MEDIA.get(decodeURIComponent(key));
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
// R2 keys are arbitrary UTF-8, and 13 years of WordPress uploads include
// Cyrillic filenames ("схема.jpg") that carry their own search equity. An
// ASCII allowlist silently dropped them, so the guard now rejects only what is
// genuinely dangerous: control characters and the parent-directory token.
// eslint-disable-next-line no-control-regex -- matching control characters is the whole point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const isSafeKey = (key) => key.length > 0 && key.length <= 1024 && !CONTROL_CHARS.test(key) && !key.includes("..");

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

// Comparing digests rather than the raw strings keeps the comparison
// constant-time and stops the length of the secret from leaking.
async function secretMatches(presented, expected) {
  const [a, b] = await Promise.all([sha256(presented), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function ingestMedia(request, env, url) {
  const expected = env.MEDIA_INGEST_SECRET;
  if (!expected) return new Response("Not found", { status: 404 });
  if (request.method !== "PUT") return new Response("Method not allowed", { status: 405 });

  const presented = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!presented || !(await secretMatches(presented, expected))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const key = decodeURIComponent(url.pathname.slice(INGEST_PREFIX.length));
  if (!isSafeKey(key)) return new Response("Bad key", { status: 400 });

  const body = await request.arrayBuffer();
  if (!body.byteLength) return new Response("Empty body", { status: 400 });
  await env.MEDIA.put(key, body, {
    httpMetadata: { contentType: request.headers.get("content-type") ?? "application/octet-stream" },
  });
  // Echo the stored length so the uploader can verify rather than trust.
  return new Response(JSON.stringify({ key, size: body.byteLength }), {
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith(INGEST_PREFIX)) return ingestMedia(request, env, url);
    if (url.pathname.startsWith(MEDIA_PREFIX)) {
      const media = await serveMedia(request, env, url);
      if (media) return media;
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    }

    // One shared instance: the app keeps in-process state (rate-limit buckets,
    // the stat-validated file cache) that must not be split across instances.
    // Fanning out would silently multiply rate limits and desync the caches.
    return getContainer(env.MS_REALTY, "ms-realty-singleton").fetch(request);
  },
};
