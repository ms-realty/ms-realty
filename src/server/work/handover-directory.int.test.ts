import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { staffFixture } from "../cases/testing";
import { createCase, createStaff } from "../testing";
import { handoverTask, readTaskHandover } from "./handover";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

it("keeps the complete eligible directory without a query per member", async () => {
  const owner = await staffFixture(t.db),
    receiver = await staffFixture(t.db);
  const caseId = await createCase(t.db, owner.id);
  const [task] = await t.db
    .insert(schema.tasks)
    .values({
      title: "Synthetic directory follow-up",
      ownerId: owner.id,
      caseId,
    })
    .returning();
  if (!task) throw new Error("Missing fixture");
  let reads = 0;
  const measured = drizzle(t.sql, {
    schema,
    logger: {
      logQuery() {
        reads++;
      },
    },
  });
  const before = await readTaskHandover(measured, owner.session, task.id);
  expect(before.receivers.map((p) => p.id)).toEqual([receiver.id]);
  const baselineQueries = reads;
  const expected = new Set([receiver.id]);
  for (let i = 0; i < 51; i++) {
    const member = await createStaff(t.db);
    await t.db
      .update(schema.principals)
      .set({ displayName: `A ineligible ${i}` })
      .where(eq(schema.principals.id, member.id));
  }
  for (let i = 0; i < 10; i++) {
    const member = await staffFixture(t.db);
    expected.add(member.id);
    await t.db
      .update(schema.principals)
      .set({ displayName: `Z receiving broker ${i}` })
      .where(eq(schema.principals.id, member.id));
  }
  reads = 0;
  const after = await readTaskHandover(measured, owner.session, task.id);
  expect(new Set(after.receivers.map((p) => p.id))).toEqual(expected);
  // The directory may add a bounded batch, never one grant/passkey lookup per member.
  expect(reads).toBeLessThanOrEqual(baselineQueries + 2);
});

it("revalidates a receiver's grant after the directory was shown", async () => {
  const owner = await staffFixture(t.db),
    receiver = await staffFixture(t.db);
  const [task] = await t.db
    .insert(schema.tasks)
    .values({
      title: "Synthetic permission change",
      ownerId: owner.id,
    })
    .returning();
  if (!task) throw new Error("Missing fixture");
  expect(
    (await readTaskHandover(t.db, owner.session, task.id)).receivers.map((p) => p.id),
  ).toContain(receiver.id);
  await t.db
    .update(schema.grants)
    .set({ revokedAt: new Date() })
    .where(eq(schema.grants.principalId, receiver.id));
  expect(
    (await readTaskHandover(t.db, owner.session, task.id)).receivers.map((p) => p.id),
  ).not.toContain(receiver.id);
  await expect(
    handoverTask(t.db, owner.session, {
      id: task.id,
      operationId: randomUUID(),
      expectedVersion: task.version,
      action: "request",
      receiverId: receiver.id,
      reason: "Review after permission changed",
      reviewed: true,
    }),
  ).rejects.toMatchObject({ code: "forbidden" });
  expect((await readTaskHandover(t.db, owner.session, task.id)).task.pendingOwnerId).toBeNull();
});
