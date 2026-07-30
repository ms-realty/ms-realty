import fs from "node:fs";
import path from "node:path";
import { applyListingEdits, readListingEdits } from "./listing-edits.mjs";
import {
  contentEvidenceForOldUrl,
  contentForOldUrl,
  loadMigrationContentEvidence,
} from "./migration-content-evidence.mjs";
import { fromRoot } from "./paths.mjs";
import { loadCmsSeed } from "./runtime.mjs";

export const DEFAULT_LISTING_DESCRIPTION_REVIEW_OUTPUT = fromRoot("production", "data", "listing-description-review.json");
export const DEFAULT_LISTING_DESCRIPTION_EVIDENCE_DIR = fromRoot(
  "migration",
  "content-evidence",
  "20260729-legacy-content-review",
);
export const DEFAULT_MIGRATION_RECORDS_PATH = fromRoot("production", "data", "migration-records.json");

const SHORT_DESCRIPTION_MAX_CHARS = 160;
const FRESH_CAPTURE_CONFLICT_RECALL = 0.5;
const PRIORITY_ORDER = new Map([
  ["P0", 0],
  ["P1", 1],
  ["P2", 2],
  ["P3", 3],
]);

function filled(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function cleanText(value) {
  return String(value || "").trim();
}

function jsonFromFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeGeneratedAt(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Listing description review requires a valid generatedAt");
  return parsed.toISOString();
}

function tokenCounts(value) {
  const tokens = cleanText(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return tokens.reduce((counts, token) => counts.set(token, (counts.get(token) || 0) + 1), new Map());
}

function descriptionTokenRecall(description, sourceText) {
  const descriptionTokens = tokenCounts(description);
  const sourceTokens = tokenCounts(sourceText);
  const total = [...descriptionTokens.values()].reduce((sum, count) => sum + count, 0);
  if (!total) return null;
  let overlap = 0;
  for (const [token, count] of descriptionTokens) overlap += Math.min(count, sourceTokens.get(token) || 0);
  return Number((overlap / total).toFixed(4));
}

function safeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function safeCaptureMetadata(capture) {
  if (capture?.state !== "captured") return null;
  return {
    state: "captured",
    captured_at_utc: cleanText(capture.captured_at_utc) || null,
    status: safeInteger(capture.status),
    final_url: cleanText(capture.final_url) || null,
    extractor: cleanText(capture.extractor) || null,
    content_scope: cleanText(capture.content_scope) || null,
    content_word_count: safeInteger(capture.content_word_count),
    text_sha256: cleanText(capture.text_sha256) || null,
    response_sha256: cleanText(capture.response_sha256) || null,
  };
}

function safeSkipMetadata(skip) {
  if (skip?.state !== "skipped") return null;
  return {
    state: "skipped",
    captured_at_utc: cleanText(skip.captured_at_utc) || null,
    extractor: cleanText(skip.extractor) || null,
    status: safeInteger(skip.skip?.status),
    final_url: cleanText(skip.skip?.final_url) || null,
    reason: cleanText(skip.skip?.reason) || null,
    detail: cleanText(skip.skip?.detail) || null,
  };
}

function safeUnavailableMetadata(unavailable) {
  return {
    state: "unavailable",
    reason: cleanText(unavailable?.reason) || "not_configured",
  };
}

function evidenceManifest(evidence = {}) {
  const artifact = evidence.artifact || {};
  return {
    validation_state: cleanText(evidence.state) || "unavailable",
    reason: cleanText(evidence.reason) || null,
    artifact_id: cleanText(artifact.artifact_id) || null,
    captured_at_utc: cleanText(artifact.captured_at_utc) || null,
    extractor: cleanText(artifact.extractor) || null,
    source_inventory_sha256: cleanText(artifact.source_inventory_sha256) || null,
    capture_count: safeInteger(evidence.summary?.captured),
    skip_count: safeInteger(evidence.summary?.skipped),
    unavailable_count: safeInteger(evidence.summary?.unavailable),
  };
}

function readMigrationRecords(filePath = DEFAULT_MIGRATION_RECORDS_PATH) {
  return jsonFromFile(filePath).records || [];
}

function descriptionEditByListing(edits) {
  const latest = new Map();
  for (const edit of edits) {
    if (!edit?.listing_id || !Object.hasOwn(edit.patch || {}, "description")) continue;
    latest.set(edit.listing_id, edit);
  }
  return latest;
}

function provenanceFor({ descriptionEdit, description }) {
  const hasReviewEvidence = filled(descriptionEdit?.review_source) || filled(descriptionEdit?.review_notes);
  if (descriptionEdit && !hasReviewEvidence && cleanText(description).toLowerCase() === "updated approved source description.") {
    return {
      classification: "unprovenanced_placeholder",
      description_edit_id: cleanText(descriptionEdit.id) || null,
      edited_at: cleanText(descriptionEdit.edited_at) || null,
      review_source: null,
      source_hash_before: cleanText(descriptionEdit.source_hash_before) || null,
      source_hash_after: cleanText(descriptionEdit.source_hash_after) || null,
    };
  }
  if (descriptionEdit && hasReviewEvidence) {
    return {
      classification: "ledger_source_reviewed",
      description_edit_id: cleanText(descriptionEdit.id) || null,
      edited_at: cleanText(descriptionEdit.edited_at) || null,
      review_source: cleanText(descriptionEdit.review_source) || null,
      source_hash_before: cleanText(descriptionEdit.source_hash_before) || null,
      source_hash_after: cleanText(descriptionEdit.source_hash_after) || null,
    };
  }
  if (descriptionEdit) {
    return {
      classification: "ledger_edit_without_source_note",
      description_edit_id: cleanText(descriptionEdit.id) || null,
      edited_at: cleanText(descriptionEdit.edited_at) || null,
      review_source: null,
      source_hash_before: cleanText(descriptionEdit.source_hash_before) || null,
      source_hash_after: cleanText(descriptionEdit.source_hash_after) || null,
    };
  }
  return {
    classification: "source_imported_metadata",
    description_edit_id: null,
    edited_at: null,
    review_source: null,
    source_hash_before: null,
    source_hash_after: null,
  };
}

function migrationFor(record) {
  if (!record) {
    return {
      record_id: null,
      baseline_status: null,
      baseline_word_count: null,
      source_meta_description_present: false,
      source_open_graph_present: false,
    };
  }
  return {
    record_id: cleanText(record.id) || null,
    baseline_status: safeInteger(record.status),
    baseline_word_count: safeInteger(record.word_count),
    source_meta_description_present: filled(record.source_seo?.meta_description),
    source_open_graph_present: filled(record.source_seo?.open_graph),
  };
}

function isFreshSourceUnavailable(contentEvidence) {
  return contentEvidence?.state === "skipped" && safeInteger(contentEvidence.skip?.status) === 404;
}

function priorityFor({ provenance, freshCaptureConflict, freshSourceUnavailable, shortDescription }) {
  if (provenance.classification === "unprovenanced_placeholder") return "P0";
  if (freshCaptureConflict || freshSourceUnavailable) return "P1";
  if (shortDescription) return "P2";
  return "P3";
}

function statusFor({ provenance, freshCaptureConflict, freshSourceUnavailable, shortDescription }) {
  if (provenance.classification === "unprovenanced_placeholder") return "unprovenanced_placeholder";
  if (freshSourceUnavailable) return "fresh_source_unavailable";
  if (freshCaptureConflict) return "evidence_conflict";
  if (shortDescription) return "needs_editor_review";
  return "preserve_provenance";
}

function countBy(rows, keyFn) {
  return rows.reduce((counts, row) => {
    const key = keyFn(row) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function buildRow({ record, contentEvidence, sourceContent, migration, descriptionEdit, artifactId }) {
  const description = cleanText(record.facts?.description || record.seo?.description);
  const provenance = provenanceFor({ descriptionEdit, description });
  const recall =
    contentEvidence?.state === "captured"
      ? descriptionTokenRecall(description, sourceContent?.extracted_body_text)
      : null;
  const freshCaptureConflict = recall !== null && recall < FRESH_CAPTURE_CONFLICT_RECALL;
  const freshSourceUnavailable = isFreshSourceUnavailable(contentEvidence);
  const shortDescription = description.length <= SHORT_DESCRIPTION_MAX_CHARS;
  const evidenceFlags = [];
  if (provenance.classification === "unprovenanced_placeholder") evidenceFlags.push("unprovenanced_placeholder");
  if (freshCaptureConflict) evidenceFlags.push("fresh_capture_description_conflict");
  if (freshSourceUnavailable) evidenceFlags.push("fresh_capture_404");
  if (shortDescription) evidenceFlags.push("short_description");

  const freshCapture = contentEvidence?.state === "captured"
    ? {
        artifact_id: artifactId,
        ...safeCaptureMetadata(contentEvidence),
        description_token_recall: recall,
      }
    : contentEvidence?.state === "skipped"
      ? {
          artifact_id: artifactId,
          ...safeSkipMetadata(contentEvidence),
        }
      : safeUnavailableMetadata(contentEvidence);

  return {
    listing_id: record.id,
    source_locale: record.source_locale,
    source_domain: record.source_domain,
    source_url: record.source_url,
    target_path: record.routing?.target_path || null,
    cms_status: record.cms_status,
    public_description: description,
    public_description_characters: description.length,
    seo_action: "retain",
    priority: priorityFor({ provenance, freshCaptureConflict, freshSourceUnavailable, shortDescription }),
    status: statusFor({ provenance, freshCaptureConflict, freshSourceUnavailable, shortDescription }),
    evidence_flags: evidenceFlags,
    provenance,
    migration: migrationFor(migration),
    fresh_capture: freshCapture,
  };
}

function sortRows(rows) {
  return [...rows].sort((left, right) => {
    const priorityDifference = PRIORITY_ORDER.get(left.priority) - PRIORITY_ORDER.get(right.priority);
    if (priorityDifference) return priorityDifference;
    return left.listing_id.localeCompare(right.listing_id);
  });
}

export function buildListingDescriptionReview({
  seed = loadCmsSeed(),
  listingEdits = readListingEdits(),
  migrationRecords = readMigrationRecords(),
  evidenceDir = DEFAULT_LISTING_DESCRIPTION_EVIDENCE_DIR,
  sourceInventoryPath = undefined,
  generatedAt = new Date().toISOString(),
} = {}) {
  const evidence = loadMigrationContentEvidence(migrationRecords, { evidenceDir, sourceInventoryPath });
  const migrationByUrl = new Map(migrationRecords.map((record) => [record.old_url, record]));
  const descriptionEdits = descriptionEditByListing(listingEdits);
  const listings = applyListingEdits(seed, listingEdits).records.filter((record) => record.collection === "listings");
  const rows = sortRows(
    listings.map((record) =>
      buildRow({
        record,
        contentEvidence: contentEvidenceForOldUrl(evidence, record.source_url),
        sourceContent: contentForOldUrl(evidence, record.source_url),
        migration: migrationByUrl.get(record.source_url),
        descriptionEdit: descriptionEdits.get(record.id),
        artifactId: evidence.artifact?.artifact_id || null,
      }),
    ),
  );

  const ledgerDescriptionEdits = [...descriptionEdits.values()];
  return {
    kind: "listing_description_review_queue",
    generated_at: normalizeGeneratedAt(generatedAt),
    source_evidence: evidenceManifest(evidence),
    summary: {
      listings: listings.length,
      rows: rows.length,
      ledger_description_edits: ledgerDescriptionEdits.length,
      source_reviewed_ledger_descriptions: ledgerDescriptionEdits.filter(
        (edit) => filled(edit.review_source) || filled(edit.review_notes),
      ).length,
      fresh_captured_listings: rows.filter((row) => row.fresh_capture.state === "captured").length,
      fresh_source_unavailable: rows.filter((row) => row.status === "fresh_source_unavailable").length,
      evidence_conflicts: rows.filter((row) => row.evidence_flags.includes("fresh_capture_description_conflict")).length,
      by_priority: countBy(rows, (row) => row.priority),
      by_status: countBy(rows, (row) => row.status),
      by_provenance: countBy(rows, (row) => row.provenance.classification),
    },
    rows,
  };
}

export function assertListingDescriptionReview(review) {
  if (review?.kind !== "listing_description_review_queue") throw new Error("Listing description review kind is invalid");
  if (!review.generated_at || Number.isNaN(Date.parse(review.generated_at))) {
    throw new Error("Listing description review requires generated_at");
  }
  if (!Array.isArray(review.rows) || review.rows.length !== review.summary?.rows) {
    throw new Error("Listing description review rows must match summary");
  }
  const seen = new Set();
  for (const row of review.rows) {
    if (!filled(row.listing_id) || seen.has(row.listing_id)) throw new Error("Listing description review rows must have unique listing_id");
    seen.add(row.listing_id);
    if (!filled(row.source_url)) throw new Error(`Listing ${row.listing_id} requires source_url`);
    if (!filled(row.public_description)) throw new Error(`Listing ${row.listing_id} requires public_description`);
    if (row.seo_action !== "retain") throw new Error(`Listing ${row.listing_id} must retain SEO copy pending a separate review`);
    if (!PRIORITY_ORDER.has(row.priority)) throw new Error(`Listing ${row.listing_id} has invalid priority`);
    if (Object.hasOwn(row, "extracted_body_text") || Object.hasOwn(row.fresh_capture || {}, "extracted_body_text")) {
      throw new Error(`Listing ${row.listing_id} must not serialize extracted_body_text`);
    }
    if (row.status === "fresh_source_unavailable" && row.fresh_capture?.status !== 404) {
      throw new Error(`Listing ${row.listing_id} fresh_source_unavailable requires a capture 404`);
    }
  }
  if (JSON.stringify(review).includes("extracted_body_text")) {
    throw new Error("Listing description review must not serialize extracted_body_text");
  }
  return true;
}

export function writeListingDescriptionReview(review, outPath = DEFAULT_LISTING_DESCRIPTION_REVIEW_OUTPUT) {
  assertListingDescriptionReview(review);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(review, null, 2)}\n`);
  return { outPath, summary: review.summary };
}
