import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appointmentResources, appointments, grants } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { parseCalendarQuery } from "@/features/appointments/calendar-period";
import { readCalendar } from "./calendar";
import { calendarFixture } from "./calendar-testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
const query = (date: string, options: Record<string, string> = {}) =>
  parseCalendarQuery({ date, view: "day", ...options }).query;

describe("O08 authorized calendar periods", () => {
  it("reads actual DST instants, preserves the old confirmation, and projects buffer conflicts from permitted resources", async () => {
    const f = await calendarFixture(t.db);
    const folded = await readCalendar(t.db, f.session, query("2030-10-27"));
    expect(folded.rows).toHaveLength(1);
    expect(folded.rows[0]).toMatchObject({
      id: f.replacement.id,
      state: "reschedule_requested",
      confirmedStartsAt: new Date("2030-10-27T00:30:00Z"),
      confirmedEndsAt: new Date("2030-10-27T01:30:00Z"),
      proposedStartsAt: new Date("2030-10-28T08:00:00Z"),
      propertyAccess: "confirmed",
      conflicts: ["property_access"],
    });
    expect(folded.rows[0]?.resources).toEqual(
      expect.arrayContaining([
        {
          kind: "broker",
          start: new Date("2030-10-27T00:00:00Z"),
          end: new Date("2030-10-27T02:00:00Z"),
        },
      ]),
    );
    const monday = await readCalendar(t.db, f.session, query("2030-10-28"));
    expect(monday.rows.map((row) => row.id).sort()).toEqual(
      [f.replacement.id, f.teammate.id].sort(),
    );
    expect(monday.requests.map((row) => row.id)).toEqual([f.request.id]);
    expect(JSON.stringify(monday)).not.toContain("PRIVATE_SYNTHETIC_ACCESS_CODE_DO_NOT_PROJECT");
    expect(JSON.stringify(monday)).not.toContain("resourceId");
    const mine = await readCalendar(t.db, f.session, query("2030-10-28", { scope: "mine" }));
    expect(mine.rows.map((row) => row.id)).toEqual([f.replacement.id]);
    expect(mine.rows[0]?.conflicts).toEqual(["property_access"]);
    const utc = await readCalendar(t.db, f.session, query("2030-10-27", { zone: "UTC" }));
    expect(utc.rows[0]?.confirmedStartsAt).toEqual(folded.rows[0]?.confirmedStartsAt);
  });

  it("never exposes unreadable Cases, unmanageable appointments or their overlap existence; grants are live", async () => {
    const f = await calendarFixture(t.db);
    const monday = await readCalendar(t.db, f.session, query("2030-10-28"));
    expect(JSON.stringify(monday)).not.toContain(f.readOnly.reference);
    const tuesday = await readCalendar(t.db, f.session, query("2030-10-29", { scope: "mine" }));
    expect(tuesday.rows.map((row) => row.id)).toEqual([f.proposal.id]);
    expect(tuesday.rows[0]?.conflicts).toEqual([]);
    expect(JSON.stringify(tuesday)).not.toContain(f.hidden.reference);
    const [grant] = await t.db
      .insert(grants)
      .values({
        principalId: f.viewer.id,
        capability: "appointment.manage",
        recordType: "appointment",
        recordId: f.readOnly.id,
        reason: "Synthetic exact appointment access",
      })
      .returning();
    expect(
      (await readCalendar(t.db, f.session, query("2030-10-28"))).rows.map((row) => row.id),
    ).toContain(f.readOnly.id);
    if (!grant) throw new Error("Missing exact grant");
    await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, grant.id));
    expect(
      (await readCalendar(t.db, f.session, query("2030-10-28"))).rows.map((row) => row.id),
    ).not.toContain(f.readOnly.id);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, f.viewer.id));
    expect(await readCalendar(t.db, f.session, query("2030-10-28"))).toMatchObject({
      rows: [],
      requests: [],
      hasMore: false,
      hasMoreRequests: false,
    });
  });

  it("uses half-open ranges, includes buffer-only overlaps and retains unscheduled requests separately", async () => {
    const f = await calendarFixture(t.db);
    const boundary = await t.db
      .insert(appointments)
      .values({
        reference: `AP-O08-BOUNDARY-${randomUUID()}`,
        icsUid: randomUUID(),
        caseId: f.caseId,
        hostId: f.viewer.id,
        propertyId: f.propertyId,
        format: "in_person",
        timezone: "Europe/Sofia",
        state: "proposed",
        proposedStartsAt: new Date("2030-10-30T22:00:00Z"),
        proposedEndsAt: new Date("2030-10-30T23:00:00Z"),
      })
      .returning();
    expect((await readCalendar(t.db, f.session, query("2030-10-30"))).rows).toHaveLength(0);
    expect(
      (await readCalendar(t.db, f.session, query("2030-10-31"))).rows.map((row) => row.id),
    ).toEqual([boundary[0]?.id]);
    const [buffered] = await t.db
      .insert(appointments)
      .values({
        reference: `AP-O08-BUFFER-${randomUUID()}`,
        icsUid: randomUUID(),
        caseId: f.caseId,
        hostId: f.viewer.id,
        propertyId: f.propertyId,
        format: "in_person",
        timezone: "Europe/Sofia",
        state: "confirmed",
        propertyAccess: "confirmed",
        externalBusyCheckedAt: new Date(),
        confirmedStartsAt: new Date("2030-10-30T22:15:00Z"),
        confirmedEndsAt: new Date("2030-10-30T23:15:00Z"),
      })
      .returning();
    if (!buffered) throw new Error("Missing buffered appointment");
    await t.db.insert(appointmentResources).values({
      appointmentId: buffered.id,
      kind: "broker",
      resourceId: f.viewer.id,
      during: "[2030-10-30T21:45:00Z,2030-10-30T23:45:00Z)",
    });
    const bufferOnly = await readCalendar(t.db, f.session, query("2030-10-30"));
    expect(bufferOnly.rows.map((row) => row.id)).toEqual([buffered.id]);
    expect(bufferOnly.rows[0]?.resources[0]?.start).toEqual(new Date("2030-10-30T21:45:00Z"));
    const empty = await readCalendar(t.db, f.session, query("2030-12-01"));
    expect(empty.rows).toEqual([]);
    expect(empty.requests.map((row) => row.id)).toEqual([f.request.id]);
  });

  it("filters dates and authority before pagination, and recovers an empty later page", async () => {
    const f = await calendarFixture(t.db);
    const [lateReplacement] = await t.db
      .insert(appointments)
      .values({
        reference: `AP-O08-LATE-${randomUUID()}`,
        icsUid: randomUUID(),
        caseId: f.caseId,
        hostId: f.viewer.id,
        format: "in_person",
        timezone: "Europe/Sofia",
        state: "reschedule_requested",
        confirmedStartsAt: new Date("2030-10-01T08:00:00Z"),
        confirmedEndsAt: new Date("2030-10-01T09:00:00Z"),
        proposedStartsAt: new Date("2030-11-01T16:00:00Z"),
        proposedEndsAt: new Date("2030-11-01T17:00:00Z"),
      })
      .returning();
    await t.db.insert(appointments).values(
      Array.from({ length: 53 }, (_, index) => ({
        reference: `AP-O08-DENSE-${randomUUID()}`,
        icsUid: randomUUID(),
        caseId: f.caseId,
        hostId: f.viewer.id,
        format: "in_person" as const,
        timezone: "Europe/Sofia",
        state: "proposed" as const,
        proposedStartsAt: new Date(new Date("2030-11-01T08:00:00Z").getTime() + index * 60000),
        proposedEndsAt: new Date(new Date("2030-11-01T09:00:00Z").getTime() + index * 60000),
      })),
    );
    await t.db.insert(appointments).values(
      Array.from({ length: 110 }, () => ({
        reference: `AP-O08-PRIVATE-${randomUUID()}`,
        icsUid: randomUUID(),
        caseId: f.privateCaseId,
        hostId: f.viewer.id,
        format: "in_person" as const,
        timezone: "Europe/Sofia",
        state: "proposed" as const,
        proposedStartsAt: new Date("2030-11-01T07:00:00Z"),
        proposedEndsAt: new Date("2030-11-01T08:00:00Z"),
      })),
    );
    const first = await readCalendar(t.db, f.session, query("2030-11-01"));
    const second = await readCalendar(t.db, f.session, query("2030-11-01", { page: "2" }));
    expect(first.rows).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    expect(second.rows).toHaveLength(4);
    expect(second.hasMore).toBe(false);
    expect(new Set([...first.rows, ...second.rows].map((row) => row.id)).size).toBe(54);
    expect(first.rows.map((row) => row.id)).not.toContain(lateReplacement?.id);
    expect(second.rows.at(-1)?.id).toBe(lateReplacement?.id);
    expect((await readCalendar(t.db, f.session, query("2030-11-01", { page: "3" }))).rows).toEqual(
      [],
    );
  });

  it("paginates undated requests independently of the displayed date and appointment page", async () => {
    const f = await calendarFixture(t.db);
    await t.db.insert(appointments).values(
      Array.from({ length: 22 }, () => ({
        reference: `AP-O08-REQUEST-${randomUUID()}`,
        icsUid: randomUUID(),
        caseId: f.caseId,
        hostId: f.viewer.id,
        format: "in_person" as const,
        timezone: "Europe/Sofia",
        state: "requested" as const,
      })),
    );
    const first = await readCalendar(t.db, f.session, query("2030-12-01", { page: "3" }));
    const second = await readCalendar(t.db, f.session, query("2030-01-01", { requestPage: "2" }));
    expect(first.rows).toEqual([]);
    expect(first.requests).toHaveLength(20);
    expect(first.hasMoreRequests).toBe(true);
    expect(second.requests).toHaveLength(3);
    expect(second.hasMoreRequests).toBe(false);
    expect(new Set([...first.requests, ...second.requests].map((row) => row.id)).size).toBe(23);
  });
});
