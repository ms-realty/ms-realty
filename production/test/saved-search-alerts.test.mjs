import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertSavedSearchAlertReport, buildSavedSearchAlertReport } from "../lib/saved-search-alerts.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { loadCmsSeed, searchRuntimeListings } from "../lib/runtime.mjs";
import { fromRoot } from "../lib/paths.mjs";

const registry = loadLocaleRegistry();
const seed = loadCmsSeed();

function savedSearch(matchCount) {
  return {
    id: "saved-search-low-watermark",
    requested_locale: "he",
    locale: "he",
    query: "Sandanski",
    filters: { property_type: "apartment" },
    contact: { name: "Noa Levi" },
    match_count: matchCount,
    alert_frequency: "weekly",
    status: "active",
    alert_task: { id: "alert-he", status: "open", owner: "broker_en" },
  };
}

function savedSearchWithOldPrice() {
  const search = searchRuntimeListings(registry, seed, {
    localeCode: "he",
    query: "Sandanski",
    filters: { property_type: "apartment" },
    translationTasks: [],
  });
  const card = search.cards.find((candidate) => Number.isFinite(Number(candidate.price_eur)));
  assert.ok(card, "expected a priced search result fixture");
  return {
    ...savedSearch(search.search.total_matches),
    price_snapshot: { [card.id]: Number(card.price_eur) + 1000 },
  };
}

test("saved-search alert report creates open tasks when current matches increase", () => {
  const report = buildSavedSearchAlertReport({
    registry,
    seed,
    savedSearches: [savedSearch(0)],
    translationTasks: [],
    generatedAt: "2026-07-05T00:00:00Z",
  });

  assert.equal(assertSavedSearchAlertReport(report), true);
  assert.equal(report.summary.new_match_alerts, 1);
  assert.equal(report.rows[0].status, "new_matches");
  assert.equal(report.rows[0].alert_task.status, "open");
  assert.equal(report.rows[0].alert_task.owner, "broker_en");
  assert.ok(report.rows[0].sample_listing_ids.length > 0);
});

test("saved-search alert report does not duplicate alerts when there are no new matches", () => {
  const report = buildSavedSearchAlertReport({
    registry,
    seed,
    savedSearches: [savedSearch(999)],
    translationTasks: [],
    generatedAt: "2026-07-05T00:00:00Z",
  });

  assert.equal(report.summary.no_new_matches, 1);
  assert.equal(report.rows[0].new_match_count, 0);
  assert.equal(report.rows[0].alert_task, null);
});

test("saved-search alert report creates open tasks when tracked prices change", () => {
  const report = buildSavedSearchAlertReport({
    registry,
    seed,
    savedSearches: [savedSearchWithOldPrice()],
    translationTasks: [],
    generatedAt: "2026-07-05T00:00:00Z",
  });

  assert.equal(assertSavedSearchAlertReport(report), true);
  assert.equal(report.summary.price_change_alerts, 1);
  assert.equal(report.rows[0].status, "price_changes");
  assert.equal(report.rows[0].new_match_count, 0);
  assert.equal(report.rows[0].price_change_count, 1);
  assert.equal(report.rows[0].alert_task.status, "open");
  assert.equal(report.rows[0].alert_task.price_change_count, 1);
  assert.equal(report.rows[0].price_changes[0].previous_price_eur, report.rows[0].price_changes[0].current_price_eur + 1000);
});

test("generated saved-search alert report is valid when present", () => {
  const file = fromRoot("production", "data", "saved-search-alert-report.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertSavedSearchAlertReport(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});
