import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  appendDocumentChecklistOutcome,
  assertDocumentChecklistOutcomes,
  buildDocumentChecklistQueue,
  readDocumentChecklistOutcomes,
  resetDocumentChecklistOutcomes,
} from "../lib/document-checklists.mjs";

const lead = {
  lead_id: "lead-docs-1",
  lead_type: "buyer",
  original_language: "ru",
  admin_locale: "ru",
  listing_reference: "MS-CRAWL-0114",
  assigned_broker: "broker_ru",
};

test("document checklist localizes real-estate process tasks and flags foreign-buyer scoping without assuming it applies", () => {
  const queue = buildDocumentChecklistQueue([lead], [], { locale: "ru" });
  assert.equal(queue.rows[0].items[0].key, "foreign_process_scope");
  assert.match(queue.rows[0].items[0].label, /иностранного покупателя/);
  assert.equal(queue.rows[0].progress_percent, 0);
  assert.equal(queue.summary.open, 1);
});

test("document checklist outcomes require a human, preserve no document bodies, and drive progress", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-document-checklist-")), "outcomes.jsonl");
  resetDocumentChecklistOutcomes(file);
  const result = appendDocumentChecklistOutcome(
    [lead],
    {
      leadId: lead.lead_id,
      itemKey: "foreign_process_scope",
      status: "complete",
      actor: "broker_ru",
      note: "Broker confirmed the foreign-buyer guidance path is required.",
      humanConfirmed: true,
    },
    { filePath: file, recordedAt: "2026-07-19T12:00:00.000Z" },
  );
  assert.equal(result.idempotent, false);
  assert.equal(result.checklist.completed_count, 1);
  const rows = readDocumentChecklistOutcomes(file);
  assert.equal(assertDocumentChecklistOutcomes(rows), true);
  assert.doesNotMatch(fs.readFileSync(file, "utf8"), /base64|document_url|file_path/);
  assert.throws(() => appendDocumentChecklistOutcome([lead], { leadId: lead.lead_id, itemKey: "identity_review", status: "complete", actor: "broker_ru", humanConfirmed: true }, { filePath: file }), /note or internal reference/);
  assert.throws(() => appendDocumentChecklistOutcome([lead], { leadId: lead.lead_id, itemKey: "identity_review", status: "blocked", actor: "broker_ru", note: "Waiting", humanConfirmed: false }, { filePath: file }), /Human confirmation/);
});
