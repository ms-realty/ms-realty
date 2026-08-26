import test from "node:test";
import assert from "node:assert/strict";
import { publicPropertyProjection } from "../lib/content.mjs";
import {
  CANONICAL_PROPERTY_FAMILIES,
  factProvenanceForState,
  derivePrimaryAreaSqm,
  enrichmentChecklistFor,
  isFactApplicable,
  normalizeImportedFact,
  normalizeLegacyListingFacts,
  publicFactValue,
  publicPrimaryAreaSqm,
  taxonomyForLegacyPropertyType,
} from "../lib/listing-facts.mjs";
import { normalizeSearchIntent, searchIntentToQueryFilters } from "../lib/search-intent.mjs";
import { searchFiltersFromObject } from "../lib/search-filters.mjs";
import { listingFromCmsRecord } from "../lib/runtime.mjs";

test("property applicability registry covers all canonical families with explicit primary-area rules", () => {
  assert.deepEqual(CANONICAL_PROPERTY_FAMILIES, ["apartment", "house", "plot", "agricultural_land", "commercial", "hotel"]);
  assert.equal(isFactApplicable("apartment", "bedrooms_count"), true);
  assert.equal(isFactApplicable("plot", "bedrooms_count"), false);
  assert.equal(isFactApplicable("commercial", "premises_count"), true);
  assert.equal(isFactApplicable("hotel", "hotel_room_count"), true);
  assert.equal(derivePrimaryAreaSqm({ property_family: "apartment", built_area_sqm: 91 }), 91);
  assert.equal(derivePrimaryAreaSqm({ property_family: "house", living_area_sqm: 115 }), 115);
  assert.equal(derivePrimaryAreaSqm({ property_family: "plot", land_area_sqm: 700 }), 700);
  assert.equal(derivePrimaryAreaSqm({ property_family: "agricultural_land", land_area_sqm: 9000 }), 9000);
  assert.equal(derivePrimaryAreaSqm({ property_family: "commercial", usable_area_sqm: 240 }), 240);
  assert.equal(derivePrimaryAreaSqm({ property_family: "hotel", gross_floor_area_sqm: 1800 }), 1800);
  assert.equal(
    publicPrimaryAreaSqm(
      { property_family: "house", built_area_sqm: 115 },
      [{ field: "built_area_sqm", state: "broker_verified" }],
    ),
    115,
  );
  // The owner publishes a figure the source stated rather than withholding it,
  // so a pending area reaches the page - labelled, so a visitor can tell it
  // from one a broker confirmed. Withholding helped nobody: the alternative
  // was a property listing with no area at all.
  assert.equal(
    publicPrimaryAreaSqm(
      { property_family: "house", built_area_sqm: 115 },
      [{ field: "built_area_sqm", state: "entered_pending_review" }],
    ),
    115,
  );
  assert.equal(factProvenanceForState("built_area_sqm", "entered_pending_review"), "source_stated");
  assert.equal(factProvenanceForState("built_area_sqm", "broker_verified"), "broker_verified");
  // Placement is the site's own claim about where it puts a property on a map,
  // not a figure a seller stated, and no label can explain a wrong pin. It
  // stays behind broker verification.
  assert.equal(factProvenanceForState("public_latitude", "entered_pending_review"), null);
  assert.equal(factProvenanceForState("public_location_precision", "entered_pending_review"), null);
  // A fact nobody entered at all is still nothing.
  assert.equal(factProvenanceForState("built_area_sqm", "missing"), null);
});

test("legacy taxonomy and zero handling preserve evidence without treating zero as verified", () => {
  assert.deepEqual(taxonomyForLegacyPropertyType("land"), {
    family: "plot",
    subtype: null,
    review_status: "mapping_review_required",
  });
  const unknownZero = normalizeImportedFact(0, { field: "bedrooms_count", family: "apartment", subtype: "apartment" });
  assert.equal(unknownZero.value, null);
  assert.equal(unknownZero.verification.state, "unknown");
  assert.equal(unknownZero.zero_value_audit, true);
  const verifiedStudio = normalizeImportedFact(0, {
    field: "bedrooms_count",
    family: "apartment",
    subtype: "studio",
    verification: { state: "broker_verified" },
  });
  assert.equal(verifiedStudio.value, 0);
  assert.equal(verifiedStudio.verification.state, "broker_verified");
  assert.equal(normalizeImportedFact(-23.4, { field: "public_longitude", family: "house" }).value, -23.4);
  assert.throws(
    () => normalizeImportedFact(181, { field: "public_longitude", family: "house" }),
    /valid coordinate range/,
  );
  const legacy = normalizeLegacyListingFacts({ id: "MS-CRAWL-ZERO", property_type: "apartment", bedrooms: 0 });
  assert.deepEqual(legacy.zero_value_audit, ["bedrooms_count"]);
  assert.equal(publicFactValue(legacy.facts, legacy.fact_verification, "bedrooms_count"), null);
  assert.equal(enrichmentChecklistFor(legacy).some((item) => item.field === "bedrooms_count" && item.needs_enrichment), true);
  const unmapped = normalizeLegacyListingFacts({ id: "MS-CRAWL-UNMAPPED", property_type: "property", price_eur: 100000 });
  assert.equal(unmapped.facts.price_amount, 100000);
  assert.equal(unmapped.fact_verification.find((fact) => fact.field === "price_amount").state, "entered_pending_review");
  const onRequest = normalizeLegacyListingFacts({
    id: "MS-CRAWL-REQUEST",
    property_type: "apartment",
    price_eur: 1,
    price_on_request: true,
  });
  assert.equal(onRequest.facts.price_on_request, true);
  assert.equal(onRequest.facts.price_amount, null);
});

test("SearchIntent rejects incompatible filters and retains mandatory server-side constraints", () => {
  assert.throws(
    () => normalizeSearchIntent({ property_families: ["plot"], bedrooms_min: 2 }),
    /bedrooms_count is not applicable/,
  );
  assert.throws(() => normalizeSearchIntent({ listing_status: "sold" }), /mandatory public availability/);
  assert.throws(() => normalizeSearchIntent({ bedrooms_min: 3, bedrooms_max: 1 }), /bedrooms_min cannot exceed bedrooms_max/);
  assert.deepEqual(normalizeSearchIntent({ property_type: "multi_unit" }).property_families, ["apartment"]);
  const intent = normalizeSearchIntent({
    locale: "bg",
    q: "парцел Сандански",
    property_families: ["plot"],
    land_area_min: 1000,
    land_area_max: 3000,
    exact_reference: "MS-CRAWL-0001",
  });
  assert.equal(intent.schema_version, 1);
  assert.equal(intent.mandatory_filters.translation_human_approved, true);
  assert.deepEqual(searchIntentToQueryFilters(intent), {
    location: "",
    country_code: "",
    geography_id: "",
    region_id: "",
    municipality: "",
    district: "",
    property_family: "plot",
    property_type: "plot",
    offer_type: "",
    status: "",
    price_min: "",
    price_max: "",
    bedrooms_min: "",
    bedrooms_max: "",
    premises_min: "",
    hotel_rooms_min: "",
    area_min: "",
    area_max: "",
    land_area_min: 1000,
    land_area_max: 3000,
    floor_min: "",
    floor_max: "",
    storeys_min: "",
    storeys_max: "",
    exact_reference: "MS-CRAWL-0001",
  });
});

test("legacy filter extraction preserves an explicit numeric zero", () => {
  assert.deepEqual(searchFiltersFromObject({ bedrooms_min: 0, area_min: "", status: "available" }), {
    bedrooms_min: 0,
    status: "available",
  });
});

test("canonical property projection publishes only broker-verified facts and complete public coordinates", () => {
  const property = {
    id: "property-MS-CRAWL-VERIFIED",
    property_family: "apartment",
    property_subtype: "studio",
    facts: {
      bedrooms_count: 0,
      built_area_sqm: 45,
      public_latitude: 41.57,
      public_longitude: 23.28,
      public_location_precision: "approximate",
    },
    fact_verification: [
      { field: "bedrooms_count", state: "broker_verified" },
      { field: "built_area_sqm", state: "broker_verified" },
      { field: "public_latitude", state: "broker_verified" },
      { field: "public_longitude", state: "entered_pending_review" },
      { field: "public_location_precision", state: "broker_verified" },
    ],
  };
  const projection = publicPropertyProjection(property);
  assert.equal(projection.bedrooms, 0);
  assert.equal(projection.area_sqm, 45);
  assert.equal(projection.public_coordinates, null);

  const record = {
    id: "MS-CRAWL-VERIFIED",
    source_url: "https://makler-realty.com/example",
    source_domain: "makler-realty.com",
    source_locale: "bg",
    property: property.id,
    facts: {
      title: "Legacy title",
      h1: "Legacy heading",
      description: "Legacy description",
      location: "Sandanski",
      property_type: "apartment",
      offer_type: "sale",
      bedrooms: 9,
      area_sqm: 999,
      price_eur: 120000,
      price_on_request: false,
    },
    seo: { canonical: "/bg/imoti/MS-CRAWL-VERIFIED" },
    translations: [],
  };
  const listing = listingFromCmsRecord(record, null, property);
  assert.equal(listing.bedrooms, 0);
  assert.equal(listing.area_sqm, 45);
  assert.equal(listing.public_coordinates, null);
  assert.equal(listing.location_precision, "approximate");
});
