import test from "node:test";
import assert from "node:assert/strict";
import {
  persistProviderWebhookEvent,
  providerWebhookSignature,
  renderProviderWebhookResponse,
} from "../lib/provider-webhooks.mjs";

const SECRET = "provider-test-secret-that-is-longer-than-thirty-two-characters";

function config(overrides = {}) {
  return {
    credentialSecret: SECRET,
    metaAppSecret: "meta-app-secret-that-is-long-enough",
    metaWebhookVerifyToken: "meta-webhook-verify-token",
    webhookMaxBytes: 1024 * 1024,
    ...overrides,
  };
}

function fakePayload() {
  const docs = [];
  return {
    docs,
    async find(query) {
      const eventId = query.where?.event_id?.equals;
      return { docs: eventId ? docs.filter((doc) => doc.event_id === eventId) : [...docs] };
    },
    async create({ data }) {
      const doc = { id: docs.length + 1, ...data };
      docs.push(doc);
      return doc;
    },
  };
}

test("Meta webhook verification challenge fails closed and echoes the challenge on exact token match", async () => {
  const ok = await renderProviderWebhookResponse(
    new Request("https://ms-realty.example/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=meta-webhook-verify-token&hub.challenge=12345"),
    { provider: "whatsapp", config: config() },
  );
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "12345");

  const denied = await renderProviderWebhookResponse(
    new Request("https://ms-realty.example/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345"),
    { provider: "whatsapp", config: config() },
  );
  assert.equal(denied.status, 403);
});

test("signed provider webhooks are durably persisted and idempotent", async () => {
  const payload = fakePayload();
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "waba-1", changes: [{ field: "messages", value: { metadata: { phone_number_id: "phone-1" }, messages: [{ id: "wamid-1" }] } }] }],
  });
  const signature = providerWebhookSignature("meta-app-secret-that-is-long-enough", body, { whatsapp: true });
  const request = new Request("https://ms-realty.example/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signature },
    body,
  });
  const first = await renderProviderWebhookResponse(request, {
    provider: "whatsapp",
    config: config(),
    payload,
    readCredentials: async () => ({ waba_id: "waba-1", phone_number_id: "phone-1" }),
  });
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { kind: "provider_webhook_accepted", idempotent: false });
  assert.equal(payload.docs.length, 1);

  const retryBody = JSON.stringify(JSON.parse(body), null, 2);
  const second = await renderProviderWebhookResponse(
    new Request("https://ms-realty.example/api/webhooks/whatsapp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": providerWebhookSignature("meta-app-secret-that-is-long-enough", retryBody, { whatsapp: true }),
      },
      body: retryBody,
    }),
    {
      provider: "whatsapp",
      config: config(),
      payload,
      readCredentials: async () => ({ waba_id: "waba-1", phone_number_id: "phone-1" }),
    },
  );
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), { kind: "provider_webhook_accepted", idempotent: true });
  assert.equal(payload.docs.length, 1);
});

test("invalid webhook signatures are rejected before persistence", async () => {
  const payload = fakePayload();
  const denied = await renderProviderWebhookResponse(
    new Request("https://ms-realty.example/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=bad" },
      body: JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
    }),
    {
      provider: "whatsapp",
      config: config(),
      payload,
      readCredentials: async () => ({ waba_id: "waba-1", phone_number_id: "phone-1" }),
    },
  );
  assert.equal(denied.status, 403);
  assert.equal(payload.docs.length, 0);
});

test("signed WhatsApp events for another connected account are rejected", async () => {
  const payload = fakePayload();
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "other-waba", changes: [{ field: "messages", value: { metadata: { phone_number_id: "other-phone" } } }] }],
  });
  const response = await renderProviderWebhookResponse(
    new Request("https://ms-realty.example/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": providerWebhookSignature("meta-app-secret-that-is-long-enough", body, { whatsapp: true }) },
      body,
    }),
    {
      provider: "whatsapp",
      config: config(),
      payload,
      readCredentials: async () => ({ waba_id: "waba-1", phone_number_id: "phone-1" }),
    },
  );
  assert.equal(response.status, 403);
  assert.equal(payload.docs.length, 0);
});

test("signed Viber webhooks use the stored bot token and persist durably", async () => {
  const payload = fakePayload();
  const token = "viber-token-that-is-long-enough";
  const body = JSON.stringify({ event: "message", message_token: 42, sender: { id: "viber-user-1" } });
  const response = await renderProviderWebhookResponse(
    new Request("https://ms-realty.example/api/webhooks/viber", {
      method: "POST",
      headers: { "x-viber-content-signature": providerWebhookSignature(token, body) },
      body,
    }),
    {
      provider: "viber",
      config: config(),
      payload,
      readCredentials: async () => ({ auth_token: token }),
    },
  );
  assert.equal(response.status, 200);
  assert.equal(payload.docs[0].account_id, "viber-user-1");
});

test("webhook bodies above the configured limit fail before persistence", async () => {
  const payload = fakePayload();
  const body = JSON.stringify({ value: "x".repeat(2048) });
  const response = await renderProviderWebhookResponse(
    new Request("https://ms-realty.example/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": providerWebhookSignature("meta-app-secret-that-is-long-enough", body, { whatsapp: true }) },
      body,
    }),
    { provider: "whatsapp", config: config({ webhookMaxBytes: 1024 }), payload },
  );
  assert.equal(response.status, 413);
  assert.equal(payload.docs.length, 0);
});

test("provider webhook rate limiting rejects traffic before body parsing or persistence", async () => {
  let parsed = false;
  let persisted = false;
  const response = await renderProviderWebhookResponse(
    {
      method: "POST",
      headers: new Headers({ "cf-connecting-ip": "203.0.113.8" }),
      async text() {
        parsed = true;
        return "{}";
      },
    },
    {
      provider: "whatsapp",
      config: config(),
      trustProxy: true,
      rateLimiter: { allow: () => ({ allowed: false, retryAfterSec: 12 }) },
      persist: async () => {
        persisted = true;
      },
    },
  );

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "12");
  assert.deepEqual(await response.json(), { kind: "provider_webhook_rate_limited", retry_after: 12 });
  assert.equal(parsed, false);
  assert.equal(persisted, false);
});

test("persistProviderWebhookEvent stores encrypted payloads only", async () => {
  const payload = fakePayload();
  const eventPayload = { event: "message", message_token: 42, text: "secret inbound body" };
  await persistProviderWebhookEvent(
    { provider: "viber", payload: eventPayload, rawBody: JSON.stringify(eventPayload) },
    { credentialSecret: SECRET, payload, receivedAt: "2026-08-13T13:00:00.000Z" },
  );
  assert.equal(payload.docs.length, 1);
  assert.doesNotMatch(JSON.stringify(payload.docs[0]), /secret inbound body/);
});
