import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_VIEWING_LEDGER_PATH = fromRoot("production", "data", "viewings.jsonl");

export function resetViewingLedger(filePath = DEFAULT_VIEWING_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readViewings(filePath = DEFAULT_VIEWING_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function appendViewing(leads, input, { filePath = DEFAULT_VIEWING_LEDGER_PATH, bookedAt = new Date().toISOString() } = {}) {
  const lead = leads.find((row) => row.lead_id === input.leadId);
  if (!lead) throw new Error("Viewing requires a known leadId");
  if (!input.startsAt || !input.broker) throw new Error("startsAt and broker are required");
  if (Number.isNaN(Date.parse(input.startsAt))) throw new Error("startsAt must be an ISO date");

  const row = {
    id: input.id || `viewing-${input.leadId}`,
    lead_id: input.leadId,
    listing_reference: input.listingReference || lead.listing_reference || null,
    original_language: lead.original_language,
    admin_locale: lead.admin_locale,
    broker: input.broker,
    starts_at: input.startsAt,
    booked_at: bookedAt,
    channel: input.channel || "property_viewing",
    status: "booked",
    follow_up_task: {
      id: input.taskId || `task-${input.leadId}`,
      owner: input.broker,
      status: "open",
      due_at: input.followUpDueAt || input.startsAt,
    },
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`);
  return row;
}

export function assertViewingLedger(rows) {
  if (!rows.length) throw new Error("Viewing ledger must contain at least one row");
  for (const row of rows) {
    if (!row.lead_id || !row.broker || !row.starts_at) throw new Error("Viewing row is missing booking data");
    if (row.status !== "booked") throw new Error("Viewing must be booked");
    if (row.follow_up_task?.status !== "open") throw new Error("Viewing must create an open follow-up task");
  }
  return true;
}
