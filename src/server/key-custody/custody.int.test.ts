import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  grants,
  keyCustodyEvents,
  keySets,
  passkeys,
  properties,
  staffMemberships,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { staffFixture } from "../cases/testing";
import { createClient, createProperty } from "../testing";
import { amendKeyDeadline, listKeys, moveKeys, readKeys, receiveKeys } from "./service";
import { custodyFixture } from "./testing";

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
  const [property] = await t.db.select().from(properties).where(eq(properties.id, propertyId));
  if (!property) throw new Error("No property");
  const input = {
    operationId: randomUUID(),
    propertyReference: property.reference,
    keyTag: `TEST-${randomUUID()}`,
    quantity: 2,
    sourceReference: "Synthetic signed receipt DEMO-1",
    storageLabel: "Synthetic secure cabinet A",
    note: "Two synthetic keys physically received under receipt DEMO-1.",
    reviewed: true,
  };
  const result = await receiveKeys(t.db, manager.session, input);
  const move = {
    operationId: randomUUID(),
    id: result.outcome.id,
    expectedVersion: 1,
    state: "checked_out",
    holderId: holder.id,
    dueAt: new Date(Date.now() + 3600000).toISOString(),
    storageLabel: "",
    note: "Synthetic staff member received both keys; receipt DEMO-2.",
    reviewed: true,
  };
  return { manager, holder, input, result, move };
}
it("records one receipt, rejects duplicate tags and protects immutable identity", async () => {
  const f = await fixture();
  expect(await receiveKeys(t.db, f.manager.session, f.input)).toMatchObject({
    replayed: true,
    outcome: f.result.outcome,
  });
  await expect(
    receiveKeys(t.db, f.manager.session, {
      ...f.input,
      operationId: randomUUID(),
      keyTag: f.input.keyTag.toLowerCase(),
    }),
  ).rejects.toMatchObject({ code: "validation_failed" });
  await expect(
    receiveKeys(t.db, f.manager.session, { ...f.input, quantity: 3 }),
  ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  const view = await readKeys(t.db, f.manager.session, f.result.outcome.id);
  expect(view.row.reference).toMatch(/^KY-\d{4}-\d{6}$/);
  expect(view.events).toHaveLength(1);
  await expect(
    t.db.update(keySets).set({ quantity: 4 }).where(eq(keySets.id, view.row.id)),
  ).rejects.toThrow();
  await expect(
    t.db
      .update(keyCustodyEvents)
      .set({ note: "Rewritten evidence" })
      .where(eq(keyCustodyEvents.keySetId, view.row.id)),
  ).rejects.toThrow();
  await expect(
    t.db.delete(keyCustodyEvents).where(eq(keyCustodyEvents.keySetId, view.row.id)),
  ).rejects.toThrow();
});
it("requires a current holder, future deadline and fresh physical confirmation", async () => {
  const f = await fixture();
  for (const patch of [
    { holderId: randomUUID() },
    { dueAt: new Date(0).toISOString() },
    { reviewed: false },
    { note: "" },
  ])
    await expect(
      moveKeys(t.db, f.manager.session, { ...f.move, ...patch, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  await t.db
    .update(staffMemberships)
    .set({ state: "ended" })
    .where(eq(staffMemberships.principalId, f.holder.id));
  await expect(moveKeys(t.db, f.manager.session, f.move)).rejects.toMatchObject({
    code: "validation_failed",
  });
  expect((await readKeys(t.db, f.manager.session, f.result.outcome.id)).row.state).toBe("stored");
});
it("serializes competing handovers and replays the winning operation", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    moveKeys(t.db, f.manager.session, f.move),
    moveKeys(t.db, f.manager.session, { ...f.move, operationId: randomUUID(), state: "lost" }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const failed = results.find((r) => r.status === "rejected");
  expect(failed).toMatchObject({ reason: { code: "version_conflict" } });
  const read = await readKeys(t.db, f.manager.session, f.result.outcome.id);
  expect(read.row.version).toBe(2);
  expect(read.events).toHaveLength(2);
  if (results[0]?.status === "fulfilled")
    expect(await moveKeys(t.db, f.manager.session, f.move)).toMatchObject({ replayed: true });
});
it("preserves overdue custody and returns keys from an offboarded holder without granting access", async () => {
  const f = await fixture();
  await moveKeys(t.db, f.manager.session, f.move);
  await t.db
    .update(keySets)
    .set({ dueAt: new Date(Date.now() - 60000) })
    .where(eq(keySets.id, f.result.outcome.id));
  expect(
    (await listKeys(t.db, f.manager.session, "overdue")).rows.some(
      (r) => r.key.id === f.result.outcome.id,
    ),
  ).toBe(true);
  expect((await readKeys(t.db, f.manager.session, f.result.outcome.id)).row.state).toBe(
    "checked_out",
  );
  await t.db
    .update(staffMemberships)
    .set({ state: "ended" })
    .where(eq(staffMemberships.principalId, f.holder.id));
  await moveKeys(t.db, f.manager.session, {
    ...f.move,
    operationId: randomUUID(),
    expectedVersion: 2,
    state: "stored",
    storageLabel: "Cabinet B",
    note: "Both keys physically recovered during synthetic staff offboarding.",
  });
  const read = await readKeys(t.db, f.manager.session, f.result.outcome.id);
  expect(read.row).toMatchObject({
    state: "stored",
    holderId: null,
    dueAt: null,
    storageLabel: "Cabinet B",
  });
  expect(read.events[1]).toMatchObject({ holderId: f.holder.id, state: "checked_out" });
  expect(read.names.some((n) => n.id === f.holder.id)).toBe(true);
  await expect(listKeys(t.db, f.holder.session)).rejects.toThrow();
});
it("records loss and recovery; owner return is terminal", async () => {
  const f = await fixture();
  await moveKeys(t.db, f.manager.session, { ...f.move, state: "lost" });
  await expect(
    moveKeys(t.db, f.manager.session, { ...f.move, operationId: randomUUID(), expectedVersion: 2 }),
  ).rejects.toMatchObject({ code: "transition_denied" });
  await moveKeys(t.db, f.manager.session, {
    ...f.move,
    operationId: randomUUID(),
    expectedVersion: 2,
    state: "stored",
    storageLabel: "Recovered cabinet",
    note: "Both keys found and physically checked into synthetic cabinet.",
  });
  await moveKeys(t.db, f.manager.session, {
    ...f.move,
    operationId: randomUUID(),
    expectedVersion: 3,
    state: "returned_to_owner",
    note: "Owner received both keys under synthetic return receipt DEMO-3.",
  });
  await expect(
    moveKeys(t.db, f.manager.session, {
      ...f.move,
      operationId: randomUUID(),
      expectedVersion: 4,
      state: "stored",
      storageLabel: "A",
    }),
  ).rejects.toMatchObject({ code: "transition_denied" });
  expect((await readKeys(t.db, f.manager.session, f.result.outcome.id)).events).toHaveLength(4);
});
it("denies brokers, clients, record-scoped grants and revoked manager assurance", async () => {
  const f = await fixture();
  await expect(readKeys(t.db, f.holder.session, f.result.outcome.id)).rejects.toMatchObject({
    code: "not_found",
  });
  await t.db.insert(grants).values({
    principalId: f.holder.id,
    capability: "key.manage",
    reason: "Synthetic record-only custody scope",
    recordType: "key_set",
    recordId: f.result.outcome.id,
  });
  await expect(listKeys(t.db, f.holder.session)).rejects.toMatchObject({ code: "not_found" });
  const client = await createClient(t.db);
  const { session } = await createSession(t.db, { kind: "client", id: client.id });
  await expect(readKeys(t.db, session, f.result.outcome.id)).rejects.toThrow();
  await t.db
    .update(passkeys)
    .set({ revokedAt: new Date() })
    .where(eq(passkeys.principalId, f.manager.id));
  await expect(moveKeys(t.db, f.manager.session, f.move)).rejects.toThrow();
});

it("amends a deadline with immutable prior custody, one receipt and fresh review", async () => {
  const f = await fixture();
  await moveKeys(t.db, f.manager.session, f.move);
  const input = {
    operationId: randomUUID(),
    id: f.result.outcome.id,
    expectedVersion: 2,
    dueAt: new Date(Date.now() + 7200000).toISOString(),
    note: "Holder confirmed the revised due-back time under synthetic agreement K4.",
    reviewed: true,
  };
  for (const patch of [
    { reviewed: false },
    { note: "" },
    { dueAt: f.move.dueAt },
    { dueAt: new Date(0).toISOString() },
  ])
    await expect(
      amendKeyDeadline(t.db, f.manager.session, { ...input, ...patch, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  const result = await amendKeyDeadline(t.db, f.manager.session, input);
  expect(await amendKeyDeadline(t.db, f.manager.session, input)).toMatchObject({
    replayed: true,
    outcome: result.outcome,
  });
  await expect(
    amendKeyDeadline(t.db, f.manager.session, { ...input, note: "Changed reviewed reason" }),
  ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  const view = await readKeys(t.db, f.manager.session, input.id);
  expect(view.row).toMatchObject({
    version: 3,
    state: "checked_out",
    holderId: f.holder.id,
    quantity: 2,
    storageLabel: null,
    dueAt: new Date(input.dueAt),
  });
  expect(view.events).toHaveLength(3);
  expect(view.events[0]).toMatchObject({
    operationType: "key.amend_deadline",
    dueAt: new Date(input.dueAt),
    note: input.note,
  });
  expect(view.events[1]).toMatchObject({
    operationType: "key.move",
    dueAt: new Date(f.move.dueAt),
    holderId: f.holder.id,
  });
});
it("does not extend custody for stored keys, offboarded holders or unauthorized operators", async () => {
  const f = await fixture();
  const input = {
    operationId: randomUUID(),
    id: f.result.outcome.id,
    expectedVersion: 1,
    dueAt: new Date(Date.now() + 7200000).toISOString(),
    note: "Synthetic agreement to change only the deadline.",
    reviewed: true,
  };
  await expect(amendKeyDeadline(t.db, f.manager.session, input)).rejects.toMatchObject({
    code: "transition_denied",
  });
  await moveKeys(t.db, f.manager.session, f.move);
  const next = { ...input, operationId: randomUUID(), expectedVersion: 2 };
  await expect(amendKeyDeadline(t.db, f.holder.session, next)).rejects.toMatchObject({
    code: "not_found",
  });
  await t.db
    .update(staffMemberships)
    .set({ state: "ended" })
    .where(eq(staffMemberships.principalId, f.holder.id));
  await expect(amendKeyDeadline(t.db, f.manager.session, next)).rejects.toMatchObject({
    code: "transition_denied",
  });
  expect((await readKeys(t.db, f.manager.session, input.id)).events).toHaveLength(2);
});
it("serializes a deadline amendment against physical return without overwriting either history", async () => {
  const f = await fixture();
  await moveKeys(t.db, f.manager.session, f.move);
  const input = {
    ...f.move,
    operationId: randomUUID(),
    expectedVersion: 2,
    dueAt: new Date(Date.now() + 7200000).toISOString(),
  };
  const results = await Promise.allSettled([
    amendKeyDeadline(t.db, f.manager.session, input),
    moveKeys(t.db, f.manager.session, {
      ...input,
      operationId: randomUUID(),
      state: "stored",
      storageLabel: "Synthetic cabinet C",
    }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "version_conflict" },
  });
  const view = await readKeys(t.db, f.manager.session, input.id);
  expect(view.events).toHaveLength(3);
  expect(view.row.version).toBe(3);
  if (results[0]?.status === "fulfilled")
    expect(view.row).toMatchObject({
      state: "checked_out",
      holderId: f.holder.id,
      dueAt: new Date(input.dueAt),
    });
  else expect(view.row).toMatchObject({ state: "stored", holderId: null, dueAt: null });
});
