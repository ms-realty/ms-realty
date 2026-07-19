import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LEAD_CONTACT_VAULT_PATH = fromRoot("production", "data", "lead-contact-vault.jsonl");

function encryptionKey(secret) {
  const value = String(secret || "");
  if (value.length < 32) throw new Error("MS_REALTY_LEAD_CONTACT_KEY must be at least 32 characters");
  return crypto.createHash("sha256").update(value).digest();
}

function contactPayload(lead) {
  const contact = lead.lead?.contact;
  if (!lead.lead?.id || !contact || typeof contact !== "object" || !Object.keys(contact).length) {
    throw new Error("Lead contact vault requires a lead id and contact data");
  }
  return { contact, contact_preference: lead.contact_preference || null };
}

export function appendLeadContact(
  lead,
  { filePath = DEFAULT_LEAD_CONTACT_VAULT_PATH, secret, storedAt = new Date().toISOString() } = {},
) {
  const payload = contactPayload(lead);
  const leadId = lead.lead?.id;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(leadId));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const row = {
    lead_id: leadId,
    stored_at: storedAt,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    auth_tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
  return { lead_id: row.lead_id, stored_at: row.stored_at, encrypted: true };
}

export function readLeadContacts(filePath = DEFAULT_LEAD_CONTACT_VAULT_PATH, secret) {
  if (!fs.existsSync(filePath)) return new Map();
  const key = encryptionKey(secret);
  const contacts = new Map();
  for (const line of fs.readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean)) {
    const row = JSON.parse(line);
    if (row.algorithm !== "aes-256-gcm" || !row.lead_id) throw new Error("Lead contact vault row is invalid");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(row.iv, "base64"));
    decipher.setAAD(Buffer.from(row.lead_id));
    decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
    contacts.set(row.lead_id, JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.ciphertext, "base64")), decipher.final()]).toString("utf8")));
  }
  return contacts;
}

export function withLeadContacts(leads, { filePath = DEFAULT_LEAD_CONTACT_VAULT_PATH, secret } = {}) {
  if (!filePath || !fs.existsSync(filePath)) return leads;
  const contacts = readLeadContacts(filePath, secret);
  return leads.map((lead) => {
    const privateContact = contacts.get(lead.lead_id);
    return privateContact ? { ...lead, ...privateContact, contact_available: true } : lead;
  });
}
