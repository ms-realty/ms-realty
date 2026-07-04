import fs from "node:fs";
import path from "node:path";
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
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error("phone must be E.164, for example +359880000000");
  return normalized;
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
  if (!input.listingId || !input.broker || !input.phone || !input.reviewer) {
    throw new Error("listingId, broker, phone, and reviewer are required");
  }
  if (input.approved !== true) throw new Error("broker contact must be explicitly approved");
  const phone = normalizePhone(input.phone);
  return {
    reviewed_at: reviewedAt,
    id: input.id || `broker-contact-${input.listingId}`,
    listing_id: input.listingId,
    broker: input.broker,
    phone_e164: phone,
    reviewer: input.reviewer,
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
  return [...rows].reverse().find((row) => row.listing_id === listingId && row.status === "approved") || null;
}

export function assertBrokerContacts(rows) {
  if (!rows.length) throw new Error("Broker contact ledger must contain at least one row");
  for (const row of rows) {
    if (!row.listing_id || !row.broker || !row.phone_e164 || row.status !== "approved") {
      throw new Error("Broker contact row is missing approved contact data");
    }
    if (!row.channels?.phone || !row.channels?.whatsapp || !row.channels?.viber) {
      throw new Error("Broker contact row must expose phone, WhatsApp, and Viber links");
    }
  }
  return true;
}
