import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  contentEvidenceDirectoryFromEnv,
  contentEvidenceForOldUrl,
  contentForOldUrl,
  loadMigrationContentEvidence,
} from "../lib/migration-content-evidence.mjs";
import { assertMigrationReviewQueue, buildMigrationReviewQueue } from "../lib/migration-review.mjs";

const CAPTURED_URL = "https://example.test/legacy";
const SKIPPED_URL = "https://example.test/blocked";
const CAPTURED_BODY = "Legacy source copy.";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function records() {
  return [
    { id: "url-0001", old_url: CAPTURED_URL, source_domain: "example.test", url_type: "page", metadata_gaps: {}, review_state: "metadata_review" },
    { id: "url-0002", old_url: SKIPPED_URL, source_domain: "example.test", url_type: "taxonomy", metadata_gaps: {}, review_state: "metadata_review" },
  ];
}

function writeArtifact({ omitSkipped = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-content-evidence-"));
  const evidenceDir = path.join(root, "evidence");
  fs.mkdirSync(evidenceDir);
  const sourceInventoryPath = path.join(root, "url-inventory.csv");
  const sourceInventory = [
    "source_domain,sitemap_source,url,url_type",
    `example.test,https://example.test/sitemap,${CAPTURED_URL},page`,
    `example.test,https://example.test/sitemap,${SKIPPED_URL},taxonomy`,
    "",
  ].join("\n");
  fs.writeFileSync(sourceInventoryPath, sourceInventory);

  const captured = {
    source_domain: "example.test",
    url: CAPTURED_URL,
    url_type: "page",
    status: 200,
    final_url: CAPTURED_URL,
    content_type: "text/html",
    captured_at_utc: "2026-07-29T12:00:00+00:00",
    extractor: "html-primary-content-v1",
    content_scope: "main",
    content_word_count: 3,
    extracted_body_text: CAPTURED_BODY,
    text_sha256: sha256(CAPTURED_BODY),
    response_sha256: sha256("<main>Legacy source copy.</main>"),
  };
  const contentText = `${JSON.stringify(captured)}\n`;
  const skippedText = omitSkipped
    ? "source_domain,url,url_type,status,final_url,reason,detail\n"
    : [
        "source_domain,url,url_type,status,final_url,reason,detail",
        `example.test,${SKIPPED_URL},taxonomy,200,,robots_disallowed,https://example.test/robots.txt`,
        "",
      ].join("\n");
  fs.writeFileSync(path.join(evidenceDir, "content-inventory.jsonl"), contentText);
  fs.writeFileSync(path.join(evidenceDir, "content-capture-skipped.csv"), skippedText);
  const skippedRows = omitSkipped ? 0 : 1;
  const manifest = {
    schema_version: 1,
    artifact_id: "capture-test",
    captured_at_utc: "2026-07-29T12:00:00+00:00",
    extractor: "html-primary-content-v1",
    source_inventory: { path: sourceInventoryPath, sha256: sha256(sourceInventory) },
    counts: { source_urls: omitSkipped ? 1 : 2, captured: 1, skipped: skippedRows },
    robots: [],
    files: {
      "content-inventory.jsonl": { sha256: sha256(contentText), rows: 1 },
      "content-capture-skipped.csv": { sha256: sha256(skippedText), rows: skippedRows },
    },
  };
  fs.writeFileSync(path.join(evidenceDir, "content-evidence-manifest.json"), `${JSON.stringify(manifest)}\n`);
  return { evidenceDir, root, sourceInventoryPath };
}

test("content evidence joins captured and robots-skipped URLs without serializing source text", () => {
  const fixture = writeArtifact();
  try {
    const evidence = loadMigrationContentEvidence(records(), fixture);
    assert.equal(evidence.state, "ready");
    assert.deepEqual(evidence.summary, { captured: 1, skipped: 1, unavailable: 0 });
    assert.equal(JSON.stringify(evidence).includes(CAPTURED_BODY), false);

    const captured = contentEvidenceForOldUrl(evidence, CAPTURED_URL);
    assert.equal(captured.state, "captured");
    assert.equal(captured.content_word_count, 3);
    assert.equal(JSON.stringify(captured).includes(CAPTURED_BODY), false);
    assert.equal(contentForOldUrl(evidence, CAPTURED_URL).extracted_body_text, CAPTURED_BODY);

    const skipped = contentEvidenceForOldUrl(evidence, SKIPPED_URL);
    assert.deepEqual(skipped.skip, {
      status: 200,
      final_url: "",
      reason: "robots_disallowed",
      detail: "https://example.test/robots.txt",
    });
    assert.equal(contentForOldUrl(evidence, SKIPPED_URL), null);

    const routes = [
      { old_url: CAPTURED_URL, source_domain: "example.test", url_type: "page", target_path: "/bg/kontakt", deployable: false },
      { old_url: SKIPPED_URL, source_domain: "example.test", url_type: "taxonomy", target_path: null, deployable: false },
    ];
    const queue = buildMigrationReviewQueue(records(), routes, evidence);
    assert.equal(queue.rows[1].target_path, null);
    assert.equal(JSON.stringify(queue).includes(CAPTURED_BODY), false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("missing or incomplete evidence fails closed to safe unavailable metadata", () => {
  const notConfigured = loadMigrationContentEvidence(records());
  assert.deepEqual(contentEvidenceForOldUrl(notConfigured, CAPTURED_URL), { state: "unavailable", reason: "not_configured" });
  assert.equal(contentForOldUrl(notConfigured, CAPTURED_URL), null);

  const fixture = writeArtifact({ omitSkipped: true });
  try {
    const evidence = loadMigrationContentEvidence(records(), fixture);
    assert.equal(evidence.state, "unavailable");
    assert.deepEqual(contentEvidenceForOldUrl(evidence, CAPTURED_URL), { state: "unavailable", reason: "invalid_evidence" });
    assert.equal(contentForOldUrl(evidence, CAPTURED_URL), null);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("content and source inventory hash drift fail closed", () => {
  const contentFixture = writeArtifact();
  try {
    fs.appendFileSync(path.join(contentFixture.evidenceDir, "content-inventory.jsonl"), "\n");
    const evidence = loadMigrationContentEvidence(records(), contentFixture);
    assert.deepEqual(contentEvidenceForOldUrl(evidence, CAPTURED_URL), { state: "unavailable", reason: "invalid_evidence" });
  } finally {
    fs.rmSync(contentFixture.root, { recursive: true, force: true });
  }

  const inventoryFixture = writeArtifact();
  try {
    fs.appendFileSync(inventoryFixture.sourceInventoryPath, "\n");
    const evidence = loadMigrationContentEvidence(records(), inventoryFixture);
    assert.deepEqual(contentEvidenceForOldUrl(evidence, CAPTURED_URL), { state: "unavailable", reason: "invalid_evidence" });
  } finally {
    fs.rmSync(inventoryFixture.root, { recursive: true, force: true });
  }
});

test("queue assertion rejects accidental raw source body serialization", () => {
  assert.throws(
    () =>
      assertMigrationReviewQueue({
        summary: {
          total: 457,
          ruRows: 179,
          nonListingUnmapped: 292,
          listingRedirectReviews: 165,
          deployableRows: 0,
          byOwner: { unassigned: 457 },
          byRole: { ru_preservation_editor: 179 },
        },
        rows: [{ content_evidence: { extracted_body_text: CAPTURED_BODY } }],
      }),
    /must not serialize captured source body text/,
  );
});

test("evidence directory is opt-in through MS_REALTY_CONTENT_EVIDENCE_DIR", () => {
  assert.equal(contentEvidenceDirectoryFromEnv({}), null);
  assert.equal(contentEvidenceDirectoryFromEnv({ MS_REALTY_CONTENT_EVIDENCE_DIR: "/private/evidence" }), "/private/evidence");
});
