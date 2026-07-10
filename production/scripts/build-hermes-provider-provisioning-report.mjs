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

if (!report.ready) {
  console.log(`Hermes provider provisioning blocked: missing ${report.missing.join(", ")}`);
  console.log(`Official Hermes Agent: ${report.agent_runtime.official_url}`);
  console.log(
    "Next: install Hermes Agent, provision a private OpenAI-compatible vLLM endpoint behind its API server, set HERMES_CHAT_COMPLETIONS_URL and HERMES_API_KEY for that Agent API, then run `npm run hermes:runtime` and `npm run hermes:worker`.",
  );
}
