import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createEvent, readEventLedger } from "../lib/events.mjs";
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

test("invalid numeric search events remain visible without breaking reports or counting as empty results", () => {
  const events = [
    { price_min: "abc" },
    { price_min: "200000", price_max: "100000" },
    {},
  ].map((filters) => createEvent({ type: "search", path: "/api/search", locale: "bg", query: "zzzz-no-results", filters }));
  const report = buildSearchAnalyticsReport({ registry, seed, events });
  assert.equal(assertSearchAnalyticsReport(report), true);
  assert.equal(report.summary.search_events, 3);
  assert.equal(report.summary.invalid_search_events, 2);
  assert.equal(report.summary.zero_result_events, 1);
  assert.equal(report.summary.zero_result_queries.length, 1);
  assert.deepEqual(report.rows[0].filters, { price_min: "abc" });
  assert.equal(report.rows[0].result_count, null);
  assert.deepEqual(report.rows[1].invalid_filter_fields, ["price_min", "price_max"]);
  const malformed = structuredClone(report);
  delete malformed.rows[0].invalid_filter_fields;
  assert.throws(() => assertSearchAnalyticsReport(malformed), /Search analytics rows/);
  assert.throws(() => buildSearchAnalyticsReport({ registry, seed: null, events: [events[2]] }), TypeError);
});

test("checked-in privacy-safe event fixtures can build a non-empty search analytics report", () => {
  const report = buildSearchAnalyticsReport({
    registry,
    seed,
    events: readEventLedger(fromRoot("production", "data", "events.jsonl")),
    generatedAt: "2026-07-05T00:00:00Z",
  });

  assert.equal(assertSearchAnalyticsReport(report), true);
  assert.equal(report.summary.search_events > 0, true);
  assert.equal(report.summary.filtered_search_events > 0, true);
});
