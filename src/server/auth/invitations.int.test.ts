import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  caseParticipants,
  externalActions,
  grants,
  invitations,
  principals,
  staffMemberships,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { can } from "../authz";
import { dispatchMessage } from "../jobs/outbox";
import { TestMessageProvider } from "../jobs/provider";
import { createCase, createClient, createStaff } from "../testing";
import { staffAccess } from "./access";
import {
  acceptStaffInvitation,
  bootstrapManager,
  inspectStaffInvitation,
  issueClientInvitation,
  issueStaffInvitation,
  issueStaffRecovery,
  respondToClientInvitation,
  revokeInvitation,
  viewClientInvitation,
} from "./invitations";
import {
  countActivePasskeys,
  finishPasskeyRegistration,
  startPasskeyRegistration,
} from "./passkeys";
import { createSession, readSession, revokeSession, type Session } from "./sessions";
import { SoftAuthenticator } from "./testing-authenticator";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
const email = () => `${randomUUID()}@example.test`;
async function enroll(session: Session) {
  for (let index = 0; index < 2; index++) {
    const key = new SoftAuthenticator();
    const options = await startPasskeyRegistration(t.db, session);
    await finishPasskeyRegistration(t.db, session, key.register(options.challenge), {
      expectedChallenge: options.challenge,
    });
  }
}
async function manager() {
  const staff = await createStaff(t.db, { roles: ["manager"] });
  const issued = await createSession(t.db, { kind: "staff", id: staff.id });
  await enroll(issued.session);
  return { ...staff, ...issued };
}
async function tokenFor(id: string) {
  const [row] = await t.db
    .select()
    .from(externalActions)
    .where(eq(externalActions.effectKey, `invitation:${id}`));
  if (!row) throw new Error("Missing invitation outbox record");
  const provider = new TestMessageProvider();
  await dispatchMessage(t.db, provider, row.id);
  return new URL(String(provider.sent[0]?.secretParams?.url)).searchParams.get("token") ?? "";
}
const accept = (token: string, currentSessionToken?: string) =>
  acceptStaffInvitation(t.db, token, { clientIp: randomUUID(), currentSessionToken });
describe("AT37–AT39: recipient-bound invitations and audited recovery", () => {
  it("bootstraps by an expiring invitation and still requires two passkeys", async () => {
    const issued = await bootstrapManager(t.db, {
      email: email(),
      displayName: "Bootstrap Manager",
    });
    const token = new URL(issued.url).searchParams.get("token") ?? "";
    expect((await inspectStaffInvitation(t.db, token)).state).toBe("pending");
    expect((await inspectStaffInvitation(t.db, token)).state).toBe("pending");
    const session = await accept(token);
    expect((await staffAccess(t.db, session.token)).state).toBe("enrolling");
    await enroll(session.session);
    expect((await staffAccess(t.db, session.token)).state).toBe("ready");
    await expect(
      bootstrapManager(t.db, { email: email(), displayName: "Another" }),
    ).rejects.toMatchObject({ code: "transition_denied" });
  });
  it("reissue invalidates the former staff link and GET never accepts either", async () => {
    const actor = await manager();
    const request = {
      session: actor.session,
      email: email(),
      displayName: "Invited Staff",
      roles: ["coordinator"] as const,
    };
    const first = await issueStaffInvitation(t.db, request);
    const old = await tokenFor(first.invitationId);
    const second = await issueStaffInvitation(t.db, request);
    const token = await tokenFor(second.invitationId);
    expect((await inspectStaffInvitation(t.db, old)).state).toBe("revoked");
    await expect(accept(old)).rejects.toMatchObject({ code: "invitation_revoked" });
    expect((await inspectStaffInvitation(t.db, token)).state).toBe("pending");
    const session = await accept(token);
    expect((await staffAccess(t.db, session.token)).state).toBe("enrolling");
    await expect(accept(token)).rejects.toMatchObject({ code: "invitation_used" });
  });
  it("refuses staff acceptance from a different signed-in account without consuming the invitation", async () => {
    const actor = await manager();
    const invite = await issueStaffInvitation(t.db, {
      session: actor.session,
      email: email(),
      displayName: "New Staff",
      roles: ["assigned_broker"],
    });
    const token = await tokenFor(invite.invitationId);
    await expect(accept(token, actor.token)).rejects.toMatchObject({ code: "not_found" });
    expect((await inspectStaffInvitation(t.db, token)).state).toBe("pending");
  });
  it("requires a live session, two enrolled keys and recent verification for grants", async () => {
    const actor = await manager();
    await revokeSession(t.db, actor.token);
    await expect(
      issueStaffInvitation(t.db, {
        session: actor.session,
        email: email(),
        displayName: "No Access",
        roles: ["coordinator"],
      }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
    const incomplete = await createStaff(t.db, { roles: ["manager"] });
    const session = await createSession(t.db, { kind: "staff", id: incomplete.id });
    await expect(
      issueStaffInvitation(t.db, {
        session: session.session,
        email: email(),
        displayName: "No Access",
        roles: ["coordinator"],
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const stale = await manager();
    await expect(
      issueStaffInvitation(t.db, {
        session: stale.session,
        email: email(),
        displayName: "No Access",
        roles: ["coordinator"],
        now: new Date(Date.now() + 301_000),
      }),
    ).rejects.toMatchObject({ code: "step_up_required" });
  });
  it("recovery records identity verification, revokes sessions and keys, and requires two new keys", async () => {
    const actor = await manager();
    const target = await manager();
    const recovered = await issueStaffRecovery(t.db, {
      session: actor.session,
      principalId: target.id,
      verificationNote: "In-person operator identity check completed.",
    });
    expect(await readSession(t.db, target.token)).toBeNull();
    expect(await countActivePasskeys(t.db, target.id)).toBe(0);
    const token = await tokenFor(recovered.invitationId);
    const session = await accept(token);
    expect((await staffAccess(t.db, session.token)).state).toBe("enrolling");
    await enroll(session.session);
    expect((await staffAccess(t.db, session.token)).state).toBe("ready");
    await expect(
      issueStaffRecovery(t.db, {
        session: actor.session,
        principalId: actor.id,
        verificationNote: "Self-recovery request",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it("acceptance rechecks inviter authority and does not consume an invitation it cannot grant", async () => {
    const actor = await manager();
    const invitation = await issueStaffInvitation(t.db, {
      session: actor.session,
      email: email(),
      displayName: "Invited",
      roles: ["manager"],
    });
    const token = await tokenFor(invitation.invitationId);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, actor.id));
    await expect(accept(token)).rejects.toMatchObject({ code: "invitation_revoked" });
    expect((await inspectStaffInvitation(t.db, token)).state).toBe("pending");
  });
  it("rejoining restores only the new roles, never former credentials or grants", async () => {
    const actor = await manager();
    const old = await manager();
    await t.db
      .update(staffMemberships)
      .set({ state: "ended" })
      .where(eq(staffMemberships.principalId, old.id));
    const invitation = await issueStaffInvitation(t.db, {
      session: actor.session,
      email: old.email,
      displayName: "Returning",
      roles: ["coordinator"],
    });
    const signedIn = await accept(await tokenFor(invitation.invitationId));
    expect(await countActivePasskeys(t.db, old.id)).toBe(0);
    expect(await can(t.db, signedIn.session.actor, "access.grant")).toBe(false);
  });
  it("client scope is invisible to a wrong account and is granted only by explicit acceptance", async () => {
    const actor = await manager();
    const caseId = await createCase(t.db, actor.id);
    const address = email();
    const invitation = await issueClientInvitation(t.db, {
      session: actor.session,
      email: address,
      displayName: "Recipient",
      caseId,
      role: "collaborator",
    });
    const [recipient] = await t.db.select().from(principals).where(eq(principals.email, address));
    if (!recipient) throw new Error("No recipient");
    const signedIn = await createSession(t.db, { kind: "client", id: recipient.id });
    const wrong = await createClient(t.db);
    const wrongSession = await createSession(t.db, { kind: "client", id: wrong.id });
    expect(await viewClientInvitation(t.db, invitation.invitationId, null)).toEqual({
      status: "sign_in_required",
    });
    expect(await viewClientInvitation(t.db, invitation.invitationId, wrongSession.session)).toEqual(
      { status: "unavailable" },
    );
    expect(
      (await viewClientInvitation(t.db, invitation.invitationId, signedIn.session)).status,
    ).toBe("pending");
    expect(
      await can(t.db, signedIn.session.actor, "portal.case.read", { type: "case", id: caseId }),
    ).toBe(false);
    await expect(
      respondToClientInvitation(t.db, invitation.invitationId, wrongSession.session, "accept", {
        clientIp: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await respondToClientInvitation(t.db, invitation.invitationId, signedIn.session, "accept", {
      clientIp: randomUUID(),
    });
    expect(
      await can(t.db, signedIn.session.actor, "portal.case.read", { type: "case", id: caseId }),
    ).toBe(true);
    await t.db
      .update(caseParticipants)
      .set({ revokedAt: new Date() })
      .where(eq(caseParticipants.partyId, recipient.partyId));
    expect(await viewClientInvitation(t.db, invitation.invitationId, signedIn.session)).toEqual({
      status: "unavailable",
    });
    await expect(
      respondToClientInvitation(t.db, invitation.invitationId, signedIn.session, "accept", {
        clientIp: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "invitation_used" });
  });
  it("revoked and expired client invitations expose no private case details", async () => {
    const actor = await manager();
    const client = await createClient(t.db);
    const signedIn = await createSession(t.db, { kind: "client", id: client.id });
    const invitation = await issueClientInvitation(t.db, {
      session: actor.session,
      email: client.email,
      displayName: "Client",
      caseId: await createCase(t.db),
      role: "buyer",
    });
    await revokeInvitation(t.db, { session: actor.session, invitationId: invitation.invitationId });
    expect(await viewClientInvitation(t.db, invitation.invitationId, signedIn.session)).toEqual({
      status: "revoked",
    });
    const [row] = await t.db
      .select()
      .from(invitations)
      .where(eq(invitations.id, invitation.invitationId));
    expect(row?.acceptedAt).toBeNull();
  });
  it("72-hour expiry refuses both staff enrollment and private client scope", async () => {
    const actor = await manager();
    const staffInvitation = await issueStaffInvitation(t.db, {
      session: actor.session,
      email: email(),
      displayName: "Expired",
      roles: ["coordinator"],
    });
    const token = await tokenFor(staffInvitation.invitationId);
    await t.db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(invitations.id, staffInvitation.invitationId));
    await expect(accept(token)).rejects.toMatchObject({ code: "invitation_expired" });
    const client = await createClient(t.db);
    const session = await createSession(t.db, { kind: "client", id: client.id });
    const clientInvitation = await issueClientInvitation(t.db, {
      session: actor.session,
      email: client.email,
      displayName: "Expired",
      caseId: await createCase(t.db),
      role: "buyer",
    });
    await t.db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(invitations.id, clientInvitation.invitationId));
    expect(
      await viewClientInvitation(t.db, clientInvitation.invitationId, session.session),
    ).toEqual({ status: "expired" });
    await expect(
      respondToClientInvitation(t.db, clientInvitation.invitationId, session.session, "accept", {
        clientIp: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "invitation_expired" });
  });
  it("concurrent confirmations grant one participation; a later invitation updates its exact scope", async () => {
    const actor = await manager();
    const client = await createClient(t.db);
    const session = await createSession(t.db, { kind: "client", id: client.id });
    const caseId = await createCase(t.db);
    const invite = await issueClientInvitation(t.db, {
      session: actor.session,
      email: client.email,
      displayName: "Recipient",
      caseId,
      role: "guest",
      capabilities: ["portal.document.upload"],
    });
    const outcomes = await Promise.allSettled(
      [1, 2, 3].map(() =>
        respondToClientInvitation(t.db, invite.invitationId, session.session, "accept", {
          clientIp: randomUUID(),
        }),
      ),
    );
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const participants = await t.db
      .select()
      .from(caseParticipants)
      .where(eq(caseParticipants.partyId, client.partyId));
    expect(participants).toHaveLength(1);
    expect(participants[0]?.scope).toEqual({ capabilities: ["portal.document.upload"] });
    const narrow = await issueClientInvitation(t.db, {
      session: actor.session,
      email: client.email,
      displayName: "Recipient",
      caseId,
      role: "guest",
    });
    await respondToClientInvitation(t.db, narrow.invitationId, session.session, "accept", {
      clientIp: randomUUID(),
    });
    const [after] = await t.db
      .select()
      .from(caseParticipants)
      .where(eq(caseParticipants.partyId, client.partyId));
    expect(after?.scope).toEqual({ capabilities: [] });
  });
});
