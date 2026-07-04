import { loadListings } from "../lib/content.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import {
  buildLegacyRouteMap,
  loadCrawlArtifact,
  normalizeMigrationRecords,
  writeLegacyRouteMap,
} from "../lib/migration.mjs";

const registry = loadLocaleRegistry();
const records = normalizeMigrationRecords(loadCrawlArtifact());
const routes = buildLegacyRouteMap(registry, records, loadListings());
const { outPath, summary } = writeLegacyRouteMap(routes);

console.log(`Wrote ${summary.total} legacy route rows to ${outPath}`);
console.log(`Listing mappings: ${summary.mappedListings}`);
console.log(`Target locales: ${JSON.stringify(summary.byTargetLocale)}`);
