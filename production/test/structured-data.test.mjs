import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertStructuredDataReport } from "../lib/structured-data-report.mjs";
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

test("generated structured data report covers indexable listing sitemap entries", () => {
  const file = fromRoot("production", "data", "structured-data-report.json");
  if (!fs.existsSync(file)) return;
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertStructuredDataReport(report), true);
  assert.equal(report.summary.listing_entries, 167);
  assert.equal(report.summary.failing_entries, 0);
  assert.ok(report.summary.warnings.missing_price > 0);
});
