import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {
  applyListingEdits,
  createBulkListingStatusEdits,
  createListingEdit,
  appendListingEdit,
  assertListingEdits,
  readListingEdits,
  resetListingEdits,
} from "../lib/listing-edits.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

test("listing edits persist and stale dependent translations", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-edits-`)}/edits.jsonl`;
  resetListingEdits(file);
  const result = createListingEdit(
    loadCmsSeed(),
    {
      listingId: "MS-CRAWL-0001",
      editor: "editor_bg",
      patch: {
        description: " Updated approved source description. ",
        price_eur: "123000",
        bedrooms: "2",
        area_sqm: "86.5",
        bedrooms_not_applicable: "1",
        price_on_request: "on",
        listing_status: "sold",
      },
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
  assert.equal(rows[0].patch.area_sqm, 86.5);
  assert.equal(rows[0].patch.bedrooms_not_applicable, true);
  assert.equal(rows[0].patch.price_on_request, true);
  assert.equal(rows[0].patch.listing_status, "sold");
  assert.equal(result.staleTranslations.some((translation) => translation.locale === "el" && translation.status === "stale"), true);
  assert.equal(result.staleTranslations.every((translation) => translation.public_indexable === false), true);
  assert.equal(assertListingEdits(rows), true);
});

test("listing edit ledger overlays reviewed facts onto CMS seed records", () => {
  const seed = loadCmsSeed();
  const updated = applyListingEdits(seed, [
    {
      listing_id: "MS-CRAWL-0001",
      patch: {
        description: "Reviewed source description.",
        price_eur: 123000,
        bedrooms: 2,
        bedrooms_not_applicable: true,
        price_on_request: true,
      },
      media_reviewer: "media_editor",
    },
  ]);
  const original = seed.records.find((record) => record.id === "MS-CRAWL-0001");
  const record = updated.records.find((candidate) => candidate.id === "MS-CRAWL-0001");

  assert.equal(original.facts.description, "Updated approved source description.");
  assert.equal(record.facts.description, "Reviewed source description.");
  assert.equal(record.facts.price_eur, 123000);
  assert.equal(record.facts.bedrooms, 2);
  assert.equal(record.facts.bedrooms_not_applicable, true);
  assert.equal(record.facts.price_on_request, true);
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
  assert.throws(
    () =>
      createListingEdit(seed, {
        listingId: "MS-CRAWL-0001",
        editor: "editor_bg",
        patch: { area_sqm: "0" },
      }),
    /area_sqm must be positive/,
  );
  assert.throws(
    () =>
      createListingEdit(seed, {
        listingId: "MS-CRAWL-0001",
        editor: "editor_bg",
        patch: { listing_status: "deleted" },
      }),
    /listing_status must be/,
  );
});

test("listing edits can persist media-only review rows", () => {
  const seed = loadCmsSeed();
  const result = createListingEdit(
    seed,
    {
      listingId: "MS-CRAWL-0006",
      editor: "media_editor",
      patch: {},
      mediaReviewer: "media_editor",
    },
    [],
    "2026-07-05T00:03:00Z",
  );

  assert.deepEqual(result.edit.patch, {});
  assert.equal(result.edit.source_hash_before, result.edit.source_hash_after);
  assert.equal(result.edit.media_reviewer, "media_editor");
});

test("listing edit persistence assigns collision-safe ids and treats request retries as idempotent", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-edit-retries-`)}/edits.jsonl`;
  resetListingEdits(file);
  const seed = loadCmsSeed();
  const first = createListingEdit(
    seed,
    { listingId: "MS-CRAWL-0001", editor: "content_editor", patch: { listing_status: "reserved" } },
    [],
    "2026-07-06T08:00:00Z",
  );
  const persisted = appendListingEdit(first.edit, { filePath: file });
  const retriedSeed = applyListingEdits(seed, readListingEdits(file));
  const retry = createListingEdit(
    retriedSeed,
    { listingId: "MS-CRAWL-0001", editor: "content_editor", patch: { listing_status: "reserved" } },
    [],
    "2026-07-06T08:01:00Z",
  );
  const idempotent = appendListingEdit(retry.edit, { filePath: file });
  const secondChange = createListingEdit(
    retriedSeed,
    { listingId: "MS-CRAWL-0001", editor: "content_editor", patch: { listing_status: "sold" } },
    [],
    "2026-07-06T08:02:00Z",
  );
  const secondPersisted = appendListingEdit(secondChange.edit, { filePath: file });

  assert.equal(persisted.id, "listing-edit-MS-CRAWL-0001");
  assert.equal(persisted.idempotent, false);
  assert.equal(idempotent.id, persisted.id);
  assert.equal(idempotent.idempotent, true);
  assert.equal(secondPersisted.id, "listing-edit-MS-CRAWL-0001-2");
  assert.equal(readListingEdits(file).length, 2);
  assert.equal(assertListingEdits(readListingEdits(file)), true);
});

test("explicit listing edit ids reject conflicting reuse", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-edit-conflict-`)}/edits.jsonl`;
  resetListingEdits(file);
  const seed = loadCmsSeed();
  const reserved = createListingEdit(seed, {
    id: "status-request-1",
    listingId: "MS-CRAWL-0001",
    editor: "content_editor",
    patch: { listing_status: "reserved" },
  });
  const sold = createListingEdit(seed, {
    id: "status-request-1",
    listingId: "MS-CRAWL-0001",
    editor: "content_editor",
    patch: { listing_status: "sold" },
  });
  appendListingEdit(reserved.edit, { filePath: file });
  assert.throws(() => appendListingEdit(sold.edit, { filePath: file }), /different change/);
});

test("bulk listing status updates validate the complete selection before returning changes", () => {
  const seed = loadCmsSeed();
  const batch = createBulkListingStatusEdits(
    seed,
    {
      listingIds: ["MS-CRAWL-0001", "MS-CRAWL-0002", "MS-CRAWL-0001"],
      targetStatus: "reserved",
      editor: "listing_manager",
      requestId: "bulk-status-20260706",
    },
    [],
    "2026-07-06T08:00:00Z",
  );
  assert.equal(batch.requestedListingIds.length, 2);
  assert.equal(batch.changes.length, 2);
  assert.equal(batch.changes.every((change) => change.edit.patch.listing_status === "reserved"), true);
  assert.equal(batch.changes[0].edit.id, "bulk-status-20260706-MS-CRAWL-0001");
  assert.throws(
    () =>
      createBulkListingStatusEdits(seed, {
        listingIds: ["MS-CRAWL-0001", "MS-CRAWL-9999"],
        targetStatus: "sold",
        editor: "listing_manager",
      }),
    /Unknown listingId/,
  );
});
