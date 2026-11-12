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
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { type PublicationPolicy, publicationPolicy, type StaffLocale } from "@/config/tenant";
import {
  approvals,
  auditEvents,
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
  sellerInstructions,
} from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import type { Actor, Capability } from "@/domain/capabilities";
import type { FactState } from "@/domain/facts";
import { type PublicLocale, sourceLocale } from "@/domain/ids";
import { type FactRecord, needsHumanReview, requiredFactKeys } from "@/domain/listing-readiness";
import {
  admissionAccepted,
  isLegacyPhotoAwaitingCarryOver,
  isLegacyPhotoLeftOut,
} from "@/domain/media";
import { parseMediaRenditions } from "@/domain/media-rendition";
import {
  type PublishBlocker,
  type PublishCheckInput,
  type PublishChecks,
  publishChecks,
} from "@/domain/publish-checks";
import { framesInlandAsCoast, withoutLegacySuffix } from "@/domain/translation-checks";
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

/** Blockers a person fixes in the detailed review, not in the listing editor. */
export const reviewBlockers: readonly PublishBlockReason[] = [
  "not_available",
  "owner_refused",
  "seller_documents_required",
  "professional_review_required",
  "shared_facts_published",
];

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
      /** This call took the previous version offline before the step that stopped it. */
      readonly previousVersionOffline?: boolean;
    };

// Photos.

/**
 * shown: cleared now · clearable: processed, waiting for a person · not_copied: a photo from the
 * old website whose bytes the carry-over has not brought into storage yet (ADR 0016) ·
 * not_ready · rejected.
 */
export type PhotoReadiness =
  | "shown"
  | "clearable"
  | "not_copied"
  | "left_out"
  | "not_ready"
  | "rejected";

export function photoReadiness(asset: AssetRow): PhotoReadiness {
  if (asset.review === "rejected" || asset.rights === "rejected") return "rejected";
  if (mediaAssetEligible(asset) && !asset.detailsDraft) return "shown";
  if (isLegacyPhotoAwaitingCarryOver(asset)) return "not_copied";
  if (isLegacyPhotoLeftOut(asset)) return "left_out";
  const processed =
    asset.sealedKey &&
    asset.sha256 &&
    admissionAccepted(asset) &&
    asset.scan === "clean" &&
    asset.scannedSha256 === asset.sha256 &&
    asset.scannedAt &&
    asset.scannerVersion &&
    asset.processing === "ready" &&
    parseMediaRenditions(asset.derivativeRenditions, asset.id) &&
    asset.derivativeKey &&
    asset.derivativeSha256 &&
    asset.derivativeContentType === "image/webp";
  // A photo whose details are being edited is left out until a person reviews those details
  // (ADR 0012); the attestation never approves pending text.
  return processed && asset.review !== "approved" && !asset.detailsDraft
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
  /** The title without the old site's brand ending, offered for the person to confirm. */
  readonly cleanedTitle: string | null;
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
      cleanedTitle: null,
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
    cleanedTitle:
      typeof copy.title === "string" ? withoutLegacySuffix(copy.title, sourceLocale) : null,
  };
}

export function checkInput(
  listing: ListingRow,
  property: PropertyRow,
  content: PublishContent,
  photos: readonly PhotoReadiness[],
  rentPeriodConfirmed = false,
  refused = false,
): PublishCheckInput {
  return {
    ownerRefused: refused,
    rentAmountWithoutPeriod: content.rentAmount !== null,
    rentPeriodConfirmed,
    titleSiteSuffix: content.cleanedTitle !== null,
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
      notCopied: photos.filter((p) => p === "not_copied").length,
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
  /** The first approved translation that frames the inland place as a sea, beach or coast one. */
  readonly coastFramedLocale: PublicLocale | null;
  readonly mayPublish: boolean;
  /** The latest agreed seller instruction says the owner does not permit publication. */
  readonly ownerRefused: boolean;
  readonly policy: PublicationPolicy;
}

export async function placedPhotos(
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
export async function latestRevision(db: Executor, listingId: string) {
  const [revision] = await db
    .select()
    .from(listingRevisions)
    .where(eq(listingRevisions.listingId, listingId))
    .orderBy(desc(listingRevisions.revisionNumber))
    .limit(1);
  return revision ?? null;
}

/**
 * Every approved translation of the version is read for the inland-as-coast rule before any
 * step touches the listing: a text that frames Sandanski as a sea, beach or coast place is a
 * blocker the person sees up front, never a stop after the live version went offline.
 */
async function coastFramedTranslation(
  db: Executor,
  property: PropertyRow,
  revision: RevisionRow | null,
): Promise<PublicLocale | null> {
  if (!revision) return null;
  const approved = await db
    .select({
      locale: localizedRevisions.locale,
      title: localizedRevisions.title,
      body: localizedRevisions.body,
    })
    .from(localizedRevisions)
    .where(
      and(
        eq(localizedRevisions.sourceRevisionId, revision.id),
        eq(localizedRevisions.state, "approved_for_source"),
      ),
    );
  for (const row of approved)
    if (
      framesInlandAsCoast(
        [row.locale],
        [property.settlement, property.region, property.neighborhood ?? ""],
        [row.title ?? "", String(record(row.body).description ?? "")],
      )
    )
      return row.locale;
  return null;
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
  const refused = await ownerRefused(db, listing);
  const ownChecks = publishChecks(
    checkInput(
      listing,
      property,
      content,
      photos.map((p) => p.readiness),
      false,
      refused,
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
  const coastFramedLocale = await coastFramedTranslation(db, property, revision);
  const checks: PublishChecks =
    coastFramedLocale && !ownChecks.blockers.includes("inland_framed_as_coast")
      ? { ...ownChecks, blockers: [...ownChecks.blockers, "inland_framed_as_coast"] }
      : ownChecks;
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
    coastFramedLocale,
    mayPublish: await can(db, actor, "publication.release", resource),
    ownerRefused: refused,
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
  /** The person confirmed the title without the old site's brand ending. */
  readonly cleanTitle?: boolean;
  /** The attestation text exactly as shown, when it is not the single-listing sentence (bulk). */
  readonly attestationText?: string;
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
    /** The title without the old site's ending, as the person confirmed it. */
    readonly title?: string;
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
      const copyText = record(record(revision.sourceCopy).text);
      const retitle = changes.title && changes.title !== copyText.title ? changes.title : undefined;
      const sourceCopy = retitle
        ? {
            ...record(revision.sourceCopy),
            text: { ...copyText, title: retitle, legacyTitle: copyText.title },
          }
        : revision.sourceCopy;
      if (!factsChange && !rent && !retitle && disclosure === revision.disclosure)
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
      // A sibling listing of the same property (sale and rental, or two adverts) may already
      // have had these exact values reviewed: bind that approved revision instead of creating a
      // competing one, which would have to take the sibling's publication down.
      const key = (f: (typeof comparable)[number]) => canonicalJson(f);
      const wanted = new Set(comparable.map(key));
      const approvedRows =
        factsChange && property.approvedFactRevisionId
          ? await tx
              .select()
              .from(propertyFacts)
              .where(eq(propertyFacts.factRevisionId, property.approvedFactRevisionId))
          : [];
      const shared =
        approvedRows.length === wanted.size &&
        approvedRows.every(
          (f) =>
            f.reviewedAt !== null ||
            !needsHumanReview({
              fieldKey: f.fieldKey,
              state: f.state,
              sourceClass: f.sourceClass,
              reviewedAt: null,
            }),
        ) &&
        approvedRows.every((f) =>
          wanted.has(
            key({
              fieldKey: f.fieldKey,
              state: f.state,
              value: f.value ?? null,
              unit: f.unit ?? null,
              basis: f.basis ?? null,
            }),
          ),
        )
          ? property.approvedFactRevisionId
          : null;
      const newFacts = factsChange && !shared;
      const [factRevision] = !factsChange
        ? [{ id: revision.factRevisionId }]
        : shared
          ? [{ id: shared }]
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
      if (newFacts)
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
        sourceCopy,
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
          sourceCopy,
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
        ...(retitle ? { titleWithoutSiteEnding: retitle, previousTitle: copyText.title } : {}),
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
      const shown = await latestRevision(tx, listing.id);
      const payload = {
        basis: staffAttestationBasis,
        attestation: text,
        locale: input.locale,
        note,
        listingVersion: listing.version,
        attestedAt: at.toISOString(),
        // What the person saw: every later call compares the listing with this (ADR 0012).
        shown: {
          revisionId: shown?.id ?? null,
          revisionDigest: shown?.contentDigest ?? null,
          draftDigest: sha256Hex(canonicalJson(listing.draft ?? null)),
          disclosure: shown?.disclosure ?? null,
          generation: listing.publicationGeneration,
        },
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
          view.ownerRefused,
        ),
      )
    : view.checks;
  const [blocker] = view.coastFramedLocale
    ? [...checks.blockers, "inland_framed_as_coast" as const]
    : checks.blockers;
  if (blocker)
    return blocked(
      blocker,
      blocker === "inland_framed_as_coast" ? (view.coastFramedLocale ?? undefined) : undefined,
    );
  if (!view.revision && !view.content.pendingDraft) return blocked("title_missing", "no_revision");
  const text = input.attestationText?.trim() || publishCopy(input.locale).attestation;
  // Under a second-person policy, the author of the content may not publish it alone.
  const author = view.content.pendingDraft ? actor.id : view.revision?.createdById;
  if (policy.independentReview && author === actor.id) return blocked("another_person_required");
  if (
    policy.photosRequired &&
    view.photos.some((p) => p.readiness === "not_ready" || p.readiness === "not_copied")
  )
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
  // Set once this call has taken the previous version offline; a later stop must say so.
  let tookOffline = false;
  // A replayed or resumed decision publishes only what the person saw (ADR 0012).
  if (await changedSince(db, listingId, attestation)) return blocked("changed_since_opened");
  // Every permission a later step needs is checked before any step changes anything, so a
  // live version is never taken offline for a step this person cannot finish.
  const needed: Capability[] = ["publication.release", "listing.review_facts"];
  if (view.content.pendingDraft || view.listing.commercialState === "confirmation_required")
    needed.push("listing.edit");
  if (view.photos.some((p) => p.readiness === "clearable")) needed.push("media.manage");
  const resource = {
    type: "listing",
    id: view.listing.id,
    propertyId: view.listing.propertyId,
  };
  for (const capability of needed)
    if (!(await can(db, actor, capability, resource))) return blocked("no_permission", capability);

  try {
    // 1. A saved draft the latest version does not hold becomes the version to publish.
    let state = await reload(db, listingId).catch((error) => {
      if (error instanceof Blocked && view.content.pendingDraft) return null;
      throw error;
    });
    // Location precision the listing had when the person decided (a region-level import stays
    // region-level), also when a publish resumes after its draft was already frozen.
    const keptDisclosure = attestation.shown?.disclosure ?? state?.revision.disclosure ?? undefined;
    if (!state || hasPendingDraft(state.listing, state.revision, state.facts)) {
      const listing = state?.listing ?? view.listing;
      await freezeListingDraft(db, {
        ...envelope(),
        // The version the person saw: an edit since then is a conflict, never published.
        expectedRevision: state ? input.expectedVersion : listing.version,
        reference,
        attestationId: attestation.attestationId,
        ...(keptDisclosure ? { disclosure: keptDisclosure } : {}),
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
      keptDisclosure !== null &&
      precisionOf(keptDisclosure) !== precisionOf(state.revision.disclosure);
    const rentOpen = rentPeriod && rentWithoutPeriod(state.listing.purpose, state.revision.terms);
    const currentTitle = record(record(state.revision.sourceCopy).text).title;
    const cleaned =
      input.cleanTitle && typeof currentTitle === "string"
        ? withoutLegacySuffix(currentTitle, sourceLocale)
        : null;
    if (
      cleaned ||
      facts.some(needsHumanReview) ||
      absentRequired(state.property, state.facts).length ||
      rentOpen ||
      precisionChanged
    ) {
      await confirmImportedFacts(db, actor, listingId, attestation.attestationId, scope, {
        ...(rentOpen ? { rentPeriod: "month" as const } : {}),
        ...(precisionChanged ? { disclosure: keptDisclosure } : {}),
        ...(cleaned ? { title: cleaned } : {}),
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
      if (state.property.approvedFactRevisionId !== state.revision.factRevisionId) {
        // A sibling listing live on the property's current facts would have to go offline
        // first: stop before touching this listing, and say why.
        if (await siblingLive(db, state.listing)) throw new Blocked("shared_facts_published");
        if ((await activePointers(db, listingId)) > 0) {
          await restrictPublication(db, {
            ...envelope(),
            expectedRevision: state.listing.publicationGeneration,
            reference,
            reason: scope,
          });
          tookOffline = true;
          state = await reload(db, listingId);
        }
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

    // 7. The owner's permission to advertise on these terms. A recorded refusal stays a
    // refusal: only a new recorded agreement lifts it, never the attestation.
    if (await ownerRefused(db, state.listing)) throw new Blocked("owner_refused");
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

    // 9. Every language that would go public is read for the inland-as-coast rule first: a
    // text that frames Sandanski as a sea, beach or coast place stops the whole decision.
    const approved = await db
      .select({
        locale: localizedRevisions.locale,
        title: localizedRevisions.title,
        body: localizedRevisions.body,
      })
      .from(localizedRevisions)
      .where(
        and(
          eq(localizedRevisions.sourceRevisionId, state.revision.id),
          eq(localizedRevisions.state, "approved_for_source"),
        ),
      );
    for (const row of approved)
      if (
        framesInlandAsCoast(
          [row.locale],
          [state.property.settlement, state.property.region, state.property.neighborhood ?? ""],
          [row.title ?? "", String(record(row.body).description ?? "")],
        )
      )
        throw new Blocked("inland_framed_as_coast", row.locale);

    // A live language still showing an older version goes offline with it; each language
    // comes back only when it is approved for this version.
    if (await staleLive(db, listingId, state.revision.id)) {
      await restrictPublication(db, {
        ...envelope(),
        expectedRevision: (await reload(db, listingId)).listing.publicationGeneration,
        reference,
        reason: scope,
      });
      tookOffline = true;
    }
    // Publish each locale that may go public, unless the same content is already live.
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
      const outcome = await publishOneLocale(db, actor, listingId, locale, policy, storage);
      if (outcome === "not_approved") continue;
      if (outcome === "published") unchanged = false;
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
    if (reason)
      return {
        ...(blocked(reason.reason, reason.detail) as Extract<
          AttestedPublishResult,
          { status: "blocked" }
        >),
        ...(tookOffline ? { previousVersionOffline: true } : {}),
      };
    throw error;
  }
}

/** The latest recorded seller instruction for the listing says the owner does not permit it. */
export async function ownerRefused(db: Executor, listing: ListingRow): Promise<boolean> {
  const [latest] = await db
    .select({
      state: sellerInstructions.state,
      permission: sellerInstructions.publicationPermission,
      invalidatedAt: sellerInstructions.invalidatedAt,
    })
    .from(sellerInstructions)
    .where(
      and(
        eq(sellerInstructions.propertyId, listing.propertyId),
        isNotNull(sellerInstructions.agreedAt),
        ne(sellerInstructions.state, "draft"),
        or(
          eq(sellerInstructions.listingId, listing.id),
          and(
            isNull(sellerInstructions.listingId),
            inArray(sellerInstructions.representationScope, [
              listing.purpose === "sale" ? "sale" : "letting",
              "sale_and_letting",
            ]),
          ),
        ),
      ),
    )
    .orderBy(desc(sellerInstructions.revisionNumber))
    .limit(1);
  return latest?.state === "agreed" && latest.invalidatedAt === null && latest.permission === false;
}

/** Another listing of the same property is live: replacing the shared facts would hide it. */
async function siblingLive(db: Executor, listing: ListingRow): Promise<boolean> {
  const [row] = await db
    .select({ id: currentPublications.id })
    .from(currentPublications)
    .innerJoin(listings, eq(listings.id, currentPublications.listingId))
    .where(
      and(
        eq(listings.propertyId, listing.propertyId),
        ne(listings.id, listing.id),
        eq(currentPublications.state, "active"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** A live language of this listing shows a version other than the one being published. */
async function staleLive(db: Executor, listingId: string, revisionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: currentPublications.id })
    .from(currentPublications)
    .innerJoin(publicationManifests, eq(publicationManifests.id, currentPublications.manifestId))
    .where(
      and(
        eq(currentPublications.listingId, listingId),
        eq(currentPublications.state, "active"),
        ne(publicationManifests.listingRevisionId, revisionId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Whether the listing changed since the person decided, beyond this decision's own steps: its
 * saved draft, a version written by someone else, or an unpublish or restriction that was not
 * part of this decision. Checked on every call, including a replay or a resume.
 */
async function changedSince(
  db: Executor,
  listingId: string,
  attestation: {
    attestationId: string;
    attestedAt: string;
    shown?: {
      draftDigest: string;
      revisionId: string | null;
      revisionDigest?: string | null;
    } | null;
  },
): Promise<boolean> {
  const shown = attestation.shown;
  if (!shown) return false;
  const [listing] = await db.select().from(listings).where(eq(listings.id, listingId));
  if (!listing) return true;
  if (sha256Hex(canonicalJson(listing.draft ?? null)) !== shown.draftDigest) return true;
  const since = new Date(attestation.attestedAt);
  // The versions written since the one the person saw must all be this decision's own steps
  // (the draft freeze and the fact confirmation, both recorded with the attestation id), and
  // the version they saw must still carry the content digest they saw. An edit by the same
  // person after the decision is a change like anyone else's.
  const [seen] = shown.revisionId
    ? await db.select().from(listingRevisions).where(eq(listingRevisions.id, shown.revisionId))
    : [];
  if (shown.revisionId && !seen) return true;
  if (seen && shown.revisionDigest && seen.contentDigest !== shown.revisionDigest) return true;
  const later = await db
    .select({ id: listingRevisions.id })
    .from(listingRevisions)
    .where(
      and(
        eq(listingRevisions.listingId, listingId),
        seen ? gt(listingRevisions.revisionNumber, seen.revisionNumber) : undefined,
      ),
    );
  if (later.length > 0) {
    const own = await db
      .select({ payload: auditEvents.payload })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.recordId, listingId),
          inArray(auditEvents.action, ["listing.revision.created", "listing.facts.confirmed"]),
        ),
      );
    const ownIds = new Set(
      own
        .map((row) => record(row.payload))
        .filter((payload) => payload.attestationId === attestation.attestationId)
        .map((payload) => payload.revisionId),
    );
    if (later.some((row) => !ownIds.has(row.id))) return true;
  }
  const removals = await db
    .select({ action: auditEvents.action, payload: auditEvents.payload })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.recordId, listingId),
        inArray(auditEvents.action, ["publication.withdraw", "publication.restrict"]),
        gt(auditEvents.occurredAt, since),
      ),
    );
  return removals.some(
    (row) =>
      row.action === "publication.withdraw" ||
      !String(record(row.payload).reason ?? "").includes(attestation.attestationId),
  );
}

/**
 * Publishes one locale of the listing's approved version, unless the same content is already
 * live. A translation without a valid human approval for this version stays unpublished.
 */
export async function publishOneLocale(
  db: Executor,
  actor: Actor,
  listingId: string,
  locale: PublicLocale,
  policy: PublicationPolicy,
  storage: { storage?: FileStorage },
): Promise<"live" | "published" | "not_approved"> {
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
  if (locale !== sourceLocale && !eligibility.input.localeApprovedForSource) return "not_approved";
  if (eligibility.content && (await sameContentLive(db, listing, locale, eligibility.content)))
    return "live";
  const prepared = await prepareManifest(
    db,
    {
      actor,
      operationId: opId(),
      expectedRevision: listing.publicationGeneration,
      reference: listing.reference,
      locale,
    },
    storage,
  );
  await activateManifest(
    db,
    {
      actor,
      operationId: opId(),
      expectedRevision: listing.publicationGeneration,
      manifestId: prepared.outcome.manifestId,
    },
    storage,
  );
  return "published";
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
  /** The title without the old site's ending, when it has one. */
  readonly cleanedTitle: string | null;
  readonly settlement: string;
  readonly price: PublishContent["price"];
  readonly area: PublishContent["area"];
  /** Photos the decision will show or clear: every one is stated on the row. */
  readonly photoCount: number;
  /** First placed photo with a safe preview, for recognising the listing at a glance. */
  readonly thumbnailId: string | null;
  readonly warnings: PublishChecks["warnings"];
}

/** A page of the "Ready to publish" view: a page of candidates is read per request. */
export const readyPageSize = 20;
/** Candidates read per request however few of them are ready (each costs one full view). */
export const readyExamineCap = 60;

export interface ReadyPage {
  readonly rows: ReadyListing[];
  /** Pass back to continue after the last listing read; null when nothing is left to read. */
  readonly nextCursor: string | null;
  /** Unpublished available listings after this page, ready or not: not looked at yet. */
  readonly remaining: number;
}

const referencePattern = /^[A-Z]{2}-[0-9A-Z-]{1,40}$/;

/** Several references separated by spaces or commas, or part of a title. */
export function referenceTokens(query: string): string[] {
  return [...new Set(query.split(/[\s,;]+/u).filter(Boolean))].slice(0, 100);
}

/**
 * Listings matching a typed search: any pasted reference (or part of one), or the typed text
 * inside the latest title. A literal, case-insensitive substring search, never a pattern.
 */
export function listingSearchClause(query: string | undefined) {
  const text = query?.trim() ?? "";
  if (!text) return undefined;
  const tokens = referenceTokens(text);
  const references = tokens.map(
    (token) => sql`strpos(lower(${listings.reference}), lower(${token})) > 0`,
  );
  const title = sql`strpos(lower(coalesce((select r.source_copy->'text'->>'title'
      from ${listingRevisions} r where r.listing_id = ${listings.id}
      order by r.revision_number desc limit 1), '')), lower(${text})) > 0`;
  return or(...references, title);
}

const unpublished = sql`not exists (select 1 from ${currentPublications}
  where ${currentPublications.listingId} = ${listings.id}
    and ${currentPublications.state} = 'active'
    and ${currentPublications.generation} = ${listings.publicationGeneration})`;

/**
 * One page of listings this person may publish that pass every blocker, are still on the market
 * and are not on the website yet: the legacy import's active listings (confirmation required)
 * and any other unpublished available listing. Archived imports are withdrawn and never
 * qualify. At most `readyExamineCap` candidates are read per request, so the cost is bounded
 * however many listings wait; `nextCursor` continues after the last one read.
 */
export async function readyToPublish(
  db: Executor,
  actor: Actor,
  options: {
    readonly limit?: number;
    readonly cursor?: string | null;
    readonly query?: string;
    readonly policy?: PublicationPolicy;
  } = {},
): Promise<ReadyPage> {
  if (actor.kind !== "staff") throw new AppError("forbidden");
  const policy = options.policy ?? publicationPolicy;
  const limit = Math.min(Math.max(options.limit ?? readyPageSize, 1), 50);
  const after = options.cursor && referencePattern.test(options.cursor) ? options.cursor : null;
  const match = and(
    inArray(listings.commercialState, ["available", "confirmation_required"]),
    unpublished,
    listingSearchClause(options.query),
  );
  const rows: ReadyListing[] = [];
  let last: string | null = after;
  let examined = 0;
  let exhausted = false;
  // Keyset batches in reference order until a page of ready listings, the examine cap, or the end.
  while (rows.length < limit && examined < readyExamineCap) {
    const wanted = Math.min(limit, readyExamineCap - examined);
    const batch = await db
      .select({ reference: listings.reference, id: listings.id, propertyId: listings.propertyId })
      .from(listings)
      .where(and(match, last ? gt(listings.reference, last) : undefined))
      .orderBy(asc(listings.reference))
      .limit(wanted);
    for (const candidate of batch) {
      last = candidate.reference;
      examined += 1;
      const resource = { type: "listing", id: candidate.id, propertyId: candidate.propertyId };
      if (!(await can(db, actor, "publication.release", resource))) continue;
      // A person may release a listing yet not read it (a restricted listing among the others):
      // that listing is left out of the list instead of failing the page for everyone.
      const view = await publishView(db, actor, candidate.reference, policy).catch((error) => {
        if (error instanceof AppError && error.code === "not_found") return null;
        throw error;
      });
      if (!view || view.checks.blockers.length) continue;
      rows.push({
        reference: view.listing.reference,
        version: view.listing.version,
        title: view.content.title,
        cleanedTitle: view.content.cleanedTitle,
        settlement: view.property.settlement,
        price: view.content.price,
        area: view.content.area,
        photoCount: view.photos.filter(
          (p) => p.readiness === "shown" || p.readiness === "clearable",
        ).length,
        thumbnailId:
          view.photos.find((p) => p.readiness === "shown" || p.readiness === "clearable")?.asset
            .id ?? null,
        warnings: view.checks.warnings,
      });
      if (rows.length >= limit) break;
    }
    // A short batch is the end of the matches.
    if (batch.length < wanted) {
      exhausted = true;
      break;
    }
  }
  if (exhausted || last === null) return { rows, nextCursor: null, remaining: 0 };
  const [left] = await db
    .select({ count: sql<number>`count(*)::integer` })
    .from(listings)
    .where(and(match, gt(listings.reference, last)));
  const remaining = left?.count ?? 0;
  return { rows, nextCursor: remaining > 0 ? last : null, remaining };
}

/**
 * For each listing id this person may publish and that is not online yet: ready (nothing to fix)
 * or the first thing to fix. Listings outside that are left out. At most `examine` ids are read,
 * and reading stops once `readyCap` ready listings are found; `capped` says some were not read.
 */
export async function listingPublishStatus(
  db: Executor,
  actor: Actor,
  ids: readonly string[],
  policy: PublicationPolicy = publicationPolicy,
  bound: { readonly examine: number; readonly readyCap: number } = { examine: 40, readyCap: 30 },
): Promise<{
  status: Map<string, { ready: boolean; blocker?: PublishBlockReason }>;
  capped: boolean;
  /** Ids that were read; the rest were not looked at. */
  examinedIds: Set<string>;
}> {
  const status = new Map<string, { ready: boolean; blocker?: PublishBlockReason }>();
  const examinedIds = new Set<string>();
  if (ids.length === 0) return { status, capped: false, examinedIds };
  const rows = await db
    .select({ id: listings.id, reference: listings.reference })
    .from(listings)
    .where(inArray(listings.id, [...ids]))
    .orderBy(asc(listings.reference));
  let ready = 0;
  for (const row of rows) {
    if (examinedIds.size >= bound.examine || ready >= bound.readyCap)
      return { status, capped: true, examinedIds };
    examinedIds.add(row.id);
    const view = await publishView(db, actor, row.reference, policy).catch(() => null);
    if (
      !view?.mayPublish ||
      view.live.length > 0 ||
      !["available", "confirmation_required"].includes(view.listing.commercialState)
    )
      continue;
    const [blocker] = view.checks.blockers;
    status.set(row.id, blocker ? { ready: false, blocker } : { ready: true });
    if (!blocker) ready += 1;
  }
  return { status, capped: false, examinedIds };
}

// A selection of listings on one attestation.

export type BulkPublishItem = (
  | {
      readonly status: "published";
      readonly warnings: PublishChecks["warnings"];
      readonly locales: readonly PublicLocale[];
    }
  | {
      readonly status: "blocked";
      readonly reason: PublishBlockReason;
      readonly previousVersionOffline: boolean;
    }
  | { readonly status: "not_attempted" }
) & {
  readonly reference: string;
  /** The Bulgarian title as last saved, for naming the listing in the result. */
  readonly title: string;
};

/**
 * Publishes each selected listing as its own decision, one result per listing. One failure
 * never hides the listings already published: it is that listing's result, and the run goes on.
 * A session error (signed out, step-up needed) stops the run: that listing and every one after
 * it are "not attempted", because nothing was done for them.
 */
export async function publishSelection(
  db: Executor,
  session: Session,
  input: {
    readonly selection: readonly { readonly reference: string; readonly expectedVersion: number }[];
    /** One per submission: each listing's decision key is derived from it, so a retry resumes. */
    readonly operationId: string;
    readonly locale: StaffLocale;
    readonly cleanTitle: boolean;
    /** The attestation text exactly as it was shown for the whole selection. */
    readonly attestationText: string;
  },
  dependencies: { storage?: FileStorage; policy?: PublicationPolicy } = {},
): Promise<BulkPublishItem[]> {
  const references = input.selection.map((item) => item.reference.trim().toUpperCase());
  const titles = new Map<string, string>();
  if (references.length) {
    const rows = await db
      .select({ reference: listings.reference, id: listings.id })
      .from(listings)
      .where(inArray(listings.reference, references));
    for (const row of rows) {
      const revision = await latestRevision(db, row.id);
      const title = record(record(revision?.sourceCopy).text).title;
      titles.set(row.reference, typeof title === "string" ? title : "");
    }
  }
  const out: BulkPublishItem[] = [];
  let stopped = false;
  for (const item of input.selection) {
    const reference = item.reference.trim().toUpperCase();
    const title = titles.get(reference) ?? "";
    if (stopped) {
      out.push({ status: "not_attempted", reference, title });
      continue;
    }
    try {
      const result = await publishListingByAttestation(
        db,
        session,
        {
          reference,
          operationId: `${input.operationId}:${reference}`,
          expectedVersion: item.expectedVersion,
          attested: true,
          locale: input.locale,
          cleanTitle: input.cleanTitle,
          attestationText: input.attestationText,
        },
        dependencies,
      );
      out.push(
        result.status === "published"
          ? {
              status: "published",
              reference,
              title,
              warnings: result.warnings,
              locales: result.locales,
            }
          : {
              status: "blocked",
              reference,
              title,
              reason: result.reason,
              previousVersionOffline: result.previousVersionOffline === true,
            },
      );
    } catch (error) {
      if (
        isAppError(error) &&
        (error.code === "unauthenticated" || error.code === "step_up_required")
      ) {
        stopped = true;
        out.push({ status: "not_attempted", reference, title });
      } else {
        // An unexpected failure is that listing's result, never a silent one: the operation id
        // and listing reference say where to look; no message text, which may carry data.
        console.error(
          `[publish-bulk] operation=${input.operationId} listing=${reference} unexpected ${
            error instanceof Error ? error.name : typeof error
          }${isAppError(error) ? ` code=${error.code}` : ""}`,
        );
        out.push({
          status: "blocked",
          reference,
          title,
          reason: "other",
          previousVersionOffline: false,
        });
      }
    }
  }
  return out;
}
