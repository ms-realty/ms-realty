import { readRealtyCaseEvents } from "./realty-cases.mjs";
import { buildRealtyCasePayloadManifest } from "./realty-case-payload-reconciliation.mjs";
import { applyRealtyCasePayloadManifest } from "./realty-case-payload-projector.mjs";

function requiredText(value, label, max = 160) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be ${max} characters or fewer`);
  return text;
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
  requiredText(realtyCaseWorkspaceId, "MS_REALTY_WORKSPACE_ID");
  if (typeof realtyCasePayloadProjector !== "function" && !realtyCasePayloadRuntimeConfigured) {
    throw new Error("Request-time case projection requires PAYLOAD_SECRET and DATABASE_URL");
  }
  return true;
}

export function assertRealtyCaseRequestProjectionInput(input, { action = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  if (Object.hasOwn(input, "workspaceId") || Object.hasOwn(input, "workspace_id")) {
    throw new Error("Realty case request projection does not accept a client workspace scope");
  }
  if (action && !String(input.id || "").trim()) {
    throw new Error("Request-time realty case actions require a stable id");
  }
}

export function realtyCaseRequestProjectionFailure(result) {
  return {
    kind: "realty_case_projection_unavailable",
    source_recorded: true,
    case_id: requiredText(result?.case?.id, "Realty case id"),
    event_id: requiredText(result?.event?.id, "Realty case event id"),
  };
}

export function buildRealtyCaseRequestProjectionManifest({ caseId, filePath, workspaceId } = {}) {
  const caseIdValue = requiredText(caseId, "Realty case id");
  const workspaceIdValue = requiredText(workspaceId, "MS_REALTY_WORKSPACE_ID");
  const events = readRealtyCaseEvents(filePath || undefined).filter((event) => event.case_id === caseIdValue);
  if (!events.length) throw new Error(`Realty case ${caseIdValue} has no ledger events to project`);
  return buildRealtyCasePayloadManifest(events, { workspaceId: workspaceIdValue });
}

async function applyWithPayloadRuntime(manifest) {
  const [{ getPayload }, payloadConfigModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
  const payload = await getPayload({ config: await payloadConfigModule.default });
  // Request routes reuse Payload's process-local connection pool; destroying it here would tear it down after every write.
  return applyRealtyCasePayloadManifest(manifest, { payload });
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
