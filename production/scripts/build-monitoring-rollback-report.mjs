import fs from "node:fs";
import {
  DEFAULT_MONITORING_ROLLBACK_REPORT,
  writeMonitoringRollbackReport,
} from "../lib/monitoring-rollback.mjs";

const evidencePath = String(process.env.MS_REALTY_MONITORING_DRILL_EVIDENCE_PATH || "").trim();
const deliveredAt = String(process.env.MS_REALTY_ALERT_DELIVERED_AT || "").trim();
const generatedAt = process.env.MS_REALTY_GENERATED_AT || new Date().toISOString();
const outputPath = process.env.MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH || DEFAULT_MONITORING_ROLLBACK_REPORT;

if (!evidencePath || !fs.existsSync(evidencePath)) throw new Error("MS_REALTY_MONITORING_DRILL_EVIDENCE_PATH must reference downloaded drill evidence");
if (!deliveredAt) throw new Error("MS_REALTY_ALERT_DELIVERED_AT requires human confirmation of the GitHub failure alert");

const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
if (
  evidence?.schema_version !== 1 ||
  evidence?.environment !== "production" ||
  !/^[0-9a-f]{40}$/i.test(evidence?.release_id || "") ||
  !/^\d+$/.test(evidence?.provider_run_id || "") ||
  evidence?.production?.status !== "pass" ||
  evidence?.canary?.status !== "pass" ||
  evidence?.rollback?.status !== "pass" ||
  evidence?.rollback?.target !== "isolated" ||
  evidence?.rollback?.active_version_id !== evidence?.rollback?.first_version_id ||
  evidence?.rollback?.first_version_id === evidence?.rollback?.second_version_id
) {
  throw new Error("Monitoring drill evidence is incomplete or did not prove an isolated rollback");
}

const runId = evidence.provider_run_id;
const report = {
  schema_version: 1,
  generated_at: generatedAt,
  environment: "production",
  ready: true,
  release_id: evidence.release_id,
  monitoring: {
    provider: evidence.provider,
    provider_run_id: runId,
    endpoints: [evidence.production],
  },
  alert_delivery: { status: "pass", delivered_at: deliveredAt },
  rollback: {
    automatic_policy_id: "github-actions-ci-failed-health-rollback",
    canary: {
      run_id: `github-actions-run-${runId}-canary`,
      release_id: evidence.release_id,
      status: "pass",
      checked_at: evidence.canary.checked_at,
    },
    drill: {
      drill_id: `github-actions-run-${runId}-isolated-rollback`,
      release_id: evidence.release_id,
      status: "pass",
      target: "isolated",
      rollback_procedure_verified: true,
      verified_at: evidence.rollback.verified_at,
    },
  },
};

writeMonitoringRollbackReport(report, outputPath);
console.log(`Wrote monitoring and rollback report to ${outputPath}`);
