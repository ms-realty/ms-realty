import {
  buildMobileElderlyQaReport,
  DEFAULT_MOBILE_ELDERLY_QA_OUTPUT,
  writeMobileElderlyQaReport,
} from "../lib/mobile-elderly-qa.mjs";

writeMobileElderlyQaReport(
  buildMobileElderlyQaReport({ generatedAt: "2026-07-05T00:00:00Z" }),
  DEFAULT_MOBILE_ELDERLY_QA_OUTPUT,
);
console.log(`Wrote mobile/elderly QA report to ${DEFAULT_MOBILE_ELDERLY_QA_OUTPUT}`);
