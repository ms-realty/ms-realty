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
    DATABASE_URL: "postgres://db.ms-realty.bg:5432/ms_realty",
    PAYLOAD_SECRET: "payload-secret",
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

  assert.equal(separated.postgres.env.DATABASE_URL, "postgres://db.ms-realty.bg:5432/ms_realty");
  assert.equal(separated.postgres.env.PAYLOAD_SECRET, "payload-secret");
  assert.equal(separated.typesense.queryApiKey, "typesense-query");
  assert.equal(separated.meilisearch.queryApiKey, "meili-query");
  assert.equal(compatible.typesense.queryApiKey, "typesense-admin");
  assert.equal(compatible.meilisearch.queryApiKey, "meili-admin");
});

test("production public search config keeps Postgres and ignores legacy engine credentials", () => {
  const env = {
    NODE_ENV: "production",
    MS_REALTY_SEARCH_ENGINE: "postgres",
    DATABASE_URL: "postgresql://runtime:secret@db.ms-realty.bg/ms_realty",
    PAYLOAD_SECRET: "payload-secret",
    TYPESENSE_URL: "https://typesense.ms-realty.bg",
    TYPESENSE_API_KEY: "typesense-admin",
    MEILI_URL: "https://meili.ms-realty.bg",
    MEILI_API_KEY: "meili-admin",
  };
  const config = publicSearchConfigFromEnv(env);

  assert.equal(config.engine, "postgres");
  assert.equal(config.postgres.env.DATABASE_URL, env.DATABASE_URL);
  assert.equal("TYPESENSE_API_KEY" in config.postgres.env, false);
  assert.equal("MEILI_API_KEY" in config.postgres.env, false);
  assert.deepEqual(config.typesense, {});
  assert.deepEqual(config.meilisearch, {});
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
  assert.deepEqual(result.search.backend.unavailable_engines, ["postgres", "typesense"]);
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
  assert.deepEqual(result.search.backend.unavailable_engines, ["postgres", "typesense", "meilisearch"]);
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

test("Postgres result pages preserve database totals and requested page size", async () => {
  const intents = [];
  const { result, engineResult } = await executePublicSearch({
    registry,
    seed,
    params: new URLSearchParams("locale=bg&page=3&page_size=7&listing_status=reserved"),
    search: {
      engine: "postgres",
      environment: "production",
      postgres: {
        queryImpl: async ({ intent }) => {
          intents.push(intent);
          return {
            engine: "postgres",
            total: 23,
            hits: [higherRankedHit, hit],
            page: intent.page,
            page_size: intent.page_size,
            target: "ms_realty_public_search_documents",
          };
        },
      },
    },
  });

  assert.equal(intents[0].page, 3);
  assert.equal(intents[0].page_size, 7);
  assert.equal(intents[0].listing_status, "reserved");
  assert.equal(engineResult.total, 23);
  assert.equal(result.search.total_matches, 23);
  assert.deepEqual(result.search.pagination, {
    page: 3,
    per_page: 7,
    total_pages: 4,
    has_previous: true,
    has_next: true,
  });
  assert.deepEqual(result.cards.map((card) => card.id), ["MS-CRAWL-0002", "MS-CRAWL-0001"]);
});

test("Postgres cards keep database-only listings and database-updated facts authoritative", async () => {
  const { result } = await executePublicSearch({
    registry,
    seed,
    params: new URLSearchParams("locale=bg&page_size=5"),
    search: {
      engine: "postgres",
      environment: "production",
      postgres: {
        queryImpl: async ({ intent }) => ({
          engine: "postgres",
          total: 2,
          page: intent.page,
          page_size: intent.page_size,
          target: "ms_realty_public_search_documents",
          hits: [
            {
              ...hit,
              title: "Authoritative database title",
              location_label: "Database Sandanski",
              property_family: "apartment",
              offer_type: "sale",
              listing_status: "reserved",
              price_amount: 123456,
              price_currency: "EUR",
              price_on_request: false,
              bedrooms_count: 2,
              primary_area_sqm: 88,
            },
            {
              id: "MS-DB-ONLY-0001:bg",
              source_listing_id: "MS-DB-ONLY-0001",
              listing_reference: "MS-DB-ONLY-0001",
              locale: "bg",
              locale_path: "/bg/imoti/db-only-listing",
              title: "Database-only approved listing",
              description: "Approved database description",
              location_label: "Petrich",
              municipality: "Petrich",
              district: "Blagoevgrad",
              country_code: "BG",
              property_family: "house",
              offer_type: "rent",
              listing_status: "available",
              price_amount: 950,
              price_currency: "EUR",
              price_on_request: false,
              bedrooms_count: 3,
              primary_area_sqm: 120,
            },
          ],
        }),
      },
    },
  });

  assert.equal(result.cards.length, 2);
  assert.deepEqual(result.cards.map((card) => card.id), ["MS-CRAWL-0001", "MS-DB-ONLY-0001"]);
  assert.equal(result.cards[0].title, "Authoritative database title");
  assert.equal(result.cards[0].location, "Database Sandanski");
  assert.equal(result.cards[0].price_eur, 123456);
  assert.equal(result.cards[0].area_sqm, 88);
  assert.equal(result.cards[1].title, "Database-only approved listing");
  assert.equal(result.cards[1].path, "/bg/imoti/db-only-listing");
  assert.equal(result.cards[1].price_eur, 950);
  assert.equal(result.cards[1].bedrooms, 3);
});
