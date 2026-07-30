import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import {
  assertSearchEngineQueryReport,
  assertSearchEngineSyncReport,
  approvedSearchSchema,
  buildApprovedSearchProjection,
  createSearchRebuildPlan,
  createSearchRollbackPlan,
  enqueueSearchOutbox,
  processSearchOutbox,
  queryPublicSearch,
  projectApprovedSearchDocument,
  readSearchOutbox,
  reconcileSearchOutbox,
  resetSearchOutbox,
  rollbackSearchEngineRebuild,
  runSearchEngineQuerySmoke,
  runSearchEngineRebuild,
  runSearchEngineSync,
  selectSearchRuntime,
  syncTypesense,
  typesenseFilterForIntent,
  versionedSearchTarget,
  writeApprovedSearchProjection,
} from "../lib/search-engine-sync.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { assertBenchmarkCorpusCompatibility, benchmarkPublicFilters, loadBenchmarkCorpus } from "../../search/benchmark-corpus.mjs";
import { bootstrapBenchmarkCorpus } from "../../search/bootstrap_benchmark_corpus.mjs";

function fakeFetch(calls, statuses = []) {
  return async (url, options) => {
    const status = statuses.shift() || 202;
    calls.push({ url, options, body: options.body });
    return { ok: status >= 200 && status < 300, status };
  };
}

function typesenseImportResults(documentCount, resultAt = {}) {
  return Array.from({ length: documentCount }, (_, index) => resultAt[index] ?? '{"success":true}').join("\n");
}

function runScript(script, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [fromRoot("production", "scripts", script)], {
      cwd: fromRoot(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function withSearchServer(fn, { typesenseStatus = 200, meilisearchStatus = 200 } = {}) {
  const calls = [];
  const hit = {
    id: "MS-CRAWL-0001:bg",
    source_listing_id: "MS-CRAWL-0001",
    locale: "bg",
    locale_path: "/bg/imoti/MS-CRAWL-0001",
    title: "Reviewed listing",
  };
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
      } else if (request.url.endsWith("/search")) {
        response.statusCode = meilisearchStatus;
        response.end(JSON.stringify({ estimatedTotalHits: 1, hits: [hit] }));
      } else {
        response.statusCode = 201;
        response.end(JSON.stringify({ ok: true }));
      }
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

test("public search queries Typesense first with only reviewed locale documents", async () => {
  await withSearchServer(async (baseUrl, calls) => {
    const result = await queryPublicSearch({
      typesense: { baseUrl, apiKey: "typesense-key" },
      meilisearch: { baseUrl, apiKey: "meili-key" },
      q: "Sandanski",
      localeCodes: ["bg"],
    });

    assert.equal(result.engine, "typesense");
    assert.equal(result.total, 1);
    assert.deepEqual(result.hits.map((hit) => hit.source_listing_id), ["MS-CRAWL-0001"]);
    assert.deepEqual(result.unavailable_engines, []);
    assert.equal(calls.length, 1);
    const request = new URL(`http://search.test${calls[0].url}`);
    assert.equal(request.pathname, "/collections/ms_realty_listings/documents/search");
    assert.equal(request.searchParams.get("q"), "Sandanski");
    assert.equal(request.searchParams.get("per_page"), "250");
    assert.match(request.searchParams.get("filter_by"), /translation_indexable:=true/);
    assert.match(request.searchParams.get("filter_by"), /translation_human_approved:=true/);
    assert.match(request.searchParams.get("filter_by"), /locale:=`bg`/);
  });
});

test("selected Typesense receives the validated exact and structured intent", async () => {
  await withSearchServer(async (baseUrl, calls) => {
    await queryPublicSearch({
      engine: "typesense",
      environment: "production",
      typesense: { baseUrl, apiKey: "typesense-key" },
      localeCodes: ["bg"],
      q: "ignored lexical query",
      intent: {
        locale: "bg",
        exact_reference: "MS-CRAWL-0001",
        property_family: "commercial",
        offer_type: "rent",
        price_max: 120000,
        map_bounds: "23,41,24,42",
      },
    });

    assert.equal(calls.length, 1);
    const request = new URL(`http://search.test${calls[0].url}`);
    assert.equal(request.searchParams.get("q"), "MS-CRAWL-0001");
    assert.equal(request.searchParams.get("num_typos"), "0");
    assert.equal(request.searchParams.get("drop_tokens_threshold"), "0");
    const filter = request.searchParams.get("filter_by");
    assert.match(filter, /publication_state:=published/);
    assert.match(filter, /listing_status:=available/);
    assert.match(filter, /property_family:=`commercial`/);
    assert.match(filter, /offer_type:=`rent`/);
    assert.match(filter, /price_amount:<=120000/);
    assert.match(filter, /public_longitude:>=23/);
    assert.match(filter, /listing_reference:=`MS-CRAWL-0001`/);
  });
});

test("public search uses Meilisearch only when Typesense is unavailable", async () => {
  await withSearchServer(
    async (baseUrl, calls) => {
      const result = await queryPublicSearch({
        typesense: { baseUrl, apiKey: "typesense-key" },
        meilisearch: { baseUrl, apiKey: "meili-key" },
        q: "Sandanski",
        localeCodes: ["bg", "ru"],
      });

      assert.equal(result.engine, "meilisearch");
      assert.deepEqual(result.unavailable_engines, ["typesense"]);
      assert.equal(calls.length, 2);
      assert.equal(calls[0].url.includes("/documents/search?"), true);
      assert.equal(calls[1].url, "/indexes/ms_realty_listings/search");
      const payload = JSON.parse(calls[1].body);
      assert.equal(payload.limit, 250);
      assert.match(payload.filter, /translation_indexable = true/);
      assert.match(payload.filter, /locale = "bg" OR locale = "ru"/);
    },
    { typesenseStatus: 503 },
  );
});

test("public search does not hide a configured Typesense failure behind a fallback", async () => {
  await withSearchServer(
    async (baseUrl, calls) => {
      await assert.rejects(
        () =>
          queryPublicSearch({
            typesense: { baseUrl, apiKey: "typesense-key" },
            meilisearch: { baseUrl, apiKey: "meili-key" },
            localeCodes: ["bg"],
          }),
        /returned 401/,
      );
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url.includes("/documents/search?"), true);
    },
    { typesenseStatus: 401 },
  );
});

test("public search labels an unconfigured backend as a local seed fallback", async () => {
  const result = await queryPublicSearch({ localeCodes: ["bg"] });
  assert.equal(result.engine, "seed_fallback");
  assert.equal(result.total, null);
  assert.deepEqual(result.unavailable_engines, ["typesense", "meilisearch"]);
});

test("approved search projection omits pending and private facts", () => {
  const listing = {
    id: "MS-2026-0001",
    listing_reference: "MS-2026-0001",
    locale: "bg",
    locale_path: "/bg/imoti/MS-2026-0001",
    title: "Verified apartment",
    description: "Approved public description.",
    property_family: "apartment",
    property_subtype: "studio",
    built_area_sqm: 71,
    bedrooms_count: 0,
    price_amount: 123000,
    internal_latitude: 41.566,
    internal_longitude: 23.278,
    public_latitude: 41.56,
    public_longitude: 23.27,
  };
  const approval = {
    publication_state: "published",
    translation_human_approved: true,
    locale_indexable: true,
    fact_verification: [
      { field: "property_family", state: "broker_verified" },
      { field: "property_subtype", state: "broker_verified" },
      { field: "built_area_sqm", state: "broker_verified" },
      { field: "bedrooms_count", state: "entered_pending_review" },
      { field: "price_amount", state: "entered_pending_review" },
      { field: "public_latitude", state: "broker_verified" },
      { field: "public_longitude", state: "entered_pending_review" },
    ],
  };

  const document = projectApprovedSearchDocument({ listing, approval });
  assert.equal(document.source_listing_id, "MS-2026-0001");
  assert.equal(document.listing_reference, "MS-2026-0001");
  assert.equal(document.property_family, "apartment");
  assert.equal(document.property_subtype, "studio");
  assert.equal(document.primary_area_sqm, 71);
  assert.equal(document.bedrooms_count, undefined);
  assert.equal(document.price_amount, undefined);
  assert.equal(document.internal_latitude, undefined);
  assert.equal(document.internal_longitude, undefined);
  assert.equal(document.public_latitude, undefined);
  assert.equal(document.public_longitude, undefined);

  const withCoordinates = projectApprovedSearchDocument({
    listing,
    approval: {
      ...approval,
      fact_verification: approval.fact_verification.map((entry) =>
        entry.field === "public_longitude" ? { ...entry, state: "broker_verified" } : entry,
      ),
    },
  });
  assert.equal(withCoordinates.public_latitude, 41.56);
  assert.equal(withCoordinates.public_longitude, 23.27);
  assert.equal(withCoordinates.internal_latitude, undefined);

  const projection = buildApprovedSearchProjection([
    { listing, approval },
    { listing: { ...listing, id: "MS-2026-0002" }, approval: { ...approval, publication_state: "draft" } },
  ]);
  assert.equal(projection.summary.input_rows, 2);
  assert.equal(projection.summary.projected_documents, 1);
  assert.equal(projection.documents[0].id, "MS-2026-0001:bg");
  const outDir = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-approved-search-`)}/data`;
  const outputs = writeApprovedSearchProjection(projection, outDir);
  const schema = JSON.parse(fs.readFileSync(outputs.schema, "utf8"));
  assert.ok(schema.fields.some((field) => field.name === "primary_area_sqm"));
  assert.equal(fs.readFileSync(outputs.typesense, "utf8").includes("internal_latitude"), false);
});

test("production search requires one configured engine and never falls back", async () => {
  assert.throws(
    () => selectSearchRuntime({ environment: "production", typesense: {}, meilisearch: {} }),
    /MS_REALTY_SEARCH_ENGINE is required in production/,
  );
  assert.deepEqual(
    selectSearchRuntime({
      engine: "typesense",
      environment: "production",
      typesense: { baseUrl: "http://typesense.local", apiKey: "type-key" },
      meilisearch: { baseUrl: "http://meili.local", apiKey: "meili-key" },
    }),
    { engine: "typesense", mode: "single" },
  );
  const calls = [];
  await assert.rejects(
    () =>
      queryPublicSearch({
        engine: "typesense",
        environment: "production",
        localeCodes: ["bg"],
        typesense: { baseUrl: "http://typesense.local", apiKey: "type-key" },
        meilisearch: { baseUrl: "http://meili.local", apiKey: "meili-key" },
        fetchImpl: async (url) => {
          calls.push(url);
          return { status: 503, async json() { return {}; } };
        },
      }),
    /Selected search engine typesense is unavailable/,
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0], /typesense\.local/);
});

test("search intent builds approved-only canonical filters with exact-reference precedence", async () => {
  const intent = {
    locale: "bg",
    exact_reference: "MS-2026-0001",
    property_family: "apartment",
    bedrooms_min: 1,
    price_max: 150000,
    sort: "price_asc",
  };
  const filter = typesenseFilterForIntent(intent, ["bg"]);
  assert.match(filter, /publication_state:=published/);
  assert.match(filter, /listing_status:=available/);
  assert.match(filter, /listing_reference:=`MS-2026-0001`/);
  assert.match(filter, /property_family:=`apartment`/);
  assert.match(filter, /bedrooms_count:>=1/);
  assert.match(filter, /price_amount:<=150000/);

  await withSearchServer(async (baseUrl, calls) => {
    await queryPublicSearch({
      engine: "typesense",
      environment: "test",
      typesense: { baseUrl, apiKey: "typesense-key" },
      meilisearch: { baseUrl, apiKey: "meili-key" },
      localeCodes: ["bg"],
      intent,
    });
    const request = new URL(`http://search.test${calls[0].url}`);
    assert.equal(request.searchParams.get("q"), "MS-2026-0001");
    assert.equal(request.searchParams.get("query_by"), "listing_reference,source_listing_id");
    assert.equal(request.searchParams.get("num_typos"), "0");
    assert.equal(request.searchParams.get("sort_by"), "price_amount:asc");
  });
});

test("versioned rebuild plans support deterministic alias rollback", () => {
  assert.equal(versionedSearchTarget("ms_realty_listings", "20260730a"), "ms_realty_listings__20260730a");
  const typesense = createSearchRebuildPlan({
    engine: "typesense",
    alias: "ms_realty_listings",
    version: "20260730a",
    previousVersion: "20260729z",
  });
  assert.deepEqual(typesense.activation, {
    method: "PUT",
    path: "/aliases/ms_realty_listings",
    body: { collection_name: "ms_realty_listings__20260730a" },
  });
  assert.deepEqual(createSearchRollbackPlan(typesense).activation.body, { collection_name: "ms_realty_listings__20260729z" });

  const meilisearch = createSearchRebuildPlan({ engine: "meilisearch", alias: "ms_realty_listings", version: "20260730a" });
  assert.deepEqual(meilisearch.activation, {
    method: "POST",
    path: "/swap-indexes",
    body: [{ indexes: ["ms_realty_listings", "ms_realty_listings__20260730a"] }],
  });
});

test("versioned Typesense rebuild imports a new target before alias activation and rollback", async () => {
  const calls = [];
  const statuses = [201, 202, 200, 200];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { status: statuses.shift() };
  };
  const rebuild = await runSearchEngineRebuild({
    engine: "typesense",
    alias: "ms_realty_listings",
    version: "20260730a",
    previousVersion: "20260729z",
    documents: [
      {
        id: "MS-2026-0001:bg",
        source_listing_id: "MS-2026-0001",
        listing_reference: "MS-2026-0001",
        locale: "bg",
        locale_path: "/bg/imoti/MS-2026-0001",
        title: "Verified apartment",
        publication_state: "published",
        translation_human_approved: true,
        locale_indexable: true,
        translation_indexable: true,
        search_text: "Verified apartment",
      },
    ],
    schema: approvedSearchSchema(),
    typesense: { baseUrl: "http://typesense.local", apiKey: "type-key" },
    fetchImpl,
    activate: true,
  });
  assert.equal(rebuild.sync.collection, "ms_realty_listings__20260730a");
  assert.equal(JSON.parse(calls[0].options.body).name, "ms_realty_listings__20260730a");
  assert.equal(calls[2].options.method, "PUT");
  assert.deepEqual(JSON.parse(calls[2].options.body), { collection_name: "ms_realty_listings__20260730a" });

  const rollback = await rollbackSearchEngineRebuild(rebuild, {
    typesense: { baseUrl: "http://typesense.local", apiKey: "type-key" },
    fetchImpl,
  });
  assert.equal(rollback.target, "ms_realty_listings__20260729z");
  assert.deepEqual(JSON.parse(calls[3].options.body), { collection_name: "ms_realty_listings__20260729z" });
});

test("search outbox is idempotent, retryable, and reconciles delete tombstones", async () => {
  const filePath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-search-outbox-`)}/outbox.jsonl`;
  resetSearchOutbox(filePath);
  const input = {
    type: "rebuild",
    idempotencyKey: "rebuild:20260730a",
    payload: { version: "20260730a", target: "ms_realty_listings__20260730a" },
  };
  const queued = enqueueSearchOutbox(input, { filePath, recordedAt: "2026-07-30T10:00:00Z" });
  const duplicate = enqueueSearchOutbox(input, { filePath, recordedAt: "2026-07-30T10:01:00Z" });
  assert.equal(queued.idempotent, false);
  assert.equal(duplicate.idempotent, true);

  const failed = await processSearchOutbox({
    filePath,
    dispatch: async () => {
      throw new Error("temporary engine outage");
    },
    recordedAt: "2026-07-30T10:02:00Z",
  });
  assert.equal(failed.results[0].status, "retry_scheduled");
  assert.equal(reconcileSearchOutbox(readSearchOutbox(filePath)).pending[0].attempts, 1);

  const delivered = [];
  const completed = await processSearchOutbox({
    filePath,
    dispatch: async (message) => delivered.push(message),
    recordedAt: "2026-07-30T10:03:00Z",
  });
  assert.equal(completed.results[0].status, "deleted");
  assert.equal(delivered[0].idempotency_key, "rebuild:20260730a");
  const reconciliation = reconcileSearchOutbox(readSearchOutbox(filePath));
  assert.deepEqual(reconciliation.pending, []);
  assert.equal(reconciliation.deleted[0].message_id, queued.message_id);
});

test("benchmark legacy corpus filters only fields declared by the checked-in 167-document schema", () => {
  const corpus = loadBenchmarkCorpus({ dataDir: fromRoot("search", "data"), corpusSchema: "legacy_fixture_v1" });
  assert.equal(corpus.document_count, 167);
  assert.deepEqual(corpus.filter_fields, [
    "translation_indexable",
    "translation_human_approved",
    "locale_is_indexable",
    "translation_status",
    "locale",
  ]);
  const filters = benchmarkPublicFilters({ corpusSchema: corpus.corpus_schema, locale: "bg" });
  assert.match(filters.typesense, /locale_is_indexable:=true/);
  assert.match(filters.typesense, /translation_status:=\[published,approved\]/);
  assert.doesNotMatch(filters.typesense, /publication_state|locale_indexable/);
  assert.match(filters.meilisearch, /translation_status = "published"/);
  assert.equal(filters.typesense_query_by, "title,description,search_text,location");
  assert.throws(
    () =>
      assertBenchmarkCorpusCompatibility({
        corpusSchema: corpus.corpus_schema,
        typesenseSchema: {
          ...corpus.typesenseSchema,
          fields: corpus.typesenseSchema.fields.filter((field) => field.name !== "locale_is_indexable"),
        },
        meilisearchSettings: corpus.meilisearchSettings,
        documents: corpus.documents,
      }),
    /locale_is_indexable/,
  );
});

test("benchmark bootstrap imports the declared corpus and waits for Meilisearch tasks", async () => {
  const corpus = loadBenchmarkCorpus({ dataDir: fromRoot("search", "data"), corpusSchema: "legacy_fixture_v1" });
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/collections/ms_realty_listings") || url.endsWith("/indexes/ms_realty_listings")) return { status: 404 };
    if (url.includes("/tasks/11") || url.includes("/tasks/12")) {
      return { status: 200, async json() { return { status: "succeeded" }; } };
    }
    if (url.includes("/settings")) return { status: 202, async json() { return { taskUid: 11 }; } };
    if (url.includes("/documents?primaryKey=meili_id")) return { status: 202, async json() { return { taskUid: 12 }; } };
    if (url.includes("/documents/import")) return { status: 200, async text() { return typesenseImportResults(corpus.document_count); } };
    return { status: 201, async json() { return {}; } };
  };
  const result = await bootstrapBenchmarkCorpus({
    dataDir: fromRoot("search", "data"),
    typesense: { baseUrl: "http://typesense.local", apiKey: "typesense-key" },
    meilisearch: { baseUrl: "http://meili.local", apiKey: "meili-key" },
    fetchImpl,
  });
  assert.equal(result.corpus.documents, 167);
  assert.deepEqual(result.meilisearch.tasks, [
    { task_uid: "11", status: "succeeded" },
    { task_uid: "12", status: "succeeded" },
  ]);
  assert.deepEqual(
    calls.map(({ url }) => new URL(url).pathname),
    [
      "/collections/ms_realty_listings",
      "/indexes/ms_realty_listings",
      "/collections",
      "/collections/ms_realty_listings/documents/import",
      "/indexes/ms_realty_listings/settings",
      "/tasks/11",
      "/indexes/ms_realty_listings/documents",
      "/tasks/12",
    ],
  );
  assert.match(calls[3].options.body, /MS-CRAWL-0001:bg/);
  assert.match(calls[6].options.body, /"meili_id":"MS-CRAWL-0001_bg"/);
});

test("benchmark bootstrap rejects failed or invalid Typesense JSONL results", async () => {
  const corpus = loadBenchmarkCorpus({ dataDir: fromRoot("search", "data"), corpusSchema: "legacy_fixture_v1" });
  for (const [line, expected] of [
    [JSON.stringify({ success: false, error: "invalid field" }), /Typesense benchmark import result 4 failed: invalid field/],
    ["not-json", /Typesense benchmark import result 4 is invalid JSON/],
  ]) {
    const calls = [];
    await assert.rejects(
      () =>
        bootstrapBenchmarkCorpus({
          dataDir: fromRoot("search", "data"),
          typesense: { baseUrl: "http://typesense.local", apiKey: "typesense-key" },
          meilisearch: { baseUrl: "http://meili.local", apiKey: "meili-key" },
          fetchImpl: async (url, options) => {
            calls.push({ url, options });
            if (url.endsWith("/collections/ms_realty_listings") || url.endsWith("/indexes/ms_realty_listings")) return { status: 404 };
            if (url.includes("/documents/import")) return { status: 200, async text() { return typesenseImportResults(corpus.document_count, { 3: line }); } };
            if (url.endsWith("/collections")) return { status: 201 };
            throw new Error(`unexpected request: ${url}`);
          },
        }),
      expected,
    );
    assert.deepEqual(
      calls.map(({ url }) => new URL(url).pathname),
      [
        "/collections/ms_realty_listings",
        "/indexes/ms_realty_listings",
        "/collections",
        "/collections/ms_realty_listings/documents/import",
      ],
    );
  }
});

test("benchmark bootstrap refuses pre-existing benchmark targets before importing", async () => {
  const options = {
    dataDir: fromRoot("search", "data"),
    typesense: { baseUrl: "http://typesense.local", apiKey: "typesense-key" },
    meilisearch: { baseUrl: "http://meili.local", apiKey: "meili-key" },
  };
  const typesenseCalls = [];
  await assert.rejects(
    () =>
      bootstrapBenchmarkCorpus({
        ...options,
        fetchImpl: async (url, request) => {
          typesenseCalls.push({ url, request });
          return { status: 200 };
        },
      }),
    /Benchmark bootstrap refuses an existing Typesense collection/,
  );
  assert.deepEqual(typesenseCalls.map(({ url }) => new URL(url).pathname), ["/collections/ms_realty_listings"]);

  const meilisearchCalls = [];
  await assert.rejects(
    () =>
      bootstrapBenchmarkCorpus({
        ...options,
        fetchImpl: async (url, request) => {
          meilisearchCalls.push({ url, request });
          return { status: url.includes("typesense.local") ? 404 : 200 };
        },
      }),
    /Benchmark bootstrap refuses an existing Meilisearch index/,
  );
  assert.deepEqual(meilisearchCalls.map(({ url }) => new URL(url).pathname), ["/collections/ms_realty_listings", "/indexes/ms_realty_listings"]);
});

test("search engine sync posts existing fixtures to Typesense and Meilisearch", async () => {
  const calls = [];
  const report = await runSearchEngineSync({
    fetchImpl: fakeFetch(calls, [201, 202, 202, 202]),
    typesense: { baseUrl: "http://typesense.local", apiKey: "type-key" },
    meilisearch: { baseUrl: "http://meili.local", apiKey: "meili-key" },
  });

  assert.equal(assertSearchEngineSyncReport(report), true);
  assert.equal(report.engines.find((engine) => engine.engine === "typesense").collection, "ms_realty_listings");
  assert.equal(report.engines.find((engine) => engine.engine === "meilisearch").index, "ms_realty_listings");
  assert.deepEqual(report.summary.targets, { typesense: "ms_realty_listings", meilisearch: "ms_realty_listings" });
  assert.deepEqual(report.summary.documents_per_engine, [167, 167]);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].url, "http://typesense.local/collections");
  assert.equal(calls[1].url, "http://typesense.local/collections/ms_realty_listings/documents/import?action=upsert");
  assert.equal(calls[2].url, "http://meili.local/indexes/ms_realty_listings/settings");
  assert.equal(calls[3].url, "http://meili.local/indexes/ms_realty_listings/documents?primaryKey=meili_id");
  assert.equal(calls[1].options.headers["x-typesense-api-key"], "type-key");
  assert.equal(calls[3].options.headers.authorization, "Bearer meili-key");
  assert.match(calls[1].body, /MS-CRAWL-0001:bg/);
  assert.match(calls[3].body, /MS-CRAWL-0001:bg/);
  assert.match(calls[3].body, /"meili_id":"MS-CRAWL-0001_bg"/);
  assert.throws(
    () => assertSearchEngineSyncReport({ ...report, engines: [report.engines[0], { ...report.engines[0] }] }),
    /exactly once/,
  );
  assert.throws(() => assertSearchEngineSyncReport({ ...report, generated_at: "" }), /valid generated_at/);
  assert.throws(
    () => assertSearchEngineSyncReport({ ...report, summary: { ...report.summary, documents_per_engine: [167, 166] } }),
    /summary documents/,
  );
  assert.throws(
    () => assertSearchEngineSyncReport({ ...report, summary: { ...report.summary, total_operations: 3 } }),
    /four engine operations/,
  );
  assert.throws(
    () =>
      assertSearchEngineSyncReport({
        ...report,
        summary: { ...report.summary, targets: { ...report.summary.targets, typesense: "other_listings" } },
      }),
    /summary targets/,
  );
  assert.throws(
    () =>
      assertSearchEngineSyncReport({
        ...report,
        engines: report.engines.map((engine, index) => (index === 0 ? { ...engine, collection: "" } : engine)),
      }),
    /collection evidence/,
  );
  assert.throws(
    () =>
      assertSearchEngineSyncReport({
        ...report,
        summary: { ...report.summary, targets: { ...report.summary.targets, typesense: "other_listings" } },
        engines: report.engines.map((engine, index) =>
          index === 0
            ? { ...engine, collection: "other_listings", operations: [{ ...engine.operations[0] }, { ...engine.operations[1] }] }
            : engine,
        ),
      }),
    /operation URL evidence for its target/,
  );
  assert.throws(
    () =>
      assertSearchEngineSyncReport({
        ...report,
        engines: report.engines.map((engine, index) =>
          index === 0 ? { ...engine, operations: [{ ...engine.operations[0], status: 202 }, engine.operations[1]] } : engine,
        ),
      }),
    /collection create operation evidence/,
  );
  assert.throws(
    () =>
      assertSearchEngineSyncReport({
        ...report,
        engines: report.engines.map((engine, index) =>
          index === 1
            ? {
                ...engine,
                operations: [
                  { ...engine.operations[0], url: "http://meili.local/indexes/ms_realty_listings/documents?primaryKey=meili_id" },
                  engine.operations[1],
                ],
              }
            : engine,
        ),
      }),
    /settings operation evidence/,
  );
  assert.throws(
    () =>
      assertSearchEngineSyncReport({
        ...report,
        engines: report.engines.map((engine, index) =>
          index === 0 ? { ...engine, operations: [{ ...engine.operations[0], url: "" }, engine.operations[1]] } : engine,
        ),
      }),
    /service URL evidence/,
  );
  assert.throws(
    () =>
      assertSearchEngineSyncReport({
        ...report,
        engines: report.engines.map((engine, index) =>
          index === 0
            ? {
                ...engine,
                operations: [
                  { ...engine.operations[0], url: "https://operator:secret@typesense.ms-realty.bg/collections" },
                  engine.operations[1],
                ],
              }
            : engine,
        ),
      }),
    /URL credentials/,
  );
  assert.throws(
    () =>
      assertSearchEngineSyncReport({
        ...report,
        engines: report.engines.map((engine, index) =>
          index === 0 ? { ...engine, operations: [{ ...engine.operations[0], method: "GET" }, engine.operations[1]] } : engine,
        ),
      }),
    /operation method/,
  );
  assert.throws(
    () =>
      assertSearchEngineSyncReport({
        ...report,
        engines: report.engines.map((engine, index) =>
          index === 0 ? { ...engine, operations: [{ ...engine.operations[0], status: 500 }, engine.operations[1]] } : engine,
        ),
      }),
    /operation status/,
  );
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

test("search engine runtime rejects copied placeholder env before network calls", async () => {
  const fetchImpl = async () => {
    throw new Error("placeholder search env should not be called");
  };

  await assert.rejects(
    () =>
      runSearchEngineSync({
        fetchImpl,
        typesense: { baseUrl: "https://example.com", apiKey: "replace-with-typesense-key" },
        meilisearch: { baseUrl: "https://meili.internal", apiKey: "meili-key" },
      }),
    /TYPESENSE_URL must not be a placeholder/,
  );
  await assert.rejects(
    () =>
      runSearchEngineQuerySmoke({
        fetchImpl,
        typesense: { baseUrl: "https://typesense.internal", apiKey: "change-me" },
        meilisearch: { baseUrl: "https://meili.internal", apiKey: "meili-key" },
      }),
    /TYPESENSE_API_KEY must not be a placeholder/,
  );
});

test("Typesense sync rejects non-accepted collection creation statuses even when fetch reports ok", async () => {
  await assert.rejects(
    () =>
      syncTypesense({
        baseUrl: "http://typesense.local/",
        apiKey: "type-key",
        fetchImpl: async () => ({ ok: true, status: 202 }),
      }),
    /returned 202/,
  );
});

test("generated search sync smoke report is valid when present", () => {
  const file = fromRoot("production", "data", "search-engine-sync-smoke.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertSearchEngineSyncReport(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});

test("search fixture builder honors mounted locale registry and listing edits", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-search-fixtures-`);
  const outDir = `${dir}/out`;
  const registryPath = `${dir}/registry.json`;
  const listingEditPath = `${dir}/listing-edits.jsonl`;
  const registry = JSON.parse(fs.readFileSync(fromRoot("locales", "registry.json"), "utf8"));
  const hebrew = registry.locales.find((locale) => locale.code === "he");
  hebrew.public_enabled = false;
  hebrew.indexable = false;
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  fs.writeFileSync(
    listingEditPath,
    `${JSON.stringify({
      listing_id: "MS-CRAWL-0001",
      patch: { description: "Mounted search description." },
    })}\n`,
  );

  const result = spawnSync("python3", [fromRoot("search", "build_search_indexes.py"), "--out-dir", outDir], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_LOCALE_REGISTRY_PATH: registryPath,
      MS_REALTY_LISTING_EDIT_LEDGER_PATH: listingEditPath,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const docs = JSON.parse(fs.readFileSync(`${outDir}/index-listings.json`, "utf8"));
  const summary = JSON.parse(fs.readFileSync(`${outDir}/search-fixture-summary.json`, "utf8"));
  const reviewed = docs.filter((doc) => doc.source_listing_id === "MS-CRAWL-0001");

  assert.equal(summary.locale_registry_path, registryPath);
  assert.equal(summary.listing_edits_path, listingEditPath);
  assert.equal(summary.public_indexable_locales.includes("he"), false);
  assert.deepEqual(new Set(reviewed.map((doc) => doc.locale)), new Set(["bg", "el"]));
  assert.equal(reviewed.every((doc) => doc.description === "Mounted search description."), true);
  assert.equal(reviewed.every((doc) => doc.thumbnail_url.includes("/wp-content/uploads/")), true);
  assert.equal(reviewed.every((doc) => doc.thumbnail_alt), true);
});

test("search engine query smoke normalizes Typesense and Meilisearch hits", async () => {
  const calls = [];
  const hit = {
    id: "MS-CRAWL-0001:bg",
    source_listing_id: "MS-CRAWL-0001",
    locale: "bg",
    locale_path: "/bg/imoti/MS-CRAWL-0001",
    title: "Reviewed listing",
  };
  const report = await runSearchEngineQuerySmoke({
    typesense: { baseUrl: "http://typesense.local", apiKey: "type-key" },
    meilisearch: { baseUrl: "http://meili.local", apiKey: "meili-key" },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes("typesense.local")) {
        return { ok: true, status: 200, async json() { return { found: 1, hits: [{ document: hit }] }; } };
      }
      return { ok: true, status: 200, async json() { return { estimatedTotalHits: 1, hits: [hit] }; } };
    },
  });

  assert.equal(assertSearchEngineQueryReport(report), true);
  assert.equal(report.engines.find((engine) => engine.engine === "typesense").collection, "ms_realty_listings");
  assert.equal(report.engines.find((engine) => engine.engine === "meilisearch").index, "ms_realty_listings");
  assert.deepEqual(report.summary.targets, { typesense: "ms_realty_listings", meilisearch: "ms_realty_listings" });
  assert.equal(calls[0].url.includes("/documents/search?"), true);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[1].url, "http://meili.local/indexes/ms_realty_listings/search");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(
    JSON.parse(calls[1].options.body).filter,
    'translation_indexable = true AND locale = bg AND source_listing_id = "MS-CRAWL-0001"',
  );
  assert.equal(report.engines.find((engine) => engine.engine === "typesense").operation.method, "GET");
  assert.equal(report.engines.find((engine) => engine.engine === "meilisearch").operation.url, "http://meili.local/indexes/ms_realty_listings/search");
  assert.throws(
    () => assertSearchEngineQueryReport({ ...report, engines: [report.engines[0], { ...report.engines[0] }] }),
    /exactly once/,
  );
  assert.throws(() => assertSearchEngineQueryReport({ ...report, generated_at: "not-a-date" }), /valid generated_at/);
  assert.throws(
    () => assertSearchEngineQueryReport({ ...report, summary: { ...report.summary, total_hits: 1 } }),
    /summary hits/,
  );
  assert.throws(
    () => assertSearchEngineQueryReport({ ...report, summary: { ...report.summary, first_hit_ids: ["wrong", "wrong"] } }),
    /summary first hits/,
  );
  assert.throws(
    () =>
      assertSearchEngineQueryReport({
        ...report,
        summary: { ...report.summary, targets: { ...report.summary.targets, meilisearch: "other_listings" } },
      }),
    /summary targets/,
  );
  assert.throws(
    () =>
      assertSearchEngineQueryReport({
        ...report,
        engines: report.engines.map((engine, index) => (index === 0 ? { ...engine, collection: "" } : engine)),
      }),
    /collection evidence/,
  );
  assert.throws(
    () =>
      assertSearchEngineQueryReport({
        ...report,
        engines: report.engines.map((engine, index) => (index === 0 ? { ...engine, service_url: "" } : engine)),
      }),
    /service URL evidence/,
  );
  assert.throws(
    () =>
      assertSearchEngineQueryReport({
        ...report,
        engines: report.engines.map((engine, index) =>
          index === 0 ? { ...engine, service_url: "https://operator:secret@typesense.ms-realty.bg" } : engine,
        ),
      }),
    /URL credentials/,
  );
  assert.throws(
    () =>
      assertSearchEngineQueryReport({
        ...report,
        engines: report.engines.map((engine, index) => (index === 0 ? { ...engine, operation: null } : engine)),
      }),
    /query operation/,
  );
  assert.throws(
    () =>
      assertSearchEngineQueryReport({
        ...report,
        engines: report.engines.map((engine, index) =>
          index === 1 ? { ...engine, operation: { ...engine.operation, method: "GET" } } : engine,
        ),
      }),
    /index search operation evidence/,
  );
  assert.throws(
    () =>
      assertSearchEngineQueryReport({
        ...report,
        engines: report.engines.map((engine, index) => (index === 0 ? { ...engine, query: "" } : engine)),
      }),
    /query evidence/,
  );
  assert.throws(
    () =>
      assertSearchEngineQueryReport({
        ...report,
        engines: report.engines.map((engine, index) => (index === 0 ? { ...engine, filter: "" } : engine)),
      }),
    /reviewed locale filtering/,
  );
});

test("search engine query rejects non-accepted statuses even when fetch reports ok", async () => {
  await assert.rejects(
    () =>
      runSearchEngineQuerySmoke({
        typesense: { baseUrl: "http://typesense.local", apiKey: "type-key" },
        meilisearch: { baseUrl: "http://meili.local", apiKey: "meili-key" },
        fetchImpl: async () => ({ ok: true, status: 202, async json() { return {}; } }),
      }),
    /returned 202/,
  );
});

test("generated search query smoke report is valid when present", () => {
  const file = fromRoot("production", "data", "search-engine-query-smoke.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertSearchEngineQueryReport(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});

test("live search engine CLIs fail closed when provisioning env is missing", () => {
  const env = { ...process.env, TYPESENSE_URL: "", TYPESENSE_API_KEY: "", MEILI_URL: "", MEILI_API_KEY: "" };
  const cases = [
    ["run-search-engine-sync.mjs", /SEARCH ENGINE SYNC FAILED: TYPESENSE_URL is required/],
    ["run-search-engine-query.mjs", /SEARCH ENGINE QUERY FAILED: TYPESENSE_URL is required/],
  ];

  for (const [script, message] of cases) {
    const result = spawnSync(process.execPath, [fromRoot("production", "scripts", script)], {
      cwd: fromRoot(),
      encoding: "utf8",
      env,
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
  }
});

test("live search engine CLIs write reports to configured paths", async () => {
  await withSearchServer(async (baseUrl) => {
    const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-search-cli-reports-`);
    const syncReportPath = `${dir}/search-engine-sync-report.json`;
    const queryReportPath = `${dir}/search-engine-query-report.json`;
    const env = {
      ...process.env,
      TYPESENSE_URL: baseUrl,
      TYPESENSE_API_KEY: "typesense-test",
      MEILI_URL: baseUrl,
      MEILI_API_KEY: "meili-test",
      MS_REALTY_SEARCH_SYNC_REPORT_PATH: syncReportPath,
      MS_REALTY_SEARCH_QUERY_REPORT_PATH: queryReportPath,
    };

    const sync = await runScript("run-search-engine-sync.mjs", env);
    const query = await runScript("run-search-engine-query.mjs", env);

    assert.equal(sync.status, 0, sync.stderr);
    assert.equal(query.status, 0, query.stderr);
    assert.equal(assertSearchEngineSyncReport(JSON.parse(fs.readFileSync(syncReportPath, "utf8"))), true);
    assert.equal(assertSearchEngineQueryReport(JSON.parse(fs.readFileSync(queryReportPath, "utf8"))), true);
  });
});
