// One-time carry-over of the old website's photos into the system's storage (ADR 0016).
//
//   npm run media:carry-over -- [--listing MS-00905] [--limit 200] [--dry-run]
//                               [--concurrency 4] [--report <file.json>]
//
// DATABASE_URL names the database; FILE_STORAGE (+ FILE_STORAGE_ROOT or R2_*) the storage the
// photos are written to; LEGACY_MEDIA_SOURCE (+ LEGACY_MEDIA_DIR or LEGACY_MEDIA_*) where the
// originals are read from (src/server/media/legacy-source.ts). Re-running skips finished photos.
// Exit code 0 when every photo in scope is finished or left out for a recorded reason, 2 when
// some could not be reached (run again) or a --limit left work for later.
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import sharp from "sharp";
import * as schema from "../src/db/schema";
import { databaseTransport } from "../src/db/transport";
import { getEnv } from "../src/server/config/env";
import { fileServices } from "../src/server/files/config";
import { carryOverLegacyPhotos } from "../src/server/media/carry-over";
import { legacyMediaSource } from "../src/server/media/legacy-source";

const { values } = parseArgs({
  options: {
    listing: { type: "string" },
    limit: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    concurrency: { type: "string" },
    report: { type: "string" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const positive = (value: string | undefined, name: string) => {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) fail(`--${name} must be a positive whole number.`);
  return n;
};
const limit = positive(values.limit, "limit");
const concurrency = positive(values.concurrency, "concurrency") ?? 4;
const env = getEnv();
if (!env.databaseUrl) fail("DATABASE_URL is required.");
const source = legacyMediaSource();
if (!source) fail("Set LEGACY_MEDIA_SOURCE=directory (with LEGACY_MEDIA_DIR) or =r2.");
const services = fileServices();

// Bounded memory: no decoded-image cache, and libvips threads shared by the photos in flight.
sharp.cache(false);
sharp.concurrency(Math.max(1, Math.min(4, concurrency)));

const client = postgres(env.databaseUrl, {
  ...databaseTransport(env.databaseUrl).postgresOptions,
  max: concurrency + 2,
  onnotice: () => {},
});
const db = drizzle(client, { schema });
let done = 0;
try {
  const report = await carryOverLegacyPhotos(db, services, source, {
    reference: values.listing,
    limit,
    dryRun: values["dry-run"],
    concurrency,
    onPhoto: (photo) => {
      done += 1;
      if (photo.outcome !== "admitted" && photo.outcome !== "sealed_awaiting_scan")
        console.log(`  ${photo.outcome}: ${photo.key} (${photo.listings.join(", ")})`);
      if (done % 100 === 0) console.log(`  … ${done} photos`);
    },
  });
  console.log(
    `${report.dryRun ? "Dry run" : "Carry-over"} from ${report.source} under "${report.policy}": ` +
      `${report.legacyPhotos} legacy photos in scope, ${report.candidates} needed work` +
      (report.remaining ? `, ${report.remaining} left for a later run` : "") +
      ".",
  );
  for (const [outcome, n] of Object.entries(report.outcomes))
    if (n) console.log(`  ${outcome}: ${n}`);
  console.log(
    `  read ${report.bytesRead} bytes, wrote ${report.bytesWritten} bytes in ${report.wallMs} ms`,
  );
  console.log(
    `Listings with at least one usable photo: ${report.listingsWithPhotos}; without: ${report.listingsWithoutPhotos.length}`,
  );
  if (report.listingsWithoutPhotos.length)
    console.log(`  ${report.listingsWithoutPhotos.join(", ")}`);
  if (values.report) await writeFile(values.report, `${JSON.stringify(report, null, 2)}\n`);
  if (report.outcomes.unavailable || report.remaining) process.exitCode = 2;
} finally {
  await client.end();
}
