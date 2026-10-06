// O13 browser seed: a published three-photo listing and a broker session in the disposable
// browser database. Synthetic records only; never launch or acceptance evidence.
import { randomBytes } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { staffFixture } from "../cases/testing";
import { createListingFixture, publishForTest } from "../publication/testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const broker = await staffFixture(db);
  // Same lock and unique reference rewrite as the discovery and comparison fixtures.
  const fixture = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))`,
    );
    const item = await createListingFixture(tx, {
      reviewerId: broker.id,
      title: "Синтетичен апартамент за подредба",
      description: "Синтетичен тестов имот. Не е реална оферта.",
      photos: 3,
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
    await tx
      .update(schema.sellerInstructions)
      .set({ reference: `SI-2026-${number}` })
      .where(eq(schema.sellerInstructions.listingId, item.listingId));
    return { ...item, reference };
  });
  await publishForTest(db, broker.actor, fixture, ["bg"]);
  const relations = await db
    .select({ id: schema.mediaRelations.id })
    .from(schema.mediaRelations)
    .where(eq(schema.mediaRelations.listingId, fixture.listingId))
    .orderBy(asc(schema.mediaRelations.position));
  console.log(
    JSON.stringify({
      reference: fixture.reference,
      listingId: fixture.listingId,
      relations: relations.map(({ id }) => id),
      token: broker.token,
    }),
  );
} finally {
  await connection.end();
}
