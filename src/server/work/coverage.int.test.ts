import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { cases, grants, inquiries, principals, staffMemberships, tasks } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { offboardStaff } from "../auth/grants";
import { staffFixture } from "../cases/testing";
import { custodyFixture } from "../key-custody/testing";
import { createCase } from "../testing";
import { readCoverage } from "./coverage";
import { handoverTask } from "./handover";
import { readTask } from "./queries";

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
  const caseId = await createCase(t.db, owner.id);
  const dueAt = new Date("2026-09-29T10:00:00.000Z");
  const [task] = await t.db
    .insert(tasks)
    .values({
      title: "Synthetic coverage promise",
      caseId,
      ownerId: owner.id,
      state: "waiting",
      waitingOn: "Client documents",
      followUpAt: dueAt,
      dueAt,
      promisedToClient: true,
    })
    .returning();
  const [inquiry] = await t.db
    .insert(inquiries)
    .values({
      reference: `RQ-${randomUUID()}`,
      source: "website",
      state: "assigned",
      purpose: "question",
      submissionKey: randomUUID(),
      payloadDigest: "synthetic",
      ownerId: owner.id,
      preferredLocale: "bg",
      message: "Synthetic coverage inquiry",
      followUpAt: dueAt,
    })
    .returning();
  if (!task || !inquiry) throw new Error("Missing fixture");
  const offboard = {
    principalId: owner.id,
    expectedRevision: 1,
    operationId: randomUUID(),
    reason: "Synthetic departure, review all remaining commitments.",
    reviewed: true,
  };
  return { manager, owner, task, inquiry, caseId, offboard };
}

it("moves effective responsibility with revocation, preserves records, and clears only an accepted task", async () => {
  const f = await fixture();
  expect((await readCoverage(t.db, f.manager.session)).tasks.map((r) => r.id)).not.toContain(
    f.task.id,
  );
  expect((await offboardStaff(t.db, f.manager.session, f.offboard)).outcome).toMatchObject({
    coverageQueue: "agency",
  });
  const queue = await readCoverage(t.db, f.manager.session);
  expect(queue.cases.map((r) => r.id)).toContain(f.caseId);
  expect(queue.inquiries.map((r) => r.id)).toContain(f.inquiry.id);
  expect(queue.tasks.find((r) => r.id === f.task.id)).toMatchObject({
    dueAt: f.task.followUpAt,
    promisedToClient: true,
  });
  expect(await readTask(t.db, f.manager.session, f.task.id)).toMatchObject({
    needsCoverage: true,
    task: { ownerId: f.owner.id, version: 1 },
  });
  const receiver = await staffFixture(t.db);
  const handover = {
    id: f.task.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    action: "request",
    receiverId: receiver.id,
    reason: "Review unchanged client promise and deadline.",
    reviewed: true,
  };
  await handoverTask(t.db, f.manager.session, handover);
  expect((await readCoverage(t.db, f.manager.session)).tasks.map((r) => r.id)).toContain(f.task.id);
  await handoverTask(t.db, receiver.session, {
    ...handover,
    action: "accept",
    expectedVersion: 2,
    operationId: randomUUID(),
  });
  const after = await readCoverage(t.db, f.manager.session);
  expect(after.tasks.map((r) => r.id)).not.toContain(f.task.id);
  expect(after.cases.map((r) => r.id)).toContain(f.caseId);
  expect(after.inquiries.map((r) => r.id)).toContain(f.inquiry.id);
  expect(await readTask(t.db, receiver.session, f.task.id)).toMatchObject({
    needsCoverage: false,
    task: { dueAt: f.task.dueAt, followUpAt: f.task.followUpAt, promisedToClient: true },
  });
});

it("reflects suspension atomically and rolls back coverage with the administrative transaction", async () => {
  const f = await fixture();
  await expect(
    t.db.transaction(async (tx) => {
      await tx
        .update(staffMemberships)
        .set({ state: "suspended" })
        .where(eq(staffMemberships.principalId, f.owner.id));
      expect((await readCoverage(tx, f.manager.session)).tasks.map((r) => r.id)).toContain(
        f.task.id,
      );
      throw new Error("Synthetic administrative rollback");
    }),
  ).rejects.toThrow("Synthetic administrative rollback");
  expect((await readCoverage(t.db, f.manager.session)).tasks.map((r) => r.id)).not.toContain(
    f.task.id,
  );
  await t.db.update(principals).set({ status: "suspended" }).where(eq(principals.id, f.owner.id));
  expect((await readCoverage(t.db, f.manager.session)).tasks.map((r) => r.id)).toContain(f.task.id);
});

it("filters access before pagination, does not infer rights from access administration, and hides terminal work", async () => {
  const f = await fixture(),
    viewer = await staffFixture(t.db);
  await offboardStaff(t.db, f.manager.session, f.offboard);
  const closedId = await createCase(t.db, f.owner.id);
  await t.db
    .update(cases)
    .set({ disposition: "closed", closureOutcome: "Synthetic closure", commitmentDispositions: [] })
    .where(eq(cases.id, closedId));
  const rows = await t.db
    .insert(tasks)
    .values(
      Array.from({ length: 26 }, (_, n) => ({
        ownerId: f.owner.id,
        caseId: f.caseId,
        title: `Authorized ${n}`,
        dueAt: new Date("2026-01-01Z"),
      })),
    )
    .returning();
  await t.db.insert(tasks).values({
    ownerId: f.owner.id,
    caseId: f.caseId,
    title: "Cancelled",
    state: "cancelled",
    cancelReason: "Synthetic terminal state",
  });
  await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.principalId, viewer.id));
  await t.db.insert(grants).values({
    principalId: viewer.id,
    capability: "task.manage",
    recordType: "case",
    recordId: f.caseId,
    reason: "Synthetic scoped access",
  });
  const first = await readCoverage(t.db, viewer.session),
    second = await readCoverage(t.db, viewer.session, 2);
  expect(first).toMatchObject({ cases: [], inquiries: [], keys: [], hasMore: true });
  expect(first.tasks).toHaveLength(25);
  expect(second.tasks).toHaveLength(2);
  expect(new Set([...first.tasks, ...second.tasks].map((r) => r.id))).toEqual(
    new Set([...rows.map((r) => r.id), f.task.id]),
  );
  expect((await readCoverage(t.db, f.manager.session)).cases.map((r) => r.id)).not.toContain(
    closedId,
  );
  await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.principalId, viewer.id));
  await t.db.insert(grants).values({
    principalId: viewer.id,
    capability: "access.grant",
    reason: "Synthetic access administration only",
  });
  expect(await readCoverage(t.db, viewer.session)).toMatchObject({
    cases: [],
    tasks: [],
    inquiries: [],
    keys: [],
    hasMore: false,
  });
  await expect(readCoverage(t.db, f.owner.session)).rejects.toBeDefined();
});
