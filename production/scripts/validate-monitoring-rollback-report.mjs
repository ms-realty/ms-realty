import { DEFAULT_MONITORING_ROLLBACK_REPORT, monitoringRollbackState } from "../lib/monitoring-rollback.mjs";

const reportPath = process.env.MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH || DEFAULT_MONITORING_ROLLBACK_REPORT;
// Optional: how much validity must remain (ms), e.g. the release plus
// rollback window, so a release never starts on evidence that expires inside it.
const requiredRemainingMs = Number(process.env.MS_REALTY_MONITORING_EVIDENCE_REQUIRED_REMAINING_MS || 0);
const state = monitoringRollbackState(reportPath, { requiredRemainingMs });

if (state.status === "pass") {
  console.log(`Monitoring and rollback report valid: ${reportPath}`);
} else {
  console.error(`MONITORING ROLLBACK PREFLIGHT FAILED: ${state.status} ${reportPath}${state.error ? ` ${state.error}` : ""}`);
  console.error(
    state.status === "expiring"
      ? `Next: the evidence has ${Math.round(state.remaining_ms / 60000)} min left but the release plus rollback window needs ${Math.round(state.required_remaining_ms / 60000)} min; run the monitoring drill (monitoring-drill.yml) for the serving release before releasing.`
      : "Next: have the production monitor write a current redacted report with a passing alert delivery, canary, and isolated rollback drill, then rerun npm run monitoring:preflight.",
  );
  process.exitCode = 1;
}
