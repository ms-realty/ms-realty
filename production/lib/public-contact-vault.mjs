import { fromRoot } from "./paths.mjs";
import { appendPrivateContact, readPrivateContacts } from "./private-contact-vault.mjs";

export const DEFAULT_PUBLIC_CONTACT_VAULT_PATH = fromRoot("production", "data", "public-contact-vault.jsonl");

const SUBJECT_TYPES = new Set(["saved_search", "language_request"]);

function contactPayload(record, { includeMessage = false } = {}) {
  if (!SUBJECT_TYPES.has(record.subjectType)) throw new Error("Public contact vault subject type is invalid");
  const contact = record.contact;
  if (!record.subjectId || !contact || typeof contact !== "object" || !Object.keys(contact).length) {
    throw new Error("Public contact vault requires a subject id and contact data");
  }
  return {
    contact,
    contact_preference: record.contactPreference || null,
    ...(includeMessage && record.message ? { message: record.message } : {}),
  };
}

export function appendPublicContact(
  record,
  { filePath = DEFAULT_PUBLIC_CONTACT_VAULT_PATH, secret, storedAt = new Date().toISOString(), includeMessage = false } = {},
) {
  const stored = appendPrivateContact(
    {
      subjectType: record.subjectType,
      subjectId: record.subjectId,
      payload: contactPayload(record, { includeMessage }),
    },
    { filePath, secret, secretName: "MS_REALTY_PUBLIC_CONTACT_KEY", storedAt },
  );
  return { contact_ref: stored.subject_id, stored_at: stored.stored_at, encrypted: true };
}

export function readPublicContacts(
  filePath = DEFAULT_PUBLIC_CONTACT_VAULT_PATH,
  secret,
  subjectType = null,
) {
  if (subjectType && !SUBJECT_TYPES.has(subjectType)) throw new Error("Public contact vault subject type is invalid");
  return readPrivateContacts(filePath, {
    secret,
    secretName: "MS_REALTY_PUBLIC_CONTACT_KEY",
    subjectType,
  });
}
