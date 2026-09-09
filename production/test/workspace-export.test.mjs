import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {
  MAX_WORKSPACE_EXPORT_TTL_SECONDS,
  appendWorkspaceExportEvent,
  assertNoRawContactField,
  assertWorkspaceExports,
  buildWorkspaceExportDocument,
  claimWorkspaceExportDownload,
  createWorkspaceExportCompleted,
  createWorkspaceExportDownloaded,
  createWorkspaceExportJob,
  normalizeWorkspaceExportRequest,
  readWorkspaceExportEvents,
  resetWorkspaceExportLedger,
  workspaceExportList,
  writeWorkspaceExportFile,
} from "../lib/workspace-export.mjs";

const AT = "2026-08-23T12:00:00.000Z";
const SCOPE = { datasets: ["enquiries", "contacts", "listings", "audit"], from: "2026-07-01", to: "2026-07-31" };

function tempDir() {
  return fs.mkdtempSync(`${os.tmpdir()}/ms-realty-workspace-export-`);
}

function tempLedger(directory) {
  const file = `${directory}/workspace-exports.jsonl`;
  resetWorkspaceExportLedger(file);
  return file;
}

// Deliberately hostile fixtures: every one of these carries data the contact
// vault holds, and none of it may survive into the export.
const LEADS = [
  {
    received_at: "2026-07-10T09:00:00.000Z",
    lead_id: "lead-1",
    source: "website_listing_detail",
    contact_fingerprint: "abcdef0123456789abcdef0123456789",
    contact: { name: "Petar", email: "petar@example.test", phone: "+359888123456" },
    message_original: "Please call me about the Sandanski flat",
    contact_preference: "phone",
  },
  { received_at: "2026-06-01T09:00:00.000Z", lead_id: "lead-outside-window", contact_fingerprint: "ffff0000ffff0000ffff0000ffff0000" },
];
const CONTACTS = [
  {
    id: "contact-abcdef0123456789",
    latest_received_at: "2026-07-10T09:00:00.000Z",
    contact: { name: "Petar", email: "petar@example.test", whatsapp: "+359888123456" },
    contact_available: true,
    lead_ids: ["lead-1"],
  },
];
const LISTINGS = [
  { id: "MS-00815", collection: "listings", facts: { title: "Flat", price_eur: 50000 } },
  { id: "page-1", collection: "pages" },
];
const AUDIT = [
  { recorded_at: "2026-07-11T09:00:00.000Z", actor: "ivan", action: "lead_created", object_type: "lead", object_id: "lead-1", metadata: {} },
  { recorded_at: "2026-05-11T09:00:00.000Z", actor: "ivan", action: "lead_created", object_type: "lead", object_id: "old", metadata: {} },
];

function documentFor(scope = SCOPE) {
  return buildWorkspaceExportDocument(
    { job_id: "workspace-export-11111111-2222-3333-4444-555555555555", requested_by: "ivan", scope },
    { leads: LEADS, contacts: CONTACTS, listings: LISTINGS, auditRows: AUDIT },
    { generatedAt: AT },
  );
}

test("the request refuses an unbounded range and an unknown dataset", () => {
  assert.deepEqual(normalizeWorkspaceExportRequest({ datasets: "audit,enquiries", from: "2026-07-01", to: "2026-07-31" }), {
    datasets: ["audit", "enquiries"],
    from: "2026-07-01",
    to: "2026-07-31",
  });
  assert.throws(() => normalizeWorkspaceExportRequest({ datasets: ["audit"] }), /from must be a YYYY-MM-DD date/);
  assert.throws(() => normalizeWorkspaceExportRequest({ datasets: ["audit"], from: "2026-07-01" }), /to must be a YYYY-MM-DD date/);
  assert.throws(() => normalizeWorkspaceExportRequest({ from: "2026-07-01", to: "2026-07-31" }), /datasets must name at least one/);
  assert.throws(() => normalizeWorkspaceExportRequest({ datasets: ["secrets"], from: "2026-07-01", to: "2026-07-31" }), /Unknown export datasets/);
  assert.throws(
    () => normalizeWorkspaceExportRequest({ datasets: ["audit"], from: "2026-07-31", to: "2026-07-01" }),
    /from must not be after to/,
  );
  assert.throws(() => normalizeWorkspaceExportRequest({ datasets: ["audit"], from: "01/07/2026", to: "2026-07-31" }), /YYYY-MM-DD/);
});

test("the export carries no vaulted contact detail and says what it withheld and why", () => {
  const document = documentFor();
  const serialized = JSON.stringify(document);

  for (const leaked of ["petar@example.test", "+359888123456", "Please call me about the Sandanski flat"]) {
    assert.ok(!serialized.includes(leaked), `the export must not contain ${leaked}`);
  }
  assert.equal(assertNoRawContactField(document), true);

  const enquiry = document.datasets.enquiries.rows[0];
  assert.equal("contact" in enquiry, false);
  assert.equal("message_original" in enquiry, false);
  // The pseudonymous join key survives, truncated, so a subject can still be found.
  assert.equal(enquiry.contact_reference, "fp:abcdef012345");
  assert.equal(enquiry.contact_preference, "phone");

  const reasons = Object.fromEntries(document.redactions.map((entry) => [`${entry.dataset}.${entry.field}`, entry]));
  assert.equal(reasons["enquiries.contact"].reason, "lead_contact_vault");
  assert.equal(reasons["enquiries.message_original"].reason, "lead_contact_vault");
  assert.equal(reasons["enquiries.contact_fingerprint"].reason, "pseudonymous_identifier");
  assert.equal(reasons["contacts.contact"].count, 1);
  assert.ok(document.redactions.every((entry) => entry.explanation && entry.explanation.length > 20));
  assert.match(document.redaction_policy, /never included in a bulk export/);
});

test("the date range is applied where a record has a timestamp and declared where it does not", () => {
  const document = documentFor();
  assert.equal(document.datasets.enquiries.count, 1);
  assert.equal(document.datasets.enquiries.date_filtered, true);
  assert.equal(document.datasets.audit.count, 1);
  assert.equal(document.datasets.audit.rows[0].object_id, "lead-1");
  assert.equal(document.datasets.contacts.count, 1);
  // Listings carry no change timestamp; the export says so rather than implying a filter.
  assert.equal(document.datasets.listings.date_filtered, false);
  assert.equal(document.datasets.listings.count, 1);
  assert.match(document.datasets.listings.date_filter_note, /was not applied/);

  const narrow = documentFor({ ...SCOPE, datasets: ["enquiries"], from: "2026-08-01", to: "2026-08-31" });
  assert.equal(narrow.datasets.enquiries.count, 0);
  assert.equal("audit" in narrow.datasets, false);
});

test("a document that still holds a vaulted field is refused before any file is written", () => {
  const directory = tempDir();
  const poisoned = documentFor();
  poisoned.datasets.enquiries.rows[0].email = "petar@example.test";
  assert.throws(() => assertNoRawContactField(poisoned), /must not contain the vaulted field/);
  assert.throws(() => writeWorkspaceExportFile(poisoned, { directory }), /must not contain the vaulted field/);
  assert.equal(fs.existsSync(`${directory}/${poisoned.job_id}.json`), false);
});

test("the export file is written owner-only and the ledger keeps only a token hash", () => {
  const directory = tempDir();
  const filePath = tempLedger(directory);
  const created = createWorkspaceExportJob({ requestedBy: "ivan", request: SCOPE }, { requestedAt: AT, ttlSeconds: 900 });
  appendWorkspaceExportEvent(created.row, { filePath });

  assert.ok(!fs.readFileSync(filePath, "utf8").includes(created.download_token), "the download token must not reach the ledger");
  assert.match(created.row.download_token_hash, /^[0-9a-f]{64}$/);
  assert.equal(created.row.download_expires_at, "2026-08-23T12:15:00.000Z");
  assert.equal(assertWorkspaceExports(readWorkspaceExportEvents(filePath)), true);

  const written = writeWorkspaceExportFile(documentFor(), { directory: `${directory}/files` });
  assert.equal(fs.statSync(written).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(written, "utf8")).kind, "ms_realty_workspace_export");

  // The TTL is clamped: no caller can mint a long-lived link.
  const long = createWorkspaceExportJob({ requestedBy: "ivan", request: SCOPE }, { requestedAt: AT, ttlSeconds: 999_999 });
  assert.equal(
    long.row.download_expires_at,
    new Date(Date.parse(AT) + MAX_WORKSPACE_EXPORT_TTL_SECONDS * 1000).toISOString(),
  );
  assert.throws(() => createWorkspaceExportJob({ requestedBy: "", request: SCOPE }), /attributable operator/);
});

test("a download link works once, for its owner, inside its window", () => {
  const directory = tempDir();
  const filePath = tempLedger(directory);
  const created = createWorkspaceExportJob({ requestedBy: "ivan", request: SCOPE }, { requestedAt: AT, ttlSeconds: 900 });
  appendWorkspaceExportEvent(created.row, { filePath });
  const jobId = created.row.job_id;
  const at = (minutes) => Date.parse(AT) + minutes * 60_000;

  // Not ready yet.
  assert.throws(
    () => claimWorkspaceExportDownload(readWorkspaceExportEvents(filePath), { jobId, token: created.download_token, operatorId: "ivan", now: at(1) }),
    (error) => error.code === "export_not_ready" && error.status === 409,
  );
  appendWorkspaceExportEvent(
    createWorkspaceExportCompleted({ jobId, filePath: `${directory}/files/${jobId}.json`, byteSize: 1234, counts: { audit: 1 } }, AT),
    { filePath },
  );

  for (const [label, options, expected] of [
    ["wrong token", { token: "not-the-token" }, "export_link_invalid"],
    ["missing token", { token: "" }, "export_link_invalid"],
    ["another operator", { operatorId: "maria" }, "export_link_invalid"],
    ["unknown job", { jobId: "workspace-export-00000000-0000-0000-0000-000000000000" }, "export_not_found"],
  ]) {
    assert.throws(
      () =>
        claimWorkspaceExportDownload(readWorkspaceExportEvents(filePath), {
          jobId,
          token: created.download_token,
          operatorId: "ivan",
          now: at(1),
          ...options,
        }),
      (error) => error.code === expected,
      label,
    );
  }

  const job = claimWorkspaceExportDownload(readWorkspaceExportEvents(filePath), {
    jobId,
    token: created.download_token,
    operatorId: "ivan",
    now: at(1),
  });
  assert.equal(job.byte_size, 1234);
  appendWorkspaceExportEvent(createWorkspaceExportDownloaded({ jobId, downloadedBy: "ivan" }, AT), { filePath });

  assert.throws(
    () =>
      claimWorkspaceExportDownload(readWorkspaceExportEvents(filePath), { jobId, token: created.download_token, operatorId: "ivan", now: at(2) }),
    (error) => error.code === "export_already_downloaded" && error.status === 410,
  );
});

test("an expired link is refused and reported as expired in the list", () => {
  const directory = tempDir();
  const filePath = tempLedger(directory);
  const created = createWorkspaceExportJob({ requestedBy: "ivan", request: SCOPE }, { requestedAt: AT, ttlSeconds: 900 });
  appendWorkspaceExportEvent(created.row, { filePath });
  const jobId = created.row.job_id;
  appendWorkspaceExportEvent(createWorkspaceExportCompleted({ jobId, filePath: "/tmp/x.json", byteSize: 1, counts: {} }, AT), { filePath });

  const expiredAt = Date.parse(AT) + 3600_000;
  assert.throws(
    () => claimWorkspaceExportDownload(readWorkspaceExportEvents(filePath), { jobId, token: created.download_token, operatorId: "ivan", now: expiredAt }),
    (error) => error.code === "export_link_expired" && error.status === 410,
  );

  const listed = workspaceExportList(readWorkspaceExportEvents(filePath), { requestedBy: "ivan", now: expiredAt });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].status, "expired");
  // The list is response-safe: no token hash, no absolute path.
  assert.equal("download_token_hash" in listed[0], false);
  assert.equal("file_path" in listed[0], false);
  assert.equal(workspaceExportList(readWorkspaceExportEvents(filePath), { requestedBy: "maria", now: expiredAt }).length, 0);
});

test("the ledger contract refuses a stored token and an unbounded recorded scope", () => {
  const created = createWorkspaceExportJob({ requestedBy: "ivan", request: SCOPE }, { requestedAt: AT });
  assert.throws(() => assertWorkspaceExports([{ ...created.row, download_token: "leak" }]), /must not store the download token/);
  assert.throws(() => assertWorkspaceExports([{ ...created.row, download_token_hash: "short" }]), /SHA-256 download token hash/);
  assert.throws(() => assertWorkspaceExports([{ ...created.row, scope: { datasets: ["audit"] } }]), /YYYY-MM-DD/);
  assert.throws(() => assertWorkspaceExports([{ ...created.row, job_id: "not-a-job" }]), /missing routing data/);
});
