import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertMonitoringRollbackReport } from "../lib/monitoring-rollback.mjs";
import { fromRoot } from "../lib/paths.mjs";

test("monitoring report builder combines machine drill proof with human alert confirmation", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-monitoring-builder-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const evidencePath = path.join(directory, "machine.json");
  const outputPath = path.join(directory, "report.json");
  fs.writeFileSync(
    evidencePath,
    `${JSON.stringify({
      schema_version: 1,
      environment: "production",
      release_id: "1".repeat(40),
      provider: "github-actions-cloudflare-workers",
      provider_run_id: "31485358241",
      production: { url: "https://ms-realty.ms-realty-bg.workers.dev/api/health", status: "pass", checked_at: "2026-08-11T10:00:00.000Z" },
      canary: { url: "https://msr-canary-1.ms-realty-bg.workers.dev/api/health", status: "pass", checked_at: "2026-08-11T10:01:00.000Z" },
      rollback: {
        first_version_id: "version-one",
        second_version_id: "version-two",
        active_version_id: "version-one",
        status: "pass",
        target: "isolated",
        verified_at: "2026-08-11T10:02:00.000Z",
      },
    })}\n`,
  );

  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-monitoring-rollback-report.mjs")], {
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_ALERT_DELIVERED_AT: "2026-08-11T10:03:00.000Z",
      MS_REALTY_GENERATED_AT: "2026-08-11T10:04:00.000Z",
      MS_REALTY_MONITORING_DRILL_EVIDENCE_PATH: evidencePath,
      MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH: outputPath,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(assertMonitoringRollbackReport(report), true);
  assert.equal(report.release_id, "1".repeat(40));
  assert.equal(report.alert_delivery.delivered_at, "2026-08-11T10:03:00.000Z");
});
