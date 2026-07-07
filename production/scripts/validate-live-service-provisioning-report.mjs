import fs from "node:fs";
import {
  assertLiveServiceProvisioningReport,
  DEFAULT_LIVE_SERVICE_PROVISIONING_REPORT,
} from "../lib/live-service-provisioning.mjs";

const reportPath = process.env.MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH || DEFAULT_LIVE_SERVICE_PROVISIONING_REPORT;

if (!fs.existsSync(reportPath)) {
  console.error(`LIVE SERVICE PROVISIONING FAILED: missing_report ${reportPath}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
assertLiveServiceProvisioningReport(report);

for (const check of report.checks) {
  const detail = check.error ? `: ${check.error}` : "";
  const write = check.status === "pass" ? console.log : console.error;
  write(`${check.id}: ${check.status}${detail}`);
}

if (!report.ready) {
  const failed = report.checks.filter((check) => check.status !== "pass").map((check) => check.id).join(", ");
  console.error(`LIVE SERVICE PROVISIONING FAILED: ${failed}`);
  process.exitCode = 1;
} else {
  console.log("Live service provisioning report valid");
}
