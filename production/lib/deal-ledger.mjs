import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_DEAL_LEDGER_PATH = fromRoot("production", "data", "deals.jsonl");

export function resetDealLedger(filePath = DEFAULT_DEAL_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readDeals(filePath = DEFAULT_DEAL_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function daysAfter(isoString, days) {
  const time = Date.parse(isoString);
  if (!Number.isFinite(time)) throw new Error("closedAt must be an ISO timestamp");
  return new Date(time + days * 24 * 60 * 60 * 1000).toISOString();
}

export function appendClosedDeal(leads, input, { filePath = DEFAULT_DEAL_LEDGER_PATH, closedAt = new Date().toISOString() } = {}) {
  const lead = leads.find((row) => row.lead_id === input.leadId);
  if (!lead) throw new Error("Closed deal requires a known leadId");
  if (!input.broker) throw new Error("broker is required");
  const dealClosedAt = input.closedAt || closedAt;
  const channel = input.channel || lead.contact_preference || "broker_follow_up";

  const row = {
    id: input.id || `deal-${input.leadId}`,
    lead_id: input.leadId,
    listing_reference: input.listingReference || lead.listing_reference,
    original_language: lead.original_language,
    admin_locale: lead.admin_locale,
    broker: input.broker,
    closed_at: dealClosedAt,
    stage: "closed",
    status: "closed",
    testimonial_request: {
      id: input.testimonialTaskId || `testimonial-${input.leadId}`,
      kind: "testimonial_request",
      owner: input.broker,
      status: "open",
      due_at: input.testimonialDueAt || daysAfter(dealClosedAt, 2),
      channel,
    },
    referral_request: {
      id: input.referralTaskId || `referral-${input.leadId}`,
      kind: "referral_request",
      owner: input.broker,
      status: "open",
      due_at: input.referralDueAt || daysAfter(dealClosedAt, 7),
      channel,
    },
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`);
  return row;
}

export function assertDealLedger(rows) {
  if (!rows.length) throw new Error("Deal ledger must contain at least one row");
  for (const row of rows) {
    if (!row.lead_id || !row.broker || !row.closed_at) throw new Error("Deal row is missing close data");
    if (row.status !== "closed" || row.stage !== "closed") throw new Error("Deal row must be closed");
    if (row.testimonial_request?.status !== "open") throw new Error("Closed deal must create an open testimonial request");
    if (row.referral_request?.status !== "open") throw new Error("Closed deal must create an open referral request");
  }
  return true;
}
