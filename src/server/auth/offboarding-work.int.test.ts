import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { grants, tasks } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { staffFixture } from "../cases/testing";
import { custodyFixture } from "../key-custody/testing";
import { createCase } from "../testing";
import { readOffboardingWork } from "./offboarding-work";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

it("lists only the target's open work and applies capability restrictions before pagination", async () => {
  const manager = await custodyFixture(t.db),
    target = await staffFixture(t.db),
    other = await staffFixture(t.db);
  const caseId = await createCase(t.db, target.id);
  await createCase(t.db, other.id);
  await t.db.insert(tasks).values(
    Array.from({ length: 26 }, (_, n) => ({
      title: `Synthetic target task ${n}`,
      ownerId: target.id,
      caseId,
    })),
  );
  await t.db.insert(tasks).values({ title: "Another person's task", ownerId: other.id });
  const first = await readOffboardingWork(t.db, manager.session, target.id);
  const second = await readOffboardingWork(t.db, manager.session, target.id, 2);
  expect(first.cases.map((row) => row.id)).toEqual([caseId]);
  expect(first.tasks).toHaveLength(25);
  expect(first.hasMore).toBe(true);
  expect(second.tasks).toHaveLength(1);
  expect(second.hasMore).toBe(false);
  expect(new Set([...first.tasks, ...second.tasks].map((row) => row.id)).size).toBe(26);
  // Access administration does not imply reading private case/task details.
  // Replace the manager role grant with access administration alone.
  await t.db
    .update(grants)
    .set({ role: null, capability: "access.grant" })
    .where(eq(grants.principalId, manager.id));
  const restricted = await readOffboardingWork(t.db, manager.session, target.id);
  expect(restricted).toMatchObject({
    cases: [],
    tasks: [],
    inquiries: [],
    keys: [],
    hasMore: false,
  });
  await expect(readOffboardingWork(t.db, other.session, target.id)).rejects.toMatchObject({
    code: "not_found",
  });
});
