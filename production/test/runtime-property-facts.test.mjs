import assert from "node:assert/strict";
import test from "node:test";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { listingFromCmsRecord, loadCmsSeed, searchRuntimeListings } from "../lib/runtime.mjs";

const registry = loadLocaleRegistry();

function propertyFixture() {
  const seed = loadCmsSeed();
  const record = seed.records.find((candidate) => candidate.id === "MS-00815");
  const property = seed.properties.find((candidate) => candidate.id === record.property);
  record.facts = { ...record.facts, property_type: "land", bedrooms: 9 };
  property.property_family = "apartment";
  property.property_subtype = "apartment";
  return { seed, record, property };
}

test("runtime exposes broker-verified property facts and canonical taxonomy to public search", () => {
  const { seed, record, property } = propertyFixture();
  property.facts = { ...property.facts, bedrooms_count: 2, built_area_sqm: 86 };
  property.fact_verification = [
    ...property.fact_verification.filter((entry) => !["bedrooms_count", "built_area_sqm"].includes(entry.field)),
    { field: "bedrooms_count", state: "broker_verified" },
    { field: "built_area_sqm", state: "broker_verified" },
  ];
  const approvedTour = { id: "tour-runtime-property-facts", is_public: true };
  const listing = listingFromCmsRecord(record, approvedTour, property);
  const page = searchRuntimeListings(registry, seed, {
    localeCode: record.source_locale,
    filters: { exact_reference: record.id, property_family: "apartment", property_subtype: "apartment" },
  });

  assert.equal(listing.property_type, "apartment");
  assert.equal(listing.property_family, "apartment");
  assert.equal(listing.property_subtype, "apartment");
  assert.equal(listing.bedrooms_count, 2);
  assert.equal(listing.primary_area_sqm, 86);
  assert.equal(listing.tour, approvedTour);
  assert.equal(page.cards.length, 1);
  assert.equal(page.cards[0].bedrooms, 2);
});

test("runtime keeps an unverified zero property fact out of public search", () => {
  const { seed, record, property } = propertyFixture();
  property.facts = { ...property.facts, bedrooms_count: 0 };
  property.fact_verification = [
    ...property.fact_verification.filter((entry) => entry.field !== "bedrooms_count"),
    { field: "bedrooms_count", state: "unknown" },
  ];
  const listing = listingFromCmsRecord(record, null, property);
  const page = searchRuntimeListings(registry, seed, {
    localeCode: record.source_locale,
    filters: { exact_reference: record.id },
  });

  assert.equal(listing.bedrooms, null);
  assert.equal(listing.bedrooms_count, null);
  assert.equal(page.cards.length, 1);
  assert.equal(page.cards[0].bedrooms, null);
});
