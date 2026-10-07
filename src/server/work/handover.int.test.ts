import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { auditEvents, passkeys, tasks } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { offboardStaff } from "../auth/grants";
import { staffFixture } from "../cases/testing";
import { custodyFixture } from "../key-custody/testing";
import { createCase } from "../testing";
import { changeTask } from "./commands";
import { handoverTask, readTaskHandover } from "./handover";
import { listTasks } from "./queries";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

async function fixture() {
  const manager = await custodyFixture(t.db),
    owner = await staffFixture(t.db),
    receiver = await staffFixture(t.db);
  const caseId = await createCase(t.db, owner.id);
  const dueAt = new Date(Date.now() + 86400000);
  const [task] = await t.db
    .insert(tasks)
    .values({
      title: "Synthetic promised follow-up",
      ownerId: owner.id,
      caseId,
      state: "waiting",
      waitingOn: "Client evidence",
      followUpAt: dueAt,
      dueAt,
      dueTimezone: "Europe/Sofia",
      promisedToClient: true,
      evidenceRequired: true,
    })
    .returning();
  if (!task) throw new Error("Missing task fixture");
  const input = {
    id: task.id,
    operationId: randomUUID(),
    expectedVersion: task.version,
    action: "request",
    receiverId: receiver.id,
    reason: "Reviewed commitments and receiving colleague.",
    reviewed: true,
  };
  return { manager, owner, receiver, task, input };
}

it("transfers one departed colleague's task only after the named receiver accepts, preserving promises and replay", async () => {
  const f = await fixture();
  await offboardStaff(t.db, f.manager.session, {
    operationId: randomUUID(),
    principalId: f.owner.id,
    expectedRevision: 1,
    reason: "Synthetic departure with outstanding handover.",
    reviewed: true,
  });
  await handoverTask(t.db, f.manager.session, f.input);
  expect(
    (await listTasks(t.db, f.receiver.session, { awaitingAcceptance: true })).rows.map(
      (row) => row.task.id,
    ),
  ).toContain(f.task.id);
  expect(
    (await listTasks(t.db, f.manager.session, { awaitingAcceptance: true })).rows.map(
      (row) => row.task.id,
    ),
  ).not.toContain(f.task.id);
  expect((await readTaskHandover(t.db, f.manager.session, f.task.id)).task).toMatchObject({
    ownerId: f.owner.id,
    pendingOwnerId: f.receiver.id,
    version: 2,
  });
  const reviewAt = new Date(Date.now() + 3_600_000);
  const accept = {
    ...f.input,
    operationId: randomUUID(),
    expectedVersion: 2,
    action: "accept",
    nextAction: "Review the evidence and call the client",
    dueAt: reviewAt.toISOString(),
  };
  await expect(handoverTask(t.db, f.manager.session, accept)).rejects.toMatchObject({
    code: "forbidden",
  });
  const result = await handoverTask(t.db, f.receiver.session, accept);
  expect((await handoverTask(t.db, f.receiver.session, accept)).operationId).toBe(
    result.operationId,
  );
  const [after] = await t.db.select().from(tasks).where(eq(tasks.id, f.task.id));
  expect(after).toMatchObject({
    ownerId: f.receiver.id,
    pendingOwnerId: null,
    version: 3,
    state: "waiting",
    waitingOn: f.task.waitingOn,
    dueAt: f.task.dueAt,
    followUpAt: reviewAt,
    dueTimezone: "Europe/Sofia",
    title: accept.nextAction,
    promisedToClient: true,
    evidenceRequired: true,
    completedAt: null,
    caseId: f.task.caseId,
  });
  expect(
    await t.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.recordId, f.task.id),
          eq(auditEvents.action, "work.task.handover.accept"),
        ),
      ),
  ).toHaveLength(1);
  await changeTask(t.db, f.receiver.session, {
    id: f.task.id,
    operationId: randomUUID(),
    expectedVersion: 3,
    state: "in_progress",
    note: "The receiver started the recorded next action.",
  });
  const [progress] = await t.db.select().from(tasks).where(eq(tasks.id, f.task.id));
  expect(progress).toMatchObject({ dueAt: f.task.dueAt, followUpAt: reviewAt });
});

it("requires acknowledgement and current revision, cannot replace a pending receiver, and cancels without transferring", async () => {
  const f = await fixture();
  await expect(
    handoverTask(t.db, f.manager.session, { ...f.input, reviewed: false }),
  ).rejects.toMatchObject({ code: "validation_failed" });
  await handoverTask(t.db, f.manager.session, f.input);
  await expect(
    handoverTask(t.db, f.receiver.session, {
      ...f.input,
      operationId: randomUUID(),
      action: "accept",
      nextAction: "Review the evidence and call the client",
      dueAt: new Date(Date.now() + 3_600_000).toISOString(),
    }),
  ).rejects.toMatchObject({ code: "version_conflict" });
  await expect(
    handoverTask(t.db, f.manager.session, {
      ...f.input,
      operationId: randomUUID(),
      expectedVersion: 2,
    }),
  ).rejects.toMatchObject({ code: "transition_denied" });
  await expect(
    handoverTask(t.db, f.receiver.session, {
      ...f.input,
      operationId: randomUUID(),
      expectedVersion: 2,
      action: "cancel",
    }),
  ).rejects.toMatchObject({ code: "forbidden" });
  await handoverTask(t.db, f.manager.session, {
    ...f.input,
    operationId: randomUUID(),
    expectedVersion: 2,
    action: "cancel",
  });
  const senderView = await readTaskHandover(t.db, f.manager.session, f.task.id);
  const receiverView = await readTaskHandover(t.db, f.receiver.session, f.task.id);
  expect(senderView.task).toMatchObject({
    ownerId: f.owner.id,
    pendingOwnerId: null,
    version: 3,
  });
  expect(senderView.latestDecision).toMatchObject({
    kind: "cancelled",
    actorId: f.manager.id,
    receiverId: f.receiver.id,
    reason: f.input.reason,
  });
  expect(receiverView.latestDecision).toEqual(senderView.latestDecision);
});

it("allows only the nominated receiver to decline, then shows the saved reason to both sides", async () => {
  const f = await fixture();
  await handoverTask(t.db, f.manager.session, f.input);
  const decline = {
    ...f.input,
    operationId: randomUUID(),
    expectedVersion: 2,
    action: "decline",
    reason: "I cannot take this work with the current commitments.",
  };
  await expect(handoverTask(t.db, f.manager.session, decline)).rejects.toMatchObject({
    code: "forbidden",
  });
  const result = await handoverTask(t.db, f.receiver.session, decline);
  expect((await handoverTask(t.db, f.receiver.session, decline)).operationId).toBe(
    result.operationId,
  );
  const senderView = await readTaskHandover(t.db, f.manager.session, f.task.id);
  const receiverView = await readTaskHandover(t.db, f.receiver.session, f.task.id);
  expect(senderView.task).toMatchObject({
    ownerId: f.owner.id,
    pendingOwnerId: null,
    version: 3,
    title: f.task.title,
    dueAt: f.task.dueAt,
    followUpAt: f.task.followUpAt,
  });
  expect(senderView.latestDecision).toMatchObject({
    kind: "declined",
    actorId: f.receiver.id,
    receiverId: f.receiver.id,
    reason: decline.reason,
  });
  expect(receiverView.latestDecision).toEqual(senderView.latestDecision);
  await handoverTask(t.db, f.manager.session, {
    ...f.input,
    operationId: randomUUID(),
    expectedVersion: 3,
  });
  expect((await readTaskHandover(t.db, f.manager.session, f.task.id)).latestDecision).toBeNull();
});

it("requires a future receiver review without hiding an overdue client deadline", async () => {
  const f = await fixture();
  await handoverTask(t.db, f.manager.session, f.input);
  const accept = {
    ...f.input,
    operationId: randomUUID(),
    expectedVersion: 2,
    action: "accept",
    nextAction: "Review the overdue promise and contact the client",
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
  await expect(
    handoverTask(t.db, f.receiver.session, { ...accept, nextAction: "" }),
  ).rejects.toMatchObject({ code: "validation_failed" });
  await expect(
    handoverTask(t.db, f.receiver.session, {
      ...accept,
      operationId: randomUUID(),
      dueAt: new Date(Date.now() - 3_600_000).toISOString(),
    }),
  ).rejects.toMatchObject({
    code: "validation_failed",
    fieldErrors: { dueAt: ["future_required"] },
  });
  await expect(
    handoverTask(t.db, f.receiver.session, {
      ...accept,
      operationId: randomUUID(),
      dueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    }),
  ).rejects.toMatchObject({
    code: "validation_failed",
    fieldErrors: { dueAt: ["after_deadline"] },
  });
  const overdue = new Date(Date.now() - 3_600_000);
  await t.db.update(tasks).set({ dueAt: overdue }).where(eq(tasks.id, f.task.id));
  await handoverTask(t.db, f.receiver.session, accept);
  const view = await readTaskHandover(t.db, f.receiver.session, f.task.id);
  expect(view.task).toMatchObject({ dueAt: overdue, title: accept.nextAction });
  expect(view.task.followUpAt).toEqual(new Date(accept.dueAt));
  expect(
    (await listTasks(t.db, f.receiver.session, { dueBefore: new Date() })).rows.map(
      (row) => row.task.id,
    ),
  ).toContain(f.task.id);
});

it("records an undated task's receiver review without inventing a deadline", async () => {
  const f = await fixture();
  await t.db.update(tasks).set({ dueAt: null, dueTimezone: null }).where(eq(tasks.id, f.task.id));
  await handoverTask(t.db, f.manager.session, f.input);
  const reviewAt = new Date(Date.now() + 3_600_000);
  await handoverTask(t.db, f.receiver.session, {
    ...f.input,
    action: "accept",
    operationId: randomUUID(),
    expectedVersion: 2,
    nextAction: "Check the dependency and record the next step",
    dueAt: reviewAt.toISOString(),
  });
  const view = await readTaskHandover(t.db, f.receiver.session, f.task.id);
  expect(view.task).toMatchObject({ dueAt: null, dueTimezone: null, followUpAt: reviewAt });
  expect(
    (
      await listTasks(t.db, f.receiver.session, { dueBefore: new Date(Date.now() + 7200000) })
    ).rows.map((row) => row.task.id),
  ).toContain(f.task.id);
});

it("rechecks receiver eligibility and does not hand over completed work", async () => {
  const f = await fixture();
  await t.db
    .update(passkeys)
    .set({ revokedAt: new Date() })
    .where(eq(passkeys.principalId, f.receiver.id));
  expect(
    (await readTaskHandover(t.db, f.manager.session, f.task.id)).receivers.some(
      (r) => r.id === f.receiver.id,
    ),
  ).toBe(false);
  await expect(handoverTask(t.db, f.manager.session, f.input)).rejects.toMatchObject({
    code: "forbidden",
  });
  await t.db
    .update(tasks)
    .set({ state: "cancelled", cancelReason: "Synthetic cancellation" })
    .where(eq(tasks.id, f.task.id));
  await expect(
    handoverTask(t.db, f.manager.session, {
      ...f.input,
      operationId: randomUUID(),
      receiverId: f.manager.id,
    }),
  ).rejects.toMatchObject({ code: "transition_denied" });
});
