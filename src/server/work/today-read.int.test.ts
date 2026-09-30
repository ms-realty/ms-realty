import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { staffFixture } from "../cases/testing";
import { listInbox, readToday } from "./queries";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

it("reads Today with one authorization context and four scoped queues", async () => {
  const staff = await staffFixture(t.db);
  let reads = 0;
  const measured = drizzle(t.sql, {
    schema,
    logger: {
      logQuery() {
        reads++;
      },
    },
  });
  await listInbox(measured, staff.session, "unassigned");
  const oneQueueReads = reads;
  reads = 0;
  await readToday(measured, staff.session);
  expect(reads).toBeLessThanOrEqual(oneQueueReads + 3);
});

it("retains due and record-scope filters and refreshes grants on the next request", async () => {
  const staff = await staffFixture(t.db),
    now = new Date();
  const tasks = await t.db
    .insert(schema.tasks)
    .values([
      {
        title: "Synthetic due and granted",
        ownerId: staff.id,
        dueAt: new Date(now.getTime() - 1000),
      },
      {
        title: "Synthetic due but not granted",
        ownerId: staff.id,
        dueAt: new Date(now.getTime() - 1000),
      },
      {
        title: "Synthetic future task",
        ownerId: staff.id,
        dueAt: new Date(now.getTime() + 86400000),
      },
    ])
    .returning();
  const [allowed, excluded, future] = tasks;
  if (!allowed || !excluded || !future) throw new Error("Missing tasks");
  expect((await readToday(t.db, staff.session, now)).due.rows.map((r) => r.task.id).sort()).toEqual(
    [allowed.id, excluded.id].sort(),
  );
  await t.db
    .update(schema.grants)
    .set({ revokedAt: new Date() })
    .where(eq(schema.grants.principalId, staff.id));
  await t.db.insert(schema.grants).values(
    [allowed.id, future.id].map((id) => ({
      principalId: staff.id,
      capability: "task.manage" as const,
      recordType: "task",
      recordId: id,
      reason: "Synthetic scoped queue read",
    })),
  );
  const scoped = await readToday(t.db, staff.session, now);
  expect(scoped.due.rows.map((r) => r.task.id)).toEqual([allowed.id]);
  expect(scoped.handovers.rows).toEqual([]);
  expect(scoped.unassigned.rows).toEqual([]);
  expect(scoped.mine.rows).toEqual([]);
  await t.db
    .update(schema.grants)
    .set({ revokedAt: new Date() })
    .where(eq(schema.grants.principalId, staff.id));
  expect((await readToday(t.db, staff.session, now)).due.rows).toEqual([]);
});
