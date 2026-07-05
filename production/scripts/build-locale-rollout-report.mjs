import {
  buildLocaleRolloutReport,
  DEFAULT_LOCALE_ROLLOUT_REPORT,
  writeLocaleRolloutReport,
} from "../lib/locale-rollout.mjs";

const report = buildLocaleRolloutReport({ generatedAt: "2026-07-05T00:00:00Z" });
writeLocaleRolloutReport(report);
console.log(`Wrote locale rollout report to ${DEFAULT_LOCALE_ROLLOUT_REPORT}`);
