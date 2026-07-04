import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseCsv } from "../lib/csv.mjs";
import {
  assertLegacyRouteMap,
  assertMigrationLaunchGate,
  buildLegacyRouteMap,
  loadCrawlArtifact,
  normalizeMigrationRecords,
  summarizeMigrationRecords,
} from "../lib/migration.mjs";
import { assertMigrationReviewQueue, buildMigrationReviewQueue } from "../lib/migration-review.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { loadListings } from "../lib/content.mjs";

test("CSV parser handles quoted commas and escaped quotes", () => {
  const rows = parseCsv('a,b,c\n1,"two, too","say ""hi"""\n');
  assert.deepEqual(rows, [{ a: "1", b: "two, too", c: 'say "hi"' }]);
});

test("crawl artifact normalizes into reviewed migration records without row loss", () => {
  const artifact = loadCrawlArtifact();
  const records = normalizeMigrationRecords(artifact);
  const summary = assertMigrationLaunchGate(records);

  assert.equal(records.length, artifact.urlRows.length);
  assert.equal(summary.total, 457);
  assert.equal(summary.byDomain["makler-realty.com"], 278);
  assert.equal(summary.byDomain["makler-realty.ru"], 179);
  assert.equal(summary.byType.listing, 165);
  assert.equal(summary.byType.taxonomy, 146);
  assert.equal(summary.homepageRedirectTargets, 0);
  assert.equal(summary.redirectRowsMissing, 0);
});

test("migration records expose metadata gaps for launch review", () => {
  const records = normalizeMigrationRecords(loadCrawlArtifact());
  const summary = summarizeMigrationRecords(records);
  assert.ok(summary.byReviewState.metadata_review > 0);
  assert.ok(records.some((record) => record.metadata_gaps.missingDescription));
  assert.ok(records.every((record) => record.migration_action === "preserve_same_url"));
});

test("generated migration data file is valid when present", () => {
  const file = fromRoot("production", "data", "migration-records.json");
  if (!fs.existsSync(file)) return;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(data.summary.total, 457);
  assert.equal(data.records.length, 457);
});

test("legacy route map only creates reviewed listing mappings and no broad fallbacks", () => {
  const records = normalizeMigrationRecords(loadCrawlArtifact());
  const routeMap = buildLegacyRouteMap(loadLocaleRegistry(), records, loadListings());
  const summary = assertLegacyRouteMap(routeMap);

  assert.equal(summary.mappedListings, 165);
  assert.equal(summary.byTargetLocale.bg, 113);
  assert.equal(summary.byTargetLocale.ru, 52);
  assert.equal(summary.homepageTargets, 0);
  assert.equal(summary.deployable, 0);
  assert.ok(routeMap.every((row) => row.review_required));
  assert.ok(routeMap.some((row) => row.old_url.includes("makler-realty.ru") && row.target_path?.startsWith("/ru/")));
  assert.ok(routeMap.some((row) => row.url_type === "taxonomy" && row.target_path === null));
});

test("generated legacy route map file is valid when present", () => {
  const file = fromRoot("production", "data", "legacy-route-map.json");
  if (!fs.existsSync(file)) return;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(data.summary.total, 457);
  assert.equal(data.summary.mappedListings, 165);
  assert.equal(data.routes.length, 457);
});

test("migration review queue assigns owners without making rows deployable", () => {
  const records = normalizeMigrationRecords(loadCrawlArtifact());
  const routeMap = buildLegacyRouteMap(loadLocaleRegistry(), records, loadListings());
  const queue = buildMigrationReviewQueue(records, routeMap);
  const summary = assertMigrationReviewQueue(queue);

  assert.equal(summary.total, 457);
  assert.equal(summary.ruRows, 179);
  assert.equal(summary.nonListingUnmapped, 292);
  assert.equal(summary.listingRedirectReviews, 165);
  assert.equal(summary.byOwner.ru_preservation_editor, 179);
  assert.equal(summary.byOwner.broker_listing_reviewer, 113);
  assert.equal(summary.byOwner.seo_taxonomy_editor, 97);
  assert.equal(summary.byOwner.content_editor, 68);
  assert.ok(queue.rows.every((row) => row.deployable === false));
  assert.ok(queue.rows.some((row) => row.url_type === "taxonomy" && row.action_required === "map_or_rebuild_taxonomy_landing"));
});

test("generated migration review queue file is valid when present", () => {
  const file = fromRoot("production", "data", "migration-review-queue.json");
  if (!fs.existsSync(file)) return;
  const queue = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertMigrationReviewQueue(queue).total, 457);
  assert.equal(queue.rows.length, 457);
});

test("generated localized sitemap file is approved-translation gated when present", () => {
  const file = fromRoot("production", "data", "localized-sitemap.json");
  if (!fs.existsSync(file)) return;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(data.summary.listings, 165);
  assert.equal(data.summary.listing_entries, 167);
  assert.equal(data.summary.seller_pages, 7);
  assert.equal(data.summary.byLocale.bg, 114);
  assert.equal(data.summary.byLocale.ru, 53);
  assert.equal(data.summary.byLocale.el, 2);
  assert.equal(data.summary.byLocale.he, 2);
  assert.equal(data.summary.byLocale.fr, undefined);
  assert.equal(data.entries.some((entry) => entry.loc === "/he/sell" && entry.type === "seller"), true);
});
