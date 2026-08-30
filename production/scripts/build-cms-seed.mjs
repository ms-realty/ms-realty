import fs from "node:fs";
import { loadListings } from "../lib/content.mjs";
import { buildCmsCollections, buildCmsSeed, loadMediaInventory, writeCmsCollections, writeCmsSeed } from "../lib/cms-seed.mjs";
import { loadListingTranslationsCatalog } from "../lib/listing-translations-catalog.mjs";
import { operatorPublishedListingApproval } from "../lib/listing-publication-approval.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { buildPayloadCollections, writePayloadCollections } from "../lib/payload-collections.mjs";
import { fromRoot } from "../lib/paths.mjs";

const registry = loadLocaleRegistry();
const listings = loadListings();
const migrationRecords = JSON.parse(fs.readFileSync(fromRoot("production", "data", "migration-records.json"), "utf8")).records;
const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
const mediaRows = loadMediaInventory();
// Without valid operator publication evidence this stays null and the seed is
// built entirely review-required, exactly as before the owner's directive.
const publicationApproval = operatorPublishedListingApproval();
const translationCatalog = loadListingTranslationsCatalog({ listings, registry, requireComplete: true });

const seed = buildCmsSeed(registry, {
  listings,
  migrationRecords,
  routeMap,
  mediaRows,
  publicationApproval,
  translationRecords: translationCatalog.translationRows,
});
const { outPath, summary } = writeCmsSeed(seed);
const collections = buildCmsCollections(seed);
const { outPath: collectionsPath, summary: collectionsSummary } = writeCmsCollections(collections);
const { outPath: payloadCollectionsPath, summary: payloadCollectionsSummary } = writePayloadCollections(
  buildPayloadCollections(collections),
);

console.log(`Wrote ${summary.listings} CMS listing records to ${outPath}`);
console.log(
  `Published listings: ${summary.publishedListings} (excluded by approval: ${summary.publicationExcludedListings})`,
);
console.log(`Media rows: ${summary.mediaAssets}`);
console.log(`Listing translations: ${translationCatalog.summary.translations}`);
console.log(`Wrote ${collectionsSummary.collections} CMS collection contracts to ${collectionsPath}`);
console.log(`Wrote ${payloadCollectionsSummary.collections} Payload collection configs to ${payloadCollectionsPath}`);
