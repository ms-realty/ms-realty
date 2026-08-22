import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import {
  assertProductionRecoveryReport,
  productionRecoveryState,
  readProductionRecoveryTemplate,
  signProductionRecoveryReport,
  writeProductionRecoveryReport,
} from "../lib/production-recovery.mjs";

const RECOVERY_KEYPAIR = crypto.generateKeyPairSync("ed25519");
const RECOVERY_PUBLIC_KEY = RECOVERY_KEYPAIR.publicKey;

function signedReport(value = report()) {
  return signProductionRecoveryReport(value, { privateKey: RECOVERY_KEYPAIR.privateKey });
}

function report() {
  const ciphertextSha256 = "1".repeat(64);
  const manifestSha256 = "2".repeat(64);
  const restoreDrillSha256 = "3".repeat(64);
  const monitoringRollbackReportSha256 = "4".repeat(64);
  const releaseId = "a".repeat(40);
  return {
    schema_version: 2,
    generated_at: "2026-07-23T01:00:00.000Z",
    environment: "production",
    ready: true,
    policy: {
      provider: "eu-backup-provider",
      offsite: true,
      encrypted_at_rest: true,
      encrypted_in_transit: true,
      retention_days: 30,
      rpo_hours: 24,
      rto_hours: 8,
    },
    backup: {
      backup_id: "backup-20260722-001",
      completed_at: "2026-07-22T23:00:00.000Z",
      checksum_verified: true,
      ciphertext_sha256: ciphertextSha256,
      manifest_sha256: manifestSha256,
      monitoring_rollback_report_sha256: monitoringRollbackReportSha256,
      release_id: releaseId,
      components: ["payload_postgres", "runtime_data", "runtime_evidence"],
    },
    restore_drill: {
      drill_id: "drill-20260722-001",
      source_backup_id: "backup-20260722-001",
      completed_at: "2026-07-22T23:15:00.000Z",
      target: "isolated",
      status: "pass",
      checksum_verified: true,
      rollback_procedure_verified: true,
      ciphertext_sha256: ciphertextSha256,
      manifest_sha256: manifestSha256,
      result_sha256: restoreDrillSha256,
      monitoring_rollback_report_sha256: monitoringRollbackReportSha256,
      release_id: releaseId,
      components_verified: ["payload_postgres", "runtime_data", "runtime_evidence"],
      operator: "operations_manager",
    },
    approval: {
      status: "approved",
      approval_id: "recovery-approval-20260722-001",
      reviewer: "agency_owner",
      approved_at: "2026-07-22T23:30:00.000Z",
      artifact_sha256: "5".repeat(64),
      ciphertext_sha256: ciphertextSha256,
      manifest_sha256: manifestSha256,
      restore_drill_sha256: restoreDrillSha256,
      monitoring_rollback_report_sha256: monitoringRollbackReportSha256,
      release_id: releaseId,
    },
  };
}

function legacyHandwrittenReport() {
  return {
    schema_version: 1,
    generated_at: "2026-07-23T01:00:00.000Z",
    environment: "production",
    ready: true,
    policy: {
      provider: "Cloudflare R2 EU and Neon PostgreSQL",
      offsite: true,
      encrypted_at_rest: true,
      encrypted_in_transit: true,
      retention_days: 90,
      rpo_hours: 24,
      rto_hours: 8,
    },
    backup: {
      backup_id: "x",
      completed_at: "2026-07-22T23:00:00.000Z",
      checksum_verified: true,
      components: ["payload_postgres", "runtime_data", "runtime_evidence"],
    },
    restore_drill: {
      drill_id: "y",
      source_backup_id: "x",
      completed_at: "2026-07-22T23:15:00.000Z",
      target: "isolated",
      status: "pass",
      checksum_verified: true,
      rollback_procedure_verified: true,
      components_verified: ["payload_postgres", "runtime_data", "runtime_evidence"],
      operator: "operations_manager",
    },
    approval: { status: "approved", reviewer: "agency_owner", approved_at: "2026-07-22T23:30:00.000Z" },
  };
}

test("production recovery evidence requires encrypted off-site backup and an isolated restore drill", () => {
  assert.equal(assertProductionRecoveryReport(signedReport(), { publicKey: RECOVERY_PUBLIC_KEY }), true);
  assert.throws(
    () => signProductionRecoveryReport({ ...report(), policy: { ...report().policy, offsite: false } }, { privateKey: RECOVERY_KEYPAIR.privateKey }),
    /encrypted and off-site/,
  );
  assert.throws(
    () => signProductionRecoveryReport({ ...report(), policy: { ...report().policy, provider: "local-docker" } }, { privateKey: RECOVERY_KEYPAIR.privateKey }),
    /off-site infrastructure/,
  );
  assert.throws(
    () => signProductionRecoveryReport({ ...report(), restore_drill: { ...report().restore_drill, target: "production" } }, { privateKey: RECOVERY_KEYPAIR.privateKey }),
    /must pass in isolation/,
  );
});

test("production recovery evidence rejects secrets and copied examples", () => {
  assert.throws(() => signProductionRecoveryReport({ ...report(), token: "private" }, { privateKey: RECOVERY_KEYPAIR.privateKey }), /must not contain secrets/);
  assert.throws(() => signProductionRecoveryReport({ ...report(), access_token: "private" }, { privateKey: RECOVERY_KEYPAIR.privateKey }), /must not contain secrets/);
  assert.throws(() => signProductionRecoveryReport({ ...report(), example: true }, { privateKey: RECOVERY_KEYPAIR.privateKey }), /example cannot/);
});

test("handwritten schema-v1 x/y evidence cannot clear persisted recovery readiness", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-production-recovery-v1-poc-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const reportPath = path.join(directory, "production-recovery-report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(legacyHandwrittenReport())}\n`);

  assert.throws(() => assertProductionRecoveryReport(legacyHandwrittenReport(), { publicKey: RECOVERY_PUBLIC_KEY }), /schema v2/);
  const state = productionRecoveryState(reportPath, { now: "2026-07-23T01:00:00.000Z", publicKey: RECOVERY_PUBLIC_KEY });
  assert.equal(state.status, "invalid_report");
  assert.match(state.error, /schema v2/);
});

test("production recovery evidence links the restored backup to independent approval", () => {
  assert.throws(
    () => signProductionRecoveryReport({
      ...report(),
      restore_drill: { ...report().restore_drill, source_backup_id: "another-backup" },
    }, { privateKey: RECOVERY_KEYPAIR.privateKey }),
    /must reference the cited backup/,
  );
  assert.throws(
    () => signProductionRecoveryReport({
      ...report(),
      approval: { ...report().approval, reviewer: report().restore_drill.operator },
    }, { privateKey: RECOVERY_KEYPAIR.privateKey }),
    /reviewer must be distinct/,
  );
  assert.throws(
    () => signProductionRecoveryReport({
      ...report(),
      restore_drill: { ...report().restore_drill, completed_at: "2026-07-22T22:00:00.000Z" },
    }, { privateKey: RECOVERY_KEYPAIR.privateKey }),
    /proceed from backup to restore/,
  );
});

test("production recovery schema v2 cross-binds every persisted artifact and release identity", () => {
  for (const mutate of [
    (value) => { value.approval.ciphertext_sha256 = "6".repeat(64); },
    (value) => { value.restore_drill.manifest_sha256 = "6".repeat(64); },
    (value) => { value.backup.monitoring_rollback_report_sha256 = "6".repeat(64); },
    (value) => { value.approval.release_id = "b".repeat(40); },
    (value) => { value.approval.restore_drill_sha256 = "6".repeat(64); },
  ]) {
    const mismatched = report();
    mutate(mismatched);
    assert.throws(() => signProductionRecoveryReport(mismatched, { privateKey: RECOVERY_KEYPAIR.privateKey }), /evidence identities must match/);
  }

  assert.throws(
    () => signProductionRecoveryReport({ ...report(), approval: { ...report().approval, approval_id: "" } }, { privateKey: RECOVERY_KEYPAIR.privateKey }),
    /approval_id must be real evidence/,
  );
  assert.throws(
    () => signProductionRecoveryReport({
      ...report(),
      restore_drill: { ...report().restore_drill, result_sha256: "not-a-digest" },
    }, { privateKey: RECOVERY_KEYPAIR.privateKey }),
    /SHA-256 digest/,
  );
  assert.throws(
    () => signProductionRecoveryReport({ ...report(), backup: { ...report().backup, release_id: "x" } }, { privateKey: RECOVERY_KEYPAIR.privateKey }),
    /exact 40-character release SHA/,
  );
});

test("production recovery state accepts only a real private report", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-production-recovery-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const reportPath = path.join(directory, "production-recovery-report.json");
  const examplePath = path.join(directory, "production-recovery-report.json.example");
  fs.writeFileSync(reportPath, `${JSON.stringify(signedReport())}\n`);
  fs.writeFileSync(examplePath, `${JSON.stringify({ ...report(), example: true, ready: false })}\n`);

  assert.equal(productionRecoveryState(reportPath, { now: "2026-07-23T01:00:00.000Z", publicKey: RECOVERY_PUBLIC_KEY }).status, "pass");
  assert.equal(productionRecoveryState(examplePath).status, "example_report");
  assert.equal(productionRecoveryState(path.join(directory, "missing.json")).status, "missing_report");
});

test("production recovery state expires the oldest proof and rejects future evidence", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-production-recovery-freshness-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const reportPath = path.join(directory, "production-recovery-report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(signedReport())}\n`);

  const expired = productionRecoveryState(reportPath, { now: "2026-08-22T23:00:00.001Z", publicKey: RECOVERY_PUBLIC_KEY });
  assert.equal(expired.status, "expired_report");
  assert.equal(expired.evidence_at, "2026-07-22T23:00:00.000Z");
  assert.equal(expired.freshness.max_age_ms, 30 * 24 * 60 * 60 * 1000);

  const futureAt = "2026-07-23T01:01:00.001Z";
  const future = report();
  future.generated_at = futureAt;
  future.backup.completed_at = futureAt;
  future.restore_drill.completed_at = futureAt;
  future.approval.approved_at = futureAt;
  fs.writeFileSync(reportPath, `${JSON.stringify(signedReport(future))}\n`);
  const invalid = productionRecoveryState(reportPath, { now: "2026-07-23T01:00:00.000Z", publicKey: RECOVERY_PUBLIC_KEY });
  assert.equal(invalid.status, "invalid_report");
  assert.match(invalid.error, /future/);
});

test("production recovery import validates before persisting and exposes the safe template", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-production-recovery-import-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const reportPath = path.join(directory, "private", "production-recovery-report.json");

  assert.throws(
    () => signProductionRecoveryReport({ ...report(), ready: false }, { privateKey: RECOVERY_KEYPAIR.privateKey }),
    /ready production evidence/,
  );
  assert.equal(fs.existsSync(reportPath), false);
  assert.equal(writeProductionRecoveryReport(signedReport(), reportPath, { publicKey: RECOVERY_PUBLIC_KEY }), reportPath);
  assert.equal(productionRecoveryState(reportPath, { now: "2026-07-23T01:00:00.000Z", publicKey: RECOVERY_PUBLIC_KEY }).status, "pass");
  const template = JSON.parse(readProductionRecoveryTemplate());
  assert.equal(template.example, true);
  assert.equal(template.schema_version, 2);
});

test("unsigned, handwritten, unknown-key, and tampered schema-v2 reports cannot clear readiness", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-production-recovery-provenance-poc-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const reportPath = path.join(directory, "production-recovery-report.json");

  assert.throws(() => assertProductionRecoveryReport(report(), { publicKey: RECOVERY_PUBLIC_KEY }), /Ed25519 provenance/);
  assert.throws(() => writeProductionRecoveryReport(report(), reportPath, { publicKey: RECOVERY_PUBLIC_KEY }), /Ed25519 provenance/);
  assert.equal(fs.existsSync(reportPath), false);

  const signed = signedReport();
  const tampered = structuredClone(signed);
  tampered.backup.backup_id = "handwritten-backup-9999";
  assert.throws(() => assertProductionRecoveryReport(tampered, { publicKey: RECOVERY_PUBLIC_KEY }), /signature is invalid/);

  const otherKey = crypto.generateKeyPairSync("ed25519");
  const untrustedSignedHandwrittenReport = signProductionRecoveryReport(report(), {
    privateKey: otherKey.privateKey,
  });
  assert.throws(
    () => assertProductionRecoveryReport(untrustedSignedHandwrittenReport, { publicKey: RECOVERY_PUBLIC_KEY }),
    /key ID does not match/,
  );
});
