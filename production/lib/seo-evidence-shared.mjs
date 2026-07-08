import { REQUIRED_SOURCE_DOMAINS } from "./seo-evidence-contract.mjs";

export const SEO_EXPORTS = {
  search_console: "search-console.csv",
  yandex_webmaster: "yandex-webmaster.csv",
  backlinks: "backlinks.csv",
  analytics_export: "analytics.csv",
};

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

export function invalidBacklinkReferral(row, target) {
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

export function routeKeys(value) {
  if (!value) return [];
  try {
    const url = new URL(value, "https://makler-realty.com");
    const pathname = url.pathname.replace(/\/$/, "") || "/";
    return [url.href.replace(/\/$/, ""), pathname];
  } catch {
    return [String(value).replace(/\/$/, "") || "/"];
  }
}

function sourceUrl(row, source) {
  const keys =
    source === "backlinks"
      ? ["target_url", "target", "url", "page", "landing_page"]
      : ["url", "page", "landing_page", "landing_page_url", "path"];
  return pick(row, keys);
}

export function normalizeExternalRow(source, row) {
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

export function addMetric(target, key, value) {
  target[key] = (target[key] || 0) + value;
}

export function externalRowDedupeKey(source, target, row) {
  return JSON.stringify([source, target.old_url, row.raw_key]);
}

export function seoEvidenceIndex(evidence) {
  const byKey = new Map();
  for (const row of evidence.url_evidence || []) {
    for (const key of routeKeys(row.old_url)) byKey.set(key, row);
    for (const key of routeKeys(row.target_path)) byKey.set(key, row);
  }
  return byKey;
}

export function resetSeoSourceMetrics(source, evidence) {
  for (const row of evidence.url_evidence || []) {
    if (source === "search_console") row.search_console = { clicks: 0, impressions: 0, avg_position: 0 };
    if (source === "yandex_webmaster") row.yandex_webmaster = { rows: 0, issues: 0 };
    if (source === "backlinks") row.backlinks = { backlinks: 0, referring_domains: 0 };
    if (source === "analytics_export") row.analytics = { ...row.analytics, exported_page_views: 0 };
  }
}

export function joinExternalRows(source, rows, byKey, { resetEvidence = null } = {}) {
  if (resetEvidence) resetSeoSourceMetrics(source, resetEvidence);

  let matched = 0;
  let signalRows = 0;
  let unmatched = 0;
  let duplicateRows = 0;
  let placeholderRows = 0;
  const matchedSourceDomains = new Set();
  const referringDomains = new Set();
  const seenRows = new Set();

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

export function countUrlsWithSeoEvidence(evidence) {
  return (evidence.url_evidence || []).filter(
    (row) =>
      row.search_console?.impressions ||
      row.yandex_webmaster?.rows ||
      row.backlinks?.backlinks ||
      row.analytics?.page_views ||
      row.analytics?.exported_page_views,
  ).length;
}
