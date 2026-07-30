#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { queryMeilisearch, queryTypesense } from "../production/lib/search-engine-sync.mjs";

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

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

async function measure(run, iterations) {
  const milliseconds = [];
  let first;
  for (let index = 0; index < iterations; index += 1) {
    const started = process.hrtime.bigint();
    const result = await run();
    milliseconds.push(Number(process.hrtime.bigint() - started) / 1_000_000);
    first ||= result;
  }
  return {
    samples_ms: milliseconds.map((value) => Number(value.toFixed(3))),
    p50_ms: Number(percentile(milliseconds, 0.5).toFixed(3)),
    p95_ms: Number(percentile(milliseconds, 0.95).toFixed(3)),
    total_hits: first.total,
  };
}

const query = argument("--query") || baseline.workload.query;
const locale = argument("--locale") || baseline.workload.locale;
const iterations = positiveInteger(argument("--iterations") || baseline.workload.iterations, "--iterations");
const typesense = {
  baseUrl: requiredArgument("--typesense-url"),
  apiKey: requiredArgument("--typesense-key"),
  collectionName: argument("--typesense-collection") || "ms_realty_listings",
};
const meilisearch = {
  baseUrl: requiredArgument("--meili-url"),
  apiKey: requiredArgument("--meili-key"),
  indexName: argument("--meili-index") || "ms_realty_listings",
};
const typesenseFilter = `publication_state:=published && translation_human_approved:=true && locale_indexable:=true && locale:=\`${locale}\``;
const meilisearchFilter = `publication_state = "published" AND translation_human_approved = true AND locale_indexable = true AND locale = ${JSON.stringify(locale)}`;
const report = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  baseline,
  workload: { query, locale, iterations },
  engines: {
    typesense: await measure(() => queryTypesense({ ...typesense, q: query, filterBy: typesenseFilter, perPage: 20 }), iterations),
    meilisearch: await measure(() => queryMeilisearch({ ...meilisearch, q: query, filter: meilisearchFilter, limit: 20 }), iterations),
  },
};
const output = argument("--out");
if (output) {
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
