// Disposable inventory/session fixture. Acknowledgement and binding occur through browser commands.
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql as statement } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { ownerFixture } from "./owner-preview-testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required.");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const fixture = await db.transaction(async (tx) => {
    await tx.execute(
      statement`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))`,
    );
    const f = await ownerFixture(tx);
    const reference = `MS-${randomBytes(6).readUIntBE(0, 6)}`;
    await tx
      .update(schema.listings)
      .set({ reference })
      .where(eq(schema.listings.id, f.listing.listingId));
    await tx
      .update(schema.properties)
      .set({ reference: `PR-SYNTHETIC-${randomUUID()}` })
      .where(eq(schema.properties.id, f.listing.propertyId));
    await tx
      .update(schema.sellerInstructions)
      .set({ reference: `SI-SYNTHETIC-${randomUUID()}` })
      .where(eq(schema.sellerInstructions.id, f.instruction.id));
    return {
      caseId: f.record.id,
      staffToken: f.staff.token,
      clientToken: f.client.token,
      listingId: f.listing.listingId,
      propertyId: f.listing.propertyId,
      instructionId: f.instruction.id,
      revisionId: f.listing.revisionId,
      assetId: f.listing.assetIds[0],
      reference,
    };
  });
  console.log(JSON.stringify(fixture));
} finally {
  await connection.end();
}
