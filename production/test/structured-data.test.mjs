import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertStructuredDataReport, buildStructuredDataReport } from "../lib/structured-data-report.mjs";
import { assertListingSchema, buildListingSchema, schemaIssues } from "../lib/structured-data.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { fromRoot } from "../lib/paths.mjs";

test("listing schema keeps launch-critical listing facts", () => {
  const schema = buildListingSchema({
    path: "/bg/imoti/MS-1",
    view: {
      id: "MS-1",
      location: "Sandanski",
      property_type: "apartment",
      offer_type: "sale",
      bedrooms: 2,
      area_sqm: 86.5,
      price_eur: 100000,
      source_locale: "bg",
    },
    copy: { title: "Apartment in Sandanski", description: "Reviewed listing." },
    publicMedia: { gallery: [{ url: "https://makler-realty.com/wp-content/uploads/2024/01/a.jpg" }] },
  });

  assert.equal(assertListingSchema(schema), true);
  assert.equal(schema.offers.priceCurrency, "EUR");
  assert.equal(schema.image.length, 1);
  assert.deepEqual(schema.additionalProperty.find((item) => item.name === "floor_area_sqm"), {
    "@type": "PropertyValue",
    name: "floor_area_sqm",
    value: 86.5,
  });
});

test("a rent publishes its periodicity instead of a sale price", () => {
  const schema = buildListingSchema({
    path: "/bg/imoti/MS-RENT",
    view: {
      id: "MS-RENT",
      location: "Sandanski",
      property_type: "apartment",
      offer_type: "rent",
      price_eur: 600,
      source_locale: "bg",
    },
    copy: { title: "Apartment to rent in Sandanski", description: "Reviewed listing." },
    publicMedia: { gallery: [] },
  });

  // A bare 600 EUR Offer says the flat sells for 600 EUR.
  assert.equal(Object.hasOwn(schema.offers, "price"), false);
  assert.deepEqual(schema.offers.priceSpecification, {
    "@type": "UnitPriceSpecification",
    price: 600,
    priceCurrency: "EUR",
    unitCode: "MON",
    unitText: "MONTH",
  });
  assert.equal(schemaIssues(schema).length, 0);
});

test("schema issues catch a rent that regresses to a sale price or a relative identifier", () => {
  const rent = buildListingSchema({
    path: "/bg/imoti/MS-RENT",
    view: { id: "MS-RENT", property_type: "apartment", offer_type: "rent", price_eur: 600, source_locale: "bg" },
    copy: { title: "Apartment to rent", description: "Reviewed listing." },
    publicMedia: { gallery: [] },
  });

  assert.deepEqual(schemaIssues({ ...rent, offers: { "@type": "Offer", price: 600, priceCurrency: "EUR" } }), [
    "rent_offer_price",
  ]);
  assert.deepEqual(schemaIssues({ ...rent, "@id": "/bg/imoti/MS-RENT#listing", url: "/bg/imoti/MS-RENT" }), [
    "relative_id",
    "relative_url",
  ]);
});

test("no listing in the reviewed inventory publishes a relative identifier or a rent as a sale price", () => {
  const report = buildStructuredDataReport({ generatedAt: "2026-08-25T00:00:00Z" });
  const rows = report.rows.filter((row) => row.page_type === "listing");

  assert.ok(rows.length > 100);
  assert.equal(report.summary.failing_entries, 0);
  assert.deepEqual(
    rows.filter((row) => row.issues.includes("rent_offer_price") || row.issues.includes("relative_url")),
    [],
  );
});

test("listing schema omits crawl placeholder prices and internal source metadata", () => {
  const schema = buildListingSchema({
    path: "/bg/imoti/MS-PLACEHOLDER",
    view: {
      id: "MS-PLACEHOLDER",
      property_type: "commercial",
      offer_type: "rent",
      price_eur: 1,
      price_on_request: false,
      source_locale: "bg",
    },
    copy: { title: "Commercial property", description: "Source listing." },
    publicMedia: { gallery: [] },
  });

  assert.equal(Object.hasOwn(schema, "offers"), false);
  assert.equal(schema.additionalProperty.some((item) => item.name === "source_locale"), false);
});

test("missing approved media is a review warning instead of a schema failure", () => {
  const schema = buildListingSchema({
    path: "/ru/properties/MS-2",
    view: { id: "MS-2", property_type: "apartment", offer_type: "sale", source_locale: "ru" },
    copy: { title: "Apartment", description: "Reviewed listing." },
    publicMedia: { gallery: [] },
  });
  const seed = loadCmsSeed();
  const report = buildStructuredDataReport({
    seed: {
      ...seed,
      records: seed.records.map((record) =>
        record.id === "MS-CRAWL-0114" ? { ...record, media: [] } : record,
      ),
    },
    generatedAt: "2026-07-10T00:00:00Z",
  });

  assert.equal(assertListingSchema(schema), true);
  assert.ok(report.rows.filter((row) => row.listing_id === "MS-CRAWL-0114").every((row) => row.issues.length === 0));
  assert.ok(report.rows.filter((row) => row.listing_id === "MS-CRAWL-0114").some((row) => row.warnings.includes("missing_public_images")));
});

test("structured data warnings use broker-verified property edits", () => {
  const seed = loadCmsSeed();
  const seedWithPriceGap = {
    ...seed,
    records: seed.records.map((record) =>
      record.id === "MS-CRAWL-0001"
        ? { ...record, facts: { ...record.facts, price_eur: null, price_on_request: false } }
        : record.id === "MS-CRAWL-0044"
          ? { ...record, facts: { ...record.facts, bedrooms: null, bedrooms_not_applicable: false } }
        : record,
    ),
  };
  const base = buildStructuredDataReport({ seed: seedWithPriceGap, listingEdits: [], generatedAt: "2026-07-05T00:00:00Z" });
  const reviewed = buildStructuredDataReport({
    seed: seedWithPriceGap,
    listingEdits: [
      {
        listing_id: "MS-CRAWL-0001",
        listing_patch: { price_eur: 123000 },
        property_patch: { usable_area_sqm: 86.5 },
        property_fact_verification: [{ field: "usable_area_sqm", state: "broker_verified" }],
      },
      {
        listing_id: "MS-CRAWL-0044",
        property_patch: { bedrooms_count: 1 },
        property_fact_verification: [{ field: "bedrooms_count", state: "broker_verified" }],
      },
    ],
    generatedAt: "2026-07-05T00:00:00Z",
  });

  assert.equal(reviewed.summary.warnings.missing_price, base.summary.warnings.missing_price - 2);
  assert.equal(reviewed.summary.warnings.missing_area, base.summary.warnings.missing_area - 2);
  assert.equal(reviewed.summary.warnings.missing_bedrooms, base.summary.warnings.missing_bedrooms - 1);
});

test("structured data warnings treat price-on-request as reviewed pricing without an offer", () => {
  const report = buildStructuredDataReport({
    listingEdits: [{ listing_id: "MS-CRAWL-0001", patch: { price_on_request: true } }],
    generatedAt: "2026-07-05T00:00:00Z",
  });
  const rows = report.rows.filter((row) => row.listing_id === "MS-CRAWL-0001");

  assert.ok(rows.length > 0);
  assert.equal(rows.every((row) => !row.warnings.includes("missing_price")), true);
  assert.equal(rows.every((row) => row.has_offer === false), true);
});

test("structured data warnings do not let a legacy bedroom flag bypass property verification", () => {
  const seed = loadCmsSeed();
  const seedWithBedroomGap = {
    ...seed,
    records: seed.records.map((record) =>
      record.id === "MS-CRAWL-0044" ? { ...record, facts: { ...record.facts, bedrooms_not_applicable: false } } : record,
    ),
  };
  const report = buildStructuredDataReport({
    seed: seedWithBedroomGap,
    listingEdits: [{ listing_id: "MS-CRAWL-0044", patch: { bedrooms_not_applicable: true } }],
    generatedAt: "2026-07-05T00:00:00Z",
  });
  const rows = report.rows.filter((row) => row.listing_id === "MS-CRAWL-0044");

  assert.ok(rows.length > 0);
  assert.equal(rows.every((row) => row.warnings.includes("missing_bedrooms")), true);
});

test("structured data warnings do not require bedrooms for land listings", () => {
  const report = buildStructuredDataReport({ generatedAt: "2026-07-05T00:00:00Z" });
  const row = report.rows.find((candidate) => candidate.listing_id === "MS-CRAWL-0158");

  assert.ok(row);
  assert.equal(row.warnings.includes("missing_bedrooms"), false);
});

test("generated structured data report covers indexable listing sitemap entries", () => {
  const file = fromRoot("production", "data", "structured-data-report.json");
  if (!fs.existsSync(file)) return;
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertStructuredDataReport(report), true);
  assert.equal(report.summary.listing_entries, 166);
  assert.equal(report.summary.guide_entries, 5);
  assert.equal(report.summary.failing_entries, 0);
  assert.equal(report.rows.some((row) => row.loc === "/en/guides/foreign-buyers" && row.schema_type === "Article"), true);
  assert.equal(report.rows.some((row) => row.loc === "/bg/guides/hotovo-obstinski-kontekst" && row.schema_type === "Article"), true);
  assert.equal(report.rows.some((row) => row.loc === "/bg/guides/petrich-obstinski-kontekst" && row.schema_type === "Article"), true);
  assert.equal(Object.hasOwn(report.summary.warnings, "missing_price"), true);
  assert.equal(Object.hasOwn(report.summary.warnings, "missing_area"), true);
});
