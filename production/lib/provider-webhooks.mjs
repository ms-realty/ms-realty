import crypto from "node:crypto";
import { createPrivateContactEnvelope } from "./private-contact-vault.mjs";
import { providerConnectionConfigFromEnv, readProviderCredentials } from "./provider-connections.mjs";
import { clientIdentity, createRateLimiter, rateLimitConfigFromEnv } from "./rate-limit.mjs";

export const PROVIDER_WEBHOOK_EVENT_COLLECTION = {
  slug: "provider_webhook_events",
  admin: {
    useAsTitle: "event_id",
    defaultColumns: ["received_at", "provider", "event_type", "external_event_id"],
  },
  fields: [
    { name: "event_id", type: "text", required: true, unique: true, index: true, maxLength: 96 },
    { name: "provider", type: "text", required: true, index: true, maxLength: 24 },
    { name: "event_type", type: "text", required: true, index: true, maxLength: 80 },
    { name: "external_event_id", type: "text", index: true, maxLength: 320 },
    { name: "account_id", type: "text", maxLength: 320 },
    { name: "received_at", type: "date", required: true, index: true },
    { name: "payload_envelope", type: "json", required: true, admin: { hidden: true } },
  ],
};

export class ProviderWebhookUnavailableError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = "ProviderWebhookUnavailableError";
    this.code = "provider_webhook_unavailable";
    if (cause) this.cause = cause;
  }
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function signature(secret, body) {
  return crypto.createHmac("sha256", String(secret || "")).update(body).digest("hex");
}

function webhookEventId(provider, { eventType, externalEventId, accountId }, rawBody) {
  const identity = externalEventId
    ? `${provider}\0${accountId || ""}\0${eventType}\0${externalEventId}`
    : `${provider}\0${rawBody}`;
  return `${provider}-${crypto.createHash("sha256").update(identity).digest("hex")}`;
}

function webhookIdentity(provider, payload, rawBody) {
  if (provider === "whatsapp") {
    const entry = payload.entry?.[0];
    const value = entry?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    const status = value?.statuses?.[0];
    const identity = {
      eventType: message ? "message" : status ? "status" : String(entry?.changes?.[0]?.field || payload.object || "unknown"),
      externalEventId: String(message?.id || status?.id || "") || null,
      accountId: String(entry?.id || value?.metadata?.phone_number_id || "") || null,
    };
    return { eventId: webhookEventId(provider, identity, rawBody), ...identity };
  }
  const identity = {
    eventType: String(payload.event || "unknown"),
    externalEventId: String(payload.message_token || "") || null,
    accountId: String(payload.sender?.id || payload.user?.id || payload.chat_hostname || "") || null,
  };
  return { eventId: webhookEventId(provider, identity, rawBody), ...identity };
}

function matchesWhatsAppConnection(payload, credentials) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  if (!credentials?.waba_id || !credentials?.phone_number_id || entries.length === 0) return false;
  return entries.every(
    (entry) =>
      String(entry?.id || "") === String(credentials.waba_id) &&
      (Array.isArray(entry?.changes) ? entry.changes : []).every((change) => {
        const phone = change?.value?.metadata?.phone_number_id;
        return !phone || String(phone) === String(credentials.phone_number_id);
      }),
  );
}

function assertPayloadRuntime(payload) {
  if (!payload || typeof payload.find !== "function" || typeof payload.create !== "function") {
    throw new Error("Payload runtime cannot persist provider webhook events");
  }
  return payload;
}

async function runtimePayload(payload) {
  try {
    if (payload) return assertPayloadRuntime(payload);
    const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
    return assertPayloadRuntime(await getPayload({ config: await payloadConfigModule.default }));
  } catch (error) {
    throw new ProviderWebhookUnavailableError("Provider webhook store is unavailable", error);
  }
}

export async function persistProviderWebhookEvent(
  { provider, payload: eventPayload, rawBody },
  { credentialSecret, payload = null, receivedAt = new Date().toISOString() } = {},
) {
  if (!["whatsapp", "viber"].includes(provider)) throw new Error("Unsupported provider webhook");
  if (!eventPayload || typeof eventPayload !== "object" || Array.isArray(eventPayload)) throw new Error("Webhook payload must be an object");
  if (typeof rawBody !== "string") throw new Error("Raw webhook body is required");
  const identity = webhookIdentity(provider, eventPayload, rawBody);
  const envelope = createPrivateContactEnvelope(
    { subjectType: "provider_webhook", subjectId: identity.eventId, payload: eventPayload },
    { secret: credentialSecret, secretName: "MS_REALTY_PROVIDER_TOKEN_KEY", storedAt: receivedAt },
  );
  try {
    const runtime = await runtimePayload(payload);
    const existing = await runtime.find({
      collection: "provider_webhook_events",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: { event_id: { equals: identity.eventId } },
    });
    if (!Array.isArray(existing?.docs)) throw new Error("Payload webhook event query did not return documents");
    if (existing.docs.length) return { event_id: identity.eventId, provider, idempotent: true, durable: true };
    try {
      await runtime.create({
        collection: "provider_webhook_events",
        depth: 0,
        overrideAccess: true,
        data: {
          event_id: identity.eventId,
          provider,
          event_type: identity.eventType,
          external_event_id: identity.externalEventId,
          account_id: identity.accountId,
          received_at: receivedAt,
          payload_envelope: envelope,
        },
      });
    } catch (error) {
      const raced = await runtime.find({
        collection: "provider_webhook_events",
        depth: 0,
        limit: 1,
        overrideAccess: true,
        pagination: false,
        where: { event_id: { equals: identity.eventId } },
      });
      if (Array.isArray(raced?.docs) && raced.docs.length) {
        return { event_id: identity.eventId, provider, idempotent: true, durable: true };
      }
      throw error;
    }
    return { event_id: identity.eventId, provider, idempotent: false, durable: true };
  } catch (error) {
    if (error instanceof ProviderWebhookUnavailableError) throw error;
    throw new ProviderWebhookUnavailableError("Provider webhook event was not persisted", error);
  }
}

async function limitedBody(request, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > 10 * 1024 * 1024) {
    throw new ProviderWebhookUnavailableError("Provider webhook body limit is invalid");
  }
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw Object.assign(new Error("Webhook body too large"), { status: 413 });
  const body = await request.text();
  if (Buffer.byteLength(body) > maxBytes) throw Object.assign(new Error("Webhook body too large"), { status: 413 });
  return body;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

let sharedWebhookLimiter;
let sharedWebhookLimiterSettings;

function webhookLimiterFor(settings) {
  if (!settings) return null;
  const fingerprint = `${settings.windowMs}:${settings.max}`;
  if (!sharedWebhookLimiter || sharedWebhookLimiterSettings !== fingerprint) {
    sharedWebhookLimiter = createRateLimiter(settings);
    sharedWebhookLimiterSettings = fingerprint;
  }
  return sharedWebhookLimiter;
}

export async function renderProviderWebhookResponse(
  request,
  {
    provider,
    config = providerConnectionConfigFromEnv(),
    payload = null,
    persist = persistProviderWebhookEvent,
    readCredentials = readProviderCredentials,
    receivedAt,
    rateLimit = rateLimitConfigFromEnv(),
    rateLimiter = null,
    trustProxy = process.env.MS_REALTY_TRUST_PROXY === "1",
  } = {},
) {
  if (provider === "whatsapp" && request.method === "GET") {
    const url = new URL(request.url);
    const valid =
      String(config.metaWebhookVerifyToken || "").length >= 24 &&
      url.searchParams.get("hub.mode") === "subscribe" &&
      safeEqual(url.searchParams.get("hub.verify_token"), config.metaWebhookVerifyToken);
    const challenge = url.searchParams.get("hub.challenge");
    if (!valid || !challenge) return new Response("Forbidden", { status: 403 });
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: provider === "whatsapp" ? "GET, POST" : "POST" } });
  if (!["whatsapp", "viber"].includes(provider)) return new Response("Not found", { status: 404 });
  const limiter = rateLimiter || webhookLimiterFor(rateLimit);
  if (limiter) {
    const verdict = limiter.allow(`${clientIdentity({ headers: request.headers }, { trustProxy })}:${provider}`);
    if (!verdict.allowed) {
      return new Response(JSON.stringify({ kind: "provider_webhook_rate_limited", retry_after: verdict.retryAfterSec }), {
        status: 429,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "retry-after": String(verdict.retryAfterSec),
          "x-content-type-options": "nosniff",
        },
      });
    }
  }
  try {
    const rawBody = await limitedBody(request, config.webhookMaxBytes || 1024 * 1024);
    let expected;
    let supplied;
    if (provider === "whatsapp") {
      if (String(config.metaAppSecret || "").length < 16) throw new Error("Meta webhook secret is not configured");
      expected = `sha256=${signature(config.metaAppSecret, rawBody)}`;
      supplied = request.headers.get("x-hub-signature-256");
    } else if (provider === "viber") {
      const credentials = await readCredentials("viber", { credentialSecret: config.credentialSecret, payload });
      if (!credentials?.auth_token) throw new Error("Viber webhook token is unavailable");
      expected = signature(credentials.auth_token, rawBody);
      supplied = request.headers.get("x-viber-content-signature");
    }
    if (!safeEqual(supplied, expected)) return new Response("Forbidden", { status: 403 });
    let eventPayload;
    try {
      eventPayload = JSON.parse(rawBody);
    } catch {
      return jsonResponse(400, { kind: "invalid_webhook_json" });
    }
    if (provider === "whatsapp") {
      const credentials = await readCredentials("whatsapp", { credentialSecret: config.credentialSecret, payload });
      if (!matchesWhatsAppConnection(eventPayload, credentials)) return new Response("Forbidden", { status: 403 });
    }
    const result = await persist(
      { provider, payload: eventPayload, rawBody },
      { credentialSecret: config.credentialSecret, payload, receivedAt },
    );
    return jsonResponse(200, { kind: "provider_webhook_accepted", idempotent: result.idempotent });
  } catch (error) {
    if (error.status === 413) return jsonResponse(413, { kind: "webhook_too_large" });
    return jsonResponse(503, { kind: "provider_webhook_unavailable" });
  }
}

export function providerWebhookSignature(secret, body, { whatsapp = false } = {}) {
  const value = signature(secret, body);
  return whatsapp ? `sha256=${value}` : value;
}
