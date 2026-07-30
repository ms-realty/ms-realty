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
        floor: "2",
        total_floors: "5",
        land_area_sqm: "640",
        condition: "  Renovated  ",
        location_precision: "approximate",
        availability_verified_at: "2026-07-04T10:30:00Z",
        publish_approved: "true",
        seo_title: "Reviewed workshop to rent",
        seo_description: "Reviewed source-language search description.",
        seo_canonical: "/bg/imoti/MS-CRAWL-0001",
        seo_og_title: "Workshop to rent in Sandanski",
        seo_og_description: "A reviewed commercial property listing.",
        seo_robots: "index,follow",
        seo_review_confirmed: "true",
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
  assert.equal(rows[0].patch.price_eur, null);
  assert.equal(rows[0].patch.bedrooms, 2);
  assert.equal(rows[0].patch.area_sqm, 86.5);
  assert.equal(rows[0].patch.bedrooms_not_applicable, true);
  assert.equal(rows[0].patch.price_on_request, true);
  assert.equal(rows[0].patch.listing_status, "sold");
  assert.equal(rows[0].patch.floor, 2);
  assert.equal(rows[0].patch.total_floors, 5);
  assert.equal(rows[0].patch.land_area_sqm, 640);
  assert.equal(rows[0].patch.condition, "Renovated");
  assert.equal(rows[0].patch.location_precision, "approximate");
  assert.equal(rows[0].patch.availability_verified_at, "2026-07-04T10:30:00.000Z");
  assert.equal(rows[0].patch.publish_approved, true);
  assert.equal(rows[0].patch.seo_canonical, "/bg/imoti/MS-CRAWL-0001");
  assert.equal(rows[0].patch.seo_review_confirmed, true);
  assert.equal(result.staleTranslations.some((translation) => translation.locale === "el" && translation.status === "stale"), true);
  assert.equal(result.staleTranslations.every((translation) => translation.public_indexable === false), true);
  assert.equal(assertListingEdits(rows), true);
});

test("listing edit ledger overlays reviewed facts onto CMS seed records", () => {
  const seed = loadCmsSeed();
  const updated = applyListingEdits(seed, [
    {
      listing_id: "MS-CRAWL-0001",
      edited_at: "2026-07-04T11:00:00Z",
      editor: "listing_editor",
      patch: {
        description: "Reviewed source description.",
        price_eur: 123000,
        bedrooms: 2,
        bedrooms_not_applicable: true,
        price_on_request: true,
        floor: 2,
        total_floors: 5,
        land_area_sqm: 640,
        condition: "Renovated",
        location_precision: "approximate",
        availability_verified_at: "2026-07-04T10:30:00.000Z",
        publish_approved: true,
        seo_title: "Reviewed SEO title",
        seo_description: "Reviewed SEO description.",
        seo_canonical: "/bg/imoti/MS-CRAWL-0001",
        seo_og_title: "Reviewed Open Graph title",
        seo_og_description: "Reviewed Open Graph description.",
        seo_robots: "noindex,follow",
        seo_review_confirmed: true,
      },
      media_reviewer: "media_editor",
    },
  ]);
  const original = seed.records.find((record) => record.id === "MS-CRAWL-0001");
  const record = updated.records.find((candidate) => candidate.id === "MS-CRAWL-0001");

  assert.equal(original.facts.description, "Updated approved source description.");
  assert.equal(record.facts.description, "Reviewed source description.");
  assert.equal(record.facts.price_eur, null);
  assert.equal(record.facts.bedrooms, 2);
  assert.equal(record.facts.bedrooms_not_applicable, true);
  assert.equal(record.facts.price_on_request, true);
  assert.equal(record.facts.floor, 2);
  assert.equal(record.facts.total_floors, 5);
  assert.equal(record.facts.land_area_sqm, 640);
  assert.equal(record.facts.condition, "Renovated");
  assert.equal(record.facts.location_precision, "approximate");
  assert.equal(record.facts.seo_title, undefined);
  assert.equal(record.seo.title, "Reviewed SEO title");
  assert.equal(record.seo.description, "Reviewed SEO description.");
  assert.equal(record.seo.canonical_override, "/bg/imoti/MS-CRAWL-0001");
  assert.equal(record.seo.og_title, "Reviewed Open Graph title");
  assert.equal(record.seo.robots, "noindex,follow");
  assert.equal(record.seo.human_approved, true);
  assert.equal(record.seo.reviewer, "listing_editor");
  assert.equal(record.seo.reviewed_at, "2026-07-04T11:00:00Z");
  assert.equal(record.workflow.availability_verified_at, "2026-07-04T10:30:00.000Z");
  assert.equal(record.workflow.availability_verified_by, "listing_editor");
  assert.equal(record.workflow.publish_approved, true);
  assert.equal(record.workflow.publish_approved_by, "listing_editor");
  assert.equal(record.workflow.publish_approved_at, "2026-07-04T11:00:00Z");
  assert.equal(record.workflow.last_editor, "listing_editor");
  assert.equal(record.media_workflow.review_gated_assets, 0);
  assert.equal(record.media_workflow.media_reviewer, "media_editor");
});

test("scoped edits keep physical facts on the linked property with pending-review provenance", () => {
  const seed = {
    records: [
      {
        id: "MS-CRAWL-SCOPED",
        collection: "listings",
        property: "property-MS-CRAWL-SCOPED",
        source_locale: "bg",
        facts: { title: "Legacy apartment", bedrooms: 1, price_eur: 100000 },
        seo: {},
        translations: [],
        media: [],
        media_workflow: {},
      },
    ],
    locations: [{ id: "location:sandanski", collection: "locations", label: "Sandanski" }],
    properties: [
      {
        id: "property-MS-CRAWL-SCOPED",
        collection: "properties",
        location: "location:sandanski",
        property_family: "apartment",
        property_subtype: "apartment",
        facts: { bedrooms_count: 1, built_area_sqm: 70 },
        fact_verification: [{ field: "bedrooms_count", state: "broker_verified" }],
        zero_value_audit: [],
      },
    ],
  };
  const result = createListingEdit(
    seed,
    {
      listingId: "MS-CRAWL-SCOPED",
      editor: "property_editor",
      propertyPatch: { bedrooms_count: 2, public_longitude: 23.28 },
      listingPatch: { price_eur: "120000", listing_status: "reserved" },
    },
    [],
    "2026-07-30T10:00:00Z",
  );

  assert.equal(result.edit.edit_scope, "property_listing");
  assert.deepEqual(result.edit.patch, {});
  assert.equal(result.edit.property_patch.bedrooms_count, 2);
  assert.equal(result.edit.listing_patch.price_eur, 120000);
  assert.equal(result.edit.property_fact_verification.find((entry) => entry.field === "bedrooms_count").state, "entered_pending_review");
  const updated = applyListingEdits(seed, [result.edit]);
  const listing = updated.records[0];
  const property = updated.properties[0];
  assert.equal(listing.facts.price_eur, 120000);
  assert.equal(listing.facts.bedrooms, 1);
  assert.equal(property.facts.bedrooms_count, 2);
  assert.equal(property.facts.public_longitude, 23.28);
  assert.equal(property.facts.primary_area_sqm, 70);
  assert.equal(property.fact_verification.find((entry) => entry.field === "bedrooms_count").state, "entered_pending_review");
  assert.throws(
    () =>
      createListingEdit(seed, {
        listingId: "MS-CRAWL-SCOPED",
        editor: "property_editor",
        listingPatch: { bedrooms: 2 },
      }),
    /belong in propertyPatch/,
  );
  assert.throws(
    () =>
      createListingEdit(seed, {
        listingId: "MS-CRAWL-SCOPED",
        editor: "property_editor",
        propertyPatch: { price_amount: 120000 },
      }),
    /unsupported fields/,
  );
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
  assert.throws(
    () =>
      createListingEdit(seed, {
        listingId: "MS-CRAWL-0001",
        editor: "editor_bg",
        patch: { seo_canonical: "https://other.example/listing" },
      }),
    /root-relative path/,
  );
  assert.throws(
    () =>
      createListingEdit(seed, {
        listingId: "MS-CRAWL-0001",
        editor: "editor_bg",
        patch: { location_precision: "coordinates" },
      }),
    /location_precision must be/,
  );
});

test("verification and publication workflow edits do not stale translated copy", () => {
  const result = createListingEdit(
    loadCmsSeed(),
    {
      listingId: "MS-CRAWL-0001",
      editor: "availability_reviewer",
      patch: { availability_verified_at: "2026-07-04T10:30:00Z", publish_approved: true },
    },
    [],
    "2026-07-04T10:31:00Z",
  );

  assert.equal(result.edit.source_hash_before, result.edit.source_hash_after);
  assert.equal(result.staleTranslations.length, 0);
});

test("source-language SEO remains review-gated until a human confirms it", () => {
  const seed = loadCmsSeed();
  const draft = createListingEdit(
    seed,
    {
      listingId: "MS-CRAWL-0001",
      editor: "seo_editor",
      patch: { seo_title: "Unreviewed SEO draft", seo_review_confirmed: false },
    },
    [],
    "2026-07-04T10:31:00Z",
  );
  const record = applyListingEdits(seed, [draft.edit]).records.find((candidate) => candidate.id === "MS-CRAWL-0001");

  assert.equal(record.seo.title, "Unreviewed SEO draft");
  assert.equal(record.seo.human_approved, false);
  assert.equal(record.seo.review_status, "review_required");
  assert.equal(record.seo.reviewer, null);
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
