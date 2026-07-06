import { buildSearchAnalyticsReport, DEFAULT_SEARCH_ANALYTICS_REPORT, writeSearchAnalyticsReport } from "../lib/search-analytics.mjs";

const report = buildSearchAnalyticsReport({ generatedAt: "2026-07-05T00:00:00Z" });
writeSearchAnalyticsReport(report);
console.log(`Wrote search analytics report to ${DEFAULT_SEARCH_ANALYTICS_REPORT}`);
