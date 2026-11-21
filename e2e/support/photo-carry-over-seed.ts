// ADR 0016 browser seed: one listing as the legacy import leaves it (facts never reviewed, no
// seller documents) whose three photos exist only as old-website keys, their synthetic originals
// in the run's stand-in legacy media directory, and a broker who may publish. Synthetic records
// and generated images in the disposable browser database and directories only.
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import sharp from "sharp";
import * as schema from "@/db/schema";
import { staffFixture } from "@/server/cases/testing";
import { createListingFixture } from "@/server/publication/testing";

const url = process.env.E2E_DATABASE_URL;
const legacyDir = process.env.E2E_LEGACY_MEDIA_DIR;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname) || !legacyDir)
  throw new Error("The carry-over seed requires the generated disposable database and directory.");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
const unreviewed = { reviewed: false, sourceClass: "legacy_import" as const };
try {
  const broker = await staffFixture(db);
  const title = `Синтетичен апартамент със снимки от стария сайт ${randomBytes(3).toString("hex")}`;
  const listing = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))`,
    );
    const item = await createListingFixture(tx, {
      reviewerId: broker.id,
      title,
      description:
        "Синтетичен тестов имот в Сандански, близо до парка и минералните извори. Не е реална оферта. Обявата е създадена само за автоматичен тест на снимките от стария сайт.",
      editorialState: "needs_facts",
      commercialState: "confirmation_required",
      availabilityConfirmedAt: null,
      sellerInstruction: false,
      photos: 3,
      photoState: "legacy",
      facts: {
        bedrooms: { state: "known", value: 2, ...unreviewed },
        "area.living": {
          state: "known",
          value: { value: 68, unit: "m2", basis: "living" },
          unit: "m2",
          ...unreviewed,
        },
        location: { state: "known", value: { country: "BG" }, ...unreviewed },
      },
    });
    const number = randomBytes(6).readUIntBE(0, 6).toString();
    const reference = `MS-${number}`;
    await tx
      .update(schema.listings)
      .set({ reference })
      .where(eq(schema.listings.id, item.listingId));
    await tx
      .update(schema.properties)
      .set({ reference: `PR-2026-${number}` })
      .where(eq(schema.properties.id, item.propertyId));
    return { reference, listingId: item.listingId };
  });
  const photos = await db
    .select({ id: schema.mediaAssets.id, key: schema.mediaAssets.originalKey })
    .from(schema.mediaRelations)
    .innerJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.mediaRelations.mediaAssetId))
    .where(eq(schema.mediaRelations.listingId, listing.listingId))
    .orderBy(asc(schema.mediaRelations.position));
  const colours = ["#5b7f95", "#8d6e63", "#7c8f5b"];
  for (const [index, photo] of photos.entries()) {
    const path = join(legacyDir, photo.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      await sharp({
        create: { width: 1800, height: 1200, channels: 3, background: colours[index] ?? "#999" },
      })
        .jpeg({ quality: 80 })
        .toBuffer(),
    );
  }
  console.log(
    JSON.stringify({ token: broker.token, ...listing, title, photos: photos.map((p) => p.id) }),
  );
} finally {
  await connection.end();
}
