import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";
import { parseCsv } from "./csv.mjs";
import {
  REQUIRED_EXPORTS,
  assertSeoEvidence,
  assertSeoEvidencePreflightReport,
  buildSeoEvidencePreflightReportFromEvidence,
  missingRequiredSources,
} from "./seo-evidence-contract.mjs";
import {
  SEO_EXPORTS,
  addMetric,
  externalRowDedupeKey,
  invalidBacklinkReferral,
  normalizeExternalRow,
  routeKeys,
} from "./seo-evidence-shared.mjs";

export {
  assertSeoEvidence,
  assertSeoEvidencePreflightReport,
  buildSeoEvidencePreflightReportFromEvidence,
} from "./seo-evidence-contract.mjs";

export const DEFAULT_SEO_EVIDENCE_INPUT_DIR = fromRoot("migration", "external", "seo");
export const DEFAULT_SEO_EVIDENCE_OUTPUT = fromRoot("production", "data", "seo-evidence.json");
export const DEFAULT_SEO_PREFLIGHT_REPORT = fromRoot("production", "data", "seo-evidence-preflight-report.json");
const DEFAULT_MIGRATION_RECORDS_PATH = fromRoot("production", "data", "migration-records.json");
const DEFAULT_LEGACY_ROUTE_MAP_PATH = fromRoot("production", "data", "legacy-route-map.json");
const DEFAULT_EVENT_LEDGER_PATH = fromRoot("production", "data", "events.jsonl");

function readExternalSource(source, inputDir) {
  const inputPath = path.join(/*turbopackIgnore: true*/ inputDir, SEO_EXPORTS[source]);
  if (!fs.existsSync(inputPath)) {
    return { source, input_path: inputPath, status: "missing_export", rows: [], row_count: 0 };
  }
  const rows = parseCsv(fs.readFileSync(inputPath, "utf8")).map((row) => normalizeExternalRow(source, row));
  return {
    source,
    input_path: inputPath,
    status: rows.length ? "imported" : "empty_export",
    rows,
    row_count: rows.length,
  };
}

function loadJsonRows(filePath, key) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))[key] || [];
}

function readPrivacyEventLedger(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function loadMigrationRecords() {
  return loadJsonRows(DEFAULT_MIGRATION_RECORDS_PATH, "records");
}

export function loadLegacyRouteMap() {
  return loadJsonRows(DEFAULT_LEGACY_ROUTE_MAP_PATH, "routes");
}

function baseUrlEvidence(record) {
  return {
    old_url: record.old_url,
    source_domain: record.source_domain,
    url_type: record.url_type,
    target_path: null,
    search_console: { clicks: 0, impressions: 0, avg_position: 0 },
    yandex_webmaster: { rows: 0, issues: 0 },
    backlinks: { backlinks: 0, referring_domains: 0 },
    analytics: { page_views: 0, searches: 0, leads: 0, cta_clicks: 0, exported_page_views: 0 },
  };
}

function indexEvidence(records, routeMap) {
  const evidence = records.map(baseUrlEvidence);
  const byKey = new Map();
  const byListingReference = new Map();

  for (const row of evidence) {
    for (const key of routeKeys(row.old_url)) byKey.set(key, row);
  }
  for (const route of routeMap) {
    const row = byKey.get(route.old_url) || byKey.get(route.old_url?.replace(/\/$/, ""));
    if (!row || !route.target_path) continue;
    row.target_path = route.target_path;
    for (const key of routeKeys(route.target_path)) byKey.set(key, row);
    const reference = route.target_path.split("/").filter(Boolean).at(-1);
    if (reference) byListingReference.set(reference, row);
  }

  return { evidence, byKey, byListingReference };
}

function joinExternal(source, sourceData, byKey) {
  let matched = 0;
  let signalRows = 0;
  let unmatched = 0;
  let duplicateRows = 0;
  let placeholderRows = 0;
  const matchedSourceDomains = new Set();
  const referringDomains = new Set();
  const seenRows = new Set();

  for (const row of sourceData.rows) {
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

function joinPrivacyEvents(events, byKey, byListingReference) {
  let matched = 0;
  for (const event of events) {
    const target =
      (event.listing_reference && byListingReference.get(event.listing_reference)) ||
      routeKeys(event.path)
        .map((key) => byKey.get(key))
        .find(Boolean);
    if (!target) continue;
    matched += 1;
    if (event.type === "page_view") addMetric(target.analytics, "page_views", 1);
    if (event.type === "search") addMetric(target.analytics, "searches", 1);
    if (event.type === "lead_submitted") addMetric(target.analytics, "leads", 1);
    if (event.type === "cta_click") addMetric(target.analytics, "cta_clicks", 1);
  }
  return { row_count: events.length, matched_rows: matched, unmatched_rows: events.length - matched };
}

function summarize(records, sourceSummaries, urlEvidence) {
  return {
    crawl_urls: records.length,
    url_types: records.reduce((counts, row) => ({ ...counts, [row.url_type]: (counts[row.url_type] || 0) + 1 }), {}),
    sources: sourceSummaries,
    missing_required_sources: missingRequiredSources(sourceSummaries),
    urls_with_any_evidence: urlEvidence.filter(
      (row) =>
        row.search_console.impressions ||
        row.yandex_webmaster.rows ||
        row.backlinks.backlinks ||
        row.analytics.page_views ||
        row.analytics.exported_page_views,
    ).length,
  };
}

export function buildSeoEvidence({
  records = loadMigrationRecords(),
  routeMap = loadLegacyRouteMap(),
  inputDir = DEFAULT_SEO_EVIDENCE_INPUT_DIR,
  events = readPrivacyEventLedger(DEFAULT_EVENT_LEDGER_PATH),
  generatedAt = new Date().toISOString(),
} = {}) {
  const { evidence, byKey, byListingReference } = indexEvidence(records, routeMap);
  const sourceSummaries = {};

  for (const source of Object.keys(SEO_EXPORTS)) {
    const sourceData = readExternalSource(source, inputDir);
    sourceSummaries[source] = { ...sourceData, rows: undefined, ...joinExternal(source, sourceData, byKey) };
  }

  sourceSummaries.privacy_events = {
    source: "privacy_events",
    input_path: DEFAULT_EVENT_LEDGER_PATH,
    status: events.length ? "imported" : "missing_export",
    ...joinPrivacyEvents(events, byKey, byListingReference),
  };

  return {
    generated_at: generatedAt,
    summary: summarize(records, sourceSummaries, evidence),
    url_evidence: evidence,
  };
}

export function writeExternalSeoExport(source, csvText, { inputDir = DEFAULT_SEO_EVIDENCE_INPUT_DIR } = {}) {
  const filename = SEO_EXPORTS[source];
  if (!filename) throw new Error(`Unknown SEO export source: ${source}`);
  fs.mkdirSync(inputDir, { recursive: true });
  const outPath = path.join(/*turbopackIgnore: true*/ inputDir, filename);
  fs.writeFileSync(outPath, csvText || "");
  return { source, outPath, row_count: parseCsv(csvText || "").length };
}

export function readSeoExportTemplate(source, { inputDir = DEFAULT_SEO_EVIDENCE_INPUT_DIR } = {}) {
  const filename = SEO_EXPORTS[source];
  if (!filename) throw new Error(`Unknown SEO export source: ${source}`);
  const templatePath = path.join(/*turbopackIgnore: true*/ inputDir, `${filename}.example`);
  if (!fs.existsSync(templatePath)) throw new Error(`Missing SEO export template for ${source}`);
  return { source, filename: `${filename}.example`, csv: fs.readFileSync(templatePath, "utf8") };
}

export function validateSeoEvidenceInputs(options = {}) {
  const evidence = buildSeoEvidence(options);
  assertSeoEvidence(evidence);
  return {
    ready: evidence.summary.missing_required_sources.length === 0,
    missing_required_sources: evidence.summary.missing_required_sources,
    sources: Object.fromEntries(REQUIRED_EXPORTS.map((source) => [source, evidence.summary.sources[source]])),
  };
}

export function buildSeoEvidencePreflightReport(options = {}) {
  const evidence = buildSeoEvidence(options);
  return buildSeoEvidencePreflightReportFromEvidence(evidence);
}

export function writeSeoEvidencePreflightReport(report, outPath = DEFAULT_SEO_PREFLIGHT_REPORT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertSeoEvidencePreflightReport(report);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}

export function writeSeoEvidence(evidence, outPath = DEFAULT_SEO_EVIDENCE_OUTPUT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertSeoEvidence(evidence);
  fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
  return outPath;
}
