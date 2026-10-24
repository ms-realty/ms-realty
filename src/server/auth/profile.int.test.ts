import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, operations, passkeys, principals, staffMemberships } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createClient, createStaff } from "../testing";
import {
  profileOperation,
  readStaffProfile,
  readStaffProfileOperation,
  saveStaffProfile,
} from "./profile";
import { createSession, requireLiveSession, revokeSession } from "./sessions";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function staff(keys = 1) {
  // Disposable profile fixtures, not WebAuthn ceremony or owner-acceptance evidence.
  const account = await createStaff(t.db);
  const { session, token } = await createSession(t.db, { kind: "staff", id: account.id });
  if (keys)
    await t.db.insert(passkeys).values(
      Array.from({ length: keys }, () => ({
        principalId: account.id,
        credentialId: randomUUID(),
        publicKey: Buffer.from([1]),
        deviceType: "singleDevice",
        backedUp: false,
      })),
    );
  return { account, session, token };
}
const intent = (displayName = "Éva Стоянова", expectedVersion = 1) => ({
  displayName,
  expectedVersion,
  operationId: randomUUID(),
});

describe("F30 personal profile: durable save, ownership and fresh staff access", () => {
  it("saves only the caller's display name with one passkey and no agency role; identical retry replays once", async () => {
    const { account, session } = await staff();
    const before = await readStaffProfile(t.db, session);
    expect(before).toMatchObject({ id: account.id, email: account.email, passkeys: 1, version: 1 });
    const input = intent();
    const first = await saveStaffProfile(t.db, session, input);
    const replay = await saveStaffProfile(t.db, session, input);
    expect(replay).toEqual({ ...first, replayed: true });
    expect(await readStaffProfile(t.db, session)).toMatchObject({
      displayName: input.displayName,
      email: before.email,
      version: 2,
      passkeys: 1,
    });
    expect(await requireLiveSession(t.db, session)).toEqual(session);
    const audit = await t.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.recordId, account.id), eq(auditEvents.action, profileOperation)));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.payload).toEqual({
      fields: ["displayName"],
      beforeVersion: 1,
      afterVersion: 2,
    });
    const receipt = await readStaffProfileOperation(t.db, session, input.operationId);
    expect(receipt).toMatchObject({ status: "succeeded", saved: first.outcome });
    expect(receipt?.completedAt).toBeInstanceOf(Date);
  });
  it("rejects changed replay payload and stale revisions without overwriting newer profile data", async () => {
    const { session } = await staff();
    const first = intent("First recorded name");
    await saveStaffProfile(t.db, session, first);
    await expect(
      saveStaffProfile(t.db, session, { ...first, displayName: "Changed retry" }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    await expect(saveStaffProfile(t.db, session, intent("Stale draft"))).rejects.toMatchObject({
      code: "version_conflict",
    });
    expect(await readStaffProfile(t.db, session)).toMatchObject({
      version: 2,
      displayName: first.displayName,
    });
    await saveStaffProfile(t.db, session, intent("Reviewed reapply", 2));
    expect(await readStaffProfile(t.db, session)).toMatchObject({
      version: 3,
      displayName: "Reviewed reapply",
    });
  });
  it("rejects unsupported authority/email/principal fields and invalid names before creating an operation", async () => {
    const { account, session } = await staff();
    for (const raw of [
      { ...intent(), principalId: randomUUID() },
      { ...intent(), email: "other@example.test" },
      intent(" "),
      intent("two\nlines"),
      intent("a".repeat(121)),
    ]) {
      await expect(saveStaffProfile(t.db, session, raw)).rejects.toMatchObject({
        code: "validation_failed",
      });
    }
    expect(
      await t.db.select().from(operations).where(eq(operations.actorId, account.id)),
    ).toHaveLength(0);
    expect(await readStaffProfile(t.db, session)).toMatchObject({
      displayName: "Test Staff",
      email: account.email,
      version: 1,
    });
  });
  it("rereads revoked sessions, removed passkeys and ended membership; stale session objects grant nothing", async () => {
    const revoked = await staff();
    await revokeSession(t.db, revoked.token);
    await expect(saveStaffProfile(t.db, revoked.session, intent())).rejects.toMatchObject({
      code: "unauthenticated",
    });
    const zero = await staff(0);
    await expect(readStaffProfile(t.db, zero.session)).rejects.toMatchObject({ code: "forbidden" });
    await expect(saveStaffProfile(t.db, zero.session, intent())).rejects.toMatchObject({
      code: "forbidden",
    });
    const ended = await staff();
    await t.db
      .update(staffMemberships)
      .set({ state: "ended" })
      .where(eq(staffMemberships.principalId, ended.account.id));
    await expect(saveStaffProfile(t.db, ended.session, intent())).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
  it("does not expose another staff member's receipt or allow a client to edit a staff profile", async () => {
    const owner = await staff();
    const other = await staff();
    const input = intent();
    await saveStaffProfile(t.db, owner.session, input);
    expect(await readStaffProfileOperation(t.db, other.session, input.operationId)).toBeNull();
    const client = await createClient(t.db);
    const issued = await createSession(t.db, { kind: "client", id: client.id });
    await expect(saveStaffProfile(t.db, issued.session, intent())).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await readStaffProfileOperation(t.db, owner.session, randomUUID())).toBeNull();
  });
  it("never turns an incomplete or malformed ledger outcome into a success receipt", async () => {
    const { session, account } = await staff();
    const input = intent();
    await saveStaffProfile(t.db, session, input);
    await t.db
      .update(operations)
      .set({ status: "outcome_unknown", outcome: null })
      .where(eq(operations.idempotencyKey, input.operationId));
    expect(await readStaffProfileOperation(t.db, session, input.operationId)).toMatchObject({
      status: "outcome_unknown",
      saved: null,
    });
    await t.db
      .update(operations)
      .set({
        status: "succeeded",
        outcome: { principalId: randomUUID(), version: 2, displayName: "Not this principal" },
      })
      .where(eq(operations.idempotencyKey, input.operationId));
    await expect(readStaffProfileOperation(t.db, session, input.operationId)).rejects.toMatchObject(
      { code: "outcome_unknown" },
    );
    expect(
      (await t.db.select().from(principals).where(eq(principals.id, account.id)))[0]?.version,
    ).toBe(2);
  });
});
