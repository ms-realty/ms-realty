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

function meilisearchImportBody(body) {
  const identifiers = new Set();
  const documents = body
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const document = JSON.parse(line);
      const meiliId = String(document.id || "").replace(/[^A-Za-z0-9_-]/g, "_");
      if (!meiliId) throw new Error("Meilisearch document id is required");
      if (identifiers.has(meiliId)) throw new Error(`Duplicate Meilisearch document id: ${meiliId}`);
      identifiers.add(meiliId);
      return JSON.stringify({ ...document, meili_id: meiliId });
    });
  return `${documents.join("\n")}\n`;
}

function joinUrl(baseUrl, route) {
  return `${String(baseUrl).replace(/\/+$/, "")}${route}`;
}

function redactedUrl(value) {
  const parsed = new URL(value);
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  return parsed.href;
}

function required(value, name) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${name} is required`);
  if (/replace-with|change-me|example/i.test(text)) throw new Error(`${name} must not be a placeholder`);
  return value;
}

class SearchEngineUnavailableError extends Error {
  constructor(message, { cause } = {}) {
    super(message, { cause });
    this.name = "SearchEngineUnavailableError";
    this.unavailable = true;
  }
}

function isUnavailableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function isUnavailableError(error) {
  return error?.unavailable === true;
}

function missingSearchEngineConfig({ baseUrl, apiKey }) {
  return !String(baseUrl || "").trim() || !String(apiKey || "").trim();
}

async function checkedFetch(fetchImpl, url, options, acceptedStatuses = [200, 201, 202]) {
  const response = await fetchImpl(url, options);
  if (!acceptedStatuses.includes(response.status)) {
    throw new Error(`Search engine sync failed: ${options.method} ${url} returned ${response.status}`);
  }
  return {
    method: options.method,
    url: redactedUrl(url),
    status: response.status,
    bytes: Buffer.byteLength(options.body || ""),
  };
}

async function checkedJson(fetchImpl, url, options, acceptedStatuses = [200]) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch (cause) {
    throw new SearchEngineUnavailableError(`Search engine query failed: ${options.method} ${url} could not connect`, { cause });
  }
  if (!acceptedStatuses.includes(response.status)) {
    const error = new Error(`Search engine query failed: ${options.method} ${url} returned ${response.status}`);
    error.unavailable = isUnavailableStatus(response.status);
    throw error;
  }
  let payload;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new SearchEngineUnavailableError(`Search engine query failed: ${options.method} ${url} returned invalid JSON`, { cause });
  }
  return {
    payload,
    operation: {
      method: options.method,
      url: redactedUrl(url),
      status: response.status,
    },
  };
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

function assertReportUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must include valid service URL evidence`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(`${label} must include valid service URL evidence`);
  if (parsed.username || parsed.password) throw new Error(`${label} must not include URL credentials`);
}

function targetFieldForEngine(engine) {
  if (engine.engine === "typesense") return "collection";
  if (engine.engine === "meilisearch") return "index";
  throw new Error(`${engine.engine} search report engine is unsupported`);
}

function assertSearchEngineTarget(engine, label) {
  const field = targetFieldForEngine(engine);
  const target = String(engine[field] || "").trim();
  if (!target) throw new Error(`${label} must include ${field} evidence`);
  if (target.includes("/") || target.includes("?") || target.includes("#")) {
    throw new Error(`${label} ${field} evidence must be a target name`);
  }
  return { field, target };
}

function operationUrlsIncludeTarget(engine, target) {
  const encoded = encodeURIComponent(target);
  return (engine.operations || []).some((operation) => {
    try {
      return new URL(operation.url).pathname.split("/").includes(encoded);
    } catch {
      return false;
    }
  });
}

function hasSyncOperation(engine, { method, path, searchParam = null, statuses }) {
  return (engine.operations || []).some((operation) => {
    let parsed;
    try {
      parsed = new URL(operation.url);
    } catch {
      return false;
    }
    return (
      operation.method === method &&
      parsed.pathname === path &&
      (!searchParam || parsed.searchParams.get(searchParam.key) === searchParam.value) &&
      statuses.includes(operation.status)
    );
  });
}

function assertSearchSyncOperations(engine, target) {
  const encoded = encodeURIComponent(target);
  if (engine.engine === "typesense") {
    if (!hasSyncOperation(engine, { method: "POST", path: "/collections", statuses: [200, 201, 409] })) {
      throw new Error("typesense sync report must include collection create operation evidence");
    }
    if (
      !hasSyncOperation(engine, {
        method: "POST",
        path: `/collections/${encoded}/documents/import`,
        searchParam: { key: "action", value: "upsert" },
        statuses: [200, 201, 202],
      })
    ) {
      throw new Error("typesense sync report must include document import operation evidence");
    }
    return;
  }
  if (engine.engine === "meilisearch") {
    if (!hasSyncOperation(engine, { method: "PATCH", path: `/indexes/${encoded}/settings`, statuses: [200, 201, 202] })) {
      throw new Error("meilisearch sync report must include settings operation evidence");
    }
    if (
      !hasSyncOperation(engine, {
        method: "POST",
        path: `/indexes/${encoded}/documents`,
        searchParam: { key: "primaryKey", value: "meili_id" },
        statuses: [200, 201, 202],
      })
    ) {
      throw new Error("meilisearch sync report must include document import operation evidence");
    }
  }
}

function assertSearchQueryOperation(engine, target) {
  const operation = engine.operation || {};
  assertReportUrl(operation.url, `${engine.engine} query operation`);
  let parsed;
  try {
    parsed = new URL(operation.url);
  } catch {
    throw new Error(`${engine.engine} query operation must include valid service URL evidence`);
  }
  const encoded = encodeURIComponent(target);
  if (engine.engine === "typesense") {
    if (
      operation.method !== "GET" ||
      operation.status !== 200 ||
      parsed.pathname !== `/collections/${encoded}/documents/search` ||
      !parsed.searchParams.get("q") ||
      !parsed.searchParams.get("filter_by")
    ) {
      throw new Error("typesense query report must include document search operation evidence");
    }
    return;
  }
  if (engine.engine === "meilisearch") {
    if (operation.method !== "POST" || operation.status !== 200 || parsed.pathname !== `/indexes/${encoded}/search`) {
      throw new Error("meilisearch query report must include index search operation evidence");
    }
  }
}

function searchEngineTargets(engines) {
  return Object.fromEntries(engines.map((engine) => [engine.engine, engine.collection || engine.index]));
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
  const body = meilisearchImportBody(readBody(path.join(dataDir, "meilisearch-listings.ndjson")));
  const auth = { authorization: `Bearer ${apiKey}` };
  const operations = [
    await checkedFetch(fetchImpl, joinUrl(baseUrl, `/indexes/${encodeURIComponent(indexName)}/settings`), {
      method: "PATCH",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify(settings),
    }),
    await checkedFetch(fetchImpl, joinUrl(baseUrl, `/indexes/${encodeURIComponent(indexName)}/documents?primaryKey=meili_id`), {
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
      targets: searchEngineTargets(engines),
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
    const { target } = assertSearchEngineTarget(engine, `${engine.engine} sync report`);
    if (report.summary.targets?.[engine.engine] !== target) throw new Error("Search sync summary targets must match engine rows");
    if (!operationUrlsIncludeTarget(engine, target)) {
      throw new Error(`${engine.engine} sync report must include operation URL evidence for its target`);
    }
    if (engine.documents !== 167) throw new Error(`${engine.engine} must sync 167 locale-scoped documents`);
    for (const operation of engine.operations || []) {
      assertReportUrl(operation.url, `${engine.engine} sync operation`);
      if (!["PATCH", "POST"].includes(operation.method)) throw new Error(`${engine.engine} sync operation method is invalid`);
      if (![200, 201, 202, 409].includes(operation.status)) throw new Error(`${engine.engine} sync operation status is invalid`);
    }
    if (engine.operations.some((operation) => operation.bytes <= 0)) {
      throw new Error(`${engine.engine} operations must send non-empty request bodies`);
    }
    assertSearchSyncOperations(engine, target);
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
  filterBy = "translation_indexable:=true && locale:=bg && source_listing_id:=MS-CRAWL-0001",
  perPage = 5,
  fetchImpl = globalThis.fetch,
} = {}) {
  required(baseUrl, "TYPESENSE_URL");
  required(apiKey, "TYPESENSE_API_KEY");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for Typesense query");

  const params = new URLSearchParams({
    q: String(q || "").trim() || "*",
    query_by: "title,description,search_text,location",
    filter_by: filterBy,
    per_page: String(perPage),
  });
  const { payload, operation } = await checkedJson(
    fetchImpl,
    joinUrl(baseUrl, `/collections/${encodeURIComponent(collectionName)}/documents/search?${params}`),
    { method: "GET", headers: { "x-typesense-api-key": apiKey } },
  );

  return {
    engine: "typesense",
    service_url: redactedUrl(baseUrl),
    collection: collectionName,
    query: q,
    filter: filterBy,
    operation,
    total: Number(payload.found || 0),
    hits: (payload.hits || []).map((hit) => searchHit(hit.document || hit)),
  };
}

export async function queryMeilisearch({
  baseUrl = process.env.MEILI_URL,
  apiKey = process.env.MEILI_API_KEY,
  indexName = process.env.MEILI_INDEX || "ms_realty_listings",
  q = "Sandanski",
  filter = 'translation_indexable = true AND locale = bg AND source_listing_id = "MS-CRAWL-0001"',
  limit = 5,
  fetchImpl = globalThis.fetch,
} = {}) {
  required(baseUrl, "MEILI_URL");
  required(apiKey, "MEILI_API_KEY");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for Meilisearch query");

  const { payload, operation } = await checkedJson(fetchImpl, joinUrl(baseUrl, `/indexes/${encodeURIComponent(indexName)}/search`), {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ q, filter, limit }),
  });

  return {
    engine: "meilisearch",
    service_url: redactedUrl(baseUrl),
    index: indexName,
    query: q,
    filter,
    operation,
    total: Number(payload.estimatedTotalHits ?? payload.totalHits ?? 0),
    hits: (payload.hits || []).map(searchHit),
  };
}

function normalizedLocaleCodes(localeCodes) {
  const codes = [...new Set((localeCodes || []).map((code) => String(code || "").trim()).filter(Boolean))];
  if (!codes.length) throw new Error("Public search requires at least one locale code");
  return codes;
}

function typesenseLiteral(value) {
  return `\`${String(value).replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``;
}

function typesensePublicFilter(localeCodes) {
  const localeFilter = localeCodes.map((locale) => `locale:=${typesenseLiteral(locale)}`).join(" || ");
  return [
    "translation_indexable:=true",
    "translation_human_approved:=true",
    "locale_is_indexable:=true",
    localeCodes.length === 1 ? localeFilter : `(${localeFilter})`,
  ].join(" && ");
}

function meilisearchPublicFilter(localeCodes) {
  const localeFilter = localeCodes.map((locale) => `locale = ${JSON.stringify(locale)}`).join(" OR ");
  return [
    "translation_indexable = true",
    "translation_human_approved = true",
    "locale_is_indexable = true",
    localeCodes.length === 1 ? localeFilter : `(${localeFilter})`,
  ].join(" AND ");
}

export async function queryPublicSearch({
  typesense = {},
  meilisearch = {},
  q = "",
  localeCodes,
  perPage = 250,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedLocales = normalizedLocaleCodes(localeCodes);
  const unavailableEngines = [];

  if (missingSearchEngineConfig(typesense)) {
    unavailableEngines.push("typesense");
  } else {
    try {
      const result = await queryTypesense({
        ...typesense,
        q,
        filterBy: typesensePublicFilter(normalizedLocales),
        perPage,
        fetchImpl,
      });
      return {
        engine: "typesense",
        total: result.total,
        hits: result.hits,
        locale_codes: normalizedLocales,
        unavailable_engines: unavailableEngines,
      };
    } catch (error) {
      if (!isUnavailableError(error)) throw error;
      unavailableEngines.push("typesense");
    }
  }

  if (missingSearchEngineConfig(meilisearch)) {
    unavailableEngines.push("meilisearch");
  } else {
    try {
      const result = await queryMeilisearch({
        ...meilisearch,
        q,
        filter: meilisearchPublicFilter(normalizedLocales),
        limit: perPage,
        fetchImpl,
      });
      return {
        engine: "meilisearch",
        total: result.total,
        hits: result.hits,
        locale_codes: normalizedLocales,
        unavailable_engines: unavailableEngines,
      };
    } catch (error) {
      if (!isUnavailableError(error)) throw error;
      unavailableEngines.push("meilisearch");
    }
  }

  return {
    engine: "seed_fallback",
    total: null,
    hits: [],
    locale_codes: normalizedLocales,
    unavailable_engines: unavailableEngines,
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
      targets: searchEngineTargets(engines),
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
    assertReportUrl(engine.service_url, `${engine.engine} query report`);
    const { target } = assertSearchEngineTarget(engine, `${engine.engine} query report`);
    if (report.summary.targets?.[engine.engine] !== target) throw new Error("Search query summary targets must match engine rows");
    assertSearchQueryOperation(engine, target);
    if (!String(engine.query || "").trim()) throw new Error(`${engine.engine} query report must include query evidence`);
    if (
      !String(engine.filter || "").includes("translation_indexable") ||
      !String(engine.filter || "").includes("locale") ||
      !String(engine.filter || "").includes("source_listing_id")
    ) {
      throw new Error(`${engine.engine} query report must prove reviewed locale filtering`);
    }
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
