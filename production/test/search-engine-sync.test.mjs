import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assertSearchEngineSyncReport,
  runSearchEngineSync,
  syncTypesense,
} from "../lib/search-engine-sync.mjs";
import { fromRoot } from "../lib/paths.mjs";

function fakeFetch(calls, statuses = []) {
  return async (url, options) => {
    const status = statuses.shift() || 202;
    calls.push({ url, options, body: options.body });
    return { ok: status >= 200 && status < 300, status };
  };
}

test("search engine sync posts existing fixtures to Typesense and Meilisearch", async () => {
  const calls = [];
  const report = await runSearchEngineSync({
    fetchImpl: fakeFetch(calls),
    typesense: { baseUrl: "http://typesense.local", apiKey: "type-key" },
    meilisearch: { baseUrl: "http://meili.local", apiKey: "meili-key" },
  });

  assert.equal(assertSearchEngineSyncReport(report), true);
  assert.deepEqual(report.summary.documents_per_engine, [167, 167]);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].url, "http://typesense.local/collections");
  assert.equal(calls[1].url, "http://typesense.local/collections/ms_realty_listings/documents/import?action=upsert");
  assert.equal(calls[2].url, "http://meili.local/indexes/ms_realty_listings/settings");
  assert.equal(calls[3].url, "http://meili.local/indexes/ms_realty_listings/documents?primaryKey=id");
  assert.equal(calls[1].options.headers["x-typesense-api-key"], "type-key");
  assert.equal(calls[3].options.headers.authorization, "Bearer meili-key");
  assert.match(calls[1].body, /MS-CRAWL-0001:bg/);
  assert.match(calls[3].body, /MS-CRAWL-0001:bg/);
});

test("Typesense sync accepts existing collection response before upsert import", async () => {
  const calls = [];
  const report = await syncTypesense({
    baseUrl: "http://typesense.local/",
    apiKey: "type-key",
    fetchImpl: fakeFetch(calls, [409, 201]),
  });

  assert.equal(report.documents, 167);
  assert.equal(report.operations[0].status, 409);
  assert.equal(report.operations[1].status, 201);
});

test("generated search sync smoke report is valid when present", () => {
  const file = fromRoot("production", "data", "search-engine-sync-smoke.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertSearchEngineSyncReport(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});
