import {
  planOpenRealtyCase,
  planRealtyCaseAction,
} from "./realty-cases.mjs";
import {
  planOpenRealtyCaseCondition,
  planRealtyCaseConditionAction,
} from "./realty-case-conditions.mjs";
import { buildRealtyCasePayloadManifest } from "./realty-case-payload-reconciliation.mjs";
import { applyRealtyCasePayloadManifest } from "./realty-case-payload-projector.mjs";
import { buildRealtyCaseConditionPayloadManifest } from "./realty-case-condition-payload-reconciliation.mjs";
import { applyRealtyCaseConditionPayloadManifest } from "./realty-case-condition-payload-projector.mjs";

const MAX_AUTHORITY_ATTEMPTS = 3;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value, label, max = 240) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be ${max} characters or fewer`);
  return text;
}

function optionalText(value, label, max = 240) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return requiredText(value, label, max);
}

function timestamp(value, label) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return parsed.toISOString();
}

function relationshipId(value, label) {
  return requiredText(isRecord(value) ? value.id : value, label, 240);
}

function referencePayload(value, label) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function sourceMandate(value) {
  const mandate = referencePayload(value, "Payload case mandate");
  if (!Array.isArray(mandate.capabilities)) throw new Error("Payload mandate capabilities must be an array");
  return {
    ref: requiredText(mandate.ref, "Payload mandate ref", 240),
    granted_by_ref: requiredText(mandate.granted_by_ref, "Payload mandate granted_by_ref", 240),
    signed_at: timestamp(mandate.signed_at, "Payload mandate signed_at"),
    signed_evidence_ref: requiredText(mandate.signed_evidence_ref, "Payload mandate signed_evidence_ref", 240),
    expires_at: mandate.expires_at ? timestamp(mandate.expires_at, "Payload mandate expires_at") : null,
    capabilities: mandate.capabilities.map((capability) => requiredText(capability, "Payload mandate capability", 120)).sort(),
  };
}

function unavailableError(message) {
  const error = new Error(message);
  error.status = 503;
  return error;
}

function assertPayloadReader(payload) {
  if (!payload || typeof payload.find !== "function") throw new Error("Payload local API must provide find");
}

async function runtimePayload(payload) {
  try {
    if (payload) {
      assertPayloadReader(payload);
      return payload;
    }
    const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
    const runtime = await getPayload({ config: await payloadConfigModule.default });
    assertPayloadReader(runtime);
    return runtime;
  } catch {
    throw unavailableError("Payload authority runtime is unavailable");
  }
}

async function rowsFor(payload, collection, workspaceId) {
  const result = await payload.find({
    collection,
    depth: 0,
    overrideAccess: true,
    pagination: false,
    where: { workspace_id: { equals: workspaceId } },
  });
  if (!Array.isArray(result?.docs)) throw new Error(`Payload ${collection} query did not return documents`);
  return result.docs;
}

function compareCaseEvent(left, right) {
  return left.event.case_id.localeCompare(right.event.case_id) || left.sequence - right.sequence || left.event.id.localeCompare(right.event.id);
}

function compareConditionEvent(left, right) {
  return (
    left.event.recorded_at.localeCompare(right.event.recorded_at) ||
    left.event.case_id.localeCompare(right.event.case_id) ||
    left.event.condition_id.localeCompare(right.event.condition_id) ||
    left.sequence - right.sequence ||
    left.event.id.localeCompare(right.event.id)
  );
}

function sourceCaseEvents(caseDocuments, eventDocuments) {
  const caseIds = new Map(
    caseDocuments.map((document) => [relationshipId(document.id, "Payload case document id"), requiredText(document.case_id, "Payload case id", 160)]),
  );
  return eventDocuments
    .map((document) => {
      const caseId = caseIds.get(relationshipId(document.case, "Payload case event case relationship"));
      if (!caseId) throw new Error("Payload case event references an unknown case");
      const payload = referencePayload(document.reference_payload, "Payload case event reference payload");
      const workflowSnapshot = document.action === "case_opened"
        ? referencePayload(payload.workflow_snapshot, "Payload case opening workflow snapshot")
        : null;
      return {
        sequence: Number(document.sequence),
        event: {
          ...payload,
          ...(workflowSnapshot
            ? {
                mandate: sourceMandate(payload.mandate),
                workflow_phases: workflowSnapshot.workflow_phases,
                workflow_steps: workflowSnapshot.workflow_steps,
              }
            : {}),
          id: requiredText(document.event_id, "Payload case event id", 600),
          case_id: caseId,
          action: requiredText(document.action, "Payload case event action", 80),
          step_key: optionalText(document.step_key, "Payload case event step key", 160),
          actor: requiredText(document.actor_ref, "Payload case event actor", 160),
          executor_kind: requiredText(document.executor_kind, "Payload case event executor kind", 20),
          assurance_ref: optionalText(document.assurance_ref, "Payload case event assurance ref", 240),
          authority_ref: optionalText(document.authority_ref, "Payload case event authority ref", 240),
          reason_code: optionalText(document.reason_code, "Payload case event reason code", 160),
          recorded_at: timestamp(document.recorded_at, "Payload case event recorded_at"),
        },
      };
    })
    .sort(compareCaseEvent)
    .map((row) => row.event);
}

function sourceConditionEvents(caseDocuments, conditionDocuments, eventDocuments) {
  const caseIds = new Map(
    caseDocuments.map((document) => [relationshipId(document.id, "Payload case document id"), requiredText(document.case_id, "Payload case id", 160)]),
  );
  const conditions = new Map(
    conditionDocuments.map((document) => {
      const caseId = caseIds.get(relationshipId(document.case, "Payload condition case relationship"));
      if (!caseId) throw new Error("Payload condition references an unknown case");
      return [relationshipId(document.id, "Payload condition document id"), { case_id: caseId, condition_id: requiredText(document.condition_id, "Payload condition id", 160) }];
    }),
  );
  return eventDocuments
    .map((document) => {
      const condition = conditions.get(relationshipId(document.condition, "Payload condition event condition relationship"));
      if (!condition) throw new Error("Payload condition event references an unknown condition");
      const eventCaseId = caseIds.get(relationshipId(document.case, "Payload condition event case relationship"));
      if (eventCaseId !== condition.case_id) throw new Error("Payload condition event case relationship does not match its condition");
      const payload = referencePayload(document.reference_payload, "Payload condition event reference payload");
      return {
        sequence: Number(document.sequence),
        event: {
          ...payload,
          id: requiredText(document.event_id, "Payload condition event id", 600),
          case_id: condition.case_id,
          condition_id: condition.condition_id,
          action: requiredText(document.action, "Payload condition event action", 80),
          actor: requiredText(document.actor_ref, "Payload condition event actor", 160),
          executor_kind: requiredText(document.executor_kind, "Payload condition event executor kind", 20),
          ...(document.assurance_ref
            ? { assurance_ref: optionalText(document.assurance_ref, "Payload condition event assurance ref", 240) }
            : {}),
          recorded_at: timestamp(document.recorded_at, "Payload condition event recorded_at"),
        },
      };
    })
    .sort(compareConditionEvent)
    .map((row) => row.event);
}

async function readPayloadHistory({ payload, workspaceId, includeConditions = false } = {}) {
  const workspaceIdValue = requiredText(workspaceId, "MS_REALTY_WORKSPACE_ID", 160);
  const runtime = await runtimePayload(payload);
  try {
    const [caseDocuments, caseEventDocuments, conditionDocuments, conditionEventDocuments] = await Promise.all([
      rowsFor(runtime, "realty_cases", workspaceIdValue),
      rowsFor(runtime, "realty_case_events", workspaceIdValue),
      includeConditions ? rowsFor(runtime, "realty_case_conditions", workspaceIdValue) : Promise.resolve([]),
      includeConditions ? rowsFor(runtime, "realty_case_condition_events", workspaceIdValue) : Promise.resolve([]),
    ]);
    return {
      payload: runtime,
      caseEvents: sourceCaseEvents(caseDocuments, caseEventDocuments),
      conditionEvents: includeConditions ? sourceConditionEvents(caseDocuments, conditionDocuments, conditionEventDocuments) : [],
    };
  } catch (error) {
    if (error?.status === 503) throw error;
    throw unavailableError("Payload authority history is unavailable");
  }
}

export function realtyCasePayloadAuthorityConfigFromEnv(env = process.env) {
  return { realtyCasePayloadAuthorityEnabled: env.MS_REALTY_CASE_PAYLOAD_AUTHORITY_ENABLED === "true" };
}

export function assertRealtyCasePayloadAuthorityConfig({
  realtyCasePayloadAuthorityEnabled = false,
  realtyCaseRequestProjectionEnabled = false,
  realtyCaseWorkspaceId,
  realtyCasePayload,
  realtyCasePayloadRuntimeConfigured = false,
} = {}) {
  if (!realtyCasePayloadAuthorityEnabled) return false;
  if (realtyCaseRequestProjectionEnabled) {
    throw unavailableError("Payload case authority cannot run with request-time case projection");
  }
  if (!String(realtyCaseWorkspaceId || "").trim()) {
    throw unavailableError("Payload case authority requires MS_REALTY_WORKSPACE_ID");
  }
  if (!realtyCasePayload && !realtyCasePayloadRuntimeConfigured) {
    throw unavailableError("Payload case authority requires PAYLOAD_SECRET and DATABASE_URL");
  }
  return true;
}

export function assertRealtyCasePayloadAuthorityInput(input, { action = false, conditionAction = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  if (Object.hasOwn(input, "workspaceId") || Object.hasOwn(input, "workspace_id")) {
    throw new Error("Payload case authority does not accept a client workspace scope");
  }
  if (action && !String(input.id || "").trim()) {
    throw new Error("Payload case authority actions require a stable id");
  }
  if (conditionAction && !String(input.eventId || input.event_id || input.id || "").trim()) {
    throw new Error("Payload case authority condition actions require a stable eventId or id");
  }
}

export function realtyCasePayloadAuthorityFailure() {
  return { kind: "realty_case_authority_unavailable", source_recorded: false };
}

export async function readRealtyCaseEventsFromPayload({ payload, workspaceId } = {}) {
  return (await readPayloadHistory({ payload, workspaceId })).caseEvents;
}

export async function readRealtyCaseConditionEventsFromPayload({ payload, workspaceId } = {}) {
  return (await readPayloadHistory({ payload, workspaceId, includeConditions: true })).conditionEvents;
}

export async function readRealtyCasePayloadAuthorityHistory({ payload, workspaceId } = {}) {
  const history = await readPayloadHistory({ payload, workspaceId, includeConditions: true });
  return { caseEvents: history.caseEvents, conditionEvents: history.conditionEvents };
}

function retryableAuthorityError(error) {
  return /could not serialize|serialization failure|deadlock detected|duplicate key|ahead of the source manifest/i.test(String(error?.message || error));
}

async function persistCaseMutation(input, { payload, workspaceId, recordedAt, planner } = {}) {
  const workspaceIdValue = requiredText(workspaceId, "MS_REALTY_WORKSPACE_ID", 160);
  const runtime = await runtimePayload(payload);
  for (let attempt = 1; attempt <= MAX_AUTHORITY_ATTEMPTS; attempt += 1) {
    const history = await readPayloadHistory({ payload: runtime, workspaceId: workspaceIdValue });
    const result = planner(input, { events: history.caseEvents, recordedAt });
    if (result.idempotent) return result;
    try {
      const manifest = buildRealtyCasePayloadManifest([...history.caseEvents, result.event], { workspaceId: workspaceIdValue });
      await applyRealtyCasePayloadManifest(manifest, { payload: runtime, maxAttempts: 1 });
      return result;
    } catch (error) {
      if (attempt < MAX_AUTHORITY_ATTEMPTS && retryableAuthorityError(error)) continue;
      throw unavailableError("Payload case authority could not record the mutation");
    }
  }
  throw unavailableError("Payload case authority exhausted mutation retries");
}

async function persistConditionMutation(input, { payload, workspaceId, recordedAt, planner } = {}) {
  const workspaceIdValue = requiredText(workspaceId, "MS_REALTY_WORKSPACE_ID", 160);
  const runtime = await runtimePayload(payload);
  for (let attempt = 1; attempt <= MAX_AUTHORITY_ATTEMPTS; attempt += 1) {
    const history = await readPayloadHistory({ payload: runtime, workspaceId: workspaceIdValue, includeConditions: true });
    const result = planner(input, {
      caseEvents: history.caseEvents,
      conditionEvents: history.conditionEvents,
      recordedAt,
    });
    if (result.idempotent) return result;
    try {
      const manifest = buildRealtyCaseConditionPayloadManifest([...history.conditionEvents, result.event], {
        workspaceId: workspaceIdValue,
      });
      await applyRealtyCaseConditionPayloadManifest(manifest, { payload: runtime, maxAttempts: 1 });
      return result;
    } catch (error) {
      if (attempt < MAX_AUTHORITY_ATTEMPTS && retryableAuthorityError(error)) continue;
      throw unavailableError("Payload case authority could not record the condition mutation");
    }
  }
  throw unavailableError("Payload case authority exhausted mutation retries");
}

export async function openRealtyCaseInPayload(input, options = {}) {
  assertRealtyCasePayloadAuthorityInput(input);
  return persistCaseMutation(input, { ...options, planner: planOpenRealtyCase });
}

export async function appendRealtyCaseActionInPayload(input, options = {}) {
  assertRealtyCasePayloadAuthorityInput(input, { action: true });
  return persistCaseMutation(input, { ...options, planner: planRealtyCaseAction });
}

export async function openRealtyCaseConditionInPayload(input, options = {}) {
  assertRealtyCasePayloadAuthorityInput(input);
  return persistConditionMutation(input, { ...options, planner: planOpenRealtyCaseCondition });
}

export async function appendRealtyCaseConditionActionInPayload(input, options = {}) {
  assertRealtyCasePayloadAuthorityInput(input, { conditionAction: true });
  return persistConditionMutation(input, { ...options, planner: planRealtyCaseConditionAction });
}
