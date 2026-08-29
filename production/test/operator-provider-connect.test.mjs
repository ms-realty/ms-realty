// The connect screen an operator with no technical knowledge is expected to
// use. These tests hold it to the two promises that matter: a button is only
// ever offered when pressing it would actually work, and nothing reaches the
// credential store on the operator's word alone -- only on a provider's answer.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  OWNER_CONNECTABLE_PROVIDERS,
  OPERATOR_PROVIDERS,
  completeOperatorProviderOAuth,
  completeOperatorTokenConnection,
  operatorProviderAuthorizationUrl,
  operatorProviderAvailability,
  operatorProviderCards,
  operatorProviderConfigFromEnv,
  revokeOperatorProvider,
  verifyOperatorAiProvider,
} from "../lib/operator-provider-catalog.mjs";
import {
  OPERATOR_CONNECT_LOCALES,
  operatorConnectCopy,
  providerCopyKey,
} from "../lib/operator-connect-copy.mjs";
import {
  OPERATOR_TOKEN_ENV,
  operatorAgentConfigBlock,
  operatorConnectResult,
  renderOperatorConnectPage,
} from "../lib/operator-connect.mjs";
import {
  OPERATOR_AGENT_SECRET_ENV,
  issueOperatorAgentToken,
  mintOperatorAgentToken,
  resolveOperatorAgentPrincipal,
} from "../lib/operator-agent-access.mjs";
import { GOOGLE_SCOPES, createProviderOAuthState } from "../lib/provider-connections.mjs";
import { requiredAdminCapability } from "../lib/admin-auth.mjs";
import { runOperatorConnectionAction } from "../lib/operator-connect-routes.mjs";

const SECRET = "operator-connect-secret-that-is-longer-than-thirty-two-characters";
const ORIGIN = "https://ms-realty.example";

// Everything a fully provisioned deployment would have. Individual tests strip
// pieces out of it to prove the honest "needs one-time setup" state.
function fullConfig(overrides = {}) {
  return {
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
    ...overrides,
  };
}

// A fetch stand-in that answers a fixed route table and records what was asked.
function stubFetch(routes) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (input, init = {}) => {
      const url = String(input?.url || input);
      calls.push({
        url,
        method: init.method || "GET",
        headers: init.headers || {},
        body: init.body,
      });
      const match = Object.keys(routes).find((key) => url.startsWith(key));
      if (!match) throw new Error(`unstubbed fetch: ${url}`);
      const route = routes[match];
      return {
        ok: route.ok !== false,
        status: route.status || (route.ok === false ? 400 : 200),
        json: async () => route.body,
      };
    },
  };
}

function storeDeps(overrides = {}) {
  const saved = [];
  const deleted = [];
  return {
    saved,
    deleted,
    deps: {
      storeOptions: { credentialSecret: SECRET, payload: null },
      env: {},
      readProviderCredentials: async () => null,
      saveProviderConnection: async (connection) => {
        saved.push(connection);
        return {
          provider: connection.provider,
          status: connection.status,
          account_label: connection.accountLabel,
          external_account_id: connection.externalAccountId,
          scopes: connection.scopes,
          metadata: connection.metadata,
          last_verified_at: "2026-08-24T12:00:00.000Z",
        };
      },
      deleteProviderConnection: async (provider) => {
        deleted.push(provider);
        return { provider, deleted: true };
      },
      ...overrides,
    },
  };
}

test("every catalogue provider has a card, a title and a sentence in all three languages", () => {
  const cards = operatorProviderCards({ availability: operatorProviderAvailability(fullConfig()), config: fullConfig() });
  assert.deepEqual(
    cards.map((card) => card.id),
    [...OPERATOR_PROVIDERS],
  );
  assert.equal(cards.length, 10);
  assert.deepEqual(
    cards.filter((card) => card.owner_connectable).map((card) => card.id),
    [...OWNER_CONNECTABLE_PROVIDERS],
  );
  assert.deepEqual([...OWNER_CONNECTABLE_PROVIDERS], ["google", "whatsapp", "facebook", "instagram", "ai"]);
  for (const locale of OPERATOR_CONNECT_LOCALES) {
    const copy = operatorConnectCopy(locale);
    for (const card of cards) {
      for (const suffix of ["Title", "Description"]) {
        const key = providerCopyKey(card.id, suffix);
        assert.equal(typeof copy[key], "string", `${locale}.${key}`);
        assert.ok(copy[key].length > 0, `${locale}.${key} is empty`);
      }
      // Only a provider with an actual owner handoff needs an action label.
      if (card.kind !== "runtime") {
        const action = providerCopyKey(card.id, "Connect");
        assert.equal(typeof copy[action], "string", `${locale}.${action}`);
      }
    }
  }
});

test("a provider without an active authorization path stays unavailable without setup fields", () => {
  // Storage configured, but no Google/Meta/GitHub application and no state key.
  const bare = fullConfig({
    googleClientId: "",
    googleClientSecret: "",
    githubClientId: "",
    githubClientSecret: "",
    metaAppId: "",
    metaAppSecret: "",
    stateSecret: "",
    viberCommercialReady: false,
    hermes: { mode: "openrouter", endpoint: "", endpoint_redacted: null, model: "", has_api_key: false },
  });
  const cards = operatorProviderCards({ availability: operatorProviderAvailability(bare), config: bare });
  const byId = Object.fromEntries(cards.map((card) => [card.id, card]));
  for (const id of ["google", "google_drive", "facebook", "instagram", "github", "whatsapp"]) {
    assert.equal(byId[id].status, "needs_setup", id);
    assert.ok(byId[id].setup_env.length > 0, `${id} names the settings somebody has to add`);
    assert.ok(byId[id].setup_url, `${id} points at where to add them`);
  }
  assert.equal(byId.ai.status, "not_connected");
  // The catalogue still records source-owned configuration metadata for
  // diagnostics, but the owner page never exposes those names.
  assert.ok(byId.github.setup_env.includes("MS_REALTY_GITHUB_OAUTH_CLIENT_ID"));
  assert.ok(byId.github.setup_env.includes("MS_REALTY_GITHUB_OAUTH_CLIENT_SECRET"));
  assert.ok(byId.google_drive.setup_env.includes("MS_REALTY_GOOGLE_OAUTH_CLIENT_ID"));
  assert.ok(byId.ai.setup_env.includes("MS_REALTY_PROVIDER_TOKEN_KEY"));
  assert.equal(byId.ai.setup_env.some((name) => name.startsWith("HERMES_")), false);
  // Token-only/direct-API providers stay visible but disabled. Their old
  // backend verification helpers remain for existing records; this screen
  // never asks an owner to paste a secret.
  for (const id of ["viber", "cloudflare", "neon"]) {
    assert.equal(byId[id].status, "disabled", id);
    assert.equal(byId[id].supported, false, id);
    assert.deepEqual(byId[id].setup_env, [], id);
    assert.equal(byId[id].setup_url, "", id);
  }

  const html = renderOperatorConnectPage({
    baseUrl: ORIGIN,
    operatorId: "connect_operator",
    availability: operatorProviderAvailability(bare),
    providerConfig: bare,
    locale: "bg",
  });
  // Working owner workflows remain the only actionable cards. Supporting
  // channels stay visible as explicit gaps, without setup forms or start URLs.
  assert.equal(html.includes('href="/api/admin/connections?provider=github&amp;action=start"'), false);
  assert.match(html, /data-provider="google" data-status="needs_setup"/);
  assert.match(html, /data-provider="whatsapp" data-status="needs_setup"/);
  assert.match(html, /data-provider="facebook" data-status="needs_setup"/);
  assert.match(html, /data-provider="instagram" data-status="needs_setup"/);
  assert.match(html, /data-provider="ai" data-status="not_connected"/);
  assert.match(html, /data-provider="viber" data-status="disabled"/);
  for (const id of ["facebook", "instagram", "viber"]) {
    assert.equal(html.includes(`/api/admin/connections?provider=${id}&amp;action=start`), false, id);
  }
  assert.match(html, /Нужна е еднократна настройка/);
  assert.match(html, /Свързването е временно недостъпно/);
  assert.match(html, /Отговорникът за инфраструктурата трябва/);
  assert.doesNotMatch(html, /Свързването е достъпно само във влязла сесия/);
  assert.doesNotMatch(html, /MS_REALTY_[A-Z0-9_]+/);
  assert.doesNotMatch(html, /data-provider="(?:google_drive|github|cloudflare|neon)"/);
  assert.match(html, /data-managed-system="cloudflare" data-status="managed"/);
  assert.match(html, /data-managed-system="neon" data-status="managed"/);
  assert.equal((html.match(/<input[^>]+type="password"/g) || []).length, 1);
  assert.match(html, /data-provider-credential-form="ai"/);
  assert.match(html, /name="endpoint"[^>]+value="https:\/\/openrouter\.ai\/api\/v1\/chat\/completions"/);
  assert.match(html, /name="model"[^>]+required/);
  assert.match(html, /name="api_key" type="password"[^>]+autocomplete="new-password"/);
  assert.doesNotMatch(html, /name="token"/);
});

test("a connected card dates itself in words and offers a disclosure with a marker", () => {
  const config = fullConfig();
  const connections = [
    { provider: "google", status: "connected", account_label: "office@ms-realty.bg", last_verified_at: "2026-08-24T09:12:00.000Z" },
  ];
  const english = renderOperatorConnectPage({
    baseUrl: ORIGIN,
    operatorId: "connect_operator",
    connections,
    availability: operatorProviderAvailability(config),
    providerConfig: config,
    locale: "en",
  });
  assert.match(english, /Verified: 24 August 2026 at 09:12/);
  assert.equal(english.includes("2026-08-24T09:12:00.000Z"), false);
  const bulgarian = renderOperatorConnectPage({
    baseUrl: ORIGIN,
    operatorId: "connect_operator",
    connections,
    availability: operatorProviderAvailability(config),
    providerConfig: config,
    locale: "bg",
  });
  assert.match(bulgarian, /Проверено: 24 август 2026 г\./);
  // Misconfigured providers use a plain unavailable state, not a checklist.
  assert.doesNotMatch(bulgarian, /<details class="setup"/);
  // An unparseable stored value is shown as-is rather than as "Invalid Date".
  const broken = renderOperatorConnectPage({
    baseUrl: ORIGIN,
    operatorId: "connect_operator",
    connections: [{ provider: "google", status: "connected", account_label: "x", last_verified_at: "not-a-date" }],
    availability: operatorProviderAvailability(config),
    providerConfig: config,
    locale: "en",
  });
  assert.match(broken, /Verified: not-a-date/);
  assert.equal(broken.includes("Invalid Date"), false);
});

test("stored provider rows keep truthful intermediate and unavailable status", () => {
  const config = fullConfig();
  const cards = operatorProviderCards({
    availability: operatorProviderAvailability(config),
    config,
    connections: [
      { provider: "whatsapp", status: "connecting", account_label: "MS Realty" },
      { provider: "google", status: "unavailable", account_label: "office@ms-realty.bg" },
    ],
  });
  const byId = Object.fromEntries(cards.map((card) => [card.id, card]));
  assert.equal(byId.whatsapp.status, "connecting");
  assert.equal(byId.google.status, "unavailable");
});

test("a configured owner page offers four one-click handoffs and the protected OpenRouter form", () => {
  const config = fullConfig();
  const html = renderOperatorConnectPage({
    baseUrl: ORIGIN,
    operatorId: "connect_operator",
    availability: operatorProviderAvailability(config),
    providerConfig: config,
    locale: "en",
  });
  assert.ok(html.includes('href="/api/admin/connections?provider=google&amp;action=start"'));
  assert.ok(html.includes('href="/api/admin/connections?provider=facebook&amp;action=start"'));
  assert.ok(html.includes('href="/api/admin/connections?provider=instagram&amp;action=start"'));
  assert.equal((html.match(/data-whatsapp-connect="true"/g) || []).length, 1);
  for (const id of ["facebook", "instagram", "viber"]) {
    assert.match(html, new RegExp(`data-provider="${id}"`));
  }
  assert.equal(html.includes("/api/admin/connections?provider=viber&amp;action=start"), false);
  assert.doesNotMatch(html, /data-provider="(?:google_drive|github|cloudflare|neon)"/);
  assert.match(html, /data-provider="ai" data-status="not_connected"/);
  assert.equal((html.match(/<input[^>]+type="password"/g) || []).length, 1);
  assert.match(html, /<span>Connect OpenRouter<\/span>/);
  assert.doesNotMatch(html, /name="token"/);
  assert.match(html, /data-managed-system="hermes" data-status="ready"/);
  assert.match(html, /data-managed-system="data" data-status="ready"/);
  assert.match(html, /data-managed-system="cloudflare" data-status="managed"/);
  assert.match(html, /data-managed-system="neon" data-status="managed"/);
});

test("OAuth start binds the state to this provider and this operator", () => {
  const config = fullConfig();
  const url = new URL(
    operatorProviderAuthorizationUrl({ provider: "github", config, operatorId: "connect_operator" }),
  );
  assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "github-client-id");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://ms-realty.example/api/admin/connections?provider=github&action=callback",
  );
  assert.equal(url.searchParams.get("scope"), "read:user repo");

  const meta = new URL(operatorProviderAuthorizationUrl({ provider: "instagram", config, operatorId: "connect_operator" }));
  assert.equal(meta.origin + meta.pathname, "https://www.facebook.com/v22.0/dialog/oauth");
  assert.equal(meta.searchParams.get("scope"), "pages_show_list,instagram_basic,instagram_content_publish");

  const drive = new URL(operatorProviderAuthorizationUrl({ provider: "google_drive", config, operatorId: "connect_operator" }));
  assert.equal(drive.searchParams.get("access_type"), "offline");
  assert.match(drive.searchParams.get("scope"), /auth\/drive\.file/);
  // drive.file only, never the restricted whole-Drive scope.
  assert.equal(drive.searchParams.get("scope").includes("auth/drive "), false);
});

test("the owner action router accepts Google and Instagram and rejects unused OAuth providers", async () => {
  const config = fullConfig();
  const oauthNow = Date.parse("2026-08-29T12:00:00.000Z");
  const google = createProviderOAuthState({ provider: "google", operatorId: "connect_operator" }, { stateSecret: SECRET, now: oauthNow });
  const instagram = createProviderOAuthState(
    { provider: "instagram", operatorId: "connect_operator" },
    { stateSecret: SECRET, now: oauthNow },
  );
  const { deps, saved } = storeDeps();
  const stub = stubFetch({
    "https://oauth2.googleapis.com/token": {
      body: {
        access_token: "google-access",
        refresh_token: "google-refresh",
        token_type: "Bearer",
        expires_in: 3600,
        scope: GOOGLE_SCOPES.join(" "),
      },
    },
    "https://www.googleapis.com/oauth2/v2/userinfo": { body: { id: "google-owner", email: "owner@example.com" } },
    "https://graph.facebook.com/v22.0/oauth/access_token": {
      body: { access_token: "meta-user-short", expires_in: 3600 },
    },
    "https://graph.facebook.com/v22.0/me/permissions": {
      body: {
        data: [
          { permission: "pages_show_list", status: "granted" },
          { permission: "instagram_basic", status: "granted" },
          { permission: "instagram_content_publish", status: "granted" },
        ],
      },
    },
    "https://graph.facebook.com/v22.0/me/accounts": {
      body: {
        data: [
          {
            id: "100000000001",
            name: "MS Realty",
            access_token: "meta-page-token",
            instagram_business_account: { id: "178414000001", username: "msrealty" },
          },
        ],
      },
    },
  });

  // Right state, right operator: connected, and the account was read back.
  const ok = await runOperatorConnectionAction({
    intent: "callback",
    provider: "google",
    code: "one-time-code",
    state: google,
    operatorId: "connect_operator",
    config,
    deps: { ...deps, fetchImpl: stub.fetchImpl, now: oauthNow },
  });
  assert.equal(ok.outcome, "connected");
  assert.equal(ok.connection.account_label, "owner@example.com");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].credentials.access_token, "google-access");

  const instagramOk = await runOperatorConnectionAction({
    intent: "callback",
    provider: "instagram",
    code: "meta-code",
    state: instagram,
    operatorId: "connect_operator",
    config,
    deps: { ...deps, fetchImpl: stub.fetchImpl, now: oauthNow },
  });
  assert.equal(instagramOk.outcome, "connected");
  assert.equal(instagramOk.connection.account_label, "@msrealty");
  assert.equal(saved.length, 2);
  assert.equal(saved[1].credentials.user_access_token, "meta-user-short");
  assert.equal(saved[1].credentials.page_access_token, "meta-page-token");
  assert.equal(saved[1].credentials.instagram_account_id, "178414000001");

  // GitHub has OAuth, but no working owner workflow in this product. The
  // owner router refuses it before any provider request or storage write.
  const unusedProvider = await runOperatorConnectionAction({
    intent: "callback",
    provider: "github",
    code: "one-time-code",
    state: createProviderOAuthState({ provider: "github", operatorId: "connect_operator" }, { stateSecret: SECRET, now: oauthNow }),
    operatorId: "connect_operator",
    config,
    deps: { ...deps, fetchImpl: stub.fetchImpl, now: oauthNow },
  });
  assert.equal(unusedProvider.outcome, "rejected");
  assert.equal(unusedProvider.phase, "unsupported_provider");

  // Same state presented by a different operator.
  const wrongOperator = await runOperatorConnectionAction({
    intent: "callback",
    provider: "google",
    code: "one-time-code",
    state: google,
    operatorId: "someone_else",
    config,
    deps: { ...deps, fetchImpl: stub.fetchImpl, now: oauthNow },
  });
  assert.equal(wrongOperator.outcome, "rejected");

  // A tampered signature.
  const tampered = await runOperatorConnectionAction({
    intent: "callback",
    provider: "google",
    code: "one-time-code",
    state: `${google.split(".")[0]}.forged`,
    operatorId: "connect_operator",
    config,
    deps: { ...deps, fetchImpl: stub.fetchImpl, now: oauthNow },
  });
  assert.equal(tampered.outcome, "rejected");
  // Nothing beyond the one legitimate Google connection was ever stored.
  assert.equal(saved.length, 2);
});

test("Meta OAuth exchanges to a long-lived user token, reads granted scopes, and stores a page token", async () => {
  const config = fullConfig();
  const oauthNow = Date.parse("2026-08-29T12:00:00.000Z");
  const state = createProviderOAuthState({ provider: "facebook", operatorId: "connect_operator" }, { stateSecret: SECRET, now: oauthNow });
  const stub = stubFetch({
    "https://graph.facebook.com/v22.0/oauth/access_token": {
      body: { access_token: "meta-user-access", expires_in: 5_184_000 },
    },
    "https://graph.facebook.com/v22.0/me/permissions": {
      body: {
        data: [
          { permission: "pages_show_list", status: "granted" },
          { permission: "pages_manage_posts", status: "granted" },
          { permission: "email", status: "declined" },
        ],
      },
    },
    "https://graph.facebook.com/v22.0/me/accounts": {
      body: {
        data: [{ id: "100000000099", name: "MS Realty Bulgaria", access_token: "meta-page-access" }],
      },
    },
  });
  const connection = await completeOperatorProviderOAuth(
    { provider: "facebook", code: "meta-code", state, operatorId: "connect_operator" },
    { config, fetchImpl: stub.fetchImpl, now: oauthNow },
  );
  assert.equal(connection.accountLabel, "MS Realty Bulgaria");
  assert.equal(connection.externalAccountId, "100000000099");
  assert.deepEqual(connection.scopes, ["pages_manage_posts", "pages_show_list"]);
  assert.equal(connection.credentials.user_access_token, "meta-user-access");
  assert.equal(connection.credentials.page_access_token, "meta-page-access");
  assert.equal(connection.credentials.page_id, "100000000099");
  assert.equal(connection.credentials.user_expires_at, "2026-10-28T12:00:00.000Z");
});

test("Meta OAuth refuses a callback whose granted scopes do not cover publishing", async () => {
  const config = fullConfig();
  const oauthNow = Date.parse("2026-08-29T12:00:00.000Z");
  const state = createProviderOAuthState(
    { provider: "instagram", operatorId: "connect_operator" },
    { stateSecret: SECRET, now: oauthNow },
  );
  const stub = stubFetch({
    "https://graph.facebook.com/v22.0/oauth/access_token": {
      body: { access_token: "meta-user-access", expires_in: 5_184_000 },
    },
    "https://graph.facebook.com/v22.0/me/permissions": {
      body: {
        data: [
          { permission: "pages_show_list", status: "granted" },
          { permission: "instagram_basic", status: "granted" },
        ],
      },
    },
  });
  await assert.rejects(
    completeOperatorProviderOAuth(
      { provider: "instagram", code: "meta-code", state, operatorId: "connect_operator" },
      { config, fetchImpl: stub.fetchImpl, now: oauthNow },
    ),
    /did not grant the scopes/,
  );
});

test("a callback that does not grant the scopes the card promised is refused", async () => {
  const config = fullConfig();
  const state = createProviderOAuthState({ provider: "github", operatorId: "connect_operator" }, { stateSecret: SECRET });
  const stub = stubFetch({
    // GitHub granted read:user but not repo.
    "https://github.com/login/oauth/access_token": { body: { access_token: "gho_token", scope: "read:user" } },
  });
  await assert.rejects(
    completeOperatorProviderOAuth(
      { provider: "github", code: "c", state, operatorId: "connect_operator" },
      { config, fetchImpl: stub.fetchImpl },
    ),
    /did not grant the scopes/,
  );
});

test("a pasted key is stored only after the provider itself confirms it", async () => {
  const config = fullConfig();
  const cloudflare = stubFetch({
    "https://api.cloudflare.com/client/v4/user/tokens/verify": {
      body: { success: true, result: { id: "cf-token-1", status: "active" } },
    },
  });
  const connection = await completeOperatorTokenConnection(
    { provider: "cloudflare", token: "cloudflare-api-token-value-long-enough" },
    { config, fetchImpl: cloudflare.fetchImpl },
  );
  assert.equal(connection.status, "connected");
  assert.equal(connection.externalAccountId, "cf-token-1");
  assert.equal(connection.credentials.api_token, "cloudflare-api-token-value-long-enough");
  // Exactly one cheap call, and the token travelled as a bearer credential.
  assert.equal(cloudflare.calls.length, 1);
  assert.match(cloudflare.calls[0].headers.authorization, /^Bearer cloudflare-api-token/);

  const neon = stubFetch({
    "https://console.neon.tech/api/v2/projects": { body: { projects: [{ id: "neon-1", name: "ms-realty" }] } },
  });
  const neonConnection = await completeOperatorTokenConnection(
    { provider: "neon", token: "neon-api-key-value-that-is-long-enough" },
    { config, fetchImpl: neon.fetchImpl },
  );
  assert.equal(neonConnection.accountLabel, "ms-realty");
  assert.equal(neon.calls.length, 1);

  // A token the provider does not recognise never reaches the store.
  const refused = stubFetch({
    "https://api.cloudflare.com/client/v4/user/tokens/verify": { ok: false, status: 401, body: { success: false } },
  });
  const { deps, saved } = storeDeps();
  const outcome = await runOperatorConnectionAction({
    intent: "submit",
    provider: "cloudflare",
    input: { token: "cloudflare-api-token-value-long-enough" },
    operatorId: "connect_operator",
    config,
    deps: { ...deps, fetchImpl: refused.fetchImpl },
  });
  assert.equal(outcome.outcome, "rejected");
  assert.equal(outcome.phase, "unsupported_provider");
  assert.equal(saved.length, 0);
  assert.equal(refused.calls.length, 0);

  // An inactive-but-recognised token is refused too.
  const inactive = stubFetch({
    "https://api.cloudflare.com/client/v4/user/tokens/verify": {
      body: { success: true, result: { id: "cf-token-2", status: "disabled" } },
    },
  });
  await assert.rejects(
    completeOperatorTokenConnection(
      { provider: "cloudflare", token: "cloudflare-api-token-value-long-enough" },
      { config, fetchImpl: inactive.fetchImpl },
    ),
    /did not report this token as active/,
  );
});

test("OpenRouter verifies the exact endpoint, key, and selected model before encrypted storage", async () => {
  const apiKey = "sk-or-v1-openrouter-test-key-never-rendered";
  const stub = stubFetch({
    "https://openrouter.ai/api/v1/chat/completions": {
      body: { id: "generation-test", choices: [{ message: { content: "OK" } }] },
    },
  });
  const verified = await verifyOperatorAiProvider({
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model: "NousResearch/Hermes-4-14B",
    apiKey,
    fetchImpl: stub.fetchImpl,
  });
  assert.equal(verified.provider, "ai");
  assert.equal(verified.status, "connected");
  assert.equal(verified.metadata.key_verified, true);
  assert.equal(verified.metadata.verification, "one_token_chat_completion");
  assert.equal(verified.metadata.model, "NousResearch/Hermes-4-14B");
  // The verification call spends at most one output token and sends only a
  // static prompt. The verified secret stays in the internal connection object
  // only long enough for the existing store to seal it.
  assert.deepEqual(stub.calls.map((call) => call.url), ["https://openrouter.ai/api/v1/chat/completions"]);
  assert.equal(stub.calls[0].method, "POST");
  assert.equal(stub.calls[0].headers.authorization, `Bearer ${apiKey}`);
  const verificationBody = JSON.parse(stub.calls[0].body);
  assert.deepEqual(verificationBody, {
    model: "NousResearch/Hermes-4-14B",
    messages: [{ role: "user", content: "Reply with OK." }],
    max_tokens: 1,
    temperature: 0,
    stream: false,
  });
  assert.deepEqual(verified.credentials, {
    api_key: apiKey,
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model: "NousResearch/Hermes-4-14B",
  });

  for (const input of [
    { endpoint: "https://example.com/api/v1/chat/completions", model: "NousResearch/Hermes-4-14B", apiKey, code: "openrouter_endpoint_invalid" },
    { endpoint: "https://openrouter.ai/api/v1/chat/completions", model: "bad model", apiKey, code: "openrouter_model_invalid" },
    { endpoint: "https://openrouter.ai/api/v1/chat/completions", model: "NousResearch/Hermes-4-14B", apiKey: "short", code: "openrouter_api_key_invalid" },
  ]) {
    await assert.rejects(
      verifyOperatorAiProvider({ ...input, fetchImpl: stub.fetchImpl }),
      (error) => error.code === input.code && !error.message.includes(apiKey),
    );
  }

  const unavailable = stubFetch({
    "https://openrouter.ai/api/v1/chat/completions": { ok: false, status: 404, body: { error: { message: "model unavailable" } } },
  });
  await assert.rejects(
    verifyOperatorAiProvider({
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      model: "NousResearch/Hermes-4-14B",
      apiKey,
      fetchImpl: unavailable.fetchImpl,
    }),
    (error) => error.code === "openrouter_verification_failed" && !error.message.includes(apiKey),
  );
});

test("disconnecting revokes at the provider and then deletes the row", async () => {
  const config = fullConfig();
  const stub = stubFetch({ "https://oauth2.googleapis.com/revoke": { body: {} } });
  const { deps, deleted } = storeDeps({
    readProviderCredentials: async () => ({ refresh_token: "google-refresh-token" }),
  });
  const outcome = await runOperatorConnectionAction({
    intent: "disconnect",
    provider: "google",
    operatorId: "connect_operator",
    config,
    deps: { ...deps, fetchImpl: stub.fetchImpl },
  });
  assert.equal(outcome.outcome, "disconnected");
  assert.equal(outcome.revoked, true);
  assert.equal(outcome.deleted, true);
  assert.deepEqual(deleted, ["google"]);
  assert.match(stub.calls[0].url, /^https:\/\/oauth2\.googleapis\.com\/revoke\?token=google-refresh-token/);
  assert.equal(stub.calls[0].method, "POST");

  // A key the provider cannot revoke remotely still gets its row removed, and
  // the outcome says the revoke did not happen so the card can say so.
  const cloudflare = storeDeps({ readProviderCredentials: async () => ({ api_token: "cf-token" }) });
  const manual = await runOperatorConnectionAction({
    intent: "disconnect",
    provider: "cloudflare",
    operatorId: "connect_operator",
    config,
    deps: { ...cloudflare.deps, fetchImpl: async () => { throw new Error("must not call"); } },
  });
  assert.equal(manual.revoked, false);
  assert.equal(manual.deleted, true);
  assert.deepEqual(cloudflare.deleted, ["cloudflare"]);

  const ai = storeDeps({
    readProviderCredentials: async () => ({
      api_key: "sk-or-v1-openrouter-test-key-never-rendered",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      model: "NousResearch/Hermes-4-14B",
    }),
  });
  const disconnectedAi = await runOperatorConnectionAction({
    intent: "disconnect",
    provider: "ai",
    operatorId: "connect_operator",
    config,
    deps: { ...ai.deps, fetchImpl: async () => { throw new Error("must not call"); } },
  });
  assert.deepEqual(disconnectedAi, { outcome: "disconnected", provider: "ai", revoked: false, deleted: true });
  assert.deepEqual(ai.deleted, ["ai"]);

  const unavailable = storeDeps({
    readProviderCredentials: async () => {
      const error = new Error("provider store unavailable");
      error.code = "provider_connection_unavailable";
      throw error;
    },
  });
  await assert.rejects(
    () =>
      runOperatorConnectionAction({
        intent: "disconnect",
        provider: "google",
        operatorId: "connect_operator",
        config,
        deps: unavailable.deps,
      }),
    /provider store unavailable/,
  );
  assert.deepEqual(unavailable.deleted, []);

  // A provider that refuses the revoke must not strand the row either.
  const failing = stubFetch({ "https://oauth2.googleapis.com/revoke": { ok: false, status: 400, body: {} } });
  assert.deepEqual(
    await revokeOperatorProvider(
      { provider: "google", credentials: { refresh_token: "t" } },
      { config, fetchImpl: failing.fetchImpl },
    ),
    { provider: "google", revoked: false },
  );
});

test("the assistant's configuration helper stays available as an API and the owner page reveals one masked credential", async () => {
  const mint = mintOperatorAgentToken(
    { operatorId: "connect_operator", roles: ["admin"] },
    { secret: SECRET, issuedAt: "2026-08-24T00:00:00.000Z", ttlDays: 90 },
  );
  const block = operatorAgentConfigBlock({
    baseUrl: `${ORIGIN}/admin/connect`,
    token: mint.token,
    operatorId: "connect_operator",
    expiresAt: mint.expires_at,
    locale: "bg",
  });
  // Names the account it belongs to, and dates it in words rather than as an
  // ISO timestamp the reader has to decode.
  assert.match(block, /Акаунт: connect_operator/);
  assert.match(block, /Валидна до: \d{1,2} \S+ 2026 г\./);
  assert.equal(block.includes("2026-11-22T"), false);
  // Three numbered steps in the operator's own language.
  assert.match(block, /1\. Отвори в Codex и потвърди инсталирането\./);
  assert.match(block, /2\. В ChatGPT отвори тази влязла страница във вградения браузър\./);
  assert.match(block, /3\. За отдалечен терминален клиент копирай настройката по-долу\./);
  // Claude Code: both the one-line command and a config file that parses.
  assert.match(block, /claude mcp add --transport http ms-realty "https:\/\/ms-realty\.example\/mcp"/);
  const claudeSection = block.slice(block.indexOf("# .mcp.json"), block.indexOf("=== ChatGPT (Codex CLI) ==="));
  const parsed = JSON.parse(claudeSection.slice(claudeSection.indexOf("{"), claudeSection.lastIndexOf("}") + 1));
  assert.equal(parsed.mcpServers["ms-realty"].url, "https://ms-realty.example/mcp");
  assert.equal(parsed.mcpServers["ms-realty"].type, "http");
  assert.equal(parsed.mcpServers["ms-realty"].headers.Authorization, `Bearer \${${OPERATOR_TOKEN_ENV}}`);
  assert.equal(block.includes(mint.token), false);
  // ChatGPT, both ways it can be reached.
  assert.match(block, /\[mcp_servers\.ms-realty\]/);
  assert.match(block, new RegExp(`bearer_token_env_var = "${OPERATOR_TOKEN_ENV}"`));
  assert.match(block, /Settings -> Connectors -> Add custom connector/);
  // The local drafting bridge that already exists.
  assert.match(block, /hermes-mcp-server\.mjs/);
  assert.match(block, /humans? still approve|human still approve/i);

  const html = renderOperatorConnectPage({
    baseUrl: ORIGIN,
    operatorId: "connect_operator",
    availability: operatorProviderAvailability(fullConfig()),
    providerConfig: fullConfig(),
    agentToken: mint.token,
    agentExpiresAt: mint.expires_at,
    locale: "bg",
  });
  // The owner page exposes the short-lived credential once in a masked,
  // read-only field and keeps the copied configuration token-free.
  assert.match(html, /data-summary-kind="connections"/);
  for (const card of ["google", "whatsapp", "social", "assistant"]) {
    assert.match(html, new RegExp(`data-summary-card="${card}"`), `${card} summary`);
  }
  assert.match(html, /data-connection-group="assistant"/);
  assert.match(html, /data-codex-plugin-install="ms-realty-operator"/);
  assert.equal((html.match(/id="agent-credential"/g) || []).length, 1);
  assert.match(html, /id="agent-credential" type="password"[^>]*readonly/);
  assert.equal((html.match(/data-copy-block="agent-credential"/g) || []).length, 1);
  assert.equal((html.match(/data-copy-block="agent-config"/g) || []).length, 1);
  assert.match(html, new RegExp(OPERATOR_TOKEN_ENV));
  assert.match(html, new RegExp(`id="agent-credential"[^>]+value="${mint.token}"`));
  assert.equal((html.match(new RegExp(mint.token, "g")) || []).length, 1);

  // The Codex handoff is the supported visible step; no direct MCP credential
  // setup is rendered alongside it.
  const blocked = renderOperatorConnectPage({
    baseUrl: ORIGIN,
    operatorId: "connect_operator",
    availability: operatorProviderAvailability(fullConfig()),
    providerConfig: fullConfig(),
    locale: "bg",
  });
  assert.match(blocked, /Отвори в Codex/);
  assert.match(blocked, /добавката/);
  assert.equal(blocked.includes('data-copy-block="agent-config"'), false);
});

test("the assistant token delegates the operator's own roles and expires on its own", () => {
  const env = { [OPERATOR_AGENT_SECRET_ENV]: SECRET };
  const mint = issueOperatorAgentToken({
    principal: { id: "connect_operator", roles: ["broker"] },
    env,
    issuedAt: "2026-08-24T00:00:00.000Z",
  });
  const principal = resolveOperatorAgentPrincipal(`Bearer ${mint.token}`, env, {
    now: Date.parse("2026-08-25T00:00:00.000Z"),
  });
  assert.equal(principal.id, "connect_operator");
  assert.equal(principal.source, "operator_agent_token");
  // A broker's assistant is a broker, never an admin.
  assert.deepEqual(principal.roles, ["broker"]);

  // Expired.
  assert.equal(
    resolveOperatorAgentPrincipal(`Bearer ${mint.token}`, env, { now: Date.parse("2027-08-25T00:00:00.000Z") }),
    null,
  );
  // Signed with a different secret.
  assert.equal(
    resolveOperatorAgentPrincipal(`Bearer ${mint.token}`, { [OPERATOR_AGENT_SECRET_ENV]: `${SECRET}-rotated` }),
    null,
  );
  // Roles edited in the token body without re-signing.
  const parts = mint.token.split(".");
  parts[2] = Buffer.from("admin").toString("base64url");
  assert.equal(resolveOperatorAgentPrincipal(`Bearer ${parts.join(".")}`, env), null);
  // No secret configured means no token is ever accepted.
  assert.equal(resolveOperatorAgentPrincipal(`Bearer ${mint.token}`, {}), null);
  // A shared token with no operator identity has nothing to delegate from.
  assert.equal(issueOperatorAgentToken({ principal: { id: null, roles: ["admin"] }, env }), null);
  // Neither does a caller whose roles are unknown.
  assert.equal(issueOperatorAgentToken({ principal: { id: "connect_operator", roles: [] }, env }), null);
});

test("connection mutations are capability gated and result banners stay in one language", () => {
  assert.equal(requiredAdminCapability("POST", "/api/admin/connections"), "settings:manage");
  assert.equal(requiredAdminCapability("POST", "/api/admin/connections/disconnect"), "settings:manage");
  assert.equal(requiredAdminCapability("GET", "/api/admin/connections/agent-config"), "settings:manage");
  // Reads stay where they already were.
  assert.equal(requiredAdminCapability("GET", "/api/admin/connections"), "administration:read");
  assert.equal(requiredAdminCapability("GET", "/admin/connect"), "administration:read");

  assert.equal(operatorConnectResult({ locale: "bg", connected: "github" }), "GitHub е потвърден и свързан.");
  assert.equal(operatorConnectResult({ locale: "ru", disconnected: "neon" }), "Neon отключён, запись удалена.");
  assert.equal(operatorConnectResult({ locale: "en", verified: "ai" }), "The AI provider answered. The check has been recorded.");
  assert.equal(operatorConnectResult({ locale: "bg", verified: "ai" }), "ИИ доставчикът отговори. Проверката е записана.");
});

test("no raw copy keys and no English leak into the Bulgarian or Russian screen", () => {
  const config = fullConfig();
  const english = operatorConnectCopy("en");
  // Words that only ever appear in the English dictionary. If one shows up in
  // another language the card fell back instead of being translated.
  const englishOnly = [
    english.needsSetup,
    english.disconnect,
    english.setupHeading,
    english.agentCopy,
    english.aiProviderVerify,
    english.githubDescription,
    english.cloudflareDescription,
  ];
  for (const locale of ["bg", "ru"]) {
    const html = renderOperatorConnectPage({
      baseUrl: ORIGIN,
      operatorId: "connect_operator",
      availability: operatorProviderAvailability(config),
      providerConfig: config,
      agentToken: mintOperatorAgentToken({ operatorId: "connect_operator", roles: ["admin"] }, { secret: SECRET }).token,
      locale,
    });
    const chrome = html.slice(html.indexOf("<body"), html.indexOf("</main>"));
    for (const phrase of englishOnly) {
      assert.equal(chrome.includes(phrase), false, `${locale} fell back to English: ${phrase}`);
    }
    // A missing dictionary entry renders as "undefined"; a raw key renders as
    // the camelCase key itself. Neither may reach the page.
    assert.equal(chrome.includes("undefined"), false, `${locale} has a missing string`);
    for (const id of OPERATOR_PROVIDERS) {
      assert.equal(chrome.includes(providerCopyKey(id, "Title")), false, `${locale} rendered a raw key for ${id}`);
    }
  }
});

test("OpenRouter credentials are sealed with the same envelope the contact vault uses", async () => {
  // The store is the already-tested provider connection store; this holds the
  // new providers to it, so the OpenRouter key, endpoint, and model are
  // protected exactly as a Gmail refresh token is.
  const { createPrivateContactEnvelope, openPrivateContactEnvelope } = await import("../lib/private-contact-vault.mjs");
  const credentials = {
    api_key: "sk-or-v1-openrouter-secret-never-rendered",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model: "NousResearch/Hermes-4-14B",
  };
  const envelope = createPrivateContactEnvelope(
    { subjectType: "provider_connection", subjectId: "ai", payload: credentials },
    { secret: SECRET, secretName: "MS_REALTY_PROVIDER_TOKEN_KEY" },
  );
  assert.equal(envelope.algorithm, "aes-256-gcm");
  assert.equal(JSON.stringify(envelope).includes(credentials.api_key), false);
  assert.deepEqual(openPrivateContactEnvelope(envelope, { secret: SECRET }).payload, credentials);
  // The subject is authenticated data, so an OpenRouter envelope cannot be
  // replayed as another provider's.
  assert.throws(() =>
    openPrivateContactEnvelope({ ...envelope, subject_id: "neon" }, { secret: SECRET }),
  );
  // And a rotated key cannot open it.
  assert.throws(() =>
    openPrivateContactEnvelope(envelope, { secret: createHash("sha256").update(SECRET).digest("hex") }),
  );
});

test("the environment names the catalogue asks for are the ones the modules read", () => {
  const config = operatorProviderConfigFromEnv({
    MS_REALTY_PUBLIC_ORIGIN: ORIGIN,
    MS_REALTY_GITHUB_OAUTH_CLIENT_ID: "gh-id",
    MS_REALTY_GITHUB_OAUTH_CLIENT_SECRET: "gh-secret",
    MS_REALTY_PROVIDER_TOKEN_KEY: SECRET,
    MS_REALTY_PROVIDER_OAUTH_STATE_SECRET: SECRET,
    PAYLOAD_SECRET: "payload",
    DATABASE_URL: "postgres://db/x",
    MS_REALTY_GOOGLE_OAUTH_CLIENT_ID: "g-id",
    MS_REALTY_GOOGLE_OAUTH_CLIENT_SECRET: "g-secret",
  });
  assert.equal(config.githubClientId, "gh-id");
  assert.equal(config.githubClientSecret, "gh-secret");
  const availability = operatorProviderAvailability(config);
  assert.equal(availability.github.ready, true);
  assert.equal(availability.google_drive.ready, true);
  assert.equal(availability.cloudflare.ready, true);
  // Meta was not configured, so its three cards stay honest.
  assert.equal(availability.facebook.ready, false);
  assert.ok(availability.facebook.missing.includes("MS_REALTY_META_APP_ID"));
  const metaUnavailable = operatorProviderAvailability(
    operatorProviderConfigFromEnv({
      MS_REALTY_PUBLIC_ORIGIN: ORIGIN,
      MS_REALTY_PROVIDER_TOKEN_KEY: SECRET,
      MS_REALTY_PROVIDER_OAUTH_STATE_SECRET: SECRET,
      PAYLOAD_SECRET: "payload",
      DATABASE_URL: "postgres://db/x",
      MS_REALTY_META_APP_ID: "meta-id",
      MS_REALTY_META_APP_SECRET: "meta-secret",
      MS_REALTY_META_GRAPH_VERSION: "v22.0",
    }),
  );
  assert.equal(metaUnavailable.facebook.ready, false);
  assert.ok(metaUnavailable.facebook.missing.includes("MS_REALTY_META_FACEBOOK_PUBLISH_READY"));
  assert.ok(metaUnavailable.instagram.missing.includes("MS_REALTY_META_INSTAGRAM_PUBLISH_READY"));
  // A malformed Hermes mode must not take the page down.
  assert.equal(operatorProviderConfigFromEnv({ HERMES_PROVIDER_MODE: "nonsense" }).hermes.has_api_key, false);
});
