// Synthetic browser fixtures only. Uses the official approval and publication commands.
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql as statement } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { restrictPublication, withdrawPublication } from "@/server/publication/commands";
import { createListingFixture, insertPlace, publishForTest } from "@/server/publication/testing";
import { createStaff } from "@/server/testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Synthetic E2E seed needs a disposable browser database.");
const sql = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(sql, { schema });
try {
  const staff = await createStaff(db, {
    roles: ["content_editor", "publishing_approver"],
    email: `synthetic-${randomUUID()}@example.test`,
  });
  const command = process.argv[2];
  if (command === "withdraw") {
    const reference = process.argv[3] ?? "";
    const [listing] = await db
      .select()
      .from(schema.listings)
      .where(eq(schema.listings.reference, reference));
    if (!listing) throw new Error("No fixture listing");
    await withdrawPublication(db, {
      actor: staff.actor,
      operationId: randomUUID(),
      expectedRevision: listing.publicationGeneration,
      reference,
      reason: "Synthetic browser withdrawal check",
    });
    console.log(JSON.stringify({ reference }));
  } else {
    const suffix = randomUUID().slice(0, 8);
    const placeId = await insertPlace(db, {
      level: "settlement",
      parentId: null,
      nameNative: `Синтетично място ${suffix}`,
      nameLatin: `Synthetic place ${suffix}`,
    });
    if (command === "map")
      await db
        .update(schema.geographyPlaces)
        .set({ latitude: "41.55", longitude: "23.28" })
        .where(eq(schema.geographyPlaces.id, placeId));
    const make = async (label: string) => {
      const title = `Synthetic ${label} ${suffix}`;
      const f = await db.transaction(async (tx) => {
        // Official helpers use process-local counters. Namespace each temporary identity
        // before releasing this lock so concurrent browser projects cannot collide.
        await tx.execute(
          statement`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))`,
        );
        const fixture = await createListingFixture(tx, {
          reviewerId: staff.id,
          placeId,
          title,
          description: "Synthetic test property. Not a real offer.",
          translations: {
            en: { title, description: "Synthetic test property. Not a real offer." },
          },
        });
        const number = randomBytes(6).readUIntBE(0, 6).toString();
        const reference = `MS-${number}`;
        await tx
          .update(schema.listings)
          .set({ reference })
          .where(eq(schema.listings.id, fixture.listingId));
        await tx
          .update(schema.properties)
          .set({ reference: `PR-2026-${number}` })
          .where(eq(schema.properties.id, fixture.propertyId));
        await tx
          .update(schema.sellerInstructions)
          .set({ reference: `SI-2026-${number}` })
          .where(eq(schema.sellerInstructions.listingId, fixture.listingId));
        return { ...fixture, reference };
      });
      await publishForTest(db, staff.actor, f, ["bg", "en"]);
      return { reference: f.reference, title, id: f.listingId };
    };
    const published = await make("published"),
      restricted = await make("restricted"),
      withdrawn = await make("withdrawn");
    for (const [fixture, remove] of [
      [restricted, restrictPublication],
      [withdrawn, withdrawPublication],
    ] as const) {
      const [listing] = await db
        .select()
        .from(schema.listings)
        .where(eq(schema.listings.id, fixture.id));
      if (!listing) throw new Error("No fixture listing");
      await remove(db, {
        actor: staff.actor,
        operationId: randomUUID(),
        expectedRevision: listing.publicationGeneration,
        reference: fixture.reference,
        reason: "Synthetic exposure removal",
      });
    }
    console.log(JSON.stringify({ published, restricted, withdrawn }));
  }
} finally {
  await sql.end();
}
