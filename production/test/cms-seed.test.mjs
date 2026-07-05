import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadListings } from "../lib/content.mjs";
import { assertCmsSeed, buildCmsSeed, loadMediaInventory } from "../lib/cms-seed.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
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
  assert.ok(ruListing.routing.target_path.startsWith("/ru/"));
});

test("generated CMS seed file is valid when present", () => {
  const file = fromRoot("production", "data", "cms-seed.json");
  if (!fs.existsSync(file)) return;
  const seed = JSON.parse(fs.readFileSync(file, "utf8"));
  const summary = assertCmsSeed(seed);
  assert.equal(summary.bySourceLocale.ru, 52);
  assert.equal(seed.records.length, 165);
});
