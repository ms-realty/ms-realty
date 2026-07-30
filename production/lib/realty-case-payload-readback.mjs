import { createHash } from "node:crypto";
import {
  detectRealtyCaseConditionPayloadDrift,
} from "./realty-case-condition-payload-reconciliation.mjs";
import { REALTY_CASE_CONDITION_PAYLOAD_PROJECTOR_FIELDS } from "./realty-case-condition-payload-projector.mjs";
import { detectRealtyCasePayloadDrift } from "./realty-case-payload-reconciliation.mjs";
import { REALTY_CASE_PAYLOAD_PROJECTOR_FIELDS } from "./realty-case-payload-projector.mjs";

const CASE_COLLECTIONS = ["realty_cases", "realty_case_events", "realty_case_mandate_versions"];
const CONDITION_COLLECTIONS = ["realty_case_conditions", "realty_case_condition_events"];
const COLLECTIONS = [
  { collection: "realty_cases", fields: REALTY_CASE_PAYLOAD_PROJECTOR_FIELDS.realty_cases, relationships: [] },
  { collection: "realty_case_events", fields: REALTY_CASE_PAYLOAD_PROJECTOR_FIELDS.realty_case_events, relationships: ["case"] },
  {
    collection: "realty_case_mandate_versions",
    fields: REALTY_CASE_PAYLOAD_PROJECTOR_FIELDS.realty_case_mandate_versions,
    relationships: ["case"],
  },
  {
    collection: "realty_case_conditions",
    fields: REALTY_CASE_CONDITION_PAYLOAD_PROJECTOR_FIELDS.realty_case_conditions,
    relationships: ["case"],
  },
  {
    collection: "realty_case_condition_events",
    fields: REALTY_CASE_CONDITION_PAYLOAD_PROJECTOR_FIELDS.realty_case_condition_events,
    relationships: ["case", "condition"],
  },
];

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value, label, max = 240) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be ${max} characters or fewer`);
  return text;
}

function rowsFor(manifest, collection) {
  const rows = manifest?.collections?.[collection];
  if (!Array.isArray(rows)) throw new Error(`Payload read-back manifest ${collection} must be an array`);
  return rows.filter((row) => row?.importable !== false);
}

function assertManifestScope(manifest, kind, workspaceId, collections) {
  if (!isRecord(manifest) || manifest.kind !== kind) throw new Error(`Payload read-back requires ${kind}`);
  if (requiredText(manifest.workspace_id, "Payload read-back manifest workspace_id", 160) !== workspaceId) {
    throw new Error("Payload read-back manifest crosses workspace boundary");
  }
  collections.forEach((collection) => rowsFor(manifest, collection));
}

function key(...values) {
  return values.map((value) => String(value)).join("\u0000");
}

function indexRows(rows, keyFor) {
  const result = new Map();
  for (const row of rows) {
    const rowKey = keyFor(row);
    const values = result.get(rowKey) || [];
    values.push(row);
    result.set(rowKey, values);
  }
  return result;
}

function unique(map, value) {
  const matches = map.get(value) || [];
  return matches.length === 1 ? matches[0] : null;
}

function normalize(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((field) => [field, normalize(value[field])]));
}

function documentId(document, label) {
  if (!isRecord(document) || document.id === undefined || document.id === null || document.id === "") {
    throw new Error(`Payload read-back ${label} has no internal id`);
  }
  return String(document.id);
}

function relationshipId(value) {
  if (value === undefined || value === null || value === "") return null;
  return isRecord(value) ? documentId(value, "relationship") : String(value);
}

function opaqueIdentity(collection, value) {
  const digest = createHash("sha256").update(`${collection}\u0000${String(value ?? "missing")}`).digest("hex");
  return `observed_${digest.slice(0, 40)}`;
}

function opaqueRelationship(collection, value) {
  return `unresolved_${opaqueIdentity(collection, value).slice("observed_".length)}`;
}

function dataFor(document, fields) {
  return Object.fromEntries(fields.map((field) => [field, normalize(document[field])]));
}

function workspaceDocument(document, workspaceId, collection) {
  if (requiredText(document?.workspace_id, `Payload ${collection} workspace_id`, 160) !== workspaceId) {
    throw new Error("Payload read-back received a document outside its workspace");
  }
}

function caseReference(workspaceId, caseId) {
  return { collection: "realty_cases", match: { workspace_id: workspaceId, case_id: caseId } };
}

function conditionReference(workspaceId, condition) {
  return {
    collection: "realty_case_conditions",
    match: { workspace_id: workspaceId, case_id: condition.case_id, condition_id: condition.condition_id },
  };
}

function caseIdFromRelationship(value, caseByDocumentId) {
  const id = relationshipId(value);
  return (id && caseByDocumentId.get(id)) || opaqueRelationship("realty_cases", id);
}

function conditionFromRelationship(value, conditionByDocumentId) {
  const id = relationshipId(value);
  return conditionByDocumentId.get(id) || {
    case_id: opaqueRelationship("realty_case_conditions_case", id),
    condition_id: opaqueRelationship("realty_case_conditions", id),
  };
}

function observedRecord({ candidate, claimed, collection, data, document, match, references }) {
  const candidateKey = candidate && `${collection}:${candidate.manifest_id}`;
  const manifestId = candidateKey && !claimed.has(candidateKey) ? candidate.manifest_id : opaqueIdentity(collection, documentId(document, collection));
  if (candidateKey && manifestId === candidate.manifest_id) claimed.add(candidateKey);
  return { collection, manifest_id: manifestId, match, ...(references ? { references } : {}), data, importable: true };
}

function expectedIndexes(caseManifest, conditionManifest) {
  const caseRows = rowsFor(caseManifest, "realty_cases");
  const caseEventRows = rowsFor(caseManifest, "realty_case_events");
  const mandateRows = rowsFor(caseManifest, "realty_case_mandate_versions");
  const conditionRows = rowsFor(conditionManifest, "realty_case_conditions");
  const conditionEventRows = rowsFor(conditionManifest, "realty_case_condition_events");
  return {
    casesById: indexRows(caseRows, (row) => row.data.case_id),
    caseEventsById: indexRows(caseEventRows, (row) => row.data.event_id),
    mandatesByIdempotencyKey: indexRows(mandateRows, (row) => row.data.idempotency_key),
    mandatesByCaseVersion: indexRows(mandateRows, (row) => key(row.match.case_id, row.data.version_number)),
    conditionsByCaseAndId: indexRows(conditionRows, (row) => key(row.match.case_id, row.data.condition_id)),
    conditionsById: indexRows(conditionRows, (row) => row.data.condition_id),
    conditionsByLastEvent: indexRows(conditionRows, (row) => row.data.last_event_id),
    conditionEventsById: indexRows(conditionEventRows, (row) => row.data.event_id),
  };
}

function selectFor(fields, relationships) {
  return Object.fromEntries(["id", ...fields, ...relationships].map((field) => [field, true]));
}

async function findWorkspaceRows(payload, definition, workspaceId, req) {
  const result = await payload.find({
    collection: definition.collection,
    depth: 0,
    overrideAccess: true,
    pagination: false,
    req,
    select: selectFor(definition.fields, definition.relationships),
    where: { workspace_id: { equals: workspaceId } },
  });
  if (!Array.isArray(result?.docs)) throw new Error(`Payload read-back ${definition.collection} did not return documents`);
  result.docs.forEach((document) => workspaceDocument(document, workspaceId, definition.collection));
  return result.docs;
}

function assertPayload(payload) {
  if (!payload?.db || typeof payload.db.beginTransaction !== "function" || typeof payload.db.commitTransaction !== "function" || typeof payload.db.rollbackTransaction !== "function") {
    throw new Error("Payload read-back requires transaction-capable database access");
  }
  if (typeof payload.find !== "function") throw new Error("Payload read-back requires the Local API find method");
}

async function readSnapshot(payload, workspaceId) {
  const transactionId = await payload.db.beginTransaction({ accessMode: "read only", isolationLevel: "repeatable read" });
  if (!transactionId) throw new Error("Payload read-back database adapter did not open a transaction");
  const req = { payload, transactionID: transactionId };
  try {
    const documents = {};
    for (const definition of COLLECTIONS) {
      documents[definition.collection] = await findWorkspaceRows(payload, definition, workspaceId, req);
    }
    await payload.db.commitTransaction(transactionId);
    return documents;
  } catch (error) {
    await payload.db.rollbackTransaction(transactionId).catch(() => undefined);
    throw error;
  }
}

function buildObservedRows(documents, indexes, workspaceId) {
  const claimed = new Set();
  const caseRows = [];
  const conditionRows = [];
  const caseByDocumentId = new Map();
  const conditionByDocumentId = new Map();

  for (const document of documents.realty_cases) {
    const data = dataFor(document, REALTY_CASE_PAYLOAD_PROJECTOR_FIELDS.realty_cases);
    const caseId = requiredText(data.case_id, "Payload case_id", 160);
    caseByDocumentId.set(documentId(document, "case"), caseId);
    caseRows.push(
      observedRecord({
        candidate: unique(indexes.casesById, caseId),
        claimed,
        collection: "realty_cases",
        data,
        document,
        match: { workspace_id: workspaceId, case_id: caseId },
      }),
    );
  }

  for (const document of documents.realty_case_conditions) {
    const data = dataFor(document, REALTY_CASE_CONDITION_PAYLOAD_PROJECTOR_FIELDS.realty_case_conditions);
    const caseId = caseIdFromRelationship(document.case, caseByDocumentId);
    const conditionId = requiredText(data.condition_id, "Payload condition_id", 160);
    const candidate =
      unique(indexes.conditionsByCaseAndId, key(caseId, conditionId)) ||
      unique(indexes.conditionsById, conditionId) ||
      unique(indexes.conditionsByLastEvent, data.last_event_id);
    conditionByDocumentId.set(documentId(document, "condition"), { case_id: caseId, condition_id: conditionId });
    conditionRows.push(
      observedRecord({
        candidate,
        claimed,
        collection: "realty_case_conditions",
        data,
        document,
        match: { workspace_id: workspaceId, case_id: caseId, condition_id: conditionId },
        references: { case: caseReference(workspaceId, caseId) },
      }),
    );
  }

  for (const document of documents.realty_case_events) {
    const data = dataFor(document, REALTY_CASE_PAYLOAD_PROJECTOR_FIELDS.realty_case_events);
    const caseId = caseIdFromRelationship(document.case, caseByDocumentId);
    caseRows.push(
      observedRecord({
        candidate: unique(indexes.caseEventsById, data.event_id),
        claimed,
        collection: "realty_case_events",
        data,
        document,
        match: { workspace_id: workspaceId, event_id: data.event_id },
        references: { case: caseReference(workspaceId, caseId) },
      }),
    );
  }

  for (const document of documents.realty_case_mandate_versions) {
    const data = dataFor(document, REALTY_CASE_PAYLOAD_PROJECTOR_FIELDS.realty_case_mandate_versions);
    const caseId = caseIdFromRelationship(document.case, caseByDocumentId);
    const candidate =
      unique(indexes.mandatesByIdempotencyKey, data.idempotency_key) ||
      unique(indexes.mandatesByCaseVersion, key(caseId, data.version_number));
    caseRows.push(
      observedRecord({
        candidate,
        claimed,
        collection: "realty_case_mandate_versions",
        data,
        document,
        match: { workspace_id: workspaceId, case_id: caseId, version_number: data.version_number },
        references: { case: caseReference(workspaceId, caseId) },
      }),
    );
  }

  for (const document of documents.realty_case_condition_events) {
    const data = dataFor(document, REALTY_CASE_CONDITION_PAYLOAD_PROJECTOR_FIELDS.realty_case_condition_events);
    const caseId = caseIdFromRelationship(document.case, caseByDocumentId);
    const condition = conditionFromRelationship(document.condition, conditionByDocumentId);
    conditionRows.push(
      observedRecord({
        candidate: unique(indexes.conditionEventsById, data.event_id),
        claimed,
        collection: "realty_case_condition_events",
        data,
        document,
        match: { workspace_id: workspaceId, event_id: data.event_id },
        references: {
          case: caseReference(workspaceId, caseId),
          condition: conditionReference(workspaceId, condition),
        },
      }),
    );
  }

  return { caseRows, conditionRows };
}

function summary(report) {
  return {
    missing: report.missing.length,
    changed: report.changed.length,
    unexpected: report.unexpected.length,
    source_gaps: report.source_gaps.length,
  };
}

/**
 * Reconciles the reference-only case and condition manifests against a single, workspace-scoped
 * Payload snapshot. The result intentionally exposes counts only.
 */
export async function reconcileRealtyCasePayloadReadback({ caseManifest, conditionManifest, payload, workspaceId } = {}) {
  const workspaceIdValue = requiredText(workspaceId, "workspaceId", 160);
  assertManifestScope(caseManifest, "realty_case_payload_manifest", workspaceIdValue, CASE_COLLECTIONS);
  assertManifestScope(conditionManifest, "realty_case_condition_payload_manifest", workspaceIdValue, CONDITION_COLLECTIONS);
  assertPayload(payload);

  const documents = await readSnapshot(payload, workspaceIdValue);
  const observed = buildObservedRows(documents, expectedIndexes(caseManifest, conditionManifest), workspaceIdValue);
  const caseDrift = detectRealtyCasePayloadDrift(caseManifest, observed.caseRows);
  const conditionDrift = detectRealtyCaseConditionPayloadDrift(conditionManifest, observed.conditionRows);
  return {
    kind: "realty_case_payload_readback",
    workspace_id: workspaceIdValue,
    clean: caseDrift.clean && conditionDrift.clean,
    case: summary(caseDrift),
    conditions: summary(conditionDrift),
    scanned: Object.fromEntries(COLLECTIONS.map(({ collection }) => [collection, documents[collection].length])),
  };
}
