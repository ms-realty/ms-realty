// Listing fixtures for integration tests only: places, a legacy-shaped listing in needs_facts
// and a helper that takes it through the recorded publication steps. Test data only.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  approvals,
  facts,
  geographyPlaces,
  listings,
  listingVersionMedia,
  listingVersions,
  mediaAssets,
  properties,
} from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import type { Actor } from "@/domain/capabilities";
import type { FactState, ListingPurpose, LocationPrecision, PropertyType } from "@/domain/facts";
import type { CommercialState } from "@/domain/listing";
import { sha256Hex } from "../crypto";
import type { Executor } from "../db";
import {
  approveListingVersion,
  confirmListingFacts,
  getListingReadiness,
  publishListing,
  submitListingForReview,
} from "./publication";

let sequence = 0;
const next = () => {
  sequence += 1;
  return sequence;
};

export interface PlaceFixture {
  readonly districtId: string;
  readonly municipalityId: string;
  readonly settlementId: string;
}

export async function createPlaces(
  db: Executor,
  names: { settlement: string; municipality: string } = {
    settlement: "Sandanski",
    municipality: "Sandanski",
  },
): Promise<PlaceFixture> {
  const n = `${Date.now().toString(36)}-${next()}`;
  const insert = async (
    level: "district" | "municipality" | "settlement",
    name: string,
    parentId: string | null,
  ) => {
    const [row] = await db
      .insert(geographyPlaces)
      .values({
        level,
        parentId,
        countryCode: "BG",
        slug: `${level}-${name.toLowerCase()}-${n}`,
        nameNative: `${name} (bg)`,
        nameLatin: name,
      })
      .returning({ id: geographyPlaces.id });
    if (!row) throw new Error("place insert failed");
    return row.id;
  };
  const districtId = await insert("district", "Blagoevgrad", null);
  const municipalityId = await insert("municipality", names.municipality, districtId);
  const settlementId = await insert("settlement", names.settlement, municipalityId);
  return { districtId, municipalityId, settlementId };
}

export interface FactFixture {
  readonly state: FactState;
  readonly value?: unknown;
  readonly subject?: "property" | "listing";
  readonly basis?: string;
}

export const eur = (euros: number) => ({
  amountMinor: euros * 100,
  currency: "EUR",
  period: "total",
  basis: "asking",
});

export interface ListingFixtureOptions {
  readonly reference?: string;
  readonly purpose?: ListingPurpose;
  readonly propertyType?: PropertyType;
  readonly commercialState?: CommercialState;
  readonly availabilityCheckedAt?: Date;
  readonly placeId?: string;
  readonly precision?: LocationPrecision;
  readonly exactAddress?: string;
  readonly facts?: Record<string, FactFixture>;
  readonly title?: string;
  readonly humanReviewedText?: boolean;
  readonly ownerApproval?: boolean;
  readonly createdAt?: Date;
}

export interface ListingFixture {
  readonly listingId: string;
  readonly propertyId: string;
  readonly versionId: string;
  readonly reference: string;
  readonly contentHash: string;
}

const defaultFacts: Record<string, FactFixture> = {
  price: { state: "known", value: eur(100_000), subject: "listing" },
  bedrooms: { state: "known", value: 2 },
  rooms: { state: "unknown" },
  "area.built": {
    state: "known",
    value: { value: 80, unit: "m2", basis: "built" },
    basis: "built",
  },
  location: { state: "known", value: { country: "BG", settlement: "Sandanski" } },
  "feature.condition": { state: "unknown" },
};

/** A listing as the legacy import leaves it: needs_facts, never published, facts unreviewed. */
export async function createListingFixture(
  db: Executor,
  options: ListingFixtureOptions = {},
): Promise<ListingFixture> {
  const reference = options.reference ?? `MS-${String(90000 + next()).padStart(5, "0")}`;
  const purpose = options.purpose ?? "sale";
  const propertyType = options.propertyType ?? "apartment";
  const factInputs = options.facts ?? defaultFacts;
  const [property] = await db
    .insert(properties)
    .values({
      reference: `PR-2026-${randomUUID().slice(0, 8)}`,
      propertyType,
      placeId: options.placeId,
      country: "BG",
      region: "Blagoevgrad",
      settlement: "Sandanski",
      neighborhood: "Test neighborhood",
      exactAddress: options.exactAddress,
      publicPrecision: options.precision ?? "settlement",
    })
    .returning({ id: properties.id });
  if (!property) throw new Error("property insert failed");
  const [listing] = await db
    .insert(listings)
    .values({
      reference,
      propertyId: property.id,
      purpose,
      commercialState: options.commercialState ?? "availability_unconfirmed",
      editorialState: "needs_facts",
      availabilityCheckedAt: options.availabilityCheckedAt,
      currentVersionNumber: 1,
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    })
    .returning({ id: listings.id });
  if (!listing) throw new Error("listing insert failed");
  const snapshot = {
    reference,
    purpose,
    propertyType,
    facts: Object.fromEntries(
      Object.entries(factInputs).map(([key, f]) => [
        key,
        {
          state: f.state,
          value: f.state === "known" ? (f.value ?? null) : null,
          unit: null,
          basis: f.basis ?? null,
          note: "internal note for staff",
        },
      ]),
    ),
    text: {
      locale: "bg",
      humanReviewed: options.humanReviewedText ?? true,
      title: options.title ?? `Апартамент ${reference}`,
      description: "Описание на имота.",
    },
  };
  const contentHash = sha256Hex(canonicalJson(snapshot));
  const [version] = await db
    .insert(listingVersions)
    .values({ listingId: listing.id, versionNumber: 1, contentHash, snapshot })
    .returning({ id: listingVersions.id });
  if (!version) throw new Error("version insert failed");
  await db.insert(facts).values(
    Object.entries(factInputs).map(([fieldKey, f]) => ({
      propertyId: f.subject === "listing" ? null : property.id,
      listingId: f.subject === "listing" ? listing.id : null,
      fieldKey,
      state: f.state,
      value: f.state === "known" ? (f.value ?? null) : null,
      basis: f.basis ?? null,
      note: "internal note for staff",
      sourceClass: "legacy_import" as const,
      sourceReference: `https://makler-realty.com/test/${reference}`,
      observedAt: new Date("2026-07-01T00:00:00Z"),
    })),
  );
  if (options.ownerApproval ?? true) {
    await db.insert(approvals).values({
      kind: "legacy_owner_publication_approval",
      state: "approved",
      subjectType: "listing_version",
      subjectId: version.id,
      subjectVersion: 1,
      subjectHash: contentHash,
      requestedByKind: "system",
      requestedById: "legacy-import",
      decidedByKind: "staff",
      decidedById: "legacy:test-owner-approval",
      decidedAt: new Date("2026-08-01T00:00:00Z"),
    });
  }
  return {
    listingId: listing.id,
    propertyId: property.id,
    versionId: version.id,
    reference,
    contentHash,
  };
}

/** Adds a media asset to the listing's version 1; public ones are cleared and approved. */
export async function addMedia(
  db: Executor,
  fixture: ListingFixture,
  options: { public: boolean; position: number; altText?: string },
): Promise<string> {
  const [asset] = await db
    .insert(mediaAssets)
    .values({
      propertyId: fixture.propertyId,
      listingId: fixture.listingId,
      r2Key: `${options.public ? "public" : "staging"}/${fixture.reference}/${randomUUID()}.webp`,
      storageArea: options.public ? "public" : "staging",
      kind: "photo",
      contentType: "image/webp",
      width: 1600,
      height: 1067,
      rights: options.public ? "cleared" : "unknown",
      review: options.public ? "approved" : "pending",
      altText: options.altText ?? null,
      sortOrder: options.position,
    })
    .returning({ id: mediaAssets.id });
  if (!asset) throw new Error("media insert failed");
  await db.insert(listingVersionMedia).values({
    listingVersionId: fixture.versionId,
    mediaAssetId: asset.id,
    position: options.position,
  });
  return asset.id;
}

/** Runs the recorded human steps: confirm the named facts, submit, approve, publish. */
export async function publishForTest(
  db: Executor,
  actor: Actor,
  reference: string,
  confirm: readonly string[],
) {
  const key = (step: string) => `test:${reference}:${step}:${randomUUID()}`;
  let ready = await getListingReadiness(db, actor, reference);
  if (confirm.length) {
    await confirmListingFacts(db, {
      actor,
      reference,
      operationId: key("confirm"),
      expectedVersion: ready.version,
      fieldKeys: confirm,
    });
    ready = await getListingReadiness(db, actor, reference);
  }
  await submitListingForReview(db, {
    actor,
    reference,
    operationId: key("submit"),
    expectedVersion: ready.version,
  });
  ready = await getListingReadiness(db, actor, reference);
  await approveListingVersion(db, {
    actor,
    reference,
    operationId: key("approve"),
    expectedVersion: ready.version,
    versionNumber: ready.currentVersionNumber,
    contentHash: ready.contentHash ?? "",
  });
  ready = await getListingReadiness(db, actor, reference);
  return publishListing(db, {
    actor,
    reference,
    operationId: key("publish"),
    expectedVersion: ready.version,
    versionNumber: ready.currentVersionNumber,
  });
}

/** The facts a default fixture needs confirmed before review. */
export const defaultConfirm = ["price", "bedrooms", "area.built", "location"] as const;

export async function setCommercialState(
  db: Executor,
  listingId: string,
  state: CommercialState,
): Promise<void> {
  await db.update(listings).set({ commercialState: state }).where(eq(listings.id, listingId));
}
