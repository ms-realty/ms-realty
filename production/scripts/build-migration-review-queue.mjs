import fs from "node:fs";
import { contentEvidenceDirectoryFromEnv, loadMigrationContentEvidence } from "../lib/migration-content-evidence.mjs";
import { buildMigrationReviewQueue, writeMigrationReviewQueue } from "../lib/migration-review.mjs";
import { fromRoot } from "../lib/paths.mjs";

const records = JSON.parse(fs.readFileSync(fromRoot("production", "data", "migration-records.json"), "utf8")).records;
const routes = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
const contentEvidence = loadMigrationContentEvidence(records, { evidenceDir: contentEvidenceDirectoryFromEnv() });
const { outPath, summary } = writeMigrationReviewQueue(buildMigrationReviewQueue(records, routes, contentEvidence));

console.log(`Wrote ${summary.total} migration review rows to ${outPath}`);
console.log(`Assignments: ${JSON.stringify(summary.byOwner)}`);
console.log(`Roles: ${JSON.stringify(summary.byRole)}`);
console.log(`Content evidence: ${JSON.stringify(contentEvidence.summary)}`);
