import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileSignature } from "./file-cache.mjs";

// Shared SQLite-backed append-only ledger store (node:sqlite, zero deps).
//
// Pattern established by the lead ledger migration:
// - SQLite is the operational store; the JSONL file at the canonical ledger
//   path remains the audit/interop mirror, written in lockstep with appends.
// - Append-only is enforced by triggers (UPDATE/DELETE raise).
// - Indexed columns are derived conveniences and stay nullable; row_json is
//   the record of truth (hand-written/legacy JSONL rows may omit fields).
// - External JSONL replacement (fixtures, restores, manual edits) is
//   detected via file signature and rebuilds the store; the schema version
//   is kept in a meta table so derived stores self-rebuild on upgrades.
// - The .sqlite file lives next to the JSONL and is always derivable from it.

// Bump when a store's column set changes: ensureFresh rebuilds derived stores
// from the JSONL mirror on a version mismatch.
const SCHEMA_VERSION = 2;
const connections = new Map();

function assertIdentifier(value, kind) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`invalid sqlite ledger ${kind}: ${value}`);
}

export function createLedgerStore({ name, columns = [], indexes = [] }) {
  assertIdentifier(name, "table name");
  for (const identifier of [...columns, ...indexes]) assertIdentifier(identifier, "column name");
  if (!columns.length) throw new Error("sqlite ledger needs at least one indexed column");

  const TABLE = name;
  const INSERT_SQL = `INSERT INTO ${TABLE} (${columns.join(", ")}, row_json) VALUES (${columns.map(() => "?").join(", ")}, ?)`;
  const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS ${TABLE} (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
${columns.map((column) => `  ${column} TEXT`).join(",\n")},
  row_json TEXT NOT NULL
);
${indexes.map((column) => `CREATE INDEX IF NOT EXISTS idx_${TABLE}_${column} ON ${TABLE} (${column});`).join("\n")}
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TRIGGER IF NOT EXISTS ${TABLE}_no_update BEFORE UPDATE ON ${TABLE}
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS ${TABLE}_no_delete BEFORE DELETE ON ${TABLE}
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
`;

  function sqlitePathFor(filePath) {
    return `${String(filePath).replace(/\.jsonl$/i, "")}.sqlite`;
  }

  function openDb(dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec(SCHEMA);
    return db;
  }

  function closeDb(dbPath) {
    const db = connections.get(dbPath);
    if (db) {
      connections.delete(dbPath);
      db.close();
    }
  }

  function removeDbFiles(dbPath) {
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(`${dbPath}${suffix}`, { force: true });
    }
  }

  function readMeta(db, key) {
    const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
    return row ? row.value : null;
  }

  function writeMeta(db, key, value) {
    db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }

  // A torn append (crash mid-write, or two processes appending a >PIPE_BUF row)
  // leaves one unparseable line. Failing the whole read would make the ledger
  // permanently unreadable, so bad lines are quarantined and the rest survives.
  function quarantinePath(filePath) {
    return `${String(filePath).replace(/\.jsonl$/i, "")}.corrupt.jsonl`;
  }

  function parseJsonl(filePath, { quarantine = true } = {}) {
    if (!fs.existsSync(filePath)) return [];
    const rows = [];
    const damaged = [];
    for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        rows.push(JSON.parse(line));
      } catch {
        damaged.push(line);
      }
    }
    if (damaged.length && quarantine) {
      const target = quarantinePath(filePath);
      fs.appendFileSync(target, `${damaged.join("\n")}\n`);
      console.error(
        JSON.stringify({
          kind: "ledger_line_quarantined",
          ledger: TABLE,
          file: filePath,
          quarantined: damaged.length,
          quarantine_file: target,
        }),
      );
    }
    return rows;
  }

  function rowColumns(row) {
    return [...columns.map((column) => row[column] ?? null), JSON.stringify(row)];
  }

  function insertRow(db, row) {
    db.prepare(INSERT_SQL).run(...rowColumns(row));
  }

  function readAllRows(db) {
    return db
      .prepare(`SELECT row_json FROM ${TABLE} ORDER BY seq`)
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

  // `CREATE TABLE IF NOT EXISTS` leaves an older table untouched, so a store
  // that predates a column change must be detected structurally — the meta
  // version alone is not enough if a store was written before meta existed.
  function schemaMatches(db) {
    if (readMeta(db, "schema_version") !== String(SCHEMA_VERSION)) return false;
    const present = new Set(db.prepare(`PRAGMA table_info(${TABLE})`).all().map((row) => row.name));
    return columns.every((column) => present.has(column));
  }

  function ensureFresh(filePath) {
    const dbPath = sqlitePathFor(filePath);
    const jsonlSignature = fileSignature(filePath);
    let db = connections.get(dbPath) || null;
    if (!db && fs.existsSync(dbPath)) {
      db = openDb(dbPath);
      connections.set(dbPath, db);
    }
    if (db && !schemaMatches(db)) {
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

  // JSONL mirror first, then INSERT + signature in one transaction. A crash
  // between the two leaves a stale signature, which forces a rebuild from
  // the JSONL on next access — the store always converges back to consistent.
  function appendRow(filePath, row) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    let db = ensureFresh(filePath);
    if (!db) {
      const dbPath = sqlitePathFor(filePath);
      db = openDb(dbPath);
      connections.set(dbPath, db);
    }
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

  function readRows(filePath) {
    const db = ensureFresh(filePath);
    if (!db) return [];
    return readAllRows(db);
  }

  function resetLedger(filePath) {
    const dbPath = sqlitePathFor(filePath);
    closeDb(dbPath);
    removeDbFiles(dbPath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "");
  }

  // Replaces the ledger at filePath with the rows from sourcePath (JSONL) and
  // returns the imported row count. This is the JSONL -> SQLite migration path.
  function importJsonl(sourcePath, filePath) {
    const rows = parseJsonl(sourcePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, rows.length ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` : "");
    const db = rebuildDbFromRows(sqlitePathFor(filePath), rows);
    writeMeta(db, "jsonl_signature", fileSignature(filePath));
    return rows.length;
  }

  // Writes the current ledger content as JSONL (audit export / backup).
  function exportJsonl(filePath, outputPath = filePath) {
    const rows = readRows(filePath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, rows.length ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` : "");
    if (outputPath === filePath) {
      const db = ensureFresh(filePath);
      if (db) writeMeta(db, "jsonl_signature", fileSignature(filePath));
    }
    return rows.length;
  }

  // Runs fn against the reconciled store (may be null for an empty ledger).
  function withDb(filePath, fn) {
    return fn(ensureFresh(filePath));
  }

  // Indexed single-column lookup returning the earliest matching parsed row.
  function firstRowWhere(filePath, column, value) {
    if (!columns.includes(column)) throw new Error(`unknown sqlite ledger column: ${column}`);
    return withDb(filePath, (db) => {
      if (!db) return null;
      const row = db.prepare(`SELECT row_json FROM ${TABLE} WHERE ${column} = ? ORDER BY seq LIMIT 1`).get(value);
      return row ? JSON.parse(row.row_json) : null;
    });
  }

  // Indexed single-column lookup returning the most recent matching parsed row.
  function lastRowWhere(filePath, column, value) {
    if (!columns.includes(column)) throw new Error(`unknown sqlite ledger column: ${column}`);
    return withDb(filePath, (db) => {
      if (!db) return null;
      const row = db.prepare(`SELECT row_json FROM ${TABLE} WHERE ${column} = ? ORDER BY seq DESC LIMIT 1`).get(value);
      return row ? JSON.parse(row.row_json) : null;
    });
  }

  return { sqlitePathFor, appendRow, readRows, resetLedger, importJsonl, exportJsonl, withDb, firstRowWhere, lastRowWhere };
}
