import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { briefRevisions, listings } from "@/db/schema";
import { artifactProposalSchema } from "@/domain/generative";
import { commercialStates } from "@/domain/listing";
import { taskTypes } from "@/domain/task";
import type { Session } from "../auth/sessions";
import { assertCan, assertCanRead } from "../authz";
import { addInterest, reviseBrief } from "../cases/commands";
import { readCaseCandidate } from "../cases/matching";
import { caseFor } from "../cases/shared";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { type OperationSuccess, runOperation } from "../operations";
import { loadPublishedListings } from "../publication/presentation";
import { caseMatchCriteriaInput } from "../search/search";
import { createTask, taskParentSchema } from "../work/create-task";
import { liveStaff, parseInput, version } from "../work/shared";

export const workspaceCandidateReviewSchema = z
  .object({
    listingId: z.uuid(),
    manifestId: z.uuid(),
    availability: z.enum(commercialStates),
    violated: z.array(z.string().min(1).max(80)).max(32),
    unconfirmed: z.array(z.string().min(1).max(80)).max(32),
    explanation: z.string().trim().min(3).max(1500),
    decision: z.enum(["suggest", "propose_despite_mismatch", "manual_review"]),
  })
  .strict();
export const materializeWorkspaceProposalSchema = z
  .object({
    operationId: z.string().min(16).max(200),
    parent: taskParentSchema.nullable(),
    proposal: artifactProposalSchema,
    taskType: z.enum(taskTypes).optional(),
    buyerReview: z
      .object({
        criteria: caseMatchCriteriaInput.optional(),
        candidates: z.array(workspaceCandidateReviewSchema).max(6),
      })
      .strict()
      .optional(),
  })
  .strict();
export type MaterializeWorkspaceProposalInput = z.input<typeof materializeWorkspaceProposalSchema>;
export interface WorkspaceMaterializedResult extends Record<string, unknown> {
  type: "task" | "case";
  id: string;
  version: number;
  parentVersion?: number;
  briefRevision?: number;
  interestIds?: string[];
  manualReviewListingIds?: string[];
}

const sameKeys = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length &&
  [...left].sort().every((value, index) => value === [...right].sort()[index]);

/**
 * Server-only, PERSON-invoked commands. Never register this adapter as a model tool.
 * The buyer operation is atomic: an invalid selected review rolls back the Brief and every
 * Interest. Missing criteria/reviews persist a Brief plus an explicit manual handoff only.
 */
export async function materializeWorkspaceProposal(
  db: Executor,
  session: Session,
  raw: MaterializeWorkspaceProposalInput,
): Promise<OperationSuccess<WorkspaceMaterializedResult>> {
  const input = parseInput(materializeWorkspaceProposalSchema, raw);
  const live = await liveStaff(db, session);
  if (input.proposal.kind === "task") {
    if (input.buyerReview) throw new AppError("validation_failed");
    return createTask(db, live, {
      operationId: input.operationId,
      parent: input.parent,
      title: input.proposal.title,
      purpose: input.proposal.body,
      type: input.taskType ?? "general",
    });
  }
  const proposal = input.proposal;
  if (proposal.kind !== "buyer_handoff" || input.parent?.type !== "case" || input.taskType)
    throw new AppError("validation_failed");
  const parent = input.parent;
  const selected = [...new Set(proposal.listingIds)];
  const reviews = input.buyerReview?.candidates ?? [];
  if (
    selected.length !== proposal.listingIds.length ||
    new Set(reviews.map((review) => review.listingId)).size !== reviews.length ||
    reviews.some((review) => !selected.includes(review.listingId))
  )
    throw new AppError("validation_failed");
  const adding = reviews.filter((review) => review.decision !== "manual_review");
  if (adding.length && !input.buyerReview?.criteria)
    throw new AppError("validation_failed", {
      fieldErrors: { buyerReview: ["criteria_required"] },
    });

  const authorize = async (tx: Executor, lock = false) => {
    const current = await liveStaff(tx, session);
    const found = await caseFor(tx, current, parent.id, "case.transition", lock);
    if (!["buyer", "tenant"].includes(found.row.kind)) throw new AppError("not_found");
    if (adding.length) {
      await assertCan(tx, current.actor, "interest.manage", found.resource);
      await assertCan(tx, current.actor, "case.read_internal", found.resource);
    }
    const query = tx
      .select({ id: listings.id, reference: listings.reference, propertyId: listings.propertyId })
      .from(listings)
      .where(inArray(listings.id, selected));
    const rows = selected.length ? await (lock ? query.for("share") : query) : [];
    if (rows.length !== selected.length) throw new AppError("not_found");
    for (const row of rows)
      await assertCanRead(tx, current.actor, "listing.read", {
        type: "listing",
        id: row.id,
        propertyId: row.propertyId,
      });
    const published = await loadPublishedListings(tx, { ids: selected }, "bg");
    if (published.length !== selected.length) throw new AppError("listing_unavailable");
    return { ...found, listingRows: rows };
  };
  // A receipt never replaces current person, Case, Listing or Interest authorization.
  await authorize(db);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "workspace.buyer_handoff.materialize",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: parent.expectedVersion,
      subject: { type: "case", id: parent.id },
    },
    async (ctx) => {
      const current = await authorize(ctx.tx, true);
      version(current.row, parent.expectedVersion);
      const revised = await reviseBrief(ctx.tx, session, {
        id: parent.id,
        operationId: `workspace:brief:${hashRequest(input.operationId)}`,
        expectedVersion: current.row.version,
        requirements: proposal.requirements,
        preferences: proposal.preferences,
        ...(input.buyerReview?.criteria ? { criteria: input.buyerReview.criteria } : {}),
      });
      const [brief] = await ctx.tx
        .select({ revision: briefRevisions.revisionNumber })
        .from(briefRevisions)
        .where(eq(briefRevisions.caseId, parent.id))
        .orderBy(desc(briefRevisions.revisionNumber))
        .limit(1);
      if (!brief) throw new Error("Revised Brief missing");
      let caseVersion = revised.outcome.version;
      const interestIds: string[] = [];
      for (const review of adding) {
        const row = current.listingRows.find((listing) => listing.id === review.listingId);
        if (!row) throw new AppError("not_found");
        const candidate = await readCaseCandidate(ctx.tx, session, {
          id: parent.id,
          briefRevision: brief.revision,
          reference: row.reference,
        });
        if (
          candidate.candidate.manifestId !== review.manifestId ||
          candidate.candidate.availability.presented !== review.availability ||
          !sameKeys(candidate.violated, review.violated) ||
          !sameKeys(candidate.unconfirmed, review.unconfirmed)
        )
          throw new AppError("version_conflict", {
            current: {
              listingId: review.listingId,
              manifestId: candidate.candidate.manifestId,
              availability: candidate.candidate.availability.presented,
              violated: candidate.violated,
              unconfirmed: candidate.unconfirmed,
            },
          });
        const added = await addInterest(ctx.tx, session, {
          id: parent.id,
          expectedVersion: caseVersion,
          operationId: `workspace:interest:${hashRequest([input.operationId, review.listingId])}`,
          reference: row.reference,
          explanation: review.explanation,
          ...(review.decision === "propose_despite_mismatch"
            ? { alternativeDecision: review.decision }
            : {}),
          matchReview: {
            briefRevision: brief.revision,
            manifestId: review.manifestId,
            availability: review.availability,
            violated: review.violated,
            unconfirmed: review.unconfirmed,
            reviewed: true,
          },
        });
        caseVersion = added.outcome.version;
        interestIds.push(added.outcome.interestId);
      }
      return {
        type: "case" as const,
        id: parent.id,
        version: caseVersion,
        briefRevision: brief.revision,
        interestIds,
        manualReviewListingIds: selected.filter(
          (id) => !adding.some((review) => review.listingId === id),
        ),
      };
    },
  );
}
