import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv.mjs";
import { REQUIRED_SOURCE_DOMAINS, assertSeoEvidence, missingRequiredSources } from "./seo-evidence-contract.mjs";
import {
  SEO_EXPORTS,
  addMetric,
  externalRowDedupeKey,
  invalidBacklinkReferral,
  normalizeExternalRow,
  routeKeys,
} from "./seo-evidence-shared.mjs";
import { fromRoot } from "./paths.mjs";

function seoEvidencePath(config) {
  return config.seoEvidenceOutputPath || fromRoot("production", "data", "seo-evidence.json");
}

function seoInputPath(source, config, suffix = "") {
  const filename = SEO_EXPORTS[source];
  if (!filename) throw new Error(`Unknown SEO export source: ${source}`);
  if (config.seoEvidenceInputDir) {
    return path.join(/*turbopackIgnore: true*/ config.seoEvidenceInputDir, `${filename}${suffix}`);
  }
  return fromRoot("migration", "external", "seo", `${filename}${suffix}`);
}

function readDefaultSeoEvidence() {
  return JSON.parse(fs.readFileSync(fromRoot("production", "data", "seo-evidence.json"), "utf8"));
}

function overlayInputDirectoryEvidence(config) {
  const evidence = readDefaultSeoEvidence();
  evidence.generated_at = config.reviewedAt || new Date().toISOString();
  for (const source of Object.keys(SEO_EXPORTS)) {
    const inputPath = seoInputPath(source, config);
    if (!fs.existsSync(/*turbopackIgnore: true*/ inputPath)) continue;
    const csv = fs.readFileSync(/*turbopackIgnore: true*/ inputPath, "utf8");
    const rows = parseCsv(csv).map((row) => normalizeExternalRow(source, row));
    evidence.summary.sources[source] = {
      source,
      input_path: inputPath,
      status: rows.length ? "imported" : "empty_export",
      row_count: rows.length,
      ...joinSource(source, rows, evidence),
    };
  }
  updateMissingRequiredSources(evidence);
  updateEvidenceCounts(evidence);
  return evidence;
}

export function readAppSeoEvidence(config) {
  const candidate = seoEvidencePath(config);
  if (config.seoEvidenceOutputPath && fs.existsSync(/*turbopackIgnore: true*/ candidate)) {
    return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ candidate, "utf8"));
  }
  if (config.seoEvidenceInputDir) return overlayInputDirectoryEvidence(config);
  const filePath = fs.existsSync(/*turbopackIgnore: true*/ candidate) ? candidate : fromRoot("production", "data", "seo-evidence.json");
  return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ filePath, "utf8"));
}

function evidenceIndex(evidence) {
  const byKey = new Map();
  for (const row of evidence.url_evidence || []) {
    for (const key of routeKeys(row.old_url)) byKey.set(key, row);
    for (const key of routeKeys(row.target_path)) byKey.set(key, row);
  }
  return byKey;
}

function resetSourceMetrics(source, evidence) {
  for (const row of evidence.url_evidence || []) {
    if (source === "search_console") row.search_console = { clicks: 0, impressions: 0, avg_position: 0 };
    if (source === "yandex_webmaster") row.yandex_webmaster = { rows: 0, issues: 0 };
    if (source === "backlinks") row.backlinks = { backlinks: 0, referring_domains: 0 };
    if (source === "analytics_export") row.analytics = { ...row.analytics, exported_page_views: 0 };
  }
}

function joinSource(source, rows, evidence) {
  const byKey = evidenceIndex(evidence);
  const seenRows = new Set();
  const referringDomains = new Set();
  const matchedSourceDomains = new Set();
  let matched = 0;
  let signalRows = 0;
  let unmatched = 0;
  let duplicateRows = 0;
  let placeholderRows = 0;

  resetSourceMetrics(source, evidence);

  for (const row of rows) {
    const target = row.keys.map((key) => byKey.get(key)).find(Boolean);
    if (!target) {
      unmatched += 1;
      continue;
    }

    const dedupeKey = externalRowDedupeKey(source, target, row);
    if (seenRows.has(dedupeKey)) {
      duplicateRows += 1;
      continue;
    }
    seenRows.add(dedupeKey);
    matched += 1;
    matchedSourceDomains.add(target.source_domain);

    if (source === "search_console") {
      if (row.clicks > 0 || row.impressions > 0) signalRows += 1;
      addMetric(target.search_console, "clicks", row.clicks);
      addMetric(target.search_console, "impressions", row.impressions);
      if (row.position) target.search_console.avg_position = row.position;
    } else if (source === "yandex_webmaster") {
      if (row.indexed || row.issue) signalRows += 1;
      addMetric(target.yandex_webmaster, "rows", 1);
      if (row.issue) addMetric(target.yandex_webmaster, "issues", 1);
    } else if (source === "backlinks") {
      if (invalidBacklinkReferral(row, target)) placeholderRows += 1;
      else if (row.source_url || row.referring_domain) signalRows += 1;
      addMetric(target.backlinks, "backlinks", 1);
      if (row.referring_domain) referringDomains.add(`${target.old_url}|${row.referring_domain}`);
    } else if (source === "analytics_export") {
      if (row.page_views > 0) signalRows += 1;
      addMetric(target.analytics, "exported_page_views", row.page_views);
    }
  }

  for (const key of referringDomains) {
    const [oldUrl] = key.split("|");
    const target = byKey.get(oldUrl);
    if (target) addMetric(target.backlinks, "referring_domains", 1);
  }

  return {
    matched_rows: matched,
    signal_rows: signalRows,
    unmatched_rows: unmatched,
    duplicate_rows: duplicateRows,
    placeholder_rows: placeholderRows,
    matched_source_domains: [...matchedSourceDomains].sort(),
  };
}

function updateMissingRequiredSources(evidence) {
  evidence.summary.missing_required_sources = missingRequiredSources(evidence.summary.sources || {});
}

function updateEvidenceCounts(evidence) {
  evidence.summary.urls_with_any_evidence = (evidence.url_evidence || []).filter(
    (row) =>
      row.search_console?.impressions ||
      row.yandex_webmaster?.rows ||
      row.backlinks?.backlinks ||
      row.analytics?.page_views ||
      row.analytics?.exported_page_views,
  ).length;
}

export function seoEvidencePayload(evidence) {
  return {
    missingRequiredSources: evidence.summary.missing_required_sources,
    requiredSourceDomains: REQUIRED_SOURCE_DOMAINS,
    crawlCoverage: {
      urls: evidence.summary.crawl_urls,
      urlTypes: evidence.summary.url_types,
      urlsWithAnyEvidence: evidence.summary.urls_with_any_evidence,
    },
    sources: evidence.summary.sources,
    importEndpoint: "/api/admin/seo-evidence/import",
    templateEndpoint: "/api/admin/seo-evidence/template",
    exportEndpoint: "/api/admin/seo-evidence/export",
  };
}

export function readAppSeoEvidenceTemplate(url, config) {
  const source = url.searchParams.get("source");
  const filename = SEO_EXPORTS[source];
  if (!filename) throw new Error(`Unknown SEO export source: ${source}`);
  const templatePath = seoInputPath(source, config, ".example");
  if (!fs.existsSync(/*turbopackIgnore: true*/ templatePath)) throw new Error(`Missing SEO export template for ${source}`);
  return { source, filename: `${filename}.example`, csv: fs.readFileSync(/*turbopackIgnore: true*/ templatePath, "utf8") };
}

export function importAppSeoEvidenceRows(input, config) {
  const filename = SEO_EXPORTS[input.source];
  if (!filename) throw new Error(`Unknown SEO export source: ${input.source}`);
  const evidence = readAppSeoEvidence(config);
  const csv = input.csv || "";
  const rows = parseCsv(csv).map((row) => normalizeExternalRow(input.source, row));
  const outPath = seoInputPath(input.source, config);

  evidence.generated_at = config.reviewedAt || new Date().toISOString();
  evidence.summary.sources[input.source] = {
    source: input.source,
    input_path: outPath,
    status: rows.length ? "imported" : "empty_export",
    row_count: rows.length,
    ...joinSource(input.source, rows, evidence),
  };
  updateMissingRequiredSources(evidence);
  updateEvidenceCounts(evidence);
  assertSeoEvidence(evidence);

  const evidencePath = seoEvidencePath(config);
  fs.mkdirSync(path.dirname(/*turbopackIgnore: true*/ outPath), { recursive: true });
  fs.writeFileSync(/*turbopackIgnore: true*/ outPath, csv);
  fs.mkdirSync(path.dirname(/*turbopackIgnore: true*/ evidencePath), { recursive: true });
  fs.writeFileSync(/*turbopackIgnore: true*/ evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return { imported: { source: input.source, outPath, row_count: rows.length }, ...seoEvidencePayload(evidence) };
}
