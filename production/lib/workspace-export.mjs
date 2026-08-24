import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";
import { newRecordId } from "./record-ids.mjs";

// Workspace data export: the surface a GDPR subject-access request or an
// accountant handover actually uses, so it is built to be defensible rather
// than convenient.
//
// - Every export is a job with a recorded requester and an explicit date range.
//   There is no "everything" export; from and to are both required.
// - The document is assembled from ledger rows only. The lead contact vault is
//   never opened, so no raw email, phone, WhatsApp/Viber handle or enquiry
//   message can reach the file.
// - Whatever the scrubber removes is named in the document itself, with the
//   reason and a count, so the recipient can see the export is partial and why.
// - assertNoRawContactField runs over the finished document and throws before
//   anything is written. A leak is a refusal, not a warning.
// - The file is fetched once, through a token that is stored only as a hash and
//   expires in minutes.

export const DEFAULT_WORKSPACE_EXPORT_LEDGER_PATH = fromRoot("production", "data", "workspace-exports.jsonl");
export const DEFAULT_WORKSPACE_EXPORT_DIR = fromRoot("production", "data", "workspace-exports");
export const WORKSPACE_EXPORT_DATASETS = ["enquiries", "contacts", "listings", "audit"];
export const DEFAULT_WORKSPACE_EXPORT_TTL_SECONDS = 900;
export const MAX_WORKSPACE_EXPORT_TTL_SECONDS = 3600;
export const WORKSPACE_EXPORT_SCHEMA_VERSION = 1;

const EVENTS = new Set(["export_requested", "export_completed", "export_downloaded", "export_failed"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const JOB_ID = /^workspace-export-[0-9a-f-]{36}$/;

// Held by the contact vault (AES-256-GCM) or otherwise raw personal content.
// None of these may appear in an export document at any depth.
const VAULTED_FIELDS = new Map([
  ["contact", "lead_contact_vault"],
  ["email", "lead_contact_vault"],
  ["phone", "lead_contact_vault"],
  ["whatsapp", "lead_contact_vault"],
  ["viber", "lead_contact_vault"],
  ["message", "lead_contact_vault"],
  ["message_original", "lead_contact_vault"],
  ["body", "raw_personal_content"],
  ["prompt", "raw_personal_content"],
  ["reviewedReply", "raw_personal_content"],
  ["sourceContent", "raw_personal_content"],
]);

const REDACTION_REASONS = {
  lead_contact_vault:
    "Held encrypted in the lead contact vault. Releasing it needs a separate, individually authorised vault read, not a bulk export.",
  raw_personal_content: "Raw message content written by or about a person; the export carries routing metadata only.",
  pseudonymous_identifier:
    "Replaced with a truncated reference. The full keyed fingerprint would let a holder of the contact key re-identify the subject.",
};

function isoDate(value, label) {
  const raw = String(value || "").trim();
  if (!ISO_DATE.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00.000Z`))) {
    throw new Error(`${label} must be a YYYY-MM-DD date`);
  }
  return raw;
}

export function normalizeWorkspaceExportRequest(input = {}) {
  const requested = Array.isArray(input.datasets)
    ? input.datasets
    : typeof input.datasets === "string"
      ? input.datasets.split(",")
      : [];
  const datasets = [...new Set(requested.map((dataset) => String(dataset || "").trim().toLowerCase()).filter(Boolean))].sort();
  if (!datasets.length) throw new Error(`datasets must name at least one of: ${WORKSPACE_EXPORT_DATASETS.join(", ")}`);
  const unknown = datasets.filter((dataset) => !WORKSPACE_EXPORT_DATASETS.includes(dataset));
  if (unknown.length) throw new Error(`Unknown export datasets: ${unknown.join(", ")}`);
  // An unbounded export is the accident this route exists to prevent.
  const from = isoDate(input.from ?? input.from_date, "from");
  const to = isoDate(input.to ?? input.to_date, "to");
  if (from > to) throw new Error("from must not be after to");
  return { datasets, from, to };
}

function windowBounds({ from, to }) {
  return { start: Date.parse(`${from}T00:00:00.000Z`), end: Date.parse(`${to}T23:59:59.999Z`) };
}

function withinWindow(value, bounds) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return false;
  return timestamp >= bounds.start && timestamp <= bounds.end;
}

export function workspaceExportTokenHash(token) {
  const value = String(token || "");
  if (!value) throw new Error("An export download token is required");
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function createWorkspaceExportJob(
  { requestedBy, request },
  { requestedAt = new Date().toISOString(), ttlSeconds = DEFAULT_WORKSPACE_EXPORT_TTL_SECONDS, token } = {},
) {
  const requester = String(requestedBy || "").trim();
  if (!requester) throw new Error("A workspace export requires an attributable operator");
  const scope = normalizeWorkspaceExportRequest(request);
  const ttl = Math.max(60, Math.min(Math.floor(Number(ttlSeconds) || 0), MAX_WORKSPACE_EXPORT_TTL_SECONDS));
  const downloadToken = token || crypto.randomBytes(32).toString("base64url");
  const requestedAtMs = Date.parse(requestedAt);
  if (!Number.isFinite(requestedAtMs)) throw new Error("requestedAt must be an ISO timestamp");
  return {
    // The plaintext token is returned once, in the request response, and never stored.
    download_token: downloadToken,
    row: {
      recorded_at: requestedAt,
      event: "export_requested",
      job_id: newRecordId("workspace-export"),
      requested_by: requester,
      scope,
      download_token_hash: workspaceExportTokenHash(downloadToken),
      download_expires_at: new Date(requestedAtMs + ttl * 1000).toISOString(),
    },
  };
}

// Recursively removes every vaulted field, recording what went and why.
function scrub(value, dataset, redactions, keyPath = "") {
  if (Array.isArray(value)) return value.map((entry) => scrub(entry, dataset, redactions, keyPath));
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = keyPath ? `${keyPath}.${key}` : key;
    const reason = VAULTED_FIELDS.get(key);
    if (reason) {
      const record = redactions.get(`${dataset}:${nextPath}`) || { dataset, field: nextPath, reason, count: 0 };
      record.count += 1;
      redactions.set(`${dataset}:${nextPath}`, record);
      continue;
    }
    if (key === "contact_fingerprint") {
      const fingerprint = typeof nested === "string" ? nested.trim() : "";
      if (fingerprint) {
        const record = redactions.get(`${dataset}:contact_fingerprint`) || {
          dataset,
          field: "contact_fingerprint",
          reason: "pseudonymous_identifier",
          count: 0,
        };
        record.count += 1;
        redactions.set(`${dataset}:contact_fingerprint`, record);
      }
      output.contact_reference = fingerprint ? `fp:${fingerprint.slice(0, 12)}` : null;
      continue;
    }
    output[key] = scrub(nested, dataset, redactions, nextPath);
  }
  return output;
}

export function assertNoRawContactField(value, keyPath = "document") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoRawContactField(entry, `${keyPath}[${index}]`));
    return true;
  }
  if (!value || typeof value !== "object") return true;
  for (const [key, nested] of Object.entries(value)) {
    if (VAULTED_FIELDS.has(key)) throw new Error(`Workspace export must not contain the vaulted field ${keyPath}.${key}`);
    assertNoRawContactField(nested, `${keyPath}.${key}`);
  }
  return true;
}

export function buildWorkspaceExportDocument(
  job,
  { leads = [], contacts = [], listings = [], auditRows = [] } = {},
  { generatedAt = new Date().toISOString() } = {},
) {
  const scope = normalizeWorkspaceExportRequest(job?.scope || {});
  const bounds = windowBounds(scope);
  const redactions = new Map();
  const datasets = {};

  if (scope.datasets.includes("enquiries")) {
    const rows = leads.filter((lead) => withinWindow(lead?.received_at, bounds));
    datasets.enquiries = { date_field: "received_at", date_filtered: true, count: rows.length, rows: scrub(rows, "enquiries", redactions) };
  }
  if (scope.datasets.includes("contacts")) {
    const rows = contacts.filter((contact) => withinWindow(contact?.latest_received_at, bounds));
    datasets.contacts = {
      date_field: "latest_received_at",
      date_filtered: true,
      count: rows.length,
      rows: scrub(rows, "contacts", redactions),
    };
  }
  if (scope.datasets.includes("listings")) {
    const rows = listings.filter((record) => record?.collection === "listings");
    // Listing records carry no per-record timestamp, so the date range cannot
    // narrow them. Saying so beats implying a filter that did not happen.
    datasets.listings = {
      date_field: null,
      date_filtered: false,
      date_filter_note: "Listing records carry no change timestamp, so the requested date range was not applied to this dataset.",
      count: rows.length,
      rows: scrub(rows, "listings", redactions),
    };
  }
  if (scope.datasets.includes("audit")) {
    const rows = auditRows.filter((entry) => withinWindow(entry?.recorded_at, bounds));
    datasets.audit = { date_field: "recorded_at", date_filtered: true, count: rows.length, rows: scrub(rows, "audit", redactions) };
  }

  const document = {
    schema_version: WORKSPACE_EXPORT_SCHEMA_VERSION,
    kind: "ms_realty_workspace_export",
    job_id: job.job_id,
    generated_at: generatedAt,
    requested_by: job.requested_by,
    scope,
    datasets,
    redactions: [...redactions.values()]
      .map((entry) => ({ ...entry, explanation: REDACTION_REASONS[entry.reason] }))
      .sort((left, right) => left.dataset.localeCompare(right.dataset) || left.field.localeCompare(right.field)),
    redaction_policy:
      "Contact details and enquiry message bodies live encrypted in the lead contact vault and are never included in a bulk export. " +
      "Each row keeps a truncated contact_reference so a specific subject can still be located and answered through an individually " +
      "authorised vault read.",
  };
  // Fail closed: refuse to produce a file at all if anything vaulted survived.
  assertNoRawContactField(document);
  return document;
}

export function writeWorkspaceExportFile(document, { directory = DEFAULT_WORKSPACE_EXPORT_DIR } = {}) {
  const jobId = String(document?.job_id || "");
  if (!JOB_ID.test(jobId)) throw new Error("Workspace export document is missing a valid job id");
  assertNoRawContactField(document);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filePath = path.join(directory, `${jobId}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
  return filePath;
}

export function createWorkspaceExportCompleted(
  { jobId, filePath, byteSize, counts },
  recordedAt = new Date().toISOString(),
) {
  if (!JOB_ID.test(String(jobId || ""))) throw new Error("Workspace export completion requires a valid job id");
  return {
    recorded_at: recordedAt,
    event: "export_completed",
    job_id: jobId,
    file_path: String(filePath || ""),
    byte_size: Number(byteSize) || 0,
    counts: counts || {},
  };
}

export function createWorkspaceExportDownloaded({ jobId, downloadedBy }, recordedAt = new Date().toISOString()) {
  const actor = String(downloadedBy || "").trim();
  if (!JOB_ID.test(String(jobId || ""))) throw new Error("Workspace export download requires a valid job id");
  if (!actor) throw new Error("Workspace export download requires an attributable operator");
  return { recorded_at: recordedAt, event: "export_downloaded", job_id: jobId, downloaded_by: actor };
}

export function resetWorkspaceExportLedger(filePath = DEFAULT_WORKSPACE_EXPORT_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "", { mode: 0o600 });
}

export function readWorkspaceExportEvents(filePath = DEFAULT_WORKSPACE_EXPORT_LEDGER_PATH) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function appendWorkspaceExportEvent(row, { filePath = DEFAULT_WORKSPACE_EXPORT_LEDGER_PATH } = {}) {
  assertWorkspaceExports([row]);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
  return row;
}

export function workspaceExportJobs(rows = [], { now = Date.now() } = {}) {
  const jobs = new Map();
  for (const row of rows) {
    if (!EVENTS.has(row?.event) || !row.job_id) continue;
    if (row.event === "export_requested") {
      jobs.set(row.job_id, {
        job_id: row.job_id,
        requested_at: row.recorded_at,
        requested_by: row.requested_by,
        scope: row.scope,
        status: "queued",
        download_token_hash: row.download_token_hash,
        download_expires_at: row.download_expires_at,
        file_path: null,
        byte_size: 0,
        counts: {},
        completed_at: null,
        downloaded_at: null,
        downloaded_by: null,
        error: null,
      });
      continue;
    }
    const job = jobs.get(row.job_id);
    if (!job) continue;
    if (row.event === "export_completed") {
      job.status = "ready";
      job.completed_at = row.recorded_at;
      job.file_path = row.file_path;
      job.byte_size = row.byte_size;
      job.counts = row.counts || {};
    } else if (row.event === "export_downloaded") {
      job.status = "downloaded";
      job.downloaded_at = row.recorded_at;
      job.downloaded_by = row.downloaded_by;
    } else if (row.event === "export_failed") {
      job.status = "failed";
      job.error = row.error || "export_failed";
    }
  }
  for (const job of jobs.values()) {
    const expiresAt = Date.parse(job.download_expires_at || "");
    job.expired = Number.isFinite(expiresAt) && expiresAt <= now;
    if (job.status === "ready" && job.expired) job.status = "expired";
  }
  return jobs;
}

// Response-safe list: no token hash, no absolute file path.
export function workspaceExportList(rows = [], { requestedBy = "", scope = "self", now = Date.now() } = {}) {
  const requester = String(requestedBy || "").trim();
  return [...workspaceExportJobs(rows, { now }).values()]
    .filter((job) => (scope === "all" ? true : job.requested_by === requester))
    .map(({ download_token_hash: _hash, file_path: _path, ...job }) => job)
    .sort((left, right) => String(right.requested_at).localeCompare(String(left.requested_at)));
}

// One download, one token, one window. Every refusal names its own reason.
export function claimWorkspaceExportDownload(rows = [], { jobId, token, operatorId, now = Date.now() } = {}) {
  const job = workspaceExportJobs(rows, { now }).get(String(jobId || ""));
  const refuse = (kind, message, status = 404) => {
    const error = new Error(message);
    error.status = status;
    error.code = kind;
    return error;
  };
  if (!job) throw refuse("export_not_found", "That export does not exist");
  const supplied = String(token || "");
  if (!supplied) throw refuse("export_link_invalid", "That export link is not valid", 403);
  const expected = Buffer.from(job.download_token_hash || "", "hex");
  const actual = Buffer.from(workspaceExportTokenHash(supplied), "hex");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw refuse("export_link_invalid", "That export link is not valid", 403);
  }
  // Ownership is checked after the token, so a wrong token and a wrong owner
  // are indistinguishable to a caller holding neither.
  const requester = String(operatorId || "").trim();
  if (requester && job.requested_by !== requester) throw refuse("export_link_invalid", "That export link is not valid", 403);
  if (job.status === "downloaded") throw refuse("export_already_downloaded", "That export has already been downloaded", 410);
  if (job.expired) throw refuse("export_link_expired", "That export link has expired", 410);
  if (job.status !== "ready") throw refuse("export_not_ready", `That export is ${job.status}`, 409);
  return job;
}

export function assertWorkspaceExports(rows) {
  for (const row of rows || []) {
    if (!EVENTS.has(row?.event) || !row.recorded_at || !JOB_ID.test(String(row.job_id || ""))) {
      throw new Error("Workspace export row is missing routing data");
    }
    if ("download_token" in row) throw new Error("Workspace export ledger must not store the download token");
    if (row.event === "export_requested") {
      if (!row.requested_by) throw new Error("Workspace export request must name the requester");
      if (!/^[0-9a-f]{64}$/.test(String(row.download_token_hash || ""))) {
        throw new Error("Workspace export request must store a SHA-256 download token hash");
      }
      normalizeWorkspaceExportRequest(row.scope || {});
    }
  }
  return true;
}
