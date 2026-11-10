// Synthetic fixture only in the generated, disposable browser database: a Deal with a requested
// viewing and a client who chose service email.
import { randomInt, randomUUID } from "node:crypto";
import { eq, sql as statement } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { viewingFixture } from "./testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} });
try {
  const db = drizzle(connection, { schema });
  const f = await db.transaction(async (tx) => {
    // Same lock and unique reference rewrite as the other listing fixtures: the fixture counter
    // restarts in every seed process, so its references must not stay in the shared database.
    await tx.execute(
      statement`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))`,
    );
    const f = await viewingFixture(tx, { locale: "en" });
    const number = randomInt(100_000_000, 999_999_999);
    await tx
      .update(schema.listings)
      .set({ reference: `MS-${number}` })
      .where(eq(schema.listings.id, f.listing.listingId));
    await tx
      .update(schema.properties)
      .set({ reference: `PR-NOTICE-${randomUUID()}` })
      .where(eq(schema.properties.id, f.listing.propertyId));
    await tx
      .update(schema.sellerInstructions)
      .set({ reference: `SI-NOTICE-${randomUUID()}` })
      .where(eq(schema.sellerInstructions.listingId, f.listing.listingId));
    return f;
  });
  console.log(
    JSON.stringify({
      caseId: f.record.id,
      appointmentId: f.request.id,
      staffToken: f.staff.token,
      staffEmail: f.staff.email,
      clientToken: f.client.token,
      clientEmail: f.email?.address,
    }),
  );
} finally {
  await connection.end();
}
