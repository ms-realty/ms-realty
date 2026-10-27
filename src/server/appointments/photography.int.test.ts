import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appointmentResources,
  appointments,
  grants,
  interests,
  listings,
  mediaAssets,
  operations,
  passkeys,
  servicePolicies,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { createClient, createProperty, createStaff } from "../testing";
import { readCalendar } from "./calendar";
import {
  arrangeAppointment,
  exportAppointmentCalendar,
  listAppointments,
  readAppointment,
  requestPhotography,
  respondToAppointment,
} from "./service";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
const start = `${new Date().getUTCFullYear() + 1}-01-15T10:00+02:00`,
  end = `${new Date().getUTCFullYear() + 1}-01-15T11:00+02:00`;
async function fixture(propertyId?: string) {
  const staff = await createStaff(t.db);
  await t.db.insert(passkeys).values({
    principalId: staff.id,
    credentialId: randomUUID(),
    publicKey: Buffer.from([1]),
    deviceType: "singleDevice",
    backedUp: false,
  });
  const property = propertyId ?? (await createProperty(t.db));
  const [listing] = await t.db
    .insert(listings)
    .values({ reference: `MS-PHOTO-${randomUUID()}`, propertyId: property, purpose: "sale" })
    .returning();
  if (!listing) throw new Error("Missing synthetic listing");
  await t.db.insert(grants).values(
    ["appointment.manage", "listing.read"].map((capability) => ({
      principalId: staff.id,
      capability: capability as "appointment.manage",
      recordType: "property",
      recordId: property,
      reason: "Synthetic property-only scheduling scope",
    })),
  );
  const { session } = await createSession(t.db, { kind: "staff", id: staff.id });
  await t.db.insert(servicePolicies).values({
    effectiveFrom: new Date(Date.now() - 1000),
    timezone: "Europe/Sofia",
    serviceHours: Object.fromEntries(
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, ["09:00", "18:00"]]),
    ),
    coverage: {},
    responsePolicy: {},
    approvedById: staff.id,
  });
  const input = {
    id: listing.id,
    operationId: randomUUID(),
    expectedVersion: listing.version,
    preferredWindow: "Synthetic weekday morning",
    photographyScope:
      "Synthetic property-preparation photography, access must be checked with the actual custodian.",
    reviewed: true,
  };
  return { staff, session, listing, property, input };
}
function confirm(id: string, expectedVersion = 1) {
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
    accessNotes: "PRIVATE_SYNTHETIC_PHOTOGRAPHY_ACCESS",
  };
}

describe("B10 / O09 property-work photography", () => {
  it("creates and reads real property work without any buyer Case or Interest; native calendar includes it", async () => {
    const f = await fixture(),
      result = await requestPhotography(t.db, f.session, f.input);
    const [row] = await t.db
      .select()
      .from(appointments)
      .where(eq(appointments.id, result.outcome.id));
    expect(row).toMatchObject({
      purpose: "photography",
      caseId: null,
      interestId: null,
      listingId: f.listing.id,
      propertyId: f.property,
    });
    expect(await t.db.select().from(interests)).toHaveLength(0);
    expect((await readAppointment(t.db, f.session, result.outcome.id)).propertyWork).toMatchObject({
      listingReference: f.listing.reference,
    });
    expect(await listAppointments(t.db, f.session)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: result.outcome.id, purpose: "photography" }),
      ]),
    );
    const data = await readCalendar(t.db, f.session, {
      date: "2030-10-28",
      zone: "Europe/Sofia",
      scope: "mine",
      view: "agenda",
      page: 1,
      requestPage: 1,
    });
    expect(data.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: result.outcome.id, purpose: "photography", caseId: null }),
      ]),
    );
    expect((await requestPhotography(t.db, f.session, f.input)).replayed).toBe(true);
    await expect(
      requestPhotography(t.db, f.session, {
        ...f.input,
        photographyScope: "Different synthetic source scope",
      }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  });
  it("keeps client portal and foreign property scopes out of staff photography", async () => {
    const f = await fixture(),
      row = await requestPhotography(t.db, f.session, f.input),
      other = await fixture();
    const client = await createClient(t.db),
      issued = await createSession(t.db, { kind: "client", id: client.id });
    await expect(requestPhotography(t.db, issued.session, f.input)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(readAppointment(t.db, issued.session, row.outcome.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(readAppointment(t.db, other.session, row.outcome.id)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await listAppointments(t.db, issued.session)).toEqual([]);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, f.staff.id));
    await expect(requestPhotography(t.db, f.session, f.input)).rejects.toMatchObject({
      code: "not_found",
    });
  });
  it("reuses access, external-busy, DST and exclusive host/property checks", async () => {
    const f = await fixture(),
      requested = await requestPhotography(t.db, f.session, f.input),
      id = requested.outcome.id;
    await expect(
      arrangeAppointment(t.db, f.session, { ...confirm(id), propertyAccessConfirmed: false }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await expect(
      arrangeAppointment(t.db, f.session, { ...confirm(id), externalBusyChecked: false }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await expect(
      arrangeAppointment(t.db, f.session, {
        ...confirm(id),
        startsAt: "2030-03-31T03:30+02:00",
        endsAt: "2030-03-31T04:30+03:00",
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await arrangeAppointment(t.db, f.session, confirm(id));
    expect(
      await t.db
        .select()
        .from(appointmentResources)
        .where(eq(appointmentResources.appointmentId, id)),
    ).toHaveLength(2);
    const other = await fixture(f.property),
      requestedOther = await requestPhotography(t.db, other.session, other.input);
    await expect(
      arrangeAppointment(t.db, other.session, confirm(requestedOther.outcome.id)),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await respondToAppointment(t.db, f.session, {
      id,
      operationId: randomUUID(),
      expectedVersion: 2,
      state: "cancelled",
      reason: "Synthetic explicit cancellation",
    });
    await arrangeAppointment(t.db, other.session, confirm(requestedOther.outcome.id));
  });
  it("retains the committed interval during a reschedule and produces a purpose-labelled stable ICS", async () => {
    const f = await fixture(),
      requested = await requestPhotography(t.db, f.session, f.input),
      id = requested.outcome.id;
    await arrangeAppointment(t.db, f.session, {
      ...confirm(id),
      startsAt: `${new Date().getUTCFullYear() + 1}-02-15T10:00+02:00`,
      endsAt: `${new Date().getUTCFullYear() + 1}-02-15T11:00+02:00`,
    });
    const before = await exportAppointmentCalendar(t.db, f.session, id);
    expect(before).toContain("Photography");
    expect(before).not.toContain("PRIVATE_SYNTHETIC_PHOTOGRAPHY_ACCESS");
    await respondToAppointment(t.db, f.session, {
      id,
      operationId: randomUUID(),
      expectedVersion: 2,
      state: "reschedule_requested",
      reason: "Synthetic replacement request",
    });
    const detail = await readAppointment(t.db, f.session, id);
    expect(detail.appointment.confirmedStartsAt).not.toBeNull();
    expect(detail.reservedInterval).not.toBeNull();
    const after = await exportAppointmentCalendar(t.db, f.session, id);
    for (const line of before
      .split("\r\n")
      .filter((line) => /^(UID|SEQUENCE|DTSTART|DTEND):/.test(line)))
      expect(after).toContain(line);
  });
  it("completion changes no media, rights or publication state", async () => {
    const f = await fixture(),
      requested = await requestPhotography(t.db, f.session, f.input),
      id = requested.outcome.id;
    const mediaBefore = await t.db.select().from(mediaAssets),
      [listingBefore] = await t.db.select().from(listings).where(eq(listings.id, f.listing.id));
    await t.db
      .update(appointments)
      .set({
        state: "confirmed",
        propertyAccess: "confirmed",
        externalBusyCheckedAt: new Date(),
        confirmedStartsAt: new Date(Date.now() - 7200000),
        confirmedEndsAt: new Date(Date.now() - 3600000),
      })
      .where(eq(appointments.id, id));
    await respondToAppointment(t.db, f.session, {
      id,
      operationId: randomUUID(),
      expectedVersion: 1,
      state: "completed",
      reason: "Synthetic actual attendance outcome only",
    });
    expect(await t.db.select().from(mediaAssets)).toEqual(mediaBefore);
    expect((await t.db.select().from(listings).where(eq(listings.id, f.listing.id)))[0]).toEqual(
      listingBefore,
    );
  });
  it("an unknown request reconciles the original record/type/key and cannot be bypassed with a new key", async () => {
    const f = await fixture();
    const key = randomUUID();
    await t.db.insert(operations).values({
      actorKind: "staff",
      actorId: f.staff.id,
      operationType: "appointment.photography.request",
      idempotencyKey: key,
      requestHash: "synthetic-unknown",
      status: "outcome_unknown",
      resultType: "listing",
      resultId: f.listing.id,
    });
    await expect(requestPhotography(t.db, f.session, f.input)).rejects.toMatchObject({
      code: "outcome_unknown",
      current: { operationKey: key },
    });
    expect(
      await t.db.select().from(appointments).where(eq(appointments.listingId, f.listing.id)),
    ).toHaveLength(0);
  });
});
