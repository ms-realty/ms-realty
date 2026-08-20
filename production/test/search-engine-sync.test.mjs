import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import {
  assertSearchEngineQueryReport,
  assertSearchEngineSyncReport,
  approvedSearchSchema,
  approvedSearchSettings,
  buildApprovedSearchProjection,
  createSearchRebuildPlan,
  createSearchRollbackPlan,
  enqueueSearchOutbox,
  processSearchOutbox,
  queryMeilisearch,
  queryPublicSearch,
  queryTypesense,
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
import { CYRILLIC_SEARCH_FOLD_PAIRS, foldSearchText, POSTGRES_SEARCH_FOLD_SQL } from "../lib/search-fold.mjs";
import { assertBenchmarkCorpusCompatibility, benchmarkPublicFilters, loadBenchmarkCorpus } from "../../search/benchmark-corpus.mjs";
import { bootstrapBenchmarkCorpus } from "../../search/bootstrap_benchmark_corpus.mjs";

const POSTGRES_DATABASE_TARGET = "postgres://db.ms-realty.bg:5432/ms_realty";

function authoritativeProjection(documents = []) {
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
      digest: crypto.createHash("sha256").update(JSON.stringify(documents)).digest("hex"),
    },
  };
}

function postgresFixture(documents = []) {
  const hits = documents.map((document) => ({
    id: document.id,
    source_listing_id: document.source_listing_id,
    listing_reference: document.listing_reference,
    locale: document.locale,
    locale_path: document.locale_path,
    title: document.title,
  }));
  return {
    env: {
      DATABASE_URL: POSTGRES_DATABASE_TARGET,
      PAYLOAD_SECRET: "test-payload-secret",
    },
    snapshotQueryImpl: async () => documents,
    queryImpl: async ({ intent, q, target }) => {
      const exactReference = String(intent?.exact_reference || q || "").trim();
      const matched = exactReference
        ? hits.filter(
            (hit) =>
              hit.listing_reference === exactReference ||
              hit.source_listing_id === exactReference ||
              hit.id === exactReference,
          )
        : hits;
      return {
        engine: "postgres",
        database_target: POSTGRES_DATABASE_TARGET,
        total: matched.length,
        hits: matched,
        page: 1,
        page_size: Math.max(1, matched.length || 5),
        locale_codes: [...new Set(matched.map((hit) => hit.locale))],
        unavailable_engines: [],
        target,
      };
    },
  };
}

function fakeFetch(calls, statuses = []) {
  return async (url, options) => {
    const status = statuses.shift() || 202;
    calls.push({ url, options, body: options.body });
    return { ok: status >= 200 && status < 300, status };
  };
}

const PUBLIC_LOOKUP = async () => [{ address: "1.1.1.1", family: 4 }];

test("search egress rejects credentialed, fragmented, and private destinations before fetch", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(JSON.stringify({ found: 0, hits: [] }), { status: 200 });
  };

  await assert.rejects(
    () => queryTypesense({ baseUrl: "https://user:pass@typesense.ms-realty.bg", apiKey: "key", lookupImpl: PUBLIC_LOOKUP, fetchImpl }),
    /URL credentials/,
  );
  await assert.rejects(
    () => queryTypesense({ baseUrl: "https://typesense.ms-realty.bg#fragment", apiKey: "key", lookupImpl: PUBLIC_LOOKUP, fetchImpl }),
    /fragment/,
  );
  await assert.rejects(
    () =>
      queryTypesense({
        baseUrl: "https://typesense.ms-realty.bg",
        apiKey: "key",
        lookupImpl: async () => [{ address: "127.0.0.1", family: 4 }],
        fetchImpl,
      }),
    /private or reserved address/,
  );
  for (const [baseUrl, lookupImpl, pattern] of [
    ["https://typesense.ms-realty.bg/proxy", PUBLIC_LOOKUP, /exact service origin/],
    ["http://typesense.ms-realty.bg", PUBLIC_LOOKUP, /must use HTTPS/],
    ["https://typesense.ms-realty.bg", async () => [{ address: "169.254.169.254", family: 4 }], /private or reserved/],
    ["https://typesense.ms-realty.bg", async () => [{ address: "203.0.113.1", family: 4 }], /private or reserved/],
    [
      "https://typesense.ms-realty.bg",
      async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
      /private or reserved/,
    ],
    ["https://[2001:db8::1]", PUBLIC_LOOKUP, /private or reserved/],
  ]) {
    await assert.rejects(() => queryTypesense({ baseUrl, apiKey: "key", lookupImpl, fetchImpl }), pattern);
  }
  assert.equal(calls, 0);
});

test("search queries use query-only keys, disable redirects, and carry an abort signal", async () => {
  const calls = [];
  await queryTypesense({
    baseUrl: "https://typesense.ms-realty.bg",
    apiKey: "admin-key",
    queryApiKey: "query-key",
    lookupImpl: PUBLIC_LOOKUP,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ found: 0, hits: [] }), { status: 200 });
    },
  });

  assert.equal(calls[0].options.headers["x-typesense-api-key"], "query-key");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.signal instanceof AbortSignal, true);

  await assert.rejects(
    () =>
      queryTypesense({
        baseUrl: "https://typesense.ms-realty.bg",
        apiKey: "admin-key",
        lookupImpl: PUBLIC_LOOKUP,
        timeoutMs: 5,
        fetchImpl: async (_url, { signal }) =>
          new Promise((resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          }),
      }),
    (error) => error.name === "SearchEngineUnavailableError" && /exceeded 5ms/.test(error.cause?.message),
  );

  await assert.rejects(
    () =>
      queryTypesense({
        baseUrl: "https://typesense.ms-realty.bg",
        apiKey: "admin-key",
        lookupImpl: PUBLIC_LOOKUP,
        timeoutMs: 5,
        fetchImpl: async (_url, { signal }) =>
          new Response(
            new ReadableStream({
              start(controller) {
                signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
              },
            }),
            { status: 200 },
          ),
      }),
    (error) => error.name === "SearchEngineUnavailableError" && /exceeded 5ms/.test(error.cause?.message),
  );
});

test("public search rejects oversized or over-broad engine responses", async () => {
  await assert.rejects(
    () =>
      queryTypesense({
        baseUrl: "https://typesense.ms-realty.bg",
        apiKey: "key",
        lookupImpl: PUBLIC_LOOKUP,
        fetchImpl: async () =>
          new Response("{}", { status: 200, headers: { "content-length": String(1024 * 1024 + 1) } }),
      }),
    /response exceeds 1048576 bytes/,
  );

  const hit = {
    id: "MS-CRAWL-0001:bg",
    source_listing_id: "MS-CRAWL-0001",
    locale: "bg",
    locale_path: "/bg/imoti/MS-CRAWL-0001",
    title: "Reviewed listing",
  };
  await assert.rejects(
    () =>
      queryMeilisearch({
        baseUrl: "https://meili.ms-realty.bg",
        apiKey: "key",
        limit: 250,
        lookupImpl: PUBLIC_LOOKUP,
        fetchImpl: async () =>
          new Response(JSON.stringify({ estimatedTotalHits: 251, hits: Array.from({ length: 251 }, () => hit) }), { status: 200 }),
      }),
    /more than 250 hits/,
  );
});

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
      typesense: { baseUrl, apiKey: "typesense-key", allowPrivateNetwork: true },
      meilisearch: { baseUrl, apiKey: "meili-key", allowPrivateNetwork: true },
      q: "Sandanski",
      localeCodes: ["bg"],
      filters: {
        country_code: "BG",
        geography_id: "BG:settlement:65334",
        region_id: "BG:district:BLG",
        municipality: "Sandanski",
        district: "Blagoevgrad",
        property_type: "apartment",
        price_min: "100000",
        bedrooms_min: "2",
      },
    });

    assert.equal(result.engine, "typesense");
    assert.equal(result.total, 1);
    assert.deepEqual(result.hits.map((hit) => hit.source_listing_id), ["MS-CRAWL-0001"]);
    assert.deepEqual(result.unavailable_engines, ["postgres"]);
    assert.equal(calls.length, 1);
    const request = new URL(`http://search.test${calls[0].url}`);
    assert.equal(request.pathname, "/collections/ms_realty_listings/documents/search");
    assert.equal(request.searchParams.get("q"), "Sandanski");
    assert.equal(request.searchParams.get("per_page"), "250");
    assert.match(request.searchParams.get("filter_by"), /translation_indexable:=true/);
    assert.match(request.searchParams.get("filter_by"), /translation_human_approved:=true/);
    assert.match(request.searchParams.get("filter_by"), /locale:=`bg`/);
    assert.match(request.searchParams.get("filter_by"), /municipality:=`Sandanski`/);
    assert.match(request.searchParams.get("filter_by"), /district:=`Blagoevgrad`/);
    assert.match(request.searchParams.get("filter_by"), /country_code:=`BG`/);
    assert.match(request.searchParams.get("filter_by"), /geography_path:=`BG:settlement:65334`/);
    assert.match(request.searchParams.get("filter_by"), /geography_path:=`BG:district:BLG`/);
    assert.match(request.searchParams.get("filter_by"), /property_family:=`apartment`/);
    assert.match(request.searchParams.get("filter_by"), /price_amount:>=100000/);
    assert.match(request.searchParams.get("filter_by"), /bedrooms_count:>=2/);
  });
});

test("selected Typesense receives the validated exact and structured intent", async () => {
  await withSearchServer(async (baseUrl, calls) => {
    await queryPublicSearch({
      engine: "typesense",
      environment: "test",
      typesense: { baseUrl, apiKey: "typesense-key", allowPrivateNetwork: true },
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
        typesense: { baseUrl, apiKey: "typesense-key", allowPrivateNetwork: true },
        meilisearch: { baseUrl, apiKey: "meili-key", allowPrivateNetwork: true },
        q: "Sandanski",
        localeCodes: ["bg", "ru"],
        filters: {
          country_code: "GR",
          geography_id: "GR:settlement:EL52:1202020404",
          region_id: "GR:region:EL52",
          municipality: "Amfipolis",
          offer_type: "sale",
          area_max: "120",
        },
      });

      assert.equal(result.engine, "meilisearch");
      assert.deepEqual(result.unavailable_engines, ["postgres", "typesense"]);
      assert.equal(calls.length, 2);
      assert.equal(calls[0].url.includes("/documents/search?"), true);
      assert.equal(calls[1].url, "/indexes/ms_realty_listings/search");
      const payload = JSON.parse(calls[1].body);
      assert.equal(payload.limit, 250);
      assert.match(payload.filter, /translation_indexable = true/);
      assert.match(payload.filter, /locale = "bg" OR locale = "ru"/);
      assert.match(payload.filter, /municipality = "Amfipolis"/);
      assert.match(payload.filter, /country_code = "GR"/);
      assert.match(payload.filter, /geography_path = "GR:settlement:EL52:1202020404"/);
      assert.match(payload.filter, /geography_path = "GR:region:EL52"/);
      assert.match(payload.filter, /offer_type = "sale"/);
      assert.match(payload.filter, /primary_area_sqm <= 120/);
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
            typesense: { baseUrl, apiKey: "typesense-key", allowPrivateNetwork: true },
            meilisearch: { baseUrl, apiKey: "meili-key", allowPrivateNetwork: true },
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
  assert.deepEqual(result.unavailable_engines, ["postgres", "typesense", "meilisearch"]);
});

test("search sync reuses the current Payload adapter until its SQL snapshot completes", async () => {
  let executeArgs = null;
  let loadCalls = 0;
  let destroyCalls = 0;
  const drizzle = { kind: "current-payload-drizzle" };
  const payload = {
    db: {
      drizzle,
      beginTransaction: async () => "tx",
      commitTransaction: async () => undefined,
      rollbackTransaction: async () => undefined,
      execute: async (args) => {
        executeArgs = args;
        return { rows: [] };
      },
    },
    find: async () => ({ docs: [], totalPages: 1 }),
    create: async () => undefined,
    update: async () => undefined,
    destroy: async () => {
      destroyCalls += 1;
      payload.db.drizzle = undefined;
    },
  };
  const result = await runSearchEngineSync({
    postgres: {
      env: { DATABASE_URL: POSTGRES_DATABASE_TARGET, PAYLOAD_SECRET: "test-payload-secret" },
      loadPayloadRuntime: async () => {
        loadCalls += 1;
        return payload;
      },
    },
  });

  assert.deepEqual(result.summary.documents_per_engine, [0]);
  assert.equal(loadCalls, 1);
  assert.equal(destroyCalls, 1);
  assert.ok(executeArgs?.sql);
  assert.equal(executeArgs.drizzle, drizzle);
});

test("search query reuses the current Payload adapter until count and page queries complete", async () => {
  const executeArgs = [];
  let loadCalls = 0;
  let destroyCalls = 0;
  const drizzle = { kind: "current-payload-drizzle" };
  const payload = {
    db: {
      drizzle,
      beginTransaction: async () => "tx",
      commitTransaction: async () => undefined,
      rollbackTransaction: async () => undefined,
      execute: async (args) => {
        executeArgs.push(args);
        return { rows: executeArgs.length === 1 ? [{ total_count: "0" }] : [] };
      },
    },
    find: async () => ({ docs: [], totalPages: 1 }),
    create: async () => undefined,
    update: async () => undefined,
    destroy: async () => {
      destroyCalls += 1;
      payload.db.drizzle = undefined;
    },
  };
  const report = await runSearchEngineQuerySmoke({
    postgres: {
      env: { DATABASE_URL: POSTGRES_DATABASE_TARGET, PAYLOAD_SECRET: "test-payload-secret" },
      loadPayloadRuntime: async () => {
        loadCalls += 1;
        return payload;
      },
    },
  });

  assert.equal(report.summary.total_hits, 0);
  assert.equal(loadCalls, 1);
  assert.equal(destroyCalls, 1);
  assert.equal(executeArgs.length, 2);
  assert.ok(executeArgs.every((args) => args.drizzle === drizzle && args.sql));
});

test("Postgres search counts independently and binds page, active status, and geography filters", async () => {
  const statements = [];
  const postgres = {
    env: { DATABASE_URL: POSTGRES_DATABASE_TARGET, PAYLOAD_SECRET: "test-payload-secret" },
    payload: {
      db: {
        drizzle: {
          receiver: "postgres-query",
          async execute(statement) {
            assert.equal(this.receiver, "postgres-query");
            statements.push(statement);
            return statements.length === 1 ? [{ total_count: "23" }] : [];
          },
        },
      },
    },
  };
  const result = await queryPublicSearch({
    engine: "postgres",
    environment: "production",
    postgres,
    localeCodes: ["bg"],
    intent: {
      locale: "bg",
      text_query: "Сандански",
      listing_status: "reserved",
      region_id: "BG:district:BLG",
      page: 3,
      page_size: 7,
    },
  });

  assert.equal(result.total, 23);
  assert.equal(result.page, 3);
  assert.equal(result.page_size, 7);
  assert.deepEqual(result.hits, []);
  assert.equal(statements.length, 2);
  const dialect = {
    escapeName: (name) => `"${name}"`,
    escapeParam: (index) => `$${index + 1}`,
    escapeString: (value) => `'${String(value).replaceAll("'", "''")}'`,
    casing: { getColumnCasing: (column) => column.name },
  };
  const count = statements[0].toQuery(dialect);
  const page = statements[1].toQuery(dialect);
  assert.match(count.sql, /SELECT count\(\*\) AS total_count/);
  assert.match(count.sql, /ms_realty_search_fold"?\(d\."search_text"\) LIKE/);
  assert.match(count.sql, /d\."geography_path" @>/);
  assert.match(count.sql, /d\."listing_status" =/);
  assert.deepEqual(count.params, ["bg", "%sandanski%", '["BG:district:BLG"]', "reserved"]);
  assert.match(page.sql, /LIMIT \$5\s+OFFSET \$6/);
  assert.deepEqual(page.params.slice(-2), [7, 14]);
});

test("Postgres search folds Bulgarian Cyrillic from the shared JavaScript and SQL mapping", async () => {
  assert.equal(CYRILLIC_SEARCH_FOLD_PAIRS.length, 34);
  assert.equal(foldSearchText("Сандански"), "sandanski");
  for (const [source, replacement] of CYRILLIC_SEARCH_FOLD_PAIRS) {
    assert.match(POSTGRES_SEARCH_FOLD_SQL, new RegExp(`'${source}', '${replacement}'`));
  }

  const statements = [];
  await queryPublicSearch({
    engine: "postgres",
    environment: "production",
    postgres: {
      env: { DATABASE_URL: POSTGRES_DATABASE_TARGET, PAYLOAD_SECRET: "test-payload-secret" },
      payload: { db: { drizzle: { execute: async (statement) => (statements.push(statement), statements.length === 1 ? [{ total_count: "0" }] : []) } } },
    },
    localeCodes: ["bg"],
    intent: { locale: "bg", text_query: "Сандански", page: 1, page_size: 12 },
  });
  const dialect = {
    escapeName: (name) => `"${name}"`,
    escapeParam: (index) => `$${index + 1}`,
    escapeString: (value) => `'${String(value).replaceAll("'", "''")}'`,
    casing: { getColumnCasing: (column) => column.name },
  };
  assert.equal(statements[0].toQuery(dialect).params[1], "%sandanski%");
});

test("Postgres search migration keeps locale routing and index operators aligned with runtime queries", () => {
  const migration = fs.readFileSync(fromRoot("migrations", "20260811_153000_postgres_public_search.ts"), "utf8");
  assert.match(migration, /routing_target_locale[^\n]+source_locale\."code"/);
  assert.match(migration, /SET search_path = pg_catalog, pg_temp/);
  assert.match(migration, /POSTGRES_SEARCH_FOLD_SQL/);
  assert.match(migration, /const VERIFIED_LOCATION_SQL/);
  assert.equal(migration.match(/workflow_location_verified_at/g)?.length, 1);
  assert.equal(migration.match(/workflow_location_verified_by/g)?.length, 1);
  assert.match(migration, /VERIFIED_LOCATION_SQL\(`NULLIF\(\$\{listing\}"facts_location"/);
  assert.match(migration, /VERIFIED_LOCATION_SQL\(`NULLIF\(\$\{listing\}"facts_municipality"/);
  assert.match(migration, /VERIFIED_LOCATION_SQL\(`NULLIF\(\$\{listing\}"facts_district"/);
  assert.match(migration, /VERIFIED_LOCATION_SQL\(`NULLIF\(\$\{listing\}"facts_country_code"/);
  assert.match(migration, /EXISTS \(\s*SELECT 1\s*FROM "public"\."listing_translations"/);
  assert.match(migration, /VERIFIED_GEOGRAPHY_PATH_SQL\(""\)\)\}\) jsonb_path_ops/);
  assert.match(migration, /ms_realty_search_fold"\(\$\{sql\.raw\(SEARCH_TEXT_SQL\(""\)\)\}\) gin_trgm_ops/);
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

test("production search requires Postgres and rejects legacy engine credentials before network access", async () => {
  assert.throws(
    () => selectSearchRuntime({ environment: "production", typesense: {}, meilisearch: {} }),
    /MS_REALTY_SEARCH_ENGINE must be postgres in production/,
  );
  assert.throws(
    () => selectSearchRuntime({
      engine: "typesense",
      environment: "production",
      typesense: { baseUrl: "http://typesense.local", apiKey: "type-key" },
      meilisearch: { baseUrl: "http://meili.local", apiKey: "meili-key" },
    }),
    /MS_REALTY_SEARCH_ENGINE must be postgres in production/,
  );
  const calls = [];
  await assert.rejects(
    () =>
      queryPublicSearch({
        engine: "typesense",
        environment: "production",
        localeCodes: ["bg"],
        typesense: { baseUrl: "https://typesense.ms-realty.bg", apiKey: "type-key", lookupImpl: PUBLIC_LOOKUP },
        meilisearch: { baseUrl: "https://meili.ms-realty.bg", apiKey: "meili-key", lookupImpl: PUBLIC_LOOKUP },
        fetchImpl: async (url) => {
          calls.push(url);
          return { status: 503, async json() { return {}; } };
        },
      }),
    /MS_REALTY_SEARCH_ENGINE must be postgres in production/,
  );
  assert.equal(calls.length, 0);

  assert.deepEqual(
    selectSearchRuntime({
      engine: "postgres",
      environment: "production",
      postgres: postgresFixture([]),
      typesense: { baseUrl: "https://typesense.ms-realty.bg", apiKey: "ignored" },
      meilisearch: { baseUrl: "https://meili.ms-realty.bg", apiKey: "ignored" },
    }),
    { engine: "postgres", mode: "single" },
  );
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
      typesense: { baseUrl, apiKey: "typesense-key", allowPrivateNetwork: true },
      meilisearch: { baseUrl, apiKey: "meili-key", allowPrivateNetwork: true },
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
    typesense: { baseUrl: "https://typesense.ms-realty.bg", apiKey: "type-key", lookupImpl: PUBLIC_LOOKUP },
    fetchImpl,
    activate: true,
  });
  assert.equal(rebuild.sync.collection, "ms_realty_listings__20260730a");
  assert.equal(JSON.parse(calls[0].options.body).name, "ms_realty_listings__20260730a");
  assert.equal(calls[2].options.method, "PUT");
  assert.deepEqual(JSON.parse(calls[2].options.body), { collection_name: "ms_realty_listings__20260730a" });

  const rollback = await rollbackSearchEngineRebuild(rebuild, {
    typesense: { baseUrl: "https://typesense.ms-realty.bg", apiKey: "type-key", lookupImpl: PUBLIC_LOOKUP },
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

test("checked-in review corpus supports the complete approved runtime schema without becoming public", () => {
  const corpus = loadBenchmarkCorpus({ dataDir: fromRoot("search", "data"), corpusSchema: "approved_projection_v1" });
  const schemaFields = new Set(corpus.typesenseSchema.fields.map((field) => field.name));
  const approvedSettings = approvedSearchSettings();

  for (const field of approvedSearchSchema().fields) assert.equal(schemaFields.has(field.name), true, field.name);
  for (const field of approvedSettings.searchableAttributes) assert.equal(corpus.meilisearchSettings.searchableAttributes.includes(field), true, field);
  for (const field of approvedSettings.filterableAttributes) assert.equal(corpus.meilisearchSettings.filterableAttributes.includes(field), true, field);
  for (const field of approvedSettings.sortableAttributes) assert.equal(corpus.meilisearchSettings.sortableAttributes.includes(field), true, field);
  assert.equal(corpus.documents.every((document) => document.publication_state === "review_required" && document.locale_indexable === false), true);
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

test("search engine sync snapshots the authoritative Postgres projection", async () => {
  const calls = [];
  const documents = [
    {
      id: "MS-CRAWL-0001:bg",
      source_listing_id: "MS-CRAWL-0001",
      listing_reference: "MS-CRAWL-0001",
      locale: "bg",
      locale_path: "/bg/imoti/MS-CRAWL-0001",
      title: "Reviewed listing",
    },
  ];
  const report = await runSearchEngineSync({
    postgres: {
      env: {
        DATABASE_URL: POSTGRES_DATABASE_TARGET,
        PAYLOAD_SECRET: "test-payload-secret",
      },
      payload: {
        db: {
          drizzle: {
            receiver: "postgres-projection",
            async execute() {
              assert.equal(this.receiver, "postgres-projection");
              return documents;
            },
          },
        },
      },
    },
    projection: authoritativeProjection(documents),
    fetchImpl: fakeFetch(calls, [201, 202, 202, 202]),
    typesense: { baseUrl: "https://typesense.ms-realty.bg", apiKey: "type-key", lookupImpl: PUBLIC_LOOKUP },
    meilisearch: { baseUrl: "https://meili.ms-realty.bg", apiKey: "meili-key", lookupImpl: PUBLIC_LOOKUP },
  });

  assert.equal(assertSearchEngineSyncReport(report), true);
  assert.equal(report.engines[0].engine, "postgres");
  assert.equal(report.engines[0].target, "ms_realty_public_search_documents");
  assert.equal(report.summary.targets.postgres, "ms_realty_public_search_documents");
  assert.deepEqual(report.summary.documents_per_engine, [1]);
  assert.equal(report.summary.total_operations, 1);
  assert.equal(report.summary.database_target, POSTGRES_DATABASE_TARGET);
  assert.equal(calls.length, 0);
  assert.throws(
    () => assertSearchEngineSyncReport({ ...report, engines: [report.engines[0], { ...report.engines[0] }] }),
    /one Postgres engine row/,
  );
  assert.throws(() => assertSearchEngineSyncReport({ ...report, generated_at: "" }), /valid generated_at/);
  assert.throws(
    () => assertSearchEngineSyncReport({ ...report, summary: { ...report.summary, documents_per_engine: [2] } }),
    /summary documents/,
  );
  assert.throws(
    () => assertSearchEngineSyncReport({ ...report, summary: { ...report.summary, total_operations: 2 } }),
    /one authoritative Postgres snapshot operation/,
  );
  assert.throws(
    () =>
      assertSearchEngineSyncReport({
        ...report,
        summary: { ...report.summary, targets: { postgres: "other_listings" } },
      }),
    /summary target/,
  );
  assert.throws(
    () =>
      assertSearchEngineSyncReport({
        ...report,
        engines: report.engines.map((engine, index) => (index === 0 ? { ...engine, target: "" } : engine)),
      }),
    /sync target is invalid/,
  );
  assert.throws(
    () =>
      assertSearchEngineSyncReport({
        ...report,
        summary: { ...report.summary, documents_per_engine: [2] },
        engines: report.engines.map((engine, index) => (index === 0 ? { ...engine, documents: 2 } : engine)),
      }),
    /document count must match/,
  );
  assert.throws(
    () =>
      assertSearchEngineSyncReport({
        ...report,
        engines: report.engines.map((engine, index) => (index === 0 ? { ...engine, operations: [{ ...engine.operations[0], status: 202 }] } : engine)),
      }),
    /operation status is invalid/,
  );
  assert.throws(
    () =>
      assertSearchEngineSyncReport({
        ...report,
        engines: report.engines.map((engine, index) => (index === 0 ? { ...engine, digest: "not-a-digest" } : engine)),
      }),
    /must include a projection digest/,
  );
  assert.throws(
    () =>
      assertSearchEngineSyncReport({
        ...report,
        engines: report.engines.map((engine, index) => (index === 0 ? { ...engine, operations: [{ ...engine.operations[0], url: "" }] } : engine)),
      }),
    /database target/,
  );
  for (const suffix of ["?sslpassword=secret", "#secret-fragment"]) {
    assert.throws(
      () => assertSearchEngineSyncReport({
        ...report,
        summary: { ...report.summary, database_target: `${report.summary.database_target}${suffix}` },
      }),
      /exact redacted Postgres target/,
    );
    assert.throws(
      () => assertSearchEngineSyncReport({
        ...report,
        engines: report.engines.map((engine) => ({
          ...engine,
          operations: engine.operations.map((operation) => ({ ...operation, url: `${operation.url}${suffix}` })),
        })),
      }),
      /exact redacted Postgres target/,
    );
  }
  const credentialedTarget = POSTGRES_DATABASE_TARGET.replace("postgres://", "postgres://runtime:secret@");
  assert.throws(
    () => assertSearchEngineSyncReport({
      ...report,
      summary: { ...report.summary, database_target: credentialedTarget },
    }),
    /exact redacted Postgres target/,
  );
  assert.throws(
    () => assertSearchEngineSyncReport({
      ...report,
      engines: report.engines.map((engine) => ({
        ...engine,
        operations: engine.operations.map((operation) => ({ ...operation, url: credentialedTarget })),
      })),
    }),
    /exact redacted Postgres target/,
  );
  assert.throws(
    () =>
      assertSearchEngineSyncReport({
        ...report,
        engines: report.engines.map((engine, index) => (index === 0 ? { ...engine, operations: [{ ...engine.operations[0], method: "POST" }] } : engine)),
      }),
    /operation method/,
  );
});

test("Typesense sync accepts existing collection response before upsert import", async () => {
  const calls = [];
  const report = await syncTypesense({
    baseUrl: "https://typesense.ms-realty.bg/",
    apiKey: "type-key",
    lookupImpl: PUBLIC_LOOKUP,
    fetchImpl: fakeFetch(calls, [409, 201]),
  });

  assert.equal(report.documents, 167);
  assert.equal(report.operations[0].status, 409);
  assert.equal(report.operations[1].status, 201);
});

test("search engine runtime fails closed without an authoritative payload runtime", async () => {
  const fetchImpl = async () => {
    throw new Error("search runtime should not reach fetch without payload runtime");
  };

  await assert.rejects(
    () => runSearchEngineSync({ fetchImpl }),
    /Payload runtime is not configured/,
  );
  await assert.rejects(
    () => runSearchEngineQuerySmoke({ fetchImpl }),
    /Payload runtime is not configured/,
  );
});

test("Typesense sync rejects non-accepted collection creation statuses even when fetch reports ok", async () => {
  await assert.rejects(
    () =>
      syncTypesense({
        baseUrl: "https://typesense.ms-realty.bg/",
        apiKey: "type-key",
        lookupImpl: PUBLIC_LOOKUP,
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

test("search engine query smoke reports authoritative Postgres hits", async () => {
  const calls = [];
  const hit = {
    id: "MS-CRAWL-0001:bg",
    source_listing_id: "MS-CRAWL-0001",
    listing_reference: "MS-CRAWL-0001",
    locale: "bg",
    locale_path: "/bg/imoti/MS-CRAWL-0001",
    title: "Reviewed listing",
  };
  const report = await runSearchEngineQuerySmoke({
    postgres: postgresFixture([hit]),
    projection: authoritativeProjection([hit]),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, async json() { return { hits: [hit] }; } };
    },
  });

  assert.equal(assertSearchEngineQueryReport(report), true);
  assert.equal(report.engines[0].engine, "postgres");
  assert.equal(report.engines[0].target, "ms_realty_public_search_documents");
  assert.equal(report.engines[0].database_target, POSTGRES_DATABASE_TARGET);
  assert.deepEqual(report.summary.targets, { postgres: "ms_realty_public_search_documents" });
  assert.deepEqual(report.summary.first_hit_ids, [hit.id]);
  assert.equal(calls.length, 0);
  assert.throws(
    () => assertSearchEngineQueryReport({ ...report, engines: [report.engines[0], { ...report.engines[0] }] }),
    /one Postgres engine row/,
  );
  assert.throws(() => assertSearchEngineQueryReport({ ...report, generated_at: "not-a-date" }), /valid generated_at/);
  assert.throws(
    () => assertSearchEngineQueryReport({ ...report, summary: { ...report.summary, total_hits: 2 } }),
    /summary hits/,
  );
  assert.throws(
    () => assertSearchEngineQueryReport({ ...report, summary: { ...report.summary, first_hit_ids: ["wrong"] } }),
    /summary first hits/,
  );
  assert.throws(
    () =>
      assertSearchEngineQueryReport({
        ...report,
        summary: { ...report.summary, targets: { postgres: "other_listings" } },
      }),
    /summary target/,
  );
  assert.throws(
    () =>
      assertSearchEngineQueryReport({
        ...report,
        engines: report.engines.map((engine, index) => (index === 0 ? { ...engine, database_target: "" } : engine)),
      }),
    /database target evidence/,
  );
  assert.throws(
    () =>
      assertSearchEngineQueryReport({
        ...report,
        engines: report.engines.map((engine, index) => (index === 0 ? { ...engine, operation: null } : engine)),
      }),
    /database target/,
  );
  for (const suffix of ["?sslpassword=secret", "#secret-fragment"]) {
    for (const field of ["summary", "engine", "operation"]) {
      const tampered = structuredClone(report);
      if (field === "summary") tampered.summary.database_target += suffix;
      if (field === "engine") tampered.engines[0].database_target += suffix;
      if (field === "operation") tampered.engines[0].operation.url += suffix;
      assert.throws(() => assertSearchEngineQueryReport(tampered), /exact redacted Postgres target/);
    }
  }
  for (const field of ["summary", "engine", "operation"]) {
    const tampered = structuredClone(report);
    const credentialedTarget = POSTGRES_DATABASE_TARGET.replace("postgres://", "postgres://runtime:secret@");
    if (field === "summary") tampered.summary.database_target = credentialedTarget;
    if (field === "engine") tampered.engines[0].database_target = credentialedTarget;
    if (field === "operation") tampered.engines[0].operation.url = credentialedTarget;
    assert.throws(() => assertSearchEngineQueryReport(tampered), /exact redacted Postgres target/);
  }
  assert.throws(
    () =>
      assertSearchEngineQueryReport({
        ...report,
        engines: report.engines.map((engine, index) =>
          index === 0 ? { ...engine, operation: { ...engine.operation, method: "POST" } } : engine,
        ),
      }),
    /database read operation/,
  );
  assert.throws(
    () =>
      assertSearchEngineQueryReport({
        ...report,
        engines: report.engines.map((engine, index) =>
          index === 0 ? { ...engine, operation: { ...engine.operation, status: 202 } } : engine,
        ),
      }),
    /database read operation/,
  );
  assert.throws(
    () =>
      assertSearchEngineQueryReport({
        ...report,
        summary: { ...report.summary, total_hits: 0, first_hit_ids: [null] },
        engines: report.engines.map((engine, index) => (index === 0 ? { ...engine, total: 0, hits: [] } : engine)),
      }),
    /must return search hits/,
  );
  assert.throws(
    () =>
      assertSearchEngineQueryReport({
        ...report,
        summary: { ...report.summary, first_hit_ids: ["OTHER:bg"] },
        engines: report.engines.map((engine, index) =>
          index === 0 ? { ...engine, hits: [{ ...hit, id: "OTHER:bg" }] } : engine,
        ),
      }),
    /find the current projection sample document/,
  );
});

test("search engine query validator rejects non-success postgres operation evidence", () => {
  const hit = {
    id: "MS-CRAWL-0001:bg",
    source_listing_id: "MS-CRAWL-0001",
    listing_reference: "MS-CRAWL-0001",
    locale: "bg",
    locale_path: "/bg/imoti/MS-CRAWL-0001",
    title: "Reviewed listing",
  };
  const report = {
    evidence_scope: "live",
    generated_at: "2026-08-11T08:31:00.000Z",
    source: authoritativeProjection([hit]).source,
    expectation: {
      projected_documents: 1,
      sample_document_id: hit.id,
    },
    summary: {
      engines: 1,
      targets: { postgres: "ms_realty_public_search_documents" },
      total_hits: 1,
      first_hit_ids: [hit.id],
      database_target: POSTGRES_DATABASE_TARGET,
    },
    engines: [
      {
        engine: "postgres",
        target: "ms_realty_public_search_documents",
        database_target: POSTGRES_DATABASE_TARGET,
        query: hit.listing_reference,
        operation: {
          method: "SELECT",
          status: 202,
          url: POSTGRES_DATABASE_TARGET,
          rows: 1,
        },
        total: 1,
        hits: [hit],
      },
    ],
  };

  assert.throws(() => assertSearchEngineQueryReport(report), /database read operation/);
});

test("generated search query smoke report is valid when present", () => {
  const file = fromRoot("production", "data", "search-engine-query-smoke.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertSearchEngineQueryReport(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});

test("live search engine CLIs fail closed without the authoritative Payload runtime", () => {
  const env = {
    ...process.env,
    PAYLOAD_SECRET: "",
    DATABASE_URL: "",
    TYPESENSE_URL: "",
    TYPESENSE_API_KEY: "",
    MEILI_URL: "",
    MEILI_API_KEY: "",
  };
  const cases = [
    ["run-search-engine-sync.mjs", /SEARCH ENGINE SYNC FAILED: Payload runtime is not configured/],
    ["run-search-engine-query.mjs", /SEARCH ENGINE QUERY FAILED: Payload runtime is not configured/],
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

test("live search engine CLIs do not sync fixtures when only search services are configured", async () => {
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
      PAYLOAD_SECRET: "",
      DATABASE_URL: "",
      MS_REALTY_SEARCH_ALLOW_PRIVATE_SERVICE_NETWORK: "true",
      MS_REALTY_SEARCH_SYNC_REPORT_PATH: syncReportPath,
      MS_REALTY_SEARCH_QUERY_REPORT_PATH: queryReportPath,
    };

    const sync = await runScript("run-search-engine-sync.mjs", env);
    const query = await runScript("run-search-engine-query.mjs", env);

    assert.notEqual(sync.status, 0);
    assert.notEqual(query.status, 0);
    assert.match(sync.stderr, /Payload runtime is not configured/);
    assert.match(query.stderr, /Payload runtime is not configured/);
    assert.equal(fs.existsSync(syncReportPath), false);
    assert.equal(fs.existsSync(queryReportPath), false);
  });
});
