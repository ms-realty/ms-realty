import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  approvals,
  briefRevisions,
  caseParticipants,
  caseStageHistory,
  cases,
  inquiries,
  interestFeedback,
  interests,
  listings,
  messages,
  tasks,
} from "@/db/schema";
import { initialStage } from "@/domain/case";
import { guardInquiryTransition, inquiryMachine } from "@/domain/inquiry";
import { guardInterestTransition, interestMachine } from "@/domain/interest";
import { commercialStates } from "@/domain/listing";
import { requireAvailableStaff } from "../auth/availability";
import type { Session } from "../auth/sessions";
import { assertCan, assertCanRead } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { loadPublishedListings, presentationOf } from "../publication/presentation";
import { nextReference } from "../references";
import { caseMatchCriteriaInput, offeredStates } from "../search/search";
import {
  allow,
  commandEnvelope,
  inquiryResource,
  liveStaff,
  parseInput,
  taskResource,
  version,
} from "../work/shared";
import { assessPublishedCandidate } from "./matching";
import { bumpCase, caseEvent, caseFor, liveParticipation } from "./shared";

export {
  type LinkInquiryToExistingCaseInput,
  linkInquiryToExistingCase,
} from "./inquiry-link";

const createSchema = z.object({
  ...commandEnvelope,
  kind: z.enum(["buyer", "tenant", "seller", "landlord"]),
  title: z.string().trim().min(3).max(200),
  nextAction: z.string().trim().min(3).max(500),
  dueAt: z.iso.datetime({ offset: true }),
  requirements: z.string().trim().min(3).max(4000),
  preferences: z.string().trim().max(4000),
});
export type CreateCaseInput = z.input<typeof createSchema>;
const nextSchema = z.object({
  ...commandEnvelope,
  nextAction: z.string().trim().min(3).max(500),
  dueAt: z.iso.datetime({ offset: true }),
  clientSummary: z.string().trim().max(2000),
});
const briefSchema = z.object({
  ...commandEnvelope,
  requirements: z.string().trim().min(3).max(4000),
  preferences: z.string().trim().max(4000),
  criteria: caseMatchCriteriaInput.optional(),
});
const interestSchema = z.object({
  ...commandEnvelope,
  reference: z
    .string()
    .trim()
    .regex(/^MS-\d{5,}$/i),
  explanation: z.string().trim().min(3).max(1500),
  alternativeDecision: z.literal("propose_despite_mismatch").optional(),
  matchReview: z
    .object({
      briefRevision: z.number().int().min(1),
      manifestId: z.uuid(),
      availability: z.enum(commercialStates),
      violated: z.array(z.string().min(1).max(80)).max(32),
      unconfirmed: z.array(z.string().min(1).max(80)).max(32),
      reviewed: z.literal(true),
    })
    .strict()
    .optional(),
});
const respondSchema = z.object({
  ...commandEnvelope,
  state: z.enum(["shortlisted", "declined"]),
  reason: z.string().trim().max(2000),
});
const messageSchema = z.object({
  ...commandEnvelope,
  body: z.string().trim().min(1).max(6000),
  audience: z.enum(["internal", "case_participants"]),
  reviewed: z.boolean(),
});
const items = (requirements: string, preferences: string) => [
  { kind: "hard_constraint", origin: "broker_interpretation", text: requirements },
  ...(preferences
    ? [{ kind: "preference", origin: "broker_interpretation", text: preferences }]
    : []),
];

/** A reviewed intake link, never a contact match or a claim of reviewed seller authority. */
export async function createCaseFromInquiry(db: Executor, session: Session, raw: CreateCaseInput) {
  const input = parseInput(createSchema, raw);
  const live = await liveStaff(db, session);
  const authorize = async (tx: Executor, lock: boolean) => {
    await liveStaff(tx, session);
    await requireAvailableStaff(tx, live.actor.id, lock);
    const query = tx.select().from(inquiries).where(eq(inquiries.id, input.id));
    const [row] = await (lock ? query.for("update") : query);
    if (!row) throw new AppError("not_found");
    await assertCanRead(tx, live.actor, "inquiry.read", inquiryResource(row));
    await assertCan(tx, live.actor, "inquiry.respond", inquiryResource(row));
    await assertCan(tx, live.actor, "case.transition", { type: "case", audience: "internal" });
    await assertCan(tx, live.actor, "case.read", { type: "case", audience: "internal" });
    return row;
  };
  await authorize(db, false);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "case.create_from_inquiry",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const inquiry = await authorize(ctx.tx, true);
      version(inquiry, input.expectedVersion);
      if (!inquiry.partyId || inquiry.ownerId !== live.account.id || inquiry.caseId)
        throw new AppError("transition_denied");
      allow(inquiryMachine.check(inquiry.state, "linked_to_case"));
      if (Date.parse(input.dueAt) <= Date.now())
        throw new AppError("validation_failed", { fieldErrors: { dueAt: ["future_required"] } });
      const [record] = await ctx.tx
        .insert(cases)
        .values({
          reference: await nextReference(ctx.tx, "case"),
          kind: input.kind,
          stage: initialStage[input.kind],
          title: input.title,
          ownerId: live.account.id,
          nextAction: input.nextAction,
          nextActionDueAt: new Date(input.dueAt),
        })
        .returning();
      if (!record) throw new Error("Case insert failed");
      await ctx.tx.insert(caseParticipants).values({
        caseId: record.id,
        partyId: inquiry.partyId,
        role: input.kind,
        authority:
          input.kind === "seller" || input.kind === "landlord" ? "self_declared" : "not_claimed",
      });
      await ctx.tx.insert(briefRevisions).values({
        caseId: record.id,
        revisionNumber: 1,
        items: items(input.requirements, input.preferences),
        authorKind: "staff",
        authorId: live.account.id,
        brokerAcknowledgedAt: new Date(),
        brokerAcknowledgedById: live.account.id,
      });
      await ctx.tx.insert(caseStageHistory).values({
        caseId: record.id,
        toStage: record.stage,
        actorKind: "staff",
        actorId: live.account.id,
        operationId: ctx.operationId,
        reason: "Explicit inquiry qualification",
      });
      const commitments = await ctx.tx
        .select()
        .from(tasks)
        .where(eq(tasks.inquiryId, inquiry.id))
        .for("update");
      for (const commitment of commitments) {
        await assertCan(ctx.tx, live.actor, "task.manage", taskResource(commitment));
        await ctx.tx
          .update(tasks)
          .set({ caseId: record.id, version: commitment.version + 1, updatedAt: new Date() })
          .where(eq(tasks.id, commitment.id));
        await caseEvent(ctx, "task", commitment.id, "task.linked_to_case", "task.manage", {
          caseId: record.id,
          inquiryId: inquiry.id,
        });
      }
      allow(
        guardInquiryTransition(inquiry.state, "linked_to_case", { caseId: record.id }, live.actor),
      );
      await ctx.tx
        .update(inquiries)
        .set({
          caseId: record.id,
          state: "linked_to_case",
          version: sql`${inquiries.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(inquiries.id, inquiry.id));
      await caseEvent(ctx, "case", record.id, "case.created", "case.transition", {
        inquiryId: inquiry.id,
      });
      await caseEvent(ctx, "inquiry", inquiry.id, "inquiry.linked", "inquiry.respond", {
        caseId: record.id,
      });
      return {
        id: record.id,
        reference: record.reference,
        version: 1,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}

export async function updateNextAction(
  db: Executor,
  session: Session,
  raw: z.input<typeof nextSchema>,
) {
  const input = parseInput(nextSchema, raw);
  const authorize = async (tx: Executor, lock: boolean) => {
    const bound = await caseFor(tx, session, input.id, "case.transition", lock);
    await assertCan(tx, bound.live.actor, "case.read_internal", bound.resource);
    return bound;
  };
  const { live } = await authorize(db, false);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "case.next_action",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await authorize(ctx.tx, true);
      version(row, input.expectedVersion);
      if (row.disposition !== "active" || Date.parse(input.dueAt) <= Date.now())
        throw new AppError("transition_denied");
      await bumpCase(ctx.tx, row.id, row.version, {
        nextAction: input.nextAction,
        nextActionDueAt: new Date(input.dueAt),
        clientSummary: input.clientSummary || null,
        waitingOn: null,
        reviewAt: null,
      });
      await caseEvent(ctx, "case", row.id, "case.next_action_recorded", "case.transition");
      return {
        id: row.id,
        reference: row.reference,
        version: row.version + 1,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}

export async function reviseBrief(
  db: Executor,
  session: Session,
  raw: z.input<typeof briefSchema>,
) {
  const input = parseInput(briefSchema, raw);
  const { live } = await caseFor(db, session, input.id, "case.transition");
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "case.brief.revise",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await caseFor(ctx.tx, session, input.id, "case.transition", true);
      version(row, input.expectedVersion);
      if (row.disposition !== "active") throw new AppError("transition_denied");
      if (input.criteria) {
        const purpose =
          row.kind === "buyer" ? "sale" : row.kind === "tenant" ? "long_term_rent" : null;
        if (!purpose || input.criteria.purpose !== purpose)
          throw new AppError("validation_failed", {
            fieldErrors: { "criteria.purpose": ["case_kind_mismatch"] },
          });
      }
      const [previous] = await ctx.tx
        .select()
        .from(briefRevisions)
        .where(eq(briefRevisions.caseId, row.id))
        .orderBy(desc(briefRevisions.revisionNumber))
        .limit(1);
      await ctx.tx.insert(briefRevisions).values({
        caseId: row.id,
        revisionNumber: (previous?.revisionNumber ?? 0) + 1,
        items: items(input.requirements, input.preferences),
        // An old filter must never survive a prose-only Brief revision as a false claim of fit.
        criteria: input.criteria ?? {},
        authorKind: live.actor.kind,
        authorId: live.actor.id,
        brokerAcknowledgedAt: new Date(),
        brokerAcknowledgedById: live.account.id,
      });
      await bumpCase(ctx.tx, row.id, row.version);
      await caseEvent(
        ctx,
        "case",
        row.id,
        "case.brief_revised",
        "case.transition",
        {},
        "participants",
      );
      return {
        id: row.id,
        reference: row.reference,
        version: row.version + 1,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}

export async function addInterest(
  db: Executor,
  session: Session,
  raw: z.input<typeof interestSchema>,
) {
  const input = parseInput(interestSchema, raw);
  const { live } = await caseFor(db, session, input.id, "interest.manage");
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "case.interest.add",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await caseFor(ctx.tx, session, input.id, "interest.manage", true);
      version(row, input.expectedVersion);
      if (row.disposition !== "active") throw new AppError("transition_denied");
      const [listing] = await ctx.tx
        .select()
        .from(listings)
        .where(eq(listings.reference, input.reference.toUpperCase()))
        .for("share");
      if (!listing) throw new AppError("not_found");
      await assertCanRead(ctx.tx, live.actor, "listing.read", {
        type: "listing",
        id: listing.id,
        propertyId: listing.propertyId,
      });
      const [published] = await loadPublishedListings(
        ctx.tx,
        { references: [listing.reference] },
        "bg",
      );
      if (!published) throw new AppError("listing_unavailable");
      const [existing] = await ctx.tx
        .select()
        .from(interests)
        .where(and(eq(interests.caseId, row.id), eq(interests.listingId, listing.id)));
      if (existing)
        return {
          id: row.id,
          reference: row.reference,
          interestId: existing.id,
          version: row.version,
          recordedAt: existing.createdAt.toISOString(),
        };
      const now = new Date();
      const availability = presentationOf(published, now).availability;
      if (!offeredStates.includes(availability)) throw new AppError("listing_unavailable");
      const purpose =
        row.kind === "buyer" ? "sale" : row.kind === "tenant" ? "long_term_rent" : null;
      if (purpose && published.purpose !== purpose)
        throw new AppError("validation_failed", {
          fieldErrors: { reference: ["case_kind_mismatch"] },
        });
      let matchContext:
        | {
            briefRevision: number;
            manifestId: string;
            match: "match" | "needs_confirmation" | "no_match";
            violated: readonly string[];
            unconfirmed: readonly string[];
            alternativeDecision?: "propose_despite_mismatch";
          }
        | undefined;
      if (purpose) {
        const [brief] = await ctx.tx
          .select({ revision: briefRevisions.revisionNumber, criteria: briefRevisions.criteria })
          .from(briefRevisions)
          .where(eq(briefRevisions.caseId, row.id))
          .orderBy(desc(briefRevisions.revisionNumber))
          .limit(1);
        const parsed = caseMatchCriteriaInput.safeParse(brief?.criteria);
        if (!brief || !parsed.success || parsed.data.purpose !== purpose)
          throw new AppError("validation_failed", {
            fieldErrors: { matchReview: ["criteria_required"] },
          });
        const review = input.matchReview;
        if (!review)
          throw new AppError("validation_failed", {
            fieldErrors: { matchReview: ["required_for_structured_brief"] },
          });
        if (
          review.briefRevision !== brief.revision ||
          review.manifestId !== published.manifestId ||
          review.availability !== availability
        )
          throw new AppError("version_conflict", {
            current: {
              briefRevision: brief.revision,
              manifestId: published.manifestId,
              availability,
            },
          });
        const assessment = assessPublishedCandidate(published, parsed.data, now);
        const same = (received: readonly string[], current: readonly string[]) => {
          if (received.length !== current.length) return false;
          const reviewed = [...received].sort();
          const assessed = [...current].sort();
          return reviewed.every((value, index) => value === assessed[index]);
        };
        if (
          !same(review.violated, assessment.violated) ||
          !same(review.unconfirmed, assessment.unconfirmed)
        )
          throw new AppError("version_conflict", {
            current: {
              briefRevision: brief.revision,
              manifestId: published.manifestId,
              availability,
              violated: assessment.violated,
              unconfirmed: assessment.unconfirmed,
            },
          });
        if (assessment.unconfirmed.length > 0)
          throw new AppError("validation_failed", {
            fieldErrors: { matchReview: ["unconfirmed_facts"] },
          });
        if (assessment.violated.length > 0 && !input.alternativeDecision)
          throw new AppError("validation_failed", {
            fieldErrors: { alternativeDecision: ["required_for_hard_mismatch"] },
          });
        if (assessment.violated.length === 0 && input.alternativeDecision)
          throw new AppError("validation_failed", {
            fieldErrors: { alternativeDecision: ["no_hard_mismatch"] },
          });
        if (assessment.violated.length > 0 && input.explanation.length < 20)
          throw new AppError("validation_failed", {
            fieldErrors: { explanation: ["alternative_reason_required"] },
          });
        matchContext = {
          briefRevision: brief.revision,
          manifestId: published.manifestId,
          match: assessment.result,
          violated: assessment.violated,
          unconfirmed: assessment.unconfirmed,
          ...(input.alternativeDecision ? { alternativeDecision: input.alternativeDecision } : {}),
        };
      } else if (input.matchReview || input.alternativeDecision) {
        throw new AppError("validation_failed", {
          fieldErrors: { matchReview: ["case_kind_mismatch"] },
        });
      }
      const [interest] = await ctx.tx
        .insert(interests)
        .values({
          caseId: row.id,
          listingId: listing.id,
          listingRevisionId: published.listingRevisionId,
          fitExplanation: [input.explanation],
        })
        .returning();
      if (!interest) throw new Error("Interest insert failed");
      await bumpCase(ctx.tx, row.id, row.version);
      await caseEvent(
        ctx,
        "case",
        row.id,
        "case.interest_added",
        "interest.manage",
        { interestId: interest.id, ...(matchContext ?? {}) },
        "participants",
      );
      return {
        id: row.id,
        reference: row.reference,
        interestId: interest.id,
        version: row.version + 1,
        recordedAt: interest.createdAt.toISOString(),
      };
    },
  );
}

export async function respondToInterest(
  db: Executor,
  session: Session,
  raw: z.input<typeof respondSchema>,
) {
  const input = parseInput(respondSchema, raw);
  const capability =
    session.account.kind === "staff" ? "interest.manage" : "portal.interest.respond";
  const authorize = async (tx: Executor, lock = false) => {
    const query = tx.select().from(interests).where(eq(interests.id, input.id));
    const [interest] = await (lock ? query.for("update") : query);
    if (!interest) throw new AppError("not_found");
    const current = await caseFor(tx, session, interest.caseId);
    await assertCan(tx, current.live.actor, capability, {
      type: "interest",
      id: interest.id,
      caseId: interest.caseId,
      audience: "case_participants",
    });
    return { ...current, interest };
  };
  const { live } = await authorize(db);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "case.interest.respond",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row, interest } = await authorize(ctx.tx, true);
      version(interest, input.expectedVersion);
      if (row.disposition !== "active") throw new AppError("transition_denied");
      allow(interestMachine.check(interest.state, input.state));
      allow(
        guardInterestTransition(interest.state, input.state, { reason: input.reason }, live.actor),
      );
      const [last] = await ctx.tx
        .select()
        .from(interestFeedback)
        .where(eq(interestFeedback.interestId, interest.id))
        .orderBy(desc(interestFeedback.revisionNumber))
        .limit(1);
      await ctx.tx.insert(interestFeedback).values({
        interestId: interest.id,
        revisionNumber: (last?.revisionNumber ?? 0) + 1,
        feedback: input.reason || input.state,
        listingRevisionId: interest.listingRevisionId,
        authorKind: live.actor.kind,
        authorId: live.actor.id,
      });
      await ctx.tx
        .update(interests)
        .set({
          state: input.state,
          reason: input.reason || null,
          version: sql`${interests.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(interests.id, interest.id));
      await caseEvent(
        ctx,
        "case",
        row.id,
        "case.interest_response",
        capability,
        { interestId: interest.id },
        "participants",
      );
      return {
        id: row.id,
        reference: row.reference,
        version: interest.version + 1,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}

/** In-app availability is recorded here; no provider or email delivery is inferred. */
export async function postCaseMessage(
  db: Executor,
  session: Session,
  raw: z.input<typeof messageSchema>,
) {
  const input = parseInput(messageSchema, raw);
  const staff = session.account.kind === "staff";
  const capability = staff
    ? input.audience === "internal"
      ? "message.draft"
      : "message.send_external"
    : "portal.message.write";
  const { live } = await caseFor(db, session, input.id, capability);
  if (!staff && input.audience !== "case_participants") throw new AppError("forbidden");
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "case.message.post",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row, resource } = await caseFor(ctx.tx, session, input.id, capability, true);
      version(row, input.expectedVersion);
      if (staff && input.audience === "internal")
        await assertCan(ctx.tx, live.actor, "case.read_internal", resource);
      if (staff && input.audience === "case_participants" && !input.reviewed)
        throw new AppError("validation_failed", {
          fieldErrors: { reviewed: ["Review the audience and exact message before posting."] },
        });
      const participants = await ctx.tx
        .select({ partyId: caseParticipants.partyId })
        .from(caseParticipants)
        .where(and(eq(caseParticipants.caseId, row.id), liveParticipation()))
        .for("share");
      const recipients = [...new Set(participants.map((p) => p.partyId))];
      if (input.audience === "case_participants" && !recipients.length)
        throw new AppError("transition_denied");
      const id = randomUUID();
      const digest = hashRequest({
        body: input.body,
        audience: input.audience,
        recipients,
        channel: "in_app",
        attachments: [],
      });
      let approvalId: string | undefined;
      if (staff && input.audience === "case_participants") {
        const [approval] = await ctx.tx
          .insert(approvals)
          .values({
            kind: "message_send",
            state: "approved",
            subjectType: "message",
            subjectId: id,
            subjectVersion: 1,
            subjectHash: digest,
            scope: { recipients, channel: "in_app", audience: input.audience },
            requestedByKind: "staff",
            requestedById: live.actor.id,
            decidedByKind: "staff",
            decidedById: live.actor.id,
            decidedWithCapability: "message.send_external",
            decidedAt: new Date(),
            decisionNote: "Human reviewed in-app audience and exact content",
          })
          .returning();
        approvalId = approval?.id;
        if (!approvalId) throw new Error("Message approval insert failed");
      }
      await ctx.tx.insert(messages).values({
        id,
        caseId: row.id,
        kind: input.audience === "internal" ? "internal_note" : "case_message",
        direction: staff ? "outbound" : "inbound",
        channel: "in_app",
        audience: input.audience,
        state: input.audience === "internal" ? "draft" : "delivered",
        authorKind: live.actor.kind,
        authorId: live.actor.id,
        body: input.body,
        recipients,
        payloadDigest: digest,
        approvalId,
        approvedDigest: approvalId ? digest : null,
        logicalSendId: input.audience === "case_participants" ? `in-app:${ctx.operationId}` : null,
      });
      await bumpCase(ctx.tx, row.id, row.version);
      await caseEvent(
        ctx,
        "case",
        row.id,
        input.audience === "internal" ? "case.note_recorded" : "case.message_posted",
        capability,
      );
      return {
        id: row.id,
        reference: row.reference,
        version: row.version + 1,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}
