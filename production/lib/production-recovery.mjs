import fs from "node:fs";
import path from "node:path";
import { evidenceFreshness } from "./evidence-freshness.mjs";
import { fromRoot, repoRelativePath } from "./paths.mjs";

export const DEFAULT_PRODUCTION_RECOVERY_REPORT = fromRoot("production", "data", "production-recovery-report.json");
export const DEFAULT_PRODUCTION_RECOVERY_REPORT_EXAMPLE = fromRoot(
  "production",
  "data",
  "production-recovery-report.json.example",
);

const REQUIRED_COMPONENTS = ["payload_postgres", "runtime_data", "runtime_evidence"];
const SECRET_FIELD_PATTERN = /(authorization|password|secret|token|api(?:access)?key|accesskey|privatekey)/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/;

function timestamp(value, label) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return parsed;
}

function text(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized || /change-me|example|placeholder/i.test(normalized)) throw new Error(`${label} must be real evidence`);
  return normalized;
}

function positiveNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive`);
}

function sha256(value, label) {
  const normalized = text(value, label);
  if (!SHA256_PATTERN.test(normalized)) throw new Error(`${label} must be a SHA-256 digest`);
  return normalized;
}

function releaseSha(value, label) {
  const normalized = text(value, label);
  if (!RELEASE_SHA_PATTERN.test(normalized)) throw new Error(`${label} must be an exact 40-character release SHA`);
  return normalized;
}

function assertComponents(value, label) {
  if (!Array.isArray(value) || REQUIRED_COMPONENTS.some((component) => !value.includes(component))) {
    throw new Error(`${label} must cover ${REQUIRED_COMPONENTS.join(", ")}`);
  }
}

function hasSecretField(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasSecretField);
  return Object.entries(value).some(([key, nested]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return SECRET_FIELD_PATTERN.test(normalized) || hasSecretField(nested);
  });
}

export function assertProductionRecoveryReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) throw new Error("Production recovery report must be an object");
  if (report.example === true) throw new Error("Production recovery example cannot clear launch readiness");
  if (report.schema_version !== 2 || report.environment !== "production" || report.ready !== true) {
    throw new Error("Production recovery report must be ready production evidence using schema v2");
  }
  if (
    hasSecretField(report) ||
    /Bearer\s+|sk-[A-Za-z0-9_-]+|:\/\/[^/@\s]+:[^/@\s]+@/i.test(JSON.stringify(report))
  ) {
    throw new Error("Production recovery report must not contain secrets");
  }

  const generatedAt = timestamp(report.generated_at, "generated_at");
  const backupCompletedAt = timestamp(report.backup?.completed_at, "backup.completed_at");
  const restoreCompletedAt = timestamp(report.restore_drill?.completed_at, "restore_drill.completed_at");
  const approvedAt = timestamp(report.approval?.approved_at, "approval.approved_at");
  if (!(backupCompletedAt <= restoreCompletedAt && restoreCompletedAt <= approvedAt && approvedAt <= generatedAt + 60_000)) {
    throw new Error("Production recovery evidence must proceed from backup to restore, approval, and report generation");
  }

  const provider = text(report.policy?.provider, "policy.provider");
  if (/local|docker|preview/i.test(provider)) throw new Error("Production recovery provider must be off-site infrastructure");
  if (report.policy?.offsite !== true || report.policy?.encrypted_at_rest !== true || report.policy?.encrypted_in_transit !== true) {
    throw new Error("Production recovery policy must be encrypted and off-site");
  }
  positiveNumber(report.policy?.retention_days, "policy.retention_days");
  positiveNumber(report.policy?.rpo_hours, "policy.rpo_hours");
  positiveNumber(report.policy?.rto_hours, "policy.rto_hours");

  const backupId = text(report.backup?.backup_id, "backup.backup_id");
  const backupCiphertextSha = sha256(report.backup?.ciphertext_sha256, "backup.ciphertext_sha256");
  const backupManifestSha = sha256(report.backup?.manifest_sha256, "backup.manifest_sha256");
  const backupMonitoringSha = sha256(
    report.backup?.monitoring_rollback_report_sha256,
    "backup.monitoring_rollback_report_sha256",
  );
  const backupReleaseSha = releaseSha(report.backup?.release_id, "backup.release_id");
  if (report.backup?.checksum_verified !== true) throw new Error("Production backup checksum must be verified");
  assertComponents(report.backup?.components, "Production backup");

  text(report.restore_drill?.drill_id, "restore_drill.drill_id");
  const restoredBackupId = text(report.restore_drill?.source_backup_id, "restore_drill.source_backup_id");
  const restoreCiphertextSha = sha256(report.restore_drill?.ciphertext_sha256, "restore_drill.ciphertext_sha256");
  const restoreManifestSha = sha256(report.restore_drill?.manifest_sha256, "restore_drill.manifest_sha256");
  const restoreResultSha = sha256(report.restore_drill?.result_sha256, "restore_drill.result_sha256");
  const restoreMonitoringSha = sha256(
    report.restore_drill?.monitoring_rollback_report_sha256,
    "restore_drill.monitoring_rollback_report_sha256",
  );
  const restoreReleaseSha = releaseSha(report.restore_drill?.release_id, "restore_drill.release_id");
  const operator = text(report.restore_drill?.operator, "restore_drill.operator");
  if (restoredBackupId !== backupId) throw new Error("Production restore drill must reference the cited backup");
  if (
    report.restore_drill?.status !== "pass" ||
    report.restore_drill?.target !== "isolated" ||
    report.restore_drill?.checksum_verified !== true ||
    report.restore_drill?.rollback_procedure_verified !== true
  ) {
    throw new Error("Production restore drill must pass in isolation with checksum and rollback verification");
  }
  assertComponents(report.restore_drill?.components_verified, "Production restore drill");

  const reviewer = text(report.approval?.reviewer, "approval.reviewer");
  if (report.approval?.status !== "approved") throw new Error("Production recovery evidence requires explicit approval");
  text(report.approval?.approval_id, "approval.approval_id");
  sha256(report.approval?.artifact_sha256, "approval.artifact_sha256");
  const approvalCiphertextSha = sha256(report.approval?.ciphertext_sha256, "approval.ciphertext_sha256");
  const approvalManifestSha = sha256(report.approval?.manifest_sha256, "approval.manifest_sha256");
  const approvalRestoreSha = sha256(report.approval?.restore_drill_sha256, "approval.restore_drill_sha256");
  const approvalMonitoringSha = sha256(
    report.approval?.monitoring_rollback_report_sha256,
    "approval.monitoring_rollback_report_sha256",
  );
  const approvalReleaseSha = releaseSha(report.approval?.release_id, "approval.release_id");
  if (
    backupCiphertextSha !== restoreCiphertextSha ||
    backupCiphertextSha !== approvalCiphertextSha ||
    backupManifestSha !== restoreManifestSha ||
    backupManifestSha !== approvalManifestSha ||
    backupMonitoringSha !== restoreMonitoringSha ||
    backupMonitoringSha !== approvalMonitoringSha ||
    backupReleaseSha !== restoreReleaseSha ||
    backupReleaseSha !== approvalReleaseSha ||
    restoreResultSha !== approvalRestoreSha
  ) {
    throw new Error("Production recovery backup, restore, and approval evidence identities must match");
  }
  if (reviewer.toLowerCase() === operator.toLowerCase()) {
    throw new Error("Production recovery reviewer must be distinct from the restore operator");
  }
  return true;
}

export function productionRecoveryEvidenceAt(report) {
  return new Date(
    Math.min(
      timestamp(report.generated_at, "generated_at"),
      timestamp(report.backup?.completed_at, "backup.completed_at"),
      timestamp(report.restore_drill?.completed_at, "restore_drill.completed_at"),
      timestamp(report.approval?.approved_at, "approval.approved_at"),
    ),
  ).toISOString();
}

export function productionRecoveryFreshness(report, { now = Date.now() } = {}) {
  assertProductionRecoveryReport(report);
  const nowMs = now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("Production recovery freshness requires a valid current timestamp");
  const generatedFreshness = evidenceFreshness("production_recovery", report.generated_at, { now: nowMs });
  if (generatedFreshness.status === "invalid") return generatedFreshness;
  return evidenceFreshness("production_recovery", productionRecoveryEvidenceAt(report), { now: nowMs });
}

export function productionRecoveryState(reportPath = DEFAULT_PRODUCTION_RECOVERY_REPORT, { now = Date.now() } = {}) {
  if (!fs.existsSync(reportPath)) return { status: "missing_report", path: repoRelativePath(reportPath) };
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (report.example === true || reportPath.endsWith(".example")) {
      return { status: "example_report", path: repoRelativePath(reportPath) };
    }
    assertProductionRecoveryReport(report);
    const freshness = productionRecoveryFreshness(report, { now });
    if (freshness.status === "invalid") throw new Error(freshness.error);
    return {
      status: freshness.status === "fresh" ? "pass" : "expired_report",
      path: repoRelativePath(reportPath),
      generated_at: report.generated_at,
      evidence_at: productionRecoveryEvidenceAt(report),
      freshness,
      report,
    };
  } catch (error) {
    return { status: "invalid_report", path: repoRelativePath(reportPath), error: error.message };
  }
}

export function readProductionRecoveryTemplate(reportPath = DEFAULT_PRODUCTION_RECOVERY_REPORT_EXAMPLE) {
  return fs.readFileSync(reportPath, "utf8");
}

export function writeProductionRecoveryReport(report, outPath = DEFAULT_PRODUCTION_RECOVERY_REPORT) {
  assertProductionRecoveryReport(report);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}
