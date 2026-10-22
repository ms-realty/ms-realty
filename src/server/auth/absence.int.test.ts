import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { auditEvents, cases, sessions, staffMemberships, tasks } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { staffFixture } from "../cases/testing";
import { custodyHolders } from "../key-custody/service";
import { custodyFixture } from "../key-custody/testing";
import { createCase } from "../testing";
import { readCoverage } from "../work/coverage";
import { handoverTask, readTaskHandover } from "../work/handover";
import { changeStaffAbsence, readStaffAbsence } from "./absence";
import { requireAvailableStaff } from "./availability";
import { readSession } from "./sessions";

let t: TestDatabase;
beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  await t?.drop();
});
const schedule = (principalId: string) => ({
  operationId: randomUUID(),
  principalId,
  action: "schedule",
  expectedRevision: 1,
  startsAt: null,
  reviewAt: new Date(Date.now() + 86400000).toISOString(),
  reason: "Arrange coverage of all outstanding client commitments.",
  reviewed: true,
});

it("puts absent staff work in coverage atomically, keeps sign-in and restores only remaining ownership on return", async () => {
  const manager = await custodyFixture(t.db),
    owner = await staffFixture(t.db);
  const caseId = await createCase(t.db, owner.id);
  const [task] = await t.db
    .insert(tasks)
    .values({
      caseId,
      ownerId: owner.id,
      title: "Synthetic promised follow-up",
      promisedToClient: true,
      dueAt: new Date(Date.now() + 86400000),
    })
    .returning();
  if (!task) throw new Error("Missing task");
  const input = schedule(owner.id);
  const result = await changeStaffAbsence(t.db, manager.session, input);
  expect((await changeStaffAbsence(t.db, manager.session, input)).operationId).toBe(
    result.operationId,
  );
  expect((await readCoverage(t.db, manager.session)).cases.map((r) => r.id)).toContain(caseId);
  expect((await readCoverage(t.db, manager.session)).tasks.map((r) => r.id)).toContain(task.id);
  expect(await readSession(t.db, owner.token)).not.toBeNull();
  expect(await t.db.select().from(tasks).where(eq(tasks.id, task.id))).toEqual([task]);
  await expect(requireAvailableStaff(t.db, owner.id, true)).rejects.toMatchObject({
    code: "transition_denied",
  });
  expect((await custodyHolders(t.db, manager.session)).map((r) => r.id)).not.toContain(owner.id);
  const receiver = await staffFixture(t.db);
  const handover = {
    id: task.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    action: "request",
    receiverId: receiver.id,
    reason: "Accept unchanged promise and deadline.",
    reviewed: true,
  };
  await handoverTask(t.db, manager.session, handover);
  await handoverTask(t.db, receiver.session, {
    ...handover,
    action: "accept",
    expectedVersion: 2,
    operationId: randomUUID(),
    nextAction: "Confirm the retained client promise",
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  await changeStaffAbsence(t.db, manager.session, {
    ...input,
    operationId: randomUUID(),
    action: "return",
    expectedRevision: 2,
    reviewAt: null,
  });
  const [after] = await t.db.select().from(tasks).where(eq(tasks.id, task.id));
  expect(after).toMatchObject({ ownerId: receiver.id, dueAt: task.dueAt, promisedToClient: true });
  expect((await t.db.select().from(cases).where(eq(cases.id, caseId)))[0]?.ownerId).toBe(owner.id);
  expect((await readCoverage(t.db, manager.session)).cases.map((r) => r.id)).not.toContain(caseId);
  await expect(requireAvailableStaff(t.db, owner.id)).resolves.toBeUndefined();
  expect(
    await t.db.select().from(auditEvents).where(eq(auditEvents.operationId, result.operationId)),
  ).toHaveLength(1);
});

it("activates a scheduled absence at its start and never infers return from the review deadline", async () => {
  const manager = await custodyFixture(t.db),
    owner = await staffFixture(t.db);
  const caseId = await createCase(t.db, owner.id);
  await changeStaffAbsence(t.db, manager.session, {
    ...schedule(owner.id),
    startsAt: new Date(Date.now() + 3600000).toISOString(),
  });
  expect((await readCoverage(t.db, manager.session)).cases.map((r) => r.id)).not.toContain(caseId);
  await requireAvailableStaff(t.db, owner.id);
  // Advance the stored schedule across both boundaries without sleeping or mocking SQL time.
  await t.db
    .update(staffMemberships)
    .set({
      absenceFrom: new Date(Date.now() - 7200000),
      absenceReviewAt: new Date(Date.now() - 3600000),
    })
    .where(eq(staffMemberships.principalId, owner.id));
  expect((await readCoverage(t.db, manager.session)).cases.map((r) => r.id)).toContain(caseId);
  await expect(requireAvailableStaff(t.db, owner.id)).rejects.toMatchObject({
    code: "transition_denied",
  });
});

it("rejects handover acceptance when its proposed receiver becomes absent, retaining the original owner", async () => {
  const manager = await custodyFixture(t.db),
    owner = await staffFixture(t.db),
    receiver = await staffFixture(t.db);
  const [task] = await t.db
    .insert(tasks)
    .values({ ownerId: owner.id, title: "Retained promise" })
    .returning();
  if (!task) throw new Error("Missing task");
  const input = {
    id: task.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    action: "request",
    receiverId: receiver.id,
    reason: "Review retained commitments before accepting.",
    reviewed: true,
  };
  await handoverTask(t.db, manager.session, input);
  await changeStaffAbsence(t.db, manager.session, schedule(receiver.id));
  expect(
    (await readTaskHandover(t.db, manager.session, task.id)).receivers.map((r) => r.id),
  ).not.toContain(receiver.id);
  await expect(
    handoverTask(t.db, receiver.session, {
      ...input,
      action: "accept",
      expectedVersion: 2,
      operationId: randomUUID(),
      nextAction: "Confirm the retained client promise",
      dueAt: new Date(Date.now() + 3_600_000).toISOString(),
    }),
  ).rejects.toMatchObject({ code: "forbidden" });
  expect((await t.db.select().from(tasks).where(eq(tasks.id, task.id)))[0]).toMatchObject({
    ownerId: owner.id,
    pendingOwnerId: receiver.id,
    version: 2,
  });
});

it("keeps an available access manager beyond planned absences and rolls failed changes back", async () => {
  const sole = await custodyFixture(t.db);
  await expect(changeStaffAbsence(t.db, sole.session, schedule(sole.id))).rejects.toMatchObject({
    code: "transition_denied",
  });
  expect((await readStaffAbsence(t.db, sole.session, sole.id)).person).toMatchObject({
    absenceFrom: null,
    version: 1,
  });
  const backup = await custodyFixture(t.db);
  await changeStaffAbsence(t.db, sole.session, {
    ...schedule(backup.id),
    startsAt: new Date(Date.now() + 3600000).toISOString(),
  });
  await expect(changeStaffAbsence(t.db, sole.session, schedule(sole.id))).rejects.toMatchObject({
    code: "transition_denied",
  });
  expect((await readStaffAbsence(t.db, sole.session, sole.id)).person).toMatchObject({
    absenceFrom: null,
    version: 1,
  });
});

it("requires live step-up and review, rejects stale revisions and preserves transaction rollback", async () => {
  const manager = await custodyFixture(t.db),
    owner = await staffFixture(t.db);
  const input = schedule(owner.id);
  await expect(changeStaffAbsence(t.db, owner.session, input)).rejects.toMatchObject({
    code: "not_found",
  });
  await expect(
    changeStaffAbsence(t.db, manager.session, { ...input, reviewed: false }),
  ).rejects.toMatchObject({ code: "validation_failed" });
  await expect(
    t.db.transaction(async (tx) => {
      await changeStaffAbsence(tx, manager.session, input);
      throw new Error("rollback absence");
    }),
  ).rejects.toThrow("rollback absence");
  expect((await readStaffAbsence(t.db, manager.session, owner.id)).person).toMatchObject({
    absenceFrom: null,
    version: 1,
  });
  await changeStaffAbsence(t.db, manager.session, input);
  await expect(
    changeStaffAbsence(t.db, manager.session, {
      ...input,
      operationId: randomUUID(),
      action: "return",
      reviewAt: null,
    }),
  ).rejects.toMatchObject({ code: "version_conflict" });
  await t.db
    .update(sessions)
    .set({ reverifiedAt: new Date(Date.now() - 3600000) })
    .where(eq(sessions.id, manager.session.id));
  await expect(changeStaffAbsence(t.db, manager.session, input)).rejects.toMatchObject({
    code: "step_up_required",
  });
});
