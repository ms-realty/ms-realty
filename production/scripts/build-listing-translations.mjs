import { loadListings } from "../lib/content.mjs";
import { loadListingTranslationsCatalog } from "../lib/listing-translations-catalog.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";

const requirePublished = process.argv.includes("--require-published");
const listings = loadListings(process.env.MS_REALTY_LISTINGS_PATH || undefined);
const catalog = loadListingTranslationsCatalog({
  directory: process.env.MS_REALTY_LISTING_TRANSLATIONS_DIR || undefined,
  listings,
  registry: loadLocaleRegistry(),
  requireComplete: true,
  requirePublished,
});

console.log(
  `Validated ${catalog.summary.translations} listing translations across ${catalog.batchFiles.length} batches ` +
    `(${catalog.summary.published} published, ${catalog.summary.human_review_pending} awaiting review)`,
);
