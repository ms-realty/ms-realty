import crypto from "node:crypto";
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
const RECOVERY_SIGNATURE_ALGORITHM = "Ed25519";
const RECOVERY_KEY_ID_PATTERN = /^ed25519-sha256:[a-f0-9]{64}$/;

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

function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new Error("Production recovery report must contain canonical JSON values only");
}

function ed25519PublicKey(value = process.env.MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY) {
  if (value instanceof crypto.KeyObject) {
    if (value.type !== "public" || value.asymmetricKeyType !== "ed25519") {
      throw new Error("Production recovery verification requires an Ed25519 public key");
    }
    return value;
  }
  const configured = String(value || "").trim();
  if (!configured) throw new Error("MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY is required to verify production recovery evidence");
  if (/PRIVATE KEY/.test(configured)) throw new Error("Production recovery runtime must not receive a private signing key");
  let key;
  try {
    key = configured.includes("BEGIN PUBLIC KEY")
      ? crypto.createPublicKey(configured)
      : crypto.createPublicKey({ key: Buffer.from(configured, "base64"), format: "der", type: "spki" });
  } catch {
    throw new Error("MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY must be an Ed25519 PEM or base64 SPKI public key");
  }
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Production recovery verification requires an Ed25519 public key");
  return key;
}

function ed25519PrivateKey(value) {
  if (value instanceof crypto.KeyObject) {
    if (value.type !== "private" || value.asymmetricKeyType !== "ed25519") {
      throw new Error("Production recovery signing requires an Ed25519 private key");
    }
    return value;
  }
  const configured = typeof value === "string" || Buffer.isBuffer(value) ? value : "";
  if (!configured || configured.length === 0) throw new Error("Production recovery signing requires an Ed25519 private key");
  let key;
  try {
    key = crypto.createPrivateKey(configured);
  } catch {
    throw new Error("Production recovery signing key must be a valid Ed25519 private key");
  }
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Production recovery signing requires an Ed25519 private key");
  return key;
}

export function productionRecoverySigningKeyId(publicKey) {
  const key = ed25519PublicKey(publicKey);
  const digest = crypto.createHash("sha256").update(key.export({ format: "der", type: "spki" })).digest("hex");
  return `ed25519-sha256:${digest}`;
}

function recoverySigningPayload(report) {
  const provenance = report?.provenance;
  return Buffer.from(canonicalJson({
    ...report,
    provenance: {
      algorithm: provenance?.algorithm,
      key_id: provenance?.key_id,
    },
  }));
}

export function signProductionRecoveryReport(report, { privateKey } = {}) {
  const signingKey = ed25519PrivateKey(privateKey);
  const publicKey = crypto.createPublicKey(signingKey);
  const signed = structuredClone(report);
  if (signed.example === true) throw new Error("Production recovery example cannot be signed as launch evidence");
  signed.provenance = {
    algorithm: RECOVERY_SIGNATURE_ALGORITHM,
    key_id: productionRecoverySigningKeyId(publicKey),
  };
  signed.provenance.signature = crypto.sign(null, recoverySigningPayload(signed), signingKey).toString("base64");
  assertProductionRecoveryReport(signed, { publicKey });
  return signed;
}

function assertProductionRecoveryProvenance(report, publicKey) {
  const provenance = report.provenance;
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
    throw new Error("Production recovery report requires machine-generated Ed25519 provenance");
  }
  const keys = Object.keys(provenance).sort();
  if (keys.join(",") !== "algorithm,key_id,signature") {
    throw new Error("Production recovery provenance has unsupported or missing fields");
  }
  if (provenance.algorithm !== RECOVERY_SIGNATURE_ALGORITHM || !RECOVERY_KEY_ID_PATTERN.test(provenance.key_id || "")) {
    throw new Error("Production recovery report requires Ed25519 signature metadata");
  }
  const verificationKey = ed25519PublicKey(publicKey);
  if (provenance.key_id !== productionRecoverySigningKeyId(verificationKey)) {
    throw new Error("Production recovery signing key ID does not match the configured verification key");
  }
  const signature = Buffer.from(String(provenance.signature || ""), "base64");
  if (signature.length !== 64 || signature.toString("base64") !== provenance.signature) {
    throw new Error("Production recovery signature must be canonical base64 Ed25519 evidence");
  }
  if (!crypto.verify(null, recoverySigningPayload(report), verificationKey, signature)) {
    throw new Error("Production recovery report signature is invalid");
  }
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

export function assertProductionRecoveryReport(report, { publicKey = process.env.MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY } = {}) {
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
  assertProductionRecoveryProvenance(report, publicKey);

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

export function productionRecoveryFreshness(report, {
  now = Date.now(),
  publicKey = process.env.MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY,
} = {}) {
  assertProductionRecoveryReport(report, { publicKey });
  const nowMs = now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("Production recovery freshness requires a valid current timestamp");
  const generatedFreshness = evidenceFreshness("production_recovery", report.generated_at, { now: nowMs });
  if (generatedFreshness.status === "invalid") return generatedFreshness;
  return evidenceFreshness("production_recovery", productionRecoveryEvidenceAt(report), { now: nowMs });
}

export function productionRecoveryState(reportPath = DEFAULT_PRODUCTION_RECOVERY_REPORT, {
  now = Date.now(),
  publicKey = process.env.MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY,
} = {}) {
  if (!fs.existsSync(reportPath)) return { status: "missing_report", path: repoRelativePath(reportPath) };
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (report.example === true || reportPath.endsWith(".example")) {
      return { status: "example_report", path: repoRelativePath(reportPath) };
    }
    assertProductionRecoveryReport(report, { publicKey });
    const freshness = productionRecoveryFreshness(report, { now, publicKey });
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

export function writeProductionRecoveryReport(report, outPath = DEFAULT_PRODUCTION_RECOVERY_REPORT, {
  publicKey = process.env.MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY,
} = {}) {
  assertProductionRecoveryReport(report, { publicKey });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}
