// Properties, fact revisions, listings, listing and localized revisions, media and the search
// projection (architecture §4.1, §4.2, §7, §13).
//
// Facts are rows of an immutable PropertyFactRevision: every fact needs its own state (known,
// unknown, not supplied, not applicable, withheld, conflicting), unit or basis, source and
// review record, and the set of facts grows without schema changes. A new revision is a new
// row set; the property points at the revision a reviewer approved. `listing_search_documents`
// is the typed projection the search filters run on.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { allowedMediaContentTypes } from "../../domain/media";
import { approvals } from "./approvals";
import { createdAt, id, instant, mutable, reference, sqlList, tsvector } from "./columns";
import {
  actorKindEnum,
  authorityStateEnum,
  commercialStateEnum,
  currencyEnum,
  editorialStateEnum,
  factStateEnum,
  freshnessStateEnum,
  listingPurposeEnum,
  localeStateEnum,
  locationPrecisionEnum,
  materialChangeEnum,
  mediaAudienceEnum,
  mediaKindEnum,
  mediaModificationEnum,
  mediaPurposeEnum,
  mediaReviewEnum,
  mediaRightsEnum,
  participantRoleEnum,
  priceBasisEnum,
  pricePeriodEnum,
  processingStateEnum,
  propertyTypeEnum,
  publicLocaleEnum,
  scanStateEnum,
  sourceClassEnum,
} from "./enums";
import { geographyPlaces } from "./geography";
import { principals } from "./identity";
import { parties } from "./parties";
import { publicationManifests } from "./publication";

export const properties = pgTable(
  "properties",
  {
    ...mutable(),
    reference: reference(),
    propertyType: propertyTypeEnum("property_type").notNull(),
    placeId: uuid("place_id").references(() => geographyPlaces.id),
    country: text("country").notNull(),
    region: text("region").notNull(),
    settlement: text("settlement").notNull(),
    neighborhood: text("neighborhood"),
    /** Private: the exact address and point never leave the staff surface. */
    exactAddress: text("exact_address"),
    unit: text("unit"),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    /** Separately approved public location precision. */
    publicPrecision: locationPrecisionEnum("public_precision").notNull().default("settlement"),
    /** The fact revision a reviewer approved; null until one is. */
    approvedFactRevisionId: uuid("approved_fact_revision_id").references(
      (): AnyPgColumn => propertyFactRevisions.id,
    ),
    mergedIntoPropertyId: uuid("merged_into_property_id").references(
      (): AnyPgColumn => properties.id,
    ),
  },
  (t) => [index("properties_place_idx").on(t.placeId)],
);

/** Immutable (trigger); a correction is a new revision with its change classification. */
export const propertyFactRevisions = pgTable(
  "property_fact_revisions",
  {
    id: id(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    revisionNumber: integer("revision_number").notNull(),
    basedOnRevisionId: uuid("based_on_revision_id").references(
      (): AnyPgColumn => propertyFactRevisions.id,
    ),
    /** SHA-256 of the canonical fact set; factual approvals bind to it. */
    contentDigest: text("content_digest").notNull(),
    materialChange: materialChangeEnum("material_change").notNull(),
    materialKeys: text("material_keys").array().notNull().default(sql`'{}'::text[]`),
    createdByKind: actorKindEnum("created_by_kind").notNull(),
    createdById: text("created_by_id").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("property_fact_revisions_number_idx").on(t.propertyId, t.revisionNumber),
    check("property_fact_revisions_number", sql`${t.revisionNumber} >= 1`),
  ],
);

/** One typed fact of a revision. Immutable with its revision. */
export const propertyFacts = pgTable(
  "property_facts",
  {
    id: id(),
    factRevisionId: uuid("fact_revision_id")
      .notNull()
      .references(() => propertyFactRevisions.id),
    /** e.g. bedrooms, rooms, area.living, location, feature.lift. */
    fieldKey: text("field_key").notNull(),
    state: factStateEnum("state").notNull(),
    /** Known: the typed value (`false` is a value). Conflicting: the candidate values. */
    value: jsonb("value"),
    unit: text("unit"),
    basis: text("basis"),
    sourceClass: sourceClassEnum("source_class").notNull(),
    sourceReference: text("source_reference"),
    sourceLanguage: text("source_language"),
    observedAt: instant("observed_at"),
    /** What a human review covered; null when the value was never reviewed. */
    reviewScope: text("review_scope"),
    reviewedById: uuid("reviewed_by_id").references(() => principals.id),
    reviewedAt: instant("reviewed_at"),
    note: text("note"),
  },
  (t) => [
    check(
      "property_facts_value_matches_state",
      sql`(${t.state} in ('known', 'conflicting')) = (${t.value} is not null)`,
    ),
    check(
      "property_facts_review_recorded",
      sql`(${t.reviewedById} is null) = (${t.reviewedAt} is null)`,
    ),
    uniqueIndex("property_facts_field_idx").on(t.factRevisionId, t.fieldKey),
  ],
);

/** A party's self-declared or reviewed relationship to a property (§6.3). */
export const propertyRelationships = pgTable(
  "property_relationships",
  {
    ...mutable(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    role: participantRoleEnum("role").notNull(),
    authority: authorityStateEnum("authority").notNull().default("self_declared"),
    authorityReviewedById: uuid("authority_reviewed_by_id").references(() => principals.id),
    authorityReviewedAt: instant("authority_reviewed_at"),
    scope: jsonb("scope").notNull().default({}),
    // Stamped by the application: authz compares it with the application clock.
    validFrom: instant("valid_from")
      .notNull()
      .defaultNow()
      .$defaultFn(() => new Date()),
    expiresAt: instant("expires_at"),
    revokedAt: instant("revoked_at"),
    revokedById: uuid("revoked_by_id").references(() => principals.id),
  },
  (t) => [
    check(
      "property_relationships_reviewed_authority",
      sql`${t.authority} <> 'reviewed' or (${t.authorityReviewedById} is not null and ${t.authorityReviewedAt} is not null)`,
    ),
    index("property_relationships_party_idx").on(t.partyId),
    index("property_relationships_property_idx").on(t.propertyId),
  ],
);

export const listings = pgTable(
  "listings",
  {
    ...mutable(),
    /** MS-00100: legacy lot numbers are kept as listing references. */
    reference: reference(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    purpose: listingPurposeEnum("purpose").notNull(),
    commercialState: commercialStateEnum("commercial_state")
      .notNull()
      .default("confirmation_required"),
    /** The recorded basis of the availability state, e.g. of a reservation or a withdrawal. */
    availabilityBasis: text("availability_basis"),
    /** Last human availability confirmation; a timer never sets it. */
    availabilityConfirmedAt: instant("availability_confirmed_at"),
    availabilityConfirmedById: uuid("availability_confirmed_by_id").references(() => principals.id),
    freshnessState: freshnessStateEnum("freshness_state").notNull().default("unknown"),
    reviewDueAt: instant("review_due_at"),
    editorialState: editorialStateEnum("editorial_state").notNull().default("draft"),
    /** The mutable editorial working copy; submitting it creates a ListingRevision. */
    draft: jsonb("draft").notNull().default({}),
    latestRevisionNumber: integer("latest_revision_number").notNull().default(0),
    approvedRevisionId: uuid("approved_revision_id").references(
      (): AnyPgColumn => listingRevisions.id,
    ),
    /**
     * Publication generation: incremented by every restriction, withdrawal and material
     * correction. Queued publication work carries the generation it was created under.
     */
    publicationGeneration: integer("publication_generation").notNull().default(0),
    responsibleBrokerId: uuid("responsible_broker_id").references(() => principals.id),
    /** Explicit legacy-identity map: legacy ids, lifecycle at freeze, URLs and provenance. */
    legacyIdentity: jsonb("legacy_identity"),
  },
  (t) => [
    check(
      "listings_reserved_basis",
      sql`${t.commercialState} <> 'reserved_with_recorded_basis' or ${t.availabilityBasis} is not null`,
    ),
    check(
      "listings_available_confirmed",
      sql`${t.commercialState} <> 'available' or ${t.availabilityConfirmedAt} is not null`,
    ),
    check("listings_generation", sql`${t.publicationGeneration} >= 0`),
    index("listings_property_idx").on(t.propertyId),
  ],
);

/**
 * Immutable review candidate (trigger): the fact revision, commercial terms, BG copy, ordered
 * media manifest and disclosure instructions. Approvals bind to its digest.
 */
export const listingRevisions = pgTable(
  "listing_revisions",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    revisionNumber: integer("revision_number").notNull(),
    factRevisionId: uuid("fact_revision_id")
      .notNull()
      .references(() => propertyFactRevisions.id),
    /** Commercial terms: price as a Money fact, charges, deposit, availability date. */
    terms: jsonb("terms").notNull(),
    /** Bulgarian source copy; original evidence keeps its original language. */
    sourceCopy: jsonb("source_copy").notNull(),
    /** Public location precision and other disclosure instructions. */
    disclosure: jsonb("disclosure").notNull(),
    contentDigest: text("content_digest").notNull(),
    createdByKind: actorKindEnum("created_by_kind").notNull(),
    createdById: text("created_by_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("listing_revisions_number_idx").on(t.listingId, t.revisionNumber),
    check("listing_revisions_number", sql`${t.revisionNumber} >= 1`),
  ],
);

/** The ordered media manifest of a listing revision. Immutable with its revision. */
export const listingRevisionMedia = pgTable(
  "listing_revision_media",
  {
    listingRevisionId: uuid("listing_revision_id")
      .notNull()
      .references(() => listingRevisions.id),
    mediaRelationId: uuid("media_relation_id")
      .notNull()
      .references(() => mediaRelations.id),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.listingRevisionId, t.mediaRelationId] }),
    uniqueIndex("listing_revision_media_position_idx").on(t.listingRevisionId, t.position),
  ],
);

/** One locale's copy bound to one source ListingRevision (§7.1). */
export const localizedRevisions = pgTable(
  "localized_revisions",
  {
    ...mutable(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    sourceRevisionId: uuid("source_revision_id")
      .notNull()
      .references(() => listingRevisions.id),
    locale: publicLocaleEnum("locale").notNull(),
    state: localeStateEnum("state").notNull().default("missing"),
    title: text("title"),
    body: jsonb("body"),
    draftedByAi: boolean("drafted_by_ai").notNull().default(false),
    /** The protected facts the reviewer checked against the source, explicitly. */
    reviewedFacts: jsonb("reviewed_facts"),
    reviewedById: uuid("reviewed_by_id").references(() => principals.id),
    reviewedAt: instant("reviewed_at"),
    approvalId: uuid("approval_id").references(() => approvals.id),
    rejectionReason: text("rejection_reason"),
  },
  (t) => [
    uniqueIndex("localized_revisions_source_locale_idx").on(t.sourceRevisionId, t.locale),
    check("localized_revisions_not_source_locale", sql`${t.locale} <> 'bg'`),
    check(
      "localized_revisions_approved_by_human",
      sql`${t.state} <> 'approved_for_source' or (${t.reviewedById} is not null and ${t.approvalId} is not null and ${t.reviewedFacts} is not null)`,
    ),
    index("localized_revisions_listing_idx").on(t.listingId, t.locale),
  ],
);

/**
 * Stored bytes and everything known about them. Uploads are sealed under a server-only key
 * and digest before scanning; rights, scan, processing, review and audience are separate.
 */
export const mediaAssets = pgTable(
  "media_assets",
  {
    ...mutable(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    purpose: mediaPurposeEnum("purpose").notNull(),
    kind: mediaKindEnum("kind").notNull(),
    /** Original object key: the staging upload, or the legacy R2 key it was imported from. */
    originalKey: text("original_key").notNull().unique(),
    /** Server-only immutable copy; scans, review and serving bind to its digest. */
    sealedKey: text("sealed_key").unique(),
    sha256: text("sha256"),
    contentType: text("content_type").notNull(),
    /** Null when never measured (legacy objects); unknown is not zero. */
    byteSize: bigint("byte_size", { mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    scan: scanStateEnum("scan").notNull().default("pending"),
    scannedAt: instant("scanned_at"),
    scannerVersion: text("scanner_version"),
    scannedSha256: text("scanned_sha256"),
    derivativeKey: text("derivative_key").unique(),
    derivativeSha256: text("derivative_sha256"),
    derivativeContentType: text("derivative_content_type"),
    processing: processingStateEnum("processing").notNull().default("pending"),
    rights: mediaRightsEnum("rights").notNull().default("unknown"),
    rightsHolder: text("rights_holder"),
    rightsReference: text("rights_reference"),
    audience: mediaAudienceEnum("audience").notNull().default("private"),
    review: mediaReviewEnum("review").notNull().default("pending"),
    reviewedById: uuid("reviewed_by_id").references(() => principals.id),
    modification: mediaModificationEnum("modification").notNull().default("none"),
    modificationDisclosure: text("modification_disclosure"),
    /** The unmodified original this asset derives from, kept available. */
    originalAssetId: uuid("original_asset_id").references((): AnyPgColumn => mediaAssets.id),
    caption: text("caption"),
    altText: text("alt_text"),
    capturedAt: instant("captured_at"),
    legacyReference: text("legacy_reference"),
  },
  (t) => [
    check(
      "media_assets_content_type",
      sql`${t.contentType} in (${sqlList(allowedMediaContentTypes)})`,
    ),
    check(
      "media_assets_scan_sealed_bytes",
      sql`${t.scan} = 'pending' or (${t.sealedKey} is not null and ${t.sha256} is not null)`,
    ),
    check(
      "media_assets_review_after_clean_scan",
      sql`${t.review} <> 'approved' or (${t.scan} = 'clean' and ${t.reviewedById} is not null)`,
    ),
    check(
      "media_assets_modification_disclosed",
      sql`${t.modification} = 'none' or ${t.modificationDisclosure} is not null`,
    ),
    index("media_assets_property_idx").on(t.propertyId),
  ],
);

/**
 * Ordered placement of an asset in a listing's gallery, with a stable identity. The same asset
 * may be placed twice; hidden relations keep their position (AT20).
 */
export const mediaRelations = pgTable(
  "media_relations",
  {
    ...mutable(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id),
    position: integer("position").notNull(),
    hidden: boolean("hidden").notNull().default(false),
    removedAt: instant("removed_at"),
  },
  (t) => [index("media_relations_listing_idx").on(t.listingId, t.position)],
);

/**
 * Typed projection for public search (§10): one row per listing and locale, projected from the
 * manifest behind that locale's active website publication. Every filterable fact keeps its
 * state next to its value so SQL applies the same unknown semantics as
 * src/domain/search/filters.ts. Written when a manifest is activated and removed when the
 * publication is restricted or withdrawn; queries still re-check the current pointer and
 * generation, and read availability from the listing itself (published is not available).
 */
export const listingSearchDocuments = pgTable(
  "listing_search_documents",
  {
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    locale: publicLocaleEnum("locale").notNull(),
    /** The manifest the row was projected from. */
    manifestId: uuid("manifest_id")
      .notNull()
      .references((): AnyPgColumn => publicationManifests.id),
    reference: text("reference").notNull(),
    purpose: listingPurposeEnum("purpose").notNull(),
    propertyType: propertyTypeEnum("property_type").notNull(),
    /** The listing's place and all of its ancestors. */
    placeIds: uuid("place_ids").array().notNull(),
    priceState: factStateEnum("price_state").notNull(),
    priceAmountMinor: bigint("price_amount_minor", { mode: "number" }),
    priceCurrency: currencyEnum("price_currency"),
    pricePeriod: pricePeriodEnum("price_period"),
    priceBasis: priceBasisEnum("price_basis"),
    bedroomsState: factStateEnum("bedrooms_state").notNull(),
    bedrooms: integer("bedrooms"),
    roomsState: factStateEnum("rooms_state").notNull(),
    rooms: integer("rooms"),
    livingAreaState: factStateEnum("living_area_state").notNull(),
    livingArea: numeric("living_area", { precision: 10, scale: 2 }),
    builtAreaState: factStateEnum("built_area_state").notNull(),
    builtArea: numeric("built_area", { precision: 10, scale: 2 }),
    totalAreaState: factStateEnum("total_area_state").notNull(),
    totalArea: numeric("total_area", { precision: 10, scale: 2 }),
    landAreaState: factStateEnum("land_area_state").notNull(),
    landArea: numeric("land_area", { precision: 12, scale: 2 }),
    /** Feature key -> fact state, with known booleans as "true"/"false" states. */
    features: jsonb("features").notNull().default({}),
    /** Reference, place names and aliases and the locale's approved title. */
    searchText: text("search_text").notNull().default(""),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('simple', immutable_unaccent(search_text))`,
    ),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.listingId, t.locale] }),
    index("listing_search_vector_idx").using("gin", t.searchVector),
    index("listing_search_reference_trgm_idx").using("gin", t.reference.op("gin_trgm_ops")),
    index("listing_search_text_trgm_idx").using("gin", t.searchText.op("gin_trgm_ops")),
    index("listing_search_place_ids_idx").using("gin", t.placeIds),
    index("listing_search_filter_idx").on(t.locale, t.purpose, t.propertyType),
  ],
);
