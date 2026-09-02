import { randomUUID } from "node:crypto";
import { readHermesAuditLedger, DEFAULT_HERMES_AUDIT_LEDGER_PATH } from "./translation-ledger.mjs";
import { readHermesOwnerReceipts } from "./hermes-owner-command.mjs";

// The operations plane is deliberately small. These are the only automation
// types the service may execute; a rule never carries a URL, script, prompt or
// arbitrary handler. The existing run-due functions are selected by the
// adapter, and this module only records the durable rule/run boundary.
export const AUTOMATION_RULE_TYPES = Object.freeze({
  SAVED_SEARCH_ALERTS: "saved_search_alerts",
  LISTING_PUBLICATION_SCHEDULES: "listing_publication_schedules",
});

const RULE_TYPE_ALIASES = new Map([
  ["saved_search_alerts", AUTOMATION_RULE_TYPES.SAVED_SEARCH_ALERTS],
  ["saved-search-alerts", AUTOMATION_RULE_TYPES.SAVED_SEARCH_ALERTS],
  ["listing_publication_schedules", AUTOMATION_RULE_TYPES.LISTING_PUBLICATION_SCHEDULES],
  ["listing-publication-schedules", AUTOMATION_RULE_TYPES.LISTING_PUBLICATION_SCHEDULES],
  ["listing_publications", AUTOMATION_RULE_TYPES.LISTING_PUBLICATION_SCHEDULES],
  ["listing-publications", AUTOMATION_RULE_TYPES.LISTING_PUBLICATION_SCHEDULES],
]);

export const TASK_SOURCE_TYPES = Object.freeze(["lead", "viewing", "case", "listing", "manual"]);
export const TASK_STATUSES = Object.freeze(["open", "in_progress", "completed", "cancelled"]);
export const TASK_PRIORITIES = Object.freeze(["low", "normal", "high", "urgent"]);
export const AUTOMATION_SCHEDULES = Object.freeze(["manual"]);
export const AUTOMATION_RUN_STATUSES = Object.freeze(["queued", "running", "succeeded", "failed"]);

const TASK_COLLECTION_SLUG = "tasks";
const AUTOMATION_RULE_COLLECTION_SLUG = "automation_rules";
const AUTOMATION_RUN_COLLECTION_SLUG = "automation_runs";
const AUTOMATION_RUN_FAILURE_COLLECTION_SLUG = "automation_run_failures";

const denyAccess = () => false;
const serverOwnedAccess = { create: denyAccess, read: denyAccess, update: denyAccess, delete: denyAccess };

const immutableField = { access: { update: denyAccess }, admin: { readOnly: true } };

export const TASK_COLLECTION = {
  slug: TASK_COLLECTION_SLUG,
  access: serverOwnedAccess,
  admin: { hidden: true, useAsTitle: "task_id" },
  fields: [
    { name: "task_id", type: "text", required: true, index: true, maxLength: 160, ...immutableField },
    { name: "workspace_id", type: "text", required: true, index: true, maxLength: 160, ...immutableField },
    { name: "title", type: "text", required: true, maxLength: 240 },
    { name: "description", type: "textarea", maxLength: 2000 },
    { name: "source_type", type: "text", required: true, index: true, maxLength: 32, ...immutableField },
    { name: "source_id", type: "text", maxLength: 200, index: true, ...immutableField },
    { name: "source_label", type: "text", maxLength: 240, ...immutableField },
    { name: "assignee_id", type: "text", maxLength: 160, index: true },
    { name: "due_at", type: "date", index: true },
    { name: "status", type: "text", required: true, index: true, maxLength: 32 },
    { name: "priority", type: "text", required: true, index: true, maxLength: 32 },
    { name: "created_by", type: "text", required: true, maxLength: 160, ...immutableField },
    { name: "completed_by", type: "text", maxLength: 160 },
    { name: "completed_at", type: "date" },
    { name: "completion_note", type: "text", maxLength: 500 },
    { name: "idempotency_key", type: "text", required: true, index: true, maxLength: 240, ...immutableField },
    { name: "revision", type: "number", required: true, defaultValue: 1, min: 1 },
  ],
};

export const AUTOMATION_RULE_COLLECTION = {
  slug: AUTOMATION_RULE_COLLECTION_SLUG,
  access: serverOwnedAccess,
  admin: { hidden: true, useAsTitle: "rule_id" },
  fields: [
    { name: "rule_id", type: "text", required: true, index: true, maxLength: 160, ...immutableField },
    { name: "workspace_id", type: "text", required: true, index: true, maxLength: 160, ...immutableField },
    { name: "name", type: "text", required: true, maxLength: 240 },
    { name: "rule_type", type: "text", required: true, index: true, maxLength: 64, ...immutableField },
    { name: "schedule", type: "text", required: true, maxLength: 32 },
    { name: "description", type: "textarea", maxLength: 1000 },
    { name: "enabled", type: "checkbox", required: true, defaultValue: false, index: true },
    { name: "created_by", type: "text", required: true, maxLength: 160, ...immutableField },
    { name: "updated_by", type: "text", required: true, maxLength: 160 },
    { name: "last_run_at", type: "date" },
    { name: "last_failure_at", type: "date" },
    { name: "idempotency_key", type: "text", required: true, index: true, maxLength: 240, ...immutableField },
    { name: "revision", type: "number", required: true, defaultValue: 1, min: 1 },
  ],
};

export const AUTOMATION_RUN_COLLECTION = {
  slug: AUTOMATION_RUN_COLLECTION_SLUG,
  access: serverOwnedAccess,
  admin: { hidden: true, useAsTitle: "run_id" },
  fields: [
    { name: "run_id", type: "text", required: true, index: true, maxLength: 160, ...immutableField },
    { name: "workspace_id", type: "text", required: true, index: true, maxLength: 160, ...immutableField },
    { name: "rule_id", type: "text", required: true, index: true, maxLength: 160, ...immutableField },
    { name: "rule_type", type: "text", required: true, index: true, maxLength: 64, ...immutableField },
    { name: "trigger", type: "text", required: true, index: true, maxLength: 32, ...immutableField },
    { name: "status", type: "text", required: true, index: true, maxLength: 32 },
    { name: "requested_by", type: "text", required: true, maxLength: 160, ...immutableField },
    { name: "idempotency_key", type: "text", required: true, index: true, maxLength: 240, ...immutableField },
    { name: "started_at", type: "date", required: true, index: true, ...immutableField },
    { name: "completed_at", type: "date", ...immutableField },
    { name: "failure_code", type: "text", maxLength: 120 },
    { name: "result_summary", type: "json", ...immutableField },
    { name: "revision", type: "number", required: true, defaultValue: 1, min: 1 },
  ],
};

export const AUTOMATION_RUN_FAILURE_COLLECTION = {
  slug: AUTOMATION_RUN_FAILURE_COLLECTION_SLUG,
  access: serverOwnedAccess,
  admin: { hidden: true, useAsTitle: "failure_id" },
  fields: [
    { name: "failure_id", type: "text", required: true, index: true, maxLength: 160, ...immutableField },
    { name: "workspace_id", type: "text", required: true, index: true, maxLength: 160, ...immutableField },
    { name: "rule_id", type: "text", required: true, index: true, maxLength: 160, ...immutableField },
    { name: "run_id", type: "text", required: true, index: true, maxLength: 160, ...immutableField },
    { name: "failure_code", type: "text", required: true, maxLength: 120, ...immutableField },
    { name: "message", type: "text", required: true, maxLength: 500, ...immutableField },
    { name: "recorded_at", type: "date", required: true, index: true, ...immutableField },
  ],
};

export const OPERATIONS_COLLECTIONS = Object.freeze([
  TASK_COLLECTION,
  AUTOMATION_RULE_COLLECTION,
  AUTOMATION_RUN_COLLECTION,
  AUTOMATION_RUN_FAILURE_COLLECTION,
]);

const PRIVATE_KEY = /(^|_)(body|contact|email|message|phone|prompt|source_text|sourcecontent|reviewed_reply|whatsapp|viber|buyer|seller|client|customer)(_|$)/i;
const URL_VALUE = /(?:https?:\/\/|www\.)/i;
const EMAIL_VALUE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_VALUE = /(?:\+|00)\s*\d(?:[\s().-]*\d){6,}|\b\d{10,}\b/;

export class OperationsStoreUnavailableError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = "OperationsStoreUnavailableError";
    this.code = "operations_store_unavailable";
    this.status = 503;
    if (cause) this.cause = cause;
  }
}

export class OperationsNotFoundError extends Error {
  constructor(message = "Operations record was not found") {
    super(message);
    this.name = "OperationsNotFoundError";
    this.code = "not_found";
    this.status = 404;
  }
}

export class OperationsConflictError extends Error {
  constructor(message = "Operations record conflicts with the requested change", { code = "conflict" } = {}) {
    super(message);
    this.name = "OperationsConflictError";
    this.code = code;
    this.status = 409;
  }
}

export class OperationsConfirmationError extends Error {
  constructor(message = "An exact owner confirmation is required") {
    super(message);
    this.name = "OperationsConfirmationError";
    this.code = "owner_confirmation_required";
    this.status = 403;
  }
}

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function inputError(message) {
  const error = new Error(message);
  error.name = "OperationsInputError";
  error.code = "bad_request";
  error.status = 400;
  return error;
}

function text(value, label, max = 240, { required = true } = {}) {
  const output = String(value ?? "").trim();
  if (required && !output) throw inputError(`${label} is required`);
  if (output.length > max) throw inputError(`${label} must be ${max} characters or fewer`);
  if (URL_VALUE.test(output)) throw inputError(`${label} must not contain a URL`);
  return output;
}

function failureMessage(value) {
  const output = String(value || "").trim();
  if (!output || URL_VALUE.test(output) || EMAIL_VALUE.test(output) || PHONE_VALUE.test(output)) return "Automation runner failed";
  return text(output, "failure_message", 500);
}

function optionalText(value, label, max = 240) {
  return value === undefined || value === null || value === "" ? null : text(value, label, max);
}

function boolean(value, label, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw inputError(`${label} must be a boolean`);
  return value;
}

function optionalRevision(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 1) throw inputError(`${label} must be a positive integer`);
  return revision;
}

function isoDate(value, label, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw inputError(`${label} is required`);
    return null;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw inputError(`${label} must be an ISO date`);
  return parsed.toISOString();
}

function id(value, label, max = 160) {
  return text(value, label, max);
}

function assertNoPrivateFields(value, label = "input") {
  if (!record(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (PRIVATE_KEY.test(key)) throw inputError(`${label} contains a private field: ${key}`);
    if (typeof nested === "string" && URL_VALUE.test(nested)) throw inputError(`${label}.${key} must not contain a URL`);
    if (record(nested) || Array.isArray(nested)) assertNoPrivateFields(nested, `${label}.${key}`);
  }
}

function assertKnownKeys(input, allowed, label) {
  if (!record(input)) throw inputError(`${label} must be an object`);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) throw inputError(`${label} contains unsupported fields: ${unknown.join(", ")}`);
}

function workspace(value) {
  return text(value, "workspace_id", 160);
}

function canonicalRuleType(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const canonical = RULE_TYPE_ALIASES.get(normalized);
  if (!canonical) throw inputError(`Unsupported automation rule type "${normalized}"`);
  return canonical;
}

function taskSource(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!TASK_SOURCE_TYPES.includes(normalized)) throw inputError("source_type must be lead, viewing, case, listing, or manual");
  return normalized;
}

function taskStatus(value, { allowCompleted = true } = {}) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const allowed = allowCompleted ? TASK_STATUSES : TASK_STATUSES.filter((entry) => entry !== "completed");
  if (!allowed.includes(normalized)) throw inputError(`status must be one of ${allowed.join(", ")}`);
  return normalized;
}

function taskPriority(value) {
  const normalized = String(value ?? "normal").trim().toLowerCase();
  if (!TASK_PRIORITIES.includes(normalized)) throw inputError(`priority must be one of ${TASK_PRIORITIES.join(", ")}`);
  return normalized;
}

function automationSchedule(value) {
  const normalized = String(value ?? "manual").trim().toLowerCase();
  if (!AUTOMATION_SCHEDULES.includes(normalized)) throw inputError(`schedule must be one of ${AUTOMATION_SCHEDULES.join(", ")}`);
  return normalized;
}

function runStatus(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!AUTOMATION_RUN_STATUSES.includes(normalized)) throw inputError("Invalid automation run status");
  return normalized;
}

function nowIso(value) {
  return isoDate(value || new Date().toISOString(), "recorded_at", { required: true });
}

function assertPayloadRuntime(payload) {
  if (!payload || typeof payload.find !== "function" || typeof payload.create !== "function" || typeof payload.update !== "function") {
    throw new Error("Payload runtime cannot read and write operations");
  }
  if (!payload.db || typeof payload.db.beginTransaction !== "function" || typeof payload.db.commitTransaction !== "function" || typeof payload.db.rollbackTransaction !== "function") {
    throw new Error("Payload operations require a transaction-capable database adapter");
  }
  return payload;
}

async function runtimePayload(payload) {
  try {
    if (payload) return assertPayloadRuntime(payload);
    const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
    return assertPayloadRuntime(await getPayload({ config: await payloadConfigModule.default }));
  } catch (error) {
    if (error instanceof OperationsStoreUnavailableError) throw error;
    throw new OperationsStoreUnavailableError("Durable operations runtime is unavailable", error);
  }
}

async function findOne(runtime, collection, where, req = undefined) {
  const result = await runtime.find({
    collection,
    depth: 0,
    overrideAccess: true,
    pagination: false,
    limit: 1,
    where,
    ...(req ? { req } : {}),
  });
  if (!Array.isArray(result?.docs)) throw new Error(`Payload ${collection} query did not return documents`);
  return result.docs[0] || null;
}

async function withTransaction(runtime, operation) {
  const transactionId = await runtime.db.beginTransaction({ accessMode: "read write", isolationLevel: "serializable" });
  if (!transactionId) throw new Error("Payload database adapter did not open an operations transaction");
  const req = { payload: runtime, transactionID: transactionId };
  let committed = false;
  try {
    const result = await operation(req);
    await runtime.db.commitTransaction(transactionId);
    committed = true;
    return result;
  } catch (error) {
    if (!committed) await runtime.db.rollbackTransaction(transactionId).catch(() => undefined);
    throw error;
  }
}

async function operationsRuntime(payload) {
  try {
    return await runtimePayload(payload);
  } catch (error) {
    if (error instanceof OperationsStoreUnavailableError) throw error;
    throw new OperationsStoreUnavailableError("Durable operations runtime is unavailable", error);
  }
}

function docId(document) {
  return document?.id;
}

function safeTask(document) {
  return {
    id: document?.id ?? null,
    task_id: String(document?.task_id || ""),
    workspace_id: String(document?.workspace_id || ""),
    title: String(document?.title || ""),
    description: document?.description ? String(document.description) : null,
    source_type: String(document?.source_type || ""),
    source_id: document?.source_id ? String(document.source_id) : null,
    source_label: document?.source_label ? String(document.source_label) : null,
    assignee_id: document?.assignee_id ? String(document.assignee_id) : null,
    due_at: document?.due_at ? new Date(document.due_at).toISOString() : null,
    status: String(document?.status || ""),
    priority: String(document?.priority || ""),
    created_by: String(document?.created_by || ""),
    completed_by: document?.completed_by ? String(document.completed_by) : null,
    completed_at: document?.completed_at ? new Date(document.completed_at).toISOString() : null,
    completion_note: document?.completion_note ? String(document.completion_note) : null,
    revision: Number(document?.revision || 1),
    created_at: document?.createdAt || document?.created_at || null,
    updated_at: document?.updatedAt || document?.updated_at || null,
  };
}

function safeRule(document) {
  return {
    id: document?.id ?? null,
    rule_id: String(document?.rule_id || ""),
    workspace_id: String(document?.workspace_id || ""),
    name: String(document?.name || ""),
    rule_type: String(document?.rule_type || ""),
    schedule: String(document?.schedule || "manual"),
    description: document?.description ? String(document.description) : null,
    enabled: document?.enabled === true,
    created_by: String(document?.created_by || ""),
    updated_by: String(document?.updated_by || ""),
    last_run_at: document?.last_run_at ? new Date(document.last_run_at).toISOString() : null,
    last_failure_at: document?.last_failure_at ? new Date(document.last_failure_at).toISOString() : null,
    revision: Number(document?.revision || 1),
    created_at: document?.createdAt || document?.created_at || null,
    updated_at: document?.updatedAt || document?.updated_at || null,
  };
}

function safeRun(document) {
  return {
    id: document?.id ?? null,
    run_id: String(document?.run_id || ""),
    workspace_id: String(document?.workspace_id || ""),
    rule_id: String(document?.rule_id || ""),
    rule_type: String(document?.rule_type || ""),
    trigger: String(document?.trigger || ""),
    status: String(document?.status || ""),
    requested_by: String(document?.requested_by || ""),
    started_at: document?.started_at ? new Date(document.started_at).toISOString() : null,
    completed_at: document?.completed_at ? new Date(document.completed_at).toISOString() : null,
    failure_code: document?.failure_code ? String(document.failure_code) : null,
    result_summary: safeSummary(document?.result_summary || {}),
    revision: Number(document?.revision || 1),
    created_at: document?.createdAt || document?.created_at || null,
    updated_at: document?.updatedAt || document?.updated_at || null,
  };
}

function safeFailure(document) {
  return {
    id: document?.id ?? null,
    failure_id: String(document?.failure_id || ""),
    workspace_id: String(document?.workspace_id || ""),
    rule_id: String(document?.rule_id || ""),
    run_id: String(document?.run_id || ""),
    failure_code: String(document?.failure_code || ""),
    message: String(document?.message || "").slice(0, 500),
    recorded_at: document?.recorded_at ? new Date(document.recorded_at).toISOString() : null,
  };
}

function safeSummary(value, depth = 0) {
  if (depth > 2) return null;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    if (URL_VALUE.test(value) || EMAIL_VALUE.test(value) || PHONE_VALUE.test(value)) return null;
    return value.length > 160 ? value.slice(0, 160) : value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => safeSummary(entry, depth + 1));
  if (!record(value)) return null;
  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    if (PRIVATE_KEY.test(key) || /url|endpoint|handler|script|code|prompt/i.test(key)) continue;
    if (Object.keys(output).length >= 30) break;
    output[key] = safeSummary(nested, depth + 1);
  }
  return output;
}

function comparableFieldValue(field, value) {
  if (value === undefined || value === null || value === "") return null;
  if (field === "due_at" || field === "last_run_at" || field === "last_failure_at") {
    return isoDate(value, field);
  }
  return value;
}

function sameFields(document, expected, fields) {
  return fields.every((field) => comparableFieldValue(field, document?.[field]) === comparableFieldValue(field, expected?.[field]));
}

function compareRecordedAtDesc(left, right) {
  return Date.parse(String(right?.recorded_at || "")) - Date.parse(String(left?.recorded_at || ""));
}

function immutableTaskData(input, scope, actor) {
  assertKnownKeys(input, new Set(["task_id", "title", "description", "source_type", "source_id", "source_label", "assignee_id", "due_at", "status", "priority", "idempotency_key"]), "Task");
  assertNoPrivateFields(input, "Task");
  const taskId = id(input.task_id || `task-${randomUUID()}`, "task_id");
  const sourceType = taskSource(input.source_type || "manual");
  const sourceId = optionalText(input.source_id, "source_id", 200);
  if (sourceType !== "manual" && !sourceId) throw inputError("source_id is required for a source-backed task");
  return {
    task_id: taskId,
    workspace_id: workspace(scope),
    title: text(input.title, "title", 240),
    description: optionalText(input.description, "description", 2000),
    source_type: sourceType,
    source_id: sourceId,
    source_label: optionalText(input.source_label, "source_label", 240),
    assignee_id: optionalText(input.assignee_id, "assignee_id", 160),
    due_at: isoDate(input.due_at, "due_at"),
    status: taskStatus(input.status || "open"),
    priority: taskPriority(input.priority),
    created_by: id(actor, "created_by"),
    completed_by: null,
    completed_at: null,
    completion_note: null,
    idempotency_key: text(input.idempotency_key || `task:${scope}:${taskId}`, "idempotency_key", 240),
    revision: 1,
  };
}

function taskChangedData(input, current) {
  assertKnownKeys(input, new Set(["title", "description", "assignee_id", "due_at", "priority", "status", "expected_revision"]), "Task update");
  assertNoPrivateFields(input, "Task update");
  const output = {};
  if (Object.hasOwn(input, "title")) output.title = text(input.title, "title", 240);
  if (Object.hasOwn(input, "description")) output.description = optionalText(input.description, "description", 2000);
  if (Object.hasOwn(input, "assignee_id")) output.assignee_id = optionalText(input.assignee_id, "assignee_id", 160);
  if (Object.hasOwn(input, "due_at")) output.due_at = isoDate(input.due_at, "due_at");
  if (Object.hasOwn(input, "priority")) output.priority = taskPriority(input.priority);
  if (Object.hasOwn(input, "status")) output.status = taskStatus(input.status, { allowCompleted: false });
  if (Object.hasOwn(input, "expected_revision") && Number(input.expected_revision) !== Number(current.revision || 1)) {
    throw new OperationsConflictError("Task revision no longer matches the requested update");
  }
  if (!Object.keys(output).length) throw inputError("Task update has no editable fields");
  output.revision = Number(current.revision || 1) + 1;
  return output;
}

function immutableRuleData(input, scope, actor) {
  assertKnownKeys(input, new Set(["rule_id", "name", "rule_type", "schedule", "description", "enabled", "idempotency_key", "confirmation"]), "Automation rule");
  assertNoPrivateFields(input, "Automation rule");
  const ruleId = id(input.rule_id || `rule-${randomUUID()}`, "rule_id");
  const enabled = boolean(input.enabled, "enabled");
  return {
    rule_id: ruleId,
    workspace_id: workspace(scope),
    name: text(input.name, "name", 240),
    rule_type: canonicalRuleType(input.rule_type),
    schedule: automationSchedule(input.schedule),
    description: optionalText(input.description, "description", 1000),
    enabled,
    created_by: id(actor, "created_by"),
    updated_by: id(actor, "updated_by"),
    last_run_at: null,
    last_failure_at: null,
    idempotency_key: text(input.idempotency_key || `rule:${scope}:${ruleId}`, "idempotency_key", 240),
    revision: 1,
  };
}

function ruleChangedData(input, current, actor) {
  assertKnownKeys(input, new Set(["name", "schedule", "description", "enabled", "expected_revision", "confirmation"]), "Automation rule update");
  assertNoPrivateFields(input, "Automation rule update");
  const output = { updated_by: id(actor, "updated_by") };
  if (Object.hasOwn(input, "name")) output.name = text(input.name, "name", 240);
  if (Object.hasOwn(input, "schedule")) output.schedule = automationSchedule(input.schedule);
  if (Object.hasOwn(input, "description")) output.description = optionalText(input.description, "description", 1000);
  if (Object.hasOwn(input, "enabled")) output.enabled = boolean(input.enabled, "enabled");
  const expectedRevision = optionalRevision(input.expected_revision, "expected_revision");
  if (expectedRevision !== null && expectedRevision !== Number(current.revision || 1)) {
    throw new OperationsConflictError("Automation rule revision no longer matches the requested update");
  }
  if (Object.keys(output).length === 1) throw inputError("Automation rule update has no editable fields");
  output.revision = Number(current.revision || 1) + 1;
  return output;
}

function runData({ rule, scope, actor, input, startedAt }) {
  assertKnownKeys(input, new Set(["idempotency_key", "run_id", "confirmation"]), "Automation run");
  assertNoPrivateFields(input, "Automation run");
  const runId = id(input.run_id || `run-${randomUUID()}`, "run_id");
  return {
    run_id: runId,
    workspace_id: scope,
    rule_id: rule.rule_id,
    rule_type: rule.rule_type,
    trigger: "manual",
    status: "running",
    requested_by: id(actor, "requested_by"),
    idempotency_key: text(input.idempotency_key, "idempotency_key", 240),
    started_at: nowIso(startedAt),
    completed_at: null,
    failure_code: null,
    result_summary: {},
    revision: 1,
  };
}

export function automationConfirmation(action, ruleId) {
  const intent = String(action || "").trim().toUpperCase();
  if (!["ENABLE", "DISABLE", "RUN"].includes(intent)) throw new Error("Unknown automation confirmation action");
  return `CONFIRM_AUTOMATION_${intent}:${id(ruleId, "rule_id")}`;
}

export function assertOwnerConfirmation({ principal, action, ruleId, confirmation } = {}) {
  const owner = principal?.id && Array.isArray(principal.roles) && principal.roles.includes("admin");
  if (!owner || String(confirmation || "") !== automationConfirmation(action, ruleId)) {
    throw new OperationsConfirmationError(`Owner confirmation must exactly equal ${automationConfirmation(action, ruleId)}`);
  }
  return true;
}

function auditEvent(audit, input) {
  if (typeof audit !== "function") return null;
  return audit(input);
}

function conflictFromDuplicate(error, { stableCode = null, stableMessage = "" } = {}) {
  const textValue = String(error?.message || "");
  if (!/unique|duplicate|23505/i.test(textValue)) return error;
  if (stableCode && /(task[_ ]?id|rule[_ ]?id|workspace_.*(?:task|rule))/i.test(textValue)) {
    return new OperationsConflictError(stableMessage, { code: stableCode });
  }
  return new OperationsConflictError("The operations idempotency key is already in use", { code: "idempotency_conflict" });
}

function durableFailure(message, error, conflictOptions = {}) {
  const conflict = conflictFromDuplicate(error, conflictOptions);
  if (conflict !== error) return conflict;
  if (error?.name === "OperationsInputError" || error?.code === "bad_request") return error;
  return new OperationsStoreUnavailableError(message, error);
}

function scopeWhere(scope, clause = {}) {
  return { and: [{ workspace_id: { equals: scope } }, clause] };
}

async function readCollection({ collection, workspaceId, payload, where = {}, sort = "-createdAt", limit = 100 }) {
  const scope = workspace(workspaceId);
  try {
    const runtime = await operationsRuntime(payload);
    const result = await runtime.find({
      collection,
      depth: 0,
      overrideAccess: true,
      pagination: false,
      limit: Math.min(Math.max(Number(limit) || 100, 1), 500),
      sort,
      where: scopeWhere(scope, where),
    });
    if (!Array.isArray(result?.docs)) throw new Error(`Payload ${collection} query did not return documents`);
    return result.docs;
  } catch (error) {
    if (error instanceof OperationsStoreUnavailableError) throw error;
    throw new OperationsStoreUnavailableError(`Durable ${collection} read failed`, error);
  }
}

async function readByStableId({ collection, field, value, workspaceId, payload }) {
  const scope = workspace(workspaceId);
  const stableId = id(value, field);
  try {
    const runtime = await operationsRuntime(payload);
    const document = await findOne(runtime, collection, scopeWhere(scope, { [field]: { equals: stableId } }));
    if (!document) throw new OperationsNotFoundError(`${field} was not found`);
    if (String(document.workspace_id || "") !== scope) throw new OperationsNotFoundError(`${field} was not found`);
    return document;
  } catch (error) {
    if (error instanceof OperationsStoreUnavailableError || error instanceof OperationsNotFoundError) throw error;
    throw new OperationsStoreUnavailableError(`Durable ${collection} read failed`, error);
  }
}

export async function readTasks({ workspaceId, payload = null, filters = {}, limit = 100 } = {}) {
  const docs = await readCollection({
    collection: TASK_COLLECTION_SLUG,
    workspaceId,
    payload,
    sort: "due_at",
    limit,
    where: {
      ...(filters.status ? { status: { equals: taskStatus(filters.status) } } : {}),
      ...(filters.assignee_id ? { assignee_id: { equals: id(filters.assignee_id, "assignee_id") } } : {}),
      ...(filters.source_type ? { source_type: { equals: taskSource(filters.source_type) } } : {}),
    },
  });
  return docs.map(safeTask);
}

export async function readTask({ taskId, workspaceId, payload = null } = {}) {
  return safeTask(await readByStableId({ collection: TASK_COLLECTION_SLUG, field: "task_id", value: taskId, workspaceId, payload }));
}

export async function createTask({ input, workspaceId, actor, payload = null, audit, recordedAt } = {}) {
  const scope = workspace(workspaceId);
  const data = immutableTaskData(input || {}, scope, actor);
  try {
    const runtime = await operationsRuntime(payload);
    const result = await withTransaction(runtime, async (req) => {
      const existing = await findOne(runtime, TASK_COLLECTION_SLUG, scopeWhere(scope, { idempotency_key: { equals: data.idempotency_key } }), req);
      if (existing) {
        const same = sameFields(existing, data, [
          "task_id",
          "workspace_id",
          "title",
          "description",
          "source_type",
          "source_id",
          "source_label",
          "assignee_id",
          "due_at",
          "status",
          "priority",
          "created_by",
          "idempotency_key",
          "revision",
        ]);
        if (!same) {
          throw new OperationsConflictError("Task idempotency key conflicts with an existing task", { code: "idempotency_conflict" });
        }
        return { document: existing, idempotent: true };
      }
      const stable = await findOne(runtime, TASK_COLLECTION_SLUG, scopeWhere(scope, { task_id: { equals: data.task_id } }), req);
      if (stable) {
        throw new OperationsConflictError("Task task_id conflicts with an existing task in this workspace", { code: "task_id_conflict" });
      }
      const document = await runtime.create({ collection: TASK_COLLECTION_SLUG, data, depth: 0, overrideAccess: true, req });
      return { document, idempotent: false };
    });
    if (!result.idempotent) {
      auditEvent(audit, {
        action: "task_created",
        actor,
        objectType: "task",
        objectId: result.document.task_id,
        status: "created",
        metadata: { workspace_id: scope, source_type: result.document.source_type, source_id: result.document.source_id, priority: result.document.priority },
      });
    }
    return { task: safeTask(result.document), idempotent: result.idempotent };
  } catch (error) {
    if (error instanceof OperationsStoreUnavailableError || error instanceof OperationsConflictError) throw error;
    throw durableFailure("Durable tasks create failed", error, {
      stableCode: "task_id_conflict",
      stableMessage: "Task task_id conflicts with an existing task in this workspace",
    });
  }
}

export async function updateTask({ taskId, input, workspaceId, actor, payload = null, audit, recordedAt } = {}) {
  const scope = workspace(workspaceId);
  const stableId = id(taskId, "task_id");
  try {
    const runtime = await operationsRuntime(payload);
    const result = await withTransaction(runtime, async (req) => {
      const current = await findOne(runtime, TASK_COLLECTION_SLUG, scopeWhere(scope, { task_id: { equals: stableId } }), req);
      if (!current) throw new OperationsNotFoundError("Task was not found");
      const data = taskChangedData(input || {}, current);
      const document = await runtime.update({ collection: TASK_COLLECTION_SLUG, id: docId(current), data, depth: 0, overrideAccess: true, req });
      return { document, previous: current };
    });
    auditEvent(audit, {
      action: "task_updated",
      actor,
      objectType: "task",
      objectId: stableId,
      status: "updated",
      metadata: { workspace_id: scope, revision: result.document.revision },
    });
    return { task: safeTask(result.document), idempotent: false };
  } catch (error) {
    if (error instanceof OperationsStoreUnavailableError || error instanceof OperationsNotFoundError || error instanceof OperationsConflictError) throw error;
    throw durableFailure("Durable task update failed", error);
  }
}

export async function completeTask({ taskId, input = {}, workspaceId, actor, payload = null, audit, recordedAt } = {}) {
  const scope = workspace(workspaceId);
  const stableId = id(taskId, "task_id");
  assertKnownKeys(input, new Set(["completion_note", "expected_revision"]), "Task completion");
  assertNoPrivateFields(input, "Task completion");
  const note = optionalText(input.completion_note, "completion_note", 500);
  try {
    const runtime = await operationsRuntime(payload);
    const completedAt = nowIso(recordedAt);
    const result = await withTransaction(runtime, async (req) => {
      const current = await findOne(runtime, TASK_COLLECTION_SLUG, scopeWhere(scope, { task_id: { equals: stableId } }), req);
      if (!current) throw new OperationsNotFoundError("Task was not found");
      const expectedRevision = optionalRevision(input.expected_revision, "expected_revision");
      if (current.status === "completed") return { document: current, idempotent: true };
      if (expectedRevision !== null && expectedRevision !== Number(current.revision || 1)) {
        throw new OperationsConflictError("Task revision no longer matches completion");
      }
      if (current.status === "cancelled") throw new OperationsConflictError("A cancelled task cannot be completed");
      const document = await runtime.update({
        collection: TASK_COLLECTION_SLUG,
        id: docId(current),
        data: { status: "completed", completed_by: id(actor, "completed_by"), completed_at: completedAt, completion_note: note, revision: Number(current.revision || 1) + 1 },
        depth: 0,
        overrideAccess: true,
        req,
      });
      return { document, idempotent: false };
    });
    if (!result.idempotent) {
      auditEvent(audit, {
        action: "task_completed",
        actor,
        objectType: "task",
        objectId: stableId,
        status: "completed",
        metadata: { workspace_id: scope, revision: result.document.revision },
      });
    }
    return { task: safeTask(result.document), idempotent: result.idempotent };
  } catch (error) {
    if (error instanceof OperationsStoreUnavailableError || error instanceof OperationsNotFoundError || error instanceof OperationsConflictError) throw error;
    throw durableFailure("Durable task completion failed", error);
  }
}

export async function readAutomationRules({ workspaceId, payload = null, limit = 100, enabled } = {}) {
  const docs = await readCollection({
    collection: AUTOMATION_RULE_COLLECTION_SLUG,
    workspaceId,
    payload,
    sort: "name",
    limit,
    where: enabled === undefined ? {} : { enabled: { equals: enabled === true } },
  });
  return docs.map(safeRule);
}

export async function readAutomationRule({ ruleId, workspaceId, payload = null } = {}) {
  return safeRule(await readByStableId({ collection: AUTOMATION_RULE_COLLECTION_SLUG, field: "rule_id", value: ruleId, workspaceId, payload }));
}

export async function createAutomationRule({ input, workspaceId, actor, principal, payload = null, audit, recordedAt } = {}) {
  const scope = workspace(workspaceId);
  const data = immutableRuleData(input || {}, scope, actor);
  if (data.enabled) assertOwnerConfirmation({ principal, action: "enable", ruleId: data.rule_id, confirmation: input?.confirmation });
  try {
    const runtime = await operationsRuntime(payload);
    const result = await withTransaction(runtime, async (req) => {
      const existing = await findOne(runtime, AUTOMATION_RULE_COLLECTION_SLUG, scopeWhere(scope, { idempotency_key: { equals: data.idempotency_key } }), req);
      if (existing) {
        const same = sameFields(existing, data, [
          "rule_id",
          "workspace_id",
          "name",
          "rule_type",
          "schedule",
          "description",
          "enabled",
          "created_by",
          "updated_by",
          "last_run_at",
          "last_failure_at",
          "idempotency_key",
          "revision",
        ]);
        if (!same) {
          throw new OperationsConflictError("Automation rule idempotency key conflicts with an existing rule", { code: "idempotency_conflict" });
        }
        return { document: existing, idempotent: true };
      }
      const stable = await findOne(runtime, AUTOMATION_RULE_COLLECTION_SLUG, scopeWhere(scope, { rule_id: { equals: data.rule_id } }), req);
      if (stable) {
        throw new OperationsConflictError("Automation rule rule_id conflicts with an existing rule in this workspace", { code: "rule_id_conflict" });
      }
      const document = await runtime.create({ collection: AUTOMATION_RULE_COLLECTION_SLUG, data, depth: 0, overrideAccess: true, req });
      return { document, idempotent: false };
    });
    if (!result.idempotent) {
      auditEvent(audit, {
        action: "automation_rule_created",
        actor,
        objectType: "automation_rule",
        objectId: result.document.rule_id,
        status: result.document.enabled ? "enabled" : "disabled",
        metadata: { workspace_id: scope, rule_type: result.document.rule_type, schedule: result.document.schedule, enabled: result.document.enabled },
      });
      if (result.document.enabled) {
        auditEvent(audit, { action: "automation_rule_enabled", actor, objectType: "automation_rule", objectId: result.document.rule_id, status: "enabled", metadata: { workspace_id: scope, confirmation: "owner" } });
      }
    }
    return { rule: safeRule(result.document), idempotent: result.idempotent };
  } catch (error) {
    if (error instanceof OperationsStoreUnavailableError || error instanceof OperationsConflictError || error instanceof OperationsConfirmationError) throw error;
    throw durableFailure("Durable automation rule create failed", error, {
      stableCode: "rule_id_conflict",
      stableMessage: "Automation rule rule_id conflicts with an existing rule in this workspace",
    });
  }
}

export async function updateAutomationRule({ ruleId, input, workspaceId, actor, principal, payload = null, audit, recordedAt } = {}) {
  const scope = workspace(workspaceId);
  const stableId = id(ruleId, "rule_id");
  try {
    const runtime = await operationsRuntime(payload);
    const result = await withTransaction(runtime, async (req) => {
      const current = await findOne(runtime, AUTOMATION_RULE_COLLECTION_SLUG, scopeWhere(scope, { rule_id: { equals: stableId } }), req);
      if (!current) throw new OperationsNotFoundError("Automation rule was not found");
      const changed = ruleChangedData(input || {}, current, actor);
      if (Object.hasOwn(input || {}, "enabled") && changed.enabled !== current.enabled) {
        assertOwnerConfirmation({ principal, action: changed.enabled ? "enable" : "disable", ruleId: stableId, confirmation: input.confirmation });
      }
      const document = await runtime.update({ collection: AUTOMATION_RULE_COLLECTION_SLUG, id: docId(current), data: changed, depth: 0, overrideAccess: true, req });
      return { document, previous: current };
    });
    auditEvent(audit, {
      action: "automation_rule_updated",
      actor,
      objectType: "automation_rule",
      objectId: stableId,
      status: "updated",
      metadata: { workspace_id: scope, revision: result.document.revision },
    });
    if (result.document.enabled !== result.previous.enabled) {
      auditEvent(audit, {
        action: result.document.enabled ? "automation_rule_enabled" : "automation_rule_disabled",
        actor,
        objectType: "automation_rule",
        objectId: stableId,
        status: result.document.enabled ? "enabled" : "disabled",
        metadata: { workspace_id: scope, confirmation: "owner" },
      });
    }
    return { rule: safeRule(result.document), idempotent: false };
  } catch (error) {
    if (error instanceof OperationsStoreUnavailableError || error instanceof OperationsNotFoundError || error instanceof OperationsConflictError || error instanceof OperationsConfirmationError) throw error;
    throw durableFailure("Durable automation rule update failed", error);
  }
}

async function readRunByKey(runtime, scope, key, req = undefined) {
  return findOne(runtime, AUTOMATION_RUN_COLLECTION_SLUG, scopeWhere(scope, { idempotency_key: { equals: key } }), req);
}

async function updateRuleAfterRun({ runtime, scope, ruleId, status, completedAt, req }) {
  const rule = await findOne(runtime, AUTOMATION_RULE_COLLECTION_SLUG, scopeWhere(scope, { rule_id: { equals: ruleId } }), req);
  if (!rule) throw new OperationsNotFoundError("Automation rule was not found after execution");
  const data = {
    last_run_at: completedAt,
    last_failure_at: status === "failed" ? completedAt : rule.last_failure_at || null,
    revision: Number(rule.revision || 1) + 1,
  };
  return runtime.update({ collection: AUTOMATION_RULE_COLLECTION_SLUG, id: docId(rule), data, depth: 0, overrideAccess: true, req });
}

export async function runAutomationRule({ ruleId, input = {}, workspaceId, actor, principal, payload = null, runner, audit, recordedAt } = {}) {
  const scope = workspace(workspaceId);
  const stableId = id(ruleId, "rule_id");
  if (typeof runner !== "function") throw new Error("An approved automation runner is required");
  const runInput = input || {};
  try {
    const runtime = await operationsRuntime(payload);
    const startedAt = nowIso(recordedAt);
    const started = await withTransaction(runtime, async (req) => {
      const ruleDocument = await findOne(runtime, AUTOMATION_RULE_COLLECTION_SLUG, scopeWhere(scope, { rule_id: { equals: stableId } }), req);
      if (!ruleDocument) throw new OperationsNotFoundError("Automation rule was not found");
      if (ruleDocument.enabled !== true) throw new OperationsConflictError("Disabled automation rules cannot be run");
      assertOwnerConfirmation({ principal, action: "run", ruleId: stableId, confirmation: runInput.confirmation });
      const data = runData({ rule: ruleDocument, scope, actor, input: runInput, startedAt });
      const existing = await readRunByKey(runtime, scope, data.idempotency_key, req);
      if (existing) {
        const same = existing.rule_id === data.rule_id && (!runInput.run_id || existing.run_id === data.run_id);
        if (!same) {
          throw new OperationsConflictError("Automation run idempotency key conflicts with an existing run", { code: "idempotency_conflict" });
        }
        if (!new Set(["succeeded", "failed"]).has(String(existing.status || "").toLowerCase())) {
          throw new OperationsConflictError(
            "Automation run is already in progress or indeterminate; retry status before running it again",
            { code: "automation_run_in_progress" },
          );
        }
        return { document: existing, rule: ruleDocument, idempotent: true };
      }
      const document = await runtime.create({ collection: AUTOMATION_RUN_COLLECTION_SLUG, data, depth: 0, overrideAccess: true, req });
      return { document, rule: ruleDocument, idempotent: false };
    });
    if (started.idempotent) return { run: safeRun(started.document), failure: null, idempotent: true };
    auditEvent(audit, {
      action: "automation_run_requested",
      actor,
      objectType: "automation_run",
      objectId: started.document.run_id,
      status: "running",
      metadata: { workspace_id: scope, rule_id: stableId, rule_type: started.document.rule_type, trigger: "manual" },
    });

    let runnerResult;
    let failure = null;
    try {
      runnerResult = await runner(safeRule(started.rule));
    } catch (error) {
      failure = {
        failure_id: `failure-${randomUUID()}`,
        workspace_id: scope,
        rule_id: stableId,
        run_id: started.document.run_id,
        failure_code: text(error?.code || error?.name || "automation_runner_failed", "failure_code", 120),
        message: failureMessage(error?.message),
        recorded_at: nowIso(recordedAt),
      };
    }
    const completedAt = nowIso(recordedAt || new Date().toISOString());
    const finished = await withTransaction(runtime, async (req) => {
      const current = await findOne(runtime, AUTOMATION_RUN_COLLECTION_SLUG, scopeWhere(scope, { run_id: { equals: started.document.run_id } }), req);
      if (!current) throw new OperationsNotFoundError("Automation run was not found after execution");
      const status = failure ? "failed" : "succeeded";
      const document = await runtime.update({
        collection: AUTOMATION_RUN_COLLECTION_SLUG,
        id: docId(current),
        data: { status, completed_at: completedAt, failure_code: failure?.failure_code || null, result_summary: safeSummary(runnerResult || {}), revision: Number(current.revision || 1) + 1 },
        depth: 0,
        overrideAccess: true,
        req,
      });
      if (failure) await runtime.create({ collection: AUTOMATION_RUN_FAILURE_COLLECTION_SLUG, data: failure, depth: 0, overrideAccess: true, req });
      // The owner may edit a rule while the approved runner is in flight. Read
      // the current workspace-scoped row before incrementing its revision so
      // that the completion marker cannot regress a concurrent edit.
      await updateRuleAfterRun({ runtime, scope, ruleId: started.document.rule_id, status, completedAt, req });
      return document;
    });
    auditEvent(audit, {
      action: failure ? "automation_run_failed" : "automation_run_completed",
      actor,
      objectType: "automation_run",
      objectId: started.document.run_id,
      status: failure ? "failed" : "succeeded",
      metadata: { workspace_id: scope, rule_id: stableId, rule_type: started.document.rule_type, failure_code: failure?.failure_code || null },
    });
    return { run: safeRun(finished), failure: failure ? safeFailure(failure) : null, idempotent: false };
  } catch (error) {
    if (error instanceof OperationsStoreUnavailableError || error instanceof OperationsNotFoundError || error instanceof OperationsConflictError || error instanceof OperationsConfirmationError) throw error;
    throw durableFailure("Durable automation run failed", error);
  }
}

export async function readAutomationRuns({ workspaceId, ruleId, payload = null, limit = 100 } = {}) {
  const docs = await readCollection({
    collection: AUTOMATION_RUN_COLLECTION_SLUG,
    workspaceId,
    payload,
    sort: "-started_at",
    limit,
    where: ruleId ? { rule_id: { equals: id(ruleId, "rule_id") } } : {},
  });
  return docs.map(safeRun);
}

export async function readAutomationRun({ runId, workspaceId, payload = null } = {}) {
  const scope = workspace(workspaceId);
  const document = await readByStableId({ collection: AUTOMATION_RUN_COLLECTION_SLUG, field: "run_id", value: runId, workspaceId: scope, payload });
  const failures = await readCollection({ collection: AUTOMATION_RUN_FAILURE_COLLECTION_SLUG, workspaceId: scope, payload, sort: "-recorded_at", limit: 10, where: { run_id: { equals: id(runId, "run_id") } } });
  return { run: safeRun(document), failures: failures.map(safeFailure) };
}

function safeHermesAuditRow(row, workspaceId = null) {
  if (!record(row)) throw new Error("Hermes audit row is not an object");
  const rowWorkspaceId = row.workspace_id ? id(row.workspace_id, "workspace_id") : null;
  if (workspaceId && rowWorkspaceId !== workspaceId) return null;
  const output = {
    run_id: id(row.run_id || row.task_id, "run_id"),
    task_id: id(row.task_id, "task_id"),
    object_type: id(row.object_type, "object_type"),
    object_id: id(row.object_id, "object_id"),
    source_locale: id(row.source_locale, "source_locale", 20),
    target_locale: id(row.target_locale, "target_locale", 20),
    status: id(row.status, "status", 80),
    provider_mode: id(row.provider_mode, "provider_mode", 80),
    source_hash: id(row.source_hash, "source_hash", 160),
    draft_hash: row.draft_hash ? id(row.draft_hash, "draft_hash", 160) : null,
    has_output: row.has_output === true,
    public_indexable: row.public_indexable === true,
    human_approved: row.human_approved === true,
    can_publish: false,
    can_mark_indexable: false,
    recorded_at: nowIso(row.recorded_at),
    source: "hermes-audit",
  };
  if (rowWorkspaceId) output.workspace_id = rowWorkspaceId;
  return output;
}

export async function readHermesRunHistory({ auditPath = DEFAULT_HERMES_AUDIT_LEDGER_PATH, payload = null, operatorId = "", workspaceId = "", receiptSecret = "", limit = 100 } = {}) {
  const cappedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const scope = workspaceId ? id(workspaceId, "workspace_id") : null;
  let rows;
  try {
    rows = readHermesAuditLedger(auditPath).map((row) => safeHermesAuditRow(row, scope)).filter(Boolean);
  } catch (error) {
    throw new OperationsStoreUnavailableError("Hermes audit history is unavailable", error);
  }
  // Owner command receipts are already redacted by hermes-owner-command.mjs.
  // They are optional here: translation workers may be file-backed while the
  // owner command store is Payload-backed, and an absent secret must not make a
  // safe translation history unreadable.
  let ownerReceipts = [];
  if (payload && operatorId && String(receiptSecret || "").length >= 32) {
    ownerReceipts = (await readHermesOwnerReceipts({ payload, operatorId, workspaceId: scope, secret: receiptSecret, limit: cappedLimit })).map((receipt) => ({
        run_id: id(receipt.idempotency_key, "run_id"),
        task_id: id(receipt.idempotency_key, "task_id"),
        object_type: "hermes_owner_command",
        object_id: id(receipt.idempotency_key, "object_id"),
        source_locale: null,
        target_locale: null,
        status: id(receipt.status, "status", 80),
        provider_mode: "owner_command",
        source_hash: null,
        draft_hash: null,
        has_output: Boolean(receipt.step_count),
        human_approved: false,
        recorded_at: nowIso(receipt.completed_at || receipt.started_at),
        model: id(receipt.model, "model", 160),
        started_at: receipt.started_at || null,
        completed_at: receipt.completed_at || null,
        duration_ms: Number.isFinite(receipt.duration_ms) ? receipt.duration_ms : null,
        step_count: Number(receipt.step_count || 0),
        failure_code: receipt.failure_code ? id(receipt.failure_code, "failure_code", 120) : null,
        idempotent: receipt.idempotent === true,
        source: "hermes-owner-receipt",
        can_publish: false,
        can_mark_indexable: false,
        ...(receipt.workspace_id ? { workspace_id: id(receipt.workspace_id, "workspace_id") } : {}),
      }));
  }
  return [...ownerReceipts, ...rows].sort(compareRecordedAtDesc).slice(0, cappedLimit);
}

export async function readHermesRun({ runId, auditPath = DEFAULT_HERMES_AUDIT_LEDGER_PATH, payload = null, operatorId = "", workspaceId = "", receiptSecret = "" } = {}) {
  const stableId = id(runId, "run_id");
  const rows = await readHermesRunHistory({ auditPath, payload, operatorId, workspaceId, receiptSecret, limit: 500 });
  const found = rows.find((row) => row.run_id === stableId || row.task_id === stableId);
  if (!found) throw new OperationsNotFoundError("Hermes run was not found");
  return found;
}

export function operationsDurableStoreConfigFromEnv(env = process.env) {
  return {
    operationsDurableStoreEnabled: String(env.MS_REALTY_OPERATIONS_DURABLE_STORE_ENABLED || "").trim() === "true",
    payloadSecret: String(env.PAYLOAD_SECRET || "").trim(),
    databaseUrl: String(env.DATABASE_URL || "").trim(),
    workspaceId: String(env.MS_REALTY_WORKSPACE_ID || "").trim(),
    hermesAuditPath: String(env.MS_REALTY_HERMES_AUDIT_PATH || DEFAULT_HERMES_AUDIT_LEDGER_PATH).trim(),
  };
}

export function isOperationsDurableStoreEnabled(config = operationsDurableStoreConfigFromEnv()) {
  return Boolean(config?.operationsDurableStoreEnabled && config.payloadSecret && config.databaseUrl && config.workspaceId);
}
