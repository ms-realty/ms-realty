import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fromRoot } from "./paths.mjs";
import { fileSignature } from "./file-cache.mjs";

// Lead ledger v2: SQLite (node:sqlite) is the operational store; the JSONL
// file at the canonical ledger path remains the audit/interop mirror.
//
// - Appends insert one immutable row (append-only triggers forbid UPDATE and
//   DELETE) and mirror the same line to the JSONL file, so existing tooling
//   that reads lead-ledger.jsonl keeps working unchanged.
// - Duplicate detection uses an indexed SELECT instead of a full-file parse.
// - If something outside this module replaces the JSONL (smoke fixtures,
//   backup restore, manual edit), the next access detects the changed file
//   signature and rebuilds the SQLite store from the JSONL.
// - The SQLite file lives next to the JSONL as <name>.sqlite and is a
//   derived store: the JSONL mirror can always regenerate it.

export const DEFAULT_LEAD_LEDGER_PATH = fromRoot("production", "data", "lead-ledger.jsonl");

const SCHEMA_VERSION = 1;

// Indexed columns are derived conveniences for queries; row_json is the
// record of truth. Columns stay nullable because hand-written or legacy
// JSONL rows may omit any individual field.
const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS leads (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT,
  lead_id TEXT,
  source TEXT,
  intent TEXT,
  lead_type TEXT,
  original_language TEXT,
  admin_locale TEXT,
  assigned_broker TEXT,
  contact_fingerprint TEXT,
  duplicate_status TEXT,
  possible_duplicate_of TEXT,
  sla_due_at TEXT,
  row_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_contact_fingerprint ON leads (contact_fingerprint);
CREATE INDEX IF NOT EXISTS idx_leads_sla_due_at ON leads (sla_due_at);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TRIGGER IF NOT EXISTS lead_ledger_no_update BEFORE UPDATE ON leads
BEGIN SELECT RAISE(ABORT, 'lead ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS lead_ledger_no_delete BEFORE DELETE ON leads
BEGIN SELECT RAISE(ABORT, 'lead ledger is append-only'); END;
`;

const connections = new Map();

export function sqlitePathFor(filePath = DEFAULT_LEAD_LEDGER_PATH) {
  return `${String(filePath).replace(/\.jsonl$/i, "")}.sqlite`;
}

function openDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  return db;
}

function removeDbFiles(dbPath) {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

function closeDb(dbPath) {
  const db = connections.get(dbPath);
  if (db) {
    connections.delete(dbPath);
    db.close();
  }
}

function readMeta(db, key) {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row ? row.value : null;
}

function writeMeta(db, key, value) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

function parseJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function rowColumns(row) {
  return [
    row.received_at ?? null,
    row.lead_id ?? null,
    row.source ?? null,
    row.intent ?? null,
    row.lead_type ?? null,
    row.original_language ?? null,
    row.admin_locale ?? null,
    row.assigned_broker ?? null,
    row.contact_fingerprint ?? null,
    row.duplicate_status ?? null,
    row.possible_duplicate_of ?? null,
    row.sla_due_at ?? null,
    JSON.stringify(row),
  ];
}

const INSERT_SQL = `INSERT INTO leads (
  received_at, lead_id, source, intent, lead_type, original_language, admin_locale,
  assigned_broker, contact_fingerprint, duplicate_status, possible_duplicate_of, sla_due_at, row_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function insertRow(db, row) {
  db.prepare(INSERT_SQL).run(...rowColumns(row));
}

function readAllRows(db) {
  return db
    .prepare("SELECT row_json FROM leads ORDER BY seq")
    .all()
    .map((row) => JSON.parse(row.row_json));
}

function rebuildDbFromRows(dbPath, rows) {
  closeDb(dbPath);
  removeDbFiles(dbPath);
  const db = openDb(dbPath);
  db.exec("BEGIN");
  try {
    for (const row of rows) insertRow(db, row);
    writeMeta(db, "schema_version", String(SCHEMA_VERSION));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  connections.set(dbPath, db);
  return db;
}

// Returns an open DatabaseSync for the ledger, or null when the ledger is
// empty/nonexistent. Reconciles the SQLite store with the JSONL mirror when
// the mirror changed on disk, and rebuilds when the schema version predates
// the current one (the store is always derivable from the JSONL).
function ensureFresh(filePath) {
  const dbPath = sqlitePathFor(filePath);
  const jsonlSignature = fileSignature(filePath);
  let db = connections.get(dbPath) || null;
  if (!db && fs.existsSync(dbPath)) {
    db = openDb(dbPath);
    connections.set(dbPath, db);
  }
  if (db && readMeta(db, "schema_version") !== String(SCHEMA_VERSION)) {
    const rows = fs.existsSync(filePath) ? parseJsonl(filePath) : readAllRows(db);
    db = rebuildDbFromRows(dbPath, rows);
    writeMeta(db, "jsonl_signature", jsonlSignature);
    return db;
  }
  if (jsonlSignature === null) {
    // No JSONL mirror: the SQLite store (if any) is authoritative.
    return db;
  }
  if (db && readMeta(db, "jsonl_signature") === jsonlSignature) return db;
  const rows = parseJsonl(filePath);
  db = rebuildDbFromRows(dbPath, rows);
  writeMeta(db, "jsonl_signature", jsonlSignature);
  return db;
}

export function resetLeadLedger(filePath = DEFAULT_LEAD_LEDGER_PATH) {
  const dbPath = sqlitePathFor(filePath);
  closeDb(dbPath);
  removeDbFiles(dbPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

function minutesAfter(isoString, minutes) {
  const time = Date.parse(isoString);
  if (!Number.isFinite(time)) throw new Error("receivedAt must be an ISO timestamp");
  return new Date(time + minutes * 60 * 1000).toISOString();
}

function normalizeContactValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function contactFingerprint(contact = {}) {
  const email = normalizeContactValue(contact.email);
  const phone = normalizeContactValue(contact.phone || contact.whatsapp || contact.viber).replace(/[^\d+]/g, "");
  const key = email ? `email:${email}` : phone ? `phone:${phone}` : "";
  return key ? crypto.createHash("sha256").update(key).digest("hex") : null;
}

function optionalMessage(value) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 2000) : null;
}

export function appendLead(
  lead,
  { filePath = DEFAULT_LEAD_LEDGER_PATH, receivedAt = new Date().toISOString(), slaMinutes = 15, escalationMinutes = 60 } = {},
) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const dbPath = sqlitePathFor(filePath);
  let db = ensureFresh(filePath);
  if (!db) {
    db = openDb(dbPath);
    connections.set(dbPath, db);
  }
  const slaDueAt = minutesAfter(receivedAt, slaMinutes);
  const contact_fingerprint = contactFingerprint(lead.lead?.contact);
  const possibleDuplicate = contact_fingerprint
    ? db
        .prepare("SELECT row_json FROM leads WHERE contact_fingerprint = ? ORDER BY seq LIMIT 1")
        .get(contact_fingerprint)
    : null;
  const messageOriginal = optionalMessage(lead.message_original || lead.message || lead.lead?.message);
  const row = {
    received_at: receivedAt,
    id: lead.id,
    lead_id: lead.lead?.id,
    source: lead.lead?.source,
    intent: lead.lead?.intent || null,
    lead_type: lead.lead?.leadType,
    listing_reference: lead.lead?.listingReference || null,
    property: lead.lead?.property || {},
    request_details: lead.lead?.request_details || {},
    requirements: lead.lead?.requirements || {},
    intake_completion: lead.lead?.intake || lead.intake || { complete: false, missing_fields: [], captured_fields: [] },
    original_language: lead.original_language,
    admin_locale: lead.admin_locale,
    message_original: messageOriginal,
    show_original_available: Boolean(messageOriginal),
    contact_preference: lead.contact_preference,
    broker_approval_required: lead.hermes_reply_draft?.broker_approval_required === true,
    confirmation_status: lead.confirmation?.status || null,
    confirmation_message_key: lead.confirmation?.message_key || null,
    assigned_broker: lead.broker_assignment?.broker_id || null,
    assignment_method: lead.broker_assignment?.method || null,
    contact_fingerprint,
    duplicate_status: contact_fingerprint ? (possibleDuplicate ? "possible_duplicate" : "new_contact") : "no_contact_key",
    possible_duplicate_of: possibleDuplicate ? JSON.parse(possibleDuplicate.row_json).lead_id : null,
    sla_due_at: slaDueAt,
    manager_escalation_due_at: minutesAfter(receivedAt, escalationMinutes),
    follow_up_task: {
      id: `sla-${lead.lead?.id || lead.id}`,
      status: "open",
      owner: "broker_assignment",
      due_at: slaDueAt,
      action: "broker_response_required",
    },
    qualification_task: {
      id: `intake-${lead.lead?.id || lead.id}`,
      status: (lead.lead?.intake || lead.intake)?.complete === true ? "complete" : "open",
      owner: lead.broker_assignment?.broker_id || "broker_assignment",
      action: "complete_intake_requirements",
      missing_fields: (lead.lead?.intake || lead.intake)?.missing_fields || [],
    },
  };
  // JSONL mirror first, then INSERT + signature in one transaction. A crash
  // between the two leaves a stale signature, which forces a rebuild from
  // the JSONL on next access — the store always converges back to consistent.
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`);
  const mirrorSignature = fileSignature(filePath);
  db.exec("BEGIN");
  try {
    insertRow(db, row);
    writeMeta(db, "jsonl_signature", mirrorSignature);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return row;
}

export function readLeadLedger(filePath = DEFAULT_LEAD_LEDGER_PATH) {
  const db = ensureFresh(filePath);
  if (!db) return [];
  return readAllRows(db);
}

// Replaces the ledger at filePath with the rows from sourcePath (JSONL) and
// returns the imported row count. This is the JSONL -> SQLite migration path.
export function importLeadLedgerJsonl(sourcePath, filePath = DEFAULT_LEAD_LEDGER_PATH) {
  const rows = parseJsonl(sourcePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, rows.length ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` : "");
  const db = rebuildDbFromRows(sqlitePathFor(filePath), rows);
  writeMeta(db, "jsonl_signature", fileSignature(filePath));
  return rows.length;
}

// Writes the current ledger content as JSONL (audit export / backup).
export function exportLeadLedgerJsonl(filePath = DEFAULT_LEAD_LEDGER_PATH, outputPath = filePath) {
  const rows = readLeadLedger(filePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, rows.length ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` : "");
  if (outputPath === filePath) {
    const db = ensureFresh(filePath);
    if (db) writeMeta(db, "jsonl_signature", fileSignature(filePath));
  }
  return rows.length;
}

export function assertLeadLedger(rows) {
  if (!rows.length) throw new Error("Lead ledger must contain at least one row");
  for (const row of rows) {
    if (!row.lead_id || !row.source || !row.original_language || !row.admin_locale) {
      throw new Error("Lead ledger row is missing routing data");
    }
    if (row.broker_approval_required !== true) throw new Error("Lead ledger must preserve broker approval gate");
    if (row.confirmation_status !== "ready" || row.confirmation_message_key !== "lead_received") {
      throw new Error("Lead ledger must preserve the instant confirmation contract");
    }
    if (!row.assigned_broker || !row.assignment_method) throw new Error("Lead ledger must preserve broker assignment");
    if ("contact" in row || "email" in row || "phone" in row) throw new Error("Lead ledger must not persist raw contact data");
    if (row.duplicate_status === "possible_duplicate" && !row.possible_duplicate_of) {
      throw new Error("Possible duplicate lead rows must reference the earlier lead");
    }
    if (!row.sla_due_at || row.follow_up_task?.status !== "open") {
      throw new Error("Lead ledger must create an immediate broker follow-up SLA task");
    }
    if (!row.requirements || !row.intake_completion || !row.qualification_task) {
      throw new Error("Lead ledger must preserve intake requirements and qualification work");
    }
    if (row.intake_completion.complete !== true && row.qualification_task.status !== "open") {
      throw new Error("Incomplete intake must create an open qualification task");
    }
  }
  return true;
}
