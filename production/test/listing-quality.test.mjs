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
  assert.ok(report.summary.issue_counts.media_review_pending > 0);
  assert.ok(report.summary.issue_counts.missing_alt_text > 0);
  assert.ok(report.summary.issue_counts.thin_public_gallery > 0);
  assert.ok(report.rows.some((row) => row.missing_alt_text_assets > 0));
  assert.ok(report.rows.every((row) => row.review_status));
  assert.ok(report.rows.every((row) => row.required_editor_fields.length > 0));
  assert.ok(report.rows.every((row) => row.editor_path.startsWith("/admin/listings/edit?listingId=")));
});

test("listing quality workbook gives editors importable review rows without approvals", () => {
  const report = buildListingQualityReport({ seed: loadCmsSeed(), generatedAt: "2026-07-05T00:00:00Z" });
  const rows = parseCsv(renderListingQualityWorkbook(report));

  assert.equal(rows.length, report.rows.length);
  assert.equal(rows[0].listing_id, "MS-CRAWL-0001");
  assert.match(rows[0].issues, /missing_price/);
  assert.equal(rows[0].review_status, "needs_facts_and_media_review");
  assert.match(rows[0].required_editor_fields, /price_eur/);
  assert.match(rows[0].required_editor_fields, /media_review/);
  assert.equal(rows[0].description, "");
  assert.equal(rows[0].facts_reviewer, "");
  assert.equal(rows[0].media_reviewer, "");
  assert.match(rows[0].editor_path, /^\/admin\/listings\/edit\?listingId=/);
});

test("listing quality review CSV preflight validates reviewer fixes without applying edits", () => {
  const report = buildListingQualityReport({ seed: loadCmsSeed(), generatedAt: "2026-07-05T00:00:00Z" });
  const row = report.rows[0];
  const csv = [
    "listing_id,price_eur,bedrooms,location,description,facts_reviewer,media_reviewer,review_notes",
    `${row.listing_id},123000,2,Sandanski,Reviewed listing description,editor_bg,media_editor,Reviewed from source evidence`,
  ].join("\n");

  const result = validateListingQualityReviewCsv(report, csv);

  assert.equal(result.summary.review_rows, 1);
  assert.equal(result.summary.facts_review_rows, 1);
  assert.equal(result.summary.media_review_rows, 1);
  assert.equal(result.reviews[0].listing_id, row.listing_id);
  assert.throws(
    () => validateListingQualityReviewCsv(report, `listing_id,price_eur,bedrooms\n${row.listing_id},,2\n`),
    /facts_reviewer|price_eur/,
  );
  assert.throws(() => validateListingQualityReviewCsv(report, `${csv}\n${csv.split("\n")[1]}\n`), /Duplicate/);
});

test("listing quality preflight CLI fails missing CSV and passes valid CSV", () => {
  const report = buildListingQualityReport({ seed: loadCmsSeed(), generatedAt: "2026-07-05T00:00:00Z" });
  const row = report.rows[0];
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
