import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {
  appendTranslationTask,
  assertTranslationLedger,
  latestTranslationTasks,
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
