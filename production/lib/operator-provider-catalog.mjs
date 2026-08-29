// The catalogue behind /admin/connect: every tool the agency actually uses, and
// the honest truth about how close to one click each one can be.
//
// Three kinds of provider, because the providers themselves are three kinds:
//
//   oauth            The operator presses one button and approves in the
//                    provider's own window. Only possible once somebody has
//                    registered an application with that provider, which is a
//                    one-time human job nobody can automate away.
//   embedded_signup  Meta's WhatsApp flow: an in-page handover, same shape.
//   token            The provider has no OAuth for this. The operator pastes
//                    one value and we spend one cheap API call proving it works
//                    before storing it. Never "saved" on the operator's word.
//                    OpenRouter uses the same verified-token shape, with its
//                    exact endpoint and model beside the password field.
//
// A provider whose application has not been registered yet renders as
// "needs one-time setup" with a plain unavailable/recovery explanation, never
// as a button that would fail or a credential checklist for the owner.

import {
  DEFAULT_OPENROUTER_CHAT_COMPLETIONS_URL,
  hermesProviderConfigFromEnv,
} from "./hermes-provider-provisioning.mjs";
import {
  GOOGLE_SCOPES,
  createProviderOAuthState,
  exactOrigin,
  providerConnectionAvailability,
  providerConnectionConfigFromEnv,
  responseJson,
  verifyProviderOAuthState,
} from "./provider-connections.mjs";

// drive.file keeps us to files this workbench itself created or the operator
// explicitly picked. Asking for whole-Drive access would be a restricted scope
// and a far heavier review for no gain.
export const GOOGLE_DRIVE_SCOPES = Object.freeze(["openid", "email", "https://www.googleapis.com/auth/drive.file"]);
export const FACEBOOK_SCOPES = Object.freeze(["pages_show_list", "pages_manage_posts"]);
export const INSTAGRAM_SCOPES = Object.freeze(["pages_show_list", "instagram_basic", "instagram_content_publish"]);
// read:user identifies the account; repo is what lets the agent read and open
// changes in the agency's own repository.
export const GITHUB_SCOPES = Object.freeze(["read:user", "repo"]);

const STORE_ENV = Object.freeze([
  "MS_REALTY_PROVIDER_TOKEN_KEY",
  "PAYLOAD_SECRET",
  "DATABASE_URL",
]);

// Ordered exactly as the cards render.
const DEFINITIONS = Object.freeze([
  {
    id: "google",
    kind: "oauth",
    family: "google",
    ownerConnectable: true,
    scopes: GOOGLE_SCOPES,
    setupEnv: [
      "MS_REALTY_PUBLIC_ORIGIN",
      "MS_REALTY_GOOGLE_OAUTH_CLIENT_ID",
      "MS_REALTY_GOOGLE_OAUTH_CLIENT_SECRET",
      "MS_REALTY_PROVIDER_OAUTH_STATE_SECRET",
    ],
    setupUrl: "https://console.cloud.google.com/apis/credentials",
  },
  {
    id: "google_drive",
    kind: "oauth",
    family: "google",
    scopes: GOOGLE_DRIVE_SCOPES,
    setupEnv: [
      "MS_REALTY_PUBLIC_ORIGIN",
      "MS_REALTY_GOOGLE_OAUTH_CLIENT_ID",
      "MS_REALTY_GOOGLE_OAUTH_CLIENT_SECRET",
      "MS_REALTY_PROVIDER_OAUTH_STATE_SECRET",
    ],
    setupUrl: "https://console.cloud.google.com/apis/credentials",
  },
  {
    id: "whatsapp",
    kind: "embedded_signup",
    family: "meta",
    ownerConnectable: true,
    setupEnv: [
      "MS_REALTY_PUBLIC_ORIGIN",
      "MS_REALTY_META_APP_ID",
      "MS_REALTY_META_APP_SECRET",
      "MS_REALTY_META_EMBEDDED_SIGNUP_CONFIG_ID",
      "MS_REALTY_META_GRAPH_VERSION",
      "MS_REALTY_META_WEBHOOK_VERIFY_TOKEN",
    ],
    setupUrl: "https://developers.facebook.com/apps",
  },
  {
    id: "viber",
    kind: "token",
    family: "viber",
    // Viber's official Bot API is token-only. The owner console is OAuth-first,
    // so this provider is deliberately visible but not connectable here.
    supported: false,
    setupEnv: ["MS_REALTY_PUBLIC_ORIGIN", "MS_REALTY_VIBER_COMMERCIAL_READY"],
    setupUrl: "https://partners.viber.com/",
  },
  {
    id: "facebook",
    kind: "oauth",
    family: "meta",
    ownerConnectable: true,
    scopes: FACEBOOK_SCOPES,
    setupEnv: [
      "MS_REALTY_PUBLIC_ORIGIN",
      "MS_REALTY_META_APP_ID",
      "MS_REALTY_META_APP_SECRET",
      "MS_REALTY_META_GRAPH_VERSION",
      "MS_REALTY_META_FACEBOOK_PUBLISH_READY",
      "MS_REALTY_PROVIDER_OAUTH_STATE_SECRET",
    ],
    setupUrl: "https://developers.facebook.com/apps",
  },
  {
    id: "instagram",
    kind: "oauth",
    family: "meta",
    ownerConnectable: true,
    scopes: INSTAGRAM_SCOPES,
    setupEnv: [
      "MS_REALTY_PUBLIC_ORIGIN",
      "MS_REALTY_META_APP_ID",
      "MS_REALTY_META_APP_SECRET",
      "MS_REALTY_META_GRAPH_VERSION",
      "MS_REALTY_META_INSTAGRAM_PUBLISH_READY",
      "MS_REALTY_PROVIDER_OAUTH_STATE_SECRET",
    ],
    setupUrl: "https://developers.facebook.com/apps",
  },
  {
    id: "github",
    kind: "oauth",
    family: "github",
    scopes: GITHUB_SCOPES,
    setupEnv: [
      "MS_REALTY_PUBLIC_ORIGIN",
      "MS_REALTY_GITHUB_OAUTH_CLIENT_ID",
      "MS_REALTY_GITHUB_OAUTH_CLIENT_SECRET",
      "MS_REALTY_PROVIDER_OAUTH_STATE_SECRET",
    ],
    setupUrl: "https://github.com/settings/developers",
  },
  {
    id: "cloudflare",
    kind: "token",
    family: "cloudflare",
    // Cloudflare documents OAuth, but this runtime has no OAuth route yet. Do
    // not fall back to an API-token field or imply that one will work here.
    supported: false,
    setupEnv: [],
    setupUrl: "https://dash.cloudflare.com/profile/api-tokens",
  },
  {
    id: "neon",
    kind: "token",
    family: "neon",
    // Neon exposes OAuth through its managed remote MCP path, not a direct
    // third-party API client in this runtime. Keep direct API connection off.
    supported: false,
    setupEnv: [],
    setupUrl: "https://console.neon.tech/app/settings/api-keys",
  },
  {
    id: "ai",
    kind: "token",
    family: "hermes",
    ownerConnectable: true,
    setupEnv: [],
    setupUrl: "https://openrouter.ai/settings/keys",
  },
]);

const OWNER_CONNECTION_LIFECYCLE = Object.freeze([
  "authorizing",
  "connected",
  "reauthorize",
  "error",
  "disconnected",
]);

// Executable product truth for the owner connection surface. A provider is
// enabled only when its provider-authorized handoff powers a real MS Realty
// consumer. Everything else is managed infrastructure or a named gap, never a
// decorative connection button or a secret-entry form.
const PROVIDER_COVERAGE = Object.freeze({
  google: {
    state: "enabled",
    ownerSurface: "one_click",
    authorization: "oauth_authorization_code",
    ownerAction: { kind: "oauth_redirect", method: "GET", pathname: "/api/admin/connections", action: "start" },
    consumers: [
      { workflow: "approved_email_delivery", source_file: "production/lib/provider-delivery.mjs", symbol: "deliverApprovedProviderMessage" },
      { workflow: "viewing_calendar_sync", source_file: "production/lib/provider-connections.mjs", symbol: "syncViewingToGoogleCalendar" },
    ],
  },
  google_drive: {
    state: "disabled",
    ownerSurface: "hidden",
    authorization: "oauth_authorization_code",
    reason: "no_approved_runtime_consumer",
    consumers: [],
  },
  whatsapp: {
    state: "enabled",
    ownerSurface: "one_click",
    authorization: "provider_embedded_signup",
    ownerAction: { kind: "embedded_signup", method: "POST", pathname: "/api/admin/connections" },
    consumers: [
      { workflow: "approved_whatsapp_delivery", source_file: "production/lib/provider-delivery.mjs", symbol: "deliverApprovedProviderMessage" },
      { workflow: "verified_inbound_webhooks", source_file: "production/lib/provider-webhooks.mjs", symbol: "renderProviderWebhookResponse" },
    ],
  },
  viber: {
    state: "disabled",
    ownerSurface: "hidden",
    authorization: "token_only",
    reason: "provider_has_no_supported_oauth_or_partner_handoff",
    consumers: [
      { workflow: "approved_viber_delivery", source_file: "production/lib/provider-delivery.mjs", symbol: "deliverApprovedProviderMessage" },
      { workflow: "verified_inbound_webhooks", source_file: "production/lib/provider-webhooks.mjs", symbol: "renderProviderWebhookResponse" },
    ],
  },
  facebook: {
    state: "enabled",
    ownerSurface: "one_click",
    authorization: "oauth_authorization_code",
    ownerAction: { kind: "oauth_redirect", method: "GET", pathname: "/api/admin/connections", action: "start" },
    consumers: [
      { workflow: "approved_facebook_page_publish", source_file: "production/lib/social-marketing-publishing.mjs", symbol: "publishApprovedSocialDraft" },
    ],
  },
  instagram: {
    state: "enabled",
    ownerSurface: "one_click",
    authorization: "oauth_authorization_code",
    ownerAction: { kind: "oauth_redirect", method: "GET", pathname: "/api/admin/connections", action: "start" },
    consumers: [
      { workflow: "approved_instagram_publish", source_file: "production/lib/social-marketing-publishing.mjs", symbol: "publishApprovedSocialDraft" },
    ],
  },
  github: {
    state: "disabled",
    ownerSurface: "hidden",
    authorization: "oauth_authorization_code",
    reason: "no_approved_runtime_consumer",
    consumers: [],
  },
  cloudflare: {
    state: "managed",
    ownerSurface: "infrastructure_status",
    authorization: "managed_runtime",
    reason: "infrastructure_managed_outside_owner_connections",
    consumers: [],
  },
  neon: {
    state: "managed",
    ownerSurface: "data_status",
    authorization: "managed_runtime",
    reason: "database_managed_outside_owner_connections",
    consumers: [],
  },
  ai: {
    state: "enabled",
    ownerSurface: "credential_form",
    authorization: "verified_encrypted_api_key",
    ownerAction: { kind: "credential_form", method: "POST", pathname: "/api/admin/connections" },
    consumers: [
      { workflow: "guarded_hermes_owner_plans", source_file: "production/lib/hermes-owner-command.mjs", symbol: "runHermesOwnerCommand" },
    ],
  },
});

export const OPERATOR_PROVIDERS = Object.freeze(DEFINITIONS.map((definition) => definition.id));
export const OWNER_CONNECTABLE_PROVIDERS = Object.freeze(
  DEFINITIONS.filter((definition) => definition.ownerConnectable === true).map((definition) => definition.id),
);
export const OPERATOR_PROVIDER_COVERAGE = Object.freeze(
  DEFINITIONS.map((definition) => {
    const coverage = PROVIDER_COVERAGE[definition.id];
    if (!coverage) throw new Error(`Missing provider coverage for ${definition.id}`);
    return Object.freeze({
      provider: definition.id,
      state: coverage.state,
      enabled: coverage.state === "enabled",
      owner_surface: coverage.ownerSurface,
      authorization: coverage.authorization,
      owner_action: coverage.ownerAction ? Object.freeze({ ...coverage.ownerAction, provider: definition.id }) : null,
      lifecycle: coverage.state === "enabled" ? OWNER_CONNECTION_LIFECYCLE : [],
      downstream_consumers: Object.freeze(coverage.consumers.map((consumer) => Object.freeze({ ...consumer }))),
      reason: coverage.reason || null,
      owner_secret_fields: definition.id === "ai",
      source_file: "production/lib/operator-provider-catalog.mjs",
    });
  }),
);
export const OPERATOR_STORED_PROVIDERS = Object.freeze(
  DEFINITIONS.map((definition) => definition.id),
);
const BY_ID = new Map(DEFINITIONS.map((definition) => [definition.id, definition]));

export function operatorProviderDefinition(id) {
  const definition = BY_ID.get(String(id || "").trim());
  if (!definition) throw new Error("Unknown operator provider");
  return definition;
}

export function isOwnerConnectableProvider(id) {
  try {
    return operatorProviderDefinition(id).ownerConnectable === true;
  } catch {
    return false;
  }
}

function trimmed(value) {
  return String(value || "").trim();
}

// hermesProviderConfigFromEnv throws on a malformed HERMES_PROVIDER_MODE. A bad
// value must render as "needs one-time setup", not take the whole page down.
function hermesConfig(env) {
  try {
    return hermesProviderConfigFromEnv(env);
  } catch {
    return { mode: null, endpoint: "", endpoint_redacted: null, model: "", has_api_key: false };
  }
}

export function operatorProviderConfigFromEnv(env = process.env) {
  return {
    ...providerConnectionConfigFromEnv(env),
    githubClientId: trimmed(env.MS_REALTY_GITHUB_OAUTH_CLIENT_ID),
    githubClientSecret: trimmed(env.MS_REALTY_GITHUB_OAUTH_CLIENT_SECRET),
    hermes: hermesConfig(env),
  };
}

function storeMissing(config) {
  const missing = [];
  if (!trimmed(config.credentialSecret) || String(config.credentialSecret || "").length < 32) {
    missing.push("MS_REALTY_PROVIDER_TOKEN_KEY");
  }
  if (!trimmed(config.payloadSecret)) missing.push("PAYLOAD_SECRET");
  if (!trimmed(config.databaseUrl)) missing.push("DATABASE_URL");
  return missing;
}

function originMissing(config) {
  if (!trimmed(config.publicOrigin)) return ["MS_REALTY_PUBLIC_ORIGIN"];
  try {
    exactOrigin(config.publicOrigin, "MS_REALTY_PUBLIC_ORIGIN");
    return [];
  } catch {
    return ["MS_REALTY_PUBLIC_ORIGIN"];
  }
}

function stateMissing(config) {
  return trimmed(config.stateSecret) && String(config.stateSecret).length >= 32
    ? []
    : ["MS_REALTY_PROVIDER_OAUTH_STATE_SECRET"];
}

// Availability for the providers the original three-channel module does not
// cover. google/whatsapp/viber keep their existing, already-tested computation
// so this screen can never disagree with the delivery paths about them.
export function operatorProviderAvailability(config = operatorProviderConfigFromEnv()) {
  const base = providerConnectionAvailability(config);
  const store = storeMissing(config);
  const origin = originMissing(config);
  const state = stateMissing(config);
  const meta = [
    ...origin,
    ...(trimmed(config.metaAppId) ? [] : ["MS_REALTY_META_APP_ID"]),
    ...(trimmed(config.metaAppSecret) ? [] : ["MS_REALTY_META_APP_SECRET"]),
    ...(/^v\d+\.\d+$/.test(trimmed(config.metaGraphVersion)) ? [] : ["MS_REALTY_META_GRAPH_VERSION"]),
    ...state,
    ...store,
  ];
  const google = [
    ...origin,
    ...(trimmed(config.googleClientId) ? [] : ["MS_REALTY_GOOGLE_OAUTH_CLIENT_ID"]),
    ...(trimmed(config.googleClientSecret) ? [] : ["MS_REALTY_GOOGLE_OAUTH_CLIENT_SECRET"]),
    ...state,
    ...store,
  ];
  const github = [
    ...origin,
    ...(trimmed(config.githubClientId) ? [] : ["MS_REALTY_GITHUB_OAUTH_CLIENT_ID"]),
    ...(trimmed(config.githubClientSecret) ? [] : ["MS_REALTY_GITHUB_OAUTH_CLIENT_SECRET"]),
    ...state,
    ...store,
  ];
  // Endpoint, model and key arrive together in the owner form; before the
  // provider readback, this path only needs somewhere encrypted to save them.
  const ai = store;
  const entry = (missing) => ({ ready: missing.length === 0, missing: [...new Set(missing)] });
  return {
    ...base,
    google_drive: entry(google),
    facebook: entry([
      ...meta,
      ...(config.metaFacebookPublishReady ? [] : ["MS_REALTY_META_FACEBOOK_PUBLISH_READY"]),
    ]),
    instagram: entry([
      ...meta,
      ...(config.metaInstagramPublishReady ? [] : ["MS_REALTY_META_INSTAGRAM_PUBLISH_READY"]),
    ]),
    github: entry(github),
    cloudflare: entry(store),
    neon: entry(store),
    ai: entry(ai),
  };
}

// One card per provider, already reduced to what the renderer needs. `status`
// is the pill: connected only when the provider itself confirmed an account.
export function operatorProviderCards({
  connections = [],
  availability = operatorProviderAvailability(),
  config = null,
} = {}) {
  const stored = new Map(
    (Array.isArray(connections) ? connections : []).map((connection) => [String(connection.provider), connection]),
  );
  const hermes = config?.hermes || {};
  return DEFINITIONS.map((definition) => {
    const connection = stored.get(definition.id) || null;
    const ready = availability[definition.id]?.ready === true;
    const storedStatus = trimmed(connection?.status);
    const connected = storedStatus === "connected";
    const supported = definition.supported !== false;
    const status =
      storedStatus === "connecting" || storedStatus === "unavailable"
        ? storedStatus
        : !supported
          ? "disabled"
          : connected
              ? "connected"
              : ready
                ? "not_connected"
                : "needs_setup";
    return {
      id: definition.id,
      kind: definition.kind,
      family: definition.family,
      status,
      supported,
      owner_connectable: definition.ownerConnectable === true,
      ready,
      scopes: definition.scopes ? [...definition.scopes] : [],
      setup_env: supported
        ? [...definition.setupEnv, ...STORE_ENV].filter(
            (name, index, all) => all.indexOf(name) === index,
          )
        : [],
      setup_url: supported ? definition.setupUrl : "",
      missing: availability[definition.id]?.missing || [],
      account_label: connection?.account_label || "",
      last_verified_at: connection?.last_verified_at || null,
      // Endpoint and model are safe operational metadata. The credential
      // envelope is never part of a card or status response.
      endpoint:
        definition.id === "ai"
          ? trimmed(connection?.metadata?.endpoint) || DEFAULT_OPENROUTER_CHAT_COMPLETIONS_URL
          : null,
      model:
        definition.id === "ai"
          ? trimmed(connection?.metadata?.model) || (hermes.mode === "openrouter" ? trimmed(hermes.model) : "") || null
          : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Authorization-code flows
// ---------------------------------------------------------------------------

function redirectUri(config, provider) {
  const origin = exactOrigin(config.publicOrigin, "MS_REALTY_PUBLIC_ORIGIN");
  return `${origin}/api/admin/connections?provider=${provider}&action=callback`;
}

function requireReady(availability, provider) {
  if (availability[provider]?.ready !== true) throw new Error(`${provider} is not configured`);
}

export function operatorProviderAuthorizationUrl({
  provider,
  config = operatorProviderConfigFromEnv(),
  operatorId,
  now,
} = {}) {
  const definition = operatorProviderDefinition(provider);
  if (definition.kind !== "oauth") throw new Error(`${provider} does not use an authorization-code flow`);
  requireReady(operatorProviderAvailability(config), definition.id);
  // Bound to this provider and this operator, signed, and short lived: a state
  // minted for one card cannot be replayed against another.
  const state = createProviderOAuthState(
    { provider: definition.id, operatorId },
    { stateSecret: config.stateSecret, now },
  );
  const url =
    definition.family === "google"
      ? new URL("https://accounts.google.com/o/oauth2/v2/auth")
      : definition.family === "meta"
        ? new URL(`https://www.facebook.com/${config.metaGraphVersion}/dialog/oauth`)
        : new URL("https://github.com/login/oauth/authorize");
  const parameters =
    definition.family === "google"
      ? {
          access_type: "offline",
          client_id: config.googleClientId,
          include_granted_scopes: "true",
          prompt: "consent",
          redirect_uri: redirectUri(config, definition.id),
          response_type: "code",
          scope: definition.scopes.join(" "),
          state,
        }
      : definition.family === "meta"
        ? {
            client_id: config.metaAppId,
            redirect_uri: redirectUri(config, definition.id),
            response_type: "code",
            scope: definition.scopes.join(","),
            state,
          }
        : {
            allow_signup: "false",
            client_id: config.githubClientId,
            redirect_uri: redirectUri(config, definition.id),
            scope: definition.scopes.join(" "),
            state,
          };
  url.search = new URLSearchParams(parameters).toString();
  return url.toString();
}

async function exchangeGoogleCode({ definition, code, config, fetchImpl, existingRefreshToken, now }) {
  const tokenResponse = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      code: String(code),
      grant_type: "authorization_code",
      redirect_uri: redirectUri(config, definition.id),
    }),
  });
  const tokens = await responseJson(tokenResponse, "Google OAuth");
  const accessToken = trimmed(tokens.access_token);
  // Google only returns a refresh token on first consent; a re-consent that
  // omits it must keep the one already stored rather than saving a connection
  // that stops working the moment the access token expires.
  const refreshToken = trimmed(tokens.refresh_token) || trimmed(existingRefreshToken);
  const granted = new Set(String(tokens.scope || "").split(/\s+/).filter(Boolean));
  if (!accessToken || !refreshToken || definition.scopes.some((scope) => !granted.has(scope))) {
    throw new Error("Google did not grant the scopes this connection needs");
  }
  const user = await responseJson(
    await fetchImpl("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { authorization: `Bearer ${accessToken}` },
    }),
    "Google account readback",
  );
  if (!user.id || !user.email) throw new Error("Google account readback is incomplete");
  return {
    provider: definition.id,
    status: "connected",
    accountLabel: String(user.email),
    externalAccountId: String(user.id),
    scopes: [...granted].sort(),
    metadata: { email: String(user.email) },
    credentials: {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: trimmed(tokens.token_type) || "Bearer",
      expires_at: new Date(now + Number(tokens.expires_in || 3600) * 1000).toISOString(),
    },
  };
}

async function exchangeMetaCode({ definition, code, config, fetchImpl, now }) {
  const graph = `https://graph.facebook.com/${config.metaGraphVersion}`;
  const exchange = new URL(`${graph}/oauth/access_token`);
  exchange.search = new URLSearchParams({
    client_id: config.metaAppId,
    client_secret: config.metaAppSecret,
    code: String(code),
    redirect_uri: redirectUri(config, definition.id),
  }).toString();
  const shortLived = await responseJson(await fetchImpl(exchange), "Meta OAuth");
  const shortLivedToken = trimmed(shortLived.access_token);
  if (!shortLivedToken) throw new Error("Meta did not return an access token");
  const token = await responseJson(
    await fetchImpl(
      `${graph}/oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: config.metaAppId,
        client_secret: config.metaAppSecret,
        fb_exchange_token: shortLivedToken,
      })}`,
    ),
    "Meta long-lived token exchange",
  );
  const userAccessToken = trimmed(token.access_token);
  if (!userAccessToken) throw new Error("Meta did not return a long-lived access token");
  const permissions = await responseJson(
    await fetchImpl(`${graph}/me/permissions`, {
      headers: { authorization: `Bearer ${userAccessToken}` },
    }),
    "Meta permission readback",
  );
  const granted = new Set(
    (Array.isArray(permissions.data) ? permissions.data : [])
      .filter((entry) => entry?.status === "granted" && entry?.permission)
      .map((entry) => String(entry.permission)),
  );
  if (definition.scopes.some((scope) => !granted.has(scope))) {
    throw new Error("Meta did not grant the scopes this connection needs");
  }
  const fields =
    definition.id === "instagram"
      ? "id,name,access_token,instagram_business_account{id,username}"
      : "id,name,access_token";
  const accounts = await responseJson(
    await fetchImpl(`${graph}/me/accounts?fields=${encodeURIComponent(fields)}`, {
      headers: { authorization: `Bearer ${userAccessToken}` },
    }),
    "Meta page readback",
  );
  const pages = Array.isArray(accounts.data) ? accounts.data : [];
  // Instagram messaging and publishing run through the Facebook Page the
  // professional account is linked to, so a Page without one cannot serve this
  // card and saying so is more useful than storing a token that cannot post.
  const page =
    definition.id === "instagram"
      ? pages.find((candidate) => candidate?.instagram_business_account?.id && trimmed(candidate?.access_token))
      : pages.find((candidate) => trimmed(candidate?.access_token));
  if (!page?.id) {
    throw new Error(
      definition.id === "instagram"
        ? "No Facebook Page with a linked Instagram professional account was granted"
        : "No Facebook Page was granted",
    );
  }
  const pageAccessToken = trimmed(page.access_token);
  if (!pageAccessToken) throw new Error("Meta did not return a Page access token");
  const instagram = page.instagram_business_account || null;
  return {
    provider: definition.id,
    status: "connected",
    accountLabel: String(instagram?.username ? `@${instagram.username}` : page.name || page.id),
    externalAccountId: String(instagram?.id || page.id),
    scopes: [...granted].sort(),
    metadata: {
      page_id: String(page.id),
      page_name: page.name ? String(page.name) : null,
      ...(instagram ? { instagram_account_id: String(instagram.id) } : {}),
    },
    credentials: {
      user_access_token: userAccessToken,
      user_expires_at: new Date(Number(now) + Number(token.expires_in || 60 * 24 * 60 * 60) * 1000).toISOString(),
      page_access_token: pageAccessToken,
      page_id: String(page.id),
      ...(instagram ? { instagram_account_id: String(instagram.id) } : {}),
    },
  };
}

async function exchangeGitHubCode({ definition, code, config, fetchImpl }) {
  const token = await responseJson(
    await fetchImpl("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.githubClientId,
        client_secret: config.githubClientSecret,
        code: String(code),
        redirect_uri: redirectUri(config, definition.id),
      }),
    }),
    "GitHub OAuth",
  );
  const accessToken = trimmed(token.access_token);
  if (!accessToken) throw new Error("GitHub did not return an access token");
  const granted = new Set(String(token.scope || "").split(",").map((scope) => scope.trim()).filter(Boolean));
  if (definition.scopes.some((scope) => !granted.has(scope))) {
    throw new Error("GitHub did not grant the scopes this connection needs");
  }
  const user = await responseJson(
    await fetchImpl("https://api.github.com/user", {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${accessToken}`,
        "user-agent": "ms-realty-admin",
      },
    }),
    "GitHub account readback",
  );
  if (!user.id || !user.login) throw new Error("GitHub account readback is incomplete");
  return {
    provider: definition.id,
    status: "connected",
    accountLabel: String(user.login),
    externalAccountId: String(user.id),
    scopes: [...granted].sort(),
    metadata: { login: String(user.login) },
    credentials: { access_token: accessToken, token_type: trimmed(token.token_type) || "bearer" },
  };
}

// Verifies the round trip, then proves the grant by reading the account back
// from the provider. Nothing is stored on the strength of a redirect alone.
export async function completeOperatorProviderOAuth(
  { provider, code, state, operatorId, existingRefreshToken = "" },
  { config = operatorProviderConfigFromEnv(), fetchImpl = fetch, now = Date.now() } = {},
) {
  const definition = operatorProviderDefinition(provider);
  if (definition.kind !== "oauth") throw new Error(`${provider} does not use an authorization-code flow`);
  requireReady(operatorProviderAvailability(config), definition.id);
  verifyProviderOAuthState(state, {
    provider: definition.id,
    operatorId,
    stateSecret: config.stateSecret,
    now,
  });
  if (!trimmed(code)) throw new Error(`${provider} did not return an authorization code`);
  if (definition.family === "google") {
    return exchangeGoogleCode({ definition, code, config, fetchImpl, existingRefreshToken, now });
  }
  if (definition.family === "meta") return exchangeMetaCode({ definition, code, config, fetchImpl, now });
  return exchangeGitHubCode({ definition, code, config, fetchImpl });
}

// ---------------------------------------------------------------------------
// Pasted-token flows: one value in, one real API call, then storage
// ---------------------------------------------------------------------------

async function verifyCloudflareToken(token, fetchImpl) {
  const body = await responseJson(
    await fetchImpl("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    }),
    "Cloudflare token verification",
  );
  if (body.success !== true || body.result?.status !== "active") {
    throw new Error("Cloudflare did not report this token as active");
  }
  return {
    accountLabel: String(body.result?.id || "Cloudflare API token"),
    externalAccountId: String(body.result?.id || ""),
    metadata: { token_status: String(body.result.status), expires_on: body.result?.expires_on || null },
  };
}

async function verifyNeonKey(token, fetchImpl) {
  const body = await responseJson(
    await fetchImpl("https://console.neon.tech/api/v2/projects?limit=1", {
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
    }),
    "Neon key verification",
  );
  if (!Array.isArray(body.projects)) throw new Error("Neon did not return a project list");
  const project = body.projects[0] || null;
  return {
    accountLabel: String(project?.name || "Neon account"),
    externalAccountId: String(project?.id || ""),
    metadata: { project_count: body.projects.length },
  };
}

export async function completeOperatorTokenConnection(
  { provider, token },
  { config = operatorProviderConfigFromEnv(), fetchImpl = fetch } = {},
) {
  const definition = operatorProviderDefinition(provider);
  if (definition.kind !== "token" || definition.family === "viber") {
    throw new Error(`${provider} is not a pasted-token connection`);
  }
  requireReady(operatorProviderAvailability(config), definition.id);
  const value = trimmed(token);
  if (value.length < 20) throw new Error(`${provider} token is too short to be real`);
  const verified =
    definition.family === "cloudflare" ? await verifyCloudflareToken(value, fetchImpl) : await verifyNeonKey(value, fetchImpl);
  return {
    provider: definition.id,
    status: "connected",
    accountLabel: verified.accountLabel,
    externalAccountId: verified.externalAccountId,
    scopes: [],
    metadata: verified.metadata,
    credentials: { api_token: value },
  };
}

// ---------------------------------------------------------------------------
// The OpenRouter model provider: verified, then encrypted
// ---------------------------------------------------------------------------

export class OperatorProviderConnectionError extends Error {
  constructor(code, message, cause = null) {
    super(message);
    this.name = "OperatorProviderConnectionError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function openRouterInput({ endpoint, model, apiKey }) {
  const resolvedEndpoint = trimmed(endpoint);
  if (resolvedEndpoint !== DEFAULT_OPENROUTER_CHAT_COMPLETIONS_URL) {
    throw new OperatorProviderConnectionError(
      "openrouter_endpoint_invalid",
      `OpenRouter endpoint must be ${DEFAULT_OPENROUTER_CHAT_COMPLETIONS_URL}`,
    );
  }
  const resolvedModel = trimmed(model);
  if (!resolvedModel || resolvedModel.length > 160 || /[\u0000-\u001f\s]/.test(resolvedModel)) {
    throw new OperatorProviderConnectionError("openrouter_model_invalid", "OpenRouter model is invalid");
  }
  const resolvedKey = String(apiKey || "").trim();
  if (resolvedKey.length < 20 || /[\u0000-\u0020\u007f]/.test(resolvedKey)) {
    throw new OperatorProviderConnectionError("openrouter_api_key_invalid", "OpenRouter API key is invalid");
  }
  return { endpoint: resolvedEndpoint, model: resolvedModel, apiKey: resolvedKey };
}

// A one-token completion is the smallest authoritative proof that the submitted
// key may call the exact model through the exact runtime endpoint. The prompt is
// static and contains no MS Realty or customer data.
export async function verifyOperatorAiProvider({ endpoint, model, apiKey, fetchImpl = fetch } = {}) {
  const input = openRouterInput({ endpoint, model, apiKey });
  let body;
  try {
    body = await responseJson(
      await fetchImpl(input.endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${input.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: input.model,
          messages: [{ role: "user", content: "Reply with OK." }],
          max_tokens: 1,
          temperature: 0,
          stream: false,
        }),
      }),
      "OpenRouter chat-completions readback",
    );
  } catch (cause) {
    throw new OperatorProviderConnectionError(
      "openrouter_verification_failed",
      "OpenRouter did not confirm the API key",
      cause,
    );
  }
  if (!Array.isArray(body?.choices) || !body.choices[0] || typeof body.choices[0] !== "object") {
    throw new OperatorProviderConnectionError(
      "openrouter_verification_failed",
      "OpenRouter did not confirm the selected model and API key",
    );
  }
  return {
    provider: "ai",
    status: "connected",
    accountLabel: input.model,
    externalAccountId: input.model,
    scopes: ["chat.completions"],
    metadata: {
      mode: "openrouter",
      endpoint: input.endpoint,
      model: input.model,
      key_verified: true,
      verification: "one_token_chat_completion",
    },
    credentials: { api_key: input.apiKey, endpoint: input.endpoint, model: input.model },
  };
}

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------

// Best effort at the provider, then the caller deletes the row. A provider that
// refuses the revoke must not strand the operator with a credential they can no
// longer remove from here, so the outcome is reported rather than thrown.
export async function revokeOperatorProvider(
  { provider, credentials = {} },
  { config = operatorProviderConfigFromEnv(), fetchImpl = fetch } = {},
) {
  const definition = operatorProviderDefinition(provider);
  const token = trimmed(
    credentials.refresh_token ||
      credentials.user_access_token ||
      credentials.page_access_token ||
      credentials.access_token ||
      credentials.api_token ||
      credentials.auth_token,
  );
  try {
    if (definition.family === "google" && token) {
      const revoke = new URL("https://oauth2.googleapis.com/revoke");
      revoke.search = new URLSearchParams({ token }).toString();
      const response = await fetchImpl(revoke.toString(), { method: "POST" });
      return { provider: definition.id, revoked: response.ok === true };
    }
    if (definition.family === "meta" && token) {
      const response = await fetchImpl(`https://graph.facebook.com/${config.metaGraphVersion}/me/permissions`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      return { provider: definition.id, revoked: response.ok === true };
    }
    if (definition.family === "github" && token) {
      const basic = Buffer.from(`${config.githubClientId}:${config.githubClientSecret}`).toString("base64");
      const response = await fetchImpl(`https://api.github.com/applications/${config.githubClientId}/grant`, {
        method: "DELETE",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Basic ${basic}`,
          "content-type": "application/json",
          "user-agent": "ms-realty-admin",
        },
        body: JSON.stringify({ access_token: token }),
      });
      return { provider: definition.id, revoked: response.ok === true };
    }
    if (definition.family === "viber" && token) {
      // Viber has no token revocation; clearing the webhook is what actually
      // stops the bot reaching this deployment.
      const response = await fetchImpl("https://chatapi.viber.com/pa/set_webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-viber-auth-token": token },
        body: JSON.stringify({ url: "" }),
      });
      return { provider: definition.id, revoked: response.ok === true };
    }
  } catch {
    return { provider: definition.id, revoked: false };
  }
  // Cloudflare and Neon keys can only be destroyed in their own dashboards; the
  // card says so rather than pretending this button did it.
  return { provider: definition.id, revoked: false };
}
