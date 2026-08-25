// Cloudflare's default cache rules store static assets by file extension and
// never store an HTML document. That is why every page answered
// `cf-cache-status: DYNAMIC` while advertising `s-maxage=3600`: the runtime was
// declaring a shared lifetime that nothing at the edge ever acted on, so each
// visitor paid the full origin render. A declared `s-maxage` only becomes real
// when the Worker puts the response into the cache itself.
//
// The gate below is an allowlist driven by what the origin says about its own
// response, not by a list of paths this file would have to keep in sync with
// the router. The runtime already prints `no-store` on every personalised
// surface — the search results, `/admin` and its login, and the whole `/api`
// tree — so a response that says `public` and carries an `s-maxage` is the
// runtime's own statement that these bytes belong to no particular visitor.
// Anything short of that statement is proxied through untouched.

// HEAD is deliberately excluded: its response has no body, and storing it under
// a URL key would starve the next real navigation.
const CACHEABLE_METHODS = new Set(["GET"]);

// A request carrying either of these may have been answered personally, so
// whatever came back must never be handed to somebody else.
const IDENTITY_HEADERS = ["authorization", "cookie"];

// Next.js varies on these: with any of them set the same URL returns the router
// payload rather than the document, so such a request neither reads from nor
// writes to the entry a plain navigation uses.
const ROUTER_HEADERS = [
  "rsc",
  "next-router-state-tree",
  "next-router-prefetch",
  "next-router-segment-prefetch",
];

// Folded into the cache key rather than left to `Vary`, see edgeCacheKey.
const COLOR_SCHEME_HEADER = "sec-ch-prefers-color-scheme";
const COLOR_SCHEME_KEY = "__ms_scheme";

// Cloudflare's cache does not split entries on an arbitrary `Vary`, so a header
// it cannot act on is worse than useless: it either makes every lookup miss or
// invites two different documents into one entry. Every dimension the origin
// currently names is handled before we get here — the colour-scheme hint by the
// cache key, the router headers by refusing those requests outright — and
// `Accept-Encoding` is the one Cloudflare splits on natively. Anything else is
// a dimension nobody has accounted for, so the response is passed through
// uncached rather than guessed at.
const HANDLED_VARY = new Set([COLOR_SCHEME_HEADER, ...ROUTER_HEADERS]);
const NATIVE_VARY = new Set(["accept-encoding"]);

export const EDGE_CACHE_HEADER = "x-ms-realty-edge-cache";

function varyMembers(response) {
  return String(response.headers.get("vary") || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function cacheControlDirectives(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((part) => part.trim().split("=")[0].toLowerCase())
      .filter(Boolean),
  );
}

// No credential of any kind on the request. This is defence in depth rather
// than the primary gate: the origin already refuses to mark a signed-in page
// `public`, but a response generated while a session cookie was in play must
// not reach the shared cache even if that ever changes.
export function isAnonymousRequest(request) {
  return !IDENTITY_HEADERS.some((name) => (request.headers.get(name) || "").trim());
}

export function requestMayUseEdgeCache(request) {
  if (!CACHEABLE_METHODS.has(String(request.method || "").toUpperCase())) return false;
  if (ROUTER_HEADERS.some((name) => request.headers.has(name))) return false;
  return isAnonymousRequest(request);
}

// Only the runtime's own "this is shared" declaration opens the gate. The
// status check is what keeps a transient 404 or a 5xx out of the shared cache:
// an error pinned at the edge for an hour does not heal when the backend does.
export function responseMayBeShared(response) {
  if (response.status !== 200) return false;
  if (response.headers.has("set-cookie")) return false;
  const members = varyMembers(response);
  if (members.some((name) => name === "*" || !(HANDLED_VARY.has(name) || NATIVE_VARY.has(name)))) return false;
  const control = response.headers.get("cache-control");
  const directives = cacheControlDirectives(control);
  if (!directives.has("public")) return false;
  if (directives.has("no-store") || directives.has("private") || directives.has("no-cache")) return false;
  return /(^|[\s,])s-maxage=\d+/i.test(String(control || ""));
}

// The origin advertises `Vary: Sec-CH-Prefers-Color-Scheme` next to its
// `Accept-CH`, but Cloudflare's cache does not split entries on an arbitrary
// Vary header. Folding the hint into the key means a dark-mode and a light-mode
// visitor can never be served each other's document, whether or not the origin
// currently bothers to render them differently.
export function edgeCacheKey(request) {
  const url = new URL(request.url);
  url.searchParams.delete(COLOR_SCHEME_KEY);
  const hint = (request.headers.get(COLOR_SCHEME_HEADER) || "").trim().toLowerCase();
  if (hint) url.searchParams.set(COLOR_SCHEME_KEY, hint === "dark" ? "dark" : "light");
  return new Request(url.toString(), { method: "GET" });
}

function withEdgeCacheMarker(response, state, { normalizeVary = false } = {}) {
  const headers = new Headers(response.headers);
  headers.set(EDGE_CACHE_HEADER, state);
  if (normalizeVary) {
    // Drop the dimensions already handled by the key and the request gate, so
    // the Cache API is left only with the ones it splits on natively. Leaving
    // them in makes every subsequent lookup miss, which would have turned this
    // whole change into a no-op that still looked plausible.
    const kept = varyMembers(response).filter((name) => !HANDLED_VARY.has(name));
    if (kept.length) headers.set("vary", kept.join(", "));
    else headers.delete("vary");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function edgeCacheHit(response) {
  return withEdgeCacheMarker(response, "hit");
}

// Storing happens off the response path so a slow cache write never delays the
// visitor who paid for the render.
export async function storeInEdgeCache(response, cacheKey, ctx, cache) {
  if (!cacheKey || !cache || !responseMayBeShared(response)) return response;
  const stored = withEdgeCacheMarker(response, "miss", { normalizeVary: true });
  const write = cache.put(cacheKey, stored.clone());
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(write);
  else await write;
  return stored;
}
