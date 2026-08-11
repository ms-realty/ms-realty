import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";
import worker from "../../workers/live-services-proxy.js";

const ORIGIN = "https://review.ms-realty.test";
const ENV = {
  MS_REALTY_SEARCH_ENGINE: "typesense",
  MS_REALTY_SEARCH_ORIGIN: ORIGIN,
  MS_REALTY_SEARCH_ORIGIN_TOKEN: "origin-token-00000000000000000000",
  MS_REALTY_SEARCH_QUERY_PROXY_KEY: "query-token-000000000000000000000",
  MS_REALTY_SEARCH_SYNC_PROXY_KEY: "sync-token-0000000000000000000000",
  MS_REALTY_SEARCH_TARGET: "ms_realty_listings",
};

function upstreamResponse(status = 200, body = "{}", headers = { "content-type": "application/json" }) {
  return new Response(body, { status, headers });
}

function request(pathname, { method = "GET", token = ENV.MS_REALTY_SEARCH_QUERY_PROXY_KEY, body, headers = {} } = {}) {
  return new Request(`https://ms-realty-typesense.workers.dev${pathname}`, {
    method,
    headers: { "x-typesense-api-key": token, ...headers },
    ...(body === undefined ? {} : { body }),
  });
}

test("live search proxy forwards only mandatory-filter Typesense queries to the fixed origin", async () => {
  const calls = [];
  const filter = [
    "publication_state:=published",
    "(listing_status:=available || listing_status:=reserved)",
    "translation_indexable:=true",
    "translation_human_approved:=true",
    "locale_indexable:=true",
    "locale:=`bg`",
  ].join(" && ");
  const params = new URLSearchParams({ q: "*", query_by: "title,search_text", filter_by: filter, per_page: "25" });
  const response = await worker.fetch(request(`/collections/ms_realty_listings/documents/search?${params}`), ENV, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return upstreamResponse(200, JSON.stringify({ found: 0, hits: [] }));
    },
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `${ORIGIN}/_search/typesense/collections/ms_realty_listings/documents/search?${params}`,
  );
  assert.equal(calls[0].options.redirect, "manual");
  assert.equal(calls[0].options.headers.get("x-ms-realty-search-origin-token"), ENV.MS_REALTY_SEARCH_ORIGIN_TOKEN);
  assert.equal(calls[0].options.headers.has("x-typesense-api-key"), false);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("live search proxy separates query and sync credentials and fixes sync targets", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return upstreamResponse(201);
  };

  assert.equal(
    (await worker.fetch(request("/collections", {
      method: "POST",
      token: ENV.MS_REALTY_SEARCH_QUERY_PROXY_KEY,
      body: JSON.stringify({ name: "ms_realty_listings", fields: [] }),
    }), ENV, { fetchImpl })).status,
    401,
  );
  assert.equal(
    (await worker.fetch(request("/collections", {
      method: "POST",
      token: ENV.MS_REALTY_SEARCH_SYNC_PROXY_KEY,
      body: JSON.stringify({ name: "other", fields: [] }),
    }), ENV, { fetchImpl })).status,
    400,
  );
  assert.equal(
    (await worker.fetch(request("/collections", {
      method: "POST",
      token: ENV.MS_REALTY_SEARCH_SYNC_PROXY_KEY,
      body: JSON.stringify({ name: "ms_realty_listings", fields: [] }),
    }), ENV, { fetchImpl })).status,
    201,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${ORIGIN}/_search/typesense/collections`);
});

test("live search proxy rejects bypass filters, delete/key APIs, encoded paths, and redirects", async () => {
  const filter = "locale:=`bg`";
  const params = new URLSearchParams({ q: "*", query_by: "title", filter_by: filter, per_page: "25" });
  assert.equal(
    (await worker.fetch(request(`/collections/ms_realty_listings/documents/search?${params}`), ENV, {
      fetchImpl: async () => upstreamResponse(),
    })).status,
    400,
  );
  for (const [method, pathname] of [
    ["DELETE", "/collections/ms_realty_listings"],
    ["GET", "/keys"],
    ["POST", "/collections/other/documents/import?action=upsert"],
    ["GET", "/collections%2fms_realty_listings/documents/search"],
  ]) {
    assert.equal(
      (await worker.fetch(request(pathname, { method, token: ENV.MS_REALTY_SEARCH_SYNC_PROXY_KEY }), ENV, {
        fetchImpl: async () => { throw new Error("blocked routes must not reach origin"); },
      })).status,
      404,
      `${method} ${pathname}`,
    );
  }

  const redirected = await worker.fetch(request("/health", { token: ENV.MS_REALTY_SEARCH_SYNC_PROXY_KEY }), ENV, {
    fetchImpl: async () => upstreamResponse(302, "", { location: "https://attacker.invalid/" }),
  });
  assert.equal(redirected.status, 502);
});

test("live search proxy validates Meilisearch public filters and strips bearer credentials", async () => {
  const calls = [];
  const env = { ...ENV, MS_REALTY_SEARCH_ENGINE: "meilisearch" };
  const body = JSON.stringify({
    q: "*",
    filter: [
      'publication_state = "published"',
      '(listing_status = "available" OR listing_status = "reserved")',
      "translation_indexable = true",
      "translation_human_approved = true",
      "locale_indexable = true",
      'locale = "bg"',
    ].join(" AND "),
    limit: 25,
  });
  const response = await worker.fetch(
    new Request("https://ms-realty-meilisearch.workers.dev/indexes/ms_realty_listings/search", {
      method: "POST",
      headers: { authorization: `Bearer ${ENV.MS_REALTY_SEARCH_QUERY_PROXY_KEY}`, "content-type": "application/json" },
      body,
    }),
    env,
    {
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return upstreamResponse(200, JSON.stringify({ estimatedTotalHits: 0, hits: [] }));
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(calls[0].url, `${ORIGIN}/_search/meilisearch/indexes/ms_realty_listings/search`);
  assert.equal(calls[0].options.headers.has("authorization"), false);
  assert.equal(await new Response(calls[0].options.body).text(), body);
});

test("live search proxy configuration keeps engine keys on the origin", () => {
  const wrangler = fs.readFileSync(fromRoot("wrangler.live-services.jsonc"), "utf8");
  const caddy = fs.readFileSync(fromRoot("production", "Caddyfile.production-review"), "utf8");
  const compose = fs.readFileSync(fromRoot("production", "docker-compose.production-review.yml"), "utf8");
  assert.match(wrangler, /"name": "ms-realty-typesense"/);
  assert.match(wrangler, /"name": "ms-realty-meilisearch"/);
  assert.doesNotMatch(wrangler, /TYPESENSE_API_KEY|MEILI_MASTER_KEY/);
  assert.match(caddy, /X-MS-Reality-Search-Origin-Token|X-MS-Realty-Search-Origin-Token/i);
  assert.match(caddy, /header_up X-TYPESENSE-API-KEY "?\{\$TYPESENSE_API_KEY\}"?/i);
  assert.match(caddy, /header_up Authorization "Bearer \{\$MEILI_MASTER_KEY\}"/i);
  assert.match(compose, /MS_REALTY_SEARCH_ORIGIN_TOKEN/);
});
