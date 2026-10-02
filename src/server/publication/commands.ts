// Publication commands (architecture §5, §7.2–§7.4). The minimal human command set until the
// S2 workbench: approve a fact revision, submit and approve a listing revision, prepare an
// immutable manifest from the approved revisions, activate it, and restrict or withdraw.
//
// Every command is a recorded human decision by a staff member holding its capability,
// idempotent through its operation id, guarded by an expected revision, and commits its audit,
// activity and outbox event with the change. Butler and system jobs can take none of them.
//
// Activation switches the one CurrentPublication pointer for the listing, locale and destination
// in the same transaction that re-validates the manifest against current approvals and checks
// the listing's publication generation. Restriction and withdrawal increment the generation, so
// a manifest prepared or a job queued before them can never bring the old presentation back.
import "server-only";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  approvals,
  currentPublications,
  destinationDeliveries,
  listingRevisionMedia,
  listingRevisions,
  listingSearchDocuments,
  listings,
  localizedRevisions,
  mediaAssets,
  properties,
  propertyFactRevisions,
  propertyFacts,
  publicationManifests,
  sellerInstructions,
} from "@/db/schema";
import { type ApprovalKind, canonicalJson, isApprovalValid } from "@/domain/approval";
import type { Actor, Capability } from "@/domain/capabilities";
import { type LocationPrecision, locationPrecisions } from "@/domain/facts";
import { type PublicLocale, sourceLocale } from "@/domain/ids";
import { editorialTransitions } from "@/domain/listing";
import { type FactRecord, missingRequiredFacts } from "@/domain/listing-readiness";
import {
  type ActivationInput,
  checkActivation,
  type PointerState,
  planMaterialRestriction,
  planWithdrawal,
} from "@/domain/publication";
import type { RepresentationScope } from "@/domain/seller-instruction";
import { recordActivity } from "../activity";
import { recordAudit } from "../audit";
import { assertCan, type Resource } from "../authz";
import { hashRequest, sha256Hex } from "../crypto";
import type { Executor, Transaction } from "../db";
import { AppError } from "../errors";
import type { FileStorage } from "../files/storage";
import { recordOutboxEvent } from "../jobs/outbox";
import { mediaAssetEligible } from "../media/eligibility";
import { verifyPublicationMedia } from "../media/verify";
import { type OperationSuccess, runOperation } from "../operations";
import { writeSearchDocument } from "../search/projection";
import { executeTransition, tableStore } from "../transitions";
import { prepareMapPoint } from "./map-point";
import {
  loadPublishedListings,
  type ManifestDisclosure,
  type ManifestMedia,
  publicDestination,
  termsFacts,
} from "./presentation";
import { currentSellerEvidence } from "./seller-evidence";

/**
 * The publication policy the manifest was evaluated under: the §7.2 prerequisites of the final
 * architecture v1.0 as implemented here. A changed rule set is a new revision.
 */
export const publicationPolicyRevision = "architecture-1.0/publication-2026-09-27";

/** The §5.1 envelope every command carries; the actor is derived by the server. */
export interface CommandEnvelope {
  readonly actor: Actor;
  /** Logical operation id shared by every retry of this command. */
  readonly operationId: string;
  /** The record revision the person decided on (see each command). */
  readonly expectedRevision: number;
  readonly correlationId?: string;
  readonly now?: Date;
}

type ListingRow = typeof listings.$inferSelect;

function requireStaff(actor: Actor): void {
  // Publishing and approving are human decisions (§7.2); Butler never receives them (AT52).
  if (actor.kind !== "staff") throw new AppError("forbidden");
}

function listingResource(listing: ListingRow): Resource {
  return { type: "listing", id: listing.id, propertyId: listing.propertyId };
}

function conflict(current: Record<string, unknown>): AppError {
  return new AppError("version_conflict", { current });
}

function ineligible(code: string): AppError {
  return new AppError("publication_ineligible", { fieldErrors: { publication: [code] } });
}

async function lockListing(
  tx: Executor,
  where: { reference: string } | { id: string },
): Promise<ListingRow> {
  const [row] = await tx
    .select()
    .from(listings)
    .where(
      "id" in where
        ? eq(listings.id, where.id)
        : eq(listings.reference, where.reference.trim().toUpperCase()),
    )
    .for("update");
  if (!row) throw new AppError("not_found");
  return row;
}

async function run<T>(
  db: Executor,
  type: string,
  command: CommandEnvelope,
  payload: Record<string, unknown>,
  fn: (tx: Transaction, operationId: string, now: Date) => Promise<T>,
): Promise<OperationSuccess<T>> {
  requireStaff(command.actor);
  // Authorization is current even when runOperation can return a previous receipt.
  if (typeof payload.factRevisionId === "string") {
    const [revision] = await db
      .select()
      .from(propertyFactRevisions)
      .where(eq(propertyFactRevisions.id, payload.factRevisionId));
    if (!revision) throw new AppError("not_found");
    await assertCan(db, command.actor, "listing.review_facts", {
      type: "property",
      id: revision.propertyId,
      propertyId: revision.propertyId,
    });
  } else {
    let listing: ListingRow | undefined;
    if (typeof payload.reference === "string") {
      [listing] = await db
        .select()
        .from(listings)
        .where(eq(listings.reference, payload.reference.trim().toUpperCase()));
    } else if (typeof payload.manifestId === "string") {
      const [manifest] = await db
        .select()
        .from(publicationManifests)
        .where(eq(publicationManifests.id, payload.manifestId));
      if (manifest)
        [listing] = await db.select().from(listings).where(eq(listings.id, manifest.listingId));
    }
    if (!listing) throw new AppError("not_found");
    await assertCan(
      db,
      command.actor,
      type === "listing.revision.submit"
        ? "listing.edit"
        : type === "listing.revision.approve"
          ? "listing.review_facts"
          : "publication.release",
      listingResource(listing),
    );
  }
  return runOperation(
    db,
    {
      actor: command.actor,
      type,
      idempotencyKey: command.operationId,
      requestHash: hashRequest({ ...payload, expectedRevision: command.expectedRevision }),
      expectedVersion: command.expectedRevision,
    },
    ({ tx, operationId }) => fn(tx, operationId, command.now ?? new Date()),
  );
}

async function record(
  tx: Transaction,
  command: CommandEnvelope,
  operationId: string,
  now: Date,
  entry: {
    action: string;
    capability: Capability;
    recordType: string;
    recordId: string;
    reference?: string;
    summary: string;
    params?: Record<string, unknown>;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await recordActivity(tx, {
    recordType: entry.recordType,
    recordId: entry.recordId,
    ...(entry.reference ? { reference: entry.reference } : {}),
    messageKey: `activity.${entry.action}`,
    params: entry.params ?? {},
    summary: entry.summary,
    actor: command.actor,
    operationId,
    at: now,
  });
  await recordAudit(tx, {
    action: entry.action,
    actor: command.actor,
    capability: entry.capability,
    recordType: entry.recordType,
    recordId: entry.recordId,
    operationId,
    ...(command.correlationId ? { correlationId: command.correlationId } : {}),
    payload: entry.payload,
    at: now,
  });
}

// Approvals.

async function insertApproval(
  tx: Transaction,
  actor: Actor,
  values: {
    kind: ApprovalKind;
    subjectType: string;
    subjectId: string;
    subjectVersion: number;
    subjectHash: string;
    capability: Capability;
    scope?: Record<string, unknown>;
    note?: string;
    now: Date;
  },
): Promise<string> {
  // Same-person editing and approval are recorded as the person's own separate decision; no
  // independent reviewer is implied (§7.2).
  const [row] = await tx
    .insert(approvals)
    .values({
      kind: values.kind,
      state: "approved",
      subjectType: values.subjectType,
      subjectId: values.subjectId,
      subjectVersion: values.subjectVersion,
      subjectHash: values.subjectHash,
      scope: values.scope ?? {},
      requestedByKind: actor.kind,
      requestedById: actor.id,
      decidedByKind: actor.kind,
      decidedById: actor.id,
      decidedWithCapability: values.capability,
      decidedAt: values.now,
      ...(values.note ? { decisionNote: values.note } : {}),
    })
    .returning({ id: approvals.id });
  if (!row) throw new Error("Approval insert returned no row.");
  return row.id;
}

/** The newest approval of `kind` still valid for the subject's current digest, if any. */
async function validApprovalId(
  tx: Executor,
  kind: ApprovalKind,
  subjectType: string,
  subjectId: string,
  currentHash: string,
  now: Date,
): Promise<string | null> {
  const rows = await tx
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.kind, kind),
        eq(approvals.subjectType, subjectType),
        eq(approvals.subjectId, subjectId),
        eq(approvals.state, "approved"),
      ),
    )
    .orderBy(desc(approvals.decidedAt));
  const valid = rows.find((row) =>
    isApprovalValid(
      {
        kind,
        state: row.state,
        subject: {
          type: subjectType,
          id: subjectId,
          version: row.subjectVersion,
          hash: row.subjectHash,
        },
        ...(row.expiresAt ? { expiresAt: row.expiresAt.toISOString() } : {}),
      },
      currentHash,
      now.toISOString(),
    ),
  );
  return valid?.id ?? null;
}

/** Digest a language approval binds to: the copy and the exact source revision it renders. */
export function localizedRevisionDigest(revision: {
  readonly sourceRevisionId: string;
  readonly locale: string;
  readonly title: string | null;
  readonly body: unknown;
}): string {
  return sha256Hex(
    canonicalJson({
      sourceRevisionId: revision.sourceRevisionId,
      locale: revision.locale,
      title: revision.title,
      body: revision.body ?? null,
    }),
  );
}

// Fact review.

export interface FactRevisionApproved {
  readonly propertyId: string;
  readonly factRevisionId: string;
  readonly approvalId: string;
  readonly propertyVersion: number;
}

/**
 * Records a factual review of one PropertyFactRevision at a stated scope and makes it the
 * property's approved revision. `expectedRevision` is the property's version.
 */
export function approveFactRevision(
  db: Executor,
  command: CommandEnvelope & { readonly factRevisionId: string; readonly scope: string },
): Promise<OperationSuccess<FactRevisionApproved>> {
  const scope = command.scope.trim();
  const payload = { factRevisionId: command.factRevisionId, scope };
  return run(
    db,
    "property.fact_revision.approve",
    command,
    payload,
    async (tx, operationId, now) => {
      if (!scope) throw new AppError("validation_failed", { fieldErrors: { scope: ["required"] } });
      const [revision] = await tx
        .select()
        .from(propertyFactRevisions)
        .where(eq(propertyFactRevisions.id, command.factRevisionId));
      if (!revision) throw new AppError("not_found");
      const [property] = await tx
        .select()
        .from(properties)
        .where(eq(properties.id, revision.propertyId))
        .for("update");
      if (!property) throw new AppError("not_found");
      await assertCan(tx, command.actor, "listing.review_facts", {
        type: "property",
        id: property.id,
        propertyId: property.id,
      });
      if (property.version !== command.expectedRevision) {
        throw conflict({
          version: property.version,
          approvedFactRevisionId: property.approvedFactRevisionId,
        });
      }
      if (property.approvedFactRevisionId !== revision.id) {
        // Property facts are shared by sale and rental listings. Activation holds a shared
        // property lock, so this check and pointer activation cannot pass one another.
        const [exposure] = await tx
          .select({ id: currentPublications.id })
          .from(currentPublications)
          .innerJoin(listings, eq(listings.id, currentPublications.listingId))
          .where(and(eq(listings.propertyId, property.id), eq(currentPublications.state, "active")))
          .limit(1);
        if (exposure) throw ineligible("restrict_affected_publications_first");
      }
      const approvalId = await insertApproval(tx, command.actor, {
        kind: "factual",
        subjectType: "property_fact_revision",
        subjectId: revision.id,
        subjectVersion: revision.revisionNumber,
        subjectHash: revision.contentDigest,
        capability: "listing.review_facts",
        scope: { reviewScope: scope },
        now,
      });
      const propertyVersion = property.version + 1;
      await tx
        .update(properties)
        .set({ approvedFactRevisionId: revision.id, version: propertyVersion })
        .where(and(eq(properties.id, property.id), eq(properties.version, property.version)));
      await record(tx, command, operationId, now, {
        action: "property.fact_revision.approve",
        capability: "listing.review_facts",
        recordType: "property",
        recordId: property.id,
        reference: property.reference,
        summary: `Fact revision ${revision.revisionNumber} of ${property.reference} reviewed (${scope}).`,
        params: { revisionNumber: revision.revisionNumber },
        payload: { factRevisionId: revision.id, approvalId, scope, newVersion: propertyVersion },
      });
      return { propertyId: property.id, factRevisionId: revision.id, approvalId, propertyVersion };
    },
  );
}

// Editorial review of a listing revision.

const editorialStore = tableStore<ListingRow["editorialState"]>(listings, {
  id: listings.id,
  version: listings.version,
  state: listings.editorialState,
  reference: listings.reference,
  propertyId: listings.propertyId,
});

async function latestRevision(tx: Executor, listing: ListingRow, revisionId: string) {
  const [revision] = await tx
    .select()
    .from(listingRevisions)
    .where(and(eq(listingRevisions.id, revisionId), eq(listingRevisions.listingId, listing.id)));
  if (!revision) throw new AppError("not_found");
  // Review and approval bind the newest candidate only; an older one is superseded.
  if (revision.revisionNumber !== listing.latestRevisionNumber) {
    throw conflict({
      version: listing.version,
      latestRevisionNumber: listing.latestRevisionNumber,
    });
  }
  return revision;
}

async function editorialStep(
  tx: Transaction,
  command: CommandEnvelope,
  operationId: string,
  now: Date,
  listing: ListingRow,
  to: "in_review" | "approved_revision",
  evidence: { revisionId: string; missingRequiredFacts?: number; approvalValid?: boolean },
): Promise<number> {
  const outcome = await executeTransition(tx, editorialTransitions, editorialStore, {
    actor: command.actor,
    recordId: listing.id,
    expectedVersion: command.expectedRevision,
    to,
    evidence,
    operationId,
    ...(command.correlationId ? { correlationId: command.correlationId } : {}),
    now,
  });
  if (outcome.outcome === "version_conflict") {
    throw conflict({ version: outcome.current.version, editorialState: outcome.current.state });
  }
  if (outcome.outcome === "denied") {
    if (outcome.code === "missing_capability") throw new AppError("forbidden");
    throw new AppError("transition_denied", { fieldErrors: { editorialState: [outcome.code] } });
  }
  return outcome.record.version;
}

export interface ListingRevisionStep {
  readonly reference: string;
  readonly revisionId: string;
  readonly listingVersion: number;
}

/**
 * Submits the newest ListingRevision for editorial review; refused while a required fact is
 * missing, undecided or an unreviewed import. `expectedRevision` is the listing's version.
 */
export function submitListingRevision(
  db: Executor,
  command: CommandEnvelope & { readonly reference: string; readonly revisionId: string },
): Promise<OperationSuccess<ListingRevisionStep>> {
  const payload = { reference: command.reference, revisionId: command.revisionId };
  return run(db, "listing.revision.submit", command, payload, async (tx, operationId, now) => {
    const listing = await lockListing(tx, { reference: command.reference });
    const revision = await latestRevision(tx, listing, command.revisionId);
    const [property] = await tx
      .select({ propertyType: properties.propertyType })
      .from(properties)
      .where(eq(properties.id, listing.propertyId));
    if (!property) throw new AppError("not_found");
    const rows = await tx
      .select()
      .from(propertyFacts)
      .where(eq(propertyFacts.factRevisionId, revision.factRevisionId));
    const facts: FactRecord[] = [
      ...rows.map((f) => ({
        fieldKey: f.fieldKey,
        state: f.state,
        sourceClass: f.sourceClass,
        reviewedAt: f.reviewedAt?.toISOString() ?? null,
      })),
      ...Object.entries(termsFacts(revision.terms)).map(([fieldKey, f]) => ({
        fieldKey,
        state: f.state,
        sourceClass: f.sourceClass,
      })),
    ];
    const missing = missingRequiredFacts(property.propertyType, facts);
    if (missing.length > 0) {
      const fieldErrors: Record<string, string[]> = {};
      for (const m of missing) fieldErrors[`fact.${m.key}`] = [m.problem];
      throw new AppError("transition_denied", { fieldErrors });
    }
    const listingVersion = await editorialStep(
      tx,
      command,
      operationId,
      now,
      listing,
      "in_review",
      {
        revisionId: revision.id,
        missingRequiredFacts: 0,
      },
    );
    return { reference: listing.reference, revisionId: revision.id, listingVersion };
  });
}

/**
 * Approves the exact ListingRevision under review by its digest and makes it the listing's
 * approved revision. `expectedRevision` is the listing's version.
 */
export function approveListingRevision(
  db: Executor,
  command: CommandEnvelope & {
    readonly reference: string;
    readonly revisionId: string;
    readonly note?: string;
  },
): Promise<OperationSuccess<ListingRevisionStep & { readonly approvalId: string }>> {
  const payload = {
    reference: command.reference,
    revisionId: command.revisionId,
    note: command.note ?? null,
  };
  return run(db, "listing.revision.approve", command, payload, async (tx, operationId, now) => {
    const listing = await lockListing(tx, { reference: command.reference });
    const revision = await latestRevision(tx, listing, command.revisionId);
    const listingVersion = await editorialStep(
      tx,
      command,
      operationId,
      now,
      listing,
      "approved_revision",
      { revisionId: revision.id, approvalValid: true },
    );
    const approvalId = await insertApproval(tx, command.actor, {
      kind: "editorial",
      subjectType: "listing_revision",
      subjectId: revision.id,
      subjectVersion: revision.revisionNumber,
      subjectHash: revision.contentDigest,
      capability: "listing.review_facts",
      ...(command.note ? { note: command.note } : {}),
      now,
    });
    await tx
      .update(listings)
      .set({ approvedRevisionId: revision.id })
      .where(eq(listings.id, listing.id));
    return { reference: listing.reference, revisionId: revision.id, listingVersion, approvalId };
  });
}

// Eligibility and manifests.

interface ManifestContent {
  readonly listingId: string;
  readonly locale: PublicLocale;
  readonly destination: typeof publicDestination;
  readonly generation: number;
  readonly listingRevisionId: string;
  readonly listingRevisionDigest: string;
  readonly factRevisionId: string;
  readonly factRevisionDigest: string;
  readonly localizedRevisionId: string | null;
  readonly localizedRevisionDigest: string | null;
  readonly media: readonly ManifestMedia[];
  readonly disclosure: ManifestDisclosure;
  readonly availabilityBasis: {
    readonly state: ListingRow["commercialState"];
    readonly basis: string | null;
    readonly confirmedAt: string | null;
  };
  readonly policyRevision: string;
  readonly decisions: Readonly<Record<string, string | null>>;
}

interface Eligibility {
  readonly input: ActivationInput;
  /** Null when there is no approved revision to bind. */
  readonly content: ManifestContent | null;
}

const scopeCovers: Readonly<Record<ListingRow["purpose"], readonly RepresentationScope[]>> = {
  sale: ["sale", "sale_and_letting"],
  long_term_rent: ["letting", "sale_and_letting"],
};

/**
 * Everything §7.2 requires for `locale`, read from current records inside the caller's
 * transaction: the approved listing and fact revisions, the seller instruction, the localized
 * revision, media and regulated-claim review.
 */
export async function currentEligibility(
  tx: Executor,
  listing: ListingRow,
  locale: PublicLocale,
  generation: number,
  now: Date,
): Promise<Eligibility> {
  const base = {
    locale,
    manifestGeneration: generation,
    currentGeneration: listing.publicationGeneration,
    commercial: listing.commercialState,
  };
  const blocked: Eligibility = {
    input: {
      ...base,
      factReviewValid: false,
      revisionApprovalValid: false,
      sellerInstructionValid: false,
      localeApprovedForSource: false,
      mediaEligible: false,
      regulatedClaimsReviewed: false,
    },
    content: null,
  };
  if (!listing.approvedRevisionId) return blocked;
  const [revision] = await tx
    .select()
    .from(listingRevisions)
    .where(eq(listingRevisions.id, listing.approvedRevisionId));
  const [property] = await tx
    .select()
    .from(properties)
    .where(eq(properties.id, listing.propertyId))
    .for("share");
  if (!revision || !property) return blocked;
  const [factRevision] = await tx
    .select()
    .from(propertyFactRevisions)
    .where(eq(propertyFactRevisions.id, revision.factRevisionId));
  if (!factRevision) return blocked;

  const editorial = await validApprovalId(
    tx,
    "editorial",
    "listing_revision",
    revision.id,
    revision.contentDigest,
    now,
  );
  const factual =
    property.approvedFactRevisionId === factRevision.id
      ? await validApprovalId(
          tx,
          "factual",
          "property_fact_revision",
          factRevision.id,
          factRevision.contentDigest,
          now,
        )
      : null;

  const [instruction] = await tx
    .select()
    .from(sellerInstructions)
    .where(
      and(
        eq(sellerInstructions.propertyId, property.id),
        or(
          eq(sellerInstructions.listingId, listing.id),
          and(
            isNull(sellerInstructions.listingId),
            inArray(sellerInstructions.representationScope, scopeCovers[listing.purpose]),
          ),
        ),
        eq(sellerInstructions.state, "agreed"),
        isNull(sellerInstructions.invalidatedAt),
      ),
    )
    .orderBy(desc(sellerInstructions.revisionNumber))
    .limit(1);
  const evidence = instruction
    ? await tx
        .select({ id: sellerInstructions.id })
        .from(sellerInstructions)
        .where(
          and(eq(sellerInstructions.id, instruction.id), currentSellerEvidence(now, listing.id)),
        )
    : [];
  const instructionValid =
    evidence.length === 1 &&
    instruction?.publicationPermission === true &&
    (!instruction.expiresAt || instruction.expiresAt > now) &&
    scopeCovers[listing.purpose].includes(instruction.representationScope) &&
    // Permission belongs to the agreed terms and disclosure, not every later asking price.
    canonicalJson((instruction.commercialTerms as { price?: unknown }).price ?? null) ===
      canonicalJson(termsFacts(revision.terms).price?.value ?? null) &&
    (instruction.disclosure as { publicPrecision?: unknown }).publicPrecision ===
      (revision.disclosure as { publicPrecision?: unknown }).publicPrecision &&
    (instruction.mediaUsageRights as { granted?: unknown }).granted === true;

  let localized: { id: string; digest: string } | null = null;
  let language: string | null = null;
  if (locale !== sourceLocale) {
    const [row] = await tx
      .select()
      .from(localizedRevisions)
      .where(
        and(
          eq(localizedRevisions.sourceRevisionId, revision.id),
          eq(localizedRevisions.locale, locale),
        ),
      );
    if (row?.state === "approved_for_source") {
      localized = { id: row.id, digest: localizedRevisionDigest(row) };
      language = await validApprovalId(
        tx,
        "language",
        "localized_revision",
        row.id,
        localized.digest,
        now,
      );
    }
  }

  const placed = await tx
    .select({ placement: listingRevisionMedia, asset: mediaAssets })
    .from(listingRevisionMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, listingRevisionMedia.mediaAssetId))
    .where(eq(listingRevisionMedia.listingRevisionId, revision.id))
    .orderBy(asc(listingRevisionMedia.position));
  const mediaEligible = placed.length > 0 && placed.every(({ asset }) => mediaAssetEligible(asset));
  const media: ManifestMedia[] = placed.map(({ placement, asset }) => ({
    relationId: placement.mediaRelationId,
    assetId: asset.id,
    position: placement.position,
    sha256: asset.sha256 ?? "",
    derivativeKey: asset.derivativeKey ?? "",
    derivativeSha256: asset.derivativeSha256 ?? "",
    derivativeContentType: asset.derivativeContentType ?? "",
    rightsReference: asset.rightsReference,
    kind: asset.kind,
    width: asset.width,
    height: asset.height,
    altText: asset.altText,
    caption: asset.caption,
    modification: asset.modification,
    modificationDisclosure: asset.modificationDisclosure,
  }));

  // Legal, tax and process claims the copy declares need their own professional review.
  const claims = (revision.sourceCopy as { regulatedClaims?: unknown } | null)?.regulatedClaims;
  const makesClaims = Array.isArray(claims) && claims.length > 0;
  const claimReview = makesClaims
    ? await validApprovalId(
        tx,
        "legal_process_claim",
        "listing_revision",
        revision.id,
        revision.contentDigest,
        now,
      )
    : null;

  const disclosed = (revision.disclosure as { publicPrecision?: unknown } | null)?.publicPrecision;
  const precision: LocationPrecision = (locationPrecisions as readonly unknown[]).includes(
    disclosed,
  )
    ? (disclosed as LocationPrecision)
    : property.publicPrecision;
  const disclosure: ManifestDisclosure = {
    mapPoint: await prepareMapPoint(tx, property.placeId, property.country, precision),
    country: property.country,
    placeId: property.placeId,
    precision,
    neighborhood: ["exact", "street", "neighborhood"].includes(precision)
      ? property.neighborhood
      : null,
  };

  return {
    input: {
      ...base,
      factReviewValid: factual !== null,
      revisionApprovalValid: editorial !== null,
      sellerInstructionValid: instructionValid,
      localeApprovedForSource: locale === sourceLocale || (localized !== null && language !== null),
      mediaEligible,
      regulatedClaimsReviewed: makesClaims ? claimReview !== null : "not_applicable",
    },
    content: {
      listingId: listing.id,
      locale,
      destination: publicDestination,
      generation,
      listingRevisionId: revision.id,
      listingRevisionDigest: revision.contentDigest,
      factRevisionId: factRevision.id,
      factRevisionDigest: factRevision.contentDigest,
      localizedRevisionId: localized?.id ?? null,
      localizedRevisionDigest: localized?.digest ?? null,
      media,
      disclosure,
      availabilityBasis: {
        state: listing.commercialState,
        basis: listing.availabilityBasis,
        confirmedAt: listing.availabilityConfirmedAt?.toISOString() ?? null,
      },
      policyRevision: publicationPolicyRevision,
      decisions: {
        factual,
        editorial,
        language,
        legalProcessClaim: claimReview,
        sellerInstruction: instructionValid ? (instruction?.id ?? null) : null,
      },
    },
  };
}

function manifestDigest(content: ManifestContent): string {
  return sha256Hex(canonicalJson(content));
}

/** Read-only readiness for the staff workbench. A later release always checks again in its transaction. */
export async function publicationReadiness(
  db: Executor,
  actor: Actor,
  reference: string,
  locale: PublicLocale = "bg",
) {
  requireStaff(actor);
  const [listing] = await db
    .select()
    .from(listings)
    .where(eq(listings.reference, reference.trim().toUpperCase()));
  if (!listing) throw new AppError("not_found");
  await assertCan(db, actor, "listing.read", listingResource(listing));
  const eligibility = await currentEligibility(
    db,
    listing,
    locale,
    listing.publicationGeneration,
    new Date(),
  );
  return { input: eligibility.input, decision: checkActivation(eligibility.input, actor) };
}

function assertPublishAuthority(tx: Executor, actor: Actor, listing: ListingRow) {
  return assertCan(tx, actor, "publication.release", listingResource(listing));
}

function checkGeneration(listing: ListingRow, expected: number): void {
  if (listing.publicationGeneration !== expected) {
    throw conflict({ generation: listing.publicationGeneration, version: listing.version });
  }
}

export interface PreparedManifest {
  readonly manifestId: string;
  readonly reference: string;
  readonly locale: PublicLocale;
  readonly generation: number;
  readonly contentDigest: string;
}

/**
 * Builds the immutable manifest for one locale on the website from the currently approved
 * revisions. Refused with PUBLICATION_INELIGIBLE naming the first missing prerequisite.
 * `expectedRevision` is the listing's publication generation.
 */
export function prepareManifest(
  db: Executor,
  command: CommandEnvelope & { readonly reference: string; readonly locale: PublicLocale },
  dependencies: { storage?: FileStorage } = {},
): Promise<OperationSuccess<PreparedManifest>> {
  const payload = { reference: command.reference, locale: command.locale };
  return run(db, "publication.manifest.prepare", command, payload, async (tx, operationId, now) => {
    const listing = await lockListing(tx, { reference: command.reference });
    await assertPublishAuthority(tx, command.actor, listing);
    checkGeneration(listing, command.expectedRevision);
    const eligibility = await currentEligibility(
      tx,
      listing,
      command.locale,
      listing.publicationGeneration,
      now,
    );
    const decision = checkActivation(eligibility.input, command.actor);
    if (decision.outcome === "denied") throw ineligible(decision.code);
    const content = eligibility.content;
    if (!content) throw ineligible("approval_stale");
    await verifyPublicationMedia(
      await tx
        .select()
        .from(mediaAssets)
        .where(
          inArray(
            mediaAssets.id,
            content.media.map((item) => item.assetId),
          ),
        ),
      dependencies.storage,
    );
    const contentDigest = manifestDigest(content);
    const [manifest] = await tx
      .insert(publicationManifests)
      .values({
        listingId: listing.id,
        locale: content.locale,
        destination: content.destination,
        generation: content.generation,
        listingRevisionId: content.listingRevisionId,
        factRevisionId: content.factRevisionId,
        localizedRevisionId: content.localizedRevisionId,
        media: content.media,
        disclosure: content.disclosure,
        availabilityBasis: content.availabilityBasis,
        policyRevision: content.policyRevision,
        decisions: content.decisions,
        contentDigest,
        createdById: command.actor.id,
        createdAt: now,
      })
      .returning({ id: publicationManifests.id });
    if (!manifest) throw new Error("Manifest insert returned no row.");
    await record(tx, command, operationId, now, {
      action: "publication.manifest.prepare",
      capability: "publication.release",
      recordType: "listing",
      recordId: listing.id,
      reference: listing.reference,
      summary: `Publication manifest for ${listing.reference} (${content.locale}) prepared.`,
      params: { locale: content.locale },
      payload: { manifestId: manifest.id, contentDigest, generation: content.generation },
    });
    return {
      manifestId: manifest.id,
      reference: listing.reference,
      locale: content.locale,
      generation: content.generation,
      contentDigest,
    };
  });
}

export interface ActivatedPublication {
  readonly reference: string;
  readonly locale: PublicLocale;
  readonly manifestId: string;
  readonly generation: number;
  readonly approvalId: string;
  readonly pointerState: "active";
}

/**
 * Activates a prepared manifest: re-validates it against current approvals and the listing's
 * generation, records the publishing decision, switches the pointer, rewrites the search
 * projection from a read-back and records the website delivery, all in one transaction.
 * `expectedRevision` is the listing's publication generation.
 */
export function activateManifest(
  db: Executor,
  command: CommandEnvelope & { readonly manifestId: string },
  dependencies: { storage?: FileStorage } = {},
): Promise<OperationSuccess<ActivatedPublication>> {
  const payload = { manifestId: command.manifestId };
  return run(db, "publication.activate", command, payload, async (tx, operationId, now) => {
    const [manifest] = await tx
      .select()
      .from(publicationManifests)
      .where(eq(publicationManifests.id, command.manifestId));
    if (!manifest) throw new AppError("not_found");
    const listing = await lockListing(tx, { id: manifest.listingId });
    await assertPublishAuthority(tx, command.actor, listing);
    checkGeneration(listing, command.expectedRevision);
    if (manifest.destination !== publicDestination) throw ineligible("destination_not_supported");

    const eligibility = await currentEligibility(
      tx,
      listing,
      manifest.locale,
      manifest.generation,
      now,
    );
    const decision = checkActivation(eligibility.input, command.actor);
    if (decision.outcome === "denied") {
      throw decision.code === "generation_superseded" || decision.code === "approval_stale"
        ? new AppError("approval_stale", { fieldErrors: { publication: [decision.code] } })
        : ineligible(decision.code);
    }
    // Anything that changed since preparation (a newer approved revision, copy, media,
    // disclosure or availability basis) makes this manifest stale: prepare a new one.
    if (!eligibility.content || manifestDigest(eligibility.content) !== manifest.contentDigest) {
      throw new AppError("approval_stale", {
        fieldErrors: { publication: ["manifest_superseded"] },
      });
    }
    await verifyPublicationMedia(
      await tx
        .select()
        .from(mediaAssets)
        .where(
          inArray(
            mediaAssets.id,
            eligibility.content.media.map((item) => item.assetId),
          ),
        ),
      dependencies.storage,
    );

    const approvalId = await insertApproval(tx, command.actor, {
      kind: "publication",
      subjectType: "publication_manifest",
      subjectId: manifest.id,
      subjectVersion: manifest.generation,
      subjectHash: manifest.contentDigest,
      capability: "publication.release",
      scope: { locale: manifest.locale, destination: manifest.destination },
      now,
    });
    const pointer = {
      manifestId: manifest.id,
      state: "active" as const,
      generation: listing.publicationGeneration,
      activatedAt: now,
      activatedById: command.actor.id,
      restrictedAt: null,
      withdrawnAt: null,
      reason: null,
    };
    const [existing] = await tx
      .select()
      .from(currentPublications)
      .where(
        and(
          eq(currentPublications.listingId, listing.id),
          eq(currentPublications.locale, manifest.locale),
          eq(currentPublications.destination, manifest.destination),
        ),
      )
      .for("update");
    if (existing) {
      await tx
        .update(currentPublications)
        .set({ ...pointer, version: existing.version + 1 })
        .where(eq(currentPublications.id, existing.id));
    } else {
      await tx.insert(currentPublications).values({
        listingId: listing.id,
        locale: manifest.locale,
        destination: manifest.destination,
        ...pointer,
      });
    }

    // Read back through the one public presentation: the website shows exactly this manifest.
    const [shown] = await loadPublishedListings(tx, { ids: [listing.id] }, manifest.locale);
    if (shown?.manifestId !== manifest.id) {
      throw new Error(`Read-back of ${listing.reference} did not show manifest ${manifest.id}.`);
    }
    await writeSearchDocument(tx, shown);
    await tx.insert(destinationDeliveries).values({
      manifestId: manifest.id,
      listingId: listing.id,
      locale: manifest.locale,
      destination: manifest.destination,
      kind: "publish",
      generation: listing.publicationGeneration,
      state: "verified",
      acknowledgedAt: now,
      verifiedAt: now,
      evidence: { method: "read_back", manifestDigest: manifest.contentDigest },
    });
    await recordOutboxEvent(tx, {
      eventType: "publication.activated",
      subjectType: "listing",
      subjectId: listing.id,
      payload: { locale: manifest.locale, manifestId: manifest.id },
      sourceGeneration: listing.publicationGeneration,
      operationId,
    });
    await record(tx, command, operationId, now, {
      action: "publication.activate",
      capability: "publication.release",
      recordType: "listing",
      recordId: listing.id,
      reference: listing.reference,
      summary: `${listing.reference} published on the website (${manifest.locale}).`,
      params: { locale: manifest.locale },
      payload: {
        manifestId: manifest.id,
        contentDigest: manifest.contentDigest,
        generation: listing.publicationGeneration,
        approvalId,
        replacedManifestId: existing?.manifestId ?? null,
      },
    });
    return {
      reference: listing.reference,
      locale: manifest.locale,
      manifestId: manifest.id,
      generation: listing.publicationGeneration,
      approvalId,
      pointerState: "active",
    };
  });
}

// Restriction and withdrawal.

export interface ExposureRemoved {
  readonly reference: string;
  /** The listing's new publication generation. */
  readonly generation: number;
  readonly affected: readonly {
    readonly locale: PublicLocale;
    readonly destination: string;
    readonly state: PointerState;
  }[];
}

function removeExposure(
  db: Executor,
  kind: "restrict" | "withdraw",
  command: CommandEnvelope & { readonly reference: string; readonly reason: string },
): Promise<OperationSuccess<ExposureRemoved>> {
  const reason = command.reason.trim();
  const payload = { reference: command.reference, reason };
  const action = kind === "restrict" ? "publication.restrict" : "publication.withdraw";
  return run(db, action, command, payload, async (tx, operationId, now) => {
    if (!reason) throw new AppError("validation_failed", { fieldErrors: { reason: ["required"] } });
    const listing = await lockListing(tx, { reference: command.reference });
    await assertPublishAuthority(tx, command.actor, listing);
    checkGeneration(listing, command.expectedRevision);
    const pointers = await tx
      .select()
      .from(currentPublications)
      .where(eq(currentPublications.listingId, listing.id))
      .for("update");
    const dependencies = pointers.map((p) => ({
      locale: p.locale,
      destination: p.destination,
      state: p.state,
      // Partial restriction after a dependency analysis is the S2 material-correction flow.
      provenUnaffected: false,
    }));
    const plan =
      kind === "restrict"
        ? (() => {
            const p = planMaterialRestriction(dependencies, listing.publicationGeneration);
            return { nextGeneration: p.nextGeneration, affected: p.restrict };
          })()
        : (() => {
            const p = planWithdrawal(dependencies, listing.publicationGeneration);
            return { nextGeneration: p.nextGeneration, affected: p.withdraw };
          })();
    const state: PointerState = kind === "restrict" ? "restricted" : "withdrawn";

    await tx
      .update(listings)
      .set({ publicationGeneration: plan.nextGeneration, version: listing.version + 1 })
      .where(and(eq(listings.id, listing.id), eq(listings.version, listing.version)));
    const affected = pointers.filter((p) =>
      plan.affected.some((a) => a.locale === p.locale && a.destination === p.destination),
    );
    if (affected.length > 0) {
      await tx
        .update(currentPublications)
        .set({
          state,
          reason,
          ...(kind === "restrict" ? { restrictedAt: now } : { withdrawnAt: now }),
        })
        .where(
          inArray(
            currentPublications.id,
            affected.map((p) => p.id),
          ),
        );
    }
    await tx.delete(listingSearchDocuments).where(eq(listingSearchDocuments.listingId, listing.id));
    for (const pointer of affected) {
      const local = pointer.destination === publicDestination;
      const stillShown =
        local &&
        (await loadPublishedListings(tx, { ids: [listing.id] }, pointer.locale)).length > 0;
      if (stillShown) throw new Error(`Read-back still shows ${listing.reference}.`);
      // The website is verified by read-back; any other destination is owned manual work.
      await tx.insert(destinationDeliveries).values({
        manifestId: pointer.manifestId,
        listingId: listing.id,
        locale: pointer.locale,
        destination: pointer.destination,
        kind: "withdraw",
        generation: plan.nextGeneration,
        state: local ? "withdrawn" : "queued",
        ...(local ? { verifiedAt: now, evidence: { method: "read_back" } } : {}),
      });
    }
    await recordOutboxEvent(tx, {
      eventType: kind === "restrict" ? "publication.restricted" : "publication.withdrawn",
      subjectType: "listing",
      subjectId: listing.id,
      payload: { locales: affected.map((p) => p.locale) },
      sourceGeneration: plan.nextGeneration,
      operationId,
    });
    await record(tx, command, operationId, now, {
      action,
      capability: "publication.release",
      recordType: "listing",
      recordId: listing.id,
      reference: listing.reference,
      summary: `${listing.reference} ${kind === "restrict" ? "restricted" : "withdrawn"} on every destination: ${reason}`,
      params: { locales: affected.map((p) => p.locale) },
      payload: {
        reason,
        previousGeneration: listing.publicationGeneration,
        generation: plan.nextGeneration,
        pointers: affected.map((p) => p.id),
      },
    });
    return {
      reference: listing.reference,
      generation: plan.nextGeneration,
      affected: affected.map((p) => ({ locale: p.locale, destination: p.destination, state })),
    };
  });
}

/**
 * Removes the listing's public exposure while its presentation is inaccurate, before any
 * correction (§7.4). `expectedRevision` is the listing's publication generation.
 */
export function restrictPublication(
  db: Executor,
  command: CommandEnvelope & { readonly reference: string; readonly reason: string },
): Promise<OperationSuccess<ExposureRemoved>> {
  return removeExposure(db, "restrict", command);
}

/**
 * Withdraws every publication of the listing at once; it never waits for a translation, review
 * or external acknowledgment (§7.4). `expectedRevision` is the listing's publication generation.
 */
export function withdrawPublication(
  db: Executor,
  command: CommandEnvelope & { readonly reference: string; readonly reason: string },
): Promise<OperationSuccess<ExposureRemoved>> {
  return removeExposure(db, "withdraw", command);
}
