import {
  buildLiveServicePreflightReport,
  DEFAULT_LIVE_SERVICE_PREFLIGHT_REPORT,
  writeLiveServicePreflightReport,
} from "../lib/launch-readiness.mjs";

const outputPath = process.env.MS_REALTY_LIVE_SERVICE_PREFLIGHT_REPORT_PATH || DEFAULT_LIVE_SERVICE_PREFLIGHT_REPORT;

const outPath = writeLiveServicePreflightReport(
  buildLiveServicePreflightReport({
    generatedAt: "2026-07-06T00:00:00Z",
    syncReportPath: process.env.MS_REALTY_SEARCH_SYNC_REPORT_PATH,
    queryReportPath: process.env.MS_REALTY_SEARCH_QUERY_REPORT_PATH,
    hermesReportPath: process.env.MS_REALTY_HERMES_WORKER_REPORT_PATH,
  }),
  outputPath,
);

console.log(`Wrote live service preflight report to ${outPath}`);
