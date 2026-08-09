// Hermes desktop bridge: lets the operator's own desktop AI subscription
// (Claude Desktop / Claude Code / Codex / ChatGPT) act as the Hermes drafting
// provider through MCP, instead of a hosted model endpoint. The framework
// stays authoritative: the same dispatch queue, the same fact-preserving
// validation, the same append-only ledgers and audit trail as the hosted
// worker — only the model call is replaced by a human-supervised AI session.
//
// PII boundary: the bridge introduces itself as a non-self-hosted provider
// (sensitive_data_allowed=false), so assertProviderMayReceiveDispatch refuses
// any dispatch row that is not classified as safe for hosted fallback. Lead
// replies and other sensitive drafts never flow through third-party AI.
import { DEFAULT_AUDIT_LOG_PATH, appendAuditLog, createAuditLogEntry } from "./audit-log.mjs";
import {
  assertProviderMayReceiveDispatch,
  providerRequestBody,
  readHermesDraftDispatch,
  taskFromHermesDraft,
} from "./hermes-draft-worker.mjs";
import { DEFAULT_TRANSLATION_LEDGER_PATH, appendTranslationTask } from "./translation-ledger.mjs";

export const DESKTOP_BRIDGE_PROVIDER = Object.freeze({
  mode: "desktop_subscription",
  model: "operator-desktop-ai",
  endpoint: null,
  toolCallParser: "hermes",
  sensitiveDataAllowed: false,
});

export const BRIDGE_GUARDRAILS = Object.freeze([
  "Drafts only: every output requires human review and approval in the admin workbench.",
  "Preserve property facts exactly: price, area, bedrooms, location, listing reference, source URL.",
  "Bulgarian is the source locale; drafts are never indexable or publishable from this bridge.",
  "Sensitive drafts (lead replies, raw contacts) are refused by the provider gate — do not work around it.",
]);

function eligibleRow(row) {
  try {
    assertProviderMayReceiveDispatch(row, DESKTOP_BRIDGE_PROVIDER);
    return true;
  } catch {
    return false;
  }
}

export function bridgeStatus({ dispatch = readHermesDraftDispatch() } = {}) {
  const eligible = dispatch.rows.filter(eligibleRow);
  return {
    provider: DESKTOP_BRIDGE_PROVIDER,
    guardrails: BRIDGE_GUARDRAILS,
    generated_at: dispatch.generated_at,
    summary: dispatch.summary,
    eligible_for_desktop: eligible.length,
    withheld_sensitive: dispatch.rows.length - eligible.length,
  };
}

export function bridgeNextTasks({ dispatch = readHermesDraftDispatch(), limit = 3, targetLocale } = {}) {
  const bounded = Math.max(1, Math.min(Number(limit) || 1, 10));
  const rows = dispatch.rows
    .filter((row) => (targetLocale ? row.target_locale === targetLocale : true))
    .filter(eligibleRow)
    .slice(0, bounded);
  return rows.map((row) => ({
    id: row.id,
    task_type: row.task_type,
    object_type: row.object_type,
    object_id: row.object_id,
    source_locale: row.source_locale,
    target_locale: row.target_locale,
    target_direction: row.target_direction,
    reviewer_role: row.reviewer_role,
    data_classification: row.data_classification,
    // The exact messages the hosted worker would send its model — parity by
    // construction, not by prompt-copying.
    messages: providerRequestBody(row, DESKTOP_BRIDGE_PROVIDER.model).messages,
    required_draft_shape: {
      title: "string",
      body: "string (must contain every property fact verbatim)",
      seo_title: "string",
      meta_description: "string",
      citations: "copy row citations unchanged",
    },
    citations: row.citations,
  }));
}

export function bridgeSubmitDraft({
  dispatch = readHermesDraftDispatch(),
  id,
  draft,
  model = DESKTOP_BRIDGE_PROVIDER.model,
  filePath = DEFAULT_TRANSLATION_LEDGER_PATH,
  auditPath,
  auditLogPath = DEFAULT_AUDIT_LOG_PATH,
  recordedAt = new Date().toISOString(),
} = {}) {
  if (!id || typeof id !== "string") throw new Error("A dispatch row id is required");
  if (!draft || typeof draft !== "object") throw new Error("A draft object is required");
  const row = dispatch.rows.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`Unknown dispatch row: ${id}`);
  assertProviderMayReceiveDispatch(row, DESKTOP_BRIDGE_PROVIDER);

  const task = taskFromHermesDraft(row, draft);
  appendTranslationTask(task, { filePath, auditPath, recordedAt });
  appendAuditLog(
    createAuditLogEntry(
      {
        action: "hermes_model_call",
        actor: "hermes_desktop_bridge",
        objectType: "translation_task",
        objectId: row.id,
        locale: row.target_locale,
        status: "persisted",
        metadata: {
          object_id: row.object_id,
          object_type: row.object_type,
          provider_mode: row.provider_mode,
          provider: DESKTOP_BRIDGE_PROVIDER.mode,
          model,
          prompt_version: row.prompt?.version || row.prompt?.role || "translation_draft",
          tool_call_parser: DESKTOP_BRIDGE_PROVIDER.toolCallParser,
          sensitive_data: false,
          result: "persisted",
          error: null,
        },
      },
      recordedAt,
    ),
    { filePath: auditLogPath },
  );
  return {
    persisted: {
      id: task.id,
      object_id: task.object_id,
      target_locale: task.target_locale,
      status: task.status,
      requires_human_approval: task.requires_human_approval,
      reviewer_role: task.reviewer_role,
      public_indexable: task.public_indexable,
    },
    next_step: `A ${task.reviewer_role} reviews and approves the draft in the admin translations workbench before anything publishes.`,
  };
}
