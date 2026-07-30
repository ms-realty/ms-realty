import { DEFAULT_LEAD_CONTACT_VAULT_PATH } from "./lead-contact-vault.mjs";
import { DEFAULT_PUBLIC_CONTACT_VAULT_PATH } from "./public-contact-vault.mjs";
import { erasePrivateContact } from "./private-contact-vault.mjs";

// GDPR Art. 17 erasure request. The operational ledgers keep their rows (they
// hold no raw contact data — assertLeadLedger enforces that), so erasing the
// vault entry is what actually removes the personal data.

const SUBJECT_TYPES = new Map([
  ["lead", () => DEFAULT_LEAD_CONTACT_VAULT_PATH],
  ["saved_search", () => DEFAULT_PUBLIC_CONTACT_VAULT_PATH],
  ["language_request", () => DEFAULT_PUBLIC_CONTACT_VAULT_PATH],
]);

const REASONS = new Set(["subject_request", "retention_expired", "created_in_error"]);

function truthy(value) {
  return value === true || value === "true" || value === "on" || value === "1";
}

export function eraseContactSubject(input = {}, { leadContactVaultPath, publicContactVaultPath, erasedAt } = {}) {
  const subjectType = String(input.subject_type || input.subjectType || "").trim();
  const subjectId = String(input.subject_id || input.subjectId || "").trim();
  const actor = String(input.actor || "").trim();
  const reason = String(input.reason || input.reason_code || "subject_request").trim();

  if (!SUBJECT_TYPES.has(subjectType)) throw new Error("Unknown erasure subject type");
  if (!subjectId) throw new Error("Erasure requires a subject id");
  if (!actor) throw new Error("Erasure requires an attributable operator");
  if (!REASONS.has(reason)) throw new Error("Unknown erasure reason");
  if (!truthy(input.human_confirmed ?? input.humanConfirmed)) {
    throw new Error("Erasure requires human confirmation");
  }

  const configuredPath =
    subjectType === "lead"
      ? leadContactVaultPath || SUBJECT_TYPES.get(subjectType)()
      : publicContactVaultPath || SUBJECT_TYPES.get(subjectType)();

  const result = erasePrivateContact(
    { subjectType, subjectId, actor, reason },
    { filePath: configuredPath, ...(erasedAt ? { erasedAt } : {}) },
  );
  return { kind: "contact_erasure", ...result, reason, actor };
}
