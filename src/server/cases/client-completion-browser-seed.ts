// Synthetic client completion fixture, only in Playwright's generated disposable database.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { offsetInputValue } from "@/domain/time";
import { createSavedTransfer } from "../account-saves/service";
import { arrangeAppointment, requestAppointment } from "../appointments/service";
import { createListingFixture, publishForTest } from "../publication/testing";
import { newShareCreatorSession } from "../shares/public";
import { addInterest, respondToInterest } from "./commands";
import { caseFixture, reviewedCandidateFixture } from "./testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const f = await caseFixture(db),
    listing = await createListingFixture(db, {
      reviewerId: f.staff.id,
      fixtureReferences: {
        property: `PR-SYNTHETIC-${randomUUID()}`,
        listing: `MS-${Number.parseInt(randomUUID().replaceAll("-", "").slice(0, 12), 16)}`,
        sellerInstruction: `SI-SYNTHETIC-${randomUUID()}`,
      },
    });
  await publishForTest(db, f.staff.actor, listing);
  await db
    .update(schema.listings)
    .set({ freshnessState: "current_under_policy", reviewDueAt: new Date(Date.now() + 86400000) })
    .where(eq(schema.listings.id, listing.listingId));
  const interest = await addInterest(db, f.staff.session, {
    id: f.record.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    reference: listing.reference,
    explanation: "Synthetic approved viewing context",
    matchReview: await reviewedCandidateFixture(db, f, listing.reference),
  });
  await respondToInterest(db, f.client.session, {
    id: interest.outcome.interestId,
    operationId: randomUUID(),
    expectedVersion: 1,
    state: "shortlisted",
    reason: "Synthetic client feedback",
  });
  const request = await requestAppointment(db, f.client.session, {
    id: f.record.id,
    operationId: randomUUID(),
    expectedVersion: 2,
    interestId: interest.outcome.interestId,
    preferredWindow: "Synthetic future viewing",
  });
  const start = new Date(Date.now() + 3 * 86400000);
  start.setUTCHours(9, 0, 0, 0);
  await arrangeAppointment(db, f.staff.session, {
    id: request.outcome.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    action: "propose",
    startsAt: offsetInputValue(start.toISOString(), "Europe/Sofia"),
    endsAt: offsetInputValue(new Date(start.getTime() + 3600000).toISOString(), "Europe/Sofia"),
    bufferMinutes: 15,
    propertyAccessConfirmed: false,
    externalBusyChecked: false,
    accessNotes: "",
  });
  const creatorToken = newShareCreatorSession(),
    transfer = await createSavedTransfer(
      db,
      creatorToken,
      { locale: "bg", references: [listing.reference], operationId: randomUUID() },
      "127.0.0.75",
    );
  console.log(
    JSON.stringify({
      clientToken: f.client.token,
      clientId: f.client.id,
      caseId: f.record.id,
      appointmentId: request.outcome.id,
      listingReference: listing.reference,
      creatorToken,
      transfer,
    }),
  );
} finally {
  await connection.end();
}
