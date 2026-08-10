import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";
import { appRouterConfigFromEnv, renderAppSearchRoute, renderAppSearchRouteResponse } from "../lib/app-router-adapter.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import {
  executePublicSearch,
  publicSearchConfigFromEnv,
  PublicSearchUnavailableError,
} from "../lib/public-search.mjs";
import { loadCmsSeed, searchRuntimeListings } from "../lib/runtime.mjs";
import { approvedPublicSeedFixtureEnv } from "./approved-public-seed.fixture.mjs";

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
  const lookupImpl = async () => [{ address: "1.1.1.1", family: 4 }];
  return {
    environment,
    typesense: typesense
      ? { baseUrl: "https://typesense.ms-realty.bg", apiKey: "typesense-test", collectionName: "ms_realty_listings", lookupImpl }
      : {},
    meilisearch: meilisearch
      ? { baseUrl: "https://meili.ms-realty.bg", apiKey: "meili-test", indexName: "ms_realty_listings", lookupImpl }
      : {},
    fetchImpl,
    naturalLanguageEnabled: false,
  };
}

test("public search prefers optional query-only credentials and keeps admin-key fallback", () => {
  const separated = publicSearchConfigFromEnv({
    TYPESENSE_URL: "https://typesense.ms-realty.bg",
    TYPESENSE_API_KEY: "typesense-admin",
    TYPESENSE_QUERY_API_KEY: "typesense-query",
    MEILI_URL: "https://meili.ms-realty.bg",
    MEILI_API_KEY: "meili-admin",
    MEILI_QUERY_API_KEY: "meili-query",
  });
  const compatible = publicSearchConfigFromEnv({
    TYPESENSE_API_KEY: "typesense-admin",
    MEILI_API_KEY: "meili-admin",
  });

  assert.equal(separated.typesense.queryApiKey, "typesense-query");
  assert.equal(separated.meilisearch.queryApiKey, "meili-query");
  assert.equal(compatible.typesense.queryApiKey, "typesense-admin");
  assert.equal(compatible.meilisearch.queryApiKey, "meili-admin");
});

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
      ...approvedPublicSeedFixtureEnv(),
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
  assert.match(responseFromRoute.headers.get("content-type"), /text\/html/);
  const fallbackHtml = await responseFromRoute.text();
  assert.match(fallbackHtml, /data-kind="search-unavailable"/);
  assert.match(fallbackHtml, /tel:\+359879696870/);
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
    config: { ...appRouterConfigFromEnv({ NODE_ENV: "test", ...approvedPublicSeedFixtureEnv() }), search },
  });

  assert.equal(apiResponse.status, 200);
  assert.equal(html.status, 200);
  assert.deepEqual(html.rendered.cards.map((card) => card.id), api.cards.map((card) => card.id));
  assert.equal(html.rendered.search.query, api.search.query);
  assert.deepEqual(html.rendered.search.intent, api.search.intent);
  assert.match(html.html, /MS-CRAWL-0001/);
});
