import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { renderAdminDocumentRecordsPayload } from "../lib/document-records.mjs";
import { DOCUMENT_STATUSES } from "../lib/document-signatures.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";

// The durable document and signature authority shipped nine routes, three
// Payload collections and a migration. Nothing rendered any of it: a document
// could be created, versioned and signed over HTTP and never appear on a
// screen, which is the same as not existing for the broker chasing it.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUTH = { authorization: "Bearer local-admin-smoke" };
const registry = loadLocaleRegistry();

function app() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-doc-records-"));
  const copy = (name) => {
    const target = path.join(dir, name);
    fs.copyFileSync(path.join(ROOT, "production/data", name), target);
    return target;
  };
  return createHttpApp({
    reviewedAt: "2026-07-19T12:00:00.000Z",
    leadLedgerPath: copy("lead-ledger.jsonl"),
    eventLedgerPath: copy("events.jsonl"),
    leadContactVaultPath: path.join(dir, "lead-contacts.jsonl"),
    leadContactKey: "test-only-document-records-key-32-ch",
  });
}

const DOCUMENTS = [
  { document_id: "doc-1", title: "Preliminary contract", document_type: "preliminary_contract", status: "active", case_id: "CASE-0007", current_revision_number: 3, subject_ref: "MS-CRAWL-0001" },
  { document_id: "doc-2", title: "Mandate", document_type: "mandate", status: "void", case_id: null, current_revision_number: 1, subject_ref: "MS-CRAWL-0002" },
];
const REQUESTS = [
  { request_id: "sig-1", document_id: "doc-1", signer_role: "buyer", signer_ref: "contact-1", status: "provider_pending", revision_number: 3 },
  { request_id: "sig-2", document_id: "doc-1", signer_role: "seller", signer_ref: "contact-2", status: "signed", revision_number: 3 },
];

test("an absent document store is a state the screen renders, not a 503", async () => {
  // The store is Payload on Postgres. Locally there is none, and a broker who
  // opens the page should see the page and the reason.
  const res = await dispatchHttp(app(), { url: "/admin/documents/records?locale=en", headers: AUTH });
  assert.equal(res.status, 200);
  assert.match(res.body, /data-kind="admin-document-records"/);
  assert.match(res.body, /data-unavailable-data="documents"/);
  assert.match(res.body, /data-document-records-empty/);
});

test("every document shows the version it is on and who is still waiting", () => {
  const payload = renderAdminDocumentRecordsPayload(registry, "en", { documents: DOCUMENTS, signatureRequests: REQUESTS });

  assert.equal(payload.summary.total, 2);
  assert.equal(payload.summary.active, 1);
  assert.equal(payload.summary.void, 1);
  // One document has an open request; the other has none.
  assert.equal(payload.summary.awaiting_signature, 1);
  assert.equal(payload.summary.open_signature_requests, 1);
  // The version is the product's whole claim to an auditable file.
  assert.equal(payload.documents.find((row) => row.document_id === "doc-1").current_revision_number, 3);
  assert.equal(payload.documents.find((row) => row.document_id === "doc-1").open_signature_requests, 1);
  assert.equal(payload.documents.find((row) => row.document_id === "doc-2").open_signature_requests, 0);
});

test("a signed request does not keep a document in the waiting queue", () => {
  const allSigned = REQUESTS.map((row) => ({ ...row, status: "signed" }));
  const payload = renderAdminDocumentRecordsPayload(registry, "en", { documents: DOCUMENTS, signatureRequests: allSigned });
  assert.equal(payload.summary.awaiting_signature, 0);
  assert.equal(payload.summary.open_signature_requests, 0);
  // The requests are still listed — the queue is empty, the history is not.
  assert.equal(payload.signatureRequests.length, 2);
});

test("the filters narrow the rows and never the summary", () => {
  const all = renderAdminDocumentRecordsPayload(registry, "en", { documents: DOCUMENTS, signatureRequests: REQUESTS });
  const voided = renderAdminDocumentRecordsPayload(registry, "en", { documents: DOCUMENTS, signatureRequests: REQUESTS, status: "void" });
  const awaiting = renderAdminDocumentRecordsPayload(registry, "en", { documents: DOCUMENTS, signatureRequests: REQUESTS, awaiting: true });

  assert.equal(voided.documents.length, 1);
  assert.equal(voided.documents[0].document_id, "doc-2");
  assert.equal(awaiting.documents.length, 1);
  assert.equal(awaiting.documents[0].document_id, "doc-1");
  // A filter that shrinks the backlog it is filtering is how a queue lies.
  for (const view of [voided, awaiting]) {
    assert.equal(view.summary.total, all.summary.total);
    assert.equal(view.summary.awaiting_signature, all.summary.awaiting_signature);
  }
  // An unknown status is ignored rather than emptying the screen.
  const bogus = renderAdminDocumentRecordsPayload(registry, "en", { documents: DOCUMENTS, signatureRequests: REQUESTS, status: "not-a-status" });
  assert.equal(bogus.filters.status, "");
  assert.equal(bogus.documents.length, 2);
  assert.deepEqual(bogus.filterOptions.statuses, [...DOCUMENT_STATUSES]);
});

test("the records screen is reachable from the rail and named in every admin locale", async () => {
  for (const locale of ["en", "bg", "ru"]) {
    const res = await dispatchHttp(app(), { url: `/admin/today?locale=${locale}`, headers: AUTH });
    assert.match(res.body, /data-admin-nav-route="document_records"/, locale);
    // A non-default admin locale rides on the href, so the assertion has to
    // allow the query rather than demand the bare path.
    assert.match(res.body, /href="\/admin\/documents\/records(?:\?locale=[a-z]{2})?"/, locale);
    // A destination that shows its own id is the bug this rail already had twice.
    assert.doesNotMatch(res.body, />document_records</, locale);
  }
});
