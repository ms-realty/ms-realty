import fs from "node:fs";
import {
  assertLiveServiceProvisioningReport,
  DEFAULT_LIVE_SERVICE_PROVISIONING_REPORT,
} from "../lib/live-service-provisioning.mjs";
import {
  HERMES_LAUNCH_REQUIRED,
  REQUIRED_LIVE_SERVICE_PROVISIONING_CHECK_IDS,
} from "../lib/launch-service-contract.mjs";

const reportPath = process.env.MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH || DEFAULT_LIVE_SERVICE_PROVISIONING_REPORT;
const NEXT = HERMES_LAUNCH_REQUIRED
  ? "Next: set DATABASE_URL, PAYLOAD_SECRET, HERMES_CHAT_COMPLETIONS_URL, and HERMES_API_KEY, run `npm run live:provisioning`, then rerun `npm run live:provisioning:preflight`."
  : "Next: set DATABASE_URL and PAYLOAD_SECRET, run `npm run live:provisioning`, then rerun `npm run live:provisioning:preflight`.";

if (!fs.existsSync(reportPath)) {
  console.error(`LIVE SERVICE PROVISIONING FAILED: missing_report ${reportPath}`);
  console.error(NEXT);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
assertLiveServiceProvisioningReport(report);

for (const check of report.checks) {
  const detail = check.error ? `: ${check.error}` : "";
  const required = REQUIRED_LIVE_SERVICE_PROVISIONING_CHECK_IDS.includes(check.id);
  const write = required && check.status !== "pass" ? console.error : console.log;
  write(`${check.id}: ${check.status}${detail}`);
}

if (!report.ready) {
  const failed = report.checks
    .filter((check) => REQUIRED_LIVE_SERVICE_PROVISIONING_CHECK_IDS.includes(check.id) && check.status !== "pass")
    .map((check) => check.id)
    .join(", ");
  console.error(`LIVE SERVICE PROVISIONING FAILED: ${failed}`);
  console.error(NEXT);
  process.exitCode = 1;
} else {
  console.log("Live service provisioning report valid");
}
