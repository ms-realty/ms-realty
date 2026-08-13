import test from "node:test";
import assert from "node:assert/strict";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { saveProviderConnection } from "../lib/provider-connections.mjs";
import { providerWebhookSignature } from "../lib/provider-webhooks.mjs";

const CREDENTIAL_SECRET = "provider-credential-secret-that-is-longer-than-thirty-two-characters";
const META_SECRET = "meta-webhook-app-secret";
const VIBER_TOKEN = "viber-webhook-auth-token-that-must-stay-private";

function payloadRuntime() {
  const collections = new Map();
  const docs = (collection) => {
    if (!collections.has(collection)) collections.set(collection, []);
    return collections.get(collection);
  };
  return {
    collections,
    async find(options) {
      const rows = docs(options.collection);
      const [field, condition] = Object.entries(options.where || {})[0] || [];
      return { docs: field ? rows.filter((row) => row[field] === condition.equals) : [...rows] };
    },
    async create({ collection, data }) {
      const document = { id: `${collection}-${docs(collection).length + 1}`, ...data };
      docs(collection).push(document);
      return document;
    },
    async update({ collection, id, data }) {
      const rows = docs(collection);
      const index = rows.findIndex((row) => row.id === id);
      rows[index] = { ...rows[index], ...data };
      return rows[index];
    },
  };
}

function config() {
  return {
    credentialSecret: CREDENTIAL_SECRET,
    metaAppSecret: META_SECRET,
    metaWebhookVerifyToken: "meta-webhook-verify-token",
    webhookMaxBytes: 1024 * 1024,
  };
}

test("standalone webhook routes preserve the signed raw body and persist encrypted events", async () => {
  const payload = payloadRuntime();
  await saveProviderConnection(
    {
      provider: "viber",
      status: "connected",
      accountLabel: "MS Realty Viber",
      externalAccountId: "viber-account-1",
      scopes: ["messages", "webhook"],
      metadata: {},
      credentials: { auth_token: VIBER_TOKEN },
    },
    { connectedBy: "payload-1", credentialSecret: CREDENTIAL_SECRET, payload },
  );
  await saveProviderConnection(
    {
      provider: "whatsapp",
      status: "connected",
      accountLabel: "MS Realty WhatsApp",
      externalAccountId: "waba-1",
      scopes: ["whatsapp_business_messaging"],
      metadata: {},
      credentials: { access_token: "meta-access-token", waba_id: "waba-1", phone_number_id: "phone-1" },
    },
    { connectedBy: "payload-1", credentialSecret: CREDENTIAL_SECRET, payload },
  );
  const app = createHttpApp({
    providerConnection: config(),
    providerWebhookPayload: payload,
    providerWebhookReceivedAt: "2026-08-13T13:00:00.000Z",
  });
  const whatsappBody =
    '{\n  "object": "whatsapp_business_account",\n  "entry": [{"id":"waba-1","changes":[{"value":{"metadata":{"phone_number_id":"phone-1"}}}]}]\n}\n';
  const whatsapp = await dispatchHttp(app, {
    method: "POST",
    url: "/api/webhooks/whatsapp",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": providerWebhookSignature(META_SECRET, whatsappBody, { whatsapp: true }),
    },
    body: whatsappBody,
  });
  assert.equal(whatsapp.status, 200);
  assert.deepEqual(whatsapp.body, { kind: "provider_webhook_accepted", idempotent: false });

  const viberBody = '{ "event": "message", "message_token": 42, "text": "private inbound text" }\n';
  const viber = await dispatchHttp(app, {
    method: "POST",
    url: "/api/webhooks/viber",
    headers: {
      "content-type": "application/json",
      "x-viber-content-signature": providerWebhookSignature(VIBER_TOKEN, viberBody),
    },
    body: viberBody,
  });
  assert.equal(viber.status, 200);
  assert.deepEqual(viber.body, { kind: "provider_webhook_accepted", idempotent: false });

  const events = payload.collections.get("provider_webhook_events");
  assert.equal(events.length, 2);
  assert.equal(JSON.stringify(events).includes("private inbound text"), false);
  assert.equal(JSON.stringify(events).includes(VIBER_TOKEN), false);
});

test("standalone webhook routes reject bad signatures before persistence", async () => {
  const payload = payloadRuntime();
  const app = createHttpApp({ providerConnection: config(), providerWebhookPayload: payload });
  const response = await dispatchHttp(app, {
    method: "POST",
    url: "/api/webhooks/whatsapp",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=bad" },
    body: '{"object":"whatsapp_business_account","entry":[]}',
  });
  assert.equal(response.status, 403);
  assert.equal(payload.collections.get("provider_webhook_events"), undefined);
});

test("standalone webhook routes expose only the provider-supported methods", async () => {
  const app = createHttpApp({ providerConnection: config(), providerWebhookPayload: payloadRuntime() });
  const challenge = await dispatchHttp(app, {
    method: "GET",
    url: "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=meta-webhook-verify-token&hub.challenge=12345",
    headers: {},
  });
  assert.equal(challenge.status, 200);
  assert.equal(challenge.body, "12345");

  const whatsappMethod = await dispatchHttp(app, { method: "PUT", url: "/api/webhooks/whatsapp", headers: {} });
  assert.equal(whatsappMethod.status, 405);
  assert.equal(whatsappMethod.headers.allow, "GET, POST");

  const viberMethod = await dispatchHttp(app, { method: "GET", url: "/api/webhooks/viber", headers: {} });
  assert.equal(viberMethod.status, 405);
  assert.equal(viberMethod.headers.allow, "POST");
});
