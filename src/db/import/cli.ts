// One-time legacy import (spec F32). DATABASE_URL names the target database.
//
//   npm run import:legacy -- --dry-run --out <dir>
//   npm run import:legacy -- --apply [--rows <sourceKey,...>] [--batch IM-YYYY-NNNNNN] [--out <dir>]
//
// --dry-run stages and classifies into the import tables only and writes the report.
// --apply stages a new apply batch (or resumes --batch) and applies its `create` rows, or
// exactly the rows named by --rows.
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { applyBatch, stageBatch } from "./pipeline";
import { writeReport } from "./report";
import { loadLegacySources } from "./sources";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    apply: { type: "boolean", default: false },
    out: { type: "string" },
    rows: { type: "string" },
    batch: { type: "string" },
    source: { type: "string" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (values["dry-run"] === values.apply) fail("Pass exactly one of --dry-run or --apply.");
if (values["dry-run"] && !values.out) fail("--dry-run needs --out <dir> for the report.");
if (values["dry-run"] && (values.rows || values.batch)) fail("--rows/--batch apply only.");
const url = process.env.DATABASE_URL;
if (!url) fail("DATABASE_URL is required.");

const client = postgres(url, { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema });
try {
  const sources = await loadLegacySources(values.source);
  const reference =
    values.batch ??
    (await stageBatch(db, sources, { mode: values.apply ? "apply" : "dry_run" })).reference;
  console.log(`Batch ${reference}${values.batch ? " (resumed)" : " staged"}.`);
  if (values.apply) {
    const rows = values.rows
      ?.split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    const result = await applyBatch(db, sources, reference, rows ? { rows } : {});
    console.log(`Apply ${result.state}:`, result.outcomes);
    for (const f of result.failed.slice(0, 20))
      console.log(`  failed ${f.sourceKey}: ${f.errorCode}`);
    if (result.state !== "completed") process.exitCode = 2;
  }
  if (values.out) {
    const written = await writeReport(db, reference, values.out);
    console.log("Classification:", JSON.stringify(written.report.classification));
    console.log(`Report: ${written.markdown}\n        ${written.json}`);
  }
} finally {
  await client.end();
}
