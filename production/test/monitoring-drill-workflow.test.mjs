import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";

const workflow = fs.readFileSync(fromRoot(".github", "workflows", "monitoring-drill.yml"), "utf8");

test("monitoring drill gates intentional failure behind a protected reviewer environment", () => {
  assert.match(workflow, /permissions:\n\s+actions: read\n\s+contents: read/);
  assert.match(workflow, /environment:\n\s+name: monitoring-alert-drill/);
  assert.match(workflow, /environments\/\$\{APPROVAL_ENVIRONMENT\}/);
  assert.match(workflow, /type === "required_reviewers"/);
  assert.match(workflow, /prevent_self_review !== true/);

  const failureStep = workflow.slice(
    workflow.indexOf("- name: Exercise the production monitor failure surface"),
    workflow.indexOf("- name: Roll back the isolated MS Realty artifact"),
  );
  assert.match(failureStep, /inputs\.confirm_alert_drill/);
  assert.match(failureStep, /node production\/scripts\/probe-production-journeys\.mjs/);
  assert.doesNotMatch(failureStep, /exit 1/);
});

test("monitoring drill deploys and rolls back the real MS Realty Container artifact in isolation", () => {
  assert.match(workflow, /msr-monitoring-drill-\$\{suffix\}/);
  assert.match(workflow, /git merge-base --is-ancestor "\$RELEASE_SHA" origin\/main/);
  assert.match(workflow, /wrangler@4\.117\.0 deploy/);
  assert.match(workflow, /--config wrangler\.jsonc/);
  assert.match(workflow, /--strict/);
  assert.match(workflow, /--containers-rollout immediate/);
  assert.match(workflow, /Dockerfile/);
  assert.doesNotMatch(workflow, /worker\.mjs/);
  assert.doesNotMatch(workflow, /return Response\.json\(\{ marker:/);
  assert.match(workflow, /wrangler@4\.117\.0 rollback "\$baseline_version" --name "\$DRILL_WORKER"/);
  assert.doesNotMatch(workflow, /rollback .*--name ms-realty(?:\s|$)/);
  assert.doesNotMatch(workflow, /delete ms-realty(?:\s|$)/);
});

test("monitoring drill records durable runtime, failure, and exact restoration evidence", () => {
  assert.match(workflow, /node production\/scripts\/probe-production-journeys\.mjs/g);
  assert.match(workflow, /provider_run_attempt/);
  assert.match(workflow, /correlation_id/);
  assert.match(workflow, /baseline_version_id/);
  assert.match(workflow, /fault_version_id/);
  assert.match(workflow, /restored_version_id/);
  assert.match(workflow, /restored_build_marker/);
  assert.match(workflow, /worker: process\.env\.DRILL_WORKER/);
  assert.match(workflow, /url: process\.env\.DRILL_URL/);
  assert.match(workflow, /Delete only the isolated drill Worker\n\s+if: always\(\)/);
  assert.match(workflow, /wrangler@4\.117\.0 delete "\$DRILL_WORKER" --force/);
});
