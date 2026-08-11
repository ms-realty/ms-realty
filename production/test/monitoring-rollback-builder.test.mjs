import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertMonitoringRollbackReport } from "../lib/monitoring-rollback.mjs";
import { fromRoot } from "../lib/paths.mjs";

const RELEASE_ID = "1".repeat(40);
const RUN_ID = "31485358241";
const RUN_ATTEMPT = "2";
const REPOSITORY = "ms-realty/ms-realty";
const RUN_URL = `https://github.com/${REPOSITORY}/actions/runs/${RUN_ID}/attempts/${RUN_ATTEMPT}`;
const CORRELATION_ID = `${REPOSITORY}:monitoring-drill:${RUN_ID}:${RUN_ATTEMPT}`;
const WORKER = "msr-monitoring-drill-31485358241-2";
const WORKER_URL = `https://${WORKER}.ms-realty-bg.workers.dev`;

function machineEvidence(overrides = {}) {
  return {
    schema_version: 2,
    environment: "production",
    release_id: RELEASE_ID,
    provider: "github-actions-cloudflare-workers",
    provider_run_id: RUN_ID,
    provider_run_attempt: RUN_ATTEMPT,
    repository: REPOSITORY,
    workflow_ref: `${REPOSITORY}/.github/workflows/monitoring-drill.yml@refs/heads/main`,
    run_url: RUN_URL,
    correlation_id: CORRELATION_ID,
    artifact_name: `monitoring-drill-machine-evidence-${RUN_ID}-${RUN_ATTEMPT}`,
    production: {
      url: "https://ms-realty.ms-realty-bg.workers.dev/api/health",
      status: "pass",
      checked_at: "2026-08-11T10:00:00.000Z",
      build_marker: RELEASE_ID,
      probe: "production/scripts/probe-production-journeys.mjs",
    },
    canary: {
      worker: WORKER,
      url: WORKER_URL,
      version_id: "11111111-1111-4111-8111-111111111111",
      build_marker: RELEASE_ID,
      status: "pass",
      checked_at: "2026-08-11T10:01:00.000Z",
      probe: "production/scripts/probe-production-journeys.mjs",
    },
    alert_drill: {
      status: "failure",
      correlation_id: CORRELATION_ID,
      failure_surface: "production_journey_probe",
      probe: "production/scripts/probe-production-journeys.mjs",
      triggered_at: "2026-08-11T10:01:30.000Z",
    },
    rollback: {
      worker: WORKER,
      url: WORKER_URL,
      baseline_version_id: "11111111-1111-4111-8111-111111111111",
      fault_version_id: "22222222-2222-4222-8222-222222222222",
      restored_version_id: "11111111-1111-4111-8111-111111111111",
      restored_build_marker: RELEASE_ID,
      status: "pass",
      target: "isolated",
      verified_at: "2026-08-11T10:02:00.000Z",
      probe: "production/scripts/probe-production-journeys.mjs",
    },
    ...overrides,
  };
}

function alertReceipt(overrides = {}) {
  return {
    schema_version: 1,
    status: "delivered",
    provider: "github-actions-email",
    receipt_id: "message-id-20260811-31485358241-2",
    correlation_id: CORRELATION_ID,
    provider_run_id: RUN_ID,
    provider_run_attempt: RUN_ATTEMPT,
    repository: REPOSITORY,
    run_url: RUN_URL,
    delivered_at: "2026-08-11T10:03:00.000Z",
    ...overrides,
  };
}

function runBuilder(t, { evidence = machineEvidence(), receipt = alertReceipt(), env = {} } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-monitoring-builder-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const evidencePath = path.join(directory, "machine.json");
  const receiptPath = path.join(directory, "alert-receipt.json");
  const outputPath = path.join(directory, "report.json");
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence)}\n`);
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`);

  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-monitoring-rollback-report.mjs")], {
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_GENERATED_AT: "2026-08-11T10:04:00.000Z",
      MS_REALTY_MONITORING_DRILL_EVIDENCE_PATH: evidencePath,
      MS_REALTY_ALERT_RECEIPT_EVIDENCE_PATH: receiptPath,
      MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH: outputPath,
      ...env,
    },
  });
  return { result, outputPath };
}

test("monitoring report builder preserves correlated machine, provider, and rollback identifiers", (t) => {
  const { result, outputPath } = runBuilder(t);

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(assertMonitoringRollbackReport(report), true);
  assert.equal(report.release_id, RELEASE_ID);
  assert.equal(report.monitoring.provider_run_id, RUN_ID);
  assert.equal(report.monitoring.provider_run_attempt, RUN_ATTEMPT);
  assert.equal(report.alert_delivery.receipt_id, "message-id-20260811-31485358241-2");
  assert.equal(report.alert_delivery.correlation_id, CORRELATION_ID);
  assert.equal(report.rollback.canary.worker, WORKER);
  assert.equal(report.rollback.canary.url, WORKER_URL);
  assert.equal(report.rollback.drill.baseline_version_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(report.rollback.drill.fault_version_id, "22222222-2222-4222-8222-222222222222");
  assert.equal(report.rollback.drill.restored_version_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(report.rollback.drill.restored_build_marker, RELEASE_ID);
});

test("monitoring report builder rejects timestamp-only alert claims", (t) => {
  const { result } = runBuilder(t, {
    env: {
      MS_REALTY_ALERT_RECEIPT_EVIDENCE_PATH: "",
      MS_REALTY_ALERT_DELIVERED_AT: "2026-08-11T10:03:00.000Z",
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MS_REALTY_ALERT_RECEIPT_EVIDENCE_PATH/);
});

test("monitoring report builder rejects an alert receipt for another workflow run", (t) => {
  const { result } = runBuilder(t, { receipt: alertReceipt({ provider_run_id: "31485358242" }) });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not correlate/);
});

test("monitoring report builder rejects a delivery timestamp masquerading as a receipt ID", (t) => {
  const { result } = runBuilder(t, { receipt: alertReceipt({ receipt_id: "2026-08-11T10:03:00.000Z" }) });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not correlate/);
});

test("monitoring report builder rejects rollback evidence without the exact restored marker", (t) => {
  const evidence = machineEvidence({
    rollback: { ...machineEvidence().rollback, restored_build_marker: "2".repeat(40) },
  });
  const { result } = runBuilder(t, { evidence });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /actual MS Realty artifact rollback/);
});
