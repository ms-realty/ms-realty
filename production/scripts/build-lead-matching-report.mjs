import { buildLeadMatchingReport, DEFAULT_LEAD_MATCHING_REPORT, writeLeadMatchingReport } from "../lib/lead-matching.mjs";
import { readDeals } from "../lib/deal-ledger.mjs";
import { readLeadLedger } from "../lib/lead-ledger.mjs";
import { deriveLeadPipelineStates, readLeadPipelineOutcomes } from "../lib/lead-pipeline-outcomes.mjs";
import { readViewingFollowUps } from "../lib/viewing-follow-ups.mjs";
import { readViewings } from "../lib/viewing-ledger.mjs";

const leads = readLeadLedger();
const leadPipelineStates = deriveLeadPipelineStates({
  leads,
  outcomes: readLeadPipelineOutcomes(),
  viewings: readViewings(),
  viewingFollowUps: readViewingFollowUps(),
  deals: readDeals(),
});
const report = buildLeadMatchingReport({ leads, leadPipelineStates, generatedAt: new Date().toISOString() });
writeLeadMatchingReport(report);
console.log(`Wrote lead matching report to ${DEFAULT_LEAD_MATCHING_REPORT}`);
