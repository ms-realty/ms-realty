import test from "node:test";
import assert from "node:assert/strict";
import {
  PROVIDER_DELIVERY_RECEIPT_COLLECTION,
  deliverApprovedProviderMessage,
} from "../lib/provider-delivery.mjs";
import { createPrivateContactEnvelope, openPrivateContactEnvelope } from "../lib/private-contact-vault.mjs";

const SECRET = "provider-delivery-test-secret-longer-than-thirty-two-characters";
const NOW = "2026-08-13T15:00:00.000Z";

function fakePayload(seed = []) {
  const docs = seed.map((doc, index) => ({ id: index + 1, ...doc }));
  return {
    docs,
    async find(query) {
      const key = query.where?.idempotency_key?.equals;
      return { docs: key ? docs.filter((doc) => doc.idempotency_key === key) : [...docs] };
    },
    async create({ data }) {
      if (docs.some((doc) => doc.idempotency_key === data.idempotency_key)) {
        throw new Error("duplicate idempotency key");
      }
      const doc = { id: docs.length + 1, ...data };
      docs.push(doc);
      return doc;
    },
    async update({ id, data }) {
      const index = docs.findIndex((doc) => doc.id === id);
      if (index < 0) throw new Error("missing receipt");
      docs[index] = { ...docs[index], ...data };
      return docs[index];
    },
  };
}

function jsonResponse(body, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function input(provider, overrides = {}) {
  const recipients = {
    google: "buyer@example.com",
    whatsapp: "+359888123456",
    viber: "viber-user-token-1",
  };
  return {
    provider,
    leadId: "lead-42",
    idempotencyKey: `delivery-${provider}-1`,
    recipient: recipients[provider],
    message: "Your viewing is confirmed for Friday at 10:00.",
    approved: true,
    approvedBy: "broker-42",
    approvedAt: NOW,
    ...overrides,
  };
}

function options(payload, overrides = {}) {
  return {
    payload,
    config: {
      credentialSecret: SECRET,
      googleClientId: "google-client-id",
      googleClientSecret: "google-client-secret",
      metaGraphVersion: "v23.0",
    },
    now: () => NOW,
    ...overrides,
  };
}

test("Gmail refreshes the Google token and sends an RFC 2822 base64url message", async () => {
  const payload = fakePayload();
  const calls = [];
  const result = await deliverApprovedProviderMessage(
    input("google", { subject: "Viewing confirmation" }),
    options(payload, {
      readCredentials: async (provider) => {
        assert.equal(provider, "google");
        return { refresh_token: "google-refresh-token" };
      },
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        return calls.length === 1
          ? jsonResponse({ access_token: "fresh-google-access-token", token_type: "Bearer" })
          : jsonResponse({ id: "gmail-message-1", threadId: "gmail-thread-1" });
      },
    }),
  );

  assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
  assert.equal(calls[0].init.method, "POST");
  const refresh = new URLSearchParams(calls[0].init.body);
  assert.equal(refresh.get("refresh_token"), "google-refresh-token");
  assert.equal(refresh.get("grant_type"), "refresh_token");
  assert.equal(calls[1].url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
  assert.equal(calls[1].init.headers.authorization, "Bearer fresh-google-access-token");
  const raw = JSON.parse(calls[1].init.body).raw;
  assert.doesNotMatch(raw, /[+/=]/);
  const message = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(message, /^To: buyer@example\.com\r\n/);
  assert.match(message, /\r\nSubject: Viewing confirmation\r\n/);
  assert.match(message, /\r\n\r\nYour viewing is confirmed for Friday at 10:00\.$/);
  assert.equal(result.status, "sent");
  assert.equal(result.external_message_id, "gmail-message-1");
});

test("WhatsApp Cloud API uses the connected phone_number_id messages endpoint", async () => {
  const payload = fakePayload();
  let request;
  const result = await deliverApprovedProviderMessage(
    input("whatsapp"),
    options(payload, {
      readCredentials: async (provider) => {
        assert.equal(provider, "whatsapp");
        assert.equal(payload.docs[0].status, "sending");
        return { access_token: "meta-access-token", phone_number_id: "123456789012345" };
      },
      fetchImpl: async (url, init) => {
        request = { url: String(url), init };
        return jsonResponse({ messaging_product: "whatsapp", messages: [{ id: "wamid.message-1" }] });
      },
    }),
  );

  assert.equal(request.url, "https://graph.facebook.com/v23.0/123456789012345/messages");
  assert.equal(request.init.headers.authorization, "Bearer meta-access-token");
  assert.deepEqual(JSON.parse(request.init.body), {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "359888123456",
    type: "text",
    text: { preview_url: false, body: "Your viewing is confirmed for Friday at 10:00." },
  });
  assert.equal(result.external_message_id, "wamid.message-1");
});

test("Viber Bot API uses pa/send_message and preserves the exact message token", async () => {
  const payload = fakePayload();
  let request;
  const result = await deliverApprovedProviderMessage(
    input("viber"),
    options(payload, {
      readCredentials: async (provider) => {
        assert.equal(provider, "viber");
        return { auth_token: "viber-auth-token" };
      },
      fetchImpl: async (url, init) => {
        request = { url: String(url), init };
        return jsonResponse('{"status":0,"status_message":"ok","message_token":9223372036854775807}');
      },
    }),
  );

  assert.equal(request.url, "https://chatapi.viber.com/pa/send_message");
  assert.equal(request.init.headers["x-viber-auth-token"], "viber-auth-token");
  assert.deepEqual(JSON.parse(request.init.body), {
    receiver: "viber-user-token-1",
    min_api_version: 7,
    sender: { name: "MS Realty" },
    type: "text",
    text: "Your viewing is confirmed for Friday at 10:00.",
  });
  assert.equal(result.external_message_id, "9223372036854775807");
});

test("delivery receipt encrypts recipient and message instead of storing plaintext", async () => {
  const payload = fakePayload();
  const delivery = input("whatsapp", {
    idempotencyKey: "delivery-encryption-1",
    recipient: "+359899987654",
    message: "Private buyer message 97f552",
  });
  await deliverApprovedProviderMessage(
    delivery,
    options(payload, {
      readCredentials: async () => ({ access_token: "meta-access-token", phone_number_id: "123456789012345" }),
      fetchImpl: async () => jsonResponse({ messages: [{ id: "wamid.encrypted-1" }] }),
    }),
  );

  assert.equal(PROVIDER_DELIVERY_RECEIPT_COLLECTION.slug, "provider_delivery_receipts");
  assert.equal(PROVIDER_DELIVERY_RECEIPT_COLLECTION.access.read(), false);
  assert.equal(payload.docs[0].lead_id, "lead-42");
  const serialized = JSON.stringify(payload.docs);
  assert.doesNotMatch(serialized, /359899987654|Private buyer message 97f552/);
  const opened = openPrivateContactEnvelope(payload.docs[0].delivery_envelope, {
    secret: SECRET,
    secretName: "MS_REALTY_PROVIDER_TOKEN_KEY",
  });
  assert.equal(opened.payload.request.recipient, "359899987654");
  assert.equal(opened.payload.request.lead_id, "lead-42");
  assert.equal(opened.payload.request.message, delivery.message);
  assert.equal(opened.payload.receipt.status, "sent");
});

test("a duplicate sent idempotency key returns the receipt without resending", async () => {
  const payload = fakePayload();
  let credentialReads = 0;
  let sends = 0;
  const delivery = input("whatsapp", { idempotencyKey: "delivery-duplicate-1" });
  const deliveryOptions = options(payload, {
    readCredentials: async () => {
      credentialReads += 1;
      return { access_token: "meta-access-token", phone_number_id: "123456789012345" };
    },
    fetchImpl: async () => {
      sends += 1;
      return jsonResponse({ messages: [{ id: "wamid.duplicate-1" }] });
    },
  });

  const first = await deliverApprovedProviderMessage(delivery, deliveryOptions);
  const second = await deliverApprovedProviderMessage(delivery, deliveryOptions);
  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(second.external_message_id, "wamid.duplicate-1");
  assert.equal(credentialReads, 1);
  assert.equal(sends, 1);
});

test("an existing sending fence becomes uncertain and both states fail closed", async () => {
  const delivery = input("whatsapp", { idempotencyKey: "delivery-crash-fence-1" });
  const request = {
    provider: "whatsapp",
    lead_id: delivery.leadId,
    recipient: "359888123456",
    message: delivery.message,
    subject: null,
    approved_by: delivery.approvedBy,
    approved_at: delivery.approvedAt,
  };
  const deliveryEnvelope = createPrivateContactEnvelope(
    { subjectType: "provider_delivery", subjectId: delivery.idempotencyKey, payload: { request } },
    { secret: SECRET, secretName: "MS_REALTY_PROVIDER_TOKEN_KEY", storedAt: NOW },
  );
  const payload = fakePayload([
    {
      idempotency_key: delivery.idempotencyKey,
      provider: "whatsapp",
      status: "sending",
      approved_by: delivery.approvedBy,
      approved_at: NOW,
      started_at: NOW,
      completed_at: null,
      external_message_id: null,
      failure_code: null,
      delivery_envelope: deliveryEnvelope,
    },
  ]);
  let boundaryCalls = 0;
  const deliveryOptions = options(payload, {
    readCredentials: async () => {
      boundaryCalls += 1;
      return { access_token: "unused", phone_number_id: "123456789012345" };
    },
    fetchImpl: async () => {
      boundaryCalls += 1;
      return jsonResponse({ messages: [{ id: "must-not-send" }] });
    },
  });

  await assert.rejects(
    deliverApprovedProviderMessage(delivery, deliveryOptions),
    (error) => error.code === "provider_delivery_uncertain",
  );
  assert.equal(payload.docs[0].status, "uncertain");
  await assert.rejects(
    deliverApprovedProviderMessage(delivery, deliveryOptions),
    (error) => error.code === "provider_delivery_uncertain",
  );
  assert.equal(boundaryCalls, 0);
});

test("an explicit provider rejection is durably failed", async () => {
  const payload = fakePayload();
  await assert.rejects(
    deliverApprovedProviderMessage(
      input("whatsapp", { idempotencyKey: "delivery-rejected-1" }),
      options(payload, {
        readCredentials: async () => ({ access_token: "meta-access-token", phone_number_id: "123456789012345" }),
        fetchImpl: async () => jsonResponse({ error: { message: "bad recipient" } }, 400),
      }),
    ),
    (error) => error.code === "provider_delivery_rejected",
  );
  assert.equal(payload.docs[0].status, "failed");
  assert.equal(payload.docs[0].failure_code, "provider_rejected");
  assert.equal(payload.docs[0].external_message_id, null);
});

test("a provider 5xx after the send boundary is uncertain and cannot be retried automatically", async () => {
  const payload = fakePayload();
  const delivery = input("whatsapp", { idempotencyKey: "delivery-server-error-1" });
  const deliveryOptions = options(payload, {
    readCredentials: async () => ({ access_token: "meta-access-token", phone_number_id: "123456789012345" }),
    fetchImpl: async () => jsonResponse({ error: { message: "upstream unavailable" } }, 503),
  });
  await assert.rejects(
    deliverApprovedProviderMessage(delivery, deliveryOptions),
    (error) => error.code === "provider_delivery_uncertain",
  );
  assert.equal(payload.docs[0].status, "uncertain");
  await assert.rejects(
    deliverApprovedProviderMessage(delivery, deliveryOptions),
    (error) => error.code === "provider_delivery_uncertain",
  );
});

test("delivery requires an exact approved input before touching storage or providers", async () => {
  const payload = fakePayload();
  const deliveryOptions = options(payload, {
    readCredentials: async () => assert.fail("credentials must not be read"),
    fetchImpl: async () => assert.fail("provider must not be called"),
  });
  await assert.rejects(
    deliverApprovedProviderMessage(
      { ...input("google"), approved: false },
      deliveryOptions,
    ),
    /Human approval is required/,
  );
  await assert.rejects(
    deliverApprovedProviderMessage(
      { ...input("google"), accessToken: "must-not-be-accepted" },
      deliveryOptions,
    ),
    /unsupported fields: accessToken/,
  );
  await assert.rejects(
    deliverApprovedProviderMessage({ ...input("google"), recipient: "" }, deliveryOptions),
    /recipient is required/,
  );
  await assert.rejects(
    deliverApprovedProviderMessage({ ...input("google"), message: "  " }, deliveryOptions),
    /message is required/,
  );
  assert.equal(payload.docs.length, 0);
});

test("connecting provider credentials cannot cross the send boundary", async () => {
  const payload = fakePayload();
  let sends = 0;
  await assert.rejects(
    deliverApprovedProviderMessage(
      input("viber", { idempotencyKey: "delivery-connecting-1" }),
      options(payload, {
        readCredentials: async () => null,
        fetchImpl: async () => {
          sends += 1;
          return jsonResponse({ status: 0, message_token: 1 });
        },
      }),
    ),
    (error) => error.code === "provider_delivery_not_connected",
  );
  assert.equal(sends, 0);
  assert.equal(payload.docs[0].status, "failed");
});
