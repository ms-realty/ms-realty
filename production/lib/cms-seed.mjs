import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv.mjs";
import { approvedTranslationRecordsForListing, listingSourceSnapshot } from "./content.mjs";
import { getLocale } from "./locales.mjs";
import { mediaWorkflow, normalizeMediaAsset } from "./media.mjs";
import { fromRoot } from "./paths.mjs";
import { isTranslationIndexable } from "./seo.mjs";
import { createTourField } from "./tours.mjs";

export const DEFAULT_MEDIA_INVENTORY_PATH = fromRoot("migration", "artifacts", "20260704-211155", "media-inventory.csv");
export const DEFAULT_CMS_SEED_OUTPUT = fromRoot("production", "data", "cms-seed.json");
export const DEFAULT_CMS_COLLECTIONS_OUTPUT = fromRoot("production", "data", "cms-collections.json");

export function loadMediaInventory(filePath = DEFAULT_MEDIA_INVENTORY_PATH) {
  return parseCsv(fs.readFileSync(filePath, "utf8"));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && value !== "" ? number : null;
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function mediaEntry(row, fallbackAlt = "") {
  return normalizeMediaAsset(row, {
    width: numberOrNull(row.width),
    height: numberOrNull(row.height),
    fallbackAlt,
  });
}

export function buildCmsSeed(registry, { listings, migrationRecords, routeMap, mediaRows }) {
  const migrationByUrl = new Map(migrationRecords.map((record) => [record.old_url, record]));
  const routeByUrl = new Map(routeMap.map((route) => [route.old_url, route]));
  const mediaByUrl = groupBy(mediaRows, (row) => row.page_url);

  const records = listings.map((listing) => {
    const migration = migrationByUrl.get(listing.url);
    const route = routeByUrl.get(listing.url);
    const translations = approvedTranslationRecordsForListing(registry, listing).map((translation) => {
      const locale = getLocale(registry, translation.locale);
      return {
        ...translation,
        direction: locale.direction,
        public_indexable: isTranslationIndexable(registry, translation),
      };
    });

    const fallbackAlt = listing.h1 || listing.title || listing.id;
    const media = (mediaByUrl.get(listing.url) || []).map((row) => mediaEntry(row, fallbackAlt));

    return {
      id: listing.id,
      collection: "listings",
      cms_status: "source_imported_review_required",
      source_locale: listing.locale,
      source_domain: listing.domain,
      source_url: listing.url,
      facts: listingSourceSnapshot(listing),
      seo: {
        title: listing.title || "",
        description: listing.description || "",
        canonical: listing.canonical || listing.url,
        schema_present: Boolean(listing.schema_present),
      },
      translations,
      media,
      media_workflow: mediaWorkflow(media),
      tour: createTourField({ listingId: listing.id, media }),
      migration: migration
        ? {
            record_id: migration.id,
            review_state: migration.review_state,
            metadata_gaps: migration.metadata_gaps,
          }
        : null,
      routing: route
        ? {
            target_path: route.target_path,
            target_locale: route.target_locale,
            planned_status: route.planned_status,
            deployable: route.deployable,
            review_required: route.review_required,
          }
        : null,
    };
  });

  const translationRows = records.flatMap((record) => record.translations);
  const mediaAssets = records.reduce((total, record) => total + record.media.length, 0);
  const mediaWithAlt = records.reduce((total, record) => total + record.media.filter((media) => media.alt).length, 0);
  const publicGalleryAssets = records.reduce((total, record) => total + record.media_workflow.public_gallery_assets, 0);
  const floorPlanCandidates = records.reduce((total, record) => total + record.media_workflow.floor_plan_candidates, 0);
  const videoCandidates = records.reduce((total, record) => total + record.media_workflow.video_candidates, 0);
  const mediaReviewGatedAssets = records.reduce((total, record) => total + record.media_workflow.review_gated_assets, 0);
  const tourFields = records.filter((record) => record.tour).length;
  const publicTours = records.filter((record) => record.tour?.is_public).length;

  return {
    artifact_id: "cms-seed-20260704",
    summary: {
      listings: records.length,
      bySourceLocale: countBy(records, (record) => record.source_locale),
      translationLocales: countBy(translationRows, (translation) => translation.locale),
      mediaAssets,
      mediaWithAlt,
      publicGalleryAssets,
      floorPlanCandidates,
      videoCandidates,
      mediaReviewGatedAssets,
      tourFields,
      publicTours,
      missingMigrationRecords: records.filter((record) => !record.migration).length,
      missingRouteRows: records.filter((record) => !record.routing).length,
      reviewRequiredRoutes: records.filter((record) => record.routing?.review_required).length,
      deployableRoutes: records.filter((record) => record.routing?.deployable).length,
    },
    records,
  };
}

export function assertCmsSeed(seed) {
  if (seed.summary.listings !== 165) throw new Error(`Expected 165 CMS listing records, got ${seed.summary.listings}`);
  if (seed.summary.bySourceLocale.bg !== 113) throw new Error("Expected 113 BG CMS source listings");
  if (seed.summary.bySourceLocale.ru !== 52) throw new Error("Expected 52 RU CMS source listings");
  if (seed.summary.translationLocales.el !== 1 || seed.summary.translationLocales.he !== 1) {
    throw new Error("Expected one approved Greek and Hebrew translation seed");
  }
  if (seed.summary.translationLocales.fr) throw new Error("French CMS translations must not be seeded before approval");
  if (seed.summary.mediaAssets !== 4978) throw new Error(`Expected 4978 listing media rows, got ${seed.summary.mediaAssets}`);
  if (seed.summary.publicGalleryAssets <= 0) throw new Error("CMS seed must expose reviewed imported photo gallery assets");
  if (seed.summary.mediaReviewGatedAssets <= 0) throw new Error("CMS seed must keep non-gallery media review-gated");
  if (seed.summary.videoCandidates !== 0) throw new Error("Crawl seed must not invent listing video assets");
  if (seed.summary.tourFields !== 165) throw new Error("Expected one draft 360 tour field per CMS listing");
  if (seed.summary.publicTours !== 0) throw new Error("Crawl seed must not publish unreviewed 360 tours");
  if (seed.summary.missingMigrationRecords !== 0) throw new Error("Every CMS listing needs a migration record");
  if (seed.summary.missingRouteRows !== 0) throw new Error("Every CMS listing needs a route row");
  if (seed.summary.deployableRoutes !== 0) throw new Error("CMS seed routes must stay review-gated");
  return seed.summary;
}

export function writeCmsSeed(seed, outPath = DEFAULT_CMS_SEED_OUTPUT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const summary = assertCmsSeed(seed);
  fs.writeFileSync(outPath, `${JSON.stringify(seed, null, 2)}\n`);
  return { outPath, summary };
}

export function buildCmsCollections(seed) {
  const listings = seed.records.filter((record) => record.collection === "listings");
  const translationRecords = listings.flatMap((record) => record.translations || []);
  const mediaRecords = listings.flatMap((record) => record.media || []);
  const tourRecords = listings.map((record) => record.tour).filter(Boolean);

  return {
    artifact_id: "cms-collections-20260704",
    source_artifact: seed.artifact_id,
    summary: {
      collections: 4,
      records: {
        listings: listings.length,
        listing_translations: translationRecords.length,
        media_assets: mediaRecords.length,
        listing_tours: tourRecords.length,
      },
      public_tours: tourRecords.filter((tour) => tour.is_public).length,
    },
    collections: [
      {
        slug: "listings",
        records: listings.length,
        source: "production/data/cms-seed.json records[collection=listings]",
        workflow: ["source_imported_review_required", "draft", "review", "published", "archived"],
        publish_requires_human_review: true,
        fields: ["id", "cms_status", "source_locale", "source_domain", "source_url", "facts", "seo", "routing", "migration"],
      },
      {
        slug: "listing_translations",
        records: translationRecords.length,
        source: "listings.translations",
        workflow: ["missing", "hermes_drafted", "human_edited", "approved", "published", "stale"],
        publish_requires_human_review: true,
        fields: ["locale", "source_locale", "status", "source_hash", "translated_hash", "reviewer", "approved_at"],
      },
      {
        slug: "media_assets",
        records: mediaRecords.length,
        source: "listings.media",
        workflow: ["approved_imported_photo", "reviewed_private", "review_required"],
        publish_requires_human_review: true,
        fields: ["url", "asset_url", "alt", "width", "height", "kind", "is_public", "review_status"],
      },
      {
        slug: "listing_tours",
        records: tourRecords.length,
        source: "listings.tour",
        workflow: ["needs_panorama_upload", "review_required", "approved", "published"],
        publish_requires_human_review: true,
        fields: ["provider", "listing_id", "panorama_url", "thumbnail_url", "hotspots", "is_public", "accessibility_caption"],
      },
    ],
  };
}

export function assertCmsCollections(manifest) {
  const slugs = manifest.collections.map((collection) => collection.slug);
  if (manifest.summary.collections !== 4) throw new Error("Expected 4 implemented CMS collection contracts");
  for (const slug of ["listings", "listing_translations", "media_assets", "listing_tours"]) {
    if (!slugs.includes(slug)) throw new Error(`Missing CMS collection contract: ${slug}`);
    if (!manifest.summary.records[slug]) throw new Error(`CMS collection contract has no records: ${slug}`);
  }
  if (manifest.summary.records.listings !== 165) throw new Error("Listings collection must cover all migrated listings");
  if (manifest.summary.records.media_assets !== 4978) throw new Error("Media collection must cover all listing media assets");
  if (manifest.summary.records.listing_tours !== 165) throw new Error("Tour collection must expose one review-gated tour per listing");
  if (manifest.summary.public_tours !== 0) throw new Error("CMS collection manifest must not publish unreviewed tours");
  if (manifest.collections.some((collection) => collection.publish_requires_human_review !== true)) {
    throw new Error("CMS collection publishing must stay human-review gated");
  }
  return manifest.summary;
}

export function writeCmsCollections(manifest, outPath = DEFAULT_CMS_COLLECTIONS_OUTPUT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const summary = assertCmsCollections(manifest);
  fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { outPath, summary };
}

export function loadCmsCollections(filePath = DEFAULT_CMS_COLLECTIONS_OUTPUT) {
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assertCmsCollections(manifest);
  return manifest;
}
