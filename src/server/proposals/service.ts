import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { approvals, proposalResponses, proposalRevisions, proposals } from "@/db/schema";
import { guardProposalTransition, proposalMachine } from "@/domain/proposal";
import { sofiaInstant } from "../appointments/time";
import { recordAudit } from "../audit";
import { requireFreshAuth, type Session } from "../auth/sessions";
import { assertCan } from "../authz";
import { bumpCase, caseEvent, caseFor } from "../cases/shared";
import { assertCaseAgreementReady } from "../compliance/agreement-gate";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { type OperationContext, runOperation } from "../operations";
import { nextReference } from "../references";
import { allow, commandEnvelope, parseInput, version } from "../work/shared";
import {
  offerContext,
  proposalFor,
  type Revision,
  termsContent,
  termsDigest,
  validProposalApproval,
  validProposalSource,
} from "./shared";
import { partySnapshotsSchema, termInputSchema } from "./terms";

const additionalParties = z
  .array(z.uuid())
  .max(18)
  .refine((ids) => new Set(ids).size === ids.length, "duplicate_party")
  .optional();
const createSchema = z.object({
  ...commandEnvelope,
  interestId: z.uuid(),
  clientPartyId: z.uuid(),
  additionalPartyIds: additionalParties,
  ...termInputSchema.shape,
});
const revisionSchema = z.object({
  ...commandEnvelope,
  revisionId: z.uuid(),
  clientPartyId: z.uuid(),
  additionalPartyIds: additionalParties,
  reason: z.string().trim().min(3).max(1500),
  ...termInputSchema.shape,
});
const transitionSchema = z.object({
  ...commandEnvelope,
  revisionId: z.uuid(),
  action: z.enum(["review", "submit", "withdraw", "expire"]),
  reviewed: z.boolean(),
  reason: z.string().trim().max(1500),
});
const decisionSchema = z.object({
  ...commandEnvelope,
  revisionId: z.uuid(),
  state: z.enum(["declined", "agreed_for_next_step"]),
  reason: z.string().trim().min(3).max(1500),
});
function currentRevision(row: Revision, expectedId: string, now = new Date()) {
  if (row.id !== expectedId) throw new AppError("version_conflict");
  if (row.deadlineAt <= now)
    throw new AppError("transition_denied", { fieldErrors: { deadline: ["proposal_expired"] } });
  if (termsDigest(row) !== row.termsHash) throw new AppError("approval_stale");
}
const result = (proposal: typeof proposals.$inferSelect) => ({
  id: proposal.id,
  reference: proposal.reference,
  version: proposal.version + 1,
  recordedAt: new Date().toISOString(),
});
async function bumpProposal(
  ctx: OperationContext,
  proposal: typeof proposals.$inferSelect,
  activeRevisionNumber = proposal.activeRevisionNumber,
) {
  await ctx.tx
    .update(proposals)
    .set({ activeRevisionNumber, version: proposal.version + 1, updatedAt: new Date() })
    .where(eq(proposals.id, proposal.id));
}
async function invalidateApproval(ctx: OperationContext, row: Revision, reason: string) {
  if (row.approvalId)
    await ctx.tx
      .update(approvals)
      .set({
        state: "invalidated",
        invalidatedAt: new Date(),
        invalidationReason: reason,
        version: sql`${approvals.version} + 1`,
      })
      .where(and(eq(approvals.id, row.approvalId), eq(approvals.state, "approved")));
}
function terms(
  input: z.infer<typeof termInputSchema>,
  context: Awaited<ReturnType<typeof offerContext>>,
) {
  const deadlineAt = sofiaInstant(input.deadline);
  if (!deadlineAt || deadlineAt <= new Date())
    throw new AppError("validation_failed", { fieldErrors: { deadline: ["future_required"] } });
  if (input.period !== (context.listing.purpose === "sale" ? "total" : "month"))
    throw new AppError("validation_failed", {
      fieldErrors: { period: ["listing_purpose_period_mismatch"] },
    });
  const data = {
    amountMinor: input.amountMinor,
    currency: input.currency,
    period: input.period,
    paymentBasis: input.paymentBasis,
    conditions: input.conditions,
    inclusions: input.inclusions,
    parties: context.snapshot,
    deadlineAt,
    deadlineTimezone: "Europe/Sofia",
    sourceListingRevisionId: context.published.listingRevisionId,
  };
  return { ...data, termsHash: termsDigest(data) };
}

export async function createProposal(
  db: Executor,
  session: Session,
  raw: z.input<typeof createSchema>,
) {
  const input = parseInput(createSchema, raw);
  const authorize = async (tx: Executor, lock: boolean) => {
    const bound = await caseFor(tx, session, input.id, "proposal.manage", lock);
    if (bound.live.account.kind !== "staff") throw new AppError("forbidden");
    requireFreshAuth(bound.live);
    return bound;
  };
  const { live } = await authorize(db, false);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "proposal.create",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await authorize(ctx.tx, true);
      version(row, input.expectedVersion);
      if (row.disposition !== "active") throw new AppError("transition_denied");
      const context = await offerContext(
        ctx.tx,
        row.id,
        input.interestId,
        input.clientPartyId,
        input.additionalPartyIds,
      );
      await assertCan(ctx.tx, live.actor, "listing.read", {
        type: "listing",
        id: context.listing.id,
        propertyId: context.listing.propertyId,
      });
      const [active] = await ctx.tx
        .select({ id: proposals.id })
        .from(proposals)
        .innerJoin(
          proposalRevisions,
          and(
            eq(proposalRevisions.proposalId, proposals.id),
            eq(proposalRevisions.revisionNumber, proposals.activeRevisionNumber),
          ),
        )
        .where(
          and(
            eq(proposals.caseId, row.id),
            eq(proposals.interestId, context.interest.id),
            inArray(proposalRevisions.state, [
              "draft",
              "reviewed",
              "submitted",
              "awaiting_response",
            ]),
          ),
        );
      if (active) throw new AppError("transition_denied");
      const [proposal] = await ctx.tx
        .insert(proposals)
        .values({
          reference: await nextReference(ctx.tx, "proposal"),
          caseId: row.id,
          interestId: context.interest.id,
          listingId: context.listing.id,
        })
        .returning();
      if (!proposal) throw new Error("Proposal insert failed");
      await ctx.tx
        .insert(proposalRevisions)
        .values({ proposalId: proposal.id, revisionNumber: 1, ...terms(input, context) });
      await bumpCase(ctx.tx, row.id, row.version);
      await caseEvent(ctx, "proposal", proposal.id, "proposal.created", "proposal.manage", {
        caseId: row.id,
        sourceListingRevisionId: context.published.listingRevisionId,
      });
      return { ...result(proposal), version: 1 };
    },
  );
}

export async function reviseProposal(
  db: Executor,
  session: Session,
  raw: z.input<typeof revisionSchema>,
) {
  const input = parseInput(revisionSchema, raw);
  const { live } = await proposalFor(db, session, input.id, true, false, input.revisionId);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "proposal.revise",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { proposal, revision, principalPartyId } = await proposalFor(
        ctx.tx,
        session,
        input.id,
        true,
        true,
        input.revisionId,
      );
      version(proposal, input.expectedVersion);
      if (revision.id !== input.revisionId || revision.state === "agreed_for_next_step")
        throw new AppError("version_conflict");
      if (!proposal.interestId) throw new AppError("transition_denied");
      if (termsDigest(revision) !== revision.termsHash) throw new AppError("approval_stale");
      const client = live.account.kind === "client";
      let additionalPartyIds = input.additionalPartyIds ?? [];
      if (client) {
        currentRevision(revision, input.revisionId);
        allow(proposalMachine.check(revision.state, "countered"));
        await validProposalApproval(ctx.tx, revision);
        const priorParties = partySnapshotsSchema.parse(revision.parties);
        const buyer = priorParties.find((p) => ["buyer", "co_buyer", "tenant"].includes(p.role));
        if (!buyer || input.clientPartyId !== buyer.partyId) throw new AppError("forbidden");
        const priorAdditional = priorParties
          .filter(
            (p) => ["buyer", "co_buyer", "tenant"].includes(p.role) && p.partyId !== buyer.partyId,
          )
          .map((p) => p.partyId)
          .sort();
        if (
          input.additionalPartyIds &&
          hashRequest([...input.additionalPartyIds].filter((id) => id !== buyer.partyId).sort()) !==
            hashRequest(priorAdditional)
        )
          throw new AppError("forbidden");
        additionalPartyIds = priorAdditional;
        const [existing] = await ctx.tx
          .select({ id: proposalResponses.id })
          .from(proposalResponses)
          .where(
            and(
              eq(proposalResponses.revisionId, revision.id),
              eq(proposalResponses.partyId, principalPartyId),
            ),
          );
        if (existing) throw new AppError("transition_denied");
      }
      const context = await offerContext(
        ctx.tx,
        proposal.caseId,
        proposal.interestId,
        input.clientPartyId,
        additionalPartyIds,
      );
      if (client && hashRequest(context.snapshot) !== hashRequest(revision.parties))
        throw new AppError("approval_stale");
      const newTerms = terms(input, context);
      const nextRevision = proposal.activeRevisionNumber + 1;
      let responseId: string | undefined;
      if (client) {
        const [response] = await ctx.tx
          .insert(proposalResponses)
          .values({
            revisionId: revision.id,
            partyId: principalPartyId,
            actorKind: "client",
            actorId: live.account.id,
            decision: "counter",
            reason: input.reason,
            termsHash: revision.termsHash,
            operationId: ctx.operationId,
          })
          .returning({ id: proposalResponses.id });
        responseId = response?.id;
        allow(
          guardProposalTransition(
            revision.state,
            "countered",
            {
              deadlineAt: revision.deadlineAt.toISOString(),
              now: new Date().toISOString(),
              responseRecordId: responseId,
            },
            live.actor,
          ),
        );
      }
      const oldState = client
        ? "countered"
        : revision.deadlineAt <= new Date() && revision.state === "awaiting_response"
          ? "expired"
          : ["draft", "reviewed", "submitted", "awaiting_response"].includes(revision.state)
            ? "withdrawn"
            : revision.state;
      if (oldState !== revision.state)
        await ctx.tx
          .update(proposalRevisions)
          .set({
            state: oldState,
            responseNote: input.reason,
            respondedAt: new Date(),
            version: revision.version + 1,
          })
          .where(eq(proposalRevisions.id, revision.id));
      await invalidateApproval(ctx, revision, "Superseded by a new exact-terms revision");
      await ctx.tx.insert(proposalRevisions).values({
        proposalId: proposal.id,
        revisionNumber: nextRevision,
        respondsToRevisionId: revision.id,
        ...newTerms,
      });
      await bumpProposal(ctx, proposal, nextRevision);
      await caseEvent(
        ctx,
        "proposal",
        proposal.id,
        client ? "proposal.countered" : "proposal.revised",
        client ? "portal.proposal.respond" : "proposal.manage",
        { priorRevisionId: revision.id, revisionNumber: nextRevision, responseId },
      );
      return result(proposal);
    },
  );
}

export async function transitionProposal(
  db: Executor,
  session: Session,
  raw: z.input<typeof transitionSchema>,
) {
  const input = parseInput(transitionSchema, raw);
  const { live } = await proposalFor(db, session, input.id, true);
  if (live.account.kind !== "staff") throw new AppError("forbidden");
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "proposal.transition",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { proposal, revision } = await proposalFor(ctx.tx, session, input.id, true, true);
      version(proposal, input.expectedVersion);
      if (revision.id !== input.revisionId) throw new AppError("version_conflict");
      const target = {
        review: "reviewed",
        submit: "submitted",
        withdraw: "withdrawn",
        expire: "expired",
      } as const;
      allow(proposalMachine.check(revision.state, target[input.action]));
      if (!["withdraw", "expire"].includes(input.action))
        currentRevision(revision, input.revisionId);
      let approvalId = revision.approvalId;
      if (input.action === "review") {
        if (!input.reviewed)
          throw new AppError("validation_failed", {
            fieldErrors: { reviewed: ["exact_terms_review_required"] },
          });
        await validProposalSource(ctx.tx, proposal, revision);
        const [approval] = await ctx.tx
          .insert(approvals)
          .values({
            kind: "proposal_terms",
            state: "approved",
            subjectType: "proposal_revision",
            subjectId: revision.id,
            subjectVersion: revision.revisionNumber,
            subjectHash: revision.termsHash,
            scope: {
              proposalId: proposal.id,
              partyIds: partySnapshotsSchema.parse(revision.parties).map((p) => p.partyId),
            },
            evidence: { sourceListingRevisionId: revision.sourceListingRevisionId },
            requestedByKind: "staff",
            requestedById: live.account.id,
            decidedByKind: "staff",
            decidedById: live.account.id,
            decidedWithCapability: "proposal.manage",
            decidedAt: new Date(),
            decisionNote: input.reason || "Human reviewed the exact proposal terms",
            expiresAt: revision.deadlineAt,
          })
          .returning({ id: approvals.id });
        approvalId = approval?.id ?? null;
        if (!approvalId) throw new Error("Proposal approval insert failed");
      }
      if (input.action === "submit") {
        if (!input.reviewed)
          throw new AppError("validation_failed", {
            fieldErrors: { reviewed: ["exact_audience_review_required"] },
          });
        await validProposalApproval(ctx.tx, revision);
        await validProposalSource(ctx.tx, proposal, revision);
      }
      allow(
        guardProposalTransition(
          revision.state,
          target[input.action],
          {
            currentContent: hashRequest(termsContent(revision)),
            approvedContent: input.action === "submit" ? revision.termsHash : undefined,
            deadlineAt: revision.deadlineAt.toISOString(),
            now: new Date().toISOString(),
            reason: input.reason,
          },
          live.actor,
        ),
      );
      // Submission makes this reviewed version available only to its exact parties in-app.
      // It records no provider attempt, delivery receipt, legal signature or completion.
      const state = input.action === "submit" ? "awaiting_response" : target[input.action];
      if (input.action === "submit") allow(proposalMachine.check("submitted", "awaiting_response"));
      if (input.action === "withdraw" || input.action === "expire")
        await invalidateApproval(
          ctx,
          revision,
          input.action === "expire" ? "Proposal deadline passed" : input.reason,
        );
      await ctx.tx
        .update(proposalRevisions)
        .set({
          state,
          approvalId,
          version: revision.version + 1,
          ...(input.action === "submit" ? { submittedAt: new Date() } : {}),
          ...(input.action === "withdraw" ? { responseNote: input.reason } : {}),
        })
        .where(eq(proposalRevisions.id, revision.id));
      await bumpProposal(ctx, proposal);
      await caseEvent(ctx, "proposal", proposal.id, `proposal.${state}`, "proposal.manage", {
        revisionId: revision.id,
        termsHash: revision.termsHash,
        availability: input.action === "submit" ? "in_app" : undefined,
      });
      return result(proposal);
    },
  );
}

export async function recordProposalDecision(
  db: Executor,
  session: Session,
  raw: z.input<typeof decisionSchema>,
) {
  const input = parseInput(decisionSchema, raw);
  const { live } = await proposalFor(db, session, input.id, true, false, input.revisionId);
  if (live.account.kind !== "client") throw new AppError("forbidden");
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "proposal.decide",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { proposal, revision, principalPartyId } = await proposalFor(
        ctx.tx,
        session,
        input.id,
        true,
        true,
        input.revisionId,
      );
      version(proposal, input.expectedVersion);
      currentRevision(revision, input.revisionId);
      allow(proposalMachine.check(revision.state, input.state));
      await validProposalApproval(ctx.tx, revision);
      const [existing] = await ctx.tx
        .select({ id: proposalResponses.id })
        .from(proposalResponses)
        .where(
          and(
            eq(proposalResponses.revisionId, revision.id),
            eq(proposalResponses.partyId, principalPartyId),
          ),
        );
      if (existing) throw new AppError("transition_denied");
      if (input.state === "agreed_for_next_step") {
        await validProposalSource(ctx.tx, proposal, revision);
        await assertCaseAgreementReady(ctx.tx, proposal.caseId, {
          proposalRevisionId: revision.id,
        });
      }
      const [response] = await ctx.tx
        .insert(proposalResponses)
        .values({
          revisionId: revision.id,
          partyId: principalPartyId,
          actorKind: "client",
          actorId: live.account.id,
          decision: input.state === "declined" ? "decline" : "agree",
          reason: input.reason,
          termsHash: revision.termsHash,
          operationId: ctx.operationId,
        })
        .returning({ id: proposalResponses.id });
      if (!response) throw new Error("Proposal response insert failed");
      allow(
        guardProposalTransition(
          revision.state,
          input.state,
          {
            deadlineAt: revision.deadlineAt.toISOString(),
            now: new Date().toISOString(),
            responseRecordId: response.id,
          },
          live.actor,
        ),
      );
      const required = partySnapshotsSchema
        .parse(revision.parties)
        .filter((p) => p.required)
        .map((p) => p.partyId);
      const responses = await ctx.tx
        .select({ partyId: proposalResponses.partyId })
        .from(proposalResponses)
        .where(
          and(
            eq(proposalResponses.revisionId, revision.id),
            eq(proposalResponses.decision, "agree"),
            eq(proposalResponses.termsHash, revision.termsHash),
          ),
        );
      const allAgreed =
        input.state === "agreed_for_next_step" &&
        required.every((partyId) => responses.some((row) => row.partyId === partyId));
      const nextState =
        input.state === "declined"
          ? "declined"
          : allAgreed
            ? "agreed_for_next_step"
            : "awaiting_response";
      await ctx.tx
        .update(proposalRevisions)
        .set({
          state: nextState,
          respondedAt: new Date(),
          responseNote: input.reason,
          version: revision.version + 1,
        })
        .where(eq(proposalRevisions.id, revision.id));
      await recordAudit(ctx.tx, {
        action: "proposal.party_response",
        actor: live.actor,
        capability: "portal.proposal.respond",
        recordType: "proposal_response",
        recordId: response.id,
        operationId: ctx.operationId,
        payload: {
          proposalId: proposal.id,
          revisionId: revision.id,
          partyId: principalPartyId,
          termsHash: revision.termsHash,
        },
      });
      await bumpProposal(ctx, proposal);
      await caseEvent(
        ctx,
        "proposal",
        proposal.id,
        allAgreed
          ? "proposal.agreed_for_next_step"
          : input.state === "declined"
            ? "proposal.declined"
            : "proposal.party_agreed",
        "portal.proposal.respond",
        { revisionId: revision.id, responseId: response.id },
      );
      return result(proposal);
    },
  );
}
