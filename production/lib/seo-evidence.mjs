import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv.mjs";
import { DEFAULT_EVENT_LEDGER_PATH, readEventLedger } from "./events.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_SEO_EVIDENCE_INPUT_DIR = fromRoot("migration", "external", "seo");
export const DEFAULT_SEO_EVIDENCE_OUTPUT = fromRoot("production", "data", "seo-evidence.json");

const EXPORTS = {
  search_console: "search-console.csv",
  yandex_webmaster: "yandex-webmaster.csv",
  backlinks: "backlinks.csv",
  analytics_export: "analytics.csv",
};

const REQUIRED_EXPORTS = ["search_console", "yandex_webmaster", "backlinks"];

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
  const item = { url, keys: routeKeys(url) };

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

function readExternalSource(source, inputDir) {
  const inputPath = path.join(inputDir, EXPORTS[source]);
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

export function loadMigrationRecords(filePath = fromRoot("production", "data", "migration-records.json")) {
  return loadJsonRows(filePath, "records");
}

export function loadLegacyRouteMap(filePath = fromRoot("production", "data", "legacy-route-map.json")) {
  return loadJsonRows(filePath, "routes");
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
  const domains = new Set();

  for (const row of sourceData.rows) {
    const target = row.keys.map((key) => byKey.get(key)).find(Boolean);
    if (!target) continue;
    matched += 1;

    if (source === "search_console") {
      addMetric(target.search_console, "clicks", row.clicks);
      addMetric(target.search_console, "impressions", row.impressions);
      if (row.position) target.search_console.avg_position = row.position;
    } else if (source === "yandex_webmaster") {
      addMetric(target.yandex_webmaster, "rows", 1);
      if (row.issue) addMetric(target.yandex_webmaster, "issues", 1);
    } else if (source === "backlinks") {
      addMetric(target.backlinks, "backlinks", 1);
      if (row.referring_domain) domains.add(`${target.old_url}|${row.referring_domain}`);
    } else if (source === "analytics_export") {
      addMetric(target.analytics, "exported_page_views", row.page_views);
    }
  }

  for (const key of domains) {
    const [oldUrl] = key.split("|");
    const target = byKey.get(oldUrl);
    if (target) addMetric(target.backlinks, "referring_domains", 1);
  }

  return { matched_rows: matched, unmatched_rows: sourceData.row_count - matched };
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
  const missing = REQUIRED_EXPORTS.filter((source) => sourceSummaries[source]?.status !== "imported");
  const analyticsReady =
    sourceSummaries.privacy_events?.status === "imported" || sourceSummaries.analytics_export?.status === "imported";
  return {
    crawl_urls: records.length,
    url_types: records.reduce((counts, row) => ({ ...counts, [row.url_type]: (counts[row.url_type] || 0) + 1 }), {}),
    sources: sourceSummaries,
    missing_required_sources: analyticsReady ? missing : [...missing, "privacy_or_ga4_analytics"],
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
  events = readEventLedger(DEFAULT_EVENT_LEDGER_PATH),
  generatedAt = new Date().toISOString(),
} = {}) {
  const { evidence, byKey, byListingReference } = indexEvidence(records, routeMap);
  const sourceSummaries = {};

  for (const source of Object.keys(EXPORTS)) {
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

export function assertSeoEvidence(evidence) {
  if (evidence.summary.crawl_urls !== evidence.url_evidence.length) throw new Error("SEO evidence must cover every crawled URL");
  if (evidence.summary.crawl_urls !== 457) throw new Error("SEO evidence must cover the 457 URL migration inventory");
  if (!evidence.summary.sources.privacy_events) throw new Error("SEO evidence must include privacy analytics status");
  for (const source of REQUIRED_EXPORTS) {
    if (!evidence.summary.sources[source]) throw new Error(`SEO evidence missing ${source} source status`);
  }
  return true;
}

export function writeSeoEvidence(evidence, outPath = DEFAULT_SEO_EVIDENCE_OUTPUT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertSeoEvidence(evidence);
  fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
  return outPath;
}
