import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { auditEvents, passkeys, tasks } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { offboardStaff } from "../auth/grants";
import { staffFixture } from "../cases/testing";
import { custodyFixture } from "../key-custody/testing";
import { createCase } from "../testing";
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
  const accept = { ...f.input, operationId: randomUUID(), expectedVersion: 2, action: "accept" };
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
    followUpAt: f.task.followUpAt,
    dueTimezone: "Europe/Sofia",
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
    }),
  ).rejects.toMatchObject({ code: "version_conflict" });
  await expect(
    handoverTask(t.db, f.manager.session, {
      ...f.input,
      operationId: randomUUID(),
      expectedVersion: 2,
    }),
  ).rejects.toMatchObject({ code: "transition_denied" });
  await handoverTask(t.db, f.manager.session, {
    ...f.input,
    operationId: randomUUID(),
    expectedVersion: 2,
    action: "cancel",
  });
  expect((await readTaskHandover(t.db, f.manager.session, f.task.id)).task).toMatchObject({
    ownerId: f.owner.id,
    pendingOwnerId: null,
    version: 3,
  });
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
