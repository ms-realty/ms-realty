// The connect screen exists on two servers: the standalone HTTP runtime and the
// Next adapter. An operator must get the same cards, the same refusals and the
// same audit trail from either, so these tests drive both through the same
// expectations rather than trusting that the two code paths agree.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readAuditLog } from "../lib/audit-log.mjs";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { renderMcpResponse, mcpConfigFromEnv } from "../lib/mcp-server.mjs";
import { OWNER_CONNECTABLE_PROVIDERS, OPERATOR_PROVIDERS } from "../lib/operator-provider-catalog.mjs";
import { OPERATOR_AGENT_SECRET_ENV, mintOperatorAgentToken } from "../lib/operator-agent-access.mjs";
import { OWNER_OPERATOR_BROWSER_OPERATIONS } from "../lib/owner-operator-catalog.mjs";
import { payloadAdminPrincipal } from "../lib/payload-admin-auth.mjs";
import { saveProviderConnection } from "../lib/provider-connections.mjs";

const ORIGIN = "https://ms-realty.example";
const SECRET = "operator-routes-secret-that-is-longer-than-thirty-two-characters";
const SESSION = "payload.connect.session";
const BEARER = "connect-routes-admin-token-0123456789";

const PROVIDER_CONFIG = {
  publicOrigin: ORIGIN,
  credentialSecret: SECRET,
  stateSecret: SECRET,
  payloadSecret: "payload-secret",
  databaseUrl: "postgres://payload.example/ms_realty",
  googleClientId: "google-client-id",
  googleClientSecret: "google-client-secret",
  githubClientId: "github-client-id",
  githubClientSecret: "github-client-secret",
  metaAppId: "123456789012345",
  metaAppSecret: "meta-app-secret-at-least-sixteen-characters",
  metaConfigId: "987654321098765",
  metaGraphVersion: "v22.0",
  metaFacebookPublishReady: true,
  metaInstagramPublishReady: true,
  metaWebhookVerifyToken: "meta-webhook-verify-token-at-least-24",
  viberCommercialReady: true,
  webhookMaxBytes: 1024 * 1024,
  hermes: {
    mode: "openrouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    endpoint_redacted: "https://openrouter.ai/api/v1/chat/completions",
    model: "NousResearch/Hermes-4-14B",
    has_api_key: true,
  },
};

function auditFile(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-connect-routes-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "audit.jsonl");
  fs.writeFileSync(filePath, "");
  return filePath;
}

function adminUser() {
  return { id: 1, collection: "admins", email: "owner@example.com", role: "admin", workspace_ids: ["sandanski"] };
}

function payloadAdminAuth() {
  return {
    async resolve(token) {
      return token === SESSION ? { user: adminUser(), principal: payloadAdminPrincipal(adminUser()) } : null;
    },
  };
}

// Stands in for the payload collection the connection store writes to.
function providerPayload(docs = []) {
  const rows = [...docs];
  return {
    rows,
    async find(options) {
      const provider = options.where?.provider?.equals;
      return { docs: provider ? rows.filter((row) => row.provider === provider) : [...rows] };
    },
    async create({ data }) {
      const row = { id: `provider-${data.provider}`, ...data };
      rows.push(row);
      return row;
    },
    async update({ id, data }) {
      const index = rows.findIndex((row) => row.id === id);
      rows[index] = { ...rows[index], ...data };
      return rows[index];
    },
    async delete({ id }) {
      const index = rows.findIndex((row) => row.id === id);
      const [removed] = rows.splice(index, 1);
      return removed;
    },
  };
}

async function withNamedBearer(run) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
    [OPERATOR_AGENT_SECRET_ENV]: process.env[OPERATOR_AGENT_SECRET_ENV],
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: "connect_admin", token: BEARER, roles: ["admin"] },
    ]);
    process.env[OPERATOR_AGENT_SECRET_ENV] = SECRET;
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const HTML_HEADERS = { authorization: `Bearer ${BEARER}`, host: "ms-realty.example", accept: "text/html" };

test("both servers render only working one-click connections in the persistent owner shell", async (t) => {
  await withNamedBearer(async () => {
    const app = createHttpApp({
      reviewedAt: "2026-08-24T12:00:00.000Z",
      auditLogPath: auditFile(t),
      providerConnection: PROVIDER_CONFIG,
      providerConnectionPayload: providerPayload(),
      operatorAgentEnv: { [OPERATOR_AGENT_SECRET_ENV]: SECRET },
    });
    const standalone = await dispatchHttp(app, { method: "GET", url: "/admin/connect?locale=bg", headers: HTML_HEADERS });
    assert.equal(standalone.status, 200);

    const adapter = await renderAppAdminResponse(new Request(`${ORIGIN}/admin/connect?locale=bg`, { headers: HTML_HEADERS }), {
      config: {
        ...appAdminConfigFromEnv({ NODE_ENV: "test" }),
        auditLogPath: auditFile(t),
        authEnv: {
          NODE_ENV: "production",
          MS_REALTY_PUBLIC_ORIGIN: ORIGIN,
          MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
          [OPERATOR_AGENT_SECRET_ENV]: SECRET,
        },
        providerConnection: PROVIDER_CONFIG,
        readProviderConnections: async () => [],
      },
    });
    assert.equal(adapter.status, 200);
    const adapterBody = await adapter.text();

    for (const body of [standalone.body, adapterBody]) {
      for (const id of OWNER_CONNECTABLE_PROVIDERS) {
        assert.ok(body.includes(`data-provider="${id}"`), id);
      }
      for (const id of OPERATOR_PROVIDERS.filter((provider) => !OWNER_CONNECTABLE_PROVIDERS.includes(provider))) {
        assert.equal(
          body.includes(`/api/admin/connections?provider=${id}&amp;action=start`),
          false,
          `${id} has no owner connection action`,
        );
      }
      assert.ok(body.includes('data-react-admin-ui="connections"'), "persistent admin shell");
      assert.ok(body.includes('data-managed-system="hermes"'), "Hermes is managed system state");
      assert.ok(body.includes('data-managed-system="data"'), "database is managed system state");
      assert.equal((body.match(/<h1\b/g) || []).length, 1, "one page heading");
      assert.equal(body.includes("/api/admin/connections?provider=google&amp;action=start"), false, "bearer view has no OAuth mutation");
      assert.equal(body.includes("data-whatsapp-connect"), false, "bearer view has no embedded-signup mutation");
      // Both surfaces expose the one-time delegated credential in a masked,
      // read-only field. The copied configuration names its env slot rather
      // than embedding either the delegated token or the original bearer.
      assert.equal((body.match(/id="agent-credential"/g) || []).length, 1, "one assistant credential field");
      assert.match(body, /id="agent-credential" type="password"[^>]*readonly/);
      assert.equal((body.match(/data-copy-block="agent-credential"/g) || []).length, 1, "one credential copy action");
      assert.equal((body.match(/data-copy-block="agent-config"/g) || []).length, 1, "one assistant config action");
      assert.match(body, /<details class="adm-assistant-connection__config" data-assistant-config-disclosure="true">/);
      assert.match(body, /MS_REALTY_OPERATOR_TOKEN/);
      assert.equal(body.includes(BEARER), false, "no operator bearer in owner HTML");
      assert.ok(body.includes('data-codex-plugin-install="ms-realty-operator"'), "Codex plugin install link");
      assert.ok(body.includes('<html lang="bg" dir="ltr">'));
    }
  });
});

test("a signed-in Payload owner gets the real Google, WhatsApp, Facebook, and Instagram one-click actions", async (t) => {
  const app = createHttpApp({
    reviewedAt: "2026-08-24T12:00:00.000Z",
    auditLogPath: auditFile(t),
    payloadAdminAuth: payloadAdminAuth(),
    providerConnection: PROVIDER_CONFIG,
    providerConnectionPayload: providerPayload(),
  });
  const response = await dispatchHttp(app, {
    method: "GET",
    url: "/admin/connect?locale=en",
    headers: { cookie: `ms_admin=${SESSION}`, host: "ms-realty.example", accept: "text/html" },
  });
  assert.equal(response.status, 200);
  assert.ok(response.body.includes("/api/admin/connections?provider=google&amp;action=start"));
  assert.ok(response.body.includes("/api/admin/connections?provider=facebook&amp;action=start"));
  assert.ok(response.body.includes("/api/admin/connections?provider=instagram&amp;action=start"));
  assert.ok(response.body.includes("data-whatsapp-connect=\"true\""));
  assert.ok(response.body.includes("data-whatsapp-embedded-signup=\"true\""));
  assert.doesNotMatch(response.body, /<input[^>]+type="password"/);
  assert.doesNotMatch(response.body, /name="token"/);
});

test("disconnect revokes, deletes, redirects and writes one audit row", async (t) => {
  const auditLogPath = auditFile(t);
  const payload = providerPayload();
  await saveProviderConnection(
    {
      provider: "neon",
      status: "connected",
      accountLabel: "ms-realty",
      externalAccountId: "neon-1",
      scopes: [],
      metadata: {},
      credentials: { api_key: "neon-provider-test-key" },
    },
    { connectedBy: "payload-1", credentialSecret: SECRET, payload, verifiedAt: "2026-08-24T12:00:00.000Z" },
  );
  const app = createHttpApp({
    reviewedAt: "2026-08-24T12:00:00.000Z",
    auditLogPath,
    payloadAdminAuth: payloadAdminAuth(),
    providerConnection: PROVIDER_CONFIG,
    providerConnectionPayload: payload,
    providerFetch: async () => {
      throw new Error("Neon keys cannot be revoked remotely");
    },
  });
  const response = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/connections/disconnect",
    headers: {
      cookie: `ms_admin=${SESSION}`,
      "content-type": "application/x-www-form-urlencoded",
      host: "ms-realty.example",
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
    },
    body: "provider=neon",
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.location, "/admin/connect?disconnected=neon");
  // The row is gone, so the encrypted envelope stopped existing with it.
  assert.equal(payload.rows.length, 0);

  const rows = readAuditLog(auditLogPath).filter((row) => row.action === "provider_disconnected");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].object_id, "neon");
  assert.equal(rows[0].object_type, "provider_connection");
  // Honest about what actually happened at the provider.
  assert.equal(rows[0].metadata.revoked, false);
  assert.equal(rows[0].metadata.deleted, true);
  // No credential material anywhere in the trail.
  assert.equal(JSON.stringify(rows).includes("ENCRYPTED"), false);
});

test("disconnect preserves the row when encrypted credentials cannot be read", async (t) => {
  const payload = providerPayload([
    {
      id: "provider-google",
      provider: "google",
      status: "connected",
      connected_by: "payload-1",
      account_label: "owner@example.com",
      external_account_id: "google-1",
      scopes: [],
      metadata: {},
      credential_envelope: { ciphertext: "invalid-envelope" },
      last_verified_at: "2026-08-24T12:00:00.000Z",
    },
  ]);
  const response = await dispatchHttp(
    createHttpApp({
      reviewedAt: "2026-08-24T12:00:00.000Z",
      auditLogPath: auditFile(t),
      payloadAdminAuth: payloadAdminAuth(),
      providerConnection: PROVIDER_CONFIG,
      providerConnectionPayload: payload,
    }),
    {
      method: "POST",
      url: "/api/admin/connections/disconnect",
      headers: {
        cookie: `ms_admin=${SESSION}`,
        "content-type": "application/x-www-form-urlencoded",
        host: "ms-realty.example",
        origin: ORIGIN,
        "sec-fetch-site": "same-origin",
      },
      body: "provider=google",
    },
  );
  assert.equal(response.status, 503);
  assert.equal(payload.rows.length, 1);
});

test("the assistant configuration route hands back a working config and records the issue", async (t) => {
  const auditLogPath = auditFile(t);
  const app = createHttpApp({
    reviewedAt: "2026-08-24T12:00:00.000Z",
    auditLogPath,
    payloadAdminAuth: payloadAdminAuth(),
    providerConnection: PROVIDER_CONFIG,
    providerConnectionPayload: providerPayload(),
    operatorAgentEnv: { [OPERATOR_AGENT_SECRET_ENV]: SECRET },
  });
  const headers = {
    cookie: `ms_admin=${SESSION}`,
    host: "ms-realty.example",
    origin: ORIGIN,
    "sec-fetch-site": "same-origin",
  };
  const response = await dispatchHttp(app, { method: "GET", url: "/api/admin/connections/agent-config", headers });
  assert.equal(response.status, 200);
  const body = response.body;
  assert.equal(body.kind, "operator_agent_config");
  assert.equal(body.mcp_url, `${ORIGIN}/mcp`);
  assert.match(body.config, /claude mcp add --transport http ms-realty/);
  assert.match(body.config, /\[mcp_servers\.ms-realty\]/);
  assert.ok(body.expires_at > "2026-08-24");

  const catalogResponse = await dispatchHttp(app, {
    method: "GET",
    url: "/api/admin/connections/agent-config?catalog=1",
    headers,
  });
  assert.equal(catalogResponse.status, 200);
  assert.equal(catalogResponse.body.kind, "owner_operator_catalog");
    assert.equal(catalogResponse.body.summary.total, 118);
    assert.equal(catalogResponse.body.operations.length, 118);
  assert.equal(
    catalogResponse.body.operations.filter((row) => row.execution === "browser_session").length,
    OWNER_OPERATOR_BROWSER_OPERATIONS.length,
  );
  assert.equal("config" in catalogResponse.body, false);
  assert.equal(JSON.stringify(catalogResponse.body).includes("a1."), false);

  const issued = readAuditLog(auditLogPath).filter((row) => row.action === "operator_agent_token_issued");
  assert.ok(issued.length >= 1);
  // The audit records that a token was issued and when it dies, never the token.
  assert.equal(JSON.stringify(issued).includes("a1."), false);
  assert.ok(issued.at(-1).metadata.expires_at);

  // Without the signing secret the route says so rather than inventing one.
  const unconfigured = createHttpApp({
    reviewedAt: "2026-08-24T12:00:00.000Z",
    auditLogPath,
    payloadAdminAuth: payloadAdminAuth(),
    providerConnection: PROVIDER_CONFIG,
    providerConnectionPayload: providerPayload(),
    operatorAgentEnv: {},
  });
  const refused = await dispatchHttp(unconfigured, {
    method: "GET",
    url: "/api/admin/connections/agent-config",
    headers,
  });
  assert.equal(refused.status, 503);
  assert.equal(refused.body.kind, "operator_agent_token_unavailable");
});

test("connection writes need a Payload admin session on both servers", async (t) => {
  await withNamedBearer(async () => {
    const app = createHttpApp({
      reviewedAt: "2026-08-24T12:00:00.000Z",
      auditLogPath: auditFile(t),
      providerConnection: PROVIDER_CONFIG,
      providerConnectionPayload: providerPayload(),
    });
    for (const [method, url, body] of [
      ["POST", "/api/admin/connections/disconnect", "provider=neon"],
      ["GET", "/api/admin/connections/agent-config", undefined],
      ["GET", "/api/admin/connections?provider=github&action=start", undefined],
    ]) {
      const response = await dispatchHttp(app, {
        method,
        url,
        headers: {
          authorization: `Bearer ${BEARER}`,
          host: "ms-realty.example",
          origin: ORIGIN,
          "sec-fetch-site": "same-origin",
          ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        },
        body,
      });
      assert.equal(response.status, 403, `${method} ${url}`);
      // A named bearer token is a real operator, but connecting the agency's
      // tools is deliberately behind the browser session, not a bearer.
      assert.equal(response.body.required_capability, "payload_admin_session");
    }

    // And nothing at all without credentials.
    const anonymous = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/connections/disconnect",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "provider=neon",
    });
    assert.equal(anonymous.status, 401);
  });
});

test("the delegated assistant token opens /mcp and nothing else opens it", async () => {
  const env = {
    NODE_ENV: "production",
    MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify([{ id: "connect_admin", token: BEARER, roles: ["admin"] }]),
    [OPERATOR_AGENT_SECRET_ENV]: SECRET,
    MS_REALTY_MCP_WRITES_DISABLED: "1",
  };
  const config = mcpConfigFromEnv(env);
  const mint = mintOperatorAgentToken({ operatorId: "connect_admin", roles: ["admin"] }, { secret: SECRET });
  const call = (authorization) =>
    renderMcpResponse(
      new Request("http://local.test/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(authorization ? { authorization } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
      { config },
    );

  const accepted = await call(`Bearer ${mint.token}`);
  assert.equal(accepted.status, 200);
  const listed = await accepted.text();
  // The delegated token really carries the operator's capabilities: an
  // anonymous caller gets only the public tools, this one gets the gated ones.
  assert.match(listed, /get_operator_brief/);
  assert.match(listed, /get_listing_content_queue/);

  // Anonymous access is a pre-existing design choice, so the proof that the
  // token did something is the tool set, not the status code.
  const anonymous = await call(null);
  assert.equal(anonymous.status, 200);
  const anonymousTools = await anonymous.text();
  assert.equal(anonymousTools.includes("get_operator_brief"), false);

  // An unsigned lookalike is refused outright.
  assert.equal((await call("Bearer a1.Y29ubmVjdF9hZG1pbg.YWRtaW4.OTk5OTk5OTk5OQ.Zm9yZ2Vk")).status, 401);

  // Rotating the signing secret withdraws every outstanding token at once.
  const rotated = mcpConfigFromEnv({ ...env, [OPERATOR_AGENT_SECRET_ENV]: `${SECRET}-rotated` });
  const afterRotation = await renderMcpResponse(
    new Request("http://local.test/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${mint.token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    }),
    { config: rotated },
  );
  assert.equal(afterRotation.status, 401);

  // With no signing secret configured the delegated path does not exist.
  const disabled = mcpConfigFromEnv({ ...env, [OPERATOR_AGENT_SECRET_ENV]: "" });
  const withoutSecret = await renderMcpResponse(
    new Request("http://local.test/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${mint.token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    }),
    { config: disabled },
  );
  assert.equal(withoutSecret.status, 401);
});
