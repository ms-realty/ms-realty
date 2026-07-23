import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertProductionRecoveryReport,
  productionRecoveryState,
} from "../lib/production-recovery.mjs";

function report() {
  return {
    schema_version: 1,
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
      components_verified: ["payload_postgres", "runtime_data", "runtime_evidence"],
      operator: "operations_manager",
    },
    approval: { status: "approved", reviewer: "agency_owner", approved_at: "2026-07-22T23:30:00.000Z" },
  };
}

test("production recovery evidence requires encrypted off-site backup and an isolated restore drill", () => {
  assert.equal(assertProductionRecoveryReport(report()), true);
  assert.throws(
    () => assertProductionRecoveryReport({ ...report(), policy: { ...report().policy, offsite: false } }),
    /encrypted and off-site/,
  );
  assert.throws(
    () => assertProductionRecoveryReport({ ...report(), policy: { ...report().policy, provider: "local-docker" } }),
    /off-site infrastructure/,
  );
  assert.throws(
    () => assertProductionRecoveryReport({ ...report(), restore_drill: { ...report().restore_drill, target: "production" } }),
    /must pass in isolation/,
  );
});

test("production recovery evidence rejects secrets and copied examples", () => {
  assert.throws(() => assertProductionRecoveryReport({ ...report(), token: "private" }), /must not contain secrets/);
  assert.throws(() => assertProductionRecoveryReport({ ...report(), access_token: "private" }), /must not contain secrets/);
  assert.throws(() => assertProductionRecoveryReport({ ...report(), example: true }), /example cannot clear/);
});

test("production recovery evidence links the restored backup to independent approval", () => {
  assert.throws(
    () => assertProductionRecoveryReport({
      ...report(),
      restore_drill: { ...report().restore_drill, source_backup_id: "another-backup" },
    }),
    /must reference the cited backup/,
  );
  assert.throws(
    () => assertProductionRecoveryReport({
      ...report(),
      approval: { ...report().approval, reviewer: report().restore_drill.operator },
    }),
    /reviewer must be distinct/,
  );
  assert.throws(
    () => assertProductionRecoveryReport({
      ...report(),
      restore_drill: { ...report().restore_drill, completed_at: "2026-07-22T22:00:00.000Z" },
    }),
    /proceed from backup to restore/,
  );
});

test("production recovery state accepts only a real private report", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-production-recovery-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const reportPath = path.join(directory, "production-recovery-report.json");
  const examplePath = path.join(directory, "production-recovery-report.json.example");
  fs.writeFileSync(reportPath, `${JSON.stringify(report())}\n`);
  fs.writeFileSync(examplePath, `${JSON.stringify({ ...report(), example: true, ready: false })}\n`);

  assert.equal(productionRecoveryState(reportPath).status, "pass");
  assert.equal(productionRecoveryState(examplePath).status, "example_report");
  assert.equal(productionRecoveryState(path.join(directory, "missing.json")).status, "missing_report");
});
