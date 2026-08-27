import crypto from "node:crypto";
import { createPrivateContactEnvelope, openPrivateContactEnvelope } from "./private-contact-vault.mjs";
import { assertHermesChatCompletionsEndpoint, hermesProviderConfigFromEnv } from "./hermes-provider-provisioning.mjs";

export const HERMES_OWNER_COMMAND_MAX_LENGTH = 2_000;
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
const PLAN_MODES = new Set(["review", "draft"]);
const STATUSES = new Set(["requested", "planned", "failed"]);
const LOCALES = new Set(["bg", "ru", "en"]);

const FAILURE_MESSAGES = Object.freeze({
  bad_request: "Tell Hermes what you want to prepare.",
  hermes_receipt_unavailable: "Hermes cannot run until its durable receipt store is available.",
  hermes_unavailable: "Hermes could not prepare a plan. Check the agent connection and try again.",
  hermes_invalid_plan: "Hermes returned a plan that did not satisfy the safety contract.",
  idempotency_conflict: "This Hermes request identifier was already used for different work.",
  hermes_command_in_progress: "This Hermes request is already recorded and will not be repeated automatically.",
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
        content: JSON.stringify({ kind: "hermes_owner_plan", command: input.command, locale: input.locale, evidence }),
      },
    ],
  };
}

function openAiCompatibleOwnerCommandProvider({ env, fetchImpl }) {
  const config = hermesProviderConfigFromEnv(env);
  if (config.mode !== "self_hosted") throw new HermesOwnerCommandError("hermes_unavailable", { status: 503 });
  if (!config.endpoint || !config.has_api_key || typeof fetchImpl !== "function") {
    throw new HermesOwnerCommandError("hermes_unavailable", { status: 503 });
  }
  assertHermesChatCompletionsEndpoint(config.endpoint);
  return {
    model: config.model,
    async call(input, evidence) {
      let response;
      try {
        response = await fetchImpl(config.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${env.HERMES_API_KEY}` },
          body: JSON.stringify(ownerCommandRequestBody(input, evidence, config.model)),
          signal: AbortSignal.timeout(HERMES_OWNER_COMMAND_TIMEOUT_MS),
        });
      } catch (cause) {
        throw new HermesOwnerCommandError("hermes_unavailable", { status: 503, cause });
      }
      if (!response?.ok) throw new HermesOwnerCommandError("hermes_unavailable", { status: 503 });
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

function receiptEnvelope(idempotencyKey, command, evidence, plan, { secret, storedAt } = {}) {
  return createPrivateContactEnvelope(
    {
      subjectType: "hermes_owner_command",
      subjectId: idempotencyKey,
      payload: { command, evidence, plan },
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
  return opened.payload;
}

function safeReceipt(document, secret, { idempotent = false } = {}) {
  const opened = openedReceipt(document, secret);
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

async function updateReceipt(runtime, document, command, evidence, status, { secret, recordedAt, plan = null, failureCode = null } = {}) {
  if (!STATUSES.has(status) || status === "requested") throw new Error("Invalid Hermes owner receipt transition");
  return runtime.update({
    collection: "hermes_owner_receipts",
    id: document.id,
    depth: 0,
    overrideAccess: true,
    data: {
      status,
      completed_at: recordedAt,
      failure_code: failureCode,
      receipt_envelope: receiptEnvelope(document.idempotency_key, command, evidence, plan, {
        secret,
        storedAt: recordedAt,
      }),
    },
  });
}

async function existingReceipt(document, input, secret, operatorId) {
  if (document.operator_id !== operatorId) {
    throw new HermesOwnerCommandError("idempotency_conflict", { status: 409 });
  }
  const opened = openedReceipt(document, secret);
  if (
    document.command_digest !== commandDigest(input.command) ||
    opened.command !== input.command
  ) {
    throw new HermesOwnerCommandError("idempotency_conflict", { status: 409 });
  }
  if (document.status === "planned") return safeReceipt(document, secret, { idempotent: true });
  throw new HermesOwnerCommandError("hermes_command_in_progress", {
    status: 409,
    receipt: safeReceipt(document, secret, { idempotent: true }),
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
  const evidence = evidenceFor(operator);
  const runtime = await runtimePayload(payload);
  let existing;
  try {
    existing = await findReceipt(runtime, normalized.idempotencyKey);
  } catch (cause) {
    throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503, cause });
  }
  if (existing) return existingReceipt(existing, normalized, secret, operatorId);

  let model = "injected";
  let callProvider;
  if (provider) {
    if (typeof provider !== "function") throw new HermesOwnerCommandError("hermes_unavailable", { status: 503 });
    callProvider = provider;
  } else {
    const resolved = openAiCompatibleOwnerCommandProvider({ env, fetchImpl });
    model = resolved.model;
    callProvider = (request) => resolved.call(request, evidence);
  }

  const requested = {
    idempotency_key: normalized.idempotencyKey,
    operator_id: operatorId,
    status: "requested",
    command_digest: commandDigest(normalized.command),
    model,
    evidence_refs: evidence.map((row) => row.id),
    started_at: startedAt,
    completed_at: null,
    failure_code: null,
    receipt_envelope: receiptEnvelope(normalized.idempotencyKey, normalized.command, evidence, null, {
      secret,
      storedAt: startedAt,
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
      if (raced) return existingReceipt(raced, normalized, secret, operatorId);
    } catch {
      // The fixed store error below is the only response exposed to the owner.
    }
    throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503, cause });
  }

  let plan;
  try {
    plan = normalizedPlan(await callProvider({ ...normalized, evidence, destinations: HERMES_OWNER_DESTINATIONS }));
  } catch (cause) {
    const error = cause instanceof HermesOwnerCommandError ? cause : new HermesOwnerCommandError("hermes_unavailable", { status: 503, cause });
    const completedAt = isoTimestamp(typeof now === "function" ? now() : now);
    try {
      document = await updateReceipt(runtime, document, normalized.command, evidence, "failed", {
        secret,
        recordedAt: completedAt,
        failureCode: error.code,
      });
    } catch (storeCause) {
      throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503, cause: storeCause });
    }
    throw new HermesOwnerCommandError(error.code, {
      status: error.status,
      cause: error,
      receipt: safeReceipt(document, secret),
    });
  }

  const completedAt = isoTimestamp(typeof now === "function" ? now() : now);
  try {
    document = await updateReceipt(runtime, document, normalized.command, evidence, "planned", {
      secret,
      recordedAt: completedAt,
      plan,
    });
    return safeReceipt(document, secret);
  } catch (cause) {
    throw new HermesOwnerCommandError("hermes_receipt_unavailable", { status: 503, cause });
  }
}
