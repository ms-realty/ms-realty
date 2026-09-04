import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";
import { approvedPublicSeedFixtureEnv } from "./approved-public-seed.fixture.mjs";

const hit = {
  id: "MS-00815:bg",
  source_listing_id: "MS-00815",
  locale: "bg",
  locale_path: "/bg/imoti/MS-00815",
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

function searchConfig({ typesenseUrl = "", meiliUrl = "", naturalLanguageEnabled = false, engine = "", environment = "" } = {}) {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-app-api-search-`);
  const eventLedgerPath = `${dir}/events.jsonl`;
  const listingEditLedgerPath = `${dir}/listing-edits.jsonl`;
  const translationLedgerPath = `${dir}/translations.jsonl`;
  fs.writeFileSync(listingEditLedgerPath, "");
  fs.writeFileSync(translationLedgerPath, "");
  const config = appApiConfigFromEnv({
    MS_REALTY_EVENT_LEDGER_PATH: eventLedgerPath,
    MS_REALTY_LISTING_EDIT_LEDGER_PATH: listingEditLedgerPath,
    MS_REALTY_TRANSLATION_LEDGER_PATH: translationLedgerPath,
    ...approvedPublicSeedFixtureEnv(),
    TYPESENSE_URL: typesenseUrl,
    TYPESENSE_API_KEY: typesenseUrl ? "typesense-test" : "",
    TYPESENSE_COLLECTION: "ms_realty_listings",
    MEILI_URL: meiliUrl,
    MEILI_API_KEY: meiliUrl ? "meili-test" : "",
    MEILI_INDEX: "ms_realty_listings",
    MS_REALTY_SEARCH_ALLOW_PRIVATE_SERVICE_NETWORK: typesenseUrl || meiliUrl ? "true" : "",
    MS_REALTY_SEARCH_ENGINE: engine,
    NODE_ENV: environment,
    MS_REALTY_SEARCH_NL_INTENT_ENABLED: naturalLanguageEnabled ? "true" : "false",
  });
  // Production env wiring is Postgres-only. These compatibility tests inject a
  // legacy backend explicitly so the adapters remain testable without making
  // Cloudflare depend on either service.
  return { ...config, search: { ...config.search, engine: engine || undefined } };
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
    assert.deepEqual(body.cards.map((card) => card.id), ["MS-00815"]);
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

test("public API keeps engine-ranked typo hits without a second local text filter", async () => {
  await withSearchServer(async (baseUrl) => {
    const { response, body } = await searchResponse(searchConfig({ typesenseUrl: baseUrl }), "locale=bg&q=Sndanski");

    assert.equal(response.status, 200);
    assert.deepEqual(body.search.engines, ["typesense"]);
    assert.equal(body.search.query, "Sndanski");
    assert.deepEqual(body.cards.map((card) => card.id), ["MS-00815"]);
  });
});

test("public API search falls back to Meilisearch only after Typesense is unavailable", async () => {
  await withSearchServer(
    async (baseUrl, calls) => {
      const { response, body } = await searchResponse(searchConfig({ typesenseUrl: baseUrl, meiliUrl: baseUrl }), "locale=he&q=Sandanski");

      assert.equal(response.status, 200);
      assert.deepEqual(body.search.engines, ["meilisearch"]);
      assert.equal(body.search.backend.mode, "fallback");
      assert.deepEqual(body.search.backend.unavailable_engines, ["postgres", "typesense"]);
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
  assert.deepEqual(body.search.backend.unavailable_engines, ["postgres", "typesense", "meilisearch"]);
  assert.ok(body.search.total_matches > 0);
});

test("production API search fails closed instead of serving the seed fixture", async () => {
  const { response, body } = await searchResponse(searchConfig({ environment: "production" }), "locale=he&q=Sandanski");

  assert.equal(response.status, 503);
  assert.equal(body.kind, "search_unavailable");
  assert.equal(body.search, undefined);
});

test("successful production API search relies on observability without appending file analytics", async () => {
  const config = searchConfig({ environment: "production", engine: "postgres" });
  config.search.postgres.queryImpl = async ({ intent, target }) => ({
    engine: "postgres",
    total: 1,
    hits: [hit],
    page: intent.page,
    page_size: intent.page_size,
    target,
  });

  const { response, body } = await searchResponse(config, "locale=bg&q=Sandanski");

  assert.equal(response.status, 200);
  assert.equal(body.search.backend.engine, "postgres");
  assert.equal(fs.existsSync(config.eventLedgerPath), false);
});

test("public API search preserves requested sorting and pagination in seed fallback mode", async () => {
  const first = await searchResponse(searchConfig(), "locale=bg&q=Sandanski&sort=price_desc&page=1");
  const second = await searchResponse(searchConfig(), "locale=bg&q=Sandanski&sort=price_desc&page=2");

  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(first.body.search.sort, "price_desc");
  assert.equal(second.body.search.pagination.page, 2);
  assert.equal(second.body.search.pagination.has_previous, true);
  assert.equal(first.body.cards.some((card) => second.body.cards.some((candidate) => candidate.id === card.id)), false);
  const priced = first.body.cards.map((card) => Number(card.price_eur)).filter(Number.isFinite);
  assert.deepEqual(priced, [...priced].sort((left, right) => right - left));
});

test("public API search exposes the canonical intent and returns bad requests for invalid filters", async () => {
  const enabled = await searchResponse(
    searchConfig({ naturalLanguageEnabled: true }),
    "locale=bg&nl=Find%20MS-CRAWL-0114%20in%20Sandanski",
  );

  assert.equal(enabled.response.status, 200);
  assert.equal(enabled.body.search.intent.schema_version, 1);
  assert.equal(enabled.body.search.intent.exact_reference, "MS-CRAWL-0114");
  assert.deepEqual(enabled.body.search.natural_language, { enabled: true, mode: "exact_reference" });

  const invalid = await searchResponse(searchConfig(), "locale=bg&unverified_filter=1");
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.kind, "bad_request");
  assert.match(invalid.body.message, /unsupported field: unverified_filter/);
});
