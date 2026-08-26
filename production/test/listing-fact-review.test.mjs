import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { publicPropertyProjection } from "../lib/content.mjs";
import { renderListingPage } from "../lib/public-site.mjs";
import { renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import {
  FACT_REVIEW_COPY,
  buildListingFactReviewQueue,
  factReviewCopyFor,
  listingFactReviewFor,
} from "../lib/listing-fact-review.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { renderAdminListingEditorPayload, renderAdminListingManagerPayload } from "../lib/admin-payloads.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { renderReactAdminBody } from "../lib/react-admin-site.mjs";
import { renderReactPublicBody } from "../lib/react-public-site.mjs";
import { listingFromCmsRecord, loadCmsSeed } from "../lib/runtime.mjs";
import { saveListingDraft } from "../lib/listing-draft-service.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

const registry = loadLocaleRegistry();

test("fact review queue is derived from the public source-stated projection", () => {
  const seed = loadCmsSeed();
  const properties = new Map((seed.properties || []).map((property) => [property.id, property]));
  const expected = seed.records
    .filter((record) => record.collection === "listings")
    .map((listing) => listingFactReviewFor({ listing, property: properties.get(listing.property) || null }))
    .filter((review) => review.unchecked_count > 0);
  const queue = buildListingFactReviewQueue(seed);
  const byRow = Object.fromEntries(Object.keys(FACT_REVIEW_COPY.en.labels).map((row) => [row, 0]));
  for (const review of expected) for (const row of review.unchecked_rows) byRow[row] += 1;
  assert.equal(queue.summary.listings_with_unchecked_facts, expected.length);
  assert.equal(queue.summary.unchecked_figures, expected.reduce((total, review) => total + review.unchecked_count, 0));
  assert.deepEqual(queue.summary.by_row, byRow);
  assert.equal(queue.rows.length, expected.length);

  const manager = renderAdminListingManagerPayload(registry, "bg", { seed });
  assert.deepEqual(manager.factReview.summary, queue.summary);
  const html = renderReactAdminBody(manager);
  assert.match(html, /data-fact-review-queue="true"/);
  assert.match(html, /data-fact-review-listing="MS-CRAWL-0003"/);
  assert.match(html, /href="\/admin\/listings\/edit\?listingId=MS-CRAWL-0003&amp;locale=bg#listing-facts"/);
  for (const locale of ["bg", "en", "de", "nl", "ru", "el", "he"]) {
    const copy = factReviewCopyFor(locale);
    assert.ok(copy.title);
    assert.equal(Object.keys(copy.labels).length, 7);
    assert.ok(Object.values(copy.labels).every((label) => label && !/[_.]/.test(label)));
  }
});

test("existing listing editor confirmation persists broker verification and removes the public source label", async () => {
  const seed = loadCmsSeed();
  const runtime = createPayloadDraftRuntime(seed);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-fact-review-"));
  const auditLogPath = path.join(directory, "audit-log.jsonl");
  const config = {
    payloadListingRuntime: runtime.payload,
    adminPrincipal: { id: "editor_bg", roles: ["editor"], source: "test", can_mutate: true },
    auditLogPath,
    durableListingAuditToFile: true,
    editedAt: "2026-08-27T10:00:00.000Z",
  };
  const form = new URLSearchParams();
  form.append("listingId", "MS-CRAWL-0003");
  form.append("editor", "editor_bg");
  form.append("bedrooms", "2");
  form.append("confirmedFacts", "bedrooms");
  const response = await renderAppAdminResponse(
    new Request("https://example.test/api/admin/listings/edit", {
      method: "POST",
      headers: { authorization: "Bearer local-admin-smoke", "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    }),
    { config },
  );
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(body.verified_fact_fields, ["bedrooms"]);
  assert.deepEqual(body.changed_fields, ["bedrooms_count"]);

  const property = runtime.currentRows().properties.find((row) => row.id === "property-MS-CRAWL-0003");
  assert.equal(property.facts.bedrooms_count, 2);
  assert.equal(property.fact_verification.find((row) => row.field === "bedrooms_count").state, "broker_verified");
  assert.deepEqual(publicPropertyProjection(property).source_stated_facts, []);

  const currentListing = runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0003");
  const sourceListing = seed.records.find((row) => row.id === "MS-CRAWL-0003");
  const publicListing = listingFromCmsRecord(
    { ...sourceListing, facts: currentListing.facts, seo: currentListing.seo, workflow: currentListing.workflow },
    null,
    property,
  );
  const publicPage = renderListingPage({ registry, listing: publicListing, localeCode: "bg" });
  assert.deepEqual(publicPage.body.facts.source_stated, ["price"]);
  assert.doesNotMatch(renderReactPublicBody(publicPage), /data-fact-provenance="source_stated"[^>]*>2/);

  const audit = readAuditLog(auditLogPath).find((row) => row.action === "listing_edited");
  assert.ok(audit);
  assert.deepEqual(audit.metadata.verified_fact_fields, ["bedrooms"]);

  const editorPayload = renderAdminListingEditorPayload(
    registry,
    "bg",
    { ...seed, properties: runtime.currentRows().properties, records: seed.records },
    "MS-CRAWL-0003",
    [],
    [],
  );
  const editorHtml = renderReactAdminBody(editorPayload);
  assert.doesNotMatch(editorHtml, /data-fact-review-confirm="bedrooms"/);
  assert.match(editorHtml, /data-fact-review-note="true"/);
  assert.match(editorHtml, /data-fact-review-confirm="price"/);
});

test("fact review promotion keeps a grouped floor value on its matching canonical field", async () => {
  const seed = loadCmsSeed();
  const listing = seed.records.find((record) => record.id === "MS-CRAWL-0003");
  const property = seed.properties.find((candidate) => candidate.id === listing.property);
  property.facts.floor_number = 2;
  property.facts.total_floors = 4;
  property.fact_verification = property.fact_verification.map((entry) =>
    ["floor_number", "total_floors"].includes(entry.field)
      ? { ...entry, state: "entered_pending_review" }
      : entry,
  );
  const runtime = createPayloadDraftRuntime(seed);
  const result = await saveListingDraft(seed, {
    payload: runtime.payload,
    principal: { id: "editor_bg", roles: ["editor"], source: "test" },
    input: { listingId: listing.id, patch: { floor: 3 }, confirmedFacts: ["floor"] },
    editedAt: "2026-08-27T10:00:00.000Z",
  });
  assert.deepEqual(result.verifiedFactFields, ["floor"]);
  const updated = runtime.currentRows().properties.find((candidate) => candidate.id === listing.property);
  assert.equal(updated.facts.floor_number, 3);
  assert.equal(updated.facts.total_floors, 4);
  assert.equal(updated.fact_verification.find((entry) => entry.field === "floor_number").state, "broker_verified");
  assert.equal(updated.fact_verification.find((entry) => entry.field === "total_floors").state, "entered_pending_review");
});
