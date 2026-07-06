import fs from "node:fs";
import path from "node:path";
import { readEventLedger } from "./events.mjs";
import { loadLocaleRegistry } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { loadCmsSeed, searchRuntimeListings } from "./runtime.mjs";

export const DEFAULT_SEARCH_ANALYTICS_REPORT = fromRoot("production", "data", "search-analytics-report.json");

function filterKey(filters = {}) {
  const entries = Object.entries(filters).sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join("&") : "none";
}

function topCounts(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }));
}

function searchEventRow(registry, seed, event) {
  const search = searchRuntimeListings(registry, seed, {
    localeCode: event.locale,
    query: event.query || "",
    filters: event.filters || {},
    translationTasks: [],
  });
  return {
    path: event.path,
    locale: event.locale,
    query: event.query || "",
    filters: event.filters || {},
    filter_key: filterKey(event.filters),
    result_count: Number(search.search?.total_matches || 0),
  };
}

export function buildSearchAnalyticsReport({
  registry = loadLocaleRegistry(),
  seed = loadCmsSeed(),
  events = readEventLedger(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const rows = events.filter((event) => event.type === "search").map((event) => searchEventRow(registry, seed, event));
  const filteredRows = rows.filter((row) => row.filter_key !== "none");
  const zeroResultRows = rows.filter((row) => row.result_count === 0);

  return {
    generated_at: generatedAt,
    summary: {
      search_events: rows.length,
      zero_result_events: zeroResultRows.length,
      filtered_search_events: filteredRows.length,
      locales: topCounts(rows, (row) => row.locale),
      popular_filters: topCounts(filteredRows, (row) => row.filter_key).slice(0, 10),
      zero_result_queries: zeroResultRows.slice(0, 20).map((row) => ({
        locale: row.locale,
        query: row.query,
        filters: row.filters,
      })),
    },
    rows,
  };
}

export function assertSearchAnalyticsReport(report) {
  if (report.summary.search_events !== report.rows.length) throw new Error("Search analytics summary must match rows");
  if (report.summary.zero_result_events !== report.rows.filter((row) => row.result_count === 0).length) {
    throw new Error("Search analytics zero-result summary must match rows");
  }
  if (report.summary.filtered_search_events !== report.rows.filter((row) => row.filter_key !== "none").length) {
    throw new Error("Search analytics filter summary must match rows");
  }
  for (const row of report.rows) {
    if (!row.path?.startsWith("/") || !row.locale || row.result_count < 0) {
      throw new Error("Search analytics rows must preserve local route, locale, and non-negative result count");
    }
  }
  return true;
}

export function writeSearchAnalyticsReport(report, filePath = DEFAULT_SEARCH_ANALYTICS_REPORT) {
  assertSearchAnalyticsReport(report);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}
