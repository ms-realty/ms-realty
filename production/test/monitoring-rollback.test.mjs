import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertMonitoringRollbackReport,
  monitoringRollbackState,
  writeMonitoringRollbackReport,
} from "../lib/monitoring-rollback.mjs";
import { fromRoot } from "../lib/paths.mjs";

function report() {
  const releaseId = "release-20260731-001";
  return {
    schema_version: 1,
    generated_at: "2026-07-31T10:30:00.000Z",
    environment: "production",
    ready: true,
    release_id: releaseId,
    monitoring: {
      provider: "cloud-monitor",
      provider_run_id: "monitor-run-20260731-001",
      endpoints: [{ url: "https://status.ms-realty.bg/health", status: "pass", checked_at: "2026-07-31T10:25:00.000Z" }],
    },
    alert_delivery: { status: "pass", delivered_at: "2026-07-31T10:26:00.000Z" },
    rollback: {
      automatic_policy_id: "rollback-policy-prod-001",
      canary: { run_id: "canary-20260731-001", release_id: releaseId, status: "pass", checked_at: "2026-07-31T10:27:00.000Z" },
      drill: {
        drill_id: "rollback-drill-20260731-001",
        release_id: releaseId,
        status: "pass",
        target: "isolated",
        rollback_procedure_verified: true,
        verified_at: "2026-07-31T10:28:00.000Z",
      },
    },
  };
}

test("monitoring rollback state accepts a current, redacted production report", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-monitoring-rollback-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const reportPath = path.join(directory, "monitoring-rollback-report.json");

  assert.equal(assertMonitoringRollbackReport(report()), true);
  assert.equal(writeMonitoringRollbackReport(report(), reportPath), reportPath);
  assert.equal(monitoringRollbackState(reportPath, { now: "2026-07-31T11:00:00.000Z" }).status, "pass");
});

test("monitoring rollback state reports stale, invalid, and example evidence", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-monitoring-rollback-state-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const reportPath = path.join(directory, "monitoring-rollback-report.json");

  fs.writeFileSync(reportPath, `${JSON.stringify(report())}\n`);
  assert.equal(monitoringRollbackState(reportPath, { now: "2026-08-02T10:30:00.001Z" }).status, "expired");
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify({
      ...report(),
      rollback: { ...report().rollback, drill: { ...report().rollback.drill, verified_at: "2026-07-29T10:28:00.000Z" } },
    })}\n`,
  );
  assert.equal(monitoringRollbackState(reportPath, { now: "2026-07-31T11:00:00.000Z" }).status, "expired");
  fs.writeFileSync(reportPath, `${JSON.stringify({ ...report(), ready: false })}\n`);
  assert.equal(monitoringRollbackState(reportPath, { now: "2026-07-31T11:00:00.000Z" }).status, "invalid");
  fs.writeFileSync(reportPath, `${JSON.stringify({ ...report(), example: true })}\n`);
  assert.equal(monitoringRollbackState(reportPath, { now: "2026-07-31T11:00:00.000Z" }).status, "example");
});

test("monitoring rollback state keeps repository evidence paths worktree-independent", () => {
  const state = monitoringRollbackState(fromRoot("production", "data", "missing-monitoring-rollback-report.json"));
  assert.equal(state.path, "production/data/missing-monitoring-rollback-report.json");
});

test("monitoring rollback evidence rejects placeholders and secret-bearing data", () => {
  assert.throws(() => assertMonitoringRollbackReport({ ...report(), example: true }), /example cannot clear launch readiness/);
  assert.throws(() => assertMonitoringRollbackReport({ ...report(), release_id: "example-release" }), /examples or placeholders/);
  assert.throws(() => assertMonitoringRollbackReport({ ...report(), authorization: "Bearer private" }), /secret-like fields/);
  assert.throws(
    () =>
      assertMonitoringRollbackReport({
        ...report(),
        monitoring: {
          ...report().monitoring,
          endpoints: [{ ...report().monitoring.endpoints[0], url: "https://operator:private@status.ms-realty.bg/health" }],
        },
      }),
    /secrets/,
  );
  assert.throws(
    () =>
      assertMonitoringRollbackReport({
        ...report(),
        alert_delivery: { status: "pass", delivered_at: "2026-07-31T10:31:00.000Z" },
      }),
    /cannot be later than generated_at/,
  );
});
