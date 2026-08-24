import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv.mjs";
import { approvedTranslationRecordsForListing, listingSourceSnapshot } from "./content.mjs";
import {
  derivePrimaryAreaSqm,
  enrichmentChecklistFor,
  LEGACY_PROPERTY_TAXONOMY,
  normalizeImportedFact,
  normalizeLegacyListingFacts,
} from "./listing-facts.mjs";
import { getLocale } from "./locales.mjs";
import { mediaWorkflow, normalizeMediaAsset } from "./media.mjs";
import { fromRoot } from "./paths.mjs";
import { isTranslationIndexable } from "./seo.mjs";
import { TOUR_PROVIDERS, TOUR_REVIEW_STATUSES, createTourField } from "./tours.mjs";

export const DEFAULT_MEDIA_INVENTORY_PATH = fromRoot("migration", "artifacts", "20260704-211155", "media-inventory.csv");
export const DEFAULT_CMS_SEED_OUTPUT = fromRoot("production", "data", "cms-seed.json");
export const DEFAULT_CMS_COLLECTIONS_OUTPUT = fromRoot("production", "data", "cms-collections.json");

export const ENRICHMENT_TASK_TYPE = "verify_imported_facts";
export const SEARCH_OUTBOX_SCHEMA_VERSION = 1;

export function propertyTaxonomyContract() {
  const version = normalizeLegacyListingFacts({ property_type: "property" }).facts.taxonomy_mapping_version;
  return {
    version,
    source: "production/lib/listing-facts.mjs#LEGACY_PROPERTY_TAXONOMY",
    mappings: Object.entries(LEGACY_PROPERTY_TAXONOMY).map(([legacy_property_type, mapping]) => ({
      legacy_property_type,
      property_family: mapping.family,
      property_subtype: mapping.subtype,
      review_status: mapping.review_status,
    })),
  };
}

function relationId(value) {
  if (value && typeof value === "object") return String(value.id || "").trim();
  return String(value || "").trim();
}

export function propertyIdForListing(listingId) {
  const id = relationId(listingId);
  if (!id) throw new Error("Property backfill requires a listing id");
  return `property-${id}`;
}

export function locationIdForLabel(label) {
  const normalized = String(label || "").trim().toLowerCase();
  return normalized ? `location:${normalized}` : null;
}

export function enrichmentTaskForListing({ listingId, propertyId, factFields = [], source = "legacy_backfill" }) {
  const listing = relationId(listingId);
  const property = relationId(propertyId);
  if (!listing || !property) throw new Error("Enrichment task requires listing and property ids");
  return {
    id: `enrichment-${listing}`,
    collection: "listing_enrichment_tasks",
    listing,
    property,
    task_type: ENRICHMENT_TASK_TYPE,
    task_state: "pending",
    idempotency_key: `listing:${listing}:${ENRICHMENT_TASK_TYPE}`,
    fact_fields: [...new Set(factFields)].sort(),
    source,
  };
}

export function searchOutboxEventForListing(listing, { eventType = "upsert", changeToken } = {}) {
  const listingId = relationId(listing);
  if (!listingId) throw new Error("Search outbox event requires a listing id");
  const token = String(changeToken || listing?.updatedAt || listing?.createdAt || "current");
  const idempotencyKey = `search:${listingId}:${eventType}:${token}`;
  return {
    listing: listingId,
    event_type: eventType,
    outbox_state: "pending",
    idempotency_key: idempotencyKey,
    // The worker resolves reviewed public facts itself; source copy and private coordinates never enter this payload.
    payload: { schema_version: SEARCH_OUTBOX_SCHEMA_VERSION, listing_id: listingId, change_token: token },
  };
}

export function loadMediaInventory(filePath = DEFAULT_MEDIA_INVENTORY_PATH) {
  return parseCsv(fs.readFileSync(filePath, "utf8"));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && value !== "" ? number : null;
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function mediaEntry(row, fallbackAlt = "") {
  return normalizeMediaAsset(row, {
    width: numberOrNull(row.width),
    height: numberOrNull(row.height),
    fallbackAlt,
  });
}

function verificationForImportedValue(field, value, listingId) {
  return {
    field,
    state: value === null || value === undefined || value === "" ? "unknown" : "entered_pending_review",
    source_type: "legacy_import",
    source_reference: listingId,
  };
}

function propertyFactsForListing(listing, snapshot, locationId) {
  const normalized = normalizeLegacyListingFacts({
    ...listing,
    ...snapshot,
    listing_status: listing.listing_status,
  });
  const facts = { ...normalized.facts };
  const family = facts.property_family;
  const subtype = facts.property_subtype;
  const sourceArea = numberOrNull(snapshot.area_sqm);
  const areaField =
    family === "commercial"
      ? "usable_area_sqm"
      : family === "hotel"
        ? "gross_floor_area_sqm"
        : family === "plot" || family === "agricultural_land"
          ? "land_area_sqm"
          : "built_area_sqm";

  if (sourceArea !== null && facts[areaField] == null) {
    const result = normalizeImportedFact(sourceArea, {
      field: areaField,
      family,
      subtype,
      source: { source_type: "legacy_import", source_reference: listing.id },
    });
    facts[areaField] = result.value;
    normalized.fact_verification.push({ field: areaField, ...result.verification });
    if (result.zero_value_audit) normalized.zero_value_audit.push(areaField);
  }

  const propertyFacts = {
    legacy_property_type: facts.legacy_property_type,
    location_id: locationId,
    location_label: snapshot.location,
    municipality: snapshot.municipality || null,
    district: snapshot.district || null,
    region_id: snapshot.region_id || null,
    country_code: snapshot.country_code || null,
    geography_id: snapshot.geography_id || null,
    geography_path: snapshot.geography_path || [],
    condition: snapshot.condition || null,
    construction_status: facts.construction_status ?? null,
    parking_kind: facts.parking_kind ?? null,
    living_area_sqm: facts.living_area_sqm ?? null,
    built_area_sqm: facts.built_area_sqm ?? null,
    usable_area_sqm: facts.usable_area_sqm ?? null,
    gross_floor_area_sqm: facts.gross_floor_area_sqm ?? null,
    land_area_sqm: facts.land_area_sqm ?? null,
    bedrooms_count: facts.bedrooms_count ?? null,
    premises_count: facts.premises_count ?? null,
    hotel_room_count: facts.hotel_room_count ?? null,
    floor_number: facts.floor_number ?? null,
    total_floors: facts.total_floors ?? null,
    storeys_count: facts.storeys_count ?? null,
    zoning_status: facts.zoning_status ?? null,
    utilities_status: facts.utilities_status ?? null,
    road_access_status: facts.road_access_status ?? null,
    land_category: facts.land_category ?? null,
    permanent_use: facts.permanent_use ?? null,
    permitted_use: facts.permitted_use ?? null,
    public_location_precision: snapshot.location_precision || "approximate",
    primary_area_sqm: derivePrimaryAreaSqm(facts),
  };
  const verificationByField = new Map(
    normalized.fact_verification
      .filter((entry) => entry.field !== "price_amount")
      .map((entry) => [entry.field, entry]),
  );
  for (const [field, value] of Object.entries(propertyFacts)) {
    if (!verificationByField.has(field)) verificationByField.set(field, verificationForImportedValue(field, value, listing.id));
  }

  return {
    id: propertyIdForListing(listing.id),
    collection: "properties",
    location: locationId,
    property_family: family,
    property_subtype: subtype,
    taxonomy_mapping_version: facts.taxonomy_mapping_version,
    taxonomy_review_status: facts.taxonomy_review_status,
    facts: propertyFacts,
    fact_verification: [...verificationByField.values()],
    zero_value_audit: [...new Set(normalized.zero_value_audit)],
    legacy_listing_id: listing.id,
  };
}

// The operator publication approval is the only thing that flips a crawled
// listing from "source imported, review required" to "published". Review data
// (facts, verification, media, translations) is copied through untouched, so
// every admin quality queue keeps showing the same outstanding work.
function publishedListingState(approval, listingId) {
  if (!approval?.listing_ids?.includes(listingId)) return null;
  return {
    cms_status: "published",
    workflow: {
      publish_approved: true,
      publish_approved_at: approval.approved_at,
      publish_approved_by: approval.approved_by,
    },
  };
}

export function buildCmsSeed(registry, { listings, migrationRecords, routeMap, mediaRows, publicationApproval = null }) {
  const migrationByUrl = new Map(migrationRecords.map((record) => [record.old_url, record]));
  const routeByUrl = new Map(routeMap.map((route) => [route.old_url, route]));
  const mediaByUrl = groupBy(mediaRows, (row) => row.page_url);

  const locationsById = new Map();
  const properties = [];
  const enrichmentTasks = [];
  const records = listings.map((listing) => {
    const migration = migrationByUrl.get(listing.url);
    const route = routeByUrl.get(listing.url);
    const translations = approvedTranslationRecordsForListing(registry, listing).map((translation) => {
      const locale = getLocale(registry, translation.locale);
      return {
        ...translation,
        direction: locale.direction,
        public_indexable: isTranslationIndexable(registry, translation),
      };
    });

    const fallbackAlt = listing.h1 || listing.title || listing.id;
    const media = (mediaByUrl.get(listing.url) || []).map((row) => mediaEntry(row, fallbackAlt));
    const snapshot = listingSourceSnapshot(listing);
    if (snapshot.price_on_request) snapshot.price_eur = null;
    const locationId = locationIdForLabel(snapshot.location);
    if (locationId) {
      const existingLocation = locationsById.get(locationId);
      if (existingLocation && existingLocation.label !== snapshot.location) {
        throw new Error(`Location id collision for ${snapshot.location}`);
      }
      if (!existingLocation) {
        locationsById.set(locationId, {
          id: locationId,
          collection: "locations",
          label: snapshot.location,
          public_location_precision: snapshot.location_precision === "area_only" ? "locality" : snapshot.location_precision || "approximate",
        });
      }
    }
    const property = propertyFactsForListing(listing, snapshot, locationId);
    properties.push(property);
    enrichmentTasks.push(
      enrichmentTaskForListing({
        listingId: listing.id,
        propertyId: property.id,
        factFields: enrichmentChecklistFor(property).filter((item) => item.needs_enrichment).map((item) => item.field),
      }),
    );

    const publication = publishedListingState(publicationApproval, listing.id);

    return {
      id: listing.id,
      collection: "listings",
      cms_status: publication?.cms_status || "source_imported_review_required",
      ...(publication ? { workflow: publication.workflow } : {}),
      source_locale: listing.locale,
      source_domain: listing.domain,
      source_url: listing.url,
      facts: snapshot,
      property: property.id,
      location: locationId,
      seo: {
        title: listing.title || "",
        description: migration?.source_seo?.meta_description || "",
        canonical: listing.canonical || listing.url,
        schema_present: Boolean(listing.schema_present),
      },
      translations: translations.map((translation) => ({ ...translation, listing: listing.id, translation_state: translation.status })),
      media,
      media_workflow: mediaWorkflow(media),
      tour: createTourField({ listingId: listing.id, media }),
      migration: migration
        ? {
            record_id: migration.id,
            review_state: migration.review_state,
            metadata_gaps: migration.metadata_gaps,
            source_seo: {
              meta_description: migration.source_seo?.meta_description || "",
              open_graph: migration.source_seo?.open_graph || "",
            },
          }
        : null,
      routing: route
        ? {
            target_path: route.target_path,
            target_locale: route.target_locale,
            planned_status: route.planned_status,
            deployable: route.deployable,
            review_required: route.review_required,
          }
        : null,
    };
  });

  const locations = [...locationsById.values()].sort((left, right) => left.id.localeCompare(right.id));

  const translationRows = records.flatMap((record) => record.translations);
  const mediaAssets = records.reduce((total, record) => total + record.media.length, 0);
  const mediaWithAlt = records.reduce((total, record) => total + record.media.filter((media) => media.alt).length, 0);
  const publicGalleryAssets = records.reduce((total, record) => total + record.media_workflow.public_gallery_assets, 0);
  const floorPlanCandidates = records.reduce((total, record) => total + record.media_workflow.floor_plan_candidates, 0);
  const videoCandidates = records.reduce((total, record) => total + record.media_workflow.video_candidates, 0);
  const mediaReviewGatedAssets = records.reduce((total, record) => total + record.media_workflow.review_gated_assets, 0);
  const tourFields = records.filter((record) => record.tour).length;
  const publicTours = records.filter((record) => record.tour?.is_public).length;

  return {
    artifact_id: "cms-seed-20260730",
    taxonomy_contract: propertyTaxonomyContract(),
    publication_approval: publicationApproval
      ? {
          approval_id: publicationApproval.approval_id,
          scope: publicationApproval.scope,
          decision: publicationApproval.decision,
          approved_by: publicationApproval.approved_by,
          approved_at: publicationApproval.approved_at,
          reason: publicationApproval.reason || null,
          published_listings: publicationApproval.listing_ids.length,
          excluded_listings: publicationApproval.excluded_listings,
        }
      : null,
    summary: {
      listings: records.length,
      properties: properties.length,
      locations: locations.length,
      enrichmentTasks: enrichmentTasks.length,
      bySourceLocale: countBy(records, (record) => record.source_locale),
      translationLocales: countBy(translationRows, (translation) => translation.locale),
      mediaAssets,
      mediaWithAlt,
      publicGalleryAssets,
      floorPlanCandidates,
      videoCandidates,
      mediaReviewGatedAssets,
      tourFields,
      publicTours,
      publishedListings: records.filter((record) => record.cms_status === "published").length,
      publicationExcludedListings: publicationApproval?.excluded_listings?.length || 0,
      missingMigrationRecords: records.filter((record) => !record.migration).length,
      missingRouteRows: records.filter((record) => !record.routing).length,
      reviewRequiredRoutes: records.filter((record) => record.routing?.review_required).length,
      deployableRoutes: records.filter((record) => record.routing?.deployable).length,
    },
    records,
    properties,
    locations,
    enrichment_tasks: enrichmentTasks,
  };
}

export function assertCmsSeed(seed) {
  if (seed.summary.listings !== 165) throw new Error(`Expected 165 CMS listing records, got ${seed.summary.listings}`);
  if (seed.summary.properties !== seed.summary.listings) throw new Error("Every legacy listing must map to one Property");
  if (!seed.summary.locations) throw new Error("CMS seed must contain Locations");
  if (!Array.isArray(seed.locations) || seed.locations.some((location) => !["exact", "approximate", "locality"].includes(location.public_location_precision))) {
    throw new Error("Location collection precision must be exact, approximate, or locality");
  }
  if (seed.summary.enrichmentTasks !== seed.summary.listings) throw new Error("Every legacy listing must receive one enrichment task");
  if (seed.summary.bySourceLocale.bg !== 113) throw new Error("Expected 113 BG CMS source listings");
  if (seed.summary.bySourceLocale.ru !== 52) throw new Error("Expected 52 RU CMS source listings");
  if (seed.summary.translationLocales.el !== 1 || seed.summary.translationLocales.he !== 1) {
    throw new Error("Expected one approved Greek and Hebrew translation seed");
  }
  if (seed.summary.translationLocales.fr) throw new Error("French CMS translations must not be seeded before approval");
  if (seed.summary.mediaAssets !== 4978) throw new Error(`Expected 4978 listing media rows, got ${seed.summary.mediaAssets}`);
  if (seed.summary.publicGalleryAssets <= 0) throw new Error("CMS seed must expose reviewed imported photo gallery assets");
  if (seed.summary.mediaReviewGatedAssets <= 0) throw new Error("CMS seed must keep non-gallery media review-gated");
  if (seed.summary.videoCandidates !== 0) throw new Error("Crawl seed must not invent listing video assets");
  if (seed.summary.tourFields !== 165) throw new Error("Expected one draft 360 tour field per CMS listing");
  if (seed.summary.publicTours !== 0) throw new Error("Crawl seed must not publish unreviewed 360 tours");
  if (seed.summary.missingMigrationRecords !== 0) throw new Error("Every CMS listing needs a migration record");
  if (seed.summary.missingRouteRows !== 0) throw new Error("Every CMS listing needs a route row");
  if (seed.summary.deployableRoutes !== 0) throw new Error("CMS seed routes must stay review-gated");
  if (seed.records.some((record) => record.facts.price_on_request && record.facts.price_eur !== null)) {
    throw new Error("Price-on-request listings must not project a price_eur value");
  }
  if (seed.records.some((record) => String(record.seo?.description || "").length > 320)) {
    throw new Error("Listing seo.description must be 320 characters or fewer");
  }
  if (!seed.taxonomy_contract?.version || !Array.isArray(seed.taxonomy_contract.mappings)) {
    throw new Error("CMS seed must expose the versioned legacy property taxonomy contract");
  }
  if (seed.properties?.some((property) => !Array.isArray(property.fact_verification))) {
    throw new Error("Property backfill must retain fact verification metadata");
  }
  if (seed.enrichment_tasks?.some((task) => !task.idempotency_key || task.task_type !== ENRICHMENT_TASK_TYPE)) {
    throw new Error("Enrichment tasks must be idempotent per listing");
  }
  return seed.summary;
}

export function writeCmsSeed(seed, outPath = DEFAULT_CMS_SEED_OUTPUT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const summary = assertCmsSeed(seed);
  fs.writeFileSync(outPath, `${JSON.stringify(seed, null, 2)}\n`);
  return { outPath, summary };
}

function collectionField(name, type, options = {}) {
  return {
    name,
    type,
    required: false,
    localized: false,
    ...options,
  };
}

const REQUIRED_COLLECTION_FIELDS = {
  listings: {
    id: "text",
    cms_status: "select",
    source_locale: "relationship",
    source_domain: "text",
    source_url: "url",
    facts: "group",
    seo: "group",
    property: "relationship",
  },
  listing_translations: {
    listing: "relationship",
    locale: "relationship",
    source_locale: "relationship",
    status: "select",
    translation_state: "select",
    source_hash: "text",
    translated_hash: "text",
  },
  media_assets: {
    url: "url",
    kind: "select",
    is_public: "checkbox",
    review_status: "select",
  },
  listing_tours: {
    provider: "select",
    listing_id: "relationship",
    hotspots: "array",
    is_public: "checkbox",
    review_status: "select",
  },
  properties: {
    id: "text",
    facts: "group",
    fact_verification: "array",
  },
  locations: {
    id: "text",
    label: "text",
  },
  listing_enrichment_tasks: {
    id: "text",
    listing: "relationship",
    property: "relationship",
    task_type: "select",
    task_state: "select",
    idempotency_key: "text",
  },
  search_outbox: {
    id: "text",
    event_type: "select",
    outbox_state: "select",
    idempotency_key: "text",
    payload: "json",
  },
};

const TYPED_OPTIONAL_COLLECTION_FIELDS = {
  listings: { workflow: "group", location: "relationship" },
  properties: { location: "relationship" },
};

export function buildCmsCollections(seed) {
  const listings = seed.records.filter((record) => record.collection === "listings");
  const translationRecords = listings.flatMap((record) => record.translations || []);
  const mediaRecords = listings.flatMap((record) => record.media || []);
  const tourRecords = listings.map((record) => record.tour).filter(Boolean);
  const properties = seed.properties || [];
  const locations = seed.locations || [];
  const enrichmentTasks = seed.enrichment_tasks || [];

  return {
    artifact_id: "cms-collections-20260730",
    source_artifact: seed.artifact_id,
    taxonomy_contract: seed.taxonomy_contract,
    summary: {
      collections: 8,
      records: {
        listings: listings.length,
        properties: properties.length,
        locations: locations.length,
        listing_translations: translationRecords.length,
        media_assets: mediaRecords.length,
        listing_tours: tourRecords.length,
        listing_enrichment_tasks: enrichmentTasks.length,
        search_outbox: 0,
      },
      public_tours: tourRecords.filter((tour) => tour.is_public).length,
    },
    collections: [
      {
        slug: "listings",
        records: listings.length,
        source: "production/data/cms-seed.json records[collection=listings]",
        workflow: ["source_imported_review_required", "draft", "review", "published", "archived"],
        publish_requires_human_review: true,
        fields: [
          collectionField("id", "text", { required: true, unique: true }),
          collectionField("cms_status", "select", {
            required: true,
            options: ["source_imported_review_required", "draft", "review", "published", "archived"],
          }),
          collectionField("source_locale", "relationship", { required: true, relationTo: "locales" }),
          collectionField("source_domain", "text", { required: true }),
          collectionField("source_url", "url", { required: true, unique: true }),
          collectionField("facts", "group", {
            required: true,
            fields: [
              "title",
              "h1",
              "description",
              "location",
              "location_native",
              "location_legacy",
              "municipality",
              "municipality_code",
              "district",
              "district_code",
              "region",
              "region_id",
              "country_code",
              "geography_id",
              "geography_path",
              "settlement_ekatte",
              "location_review_status",
              "property_type",
              "offer_type",
              "bedrooms",
              "bedrooms_not_applicable",
              "price_eur",
              "price_on_request",
              "image_count",
              "area_sqm",
              "floor",
              "total_floors",
              "land_area_sqm",
              "condition",
              "location_precision",
            ],
          }),
          collectionField("seo", "group", {
            required: true,
            fields: ["title", "description", "canonical", "schema_present"],
          }),
          collectionField("workflow", "group", {
            fields: [
              "availability_verified_at",
              "availability_verified_by",
              "location_verified_at",
              "location_verified_by",
              "price_verified_at",
              "price_verified_by",
              "price_on_request_verified_at",
              "price_on_request_verified_by",
              "publish_approved",
              "publish_approved_at",
              "publish_approved_by",
              "last_edited_at",
              "last_editor",
            ],
          }),
          collectionField("property", "relationship", { required: true, relationTo: "properties" }),
          collectionField("location", "relationship", { relationTo: "locations" }),
          collectionField("translations", "relationship", {
            hasMany: true,
            relationTo: "listing_translations",
            admin: { readOnly: true },
          }),
          collectionField("media", "relationship", {
            hasMany: true,
            relationTo: "media_assets",
            admin: { readOnly: true },
          }),
          collectionField("tour", "relationship", {
            relationTo: "listing_tours",
            admin: { readOnly: true },
          }),
          collectionField("routing", "group", { fields: ["target_path", "target_locale", "planned_status", "deployable"] }),
          collectionField("migration", "group", { fields: ["record_id", "review_state", "metadata_gaps"] }),
        ],
      },
      {
        slug: "listing_translations",
        records: translationRecords.length,
        source: "listings.translations",
        workflow: ["missing", "draft", "hermes_drafted", "human_edited", "approved", "published", "stale"],
        publish_requires_human_review: true,
        fields: [
          collectionField("listing", "relationship", { required: true, relationTo: "listings" }),
          collectionField("locale", "relationship", { required: true, relationTo: "locales" }),
          collectionField("source_locale", "relationship", { required: true, relationTo: "locales" }),
          collectionField("status", "select", {
            required: true,
            options: ["missing", "draft", "hermes_drafted", "human_edited", "approved", "published", "stale"],
          }),
          collectionField("translation_state", "select", {
            required: true,
            options: ["missing", "draft", "hermes_drafted", "human_edited", "approved", "published", "stale"],
          }),
          collectionField("source_hash", "text", { required: true }),
          collectionField("translated_hash", "text", { required: true }),
          collectionField("reviewer", "text"),
          collectionField("approved_at", "date", { required_when: ["approved", "published"] }),
          collectionField("direction", "select", { options: ["ltr", "rtl"] }),
          collectionField("public_indexable", "checkbox", { admin: { readOnly: true } }),
        ],
      },
      {
        slug: "properties",
        records: properties.length,
        source: "CMS seed property backfill",
        workflow: ["source_imported_review_required", "enriched", "broker_verified"],
        publish_requires_human_review: true,
        versions: false,
        fields: [
          collectionField("id", "text", { required: true, unique: true }),
          collectionField("location", "relationship", { relationTo: "locations" }),
          collectionField("property_family", "select", {
            options: ["apartment", "house", "plot", "agricultural_land", "commercial", "hotel"],
          }),
          collectionField("property_subtype", "text"),
          collectionField("taxonomy_mapping_version", "text", { required: true }),
          collectionField("taxonomy_review_status", "select", {
            required: true,
            options: ["mapped", "mapping_review_required"],
          }),
          collectionField("facts", "group", { required: true }),
          collectionField("fact_verification", "array", { required: true }),
          collectionField("zero_value_audit", "json"),
          collectionField("legacy_listing_id", "text", { required: true, unique: true }),
        ],
      },
      {
        slug: "locations",
        records: locations.length,
        source: "CMS seed location backfill",
        workflow: ["source_imported_review_required", "broker_verified"],
        publish_requires_human_review: true,
        versions: false,
        fields: [
          collectionField("id", "text", { required: true, unique: true }),
          collectionField("label", "text", { required: true, unique: true }),
          collectionField("public_location_precision", "select", {
            required: true,
            options: ["exact", "approximate", "locality"],
          }),
          collectionField("internal_latitude", "number"),
          collectionField("internal_longitude", "number"),
          collectionField("public_latitude", "number"),
          collectionField("public_longitude", "number"),
        ],
      },
      {
        slug: "listing_enrichment_tasks",
        records: enrichmentTasks.length,
        source: "CMS seed legacy backfill",
        workflow: ["pending", "in_progress", "completed", "skipped"],
        publish_requires_human_review: true,
        versions: false,
        fields: [
          collectionField("id", "text", { required: true, unique: true }),
          collectionField("listing", "relationship", { required: true, relationTo: "listings" }),
          collectionField("property", "relationship", { required: true, relationTo: "properties" }),
          collectionField("task_type", "select", { required: true, options: [ENRICHMENT_TASK_TYPE] }),
          collectionField("task_state", "select", { required: true, options: ["pending", "in_progress", "completed", "skipped"] }),
          collectionField("idempotency_key", "text", { required: true, unique: true }),
          collectionField("fact_fields", "json"),
          collectionField("source", "select", { required: true, options: ["legacy_backfill", "listing_change"] }),
        ],
      },
      {
        slug: "search_outbox",
        records: 0,
        source: "Payload listing hooks",
        workflow: ["pending", "processing", "completed", "failed"],
        publish_requires_human_review: true,
        versions: false,
        fields: [
          collectionField("id", "text", { required: true, unique: true }),
          collectionField("listing", "relationship", { relationTo: "listings" }),
          collectionField("event_type", "select", { required: true, options: ["upsert", "delete"] }),
          collectionField("outbox_state", "select", { required: true, options: ["pending", "processing", "completed", "failed"] }),
          collectionField("idempotency_key", "text", { required: true, unique: true }),
          collectionField("payload", "json", { required: true }),
          collectionField("attempts", "number", { required: true, defaultValue: 0 }),
          collectionField("last_error", "text"),
        ],
      },
      {
        slug: "media_assets",
        records: mediaRecords.length,
        source: "listings.media",
        workflow: ["approved_imported_photo", "reviewed_private", "review_required"],
        publish_requires_human_review: true,
        fields: [
          collectionField("url", "url", { required: true, unique: true }),
          collectionField("asset_url", "url"),
          collectionField("alt", "text", { localized: true }),
          collectionField("width", "number"),
          collectionField("height", "number"),
          collectionField("kind", "select", {
            required: true,
            options: ["photo", "floor_plan", "site_chrome", "document", "unknown"],
          }),
          collectionField("is_public", "checkbox", { required: true }),
          collectionField("review_status", "select", {
            required: true,
            options: ["approved_imported_photo", "reviewed_private", "review_required"],
          }),
        ],
      },
      {
        slug: "listing_tours",
        records: tourRecords.length,
        source: "listings.tour",
        workflow: [...TOUR_REVIEW_STATUSES],
        publish_requires_human_review: true,
        fields: [
          collectionField("provider", "select", {
            required: true,
            options: [...TOUR_PROVIDERS],
          }),
          collectionField("listing_id", "relationship", { required: true, relationTo: "listings" }),
          collectionField("panorama_url", "url", {
            admin: { description: "Required for approved Photo Sphere Viewer tours." },
          }),
          collectionField("viewer_url", "url", {
            admin: { description: "Required for approved SuperSplat Viewer tours." },
          }),
          collectionField("thumbnail_url", "url"),
          collectionField("hotspots", "array", { required: true }),
          collectionField("is_public", "checkbox", { required: true }),
          collectionField("accessibility_caption", "textarea", {
            required_when: ["approved", "published"],
            localized: true,
          }),
          collectionField("review_status", "select", {
            required: true,
            options: [...TOUR_REVIEW_STATUSES],
          }),
          collectionField("fallback_gallery", "array", { admin: { readOnly: true } }),
        ],
      },
    ],
  };
}

export function assertCmsCollections(manifest) {
  const slugs = manifest.collections.map((collection) => collection.slug);
  if (manifest.summary.collections !== 8) throw new Error("Expected 8 implemented CMS collection contracts");
  for (const slug of [
    "listings",
    "properties",
    "locations",
    "listing_translations",
    "media_assets",
    "listing_tours",
    "listing_enrichment_tasks",
    "search_outbox",
  ]) {
    if (!slugs.includes(slug)) throw new Error(`Missing CMS collection contract: ${slug}`);
    if (!Number.isInteger(manifest.summary.records[slug])) throw new Error(`CMS collection contract has no record count: ${slug}`);
  }
  if (manifest.summary.records.listings !== 165) throw new Error("Listings collection must cover all migrated listings");
  if (manifest.summary.records.media_assets !== 4978) throw new Error("Media collection must cover all listing media assets");
  if (manifest.summary.records.listing_tours !== 165) throw new Error("Tour collection must expose one review-gated tour per listing");
  if (manifest.summary.records.properties !== 165) throw new Error("Property collection must backfill every legacy listing");
  if (!manifest.summary.records.locations) throw new Error("Location collection must backfill imported locations");
  if (manifest.summary.records.listing_enrichment_tasks !== 165) throw new Error("Every legacy listing must have an enrichment task");
  if (manifest.summary.records.search_outbox !== 0) throw new Error("Search outbox must start empty");
  if (!manifest.taxonomy_contract?.version || !Array.isArray(manifest.taxonomy_contract.mappings)) {
    throw new Error("CMS collection manifest must retain the versioned property taxonomy contract");
  }
  if (manifest.summary.public_tours !== 0) throw new Error("CMS collection manifest must not publish unreviewed tours");
  if (manifest.collections.some((collection) => collection.publish_requires_human_review !== true)) {
    throw new Error("CMS collection publishing must stay human-review gated");
  }
  for (const collection of manifest.collections) {
    const requiredFields = REQUIRED_COLLECTION_FIELDS[collection.slug];
    if (!requiredFields) throw new Error(`Unexpected CMS collection contract: ${collection.slug}`);
    if (!Array.isArray(collection.fields) || collection.fields.length === 0) {
      throw new Error(`CMS collection has no typed fields: ${collection.slug}`);
    }
    const fieldMap = new Map(collection.fields.map((field) => [field.name, field]));
    for (const [name, type] of Object.entries(requiredFields)) {
      const field = fieldMap.get(name);
      if (!field) throw new Error(`Missing required CMS field ${collection.slug}.${name}`);
      if (field.type !== type) throw new Error(`CMS field ${collection.slug}.${name} expected type ${type}, got ${field.type}`);
      if (field.required !== true) throw new Error(`CMS field ${collection.slug}.${name} must be required`);
    }
    for (const [name, type] of Object.entries(TYPED_OPTIONAL_COLLECTION_FIELDS[collection.slug] || {})) {
      const field = fieldMap.get(name);
      if (!field || field.type !== type) {
        throw new Error(`CMS collection must expose typed optional field ${collection.slug}.${name}`);
      }
    }
    for (const field of collection.fields) {
      if (!field.name || !field.type || typeof field.required !== "boolean") {
        throw new Error(`CMS collection field is not implementation-ready: ${collection.slug}`);
      }
    }
  }
  return manifest.summary;
}

export function writeCmsCollections(manifest, outPath = DEFAULT_CMS_COLLECTIONS_OUTPUT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const summary = assertCmsCollections(manifest);
  fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { outPath, summary };
}

export function loadCmsCollections(filePath = DEFAULT_CMS_COLLECTIONS_OUTPUT) {
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assertCmsCollections(manifest);
  return manifest;
}
