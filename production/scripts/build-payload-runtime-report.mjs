import {
  buildPayloadRuntimeReport,
  DEFAULT_PAYLOAD_RUNTIME_REPORT,
  writePayloadRuntimeReport,
} from "../lib/payload-runtime.mjs";

const outputPath = process.env.MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH || DEFAULT_PAYLOAD_RUNTIME_REPORT;
const outPath = writePayloadRuntimeReport(
  await buildPayloadRuntimeReport({ generatedAt: "2026-07-06T00:00:00Z" }),
  outputPath,
);

console.log(`Wrote Payload runtime report to ${outPath}`);
