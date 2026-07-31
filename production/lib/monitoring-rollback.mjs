import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_MONITORING_ROLLBACK_REPORT = fromRoot("production", "data", "monitoring-rollback-report.json");
export const DEFAULT_REPORT_PATH = DEFAULT_MONITORING_ROLLBACK_REPORT;
export const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const SECRET_FIELD_PATTERN = /(authorization|password|secret|token|apikey|accesskey|privatekey|credential|bearer|cookie|sessionid)/i;
const PLACEHOLDER_PATTERN = /\b(example|placeholder|change[-_ ]?me|replace[-_ ]?with|sample|dummy|fake|todo)\b/i;
const URL_USERINFO_PATTERN = /:\/\/[^/\s@]*@/;
const SECRET_QUERY_PATTERN = /[?&](authorization|password|secret|token|apikey|accesskey|privatekey|credential|bearer)=/i;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

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

function passEndpoint(endpoint, generatedAt) {
  object(endpoint, "monitoring.endpoints entry");
  if (endpoint.status !== "pass") return false;
  publicHttpsEndpoint(endpoint.url, "monitoring endpoint URL");
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
  if (report.schema_version !== 1 || report.environment !== "production" || report.ready !== true) {
    throw new Error("Monitoring rollback report must be ready production schema v1 evidence");
  }

  const generatedAt = timestamp(report.generated_at, "generated_at");
  const releaseId = evidenceText(report.release_id, "release_id");
  const monitoring = object(report.monitoring, "monitoring");
  evidenceText(monitoring.provider, "monitoring.provider");
  evidenceText(monitoring.provider_run_id, "monitoring.provider_run_id");
  if (!Array.isArray(monitoring.endpoints) || !monitoring.endpoints.some((endpoint) => passEndpoint(endpoint, generatedAt))) {
    throw new Error("Monitoring rollback report requires a passing non-local HTTPS endpoint check");
  }

  const alertDelivery = object(report.alert_delivery, "alert_delivery");
  if (alertDelivery.status !== "pass") throw new Error("Monitoring rollback report requires passing alert delivery");
  evidenceTimestamp(alertDelivery.delivered_at, "alert_delivery.delivered_at", generatedAt);

  const rollback = object(report.rollback, "rollback");
  evidenceText(rollback.automatic_policy_id, "rollback.automatic_policy_id");
  const canary = object(rollback.canary, "rollback.canary");
  if (canary.status !== "pass") throw new Error("Monitoring rollback report requires a passing canary run");
  evidenceText(canary.run_id, "rollback.canary.run_id");
  if (evidenceText(canary.release_id, "rollback.canary.release_id") !== releaseId) {
    throw new Error("Monitoring rollback canary must reference the report release_id");
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
  evidenceTimestamp(drill.verified_at, "rollback.drill.verified_at", generatedAt);
  return true;
}

export function monitoringRollbackState(reportPath = DEFAULT_MONITORING_ROLLBACK_REPORT, options = {}) {
  if (!fs.existsSync(reportPath)) return { status: "missing", path: reportPath };
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (report?.example === true || reportPath.endsWith(".example")) return { status: "example", path: reportPath };
    assertMonitoringRollbackReport(report);
    const { maxAgeMs, now } = stateOptions(options);
    const [generatedAt, ...operationalEvidenceTimes] = evidenceTimes(report);
    const ageMs = now - generatedAt;
    if (ageMs < 0) return { status: "invalid", path: reportPath, error: "generated_at is in the future" };
    const evidenceAgeMs = now - Math.min(...operationalEvidenceTimes);
    if (evidenceAgeMs > maxAgeMs) {
      return { status: "expired", path: reportPath, age_ms: ageMs, evidence_age_ms: evidenceAgeMs, max_age_ms: maxAgeMs };
    }
    return { status: "pass", path: reportPath, age_ms: ageMs, evidence_age_ms: evidenceAgeMs, report };
  } catch (error) {
    return { status: "invalid", path: reportPath, error: error.message };
  }
}

export function writeMonitoringRollbackReport(report, outPath = DEFAULT_MONITORING_ROLLBACK_REPORT) {
  assertMonitoringRollbackReport(report);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}
