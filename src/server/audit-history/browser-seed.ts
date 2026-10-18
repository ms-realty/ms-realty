// Synthetic authenticated browser fixture in a task-owned disposable database only.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { recordAudit } from "../audit";
import { staffFixture } from "../cases/testing";
import { restrictPublication } from "../publication/commands";
import { createListingFixture, listingVersion, publishForTest } from "../publication/testing";
import { historyListingFixture } from "./testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/u.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(connection, { schema });
try {
  const reader = await staffFixture(db),
    denied = await staffFixture(db);
  const f = await historyListingFixture(db),
    hidden = await historyListingFixture(db);
  const published = await createListingFixture(db, { reviewerId: reader.id });
  await db.insert(schema.grants).values([
    ...[f.listing.id, published.listingId].map((recordId) => ({
      principalId: reader.id,
      capability: "audit.read" as const,
      recordType: "listing",
      recordId,
      reason: "Synthetic listing history browser authority",
    })),
    {
      principalId: reader.id,
      capability: "privacy.manage",
      reason: "Synthetic existing privacy queue adjacency",
    },
  ]);
  await db
    .update(schema.principals)
    .set({ displayName: "Synthetic current history editor" })
    .where(eq(schema.principals.id, reader.id));
  const eventId = await recordAudit(db, {
    actor: reader.actor,
    action: "listing.draft.saved",
    recordType: "listing",
    recordId: f.listing.id,
    payload: {
      newVersion: 3,
      reason: "Synthetic recorded source correction",
      token: "PRIVATE_HISTORY_TOKEN",
      contact: "PRIVATE_HISTORY_CONTACT",
    },
  });
  const hiddenEventId = await recordAudit(db, {
    actor: reader.actor,
    action: "listing.draft.saved",
    recordType: "listing",
    recordId: hidden.listing.id,
    payload: { newVersion: 2, reason: "PRIVATE_OTHER_LISTING" },
  });
  const missingIdentityEventId = await recordAudit(db, {
    actor: { kind: "staff", id: randomUUID() },
    action: "listing.draft.saved",
    recordType: "listing",
    recordId: f.listing.id,
    payload: { newVersion: 4 },
  });
  // Publication evidence comes from real guarded commands, never a success-looking audit fixture.
  const [manifestId] = await publishForTest(db, reader.actor, published);
  const [publishedEvent] = await db
    .select()
    .from(schema.auditEvents)
    .where(
      and(
        eq(schema.auditEvents.recordId, published.listingId),
        eq(schema.auditEvents.action, "publication.activate"),
      ),
    );
  if (!manifestId || !publishedEvent?.operationId)
    throw new Error("Missing real publication evidence");
  await restrictPublication(db, {
    actor: reader.actor,
    reference: published.reference,
    reason: "Synthetic later correction requires restriction",
    expectedRevision: (await listingVersion(db, published.listingId)).generation,
    operationId: randomUUID(),
  });
  const [restrictedEvent] = await db
    .select({ id: schema.auditEvents.id })
    .from(schema.auditEvents)
    .where(
      and(
        eq(schema.auditEvents.recordId, published.listingId),
        eq(schema.auditEvents.action, "publication.restrict"),
      ),
    );
  if (!restrictedEvent) throw new Error("Missing recorded publication restriction");
  console.log(
    JSON.stringify({
      token: reader.token,
      deniedToken: denied.token,
      readerId: reader.id,
      reference: f.listing.reference,
      hiddenReference: hidden.listing.reference,
      eventId,
      hiddenEventId,
      missingIdentityEventId,
      publishedEventId: publishedEvent.id,
      publishedOperationId: publishedEvent.operationId,
      publishedListingId: published.listingId,
      publicationReference: published.reference,
      manifestId,
      restrictedEventId: restrictedEvent.id,
    }),
  );
} finally {
  await connection.end();
}
