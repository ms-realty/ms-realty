import {
  assertPayloadRuntimeReport,
  DEFAULT_PAYLOAD_RUNTIME_REPORT,
} from "../lib/payload-runtime.mjs";
import fs from "node:fs";

const reportPath = process.env.MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH || DEFAULT_PAYLOAD_RUNTIME_REPORT;

if (!fs.existsSync(reportPath)) {
  console.error(`PAYLOAD RUNTIME PREFLIGHT FAILED: missing_report ${reportPath}`);
  console.error(
    "Next: run `npm run payload:bootstrap`, configure a private env with PAYLOAD_SECRET and DATABASE_URL, run `npm run payload:runtime`, then rerun `npm run payload:preflight`.",
  );
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
assertPayloadRuntimeReport(report);

for (const check of report.checks) {
  const detail = check.error ? `: ${check.error}` : "";
  const write = check.status === "pass" ? console.log : console.error;
  write(`${check.id}: ${check.status}${detail}`);
}

if (!report.ready) {
  const failed = report.checks.filter((check) => check.status !== "pass").map((check) => check.id).join(", ");
  console.error(`PAYLOAD RUNTIME PREFLIGHT FAILED: ${failed}`);
  console.error(
    "Next: run `npm run payload:bootstrap`, configure a private env with PAYLOAD_SECRET and DATABASE_URL, run `npm run payload:runtime`, then rerun `npm run payload:preflight`.",
  );
  process.exitCode = 1;
} else {
  console.log("Payload runtime report valid");
}
