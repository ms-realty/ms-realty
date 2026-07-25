import crypto from "node:crypto";
import { fromRoot } from "./paths.mjs";
import { createLedgerStore } from "./sqlite-ledger.mjs";

// Lead ledger: SQLite-backed append-only store with a JSONL audit mirror.
// Storage mechanics live in sqlite-ledger.mjs; this module keeps the lead
// contract (row shape, fingerprinting, duplicate detection, SLA tasks).

export const DEFAULT_LEAD_LEDGER_PATH = fromRoot("production", "data", "lead-ledger.jsonl");

const store = createLedgerStore({
  name: "leads",
  columns: [
    "received_at",
    "lead_id",
    "source",
    "intent",
    "lead_type",
    "original_language",
    "admin_locale",
    "assigned_broker",
    "contact_fingerprint",
    "duplicate_status",
    "possible_duplicate_of",
    "sla_due_at",
  ],
  indexes: ["contact_fingerprint", "sla_due_at"],
});

export const sqlitePathFor = store.sqlitePathFor;

export function resetLeadLedger(filePath = DEFAULT_LEAD_LEDGER_PATH) {
  store.resetLedger(filePath);
}

function minutesAfter(isoString, minutes) {
  const time = Date.parse(isoString);
  if (!Number.isFinite(time)) throw new Error("receivedAt must be an ISO timestamp");
  return new Date(time + minutes * 60 * 1000).toISOString();
}

function normalizeContactValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function contactFingerprint(contact = {}) {
  const email = normalizeContactValue(contact.email);
  const phone = normalizeContactValue(contact.phone || contact.whatsapp || contact.viber).replace(/[^\d+]/g, "");
  const key = email ? `email:${email}` : phone ? `phone:${phone}` : "";
  return key ? crypto.createHash("sha256").update(key).digest("hex") : null;
}

function optionalMessage(value) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 2000) : null;
}

export function appendLead(
  lead,
  { filePath = DEFAULT_LEAD_LEDGER_PATH, receivedAt = new Date().toISOString(), slaMinutes = 15, escalationMinutes = 60 } = {},
) {
  const slaDueAt = minutesAfter(receivedAt, slaMinutes);
  const contact_fingerprint = contactFingerprint(lead.lead?.contact);
  const possibleDuplicate = contact_fingerprint ? store.firstRowWhere(filePath, "contact_fingerprint", contact_fingerprint) : null;
  const messageOriginal = optionalMessage(lead.message_original || lead.message || lead.lead?.message);
  const row = {
    received_at: receivedAt,
    id: lead.id,
    lead_id: lead.lead?.id,
    source: lead.lead?.source,
    intent: lead.lead?.intent || null,
    lead_type: lead.lead?.leadType,
    listing_reference: lead.lead?.listingReference || null,
    property: lead.lead?.property || {},
    request_details: lead.lead?.request_details || {},
    requirements: lead.lead?.requirements || {},
    intake_completion: lead.lead?.intake || lead.intake || { complete: false, missing_fields: [], captured_fields: [] },
    original_language: lead.original_language,
    admin_locale: lead.admin_locale,
    message_original: messageOriginal,
    show_original_available: Boolean(messageOriginal),
    contact_preference: lead.contact_preference,
    broker_approval_required: lead.hermes_reply_draft?.broker_approval_required === true,
    confirmation_status: lead.confirmation?.status || null,
    confirmation_message_key: lead.confirmation?.message_key || null,
    assigned_broker: lead.broker_assignment?.broker_id || null,
    assignment_method: lead.broker_assignment?.method || null,
    contact_fingerprint,
    duplicate_status: contact_fingerprint ? (possibleDuplicate ? "possible_duplicate" : "new_contact") : "no_contact_key",
    possible_duplicate_of: possibleDuplicate?.lead_id || null,
    sla_due_at: slaDueAt,
    manager_escalation_due_at: minutesAfter(receivedAt, escalationMinutes),
    follow_up_task: {
      id: `sla-${lead.lead?.id || lead.id}`,
      status: "open",
      owner: "broker_assignment",
      due_at: slaDueAt,
      action: "broker_response_required",
    },
    qualification_task: {
      id: `intake-${lead.lead?.id || lead.id}`,
      status: (lead.lead?.intake || lead.intake)?.complete === true ? "complete" : "open",
      owner: lead.broker_assignment?.broker_id || "broker_assignment",
      action: "complete_intake_requirements",
      missing_fields: (lead.lead?.intake || lead.intake)?.missing_fields || [],
    },
  };
  store.appendRow(filePath, row);
  return row;
}

export function readLeadLedger(filePath = DEFAULT_LEAD_LEDGER_PATH) {
  return store.readRows(filePath);
}

// Replaces the ledger at filePath with the rows from sourcePath (JSONL) and
// returns the imported row count. This is the JSONL -> SQLite migration path.
export function importLeadLedgerJsonl(sourcePath, filePath = DEFAULT_LEAD_LEDGER_PATH) {
  return store.importJsonl(sourcePath, filePath);
}

// Writes the current ledger content as JSONL (audit export / backup).
export function exportLeadLedgerJsonl(filePath = DEFAULT_LEAD_LEDGER_PATH, outputPath = filePath) {
  return store.exportJsonl(filePath, outputPath);
}

export function assertLeadLedger(rows) {
  if (!rows.length) throw new Error("Lead ledger must contain at least one row");
  for (const row of rows) {
    if (!row.lead_id || !row.source || !row.original_language || !row.admin_locale) {
      throw new Error("Lead ledger row is missing routing data");
    }
    if (row.broker_approval_required !== true) throw new Error("Lead ledger must preserve broker approval gate");
    if (row.confirmation_status !== "ready" || row.confirmation_message_key !== "lead_received") {
      throw new Error("Lead ledger must preserve the instant confirmation contract");
    }
    if (!row.assigned_broker || !row.assignment_method) throw new Error("Lead ledger must preserve broker assignment");
    if ("contact" in row || "email" in row || "phone" in row) throw new Error("Lead ledger must not persist raw contact data");
    if (row.duplicate_status === "possible_duplicate" && !row.possible_duplicate_of) {
      throw new Error("Possible duplicate lead rows must reference the earlier lead");
    }
    if (!row.sla_due_at || row.follow_up_task?.status !== "open") {
      throw new Error("Lead ledger must create an immediate broker follow-up SLA task");
    }
    if (!row.requirements || !row.intake_completion || !row.qualification_task) {
      throw new Error("Lead ledger must preserve intake requirements and qualification work");
    }
    if (row.intake_completion.complete !== true && row.qualification_task.status !== "open") {
      throw new Error("Incomplete intake must create an open qualification task");
    }
  }
  return true;
}
