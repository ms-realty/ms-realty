import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertListingDescriptionReview,
  buildListingDescriptionReview,
  writeListingDescriptionReview,
} from "../lib/listing-description-review.mjs";

const FIXTURE_URL = "https://example.test/listing-1";
const FIXTURE_BODY = "Private source evidence that must never appear in the queue.";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fixtureSeed() {
  return {
    records: [
      {
        id: "LISTING-1",
        collection: "listings",
        cms_status: "source_imported_review_required",
        source_locale: "bg",
        source_domain: "example.test",
        source_url: FIXTURE_URL,
        routing: { target_path: "/bg/imoti/LISTING-1" },
        facts: { description: "Current public description" },
        seo: { description: "Current public description" },
      },
    ],
  };
}

function writeVerifiedEvidenceArtifact() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-description-evidence-"));
  const evidenceDir = path.join(root, "evidence");
  const sourceInventoryPath = path.join(root, "url-inventory.csv");
  fs.mkdirSync(evidenceDir);
  const migrationRecords = [
    {
      id: "url-1",
      old_url: FIXTURE_URL,
      source_domain: "example.test",
      url_type: "page",
      status: 200,
      word_count: 12,
      source_seo: {},
    },
  ];
  const sourceInventory = [
    "source_domain,sitemap_source,url,url_type",
    `example.test,https://example.test/sitemap,${FIXTURE_URL},page`,
    "",
  ].join("\n");
  const captured = {
    source_domain: "example.test",
    url: FIXTURE_URL,
    url_type: "page",
    status: 200,
    final_url: FIXTURE_URL,
    captured_at_utc: "2026-07-29T12:39:33+00:00",
    extractor: "html-primary-content-v1",
    content_scope: "class:post_content",
    content_word_count: 9,
    extracted_body_text: FIXTURE_BODY,
    text_sha256: sha256(FIXTURE_BODY),
    response_sha256: sha256("<main>fixture source response</main>"),
  };
  const contentText = `${JSON.stringify(captured)}\n`;
  const skippedText = "source_domain,url,url_type,status,final_url,reason,detail\n";
  const manifest = {
    schema_version: 1,
    artifact_id: "fixture-evidence",
    captured_at_utc: "2026-07-29T12:39:33+00:00",
    extractor: "html-primary-content-v1",
    source_inventory: { path: sourceInventoryPath, sha256: sha256(sourceInventory) },
    counts: { source_urls: 1, captured: 1, skipped: 0 },
    robots: [],
    files: {
      "content-inventory.jsonl": { sha256: sha256(contentText), rows: 1 },
      "content-capture-skipped.csv": { sha256: sha256(skippedText), rows: 0 },
    },
  };
  fs.writeFileSync(sourceInventoryPath, sourceInventory);
  fs.writeFileSync(path.join(evidenceDir, "content-inventory.jsonl"), contentText);
  fs.writeFileSync(path.join(evidenceDir, "content-capture-skipped.csv"), skippedText);
  fs.writeFileSync(path.join(evidenceDir, "content-evidence-manifest.json"), `${JSON.stringify(manifest)}\n`);
  return { root, evidenceDir, sourceInventoryPath, migrationRecords };
}

test("description review queue preserves ledger provenance and keeps captured source text out", () => {
  const review = buildListingDescriptionReview({ generatedAt: "2026-07-29T12:39:33+00:00" });
  const repaired = review.rows.find((row) => row.listing_id === "MS-CRAWL-0001");
  const conflict = review.rows.find((row) => row.listing_id === "MS-CRAWL-0070");
  const unavailable = review.rows.find((row) => row.listing_id === "MS-CRAWL-0008");
  const sourceReviewed = review.rows.find((row) => row.listing_id === "MS-CRAWL-0002");
  const restoredListingIds = [
    "MS-CRAWL-0006",
    "MS-CRAWL-0013",
    "MS-CRAWL-0024",
    "MS-CRAWL-0059",
    "MS-CRAWL-0069",
    "MS-CRAWL-0071",
    "MS-CRAWL-0081",
    "MS-CRAWL-0123",
    "MS-CRAWL-0151",
  ];
  const serialized = JSON.stringify(review);

  assert.equal(assertListingDescriptionReview(review), true);
  assert.equal(review.summary.listings, 165);
  assert.equal(review.summary.ledger_description_edits, 130);
  assert.equal(review.summary.source_reviewed_ledger_descriptions, 130);
  assert.equal(review.summary.evidence_conflicts, 5);
  assert.equal(review.summary.by_priority.P1, 10);
  assert.equal(review.source_evidence.validation_state, "ready");
  assert.equal(review.source_evidence.capture_count, 418);
  assert.equal(review.source_evidence.skip_count, 39);
  assert.notEqual(repaired.priority, "P0");
  assert.notEqual(repaired.status, "unprovenanced_placeholder");
  assert.equal(repaired.provenance.classification, "ledger_source_reviewed");
  assert.match(repaired.public_description, /^Комплекс за дългосрочен наем/);
  assert.equal(repaired.seo_action, "retain");
  assert.equal(conflict.priority, "P1");
  assert.equal(conflict.status, "evidence_conflict");
  assert.equal(unavailable.status, "fresh_source_unavailable");
  assert.equal(unavailable.fresh_capture.status, 404);
  assert.equal(sourceReviewed.provenance.classification, "ledger_source_reviewed");
  for (const listingId of restoredListingIds) {
    const row = review.rows.find((candidate) => candidate.listing_id === listingId);
    assert.equal(row.provenance.classification, "ledger_source_reviewed");
    assert.equal(row.provenance.description_edit_id, `listing-content-${listingId}`);
    assert.equal(row.provenance.review_source, "legacy_wordpress_content_capture");
    assert.equal(row.fresh_capture.state, "captured");
  }
  assert.match(
    review.rows.find((row) => row.listing_id === "MS-CRAWL-0006").public_description,
    /^Производствено\/складово помещение в промишлената зона на Сандански/,
  );
  assert.match(
    review.rows.find((row) => row.listing_id === "MS-CRAWL-0123").public_description,
    /^Одноэтажное производственное здание площадью 417 кв\.м\./,
  );
  assert.equal(Object.hasOwn(sourceReviewed.fresh_capture, "extracted_body_text"), false);
  assert.equal(serialized.includes("extracted_body_text"), false);
  assert.equal(serialized.includes("Комплекса се намира на магистрала София"), false);
});

test("description review serializes only safe metadata from hash-validated evidence", () => {
  const fixture = writeVerifiedEvidenceArtifact();
  const outputPath = path.join(fixture.root, "queue.json");
  try {
    const review = buildListingDescriptionReview({
      generatedAt: "2026-07-29T12:39:33+00:00",
      seed: fixtureSeed(),
      listingEdits: [
        {
          listing_id: "LISTING-1",
          patch: { description: "Ledger-applied public description" },
          review_source: "fixture_source",
        },
      ],
      migrationRecords: fixture.migrationRecords,
      evidenceDir: fixture.evidenceDir,
      sourceInventoryPath: fixture.sourceInventoryPath,
    });
    const row = review.rows[0];

    assert.equal(row.public_description, "Ledger-applied public description");
    assert.equal(review.source_evidence.validation_state, "ready");
    assert.equal(review.source_evidence.capture_count, 1);
    assert.equal(row.fresh_capture.text_sha256, sha256(FIXTURE_BODY));
    assert.equal(row.fresh_capture.response_sha256, sha256("<main>fixture source response</main>"));
    assert.equal(Object.hasOwn(row.fresh_capture, "extracted_body_text"), false);
    assert.equal(JSON.stringify(review).includes(FIXTURE_BODY), false);
    assert.equal(writeListingDescriptionReview(review, outputPath).outPath, outputPath);
    assert.equal(JSON.parse(fs.readFileSync(outputPath, "utf8")).rows[0].fresh_capture.text_sha256, sha256(FIXTURE_BODY));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("description review fails closed when evidence integrity validation fails", () => {
  const fixture = writeVerifiedEvidenceArtifact();
  try {
    fs.appendFileSync(path.join(fixture.evidenceDir, "content-inventory.jsonl"), "\n");
    const review = buildListingDescriptionReview({
      generatedAt: "2026-07-29T12:39:33+00:00",
      seed: fixtureSeed(),
      listingEdits: [],
      migrationRecords: fixture.migrationRecords,
      evidenceDir: fixture.evidenceDir,
      sourceInventoryPath: fixture.sourceInventoryPath,
    });

    assert.equal(review.source_evidence.validation_state, "unavailable");
    assert.equal(review.source_evidence.reason, "invalid_evidence");
    assert.deepEqual(review.rows[0].fresh_capture, { state: "unavailable", reason: "invalid_evidence" });
    assert.equal(JSON.stringify(review).includes(FIXTURE_BODY), false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
