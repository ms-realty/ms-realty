// Disposable synthetic fixture for the ADR 0015 staff flow: a buyer's Deal with nothing on it
// yet, and a held sale listing that is not published and has no recorded seller. No provider,
// legal or operational proof.
import { randomInt, randomUUID } from "node:crypto";
import { eq, sql as statement } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { caseFixture } from "../cases/testing";
import { createListingFixture } from "../publication/testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required.");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const seeded = await db.transaction(async (tx) => {
    await tx.execute(
      statement`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))`,
    );
    const f = await caseFixture(tx);
    const listing = await createListingFixture(tx, {
      reviewerId: f.staff.id,
      sellerInstruction: false,
      title: "Двустаен апартамент до училището",
    });
    // Free the fixture counter's references for the other browser seeds. A lot number stays a
    // lot number (MS- and digits), because the broker picks the home by it.
    const suffix = randomUUID();
    const reference = `MS-${randomInt(100_000_000, 999_999_999)}`;
    await tx
      .update(schema.listings)
      .set({ reference })
      .where(eq(schema.listings.id, listing.listingId));
    await tx
      .update(schema.properties)
      .set({ reference: `PR-AGREE-${suffix}` })
      .where(eq(schema.properties.id, listing.propertyId));
    Object.assign(listing, { reference });
    // Intake follow-up is not part of this flow; completion checks open work.
    await tx
      .update(schema.tasks)
      .set({ state: "cancelled", cancelReason: "Synthetic intake follow-up no longer needed" })
      .where(eq(schema.tasks.caseId, f.record.id));
    return { f, listing };
  });
  console.log(
    JSON.stringify({
      caseId: seeded.f.record.id,
      staffToken: seeded.f.staff.token,
      clientToken: seeded.f.client.token,
      listingId: seeded.listing.listingId,
      reference: seeded.listing.reference,
    }),
  );
} finally {
  await connection.end();
}
