import fs from "node:fs";
import { loadListings } from "../lib/content.mjs";
import { buildCmsCollections, buildCmsSeed, loadMediaInventory, writeCmsCollections, writeCmsSeed } from "../lib/cms-seed.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { buildPayloadCollections, writePayloadCollections } from "../lib/payload-collections.mjs";
import { fromRoot } from "../lib/paths.mjs";

const registry = loadLocaleRegistry();
const listings = loadListings();
const migrationRecords = JSON.parse(fs.readFileSync(fromRoot("production", "data", "migration-records.json"), "utf8")).records;
const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
const mediaRows = loadMediaInventory();

const seed = buildCmsSeed(registry, { listings, migrationRecords, routeMap, mediaRows });
const { outPath, summary } = writeCmsSeed(seed);
const collections = buildCmsCollections(seed);
const { outPath: collectionsPath, summary: collectionsSummary } = writeCmsCollections(collections);
const { outPath: payloadCollectionsPath, summary: payloadCollectionsSummary } = writePayloadCollections(
  buildPayloadCollections(collections),
);

console.log(`Wrote ${summary.listings} CMS listing records to ${outPath}`);
console.log(`Media rows: ${summary.mediaAssets}`);
console.log(`Wrote ${collectionsSummary.collections} CMS collection contracts to ${collectionsPath}`);
console.log(`Wrote ${payloadCollectionsSummary.collections} Payload collection configs to ${payloadCollectionsPath}`);
