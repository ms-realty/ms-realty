#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBenchmarkCorpus } from "./benchmark-corpus.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, "search", "data", "search-engine-benchmark.json"), "utf8"));

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function requiredArgument(name) {
  const value = argument(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${label} must be a positive integer`);
  return number;
}

function checkedBaseUrl(value, label) {
  const baseUrl = String(value || "").trim();
  if (!baseUrl) throw new Error(`${label} is required`);
  const parsed = new URL(baseUrl);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`${label} must be an HTTP(S) URL without embedded credentials`);
  }
  return baseUrl.replace(/\/+$/, "");
}

function checkedSecret(value, label) {
  const secret = String(value || "").trim();
  if (!secret || /replace-with|change-me|example/i.test(secret)) throw new Error(`${label} is required and must not be a placeholder`);
  return secret;
}

function joinUrl(baseUrl, route) {
  return `${baseUrl}${route}`;
}

async function request(fetchImpl, url, options, acceptedStatuses, { json = false } = {}) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch (cause) {
    throw new Error(`Benchmark bootstrap request could not connect: ${options.method} ${url}`, { cause });
  }
  if (!acceptedStatuses.includes(response.status)) {
    throw new Error(`Benchmark bootstrap request failed: ${options.method} ${url} returned ${response.status}`);
  }
  if (!json) return { status: response.status, payload: null };
  try {
    return { status: response.status, payload: await response.json() };
  } catch (cause) {
    throw new Error(`Benchmark bootstrap request returned invalid JSON: ${options.method} ${url}`, { cause });
  }
}

function meilisearchTaskUid(payload) {
  const value = payload?.taskUid ?? payload?.uid;
  if (value === undefined || value === null || value === "") throw new Error("Meilisearch bootstrap response did not include taskUid");
  return String(value);
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function waitForMeilisearchTask({
  baseUrl,
  apiKey,
  taskUid,
  fetchImpl = globalThis.fetch,
  timeoutMs = 60_000,
  pollMs = 100,
} = {}) {
  const deadline = Date.now() + positiveInteger(timeoutMs, "Meilisearch task timeout");
  const taskId = encodeURIComponent(String(taskUid));
  while (Date.now() <= deadline) {
    const { payload } = await request(
      fetchImpl,
      joinUrl(baseUrl, `/tasks/${taskId}`),
      { method: "GET", headers: { authorization: `Bearer ${apiKey}` } },
      [200],
      { json: true },
    );
    if (payload.status === "succeeded") return { task_uid: String(taskUid), status: payload.status };
    if (["failed", "canceled"].includes(payload.status)) {
      throw new Error(`Meilisearch bootstrap task ${taskUid} did not succeed: ${payload.status}`);
    }
    await pause(positiveInteger(pollMs, "Meilisearch task poll interval"));
  }
  throw new Error(`Meilisearch bootstrap task ${taskUid} timed out after ${timeoutMs}ms`);
}

export async function bootstrapBenchmarkCorpus({
  typesense,
  meilisearch,
  dataDir = path.join(ROOT, "search", "data"),
  corpusSchema = baseline.corpus_schema,
  fetchImpl = globalThis.fetch,
  taskTimeoutMs = 60_000,
  taskPollMs = 100,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for benchmark bootstrap");
  const corpus = loadBenchmarkCorpus({ dataDir, corpusSchema });
  const typesenseConfig = {
    baseUrl: checkedBaseUrl(typesense?.baseUrl, "--typesense-url"),
    apiKey: checkedSecret(typesense?.apiKey, "--typesense-key"),
    collectionName: String(typesense?.collectionName || "ms_realty_listings").trim(),
  };
  const meilisearchConfig = {
    baseUrl: checkedBaseUrl(meilisearch?.baseUrl, "--meili-url"),
    apiKey: checkedSecret(meilisearch?.apiKey, "--meili-key"),
    indexName: String(meilisearch?.indexName || "ms_realty_listings").trim(),
  };
  if (!typesenseConfig.collectionName || !meilisearchConfig.indexName) throw new Error("Benchmark index and collection names are required");

  const typesenseBody = fs.readFileSync(path.join(corpus.data_dir, "typesense-listings.jsonl"), "utf8");
  const meilisearchBody = fs.readFileSync(path.join(corpus.data_dir, "meilisearch-listings.ndjson"), "utf8");
  const typesenseHeaders = { "content-type": "application/json", "x-typesense-api-key": typesenseConfig.apiKey };
  await request(
    fetchImpl,
    joinUrl(typesenseConfig.baseUrl, "/collections"),
    { method: "POST", headers: typesenseHeaders, body: JSON.stringify({ ...corpus.typesenseSchema, name: typesenseConfig.collectionName }) },
    [200, 201, 409],
  );
  await request(
    fetchImpl,
    joinUrl(typesenseConfig.baseUrl, `/collections/${encodeURIComponent(typesenseConfig.collectionName)}/documents/import?action=upsert`),
    {
      method: "POST",
      headers: { "content-type": "application/x-ndjson", "x-typesense-api-key": typesenseConfig.apiKey },
      body: typesenseBody,
    },
    [200, 201],
  );

  const meilisearchHeaders = { authorization: `Bearer ${meilisearchConfig.apiKey}`, "content-type": "application/json" };
  const settings = await request(
    fetchImpl,
    joinUrl(meilisearchConfig.baseUrl, `/indexes/${encodeURIComponent(meilisearchConfig.indexName)}/settings`),
    { method: "PATCH", headers: meilisearchHeaders, body: JSON.stringify(corpus.meilisearchSettings) },
    [200, 201, 202],
    { json: true },
  );
  const settingsTask = await waitForMeilisearchTask({
    baseUrl: meilisearchConfig.baseUrl,
    apiKey: meilisearchConfig.apiKey,
    taskUid: meilisearchTaskUid(settings.payload),
    fetchImpl,
    timeoutMs: taskTimeoutMs,
    pollMs: taskPollMs,
  });
  const documents = await request(
    fetchImpl,
    joinUrl(meilisearchConfig.baseUrl, `/indexes/${encodeURIComponent(meilisearchConfig.indexName)}/documents?primaryKey=meili_id`),
    { method: "POST", headers: { ...meilisearchHeaders, "content-type": "application/x-ndjson" }, body: meilisearchBody },
    [200, 201, 202],
    { json: true },
  );
  const documentsTask = await waitForMeilisearchTask({
    baseUrl: meilisearchConfig.baseUrl,
    apiKey: meilisearchConfig.apiKey,
    taskUid: meilisearchTaskUid(documents.payload),
    fetchImpl,
    timeoutMs: taskTimeoutMs,
    pollMs: taskPollMs,
  });
  return {
    corpus: {
      corpus_schema: corpus.corpus_schema,
      documents: corpus.document_count,
      filter_fields: corpus.filter_fields,
      typesense_query_fields: corpus.typesense_query_fields,
    },
    typesense: { collection: typesenseConfig.collectionName, imported_documents: corpus.document_count },
    meilisearch: { index: meilisearchConfig.indexName, imported_documents: corpus.document_count, tasks: [settingsTask, documentsTask] },
  };
}

async function main() {
  const dataDir = path.resolve(argument("--data-dir") || path.join(ROOT, "search", "data"));
  const corpusSchema = argument("--corpus-schema") || baseline.corpus_schema;
  if (process.argv.includes("--preflight")) {
    const corpus = loadBenchmarkCorpus({ dataDir, corpusSchema });
    console.log(
      JSON.stringify(
        {
          corpus_schema: corpus.corpus_schema,
          data_dir: corpus.data_dir,
          documents: corpus.document_count,
          filter_fields: corpus.filter_fields,
          typesense_query_fields: corpus.typesense_query_fields,
        },
        null,
        2,
      ),
    );
    return;
  }
  const result = await bootstrapBenchmarkCorpus({
    dataDir,
    corpusSchema,
    typesense: {
      baseUrl: requiredArgument("--typesense-url"),
      apiKey: requiredArgument("--typesense-key"),
      collectionName: argument("--typesense-collection") || "ms_realty_listings",
    },
    meilisearch: {
      baseUrl: requiredArgument("--meili-url"),
      apiKey: requiredArgument("--meili-key"),
      indexName: argument("--meili-index") || "ms_realty_listings",
    },
    taskTimeoutMs: positiveInteger(argument("--task-timeout-ms") || 60_000, "--task-timeout-ms"),
    taskPollMs: positiveInteger(argument("--task-poll-ms") || 100, "--task-poll-ms"),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((error) => {
    console.error(`Benchmark bootstrap failed: ${error.message}`);
    process.exitCode = 1;
  });
}
