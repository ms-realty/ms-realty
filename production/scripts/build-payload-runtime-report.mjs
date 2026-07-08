import {
  buildPayloadRuntimeReport,
  DEFAULT_PAYLOAD_RUNTIME_REPORT,
  writePayloadRuntimeReport,
} from "../lib/payload-runtime.mjs";

const outputPath = process.env.MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH || DEFAULT_PAYLOAD_RUNTIME_REPORT;
const generatedAt = process.env.MS_REALTY_GENERATED_AT || new Date().toISOString();
const report = await buildPayloadRuntimeReport({ generatedAt });
const outPath = writePayloadRuntimeReport(report, outputPath);

console.log(`Wrote Payload runtime report to ${outPath}`);

if (!report.ready) {
  const failed = report.checks
    .filter((check) => check.status !== "pass")
    .map((check) => check.id)
    .join(", ");
  console.log(`Payload runtime blocked: ${failed}`);
  if (report.summary.missing_env.length) console.log(`Missing env: ${report.summary.missing_env.join(", ")}`);
  if (report.summary.placeholder_env.length) console.log(`Placeholder env: ${report.summary.placeholder_env.join(", ")}`);
  if (report.summary.weak_env.length) console.log(`Weak env: ${report.summary.weak_env.join(", ")}`);
  console.log(
    "Next: run `npm run payload:bootstrap`, configure a private env with PAYLOAD_SECRET and DATABASE_URL, run `npm run payload:runtime`, then `npm run payload:preflight`.",
  );
}
