import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadListings } from "../lib/content.mjs";
import {
  assertCmsCollections,
  assertCmsSeed,
  buildCmsCollections,
  buildCmsSeed,
  enrichmentTaskForListing,
  loadMediaInventory,
  searchOutboxEventForListing,
} from "../lib/cms-seed.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { assertPayloadCollections, buildPayloadCollections } from "../lib/payload-collections.mjs";
import { fromRoot } from "../lib/paths.mjs";

const registry = loadLocaleRegistry();
const listings = loadListings();
const migrationRecords = JSON.parse(fs.readFileSync(fromRoot("production", "data", "migration-records.json"), "utf8")).records;
const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
const mediaRows = loadMediaInventory();

test("CMS seed composes listing, migration, route, translation, and media data", () => {
  const seed = buildCmsSeed(registry, { listings, migrationRecords, routeMap, mediaRows });
  const summary = assertCmsSeed(seed);
  const fixtureListing = seed.records.find((record) => record.id === "MS-CRAWL-0001");
  const ruListing = seed.records.find((record) => record.source_locale === "ru");

  assert.equal(summary.listings, 165);
  assert.equal(summary.properties, 165);
  assert.ok(summary.locations > 0);
  assert.equal(summary.enrichmentTasks, 165);
  assert.equal(summary.mediaAssets, 4978);
  assert.ok(summary.publicGalleryAssets > 0);
  assert.ok(summary.mediaReviewGatedAssets > 0);
  assert.equal(summary.videoCandidates, 0);
  assert.equal(summary.tourFields, 165);
  assert.equal(summary.publicTours, 0);
  assert.equal(fixtureListing.translations.some((translation) => translation.locale === "he" && translation.public_indexable), true);
  assert.equal(fixtureListing.translations.some((translation) => translation.locale === "fr"), false);
  assert.equal(fixtureListing.routing.deployable, false);
  assert.equal(fixtureListing.routing.review_required, true);
  assert.equal(fixtureListing.property, "property-MS-CRAWL-0001");
  assert.ok(fixtureListing.location.startsWith("location:"));
  assert.equal(fixtureListing.translations.every((translation) => translation.listing === fixtureListing.id), true);
  assert.equal(fixtureListing.translations.every((translation) => translation.translation_state === translation.status), true);
  assert.ok(fixtureListing.media.length > 0);
  assert.ok(fixtureListing.media.some((media) => media.kind === "photo" && media.is_public));
  assert.ok(fixtureListing.media.filter((media) => media.kind === "photo" && media.is_public).every((media) => media.alt));
  assert.equal(fixtureListing.media_workflow.total_assets, fixtureListing.media.length);
  assert.equal(fixtureListing.tour.provider, "photo-sphere-viewer");
  assert.equal(fixtureListing.tour.is_public, false);
  assert.ok(fixtureListing.tour.fallback_gallery.length > 0);
  assert.ok(ruListing.routing.target_path.startsWith("/ru/"));
  const property = seed.properties.find((record) => record.id === fixtureListing.property);
  assert.equal(property.location, fixtureListing.location);
  assert.ok(Array.isArray(property.fact_verification));
  assert.equal(property.fact_verification.some((fact) => fact.state === "broker_verified"), false);
  assert.equal(seed.enrichment_tasks.some((task) => task.listing === fixtureListing.id && task.property === property.id), true);
  assert.equal(seed.taxonomy_contract.version, property.taxonomy_mapping_version);
  assert.deepEqual(seed.taxonomy_contract.mappings.find((mapping) => mapping.legacy_property_type === "land"), {
    legacy_property_type: "land",
    property_family: "plot",
    property_subtype: null,
    review_status: "mapping_review_required",
  });
});

test("price-on-request seed records never retain a numeric price projection", () => {
  const priceOnRequest = listings.map((listing, index) =>
    index === 0 ? { ...listing, price_on_request: true, price_eur: 123456 } : listing,
  );
  const seed = buildCmsSeed(registry, { listings: priceOnRequest, migrationRecords, routeMap, mediaRows });

  assert.equal(seed.records[0].facts.price_on_request, true);
  assert.equal(seed.records[0].facts.price_eur, null);
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
  assert.equal(summary.records.listing_translations, 167);
  assert.equal(summary.records.media_assets, 4978);
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

  const propertyContract = manifest.collections.find((collection) => collection.slug === "properties");
  const propertyFields = new Map(propertyContract.fields.map((field) => [field.name, field]));
  assert.equal(propertyFields.get("location").relationTo, "locations");
  assert.equal(propertyFields.get("facts").type, "group");
  assert.equal(propertyFields.get("fact_verification").type, "array");

  const translationsContract = manifest.collections.find((collection) => collection.slug === "listing_translations");
  const translationFields = new Map(translationsContract.fields.map((field) => [field.name, field]));
  assert.equal(translationFields.get("listing").relationTo, "listings");
  assert.equal(translationFields.get("translation_state").options.includes("approved"), true);

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
  assert.deepEqual(tourFields.get("panorama_url").required_when, ["approved", "published"]);
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

  assert.equal(summary.collections, 8);
  assert.equal(listingsConfig.versions.drafts, true);
  assert.equal(listingsConfig.custom.publish_requires_human_review, true);
  assert.equal(facts.fields.some((field) => field.name === "price_eur" && field.type === "number"), true);
  assert.equal(mediaConfig.fields.find((field) => field.name === "url").type, "text");
  assert.equal(toursConfig.fields.find((field) => field.name === "fallback_gallery").fields[0].name, "url");
  const propertiesConfig = payload.collections.find((collection) => collection.slug === "properties");
  const verification = propertiesConfig.fields.find((field) => field.name === "fact_verification");
  assert.equal(propertiesConfig.versions, false);
  assert.equal(verification.fields.find((field) => field.name === "state").type, "select");
  const propertyFacts = propertiesConfig.fields.find((field) => field.name === "facts");
  assert.equal(propertyFacts.fields.find((field) => field.name === "bedrooms_count").custom.property_families.includes("apartment"), true);
  assert.equal(propertyFacts.fields.find((field) => field.name === "bedrooms_count").custom.property_families.includes("plot"), false);
  assert.equal(typeof payload.taxonomy_contract.version, "string");
  assert.ok(payload.taxonomy_contract.version);
  const taskConfig = payload.collections.find((collection) => collection.slug === "listing_enrichment_tasks");
  assert.equal(taskConfig.versions, false);
  const outboxConfig = payload.collections.find((collection) => collection.slug === "search_outbox");
  assert.equal(outboxConfig.fields.find((field) => field.name === "payload").type, "json");
});

test("backfill tasks and search outbox events are deterministic and exclude private listing content", () => {
  const first = enrichmentTaskForListing({ listingId: "MS-CRAWL-0001", propertyId: "property-MS-CRAWL-0001", factFields: ["bedrooms_count"] });
  const replay = enrichmentTaskForListing({ listingId: "MS-CRAWL-0001", propertyId: "property-MS-CRAWL-0001", factFields: ["bedrooms_count"] });
  assert.equal(first.idempotency_key, replay.idempotency_key);

  const event = searchOutboxEventForListing(
    {
      id: "MS-CRAWL-0001",
      description: "source copy must not be queued",
      source_url: "https://private.example/listing",
      internal_latitude: 41.5,
      internal_longitude: 23.2,
    },
    { changeToken: "2026-07-30T12:00:00.000Z" },
  );
  assert.deepEqual(event.payload, {
    schema_version: 1,
    listing_id: "MS-CRAWL-0001",
    change_token: "2026-07-30T12:00:00.000Z",
  });
  assert.equal(JSON.stringify(event.payload).includes("private"), false);
  assert.equal(JSON.stringify(event.payload).includes("latitude"), false);
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
