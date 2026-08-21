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
import { DEFAULT_AUDIT_LOG_PATH } from "./audit-log.mjs";
import {
  DEFAULT_HERMES_DRAFT_WORKER_REPORT_PATH,
  assertProviderMayReceiveDispatch,
  providerRequestBody,
  readHermesDraftDispatch,
  runHermesDraftWorker,
  writeHermesDraftWorkerReport,
} from "./hermes-draft-worker.mjs";
import { DEFAULT_TRANSLATION_LEDGER_PATH } from "./translation-ledger.mjs";

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

export async function bridgeSubmitDraft({
  dispatch = readHermesDraftDispatch(),
  id,
  draft,
  model = DESKTOP_BRIDGE_PROVIDER.model,
  filePath = DEFAULT_TRANSLATION_LEDGER_PATH,
  auditPath,
  auditLogPath = DEFAULT_AUDIT_LOG_PATH,
  reportPath = process.env.MS_REALTY_HERMES_WORKER_REPORT_PATH || DEFAULT_HERMES_DRAFT_WORKER_REPORT_PATH,
  recordedAt = new Date().toISOString(),
} = {}) {
  if (!id || typeof id !== "string") throw new Error("A dispatch row id is required");
  if (!draft || typeof draft !== "object") throw new Error("A draft object is required");
  const row = dispatch.rows.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`Unknown dispatch row: ${id}`);
  assertProviderMayReceiveDispatch(row, DESKTOP_BRIDGE_PROVIDER);

  const report = await runHermesDraftWorker({
    dispatch: { ...dispatch, rows: [row] },
    provider: async () => draft,
    providerMetadata: { ...DESKTOP_BRIDGE_PROVIDER, model },
    filePath,
    auditPath,
    auditLogPath,
    limit: 1,
    recordedAt,
    generatedAt: recordedAt,
  });
  if (!report.persisted[0]) throw new Error(report.rejected[0]?.error || "Desktop draft was rejected");
  writeHermesDraftWorkerReport(report, reportPath);

  return {
    persisted: {
      ...report.persisted[0],
      object_id: row.object_id,
      requires_human_approval: true,
      reviewer_role: row.reviewer_role,
    },
    report: {
      generated_at: report.generated_at,
      path: reportPath,
      provider: report.provider,
    },
    next_step: `A ${row.reviewer_role} reviews and approves the draft in the admin translations workbench before anything publishes.`,
  };
}
