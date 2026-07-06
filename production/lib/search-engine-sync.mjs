import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_SEARCH_DATA_DIR = fromRoot("search", "data");
export const DEFAULT_SEARCH_ENGINE_SYNC_REPORT = fromRoot("production", "data", "search-engine-sync-report.json");
export const DEFAULT_SEARCH_ENGINE_SYNC_SMOKE = fromRoot("production", "data", "search-engine-sync-smoke.json");

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
  if (report.summary.engines !== 2) throw new Error("Search sync must cover Typesense and Meilisearch");
  if (report.summary.total_operations !== 4) throw new Error("Search sync must perform four engine operations");
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
