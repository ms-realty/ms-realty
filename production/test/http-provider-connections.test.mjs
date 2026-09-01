import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readAuditLog } from "../lib/audit-log.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

const SESSION_TOKEN = "payload.provider.session";
const BEARER_TOKEN = "provider-mcp-admin-token-0123456789";
const VIBER_TOKEN = "viber-provider-token-that-must-never-leak";
const CREDENTIAL_SECRET = "provider-credential-secret-that-is-longer-than-thirty-two-characters";
const CONFIG = {
  publicOrigin: "https://ms-realty.example",
  credentialSecret: CREDENTIAL_SECRET,
  stateSecret: "provider-state-secret-that-is-longer-than-thirty-two-characters",
  payloadSecret: "payload-secret",
  databaseUrl: "postgres://payload.example/ms_realty",
  googleClientId: "google-client-id",
  googleClientSecret: "google-client-secret",
  metaAppId: "123456789012345",
  metaAppSecret: "meta-app-secret-at-least-sixteen-characters",
  metaConfigId: "987654321098765",
  metaGraphVersion: "v22.0",
  metaWebhookVerifyToken: "meta-webhook-verify-token-at-least-24",
  viberCommercialReady: true,
  webhookMaxBytes: 1024 * 1024,
};

function adminPrincipal() {
  return {
    id: "payload-1",
    source: "payload_session",
    can_mutate: true,
    roles: ["admin"],
    workspace_ids: [],
  };
}

function payloadAdminAuth() {
  return {
    async resolve(token) {
      return token === SESSION_TOKEN ? { principal: adminPrincipal(), user: { id: 1 } } : null;
    },
  };
}

function providerPayload() {
  const writes = [];
  const docs = [
    {
      id: "provider-google",
      provider: "google",
      status: "connected",
      connected_by: "payload-1",
      account_label: "owner@example.com",
      external_account_id: "google-account-1",
      scopes: ["openid"],
      metadata: { email_verified: true },
      credential_envelope: { ciphertext: "ENCRYPTED_CREDENTIAL_MARKER" },
      last_verified_at: "2026-08-13T13:00:00.000Z",
    },
  ];
  return {
    docs,
    writes,
    async find(options) {
      const provider = options.where?.provider?.equals;
      return { docs: provider ? docs.filter((doc) => doc.provider === provider) : [...docs] };
    },
    async create({ data }) {
      const document = { id: `provider-${data.provider}`, ...data };
      writes.push({ operation: "create", provider: data.provider, status: data.status });
      docs.push(document);
      return document;
    },
    async update({ id, data }) {
      const index = docs.findIndex((doc) => doc.id === id);
      writes.push({ operation: "update", provider: data.provider, status: data.status });
      docs[index] = { ...docs[index], ...data };
      return docs[index];
    },
  };
}

async function withNamedBearer(run) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: "mcp-admin", token: BEARER_TOKEN, roles: ["admin"] },
    ]);
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("standalone provider connection routes reject unauthenticated requests", async () => {
  const app = createHttpApp({ providerConnection: CONFIG, providerConnectionPayload: providerPayload() });
  const api = await dispatchHttp(app, { method: "GET", url: "/api/admin/connections", headers: {} });
  assert.equal(api.status, 401);

  const page = await dispatchHttp(app, {
    method: "GET",
    url: "/admin/connect",
    headers: { accept: "text/html" },
  });
  assert.equal(page.status, 303);
  assert.equal(page.headers.location, "/admin/login");
});

test("Payload admin sessions see safe connection status without credential leakage", async () => {
  const payload = providerPayload();
  const app = createHttpApp({
    payloadAdminAuth: payloadAdminAuth(),
    providerConnection: CONFIG,
    providerConnectionPayload: payload,
  });
  const headers = { cookie: `ms_admin=${SESSION_TOKEN}`, host: "ms-realty.example" };

  const page = await dispatchHttp(app, { method: "GET", url: "/admin/connect", headers });
  assert.equal(page.status, 200);
  assert.match(page.body, /MS Realty connections/);
  assert.match(page.body, /owner@example\.com/);
  for (const secret of [
    SESSION_TOKEN,
    CREDENTIAL_SECRET,
    CONFIG.googleClientSecret,
    CONFIG.metaAppSecret,
    CONFIG.metaWebhookVerifyToken,
    "ENCRYPTED_CREDENTIAL_MARKER",
  ]) {
    assert.doesNotMatch(page.body, new RegExp(secret));
  }

  const api = await dispatchHttp(app, { method: "GET", url: "/api/admin/connections", headers });
  assert.equal(api.status, 200);
  assert.equal(api.body.kind, "provider_connections");
  assert.equal(api.body.connections[0].account_label, "owner@example.com");
  assert.equal("credential_envelope" in api.body.connections[0], false);
  assert.equal(JSON.stringify(api.body).includes("ENCRYPTED_CREDENTIAL_MARKER"), false);
});

test("OAuth and provider mutations require a Payload admin session", async () => {
  const payload = providerPayload();
  const metaCode = "meta-embedded-signup-code-that-must-never-leak";
  const metaAccessToken = "meta-access-token-that-must-never-leak";
  const app = createHttpApp({
    payloadAdminAuth: payloadAdminAuth(),
    providerConnection: CONFIG,
    providerConnectionPayload: payload,
    providerFetch: async (input) => {
      const url = String(input);
      let body;
      if (url.endsWith("/pa/get_account_info")) {
        body = { status: 0, id: "viber-account-1", name: "MS Realty Viber", uri: "ms-realty" };
      } else if (url.endsWith("/pa/set_webhook")) {
        body = { status: 0 };
      } else if (url.includes("/oauth/access_token")) {
        body = { access_token: metaAccessToken };
      } else if (url.includes("/111112222233333?fields=")) {
        body = { id: "111112222233333", name: "MS Realty WhatsApp" };
      } else if (url.includes("/444445555566666?fields=")) {
        body = { id: "444445555566666", verified_name: "MS Realty", display_phone_number: "+359879696870" };
      } else if (url.endsWith("/111112222233333/subscribed_apps")) {
        body = { success: true };
      } else {
        throw new Error(`Unexpected provider URL: ${url}`);
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  await withNamedBearer(async () => {
    for (const request of [
      { method: "GET", url: "/api/admin/connections?provider=google&action=start" },
      {
        method: "POST",
        url: "/api/admin/connections",
        headers: { "content-type": "application/json" },
        body: { provider: "viber", token: VIBER_TOKEN },
      },
    ]) {
      const response = await dispatchHttp(app, {
        ...request,
        headers: { ...request.headers, authorization: `Bearer ${BEARER_TOKEN}` },
      });
      assert.equal(response.status, 403);
      assert.equal(response.body.required_capability, "payload_admin_session");
    }
  });

  const sessionHeaders = { cookie: `ms_admin=${SESSION_TOKEN}`, host: "ms-realty.example" };
  const oauth = await dispatchHttp(app, {
    method: "GET",
    url: "/api/admin/connections?provider=google&action=start",
    headers: sessionHeaders,
  });
  assert.equal(oauth.status, 303);
  assert.match(oauth.headers.location, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);

  const mutation = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/connections",
    headers: {
      ...sessionHeaders,
      "content-type": "application/json",
      origin: "https://ms-realty.example",
      "sec-fetch-site": "same-origin",
    },
    body: { provider: "viber", token: VIBER_TOKEN },
  });
  assert.equal(mutation.status, 201);
  assert.equal(mutation.body.connection.provider, "viber");
  assert.equal(mutation.body.connection.status, "connected");
  assert.deepEqual(
    payload.writes.filter((write) => write.provider === "viber").map((write) => write.status),
    ["connecting", "connected"],
  );
  assert.equal(JSON.stringify(mutation.body).includes(VIBER_TOKEN), false);
  assert.equal(JSON.stringify(payload.docs).includes(VIBER_TOKEN), false);

  const whatsapp = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/connections",
    headers: {
      ...sessionHeaders,
      "content-type": "application/json",
      origin: "https://ms-realty.example",
      "sec-fetch-site": "same-origin",
    },
    body: {
      provider: "whatsapp",
      code: metaCode,
      waba_id: "111112222233333",
      phone_number_id: "444445555566666",
    },
  });
  assert.equal(whatsapp.status, 201);
  assert.equal(whatsapp.body.connection.status, "connected");
  assert.deepEqual(
    payload.writes.filter((write) => write.provider === "whatsapp").map((write) => write.status),
    ["connecting", "connected"],
  );
  for (const secret of [metaCode, metaAccessToken]) {
    assert.equal(JSON.stringify(whatsapp.body).includes(secret), false);
    assert.equal(JSON.stringify(payload.docs).includes(secret), false);
  }
});

test("provider webhook registration failures remain connecting and write a secret-free audit row", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-provider-audit-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const auditLogPath = path.join(directory, "audit.sqlite");
  const payload = providerPayload();
  const app = createHttpApp({
    auditLogPath,
    reviewedAt: "2026-08-13T13:00:00.000Z",
    payloadAdminAuth: payloadAdminAuth(),
    providerConnection: CONFIG,
    providerConnectionPayload: payload,
    providerFetch: async (url) =>
      new Response(
        JSON.stringify(
          String(url).endsWith("/pa/get_account_info")
            ? { status: 0, id: "viber-account-1", name: "MS Realty Viber" }
            : { status: 1, status_message: "registration failed" },
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });
  const response = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/connections",
    headers: {
      cookie: `ms_admin=${SESSION_TOKEN}`,
      host: "ms-realty.example",
      origin: "https://ms-realty.example",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
    body: { provider: "viber", token: VIBER_TOKEN },
  });
  assert.equal(response.status, 400);
  assert.deepEqual(
    payload.writes.filter((write) => write.provider === "viber").map((write) => write.status),
    ["connecting"],
  );
  const auditRows = readAuditLog(auditLogPath);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0].action, "provider_connection_failed");
  assert.equal(auditRows[0].object_id, "viber");
  assert.equal(auditRows[0].metadata.phase, "account_or_webhook");
  assert.equal(JSON.stringify(auditRows).includes(VIBER_TOKEN), false);
});
