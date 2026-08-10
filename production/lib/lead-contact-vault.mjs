import fs from "node:fs";
import { fromRoot } from "./paths.mjs";
import {
  appendPrivateContact,
  createPrivateContactEnvelope,
  openPrivateContactEnvelope,
  readPrivateContacts,
} from "./private-contact-vault.mjs";

export const DEFAULT_LEAD_CONTACT_VAULT_PATH = fromRoot("production", "data", "lead-contact-vault.jsonl");

function contactPayload(lead) {
  const contact = lead.lead?.contact;
  if (!lead.lead?.id || !contact || typeof contact !== "object" || !Object.keys(contact).length) {
    throw new Error("Lead contact vault requires a lead id and contact data");
  }
  const message = String(lead.message_original || lead.message || lead.lead?.message || "").trim();
  return {
    contact,
    contact_preference: lead.contact_preference || null,
    ...(message ? { message_original: message.slice(0, 2000) } : {}),
  };
}

function joinLeadContacts(leads, contacts) {
  return leads.map((lead) => {
    const privateContact = contacts.get(lead.lead_id);
    return privateContact ? { ...lead, ...privateContact, contact_available: true } : lead;
  });
}

export function createLeadContactEnvelope(
  lead,
  { secret, storedAt = new Date().toISOString() } = {},
) {
  return createPrivateContactEnvelope(
    { subjectType: "lead", subjectId: lead.lead?.id, payload: contactPayload(lead) },
    { secret, secretName: "MS_REALTY_LEAD_CONTACT_KEY", storedAt },
  );
}

export function appendLeadContact(
  lead,
  { filePath = DEFAULT_LEAD_CONTACT_VAULT_PATH, secret, storedAt = new Date().toISOString() } = {},
) {
  const payload = contactPayload(lead);
  const leadId = lead.lead?.id;
  const stored = appendPrivateContact(
    { subjectType: "lead", subjectId: leadId, payload },
    { filePath, secret, secretName: "MS_REALTY_LEAD_CONTACT_KEY", storedAt },
  );
  return { lead_id: stored.subject_id, stored_at: stored.stored_at, encrypted: true };
}

export function readLeadContacts(filePath = DEFAULT_LEAD_CONTACT_VAULT_PATH, secret) {
  return readPrivateContacts(filePath, {
    secret,
    secretName: "MS_REALTY_LEAD_CONTACT_KEY",
    subjectType: "lead",
  });
}

export function withLeadContacts(leads, { filePath = DEFAULT_LEAD_CONTACT_VAULT_PATH, secret } = {}) {
  if (!filePath || !fs.existsSync(filePath)) return leads;
  return joinLeadContacts(leads, readLeadContacts(filePath, secret));
}

export function withLeadContactEnvelopes(leads, envelopes, { secret } = {}) {
  const contacts = new Map();
  for (const envelope of envelopes || []) {
    const opened = openPrivateContactEnvelope(envelope, {
      secret,
      secretName: "MS_REALTY_LEAD_CONTACT_KEY",
    });
    if (opened.subject_type === "lead") contacts.set(opened.subject_id, opened.payload);
  }
  return joinLeadContacts(leads, contacts);
}
