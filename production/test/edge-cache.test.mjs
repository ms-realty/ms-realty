import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";
import {
  EDGE_CACHE_HEADER,
  edgeCacheKey,
  isAnonymousRequest,
  requestMayUseEdgeCache,
  responseMayBeShared,
  storeInEdgeCache,
} from "../../workers/edge-cache.mjs";

const PUBLIC_CACHE = "public, max-age=300, s-maxage=3600";
const workerSource = fs.readFileSync(fromRoot("workers", "index.js"), "utf8");

const responseWith = (cacheControl, { status = 200, ...headers } = {}) =>
  new Response("<!doctype html>", { status, headers: { "cache-control": cacheControl, ...headers } });

test("only the runtime's own public declaration opens the shared cache", () => {
  assert.equal(responseMayBeShared(responseWith(PUBLIC_CACHE)), true);
  assert.equal(responseMayBeShared(responseWith("public, s-maxage=60")), true);

  // Everything the runtime marks private stays private. These are the exact
  // strings the search results, /admin, /admin/login and the /api tree emit.
  assert.equal(responseMayBeShared(responseWith("no-store")), false);
  assert.equal(responseMayBeShared(responseWith("private, max-age=0, must-revalidate")), false);
  assert.equal(responseMayBeShared(responseWith("public, no-cache")), false);

  // A browser-only lifetime is not an invitation to share between visitors.
  assert.equal(responseMayBeShared(responseWith("public, max-age=300")), false);
  assert.equal(responseMayBeShared(responseWith("max-age=300, s-maxage=3600")), false);
});

test("an unrendered page never reaches the shared cache whatever it declares", () => {
  for (const status of [301, 404, 410, 500, 503]) {
    assert.equal(responseMayBeShared(responseWith(PUBLIC_CACHE, { status })), false, `status ${status}`);
  }
});

test("a response that sets a cookie is never shared between visitors", () => {
  const withCookie = responseWith(PUBLIC_CACHE, { "set-cookie": "ms_admin=abc; HttpOnly" });
  assert.equal(responseMayBeShared(withCookie), false);
});

test("an unaccounted-for Vary dimension disengages the cache instead of guessing", () => {
  // Exactly what the origin prints today: the colour-scheme hint lives in the
  // cache key and the router headers never reach the cache at all.
  const origin = "Sec-CH-Prefers-Color-Scheme, rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch";
  assert.equal(responseMayBeShared(responseWith(PUBLIC_CACHE, { vary: origin })), true);
  assert.equal(responseMayBeShared(responseWith(PUBLIC_CACHE, { vary: "Accept-Encoding" })), true);

  // A dimension nobody has accounted for must not be flattened into one entry.
  assert.equal(responseMayBeShared(responseWith(PUBLIC_CACHE, { vary: "Accept-Language" })), false);
  assert.equal(responseMayBeShared(responseWith(PUBLIC_CACHE, { vary: `${origin}, Cookie` })), false);
  assert.equal(responseMayBeShared(responseWith(PUBLIC_CACHE, { vary: "*" })), false);
});

test("the stored copy keeps only the Vary members Cloudflare acts on", async () => {
  const stored = [];
  const cache = { put: async (_key, value) => stored.push(value) };
  const key = edgeCacheKey(new Request("https://ms-realty.test/bg"));
  const vary = "Sec-CH-Prefers-Color-Scheme, rsc, Accept-Encoding";

  await storeInEdgeCache(responseWith(PUBLIC_CACHE, { vary }), key, null, cache);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].headers.get("vary"), "accept-encoding");

  stored.length = 0;
  await storeInEdgeCache(responseWith(PUBLIC_CACHE, { vary: "Sec-CH-Prefers-Color-Scheme" }), key, null, cache);
  assert.equal(stored[0].headers.get("vary"), null);
});

test("only an anonymous plain navigation reads or fills the shared cache", () => {
  const plain = new Request("https://ms-realty.test/bg");
  assert.equal(requestMayUseEdgeCache(plain), true);
  assert.equal(isAnonymousRequest(plain), true);

  // A signed-in operator always gets a fresh render, so nothing generated while
  // a session was in play can be stored under a shared key.
  const cookied = new Request("https://ms-realty.test/bg", { headers: { cookie: "ms_admin=abc" } });
  assert.equal(requestMayUseEdgeCache(cookied), false);
  assert.equal(isAnonymousRequest(cookied), false);

  const bearer = new Request("https://ms-realty.test/bg", { headers: { authorization: "Bearer t" } });
  assert.equal(requestMayUseEdgeCache(bearer), false);

  // Writes and the Next router payloads keep their own path to the origin.
  assert.equal(requestMayUseEdgeCache(new Request("https://ms-realty.test/api/leads", { method: "POST" })), false);
  assert.equal(requestMayUseEdgeCache(new Request("https://ms-realty.test/bg", { method: "HEAD" })), false);
  for (const header of ["rsc", "next-router-state-tree", "next-router-prefetch", "next-router-segment-prefetch"]) {
    const routed = new Request("https://ms-realty.test/bg", { headers: { [header]: "1" } });
    assert.equal(requestMayUseEdgeCache(routed), false, header);
  }
});

test("the cache key splits on the colour-scheme hint the origin varies on", () => {
  const plain = edgeCacheKey(new Request("https://ms-realty.test/bg"));
  const dark = edgeCacheKey(new Request("https://ms-realty.test/bg", { headers: { "sec-ch-prefers-color-scheme": "dark" } }));
  const light = edgeCacheKey(new Request("https://ms-realty.test/bg", { headers: { "sec-ch-prefers-color-scheme": "light" } }));

  assert.notEqual(dark.url, light.url);
  assert.notEqual(dark.url, plain.url);
  assert.equal(dark.method, "GET");

  // A query string cannot impersonate the hint and steal another entry.
  const spoofed = edgeCacheKey(new Request("https://ms-realty.test/bg?__ms_scheme=dark"));
  assert.equal(spoofed.url, plain.url);

  // Distinct pages and distinct query strings stay distinct.
  assert.notEqual(edgeCacheKey(new Request("https://ms-realty.test/en")).url, plain.url);
  assert.notEqual(edgeCacheKey(new Request("https://ms-realty.test/bg?page=2")).url, plain.url);
});

test("storing is skipped for anything the gate rejects and marks what it keeps", async () => {
  const puts = [];
  const cache = { put: async (key, value) => puts.push([key.url, value.status]) };
  const key = edgeCacheKey(new Request("https://ms-realty.test/bg"));

  const shared = await storeInEdgeCache(responseWith(PUBLIC_CACHE), key, null, cache);
  assert.equal(shared.headers.get(EDGE_CACHE_HEADER), "miss");
  assert.equal(puts.length, 1);

  const priv = await storeInEdgeCache(responseWith("no-store"), key, null, cache);
  assert.equal(priv.headers.get(EDGE_CACHE_HEADER), null);
  assert.equal(puts.length, 1);

  // No key means the request was not eligible in the first place.
  const skipped = await storeInEdgeCache(responseWith(PUBLIC_CACHE), null, null, cache);
  assert.equal(skipped.headers.get(EDGE_CACHE_HEADER), null);
  assert.equal(puts.length, 1);
});

test("a rejected background cache write is observed instead of becoming an unhandled rejection", async () => {
  const waits = [];
  const cache = { put: async () => Promise.reject(new Error("cache is unavailable")) };
  const key = edgeCacheKey(new Request("https://ms-realty.test/bg"));
  const stored = await storeInEdgeCache(responseWith(PUBLIC_CACHE), key, { waitUntil: (promise) => waits.push(promise) }, cache);
  assert.equal(stored.headers.get(EDGE_CACHE_HEADER), "miss");
  assert.equal(waits.length, 1);
  await waits[0];
});

test("the Worker consults the edge cache before waking the origin", () => {
  assert.match(workerSource, /requestMayUseEdgeCache\(request\)/);
  assert.match(workerSource, /caches\?\.default/);
  assert.match(workerSource, /storeInEdgeCache\(response, cacheKey, ctx, cache\)/);
  // The private-path, ingest and media guards must still run first.
  assert.ok(
    workerSource.indexOf("if (isPayloadPrivatePath(url.pathname)) return payloadPrivateResponse();") <
      workerSource.indexOf("requestMayUseEdgeCache(request)"),
    "the Payload private-path guard runs before any cache lookup",
  );
});
