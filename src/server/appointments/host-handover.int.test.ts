import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  appointmentResources,
  appointments,
  appointmentVersions,
  grants,
  sessions,
  staffMemberships,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { staffFixture } from "../cases/testing";
import { createCase, createProperty } from "../testing";
import { readCoverage } from "../work/coverage";
import { acceptAppointmentHost } from "./host-handover";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function fixture(receiver?: Awaited<ReturnType<typeof staffFixture>>) {
  const old = await staffFixture(t.db),
    target = receiver ?? (await staffFixture(t.db));
  const caseId = await createCase(t.db, old.id),
    propertyId = await createProperty(t.db);
  const start = new Date(Date.now() + 86400000),
    end = new Date(start.getTime() + 3600000);
  const [row] = await t.db
    .insert(appointments)
    .values({
      reference: `AP-HOST-${randomUUID()}`,
      icsUid: randomUUID(),
      icsSequence: 3,
      caseId,
      propertyId,
      hostId: old.id,
      state: "confirmed",
      format: "in_person",
      timezone: "Europe/Sofia",
      confirmedStartsAt: start,
      confirmedEndsAt: end,
      propertyAccess: "confirmed",
      externalBusyCheckedAt: new Date(),
      externalBusyCheckedById: old.id,
      accessNotes: "Synthetic meeting point, retained exactly",
    })
    .returning();
  if (!row) throw new Error("No appointment");
  const during = `[${new Date(start.getTime() - 1800000).toISOString()},${new Date(end.getTime() + 1800000).toISOString()})`;
  await t.db.insert(appointmentResources).values([
    { appointmentId: row.id, kind: "broker", resourceId: old.id, during },
    { appointmentId: row.id, kind: "property_access", resourceId: propertyId, during },
  ]);
  await t.db.insert(tasks).values({
    caseId,
    ownerId: old.id,
    promisedToClient: true,
    title: "Retained promise",
    dueAt: end,
  });
  await t.db
    .update(staffMemberships)
    .set({
      absenceFrom: new Date(Date.now() - 1000),
      absenceReviewAt: new Date(Date.now() + 3600000),
    })
    .where(eq(staffMemberships.principalId, old.id));
  return { old, target, row, during, caseId, start, end };
}
const input = (id: string) => ({
  id,
  operationId: randomUUID(),
  expectedVersion: 1,
  reason: "I accept the previously recorded viewing and all its obligations.",
  reviewed: true,
  externalBusyChecked: true,
  propertyAccessConfirmed: true,
});
const resources = (id: string) =>
  t.db.select().from(appointmentResources).where(eq(appointmentResources.appointmentId, id));
const current = async (id: string) =>
  (await t.db.select().from(appointments).where(eq(appointments.id, id)))[0];

it("receiver acceptance changes only hosting, preserving the booked slot, property resource, promises and calendar UID; replay is idempotent", async () => {
  const f = await fixture(),
    before = await resources(f.row.id),
    command = input(f.row.id);
  const promises = await t.db.select().from(tasks).where(eq(tasks.caseId, f.caseId));
  expect(
    (await readCoverage(t.db, f.target.session)).appointments.some((r) => r.id === f.row.id),
  ).toBe(true);
  const result = await acceptAppointmentHost(t.db, f.target.session, command);
  const after = await current(f.row.id);
  expect(after).toMatchObject({
    hostId: f.target.id,
    state: f.row.state,
    confirmedStartsAt: f.row.confirmedStartsAt,
    confirmedEndsAt: f.row.confirmedEndsAt,
    icsUid: f.row.icsUid,
    icsSequence: 4,
    version: 2,
    accessNotes: f.row.accessNotes,
    propertyAccess: f.row.propertyAccess,
  });
  const held = await resources(f.row.id);
  expect(held.find((r) => r.kind === "property_access")).toEqual(
    before.find((r) => r.kind === "property_access"),
  );
  expect(held.find((r) => r.kind === "broker" && r.active)).toMatchObject({
    resourceId: f.target.id,
    during: before.find((r) => r.kind === "broker")?.during,
  });
  expect(held.find((r) => r.kind === "broker" && r.resourceId === f.old.id)?.active).toBe(false);
  expect(await t.db.select().from(tasks).where(eq(tasks.caseId, f.caseId))).toEqual(promises);
  expect(
    (await readCoverage(t.db, f.target.session)).appointments.some((r) => r.id === f.row.id),
  ).toBe(false);
  expect((await acceptAppointmentHost(t.db, f.target.session, command)).outcome).toEqual(
    result.outcome,
  );
  expect(await resources(f.row.id)).toEqual(held);
  expect(
    await t.db
      .select()
      .from(appointmentVersions)
      .where(eq(appointmentVersions.appointmentId, f.row.id)),
  ).toHaveLength(1);
});

it("a competing booking including travel buffer rejects acceptance without releasing either original resource", async () => {
  const f = await fixture(),
    other = await fixture(f.target),
    before = await resources(f.row.id);
  await t.db.insert(appointmentResources).values({
    appointmentId: other.row.id,
    kind: "broker",
    resourceId: f.target.id,
    during: `[${f.end.toISOString()},${new Date(f.end.getTime() + 3600000).toISOString()})`,
  });
  await expect(
    acceptAppointmentHost(t.db, f.target.session, input(f.row.id)),
  ).rejects.toMatchObject({ code: "transition_denied" });
  expect(await resources(f.row.id)).toEqual(before);
  expect(await current(f.row.id)).toEqual(f.row);
});

it("two simultaneous receivers cannot both accept the same viewing", async () => {
  const f = await fixture(),
    second = await staffFixture(t.db);
  const results = await Promise.allSettled([
    acceptAppointmentHost(t.db, f.target.session, input(f.row.id)),
    acceptAppointmentHost(t.db, second.session, input(f.row.id)),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect((await resources(f.row.id)).filter((r) => r.active && r.kind === "broker")).toHaveLength(
    1,
  );
  expect((await current(f.row.id))?.version).toBe(2);
});

it("future receiver absence during travel buffer and lost access both retain the old host", async () => {
  const f = await fixture();
  await t.db
    .update(staffMemberships)
    .set({
      absenceFrom: new Date(f.end.getTime() + 60000),
      absenceReviewAt: new Date(f.end.getTime() + 3600000),
    })
    .where(eq(staffMemberships.principalId, f.target.id));
  await expect(
    acceptAppointmentHost(t.db, f.target.session, input(f.row.id)),
  ).rejects.toMatchObject({ code: "transition_denied" });
  await t.db
    .update(staffMemberships)
    .set({ absenceFrom: null, absenceReviewAt: null })
    .where(eq(staffMemberships.principalId, f.target.id));
  await t.db
    .update(grants)
    .set({ revokedAt: new Date() })
    .where(eq(grants.principalId, f.target.id));
  await expect(
    acceptAppointmentHost(t.db, f.target.session, input(f.row.id)),
  ).rejects.toBeDefined();
  expect(await current(f.row.id)).toEqual(f.row);
});

it("requires current coverage, explicit review and consistent booked resources", async () => {
  const f = await fixture();
  await expect(
    acceptAppointmentHost(t.db, f.target.session, { ...input(f.row.id), reviewed: false }),
  ).rejects.toMatchObject({ code: "validation_failed" });
  await t.db
    .update(staffMemberships)
    .set({ absenceFrom: null, absenceReviewAt: null })
    .where(eq(staffMemberships.principalId, f.old.id));
  await expect(
    acceptAppointmentHost(t.db, f.target.session, input(f.row.id)),
  ).rejects.toMatchObject({ code: "transition_denied" });
  await t.db
    .update(staffMemberships)
    .set({
      absenceFrom: new Date(Date.now() - 1000),
      absenceReviewAt: new Date(Date.now() + 3600000),
    })
    .where(eq(staffMemberships.principalId, f.old.id));
  await t.db
    .update(appointmentResources)
    .set({ active: false, releasedAt: new Date() })
    .where(
      and(
        eq(appointmentResources.appointmentId, f.row.id),
        eq(appointmentResources.kind, "property_access"),
      ),
    );
  await expect(
    acceptAppointmentHost(t.db, f.target.session, input(f.row.id)),
  ).rejects.toMatchObject({ code: "transition_denied" });
  expect(await current(f.row.id)).toEqual(f.row);
  expect(
    await t.db
      .select()
      .from(appointmentVersions)
      .where(eq(appointmentVersions.appointmentId, f.row.id)),
  ).toHaveLength(0);
});

it("requires fresh recorded authentication before accepting", async () => {
  const f = await fixture();
  await t.db
    .update(sessions)
    .set({ createdAt: new Date(Date.now() - 600000), reverifiedAt: null })
    .where(eq(sessions.id, f.target.session.id));
  await expect(
    acceptAppointmentHost(t.db, f.target.session, input(f.row.id)),
  ).rejects.toMatchObject({ code: "step_up_required" });
  expect(await current(f.row.id)).toEqual(f.row);
});

it("concurrent acceptance of overlapping viewings by one receiver commits only one reservation", async () => {
  const receiver = await staffFixture(t.db),
    first = await fixture(receiver),
    second = await fixture(receiver);
  const results = await Promise.allSettled([
    acceptAppointmentHost(t.db, receiver.session, input(first.row.id)),
    acceptAppointmentHost(t.db, receiver.session, input(second.row.id)),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  const rows = await t.db
    .select()
    .from(appointmentResources)
    .where(
      and(eq(appointmentResources.resourceId, receiver.id), eq(appointmentResources.active, true)),
    );
  expect(rows).toHaveLength(1);
  const oldResources = [
    ...(await resources(first.row.id)),
    ...(await resources(second.row.id)),
  ].filter((r) => r.kind === "broker" && r.resourceId !== receiver.id && r.active);
  expect(oldResources).toHaveLength(1);
});

it("an inconsistent resource interval cannot be accepted as a valid recorded booking", async () => {
  const f = await fixture();
  await t.db
    .update(appointmentResources)
    .set({
      during: `[${f.start.toISOString()},${new Date(f.start.getTime() + 60000).toISOString()})`,
    })
    .where(
      and(
        eq(appointmentResources.appointmentId, f.row.id),
        eq(appointmentResources.kind, "broker"),
      ),
    );
  const before = await resources(f.row.id);
  await expect(
    acceptAppointmentHost(t.db, f.target.session, input(f.row.id)),
  ).rejects.toMatchObject({ code: "transition_denied" });
  expect(await resources(f.row.id)).toEqual(before);
  expect(await current(f.row.id)).toEqual(f.row);
});
