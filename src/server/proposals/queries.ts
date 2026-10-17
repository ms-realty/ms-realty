import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  cases,
  listingRevisions,
  listings,
  principals,
  proposalResponses,
  proposalRevisions,
  proposals,
} from "@/db/schema";
import type { Session } from "../auth/sessions";
import { can, resolveGrants } from "../authz";
import { caseFor, caseVisibility, liveUser } from "../cases/shared";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { offerContext, proposalFor, termsDigest, visibleProposalStates } from "./shared";
import { partySnapshotsSchema } from "./terms";

export async function listProposals(db: Executor, session: Session, caseId?: string) {
  const live = await liveUser(db, session);
  if (caseId && !z.uuid().safeParse(caseId).success) throw new AppError("not_found");
  const [principal] = await db
    .select({ partyId: principals.partyId })
    .from(principals)
    .where(eq(principals.id, live.account.id));
  if (!principal) throw new AppError("not_found");
  const visibleCases = db
    .select({ id: cases.id })
    .from(cases)
    .where(await caseVisibility(db, live));
  const grants = await resolveGrants(db, live.actor);
  const scoped =
    live.account.kind === "staff"
      ? (or(
          ...grants
            .filter((g) => g.capability === "proposal.manage")
            .flatMap(({ scope }) => {
              if (scope?.locales) return [];
              if (!scope?.recordType) return [sql`true`];
              if (scope.recordType === "proposal")
                return [scope.recordId ? eq(proposals.id, scope.recordId) : sql`true`];
              if (scope.recordType === "case")
                return [scope.recordId ? eq(proposals.caseId, scope.recordId) : sql`true`];
              return [];
            }),
        ) ?? sql`false`)
      : sql`exists (select 1 from ${proposalRevisions} visible_revision where visible_revision.proposal_id = ${proposals.id} and visible_revision.submitted_at is not null and visible_revision.parties @> ${JSON.stringify([{ partyId: principal.partyId }])}::jsonb)`;
  return db
    .select({ id: proposals.id, reference: proposals.reference, caseId: proposals.caseId })
    .from(proposals)
    .where(
      and(
        inArray(proposals.caseId, visibleCases),
        scoped,
        caseId ? eq(proposals.caseId, caseId) : undefined,
      ),
    )
    .orderBy(desc(proposals.updatedAt), desc(proposals.id))
    .limit(50);
}

export async function readProposal(db: Executor, session: Session, id: string) {
  const bound = await proposalFor(db, session, id);
  const staff = bound.live.account.kind === "staff";
  const rows = await db
    .select()
    .from(proposalRevisions)
    .where(
      and(
        eq(proposalRevisions.proposalId, id),
        staff
          ? undefined
          : and(
              isNotNull(proposalRevisions.submittedAt),
              inArray(proposalRevisions.state, [...visibleProposalStates]),
              sql`${proposalRevisions.parties} @> ${JSON.stringify([{ partyId: bound.principalPartyId }])}::jsonb`,
            ),
      ),
    )
    .orderBy(desc(proposalRevisions.revisionNumber))
    .limit(10);
  if (!rows.length) throw new AppError("not_found");
  const current = rows[0];
  if (!current) throw new AppError("not_found");
  const [source] = await db
    .select({
      reference: listings.reference,
      number: listingRevisions.revisionNumber,
      currentId: listings.approvedRevisionId,
    })
    .from(listings)
    .innerJoin(
      listingRevisions,
      eq(
        listingRevisions.id,
        current.sourceListingRevisionId ?? "00000000-0000-0000-0000-000000000000",
      ),
    )
    .where(eq(listings.id, bound.proposal.listingId));
  const parties = partySnapshotsSchema.safeParse(current.parties);
  if (!parties.success) throw new AppError("not_found");
  const responses = await db
    .select({
      partyId: proposalResponses.partyId,
      decision: proposalResponses.decision,
      reason: proposalResponses.reason,
      at: proposalResponses.createdAt,
    })
    .from(proposalResponses)
    .where(eq(proposalResponses.revisionId, current.id))
    .orderBy(asc(proposalResponses.createdAt));
  const active = current.revisionNumber === bound.proposal.activeRevisionNumber;
  const expired = current.deadlineAt <= new Date();
  const intact = termsDigest(current) === current.termsHash;
  const currentParties = parties.data;
  const project = (row: typeof current) => ({
    id: row.id,
    number: row.revisionNumber,
    state: row.state,
    amountMinor: row.amountMinor,
    currency: row.currency,
    period: row.period,
    paymentBasis: row.paymentBasis,
    conditions: z.array(z.string()).parse(row.conditions),
    inclusions: z.array(z.string()).parse(row.inclusions),
    parties: partySnapshotsSchema.parse(row.parties),
    deadlineAt: row.deadlineAt,
    timezone: row.deadlineTimezone,
    sourceListingRevisionId: row.sourceListingRevisionId,
    responseNote: row.responseNote,
    submittedAt: row.submittedAt,
  });
  return {
    proposal: {
      id: bound.proposal.id,
      reference: bound.proposal.reference,
      version: bound.proposal.version,
      caseId: bound.proposal.caseId,
      interestId: bound.proposal.interestId,
    },
    revision: project(current),
    history: rows.slice(1).map(project),
    responses,
    current: active,
    source: source
      ? {
          reference: source.reference,
          revision: source.number,
          changed: source.currentId !== current.sourceListingRevisionId,
        }
      : null,
    expired,
    intact,
    canManage: staff,
    canRespond:
      !staff &&
      active &&
      !expired &&
      intact &&
      current.state === "awaiting_response" &&
      !responses.some((r) => r.partyId === bound.principalPartyId) &&
      currentParties.some((p) => p.partyId === bound.principalPartyId) &&
      (await can(db, bound.live.actor, "portal.proposal.respond", bound.resource)),
  };
}

export async function proposalContext(
  db: Executor,
  session: Session,
  caseId: string,
  interestId: string,
) {
  const { live } = await caseFor(db, session, caseId, "proposal.manage");
  if (live.account.kind !== "staff") throw new AppError("not_found");
  const context = await offerContext(db, caseId, interestId);
  return {
    listingReference: context.listing.reference,
    purpose: context.listing.purpose,
    buyers: context.buyers,
    seller: context.seller,
  };
}
