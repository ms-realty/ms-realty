import {
  buildHermesProviderProvisioningReport,
  writeHermesProviderProvisioningReport,
} from "../lib/hermes-provider-provisioning.mjs";

const report = buildHermesProviderProvisioningReport({
  generatedAt: process.env.MS_REALTY_GENERATED_AT || "2026-07-06T00:00:00Z",
});
const outPath = writeHermesProviderProvisioningReport(
  report,
  process.env.MS_REALTY_HERMES_PROVIDER_PROVISIONING_REPORT_PATH || undefined,
);

console.log(`Wrote Hermes provider provisioning report to ${outPath}`);
