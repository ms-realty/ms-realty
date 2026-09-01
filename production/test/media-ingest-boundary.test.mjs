import assert from "node:assert/strict";
import test from "node:test";

import { ingestMedia } from "../../workers/media-ingest-boundary.mjs";

const SECRET = "media-ingest-test-secret";
const PRIVATE_KEY = "makler-realty.com/wp-content/private/listings/MS-CRAWL-0001/media-0123456789abcdef0123/ms-photo.jpg";
const PUBLIC_KEY = "makler-realty.com/wp-content/uploads/2026/09/listings/MS-CRAWL-0001/media-0123456789abcdef0123/ms-photo.jpg";
const LEGACY_KEY = "makler-realty.com/wp-content/uploads/2026/09/legacy.jpg";

function boundaryHarness() {
  const objects = new Map([
    [PRIVATE_KEY, Buffer.from("private-bytes")],
    [PUBLIC_KEY, Buffer.from("public-bytes")],
  ]);
  return {
    objects,
    env: {
      MEDIA_INGEST_SECRET: SECRET,
      MEDIA: {
        async get(key) {
          const body = objects.get(key);
          return body
            ? {
                body,
                httpEtag: '"test-etag"',
                writeHttpMetadata(headers) {
                  headers.set("content-type", "image/jpeg");
                },
              }
            : null;
        },
        async put(key, body) {
          objects.set(key, Buffer.from(body));
        },
        async delete(key) {
          objects.delete(key);
        },
      },
    },
  };
}

function request(key, method, { authorized = true, body = null } = {}) {
  const headers = new Headers();
  if (authorized) headers.set("authorization", `Bearer ${SECRET}`);
  if (body) headers.set("content-type", "image/jpeg");
  return new Request(`https://edge.test/__media/${encodeURIComponent(key)}`, { method, headers, body });
}

test("media ingest boundary authenticates lifecycle reads and deletes without exposing the legacy archive", async () => {
  const { env, objects } = boundaryHarness();

  assert.equal((await ingestMedia(request(PRIVATE_KEY, "GET", { authorized: false }), env, new URL(`https://edge.test/__media/${encodeURIComponent(PRIVATE_KEY)}`))).status, 401);

  const read = await ingestMedia(request(PRIVATE_KEY, "GET"), env, new URL(`https://edge.test/__media/${encodeURIComponent(PRIVATE_KEY)}`));
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("cache-control"), "no-store");
  assert.equal(read.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await read.arrayBuffer()), Buffer.from("private-bytes"));

  const legacyRead = await ingestMedia(request(LEGACY_KEY, "GET"), env, new URL(`https://edge.test/__media/${encodeURIComponent(LEGACY_KEY)}`));
  assert.equal(legacyRead.status, 400);

  const removed = await ingestMedia(request(PUBLIC_KEY, "DELETE"), env, new URL(`https://edge.test/__media/${encodeURIComponent(PUBLIC_KEY)}`));
  assert.equal(removed.status, 200);
  assert.equal(objects.has(PUBLIC_KEY), false);

  const legacyWrite = await ingestMedia(
    request(LEGACY_KEY, "PUT", { body: Buffer.from("legacy-bytes") }),
    env,
    new URL(`https://edge.test/__media/${encodeURIComponent(LEGACY_KEY)}`),
  );
  assert.equal(legacyWrite.status, 200);
  assert.deepEqual(objects.get(LEGACY_KEY), Buffer.from("legacy-bytes"));
});
