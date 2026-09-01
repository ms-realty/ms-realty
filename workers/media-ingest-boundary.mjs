import { secretMatches } from "./durable-case-authority.mjs";
import { mediaIngestCredential } from "./media-ingest-auth.mjs";
import { PRODUCTION_PUBLIC_HOST } from "./preview-host.mjs";

// R2 media writes and private lifecycle reads/deletes all use the same
// credential-fenced boundary. The app never receives an R2 binding, and the
// public media routes below never expose the private listing prefix.
export const INGEST_PREFIX = "/__media/";
// R2 keys are arbitrary UTF-8, and 13 years of WordPress uploads include
// Cyrillic filenames ("схема.jpg") that carry their own search equity. An
// ASCII allowlist silently dropped them, so the guard now rejects only what is
// genuinely dangerous: control characters and the parent-directory token.
// eslint-disable-next-line no-control-regex -- matching control characters is the whole point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const isSafeKey = (key) => key.length > 0 && key.length <= 1024 && !CONTROL_CHARS.test(key) && !key.includes("..");

// Uploads may only land under the production or legacy-host media trees. Even with the
// secret, the endpoint cannot plant objects at arbitrary keys — a leaked
// credential defaces images, it does not gain a free file host.
const INGEST_KEY_PREFIXES = [
  `${PRODUCTION_PUBLIC_HOST}/wp-content/`,
  "makler-realty.com/wp-content/",
  "makler-realty.ru/wp-content/",
];
const LIFECYCLE_KEY = /\/wp-content\/(?:private\/listings\/[^/]+\/[^/]+|uploads\/\d{4}\/\d{2}\/listings\/[^/]+\/[^/]+)\/[^/]+$/;
// Largest mirrored file is 9.8MB; the cap bounds Worker memory, not R2.
const MAX_INGEST_BYTES = 32 * 1024 * 1024;

export async function ingestMedia(request, env, url) {
  const expected = env.MEDIA_INGEST_SECRET || (await mediaIngestCredential(env.MS_REALTY_ORIGIN_TOKEN));
  if (!expected) return new Response("Not found", { status: 404 });
  if (request.method !== "PUT" && request.method !== "GET" && request.method !== "DELETE") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, DELETE, PUT" } });
  }

  const presented = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!presented || !(await secretMatches(presented, expected))) {
    return new Response("Unauthorized", { status: 401 });
  }

  let key;
  try {
    key = decodeURIComponent(url.pathname.slice(INGEST_PREFIX.length));
  } catch {
    return new Response("Bad key", { status: 400 });
  }
  if (!isSafeKey(key) || !INGEST_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return new Response("Bad key", { status: 400 });
  }
  // Reads and deletes exist only for the per-listing lifecycle. The bulk PUT
  // path must retain the legacy archive prefixes, but the same credential must
  // never become a delete API for the mirrored WordPress estate.
  if (request.method !== "PUT" && !LIFECYCLE_KEY.test(key)) {
    return new Response("Bad key", { status: 400 });
  }

  if (request.method === "GET") {
    const object = await env.MEDIA.get(key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata?.(headers);
    if (object.httpEtag) headers.set("etag", object.httpEtag);
    headers.set("cache-control", "no-store");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { status: 200, headers });
  }

  if (request.method === "DELETE") {
    await env.MEDIA.delete(key);
    return new Response(JSON.stringify({ deleted: true }), {
      headers: { "cache-control": "no-store", "content-type": "application/json" },
    });
  }

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_INGEST_BYTES) return new Response("Too large", { status: 413 });
  const body = await request.arrayBuffer();
  if (!body.byteLength) return new Response("Empty body", { status: 400 });
  if (body.byteLength > MAX_INGEST_BYTES) return new Response("Too large", { status: 413 });
  await env.MEDIA.put(key, body, {
    httpMetadata: { contentType: request.headers.get("content-type") ?? "application/octet-stream" },
  });
  // Echo the stored length so the uploader can verify rather than trust.
  return new Response(JSON.stringify({ size: body.byteLength }), {
    headers: { "content-type": "application/json" },
  });
}
