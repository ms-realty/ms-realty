import { renderAdminHermesPayload } from "./admin-payloads.mjs";
import { hermesReplyAvailability } from "./hermes-availability.mjs";
import { probeHermesAgentRuntime } from "./hermes-agent-runtime.mjs";
import { bridgeNextTasks, bridgeStatus } from "./hermes-desktop-bridge.mjs";
import { buildHermesDraftDispatch } from "./hermes-draft-dispatch.mjs";
import { projectListingDraftSeed } from "./listing-draft-service.mjs";
import { HERMES_TOOL_COVERAGE } from "./owner-operator-catalog.mjs";

function boundedFetch(fetchImpl, timeoutMs) {
  if (typeof fetchImpl !== "function") return fetchImpl;
  return (url, init = {}) =>
    fetchImpl(url, {
      ...init,
      signal: init.signal || globalThis.AbortSignal?.timeout?.(timeoutMs),
    });
}

function queueUnavailable() {
  return {
    status: "blocked",
    reason: "task_source_unavailable",
    summary: { eligible_tasks: 0, batch_size: 0, remaining_after_batch: 0, by_target_locale: {} },
    eligible_for_desktop: 0,
    withheld_sensitive: 0,
    rows: [],
  };
}

function taskSummary(task, dispatchRow) {
  return {
    id: task.id,
    task_type: task.task_type,
    object_type: task.object_type,
    object_id: task.object_id,
    source_locale: task.source_locale,
    target_locale: task.target_locale,
    target_direction: task.target_direction,
    reviewer_role: task.reviewer_role,
    data_classification: task.data_classification,
    admin_path: dispatchRow?.admin_path || "/admin/translations",
    requires_human_approval: true,
    can_publish: false,
  };
}

export async function buildAdminHermesPayload({
  registry,
  requestedLocale = "en",
  seed,
  operator = null,
  hermesEnv = process.env,
  listingEnv = hermesEnv,
  payload = null,
  requirePayload = false,
  provider = null,
  fetchImpl = globalThis.fetch,
  generatedAt = new Date().toISOString(),
  probeTimeoutMs = 5_000,
} = {}) {
  const availability = hermesReplyAvailability({ env: hermesEnv, provider, fetchImpl });
  const runtime = await probeHermesAgentRuntime({
    endpoint: hermesEnv.HERMES_CHAT_COMPLETIONS_URL,
    apiKey: hermesEnv.HERMES_API_KEY,
    fetchImpl: boundedFetch(fetchImpl, probeTimeoutMs),
    generatedAt,
    evidenceScope:
      hermesEnv.MS_REALTY_HERMES_AGENT_EVIDENCE_SCOPE ||
      (hermesEnv.NODE_ENV === "production" ? "live" : "local"),
  });

  let bridge = null;
  let queue = queueUnavailable();
  try {
    const projectedSeed = await projectListingDraftSeed(seed, {
      env: listingEnv,
      payload,
      requirePayload,
    });
    const dispatch = buildHermesDraftDispatch({ registry, seed: projectedSeed, generatedAt });
    bridge = bridgeStatus({ dispatch });
    const dispatchRows = new Map(dispatch.rows.map((row) => [row.id, row]));
    queue = {
      status: "ready",
      summary: dispatch.summary,
      eligible_for_desktop: bridge.eligible_for_desktop,
      withheld_sensitive: bridge.withheld_sensitive,
      rows: bridgeNextTasks({ dispatch, limit: 10 }).map((task) => taskSummary(task, dispatchRows.get(task.id))),
    };
  } catch {
    // The authenticated page exposes a fixed recovery code, never a database,
    // model, prompt, or filesystem exception.
  }

  return renderAdminHermesPayload(registry, requestedLocale, {
    availability,
    bridge,
    generatedAt,
    operator,
    queue,
    runtime,
    runtimeDataMode: requirePayload ? "durable_only" : "file_backed",
    tools: HERMES_TOOL_COVERAGE,
  });
}
