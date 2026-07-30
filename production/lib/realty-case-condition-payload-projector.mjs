import { REALTY_CASE_CONDITION_PAYLOAD_MANIFEST_VERSION } from "./realty-case-condition-payload-reconciliation.mjs";

const COLLECTION_ORDER = ["realty_case_conditions", "realty_case_condition_events"];
const CONDITION_IMMUTABLE_FIELDS = [
  "workspace_id",
  "condition_id",
  "condition_type",
  "required_evidence_producer_refs",
];
const CONDITION_MUTABLE_FIELDS = [
  "due_at",
  "status",
  "evidence_refs",
  "authority_ref",
  "reason_code",
  "last_event_sequence",
  "last_event_id",
  "last_event_action",
  "last_event_at",
  "last_actor_ref",
];
const FIELDS_BY_COLLECTION = {
  realty_case_conditions: [...CONDITION_IMMUTABLE_FIELDS, ...CONDITION_MUTABLE_FIELDS],
  realty_case_condition_events: [
    "workspace_id",
    "event_id",
    "sequence",
    "action",
    "actor_ref",
    "executor_kind",
    "assurance_ref",
    "authority_ref",
    "reason_code",
    "reference_payload",
    "payload_digest",
    "idempotency_key",
    "recorded_at",
  ],
};
const STATUS_BY_LAST_ACTION = {
  condition_opened: "open",
  condition_satisfied: "satisfied",
  condition_blocked: "blocked",
  condition_expired: "expired",
  condition_waived: "waived",
  condition_reopened: "open",
};
const PRIVATE_FIELD = /(^|_)(address|base64|binary|body|contact|content|document_content|email|file|file_data|full_name|message|name|passport|phone|prompt|raw_content|tax_number)($|_)/i;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value, label, max = 240) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be ${max} characters or fewer`);
  return text;
}

function canonical(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function sameValue(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function relationshipId(value) {
  return isRecord(value) ? value.id : value;
}

function rowsFor(manifest, collection) {
  const rows = manifest?.collections?.[collection];
  if (!Array.isArray(rows)) throw new Error(`Condition Payload manifest collection ${collection} must be an array`);
  return rows;
}

function assertReferenceOnly(value, path = "manifest") {
  if (value === null || value === undefined || ["string", "boolean", "number"].includes(typeof value)) return;
  if (Array.isArray(value)) {
    value.forEach((row, index) => assertReferenceOnly(row, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) throw new Error("Condition Payload manifest values must be JSON-compatible");
  for (const [key, nested] of Object.entries(value)) {
    if (PRIVATE_FIELD.test(key)) throw new Error(`Condition Payload manifest cannot import private field ${path}.${key}`);
    assertReferenceOnly(nested, `${path}.${key}`);
  }
}

function assertAllowedFields(data, collection) {
  if (!isRecord(data)) throw new Error(`Condition Payload manifest ${collection} data must be an object`);
  const allowed = new Set(FIELDS_BY_COLLECTION[collection]);
  const unknown = Object.keys(data).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Condition Payload manifest ${collection} has unknown data fields: ${unknown.join(", ")}`);
  const missing = FIELDS_BY_COLLECTION[collection].filter((key) => !(key in data));
  if (missing.length) throw new Error(`Condition Payload manifest ${collection} is missing data fields: ${missing.join(", ")}`);
  assertReferenceOnly(data, `${collection}.data`);
}

function caseReference(reference, workspaceId, label) {
  if (reference?.collection !== "realty_cases" || !isRecord(reference.match)) {
    throw new Error(`Condition Payload manifest ${label} requires a realty_cases reference`);
  }
  if (reference.match.workspace_id !== workspaceId) throw new Error("Condition Payload manifest relationship crosses workspace boundary");
  return requiredText(reference.match.case_id, "Condition Payload manifest case reference", 160);
}

function conditionReference(reference, workspaceId, label) {
  if (reference?.collection !== "realty_case_conditions" || !isRecord(reference.match)) {
    throw new Error(`Condition Payload manifest ${label} requires a realty_case_conditions reference`);
  }
  if (reference.match.workspace_id !== workspaceId) throw new Error("Condition Payload manifest relationship crosses workspace boundary");
  return {
    case_id: requiredText(reference.match.case_id, "Condition Payload manifest condition case reference", 160),
    condition_id: requiredText(reference.match.condition_id, "Condition Payload manifest condition reference", 160),
  };
}

function conditionMatch(row, workspaceId) {
  if (!isRecord(row.match) || row.match.workspace_id !== workspaceId) {
    throw new Error("Condition Payload manifest condition row must match its workspace");
  }
  return {
    case_id: requiredText(row.match.case_id, "Condition Payload manifest condition case id", 160),
    condition_id: requiredText(row.match.condition_id, "Condition Payload manifest condition id", 160),
  };
}

function conditionKey(caseId, conditionId) {
  return `${caseId}\u0000${conditionId}`;
}

function assertConditionRow(row, workspaceId) {
  if (!isRecord(row) || row.importable === false || row.operation !== "upsert") {
    throw new Error("Condition Payload manifest condition row is not importable");
  }
  assertAllowedFields(row.data, "realty_case_conditions");
  if (row.data.workspace_id !== workspaceId) throw new Error("Condition Payload manifest data crosses workspace boundary");
  const match = conditionMatch(row, workspaceId);
  const caseId = caseReference(row?.references?.case, workspaceId, "condition");
  if (caseId !== match.case_id || row.data.condition_id !== match.condition_id) {
    throw new Error("Condition Payload manifest condition identity does not match its data or relationship");
  }
  requiredText(row.manifest_id, "Condition Payload manifest condition id", 80);
  requiredText(row.idempotency_key, "Condition Payload manifest condition idempotency key", 600);
  return match;
}

function assertEventRow(row, workspaceId) {
  if (!isRecord(row) || row.importable === false || row.operation !== "append") {
    throw new Error("Condition Payload manifest event row is not importable");
  }
  assertAllowedFields(row.data, "realty_case_condition_events");
  if (row.data.workspace_id !== workspaceId || !isRecord(row.match) || row.match.workspace_id !== workspaceId) {
    throw new Error("Condition Payload manifest event crosses workspace boundary");
  }
  const eventId = requiredText(row.match.event_id, "Condition Payload manifest event id", 600);
  if (row.data.event_id !== eventId) throw new Error("Condition Payload manifest event match does not match data");
  const caseId = caseReference(row?.references?.case, workspaceId, "event");
  const condition = conditionReference(row?.references?.condition, workspaceId, "event");
  if (condition.case_id !== caseId) throw new Error("Condition Payload manifest event case and condition references disagree");
  if (row.idempotency_key !== row.data.idempotency_key) {
    throw new Error("Condition Payload manifest event idempotency key does not match data");
  }
  if (!Number.isInteger(row.data.sequence) || row.data.sequence < 1) {
    throw new Error("Condition Payload manifest event sequence must be a positive integer");
  }
  requiredText(row.manifest_id, "Condition Payload manifest event manifest id", 80);
  requiredText(row.idempotency_key, "Condition Payload manifest event idempotency key", 600);
  return { case_id: caseId, condition_id: condition.condition_id };
}

function matchingData(document, data, relationshipFields = []) {
  const relationships = new Set(relationshipFields);
  return Object.entries(data).every(([key, value]) => sameValue(relationships.has(key) ? relationshipId(document[key]) : document[key], value));
}

function dataForFields(data, fields) {
  return Object.fromEntries(fields.map((field) => [field, data[field]]));
}

function equalsWhere(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { equals: value }]));
}

async function findUnique(payload, collection, where, req, label) {
  const result = await payload.find({
    collection,
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    req,
    where: equalsWhere(where),
  });
  const documents = Array.isArray(result?.docs) ? result.docs : [];
  if (documents.length > 1) throw new Error(`Payload has more than one ${label}`);
  return documents[0] || null;
}

function assertPayload(payload) {
  if (!payload?.db || typeof payload.db.beginTransaction !== "function" || typeof payload.db.commitTransaction !== "function" || typeof payload.db.rollbackTransaction !== "function") {
    throw new Error("Payload database adapter must support transactions");
  }
  for (const method of ["find", "create", "update"]) {
    if (typeof payload[method] !== "function") throw new Error(`Payload local API must provide ${method}`);
  }
}

function retryCount(value) {
  const count = value === undefined ? 2 : Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 3) throw new Error("Condition Payload projector maxAttempts must be an integer from 1 to 3");
  return count;
}

function retryableTransactionError(error) {
  return /could not serialize|serialization failure|deadlock detected|duplicate key/i.test(String(error?.message || error));
}

/** Validates a reference-only condition manifest before a Payload transaction begins. */
export function validateRealtyCaseConditionPayloadManifest(manifest) {
  if (!isRecord(manifest) || manifest.kind !== "realty_case_condition_payload_manifest") {
    throw new Error("Condition Payload projector requires a realty case condition payload manifest");
  }
  if (manifest.version !== REALTY_CASE_CONDITION_PAYLOAD_MANIFEST_VERSION) {
    throw new Error(`Unsupported realty case condition payload manifest version ${manifest.version}`);
  }
  const workspaceId = requiredText(manifest.workspace_id, "Condition Payload manifest workspace_id", 160);
  if (manifest?.reconciliation?.ready_for_import !== true || (manifest.reconciliation.source_gaps || []).length) {
    throw new Error("Condition Payload manifest has unresolved source gaps");
  }
  if (!isRecord(manifest.collections)) throw new Error("Condition Payload manifest collections are required");
  const unknownCollections = Object.keys(manifest.collections).filter((collection) => !COLLECTION_ORDER.includes(collection));
  if (unknownCollections.length) throw new Error(`Condition Payload manifest has unsupported collections: ${unknownCollections.join(", ")}`);

  const conditions = new Map();
  for (const row of rowsFor(manifest, "realty_case_conditions")) {
    const identity = assertConditionRow(row, workspaceId);
    const key = conditionKey(identity.case_id, identity.condition_id);
    if (conditions.has(key)) throw new Error(`Condition Payload manifest has duplicate condition ${identity.case_id}/${identity.condition_id}`);
    conditions.set(key, row);
  }
  const eventsByCondition = new Map();
  for (const row of rowsFor(manifest, "realty_case_condition_events")) {
    const identity = assertEventRow(row, workspaceId);
    const key = conditionKey(identity.case_id, identity.condition_id);
    if (!conditions.has(key)) throw new Error(`Condition Payload manifest event references an unknown condition ${identity.case_id}/${identity.condition_id}`);
    const events = eventsByCondition.get(key) || [];
    events.push(row);
    eventsByCondition.set(key, events);
  }
  for (const [key, row] of conditions) {
    const events = [...(eventsByCondition.get(key) || [])].sort((left, right) => left.data.sequence - right.data.sequence);
    if (!events.length) throw new Error(`Condition Payload manifest condition ${key.replace("\u0000", "/")} has no source events`);
    for (const [index, event] of events.entries()) {
      if (event.data.sequence !== index + 1) throw new Error(`Condition Payload manifest condition ${key.replace("\u0000", "/")} has non-contiguous event sequence`);
    }
    const latest = events.at(-1).data;
    if (
      row.data.last_event_sequence !== latest.sequence ||
      row.data.last_event_id !== latest.event_id ||
      row.data.last_event_action !== latest.action ||
      row.data.last_event_at !== latest.recorded_at ||
      row.data.last_actor_ref !== latest.actor_ref ||
      row.data.status !== STATUS_BY_LAST_ACTION[latest.action]
    ) {
      throw new Error(`Condition Payload manifest projection does not match its latest event for ${key.replace("\u0000", "/")}`);
    }
  }
  return {
    workspace_id: workspaceId,
    planned: Object.fromEntries(COLLECTION_ORDER.map((collection) => [collection, rowsFor(manifest, collection).length])),
  };
}

async function resolveCases(payload, manifest, workspaceId, req) {
  const cases = new Map();
  for (const row of rowsFor(manifest, "realty_case_conditions")) {
    const caseId = conditionMatch(row, workspaceId).case_id;
    if (cases.has(caseId)) continue;
    const current = await findUnique(payload, "realty_cases", { workspace_id: workspaceId, case_id: caseId }, req, `case ${caseId}`);
    if (!current?.id) throw new Error(`Condition Payload projector requires an existing projected Payload case ${caseId}`);
    cases.set(caseId, current);
  }
  return cases;
}

async function resolveConditions(payload, manifest, workspaceId, cases, req, report) {
  const conditions = new Map();
  const updates = [];
  for (const row of rowsFor(manifest, "realty_case_conditions")) {
    const identity = conditionMatch(row, workspaceId);
    const key = conditionKey(identity.case_id, identity.condition_id);
    const caseDocument = cases.get(identity.case_id);
    if (!caseDocument?.id) throw new Error(`Payload case ${identity.case_id} has no internal id`);
    const current = await findUnique(
      payload,
      "realty_case_conditions",
      { workspace_id: workspaceId, case: caseDocument.id, condition_id: identity.condition_id },
      req,
      `condition ${identity.case_id}/${identity.condition_id}`,
    );
    if (!current) {
      const created = await payload.create({
        collection: "realty_case_conditions",
        data: { ...row.data, case: caseDocument.id },
        depth: 0,
        overrideAccess: true,
        req,
      });
      conditions.set(key, created);
      report.created.realty_case_conditions += 1;
      continue;
    }
    if (!matchingData(current, dataForFields(row.data, CONDITION_IMMUTABLE_FIELDS))) {
      throw new Error(`Payload condition ${identity.case_id}/${identity.condition_id} conflicts with immutable source facts`);
    }
    if (Number(current.last_event_sequence) > Number(row.data.last_event_sequence)) {
      throw new Error(`Payload condition ${identity.case_id}/${identity.condition_id} is ahead of the source manifest`);
    }
    const mutableData = dataForFields(row.data, CONDITION_MUTABLE_FIELDS);
    if (matchingData(current, mutableData)) report.reused.realty_case_conditions += 1;
    else updates.push({ data: mutableData, id: current.id });
    conditions.set(key, current);
  }
  return { conditions, updates };
}

async function appendEvents(payload, manifest, workspaceId, cases, conditions, req, report) {
  for (const row of rowsFor(manifest, "realty_case_condition_events")) {
    const identity = conditionReference(row.references.condition, workspaceId, "event");
    const key = conditionKey(identity.case_id, identity.condition_id);
    const caseDocument = cases.get(identity.case_id);
    const conditionDocument = conditions.get(key);
    if (!caseDocument?.id || !conditionDocument?.id) {
      throw new Error(`Condition Payload event ${row.data.event_id} has no resolved parent relationships`);
    }
    const expected = { ...row.data, case: caseDocument.id, condition: conditionDocument.id };
    const current = await findUnique(
      payload,
      "realty_case_condition_events",
      { workspace_id: workspaceId, event_id: row.data.event_id },
      req,
      "condition event row",
    );
    if (!current) {
      await payload.create({ collection: "realty_case_condition_events", data: expected, depth: 0, overrideAccess: true, req });
      report.created.realty_case_condition_events += 1;
    } else if (matchingData(current, expected, ["case", "condition"])) {
      report.reused.realty_case_condition_events += 1;
    } else {
      throw new Error(`Payload condition event ${row.data.event_id} conflicts with immutable source facts`);
    }
  }
}

/** Applies one condition manifest through Payload's supported serializable Local API transaction. */
export async function applyRealtyCaseConditionPayloadManifest(manifest, { maxAttempts, payload } = {}) {
  const validation = validateRealtyCaseConditionPayloadManifest(manifest);
  assertPayload(payload);
  const attempts = retryCount(maxAttempts);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await applyOnce(manifest, payload, validation, attempt);
    } catch (error) {
      if (attempt === attempts || !retryableTransactionError(error)) throw error;
    }
  }
  throw new Error("Condition Payload projector exhausted transaction retries");
}

async function applyOnce(manifest, payload, validation, attempt) {
  const transactionId = await payload.db.beginTransaction({ accessMode: "read write", isolationLevel: "serializable" });
  if (!transactionId) throw new Error("Payload database adapter did not open a transaction");
  const req = { payload, transactionID: transactionId };
  const report = {
    workspace_id: validation.workspace_id,
    planned: validation.planned,
    created: Object.fromEntries(COLLECTION_ORDER.map((collection) => [collection, 0])),
    reused: Object.fromEntries(COLLECTION_ORDER.map((collection) => [collection, 0])),
    updated: { realty_case_conditions: 0 },
  };
  let committed = false;
  try {
    const cases = await resolveCases(payload, manifest, validation.workspace_id, req);
    const { conditions, updates } = await resolveConditions(payload, manifest, validation.workspace_id, cases, req, report);
    await appendEvents(payload, manifest, validation.workspace_id, cases, conditions, req, report);
    for (const update of updates) {
      await payload.update({
        collection: "realty_case_conditions",
        data: update.data,
        depth: 0,
        id: update.id,
        overrideAccess: true,
        req,
      });
      report.updated.realty_case_conditions += 1;
    }
    await payload.db.commitTransaction(transactionId);
    committed = true;
    return { ...report, attempts: attempt };
  } catch (error) {
    if (!committed) await payload.db.rollbackTransaction(transactionId).catch(() => undefined);
    throw error;
  }
}
