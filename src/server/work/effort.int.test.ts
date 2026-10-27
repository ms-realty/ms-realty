import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { activityEvents, grants, outboxEvents, taskEffortEntries, tasks } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { staffFixture } from "../cases/testing";
import { createTask } from "./create-task";
import { readEffortOperation, readTaskEffort, recordTaskEffort } from "./effort";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function fixture() {
  const actor = await staffFixture(t.db);
  const task = await createTask(t.db, actor.session, {
    operationId: randomUUID(),
    parent: null,
    title: "Synthetic correction review",
    purpose: "Review a synthetic source discrepancy",
    type: "fact_verification",
  });
  return { actor, id: task.outcome.id };
}
const input = (id: string) => ({
  id,
  operationId: randomUUID(),
  expectedVersion: 1,
  action: "record" as const,
  category: "correction" as const,
  minutes: 12,
  reason: "facts" as const,
});

it("O22 records reported minutes once, keeps ordinary evidence and reconciles its exact key", async () => {
  const f = await fixture(),
    body = input(f.id);
  const done = await recordTaskEffort(t.db, f.actor.session, body);
  expect(await recordTaskEffort(t.db, f.actor.session, body)).toMatchObject({
    operationId: done.operationId,
    replayed: true,
    outcome: done.outcome,
  });
  expect((await readTaskEffort(t.db, f.actor.session, f.id)).entries).toMatchObject([
    { minutes: 12, category: "correction", voided: false, actorId: f.actor.id },
  ]);
  for (const table of [activityEvents, outboxEvents])
    expect(
      await t.db.select().from(table).where(eq(table.operationId, done.operationId)),
    ).toHaveLength(1);
  expect(
    await readEffortOperation(t.db, f.actor.session, f.id, "record", body.operationId),
  ).toMatchObject({ state: "succeeded", operationId: done.operationId });
  await expect(
    recordTaskEffort(t.db, f.actor.session, { ...body, minutes: 13 }),
  ).rejects.toMatchObject({ code: "idempotency_key_reused" });
});

it("O22 corrects an observation with an attributable append instead of overwriting history", async () => {
  const f = await fixture();
  const done = await recordTaskEffort(t.db, f.actor.session, input(f.id));
  const body = {
    id: f.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    action: "void" as const,
    entryId: done.outcome.id,
    reason: "entry_mistake" as const,
  };
  const correction = await recordTaskEffort(t.db, f.actor.session, body);
  expect(await recordTaskEffort(t.db, f.actor.session, body)).toMatchObject({
    operationId: correction.operationId,
    replayed: true,
  });
  expect((await readTaskEffort(t.db, f.actor.session, f.id)).entries).toMatchObject([
    { id: done.outcome.id, minutes: 12, voided: true },
  ]);
  await expect(
    recordTaskEffort(t.db, f.actor.session, { ...body, operationId: randomUUID() }),
  ).rejects.toMatchObject({ code: "version_conflict" });
  await expect(
    t.db
      .update(taskEffortEntries)
      .set({ minutes: 99 })
      .where(eq(taskEffortEntries.id, done.outcome.id)),
  ).rejects.toThrow();
});

it("O22 rejects stale task intent and observes current grants before replay or status", async () => {
  const f = await fixture(),
    body = input(f.id);
  await t.db.update(tasks).set({ version: 2 }).where(eq(tasks.id, f.id));
  await expect(recordTaskEffort(t.db, f.actor.session, body)).rejects.toMatchObject({
    code: "version_conflict",
  });
  const fresh = { ...body, operationId: randomUUID(), expectedVersion: 2 };
  await recordTaskEffort(t.db, f.actor.session, fresh);
  await t.db
    .update(grants)
    .set({ revokedAt: new Date() })
    .where(eq(grants.principalId, f.actor.id));
  await expect(recordTaskEffort(t.db, f.actor.session, fresh)).rejects.toBeDefined();
  await expect(
    readEffortOperation(t.db, f.actor.session, f.id, "record", fresh.operationId),
  ).rejects.toBeDefined();
  await expect(readTaskEffort(t.db, f.actor.session, f.id)).rejects.toBeDefined();
});

it("O22 never follows an effort identity into another task", async () => {
  const f = await fixture(),
    other = await fixture();
  const entry = await recordTaskEffort(t.db, other.actor.session, input(other.id));
  await expect(
    recordTaskEffort(t.db, f.actor.session, {
      id: f.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      action: "void",
      entryId: entry.outcome.id,
      reason: "entry_mistake",
    }),
  ).rejects.toMatchObject({ code: "not_found" });
  await t.db
    .update(grants)
    .set({ revokedAt: new Date() })
    .where(eq(grants.principalId, f.actor.id));
  await t.db.insert(grants).values({
    principalId: f.actor.id,
    capability: "task.manage",
    recordType: "task",
    recordId: f.id,
    reason: "Synthetic narrow effort grant",
  });
  await expect(readTaskEffort(t.db, f.actor.session, other.id)).rejects.toBeDefined();
  expect((await readTaskEffort(t.db, f.actor.session, f.id)).entries).toHaveLength(0);
});

it("O22 reports pending while an identical logical command owns the database lock", async () => {
  const f = await fixture(),
    key = randomUUID();
  let release!: () => void, entered!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const transaction = t.db.transaction(async (tx) => {
    const lockKey = JSON.stringify(["staff", f.actor.id, "work.task.effort.record", key]);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    entered();
    await released;
  });
  await locked;
  try {
    expect(await readEffortOperation(t.db, f.actor.session, f.id, "record", key)).toEqual({
      state: "pending",
    });
  } finally {
    release();
    await transaction;
  }
  expect(await readEffortOperation(t.db, f.actor.session, f.id, "record", key)).toEqual({
    state: "absent",
  });
});

it("O22 rejects missing, fractional and implausible effort instead of inferring task duration", async () => {
  const f = await fixture();
  for (const minutes of [0, -1, 1.5, 481])
    await expect(
      recordTaskEffort(t.db, f.actor.session, { ...input(f.id), minutes }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  expect((await readTaskEffort(t.db, f.actor.session, f.id)).entries).toHaveLength(0);
});
