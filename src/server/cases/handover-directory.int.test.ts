import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { principals } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createCase, createStaff } from "../testing";
import { lifecycleView } from "./lifecycle";
import { staffFixture } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
it("eligible receiving broker remains selectable beyond fifty earlier ineligible staff", async () => {
  for (let i = 0; i < 51; i++) {
    const person = await createStaff(t.db, {
      roles: [],
      email: `directory-${randomUUID()}@example.test`,
    });
    await t.db
      .update(principals)
      .set({ displayName: `A ineligible ${i}` })
      .where(eq(principals.id, person.id));
  }
  const owner = await staffFixture(t.db),
    receiver = await staffFixture(t.db),
    id = await createCase(t.db, owner.id);
  await t.db
    .update(principals)
    .set({ displayName: "Z receiving broker" })
    .where(eq(principals.id, receiver.id));
  expect((await lifecycleView(t.db, owner.session, id)).receivers).toEqual([
    { id: receiver.id, name: "Z receiving broker" },
  ]);
});
