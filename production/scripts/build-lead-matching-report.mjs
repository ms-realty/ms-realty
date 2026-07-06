import { buildLeadMatchingReport, DEFAULT_LEAD_MATCHING_REPORT, writeLeadMatchingReport } from "../lib/lead-matching.mjs";

const report = buildLeadMatchingReport({ generatedAt: "2026-07-05T00:00:00Z" });
writeLeadMatchingReport(report);
console.log(`Wrote lead matching report to ${DEFAULT_LEAD_MATCHING_REPORT}`);
