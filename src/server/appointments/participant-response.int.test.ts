import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  appointmentParticipantResponses,
  appointmentResources,
  appointments,
  listings,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { offsetInputValue } from "@/domain/time";
import { addInterest, respondToInterest } from "../cases/commands";
import { caseFixture, reviewedCandidateFixture } from "../cases/testing";
import { createListingFixture, publishForTest } from "../publication/testing";
import { ownSlotResponse, respondToProposedSlot } from "./participant-response";
import { arrangeAppointment, requestAppointment } from "./service";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function fixture() {
  const f = await caseFixture(t.db),
    listing = await createListingFixture(t.db, { reviewerId: f.staff.id });
  await publishForTest(t.db, f.staff.actor, listing);
  await t.db
    .update(listings)
    .set({ freshnessState: "current_under_policy", reviewDueAt: new Date(Date.now() + 86400000) })
    .where(eq(listings.id, listing.listingId));
  const interest = await addInterest(t.db, f.staff.session, {
    id: f.record.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    reference: listing.reference,
    explanation: "Reviewed synthetic selection",
    matchReview: await reviewedCandidateFixture(t.db, f, listing.reference),
  });
  await respondToInterest(t.db, f.client.session, {
    id: interest.outcome.interestId,
    operationId: randomUUID(),
    expectedVersion: 1,
    state: "shortlisted",
    reason: "Consider this selection",
  });
  const request = await requestAppointment(t.db, f.client.session, {
    id: f.record.id,
    operationId: randomUUID(),
    expectedVersion: 2,
    interestId: interest.outcome.interestId,
    preferredWindow: "A future viewing",
  });
  const start = new Date(Date.now() + 3 * 86400000);
  start.setUTCHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 3600000);
  const arrange = {
    id: request.outcome.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    action: "propose" as const,
    startsAt: offsetInputValue(start.toISOString(), "Europe/Sofia"),
    endsAt: offsetInputValue(end.toISOString(), "Europe/Sofia"),
    bufferMinutes: 15,
    propertyAccessConfirmed: false,
    externalBusyChecked: false,
    accessNotes: "",
  };
  await arrangeAppointment(t.db, f.staff.session, arrange);
  return { ...f, listing, request: request.outcome, arrange };
}
it("C06 records only the entitled participant's exact answer once, leaving proposed booking and reservations unchanged", async () => {
  const f = await fixture(),
    input = {
      id: f.request.id,
      operationId: randomUUID(),
      expectedVersion: 2,
      decision: "accept" as const,
      note: "",
    };
  const first = await respondToProposedSlot(t.db, f.client.session, input),
    retry = await respondToProposedSlot(t.db, f.client.session, input);
  expect(retry).toMatchObject({ replayed: true, outcome: first.outcome });
  expect(
    await t.db
      .select()
      .from(appointmentParticipantResponses)
      .where(eq(appointmentParticipantResponses.appointmentId, f.request.id)),
  ).toHaveLength(1);
  expect(
    (await t.db.select().from(appointments).where(eq(appointments.id, f.request.id)))[0],
  ).toMatchObject({ state: "proposed", version: 3, confirmedStartsAt: null, proposedVersion: 2 });
  expect(
    await t.db
      .select()
      .from(appointmentResources)
      .where(eq(appointmentResources.appointmentId, f.request.id)),
  ).toHaveLength(0);
  expect(await ownSlotResponse(t.db, f.client.session, f.request.id)).toMatchObject({
    decision: "accept",
  });
  const other = await caseFixture(t.db);
  await expect(
    respondToProposedSlot(t.db, other.client.session, {
      ...input,
      operationId: randomUUID(),
      expectedVersion: 3,
    }),
  ).rejects.toMatchObject({ code: "not_found" });
  await arrangeAppointment(t.db, f.staff.session, {
    ...f.arrange,
    operationId: randomUUID(),
    expectedVersion: 3,
  });
  expect(await ownSlotResponse(t.db, f.client.session, f.request.id)).toBeNull();
  await expect(
    respondToProposedSlot(t.db, f.client.session, { ...input, operationId: randomUUID() }),
  ).rejects.toMatchObject({ code: "version_conflict" });
});
it.each(["decline", "alternative"] as const)(
  "C06 %s remains this participant's response and cannot change the global appointment",
  async (decision) => {
    const f = await fixture(),
      input = {
        id: f.request.id,
        operationId: randomUUID(),
        expectedVersion: 2,
        decision,
        note: "Please discuss a different arrangement",
      };
    await respondToProposedSlot(t.db, f.client.session, input);
    expect(
      (await t.db.select().from(appointments).where(eq(appointments.id, f.request.id)))[0]?.state,
    ).toBe("proposed");
    expect(await ownSlotResponse(t.db, f.client.session, f.request.id)).toMatchObject({ decision });
  },
);
it("C06 rejects a now-unavailable selection and current resource conflicts before recording acceptance", async () => {
  const f = await fixture();
  await t.db
    .update(listings)
    .set({ freshnessState: "review_due" })
    .where(eq(listings.id, f.listing.listingId));
  await expect(
    respondToProposedSlot(t.db, f.client.session, {
      id: f.request.id,
      operationId: randomUUID(),
      expectedVersion: 2,
      decision: "accept",
      note: "",
    }),
  ).rejects.toMatchObject({ code: "transition_denied" });
  await t.db
    .update(listings)
    .set({ freshnessState: "current_under_policy" })
    .where(eq(listings.id, f.listing.listingId));
  const other = await fixture();
  await t.db.insert(appointmentResources).values({
    appointmentId: other.request.id,
    kind: "broker",
    resourceId: f.staff.id,
    during: `[${f.arrange.startsAt},${f.arrange.endsAt})`,
  });
  await expect(
    respondToProposedSlot(t.db, f.client.session, {
      id: f.request.id,
      operationId: randomUUID(),
      expectedVersion: 2,
      decision: "accept",
      note: "",
    }),
  ).rejects.toMatchObject({ code: "transition_denied" });
  expect(
    await t.db
      .select()
      .from(appointmentParticipantResponses)
      .where(eq(appointmentParticipantResponses.appointmentId, f.request.id)),
  ).toHaveLength(0);
});
