// Publication fixtures for integration tests only: places, a publishable listing (reviewed facts,
// an in-review revision, an eligible photo, an agreed seller instruction, optional approved
// translations) and a helper that publishes it through the real human commands. Fictional
// data only.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  approvals,
  geographyPlaceAliases,
  geographyPlaces,
  listingRevisionMedia,
  listingRevisions,
  listings,
  localizedRevisions,
  mediaAssets,
  mediaRelations,
  properties,
  propertyFactRevisions,
  propertyFacts,
  sellerInstructions,
} from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import type { Actor } from "@/domain/capabilities";
import type {
  FactState,
  ListingPurpose,
  LocationPrecision,
  PropertyType,
  SourceClass,
} from "@/domain/facts";
import type { PublicLocale } from "@/domain/ids";
import type { CommercialState, EditorialState } from "@/domain/listing";
import { sha256Hex } from "../crypto";
import type { Executor } from "../db";
import {
  activateManifest,
  approveFactRevision,
  approveListingRevision,
  localizedRevisionDigest,
  prepareManifest,
} from "./commands";

let sequence = 0;
const next = () => {
  sequence += 1;
  return sequence;
};
const opId = () => `op-${randomUUID()}`;

export async function insertPlace(
  db: Executor,
  values: {
    id?: string;
    level: "country" | "district" | "municipality" | "settlement";
    parentId: string | null;
    nameNative: string;
    nameLatin: string;
    aliases?: readonly string[];
  },
): Promise<string> {
  const [row] = await db
    .insert(geographyPlaces)
    .values({
      ...(values.id ? { id: values.id } : {}),
      level: values.level,
      parentId: values.parentId,
      countryCode: "BG",
      slug: `${values.level}-${values.nameLatin.toLowerCase()}-${next()}`,
      nameNative: values.nameNative,
      nameLatin: values.nameLatin,
    })
    .returning({ id: geographyPlaces.id });
  if (!row) throw new Error("place insert failed");
  if (values.aliases?.length) {
    await db
      .insert(geographyPlaceAliases)
      .values(
        values.aliases.map((name) => ({ placeId: row.id, kind: "transliteration" as const, name })),
      );
  }
  return row.id;
}

export interface PlaceFixture {
  readonly districtId: string;
  readonly municipalityId: string;
  readonly settlementId: string;
}

export async function createPlaces(
  db: Executor,
  names: { settlement: [string, string]; municipality: [string, string] } = {
    settlement: ["Сандански", "Sandanski"],
    municipality: ["Сандански", "Sandanski"],
  },
): Promise<PlaceFixture> {
  const districtId = await insertPlace(db, {
    level: "district",
    parentId: null,
    nameNative: "Благоевград",
    nameLatin: "Blagoevgrad",
  });
  const municipalityId = await insertPlace(db, {
    level: "municipality",
    parentId: districtId,
    nameNative: names.municipality[0],
    nameLatin: names.municipality[1],
  });
  const settlementId = await insertPlace(db, {
    level: "settlement",
    parentId: municipalityId,
    nameNative: names.settlement[0],
    nameLatin: names.settlement[1],
  });
  return { districtId, municipalityId, settlementId };
}

export interface FactFixture {
  readonly state: FactState;
  readonly value?: unknown;
  readonly unit?: string;
  readonly basis?: string;
  readonly sourceClass?: SourceClass;
  /** Default true: a person reviewed the value. */
  readonly reviewed?: boolean;
}

export const eur = (euros: number) => ({
  amountMinor: Math.round(euros * 100),
  currency: "EUR",
  period: "total",
  basis: "asking",
});

export const defaultFacts: Readonly<Record<string, FactFixture>> = {
  bedrooms: { state: "known", value: 2 },
  rooms: { state: "known", value: 3 },
  "area.living": { state: "known", value: { value: 68, unit: "m2", basis: "living" }, unit: "m2" },
  location: { state: "known", value: { country: "BG" } },
  "feature.lift": { state: "known", value: true },
  "feature.step_free_access": { state: "unknown" },
};

export interface ListingFixtureOptions {
  readonly reviewerId: string;
  readonly placeId?: string | null;
  readonly propertyType?: PropertyType;
  readonly purpose?: ListingPurpose;
  readonly commercialState?: CommercialState;
  /** Default: yesterday for an available listing, otherwise none. */
  readonly availabilityConfirmedAt?: Date | null;
  readonly editorialState?: EditorialState;
  readonly price?: FactFixture;
  readonly facts?: Readonly<Record<string, FactFixture>>;
  readonly title?: string;
  readonly description?: string;
  readonly precision?: LocationPrecision;
  readonly neighborhood?: string;
  /** Approved translations of revision 1. */
  readonly translations?: Partial<Record<PublicLocale, { title: string; description: string }>>;
  /** Number of eligible photos; default 1. */
  readonly photos?: number;
  readonly sellerInstruction?: boolean;
  readonly regulatedClaims?: readonly string[];
}

export interface ListingFixture {
  readonly listingId: string;
  readonly reference: string;
  readonly propertyId: string;
  readonly factRevisionId: string;
  readonly revisionId: string;
  readonly assetIds: readonly string[];
}

function storedFact(factRevisionId: string, fieldKey: string, f: FactFixture, reviewerId: string) {
  const reviewed = f.reviewed !== false;
  const at = new Date("2026-09-01T09:00:00Z");
  return {
    factRevisionId,
    fieldKey,
    state: f.state,
    value: f.state === "known" || f.state === "conflicting" ? (f.value ?? null) : null,
    unit: f.unit ?? null,
    basis: f.basis ?? null,
    sourceClass: f.sourceClass ?? ("agency_observed" as const),
    observedAt: at,
    reviewScope: reviewed ? "fixture" : null,
    reviewedById: reviewed ? reviewerId : null,
    reviewedAt: reviewed ? at : null,
  };
}

export async function createListingFixture(
  db: Executor,
  options: ListingFixtureOptions,
): Promise<ListingFixture> {
  const n = next();
  const purpose = options.purpose ?? "sale";
  const commercialState = options.commercialState ?? "available";
  const confirmedAt =
    options.availabilityConfirmedAt !== undefined
      ? options.availabilityConfirmedAt
      : commercialState === "available"
        ? new Date(Date.now() - 86_400_000)
        : null;
  const [property] = await db
    .insert(properties)
    .values({
      reference: `PR-2026-${String(900_000 + n)}`,
      propertyType: options.propertyType ?? "apartment",
      placeId: options.placeId ?? null,
      country: "BG",
      region: "Blagoevgrad",
      settlement: "Sandanski",
      neighborhood: options.neighborhood ?? "Center",
      exactAddress: "Fixture street 1 (private)",
      latitude: "41.566700",
      longitude: "23.283300",
      publicPrecision: options.precision ?? "settlement",
    })
    .returning({ id: properties.id });
  if (!property) throw new Error("property insert failed");
  const facts = options.facts ?? defaultFacts;
  const [factRevision] = await db
    .insert(propertyFactRevisions)
    .values({
      propertyId: property.id,
      revisionNumber: 1,
      contentDigest: sha256Hex(canonicalJson(facts)),
      materialChange: "initial",
      createdByKind: "staff",
      createdById: options.reviewerId,
    })
    .returning({ id: propertyFactRevisions.id });
  if (!factRevision) throw new Error("fact revision insert failed");
  const factRows = Object.entries(facts).map(([key, f]) =>
    storedFact(factRevision.id, key, f, options.reviewerId),
  );
  if (factRows.length) await db.insert(propertyFacts).values(factRows);

  const reference = `MS-${String(70_000 + n).padStart(5, "0")}`;
  const [listing] = await db
    .insert(listings)
    .values({
      reference,
      propertyId: property.id,
      purpose,
      commercialState,
      availabilityBasis:
        commercialState === "reserved_with_recorded_basis" ? "Signed preliminary agreement" : null,
      availabilityConfirmedAt: confirmedAt,
      availabilityConfirmedById: confirmedAt ? options.reviewerId : null,
      editorialState: options.editorialState ?? "in_review",
      latestRevisionNumber: 1,
    })
    .returning({ id: listings.id });
  if (!listing) throw new Error("listing insert failed");

  const price = options.price ?? { state: "known", value: eur(95_000) };
  const terms = {
    purpose,
    facts: {
      price: {
        state: price.state,
        value: price.state === "known" ? (price.value ?? null) : null,
        unit: null,
        basis: null,
        note: null,
      },
    },
  };
  const sourceCopy = {
    locale: "bg",
    text: {
      title: options.title ?? `Апартамент ${reference}`,
      description: options.description ?? "Светъл апартамент в Сандански, вътрешен град.",
    },
    ...(options.regulatedClaims ? { regulatedClaims: options.regulatedClaims } : {}),
  };
  const disclosure = { publicPrecision: options.precision ?? "settlement" };
  const [revision] = await db
    .insert(listingRevisions)
    .values({
      listingId: listing.id,
      revisionNumber: 1,
      factRevisionId: factRevision.id,
      terms,
      sourceCopy,
      disclosure,
      contentDigest: sha256Hex(canonicalJson({ terms, sourceCopy, disclosure, n })),
      createdByKind: "staff",
      createdById: options.reviewerId,
    })
    .returning({ id: listingRevisions.id });
  if (!revision) throw new Error("revision insert failed");

  const assetIds: string[] = [];
  for (let position = 0; position < (options.photos ?? 1); position++) {
    const key = `${reference}-${position}-${randomUUID()}`;
    const [asset] = await db
      .insert(mediaAssets)
      .values({
        propertyId: property.id,
        purpose: "listing_gallery",
        kind: "photo",
        originalKey: `staging/${key}.webp`,
        sealedKey: `sealed/${key}`,
        sha256: sha256Hex(key),
        contentType: "image/webp",
        byteSize: 1000,
        width: 1600,
        height: 1200,
        scan: "clean",
        processing: "ready",
        rights: "cleared",
        rightsReference: "Owner media licence (fixture)",
        audience: "public_candidate",
        review: "approved",
        reviewedById: options.reviewerId,
        altText: `Photo ${position + 1}`,
      })
      .returning({ id: mediaAssets.id });
    if (!asset) throw new Error("asset insert failed");
    const [relation] = await db
      .insert(mediaRelations)
      .values({ listingId: listing.id, mediaAssetId: asset.id, position })
      .returning({ id: mediaRelations.id });
    if (!relation) throw new Error("relation insert failed");
    await db.insert(listingRevisionMedia).values({
      listingRevisionId: revision.id,
      mediaRelationId: relation.id,
      mediaAssetId: asset.id,
      position,
    });
    assetIds.push(asset.id);
  }

  if (options.sellerInstruction !== false) {
    await db.insert(sellerInstructions).values({
      reference: `SI-2026-${String(900_000 + n)}`,
      propertyId: property.id,
      listingId: listing.id,
      revisionNumber: 1,
      state: "agreed",
      commercialTerms: { price: price.value ?? null },
      disclosure,
      mediaUsageRights: { granted: true },
      representationScope: purpose === "sale" ? "sale" : "letting",
      commissionTerms: "Commission as agreed in the fixture brokerage agreement.",
      publicationPermission: true,
      contentDigest: sha256Hex(`instruction-${n}`),
      evidenceDocumentIds: ["fixture-agreement"],
      agreedAt: new Date("2026-09-01T09:00:00Z"),
      recordedById: options.reviewerId,
    });
  }

  for (const [locale, copy] of Object.entries(options.translations ?? {})) {
    await approveTranslation(db, {
      listingId: listing.id,
      sourceRevisionId: revision.id,
      locale: locale as PublicLocale,
      title: copy.title,
      body: { description: copy.description },
      reviewerId: options.reviewerId,
    });
  }

  return {
    listingId: listing.id,
    reference,
    propertyId: property.id,
    factRevisionId: factRevision.id,
    revisionId: revision.id,
    assetIds,
  };
}

/** A human-approved localized revision with its language approval (the S2 review flow). */
export async function approveTranslation(
  db: Executor,
  input: {
    listingId: string;
    sourceRevisionId: string;
    locale: PublicLocale;
    title: string;
    body: Record<string, unknown>;
    reviewerId: string;
  },
): Promise<string> {
  const [row] = await db
    .insert(localizedRevisions)
    .values({
      listingId: input.listingId,
      sourceRevisionId: input.sourceRevisionId,
      locale: input.locale,
      state: "reviewing",
      title: input.title,
      body: input.body,
    })
    .returning();
  if (!row) throw new Error("localized revision insert failed");
  const [approval] = await db
    .insert(approvals)
    .values({
      kind: "language",
      state: "approved",
      subjectType: "localized_revision",
      subjectId: row.id,
      subjectVersion: row.version,
      subjectHash: localizedRevisionDigest(row),
      requestedByKind: "staff",
      requestedById: input.reviewerId,
      decidedByKind: "staff",
      decidedById: input.reviewerId,
      decidedWithCapability: "translation.review",
      decidedAt: new Date(),
    })
    .returning({ id: approvals.id });
  if (!approval) throw new Error("approval insert failed");
  await db
    .update(localizedRevisions)
    .set({
      state: "approved_for_source",
      reviewedById: input.reviewerId,
      reviewedAt: new Date(),
      approvalId: approval.id,
      reviewedFacts: { price: true, area: true, reference: true },
    })
    .where(eq(localizedRevisions.id, row.id));
  return row.id;
}

export async function listingVersion(db: Executor, listingId: string) {
  const [row] = await db
    .select({ version: listings.version, generation: listings.publicationGeneration })
    .from(listings)
    .where(eq(listings.id, listingId));
  if (!row) throw new Error("listing not found");
  return row;
}

/** Reviews facts, approves revision 1 and publishes it on the website in each locale. */
export async function publishForTest(
  db: Executor,
  actor: Actor,
  fixture: ListingFixture,
  locales: readonly PublicLocale[] = ["bg"],
): Promise<string[]> {
  const [property] = await db
    .select({ version: properties.version })
    .from(properties)
    .where(eq(properties.id, fixture.propertyId));
  if (!property) throw new Error("property not found");
  await approveFactRevision(db, {
    actor,
    operationId: opId(),
    expectedRevision: property.version,
    factRevisionId: fixture.factRevisionId,
    scope: "All facts against the fixture's sources",
  });
  await approveListingRevision(db, {
    actor,
    operationId: opId(),
    expectedRevision: (await listingVersion(db, fixture.listingId)).version,
    reference: fixture.reference,
    revisionId: fixture.revisionId,
  });
  return publishLocales(db, actor, fixture, locales);
}

/** Prepares and activates a manifest per locale; returns the manifest ids. */
export async function publishLocales(
  db: Executor,
  actor: Actor,
  fixture: { reference: string; listingId: string },
  locales: readonly PublicLocale[],
): Promise<string[]> {
  const manifests: string[] = [];
  for (const locale of locales) {
    const { generation } = await listingVersion(db, fixture.listingId);
    const prepared = await prepareManifest(db, {
      actor,
      operationId: opId(),
      expectedRevision: generation,
      reference: fixture.reference,
      locale,
    });
    await activateManifest(db, {
      actor,
      operationId: opId(),
      expectedRevision: generation,
      manifestId: prepared.outcome.manifestId,
    });
    manifests.push(prepared.outcome.manifestId);
  }
  return manifests;
}

export const newOperationId = opId;
