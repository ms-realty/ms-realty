import test from "node:test";
import assert from "node:assert/strict";
import { CMS_SEED_IMPORT_CONTEXT_FLAG, payloadCmsImportContextEnabled, projectPayloadCmsSeed, readPayloadCmsSnapshot, runPayloadCmsImport } from "../lib/payload-cms-import.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function fakePayload(initial = {}) {
  const rows = Object.fromEntries(
    ["locales", "locations", "properties", "listings", "listing_translations", "media_assets", "listing_tours", "listing_enrichment_tasks", "search_outbox"].map(
      (collection) => [collection, clone(initial[collection] || [])],
    ),
  );
  const calls = { begin: 0, commit: 0, rollback: 0 };
  let nextId = 1;
  let snapshot = null;

  const payload = {
    db: {
      async beginTransaction() {
        calls.begin += 1;
        snapshot = clone(rows);
        return `tx-${calls.begin}`;
      },
      async commitTransaction() {
        calls.commit += 1;
        snapshot = null;
      },
      async rollbackTransaction() {
        calls.rollback += 1;
        for (const collection of Object.keys(rows)) rows[collection] = clone(snapshot[collection]);
        snapshot = null;
      },
    },
    async find({ collection }) {
      return { docs: clone(rows[collection] || []) };
    },
    async create({ collection, data, draft, req }) {
      assert.match(req.transactionID, /^tx-/);
      const document = { id: data.id || `${collection}-${nextId++}`, ...clone(data) };
      if (draft) document._status = "draft";
      rows[collection].push(document);
      return clone(document);
    },
    async update({ collection, data, draft, id, req }) {
      assert.match(req.transactionID, /^tx-/);
      const document = rows[collection].find((row) => row.id === id);
      if (!document) throw new Error(`Missing ${collection} ${id}`);
      Object.assign(document, clone(data));
      if (draft) document._status = "draft";
      return clone(document);
    },
  };
  return { calls, payload, rows };
}

test("Payload CMS importer commits one durable draft graph and reuses it on rerun", async () => {
  const registry = minimalRegistry();
  const seed = minimalSeed();
  const target = fakePayload();

  const first = await runPayloadCmsImport({
    payload: target.payload,
    registry,
    seed,
    validateRegistry: false,
    validateSeed: false,
  });
  assert.equal(first.status, "committed");
  assert.equal(first.integrity.ok, true);
  assert.equal(first.integrity.readback.collections.listings, 1);
  assert.equal(first.integrity.readback.listing_translations.by_status.draft, 2);
  assert.equal(first.integrity.readback.listing_translations.public_indexable_true, 0);
  assert.equal(first.integrity.readback.media_assets.public_true, 0);
  assert.equal(first.integrity.readback.search_outbox.delta, 0);
  assert.equal(target.rows.listings[0].translations.length, 2);
  assert.equal(target.rows.listings[0].media.length, 2);
  assert.equal(Boolean(target.rows.listings[0].tour), true);
  assert.equal(target.rows.listings[0]._status, "draft");
  assert.equal(target.rows.listing_translations.every((row) => row._status === "draft"), true);
  assert.equal(target.rows.media_assets.every((row) => row.is_public === false), true);

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
  assert.equal(second.plan.byCollection.listings.reused, 1);
  assert.equal(target.calls.commit, 2);
});

test("Payload CMS importer blocks conflicting operator-edited drafts without writing partial state", async () => {
  const registry = minimalRegistry();
  const seed = minimalSeed();
  const existing = fakePayload({
    listings: [
      {
        id: "MS-TEST-0001",
        cms_status: "source_imported_review_required",
        source_locale: "bg",
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

  const transactionID = await target.payload.db.beginTransaction();
  const req = { payload: target.payload, transactionID };
  const snapshot = await readPayloadCmsSnapshot({ payload: target.payload, req });
  const overlay = projectPayloadCmsSeed(seed, snapshot);
  await target.payload.db.rollbackTransaction();

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
