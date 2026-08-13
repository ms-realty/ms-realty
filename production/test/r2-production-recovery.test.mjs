import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertFileSha256,
  assertRecoveryApprovalArtifact,
  assertR2RecoveryManifest,
  assertRecoveryComponentMap,
  assertRollbackDrillReceipt,
  buildR2UploadPlan,
  buildProductionRecoveryReport,
  buildRestoreDrillResult,
  componentMapDigest,
  createR2RecoveryManifest,
  mappedTableNames,
  readImmutableJson,
  readRecoveryComponentMap,
  recoveryCommandEnvironment,
  resolveRecoveryComponentMapPath,
  sha256File,
  trustedManifestDigest,
  updateR2UploadPlan,
  withPlaintextCleanup,
  writePrivateJson,
} from "../lib/r2-production-recovery.mjs";
import { fromRoot } from "../lib/paths.mjs";

const componentMapPath = fromRoot("production", "data", "production-recovery-component-map.json");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-r2-recovery-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const plaintextFile = path.join(directory, "database.dump");
  const encryptedFile = path.join(directory, "database.dump.age");
  fs.writeFileSync(plaintextFile, "postgres-custom-dump", { mode: 0o600 });
  fs.writeFileSync(encryptedFile, "age-encrypted-postgres-custom-dump", { mode: 0o600 });
  const componentMap = readRecoveryComponentMap(componentMapPath);
  const tableCounts = Object.fromEntries(mappedTableNames(componentMap).map((table, index) => [table, index + 1]));
  const manifest = createR2RecoveryManifest({
    backupId: "ms-realty-20260813t120000z-abcd1234",
    completedAt: "2026-08-13T12:00:00.000Z",
    plaintextFile,
    encryptedFile,
    componentMap,
    tableCounts,
    latestMigration: "20260811_120000_durable_listing_edit_audit",
  });
  const manifestPath = path.join(directory, "manifest.json");
  writePrivateJson(manifestPath, manifest);
  fs.chmodSync(manifestPath, 0o400);
  return { componentMap, manifest, manifestPath, manifestSha256: sha256File(manifestPath), tableCounts };
}

test("committed production component map names every authority gap instead of manufacturing coverage", (t) => {
  const { componentMap, manifest } = fixture(t);
  assert.equal(assertRecoveryComponentMap(componentMap), true);
  assert.equal(assertR2RecoveryManifest(manifest, componentMap), true);
  assert.equal(manifest.component_coverage.payload_postgres.status, "covered");
  assert.equal(manifest.component_coverage.runtime_data.status, "uncovered");
  assert.equal(manifest.component_coverage.runtime_evidence.status, "uncovered");
  assert.ok(manifest.component_coverage.runtime_data.uncovered_sources.includes("MS_REALTY_AUDIT_LOG_PATH"));
  assert.ok(manifest.component_coverage.runtime_evidence.uncovered_sources.includes("MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH"));
  assert.doesNotMatch(JSON.stringify(manifest), /postgres(?:ql)?:\/\//i);
});

test("isolated restore stays blocked until all logical components and exact counts are proven", (t) => {
  const { manifest, tableCounts } = fixture(t);
  const blocked = buildRestoreDrillResult({
    manifest,
    componentMap: readRecoveryComponentMap(componentMapPath),
    restoredTableCounts: tableCounts,
    restoredLatestMigration: manifest.database.latest_migration,
    completedAt: "2026-08-13T12:20:00.000Z",
    operator: "codex-operator",
    checksumVerified: true,
    cleanupVerified: true,
  });
  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.uncovered_components, ["runtime_data", "runtime_evidence"]);
  assert.throws(
    () => buildProductionRecoveryReport({
      manifest,
      componentMap: readRecoveryComponentMap(componentMapPath),
      drill: blocked,
      approval: {},
      approvalArtifactSha256: "a".repeat(64),
      generatedAt: "2026-08-13T12:30:00.000Z",
    }),
    /passing isolated PostgreSQL 18/,
  );

  const mismatched = buildRestoreDrillResult({
    manifest,
    componentMap: readRecoveryComponentMap(componentMapPath),
    restoredTableCounts: { ...tableCounts, "public.listings": tableCounts["public.listings"] + 1 },
    restoredLatestMigration: manifest.database.latest_migration,
    completedAt: "2026-08-13T12:20:00.000Z",
    operator: "codex-operator",
    checksumVerified: true,
    cleanupVerified: true,
  });
  assert.ok(mismatched.blockers.some((blocker) => blocker.id === "row_count_mismatch:public.listings"));
});

test("fully covered restore requires real rollback and immutable human approval receipts", (t) => {
  const { componentMap, tableCounts, manifest: blockedManifest } = fixture(t);
  const coveredMap = structuredClone(componentMap);
  for (const component of Object.values(coveredMap.components)) component.uncovered_sources = [];
  coveredMap.components.runtime_evidence.tables.push({
    name: "public.realty_case_evidence",
    sources: ["synthetic covered evidence fixture"],
  });
  const coveredCounts = { ...tableCounts, "public.realty_case_evidence": 4 };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-r2-covered-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const plaintextFile = path.join(directory, "database.dump");
  const encryptedFile = path.join(directory, "database.dump.age");
  fs.writeFileSync(plaintextFile, "postgres-custom-dump", { mode: 0o600 });
  fs.writeFileSync(encryptedFile, "age-encrypted-postgres-custom-dump", { mode: 0o600 });
  const manifest = createR2RecoveryManifest({
    backupId: blockedManifest.backup_id,
    completedAt: blockedManifest.completed_at,
    plaintextFile,
    encryptedFile,
    componentMap: coveredMap,
    tableCounts: coveredCounts,
    latestMigration: blockedManifest.database.latest_migration,
  });
  const drill = buildRestoreDrillResult({
    manifest,
    componentMap: coveredMap,
    restoredTableCounts: coveredCounts,
    restoredLatestMigration: manifest.database.latest_migration,
    completedAt: "2026-08-13T12:20:00.000Z",
    operator: "codex-operator",
    checksumVerified: true,
    cleanupVerified: true,
  });
  assert.equal(drill.status, "blocked");
  assert.equal(drill.rollback_procedure_verified, false);
  assert.ok(drill.blockers.some((blocker) => blocker.id === "rollback_drill_receipt_missing"));

  const manifestPath = path.join(directory, "manifest.json");
  writePrivateJson(manifestPath, manifest);
  const manifestSha256 = sha256File(manifestPath);
  const rollbackReceipt = {
    schema_version: 1,
    environment: "production",
    status: "pass",
    receipt_id: "rollback-ms-realty-20260813-001",
    backup_id: manifest.backup_id,
    manifest_sha256: manifestSha256,
    executed_at: "2026-08-13T12:15:00.000Z",
    operator: "release-operator",
    from_release: "release-before",
    to_release: "release-rollback-target",
    exact_release_verified: true,
    post_rollback_health_verified: true,
    post_rollback_admin_journey_verified: true,
  };
  assert.equal(assertRollbackDrillReceipt(rollbackReceipt, { manifest, manifestSha256 }), true);
  const passingDrill = buildRestoreDrillResult({
    manifest,
    componentMap: coveredMap,
    restoredTableCounts: coveredCounts,
    restoredLatestMigration: manifest.database.latest_migration,
    completedAt: "2026-08-13T12:20:00.000Z",
    operator: "codex-operator",
    checksumVerified: true,
    cleanupVerified: true,
    rollbackReceipt,
    rollbackReceiptSha256: "c".repeat(64),
    manifestSha256,
  });
  assert.equal(passingDrill.status, "pass");
  const drillPath = path.join(directory, "restore-drill-result.json");
  writePrivateJson(drillPath, passingDrill);
  const restoreDrillSha256 = sha256File(drillPath);
  const approval = {
    schema_version: 1,
    environment: "production",
    decision: "approved",
    approval_id: "recovery-approval-20260813-001",
    backup_id: manifest.backup_id,
    ciphertext_sha256: manifest.artifact.sha256,
    manifest_sha256: manifestSha256,
    restore_drill_sha256: restoreDrillSha256,
    rollback_receipt_sha256: "c".repeat(64),
    operator: passingDrill.operator,
    reviewer: "ivan-reviewer",
    approved_at: "2026-08-13T12:30:00.000Z",
    manifest_reviewed: true,
    restore_drill_reviewed: true,
    rollback_receipt_reviewed: true,
  };
  const approvalPath = path.join(directory, "approval.json");
  writePrivateJson(approvalPath, approval);
  fs.chmodSync(approvalPath, 0o400);
  const immutableApproval = readImmutableJson(approvalPath, "Recovery approval");
  const approvalArtifactSha256 = sha256File(approvalPath);
  assert.equal(assertRecoveryApprovalArtifact(immutableApproval, {
    manifest,
    drill: passingDrill,
    manifestSha256,
    restoreDrillSha256,
  }), true);
  const report = buildProductionRecoveryReport({
    manifest,
    componentMap: coveredMap,
    drill: passingDrill,
    rollbackReceipt,
    rollbackReceiptSha256: "c".repeat(64),
    approval: immutableApproval,
    manifestSha256,
    restoreDrillSha256,
    approvalArtifactSha256,
    generatedAt: "2026-08-13T12:30:00.000Z",
  });
  assert.equal(report.ready, true);
  assert.deepEqual(report.backup.components, ["payload_postgres", "runtime_data", "runtime_evidence"]);
  assert.doesNotMatch(JSON.stringify(report), /password|secret|token|postgres(?:ql)?:\/\//i);

  const tampered = structuredClone(passingDrill);
  tampered.restored_table_counts["public.listings"] += 1;
  assert.throws(
    () => buildProductionRecoveryReport({
      manifest,
      componentMap: coveredMap,
      drill: tampered,
      rollbackReceipt,
      rollbackReceiptSha256: "c".repeat(64),
      approval: immutableApproval,
      manifestSha256,
      restoreDrillSha256,
      approvalArtifactSha256,
      generatedAt: "2026-08-13T12:30:00.000Z",
    }),
    /not bound to the manifest/,
  );
});

test("downloaded manifests cannot define their own proof requirements", (t) => {
  const { componentMap, manifest } = fixture(t);
  const forged = structuredClone(manifest);
  forged.database.table_counts = {};
  forged.component_coverage = Object.fromEntries(
    ["payload_postgres", "runtime_data", "runtime_evidence"].map((component) => [component, {
      status: "covered",
      mapped_tables: {},
      mapped_sources: {},
      uncovered_sources: [],
    }]),
  );
  assert.throws(() => assertR2RecoveryManifest(forged, componentMap), /trusted component map|table set|coverage/i);

  const changedMap = structuredClone(componentMap);
  changedMap.components.payload_postgres.tables[0].sources = ["tampered source claim"];
  assert.notEqual(componentMapDigest(changedMap), manifest.component_map_sha256);
  assert.throws(() => assertR2RecoveryManifest(manifest, changedMap), /component map digest/i);
});

test("production component map overrides are rejected outside explicit test mode", () => {
  assert.equal(resolveRecoveryComponentMapPath({}, componentMapPath), componentMapPath);
  assert.throws(
    () => resolveRecoveryComponentMapPath({ MS_REALTY_RECOVERY_COMPONENT_MAP_PATH: "/tmp/map.json" }, componentMapPath),
    /test-only/i,
  );
  assert.equal(
    resolveRecoveryComponentMapPath({
      NODE_ENV: "test",
      MS_REALTY_RECOVERY_ALLOW_TEST_COMPONENT_MAP_OVERRIDE: "true",
      MS_REALTY_RECOVERY_COMPONENT_MAP_PATH: "/tmp/map.json",
    }, componentMapPath),
    "/tmp/map.json",
  );
});

test("recovery subprocesses receive operational environment only, not application credentials", () => {
  const childEnv = recoveryCommandEnvironment({
    PATH: "/usr/bin",
    HOME: "/tmp/operator",
    DOCKER_CONTEXT: "desktop-linux",
    DATABASE_URL_DIRECT: "postgresql://user:password@example.invalid/db",
    AWS_SECRET_ACCESS_KEY: "secret",
    MS_REALTY_RECOVERY_AGE_IDENTITY_FILE: "/tmp/identity",
  });
  assert.deepEqual(childEnv, {
    PATH: "/usr/bin",
    HOME: "/tmp/operator",
    DOCKER_CONTEXT: "desktop-linux",
  });
});

test("plaintext is removed when an injected post-decryption check fails", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-r2-plaintext-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const plaintextFile = path.join(directory, "neon-postgres.restore.dump");
  await assert.rejects(
    () => withPlaintextCleanup(plaintextFile, async () => {
      fs.writeFileSync(plaintextFile, "full-production-dump", { mode: 0o600 });
      throw new Error("injected checksum failure");
    }),
    /injected checksum failure/,
  );
  assert.equal(fs.existsSync(plaintextFile), false);
});

test("immutable receipts are regular read-only files", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-r2-receipt-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const receiptPath = path.join(directory, "approval.json");
  fs.writeFileSync(receiptPath, '{"decision":"approved"}\n', { mode: 0o600 });
  assert.throws(() => readImmutableJson(receiptPath, "Recovery approval"), /read-only/i);
  fs.chmodSync(receiptPath, 0o400);
  assert.deepEqual(readImmutableJson(receiptPath, "Recovery approval"), { decision: "approved" });
});

test("restore manifest authenticity is anchored to a read-only local manifest digest", (t) => {
  const { manifest, manifestPath, manifestSha256 } = fixture(t);
  assert.equal(trustedManifestDigest({
    localManifestPath: manifestPath,
    backupId: manifest.backup_id,
  }), manifestSha256);

  const downloadedPath = path.join(path.dirname(manifestPath), "manifest.downloaded.json");
  fs.writeFileSync(downloadedPath, `${JSON.stringify({ ...manifest, completed_at: "2026-08-13T12:01:00.000Z" })}\n`, { mode: 0o600 });
  assert.throws(
    () => assertFileSha256(downloadedPath, manifestSha256, "Downloaded R2 manifest"),
    /does not match trusted evidence/i,
  );
});

test("approval is bound to exact evidence and distinct case-insensitive identities", (t) => {
  const { componentMap, manifest, tableCounts } = fixture(t);
  const coveredMap = structuredClone(componentMap);
  for (const component of Object.values(coveredMap.components)) component.uncovered_sources = [];
  coveredMap.components.runtime_evidence.tables.push({ name: "public.realty_case_evidence", sources: ["runtime evidence"] });
  const coveredCounts = { ...tableCounts, "public.realty_case_evidence": 1 };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-r2-approval-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const plaintextFile = path.join(directory, "dump");
  const encryptedFile = path.join(directory, "dump.age");
  fs.writeFileSync(plaintextFile, "dump", { mode: 0o600 });
  fs.writeFileSync(encryptedFile, "encrypted", { mode: 0o600 });
  const coveredManifest = createR2RecoveryManifest({
    backupId: manifest.backup_id,
    completedAt: manifest.completed_at,
    plaintextFile,
    encryptedFile,
    componentMap: coveredMap,
    tableCounts: coveredCounts,
    latestMigration: manifest.database.latest_migration,
  });
  const manifestPath = path.join(directory, "manifest.json");
  writePrivateJson(manifestPath, coveredManifest);
  const manifestSha256 = sha256File(manifestPath);
  const rollbackReceipt = {
    schema_version: 1, environment: "production", status: "pass", receipt_id: "rollback-approval-test",
    backup_id: coveredManifest.backup_id, manifest_sha256: manifestSha256,
    executed_at: "2026-08-13T12:15:00.000Z", operator: "release-operator",
    from_release: "release-before", to_release: "release-after", exact_release_verified: true,
    post_rollback_health_verified: true, post_rollback_admin_journey_verified: true,
  };
  const drill = buildRestoreDrillResult({
    manifest: coveredManifest, componentMap: coveredMap, restoredTableCounts: coveredCounts,
    restoredLatestMigration: coveredManifest.database.latest_migration, completedAt: "2026-08-13T12:20:00.000Z",
    operator: "Restore Operator", checksumVerified: true, cleanupVerified: true,
    rollbackReceipt, rollbackReceiptSha256: "d".repeat(64), manifestSha256,
  });
  const drillPath = path.join(directory, "drill.json");
  writePrivateJson(drillPath, drill);
  const restoreDrillSha256 = sha256File(drillPath);
  const approval = {
    schema_version: 1, environment: "production", decision: "approved", approval_id: "recovery-approval-test",
    backup_id: coveredManifest.backup_id, ciphertext_sha256: coveredManifest.artifact.sha256,
    manifest_sha256: manifestSha256, restore_drill_sha256: restoreDrillSha256,
    rollback_receipt_sha256: "d".repeat(64),
    operator: "restore operator", reviewer: "RESTORE OPERATOR", approved_at: "2026-08-13T12:30:00.000Z",
    manifest_reviewed: true, restore_drill_reviewed: true, rollback_receipt_reviewed: true,
  };
  assert.throws(() => assertRecoveryApprovalArtifact(approval, {
    manifest: coveredManifest, drill, manifestSha256, restoreDrillSha256,
  }), /distinct/i);
  approval.reviewer = "human-reviewer";
  approval.manifest_sha256 = "0".repeat(64);
  assert.throws(() => assertRecoveryApprovalArtifact(approval, {
    manifest: coveredManifest, drill, manifestSha256, restoreDrillSha256,
  }), /manifest digest/i);
  approval.manifest_sha256 = manifestSha256;
  approval.reviewer = rollbackReceipt.operator.toUpperCase();
  assert.throws(() => assertRecoveryApprovalArtifact(approval, {
    manifest: coveredManifest, drill, manifestSha256, restoreDrillSha256,
  }), /distinct from the rollback operator/i);
});

test("R2 upload plan uses an immutable staged object and a final manifest commit marker", (t) => {
  const { componentMap, manifest } = fixture(t);
  assert.equal(assertR2RecoveryManifest(manifest, componentMap), true);
  const plan = buildR2UploadPlan(manifest);
  assert.match(plan.staged_object_key, /\/staged\/neon-postgres\.dump\.age$/);
  assert.equal(plan.commit_marker_key, manifest.manifest_object_key);
  assert.equal(plan.cleanup.destructive_delete, false);
  assert.equal(plan.cleanup.strategy, "object-lock-retention-lifecycle");

  const attempted = updateR2UploadPlan(plan, { event: "attempted", objectKey: plan.staged_object_key });
  const uploaded = updateR2UploadPlan(attempted, { event: "uploaded", objectKey: plan.staged_object_key });
  const partial = updateR2UploadPlan(uploaded, {
    event: "partial",
    at: "2026-08-13T12:10:00.000Z",
    error: "manifest upload failed",
  });
  assert.equal(partial.status, "partial");
  assert.deepEqual(partial.uploaded_object_keys, [plan.staged_object_key]);
  assert.equal(partial.cleanup.destructive_delete, false);
  assert.throws(
    () => updateR2UploadPlan(uploaded, { event: "committed", at: "2026-08-13T12:10:00.000Z" }),
    /both staged ciphertext and manifest/i,
  );
});

test("operator commands require their exact approval flags before reading credentials", () => {
  const script = fromRoot("production", "scripts", "r2-production-recovery.mjs");
  const backup = spawnSync(process.execPath, [script, "backup"], { encoding: "utf8", env: {} });
  assert.equal(backup.status, 1);
  assert.match(backup.stderr, /confirm-upload-encrypted-production-backup/);

  const restore = spawnSync(process.execPath, [script, "restore", "ms-realty-20260813t120000z-abcd1234"], {
    encoding: "utf8",
    env: {},
  });
  assert.equal(restore.status, 1);
  assert.match(restore.stderr, /confirm-isolated-restore-drill/);
});
