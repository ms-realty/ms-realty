export const FACT_VERIFICATION_STATES = Object.freeze([
  "unknown",
  "not_applicable",
  "entered_pending_review",
  "broker_verified",
]);

export const CANONICAL_PROPERTY_FAMILIES = Object.freeze([
  "apartment",
  "house",
  "plot",
  "agricultural_land",
  "commercial",
  "hotel",
]);

const ALL_FAMILIES = Object.freeze([...CANONICAL_PROPERTY_FAMILIES]);

const COMMON_PROPERTY_FACTS = Object.freeze([
  "property_family",
  "property_subtype",
  "location_id",
  "location_label",
  "internal_latitude",
  "internal_longitude",
  "public_latitude",
  "public_longitude",
  "public_location_precision",
  "condition",
  "construction_status",
  "parking_kind",
]);

const FAMILY_FACTS = Object.freeze({
  apartment: Object.freeze([
    "living_area_sqm",
    "built_area_sqm",
    "usable_area_sqm",
    "bedrooms_count",
    "floor_number",
    "total_floors",
    "parking_kind",
    "land_area_sqm",
    "construction_status",
  ]),
  house: Object.freeze([
    "built_area_sqm",
    "living_area_sqm",
    "bedrooms_count",
    "storeys_count",
    "land_area_sqm",
    "parking_kind",
    "construction_status",
  ]),
  plot: Object.freeze(["land_area_sqm", "zoning_status", "utilities_status", "road_access_status"]),
  agricultural_land: Object.freeze(["land_area_sqm", "land_category", "permanent_use", "road_access_status"]),
  commercial: Object.freeze([
    "premises_count",
    "usable_area_sqm",
    "gross_floor_area_sqm",
    "floor_number",
    "total_floors",
    "parking_kind",
    "permitted_use",
  ]),
  hotel: Object.freeze(["hotel_room_count", "gross_floor_area_sqm", "land_area_sqm", "storeys_count", "parking_kind"]),
});

const PRIMARY_AREA_FIELDS = Object.freeze({
  apartment: Object.freeze(["living_area_sqm", "built_area_sqm", "usable_area_sqm"]),
  house: Object.freeze(["built_area_sqm", "living_area_sqm"]),
  plot: Object.freeze(["land_area_sqm"]),
  agricultural_land: Object.freeze(["land_area_sqm"]),
  commercial: Object.freeze(["usable_area_sqm", "gross_floor_area_sqm"]),
  hotel: Object.freeze(["gross_floor_area_sqm", "built_area_sqm"]),
});

export const LEGACY_PROPERTY_TAXONOMY = Object.freeze({
  apartment: Object.freeze({ family: "apartment", subtype: "apartment", review_status: "mapped" }),
  multi_unit: Object.freeze({ family: "apartment", subtype: "development", review_status: "mapped" }),
  house: Object.freeze({ family: "house", subtype: "house", review_status: "mapped" }),
  villa: Object.freeze({ family: "house", subtype: "villa", review_status: "mapped" }),
  land: Object.freeze({ family: "plot", subtype: null, review_status: "mapping_review_required" }),
  plot: Object.freeze({ family: "plot", subtype: "building_plot", review_status: "mapped" }),
  agricultural_land: Object.freeze({ family: "agricultural_land", subtype: null, review_status: "mapped" }),
  commercial: Object.freeze({ family: "commercial", subtype: "other_commercial", review_status: "mapped" }),
  hotel: Object.freeze({ family: "hotel", subtype: "hotel", review_status: "mapped" }),
  property: Object.freeze({ family: null, subtype: null, review_status: "mapping_review_required" }),
});

const NUMERIC_FACTS = new Set([
  "bedrooms_count",
  "premises_count",
  "hotel_room_count",
  "floor_number",
  "total_floors",
  "storeys_count",
  "living_area_sqm",
  "built_area_sqm",
  "usable_area_sqm",
  "gross_floor_area_sqm",
  "land_area_sqm",
  "internal_latitude",
  "internal_longitude",
  "public_latitude",
  "public_longitude",
  "price_amount",
]);

const INTEGER_FACTS = new Set([
  "bedrooms_count",
  "premises_count",
  "hotel_room_count",
  "floor_number",
  "total_floors",
  "storeys_count",
]);

const COORDINATE_LIMITS = Object.freeze({
  internal_latitude: [-90, 90],
  public_latitude: [-90, 90],
  internal_longitude: [-180, 180],
  public_longitude: [-180, 180],
});

const COMMON_LISTING_FACTS = Object.freeze([
  "listing_reference",
  "offer_type",
  "listing_status",
  "price_amount",
  "price_currency",
  "price_period",
  "price_on_request",
  "publication_state",
]);

export const PROPERTY_FIELD_REGISTRY = Object.freeze(
  Object.fromEntries([
    ...COMMON_PROPERTY_FACTS.map((name) => [name, Object.freeze({ scope: "property", type: NUMERIC_FACTS.has(name) ? "number" : "text", families: ALL_FAMILIES })]),
    ...Object.entries(FAMILY_FACTS).flatMap(([family, fields]) =>
      fields.map((name) => [name, Object.freeze({ scope: "property", type: NUMERIC_FACTS.has(name) ? "number" : "text", families: [family] })]),
    ),
    ...COMMON_LISTING_FACTS.map((name) => [name, Object.freeze({ scope: "listing", type: NUMERIC_FACTS.has(name) ? "number" : "text", families: ALL_FAMILIES })]),
  ]),
);

const LEGACY_FACT_ALIASES = Object.freeze({
  bedrooms: "bedrooms_count",
  floor: "floor_number",
  price_eur: "price_amount",
});

function normalizedFamily(value) {
  const family = String(value || "").trim().toLowerCase();
  return CANONICAL_PROPERTY_FAMILIES.includes(family) ? family : null;
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function taxonomyForLegacyPropertyType(propertyType) {
  const key = String(propertyType || "").trim().toLowerCase();
  return LEGACY_PROPERTY_TAXONOMY[key] || Object.freeze({ family: null, subtype: null, review_status: "mapping_review_required" });
}

export function propertyFamilyFor(facts = {}) {
  return normalizedFamily(facts.property_family) || taxonomyForLegacyPropertyType(facts.legacy_property_type || facts.property_type).family;
}

export function propertySubtypeFor(facts = {}) {
  return String(facts.property_subtype || "").trim() || taxonomyForLegacyPropertyType(facts.legacy_property_type || facts.property_type).subtype;
}

export function applicableFactFields(family, subtype = null) {
  const normalized = normalizedFamily(family);
  if (!normalized) return [];
  const fields = new Set([...COMMON_PROPERTY_FACTS, ...FAMILY_FACTS[normalized]]);
  if (normalized === "apartment" && subtype === "development") fields.delete("bedrooms_count");
  return [...fields];
}

export function isFactApplicable(family, field, subtype = null) {
  const definition = PROPERTY_FIELD_REGISTRY[field];
  if (!definition) return false;
  if (definition.scope === "listing") return true;
  return applicableFactFields(family, subtype).includes(field);
}

export function bedroomsRequired(facts = {}) {
  const family = propertyFamilyFor(facts);
  const subtype = propertySubtypeFor(facts);
  return isFactApplicable(family, "bedrooms_count", subtype);
}

export function derivePrimaryAreaSqm(facts = {}) {
  const field = primaryAreaFieldFor(facts);
  return field ? numericValue(facts[field]) : null;
}

export function primaryAreaFieldFor(facts = {}) {
  const family = propertyFamilyFor(facts);
  if (!family) return null;
  for (const field of PRIMARY_AREA_FIELDS[family] || []) {
    const value = numericValue(facts[field]);
    if (value !== null && value > 0) return field;
  }
  return null;
}

export function normalizeImportedFact(value, { field, family, subtype, verification = {}, source = {} } = {}) {
  if (!PROPERTY_FIELD_REGISTRY[field]) throw new Error(`Unknown property fact: ${field}`);
  if (!isFactApplicable(family, field, subtype)) {
    return {
      value: null,
      verification: { state: "not_applicable", ...source },
      zero_value_audit: false,
    };
  }

  const state = FACT_VERIFICATION_STATES.includes(verification.state) ? verification.state : null;
  if (!NUMERIC_FACTS.has(field)) {
    if (value === null || value === undefined || value === "") {
      return { value: null, verification: { state: "unknown", ...source }, zero_value_audit: false };
    }
    return { value, verification: { state: state || "entered_pending_review", ...source }, zero_value_audit: false };
  }

  const numeric = numericValue(value);
  if (numeric === null) return { value: null, verification: { state: "unknown", ...source }, zero_value_audit: false };
  if (INTEGER_FACTS.has(field) && !Number.isInteger(numeric)) throw new Error(`${field} must be an integer`);
  const coordinateLimits = COORDINATE_LIMITS[field];
  if (coordinateLimits && (numeric < coordinateLimits[0] || numeric > coordinateLimits[1])) {
    throw new Error(`${field} is outside its valid coordinate range`);
  }
  if (!coordinateLimits && numeric < 0) throw new Error(`${field} must not be negative`);

  const verifiedZero = state === "broker_verified" && (field !== "bedrooms_count" || subtype === "studio");
  if (numeric === 0 && !verifiedZero) {
    return {
      value: null,
      verification: { state: "unknown", ...source },
      zero_value_audit: true,
    };
  }
  return {
    value: numeric,
    verification: { state: state || "entered_pending_review", ...source },
    zero_value_audit: false,
  };
}

export function normalizeLegacyListingFacts(listing = {}) {
  const taxonomy = taxonomyForLegacyPropertyType(listing.property_type);
  const family = taxonomy.family;
  const subtype = taxonomy.subtype;
  const priceOnRequest = listing.price_on_request === true;
  const normalized = {
    legacy_property_type: listing.property_type || "",
    property_family: family,
    property_subtype: subtype,
    taxonomy_mapping_version: "2026-07-30",
    taxonomy_review_status: taxonomy.review_status,
    listing_reference: listing.listing_reference || listing.id || null,
    offer_type: listing.offer_type || null,
    listing_status: listing.listing_status || "available",
    price_currency: listing.price_currency || "EUR",
    price_period: listing.price_period || null,
    price_on_request: priceOnRequest,
    public_location_precision: listing.location_precision || "approximate",
  };
  const values = {
    bedrooms_count: listing.bedrooms,
    floor_number: listing.floor,
    total_floors: listing.total_floors,
    land_area_sqm: listing.land_area_sqm,
    price_amount: priceOnRequest ? null : listing.price_eur,
  };
  const fact_verification = [];
  const zero_value_audit = [];
  for (const [field, value] of Object.entries(values)) {
    const result = normalizeImportedFact(value, {
      field,
      family,
      subtype,
      source: { source_type: "legacy_import", source_reference: listing.id || null },
    });
    normalized[field] = result.value;
    fact_verification.push({ field, ...result.verification });
    if (result.zero_value_audit) zero_value_audit.push(field);
  }
  normalized.primary_area_sqm = derivePrimaryAreaSqm(normalized);
  return { facts: normalized, fact_verification, zero_value_audit };
}

export function factVerificationFor(field, verifications = []) {
  return verifications.find((entry) => entry.field === field) || { field, state: "unknown" };
}

export function publicFactValue(facts, verifications, field) {
  const verification = factVerificationFor(field, verifications);
  return verification.state === "broker_verified" ? facts[field] ?? null : null;
}

export function publicPrimaryAreaSqm(facts, verifications) {
  const field = primaryAreaFieldFor(facts);
  return field ? publicFactValue(facts, verifications, field) : null;
}

export function enrichmentChecklistFor({ facts = {}, fact_verification = [] } = {}) {
  const family = propertyFamilyFor(facts);
  const subtype = propertySubtypeFor(facts);
  return applicableFactFields(family, subtype).map((field) => {
    const verification = factVerificationFor(field, fact_verification);
    return {
      field,
      state: verification.state,
      needs_enrichment: verification.state === "unknown" || verification.state === "entered_pending_review",
    };
  });
}

function hasFactValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function verifiedAtOrBefore(value, now) {
  if (!hasFactValue(value) || !hasFactValue(now)) return false;
  const timestamp = new Date(value);
  const limit = new Date(now);
  return !Number.isNaN(timestamp.getTime()) && !Number.isNaN(limit.getTime()) && timestamp.getTime() <= limit.getTime();
}

function propertyFactsWithIdentity(property = {}) {
  return {
    ...(property.facts || {}),
    property_family: property.property_family || property.facts?.property_family || null,
    property_subtype: property.property_subtype || property.facts?.property_subtype || null,
    location_id: property.location || property.facts?.location_id || null,
  };
}

function verifiedPositiveFact(facts, factVerification, field) {
  return factVerificationFor(field, factVerification).state === "broker_verified" && numericValue(facts[field]) > 0;
}

function verifiedBedrooms(facts, factVerification, subtype) {
  if (factVerificationFor("bedrooms_count", factVerification).state !== "broker_verified") return false;
  const bedrooms = numericValue(facts.bedrooms_count);
  return bedrooms > 0 || (bedrooms === 0 && subtype === "studio");
}

export function normalizedListingPriceFor(facts = {}) {
  const normalized = normalizeLegacyListingFacts(facts);
  return {
    amount: normalized.facts.price_amount,
    currency: normalized.facts.price_currency,
    period: normalized.facts.price_period,
    price_on_request: normalized.facts.price_on_request === true,
    zero_value_audited: normalized.zero_value_audit.includes("price_amount"),
  };
}

export function propertyFactCompletionFor(property = {}) {
  const facts = propertyFactsWithIdentity(property);
  const propertyFamily = propertyFamilyFor(facts);
  const propertySubtype = propertySubtypeFor(facts);
  const factVerification = property.fact_verification || [];
  const fields = applicableFactFields(propertyFamily, propertySubtype).map((field) => {
    const taxonomyMapped = property.taxonomy_review_status === "mapped";
    const verification =
      field === "property_family"
        ? { state: taxonomyMapped && propertyFamily ? "broker_verified" : "unknown" }
        : field === "property_subtype"
          ? { state: taxonomyMapped ? (propertySubtype ? "broker_verified" : "not_applicable") : "unknown" }
          : factVerificationFor(field, factVerification);
    return {
      field,
      state: verification.state,
      value_present: hasFactValue(facts[field]),
      broker_verified: verification.state === "broker_verified",
    };
  });
  const incompleteFields = fields
    .filter((field) => field.state !== "broker_verified" && field.state !== "not_applicable")
    .map((field) => field.field);

  return {
    property_family: propertyFamily,
    property_subtype: propertySubtype || null,
    taxonomy_review_status: property.taxonomy_review_status || "mapping_review_required",
    fields,
    incomplete_fields: incompleteFields,
    complete:
      Boolean(propertyFamily) && property.taxonomy_review_status === "mapped" && incompleteFields.length === 0,
  };
}

export function publicationReadinessFor({ listing = {}, property = null, now = new Date().toISOString(), requirePublishApproval = false } = {}) {
  const listingFacts = listing.facts || {};
  const workflow = listing.workflow || {};
  const seo = listing.seo || {};
  const propertyFacts = propertyFactsWithIdentity(property || {});
  const propertyFamily = propertyFamilyFor(propertyFacts);
  const propertySubtype = propertySubtypeFor(propertyFacts);
  const factVerification = property?.fact_verification || [];
  const factCompletion = propertyFactCompletionFor(property || {});
  const primaryAreaField = primaryAreaFieldFor(propertyFacts);
  const bedroomsApplicable = bedroomsRequired(propertyFacts);
  const price = normalizedListingPriceFor(listingFacts);
  const checks = [];
  const add = (field, ready, state, { applicable = true, value = null } = {}) => {
    checks.push({ field, applicable, ready, state, ...(value !== null ? { value } : {}) });
  };

  add(
    "property_family",
    Boolean(propertyFamily) && property?.taxonomy_review_status === "mapped",
    property?.taxonomy_review_status || "mapping_review_required",
    { value: propertyFamily },
  );
  add(
    "location_id",
    Boolean(property?.location || listing.location) && verifiedAtOrBefore(workflow.location_verified_at, now),
    verifiedAtOrBefore(workflow.location_verified_at, now) ? "broker_verified" : "unverified",
    { value: property?.location || listing.location || null },
  );
  add(
    primaryAreaField || "primary_area_sqm",
    Boolean(primaryAreaField) && verifiedPositiveFact(propertyFacts, factVerification, primaryAreaField),
    primaryAreaField ? factVerificationFor(primaryAreaField, factVerification).state : "unknown",
  );
  add(
    "bedrooms_count",
    !bedroomsApplicable || verifiedBedrooms(propertyFacts, factVerification, propertySubtype),
    bedroomsApplicable ? factVerificationFor("bedrooms_count", factVerification).state : "not_applicable",
    { applicable: bedroomsApplicable },
  );
  if (price.price_on_request) {
    add(
      "price_on_request",
      price.amount === null && verifiedAtOrBefore(workflow.price_on_request_verified_at, now),
      verifiedAtOrBefore(workflow.price_on_request_verified_at, now) ? "broker_verified" : "unverified",
    );
  } else {
    add(
      "price_amount",
      price.amount !== null && price.amount > 0 && verifiedAtOrBefore(workflow.price_verified_at, now),
      price.zero_value_audited ? "zero_value_unverified" : verifiedAtOrBefore(workflow.price_verified_at, now) ? "broker_verified" : "unverified",
      { value: price.amount },
    );
  }
  add(
    "availability_verified_at",
    verifiedAtOrBefore(workflow.availability_verified_at, now),
    verifiedAtOrBefore(workflow.availability_verified_at, now) ? "broker_verified" : "unverified",
  );
  add("seo_human_approved", seo.human_approved === true, seo.human_approved === true ? "approved" : "unapproved");
  add(
    "media_review",
    Number(listing.media_workflow?.review_gated_assets || 0) === 0,
    Number(listing.media_workflow?.review_gated_assets || 0) === 0 ? "approved" : "review_required",
  );
  if (requirePublishApproval) {
    add("publish_approved", workflow.publish_approved === true, workflow.publish_approved === true ? "approved" : "unapproved");
  }

  const blockingFields = checks.filter((check) => check.applicable && !check.ready).map((check) => check.field);
  return {
    ready: blockingFields.length === 0,
    blocking_fields: blockingFields,
    checks,
    fact_completion: factCompletion,
  };
}

export function assertPublicationReady(options) {
  const readiness = publicationReadinessFor(options);
  if (!readiness.ready) {
    throw new Error(`Listing publication requires verified completion: ${readiness.blocking_fields.join(", ")}`);
  }
  return readiness;
}
