import {
  buildStructuredDataReport,
  DEFAULT_STRUCTURED_DATA_REPORT,
  writeStructuredDataReport,
} from "../lib/structured-data-report.mjs";

writeStructuredDataReport(buildStructuredDataReport({ generatedAt: "2026-07-05T00:00:00Z" }), DEFAULT_STRUCTURED_DATA_REPORT);
console.log(`Wrote structured data report to ${DEFAULT_STRUCTURED_DATA_REPORT}`);
