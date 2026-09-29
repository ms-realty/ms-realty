// Synthetic data only, in the exact database owned by the surrounding Playwright run.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import sharp from "sharp";
import * as schema from "../src/db/schema";
import { publicLocales } from "../src/domain/ids";
import { staffFixture } from "../src/server/cases/testing";
import { eligiblePublications } from "../src/server/publication/presentation";
import {
  createListingFixture,
  createPlaces,
  eur,
  publishForTest,
} from "../src/server/publication/testing";
import { searchListings } from "../src/server/search/search";

const url = process.env.E2E_DATABASE_URL;
assert(
  url &&
    ["postgres:", "postgresql:"].includes(new URL(url).protocol) &&
    ["localhost", "127.0.0.1", "[::1]", "host.docker.internal"].includes(new URL(url).hostname) &&
    /^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname),
  "Owned browser database required",
);
assert(
  process.env.E2E_FILE_STORAGE_ROOT ===
    join(tmpdir(), `msr-e2e-files-${new URL(url).pathname.slice("/msr_e2e_".length)}`),
  "Owned file directory required",
);
const count = Number(process.env.LOAD_LISTINGS ?? 10_000);
assert(
  Number.isSafeInteger(count) && count >= 100 && count <= 100_000,
  "LOAD_LISTINGS must be 100..100000",
);
const client = postgres(url, { max: 8, onnotice: () => {} }),
  db = drizzle(client, { schema });
const titles = {
  bg: "Синтетичен апартамент",
  en: "Synthetic apartment",
  ru: "Синтетическая квартира",
  de: "Synthetische Wohnung",
  nl: "Synthetisch appartement",
  el: "Συνθετικό διαμέρισμα",
  he: "דירה סינתטית",
};
try {
  const publisher = await staffFixture(db),
    places = await createPlaces(db);
  // Large varied synthetic image, no external download or customer photograph. At least 100
  // catalogue rows (or every row in smoke mode) have it; every sampled media request uses it.
  const bytes = await sharp(randomBytes(1280 * 960 * 3), {
    raw: { width: 1280, height: 960, channels: 3 },
  })
    .webp({ quality: 72 })
    .toBuffer();
  const mediaStride = Math.max(1, Math.floor(count / 100));
  const samples: { reference: string; media: string; locale: string }[] = [];
  let next = 0,
    completed = 0;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (;;) {
        const i = next++;
        if (i >= count) return;
        const locale = publicLocales[i % publicLocales.length];
        assert(locale);
        const large = i % mediaStride === 0;
        const fixture = await createListingFixture(db, {
          reviewerId: publisher.id,
          placeId: places.settlementId,
          propertyType: i % 3 === 0 ? "house" : "apartment",
          price: { state: "known", value: eur(60_000 + i * 17) },
          title: `${titles.bg} ${i}`,
          description: "Синтетичен имот за локална проверка на натоварването. Не е реална оферта.",
          translations:
            locale === "bg"
              ? {}
              : {
                  [locale]: {
                    title: `${titles[locale]} ${i}`,
                    description: "Synthetic load fixture, not a real offer.",
                  },
                },
          ...(large ? { photoFixture: { bytes, width: 1280, height: 960 } } : {}),
        });
        await publishForTest(
          db,
          publisher.actor,
          fixture,
          locale === "bg" ? ["bg"] : ["bg", locale],
        );
        if (large) {
          const assetId = fixture.assetIds[0];
          assert(assetId);
          const [asset] = await db
            .select()
            .from(schema.mediaAssets)
            .where(eq(schema.mediaAssets.id, assetId));
          assert(asset?.derivativeSha256);
          samples.push({
            reference: fixture.reference,
            media: `/api/media/${asset.id}/${asset.derivativeSha256}`,
            locale,
          });
        }
        completed++;
        if (completed % 100 === 0)
          console.error(
            `Seeded ${completed}/${count} listings (${Math.round((performance.now() - started) / 1000)}s)`,
          );
      }
    }),
  );
  const staff = [];
  for (let i = 0; i < 10; i++) {
    const actor = await staffFixture(db);
    const [task] = await db
      .insert(schema.tasks)
      .values({
        ownerId: actor.id,
        title: `Synthetic load task ${i}`,
        dueAt: new Date(Date.now() + 86_400_000),
      })
      .returning({ id: schema.tasks.id });
    assert(task);
    staff.push({ token: actor.token, taskId: task.id });
  }
  await client`analyze`;
  const [inventory] = await client`select count(*)::int as listings from listings`;
  const [projection] =
    await client`select count(*)::int as documents from listing_search_documents`;
  assert.equal(inventory?.listings, count);
  const eligible = eligiblePublications(db, "bg");
  const eligibilityPlan = await db.execute(
    sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT count(*) FROM ${eligible}`,
  );
  const searchStart = performance.now();
  const search = await searchListings(db, { locale: "bg", purpose: "sale" });
  const searchMs = performance.now() - searchStart;
  assert.equal(search.count.value, count);
  console.log(
    JSON.stringify({
      listings: count,
      documents: projection?.documents,
      largeMediaBytes: bytes.length,
      samples,
      staff,
      seedMs: performance.now() - started,
      diagnostics: { eligibilityPlan, searchMs },
    }),
  );
} finally {
  await client.end();
}
