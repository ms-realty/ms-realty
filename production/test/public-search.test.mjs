import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";
import { appRouterConfigFromEnv, renderAppSearchRoute, renderAppSearchRouteResponse } from "../lib/app-router-adapter.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { executePublicSearch, PublicSearchUnavailableError } from "../lib/public-search.mjs";
import { loadCmsSeed, searchRuntimeListings } from "../lib/runtime.mjs";

const registry = loadLocaleRegistry();
const seed = loadCmsSeed();
const hit = {
  id: "MS-CRAWL-0001:bg",
  source_listing_id: "MS-CRAWL-0001",
  locale: "bg",
  locale_path: "/bg/imoti/MS-CRAWL-0001",
  title: "Reviewed Sandanski listing",
};
const higherRankedHit = {
  ...hit,
  id: "MS-CRAWL-0002:bg",
  source_listing_id: "MS-CRAWL-0002",
  locale_path: "/bg/imoti/MS-CRAWL-0002",
};

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function searchConfig(fetchImpl, { environment = "test", typesense = true, meilisearch = true } = {}) {
  return {
    environment,
    typesense: typesense ? { baseUrl: "https://typesense.test", apiKey: "typesense-test", collectionName: "ms_realty_listings" } : {},
    meilisearch: meilisearch ? { baseUrl: "https://meili.test", apiKey: "meili-test", indexName: "ms_realty_listings" } : {},
    fetchImpl,
    naturalLanguageEnabled: false,
  };
}

function apiConfig(search) {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-public-search-`);
  const eventLedgerPath = `${directory}/events.jsonl`;
  const listingEditLedgerPath = `${directory}/listing-edits.jsonl`;
  const translationLedgerPath = `${directory}/translations.jsonl`;
  fs.writeFileSync(listingEditLedgerPath, "");
  fs.writeFileSync(translationLedgerPath, "");
  return {
    ...appApiConfigFromEnv({
      NODE_ENV: "test",
      MS_REALTY_EVENT_LEDGER_PATH: eventLedgerPath,
      MS_REALTY_LISTING_EDIT_LEDGER_PATH: listingEditLedgerPath,
      MS_REALTY_TRANSLATION_LEDGER_PATH: translationLedgerPath,
    }),
    search,
  };
}

test("Typesense hit IDs drive the public renderer without rerunning raw text matching", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return response({ found: 2, hits: [{ document: higherRankedHit }, { document: hit }] });
  };
  const local = searchRuntimeListings(registry, seed, {
    localeCode: "bg",
    query: "Sndanski",
    filters: {},
    sort: "recommended",
    page: 1,
    translationTasks: [],
  });
  const { result, engineResult } = await executePublicSearch({
    registry,
    seed,
    params: new URLSearchParams("locale=bg&q=Sndanski"),
    search: searchConfig(fetchImpl),
  });

  assert.deepEqual(local.cards, []);
  assert.equal(engineResult.engine, "typesense");
  assert.deepEqual(result.cards.map((card) => card.id), ["MS-CRAWL-0002", "MS-CRAWL-0001"]);
  assert.equal(result.search.query, "Sndanski");
  assert.equal(result.search.intent.text_query, "Sndanski");
  assert.equal(result.search.controls.save_search.payload.query, "Sndanski");
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/documents\/search\?/);
});

test("public search falls back from unavailable Typesense to Meilisearch", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.includes("/documents/search?")) return response({ message: "unavailable" }, 503);
    return response({ estimatedTotalHits: 1, hits: [hit] });
  };
  const { result, engineResult } = await executePublicSearch({
    registry,
    seed,
    params: new URLSearchParams("locale=bg&q=Sndanski"),
    search: searchConfig(fetchImpl),
  });

  assert.equal(engineResult.engine, "meilisearch");
  assert.equal(result.search.backend.mode, "fallback");
  assert.deepEqual(result.search.backend.unavailable_engines, ["typesense"]);
  assert.deepEqual(result.cards.map((card) => card.id), ["MS-CRAWL-0001"]);
  assert.equal(calls.length, 2);
});

test("public search uses the deterministic seed fallback when no engine is configured", async () => {
  const { result, engineResult } = await executePublicSearch({
    registry,
    seed,
    params: new URLSearchParams("locale=bg&q=Sandanski"),
    search: searchConfig(async () => response({}), { typesense: false, meilisearch: false }),
  });

  assert.equal(engineResult.engine, "seed_fallback");
  assert.equal(result.search.backend.mode, "local_fallback");
  assert.deepEqual(result.search.backend.unavailable_engines, ["typesense", "meilisearch"]);
  assert.ok(result.cards.length > 0);
});

test("production public search fails closed when no configured engine can serve it", async () => {
  await assert.rejects(
    executePublicSearch({
      registry,
      seed,
      params: new URLSearchParams("locale=bg&q=Sandanski"),
      search: searchConfig(async () => response({}), { environment: "production", typesense: false, meilisearch: false }),
    }),
    (error) => error instanceof PublicSearchUnavailableError,
  );

  const config = {
    ...appRouterConfigFromEnv({ NODE_ENV: "production" }),
    search: searchConfig(async () => response({}), { environment: "production", typesense: false, meilisearch: false }),
  };
  const responseFromRoute = await renderAppSearchRouteResponse({
    pathname: "/bg/tarsene",
    url: "https://example.test/bg/tarsene?q=Sandanski",
    config,
  });
  assert.equal(responseFromRoute.status, 503);
  assert.deepEqual(await responseFromRoute.json(), { kind: "search_unavailable", message: "Search is temporarily unavailable" });
});

test("localized HTML and API search share engine-ranked cards and request intent", async () => {
  const fetchImpl = async () => response({ found: 1, hits: [{ document: hit }] });
  const search = searchConfig(fetchImpl);
  const query = "locale=bg&q=Sndanski";
  const apiResponse = await renderAppApiResponse(new Request(`https://example.test/api/search?${query}`), {
    config: apiConfig(search),
  });
  const api = await apiResponse.json();
  const html = await renderAppSearchRoute({
    pathname: "/bg/tarsene",
    url: `https://example.test/bg/tarsene?${query}`,
    config: { ...appRouterConfigFromEnv({ NODE_ENV: "test" }), search },
  });

  assert.equal(apiResponse.status, 200);
  assert.equal(html.status, 200);
  assert.deepEqual(html.rendered.cards.map((card) => card.id), api.cards.map((card) => card.id));
  assert.equal(html.rendered.search.query, api.search.query);
  assert.deepEqual(html.rendered.search.intent, api.search.intent);
  assert.match(html.html, /MS-CRAWL-0001/);
});
