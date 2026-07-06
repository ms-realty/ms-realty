import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { appendAuditLog, assertAuditLog, createAuditLogEntry, readAuditLog, resetAuditLog } from "../lib/audit-log.mjs";

function tempAuditLog() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-audit-test-`)}/audit.jsonl`;
  resetAuditLog(file);
  return file;
}

test("audit log stores bounded admin mutation metadata without private content", () => {
  const filePath = tempAuditLog();
  const entry = appendAuditLog(
    createAuditLogEntry(
      {
        action: "listing_edited",
        actor: "content_editor",
        objectType: "listing",
        objectId: "MS-CRAWL-0001",
        locale: "bg",
        metadata: {
          changed_fields: ["title", "description"],
          stale_translation_count: 2,
        },
      },
      "2026-07-06T00:00:00Z",
    ),
    { filePath },
  );

  const rows = readAuditLog(filePath);
  assert.equal(assertAuditLog(rows), true);
  assert.equal(rows.length, 1);
  assert.equal(entry.action, "listing_edited");
  assert.deepEqual(entry.metadata.changed_fields, ["title", "description"]);
});

test("audit log rejects unknown actions and raw private fields", () => {
  assert.throws(
    () => createAuditLogEntry({ action: "delete_everything", objectType: "listing", objectId: "MS-CRAWL-0001" }),
    /Unknown audit action/,
  );
  assert.throws(
    () => createAuditLogEntry({ action: "listing_edited", objectType: "", objectId: "MS-CRAWL-0001" }),
    /Audit object type and id are required/,
  );
  assert.throws(
    () =>
      createAuditLogEntry({
        action: "reply_approved",
        actor: "broker_ru",
        objectType: "reply",
        objectId: "reply-1",
        metadata: { reviewedReply: "Raw customer reply text" },
      }),
    /must not store raw private fields/,
  );
});
