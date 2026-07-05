import {
  buildTranslationCoverageReport,
  DEFAULT_TRANSLATION_COVERAGE_REPORT,
  writeTranslationCoverageReport,
} from "../lib/translation-coverage.mjs";

const report = buildTranslationCoverageReport({ generatedAt: "2026-07-05T00:00:00Z" });
writeTranslationCoverageReport(report);
console.log(`Wrote translation coverage report to ${DEFAULT_TRANSLATION_COVERAGE_REPORT}`);
