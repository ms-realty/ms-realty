import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {
  appendLeadContact,
  createLeadContactEnvelope,
  readLeadContacts,
  withLeadContactEnvelopes,
  withLeadContacts,
} from "../lib/lead-contact-vault.mjs";

const SECRET = "test-only-lead-contact-key-32-characters-minimum";

test("lead contact vault encrypts private contact data and restores it only with the key", () => {
  const filePath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-contact-vault-`)}/contacts.jsonl`;
  const lead = {
    contact_preference: "whatsapp",
    message_original: "Test Buyer asks for Noa at noa@example.invalid or +359880000001.",
    lead: {
      id: "vault-lead-1",
      contact: { name: "Noa Levi", whatsapp: "+359880000001" },
    },
  };

  assert.deepEqual(appendLeadContact(lead, { filePath, secret: SECRET, storedAt: "2026-07-19T10:00:00Z" }), {
    lead_id: "vault-lead-1",
    stored_at: "2026-07-19T10:00:00Z",
    encrypted: true,
  });
  const stored = fs.readFileSync(filePath, "utf8");
  const storedRow = JSON.parse(stored);
  assert.deepEqual(Object.keys(storedRow).sort(), [
    "algorithm",
    "auth_tag",
    "ciphertext",
    "iv",
    "stored_at",
    "subject_id",
    "subject_type",
  ]);
  assert.doesNotMatch(stored, /Noa Levi|Test Buyer|noa@example\.invalid|\+359880000001|"whatsapp"/);
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  assert.deepEqual(readLeadContacts(filePath, SECRET).get("vault-lead-1"), {
    contact: { name: "Noa Levi", whatsapp: "+359880000001" },
    contact_preference: "whatsapp",
    message_original: "Test Buyer asks for Noa at noa@example.invalid or +359880000001.",
  });
  assert.deepEqual(withLeadContacts([{ lead_id: "vault-lead-1", source: "website_listing_detail" }], { filePath, secret: SECRET }), [
    {
      lead_id: "vault-lead-1",
      source: "website_listing_detail",
      contact: { name: "Noa Levi", whatsapp: "+359880000001" },
      contact_preference: "whatsapp",
      message_original: "Test Buyer asks for Noa at noa@example.invalid or +359880000001.",
      contact_available: true,
    },
  ]);
  assert.throws(() => readLeadContacts(filePath, `${SECRET}-wrong`), /authenticate data|Unsupported state/i);

  const envelope = createLeadContactEnvelope(lead, { secret: SECRET, storedAt: "2026-07-19T10:00:00Z" });
  assert.deepEqual(Object.keys(envelope).sort(), ["algorithm", "auth_tag", "ciphertext", "iv", "stored_at", "subject_id", "subject_type"]);
  assert.doesNotMatch(JSON.stringify(envelope), /Noa Levi|Test Buyer|noa@example\.invalid|\+359880000001|whatsapp/);
  assert.deepEqual(withLeadContactEnvelopes([{ lead_id: "vault-lead-1" }], [envelope], { secret: SECRET }), [
    {
      lead_id: "vault-lead-1",
      contact: { name: "Noa Levi", whatsapp: "+359880000001" },
      contact_preference: "whatsapp",
      message_original: "Test Buyer asks for Noa at noa@example.invalid or +359880000001.",
      contact_available: true,
    },
  ]);
  assert.throws(
    () => withLeadContactEnvelopes([{ lead_id: "vault-lead-1" }], [envelope], { secret: `${SECRET}-wrong` }),
    /authenticate data|Unsupported state/i,
  );
});

test("lead contact vault fails closed without a sufficiently strong key", () => {
  const filePath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-contact-vault-key-`)}/contacts.jsonl`;
  const lead = {
    contact_preference: "phone",
    lead: { id: "vault-lead-no-key", contact: { name: "Test Buyer", phone: "+359880000002" } },
  };

  assert.throws(() => appendLeadContact(lead, { filePath }), /MS_REALTY_LEAD_CONTACT_KEY must be at least 32 characters/);
  assert.equal(fs.existsSync(filePath), false);
});
