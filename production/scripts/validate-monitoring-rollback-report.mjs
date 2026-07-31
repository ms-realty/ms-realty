import { DEFAULT_MONITORING_ROLLBACK_REPORT, monitoringRollbackState } from "../lib/monitoring-rollback.mjs";

const reportPath = process.env.MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH || DEFAULT_MONITORING_ROLLBACK_REPORT;
const state = monitoringRollbackState(reportPath);

if (state.status === "pass") {
  console.log(`Monitoring and rollback report valid: ${reportPath}`);
} else {
  console.error(`MONITORING ROLLBACK PREFLIGHT FAILED: ${state.status} ${reportPath}${state.error ? ` ${state.error}` : ""}`);
  console.error(
    "Next: have the production monitor write a current redacted report with a passing alert delivery, canary, and isolated rollback drill, then rerun npm run monitoring:preflight.",
  );
  process.exitCode = 1;
}
