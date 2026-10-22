// Synthetic S4 browser fixtures. Never accepts a persistent or production database.
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql as statement } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { createSession } from "../auth/sessions";
import { createListingFixture, publishForTest } from "../publication/testing";
import { createClient } from "../testing";
import { staffFixture } from "./testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("S4 browser seed requires the generated disposable database.");
const connection = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(connection, { schema });
try {
  const staff = await staffFixture(db);
  const brokerName = `Case broker ${randomUUID().slice(0, 8)}`;
  await db
    .update(schema.principals)
    .set({ displayName: brokerName })
    .where(eq(schema.principals.id, staff.id));
  const client = await createClient(db, { email: `${randomUUID()}@example.test` });
  const issued = await createSession(db, { kind: "client", id: client.id });
  const [inquiry] = await db
    .insert(schema.inquiries)
    .values({
      reference: `RQ-S4-${randomUUID()}`,
      source: "website",
      state: "assigned",
      purpose: "question",
      submissionKey: randomUUID(),
      payloadDigest: "synthetic-s4-fixture",
      ownerId: staff.id,
      partyId: client.partyId,
      preferredLocale: "en",
      message: "Synthetic qualification request: a home with step-free access.",
    })
    .returning();
  if (!inquiry) throw new Error("Missing synthetic inquiry");
  await db.insert(schema.tasks).values({
    inquiryId: inquiry.id,
    ownerId: staff.id,
    title: "Existing intake follow-up",
    dueAt: new Date(Date.now() + 86400000),
  });
  const listing = await db.transaction(async (tx) => {
    await tx.execute(
      statement`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))`,
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
    await tx
      .update(schema.documents)
      .set({ reference: statement`${`DC-2026-${number}-`} || ${schema.documents.id}::text` })
      .where(eq(schema.documents.propertyId, fixture.propertyId));
    return { ...fixture, reference };
  });
  await publishForTest(db, staff.actor, listing);
  await db
    .update(schema.listings)
    .set({
      freshnessState: "current_under_policy",
      reviewDueAt: new Date(Date.now() + 86400000),
    })
    .where(eq(schema.listings.id, listing.listingId));
  await db.insert(schema.servicePolicies).values({
    effectiveFrom: new Date(Date.now() - 1000),
    timezone: "Europe/Sofia",
    serviceHours: Object.fromEntries(
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, ["09:00", "18:00"]]),
    ),
    coverage: {},
    responsePolicy: {},
    approvedById: staff.id,
  });
  console.log(
    JSON.stringify({
      inquiryId: inquiry.id,
      staffId: staff.id,
      staffToken: staff.token,
      brokerName,
      clientToken: issued.token,
      clientPartyId: client.partyId,
      listingReference: listing.reference,
    }),
  );
} finally {
  await connection.end();
}
