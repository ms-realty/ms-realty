import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadListings } from "../lib/content.mjs";
import { assertCmsCollections, assertCmsSeed, buildCmsCollections, buildCmsSeed, loadMediaInventory } from "../lib/cms-seed.mjs";
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
  const polenitsaListing = seed.records.find((record) => record.id === "MS-CRAWL-0033");
  const greekListing = seed.records.find((record) => record.id === "MS-CRAWL-0072");
  const ruListing = seed.records.find((record) => record.source_locale === "ru");

  assert.equal(summary.listings, 165);
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
  assert.ok(fixtureListing.media.length > 0);
  assert.ok(fixtureListing.media.some((media) => media.kind === "photo" && media.is_public));
  assert.ok(fixtureListing.media.filter((media) => media.kind === "photo" && media.is_public).every((media) => media.alt));
  assert.equal(fixtureListing.media_workflow.total_assets, fixtureListing.media.length);
  assert.equal(fixtureListing.tour.provider, "photo-sphere-viewer");
  assert.equal(fixtureListing.tour.is_public, false);
  assert.ok(fixtureListing.tour.fallback_gallery.length > 0);
  assert.equal(fixtureListing.migration.source_seo.meta_description, migrationRecords.find((record) => record.old_url === fixtureListing.source_url).source_seo.meta_description);
  assert.equal(fixtureListing.migration.source_seo.open_graph, migrationRecords.find((record) => record.old_url === fixtureListing.source_url).source_seo.open_graph);
  assert.deepEqual(
    {
      location: polenitsaListing.facts.location,
      location_native: polenitsaListing.facts.location_native,
      municipality_code: polenitsaListing.facts.municipality_code,
      settlement_ekatte: polenitsaListing.facts.settlement_ekatte,
      status: polenitsaListing.facts.location_review_status,
    },
    { location: "Polenitsa", location_native: "Поленица", municipality_code: "BLG40", settlement_ekatte: "57176", status: "confirmed_settlement" },
  );
  assert.deepEqual(
    { location: greekListing.facts.location, country_code: greekListing.facts.country_code, status: greekListing.facts.location_review_status },
    { location: "Logari", country_code: "GR", status: "confirmed_foreign_settlement" },
  );
  assert.ok(ruListing.routing.target_path.startsWith("/ru/"));
});

test("CMS collection manifest exposes implemented Payload-style contracts only", () => {
  const seed = buildCmsSeed(registry, { listings, migrationRecords, routeMap, mediaRows });
  const manifest = buildCmsCollections(seed);
  const summary = assertCmsCollections(manifest);
  const slugs = manifest.collections.map((collection) => collection.slug);

  assert.deepEqual(slugs, ["listings", "listing_translations", "media_assets", "listing_tours"]);
  assert.equal(summary.records.listings, 165);
  assert.equal(summary.records.listing_translations, 167);
  assert.equal(summary.records.media_assets, 4978);
  assert.equal(summary.records.listing_tours, 165);
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

  assert.equal(summary.collections, 4);
  assert.equal(listingsConfig.versions.drafts, true);
  assert.equal(listingsConfig.custom.publish_requires_human_review, true);
  assert.equal(facts.fields.some((field) => field.name === "price_eur" && field.type === "number"), true);
  assert.equal(facts.fields.some((field) => field.name === "settlement_ekatte" && field.type === "text"), true);
  assert.equal(mediaConfig.fields.find((field) => field.name === "url").type, "text");
  assert.equal(toursConfig.fields.find((field) => field.name === "fallback_gallery").fields[0].name, "url");
  assert.equal(toursConfig.fields.find((field) => field.name === "viewer_url").type, "text");
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
});

test("generated Payload collection config file is valid when present", () => {
  const file = fromRoot("production", "data", "payload-collections.json");
  if (!fs.existsSync(file)) return;
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const summary = assertPayloadCollections(payload);
  assert.equal(summary.collections, 4);
});
