import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { renderAdminListingManagerPayload } from "../lib/admin-payloads.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

// A broker narrowing a catalogue of 165 listings types a figure; the filter bar
// only offered menus. These cover the typed bounds, what happens when the two
// bounds disagree, and the rule that a bound is only offered for a figure the
// catalogue actually carries.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUTH = { authorization: "Bearer local-admin-smoke" };
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-listing-filters-"));
const copy = (name) => {
  const target = path.join(dataDir, name);
  fs.copyFileSync(path.join(ROOT, "production/data", name), target);
  return target;
};

const app = () =>
  createHttpApp({
    reviewedAt: "2026-07-19T12:00:00.000Z",
    leadLedgerPath: copy("lead-ledger.jsonl"),
    eventLedgerPath: copy("events.jsonl"),
    leadContactVaultPath: path.join(dataDir, "lead-contacts.jsonl"),
    leadContactKey: "test-only-admin-listing-filters-key-32",
  });

const listings = async (query = "") => {
  const res = await dispatchHttp(app(), { url: `/admin/listings?locale=en${query}`, headers: AUTH });
  assert.equal(res.status, 200);
  return res.body;
};

// The results panel prints the number of rows the filter actually returned,
// whether or not any filter chip is drawn, so it is the honest count to assert.
const resultCount = (body) => {
  const match = body.match(/<h2>Results · (\d+)<\/h2>/);
  assert.ok(match, "the results panel prints its row count");
  return Number(match[1]);
};

test("a typed price range narrows the catalogue", async () => {
  const all = await listings();
  assert.match(all, /name="priceMin"/);
  assert.match(all, /name="priceMax"/);

  const banded = await listings("&priceMin=40000&priceMax=80000");
  const inBand = resultCount(banded);
  const everything = resultCount(all);
  assert.ok(inBand > 0 && inBand < everything, `a band shows some but not all, got ${inBand} of ${everything}`);

  // Each bound is its own removable chip, so narrowing stays reversible one
  // step at a time and still works with JavaScript switched off.
  assert.match(banded, /data-remove-filter="priceMin"/);
  assert.match(banded, /data-remove-filter="priceMax"/);
});

test("a reversed range honours neither bound and says so", async () => {
  const body = await listings("&priceMin=80000&priceMax=40000");

  assert.match(body, /data-listing-filter-error="range"/);
  assert.match(body, /Price \(EUR\): The minimum is above the maximum/);

  // What was typed stays in the boxes, and both are announced as invalid.
  assert.match(body, /name="priceMin"[^>]*value="80000"/);
  assert.match(body, /name="priceMax"[^>]*value="40000"/);
  assert.equal((body.match(/aria-describedby="adm-listing-range-notice"/g) || []).length, 2);

  // Applying one half of a pair the broker did not ask for would be worse than
  // applying neither: the rows below are the unfiltered ones.
  assert.equal(resultCount(body), resultCount(await listings()));
  assert.doesNotMatch(body, /data-remove-filter="priceMin"/);
});

test("a bound that is not a number is reported as a value the box cannot take", async () => {
  const body = await listings("&priceMin=cheap");

  assert.match(body, /data-listing-filter-error="value"/);
  assert.match(body, /Price \(EUR\): Only a number works here/);
  assert.match(body, /name="priceMin"[^>]*value="cheap"/);
});

test("a listing with no recorded price does not answer a bound of zero", () => {
  const registry = loadLocaleRegistry();
  const seed = loadCmsSeed();
  const all = renderAdminListingManagerPayload(registry, "en", { seed });
  const fromZero = renderAdminListingManagerPayload(registry, "en", { seed, priceMin: "0" });

  const withPrice = seed.records.filter(
    (record) => record.collection === "listings" && record.facts?.price_eur !== null && record.facts?.price_eur !== undefined,
  ).length;
  assert.ok(withPrice > 0 && withPrice < all.summary.total, "the catalogue carries listings with and without a price");
  assert.equal(fromZero.summary.visible, withPrice);
  assert.notEqual(fromZero.summary.visible, all.summary.total);
});

test("a range is offered only for a figure the catalogue carries", () => {
  const registry = loadLocaleRegistry();
  const seed = loadCmsSeed();

  // No listing in the approved catalogue records an area, so an area bound
  // could only ever return an empty page.
  const asShipped = renderAdminListingManagerPayload(registry, "en", { seed });
  assert.deepEqual(asShipped.filterOptions.rangeFields, ["price"]);

  const withArea = {
    ...seed,
    records: seed.records.map((record, index) =>
      record.collection === "listings" && index < 3 ? { ...record, facts: { ...record.facts, area_sqm: 72 } } : record,
    ),
  };
  const answered = renderAdminListingManagerPayload(registry, "en", { seed: withArea, areaMin: "60", areaMax: "90" });
  assert.deepEqual(answered.filterOptions.rangeFields, ["price", "area"]);
  assert.equal(answered.summary.visible, 3);
});
