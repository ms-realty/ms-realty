import {
  probeHermesAgentRuntime,
  writeHermesAgentRuntimeReport,
} from "../lib/hermes-agent-runtime.mjs";

const report = await probeHermesAgentRuntime({
  generatedAt: process.env.MS_REALTY_GENERATED_AT || new Date().toISOString(),
});
const outPath = writeHermesAgentRuntimeReport(
  report,
  process.env.MS_REALTY_HERMES_AGENT_RUNTIME_REPORT_PATH || undefined,
);

console.log(`Wrote Hermes Agent runtime report to ${outPath}`);
console.log(`Hermes Agent runtime: ${report.status} (${report.evidence_scope})`);
if (!report.ready) {
  console.log(`Next: ${report.next_actions.join(" ")}`);
  process.exitCode = 1;
}
