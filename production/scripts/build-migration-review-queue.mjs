import fs from "node:fs";
import { buildMigrationReviewQueue, writeMigrationReviewQueue } from "../lib/migration-review.mjs";
import { fromRoot } from "../lib/paths.mjs";

const records = JSON.parse(fs.readFileSync(fromRoot("production", "data", "migration-records.json"), "utf8")).records;
const routes = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
const { outPath, summary } = writeMigrationReviewQueue(buildMigrationReviewQueue(records, routes));

console.log(`Wrote ${summary.total} migration review rows to ${outPath}`);
console.log(`Owners: ${JSON.stringify(summary.byOwner)}`);
