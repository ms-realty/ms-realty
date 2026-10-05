import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appointmentParticipants,
  appointmentResources,
  appointments,
  caseParticipants,
  interests,
  listings,
  servicePolicies,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { changeStaffAbsence } from "../auth/absence";
import { addInterest, respondToInterest } from "../cases/commands";
import { caseFixture, staffFixture } from "../cases/testing";
import { custodyFixture } from "../key-custody/testing";
import { createListingFixture, publishForTest } from "../publication/testing";
import {
  arrangeAppointment,
  exportAppointmentCalendar,
  listAppointments,
  readAppointment,
  requestAppointment,
  respondToAppointment,
} from "./service";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
const start = `${new Date().getUTCFullYear() + 1}-01-15T10:00+02:00`;
const end = `${new Date().getUTCFullYear() + 1}-01-15T11:00+02:00`;
async function fixture(
  broker?: Awaited<ReturnType<typeof staffFixture>>,
  listing?: Awaited<ReturnType<typeof createListingFixture>>,
) {
  const f = await caseFixture(t.db, broker);
  const property = listing ?? (await createListingFixture(t.db, { reviewerId: f.staff.id }));
  if (!listing) {
    await publishForTest(t.db, f.staff.actor, property);
    await t.db
      .update(listings)
      .set({ freshnessState: "current_under_policy", reviewDueAt: new Date(Date.now() + 86400000) })
      .where(eq(listings.id, property.listingId));
  }
  const interest = await addInterest(t.db, f.staff.session, {
    id: f.record.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    reference: property.reference,
    explanation: "Synthetic reviewed option, pending client feedback",
  });
  await respondToInterest(t.db, f.client.session, {
    id: interest.outcome.interestId,
    operationId: randomUUID(),
    expectedVersion: 1,
    state: "shortlisted",
    reason: "Would like to consider this option",
  });
  const request = await requestAppointment(t.db, f.client.session, {
    id: f.record.id,
    operationId: randomUUID(),
    expectedVersion: 2,
    interestId: interest.outcome.interestId,
    preferredWindow: "A weekday morning",
  });
  return { ...f, listing: property, request: request.outcome };
}
async function policy(staffId: string) {
  await t.db.insert(servicePolicies).values({
    effectiveFrom: new Date(Date.now() - 1000),
    timezone: "Europe/Sofia",
    serviceHours: Object.fromEntries(
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, ["09:00", "18:00"]]),
    ),
    coverage: {},
    responsePolicy: {},
    approvedById: staffId,
  });
}
function confirmation(id: string, expectedVersion = 1) {
  return {
    id,
    operationId: randomUUID(),
    expectedVersion,
    action: "confirm" as const,
    startsAt: start,
    endsAt: end,
    bufferMinutes: 30,
    propertyAccessConfirmed: true,
    externalBusyChecked: true,
    accessNotes: "Private key collection instructions",
  };
}

describe("appointment requests and exclusive commitments", () => {
  it("P14 exposes approved locale listing identity only after live Case and appointment participation", async () => {
    const f = await fixture();
    const detail = await readAppointment(t.db, f.client.session, f.request.id, "bg");
    expect(detail.listing).toMatchObject({
      reference: f.listing.reference,
      card: { reference: f.listing.reference, locale: "bg" },
    });
    expect(detail.listing?.href).toContain(`/bg/properties/${f.listing.reference}/`);
    const english = await readAppointment(t.db, f.client.session, f.request.id, "en");
    expect(english.listing).toEqual({ reference: f.listing.reference, card: null, href: null });

    const outsider = await caseFixture(t.db);
    await expect(
      readAppointment(t.db, outsider.client.session, f.request.id, "bg"),
    ).rejects.toMatchObject({ code: "not_found" });
    await t.db
      .delete(appointmentParticipants)
      .where(eq(appointmentParticipants.appointmentId, f.request.id));
    await expect(readAppointment(t.db, f.client.session, f.request.id, "bg")).rejects.toMatchObject(
      { code: "not_found" },
    );
  });

  it("P14 shows only the associated reference when withdrawn and never projects an Interest from another Case", async () => {
    const f = await fixture();
    await t.db
      .update(listings)
      .set({ commercialState: "withdrawn" })
      .where(eq(listings.id, f.listing.listingId));
    expect((await readAppointment(t.db, f.client.session, f.request.id, "bg")).listing).toEqual({
      reference: f.listing.reference,
      card: null,
      href: null,
    });

    const other = await fixture();
    const [otherInterest] = await t.db
      .select({ id: interests.id })
      .from(interests)
      .where(eq(interests.caseId, other.record.id));
    if (!otherInterest) throw new Error("Missing associated Interest fixture");
    await t.db
      .update(appointments)
      .set({ interestId: otherInterest.id })
      .where(eq(appointments.id, f.request.id));
    expect((await readAppointment(t.db, f.client.session, f.request.id, "bg")).listing).toBeNull();
  });

  it("refuses a confirmation whose host has a planned absence during its travel buffer", async () => {
    const f = await fixture(),
      manager = await custodyFixture(t.db);
    await changeStaffAbsence(t.db, manager.session, {
      operationId: randomUUID(),
      principalId: f.staff.id,
      expectedRevision: 1,
      action: "schedule",
      startsAt: new Date(new Date(end).getTime() + 900000).toISOString(),
      reviewAt: new Date(new Date(end).getTime() + 86400000).toISOString(),
      reason: "Cover appointments during the planned absence.",
      reviewed: true,
    });
    await expect(
      arrangeAppointment(t.db, f.staff.session, confirmation(f.request.id)),
    ).rejects.toMatchObject({ code: "transition_denied" });
    expect((await readAppointment(t.db, f.staff.session, f.request.id)).appointment.state).toBe(
      "requested",
    );
    expect(
      await t.db
        .select()
        .from(appointmentResources)
        .where(eq(appointmentResources.appointmentId, f.request.id)),
    ).toHaveLength(0);
  });
  it("keeps requests tentative; requires service policy, current availability and manual checks before confirmation", async () => {
    const f = await fixture();
    expect((await readAppointment(t.db, f.client.session, f.request.id)).appointment.state).toBe(
      "requested",
    );
    await expect(
      exportAppointmentCalendar(t.db, f.client.session, f.request.id),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      arrangeAppointment(t.db, f.staff.session, confirmation(f.request.id)),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await policy(f.staff.id);
    await expect(
      arrangeAppointment(t.db, f.staff.session, {
        ...confirmation(f.request.id),
        externalBusyChecked: false,
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await arrangeAppointment(t.db, f.staff.session, confirmation(f.request.id));
    const view = await readAppointment(t.db, f.client.session, f.request.id);
    expect(view.appointment.state).toBe("confirmed");
    expect(view.appointment.accessNotes).toBeNull();
    expect(
      await t.db
        .select()
        .from(appointmentResources)
        .where(eq(appointmentResources.appointmentId, f.request.id)),
    ).toHaveLength(2);
    expect(await exportAppointmentCalendar(t.db, f.client.session, f.request.id)).toContain(
      "SEQUENCE:1",
    );
  });

  it("two concurrent confirmations cannot double-book shared broker/property resources", async () => {
    const broker = await staffFixture(t.db);
    const a = await fixture(broker);
    const b = await fixture(broker, a.listing);
    const result = await Promise.allSettled([
      arrangeAppointment(t.db, broker.session, confirmation(a.request.id)),
      arrangeAppointment(t.db, broker.session, confirmation(b.request.id)),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(result.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "transition_denied", fieldErrors: { form: ["appointment_conflict"] } },
    });
  });

  it("rescheduling preserves old confirmed slot and resources until valid replacement; cancellation releases them", async () => {
    const f = await fixture();
    await arrangeAppointment(t.db, f.staff.session, confirmation(f.request.id));
    const before = await exportAppointmentCalendar(t.db, f.client.session, f.request.id);
    await respondToAppointment(t.db, f.client.session, {
      id: f.request.id,
      operationId: randomUUID(),
      expectedVersion: 2,
      state: "reschedule_requested",
      reason: "Please move to the afternoon",
    });
    expect(
      (
        await readAppointment(t.db, f.client.session, f.request.id)
      ).appointment.confirmedStartsAt?.toISOString(),
    ).toBe(new Date(start).toISOString());
    await arrangeAppointment(t.db, f.staff.session, {
      ...confirmation(f.request.id, 3),
      action: "propose",
      startsAt: start.replace("10:00", "14:00"),
      endsAt: end.replace("11:00", "15:00"),
    });
    expect(await exportAppointmentCalendar(t.db, f.client.session, f.request.id)).toContain(
      "SEQUENCE:1",
    );
    await arrangeAppointment(t.db, f.staff.session, {
      ...confirmation(f.request.id, 4),
      startsAt: start.replace("10:00", "14:00"),
      endsAt: end.replace("11:00", "15:00"),
    });
    const after = await exportAppointmentCalendar(t.db, f.client.session, f.request.id);
    expect(after.match(/UID:(.*)/)?.[1]).toBe(before.match(/UID:(.*)/)?.[1]);
    expect(after).toContain("SEQUENCE:2");
    await respondToAppointment(t.db, f.client.session, {
      id: f.request.id,
      operationId: randomUUID(),
      expectedVersion: 5,
      state: "cancelled",
      reason: "Plans changed",
    });
    expect(
      (
        await t.db
          .select()
          .from(appointmentResources)
          .where(eq(appointmentResources.appointmentId, f.request.id))
      ).every((r) => !r.active),
    ).toBe(true);
    expect(await exportAppointmentCalendar(t.db, f.client.session, f.request.id)).toContain(
      "METHOD:CANCEL",
    );
  });

  it("removed participants immediately lose appointment and ICS access, including replay", async () => {
    const f = await fixture();
    const input = {
      id: f.request.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      state: "cancelled" as const,
      reason: "Do not need a viewing",
    };
    await respondToAppointment(t.db, f.client.session, input);
    await t.db
      .update(caseParticipants)
      .set({ revokedAt: new Date() })
      .where(eq(caseParticipants.partyId, f.client.partyId));
    await expect(readAppointment(t.db, f.client.session, f.request.id, "bg")).rejects.toMatchObject(
      {
        code: "not_found",
      },
    );
    await expect(respondToAppointment(t.db, f.client.session, input)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await listAppointments(t.db, f.client.session)).toEqual([]);
  });
});
