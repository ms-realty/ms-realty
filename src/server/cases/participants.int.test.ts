import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  auditEvents,
  caseParticipants,
  cases,
  documents,
  grants,
  invitations,
  passkeys,
  sessions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import {
  issueClientInvitation,
  respondToClientInvitation,
  viewClientInvitation,
} from "../auth/invitations";
import { createSession, requireLiveSession } from "../auth/sessions";
import { can } from "../authz";
import { createCase, createClient, createStaff } from "../testing";
import {
  listCaseParticipants,
  listClientCaseParticipants,
  revokeCaseParticipant,
} from "./participants";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

async function fixture() {
  const staff = await createStaff(t.db, { roles: ["manager"] });
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: staff.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const signedStaff = await createSession(t.db, { kind: "staff", id: staff.id });
  const client = await createClient(t.db);
  const signedClient = await createSession(t.db, { kind: "client", id: client.id });
  const id = await createCase(t.db, staff.id);
  const [participant] = await t.db
    .insert(caseParticipants)
    .values({ caseId: id, partyId: client.partyId, role: "buyer" })
    .returning();
  if (!participant) throw new Error("Missing participant");
  const command = {
    id,
    participantId: participant.id,
    expectedVersion: 1,
    operationId: randomUUID(),
    reason: "Explicit synthetic removal request",
  };
  return {
    staff: { ...staff, ...signedStaff },
    client: { ...client, ...signedClient },
    participant,
    id,
    command,
  };
}

async function caseVersion(id: string) {
  const [row] = await t.db.select({ version: cases.version }).from(cases).where(eq(cases.id, id));
  if (!row) throw new Error("Missing Case");
  return row.version;
}

async function invitation(
  f: Awaited<ReturnType<typeof fixture>>,
  role: "buyer" | "guest" = "guest",
) {
  return issueClientInvitation(t.db, {
    session: f.staff.session,
    email: f.client.email,
    displayName: "Synthetic recipient",
    caseId: f.id,
    role,
  });
}

it("revokes every role and exact Case/document grant plus pending invitations without touching another Case or the client session", async () => {
  const f = await fixture();
  const otherId = await createCase(t.db, f.staff.id);
  await t.db.insert(caseParticipants).values([
    { caseId: f.id, partyId: f.client.partyId, role: "collaborator" },
    { caseId: otherId, partyId: f.client.partyId, role: "buyer" },
  ]);
  const docs = await t.db
    .insert(documents)
    .values(
      [f.id, otherId].map((caseId) => ({
        reference: `DOC-${randomUUID()}`,
        caseId,
        purpose: "client_evidence",
        classification: "other" as const,
        audience: "case_participants" as const,
      })),
    )
    .returning();
  const held = await t.db
    .insert(grants)
    .values([
      {
        principalId: f.client.id,
        capability: "portal.case.read",
        recordType: "case",
        recordId: f.id,
        reason: "Synthetic explicit Case grant",
      },
      ...docs.map((doc) => ({
        principalId: f.client.id,
        capability: "portal.document.upload" as const,
        recordType: "document",
        recordId: doc.id,
        reason: "Synthetic explicit document grant",
      })),
    ])
    .returning();
  const pending = await invitation(f);
  const otherPending = await issueClientInvitation(t.db, {
    session: f.staff.session,
    email: f.client.email,
    displayName: "Synthetic recipient",
    caseId: otherId,
    role: "guest",
  });
  const command = { ...f.command, expectedVersion: await caseVersion(f.id) };
  const result = await revokeCaseParticipant(t.db, f.staff.session, command);
  expect(result.outcome.revokedParticipantIds).toHaveLength(2);
  expect(result.outcome.revokedGrantCount).toBe(2);
  expect(result.outcome.revokedInvitationIds).toEqual([pending.invitationId]);
  expect((await revokeCaseParticipant(t.db, f.staff.session, command)).replayed).toBe(true);
  expect(await can(t.db, f.client.actor, "portal.case.read", { type: "case", id: f.id })).toBe(
    false,
  );
  expect(await can(t.db, f.client.actor, "portal.case.read", { type: "case", id: otherId })).toBe(
    true,
  );
  const [otherInvite] = await t.db
    .select()
    .from(invitations)
    .where(eq(invitations.id, otherPending.invitationId));
  expect(otherInvite?.revokedAt).toBeNull();
  for (const grant of held) {
    const [stored] = await t.db.select().from(grants).where(eq(grants.id, grant.id));
    const otherDocument = docs.find((doc) => doc.caseId === otherId);
    expect(Boolean(stored?.revokedAt)).toBe(grant.recordId !== otherDocument?.id);
  }
  await expect(requireLiveSession(t.db, f.client.session)).resolves.toMatchObject({
    id: f.client.session.id,
  });
  const audit = await t.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.recordId, f.id), eq(auditEvents.action, "case.participant.revoked")));
  expect(audit).toHaveLength(1);
  expect(audit[0]?.payload).toMatchObject({ reason: command.reason, revokedGrantCount: 2 });
});

it("rejects stale versions, another Case's participant, stale authentication and another Case's manager grant", async () => {
  const f = await fixture();
  await expect(
    revokeCaseParticipant(t.db, f.staff.session, { ...f.command, expectedVersion: 2 }),
  ).rejects.toMatchObject({ code: "version_conflict" });
  const otherId = await createCase(t.db, f.staff.id);
  await expect(
    revokeCaseParticipant(t.db, f.staff.session, {
      ...f.command,
      id: otherId,
      operationId: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "not_found" });
  await t.db
    .update(sessions)
    .set({ reverifiedAt: new Date(Date.now() - 6 * 60_000) })
    .where(eq(sessions.id, f.staff.session.id));
  await expect(revokeCaseParticipant(t.db, f.staff.session, f.command)).rejects.toMatchObject({
    code: "step_up_required",
  });
  await t.db
    .update(sessions)
    .set({ reverifiedAt: new Date() })
    .where(eq(sessions.id, f.staff.session.id));
  await t.db
    .update(grants)
    .set({ revokedAt: new Date() })
    .where(eq(grants.principalId, f.staff.id));
  await t.db.insert(grants).values({
    principalId: f.staff.id,
    capability: "access.grant",
    recordType: "case",
    recordId: otherId,
    reason: "Synthetic scoped manager grant",
  });
  await expect(
    revokeCaseParticipant(t.db, f.staff.session, { ...f.command, operationId: randomUUID() }),
  ).rejects.toMatchObject({ code: "forbidden" });
  const [participant] = await t.db
    .select()
    .from(caseParticipants)
    .where(eq(caseParticipants.id, f.participant.id));
  expect(participant?.revokedAt).toBeNull();
});

function gate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function waitsOn(pid: number) {
  await expect
    .poll(
      async () => {
        const [row] = await t.sql<
          { count: number }[]
        >`select count(*)::int as count from pg_stat_activity where datname=current_database() and ${pid} = any(pg_blocking_pids(pid))`;
        return row?.count ?? 0;
      },
      { timeout: 2000, interval: 10 },
    )
    .toBeGreaterThan(0);
}

it("accept then revoke serializes on the real Case row and removes the just-accepted additional role", async () => {
  const f = await fixture();
  const pending = await invitation(f);
  const before = await caseVersion(f.id);
  const ready = gate(),
    release = gate();
  let pid = 0;
  const first = t.db.transaction(async (tx) => {
    const result = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    pid = result[0]?.pid ?? 0;
    await respondToClientInvitation(tx, pending.invitationId, f.client.session, "accept", {
      clientIp: randomUUID(),
    });
    ready.release();
    await release.promise;
  });
  await Promise.race([ready.promise, first]);
  const second = revokeCaseParticipant(t.db, f.staff.session, {
    ...f.command,
    expectedVersion: before + 1,
  });
  try {
    await waitsOn(pid);
  } finally {
    release.release();
  }
  await first;
  await second;
  expect(await can(t.db, f.client.actor, "portal.case.read", { type: "case", id: f.id })).toBe(
    false,
  );
  await expect(
    respondToClientInvitation(t.db, pending.invitationId, f.client.session, "accept", {
      clientIp: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "invitation_used" });
  expect(await viewClientInvitation(t.db, pending.invitationId, f.client.session)).toEqual({
    status: "unavailable",
  });
});

it("revoke then accept serializes on the same Case row and the pending invitation cannot restore access", async () => {
  const f = await fixture();
  const pending = await invitation(f);
  const expectedVersion = await caseVersion(f.id);
  const ready = gate(),
    release = gate();
  let pid = 0;
  const first = t.db.transaction(async (tx) => {
    const result = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    pid = result[0]?.pid ?? 0;
    await revokeCaseParticipant(tx, f.staff.session, { ...f.command, expectedVersion });
    ready.release();
    await release.promise;
  });
  await Promise.race([ready.promise, first]);
  const second = respondToClientInvitation(t.db, pending.invitationId, f.client.session, "accept", {
    clientIp: randomUUID(),
  }).then(
    () => null,
    (error: unknown) => error,
  );
  try {
    await waitsOn(pid);
  } finally {
    release.release();
  }
  await first;
  expect(await second).toMatchObject({ code: "invitation_revoked" });
  expect(await can(t.db, f.client.actor, "portal.case.read", { type: "case", id: f.id })).toBe(
    false,
  );
});

it.each(["session", "passkey", "grant"] as const)(
  "rechecks the staff %s after waiting for the Case lock",
  async (revoke) => {
    const f = await fixture();
    const ready = gate(),
      release = gate();
    let pid = 0;
    const holder = t.db.transaction(async (tx) => {
      const result = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      pid = result[0]?.pid ?? 0;
      await tx.select().from(cases).where(eq(cases.id, f.id)).for("update");
      ready.release();
      await release.promise;
    });
    await ready.promise;
    const mutation = revokeCaseParticipant(t.db, f.staff.session, f.command).then(
      () => null,
      (error: unknown) => error,
    );
    try {
      await waitsOn(pid);
      if (revoke === "session")
        await t.db
          .update(sessions)
          .set({ revokedAt: new Date() })
          .where(eq(sessions.id, f.staff.session.id));
      else if (revoke === "passkey")
        await t.db
          .update(passkeys)
          .set({ revokedAt: new Date() })
          .where(eq(passkeys.principalId, f.staff.id));
      else
        await t.db
          .update(grants)
          .set({ revokedAt: new Date() })
          .where(eq(grants.principalId, f.staff.id));
    } finally {
      release.release();
    }
    await holder;
    expect(await mutation).toMatchObject({
      code: revoke === "session" ? "unauthenticated" : "forbidden",
    });
    const [participant] = await t.db
      .select()
      .from(caseParticipants)
      .where(eq(caseParticipants.id, f.participant.id));
    expect(participant?.revokedAt).toBeNull();
  },
);

it("returns a client-safe participant list and stops reads after revocation", async () => {
  const f = await fixture();
  const other = await createClient(t.db);
  await t.db
    .insert(caseParticipants)
    .values({ caseId: f.id, partyId: other.partyId, role: "collaborator" });
  const pending = await invitation(f);
  const staff = await listCaseParticipants(t.db, f.staff.session, f.id);
  expect(staff.pendingInvitations.map((row) => row.id)).toEqual([pending.invitationId]);
  const view = await listClientCaseParticipants(t.db, f.client.session, f.id);
  expect(view.participants).toHaveLength(2);
  for (const row of view.participants)
    expect(Object.keys(row).sort()).toEqual([
      "accessExpiresAt",
      "capabilities",
      "displayName",
      "id",
      "isSelf",
      "role",
    ]);
  expect(JSON.stringify(view)).not.toContain(other.email);
  expect(JSON.stringify(view)).not.toContain(other.partyId);
  await revokeCaseParticipant(t.db, f.staff.session, {
    ...f.command,
    expectedVersion: staff.case.version,
  });
  await expect(listClientCaseParticipants(t.db, f.client.session, f.id)).rejects.toMatchObject({
    code: "not_found",
  });
});

it("rolls participation, invitation, grants and Case version back if the audit write fails", async () => {
  const f = await fixture();
  const pending = await invitation(f);
  const expectedVersion = await caseVersion(f.id);
  const [grant] = await t.db
    .insert(grants)
    .values({
      principalId: f.client.id,
      capability: "portal.case.read",
      recordType: "case",
      recordId: f.id,
      reason: "Synthetic explicit Case access",
    })
    .returning();
  if (!grant) throw new Error("Missing grant");
  await t.sql.unsafe(
    `create function reject_participant_audit() returns trigger language plpgsql as $$ begin if new.action = 'case.participant.revoked' then raise exception 'synthetic audit failure'; end if; return new; end $$`,
  );
  await t.sql.unsafe(
    `create trigger reject_participant_audit before insert on audit_events for each row execute function reject_participant_audit()`,
  );
  try {
    await expect(
      revokeCaseParticipant(t.db, f.staff.session, { ...f.command, expectedVersion }),
    ).rejects.toThrow();
  } finally {
    await t.sql.unsafe(`drop trigger reject_participant_audit on audit_events`);
    await t.sql.unsafe(`drop function reject_participant_audit()`);
  }
  expect(await caseVersion(f.id)).toBe(expectedVersion);
  const [participant] = await t.db
    .select()
    .from(caseParticipants)
    .where(eq(caseParticipants.id, f.participant.id));
  const [storedGrant] = await t.db.select().from(grants).where(eq(grants.id, grant.id));
  const [storedInvite] = await t.db
    .select()
    .from(invitations)
    .where(eq(invitations.id, pending.invitationId));
  expect(participant?.revokedAt).toBeNull();
  expect(storedGrant?.revokedAt).toBeNull();
  expect(storedInvite?.revokedAt).toBeNull();
});

it("does not replay a revocation receipt after the staff manager grant is revoked", async () => {
  const f = await fixture();
  await revokeCaseParticipant(t.db, f.staff.session, f.command);
  await t.db
    .update(grants)
    .set({ revokedAt: new Date() })
    .where(eq(grants.principalId, f.staff.id));
  await expect(revokeCaseParticipant(t.db, f.staff.session, f.command)).rejects.toMatchObject({
    code: "forbidden",
  });
});
