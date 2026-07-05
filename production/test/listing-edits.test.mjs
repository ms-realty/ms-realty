import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { applyListingEdits, createListingEdit, appendListingEdit, assertListingEdits, readListingEdits, resetListingEdits } from "../lib/listing-edits.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

test("listing edits persist and stale dependent translations", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-edits-`)}/edits.jsonl`;
  resetListingEdits(file);
  const result = createListingEdit(
    loadCmsSeed(),
    {
      listingId: "MS-CRAWL-0001",
      editor: "editor_bg",
      patch: { description: " Updated approved source description. ", price_eur: "123000", bedrooms: "2" },
    },
    [],
    "2026-07-04T00:03:00Z",
  );
  appendListingEdit(result.edit, { filePath: file });

  const rows = readListingEdits(file);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].listing_id, "MS-CRAWL-0001");
  assert.equal(rows[0].patch.description, "Updated approved source description.");
  assert.equal(rows[0].patch.price_eur, 123000);
  assert.equal(rows[0].patch.bedrooms, 2);
  assert.equal(result.staleTranslations.some((translation) => translation.locale === "el" && translation.status === "stale"), true);
  assert.equal(result.staleTranslations.every((translation) => translation.public_indexable === false), true);
  assert.equal(assertListingEdits(rows), true);
});

test("listing edit ledger overlays reviewed facts onto CMS seed records", () => {
  const seed = loadCmsSeed();
  const updated = applyListingEdits(seed, [
    {
      listing_id: "MS-CRAWL-0001",
      patch: { description: "Reviewed source description.", price_eur: 123000, bedrooms: 2 },
      media_reviewer: "media_editor",
    },
  ]);
  const original = seed.records.find((record) => record.id === "MS-CRAWL-0001");
  const record = updated.records.find((candidate) => candidate.id === "MS-CRAWL-0001");

  assert.equal(original.facts.description, "Updated approved source description.");
  assert.equal(record.facts.description, "Reviewed source description.");
  assert.equal(record.facts.price_eur, 123000);
  assert.equal(record.facts.bedrooms, 2);
  assert.equal(record.media_workflow.review_gated_assets, 0);
  assert.equal(record.media_workflow.media_reviewer, "media_editor");
});

test("listing edits reject invalid numeric facts before persistence", () => {
  const seed = loadCmsSeed();
  assert.throws(
    () =>
      createListingEdit(seed, {
        listingId: "MS-CRAWL-0001",
        editor: "editor_bg",
        patch: { price_eur: "free" },
      }),
    /price_eur must be numeric/,
  );
  assert.throws(
    () =>
      createListingEdit(seed, {
        listingId: "MS-CRAWL-0001",
        editor: "editor_bg",
        patch: { bedrooms: "1.5" },
      }),
    /bedrooms must be a non-negative integer/,
  );
});
