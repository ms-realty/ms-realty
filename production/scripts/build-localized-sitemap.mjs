import fs from "node:fs";
import path from "node:path";
import { applyListingEdits, readListingEdits } from "../lib/listing-edits.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { applyMediaReviews, readMediaReviews } from "../lib/media-reviews.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { publicSeedFor } from "../lib/public-inventory.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { buildRuntimeLocalizedSitemap } from "../lib/seo-files.mjs";
import { readTranslationLedger } from "../lib/translation-ledger.mjs";

const registry = loadLocaleRegistry();
const translationTasks = readTranslationLedger();
// Mirror the runtime seed derivation (listing edits + media reviews) so the
// public view below is exactly what the runtime publication gate serves.
const seed = applyMediaReviews(applyListingEdits(loadCmsSeed(), readListingEdits()), readMediaReviews());
const eligible = buildRuntimeLocalizedSitemap(registry, seed, translationTasks);
const publicSitemap = buildRuntimeLocalizedSitemap(registry, publicSeedFor(seed), translationTasks);

const entryKey = (entry) => `${entry.locale} ${entry.loc}`;
const eligibleKeys = new Set(eligible.entries.map(entryKey));
const publicKeys = new Set(publicSitemap.entries.map(entryKey));
for (const key of publicKeys) {
  if (!eligibleKeys.has(key)) throw new Error(`Public sitemap entry missing from eligible entries: ${key}`);
}

const sitemap = {
  artifact_id: "localized-sitemap-20260704",
  ...eligible,
  summary: { ...eligible.summary, public: publicSitemap.summary },
  entries: eligible.entries.map((entry) => ({ ...entry, public: publicKeys.has(entryKey(entry)) })),
};

const outPath = fromRoot("production", "data", "localized-sitemap.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(sitemap, null, 2)}\n`);
console.log(
  `Wrote ${sitemap.summary.entries} localized sitemap entries (${sitemap.summary.public.entries} public) to ${outPath}`,
);
