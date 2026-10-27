// Synthetic isolated F13/O03/O18/O33 fixture; never uses a persistent service database.
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { staffFixture } from "@/server/cases/testing";
import { createListingFixture, publishForTest } from "@/server/publication/testing";
import { createClient } from "@/server/testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Staff completion seed requires the generated disposable database");
const connection = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(connection, { schema });
try {
  const staff = await staffFixture(db);
  const marker = randomBytes(5).toString("hex");
  const email = `staff-completion-${marker}@example.test`;
  const client = await createClient(db, { email });
  const [contact] = await db
    .select()
    .from(schema.contactMethods)
    .where(eq(schema.contactMethods.partyId, client.partyId));
  if (!contact) throw new Error("Missing synthetic contact");
  const [inquiry] = await db
    .insert(schema.inquiries)
    .values({
      reference: `RQ-SYNTHETIC-${marker}`,
      source: "website",
      state: "assigned",
      purpose: "question",
      submissionKey: randomUUID(),
      payloadDigest: "synthetic-staff-completion",
      ownerId: staff.id,
      partyId: client.partyId,
      contactMethodId: contact.id,
      preferredName: `Synthetic contact ${marker}`,
      preferredLocale: "en",
      message: `Synthetic source request ${marker}`,
    })
    .returning();
  if (!inquiry) throw new Error("Missing synthetic inquiry");
  const [task] = await db
    .insert(schema.tasks)
    .values({
      inquiryId: inquiry.id,
      ownerId: staff.id,
      title: `Synthetic outcome ${marker}`,
      dueAt: new Date(Date.now() + 3600000),
    })
    .returning();
  if (!task) throw new Error("Missing synthetic task");
  const listing = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures',0))`,
    );
    const fixture = await createListingFixture(tx, { reviewerId: staff.id });
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
    const renamed = { ...fixture, reference };
    await publishForTest(tx, staff.actor, renamed, ["bg"]);
    return renamed;
  });
  console.log(
    JSON.stringify({
      session: staff.token,
      marker,
      email,
      inquiryId: inquiry.id,
      inquiryReference: inquiry.reference,
      partyId: client.partyId,
      taskId: task.id,
      taskTitle: task.title,
      reference: listing.reference,
      listingId: listing.listingId,
    }),
  );
} finally {
  await connection.end();
}
