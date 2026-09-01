import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { payloadAdminPrincipal } from "../lib/payload-admin-auth.mjs";

const ORIGIN = "https://ms-realty.example";
const SECRET = "provider-test-secret-that-is-longer-than-thirty-two-characters";

function user() {
  return { id: 1, collection: "admins", email: "owner@example.com", role: "admin", workspace_ids: [] };
}

function config(overrides = {}) {
  const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-provider-admin-"));
  const admin = user();
  return {
    ...appAdminConfigFromEnv({ NODE_ENV: "test" }),
    auditLogPath: path.join(auditDir, "audit.jsonl"),
    authEnv: { NODE_ENV: "production", MS_REALTY_PUBLIC_ORIGIN: ORIGIN },
    payloadAdminAuth: {
      async resolve() {
        return { user: admin, principal: payloadAdminPrincipal(admin) };
      },
    },
    providerConnection: {
      publicOrigin: ORIGIN,
      credentialSecret: SECRET,
      stateSecret: SECRET,
      payloadSecret: SECRET,
      databaseUrl: "postgres://payload:payload@db/ms_realty",
      googleClientId: "google-client-id",
      googleClientSecret: "google-client-secret",
      metaAppId: "1234567890",
      metaAppSecret: "meta-app-secret-that-is-long-enough",
      metaConfigId: "9876543210",
      metaGraphVersion: "v23.0",
      metaWebhookVerifyToken: "meta-webhook-verify-token",
      viberCommercialReady: true,
      webhookMaxBytes: 1024 * 1024,
    },
    readProviderConnections: async () => [],
    ...overrides,
  };
}

function post(provider, input) {
  return new Request(`${ORIGIN}/api/admin/connections`, {
    method: "POST",
    headers: {
      cookie: "ms_admin=payload-session",
      "content-type": "application/json",
      host: "ms-realty.example",
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({ provider, ...input }),
  });
}

test("Viber connection is durably fenced as connecting before webhook registration", async (t) => {
  const saves = [];
  const providerConfig = config({
    completeViberConnection: async () => ({
      provider: "viber",
      status: "connecting",
      accountLabel: "MS Realty",
      externalAccountId: "viber-account",
      scopes: ["messages"],
      metadata: { webhook_registered: false },
      credentials: { auth_token: "private-viber-token" },
    }),
    registerViberWebhook: async (connection) => {
      assert.equal(saves[0], "connecting");
      return { ...connection, status: "connected", metadata: { webhook_registered: true } };
    },
    saveProviderConnection: async (connection) => {
      saves.push(connection.status);
      return {
        provider: connection.provider,
        status: connection.status,
        account_label: connection.accountLabel,
        external_account_id: connection.externalAccountId,
        scopes: connection.scopes,
        metadata: connection.metadata,
      };
    },
  });
  t.after(() => fs.rmSync(path.dirname(providerConfig.auditLogPath), { recursive: true, force: true }));
  const response = await renderAppAdminResponse(post("viber", { token: "private-viber-token" }), { config: providerConfig });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(saves, ["connecting", "connected"]);
  assert.equal(body.connection.status, "connected");
  assert.doesNotMatch(JSON.stringify(body), /private-viber-token|credentials|auth_token/);
});

test("provider rejection is generic to the browser and leaves a secret-free audit record", async (t) => {
  const providerConfig = config({
    completeWhatsAppEmbeddedSignup: async () => {
      const error = new Error("private Meta diagnostic and access token");
      error.code = "meta_rejected";
      throw error;
    },
    saveProviderConnection: async () => {
      throw new Error("must not save");
    },
  });
  t.after(() => fs.rmSync(path.dirname(providerConfig.auditLogPath), { recursive: true, force: true }));
  const response = await renderAppAdminResponse(
    post("whatsapp", { code: "one-time-code", waba_id: "12345678901", phone_number_id: "98765432101" }),
    { config: providerConfig },
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    kind: "provider_connection_rejected",
    message: "The provider did not confirm the connection",
  });
  const audit = fs.readFileSync(providerConfig.auditLogPath, "utf8");
  assert.match(audit, /provider_connection_failed/);
  assert.match(audit, /meta_rejected/);
  assert.doesNotMatch(audit, /private Meta diagnostic|access token|one-time-code/);
});
