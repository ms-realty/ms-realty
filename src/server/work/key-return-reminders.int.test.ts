import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { staffFixture } from "../cases/testing";
import { amendKeyDeadline, moveKeys } from "../key-custody/service";
import { custodyFixture } from "../key-custody/testing";
import { createProperty } from "../testing";
import { listInbox, pageSize, readToday } from "./queries";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function fixture() {
  const manager = await custodyFixture(t.db),
    holder = await staffFixture(t.db),
    propertyId = await createProperty(t.db);
  const now = new Date();
  const [key] = await t.db
    .insert(schema.keySets)
    .values({
      reference: `KY-TEST-${randomUUID()}`,
      propertyId,
      keyTag: randomUUID(),
      quantity: 2,
      sourceReference: "Synthetic physical receipt",
      state: "checked_out",
      holderId: holder.id,
      dueAt: new Date(now.getTime() - 60000),
    })
    .returning();
  if (!key) throw new Error("Missing key set");
  return { manager, holder, key, now };
}
it("shows only current overdue custody and does not alter the promise or physical record", async () => {
  const f = await fixture();
  const additional = await t.db
    .insert(schema.keySets)
    .values(
      [
        { state: "checked_out", holderId: f.holder.id, dueAt: f.now },
        { state: "checked_out", holderId: f.holder.id, dueAt: new Date(f.now.getTime() + 60000) },
        { state: "stored", storageLabel: "Synthetic secure cabinet" },
        { state: "lost" },
        { state: "returned_to_owner" },
      ].map((state) => ({
        reference: `KY-TEST-${randomUUID()}`,
        propertyId: f.key.propertyId,
        keyTag: randomUUID(),
        quantity: 2,
        sourceReference: "Synthetic receipt",
        ...state,
      })),
    )
    .returning();
  const before = await t.db.select().from(schema.keySets).where(eq(schema.keySets.id, f.key.id));
  const rows = (await readToday(t.db, f.manager.session, f.now)).keyReturns?.rows ?? [];
  expect(rows.some((r) => r.id === f.key.id)).toBe(true);
  expect(rows.some((r) => additional.some((k) => k.id === r.id))).toBe(false);
  expect(await t.db.select().from(schema.keySets).where(eq(schema.keySets.id, f.key.id))).toEqual(
    before,
  );
  expect(
    await t.db
      .select()
      .from(schema.keyCustodyEvents)
      .where(eq(schema.keyCustodyEvents.keySetId, f.key.id)),
  ).toHaveLength(0);
});
it("does not grant registry access to a holder or scoped/expired grant, and refreshes revocation", async () => {
  const f = await fixture();
  expect((await readToday(t.db, f.holder.session)).keyReturns).toBeNull();
  await t.db.insert(schema.grants).values([
    {
      principalId: f.holder.id,
      capability: "key.manage",
      recordType: "key_set",
      recordId: f.key.id,
      reason: "Synthetic scoped grant",
    },
    {
      principalId: f.holder.id,
      capability: "key.manage",
      expiresAt: new Date(0),
      reason: "Synthetic expired grant",
    },
    {
      principalId: f.holder.id,
      capability: "key.manage",
      locales: ["bg"],
      reason: "Synthetic locale scope",
    },
  ]);
  expect((await readToday(t.db, f.holder.session)).keyReturns).toBeNull();
  const [grant] = await t.db
    .insert(schema.grants)
    .values({
      principalId: f.holder.id,
      capability: "key.manage",
      expiresAt: new Date(Date.now() + 60000),
      reason: "Synthetic global grant",
    })
    .returning();
  if (!grant) throw new Error("Missing grant");
  expect(
    (await readToday(t.db, f.holder.session)).keyReturns?.rows.some((r) => r.id === f.key.id),
  ).toBe(true);
  await t.db
    .update(schema.grants)
    .set({ revokedAt: new Date() })
    .where(eq(schema.grants.id, grant.id));
  expect((await readToday(t.db, f.holder.session)).keyReturns).toBeNull();
});
it("retains an overdue key held by a removed staff member until physical return is recorded", async () => {
  const f = await fixture();
  await t.db
    .update(schema.staffMemberships)
    .set({ state: "ended", endedAt: new Date() })
    .where(eq(schema.staffMemberships.principalId, f.holder.id));
  expect(
    (await readToday(t.db, f.manager.session)).keyReturns?.rows.find((r) => r.id === f.key.id)
      ?.needsCoverage,
  ).toBe(true);
  await moveKeys(t.db, f.manager.session, {
    operationId: randomUUID(),
    id: f.key.id,
    expectedVersion: 1,
    state: "stored",
    storageLabel: "Synthetic secure cabinet",
    note: "Physically received both keys under synthetic receipt",
    reviewed: true,
  });
  expect(
    (await readToday(t.db, f.manager.session)).keyReturns?.rows.some((r) => r.id === f.key.id),
  ).toBe(false);
});
it("changes the reminder after an explicit deadline amendment without changing custody", async () => {
  const f = await fixture();
  await amendKeyDeadline(t.db, f.manager.session, {
    operationId: randomUUID(),
    id: f.key.id,
    expectedVersion: 1,
    dueAt: new Date(Date.now() + 3600000).toISOString(),
    note: "Agreed a future return time with the synthetic holder",
    reviewed: true,
  });
  expect(
    (await readToday(t.db, f.manager.session)).keyReturns?.rows.some((r) => r.id === f.key.id),
  ).toBe(false);
  expect(
    (await t.db.select().from(schema.keySets).where(eq(schema.keySets.id, f.key.id)))[0],
  ).toMatchObject({ state: "checked_out", holderId: f.holder.id, version: 2 });
});
it("caps oldest-first reminders and adds only one query to the shared Today context", async () => {
  const f = await fixture();
  const inserted = await t.db
    .insert(schema.keySets)
    .values(
      Array.from({ length: pageSize + 1 }, (_, i) => ({
        reference: `KY-BOUND-${randomUUID()}`,
        propertyId: f.key.propertyId,
        keyTag: randomUUID(),
        quantity: 1,
        sourceReference: "Synthetic receipt",
        state: "checked_out",
        holderId: f.holder.id,
        dueAt: new Date(1000000 + i * 1000),
      })),
    )
    .returning();
  let reads: string[] = [];
  const measured = drizzle(t.sql, {
    schema,
    logger: {
      logQuery(query) {
        reads.push(query);
      },
    },
  });
  await listInbox(measured, f.manager.session);
  const single = reads.length;
  reads = [];
  const result = await readToday(measured, f.manager.session, f.now);
  expect(reads.length).toBeLessThanOrEqual(single + 13);
  expect(reads.filter((query) => query.includes('from "key_sets"'))).toHaveLength(1);
  expect(reads.filter((query) => query.includes('from "grants"'))).toHaveLength(1);
  expect(result.keyReturns?.status).toBe("ready");
  expect(result.keyReturns?.total).toBeGreaterThan(pageSize);
  expect(result.keyReturns?.hasMore).toBe(true);
  expect(result.keyReturns?.rows.map((r) => r.id)).toEqual(
    inserted.slice(0, pageSize).map((r) => r.id),
  );
});
