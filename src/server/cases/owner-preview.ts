import "server-only";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  approvals,
  caseParticipants,
  cases,
  listingRevisionMedia,
  listingRevisions,
  listings,
  mediaAssets,
  principals,
  properties,
  propertyFacts,
  sellerInstructions,
} from "@/db/schema";
import { recordAudit } from "../audit";
import { requireFreshAuth, type Session } from "../auth/sessions";
import { assertCan, can } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import type { FileDownload } from "../files/download";
import { digestOf, type FileStorage } from "../files/storage";
import { verifyPublicationMedia } from "../media/verify";
import { runOperation } from "../operations";
import { currentEligibility } from "../publication/commands";
import { loadPlaceChains, publicPlace, termsFacts } from "../publication/presentation";
import { currentSellerEvidence } from "../publication/seller-evidence";
import { commandEnvelope, liveStaff, parseInput, version } from "../work/shared";
import { bumpCase, caseEvent, caseFor, liveParticipation } from "./shared";

const denied = () => new AppError("not_found");
async function reviewedSource(
  db: Executor,
  caseId: string,
  instructionId?: string,
  allowUnbound = false,
) {
  const [record] = await db.select().from(cases).where(eq(cases.id, caseId));
  if (!record || !["seller", "landlord"].includes(record.kind)) throw denied();
  let [instruction] = await db
    .select()
    .from(sellerInstructions)
    .where(
      and(
        instructionId
          ? eq(sellerInstructions.id, instructionId)
          : eq(sellerInstructions.caseId, caseId),
        currentSellerEvidence(),
      ),
    )
    .orderBy(desc(sellerInstructions.revisionNumber))
    .limit(1);
  if (
    !instruction?.listingId ||
    (instruction.caseId && instruction.caseId !== caseId) ||
    (!allowUnbound && instruction.caseId !== caseId) ||
    (record.propertyId && record.propertyId !== instruction.propertyId)
  )
    throw denied();
  const [listing] = await db
    .select()
    .from(listings)
    .where(eq(listings.id, instruction.listingId))
    .for("share");
  if (
    !listing ||
    listing.propertyId !== instruction.propertyId ||
    (record.kind === "seller" ? listing.purpose !== "sale" : listing.purpose !== "long_term_rent")
  )
    throw denied();
  [instruction] = await db
    .select()
    .from(sellerInstructions)
    .where(and(eq(sellerInstructions.id, instruction.id), currentSellerEvidence()))
    .for(allowUnbound ? "update" : "share");
  if (
    !instruction ||
    (instruction.caseId && instruction.caseId !== caseId) ||
    (!allowUnbound && instruction.caseId !== caseId)
  )
    throw denied();
  const eligibility = await currentEligibility(
    db,
    listing,
    "bg",
    listing.publicationGeneration,
    new Date(),
  );
  const eligible = eligibility.input;
  if (
    !eligibility.content ||
    eligible.commercial === "withdrawn" ||
    !eligible.factReviewValid ||
    !eligible.revisionApprovalValid ||
    !eligible.sellerInstructionValid ||
    !eligible.localeApprovedForSource ||
    !eligible.mediaEligible ||
    ![true, "not_applicable"].includes(eligible.regulatedClaimsReviewed) ||
    eligibility.content.decisions.sellerInstruction !== instruction.id
  )
    throw new AppError("approval_stale");
  const [revision] = await db
    .select()
    .from(listingRevisions)
    .where(eq(listingRevisions.id, eligibility.content.listingRevisionId));
  if (!revision || revision.revisionNumber !== listing.latestRevisionNumber)
    throw new AppError("approval_stale");
  const party = z
    .object({ sellerPartyId: z.uuid(), authorityRelationshipId: z.uuid() })
    .safeParse(instruction.commercialTerms);
  if (!party.success) throw denied();
  const [participant] = await db
    .select()
    .from(caseParticipants)
    .where(
      and(
        eq(caseParticipants.caseId, caseId),
        eq(caseParticipants.partyId, party.data.sellerPartyId),
        eq(caseParticipants.role, record.kind === "seller" ? "seller" : "landlord"),
        liveParticipation(),
      ),
    );
  if (!participant) throw denied();
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, listing.propertyId));
  if (!property) throw denied();
  const facts = await db
    .select()
    .from(propertyFacts)
    .where(eq(propertyFacts.factRevisionId, revision.factRevisionId))
    .orderBy(asc(propertyFacts.fieldKey));
  const media = await db
    .select({ placement: listingRevisionMedia, asset: mediaAssets })
    .from(listingRevisionMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, listingRevisionMedia.mediaAssetId))
    .where(eq(listingRevisionMedia.listingRevisionId, revision.id))
    .orderBy(asc(listingRevisionMedia.position));
  const { generation: _generation, ...manifest } = eligibility.content;
  const placeChains = await loadPlaceChains(
    db,
    manifest.disclosure.placeId ? [manifest.disclosure.placeId] : [],
  );
  const place = publicPlace(
    placeChains.get(manifest.disclosure.placeId ?? "") ?? [],
    manifest.disclosure,
    "bg",
  );
  const snapshot = {
    contract: "owner-preview-v1",
    caseId,
    listingReference: listing.reference,
    purpose: listing.purpose,
    partyId: party.data.sellerPartyId,
    participantId: participant.id,
    manifest,
    terms: revision.terms,
    facts: facts.map((fact) => ({
      key: fact.fieldKey,
      state: fact.state,
      value: fact.state === "known" ? fact.value : null,
      unit: fact.unit,
      basis: fact.basis,
    })),
    sourceCopy: revision.sourceCopy,
    disclosure: revision.disclosure,
    instruction: {
      id: instruction.id,
      version: instruction.revisionNumber,
      digest: instruction.contentDigest,
      commercialTerms: instruction.commercialTerms,
      disclosure: instruction.disclosure,
      rights: instruction.mediaUsageRights,
      scope: instruction.representationScope,
      commissionTerms: instruction.commissionTerms,
      expiresAt: instruction.expiresAt,
    },
    media: media.map(({ placement, asset }) => ({
      relationId: placement.mediaRelationId,
      assetId: asset.id,
      position: placement.position,
      sha256: asset.sha256,
      derivativeSha256: asset.derivativeSha256,
      rights: asset.rights,
      rightsHolder: asset.rightsHolder,
      rightsReference: asset.rightsReference,
      audience: asset.audience,
      review: asset.review,
      caption: asset.caption,
      altText: asset.altText,
      modification: asset.modification,
      modificationDisclosure: asset.modificationDisclosure,
    })),
    publicLocation: {
      country: place.country,
      region: place.district?.name ?? null,
      municipality: place.municipality?.name ?? null,
      settlement: place.settlement?.name ?? null,
      neighborhood: place.neighborhood,
      precision: place.precision,
    },
  };
  return {
    record,
    instruction,
    listing,
    revision,
    participant,
    partyId: party.data.sellerPartyId,
    facts,
    media,
    snapshot,
    hash: hashRequest(snapshot),
  };
}
async function ownerSource(db: Executor, session: Session, caseId: string, reference: string) {
  const bound = await caseFor(db, session, caseId);
  if (bound.live.actor.kind !== "client" || bound.row.disposition === "closed") throw denied();
  const source = await reviewedSource(db, caseId);
  const [principal] = await db
    .select()
    .from(principals)
    .where(eq(principals.id, bound.live.account.id));
  if (source.listing.reference !== reference || principal?.partyId !== source.partyId)
    throw denied();
  await assertCan(db, bound.live.actor, "portal.listing.acknowledge", {
    type: "listing",
    id: source.listing.id,
    propertyId: source.listing.propertyId,
    audience: "case_participants",
  });
  return { ...source, live: bound.live };
}

const bindSchema = z.object({
  ...commandEnvelope,
  instructionId: z.uuid(),
  reviewed: z.boolean().refine((v) => v),
  reason: z.string().trim().min(3).max(2000),
});
export async function bindSellerCase(
  db: Executor,
  session: Session,
  raw: z.input<typeof bindSchema>,
) {
  const input = parseInput(bindSchema, raw);
  const authorize = async (tx: Executor, lock = false) => {
    const live = await liveStaff(tx, session),
      bound = await caseFor(tx, live, input.id, "case.transition", lock);
    await assertCan(tx, live.actor, "case.read_internal", bound.resource);
    const source = await reviewedSource(tx, input.id, input.instructionId, true);
    await assertCan(tx, live.actor, "listing.read", {
      type: "listing",
      id: source.listing.id,
      propertyId: source.listing.propertyId,
    });
    return { ...bound, source };
  };
  const { live } = await authorize(db);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "case.seller.bind",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row, source } = await authorize(ctx.tx, true);
      version(row, input.expectedVersion);
      if (row.disposition !== "active") throw new AppError("transition_denied");
      const updated = await ctx.tx
        .update(sellerInstructions)
        .set({
          caseId: row.id,
          version: sql`${sellerInstructions.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(sellerInstructions.id, source.instruction.id),
            or(isNull(sellerInstructions.caseId), eq(sellerInstructions.caseId, row.id)),
          ),
        )
        .returning({ id: sellerInstructions.id });
      if (!updated.length) throw new AppError("version_conflict");
      await bumpCase(ctx.tx, row.id, row.version, { propertyId: source.listing.propertyId });
      await caseEvent(ctx, "case", row.id, "case.seller.instruction_bound", "case.transition", {
        instructionId: source.instruction.id,
        instructionDigest: source.instruction.contentDigest,
        propertyId: source.listing.propertyId,
        listingId: source.listing.id,
        sellerPartyId: source.partyId,
        reason: input.reason,
      });
      return {
        id: row.id,
        reference: row.reference,
        version: row.version + 1,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}

export async function sellerBindingOptions(db: Executor, session: Session, caseId: string) {
  const { row, live } = await caseFor(db, session, caseId, "case.transition");
  if (live.actor.kind !== "staff" || !["seller", "landlord"].includes(row.kind)) return [];
  const rows = await db
    .select({
      instructionId: sellerInstructions.id,
      instructionReference: sellerInstructions.reference,
      reference: listings.reference,
      listingId: listings.id,
      propertyId: listings.propertyId,
    })
    .from(sellerInstructions)
    .innerJoin(listings, eq(listings.id, sellerInstructions.listingId))
    .where(
      and(
        or(isNull(sellerInstructions.caseId), eq(sellerInstructions.caseId, caseId)),
        currentSellerEvidence(),
        row.propertyId ? eq(sellerInstructions.propertyId, row.propertyId) : undefined,
        sql`exists (select 1 from ${caseParticipants} participant where participant.case_id = ${caseId} and participant.party_id::text = ${sellerInstructions.commercialTerms}->>'sellerPartyId' and participant.role = ${row.kind} and participant.revoked_at is null and participant.valid_from <= now() and (participant.expires_at is null or participant.expires_at > now()))`,
      ),
    )
    .orderBy(desc(sellerInstructions.createdAt))
    .limit(100);
  const options = [];
  for (const row of rows)
    if (
      await can(db, live.actor, "listing.read", {
        type: "listing",
        id: row.listingId,
        propertyId: row.propertyId,
      })
    )
      options.push({
        id: row.instructionId,
        label: `${row.reference} · ${row.instructionReference}`,
      });
  return options;
}

export async function getOwnerPreview(
  db: Executor,
  session: Session,
  caseId: string,
  reference: string,
) {
  const source = await ownerSource(db, session, caseId, reference);
  const copy = z
    .object({ text: z.object({ title: z.string(), description: z.string() }) })
    .safeParse(source.revision.sourceCopy);
  if (!copy.success) throw new AppError("approval_stale");
  return {
    caseId,
    caseReference: source.record.reference,
    caseVersion: source.record.version,
    reference,
    revision: source.revision.revisionNumber,
    hash: source.hash,
    sourceLanguage: "bg" as const,
    title: copy.data.text.title,
    description: copy.data.text.description,
    location: source.snapshot.publicLocation,
    terms: Object.entries(termsFacts(source.revision.terms)).map(([key, f]) => ({
      key,
      state: f.state,
      value: f.state === "known" ? f.value : null,
      unit: f.unit,
      basis: f.basis,
    })),
    facts: source.facts
      .filter((f) => !["location", "price.amount_without_period"].includes(f.fieldKey))
      .map((f) => ({
        key: f.fieldKey,
        state: f.state,
        value: f.state === "known" ? f.value : null,
        unit: f.unit,
        basis: f.basis,
      })),
    instruction: {
      reference: source.instruction.reference,
      revision: source.instruction.revisionNumber,
      scope: source.instruction.representationScope,
      commissionTerms: source.instruction.commissionTerms,
      mediaUsageRights: source.instruction.mediaUsageRights,
      publicationPermission: source.instruction.publicationPermission,
    },
    media: source.media.map(({ asset, placement }) => ({
      id: asset.id,
      position: placement.position,
      alt: asset.altText ?? reference,
      caption: asset.caption,
      modification: asset.modificationDisclosure,
    })),
    acknowledged: Boolean(await currentOwnerAcknowledgment(db, caseId, source)),
  };
}
const ackSchema = z.object({
  ...commandEnvelope,
  reference: z.string().min(4).max(100),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewed: z.boolean().refine((v) => v),
});
export async function acknowledgeOwnerPreview(
  db: Executor,
  session: Session,
  raw: z.input<typeof ackSchema>,
  storage?: FileStorage,
) {
  const input = parseInput(ackSchema, raw);
  const before = await ownerSource(db, session, input.id, input.reference);
  requireFreshAuth(before.live);
  if (before.hash !== input.previewHash) throw new AppError("version_conflict");
  return runOperation(
    db,
    {
      actor: before.live.actor,
      type: "case.owner_preview.acknowledge",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await caseFor(ctx.tx, session, input.id, undefined, true);
      version(row, input.expectedVersion);
      const source = await ownerSource(ctx.tx, session, input.id, input.reference);
      requireFreshAuth(source.live);
      if (source.hash !== input.previewHash) throw new AppError("version_conflict");
      await verifyPublicationMedia(
        source.media.map((media) => media.asset),
        storage,
      );
      const [approval] = await ctx.tx
        .insert(approvals)
        .values({
          kind: "owner_acknowledgment",
          state: "approved",
          subjectType: "listing_revision",
          subjectId: source.revision.id,
          subjectVersion: source.revision.revisionNumber,
          subjectHash: source.hash,
          scope: {
            caseId: row.id,
            listingId: source.listing.id,
            propertyId: source.listing.propertyId,
            instructionId: source.instruction.id,
            partyId: source.partyId,
            participantId: source.participant.id,
          },
          evidence: {
            contract: "owner-preview-v1",
            previewHash: source.hash,
            factRevisionId: source.revision.factRevisionId,
            instructionDigest: source.instruction.contentDigest,
          },
          requestedByKind: "client",
          requestedById: source.live.account.id,
          decidedByKind: "client",
          decidedById: source.live.account.id,
          decidedWithCapability: "portal.listing.acknowledge",
          decidedAt: new Date(),
          decisionNote: "Owner reviewed the exact BG listing preview and consequences",
          expiresAt: source.instruction.expiresAt,
        })
        .returning();
      if (!approval) throw new Error("Owner acknowledgment insert failed");
      await bumpCase(ctx.tx, row.id, row.version);
      await caseEvent(
        ctx,
        "case",
        row.id,
        "case.owner_preview.acknowledged",
        "portal.listing.acknowledge",
        {
          approvalId: approval.id,
          listingId: source.listing.id,
          listingRevisionId: source.revision.id,
          previewHash: source.hash,
        },
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

/** Server-only stage evidence; every lookup recomputes the current source and owner authority. */
export async function currentOwnerAcknowledgment(
  db: Executor,
  caseId: string,
  loaded?: Awaited<ReturnType<typeof reviewedSource>>,
) {
  const source = loaded ?? (await reviewedSource(db, caseId));
  if (["sold", "let", "withdrawn"].includes(source.listing.commercialState)) return null;
  const rows = await db
    .select({ approval: approvals, principal: principals })
    .from(approvals)
    .innerJoin(principals, sql`${principals.id}::text = ${approvals.decidedById}`)
    .where(
      and(
        eq(approvals.kind, "owner_acknowledgment"),
        eq(approvals.state, "approved"),
        eq(approvals.subjectType, "listing_revision"),
        eq(approvals.subjectId, source.revision.id),
        eq(approvals.subjectVersion, source.revision.revisionNumber),
        eq(approvals.subjectHash, source.hash),
        eq(approvals.decidedByKind, "client"),
        eq(principals.kind, "client"),
        eq(principals.status, "active"),
        eq(principals.partyId, source.partyId),
        isNull(approvals.invalidatedAt),
        sql`${approvals.scope}->>'caseId' = ${caseId}`,
        sql`(${approvals.expiresAt} is null or ${approvals.expiresAt} > now())`,
      ),
    );
  for (const { approval, principal } of rows)
    if (
      await can(db, { kind: "client", id: principal.id }, "portal.listing.acknowledge", {
        type: "listing",
        id: source.listing.id,
        propertyId: source.listing.propertyId,
        audience: "case_participants",
      })
    )
      return approval.id;
  return null;
}

export async function ownerPreviewMedia(
  db: Executor,
  storage: FileStorage,
  session: Session,
  caseId: string,
  reference: string,
  assetId: string,
  previewHash: string,
): Promise<FileDownload> {
  const source = await ownerSource(db, session, caseId, reference);
  if (source.hash !== previewHash) throw denied();
  const asset = source.media.find((m) => m.asset.id === assetId)?.asset;
  if (!asset?.derivativeKey || !asset.derivativeSha256) throw denied();
  const bytes = await storage.read(asset.derivativeKey);
  if (digestOf(bytes) !== asset.derivativeSha256) throw denied();
  await recordAudit(db, {
    actor: session.actor,
    action: "case.owner_preview.media_read",
    recordType: "media",
    recordId: assetId,
    capability: "portal.listing.acknowledge",
    payload: { caseId, listingId: source.listing.id, previewHash, rendition: "safe_derivative" },
  });
  return {
    bytes,
    contentType: "image/webp",
    fileName: `${source.listing.reference}.webp`,
    inline: true,
  };
}
