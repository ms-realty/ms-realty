import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSearchEngineEvidenceConsistency,
  assertSearchEngineQueryReport,
  assertSearchEngineSyncReport,
  runSearchEngineQuerySmoke,
  runSearchEngineSync,
} from "../lib/search-engine-sync.mjs";

const PUBLIC_LOOKUP = async () => [{ address: "93.184.216.34", family: 4 }];
const CONFIG = {
  typesense: { baseUrl: "https://ms-realty-typesense.workers.dev", apiKey: "sync-key", lookupImpl: PUBLIC_LOOKUP },
  meilisearch: { baseUrl: "https://ms-realty-meilisearch.workers.dev", apiKey: "sync-key", lookupImpl: PUBLIC_LOOKUP },
};

function projection(documents = []) {
  return {
    schema_version: 1,
    documents,
    summary: { input_rows: documents.length, projected_documents: documents.length, skipped_rows: 0 },
    source: {
      kind: "payload_postgres",
      authoritative: true,
      listing_rows: documents.length,
      eligible_translation_rows: documents.length,
      projected_documents: documents.length,
      locale_codes: [...new Set(documents.map((document) => document.locale))],
      digest: documents.length ? "a".repeat(64) : "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
  };
}

const DOCUMENT = {
  id: "MS-CURRENT-0001:bg",
  source_listing_id: "MS-CURRENT-0001",
  listing_reference: "MS-CURRENT-0001",
  locale: "bg",
  locale_path: "/bg/imoti/MS-CURRENT-0001",
  title: "Current approved listing",
  publication_state: "published",
  listing_status: "available",
  translation_human_approved: true,
  locale_indexable: true,
  translation_indexable: true,
  search_text: "Current approved listing",
};

test("live search sync accepts a zero-document authoritative Payload projection without fixture imports", async () => {
  const calls = [];
  const report = await runSearchEngineSync({
    ...CONFIG,
    projection: projection(),
    generatedAt: "2026-08-11T08:30:00.000Z",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response("", { status: url.includes("/collections") ? 201 : 202 });
    },
  });

  assert.equal(assertSearchEngineSyncReport(report), true);
  assert.equal(report.evidence_scope, "live");
  assert.equal(report.source.kind, "payload_postgres");
  assert.deepEqual(report.summary.documents_per_engine, [0, 0]);
  assert.equal(report.summary.total_operations, 2);
  assert.deepEqual(calls.map(({ url }) => new URL(url).pathname), [
    "/collections",
    "/indexes/ms_realty_listings/settings",
  ]);
});

test("live search sync sends only the supplied Payload projection", async () => {
  const calls = [];
  const report = await runSearchEngineSync({
    ...CONFIG,
    projection: projection([DOCUMENT]),
    generatedAt: "2026-08-11T08:30:00.000Z",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response("", { status: url.endsWith("/collections") ? 201 : 202 });
    },
  });
  assert.equal(assertSearchEngineSyncReport(report), true);
  assert.deepEqual(report.summary.documents_per_engine, [1, 1]);
  assert.equal(calls.length, 4);
  assert.match(String(calls[1].options.body), /MS-CURRENT-0001:bg/);
  assert.match(String(calls[3].options.body), /MS-CURRENT-0001:bg/);
  assert.doesNotMatch(String(calls[1].options.body), /MS-CRAWL-0001/);
});

test("live query evidence proves zero approved results without a hardcoded listing", async () => {
  const calls = [];
  const report = await runSearchEngineQuerySmoke({
    ...CONFIG,
    projection: projection(),
    generatedAt: "2026-08-11T08:31:00.000Z",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return url.includes("/collections/")
        ? new Response(JSON.stringify({ found: 0, hits: [] }), { status: 200, headers: { "content-type": "application/json" } })
        : new Response(JSON.stringify({ estimatedTotalHits: 0, hits: [] }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(assertSearchEngineQueryReport(report), true);
  assert.equal(report.evidence_scope, "live");
  assert.equal(report.expectation.projected_documents, 0);
  assert.equal(report.expectation.sample_document_id, null);
  assert.equal(report.summary.total_hits, 0);
  assert.ok(calls.every(({ url, options }) => !`${url} ${options.body || ""}`.includes("MS-CRAWL-0001")));
});

test("live query evidence uses the first current Payload document as its dynamic sample", async () => {
  const report = await runSearchEngineQuerySmoke({
    ...CONFIG,
    projection: projection([DOCUMENT]),
    generatedAt: "2026-08-11T08:31:00.000Z",
    fetchImpl: async (url) =>
      url.includes("/collections/")
        ? new Response(JSON.stringify({ found: 1, hits: [{ document: DOCUMENT }] }), { status: 200, headers: { "content-type": "application/json" } })
        : new Response(JSON.stringify({ estimatedTotalHits: 1, hits: [DOCUMENT] }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  assert.equal(assertSearchEngineQueryReport(report), true);
  assert.equal(report.expectation.sample_document_id, DOCUMENT.id);
  assert.deepEqual(report.summary.first_hit_ids, [DOCUMENT.id, DOCUMENT.id]);
});

test("sync and query launch evidence must describe the same Payload snapshot", async () => {
  const sync = await runSearchEngineSync({
    ...CONFIG,
    projection: projection(),
    fetchImpl: async (url) => new Response("", { status: url.includes("/collections") ? 201 : 202 }),
  });
  const query = await runSearchEngineQuerySmoke({
    ...CONFIG,
    projection: projection(),
    fetchImpl: async (url) =>
      url.includes("/collections/")
        ? new Response(JSON.stringify({ found: 0, hits: [] }), { status: 200, headers: { "content-type": "application/json" } })
        : new Response(JSON.stringify({ estimatedTotalHits: 0, hits: [] }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  assert.equal(assertSearchEngineEvidenceConsistency(sync, query), true);
  assert.throws(
    () => assertSearchEngineEvidenceConsistency(sync, { ...query, source: { ...query.source, digest: "b".repeat(64) } }),
    /same Payload projection/,
  );
});
