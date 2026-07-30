import fs from "node:fs";
import path from "node:path";
import { FACT_VERIFICATION_STATES } from "./listing-facts.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_BROKER_CONTACT_LEDGER_PATH = fromRoot("production", "data", "broker-contacts.jsonl");

export function resetBrokerContacts(filePath = DEFAULT_BROKER_CONTACT_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readBrokerContacts(filePath = DEFAULT_BROKER_CONTACT_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function normalizePhone(phone) {
  const normalized = String(phone || "").replace(/[^\d+]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error("phone must be a valid E.164 value");
  if (/(\d)\1{5,}/.test(normalized)) throw new Error("phone resembles a placeholder or test value");
  return normalized;
}

function requiredText(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function normalizedReviewedAt(value) {
  const reviewedAt = new Date(value);
  if (Number.isNaN(reviewedAt.getTime())) throw new Error("reviewedAt must be a valid timestamp");
  return reviewedAt.toISOString();
}

function channelLinks(phone) {
  const digits = phone.replace(/\D/g, "");
  return {
    phone: `tel:${phone}`,
    whatsapp: `https://wa.me/${digits}`,
    viber: `viber://chat?number=${encodeURIComponent(phone)}`,
  };
}

export function createBrokerContact(input, { reviewedAt = new Date().toISOString() } = {}) {
  const listingId = requiredText(input?.listingId, "listingId");
  const broker = requiredText(input?.broker, "broker");
  const reviewer = requiredText(input?.reviewer, "reviewer");
  const sourceReference = requiredText(input?.sourceReference ?? input?.source_reference, "sourceReference");
  const validationStatus = String((input?.validationStatus ?? input?.validation_status) || "").trim();
  if (input.approved !== true) throw new Error("broker contact must be explicitly approved");
  if (validationStatus !== FACT_VERIFICATION_STATES[3]) throw new Error("broker contact must be broker_verified");
  const phone = normalizePhone(input.phone);
  return {
    reviewed_at: normalizedReviewedAt(reviewedAt),
    id: input.id || `broker-contact-${listingId}`,
    listing_id: listingId,
    broker,
    phone_e164: phone,
    reviewer,
    source_reference: sourceReference,
    validation_status: validationStatus,
    status: "approved",
    channels: channelLinks(phone),
  };
}

export function appendBrokerContact(contact, { filePath = DEFAULT_BROKER_CONTACT_LEDGER_PATH } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(contact)}\n`);
  return contact;
}

export function latestApprovedBrokerContact(rows, listingId) {
  return [...rows].reverse().find((row) => row.listing_id === listingId && isPublicBrokerContact(row)) || null;
}

export function isPublicBrokerContact(row) {
  try {
    if (row?.status !== "approved" || row.validation_status !== FACT_VERIFICATION_STATES[3]) return false;
    requiredText(row.id, "id");
    requiredText(row.listing_id, "listing_id");
    requiredText(row.broker, "broker");
    requiredText(row.reviewer, "reviewer");
    requiredText(row.source_reference, "source_reference");
    normalizedReviewedAt(row.reviewed_at);
    const channels = channelLinks(normalizePhone(row.phone_e164));
    return ["phone", "whatsapp", "viber"].every((channel) => row.channels?.[channel] === channels[channel]);
  } catch {
    return false;
  }
}

export function assertBrokerContacts(rows) {
  for (const row of rows) {
    if (!isPublicBrokerContact(row)) throw new Error("Broker contact row is not independently verified for public contact");
  }
  return true;
}
