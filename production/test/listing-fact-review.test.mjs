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
  FACT_REVIEW_ROW_KEYS,
  DUPLICATE_REVIEW_PAIRS,
  areaCandidatesForListing,
  buildListingAreaReview,
  buildListingDuplicateReview,
  buildListingFactReviewQueue,
  factReviewCopyFor,
  loadListingReviewEvidence,
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
  assert.match(html, /data-fact-review-listing="MS-00922"/);
  assert.match(html, /href="\/admin\/listings\/edit\?listingId=MS-00922&amp;locale=bg#listing-facts"/);
  const duplicateReview = buildListingDuplicateReview(seed);
  const expectedDuplicatePairs = DUPLICATE_REVIEW_PAIRS.filter((pair) => pair.listing_ids.every((listingId) => seed.records.some((record) => record.id === listingId)));
  assert.equal(duplicateReview.rows.length, expectedDuplicatePairs.length);
  assert.equal(duplicateReview.summary.confirmed_pairs, 2);
  assert.equal(duplicateReview.summary.algorithm_candidate_pairs, 13);
  assert.equal(duplicateReview.summary.audit_only_candidate_pairs, 1);
  assert.equal(duplicateReview.summary.candidate_review_pairs, 14);
  assert.equal(duplicateReview.summary.total_pairs, 16);
  assert.ok(duplicateReview.rows.every((pair) => pair.record_a.role === "record_a" && pair.record_b.role === "record_b"));
  assert.ok(duplicateReview.rows.every((pair) => ["confirmed", "candidate"].includes(pair.status)));
  const excludedCoincidences = [
    ["MS-00286", "MS-00935"],
    ["MS-00567-1", "MS-00920"],
    ["MS-00720", "MS-00362"],
  ];
  for (const excluded of excludedCoincidences) {
    assert.equal(duplicateReview.rows.some((pair) => excluded.every((listingId) => [pair.record_a.listing_id, pair.record_b.listing_id].includes(listingId))), false);
  }
  const confirmedPair = duplicateReview.rows.find((pair) => pair.pair_id === "MS-00891--MS-CRAWL-0159");
  assert.equal(confirmedPair.status, "confirmed");
  assert.equal(confirmedPair.record_a.price_eur, 155000);
  assert.equal(confirmedPair.record_b.price_eur, 185000);
  for (const card of [confirmedPair.record_a, confirmedPair.record_b]) {
    assert.ok(card.area_evidence.observed_sqm > 0);
    assert.ok(card.area_evidence.manual_sqm > 0);
    assert.ok(card.area_evidence.live_sqm > 0);
    assert.ok(card.source_url);
  }
  assert.match(html, /data-duplicate-review="true"/);
  assert.match(html, /data-duplicate-review-pair="MS-00891--MS-CRAWL-0159"/);
  assert.match(html, /data-duplicate-pair-status="confirmed"/);
  assert.match(html, /data-duplicate-side="record_a"[^>]*data-duplicate-listing="MS-00891"/);
  assert.match(html, /data-duplicate-side="record_b"[^>]*data-duplicate-listing="MS-CRAWL-0159"/);
  assert.match(html, /Record A|Запис A/);
  assert.match(html, /Candidate pair|Кандидатна двойка/);
  assert.match(html, /data-duplicate-review-summary="true"/);
  assert.match(html, /data-area-evidence="duplicate-MS-00891"/);
  assert.match(html, /Open source|Отвори източника/);
  assert.match(html, /href="\/admin\/listings\?locale=bg#listing-publication-schedule"/);
  const areaReview = buildListingAreaReview(seed);
  const evidence = loadListingReviewEvidence();
  const liveById = new Map(evidence.liveAudit.map((row) => [row.id, row]));
  const manualById = new Map(evidence.manualAudit.map((row) => [row.id, row]));
  const expectedCandidates = seed.records
    .filter((record) => record.collection === "listings")
    .filter((record) => manualById.get(record.id)?.review_status === "hold")
    .filter((record) => areaCandidatesForListing(record).length > 1);
  const expectedMissing = seed.records
    .filter((record) => record.collection === "listings")
    .filter((record) => manualById.get(record.id)?.review_status === "review")
    .filter((record) => Number.isFinite(liveById.get(record.id)?.live_area_sqm));
  const duplicateAreaPairs = DUPLICATE_REVIEW_PAIRS.filter((pair) =>
    pair.status === "confirmed" &&
    pair.listing_ids.every((listingId) => Number.isFinite(liveById.get(listingId)?.live_area_sqm)),
  );
  assert.equal(areaReview.summary.missing_canonical_area, expectedMissing.length - (duplicateAreaPairs.length * 2));
  assert.equal(areaReview.summary.missing_canonical_area, 65);
  assert.equal(areaReview.summary.multiple_prose_candidates, expectedCandidates.length);
  assert.equal(areaReview.summary.multiple_prose_candidates, 21);
  assert.ok(areaReview.multiple_prose_candidates.every((row) => row.area_candidates.every((candidate) => candidate.context)));
  assert.match(html, /data-area-review="true"/);
  assert.match(html, /data-area-review-missing="65"/);
  assert.match(html, /data-area-review-candidates="21"/);
  assert.match(html, /data-area-review-pack="npm run listing:review-pack"/);
  for (const locale of ["bg", "en", "de", "nl", "ru", "el", "he"]) {
    const copy = factReviewCopyFor(locale);
    assert.ok(copy.title);
    assert.equal(Object.keys(copy.labels).length, 7);
    assert.ok(Object.values(copy.labels).every((label) => label && !/[_.]/.test(label)));
    assert.ok(copy.recordA);
    assert.ok(copy.recordB);
    assert.ok(copy.pairCandidate);
    assert.ok(copy.pairAuditOnly);
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
  form.append("listingId", "MS-00922");
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

  const property = runtime.currentRows().properties.find((row) => row.id === "property-MS-00922");
  assert.equal(property.facts.bedrooms_count, 2);
  assert.equal(property.fact_verification.find((row) => row.field === "bedrooms_count").state, "broker_verified");
  assert.deepEqual(publicPropertyProjection(property).source_stated_facts, []);

  const currentListing = runtime.currentRows().listings.find((row) => row.id === "MS-00922");
  const sourceListing = seed.records.find((row) => row.id === "MS-00922");
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
    "MS-00922",
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
  const listing = seed.records.find((record) => record.id === "MS-00922");
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

test("fact review exposes a pending total-floor value when the floor number is already verified", async () => {
  const seed = loadCmsSeed();
  const listing = seed.records.find((record) => record.id === "MS-00922");
  const property = seed.properties.find((candidate) => candidate.id === listing.property);
  property.facts.floor_number = 2;
  property.facts.total_floors = 4;
  property.fact_verification = property.fact_verification.map((entry) =>
    entry.field === "floor_number"
      ? { ...entry, state: "broker_verified" }
      : entry.field === "total_floors"
        ? { ...entry, state: "entered_pending_review" }
        : entry,
  );
  const review = listingFactReviewFor({ listing, property });
  assert.deepEqual(review.unchecked_rows, ["floor", "bedrooms", "price"].sort((left, right) => FACT_REVIEW_ROW_KEYS.indexOf(left) - FACT_REVIEW_ROW_KEYS.indexOf(right)));
  assert.ok(review.rows.some((row) => row.editor_field === "total_floors" && row.property_fields.includes("total_floors")));
  assert.ok(!review.rows.some((row) => row.editor_field === "floor" && row.property_fields.includes("total_floors")));

  const runtime = createPayloadDraftRuntime(seed);
  await saveListingDraft(seed, {
    payload: runtime.payload,
    principal: { id: "editor_bg", roles: ["editor"], source: "test" },
    input: { listingId: listing.id, patch: { total_floors: 5 }, confirmedFacts: ["total_floors"] },
    editedAt: "2026-08-27T10:00:00.000Z",
  });
  const updated = runtime.currentRows().properties.find((candidate) => candidate.id === listing.property);
  assert.equal(updated.facts.floor_number, 2);
  assert.equal(updated.facts.total_floors, 5);
  assert.equal(updated.fact_verification.find((entry) => entry.field === "floor_number").state, "broker_verified");
  assert.equal(updated.fact_verification.find((entry) => entry.field === "total_floors").state, "broker_verified");
});
