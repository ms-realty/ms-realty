import fs from "node:fs";
import path from "node:path";

export const BENCHMARK_CORPUS_SCHEMAS = Object.freeze({
  legacy_fixture_v1: Object.freeze({
    filter_fields: Object.freeze(["translation_indexable", "translation_human_approved", "locale_is_indexable", "translation_status", "locale"]),
    typesense_query_fields: Object.freeze(["title", "description", "search_text", "location"]),
    meilisearch_query_fields: Object.freeze(["title", "description", "search_text", "location"]),
    typesense_filter: (locale) =>
      `translation_indexable:=true && translation_human_approved:=true && locale_is_indexable:=true && translation_status:=[published,approved] && locale:=\`${locale}\``,
    meilisearch_filter: (locale) =>
      `translation_indexable = true AND translation_human_approved = true AND locale_is_indexable = true AND (translation_status = "published" OR translation_status = "approved") AND locale = ${JSON.stringify(locale)}`,
  }),
  approved_projection_v1: Object.freeze({
    filter_fields: Object.freeze([
      "publication_state",
      "listing_status",
      "translation_indexable",
      "translation_human_approved",
      "locale_indexable",
      "locale",
    ]),
    typesense_query_fields: Object.freeze(["title", "description", "search_text", "location_label", "listing_reference"]),
    meilisearch_query_fields: Object.freeze(["title", "description", "search_text", "location_label", "listing_reference"]),
    typesense_filter: (locale) =>
      `publication_state:=published && (listing_status:=available || listing_status:=reserved) && translation_indexable:=true && translation_human_approved:=true && locale_indexable:=true && locale:=\`${locale}\``,
    meilisearch_filter: (locale) =>
      `publication_state = "published" AND (listing_status = "available" OR listing_status = "reserved") AND translation_indexable = true AND translation_human_approved = true AND locale_indexable = true AND locale = ${JSON.stringify(locale)}`,
  }),
});

function nonEmptyText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

export function benchmarkCorpusSchema(value = "legacy_fixture_v1") {
  const name = nonEmptyText(value, "Benchmark corpus schema");
  const profile = BENCHMARK_CORPUS_SCHEMAS[name];
  if (!profile) throw new Error(`Unsupported benchmark corpus schema: ${name}`);
  return { name, ...profile };
}

export function benchmarkPublicFilters({ corpusSchema = "legacy_fixture_v1", locale = "bg" } = {}) {
  const profile = benchmarkCorpusSchema(corpusSchema);
  const localeCode = nonEmptyText(locale, "Benchmark locale");
  return {
    corpus_schema: profile.name,
    typesense: profile.typesense_filter(localeCode),
    meilisearch: profile.meilisearch_filter(localeCode),
    typesense_query_by: profile.typesense_query_fields.join(","),
  };
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Benchmark ${label} is unreadable: ${filePath}`, { cause: error });
  }
}

function fieldNames(schema) {
  if (!schema || !Array.isArray(schema.fields)) throw new Error("Benchmark Typesense schema must contain fields");
  return new Set(schema.fields.map((field) => field?.name).filter(Boolean));
}

function filterableNames(settings) {
  if (!settings || !Array.isArray(settings.filterableAttributes)) {
    throw new Error("Benchmark Meilisearch settings must contain filterableAttributes");
  }
  return new Set(settings.filterableAttributes);
}

function searchableNames(settings) {
  if (!settings || !Array.isArray(settings.searchableAttributes)) {
    throw new Error("Benchmark Meilisearch settings must contain searchableAttributes");
  }
  return new Set(settings.searchableAttributes);
}

export function assertBenchmarkCorpusCompatibility({ corpusSchema = "legacy_fixture_v1", typesenseSchema, meilisearchSettings, documents } = {}) {
  const profile = benchmarkCorpusSchema(corpusSchema);
  const typesense = fieldNames(typesenseSchema);
  const meilisearch = filterableNames(meilisearchSettings);
  const meilisearchSearchable = searchableNames(meilisearchSettings);
  if (!Array.isArray(documents) || !documents.length) throw new Error("Benchmark corpus must contain at least one document");
  for (const field of profile.filter_fields) {
    if (!typesense.has(field)) throw new Error(`Benchmark ${profile.name} filter field is missing from Typesense schema: ${field}`);
    if (!meilisearch.has(field)) throw new Error(`Benchmark ${profile.name} filter field is not filterable in Meilisearch: ${field}`);
    if (documents.some((document) => document?.[field] === undefined)) {
      throw new Error(`Benchmark ${profile.name} filter field is missing from corpus documents: ${field}`);
    }
  }
  for (const field of profile.typesense_query_fields) {
    if (!typesense.has(field)) throw new Error(`Benchmark ${profile.name} query field is missing from Typesense schema: ${field}`);
  }
  for (const field of profile.meilisearch_query_fields) {
    if (!meilisearchSearchable.has(field)) throw new Error(`Benchmark ${profile.name} query field is not searchable in Meilisearch: ${field}`);
  }
  return {
    corpus_schema: profile.name,
    document_count: documents.length,
    filter_fields: [...profile.filter_fields],
    typesense_query_fields: [...profile.typesense_query_fields],
  };
}

export function loadBenchmarkCorpus({ dataDir, corpusSchema = "legacy_fixture_v1" } = {}) {
  const directory = nonEmptyText(dataDir, "Benchmark data directory");
  const typesenseSchema = readJson(path.join(directory, "typesense-schema.json"), "Typesense schema");
  const meilisearchSettings = readJson(path.join(directory, "meilisearch-settings.json"), "Meilisearch settings");
  const documents = readJson(path.join(directory, "index-listings.json"), "index documents");
  const compatibility = assertBenchmarkCorpusCompatibility({ corpusSchema, typesenseSchema, meilisearchSettings, documents });
  return { ...compatibility, data_dir: directory, typesenseSchema, meilisearchSettings, documents };
}
