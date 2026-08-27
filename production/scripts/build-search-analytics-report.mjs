import { readEventLedger } from "../lib/events.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { buildSearchAnalyticsReport, DEFAULT_SEARCH_ANALYTICS_REPORT, writeSearchAnalyticsReport } from "../lib/search-analytics.mjs";

// Keep this reproducible artifact on the reviewed fixture; runtime events are mutable and ignored.
const report = buildSearchAnalyticsReport({
  events: readEventLedger(fromRoot("production", "data", "events.jsonl")),
  generatedAt: "2026-07-05T00:00:00Z",
});
writeSearchAnalyticsReport(report);
console.log(`Wrote search analytics report to ${DEFAULT_SEARCH_ANALYTICS_REPORT}`);
