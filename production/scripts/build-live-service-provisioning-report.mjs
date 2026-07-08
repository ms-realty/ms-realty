import {
  buildLiveServiceProvisioningReport,
  DEFAULT_LIVE_SERVICE_PROVISIONING_REPORT,
  writeLiveServiceProvisioningReport,
} from "../lib/live-service-provisioning.mjs";

const outputPath = process.env.MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH || DEFAULT_LIVE_SERVICE_PROVISIONING_REPORT;
const report = await buildLiveServiceProvisioningReport({ generatedAt: "2026-07-06T00:00:00Z" });
const outPath = writeLiveServiceProvisioningReport(report, outputPath);

console.log(`Wrote live service provisioning report to ${outPath}`);

if (!report.ready) {
  const failed = report.checks
    .filter((check) => check.status !== "pass")
    .map((check) => check.id)
    .join(", ");
  console.log(`Live service provisioning blocked: ${failed}`);
  if (report.summary.missing_env.length) console.log(`Missing env: ${report.summary.missing_env.join(", ")}`);
  if (report.summary.placeholder_env.length) console.log(`Placeholder env: ${report.summary.placeholder_env.join(", ")}`);
  console.log(
    "Next: set real Typesense, Meilisearch, and Hermes provider env, rerun `npm run live:provisioning`, then `npm run live:provisioning:preflight`.",
  );
}
