import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_SEARCH_DATA_DIR = fromRoot("search", "data");
export const DEFAULT_SEARCH_ENGINE_SYNC_REPORT = fromRoot("production", "data", "search-engine-sync-report.json");
export const DEFAULT_SEARCH_ENGINE_SYNC_SMOKE = fromRoot("production", "data", "search-engine-sync-smoke.json");
export const DEFAULT_SEARCH_ENGINE_QUERY_REPORT = fromRoot("production", "data", "search-engine-query-report.json");
export const DEFAULT_SEARCH_ENGINE_QUERY_SMOKE = fromRoot("production", "data", "search-engine-query-smoke.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readBody(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function rowCount(body) {
  return body.split("\n").filter(Boolean).length;
}

function joinUrl(baseUrl, route) {
  return `${String(baseUrl).replace(/\/+$/, "")}${route}`;
}

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function checkedFetch(fetchImpl, url, options, acceptedStatuses = [200, 201, 202]) {
  const response = await fetchImpl(url, options);
  if (!acceptedStatuses.includes(response.status) && response.ok !== true) {
    throw new Error(`Search engine sync failed: ${options.method} ${url} returned ${response.status}`);
  }
  return {
    method: options.method,
    url,
    status: response.status,
    bytes: Buffer.byteLength(options.body || ""),
  };
}

async function checkedJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  if (response.ok !== true) throw new Error(`Search engine query failed: ${options.method} ${url} returned ${response.status}`);
  return response.json();
}

function searchHit(doc) {
  return {
    id: doc.id,
    source_listing_id: doc.source_listing_id,
    locale: doc.locale,
    locale_path: doc.locale_path,
    title: doc.title,
  };
}

function assertSearchEngines(report, label) {
  const engines = (report.engines || []).map((engine) => engine.engine).sort();
  if (engines.join("|") !== "meilisearch|typesense") {
    throw new Error(`${label} must cover Typesense and Meilisearch exactly once`);
  }
}

export async function syncTypesense({
  baseUrl = process.env.TYPESENSE_URL,
  apiKey = process.env.TYPESENSE_API_KEY,
  collectionName = process.env.TYPESENSE_COLLECTION || "ms_realty_listings",
  dataDir = DEFAULT_SEARCH_DATA_DIR,
  fetchImpl = globalThis.fetch,
} = {}) {
  required(baseUrl, "TYPESENSE_URL");
  required(apiKey, "TYPESENSE_API_KEY");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for Typesense sync");

  const schema = { ...readJson(path.join(dataDir, "typesense-schema.json")), name: collectionName };
  const body = readBody(path.join(dataDir, "typesense-listings.jsonl"));
  const headers = { "content-type": "application/json", "x-typesense-api-key": apiKey };
  const operations = [
    await checkedFetch(
      fetchImpl,
      joinUrl(baseUrl, "/collections"),
      { method: "POST", headers, body: JSON.stringify(schema) },
      [200, 201, 409],
    ),
    await checkedFetch(fetchImpl, joinUrl(baseUrl, `/collections/${encodeURIComponent(collectionName)}/documents/import?action=upsert`), {
      method: "POST",
      headers: { "x-typesense-api-key": apiKey, "content-type": "application/x-ndjson" },
      body,
    }),
  ];

  return {
    engine: "typesense",
    collection: collectionName,
    documents: rowCount(body),
    operations,
  };
}

export async function syncMeilisearch({
  baseUrl = process.env.MEILI_URL,
  apiKey = process.env.MEILI_API_KEY,
  indexName = process.env.MEILI_INDEX || "ms_realty_listings",
  dataDir = DEFAULT_SEARCH_DATA_DIR,
  fetchImpl = globalThis.fetch,
} = {}) {
  required(baseUrl, "MEILI_URL");
  required(apiKey, "MEILI_API_KEY");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for Meilisearch sync");

  const settings = readJson(path.join(dataDir, "meilisearch-settings.json"));
  const body = readBody(path.join(dataDir, "meilisearch-listings.ndjson"));
  const auth = { authorization: `Bearer ${apiKey}` };
  const operations = [
    await checkedFetch(fetchImpl, joinUrl(baseUrl, `/indexes/${encodeURIComponent(indexName)}/settings`), {
      method: "PATCH",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify(settings),
    }),
    await checkedFetch(fetchImpl, joinUrl(baseUrl, `/indexes/${encodeURIComponent(indexName)}/documents?primaryKey=id`), {
      method: "POST",
      headers: { ...auth, "content-type": "application/x-ndjson" },
      body,
    }),
  ];

  return {
    engine: "meilisearch",
    index: indexName,
    documents: rowCount(body),
    operations,
  };
}

export async function runSearchEngineSync({
  typesense = {},
  meilisearch = {},
  fetchImpl = globalThis.fetch,
  generatedAt = "2026-07-06T00:00:00Z",
} = {}) {
  const engines = [
    await syncTypesense({ ...typesense, fetchImpl }),
    await syncMeilisearch({ ...meilisearch, fetchImpl }),
  ];

  return {
    generated_at: generatedAt,
    summary: {
      engines: engines.length,
      documents_per_engine: engines.map((engine) => engine.documents),
      total_operations: engines.reduce((sum, engine) => sum + engine.operations.length, 0),
    },
    engines,
  };
}

export function assertSearchEngineSyncReport(report) {
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("Search sync report must include valid generated_at");
  }
  if (report.summary.engines !== 2) throw new Error("Search sync must cover Typesense and Meilisearch");
  if (report.summary.total_operations !== 4) throw new Error("Search sync must perform four engine operations");
  assertSearchEngines(report, "Search sync");
  if (JSON.stringify(report.summary.documents_per_engine) !== JSON.stringify(report.engines.map((engine) => engine.documents))) {
    throw new Error("Search sync summary documents must match engine rows");
  }
  const operationCount = report.engines.reduce((sum, engine) => sum + (engine.operations || []).length, 0);
  if (report.summary.total_operations !== operationCount) throw new Error("Search sync summary operations must match engine rows");
  for (const engine of report.engines) {
    if (engine.documents !== 167) throw new Error(`${engine.engine} must sync 167 locale-scoped documents`);
    if (engine.operations.some((operation) => operation.bytes <= 0)) {
      throw new Error(`${engine.engine} operations must send non-empty request bodies`);
    }
  }
  return true;
}

export function writeSearchEngineSyncReport(report, filePath = DEFAULT_SEARCH_ENGINE_SYNC_REPORT) {
  assertSearchEngineSyncReport(report);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}

export async function queryTypesense({
  baseUrl = process.env.TYPESENSE_URL,
  apiKey = process.env.TYPESENSE_API_KEY,
  collectionName = process.env.TYPESENSE_COLLECTION || "ms_realty_listings",
  q = "Sandanski",
  filterBy = "translation_indexable:=true && locale:=bg",
  fetchImpl = globalThis.fetch,
} = {}) {
  required(baseUrl, "TYPESENSE_URL");
  required(apiKey, "TYPESENSE_API_KEY");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for Typesense query");

  const params = new URLSearchParams({
    q,
    query_by: "title,description,search_text,location",
    filter_by: filterBy,
    per_page: "5",
  });
  const payload = await checkedJson(
    fetchImpl,
    joinUrl(baseUrl, `/collections/${encodeURIComponent(collectionName)}/documents/search?${params}`),
    { method: "GET", headers: { "x-typesense-api-key": apiKey } },
  );

  return {
    engine: "typesense",
    query: q,
    filter: filterBy,
    total: Number(payload.found || 0),
    hits: (payload.hits || []).map((hit) => searchHit(hit.document || hit)),
  };
}

export async function queryMeilisearch({
  baseUrl = process.env.MEILI_URL,
  apiKey = process.env.MEILI_API_KEY,
  indexName = process.env.MEILI_INDEX || "ms_realty_listings",
  q = "Sandanski",
  filter = "translation_indexable = true AND locale = bg",
  fetchImpl = globalThis.fetch,
} = {}) {
  required(baseUrl, "MEILI_URL");
  required(apiKey, "MEILI_API_KEY");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for Meilisearch query");

  const payload = await checkedJson(fetchImpl, joinUrl(baseUrl, `/indexes/${encodeURIComponent(indexName)}/search`), {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ q, filter, limit: 5 }),
  });

  return {
    engine: "meilisearch",
    query: q,
    filter,
    total: Number(payload.estimatedTotalHits ?? payload.totalHits ?? 0),
    hits: (payload.hits || []).map(searchHit),
  };
}

export async function runSearchEngineQuerySmoke({
  typesense = {},
  meilisearch = {},
  fetchImpl = globalThis.fetch,
  generatedAt = "2026-07-06T00:00:00Z",
} = {}) {
  const engines = [
    await queryTypesense({ ...typesense, fetchImpl }),
    await queryMeilisearch({ ...meilisearch, fetchImpl }),
  ];
  return {
    generated_at: generatedAt,
    summary: {
      engines: engines.length,
      total_hits: engines.reduce((sum, engine) => sum + engine.total, 0),
      first_hit_ids: engines.map((engine) => engine.hits[0]?.id || null),
    },
    engines,
  };
}

export function assertSearchEngineQueryReport(report) {
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("Search query smoke report must include valid generated_at");
  }
  if (report.summary.engines !== 2) throw new Error("Search query smoke must cover Typesense and Meilisearch");
  assertSearchEngines(report, "Search query smoke");
  const totalHits = report.engines.reduce((sum, engine) => sum + engine.total, 0);
  if (report.summary.total_hits !== totalHits) throw new Error("Search query summary hits must match engine rows");
  if (JSON.stringify(report.summary.first_hit_ids) !== JSON.stringify(report.engines.map((engine) => engine.hits?.[0]?.id || null))) {
    throw new Error("Search query summary first hits must match engine rows");
  }
  for (const engine of report.engines) {
    if (engine.total < 1 || !engine.hits.length) throw new Error(`${engine.engine} query must return search hits`);
    if (!engine.hits.some((hit) => hit.id === "MS-CRAWL-0001:bg")) {
      throw new Error(`${engine.engine} query must find the reviewed BG listing document`);
    }
    if (engine.hits.some((hit) => hit.locale === "fr")) throw new Error(`${engine.engine} query must not return draft French docs`);
  }
  return true;
}

export function writeSearchEngineQueryReport(report, filePath = DEFAULT_SEARCH_ENGINE_QUERY_REPORT) {
  assertSearchEngineQueryReport(report);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}
