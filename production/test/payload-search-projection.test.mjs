import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPayloadApprovedSearchProjection,
  payloadListingSearchRows,

} from "../lib/payload-search-projection.mjs";
import { loadListingPublicationApproval } from "../lib/listing-publication-approval.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { contentHash } from "../lib/translations.mjs";

function approvedTranslation(locale, title = `Approved ${locale.code} title`) {
  const copy = {
    title,
    description: `Approved ${locale.code} description`,
    seo_title: `${title} SEO`,
    meta_description: `Approved ${locale.code} meta description`,
  };
  return {
    id: `translation-${locale.code}`,
    locale,
    status: "published",
    translation_state: "published",
    public_indexable: true,
    human_approved: true,
    reviewer: `editor-${locale.code}`,
    approved_at: "2026-08-11T08:00:00.000Z",
    content_origin: "manual_translation",
    publication_authorized_by: "owner",
    publication_authorized_at: "2026-08-11T08:00:00.000Z",
    published_at: "2026-08-11T08:00:00.000Z",
    translated_hash: contentHash(copy),
    ...copy,
  };
}

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
    translations: [approvedTranslation(locale, "Current approved listing")],
    tour: { is_public: true, review_status: "published" },
    ...overrides,
  };
}

test("Payload projection exposes approved localized copy and verified facts", () => {
  const current = approvedListing();
  current.translations.push(
    approvedTranslation({ id: "locale-en", code: "en", public_enabled: true, indexable: true }, "Current approved listing in English"),
  );
  const rows = payloadListingSearchRows([
    current,
    approvedListing({ id: "MS-BLOCKED-0002", cms_status: "review", workflow: { publish_approved: false } }),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].listing.source_listing_id, "MS-CURRENT-0001");
  assert.equal(rows[0].listing.locale, "bg");
  assert.equal(rows[0].listing.locale_path, "/bg/imoti/MS-CURRENT-0001");
  assert.equal(rows[0].listing.price_amount, 120000);
  assert.equal(rows[0].listing.public_latitude, 41.56);
  assert.equal(rows[0].approval.translation_human_approved, true);
  assert.equal(rows[1].listing.locale, "en");
  assert.equal(rows[1].listing.title, "Current approved listing in English");
  assert.ok(rows[0].approval.fact_verification.some((item) => item.field === "listing_status" && item.state === "broker_verified"));
});

// Every locale routes listings under its own segment. The projection used to
// hardcode the Bulgarian one, so a search in any other language linked every
// result to a /bg/imoti/ URL.
test("Payload projection links each locale to its own listing segment", () => {
  const registry = loadLocaleRegistry();
  const localised = (code) => {
    const locale = { id: `locale-${code}`, code, public_enabled: true, indexable: true };
    const listing = approvedListing({
      id: `MS-LOCALE-${code.toUpperCase()}`,
      source_locale: locale,
      // No routing override: this is the derived path, which is the one that
      // was wrong.
      routing: {},
    });
    listing.translations = listing.translations.map((translation) => ({ ...translation, locale }));
    return payloadListingSearchRows([listing], { registry })[0].listing.locale_path;
  };

  assert.equal(localised("en"), "/en/properties/MS-LOCALE-EN");
  assert.equal(localised("bg"), "/bg/imoti/MS-LOCALE-BG");
  assert.equal(localised("de"), "/de/immobilien/MS-LOCALE-DE");
  // Hebrew is right-to-left and carries its own segment like every other locale.
  const hebrew = registry.locales.find((locale) => locale.code === "he");
  assert.equal(localised("he"), `/he/${hebrew.route_segments.listing}/MS-LOCALE-HE`);
  assert.notEqual(hebrew.route_segments.listing, "imoti");

  // An explicit routing target still wins: a listing with a redirect history
  // keeps the path the redirects point at.
  const routed = approvedListing({ routing: { target_path: "/bg/imoti/legacy-slug", target_locale: "bg" } });
  assert.equal(payloadListingSearchRows([routed], { registry })[0].listing.locale_path, "/bg/imoti/legacy-slug");
});

test("Payload projection treats zero approved listings as a valid authoritative catalog", async () => {
  const calls = [];
  const payload = {
    async find(options) {
      calls.push(options);
      return { docs: [], page: 1, totalPages: 1 };
    },
  };
  const projection = await buildPayloadApprovedSearchProjection(payload, { publicationEvidence: null });
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
  const projection = await buildPayloadApprovedSearchProjection(payload, { publicationEvidence: null });
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
  const projection = await buildPayloadApprovedSearchProjection(payload, { pageSize: 1, publicationEvidence: null });
  assert.deepEqual(projection.documents.map((document) => document.id), ["MS-CURRENT-0001:bg", "MS-CURRENT-0002:bg"]);
  assert.deepEqual(calls.map((call) => call.page), [1, 2]);
  assert.equal(projection.source.listing_rows, 2);
  assert.equal(projection.source.projected_documents, 2);
});


test("a published row the approval does not name is skipped, not fatal", () => {
  const registry = loadLocaleRegistry();
  const listing = approvedListing({ id: "MS-CRAWL-0127" });
  const evidence = {
    listing_ids: ["MS-00815"],
    excluded_listings: [{ id: "MS-CRAWL-0127", reason: "no location relation and an empty title" }],
  };
  const skipped = [];
  const rows = payloadListingSearchRows([listing], {
    registry,
    publicationEvidence: evidence,
    onSkipped: (entry) => skipped.push(entry),
  });
  assert.equal(rows.length, 0);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].listing_id, "MS-CRAWL-0127");
  assert.match(skipped[0].reason, /no location relation/);
});

test("the default sync path resolves real listing ids from the approval", () => {
  // The guard once read the gate-evidence summary, which has no listing_ids,
  // silently disabling the skip; the approval loader is the id-bearing source.
  const approval = loadListingPublicationApproval();
  assert.equal(Array.isArray(approval.listing_ids), true);
  assert.ok(approval.listing_ids.length >= 1);
  assert.equal(approval.listing_ids.includes("MS-CRAWL-0127"), true);
});
