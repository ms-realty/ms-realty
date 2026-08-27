import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fromRoot } from "../lib/paths.mjs";

const SCRIPT = fromRoot("production", "scripts", "provision-admin-operator.mjs");
const source = readFileSync(SCRIPT, "utf8");

function run(args, env = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "", PAYLOAD_SECRET: "", ...env },
  });
}

test("the provisioning command refuses a password passed as an argument", () => {
  const result = run(["--email", "someone@example.com", "--password", "hunter2hunter2"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /environment variable, never as an argument/);
  // The rejection must not echo the secret back into the terminal or the logs.
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /hunter2hunter2/);
});

test("the provisioning command asks for the password through the environment", () => {
  const help = run(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /MS_REALTY_NEW_OPERATOR_PASSWORD/);
  assert.match(help.stdout, /never accepted as an argument and never printed/);
  assert.match(help.stdout, /--upsert explicitly replaces an existing account password/);
});

test("the provisioning command validates the request before it opens a database connection", () => {
  // DATABASE_URL and PAYLOAD_SECRET are blank here, so anything that reached
  // the runtime would fail with "Payload runtime is not configured". These
  // checks must land first and say something useful instead.
  const noEmail = run([]);
  assert.equal(noEmail.status, 2);
  assert.match(noEmail.stderr, /An --email is required/);

  const badRole = run(["--email", "someone@example.com", "--role", "owner"]);
  assert.equal(badRole.status, 2);
  assert.match(badRole.stderr, /Role must be one of: admin, broker, editor, translator/);

  const noPassword = run(["--email", "someone@example.com"]);
  assert.equal(noPassword.status, 2);
  assert.match(noPassword.stderr, /Set MS_REALTY_NEW_OPERATOR_PASSWORD/);

  const shortPassword = run(["--email", "someone@example.com"], { MS_REALTY_NEW_OPERATOR_PASSWORD: "short" });
  assert.equal(shortPassword.status, 2);
  assert.match(shortPassword.stderr, /at least 12 characters/);
});

test("the provisioning command never overwrites an operator that already exists", () => {
  // The guard is the difference between a typo in an email address and a
  // takeover of somebody else's account, so pin it in the source: it looks the
  // account up first and refuses rather than calling create().
  const guard = source.indexOf("if (existing && !options.upsert)");
  const create = source.indexOf("payload.create(");
  assert.ok(guard > 0 && create > guard, "the existing-account check must run before the create call");
  assert.match(source, /will not change it/);
  assert.match(source, /existing && !options\.upsert/);
});

test("an explicit upsert restores full access and requires a new password", () => {
  assert.match(source, /password_change_required: true/);
  assert.match(source, /workspace_ids: \[\]/);
  assert.match(source, /sessions: \[\]/);
  assert.match(source, /loginAttempts: 0/);
  assert.match(source, /lockUntil: null/);
  assert.match(source, /kind: existing \? "admin_operator_updated" : "admin_operator_created"/);
});

test("the provisioning command carries no password of its own", () => {
  // A default or example password in this file would become the credential
  // every fresh deployment ships with.
  assert.doesNotMatch(source, /password\s*=\s*["'][^"']{6,}["']/);
});
