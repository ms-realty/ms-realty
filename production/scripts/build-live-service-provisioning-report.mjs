import {
  buildLiveServiceProvisioningReport,
  DEFAULT_LIVE_SERVICE_PROVISIONING_REPORT,
  writeLiveServiceProvisioningReport,
} from "../lib/live-service-provisioning.mjs";

const outputPath = process.env.MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH || DEFAULT_LIVE_SERVICE_PROVISIONING_REPORT;
const outPath = writeLiveServiceProvisioningReport(
  await buildLiveServiceProvisioningReport({ generatedAt: "2026-07-06T00:00:00Z" }),
  outputPath,
);

console.log(`Wrote live service provisioning report to ${outPath}`);
