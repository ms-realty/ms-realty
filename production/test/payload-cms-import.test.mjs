import test from "node:test";
import assert from "node:assert/strict";
import { CMS_SEED_IMPORT_CONTEXT_FLAG, payloadCmsImportContextEnabled, projectPayloadCmsSeed, readPayloadCmsSnapshot, runPayloadCmsImport } from "../lib/payload-cms-import.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function relationId(value) {
  return String(value && typeof value === "object" ? value.id || "" : value || "").trim();
}

function minimalRegistry() {
  return {
    policy: "dynamic_approved",
    source_locale: "bg",
    url_strategy: "locale_prefix",
    admin_locales: ["bg", "en"],
    required_admin_locales: ["bg", "en"],
    required_public_locales: ["bg", "en"],
    locales: [
      {
        code: "bg",
        native_name: "Bulgarian",
        admin_name: "Bulgarian",
        direction: "ltr",
        public_enabled: true,
        indexable: true,
        fallback_locale: null,
        translation_provider_mode: "human",
        reviewer_role: "editor_bg",
        route_segments: { listing: "properties", search: "search", location: "locations", contact: "contact", seller: "sell" },
      },
      {
        code: "en",
        native_name: "English",
        admin_name: "English",
        direction: "ltr",
        public_enabled: true,
        indexable: true,
        fallback_locale: "bg",
        translation_provider_mode: "human",
        reviewer_role: "editor_en",
        route_segments: { listing: "properties", search: "search", location: "locations", contact: "contact", seller: "sell" },
      },
    ],
    website_language_coverage: [
      { id: "bg", locale: "bg", country_code: "BG", public_route_prefix: "/bg/" },
      { id: "en", locale: "en", country_code: "GB", public_route_prefix: "/en/" },
    ],
  };
}

function minimalSeed() {
  return {
    artifact_id: "cms-seed-test",
    taxonomy_contract: { version: "test", mappings: [] },
    summary: {
      listings: 1,
      properties: 1,
      locations: 1,
      enrichmentTasks: 1,
      bySourceLocale: { bg: 1 },
      translationLocales: { bg: 1, en: 1 },
      mediaAssets: 2,
      publicGalleryAssets: 1,
      floorPlanCandidates: 0,
      videoCandidates: 0,
      mediaReviewGatedAssets: 1,
      tourFields: 1,
      publicTours: 0,
      missingMigrationRecords: 0,
      missingRouteRows: 0,
      reviewRequiredRoutes: 1,
      deployableRoutes: 0,
    },
    records: [
      {
        id: "MS-TEST-0001",
        collection: "listings",
        cms_status: "source_imported_review_required",
        source_locale: "bg",
        source_domain: "makler-realty.com",
        source_url: "https://makler-realty.com/listing/test-1",
        facts: {
          title: "Seed title",
          h1: "Seed title",
          description: "Seed description",
          location: "Sandanski",
          location_native: "Сандански",
          location_legacy: "Sandanski",
          municipality: "Sandanski",
          municipality_code: "BLG40",
          district: "Blagoevgrad",
          district_code: "BLG",
          region: "Blagoevgrad",
          region_id: "BG:district:BLG",
          country_code: "BG",
          geography_id: "BG:settlement:65334",
          geography_path: ["BG:settlement:65334"],
          settlement_ekatte: "65334",
          location_review_status: "confirmed_settlement",
          location_precision: "approximate",
          property_type: "apartment",
          offer_type: "sale",
          bedrooms: 2,
          bedrooms_not_applicable: false,
          price_eur: 100000,
          price_on_request: false,
          image_count: 2,
          area_sqm: 85,
          floor: 3,
          total_floors: 5,
          land_area_sqm: null,
          condition: "good",
        },
        workflow: {},
        property: "property-MS-TEST-0001",
        location: "location:sandanski",
        seo: { title: "Seed title", description: "Seed description", canonical: "https://makler-realty.com/listing/test-1", schema_present: true },
        translations: [
          {
            locale: "bg",
            source_locale: "bg",
            status: "published",
            source_hash: "source-bg",
            translated_hash: "translated-bg",
            reviewer: "editor_bg",
            approved_at: "2026-08-10T00:00:00.000Z",
            direction: "ltr",
            public_indexable: true,
            listing: "MS-TEST-0001",
            translation_state: "published",
          },
          {
            locale: "en",
            source_locale: "bg",
            status: "approved",
            source_hash: "source-en",
            translated_hash: "translated-en",
            reviewer: "editor_en",
            approved_at: "2026-08-10T00:00:00.000Z",
            direction: "ltr",
            public_indexable: true,
            listing: "MS-TEST-0001",
            translation_state: "approved",
          },
        ],
        media: [
          {
            url: "https://makler-realty.com/wp-content/uploads/2025/04/listing-1.jpg",
            asset_url: "https://makler-realty.com/wp-content/uploads/2025/04/listing-1.jpg",
            alt: "Front view",
            width: 1200,
            height: 800,
            kind: "photo",
            is_public: true,
            review_status: "approved_imported_photo",
          },
          {
            url: "https://makler-realty.com/wp-content/themes/Avenue/images/logo.png",
            asset_url: null,
            alt: "Logo",
            width: null,
            height: null,
            kind: "site_chrome",
            is_public: false,
            review_status: "reviewed_private",
          },
        ],
        media_workflow: {
          total_assets: 2,
          public_gallery_assets: 1,
          suppressed_public_assets: 0,
          floor_plan_candidates: 0,
          video_candidates: 0,
          review_gated_assets: 0,
        },
        tour: {
          provider: "photo-sphere-viewer",
          listing_id: "MS-TEST-0001",
          panorama_url: null,
          viewer_url: null,
          thumbnail_url: null,
          hotspots: [],
          is_public: false,
          accessibility_caption: "",
          review_status: "needs_panorama_upload",
          fallback_gallery: [{ url: "https://makler-realty.com/wp-content/uploads/2025/04/listing-1.jpg", alt: "Front view" }],
        },
        migration: { record_id: "migration-1", review_state: "review_required", metadata_gaps: [] },
        routing: { target_path: "/bg/properties/MS-TEST-0001", target_locale: "bg", planned_status: 301, deployable: false, review_required: true },
      },
    ],
    properties: [
      {
        id: "property-MS-TEST-0001",
        collection: "properties",
        location: "location:sandanski",
        property_family: "apartment",
        property_subtype: "apartment",
        taxonomy_mapping_version: "test",
        taxonomy_review_status: "mapped",
        facts: {
          legacy_property_type: "apartment",
          location_id: "location:sandanski",
          location_label: "Sandanski",
          municipality: "Sandanski",
          district: "Blagoevgrad",
          region_id: "BG:district:BLG",
          country_code: "BG",
          geography_id: "BG:settlement:65334",
          geography_path: ["BG:settlement:65334"],
          condition: "good",
          construction_status: null,
          parking_kind: null,
          living_area_sqm: 85,
          built_area_sqm: 85,
          usable_area_sqm: null,
          gross_floor_area_sqm: null,
          land_area_sqm: null,
          bedrooms_count: 2,
          premises_count: null,
          hotel_room_count: null,
          floor_number: 3,
          total_floors: 5,
          storeys_count: null,
          zoning_status: null,
          utilities_status: null,
          road_access_status: null,
          land_category: null,
          permanent_use: null,
          permitted_use: null,
          public_location_precision: "approximate",
          primary_area_sqm: 85,
        },
        fact_verification: [{ field: "built_area_sqm", state: "entered_pending_review", source_type: "legacy_import", source_reference: "MS-TEST-0001" }],
        zero_value_audit: [],
        legacy_listing_id: "MS-TEST-0001",
      },
    ],
    locations: [{ id: "location:sandanski", collection: "locations", label: "Sandanski", public_location_precision: "approximate" }],
    enrichment_tasks: [
      {
        id: "enrichment-MS-TEST-0001",
        collection: "listing_enrichment_tasks",
        listing: "MS-TEST-0001",
        property: "property-MS-TEST-0001",
        task_type: "verify_imported_facts",
        task_state: "pending",
        idempotency_key: "listing:MS-TEST-0001:verify_imported_facts",
        fact_fields: ["built_area_sqm"],
        source: "legacy_backfill",
      },
    ],
  };
}

const AUTO_INTEGER_ID_COLLECTIONS = new Set(["locales", "listing_translations", "media_assets", "listing_tours"]);
const VERSIONED_COLLECTIONS = new Set(["listings", "listing_translations", "media_assets", "listing_tours"]);

function duplicateKeyError(message) {
  const error = new Error(message);
  error.code = "23505";
  return error;
}

function uniqueKeyFor(collection, row) {
  switch (collection) {
    case "locales":
      return `code:${row.code}`;
    case "listing_translations":
      return `listing-locale:${relationId(row.listing)}\u0000${relationId(row.locale)}`;
    case "media_assets":
      return `url:${row.url}`;
    case "listing_tours":
      return `listing:${relationId(row.listing_id)}`;
    case "search_outbox":
    case "listing_enrichment_tasks":
      return row.idempotency_key ? `idempotency:${row.idempotency_key}` : null;
    default:
      return null;
  }
}

function assertUniqueCreate(rows, collection, document) {
  const uniqueKey = uniqueKeyFor(collection, document);
  if (uniqueKey && rows[collection].some((row) => uniqueKeyFor(collection, row) === uniqueKey)) {
    throw duplicateKeyError(`Duplicate ${collection} unique key ${uniqueKey}`);
  }
  if (rows[collection].some((row) => String(row.id) === String(document.id))) {
    throw duplicateKeyError(`Duplicate ${collection} id ${document.id}`);
  }
}

function mediaDedupSeed() {
  const seed = minimalSeed();
  const sharedUrl = "https://makler-realty.com/wp-content/uploads/2025/04/shared.jpg";
  seed.records[0].media = [
    {
      url: sharedUrl,
      asset_url: sharedUrl,
      alt: "Balcony view",
      width: 1200,
      height: 800,
      kind: "photo",
      is_public: true,
      review_status: "approved_imported_photo",
    },
    {
      url: sharedUrl,
      asset_url: sharedUrl,
      alt: "Balcony view",
      width: 1200,
      height: 800,
      kind: "photo",
      is_public: true,
      review_status: "approved_imported_photo",
    },
    {
      url: "https://makler-realty.com/wp-content/themes/Avenue/images/logo.png",
      asset_url: null,
      alt: "Logo",
      width: null,
      height: null,
      kind: "site_chrome",
      is_public: false,
      review_status: "reviewed_private",
    },
  ];
  seed.records[0].facts.title = "Seed listing one";
  seed.records[0].seo.title = "Seed listing one";
  seed.records[0].source_url = "https://makler-realty.com/listing/test-1";

  seed.records.push({
    ...clone(seed.records[0]),
    id: "MS-TEST-0002",
    source_url: "https://makler-realty.com/listing/test-2",
    facts: { ...clone(seed.records[0].facts), title: "Seed listing two", h1: "Seed listing two" },
    seo: { ...clone(seed.records[0].seo), title: "Seed listing two", canonical: "https://makler-realty.com/listing/test-2" },
    property: "property-MS-TEST-0002",
    media: [
      {
        url: sharedUrl,
        asset_url: sharedUrl,
        alt: "Facade view",
        width: 1200,
        height: 800,
        kind: "photo",
        is_public: true,
        review_status: "approved_imported_photo",
      },
    ],
    tour: null,
    translations: [],
    migration: { record_id: "migration-2", review_state: "review_required", metadata_gaps: [] },
    routing: { target_path: "/bg/properties/MS-TEST-0002", target_locale: "bg", planned_status: 301, deployable: false, review_required: true },
  });
  seed.properties.push({
    ...clone(seed.properties[0]),
    id: "property-MS-TEST-0002",
    legacy_listing_id: "MS-TEST-0002",
  });
  seed.summary.listings = 2;
  seed.summary.properties = 2;
  seed.summary.mediaAssets = 4;
  seed.summary.publicGalleryAssets = 3;
  seed.summary.mediaReviewGatedAssets = 1;
  seed.summary.tourFields = 1;
  return seed;
}

function fakePayload(initial = {}, { published = {} } = {}) {
  const rows = Object.fromEntries(
    ["locales", "locations", "properties", "listings", "listing_translations", "media_assets", "listing_tours", "listing_enrichment_tasks", "search_outbox"].map(
      (collection) => [collection, clone(initial[collection] || [])],
    ),
  );
  const publishedRows = Object.fromEntries(Object.keys(rows).map((collection) => [collection, clone(published[collection] || [])]));
  const calls = { begin: 0, commit: 0, find: [], rollback: 0 };
  let nextId = 1;
  let snapshot = null;
  const nextIntegerId = Object.fromEntries(
    [...AUTO_INTEGER_ID_COLLECTIONS].map((collection) => [
      collection,
      Math.max(0, ...rows[collection].map((row) => (Number.isInteger(row.id) ? row.id : 0)), ...publishedRows[collection].map((row) => (Number.isInteger(row.id) ? row.id : 0))) + 1,
    ]),
  );

  const payload = {
    db: {
      async beginTransaction() {
        calls.begin += 1;
        snapshot = { publishedRows: clone(publishedRows), rows: clone(rows) };
        return `tx-${calls.begin}`;
      },
      async commitTransaction() {
        calls.commit += 1;
        snapshot = null;
      },
      async rollbackTransaction() {
        calls.rollback += 1;
        for (const collection of Object.keys(rows)) {
          rows[collection] = clone(snapshot.rows[collection]);
          publishedRows[collection] = clone(snapshot.publishedRows[collection]);
        }
        snapshot = null;
      },
    },
    async find({ collection, draft }) {
      calls.find.push({ collection, draft: draft === true });
      if (!VERSIONED_COLLECTIONS.has(collection)) return { docs: clone(rows[collection] || []) };
      if (!draft) return { docs: clone(publishedRows[collection] || []) };
      const documents = new Map((publishedRows[collection] || []).map((row) => [String(row.id), row]));
      for (const row of rows[collection] || []) documents.set(String(row.id), row);
      return { docs: clone([...documents.values()]) };
    },
    async create({ collection, data, draft, req }) {
      assert.match(req.transactionID, /^tx-/);
      const cloned = clone(data);
      const document = AUTO_INTEGER_ID_COLLECTIONS.has(collection)
        ? { ...cloned, id: Number.isInteger(cloned.id) ? cloned.id : nextIntegerId[collection]++ }
        : { id: cloned.id || `${collection}-${nextId++}`, ...cloned };
      const targetRows = VERSIONED_COLLECTIONS.has(collection) && !draft ? publishedRows : rows;
      assertUniqueCreate(targetRows, collection, document);
      if (draft) document._status = "draft";
      targetRows[collection].push(document);
      return clone(document);
    },
    async update({ collection, data, draft, id, req }) {
      assert.match(req.transactionID, /^tx-/);
      const targetRows = VERSIONED_COLLECTIONS.has(collection) && !draft ? publishedRows : rows;
      let document = targetRows[collection].find((row) => row.id === id);
      if (!document && draft && VERSIONED_COLLECTIONS.has(collection)) {
        const publishedDocument = publishedRows[collection].find((row) => row.id === id);
        if (publishedDocument) {
          document = clone(publishedDocument);
          targetRows[collection].push(document);
        }
      }
      if (!document) throw new Error(`Missing ${collection} ${id}`);
      Object.assign(document, clone(data));
      if (draft) document._status = "draft";
      return clone(document);
    },
  };
  return { calls, payload, publishedRows, rows };
}

test("Payload CMS importer commits one durable draft graph and reuses it on rerun", async () => {
  const registry = minimalRegistry();
  const seed = minimalSeed();
  const target = fakePayload({
    locales: [{ id: 21, code: "fr", native_name: "French", admin_name: "French", direction: "ltr", public_enabled: false, indexable: false, fallback_locale: null }],
    locations: [{ id: "location:sofia", label: "Sofia", public_location_precision: "approximate" }],
    properties: [
      {
        id: "property-MS-OTHER-9999",
        location: "location:sofia",
        property_family: "apartment",
        property_subtype: "apartment",
        taxonomy_mapping_version: "test",
        taxonomy_review_status: "mapped",
        facts: { primary_area_sqm: 64 },
        fact_verification: [],
        zero_value_audit: [],
        legacy_listing_id: "MS-OTHER-9999",
      },
    ],
    media_assets: [{ id: 41, url: "https://makler-realty.com/wp-content/uploads/2025/04/existing.jpg", asset_url: null, alt: "Existing", width: 640, height: 480, kind: "photo", is_public: false, review_status: "reviewed_private", _status: "draft" }],
    listings: [
      {
        id: "MS-OTHER-9999",
        cms_status: "broker_verified",
        source_locale: 21,
        source_domain: "makler-realty.com",
        source_url: "https://makler-realty.com/listing/existing",
        facts: { title: "Existing listing" },
        seo: { title: "Existing listing" },
        workflow: {},
        property: "property-MS-OTHER-9999",
        location: "location:sofia",
        translations: [],
        media: [41],
        tour: null,
        routing: { review_required: false, deployable: true },
        migration: { record_id: "migration-existing", review_state: "verified", metadata_gaps: [] },
        _status: "draft",
      },
    ],
  });

  const first = await runPayloadCmsImport({
    payload: target.payload,
    registry,
    seed,
    validateRegistry: false,
    validateSeed: false,
  });
  assert.equal(first.status, "committed");
  assert.equal(first.integrity.ok, true);
  assert.equal(first.integrity.readback.collections.listings, 2);
  assert.equal(first.integrity.readback.target.listing_translations.by_status.draft, 2);
  assert.equal(first.integrity.readback.target.listing_translations.public_indexable_true, 0);
  assert.equal(first.integrity.readback.target.media_assets.public_true, 0);
  assert.equal(first.integrity.readback.target.search_outbox.delta, 0);
  const importedListing = target.rows.listings.find((row) => row.id === "MS-TEST-0001");
  assert.equal(importedListing.translations.length, 2);
  assert.equal(importedListing.media.length, 2);
  assert.equal(Boolean(importedListing.tour), true);
  assert.equal(importedListing._status, "draft");
  assert.equal(typeof importedListing.source_locale, "number");
  assert.equal(importedListing.translations.every((id) => typeof id === "number"), true);
  assert.equal(importedListing.media.every((id) => typeof id === "number"), true);
  assert.equal(typeof importedListing.tour, "number");
  assert.equal(target.rows.listing_translations.every((row) => row._status === "draft"), true);
  assert.equal(target.rows.media_assets.every((row) => row.is_public === false), true);
  const unrelatedListing = target.rows.listings.find((row) => row.id === "MS-OTHER-9999");
  assert.deepEqual(unrelatedListing.media, [41]);
  assert.equal(unrelatedListing.source_locale, 21);
  assert.equal(target.rows.locales.find((row) => row.code === "fr").id, 21);

  const second = await runPayloadCmsImport({
    payload: target.payload,
    registry,
    seed,
    validateRegistry: false,
    validateSeed: false,
  });
  assert.equal(second.status, "committed");
  assert.equal(second.plan.byCollection.listings.created, 0);
  assert.equal(second.plan.byCollection.listings.updated, 0);
  assert.equal(second.plan.byCollection.listings.reused, 2);
  assert.equal(target.calls.commit, 2);
});

test("Payload CMS importer reads the latest draft and overwrite never changes the published base", async () => {
  const registry = minimalRegistry();
  const seed = minimalSeed();
  const target = fakePayload(
    {
      listings: [{ id: "MS-TEST-0001", facts: { title: "Newer operator draft" }, _status: "draft" }],
    },
    {
      published: {
        listings: [{ id: "MS-TEST-0001", facts: { title: "Published title" }, _status: "published" }],
      },
    },
  );

  const snapshot = await readPayloadCmsSnapshot({ payload: target.payload });
  assert.equal(snapshot.listings.byId.get("MS-TEST-0001").facts.title, "Newer operator draft");
  assert.equal(
    target.calls.find.filter((call) => VERSIONED_COLLECTIONS.has(call.collection)).every((call) => call.draft),
    true,
  );

  const report = await runPayloadCmsImport({
    overwriteExisting: true,
    payload: target.payload,
    registry,
    seed,
    validateRegistry: false,
    validateSeed: false,
  });

  assert.equal(report.status, "committed");
  assert.equal(report.integrity.ok, true);
  assert.equal(target.rows.listings[0].facts.title, "Seed title");
  assert.equal(target.rows.listings[0]._status, "draft");
  assert.equal(target.publishedRows.listings[0].facts.title, "Published title");
  assert.equal(target.publishedRows.listings[0]._status, "published");
});

test("Payload CMS overwrite preserves a current tour when the seed has none", async () => {
  const registry = minimalRegistry();
  const seed = minimalSeed();
  const target = fakePayload();

  await runPayloadCmsImport({ payload: target.payload, registry, seed, validateRegistry: false, validateSeed: false });
  const currentTour = target.rows.listings.find((row) => row.id === "MS-TEST-0001").tour;
  const seedWithoutTour = clone(seed);
  seedWithoutTour.records[0].tour = null;
  seedWithoutTour.summary.tourFields = 0;

  const report = await runPayloadCmsImport({
    overwriteExisting: true,
    payload: target.payload,
    registry,
    seed: seedWithoutTour,
    validateRegistry: false,
    validateSeed: false,
  });

  assert.equal(report.status, "committed");
  assert.equal(report.integrity.ok, true);
  assert.equal(target.rows.listings.find((row) => row.id === "MS-TEST-0001").tour, currentTour);
});

test("Payload CMS overwrite blocks conflicting non-null tours without partial writes", async () => {
  const registry = minimalRegistry();
  const seed = minimalSeed();
  const target = fakePayload();

  await runPayloadCmsImport({ payload: target.payload, registry, seed, validateRegistry: false, validateSeed: false });
  target.rows.listing_tours.push({ id: 1003, listing_id: "MS-OTHER-9999", review_status: "review_required", is_public: false, _status: "draft" });
  target.rows.listings.find((row) => row.id === "MS-TEST-0001").tour = 1003;

  const report = await runPayloadCmsImport({
    overwriteExisting: true,
    payload: target.payload,
    registry,
    seed,
    validateRegistry: false,
    validateSeed: false,
  });

  assert.equal(report.status, "blocked_conflicts");
  assert.equal(report.plan.conflicts, 1);
  assert.equal(target.calls.commit, 1);
  assert.equal(target.rows.listings.find((row) => row.id === "MS-TEST-0001").tour, 1003);
});

test("Payload CMS rerun preserves operator-added translation and media relationships", async () => {
  const registry = minimalRegistry();
  const seed = minimalSeed();
  const target = fakePayload();

  await runPayloadCmsImport({ payload: target.payload, registry, seed, validateRegistry: false, validateSeed: false });
  const listing = target.rows.listings.find((row) => row.id === "MS-TEST-0001");
  target.rows.locales.push({ id: 99, code: "fr" });
  target.rows.listing_translations.push({
    id: 1001,
    listing: listing.id,
    locale: 99,
    source_locale: 1,
    status: "draft",
    translation_state: "draft",
    public_indexable: false,
    _status: "draft",
  });
  target.rows.media_assets.push({
    id: 1002,
    url: "https://operator.example/manual-photo.jpg",
    is_public: false,
    review_status: "review_required",
    _status: "draft",
  });
  listing.translations.push(1001);
  listing.media.push(1002);

  const report = await runPayloadCmsImport({
    payload: target.payload,
    registry,
    seed,
    validateRegistry: false,
    validateSeed: false,
  });

  assert.equal(report.status, "committed");
  assert.equal(report.integrity.ok, true);
  const persistedListing = target.rows.listings.find((row) => row.id === "MS-TEST-0001");
  assert.equal(persistedListing.translations.map(String).includes("1001"), true);
  assert.equal(persistedListing.media.map(String).includes("1002"), true);
});

test("Payload CMS importer creates one deterministic media asset per URL and dedupes listing relations", async () => {
  const registry = minimalRegistry();
  const seed = mediaDedupSeed();
  const target = fakePayload();

  const report = await runPayloadCmsImport({
    payload: target.payload,
    registry,
    seed,
    validateRegistry: false,
    validateSeed: false,
  });

  assert.equal(report.status, "committed");
  assert.equal(report.integrity.ok, true);
  assert.equal(report.plan.byCollection.media_assets.created, 2);
  assert.equal(target.rows.media_assets.length, 2);

  const sharedAsset = target.rows.media_assets.find((row) => row.url === "https://makler-realty.com/wp-content/uploads/2025/04/shared.jpg");
  assert.equal(sharedAsset.alt, "");
  assert.equal(sharedAsset.review_status, "review_required");

  const listingOne = target.rows.listings.find((row) => row.id === "MS-TEST-0001");
  const listingTwo = target.rows.listings.find((row) => row.id === "MS-TEST-0002");
  assert.deepEqual(listingOne.media, [...new Set(listingOne.media)]);
  assert.deepEqual(listingTwo.media, [...new Set(listingTwo.media)]);
  assert.equal(listingOne.media.includes(sharedAsset.id), true);
  assert.deepEqual(listingTwo.media, [sharedAsset.id]);
});

test("Payload CMS importer fail-closes legacy media review statuses", async () => {
  const registry = minimalRegistry();
  const seed = minimalSeed();
  const legacyMedia = seed.records[0].media.find((media) => media.kind === "site_chrome");
  legacyMedia.review_status = "needs_media_review";
  legacyMedia.is_public = false;
  const target = fakePayload();

  const report = await runPayloadCmsImport({ payload: target.payload, registry, seed, validateRegistry: false, validateSeed: false });
  const projected = target.rows.media_assets.find((media) => media.url === legacyMedia.url);

  assert.equal(report.status, "committed");
  assert.equal(projected.review_status, "review_required");
  assert.equal(projected.is_public, false);
});

test("Payload CMS importer blocks conflicting operator-edited drafts without writing partial state", async () => {
  const registry = minimalRegistry();
  const seed = minimalSeed();
  const existing = fakePayload({
    locales: [
      { id: 1, code: "bg", native_name: "Bulgarian", admin_name: "Bulgarian", direction: "ltr", public_enabled: true, indexable: true, fallback_locale: null },
      { id: 2, code: "en", native_name: "English", admin_name: "English", direction: "ltr", public_enabled: true, indexable: true, fallback_locale: 1 },
    ],
    listings: [
      {
        id: "MS-TEST-0001",
        cms_status: "source_imported_review_required",
        source_locale: 1,
        source_domain: "makler-realty.com",
        source_url: "https://makler-realty.com/listing/test-1",
        facts: { ...seed.records[0].facts, title: "Broker custom title" },
        seo: clone(seed.records[0].seo),
        workflow: {},
        property: "property-MS-TEST-0001",
        location: "location:sandanski",
        translations: [],
        media: [],
        tour: null,
        routing: clone(seed.records[0].routing),
        migration: clone(seed.records[0].migration),
        _status: "draft",
      },
    ],
  });

  const report = await runPayloadCmsImport({
    payload: existing.payload,
    registry,
    seed,
    validateRegistry: false,
    validateSeed: false,
  });
  assert.equal(report.status, "blocked_conflicts");
  assert.equal(report.write_blockers_total > 0, true);
  assert.equal(existing.calls.commit, 0);
  assert.equal(existing.calls.rollback, 1);
  assert.equal(existing.rows.listings[0].facts.title, "Broker custom title");
  assert.equal(existing.rows.listing_translations.length, 0);
});

test("Payload CMS projection overlays durable draft rows onto the seed shape", async () => {
  const registry = minimalRegistry();
  const seed = minimalSeed();
  const target = fakePayload();

  await runPayloadCmsImport({
    payload: target.payload,
    registry,
    seed,
    validateRegistry: false,
    validateSeed: false,
  });
  target.rows.listings[0].facts.title = "Payload draft title";
  target.rows.listings[0].seo.title = "Payload SEO title";

  const snapshot = await readPayloadCmsSnapshot({ payload: target.payload });
  const overlay = projectPayloadCmsSeed(seed, snapshot);

  assert.equal(overlay.records[0].facts.title, "Payload draft title");
  assert.equal(overlay.records[0].seo.title, "Payload SEO title");
  assert.equal(overlay.records[0].translations.every((row) => row.status === "draft"), true);
  assert.equal(overlay.records[0].media_workflow.total_assets, 2);
  assert.equal(overlay.payload_overlay.source, "payload_draft_overlay");
});

test("Importer context helper marks backfill writes as side-effect-suppressed", () => {
  assert.equal(payloadCmsImportContextEnabled({ context: { [CMS_SEED_IMPORT_CONTEXT_FLAG]: true } }), true);
  assert.equal(payloadCmsImportContextEnabled({ context: {} }), false);
  assert.equal(payloadCmsImportContextEnabled({}), false);
});
