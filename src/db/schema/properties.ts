// Properties, listings, immutable listing versions, per-field facts, the search document
// and media assets (spec §04, §07.4, §18.1, F02, F23, AD10, AD12).
//
// Facts: rows, not columns. Every fact needs its own state (known / unknown / not
// applicable / not provided / withheld), unit or basis, source class, source reference and
// review record (§19.2), and the set of facts grows (features, costs, building data) without
// schema changes. Columns would need five or six siblings per field and a migration per new
// feature. So `facts` holds one row per subject and field with the value as typed JSON, and
// `listing_search_documents` is the typed, indexed projection the F02 filters run on. The
// application rebuilds a listing's search document whenever its facts or states change.
import { sql } from "drizzle-orm";
import {
  bigint,
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
import { staffAccounts } from "./accounts";
import { createdAt, id, instant, mutable, reference, sqlList, tsvector } from "./columns";
import {
  commercialStateEnum,
  currencyEnum,
  distributionStateEnum,
  editorialStateEnum,
  factStateEnum,
  freshnessStateEnum,
  listingPurposeEnum,
  locationPrecisionEnum,
  mediaKindEnum,
  mediaModificationEnum,
  mediaReviewEnum,
  mediaRightsEnum,
  mediaStorageAreaEnum,
  priceBasisEnum,
  pricePeriodEnum,
  propertyTypeEnum,
  publicLocaleEnum,
  sourceClassEnum,
} from "./enums";
import { geographyPlaces } from "./geography";

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
    /** Private: never shown beyond the approved public precision. */
    exactAddress: text("exact_address"),
    unit: text("unit"),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    publicPrecision: locationPrecisionEnum("public_precision").notNull().default("settlement"),
  },
  (t) => [index("properties_place_idx").on(t.placeId)],
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
      .default("availability_unconfirmed"),
    reservationBasis: text("reservation_basis"),
    editorialState: editorialStateEnum("editorial_state").notNull().default("draft"),
    distributionState: distributionStateEnum("distribution_state")
      .notNull()
      .default("never_published"),
    freshnessState: freshnessStateEnum("freshness_state").notNull().default("unknown"),
    availabilityCheckedAt: instant("availability_checked_at"),
    /** Latest immutable version, and the version currently released to the website. */
    currentVersionNumber: integer("current_version_number").notNull().default(0),
    publishedVersionNumber: integer("published_version_number"),
    responsibleStaffId: uuid("responsible_staff_id").references(() => staffAccounts.id),
  },
  (t) => [
    check(
      "listings_reserved_basis",
      sql`${t.commercialState} <> 'reserved' or ${t.reservationBasis} is not null`,
    ),
    index("listings_property_idx").on(t.propertyId),
  ],
);

/** Immutable snapshots; a database trigger rejects updates (see the constraints migration). */
export const listingVersions = pgTable(
  "listing_versions",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    versionNumber: integer("version_number").notNull(),
    /** SHA-256 of the canonical snapshot; approvals bind to it. */
    contentHash: text("content_hash").notNull(),
    sourceLocale: publicLocaleEnum("source_locale").notNull().default("bg"),
    /** Facts, commercial terms, media ids and source text as reviewed. */
    snapshot: jsonb("snapshot").notNull(),
    createdByStaffId: uuid("created_by_staff_id").references(() => staffAccounts.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("listing_versions_number_idx").on(t.listingId, t.versionNumber)],
);

export const facts = pgTable(
  "facts",
  {
    ...mutable(),
    propertyId: uuid("property_id").references(() => properties.id),
    listingId: uuid("listing_id").references(() => listings.id),
    /** Field key, e.g. price, bedrooms, rooms, area.living, feature.lift. */
    fieldKey: text("field_key").notNull(),
    state: factStateEnum("state").notNull(),
    /** The typed value when known (number, boolean, Money, Area, text). `false` is a value. */
    value: jsonb("value"),
    unit: text("unit"),
    basis: text("basis"),
    sourceClass: sourceClassEnum("source_class").notNull(),
    sourceReference: text("source_reference"),
    reviewedByStaffId: uuid("reviewed_by_staff_id").references(() => staffAccounts.id),
    reviewedAt: instant("reviewed_at"),
    observedAt: instant("observed_at"),
    note: text("note"),
  },
  (t) => [
    check("facts_one_subject", sql`num_nonnulls(${t.propertyId}, ${t.listingId}) = 1`),
    check("facts_value_matches_state", sql`(${t.state} = 'known') = (${t.value} is not null)`),
    uniqueIndex("facts_property_field_idx")
      .on(t.propertyId, t.fieldKey)
      .where(sql`${t.propertyId} is not null`),
    uniqueIndex("facts_listing_field_idx")
      .on(t.listingId, t.fieldKey)
      .where(sql`${t.listingId} is not null`),
  ],
);

/**
 * Typed projection for search (F02). Every filterable fact keeps its state next to its value
 * so SQL can apply the same unknown semantics as src/domain/search/filters.ts.
 */
export const listingSearchDocuments = pgTable(
  "listing_search_documents",
  {
    listingId: uuid("listing_id")
      .primaryKey()
      .references(() => listings.id),
    reference: text("reference").notNull(),
    purpose: listingPurposeEnum("purpose").notNull(),
    propertyType: propertyTypeEnum("property_type").notNull(),
    commercialState: commercialStateEnum("commercial_state").notNull(),
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
    /** Reference, place names and approved source text for full-text search. */
    searchText: text("search_text").notNull().default(""),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('simple', immutable_unaccent(search_text))`,
    ),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("listing_search_vector_idx").using("gin", t.searchVector),
    index("listing_search_reference_trgm_idx").using("gin", t.reference.op("gin_trgm_ops")),
    index("listing_search_place_ids_idx").using("gin", t.placeIds),
    index("listing_search_filter_idx").on(t.purpose, t.commercialState, t.propertyType),
  ],
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    ...mutable(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    listingId: uuid("listing_id").references(() => listings.id),
    /** R2 object key; staging keys are never served publicly. */
    r2Key: text("r2_key").notNull().unique(),
    storageArea: mediaStorageAreaEnum("storage_area").notNull().default("staging"),
    kind: mediaKindEnum("kind").notNull(),
    contentType: text("content_type").notNull(),
    /** Null only when never recorded (legacy objects); unknown is not zero. */
    byteSize: bigint("byte_size", { mode: "number" }),
    sha256: text("sha256"),
    width: integer("width"),
    height: integer("height"),
    rights: mediaRightsEnum("rights").notNull().default("unknown"),
    rightsHolder: text("rights_holder"),
    consentReference: text("consent_reference"),
    review: mediaReviewEnum("review").notNull().default("pending"),
    modification: mediaModificationEnum("modification").notNull().default("none"),
    modificationDisclosure: text("modification_disclosure"),
    /** The unmodified original this asset derives from, kept available. */
    originalAssetId: uuid("original_asset_id"),
    caption: text("caption"),
    altText: text("alt_text"),
    capturedAt: instant("captured_at"),
    sortOrder: integer("sort_order").notNull().default(0),
    legacyReference: text("legacy_reference"),
  },
  (t) => [
    check(
      "media_assets_content_type",
      sql`${t.contentType} in (${sqlList(allowedMediaContentTypes)})`,
    ),
    check(
      "media_assets_public_requires_clearance",
      sql`${t.storageArea} <> 'public' or (${t.rights} = 'cleared' and ${t.review} = 'approved')`,
    ),
    check(
      "media_assets_modification_disclosed",
      sql`${t.modification} = 'none' or ${t.modificationDisclosure} is not null`,
    ),
    index("media_assets_listing_idx").on(t.listingId, t.sortOrder),
    index("media_assets_property_idx").on(t.propertyId),
  ],
);

export const listingVersionMedia = pgTable(
  "listing_version_media",
  {
    listingVersionId: uuid("listing_version_id")
      .notNull()
      .references(() => listingVersions.id),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.listingVersionId, t.mediaAssetId] })],
);
