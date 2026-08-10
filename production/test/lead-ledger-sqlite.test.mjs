import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  appendLead,
  assertLeadLedger,
  exportLeadLedgerJsonl,
  importLeadLedgerJsonl,
  readLeadLedger,
  resetLeadLedger,
  sqlitePathFor,
} from "../lib/lead-ledger.mjs";

const CONTACT_SECRET = "test-only-lead-contact-key-32-characters-minimum";

function leadFixture(id, email) {
  return {
    id: `inbox-${id}`,
    original_language: "en",
    admin_locale: "en",
    contact_preference: "email",
    confirmation: { status: "ready", message_key: "lead_received" },
    broker_assignment: { broker_id: "broker_international", method: "rules" },
    lead: {
      id,
      source: "website_listing_detail",
      intent: "inquiry",
      leadType: "buyer",
      listingReference: "MS-CRAWL-0001",
      contact: { email },
      requirements: { locations: ["Sandanski"], property_types: ["apartment"] },
      intake: { complete: true, missing_fields: [], captured_fields: ["locations"] },
      message: `Message for ${id}.`,
    },
    hermes_reply_draft: { broker_approval_required: true },
  };
}

function tempLedger(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ms-realty-sqlite-${name}-`));
  return path.join(dir, "leads.jsonl");
}

test("sqlite store keeps the append/read contract and mirrors JSONL", () => {
  const file = tempLedger("roundtrip");
  resetLeadLedger(file);
  const first = appendLead(leadFixture("lead-sqlite-1", "Buyer@example.com"), {
    filePath: file,
    receivedAt: "2026-07-20T10:00:00Z",
    contactSecret: CONTACT_SECRET,
  });
  const second = appendLead(leadFixture("lead-sqlite-2", "buyer@example.com"), {
    filePath: file,
    receivedAt: "2026-07-20T10:05:00Z",
    contactSecret: CONTACT_SECRET,
  });

  assert.equal(first.duplicate_status, "new_contact");
  assert.equal(second.duplicate_status, "possible_duplicate", "indexed fingerprint lookup finds the earlier lead");
  assert.equal(second.possible_duplicate_of, "lead-sqlite-1");

  const rows = readLeadLedger(file);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.lead_id),
    ["lead-sqlite-1", "lead-sqlite-2"],
  );
  assertLeadLedger(rows);

  const mirror = fs
    .readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(mirror, rows, "JSONL mirror is identical to the SQLite store");
  assert.ok(fs.existsSync(sqlitePathFor(file)), "sqlite store file exists next to the JSONL");
});

test("external JSONL replacement rebuilds the sqlite store (fixture/restore path)", () => {
  const file = tempLedger("reconcile");
  resetLeadLedger(file);
  appendLead(leadFixture("lead-original", "a@example.com"), {
    filePath: file,
    receivedAt: "2026-07-20T10:00:00Z",
    contactSecret: CONTACT_SECRET,
  });

  const fixtureRows = [
    {
      ...appendLead(leadFixture("lead-fixture", "f@example.com"), {
        filePath: tempLedger("fixture-source"),
        receivedAt: "2026-07-20T11:00:00Z",
        contactSecret: CONTACT_SECRET,
      }),
    },
  ];
  fs.writeFileSync(file, `${fixtureRows.map((row) => JSON.stringify(row)).join("\n")}\n`);

  const rows = readLeadLedger(file);
  assert.deepEqual(
    rows.map((row) => row.lead_id),
    ["lead-fixture"],
    "store follows the externally replaced JSONL mirror",
  );

  appendLead(leadFixture("lead-after-restore", "b@example.com"), {
    filePath: file,
    receivedAt: "2026-07-20T12:00:00Z",
    contactSecret: CONTACT_SECRET,
  });
  assert.deepEqual(
    readLeadLedger(file).map((row) => row.lead_id),
    ["lead-fixture", "lead-after-restore"],
    "appends continue on top of restored content",
  );
});

test("sqlite store is append-only", () => {
  const file = tempLedger("append-only");
  resetLeadLedger(file);
  appendLead(leadFixture("lead-immutable", "c@example.com"), {
    filePath: file,
    receivedAt: "2026-07-20T10:00:00Z",
    contactSecret: CONTACT_SECRET,
  });

  const db = new DatabaseSync(sqlitePathFor(file));
  assert.throws(() => db.prepare("UPDATE leads SET source = ? WHERE lead_id = ?").run("tampered", "lead-immutable"), /append-only/);
  assert.throws(() => db.prepare("DELETE FROM leads").run(), /append-only/);
  db.close();
});

test("import migrates legacy JSONL and export reproduces identical JSONL", () => {
  const legacySource = tempLedger("legacy-source");
  resetLeadLedger(legacySource);
  appendLead(leadFixture("lead-legacy-1", "d@example.com"), {
    filePath: legacySource,
    receivedAt: "2026-07-20T09:00:00Z",
    contactSecret: CONTACT_SECRET,
  });
  appendLead(leadFixture("lead-legacy-2", "e@example.com"), {
    filePath: legacySource,
    receivedAt: "2026-07-20T09:05:00Z",
    contactSecret: CONTACT_SECRET,
  });
  const legacyJsonl = fs.readFileSync(legacySource, "utf8");

  const migrated = tempLedger("migrated");
  const imported = importLeadLedgerJsonl(legacySource, migrated);
  assert.equal(imported, 2);
  assert.equal(fs.readFileSync(migrated, "utf8"), legacyJsonl, "import writes the same JSONL mirror");
  assertLeadLedger(readLeadLedger(migrated));

  const exportPath = path.join(path.dirname(migrated), "audit-export.jsonl");
  const exported = exportLeadLedgerJsonl(migrated, exportPath);
  assert.equal(exported, 2);
  assert.equal(fs.readFileSync(exportPath, "utf8"), legacyJsonl, "audit export reproduces the legacy JSONL byte-for-byte");
});

test("reset clears both the sqlite store and the JSONL mirror", () => {
  const file = tempLedger("reset");
  resetLeadLedger(file);
  appendLead(leadFixture("lead-reset", "g@example.com"), {
    filePath: file,
    receivedAt: "2026-07-20T10:00:00Z",
    contactSecret: CONTACT_SECRET,
  });
  assert.equal(readLeadLedger(file).length, 1);

  resetLeadLedger(file);
  assert.equal(fs.existsSync(sqlitePathFor(file)), false, "reset removes the sqlite store");
  assert.equal(fs.readFileSync(file, "utf8"), "");
  assert.deepEqual(readLeadLedger(file), []);
});
