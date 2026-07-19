import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { appendPublicContact, readPublicContacts } from "../lib/public-contact-vault.mjs";

const SECRET = "test-only-public-contact-key-32-characters-minimum";

test("public request contact vault encrypts saved-search delivery data outside workflow ledgers", () => {
  const filePath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-public-contact-`)}/contacts.jsonl`;
  const stored = appendPublicContact(
    {
      subjectType: "saved_search",
      subjectId: "saved-search-vault-test",
      contact: { name: "Noa Levi", whatsapp: "+359880000001" },
      contactPreference: "whatsapp",
    },
    { filePath, secret: SECRET, storedAt: "2026-07-19T11:00:00Z" },
  );

  assert.deepEqual(stored, {
    contact_ref: "saved-search-vault-test",
    stored_at: "2026-07-19T11:00:00Z",
    encrypted: true,
  });
  const raw = fs.readFileSync(filePath, "utf8");
  assert.doesNotMatch(raw, /Noa Levi|359880000001|whatsapp/);
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  assert.deepEqual(readPublicContacts(filePath, SECRET, "saved_search").get("saved-search-vault-test"), {
    contact: { name: "Noa Levi", whatsapp: "+359880000001" },
    contact_preference: "whatsapp",
  });
  assert.throws(() => readPublicContacts(filePath, `${SECRET}-wrong`, "saved_search"), /authenticate data|Unsupported state/i);
});

test("public request contact vault rejects unknown request types and weak keys", () => {
  const filePath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-public-contact-key-`)}/contacts.jsonl`;
  assert.throws(
    () =>
      appendPublicContact(
        { subjectType: "unknown", subjectId: "test", contact: { email: "test@example.test" } },
        { filePath, secret: SECRET },
      ),
    /subject type/,
  );
  assert.throws(
    () =>
      appendPublicContact(
        { subjectType: "language_request", subjectId: "test", contact: { email: "test@example.test" } },
        { filePath, secret: "short" },
      ),
    /MS_REALTY_PUBLIC_CONTACT_KEY must be at least 32 characters/,
  );
  assert.equal(fs.existsSync(filePath), false);
});
