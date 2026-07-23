import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_PRODUCTION_RECOVERY_REPORT = fromRoot("production", "data", "production-recovery-report.json");
export const DEFAULT_PRODUCTION_RECOVERY_REPORT_EXAMPLE = fromRoot(
  "production",
  "data",
  "production-recovery-report.json.example",
);

const REQUIRED_COMPONENTS = ["payload_postgres", "runtime_data", "runtime_evidence"];
const SECRET_FIELD_PATTERN = /(authorization|password|secret|token|api(?:access)?key|accesskey|privatekey)/i;

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
  if (report.schema_version !== 1 || report.environment !== "production" || report.ready !== true) {
    throw new Error("Production recovery report must be ready production evidence");
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
  if (report.backup?.checksum_verified !== true) throw new Error("Production backup checksum must be verified");
  assertComponents(report.backup?.components, "Production backup");

  text(report.restore_drill?.drill_id, "restore_drill.drill_id");
  const restoredBackupId = text(report.restore_drill?.source_backup_id, "restore_drill.source_backup_id");
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
  if (reviewer.toLowerCase() === operator.toLowerCase()) {
    throw new Error("Production recovery reviewer must be distinct from the restore operator");
  }
  return true;
}

export function productionRecoveryState(reportPath = DEFAULT_PRODUCTION_RECOVERY_REPORT) {
  if (!fs.existsSync(reportPath)) return { status: "missing_report", path: reportPath };
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (report.example === true || reportPath.endsWith(".example")) {
      return { status: "example_report", path: reportPath };
    }
    assertProductionRecoveryReport(report);
    return { status: "pass", path: reportPath, report };
  } catch (error) {
    return { status: "invalid_report", path: reportPath, error: error.message };
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
