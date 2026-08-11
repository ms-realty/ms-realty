import fs from "node:fs";
import path from "node:path";
import { fromRoot, repoRelativePath } from "./paths.mjs";

export const DEFAULT_MONITORING_ROLLBACK_REPORT = fromRoot("production", "data", "monitoring-rollback-report.json");
export const DEFAULT_REPORT_PATH = DEFAULT_MONITORING_ROLLBACK_REPORT;
export const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const SECRET_FIELD_PATTERN = /(authorization|password|secret|token|apikey|accesskey|privatekey|credential|bearer|cookie|sessionid)/i;
const PLACEHOLDER_PATTERN = /\b(example|placeholder|change[-_ ]?me|replace[-_ ]?with|sample|dummy|fake|todo)\b/i;
const URL_USERINFO_PATTERN = /:\/\/[^/\s@]*@/;
const SECRET_QUERY_PATTERN = /[?&](authorization|password|secret|token|apikey|accesskey|privatekey|credential|bearer)=/i;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const CLOUDFLARE_VERSION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROBE_PATH = "production/scripts/probe-production-journeys.mjs";

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function evidenceText(value, label) {
  if (typeof value !== "string" || !value.trim() || PLACEHOLDER_PATTERN.test(value)) {
    throw new Error(`${label} must be real evidence`);
  }
  return value.trim();
}

function timestamp(value, label) {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) {
    throw new Error(`${label} must be a valid UTC timestamp`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid UTC timestamp`);
  const normalized = new Date(parsed).toISOString();
  if (value !== normalized && value !== normalized.replace(".000Z", "Z")) {
    throw new Error(`${label} must be a valid UTC timestamp`);
  }
  return parsed;
}

function localHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host === "0.0.0.0" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }
  if (/^(10|127)\./.test(host) || /^(169\.254|192\.168)\./.test(host) || /^(fc|fd|fe80:)/i.test(host)) return true;
  const octets = host.split(".").map(Number);
  return octets.length === 4 && octets.every(Number.isInteger) && octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
}

function publicHttpsEndpoint(value, label) {
  const endpoint = evidenceText(value, label);
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error(`${label} must be an HTTPS endpoint`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || localHostname(parsed.hostname)) {
    throw new Error(`${label} must be a non-local HTTPS endpoint without userinfo`);
  }
  return parsed;
}

function assertRedacted(value, ancestors = new WeakSet()) {
  if (typeof value === "string") {
    if (PLACEHOLDER_PATTERN.test(value)) throw new Error("Monitoring rollback report must not contain examples or placeholders");
    if (/\bbearer\b/i.test(value) || URL_USERINFO_PATTERN.test(value) || SECRET_QUERY_PATTERN.test(value)) {
      throw new Error("Monitoring rollback report must not contain secrets");
    }
    return;
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") return;
  if (typeof value !== "object" || ancestors.has(value)) throw new Error("Monitoring rollback report must be JSON-safe");

  ancestors.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_FIELD_PATTERN.test(key.replace(/[^a-z0-9]/gi, ""))) {
      throw new Error("Monitoring rollback report must not contain secret-like fields");
    }
    assertRedacted(nested, ancestors);
  }
  ancestors.delete(value);
}

function passEndpoint(endpoint, generatedAt, releaseId) {
  object(endpoint, "monitoring.endpoints entry");
  if (endpoint.status !== "pass") return false;
  publicHttpsEndpoint(endpoint.url, "monitoring endpoint URL");
  if (evidenceText(endpoint.build_marker, "monitoring endpoint build_marker") !== releaseId) {
    throw new Error("Monitoring endpoint must report the exact release build marker");
  }
  if (endpoint.probe !== PROBE_PATH) {
    throw new Error("Monitoring endpoint must use the production journey probe");
  }
  evidenceTimestamp(endpoint.checked_at, "monitoring endpoint checked_at", generatedAt);
  return true;
}

function evidenceTimestamp(value, label, generatedAt) {
  const parsed = timestamp(value, label);
  if (parsed > generatedAt) throw new Error(`${label} cannot be later than generated_at`);
  return parsed;
}

function stateOptions(options) {
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const nowValue = options?.now ?? Date.now();
  const now = nowValue instanceof Date ? nowValue.getTime() : typeof nowValue === "number" ? nowValue : Date.parse(nowValue);
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0 || !Number.isFinite(now)) throw new Error("Monitoring rollback state options are invalid");
  return { maxAgeMs, now };
}

function evidenceTimes(report) {
  const endpoint = report.monitoring.endpoints.find((item) => item.status === "pass");
  return [
    timestamp(report.generated_at, "generated_at"),
    timestamp(endpoint.checked_at, "monitoring endpoint checked_at"),
    timestamp(report.alert_delivery.triggered_at, "alert_delivery.triggered_at"),
    timestamp(report.alert_delivery.delivered_at, "alert_delivery.delivered_at"),
    timestamp(report.rollback.canary.checked_at, "rollback.canary.checked_at"),
    timestamp(report.rollback.drill.verified_at, "rollback.drill.verified_at"),
  ];
}

// This validates redacted, machine-generated external evidence; it never executes monitoring or rollback.
export function assertMonitoringRollbackReport(report) {
  object(report, "Monitoring rollback report");
  if (report.example === true) throw new Error("Monitoring rollback example cannot clear launch readiness");
  assertRedacted(report);
  if (report.schema_version !== 2 || report.environment !== "production" || report.ready !== true) {
    throw new Error("Monitoring rollback report must be ready production schema v2 evidence");
  }

  const generatedAt = timestamp(report.generated_at, "generated_at");
  const releaseId = evidenceText(report.release_id, "release_id");
  if (!/^[0-9a-f]{40}$/i.test(releaseId)) throw new Error("Monitoring rollback release_id must be an exact commit SHA");
  const monitoring = object(report.monitoring, "monitoring");
  if (monitoring.provider !== "github-actions-cloudflare-workers") {
    throw new Error("Monitoring rollback report must come from the GitHub Actions Cloudflare drill");
  }
  const providerRunId = evidenceText(monitoring.provider_run_id, "monitoring.provider_run_id");
  if (!/^\d+$/.test(providerRunId)) throw new Error("monitoring.provider_run_id must be a GitHub run ID");
  const providerRunAttempt = evidenceText(monitoring.provider_run_attempt, "monitoring.provider_run_attempt");
  if (!POSITIVE_INTEGER_PATTERN.test(providerRunAttempt)) throw new Error("monitoring.provider_run_attempt must be positive");
  const repository = evidenceText(monitoring.repository, "monitoring.repository");
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) throw new Error("monitoring.repository must be owner/repository");
  const workflowRef = evidenceText(monitoring.workflow_ref, "monitoring.workflow_ref");
  if (!workflowRef.includes(`${repository}/.github/workflows/monitoring-drill.yml@`)) {
    throw new Error("monitoring.workflow_ref must identify the monitoring drill workflow");
  }
  const expectedRunUrl = `https://github.com/${repository}/actions/runs/${providerRunId}/attempts/${providerRunAttempt}`;
  publicHttpsEndpoint(monitoring.run_url, "monitoring.run_url");
  if (monitoring.run_url !== expectedRunUrl) throw new Error("monitoring.run_url must identify the exact GitHub run attempt");
  const expectedCorrelation = `${repository}:monitoring-drill:${providerRunId}:${providerRunAttempt}`;
  if (evidenceText(monitoring.correlation_id, "monitoring.correlation_id") !== expectedCorrelation) {
    throw new Error("monitoring.correlation_id must bind repository, run, and attempt");
  }
  if (evidenceText(monitoring.machine_artifact_name, "monitoring.machine_artifact_name") !== `monitoring-drill-machine-evidence-${providerRunId}-${providerRunAttempt}`) {
    throw new Error("monitoring.machine_artifact_name must bind the exact GitHub run attempt");
  }
  if (!Array.isArray(monitoring.endpoints) || !monitoring.endpoints.some((endpoint) => passEndpoint(endpoint, generatedAt, releaseId))) {
    throw new Error("Monitoring rollback report requires a passing non-local HTTPS endpoint check");
  }

  const alertDelivery = object(report.alert_delivery, "alert_delivery");
  if (alertDelivery.status !== "pass") throw new Error("Monitoring rollback report requires passing alert delivery");
  evidenceText(alertDelivery.provider, "alert_delivery.provider");
  const receiptId = evidenceText(alertDelivery.receipt_id, "alert_delivery.receipt_id");
  if (receiptId.length < 8 || ISO_TIMESTAMP_PATTERN.test(receiptId)) {
    throw new Error("alert_delivery.receipt_id must be a durable provider receipt identifier, not a timestamp");
  }
  const correlationId = evidenceText(alertDelivery.correlation_id, "alert_delivery.correlation_id");
  if (correlationId !== monitoring.correlation_id) throw new Error("Alert receipt must correlate to the monitoring run");
  if (evidenceText(alertDelivery.provider_run_id, "alert_delivery.provider_run_id") !== monitoring.provider_run_id) {
    throw new Error("Alert receipt must reference the monitoring provider run");
  }
  if (evidenceText(alertDelivery.provider_run_attempt, "alert_delivery.provider_run_attempt") !== monitoring.provider_run_attempt) {
    throw new Error("Alert receipt must reference the monitoring provider run attempt");
  }
  if (evidenceText(alertDelivery.repository, "alert_delivery.repository") !== monitoring.repository) {
    throw new Error("Alert receipt must reference the monitoring repository");
  }
  publicHttpsEndpoint(alertDelivery.run_url, "alert_delivery.run_url");
  if (alertDelivery.run_url !== monitoring.run_url) throw new Error("Alert receipt must reference the monitoring run URL");
  const triggeredAt = evidenceTimestamp(alertDelivery.triggered_at, "alert_delivery.triggered_at", generatedAt);
  const deliveredAt = evidenceTimestamp(alertDelivery.delivered_at, "alert_delivery.delivered_at", generatedAt);
  if (deliveredAt < triggeredAt) throw new Error("Alert receipt cannot predate the monitor failure");

  const rollback = object(report.rollback, "rollback");
  evidenceText(rollback.automatic_policy_id, "rollback.automatic_policy_id");
  const canary = object(rollback.canary, "rollback.canary");
  if (canary.status !== "pass") throw new Error("Monitoring rollback report requires a passing canary run");
  evidenceText(canary.run_id, "rollback.canary.run_id");
  if (evidenceText(canary.release_id, "rollback.canary.release_id") !== releaseId) {
    throw new Error("Monitoring rollback canary must reference the report release_id");
  }
  const canaryWorker = evidenceText(canary.worker, "rollback.canary.worker");
  if (canaryWorker !== `msr-monitoring-drill-${providerRunId}-${providerRunAttempt}`) {
    throw new Error("Monitoring rollback canary Worker must bind the exact GitHub run attempt");
  }
  const canaryUrl = publicHttpsEndpoint(canary.url, "rollback.canary.url");
  if (!canaryUrl.hostname.startsWith(`${canaryWorker}.`) || !canaryUrl.hostname.endsWith(".workers.dev")) {
    throw new Error("Monitoring rollback canary URL must identify its isolated Cloudflare Worker");
  }
  const canaryVersion = evidenceText(canary.version_id, "rollback.canary.version_id");
  if (!CLOUDFLARE_VERSION_PATTERN.test(canaryVersion)) throw new Error("rollback.canary.version_id must be a Cloudflare Worker version ID");
  if (canary.run_id !== `${canaryWorker}:${canaryVersion}`) throw new Error("rollback.canary.run_id must bind Worker and version");
  if (evidenceText(canary.build_marker, "rollback.canary.build_marker") !== releaseId) {
    throw new Error("Monitoring rollback canary must report the exact release build marker");
  }
  if (canary.probe !== PROBE_PATH) {
    throw new Error("Monitoring rollback canary must use the production journey probe");
  }
  evidenceTimestamp(canary.checked_at, "rollback.canary.checked_at", generatedAt);

  const drill = object(rollback.drill, "rollback.drill");
  if (drill.status !== "pass" || drill.target !== "isolated" || drill.rollback_procedure_verified !== true) {
    throw new Error("Monitoring rollback drill must pass in isolation with a verified procedure");
  }
  evidenceText(drill.drill_id, "rollback.drill.drill_id");
  if (evidenceText(drill.release_id, "rollback.drill.release_id") !== releaseId) {
    throw new Error("Monitoring rollback drill must reference the report release_id");
  }
  if (evidenceText(drill.worker, "rollback.drill.worker") !== canaryWorker) {
    throw new Error("Monitoring rollback drill must use the canary Worker identity");
  }
  publicHttpsEndpoint(drill.url, "rollback.drill.url");
  if (drill.url !== canary.url) throw new Error("Monitoring rollback drill must use the canary URL");
  const baselineVersion = evidenceText(drill.baseline_version_id, "rollback.drill.baseline_version_id");
  const faultVersion = evidenceText(drill.fault_version_id, "rollback.drill.fault_version_id");
  const restoredVersion = evidenceText(drill.restored_version_id, "rollback.drill.restored_version_id");
  if (![baselineVersion, faultVersion, restoredVersion].every((value) => CLOUDFLARE_VERSION_PATTERN.test(value))) {
    throw new Error("Monitoring rollback drill version IDs must be Cloudflare Worker version IDs");
  }
  if (baselineVersion !== canaryVersion || faultVersion === baselineVersion || restoredVersion !== baselineVersion) {
    throw new Error("Monitoring rollback drill must retain distinct fault and exact restored version IDs");
  }
  if (evidenceText(drill.restored_build_marker, "rollback.drill.restored_build_marker") !== releaseId) {
    throw new Error("Monitoring rollback drill must restore the exact release build marker");
  }
  if (drill.failure_surface !== "production_journey_probe" || drill.probe !== PROBE_PATH) {
    throw new Error("Monitoring rollback drill must exercise the production journey monitor failure surface");
  }
  if (drill.drill_id !== correlationId) throw new Error("Monitoring rollback drill must correlate to the alert receipt");
  evidenceTimestamp(drill.verified_at, "rollback.drill.verified_at", generatedAt);
  return true;
}

export function monitoringRollbackState(reportPath = DEFAULT_MONITORING_ROLLBACK_REPORT, options = {}) {
  const normalizedPath = repoRelativePath(reportPath);
  if (!fs.existsSync(reportPath)) return { status: "missing", path: normalizedPath };
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (report?.example === true || reportPath.endsWith(".example")) return { status: "example", path: normalizedPath };
    assertMonitoringRollbackReport(report);
    const { maxAgeMs, now } = stateOptions(options);
    const [generatedAt, ...operationalEvidenceTimes] = evidenceTimes(report);
    const ageMs = now - generatedAt;
    if (ageMs < 0) return { status: "invalid", path: normalizedPath, error: "generated_at is in the future" };
    const evidenceAgeMs = now - Math.min(...operationalEvidenceTimes);
    if (evidenceAgeMs > maxAgeMs) {
      return { status: "expired", path: normalizedPath, age_ms: ageMs, evidence_age_ms: evidenceAgeMs, max_age_ms: maxAgeMs };
    }
    return { status: "pass", path: normalizedPath, age_ms: ageMs, evidence_age_ms: evidenceAgeMs, report };
  } catch (error) {
    return { status: "invalid", path: normalizedPath, error: error.message };
  }
}

export function writeMonitoringRollbackReport(report, outPath = DEFAULT_MONITORING_ROLLBACK_REPORT) {
  assertMonitoringRollbackReport(report);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}
