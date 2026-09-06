// The connect screen exists on two servers: the standalone HTTP runtime and the
// Next adapter. An operator must get the same cards, the same refusals and the
// same audit trail from either, so these tests drive both through the same
// expectations rather than trusting that the two code paths agree.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readAuditLog } from "../lib/audit-log.mjs";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { renderMcpResponse, mcpConfigFromEnv } from "../lib/mcp-server.mjs";
import { OWNER_CONNECTABLE_PROVIDERS, OPERATOR_PROVIDERS } from "../lib/operator-provider-catalog.mjs";
import { OPERATOR_AGENT_SECRET_ENV, mintOperatorAgentToken } from "../lib/operator-agent-access.mjs";
import { ADMIN_ROUTE_COVERAGE, OWNER_OPERATOR_BROWSER_OPERATIONS } from "../lib/owner-operator-catalog.mjs";
import { payloadAdminPrincipal } from "../lib/payload-admin-auth.mjs";
import { readProviderCredentials, saveProviderConnection } from "../lib/provider-connections.mjs";

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
  return { id: 1, collection: "admins", email: "owner@example.com", role: "admin", workspace_ids: [] };
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
    const standaloneAudit = auditFile(t);
    const adapterAudit = auditFile(t);
    const app = createHttpApp({
      reviewedAt: "2026-08-24T12:00:00.000Z",
      auditLogPath: standaloneAudit,
      providerConnection: PROVIDER_CONFIG,
      providerConnectionPayload: providerPayload(),
      operatorAgentEnv: { [OPERATOR_AGENT_SECRET_ENV]: SECRET },
    });
    const standalone = await dispatchHttp(app, { method: "GET", url: "/admin/connect?locale=bg", headers: HTML_HEADERS });
    assert.equal(standalone.status, 200);

    const adapter = await renderAppAdminResponse(new Request(`${ORIGIN}/admin/connect?locale=bg`, { headers: HTML_HEADERS }), {
      config: {
        ...appAdminConfigFromEnv({ NODE_ENV: "test" }),
        auditLogPath: adapterAudit,
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
      // GET only renders the handoff. It must not mint or audit a delegated
      // credential; issuance is an explicit owner POST below.
      assert.equal((body.match(/id="agent-credential"/g) || []).length, 0, "GET does not mint a credential");
      assert.equal((body.match(/data-copy-block="agent-credential"/g) || []).length, 0, "GET has no credential copy action");
      assert.equal((body.match(/data-copy-block="agent-config"/g) || []).length, 1, "GET may copy the token-free bootstrap config");
      assert.match(body, /<details class="adm-assistant-connection__config" data-assistant-config-disclosure="true">/);
      assert.match(body, /MS_REALTY_OPERATOR_TOKEN/);
      assert.equal(body.includes(BEARER), false, "no operator bearer in owner HTML");
      assert.ok(body.includes('data-codex-plugin-install="ms-realty-operator"'), "Codex plugin install link");
      assert.ok(body.includes('<html lang="bg" dir="ltr">'));
    }
    for (const auditPath of [standaloneAudit, adapterAudit]) {
      assert.equal(readAuditLog(auditPath).filter((row) => row.action === "operator_agent_token_issued").length, 0);
    }
  });
});

test("a signed-in Payload owner gets five one-click actions and no raw OpenRouter form", async (t) => {
  const auditLogPath = auditFile(t);
  const app = createHttpApp({
    reviewedAt: "2026-08-24T12:00:00.000Z",
    auditLogPath,
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
  assert.ok(response.body.includes("/api/admin/connections?provider=ai&amp;action=start"));
  assert.ok(response.body.includes("data-whatsapp-connect=\"true\""));
  assert.ok(response.body.includes("data-whatsapp-embedded-signup=\"true\""));
  assert.equal(
    (response.body.match(/(?:\/api\/admin\/connections\?provider=(?:google|facebook|instagram|ai)&amp;action=start|data-whatsapp-connect="true")/g) || []).length,
    5,
  );
  assert.equal((response.body.match(/<input\b/g) || []).length, 0);
  assert.doesNotMatch(response.body, /data-provider-credential-form/);
  assert.doesNotMatch(response.body, /name="(?:api_key|token)"/);
  assert.doesNotMatch(response.body, /name="token"/);
  assert.equal(readAuditLog(auditLogPath).filter((row) => row.action === "operator_agent_token_issued").length, 0);
});

test("the owner page GET does not issue a credential, while explicit POST does", async (t) => {
  const standaloneAudit = auditFile(t);
  const standalone = createHttpApp({
    reviewedAt: "2026-08-29T12:00:00.000Z",
    auditLogPath: standaloneAudit,
    payloadAdminAuth: payloadAdminAuth(),
    providerConnection: PROVIDER_CONFIG,
    providerConnectionPayload: providerPayload(),
    operatorAgentEnv: { [OPERATOR_AGENT_SECRET_ENV]: SECRET },
  });
  const pageHeaders = { cookie: `ms_admin=${SESSION}`, host: "ms-realty.example", accept: "text/html" };
  const get = await dispatchHttp(standalone, { method: "GET", url: "/admin/connect?locale=en", headers: pageHeaders });
  assert.equal(get.status, 200);
  assert.equal((get.body.match(/id="agent-credential"/g) || []).length, 0);
  assert.equal(readAuditLog(standaloneAudit).filter((row) => row.action === "operator_agent_token_issued").length, 0);
  const post = await dispatchHttp(standalone, {
    method: "POST",
    url: "/admin/connect?locale=en",
    headers: {
      ...pageHeaders,
      "content-type": "application/x-www-form-urlencoded",
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
    },
    body: "action=issue_agent_credential",
  });
  assert.equal(post.status, 200);
  assert.match(post.body, /id="agent-credential" type="password"[^>]*readonly/);
  const standaloneIssued = readAuditLog(standaloneAudit).filter((row) => row.action === "operator_agent_token_issued");
  assert.equal(standaloneIssued.length, 1);
  assert.equal(standaloneIssued[0].object_id, "payload-1");
  assert.equal(JSON.stringify(standaloneIssued).includes("a1."), false);

  const adapterAudit = auditFile(t);
  const adapter = await renderAppAdminResponse(new Request(`${ORIGIN}/admin/connect?locale=en`, { headers: pageHeaders }), {
    config: {
      ...appAdminConfigFromEnv({ NODE_ENV: "test", MS_REALTY_PUBLIC_ORIGIN: ORIGIN }),
      reviewedAt: "2026-08-29T12:00:00.000Z",
      auditLogPath: adapterAudit,
      authEnv: { NODE_ENV: "production", MS_REALTY_PUBLIC_ORIGIN: ORIGIN, [OPERATOR_AGENT_SECRET_ENV]: SECRET },
      payloadAdminAuth: payloadAdminAuth(),
      providerConnection: PROVIDER_CONFIG,
      providerConnectionPayload: providerPayload(),
    },
  });
  assert.equal(adapter.status, 200);
  assert.equal((await adapter.text()).match(/id="agent-credential"/g)?.length || 0, 0);
  assert.equal(readAuditLog(adapterAudit).filter((row) => row.action === "operator_agent_token_issued").length, 0);
  const adapterPost = await renderAppAdminResponse(
    new Request(`${ORIGIN}/admin/connect?locale=en`, {
      method: "POST",
      headers: {
        ...pageHeaders,
        "content-type": "application/x-www-form-urlencoded",
        origin: ORIGIN,
        "sec-fetch-site": "same-origin",
      },
      body: "action=issue_agent_credential",
    }),
    {
      config: {
        ...appAdminConfigFromEnv({ NODE_ENV: "test", MS_REALTY_PUBLIC_ORIGIN: ORIGIN }),
        reviewedAt: "2026-08-29T12:00:00.000Z",
        auditLogPath: adapterAudit,
        authEnv: { NODE_ENV: "production", MS_REALTY_PUBLIC_ORIGIN: ORIGIN, [OPERATOR_AGENT_SECRET_ENV]: SECRET },
        payloadAdminAuth: payloadAdminAuth(),
        providerConnection: PROVIDER_CONFIG,
        providerConnectionPayload: providerPayload(),
      },
    },
  );
  assert.equal(adapterPost.status, 200);
  assert.match(await adapterPost.text(), /id="agent-credential" type="password"[^>]*readonly/);
  const adapterIssued = readAuditLog(adapterAudit).filter((row) => row.action === "operator_agent_token_issued");
  assert.equal(adapterIssued.length, 1);
  assert.equal(adapterIssued[0].object_id, "payload-1");
  assert.equal(JSON.stringify(adapterIssued).includes("a1."), false);
});

test("both owner runtimes complete OpenRouter PKCE and verify one token before storage", async (t) => {
  const apiKey = "sk-or-v1-route-secret-never-rendered";
  const model = "NousResearch/Hermes-4-14B";
  const fetchCalls = [];
  const providerFetch = async (url, init = {}) => {
    const requestUrl = String(url);
    fetchCalls.push({
      url: requestUrl,
      method: init.method,
      authorization: init.headers?.authorization || "",
      body: init.body ? JSON.parse(init.body) : null,
    });
    if (requestUrl === "https://openrouter.ai/api/v1/auth/keys") {
      return new Response(JSON.stringify({ key: apiKey, user_id: "openrouter-user" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (requestUrl === "https://openrouter.ai/api/v1/chat/completions") {
      return new Response(JSON.stringify({ id: "generation-test", choices: [{ message: { content: "OK" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unstubbed OpenRouter fetch: ${requestUrl}`);
  };
  const sessionHeaders = { cookie: `ms_admin=${SESSION}`, host: "ms-realty.example" };

  const standalonePayload = providerPayload();
  const standaloneAudit = auditFile(t);
  const standaloneApp = createHttpApp({
    reviewedAt: "2026-08-29T12:00:00.000Z",
    auditLogPath: standaloneAudit,
    payloadAdminAuth: payloadAdminAuth(),
    providerConnection: PROVIDER_CONFIG,
    providerConnectionPayload: standalonePayload,
    providerFetch,
  });
  const standaloneStart = await dispatchHttp(standaloneApp, {
    method: "GET",
    url: "/api/admin/connections?provider=ai&action=start",
    headers: sessionHeaders,
  });
  assert.equal(standaloneStart.status, 303);
  const standaloneAuthorization = new URL(standaloneStart.headers.location);
  assert.equal(standaloneAuthorization.origin + standaloneAuthorization.pathname, "https://openrouter.ai/auth");
  assert.equal(standaloneAuthorization.searchParams.get("code_challenge_method"), "S256");
  const standaloneSetCookie = standaloneStart.headers["set-cookie"];
  assert.match(standaloneSetCookie, /^__Host-ms_realty_openrouter_pkce=/);
  assert.match(standaloneSetCookie, /Max-Age=600/);
  assert.match(standaloneSetCookie, /HttpOnly/);
  assert.match(standaloneSetCookie, /Secure/);
  assert.match(standaloneSetCookie, /SameSite=Lax/);
  const standaloneCookiePair = standaloneSetCookie.split(";", 1)[0];
  const standalonePkce = JSON.parse(
    Buffer.from(standaloneCookiePair.slice(standaloneCookiePair.indexOf("=") + 1), "base64url").toString("utf8"),
  );
  assert.equal(
    standaloneAuthorization.searchParams.get("code_challenge"),
    createHash("sha256").update(standalonePkce.verifier).digest("base64url"),
  );
  const standaloneCallback = new URL(standaloneAuthorization.searchParams.get("callback_url"));
  assert.equal(standaloneCallback.searchParams.get("provider"), "ai");
  assert.equal(standaloneCallback.searchParams.get("action"), "callback");
  assert.equal(standaloneCallback.searchParams.get("state"), standalonePkce.state);
  standaloneCallback.searchParams.set("code", "openrouter-code");
  const standaloneCallbackResponse = await dispatchHttp(standaloneApp, {
    method: "GET",
    url: `${standaloneCallback.pathname}${standaloneCallback.search}`,
    headers: { ...sessionHeaders, cookie: `${sessionHeaders.cookie}; ${standaloneCookiePair}` },
  });
  assert.equal(standaloneCallbackResponse.status, 303);
  assert.equal(standaloneCallbackResponse.headers.location, "/admin/connect?connected=ai");
  assert.match(standaloneCallbackResponse.headers["set-cookie"], /Max-Age=0/);
  assert.equal(JSON.stringify(standaloneCallbackResponse).includes(apiKey), false);
  assert.equal(JSON.stringify(standalonePayload.rows).includes(apiKey), false);
  assert.deepEqual(await readProviderCredentials("ai", { credentialSecret: SECRET, payload: standalonePayload }), {
    api_key: apiKey,
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model,
  });

  const adapterPayload = providerPayload();
  const adapterAudit = auditFile(t);
  const adapterConfig = {
    ...appAdminConfigFromEnv({ NODE_ENV: "test", MS_REALTY_PUBLIC_ORIGIN: ORIGIN }),
    reviewedAt: "2026-08-29T12:00:00.000Z",
    auditLogPath: adapterAudit,
    payloadAdminAuth: payloadAdminAuth(),
    providerConnection: PROVIDER_CONFIG,
    providerConnectionPayload: adapterPayload,
    providerFetch,
  };
  const adapterStart = await renderAppAdminResponse(
    new Request(`${ORIGIN}/api/admin/connections?provider=ai&action=start`, { headers: sessionHeaders }),
    { config: adapterConfig },
  );
  assert.equal(adapterStart.status, 303);
  const adapterAuthorization = new URL(adapterStart.headers.get("location"));
  assert.equal(adapterAuthorization.origin + adapterAuthorization.pathname, "https://openrouter.ai/auth");
  assert.equal(adapterAuthorization.searchParams.get("code_challenge_method"), "S256");
  const adapterSetCookie = adapterStart.headers.get("set-cookie");
  assert.match(adapterSetCookie, /^__Host-ms_realty_openrouter_pkce=/);
  assert.match(adapterSetCookie, /Max-Age=600/);
  const adapterCookiePair = adapterSetCookie.split(";", 1)[0];
  const adapterPkce = JSON.parse(
    Buffer.from(adapterCookiePair.slice(adapterCookiePair.indexOf("=") + 1), "base64url").toString("utf8"),
  );
  assert.equal(
    adapterAuthorization.searchParams.get("code_challenge"),
    createHash("sha256").update(adapterPkce.verifier).digest("base64url"),
  );
  const adapterCallback = new URL(adapterAuthorization.searchParams.get("callback_url"));
  assert.equal(adapterCallback.searchParams.get("state"), adapterPkce.state);
  adapterCallback.searchParams.set("code", "openrouter-code");
  const adapterCallbackResponse = await renderAppAdminResponse(
    new Request(`${ORIGIN}${adapterCallback.pathname}${adapterCallback.search}`, {
      headers: { ...sessionHeaders, cookie: `${sessionHeaders.cookie}; ${adapterCookiePair}` },
    }),
    { config: adapterConfig },
  );
  assert.equal(adapterCallbackResponse.status, 303);
  assert.equal(adapterCallbackResponse.headers.get("location"), "/admin/connect?connected=ai");
  assert.match(adapterCallbackResponse.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await adapterCallbackResponse.clone().text()).includes(apiKey), false);
  assert.equal(JSON.stringify(adapterPayload.rows).includes(apiKey), false);
  assert.deepEqual(await readProviderCredentials("ai", { credentialSecret: SECRET, payload: adapterPayload }), {
    api_key: apiKey,
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model,
  });

  assert.equal(fetchCalls.length, 4);
  for (const [auth, completion, pkce] of [
    [fetchCalls[0], fetchCalls[1], standalonePkce],
    [fetchCalls[2], fetchCalls[3], adapterPkce],
  ]) {
    assert.equal(auth.url, "https://openrouter.ai/api/v1/auth/keys");
    assert.equal(auth.method, "POST");
    assert.deepEqual(auth.body, {
      code: "openrouter-code",
      code_verifier: pkce.verifier,
      code_challenge_method: "S256",
    });
    assert.equal(completion.url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(completion.method, "POST");
    assert.equal(completion.authorization, `Bearer ${apiKey}`);
    assert.deepEqual(completion.body, {
      model,
      messages: [{ role: "user", content: "Reply with OK." }],
      max_tokens: 1,
      temperature: 0,
      stream: false,
    });
  }
  for (const auditPath of [standaloneAudit, adapterAudit]) {
    const rows = readAuditLog(auditPath).filter((row) => row.action === "provider_connected");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].object_id, "ai");
    assert.equal(rows[0].metadata.external_account_id, "openrouter-user");
    assert.equal(JSON.stringify(rows).includes(apiKey), false);
  }
});

test("raw OpenRouter API-key POST is rejected by both owner runtimes", async (t) => {
  const apiKey = "sk-or-v1-raw-post-must-never-be-used";
  const body = new URLSearchParams({
    provider: "ai",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model: "NousResearch/Hermes-4-14B",
    api_key: apiKey,
  }).toString();
  const fetchCalls = [];
  const providerFetch = async (...args) => {
    fetchCalls.push(args);
    throw new Error("raw AI POST must not reach a provider");
  };
  const headers = {
    cookie: `ms_admin=${SESSION}`,
    "content-type": "application/x-www-form-urlencoded",
    host: "ms-realty.example",
    origin: ORIGIN,
    "sec-fetch-site": "same-origin",
  };
  const standalonePayload = providerPayload();
  const standaloneAudit = auditFile(t);
  const standalone = await dispatchHttp(
    createHttpApp({
      reviewedAt: "2026-08-29T12:00:00.000Z",
      auditLogPath: standaloneAudit,
      payloadAdminAuth: payloadAdminAuth(),
      providerConnection: PROVIDER_CONFIG,
      providerConnectionPayload: standalonePayload,
      providerFetch,
    }),
    { method: "POST", url: "/api/admin/connections", headers, body },
  );
  assert.equal(standalone.status, 303);
  assert.equal(standalone.headers.location, "/admin/connect?error=ai");
  assert.equal(standalonePayload.rows.length, 0);

  const adapterPayload = providerPayload();
  const adapterAudit = auditFile(t);
  const adapter = await renderAppAdminResponse(
    new Request(`${ORIGIN}/api/admin/connections`, { method: "POST", headers, body }),
    {
      config: {
        ...appAdminConfigFromEnv({ NODE_ENV: "test", MS_REALTY_PUBLIC_ORIGIN: ORIGIN }),
        reviewedAt: "2026-08-29T12:00:00.000Z",
        auditLogPath: adapterAudit,
        payloadAdminAuth: payloadAdminAuth(),
        providerConnection: PROVIDER_CONFIG,
        providerConnectionPayload: adapterPayload,
        providerFetch,
      },
    },
  );
  assert.equal(adapter.status, 303);
  assert.equal(adapter.headers.get("location"), "/admin/connect?error=ai");
  assert.equal(adapterPayload.rows.length, 0);
  assert.equal(fetchCalls.length, 0);
  for (const auditPath of [standaloneAudit, adapterAudit]) {
    const failures = readAuditLog(auditPath).filter((row) => row.action === "provider_connection_failed");
    assert.equal(failures.length, 1);
    assert.equal(failures[0].object_id, "ai");
    assert.equal(failures[0].metadata.phase, "token_verification");
    assert.equal(JSON.stringify(failures).includes(apiKey), false);
  }
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

test("agent config GET is catalog-only while POST explicitly issues and audits", async (t) => {
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
  const unsupportedGet = await dispatchHttp(app, { method: "GET", url: "/api/admin/connections/agent-config", headers });
  assert.equal(unsupportedGet.status, 405);
  assert.equal(unsupportedGet.body.kind, "method_not_allowed");
  assert.equal(readAuditLog(auditLogPath).filter((row) => row.action === "operator_agent_token_issued").length, 0);

  const catalogResponse = await dispatchHttp(app, {
    method: "GET",
    url: "/api/admin/connections/agent-config?catalog=1",
    headers,
  });
  assert.equal(catalogResponse.status, 200);
  assert.equal(catalogResponse.body.kind, "owner_operator_catalog");
  // The catalog response has to be the catalog: every operation, named, with
  // none quietly dropped. A pasted total said nothing about which ones came
  // back, and had to be edited by whoever added the next admin route.
  // This operator is a full admin, so the catalog they get back is every admin
  // route, named. A pasted total said nothing about which ones came back, and
  // had to be edited by whoever added the next admin route.
  assert.equal(catalogResponse.body.summary.total, ADMIN_ROUTE_COVERAGE.length);
  assert.deepEqual(
    catalogResponse.body.operations.map((row) => row.operation).sort(),
    ADMIN_ROUTE_COVERAGE.map((row) => row.operation).sort(),
  );
  assert.equal(
    catalogResponse.body.operations.filter((row) => row.execution === "browser_session").length,
    OWNER_OPERATOR_BROWSER_OPERATIONS.length,
  );
  assert.equal("config" in catalogResponse.body, false);
  assert.equal(JSON.stringify(catalogResponse.body).includes("a1."), false);
  assert.equal(readAuditLog(auditLogPath).filter((row) => row.action === "operator_agent_token_issued").length, 0);

  const response = await dispatchHttp(app, { method: "POST", url: "/api/admin/connections/agent-config", headers });
  assert.equal(response.status, 200);
  const body = response.body;
  assert.equal(body.kind, "operator_agent_config");
  assert.equal(body.mcp_url, `${ORIGIN}/mcp`);
  assert.match(body.config, /claude mcp add --transport http ms-realty/);
  assert.match(body.config, /\[mcp_servers\.ms-realty\]/);
  assert.ok(body.expires_at > "2026-08-24");
  assert.match(body.credential, /^a1\./);

  const issued = readAuditLog(auditLogPath).filter((row) => row.action === "operator_agent_token_issued");
  assert.equal(issued.length, 1);
  // The audit records that a token was issued and when it dies, never the token.
  assert.equal(JSON.stringify(issued).includes("a1."), false);
  assert.ok(issued.at(-1).metadata.expires_at);

  const adapterAudit = auditFile(t);
  const adapterConfig = {
    ...appAdminConfigFromEnv({ NODE_ENV: "test", MS_REALTY_PUBLIC_ORIGIN: ORIGIN }),
    reviewedAt: "2026-08-24T12:00:00.000Z",
    auditLogPath: adapterAudit,
    authEnv: { NODE_ENV: "production", MS_REALTY_PUBLIC_ORIGIN: ORIGIN, [OPERATOR_AGENT_SECRET_ENV]: SECRET },
    payloadAdminAuth: payloadAdminAuth(),
    providerConnection: PROVIDER_CONFIG,
    providerConnectionPayload: providerPayload(),
  };
  const adapterGet = await renderAppAdminResponse(
    new Request(`${ORIGIN}/api/admin/connections/agent-config`, { headers }),
    { config: adapterConfig },
  );
  assert.equal(adapterGet.status, 405);
  assert.equal((await adapterGet.json()).kind, "method_not_allowed");
  assert.equal(readAuditLog(adapterAudit).filter((row) => row.action === "operator_agent_token_issued").length, 0);
  const adapterCatalog = await renderAppAdminResponse(
    new Request(`${ORIGIN}/api/admin/connections/agent-config?catalog=1`, { headers }),
    { config: adapterConfig },
  );
  assert.equal(adapterCatalog.status, 200);
  const adapterCatalogBody = await adapterCatalog.json();
  assert.equal(adapterCatalogBody.kind, "owner_operator_catalog");
  // Both servers answer with the same catalog, so both are checked against the
  // same source rather than against a number typed twice.
  assert.equal(adapterCatalogBody.summary.total, ADMIN_ROUTE_COVERAGE.length);
  assert.deepEqual(
    adapterCatalogBody.operations.map((row) => row.operation).sort(),
    ADMIN_ROUTE_COVERAGE.map((row) => row.operation).sort(),
  );
  assert.equal(readAuditLog(adapterAudit).filter((row) => row.action === "operator_agent_token_issued").length, 0);
  const adapterPost = await renderAppAdminResponse(
    new Request(`${ORIGIN}/api/admin/connections/agent-config`, { method: "POST", headers }),
    { config: adapterConfig },
  );
  assert.equal(adapterPost.status, 200);
  const adapterBody = await adapterPost.json();
  assert.equal(adapterBody.kind, "operator_agent_config");
  assert.match(adapterBody.credential, /^a1\./);
  const adapterIssued = readAuditLog(adapterAudit).filter((row) => row.action === "operator_agent_token_issued");
  assert.equal(adapterIssued.length, 1);
  assert.equal(JSON.stringify(adapterIssued).includes("a1."), false);

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
    method: "POST",
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
      [
        "POST",
        "/api/admin/connections",
        "provider=ai&endpoint=https%3A%2F%2Fopenrouter.ai%2Fapi%2Fv1%2Fchat%2Fcompletions&model=NousResearch%2FHermes-4-14B&api_key=sk-or-v1-must-not-be-used",
      ],
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
