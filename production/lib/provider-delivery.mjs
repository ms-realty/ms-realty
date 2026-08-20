import { createPrivateContactEnvelope, openPrivateContactEnvelope } from "./private-contact-vault.mjs";
import { providerConnectionConfigFromEnv, readProviderCredentials } from "./provider-connections.mjs";

const PROVIDERS = new Set(["google", "whatsapp", "viber"]);
const STATUSES = new Set(["sending", "sent", "uncertain", "failed"]);
const INPUT_KEYS = new Set([
  "provider",
  "leadId",
  "idempotencyKey",
  "recipient",
  "message",
  "subject",
  "approved",
  "approvedBy",
  "approvedAt",
]);
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export const PROVIDER_DELIVERY_RECEIPT_COLLECTION = {
  slug: "provider_delivery_receipts",
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  admin: {
    useAsTitle: "idempotency_key",
    defaultColumns: ["provider", "status", "approved_at", "external_message_id"],
  },
  fields: [
    { name: "idempotency_key", type: "text", required: true, unique: true, index: true, maxLength: 128 },
    { name: "lead_id", type: "text", index: true, maxLength: 160 },
    { name: "provider", type: "text", required: true, index: true, maxLength: 24 },
    { name: "status", type: "text", required: true, index: true, maxLength: 24 },
    { name: "approved_by", type: "text", required: true, maxLength: 160 },
    { name: "approved_at", type: "date", required: true, index: true },
    { name: "started_at", type: "date", required: true, index: true },
    { name: "completed_at", type: "date" },
    { name: "external_message_id", type: "text", index: true, maxLength: 320 },
    { name: "failure_code", type: "text", maxLength: 64 },
    { name: "delivery_envelope", type: "json", required: true, admin: { hidden: true } },
  ],
};

export class ProviderDeliveryError extends Error {
  constructor(message, { code = "provider_delivery_failed", cause = null, receipt = null } = {}) {
    super(message);
    this.name = "ProviderDeliveryError";
    this.code = code;
    if (cause) this.cause = cause;
    if (receipt) this.receipt = receipt;
  }
}

class DefiniteDeliveryFailure extends Error {
  constructor(message, { code = "provider_delivery_failed", failureCode = "provider_delivery_failed", cause = null } = {}) {
    super(message);
    this.code = code;
    this.failureCode = failureCode;
    if (cause) this.cause = cause;
  }
}

class UncertainDeliveryFailure extends Error {
  constructor(message, cause = null) {
    super(message);
    this.code = "provider_delivery_uncertain";
    this.failureCode = "provider_acceptance_uncertain";
    if (cause) this.cause = cause;
  }
}

function isoTimestamp(value, label) {
  const text = String(value || "").trim();
  if (!text || Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(text).toISOString();
}

function requiredString(value, label, maxLength) {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const text = value.trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer`);
  if (/\0|[\r\n]/.test(text)) throw new Error(`${label} contains invalid control characters`);
  return text;
}

function providerName(value) {
  const provider = requiredString(value, "provider", 24);
  if (!PROVIDERS.has(provider)) throw new Error("Unsupported delivery provider");
  return provider;
}

function normalizeRecipient(provider, value) {
  const recipient = requiredString(value, "recipient", 320);
  if (provider === "google") {
    if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(recipient) || recipient.length > 254) {
      throw new Error("Google recipient must be one email address");
    }
    return recipient;
  }
  if (provider === "whatsapp") {
    if (!/^\+?[1-9]\d{7,14}$/.test(recipient)) throw new Error("WhatsApp recipient must be an E.164 phone number");
    return recipient.replace(/^\+/, "");
  }
  if (/\s|[\u0000-\u001f\u007f]/.test(recipient)) throw new Error("Viber recipient is invalid");
  return recipient;
}

function normalizeMessage(value) {
  if (typeof value !== "string") throw new Error("message must be a string");
  const message = value.replace(/\r\n?/g, "\n");
  if (!message.trim()) throw new Error("message is required");
  if (message.includes("\0")) throw new Error("message contains an invalid control character");
  if (Array.from(message).length > 4096) throw new Error("message must be 4096 characters or fewer");
  return message;
}

function normalizedRequest(input, startedAt) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new Error("Provider delivery input must be a plain object");
  }
  const unexpected = Object.keys(input).filter((key) => !INPUT_KEYS.has(key));
  if (unexpected.length) throw new Error(`Provider delivery input contains unsupported fields: ${unexpected.join(", ")}`);
  if (input.approved !== true) throw new Error("Human approval is required before provider delivery");
  const provider = providerName(input.provider);
  const idempotencyKey = requiredString(input.idempotencyKey, "idempotencyKey", 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)) throw new Error("idempotencyKey is invalid");
  const approvedAt = isoTimestamp(input.approvedAt, "approvedAt");
  if (Date.parse(approvedAt) > Date.parse(startedAt) + 30_000) throw new Error("approvedAt cannot be in the future");
  let subject = null;
  if (provider === "google") {
    subject = input.subject === undefined ? "MS Realty" : requiredString(input.subject, "subject", 200);
  } else if (input.subject !== undefined && input.subject !== "") {
    throw new Error("subject is only supported for Google delivery");
  }
  return {
    idempotencyKey,
    request: {
      provider,
      lead_id: input.leadId === undefined ? null : requiredString(input.leadId, "leadId", 160),
      recipient: normalizeRecipient(provider, input.recipient),
      message: normalizeMessage(input.message),
      subject,
      approved_by: requiredString(input.approvedBy, "approvedBy", 160),
      approved_at: approvedAt,
    },
  };
}

function assertPayloadRuntime(payload) {
  if (!payload || typeof payload.find !== "function" || typeof payload.create !== "function" || typeof payload.update !== "function") {
    throw new Error("Payload runtime cannot persist provider delivery receipts");
  }
  return payload;
}

async function runtimePayload(payload) {
  try {
    if (payload) return assertPayloadRuntime(payload);
    const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
    return assertPayloadRuntime(await getPayload({ config: await payloadConfigModule.default }));
  } catch (cause) {
    throw new ProviderDeliveryError("Provider delivery receipt store is unavailable", {
      code: "provider_delivery_unavailable",
      cause,
    });
  }
}

async function findReceipt(runtime, idempotencyKey) {
  const result = await runtime.find({
    collection: "provider_delivery_receipts",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { idempotency_key: { equals: idempotencyKey } },
  });
  if (!Array.isArray(result?.docs)) throw new Error("Payload provider delivery query did not return documents");
  return result.docs[0] || null;
}

function receiptEnvelope(idempotencyKey, request, status, { secret, storedAt, externalMessageId = null, failureCode = null } = {}) {
  return createPrivateContactEnvelope(
    {
      subjectType: "provider_delivery",
      subjectId: idempotencyKey,
      payload: {
        request,
        receipt: {
          status,
          external_message_id: externalMessageId,
          failure_code: failureCode,
          recorded_at: storedAt,
        },
      },
    },
    {
      secret,
      secretName: "MS_REALTY_PROVIDER_TOKEN_KEY",
      storedAt,
    },
  );
}

function storedRequest(document, secret) {
  const opened = openPrivateContactEnvelope(document.delivery_envelope, {
    secret,
    secretName: "MS_REALTY_PROVIDER_TOKEN_KEY",
  });
  if (opened.subject_type !== "provider_delivery" || opened.subject_id !== document.idempotency_key || !opened.payload?.request) {
    throw new Error("Provider delivery envelope does not match its receipt");
  }
  return opened.payload.request;
}

function requestsMatch(left, right) {
  return ["provider", "lead_id", "recipient", "message", "subject", "approved_by", "approved_at"].every(
    (key) => (left[key] ?? null) === (right[key] ?? null),
  );
}

function safeReceipt(document, idempotent = false) {
  return {
    idempotency_key: String(document.idempotency_key),
    lead_id: document.lead_id ? String(document.lead_id) : null,
    provider: String(document.provider),
    status: String(document.status),
    external_message_id: document.external_message_id ? String(document.external_message_id) : null,
    started_at: document.started_at || null,
    completed_at: document.completed_at || null,
    idempotent,
  };
}

async function updateReceipt(
  runtime,
  document,
  request,
  status,
  { secret, recordedAt, externalMessageId = null, failureCode = null } = {},
) {
  if (!STATUSES.has(status) || status === "sending") throw new Error("Invalid provider delivery transition");
  return runtime.update({
    collection: "provider_delivery_receipts",
    id: document.id,
    depth: 0,
    overrideAccess: true,
    data: {
      status,
      completed_at: recordedAt,
      external_message_id: externalMessageId,
      failure_code: failureCode,
      delivery_envelope: receiptEnvelope(document.idempotency_key, request, status, {
        secret,
        storedAt: recordedAt,
        externalMessageId,
        failureCode,
      }),
    },
  });
}

async function handleExisting(runtime, document, request, { secret, recordedAt } = {}) {
  let priorRequest;
  try {
    priorRequest = storedRequest(document, secret);
  } catch (cause) {
    throw new ProviderDeliveryError("Provider delivery receipt could not be verified", {
      code: "provider_delivery_unavailable",
      cause,
    });
  }
  if (!requestsMatch(priorRequest, request)) {
    throw new ProviderDeliveryError("Idempotency key already belongs to another provider delivery", {
      code: "provider_delivery_conflict",
    });
  }
  if (document.status === "sent") return safeReceipt(document, true);
  if (document.status === "sending") {
    try {
      document = await updateReceipt(runtime, document, request, "uncertain", {
        secret,
        recordedAt,
        failureCode: "prior_attempt_incomplete",
      });
    } catch (cause) {
      throw new ProviderDeliveryError("Prior provider delivery cannot be safely reconciled", {
        code: "provider_delivery_unavailable",
        cause,
      });
    }
  }
  if (document.status === "uncertain") {
    throw new ProviderDeliveryError("Prior provider delivery may have been accepted; refusing to resend", {
      code: "provider_delivery_uncertain",
      receipt: safeReceipt(document, true),
    });
  }
  if (document.status === "failed") {
    throw new ProviderDeliveryError("Provider delivery already failed; an approved retry requires a new idempotency key", {
      code: "provider_delivery_failed",
      receipt: safeReceipt(document, true),
    });
  }
  throw new ProviderDeliveryError("Provider delivery receipt has an invalid status", {
    code: "provider_delivery_unavailable",
  });
}

async function fetchJson(fetchImpl, url, init, { label, attempted }) {
  let response;
  try {
    response = await fetchImpl(url, init);
  } catch (cause) {
    if (attempted) throw new UncertainDeliveryFailure(`${label} acceptance is uncertain`, cause);
    throw new DefiniteDeliveryFailure(`${label} failed before message delivery`, {
      code: "provider_delivery_preflight_failed",
      failureCode: "provider_preflight_failed",
      cause,
    });
  }
  if (!response?.ok) {
    if (attempted) {
      if (Number(response?.status || 0) >= 500) {
        throw new UncertainDeliveryFailure(`${label} returned an uncertain server failure`);
      }
      throw new DefiniteDeliveryFailure(`${label} rejected the delivery request`, {
        code: "provider_delivery_rejected",
        failureCode: "provider_rejected",
      });
    }
    throw new DefiniteDeliveryFailure(`${label} rejected the preflight request`, {
      code: "provider_delivery_preflight_failed",
      failureCode: "provider_preflight_failed",
    });
  }
  let raw;
  let body;
  try {
    raw = await response.text();
    body = JSON.parse(raw);
  } catch (cause) {
    if (attempted) throw new UncertainDeliveryFailure(`${label} returned an invalid acceptance response`, cause);
    throw new DefiniteDeliveryFailure(`${label} returned an invalid preflight response`, {
      code: "provider_delivery_preflight_failed",
      failureCode: "provider_preflight_failed",
      cause,
    });
  }
  return { body, raw };
}

function rfc2822Message(request) {
  const subject = /^[\x20-\x7e]*$/.test(request.subject)
    ? request.subject
    : `=?UTF-8?B?${Buffer.from(request.subject, "utf8").toString("base64")}?=`;
  const body = request.message.replace(/\n/g, "\r\n");
  return [
    `To: ${request.recipient}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
}

async function sendGoogle(request, credentials, { config, fetchImpl }) {
  if (!credentials?.refresh_token || !config.googleClientId || !config.googleClientSecret) {
    throw new DefiniteDeliveryFailure("Google delivery credentials are unavailable", {
      code: "provider_delivery_not_connected",
      failureCode: "provider_not_connected",
    });
  }
  const token = await fetchJson(
    fetchImpl,
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: String(config.googleClientId),
        client_secret: String(config.googleClientSecret),
        refresh_token: String(credentials.refresh_token),
        grant_type: "refresh_token",
      }),
    },
    { label: "Google token refresh", attempted: false },
  );
  const accessToken = String(token.body.access_token || "");
  const scopes = String(token.body.scope || "").split(/\s+/).filter(Boolean);
  if (!accessToken || (scopes.length && !scopes.includes(GMAIL_SEND_SCOPE))) {
    throw new DefiniteDeliveryFailure("Google refresh token does not grant Gmail send access", {
      code: "provider_delivery_not_connected",
      failureCode: "provider_scope_missing",
    });
  }
  const response = await fetchJson(
    fetchImpl,
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(rfc2822Message(request), "utf8").toString("base64url") }),
    },
    { label: "Gmail", attempted: true },
  );
  if (!response.body.id) throw new UncertainDeliveryFailure("Gmail did not return a message id");
  return { externalMessageId: String(response.body.id) };
}

async function sendWhatsApp(request, credentials, { config, fetchImpl }) {
  const accessToken = String(credentials?.access_token || "");
  const phoneNumberId = String(credentials?.phone_number_id || "");
  if (!accessToken || !/^\d{5,32}$/.test(phoneNumberId) || !/^v\d+\.\d+$/.test(String(config.metaGraphVersion || ""))) {
    throw new DefiniteDeliveryFailure("WhatsApp delivery credentials are unavailable", {
      code: "provider_delivery_not_connected",
      failureCode: "provider_not_connected",
    });
  }
  const response = await fetchJson(
    fetchImpl,
    `https://graph.facebook.com/${config.metaGraphVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: request.recipient,
        type: "text",
        text: { preview_url: false, body: request.message },
      }),
    },
    { label: "WhatsApp", attempted: true },
  );
  const messageId = response.body.messages?.[0]?.id;
  if (!messageId) throw new UncertainDeliveryFailure("WhatsApp did not return a message id");
  return { externalMessageId: String(messageId) };
}

function exactViberMessageToken(raw, body) {
  if (typeof body.message_token === "string" && body.message_token) return body.message_token;
  const match = raw.match(/"message_token"\s*:\s*(?:"(\d+)"|(\d+))/);
  return match?.[1] || match?.[2] || null;
}

async function sendViber(request, credentials, { fetchImpl }) {
  const authToken = String(credentials?.auth_token || "");
  if (!authToken) {
    throw new DefiniteDeliveryFailure("Viber delivery credentials are unavailable", {
      code: "provider_delivery_not_connected",
      failureCode: "provider_not_connected",
    });
  }
  const response = await fetchJson(
    fetchImpl,
    "https://chatapi.viber.com/pa/send_message",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-viber-auth-token": authToken },
      body: JSON.stringify({
        receiver: request.recipient,
        min_api_version: 7,
        sender: { name: "MS Realty" },
        type: "text",
        text: request.message,
      }),
    },
    { label: "Viber", attempted: true },
  );
  if (Number(response.body.status) !== 0) {
    throw new DefiniteDeliveryFailure("Viber rejected the delivery request", {
      code: "provider_delivery_rejected",
      failureCode: "provider_rejected",
    });
  }
  const messageToken = exactViberMessageToken(response.raw, response.body);
  if (!messageToken) throw new UncertainDeliveryFailure("Viber did not return a message token");
  return { externalMessageId: messageToken };
}

async function sendToProvider(request, { config, fetchImpl, payload, readCredentials }) {
  let credentials;
  try {
    credentials = await readCredentials(request.provider, {
      credentialSecret: config.credentialSecret,
      payload,
    });
  } catch (cause) {
    throw new DefiniteDeliveryFailure("Provider credentials could not be read", {
      code: "provider_delivery_not_connected",
      failureCode: "provider_credentials_unavailable",
      cause,
    });
  }
  if (request.provider === "google") return sendGoogle(request, credentials, { config, fetchImpl });
  if (request.provider === "whatsapp") return sendWhatsApp(request, credentials, { config, fetchImpl });
  return sendViber(request, credentials, { config, fetchImpl });
}

export async function readProviderDeliveryReceipt(idempotencyKey, { payload = null } = {}) {
  const key = requiredString(idempotencyKey, "idempotencyKey", 128);
  try {
    const runtime = await runtimePayload(payload);
    const document = await findReceipt(runtime, key);
    return document ? safeReceipt(document, true) : null;
  } catch (cause) {
    if (cause instanceof ProviderDeliveryError) throw cause;
    throw new ProviderDeliveryError("Provider delivery receipt read failed", {
      code: "provider_delivery_unavailable",
      cause,
    });
  }
}

export async function deliverApprovedProviderMessage(
  input,
  {
    config = providerConnectionConfigFromEnv(),
    payload = null,
    fetchImpl = globalThis.fetch,
    readCredentials = readProviderCredentials,
    now = () => new Date().toISOString(),
  } = {},
) {
  const startedAt = isoTimestamp(typeof now === "function" ? now() : now, "delivery time");
  const { idempotencyKey, request } = normalizedRequest(input, startedAt);
  if (typeof fetchImpl !== "function" || typeof readCredentials !== "function") throw new Error("Provider delivery boundaries are unavailable");
  const secret = String(config.credentialSecret || "");
  const runtime = await runtimePayload(payload);
  let existing;
  try {
    existing = await findReceipt(runtime, idempotencyKey);
  } catch (cause) {
    throw new ProviderDeliveryError("Provider delivery receipt read failed", {
      code: "provider_delivery_unavailable",
      cause,
    });
  }
  if (existing) return handleExisting(runtime, existing, request, { secret, recordedAt: startedAt });

  const sendingData = {
    idempotency_key: idempotencyKey,
    lead_id: request.lead_id,
    provider: request.provider,
    status: "sending",
    approved_by: request.approved_by,
    approved_at: request.approved_at,
    started_at: startedAt,
    completed_at: null,
    external_message_id: null,
    failure_code: null,
    delivery_envelope: receiptEnvelope(idempotencyKey, request, "sending", {
      secret,
      storedAt: startedAt,
    }),
  };
  let document;
  try {
    document = await runtime.create({
      collection: "provider_delivery_receipts",
      depth: 0,
      overrideAccess: true,
      data: sendingData,
    });
  } catch (cause) {
    try {
      const raced = await findReceipt(runtime, idempotencyKey);
      if (raced) return handleExisting(runtime, raced, request, { secret, recordedAt: startedAt });
    } catch (raceCause) {
      if (raceCause instanceof ProviderDeliveryError) throw raceCause;
    }
    throw new ProviderDeliveryError("Provider delivery fence could not be persisted", {
      code: "provider_delivery_unavailable",
      cause,
    });
  }

  let providerResult;
  try {
    providerResult = await sendToProvider(request, {
      config,
      fetchImpl,
      payload: runtime,
      readCredentials,
    });
  } catch (cause) {
    const uncertain = cause instanceof UncertainDeliveryFailure;
    const completedAt = isoTimestamp(typeof now === "function" ? now() : now, "delivery time");
    let receipt;
    try {
      document = await updateReceipt(runtime, document, request, uncertain ? "uncertain" : "failed", {
        secret,
        recordedAt: completedAt,
        failureCode: cause.failureCode || (uncertain ? "provider_acceptance_uncertain" : "provider_delivery_failed"),
      });
      receipt = safeReceipt(document);
    } catch (storeCause) {
      throw new ProviderDeliveryError("Provider delivery outcome could not be persisted", {
        code: "provider_delivery_unavailable",
        cause: storeCause,
      });
    }
    throw new ProviderDeliveryError(cause.message || "Provider delivery failed", {
      code: cause.code || (uncertain ? "provider_delivery_uncertain" : "provider_delivery_failed"),
      cause,
      receipt,
    });
  }

  const completedAt = isoTimestamp(typeof now === "function" ? now() : now, "delivery time");
  try {
    document = await updateReceipt(runtime, document, request, "sent", {
      secret,
      recordedAt: completedAt,
      externalMessageId: providerResult.externalMessageId,
    });
    return safeReceipt(document);
  } catch (cause) {
    let receipt = null;
    try {
      document = await updateReceipt(runtime, document, request, "uncertain", {
        secret,
        recordedAt: completedAt,
        externalMessageId: providerResult.externalMessageId,
        failureCode: "receipt_commit_failed",
      });
      receipt = safeReceipt(document);
    } catch {
      // The durable sending fence remains. A later attempt converts it to uncertain and never resends.
    }
    throw new ProviderDeliveryError("Provider accepted the message but its delivery receipt is uncertain", {
      code: "provider_delivery_uncertain",
      cause,
      receipt,
    });
  }
}
