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
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
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
import {
  type AccountKind,
  createSession,
  type IssuedSession,
  requireFreshAuth,
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
  requireFreshAuth(session, now);
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
async function lockOut(tx: Transaction, principalId: string, now: Date) {
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
      .where(eq(principals.id, request.principalId));
    if (target?.kind !== "staff" || target.status !== "active") throw new AppError("not_found");
    if (target.membership !== "active") throw new AppError("transition_denied");
    const effects = await lockOut(tx, target.id, now);
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
      payload: { invitationId: issued.id, ...effects },
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
        eq(grants.role, "manager"),
        isNull(grants.recordId),
        isNull(grants.revokedAt),
        sql`(${grants.expiresAt} is null or ${grants.expiresAt} > ${now})`,
        isNull(passkeys.revokedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
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
    const [membership] = await tx
      .select({ state: staffMemberships.state })
      .from(staffMemberships)
      .where(eq(staffMemberships.principalId, principal.id));
    const kind: StaffInvitationKind =
      membership?.state === "active" ? "staff_recovery" : "staff_enrolment";
    const effects = await lockOut(tx, principal.id, now);
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
      payload: { invitationId: issued.id, kind, breakGlass: Boolean(request.breakGlass), ...effects },
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
}

async function findStaffInvitation(db: Executor, token: string) {
  const [row] = await db
    .select()
    .from(invitations)
    .where(
      and(eq(invitations.tokenHash, sha256Hex(token)), inArray(invitations.kind, staffKinds)),
    );
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
  return can(db, { kind: "staff", id: row.invitedById }, "access.grant", resource, now);
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
      .select({ kind: principals.kind, status: principals.status })
      .from(principals)
      .where(eq(principals.id, row.principalId));
    if (principal?.kind !== "staff" || principal.status !== "active") {
      throw new AppError("invitation_revoked");
    }
    if (!(await inviterStillAuthorized(tx, row, now))) throw new AppError("invitation_revoked");

    if (row.kind === "staff_enrolment") {
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
  const invited = [...new Set(request.capabilities ?? [])];
  if (invited.some((c) => !portalCapabilities.includes(c))) {
    throw new AppError("validation_failed", {
      fieldErrors: { capabilities: ["invalid_capability"] },
    });
  }
  const locale = request.locale ?? "bg";
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: cases.id })
      .from(cases)
      .where(eq(cases.id, request.caseId));
    if (!target) throw new AppError("not_found");
    const principal = await ensurePrincipal(tx, "client", email, displayName, locale);
    await revokePending(
      tx,
      principal.id,
      ["client_access"],
      now,
      sql`${invitations.scope}->>'caseId' = ${request.caseId}`,
    );
    const expiresAt = new Date(now.getTime() + invitationTtlMs);
    const [row] = await tx
      .insert(invitations)
      .values({
        kind: "client_access",
        principalId: principal.id,
        email,
        scope: { caseId: request.caseId, role: request.role, capabilities: invited },
        invitedById: request.session.account.id,
        locale,
        createdAt: now,
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
      },
      at: now,
    });
    return { invitationId: row.id, expiresAt };
  });
}

/** Withdraws a pending invitation. An access change: step-up applies. */
export async function revokeInvitation(
  db: Executor,
  request: { session: Session; invitationId: string; now?: Date; correlationId?: string },
): Promise<void> {
  const now = request.now ?? new Date();
  const [row] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.id, request.invitationId));
  if (!row) throw new AppError("not_found");
  const caseId = (row.scope as { caseId?: string }).caseId;
  await assertMayGrant(
    db,
    request.session,
    now,
    row.kind === "client_access" && caseId ? { type: "case", id: caseId } : undefined,
  );
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(invitations)
      .set({ revokedAt: now })
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
      at: now,
    });
  });
}

interface ClientScope {
  readonly caseId: string;
  readonly role: ParticipantRole;
  readonly capabilities: Capability[];
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
}

export type ClientInvitationView =
  | { readonly status: "sign_in_required" }
  /** Unknown, malformed or for someone else: indistinguishable on purpose. */
  | { readonly status: "unavailable" }
  | { readonly status: InvitationState; readonly details: ClientInvitationDetails };

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
  const row = await findClientInvitation(db, id, session.account.id);
  if (!row) return { status: "unavailable" };
  const scope = row.scope as ClientScope;
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
    status: invitationState(row, now),
    details: {
      inviterName: inviter?.name ?? "MS Realty",
      caseReference: target.reference,
      caseTitle: target.title,
      role: scope.role,
      capabilities: [...new Set(relationshipCapabilities(scope.role, false, scope.capabilities ?? []))],
      recipientEmail: row.email,
      expiresAt: row.expiresAt,
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
  await enforceRateLimit(db, "invitation.ip", options.clientIp, { now });
  const row = await findClientInvitation(db, id, session.account.id);
  if (!row) throw new AppError("not_found");
  const state = invitationState(row, now);
  if (state !== "pending") throw new AppError(stateErrors[state]);
  const scope = row.scope as ClientScope;

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(invitations)
      .set(decision === "accept" ? { acceptedAt: now } : { declinedAt: now })
      .where(
        and(
          eq(invitations.id, row.id),
          isNull(invitations.acceptedAt),
          isNull(invitations.declinedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, now),
        ),
      )
      .returning({ id: invitations.id });
    // A concurrent answer or reissue won.
    if (!updated.length) throw new AppError("invitation_used");
    if (decision === "accept") {
      if (!(await inviterStillAuthorized(tx, row, now, { type: "case", id: scope.caseId }))) {
        throw new AppError("invitation_revoked");
      }
      const [principal] = await tx
        .select({ partyId: principals.partyId })
        .from(principals)
        .where(eq(principals.id, session.account.id));
      if (!principal) throw new AppError("not_found");
      const [existing] = await tx
        .select({ id: caseParticipants.id })
        .from(caseParticipants)
        .where(
          and(
            eq(caseParticipants.caseId, scope.caseId),
            eq(caseParticipants.partyId, principal.partyId),
            eq(caseParticipants.role, scope.role),
            isNull(caseParticipants.revokedAt),
          ),
        );
      if (!existing) {
        await tx.insert(caseParticipants).values({
          caseId: scope.caseId,
          partyId: principal.partyId,
          role: scope.role,
          scope: { capabilities: scope.capabilities ?? [] },
          validFrom: now,
        });
      }
    }
    await recordAudit(tx, {
      action: decision === "accept" ? "invitation.accept" : "invitation.decline",
      actor: session.actor,
      recordType: "invitation",
      recordId: row.id,
      ...(options.correlationId ? { correlationId: options.correlationId } : {}),
      payload: { caseId: scope.caseId, role: scope.role },
      at: now,
    });
    return { caseId: scope.caseId };
  });
}
