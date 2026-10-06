// Staff inventory preparation. Saving a working draft never grants approval or changes live
// facts. Freezing it creates new immutable fact/listing revisions; publication is separate.
import "server-only";
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  currentPublications,
  destinationDeliveries,
  documents,
  documentVersions,
  inquiries,
  listingRevisionMedia,
  listingRevisions,
  listingSearchDocuments,
  listings,
  mediaAssets,
  mediaRelations,
  parties,
  properties,
  propertyFactRevisions,
  propertyFacts,
  propertyRelationships,
  publicationManifests,
  referenceSequences,
  sellerInstructions,
} from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import type { Actor } from "@/domain/capabilities";
import type { FactState } from "@/domain/facts";
import { formatListingReference } from "@/domain/ids";
import { availabilityReviewIntervalDays } from "@/domain/listing";
import { representationScopes } from "@/domain/seller-instruction";
import { recordActivity } from "../activity";
import { recordAudit } from "../audit";
import { assertCan, can, resolveGrants } from "../authz";
import { hashRequest, sha256Hex } from "../crypto";
import type { Executor, Transaction } from "../db";
import { AppError } from "../errors";
import { recordOutboxEvent } from "../jobs/outbox";
import { runOperation } from "../operations";
import { loadPublishedListings, termsFacts } from "../publication/presentation";
import { nextReference } from "../references";
import {
  createListingSchema,
  draftSchema,
  type ListingDraft,
  type PriceDecision,
  priceDecisionSchema,
} from "./contracts";
import { uneditablePriceEvidence } from "./working-draft";

export interface InventoryCommand {
  actor: Actor;
  operationId: string;
  expectedRevision: number;
}
const envelope = z.object({
  operationId: z.string().min(8).max(160),
  expectedRevision: z.int().nonnegative(),
});
const saveDraftEnvelope = envelope.extend({ priceDecision: priceDecisionSchema.optional() });
export type SaveListingDraftCommand = InventoryCommand & {
  reference: string;
  draft: unknown;
  priceDecision?: PriceDecision;
};
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".");
      errors[key] ??= [];
      errors[key].push(issue.message);
    }
    throw new AppError("validation_failed", { fieldErrors: errors });
  }
  return result.data;
}
async function human(db: Executor, actor: Actor) {
  if (actor.kind !== "staff") throw new AppError("forbidden");
  // A per-record check follows for existing records; this establishes active membership.
  const grants = await resolveGrants(db, actor);
  if (grants.length === 0) throw new AppError("forbidden");
}
async function load(db: Executor, actor: Actor, reference: string, lock = false) {
  const query = db.select().from(listings).where(eq(listings.reference, reference.toUpperCase()));
  const [listing] = await (lock ? query.for("update") : query);
  if (
    !listing ||
    !(await can(db, actor, "listing.read", {
      type: "listing",
      id: listing.id,
      propertyId: listing.propertyId,
    }))
  ) {
    throw new AppError("not_found");
  }
  return listing;
}
async function edited(db: Executor, actor: Actor, reference: string, lock = false) {
  const listing = await load(db, actor, reference, lock);
  await assertCan(db, actor, "listing.edit", {
    type: "listing",
    id: listing.id,
    propertyId: listing.propertyId,
  });
  return listing;
}
function version(current: number, expected: number) {
  if (current !== expected)
    throw new AppError("version_conflict", { current: { version: current } });
}
async function history(
  tx: Transaction,
  actor: Actor,
  operationId: string,
  listing: { id: string; reference: string },
  action: string,
  payload: Record<string, unknown>,
  activityParams: Record<string, unknown> = {},
) {
  await recordAudit(tx, {
    action,
    actor,
    recordType: "listing",
    recordId: listing.id,
    operationId,
    payload,
  });
  await recordActivity(tx, {
    actor,
    operationId,
    recordType: "listing",
    recordId: listing.id,
    reference: listing.reference,
    messageKey: action,
    summary: `${listing.reference}: ${action}`,
    params: activityParams,
    audience: "internal",
  });
}

export async function createListingDraft(
  db: Executor,
  command: InventoryCommand & { input: unknown },
) {
  parse(envelope, command);
  const input = parse(createListingSchema, command.input);
  await human(db, command.actor);
  await assertCan(db, command.actor, "listing.edit");
  return runOperation(
    db,
    {
      actor: command.actor,
      type: "inventory.create",
      idempotencyKey: command.operationId,
      requestHash: hashRequest({ input, expectedRevision: command.expectedRevision }),
    },
    async ({ tx, operationId }) => {
      await assertCan(tx, command.actor, "listing.edit");
      version(0, command.expectedRevision);
      const [property] = await tx
        .insert(properties)
        .values({
          reference: await nextReference(tx, "property"),
          propertyType: input.propertyType,
          country: input.country,
          region: input.region,
          settlement: input.settlement,
          exactAddress: input.exactAddress || null,
          publicPrecision: "settlement",
        })
        .returning();
      if (!property) throw new Error("Property insert failed");
      const [sequence] = await tx
        .insert(referenceSequences)
        .values({ kind: "listing", year: 0, lastValue: 1 })
        .onConflictDoUpdate({
          target: [referenceSequences.kind, referenceSequences.year],
          set: { lastValue: sql`${referenceSequences.lastValue} + 1` },
        })
        .returning({ value: referenceSequences.lastValue });
      if (!sequence) throw new Error("Listing reference allocation failed");
      const [listing] = await tx
        .insert(listings)
        .values({
          reference: formatListingReference(sequence.value),
          propertyId: property.id,
          purpose: input.purpose,
          draft: input.draft,
        })
        .returning();
      if (!listing) throw new Error("Listing insert failed");
      await history(tx, command.actor, operationId, listing, "listing.draft.created", {
        propertyId: property.id,
      });
      return { reference: listing.reference, version: listing.version };
    },
  );
}

// These precondition failures must roll back the operation receipt too. runOperation
// retains AppError failures, so convert this private error only after its transaction exits.
class DraftPriceValidation extends Error {
  constructor(readonly validation: AppError) {
    super("Draft price decision failed");
  }
}

async function checkDraftPrice(
  db: Executor,
  listing: typeof listings.$inferSelect,
  draft: ListingDraft,
  decision: PriceDecision | undefined,
) {
  const storedDraftValid = draftSchema.safeParse(listing.draft).success;
  if (storedDraftValid && !decision) return;
  const [revision] = await db
    .select()
    .from(listingRevisions)
    .where(eq(listingRevisions.listingId, listing.id))
    .orderBy(desc(listingRevisions.revisionNumber))
    .limit(1);
  const evidence = uneditablePriceEvidence(revision);
  if (decision) {
    if (
      draft.priceState !== "unknown" ||
      !revision ||
      evidence.length === 0 ||
      decision.sourceRevisionId !== revision.id
    ) {
      throw new DraftPriceValidation(
        new AppError("validation_failed", {
          fieldErrors: {
            priceDecision: ["Review the current source price before choosing to retain unknown."],
          },
        }),
      );
    }
    return;
  }
  if (evidence.length === 0) return;
  if (draft.priceState === "unknown") {
    throw new DraftPriceValidation(
      new AppError("validation_failed", {
        fieldErrors: {
          priceDecision: [
            "Correct the price or explicitly choose to retain unknown for this source.",
          ],
        },
      }),
    );
  }
  // A claimed correction must contain an editable amount, not just a different state.
  if (draft.priceState === "known" || draft.priceState === "conflicting") {
    try {
      factValue(draft.priceState, draft.price, "price", (n) => n);
    } catch (error) {
      if (error instanceof AppError) throw new DraftPriceValidation(error);
      throw error;
    }
    return;
  }
  throw new DraftPriceValidation(
    new AppError("validation_failed", {
      fieldErrors: {
        priceState: [
          "Existing source price evidence cannot be replaced with this state. Enter a corrected known or conflicting price, or explicitly retain unknown.",
        ],
      },
    }),
  );
}

export async function saveListingDraft(db: Executor, command: SaveListingDraftCommand) {
  const { priceDecision } = parse(saveDraftEnvelope, command);
  const draft = parse(draftSchema, command.draft);
  await human(db, command.actor);
  await edited(db, command.actor, command.reference);
  try {
    return await runOperation(
      db,
      {
        actor: command.actor,
        type: "inventory.draft.save",
        idempotencyKey: command.operationId,
        requestHash: hashRequest({
          reference: command.reference,
          draft,
          expectedRevision: command.expectedRevision,
          ...(priceDecision ? { priceDecision } : {}),
        }),
      },
      async ({ tx, operationId }) => {
        const listing = await edited(tx, command.actor, command.reference, true);
        version(listing.version, command.expectedRevision);
        await checkDraftPrice(tx, listing, draft, priceDecision);
        await tx
          .update(listings)
          .set({ draft, version: listing.version + 1 })
          .where(eq(listings.id, listing.id));
        const decisionHistory = priceDecision ? { priceDecision } : {};
        await history(
          tx,
          command.actor,
          operationId,
          listing,
          "listing.draft.saved",
          { newVersion: listing.version + 1, ...decisionHistory },
          decisionHistory,
        );
        return { reference: listing.reference, version: listing.version + 1 };
      },
    );
  } catch (error) {
    if (error instanceof DraftPriceValidation) throw error.validation;
    throw error;
  }
}

function scalar(value: string, key: string, integer: boolean) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new AppError("validation_failed", {
      fieldErrors: { [key]: ["Use a non-negative number, with at most two decimal places."] },
    });
  if (key === "price") {
    const [whole = "0", fraction = ""] = value.split(".");
    const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    if (minor > BigInt(Number.MAX_SAFE_INTEGER))
      throw new AppError("validation_failed", { fieldErrors: { price: ["Amount is too large."] } });
    return Number(minor);
  }
  const n = Number(value);
  if (key === "area" && n <= 0)
    throw new AppError("validation_failed", { fieldErrors: { area: ["Area must be positive."] } });
  if (!Number.isSafeInteger(Math.round(n * 100)) || (integer && !Number.isInteger(n))) {
    throw new AppError("validation_failed", {
      fieldErrors: { [key]: ["Use a valid whole number."] },
    });
  }
  return n;
}
function factValue(state: FactState, raw: string, key: string, transform: (n: number) => unknown) {
  if (state !== "known" && state !== "conflicting") return null;
  const parts = state === "conflicting" ? raw.split("|").map((s) => s.trim()) : [raw];
  if (state === "conflicting" && parts.length < 2)
    throw new AppError("validation_failed", {
      fieldErrors: { [key]: ["Record at least two conflicting values separated by |."] },
    });
  const values = parts.map((p) => transform(scalar(p, key, key === "bedrooms")));
  return state === "conflicting" ? values : values[0];
}
function factsOf(draft: ListingDraft, property: typeof properties.$inferSelect) {
  return [
    {
      fieldKey: "location",
      state: "known" as const,
      value: {
        country: property.country,
        region: property.region,
        settlement: property.settlement,
        precision: "settlement",
      },
      unit: null,
      basis: null,
    },
    {
      fieldKey: `area.${draft.areaBasis}`,
      state: draft.areaState,
      value: factValue(draft.areaState, draft.area, "area", (n) => ({
        value: n,
        unit: "m2",
        basis: draft.areaBasis,
      })),
      unit: "m2",
      basis: draft.areaBasis,
    },
    {
      fieldKey: "bedrooms",
      state: draft.bedroomsState,
      value: factValue(draft.bedroomsState, draft.bedrooms, "bedrooms", (n) => n),
      unit: null,
      basis: null,
    },
  ].map((f) => ({
    ...f,
    sourceClass: draft.sourceClass,
    sourceReference: draft.sourceReference,
    sourceLanguage: draft.sourceLanguage,
  }));
}

export async function freezeListingDraft(
  db: Executor,
  command: InventoryCommand & { reference: string },
) {
  parse(envelope, command);
  await human(db, command.actor);
  await edited(db, command.actor, command.reference);
  return runOperation(
    db,
    {
      actor: command.actor,
      type: "inventory.revision.create",
      idempotencyKey: command.operationId,
      requestHash: hashRequest({
        reference: command.reference,
        expectedRevision: command.expectedRevision,
      }),
    },
    async ({ tx, operationId }) => {
      const listing = await edited(tx, command.actor, command.reference, true);
      version(listing.version, command.expectedRevision);
      const draft = parse(draftSchema, listing.draft);
      if (!draft.title || !draft.description)
        throw new AppError("validation_failed", {
          fieldErrors: { title: ["Title and description are required for a review candidate."] },
        });
      const [property] = await tx
        .select()
        .from(properties)
        .where(eq(properties.id, listing.propertyId))
        .for("update");
      if (!property) throw new AppError("not_found");
      const facts = factsOf(draft, property);
      const [latest] = await tx
        .select()
        .from(propertyFactRevisions)
        .where(eq(propertyFactRevisions.propertyId, property.id))
        .orderBy(desc(propertyFactRevisions.revisionNumber))
        .limit(1);
      const [factRevision] = await tx
        .insert(propertyFactRevisions)
        .values({
          propertyId: property.id,
          revisionNumber: (latest?.revisionNumber ?? 0) + 1,
          basedOnRevisionId: latest?.id,
          contentDigest: sha256Hex(canonicalJson(facts)),
          materialChange: latest ? "material" : "initial",
          note: draft.brokerNote || null,
          createdByKind: command.actor.kind,
          createdById: command.actor.id,
        })
        .returning();
      if (!factRevision) throw new Error("Fact revision insert failed");
      await tx
        .insert(propertyFacts)
        .values(facts.map((f) => ({ ...f, factRevisionId: factRevision.id })));
      const terms = {
        purpose: listing.purpose,
        facts: {
          price: {
            state: draft.priceState,
            value: factValue(draft.priceState, draft.price, "price", (n) => ({
              amountMinor: n,
              currency: "EUR",
              period: listing.purpose === "sale" ? "total" : "month",
              basis: "asking",
            })),
            sourceClass: draft.sourceClass,
            sourceReference: draft.sourceReference,
          },
        },
      };
      const sourceCopy = {
        locale: "bg",
        text: { title: draft.title, description: draft.description },
      };
      const disclosure = { publicPrecision: "settlement" };
      const media = await tx
        .select()
        .from(mediaRelations)
        .where(
          and(
            eq(mediaRelations.listingId, listing.id),
            eq(mediaRelations.hidden, false),
            sql`${mediaRelations.removedAt} is null`,
          ),
        )
        .orderBy(mediaRelations.position);
      const content = {
        factRevisionId: factRevision.id,
        terms,
        sourceCopy,
        disclosure,
        media: media.map((m) => ({ id: m.id, assetId: m.mediaAssetId, position: m.position })),
      };
      const [revision] = await tx
        .insert(listingRevisions)
        .values({
          listingId: listing.id,
          revisionNumber: listing.latestRevisionNumber + 1,
          factRevisionId: factRevision.id,
          terms,
          sourceCopy,
          disclosure,
          contentDigest: sha256Hex(canonicalJson(content)),
          createdByKind: command.actor.kind,
          createdById: command.actor.id,
        })
        .returning();
      if (!revision) throw new Error("Listing revision insert failed");
      if (media.length)
        await tx.insert(listingRevisionMedia).values(
          media.map((m, position) => ({
            listingRevisionId: revision.id,
            mediaRelationId: m.id,
            mediaAssetId: m.mediaAssetId,
            position,
          })),
        );
      await tx
        .update(listings)
        .set({
          latestRevisionNumber: revision.revisionNumber,
          editorialState: "draft",
          version: listing.version + 1,
        })
        .where(eq(listings.id, listing.id));
      await history(tx, command.actor, operationId, listing, "listing.revision.created", {
        revisionId: revision.id,
        factRevisionId: factRevision.id,
      });
      return {
        reference: listing.reference,
        revisionId: revision.id,
        factRevisionId: factRevision.id,
        version: listing.version + 1,
      };
    },
  );
}

/** Staff records a real availability confirmation; no timer or AI can call this. */
export async function confirmListingAvailability(
  db: Executor,
  command: InventoryCommand & { reference: string; evidence: string },
) {
  parse(envelope, command);
  const evidence = parse(z.string().trim().min(5).max(2000), command.evidence);
  await human(db, command.actor);
  await edited(db, command.actor, command.reference);
  return runOperation(
    db,
    {
      actor: command.actor,
      type: "inventory.availability.confirm",
      idempotencyKey: command.operationId,
      requestHash: hashRequest({
        reference: command.reference,
        evidence,
        expectedRevision: command.expectedRevision,
      }),
    },
    async ({ tx, operationId }) => {
      const listing = await edited(tx, command.actor, command.reference, true);
      version(listing.version, command.expectedRevision);
      // A closed/sold/let/reserved listing needs its dedicated evidenced transition.
      if (!["available", "confirmation_required"].includes(listing.commercialState))
        throw new AppError("transition_denied");
      const now = new Date();
      await tx
        .update(listings)
        .set({
          commercialState: "available",
          availabilityBasis: evidence,
          availabilityConfirmedAt: now,
          availabilityConfirmedById: command.actor.id,
          freshnessState: "current_under_policy",
          reviewDueAt: new Date(
            now.getTime() + availabilityReviewIntervalDays[listing.purpose] * 86_400_000,
          ),
          version: listing.version + 1,
        })
        .where(eq(listings.id, listing.id));
      await history(tx, command.actor, operationId, listing, "listing.availability.confirmed", {
        evidence,
        confirmedAt: now.toISOString(),
      });
      return { reference: listing.reference, version: listing.version + 1 };
    },
  );
}

const instructionInput = z.object({
  partyId: z.uuid(),
  documentVersionId: z.uuid(),
  commissionTerms: z.string().trim().min(1).max(4000),
  representationScope: z.enum(representationScopes),
  agreedAt: z.iso.datetime(),
  publicationPermission: z.boolean(),
  mediaUsageGranted: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
});

async function reviewedDocument(
  tx: Executor,
  actor: Actor,
  propertyId: string,
  versionId: string,
  purpose: string,
  now: Date,
) {
  const [document] = await tx
    .select({ record: documents, version: documentVersions })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(eq(documentVersions.id, versionId))
    .for("share");
  if (!document || document.record.propertyId !== propertyId) throw new AppError("not_found");
  await assertCan(tx, actor, "document.read_restricted", {
    type: "document",
    id: document.record.id,
    ...(document.record.caseId ? { caseId: document.record.caseId } : {}),
  });
  if (
    document.version.state !== "reviewed" ||
    document.version.scan !== "clean" ||
    document.version.reviewType !== "accepted_for_purpose" ||
    document.version.versionNumber !== document.record.currentVersionNumber ||
    document.version.supersededByVersionId !== null ||
    !document.version.scannedAt ||
    !document.version.scannerVersion ||
    document.version.scannedSha256 !== document.version.sha256 ||
    (document.record.expiresAt !== null && document.record.expiresAt <= now) ||
    document.record.purpose !== purpose ||
    !document.version.sha256 ||
    !document.version.sealedKey
  )
    throw new AppError("transition_denied");
  return document;
}

/** An explicit evidence review, never inferred from a contact match or an uploaded file. */
export async function reviewSellerAuthority(
  db: Executor,
  command: InventoryCommand & {
    reference: string;
    partyId: string;
    documentVersionId: string;
    role: "seller" | "landlord" | "authorized_representative";
    note: string;
  },
) {
  parse(envelope, command);
  parse(
    z.object({
      partyId: z.uuid(),
      documentVersionId: z.uuid(),
      role: z.enum(["seller", "landlord", "authorized_representative"]),
      note: z.string().trim().min(5).max(2000),
    }),
    command,
  );
  await human(db, command.actor);
  const current = await edited(db, command.actor, command.reference);
  await assertCan(db, command.actor, "listing.review_facts", {
    type: "property",
    id: current.propertyId,
    propertyId: current.propertyId,
  });
  return runOperation(
    db,
    {
      actor: command.actor,
      type: "inventory.authority.review",
      idempotencyKey: command.operationId,
      requestHash: hashRequest({
        reference: command.reference,
        partyId: command.partyId,
        documentVersionId: command.documentVersionId,
        role: command.role,
        note: command.note,
        expectedRevision: command.expectedRevision,
      }),
    },
    async ({ tx, operationId }) => {
      const listing = await edited(tx, command.actor, command.reference, true);
      version(listing.version, command.expectedRevision);
      await assertCan(tx, command.actor, "listing.review_facts", {
        type: "property",
        id: listing.propertyId,
        propertyId: listing.propertyId,
      });
      const related = await tx
        .select()
        .from(inquiries)
        .where(eq(inquiries.partyId, command.partyId));
      let visible = false;
      for (const inquiry of related)
        if (
          await can(tx, command.actor, "inquiry.read", {
            type: "inquiry",
            id: inquiry.id,
            ...(inquiry.caseId ? { caseId: inquiry.caseId } : {}),
          })
        ) {
          visible = true;
          break;
        }
      if (!visible) throw new AppError("not_found");
      const [party] = await tx.select().from(parties).where(eq(parties.id, command.partyId));
      if (!party || party.mergedIntoPartyId) throw new AppError("not_found");
      const now = new Date();
      const document = await reviewedDocument(
        tx,
        command.actor,
        listing.propertyId,
        command.documentVersionId,
        "seller_authority",
        now,
      );
      const [relationship] = await tx
        .insert(propertyRelationships)
        .values({
          propertyId: listing.propertyId,
          partyId: party.id,
          role: command.role,
          authority: "reviewed",
          authorityReviewedById: command.actor.id,
          authorityReviewedAt: now,
          validFrom: now,
          expiresAt: document.record.expiresAt,
          scope: {
            documentVersionId: document.version.id,
            digest: document.version.sha256,
            reviewNote: command.note,
          },
        })
        .returning();
      if (!relationship) throw new Error("Authority insert failed");
      await tx
        .update(listings)
        .set({ version: listing.version + 1 })
        .where(eq(listings.id, listing.id));
      await history(tx, command.actor, operationId, listing, "seller.authority.reviewed", {
        relationshipId: relationship.id,
        partyId: party.id,
        documentVersionId: document.version.id,
        digest: document.version.sha256,
        note: command.note,
      });
      return {
        reference: listing.reference,
        relationshipId: relationship.id,
        version: listing.version + 1,
      };
    },
  );
}
/** Records evidence already reviewed by staff; it never invents consent, title or legal approval. */
export async function recordSellerInstruction(
  db: Executor,
  command: InventoryCommand & { reference: string; input: unknown },
) {
  parse(envelope, command);
  const input = parse(instructionInput, command.input);
  await human(db, command.actor);
  await edited(db, command.actor, command.reference);
  return runOperation(
    db,
    {
      actor: command.actor,
      type: "inventory.instruction.record",
      idempotencyKey: command.operationId,
      requestHash: hashRequest({
        input,
        reference: command.reference,
        expectedRevision: command.expectedRevision,
      }),
    },
    async ({ tx, operationId }) => {
      const listing = await edited(tx, command.actor, command.reference, true);
      version(listing.version, command.expectedRevision);
      // Serialize property-wide instruction numbers, including separate sale/rental listings.
      await tx
        .select({ id: properties.id })
        .from(properties)
        .where(eq(properties.id, listing.propertyId))
        .for("update");
      const now = new Date();
      if (new Date(input.agreedAt) > now || (input.expiresAt && new Date(input.expiresAt) <= now))
        throw new AppError("validation_failed");
      const [relationship] = await tx
        .select()
        .from(propertyRelationships)
        .where(
          and(
            eq(propertyRelationships.propertyId, listing.propertyId),
            eq(propertyRelationships.partyId, input.partyId),
            eq(propertyRelationships.authority, "reviewed"),
            sql`${propertyRelationships.revokedAt} is null`,
            sql`${propertyRelationships.validFrom} <= ${now.toISOString()}::timestamptz`,
            sql`(${propertyRelationships.expiresAt} is null or ${propertyRelationships.expiresAt} > ${now.toISOString()}::timestamptz)`,
          ),
        )
        .limit(1);
      if (
        !relationship ||
        !["seller", "landlord", "authorized_representative"].includes(relationship.role)
      )
        throw new AppError("transition_denied");
      const document = await reviewedDocument(
        tx,
        command.actor,
        listing.propertyId,
        input.documentVersionId,
        "seller_instruction",
        now,
      );
      const [revision] = await tx
        .select()
        .from(listingRevisions)
        .where(eq(listingRevisions.listingId, listing.id))
        .orderBy(desc(listingRevisions.revisionNumber))
        .limit(1);
      if (!revision) throw new AppError("transition_denied");
      const price = termsFacts(revision.terms).price;
      if (!price || !["known", "withheld"].includes(price.state))
        throw new AppError("transition_denied");
      const [previous] = await tx
        .select()
        .from(sellerInstructions)
        .where(eq(sellerInstructions.propertyId, listing.propertyId))
        .orderBy(desc(sellerInstructions.revisionNumber))
        .limit(1);
      const [effective] = await tx
        .select({ id: sellerInstructions.id })
        .from(sellerInstructions)
        .where(
          and(
            eq(sellerInstructions.propertyId, listing.propertyId),
            isNotNull(sellerInstructions.agreedAt),
            sql`${sellerInstructions.state} <> 'draft'`,
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
      const content = {
        commercialTerms: {
          price: price.value ?? null,
          sellerPartyId: input.partyId,
          authorityRelationshipId: relationship.id,
          agreement: { documentVersionId: document.version.id, digest: document.version.sha256 },
        },
        disclosure: revision.disclosure,
        mediaUsageRights: { granted: input.mediaUsageGranted },
        representationScope: input.representationScope,
        commissionTerms: input.commissionTerms,
        publicationPermission: input.publicationPermission,
        expiresAt: input.expiresAt,
      };
      const [instruction] = await tx
        .insert(sellerInstructions)
        .values({
          ...content,
          reference: await nextReference(tx, "seller_instruction"),
          propertyId: listing.propertyId,
          listingId: listing.id,
          supersedesId: effective?.id ?? null,
          revisionNumber: (previous?.revisionNumber ?? 0) + 1,
          state: "agreed",
          contentDigest: sha256Hex(canonicalJson(content)),
          evidenceDocumentIds: [document.record.id],
          agreedAt: new Date(input.agreedAt),
          recordedById: command.actor.id,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        })
        .returning();
      if (!instruction) throw new Error("Instruction insert failed");
      const reason = `Seller instruction replaced by ${instruction.reference}`;
      const superseded = await tx
        .update(sellerInstructions)
        .set({
          state: "superseded",
          invalidatedAt: now,
          invalidationReason: reason,
          version: sql`${sellerInstructions.version} + 1`,
        })
        .where(
          and(
            eq(sellerInstructions.propertyId, listing.propertyId),
            eq(sellerInstructions.listingId, listing.id),
            eq(sellerInstructions.state, "agreed"),
            sql`${sellerInstructions.id} <> ${instruction.id}`,
          ),
        )
        .returning({ id: sellerInstructions.id });
      // New consent changes the publication dependency even if it still permits exposure.
      // Fence every old prepared manifest, and atomically remove active local projections.
      // Legacy property-wide instructions remain available to unaffected sibling listings;
      // currentSellerEvidence resolves their replacement separately for this exact listing.
      const generation = listing.publicationGeneration + 1;
      const pointers = await tx
        .select()
        .from(currentPublications)
        .where(
          and(
            eq(currentPublications.listingId, listing.id),
            eq(currentPublications.state, "active"),
          ),
        )
        .for("update");
      await tx
        .update(listings)
        .set({ version: listing.version + 1, publicationGeneration: generation })
        .where(eq(listings.id, listing.id));
      if (pointers.length > 0) {
        await tx
          .update(currentPublications)
          .set({
            state: "restricted",
            reason,
            restrictedAt: now,
            version: sql`${currentPublications.version} + 1`,
          })
          .where(
            inArray(
              currentPublications.id,
              pointers.map((pointer) => pointer.id),
            ),
          );
      }
      await tx
        .delete(listingSearchDocuments)
        .where(eq(listingSearchDocuments.listingId, listing.id));
      for (const pointer of pointers) {
        const local = pointer.destination === "website";
        if (
          local &&
          (await loadPublishedListings(tx, { ids: [listing.id] }, pointer.locale)).length > 0
        )
          throw new Error(`Read-back still shows ${listing.reference}.`);
        await tx.insert(destinationDeliveries).values({
          manifestId: pointer.manifestId,
          listingId: listing.id,
          locale: pointer.locale,
          destination: pointer.destination,
          kind: "withdraw",
          generation,
          state: local ? "withdrawn" : "queued",
          ...(local
            ? { verifiedAt: now, evidence: { method: "read_back", instructionId: instruction.id } }
            : {}),
        });
      }
      await recordOutboxEvent(tx, {
        eventType: "publication.restricted",
        subjectType: "listing",
        subjectId: listing.id,
        payload: {
          locales: pointers.map((pointer) => pointer.locale),
          instructionId: instruction.id,
        },
        sourceGeneration: generation,
        operationId,
      });
      await history(tx, command.actor, operationId, listing, "seller.instruction.recorded", {
        instructionId: instruction.id,
        supersedesId: effective?.id ?? null,
        supersededInstructionIds: superseded.map((row) => row.id),
        previousGeneration: listing.publicationGeneration,
        generation,
        restrictedPointerIds: pointers.map((pointer) => pointer.id),
        partyId: input.partyId,
        documentVersionId: document.version.id,
        sealedDigest: document.version.sha256,
      });
      return {
        reference: listing.reference,
        instructionId: instruction.id,
        version: listing.version + 1,
        generation,
      };
    },
  );
}

export async function inventoryList(db: Executor, actor: Actor) {
  await human(db, actor);
  const rows = await db
    .select({ listing: listings, property: properties })
    .from(listings)
    .innerJoin(properties, eq(properties.id, listings.propertyId))
    .orderBy(desc(listings.updatedAt))
    .limit(200);
  const visible = await Promise.all(
    rows.map(async (row) =>
      (await can(db, actor, "listing.read", {
        type: "listing",
        id: row.listing.id,
        propertyId: row.property.id,
      }))
        ? row
        : null,
    ),
  );
  return visible.filter((row) => row !== null);
}
export async function inventoryDetail(db: Executor, actor: Actor, reference: string) {
  await human(db, actor);
  const listing = await load(db, actor, reference);
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, listing.propertyId));
  if (!property) throw new AppError("not_found");
  const [revision] = await db
    .select()
    .from(listingRevisions)
    .where(eq(listingRevisions.listingId, listing.id))
    .orderBy(desc(listingRevisions.revisionNumber))
    .limit(1);
  const publications = await db
    .select()
    .from(currentPublications)
    .where(eq(currentPublications.listingId, listing.id));
  const manifests = await db
    .select()
    .from(publicationManifests)
    .where(eq(publicationManifests.listingId, listing.id))
    .orderBy(desc(publicationManifests.createdAt))
    .limit(5);
  const instructions = await db
    .select()
    .from(sellerInstructions)
    .where(eq(sellerInstructions.propertyId, property.id))
    .orderBy(desc(sellerInstructions.revisionNumber))
    .limit(5);
  const media = await db
    .select({ relation: mediaRelations, asset: mediaAssets })
    .from(mediaRelations)
    .innerJoin(mediaAssets, eq(mediaAssets.id, mediaRelations.mediaAssetId))
    .where(eq(mediaRelations.listingId, listing.id));
  const facts = revision
    ? await db
        .select()
        .from(propertyFacts)
        .where(eq(propertyFacts.factRevisionId, revision.factRevisionId))
    : [];
  return {
    listing,
    property,
    revision: revision ?? null,
    publications,
    manifests,
    instructions,
    media,
    facts,
  };
}

export async function inventoryEvidence(db: Executor, actor: Actor, reference: string) {
  await human(db, actor);
  const listing = await load(db, actor, reference);
  const now = new Date();
  const candidates = await db
    .select({ record: documents, version: documentVersions })
    .from(documents)
    .innerJoin(
      documentVersions,
      and(
        eq(documentVersions.documentId, documents.id),
        eq(documentVersions.versionNumber, documents.currentVersionNumber),
      ),
    )
    .where(eq(documents.propertyId, listing.propertyId));
  const eligible = [];
  for (const candidate of candidates) {
    const d = candidate.record,
      v = candidate.version;
    if (
      v.state !== "reviewed" ||
      v.scan !== "clean" ||
      v.reviewType !== "accepted_for_purpose" ||
      !v.sha256 ||
      !v.sealedKey ||
      !v.scannerVersion ||
      !v.scannedAt ||
      v.scannedSha256 !== v.sha256 ||
      v.supersededByVersionId ||
      (d.expiresAt && d.expiresAt <= now)
    )
      continue;
    if (
      !(await can(db, actor, "document.read_restricted", {
        type: "document",
        id: d.id,
        ...(d.caseId ? { caseId: d.caseId } : {}),
      }))
    )
      continue;
    eligible.push({
      id: d.id,
      versionId: v.id,
      reference: d.reference,
      fileName: v.fileName,
      purpose: d.purpose,
      version: v.versionNumber,
    });
  }
  const relationships = await db
    .select({
      id: propertyRelationships.id,
      partyId: parties.id,
      name: parties.displayName,
      role: propertyRelationships.role,
    })
    .from(propertyRelationships)
    .innerJoin(parties, eq(parties.id, propertyRelationships.partyId))
    .where(
      and(
        eq(propertyRelationships.propertyId, listing.propertyId),
        eq(propertyRelationships.authority, "reviewed"),
        sql`${propertyRelationships.revokedAt} is null`,
        sql`${propertyRelationships.validFrom} <= ${now.toISOString()}::timestamptz`,
        sql`(${propertyRelationships.expiresAt} is null or ${propertyRelationships.expiresAt} > ${now.toISOString()}::timestamptz)`,
      ),
    );
  return { documents: eligible, relationships };
}
