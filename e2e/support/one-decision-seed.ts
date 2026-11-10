// ADR 0012 browser seed: three listings as the legacy import leaves active ones (facts never
// reviewed, availability unconfirmed, no seller documents, processed photos not yet cleared)
// and a broker who may publish. Synthetic records in the disposable browser database only.
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { staffFixture } from "@/server/cases/testing";
import { createListingFixture } from "@/server/publication/testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("The one-decision seed requires the generated disposable database.");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
const unreviewed = { reviewed: false, sourceClass: "legacy_import" as const };
try {
  const broker = await staffFixture(db);
  // Same lock and unique reference rewrite as the other listing fixtures.
  const listing = (name: string) =>
    db.transaction(async (tx) => {
      // A distinct title per run: other seeded listings may share the base name on the site.
      const title = `${name} ${randomBytes(3).toString("hex")}`;
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))`,
      );
      const item = await createListingFixture(tx, {
        reviewerId: broker.id,
        title,
        description:
          "Синтетичен тестов имот в Сандански, близо до парка и минералните извори. Не е реална оферта. Обявата е създадена само за автоматичен тест на публикуването.",
        editorialState: "needs_facts",
        commercialState: "confirmation_required",
        availabilityConfirmedAt: null,
        sellerInstruction: false,
        photos: 1,
        photoState: "pending",
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
      return { reference, listingId: item.listingId, title };
    });
  const single = await listing("Синтетичен апартамент за публикуване");
  const first = await listing("Синтетична къща за масово публикуване");
  const second = await listing("Синтетично студио за масово публикуване");
  console.log(JSON.stringify({ token: broker.token, single, bulk: [first, second] }));
} finally {
  await connection.end();
}
