import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";

const workflow = fs.readFileSync(fromRoot(".github", "workflows", "monitoring-drill.yml"), "utf8");

test("monitoring drill gates intentional failure behind an auditable typed dispatch confirmation", () => {
  assert.match(workflow, /permissions:\n\s+actions: read\n\s+contents: read/);
  assert.doesNotMatch(workflow, /environment:\n\s+name: monitoring-alert-drill/);
  assert.match(workflow, /test "\$CONFIRM_ALERT_DRILL" = "true"/);
  assert.match(workflow, /test "\$\{#MS_REALTY_ORIGIN_TOKEN\}" -ge 32/);
  assert.match(workflow, /MS_REALTY_EXPECTED_BUILD_MARKER: \$\{\{ inputs\.release_sha \}\}/);
  assert.match(workflow, /mechanism: "workflow_dispatch_typed_confirmation"/);
  assert.match(workflow, /actor: process\.env\.GITHUB_ACTOR/);
  assert.match(workflow, /triggering_actor: process\.env\.GITHUB_TRIGGERING_ACTOR/);

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
  assert.match(workflow, /wrangler@4\.117\.0 secret put MS_REALTY_ORIGIN_TOKEN --name "\$DRILL_WORKER"/);
  assert.doesNotMatch(workflow, /--var [^\n]*MS_REALTY_ORIGIN_TOKEN/);
  assert.match(workflow, /Dockerfile/);
  assert.match(workflow, /config\.split\(placeholder\)\.length !== 3/);
  assert.match(workflow, /config\.split\(productionWorkerName\)\.length !== 2/);
  assert.match(workflow, /\.replace\(productionWorkerName, `"name": "\$\{process\.env\.DRILL_WORKER\}"`\)/);
  assert.match(workflow, /\.replaceAll\(placeholder, marker\)/);
  assert.match(workflow, /config\.split\(process\.env\.RELEASE_SHA\)\.length !== 3/);
  assert.match(workflow, /config\.replaceAll\(process\.env\.RELEASE_SHA, process\.env\.FAULT_MARKER\)/);
  assert.match(workflow, /createHash\("sha1"\)/);
  assert.match(workflow, /test "\$fault_marker" != "\$RELEASE_SHA"/);
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
  assert.match(workflow, /Delete only the isolated drill Worker\n\s+if: always\(\) && steps\.identity\.outputs\.worker != ''/);
  assert.match(workflow, /wrangler@4\.117\.0 delete "\$DRILL_WORKER" --force/);
});
