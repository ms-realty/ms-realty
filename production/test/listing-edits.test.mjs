import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { createListingEdit, appendListingEdit, assertListingEdits, readListingEdits, resetListingEdits } from "../lib/listing-edits.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

test("listing edits persist and stale dependent translations", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-edits-`)}/edits.jsonl`;
  resetListingEdits(file);
  const result = createListingEdit(
    loadCmsSeed(),
    {
      listingId: "MS-CRAWL-0001",
      editor: "editor_bg",
      patch: { description: "Updated approved source description." },
    },
    [],
    "2026-07-04T00:03:00Z",
  );
  appendListingEdit(result.edit, { filePath: file });

  const rows = readListingEdits(file);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].listing_id, "MS-CRAWL-0001");
  assert.equal(result.staleTranslations.some((translation) => translation.locale === "el" && translation.status === "stale"), true);
  assert.equal(result.staleTranslations.every((translation) => translation.public_indexable === false), true);
  assert.equal(assertListingEdits(rows), true);
});
