import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

// Two things a broker was being shown that are not addressed to them: a
// sentence about the runtime printed as the value of a field called Access, and
// the names of environment variables in the tooltip of a disabled button.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TOKENS = {
  admin: "values-admin-token-0123456789abcdef",
  broker: "values-broker-token-0123456789abcdef",
};

function dataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-operator-values-"));
  const copy = (name) => {
    const target = path.join(dir, name);
    fs.copyFileSync(path.join(ROOT, "production/data", name), target);
    return target;
  };
  return {
    reviewedAt: "2026-07-19T12:00:00.000Z",
    leadLedgerPath: copy("lead-ledger.jsonl"),
    eventLedgerPath: copy("events.jsonl"),
    leadContactVaultPath: path.join(dir, "lead-contacts.jsonl"),
    leadContactKey: "test-only-operator-values-key-32-chr",
  };
}

async function withRoles(fn) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.MS_REALTY_ADMIN_TOKEN;
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify(
      Object.entries(TOKENS).map(([role, token]) => ({ id: `${role}_operator`, token, roles: [role] })),
    );
    return await fn(Object.fromEntries(Object.entries(TOKENS).map(([role, token]) => [role, { authorization: `Bearer ${token}` }])));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("a field called Access carries an access, not a note about the runtime", async () => {
  const app = createHttpApp(dataDir());
  const res = await dispatchHttp(app, { url: "/admin/settings?locale=en", headers: { authorization: "Bearer local-admin-smoke" } });
  assert.equal(res.status, 200);

  // The value is something a person reads about themselves.
  assert.match(res.body, /<dt>Access<\/dt><dd><bdi>(Full workspace access|Not recorded|[^<]*workspaces?)<\/bdi><\/dd>/);
  // Never the diagnostic, in any of the three places it used to appear.
  assert.doesNotMatch(res.body, /<dd><bdi>Workspace scope was not provided/);
  assert.doesNotMatch(res.body, /<small>Workspace scope was not provided/);
  assert.doesNotMatch(res.body, /Administrator · Workspace scope was not provided/);

  // When the workspace cannot say, it says so beside the field rather than in it.
  if (/<dd><bdi>Not recorded<\/bdi><\/dd>/.test(res.body)) {
    assert.match(res.body, /data-owner-scope-unknown="true"/);
    assert.match(res.body, /Workspace scope was not provided by this runtime/);
  }
});

test("a broker is not shown the names of environment variables", async () => {
  await withRoles(async (headers) => {
    const config = dataDir();

    const broker = await dispatchHttp(createHttpApp(config), { url: "/admin/leads?locale=en", headers: headers.broker });
    assert.equal(broker.status, 200);
    // HERMES_API_KEY is not something a broker can do anything about, so the
    // sentence names what they can do and who to ask instead.
    assert.doesNotMatch(broker.body, /HERMES_API_KEY|HERMES_CHAT_COMPLETIONS_URL|HERMES_PROVIDER_MODE/);
    assert.match(broker.body, /Hermes is not connected for this workspace/);
    assert.match(broker.body, /the workspace owner can connect it/);
    // And they are not offered a screen they cannot open.
    const note = broker.body.slice(broker.body.indexOf("data-hermes-unavailable-note"));
    assert.doesNotMatch(note.slice(0, 600), /href="\/admin\/connect"/);

    // The operator who can set them still gets the detail, next to the screen
    // where they would set it.
    const admin = await dispatchHttp(createHttpApp(config), { url: "/admin/leads?locale=en", headers: headers.admin });
    assert.equal(admin.status, 200);
    assert.match(admin.body, /Missing: HERMES_CHAT_COMPLETIONS_URL, HERMES_API_KEY/);
    assert.match(admin.body, /href="\/admin\/connect"/);
  });
});
