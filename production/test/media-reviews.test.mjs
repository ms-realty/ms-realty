import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {
  appendMediaReview,
  applyMediaReviews,
  assertMediaReviews,
  createMediaReview,
  mediaAssetId,
  readMediaReviews,
  resetMediaReviews,
} from "../lib/media-reviews.mjs";
import { publicMediaLibrary } from "../lib/media.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

function fixture() {
  const seed = loadCmsSeed();
  const listing = seed.records.find((record) => record.id === "MS-CRAWL-0037");
  const asset = listing.media.find((item) => item.kind === "floor_plan");
  return { seed, listing, asset, assetId: mediaAssetId(asset) };
}

test("human media review publishes a replacement floor plan without losing its source URL", () => {
  const { seed, asset, assetId } = fixture();
  const review = createMediaReview(
    seed,
    {
      listingId: "MS-CRAWL-0037",
      assetId,
      decision: "publish",
      kind: "floor_plan",
      alt: "Reviewed floor plan for the property",
      replacementUrl: "https://ms-realty.ms-realty-bg.workers.dev/wp-content/uploads/2026/08/MS-CRAWL-0037-floor-plan.webp",
      reviewer: "media_editor",
      reviewConfirmed: true,
    },
    "2026-07-19T12:00:00Z",
  );
  const reviewedSeed = applyMediaReviews(seed, [review]);
  const listing = reviewedSeed.records.find((record) => record.id === "MS-CRAWL-0037");
  const reviewedAsset = listing.media.find((item) => item.asset_id === assetId);
  const library = publicMediaLibrary(listing.media);

  assert.equal(review.is_public, true);
  assert.equal(review.review_status, "approved_by_human");
  assert.equal(review.source_url, asset.source_url);
  assert.equal(reviewedAsset.source_url, asset.source_url);
  assert.equal(reviewedAsset.asset_url, "https://ms-realty.ms-realty-bg.workers.dev/wp-content/uploads/2026/08/MS-CRAWL-0037-floor-plan.webp");
  assert.equal(reviewedAsset.media_reviewer, "media_editor");
  assert.equal(listing.media_workflow.review_gated_assets, 0);
  assert.equal(library.floor_plans.length, 1);
  assert.equal(library.floor_plans[0].alt, "Reviewed floor plan for the property");
});

test("media review can keep an imported candidate private and retry safely", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-media-reviews-`)}/reviews.jsonl`;
  resetMediaReviews(file);
  const { seed, assetId } = fixture();
  const review = createMediaReview(seed, {
    id: "media-review-request-1",
    listingId: "MS-CRAWL-0037",
    assetId,
    decision: "keep_private",
    kind: "floor_plan",
    alt: "Legacy thumbnail is too small",
    reviewer: "media_editor",
    reviewConfirmed: "on",
  });
  const first = appendMediaReview(review, { filePath: file });
  const retry = appendMediaReview(review, { filePath: file });

  assert.equal(first.idempotent, false);
  assert.equal(retry.idempotent, true);
  assert.equal(readMediaReviews(file).length, 1);
  assert.equal(assertMediaReviews(readMediaReviews(file)), true);
});

test("media publication rejects missing human confirmation, captions, and non-owned image URLs", () => {
  const { seed, assetId } = fixture();
  const base = {
    listingId: "MS-CRAWL-0037",
    assetId,
    decision: "publish",
    kind: "floor_plan",
    reviewer: "media_editor",
    replacementUrl: "https://ms-realty.ms-realty-bg.workers.dev/wp-content/uploads/2026/08/MS-CRAWL-0037-floor-plan.webp",
  };

  assert.throws(() => createMediaReview(seed, { ...base, alt: "Reviewed floor plan" }), /explicit human confirmation/);
  assert.throws(() => createMediaReview(seed, { ...base, reviewConfirmed: true }), /requires reviewed alt text/);
  assert.throws(
    () => createMediaReview(seed, { ...base, alt: "Reviewed floor plan", replacementUrl: "http://cdn.example.test/plan.webp", reviewConfirmed: true }),
    /HTTPS asset URL/,
  );
  assert.throws(
    () => createMediaReview(seed, { ...base, alt: "Reviewed floor plan", replacementUrl: "https://cdn.example.test/plan.webp", reviewConfirmed: true }),
    /owned storage URL/,
  );
});


test("media review notes survive reload and distinguish a changed decision from a retry", (t) => {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-media-note-`);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = `${directory}/reviews.jsonl`;
  const { seed, assetId } = fixture();
  const input = { listingId: "MS-CRAWL-0037", assetId, kind: "floor_plan", decision: "keep_private", reviewer: "media_editor", reviewConfirmed: true, reviewNote: "  Client details are visible; await a redacted replacement.  " };
  const review = createMediaReview(seed, input);
  const first = appendMediaReview(review, { filePath });
  assert.equal(first.review_note, input.reviewNote.trim());
  assert.equal(appendMediaReview(review, { filePath }).idempotent, true);
  assert.throws(() => appendMediaReview({ ...review, id: first.id, review_note: "Different reason" }, { filePath }), /different decision/);
  const changed = appendMediaReview({ ...review, review_note: "Replacement still needs review." }, { filePath });
  assert.notEqual(changed.id, first.id);
  const reloaded = applyMediaReviews(seed, readMediaReviews(filePath));
  const asset = reloaded.records.find(row => row.id === input.listingId).media.find(row => row.asset_id === assetId);
  assert.equal(asset.media_review_note, changed.review_note);
  assert.equal(asset.is_public, false);
  assert.throws(() => createMediaReview(seed, { ...input, reviewNote: " " }), /must not be empty/);
  assert.throws(() => createMediaReview(seed, { ...input, reviewNote: "x".repeat(2001) }), /2000 characters/);
  // Old callers and historical rows had no note. Do not invent one for them.
  const { reviewNote, ...legacy } = input;
  assert.equal(Object.hasOwn(createMediaReview(seed, legacy), "review_note"), false);
});
