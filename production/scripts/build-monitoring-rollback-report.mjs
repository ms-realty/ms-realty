import fs from "node:fs";
import {
  DEFAULT_MONITORING_ROLLBACK_REPORT,
  writeMonitoringRollbackReport,
} from "../lib/monitoring-rollback.mjs";

const PROBE_PATH = "production/scripts/probe-production-journeys.mjs";
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const CLOUDFLARE_VERSION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const evidencePath = String(process.env.MS_REALTY_MONITORING_DRILL_EVIDENCE_PATH || "").trim();
const receiptPath = String(process.env.MS_REALTY_ALERT_RECEIPT_EVIDENCE_PATH || "").trim();
const generatedAt = process.env.MS_REALTY_GENERATED_AT || new Date().toISOString();
const outputPath = process.env.MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH || DEFAULT_MONITORING_ROLLBACK_REPORT;

function readEvidence(path, variable) {
  if (!path || !fs.existsSync(path)) throw new Error(`${variable} must reference downloaded JSON evidence`);
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${variable} must reference valid JSON evidence: ${error.message}`);
  }
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function timestamp(value) {
  if (!ISO_TIMESTAMP_PATTERN.test(text(value))) return Number.NaN;
  return Date.parse(value);
}

function publicHttps(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed : null;
  } catch {
    return null;
  }
}

const evidence = readEvidence(evidencePath, "MS_REALTY_MONITORING_DRILL_EVIDENCE_PATH");
const receipt = readEvidence(receiptPath, "MS_REALTY_ALERT_RECEIPT_EVIDENCE_PATH");
const releaseId = text(evidence.release_id);
const runId = text(evidence.provider_run_id);
const runAttempt = text(evidence.provider_run_attempt);
const repository = text(evidence.repository);
const expectedWorker = `msr-monitoring-drill-${runId}-${runAttempt}`;
const expectedCorrelation = `${repository}:monitoring-drill:${runId}:${runAttempt}`;
const expectedRunUrl = `https://github.com/${repository}/actions/runs/${runId}/attempts/${runAttempt}`;
const canaryUrl = publicHttps(evidence?.canary?.url);
const rollbackUrl = publicHttps(evidence?.rollback?.url);
const receiptId = text(receipt.receipt_id);

const machineEvidenceValid =
  evidence?.schema_version === 2 &&
  evidence?.environment === "production" &&
  SHA_PATTERN.test(releaseId) &&
  evidence?.provider === "github-actions-cloudflare-workers" &&
  /^\d+$/.test(runId) &&
  POSITIVE_INTEGER_PATTERN.test(runAttempt) &&
  /^[^/\s]+\/[^/\s]+$/.test(repository) &&
  text(evidence.workflow_ref).includes(`${repository}/.github/workflows/monitoring-drill.yml@`) &&
  evidence.run_url === expectedRunUrl &&
  evidence.correlation_id === expectedCorrelation &&
  evidence?.confirmation?.mechanism === "workflow_dispatch_typed_confirmation" &&
  evidence?.confirmation?.confirmed === true &&
  text(evidence?.confirmation?.actor) !== "" &&
  text(evidence?.confirmation?.triggering_actor) !== "" &&
  evidence.artifact_name === `monitoring-drill-machine-evidence-${runId}-${runAttempt}` &&
  evidence?.production?.status === "pass" &&
  evidence?.production?.build_marker === releaseId &&
  evidence?.production?.probe === PROBE_PATH &&
  publicHttps(evidence?.production?.url) !== null &&
  Number.isFinite(timestamp(evidence?.production?.checked_at)) &&
  evidence?.canary?.status === "pass" &&
  evidence?.canary?.worker === expectedWorker &&
  canaryUrl?.hostname.startsWith(`${expectedWorker}.`) &&
  canaryUrl?.hostname.endsWith(".workers.dev") &&
  CLOUDFLARE_VERSION_PATTERN.test(text(evidence?.canary?.version_id)) &&
  evidence?.canary?.build_marker === releaseId &&
  evidence?.canary?.probe === PROBE_PATH &&
  Number.isFinite(timestamp(evidence?.canary?.checked_at)) &&
  evidence?.alert_drill?.status === "failure" &&
  evidence?.alert_drill?.correlation_id === expectedCorrelation &&
  evidence?.alert_drill?.failure_surface === "production_journey_probe" &&
  evidence?.alert_drill?.probe === PROBE_PATH &&
  Number.isFinite(timestamp(evidence?.alert_drill?.triggered_at)) &&
  evidence?.rollback?.status === "pass" &&
  evidence?.rollback?.target === "isolated" &&
  evidence?.rollback?.worker === expectedWorker &&
  rollbackUrl?.href === canaryUrl?.href &&
  CLOUDFLARE_VERSION_PATTERN.test(text(evidence?.rollback?.baseline_version_id)) &&
  CLOUDFLARE_VERSION_PATTERN.test(text(evidence?.rollback?.fault_version_id)) &&
  evidence?.rollback?.baseline_version_id === evidence?.canary?.version_id &&
  evidence?.rollback?.fault_version_id !== evidence?.rollback?.baseline_version_id &&
  evidence?.rollback?.restored_version_id === evidence?.rollback?.baseline_version_id &&
  evidence?.rollback?.restored_build_marker === releaseId &&
  evidence?.rollback?.probe === PROBE_PATH &&
  Number.isFinite(timestamp(evidence?.rollback?.verified_at));

if (!machineEvidenceValid) {
  throw new Error("Monitoring drill evidence is incomplete or did not prove an actual MS Realty artifact rollback");
}

const receiptDeliveredAt = timestamp(receipt.delivered_at);
const alertTriggeredAt = timestamp(evidence.alert_drill.triggered_at);
const alertReceiptValid =
  receipt?.schema_version === 1 &&
  receipt?.status === "delivered" &&
  text(receipt.provider) !== "" &&
  receiptId.length >= 8 &&
  !ISO_TIMESTAMP_PATTERN.test(receiptId) &&
  receipt.correlation_id === expectedCorrelation &&
  receipt.provider_run_id === runId &&
  receipt.provider_run_attempt === runAttempt &&
  receipt.repository === repository &&
  receipt.run_url === expectedRunUrl &&
  Number.isFinite(receiptDeliveredAt) &&
  receiptDeliveredAt >= alertTriggeredAt;

if (!alertReceiptValid) {
  throw new Error("Alert receipt evidence does not correlate to the failed monitoring drill run");
}

const report = {
  schema_version: 2,
  generated_at: generatedAt,
  environment: "production",
  ready: true,
  release_id: releaseId,
  monitoring: {
    provider: evidence.provider,
    provider_run_id: runId,
    provider_run_attempt: runAttempt,
    repository,
    workflow_ref: evidence.workflow_ref,
    run_url: evidence.run_url,
    correlation_id: expectedCorrelation,
    machine_artifact_name: evidence.artifact_name,
    endpoints: [evidence.production],
  },
  dispatch_confirmation: {
    mechanism: evidence.confirmation.mechanism,
    actor: text(evidence.confirmation.actor),
    triggering_actor: text(evidence.confirmation.triggering_actor),
  },
  alert_delivery: {
    status: "pass",
    provider: receipt.provider,
    receipt_id: receiptId,
    correlation_id: expectedCorrelation,
    provider_run_id: runId,
    provider_run_attempt: runAttempt,
    repository,
    run_url: expectedRunUrl,
    triggered_at: evidence.alert_drill.triggered_at,
    delivered_at: receipt.delivered_at,
  },
  rollback: {
    automatic_policy_id: "github-actions-ci-failed-health-rollback",
    canary: {
      run_id: `${expectedWorker}:${evidence.canary.version_id}`,
      release_id: releaseId,
      worker: expectedWorker,
      url: evidence.canary.url,
      version_id: evidence.canary.version_id,
      build_marker: evidence.canary.build_marker,
      probe: evidence.canary.probe,
      status: "pass",
      checked_at: evidence.canary.checked_at,
    },
    drill: {
      drill_id: expectedCorrelation,
      release_id: releaseId,
      worker: expectedWorker,
      url: evidence.rollback.url,
      baseline_version_id: evidence.rollback.baseline_version_id,
      fault_version_id: evidence.rollback.fault_version_id,
      restored_version_id: evidence.rollback.restored_version_id,
      restored_build_marker: evidence.rollback.restored_build_marker,
      failure_surface: evidence.alert_drill.failure_surface,
      probe: evidence.rollback.probe,
      status: "pass",
      target: "isolated",
      rollback_procedure_verified: true,
      verified_at: evidence.rollback.verified_at,
    },
  },
};

writeMonitoringRollbackReport(report, outputPath);
console.log(`Wrote monitoring and rollback report to ${outputPath}`);
