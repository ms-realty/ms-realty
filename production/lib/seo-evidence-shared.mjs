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
