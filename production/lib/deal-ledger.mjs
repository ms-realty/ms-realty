import fs from "node:fs";
import path from "node:path";
import { assertLeadCanCloseDeal } from "./lead-pipeline-outcomes.mjs";
import { fromRoot } from "./paths.mjs";
import { assertSellerCanCloseDeal } from "./seller-pipeline-outcomes.mjs";

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

export function appendClosedDeal(context, input, { filePath = DEFAULT_DEAL_LEDGER_PATH, closedAt = new Date().toISOString() } = {}) {
  if (!context || typeof context !== "object" || !Array.isArray(context.leads)) {
    throw new Error("Closed deal requires lead journey context");
  }
  const leads = context.leads;
  const lead = leads.find((row) => row.lead_id === input.leadId);
  if (!lead) throw new Error("Closed deal requires a known leadId");
  if (!input.broker) throw new Error("broker is required");
  const dealClosedAt = input.closedAt || closedAt;
  if (Number.isNaN(Date.parse(dealClosedAt))) throw new Error("closedAt must be an ISO timestamp");
  const normalizedClosedAt = new Date(dealClosedAt).toISOString();
  const channel = input.channel || lead.contact_preference || "broker_follow_up";
  const listingReference = input.listingReference || lead.listing_reference || null;
  const rows = readDeals(filePath);
  const existingForLead = rows.find((row) => row.lead_id === input.leadId);
  if (existingForLead) {
    if (
      existingForLead.broker !== input.broker ||
      existingForLead.closed_at !== normalizedClosedAt ||
      (existingForLead.listing_reference || null) !== listingReference
    ) {
      throw new Error("Lead already belongs to another closed deal record");
    }
    return { ...existingForLead, idempotent: true };
  }
  assertLeadCanCloseDeal({ ...context, deals: rows }, input.leadId, normalizedClosedAt);
  if ((lead.lead_type || lead.leadType) === "seller") {
    assertSellerCanCloseDeal(context.sellerPipelines || [], context.sellerPipelineOutcomes || [], input.leadId);
  }
  if (lead.received_at && Date.parse(normalizedClosedAt) < Date.parse(lead.received_at)) {
    throw new Error("closedAt cannot precede the lead received time");
  }
  const requestedId = String(input.id || `deal-${input.leadId}`).trim();
  if (rows.some((row) => row.id === requestedId)) throw new Error("Deal id already belongs to another lead");

  const row = {
    id: requestedId,
    lead_id: input.leadId,
    listing_reference: listingReference,
    original_language: lead.original_language,
    admin_locale: lead.admin_locale,
    broker: input.broker,
    closed_at: normalizedClosedAt,
    stage: "closed",
    status: "closed",
    testimonial_request: {
      id: input.testimonialTaskId || `testimonial-${input.leadId}`,
      kind: "testimonial_request",
      owner: input.broker,
      status: "open",
      due_at: input.testimonialDueAt || daysAfter(normalizedClosedAt, 2),
      channel,
    },
    referral_request: {
      id: input.referralTaskId || `referral-${input.leadId}`,
      kind: "referral_request",
      owner: input.broker,
      status: "open",
      due_at: input.referralDueAt || daysAfter(normalizedClosedAt, 7),
      channel,
    },
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`);
  return { ...row, idempotent: false };
}

export function assertDealLedger(rows) {
  if (!rows.length) throw new Error("Deal ledger must contain at least one row");
  const ids = new Set();
  const leadIds = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error("Deal ids must be present and unique");
    if (leadIds.has(row.lead_id)) throw new Error("A lead can belong to only one closed deal");
    ids.add(row.id);
    leadIds.add(row.lead_id);
    if (!row.lead_id || !row.broker || !row.closed_at) throw new Error("Deal row is missing close data");
    if (row.status !== "closed" || row.stage !== "closed") throw new Error("Deal row must be closed");
    if (row.testimonial_request?.status !== "open") throw new Error("Closed deal must create an open testimonial request");
    if (row.referral_request?.status !== "open") throw new Error("Closed deal must create an open referral request");
  }
  return true;
}
