import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPayloadApprovedSearchProjection,
  payloadListingSearchRows,
} from "../lib/payload-search-projection.mjs";

function approvedListing(overrides = {}) {
  const locale = { id: "locale-bg", code: "bg", public_enabled: true, indexable: true };
  return {
    id: "MS-CURRENT-0001",
    cms_status: "published",
    source_locale: locale,
    facts: {
      title: "Current approved listing",
      description: "Current Payload copy",
      offer_type: "sale",
      listing_status: "available",
      price_eur: 120000,
    },
    workflow: {
      publish_approved: true,
      publish_approved_at: "2026-08-11T08:00:00.000Z",
      publish_approved_by: "admin-1",
      price_verified_at: "2026-08-11T08:00:00.000Z",
      price_verified_by: "admin-1",
    },
    routing: { target_path: "/bg/imoti/MS-CURRENT-0001", target_locale: "bg" },
    location: { id: "location-1", label: "Sandanski", public_latitude: 41.56, public_longitude: 23.28 },
    property: {
      id: "property-1",
      property_family: "apartment",
      property_subtype: "two-bedroom",
      facts: { municipality: "Sandanski", country_code: "BG", bedrooms_count: 2, floor_number: 3, total_floors: 6 },
      fact_verification: [
        { field: "municipality", state: "broker_verified" },
        { field: "country_code", state: "broker_verified" },
        { field: "bedrooms_count", state: "broker_verified" },
        { field: "floor_number", state: "broker_verified" },
        { field: "total_floors", state: "broker_verified" },
      ],
    },
    translations: [
      {
        id: "translation-bg",
        locale,
        status: "published",
        translation_state: "published",
        public_indexable: true,
        reviewer: "editor-bg",
        approved_at: "2026-08-11T08:00:00.000Z",
      },
      {
        id: "translation-en",
        locale: { id: "locale-en", code: "en", public_enabled: true, indexable: true },
        status: "published",
        translation_state: "published",
        public_indexable: true,
        reviewer: "editor-en",
        approved_at: "2026-08-11T08:00:00.000Z",
      },
    ],
    tour: { is_public: true, review_status: "published" },
    ...overrides,
  };
}

test("Payload projection exposes only approved source-locale copy and verified facts", () => {
  const rows = payloadListingSearchRows([
    approvedListing(),
    approvedListing({ id: "MS-BLOCKED-0002", cms_status: "review", workflow: { publish_approved: false } }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].listing.source_listing_id, "MS-CURRENT-0001");
  assert.equal(rows[0].listing.locale, "bg");
  assert.equal(rows[0].listing.locale_path, "/bg/imoti/MS-CURRENT-0001");
  assert.equal(rows[0].listing.price_amount, 120000);
  assert.equal(rows[0].listing.public_latitude, 41.56);
  assert.equal(rows[0].approval.translation_human_approved, true);
  assert.ok(rows[0].approval.fact_verification.some((item) => item.field === "listing_status" && item.state === "broker_verified"));
});

test("Payload projection treats zero approved listings as a valid authoritative catalog", async () => {
  const calls = [];
  const payload = {
    async find(options) {
      calls.push(options);
      return { docs: [], page: 1, totalPages: 1 };
    },
  };
  const projection = await buildPayloadApprovedSearchProjection(payload);
  assert.deepEqual(projection.documents, []);
  assert.deepEqual(projection.summary, { input_rows: 0, projected_documents: 0, skipped_rows: 0 });
  assert.equal(projection.source.kind, "payload_postgres");
  assert.equal(projection.source.authoritative, true);
  assert.equal(projection.source.projected_documents, 0);
  assert.match(projection.source.digest, /^[a-f0-9]{64}$/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].collection, "listings");
  assert.equal(calls[0].depth, 3);
  assert.equal(calls[0].draft, true);
  assert.equal(calls[0].overrideAccess, true);
  assert.deepEqual(calls[0].where, {
    and: [
      { cms_status: { equals: "published" } },
      { "workflow.publish_approved": { equals: true } },
    ],
  });
});

test("Payload projection preserves property bedroom and floor facts until listing values override them", async () => {
  const baseFacts = approvedListing().facts;
  const payload = {
    async find() {
      return {
        docs: [
          approvedListing({ facts: { ...baseFacts, bedrooms: null, floor: null, total_floors: null } }),
          approvedListing({
            id: "MS-CURRENT-0002",
            facts: { ...baseFacts, bedrooms: 4, floor: 5, total_floors: 9 },
            routing: { target_path: "/bg/imoti/MS-CURRENT-0002", target_locale: "bg" },
          }),
        ],
        page: 1,
        totalPages: 1,
      };
    },
  };
  const projection = await buildPayloadApprovedSearchProjection(payload);
  assert.deepEqual(
    projection.documents.map(({ bedrooms_count, floor_number, total_floors }) => ({ bedrooms_count, floor_number, total_floors })),
    [
      { bedrooms_count: 2, floor_number: 3, total_floors: 6 },
      { bedrooms_count: 4, floor_number: 5, total_floors: 9 },
    ],
  );
});

test("Payload projection paginates current database rows without reading fixture files", async () => {
  const calls = [];
  const payload = {
    async find(options) {
      calls.push(options);
      return options.page === 1
        ? { docs: [approvedListing()], page: 1, totalPages: 2 }
        : { docs: [approvedListing({ id: "MS-CURRENT-0002", routing: { target_path: "/bg/imoti/MS-CURRENT-0002", target_locale: "bg" } })], page: 2, totalPages: 2 };
    },
  };
  const projection = await buildPayloadApprovedSearchProjection(payload, { pageSize: 1 });
  assert.deepEqual(projection.documents.map((document) => document.id), ["MS-CURRENT-0001:bg", "MS-CURRENT-0002:bg"]);
  assert.deepEqual(calls.map((call) => call.page), [1, 2]);
  assert.equal(projection.source.listing_rows, 2);
  assert.equal(projection.source.projected_documents, 2);
});
