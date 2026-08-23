import { fromRoot } from "./paths.mjs";
import { createLedgerStore } from "./sqlite-ledger.mjs";

export const DEFAULT_AUDIT_LOG_PATH = fromRoot("production", "data", "audit-log.jsonl");

const store = createLedgerStore({
  name: "audit_log",
  columns: ["recorded_at", "actor", "action", "object_type", "object_id", "locale", "status"],
  indexes: ["actor", "action"],
});

const ADMIN_ACTIONS = new Set([
  "account_created",
  "admin_session_revoked",
  "audit_log_pruned",
  "broker_contact_approved",
  "contact_linked",
  "consent_withdrawn",
  "deal_closed",
  "deployable_redirects_exported",
  "document_checklist_updated",
  "hermes_model_call",
  "launch_readiness_exported",
  "listing_edited",
  "listing_publication_cancelled",
  "listing_publication_executed",
  "listing_publication_scheduled",
  "listing_quality_imported",
  "listing_slug_changed",
  "media_reviewed",
  "lead_assigned",
  "lead_created",
  "lead_pipeline_outcome_recorded",
  "lead_snoozed",
  "lead_unsnoozed",
  "live_service_provisioning_report_imported",
  "live_service_report_imported",
  "locale_created",
  "operator_view_deleted",
  "operator_view_saved",
  "payload_runtime_report_imported",
  "production_recovery_report_imported",
  "provider_calendar_sync_failed",
  "provider_calendar_synced",
  "provider_connected",
  "provider_connection_failed",
  "provider_reply_sent",
  "public_request_outcome_recorded",
  "redirect_approval_created",
  "redirect_approvals_imported",
  "reply_approved",
  "saved_search_alerts_queued",
  "saved_search_channel_updated",
  "saved_search_deleted",
  "saved_search_frequency_updated",
  "saved_search_paused",
  "saved_search_resumed",
  "reply_delivery_recorded",
  "realty_case_action_recorded",
  "realty_case_condition_action_recorded",
  "realty_case_condition_opened",
  "realty_case_opened",
  "seller_pipeline_outcome_recorded",
  "seo_evidence_imported",
  "tour_approved",
  "translation_drafted",
  "translation_approved",
  "translation_published",
  "two_factor_activated",
  "two_factor_disabled",
  "two_factor_enrolment_started",
  "two_factor_verified",
  "viewing_booked",
  "viewing_follow_up_recorded",
  "workspace_export_downloaded",
  "workspace_export_requested",
  "workspace_settings_updated",
]);

const RAW_PRIVATE_FIELDS = new Set(["body", "contact", "email", "message", "phone", "prompt", "reviewedReply", "sourceContent", "whatsapp"]);

function containsRawPrivateField(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsRawPrivateField);
  return Object.entries(value).some(([key, nested]) => RAW_PRIVATE_FIELDS.has(key) || containsRawPrivateField(nested));
}

function boundedMetadata(metadata = {}) {
  const text = JSON.stringify(metadata || {});
  if (text.length > 2000) throw new Error("Audit metadata is too large");
  return metadata || {};
}

export function resetAuditLog(filePath = DEFAULT_AUDIT_LOG_PATH) {
  store.resetLedger(filePath);
}

export function createAuditLogEntry(input, recordedAt = new Date().toISOString()) {
  const action = String(input.action || "").trim();
  if (!ADMIN_ACTIONS.has(action)) throw new Error("Unknown audit action");
  const objectType = String(input.object_type || input.objectType || "").trim();
  const objectId = String(input.object_id || input.objectId || "").trim();
  if (!objectType || !objectId) throw new Error("Audit object type and id are required");
  const metadata = boundedMetadata(input.metadata || {});
  if (containsRawPrivateField(metadata)) throw new Error("Audit metadata must not store raw private fields");
  return {
    recorded_at: recordedAt,
    actor: String(input.actor || "admin").trim(),
    action,
    object_type: objectType,
    object_id: objectId,
    locale: input.locale ? String(input.locale).trim() : null,
    status: String(input.status || "recorded").trim(),
    metadata,
  };
}

export function appendAuditLog(entry, { filePath = DEFAULT_AUDIT_LOG_PATH } = {}) {
  store.appendRow(filePath, entry);
  return entry;
}

export function readAuditLog(filePath = DEFAULT_AUDIT_LOG_PATH) {
  return store.readRows(filePath);
}

// Rewrites the ledger with exactly `rows`. The audit log is append-only for
// every runtime path; this exists only for the explicit retention maintenance
// command in production/scripts/run-audit-retention.mjs, which takes a backup
// first and refuses to drop any row a launch-evidence or approval artifact
// still references.
export function replaceAuditLog(rows, { filePath = DEFAULT_AUDIT_LOG_PATH } = {}) {
  if (!Array.isArray(rows)) throw new Error("Audit log replacement requires an array of rows");
  if (rows.length) assertAuditLog(rows);
  store.resetLedger(filePath);
  for (const row of rows) store.appendRow(filePath, row);
  return rows.length;
}

export function assertAuditLog(rows) {
  if (!rows.length) throw new Error("Audit log must contain at least one row");
  for (const row of rows) {
    if (!ADMIN_ACTIONS.has(row.action) || !row.actor || !row.object_type || !row.object_id || !row.recorded_at) {
      throw new Error("Audit row is missing routing data");
    }
    if (containsRawPrivateField(row)) throw new Error("Audit row must not store raw private fields");
  }
  return true;
}
