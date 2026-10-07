import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { createStaff, type GrantSpec } from "../testing";
import { readToday } from "../work/queries";
import { readAssistanceOperations } from "./operations";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

async function operator(grants: GrantSpec[]) {
  const staff = await createStaff(t.db, { grants });
  await t.db.insert(schema.passkeys).values(
    [0, 1].map(() => ({
      principalId: staff.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const { session } = await createSession(t.db, { kind: "staff", id: staff.id });
  return { ...staff, session };
}

it("continues the oldest-first Today exceptions past 30 and opens an exact older record", async () => {
  const { session } = await operator([{ capability: "report.read" }]);
  const now = Date.now();
  const actions = await t.db
    .insert(schema.externalActions)
    .values(
      Array.from({ length: 32 }, (_, index) => ({
        kind: "email_send" as const,
        effectKey: randomUUID(),
        payload: { private: "private-recipient@example.test" },
        payloadDigest: "synthetic",
        state: index === 31 ? ("attempting" as const) : ("failed" as const),
        attempts: 1,
        lastErrorCode: "private-provider-error",
        updatedAt: new Date(now - (32 - index) * 1000),
        lastAttemptAt: new Date(now - (32 - index) * 1000),
      })),
    )
    .returning();
  const first = actions[0],
    last = actions[30],
    attempting = actions[31];
  if (!first || !last || !attempting) throw new Error("Missing exception fixtures");
  const today = await readToday(t.db, session);
  expect(today.operatorDeliveryExceptions).toMatchObject({ total: 31, hasMore: true });
  const overview = await readAssistanceOperations(t.db, session);
  expect(overview.external.some((event) => event.id === first.id)).toBe(false);
  expect(overview.external.some((event) => event.id === attempting.id)).toBe(true);
  const page1 = await readAssistanceOperations(t.db, session, { kind: "queue", page: 1 });
  expect(page1.external.map((event) => event.id)).toEqual(
    today.operatorDeliveryExceptions?.rows.map((event) => event.id),
  );
  expect(page1.externalNavigation).toEqual({ kind: "queue", page: 1, hasMore: true });
  const page2 = await readAssistanceOperations(t.db, session, { kind: "queue", page: 2 });
  expect(page2.external.map((event) => event.id)).toEqual([last.id]);
  expect(page2.externalNavigation).toEqual({ kind: "queue", page: 2, hasMore: false });
  const exact = await readAssistanceOperations(t.db, session, { kind: "record", id: first.id });
  expect(exact.external).toHaveLength(1);
  expect(exact.external[0]).toMatchObject({ id: first.id, code: "unclassified_error" });
  expect(JSON.stringify([page1.external, page2.external, exact.external])).not.toContain("private");
  await t.db
    .update(schema.externalActions)
    .set({ state: "cancelled" })
    .where(eq(schema.externalActions.id, first.id));
  expect(
    (await readAssistanceOperations(t.db, session, { kind: "record", id: first.id })).external,
  ).toHaveLength(0);
});

it("requires current global report access for both queue pages and exact records", async () => {
  const staff = await operator([
    { capability: "report.read", recordType: "case", recordId: randomUUID() },
  ]);
  const { session } = staff;
  const views = [
    { kind: "queue" as const, page: 1 },
    { kind: "record" as const, id: randomUUID() },
  ];
  for (const view of views)
    await expect(readAssistanceOperations(t.db, session, view)).rejects.toMatchObject({
      code: "forbidden",
    });
  const [grant] = await t.db
    .insert(schema.grants)
    .values({ principalId: staff.id, capability: "report.read", reason: "Synthetic test" })
    .returning();
  if (!grant) throw new Error("Missing report grant");
  await readAssistanceOperations(t.db, session, views[0]);
  await t.db
    .update(schema.grants)
    .set({ revokedAt: new Date() })
    .where(eq(schema.grants.id, grant.id));
  for (const view of views)
    await expect(readAssistanceOperations(t.db, session, view)).rejects.toMatchObject({
      code: "forbidden",
    });
});
