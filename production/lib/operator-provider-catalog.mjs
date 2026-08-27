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
//   runtime          The Hermes model provider. Its key is read from the
//                    process environment by the drafting worker and the repo's
//                    provisioning contract lists it as never-persist, so this
//                    card verifies and reports -- it does not collect a key it
//                    could not make anything do.
//
// A provider whose application has not been registered yet renders as
// "needs one-time setup" with a plain unavailable/recovery explanation, never
// as a button that would fail or a credential checklist for the owner.

import { hermesProviderConfigFromEnv } from "./hermes-provider-provisioning.mjs";
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
export const FACEBOOK_SCOPES = Object.freeze(["pages_show_list", "pages_read_engagement", "pages_manage_metadata"]);
export const INSTAGRAM_SCOPES = Object.freeze(["pages_show_list", "instagram_basic", "instagram_manage_comments"]);
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
    scopes: FACEBOOK_SCOPES,
    setupEnv: [
      "MS_REALTY_PUBLIC_ORIGIN",
      "MS_REALTY_META_APP_ID",
      "MS_REALTY_META_APP_SECRET",
      "MS_REALTY_META_GRAPH_VERSION",
      "MS_REALTY_PROVIDER_OAUTH_STATE_SECRET",
    ],
    setupUrl: "https://developers.facebook.com/apps",
  },
  {
    id: "instagram",
    kind: "oauth",
    family: "meta",
    scopes: INSTAGRAM_SCOPES,
    setupEnv: [
      "MS_REALTY_PUBLIC_ORIGIN",
      "MS_REALTY_META_APP_ID",
      "MS_REALTY_META_APP_SECRET",
      "MS_REALTY_META_GRAPH_VERSION",
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
    kind: "runtime",
    family: "hermes",
    setupEnv: ["HERMES_CHAT_COMPLETIONS_URL", "HERMES_API_KEY"],
    setupUrl: "https://openrouter.ai/settings/keys",
  },
]);

export const OPERATOR_PROVIDERS = Object.freeze(DEFINITIONS.map((definition) => definition.id));
// Everything except the runtime card is a row in the connection store.
export const OPERATOR_STORED_PROVIDERS = Object.freeze(
  DEFINITIONS.filter((definition) => definition.kind !== "runtime").map((definition) => definition.id),
);
const BY_ID = new Map(DEFINITIONS.map((definition) => [definition.id, definition]));

export function operatorProviderDefinition(id) {
  const definition = BY_ID.get(String(id || "").trim());
  if (!definition) throw new Error("Unknown operator provider");
  return definition;
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
  // A pasted key only needs somewhere safe to live.
  const hermes = config.hermes || {};
  const ai = [
    ...(trimmed(hermes.endpoint) ? [] : ["HERMES_CHAT_COMPLETIONS_URL"]),
    ...(hermes.has_api_key ? [] : ["HERMES_API_KEY"]),
  ];
  const entry = (missing) => ({ ready: missing.length === 0, missing: [...new Set(missing)] });
  return {
    ...base,
    google_drive: entry(google),
    facebook: entry(meta),
    instagram: entry(meta),
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
    const connected = connection?.status === "connected";
    const supported = definition.supported !== false;
    return {
      id: definition.id,
      kind: definition.kind,
      family: definition.family,
      status: !supported
        ? "disabled"
        : definition.kind === "runtime"
          ? ready
            ? "configured"
            : "disabled"
          : connected
            ? "connected"
            : ready
              ? "not_connected"
              : "needs_setup",
      supported,
      ready,
      scopes: definition.scopes ? [...definition.scopes] : [],
      setup_env: supported
        ? [...definition.setupEnv, ...(definition.kind === "runtime" ? [] : STORE_ENV)].filter(
            (name, index, all) => all.indexOf(name) === index,
          )
        : [],
      setup_url: supported ? definition.setupUrl : "",
      missing: availability[definition.id]?.missing || [],
      account_label: connection?.account_label || "",
      last_verified_at: connection?.last_verified_at || null,
      // The runtime card reports where it would call and with which model; the
      // key itself is never read back into the page.
      endpoint: definition.kind === "runtime" ? hermes.endpoint_redacted || null : null,
      model: definition.kind === "runtime" ? trimmed(hermes.model) || null : null,
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

async function exchangeMetaCode({ definition, code, config, fetchImpl }) {
  const graph = `https://graph.facebook.com/${config.metaGraphVersion}`;
  const exchange = new URL(`${graph}/oauth/access_token`);
  exchange.search = new URLSearchParams({
    client_id: config.metaAppId,
    client_secret: config.metaAppSecret,
    code: String(code),
    redirect_uri: redirectUri(config, definition.id),
  }).toString();
  const token = await responseJson(await fetchImpl(exchange), "Meta OAuth");
  const accessToken = trimmed(token.access_token);
  if (!accessToken) throw new Error("Meta did not return an access token");
  const fields =
    definition.id === "instagram"
      ? "id,name,instagram_business_account{id,username}"
      : "id,name";
  const accounts = await responseJson(
    await fetchImpl(`${graph}/me/accounts?fields=${encodeURIComponent(fields)}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    }),
    "Meta page readback",
  );
  const pages = Array.isArray(accounts.data) ? accounts.data : [];
  // Instagram messaging and publishing run through the Facebook Page the
  // professional account is linked to, so a Page without one cannot serve this
  // card and saying so is more useful than storing a token that cannot post.
  const page =
    definition.id === "instagram"
      ? pages.find((candidate) => candidate?.instagram_business_account?.id)
      : pages[0];
  if (!page?.id) {
    throw new Error(
      definition.id === "instagram"
        ? "No Facebook Page with a linked Instagram professional account was granted"
        : "No Facebook Page was granted",
    );
  }
  const instagram = page.instagram_business_account || null;
  return {
    provider: definition.id,
    status: "connected",
    accountLabel: String(instagram?.username ? `@${instagram.username}` : page.name || page.id),
    externalAccountId: String(instagram?.id || page.id),
    scopes: [...definition.scopes],
    metadata: {
      page_id: String(page.id),
      page_name: page.name ? String(page.name) : null,
      ...(instagram ? { instagram_account_id: String(instagram.id) } : {}),
    },
    credentials: { access_token: accessToken, page_id: String(page.id) },
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
  if (definition.family === "meta") return exchangeMetaCode({ definition, code, config, fetchImpl });
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
// The Hermes model provider: verified, never collected
// ---------------------------------------------------------------------------

// One cheap call against the endpoint the drafting worker would use, with the
// key the worker reads from the environment. The key never enters this page in
// either direction -- the repo's provisioning contract lists it as never-persist
// and the worker only ever reads it from the process environment, so a paste
// field here would store a secret that could not make anything happen.
export async function verifyOperatorAiProvider({
  config = operatorProviderConfigFromEnv(),
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const availability = operatorProviderAvailability(config);
  requireReady(availability, "ai");
  const hermes = config.hermes || {};
  const models = new URL(hermes.endpoint);
  models.pathname = models.pathname.replace(/\/chat\/completions\/?$/, "/models");
  models.search = "";
  const body = await responseJson(
    await fetchImpl(models.toString(), {
      headers: { accept: "application/json", authorization: `Bearer ${trimmed(env.HERMES_API_KEY)}` },
    }),
    "AI provider verification",
  );
  const listed = Array.isArray(body.data) ? body.data : [];
  return {
    provider: "ai",
    status: "connected",
    accountLabel: trimmed(hermes.model) || "Hermes model provider",
    externalAccountId: "",
    scopes: [],
    metadata: {
      mode: hermes.mode || null,
      endpoint: hermes.endpoint_redacted || null,
      model: trimmed(hermes.model) || null,
      models_listed: listed.length,
    },
    // Deliberately empty: the model key stays in the environment. The row
    // exists so the card can show a real "checked at" against a real answer.
    credentials: {},
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
  const token = trimmed(credentials.refresh_token || credentials.access_token || credentials.api_token || credentials.auth_token);
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
