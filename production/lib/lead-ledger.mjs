import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LEAD_LEDGER_PATH = fromRoot("production", "data", "lead-ledger.jsonl");

export function resetLeadLedger(filePath = DEFAULT_LEAD_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function appendLead(lead, { filePath = DEFAULT_LEAD_LEDGER_PATH, receivedAt = new Date().toISOString() } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const row = {
    received_at: receivedAt,
    id: lead.id,
    lead_id: lead.lead?.id,
    lead_type: lead.lead?.leadType,
    listing_reference: lead.lead?.listingReference || null,
    original_language: lead.original_language,
    admin_locale: lead.admin_locale,
    broker_approval_required: lead.hermes_reply_draft?.broker_approval_required === true,
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
    if (!row.lead_id || !row.original_language || !row.admin_locale) throw new Error("Lead ledger row is missing routing data");
    if (row.broker_approval_required !== true) throw new Error("Lead ledger must preserve broker approval gate");
  }
  return true;
}
