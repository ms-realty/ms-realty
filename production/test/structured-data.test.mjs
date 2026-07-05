import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertStructuredDataReport, buildStructuredDataReport } from "../lib/structured-data-report.mjs";
import { assertListingSchema, buildListingSchema } from "../lib/structured-data.mjs";
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
      price_eur: 100000,
      source_locale: "bg",
    },
    copy: { title: "Apartment in Sandanski", description: "Reviewed listing." },
    publicMedia: { gallery: [{ url: "https://makler-realty.com/wp-content/uploads/2024/01/a.jpg" }] },
  });

  assert.equal(assertListingSchema(schema), true);
  assert.equal(schema.offers.priceCurrency, "EUR");
  assert.equal(schema.image.length, 1);
});

test("structured data warnings use reviewed listing edits", () => {
  const base = buildStructuredDataReport({ listingEdits: [], generatedAt: "2026-07-05T00:00:00Z" });
  const reviewed = buildStructuredDataReport({
    listingEdits: [{ listing_id: "MS-CRAWL-0001", patch: { price_eur: 123000, bedrooms: 2 }, media_reviewer: "media_editor" }],
    generatedAt: "2026-07-05T00:00:00Z",
  });

  assert.equal(reviewed.summary.warnings.missing_price, base.summary.warnings.missing_price - 3);
  assert.equal(reviewed.summary.warnings.missing_bedrooms, base.summary.warnings.missing_bedrooms - 3);
  assert.equal(reviewed.summary.warnings.media_review_pending, base.summary.warnings.media_review_pending - 3);
});

test("structured data warnings do not require bedrooms for land listings", () => {
  const report = buildStructuredDataReport({ generatedAt: "2026-07-05T00:00:00Z" });
  const row = report.rows.find((candidate) => candidate.listing_id === "MS-CRAWL-0111");

  assert.ok(row);
  assert.equal(row.warnings.includes("missing_bedrooms"), false);
});

test("generated structured data report covers indexable listing sitemap entries", () => {
  const file = fromRoot("production", "data", "structured-data-report.json");
  if (!fs.existsSync(file)) return;
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertStructuredDataReport(report), true);
  assert.equal(report.summary.listing_entries, 167);
  assert.equal(report.summary.failing_entries, 0);
  assert.ok(report.summary.warnings.missing_price > 0);
});
