import assert from "node:assert/strict";
import test from "node:test";
import { renderAdminLeadsPayload, renderAdminListingEditorPayload, renderAdminListingManagerPayload } from "../lib/admin-payloads.mjs";
import { CANONICAL_PROPERTY_FAMILIES, propertyFamilyFor } from "../lib/listing-facts.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { renderReactAdminBody } from "../lib/react-admin-site.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

const registry = loadLocaleRegistry();
const seed = loadCmsSeed();

function editorHtml(listingId, locale = "en") {
  return renderReactAdminBody(renderAdminListingEditorPayload(registry, locale, seed, listingId, [], []));
}

function emptyLeads() {
  return {
    leads: [],
    replies: [],
    languageRequests: [],
    viewings: [],
    savedSearches: [],
    sellerPipeline: [],
    deals: [],
    leadSla: { rows: [], summary: { manager_escalation_required: 0, reminder_required: 0 } },
  };
}

test("admin listing editor offers every canonical family instead of the legacy land list", () => {
  const html = editorHtml("MS-CRAWL-0001");
  const typeSelect = html.match(/<select name="property_type"[^>]*>([\s\S]*?)<\/select>/)?.[1] || "";
  for (const family of CANONICAL_PROPERTY_FAMILIES) {
    assert.match(typeSelect, new RegExp(`value="${family}"`));
  }
  assert.match(typeSelect, /Plot/);
  assert.match(typeSelect, /Agricultural land/);
  assert.doesNotMatch(typeSelect, /value="multi_unit"/);
  assert.doesNotMatch(typeSelect, /value="land"/);
  assert.doesNotMatch(typeSelect, /value="property"/);
});

test("admin listing editor hides bedrooms on plot listings", () => {
  const propertiesById = new Map((seed.properties || []).map((property) => [property.id, property]));
  const plot = seed.records.find((record) => {
    if (record.collection !== "listings") return false;
    const property = propertiesById.get(record.property);
    return (
      propertyFamilyFor({
        ...(record.facts || {}),
        property_family: property?.property_family,
        property_subtype: property?.property_subtype,
      }) === "plot"
    );
  });
  assert.ok(plot, "seed must include a plot listing");
  const html = editorHtml(plot.id);
  assert.doesNotMatch(html, /name="bedrooms"/);
  assert.match(html, /name="land_area_sqm"/);
});

test("admin listing manager filters and labels every canonical family", () => {
  const html = renderReactAdminBody(renderAdminListingManagerPayload(registry, "bg", { seed }));
  assert.match(html, /name="propertyFamily"/);
  for (const family of CANONICAL_PROPERTY_FAMILIES) {
    assert.match(html, new RegExp(`<option[^>]*value="${family}"`));
  }
  assert.match(html, /Земеделска земя/);
  assert.match(html, /data-listing-column="property-family"/);

  const filtered = renderAdminListingManagerPayload(registry, "en", { seed, propertyFamily: "plot" });
  assert.ok(filtered.listings.length > 0);
  assert.ok(filtered.listings.every((row) => row.property_family === "plot"));
  assert.deepEqual(filtered.filterOptions.propertyFamilies, [...CANONICAL_PROPERTY_FAMILIES]);
});

test("admin lead intake uses canonical family checkboxes instead of English CSV hints", () => {
  const html = renderReactAdminBody(renderAdminLeadsPayload(registry, "en", emptyLeads()));
  assert.match(html, /data-property-family-options="true"/);
  assert.match(html, /<legend>Property types<\/legend>/);
  assert.doesNotMatch(html, /placeholder="apartment, house"/);
  assert.doesNotMatch(html, /<legend>Property types \(comma separated\)<\/legend>/);
  for (const family of CANONICAL_PROPERTY_FAMILIES) {
    assert.match(html, new RegExp(`name="requirements.property_types" value="${family}"`));
  }
});
