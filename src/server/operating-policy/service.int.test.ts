import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appointments,
  appointmentVersions,
  auditEvents,
  grants,
  inquiries,
  listings,
  operatingPolicyVersions,
  outboxEvents,
  passkeys,
  servicePolicies,
  sessions,
  staffMemberships,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import {
  emptyOperatingPolicy,
  type OperatingPolicy,
  operatingPolicyId,
  policyWeekdays,
  staffedDuration,
} from "@/domain/operating-policy";
import {
  arrangeAppointment,
  requestAppointment,
  respondToAppointment,
} from "../appointments/service";
import { inServiceHours } from "../appointments/time";
import { createSession } from "../auth/sessions";
import { addInterest, respondToInterest } from "../cases/commands";
import { caseFixture, reviewedCandidateFixture } from "../cases/testing";
import { issueSubmissionKey, newReceiptSession, submitInquiry } from "../inquiries/intake";
import { confirmListingAvailability } from "../inventory/commands";
import { loadPublishedListings, presentationOf } from "../publication/presentation";
import { createListingFixture, publishForTest } from "../publication/testing";
import { searchListings } from "../search/search";
import { createStaff } from "../testing";
import {
  approveOperatingPolicy,
  captureOperatingPolicy,
  policyResource,
  readOperatingPolicy,
  readOperatingPolicyOperation,
  saveOperatingPolicy,
} from "./service";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function staff(scopeId: string | false = operatingPolicyId) {
  const person = await createStaff(t.db, {
    grants: scopeId
      ? [{ capability: "settings.manage", recordType: policyResource.type, recordId: scopeId }]
      : [],
  });
  await t.db.insert(passkeys).values({
    principalId: person.id,
    credentialId: randomUUID(),
    publicKey: Buffer.from([1]),
    deviceType: "singleDevice",
    backedUp: false,
  });
  return { ...person, ...(await createSession(t.db, { kind: "staff", id: person.id })) };
}
type Staff = Awaited<ReturnType<typeof staff>>;
async function save(actor: Staff, document: OperatingPolicy) {
  const model = await readOperatingPolicy(t.db, actor.session);
  return saveOperatingPolicy(t.db, actor.session, {
    operationId: randomUUID(),
    expectedVersion: model.draft.version,
    document,
  });
}
async function approve(actor: Staff) {
  const { draft } = await readOperatingPolicy(t.db, actor.session);
  return approveOperatingPolicy(t.db, actor.session, {
    operationId: randomUUID(),
    expectedVersion: draft.version,
    expectedHash: draft.contentHash ?? "",
    reviewed: true,
    note: "Synthetic test-only human policy decision, not real acceptance.",
  });
}
function reviewedPolicy(): OperatingPolicy {
  const year = new Date().getUTCFullYear();
  return {
    ...structuredClone(emptyOperatingPolicy),
    serviceCalendar: {
      kind: "reviewed_calendar_v1",
      timezone: "Europe/Sofia",
      validFrom: `${year}-01-01`,
      validUntil: `${year + 2}-12-31`,
      sourceReference: "Synthetic test-only hours, not actual agency staffing",
      weekly: Object.fromEntries(
        policyWeekdays.map((day) => [day, [["09:00", "18:00"]]]),
      ) as NonNullable<OperatingPolicy["serviceCalendar"]>["weekly"],
      exceptions: [],
    },
  };
}
describe("O24/F30 versioned operating policy commands (synthetic authority only)", () => {
  it("allows only one competing draft at the same revision", async () => {
    const actor = await staff(),
      { draft } = await readOperatingPolicy(t.db, actor.session);
    const results = await Promise.allSettled(
      ["first", "second"].map((marker) =>
        saveOperatingPolicy(t.db, actor.session, {
          operationId: randomUUID(),
          expectedVersion: draft.version,
          document: {
            ...emptyOperatingPolicy,
            processReference: `Synthetic ${marker} concurrent decision`,
          },
        }),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected").map((result) => result.reason),
    ).toMatchObject([{ code: "version_conflict" }]);
  });
  it("uses recorded review intervals for new availability evidence and preserves earlier horizons", async () => {
    const actor = await staff(),
      f = await caseFixture(t.db),
      listing = await createListingFixture(t.db, { reviewerId: f.staff.id });
    await publishForTest(t.db, f.staff.actor, listing);
    const document = reviewedPolicy();
    document.availabilityReviewDays = { sale: 3, long_term_rent: 2 };
    await save(actor, document);
    const first = await approve(actor);
    const [initial] = await t.db.select().from(listings).where(eq(listings.id, listing.listingId));
    const command = {
      actor: f.staff.actor,
      operationId: randomUUID(),
      reference: listing.reference,
      expectedRevision: initial?.version as number,
      evidence: "Synthetic human availability evidence",
    };
    const done = await confirmListingAvailability(t.db, command);
    const [confirmed] = await t.db
      .select()
      .from(listings)
      .where(eq(listings.id, listing.listingId));
    expect(confirmed?.reviewDueAt?.getTime()).toBe(
      (confirmed?.availabilityConfirmedAt?.getTime() ?? 0) + 3 * 86400000,
    );
    expect(confirmed?.availabilityPolicySnapshot).toMatchObject({
      policyId: first.outcome.policyId,
    });
    const later = new Date((confirmed?.availabilityConfirmedAt?.getTime() ?? 0) + 4 * 86400000);
    const [published] = await loadPublishedListings(t.db, { ids: [listing.listingId] }, "bg");
    expect(published && presentationOf(published, later).availability).toBe(
      "confirmation_required",
    );
    expect(
      (
        await searchListings(
          t.db,
          { locale: "bg", purpose: "sale", availability: ["available"] },
          { now: later },
        )
      ).items.map((row) => row.reference),
    ).not.toContain(listing.reference);
    document.availabilityReviewDays.sale = 1;
    await save(actor, document);
    await approve(actor);
    expect(
      (await t.db.select().from(listings).where(eq(listings.id, listing.listingId)))[0]
        ?.reviewDueAt,
    ).toEqual(confirmed?.reviewDueAt);
    const beforeOldHorizon = new Date(
      (confirmed?.availabilityConfirmedAt?.getTime() ?? 0) + 2 * 86400000,
    );
    expect(
      (
        await searchListings(
          t.db,
          { locale: "bg", purpose: "sale", availability: ["available"] },
          { now: beforeOldHorizon },
        )
      ).items.map((row) => row.reference),
    ).toContain(listing.reference);
    await confirmListingAvailability(t.db, {
      ...command,
      operationId: randomUUID(),
      expectedRevision: done.outcome.version,
    });
    const [reconfirmed] = await t.db
      .select()
      .from(listings)
      .where(eq(listings.id, listing.listingId));
    expect(reconfirmed?.reviewDueAt?.getTime()).toBe(
      (reconfirmed?.availabilityConfirmedAt?.getTime() ?? 0) + 86400000,
    );
    await expect(
      t.db
        .update(listings)
        .set({ reviewDueAt: new Date(Date.now() + 50 * 86400000) })
        .where(eq(listings.id, listing.listingId)),
    ).rejects.toThrow();
    const audit = await t.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.recordId, listing.listingId),
          eq(auditEvents.action, "listing.availability.confirmed"),
        ),
      );
    expect(audit).toHaveLength(2);
    expect(
      audit.some(
        (event) =>
          (event.payload as { operatingPolicySnapshot?: { policyId?: string } })
            .operatingPolicySnapshot?.policyId === first.outcome.policyId,
      ),
    ).toBe(true);
    await save(actor, emptyOperatingPolicy);
    await approve(actor);
    await expect(
      confirmListingAvailability(t.db, {
        ...command,
        operationId: randomUUID(),
        expectedRevision: reconfirmed?.version as number,
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { evidence: ["review_interval_policy_unknown"] },
    });
    expect(
      (await t.db.select().from(listings).where(eq(listings.id, listing.listingId)))[0]
        ?.reviewDueAt,
    ).toEqual(reconfirmed?.reviewDueAt);
  });
  it("requires live staff with the exact ordinary settings scope, including receipt reads", async () => {
    const denied = await staff(false),
      wrong = await staff(randomUUID()),
      allowed = await staff();
    for (const actor of [denied, wrong]) {
      await expect(readOperatingPolicy(t.db, actor.session)).rejects.toMatchObject({
        code: "forbidden",
      });
      await expect(
        saveOperatingPolicy(t.db, actor.session, {
          operationId: randomUUID(),
          expectedVersion: 1,
          document: emptyOperatingPolicy,
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
    }
    expect((await readOperatingPolicy(t.db, allowed.session)).draft.document).toEqual(
      emptyOperatingPolicy,
    );
    await t.db
      .update(staffMemberships)
      .set({ state: "suspended" })
      .where(eq(staffMemberships.principalId, allowed.id));
    await expect(readOperatingPolicy(t.db, allowed.session)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
  it("serializes stale drafts and provides same-payload replay without repeated audit/outbox effects", async () => {
    const actor = await staff(),
      { draft } = await readOperatingPolicy(t.db, actor.session);
    const input = {
      operationId: randomUUID(),
      expectedVersion: draft.version,
      document: emptyOperatingPolicy,
    };
    const done = await saveOperatingPolicy(t.db, actor.session, input),
      replay = await saveOperatingPolicy(t.db, actor.session, input);
    expect(replay).toMatchObject({
      operationId: done.operationId,
      replayed: true,
      outcome: done.outcome,
    });
    await expect(
      saveOperatingPolicy(t.db, actor.session, {
        ...input,
        document: { ...emptyOperatingPolicy, coverage: "Different synthetic coverage" },
      }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    await expect(
      saveOperatingPolicy(t.db, actor.session, { ...input, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    expect(
      await t.db.select().from(auditEvents).where(eq(auditEvents.operationId, done.operationId)),
    ).toHaveLength(1);
    expect(
      await t.db.select().from(outboxEvents).where(eq(outboxEvents.operationId, done.operationId)),
    ).toHaveLength(1);
    expect(
      await readOperatingPolicyOperation(t.db, (await staff()).session, "save", input.operationId),
    ).toBeNull();
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, actor.id));
    await expect(
      readOperatingPolicyOperation(t.db, actor.session, "save", input.operationId),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it("requires exact draft revision/hash, explicit review and fresh authentication for approval", async () => {
    const actor = await staff(),
      saved = await save(actor, {
        ...emptyOperatingPolicy,
        processReference: "Synthetic distinct approval evidence",
      });
    const input = {
      operationId: randomUUID(),
      expectedVersion: saved.outcome.version,
      expectedHash: saved.outcome.contentHash,
      reviewed: true as const,
      note: "Synthetic test-only review evidence",
    };
    await expect(
      approveOperatingPolicy(t.db, actor.session, { ...input, reviewed: false as true }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await expect(
      approveOperatingPolicy(t.db, actor.session, { ...input, expectedHash: "b".repeat(64) }),
    ).rejects.toMatchObject({ code: "approval_stale" });
    await t.db
      .update(sessions)
      .set({ reverifiedAt: new Date(Date.now() - 6 * 60000) })
      .where(eq(sessions.id, actor.session.id));
    await expect(
      approveOperatingPolicy(t.db, actor.session, { ...input, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "step_up_required" });
    const refreshed = await createSession(t.db, { kind: "staff", id: actor.id });
    const key = randomUUID(),
      done = await approveOperatingPolicy(t.db, refreshed.session, { ...input, operationId: key });
    expect(done.outcome.effects).toEqual({
      staffedTiming: false,
      coverage: false,
      serviceContact: false,
      savedSearch: false,
      marketing: false,
    });
    expect(
      await approveOperatingPolicy(t.db, refreshed.session, { ...input, operationId: key }),
    ).toMatchObject({ replayed: true, outcome: done.outcome });
    await expect(
      approveOperatingPolicy(t.db, refreshed.session, { ...input, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    const [projection] = await t.db
      .select()
      .from(servicePolicies)
      .where(eq(servicePolicies.approvedById, actor.id));
    expect(inServiceHours(new Date(), new Date(Date.now() + 60000), projection?.serviceHours)).toBe(
      false,
    );
    await expect(
      t.db
        .update(servicePolicies)
        .set({ serviceHours: { mon: ["00:00", "23:59"] } })
        .where(eq(servicePolicies.id, projection?.id as string)),
    ).rejects.toThrow();
    await expect(
      t.db
        .update(operatingPolicyVersions)
        .set({ approvalNote: "Silent replacement" })
        .where(eq(operatingPolicyVersions.id, done.outcome.policyId)),
    ).rejects.toThrow();
  });
  it("refuses activation with a no-longer-active named responsibility", async () => {
    const actor = await staff(),
      owner = await staff(false),
      document = reviewedPolicy();
    document.responsibilities.service = owner.id;
    await save(actor, document);
    await t.db
      .update(staffMemberships)
      .set({ state: "ended" })
      .where(eq(staffMemberships.principalId, owner.id));
    await expect(approve(actor)).rejects.toMatchObject({ code: "validation_failed" });
    const results = await t.db
      .select()
      .from(operatingPolicyVersions)
      .where(eq(operatingPolicyVersions.approvedById, actor.id));
    expect(results).toHaveLength(0);
  });
  it("binds accepted inquiry context, retains it after policy change and refuses DB overwrite", async () => {
    const actor = await staff();
    await save(actor, reviewedPolicy());
    const first = await approve(actor),
      receiptSession = newReceiptSession();
    const input = {
      submissionKey: issueSubmissionKey(),
      purpose: "question" as const,
      locale: "bg" as const,
      contact: { kind: "email" as const, value: "policy-visitor@example.test" },
      message: "Synthetic policy-context inquiry",
      privacyNotice: true,
      marketingOptIn: false,
    };
    await submitInquiry(t.db, input, { ip: "198.51.100.240", receiptSession });
    const [accepted] = await t.db
      .select()
      .from(inquiries)
      .where(eq(inquiries.submissionKey, input.submissionKey));
    expect(accepted?.operatingPolicySnapshot).toMatchObject({
      kind: "approved_operating_policy_v1",
      policyId: first.outcome.policyId,
    });
    const next = { ...reviewedPolicy(), coverage: "Different synthetic coverage, no public claim" };
    await save(actor, next);
    const second = await approve(actor);
    expect(await captureOperatingPolicy(t.db)).toMatchObject({ policyId: second.outcome.policyId });
    await submitInquiry(t.db, input, { ip: "198.51.100.241", receiptSession });
    const [unchanged] = await t.db
      .select()
      .from(inquiries)
      .where(eq(inquiries.id, accepted?.id as string));
    expect(unchanged?.operatingPolicySnapshot).toEqual(accepted?.operatingPolicySnapshot);
    expect(unchanged?.firstResponseAt).toBeNull();
    expect(
      staffedDuration(
        unchanged?.operatingPolicySnapshot,
        new Date("2026-02-02T08:00Z"),
        new Date("2026-02-02T09:00Z"),
      ),
    ).toMatchObject({ status: "known", milliseconds: 3600000 });
    await expect(
      t.db
        .update(inquiries)
        .set({ operatingPolicySnapshot: await captureOperatingPolicy(t.db) })
        .where(eq(inquiries.id, accepted?.id as string)),
    ).rejects.toThrow();
  });
  it("records request and first-confirmation contexts separately, while unknown new hours hold confirmation", async () => {
    const actor = await staff();
    await save(actor, reviewedPolicy());
    const first = await approve(actor);
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
      explanation: "Synthetic reviewed option",
      matchReview: await reviewedCandidateFixture(t.db, f, listing.reference),
    });
    await respondToInterest(t.db, f.client.session, {
      id: interest.outcome.interestId,
      operationId: randomUUID(),
      expectedVersion: 1,
      state: "shortlisted",
      reason: "Synthetic option selected",
    });
    const request = await requestAppointment(t.db, f.client.session, {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: 2,
      interestId: interest.outcome.interestId,
      preferredWindow: "Synthetic weekday morning",
    });
    const secondDocument = reviewedPolicy();
    secondDocument.processReference = "Synthetic revised process source";
    await save(actor, secondDocument);
    const second = await approve(actor);
    const year = new Date().getUTCFullYear() + 1;
    const confirm = {
      id: request.outcome.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      action: "confirm" as const,
      startsAt: `${year}-01-15T10:00+02:00`,
      endsAt: `${year}-01-15T11:00+02:00`,
      bufferMinutes: 0,
      propertyAccessConfirmed: true,
      externalBusyChecked: true,
      accessNotes: "Synthetic access checked",
    };
    await arrangeAppointment(t.db, f.staff.session, confirm);
    const [record] = await t.db
      .select()
      .from(appointments)
      .where(eq(appointments.id, request.outcome.id));
    expect(record?.operatingPolicySnapshot).toMatchObject({ policyId: first.outcome.policyId });
    expect(record?.confirmedPolicySnapshot).toMatchObject({ policyId: second.outcome.policyId });
    const [version] = await t.db
      .select()
      .from(appointmentVersions)
      .where(
        and(
          eq(appointmentVersions.appointmentId, request.outcome.id),
          eq(appointmentVersions.versionNumber, 2),
        ),
      );
    expect(version?.snapshot).toMatchObject({
      confirmedPolicySnapshot: { policyId: second.outcome.policyId },
    });
    await save(actor, emptyOperatingPolicy);
    await approve(actor);
    expect(
      (await t.db.select().from(appointments).where(eq(appointments.id, request.outcome.id)))[0]
        ?.confirmedPolicySnapshot,
    ).toEqual(record?.confirmedPolicySnapshot);
    const reschedule = await respondToAppointment(t.db, f.client.session, {
      id: request.outcome.id,
      expectedVersion: 2,
      operationId: randomUUID(),
      state: "reschedule_requested",
      reason: "Synthetic request for a changed time",
    });
    await expect(
      arrangeAppointment(t.db, f.staff.session, {
        ...confirm,
        expectedVersion: reschedule.outcome.version,
        operationId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { startsAt: expect.any(Array) },
    });
    await expect(
      t.db
        .update(appointments)
        .set({ confirmedPolicySnapshot: await captureOperatingPolicy(t.db) })
        .where(eq(appointments.id, request.outcome.id)),
    ).rejects.toThrow();
  });
});
