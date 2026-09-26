// Reads what is live on the website: the released listing version (its immutable snapshot),
// never the working facts, so an unreleased edit cannot leak (spec §07.4, §19.2). Shared by
// search cards, the home overview, listing detail and the search projection.
import "server-only";
import { and, eq, inArray, isNotNull, notInArray, or, sql } from "drizzle-orm";
import {
  facts as factsTable,
  geographyPlaces,
  listings,
  listingVersions,
  properties,
  translations,
} from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import type {
  Area,
  AreaBasis,
  Fact,
  FactState,
  ListingPurpose,
  LocationPrecision,
  Money,
  PropertyType,
  Provenance,
  SourceClass,
} from "@/domain/facts";
import type { PublicLocale } from "@/domain/ids";
import { sourceLocale } from "@/domain/ids";
import {
  type CommercialState,
  derivePublicPresentation,
  type EditorialState,
  type FreshnessState,
  type PublicPresentation,
} from "@/domain/listing";
import type { DistributionState } from "@/domain/publication";
import type { TranslationState } from "@/domain/translation";
import type { Executor } from "../db";
import { loadPublicMedia, type PublicMedia } from "../media/public-media";
import type {
  FactGroup,
  FactVerification,
  ListingCard,
  PlaceName,
  PublicFact,
  PublicPlace,
} from "./view-models";

/** Commercial states that are still an offer; sold, let and withdrawn are history. */
export const offeredStates: readonly CommercialState[] = [
  "available",
  "availability_unconfirmed",
  "under_negotiation",
  "reserved",
];

const notLive: DistributionState[] = ["never_published", "withdrawn"];

/** SQL condition: the listing has a released version live at the website destination. */
export function isLive() {
  return and(
    isNotNull(listings.publishedVersionNumber),
    notInArray(listings.distributionState, notLive),
  );
}

export function listingSlug(reference: string): string {
  return reference.toLowerCase();
}

// Places.

export interface PlaceNode {
  readonly id: string;
  readonly level: PlaceName["level"];
  readonly parentId: string | null;
  readonly countryCode: string;
  readonly slug: string;
  readonly nameNative: string;
  readonly nameLatin: string;
}

/** Locales that read a country's native script. */
const nativeScriptLocales: Readonly<Record<string, readonly PublicLocale[]>> = {
  BG: ["bg", "ru"],
  GR: ["el"],
};

export function placeName(node: PlaceNode, locale: PublicLocale): PlaceName {
  const native = nativeScriptLocales[node.countryCode]?.includes(locale) ?? false;
  return {
    id: node.id,
    level: node.level,
    slug: node.slug,
    name: native ? node.nameNative : node.nameLatin,
    nameNative: node.nameNative,
    nameLatin: node.nameLatin,
  };
}

/** Each place with its ancestors, nearest first. */
export async function loadPlaceChains(
  db: Executor,
  placeIds: readonly string[],
): Promise<Map<string, PlaceNode[]>> {
  const nodes = new Map<string, PlaceNode>();
  let pending = [...new Set(placeIds)];
  while (pending.length > 0) {
    const rows = await db
      .select({
        id: geographyPlaces.id,
        level: geographyPlaces.level,
        parentId: geographyPlaces.parentId,
        countryCode: geographyPlaces.countryCode,
        slug: geographyPlaces.slug,
        nameNative: geographyPlaces.nameNative,
        nameLatin: geographyPlaces.nameLatin,
      })
      .from(geographyPlaces)
      .where(inArray(geographyPlaces.id, pending));
    for (const row of rows) nodes.set(row.id, row);
    pending = [
      ...new Set(rows.flatMap((r) => (r.parentId && !nodes.has(r.parentId) ? [r.parentId] : []))),
    ];
  }
  const chains = new Map<string, PlaceNode[]>();
  for (const id of new Set(placeIds)) {
    const chain: PlaceNode[] = [];
    for (let node = nodes.get(id); node && chain.length < 8; ) {
      chain.push(node);
      node = node.parentId ? nodes.get(node.parentId) : undefined;
    }
    chains.set(id, chain);
  }
  return chains;
}

const detailedPrecisions: readonly LocationPrecision[] = ["exact", "street", "neighborhood"];

export function publicPlace(
  chain: readonly PlaceNode[],
  property: { country: string; precision: LocationPrecision; neighborhood: string | null },
  locale: PublicLocale,
): PublicPlace {
  const at = (level: PlaceName["level"]) => {
    const node = chain.find((n) => n.level === level);
    return node ? placeName(node, locale) : null;
  };
  return {
    country: property.country,
    district: at("district"),
    municipality: at("municipality"),
    settlement: at("settlement"),
    neighborhood: detailedPrecisions.includes(property.precision) ? property.neighborhood : null,
    precision: property.precision,
  };
}

// Released snapshot.

export interface SnapshotFact {
  readonly state: FactState;
  readonly value: unknown;
  readonly unit: string | null;
  readonly basis: string | null;
  readonly sourceClass?: SourceClass;
}

export function snapshotFacts(snapshot: unknown): Record<string, SnapshotFact> {
  const recorded = (snapshot as { facts?: Record<string, SnapshotFact> } | null)?.facts;
  return recorded && typeof recorded === "object" ? recorded : {};
}

export interface SnapshotText {
  readonly locale: PublicLocale;
  readonly title: string | null;
  readonly description: string | null;
}

export function snapshotText(snapshot: unknown): SnapshotText | null {
  const text = (snapshot as { text?: Record<string, unknown> | null } | null)?.text;
  if (!text) return null;
  const str = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
  return { locale: sourceLocale, title: str(text.title), description: str(text.description) };
}

/** Keys that stay internal: raw location detail and amounts whose period is unconfirmed. */
const internalFactKeys: readonly string[] = ["location", "price.amount_without_period"];

export function isPublicFactKey(key: string): boolean {
  return !internalFactKeys.includes(key);
}

const featureGroups: Readonly<Record<string, FactGroup>> = {
  floor_number: "building",
  total_floors: "building",
  storeys_count: "building",
  construction_status: "building",
  condition: "condition",
  parking_kind: "access",
  road_access_status: "access",
  utilities_status: "facilities",
  zoning_status: "planning",
  land_category: "planning",
  permitted_use: "planning",
  permanent_use: "planning",
  premises_count: "space",
  hotel_room_count: "space",
};

export function factGroup(key: string): FactGroup {
  if (key === "price" || key.startsWith("price.")) return "price";
  if (key.startsWith("feature.")) return featureGroups[key.slice(8)] ?? "facilities";
  return "space";
}

export function verificationOf(sourceClass: SourceClass): FactVerification {
  switch (sourceClass) {
    case "legacy_import":
      return "imported";
    case "source_supplied":
    case "owner_confirmed":
      return "owner_supplied";
    case "system_calculated":
      return "calculated";
    default:
      return "broker_verified";
  }
}

interface LiveFactRow {
  readonly fieldKey: string;
  readonly state: FactState;
  readonly value: unknown;
  readonly sourceClass: SourceClass;
  readonly reviewedAt: Date | null;
  readonly observedAt: Date | null;
}

/**
 * The released value with its provenance. The working fact's review record describes the
 * released value only while both still say the same thing.
 */
export function publishedFact(
  key: string,
  released: SnapshotFact,
  working: LiveFactRow | undefined,
): PublicFact {
  const same =
    working?.state === released.state &&
    canonicalJson(working.value ?? null) === canonicalJson(released.value ?? null);
  const provenance: Provenance =
    working && same
      ? {
          sourceClass: working.sourceClass,
          ...(working.reviewedAt ? { reviewedAt: working.reviewedAt.toISOString() } : {}),
          ...(working.observedAt ? { observedAt: working.observedAt.toISOString() } : {}),
        }
      : { sourceClass: released.sourceClass ?? "legacy_import" };
  const scalarUnit =
    released.unit && typeof released.value !== "object" ? { unit: released.unit } : {};
  const fact: Fact<unknown> =
    released.state === "known"
      ? { state: "known", value: released.value, ...scalarUnit, provenance }
      : { state: released.state, provenance };
  return {
    key,
    group: factGroup(key),
    fact,
    verification: verificationOf(provenance.sourceClass),
    reviewed: Boolean(provenance.reviewedAt),
  };
}

// Loading.

export interface PublishedListing {
  readonly listingId: string;
  readonly propertyId: string;
  readonly reference: string;
  readonly purpose: ListingPurpose;
  readonly propertyType: PropertyType;
  readonly commercialState: CommercialState;
  readonly reservationBasis: string | null;
  readonly availabilityCheckedAt: Date | null;
  readonly editorialState: EditorialState;
  readonly distributionState: DistributionState;
  readonly freshnessState: FreshnessState;
  readonly publishedVersion: number;
  readonly versionId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly placeId: string | null;
  readonly placeChain: readonly PlaceNode[];
  readonly country: string;
  readonly precision: LocationPrecision;
  readonly neighborhood: string | null;
  /** Released facts by key, with provenance. */
  readonly facts: ReadonlyMap<string, PublicFact>;
  readonly sourceText: SnapshotText | null;
  /** Approved translation of the released version in the requested locale, if any. */
  readonly translation: SnapshotText | null;
  readonly translationStates: Partial<Record<PublicLocale, TranslationState>>;
}

/** Live listings by id or reference, in the order asked for; others are left out. */
export async function loadPublishedListings(
  db: Executor,
  keys: { readonly ids?: readonly string[]; readonly references?: readonly string[] },
  locale: PublicLocale,
): Promise<PublishedListing[]> {
  const ids = [...(keys.ids ?? [])];
  const references = [...(keys.references ?? [])];
  if (ids.length === 0 && references.length === 0) return [];
  const rows = await db
    .select({ listing: listings, property: properties, version: listingVersions })
    .from(listings)
    .innerJoin(properties, eq(properties.id, listings.propertyId))
    .innerJoin(
      listingVersions,
      and(
        eq(listingVersions.listingId, listings.id),
        eq(listingVersions.versionNumber, listings.publishedVersionNumber),
      ),
    )
    .where(
      and(
        isLive(),
        or(
          ids.length ? inArray(listings.id, ids) : sql`false`,
          references.length ? inArray(listings.reference, references) : sql`false`,
        ),
      ),
    );
  if (rows.length === 0) return [];

  const listingIds = rows.map((r) => r.listing.id);
  const propertyIds = rows.map((r) => r.property.id);
  const working = await db
    .select({
      listingId: factsTable.listingId,
      propertyId: factsTable.propertyId,
      fieldKey: factsTable.fieldKey,
      state: factsTable.state,
      value: factsTable.value,
      sourceClass: factsTable.sourceClass,
      reviewedAt: factsTable.reviewedAt,
      observedAt: factsTable.observedAt,
    })
    .from(factsTable)
    .where(
      or(inArray(factsTable.listingId, listingIds), inArray(factsTable.propertyId, propertyIds)),
    );
  const localeRows = await db
    .select({
      subjectId: translations.subjectId,
      locale: translations.locale,
      sourceVersion: translations.sourceVersion,
      state: translations.state,
      title: translations.title,
      body: translations.body,
    })
    .from(translations)
    .where(
      and(eq(translations.subjectType, "listing"), inArray(translations.subjectId, listingIds)),
    );
  const chains = await loadPlaceChains(
    db,
    rows.flatMap((r) => (r.property.placeId ? [r.property.placeId] : [])),
  );

  const loaded = rows.map(({ listing, property, version }): PublishedListing => {
    const publishedVersion = version.versionNumber;
    const workingByKey = new Map<string, LiveFactRow>();
    for (const f of working) {
      if (f.propertyId === property.id) workingByKey.set(f.fieldKey, f);
    }
    for (const f of working) {
      if (f.listingId === listing.id) workingByKey.set(f.fieldKey, f);
    }
    const released = new Map<string, PublicFact>();
    for (const [key, fact] of Object.entries(snapshotFacts(version.snapshot))) {
      if (isPublicFactKey(key)) released.set(key, publishedFact(key, fact, workingByKey.get(key)));
    }
    const ownTranslations = localeRows.filter(
      (t) => t.subjectId === listing.id && t.sourceVersion === publishedVersion,
    );
    const approved = ownTranslations.find((t) => t.locale === locale && t.state === "approved");
    const body = (approved?.body ?? null) as { description?: unknown } | null;
    return {
      listingId: listing.id,
      propertyId: property.id,
      reference: listing.reference,
      purpose: listing.purpose,
      propertyType: property.propertyType,
      commercialState: listing.commercialState,
      reservationBasis: listing.reservationBasis,
      availabilityCheckedAt: listing.availabilityCheckedAt,
      editorialState: listing.editorialState,
      distributionState: listing.distributionState,
      freshnessState: listing.freshnessState,
      publishedVersion,
      versionId: version.id,
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
      placeId: property.placeId,
      placeChain: property.placeId ? (chains.get(property.placeId) ?? []) : [],
      country: property.country,
      precision: property.publicPrecision,
      neighborhood: property.neighborhood,
      facts: released,
      sourceText: snapshotText(version.snapshot),
      translation: approved
        ? {
            locale,
            title: approved.title,
            description: typeof body?.description === "string" ? body.description : null,
          }
        : null,
      translationStates: Object.fromEntries(ownTranslations.map((t) => [t.locale, t.state])),
    };
  });
  const order = new Map([...ids, ...references].map((key, index) => [key, index]));
  const position = (p: PublishedListing) =>
    order.get(p.listingId) ?? order.get(p.reference) ?? Number.MAX_SAFE_INTEGER;
  return loaded.sort((a, b) => position(a) - position(b));
}

// View-model pieces.

export function presentation(
  listing: PublishedListing,
  locale: PublicLocale,
  localeIndexable: boolean,
): PublicPresentation {
  return derivePublicPresentation(
    {
      commercial: listing.commercialState,
      editorial: listing.editorialState,
      distribution: listing.distributionState,
      publishedVersion: listing.publishedVersion,
      freshness: listing.freshnessState,
      translations: listing.translationStates,
    },
    { locale, localeIndexable },
  );
}

/** Title in the requested locale when approved, else the source text with its locale. */
export function localizedTitle(listing: PublishedListing): {
  title: string | null;
  titleLocale: PublicLocale;
} {
  if (listing.translation?.title) {
    return { title: listing.translation.title, titleLocale: listing.translation.locale };
  }
  return { title: listing.sourceText?.title ?? null, titleLocale: sourceLocale };
}

const notRecorded: Fact<never> = { state: "unknown" };

export function priceFact(listing: PublishedListing): Fact<Money> {
  return (listing.facts.get("price")?.fact as Fact<Money> | undefined) ?? notRecorded;
}

export function bedroomsFact(listing: PublishedListing): Fact<number> {
  return (listing.facts.get("bedrooms")?.fact as Fact<number> | undefined) ?? notRecorded;
}

const areaPreference: readonly AreaBasis[] = ["living", "built", "total", "land"];

export function headlineArea(listing: PublishedListing): Fact<Area> {
  for (const basis of areaPreference) {
    const fact = listing.facts.get(`area.${basis}`)?.fact;
    if (fact?.state === "known") return fact as Fact<Area>;
  }
  const recorded =
    listing.facts.get("area")?.fact ??
    areaPreference.map((b) => listing.facts.get(`area.${b}`)?.fact).find(Boolean);
  return (recorded as Fact<Area> | undefined) ?? notRecorded;
}

export function toCard(
  listing: PublishedListing,
  locale: PublicLocale,
  cover: PublicMedia | null,
): ListingCard {
  const place = publicPlace(listing.placeChain, listing, locale);
  return {
    reference: listing.reference,
    slug: listingSlug(listing.reference),
    version: listing.publishedVersion,
    purpose: listing.purpose,
    propertyType: listing.propertyType,
    ...localizedTitle(listing),
    price: priceFact(listing),
    locality: {
      settlement: place.settlement?.name ?? null,
      municipality: place.municipality?.name ?? null,
      precision: place.precision,
    },
    bedrooms: bedroomsFact(listing),
    area: headlineArea(listing),
    availability: presentation(listing, locale, false).availability,
    commercialState: listing.commercialState,
    availabilityCheckedAt: listing.availabilityCheckedAt?.toISOString() ?? null,
    coverImage: cover,
    updatedAt: listing.updatedAt.toISOString(),
  };
}

/** Cards for live listings, in the order of `ids`; ids that are not live are left out. */
export async function loadCards(
  db: Executor,
  ids: readonly string[],
  locale: PublicLocale,
): Promise<ListingCard[]> {
  const published = await loadPublishedListings(db, { ids }, locale);
  const media = await loadPublicMedia(
    db,
    published.map((p) => p.versionId),
  );
  return published.map((p) => toCard(p, locale, media.get(p.versionId)?.[0] ?? null));
}
