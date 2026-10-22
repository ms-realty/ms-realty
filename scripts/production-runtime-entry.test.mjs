import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import {
  runtimeEnvironmentMode,
  startDatabaseCompanion,
  startProductionDatabaseCompanion,
} from "./runtime-entry.mjs";

test("environment dispatch never turns missing/wrong markers into production", () => {
  assert.equal(runtimeEnvironmentMode({ STAGING: "true" }), "staging");
  assert.equal(
    runtimeEnvironmentMode({ STAGING: "false", RELEASE_ENVIRONMENT: "production" }),
    "production",
  );
  for (const env of [
    {},
    { STAGING: "false" },
    { STAGING: "true", RELEASE_ENVIRONMENT: "production" },
    { STAGING: "false", RELEASE_ENVIRONMENT: "staging" },
    { STAGING: "0", RELEASE_ENVIRONMENT: "production" },
  ])
    assert.throws(() => runtimeEnvironmentMode(env));
});
test("production companion is separately guarded and passes only Access secrets to the fixed child", async () => {
  const env = {
    STAGING: "false",
    RELEASE_ENVIRONMENT: "production",
    DATABASE_TRANSPORT: "cloudflared-access-tcp",
    PRODUCTION_DATABASE_HOST: "db.production.invalid",
    PRODUCTION_DATABASE_NAME: "ms_realty_payload",
    TUNNEL_SERVICE_HOSTNAME: "db.production.invalid",
    TUNNEL_SERVICE_URL: "127.0.0.1:15432",
    TUNNEL_SERVICE_TOKEN_ID: randomUUID(),
    TUNNEL_SERVICE_TOKEN_SECRET: randomUUID(),
    AUTH_SECRET: randomUUID(),
  };
  let starts = 0,
    probes = 0;
  const child = new EventEmitter();
  child.signals = [];
  child.kill = (signal) => {
    child.signals.push(signal);
    child.emit("exit", 0);
  };
  const options = {
    probe: async () => ++probes > 1,
    spawnProcess: (command, args, config) => {
      starts++;
      assert.equal(command, "/usr/local/bin/cloudflared");
      assert.deepEqual(args, ["access", "tcp"]);
      assert.equal(config.stdio, "ignore");
      assert.equal(config.env.AUTH_SECRET, undefined);
      assert.equal(config.env.TUNNEL_SERVICE_TOKEN_SECRET, env.TUNNEL_SERVICE_TOKEN_SECRET);
      return child;
    },
  };
  await assert.rejects(startDatabaseCompanion(env, () => {}, options));
  for (const change of [
    { STAGING: "true" },
    { RELEASE_ENVIRONMENT: "staging" },
    { DATABASE_TRANSPORT: "" },
    { PRODUCTION_DATABASE_HOST: "db.staging.invalid" },
    { TUNNEL_SERVICE_HOSTNAME: "foreign.invalid" },
    { TUNNEL_SERVICE_URL: "0.0.0.0:15432" },
  ])
    await assert.rejects(
      startProductionDatabaseCompanion({ ...env, ...change }, () => {}, options),
    );
  assert.equal(starts, 0);
  const handle = await startProductionDatabaseCompanion(env, () => {}, options);
  assert.equal(starts, 1);
  handle.stop();
  assert.deepEqual(child.signals, ["SIGTERM"]);
});
