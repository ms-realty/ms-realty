import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildLaunchFreeze } from "../lib/launch-freeze.mjs";
import { fromRoot } from "../lib/paths.mjs";

function read(...parts) {
  return JSON.parse(fs.readFileSync(fromRoot(...parts), "utf8"));
}

function inputs() {
  return {
    migrationRecords: read("production", "data", "migration-records.json").records,
    routeMap: read("production", "data", "legacy-route-map.json").routes,
    legacyDecisions: read("production", "data", "deployable-redirects.json").decisions,
    manualAudit: read("production", "data", "manual-listing-audit.json"),
    contentParity: read(
      "migration",
      "content-evidence",
      "20260729-legacy-content-review",
      "content-parity-report.json",
    ),
    appRouteManifest: read("production", "data", "app-route-manifest.json"),
    inputs: {},
  };
}

test("launch freeze covers the exact catalog and every legacy URL without granting proposal approval", () => {
  const freeze = buildLaunchFreeze(inputs());

  assert.deepEqual(freeze.summary.catalog.by_state, { active: 30, archived: 135 });
  assert.equal(freeze.summary.catalog.publish_ready, 0);
  assert.deepEqual(freeze.summary.routes.by_status, { 200: 10, 301: 179, 410: 268 });
  assert.deepEqual(freeze.summary.routes.by_approval_state, { approved: 165, required: 292 });
  assert.equal(new Set(freeze.routes.map((route) => route.old_url)).size, 457);
  assert.equal(freeze.routes.filter((route) => route.approval_state === "required").every((route) => !route.deployable), true);
  assert.equal(
    freeze.catalog.filter((listing) => listing.catalog_state === "archived").every((listing) => !listing.active_search_eligible),
    true,
  );
});

test("launch freeze rejects incomplete listing evidence", () => {
  const value = inputs();
  value.manualAudit = { ...value.manualAudit, listings: value.manualAudit.listings.slice(1) };
  assert.throws(() => buildLaunchFreeze(value), /manual audit listings must be 165/);
});

