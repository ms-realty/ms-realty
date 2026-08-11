import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";

const workflow = fs.readFileSync(fromRoot(".github", "workflows", "monitoring-drill.yml"), "utf8");

test("monitoring drill stays isolated, cleans up, and requires explicit alert failure", () => {
  assert.match(workflow, /msr-canary-\$\{suffix\}/);
  assert.match(workflow, /msr-rollback-\$\{suffix\}/);
  assert.match(workflow, /git merge-base --is-ancestor "\$RELEASE_SHA" origin\/main/);
  assert.match(workflow, /Delete only isolated drill Workers\n\s+if: always\(\)/);
  assert.match(workflow, /wrangler@4\.117\.0 delete "\$worker" --force/);
  assert.match(workflow, /needs\.isolated-drill\.result == 'success' && inputs\.confirm_alert_drill/);
  assert.match(workflow, /exit 1/);
  assert.doesNotMatch(workflow, /rollback .*--name ms-realty(?:\s|$)/);
  assert.doesNotMatch(workflow, /delete ms-realty(?:\s|$)/);
});
