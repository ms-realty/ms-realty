// Decides how a rollback treats its preserved monitoring evidence. Prints
// "preserve" or "drill"; the reason goes to stderr. This is a decision, not a
// validation, so it always exits 0.
import { DEFAULT_MONITORING_ROLLBACK_REPORT, rollbackEvidenceAction } from "../lib/monitoring-rollback.mjs";

const reportPath = process.env.MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH || DEFAULT_MONITORING_ROLLBACK_REPORT;
const rollbackWindowMs = Number(process.env.MS_REALTY_ROLLBACK_WINDOW_MS || 15 * 60 * 1000);
const decision = rollbackEvidenceAction(reportPath, { rollbackWindowMs });
console.error(`rollback evidence: ${decision.action} (${decision.reason}${decision.state.remaining_ms !== undefined ? `, ${Math.round(decision.state.remaining_ms / 60000)} min left` : ""})`);
process.stdout.write(decision.action);
