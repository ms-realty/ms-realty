import { createHash } from "node:crypto";
import {
  DEFAULT_REALTY_CASE_CONDITION_LEDGER_PATH,
  deriveRealtyCaseConditions,
  readRealtyCaseConditionEvents,
} from "./realty-case-conditions.mjs";

export const REALTY_CASE_CONDITION_PAYLOAD_MANIFEST_VERSION = 1;

const ACTIONS = new Set([
  "condition_opened",
  "condition_satisfied",
  "condition_blocked",
  "condition_expired",
  "condition_waived",
  "condition_reopened",
]);
const EXECUTOR_KINDS = new Set(["human", "agent"]);
const PRIVATE_FIELD = /(^|_)(address|base64|binary|body|contact|content|document_content|email|file|file_data|full_name|message|name|passport|phone|prompt|raw_content|tax_number)($|_)/i;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value, label, max = 240) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be ${max} characters or fewer`);
  return text;
}

function optionalText(value, label, max = 240) {
  if (value === null || value === undefined || value === "") return null;
  return requiredText(value, label, max);
}

function timestamp(value, label) {
  const text = requiredText(value, label, 80);
  if (Number.isNaN(Date.parse(text))) throw new Error(`${label} must be a valid timestamp`);
  return new Date(text).toISOString();
}

function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Manifest values must be JSON-compatible");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) throw new Error("Manifest values must be JSON-compatible");
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(canonical(value));
}

function digest(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableId(collection, workspaceId, identity) {
  return `mrcc_${digest([collection, workspaceId, identity]).slice(0, 32)}`;
}

function stableKey(collection, workspaceId, identity) {
  return `mrcc:${collection}:${digest([collection, workspaceId, identity]).slice(0, 48)}`;
}

function assertReferenceOnly(value, path = "event") {
  if (value === null || value === undefined || ["string", "boolean", "number"].includes(typeof value)) return;
  if (Array.isArray(value)) {
    value.forEach((row, index) => assertReferenceOnly(row, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) throw new Error("Realty case condition manifest inputs must be JSON-compatible");
  for (const [key, nested] of Object.entries(value)) {
    if (PRIVATE_FIELD.test(key)) throw new Error(`Realty case condition manifest cannot export private field ${path}.${key}`);
    assertReferenceOnly(nested, `${path}.${key}`);
  }
}

function referenceList(value, label, max = 240) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return [...new Set(value.map((item) => requiredText(item, label, max)))].sort();
}

function safeEvidenceRefs(value) {
  if (!Array.isArray(value)) throw new Error("Condition evidence_refs must be an array");
  return value
    .map((row) => {
      if (!isRecord(row)) throw new Error("Condition evidence reference must be an object");
      return {
        ref: requiredText(row.ref, "Condition evidence ref"),
        producer_ref: requiredText(row.producer_ref ?? row.producerRef, "Condition evidence producer ref"),
      };
    })
    .sort((left, right) => left.producer_ref.localeCompare(right.producer_ref) || left.ref.localeCompare(right.ref));
}

function referenceMatch(workspaceId, caseId) {
  return { workspace_id: workspaceId, case_id: caseId };
}

function caseReference(workspaceId, caseId) {
  return { collection: "realty_cases", match: referenceMatch(workspaceId, caseId) };
}

function conditionMatch(workspaceId, caseId, conditionId) {
  return { workspace_id: workspaceId, case_id: caseId, condition_id: conditionId };
}

function conditionReference(workspaceId, caseId, conditionId) {
  return { collection: "realty_case_conditions", match: conditionMatch(workspaceId, caseId, conditionId) };
}

function eventIdentity(event) {
  if (!isRecord(event)) throw new Error("Realty case condition event must be an object");
  const action = requiredText(event.action, "Realty case condition event action", 80);
  if (!ACTIONS.has(action)) throw new Error(`Unknown realty case condition event action ${action}`);
  const executorKind = requiredText(event.executor_kind, "Realty case condition executor kind", 20);
  if (!EXECUTOR_KINDS.has(executorKind)) throw new Error("Realty case condition executor kind must be human or agent");
  return {
    id: requiredText(event.id, "Realty case condition event id", 600),
    case_id: requiredText(event.case_id, "Realty case condition case id", 160),
    condition_id: requiredText(event.condition_id, "Realty case condition id", 160),
    action,
    actor: requiredText(event.actor, "Realty case condition actor", 80),
    executor_kind: executorKind,
    recorded_at: timestamp(event.recorded_at, "Realty case condition recorded_at"),
  };
}

function safeEventPayload(event) {
  if (event.action === "condition_opened") {
    return {
      condition_type: requiredText(event.condition_type, "Condition type", 120),
      due_at: timestamp(event.due_at, "Condition due_at"),
      required_evidence_producer_refs: referenceList(
        event.required_evidence_producer_refs,
        "Condition required evidence producer ref",
      ),
    };
  }
  if (event.action === "condition_satisfied") return { evidence_refs: safeEvidenceRefs(event.evidence_refs) };
  if (event.action === "condition_blocked") return { reason_code: requiredText(event.reason_code, "Condition reason code", 160) };
  if (event.action === "condition_expired") return {};
  if (event.action === "condition_waived") {
    return {
      authority_ref: requiredText(event.authority_ref, "Condition authority ref"),
      reason_code: requiredText(event.reason_code, "Condition reason code", 160),
    };
  }
  if (event.action === "condition_reopened") {
    return {
      authority_ref: requiredText(event.authority_ref, "Condition authority ref"),
      reason_code: requiredText(event.reason_code, "Condition reason code", 160),
      due_at: timestamp(event.due_at, "Condition due_at"),
    };
  }
  throw new Error(`Unknown realty case condition event action ${event.action}`);
}

function manifestRecord(collection, workspaceId, identity, { operation, match, data, references = {} }) {
  const manifestId = stableId(collection, workspaceId, identity);
  const idempotencyKey = stableKey(collection, workspaceId, identity);
  return {
    manifest_id: manifestId,
    idempotency_key: idempotencyKey,
    operation,
    match,
    ...(Object.keys(references).length ? { references } : {}),
    data,
    projection_digest: digest({ collection, match, references, data }),
    importable: true,
  };
}

function eventsForCondition(events, caseId, conditionId) {
  return events.filter((event) => event.case_id === caseId && event.condition_id === conditionId);
}

function projectCondition(condition, events, workspaceId) {
  const conditionEvents = eventsForCondition(events, condition.case_id, condition.id);
  const latestEvent = conditionEvents.at(-1);
  if (!latestEvent) throw new Error(`Condition ${condition.case_id}/${condition.id} has no source event`);
  return manifestRecord("realty_case_conditions", workspaceId, [condition.case_id, condition.id], {
    operation: "upsert",
    match: conditionMatch(workspaceId, condition.case_id, condition.id),
    references: { case: caseReference(workspaceId, condition.case_id) },
    data: {
      workspace_id: workspaceId,
      condition_id: condition.id,
      condition_type: requiredText(condition.type, "Condition type", 120),
      status: requiredText(condition.status, "Condition status", 40),
      due_at: timestamp(condition.due_at, "Condition due_at"),
      required_evidence_producer_refs: referenceList(
        condition.required_evidence_producer_refs,
        "Condition required evidence producer ref",
      ),
      evidence_refs: safeEvidenceRefs(condition.evidence_refs),
      authority_ref: optionalText(condition.authority_ref, "Condition authority ref"),
      reason_code: optionalText(condition.reason_code, "Condition reason code", 160),
      last_event_sequence: conditionEvents.length,
      last_event_id: requiredText(latestEvent.id, "Condition last event id", 600),
      last_event_action: requiredText(latestEvent.action, "Condition last event action", 80),
      last_event_at: timestamp(latestEvent.recorded_at, "Condition last event at"),
      last_actor_ref: requiredText(condition.last_actor, "Condition last actor", 80),
    },
  });
}

function projectEvents(events, workspaceId) {
  const sequenceByCondition = new Map();
  return events.map((event) => {
    const identity = eventIdentity(event);
    const key = `${identity.case_id}\u0000${identity.condition_id}`;
    const sequence = (sequenceByCondition.get(key) || 0) + 1;
    sequenceByCondition.set(key, sequence);
    const referencePayload = safeEventPayload(event);
    const idempotencyKey = stableKey("realty_case_condition_events", workspaceId, identity.id);
    return manifestRecord("realty_case_condition_events", workspaceId, identity.id, {
      operation: "append",
      match: { workspace_id: workspaceId, event_id: identity.id },
      references: {
        case: caseReference(workspaceId, identity.case_id),
        condition: conditionReference(workspaceId, identity.case_id, identity.condition_id),
      },
      data: {
        workspace_id: workspaceId,
        event_id: identity.id,
        sequence,
        action: identity.action,
        actor_ref: identity.actor,
        executor_kind: identity.executor_kind,
        assurance_ref: optionalText(event.assurance_ref, "Condition assurance ref"),
        authority_ref: optionalText(event.authority_ref, "Condition authority ref"),
        reason_code: optionalText(event.reason_code, "Condition reason code", 160),
        reference_payload: referencePayload,
        payload_digest: digest(referencePayload),
        idempotency_key: idempotencyKey,
        recorded_at: identity.recorded_at,
      },
    });
  });
}

function sortedCollections(collections) {
  return {
    realty_case_conditions: [...collections.realty_case_conditions].sort(
      (left, right) =>
        left.references.case.match.case_id.localeCompare(right.references.case.match.case_id) ||
        left.data.condition_id.localeCompare(right.data.condition_id),
    ),
    realty_case_condition_events: [...collections.realty_case_condition_events].sort(
      (left, right) =>
        left.references.condition.match.case_id.localeCompare(right.references.condition.match.case_id) ||
        left.references.condition.match.condition_id.localeCompare(right.references.condition.match.condition_id) ||
        left.data.sequence - right.data.sequence,
    ),
  };
}

function recordsFrom(manifest, { importableOnly = false } = {}) {
  if (Array.isArray(manifest)) return manifest;
  if (!isRecord(manifest) || !isRecord(manifest.collections)) {
    throw new Error("Condition Payload reconciliation input must be a manifest or record array");
  }
  return Object.entries(manifest.collections).flatMap(([collection, rows]) => {
    if (!Array.isArray(rows)) throw new Error(`Condition manifest collection ${collection} must be an array`);
    return rows
      .filter((row) => !importableOnly || row.importable !== false)
      .map((row) => ({ ...row, collection }));
  });
}

function projectedDigest(row) {
  const collection = requiredText(row.collection, "Condition manifest record collection", 80);
  return digest({ collection, match: row.match || {}, references: row.references || {}, data: row.data || {} });
}

function comparableRecords(manifest, options) {
  return recordsFrom(manifest, options).map((row) => ({
    collection: requiredText(row.collection, "Condition manifest record collection", 80),
    manifest_id: requiredText(row.manifest_id, "Condition manifest record id", 80),
    projection_digest: projectedDigest(row),
  }));
}

/** Builds a deterministic, reference-only import plan for the condition ledger. */
export function buildRealtyCaseConditionPayloadManifest(events = [], { workspaceId } = {}) {
  const workspaceIdValue = requiredText(workspaceId, "workspaceId", 160);
  if (!Array.isArray(events)) throw new Error("Realty case condition events must be an array");
  events.forEach((event, index) => assertReferenceOnly(event, `events[${index}]`));
  const sourceIds = new Set();
  for (const event of events) {
    const id = requiredText(event?.id, "Realty case condition event id", 600);
    if (sourceIds.has(id)) throw new Error(`Realty case condition event id ${id} appears more than once`);
    sourceIds.add(id);
  }

  const conditions = deriveRealtyCaseConditions(events).sort(
    (left, right) => left.case_id.localeCompare(right.case_id) || left.id.localeCompare(right.id),
  );
  const collections = {
    realty_case_conditions: conditions.map((condition) => projectCondition(condition, events, workspaceIdValue)),
    realty_case_condition_events: projectEvents(events, workspaceIdValue),
  };
  const orderedCollections = sortedCollections(collections);
  const rows = Object.values(orderedCollections).flat();
  const sourceEventDigest = digest(events);
  const projectionDigest = digest({
    workspace_id: workspaceIdValue,
    collections: orderedCollections,
    source_event_digest: sourceEventDigest,
  });
  return {
    kind: "realty_case_condition_payload_manifest",
    version: REALTY_CASE_CONDITION_PAYLOAD_MANIFEST_VERSION,
    workspace_id: workspaceIdValue,
    source: { event_count: events.length, event_digest: sourceEventDigest },
    collections: orderedCollections,
    reconciliation: {
      expected_records: rows.length,
      importable_records: rows.length,
      blocked_records: 0,
      source_gaps: [],
      ready_for_import: true,
      projection_digest: projectionDigest,
    },
  };
}

export function readRealtyCaseConditionPayloadManifest({
  filePath = DEFAULT_REALTY_CASE_CONDITION_LEDGER_PATH,
  workspaceId,
} = {}) {
  return buildRealtyCaseConditionPayloadManifest(readRealtyCaseConditionEvents(filePath), { workspaceId });
}

/** Compares an expected condition manifest with a stored importer snapshot without a database call. */
export function detectRealtyCaseConditionPayloadDrift(expectedManifest, observedManifest) {
  const expected = comparableRecords(expectedManifest, { importableOnly: true });
  const observed = comparableRecords(observedManifest, { importableOnly: true });
  const expectedById = new Map(expected.map((row) => [`${row.collection}:${row.manifest_id}`, row]));
  const observedById = new Map(observed.map((row) => [`${row.collection}:${row.manifest_id}`, row]));
  const missing = [];
  const changed = [];
  const unexpected = [];

  for (const [key, row] of expectedById) {
    const current = observedById.get(key);
    if (!current) missing.push(row);
    else if (current.projection_digest !== row.projection_digest) changed.push({ expected: row, observed: current });
  }
  for (const [key, row] of observedById) if (!expectedById.has(key)) unexpected.push(row);

  const sourceGaps = expectedManifest?.reconciliation?.source_gaps || [];
  const inSync = !missing.length && !changed.length && !unexpected.length;
  const readyForImport = !sourceGaps.length;
  return {
    in_sync: inSync,
    ready_for_import: readyForImport,
    clean: inSync && readyForImport,
    missing,
    changed,
    unexpected,
    source_gaps: sourceGaps,
  };
}
