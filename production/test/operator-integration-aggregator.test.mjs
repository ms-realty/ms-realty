import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { createPrivateContactEnvelope } from "../lib/private-contact-vault.mjs";
import {
  buildOperatorIntegrationContract,
  readOperatorIntegrationContract,
  resolveOperatorIntegrationWorkspace,
} from "../lib/operator-integration-aggregator.mjs";
import { saveProviderConnection } from "../lib/provider-connections.mjs";

const ORIGIN = "https://ms-realty.example";
const SECRET = "integration-aggregator-secret-that-is-longer-than-thirty-two-characters";
const SESSION = "payload.integration.session";

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

function ownerPrincipal(workspaceIds = []) {
  return {
    id: "payload-owner",
    source: "payload_session",
    can_mutate: true,
    roles: ["admin"],
    workspace_ids: workspaceIds,
  };
}

function payloadAuth(workspaceIds = []) {
  return {
    async resolve(token) {
      return token === SESSION ? { principal: ownerPrincipal(workspaceIds), user: { id: 1 } } : null;
    },
  };
}

function whereEquals(where, key) {
  if (where?.[key]?.equals !== undefined) return where[key].equals;
  for (const clause of where?.and || []) {
    const match = whereEquals(clause, key);
    if (match !== undefined) return match;
  }
  return undefined;
}

function payloadStore({ legacyGoogle = false } = {}) {
  const rows = [
    {
      id: "provider-google",
      provider: "google",
      status: "connected",
      connected_by: "payload-owner",
      ...(legacyGoogle ? {} : { workspace_id: "sandanski" }),
      account_label: "owner@example.com",
      external_account_id: "google-account-1",
      scopes: ["openid"],
      metadata: {
        email: "owner@example.com",
        endpoint: "https://user:password@safe.example/v1?access_token=metadata-secret#metadata-secret",
        uri: "https://safe.example/bot?token=metadata-secret#metadata-secret",
        api_key: "must-not-escape",
        access_token: "must-not-escape",
        credential_envelope: "must-not-escape",
      },
      credential_envelope: createPrivateContactEnvelope(
        {
          subjectType: "provider_connection",
          subjectId: "google",
          payload: { refresh_token: "provider-refresh-token-that-must-not-escape" },
        },
        { secret: SECRET, secretName: "MS_REALTY_PROVIDER_TOKEN_KEY" },
      ),
      last_verified_at: "2026-08-13T13:00:00.000Z",
    },
    {
      id: "provider-facebook-other-workspace",
      provider: "facebook",
      status: "connected",
      connected_by: "other-owner",
      workspace_id: "other-workspace",
      account_label: "other@example.com",
      external_account_id: "other-account",
      scopes: ["pages_manage_posts"],
      metadata: { email: "other@example.com" },
    },
  ];
  const queries = [];
  return {
    rows,
    queries,
    async find(options) {
      queries.push(options);
      const provider = whereEquals(options.where, "provider");
      const workspace = whereEquals(options.where, "workspace_id");
      return {
        docs: rows.filter(
          (row) =>
            (provider === undefined || row.provider === provider) &&
            (workspace === undefined || String(row.workspace_id || "") === workspace),
        ),
      };
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

function auditPath(t, label) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `ms-realty-${label}-`));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "audit.jsonl");
  fs.writeFileSync(filePath, "");
  return filePath;
}

function sessionHeaders() {
  return { cookie: `ms_admin=${SESSION}`, host: "ms-realty.example" };
}

function adapterConfig(auditLogPath, payload, workspaceIds = []) {
  return {
    ...appAdminConfigFromEnv({ NODE_ENV: "test", MS_REALTY_PUBLIC_ORIGIN: ORIGIN }),
    auditLogPath,
    payloadAdminAuth: payloadAuth(workspaceIds),
    providerConnection: PROVIDER_CONFIG,
    providerConnectionPayload: payload,
    workspaceSettingsWorkspaceId: "sandanski",
  };
}

test("integration contract is truthful, workspace-scoped, and redacts provider secrets", async () => {
  const payload = payloadStore();
  const contract = await readOperatorIntegrationContract({
    principal: ownerPrincipal(),
    workspaceId: "sandanski",
    configuredWorkspaceId: "sandanski",
    providerConfig: PROVIDER_CONFIG,
    providerPayload: payload,
    canManageConnections: true,
  });
  const google = contract.providers.find((provider) => provider.id === "google");
  const viber = contract.providers.find((provider) => provider.id === "viber");
  const facebook = contract.providers.find((provider) => provider.id === "facebook");
  const cloudflare = contract.providers.find((provider) => provider.id === "cloudflare");

  assert.equal(contract.kind, "operator_integrations");
  assert.equal(contract.workspace_id, "sandanski");
  assert.equal(contract.workspace_scope, "workspace");
  assert.equal(contract.connections.length, 1);
  assert.equal(contract.connections[0].provider, "google");
  assert.equal(google.status, "connected");
  assert.equal(google.setup_kind, "oauth");
  assert.equal(google.action.kind, "oauth_start");
  assert.equal(google.action.owner_only, true);
  assert.match(google.action.path, /provider=google&action=start$/);
  assert.equal(google.action.callback.owner_only, true);
  assert.match(google.action.callback.path, /provider=google&action=callback$/);
  assert.equal(viber.setup_kind, "token");
  assert.equal(viber.capability_state, "disabled");
  assert.equal(viber.action, null);
  assert.equal(viber.blocking_reason, "provider_has_no_supported_oauth_or_partner_handoff");
  assert.equal(cloudflare.capability_state, "managed");
  assert.equal(cloudflare.action, null);
  assert.equal(facebook.status, "not_connected");
  assert.equal(facebook.action.kind, "oauth_start");

  const serialized = JSON.stringify(contract);
  for (const secret of ["must-not-escape", "provider-refresh-token-that-must-not-escape", "access_token", "credential_envelope"]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
  assert.equal(google.metadata.email, "owner@example.com");
  assert.equal(google.metadata.endpoint, "https://safe.example/v1");
  assert.equal(google.metadata.uri, "https://safe.example/bot");
  assert.equal(payload.queries.some((query) => query.where?.workspace_id?.equals === "sandanski"), true);
});

test("integration workspace resolution is owner-only and fails closed without configured scope", () => {
  assert.deepEqual(
    resolveOperatorIntegrationWorkspace(ownerPrincipal(), { configuredWorkspaceId: "sandanski" }),
    { workspace_id: "sandanski", scope: "workspace" },
  );
  assert.throws(
    () => resolveOperatorIntegrationWorkspace(ownerPrincipal(["sandanski"]), { configuredWorkspaceId: "sandanski" }),
    (error) => error.code === "owner_admin_required" && error.status === 403,
  );
  assert.throws(
    () => resolveOperatorIntegrationWorkspace({ ...ownerPrincipal(), workspace_ids: "sandanski" }, { configuredWorkspaceId: "sandanski" }),
    (error) => error.code === "owner_admin_required" && error.status === 403,
  );
  assert.throws(
    () => resolveOperatorIntegrationWorkspace(ownerPrincipal(), { workspaceId: "foreign", configuredWorkspaceId: "sandanski" }),
    (error) => error.code === "workspace_forbidden" && error.status === 403,
  );
  assert.throws(
    () => resolveOperatorIntegrationWorkspace(ownerPrincipal()),
    (error) => error.code === "workspace_scope_unavailable" && error.status === 503,
  );
});

test("Node and Next integration endpoints have the same owner-only safe contract", async (t) => {
  const nodeAudit = auditPath(t, "node-integrations");
  const nextAudit = auditPath(t, "next-integrations");
  const nodePayload = payloadStore();
  const nextPayload = payloadStore();
  const app = createHttpApp({
    auditLogPath: nodeAudit,
    payloadAdminAuth: payloadAuth(),
    providerConnection: PROVIDER_CONFIG,
    providerConnectionPayload: nodePayload,
    workspaceSettingsWorkspaceId: "sandanski",
  });
  const node = await dispatchHttp(app, {
    method: "GET",
    url: "/api/admin/integrations?workspace_id=sandanski",
    headers: sessionHeaders(),
  });
  assert.equal(node.status, 200);
  assert.equal(node.headers["cache-control"], "no-store");

  const next = await renderAppAdminResponse(
    new Request(`${ORIGIN}/api/admin/integrations?workspace_id=sandanski`, { headers: sessionHeaders() }),
    { config: adapterConfig(nextAudit, nextPayload) },
  );
  assert.equal(next.status, 200);
  assert.equal(next.headers.get("cache-control"), "no-store");
  const nextBody = await next.json();
  assert.deepEqual(nextBody, node.body);
  assert.equal(readAuditLog(nodeAudit).at(-1).action, "provider_connections_status_read");
  assert.equal(readAuditLog(nextAudit).at(-1).action, "provider_connections_status_read");

  const refresh = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/integrations",
    headers: { ...sessionHeaders(), "content-type": "application/json", origin: ORIGIN, "sec-fetch-site": "same-origin" },
    body: { action: "refresh" },
  });
  assert.equal(refresh.status, 200);
  assert.equal(refresh.body.kind, "operator_integrations");
  assert.equal(readAuditLog(nodeAudit).at(-1).action, "provider_connections_refreshed");
});

test("integration endpoint rejects unauthenticated and non-Payload admin access", async (t) => {
  const auditLogPath = auditPath(t, "owner-only");
  const app = createHttpApp({
    auditLogPath,
    providerConnection: PROVIDER_CONFIG,
    providerConnectionPayload: payloadStore(),
  });
  const unauthenticated = await dispatchHttp(app, { method: "GET", url: "/api/admin/integrations", headers: {} });
  assert.equal(unauthenticated.status, 401);

  const scopedAdminApp = createHttpApp({
    auditLogPath,
    payloadAdminAuth: payloadAuth(["sandanski"]),
    providerConnection: PROVIDER_CONFIG,
    providerConnectionPayload: payloadStore(),
    workspaceSettingsWorkspaceId: "sandanski",
  });
  const scopedAdmin = await dispatchHttp(scopedAdminApp, {
    method: "GET",
    url: "/api/admin/integrations?workspace_id=sandanski",
    headers: sessionHeaders(),
  });
  assert.equal(scopedAdmin.status, 403);
  assert.equal(scopedAdmin.body.kind, "owner_admin_required");
  const scopedNext = await renderAppAdminResponse(
    new Request(`${ORIGIN}/api/admin/integrations?workspace_id=sandanski`, { headers: sessionHeaders() }),
    { config: adapterConfig(auditLogPath, payloadStore(), ["sandanski"]) },
  );
  assert.equal(scopedNext.status, 403);
  assert.equal((await scopedNext.json()).kind, "owner_admin_required");

  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: "bearer-admin", token: "bearer-admin-token-that-is-longer-than-thirty-two-characters", roles: ["admin"] },
    ]);
    const bearer = await dispatchHttp(app, {
      method: "GET",
      url: "/api/admin/integrations",
      headers: { authorization: "Bearer bearer-admin-token-that-is-longer-than-thirty-two-characters" },
    });
    assert.equal(bearer.status, 403);
    assert.equal(bearer.body.required_capability, "payload_admin_session");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("aggregated disconnect is workspace-scoped, provider-revoking, and audited", async (t) => {
  const auditLogPath = auditPath(t, "disconnect");
  const payload = payloadStore();
  const app = createHttpApp({
    auditLogPath,
    payloadAdminAuth: payloadAuth(),
    providerConnection: PROVIDER_CONFIG,
    providerConnectionPayload: payload,
    providerFetch: async () => new Response("{}", { status: 200 }),
    workspaceSettingsWorkspaceId: "sandanski",
  });
  const response = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/integrations",
    headers: { ...sessionHeaders(), "content-type": "application/json", origin: ORIGIN, "sec-fetch-site": "same-origin" },
    body: { action: "disconnect", provider: "google" },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.last_action, { action: "disconnect", provider: "google", revoked: true, deleted: true });
  assert.equal(payload.rows.some((row) => row.provider === "google"), false);
  assert.equal(readAuditLog(auditLogPath).at(-1).action, "provider_disconnected");
  assert.equal(JSON.stringify(response.body).includes("provider-refresh-token-that-must-not-escape"), false);

  const foreign = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/integrations",
    headers: { ...sessionHeaders(), "content-type": "application/json", origin: ORIGIN, "sec-fetch-site": "same-origin" },
    body: { action: "disconnect", provider: "facebook" },
  });
  assert.equal(foreign.status, 404);
  assert.equal(foreign.body.kind, "provider_connection_not_found");
  assert.equal(payload.rows.some((row) => row.workspace_id === "other-workspace"), true);
});

test("migrated legacy provider rows remain readable, updateable, and disconnectable", async (t) => {
  const payload = payloadStore({ legacyGoogle: true });
  for (const row of payload.rows) {
    if (!String(row.workspace_id || "").trim()) row.workspace_id = "sandanski";
  }
  const contract = await readOperatorIntegrationContract({
    principal: ownerPrincipal(),
    configuredWorkspaceId: "sandanski",
    providerConfig: PROVIDER_CONFIG,
    providerPayload: payload,
    canManageConnections: true,
  });
  assert.deepEqual(contract.connections.map((connection) => connection.provider), ["google"]);
  assert.equal(payload.queries.some((query) => query.where?.workspace_id?.equals === "sandanski"), true);

  const saved = await saveProviderConnection(
    {
      provider: "google",
      status: "connected",
      accountLabel: "upgraded-owner@example.com",
      externalAccountId: "google-account-upgraded",
      scopes: ["openid"],
      metadata: { email: "upgraded-owner@example.com" },
      credentials: { refresh_token: "upgraded-refresh-token" },
    },
    {
      connectedBy: "payload-owner",
      workspaceId: "sandanski",
      credentialSecret: SECRET,
      payload,
    },
  );
  assert.equal(saved.account_label, "upgraded-owner@example.com");
  assert.equal(payload.rows.find((row) => row.provider === "google").workspace_id, "sandanski");
  assert.equal(
    payload.queries.some(
      (query) => query.where?.and?.some((clause) => clause.workspace_id?.equals === "sandanski"),
    ),
    true,
  );

  const auditLogPath = auditPath(t, "legacy-disconnect");
  const app = createHttpApp({
    auditLogPath,
    payloadAdminAuth: payloadAuth(),
    providerConnection: PROVIDER_CONFIG,
    providerConnectionPayload: payload,
    providerFetch: async () => new Response("{}", { status: 200 }),
    workspaceSettingsWorkspaceId: "sandanski",
  });
  const response = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/integrations",
    headers: { ...sessionHeaders(), "content-type": "application/json", origin: ORIGIN, "sec-fetch-site": "same-origin" },
    body: { action: "disconnect", provider: "google" },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.last_action.deleted, true);
  assert.equal(payload.rows.some((row) => row.provider === "google"), false);
});

test("provider capability without OAuth remains setup-only and cannot expose a fake action", () => {
  const contract = buildOperatorIntegrationContract({
    principal: ownerPrincipal(),
    workspaceId: "sandanski",
    connections: [],
    availability: {
      store: { ready: true, missing: [] },
      google: { ready: true, missing: [] },
      google_drive: { ready: true, missing: [] },
      whatsapp: { ready: true, missing: [] },
      viber: { ready: true, missing: [] },
      facebook: { ready: true, missing: [] },
      instagram: { ready: true, missing: [] },
      github: { ready: true, missing: [] },
      cloudflare: { ready: true, missing: [] },
      neon: { ready: true, missing: [] },
      ai: { ready: true, missing: [] },
    },
    providerConfig: PROVIDER_CONFIG,
    canManageConnections: true,
  });
  const disabled = contract.providers.filter((provider) => provider.capability_state !== "enabled");
  assert.ok(disabled.length > 0);
  for (const provider of disabled) assert.equal(provider.action, null, provider.id);
  assert.equal(contract.actions.status.owner_only, true);
  assert.equal(contract.actions.refresh.owner_only, true);
  assert.equal(contract.actions.disconnect.owner_only, true);
});
