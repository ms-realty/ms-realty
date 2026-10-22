// Synthetic fixtures for the real O08 read seam and disposable browser database only.
import { randomUUID } from "node:crypto";
import { appointmentResources, appointments, grants, passkeys } from "@/db/schema";
import { createSession } from "../auth/sessions";
import type { Executor } from "../db";
import { createCase, createProperty, createStaff } from "../testing";

export async function calendarFixture(db: Executor) {
  const viewer = await createStaff(db);
  const colleague = await createStaff(db);
  const caseId = await createCase(db, viewer.id);
  const privateCaseId = await createCase(db, colleague.id);
  const readOnlyCaseId = await createCase(db, colleague.id);
  await db.insert(grants).values([
    {
      principalId: viewer.id,
      role: "assigned_broker",
      recordType: "case",
      recordId: caseId,
      reason: "Synthetic calendar scope",
    },
    {
      principalId: viewer.id,
      capability: "case.read",
      recordType: "case",
      recordId: readOnlyCaseId,
      reason: "Synthetic read-only Case scope",
    },
  ]);
  await db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: viewer.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const issued = await createSession(db, { kind: "staff", id: viewer.id });
  const propertyId = await createProperty(db);
  const otherPropertyId = await createProperty(db);
  async function insert(values: Partial<typeof appointments.$inferInsert>) {
    const [row] = await db
      .insert(appointments)
      .values({
        reference: `AP-O08-${randomUUID()}`,
        icsUid: randomUUID(),
        caseId,
        hostId: viewer.id,
        propertyId,
        format: "in_person",
        timezone: "Europe/Sofia",
        ...values,
      })
      .returning();
    if (!row) throw new Error("Missing synthetic calendar appointment");
    return row;
  }
  async function reserve(row: typeof appointments.$inferSelect) {
    if (!row.confirmedStartsAt || !row.confirmedEndsAt || !row.hostId || !row.propertyId)
      throw new Error("Missing synthetic interval");
    const during = `[${new Date(row.confirmedStartsAt.getTime() - 1800000).toISOString()},${new Date(row.confirmedEndsAt.getTime() + 1800000).toISOString()})`;
    await db.insert(appointmentResources).values([
      { appointmentId: row.id, kind: "broker", resourceId: row.hostId, during },
      { appointmentId: row.id, kind: "property_access", resourceId: row.propertyId, during },
    ]);
  }
  const replacement = await insert({
    state: "reschedule_requested",
    confirmedStartsAt: new Date("2030-10-27T00:30:00Z"),
    confirmedEndsAt: new Date("2030-10-27T01:30:00Z"),
    proposedStartsAt: new Date("2030-10-28T08:00:00Z"),
    proposedEndsAt: new Date("2030-10-28T09:00:00Z"),
    propertyAccess: "confirmed",
    externalBusyCheckedAt: new Date("2030-10-26T08:00:00Z"),
    externalBusyCheckedById: viewer.id,
    accessNotes: "PRIVATE_SYNTHETIC_ACCESS_CODE_DO_NOT_PROJECT",
  });
  await reserve(replacement);
  const teammate = await insert({
    hostId: colleague.id,
    state: "confirmed",
    confirmedStartsAt: new Date("2030-10-28T08:30:00Z"),
    confirmedEndsAt: new Date("2030-10-28T09:30:00Z"),
    propertyAccess: "confirmed",
    externalBusyCheckedAt: new Date("2030-10-26T08:00:00Z"),
  });
  await reserve(teammate);
  const proposal = await insert({
    propertyId: otherPropertyId,
    state: "proposed",
    propertyAccess: "requested",
    proposedStartsAt: new Date("2030-10-29T08:00:00Z"),
    proposedEndsAt: new Date("2030-10-29T09:00:00Z"),
  });
  const hidden = await insert({
    caseId: privateCaseId,
    propertyId: otherPropertyId,
    state: "confirmed",
    confirmedStartsAt: new Date("2030-10-29T08:00:00Z"),
    confirmedEndsAt: new Date("2030-10-29T09:00:00Z"),
    propertyAccess: "confirmed",
    externalBusyCheckedAt: new Date("2030-10-26T08:00:00Z"),
  });
  await reserve(hidden);
  const readOnly = await insert({
    caseId: readOnlyCaseId,
    state: "proposed",
    proposedStartsAt: new Date("2030-10-28T08:00:00Z"),
    proposedEndsAt: new Date("2030-10-28T09:00:00Z"),
  });
  const request = await insert({
    state: "requested",
    requestedWindows: [{ text: "Synthetic weekday morning" }],
  });
  return {
    viewer,
    colleague,
    ...issued,
    caseId,
    privateCaseId,
    readOnlyCaseId,
    propertyId,
    replacement,
    teammate,
    proposal,
    hidden,
    readOnly,
    request,
  };
}
