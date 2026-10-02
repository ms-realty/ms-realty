// C17: clients request changes; fresh, authorized staff grant or revoke actual access.
import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { caseAccessRequests, caseParticipants, cases, principals, tasks } from "@/db/schema";
import { issueClientInvitation } from "../auth/invitations";
import { requireFreshAuth, type Session } from "../auth/sessions";
import { can } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { commandEnvelope, parseInput, version } from "../work/shared";
import {
  listCaseParticipants,
  listClientCaseParticipants,
  revokeCaseParticipant,
} from "./participants";
import { caseEvent, caseFor, liveParticipation } from "./shared";

const submission = z
  .object({
    ...commandEnvelope,
    kind: z.enum(["invite", "remove"]),
    targetParticipantId: z.uuid().nullable(),
    targetEmail: z.email().max(254).nullable(),
    targetName: z.string().trim().min(2).max(160).nullable(),
    requestedRole: z.enum(["collaborator", "adviser", "guest", "specialist"]).nullable(),
    reason: z.string().trim().min(5).max(2000),
  })
  .refine((v) =>
    v.kind === "invite"
      ? !!v.targetEmail && !!v.targetName && !!v.requestedRole && !v.targetParticipantId
      : !!v.targetParticipantId && !v.targetEmail && !v.targetName && !v.requestedRole,
  );
export async function requestCaseAccess(
  db: Executor,
  session: Session,
  raw: z.input<typeof submission>,
) {
  const input = parseInput(submission, raw);
  if (session.actor.kind !== "client") throw new AppError("not_found");
  await caseFor(db, session, input.id, "portal.access.request");
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "case.access.request",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await caseFor(ctx.tx, session, input.id, "portal.access.request", true);
      version(row, input.expectedVersion);
      if (row.disposition !== "active" || !row.ownerId) throw new AppError("transition_denied");
      const [principal] = await ctx.tx
        .select()
        .from(principals)
        .where(eq(principals.id, session.account.id));
      if (!principal) throw new AppError("not_found");
      const [participant] = await ctx.tx
        .select()
        .from(caseParticipants)
        .where(
          and(
            eq(caseParticipants.caseId, row.id),
            eq(caseParticipants.partyId, principal.partyId),
            liveParticipation(),
          ),
        );
      if (!participant) throw new AppError("not_found");
      if (input.targetParticipantId) {
        const [target] = await ctx.tx
          .select()
          .from(caseParticipants)
          .where(
            and(
              eq(caseParticipants.id, input.targetParticipantId),
              eq(caseParticipants.caseId, row.id),
              liveParticipation(),
            ),
          );
        if (!target) throw new AppError("not_found");
      }
      const [task] = await ctx.tx
        .insert(tasks)
        .values({
          caseId: row.id,
          ownerId: row.ownerId,
          type: "general",
          title: "Review requested Case access",
          purpose: "Client access request",
          dueAt: new Date(Date.now() + 86400000),
          dueTimezone: "Europe/Sofia",
        })
        .returning();
      if (!task) throw new Error("Missing access request task");
      const [request] = await ctx.tx
        .insert(caseAccessRequests)
        .values({
          caseId: row.id,
          requestedById: principal.id,
          requesterParticipantId: participant.id,
          kind: input.kind,
          targetParticipantId: input.targetParticipantId,
          targetEmail: input.targetEmail?.toLowerCase() ?? null,
          targetName: input.targetName,
          requestedRole: input.requestedRole,
          reason: input.reason,
          taskId: task.id,
        })
        .returning();
      if (!request) throw new Error("Missing access request");
      await ctx.tx
        .update(cases)
        .set({ version: row.version + 1 })
        .where(eq(cases.id, row.id));
      await caseEvent(
        ctx,
        "case_access_request",
        request.id,
        "case.access.requested",
        "portal.access.request",
        { caseId: row.id, kind: input.kind },
      );
      return { id: request.id, caseId: row.id };
    },
  );
}
const decision = z.object({
  ...commandEnvelope,
  requestId: z.uuid(),
  decision: z.enum(["approve", "decline", "withdraw"]),
  clientOutcome: z.string().trim().min(5).max(2000),
  accessExpiresAt: z.iso.datetime().nullable(),
});
export async function decideCaseAccessRequest(
  db: Executor,
  session: Session,
  raw: z.input<typeof decision>,
) {
  const input = parseInput(decision, raw),
    withdraw = input.decision === "withdraw";
  await caseFor(db, session, input.id, withdraw ? "portal.access.request" : "access.grant");
  if (
    (withdraw && session.actor.kind !== "client") ||
    (!withdraw && session.actor.kind !== "staff")
  )
    throw new AppError("not_found");
  if (!withdraw) requireFreshAuth(session);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "case.access.decide",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row, live } = await caseFor(
        ctx.tx,
        session,
        input.id,
        withdraw ? "portal.access.request" : "access.grant",
        true,
      );
      if (!withdraw) requireFreshAuth(live);
      const [request] = await ctx.tx
        .select()
        .from(caseAccessRequests)
        .where(
          and(eq(caseAccessRequests.id, input.requestId), eq(caseAccessRequests.caseId, row.id)),
        )
        .for("update");
      if (!request || (withdraw && request.requestedById !== session.account.id))
        throw new AppError("not_found");
      version(request, input.expectedVersion);
      if (request.state !== "pending") throw new AppError("transition_denied");
      let invitationId: string | null = null;
      if (input.decision === "approve") {
        if (row.disposition !== "active") throw new AppError("transition_denied");
        if (request.kind === "invite") {
          if (!request.targetEmail || !request.targetName || !request.requestedRole)
            throw new AppError("transition_denied");
          const invited = await issueClientInvitation(ctx.tx, {
            session: live,
            email: request.targetEmail,
            displayName: request.targetName,
            caseId: row.id,
            role: request.requestedRole,
            accessExpiresAt: input.accessExpiresAt,
            locale: "bg",
          });
          invitationId = invited.invitationId;
        } else {
          await revokeCaseParticipant(ctx.tx, live, {
            id: row.id,
            participantId: request.targetParticipantId ?? "",
            expectedVersion: row.version,
            operationId: `${input.operationId}:revoke`,
            reason: input.clientOutcome,
          });
        }
      }
      const now = new Date();
      await ctx.tx
        .update(caseAccessRequests)
        .set({
          state: withdraw ? "withdrawn" : input.decision === "approve" ? "approved" : "declined",
          decidedById: session.account.id,
          decidedAt: now,
          clientOutcome: input.clientOutcome,
          invitationId,
          version: request.version + 1,
        })
        .where(eq(caseAccessRequests.id, request.id));
      await ctx.tx
        .update(tasks)
        .set({
          state: withdraw ? "cancelled" : "done",
          cancelReason: withdraw ? input.clientOutcome : null,
          outcomeNote: input.clientOutcome,
          completedAt: now,
          completedById: session.account.id,
          version: sql`${tasks.version}+1`,
        })
        .where(eq(tasks.id, request.taskId));
      await caseEvent(
        ctx,
        "case_access_request",
        request.id,
        "case.access.decided",
        withdraw ? "portal.access.request" : "access.grant",
        { caseId: row.id, decision: input.decision, invitationId },
      );
      return { id: request.id, caseId: row.id };
    },
  );
}
export async function caseAccessWorkbench(db: Executor, session: Session, caseId: string) {
  const staff = session.actor.kind === "staff",
    { row, live } = await caseFor(db, session, caseId, staff ? "access.grant" : undefined);
  const roster = staff
    ? await listCaseParticipants(db, session, caseId)
    : await listClientCaseParticipants(db, session, caseId);
  const requests = await db
    .select()
    .from(caseAccessRequests)
    .where(
      and(
        eq(caseAccessRequests.caseId, caseId),
        staff ? undefined : eq(caseAccessRequests.requestedById, session.account.id),
      ),
    )
    .orderBy(desc(caseAccessRequests.createdAt))
    .limit(100);
  return {
    case: { id: row.id, reference: row.reference, version: row.version },
    roster,
    canRequest:
      !staff &&
      row.disposition === "active" &&
      (await can(db, live.actor, "portal.access.request", { type: "case", id: caseId })),
    canManage: staff,
    requests: requests.map((r) => ({
      id: r.id,
      version: r.version,
      kind: r.kind,
      state: r.state,
      targetName: r.targetName,
      targetEmail: r.targetEmail,
      requestedRole: r.requestedRole,
      targetParticipantId: r.targetParticipantId,
      reason: r.reason,
      clientOutcome: r.clientOutcome,
      invitationId: staff ? r.invitationId : null,
    })),
  };
}
