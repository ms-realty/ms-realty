import fs from "node:fs";
import path from "node:path";
import { loadLocaleRegistry } from "./locales.mjs";
import { loadCmsSeed, searchRuntimeListings } from "./runtime.mjs";
import { fromRoot } from "./paths.mjs";
import { readSavedSearches } from "./saved-searches.mjs";
import { readTranslationLedger } from "./translation-ledger.mjs";

export const DEFAULT_SAVED_SEARCH_ALERT_REPORT = fromRoot("production", "data", "saved-search-alert-report.json");

function activeSavedSearches(rows) {
  return rows.filter((row) => row.status === "active");
}

function ownerForSearch(row) {
  return row.alert_task?.owner || "broker_en";
}

function evaluateSavedSearch(registry, seed, translationTasks, row) {
  const search = searchRuntimeListings(registry, seed, {
    localeCode: row.locale,
    query: row.query,
    filters: row.filters || {},
    translationTasks,
  });
  const previousMatchCount = Number(row.match_count || 0);
  const currentMatchCount = Number(search.search?.total_matches || 0);
  const newMatchCount = Math.max(0, currentMatchCount - previousMatchCount);
  const status = newMatchCount > 0 ? "new_matches" : "no_new_matches";

  return {
    saved_search_id: row.id,
    requested_locale: row.requested_locale,
    locale: row.locale,
    query: row.query,
    filters: row.filters || {},
    alert_frequency: row.alert_frequency,
    previous_match_count: previousMatchCount,
    current_match_count: currentMatchCount,
    new_match_count: newMatchCount,
    status,
    alert_task:
      newMatchCount > 0
        ? {
            id: `new-match-${row.id}`,
            owner: ownerForSearch(row),
            status: "open",
            frequency: row.alert_frequency,
            new_match_count: newMatchCount,
          }
        : null,
    sample_listing_ids: search.cards.slice(0, 5).map((card) => card.id),
  };
}

export function buildSavedSearchAlertReport({
  registry = loadLocaleRegistry(),
  seed = loadCmsSeed(),
  savedSearches = readSavedSearches(),
  translationTasks = readTranslationLedger(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const rows = activeSavedSearches(savedSearches).map((row) => evaluateSavedSearch(registry, seed, translationTasks, row));

  return {
    generated_at: generatedAt,
    summary: {
      saved_searches: savedSearches.length,
      active_saved_searches: rows.length,
      new_match_alerts: rows.filter((row) => row.status === "new_matches").length,
      no_new_matches: rows.filter((row) => row.status === "no_new_matches").length,
    },
    rows,
  };
}

export function assertSavedSearchAlertReport(report) {
  if (!report.rows.length) throw new Error("Saved-search alert report must contain active saved searches");
  if (report.summary.active_saved_searches !== report.rows.length) {
    throw new Error("Saved-search alert summary must match rows");
  }
  if (report.summary.new_match_alerts + report.summary.no_new_matches !== report.rows.length) {
    throw new Error("Saved-search alert status buckets must match rows");
  }
  for (const row of report.rows) {
    if (!row.saved_search_id || !row.locale || !row.alert_frequency) {
      throw new Error("Saved-search alert rows must preserve saved-search identity and routing");
    }
    if (row.current_match_count < 0 || row.previous_match_count < 0 || row.new_match_count < 0) {
      throw new Error("Saved-search alert counts must not be negative");
    }
    if (row.current_match_count < row.new_match_count) {
      throw new Error("Saved-search new-match count cannot exceed current matches");
    }
    if (row.status === "new_matches" && row.alert_task?.status !== "open") {
      throw new Error("Saved-search new-match rows must create an open alert task");
    }
    if (row.status === "no_new_matches" && row.alert_task !== null) {
      throw new Error("Saved-search unchanged rows must not create duplicate alert tasks");
    }
  }
  return true;
}

export function writeSavedSearchAlertReport(report, filePath = DEFAULT_SAVED_SEARCH_ALERT_REPORT) {
  assertSavedSearchAlertReport(report);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}
