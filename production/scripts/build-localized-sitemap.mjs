import fs from "node:fs";
import path from "node:path";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { buildRuntimeLocalizedSitemap } from "../lib/seo-files.mjs";
import { readTranslationLedger } from "../lib/translation-ledger.mjs";

const registry = loadLocaleRegistry();
const sitemap = buildRuntimeLocalizedSitemap(registry, loadCmsSeed(), readTranslationLedger());

const outPath = fromRoot("production", "data", "localized-sitemap.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      artifact_id: "localized-sitemap-20260704",
      ...sitemap,
    },
    null,
    2,
  )}\n`,
);
console.log(`Wrote ${sitemap.summary.entries} localized sitemap entries to ${outPath}`);
