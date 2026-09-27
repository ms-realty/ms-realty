import "server-only";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  briefRevisions,
  caseParticipants,
  cases,
  interests,
  listings,
  messages,
  parties,
  principals,
  sellerInstructions,
} from "@/db/schema";
import type { Session } from "../auth/sessions";
import { can } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { caseFor, caseVisibility, liveParticipation } from "./shared";

export async function listCases(db: Executor, session: Session) {
  const visibility = await caseVisibility(db, session);
  return db
    .select({
      id: cases.id,
      reference: cases.reference,
      title: cases.title,
      kind: cases.kind,
      stage: cases.stage,
      disposition: cases.disposition,
      ownerName: principals.displayName,
    })
    .from(cases)
    .leftJoin(principals, eq(principals.id, cases.ownerId))
    .where(visibility)
    .orderBy(desc(cases.updatedAt), asc(cases.id))
    .limit(50);
}

export async function readCase(db: Executor, session: Session, id: string) {
  const { row, live, resource } = await caseFor(db, session, id);
  const staff = live.account.kind === "staff";
  const internal = staff && (await can(db, live.actor, "case.read_internal", resource));
  const active = row.disposition === "active";
  const canTransition = staff && (await can(db, live.actor, "case.transition", resource));
  const [owner] = row.ownerId
    ? await db
        .select({ name: principals.displayName })
        .from(principals)
        .where(eq(principals.id, row.ownerId))
    : [];
  const brief = await db
    .select({
      id: briefRevisions.id,
      revision: briefRevisions.revisionNumber,
      items: briefRevisions.items,
      createdAt: briefRevisions.createdAt,
      clientAcknowledgedAt: briefRevisions.clientAcknowledgedAt,
      brokerAcknowledgedAt: briefRevisions.brokerAcknowledgedAt,
    })
    .from(briefRevisions)
    .where(eq(briefRevisions.caseId, id))
    .orderBy(desc(briefRevisions.revisionNumber))
    .limit(10);
  const interestRows = await db
    .select({
      id: interests.id,
      version: interests.version,
      state: interests.state,
      reference: listings.reference,
      listingRevisionId: interests.listingRevisionId,
      currentRevisionId: listings.approvedRevisionId,
      commercialState: listings.commercialState,
      explanation: interests.fitExplanation,
      reason: interests.reason,
    })
    .from(interests)
    .innerJoin(listings, eq(listings.id, interests.listingId))
    .where(eq(interests.caseId, id))
    .orderBy(desc(interests.createdAt))
    .limit(50);
  const permittedInterests = await Promise.all(
    interestRows.map(async (interest) => ({
      ...interest,
      canRespond:
        active &&
        (await can(db, live.actor, staff ? "interest.manage" : "portal.interest.respond", {
          type: "interest",
          id: interest.id,
          caseId: id,
          audience: "case_participants",
        })),
    })),
  );
  const participants = staff
    ? await db
        .select({
          id: caseParticipants.id,
          name: parties.displayName,
          partyId: parties.id,
          role: caseParticipants.role,
          authority: caseParticipants.authority,
        })
        .from(caseParticipants)
        .innerJoin(parties, eq(parties.id, caseParticipants.partyId))
        .where(and(eq(caseParticipants.caseId, id), liveParticipation()))
        .orderBy(asc(parties.displayName))
        .limit(50)
    : [];
  const ownerListings =
    !staff && ["seller", "landlord"].includes(row.kind)
      ? await db
          .select({
            reference: listings.reference,
            id: listings.id,
            propertyId: listings.propertyId,
          })
          .from(sellerInstructions)
          .innerJoin(listings, eq(listings.id, sellerInstructions.listingId))
          .where(eq(sellerInstructions.caseId, id))
          .orderBy(desc(sellerInstructions.revisionNumber))
          .limit(10)
      : [];
  const ownerPreviews = [];
  for (const listing of ownerListings)
    if (
      await can(db, live.actor, "portal.listing.acknowledge", {
        type: "listing",
        id: listing.id,
        propertyId: listing.propertyId,
        audience: "case_participants",
      })
    )
      ownerPreviews.push(listing.reference);
  return {
    ownerPreviews: [...new Set(ownerPreviews)],
    record: {
      id: row.id,
      reference: row.reference,
      version: row.version,
      kind: row.kind,
      title: row.title,
      stage: row.stage,
      disposition: row.disposition,
      ownerName: owner?.name ?? null,
      nextAction: active ? (internal ? row.nextAction : row.clientSummary) : null,
      dueAt: active && (internal || row.clientSummary) ? row.nextActionDueAt : null,
      clientSummary: active ? row.clientSummary : null,
      ...(internal
        ? {
            dispositionReason: active ? null : row.dispositionReason,
            closureOutcome: row.disposition === "closed" ? row.closureOutcome : null,
            waitingOn: row.disposition === "closed" ? null : row.waitingOn,
            reviewAt: row.disposition === "closed" ? null : row.reviewAt,
          }
        : {}),
    },
    brief,
    interests: permittedInterests,
    participants,
    canManage: active && canTransition,
    canManageContinuity: internal && canTransition,
    canAcknowledge:
      active && !staff && (await can(db, live.actor, "portal.brief.acknowledge", resource)),
    canRequestProposal:
      active && !staff && (await can(db, live.actor, "portal.proposal.respond", resource)),
    canPropose: active && staff && (await can(db, live.actor, "proposal.manage", resource)),
    canReviewProcess: staff && (await can(db, live.actor, "compliance.review", resource)),
    canManageNext: active && internal && canTransition,
    canAddInterest: active && staff && (await can(db, live.actor, "interest.manage", resource)),
    canPost: await can(
      db,
      live.actor,
      staff ? "message.send_external" : "portal.message.write",
      resource,
    ),
    canNote: internal && (await can(db, live.actor, "message.draft", resource)),
    canRequest:
      active &&
      (await can(
        db,
        live.actor,
        staff ? "appointment.manage" : "portal.appointment.request",
        resource,
      )),
  };
}

export async function readCaseMessages(db: Executor, session: Session, id: string) {
  const { live, resource } = await caseFor(db, session, id);
  const internal =
    live.account.kind === "staff" && (await can(db, live.actor, "case.read_internal", resource));
  const [principal] = await db
    .select({ partyId: principals.partyId })
    .from(principals)
    .where(eq(principals.id, live.account.id));
  if (!principal) throw new AppError("not_found");
  const shared = and(
    eq(messages.audience, "case_participants"),
    eq(messages.channel, "in_app"),
    eq(messages.state, "delivered"),
    live.account.kind === "client"
      ? sql`${messages.recipients} @> ${JSON.stringify([principal.partyId])}::jsonb`
      : undefined,
  );
  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      audience: messages.audience,
      at: messages.createdAt,
      authorName: principals.displayName,
    })
    .from(messages)
    .leftJoin(principals, sql`${principals.id}::text = ${messages.authorId}`)
    .where(
      and(
        eq(messages.caseId, id),
        internal ? or(eq(messages.audience, "internal"), shared) : shared,
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(100);
  return rows.reverse();
}

export async function readInterestContext(db: Executor, session: Session, interestId: string) {
  if (!z.uuid().safeParse(interestId).success) throw new AppError("not_found");
  const [interest] = await db.select().from(interests).where(eq(interests.id, interestId));
  if (!interest) throw new AppError("not_found");
  const { live } = await caseFor(db, session, interest.caseId);
  const allowed = await can(
    db,
    live.actor,
    live.account.kind === "staff" ? "interest.manage" : "portal.interest.respond",
    { type: "interest", id: interest.id, caseId: interest.caseId, audience: "case_participants" },
  );
  if (!allowed) throw new AppError("not_found");
  return interest;
}
