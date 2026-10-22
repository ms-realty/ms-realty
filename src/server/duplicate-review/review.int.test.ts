import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activityEvents,
  contactMethods,
  grants,
  mergeRecords,
  parties,
  passkeys,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "@/server/auth/sessions";
import { staffFixture } from "@/server/cases/testing";
import { createStaff } from "@/server/testing";
import { issueFormOperation } from "@/ui/form/server";
import {
  contactReviewStatus,
  deferContactReview,
  readContactPair,
  readDeferredContactReview,
} from "./review";
import { reviewContactFixture } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function fixture() {
  const staff = await staffFixture(t.db),
    left = await reviewContactFixture(t.db, "Synthetic contact A"),
    right = await reviewContactFixture(t.db, "Synthetic contact A alternate");
  const input = {
    left: left.party.id,
    right: right.party.id,
    leftVersion: 1,
    rightVersion: 1,
    inquiryId: left.inquiry.id,
    operationId: issueFormOperation(
      `contact-review:${staff.id}:${left.party.id}:${right.party.id}`,
    ),
    nextStep: "Verify the original source and ask the responsible broker to confirm identity",
    reviewed: true,
  };
  return { staff, left, right, input };
}
async function scopedFixture(inquiryIds: string[]) {
  const person = await createStaff(t.db, {
    grants: [
      ...inquiryIds.map((id) => ({
        capability: "inquiry.read" as const,
        recordType: "inquiry",
        recordId: id,
      })),
      { capability: "task.manage" },
    ],
  });
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: person.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  return { ...person, ...(await createSession(t.db, { kind: "staff", id: person.id })) };
}
describe("W12-T2 contact comparison and owned deferral", () => {
  it("does not call an uncommitted same-key attempt absent", async () => {
    const f = await fixture();
    let release = () => {},
      acquired = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const lockKey = JSON.stringify([
      "staff",
      f.staff.id,
      "work.contact_review.defer",
      f.input.operationId,
    ]);
    const locked = t.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      acquired();
      await held;
    });
    await ready;
    try {
      expect(
        await contactReviewStatus(
          t.db,
          f.staff.session,
          { left: f.input.left, right: f.input.right },
          f.input.operationId,
        ),
      ).toEqual({ state: "unknown" });
    } finally {
      release();
      await locked;
    }
    expect(
      await contactReviewStatus(
        t.db,
        f.staff.session,
        { left: f.input.left, right: f.input.right },
        f.input.operationId,
      ),
    ).toEqual({ state: "absent" });
  });
  it("records one review obligation on identical retry and preserves separate identities, contact evidence and grants", async () => {
    const f = await fixture();
    const beforeParties = await t.db.select().from(parties),
      beforeMethods = await t.db.select().from(contactMethods),
      beforeMerges = await t.db.select().from(mergeRecords),
      beforeGrants = await t.db.select().from(grants);
    const done = await deferContactReview(t.db, f.staff.session, f.input);
    expect(await deferContactReview(t.db, f.staff.session, f.input)).toMatchObject({
      operationId: done.operationId,
      replayed: true,
      outcome: done.outcome,
    });
    const [task] = await t.db.select().from(tasks).where(eq(tasks.id, done.outcome.taskId));
    expect(task).toMatchObject({
      ownerId: f.staff.id,
      inquiryId: f.left.inquiry.id,
      title: f.input.nextStep,
      type: "fact_verification",
      state: "open",
      promisedToClient: false,
    });
    expect(
      await t.db
        .select()
        .from(activityEvents)
        .where(eq(activityEvents.operationId, done.operationId)),
    ).toHaveLength(1);
    expect(await t.db.select().from(parties)).toEqual(beforeParties);
    expect(await t.db.select().from(contactMethods)).toEqual(beforeMethods);
    expect(await t.db.select().from(mergeRecords)).toEqual(beforeMerges);
    expect(await t.db.select().from(grants)).toEqual(beforeGrants);
    expect((await readDeferredContactReview(t.db, f.staff.session, done.operationId)).task.id).toBe(
      task?.id,
    );
    expect(
      await contactReviewStatus(
        t.db,
        f.staff.session,
        { left: f.input.left, right: f.input.right },
        f.input.operationId,
      ),
    ).toEqual({ state: "succeeded", id: done.operationId });
    await expect(
      deferContactReview(t.db, f.staff.session, {
        ...f.input,
        nextStep: "Different review commitment",
      }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  });
  it("never exposes a contact outside currently visible inquiry scope, including on successful replay", async () => {
    const f = await fixture(),
      scoped = await scopedFixture([f.left.inquiry.id]);
    await expect(
      readContactPair(t.db, scoped.session, { left: f.input.left, right: f.input.right }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(deferContactReview(t.db, scoped.session, f.input)).rejects.toMatchObject({
      code: "not_found",
    });
    await t.db.insert(grants).values({
      principalId: scoped.id,
      capability: "inquiry.read",
      recordType: "inquiry",
      recordId: f.right.inquiry.id,
      reason: "Synthetic second contact review",
    });
    const done = await deferContactReview(t.db, scoped.session, f.input);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, scoped.id), eq(grants.recordId, f.right.inquiry.id)));
    await expect(deferContactReview(t.db, scoped.session, f.input)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      readDeferredContactReview(t.db, scoped.session, done.operationId),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it("rejects forged source relation, stale party version, missing human review and the same contact twice", async () => {
    const f = await fixture();
    for (const raw of [
      { ...f.input, inquiryId: f.right.inquiry.id },
      { ...f.input, leftVersion: 99 },
      { ...f.input, reviewed: false },
      { ...f.input, right: f.input.left },
    ])
      await expect(deferContactReview(t.db, f.staff.session, raw)).rejects.toBeDefined();
    expect(await t.db.select().from(tasks).where(eq(tasks.inquiryId, f.left.inquiry.id))).toEqual(
      [],
    );
  });
});
