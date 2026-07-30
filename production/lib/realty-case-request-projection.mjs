import { readRealtyCaseEvents } from "./realty-cases.mjs";
import { buildRealtyCasePayloadManifest } from "./realty-case-payload-reconciliation.mjs";
import { applyRealtyCasePayloadManifest } from "./realty-case-payload-projector.mjs";
import { readRealtyCaseConditionEvents } from "./realty-case-conditions.mjs";
import { buildRealtyCaseConditionPayloadManifest } from "./realty-case-condition-payload-reconciliation.mjs";
import { applyRealtyCaseConditionPayloadManifest } from "./realty-case-condition-payload-projector.mjs";

function requiredText(value, label, max = 160) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be ${max} characters or fewer`);
  return text;
}

function unavailableError(message) {
  const error = new Error(message);
  error.status = 503;
  return error;
}

export function realtyCaseRequestProjectionConfigFromEnv(env = process.env) {
  return {
    realtyCaseRequestProjectionEnabled: env.MS_REALTY_CASE_REQUEST_PROJECTION_ENABLED === "true",
    realtyCaseWorkspaceId: String(env.MS_REALTY_WORKSPACE_ID || "").trim(),
    realtyCasePayloadRuntimeConfigured: Boolean(String(env.PAYLOAD_SECRET || "").trim() && String(env.DATABASE_URL || "").trim()),
  };
}

export function assertRealtyCaseRequestProjectionConfig({
  realtyCaseRequestProjectionEnabled = false,
  realtyCaseWorkspaceId,
  realtyCasePayloadProjector,
  realtyCasePayloadRuntimeConfigured = false,
} = {}) {
  if (!realtyCaseRequestProjectionEnabled) return false;
  if (!String(realtyCaseWorkspaceId || "").trim()) {
    throw unavailableError("Request-time case projection requires MS_REALTY_WORKSPACE_ID");
  }
  if (typeof realtyCasePayloadProjector !== "function" && !realtyCasePayloadRuntimeConfigured) {
    throw unavailableError("Request-time case projection requires PAYLOAD_SECRET and DATABASE_URL");
  }
  return true;
}

export function assertRealtyCaseRequestProjectionInput(input, { action = false, conditionAction = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  if (Object.hasOwn(input, "workspaceId") || Object.hasOwn(input, "workspace_id")) {
    throw new Error("Realty case request projection does not accept a client workspace scope");
  }
  if (conditionAction && !String(input.eventId || input.event_id || input.id || "").trim()) {
    throw new Error("Request-time realty case condition actions require a stable eventId or id");
  }
  if (action && !String(input.id || "").trim()) {
    throw new Error("Request-time realty case actions require a stable id");
  }
}

export function realtyCaseRequestProjectionFailure(result) {
  const failure = {
    kind: "realty_case_projection_unavailable",
    source_recorded: Boolean(result),
  };
  if (!result) return failure;
  const caseId = result.case?.id || result.condition?.case_id;
  const conditionId = result.condition?.id;
  return {
    ...failure,
    case_id: requiredText(caseId, "Realty case id"),
    event_id: requiredText(result.event?.id, "Realty case event id", 600),
    ...(conditionId ? { condition_id: requiredText(conditionId, "Realty case condition id") } : {}),
  };
}

export function buildRealtyCaseRequestProjectionManifest({ caseId, filePath, workspaceId } = {}) {
  const caseIdValue = requiredText(caseId, "Realty case id");
  const workspaceIdValue = requiredText(workspaceId, "MS_REALTY_WORKSPACE_ID");
  const events = readRealtyCaseEvents(filePath || undefined).filter((event) => event.case_id === caseIdValue);
  if (!events.length) throw new Error(`Realty case ${caseIdValue} has no ledger events to project`);
  return buildRealtyCasePayloadManifest(events, { workspaceId: workspaceIdValue });
}

export function buildRealtyCaseConditionRequestProjectionManifest({ caseId, filePath, workspaceId } = {}) {
  const caseIdValue = requiredText(caseId, "Realty case id");
  const workspaceIdValue = requiredText(workspaceId, "MS_REALTY_WORKSPACE_ID");
  const events = readRealtyCaseConditionEvents(filePath || undefined).filter((event) => event.case_id === caseIdValue);
  if (!events.length) throw new Error(`Realty case ${caseIdValue} has no condition ledger events to project`);
  return buildRealtyCaseConditionPayloadManifest(events, { workspaceId: workspaceIdValue });
}

async function applyWithPayloadRuntime(manifest) {
  const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
  const payload = await getPayload({ config: await payloadConfigModule.default });
  // Request routes reuse Payload's process-local connection pool; destroying it here would tear it down after every write.
  return applyRealtyCasePayloadManifest(manifest, { payload });
}

async function applyConditionWithPayloadRuntime(manifest) {
  const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
  const payload = await getPayload({ config: await payloadConfigModule.default });
  // Request routes reuse Payload's process-local connection pool; destroying it here would tear it down after every write.
  return applyRealtyCaseConditionPayloadManifest(manifest, { payload });
}

/** Projects one already-appended case event sequence; the local ledger remains the retry source. */
export async function projectRealtyCaseRequest({ caseId, eventId, filePath, workspaceId, projector } = {}) {
  const caseIdValue = requiredText(caseId, "Realty case id");
  const eventIdValue = requiredText(eventId, "Realty case event id");
  const workspaceIdValue = requiredText(workspaceId, "MS_REALTY_WORKSPACE_ID");
  const manifest = buildRealtyCaseRequestProjectionManifest({
    caseId: caseIdValue,
    filePath,
    workspaceId: workspaceIdValue,
  });
  const apply = typeof projector === "function" ? projector : ({ manifest: currentManifest }) => applyWithPayloadRuntime(currentManifest);
  await apply({ caseId: caseIdValue, eventId: eventIdValue, manifest, workspaceId: workspaceIdValue });
  return { status: "projected", case_id: caseIdValue, event_id: eventIdValue, workspace_id: workspaceIdValue };
}

/** Projects all already-appended condition events for one case; the local ledger remains the retry source. */
export async function projectRealtyCaseConditionRequest({ caseId, eventId, filePath, workspaceId, projector } = {}) {
  const caseIdValue = requiredText(caseId, "Realty case id");
  const eventIdValue = requiredText(eventId, "Realty case condition event id", 600);
  const workspaceIdValue = requiredText(workspaceId, "MS_REALTY_WORKSPACE_ID");
  const manifest = buildRealtyCaseConditionRequestProjectionManifest({
    caseId: caseIdValue,
    filePath,
    workspaceId: workspaceIdValue,
  });
  const apply = typeof projector === "function" ? projector : ({ manifest: currentManifest }) => applyConditionWithPayloadRuntime(currentManifest);
  await apply({ caseId: caseIdValue, eventId: eventIdValue, manifest, workspaceId: workspaceIdValue });
  return { status: "projected", case_id: caseIdValue, event_id: eventIdValue, workspace_id: workspaceIdValue };
}
