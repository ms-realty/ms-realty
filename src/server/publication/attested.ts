// One-decision publishing (ADR 0012). A person with publishing rights sees what the public will
// see and what the system checked, attests once, and publishes. Underneath, this command takes
// every recorded step the detailed review takes, as that person and through the same commands
// (availability, fact review, editorial review, seller instruction, photo review, manifest,
// activation), so the evidence trail and the unchanged public read path stay exactly as they
// are. It is resumable: a step that already holds is skipped, so a retry finishes the job and a
// second call on a published listing changes nothing.
//
// What stays a person's: the decision itself (Butler and system actors are refused), the
// attestation text recorded with actor and time, and every non-source translation, which goes
// public only when a person approved that translation for this exact version.
import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { type PublicationPolicy, publicationPolicy, type StaffLocale } from "@/config/tenant";
import {
  approvals,
  currentPublications,
  listingRevisionMedia,
  listingRevisions,
  listings,
  localizedRevisions,
  mediaAssets,
  mediaRelations,
  properties,
  propertyFactRevisions,
  propertyFacts,
  publicationManifests,
} from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import type { Actor } from "@/domain/capabilities";
import type { FactState } from "@/domain/facts";
import { type PublicLocale, sourceLocale } from "@/domain/ids";
import { type FactRecord, needsHumanReview, requiredFactKeys } from "@/domain/listing-readiness";
import { parseMediaRenditions } from "@/domain/media-rendition";
import {
  type PublishBlocker,
  type PublishCheckInput,
  type PublishChecks,
  publishChecks,
} from "@/domain/publish-checks";
import { publishCopy } from "@/features/inventory/publish-copy";
import { recordActivity } from "../activity";
import { recordAudit } from "../audit";
import { requireFreshAuth, requireLiveSession, type Session } from "../auth/sessions";
import { assertCan, can } from "../authz";
import { hashRequest, sha256Hex } from "../crypto";
import type { Executor } from "../db";
import { AppError, isAppError } from "../errors";
import type { FileStorage } from "../files/storage";
import {
  confirmListingAvailability,
  freezeListingDraft,
  replaceSellerInstruction,
} from "../inventory/commands";
import { draftSchema } from "../inventory/contracts";
import { workingDraftFrom } from "../inventory/working-draft";
import { reviewMedia } from "../media/commands";
import { mediaAssetEligible } from "../media/eligibility";
import { runOperation } from "../operations";
import {
  activateManifest,
  approveFactRevision,
  approveListingRevision,
  currentEligibility,
  manifestDigest,
  prepareManifest,
  restrictPublication,
  submitListingRevision,
} from "./commands";
import { termsFacts } from "./presentation";
import { staffAttestationBasis } from "./seller-evidence";

type ListingRow = typeof listings.$inferSelect;
type PropertyRow = typeof properties.$inferSelect;
type RevisionRow = typeof listingRevisions.$inferSelect;
type FactRow = typeof propertyFacts.$inferSelect;
type AssetRow = typeof mediaAssets.$inferSelect;

/** Why a listing did not go public, in terms the staff copy explains (publishing.json). */
export type PublishBlockReason =
  | PublishBlocker
  | "not_attested"
  | "another_person_required"
  | "seller_documents_required"
  | "professional_review_required"
  | "photos_required"
  | "shared_facts_published"
  | "no_permission"
  | "changed_since_opened"
  | "facts_incomplete"
  | "other";

export type AttestedPublishResult =
  | {
      readonly status: "published";
      readonly reference: string;
      /** Locales live after this call; the source locale first. */
      readonly locales: readonly PublicLocale[];
      /** True when nothing needed doing: the same content was already live. */
      readonly unchanged: boolean;
      readonly attestationId: string;
      readonly warnings: PublishChecks["warnings"];
    }
  | {
      readonly status: "blocked";
      readonly reference: string;
      readonly reason: PublishBlockReason;
      /** The underlying code, for the technical details and the operation receipt. */
      readonly detail?: string;
    };

// Photos.

/** shown: cleared now · clearable: processed, waiting for a person · not_ready · rejected. */
export type PhotoReadiness = "shown" | "clearable" | "not_ready" | "rejected";

export function photoReadiness(asset: AssetRow): PhotoReadiness {
  if (asset.review === "rejected" || asset.rights === "rejected") return "rejected";
  if (mediaAssetEligible(asset) && !asset.detailsDraft) return "shown";
  const processed =
    asset.sealedKey &&
    asset.sha256 &&
    asset.scan === "clean" &&
    asset.scannedSha256 === asset.sha256 &&
    asset.scannedAt &&
    asset.scannerVersion &&
    asset.processing === "ready" &&
    parseMediaRenditions(asset.derivativeRenditions, asset.id) &&
    asset.derivativeKey &&
    asset.derivativeSha256 &&
    asset.derivativeContentType === "image/webp";
  return processed && (asset.review !== "approved" || asset.detailsDraft)
    ? "clearable"
    : "not_ready";
}

// What would go public.

export interface PublishContent {
  readonly title: string;
  readonly description: string;
  readonly price: { readonly state: FactState | null; readonly value: unknown };
  readonly area: { readonly state: FactState | null; readonly value: unknown };
  readonly bedrooms: { readonly state: FactState | null; readonly value: unknown };
  readonly locationKnown: boolean;
  /** The saved working draft differs from the latest version and is published first. */
  readonly pendingDraft: boolean;
  /** A rent recorded without its period: the person confirms "per month" when publishing. */
  readonly rentAmount: { readonly amountMinor: number; readonly currency: string } | null;
}

/** The rent amount the legacy import kept without a period, for a long-term rental only. */
export function rentWithoutPeriod(
  purpose: ListingRow["purpose"],
  terms: unknown,
): { amountMinor: number; currency: string } | null {
  if (purpose !== "long_term_rent") return null;
  const facts = termsFacts(terms);
  if (facts.price?.state === "known" || facts.price?.state === "withheld") return null;
  const amount = facts["price.amount_without_period"];
  const value = record(amount?.value);
  return amount?.state === "known" &&
    typeof value.amountMinor === "number" &&
    Number.isSafeInteger(value.amountMinor) &&
    value.amountMinor > 0 &&
    typeof value.currency === "string"
    ? { amountMinor: value.amountMinor, currency: value.currency }
    : null;
}

const draftKeys = [
  "title",
  "description",
  "priceState",
  "price",
  "areaState",
  "area",
  "areaBasis",
  "bedroomsState",
  "bedrooms",
] as const;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Whether the saved working draft holds changes the latest version does not. */
export function hasPendingDraft(
  listing: Pick<ListingRow, "draft">,
  revision: RevisionRow | null,
  facts: readonly FactRow[],
): boolean {
  const draft = draftSchema.safeParse(listing.draft);
  if (!draft.success) return false;
  if (!revision) return true;
  const current = workingDraftFrom(revision, facts);
  return draftKeys.some((key) => (draft.data[key] ?? "") !== (current[key] ?? ""));
}

function factOf(facts: readonly FactRow[], key: string) {
  const row =
    key === "area"
      ? facts.find((f) => f.fieldKey === "area" || f.fieldKey.startsWith("area."))
      : facts.find((f) => f.fieldKey === key);
  return { state: row?.state ?? null, value: row?.value ?? null };
}

export function publishContent(
  listing: ListingRow,
  property: PropertyRow,
  revision: RevisionRow | null,
  facts: readonly FactRow[],
): PublishContent {
  if (hasPendingDraft(listing, revision, facts)) {
    const draft = draftSchema.parse(listing.draft);
    const amount = Number(draft.price);
    return {
      title: draft.title,
      description: draft.description,
      price: {
        state: draft.priceState,
        value:
          draft.priceState === "known" && Number.isFinite(amount)
            ? { amountMinor: Math.round(amount * 100), currency: "EUR" }
            : null,
      },
      area: {
        state: draft.areaState,
        value: draft.areaState === "known" ? { value: Number(draft.area), unit: "m2" } : null,
      },
      bedrooms: {
        state: draft.bedroomsState,
        value: draft.bedroomsState === "known" ? Number(draft.bedrooms) : null,
      },
      // Freezing a draft records the property's settlement as the known location.
      locationKnown: Boolean(property.settlement?.trim()),
      pendingDraft: true,
      rentAmount: null,
    };
  }
  const copy = record(record(revision?.sourceCopy).text);
  const price = termsFacts(revision?.terms).price;
  return {
    title: typeof copy.title === "string" ? copy.title : "",
    description: typeof copy.description === "string" ? copy.description : "",
    price: { state: price?.state ?? null, value: price?.value ?? null },
    area: factOf(facts, "area"),
    bedrooms: factOf(facts, "bedrooms"),
    locationKnown: factOf(facts, "location").state === "known",
    pendingDraft: false,
    rentAmount: rentWithoutPeriod(listing.purpose, revision?.terms),
  };
}

export function checkInput(
  listing: ListingRow,
  property: PropertyRow,
  content: PublishContent,
  photos: readonly PhotoReadiness[],
  rentPeriodConfirmed = false,
): PublishCheckInput {
  return {
    rentAmountWithoutPeriod: content.rentAmount !== null,
    rentPeriodConfirmed,
    propertyType: property.propertyType,
    commercialState: listing.commercialState,
    title: content.title,
    description: content.description,
    priceState: content.price.state,
    locationKnown: content.locationKnown,
    bedroomsState: content.bedrooms.state,
    photos: {
      ready: photos.filter((p) => p === "shown" || p === "clearable").length,
      notReady: photos.filter((p) => p === "not_ready").length,
    },
    placeNames: [property.settlement, property.region, property.neighborhood ?? ""],
    texts: [content.title, content.description],
  };
}

// The listing as one decision sees it.

export interface PublishView {
  readonly listing: ListingRow;
  readonly property: PropertyRow;
  readonly revision: RevisionRow | null;
  readonly facts: readonly FactRow[];
  readonly content: PublishContent;
  readonly photos: readonly { readonly asset: AssetRow; readonly readiness: PhotoReadiness }[];
  readonly checks: PublishChecks;
  /** Locales whose current publication is active. */
  readonly live: readonly PublicLocale[];
  /** Translations a person approved for the approved version; they publish with it. */
  readonly approvedTranslations: readonly PublicLocale[];
  readonly mayPublish: boolean;
  readonly policy: PublicationPolicy;
}

async function placedPhotos(
  db: Executor,
  listing: ListingRow,
  revision: RevisionRow | null,
  pendingDraft: boolean,
) {
  if (pendingDraft) {
    // A draft freeze places the listing's current visible relations.
    return db
      .select({ asset: mediaAssets })
      .from(mediaRelations)
      .innerJoin(mediaAssets, eq(mediaAssets.id, mediaRelations.mediaAssetId))
      .where(
        and(
          eq(mediaRelations.listingId, listing.id),
          eq(mediaRelations.hidden, false),
          isNull(mediaRelations.removedAt),
        ),
      )
      .orderBy(asc(mediaRelations.position));
  }
  if (!revision) return [];
  return db
    .select({ asset: mediaAssets })
    .from(listingRevisionMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, listingRevisionMedia.mediaAssetId))
    .where(eq(listingRevisionMedia.listingRevisionId, revision.id))
    .orderBy(asc(listingRevisionMedia.position));
}
async function latestRevision(db: Executor, listingId: string) {
  const [revision] = await db
    .select()
    .from(listingRevisions)
    .where(eq(listingRevisions.listingId, listingId))
    .orderBy(desc(listingRevisions.revisionNumber))
    .limit(1);
  return revision ?? null;
}

/** Read-only: what one decision would publish for this staff member, and what blocks it. */
export async function publishView(
  db: Executor,
  actor: Actor,
  reference: string,
  policy: PublicationPolicy = publicationPolicy,
): Promise<PublishView> {
  if (actor.kind !== "staff") throw new AppError("forbidden");
  const [listing] = await db
    .select()
    .from(listings)
    .where(eq(listings.reference, reference.trim().toUpperCase()));
  if (!listing) throw new AppError("not_found");
  const resource = { type: "listing", id: listing.id, propertyId: listing.propertyId };
  if (!(await can(db, actor, "listing.read", resource))) throw new AppError("not_found");
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, listing.propertyId));
  if (!property) throw new AppError("not_found");
  const revision = await latestRevision(db, listing.id);
  const facts = revision
    ? await db
        .select()
        .from(propertyFacts)
        .where(eq(propertyFacts.factRevisionId, revision.factRevisionId))
    : [];
  const content = publishContent(listing, property, revision, facts);
  const photos = (await placedPhotos(db, listing, revision, content.pendingDraft)).map(
    ({ asset }) => ({
      asset,
      readiness: photoReadiness(asset),
    }),
  );
  const checks = publishChecks(
    checkInput(
      listing,
      property,
      content,
      photos.map((p) => p.readiness),
    ),
  );
  const pointers = await db
    .select({ locale: currentPublications.locale })
    .from(currentPublications)
    .innerJoin(listings, eq(listings.id, currentPublications.listingId))
    .where(
      and(
        eq(currentPublications.listingId, listing.id),
        eq(currentPublications.state, "active"),
        eq(currentPublications.generation, listings.publicationGeneration),
      ),
    );
  const translations = listing.approvedRevisionId
    ? await db
        .select({ locale: localizedRevisions.locale })
        .from(localizedRevisions)
        .where(
          and(
            eq(localizedRevisions.sourceRevisionId, listing.approvedRevisionId),
            eq(localizedRevisions.state, "approved_for_source"),
          ),
        )
    : [];
  const live = pointers.map((p) => p.locale);
  return {
    listing,
    property,
    revision,
    facts,
    content,
    photos,
    checks,
    live: [...live].sort((a, b) => Number(b === sourceLocale) - Number(a === sourceLocale)),
    approvedTranslations: translations.map((t) => t.locale),
    mayPublish: await can(db, actor, "publication.release", resource),
    policy,
  };
}

// The command.

export interface AttestedPublishInput {
  readonly reference: string;
  /** One per decision: retries of the same decision share it. */
  readonly operationId: string;
  /** The listing version the person checked. */
  readonly expectedVersion: number;
  readonly attested: boolean;
  readonly note?: string;
  /** The staff language the attestation was shown in; its exact text is recorded. */
  readonly locale: StaffLocale;
  /** The person confirmed a rent recorded without its period is per month. */
  readonly rentPeriod?: "month";
  readonly now?: Date;
}

/** Thrown inside a step to stop with a reason the person can act on. */
class Blocked extends Error {
  constructor(
    readonly reason: PublishBlockReason,
    readonly detail?: string,
  ) {
    super(reason);
  }
}

const opId = () => `attested-${randomUUID()}`;

function blockedFrom(error: unknown): Blocked | null {
  if (error instanceof Blocked) return error;
  if (!isAppError(error)) return null;
  const field = Object.entries(error.fieldErrors ?? {})[0];
  const code = field?.[1]?.[0];
  switch (error.code) {
    case "forbidden":
      return new Blocked("no_permission", error.code);
    case "version_conflict":
    case "approval_stale":
      return new Blocked("changed_since_opened", code ?? error.code);
    case "publication_ineligible":
      if (code === "restrict_affected_publications_first")
        return new Blocked("shared_facts_published", code);
      if (code === "seller_instruction_required")
        return new Blocked("seller_documents_required", code);
      if (code === "professional_review_required")
        return new Blocked("professional_review_required", code);
      if (code === "media_not_eligible") return new Blocked("photos_required", code);
      return new Blocked("other", code ?? error.code);
    case "transition_denied":
      if (field?.[0]?.startsWith("fact.")) return new Blocked("facts_incomplete", field[0]);
      return new Blocked("other", code ?? error.code);
    case "validation_failed":
      if (field?.[0] === "title") return new Blocked("title_missing", field[0]);
      return new Blocked("other", field?.[0] ?? error.code);
    default:
      // Step-up, not found and infrastructure failures are not publishing decisions.
      return null;
  }
}

async function reload(db: Executor, listingId: string) {
  const [listing] = await db.select().from(listings).where(eq(listings.id, listingId));
  if (!listing) throw new AppError("not_found");
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, listing.propertyId));
  if (!property) throw new AppError("not_found");
  const revision = await latestRevision(db, listing.id);
  if (!revision) throw new Blocked("title_missing", "no_revision");
  const facts = await db
    .select()
    .from(propertyFacts)
    .where(eq(propertyFacts.factRevisionId, revision.factRevisionId));
  return { listing, property, revision, facts };
}

function recordedFacts(facts: readonly FactRow[], revision: RevisionRow): FactRecord[] {
  return [
    ...facts.map((f) => ({
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
}

/** Required keys with no recorded row at all: stated as unknown rather than left absent. */
function absentRequired(property: PropertyRow, facts: readonly FactRow[]): string[] {
  return requiredFactKeys(property.propertyType).filter(
    (key) =>
      key !== "price" &&
      key !== "location" &&
      !facts.some((f) => f.fieldKey === key || (key === "area" && f.fieldKey.startsWith("area."))),
  );
}

/**
 * The attesting person confirms imported values no one has reviewed yet. Fact rows are
 * immutable, so this records a new fact revision with the same values and that person's review,
 * plus a listing version identical in text, terms, disclosure and photos that binds it. A
 * required fact with no record at all is recorded as unknown, never guessed.
 */
async function confirmImportedFacts(
  db: Executor,
  actor: Actor,
  listingId: string,
  attestationId: string,
  scope: string,
  changes: {
    /** The person confirmed that a rent recorded without its period is per month. */
    readonly rentPeriod?: "month";
    /** Keep this disclosure (location precision) rather than the latest version's. */
    readonly disclosure?: unknown;
  } = {},
) {
  return runOperation(
    db,
    {
      actor,
      type: "listing.facts.confirm",
      idempotencyKey: opId(),
      requestHash: hashRequest({ listingId, attestationId, ...changes }),
    },
    async ({ tx, operationId }) => {
      const [listing] = await tx
        .select()
        .from(listings)
        .where(eq(listings.id, listingId))
        .for("update");
      if (!listing) throw new AppError("not_found");
      await assertCan(tx, actor, "listing.review_facts", {
        type: "property",
        id: listing.propertyId,
        propertyId: listing.propertyId,
      });
      const [property] = await tx
        .select()
        .from(properties)
        .where(eq(properties.id, listing.propertyId))
        .for("update");
      const revision = await latestRevision(tx, listing.id);
      if (!property || !revision) throw new AppError("not_found");
      const facts = await tx
        .select()
        .from(propertyFacts)
        .where(eq(propertyFacts.factRevisionId, revision.factRevisionId));
      const unreviewed = facts.filter((f) =>
        needsHumanReview({
          fieldKey: f.fieldKey,
          state: f.state,
          sourceClass: f.sourceClass,
          reviewedAt: f.reviewedAt?.toISOString() ?? null,
        }),
      );
      const absent = absentRequired(property, facts);
      const rent =
        changes.rentPeriod === "month" ? rentWithoutPeriod(listing.purpose, revision.terms) : null;
      const precision = (value: unknown) => record(value).publicPrecision;
      const disclosure =
        changes.disclosure !== undefined &&
        precision(changes.disclosure) !== precision(revision.disclosure)
          ? changes.disclosure
          : revision.disclosure;
      const factsChange = unreviewed.length > 0 || absent.length > 0;
      if (!factsChange && !rent && disclosure === revision.disclosure)
        return { revisionId: revision.id };
      const now = new Date();
      // The amount stays exactly as recorded; only the period the person confirmed is added.
      const terms = rent
        ? (() => {
            const recorded = record(revision.terms);
            const { "price.amount_without_period": withoutPeriod, ...facts } = record(
              recorded.facts,
            );
            return {
              ...recorded,
              facts: {
                ...facts,
                price: {
                  state: "known",
                  value: {
                    amountMinor: rent.amountMinor,
                    currency: rent.currency,
                    period: "month",
                    basis: "asking",
                  },
                  unit: null,
                  basis: null,
                  sourceClass: record(withoutPeriod).sourceClass ?? "source_supplied",
                  note: `Rent period confirmed per month: ${scope}`,
                },
              },
            };
          })()
        : revision.terms;
      const [latestFacts] = await tx
        .select()
        .from(propertyFactRevisions)
        .where(eq(propertyFactRevisions.propertyId, property.id))
        .orderBy(desc(propertyFactRevisions.revisionNumber))
        .limit(1);
      const rows = [
        ...facts.map(({ id: _id, factRevisionId: _revision, ...fact }) =>
          unreviewed.some((u) => u.id === _id)
            ? { ...fact, reviewScope: scope, reviewedById: actor.id, reviewedAt: now }
            : fact,
        ),
        ...absent.map((fieldKey) => ({
          fieldKey,
          state: "unknown" as const,
          value: null,
          unit: null,
          basis: null,
          sourceClass: facts[0]?.sourceClass ?? ("agency_observed" as const),
          sourceReference: facts[0]?.sourceReference ?? null,
          sourceLanguage: null,
          observedAt: now,
          reviewScope: scope,
          reviewedById: actor.id,
          reviewedAt: now,
          note: null,
        })),
      ];
      const comparable = rows.map((f) => ({
        fieldKey: f.fieldKey,
        state: f.state,
        value: f.value ?? null,
        unit: f.unit ?? null,
        basis: f.basis ?? null,
      }));
      const [factRevision] = !factsChange
        ? [{ id: revision.factRevisionId }]
        : await tx
            .insert(propertyFactRevisions)
            .values({
              propertyId: property.id,
              revisionNumber: (latestFacts?.revisionNumber ?? 0) + 1,
              basedOnRevisionId: revision.factRevisionId,
              contentDigest: sha256Hex(
                canonicalJson({ facts: comparable, reviewedBy: attestationId }),
              ),
              materialChange: absent.length ? "non_material" : "none",
              note: scope,
              createdByKind: actor.kind,
              createdById: actor.id,
            })
            .returning();
      if (!factRevision) throw new Error("Fact revision insert failed");
      if (factsChange)
        await tx
          .insert(propertyFacts)
          .values(rows.map((f) => ({ ...f, factRevisionId: factRevision.id })));
      const placements = await tx
        .select()
        .from(listingRevisionMedia)
        .where(eq(listingRevisionMedia.listingRevisionId, revision.id))
        .orderBy(asc(listingRevisionMedia.position));
      const content = {
        factRevisionId: factRevision.id,
        terms,
        sourceCopy: revision.sourceCopy,
        disclosure,
        media: placements.map((m) => ({
          id: m.mediaRelationId,
          assetId: m.mediaAssetId,
          position: m.position,
        })),
      };
      const [next] = await tx
        .insert(listingRevisions)
        .values({
          listingId: listing.id,
          revisionNumber: listing.latestRevisionNumber + 1,
          factRevisionId: factRevision.id,
          terms,
          sourceCopy: revision.sourceCopy,
          disclosure,
          contentDigest: sha256Hex(canonicalJson(content)),
          createdByKind: actor.kind,
          createdById: actor.id,
        })
        .returning();
      if (!next) throw new Error("Listing revision insert failed");
      if (placements.length)
        await tx.insert(listingRevisionMedia).values(
          placements.map((m) => ({
            listingRevisionId: next.id,
            mediaRelationId: m.mediaRelationId,
            mediaAssetId: m.mediaAssetId,
            position: m.position,
          })),
        );
      await tx
        .update(listings)
        .set({
          latestRevisionNumber: next.revisionNumber,
          editorialState: "draft",
          version: listing.version + 1,
        })
        .where(eq(listings.id, listing.id));
      const payload = {
        attestationId,
        previousRevisionId: revision.id,
        revisionId: next.id,
        factRevisionId: factRevision.id,
        confirmedFacts: unreviewed.map((f) => f.fieldKey),
        recordedUnknown: absent,
        ...(rent ? { rentPeriodConfirmed: "month", rentAmount: rent } : {}),
        ...(disclosure !== revision.disclosure
          ? { keptPublicPrecision: precision(disclosure) }
          : {}),
      };
      await recordAudit(tx, {
        action: "listing.facts.confirmed",
        actor,
        capability: "listing.review_facts",
        recordType: "listing",
        recordId: listing.id,
        operationId,
        payload,
        at: now,
      });
      await recordActivity(tx, {
        recordType: "listing",
        recordId: listing.id,
        reference: listing.reference,
        messageKey: "listing.facts.confirmed",
        params: { count: unreviewed.length },
        summary: `${listing.reference}: imported facts confirmed by staff attestation.`,
        actor,
        operationId,
        at: now,
      });
      return { revisionId: next.id };
    },
  );
}

/** Records the attestation itself, once per decision; every later step refers to it. */
async function recordAttestation(
  db: Executor,
  actor: Actor,
  input: AttestedPublishInput,
  text: string,
) {
  const note = input.note?.trim() || null;
  return runOperation(
    db,
    {
      actor,
      type: "listing.publication.attest",
      idempotencyKey: input.operationId,
      requestHash: hashRequest({
        reference: input.reference,
        attested: true,
        note,
        locale: input.locale,
        expectedVersion: input.expectedVersion,
      }),
      expectedVersion: input.expectedVersion,
    },
    async ({ tx, operationId }) => {
      const [listing] = await tx
        .select()
        .from(listings)
        .where(eq(listings.reference, input.reference.trim().toUpperCase()))
        .for("update");
      if (!listing) throw new AppError("not_found");
      await assertCan(tx, actor, "publication.release", {
        type: "listing",
        id: listing.id,
        propertyId: listing.propertyId,
      });
      // The person decided on the version they saw; a later edit needs a new look.
      if (listing.version !== input.expectedVersion)
        throw new AppError("version_conflict", { current: { version: listing.version } });
      const at = input.now ?? new Date();
      const payload = {
        basis: staffAttestationBasis,
        attestation: text,
        locale: input.locale,
        note,
        listingVersion: listing.version,
        attestedAt: at.toISOString(),
      };
      await recordAudit(tx, {
        action: "listing.publication.attested",
        actor,
        capability: "publication.release",
        recordType: "listing",
        recordId: listing.id,
        operationId,
        payload,
        at,
      });
      await recordActivity(tx, {
        recordType: "listing",
        recordId: listing.id,
        reference: listing.reference,
        messageKey: "listing.publication.attested",
        params: {},
        summary: `${listing.reference}: checked and attested for publishing.`,
        actor,
        operationId,
        at,
      });
      return {
        listingId: listing.id,
        reference: listing.reference,
        attestationId: operationId,
        ...payload,
      };
    },
  );
}

/** A seller instruction whose evidence is the attestation; no document is implied. */
async function recordAttestedInstruction(
  db: Executor,
  actor: Actor,
  listingId: string,
  revision: RevisionRow,
  attestation: { attestationId: string; attestation: string; attestedAt: string },
) {
  return runOperation(
    db,
    {
      actor,
      type: "inventory.instruction.attest",
      idempotencyKey: opId(),
      requestHash: hashRequest({ listingId, revisionId: revision.id, ...attestation }),
    },
    async ({ tx, operationId }) => {
      const [listing] = await tx
        .select()
        .from(listings)
        .where(eq(listings.id, listingId))
        .for("update");
      if (!listing) throw new AppError("not_found");
      await assertCan(tx, actor, "publication.release", {
        type: "listing",
        id: listing.id,
        propertyId: listing.propertyId,
      });
      await tx
        .select({ id: properties.id })
        .from(properties)
        .where(eq(properties.id, listing.propertyId))
        .for("update");
      const now = new Date();
      const recorded = await replaceSellerInstruction(tx, actor, operationId, listing, {
        content: {
          commercialTerms: {
            basis: staffAttestationBasis,
            attestationOperationId: attestation.attestationId,
            attestation: attestation.attestation,
            attestedAt: attestation.attestedAt,
            // Permission belongs to the advertised terms: a later price needs a new decision.
            price: termsFacts(revision.terms).price?.value ?? null,
          },
          disclosure: revision.disclosure,
          mediaUsageRights: { granted: true, basis: staffAttestationBasis },
          representationScope: listing.purpose === "sale" ? "sale" : "letting",
          commissionTerms: "Not recorded in the system: published on a staff attestation.",
          publicationPermission: true,
          expiresAt: null,
        },
        evidenceDocumentIds: [],
        agreedAt: now,
        now,
        history: { basis: staffAttestationBasis, attestationId: attestation.attestationId },
      });
      return recorded;
    },
  );
}

async function validClaimReview(db: Executor, revision: RevisionRow) {
  const [row] = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(
      and(
        eq(approvals.kind, "legal_process_claim"),
        eq(approvals.subjectType, "listing_revision"),
        eq(approvals.subjectId, revision.id),
        eq(approvals.subjectHash, revision.contentDigest),
        eq(approvals.state, "approved"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Publishes the listing's source locale (and any locale whose translation a person approved
 * for this version) on one recorded decision. Returns `published` or the first real blocker.
 * Throws only for what is not a publishing decision: step-up, not found, infrastructure.
 */
export async function publishListingByAttestation(
  db: Executor,
  session: Session,
  input: AttestedPublishInput,
  dependencies: { storage?: FileStorage; policy?: PublicationPolicy } = {},
): Promise<AttestedPublishResult> {
  const policy = dependencies.policy ?? publicationPolicy;
  const reference = input.reference.trim().toUpperCase();
  const blocked = (reason: PublishBlockReason, detail?: string): AttestedPublishResult => ({
    status: "blocked",
    reference,
    reason,
    ...(detail ? { detail } : {}),
  });
  if (session.actor.kind !== "staff") throw new AppError("forbidden");
  const live = await requireLiveSession(db, session);
  // A release decision. The tenant policy says whether an active staff session is enough or a
  // recent sign-in is needed (the detailed review's step-up window).
  if (policy.signIn === "recent") requireFreshAuth(live);
  const actor = live.actor;
  if (!input.attested) return blocked("not_attested");

  const view = await publishView(db, actor, reference, policy);
  if (!view.mayPublish) return blocked("no_permission");
  // The rent period, when the import left it open, is confirmed as part of this decision.
  const rentPeriod = input.rentPeriod === "month" && view.content.rentAmount ? "month" : undefined;
  const checks = rentPeriod
    ? publishChecks(
        checkInput(
          view.listing,
          view.property,
          view.content,
          view.photos.map((p) => p.readiness),
          true,
        ),
      )
    : view.checks;
  const [blocker] = checks.blockers;
  if (blocker) return blocked(blocker);
  if (!view.revision && !view.content.pendingDraft) return blocked("title_missing", "no_revision");
  const text = publishCopy(input.locale).attestation;
  // Under a second-person policy, the author of the content may not publish it alone.
  const author = view.content.pendingDraft ? actor.id : view.revision?.createdById;
  if (policy.independentReview && author === actor.id) return blocked("another_person_required");
  if (policy.photosRequired && view.photos.some((p) => p.readiness === "not_ready"))
    return blocked("photos_required");

  let attestation: Awaited<ReturnType<typeof recordAttestation>>["outcome"];
  try {
    attestation = (await recordAttestation(db, actor, input, text)).outcome;
  } catch (error) {
    const reason = blockedFrom(error);
    if (reason) return blocked(reason.reason, reason.detail);
    throw error;
  }
  const scope = `Staff attestation ${attestation.attestationId}: ${text}`;
  const listingId = attestation.listingId;
  const envelope = () => ({ actor, operationId: opId() });
  const storage = dependencies.storage ? { storage: dependencies.storage } : {};
  let unchanged = true;

  try {
    // 1. A saved draft the latest version does not hold becomes the version to publish.
    let state = await reload(db, listingId).catch((error) => {
      if (error instanceof Blocked && view.content.pendingDraft) return null;
      throw error;
    });
    // Location precision the listing already has (a region-level import stays region-level).
    const keptDisclosure = state?.revision.disclosure;
    if (!state || hasPendingDraft(state.listing, state.revision, state.facts)) {
      const listing = state?.listing ?? view.listing;
      await freezeListingDraft(db, {
        ...envelope(),
        expectedRevision: listing.version,
        reference,
      });
      unchanged = false;
      state = await reload(db, listingId);
    }

    // 2. Claims a professional must check are never covered by the attestation.
    const claims = record(state.revision.sourceCopy).regulatedClaims;
    if (Array.isArray(claims) && claims.length > 0 && !(await validClaimReview(db, state.revision)))
      throw new Blocked("professional_review_required");

    // 3. Imported values no one confirmed: the attesting person confirms them.
    // The confirmed rent period and the kept precision are recorded in the same new version.
    const facts = recordedFacts(state.facts, state.revision);
    const precisionOf = (value: unknown) => record(value).publicPrecision;
    const precisionChanged =
      keptDisclosure !== undefined &&
      precisionOf(keptDisclosure) !== precisionOf(state.revision.disclosure);
    const rentOpen = rentPeriod && rentWithoutPeriod(state.listing.purpose, state.revision.terms);
    if (
      facts.some(needsHumanReview) ||
      absentRequired(state.property, state.facts).length ||
      rentOpen ||
      precisionChanged
    ) {
      await confirmImportedFacts(db, actor, listingId, attestation.attestationId, scope, {
        ...(rentOpen ? { rentPeriod: "month" as const } : {}),
        ...(precisionChanged ? { disclosure: keptDisclosure } : {}),
      });
      unchanged = false;
      state = await reload(db, listingId);
    }

    // 4. Availability: an unconfirmed listing is confirmed by the same decision.
    if (state.listing.commercialState === "confirmation_required") {
      await confirmListingAvailability(db, {
        ...envelope(),
        expectedRevision: state.listing.version,
        reference,
        evidence: scope,
      });
      unchanged = false;
      state = await reload(db, listingId);
    }

    // 5. Factual review of the fact revision this version binds.
    const eligibilityNow = (listing: ListingRow) =>
      currentEligibility(
        db,
        listing,
        sourceLocale,
        listing.publicationGeneration,
        new Date(),
        false,
        policy,
      );
    if (
      state.property.approvedFactRevisionId !== state.revision.factRevisionId ||
      (state.listing.approvedRevisionId === state.revision.id &&
        !(await eligibilityNow(state.listing)).input.factReviewValid)
    ) {
      // A new version of a live listing replaces its facts: take this listing's own old
      // version down first (it goes back up below). Another listing of the same property
      // stays a blocker the person resolves.
      if (
        state.property.approvedFactRevisionId !== state.revision.factRevisionId &&
        (await activePointers(db, listingId)) > 0
      ) {
        await restrictPublication(db, {
          ...envelope(),
          expectedRevision: state.listing.publicationGeneration,
          reference,
          reason: scope,
        });
        state = await reload(db, listingId);
      }
      await approveFactRevision(db, {
        ...envelope(),
        expectedRevision: state.property.version,
        factRevisionId: state.revision.factRevisionId,
        scope,
      });
      unchanged = false;
      state = await reload(db, listingId);
    }

    // 6. Editorial approval of this exact version.
    if (
      state.listing.approvedRevisionId !== state.revision.id ||
      state.listing.editorialState !== "approved_revision"
    ) {
      if (state.listing.editorialState !== "in_review") {
        await submitListingRevision(db, {
          ...envelope(),
          expectedRevision: state.listing.version,
          reference,
          revisionId: state.revision.id,
        });
        state = await reload(db, listingId);
      }
      await approveListingRevision(db, {
        ...envelope(),
        expectedRevision: state.listing.version,
        reference,
        revisionId: state.revision.id,
        note: scope,
      });
      unchanged = false;
      state = await reload(db, listingId);
    }

    // 7. The owner's permission to advertise on these terms.
    if (!(await eligibilityNow(state.listing)).input.sellerInstructionValid) {
      if (policy.sellerEvidence !== "staff_attestation")
        throw new Blocked("seller_documents_required");
      await recordAttestedInstruction(db, actor, listingId, state.revision, attestation);
      unchanged = false;
      state = await reload(db, listingId);
    }

    // 8. Photos: processed photos waiting for a person are cleared by the attestation.
    const placed = await db
      .select({ asset: mediaAssets })
      .from(listingRevisionMedia)
      .innerJoin(mediaAssets, eq(mediaAssets.id, listingRevisionMedia.mediaAssetId))
      .where(eq(listingRevisionMedia.listingRevisionId, state.revision.id))
      .orderBy(asc(listingRevisionMedia.position));
    const title = view.content.title || reference;
    for (const [index, { asset }] of placed.entries()) {
      if (photoReadiness(asset) !== "clearable") continue;
      await reviewMedia(db, {
        session: live,
        recentSignIn: policy.signIn === "recent",
        operationId: opId(),
        expectedRevision: asset.version,
        id: asset.id,
        input: {
          decision: "approve",
          rightsHolder: "Property owner (staff attestation)",
          rightsReference: scope.slice(0, 1000),
          caption: asset.caption ?? "",
          altText: (asset.altText?.trim() || `${title} · ${index + 1}`).slice(0, 1000),
          modification: asset.modification,
          modificationDisclosure: asset.modificationDisclosure ?? "",
          privacyReviewed: true,
          rightsConfirmed: true,
        },
      });
      unchanged = false;
    }

    // 9. Publish each locale that may go public, unless the same content is already live.
    const translations = await db
      .select({ locale: localizedRevisions.locale })
      .from(localizedRevisions)
      .where(
        and(
          eq(localizedRevisions.sourceRevisionId, state.revision.id),
          eq(localizedRevisions.state, "approved_for_source"),
        ),
      );
    const locales: PublicLocale[] = [
      sourceLocale,
      ...translations.map((t) => t.locale).filter((l) => l !== sourceLocale),
    ];
    const published: PublicLocale[] = [];
    for (const locale of locales) {
      const listing = (await reload(db, listingId)).listing;
      const eligibility = await currentEligibility(
        db,
        listing,
        locale,
        listing.publicationGeneration,
        new Date(),
        false,
        policy,
      );
      // A translation without a valid human approval for this version stays unpublished.
      if (locale !== sourceLocale && !eligibility.input.localeApprovedForSource) continue;
      if (
        eligibility.content &&
        (await sameContentLive(db, listing, locale, eligibility.content))
      ) {
        published.push(locale);
        continue;
      }
      const prepared = await prepareManifest(
        db,
        {
          ...envelope(),
          expectedRevision: listing.publicationGeneration,
          reference,
          locale,
        },
        storage,
      );
      await activateManifest(
        db,
        {
          ...envelope(),
          expectedRevision: listing.publicationGeneration,
          manifestId: prepared.outcome.manifestId,
        },
        storage,
      );
      unchanged = false;
      published.push(locale);
    }
    return {
      status: "published",
      reference,
      locales: published,
      unchanged,
      attestationId: attestation.attestationId,
      warnings: checks.warnings,
    };
  } catch (error) {
    const reason = blockedFrom(error);
    if (reason) return blocked(reason.reason, reason.detail);
    throw error;
  }
}

async function activePointers(db: Executor, listingId: string) {
  const rows = await db
    .select({ id: currentPublications.id })
    .from(currentPublications)
    .where(
      and(eq(currentPublications.listingId, listingId), eq(currentPublications.state, "active")),
    );
  return rows.length;
}

async function sameContentLive(
  db: Executor,
  listing: ListingRow,
  locale: PublicLocale,
  content: Parameters<typeof manifestDigest>[0],
) {
  const [row] = await db
    .select({ digest: publicationManifests.contentDigest })
    .from(currentPublications)
    .innerJoin(publicationManifests, eq(publicationManifests.id, currentPublications.manifestId))
    .where(
      and(
        eq(currentPublications.listingId, listing.id),
        eq(currentPublications.locale, locale),
        eq(currentPublications.state, "active"),
        eq(currentPublications.generation, listing.publicationGeneration),
      ),
    );
  return row?.digest === manifestDigest(content);
}

// Bulk carry-over.

export interface ReadyListing {
  readonly reference: string;
  readonly version: number;
  readonly title: string;
  readonly settlement: string;
  readonly price: PublishContent["price"];
  readonly area: PublishContent["area"];
  /** First placed photo with a safe preview, for recognising the listing at a glance. */
  readonly thumbnailId: string | null;
  readonly warnings: PublishChecks["warnings"];
}

/**
 * Listings this person may publish that pass every blocker, are still on the market and are not
 * on the website yet: the legacy import's active listings (confirmation required) and any other
 * unpublished available listing. Archived imports are withdrawn and never qualify.
 */
export async function readyToPublish(
  db: Executor,
  actor: Actor,
  policy: PublicationPolicy = publicationPolicy,
): Promise<ReadyListing[]> {
  if (actor.kind !== "staff") throw new AppError("forbidden");
  const candidates = await db
    .select({ reference: listings.reference, id: listings.id, propertyId: listings.propertyId })
    .from(listings)
    .where(
      and(
        inArray(listings.commercialState, ["available", "confirmation_required"]),
        sql`not exists (select 1 from ${currentPublications}
          where ${currentPublications.listingId} = ${listings.id}
            and ${currentPublications.state} = 'active'
            and ${currentPublications.generation} = ${listings.publicationGeneration})`,
      ),
    )
    .orderBy(asc(listings.reference));
  const ready: ReadyListing[] = [];
  for (const candidate of candidates) {
    const resource = { type: "listing", id: candidate.id, propertyId: candidate.propertyId };
    if (!(await can(db, actor, "publication.release", resource))) continue;
    const view = await publishView(db, actor, candidate.reference, policy);
    if (view.checks.blockers.length) continue;
    ready.push({
      reference: view.listing.reference,
      version: view.listing.version,
      title: view.content.title,
      settlement: view.property.settlement,
      price: view.content.price,
      area: view.content.area,
      thumbnailId:
        view.photos.find((p) => p.readiness === "shown" || p.readiness === "clearable")?.asset.id ??
        null,
      warnings: view.checks.warnings,
    });
  }
  return ready;
}

/** Of these listing ids, the ones a person could publish now without fixing anything first. */
export async function readyListingIds(
  db: Executor,
  actor: Actor,
  ids: readonly string[],
  policy: PublicationPolicy = publicationPolicy,
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: listings.id, reference: listings.reference })
    .from(listings)
    .where(inArray(listings.id, [...ids]));
  const ready = new Set<string>();
  for (const row of rows) {
    const view = await publishView(db, actor, row.reference, policy).catch(() => null);
    if (
      view?.mayPublish &&
      view.checks.blockers.length === 0 &&
      view.live.length === 0 &&
      ["available", "confirmation_required"].includes(view.listing.commercialState)
    )
      ready.add(row.id);
  }
  return ready;
}
