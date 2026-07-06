import {
  buildListingPublicationReport,
  DEFAULT_LISTING_PUBLICATION_REPORT,
  writeListingPublicationReport,
} from "../lib/listing-publication.mjs";
import { applyListingEdits, readListingEdits } from "../lib/listing-edits.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

const outputPath = process.env.MS_REALTY_LISTING_PUBLICATION_REPORT_PATH || DEFAULT_LISTING_PUBLICATION_REPORT;
const registry = loadLocaleRegistry(process.env.MS_REALTY_LOCALE_REGISTRY_PATH || undefined);
const seed = applyListingEdits(loadCmsSeed(), readListingEdits(process.env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || undefined));

const report = buildListingPublicationReport({ registry, seed, generatedAt: "2026-07-05T00:00:00Z" });
writeListingPublicationReport(report, outputPath);
console.log(`Wrote listing publication report to ${outputPath}`);
