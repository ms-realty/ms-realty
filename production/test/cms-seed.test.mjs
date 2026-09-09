import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { listingSourceSnapshot, loadListings } from "../lib/content.mjs";
import {
  assertCmsCollections,
  assertCmsSeed,
  buildCmsCollections,
  buildCmsSeed,
  enrichmentTaskForListing,
  loadMediaInventory,
  searchOutboxEventForListing,
  EXPECTED_SEED_MEDIA_ROWS,
} from "../lib/cms-seed.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { assertPayloadCollections, buildPayloadCollections } from "../lib/payload-collections.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { contentHash } from "../lib/translations.mjs";

const registry = loadLocaleRegistry();
const listings = loadListings();
const migrationRecords = JSON.parse(fs.readFileSync(fromRoot("production", "data", "migration-records.json"), "utf8")).records;
const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
const mediaRows = loadMediaInventory();

test("CMS seed composes listing, migration, route, translation, and media data", () => {
  const seed = buildCmsSeed(registry, { listings, migrationRecords, routeMap, mediaRows });
  const summary = assertCmsSeed(seed);
  const fixtureListing = seed.records.find((record) => record.id === "MS-00815");
  const fixtureSourceListing = listings.find((listing) => listing.id === fixtureListing.id);
  const polenitsaListing = seed.records.find((record) => record.id === "MS-00865");
  const greekListing = seed.records.find((record) => record.id === "MS-00930");
  const ruListing = seed.records.find((record) => record.source_locale === "ru");

  assert.equal(summary.listings, 165);
  assert.equal(summary.properties, 165);
  assert.ok(summary.locations > 0);
  assert.equal(summary.enrichmentTasks, 165);
  assert.equal(summary.mediaAssets, EXPECTED_SEED_MEDIA_ROWS);
  assert.ok(summary.publicGalleryAssets > 0);
  assert.ok(summary.mediaReviewGatedAssets > 0);
  assert.equal(summary.videoCandidates, 0);
  assert.equal(summary.tourFields, 165);
  assert.equal(summary.publicTours, 0);
  assert.deepEqual(fixtureListing.translations.map((translation) => translation.locale), ["bg"]);
  assert.equal(fixtureListing.translations[0].title, fixtureListing.facts.h1);
  assert.equal(fixtureListing.translations[0].content_origin, "legacy_source_import");
  assert.equal(fixtureListing.translations.some((translation) => translation.locale === "fr"), false);
  assert.equal(fixtureListing.routing.deployable, false);
  assert.equal(fixtureListing.routing.review_required, true);
  assert.equal(fixtureListing.property, "property-MS-00815");
  assert.equal(fixtureListing.location, "location:sandanski");
  assert.equal(fixtureListing.translations.every((translation) => translation.listing === fixtureListing.id), true);
  assert.equal(fixtureListing.translations.every((translation) => translation.translation_state === translation.status), true);
  assert.ok(fixtureListing.media.length > 0);
  assert.ok(fixtureListing.media.some((media) => media.kind === "photo" && media.is_public));
  assert.ok(fixtureListing.media.filter((media) => media.kind === "photo" && media.is_public).every((media) => media.alt));
  assert.equal(fixtureListing.media_workflow.total_assets, fixtureListing.media.length);
  assert.equal(fixtureListing.tour.provider, "photo-sphere-viewer");
  assert.equal(fixtureListing.tour.is_public, false);
  assert.ok(fixtureListing.tour.fallback_gallery.length > 0);
  assert.equal(fixtureListing.facts.description, fixtureSourceListing.description);
  assert.equal(fixtureListing.seo.description, fixtureListing.migration.source_seo.meta_description);
  assert.equal(fixtureListing.migration.source_seo.meta_description, migrationRecords.find((record) => record.old_url === fixtureListing.source_url).source_seo.meta_description);
  assert.equal(fixtureListing.migration.source_seo.open_graph, migrationRecords.find((record) => record.old_url === fixtureListing.source_url).source_seo.open_graph);
  assert.deepEqual(
    {
      location: polenitsaListing.facts.location,
      location_native: polenitsaListing.facts.location_native,
      municipality_code: polenitsaListing.facts.municipality_code,
      district: polenitsaListing.facts.district,
      district_code: polenitsaListing.facts.district_code,
      geography_id: polenitsaListing.facts.geography_id,
      settlement_ekatte: polenitsaListing.facts.settlement_ekatte,
      status: polenitsaListing.facts.location_review_status,
    },
    {
      location: "Polenitsa",
      location_native: "Поленица",
      municipality_code: "BLG40",
      district: "Blagoevgrad",
      district_code: "BLG",
      geography_id: "BG:settlement:57176",
      settlement_ekatte: "57176",
      status: "confirmed_settlement",
    },
  );
  assert.deepEqual(
    {
      location: greekListing.facts.location,
      country_code: greekListing.facts.country_code,
      geography_id: greekListing.facts.geography_id,
      region_id: greekListing.facts.region_id,
      status: greekListing.facts.location_review_status,
    },
    {
      location: "Logari",
      country_code: "GR",
      geography_id: "GR:settlement:EL52:1202020404",
      region_id: "GR:region:EL52",
      status: "confirmed_foreign_settlement",
    },
  );
  assert.ok(ruListing.routing.target_path.startsWith("/ru/"));
  const property = seed.properties.find((record) => record.id === fixtureListing.property);
  assert.equal(property.location, fixtureListing.location);
  assert.ok(Array.isArray(property.fact_verification));
  assert.equal(property.fact_verification.some((fact) => fact.state === "broker_verified"), false);
  assert.equal(seed.enrichment_tasks.some((task) => task.listing === fixtureListing.id && task.property === property.id), true);
  assert.equal(seed.taxonomy_contract.version, property.taxonomy_mapping_version);
  assert.equal(seed.records.every((record) => Boolean(record.location && record.facts.location)), true);
  assert.equal(seed.locations.some((location) => /unknown|unreviewed/i.test(location.label)), false);
  assert.deepEqual(seed.taxonomy_contract.mappings.find((mapping) => mapping.legacy_property_type === "land"), {
    legacy_property_type: "land",
    property_family: "plot",
    property_subtype: null,
    review_status: "mapping_review_required",
  });
});

test("CMS seed persists the catalog projected translation row without weakening publication gates", () => {
  const sourceListing = listings.find((candidate) => candidate.id === "MS-00815");
  const source = listingSourceSnapshot(sourceListing);
  const copy = {
    title: "Approved English listing title",
    description: "Approved English listing description backed by the source listing.",
    seo_title: "Approved English listing title",
    meta_description: "Approved English listing description backed by the source listing.",
  };
  const publishedAt = "2026-08-30T08:00:00.000Z";
  const seed = buildCmsSeed(registry, {
    listings,
    migrationRecords,
    routeMap,
    mediaRows,
    translationRecords: [
      {
        listing: sourceListing.id,
        locale: "en",
        source_locale: sourceListing.locale,
        status: "published",
        translation_state: "published",
        source_hash: contentHash(source),
        translated_hash: contentHash(copy),
        ...copy,
        content_origin: "manual_translation",
        reviewer: "ms-realty-owner",
        approved_at: publishedAt,
        human_approved: true,
        publication_authorized_by: "ms-realty-owner",
        published_at: publishedAt,
        direction: "ltr",
        public_indexable: true,
      },
    ],
  });
  const translation = seed.records.find((record) => record.id === sourceListing.id).translations.find((row) => row.locale === "en");

  assert.deepEqual(
    {
      title: translation.title,
      description: translation.description,
      seo_title: translation.seo_title,
      meta_description: translation.meta_description,
      content_origin: translation.content_origin,
      reviewer: translation.reviewer,
      human_approved: translation.human_approved,
      publication_authorized_by: translation.publication_authorized_by,
      publication_authorized_at: translation.publication_authorized_at,
      published_at: translation.published_at,
      public_indexable: translation.public_indexable,
    },
    {
      ...copy,
      content_origin: "manual_translation",
      reviewer: "ms-realty-owner",
      human_approved: true,
      publication_authorized_by: "ms-realty-owner",
      publication_authorized_at: publishedAt,
      published_at: publishedAt,
      public_indexable: true,
    },
  );
  assert.equal(translation.translated_hash, contentHash(copy));
});

test("CMS seed rejects Location precision outside the canonical enum", () => {
  const seed = buildCmsSeed(registry, { listings, migrationRecords, routeMap, mediaRows });
  seed.locations[0].public_location_precision = "area_only";

  assert.throws(() => assertCmsSeed(seed), /Location collection precision/);
});

test("CMS seed rejects SEO descriptions longer than the editor contract", () => {
  const seed = buildCmsSeed(registry, { listings, migrationRecords, routeMap, mediaRows });
  seed.records[0].seo.description = "x".repeat(321);

  assert.throws(() => assertCmsSeed(seed), /seo\.description must be 320 characters or fewer/);
});

test("price-on-request seed records never retain a numeric price projection", () => {
  const priceOnRequest = listings.map((listing, index) =>
    index === 0 ? { ...listing, price_on_request: true, price_eur: 123456 } : listing,
  );
  const seed = buildCmsSeed(registry, { listings: priceOnRequest, migrationRecords, routeMap, mediaRows });

  assert.equal(seed.records[0].facts.price_on_request, true);
  assert.equal(seed.records[0].facts.price_eur, null);
});

test("a rent below any plausible monthly total is published as price on request", () => {
  const rentUnitError = listings.map((listing, index) =>
    index === 0
      ? { ...listing, offer_type: "rent", price_on_request: false, price_eur: 1 }
      : index === 1
        ? { ...listing, offer_type: "rent", price_on_request: false, price_eur: 750 }
        : listing,
  );
  const seed = buildCmsSeed(registry, { listings: rentUnitError, migrationRecords, routeMap, mediaRows });

  assert.equal(seed.records[0].facts.price_eur, null);
  assert.equal(seed.records[0].facts.price_on_request, true);
  assert.equal(seed.records[1].facts.price_eur, 750);
  assert.equal(seed.records[1].facts.price_on_request, false);
});

test("canonical property backfill keeps physical facts pending review and audits unverified zeroes", () => {
  const physicalFacts = listings.map((listing, index) =>
    index === 0
      ? {
          ...listing,
          property_type: "apartment",
          bedrooms: 0,
          area_sqm: 50,
          floor: 2,
          total_floors: 5,
          land_area_sqm: 0,
          condition: "ready to review",
        }
      : listing,
  );
  const seed = buildCmsSeed(registry, { listings: physicalFacts, migrationRecords, routeMap, mediaRows });
  const listing = seed.records[0];
  const property = seed.properties.find((candidate) => candidate.id === listing.property);
  const task = seed.enrichment_tasks.find((candidate) => candidate.property === property.id);
  const verification = new Map(property.fact_verification.map((fact) => [fact.field, fact.state]));

  assert.equal(property.property_family, "apartment");
  assert.equal(property.facts.built_area_sqm, 50);
  assert.equal(property.facts.floor_number, 2);
  assert.equal(property.facts.total_floors, 5);
  assert.equal(property.facts.condition, "ready to review");
  assert.equal(verification.get("built_area_sqm"), "entered_pending_review");
  assert.equal(verification.get("floor_number"), "entered_pending_review");
  assert.equal(verification.get("condition"), "entered_pending_review");
  assert.equal(verification.get("bedrooms_count"), "unknown");
  assert.equal(verification.get("land_area_sqm"), "unknown");
  assert.deepEqual(property.zero_value_audit.sort(), ["bedrooms_count", "land_area_sqm"]);
  for (const field of ["built_area_sqm", "floor_number", "total_floors", "condition", "bedrooms_count", "land_area_sqm"]) {
    assert.equal(task.fact_fields.includes(field), true);
  }
});

test("CMS collection manifest exposes implemented Payload-style contracts only", () => {
  const seed = buildCmsSeed(registry, { listings, migrationRecords, routeMap, mediaRows });
  const manifest = buildCmsCollections(seed);
  const summary = assertCmsCollections(manifest);
  const slugs = manifest.collections.map((collection) => collection.slug);

  assert.deepEqual(slugs, [
    "listings",
    "listing_translations",
    "properties",
    "locations",
    "listing_enrichment_tasks",
    "search_outbox",
    "media_assets",
    "listing_tours",
  ]);
  assert.equal(summary.records.listings, 165);
  assert.equal(summary.records.properties, 165);
  assert.ok(summary.records.locations > 0);
  assert.equal(summary.records.listing_translations, 165);
  assert.equal(summary.records.media_assets, EXPECTED_SEED_MEDIA_ROWS);
  assert.equal(summary.records.listing_tours, 165);
  assert.equal(summary.records.listing_enrichment_tasks, 165);
  assert.equal(summary.records.search_outbox, 0);
  assert.equal(summary.public_tours, 0);
  assert.equal(manifest.collections.every((collection) => collection.publish_requires_human_review), true);
  assert.equal(
    manifest.collections.every((collection) =>
      collection.fields.every((field) => typeof field.name === "string" && typeof field.type === "string" && typeof field.required === "boolean")
    ),
    true
  );

  const listingsContract = manifest.collections.find((collection) => collection.slug === "listings");
  const listingFields = new Map(listingsContract.fields.map((field) => [field.name, field]));
  assert.deepEqual(
    {
      type: listingFields.get("source_locale").type,
      relationTo: listingFields.get("source_locale").relationTo,
      required: listingFields.get("source_locale").required,
    },
    { type: "relationship", relationTo: "locales", required: true }
  );
  assert.equal(listingFields.get("translations").relationTo, "listing_translations");
  assert.equal(listingFields.get("media").relationTo, "media_assets");
  assert.equal(listingFields.get("tour").relationTo, "listing_tours");
  assert.equal(listingFields.get("property").relationTo, "properties");
  assert.equal(listingFields.get("location").relationTo, "locations");
  assert.equal(listingFields.get("location").required, false);
  assert.equal(listingFields.get("workflow").type, "group");

  const propertyContract = manifest.collections.find((collection) => collection.slug === "properties");
  const propertyFields = new Map(propertyContract.fields.map((field) => [field.name, field]));
  assert.equal(propertyFields.get("location").relationTo, "locations");
  assert.equal(propertyFields.get("location").required, false);
  assert.equal(propertyFields.get("facts").type, "group");
  assert.equal(propertyFields.get("fact_verification").type, "array");

  const translationsContract = manifest.collections.find((collection) => collection.slug === "listing_translations");
  const translationFields = new Map(translationsContract.fields.map((field) => [field.name, field]));
  assert.equal(translationFields.get("listing").relationTo, "listings");
  assert.equal(translationFields.get("translation_state").options.includes("approved"), true);
  assert.equal(translationFields.get("translation_state").options.includes("draft"), true);

  const taskContract = manifest.collections.find((collection) => collection.slug === "listing_enrichment_tasks");
  const taskFields = new Map(taskContract.fields.map((field) => [field.name, field]));
  assert.equal(taskFields.get("idempotency_key").unique, true);

  const outboxContract = manifest.collections.find((collection) => collection.slug === "search_outbox");
  const outboxFields = new Map(outboxContract.fields.map((field) => [field.name, field]));
  assert.equal(outboxFields.get("listing").relationTo, "listings");
  assert.equal(outboxFields.get("listing").required, false);
  assert.equal(outboxFields.get("idempotency_key").unique, true);

  const mediaContract = manifest.collections.find((collection) => collection.slug === "media_assets");
  const mediaFields = new Map(mediaContract.fields.map((field) => [field.name, field]));
  assert.equal(mediaFields.get("alt").localized, true);
  assert.equal(mediaFields.get("review_status").options.includes("review_required"), true);

  const toursContract = manifest.collections.find((collection) => collection.slug === "listing_tours");
  const tourFields = new Map(toursContract.fields.map((field) => [field.name, field]));
  assert.deepEqual(tourFields.get("provider").options, ["photo-sphere-viewer", "supersplat-viewer"]);
  assert.equal(tourFields.get("panorama_url").required_when, undefined);
  assert.equal(tourFields.get("viewer_url").type, "url");
  assert.equal(tourFields.get("review_status").options.includes("needs_viewer_upload"), true);
  assert.equal(tourFields.get("accessibility_caption").localized, true);
});

test("Payload collection configs adapt CMS manifest fields without adding Payload runtime dependency", () => {
  const seed = buildCmsSeed(registry, { listings, migrationRecords, routeMap, mediaRows });
  const payload = buildPayloadCollections(buildCmsCollections(seed));
  const summary = assertPayloadCollections(payload);
  const listingsConfig = payload.collections.find((collection) => collection.slug === "listings");
  const facts = listingsConfig.fields.find((field) => field.name === "facts");
  const mediaConfig = payload.collections.find((collection) => collection.slug === "media_assets");
  const toursConfig = payload.collections.find((collection) => collection.slug === "listing_tours");
  const translationsConfig = payload.collections.find((collection) => collection.slug === "listing_translations");

  assert.equal(summary.collections, 8);
  assert.equal(listingsConfig.versions.drafts, true);
  assert.equal(listingsConfig.versions.maxPerDoc, 0);
  assert.equal(listingsConfig.custom.publish_requires_human_review, true);
  assert.equal(facts.fields.some((field) => field.name === "price_eur" && field.type === "number"), true);
  assert.equal(facts.fields.some((field) => field.name === "settlement_ekatte" && field.type === "text"), true);
  assert.equal(facts.fields.some((field) => field.name === "district_code" && field.type === "text"), true);
  assert.deepEqual(facts.fields.find((field) => field.name === "listing_status").options, ["available", "reserved", "sold", "rented", "archived"]);
  assert.equal(mediaConfig.fields.find((field) => field.name === "url").type, "text");
  assert.equal(toursConfig.fields.find((field) => field.name === "fallback_gallery").fields[0].name, "url");
  assert.equal(toursConfig.fields.find((field) => field.name === "viewer_url").type, "text");
  for (const field of ["title", "description", "seo_title", "meta_description", "content_origin", "human_approved", "publication_authorized_by", "published_at"]) {
    assert.ok(translationsConfig.fields.some((candidate) => candidate.name === field), `missing listing translation field ${field}`);
  }
  const propertiesConfig = payload.collections.find((collection) => collection.slug === "properties");
  const verification = propertiesConfig.fields.find((field) => field.name === "fact_verification");
  assert.equal(propertiesConfig.versions, false);
  assert.equal(verification.fields.find((field) => field.name === "state").type, "select");
  const propertyFacts = propertiesConfig.fields.find((field) => field.name === "facts");
  assert.equal(propertyFacts.fields.find((field) => field.name === "bedrooms_count").custom.property_families.includes("apartment"), true);
  assert.equal(propertyFacts.fields.find((field) => field.name === "bedrooms_count").custom.property_families.includes("plot"), false);
  const workflow = listingsConfig.fields.find((field) => field.name === "workflow");
  const seo = listingsConfig.fields.find((field) => field.name === "seo");
  assert.equal(seo.fields.find((field) => field.name === "canonical_override").type, "text");
  assert.deepEqual(seo.fields.find((field) => field.name === "robots").options, ["index,follow", "noindex,follow"]);
  assert.equal(workflow.fields.find((field) => field.name === "location_verified_at").type, "date");
  assert.equal(workflow.fields.find((field) => field.name === "price_on_request_verified_at").type, "date");
  assert.equal(workflow.fields.find((field) => field.name === "publish_approved").type, "checkbox");
  assert.equal(workflow.fields.find((field) => field.name === "last_edit_event").type, "json");
  assert.equal(typeof payload.taxonomy_contract.version, "string");
  assert.ok(payload.taxonomy_contract.version);
  const taskConfig = payload.collections.find((collection) => collection.slug === "listing_enrichment_tasks");
  assert.equal(taskConfig.versions, false);
  const outboxConfig = payload.collections.find((collection) => collection.slug === "search_outbox");
  assert.equal(outboxConfig.fields.find((field) => field.name === "payload").type, "json");
});

test("backfill tasks and search outbox events are deterministic and exclude private listing content", () => {
  const first = enrichmentTaskForListing({ listingId: "MS-00815", propertyId: "property-MS-00815", factFields: ["bedrooms_count"] });
  const replay = enrichmentTaskForListing({ listingId: "MS-00815", propertyId: "property-MS-00815", factFields: ["bedrooms_count"] });
  assert.equal(first.idempotency_key, replay.idempotency_key);

  const event = searchOutboxEventForListing(
    {
      id: "MS-00815",
      description: "source copy must not be queued",
      source_url: "https://private.example/listing",
      internal_latitude: 41.5,
      internal_longitude: 23.2,
    },
    { changeToken: "2026-07-30T12:00:00.000Z" },
  );
  assert.deepEqual(event.payload, {
    schema_version: 1,
    listing_id: "MS-00815",
    change_token: "2026-07-30T12:00:00.000Z",
  });
  assert.equal(JSON.stringify(event.payload).includes("private"), false);
  assert.equal(JSON.stringify(event.payload).includes("latitude"), false);
});

test("property schema migration reverses every legacy compatibility field it adds", () => {
  const migration = fs.readFileSync(fromRoot("migrations", "20260730_120000_property_search_schema.ts"), "utf8");
  const [up, down] = migration.split("export async function down");
  const compatibilityFields = [
    ["listings", "facts_bedrooms_not_applicable"],
    ["listings", "facts_area_sqm"],
    ["listings", "facts_floor"],
    ["listings", "facts_total_floors"],
    ["listings", "facts_land_area_sqm"],
    ["listings", "facts_condition"],
    ["listings", "facts_location_precision"],
    ["_listings_v", "version_facts_bedrooms_not_applicable"],
    ["_listings_v", "version_facts_area_sqm"],
    ["_listings_v", "version_facts_floor"],
    ["_listings_v", "version_facts_total_floors"],
    ["_listings_v", "version_facts_land_area_sqm"],
    ["_listings_v", "version_facts_condition"],
    ["_listings_v", "version_facts_location_precision"],
  ];

  for (const [table, field] of compatibilityFields) {
    assert.match(up, new RegExp(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${field}"`));
    assert.match(down, new RegExp(`ALTER TABLE "${table}" DROP COLUMN "${field}"`));
  }
});

test("generated CMS seed file is valid when present", () => {
  const file = fromRoot("production", "data", "cms-seed.json");
  if (!fs.existsSync(file)) return;
  const seed = JSON.parse(fs.readFileSync(file, "utf8"));
  const summary = assertCmsSeed(seed);
  assert.equal(summary.bySourceLocale.ru, 52);
  assert.equal(seed.records.length, 165);
});

test("generated CMS collection manifest is valid when present", () => {
  const file = fromRoot("production", "data", "cms-collections.json");
  if (!fs.existsSync(file)) return;
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  const summary = assertCmsCollections(manifest);
  assert.equal(summary.records.listing_tours, 165);
  assert.equal(summary.records.properties, 165);
});

test("generated Payload collection config file is valid when present", () => {
  const file = fromRoot("production", "data", "payload-collections.json");
  if (!fs.existsSync(file)) return;
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const summary = assertPayloadCollections(payload);
  assert.equal(summary.collections, 8);
});
