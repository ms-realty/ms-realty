import crypto from "node:crypto";
import { createPrivateContactEnvelope, openPrivateContactEnvelope } from "./private-contact-vault.mjs";
import {
  DEFAULT_OPENROUTER_CHAT_COMPLETIONS_URL,
  assertHermesChatCompletionsEndpoint,
  hermesProviderConfigFromEnv,
} from "./hermes-provider-provisioning.mjs";
import { readProviderCredentials } from "./provider-connections.mjs";

export const HERMES_OWNER_COMMAND_MAX_LENGTH = 2_000;
export const HERMES_OWNER_RECEIPT_REQUEST_TTL_MS = 60_000;
const HERMES_OWNER_COMMAND_TIMEOUT_MS = 60_000;
export const HERMES_OWNER_RECEIPT_COLLECTION = {
  slug: "hermes_owner_receipts",
  access: { read: () => false, create: () => false, update: () => false, delete: () => false },
  admin: {
    useAsTitle: "idempotency_key",
    defaultColumns: ["operator_id", "status", "model", "started_at", "completed_at"],
  },
  fields: [
    { name: "idempotency_key", type: "text", required: true, unique: true, index: true, maxLength: 128 },
    { name: "operator_id", type: "text", required: true, index: true, maxLength: 160 },
    { name: "status", type: "text", required: true, index: true, maxLength: 24 },
    { name: "command_digest", type: "text", required: true, maxLength: 71 },
    { name: "model", type: "text", required: true, maxLength: 160 },
    { name: "evidence_refs", type: "json", required: true },
    { name: "started_at", type: "date", required: true, index: true },
    { name: "completed_at", type: "date" },
    { name: "failure_code", type: "text", maxLength: 64 },
    { name: "receipt_envelope", type: "json", required: true, admin: { hidden: true } },
  ],
};

export const HERMES_OWNER_DESTINATIONS = Object.freeze([
  { id: "today", path: "/admin/today", purpose: "Review the source-backed daily briefing and priorities." },
  { id: "work", path: "/admin/leads", purpose: "Review enquiries, contacts, pipeline work, deals, and viewings." },
  { id: "properties", path: "/admin/listings", purpose: "Review property records, facts, media, and publication state." },
  { id: "content", path: "/admin/translations", purpose: "Draft and review website content and translations." },
  { id: "hermes", path: "/admin/hermes", purpose: "Review Hermes plans, draft tasks, health, and receipts." },
  { id: "integrations", path: "/admin/connect", purpose: "Review one-click provider connections and recovery actions." },
  { id: "settings", path: "/admin/settings", purpose: "Review owner profile, team access, security, and shared settings." },
]);

const DESTINATION_BY_ID = new Map(HERMES_OWNER_DESTINATIONS.map((row) => [row.id, row]));
const EVIDENCE_REFS = new Set(["authenticated_owner_scope", "admin_destination_map", "hermes_guardrails"]);
const INPUT_KEYS = new Set(["command", "idempotencyKey", "locale"]);
const PLAN_KEYS = new Set(["summary", "steps", "questions"]);
const STEP_KEYS = new Set(["title", "why", "destination", "mode", "evidence"]);
const BUSINESS_CONTEXT_KEYS = new Set(["generated_at", "authoritative_state", "counts", "providers"]);
const BUSINESS_CONTEXT_AUTHORITY_KEYS = new Set(["status", "source", "authoritative", "reason_key"]);
const BUSINESS_CONTEXT_COUNT_KEYS = new Set(["leads", "pipeline", "tasks", "listings"]);
const BUSINESS_CONTEXT_PROVIDER_KEYS = new Set(["id", "status", "scopes", "last_verified_at"]);
const PLAN_MODES = new Set(["review", "draft"]);
const STATUSES = new Set(["requested", "planned", "failed"]);
const LOCALES = new Set(["bg", "ru", "en"]);
const COMMAND_CONTACT_LABEL = /\b(?:email|e-mail|phone|mobile|tel|telephone|contact|whatsapp|viber|telegram|signal)\b\s*[:=]\s*\S+/i;
const EMAIL_ADDRESS = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_NUMBER = /(?:\+|00)\s*\d(?:[\s().-]*\d){6,}|\b\d{10,}\b|\b\d{3,}[\s().-]\d(?:[\s().-]*\d){4,}\b/;
const PROVIDER_NETWORK_ERROR_CODES = new Set(["ECONNABORTED", "ECONNREFUSED", "ECONNRESET", "ENETDOWN", "ENETUNREACH", "ENOTFOUND", "EHOSTDOWN", "EHOSTUNREACH"]);

const FAILURE_MESSAGES = Object.freeze({
  bad_request: "Tell Hermes what you want to prepare.",
  hermes_receipt_unavailable: "Hermes cannot run until its durable receipt store is available.",
  hermes_context_unavailable: "Hermes cannot plan until authoritative business context is available.",
  hermes_command_contains_sensitive_data: "Hosted Hermes planning accepts only privacy-safe owner commands.",
  hermes_unavailable: "Hermes could not prepare a plan. Check the agent connection and try again.",
  hermes_invalid_plan: "Hermes returned a plan that did not satisfy the safety contract.",
  hermes_provider_unauthorized: "Hermes provider authorization needs attention before planning can continue.",
  hermes_provider_payment_required: "Hermes provider billing needs attention before planning can continue.",
  hermes_provider_rate_limited: "Hermes provider is rate limited. Try again shortly.",
  hermes_provider_timeout: "Hermes provider timed out before returning a plan.",
  hermes_provider_network: "Hermes provider could not be reached from this runtime.",
  hermes_provider_service_unavailable: "Hermes provider is temporarily unavailable.",
  idempotency_conflict: "This Hermes request identifier was already used for different work.",
  hermes_command_in_progress: "This Hermes request is already recorded and will not be repeated automatically.",
  hermes_command_expired: "This Hermes request expired before a plan was recorded and will not be repeated automatically.",
});

const FAILURE_STATUS = Object.freeze({
  bad_request: 400,
  hermes_receipt_unavailable: 503,
  hermes_context_unavailable: 503,
  hermes_command_contains_sensitive_data: 400,
  hermes_unavailable: 503,
  hermes_invalid_plan: 502,
  hermes_provider_unauthorized: 503,
  hermes_provider_payment_required: 503,
  hermes_provider_rate_limited: 503,
  hermes_provider_timeout: 503,
  hermes_provider_network: 503,
  hermes_provider_service_unavailable: 503,
  idempotency_conflict: 409,
  hermes_command_in_progress: 409,
  hermes_command_expired: 502,
});

export class HermesOwnerCommandError extends Error {
  constructor(code, { status = 400, cause = null, receipt = null } = {}) {
    super(FAILURE_MESSAGES[code] || FAILURE_MESSAGES.bad_request);
    this.name = "HermesOwnerCommandError";
    this.code = code;
    this.status = status;
    if (cause) this.cause = cause;
    if (receipt) this.receipt = receipt;
  }
}

export function createHermesOwnerCommandIdempotencyKey() {
  return `hermes-${crypto.randomUUID()}`;
}

function requiredText(value, label, maxLength) {
  if (typeof value !== "string") throw new HermesOwnerCommandError("bad_request");
  const text = value.trim();
  if (!text || text.includes("\0") || Array.from(text).length > maxLength) {
    throw new HermesOwnerCommandError("bad_request");
  }
  return text;
}

function requiredContextText(value, label, maxLength) {
  try {
    return requiredText(value, label, maxLength);
  } catch (cause) {
    throw new HermesOwnerCommandError("hermes_context_unavailable", { status: 503, cause });
  }
}

function onlyKeys(value, allowed, code) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new HermesOwnerCommandError(code, { status: 502 });
  }
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new HermesOwnerCommandError(code, { status: 502 });
  return value;
}

function isoTimestamp(value) {
  const text = String(value || "").trim();
  if (!text || Number.isNaN(Date.parse(text))) throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503 });
  return new Date(text).toISOString();
}

function contextTimestamp(value) {
  try {
    return isoTimestamp(value);
  } catch (cause) {
    throw new HermesOwnerCommandError("hermes_context_unavailable", { status: 503, cause });
  }
}

function normalizeInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new HermesOwnerCommandError("bad_request");
  }
  if (Object.keys(input).some((key) => !INPUT_KEYS.has(key))) throw new HermesOwnerCommandError("bad_request");
  const idempotencyKey = requiredText(input.idempotencyKey, "idempotencyKey", 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)) throw new HermesOwnerCommandError("bad_request");
  const locale = String(input.locale || "en").trim().toLowerCase();
  if (!LOCALES.has(locale)) throw new HermesOwnerCommandError("bad_request");
  return {
    command: requiredText(input.command, "command", HERMES_OWNER_COMMAND_MAX_LENGTH),
    idempotencyKey,
    locale,
  };
}

function commandDigest(command) {
  return `sha256:${crypto.createHash("sha256").update(command).digest("hex")}`;
}

function ownerReceiptDigest(command, locale, contextDigest) {
  return commandDigest(JSON.stringify({ command, locale, contextDigest }));
}

function nonNegativeCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new HermesOwnerCommandError("hermes_context_unavailable", { status: 503, cause: new Error(`${label} must be a non-negative integer`) });
  }
  return value;
}

function privacySafeProvider(provider) {
  const normalized = onlyKeys(provider, BUSINESS_CONTEXT_PROVIDER_KEYS, "hermes_context_unavailable");
  const scopes = Array.isArray(normalized.scopes)
    ? [...new Set(normalized.scopes.map((scope) => requiredContextText(scope, "provider scope", 160)))]
    : null;
  if (scopes === null) throw new HermesOwnerCommandError("hermes_context_unavailable", { status: 503 });
  const lastVerifiedAt = normalized.last_verified_at == null ? null : contextTimestamp(normalized.last_verified_at);
  return {
    id: requiredContextText(normalized.id, "provider id", 120),
    status: requiredContextText(normalized.status, "provider status", 80),
    scopes: scopes.sort((left, right) => left.localeCompare(right)),
    last_verified_at: lastVerifiedAt,
  };
}

function normalizeBusinessContext(context, { required = false } = {}) {
  if (context == null) {
    if (!required) return null;
    throw new HermesOwnerCommandError("hermes_context_unavailable", { status: 503 });
  }
  const normalized = onlyKeys(context, BUSINESS_CONTEXT_KEYS, "hermes_context_unavailable");
  const authority = onlyKeys(normalized.authoritative_state, BUSINESS_CONTEXT_AUTHORITY_KEYS, "hermes_context_unavailable");
  const counts = onlyKeys(normalized.counts, BUSINESS_CONTEXT_COUNT_KEYS, "hermes_context_unavailable");
  const providers = Array.isArray(normalized.providers)
    ? normalized.providers.map((provider) => privacySafeProvider(provider)).sort((left, right) => left.id.localeCompare(right.id))
    : null;
  if (providers === null) throw new HermesOwnerCommandError("hermes_context_unavailable", { status: 503 });
  const authorityStatus = requiredContextText(authority.status, "context authority status", 40);
  const authoritative = authority.authoritative === true;
  const safe = {
    generated_at: contextTimestamp(normalized.generated_at),
    authoritative_state: {
      status: authorityStatus,
      source: requiredContextText(authority.source, "context authority source", 120),
      authoritative,
      ...(authority.reason_key === undefined ? {} : { reason_key: requiredContextText(authority.reason_key, "context authority reason", 120) }),
    },
    counts: {
      leads: nonNegativeCount(counts.leads, "Business-context leads count"),
      pipeline: nonNegativeCount(counts.pipeline, "Business-context pipeline count"),
      tasks: nonNegativeCount(counts.tasks, "Business-context tasks count"),
      listings: nonNegativeCount(counts.listings, "Business-context listings count"),
    },
    providers,
  };
  if (authorityStatus !== "available" || authoritative !== true) {
    throw new HermesOwnerCommandError("hermes_context_unavailable", { status: 503 });
  }
  return safe;
}

function businessContextDigest(context) {
  return commandDigest(JSON.stringify(context));
}

function commandContainsSensitiveData(command) {
  const text = String(command || "").trim();
  return COMMAND_CONTACT_LABEL.test(text) || EMAIL_ADDRESS.test(text) || PHONE_NUMBER.test(text);
}

function evidenceFor(operator) {
  const roles = Array.isArray(operator?.roles) ? operator.roles.map(String).sort() : [];
  const workspaceIds = Array.isArray(operator?.workspace_ids) ? operator.workspace_ids : [];
  return [
    {
      id: "authenticated_owner_scope",
      kind: "principal",
      roles,
      workspace_scope: roles.includes("admin") && workspaceIds.length === 0 ? "all" : "scoped",
    },
    {
      id: "admin_destination_map",
      kind: "route_contract",
      destinations: HERMES_OWNER_DESTINATIONS,
    },
    {
      id: "hermes_guardrails",
      kind: "policy",
      draft_only: true,
      prohibited: ["publish", "send", "mark_indexable", "approve_legal", "change_credentials"],
    },
  ];
}

function failureStatus(code) {
  return FAILURE_STATUS[code] || 502;
}

function normalizedPlan(value) {
  const plan = onlyKeys(value, PLAN_KEYS, "hermes_invalid_plan");
  const summary = requiredText(plan.summary, "summary", 600);
  if (!Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 7) {
    throw new HermesOwnerCommandError("hermes_invalid_plan", { status: 502 });
  }
  const steps = plan.steps.map((input) => {
    const step = onlyKeys(input, STEP_KEYS, "hermes_invalid_plan");
    const destination = DESTINATION_BY_ID.get(String(step.destination || ""));
    const mode = String(step.mode || "");
    if (!destination || !PLAN_MODES.has(mode) || !Array.isArray(step.evidence) || step.evidence.length < 1) {
      throw new HermesOwnerCommandError("hermes_invalid_plan", { status: 502 });
    }
    const evidence = [...new Set(step.evidence.map(String))];
    if (evidence.some((ref) => !EVIDENCE_REFS.has(ref))) {
      throw new HermesOwnerCommandError("hermes_invalid_plan", { status: 502 });
    }
    return {
      title: requiredText(step.title, "step title", 160),
      why: requiredText(step.why, "step rationale", 400),
      destination: destination.id,
      admin_path: destination.path,
      mode,
      evidence,
      requires_human_approval: true,
      can_execute: false,
    };
  });
  const questions = plan.questions === undefined ? [] : plan.questions;
  if (!Array.isArray(questions) || questions.length > 3) {
    throw new HermesOwnerCommandError("hermes_invalid_plan", { status: 502 });
  }
  return { summary, steps, questions: questions.map((question) => requiredText(question, "question", 300)) };
}

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    return JSON.parse(String(value || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch (cause) {
    throw new HermesOwnerCommandError("hermes_invalid_plan", { status: 502, cause });
  }
}

function nonEmptyInvocation(value) {
  if (Array.isArray(value)) return value.some(nonEmptyInvocation);
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(String(value || "").trim());
}

function ownerCommandRequestBody(input, evidence, model) {
  return {
    model,
    temperature: 0.1,
    response_format: { type: "json_object" },
    tool_choice: "none",
    messages: [
      {
        role: "system",
        content:
          "You are Hermes inside the MS Realty owner console. Produce a plan or draft preparation only. Never invoke tools, publish, send, change credentials, mark content indexable, approve legal or tax claims, or claim that an action ran. Use only the supplied evidence. If business data is absent, ask a question instead of inventing it. Return exactly one JSON object with summary, steps, and questions. Each step must contain title, why, destination, mode (review or draft), and evidence (one or more supplied evidence ids). Use 1 to 7 steps.",
      },
      {
        role: "user",
        content: JSON.stringify({
          kind: "hermes_owner_plan",
          command: input.command,
          locale: input.locale,
          evidence,
          business_context: input.businessContext,
        }),
      },
    ],
  };
}

function providerResponseCode(status) {
  if (status === 401) return "hermes_provider_unauthorized";
  if (status === 402) return "hermes_provider_payment_required";
  if (status === 429) return "hermes_provider_rate_limited";
  if (status >= 500 && status <= 599) return "hermes_provider_service_unavailable";
  return "hermes_unavailable";
}

function providerTransportCode(cause) {
  const name = String(cause?.name || "");
  const code = String(cause?.code || "");
  const message = String(cause?.message || "");
  if (name === "TimeoutError" || (name === "AbortError" && /timeout/i.test(message)) || /timed?\s*out|timeout/i.test(message)) {
    return "hermes_provider_timeout";
  }
  if (PROVIDER_NETWORK_ERROR_CODES.has(code) || /network|fetch failed|socket hang up|connect/i.test(message)) {
    return "hermes_provider_network";
  }
  return "hermes_unavailable";
}

function connectedOpenRouterConfig(credentials) {
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) return null;
  if (Object.keys(credentials).length === 0) return null;
  const endpoint = String(credentials.endpoint || "").trim();
  const model = String(credentials.model || "").trim();
  const apiKey = String(credentials.api_key || "").trim();
  if (
    endpoint !== DEFAULT_OPENROUTER_CHAT_COMPLETIONS_URL ||
    !model ||
    model.length > 160 ||
    /[\u0000-\u001f\s]/.test(model) ||
    apiKey.length < 20 ||
    /[\u0000-\u0020\u007f]/.test(apiKey)
  ) {
    throw new HermesOwnerCommandError("hermes_unavailable", { status: 503 });
  }
  return { mode: "openrouter", endpoint, model, apiKey };
}

async function openAiCompatibleOwnerCommandProvider({ env, fetchImpl, payload, secret }) {
  const fallback = hermesProviderConfigFromEnv(env);
  const stored =
    fallback.mode === "openrouter"
      ? connectedOpenRouterConfig(await readProviderCredentials("ai", { credentialSecret: secret, payload }))
      : null;
  const config = stored || { ...fallback, apiKey: String(env.HERMES_API_KEY || "") };
  if (!["self_hosted", "openrouter"].includes(config.mode)) {
    throw new HermesOwnerCommandError("hermes_unavailable", { status: 503 });
  }
  if (!config.endpoint || !config.apiKey || typeof fetchImpl !== "function") {
    throw new HermesOwnerCommandError("hermes_unavailable", { status: 503 });
  }
  assertHermesChatCompletionsEndpoint(config.endpoint);
  return {
    model: config.model,
    mode: config.mode,
    async call(input, evidence) {
      let response;
      try {
        response = await fetchImpl(config.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify(ownerCommandRequestBody(input, evidence, config.model)),
          signal: AbortSignal.timeout(HERMES_OWNER_COMMAND_TIMEOUT_MS),
        });
      } catch (cause) {
        throw new HermesOwnerCommandError(providerTransportCode(cause), { status: 503, cause });
      }
      if (!response?.ok) throw new HermesOwnerCommandError(providerResponseCode(response.status), { status: 503 });
      const payload = await response.json().catch((cause) => {
        throw new HermesOwnerCommandError("hermes_invalid_plan", { status: 502, cause });
      });
      const message = payload?.choices?.[0]?.message;
      if (!message || nonEmptyInvocation(message.tool_calls) || nonEmptyInvocation(message.function_call)) {
        throw new HermesOwnerCommandError("hermes_invalid_plan", { status: 502 });
      }
      return parseJsonObject(message.content);
    },
  };
}

function assertPayloadRuntime(payload) {
  if (!payload || typeof payload.find !== "function" || typeof payload.create !== "function" || typeof payload.update !== "function") {
    throw new Error("Payload runtime cannot persist Hermes owner receipts");
  }
  return payload;
}

async function runtimePayload(payload) {
  try {
    if (payload) return assertPayloadRuntime(payload);
    const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
    return assertPayloadRuntime(await getPayload({ config: await payloadConfigModule.default }));
  } catch (cause) {
    throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503, cause });
  }
}

async function findReceipt(runtime, idempotencyKey) {
  const result = await runtime.find({
    collection: "hermes_owner_receipts",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { idempotency_key: { equals: idempotencyKey } },
  });
  if (!Array.isArray(result?.docs)) throw new Error("Payload Hermes receipt query did not return documents");
  return result.docs[0] || null;
}

function receiptEnvelope(idempotencyKey, command, evidence, plan, { secret, storedAt, locale, contextDigest } = {}) {
  return createPrivateContactEnvelope(
    {
      subjectType: "hermes_owner_command",
      subjectId: idempotencyKey,
      payload: { command, evidence, plan, locale, context_digest: contextDigest || null },
    },
    { secret, secretName: "MS_REALTY_PROVIDER_TOKEN_KEY", storedAt },
  );
}

function openedReceipt(document, secret) {
  const opened = openPrivateContactEnvelope(document.receipt_envelope, {
    secret,
    secretName: "MS_REALTY_PROVIDER_TOKEN_KEY",
  });
  if (opened.subject_type !== "hermes_owner_command" || opened.subject_id !== document.idempotency_key) {
    throw new Error("Hermes owner receipt envelope does not match its document");
  }
  const payload = opened.payload;
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    typeof payload.command !== "string" ||
    !Array.isArray(payload.evidence) ||
    (payload.locale !== undefined && typeof payload.locale !== "string") ||
    (payload.context_digest !== undefined && payload.context_digest !== null && typeof payload.context_digest !== "string") ||
    !("plan" in payload)
  ) {
    throw new Error("Hermes owner receipt envelope payload is invalid");
  }
  return payload;
}

function safeReceipt(document, secret, { idempotent = false } = {}) {
  if (!document || !STATUSES.has(String(document.status))) {
    throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503 });
  }
  const opened = openedReceipt(document, secret);
  if (document.status === "failed" && !String(document.failure_code || "").trim()) {
    throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503 });
  }
  if (document.status === "planned" && (!opened.plan || typeof opened.plan !== "object" || Array.isArray(opened.plan))) {
    throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503 });
  }
  return {
    idempotency_key: String(document.idempotency_key),
    status: String(document.status),
    model: String(document.model),
    started_at: document.started_at || null,
    completed_at: document.completed_at || null,
    failure_code: document.failure_code || null,
    plan: document.status === "planned" ? opened.plan : null,
    idempotent,
  };
}

async function updateReceipt(
  runtime,
  document,
  command,
  evidence,
  status,
  { secret, recordedAt, plan = null, failureCode = null, locale, contextDigest } = {},
) {
  if (!STATUSES.has(status) || status === "requested") throw new Error("Invalid Hermes owner receipt transition");
  const result = await runtime.update({
    collection: "hermes_owner_receipts",
    // A receipt may only leave requested once. The conditional update keeps a
    // stale worker from overwriting a plan or failure recorded by a race.
    where: {
      and: [{ id: { equals: document.id } }, { status: { equals: "requested" } }],
    },
    depth: 0,
    overrideAccess: true,
    data: {
      status,
      completed_at: recordedAt,
      failure_code: failureCode,
      receipt_envelope: receiptEnvelope(document.idempotency_key, command, evidence, plan, {
        secret,
        storedAt: recordedAt,
        locale,
        contextDigest,
      }),
    },
  });
  const updated = Array.isArray(result?.docs) ? result.docs[0] : result;
  if (!updated) throw new Error("Hermes owner receipt transition lost a race");
  return updated;
}

function safeReceiptOrUnavailable(document, secret, options = {}) {
  try {
    return safeReceipt(document, secret, options);
  } catch (cause) {
    if (cause instanceof HermesOwnerCommandError && cause.code === "hermes_receipt_unavailable") throw cause;
    throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503, cause });
  }
}

function terminalFailure(document, secret) {
  const code = Object.prototype.hasOwnProperty.call(FAILURE_MESSAGES, document.failure_code)
    ? document.failure_code
    : "hermes_receipt_unavailable";
  throw new HermesOwnerCommandError(code, {
    status: failureStatus(code),
    receipt: safeReceiptOrUnavailable(document, secret, { idempotent: true }),
  });
}

function requestedReceiptIsStale(document, now) {
  const startedAt = Date.parse(String(document.started_at || ""));
  const nowAt = Date.parse(String(now || ""));
  if (!Number.isFinite(startedAt) || !Number.isFinite(nowAt)) {
    throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503 });
  }
  return nowAt - startedAt > HERMES_OWNER_RECEIPT_REQUEST_TTL_MS;
}

async function existingReceipt(runtime, document, input, secret, operatorId, { now } = {}) {
  if (document.operator_id !== operatorId) {
    throw new HermesOwnerCommandError("idempotency_conflict", { status: 409 });
  }
  let opened;
  try {
    opened = openedReceipt(document, secret);
  } catch (cause) {
    throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503, cause });
  }
  if (
    document.command_digest !== ownerReceiptDigest(input.command, input.locale, input.contextDigest) ||
    opened.command !== input.command ||
    String(opened.locale || "") !== input.locale ||
    String(opened.context_digest || "") !== input.contextDigest
  ) {
    throw new HermesOwnerCommandError("idempotency_conflict", { status: 409 });
  }
  if (document.status === "planned") return safeReceipt(document, secret, { idempotent: true });
  if (document.status === "failed") terminalFailure(document, secret);
  if (document.status !== "requested") {
    throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503 });
  }
  const currentTime = isoTimestamp(typeof now === "function" ? now() : now);
  if (requestedReceiptIsStale(document, currentTime)) {
    let expired;
    try {
      expired = await updateReceipt(runtime, document, opened.command, opened.evidence, "failed", {
        secret,
        recordedAt: currentTime,
        failureCode: "hermes_command_expired",
      });
    } catch (cause) {
      let raced;
      try {
        raced = await findReceipt(runtime, input.idempotencyKey);
      } catch (readCause) {
        throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503, cause: readCause });
      }
      if (!raced || raced.status === "requested") {
        throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503, cause });
      }
      expired = raced;
    }
    if (expired.status === "failed") terminalFailure(expired, secret);
    if (expired.status === "planned") return safeReceiptOrUnavailable(expired, secret, { idempotent: true });
    throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503 });
  }
  throw new HermesOwnerCommandError("hermes_command_in_progress", {
    status: 409,
    receipt: safeReceiptOrUnavailable(document, secret, { idempotent: true }),
  });
}

export async function readHermesOwnerReceipts({ payload = null, operatorId, secret, limit = 5 } = {}) {
  const operator = requiredText(operatorId, "operatorId", 160);
  if (String(secret || "").length < 32) throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503 });
  try {
    const runtime = await runtimePayload(payload);
    const result = await runtime.find({
      collection: "hermes_owner_receipts",
      depth: 0,
      limit: Math.max(1, Math.min(10, Number(limit) || 5)),
      overrideAccess: true,
      pagination: false,
      sort: "-started_at",
      where: { operator_id: { equals: operator } },
    });
    if (!Array.isArray(result?.docs)) throw new Error("Payload Hermes receipt list did not return documents");
    return result.docs.map((document) => safeReceipt(document, secret));
  } catch (cause) {
    if (cause instanceof HermesOwnerCommandError) throw cause;
    throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503, cause });
  }
}

export async function runHermesOwnerCommand(
  input,
  {
    operator,
    payload = null,
    secret,
    env = process.env,
    fetchImpl = globalThis.fetch,
    provider = null,
    providerMetadata = null,
    businessContext = null,
    requireBusinessContext = false,
    now = () => new Date().toISOString(),
  } = {},
) {
  const normalized = normalizeInput(input);
  const fixtureOperatorId = operator?.source === "shared_token" && env.NODE_ENV !== "production" ? "local-admin-smoke" : null;
  const operatorId = requiredText(operator?.id || fixtureOperatorId, "operatorId", 160);
  if (!Array.isArray(operator?.roles) || !operator.roles.includes("admin")) {
    throw new HermesOwnerCommandError("bad_request");
  }
  if (String(secret || "").length < 32) throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503 });
  const startedAt = isoTimestamp(typeof now === "function" ? now() : now);
  const normalizedBusiness = normalizeBusinessContext(businessContext, { required: requireBusinessContext });
  const contextDigest = normalizedBusiness ? businessContextDigest(normalizedBusiness) : "sha256:none";
  const receiptIdentity = { ...normalized, contextDigest };
  const evidence = evidenceFor(operator);
  const runtime = await runtimePayload(payload);
  let existing;
  try {
    existing = await findReceipt(runtime, normalized.idempotencyKey);
  } catch (cause) {
    throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503, cause });
  }
  if (existing) {
    return existingReceipt(runtime, existing, receiptIdentity, secret, operatorId, { now });
  }

  let model = "injected";
  let callProvider;
  let providerMode = typeof providerMetadata?.mode === "string" ? providerMetadata.mode : null;
  if (provider) {
    if (typeof provider !== "function") throw new HermesOwnerCommandError("hermes_unavailable", { status: 503 });
    providerMode = providerMode || String(env.HERMES_PROVIDER_MODE || "").trim().toLowerCase() || "injected_provider";
    callProvider = provider;
  } else {
    const resolved = await openAiCompatibleOwnerCommandProvider({ env, fetchImpl, payload, secret });
    model = resolved.model;
    providerMode = resolved.mode;
    callProvider = (request) => resolved.call(request, evidence);
  }
  if (providerMode === "openrouter" && commandContainsSensitiveData(normalized.command)) {
    throw new HermesOwnerCommandError("hermes_command_contains_sensitive_data", { status: 400 });
  }

  const requested = {
    idempotency_key: normalized.idempotencyKey,
    operator_id: operatorId,
    status: "requested",
    command_digest: ownerReceiptDigest(normalized.command, normalized.locale, contextDigest),
    model,
    evidence_refs: evidence.map((row) => row.id),
    started_at: startedAt,
    completed_at: null,
    failure_code: null,
    receipt_envelope: receiptEnvelope(normalized.idempotencyKey, normalized.command, evidence, null, {
      secret,
      storedAt: startedAt,
      locale: normalized.locale,
      contextDigest,
    }),
  };
  let document;
  try {
    document = await runtime.create({
      collection: "hermes_owner_receipts",
      depth: 0,
      overrideAccess: true,
      data: requested,
    });
  } catch (cause) {
    try {
      const raced = await findReceipt(runtime, normalized.idempotencyKey);
      if (raced) return existingReceipt(runtime, raced, receiptIdentity, secret, operatorId, { now });
    } catch {
      // The fixed store error below is the only response exposed to the owner.
    }
    throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503, cause });
  }

  let plan;
  try {
    plan = normalizedPlan(
      await callProvider({
        ...normalized,
        contextDigest,
        evidence,
        businessContext: normalizedBusiness,
        destinations: HERMES_OWNER_DESTINATIONS,
      }),
    );
  } catch (cause) {
    const error = cause instanceof HermesOwnerCommandError ? cause : new HermesOwnerCommandError("hermes_unavailable", { status: 503, cause });
    const completedAt = isoTimestamp(typeof now === "function" ? now() : now);
    try {
      document = await updateReceipt(runtime, document, normalized.command, evidence, "failed", {
        secret,
        recordedAt: completedAt,
        failureCode: error.code,
        locale: normalized.locale,
        contextDigest,
      });
    } catch (storeCause) {
      let raced;
      try {
        raced = await findReceipt(runtime, normalized.idempotencyKey);
      } catch (readCause) {
        throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503, cause: readCause });
      }
      if (!raced || raced.status === "requested") {
        throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503, cause: storeCause });
      }
      document = raced;
    }
    if (document.status === "planned") return safeReceiptOrUnavailable(document, secret);
    if (document.status !== "failed") {
      throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503 });
    }
    terminalFailure(document, secret);
  }

  const completedAt = isoTimestamp(typeof now === "function" ? now() : now);
  try {
    document = await updateReceipt(runtime, document, normalized.command, evidence, "planned", {
      secret,
      recordedAt: completedAt,
      plan,
      locale: normalized.locale,
      contextDigest,
    });
    return safeReceiptOrUnavailable(document, secret);
  } catch (cause) {
    let raced;
    try {
      raced = await findReceipt(runtime, normalized.idempotencyKey);
    } catch (readCause) {
      throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503, cause: readCause });
    }
    if (raced?.status === "planned") return safeReceiptOrUnavailable(raced, secret);
    if (raced?.status === "failed") terminalFailure(raced, secret);
    throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503, cause });
  }
}
