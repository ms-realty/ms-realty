import { fromRoot } from "./paths.mjs";
import {
  DEFAULT_REALTY_CASE_LEDGER_PATH,
  deriveRealtyCases,
  readRealtyCaseEvents,
} from "./realty-cases.mjs";
import { createLedgerStore } from "./sqlite-ledger.mjs";

export const DEFAULT_REALTY_CASE_CONDITION_LEDGER_PATH = fromRoot(
  "production",
  "data",
  "realty-case-condition-events.jsonl",
);

const store = createLedgerStore({
  name: "realty_case_condition_events",
  columns: ["id", "case_id", "condition_id", "action", "actor", "executor_kind", "recorded_at"],
  indexes: ["case_id", "condition_id", "action", "recorded_at"],
});

const ACTIONS = new Set([
  "condition_opened",
  "condition_satisfied",
  "condition_blocked",
  "condition_expired",
  "condition_waived",
  "condition_reopened",
]);
const EXECUTOR_KINDS = new Set(["human", "agent"]);
const ACTIVE_STATUSES = new Set(["open", "blocked", "expired"]);
const PRIVATE_KEYS = new Set([
  "address",
  "body",
  "contact",
  "content",
  "document",
  "email",
  "full_name",
  "message",
  "name",
  "passport",
  "payload",
  "phone",
  "prompt",
  "tax_number",
]);

const OPEN_INPUT_KEYS = new Set([
  "id",
  "eventId",
  "event_id",
  "caseId",
  "case_id",
  "conditionId",
  "condition_id",
  "conditionType",
  "condition_type",
  "type",
  "dueAt",
  "due_at",
  "requiredEvidenceProducerRefs",
  "required_evidence_producer_refs",
  "actor",
  "executorKind",
  "executor_kind",
]);
const ACTION_INPUT_KEYS = Object.freeze({
  condition_satisfied: new Set([
    "id",
    "eventId",
    "event_id",
    "caseId",
    "case_id",
    "conditionId",
    "condition_id",
    "action",
    "evidenceRefs",
    "evidence_refs",
    "actor",
    "executorKind",
    "executor_kind",
  ]),
  condition_blocked: new Set([
    "id",
    "eventId",
    "event_id",
    "caseId",
    "case_id",
    "conditionId",
    "condition_id",
    "action",
    "reasonCode",
    "reason_code",
    "actor",
    "executorKind",
    "executor_kind",
  ]),
  condition_expired: new Set([
    "id",
    "eventId",
    "event_id",
    "caseId",
    "case_id",
    "conditionId",
    "condition_id",
    "action",
    "actor",
    "executorKind",
    "executor_kind",
  ]),
  condition_waived: new Set([
    "id",
    "eventId",
    "event_id",
    "caseId",
    "case_id",
    "conditionId",
    "condition_id",
    "action",
    "authorityRef",
    "authority_ref",
    "reasonCode",
    "reason_code",
    "actor",
    "executorKind",
    "executor_kind",
  ]),
  condition_reopened: new Set([
    "id",
    "eventId",
    "event_id",
    "caseId",
    "case_id",
    "conditionId",
    "condition_id",
    "action",
    "authorityRef",
    "authority_ref",
    "reasonCode",
    "reason_code",
    "dueAt",
    "due_at",
    "actor",
    "executorKind",
    "executor_kind",
  ]),
});
const STORED_COMMON_KEYS = new Set([
  "id",
  "case_id",
  "condition_id",
  "action",
  "actor",
  "executor_kind",
  "assurance_ref",
  "recorded_at",
]);
const STORED_ACTION_KEYS = Object.freeze({
  condition_opened: ["condition_type", "due_at", "required_evidence_producer_refs"],
  condition_satisfied: ["evidence_refs"],
  condition_blocked: ["reason_code"],
  condition_expired: [],
  condition_waived: ["authority_ref", "reason_code"],
  condition_reopened: ["authority_ref", "reason_code", "due_at"],
});

function camelToSnake(value) {
  return String(value).replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function containsPrivateData(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsPrivateData);
  return Object.entries(value).some(([key, nested]) => PRIVATE_KEYS.has(camelToSnake(key)) || containsPrivateData(nested));
}

function assertKnownKeys(input, allowed, label) {
  if (!input || typeof input !== "object" || Array.isArray(input) || containsPrivateData(input)) {
    throw new Error(`${label} stores references, not raw personal or document data`);
  }
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`${label} field is not allowed: ${key}`);
  }
}

function reference(value, label, max = 240, required = true) {
  const text = String(value ?? "").trim();
  if (required && !text) throw new Error(`${label} is required`);
  if (!text) return null;
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(text)) {
    throw new Error(`${label} must be a reference token`);
  }
  return text;
}

function code(value, label, max = 120) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  if (!/^[a-z][a-z0-9_:-]*$/.test(text)) throw new Error(`${label} must be a stable code`);
  return text;
}

function timestamp(value, label) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || Number.isNaN(Date.parse(text))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return new Date(text).toISOString();
}

function referenceList(value, label) {
  if (!Array.isArray(value) || !value.length) throw new Error(`${label} must contain at least one reference`);
  if (value.length > 20) throw new Error(`${label} supports 20 references or fewer`);
  const rows = value.map((item) => reference(item, label));
  if (new Set(rows).size !== rows.length) throw new Error(`${label} cannot contain duplicate references`);
  return rows.sort();
}

function evidenceRefs(value) {
  if (!Array.isArray(value) || !value.length) throw new Error("Condition satisfaction requires evidenceRefs");
  if (value.length > 20) throw new Error("Condition satisfaction supports 20 evidence references or fewer");
  const rows = value.map((row) => {
    assertKnownKeys(row, new Set(["ref", "producerRef", "producer_ref"]), "Condition evidence reference");
    return {
      ref: reference(row.ref, "Condition evidence ref"),
      producer_ref: reference(row.producerRef || row.producer_ref, "Condition evidence producer ref"),
    };
  });
  const unique = new Set(rows.map((row) => `${row.producer_ref}\u0000${row.ref}`));
  if (unique.size !== rows.length) throw new Error("Condition evidence references cannot be duplicated");
  return rows.sort((left, right) =>
    left.producer_ref.localeCompare(right.producer_ref) || left.ref.localeCompare(right.ref),
  );
}

function executor(input) {
  const executorKind = code(input.executorKind || input.executor_kind, "Executor kind", 20);
  if (!EXECUTOR_KINDS.has(executorKind)) throw new Error("Executor kind must be human or agent");
  return { actor: reference(input.actor, "Condition actor", 80), executor_kind: executorKind };
}

function conditionKey(caseId, conditionId) {
  return `${caseId}\u0000${conditionId}`;
}

function conditionForCase(caseId, conditionId, conditions) {
  return conditions.find((row) => row.case_id === caseId && row.id === conditionId) || null;
}

function eventId(events, caseId, conditionId, action) {
  const ids = new Set(events.map((event) => event.id));
  let ordinal = events.filter((event) => event.case_id === caseId && event.condition_id === conditionId).length + 1;
  let id = `realty-case-condition-${caseId}-${conditionId}-${action}-${ordinal}`;
  while (ids.has(id)) {
    ordinal += 1;
    id = `realty-case-condition-${caseId}-${conditionId}-${action}-${ordinal}`;
  }
  return id;
}

function latestRecordedAt(events, caseId) {
  return events
    .filter((event) => event.case_id === caseId)
    .reduce((latest, event) => Math.max(latest, Date.parse(event.recorded_at)), Number.NEGATIVE_INFINITY);
}

function assertChronology(events, caseId, recordedAt) {
  const latest = latestRecordedAt(events, caseId);
  if (Number.isFinite(latest) && Date.parse(recordedAt) < latest) {
    throw new Error("Condition actions must be recorded in chronological order");
  }
}

function caseRecord(caseId, caseLedgerPath) {
  const record = deriveRealtyCases(readRealtyCaseEvents(caseLedgerPath)).find((row) => row.id === caseId);
  if (!record) throw new Error("Condition requires a known realty case");
  if (record.status !== "active") throw new Error("Condition changes require an active realty case");
  return record;
}

function assertAuthorized(caseRow, action, actionExecutor, recordedAt) {
  if (caseRow.execution_mode === "manual" && actionExecutor.executor_kind !== "human") {
    throw new Error("Manual case conditions require a human executor");
  }
  if (actionExecutor.executor_kind === "agent" && (!caseRow.assurance_ref || caseRow.execution_mode !== "autonomous")) {
    throw new Error("Agent condition execution requires an autonomous case with an assurance reference");
  }
  const capabilities = new Set(caseRow.mandate?.capabilities || []);
  if (
    !capabilities.has("case:*") &&
    !capabilities.has("condition:*") &&
    !capabilities.has(`condition:${action}`) &&
    !capabilities.has(`case:${action}`)
  ) {
    throw new Error("Case mandate does not authorize this condition action");
  }
  if (caseRow.mandate?.expires_at && Date.parse(caseRow.mandate.expires_at) <= Date.parse(recordedAt)) {
    throw new Error("Case mandate is expired");
  }
}

function authority(input, actionExecutor) {
  if (actionExecutor.executor_kind !== "human") {
    throw new Error("Condition waive and reopen require a human executor");
  }
  return {
    authority_ref: reference(input.authorityRef || input.authority_ref, "Condition authority ref"),
    reason_code: code(input.reasonCode || input.reason_code, "Condition reason code"),
  };
}

function openInput(input, recordedAt) {
  assertKnownKeys(input, OPEN_INPUT_KEYS, "Realty case condition");
  const recorded = timestamp(recordedAt, "recordedAt");
  const dueAt = timestamp(input.dueAt || input.due_at, "Condition dueAt");
  if (Date.parse(dueAt) <= Date.parse(recorded)) throw new Error("Condition dueAt must follow recordedAt");
  return {
    requested_id: input.eventId || input.event_id ? reference(input.eventId || input.event_id, "Condition event id", 600) : null,
    case_id: reference(input.caseId || input.case_id, "Case id", 160),
    condition_id: reference(input.conditionId || input.condition_id || input.id, "Condition id", 160),
    condition_type: code(input.conditionType || input.condition_type || input.type, "Condition type"),
    due_at: dueAt,
    required_evidence_producer_refs: referenceList(
      input.requiredEvidenceProducerRefs || input.required_evidence_producer_refs,
      "Condition required evidence producer refs",
    ),
    ...executor(input),
    recorded_at: recorded,
  };
}

function actionInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Realty case condition action is required");
  }
  const action = code(input.action, "Condition action", 40);
  if (!ACTIONS.has(action) || action === "condition_opened") throw new Error("Unknown realty case condition action");
  assertKnownKeys(input, ACTION_INPUT_KEYS[action], "Realty case condition action");
  const normalized = {
    requested_id: input.eventId || input.event_id || input.id
      ? reference(input.eventId || input.event_id || input.id, "Condition event id", 600)
      : null,
    case_id: reference(input.caseId || input.case_id, "Case id", 160),
    condition_id: reference(input.conditionId || input.condition_id, "Condition id", 160),
    action,
    ...executor(input),
  };
  if (action === "condition_satisfied") normalized.evidence_refs = evidenceRefs(input.evidenceRefs || input.evidence_refs);
  if (action === "condition_blocked") normalized.reason_code = code(input.reasonCode || input.reason_code, "Condition reason code");
  if (["condition_waived", "condition_reopened"].includes(action)) Object.assign(normalized, authority(input, normalized));
  if (action === "condition_reopened") normalized.due_at = timestamp(input.dueAt || input.due_at, "Condition dueAt");
  return normalized;
}

function parseStoredEvent(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Condition ledger event is invalid");
  const action = code(raw.action, "Condition action", 40);
  if (!ACTIONS.has(action)) throw new Error("Condition ledger event has an unknown action");
  assertKnownKeys(raw, new Set([...STORED_COMMON_KEYS, ...STORED_ACTION_KEYS[action]]), "Condition ledger event");
  const normalized = {
    id: reference(raw.id, "Condition event id", 600),
    case_id: reference(raw.case_id, "Case id", 160),
    condition_id: reference(raw.condition_id, "Condition id", 160),
    action,
    ...executor(raw),
    assurance_ref: raw.assurance_ref ? reference(raw.assurance_ref, "Condition assurance ref") : null,
    recorded_at: timestamp(raw.recorded_at, "Condition recordedAt"),
  };
  if (normalized.executor_kind === "agent" && !normalized.assurance_ref) {
    throw new Error("Agent condition events require an assurance reference");
  }
  if (normalized.executor_kind === "human" && normalized.assurance_ref) {
    throw new Error("Human condition events cannot carry an assurance reference");
  }
  if (action === "condition_opened") {
    normalized.condition_type = code(raw.condition_type, "Condition type");
    normalized.due_at = timestamp(raw.due_at, "Condition dueAt");
    normalized.required_evidence_producer_refs = referenceList(
      raw.required_evidence_producer_refs,
      "Condition required evidence producer refs",
    );
    if (Date.parse(normalized.due_at) <= Date.parse(normalized.recorded_at)) {
      throw new Error("Condition dueAt must follow recordedAt");
    }
  }
  if (action === "condition_satisfied") normalized.evidence_refs = evidenceRefs(raw.evidence_refs);
  if (action === "condition_blocked") normalized.reason_code = code(raw.reason_code, "Condition reason code");
  if (["condition_waived", "condition_reopened"].includes(action)) {
    normalized.authority_ref = reference(raw.authority_ref, "Condition authority ref");
    normalized.reason_code = code(raw.reason_code, "Condition reason code");
    if (normalized.executor_kind !== "human") throw new Error("Condition waive and reopen require a human executor");
  }
  if (action === "condition_reopened") {
    normalized.due_at = timestamp(raw.due_at, "Condition dueAt");
    if (Date.parse(normalized.due_at) <= Date.parse(normalized.recorded_at)) {
      throw new Error("Condition dueAt must follow recordedAt");
    }
  }
  return normalized;
}

function applyConditionEvent(condition, event) {
  if (event.action === "condition_satisfied") {
    if (!new Set(["open", "blocked"]).has(condition.status)) throw new Error("Condition cannot be satisfied from its current status");
    const producers = new Set(event.evidence_refs.map((row) => row.producer_ref));
    if (!condition.required_evidence_producer_refs.every((ref) => producers.has(ref))) {
      throw new Error("Condition evidence does not include every required producer ref");
    }
    condition.status = "satisfied";
    condition.evidence_refs = event.evidence_refs;
  }
  if (event.action === "condition_blocked") {
    if (condition.status !== "open") throw new Error("Only an open condition can be blocked");
    condition.status = "blocked";
    condition.reason_code = event.reason_code;
  }
  if (event.action === "condition_expired") {
    if (!new Set(["open", "blocked"]).has(condition.status)) throw new Error("Only an open or blocked condition can expire");
    if (Date.parse(event.recorded_at) < Date.parse(condition.due_at)) throw new Error("Condition cannot expire before its dueAt");
    condition.status = "expired";
  }
  if (event.action === "condition_waived") {
    if (new Set(["satisfied", "waived"]).has(condition.status)) throw new Error("Resolved condition cannot be waived");
    condition.status = "waived";
    condition.authority_ref = event.authority_ref;
    condition.reason_code = event.reason_code;
  }
  if (event.action === "condition_reopened") {
    if (condition.status === "open") throw new Error("Open condition does not need reopening");
    condition.status = "open";
    condition.due_at = event.due_at;
    condition.evidence_refs = [];
    condition.authority_ref = event.authority_ref;
    condition.reason_code = event.reason_code;
  }
  condition.last_recorded_at = event.recorded_at;
  condition.last_actor = event.actor;
  condition.last_action = event.action;
}

function sameOpen(event, input) {
  return (
    event.action === "condition_opened" &&
    event.case_id === input.case_id &&
    event.condition_id === input.condition_id &&
    event.condition_type === input.condition_type &&
    event.due_at === input.due_at &&
    JSON.stringify(event.required_evidence_producer_refs) === JSON.stringify(input.required_evidence_producer_refs) &&
    event.actor === input.actor &&
    event.executor_kind === input.executor_kind
  );
}

function sameAction(event, input) {
  return (
    event.case_id === input.case_id &&
    event.condition_id === input.condition_id &&
    event.action === input.action &&
    event.actor === input.actor &&
    event.executor_kind === input.executor_kind &&
    JSON.stringify(event.evidence_refs || null) === JSON.stringify(input.evidence_refs || null) &&
    (event.authority_ref || null) === (input.authority_ref || null) &&
    (event.reason_code || null) === (input.reason_code || null) &&
    (event.due_at || null) === (input.due_at || null)
  );
}

export function deriveRealtyCaseConditions(events = []) {
  const conditions = new Map();
  const eventIds = new Set();
  const recordedByCase = new Map();
  for (const raw of events) {
    const event = parseStoredEvent(raw);
    if (eventIds.has(event.id)) throw new Error("Condition event ids must be unique");
    eventIds.add(event.id);
    const priorRecordedAt = recordedByCase.get(event.case_id);
    if (priorRecordedAt && Date.parse(event.recorded_at) < Date.parse(priorRecordedAt)) {
      throw new Error("Condition actions must be recorded in chronological order");
    }
    recordedByCase.set(event.case_id, event.recorded_at);
    const key = conditionKey(event.case_id, event.condition_id);
    if (event.action === "condition_opened") {
      if (conditions.has(key)) throw new Error("Condition was opened more than once for the same case");
      conditions.set(key, {
        id: event.condition_id,
        case_id: event.case_id,
        type: event.condition_type,
        due_at: event.due_at,
        required_evidence_producer_refs: [...event.required_evidence_producer_refs],
        status: "open",
        evidence_refs: [],
        authority_ref: null,
        reason_code: null,
        created_at: event.recorded_at,
        last_recorded_at: event.recorded_at,
        last_actor: event.actor,
        last_action: event.action,
      });
      continue;
    }
    const condition = conditions.get(key);
    if (!condition) throw new Error("Condition event precedes condition_opened");
    applyConditionEvent(condition, event);
  }
  return [...conditions.values()].map((row) => ({
    ...row,
    required_evidence_producer_refs: [...row.required_evidence_producer_refs],
    evidence_refs: row.evidence_refs.map((evidence) => ({ ...evidence })),
  }));
}

export function resetRealtyCaseConditionLedger(filePath = DEFAULT_REALTY_CASE_CONDITION_LEDGER_PATH) {
  store.resetLedger(filePath);
}

export function readRealtyCaseConditionEvents(filePath = DEFAULT_REALTY_CASE_CONDITION_LEDGER_PATH) {
  return store.readRows(filePath);
}

export function openRealtyCaseCondition(
  input,
  {
    filePath = DEFAULT_REALTY_CASE_CONDITION_LEDGER_PATH,
    caseLedgerPath = DEFAULT_REALTY_CASE_LEDGER_PATH,
    recordedAt = new Date().toISOString(),
  } = {},
) {
  const normalized = openInput(input, recordedAt);
  const events = readRealtyCaseConditionEvents(filePath);
  const conditions = deriveRealtyCaseConditions(events);
  const existing = conditionForCase(normalized.case_id, normalized.condition_id, conditions);
  if (existing) {
    const openingEvent = events.find(
      (event) => event.case_id === normalized.case_id && event.condition_id === normalized.condition_id && event.action === "condition_opened",
    );
    if (!sameOpen(openingEvent, normalized)) throw new Error("Condition id already belongs to another condition for this case");
    return { event: openingEvent, condition: existing, idempotent: true };
  }
  if (normalized.requested_id && events.some((event) => event.id === normalized.requested_id)) {
    throw new Error("Condition event id already exists");
  }
  const owningCase = caseRecord(normalized.case_id, caseLedgerPath);
  assertAuthorized(owningCase, "condition_opened", normalized, normalized.recorded_at);
  assertChronology(events, normalized.case_id, normalized.recorded_at);
  const event = {
    id: normalized.requested_id || eventId(events, normalized.case_id, normalized.condition_id, "condition_opened"),
    case_id: normalized.case_id,
    condition_id: normalized.condition_id,
    action: "condition_opened",
    condition_type: normalized.condition_type,
    due_at: normalized.due_at,
    required_evidence_producer_refs: normalized.required_evidence_producer_refs,
    actor: normalized.actor,
    executor_kind: normalized.executor_kind,
    assurance_ref: normalized.executor_kind === "agent" ? owningCase.assurance_ref : null,
    recorded_at: normalized.recorded_at,
  };
  store.appendRow(filePath, event);
  return {
    event,
    condition: conditionForCase(normalized.case_id, normalized.condition_id, deriveRealtyCaseConditions([...events, event])),
    idempotent: false,
  };
}

export function appendRealtyCaseConditionAction(
  input,
  {
    filePath = DEFAULT_REALTY_CASE_CONDITION_LEDGER_PATH,
    caseLedgerPath = DEFAULT_REALTY_CASE_LEDGER_PATH,
    recordedAt = new Date().toISOString(),
  } = {},
) {
  const normalized = actionInput(input);
  const recorded = timestamp(recordedAt, "recordedAt");
  const events = readRealtyCaseConditionEvents(filePath);
  if (normalized.requested_id) {
    const prior = events.find((event) => event.id === normalized.requested_id);
    if (prior) {
      if (!sameAction(prior, normalized)) throw new Error("Condition event id already belongs to another action");
      return {
        event: prior,
        condition: conditionForCase(normalized.case_id, normalized.condition_id, deriveRealtyCaseConditions(events)),
        idempotent: true,
      };
    }
  }
  const conditions = deriveRealtyCaseConditions(events);
  const condition = conditionForCase(normalized.case_id, normalized.condition_id, conditions);
  if (!condition) throw new Error("Condition action requires a known condition for this case");
  const owningCase = caseRecord(normalized.case_id, caseLedgerPath);
  assertAuthorized(owningCase, normalized.action, normalized, recorded);
  assertChronology(events, normalized.case_id, recorded);
  if (normalized.action === "condition_reopened" && Date.parse(normalized.due_at) <= Date.parse(recorded)) {
    throw new Error("Condition dueAt must follow recordedAt");
  }
  const event = {
    id: normalized.requested_id || eventId(events, normalized.case_id, normalized.condition_id, normalized.action),
    case_id: normalized.case_id,
    condition_id: normalized.condition_id,
    action: normalized.action,
    actor: normalized.actor,
    executor_kind: normalized.executor_kind,
    assurance_ref: normalized.executor_kind === "agent" ? owningCase.assurance_ref : null,
    recorded_at: recorded,
    ...(normalized.evidence_refs ? { evidence_refs: normalized.evidence_refs } : {}),
    ...(normalized.authority_ref ? { authority_ref: normalized.authority_ref } : {}),
    ...(normalized.reason_code ? { reason_code: normalized.reason_code } : {}),
    ...(normalized.due_at ? { due_at: normalized.due_at } : {}),
  };
  applyConditionEvent({ ...condition, evidence_refs: [...condition.evidence_refs] }, parseStoredEvent(event));
  store.appendRow(filePath, event);
  return {
    event,
    condition: conditionForCase(normalized.case_id, normalized.condition_id, deriveRealtyCaseConditions([...events, event])),
    idempotent: false,
  };
}

export function buildRealtyCaseConditionQueue(events = [], { now = new Date().toISOString() } = {}) {
  const generatedAt = timestamp(now, "now");
  const conditions = deriveRealtyCaseConditions(events);
  const rows = conditions
    .filter((condition) => ACTIVE_STATUSES.has(condition.status))
    .map((condition) => {
      const overdue = condition.status === "expired" || Date.parse(condition.due_at) < Date.parse(generatedAt);
      return { ...condition, due_state: overdue ? "overdue" : "due", overdue };
    })
    .sort((left, right) => {
      if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
      if (left.status !== right.status) return left.status === "blocked" ? -1 : 1;
      return left.due_at.localeCompare(right.due_at) || left.case_id.localeCompare(right.case_id) || left.id.localeCompare(right.id);
    });
  return {
    kind: "realty_case_condition_queue",
    generated_at: generatedAt,
    rows,
    conditions,
    summary: {
      total: conditions.length,
      open: conditions.filter((condition) => condition.status === "open").length,
      blocked: conditions.filter((condition) => condition.status === "blocked").length,
      expired: conditions.filter((condition) => condition.status === "expired").length,
      satisfied: conditions.filter((condition) => condition.status === "satisfied").length,
      waived: conditions.filter((condition) => condition.status === "waived").length,
      unresolved: rows.length,
      due: rows.filter((row) => row.due_state === "due").length,
      overdue: rows.filter((row) => row.due_state === "overdue").length,
    },
  };
}

export function assertRealtyCaseConditionEvents(events) {
  if (!Array.isArray(events) || !events.length) throw new Error("Condition ledger must contain at least one event");
  deriveRealtyCaseConditions(events);
  return true;
}
