// The one eligible public presentation (architecture §7.3, §10, §12). Public HTML, search, counts,
// the inquiry form and (later) sitemap, hreflang and feeds all read listings through
// `eligiblePublications` and `loadPublishedListings`; none of them has its own approval shortcut.
//
// A listing is public in a locale only while its website pointer for that locale is active under
// the listing's current publication generation and, for a translation, the localized revision
// is still approved for its source. Everything shown comes from the pointer's immutable manifest,
// except availability, which is read live from the listing: published is not available.
import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  currentPublications,
  geographyPlaceAliases,
  geographyPlaces,
  listingRevisions,
  listings,
  localizedRevisions,
  mediaAssets,
  properties,
  propertyFacts,
  publicationManifests,
  sellerInstructions,
} from "@/db/schema";
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
import { locationPrecisions } from "@/domain/facts";
import type { PublicLocale } from "@/domain/ids";
import { assessFreshness, type CommercialState, type FreshnessState } from "@/domain/listing";
import type { MediaKind, MediaModification } from "@/domain/media";
import { type PublicMapPoint, parsePublicMapPoint } from "@/domain/public-map";
import { derivePublicPresentation, type PublicPresentation } from "@/domain/publication";
import { localePolicy } from "@/i18n/config";
import type { Executor } from "../db";
import type {
  FactGroup,
  FactVerification,
  ListingCard,
  PlaceName,
  PublicFact,
  PublicMedia,
  PublicPlace,
} from "../listings/view-models";
import { mediaAssetEligible } from "../media/eligibility";
import { currentSellerEvidence } from "./seller-evidence";

/** The local website; manual portals are separate destinations with their own outcomes. */
export const publicDestination = "website";

/**
 * Subquery of the listings public in `locale` right now, with the manifest each shows. Join it
 * on listing id (and manifest id, for projections) wherever public inventory is read.
 */
export function eligiblePublications(db: Executor, locale: PublicLocale) {
  // Keep consent evaluation bound to this manifest and listing. Flattening its evidence
  // joins into the whole catalogue caused severe cardinality underestimation and repeated
  // full-table joins. LIMIT keeps the lateral boundary; the unique instruction ID already
  // means at most one match, so it does not choose between or truncate permissions.
  const consent = db
    .select({ id: sellerInstructions.id })
    .from(sellerInstructions)
    .where(
      and(
        sql`${sellerInstructions.id}::text = ${publicationManifests.decisions}->>'sellerInstruction'`,
        currentSellerEvidence(undefined, listings.id),
      ),
    )
    .limit(1)
    .as("public_consent");
  return db
    .select({
      listingId: currentPublications.listingId,
      manifestId: currentPublications.manifestId,
      activatedAt: currentPublications.activatedAt,
    })
    .from(currentPublications)
    .innerJoin(
      listings,
      and(
        eq(listings.id, currentPublications.listingId),
        eq(listings.publicationGeneration, currentPublications.generation),
      ),
    )
    .innerJoin(publicationManifests, eq(publicationManifests.id, currentPublications.manifestId))
    .innerJoinLateral(consent, sql`true`)
    .leftJoin(
      localizedRevisions,
      eq(localizedRevisions.id, publicationManifests.localizedRevisionId),
    )
    .where(
      and(
        eq(currentPublications.locale, locale),
        eq(currentPublications.destination, publicDestination),
        eq(currentPublications.state, "active"),
        or(
          isNull(publicationManifests.localizedRevisionId),
          eq(localizedRevisions.state, "approved_for_source"),
        ),
      ),
    )
    .as("eligible");
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

/** Approved aliases (transliterations, local and legacy names) of the given places. */
export async function loadPlaceAliases(
  db: Executor,
  placeIds: readonly string[],
): Promise<Map<string, string[]>> {
  const aliases = new Map<string, string[]>();
  if (placeIds.length === 0) return aliases;
  const rows = await db
    .select({ placeId: geographyPlaceAliases.placeId, name: geographyPlaceAliases.name })
    .from(geographyPlaceAliases)
    .where(inArray(geographyPlaceAliases.placeId, [...new Set(placeIds)]));
  for (const row of rows) aliases.set(row.placeId, [...(aliases.get(row.placeId) ?? []), row.name]);
  return aliases;
}

const settlementPrecisions: readonly LocationPrecision[] = [
  "exact",
  "street",
  "neighborhood",
  "settlement",
];
const neighborhoodPrecisions: readonly LocationPrecision[] = ["exact", "street", "neighborhood"];

export function publicPlace(
  chain: readonly PlaceNode[],
  disclosure: ManifestDisclosure,
  locale: PublicLocale,
): PublicPlace {
  const at = (level: PlaceName["level"]) => {
    const node = chain.find((n) => n.level === level);
    return node ? placeName(node, locale) : null;
  };
  const { precision } = disclosure;
  return {
    country: disclosure.country,
    district: at("district"),
    municipality: at("municipality"),
    settlement: settlementPrecisions.includes(precision) ? at("settlement") : null,
    neighborhood: neighborhoodPrecisions.includes(precision) ? disclosure.neighborhood : null,
    precision,
    mapPoint: parsePublicMapPoint(disclosure.mapPoint, precision),
  };
}

// Manifest content.

/** What the manifest discloses about the location; the exact address and point never do. */
export interface ManifestDisclosure {
  readonly mapPoint?: PublicMapPoint | null;
  readonly country: string;
  readonly placeId: string | null;
  readonly precision: LocationPrecision;
  readonly neighborhood: string | null;
}

/** One gallery item as bound into a manifest. */
export interface ManifestMedia {
  readonly relationId: string;
  readonly assetId: string;
  readonly position: number;
  readonly sha256: string;
  readonly derivativeKey: string;
  readonly derivativeSha256: string;
  readonly derivativeContentType: string;
  readonly rightsReference: string | null;
  readonly kind: MediaKind;
  readonly width: number | null;
  readonly height: number | null;
  readonly altText: string | null;
  readonly caption: string | null;
  readonly modification: MediaModification;
  readonly modificationDisclosure: string | null;
}

export function parseDisclosure(value: unknown): ManifestDisclosure {
  const d = (value ?? {}) as Partial<Record<keyof ManifestDisclosure, unknown>>;
  const precision = (locationPrecisions as readonly unknown[]).includes(d.precision)
    ? (d.precision as LocationPrecision)
    : "region";
  return {
    country: typeof d.country === "string" ? d.country : "",
    placeId: typeof d.placeId === "string" ? d.placeId : null,
    precision,
    neighborhood: typeof d.neighborhood === "string" ? d.neighborhood : null,
    mapPoint: parsePublicMapPoint(d.mapPoint, precision),
  };
}

/** A fact as a revision stores it: in property_facts rows or in the terms' `facts` map. */
export interface StoredFact {
  readonly state: FactState;
  readonly value: unknown;
  readonly unit: string | null;
  readonly basis: string | null;
  readonly sourceClass: SourceClass;
  readonly observedAt: Date | null;
  readonly reviewedAt: Date | null;
}

/** The listing-level facts (price) a ListingRevision's terms record. */
export function termsFacts(terms: unknown): Record<string, StoredFact> {
  const recorded = (terms as { facts?: Record<string, Partial<StoredFact>> } | null)?.facts ?? {};
  const facts: Record<string, StoredFact> = {};
  for (const [key, f] of Object.entries(recorded)) {
    if (!f || typeof f.state !== "string") continue;
    facts[key] = {
      state: f.state,
      value: f.value ?? null,
      unit: f.unit ?? null,
      basis: f.basis ?? null,
      // Terms carry no review record of their own: the editorial approval covers them.
      sourceClass: f.sourceClass ?? "source_supplied",
      observedAt: null,
      reviewedAt: null,
    };
  }
  return facts;
}

/** Keys that stay internal: raw location detail and amounts whose period is unconfirmed. */
const internalFactKeys: readonly string[] = ["location", "price.amount_without_period"];

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

function verificationOf(sourceClass: SourceClass): FactVerification {
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

export function toPublicFact(key: string, stored: StoredFact): PublicFact {
  const provenance: Provenance = {
    sourceClass: stored.sourceClass,
    ...(stored.observedAt ? { observedAt: stored.observedAt.toISOString() } : {}),
    ...(stored.reviewedAt ? { reviewedAt: stored.reviewedAt.toISOString() } : {}),
  };
  const scalarUnit = stored.unit && typeof stored.value !== "object" ? { unit: stored.unit } : {};
  let fact: Fact<unknown>;
  if (stored.state === "known") {
    fact = { state: "known", value: stored.value, ...scalarUnit, provenance };
  } else if (stored.state === "conflicting") {
    // The candidates are private evidence; publicly it is simply not settled.
    fact = { state: "conflicting", candidates: [], provenance };
  } else {
    fact = { state: stored.state, provenance };
  }
  return {
    key,
    group: factGroup(key),
    fact,
    verification: verificationOf(stored.sourceClass),
    reviewed: stored.reviewedAt !== null,
  };
}

// Loading.

export interface PublishedListing {
  readonly listingId: string;
  readonly reference: string;
  readonly locale: PublicLocale;
  readonly purpose: ListingPurpose;
  readonly propertyType: PropertyType;
  readonly manifestId: string;
  readonly activatedAt: Date;
  readonly listingRevisionId: string;
  /** Live, not from the manifest: publication never establishes availability. */
  readonly commercialState: CommercialState;
  readonly availabilityConfirmedAt: Date | null;
  readonly freshnessConflicting: boolean;
  readonly disclosure: ManifestDisclosure;
  readonly placeChain: readonly PlaceNode[];
  readonly placeAliases: readonly string[];
  /** Public facts of the manifest's fact revision and terms, by key. */
  readonly facts: ReadonlyMap<string, PublicFact>;
  readonly title: string | null;
  readonly description: string | null;
  /** Manifest media whose assets are still eligible now, in gallery order. */
  readonly media: readonly PublicMedia[];
}

function copyText(value: unknown): { title: string | null; description: string | null } {
  const v = (value ?? {}) as { title?: unknown; description?: unknown };
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x : null);
  return { title: str(v.title), description: str(v.description) };
}

/** Listings public in `locale`, by id or reference, in the order asked for; others are left out. */
export async function loadPublishedListings(
  db: Executor,
  keys: { readonly ids?: readonly string[]; readonly references?: readonly string[] },
  locale: PublicLocale,
): Promise<PublishedListing[]> {
  const ids = [...(keys.ids ?? [])];
  const references = [...(keys.references ?? [])];
  if (ids.length === 0 && references.length === 0) return [];
  const eligible = eligiblePublications(db, locale);
  const rows = await db
    .select({
      listing: listings,
      propertyType: properties.propertyType,
      manifest: publicationManifests,
      activatedAt: eligible.activatedAt,
      terms: listingRevisions.terms,
      sourceCopy: listingRevisions.sourceCopy,
      localized: { title: localizedRevisions.title, body: localizedRevisions.body },
    })
    .from(eligible)
    .innerJoin(listings, eq(listings.id, eligible.listingId))
    .innerJoin(properties, eq(properties.id, listings.propertyId))
    .innerJoin(publicationManifests, eq(publicationManifests.id, eligible.manifestId))
    .innerJoin(listingRevisions, eq(listingRevisions.id, publicationManifests.listingRevisionId))
    .leftJoin(
      localizedRevisions,
      eq(localizedRevisions.id, publicationManifests.localizedRevisionId),
    )
    .where(
      or(
        ids.length ? inArray(listings.id, ids) : sql`false`,
        references.length ? inArray(listings.reference, references) : sql`false`,
      ),
    );
  if (rows.length === 0) return [];

  const factRows = await db
    .select({
      factRevisionId: propertyFacts.factRevisionId,
      fieldKey: propertyFacts.fieldKey,
      state: propertyFacts.state,
      value: propertyFacts.value,
      unit: propertyFacts.unit,
      basis: propertyFacts.basis,
      sourceClass: propertyFacts.sourceClass,
      observedAt: propertyFacts.observedAt,
      reviewedAt: propertyFacts.reviewedAt,
    })
    .from(propertyFacts)
    .where(
      inArray(
        propertyFacts.factRevisionId,
        rows.map((r) => r.manifest.factRevisionId),
      ),
    );
  const manifestMedia = new Map(
    rows.map((r) => [r.manifest.id, (r.manifest.media ?? []) as ManifestMedia[]]),
  );
  const assetIds = [...manifestMedia.values()].flatMap((items) => items.map((m) => m.assetId));
  const assets = assetIds.length
    ? await db.select().from(mediaAssets).where(inArray(mediaAssets.id, assetIds))
    : [];
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const disclosures = new Map(
    rows.map((r) => [r.manifest.id, parseDisclosure(r.manifest.disclosure)]),
  );
  const placeIds = [...disclosures.values()].flatMap((d) => (d.placeId ? [d.placeId] : []));
  const chains = await loadPlaceChains(db, placeIds);
  const aliases = await loadPlaceAliases(
    db,
    [...chains.values()].flatMap((chain) => chain.map((p) => p.id)),
  );

  const loaded = rows.map((row): PublishedListing => {
    const { listing, manifest } = row;
    const facts = new Map<string, PublicFact>();
    for (const f of factRows) {
      if (f.factRevisionId !== manifest.factRevisionId || internalFactKeys.includes(f.fieldKey)) {
        continue;
      }
      facts.set(f.fieldKey, toPublicFact(f.fieldKey, f));
    }
    for (const [key, f] of Object.entries(termsFacts(row.terms))) {
      if (!internalFactKeys.includes(key)) facts.set(key, toPublicFact(key, f));
    }
    const copy =
      manifest.localizedRevisionId && row.localized
        ? {
            title: copyText(row.localized).title,
            description: copyText(row.localized.body).description,
          }
        : copyText((row.sourceCopy as { text?: unknown } | null)?.text);
    const media: PublicMedia[] = [];
    for (const item of [...(manifestMedia.get(manifest.id) ?? [])].sort(
      (a, b) => a.position - b.position,
    )) {
      const asset = assetById.get(item.assetId);
      // Eligibility is re-checked on every read: a withdrawn asset disappears at once.
      if (
        !asset ||
        asset.sha256 !== item.sha256 ||
        asset.derivativeKey !== item.derivativeKey ||
        asset.derivativeSha256 !== item.derivativeSha256 ||
        asset.derivativeContentType !== item.derivativeContentType ||
        // Old manifests without a complete media snapshot require renewed publication.
        !("altText" in item) ||
        !("caption" in item) ||
        !item.kind ||
        !item.modification ||
        !mediaAssetEligible(asset)
      ) {
        continue;
      }
      media.push({
        relationId: item.relationId,
        assetId: asset.id,
        digest: item.derivativeSha256,
        kind: item.kind,
        contentType: item.derivativeContentType,
        width: item.width,
        height: item.height,
        alt: item.altText,
        caption: item.caption,
        modificationDisclosure: item.modification === "none" ? null : item.modificationDisclosure,
        position: item.position,
      });
    }
    const disclosure = disclosures.get(manifest.id) ?? parseDisclosure(null);
    const chain = disclosure.placeId ? (chains.get(disclosure.placeId) ?? []) : [];
    return {
      listingId: listing.id,
      reference: listing.reference,
      locale,
      purpose: listing.purpose,
      propertyType: row.propertyType,
      manifestId: manifest.id,
      activatedAt: row.activatedAt,
      listingRevisionId: manifest.listingRevisionId,
      commercialState: listing.commercialState,
      availabilityConfirmedAt: listing.availabilityConfirmedAt,
      freshnessConflicting: listing.freshnessState === "conflicting",
      disclosure,
      placeChain: chain,
      placeAliases: chain.flatMap((p) => aliases.get(p.id) ?? []),
      facts,
      title: copy.title,
      description: copy.description,
      media,
    };
  });
  const order = new Map([...ids, ...references].map((key, index) => [key, index]));
  const position = (p: PublishedListing) =>
    order.get(p.listingId) ?? order.get(p.reference) ?? Number.MAX_SAFE_INTEGER;
  return loaded.sort((a, b) => position(a) - position(b));
}

// Presentation.

export function freshnessOf(listing: PublishedListing, now: Date): FreshnessState {
  return assessFreshness({
    purpose: listing.purpose,
    ...(listing.availabilityConfirmedAt
      ? { lastConfirmedAt: listing.availabilityConfirmedAt.toISOString() }
      : {}),
    conflicting: listing.freshnessConflicting,
    now: now.toISOString(),
  }).state;
}

/** The domain's presentation of an eligible listing: visible, availability, next action. */
export function presentationOf(listing: PublishedListing, now: Date): PublicPresentation {
  return derivePublicPresentation({
    pointer: "active",
    commercial: listing.commercialState,
    freshness: freshnessOf(listing, now),
    localeIndexable: localePolicy(listing.locale).indexable,
  });
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

export function toCard(listing: PublishedListing, now: Date): ListingCard {
  const shown = presentationOf(listing, now);
  return {
    reference: listing.reference,
    slug: listingSlug(listing.reference),
    manifestId: listing.manifestId,
    locale: listing.locale,
    purpose: listing.purpose,
    propertyType: listing.propertyType,
    title: listing.title,
    price: priceFact(listing),
    place: publicPlace(listing.placeChain, listing.disclosure, listing.locale),
    bedrooms: bedroomsFact(listing),
    area: headlineArea(listing),
    availability: {
      presented: shown.availability,
      freshness: freshnessOf(listing, now),
      confirmedAt: listing.availabilityConfirmedAt?.toISOString() ?? null,
      primaryAction: shown.primaryAction,
    },
    cover: listing.media[0] ?? null,
  };
}

/** Cards for public listings, in the order of `ids`; ids that are not public are left out. */
export async function loadCards(
  db: Executor,
  ids: readonly string[],
  locale: PublicLocale,
  now: Date,
): Promise<ListingCard[]> {
  const published = await loadPublishedListings(db, { ids }, locale);
  return published.map((p) => toCard(p, now));
}
