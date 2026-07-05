import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { parseCsv } from "../lib/csv.mjs";
import {
  assertListingQualityReport,
  buildListingQualityReport,
  renderListingQualityWorkbook,
  validateListingQualityReviewCsv,
} from "../lib/listing-quality.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { fromRoot } from "../lib/paths.mjs";

test("listing quality report exposes actionable source listing gaps", () => {
  const report = buildListingQualityReport({ seed: loadCmsSeed(), generatedAt: "2026-07-05T00:00:00Z" });

  assert.equal(assertListingQualityReport(report), true);
  assert.equal(report.summary.listings, 165);
  assert.ok(report.summary.affected_listings > 0);
  assert.ok(report.summary.issue_counts.missing_price > 0);
  assert.ok(report.summary.issue_counts.missing_bedrooms > 0);
  assert.equal(Object.hasOwn(report.summary.issue_counts, "media_review_pending"), true);
  assert.equal(Object.hasOwn(report.summary.issue_counts, "missing_alt_text"), true);
  assert.ok(report.summary.issue_counts.thin_public_gallery > 0);
  assert.ok(report.rows.every((row) => Number.isInteger(row.missing_alt_text_assets)));
  assert.ok(report.rows.every((row) => row.review_status));
  assert.ok(report.rows.every((row) => row.required_editor_fields.length > 0));
  assert.ok(report.rows.every((row) => row.editor_path.startsWith("/admin/listings/edit?listingId=")));
});

test("listing quality does not require bedrooms for land listings", () => {
  const report = buildListingQualityReport({ seed: loadCmsSeed(), generatedAt: "2026-07-05T00:00:00Z" });
  const row = report.rows.find((candidate) => candidate.listing_id === "MS-CRAWL-0158");

  assert.ok(row);
  assert.equal(row.issues.includes("missing_bedrooms"), false);
  assert.equal(row.required_editor_fields.includes("bedrooms"), false);
});

test("listing quality does not require tour review for approved tour ledger rows", () => {
  const seed = loadCmsSeed();
  const record = seed.records.find((candidate) => candidate.collection === "listings" && candidate.id === "MS-CRAWL-0001");
  const report = buildListingQualityReport({
    seed,
    tourApprovals: [
      {
        ...record.tour,
        listing_id: record.id,
        panorama_url: "https://cdn.example.test/tours/MS-CRAWL-0001.jpg",
        accessibility_caption: "Reviewed 360 panorama for MS-CRAWL-0001.",
        is_public: true,
        review_status: "approved",
        reviewer: "media_editor",
        approved_at: "2026-07-05T00:00:00Z",
      },
    ],
    generatedAt: "2026-07-05T00:00:00Z",
  });
  const row = report.rows.find((candidate) => candidate.listing_id === "MS-CRAWL-0001");

  assert.ok(row);
  assert.equal(row.issues.includes("tour_review_pending"), false);
  assert.equal(row.required_editor_fields.includes("tour_review"), false);
});

test("listing quality workbook gives editors importable review rows without approvals", () => {
  const report = buildListingQualityReport({ seed: loadCmsSeed(), generatedAt: "2026-07-05T00:00:00Z" });
  const rows = parseCsv(renderListingQualityWorkbook(report));

  assert.equal(rows.length, report.rows.length);
  assert.equal(rows[0].listing_id, "MS-CRAWL-0001");
  assert.match(rows[0].issues, /missing_price/);
  assert.equal(rows[0].review_status, "needs_facts_review");
  assert.match(rows[0].required_editor_fields, /price_eur/);
  assert.doesNotMatch(rows[0].required_editor_fields, /media_review/);
  assert.doesNotMatch(rows[0].required_editor_fields, /description/);
  assert.equal(rows[0].description, "Updated approved source description.");
  assert.equal(rows[0].facts_reviewer, "");
  assert.equal(rows[0].media_reviewer, "");
  assert.match(rows[0].editor_path, /^\/admin\/listings\/edit\?listingId=/);
});

test("listing quality review CSV preflight validates reviewer fixes without applying edits", () => {
  const report = buildListingQualityReport({ seed: loadCmsSeed(), generatedAt: "2026-07-05T00:00:00Z" });
  const row = report.rows.find((candidate) => candidate.issues.includes("missing_description"));
  assert.ok(row, "expected a listing quality row that still requires description review");
  const csv = [
    "listing_id,price_eur,bedrooms,location,description,facts_reviewer,media_reviewer,review_notes",
    `${row.listing_id},123000,2,Sandanski,Reviewed listing description,editor_bg,media_editor,Reviewed from source evidence`,
  ].join("\n");

  const result = validateListingQualityReviewCsv(report, csv);

  assert.equal(result.summary.review_rows, 1);
  assert.equal(result.summary.facts_review_rows, 1);
  assert.equal(result.summary.media_review_rows, 1);
  assert.equal(result.reviews[0].listing_id, row.listing_id);
  const reviewValues = { price_eur: "123000", bedrooms: "2", description: "Reviewed listing description" };
  const expectedPatch = Object.fromEntries(
    Object.entries(reviewValues).filter(([field]) => row.required_editor_fields.includes(field)),
  );
  assert.deepEqual(result.reviews[0].patch, expectedPatch);
  assert.equal(result.reviews[0].editor, "editor_bg");
  assert.throws(
    () => validateListingQualityReviewCsv(report, `listing_id,price_eur,bedrooms\n${row.listing_id},,2\n`),
    /facts_reviewer|price_eur/,
  );
  assert.throws(() => validateListingQualityReviewCsv(report, `${csv}\n${csv.split("\n")[1]}\n`), /Duplicate/);
});

test("listing quality preflight CLI fails missing CSV and passes valid CSV", () => {
  const report = buildListingQualityReport({ seed: loadCmsSeed(), generatedAt: "2026-07-05T00:00:00Z" });
  const row = report.rows.find((candidate) => candidate.issues.includes("missing_description"));
  assert.ok(row, "expected a listing quality row that still requires description review");
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-quality-`);
  const csvPath = `${dir}/listing-quality.csv`;
  fs.writeFileSync(
    csvPath,
    [
      "listing_id,price_eur,bedrooms,location,description,facts_reviewer,media_reviewer,review_notes",
      `${row.listing_id},123000,2,Sandanski,Reviewed listing description,editor_bg,media_editor,Reviewed from source evidence`,
      "",
    ].join("\n"),
  );

  const script = fromRoot("production", "scripts", "validate-listing-quality-review.mjs");
  const missing = spawnSync(process.execPath, [script, `${csvPath}.missing`], { encoding: "utf8" });
  const valid = spawnSync(process.execPath, [script, csvPath], { encoding: "utf8" });

  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /LISTING QUALITY PREFLIGHT FAILED/);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /Listing quality review CSV valid: 1 rows/);
});

test("generated listing quality report is valid when present", () => {
  const file = fromRoot("production", "data", "listing-quality-report.json");
  if (!fs.existsSync(file)) return;
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertListingQualityReport(report), true);
  assert.equal(report.summary.listings, 165);
});

test("generated listing quality workbook is valid when present", () => {
  const file = fromRoot("production", "data", "listing-quality-workbook.csv");
  if (!fs.existsSync(file)) return;
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  assert.equal(rows.length, 165);
  assert.ok(rows.every((row) => row.review_status));
  assert.ok(rows.every((row) => row.required_editor_fields));
  assert.ok(rows.every((row) => row.editor_path.startsWith("/admin/listings/edit?listingId=")));
});
