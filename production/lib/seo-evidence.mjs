import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./csv.mjs";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_SEO_EVIDENCE_INPUT_DIR = path.resolve(MODULE_DIR, "../../migration/external/seo");
export const DEFAULT_SEO_EVIDENCE_OUTPUT = path.resolve(MODULE_DIR, "../data/seo-evidence.json");
export const DEFAULT_SEO_PREFLIGHT_REPORT = path.resolve(MODULE_DIR, "../data/seo-evidence-preflight-report.json");
const DEFAULT_MIGRATION_RECORDS_PATH = path.resolve(MODULE_DIR, "../data/migration-records.json");
const DEFAULT_LEGACY_ROUTE_MAP_PATH = path.resolve(MODULE_DIR, "../data/legacy-route-map.json");
const DEFAULT_EVENT_LEDGER_PATH = path.resolve(MODULE_DIR, "../data/events.jsonl");

export const SEO_EXPORTS = {
  search_console: "search-console.csv",
  yandex_webmaster: "yandex-webmaster.csv",
  backlinks: "backlinks.csv",
  analytics_export: "analytics.csv",
};

const REQUIRED_EXPORTS = ["search_console", "yandex_webmaster", "backlinks"];
const REQUIRED_SOURCE_DOMAINS = ["makler-realty.com", "makler-realty.ru"];

function lowerRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase().replaceAll(" ", "_"), value]));
}

function pick(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== "") return row[key];
  }
  return "";
}

function numberFrom(row, keys) {
  const value = Number(pick(row, keys));
  return Number.isFinite(value) ? value : 0;
}

function host(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function invalidBacklinkReferral(row, target) {
  const domain = (row.referring_domain || host(row.source_url || "")).toLowerCase();
  if (!domain) return true;
  if (REQUIRED_SOURCE_DOMAINS.includes(domain)) return true;
  if (domain === target.source_domain) return true;
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(domain)) return true;
  if (domain.endsWith(".local") || domain.endsWith(".localhost")) return true;
  if (/(^|\.)example$/.test(domain) || /(^|\.)example\.(com|net|org)$/.test(domain)) return true;
  if (/(^|\.)(test|invalid)$/.test(domain)) return true;
  return false;
}

function routeKeys(value) {
  if (!value) return [];
  try {
    const url = new URL(value, "https://makler-realty.com");
    const pathname = url.pathname.replace(/\/$/, "") || "/";
    return [url.href.replace(/\/$/, ""), pathname];
  } catch {
    return [String(value).replace(/\/$/, "") || "/"];
  }
}

function addMetric(target, key, value) {
  target[key] = (target[key] || 0) + value;
}

function sourceUrl(row, source) {
  const keys =
    source === "backlinks"
      ? ["target_url", "target", "url", "page", "landing_page"]
      : ["url", "page", "landing_page", "landing_page_url", "path"];
  return pick(row, keys);
}

function normalizeExternalRow(source, row) {
  const normalized = lowerRow(row);
  const url = sourceUrl(normalized, source);
  const rawKey = JSON.stringify(Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b)));
  const item = { url, keys: routeKeys(url), raw_key: rawKey };

  if (source === "search_console") {
    item.clicks = numberFrom(normalized, ["clicks"]);
    item.impressions = numberFrom(normalized, ["impressions"]);
    item.position = numberFrom(normalized, ["position", "avg_position"]);
  } else if (source === "yandex_webmaster") {
    item.indexed = pick(normalized, ["indexed", "status", "indexing_status"]);
    item.issue = pick(normalized, ["issue", "error", "excluded_reason"]);
  } else if (source === "backlinks") {
    item.source_url = pick(normalized, ["source_url", "referring_page", "referring_page_url", "referrer"]);
    item.referring_domain = pick(normalized, ["referring_domain", "domain"]) || host(item.source_url);
  } else if (source === "analytics_export") {
    item.page_views = numberFrom(normalized, ["page_views", "views", "screen_page_views"]);
    item.sessions = numberFrom(normalized, ["sessions"]);
    item.users = numberFrom(normalized, ["users", "active_users"]);
  }

  return item;
}

function externalRowDedupeKey(source, target, row) {
  return JSON.stringify([source, target.old_url, row.raw_key]);
}

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

function missingRequiredExport(summary) {
  return (
    summary?.status !== "imported" ||
    summary.matched_rows < 1 ||
    summary.signal_rows < 1 ||
    summary.placeholder_rows > 0 ||
    REQUIRED_SOURCE_DOMAINS.some((domain) => !summary.matched_source_domains?.includes(domain))
  );
}

function missingRequiredSources(sourceSummaries) {
  const missing = REQUIRED_EXPORTS.filter((source) => missingRequiredExport(sourceSummaries[source]));
  const analyticsReady =
    sourceSummaries.privacy_events?.status === "imported" || sourceSummaries.analytics_export?.status === "imported";
  return analyticsReady ? missing : [...missing, "privacy_or_ga4_analytics"];
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

export function assertSeoEvidence(evidence) {
  if (evidence.summary.crawl_urls !== evidence.url_evidence.length) throw new Error("SEO evidence must cover every crawled URL");
  if (evidence.summary.crawl_urls !== 457) throw new Error("SEO evidence must cover the 457 URL migration inventory");
  if (!evidence.summary.sources.privacy_events) throw new Error("SEO evidence must include privacy analytics status");
  if (!Array.isArray(evidence.summary.missing_required_sources)) throw new Error("SEO evidence must summarize missing required sources");
  for (const source of REQUIRED_EXPORTS) {
    if (!evidence.summary.sources[source]) throw new Error(`SEO evidence missing ${source} source status`);
  }
  const expectedMissing = missingRequiredSources(evidence.summary.sources);
  if (JSON.stringify(evidence.summary.missing_required_sources) !== JSON.stringify(expectedMissing)) {
    throw new Error("SEO evidence missing required sources must match source evidence");
  }
  return true;
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
  assertSeoEvidence(evidence);
  const missing = evidence.summary.missing_required_sources;
  return {
    generated_at: evidence.generated_at,
    ready: missing.length === 0,
    status: missing.length ? "blocked" : "ready",
    summary: {
      crawl_urls: evidence.summary.crawl_urls,
      urls_with_any_evidence: evidence.summary.urls_with_any_evidence,
      missing_required_sources: missing,
      sources: Object.fromEntries(REQUIRED_EXPORTS.map((source) => [source, evidence.summary.sources[source]])),
    },
    next_actions: missing.length
      ? [
          "Export Search Console, Yandex Webmaster, and backlink CSVs for both legacy domains.",
          "Place them in migration/external/seo or set MS_REALTY_SEO_EVIDENCE_INPUT_DIR.",
          "Run npm run seo:preflight before launch:preflight.",
        ]
      : ["Run npm run launch:preflight with the same SEO evidence input path."],
  };
}

export function assertSeoEvidencePreflightReport(report) {
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("SEO preflight report must include valid generated_at");
  }
  if (!report.summary || !Array.isArray(report.summary.missing_required_sources)) {
    throw new Error("SEO preflight report must summarize missing required sources");
  }
  const ready = report.summary.missing_required_sources.length === 0;
  if (report.ready !== ready) throw new Error("SEO preflight ready flag must match missing required sources");
  if (report.status !== (ready ? "ready" : "blocked")) throw new Error("SEO preflight status must match ready flag");
  for (const source of REQUIRED_EXPORTS) {
    const sourceStatus = report.summary.sources?.[source];
    if (!sourceStatus) throw new Error(`SEO preflight report missing ${source} source status`);
    if (ready && missingRequiredExport(sourceStatus)) {
      throw new Error(`SEO preflight ready report requires complete ${source} evidence`);
    }
  }
  return true;
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
