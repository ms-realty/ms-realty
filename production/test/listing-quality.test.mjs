import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseCsv } from "../lib/csv.mjs";
import { assertListingQualityReport, buildListingQualityReport, renderListingQualityWorkbook } from "../lib/listing-quality.mjs";
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
  assert.ok(report.rows.every((row) => row.editor_path.startsWith("/admin/listings/edit?listingId=")));
});

test("listing quality workbook gives editors importable review rows without approvals", () => {
  const report = buildListingQualityReport({ seed: loadCmsSeed(), generatedAt: "2026-07-05T00:00:00Z" });
  const rows = parseCsv(renderListingQualityWorkbook(report));

  assert.equal(rows.length, report.rows.length);
  assert.equal(rows[0].listing_id, "MS-CRAWL-0001");
  assert.match(rows[0].issues, /missing_price/);
  assert.equal(rows[0].facts_reviewer, "");
  assert.equal(rows[0].media_reviewer, "");
  assert.match(rows[0].editor_path, /^\/admin\/listings\/edit\?listingId=/);
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
  assert.ok(rows.every((row) => row.editor_path.startsWith("/admin/listings/edit?listingId=")));
});
