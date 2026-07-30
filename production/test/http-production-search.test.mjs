import test from "node:test";
import assert from "node:assert/strict";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { productionServerConfig } from "../server.mjs";

test("production Node search fails closed for API and public search routes without a selected engine", async () => {
  const app = createHttpApp({ search: { environment: "production" } });

  for (const url of ["/api/search?locale=he&q=Sandanski", "/he/search?format=html&q=Sandanski"]) {
    const response = await dispatchHttp(app, { url });
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { kind: "search_unavailable", message: "Search is temporarily unavailable" });
  }
});

test("production Node search renders only IDs returned by the selected engine", async () => {
  const calls = [];
  const app = createHttpApp({
    search: {
      environment: "production",
      engine: "typesense",
      typesense: { baseUrl: "https://typesense.test", apiKey: "typesense-test", collectionName: "ms_realty_listings" },
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
  assert.equal(calls[0].url.startsWith("https://typesense.test/collections/ms_realty_listings/documents/search?"), true);
});

test("production server passes the selected search engine configuration to the Node app", () => {
  const config = productionServerConfig({
    NODE_ENV: "production",
    MS_REALTY_SEARCH_ENGINE: "meilisearch",
    MEILI_URL: "https://meili.test",
    MEILI_API_KEY: "meili-test",
    MEILI_INDEX: "ms_realty_listings",
  });

  assert.equal(config.search.environment, "production");
  assert.equal(config.search.engine, "meilisearch");
  assert.deepEqual(config.search.meilisearch, {
    baseUrl: "https://meili.test",
    apiKey: "meili-test",
    indexName: "ms_realty_listings",
  });
});
