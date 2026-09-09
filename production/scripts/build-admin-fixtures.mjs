import fs from "node:fs";
import path from "node:path";
import { findListingById, loadListings } from "../lib/content.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { buildAdminWorkflowFixture } from "../lib/admin-workflows.mjs";
import { fromRoot } from "../lib/paths.mjs";

const registry = loadLocaleRegistry();
const listing = findListingById(loadListings(), "MS-00815");
const fixture = buildAdminWorkflowFixture(registry, listing);

const outPath = fromRoot("production", "data", "admin-fixtures.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
