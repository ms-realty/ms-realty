import test from "node:test";
import assert from "node:assert/strict";
import {
  GOOGLE_SCOPES,
  completeGoogleOAuth,
  completeViberConnection,
  completeWhatsAppEmbeddedSignup,
  createProviderOAuthState,
  googleAuthorizationUrl,
  providerConnectionAvailability,
  readProviderConnections,
  readProviderCredentials,
  registerViberWebhook,
  registerWhatsAppWebhook,
  saveProviderConnection,
  syncViewingToGoogleCalendar,
  verifyProviderOAuthState,
} from "../lib/provider-connections.mjs";

const SECRET = "provider-test-secret-that-is-longer-than-thirty-two-characters";
const NOW = Date.parse("2026-08-13T12:00:00.000Z");

function config(overrides = {}) {
  return {
    publicOrigin: "https://ms-realty.example",
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
    metaWebhookReady: true,
    viberCommercialReady: true,
    viberWebhookReady: true,
    webhookMaxBytes: 1024 * 1024,
    ...overrides,
  };
}

function fakePayload() {
  const docs = [];
  return {
    docs,
    async find(query) {
      const provider = query.where?.provider?.equals;
      return {
        docs: provider ? docs.filter((doc) => doc.provider === provider) : [...docs],
      };
    },
    async create({ data }) {
      const doc = { id: docs.length + 1, ...data };
      docs.push(doc);
      return doc;
    },
    async update({ id, data }) {
      const index = docs.findIndex((doc) => doc.id === id);
      docs[index] = { ...docs[index], ...data };
      return docs[index];
    },
  };
}

test("Google OAuth state is operator-bound, short-lived, and tamper-evident", () => {
  const state = createProviderOAuthState({ provider: "google", operatorId: "payload-42" }, { stateSecret: SECRET, now: NOW });
  const verified = verifyProviderOAuthState(state, {
    provider: "google",
    operatorId: "payload-42",
    stateSecret: SECRET,
    now: NOW + 1000,
  });
  assert.equal(verified.operator_id, "payload-42");
  assert.throws(
    () =>
      verifyProviderOAuthState(`${state}x`, {
        provider: "google",
        operatorId: "payload-42",
        stateSecret: SECRET,
        now: NOW,
      }),
    /state/i,
  );
  assert.throws(
    () =>
      verifyProviderOAuthState(state, {
        provider: "google",
        operatorId: "payload-7",
        stateSecret: SECRET,
        now: NOW,
      }),
    /state/i,
  );
  assert.throws(
    () =>
      verifyProviderOAuthState(state, {
        provider: "google",
        operatorId: "payload-42",
        stateSecret: SECRET,
        now: NOW + 11 * 60_000,
      }),
    /expired/i,
  );
});

test("Google authorization requests offline Gmail send and owned-calendar access", () => {
  const url = new URL(
    googleAuthorizationUrl({
      config: config(),
      operatorId: "payload-42",
      now: NOW,
    }),
  );
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("redirect_uri"), "https://ms-realty.example/api/admin/connections?provider=google&action=callback");
  const scopes = url.searchParams.get("scope").split(" ");
  for (const scope of GOOGLE_SCOPES) assert.ok(scopes.includes(scope));
});

test("verified Google tokens are encrypted in Payload and never returned by status reads", async () => {
  const providerConfig = config();
  const state = createProviderOAuthState({ provider: "google", operatorId: "payload-42" }, { stateSecret: SECRET, now: NOW });
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/token")) {
      return new Response(
        JSON.stringify({
          access_token: "google-access-token-plain",
          refresh_token: "google-refresh-token-plain",
          expires_in: 3600,
          token_type: "Bearer",
          scope: GOOGLE_SCOPES.join(" "),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        id: "google-user-1",
        email: "owner@example.com",
        verified_email: true,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };
  const connection = await completeGoogleOAuth(
    { code: "one-time-code", state, operatorId: "payload-42" },
    { config: providerConfig, fetchImpl, now: NOW },
  );
  assert.equal(calls.length, 2);
  const payload = fakePayload();
  const saved = await saveProviderConnection(connection, {
    connectedBy: "payload-42",
    credentialSecret: SECRET,
    payload,
    verifiedAt: "2026-08-13T12:00:00.000Z",
  });
  assert.equal(saved.account_label, "owner@example.com");
  assert.doesNotMatch(JSON.stringify(payload.docs), /google-(access|refresh)-token-plain/);
  const statuses = await readProviderConnections({ payload });
  assert.doesNotMatch(JSON.stringify(statuses), /credential|token|ciphertext/);
  const credentials = await readProviderCredentials("google", {
    credentialSecret: SECRET,
    payload,
  });
  assert.equal(credentials.refresh_token, "google-refresh-token-plain");
});

test("availability stays fail-closed for invalid Meta version and pre-commercial Viber", () => {
  const availability = providerConnectionAvailability(config({ metaGraphVersion: "latest", viberCommercialReady: false }));
  assert.equal(availability.google.ready, true);
  assert.equal(availability.whatsapp.ready, false);
  assert.equal(availability.viber.ready, false);
});

test("WhatsApp is saved as connecting before provider webhook subscription can become connected", async () => {
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.includes("oauth/access_token")) return Response.json({ access_token: "whatsapp-access-token" });
    if (value.includes("/12345678901?")) return Response.json({ id: "12345678901", name: "MS Realty" });
    if (value.includes("/98765432101?")) {
      return Response.json({ id: "98765432101", verified_name: "MS Realty", display_phone_number: "+359879696870" });
    }
    if (value.endsWith("/12345678901/subscribed_apps")) return Response.json({ success: true });
    throw new Error(`Unexpected Meta request: ${value}`);
  };
  const verified = await completeWhatsAppEmbeddedSignup(
    { code: "one-time-code", wabaId: "12345678901", phoneNumberId: "98765432101" },
    { config: config(), fetchImpl },
  );
  assert.equal(verified.status, "connecting");
  assert.equal(verified.metadata.webhook_subscribed, false);
  const connected = await registerWhatsAppWebhook(verified, { config: config(), fetchImpl });
  assert.equal(connected.status, "connected");
  assert.equal(connected.metadata.webhook_subscribed, true);
});

test("Viber is saved as connecting before its webhook is registered", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: init?.body });
    if (String(url).endsWith("get_account_info")) return Response.json({ status: 0, id: "viber-account", name: "MS Realty" });
    return Response.json({ status: 0, status_message: "ok" });
  };
  const verified = await completeViberConnection(
    { token: "viber-token-that-is-long-enough" },
    { config: config(), fetchImpl },
  );
  assert.equal(verified.status, "connecting");
  const connected = await registerViberWebhook(verified, { config: config(), fetchImpl });
  assert.equal(connected.status, "connected");
  assert.equal(connected.metadata.webhook_registered, true);
  assert.match(calls[1].body, /https:\/\/ms-realty\.example\/api\/webhooks\/viber/);
});

test("Google Calendar sync refreshes the token and writes a private-idempotency event", async () => {
  const payload = fakePayload();
  await saveProviderConnection(
    {
      provider: "google",
      status: "connected",
      accountLabel: "owner@example.com",
      externalAccountId: "google-user-1",
      scopes: GOOGLE_SCOPES,
      metadata: {},
      credentials: { refresh_token: "refresh-token" },
    },
    { connectedBy: "payload-42", credentialSecret: SECRET, payload },
  );
  const fetchImpl = async (url, init) => {
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "fresh-access", scope: GOOGLE_SCOPES.join(" ") });
    }
    const body = JSON.parse(init.body);
    assert.equal(body.extendedProperties.private.ms_realty_viewing_id, "viewing-1");
    assert.match(body.id, /^msr[0-9a-f]{64}$/);
    assert.equal(init.headers.authorization, "Bearer fresh-access");
    return Response.json({
      id: body.id,
      htmlLink: "https://calendar.google.com/event/1",
      extendedProperties: body.extendedProperties,
    });
  };
  const result = await syncViewingToGoogleCalendar(
    {
      id: "viewing-1",
      lead_id: "lead-1",
      listing_reference: "MS-0001",
      broker: "broker-1",
      starts_at: "2026-08-20T10:00:00.000Z",
    },
    { config: config(), payload, fetchImpl },
  );
  assert.equal(result.status, "synced");
  assert.match(result.calendar_event_id, /^msr[0-9a-f]{64}$/);
});

test("Google Calendar duplicate insert reads back the deterministic viewing event", async () => {
  const payload = fakePayload();
  await saveProviderConnection(
    {
      provider: "google",
      status: "connected",
      accountLabel: "owner@example.com",
      externalAccountId: "google-user-1",
      scopes: GOOGLE_SCOPES,
      metadata: {},
      credentials: { refresh_token: "refresh-token" },
    },
    { connectedBy: "payload-42", credentialSecret: SECRET, payload },
  );
  let requestedEvent;
  const fetchImpl = async (url, init = {}) => {
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "fresh-access", scope: GOOGLE_SCOPES.join(" ") });
    }
    if (init.method === "POST") {
      requestedEvent = JSON.parse(init.body);
      return Response.json({ error: { message: "duplicate" } }, { status: 409 });
    }
    assert.ok(String(url).endsWith(`/events/${requestedEvent.id}`));
    return Response.json({ id: requestedEvent.id, extendedProperties: requestedEvent.extendedProperties });
  };
  const result = await syncViewingToGoogleCalendar(
    { id: "viewing-retry", lead_id: "lead-1", broker: "broker-1", starts_at: "2026-08-20T10:00:00.000Z" },
    { config: config(), payload, fetchImpl },
  );
  assert.equal(result.calendar_event_id, requestedEvent.id);
});

test("provider token and OAuth state require dedicated strong secrets", () => {
  const availability = providerConnectionAvailability(config({ credentialSecret: "short", stateSecret: "short" }));
  assert.equal(availability.store.ready, false);
  assert.equal(availability.google.ready, false);
  assert.equal(availability.whatsapp.ready, false);
  assert.equal(availability.viber.ready, false);
});

test("credentials stay unavailable until webhook registration marks the provider connected", async () => {
  const payload = fakePayload();
  await saveProviderConnection(
    {
      provider: "viber",
      status: "connecting",
      accountLabel: "MS Realty",
      externalAccountId: "viber-account",
      scopes: ["messages"],
      metadata: { webhook_registered: false },
      credentials: { auth_token: "private-viber-token" },
    },
    { connectedBy: "payload-42", credentialSecret: SECRET, payload },
  );
  assert.equal(await readProviderCredentials("viber", { credentialSecret: SECRET, payload }), null);
});

test("provider save retries a concurrent unique-provider race by updating the winning row", async () => {
  const docs = [];
  let createCalls = 0;
  const payload = {
    async find(query) {
      const provider = query.where?.provider?.equals;
      return { docs: provider ? docs.filter((doc) => doc.provider === provider) : [...docs] };
    },
    async create({ data }) {
      createCalls += 1;
      if (createCalls === 1) {
        docs.push({
          id: 1,
          provider: data.provider,
          status: "connected",
          connected_by: "other-owner",
          account_label: "stale@example.com",
          external_account_id: "google-user-stale",
          scopes: [],
          metadata: {},
          credential_envelope: data.credential_envelope,
          last_verified_at: "2026-08-12T10:00:00.000Z",
        });
        throw new Error("duplicate key value violates unique constraint");
      }
      throw new Error("saveProviderConnection should not retry create after the conflict");
    },
    async update({ id, data }) {
      const index = docs.findIndex((doc) => doc.id === id);
      docs[index] = { ...docs[index], ...data };
      return docs[index];
    },
  };
  const saved = await saveProviderConnection(
    {
      provider: "google",
      status: "connected",
      accountLabel: "owner@example.com",
      externalAccountId: "google-user-1",
      scopes: GOOGLE_SCOPES,
      metadata: { email: "owner@example.com" },
      credentials: { refresh_token: "google-refresh-token-plain" },
    },
    {
      connectedBy: "payload-42",
      credentialSecret: SECRET,
      payload,
      verifiedAt: "2026-08-13T12:00:00.000Z",
    },
  );
  assert.equal(createCalls, 1);
  assert.equal(docs.length, 1);
  assert.equal(saved.account_label, "owner@example.com");
  assert.equal(saved.external_account_id, "google-user-1");
  const credentials = await readProviderCredentials("google", { credentialSecret: SECRET, payload });
  assert.equal(credentials.refresh_token, "google-refresh-token-plain");
});
