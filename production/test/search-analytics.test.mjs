import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createEvent } from "../lib/events.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { assertSearchAnalyticsReport, buildSearchAnalyticsReport } from "../lib/search-analytics.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

const registry = loadLocaleRegistry();
const seed = loadCmsSeed();

test("search analytics report replays privacy-safe search events", () => {
  const events = [
    createEvent({ type: "search", path: "/api/search", locale: "he", query: "Sandanski", filters: { property_type: "apartment" } }),
    createEvent({ type: "search", path: "/api/search", locale: "he", query: "zzzz-no-results", filters: { property_type: "apartment" } }),
  ];
  const report = buildSearchAnalyticsReport({ registry, seed, events, generatedAt: "2026-07-05T00:00:00Z" });

  assert.equal(assertSearchAnalyticsReport(report), true);
  assert.equal(report.summary.search_events, 2);
  assert.equal(report.summary.zero_result_events, 1);
  assert.deepEqual(report.summary.popular_filters, [{ key: "property_type=apartment", count: 2 }]);
  assert.equal(report.summary.zero_result_queries[0].query, "zzzz-no-results");
});

test("generated search analytics report is valid when present", () => {
  const file = fromRoot("production", "data", "search-analytics-report.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertSearchAnalyticsReport(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});
