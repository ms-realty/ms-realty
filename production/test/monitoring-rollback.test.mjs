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
  const releaseId = "a".repeat(40);
  const correlationId = "ms-realty/ms-realty:monitoring-drill:31485358241:1";
  const runUrl = "https://github.com/ms-realty/ms-realty/actions/runs/31485358241/attempts/1";
  const worker = "msr-monitoring-drill-31485358241-1";
  const workerUrl = `https://${worker}.ms-realty-bg.workers.dev`;
  const baselineVersion = "11111111-1111-4111-8111-111111111111";
  return {
    schema_version: 2,
    generated_at: "2026-07-31T10:30:00.000Z",
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
      endpoints: [
        {
          url: "https://status.ms-realty.bg/health",
          status: "pass",
          checked_at: "2026-07-31T10:25:00.000Z",
          build_marker: releaseId,
          probe: "production/scripts/probe-production-journeys.mjs",
        },
      ],
    },
    dispatch_confirmation: {
      mechanism: "workflow_dispatch_typed_confirmation",
      actor: "ivan-peychev",
      triggering_actor: "ivan-peychev",
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
      triggered_at: "2026-07-31T10:25:30.000Z",
      delivered_at: "2026-07-31T10:26:00.000Z",
    },
    rollback: {
      automatic_policy_id: "rollback-policy-prod-001",
      canary: {
        run_id: `${worker}:${baselineVersion}`,
        release_id: releaseId,
        worker,
        url: workerUrl,
        version_id: baselineVersion,
        build_marker: releaseId,
        probe: "production/scripts/probe-production-journeys.mjs",
        status: "pass",
        checked_at: "2026-07-31T10:27:00.000Z",
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
        alert_delivery: { ...report().alert_delivery, delivered_at: "2026-07-31T10:31:00.000Z" },
      }),
    /cannot be later than generated_at/,
  );
  assert.throws(
    () => assertMonitoringRollbackReport({ ...report(), alert_delivery: { ...report().alert_delivery, receipt_id: "" } }),
    /receipt_id must be real evidence/,
  );
  assert.throws(
    () =>
      assertMonitoringRollbackReport({
        ...report(),
        rollback: { ...report().rollback, drill: { ...report().rollback.drill, restored_build_marker: "b".repeat(40) } },
      }),
    /restore the exact release build marker/,
  );
  assert.throws(
    () =>
      assertMonitoringRollbackReport({
        ...report(),
        alert_delivery: { ...report().alert_delivery, receipt_id: "2026-07-31T10:26:00.000Z" },
      }),
    /durable provider receipt identifier/,
  );
});
