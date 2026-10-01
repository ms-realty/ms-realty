// Deterministic source inventory only. This command never publishes, grants or deploys.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { extractLiveSource } from "../src/server/legacy/capture.ts";
import { projectListingFacts } from "../src/server/legacy/listing-facts.ts";
import {
  buildLegacyManifest,
  sha256,
  sourceIdentity,
  sourceLocale,
  verifiedPrimaryCapture,
} from "../src/server/legacy/manifest.ts";
import { exportStagingRoutes } from "../src/server/legacy/staging-routes.ts";

const tag = "legacy-app-final";
const tagCommit = execFileSync("git", ["rev-parse", `${tag}^{commit}`], {
  encoding: "utf8",
}).trim();
const sourcePath =
  "migration/content-evidence/20260729-legacy-content-review/content-inventory.jsonl";
const raw = execFileSync("git", ["show", `${tag}:${sourcePath}`], {
  encoding: "utf8",
  maxBuffer: 30_000_000,
});
const metadataRaw = execFileSync("git", ["show", `${tag}:production/data/migration-records.json`], {
  encoding: "utf8",
  maxBuffer: 15_000_000,
});
const metadata = new Map(
  JSON.parse(metadataRaw).records.map((row) => [sourceIdentity(row.old_url).id, row]),
);
const historicalCaptures = raw
  .trim()
  .split("\n")
  .map((line) => ({ ...JSON.parse(line), provenance: "archived" }));
const livePath = "data/legacy/migration/live-delta.json";
const liveDelta = existsSync(livePath) ? JSON.parse(readFileSync(livePath, "utf8")) : null;
const liveCaptures = (liveDelta?.captures ?? []).map((capture) => {
  if (!capture.response_artifact) return capture;
  if (
    !/^data\/legacy\/migration\/live-source-html\/[a-f0-9]{64}\.html\.gz$/u.test(
      capture.response_artifact,
    )
  )
    throw new Error("Live response artifact is outside the source archive");
  const bytes = gunzipSync(readFileSync(capture.response_artifact));
  if (sha256(bytes) !== capture.response_sha256) throw new Error("Live response hash mismatch");
  const extracted = extractLiveSource(
    new TextDecoder(capture.response_encoding ?? "utf8", { fatal: true }).decode(bytes),
    capture.final_url,
  );
  if (sha256(capture.extracted_body_text ?? "") !== capture.text_sha256)
    throw new Error("Recorded live main text hash mismatch");
  // Re-extraction from immutable source bytes uses the current explicit selector version.
  // Original capture hashes remain provenance; selector improvements are never an equivalence approval.
  return {
    ...capture,
    ...extracted,
    source_extractor: "legacy-main-v3",
    recorded_body_hash: capture.text_sha256,
  };
});
const captures = [...historicalCaptures, ...liveCaptures].sort((a, b) =>
  b.captured_at_utc.localeCompare(a.captured_at_utc),
);
const urls = JSON.parse(readFileSync("data/legacy/url-decisions.json", "utf8"));
const listings = JSON.parse(readFileSync("data/legacy/listings.json", "utf8")).listings;
const listingByUrl = new Map(
  listings.flatMap((listing) =>
    listing.legacy_urls.map((url) => [sourceIdentity(url.url).id, listing]),
  ),
);
const manifest = buildLegacyManifest(urls.decisions, captures);
const baselineIds = new Set(manifest.sources.map((source) => source.id));
const liveSources = liveCaptures
  .filter(verifiedPrimaryCapture)
  .filter((capture) => !baselineIds.has(sourceIdentity(capture.url).id));
manifest.liveDelta = {
  artifact: livePath,
  requestedSources: liveDelta?.requestedSources ?? 0,
  verifiedPrimarySources: liveCaptures.filter(verifiedPrimaryCapture).length,
  newMainContentSources: liveSources.length,
  discoveredOutsideFrozenUrls: liveDelta?.discoveredOutsideFrozenUrls ?? [],
  completeSiteDelta: false,
  sources: liveSources.map((capture) => {
    const identity = sourceIdentity(capture.url),
      locale = sourceLocale(capture.url, capture.locale);
    return {
      ...identity,
      sourceUrl: capture.url,
      sourceBodyHash: capture.text_sha256,
      sourceResponseHash: capture.response_sha256,
      sourceArtifact: capture.response_artifact,
      listingReference: capture.listing_reference,
      sourceLocale: locale,
      candidate: locale ? { path: `/${locale}/legacy/${identity.id}`, status: 200 } : null,
      equivalenceReview: "pending",
      blockers: ["target_equivalence_review_missing", "listing_status_and_photo_parity_unverified"],
    };
  }),
};
manifest.provenance = {
  tag,
  tagCommit,
  sourcePath,
  sourceSha256: sha256(raw),
  metadataPath: "production/data/migration-records.json",
  metadataSha256: sha256(metadataRaw),
};
const pages = captures
  .filter(verifiedPrimaryCapture)
  .map((capture) => {
    const identity = sourceIdentity(capture.url),
      meta = metadata.get(identity.id),
      listing = listingByUrl.get(identity.id),
      locale = sourceLocale(capture.url, capture.locale);
    return {
      id: identity.id,
      canonicalPath: `/${locale}/legacy/${identity.id}`,
      locale,
      title:
        capture.h1 ||
        capture.title ||
        meta?.h1 ||
        meta?.title ||
        listing?.source_description.h1 ||
        null,
      description: capture.description ?? meta?.source_seo?.meta_description ?? null,
      bodyText: capture.extracted_body_text,
      sourceUrl: capture.url,
      sourceHost: identity.host,
      sourcePath: identity.path,
      sourceType: capture.listing_reference ? "listing" : (meta?.url_type ?? "page"),
      sourceHash: capture.text_sha256,
      capturedAt: capture.captured_at_utc,
      contentScope: capture.content_scope,
      provenance:
        capture.provenance === "live"
          ? {
              kind: "live",
              artifact: capture.response_artifact,
              extractor: capture.source_extractor,
              recordedBodyHash: capture.recorded_body_hash,
            }
          : { kind: "archived", artifact: sourcePath, gitTag: tag, gitCommit: tagCommit },
      equivalenceReview: { status: "pending", reviewer: null, reviewedAt: null },
      contentLinks: capture.content_links ?? [],
      media:
        capture.provenance === "live"
          ? capture.images.map((image) => ({
              id: sha256(image.url).slice(0, 24),
              url: image.url,
              alt: image.alt,
              r2Key: null,
              storedImageLoadVerified: false,
            }))
          : listing
            ? listing.media
                .filter((image) => image.legacy_kind === "photo" && image.is_public)
                .map((image) => ({
                  id: `${listing.reference.id}:${image.order}`,
                  url: image.original_url,
                  alt: image.caption ?? "",
                  r2Key: image.r2_key,
                  storedImageLoadVerified: false,
                }))
            : [],
      listing: projectListingFacts(
        listing
          ? {
              reference: listing.reference.id,
              sourceLocale: listing.source_description.locale,
              sourceTitle: listing.source_description.h1,
              lifecycleAtFreeze: listing.lifecycle_at_freeze,
              sold: null,
              price: listing.price,
              areas: listing.areas,
              rooms: listing.rooms,
              bedrooms: listing.bedrooms,
              location: listing.location,
              sourceStatedFacts: listing.source_description.source_stated_facts,
              statusParityVerified: false,
            }
          : null,
        capture.provenance === "live"
          ? {
              reference: capture.listing_reference,
              locale,
              title: capture.h1 || capture.title,
              fields: capture.source_fields,
            }
          : null,
      ),
    };
  })
  .filter((page, index, all) => all.findIndex((other) => other.id === page.id) === index)
  .sort((a, b) => a.id.localeCompare(b.id));
const listingManifest = {
  schemaVersion: 1,
  authority: manifest.authority.directive,
  status: "blocked",
  frozenListings: listings.length,
  liveDeltaReconciled: false,
  archivedMeansSold: false,
  blockers: [
    "current_listing_delta_missing",
    "source_status_verification_missing",
    "all_photo_loads_and_counts_unverified",
  ],
  liveListingReferences: [
    ...new Set(liveSources.map((capture) => capture.listing_reference).filter(Boolean)),
  ],
  liveSourcePages: liveSources.map((capture) => ({
    sourceUrl: capture.url,
    reference: capture.listing_reference,
    bodyHash: capture.text_sha256,
    publicPhotos: capture.images,
    recordedR2Keys: false,
    sourceStatusVerified: false,
  })),
  listings: listings.map((listing) => ({
    reference: listing.reference.id,
    sourceLocale: listing.source_description.locale,
    sourceUrls: listing.legacy_urls.map((url) => url.url),
    sourceBodyHash: sha256(JSON.stringify(listing.source_description)),
    historicalLifecycle: listing.lifecycle_at_freeze.state,
    sourceReviewStatus: listing.lifecycle_at_freeze.source_review_status,
    sold: null,
    statusVerified: false,
    publicPhotos: listing.media
      .filter((image) => image.legacy_kind === "photo" && image.is_public)
      .map((image) => ({ url: image.original_url, r2Key: image.r2_key, loadVerified: false })),
  })),
};
const publicMedia = new Map();
const mediaBlockers = [];
for (const listing of listings)
  for (const image of listing.media) {
    if (image.legacy_kind !== "photo" || !image.is_public) continue;
    if (!image.r2_key) {
      mediaBlockers.push({
        reference: listing.reference.id,
        url: image.original_url,
        reason: "missing_recorded_r2_key",
      });
      continue;
    }
    const url = new URL(image.original_url),
      path = decodeURIComponent(url.pathname);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: reject controls in object identities.
    const invalidPath = /[\\\u0000-\u001f]/.test(path);
    if (
      image.r2_key !== `${url.hostname}${path}` ||
      !path.startsWith("/wp-content/uploads/") ||
      /%2f|%5c/i.test(url.pathname) ||
      invalidPath ||
      !/\.(jpe?g|png|webp|gif)$/i.test(path)
    ) {
      mediaBlockers.push({
        reference: listing.reference.id,
        url: image.original_url,
        reason: "ambiguous_or_unsupported_public_media_identity",
      });
      continue;
    }
    publicMedia.set(image.r2_key, { host: url.hostname, path, key: image.r2_key });
  }
const mediaJson = JSON.stringify(
  [...publicMedia.values()].sort((a, b) => a.key.localeCompare(b.key)),
);
const staging = exportStagingRoutes(
  manifest,
  pages,
  manifest.liveDelta.sources,
  manifest.liveDelta.discoveredOutsideFrozenUrls,
);
const outputs = {
  "data/legacy/migration/route-manifest.json": manifest,
  "data/legacy/migration/source-pages.json": {
    schemaVersion: 1,
    authority: manifest.authority,
    sourceEquivalenceReviewed: false,
    pages,
  },
  "data/legacy/migration/listing-import-manifest.json": listingManifest,
  "data/legacy/migration/staging-route-manifest.json": staging.manifest,
  "data/legacy/migration/required-inputs.json": {
    schemaVersion: 1,
    status: "blocked",
    baselineSourceRows: manifest.sourceRows,
    baselineUniqueSources: manifest.uniqueSources,
    currentDeltaComplete: false,
    unresolvedBaselineSources: manifest.sources
      .filter((source) => !source.source?.bodyVerified)
      .map((source) => ({
        id: source.id,
        sourceUrls: source.sourceRows.map((row) => row.sourceUrl),
        blockers: source.blockers,
      })),
    rawWordPressBackupSources: manifest.sources
      .filter((source) => source.host === "makler-realty.ru" && !source.source?.bodyVerified)
      .map((source) => ({
        id: source.id,
        sourceUrls: source.sourceRows.map((row) => row.sourceUrl),
        existingTextScope: source.source?.contentScope ?? null,
        existingBodyHash: source.source?.bodyHash ?? null,
        reason: "historical_raw_response_HTML_unavailable_and_current_domain_is_NIC_parking",
      })),
    discoveredLiveSources: (liveDelta?.discoveredOutsideFrozenUrls ?? []).map((source) => ({
      ...source,
      primaryBodyCaptured: liveSources.some(
        (capture) => sourceIdentity(capture.url).id === source.id,
      ),
    })),
    remainingRequiredEvidence: [
      "complete_current_source_crawl_and_listing_inventory",
      "current_listing_status_with_no_archived_equals_sold_inference",
      "new_source_photos_imported_with_recorded_R2_keys",
      "all_photo_loads_and_counts",
      "independent_source_target_similarity_review",
      "staging_snapshot_and_human_signoff",
    ],
  },
  "data/legacy/migration/public-media-provenance.json": {
    schemaVersion: 1,
    publicAsIsAuthority: manifest.authority.directive,
    loadParityVerified: false,
    blockers: mediaBlockers,
    objects: [...publicMedia.values()],
  },
};
mkdirSync("data/legacy/migration", { recursive: true });
for (const [path, value] of Object.entries(outputs))
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
writeFileSync("data/legacy/migration/public-media.json", mediaJson);
writeFileSync("data/legacy/migration/public-media.sha256", `${sha256(mediaJson)}\n`);
writeFileSync("data/legacy/migration/staging-legacy-routes.json", staging.json);
writeFileSync(
  "data/legacy/migration/staging-legacy-routes.sha256",
  `${staging.manifest.routeArtifactSha256}\n`,
);
console.log(
  JSON.stringify({
    status: manifest.status,
    sourceRows: manifest.sourceRows,
    uniqueSources: manifest.uniqueSources,
    pages: pages.length,
    missingCaptureSources: manifest.missingCaptureSources,
    unresolvedMainContentSources: manifest.unresolvedMainContentSources,
    reviewedEquivalentSources: 0,
    deployableRoutes: 0,
  }),
);
