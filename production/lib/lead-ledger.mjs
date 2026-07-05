import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LEAD_LEDGER_PATH = fromRoot("production", "data", "lead-ledger.jsonl");

export function resetLeadLedger(filePath = DEFAULT_LEAD_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

function minutesAfter(isoString, minutes) {
  const time = Date.parse(isoString);
  if (!Number.isFinite(time)) throw new Error("receivedAt must be an ISO timestamp");
  return new Date(time + minutes * 60 * 1000).toISOString();
}

export function appendLead(
  lead,
  { filePath = DEFAULT_LEAD_LEDGER_PATH, receivedAt = new Date().toISOString(), slaMinutes = 15, escalationMinutes = 60 } = {},
) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const slaDueAt = minutesAfter(receivedAt, slaMinutes);
  const row = {
    received_at: receivedAt,
    id: lead.id,
    lead_id: lead.lead?.id,
    source: lead.lead?.source,
    lead_type: lead.lead?.leadType,
    listing_reference: lead.lead?.listingReference || null,
    original_language: lead.original_language,
    admin_locale: lead.admin_locale,
    contact_preference: lead.contact_preference,
    broker_approval_required: lead.hermes_reply_draft?.broker_approval_required === true,
    confirmation_status: lead.confirmation?.status || null,
    confirmation_message_key: lead.confirmation?.message_key || null,
    sla_due_at: slaDueAt,
    manager_escalation_due_at: minutesAfter(receivedAt, escalationMinutes),
    follow_up_task: {
      id: `sla-${lead.lead?.id || lead.id}`,
      status: "open",
      owner: "broker_assignment",
      due_at: slaDueAt,
      action: "broker_response_required",
    },
  };
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`);
  return row;
}

export function readLeadLedger(filePath = DEFAULT_LEAD_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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
    if (!row.sla_due_at || row.follow_up_task?.status !== "open") {
      throw new Error("Lead ledger must create an immediate broker follow-up SLA task");
    }
  }
  return true;
}
