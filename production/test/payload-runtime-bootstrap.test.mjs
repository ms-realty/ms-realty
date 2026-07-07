import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import {
  assertPayloadRuntimeBootstrap,
  payloadRuntimeBootstrapChecklist,
  payloadRuntimeComposeFile,
  payloadRuntimeEnvExample,
  writePayloadRuntimeBootstrap,
} from "../lib/payload-runtime-bootstrap.mjs";
import { fromRoot } from "../lib/paths.mjs";

test("Payload runtime bootstrap files define the exact env and Postgres handoff", () => {
  const envExample = payloadRuntimeEnvExample();
  const compose = payloadRuntimeComposeFile();

  assert.equal(assertPayloadRuntimeBootstrap({ compose, envExample }), true);
  assert.match(envExample, /^PAYLOAD_SECRET=/m);
  assert.match(envExample, /^DATABASE_URL=postgres:\/\/ms_realty_payload:replace-with-postgres-password@127\.0\.0\.1:5432\/ms_realty_payload$/m);
  assert.match(compose, /image: postgres:16-alpine/);
  assert.match(compose, /127\.0\.0\.1/);
  assert.match(compose, /pg_isready/);
  assert.equal(payloadRuntimeBootstrapChecklist().some((line) => line.includes("npm run payload:preflight")), true);
});

test("Payload runtime bootstrap writer and CLI honor output path overrides", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-payload-bootstrap-`);
  const envExamplePath = `${dir}/payload-runtime.env.example`;
  const composePath = `${dir}/docker-compose.payload.yml`;

  writePayloadRuntimeBootstrap({ composePath, envExamplePath });
  assert.equal(fs.existsSync(envExamplePath), true);
  assert.equal(fs.existsSync(composePath), true);
  assert.match(fs.readFileSync(envExamplePath, "utf8"), /PAYLOAD_SECRET=replace-with-output-of-openssl-rand-base64-32/);
  assert.match(fs.readFileSync(composePath, "utf8"), /payload-postgres-data/);

  const cliEnvPath = `${dir}/cli-payload-runtime.env.example`;
  const cliComposePath = `${dir}/cli-docker-compose.payload.yml`;
  const cli = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-payload-runtime-bootstrap.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      MS_REALTY_PAYLOAD_RUNTIME_COMPOSE_PATH: cliComposePath,
      MS_REALTY_PAYLOAD_RUNTIME_ENV_EXAMPLE_PATH: cliEnvPath,
    },
  });

  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /Wrote Payload runtime env example/);
  assert.equal(fs.existsSync(cliEnvPath), true);
  assert.equal(fs.existsSync(cliComposePath), true);
});
