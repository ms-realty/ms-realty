import {
  buildSavedSearchAlertReport,
  DEFAULT_SAVED_SEARCH_ALERT_REPORT,
  writeSavedSearchAlertReport,
} from "../lib/saved-search-alerts.mjs";

const report = buildSavedSearchAlertReport({ generatedAt: "2026-07-05T00:00:00Z" });
writeSavedSearchAlertReport(report);
console.log(`Wrote saved-search alert report to ${DEFAULT_SAVED_SEARCH_ALERT_REPORT}`);
