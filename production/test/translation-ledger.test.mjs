import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {
  assertHermesAuditLedger,
  appendTranslationTask,
  assertTranslationLedger,
  latestTranslationTasks,
  readHermesAuditLedger,
  readTranslationLedger,
  resetTranslationLedger,
} from "../lib/translation-ledger.mjs";

test("translation ledger keeps draft and published review states", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-translations-`)}/translations.jsonl`;
  resetTranslationLedger(file);
  appendTranslationTask({ id: "task-1", status: "hermes_drafted", public_indexable: false }, { filePath: file });
  appendTranslationTask(
    { id: "task-1", status: "published", human_approved: true, public_indexable: true },
    { filePath: file },
  );

  const rows = readTranslationLedger(file);
  assert.equal(rows.length, 2);
  assert.equal(latestTranslationTasks(rows)[0].status, "published");
  assert.equal(assertTranslationLedger(rows), true);
});

test("translation ledger writes redacted Hermes audit rows for persisted AI tasks", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-hermes-audit-`);
  const file = `${dir}/translations.jsonl`;
  const auditFile = `${dir}/hermes-audit.jsonl`;
  resetTranslationLedger(file);

  appendTranslationTask(
    {
      id: "translation-listing-MS-1-he",
      object_type: "listing",
      object_id: "MS-1",
      source_locale: "bg",
      target_locale: "he",
      status: "hermes_drafted",
      provider_mode: "hermes_draft",
      source_hash: "source-hash",
      draft_hash: "draft-hash",
      public_indexable: false,
      hermes: {
        prompt: { sourceText: "raw source text must not be copied" },
        can_publish: false,
        can_mark_indexable: false,
      },
    },
    { filePath: file, recordedAt: "2026-07-05T00:00:00Z" },
  );

  const rows = readHermesAuditLedger(auditFile);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].task_id, "translation-listing-MS-1-he");
  assert.equal(rows[0].has_output, false);
  assert.equal(rows[0].can_publish, false);
  assert.equal(JSON.stringify(rows).includes("raw source text"), false);
  assert.equal(assertHermesAuditLedger(rows), true);
});
