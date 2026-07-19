import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendPublicContact, readPublicContacts } from "../lib/public-contact-vault.mjs";
import {
  appendPublicRequestOutcome,
  assertPublicRequestOutcomes,
  buildPublicRequestQueue,
  readPublicRequestOutcomes,
} from "../lib/public-request-outcomes.mjs";

const savedSearches = [
  {
    id: "saved-search-1",
    saved_at: "2026-07-18T08:00:00Z",
    requested_locale: "he",
    locale: "en",
    query: "Sandanski",
    filters: { property_type: "apartment" },
    contact_preference: "email",
    alert_frequency: "daily",
    match_count: 12,
    alert_task: { owner: "broker_en", status: "open" },
  },
];

const languageRequests = [
  {
    id: "language-request-el",
    requested_at: "2026-07-18T09:00:00Z",
    requested_locale: "el",
    requested_path: "/el/properties/MS-1",
    fallback_locale: "en",
    admin_locale: "en",
  },
];

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-public-request-"));
  const vaultPath = path.join(dir, "contacts.jsonl");
  const outcomePath = path.join(dir, "outcomes.jsonl");
  const secret = "public-request-test-key-32-characters-minimum";
  appendPublicContact(
    {
      subjectType: "saved_search",
      subjectId: "saved-search-1",
      contact: { name: "Noa", email: "noa@example.test" },
      contactPreference: "email",
    },
    { filePath: vaultPath, secret, storedAt: "2026-07-18T08:00:01Z" },
  );
  appendPublicContact(
    {
      subjectType: "language_request",
      subjectId: "language-request-el",
      contact: { name: "Eleni", whatsapp: "+359880000001" },
      contactPreference: "whatsapp",
      message: "Please notify me when Greek is reviewed.",
    },
    { filePath: vaultPath, secret, storedAt: "2026-07-18T09:00:01Z", includeMessage: true },
  );
  return {
    outcomePath,
    contactMaps: {
      saved_search: readPublicContacts(vaultPath, secret, "saved_search"),
      language_request: readPublicContacts(vaultPath, secret, "language_request"),
    },
  };
}

test("public request queue decrypts contacts only for the authenticated operations payload", () => {
  const { contactMaps } = fixture();
  const queue = buildPublicRequestQueue({
    savedSearches,
    languageRequests,
    contactMaps,
    contactVaultStatus: "available",
    now: "2026-07-20T10:00:00Z",
  });

  assert.equal(queue.summary.total, 2);
  assert.equal(queue.summary.open, 2);
  assert.equal(queue.summary.overdue, 2);
  assert.equal(queue.summary.contacts_available, 2);
  assert.equal(queue.rows.find((row) => row.request_type === "saved_search").contact.email, "noa@example.test");
  assert.equal(queue.rows.find((row) => row.request_type === "language_request").message, "Please notify me when Greek is reviewed.");
});

test("public request outcomes are append-only, idempotent, and drive queue state", () => {
  const { outcomePath } = fixture();
  const sources = { savedSearches, languageRequests };
  const contacted = appendPublicRequestOutcome(
    sources,
    {
      requestType: "saved_search",
      requestId: "saved-search-1",
      actor: "broker_en",
      action: "contacted",
      note: "Customer confirmed daily email alerts.",
      nextFollowUpAt: "2026-07-21T10:00:00Z",
    },
    { filePath: outcomePath, recordedAt: "2026-07-20T10:00:00Z" },
  );
  const retry = appendPublicRequestOutcome(
    sources,
    {
      requestType: "saved_search",
      requestId: "saved-search-1",
      actor: "broker_en",
      action: "contacted",
      note: "Customer confirmed daily email alerts.",
      nextFollowUpAt: "2026-07-21T10:00:00Z",
    },
    { filePath: outcomePath, recordedAt: "2026-07-20T10:00:00Z" },
  );
  const completed = appendPublicRequestOutcome(
    sources,
    {
      requestType: "saved_search",
      requestId: "saved-search-1",
      actor: "broker_en",
      action: "complete",
      note: "Alert setup verified with the customer.",
    },
    { filePath: outcomePath, recordedAt: "2026-07-20T11:00:00Z" },
  );
  const rows = readPublicRequestOutcomes(outcomePath);
  const queue = buildPublicRequestQueue({
    savedSearches,
    languageRequests,
    outcomes: rows,
    now: "2026-07-20T12:00:00Z",
  });

  assert.equal(contacted.idempotent, false);
  assert.equal(retry.idempotent, true);
  assert.equal(completed.request.status, "completed");
  assert.equal(rows.length, 2);
  assert.equal(assertPublicRequestOutcomes(rows), true);
  assert.equal(queue.summary.completed, 1);
  assert.equal(queue.summary.saved_search_open, 0);
  assert.equal(queue.rows.some((row) => row.request_id === "saved-search-1"), false);
  assert.equal(JSON.stringify(rows).includes("noa@example.test"), false);
});

test("public request outcomes reject invalid transitions and unattributed closure", () => {
  const { outcomePath } = fixture();
  const sources = { savedSearches, languageRequests };
  assert.throws(
    () =>
      appendPublicRequestOutcome(
        sources,
        { requestType: "language_request", requestId: "language-request-el", action: "complete", actor: "broker_en" },
        { filePath: outcomePath, recordedAt: "2026-07-20T10:00:00Z" },
      ),
    /requires an outcome note/,
  );
  assert.throws(
    () =>
      appendPublicRequestOutcome(
        sources,
        { requestType: "language_request", requestId: "missing", action: "contacted", actor: "broker_en" },
        { filePath: outcomePath, recordedAt: "2026-07-20T10:00:00Z" },
      ),
    /Known public request type and id/,
  );
  assert.throws(
    () =>
      appendPublicRequestOutcome(
        sources,
        { requestType: "language_request", requestId: "language-request-el", action: "contacted", actor: "" },
        { filePath: outcomePath, recordedAt: "2026-07-20T10:00:00Z" },
      ),
    /actor is required/,
  );
});
