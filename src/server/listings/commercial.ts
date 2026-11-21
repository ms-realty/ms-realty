// A Listing's commercial outcome: sold or let (ADR 0015). Reuses the domain's commercial state
// machine and evidence guard. A sold or let listing stops being offered: public search and
// place counts only show offered states, and a published page reads "sold" or "let" with similar
// homes instead of a viewing request (derivePublicPresentation). Publication itself is not
// withdrawn here; that stays a separate, explicit publication command.
import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { listings } from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import {
  type CommercialState,
  commercialMachine,
  guardCommercialTransition,
} from "@/domain/listing";
import { recordActivity } from "../activity";
import { recordAudit } from "../audit";
import type { Session } from "../auth/sessions";
import { assertCan } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { documentAccess } from "../files/access";
import { recordOutboxEvent } from "../jobs/outbox";
import { runOperation } from "../operations";
import { allow, commandEnvelope, liveStaff, parseInput, version } from "../work/shared";

export type ListingOutcome = "sold" | "let";

export type ListingOutcomeResult =
  | { readonly status: "changed"; readonly from: CommercialState; readonly reference: string }
  | { readonly status: "already"; readonly reference: string }
  /** The listing's state does not allow it (for example withdrawn); nothing changed. */
  | { readonly status: "not_allowed"; readonly from: CommercialState; readonly reference: string };

/**
 * Sets the listing to sold or let inside the caller's transaction. The caller holds the
 * authority for the decision (a completed Deal, or the standalone command below). The entry
 * names no party: other Deals interested in the same home see only that it is sold or let.
 */
export async function recordListingOutcome(
  tx: Executor,
  actor: Actor,
  input: {
    readonly listingId: string;
    readonly outcome: ListingOutcome;
    readonly reason: string;
    readonly evidenceIds: readonly string[];
    readonly operationId: string;
  },
): Promise<ListingOutcomeResult> {
  const [listing] = await tx
    .select()
    .from(listings)
    .where(eq(listings.id, input.listingId))
    .for("update");
  if (!listing) throw new AppError("not_found");
  if (listing.commercialState === input.outcome)
    return { status: "already", reference: listing.reference };
  if (commercialMachine.check(listing.commercialState, input.outcome).outcome !== "allowed")
    return { status: "not_allowed", from: listing.commercialState, reference: listing.reference };
  allow(
    guardCommercialTransition(
      listing.commercialState,
      input.outcome,
      { purpose: listing.purpose, reason: input.reason, evidenceIds: input.evidenceIds },
      actor,
    ),
  );
  const now = new Date();
  await tx
    .update(listings)
    .set({
      commercialState: input.outcome,
      availabilityBasis: input.reason,
      version: listing.version + 1,
      updatedAt: now,
    })
    .where(eq(listings.id, listing.id));
  const action = `listing.commercial.${input.outcome}`;
  await recordActivity(tx, {
    recordType: "listing",
    recordId: listing.id,
    reference: listing.reference,
    messageKey: `activity.${action}`,
    params: { from: listing.commercialState, to: input.outcome },
    summary: `${listing.reference} ${input.outcome}: ${input.reason}`,
    actor,
    operationId: input.operationId,
    at: now,
  });
  await recordAudit(tx, {
    action,
    actor,
    capability: "listing.edit",
    recordType: "listing",
    recordId: listing.id,
    operationId: input.operationId,
    payload: {
      fromState: listing.commercialState,
      toState: input.outcome,
      reason: input.reason,
      evidenceIds: input.evidenceIds,
    },
    at: now,
  });
  await recordOutboxEvent(tx, {
    eventType: "listing.commercial_changed",
    subjectType: "listing",
    subjectId: listing.id,
    payload: { from: listing.commercialState, to: input.outcome },
    operationId: input.operationId,
  });
  return { status: "changed", from: listing.commercialState, reference: listing.reference };
}

const outcomeSchema = z.object({
  ...commandEnvelope,
  outcome: z.enum(["sold", "let"]),
  reason: z.string().trim().min(3).max(1500),
  /** A document the actor may open that shows the outcome, e.g. the deed or lease. */
  evidenceVersionId: z.uuid(),
});

/**
 * Staff mark a listing sold or let outside a Deal path (for example a sale the agency did not
 * broker). `id` is the listing id and `expectedVersion` its version.
 */
export async function markListingOutcome(
  db: Executor,
  session: Session,
  raw: z.input<typeof outcomeSchema>,
) {
  const input = parseInput(outcomeSchema, raw);
  const authorize = async (tx: Executor) => {
    const live = await liveStaff(tx, session);
    if (live.account.kind !== "staff") throw new AppError("forbidden");
    const [listing] = await tx.select().from(listings).where(eq(listings.id, input.id));
    if (!listing) throw new AppError("not_found");
    await assertCan(tx, live.actor, "listing.edit", {
      type: "listing",
      id: listing.id,
      propertyId: listing.propertyId,
    });
    await documentAccess(tx, session, input.evidenceVersionId);
    return { live, listing };
  };
  const { live } = await authorize(db);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "listing.commercial.outcome",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { listing } = await authorize(ctx.tx);
      version(listing, input.expectedVersion);
      const outcome = await recordListingOutcome(ctx.tx, live.actor, {
        listingId: listing.id,
        outcome: input.outcome,
        reason: input.reason,
        evidenceIds: [input.evidenceVersionId],
        operationId: ctx.operationId,
      });
      if (outcome.status === "not_allowed") throw new AppError("transition_denied");
      return {
        id: listing.id,
        reference: listing.reference,
        version: listing.version + (outcome.status === "changed" ? 1 : 0),
        recordedAt: new Date().toISOString(),
      };
    },
  );
}
