import { randomUUID } from "node:crypto";
import { and, count, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  activityEvents,
  auditEvents,
  briefRevisions,
  caseParticipants,
  cases,
  contactMethods,
  grants,
  inquiries,
  operations,
  outboxEvents,
  parties,
  sessions,
  staffMemberships,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import {
  issueSubmissionKey,
  newReceiptSession,
  readInquiryReceipt,
  submitInquiry,
} from "../inquiries/intake";
import { createCase, type GrantSpec } from "../testing";
import { acceptInquiry, changeTask } from "../work/commands";
import { readInquiry } from "../work/queries";
import { linkInquiryToExistingCase } from "./commands";
import { listInquiryCaseCandidates } from "./queries";
import { caseFixture } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

async function fixture() {
  const target = await caseFixture(t.db);
  const contact = `c02-${randomUUID()}@example.test`;
  await t.db.insert(contactMethods).values({
    partyId: target.client.partyId,
    kind: "email",
    value: contact,
    normalizedValue: contact,
  });
  const submissionKey = issueSubmissionKey(),
    receiptSession = newReceiptSession();
  const submitted = await submitInquiry(
    t.db,
    {
      submissionKey,
      purpose: "question",
      locale: "bg",
      name: "Synthetic repeat inquiry",
      contact: { kind: "email", value: contact },
      message: "Please continue the earlier conversation.",
      privacyNotice: true,
    },
    { ip: `2001:db8:${randomUUID().slice(0, 4)}::1`, receiptSession },
  );
  const [received] = await t.db
    .select()
    .from(inquiries)
    .where(eq(inquiries.submissionKey, submissionKey));
  if (!received) throw new Error("Missing received inquiry");
  await acceptInquiry(t.db, target.staff.session, {
    id: received.id,
    expectedVersion: received.version,
    operationId: randomUUID(),
    nextAction: "Review the original inquiry and call back",
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  const [inquiry] = await t.db.select().from(inquiries).where(eq(inquiries.id, received.id));
  const [task] = await t.db
    .update(tasks)
    .set({
      state: "waiting",
      waitingOn: "Synthetic client evidence",
      followUpAt: new Date(Date.now() + 43_200_000),
      dueTimezone: "Europe/Sofia",
      promisedToClient: true,
      evidenceRequired: true,
    })
    .where(eq(tasks.inquiryId, received.id))
    .returning();
  if (!inquiry || !task) throw new Error("Missing owned inquiry commitment");
  return {
    target,
    inquiry,
    task,
    submitted,
    receiptSession,
    input: {
      id: inquiry.id,
      operationId: randomUUID(),
      expectedVersion: inquiry.version,
      caseId: target.record.id,
      expectedCaseVersion: target.record.version,
    },
  };
}

async function restrict(staffId: string, specs: GrantSpec[]) {
  await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.principalId, staffId));
  await t.db.insert(grants).values(
    specs.map((spec) => ({
      ...spec,
      principalId: staffId,
      reason: "Synthetic C02 scoped access",
    })),
  );
}

async function linkGrants(f: Awaited<ReturnType<typeof fixture>>) {
  await restrict(f.target.staff.id, [
    { capability: "inquiry.read", recordType: "inquiry", recordId: f.inquiry.id },
    { capability: "inquiry.respond", recordType: "inquiry", recordId: f.inquiry.id },
    { capability: "case.read", recordType: "case", recordId: f.target.record.id },
    { capability: "case.transition", recordType: "case", recordId: f.target.record.id },
    { capability: "task.manage", recordType: "task", recordId: f.task.id },
  ]);
}

const inquirySource = ({
  caseId: _case,
  state: _state,
  version: _version,
  updatedAt: _at,
  ...row
}: typeof inquiries.$inferSelect) => row;
const taskPromise = ({
  caseId: _case,
  version: _version,
  updatedAt: _at,
  ...row
}: typeof tasks.$inferSelect) => row;

describe("C02 existing Case link / O03 safe suggestions", () => {
  it("links the original received inquiry and its exact promise without creating a Party, Case, participant or Brief", async () => {
    const f = await fixture();
    expect(f.inquiry.partyId).not.toBe(f.target.client.partyId);
    const beforeReceipt = await readInquiryReceipt(t.db, {
      submissionKey: f.inquiry.submissionKey,
      receiptSession: f.receiptSession,
    });
    const [beforeOperation] = await t.db
      .select()
      .from(operations)
      .where(eq(operations.id, f.submitted.operationId));
    const beforeCounts = await Promise.all(
      [parties, cases, caseParticipants, briefRevisions].map((table) =>
        t.db.select({ count: count() }).from(table),
      ),
    );
    await linkGrants(f);
    const linked = await linkInquiryToExistingCase(t.db, f.target.staff.session, f.input);
    expect(linked.outcome).toMatchObject({
      id: f.inquiry.id,
      reference: f.inquiry.reference,
      state: "linked_to_case",
      version: f.inquiry.version + 1,
      caseId: f.target.record.id,
      caseVersion: 2,
    });
    const [after] = await t.db.select().from(inquiries).where(eq(inquiries.id, f.inquiry.id));
    const [commitment] = await t.db.select().from(tasks).where(eq(tasks.id, f.task.id));
    if (!after || !commitment) throw new Error("Missing linked records");
    expect(inquirySource(after)).toEqual(inquirySource(f.inquiry));
    expect(taskPromise(commitment)).toEqual(taskPromise(f.task));
    expect(commitment).toMatchObject({ caseId: f.target.record.id, version: f.task.version + 1 });
    expect((await readInquiry(t.db, f.target.staff.session, f.inquiry.id)).tasks).toHaveLength(1);
    expect(
      await readInquiryReceipt(t.db, {
        submissionKey: f.inquiry.submissionKey,
        receiptSession: f.receiptSession,
      }),
    ).toEqual(beforeReceipt);
    expect(
      await t.db.select().from(operations).where(eq(operations.id, f.submitted.operationId)),
    ).toEqual([beforeOperation]);
    expect(
      await Promise.all(
        [parties, cases, caseParticipants, briefRevisions].map((table) =>
          t.db.select({ count: count() }).from(table),
        ),
      ),
    ).toEqual(beforeCounts);
    const replay = await linkInquiryToExistingCase(t.db, f.target.staff.session, f.input);
    expect(replay).toEqual({ ...linked, replayed: true });
    await expect(
      linkInquiryToExistingCase(t.db, f.target.staff.session, {
        ...f.input,
        expectedCaseVersion: 2,
      }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    for (const table of [activityEvents, auditEvents, outboxEvents])
      expect(
        await t.db.select().from(table).where(eq(table.operationId, linked.operationId)),
      ).toHaveLength(3);
  });

  it("filters inaccessible Cases before its limit and returns no matching Party or contact data", async () => {
    const f = await fixture();
    const hidden = await t.db
      .insert(cases)
      .values(
        Array.from({ length: 51 }, () => ({
          reference: `CS-C02-${randomUUID()}`,
          kind: "buyer" as const,
          stage: "needs_agreed",
          title: "Hidden synthetic Case",
          ownerId: f.target.staff.id,
          nextAction: "Hidden synthetic action",
        })),
      )
      .returning({ id: cases.id });
    await t.db.insert(caseParticipants).values(
      hidden.map((row) => ({
        caseId: row.id,
        partyId: f.target.client.partyId,
        role: "buyer" as const,
      })),
    );
    await linkGrants(f);
    const candidates = await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id);
    expect(candidates).toEqual([
      {
        id: f.target.record.id,
        reference: f.target.record.reference,
        version: 1,
        title: "Synthetic buyer case",
        kind: "buyer",
        stage: "needs_agreed",
        matchBasis: "contact_route",
        partyLabel: null,
        canLink: true,
        blockReason: null,
      },
    ]);
    await expect(
      linkInquiryToExistingCase(t.db, f.target.staff.session, {
        ...f.input,
        caseId: hidden[0]?.id ?? randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      listInquiryCaseCandidates(t.db, f.target.client.session, f.inquiry.id),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      listInquiryCaseCandidates(t.db, f.target.staff.session, randomUUID()),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("shows exact Party suggestions once, and excludes expired, revoked, future and merged relationships", async () => {
    const f = await fixture();
    await t.db
      .update(inquiries)
      .set({ partyId: f.target.client.partyId, contactMethodId: null })
      .where(eq(inquiries.id, f.inquiry.id));
    const [party] = await t.db
      .select({ label: parties.displayName })
      .from(parties)
      .where(eq(parties.id, f.target.client.partyId));
    expect(await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id)).toEqual([
      expect.objectContaining({
        id: f.target.record.id,
        matchBasis: "party",
        partyLabel: party?.label,
        blockReason: null,
      }),
    ]);
    await t.db
      .insert(caseParticipants)
      .values({ caseId: f.target.record.id, partyId: f.target.client.partyId, role: "co_buyer" });
    expect(
      await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id),
    ).toHaveLength(1);
    for (const patch of [
      { revokedAt: new Date() },
      { revokedAt: null, expiresAt: new Date(Date.now() - 60_000) },
      { expiresAt: null, validFrom: new Date(Date.now() + 60_000) },
    ]) {
      await t.db
        .update(caseParticipants)
        .set(patch)
        .where(eq(caseParticipants.caseId, f.target.record.id));
      expect(await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id)).toEqual(
        [],
      );
    }
    await t.db
      .update(caseParticipants)
      .set({ validFrom: new Date(Date.now() - 60_000) })
      .where(eq(caseParticipants.caseId, f.target.record.id));
    await t.db
      .update(parties)
      .set({ mergedIntoPartyId: f.inquiry.partyId })
      .where(eq(parties.id, f.target.client.partyId));
    expect(await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id)).toEqual([]);
  });

  it.each(["expired", "revoked"] as const)(
    "keeps a contact-route suggestion anonymous when same-Party participation is %s",
    async (ended) => {
      const f = await fixture();
      const [route] = await t.db
        .select({ id: contactMethods.id })
        .from(contactMethods)
        .where(eq(contactMethods.partyId, f.target.client.partyId));
      if (!route || !f.inquiry.partyId) throw new Error("Missing synthetic contact-route Party");
      await t.db
        .update(inquiries)
        .set({ partyId: f.target.client.partyId, contactMethodId: route.id })
        .where(eq(inquiries.id, f.inquiry.id));
      await t.db.insert(caseParticipants).values({
        caseId: f.target.record.id,
        partyId: f.inquiry.partyId,
        role: "co_buyer",
      });
      expect(await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id)).toEqual([
        expect.objectContaining({ matchBasis: "party", partyLabel: "Test Client" }),
      ]);
      await t.db
        .update(caseParticipants)
        .set(
          ended === "expired"
            ? { expiresAt: new Date(Date.now() - 60_000) }
            : { revokedAt: new Date() },
        )
        .where(
          and(
            eq(caseParticipants.caseId, f.target.record.id),
            eq(caseParticipants.partyId, f.target.client.partyId),
          ),
        );
      expect(await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id)).toEqual([
        expect.objectContaining({
          matchBasis: "contact_route",
          partyLabel: null,
          canLink: true,
          blockReason: null,
        }),
      ]);
    },
  );

  it("rechecks revoked target read/transition authority before mutation and on same-key replay", async () => {
    const f = await fixture();
    await linkGrants(f);
    expect(
      await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id),
    ).toHaveLength(1);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(grants.principalId, f.target.staff.id), eq(grants.capability, "case.transition")),
      );
    expect(await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id)).toEqual([
      expect.objectContaining({ canLink: false, blockReason: "case_permission" }),
    ]);
    await expect(
      linkInquiryToExistingCase(t.db, f.target.staff.session, f.input),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(
      await t.db
        .select()
        .from(operations)
        .where(eq(operations.idempotencyKey, f.input.operationId)),
    ).toEqual([]);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, f.target.staff.id), eq(grants.capability, "case.read")));
    expect(await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id)).toEqual([]);
    await expect(
      linkInquiryToExistingCase(t.db, f.target.staff.session, f.input),
    ).rejects.toMatchObject({ code: "not_found" });
    await linkGrants(f);
    await linkInquiryToExistingCase(t.db, f.target.staff.session, f.input);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, f.target.staff.id), eq(grants.capability, "case.read")));
    await expect(
      linkInquiryToExistingCase(t.db, f.target.staff.session, f.input),
    ).rejects.toMatchObject({ code: "not_found" });
    const [after] = await t.db.select().from(inquiries).where(eq(inquiries.id, f.inquiry.id));
    expect(after).toMatchObject({ caseId: f.target.record.id, version: 3 });
  });

  it("denies stale inquiry and Case versions without associating a task", async () => {
    const f = await fixture();
    await expect(
      linkInquiryToExistingCase(t.db, f.target.staff.session, { ...f.input, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "version_conflict", current: { version: 2 } });
    await t.db.update(cases).set({ version: 2 }).where(eq(cases.id, f.target.record.id));
    const input = { ...f.input, operationId: randomUUID() };
    await expect(
      linkInquiryToExistingCase(t.db, f.target.staff.session, input),
    ).rejects.toMatchObject({ code: "version_conflict", current: { caseVersion: 2 } });
    await expect(
      linkInquiryToExistingCase(t.db, f.target.staff.session, input),
    ).rejects.toMatchObject({ code: "version_conflict", current: { caseVersion: 2 } });
    expect(await t.db.select().from(tasks).where(eq(tasks.id, f.task.id))).toEqual([f.task]);
    expect(await t.db.select().from(inquiries).where(eq(inquiries.id, f.inquiry.id))).toEqual([
      f.inquiry,
    ]);
    for (const table of [activityEvents, auditEvents, outboxEvents])
      expect(
        await t.db
          .select()
          .from(table)
          .where(
            eq(
              table.operationId,
              (
                await t.db
                  .select()
                  .from(operations)
                  .where(eq(operations.idempotencyKey, input.operationId))
              )[0]?.id ?? randomUUID(),
            ),
          ),
      ).toHaveLength(0);
  });

  it.each(["paused", "closed"] as const)(
    "denies a %s Case and excludes it from suggestions",
    async (disposition) => {
      const f = await fixture();
      await t.db
        .update(cases)
        .set({
          disposition,
          dispositionReason: "Synthetic disposition",
          waitingOn: "Synthetic dependency",
          reviewAt: new Date(Date.now() + 86_400_000),
          closureOutcome: "Synthetic outcome",
          commitmentDispositions: [],
        })
        .where(eq(cases.id, f.target.record.id));
      expect(await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id)).toEqual(
        [],
      );
      await expect(
        linkInquiryToExistingCase(t.db, f.target.staff.session, f.input),
      ).rejects.toMatchObject({ code: "transition_denied" });
    },
  );

  it("does not reveal hidden inquiry tasks or replace another Case's task association", async () => {
    const f = await fixture();
    await linkGrants(f);
    const candidates = await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id);
    expect(candidates).toEqual([expect.objectContaining({ canLink: true })]);
    const inquiryDenied = candidates.map((candidate) => ({
      ...candidate,
      canLink: false,
      blockReason: "inquiry_permission",
    }));
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, f.target.staff.id), eq(grants.capability, "task.manage")));
    expect((await readInquiry(t.db, f.target.staff.session, f.inquiry.id)).tasks).toEqual([]);
    expect(await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id)).toEqual(
      inquiryDenied,
    );
    await expect(
      linkInquiryToExistingCase(t.db, f.target.staff.session, f.input),
    ).rejects.toMatchObject({ code: "forbidden" });
    await linkGrants(f);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(grants.principalId, f.target.staff.id), eq(grants.capability, "inquiry.respond")),
      );
    expect(
      (await readInquiry(t.db, f.target.staff.session, f.inquiry.id)).tasks.map(
        ({ task }) => task.id,
      ),
    ).toEqual([f.task.id]);
    // The candidate response is identical for inquiry and hidden-task refusals.
    expect(await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id)).toEqual(
      inquiryDenied,
    );
    await expect(
      linkInquiryToExistingCase(t.db, f.target.staff.session, f.input),
    ).rejects.toMatchObject({ code: "forbidden" });
    await linkGrants(f);
    const otherCaseId = await createCase(t.db, f.target.staff.id);
    const [bound] = await t.db
      .update(tasks)
      .set({ caseId: otherCaseId })
      .where(eq(tasks.id, f.task.id))
      .returning();
    expect(await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id)).toEqual(
      candidates.map((candidate) => ({
        ...candidate,
        canLink: false,
        blockReason: "task_case_conflict",
      })),
    );
    await expect(
      linkInquiryToExistingCase(t.db, f.target.staff.session, {
        ...f.input,
        operationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    expect(await t.db.select().from(inquiries).where(eq(inquiries.id, f.inquiry.id))).toEqual([
      f.inquiry,
    ]);
    expect(await t.db.select().from(tasks).where(eq(tasks.id, f.task.id))).toEqual([bound]);
  });

  it("reports task permission only when current task authority passed and proposed Case authority fails", async () => {
    const f = await fixture();
    await linkGrants(f);
    const currentCaseId = await createCase(t.db, f.target.staff.id);
    const [bound] = await t.db
      .update(tasks)
      .set({ caseId: currentCaseId })
      .where(eq(tasks.id, f.task.id))
      .returning();
    await t.db
      .update(grants)
      .set({ recordType: "case", recordId: currentCaseId })
      .where(and(eq(grants.principalId, f.target.staff.id), eq(grants.capability, "task.manage")));
    expect(
      (await readInquiry(t.db, f.target.staff.session, f.inquiry.id)).tasks.map(
        ({ task }) => task.id,
      ),
    ).toEqual([f.task.id]);
    expect(await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id)).toEqual([
      expect.objectContaining({ canLink: false, blockReason: "task_permission" }),
    ]);
    await expect(
      linkInquiryToExistingCase(t.db, f.target.staff.session, f.input),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await t.db.select().from(tasks).where(eq(tasks.id, f.task.id))).toEqual([bound]);
    expect(await t.db.select().from(inquiries).where(eq(inquiries.id, f.inquiry.id))).toEqual([
      f.inquiry,
    ]);
  });

  it("reports an inquiry state that cannot link and preserves the refused inquiry", async () => {
    const f = await fixture();
    const [resolved] = await t.db
      .update(inquiries)
      .set({ state: "resolved_without_case", dispositionReason: "Synthetic inquiry resolution" })
      .where(eq(inquiries.id, f.inquiry.id))
      .returning();
    expect(await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id)).toEqual([
      expect.objectContaining({ canLink: false, blockReason: "inquiry_state" }),
    ]);
    await expect(
      linkInquiryToExistingCase(t.db, f.target.staff.session, f.input),
    ).rejects.toMatchObject({ code: "transition_denied" });
    expect(await t.db.select().from(inquiries).where(eq(inquiries.id, f.inquiry.id))).toEqual([
      resolved,
    ]);
    expect(await t.db.select().from(tasks).where(eq(tasks.id, f.task.id))).toEqual([f.task]);
  });

  it("reports staff unavailability without granting link authority", async () => {
    const f = await fixture();
    await t.db
      .update(staffMemberships)
      .set({
        absenceFrom: new Date(Date.now() - 60_000),
        absenceReviewAt: new Date(Date.now() + 86_400_000),
      })
      .where(eq(staffMemberships.principalId, f.target.staff.id));
    expect(await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id)).toEqual([
      expect.objectContaining({ canLink: false, blockReason: "staff_unavailable" }),
    ]);
    await expect(
      linkInquiryToExistingCase(t.db, f.target.staff.session, f.input),
    ).rejects.toMatchObject({ code: "transition_denied" });
    expect(await t.db.select().from(inquiries).where(eq(inquiries.id, f.inquiry.id))).toEqual([
      f.inquiry,
    ]);
    expect(await t.db.select().from(tasks).where(eq(tasks.id, f.task.id))).toEqual([f.task]);
  });

  it("concurrent different target choices converge on one association and one preserved task", async () => {
    const f = await fixture();
    const otherCaseId = await createCase(t.db, f.target.staff.id);
    const attempts = await Promise.allSettled([
      linkInquiryToExistingCase(t.db, f.target.staff.session, f.input),
      linkInquiryToExistingCase(t.db, f.target.staff.session, {
        ...f.input,
        operationId: randomUUID(),
        caseId: otherCaseId,
      }),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "version_conflict" },
    });
    const [after] = await t.db.select().from(inquiries).where(eq(inquiries.id, f.inquiry.id));
    const [commitment] = await t.db.select().from(tasks).where(eq(tasks.id, f.task.id));
    if (!after || !commitment) throw new Error("Missing linked records");
    expect([f.target.record.id, otherCaseId]).toContain(after.caseId);
    expect(commitment.caseId).toBe(after.caseId);
    expect(taskPromise(commitment)).toEqual(taskPromise(f.task));
    expect(
      await t.db
        .select()
        .from(cases)
        .where(and(inArray(cases.id, [f.target.record.id, otherCaseId]), eq(cases.version, 2))),
    ).toHaveLength(1);
  });

  it("concurrent same-key submissions reconcile to one receipt, activity set and task version", async () => {
    const f = await fixture();
    const attempts = await Promise.allSettled([
      linkInquiryToExistingCase(t.db, f.target.staff.session, f.input),
      linkInquiryToExistingCase(t.db, f.target.staff.session, f.input),
    ]);
    expect(attempts.some((result) => result.status === "fulfilled")).toBe(true);
    for (const result of attempts)
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ code: "operation_pending" });
    const replay = await linkInquiryToExistingCase(t.db, f.target.staff.session, f.input);
    expect(replay.replayed).toBe(true);
    expect(
      await t.db
        .select()
        .from(operations)
        .where(eq(operations.idempotencyKey, f.input.operationId)),
    ).toHaveLength(1);
    expect(await t.db.select().from(tasks).where(eq(tasks.id, f.task.id))).toEqual([
      { ...f.task, caseId: f.target.record.id, version: 2, updatedAt: expect.any(Date) },
    ]);
    expect(
      await t.db
        .select()
        .from(activityEvents)
        .where(eq(activityEvents.operationId, replay.operationId)),
    ).toHaveLength(3);
  });

  it("a concurrent task edit is preserved or rejected as stale after linking", async () => {
    const f = await fixture();
    const [link, edit] = await Promise.allSettled([
      linkInquiryToExistingCase(t.db, f.target.staff.session, f.input),
      changeTask(t.db, f.target.staff.session, {
        id: f.task.id,
        operationId: randomUUID(),
        expectedVersion: f.task.version,
        state: "in_progress",
        note: "Synthetic current task work",
      }),
    ]);
    expect(link.status).toBe("fulfilled");
    const [commitment] = await t.db.select().from(tasks).where(eq(tasks.id, f.task.id));
    expect(commitment).toMatchObject({
      caseId: f.target.record.id,
      promisedToClient: true,
      dueAt: f.task.dueAt,
      followUpAt: f.task.followUpAt,
      dueTimezone: f.task.dueTimezone,
    });
    if (edit.status === "fulfilled")
      expect(commitment).toMatchObject({ state: "in_progress", version: 3 });
    else {
      expect(edit.reason).toMatchObject({ code: "version_conflict" });
      expect(commitment).toMatchObject({ state: "waiting", version: 2 });
    }
  });

  it("denies a revoked session even for a previously successful key", async () => {
    const f = await fixture();
    await linkInquiryToExistingCase(t.db, f.target.staff.session, f.input);
    await t.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, f.target.staff.session.id));
    await expect(
      linkInquiryToExistingCase(t.db, f.target.staff.session, f.input),
    ).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(
      listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it.each(["session", "case.read", "inquiry.respond"] as const)(
    "rechecks a revoked %s after waiting for the target Case lock",
    async (authority) => {
      const f = await fixture();
      await linkGrants(f);
      let release!: () => void, locked!: () => void;
      const lockAcquired = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const releaseLock = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocker = t.db.transaction(async (tx) => {
        await tx.select().from(cases).where(eq(cases.id, f.target.record.id)).for("update");
        locked();
        await releaseLock;
      });
      await lockAcquired;
      const attempt = linkInquiryToExistingCase(t.db, f.target.staff.session, f.input).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      try {
        await vi.waitFor(
          async () => {
            const [row] = await t.sql<{ waiting: number }[]>`
            select count(*)::int as waiting from pg_stat_activity
            where datname = current_database() and wait_event_type = 'Lock'
              and query ilike '%cases%' and query ilike '%for update%'
          `;
            expect(row?.waiting).toBeGreaterThan(0);
          },
          { interval: 10, timeout: 3000 },
        );
        if (authority === "session")
          await t.db
            .update(sessions)
            .set({ revokedAt: new Date() })
            .where(eq(sessions.id, f.target.staff.session.id));
        else
          await t.db
            .update(grants)
            .set({ revokedAt: new Date() })
            .where(
              and(eq(grants.principalId, f.target.staff.id), eq(grants.capability, authority)),
            );
      } finally {
        release();
        await blocker;
      }
      expect(await attempt).toMatchObject({
        error: {
          code:
            authority === "session"
              ? "unauthenticated"
              : authority === "case.read"
                ? "not_found"
                : "forbidden",
        },
      });
      expect(await t.db.select().from(inquiries).where(eq(inquiries.id, f.inquiry.id))).toEqual([
        f.inquiry,
      ]);
      expect(await t.db.select().from(tasks).where(eq(tasks.id, f.task.id))).toEqual([f.task]);
      expect(await t.db.select().from(cases).where(eq(cases.id, f.target.record.id))).toEqual([
        expect.objectContaining({ version: 1 }),
      ]);
    },
  );

  it("requires the inquiry owner to make the human choice, including a duplicate candidate", async () => {
    const f = await fixture();
    await t.db
      .update(inquiries)
      .set({
        state: "duplicate_candidate",
        duplicateOfInquiryId: f.target.inquiry.id,
        ownerId: f.target.client.id,
      })
      .where(eq(inquiries.id, f.inquiry.id));
    expect(await listInquiryCaseCandidates(t.db, f.target.staff.session, f.inquiry.id)).toEqual([
      expect.objectContaining({ canLink: false, blockReason: "inquiry_owner" }),
    ]);
    await expect(
      linkInquiryToExistingCase(t.db, f.target.staff.session, f.input),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await t.db
      .update(inquiries)
      .set({ ownerId: f.target.staff.id })
      .where(eq(inquiries.id, f.inquiry.id));
    await linkInquiryToExistingCase(t.db, f.target.staff.session, {
      ...f.input,
      operationId: randomUUID(),
    });
    expect(await t.db.select().from(inquiries).where(eq(inquiries.id, f.inquiry.id))).toEqual([
      expect.objectContaining({
        state: "linked_to_case",
        duplicateOfInquiryId: f.target.inquiry.id,
        partyId: f.inquiry.partyId,
      }),
    ]);
  });
});
