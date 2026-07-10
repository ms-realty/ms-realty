import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";

const hit = {
  id: "MS-CRAWL-0001:bg",
  source_listing_id: "MS-CRAWL-0001",
  locale: "bg",
  locale_path: "/bg/imoti/MS-CRAWL-0001",
  title: "Reviewed Sandanski listing",
};

async function withSearchServer(fn, { typesenseStatus = 200, meilisearchStatus = 200 } = {}) {
  const calls = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      calls.push({ method: request.method, url: request.url, body });
      response.setHeader("content-type", "application/json");
      if (request.url.includes("/documents/search?")) {
        response.statusCode = typesenseStatus;
        response.end(JSON.stringify({ found: 1, hits: [{ document: hit }] }));
        return;
      }
      response.statusCode = meilisearchStatus;
      response.end(JSON.stringify({ estimatedTotalHits: 1, hits: [hit] }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await fn(`http://${address.address}:${address.port}`, calls);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function searchConfig({ typesenseUrl = "", meiliUrl = "" } = {}) {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-app-api-search-`);
  const eventLedgerPath = `${dir}/events.jsonl`;
  const listingEditLedgerPath = `${dir}/listing-edits.jsonl`;
  const translationLedgerPath = `${dir}/translations.jsonl`;
  fs.writeFileSync(listingEditLedgerPath, "");
  fs.writeFileSync(translationLedgerPath, "");
  return appApiConfigFromEnv({
    MS_REALTY_EVENT_LEDGER_PATH: eventLedgerPath,
    MS_REALTY_LISTING_EDIT_LEDGER_PATH: listingEditLedgerPath,
    MS_REALTY_TRANSLATION_LEDGER_PATH: translationLedgerPath,
    TYPESENSE_URL: typesenseUrl,
    TYPESENSE_API_KEY: typesenseUrl ? "typesense-test" : "",
    TYPESENSE_COLLECTION: "ms_realty_listings",
    MEILI_URL: meiliUrl,
    MEILI_API_KEY: meiliUrl ? "meili-test" : "",
    MEILI_INDEX: "ms_realty_listings",
  });
}

async function searchResponse(config, query) {
  const response = await renderAppApiResponse(new Request(`https://example.test/api/search?${query}`), { config });
  return { response, body: await response.json() };
}

test("public API search uses Typesense results and keeps local locale and filter semantics", async () => {
  await withSearchServer(async (baseUrl, calls) => {
    const config = searchConfig({ typesenseUrl: baseUrl, meiliUrl: baseUrl });
    const { response, body } = await searchResponse(config, "locale=he&q=Sandanski&property_type=commercial");

    assert.equal(response.status, 200);
    assert.deepEqual(body.search.engines, ["typesense"]);
    assert.equal(body.search.backend.engine, "typesense");
    assert.equal(body.search.backend.mode, "primary");
    assert.deepEqual(body.search.backend.locale_codes, ["en", "bg"]);
    assert.equal(body.search.backend.indexed_matches, 1);
    assert.deepEqual(body.cards.map((card) => card.id), ["MS-CRAWL-0001"]);
    assert.equal(calls.length, 1);
    assert.equal(new URL(`http://search.test${calls[0].url}`).searchParams.get("filter_by").includes("locale:=`en` || locale:=`bg`"), true);
    assert.equal(JSON.stringify(body).includes("typesense-test"), false);

    const filtered = await searchResponse(config, "locale=he&q=Sandanski&property_type=apartment");
    assert.equal(filtered.response.status, 200);
    assert.deepEqual(filtered.body.search.engines, ["typesense"]);
    assert.equal(filtered.body.search.total_matches, 0);
    assert.deepEqual(filtered.body.cards, []);
  });
});

test("public API search falls back to Meilisearch only after Typesense is unavailable", async () => {
  await withSearchServer(
    async (baseUrl, calls) => {
      const { response, body } = await searchResponse(searchConfig({ typesenseUrl: baseUrl, meiliUrl: baseUrl }), "locale=he&q=Sandanski");

      assert.equal(response.status, 200);
      assert.deepEqual(body.search.engines, ["meilisearch"]);
      assert.equal(body.search.backend.mode, "fallback");
      assert.deepEqual(body.search.backend.unavailable_engines, ["typesense"]);
      assert.equal(calls.length, 2);
      assert.equal(calls[0].url.includes("/documents/search?"), true);
      assert.equal(calls[1].url, "/indexes/ms_realty_listings/search");
    },
    { typesenseStatus: 503 },
  );
});

test("public API search labels local data as a seed fallback only when both engines are unavailable", async () => {
  const { response, body } = await searchResponse(searchConfig(), "locale=he&q=Sandanski");

  assert.equal(response.status, 200);
  assert.deepEqual(body.search.engines, ["seed_fallback"]);
  assert.equal(body.search.backend.mode, "local_fallback");
  assert.deepEqual(body.search.backend.unavailable_engines, ["typesense", "meilisearch"]);
  assert.ok(body.search.total_matches > 0);
});
