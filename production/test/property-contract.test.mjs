import test from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_PROPERTY_FAMILIES,
  derivePrimaryAreaSqm,
  enrichmentChecklistFor,
  isFactApplicable,
  normalizeImportedFact,
  normalizeLegacyListingFacts,
  publicFactValue,
  taxonomyForLegacyPropertyType,
} from "../lib/listing-facts.mjs";
import { normalizeSearchIntent, searchIntentToQueryFilters } from "../lib/search-intent.mjs";

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
  const legacy = normalizeLegacyListingFacts({ id: "MS-CRAWL-ZERO", property_type: "apartment", bedrooms: 0 });
  assert.deepEqual(legacy.zero_value_audit, ["bedrooms_count"]);
  assert.equal(publicFactValue(legacy.facts, legacy.fact_verification, "bedrooms_count"), null);
  assert.equal(enrichmentChecklistFor(legacy).some((item) => item.field === "bedrooms_count" && item.needs_enrichment), true);
  const unmapped = normalizeLegacyListingFacts({ id: "MS-CRAWL-UNMAPPED", property_type: "property", price_eur: 100000 });
  assert.equal(unmapped.facts.price_amount, 100000);
  assert.equal(unmapped.fact_verification.find((fact) => fact.field === "price_amount").state, "entered_pending_review");
});

test("SearchIntent rejects incompatible filters and retains mandatory server-side constraints", () => {
  assert.throws(
    () => normalizeSearchIntent({ property_families: ["plot"], bedrooms_min: 2 }),
    /bedrooms_count is not applicable/,
  );
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
