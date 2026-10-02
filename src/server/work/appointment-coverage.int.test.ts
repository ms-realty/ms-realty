import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { appointmentResources, appointments, grants } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { readAppointment } from "../appointments/service";
import { changeStaffAbsence } from "../auth/absence";
import { offboardStaff } from "../auth/grants";
import { readOffboardingWork } from "../auth/offboarding-work";
import { staffFixture } from "../cases/testing";
import { custodyFixture } from "../key-custody/testing";
import { createCase } from "../testing";
import { readCoverage } from "./coverage";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function fixture() {
  const manager = await custodyFixture(t.db),
    owner = await staffFixture(t.db);
  // The host need not be this Case's owner; offboarding/absence must still show the appointment.
  const caseId = await createCase(t.db, manager.id);
  await t.db.insert(grants).values({
    principalId: manager.id,
    capability: "appointment.manage",
    recordType: "case",
    recordId: caseId,
    reason: "Synthetic coordinator for this Case",
  });
  const start = new Date(Date.now() + 86400000),
    end = new Date(start.getTime() + 3600000);
  const values = {
    reference: `AP-${randomUUID()}`,
    icsUid: randomUUID(),
    caseId,
    hostId: owner.id,
    state: "confirmed" as const,
    format: "in_person" as const,
    timezone: "Europe/Sofia",
    confirmedStartsAt: start,
    confirmedEndsAt: end,
    propertyAccess: "confirmed" as const,
    externalBusyCheckedAt: new Date(),
    externalBusyCheckedById: manager.id,
    icsSequence: 3,
  };
  const [appointment] = await t.db.insert(appointments).values(values).returning();
  if (!appointment) throw new Error("Missing appointment");
  const [resource] = await t.db
    .insert(appointmentResources)
    .values({
      appointmentId: appointment.id,
      kind: "broker",
      resourceId: owner.id,
      during: `[${start.toISOString()},${new Date(end.getTime() + 1800000).toISOString()})`,
    })
    .returning();
  return { manager, owner, caseId, start, end, appointment, resource, values };
}
const absence = (id: string, startsAt: Date | null = null) => ({
  principalId: id,
  operationId: randomUUID(),
  expectedRevision: 1,
  action: "schedule",
  startsAt: startsAt?.toISOString() ?? null,
  reviewAt: new Date(Date.now() + 3 * 86400000).toISOString(),
  reason: "Review appointments and coordinate participant changes.",
  reviewed: true,
});

it("surfaces a future absence intersecting a reserved travel buffer without changing the booking", async () => {
  const f = await fixture();
  expect((await readCoverage(t.db, f.manager.session)).appointments.map((r) => r.id)).not.toContain(
    f.appointment.id,
  );
  await changeStaffAbsence(
    t.db,
    f.manager.session,
    absence(f.owner.id, new Date(f.end.getTime() + 600000)),
  );
  const queue = await readCoverage(t.db, f.manager.session);
  expect(queue.appointments.find((r) => r.id === f.appointment.id)).toMatchObject({
    state: "confirmed",
    dueAt: f.start,
  });
  expect(queue.cases.map((r) => r.id)).not.toContain(f.caseId);
  expect(
    (await readOffboardingWork(t.db, f.manager.session, f.owner.id)).appointments.map((r) => r.id),
  ).toContain(f.appointment.id);
  expect((await readAppointment(t.db, f.manager.session, f.appointment.id)).needsCoverage).toBe(
    true,
  );
  expect(
    await t.db.select().from(appointments).where(eq(appointments.id, f.appointment.id)),
  ).toEqual([f.appointment]);
  expect(
    await t.db
      .select()
      .from(appointmentResources)
      .where(eq(appointmentResources.appointmentId, f.appointment.id)),
  ).toEqual([f.resource]);
  await changeStaffAbsence(t.db, f.manager.session, {
    ...absence(f.owner.id),
    expectedRevision: 2,
    action: "return",
    reviewAt: null,
  });
  expect((await readAppointment(t.db, f.manager.session, f.appointment.id)).needsCoverage).toBe(
    false,
  );
});

it("keeps before-absence slots out, includes revoked hosts and excludes terminal appointments", async () => {
  const f = await fixture();
  await changeStaffAbsence(
    t.db,
    f.manager.session,
    absence(f.owner.id, new Date(f.end.getTime() + 3600000)),
  );
  expect((await readCoverage(t.db, f.manager.session)).appointments.map((r) => r.id)).not.toContain(
    f.appointment.id,
  );
  const [cancelled] = await t.db
    .insert(appointments)
    .values({
      ...f.values,
      state: "cancelled",
      reference: `AP-${randomUUID()}`,
      icsUid: randomUUID(),
    })
    .returning();
  await offboardStaff(t.db, f.manager.session, {
    principalId: f.owner.id,
    operationId: randomUUID(),
    expectedRevision: 1,
    reason: "End staff access with retained calendar commitments.",
    reviewed: true,
  });
  const queue = await readCoverage(t.db, f.manager.session);
  expect(queue.appointments.map((r) => r.id)).toContain(f.appointment.id);
  expect(queue.appointments.map((r) => r.id)).not.toContain(cancelled?.id);
});

it("requires both Case visibility and appointment authority before limits and paging", async () => {
  const f = await fixture(),
    viewer = await custodyFixture(t.db);
  await changeStaffAbsence(t.db, f.manager.session, absence(f.owner.id));
  await t.db.insert(appointments).values(
    Array.from({ length: 26 }, () => ({
      ...f.values,
      reference: `AP-${randomUUID()}`,
      icsUid: randomUUID(),
    })),
  );
  await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.principalId, viewer.id));
  await t.db.insert(grants).values({
    principalId: viewer.id,
    capability: "access.grant",
    reason: "Access administration only",
  });
  expect((await readCoverage(t.db, viewer.session)).appointments).toEqual([]);
  expect((await readOffboardingWork(t.db, viewer.session, f.owner.id)).appointments).toEqual([]);
  const [permission] = await t.db
    .insert(grants)
    .values({
      principalId: viewer.id,
      capability: "appointment.manage",
      recordType: "appointment",
      recordId: f.appointment.id,
      reason: "Single appointment authority without Case access",
    })
    .returning();
  expect((await readCoverage(t.db, viewer.session)).appointments).toEqual([]);
  await t.db.insert(grants).values({
    principalId: viewer.id,
    capability: "case.read",
    recordType: "case",
    recordId: f.caseId,
    reason: "Readable parent Case",
  });
  expect((await readCoverage(t.db, viewer.session)).appointments.map((r) => r.id)).toEqual([
    f.appointment.id,
  ]);
  if (!permission) throw new Error("Missing permission");
  await t.db
    .update(grants)
    .set({ recordType: "case", recordId: f.caseId })
    .where(eq(grants.id, permission.id));
  const first = await readCoverage(t.db, viewer.session),
    second = await readCoverage(t.db, viewer.session, 2);
  expect(first.appointments).toHaveLength(25);
  expect(first.hasMore).toBe(true);
  expect(second.appointments).toHaveLength(2);
  expect(new Set([...first.appointments, ...second.appointments].map((r) => r.id)).size).toBe(27);
  await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, permission.id));
  expect((await readCoverage(t.db, viewer.session)).appointments).toEqual([]);
});
