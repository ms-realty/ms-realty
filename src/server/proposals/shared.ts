import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  approvals,
  caseParticipants,
  interests,
  listings,
  parties,
  principals,
  propertyRelationships,
  proposalRevisions,
  proposals,
  sellerInstructions,
} from "@/db/schema";
import { requireFreshAuth, type Session } from "../auth/sessions";
import { assertCan, assertCanRead } from "../authz";
import { caseFor, liveParticipation } from "../cases/shared";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { loadPublishedListings } from "../publication/presentation";
import { currentSellerEvidence } from "../publication/seller-evidence";
import { type ProposalParty, partySnapshotsSchema } from "./terms";

export type Revision = typeof proposalRevisions.$inferSelect;
export const visibleProposalStates = [
  "submitted",
  "awaiting_response",
  "countered",
  "declined",
  "withdrawn",
  "expired",
  "agreed_for_next_step",
] as const;
export function termsContent(
  row: Pick<
    Revision,
    | "amountMinor"
    | "currency"
    | "period"
    | "paymentBasis"
    | "conditions"
    | "inclusions"
    | "parties"
    | "deadlineAt"
    | "deadlineTimezone"
    | "sourceListingRevisionId"
  >,
) {
  // Includes payment basis, inclusions, party identities/names/roles and the source revision,
  // in addition to the domain's minimum material field set. No changed wording escapes review.
  return {
    amountMinor: row.amountMinor,
    currency: row.currency,
    period: row.period,
    paymentBasis: row.paymentBasis,
    conditions: row.conditions,
    inclusions: row.inclusions,
    parties: row.parties,
    deadlineAt: row.deadlineAt.toISOString(),
    deadlineTimezone: row.deadlineTimezone,
    sourceListingRevisionId: row.sourceListingRevisionId,
  };
}
export const termsDigest = (row: Parameters<typeof termsContent>[0]) =>
  hashRequest(termsContent(row));

export async function proposalFor(
  db: Executor,
  session: Session,
  id: string,
  write = false,
  lock = false,
  clientRevisionId?: string,
) {
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  const query = db.select().from(proposals).where(eq(proposals.id, id));
  const [proposal] = await (lock ? query.for("update") : query);
  if (!proposal) throw new AppError("not_found");
  const bound = await caseFor(db, session, proposal.caseId);
  const resource = {
    type: "proposal",
    id,
    caseId: proposal.caseId,
    audience: "case_participants" as const,
  };
  if (bound.live.account.kind === "staff")
    await assertCanRead(db, bound.live.actor, "proposal.manage", resource);
  else if (write) await assertCan(db, bound.live.actor, "portal.proposal.respond", resource);
  if (write) {
    requireFreshAuth(bound.live);
    if (bound.row.disposition !== "active") throw new AppError("transition_denied");
  }
  const [revision] = await db
    .select()
    .from(proposalRevisions)
    .where(
      and(
        eq(proposalRevisions.proposalId, id),
        eq(proposalRevisions.revisionNumber, proposal.activeRevisionNumber),
      ),
    );
  if (!revision) throw new AppError("not_found");
  const [principal] = await db
    .select({ partyId: principals.partyId })
    .from(principals)
    .where(eq(principals.id, bound.live.account.id));
  if (!principal) throw new AppError("not_found");
  if (bound.live.account.kind === "client" && write) {
    const [authorizedRevision] = clientRevisionId
      ? await db
          .select()
          .from(proposalRevisions)
          .where(
            and(eq(proposalRevisions.proposalId, id), eq(proposalRevisions.id, clientRevisionId)),
          )
      : [revision];
    const snapshot = partySnapshotsSchema.safeParse(authorizedRevision?.parties);
    if (
      !authorizedRevision?.submittedAt ||
      !snapshot.success ||
      !snapshot.data.some((p) => p.partyId === principal.partyId) ||
      !visibleProposalStates.includes(
        authorizedRevision.state as (typeof visibleProposalStates)[number],
      )
    )
      throw new AppError("not_found");
  }
  return { ...bound, proposal, revision, resource, principalPartyId: principal.partyId };
}

export async function offerContext(
  db: Executor,
  caseId: string,
  interestId: string,
  clientPartyId?: string,
) {
  const [interest] = await db
    .select()
    .from(interests)
    .where(and(eq(interests.id, interestId), eq(interests.caseId, caseId)))
    .for("share");
  if (
    !interest ||
    !["shortlisted", "viewing_requested", "viewed", "proposal"].includes(interest.state)
  )
    throw new AppError("transition_denied");
  const [listing] = await db
    .select()
    .from(listings)
    .where(eq(listings.id, interest.listingId))
    .for("share");
  if (!listing) throw new AppError("not_found");
  const [published] = await loadPublishedListings(db, { ids: [listing.id] }, "bg");
  if (!published || !["available", "negotiating"].includes(listing.commercialState))
    throw new AppError("listing_unavailable");
  const [instruction] = await db
    .select({ terms: sellerInstructions.commercialTerms })
    .from(sellerInstructions)
    .where(and(eq(sellerInstructions.listingId, listing.id), currentSellerEvidence()));
  const seller = z
    .object({ sellerPartyId: z.uuid(), authorityRelationshipId: z.uuid() })
    .safeParse(instruction?.terms);
  if (!seller.success) throw new AppError("transition_denied");
  const [authority] = await db
    .select({ role: propertyRelationships.role })
    .from(propertyRelationships)
    .where(eq(propertyRelationships.id, seller.data.authorityRelationshipId));
  // A reviewed representative is not silently renamed as the legal seller/landlord.
  // Such an offer needs a separately recorded represented principal before this path can use it.
  if (authority?.role !== (listing.purpose === "sale" ? "seller" : "landlord"))
    throw new AppError("transition_denied");
  const [owner] = await db
    .select({ id: parties.id, name: parties.displayName })
    .from(parties)
    .where(and(eq(parties.id, seller.data.sellerPartyId), isNull(parties.mergedIntoPartyId)));
  if (!owner) throw new AppError("transition_denied");
  const buyers = await db
    .select({ partyId: parties.id, name: parties.displayName, role: caseParticipants.role })
    .from(caseParticipants)
    .innerJoin(parties, eq(parties.id, caseParticipants.partyId))
    .where(
      and(
        eq(caseParticipants.caseId, caseId),
        liveParticipation(),
        isNull(parties.mergedIntoPartyId),
        inArray(
          caseParticipants.role,
          listing.purpose === "sale" ? ["buyer", "co_buyer"] : ["tenant"],
        ),
      ),
    )
    .for("share");
  const buyer = buyers.find((p) => p.partyId === clientPartyId);
  if (clientPartyId && (!buyer || buyer.partyId === owner.id))
    throw new AppError("validation_failed", {
      fieldErrors: { clientPartyId: ["current_principal_party_required"] },
    });
  const snapshot: ProposalParty[] = buyer
    ? [
        {
          partyId: buyer.partyId,
          name: buyer.name,
          role: buyer.role as "buyer" | "co_buyer" | "tenant",
          required: true,
        },
        {
          partyId: owner.id,
          name: owner.name,
          role: listing.purpose === "sale" ? "seller" : "landlord",
          required: true,
        },
      ]
    : [];
  return { interest, listing, published, buyers, seller: owner, snapshot };
}

export async function validProposalApproval(db: Executor, revision: Revision) {
  if (!revision.approvalId || termsDigest(revision) !== revision.termsHash)
    throw new AppError("approval_stale");
  const [approval] = await db.select().from(approvals).where(eq(approvals.id, revision.approvalId));
  if (
    approval?.kind !== "proposal_terms" ||
    approval.state !== "approved" ||
    approval.invalidatedAt ||
    approval.subjectType !== "proposal_revision" ||
    approval.subjectId !== revision.id ||
    approval.subjectVersion !== revision.revisionNumber ||
    approval.subjectHash !== revision.termsHash ||
    !approval.decidedAt ||
    approval.decidedByKind !== "staff" ||
    !approval.decidedById ||
    (approval.expiresAt && approval.expiresAt <= new Date())
  )
    throw new AppError("approval_stale");
  return approval;
}

export async function validProposalSource(
  db: Executor,
  proposal: typeof proposals.$inferSelect,
  revision: Revision,
) {
  if (!proposal.interestId) throw new AppError("transition_denied");
  const snapshot = partySnapshotsSchema.safeParse(revision.parties);
  if (!snapshot.success) throw new AppError("approval_stale");
  const buyer = snapshot.data.find((p) => ["buyer", "co_buyer", "tenant"].includes(p.role));
  if (!buyer) throw new AppError("approval_stale");
  const context = await offerContext(db, proposal.caseId, proposal.interestId, buyer.partyId);
  if (
    context.listing.id !== proposal.listingId ||
    context.published.listingRevisionId !== revision.sourceListingRevisionId ||
    hashRequest(context.snapshot) !== hashRequest(revision.parties)
  )
    throw new AppError("approval_stale");
  return context;
}
