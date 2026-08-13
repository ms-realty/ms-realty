import test from "node:test";
import assert from "node:assert/strict";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { productionServerConfig } from "../server.mjs";
import { approvedPublicSeedFixtureOptions } from "./approved-public-seed.fixture.mjs";

test("production Node search fails closed for API and public search routes without a selected engine", async () => {
  const app = createHttpApp({ search: { environment: "production" } });

  const api = await dispatchHttp(app, { url: "/api/search?locale=he&q=Sandanski" });
  assert.equal(api.status, 503);
  assert.deepEqual(api.body, { kind: "search_unavailable", message: "Search is temporarily unavailable" });

  // The human-facing search page keeps the 503 but renders a branded fallback
  // with working contact channels instead of raw JSON.
  const page = await dispatchHttp(app, { url: "/he/search?format=html&q=Sandanski" });
  assert.equal(page.status, 503);
  assert.match(page.headers["content-type"], /text\/html/);
  assert.match(page.body, /data-kind="search-unavailable"/);
  assert.match(page.body, /tel:\+359879696870/);
});

test("production Node search renders only IDs returned by the selected engine", async () => {
  const calls = [];
  const app = createHttpApp({
    ...approvedPublicSeedFixtureOptions(),
    search: {
      environment: "production",
      engine: "typesense",
      typesense: {
        baseUrl: "https://search.makler-realty.com",
        apiKey: "typesense-test",
        collectionName: "ms_realty_listings",
        lookupImpl: async () => [{ address: "1.1.1.1", family: 4 }],
      },
      fetchImpl: async (url, options) => {
        calls.push({ url: String(url), options });
        return {
          status: 200,
          json: async () => ({
            found: 1,
            hits: [
              {
                document: {
                  id: "MS-CRAWL-0001:bg",
                  source_listing_id: "MS-CRAWL-0001",
                  locale: "bg",
                  locale_path: "/bg/imoti/MS-CRAWL-0001",
                  title: "Reviewed Sandanski listing",
                },
              },
            ],
          }),
        };
      },
    },
  });

  const response = await dispatchHttp(app, { url: "/api/search?locale=he&q=Sandanski" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.search.engines, ["typesense"]);
  assert.equal(response.body.search.backend.engine, "typesense");
  assert.deepEqual(response.body.cards.map((card) => card.id), ["MS-CRAWL-0001"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.startsWith("https://search.makler-realty.com/collections/ms_realty_listings/documents/search?"), true);
});

test("direct HTTP Postgres search preserves database totals and requested page size", async () => {
  const intents = [];
  const app = createHttpApp({
    ...approvedPublicSeedFixtureOptions(),
    search: {
      environment: "production",
      engine: "postgres",
      postgres: {
        queryImpl: async ({ intent }) => {
          intents.push(intent);
          return {
            engine: "postgres",
            total: 23,
            hits: [
              {
                id: "MS-CRAWL-0001:bg",
                source_listing_id: "MS-CRAWL-0001",
                locale: "bg",
                locale_path: "/bg/imoti/MS-CRAWL-0001",
                title: "Reviewed Sandanski listing",
              },
            ],
            page: intent.page,
            page_size: intent.page_size,
            target: "ms_realty_public_search_documents",
          };
        },
      },
    },
  });

  const response = await dispatchHttp(app, {
    url: "/api/search?locale=bg&page=3&page_size=7&listing_status=reserved",
  });
  assert.equal(response.status, 200);
  assert.equal(intents[0].page_size, 7);
  assert.equal(response.body.search.total_matches, 23);
  assert.equal(response.body.search.pagination.page, 3);
  assert.equal(response.body.search.pagination.per_page, 7);
  assert.equal(response.body.search.pagination.total_pages, 4);
});

test("production server ignores legacy search selection and binds Payload Postgres", () => {
  const env = {
    NODE_ENV: "production",
    MS_REALTY_SEARCH_ENGINE: "meilisearch",
    MEILI_URL: "https://meili.test",
    MEILI_API_KEY: "meili-test",
    MEILI_INDEX: "ms_realty_listings",
    DATABASE_URL: "postgres://payload:secret@db.ms-realty.bg:5432/ms_realty",
    PAYLOAD_SECRET: "payload-secret",
  };
  const config = productionServerConfig(env);

  assert.equal(config.search.environment, "production");
  assert.equal(config.search.engine, "postgres");
  assert.equal(config.search.postgres.env, env);
  assert.equal(config.search.meilisearch, undefined);
});
