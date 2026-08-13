import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertR2RecoveryManifest,
  assertRecoveryComponentMap,
  buildProductionRecoveryReport,
  buildRestoreDrillResult,
  createR2RecoveryManifest,
  mappedTableNames,
  readRecoveryComponentMap,
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
  return { componentMap, manifest, tableCounts };
}

test("committed production component map names every authority gap instead of manufacturing coverage", (t) => {
  const { componentMap, manifest } = fixture(t);
  assert.equal(assertRecoveryComponentMap(componentMap), true);
  assert.equal(assertR2RecoveryManifest(manifest), true);
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
      drill: blocked,
      reviewer: "ivan-reviewer",
      approvedAt: "2026-08-13T12:30:00.000Z",
      generatedAt: "2026-08-13T12:30:00.000Z",
    }),
    /passing isolated PostgreSQL 18/,
  );

  const mismatched = buildRestoreDrillResult({
    manifest,
    restoredTableCounts: { ...tableCounts, "public.listings": tableCounts["public.listings"] + 1 },
    restoredLatestMigration: manifest.database.latest_migration,
    completedAt: "2026-08-13T12:20:00.000Z",
    operator: "codex-operator",
    checksumVerified: true,
    cleanupVerified: true,
  });
  assert.ok(mismatched.blockers.some((blocker) => blocker.id === "row_count_mismatch:public.listings"));
});

test("fully covered restore can produce the existing redacted launch report contract", (t) => {
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
    restoredTableCounts: coveredCounts,
    restoredLatestMigration: manifest.database.latest_migration,
    completedAt: "2026-08-13T12:20:00.000Z",
    operator: "codex-operator",
    checksumVerified: true,
    cleanupVerified: true,
  });
  assert.equal(drill.status, "pass");
  const report = buildProductionRecoveryReport({
    manifest,
    drill,
    reviewer: "ivan-reviewer",
    approvedAt: "2026-08-13T12:30:00.000Z",
    generatedAt: "2026-08-13T12:30:00.000Z",
  });
  assert.equal(report.ready, true);
  assert.deepEqual(report.backup.components, ["payload_postgres", "runtime_data", "runtime_evidence"]);
  assert.doesNotMatch(JSON.stringify(report), /password|secret|token|postgres(?:ql)?:\/\//i);

  const tampered = structuredClone(drill);
  tampered.restored_table_counts["public.listings"] += 1;
  assert.throws(
    () => buildProductionRecoveryReport({
      manifest,
      drill: tampered,
      reviewer: "ivan-reviewer",
      approvedAt: "2026-08-13T12:30:00.000Z",
      generatedAt: "2026-08-13T12:30:00.000Z",
    }),
    /not bound to the manifest/,
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
