import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { caseParticipants, cases, invitations, passkeys } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { can } from "../authz";
import { revokeCaseParticipant } from "../cases/participants";
import { createCase, createClient, createStaff } from "../testing";
import {
  invitationTtlMs,
  issueClientInvitation,
  respondToClientInvitation,
  viewClientInvitation,
} from "./invitations";
import { createSession } from "./sessions";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
const future = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
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
  const caseId = await createCase(t.db, staff.id);
  const request = {
    session: signedStaff.session,
    email: client.email,
    displayName: "Synthetic specialist",
    caseId,
    role: "specialist" as const,
  };
  return {
    staff: { ...staff, ...signedStaff },
    client: { ...client, ...signedClient },
    caseId,
    request,
  };
}

it.each([undefined, null, "", "invalid", "2020-01-01T00:00:00Z"])(
  "requires a valid future specialist access expiry (%s)",
  async (accessExpiresAt) => {
    const f = await fixture();
    await expect(
      issueClientInvitation(t.db, { ...f.request, accessExpiresAt }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    expect(
      await t.db.select().from(invitations).where(eq(invitations.principalId, f.client.id)),
    ).toEqual([]);
  },
);

it("shows the exact access end separately from the 72-hour invitation and copies it to accepted participation", async () => {
  const f = await fixture();
  const accessExpiresAt = future(120);
  const sent = await issueClientInvitation(t.db, { ...f.request, accessExpiresAt });
  const [stored] = await t.db
    .select()
    .from(invitations)
    .where(eq(invitations.id, sent.invitationId));
  expect(stored?.expiresAt.getTime()).toBe((stored?.createdAt.getTime() ?? 0) + invitationTtlMs);
  expect(stored?.scope).toMatchObject({ accessExpiresAt });
  expect(await viewClientInvitation(t.db, sent.invitationId, f.client.session)).toMatchObject({
    status: "pending",
    details: { accessExpiresAt: new Date(accessExpiresAt), expiresAt: sent.expiresAt },
  });
  await respondToClientInvitation(t.db, sent.invitationId, f.client.session, "accept", {
    clientIp: randomUUID(),
  });
  const [participant] = await t.db
    .select()
    .from(caseParticipants)
    .where(eq(caseParticipants.caseId, f.caseId));
  expect(participant?.expiresAt).toEqual(new Date(accessExpiresAt));
  expect(await can(t.db, f.client.actor, "portal.case.read", { type: "case", id: f.caseId })).toBe(
    true,
  );
  expect(
    await can(
      t.db,
      f.client.actor,
      "portal.case.read",
      { type: "case", id: f.caseId },
      new Date(new Date(accessExpiresAt).getTime() + 1),
    ),
  ).toBe(false);
});

it("refuses a still-pending 72-hour invitation after its shorter access window has ended", async () => {
  const f = await fixture();
  const accessExpiresAt = future(1);
  const sent = await issueClientInvitation(t.db, { ...f.request, accessExpiresAt });
  const now = new Date(new Date(accessExpiresAt).getTime() + 1);
  expect(await viewClientInvitation(t.db, sent.invitationId, f.client.session, now)).toEqual({
    status: "expired",
  });
  await expect(
    respondToClientInvitation(t.db, sent.invitationId, f.client.session, "accept", {
      clientIp: randomUUID(),
      now,
    }),
  ).rejects.toMatchObject({ code: "invitation_expired" });
  const [row] = await t.db.select().from(invitations).where(eq(invitations.id, sent.invitationId));
  expect(row?.acceptedAt).toBeNull();
});

it("narrows active specialist scope and expiry, and later invitations cannot silently extend that live expiry", async () => {
  const f = await fixture();
  const first = await issueClientInvitation(t.db, {
    ...f.request,
    accessExpiresAt: future(120),
    capabilities: ["portal.message.write"],
  });
  await respondToClientInvitation(t.db, first.invitationId, f.client.session, "accept", {
    clientIp: randomUUID(),
  });
  const shorter = future(30);
  const second = await issueClientInvitation(t.db, { ...f.request, accessExpiresAt: shorter });
  await respondToClientInvitation(t.db, second.invitationId, f.client.session, "accept", {
    clientIp: randomUUID(),
  });
  const third = await issueClientInvitation(t.db, { ...f.request, accessExpiresAt: future(240) });
  expect(await viewClientInvitation(t.db, third.invitationId, f.client.session)).toMatchObject({
    details: { accessExpiresAt: new Date(shorter) },
  });
  await respondToClientInvitation(t.db, third.invitationId, f.client.session, "accept", {
    clientIp: randomUUID(),
  });
  const rows = await t.db
    .select()
    .from(caseParticipants)
    .where(and(eq(caseParticipants.caseId, f.caseId), isNull(caseParticipants.revokedAt)));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ expiresAt: new Date(shorter), scope: { capabilities: [] } });
  expect(
    await can(t.db, f.client.actor, "portal.message.write", { type: "case", id: f.caseId }),
  ).toBe(false);
  const oldView = await viewClientInvitation(t.db, first.invitationId, f.client.session);
  expect(oldView).toMatchObject({
    status: "accepted",
    details: { accessExpiresAt: new Date(shorter) },
  });
  if (oldView.status === "accepted")
    expect(oldView.details.capabilities).not.toContain("portal.message.write");
});

it("an accepted invitation cannot regrant revoked access or extend a later explicitly granted participation", async () => {
  const f = await fixture();
  const first = await issueClientInvitation(t.db, { ...f.request, accessExpiresAt: future(120) });
  await respondToClientInvitation(t.db, first.invitationId, f.client.session, "accept", {
    clientIp: randomUUID(),
  });
  const [participant] = await t.db
    .select()
    .from(caseParticipants)
    .where(eq(caseParticipants.caseId, f.caseId));
  const [record] = await t.db.select().from(cases).where(eq(cases.id, f.caseId));
  if (!participant || !record) throw new Error("Missing accepted fixture");
  await revokeCaseParticipant(t.db, f.staff.session, {
    id: f.caseId,
    participantId: participant.id,
    expectedVersion: record.version,
    operationId: randomUUID(),
    reason: "Synthetic staff removal",
  });
  const replacement = await issueClientInvitation(t.db, {
    ...f.request,
    accessExpiresAt: future(10),
  });
  await respondToClientInvitation(t.db, replacement.invitationId, f.client.session, "accept", {
    clientIp: randomUUID(),
  });
  await expect(
    respondToClientInvitation(t.db, first.invitationId, f.client.session, "accept", {
      clientIp: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "invitation_used" });
  expect(await viewClientInvitation(t.db, first.invitationId, f.client.session)).toEqual({
    status: "unavailable",
  });
  expect(
    await viewClientInvitation(t.db, replacement.invitationId, f.client.session),
  ).toMatchObject({ status: "accepted" });
});
