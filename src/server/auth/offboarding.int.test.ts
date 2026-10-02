import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  grants,
  invitations,
  principals,
  properties,
  sessions,
  staffMemberships,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { can } from "../authz";
import { staffFixture } from "../cases/testing";
import { moveKeys, readKeys, receiveKeys } from "../key-custody/service";
import { custodyFixture } from "../key-custody/testing";
import { createCase, createClient, createProperty } from "../testing";
import { offboardStaff, readOffboarding } from "./grants";
import { countActivePasskeys } from "./passkeys";
import { readSession } from "./sessions";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function fixture() {
  const manager = await custodyFixture(t.db),
    target = await staffFixture(t.db);
  const [person] = await t.db.select().from(principals).where(eq(principals.id, target.id));
  if (!person) throw new Error("No target");
  const input = {
    operationId: randomUUID(),
    principalId: target.id,
    expectedRevision: person.version,
    reason: "Synthetic staff departure; manager will reconcile retained work.",
    reviewed: true,
  };
  return { manager, target, input };
}
it("ends all staff authentication and grants, retains custody/work, and replays one receipt", async () => {
  const f = await fixture();
  const propertyId = await createProperty(t.db);
  const [property] = await t.db.select().from(properties).where(eq(properties.id, propertyId));
  const key = await receiveKeys(t.db, f.manager.session, {
    operationId: randomUUID(),
    propertyReference: property?.reference,
    keyTag: randomUUID(),
    quantity: 1,
    sourceReference: "Synthetic receipt",
    storageLabel: "Cabinet A",
    note: "Synthetic key receipt confirmed.",
    reviewed: true,
  });
  await moveKeys(t.db, f.manager.session, {
    operationId: randomUUID(),
    id: key.outcome.id,
    expectedVersion: 1,
    state: "checked_out",
    holderId: f.target.id,
    dueAt: new Date(Date.now() + 3600000).toISOString(),
    note: "Synthetic physical custody confirmed.",
    reviewed: true,
  });
  await createCase(t.db, f.target.id);
  await t.db.insert(invitations).values({
    tokenHash: randomUUID(),
    kind: "staff_recovery",
    principalId: f.target.id,
    email: "synthetic@example.test",
    invitedById: f.manager.id,
    expiresAt: new Date(Date.now() + 3600000),
  });
  const result = await offboardStaff(t.db, f.manager.session, f.input);
  expect(result.outcome).toMatchObject({
    principalId: f.target.id,
    retained: { keys: 1, cases: 1 },
    passkeysRevoked: 2,
    sessionsRevoked: 1,
    invitationsRevoked: 1,
  });
  expect(await readSession(t.db, f.target.token)).toBeNull();
  expect(await countActivePasskeys(t.db, f.target.id)).toBe(0);
  expect(await can(t.db, f.target.session.actor, "case.read_internal")).toBe(false);
  expect(
    await t.db
      .select()
      .from(grants)
      .where(and(eq(grants.principalId, f.target.id), isNull(grants.revokedAt))),
  ).toHaveLength(0);
  expect((await readKeys(t.db, f.manager.session, key.outcome.id)).row).toMatchObject({
    state: "checked_out",
    holderId: f.target.id,
    version: 2,
  });
  expect((await readOffboarding(t.db, f.manager.session, f.target.id)).history).toHaveLength(1);
  expect(await offboardStaff(t.db, f.manager.session, f.input)).toMatchObject({
    replayed: true,
    operationId: result.operationId,
  });
  await moveKeys(t.db, f.manager.session, {
    operationId: randomUUID(),
    id: key.outcome.id,
    expectedVersion: 2,
    state: "stored",
    storageLabel: "Cabinet B",
    note: "Actual synthetic return following access removal.",
    reviewed: true,
  });
  expect((await readOffboarding(t.db, f.manager.session, f.target.id)).retained.keys).toBe(0);
});
it("rejects self-removal, client targets, stale versions, missing review and stale operator authentication", async () => {
  const f = await fixture();
  await expect(offboardStaff(t.db, f.target.session, f.input)).rejects.toMatchObject({
    code: "not_found",
  });
  await expect(
    offboardStaff(t.db, f.manager.session, { ...f.input, principalId: f.manager.id }),
  ).rejects.toMatchObject({ code: "forbidden" });
  await expect(
    offboardStaff(t.db, f.manager.session, { ...f.input, reviewed: false }),
  ).rejects.toMatchObject({ code: "validation_failed" });
  await expect(
    offboardStaff(t.db, f.manager.session, { ...f.input, expectedRevision: 99 }),
  ).rejects.toMatchObject({ code: "version_conflict" });
  const client = await createClient(t.db);
  await expect(
    offboardStaff(t.db, f.manager.session, {
      ...f.input,
      operationId: randomUUID(),
      principalId: client.id,
    }),
  ).rejects.toMatchObject({ code: "not_found" });
  await t.db
    .update(sessions)
    .set({ reverifiedAt: new Date(Date.now() - 3600000) })
    .where(eq(sessions.id, f.manager.session.id));
  await expect(
    offboardStaff(t.db, f.manager.session, { ...f.input, operationId: randomUUID() }),
  ).rejects.toMatchObject({ code: "step_up_required" });
  expect(
    (
      await t.db
        .select()
        .from(staffMemberships)
        .where(eq(staffMemberships.principalId, f.target.id))
    )[0]?.state,
  ).toBe("active");
});
it("serializes competing manager removals and leaves a usable manager", async () => {
  const a = await custodyFixture(t.db),
    b = await custodyFixture(t.db);
  const input = {
    expectedRevision: 1,
    reason: "Synthetic manager handover decision",
    reviewed: true,
  };
  const results = await Promise.allSettled([
    offboardStaff(t.db, a.session, { ...input, principalId: b.id, operationId: randomUUID() }),
    offboardStaff(t.db, b.session, { ...input, principalId: a.id, operationId: randomUUID() }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const remaining = await Promise.all([
    can(t.db, a.session.actor, "access.grant"),
    can(t.db, b.session.actor, "access.grant"),
  ]);
  expect(remaining.filter(Boolean)).toHaveLength(1);
});
