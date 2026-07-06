import { validateLiveServiceReports } from "../lib/launch-readiness.mjs";

const result = validateLiveServiceReports({
  syncReportPath: process.env.MS_REALTY_SEARCH_SYNC_REPORT_PATH,
  queryReportPath: process.env.MS_REALTY_SEARCH_QUERY_REPORT_PATH,
  hermesReportPath: process.env.MS_REALTY_HERMES_WORKER_REPORT_PATH,
});

for (const report of result.reports) {
  const detail = report.error ? `: ${report.error}` : "";
  const write = report.status === "pass" ? console.log : console.error;
  write(`${report.source}: ${report.status} ${report.path}${detail}`);
}

if (!result.ready) {
  const failed = result.reports.filter((report) => report.status !== "pass").map((report) => report.source).join(", ");
  console.error(`LIVE SERVICE PREFLIGHT FAILED: ${failed}`);
  process.exitCode = 1;
} else {
  console.log("Live service reports valid");
}
