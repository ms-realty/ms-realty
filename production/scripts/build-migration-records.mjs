import { loadCrawlArtifact, normalizeMigrationRecords, writeMigrationRecords } from "../lib/migration.mjs";

const records = normalizeMigrationRecords(loadCrawlArtifact());
const { outPath, summary } = writeMigrationRecords(records);

console.log(`Wrote ${summary.total} normalized migration records to ${outPath}`);
console.log(`Domains: ${JSON.stringify(summary.byDomain)}`);
console.log(`Review states: ${JSON.stringify(summary.byReviewState)}`);
