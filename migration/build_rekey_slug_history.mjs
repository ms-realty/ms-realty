// The lot-number rekey changes the public path of every surviving listing, and
// those paths are live and indexed. Without a redirect each one answers 404 the
// moment the rekey deploys, so this writes the slug-history rows that carry a
// crawl-era listing URL to the lot number it became.
//
// Only survivors need a row: a retired cross-domain twin keeps its crawl-era id,
// so its path did not move. Rows go through appendSlugChange, which refuses a
// path outside the listing's locale, a target that is not the current canonical
// path, and any redirect that is not a 301.
//
// Usage:
//   node migration/build_rekey_slug_history.mjs [--check]
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { buildListingIdMap, loadListingIdentityInputs } from "../production/lib/listing-identity.mjs";
import { loadLocaleRegistry } from "../production/lib/locales.mjs";
import { fromRoot } from "../production/lib/paths.mjs";
import { loadCmsSeed } from "../production/lib/runtime.mjs";
import { appendSlugChange, readSlugHistory } from "../production/lib/slug-history.mjs";

const ROUTE_MANIFEST = fromRoot("production", "data", "app-route-manifest.json");
const CHANGED_AT = "2026-09-04T00:00:00.000Z";
const EDITOR = "listing_identity_rekey";

export function plannedRekeyRedirects({
  registry = loadLocaleRegistry(),
  identity = buildListingIdMap(loadListingIdentityInputs()),
  manifest = JSON.parse(fs.readFileSync(ROUTE_MANIFEST, "utf8")),
} = {}) {
  // The route manifest is the list of listing pages the site actually serves,
  // so it decides which locales need a redirect rather than a guess at all seven.
  const routes = manifest.routes.filter((route) => route.type === "listing");
  const byNewId = new Map();
  for (const row of identity.values()) byNewId.set(row.id, row);

  const planned = [];
  for (const route of routes) {
    const listingId = route.params?.listingId;
    const row = byNewId.get(listingId);
    if (!row) throw new Error(`Route ${route.path} names a listing the identity map does not hold: ${listingId}`);
    // A retired twin's id never moved, so neither did its path.
    if (row.migration_id === row.id) continue;
    const locale = route.params?.locale || route.path.split("/")[1];
    const oldPath = route.path.replace(new RegExp(`${listingId}$`), row.migration_id);
    if (oldPath === route.path) throw new Error(`Route ${route.path} does not end in its listing id`);
    planned.push({ listingId, locale, oldPath, newPath: route.path });
  }
  return planned;
}

function run({ check }) {
  const registry = loadLocaleRegistry();
  const seed = loadCmsSeed();
  const planned = plannedRekeyRedirects({ registry });
  const existing = new Set(readSlugHistory().map((row) => row.old_path));

  const pending = planned.filter((entry) => !existing.has(entry.oldPath));
  if (check) {
    for (const entry of pending) console.log(`would redirect  ${entry.oldPath} -> ${entry.newPath}`);
    console.log(
      `\nDry run: ${pending.length} listing redirects to write, ${planned.length - pending.length} already recorded.` +
        `\nRe-run without --check to append them to the slug history.`,
    );
    return { planned, pending, written: 0 };
  }

  let written = 0;
  for (const entry of pending) {
    appendSlugChange(
      registry,
      seed,
      {
        id: `slug-rekey-${entry.listingId}-${entry.locale}`,
        listingId: entry.listingId,
        locale: entry.locale,
        oldPath: entry.oldPath,
        newPath: entry.newPath,
        reason: "listing_slug_changed",
        editor: EDITOR,
        changedAt: CHANGED_AT,
      },
      { changedAt: CHANGED_AT },
    );
    written += 1;
  }
  console.log(`Recorded ${written} listing redirects (${planned.length - written} already in the slug history)`);
  return { planned, pending, written };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run({ check: process.argv.includes("--check") });
}
