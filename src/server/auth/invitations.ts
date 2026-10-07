// Invitations (architecture §8.3, ADR 0002): scoped, recipient-bound, 72 hours; opening one
// never consumes it; an explicit POST redeems it; a reissue revokes the one it replaces.
//
// - Staff enrolment: a manager (access.grant, fresh step-up) invites an address. The emailed
//   single-use token is the only proof the recipient has at that point; redeeming it opens the
//   membership and a session that can do nothing but enrol two passkeys (access.ts).
// - Staff recovery (lost factor): a manager issues it for another member. Issuing revokes that
//   member's sessions and passkeys; redeeming it requires a fresh two-passkey enrolment.
// - Break-glass bootstrap of the first manager: a CLI prints a one-hour enrolment link.
// - Client access: tied to the recipient's client principal. It shows its details, and can be
//   accepted or declined, only in that principal's signed-in session; to anyone else it is
//   indistinguishable from an unknown invitation.
// The inviter's authority is re-checked when the invitation is redeemed.
import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  caseParticipants,
  cases,
  grants,
  invitations,
  parties,
  passkeys,
  principals,
  staffMemberships,
} from "@/db/schema";
import { type Actor, type Capability, capabilities, type Role } from "@/domain/capabilities";
import type { PublicLocale } from "@/domain/ids";
import { type ParticipantRole, participantRoles } from "@/domain/parties";
import { firstPartyIssuers } from "@/domain/records";
import { recordAudit } from "../audit";
import { can, relationshipCapabilities } from "../authz";
import { getEnv } from "../config/env";
import { randomToken, sha256Hex } from "../crypto";
import type { Executor, Transaction } from "../db";
import { AppError } from "../errors";
import { enqueueMessage } from "../jobs/outbox";
import type { JobQueue } from "../jobs/queue";
import { enforceRateLimit } from "../rate-limit";
import { countActivePasskeys, staffPasskeyMinimum } from "./passkeys";
import {
  type AccountKind,
  createSession,
  type IssuedSession,
  requireFreshAuth,
  requireLiveSession,
  resolveSession,
  revokeAllSessions,
  revokeSession,
  type Session,
} from "./sessions";

const hour = 3_600_000;
export const invitationTtlMs = 72 * hour;
/** The bootstrap link is printed to a terminal; it lives for one hour. */
export const bootstrapTtlMs = hour;

/** Roles a staff invitation may carry. */
export const staffRoles = [
  "assigned_broker",
  "coordinator",
  "content_editor",
  "translation_reviewer",
  "publishing_approver",
  "manager",
] as const satisfies readonly Role[];
export type StaffRole = (typeof staffRoles)[number];

type InvitationRow = typeof invitations.$inferSelect;
type StaffInvitationKind = "staff_enrolment" | "staff_recovery";
const staffKinds: StaffInvitationKind[] = ["staff_enrolment", "staff_recovery"];

export type InvitationState = "pending" | "accepted" | "declined" | "revoked" | "expired";

export function invitationState(row: InvitationRow, now: Date): InvitationState {
  if (row.acceptedAt) return "accepted";
  if (row.declinedAt) return "declined";
  if (row.revokedAt) return "revoked";
  return now >= row.expiresAt ? "expired" : "pending";
}

const stateErrors = {
  accepted: "invitation_used",
  declined: "invitation_used",
  revoked: "invitation_revoked",
  expired: "invitation_expired",
} as const;

const emailSchema = z.email().max(254);

function parseEmail(value: string): string {
  const parsed = emailSchema.safeParse(value.trim());
  if (!parsed.success) {
    throw new AppError("validation_failed", { fieldErrors: { email: ["invalid_email"] } });
  }
  return parsed.data.toLowerCase();
}

function parseDisplayName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) {
    throw new AppError("validation_failed", { fieldErrors: { displayName: ["invalid_name"] } });
  }
  return name;
}

/** A sensitive staff action: an active staff session, fresh within 5 minutes, with the grant. */
async function assertMayGrant(
  db: Executor,
  session: Session,
  now: Date,
  resource?: { type: string; id: string },
): Promise<void> {
  if (session.account.kind !== "staff") throw new AppError("forbidden");
  session = await requireLiveSession(db, session, now);
  requireFreshAuth(session, now);
  if ((await countActivePasskeys(db, session.account.id)) < staffPasskeyMinimum) {
    throw new AppError("forbidden");
  }
  if (!(await can(db, session.actor, "access.grant", resource, now))) {
    throw new AppError("forbidden");
  }
}

/** The principal with this address in this context, created (with its party) if missing. */
async function ensurePrincipal(
  tx: Transaction,
  kind: AccountKind,
  email: string,
  displayName: string,
  locale: PublicLocale,
): Promise<{ id: string; partyId: string; created: boolean }> {
  const [existing] = await tx
    .select({ id: principals.id, partyId: principals.partyId })
    .from(principals)
    .where(and(eq(principals.kind, kind), eq(sql`lower(${principals.email})`, email)));
  if (existing) return { ...existing, created: false };
  const [party] = await tx
    .insert(parties)
    .values({ kind: "person", displayName })
    .returning({ id: parties.id });
  if (!party) throw new Error("Party insert returned no row.");
  const [principal] = await tx
    .insert(principals)
    .values({
      kind,
      issuer: firstPartyIssuers[kind],
      subject: randomUUID(),
      partyId: party.id,
      email,
      displayName,
      preferredLocale: locale,
    })
    .returning({ id: principals.id });
  if (!principal) throw new Error("Principal insert returned no row.");
  return { id: principal.id, partyId: party.id, created: true };
}

/** Revokes every pending invitation of the principal matching `extra` (the reissue rule). */
async function revokePending(
  tx: Executor,
  principalId: string,
  kinds: readonly InvitationRow["kind"][],
  now: Date,
  extra?: ReturnType<typeof sql>,
): Promise<number> {
  const rows = await tx
    .update(invitations)
    .set({ revokedAt: now })
    .where(
      and(
        eq(invitations.principalId, principalId),
        inArray(invitations.kind, [...kinds]),
        isNull(invitations.acceptedAt),
        isNull(invitations.declinedAt),
        isNull(invitations.revokedAt),
        ...(extra ? [extra] : []),
      ),
    )
    .returning({ id: invitations.id });
  return rows.length;
}

/** The staff-host page that shows a staff invitation (GET) and redeems it (its POST). */
export function staffInvitationUrl(staffOrigin: string, locale: string, token: string): string {
  const url = new URL(`/${locale}/access/invitation`, staffOrigin);
  url.searchParams.set("token", token);
  return url.toString();
}

/** The client-host page of a client invitation. It carries no secret. */
export function clientInvitationUrl(clientOrigin: string, locale: string, id: string): string {
  return new URL(`/${locale}/invitations/${id}`, clientOrigin).toString();
}

interface NewStaffInvitation {
  readonly kind: StaffInvitationKind;
  readonly principalId: string;
  readonly email: string;
  readonly roles: readonly StaffRole[];
  readonly invitedById: string | null;
  readonly locale: PublicLocale;
  readonly ttlMs: number;
  readonly now: Date;
}

async function insertStaffInvitation(
  tx: Transaction,
  invitation: NewStaffInvitation,
  queue?: JobQueue,
): Promise<{ id: string; url: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(invitation.now.getTime() + invitation.ttlMs);
  const [row] = await tx
    .insert(invitations)
    .values({
      kind: invitation.kind,
      principalId: invitation.principalId,
      email: invitation.email,
      tokenHash: sha256Hex(token),
      scope: invitation.kind === "staff_enrolment" ? { roles: invitation.roles } : {},
      invitedById: invitation.invitedById,
      locale: invitation.locale,
      createdAt: invitation.now,
      expiresAt,
    })
    .returning({ id: invitations.id });
  if (!row) throw new Error("Invitation insert returned no row.");
  const staffLocale = ["bg", "en", "ru"].includes(invitation.locale) ? invitation.locale : "bg";
  const url = staffInvitationUrl(getEnv().hosts.staff, staffLocale, token);
  if (invitation.invitedById) {
    await enqueueMessage(
      tx,
      {
        idempotencyKey: `invitation:${row.id}`,
        channel: "email",
        recipient: invitation.email,
        template: `auth.${invitation.kind}`,
        params: { locale: staffLocale, expiresAt: expiresAt.toISOString() },
        secretParams: { url },
      },
      queue,
    );
  }
  return { id: row.id, url, expiresAt };
}

export interface StaffInvitationRequest {
  readonly session: Session;
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly StaffRole[];
  readonly locale?: PublicLocale;
  readonly now?: Date;
  readonly queue?: JobQueue;
  readonly correlationId?: string;
}

/** Invites a new staff member (or a former one) to enrol. An access grant: step-up applies. */
export async function issueStaffInvitation(
  db: Executor,
  request: StaffInvitationRequest,
): Promise<{ readonly invitationId: string; readonly expiresAt: Date }> {
  const now = request.now ?? new Date();
  await assertMayGrant(db, request.session, now);
  const email = parseEmail(request.email);
  const displayName = parseDisplayName(request.displayName);
  const roles = [...new Set(request.roles)];
  if (!roles.length || roles.some((role) => !staffRoles.includes(role))) {
    throw new AppError("validation_failed", { fieldErrors: { roles: ["invalid_roles"] } });
  }
  const locale = request.locale ?? "bg";
  return db.transaction(async (tx) => {
    const principal = await ensurePrincipal(tx, "staff", email, displayName, locale);
    await tx
      .select({ id: principals.id })
      .from(principals)
      .where(eq(principals.id, principal.id))
      .for("update");
    const [membership] = await tx
      .select({ state: staffMemberships.state })
      .from(staffMemberships)
      .where(eq(staffMemberships.principalId, principal.id));
    // A current member who lost a passkey needs recovery, not a second enrolment.
    if (membership?.state === "active") {
      throw new AppError("validation_failed", { fieldErrors: { email: ["already_member"] } });
    }
    await revokePending(tx, principal.id, staffKinds, now);
    const issued = await insertStaffInvitation(
      tx,
      {
        kind: "staff_enrolment",
        principalId: principal.id,
        email,
        roles,
        invitedById: request.session.account.id,
        locale,
        ttlMs: invitationTtlMs,
        now,
      },
      request.queue,
    );
    await recordAudit(tx, {
      action: "invitation.issue",
      actor: request.session.actor,
      capability: "access.grant",
      recordType: "invitation",
      recordId: issued.id,
      ...(request.correlationId ? { correlationId: request.correlationId } : {}),
      payload: { kind: "staff_enrolment", principalId: principal.id, roles },
      at: now,
    });
    return { invitationId: issued.id, expiresAt: issued.expiresAt };
  });
}

/** Ends every way the principal could still get in: sessions, passkeys, pending invitations. */
export async function lockOutStaff(tx: Transaction, principalId: string, now: Date) {
  const sessionsRevoked = await revokeAllSessions(tx, { kind: "staff", id: principalId }, { now });
  const revokedPasskeys = await tx
    .update(passkeys)
    .set({ revokedAt: now })
    .where(and(eq(passkeys.principalId, principalId), isNull(passkeys.revokedAt)))
    .returning({ id: passkeys.id });
  const invitationsRevoked = await revokePending(tx, principalId, staffKinds, now);
  return { sessionsRevoked, passkeysRevoked: revokedPasskeys.length, invitationsRevoked };
}

export interface StaffRecoveryRequest {
  readonly session: Session;
  readonly principalId: string;
  /** The authorizing operator's recorded identity-check evidence, required before factor reset. */
  readonly verificationNote: string;
  readonly locale?: PublicLocale;
  readonly now?: Date;
  readonly queue?: JobQueue;
  readonly correlationId?: string;
}

/**
 * Lost-factor recovery for another current staff member: revokes their sessions and passkeys
 * at once and sends a single-use recovery invitation that requires a fresh enrolment.
 */
export async function issueStaffRecovery(
  db: Executor,
  request: StaffRecoveryRequest,
): Promise<{ readonly invitationId: string; readonly expiresAt: Date }> {
  const now = request.now ?? new Date();
  await assertMayGrant(db, request.session, now);
  if (request.principalId === request.session.account.id) throw new AppError("forbidden");
  const verificationNote = request.verificationNote?.trim();
  if (!verificationNote || verificationNote.length < 10 || verificationNote.length > 500) {
    throw new AppError("validation_failed", { fieldErrors: { verificationNote: ["required"] } });
  }
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        id: principals.id,
        email: principals.email,
        kind: principals.kind,
        status: principals.status,
        locale: principals.preferredLocale,
        membership: staffMemberships.state,
      })
      .from(principals)
      .innerJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
      .where(eq(principals.id, request.principalId))
      .for("update");
    if (target?.kind !== "staff" || target.status !== "active") throw new AppError("not_found");
    if (target.membership !== "active") throw new AppError("transition_denied");
    const effects = await lockOutStaff(tx, target.id, now);
    const issued = await insertStaffInvitation(
      tx,
      {
        kind: "staff_recovery",
        principalId: target.id,
        email: target.email,
        roles: [],
        invitedById: request.session.account.id,
        locale: request.locale ?? target.locale,
        ttlMs: invitationTtlMs,
        now,
      },
      request.queue,
    );
    await recordAudit(tx, {
      action: "staff.recovery_issue",
      actor: request.session.actor,
      capability: "access.grant",
      recordType: "principal",
      recordId: target.id,
      ...(request.correlationId ? { correlationId: request.correlationId } : {}),
      payload: { invitationId: issued.id, verificationNote, ...effects },
      at: now,
    });
    return { invitationId: issued.id, expiresAt: issued.expiresAt };
  });
}

const bootstrapActor: Actor = { kind: "system", id: "staff-bootstrap" };

/** Whether an active member holds a live, unscoped manager grant and a passkey. */
async function hasUsableManager(db: Executor, now: Date): Promise<boolean> {
  const rows = await db
    .select({ id: principals.id })
    .from(principals)
    .innerJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
    .innerJoin(grants, eq(grants.principalId, principals.id))
    .innerJoin(passkeys, eq(passkeys.principalId, principals.id))
    .where(
      and(
        eq(principals.status, "active"),
        eq(staffMemberships.state, "active"),
        or(eq(grants.role, "manager"), eq(grants.capability, "access.grant")),
        isNull(grants.recordId),
        isNull(grants.revokedAt),
        or(isNull(grants.expiresAt), gt(grants.expiresAt, now)),
        isNull(passkeys.revokedAt),
      ),
    );
  for (const { id } of rows) {
    if (
      (await countActivePasskeys(db, id)) >= staffPasskeyMinimum &&
      (await can(db, { kind: "staff", id }, "access.grant", undefined, now))
    )
      return true;
  }
  return false;
}

/**
 * Break-glass: an enrolment link for the first manager, returned for the operator's terminal
 * and never emailed. Refused while a usable manager exists unless `breakGlass`; for an
 * existing member it is a recovery (sessions and passkeys revoked). Always audited.
 */
export async function bootstrapManager(
  db: Executor,
  request: {
    email: string;
    displayName: string;
    locale?: "bg" | "en" | "ru";
    breakGlass?: boolean;
    now?: Date;
  },
): Promise<{ readonly url: string; readonly expiresAt: Date; readonly kind: StaffInvitationKind }> {
  const now = request.now ?? new Date();
  const email = parseEmail(request.email);
  const displayName = parseDisplayName(request.displayName);
  const locale = request.locale ?? "bg";
  if (!request.breakGlass && (await hasUsableManager(db, now))) {
    throw new AppError("transition_denied", {
      detail: "A manager can already sign in; ask them, or pass --break-glass.",
    });
  }
  return db.transaction(async (tx) => {
    const principal = await ensurePrincipal(tx, "staff", email, displayName, locale);
    await tx
      .select({ id: principals.id })
      .from(principals)
      .where(eq(principals.id, principal.id))
      .for("update");
    const [membership] = await tx
      .select({ state: staffMemberships.state })
      .from(staffMemberships)
      .where(eq(staffMemberships.principalId, principal.id));
    const kind: StaffInvitationKind =
      membership?.state === "active" ? "staff_recovery" : "staff_enrolment";
    const effects = await lockOutStaff(tx, principal.id, now);
    const issued = await insertStaffInvitation(tx, {
      kind,
      principalId: principal.id,
      email,
      roles: ["manager"],
      invitedById: null,
      locale,
      ttlMs: bootstrapTtlMs,
      now,
    });
    await recordAudit(tx, {
      action: "staff.bootstrap",
      actor: bootstrapActor,
      recordType: "principal",
      recordId: principal.id,
      payload: {
        invitationId: issued.id,
        kind,
        breakGlass: Boolean(request.breakGlass),
        ...effects,
      },
      at: now,
    });
    return { url: issued.url, expiresAt: issued.expiresAt, kind };
  });
}

export interface StaffInvitationInspection {
  readonly state: InvitationState | "invalid";
  readonly kind?: StaffInvitationKind;
  readonly email?: string;
  readonly expiresAt?: Date;
  readonly principalId?: string;
}

async function findStaffInvitation(db: Executor, token: string) {
  const [row] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.tokenHash, sha256Hex(token)), inArray(invitations.kind, staffKinds)));
  return row;
}

/** Read-only: what the staff invitation page shows. Opening it never consumes anything. */
export async function inspectStaffInvitation(
  db: Executor,
  token: string,
  now: Date = new Date(),
): Promise<StaffInvitationInspection> {
  const row = await findStaffInvitation(db, token);
  if (!row) return { state: "invalid" };
  return {
    state: invitationState(row, now),
    kind: row.kind as StaffInvitationKind,
    email: row.email,
    expiresAt: row.expiresAt,
    principalId: row.principalId,
  };
}

/** Whether the inviter could still issue this invitation (the bootstrap has no inviter). */
async function inviterStillAuthorized(
  db: Executor,
  row: InvitationRow,
  now: Date,
  resource?: { type: string; id: string },
): Promise<boolean> {
  if (!row.invitedById) return true;
  return (
    (await countActivePasskeys(db, row.invitedById)) >= staffPasskeyMinimum &&
    can(db, { kind: "staff", id: row.invitedById }, "access.grant", resource, now)
  );
}

export interface StaffInvitationAcceptance {
  readonly clientIp: string;
  readonly currentSessionToken?: string;
  readonly now?: Date;
  readonly correlationId?: string;
}

/**
 * Redeems a staff enrolment or recovery token (the explicit POST). Opens the membership with
 * the invited roles (enrolment), ends every other session of the member and the browser's
 * current staff session, and starts a session that must enrol two passkeys before it opens
 * any staff route.
 */
export async function acceptStaffInvitation(
  db: Executor,
  token: string,
  options: StaffInvitationAcceptance,
): Promise<IssuedSession> {
  const now = options.now ?? new Date();
  await enforceRateLimit(db, "invitation.ip", options.clientIp, { now });
  const current = options.currentSessionToken
    ? await resolveSession(db, options.currentSessionToken, now)
    : null;
  if (current) {
    const invitation = await findStaffInvitation(db, token);
    if (
      current.session.account.kind !== "staff" ||
      invitation?.principalId !== current.session.account.id
    ) {
      throw new AppError("not_found");
    }
  }
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(invitations)
      .set({ acceptedAt: now })
      .where(
        and(
          eq(invitations.tokenHash, sha256Hex(token)),
          inArray(invitations.kind, staffKinds),
          isNull(invitations.acceptedAt),
          isNull(invitations.declinedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, now),
        ),
      )
      .returning();
    if (!row) return null;
    const [principal] = await tx
      .select({ kind: principals.kind, status: principals.status, email: principals.email })
      .from(principals)
      .where(eq(principals.id, row.principalId))
      .for("update");
    if (
      principal?.kind !== "staff" ||
      principal.status !== "active" ||
      principal.email.toLowerCase() !== row.email.toLowerCase()
    ) {
      throw new AppError("invitation_revoked");
    }
    if (!(await inviterStillAuthorized(tx, row, now))) throw new AppError("invitation_revoked");

    if (row.kind === "staff_enrolment") {
      // Rejoining a former member restores only the new invitation's scope.
      await tx
        .update(grants)
        .set({ revokedAt: now })
        .where(and(eq(grants.principalId, row.principalId), isNull(grants.revokedAt)));
      await tx
        .update(passkeys)
        .set({ revokedAt: now })
        .where(and(eq(passkeys.principalId, row.principalId), isNull(passkeys.revokedAt)));
      await tx
        .insert(staffMemberships)
        .values({ principalId: row.principalId, state: "active", startedAt: now })
        .onConflictDoUpdate({
          target: staffMemberships.principalId,
          set: { state: "active", startedAt: now, endedAt: null },
        });
      const roles = ((row.scope as { roles?: unknown }).roles ?? []) as StaffRole[];
      for (const role of roles.filter((r) => staffRoles.includes(r))) {
        const [held] = await tx
          .select({ id: grants.id })
          .from(grants)
          .where(
            and(
              eq(grants.principalId, row.principalId),
              eq(grants.role, role),
              isNull(grants.recordId),
              isNull(grants.revokedAt),
            ),
          );
        if (held) continue;
        await tx.insert(grants).values({
          principalId: row.principalId,
          role,
          grantedById: row.invitedById,
          reason: `invitation ${row.id}`,
        });
      }
    } else {
      const [membership] = await tx
        .select({ state: staffMemberships.state })
        .from(staffMemberships)
        .where(eq(staffMemberships.principalId, row.principalId));
      if (membership?.state !== "active") throw new AppError("invitation_revoked");
    }

    await revokeAllSessions(tx, { kind: "staff", id: row.principalId }, { now });
    if (options.currentSessionToken) await revokeSession(tx, options.currentSessionToken, now);
    const issued = await createSession(tx, { kind: "staff", id: row.principalId }, now);
    await recordAudit(tx, {
      action: "invitation.accept",
      actor: issued.session.actor,
      recordType: "invitation",
      recordId: row.id,
      ...(options.correlationId ? { correlationId: options.correlationId } : {}),
      payload: { kind: row.kind, sessionId: issued.session.id },
      at: now,
    });
    return issued;
  });
  if (result) return result;
  const { state } = await inspectStaffInvitation(db, token, now);
  throw new AppError(state === "invalid" || state === "pending" ? "not_found" : stateErrors[state]);
}

const portalCapabilities = capabilities.filter((c) => c.startsWith("portal.")) as Capability[];

export interface ClientInvitationRequest {
  readonly session: Session;
  readonly email: string;
  readonly displayName: string;
  readonly caseId: string;
  readonly role: ParticipantRole;
  /** Portal actions on top of the role's floor (authz.ts decides what they can widen). */
  readonly capabilities?: readonly Capability[];
  /** The end of Case access, distinct from the invitation's 72-hour acceptance window. */
  readonly accessExpiresAt?: string | null;
  readonly locale?: PublicLocale;
  readonly now?: Date;
  readonly queue?: JobQueue;
  readonly correlationId?: string;
}

/** Invites a client to one Case. An access grant: step-up and access.grant on the Case. */
export async function issueClientInvitation(
  db: Executor,
  request: ClientInvitationRequest,
): Promise<{ readonly invitationId: string; readonly expiresAt: Date }> {
  const now = request.now ?? new Date();
  await assertMayGrant(db, request.session, now, { type: "case", id: request.caseId });
  const email = parseEmail(request.email);
  const displayName = parseDisplayName(request.displayName);
  if (!participantRoles.includes(request.role)) {
    throw new AppError("validation_failed", { fieldErrors: { role: ["invalid_role"] } });
  }
  const accessExpiresAt = invitationAccessExpiry(request.role, request.accessExpiresAt, now);
  const invited = [...new Set(request.capabilities ?? [])];
  if (invited.some((c) => !portalCapabilities.includes(c))) {
    throw new AppError("validation_failed", {
      fieldErrors: { capabilities: ["invalid_capability"] },
    });
  }
  const locale = request.locale ?? "bg";
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: cases.id, version: cases.version })
      .from(cases)
      .where(eq(cases.id, request.caseId))
      .for("update");
    if (!target) throw new AppError("not_found");
    // All Case invitation/participation writes lock the Case before their child rows.
    // Recheck after waiting: a cached session or revoked manager grant cannot issue access.
    const at = request.now ?? new Date();
    await assertMayGrant(tx, request.session, at, { type: "case", id: target.id });
    invitationAccessExpiry(request.role, request.accessExpiresAt, at);
    const principal = await ensurePrincipal(tx, "client", email, displayName, locale);
    await revokePending(
      tx,
      principal.id,
      ["client_access"],
      at,
      sql`${invitations.scope}->>'caseId' = ${request.caseId}`,
    );
    const expiresAt = new Date(at.getTime() + invitationTtlMs);
    const [row] = await tx
      .insert(invitations)
      .values({
        kind: "client_access",
        principalId: principal.id,
        email,
        scope: {
          caseId: request.caseId,
          role: request.role,
          capabilities: invited,
          accessExpiresAt: accessExpiresAt?.toISOString() ?? null,
        },
        invitedById: request.session.account.id,
        locale,
        createdAt: at,
        expiresAt,
      })
      .returning({ id: invitations.id });
    if (!row) throw new Error("Invitation insert returned no row.");
    await enqueueMessage(
      tx,
      {
        idempotencyKey: `invitation:${row.id}`,
        channel: "email",
        recipient: email,
        template: "auth.client_invitation",
        params: {
          locale,
          expiresAt: expiresAt.toISOString(),
          url: clientInvitationUrl(getEnv().hosts.client, locale, row.id),
        },
      },
      request.queue,
    );
    await recordAudit(tx, {
      action: "invitation.issue",
      actor: request.session.actor,
      capability: "access.grant",
      recordType: "invitation",
      recordId: row.id,
      ...(request.correlationId ? { correlationId: request.correlationId } : {}),
      payload: {
        kind: "client_access",
        principalId: principal.id,
        caseId: request.caseId,
        role: request.role,
        capabilities: invited,
        accessExpiresAt: accessExpiresAt?.toISOString() ?? null,
      },
      at,
    });
    await tx
      .update(cases)
      .set({ version: target.version + 1 })
      .where(eq(cases.id, target.id));
    return { invitationId: row.id, expiresAt };
  });
}

/** Withdraws a pending invitation. An access change: step-up applies. */
export async function revokeInvitation(
  db: Executor,
  request: { session: Session; invitationId: string; now?: Date; correlationId?: string },
): Promise<void> {
  const now = request.now ?? new Date();
  const [row] = await db.select().from(invitations).where(eq(invitations.id, request.invitationId));
  if (!row) throw new AppError("not_found");
  const caseId = (row.scope as { caseId?: string }).caseId;
  await assertMayGrant(
    db,
    request.session,
    now,
    row.kind === "client_access" && caseId ? { type: "case", id: caseId } : undefined,
  );
  await db.transaction(async (tx) => {
    if (row.kind === "client_access" && caseId) {
      const [target] = await tx
        .select({ id: cases.id })
        .from(cases)
        .where(eq(cases.id, caseId))
        .for("update");
      if (!target) throw new AppError("not_found");
    }
    const at = request.now ?? new Date();
    await assertMayGrant(
      tx,
      request.session,
      at,
      row.kind === "client_access" && caseId ? { type: "case", id: caseId } : undefined,
    );
    const updated = await tx
      .update(invitations)
      .set({ revokedAt: at })
      .where(
        and(
          eq(invitations.id, row.id),
          isNull(invitations.acceptedAt),
          isNull(invitations.declinedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .returning({ id: invitations.id });
    if (!updated.length) {
      const state = invitationState(row, now);
      throw new AppError(state === "pending" ? "invitation_used" : stateErrors[state]);
    }
    await recordAudit(tx, {
      action: "invitation.revoke",
      actor: request.session.actor,
      capability: "access.grant",
      recordType: "invitation",
      recordId: row.id,
      ...(request.correlationId ? { correlationId: request.correlationId } : {}),
      at,
    });
    if (row.kind === "client_access" && caseId)
      await tx
        .update(cases)
        .set({ version: sql`${cases.version} + 1` })
        .where(eq(cases.id, caseId));
  });
}

const clientScopeSchema = z.object({
  caseId: z.uuid(),
  role: z.enum(participantRoles),
  capabilities: z.array(z.enum(capabilities)).default([]),
  accessExpiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
  acceptedParticipantId: z.uuid().optional(),
});
export type ClientInvitationScope = z.infer<typeof clientScopeSchema>;

export function clientInvitationScope(value: unknown): ClientInvitationScope | null {
  const parsed = clientScopeSchema.safeParse(value);
  if (!parsed.success || (parsed.data.role === "specialist" && !parsed.data.accessExpiresAt))
    return null;
  return parsed.data;
}

function invitationAccessExpiry(
  role: ParticipantRole,
  value: string | null | undefined,
  now: Date,
) {
  if (!value) {
    if (role === "specialist")
      throw new AppError("validation_failed", { fieldErrors: { accessExpiresAt: ["required"] } });
    return null;
  }
  if (!z.iso.datetime({ offset: true }).safeParse(value).success || new Date(value) <= now)
    throw new AppError("validation_failed", {
      fieldErrors: { accessExpiresAt: ["future_expiry_required"] },
    });
  return new Date(value);
}

/** New acceptance may shorten existing access, never silently extend it. */
function narrowerExpiry(invited: string | null | undefined, existing: readonly (Date | null)[]) {
  const times = [
    ...existing.filter((value): value is Date => value !== null).map((value) => value.getTime()),
    ...(invited ? [new Date(invited).getTime()] : []),
  ];
  return times.length ? new Date(Math.min(...times)) : null;
}

export interface ClientInvitationDetails {
  readonly inviterName: string;
  readonly caseReference: string;
  readonly caseTitle: string;
  readonly role: ParticipantRole;
  /** What accepting allows, before any authority staff may later review. */
  readonly capabilities: readonly Capability[];
  readonly recipientEmail: string;
  readonly expiresAt: Date;
  readonly accessExpiresAt: Date | null;
}

export type ClientInvitationView =
  | { readonly status: "sign_in_required" }
  /** Unknown, malformed or for someone else: indistinguishable on purpose. */
  | { readonly status: "unavailable" }
  | { readonly status: "revoked" | "expired" | "declined" }
  | { readonly status: "pending" | "accepted"; readonly details: ClientInvitationDetails };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findClientInvitation(db: Executor, id: string, principalId: string) {
  if (!uuidPattern.test(id)) return undefined;
  const [row] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.id, id),
        eq(invitations.kind, "client_access"),
        eq(invitations.principalId, principalId),
      ),
    );
  return row;
}

/**
 * What the client invitation page may show to this viewer. Nothing about the Case reaches
 * anyone but the signed-in recipient; opening the page changes nothing.
 */
export async function viewClientInvitation(
  db: Executor,
  id: string,
  session: Session | null,
  now: Date = new Date(),
): Promise<ClientInvitationView> {
  if (session?.account.kind !== "client") return { status: "sign_in_required" };
  try {
    await requireLiveSession(db, session, now);
  } catch {
    return { status: "sign_in_required" };
  }
  const row = await findClientInvitation(db, id, session.account.id);
  if (!row) return { status: "unavailable" };
  const state = invitationState(row, now);
  if (state === "expired" || state === "revoked" || state === "declined") return { status: state };
  const scope = clientInvitationScope(row.scope);
  if (!scope) return { status: "unavailable" };
  if (scope.accessExpiresAt && new Date(scope.accessExpiresAt) <= now) return { status: "expired" };
  const [recipient] = await db
    .select({ partyId: principals.partyId })
    .from(principals)
    .where(eq(principals.id, session.account.id));
  if (!recipient) return { status: "unavailable" };
  const current = await db
    .select()
    .from(caseParticipants)
    .where(
      and(
        eq(caseParticipants.caseId, scope.caseId),
        eq(caseParticipants.partyId, recipient.partyId),
        eq(caseParticipants.role, scope.role),
        isNull(caseParticipants.revokedAt),
        lte(caseParticipants.validFrom, now),
        or(isNull(caseParticipants.expiresAt), gt(caseParticipants.expiresAt, now)),
        state === "accepted" && scope.acceptedParticipantId
          ? eq(caseParticipants.id, scope.acceptedParticipantId)
          : undefined,
      ),
    );
  if (state === "accepted" && !current.length) return { status: "unavailable" };
  if (
    state === "accepted" &&
    !(await can(
      db,
      session.actor,
      "portal.case.read",
      {
        type: "case",
        id: scope.caseId,
      },
      now,
    ))
  )
    return { status: "unavailable" };
  const [target] = await db
    .select({ reference: cases.reference, title: cases.title })
    .from(cases)
    .where(eq(cases.id, scope.caseId));
  const [inviter] = row.invitedById
    ? await db
        .select({ name: principals.displayName })
        .from(principals)
        .where(eq(principals.id, row.invitedById))
    : [];
  if (!target) return { status: "unavailable" };
  return {
    status: state,
    details: {
      inviterName: inviter?.name ?? "MS Realty",
      caseReference: target.reference,
      caseTitle: target.title,
      role: scope.role,
      capabilities: [
        ...new Set(
          state === "accepted"
            ? current.flatMap((participant) => {
                const invited = (participant.scope as { capabilities?: unknown }).capabilities;
                return relationshipCapabilities(
                  participant.role,
                  participant.authority === "reviewed",
                  Array.isArray(invited)
                    ? invited.filter((value): value is Capability => capabilities.includes(value))
                    : [],
                );
              })
            : relationshipCapabilities(scope.role, false, scope.capabilities),
        ),
      ],
      recipientEmail: row.email,
      expiresAt: row.expiresAt,
      accessExpiresAt: narrowerExpiry(
        scope.accessExpiresAt,
        current.map((participant) => participant.expiresAt),
      ),
    },
  };
}

/**
 * The recipient's explicit answer (POST). Accepting records the Case participation the
 * invitation describes, after re-checking that the inviter may still grant it.
 */
export async function respondToClientInvitation(
  db: Executor,
  id: string,
  session: Session,
  decision: "accept" | "decline",
  options: { clientIp: string; now?: Date; correlationId?: string },
): Promise<{ readonly caseId: string }> {
  const now = options.now ?? new Date();
  if (session.account.kind !== "client") throw new AppError("not_found");
  session = await requireLiveSession(db, session, now);
  if (decision !== "accept" && decision !== "decline") throw new AppError("validation_failed");
  await enforceRateLimit(db, "invitation.ip", options.clientIp, { now });
  const row = await findClientInvitation(db, id, session.account.id);
  if (!row) throw new AppError("not_found");
  const state = invitationState(row, now);
  if (state !== "pending") throw new AppError(stateErrors[state]);
  const initialScope = clientInvitationScope(row.scope);
  if (!initialScope) throw new AppError("not_found");

  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: cases.id, version: cases.version })
      .from(cases)
      .where(eq(cases.id, initialScope.caseId))
      .for("update");
    if (!target) throw new AppError("not_found");
    const at = options.now ?? new Date();
    await requireLiveSession(tx, session, at);
    const [locked] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.id, row.id))
      .for("update");
    if (!locked || locked.principalId !== session.account.id) throw new AppError("not_found");
    const currentState = invitationState(locked, at);
    if (currentState !== "pending") throw new AppError(stateErrors[currentState]);
    const scope = clientInvitationScope(locked.scope);
    if (!scope || scope.caseId !== initialScope.caseId) throw new AppError("not_found");
    if (scope.accessExpiresAt && new Date(scope.accessExpiresAt) <= at)
      throw new AppError("invitation_expired");
    let acceptedParticipantId: string | undefined;
    let accessExpiresAt: Date | null = null;
    if (decision === "accept") {
      if (!(await inviterStillAuthorized(tx, locked, at, { type: "case", id: scope.caseId }))) {
        throw new AppError("invitation_revoked");
      }
      const [principal] = await tx
        .select({ partyId: principals.partyId })
        .from(principals)
        .where(eq(principals.id, session.account.id));
      if (!principal) throw new AppError("not_found");
      const existing = await tx
        .select({ id: caseParticipants.id, expiresAt: caseParticipants.expiresAt })
        .from(caseParticipants)
        .where(
          and(
            eq(caseParticipants.caseId, scope.caseId),
            eq(caseParticipants.partyId, principal.partyId),
            eq(caseParticipants.role, scope.role),
            isNull(caseParticipants.revokedAt),
            lte(caseParticipants.validFrom, at),
            or(isNull(caseParticipants.expiresAt), gt(caseParticipants.expiresAt, at)),
          ),
        )
        .for("update");
      const expiresAt = narrowerExpiry(
        scope.accessExpiresAt,
        existing.map((participant) => participant.expiresAt),
      );
      accessExpiresAt = expiresAt;
      if (!existing.length) {
        const [created] = await tx
          .insert(caseParticipants)
          .values({
            caseId: scope.caseId,
            partyId: principal.partyId,
            role: scope.role,
            scope: { capabilities: scope.capabilities ?? [] },
            validFrom: at,
            expiresAt,
          })
          .returning({ id: caseParticipants.id });
        if (!created) throw new Error("Participation insert failed");
        acceptedParticipantId = created.id;
      } else {
        // A replacement invitation is an explicit scope review, including any narrowing.
        await tx
          .update(caseParticipants)
          .set({
            scope: { capabilities: scope.capabilities ?? [] },
            expiresAt,
            version: sql`${caseParticipants.version} + 1`,
          })
          .where(
            inArray(
              caseParticipants.id,
              existing.map((participant) => participant.id),
            ),
          );
        acceptedParticipantId = existing[0]?.id;
      }
    }
    await tx
      .update(invitations)
      .set(
        decision === "accept"
          ? {
              acceptedAt: at,
              scope: {
                ...scope,
                accessExpiresAt: accessExpiresAt?.toISOString() ?? null,
                acceptedParticipantId,
              },
            }
          : { declinedAt: at },
      )
      .where(eq(invitations.id, locked.id));
    await tx
      .update(cases)
      .set({ version: target.version + 1 })
      .where(eq(cases.id, target.id));
    await recordAudit(tx, {
      action: decision === "accept" ? "invitation.accept" : "invitation.decline",
      actor: session.actor,
      recordType: "invitation",
      recordId: row.id,
      ...(options.correlationId ? { correlationId: options.correlationId } : {}),
      payload: {
        caseId: scope.caseId,
        role: scope.role,
        accessExpiresAt: accessExpiresAt?.toISOString() ?? null,
        participantId: acceptedParticipantId,
      },
      at,
    });
    return { caseId: scope.caseId };
  });
}
