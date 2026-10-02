// O09/C16, F13/F30: Case access changes are recipient scoped and serialized on the Case.
import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  caseParticipants,
  cases,
  documents,
  grants,
  invitations,
  parties,
  principals,
} from "@/db/schema";
import { type Capability, capabilities } from "@/domain/capabilities";
import { clientInvitationScope, invitationState } from "../auth/invitations";
import { requireFreshAuth, type Session } from "../auth/sessions";
import { assertCan, relationshipCapabilities } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { commandEnvelope, liveStaff, parseInput, version } from "../work/shared";
import { bumpCase, caseEvent, caseFor, liveParticipation } from "./shared";

const revokeSchema = z.object({
  ...commandEnvelope,
  participantId: z.uuid(),
  reason: z.string().trim().min(5).max(2000),
});
export type RevokeCaseParticipantInput = z.input<typeof revokeSchema>;

async function manager(db: Executor, session: Session, caseId: string) {
  const live = await liveStaff(db, session);
  requireFreshAuth(live);
  await assertCan(db, live.actor, "access.grant", { type: "case", id: caseId });
  return live;
}

function participantCapabilities(participant: typeof caseParticipants.$inferSelect) {
  const scope = participant.scope as { capabilities?: unknown };
  const invited = Array.isArray(scope.capabilities)
    ? scope.capabilities.filter((value): value is Capability => capabilities.includes(value))
    : [];
  return [
    ...new Set(
      relationshipCapabilities(participant.role, participant.authority === "reviewed", invited),
    ),
  ];
}

function participantState(participant: typeof caseParticipants.$inferSelect, now: Date) {
  if (participant.revokedAt) return "revoked" as const;
  if (
    (participant.role === "specialist" && !participant.expiresAt) ||
    (participant.expiresAt && participant.expiresAt <= now)
  )
    return "expired" as const;
  return participant.validFrom > now ? ("scheduled" as const) : ("active" as const);
}

/** Staff read model. Only current Case readers with access.grant see recipient management. */
export async function listCaseParticipants(db: Executor, session: Session, caseId: string) {
  const { row, live } = await caseFor(db, session, caseId, "access.grant");
  if (live.actor.kind !== "staff") throw new AppError("not_found");
  const now = new Date();
  const participants = await db
    .select({ participant: caseParticipants, displayName: parties.displayName })
    .from(caseParticipants)
    .innerJoin(parties, eq(parties.id, caseParticipants.partyId))
    .where(eq(caseParticipants.caseId, row.id));
  const pending = await db
    .select({ invitation: invitations, displayName: principals.displayName })
    .from(invitations)
    .innerJoin(principals, eq(principals.id, invitations.principalId))
    .where(
      and(eq(invitations.kind, "client_access"), sql`${invitations.scope}->>'caseId' = ${row.id}`),
    );
  return {
    case: { id: row.id, reference: row.reference, version: row.version },
    canManage: true,
    participants: participants.map(({ participant, displayName }) => ({
      id: participant.id,
      partyId: participant.partyId,
      displayName,
      role: participant.role,
      capabilities: participantCapabilities(participant),
      accessExpiresAt: participant.expiresAt,
      revokedAt: participant.revokedAt,
      state: participantState(participant, now),
    })),
    pendingInvitations: pending.flatMap(({ invitation, displayName }) => {
      const scope = clientInvitationScope(invitation.scope);
      if (
        !scope ||
        invitationState(invitation, now) !== "pending" ||
        (scope.accessExpiresAt && new Date(scope.accessExpiresAt) <= now)
      )
        return [];
      return [
        {
          id: invitation.id,
          displayName,
          role: scope.role,
          capabilities: [
            ...new Set(relationshipCapabilities(scope.role, false, scope.capabilities)),
          ],
          invitationExpiresAt: invitation.expiresAt,
          accessExpiresAt: scope.accessExpiresAt ? new Date(scope.accessExpiresAt) : null,
        },
      ];
    }),
  };
}

/** C16: no other participant's email, phone, principal id, authority evidence or pending invite. */
export async function listClientCaseParticipants(db: Executor, session: Session, caseId: string) {
  const { row, live } = await caseFor(db, session, caseId);
  if (live.actor.kind !== "client") throw new AppError("not_found");
  const [principal] = await db
    .select({ partyId: principals.partyId })
    .from(principals)
    .where(eq(principals.id, live.actor.id));
  if (!principal) throw new AppError("not_found");
  const now = new Date();
  const participants = await db
    .select({ participant: caseParticipants, displayName: parties.displayName })
    .from(caseParticipants)
    .innerJoin(parties, eq(parties.id, caseParticipants.partyId))
    .where(and(eq(caseParticipants.caseId, row.id), liveParticipation(now)));
  if (
    !participants.some(
      ({ participant }) =>
        participant.partyId === principal.partyId &&
        participantState(participant, now) === "active",
    )
  )
    throw new AppError("not_found");
  return {
    case: { id: row.id, reference: row.reference },
    participants: participants
      .filter(({ participant }) => participantState(participant, now) === "active")
      .map(({ participant, displayName }) => ({
        id: participant.id,
        displayName,
        role: participant.role,
        capabilities: participantCapabilities(participant),
        accessExpiresAt: participant.expiresAt,
        isSelf: participant.partyId === principal.partyId,
      })),
  };
}

/** Revokes this party's complete access to this Case, preserving unrelated Case sessions/grants. */
export async function revokeCaseParticipant(
  db: Executor,
  session: Session,
  raw: RevokeCaseParticipantInput,
) {
  const input = parseInput(revokeSchema, raw);
  await manager(db, session, input.id); // Replays require current authority too.
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "case.participant.revoke",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      // Same lock order as invitation issue/accept/revoke and document-request access changes.
      const [record] = await ctx.tx
        .select()
        .from(cases)
        .where(eq(cases.id, input.id))
        .for("update");
      if (!record) throw new AppError("not_found");
      const live = await manager(ctx.tx, session, input.id);
      version(record, input.expectedVersion);
      const [target] = await ctx.tx
        .select()
        .from(caseParticipants)
        .where(
          and(eq(caseParticipants.id, input.participantId), eq(caseParticipants.caseId, record.id)),
        )
        .for("update");
      if (!target) throw new AppError("not_found");
      const now = new Date();
      const changed = await ctx.tx
        .update(caseParticipants)
        .set({
          revokedAt: now,
          revokedById: live.actor.id,
          version: sql`${caseParticipants.version} + 1`,
        })
        .where(
          and(
            eq(caseParticipants.caseId, record.id),
            eq(caseParticipants.partyId, target.partyId),
            isNull(caseParticipants.revokedAt),
          ),
        )
        .returning({ id: caseParticipants.id });
      if (!changed.length) throw new AppError("transition_denied");
      // Revoke every client principal for the party, never a staff identity sharing that party.
      const accounts = ctx.tx
        .select({ id: principals.id })
        .from(principals)
        .where(and(eq(principals.partyId, target.partyId), eq(principals.kind, "client")));
      const caseDocuments = ctx.tx
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.caseId, record.id));
      const removedGrants = await ctx.tx
        .update(grants)
        .set({ revokedAt: now, revokedById: live.actor.id, version: sql`${grants.version} + 1` })
        .where(
          and(
            inArray(grants.principalId, accounts),
            isNull(grants.revokedAt),
            or(
              and(eq(grants.recordType, "case"), eq(grants.recordId, record.id)),
              and(eq(grants.recordType, "document"), inArray(grants.recordId, caseDocuments)),
            ),
          ),
        )
        .returning({ id: grants.id });
      const removedInvitations = await ctx.tx
        .update(invitations)
        .set({ revokedAt: now })
        .where(
          and(
            inArray(invitations.principalId, accounts),
            eq(invitations.kind, "client_access"),
            sql`${invitations.scope}->>'caseId' = ${record.id}`,
            isNull(invitations.acceptedAt),
            isNull(invitations.declinedAt),
            isNull(invitations.revokedAt),
          ),
        )
        .returning({ id: invitations.id });
      await bumpCase(ctx.tx, record.id, record.version);
      const outcome = {
        id: record.id,
        reference: record.reference,
        version: record.version + 1,
        participantId: target.id,
        revokedParticipantIds: changed.map((row) => row.id),
        revokedGrantCount: removedGrants.length,
        revokedInvitationIds: removedInvitations.map((row) => row.id),
      };
      await caseEvent(ctx, "case", record.id, "case.participant.revoked", "access.grant", {
        ...outcome,
        partyId: target.partyId,
        reason: input.reason,
      });
      return outcome;
    },
  );
}
