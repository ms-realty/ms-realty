import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activityEvents,
  cases,
  grants,
  inquiries,
  outboxEvents,
  staffMemberships,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { caseFixture, staffFixture } from "../cases/testing";
import { createTask } from "./create-task";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
const taskInput = () => ({
  operationId: randomUUID(),
  parent: null,
  title: "Review the available source material",
  purpose: "Prepare an internal review for the responsible broker.",
  type: "fact_verification" as const,
});

describe("F29 ordinary person-created internal tasks", () => {
  it("creates current-person-owned open work once and records ordinary command evidence", async () => {
    const staff = await staffFixture(t.db);
    const input = taskInput();
    const done = await createTask(t.db, staff.session, input);
    expect(done.butlerReceipt).toBeUndefined();
    expect(done.outcome).toMatchObject({
      type: "task",
      version: 1,
      state: "open",
      ownerId: staff.id,
    });
    expect(await createTask(t.db, staff.session, input)).toMatchObject({
      operationId: done.operationId,
      replayed: true,
      outcome: done.outcome,
    });
    const [row] = await t.db.select().from(tasks).where(eq(tasks.id, done.outcome.id));
    expect(row).toMatchObject({
      ownerId: staff.id,
      caseId: null,
      inquiryId: null,
      state: "open",
      promisedToClient: false,
      dueAt: null,
      completedAt: null,
    });
    for (const table of [activityEvents, outboxEvents])
      expect(
        await t.db.select().from(table).where(eq(table.operationId, done.operationId)),
      ).toHaveLength(1);
    await expect(
      createTask(t.db, staff.session, { ...input, purpose: "Different reviewed work" }),
    ).rejects.toMatchObject({
      code: "idempotency_key_reused",
    });
  });

  it("checks the exact parent version under lock and replays after its own parent change", async () => {
    const f = await caseFixture(t.db);
    const input = {
      ...taskInput(),
      parent: { type: "case" as const, id: f.record.id, expectedVersion: 1 },
    };
    const done = await createTask(t.db, f.staff.session, input);
    expect(done.outcome.parentVersion).toBe(2);
    expect((await createTask(t.db, f.staff.session, input)).outcome).toEqual(done.outcome);
    const [parent] = await t.db.select().from(cases).where(eq(cases.id, f.record.id));
    expect(parent?.version).toBe(2);
    const before = await t.db.select().from(tasks).where(eq(tasks.caseId, f.record.id));
    await expect(
      createTask(t.db, f.staff.session, { ...input, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    expect(await t.db.select().from(tasks).where(eq(tasks.caseId, f.record.id))).toHaveLength(
      before.length,
    );
  });

  it("binds an inquiry explicitly and refuses missing or unreadable parents", async () => {
    const f = await caseFixture(t.db);
    const [inquiry] = await t.db.select().from(inquiries).where(eq(inquiries.id, f.inquiry.id));
    if (!inquiry) throw new Error("Missing fixture inquiry");
    const done = await createTask(t.db, f.staff.session, {
      ...taskInput(),
      parent: { type: "inquiry", id: inquiry.id, expectedVersion: inquiry.version },
    });
    const [task] = await t.db.select().from(tasks).where(eq(tasks.id, done.outcome.id));
    expect(task).toMatchObject({ caseId: f.record.id, inquiryId: inquiry.id });
    await expect(
      createTask(t.db, f.staff.session, {
        ...taskInput(),
        parent: { type: "case", id: randomUUID(), expectedVersion: 1 },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("serializes different submissions for the same reviewed parent version", async () => {
    const f = await caseFixture(t.db);
    const before = await t.db.select().from(tasks).where(eq(tasks.caseId, f.record.id));
    const input = {
      ...taskInput(),
      parent: { type: "case" as const, id: f.record.id, expectedVersion: 1 },
    };
    const attempts = await Promise.allSettled([
      createTask(t.db, f.staff.session, input),
      createTask(t.db, f.staff.session, { ...input, operationId: randomUUID() }),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "version_conflict" },
    });
    expect(await t.db.select().from(tasks).where(eq(tasks.caseId, f.record.id))).toHaveLength(
      before.length + 1,
    );
  });

  it("denies successful replay after grants or current staff availability are revoked", async () => {
    const staff = await staffFixture(t.db);
    const input = taskInput();
    await createTask(t.db, staff.session, input);
    await t.db
      .update(staffMemberships)
      .set({ absenceFrom: new Date(), absenceReviewAt: new Date(Date.now() + 86400000) })
      .where(eq(staffMemberships.principalId, staff.id));
    await expect(createTask(t.db, staff.session, input)).rejects.toMatchObject({
      code: "transition_denied",
    });
    await t.db
      .update(staffMemberships)
      .set({ absenceFrom: null, absenceReviewAt: null })
      .where(eq(staffMemberships.principalId, staff.id));
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, staff.id));
    await expect(createTask(t.db, staff.session, input)).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
