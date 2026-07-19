import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_AUDIT_LOG_PATH = fromRoot("production", "data", "audit-log.jsonl");

const ADMIN_ACTIONS = new Set([
  "account_created",
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
  "live_service_provisioning_report_imported",
  "live_service_report_imported",
  "locale_created",
  "payload_runtime_report_imported",
  "public_request_outcome_recorded",
  "redirect_approval_created",
  "redirect_approvals_imported",
  "reply_approved",
  "reply_delivery_recorded",
  "seller_pipeline_outcome_recorded",
  "seo_evidence_imported",
  "tour_approved",
  "translation_drafted",
  "translation_approved",
  "translation_published",
  "viewing_booked",
  "viewing_follow_up_recorded",
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
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
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
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`);
  return entry;
}

export function readAuditLog(filePath = DEFAULT_AUDIT_LOG_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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
