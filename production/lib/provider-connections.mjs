import crypto from "node:crypto";
import { createPrivateContactEnvelope, openPrivateContactEnvelope } from "./private-contact-vault.mjs";

// Every channel or account the workbench can hold a credential for. The three
// original entries are the messaging providers; the rest were added so a
// non-technical operator can connect the agency's own tools from one screen.
// Adding an id here only makes the store accept it -- what a connection can
// actually do still comes from the flow that produced it.
const PROVIDERS = new Set([
  "google",
  "google_drive",
  "whatsapp",
  "viber",
  "facebook",
  "instagram",
  "github",
  "cloudflare",
  "neon",
  // The owner-managed OpenRouter connection. A key submitted through the
  // signed-in connection form lives only inside this row's encrypted envelope;
  // the separately managed HERMES_API_KEY environment fallback is never copied
  // into Payload.
  "ai",
]);
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

const GOOGLE_CALENDAR_SYNC_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";

export const PROVIDER_CONNECTION_COLLECTION = {
  slug: "provider_connections",
  admin: {
    useAsTitle: "provider",
    defaultColumns: ["provider", "status", "account_label", "last_verified_at"],
  },
  fields: [
    {
      name: "provider",
      type: "text",
      required: true,
      unique: true,
      index: true,
      maxLength: 24,
    },
    {
      name: "status",
      type: "text",
      required: true,
      index: true,
      maxLength: 32,
    },
    { name: "connected_by", type: "text", required: true, maxLength: 160 },
    // Provider credentials are workspace-owned even though the encrypted
    // envelope itself remains server-only. Optional keeps existing rows
    // readable during the migration; scoped callers fail closed for rows
    // without an explicit workspace id.
    { name: "workspace_id", type: "text", index: true, maxLength: 160 },
    { name: "account_label", type: "text", maxLength: 320 },
    { name: "external_account_id", type: "text", maxLength: 320 },
    { name: "scopes", type: "json" },
    { name: "metadata", type: "json" },
    {
      name: "credential_envelope",
      type: "json",
      required: true,
      admin: { hidden: true },
    },
    { name: "last_verified_at", type: "date", required: true, index: true },
  ],
};

export class ProviderConnectionUnavailableError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = "ProviderConnectionUnavailableError";
    this.code = "provider_connection_unavailable";
    if (cause) this.cause = cause;
  }
}

function exactOrigin(value, label) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error(`${label} must be a valid origin`);
  }
  if (!url.origin || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error(`${label} must be an exact origin`);
  }
  return url.origin;
}

function providerName(value) {
  const provider = String(value || "")
    .trim()
    .toLowerCase();
  if (!PROVIDERS.has(provider)) throw new Error("Unsupported provider");
  return provider;
}

function secret(value, label) {
  const result = String(value || "");
  if (result.length < 32) throw new Error(`${label} must be at least 32 characters`);
  return result;
}

export function providerConnectionConfigFromEnv(env = process.env) {
  return {
    publicOrigin: String(env.MS_REALTY_PUBLIC_ORIGIN || "").trim(),
    credentialSecret: String(env.MS_REALTY_PROVIDER_TOKEN_KEY || ""),
    stateSecret: String(env.MS_REALTY_PROVIDER_OAUTH_STATE_SECRET || ""),
    payloadSecret: String(env.PAYLOAD_SECRET || "").trim(),
    databaseUrl: String(env.DATABASE_URL || "").trim(),
    googleClientId: String(env.MS_REALTY_GOOGLE_OAUTH_CLIENT_ID || "").trim(),
    googleClientSecret: String(env.MS_REALTY_GOOGLE_OAUTH_CLIENT_SECRET || "").trim(),
    metaAppId: String(env.MS_REALTY_META_APP_ID || "").trim(),
    metaAppSecret: String(env.MS_REALTY_META_APP_SECRET || "").trim(),
    metaConfigId: String(env.MS_REALTY_META_EMBEDDED_SIGNUP_CONFIG_ID || "").trim(),
    metaGraphVersion: String(env.MS_REALTY_META_GRAPH_VERSION || "").trim(),
    metaFacebookPublishReady: String(env.MS_REALTY_META_FACEBOOK_PUBLISH_READY || "").trim() === "true",
    metaInstagramPublishReady: String(env.MS_REALTY_META_INSTAGRAM_PUBLISH_READY || "").trim() === "true",
    metaWebhookVerifyToken: String(env.MS_REALTY_META_WEBHOOK_VERIFY_TOKEN || "").trim(),
    viberCommercialReady: String(env.MS_REALTY_VIBER_COMMERCIAL_READY || "").trim() === "true",
    webhookMaxBytes: Number(env.MS_REALTY_PROVIDER_WEBHOOK_MAX_BYTES || 1024 * 1024),
  };
}

function missing(config, keys) {
  return keys.filter((key) => !String(config[key] || "").trim());
}

export function providerConnectionAvailability(config = providerConnectionConfigFromEnv()) {
  const storeMissing = missing(config, ["credentialSecret", "payloadSecret", "databaseUrl"]);
  if (config.credentialSecret && String(config.credentialSecret).length < 32) storeMissing.push("credentialSecret");
  const originMissing = missing(config, ["publicOrigin"]);
  if (config.publicOrigin) {
    try {
      exactOrigin(config.publicOrigin, "MS_REALTY_PUBLIC_ORIGIN");
    } catch {
      originMissing.push("publicOrigin");
    }
  }
  const googleMissing = [...originMissing, ...missing(config, ["googleClientId", "googleClientSecret", "stateSecret"]), ...storeMissing];
  if (config.stateSecret && String(config.stateSecret).length < 32) googleMissing.push("stateSecret");
  const whatsappMissing = [
    ...originMissing,
    ...missing(config, ["metaAppId", "metaAppSecret", "metaConfigId", "metaGraphVersion", "metaWebhookVerifyToken"]),
    ...storeMissing,
  ];
  if (config.metaWebhookVerifyToken && String(config.metaWebhookVerifyToken).length < 24) {
    whatsappMissing.push("metaWebhookVerifyToken");
  }
  if (config.metaAppSecret && String(config.metaAppSecret).length < 16) whatsappMissing.push("metaAppSecret");
  if (config.metaAppId && !/^\d{5,32}$/.test(config.metaAppId)) whatsappMissing.push("metaAppId");
  if (config.metaConfigId && !/^\d{5,32}$/.test(config.metaConfigId)) whatsappMissing.push("metaConfigId");
  if (config.metaGraphVersion && !/^v\d+\.\d+$/.test(config.metaGraphVersion)) whatsappMissing.push("metaGraphVersion");
  const viberMissing = [...originMissing, ...storeMissing];
  if (!config.viberCommercialReady) viberMissing.push("viberCommercialReady");
  if (!Number.isSafeInteger(config.webhookMaxBytes) || config.webhookMaxBytes < 1024 || config.webhookMaxBytes > 10 * 1024 * 1024) {
    whatsappMissing.push("webhookMaxBytes");
    viberMissing.push("webhookMaxBytes");
  }
  return {
    store: {
      ready: storeMissing.length === 0,
      missing: [...new Set(storeMissing)],
    },
    google: {
      ready: googleMissing.length === 0,
      missing: [...new Set(googleMissing)],
    },
    whatsapp: {
      ready: whatsappMissing.length === 0,
      missing: [...new Set(whatsappMissing)],
      app_id: config.metaAppId || null,
      config_id: config.metaConfigId || null,
      graph_version: /^v\d+\.\d+$/.test(config.metaGraphVersion) ? config.metaGraphVersion : null,
    },
    viber: {
      ready: viberMissing.length === 0,
      missing: [...new Set(viberMissing)],
    },
  };
}

function stateSignature(encoded, stateSecret) {
  return crypto.createHmac("sha256", secret(stateSecret, "provider OAuth state secret")).update(encoded).digest("base64url");
}

export function createProviderOAuthState({ provider, operatorId }, { stateSecret, now = Date.now(), ttlMs = 10 * 60 * 1000 } = {}) {
  const payload = {
    v: 1,
    provider: providerName(provider),
    operator_id: String(operatorId || "").trim(),
    issued_at: now,
    expires_at: now + ttlMs,
    nonce: crypto.randomUUID(),
  };
  if (!payload.operator_id) throw new Error("Provider OAuth state requires an operator");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${stateSignature(encoded, stateSecret)}`;
}

export function verifyProviderOAuthState(value, { provider, operatorId, stateSecret, now = Date.now() } = {}) {
  const [encoded, suppliedSignature, extra] = String(value || "").split(".");
  if (!encoded || !suppliedSignature || extra) throw new Error("Invalid provider OAuth state");
  const expectedSignature = stateSignature(encoded, stateSecret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw new Error("Invalid provider OAuth state");
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid provider OAuth state");
  }
  if (
    payload.v !== 1 ||
    payload.provider !== providerName(provider) ||
    payload.operator_id !== String(operatorId || "").trim() ||
    !Number.isFinite(payload.issued_at) ||
    !Number.isFinite(payload.expires_at) ||
    payload.issued_at > now + 30_000 ||
    payload.expires_at < now
  ) {
    throw new Error("Invalid or expired provider OAuth state");
  }
  return payload;
}

export function googleAuthorizationUrl({ config = providerConnectionConfigFromEnv(), operatorId, now } = {}) {
  if (!providerConnectionAvailability(config).google.ready) throw new Error("Google OAuth is not configured");
  const origin = exactOrigin(config.publicOrigin, "MS_REALTY_PUBLIC_ORIGIN");
  const state = createProviderOAuthState({ provider: "google", operatorId }, { stateSecret: config.stateSecret, now });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    access_type: "offline",
    client_id: config.googleClientId,
    include_granted_scopes: "true",
    prompt: "consent",
    redirect_uri: `${origin}/api/admin/connections?provider=google&action=callback`,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    state,
  }).toString();
  return url.toString();
}

async function responseJson(response, label) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${label} returned an invalid response`);
  }
  if (!response.ok) throw new Error(`${label} rejected the request`);
  return body;
}

export async function completeGoogleOAuth(
  { code, state, operatorId, existingRefreshToken = "" },
  { config = providerConnectionConfigFromEnv(), fetchImpl = fetch, now = Date.now() } = {},
) {
  if (!providerConnectionAvailability(config).google.ready) throw new Error("Google OAuth is not configured");
  verifyProviderOAuthState(state, {
    provider: "google",
    operatorId,
    stateSecret: config.stateSecret,
    now,
  });
  if (!String(code || "").trim()) throw new Error("Google did not return an authorization code");
  const origin = exactOrigin(config.publicOrigin, "MS_REALTY_PUBLIC_ORIGIN");
  const tokenResponse = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      code: String(code),
      grant_type: "authorization_code",
      redirect_uri: `${origin}/api/admin/connections?provider=google&action=callback`,
    }),
  });
  const tokens = await responseJson(tokenResponse, "Google OAuth");
  const accessToken = String(tokens.access_token || "");
  const refreshToken = String(tokens.refresh_token || existingRefreshToken || "");
  const scopes = [
    ...new Set(
      String(tokens.scope || "")
        .split(/\s+/)
        .filter(Boolean),
    ),
  ].sort();
  if (!accessToken || !refreshToken || GOOGLE_SCOPES.some((scope) => !scopes.includes(scope))) {
    throw new Error("Google did not grant the required Gmail and Calendar scopes");
  }
  const userInfoResponse = await fetchImpl("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const user = await responseJson(userInfoResponse, "Google account readback");
  if (!user.id || !user.email || user.verified_email === false) throw new Error("Google account readback is incomplete");
  return {
    provider: "google",
    status: "connected",
    accountLabel: String(user.email),
    externalAccountId: String(user.id),
    scopes,
    metadata: {
      email: String(user.email),
      email_verified: user.verified_email !== false,
    },
    credentials: {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: String(tokens.token_type || "Bearer"),
      expires_at: new Date(now + Number(tokens.expires_in || 3600) * 1000).toISOString(),
    },
  };
}

function metaId(value, label) {
  const result = String(value || "").trim();
  if (!/^\d{5,32}$/.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

export async function completeWhatsAppEmbeddedSignup(
  { code, wabaId, phoneNumberId },
  { config = providerConnectionConfigFromEnv(), fetchImpl = fetch } = {},
) {
  if (!providerConnectionAvailability(config).whatsapp.ready) throw new Error("WhatsApp Embedded Signup is not configured");
  if (!String(code || "").trim()) throw new Error("Meta did not return an authorization code");
  const waba = metaId(wabaId, "WhatsApp Business Account id");
  const phone = metaId(phoneNumberId, "WhatsApp phone number id");
  const graph = `https://graph.facebook.com/${config.metaGraphVersion}`;
  const exchangeUrl = new URL(`${graph}/oauth/access_token`);
  exchangeUrl.search = new URLSearchParams({
    client_id: config.metaAppId,
    client_secret: config.metaAppSecret,
    code: String(code),
  }).toString();
  const token = await responseJson(await fetchImpl(exchangeUrl), "Meta Embedded Signup");
  const accessToken = String(token.access_token || "");
  if (!accessToken) throw new Error("Meta did not return an access token");
  const headers = { authorization: `Bearer ${accessToken}` };
  const [account, phoneInfo] = await Promise.all([
    responseJson(
      await fetchImpl(`${graph}/${waba}?fields=id,name,currency,timezone_id`, {
        headers,
      }),
      "WhatsApp account readback",
    ),
    responseJson(
      await fetchImpl(`${graph}/${phone}?fields=id,display_phone_number,verified_name,quality_rating`, { headers }),
      "WhatsApp phone readback",
    ),
  ]);
  if (String(account.id || "") !== waba || String(phoneInfo.id || "") !== phone) {
    throw new Error("Meta account readback did not match the selected WhatsApp account");
  }
  return {
    provider: "whatsapp",
    status: "connecting",
    accountLabel: String(phoneInfo.verified_name || account.name || phoneInfo.display_phone_number || waba),
    externalAccountId: waba,
    scopes: ["business_management", "whatsapp_business_management", "whatsapp_business_messaging"],
    metadata: {
      phone_number_id: phone,
      display_phone_number: phoneInfo.display_phone_number || null,
      quality_rating: phoneInfo.quality_rating || null,
      webhook_subscribed: false,
    },
    credentials: {
      access_token: accessToken,
      waba_id: waba,
      phone_number_id: phone,
    },
  };
}

export async function registerWhatsAppWebhook(connection, { config = providerConnectionConfigFromEnv(), fetchImpl = fetch } = {}) {
  const credentials = connection?.credentials;
  if (connection?.provider !== "whatsapp" || !credentials?.access_token || !credentials?.waba_id) {
    throw new Error("A verified WhatsApp account is required before webhook subscription");
  }
  const graph = `https://graph.facebook.com/${config.metaGraphVersion}`;
  const subscription = await responseJson(
    await fetchImpl(`${graph}/${credentials.waba_id}/subscribed_apps`, {
      method: "POST",
      headers: { authorization: `Bearer ${credentials.access_token}` },
    }),
    "WhatsApp webhook subscription",
  );
  if (subscription.success !== true) throw new Error("WhatsApp webhook subscription was not confirmed");
  return {
    ...connection,
    status: "connected",
    metadata: { ...(connection.metadata || {}), webhook_subscribed: true },
  };
}

export async function completeViberConnection({ token }, { config = providerConnectionConfigFromEnv(), fetchImpl = fetch } = {}) {
  if (!providerConnectionAvailability(config).viber.ready) throw new Error("Viber commercial onboarding is not complete");
  const authToken = String(token || "").trim();
  if (authToken.length < 20) throw new Error("Viber bot token is invalid");
  const headers = {
    "content-type": "application/json",
    "x-viber-auth-token": authToken,
  };
  const account = await responseJson(
    await fetchImpl("https://chatapi.viber.com/pa/get_account_info", {
      method: "POST",
      headers,
      body: "{}",
    }),
    "Viber account readback",
  );
  if (Number(account.status) !== 0 || !account.id || !account.name) throw new Error("Viber account readback is incomplete");
  return {
    provider: "viber",
    status: "connecting",
    accountLabel: String(account.name),
    externalAccountId: String(account.id),
    scopes: ["messages"],
    metadata: { uri: account.uri || null, webhook_registered: false },
    credentials: { auth_token: authToken },
  };
}

export async function registerViberWebhook(connection, { config = providerConnectionConfigFromEnv(), fetchImpl = fetch } = {}) {
  if (connection?.provider !== "viber" || !connection?.credentials?.auth_token) {
    throw new Error("A verified Viber account is required before webhook registration");
  }
  const origin = exactOrigin(config.publicOrigin, "MS_REALTY_PUBLIC_ORIGIN");
  const headers = {
    "content-type": "application/json",
    "x-viber-auth-token": String(connection.credentials.auth_token),
  };
  const webhook = await responseJson(
    await fetchImpl("https://chatapi.viber.com/pa/set_webhook", {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: `${origin}/api/webhooks/viber`,
        event_types: ["message", "conversation_started", "subscribed", "unsubscribed", "delivered", "seen", "failed"],
        send_name: true,
        send_photo: true,
      }),
    }),
    "Viber webhook registration",
  );
  if (Number(webhook.status) !== 0) throw new Error("Viber webhook registration was not confirmed");
  return {
    ...connection,
    status: "connected",
    scopes: [...new Set([...(connection.scopes || []), "webhook"])],
    metadata: { ...(connection.metadata || {}), webhook_registered: true },
  };
}

function viewingCalendarEvent(viewing, { durationMinutes = 30 } = {}) {
  const startsAt = new Date(viewing?.starts_at || "");
  if (Number.isNaN(startsAt.getTime())) throw new Error("Viewing starts_at must be a valid ISO date");
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
  const viewingId = String(viewing?.id || "").trim() || "unknown";
  return {
    id: `msr${crypto.createHash("sha256").update(viewingId).digest("hex")}`,
    summary: `MS Realty viewing ${String(viewing?.listing_reference || viewing?.lead_id || "lead").trim()}`,
    description: [
      `Viewing ID: ${viewingId}`,
      `Lead ID: ${String(viewing?.lead_id || "").trim() || "unknown"}`,
      `Broker: ${String(viewing?.broker || "").trim() || "unassigned"}`,
      `Listing: ${String(viewing?.listing_reference || "").trim() || "not specified"}`,
    ].join("\n"),
    start: { dateTime: startsAt.toISOString() },
    end: { dateTime: endsAt.toISOString() },
    extendedProperties: {
      private: {
        ms_realty_viewing_id: viewingId,
        ms_realty_lead_id: String(viewing?.lead_id || "").trim() || "unknown",
      },
    },
  };
}

async function refreshGoogleAccessToken(
  refreshToken,
  { config = providerConnectionConfigFromEnv(), fetchImpl = fetch, requiredScope } = {},
) {
  const tokenResponse = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: String(refreshToken),
      grant_type: "refresh_token",
    }),
  });
  const refreshed = await responseJson(tokenResponse, "Google token refresh");
  const accessToken = String(refreshed.access_token || "");
  if (!accessToken) throw new Error("Google token refresh did not return an access token");
  const scopes = String(refreshed.scope || GOOGLE_SCOPES.join(" "))
    .split(/\s+/)
    .filter(Boolean);
  if (requiredScope && !scopes.includes(requiredScope)) {
    throw new Error("Google refresh token no longer grants calendar write access");
  }
  return { accessToken, scopes };
}

export async function syncViewingToGoogleCalendar(
  viewing,
  { config = providerConnectionConfigFromEnv(), payload = null, fetchImpl = fetch, durationMinutes = 30 } = {},
) {
  if (!String(config.googleClientId || "").trim() || !String(config.googleClientSecret || "").trim() || !String(config.credentialSecret || "").trim()) {
    return { status: "not_configured", provider: "google" };
  }
  const credentials = await readProviderCredentials("google", {
    credentialSecret: config.credentialSecret,
    payload,
  });
  if (!credentials?.refresh_token) return { status: "not_connected", provider: "google" };
  const { accessToken } = await refreshGoogleAccessToken(credentials.refresh_token, {
    config,
    fetchImpl,
    requiredScope: GOOGLE_CALENDAR_SYNC_SCOPE,
  });
  const requestedEvent = viewingCalendarEvent(viewing, { durationMinutes });
  const eventResponse = await fetchImpl("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(requestedEvent),
  });
  const event =
    eventResponse.status === 409
      ? await responseJson(
          await fetchImpl(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(requestedEvent.id)}`,
            { headers: { authorization: `Bearer ${accessToken}` } },
          ),
          "Google Calendar idempotency check",
        )
      : await responseJson(eventResponse, "Google Calendar");
  if (event.extendedProperties?.private?.ms_realty_viewing_id !== String(viewing?.id || "").trim()) {
    throw new Error("Google Calendar event does not match the viewing");
  }
  if (!event.id) throw new Error("Google Calendar did not return an event id");
  return {
    status: "synced",
    provider: "google",
    calendar_event_id: String(event.id),
    html_link: event.htmlLink ? String(event.htmlLink) : null,
  };
}

function assertPayloadRuntime(payload) {
  if (!payload || typeof payload.find !== "function" || typeof payload.create !== "function" || typeof payload.update !== "function") {
    throw new Error("Payload runtime cannot manage provider connections");
  }
  return payload;
}

async function runtimePayload(payload) {
  try {
    if (payload) return assertPayloadRuntime(payload);
    const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
    return assertPayloadRuntime(await getPayload({ config: await payloadConfigModule.default }));
  } catch (error) {
    throw new ProviderConnectionUnavailableError("Provider connection store is unavailable", error);
  }
}

function safeConnection(document) {
  return {
    provider: providerName(document.provider),
    status: String(document.status || "unknown"),
    connected_by: String(document.connected_by || ""),
    workspace_id: String(document.workspace_id || "").trim() || null,
    account_label: String(document.account_label || ""),
    external_account_id: String(document.external_account_id || ""),
    scopes: Array.isArray(document.scopes) ? document.scopes.map(String) : [],
    metadata: document.metadata && typeof document.metadata === "object" ? document.metadata : {},
    last_verified_at: document.last_verified_at || null,
  };
}

function uniqueProviderConflict(error) {
  const message = String(error?.message || error || "");
  if (/duplicate key|unique constraint|already exists/i.test(message)) return true;
  const entries = [
    ...(Array.isArray(error?.data?.errors) ? error.data.errors : []),
    ...(Array.isArray(error?.errors) ? error.errors : []),
  ];
  return entries.some((entry) => String(entry?.path || entry?.field || "").trim() === "provider");
}

async function findProvider(runtime, provider, workspaceId = "") {
  const result = await runtime.find({
    collection: "provider_connections",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { provider: { equals: providerName(provider) } },
  });
  if (!Array.isArray(result?.docs)) throw new Error("Payload provider connection query did not return documents");
  const scope = String(workspaceId || "").trim();
  return result.docs.find((document) => !scope || String(document.workspace_id || "").trim() === scope) || null;
}

export async function readProviderConnections({ payload = null, workspaceId = "" } = {}) {
  try {
    const runtime = await runtimePayload(payload);
    const result = await runtime.find({
      collection: "provider_connections",
      depth: 0,
      overrideAccess: true,
      pagination: false,
      sort: "provider",
    });
    if (!Array.isArray(result?.docs)) throw new Error("Payload provider connection query did not return documents");
    const scope = String(workspaceId || "").trim();
    return result.docs.map(safeConnection).filter((connection) => !scope || connection.workspace_id === scope);
  } catch (error) {
    if (error instanceof ProviderConnectionUnavailableError) throw error;
    throw new ProviderConnectionUnavailableError("Provider connection read failed", error);
  }
}

export async function readProviderCredentials(provider, { credentialSecret, payload = null, workspaceId = "" } = {}) {
  try {
    const runtime = await runtimePayload(payload);
    const document = await findProvider(runtime, provider, workspaceId);
    if (!document || document.status !== "connected") return null;
    const opened = openPrivateContactEnvelope(document.credential_envelope, {
      secret: secret(credentialSecret, "MS_REALTY_PROVIDER_TOKEN_KEY"),
      secretName: "MS_REALTY_PROVIDER_TOKEN_KEY",
    });
    if (opened.subject_type !== "provider_connection" || opened.subject_id !== providerName(provider)) {
      throw new Error("Provider credential envelope belongs to another provider");
    }
    return opened.payload;
  } catch (error) {
    if (error instanceof ProviderConnectionUnavailableError) throw error;
    throw new ProviderConnectionUnavailableError("Provider credential read failed", error);
  }
}

export async function saveProviderConnection(
  connection,
  { connectedBy, workspaceId = "", credentialSecret, payload = null, verifiedAt = new Date().toISOString() } = {},
) {
  const provider = providerName(connection?.provider);
  if (!["connecting", "connected"].includes(connection?.status) || !connection?.credentials || typeof connection.credentials !== "object") {
    throw new Error("A verified provider connection is required");
  }
  const operator = String(connectedBy || "").trim();
  if (!operator) throw new Error("Provider connection requires an operator");
  const envelope = createPrivateContactEnvelope(
    {
      subjectType: "provider_connection",
      subjectId: provider,
      payload: connection.credentials,
    },
    {
      secret: secret(credentialSecret, "MS_REALTY_PROVIDER_TOKEN_KEY"),
      secretName: "MS_REALTY_PROVIDER_TOKEN_KEY",
      storedAt: verifiedAt,
    },
  );
  const data = {
    provider,
    status: connection.status,
    connected_by: operator,
    workspace_id: String(workspaceId || "").trim() || null,
    account_label: String(connection.accountLabel || ""),
    external_account_id: String(connection.externalAccountId || ""),
    scopes: Array.isArray(connection.scopes) ? [...new Set(connection.scopes.map(String))].sort() : [],
    metadata: connection.metadata && typeof connection.metadata === "object" ? connection.metadata : {},
    credential_envelope: envelope,
    last_verified_at: verifiedAt,
  };
  try {
    const runtime = await runtimePayload(payload);
    const scope = String(workspaceId || "").trim();
    const existing = await findProvider(runtime, provider, scope);
    let document = existing
      ? await runtime.update({
          collection: "provider_connections",
          id: existing.id,
          data,
          depth: 0,
          overrideAccess: true,
        })
      : null;
    if (!document) {
      try {
        document = await runtime.create({
          collection: "provider_connections",
          data,
          depth: 0,
          overrideAccess: true,
        });
      } catch (error) {
        if (!uniqueProviderConflict(error)) throw error;
        const winner = await findProvider(runtime, provider, scope);
        if (!winner) throw error;
        document = await runtime.update({
          collection: "provider_connections",
          id: winner.id,
          data,
          depth: 0,
          overrideAccess: true,
        });
      }
    }
    return safeConnection(document);
  } catch (error) {
    if (error instanceof ProviderConnectionUnavailableError) throw error;
    throw new ProviderConnectionUnavailableError("Provider connection write failed", error);
  }
}

// Disconnecting removes the row outright rather than flipping a status, so the
// encrypted credential envelope stops existing at the same moment the operator
// says to stop using it. Revoking the token at the provider is the caller's job
// and happens first; this is the local half.
export async function deleteProviderConnection(provider, { payload = null, workspaceId = "" } = {}) {
  const name = providerName(provider);
  try {
    const runtime = await runtimePayload(payload);
    const existing = await findProvider(runtime, name, workspaceId);
    if (!existing) return { provider: name, deleted: false };
    if (typeof runtime.delete !== "function") throw new Error("Payload runtime cannot delete provider connections");
    await runtime.delete({ collection: "provider_connections", id: existing.id, depth: 0, overrideAccess: true });
    return { provider: name, deleted: true };
  } catch (error) {
    if (error instanceof ProviderConnectionUnavailableError) throw error;
    throw new ProviderConnectionUnavailableError("Provider connection delete failed", error);
  }
}

export { GOOGLE_SCOPES, PROVIDERS, exactOrigin, providerName, responseJson, secret };
