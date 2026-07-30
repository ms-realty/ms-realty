import { REALTY_CASE_PAYLOAD_MANIFEST_VERSION } from "./realty-case-payload-reconciliation.mjs";

const COLLECTION_ORDER = ["realty_cases", "realty_case_events", "realty_case_mandate_versions"];
const CASE_IMMUTABLE_FIELDS = [
  "workspace_id",
  "case_id",
  "jurisdiction",
  "case_type",
  "asset_kind",
  "client_ref",
  "property_ref",
  "workflow_version",
  "workflow_snapshot",
  "workflow_snapshot_digest",
];
const CASE_MUTABLE_FIELDS = [
  "execution_mode",
  "status",
  "assurance_ref",
  "mandate_ref",
  "mandate_version_number",
  "mandate_digest",
  "current_phase",
  "progress_percent",
  "last_event_sequence",
  "last_event_id",
  "last_event_action",
  "last_event_at",
];
const FIELDS_BY_COLLECTION = {
  realty_cases: [...CASE_IMMUTABLE_FIELDS, ...CASE_MUTABLE_FIELDS],
  realty_case_events: [
    "workspace_id",
    "event_id",
    "sequence",
    "action",
    "step_key",
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
  realty_case_mandate_versions: [
    "workspace_id",
    "mandate_ref",
    "version_number",
    "status",
    "granted_by_ref",
    "signed_at",
    "expires_at",
    "signed_evidence_ref",
    "capabilities",
    "mandate_digest",
    "idempotency_key",
  ],
};

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
  if (!Array.isArray(rows)) throw new Error(`Payload manifest collection ${collection} must be an array`);
  return rows;
}

function assertAllowedFields(data, collection) {
  if (!isRecord(data)) throw new Error(`Payload manifest ${collection} data must be an object`);
  const allowed = new Set(FIELDS_BY_COLLECTION[collection]);
  const unknown = Object.keys(data).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Payload manifest ${collection} has unknown data fields: ${unknown.join(", ")}`);
  const missing = FIELDS_BY_COLLECTION[collection].filter((key) => !(key in data));
  if (missing.length) throw new Error(`Payload manifest ${collection} is missing data fields: ${missing.join(", ")}`);
}

function caseReference(row, workspaceId, collection) {
  const reference = row?.references?.case;
  if (reference?.collection !== "realty_cases" || !isRecord(reference.match)) {
    throw new Error(`Payload manifest ${collection} row requires a realty_cases reference`);
  }
  if (reference.match.workspace_id !== workspaceId) throw new Error("Payload manifest relationship crosses workspace boundary");
  return requiredText(reference.match.case_id, "Payload manifest case reference", 160);
}

function caseMatch(row, workspaceId) {
  if (!isRecord(row.match) || row.match.workspace_id !== workspaceId) {
    throw new Error("Payload manifest row must match its workspace");
  }
  return requiredText(row.match.case_id, "Payload manifest case id", 160);
}

function assertRow(row, workspaceId, collection) {
  if (!isRecord(row)) throw new Error(`Payload manifest ${collection} row must be an object`);
  if (row.importable === false) throw new Error(`Payload manifest ${collection} contains a source gap`);
  assertAllowedFields(row.data, collection);
  if (row.data.workspace_id !== workspaceId) throw new Error("Payload manifest data crosses workspace boundary");
  if (collection === "realty_cases") {
    const caseId = caseMatch(row, workspaceId);
    if (row.data.case_id !== caseId) throw new Error("Payload manifest case match does not match data");
    return caseId;
  }
  const caseId = caseReference(row, workspaceId, collection);
  if (collection === "realty_case_mandate_versions" && caseMatch(row, workspaceId) !== caseId) {
    throw new Error("Payload manifest mandate match does not match case reference");
  }
  return caseId;
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
  if (!Number.isInteger(count) || count < 1 || count > 3) throw new Error("Payload projector maxAttempts must be an integer from 1 to 3");
  return count;
}

function retryableTransactionError(error) {
  return /could not serialize|serialization failure|deadlock detected|duplicate key/i.test(String(error?.message || error));
}

export function validateRealtyCasePayloadManifest(manifest) {
  if (!isRecord(manifest) || manifest.kind !== "realty_case_payload_manifest") {
    throw new Error("Payload projector requires a realty case payload manifest");
  }
  if (manifest.version !== REALTY_CASE_PAYLOAD_MANIFEST_VERSION) {
    throw new Error(`Unsupported realty case payload manifest version ${manifest.version}`);
  }
  const workspaceId = requiredText(manifest.workspace_id, "Payload manifest workspace_id", 160);
  if (manifest?.reconciliation?.ready_for_import !== true || (manifest.reconciliation.source_gaps || []).length) {
    throw new Error("Payload manifest has unresolved source gaps");
  }
  if (!isRecord(manifest.collections)) throw new Error("Payload manifest collections are required");
  const unknownCollections = Object.keys(manifest.collections).filter((collection) => !COLLECTION_ORDER.includes(collection));
  if (unknownCollections.length) throw new Error(`Payload manifest has unsupported collections: ${unknownCollections.join(", ")}`);

  const caseIds = new Set(rowsFor(manifest, "realty_cases").map((row) => assertRow(row, workspaceId, "realty_cases")));
  for (const collection of COLLECTION_ORDER.slice(1)) {
    for (const row of rowsFor(manifest, collection)) {
      const caseId = assertRow(row, workspaceId, collection);
      if (!caseIds.has(caseId)) throw new Error(`Payload manifest ${collection} references an unknown case ${caseId}`);
    }
  }
  return {
    workspace_id: workspaceId,
    planned: Object.fromEntries(COLLECTION_ORDER.map((collection) => [collection, rowsFor(manifest, collection).length])),
  };
}

async function resolveCases(payload, manifest, workspaceId, req, report) {
  const cases = new Map();
  const updates = [];
  for (const row of rowsFor(manifest, "realty_cases")) {
    const externalCaseId = row.data.case_id;
    const current = await findUnique(payload, "realty_cases", { workspace_id: workspaceId, case_id: externalCaseId }, req, `case ${externalCaseId}`);
    if (!current) {
      const created = await payload.create({ collection: "realty_cases", data: row.data, depth: 0, overrideAccess: true, req });
      cases.set(externalCaseId, created);
      report.created.realty_cases += 1;
      continue;
    }
    if (!matchingData(current, dataForFields(row.data, CASE_IMMUTABLE_FIELDS))) {
      throw new Error(`Payload case ${externalCaseId} conflicts with immutable source facts`);
    }
    if (Number(current.last_event_sequence) > Number(row.data.last_event_sequence)) {
      throw new Error(`Payload case ${externalCaseId} is ahead of the source manifest`);
    }
    const mutableData = dataForFields(row.data, CASE_MUTABLE_FIELDS);
    if (matchingData(current, mutableData)) report.reused.realty_cases += 1;
    else updates.push({ data: mutableData, id: current.id });
    cases.set(externalCaseId, current);
  }
  return { cases, updates };
}

async function appendRows(payload, manifest, collection, workspaceId, cases, req, report) {
  for (const row of rowsFor(manifest, collection)) {
    const externalCaseId = caseReference(row, workspaceId, collection);
    const caseDocument = cases.get(externalCaseId);
    if (!caseDocument?.id) throw new Error(`Payload case ${externalCaseId} has no internal id`);
    const expected = { ...row.data, case: caseDocument.id };
    const match = collection === "realty_case_events"
      ? { workspace_id: workspaceId, event_id: row.data.event_id }
      : { workspace_id: workspaceId, case: caseDocument.id, version_number: row.data.version_number };
    const current = await findUnique(payload, collection, match, req, `${collection} row`);
    if (!current) {
      await payload.create({ collection, data: expected, depth: 0, overrideAccess: true, req });
      report.created[collection] += 1;
    } else if (matchingData(current, expected, ["case"])) {
      report.reused[collection] += 1;
    } else {
      throw new Error(`Payload ${collection} conflicts with immutable source facts`);
    }
  }
}

/** Applies one reference-only manifest through Payload's supported transaction-aware Local API. */
export async function applyRealtyCasePayloadManifest(manifest, { maxAttempts, payload } = {}) {
  const validation = validateRealtyCasePayloadManifest(manifest);
  assertPayload(payload);
  const attempts = retryCount(maxAttempts);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await applyOnce(manifest, payload, validation, attempt);
    } catch (error) {
      if (attempt === attempts || !retryableTransactionError(error)) throw error;
    }
  }
  throw new Error("Payload projector exhausted transaction retries");
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
    updated: { realty_cases: 0 },
  };
  let committed = false;
  try {
    const { cases, updates } = await resolveCases(payload, manifest, validation.workspace_id, req, report);
    await appendRows(payload, manifest, "realty_case_events", validation.workspace_id, cases, req, report);
    await appendRows(payload, manifest, "realty_case_mandate_versions", validation.workspace_id, cases, req, report);
    for (const update of updates) {
      await payload.update({ collection: "realty_cases", data: update.data, depth: 0, id: update.id, overrideAccess: true, req });
      report.updated.realty_cases += 1;
    }
    await payload.db.commitTransaction(transactionId);
    committed = true;
    return { ...report, attempts: attempt };
  } catch (error) {
    if (!committed) await payload.db.rollbackTransaction(transactionId).catch(() => undefined);
    throw error;
  }
}
