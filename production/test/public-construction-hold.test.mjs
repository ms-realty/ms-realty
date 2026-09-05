import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { publicHoldRoutePlan, PUBLIC_HOLD_PATTERNS, SERVICE_ASSET_PATTERNS, HOLD_WORKER } from "../scripts/restore-public-hold.mjs";
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
