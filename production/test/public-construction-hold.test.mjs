import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { publicHoldRoutePlan, PUBLIC_HOLD_PATTERNS, SERVICE_ASSET_PATTERNS, HOLD_WORKER } from "../scripts/restore-public-hold.mjs";
import { publicReleaseRoutePlan, PRODUCTION_WORKER } from "../scripts/release-public-hold.mjs";
import { probePublicHold } from "../scripts/probe-public-hold.mjs";

const routes = () => PUBLIC_HOLD_PATTERNS.map((pattern, i) => ({ id: `route-${i}`, pattern, script: "ms-realty" }));

test("holding plan covers unprefixed public paths and preserves vendor assets before switching the wildcard", () => {
  const input = routes().concat([{ id: "unrelated", pattern: "api.makler-realty.com/*", script: "ms-realty" }]);
  const plan = publicHoldRoutePlan(input);
  assert.equal(plan.length, 20);
  assert.deepEqual(plan.slice(0, 2).map(({ pattern, script, id }) => ({ pattern, script, id })), SERVICE_ASSET_PATTERNS.map((pattern) => ({ pattern, script: "ms-realty", id: null })));
  assert.ok(plan.slice(2).every((route) => route.script === HOLD_WORKER && route.id !== "unrelated"));
  const applied = plan.map((route, i) => ({ ...route, id: `applied-${i}` }));
  assert.ok(publicHoldRoutePlan(applied).every((route) => route.previous === route.script));
  assert.throws(() => publicHoldRoutePlan(input.slice(1)), /Expected one/);
  assert.throws(() => publicHoldRoutePlan(input.map((route) => ({ ...route, script: "another-worker" }))), /Unexpected owner/);
});

test("holding probe requires actual holding responses, not healthy public pages", async () => {
  const holding = () => new Response('<section data-locale="bg">', { status: 503, headers: { "x-robots-tag": "noindex, nofollow", "retry-after": "3600" } });
  const report = await probePublicHold(holding);
  assert.equal(report.checks.length, 48);
  await assert.rejects(probePublicHold(() => new Response("catalogue", { status: 200 })), /hold is incomplete/);
});

test("automatic releases and route reclamation respect the construction hold", () => {
  const ci = fs.readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
  for (const job of ["deploy_origin", "deploy"]) {
    assert.match(ci.slice(ci.indexOf(`  ${job}:`)), /if: >-\s+vars\.MS_REALTY_PUBLIC_CONSTRUCTION_HOLD != 'true' &&/);
  }
  const reclaim = fs.readFileSync(new URL("../../.github/workflows/reclaim-public-routes.yml", import.meta.url), "utf8");
  assert.match(reclaim, /test "\$MS_REALTY_PUBLIC_CONSTRUCTION_HOLD" != "true"/);
  const health = fs.readFileSync(new URL("../../.github/workflows/health-check.yml", import.meta.url), "utf8");
  assert.match(health, /MS_REALTY_PUBLIC_CONSTRUCTION_HOLD == 'true'[\s\S]*probe-public-hold\.mjs/);
});

test("releasing the hold points every held route back at the production Worker without a gap", () => {
  // The state this has to repair: the hold owns the two wildcards, and the
  // sixteen specific patterns were deleted rather than reassigned, so a plan
  // that only reassigns would leave every locale unrouted.
  const held = [
    { id: "wild-com", pattern: "makler-realty.com/*", script: HOLD_WORKER },
    { id: "wild-www", pattern: "www.makler-realty.com/*", script: HOLD_WORKER },
    { id: "vendor-com", pattern: "makler-realty.com/vendor/*", script: PRODUCTION_WORKER },
    { id: "unrelated", pattern: "api.makler-realty.com/*", script: PRODUCTION_WORKER },
  ];
  const plan = publicReleaseRoutePlan(held);

  assert.equal(plan.length, SERVICE_ASSET_PATTERNS.length + PUBLIC_HOLD_PATTERNS.length);
  assert.ok(plan.every((route) => route.script === PRODUCTION_WORKER));
  // An existing route is reassigned by id; a deleted one is created.
  assert.deepEqual(
    plan.filter((route) => route.previous === HOLD_WORKER).map((route) => route.pattern),
    ["makler-realty.com/*", "www.makler-realty.com/*"],
  );
  // A route the hold deleted must read as absent, so the caller creates it
  // rather than skipping it as already correct.
  const created = plan.filter((route) => route.id === null);
  assert.equal(created.length, PUBLIC_HOLD_PATTERNS.length - 2 + 1);
  assert.ok(created.every((route) => route.previous === null && route.previous !== route.script));
  assert.ok(!plan.some((route) => route.id === "unrelated"));

  // Applying it is a fixed point, and a third-party owner is never overwritten.
  const applied = plan.map((route, i) => ({ ...route, id: route.id ?? `created-${i}` }));
  assert.ok(publicReleaseRoutePlan(applied).every((route) => route.previous === route.script));
  assert.throws(
    () => publicReleaseRoutePlan([{ id: "x", pattern: "makler-realty.com/*", script: "another-worker" }]),
    /Unexpected owner/,
  );
  assert.throws(
    () => publicReleaseRoutePlan(held.concat([{ id: "dupe", pattern: "makler-realty.com/*", script: HOLD_WORKER }])),
    /at most one/,
  );
});

test("the release path is typed, refuses while the hold stands, and proves the site afterwards", () => {
  const reclaim = fs.readFileSync(new URL("../../.github/workflows/reclaim-public-routes.yml", import.meta.url), "utf8");
  const step = reclaim.slice(reclaim.indexOf("      - name: Release the public construction hold"));
  assert.match(reclaim, /release_construction_hold:\n\s+description: [^\n]+\n\s+required: false\n\s+default: false\n\s+type: boolean/);
  assert.match(step, /if: \$\{\{ inputs\.release_construction_hold \}\}/);
  assert.match(step, /test "\$MS_REALTY_PUBLIC_CONSTRUCTION_HOLD" != "true"/);
  // Releasing and detaching are mutually exclusive: one reassigns, one deletes.
  assert.match(step, /test -z "\$DETACH_WORKER"/);
  assert.match(step, /node production\/scripts\/release-public-hold\.mjs/);
  assert.match(step, /probe-canonical-site\.mjs/);
});
