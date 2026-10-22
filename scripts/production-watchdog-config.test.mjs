import assert from "node:assert/strict";
import { test } from "node:test";
import { watchdogConfiguration } from "./watchdog-config.mjs";

const source = "a".repeat(40);
const image = `registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/ms-realty-origin-probe@sha256:${"b".repeat(64)}`;
test("the private probe is digest pinned, isolated and has no business route or app secrets", async () => {
  const cfg = await watchdogConfiguration(source, image);
  assert.equal(cfg.name, "ms-realty-route-watchdog");
  assert.equal(cfg.routes, undefined);
  assert.deepEqual(cfg.containers, [
    { class_name: "OriginProbe", image, max_instances: 1, instance_type: "lite" },
  ]);
  assert.equal(cfg.vars.WATCHDOG_PROBE_SOURCE_COMMIT, source);
  assert.equal(cfg.vars.WATCHDOG_PROBE_IMAGE_DIGEST, "b".repeat(64));
  assert(!("WATCHDOG_ROUTE_TOKEN" in cfg.vars));
  assert(!("DATABASE_URL" in cfg.vars));
});
test("mutable, foreign-account and missing native probe images cannot provision", async () => {
  for (const invalid of [
    undefined,
    "node:24",
    image.replace("@sha256:", ":"),
    image.replace("921d0224dcd595c87b7928d2b3c479d1", "c".repeat(32)),
  ])
    await assert.rejects(watchdogConfiguration(source, invalid));
});
