import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  appendAccountContactLink,
  appendAccountCreation,
  assertAccountLedger,
  deriveAccounts,
  readAccountLedger,
  resetAccountLedger,
} from "../lib/account-ledger.mjs";

test("account ledger creates human-confirmed family and company groupings and links known contacts", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-accounts-")), "accounts.jsonl");
  resetAccountLedger(file);
  const contact = { id: "contact-abcdef1234567890" };
  const created = appendAccountCreation(
    { accountId: "account-family-review", accountType: "family", label: "Review family", actor: "broker_bg", humanConfirmed: true },
    { filePath: file, recordedAt: "2026-07-19T10:00:00.000Z" },
  );
  const linked = appendAccountContactLink(
    [contact],
    { accountId: "account-family-review", contactId: contact.id, actor: "broker_bg", reason: "Confirmed same household.", linkConfirmed: true },
    { filePath: file, recordedAt: "2026-07-19T10:01:00.000Z" },
  );
  assert.equal(created.idempotent, false);
  assert.equal(linked.idempotent, false);
  assert.equal(appendAccountCreation(
    { accountId: "account-family-review", accountType: "family", label: "Review family", actor: "broker_bg", humanConfirmed: true },
    { filePath: file, recordedAt: "2026-07-19T10:02:00.000Z" },
  ).idempotent, true);
  const rows = readAccountLedger(file);
  assert.equal(assertAccountLedger(rows), true);
  assert.deepEqual(deriveAccounts(rows)[0].contact_ids, [contact.id]);
});

test("account ledger rejects unknown contacts, silent linking, and conflicting ownership", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-accounts-invalid-")), "accounts.jsonl");
  resetAccountLedger(file);
  appendAccountCreation(
    { accountId: "account-family-one", accountType: "family", label: "Family one", actor: "broker_bg", humanConfirmed: true },
    { filePath: file, recordedAt: "2026-07-19T10:00:00.000Z" },
  );
  appendAccountCreation(
    { accountId: "account-company-two", accountType: "company", label: "Company two", actor: "broker_bg", humanConfirmed: true },
    { filePath: file, recordedAt: "2026-07-19T10:01:00.000Z" },
  );
  const contact = { id: "contact-abcdef1234567890" };
  assert.throws(() => appendAccountContactLink([contact], { accountId: "account-family-one", contactId: contact.id, actor: "broker_bg", reason: "Known", linkConfirmed: false }, { filePath: file }), /Human confirmation/);
  assert.throws(() => appendAccountContactLink([contact], { accountId: "account-family-one", contactId: "contact-unknown", actor: "broker_bg", reason: "Unknown", linkConfirmed: true }, { filePath: file }), /known contactId/);
  appendAccountContactLink([contact], { accountId: "account-family-one", contactId: contact.id, actor: "broker_bg", reason: "Known", linkConfirmed: true }, { filePath: file, recordedAt: "2026-07-19T10:02:00.000Z" });
  assert.throws(() => appendAccountContactLink([contact], { accountId: "account-company-two", contactId: contact.id, actor: "broker_bg", reason: "Move", linkConfirmed: true }, { filePath: file, recordedAt: "2026-07-19T10:03:00.000Z" }), /another account/);
});
