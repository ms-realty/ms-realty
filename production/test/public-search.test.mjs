import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";
import {
  appRouterConfigFromEnv,
  renderAppRoute,
  renderAppSearchRoute,
  renderAppSearchRouteResponse,
} from "../lib/app-router-adapter.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import {
  engineLocaleCodes,
  executePublicSearch,
  publicSearchConfigFromEnv,
  PublicSearchUnavailableError,
} from "../lib/public-search.mjs";
import { loadCmsSeed, searchRuntimeListings } from "../lib/runtime.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { approvedPublicSeedFixture, approvedPublicSeedFixtureOptions, approvedPublicSeedFixtureEnv } from "./approved-public-seed.fixture.mjs";

const registry = loadLocaleRegistry();
const seed = loadCmsSeed();

// A listing the operator publication approval never named: it can only be seen
// behind private review, never on the public site.
function seedWithUnapprovedListing() {
  const source = seed.records.find((record) => record.collection === "listings");
  const records = [...seed.records, { ...source, id: "MS-CRAWL-9999", routing: null }];
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-unapproved-listing-`);
  const filePath = `${directory}/cms-seed.json`;
  fs.writeFileSync(filePath, `${JSON.stringify({ ...seed, records })}\n`);
  return filePath;
}
const hit = {
  id: "MS-00815:bg",
  source_listing_id: "MS-00815",
  locale: "bg",
  locale_path: "/bg/imoti/MS-00815",
  title: "Reviewed Sandanski listing",
};
const higherRankedHit = {
  ...hit,
  id: "MS-00907:bg",
  source_listing_id: "MS-00907",
  locale_path: "/bg/imoti/MS-00907",
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
  assert.deepEqual(result.cards.map((card) => card.id), ["MS-00907", "MS-00815"]);
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
  assert.deepEqual(result.cards.map((card) => card.id), ["MS-00815"]);
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

test("private review keeps the production Postgres search contract while exposing review inventory", () => {
  const productionConfig = appRouterConfigFromEnv({ NODE_ENV: "production" });
  const reviewEnv = {
    NODE_ENV: "production",
    MS_REALTY_PRIVATE_REVIEW_MODE: "true",
    DATABASE_URL: "postgres://db.ms-realty.bg:5432/ms_realty",
    PAYLOAD_SECRET: "private-review-test-secret",
  };
  const reviewConfig = appRouterConfigFromEnv(reviewEnv);
  const productionListing = renderAppRoute({
    pathname: "/bg/imoti/MS-00815",
    url: "https://example.test/bg/imoti/MS-00815",
    config: productionConfig,
  });
  const reviewListing = renderAppRoute({
    pathname: "/bg/imoti/MS-00815",
    url: "https://example.test/bg/imoti/MS-00815",
    config: reviewConfig,
  });

  // The owner-approved catalog is public, so production serves the listing too.
  // What private review still adds is inventory the publication gate refuses.
  const reviewOnlySeedPath = seedWithUnapprovedListing();
  const gatedInProduction = renderAppRoute({
    pathname: "/bg/imoti/MS-CRAWL-9999",
    url: "https://example.test/bg/imoti/MS-CRAWL-9999",
    config: appRouterConfigFromEnv({ NODE_ENV: "production", MS_REALTY_CMS_SEED_PATH: reviewOnlySeedPath }),
  });
  const visibleInReview = renderAppRoute({
    pathname: "/bg/imoti/MS-CRAWL-9999",
    url: "https://example.test/bg/imoti/MS-CRAWL-9999",
    config: appRouterConfigFromEnv({ ...reviewEnv, MS_REALTY_CMS_SEED_PATH: reviewOnlySeedPath }),
  });

  assert.equal(productionConfig.privateReview, false);
  assert.equal(productionListing.status, 200);
  assert.equal(productionListing.rendered.kind, "listing");
  assert.equal(productionListing.rendered.indexable, true);
  assert.equal(gatedInProduction.rendered.kind, "not_found");
  assert.equal(visibleInReview.rendered.kind, "listing");
  assert.equal(reviewConfig.privateReview, true);
  assert.equal(reviewConfig.search.environment, "production");
  assert.equal(reviewConfig.search.engine, "postgres");
  assert.equal(reviewConfig.search.postgres.env.DATABASE_URL, reviewEnv.DATABASE_URL);
  assert.equal(reviewListing.status, 200);
  assert.equal(reviewListing.rendered.kind, "listing");
  assert.equal(reviewListing.rendered.indexable, true);

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
  assert.match(html.html, /MS-00815/);
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
  assert.deepEqual(result.cards.map((card) => card.id), ["MS-00907", "MS-00815"]);
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
  assert.deepEqual(result.cards.map((card) => card.id), ["MS-00815", "MS-DB-ONLY-0001"]);
  assert.equal(result.cards[0].title, "Authoritative database title");
  assert.equal(result.cards[0].location, "Database Sandanski");
  assert.equal(result.cards[0].price_eur, 123456);
  assert.equal(result.cards[0].area_sqm, 88);
  assert.equal(result.cards[1].title, "Database-only approved listing");
  assert.equal(result.cards[1].path, "/bg/imoti/db-only-listing");
  assert.equal(result.cards[1].price_eur, 950);
  assert.equal(result.cards[1].bedrooms, 3);
});


test("public HTML and API retain unchecked wishes through filter edits and navigation", async () => {
  const words = "Apartment in Sandanski under 150000 with step-free access";
  const search = { ...searchConfig(async () => response({ found: 1, hits: [{ document: hit }] })), naturalLanguageEnabled: true };
  const routerConfig = { ...appRouterConfigFromEnv({ NODE_ENV: "test", ...approvedPublicSeedFixtureEnv() }), search };
  const params = new URLSearchParams({ locale: "en", nl: words, price_max: "180000" });
  const apiResponse = await renderAppApiResponse(new Request(`https://example.test/api/search?${params}`), { config: apiConfig(search) });
  const api = await apiResponse.json();
  const page = await renderAppSearchRoute({ pathname: "/en/search", url: `https://example.test/en/search?${params}`, config: routerConfig });
  assert.equal(apiResponse.status, 200);
  assert.equal(page.status, 200);
  assert.equal(api.search.intent.price_max, 180000);
  assert.deepEqual(page.rendered.search.natural_language, api.search.natural_language);
  assert.match(page.html, /data-search-interpretation="true"/);
  assert.ok(page.html.includes(words));
  assert.match(page.html, /Other wishes in your request have not been checked/);
  assert.match(page.html, /name="nl_context"/);
  assert.doesNotMatch(page.html, /name="nl"/);
  assert.match(page.html, /nl_context=/);

  const editedParams = new URLSearchParams({ locale: "en", nl_context: words, property_family: "house", price_max: "" });
  const edited = await renderAppSearchRoute({ pathname: "/en/search", url: `https://example.test/en/search?${editedParams}`, config: routerConfig });
  assert.equal(edited.status, 200);
  assert.equal(edited.rendered.search.intent.price_max, null);
  assert.deepEqual(edited.rendered.search.intent.property_families, ["house"]);
  assert.equal(edited.rendered.search.query, "");
  assert.ok(edited.html.includes(words));
});

test("retained query text is escaped and supports RTL without being interpreted", async () => {
  const words = '<img src=x onerror="alert(1)"> דירה שקטה';
  const search = searchConfig(async () => response({ found: 1, hits: [{ document: hit }] }));
  const params = new URLSearchParams({ locale: "he", nl_context: words });
  const page = await renderAppSearchRoute({ pathname: "/he/search", url: `https://example.test/he/search?${params}`, config: { ...appRouterConfigFromEnv({ NODE_ENV: "test", ...approvedPublicSeedFixtureEnv() }), search } });
  assert.equal(page.status, 200);
  assert.match(page.html, /dir="rtl"/);
  assert.match(page.html, /dir="auto"/);
  assert.match(page.html, /&lt;img/);
  assert.doesNotMatch(page.html, /<img src=x/);
  assert.equal(page.rendered.search.query, "");
  assert.equal(page.rendered.search.natural_language.original_query, words);
});


test("Node HTML and API use the same retained interpretation after explicit edits", async () => {
  const words = "Apartment in Sandanski under 150000 with step-free access";
  const eventLedgerPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-nl-events-`)}/events.jsonl`;
  const app = createHttpApp({ ...approvedPublicSeedFixtureOptions(), naturalLanguageSearchEnabled: true, eventLedgerPath });
  const params = new URLSearchParams({ locale: "bg", nl: words, price_max: "180000" });
  const api = await dispatchHttp(app, { url: `/api/search?${params}` });
  const page = await dispatchHttp(app, { url: `/bg/tarsene?${params}`, headers: { accept: "text/html" } });
  assert.equal(api.status, 200);
  assert.equal(page.status, 200);
  assert.equal(api.body.search.intent.price_max, 180000);
  assert.equal(api.body.search.natural_language.original_query, words);
  assert.match(page.body, /data-search-interpretation="true"/);
  assert.ok(page.body.includes(words));
  assert.match(page.body, /name="nl_context"/);
});

// The dropdown universe must come from the whole approved catalogue, not from
// the page of hits the engine returned: a sale-only page must still offer
// rent, and an empty answer must still offer every location.
const catalogFilterUniverse = (page) => {
  const options = page.search.controls.filter_options;
  return {
    offer_types: options.offer_types,
    locations: options.locations,
    property_subtypes: options.property_subtypes,
    bedrooms: options.bedrooms,
    applicable_filter_fields: page.search.controls.applicable_filter_fields,
  };
};
const saleOnlyHit = {
  ...hit,
  offer_type: "sale",
  property_family: "apartment",
  location_label: "Sandanski",
  bedrooms_count: 2,
  price_amount: 100000,
  price_currency: "EUR",
  price_on_request: false,
};
function postgresSearch(pages) {
  const intents = [];
  return {
    intents,
    search: {
      engine: "postgres",
      environment: "production",
      postgres: {
        queryImpl: async ({ intent }) => {
          intents.push(intent);
          const hits = intent.page_size === 1 ? [] : pages.shift() || [];
          return {
            engine: "postgres",
            total: hits.length,
            hits,
            page: intent.page,
            page_size: intent.page_size,
            target: "ms_realty_public_search_documents",
          };
        },
      },
    },
  };
}

test("Postgres pages and empty answers keep the approved catalogue as the filter universe", async () => {
  const catalog = catalogFilterUniverse(searchRuntimeListings(registry, seed, { localeCode: "bg" }));
  assert.deepEqual(catalog.offer_types, ["rent", "sale"]);
  assert.ok(catalog.locations.length > 1);

  const { search } = postgresSearch([[saleOnlyHit], []]);
  const saleOnly = await executePublicSearch({ registry, seed, params: new URLSearchParams("locale=bg&offer_type=sale"), search });
  assert.equal(saleOnly.result.search.total_matches, 1);
  assert.deepEqual(saleOnly.result.cards.map((card) => card.id), ["MS-00815"]);
  assert.deepEqual(catalogFilterUniverse(saleOnly.result), catalog);

  const empty = await executePublicSearch({ registry, seed, params: new URLSearchParams("locale=bg&price_max=1"), search });
  assert.equal(empty.result.search.total_matches, 0);
  assert.equal(empty.result.cards.length, 0);
  assert.equal(empty.result.search.filters.price_max, 1);
  assert.deepEqual(catalogFilterUniverse(empty.result), catalog);
});

test("Node HTML and API keep the catalogue filter universe on Postgres pages and empty answers", async () => {
  const { search, intents } = postgresSearch([[saleOnlyHit], [saleOnlyHit], [], []]);
  const app = createHttpApp({ ...approvedPublicSeedFixtureOptions(), search });
  const catalog = catalogFilterUniverse(searchRuntimeListings(registry, approvedPublicSeedFixtureOptions().seed, { localeCode: "bg" }));
  assert.deepEqual(catalog.offer_types, ["rent", "sale"]);

  const saleApi = await dispatchHttp(app, { url: "/api/search?locale=bg&offer_type=sale" });
  const salePage = await dispatchHttp(app, { url: "/bg/tarsene?offer_type=sale", headers: { accept: "text/html" } });
  const emptyApi = await dispatchHttp(app, { url: "/api/search?locale=bg&price_max=1" });
  const emptyPage = await dispatchHttp(app, { url: "/bg/tarsene?price_max=1", headers: { accept: "text/html" } });

  assert.equal(saleApi.status, 200);
  assert.equal(saleApi.body.search.total_matches, 1);
  assert.deepEqual(saleApi.body.cards.map((card) => card.id), ["MS-00815"]);
  assert.deepEqual(catalogFilterUniverse(saleApi.body), catalog);
  assert.equal(salePage.status, 200);
  assert.match(salePage.body, /value="rent"/);

  assert.equal(emptyApi.status, 200);
  assert.equal(emptyApi.body.search.total_matches, 0);
  assert.equal(emptyApi.body.search.filters.price_max, 1);
  assert.equal(emptyApi.body.search.filters.offer_type, undefined);
  assert.deepEqual(catalogFilterUniverse(emptyApi.body), catalog);
  assert.equal(emptyPage.status, 200);
  assert.match(emptyPage.body, /value="rent"/);
  // The empty answers also trigger one count-only widen query each.
  assert.deepEqual(intents.filter((intent) => intent.page_size !== 1).map((intent) => intent.offer_type), ["sale", "sale", null, null]);
});

// The filter universe is the approved public catalogue as the existing
// publication boundary (publicSeedFor) and active-status rule already define
// it: a listing the operator never approved, and a sold one, contribute no
// location or subtype, while an approved rental keeps rent on a sale-only or
// empty Postgres page. Districts come from the static geography catalogue and
// are deliberately not asserted here.
function seedWithExcludedListings() {
  const seed = approvedPublicSeedFixture();
  const approved = seed.records.find((record) => record.collection === "listings" && record.workflow?.publish_approved === true);
  const property = seed.properties.find((row) => row.id === approved.property);
  const variant = (id, facts, extra = {}) => ({
    ...approved,
    id,
    routing: { ...approved.routing, target_path: `/bg/imoti/${id}` },
    facts: { ...approved.facts, id, ...facts },
    ...extra,
  });
  const records = [
    ...seed.records,
    variant("MS-TEST-UNAPPROVED", { location: "Unapproved Town" }, { property: "property-MS-TEST-UNAPPROVED", workflow: { ...approved.workflow, publish_approved: false } }),
    variant("MS-TEST-SOLD", { location: "Sold Town", listing_status: "sold" }),
    variant("MS-TEST-RENT", { location: "Rental Town", offer_type: "rent" }),
  ];
  const properties = [...seed.properties, { ...property, id: "property-MS-TEST-UNAPPROVED", property_subtype: "unapproved_subtype" }];
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-excluded-listings-`);
  const cmsSeedPath = `${directory}/cms-seed.json`;
  fs.writeFileSync(cmsSeedPath, `${JSON.stringify({ ...seed, records, properties })}\n`);
  return { cmsSeedPath, seed: { ...seed, records, properties } };
}
function assertCatalogueBoundary(page, label) {
  const options = page.search.controls.filter_options;
  assert.ok(options.locations.includes("Rental Town"), `${label}: approved rental location present`);
  assert.ok(options.offer_types.includes("rent"), `${label}: rent offered`);
  assert.ok(!options.locations.includes("Unapproved Town"), `${label}: unapproved location absent`);
  assert.ok(!options.locations.includes("Sold Town"), `${label}: sold location absent`);
  assert.ok(!options.property_subtypes.includes("unapproved_subtype"), `${label}: unapproved subtype absent`);
}

test("facets on Postgres pages follow the publication boundary, not the hits, on every runtime path", async () => {
  const { cmsSeedPath, seed: excludedSeed } = seedWithExcludedListings();
  const env = { ...approvedPublicSeedFixtureEnv(), MS_REALTY_CMS_SEED_PATH: cmsSeedPath };
  const pages = () => postgresSearch([[saleOnlyHit], [saleOnlyHit], [], []]).search;

  const nextSearch = pages();
  const nextConfig = { ...appRouterConfigFromEnv({ NODE_ENV: "test", ...env }), search: nextSearch };
  const nextApi = { ...apiConfig(nextSearch), ...appApiConfigFromEnv({ NODE_ENV: "test", ...env }), search: nextSearch };
  for (const [label, query] of [["sale-only", "offer_type=sale"], ["empty", "price_max=1"]]) {
    const html = await renderAppSearchRoute({ pathname: "/bg/tarsene", url: `https://example.test/bg/tarsene?${query}`, config: nextConfig });
    const api = await (await renderAppApiResponse(new Request(`https://example.test/api/search?locale=bg&${query}`), { config: nextApi })).json();
    assert.equal(html.status, 200);
    assertCatalogueBoundary(html.rendered, `next html ${label}`);
    assertCatalogueBoundary(api, `next api ${label}`);
    assert.equal(api.search.total_matches, label === "empty" ? 0 : 1, `next api ${label}: Postgres total kept`);
    assert.ok(!html.html.includes("Unapproved Town") && !html.html.includes("Sold Town"), `next html ${label}: excluded towns absent from markup`);
  }

  const app = createHttpApp({ ...approvedPublicSeedFixtureOptions(), seed: excludedSeed, search: pages() });
  for (const [label, query] of [["sale-only", "offer_type=sale"], ["empty", "price_max=1"]]) {
    const api = await dispatchHttp(app, { url: `/api/search?locale=bg&${query}` });
    const html = await dispatchHttp(app, { url: `/bg/tarsene?${query}`, headers: { accept: "text/html" } });
    assert.equal(api.status, 200);
    assert.equal(html.status, 200);
    assertCatalogueBoundary(api.body, `node api ${label}`);
    assert.ok(html.body.includes('value="rent"'), `node html ${label}: approved rental offered`);
    assert.ok(!html.body.includes("Unapproved Town") && !html.body.includes("Sold Town"), `node html ${label}: excluded towns absent from markup`);
  }
});

// The engine locale list no longer comes from a rendered page, so the
// resolver must still give a disabled or unknown locale the public fallback
// and keep the source locale behind any foreign locale without active source
// listings.
test("engine locale codes keep fallback and source-locale behaviour without a rendered page", async () => {
  const bg = registry.source_locale;
  const heFallback = registry.locales.find((locale) => locale.code === "he").fallback_locale;
  assert.equal(heFallback, "en");
  assert.deepEqual(engineLocaleCodes(seed, registry, "bg"), ["bg"]);
  // No active he-source listing exists, so the engine searches the public
  // fallback locale first and the source locale behind it.
  const he = engineLocaleCodes(seed, registry, "he");
  assert.deepEqual(he, [heFallback, bg]);
  assert.deepEqual(engineLocaleCodes(seed, registry, "xx"), engineLocaleCodes(seed, registry, bg));
  assert.deepEqual(engineLocaleCodes({ records: [] }, registry, "bg"), [bg]);

  const localeCodes = [];
  const { result } = await executePublicSearch({
    registry,
    seed,
    params: new URLSearchParams("locale=he"),
    search: {
      engine: "postgres",
      environment: "production",
      postgres: {
        queryImpl: async ({ intent, localeCodes: codes }) => {
          localeCodes.push(codes);
          return { engine: "postgres", total: 0, hits: [], page: intent.page, page_size: intent.page_size, target: "ms_realty_public_search_documents" };
        },
      },
    },
  });
  assert.deepEqual(localeCodes[0], he);
  assert.equal(result.locale, "he");
  assert.equal(result.search.fallback.locale, heFallback);
});

test("search assistance is one compact toolbar entry, hidden until its handlers load, on Next and Node HTML", async () => {
  const { search } = postgresSearch([[saleOnlyHit], [saleOnlyHit]]);
  const next = await renderAppSearchRoute({
    pathname: "/bg/tarsene",
    url: "https://example.test/bg/tarsene?offer_type=sale",
    config: { ...appRouterConfigFromEnv({ NODE_ENV: "test", ...approvedPublicSeedFixtureEnv() }), search },
  });
  const node = await dispatchHttp(createHttpApp({ ...approvedPublicSeedFixtureOptions(), search }), { url: "/bg/tarsene?offer_type=sale", headers: { accept: "text/html" } });
  for (const [label, html] of [["next", next.html], ["node", node.body]]) {
    const toolbar = html.slice(html.indexOf('class="sr-toolbar"'), html.indexOf("</form>", html.indexOf('data-search-toolbar-form="true"')));
    assert.equal((toolbar.match(/data-search-help="true"/g) || []).length, 1, `${label}: one entry`);
    assert.match(toolbar, /<details class="sr-help" data-search-help="true" hidden>/, `${label}: entry stays hidden until enhanced`);
    assert.equal((toolbar.match(/data-search-assistant-open/g) || []).length, 1, `${label}: assistant action inside the entry`);
    assert.equal((toolbar.match(/data-evidence-open="alternatives"/g) || []).length, 1, `${label}: alternatives action inside the entry`);
    assert.ok(toolbar.indexOf('class="sr-results__head"') < toolbar.indexOf("data-search-help"), `${label}: the results heading comes first`);
    assert.match(toolbar, /aria-label="Още начини за търсене"/, `${label}: localized accessible name`);
  }
});

// A database page that is empty must still name the typed range to widen,
// and the count it prints must be the engine's own count for that widening.
test("empty Postgres pages name the range to widen with the engine's count on every path", async () => {
  const intents = [];
  const search = {
    engine: "postgres",
    environment: "production",
    postgres: {
      queryImpl: async ({ intent }) => {
        intents.push(intent);
        const total = intent.price_max === 1 ? 0 : intent.bedrooms_min === 9 ? 0 : 7;
        return { engine: "postgres", total, hits: total ? [saleOnlyHit] : [], page: intent.page, page_size: intent.page_size, target: "ms_realty_public_search_documents" };
      },
    },
  };
  const { result } = await executePublicSearch({ registry, seed, params: new URLSearchParams("locale=bg&price_max=1&bedrooms_min=9&offer_type=sale"), search });
  assert.equal(result.search.total_matches, 0);
  // The two typed pairs each get one count-only query with that pair dropped.
  assert.equal(intents.length, 3);
  assert.deepEqual(intents.slice(1).map((intent) => [intent.page_size, intent.offer_type, intent.price_max ?? null, intent.bedrooms_min ?? null]), [[1, "sale", null, 9], [1, "sale", 1, null]]);
  assert.deepEqual(result.search.controls.widen_ranges, []);

  intents.length = 0;
  const single = await executePublicSearch({ registry, seed, params: new URLSearchParams("locale=bg&price_max=1&offer_type=sale"), search });
  assert.deepEqual(single.result.search.controls.widen_ranges, [{ fields: ["price_min", "price_max"], matches: 7 }]);
  assert.equal(intents.length, 2);

  const nonEmpty = await executePublicSearch({ registry, seed, params: new URLSearchParams("locale=bg&price_max=500000"), search });
  assert.equal(nonEmpty.engineResult.total, 7);
  assert.deepEqual(nonEmpty.result.search.controls.widen_ranges, []);

  const app = createHttpApp({ ...approvedPublicSeedFixtureOptions(), search });
  const api = await dispatchHttp(app, { url: "/api/search?locale=bg&price_max=1" });
  const html = await dispatchHttp(app, { url: "/bg/tarsene?price_max=1", headers: { accept: "text/html" } });
  assert.deepEqual(api.body.search.controls.widen_ranges, [{ fields: ["price_min", "price_max"], matches: 7 }]);
  assert.match(html.body, /data-search-widen="true"/);
  assert.match(html.body, /Цена \(EUR\): 7 съвпадения/);
});
