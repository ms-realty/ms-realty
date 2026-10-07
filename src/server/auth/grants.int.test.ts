import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { auditEvents, grants, sessions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { can } from "../authz";
import { createStaff, type GrantSpec } from "../testing";
import { grantStaffCapability, revokeStaffGrant } from "./grants";
import { finishPasskeyRegistration, startPasskeyRegistration } from "./passkeys";
import { createSession, readSession } from "./sessions";
import { SoftAuthenticator } from "./testing-authenticator";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function member(manager = true, extra: GrantSpec[] = []) {
  const staff = await createStaff(t.db, {
    roles: manager ? ["manager"] : ["coordinator"],
    grants: extra,
  });
  const issued = await createSession(t.db, { kind: "staff", id: staff.id });
  for (let index = 0; index < 2; index++) {
    const options = await startPasskeyRegistration(t.db, issued.session);
    await finishPasskeyRegistration(
      t.db,
      issued.session,
      new SoftAuthenticator().register(options.challenge),
      { expectedChallenge: options.challenge },
    );
  }
  return { ...staff, ...issued };
}
const globalScope = { recordType: null, recordId: null, locales: null, expiresAt: null };
it("retains the last usable access manager and records a receipt when another manager can take over", async () => {
  const sole = await member();
  const [role] = await t.db
    .select()
    .from(grants)
    .where(and(eq(grants.principalId, sole.id), eq(grants.role, "manager")));
  if (!role) throw new Error("Missing manager grant");
  await expect(
    revokeStaffGrant(t.db, sole.session, {
      operationId: randomUUID(),
      grantId: role.id,
      expectedRevision: role.version,
      reason: "Hand over agency access management",
    }),
  ).rejects.toMatchObject({ code: "transition_denied" });
  expect(await can(t.db, sole.actor, "access.grant")).toBe(true);
  await member();
  const changed = await revokeStaffGrant(t.db, sole.session, {
    operationId: randomUUID(),
    grantId: role.id,
    expectedRevision: role.version,
    reason: "Hand over agency access management",
  });
  expect(changed.operationId).toMatch(/^[a-f0-9-]{36}$/);
  expect(await can(t.db, sole.actor, "access.grant")).toBe(false);
  expect(await readSession(t.db, sole.token)).toBeNull();
});
it("grants an explicit review capability without modifying role presets, ends target sessions, and returns one receipt on retry", async () => {
  const manager = await member();
  const target = await member(false);
  const input = {
    operationId: randomUUID(),
    principalId: target.id,
    capability: "document.review",
    scope: globalScope,
    reason: "Assigned to review signed seller evidence",
  };
  const first = await grantStaffCapability(t.db, manager.session, input);
  const again = await grantStaffCapability(t.db, manager.session, input);
  expect(again.replayed).toBe(true);
  expect(again.operationId).toBe(first.operationId);
  expect(await can(t.db, target.actor, "document.review")).toBe(true);
  expect(await can(t.db, target.actor, "claim.approve")).toBe(false);
  expect(await readSession(t.db, target.token)).toBeNull();
  const events = await t.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.operationId, first.operationId));
  expect(events).toHaveLength(1);
  expect(events[0]?.action).toBe("access.capability.granted");
});
it("allows an explicit self-grant but invalidates that authenticated session", async () => {
  const manager = await member();
  await grantStaffCapability(t.db, manager.session, {
    operationId: randomUUID(),
    principalId: manager.id,
    capability: "document.review",
    scope: globalScope,
    reason: "Operator is responsible for evidence review",
  });
  expect(await can(t.db, manager.actor, "document.review")).toBe(true);
  expect(await readSession(t.db, manager.token)).toBeNull();
});
it("scope-limited grant managers cannot widen record, capability, expiry or locale", async () => {
  const id = randomUUID();
  const expiry = new Date(Date.now() + 3_600_000);
  const scoped = await member(false, [
    {
      capability: "access.grant",
      recordType: "document",
      recordId: id,
      locales: ["bg"],
      expiresAt: expiry,
    },
    {
      capability: "document.review",
      recordType: "document",
      recordId: id,
      locales: ["bg"],
      expiresAt: expiry,
    },
  ]);
  const target = await member(false);
  const input = {
    operationId: randomUUID(),
    principalId: target.id,
    capability: "document.review",
    scope: {
      recordType: "document",
      recordId: id,
      locales: ["bg"],
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    },
    reason: "Scoped temporary review assignment",
  };
  for (const scope of [
    globalScope,
    { ...input.scope, recordId: randomUUID() },
    { ...input.scope, locales: null },
    { ...input.scope, expiresAt: null },
    { ...input.scope, locales: ["en"] },
  ])
    await expect(
      grantStaffCapability(t.db, scoped.session, { ...input, operationId: randomUUID(), scope }),
    ).rejects.toMatchObject({ code: "forbidden" });
  await expect(
    grantStaffCapability(t.db, scoped.session, { ...input, capability: "claim.approve" }),
  ).rejects.toMatchObject({ code: "forbidden" });
  await expect(grantStaffCapability(t.db, scoped.session, input)).resolves.toMatchObject({
    replayed: false,
  });
});
it("canonical session freshness and active authorization are checked before any receipt replay", async () => {
  const manager = await member();
  const target = await member(false);
  const input = {
    operationId: randomUUID(),
    principalId: target.id,
    capability: "document.review",
    scope: globalScope,
    reason: "Scoped temporary review assignment",
  };
  await grantStaffCapability(t.db, manager.session, input);
  await t.db
    .update(sessions)
    .set({ reverifiedAt: new Date(Date.now() - 6 * 60_000) })
    .where(eq(sessions.id, manager.session.id));
  await expect(grantStaffCapability(t.db, manager.session, input)).rejects.toMatchObject({
    code: "step_up_required",
  });
  const unrelated = await member(false);
  await expect(
    grantStaffCapability(t.db, unrelated.session, { ...input, operationId: randomUUID() }),
  ).rejects.toMatchObject({ code: "forbidden" });
});
