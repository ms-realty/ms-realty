import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { planMediaMirror } from "../scripts/run-media-mirror.mjs";
import { fromRoot } from "../lib/paths.mjs";

test("media mirror maps every legacy asset into a host-scoped non-root destination", () => {
  const seed = JSON.parse(fs.readFileSync(fromRoot("production", "data", "cms-seed.json"), "utf8"));
  const plan = planMediaMirror(seed, "/srv/media");
  assert.ok(plan.length > 1_000);
  assert.equal(new Set(plan.map(({ assetUrl }) => assetUrl)).size, plan.length);
  for (const entry of plan) {
    assert.match(entry.target, /^\/srv\/media\/makler-realty\.(com|ru)\/wp-content\/uploads\//);
  }
  assert.throws(() => planMediaMirror(seed, "/"), /non-root absolute path/);
});
