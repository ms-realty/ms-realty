import {
  buildLeadSlaReport,
  DEFAULT_LEAD_SLA_REPORT,
  writeLeadSlaReport,
} from "../lib/lead-sla.mjs";

const report = buildLeadSlaReport({ generatedAt: "2026-07-04T01:30:00Z" });
writeLeadSlaReport(report);
console.log(`Wrote lead SLA report to ${DEFAULT_LEAD_SLA_REPORT}`);
