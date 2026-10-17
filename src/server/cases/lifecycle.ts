import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  appointments,
  approvals,
  briefRevisions,
  caseParticipants,
  caseStageHistory,
  type cases,
  documents,
  documentVersions,
  interests,
  listings,
  messages,
  principals,
  proposalResponses,
  proposalRevisions,
  proposals,
  sellerInstructions,
  staffMemberships,
  tasks,
} from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import {
  type CaseStage,
  caseDispositions,
  caseStageTransitions,
  dispositionTransitions,
  type StageEvidence,
} from "@/domain/case";
import { availableStaff, requireAvailableStaff } from "../auth/availability";
import { requireFreshAuth, type Session } from "../auth/sessions";
import { assertCan, staffWhoCan } from "../authz";
import { assertCaseAgreementReady, reviewedEvidence } from "../compliance/agreement-gate";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { documentAccess } from "../files/access";
import { type OperationContext, runOperation } from "../operations";
import {
  offerContext,
  termsDigest,
  validProposalApproval,
  validProposalSource,
} from "../proposals/shared";
import { partySnapshotsSchema } from "../proposals/terms";
import { currentSellerEvidence } from "../publication/seller-evidence";
import {
  allow,
  commandEnvelope,
  liveStaff,
  openTaskStates,
  parseInput,
  taskResource,
  version,
} from "../work/shared";
import { currentOwnerAcknowledgment } from "./owner-preview";
import { bumpCase, caseEvent, caseFor, liveParticipation } from "./shared";

const note = z.string().trim().min(3).max(2000);
const instant = z.iso.datetime({ offset: true });
const result = (row: typeof cases.$inferSelect) => ({
  id: row.id,
  reference: row.reference,
  version: row.version + 1,
  recordedAt: new Date().toISOString(),
});
export async function lifecycleCase(db: Executor, session: Session, id: string, lock = false) {
  const live = await liveStaff(db, session);
  const bound = await caseFor(db, live, id, "case.transition", lock);
  await assertCan(db, live.actor, "case.read_internal", bound.resource);
  return bound;
}
async function history(
  ctx: OperationContext,
  row: typeof cases.$inferSelect,
  kind: string,
  reason: string,
  evidence: Record<string, unknown>,
  toStage = row.stage,
) {
  await ctx.tx.insert(caseStageHistory).values({
    caseId: row.id,
    fromStage: row.stage,
    toStage,
    reason,
    evidence: { ...evidence, kind },
    actorKind: ctx.actor.kind,
    actorId: ctx.actor.id,
    operationId: ctx.operationId,
  });
}

const ackSchema = z.object({
  ...commandEnvelope,
  briefId: z.uuid(),
  reviewed: z.boolean().refine((value) => value, "review_required"),
});
export async function acknowledgeBrief(
  db: Executor,
  session: Session,
  raw: z.input<typeof ackSchema>,
) {
  const input = parseInput(ackSchema, raw);
  const authorize = async (tx: Executor, lock = false) => {
    const bound = await caseFor(tx, session, input.id, "portal.brief.acknowledge", lock);
    if (bound.live.actor.kind !== "client") throw new AppError("not_found");
    requireFreshAuth(bound.live);
    const [principal] = await tx
      .select()
      .from(principals)
      .where(eq(principals.id, bound.live.account.id));
    const [participant] = principal?.partyId
      ? await tx
          .select()
          .from(caseParticipants)
          .where(
            and(
              eq(caseParticipants.caseId, input.id),
              eq(caseParticipants.partyId, principal.partyId),
              inArray(caseParticipants.role, ["buyer", "co_buyer", "tenant", "seller", "landlord"]),
              liveParticipation(),
            ),
          )
      : [];
    if (!participant) throw new AppError("not_found");
    return bound;
  };
  const { live } = await authorize(db);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "case.brief.acknowledge",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await authorize(ctx.tx, true);
      version(row, input.expectedVersion);
      const [brief] = await ctx.tx
        .select()
        .from(briefRevisions)
        .where(eq(briefRevisions.caseId, row.id))
        .orderBy(desc(briefRevisions.revisionNumber))
        .limit(1)
        .for("update");
      if (!brief || brief.id !== input.briefId || row.disposition !== "active")
        throw new AppError("version_conflict");
      if (brief.clientAcknowledgedAt) throw new AppError("transition_denied");
      await ctx.tx
        .update(briefRevisions)
        .set({ clientAcknowledgedAt: new Date(), clientAcknowledgedById: live.account.id })
        .where(eq(briefRevisions.id, brief.id));
      await bumpCase(ctx.tx, row.id, row.version);
      await caseEvent(
        ctx,
        "case",
        row.id,
        "case.brief.acknowledged",
        "portal.brief.acknowledge",
        { briefId: brief.id, briefRevision: brief.revisionNumber, acknowledgedBy: live.account.id },
        "participants",
      );
      return result(row);
    },
  );
}

/** The complete active-work manifest; recent messages are deliberately bounded to 20. */
export async function caseWorkSnapshot(db: Executor, id: string) {
  const commitments = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.caseId, id), inArray(tasks.state, [...openTaskStates])))
    .orderBy(asc(tasks.id));
  const agenda = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.caseId, id),
        inArray(appointments.state, ["requested", "proposed", "confirmed", "reschedule_requested"]),
      ),
    )
    .orderBy(asc(appointments.id));
  const offers = await db
    .select({
      id: proposals.id,
      version: proposals.version,
      revisionId: proposalRevisions.id,
      state: proposalRevisions.state,
      termsHash: proposalRevisions.termsHash,
    })
    .from(proposals)
    .innerJoin(
      proposalRevisions,
      and(
        eq(proposalRevisions.proposalId, proposals.id),
        eq(proposalRevisions.revisionNumber, proposals.activeRevisionNumber),
      ),
    )
    .where(eq(proposals.caseId, id))
    .orderBy(asc(proposals.id));
  const files = await db
    .select({
      id: documents.id,
      version: documents.version,
      versionId: documentVersions.id,
      state: documentVersions.state,
      digest: documentVersions.sha256,
      purpose: documents.purpose,
      audience: documents.audience,
    })
    .from(documents)
    .innerJoin(
      documentVersions,
      and(
        eq(documentVersions.documentId, documents.id),
        eq(documentVersions.versionNumber, documents.currentVersionNumber),
      ),
    )
    .where(eq(documents.caseId, id))
    .orderBy(asc(documents.id));
  const recent = await db
    .select({
      id: messages.id,
      updatedAt: messages.updatedAt,
      state: messages.state,
      hash: messages.payloadDigest,
    })
    .from(messages)
    .where(eq(messages.caseId, id))
    .orderBy(desc(messages.createdAt), asc(messages.id))
    .limit(20);
  const decisions = offers.length
    ? await db
        .select({
          id: approvals.id,
          state: approvals.state,
          hash: approvals.subjectHash,
          expiresAt: approvals.expiresAt,
        })
        .from(approvals)
        .where(
          inArray(
            approvals.subjectId,
            offers.map((p) => p.revisionId),
          ),
        )
        .orderBy(asc(approvals.id))
    : [];
  const snapshot = {
    commitments: commitments.map((t) => ({
      id: t.id,
      version: t.version,
      state: t.state,
      ownerId: t.ownerId,
      dueAt: t.dueAt,
      promisedToClient: t.promisedToClient,
      pendingOwnerId: t.pendingOwnerId,
    })),
    appointments: agenda.map((a) => ({
      id: a.id,
      version: a.version,
      state: a.state,
      hostId: a.hostId,
      startsAt: a.confirmedStartsAt,
    })),
    offers,
    files,
    recent,
    decisions,
  };
  return { commitments, agenda, offers, files, recent, decisions, hash: hashRequest(snapshot) };
}
async function accountableStaff(db: Executor, id: string) {
  const [row] = await db
    .select({ id: principals.id })
    .from(principals)
    .innerJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
    .where(
      and(
        eq(principals.id, id),
        eq(principals.kind, "staff"),
        eq(principals.status, "active"),
        eq(staffMemberships.state, "active"),
      ),
    );
  if (!row) throw new AppError("transition_denied");
}
async function receiverAccess(
  db: Executor,
  actor: Actor,
  id: string,
  snapshot: Awaited<ReturnType<typeof caseWorkSnapshot>>,
) {
  await accountableStaff(db, actor.id);
  for (const capability of ["case.read", "case.read_internal", "case.transition"] as const)
    await assertCan(db, actor, capability, { type: "case", id, audience: "internal" });
  for (const task of snapshot.commitments)
    await assertCan(db, actor, "task.manage", taskResource(task));
  for (const appointment of snapshot.agenda)
    await assertCan(db, actor, "appointment.manage", {
      type: "appointment",
      id: appointment.id,
      caseId: id,
      audience: "internal",
    });
  for (const file of snapshot.files) {
    await assertCan(db, actor, "document.read_restricted", {
      type: "document",
      id: file.id,
      audience: file.audience,
    });
    if (
      ["service_agreement", "express_start", "case_check", "process_policy"].includes(file.purpose)
    )
      await assertCan(db, actor, "compliance.review", { type: "case", id, audience: "internal" });
  }
  if (snapshot.offers.length)
    await assertCan(db, actor, "proposal.manage", { type: "case", id, audience: "internal" });
}
const handoverSchema = z.object({
  ...commandEnvelope,
  action: z.enum(["request", "accept", "cancel"]),
  receiverId: z.uuid(),
  reason: note,
  reviewed: z.boolean().refine((value) => value, "review_required"),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export async function handoverCase(
  db: Executor,
  session: Session,
  raw: z.input<typeof handoverSchema>,
) {
  const input = parseInput(handoverSchema, raw);
  const { live } = await lifecycleCase(db, session, input.id);
  requireFreshAuth(live);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "case.handover",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await lifecycleCase(ctx.tx, session, input.id, true);
      requireFreshAuth(await liveStaff(ctx.tx, session));
      version(row, input.expectedVersion);
      if (row.disposition === "closed") throw new AppError("transition_denied");
      // Lock commitments before re-reading their versions; another task command cannot disappear.
      await ctx.tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.caseId, row.id))
        .for("update");
      await ctx.tx
        .select({ id: appointments.id })
        .from(appointments)
        .where(eq(appointments.caseId, row.id))
        .for("update");
      await ctx.tx
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.caseId, row.id))
        .for("share");
      const snapshot = await caseWorkSnapshot(ctx.tx, row.id);
      if (snapshot.hash !== input.snapshotHash) throw new AppError("version_conflict");
      await receiverAccess(ctx.tx, live.actor, row.id, snapshot);
      if (input.action === "request") {
        if (input.receiverId === row.ownerId) throw new AppError("validation_failed");
        await requireAvailableStaff(ctx.tx, input.receiverId, true);
        await receiverAccess(ctx.tx, { kind: "staff", id: input.receiverId }, row.id, snapshot);
        await bumpCase(ctx.tx, row.id, row.version, { pendingOwnerId: input.receiverId });
      } else if (input.action === "accept") {
        if (row.pendingOwnerId !== live.account.id || input.receiverId !== live.account.id)
          throw new AppError("forbidden");
        await requireAvailableStaff(ctx.tx, live.account.id, true);
        await receiverAccess(ctx.tx, live.actor, row.id, snapshot);
        for (const task of snapshot.commitments.filter((t) => t.ownerId === row.ownerId)) {
          await ctx.tx
            .update(tasks)
            .set({
              ownerId: live.account.id,
              pendingOwnerId: null,
              version: task.version + 1,
              updatedAt: new Date(),
            })
            .where(eq(tasks.id, task.id));
          await caseEvent(ctx, "task", task.id, "task.handover.accepted", "task.manage", {
            fromOwnerId: task.ownerId,
            toOwnerId: live.account.id,
            caseId: row.id,
          });
        }
        await bumpCase(ctx.tx, row.id, row.version, {
          ownerId: live.account.id,
          pendingOwnerId: null,
        });
      } else {
        if (row.pendingOwnerId !== input.receiverId) throw new AppError("version_conflict");
        await bumpCase(ctx.tx, row.id, row.version, { pendingOwnerId: null });
      }
      await history(ctx, row, `handover_${input.action}`, input.reason, {
        fromOwnerId: row.ownerId,
        receiverId: input.receiverId,
        snapshotHash: snapshot.hash,
        commitments: snapshot.commitments.map((t) => ({ id: t.id, version: t.version })),
        appointmentIds: snapshot.agenda.map((a) => a.id),
      });
      await caseEvent(ctx, "case", row.id, `case.handover.${input.action}`, "case.transition");
      return result(row);
    },
  );
}

async function assertResolved(db: Executor, id: string) {
  await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.caseId, id)).for("update");
  await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(eq(appointments.caseId, id))
    .for("update");
  await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(eq(proposals.caseId, id))
    .for("update");
  const work = await caseWorkSnapshot(db, id);
  if (
    work.commitments.length ||
    work.agenda.length ||
    work.offers.some((p) =>
      ["draft", "reviewed", "submitted", "awaiting_response"].includes(p.state),
    )
  )
    throw new AppError("transition_denied", {
      fieldErrors: { reason: ["Resolve each open task, appointment and proposal before closing."] },
    });
  const resolved = await db
    .select({
      id: tasks.id,
      state: tasks.state,
      outcome: tasks.outcomeNote,
      reason: tasks.cancelReason,
      evidence: tasks.evidenceIds,
      ownerId: tasks.ownerId,
    })
    .from(tasks)
    .where(eq(tasks.caseId, id))
    .orderBy(asc(tasks.id));
  return resolved;
}
const dispositionSchema = z.object({
  ...commandEnvelope,
  state: z.enum(caseDispositions),
  reason: note,
  waitingOn: z.string().trim().max(2000),
  reviewAt: z.union([z.literal(""), instant]),
  outcome: z.string().trim().max(2000),
  retention: z.string().trim().max(2000),
  aftercare: z.string().trim().max(2000),
  nextAction: z.string().trim().max(500),
  dueAt: z.union([z.literal(""), instant]),
});
export async function changeCaseDisposition(
  db: Executor,
  session: Session,
  raw: z.input<typeof dispositionSchema>,
) {
  const input = parseInput(dispositionSchema, raw);
  const { live } = await lifecycleCase(db, session, input.id);
  requireFreshAuth(live);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "case.disposition",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await lifecycleCase(ctx.tx, session, input.id, true);
      version(row, input.expectedVersion);
      requireFreshAuth(await liveStaff(ctx.tx, session));
      allow(dispositionTransitions.machine.check(row.disposition, input.state));
      const resolved = input.state === "closed" ? await assertResolved(ctx.tx, row.id) : [];
      const commitmentDispositions = Object.fromEntries(
        resolved.map((t) => [
          t.id,
          `${t.state}: ${t.outcome ?? t.reason ?? "Recorded terminal state"}`,
        ]),
      );
      allow(
        dispositionTransitions.guard(
          row.disposition,
          input.state,
          {
            reason: input.reason,
            waitingOn: input.waitingOn,
            reviewAt: input.reviewAt,
            outcome: input.outcome,
            openCommitmentIds: [],
            commitmentDispositions,
          },
          live.actor,
        ),
      );
      const patch: Partial<typeof cases.$inferInsert> = {
        disposition: input.state,
        dispositionReason: input.reason,
      };
      if (input.state === "closed") {
        if (row.pendingOwnerId || !input.retention || !input.aftercare)
          throw new AppError("transition_denied");
        Object.assign(patch, { closureOutcome: input.outcome, commitmentDispositions });
      } else if (input.state === "paused") {
        if (Date.parse(input.reviewAt) <= Date.now()) throw new AppError("validation_failed");
        Object.assign(patch, { waitingOn: input.waitingOn, reviewAt: new Date(input.reviewAt) });
      } else {
        if (
          !row.ownerId ||
          input.nextAction.length < 3 ||
          !input.dueAt ||
          Date.parse(input.dueAt) <= Date.now()
        )
          throw new AppError("validation_failed");
        await accountableStaff(ctx.tx, row.ownerId);
        Object.assign(patch, {
          nextAction: input.nextAction,
          nextActionDueAt: new Date(input.dueAt),
          waitingOn: null,
          reviewAt: null,
        });
      }
      await bumpCase(ctx.tx, row.id, row.version, patch);
      await history(ctx, row, "disposition", input.reason, {
        fromDisposition: row.disposition,
        toDisposition: input.state,
        outcome: input.outcome,
        retention: input.retention,
        aftercare: input.aftercare,
        commitments: resolved,
        waitingOn: input.waitingOn,
        reviewAt: input.reviewAt,
      });
      await caseEvent(ctx, "case", row.id, `case.disposition.${input.state}`, "case.transition");
      return result(row);
    },
  );
}

const requestSchema = z.object({
  ...commandEnvelope,
  interestId: z.uuid(),
  reviewed: z.boolean().refine((value) => value, "review_required"),
});
export async function requestCaseProposal(
  db: Executor,
  session: Session,
  raw: z.input<typeof requestSchema>,
) {
  const input = parseInput(requestSchema, raw);
  const { live } = await caseFor(db, session, input.id, "portal.proposal.respond");
  if (live.actor.kind !== "client") throw new AppError("not_found");
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "case.proposal.request",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await caseFor(ctx.tx, session, input.id, "portal.proposal.respond", true);
      version(row, input.expectedVersion);
      const [principal] = await ctx.tx
        .select()
        .from(principals)
        .where(eq(principals.id, live.account.id));
      if (!principal?.partyId) throw new AppError("not_found");
      await offerContext(ctx.tx, row.id, input.interestId, principal.partyId);
      const [interest] = await ctx.tx
        .select({ id: interests.id, revisionId: interests.listingRevisionId })
        .from(interests)
        .innerJoin(listings, eq(listings.id, interests.listingId))
        .where(
          and(
            eq(interests.id, input.interestId),
            eq(interests.caseId, row.id),
            inArray(interests.state, ["shortlisted", "viewed", "viewing_requested"]),
            eq(interests.listingRevisionId, listings.approvedRevisionId),
          ),
        );
      if (!interest || row.disposition !== "active") throw new AppError("transition_denied");
      await bumpCase(ctx.tx, row.id, row.version);
      await history(ctx, row, "proposal_requested", "Client requested proposal preparation", {
        interestId: interest.id,
        listingRevisionId: interest.revisionId,
      });
      await caseEvent(
        ctx,
        "case",
        row.id,
        "case.proposal.requested",
        "portal.proposal.respond",
        { interestId: interest.id },
        "participants",
      );
      return result(row);
    },
  );
}

const stageSchema = z.object({
  ...commandEnvelope,
  stage: z.string().min(3).max(60),
  reason: note,
  completionEvidenceId: z.union([z.literal(""), z.uuid()]),
  outcome: z.string().trim().max(2000),
  retention: z.string().trim().max(2000),
  aftercare: z.string().trim().max(2000),
  handover: z.string().trim().max(2000),
});
export async function transitionCaseStage(
  db: Executor,
  session: Session,
  raw: z.input<typeof stageSchema>,
) {
  const input = parseInput(stageSchema, raw);
  const { live } = await lifecycleCase(db, session, input.id);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "case.stage",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await lifecycleCase(ctx.tx, session, input.id, true);
      version(row, input.expectedVersion);
      if (row.disposition !== "active" || !row.ownerId) throw new AppError("transition_denied");
      await accountableStaff(ctx.tx, row.ownerId);
      const to = input.stage as CaseStage,
        rules = caseStageTransitions(row.kind);
      allow(rules.machine.check(row.stage as CaseStage, to));
      const [brief] = await ctx.tx
        .select()
        .from(briefRevisions)
        .where(eq(briefRevisions.caseId, row.id))
        .orderBy(desc(briefRevisions.revisionNumber))
        .limit(1);
      const options = await ctx.tx
        .select({ id: interests.id, revisionId: interests.listingRevisionId })
        .from(interests)
        .innerJoin(listings, eq(listings.id, interests.listingId))
        .where(
          and(
            eq(interests.caseId, row.id),
            eq(interests.listingRevisionId, listings.approvedRevisionId),
            inArray(interests.state, [
              "suggested",
              "shortlisted",
              "viewing_requested",
              "viewed",
              "proposal",
            ]),
          ),
        );
      const [appointment] = await ctx.tx
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.caseId, row.id),
            inArray(appointments.state, ["confirmed", "completed"]),
          ),
        );
      const requested = await ctx.tx
        .select()
        .from(caseStageHistory)
        .where(
          and(
            eq(caseStageHistory.caseId, row.id),
            eq(caseStageHistory.actorKind, "client"),
            sql`${caseStageHistory.evidence}->>'kind' = 'proposal_requested'`,
          ),
        );
      const clientRequestedProposal = requested.some((h) => {
        const e = h.evidence as { interestId: string; listingRevisionId: string };
        return options.some((o) => o.id === e.interestId && o.revisionId === e.listingRevisionId);
      });
      const offers = await ctx.tx
        .select({ proposal: proposals, revision: proposalRevisions, listing: listings })
        .from(proposals)
        .innerJoin(
          proposalRevisions,
          and(
            eq(proposalRevisions.proposalId, proposals.id),
            eq(proposalRevisions.revisionNumber, proposals.activeRevisionNumber),
          ),
        )
        .innerJoin(listings, eq(listings.id, proposals.listingId))
        .where(eq(proposals.caseId, row.id));
      const agreed = offers.find(
        (p) =>
          p.revision.state === "agreed_for_next_step" &&
          p.revision.termsHash === termsDigest(p.revision),
      );
      const submitted = offers.find(
        (p) =>
          ["submitted", "awaiting_response", "agreed_for_next_step"].includes(p.revision.state) &&
          p.revision.termsHash === termsDigest(p.revision),
      );
      if (["proposal_active", "proposal_coordination"].includes(to)) {
        if (!submitted || submitted.revision.deadlineAt <= new Date())
          throw new AppError("transition_denied");
        await validProposalApproval(ctx.tx, submitted.revision);
        await validProposalSource(ctx.tx, submitted.proposal, submitted.revision);
      }
      const evidence: StageEvidence = {
        responsibleBrokerId: row.ownerId,
        acknowledgedBriefRevisionId:
          brief?.clientAcknowledgedAt && brief.brokerAcknowledgedAt ? brief.id : undefined,
        reviewedInterestCount: options.length,
        appointmentId: appointment?.id,
        clientRequestedProposal,
        submittedProposalRevisionId: submitted?.revision.id,
        agreedProposalRevisionId: agreed?.revision.id,
        reason: input.reason,
        outcomeNote: input.outcome,
      };
      if (row.kind === "seller" || row.kind === "landlord") {
        const [instruction] = await ctx.tx
          .select()
          .from(sellerInstructions)
          .where(and(eq(sellerInstructions.caseId, row.id), currentSellerEvidence()));
        const preparation = await ctx.tx
          .select({ id: tasks.id })
          .from(tasks)
          .where(
            and(
              eq(tasks.caseId, row.id),
              inArray(tasks.type, ["fact_verification", "document_request", "publishing"]),
            ),
          );
        Object.assign(evidence, {
          authorityReviewed: Boolean(instruction),
          sellerInstructionId: instruction?.id,
          preparationTaskIds: preparation.map((t) => t.id),
        });
        if (to === "marketing")
          Object.assign(evidence, {
            previewAcknowledgmentId:
              (await currentOwnerAcknowledgment(ctx.tx, row.id)) ?? undefined,
          });
      }
      if (to === "coordination") {
        if (!agreed) throw new AppError("transition_denied");
        await assertCaseAgreementReady(ctx.tx, row.id, { proposalRevisionId: agreed.revision.id });
      }
      if (to === "completed" || to === "completion_handover") {
        requireFreshAuth(await liveStaff(ctx.tx, session));
        if (
          !agreed ||
          !input.completionEvidenceId ||
          !input.outcome ||
          !input.retention ||
          !input.aftercare ||
          !input.handover ||
          row.pendingOwnerId ||
          !["sold", "let"].includes(agreed.listing.commercialState)
        )
          throw new AppError("transition_denied");
        await assertCaseAgreementReady(ctx.tx, row.id, { proposalRevisionId: agreed.revision.id });
        const responses = await ctx.tx
          .select()
          .from(proposalResponses)
          .where(eq(proposalResponses.revisionId, agreed.revision.id));
        if (
          !partySnapshotsSchema
            .parse(agreed.revision.parties)
            .every((p) =>
              responses.some(
                (r) =>
                  r.partyId === p.partyId &&
                  r.decision === "agree" &&
                  r.termsHash === agreed.revision.termsHash,
              ),
            )
        )
          throw new AppError("transition_denied");
        await documentAccess(ctx.tx, session, input.completionEvidenceId);
        const completion = await reviewedEvidence(ctx.tx, input.completionEvidenceId, {
          caseId: row.id,
          purpose: "case_completion",
        });
        await assertResolved(ctx.tx, row.id);
        Object.assign(evidence, {
          completionEvidenceIds: [completion.file.id],
          remainingObligations: [],
        });
      }
      allow(rules.guard(row.stage as CaseStage, to, evidence, live.actor));
      await bumpCase(ctx.tx, row.id, row.version, { stage: to });
      await history(
        ctx,
        row,
        "stage",
        input.reason,
        {
          ...evidence,
          retention: input.retention,
          aftercare: input.aftercare,
          handover: input.handover,
        },
        to,
      );
      await caseEvent(ctx, "case", row.id, "case.stage.changed", "case.transition", {
        from: row.stage,
        to,
      });
      return { ...result(row), stage: to };
    },
  );
}

export async function lifecycleView(db: Executor, session: Session, id: string) {
  const { row, live } = await lifecycleCase(db, session, id);
  const snapshot = await caseWorkSnapshot(db, id);
  const members = await db
    .select({ id: principals.id, name: principals.displayName })
    .from(principals)
    .innerJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
    .where(
      and(
        eq(principals.kind, "staff"),
        eq(principals.status, "active"),
        eq(staffMemberships.state, "active"),
        availableStaff(),
      ),
    )
    .orderBy(asc(principals.displayName), asc(principals.id));
  // Do not truncate the directory before checking record-scoped eligibility.
  const candidates = members.filter((member) => member.id !== row.ownerId);
  const eligible = await staffWhoCan(
    db,
    candidates.map((member) => member.id),
    ["case.transition", "case.read_internal"],
    { type: "case", id, audience: "internal" },
  );
  const receivers = candidates.filter((member) => eligible.has(member.id));
  const historyRows = await db
    .select({
      id: caseStageHistory.id,
      from: caseStageHistory.fromStage,
      to: caseStageHistory.toStage,
      reason: caseStageHistory.reason,
      at: caseStageHistory.occurredAt,
      evidence: caseStageHistory.evidence,
    })
    .from(caseStageHistory)
    .where(eq(caseStageHistory.caseId, id))
    .orderBy(desc(caseStageHistory.occurredAt))
    .limit(30);
  return {
    row,
    snapshotHash: snapshot.hash,
    openTasks: snapshot.commitments.length,
    appointments: snapshot.agenda.length,
    proposals: snapshot.offers.filter((p) =>
      ["draft", "reviewed", "submitted", "awaiting_response"].includes(p.state),
    ).length,
    documentCount: snapshot.files.length,
    approvalCount: snapshot.decisions.filter((d) => d.state === "pending").length,
    recentMessages: snapshot.recent.length,
    receivers,
    canAccept: row.pendingOwnerId === live.account.id,
    history: historyRows,
  };
}
