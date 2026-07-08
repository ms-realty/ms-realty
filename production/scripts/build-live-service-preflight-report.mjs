import {
  buildLiveServicePreflightReport,
  DEFAULT_LIVE_SERVICE_PREFLIGHT_REPORT,
  writeLiveServicePreflightReport,
} from "../lib/launch-readiness.mjs";

const outputPath = process.env.MS_REALTY_LIVE_SERVICE_PREFLIGHT_REPORT_PATH || DEFAULT_LIVE_SERVICE_PREFLIGHT_REPORT;

const report = buildLiveServicePreflightReport({
  generatedAt: "2026-07-06T00:00:00Z",
  syncReportPath: process.env.MS_REALTY_SEARCH_SYNC_REPORT_PATH,
  queryReportPath: process.env.MS_REALTY_SEARCH_QUERY_REPORT_PATH,
  hermesReportPath: process.env.MS_REALTY_HERMES_WORKER_REPORT_PATH,
});
const outPath = writeLiveServicePreflightReport(report, outputPath);

console.log(`Wrote live service preflight report to ${outPath}`);

if (!report.ready) {
  const failed = report.reports
    .filter((item) => item.status !== "pass")
    .map((item) => item.source)
    .join(", ");
  console.log(`Live service reports blocked: ${failed}`);
  if (report.summary.missing_report) console.log(`Missing reports: ${report.summary.missing_report}`);
  if (report.summary.invalid_report) console.log(`Invalid reports: ${report.summary.invalid_report}`);
  if (report.summary.example_report) console.log(`Example reports: ${report.summary.example_report}`);
  console.log(
    "Next: run `npm run live:provisioning:preflight`, capture real service evidence with `npm run live:capture`, then run `npm run live:preflight`.",
  );
}
