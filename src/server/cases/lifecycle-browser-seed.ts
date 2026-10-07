// Disposable synthetic case continuity fixture. No provider or operational proof.
import { randomUUID } from "node:crypto";
import { eq, sql as statement } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { createListingFixture, publishForTest } from "../publication/testing";
import { addInterest } from "./commands";
import { caseFixture, reviewedCandidateFixture, staffFixture } from "./testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required.");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const f = await caseFixture(db),
    receiver = await staffFixture(db),
    name = `Receiving broker ${randomUUID().slice(0, 8)}`;
  await db
    .update(schema.principals)
    .set({ displayName: name })
    .where(eq(schema.principals.id, receiver.id));
  await db.transaction(async (tx) => {
    await tx.execute(
      statement`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))`,
    );
    const listing = await createListingFixture(tx, { reviewerId: f.staff.id });
    await publishForTest(tx, f.staff.actor, listing);
    const matchReview = await reviewedCandidateFixture(tx, f, listing.reference);
    await addInterest(tx, f.staff.session, {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      reference: listing.reference,
      explanation: "Reviewed property suitable for requirements",
      matchReview,
    });
    await tx
      .update(schema.listings)
      .set({ reference: `MS-SYNTHETIC-${randomUUID()}` })
      .where(eq(schema.listings.id, listing.listingId));
    await tx
      .update(schema.properties)
      .set({ reference: `PR-SYNTHETIC-${randomUUID()}` })
      .where(eq(schema.properties.id, listing.propertyId));
    await tx
      .update(schema.sellerInstructions)
      .set({ reference: `SI-SYNTHETIC-${randomUUID()}` })
      .where(eq(schema.sellerInstructions.listingId, listing.listingId));
  });
  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.caseId, f.record.id));
  console.log(
    JSON.stringify({
      caseId: f.record.id,
      staffId: f.staff.id,
      staffToken: f.staff.token,
      clientToken: f.client.token,
      receiverToken: receiver.token,
      receiverId: receiver.id,
      receiverName: name,
      taskId: task?.id,
    }),
  );
} finally {
  await connection.end();
}
