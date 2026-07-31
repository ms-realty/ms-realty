import { createHash } from "node:crypto";
import {
  DEFAULT_REALTY_CASE_LEDGER_PATH,
  deriveRealtyCases,
  readRealtyCaseEvents,
} from "./realty-cases.mjs";

export const REALTY_CASE_PAYLOAD_MANIFEST_VERSION = 1;

const ACTIONS = new Set([
  "case_opened",
  "step_completed",
  "step_not_applicable",
  "step_blocked",
  "step_reopened",
  "mode_changed",
  "case_frozen",
  "case_resumed",
  "case_closed",
  "case_cancelled",
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

export { digest as stableRealtyCasePayloadDigest };

function stableId(collection, workspaceId, identity) {
  return `mrc_${digest([collection, workspaceId, identity]).slice(0, 32)}`;
}

function stableKey(collection, workspaceId, identity) {
  return `mrc:${collection}:${digest([collection, workspaceId, identity]).slice(0, 48)}`;
}

function assertReferenceOnly(value, path = "event") {
  if (value === null || value === undefined || ["string", "boolean", "number"].includes(typeof value)) return;
  if (Array.isArray(value)) {
    value.forEach((row, index) => assertReferenceOnly(row, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) throw new Error("Realty case manifest inputs must be JSON-compatible");
  for (const [key, nested] of Object.entries(value)) {
    if (PRIVATE_FIELD.test(key)) throw new Error(`Realty case manifest cannot export private field ${path}.${key}`);
    assertReferenceOnly(nested, `${path}.${key}`);
  }
}

function referenceList(value, label, max = 240) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return [...new Set(value.map((item) => requiredText(item, label, max)))].sort();
}

function referenceMatch(workspaceId, caseId) {
  return { workspace_id: workspaceId, case_id: caseId };
}

function caseReference(workspaceId, caseId) {
  return { collection: "realty_cases", match: referenceMatch(workspaceId, caseId) };
}

function eventIdentity(event) {
  if (!isRecord(event)) throw new Error("Realty case event must be an object");
  const action = requiredText(event.action, "Realty case event action", 80);
  if (!ACTIONS.has(action)) throw new Error(`Unknown realty case event action ${action}`);
  const executorKind = requiredText(event.executor_kind, "Realty case event executor kind", 20);
  if (!EXECUTOR_KINDS.has(executorKind)) throw new Error("Realty case event executor kind must be human or agent");
  return {
    id: requiredText(event.id, "Realty case event id", 160),
    case_id: requiredText(event.case_id, "Realty case id", 160),
    action,
    actor: requiredText(event.actor, "Realty case event actor", 160),
    executor_kind: executorKind,
    recorded_at: timestamp(event.recorded_at, "Realty case event recorded_at"),
  };
}

function safeEvidenceRefs(value) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Realty case event evidence_refs must be an array");
  return value.map((row) => {
    if (!isRecord(row)) throw new Error("Realty case evidence reference must be an object");
    return {
      ref: requiredText(row.ref, "Evidence ref"),
      type: requiredText(row.type, "Evidence type", 120),
      producer_kind: requiredText(row.producer_kind ?? row.producerKind, "Evidence producer kind", 40),
      issued_at: row.issued_at || row.issuedAt ? timestamp(row.issued_at ?? row.issuedAt, "Evidence issued_at") : null,
      digest: optionalText(row.digest, "Evidence digest", 160),
    };
  });
}

function safeMandate(value) {
  if (!isRecord(value)) throw new Error("Realty case mandate must be an object");
  const signedEvidenceRef = optionalText(value.signed_evidence_ref ?? value.signedEvidenceRef, "Mandate signed evidence ref");
  return {
    ref: requiredText(value.ref, "Mandate ref"),
    granted_by_ref: requiredText(value.granted_by_ref ?? value.grantedByRef, "Mandate granted_by_ref"),
    signed_at: timestamp(value.signed_at ?? value.signedAt, "Mandate signed_at"),
    expires_at: value.expires_at || value.expiresAt ? timestamp(value.expires_at ?? value.expiresAt, "Mandate expires_at") : null,
    capabilities: referenceList(value.capabilities, "Mandate capability", 120),
    signed_evidence_ref: signedEvidenceRef,
  };
}

function safeWorkflowSnapshot(openingEvent) {
  if (!Array.isArray(openingEvent.workflow_phases) || !Array.isArray(openingEvent.workflow_steps)) {
    throw new Error("Case opening event requires workflow phases and steps");
  }
  return {
    workflow_phases: openingEvent.workflow_phases.map((phase) => requiredText(phase, "Workflow phase", 80)),
    workflow_steps: openingEvent.workflow_steps.map((step) => {
      if (!isRecord(step)) throw new Error("Workflow step must be an object");
      const result = {
        key: requiredText(step.key, "Workflow step key", 160),
        phase: requiredText(step.phase, "Workflow step phase", 80),
        optional: Boolean(step.optional),
        evidence_producers: referenceList(step.evidence_producers, "Workflow evidence producer", 40),
      };
      if (step.rule_refs !== undefined) result.rule_refs = referenceList(step.rule_refs, "Workflow rule ref", 160);
      return result;
    }),
  };
}

function safeEventPayload(event) {
  const action = event.action;
  if (action === "case_opened") {
    return {
      jurisdiction: requiredText(event.jurisdiction, "Case jurisdiction", 8),
      case_type: requiredText(event.case_type, "Case type", 160),
      asset_kind: requiredText(event.asset_kind, "Asset kind", 160),
      client_ref: requiredText(event.client_ref, "Client ref"),
      property_ref: optionalText(event.property_ref, "Property ref"),
      execution_mode: requiredText(event.execution_mode, "Execution mode", 20),
      assurance_ref: optionalText(event.assurance_ref, "Assurance ref"),
      mandate: safeMandate(event.mandate),
      workflow_version: requiredText(event.workflow_version, "Workflow version", 160),
      workflow_snapshot: safeWorkflowSnapshot(event),
    };
  }
  if (action === "step_completed") return { evidence_refs: safeEvidenceRefs(event.evidence_refs) };
  if (["step_not_applicable", "step_reopened"].includes(action)) {
    return {
      authority_ref: requiredText(event.authority_ref, "Authority ref"),
      reason_code: requiredText(event.reason_code, "Reason code", 160),
    };
  }
  if (action === "step_blocked") return { reason_code: requiredText(event.reason_code, "Reason code", 160) };
  if (action === "mode_changed") {
    return {
      execution_mode: requiredText(event.execution_mode, "Execution mode", 20),
      assurance_ref: optionalText(event.assurance_ref, "Assurance ref"),
      authority_ref: requiredText(event.authority_ref, "Authority ref"),
      mandate: safeMandate(event.mandate),
    };
  }
  if (["case_frozen", "case_cancelled"].includes(action)) {
    return {
      authority_ref: requiredText(event.authority_ref, "Authority ref"),
      reason_code: requiredText(event.reason_code, "Reason code", 160),
    };
  }
  if (action === "case_resumed") return { authority_ref: requiredText(event.authority_ref, "Authority ref") };
  return {};
}

function manifestRecord(collection, workspaceId, identity, { operation, match, data, references = {}, importable = true, source_gaps = [] }) {
  const manifestId = stableId(collection, workspaceId, identity);
  const idempotencyKey = stableKey(collection, workspaceId, identity);
  const projectionDigest = digest({ collection, match, references, data });
  return {
    manifest_id: manifestId,
    idempotency_key: idempotencyKey,
    operation,
    match,
    ...(Object.keys(references).length ? { references } : {}),
    data,
    projection_digest: projectionDigest,
    importable,
    ...(source_gaps.length ? { source_gaps } : {}),
  };
}

function mandateEventsFor(events, caseId) {
  return events.filter((event) => event.case_id === caseId && ["case_opened", "mode_changed"].includes(event.action));
}

function projectCase(caseRecord, events, workspaceId) {
  const openingEvent = events.find((event) => event.case_id === caseRecord.id && event.action === "case_opened");
  if (!openingEvent) throw new Error(`Case ${caseRecord.id} has no opening event`);
  const workflowSnapshot = safeWorkflowSnapshot(openingEvent);
  const mandates = mandateEventsFor(events, caseRecord.id);
  if (!mandates.length) throw new Error(`Case ${caseRecord.id} has no mandate event`);
  const currentMandate = safeMandate(mandates.at(-1).mandate);
  const latestEvent = events.filter((event) => event.case_id === caseRecord.id).at(-1);
  const data = {
    workspace_id: workspaceId,
    case_id: caseRecord.id,
    jurisdiction: requiredText(caseRecord.jurisdiction, "Case jurisdiction", 8),
    case_type: requiredText(caseRecord.case_type, "Case type", 160),
    asset_kind: requiredText(caseRecord.asset_kind, "Asset kind", 160),
    client_ref: requiredText(caseRecord.client_ref, "Client ref"),
    property_ref: optionalText(caseRecord.property_ref, "Property ref"),
    execution_mode: requiredText(caseRecord.execution_mode, "Execution mode", 20),
    status: requiredText(caseRecord.status, "Case status", 20),
    assurance_ref: optionalText(caseRecord.assurance_ref, "Assurance ref"),
    mandate_ref: currentMandate.ref,
    mandate_version_number: mandates.length,
    mandate_digest: digest(currentMandate),
    workflow_version: requiredText(caseRecord.workflow_version, "Workflow version", 160),
    workflow_snapshot: workflowSnapshot,
    workflow_snapshot_digest: digest(workflowSnapshot),
    current_phase: requiredText(caseRecord.current_phase, "Current phase", 80),
    progress_percent: Number(caseRecord.progress_percent),
    last_event_sequence: events.filter((event) => event.case_id === caseRecord.id).length,
    last_event_id: requiredText(latestEvent?.id, "Last case event id", 160),
    last_event_action: requiredText(latestEvent?.action, "Last case event action", 80),
    last_event_at: timestamp(latestEvent?.recorded_at, "Last case event recorded_at"),
  };
  return manifestRecord("realty_cases", workspaceId, caseRecord.id, {
    operation: "upsert",
    match: referenceMatch(workspaceId, caseRecord.id),
    data,
  });
}

function projectEvents(events, workspaceId) {
  const sequenceByCase = new Map();
  return events.map((event) => {
    const identity = eventIdentity(event);
    const sequence = (sequenceByCase.get(identity.case_id) || 0) + 1;
    sequenceByCase.set(identity.case_id, sequence);
    const idempotencyKey = stableKey("realty_case_events", workspaceId, identity.id);
    const referencePayload = safeEventPayload(event);
    return manifestRecord("realty_case_events", workspaceId, identity.id, {
      operation: "append",
      match: { workspace_id: workspaceId, event_id: identity.id },
      references: { case: caseReference(workspaceId, identity.case_id) },
      data: {
        workspace_id: workspaceId,
        event_id: identity.id,
        sequence,
        action: identity.action,
        step_key: optionalText(event.step_key, "Case step key", 160),
        actor_ref: identity.actor,
        executor_kind: identity.executor_kind,
        assurance_ref: optionalText(event.assurance_ref, "Assurance ref"),
        authority_ref: optionalText(event.authority_ref, "Authority ref"),
        reason_code: optionalText(event.reason_code, "Reason code", 160),
        reference_payload: referencePayload,
        payload_digest: digest(referencePayload),
        idempotency_key: idempotencyKey,
        recorded_at: identity.recorded_at,
      },
    });
  });
}

function projectMandates(caseRecord, events, workspaceId) {
  const mandateEvents = mandateEventsFor(events, caseRecord.id);
  return mandateEvents.map((event, index) => {
    const mandate = safeMandate(event.mandate);
    const version = index + 1;
    const sourceGaps = mandate.signed_evidence_ref
      ? []
      : [
          {
            collection: "realty_case_mandate_versions",
            case_id: caseRecord.id,
            source_event_id: requiredText(event.id, "Mandate source event id", 160),
            field: "signed_evidence_ref",
            reason: "preview_mandate_does_not_include_signed_evidence_reference",
          },
        ];
    const idempotencyKey = stableKey("realty_case_mandate_versions", workspaceId, [caseRecord.id, version]);
    return manifestRecord("realty_case_mandate_versions", workspaceId, [caseRecord.id, version], {
      operation: "append",
      match: { workspace_id: workspaceId, case_id: caseRecord.id, version_number: version },
      references: { case: caseReference(workspaceId, caseRecord.id) },
      importable: sourceGaps.length === 0,
      source_gaps: sourceGaps,
      data: {
        workspace_id: workspaceId,
        mandate_ref: mandate.ref,
        version_number: version,
        // Mandate versions are append-only. The case projection identifies the
        // current version, so an older row must not be retroactively mutated.
        status: "active",
        granted_by_ref: mandate.granted_by_ref,
        signed_at: mandate.signed_at,
        expires_at: mandate.expires_at,
        signed_evidence_ref: mandate.signed_evidence_ref,
        capabilities: mandate.capabilities,
        mandate_digest: digest(mandate),
        idempotency_key: idempotencyKey,
      },
    });
  });
}

function sortedCollections(collections) {
  return {
    realty_cases: [...collections.realty_cases].sort((left, right) => left.data.case_id.localeCompare(right.data.case_id)),
    realty_case_events: [...collections.realty_case_events].sort(
      (left, right) =>
        left.references.case.match.case_id.localeCompare(right.references.case.match.case_id) ||
        left.data.sequence - right.data.sequence,
    ),
    realty_case_mandate_versions: [...collections.realty_case_mandate_versions].sort(
      (left, right) =>
        left.match.case_id.localeCompare(right.match.case_id) || left.data.version_number - right.data.version_number,
    ),
  };
}

function recordsFrom(manifest, { importableOnly = false } = {}) {
  if (Array.isArray(manifest)) return manifest;
  if (!isRecord(manifest) || !isRecord(manifest.collections)) {
    throw new Error("Payload reconciliation input must be a manifest or record array");
  }
  return Object.entries(manifest.collections).flatMap(([collection, rows]) => {
    if (!Array.isArray(rows)) throw new Error(`Manifest collection ${collection} must be an array`);
    return rows
      .filter((row) => !importableOnly || row.importable !== false)
      .map((row) => ({ ...row, collection }));
  });
}

function projectedDigest(row) {
  const collection = requiredText(row.collection, "Manifest record collection", 80);
  return digest({ collection, match: row.match || {}, references: row.references || {}, data: row.data || {} });
}

function comparableRecords(manifest, options) {
  return recordsFrom(manifest, options).map((row) => ({
    collection: requiredText(row.collection, "Manifest record collection", 80),
    manifest_id: requiredText(row.manifest_id, "Manifest record id", 80),
    projection_digest: projectedDigest(row),
  }));
}

/**
 * Builds a deterministic, reference-only import plan. `references` are manifest
 * metadata: an importer resolves them to Payload relationship IDs before writing.
 */
export function buildRealtyCasePayloadManifest(events = [], { workspaceId } = {}) {
  const workspaceIdValue = requiredText(workspaceId, "workspaceId", 160);
  if (!Array.isArray(events)) throw new Error("Realty case events must be an array");
  events.forEach((event, index) => assertReferenceOnly(event, `events[${index}]`));
  const sourceIds = new Set();
  for (const event of events) {
    const id = requiredText(event?.id, "Realty case event id", 160);
    if (sourceIds.has(id)) throw new Error(`Realty case event id ${id} appears more than once`);
    sourceIds.add(id);
  }

  const cases = deriveRealtyCases(events).sort((left, right) => left.id.localeCompare(right.id));
  const collections = {
    realty_cases: cases.map((caseRecord) => projectCase(caseRecord, events, workspaceIdValue)),
    realty_case_events: projectEvents(events, workspaceIdValue),
    realty_case_mandate_versions: cases.flatMap((caseRecord) => projectMandates(caseRecord, events, workspaceIdValue)),
  };
  const orderedCollections = sortedCollections(collections);
  const rows = Object.values(orderedCollections).flat();
  const sourceGaps = rows.flatMap((row) => row.source_gaps || []);
  const sourceEventDigest = digest(events);
  const projectionDigest = digest({ workspace_id: workspaceIdValue, collections: orderedCollections, source_event_digest: sourceEventDigest });
  return {
    kind: "realty_case_payload_manifest",
    version: REALTY_CASE_PAYLOAD_MANIFEST_VERSION,
    workspace_id: workspaceIdValue,
    source: { event_count: events.length, event_digest: sourceEventDigest },
    collections: orderedCollections,
    reconciliation: {
      expected_records: rows.length,
      importable_records: rows.filter((row) => row.importable !== false).length,
      blocked_records: rows.filter((row) => row.importable === false).length,
      source_gaps: sourceGaps,
      ready_for_import: sourceGaps.length === 0,
      projection_digest: projectionDigest,
    },
  };
}

export function readRealtyCasePayloadManifest({
  filePath = DEFAULT_REALTY_CASE_LEDGER_PATH,
  workspaceId,
} = {}) {
  return buildRealtyCasePayloadManifest(readRealtyCaseEvents(filePath), { workspaceId });
}

/**
 * Compares an expected manifest with an importer snapshot (another manifest or a
 * flattened array of manifest records) without making a database call.
 */
export function detectRealtyCasePayloadDrift(expectedManifest, observedManifest) {
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
