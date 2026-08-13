import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertFileSha256,
  assertRecoveryApprovalArtifact,
  assertRecoveryMonitoringRollbackEvidence,
  assertR2RecoveryManifest,
  assertRecoveryComponentMap,
  buildR2UploadPlan,
  buildProductionRecoveryReport,
  buildRestoreDrillResult,
  buildRuntimeAuthorityEvidence,
  componentCoverage,
  componentMapDigest,
  createR2RecoveryManifest,
  mappedTableNames,
  readImmutableJson,
  readRecoveryComponentMap,
  recoveryCommandEnvironment,
  sha256File,
  trustedManifestDigest,
  updateR2UploadPlan,
  withPlaintextCleanup,
  writePrivateJson,
} from "../lib/r2-production-recovery.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { DURABLE_CASE_AUTHORITY_PATHS, DURABLE_LISTING_AUTHORITY_PATHS } from "../../workers/durable-case-authority.mjs";

const componentMapPath = fromRoot("production", "data", "production-recovery-component-map.json");
const RECOVERY_KEYPAIR = crypto.generateKeyPairSync("ed25519");
const RECOVERY_RELEASE_ID = "a".repeat(40);

function machineRollbackReport(releaseId = RECOVERY_RELEASE_ID) {
  const correlationId = "ms-realty/ms-realty:monitoring-drill:31485358241:1";
  const runUrl = "https://github.com/ms-realty/ms-realty/actions/runs/31485358241/attempts/1";
  const worker = "msr-monitoring-drill-31485358241-1";
  const workerUrl = `https://${worker}.ms-realty-bg.workers.dev`;
  const baselineVersion = "11111111-1111-4111-8111-111111111111";
  return {
    schema_version: 2,
    generated_at: "2026-08-13T12:15:00.000Z",
    environment: "production",
    ready: true,
    release_id: releaseId,
    monitoring: {
      provider: "github-actions-cloudflare-workers",
      provider_run_id: "31485358241",
      provider_run_attempt: "1",
      repository: "ms-realty/ms-realty",
      workflow_ref: "ms-realty/ms-realty/.github/workflows/monitoring-drill.yml@refs/heads/main",
      run_url: runUrl,
      correlation_id: correlationId,
      machine_artifact_name: "monitoring-drill-machine-evidence-31485358241-1",
      endpoints: [{
        url: "https://ms-realty.ms-realty-bg.workers.dev/api/health",
        status: "pass",
        checked_at: "2026-08-13T12:10:00.000Z",
        build_marker: releaseId,
        probe: "production/scripts/probe-production-journeys.mjs",
      }],
    },
    alert_delivery: {
      status: "pass",
      provider: "github-actions-email",
      receipt_id: "message-id-31485358241-1",
      correlation_id: correlationId,
      provider_run_id: "31485358241",
      provider_run_attempt: "1",
      repository: "ms-realty/ms-realty",
      run_url: runUrl,
      triggered_at: "2026-08-13T12:10:30.000Z",
      delivered_at: "2026-08-13T12:11:00.000Z",
    },
    rollback: {
      automatic_policy_id: "github-actions-ci-failed-health-rollback",
      canary: {
        run_id: `${worker}:${baselineVersion}`,
        release_id: releaseId,
        worker,
        url: workerUrl,
        version_id: baselineVersion,
        build_marker: releaseId,
        probe: "production/scripts/probe-production-journeys.mjs",
        status: "pass",
        checked_at: "2026-08-13T12:12:00.000Z",
      },
      drill: {
        drill_id: correlationId,
        release_id: releaseId,
        worker,
        url: workerUrl,
        baseline_version_id: baselineVersion,
        fault_version_id: "22222222-2222-4222-8222-222222222222",
        restored_version_id: baselineVersion,
        restored_build_marker: releaseId,
        failure_surface: "production_journey_probe",
        probe: "production/scripts/probe-production-journeys.mjs",
        status: "pass",
        target: "isolated",
        rollback_procedure_verified: true,
        verified_at: "2026-08-13T12:13:00.000Z",
      },
    },
  };
}

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
    releaseId: RECOVERY_RELEASE_ID,
    completedAt: "2026-08-13T12:00:00.000Z",
    plaintextFile,
    encryptedFile,
    componentMap,
    tableCounts,
    latestMigration: "20260811_120000_durable_listing_edit_audit",
    runtimeAuthorityEvidence: buildRuntimeAuthorityEvidence({ releaseId: RECOVERY_RELEASE_ID }),
  });
  const manifestPath = path.join(directory, "manifest.json");
  writePrivateJson(manifestPath, manifest);
  fs.chmodSync(manifestPath, 0o400);
  return { componentMap, manifest, manifestPath, manifestSha256: sha256File(manifestPath), tableCounts };
}

test("committed production component map covers runtime_data without manufacturing runtime authorities", (t) => {
  const { componentMap, manifest } = fixture(t);
  assert.equal(assertRecoveryComponentMap(componentMap), true);
  assert.equal(assertR2RecoveryManifest(manifest, componentMap), true);
  assert.equal(manifest.component_coverage.payload_postgres.status, "covered");
  assert.equal(manifest.component_coverage.runtime_data.status, "covered");
  assert.equal(manifest.component_coverage.runtime_evidence.status, "uncovered");
  assert.deepEqual(manifest.component_coverage.runtime_data.uncovered_sources, []);
  assert.ok("public.consent_events" in manifest.component_coverage.runtime_data.mapped_tables);
  assert.ok("public.seller_pipeline_events" in manifest.component_coverage.runtime_data.mapped_tables);
  assert.ok(manifest.component_coverage.runtime_evidence.uncovered_sources.includes("MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH"));
  assert.doesNotMatch(JSON.stringify(manifest), /postgres(?:ql)?:\/\//i);
});

test("runtime_data coverage is bound to the exact Worker authority gate and admitted Neon tables", (t) => {
  const { componentMap, manifest, tableCounts } = fixture(t);
  const withoutProof = componentCoverage(componentMap, tableCounts);
  assert.equal(withoutProof.runtime_data.status, "uncovered");
  assert.match(withoutProof.runtime_data.uncovered_sources[0], /release-bound Cloudflare Payload runtime authority proof/);

  const authorities = new Map(componentMap.components.runtime_data.authority_gate.authorities.map((row) => [row.id, row]));
  assert.deepEqual(authorities.get("listing_authority").routes.slice(0, 2), [...DURABLE_LISTING_AUTHORITY_PATHS]);
  assert.deepEqual(authorities.get("realty_case_authority").routes, [...DURABLE_CASE_AUTHORITY_PATHS]);
  assert.equal(manifest.runtime_authority.required_value, "payload");
  assert.equal(manifest.runtime_authority.release_id, manifest.release_id);

  const forged = structuredClone(manifest);
  forged.runtime_authority.worker_source_sha256 = "0".repeat(64);
  assert.throws(
    () => assertR2RecoveryManifest(forged, componentMap),
    /release-bound Cloudflare Payload runtime authority proof/,
  );

  const incomplete = structuredClone(componentMap);
  incomplete.components.runtime_data.authority_gate.authorities.find((row) => row.id === "listing_authority").tables.pop();
  assert.throws(() => assertRecoveryComponentMap(incomplete), /incomplete listing_authority route\/table authority/);
  assert.throws(
    () => buildRuntimeAuthorityEvidence({ releaseId: RECOVERY_RELEASE_ID, workerSource: "export default {};" }),
    /must set MS_REALTY_RUNTIME_DATA_AUTHORITY=payload/,
  );
});

test("runtime_data recovery cannot claim coverage without durable consent and seller event tables", (t) => {
  const { componentMap, plaintextFile, encryptedFile } = (() => {
    const data = fixture(t);
    const directory = path.dirname(data.manifestPath);
    return {
      ...data,
      plaintextFile: path.join(directory, "database.dump"),
      encryptedFile: path.join(directory, "database.dump.age"),
    };
  })();

  for (const table of ["public.consent_events", "public.seller_pipeline_events"]) {
    const incomplete = structuredClone(componentMap);
    incomplete.components.runtime_data.tables = incomplete.components.runtime_data.tables.filter(
      (mapping) => mapping.name !== table,
    );
    assert.throws(() => assertRecoveryComponentMap(incomplete), new RegExp(`missing required durable table ${table.replace(".", "\\.")}`));
    assert.throws(
      () => createR2RecoveryManifest({
        backupId: "ms-realty-20260813t120000z-abcd1234",
        releaseId: RECOVERY_RELEASE_ID,
        completedAt: "2026-08-13T12:00:00.000Z",
        plaintextFile,
        encryptedFile,
        componentMap: incomplete,
        tableCounts: {},
        latestMigration: "20260811_120000_durable_listing_edit_audit",
      }),
      new RegExp(`missing required durable table ${table.replace(".", "\\.")}`),
    );
  }
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
  assert.deepEqual(blocked.uncovered_components, ["runtime_evidence"]);
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

test("fully covered restore requires machine rollback evidence and immutable human approval", (t) => {
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
    releaseId: blockedManifest.release_id,
    completedAt: blockedManifest.completed_at,
    plaintextFile,
    encryptedFile,
    componentMap: coveredMap,
    tableCounts: coveredCounts,
    latestMigration: blockedManifest.database.latest_migration,
    runtimeAuthorityEvidence: buildRuntimeAuthorityEvidence({ releaseId: blockedManifest.release_id }),
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
  assert.ok(drill.blockers.some((blocker) => blocker.id === "monitoring_rollback_report_missing"));

  const manifestPath = path.join(directory, "manifest.json");
  writePrivateJson(manifestPath, manifest);
  const manifestSha256 = sha256File(manifestPath);
  const monitoringRollbackReport = machineRollbackReport();
  const monitoringRollbackReportPath = path.join(directory, "monitoring-rollback-report.json");
  writePrivateJson(monitoringRollbackReportPath, monitoringRollbackReport);
  fs.chmodSync(monitoringRollbackReportPath, 0o400);
  const monitoringRollbackReportSha256 = sha256File(monitoringRollbackReportPath);
  assert.equal(assertRecoveryMonitoringRollbackEvidence(monitoringRollbackReport, {
    manifest,
    completedAt: "2026-08-13T12:20:00.000Z",
  }), true);
  const preBackupRollback = structuredClone(monitoringRollbackReport);
  preBackupRollback.rollback.drill.verified_at = "2026-08-13T11:59:00.000Z";
  assert.throws(
    () => assertRecoveryMonitoringRollbackEvidence(preBackupRollback, {
      manifest,
      completedAt: "2026-08-13T12:20:00.000Z",
    }),
    /must follow the bound backup/i,
  );
  const passingDrill = buildRestoreDrillResult({
    manifest,
    componentMap: coveredMap,
    restoredTableCounts: coveredCounts,
    restoredLatestMigration: manifest.database.latest_migration,
    completedAt: "2026-08-13T12:20:00.000Z",
    operator: "codex-operator",
    checksumVerified: true,
    cleanupVerified: true,
    monitoringRollbackReport,
    monitoringRollbackReportSha256,
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
    release_id: monitoringRollbackReport.release_id,
    monitoring_rollback_report_sha256: monitoringRollbackReportSha256,
    operator: passingDrill.operator,
    reviewer: "ivan-reviewer",
    approved_at: "2026-08-13T12:30:00.000Z",
    manifest_reviewed: true,
    restore_drill_reviewed: true,
    monitoring_rollback_report_reviewed: true,
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
    monitoringRollbackReport,
    monitoringRollbackReportSha256,
    approval: immutableApproval,
    manifestSha256,
    restoreDrillSha256,
    approvalArtifactSha256,
    signingPrivateKey: RECOVERY_KEYPAIR.privateKey,
    generatedAt: "2026-08-13T12:30:00.000Z",
  });
  assert.equal(report.ready, true);
  assert.equal(report.schema_version, 2);
  assert.deepEqual(report.backup.components, ["payload_postgres", "runtime_data", "runtime_evidence"]);
  assert.equal(report.backup.ciphertext_sha256, manifest.artifact.sha256);
  assert.equal(report.backup.manifest_sha256, report.restore_drill.manifest_sha256);
  assert.equal(report.backup.manifest_sha256, report.approval.manifest_sha256);
  assert.equal(report.backup.monitoring_rollback_report_sha256, report.restore_drill.monitoring_rollback_report_sha256);
  assert.equal(report.backup.monitoring_rollback_report_sha256, report.approval.monitoring_rollback_report_sha256);
  assert.equal(report.backup.release_id, report.restore_drill.release_id);
  assert.equal(report.backup.release_id, report.approval.release_id);
  assert.equal(report.restore_drill.result_sha256, report.approval.restore_drill_sha256);
  assert.equal(report.approval.artifact_sha256, approvalArtifactSha256);
  assert.equal(report.provenance.algorithm, "Ed25519");
  assert.match(report.provenance.key_id, /^ed25519-sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(report), /password|secret|token|postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE KEY/);

  const tampered = structuredClone(passingDrill);
  tampered.restored_table_counts["public.listings"] += 1;
  assert.throws(
    () => buildProductionRecoveryReport({
      manifest,
      componentMap: coveredMap,
      drill: tampered,
      monitoringRollbackReport,
      monitoringRollbackReportSha256,
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

test("production recovery exposes no environment component-map override", () => {
  const script = fs.readFileSync(fromRoot("production", "scripts", "r2-production-recovery.mjs"), "utf8");
  const library = fs.readFileSync(fromRoot("production", "lib", "r2-production-recovery.mjs"), "utf8");
  assert.doesNotMatch(
    `${script}\n${library}`,
    /MS_REALTY_RECOVERY_(?:ALLOW_TEST_)?COMPONENT_MAP_PATH/,
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

test("a local manifest anchor cannot cross-bind a different requested backup", (t) => {
  const { componentMap, manifest, manifestPath } = fixture(t);
  const requestedBackupId = "ms-realty-20260813t120000z-other123";
  assert.throws(
    () => trustedManifestDigest({
      localManifestPath: manifestPath,
      backupId: requestedBackupId,
    }),
    new RegExp(`backup_id.*${manifest.backup_id}|does not match`, "i"),
  );
  assert.throws(
    () => assertR2RecoveryManifest(manifest, componentMap, requestedBackupId),
    /backup_id does not match the requested backup/i,
  );

  const wrongPrefix = structuredClone(manifest);
  wrongPrefix.artifact.object_key = `backups/${requestedBackupId}/staged/neon-postgres.dump.age`;
  assert.throws(() => assertR2RecoveryManifest(wrongPrefix, componentMap), /object keys do not match backup_id/i);
});

test("symbolic x/y rollback assertions cannot satisfy recovery evidence", () => {
  assert.throws(
    () => assertRecoveryMonitoringRollbackEvidence({
      schema_version: 1,
      environment: "production",
      status: "pass",
      receipt_id: "rollback-review-poc",
      backup_id: "ms-realty-20260813t120000z-abcd1234",
      manifest_sha256: "a".repeat(64),
      executed_at: "2026-08-13T12:15:00.000Z",
      operator: "release-operator",
      from_release: "x",
      to_release: "y",
      exact_release_verified: true,
      post_rollback_health_verified: true,
      post_rollback_admin_journey_verified: true,
    }, {
      manifest: {
        backup_id: "ms-realty-20260813t120000z-abcd1234",
        completed_at: "2026-08-13T12:00:00.000Z",
      },
      completedAt: "2026-08-13T12:20:00.000Z",
    }),
    /schema v2|monitoring rollback/i,
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
    releaseId: manifest.release_id,
    completedAt: manifest.completed_at,
    plaintextFile,
    encryptedFile,
    componentMap: coveredMap,
    tableCounts: coveredCounts,
    latestMigration: manifest.database.latest_migration,
    runtimeAuthorityEvidence: buildRuntimeAuthorityEvidence({ releaseId: manifest.release_id }),
  });
  const manifestPath = path.join(directory, "manifest.json");
  writePrivateJson(manifestPath, coveredManifest);
  const manifestSha256 = sha256File(manifestPath);
  const monitoringRollbackReport = machineRollbackReport();
  const monitoringRollbackReportPath = path.join(directory, "monitoring-rollback-report.json");
  writePrivateJson(monitoringRollbackReportPath, monitoringRollbackReport);
  const monitoringRollbackReportSha256 = sha256File(monitoringRollbackReportPath);
  const drill = buildRestoreDrillResult({
    manifest: coveredManifest, componentMap: coveredMap, restoredTableCounts: coveredCounts,
    restoredLatestMigration: coveredManifest.database.latest_migration, completedAt: "2026-08-13T12:20:00.000Z",
    operator: "Restore Operator", checksumVerified: true, cleanupVerified: true,
    monitoringRollbackReport, monitoringRollbackReportSha256, manifestSha256,
  });
  const drillPath = path.join(directory, "drill.json");
  writePrivateJson(drillPath, drill);
  const restoreDrillSha256 = sha256File(drillPath);
  const approval = {
    schema_version: 1, environment: "production", decision: "approved", approval_id: "recovery-approval-test",
    backup_id: coveredManifest.backup_id, ciphertext_sha256: coveredManifest.artifact.sha256,
    manifest_sha256: manifestSha256, restore_drill_sha256: restoreDrillSha256,
    release_id: monitoringRollbackReport.release_id,
    monitoring_rollback_report_sha256: monitoringRollbackReportSha256,
    operator: "restore operator", reviewer: "RESTORE OPERATOR", approved_at: "2026-08-13T12:30:00.000Z",
    manifest_reviewed: true, restore_drill_reviewed: true, monitoring_rollback_report_reviewed: true,
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
  approval.reviewer = "human-reviewer";
  approval.release_id = "b".repeat(40);
  assert.throws(() => assertRecoveryApprovalArtifact(approval, {
    manifest: coveredManifest, drill, manifestSha256, restoreDrillSha256,
  }), /release_id.*backup manifest/i);
});

test("backup release identity cannot be relabeled by later monitoring or approval", (t) => {
  const { componentMap, manifest, tableCounts } = fixture(t);
  const releaseB = "b".repeat(40);
  assert.throws(
    () => buildRestoreDrillResult({
      manifest,
      componentMap,
      restoredTableCounts: tableCounts,
      restoredLatestMigration: manifest.database.latest_migration,
      completedAt: "2026-08-13T12:20:00.000Z",
      operator: "codex-operator",
      checksumVerified: true,
      cleanupVerified: true,
      monitoringRollbackReport: machineRollbackReport(releaseB),
      monitoringRollbackReportSha256: "4".repeat(64),
      manifestSha256: "2".repeat(64),
    }),
    /release_id does not match the backup manifest/i,
  );

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-r2-release-binding-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const plaintextFile = path.join(directory, "dump");
  const encryptedFile = path.join(directory, "dump.age");
  fs.writeFileSync(plaintextFile, "dump", { mode: 0o600 });
  fs.writeFileSync(encryptedFile, "encrypted", { mode: 0o600 });
  assert.throws(
    () => createR2RecoveryManifest({
      backupId: manifest.backup_id,
      releaseId: "release-a",
      completedAt: manifest.completed_at,
      plaintextFile,
      encryptedFile,
      componentMap,
      tableCounts,
      latestMigration: manifest.database.latest_migration,
    }),
    /exact lowercase 40-character release SHA/i,
  );
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
