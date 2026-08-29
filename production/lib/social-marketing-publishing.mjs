import { createPrivateContactEnvelope, openPrivateContactEnvelope } from "./private-contact-vault.mjs";
import { providerConnectionConfigFromEnv, readProviderCredentials } from "./provider-connections.mjs";

const PROVIDERS = new Set(["facebook", "instagram"]);
const STATUSES = new Set(["publishing", "published", "uncertain", "failed"]);
const INPUT_KEYS = new Set([
  "provider",
  "workspaceId",
  "idempotencyKey",
  "message",
  "link",
  "imageUrl",
  "caption",
  "approved",
  "approvedBy",
  "approvedAt",
]);

export const SOCIAL_MARKETING_PUBLICATION_COLLECTION = {
  slug: "social_marketing_publications",
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  admin: {
    useAsTitle: "idempotency_key",
    defaultColumns: ["workspace_id", "provider", "status", "approved_at", "external_post_id"],
  },
  fields: [
    { name: "idempotency_key", type: "text", required: true, unique: true, index: true, maxLength: 128 },
    { name: "workspace_id", type: "text", required: true, index: true, maxLength: 160 },
    { name: "provider", type: "text", required: true, index: true, maxLength: 24 },
    { name: "status", type: "text", required: true, index: true, maxLength: 24 },
    { name: "approved_by", type: "text", required: true, maxLength: 160 },
    { name: "approved_at", type: "date", required: true, index: true },
    { name: "started_at", type: "date", required: true, index: true },
    { name: "completed_at", type: "date" },
    { name: "external_post_id", type: "text", index: true, maxLength: 320 },
    { name: "external_account_id", type: "text", index: true, maxLength: 320 },
    { name: "failure_code", type: "text", maxLength: 64 },
    { name: "publication_envelope", type: "json", required: true, admin: { hidden: true } },
  ],
};

export class SocialMarketingPublishError extends Error {
  constructor(message, { code = "social_marketing_failed", cause = null, receipt = null } = {}) {
    super(message);
    this.name = "SocialMarketingPublishError";
    this.code = code;
    if (cause) this.cause = cause;
    if (receipt) this.receipt = receipt;
  }
}

class DefinitePublishFailure extends Error {
  constructor(message, { code = "social_marketing_failed", failureCode = "social_marketing_failed", cause = null } = {}) {
    super(message);
    this.code = code;
    this.failureCode = failureCode;
    if (cause) this.cause = cause;
  }
}

class UncertainPublishFailure extends Error {
  constructor(message, cause = null) {
    super(message);
    this.code = "social_marketing_uncertain";
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
  const provider = requiredString(value, "provider", 24).toLowerCase();
  if (!PROVIDERS.has(provider)) throw new Error("Unsupported social marketing provider");
  return provider;
}

function normalizeText(value, label, maxLength) {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.includes("\0")) throw new Error(`${label} contains an invalid control character`);
  if (Array.from(text).length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer`);
  return text;
}

function normalizeUrl(value, label, { required = true } = {}) {
  const raw = String(value || "").trim();
  if (!raw) {
    if (required) throw new Error(`${label} is required`);
    return null;
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${label} must be an http or https URL`);
  }
  return url.toString();
}

function normalizedRequest(input, startedAt) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new Error("Social marketing input must be a plain object");
  }
  const unexpected = Object.keys(input).filter((key) => !INPUT_KEYS.has(key));
  if (unexpected.length) throw new Error(`Social marketing input contains unsupported fields: ${unexpected.join(", ")}`);
  if (input.approved !== true) throw new Error("Human approval is required before social publishing");
  const provider = providerName(input.provider);
  const idempotencyKey = requiredString(input.idempotencyKey, "idempotencyKey", 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)) throw new Error("idempotencyKey is invalid");
  const workspaceId = requiredString(input.workspaceId, "workspaceId", 160);
  const approvedAt = isoTimestamp(input.approvedAt, "approvedAt");
  if (Date.parse(approvedAt) > Date.parse(startedAt) + 30_000) throw new Error("approvedAt cannot be in the future");
  if (provider === "facebook") {
    if (input.imageUrl !== undefined && String(input.imageUrl).trim()) throw new Error("imageUrl is only supported for Instagram publishing");
    if (input.caption !== undefined && String(input.caption).trim()) throw new Error("caption is only supported for Instagram publishing");
    return {
      idempotencyKey,
      request: {
        provider,
        workspace_id: workspaceId,
        message: normalizeText(input.message, "message", 63_206),
        link: input.link === undefined ? null : normalizeUrl(input.link, "link", { required: false }),
        image_url: null,
        caption: null,
        approved_by: requiredString(input.approvedBy, "approvedBy", 160),
        approved_at: approvedAt,
      },
    };
  }
  if (input.message !== undefined && String(input.message).trim()) throw new Error("message is only supported for Facebook publishing");
  if (input.link !== undefined && String(input.link).trim()) throw new Error("link is only supported for Facebook publishing");
  return {
    idempotencyKey,
    request: {
      provider,
      workspace_id: workspaceId,
      message: null,
      link: null,
      image_url: normalizeUrl(input.imageUrl, "imageUrl"),
      caption: normalizeText(input.caption, "caption", 2_200),
      approved_by: requiredString(input.approvedBy, "approvedBy", 160),
      approved_at: approvedAt,
    },
  };
}

function assertPayloadRuntime(payload) {
  if (!payload || typeof payload.find !== "function" || typeof payload.create !== "function" || typeof payload.update !== "function") {
    throw new Error("Payload runtime cannot persist social marketing publications");
  }
  return payload;
}

async function runtimePayload(payload) {
  try {
    if (payload) return assertPayloadRuntime(payload);
    const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
    return assertPayloadRuntime(await getPayload({ config: await payloadConfigModule.default }));
  } catch (cause) {
    throw new SocialMarketingPublishError("Social marketing receipt store is unavailable", {
      code: "social_marketing_unavailable",
      cause,
    });
  }
}

async function findReceipt(runtime, idempotencyKey) {
  const result = await runtime.find({
    collection: "social_marketing_publications",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { idempotency_key: { equals: idempotencyKey } },
  });
  if (!Array.isArray(result?.docs)) throw new Error("Payload social marketing query did not return documents");
  return result.docs[0] || null;
}

function receiptEnvelope(idempotencyKey, request, status, { secret, storedAt, externalPostId = null, externalAccountId = null, failureCode = null } = {}) {
  return createPrivateContactEnvelope(
    {
      subjectType: "social_marketing_publication",
      subjectId: idempotencyKey,
      payload: {
        request,
        receipt: {
          status,
          external_post_id: externalPostId,
          external_account_id: externalAccountId,
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
  const opened = openPrivateContactEnvelope(document.publication_envelope, {
    secret,
    secretName: "MS_REALTY_PROVIDER_TOKEN_KEY",
  });
  if (
    opened.subject_type !== "social_marketing_publication" ||
    opened.subject_id !== document.idempotency_key ||
    !opened.payload?.request
  ) {
    throw new Error("Social marketing envelope does not match its receipt");
  }
  return opened.payload.request;
}

function requestsMatch(left, right) {
  return ["provider", "workspace_id", "message", "link", "image_url", "caption", "approved_by", "approved_at"].every(
    (key) => (left[key] ?? null) === (right[key] ?? null),
  );
}

function safeReceipt(document, idempotent = false) {
  return {
    idempotency_key: String(document.idempotency_key),
    workspace_id: String(document.workspace_id),
    provider: String(document.provider),
    status: String(document.status),
    external_post_id: document.external_post_id ? String(document.external_post_id) : null,
    external_account_id: document.external_account_id ? String(document.external_account_id) : null,
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
  { secret, recordedAt, externalPostId = null, externalAccountId = null, failureCode = null } = {},
) {
  if (!STATUSES.has(status) || status === "publishing") throw new Error("Invalid social marketing transition");
  return runtime.update({
    collection: "social_marketing_publications",
    id: document.id,
    depth: 0,
    overrideAccess: true,
    data: {
      status,
      completed_at: recordedAt,
      external_post_id: externalPostId,
      external_account_id: externalAccountId,
      failure_code: failureCode,
      publication_envelope: receiptEnvelope(document.idempotency_key, request, status, {
        secret,
        storedAt: recordedAt,
        externalPostId,
        externalAccountId,
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
    throw new SocialMarketingPublishError("Social marketing receipt could not be verified", {
      code: "social_marketing_unavailable",
      cause,
    });
  }
  if (!requestsMatch(priorRequest, request)) {
    throw new SocialMarketingPublishError("Idempotency key already belongs to another social publication", {
      code: "social_marketing_conflict",
    });
  }
  if (document.status === "published") return safeReceipt(document, true);
  if (document.status === "publishing") {
    try {
      document = await updateReceipt(runtime, document, request, "uncertain", {
        secret,
        recordedAt,
        failureCode: "prior_attempt_incomplete",
      });
    } catch (cause) {
      throw new SocialMarketingPublishError("Prior social publication cannot be safely reconciled", {
        code: "social_marketing_unavailable",
        cause,
      });
    }
  }
  if (document.status === "uncertain") {
    throw new SocialMarketingPublishError("Prior social publication may have been accepted; refusing to republish", {
      code: "social_marketing_uncertain",
      receipt: safeReceipt(document, true),
    });
  }
  if (document.status === "failed") {
    throw new SocialMarketingPublishError("Social publication already failed; an approved retry requires a new idempotency key", {
      code: "social_marketing_failed",
      receipt: safeReceipt(document, true),
    });
  }
  throw new SocialMarketingPublishError("Social marketing receipt has an invalid status", {
    code: "social_marketing_unavailable",
  });
}

async function fetchJson(fetchImpl, url, init, { label, attempted }) {
  let response;
  try {
    response = await fetchImpl(url, init);
  } catch (cause) {
    if (attempted) throw new UncertainPublishFailure(`${label} acceptance is uncertain`, cause);
    throw new DefinitePublishFailure(`${label} failed before publish`, {
      code: "social_marketing_unavailable",
      failureCode: "provider_preflight_failed",
      cause,
    });
  }
  if (!response?.ok) {
    if (attempted) {
      if (Number(response?.status || 0) >= 500) {
        throw new UncertainPublishFailure(`${label} returned an uncertain server failure`);
      }
      throw new DefinitePublishFailure(`${label} rejected the publication request`, {
        code: "social_marketing_provider_rejected",
        failureCode: "provider_rejected",
      });
    }
    throw new DefinitePublishFailure(`${label} rejected the preflight request`, {
      code: "social_marketing_unavailable",
      failureCode: "provider_preflight_failed",
    });
  }
  let raw;
  let body;
  try {
    raw = await response.text();
    body = JSON.parse(raw);
  } catch (cause) {
    if (attempted) throw new UncertainPublishFailure(`${label} returned an invalid acceptance response`, cause);
    throw new DefinitePublishFailure(`${label} returned an invalid preflight response`, {
      code: "social_marketing_unavailable",
      failureCode: "provider_preflight_failed",
      cause,
    });
  }
  return { body, raw };
}

function assertMetaPublishingReady(config, provider) {
  if (!config?.credentialSecret || String(config.credentialSecret).length < 32 || !/^v\d+\.\d+$/.test(String(config.metaGraphVersion || ""))) {
    throw new DefinitePublishFailure("Meta publishing is not configured", {
      code: "social_marketing_unavailable",
      failureCode: "meta_publishing_unavailable",
    });
  }
  if (provider === "facebook" && config.metaFacebookPublishReady !== true) {
    throw new DefinitePublishFailure("Facebook publishing is not configured", {
      code: "social_marketing_unavailable",
      failureCode: "meta_app_review_incomplete",
    });
  }
  if (provider === "instagram" && config.metaInstagramPublishReady !== true) {
    throw new DefinitePublishFailure("Instagram publishing is not configured", {
      code: "social_marketing_unavailable",
      failureCode: "meta_app_review_incomplete",
    });
  }
}

async function publishFacebook(request, credentials, { config, fetchImpl }) {
  assertMetaPublishingReady(config, "facebook");
  const pageAccessToken = String(credentials?.page_access_token || "");
  const pageId = String(credentials?.page_id || "");
  if (!pageAccessToken || !/^\d{5,32}$/.test(pageId)) {
    throw new DefinitePublishFailure("Facebook publishing credentials are unavailable", {
      code: "social_marketing_not_connected",
      failureCode: "provider_not_connected",
    });
  }
  const response = await fetchJson(
    fetchImpl,
    `https://graph.facebook.com/${config.metaGraphVersion}/${pageId}/feed`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${pageAccessToken}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        message: request.message,
        ...(request.link ? { link: request.link } : {}),
      }),
    },
    { label: "Facebook Page", attempted: true },
  );
  if (!response.body.id) throw new UncertainPublishFailure("Facebook Page did not return a post id");
  return { externalPostId: String(response.body.id), externalAccountId: pageId };
}

async function publishInstagram(request, credentials, { config, fetchImpl }) {
  assertMetaPublishingReady(config, "instagram");
  const pageAccessToken = String(credentials?.page_access_token || "");
  const instagramAccountId = String(credentials?.instagram_account_id || "");
  if (!pageAccessToken || !/^\d{5,32}$/.test(instagramAccountId)) {
    throw new DefinitePublishFailure("Instagram publishing credentials are unavailable", {
      code: "social_marketing_not_connected",
      failureCode: "provider_not_connected",
    });
  }
  const media = await fetchJson(
    fetchImpl,
    `https://graph.facebook.com/${config.metaGraphVersion}/${instagramAccountId}/media`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${pageAccessToken}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        image_url: request.image_url,
        caption: request.caption,
      }),
    },
    { label: "Instagram media creation", attempted: true },
  );
  const creationId = String(media.body.id || "");
  if (!creationId) throw new UncertainPublishFailure("Instagram did not return a media creation id");
  const publish = await fetchJson(
    fetchImpl,
    `https://graph.facebook.com/${config.metaGraphVersion}/${instagramAccountId}/media_publish`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${pageAccessToken}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ creation_id: creationId }),
    },
    { label: "Instagram publish", attempted: true },
  );
  if (!publish.body.id) throw new UncertainPublishFailure("Instagram did not return a published media id");
  return { externalPostId: String(publish.body.id), externalAccountId: instagramAccountId };
}

async function publishToProvider(request, { config, fetchImpl, payload, readCredentials }) {
  let credentials;
  try {
    credentials = await readCredentials(request.provider, {
      credentialSecret: config.credentialSecret,
      payload,
    });
  } catch (cause) {
    throw new DefinitePublishFailure("Provider credentials could not be read", {
      code: "social_marketing_unavailable",
      failureCode: "provider_credentials_unavailable",
      cause,
    });
  }
  if (!credentials) {
    throw new DefinitePublishFailure("Provider is not connected for social publishing", {
      code: "social_marketing_not_connected",
      failureCode: "provider_not_connected",
    });
  }
  if (request.provider === "facebook") return publishFacebook(request, credentials, { config, fetchImpl });
  return publishInstagram(request, credentials, { config, fetchImpl });
}

export async function publishApprovedSocialDraft(
  input,
  {
    config = providerConnectionConfigFromEnv(),
    payload = null,
    fetchImpl = globalThis.fetch,
    readCredentials = readProviderCredentials,
    now = () => new Date().toISOString(),
  } = {},
) {
  const startedAt = isoTimestamp(typeof now === "function" ? now() : now, "publish time");
  const { idempotencyKey, request } = normalizedRequest(input, startedAt);
  if (typeof fetchImpl !== "function" || typeof readCredentials !== "function") throw new Error("Social marketing boundaries are unavailable");
  const secret = String(config.credentialSecret || "");
  const runtime = await runtimePayload(payload);
  let existing;
  try {
    existing = await findReceipt(runtime, idempotencyKey);
  } catch (cause) {
    throw new SocialMarketingPublishError("Social marketing receipt read failed", {
      code: "social_marketing_unavailable",
      cause,
    });
  }
  if (existing) return handleExisting(runtime, existing, request, { secret, recordedAt: startedAt });

  const publishingData = {
    idempotency_key: idempotencyKey,
    workspace_id: request.workspace_id,
    provider: request.provider,
    status: "publishing",
    approved_by: request.approved_by,
    approved_at: request.approved_at,
    started_at: startedAt,
    completed_at: null,
    external_post_id: null,
    external_account_id: null,
    failure_code: null,
    publication_envelope: receiptEnvelope(idempotencyKey, request, "publishing", {
      secret,
      storedAt: startedAt,
    }),
  };

  let document;
  try {
    document = await runtime.create({
      collection: "social_marketing_publications",
      depth: 0,
      overrideAccess: true,
      data: publishingData,
    });
  } catch (cause) {
    try {
      const raced = await findReceipt(runtime, idempotencyKey);
      if (raced) return handleExisting(runtime, raced, request, { secret, recordedAt: startedAt });
    } catch {}
    throw new SocialMarketingPublishError("Social marketing fence could not be persisted", {
      code: "social_marketing_unavailable",
      cause,
    });
  }

  let providerResult;
  try {
    providerResult = await publishToProvider(request, {
      config,
      fetchImpl,
      payload: runtime,
      readCredentials,
    });
  } catch (cause) {
    const uncertain = cause instanceof UncertainPublishFailure;
    const completedAt = isoTimestamp(typeof now === "function" ? now() : now, "publish time");
    let receipt;
    try {
      document = await updateReceipt(runtime, document, request, uncertain ? "uncertain" : "failed", {
        secret,
        recordedAt: completedAt,
        failureCode: cause.failureCode || (uncertain ? "provider_acceptance_uncertain" : "social_marketing_failed"),
      });
      receipt = safeReceipt(document);
    } catch (storeCause) {
      throw new SocialMarketingPublishError("Social marketing outcome could not be persisted", {
        code: "social_marketing_unavailable",
        cause: storeCause,
      });
    }
    throw new SocialMarketingPublishError(cause.message || "Social marketing publication failed", {
      code: cause.code || (uncertain ? "social_marketing_uncertain" : "social_marketing_failed"),
      cause,
      receipt,
    });
  }

  const completedAt = isoTimestamp(typeof now === "function" ? now() : now, "publish time");
  try {
    document = await updateReceipt(runtime, document, request, "published", {
      secret,
      recordedAt: completedAt,
      externalPostId: providerResult.externalPostId,
      externalAccountId: providerResult.externalAccountId,
    });
  } catch (cause) {
    throw new SocialMarketingPublishError("Social marketing outcome could not be persisted", {
      code: "social_marketing_unavailable",
      cause,
    });
  }
  return safeReceipt(document);
}
