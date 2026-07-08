import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { parseCsv } from "../lib/csv.mjs";
import {
  applyListingEdits,
  readListingEdits,
} from "../lib/listing-edits.mjs";
import {
  assertListingQualityPreflightReport,
  assertListingQualityReviewPacket,
  assertListingQualityReport,
  buildListingQualityPreflightReport,
  buildListingQualityReport,
  buildListingQualityReviewPacket,
  renderListingQualityReviewDraft,
  renderListingQualityWorkbook,
  validateListingQualityReviewCsv,
  writeListingQualityReviewPacket,
} from "../lib/listing-quality.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { fromRoot } from "../lib/paths.mjs";

function needsFactReview(row) {
  return row.required_editor_fields.some((field) => ["price_eur", "bedrooms", "location", "description"].includes(field));
}

function needsMediaReview(row) {
  return row.required_editor_fields.some((field) =>
    ["media_review", "media_alt_text", "public_gallery", "tour_review"].includes(field),
  );
}

function completeListingQualityReviewCsv(report) {
  return [
    "listing_id,price_eur,bedrooms,location,description,facts_reviewer,media_reviewer,review_notes",
    ...report.rows.map((row) =>
      [
        row.listing_id,
        row.required_editor_fields.includes("price_eur") ? row.price_eur || 123000 : "",
        row.required_editor_fields.includes("bedrooms") ? row.bedrooms ?? 2 : "",
        row.required_editor_fields.includes("location") ? row.location || "Sandanski" : "",
        row.required_editor_fields.includes("description") ? "Reviewed listing description" : "",
        needsFactReview(row) ? "editor_bg" : "",
        needsMediaReview(row) ? "media_editor" : "",
        "Reviewed from source evidence",
      ].join(","),
    ),
    "",
  ].join("\n");
}

test("listing quality report exposes actionable source listing gaps", () => {
  const report = buildListingQualityReport({ seed: loadCmsSeed(), generatedAt: "2026-07-05T00:00:00Z" });

  assert.equal(assertListingQualityReport(report), true);
  assert.equal(report.summary.listings, 165);
  assert.ok(report.summary.affected_listings > 0);
  assert.equal(Object.hasOwn(report.summary.issue_counts, "missing_price"), true);
  assert.equal(Object.hasOwn(report.summary.issue_counts, "missing_bedrooms"), true);
  assert.equal(Object.hasOwn(report.summary.issue_counts, "media_review_pending"), true);
  assert.equal(Object.hasOwn(report.summary.issue_counts, "missing_alt_text"), true);
  assert.ok(report.summary.issue_counts.thin_public_gallery > 0);
  assert.ok(report.rows.every((row) => Number.isInteger(row.missing_alt_text_assets)));
  assert.ok(report.rows.every((row) => row.review_status));
  assert.ok(report.rows.every((row) => row.required_editor_fields.length > 0));
  assert.ok(report.rows.every((row) => row.editor_path.startsWith("/admin/listings/edit?listingId=")));
  assert.ok(report.rows.every((row) => Array.isArray(row.public_gallery_sample)));
  assert.ok(
    report.rows
      .filter((row) => row.required_editor_fields.includes("public_gallery"))
      .every((row) => row.public_gallery_sample.some((item) => item.includes("wp-content/uploads"))),
  );
});

test("listing quality treats explicit price-on-request as reviewed pricing", () => {
  const base = loadCmsSeed();
  const seed = {
    ...base,
    records: base.records.map((record) =>
      record.id === "MS-CRAWL-0001"
        ? { ...record, facts: { ...record.facts, price_eur: null, price_on_request: true } }
        : record,
    ),
  };
  const row = buildListingQualityReport({ seed, generatedAt: "2026-07-05T00:00:00Z" }).rows.find(
    (candidate) => candidate.listing_id === "MS-CRAWL-0001",
  );

  if (row) assert.equal(row.issues.includes("missing_price"), false);
});

test("listing quality treats reviewed bedroom-not-applicable as complete", () => {
  const base = loadCmsSeed();
  const seed = {
    ...base,
    records: base.records.map((record) =>
      record.id === "MS-CRAWL-0044"
        ? { ...record, facts: { ...record.facts, bedrooms: null, bedrooms_not_applicable: true } }
        : record,
    ),
  };
  const row = buildListingQualityReport({ seed, generatedAt: "2026-07-05T00:00:00Z" }).rows.find(
    (candidate) => candidate.listing_id === "MS-CRAWL-0044",
  );

  if (row) assert.equal(row.issues.includes("missing_bedrooms"), false);
});

test("listing quality does not require bedrooms for land and multi-unit listings", () => {
  const seed = loadCmsSeed();
  const report = buildListingQualityReport({ seed, generatedAt: "2026-07-05T00:00:00Z" });
  const landRow = report.rows.find((candidate) => candidate.listing_id === "MS-CRAWL-0158");
  const landListing = seed.records.find((candidate) => candidate.id === "MS-CRAWL-0158");
  const multiUnitRow = report.rows.find((candidate) => candidate.listing_id === "MS-CRAWL-0002");
  const multiUnitListing = seed.records.find((candidate) => candidate.id === "MS-CRAWL-0002");

  assert.equal(landListing.facts.property_type, "land");
  if (landRow) {
    assert.equal(landRow.issues.includes("missing_bedrooms"), false);
    assert.equal(landRow.required_editor_fields.includes("bedrooms"), false);
  }
  assert.equal(multiUnitListing.facts.property_type, "multi_unit");
  if (multiUnitRow) {
    assert.equal(multiUnitRow.issues.includes("missing_bedrooms"), false);
    assert.equal(multiUnitRow.required_editor_fields.includes("bedrooms"), false);
  }
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

  if (row) {
    assert.equal(row.issues.includes("tour_review_pending"), false);
    assert.equal(row.required_editor_fields.includes("tour_review"), false);
  }
});

test("listing quality only flags tours after a panorama is uploaded for review", () => {
  const seed = loadCmsSeed();
  const draftRow = buildListingQualityReport({ seed, generatedAt: "2026-07-05T00:00:00Z" }).rows.find(
    (candidate) => candidate.listing_id === "MS-CRAWL-0002",
  );

  if (draftRow) assert.equal(draftRow.issues.includes("tour_review_pending"), false);

  const uploadedSeed = {
    ...seed,
    records: seed.records.map((record) =>
      record.collection === "listings" && record.id === "MS-CRAWL-0002"
        ? { ...record, tour: { ...record.tour, panorama_url: "https://cdn.example.test/tours/MS-CRAWL-0002.jpg" } }
        : record,
    ),
  };
  const uploadedRow = buildListingQualityReport({ seed: uploadedSeed, tourApprovals: [], generatedAt: "2026-07-05T00:00:00Z" }).rows.find(
    (candidate) => candidate.listing_id === "MS-CRAWL-0002",
  );

  assert.ok(uploadedRow.issues.includes("tour_review_pending"));
  assert.ok(uploadedRow.required_editor_fields.includes("tour_review"));
});

test("listing quality workbook gives editors importable review rows without approvals", () => {
  const report = buildListingQualityReport({
    seed: applyListingEdits(loadCmsSeed(), readListingEdits()),
    generatedAt: "2026-07-05T00:00:00Z",
  });
  const rows = parseCsv(renderListingQualityWorkbook(report));
  const factRow = rows.find((row) => row.review_status.includes("facts"));
  const mediaRow = rows.find((row) => row.review_status.includes("media"));

  assert.equal(rows.length, report.rows.length);
  assert.equal(factRow, undefined);
  assert.ok(mediaRow);
  assert.match(mediaRow.issues, /thin_public_gallery/);
  assert.equal(mediaRow.review_status, "needs_media_review");
  assert.match(mediaRow.required_editor_fields, /public_gallery/);
  assert.match(mediaRow.public_gallery_sample, /wp-content\/uploads/);
  assert.match(mediaRow.public_gallery_sample, /alt:/);
  assert.equal(mediaRow.facts_reviewer, "");
  assert.equal(mediaRow.media_reviewer, "");
  assert.match(mediaRow.editor_path, /^\/admin\/listings\/edit\?listingId=/);
});

test("listing quality review packet is a complete draft but not launch evidence", () => {
  const report = buildListingQualityReport({
    seed: applyListingEdits(loadCmsSeed(), readListingEdits()),
    generatedAt: "2026-07-05T00:00:00Z",
  });
  const draft = renderListingQualityReviewDraft(report);
  const rows = parseCsv(draft);
  const packet = buildListingQualityReviewPacket({
    draftCsvPath: "production/data/listing-quality-review-draft.csv",
    generatedAt: "2026-07-06T00:00:00Z",
    report,
  });

  assert.equal(assertListingQualityReviewPacket(packet), true);
  assert.equal(packet.ready, false);
  assert.equal(packet.status, "draft_not_launch_evidence");
  assert.equal(packet.admin.draft_review_endpoint, "GET /api/admin/listing-quality-review-draft");
  assert.equal(packet.admin.review_packet_endpoint, "GET /api/admin/listing-quality-review-packet");
  assert.equal(rows.length, report.rows.length);
  assert.ok(rows.every((row) => row.media_reviewer === ""));
  assert.ok(rows.every((row) => row.facts_reviewer === ""));
  assert.ok(rows.every((row) => row.review_notes.includes("Review public gallery")));
  assert.ok(rows.every((row) => row.public_gallery_sample.includes("wp-content/uploads")));
  assert.equal(packet.paths.draft_review_csv === packet.paths.launch_review_csv, false);
  assert.throws(() => validateListingQualityReviewCsv(report, draft, { requireComplete: true }), /media_reviewer/);
});

test("listing quality review CSV preflight validates reviewer fixes without applying edits", () => {
  const base = loadCmsSeed();
  const seed = {
    ...base,
    records: base.records.map((record) =>
      record.id === "MS-CRAWL-0044"
        ? { ...record, facts: { ...record.facts, bedrooms: null, bedrooms_not_applicable: false } }
        : record,
    ),
  };
  const report = buildListingQualityReport({ seed, generatedAt: "2026-07-05T00:00:00Z" });
  const row = report.rows.find((candidate) => candidate.review_status.includes("facts"));
  assert.ok(row, "expected a listing quality row that still requires facts review");
  const csv = [
    "listing_id,price_eur,bedrooms,location,description,facts_reviewer,media_reviewer,review_notes",
    `${row.listing_id},123000,2,Sandanski,Reviewed listing description,editor_bg,media_editor,Reviewed from source evidence`,
  ].join("\n");

  const result = validateListingQualityReviewCsv(report, csv);

  assert.equal(result.summary.review_rows, 1);
  assert.equal(result.summary.expected_review_rows, report.rows.length);
  assert.equal(result.summary.missing_review_rows, report.rows.length - 1);
  assert.equal(result.summary.facts_review_rows, 1);
  const expectedMediaRows = row.issues.some((issue) => ["media_review_pending", "thin_public_gallery"].includes(issue)) ? 1 : 0;
  assert.equal(result.summary.media_review_rows, expectedMediaRows);
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
  assert.throws(() => validateListingQualityReviewCsv(report, csv, { requireComplete: true }), /incomplete/);
  assert.throws(() => validateListingQualityReviewCsv(report, `${csv}\n${csv.split("\n")[1]}\n`), /Duplicate/);
  const mediaReviewRow = report.rows.find((candidate) => candidate.review_status.includes("media"));
  assert.throws(
    () =>
      validateListingQualityReviewCsv(
        report,
        `listing_id,media_reviewer\n${mediaReviewRow.listing_id},todo\n`,
      ),
    /real media_reviewer/,
  );
  assert.throws(
    () =>
      validateListingQualityReviewCsv(
        report,
        [
          "listing_id,media_reviewer,review_notes",
          `${mediaReviewRow.listing_id},hermes_editor,Reviewed source gallery evidence`,
        ].join("\n"),
      ),
    /real media_reviewer/,
  );
  assert.throws(
    () =>
      validateListingQualityReviewCsv(
        report,
        [
          "listing_id,price_eur,bedrooms,location,description,facts_reviewer,media_reviewer,review_notes",
          `${row.listing_id},123000,2,Sandanski,Reviewed listing description,codex-reviewer,media_editor,Reviewed from source evidence`,
        ].join("\n"),
      ),
    /real facts_reviewer/,
  );
  assert.throws(
    () =>
      validateListingQualityReviewCsv(
        report,
        [
          "listing_id,price_eur,bedrooms,location,description,facts_reviewer,media_reviewer,review_notes",
          `${row.listing_id},123000,2,Sandanski,Reviewed listing description,editor_bg,media_editor,todo`,
        ].join("\n"),
      ),
    /real review_notes/,
  );
  assert.throws(
    () =>
      validateListingQualityReviewCsv(
        report,
        [
          "listing_id,price_eur,bedrooms,location,description,facts_reviewer,media_reviewer,review_notes",
          `${row.listing_id},123000,2,Sandanski,Reviewed listing description,editor_bg,media_editor,`,
        ].join("\n"),
      ),
    /requires review_notes/,
  );
  assert.throws(
    () =>
      validateListingQualityReviewCsv(
        report,
        [
          "listing_id,media_reviewer,review_notes",
          `${mediaReviewRow.listing_id},media_editor,Reviewed listing facts against CRM note`,
        ].join("\n"),
      ),
    /media review_notes/,
  );
  assert.throws(
    () =>
      validateListingQualityReviewCsv(
        report,
        [
          "listing_id,media_reviewer,review_notes",
          `${mediaReviewRow.listing_id},media_editor,Review public gallery: currently ${mediaReviewRow.public_gallery_assets} public asset(s).`,
        ].join("\n"),
      ),
    /draft instructions/,
  );
});

test("listing quality review CSV can ignore rows outside the current report for readiness", () => {
  const report = buildListingQualityReport({
    seed: applyListingEdits(loadCmsSeed(), readListingEdits()),
    generatedAt: "2026-07-05T00:00:00Z",
  });
  const currentReport = { ...report, rows: report.rows.slice(0, 1) };
  const reviewCsv = `${completeListingQualityReviewCsv(currentReport)}MS-CRAWL-9999,,,,,,media_editor,Previously reviewed row no longer pending\n`;

  assert.throws(() => validateListingQualityReviewCsv(currentReport, reviewCsv, { requireComplete: true }), /known listing_id/);

  const validation = validateListingQualityReviewCsv(currentReport, reviewCsv, {
    allowExtraRows: true,
    requireComplete: true,
  });

  assert.equal(validation.summary.expected_review_rows, 1);
  assert.equal(validation.summary.review_rows, 1);
  assert.equal(validation.summary.missing_review_rows, 0);
  assert.equal(validation.reviews[0].listing_id, currentReport.rows[0].listing_id);
});

test("listing quality review packet writer and CLI honor output overrides", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-review-pack-`);
  const packetPath = `${dir}/listing-quality-review-packet.json`;
  const draftCsvPath = `${dir}/listing-quality-review-draft.csv`;
  const report = buildListingQualityReport({
    seed: applyListingEdits(loadCmsSeed(), readListingEdits()),
    generatedAt: "2026-07-05T00:00:00Z",
  });
  const packet = buildListingQualityReviewPacket({ draftCsvPath, generatedAt: "2026-07-06T00:00:00Z", report });
  writeListingQualityReviewPacket(packet, { draftCsv: renderListingQualityReviewDraft(report), draftCsvPath, packetPath });

  assert.equal(fs.existsSync(packetPath), true);
  assert.equal(fs.existsSync(draftCsvPath), true);
  assert.equal(JSON.parse(fs.readFileSync(packetPath, "utf8")).status, "draft_not_launch_evidence");

  const cliPacketPath = `${dir}/cli-listing-quality-review-packet.json`;
  const cliDraftPath = `${dir}/cli-listing-quality-review-draft.csv`;
  const cli = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-listing-quality-review-packet.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      MS_REALTY_LISTING_QUALITY_REVIEW_DRAFT_PATH: cliDraftPath,
      MS_REALTY_LISTING_QUALITY_REVIEW_PACKET_PATH: cliPacketPath,
    },
  });

  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /Wrote listing quality review packet/);
  assert.match(cli.stdout, new RegExp(`Listing quality review rows required: ${report.rows.length}`));
  assert.match(cli.stdout, /Admin import endpoint: POST \/api\/admin\/listing-quality\/import/);
  assert.match(cli.stdout, /Next: complete the draft CSV with reviewer signoff/);
  assert.match(cli.stdout, /npm run listing:preflight/);
  assert.equal(fs.existsSync(cliPacketPath), true);
  assert.equal(fs.existsSync(cliDraftPath), true);
});

test("listing quality preflight CLI fails missing CSV and passes valid CSV", () => {
  const report = buildListingQualityReport({
    seed: applyListingEdits(loadCmsSeed(), readListingEdits()),
    generatedAt: "2026-07-05T00:00:00Z",
  });
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-quality-`);
  const csvPath = `${dir}/listing-quality.csv`;
  fs.writeFileSync(csvPath, completeListingQualityReviewCsv(report));

  const script = fromRoot("production", "scripts", "validate-listing-quality-review.mjs");
  const missing = spawnSync(process.execPath, [script, `${csvPath}.missing`], { encoding: "utf8" });
  const valid = spawnSync(process.execPath, [script, csvPath], { encoding: "utf8" });
  const validFromEnv = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, MS_REALTY_LISTING_QUALITY_REVIEW_PATH: csvPath },
  });

  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /LISTING QUALITY PREFLIGHT FAILED/);
  assert.match(missing.stderr, /Pending review sample:/);
  assert.match(missing.stderr, /MS-CRAWL-/);
  assert.match(missing.stderr, /\/admin\/listings\/edit\?listingId=/);
  assert.match(missing.stderr, /npm run listing:review-pack/);
  assert.match(missing.stderr, /draft review CSV/);
  assert.match(missing.stderr, /MS_REALTY_LISTING_QUALITY_REVIEW_PATH/);
  assert.match(missing.stderr, /npm run listing:preflight/);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, new RegExp(`Listing quality review CSV valid: ${report.rows.length} rows`));
  assert.match(valid.stdout, /Facts review rows: 0/);
  assert.match(valid.stdout, new RegExp(`Media review rows: ${report.rows.length}`));
  assert.equal(validFromEnv.status, 0, validFromEnv.stderr);
  assert.match(validFromEnv.stdout, new RegExp(`Listing quality review CSV valid: ${report.rows.length} rows`));
});

test("listing quality preflight report records missing and valid human review state", () => {
  const report = buildListingQualityReport({
    seed: applyListingEdits(loadCmsSeed(), readListingEdits()),
    generatedAt: "2026-07-06T00:00:00Z",
  });
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-quality-preflight-`);
  const missingPath = `${dir}/missing-listing-quality.csv`;
  const missingReport = buildListingQualityPreflightReport({
    report,
    reviewPath: missingPath,
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertListingQualityPreflightReport(missingReport), true);
  assert.equal(missingReport.ready, false);
  assert.equal(missingReport.review.status, "missing_review");
  assert.equal(missingReport.summary.missing_review_rows, report.rows.length);
  assert.equal(missingReport.review.pending_review_sample[0].listing_id, report.rows[0].listing_id);
  assert.equal(missingReport.review.pending_review_sample[0].editor_path, report.rows[0].editor_path);
  assert.ok(missingReport.review.pending_review_sample[0].required_editor_fields.length > 0);
  assert.throws(
    () =>
      assertListingQualityPreflightReport({
        ...missingReport,
        review: { ...missingReport.review, status: "operator_uploaded" },
      }),
    /known review status/,
  );

  const partialReport = buildListingQualityPreflightReport({
    report,
    reviewPath: `${dir}/partial-listing-quality.csv`,
    csvText: completeListingQualityReviewCsv({ ...report, rows: report.rows.slice(0, 1) }),
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertListingQualityPreflightReport(partialReport), true);
  assert.equal(partialReport.ready, false);
  assert.equal(partialReport.review.status, "invalid_review");
  assert.match(partialReport.review.error, /incomplete/);
  assert.equal(partialReport.review.pending_review_sample[0].listing_id, report.rows[1].listing_id);

  const reviewPath = `${dir}/listing-quality.csv`;
  const outputPath = `${dir}/listing-quality-preflight-report.json`;
  fs.writeFileSync(reviewPath, completeListingQualityReviewCsv(report));
  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-listing-quality-preflight-report.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_LISTING_QUALITY_REVIEW_PATH: reviewPath,
      MS_REALTY_LISTING_QUALITY_PREFLIGHT_REPORT_PATH: outputPath,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(outputPath));
  const readyReport = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(assertListingQualityPreflightReport(readyReport), true);
  assert.equal(readyReport.ready, true);
  assert.equal(readyReport.summary.review_rows, report.rows.length);
  assert.throws(
    () => assertListingQualityPreflightReport({ ...readyReport, review: { ...readyReport.review, path: "" } }),
    /non-example review path/,
  );
  assert.throws(
    () => assertListingQualityPreflightReport({ ...readyReport, review: { ...readyReport.review, path: `${reviewPath}.example` } }),
    /non-example review path/,
  );
  assert.throws(
    () => assertListingQualityPreflightReport({ ...readyReport, generated_at: "" }),
    /valid generated_at/,
  );
  assert.throws(
    () =>
      assertListingQualityPreflightReport({
        ...readyReport,
        summary: { ...readyReport.summary, facts_review_rows: readyReport.summary.facts_review_rows + 1 },
      }),
    /summary must match review summary/,
  );
  assert.throws(
    () =>
      assertListingQualityPreflightReport({
        ...readyReport,
        summary: { ...readyReport.summary, affected_listings: readyReport.summary.expected_review_rows - 1 },
      }),
    /cover affected listings/,
  );
  assert.throws(
    () =>
      assertListingQualityPreflightReport({
        ...readyReport,
        summary: { ...readyReport.summary, affected_listings: readyReport.summary.expected_review_rows + 1 },
      }),
    /cover every affected listing/,
  );
  assert.throws(
    () =>
      assertListingQualityPreflightReport({
        ...readyReport,
        review: {
          ...readyReport.review,
          summary: {
            ...readyReport.review.summary,
            expected_review_rows: readyReport.review.summary.expected_review_rows + 1,
            missing_review_rows: 1,
          },
        },
        summary: {
          ...readyReport.summary,
          affected_listings: readyReport.summary.affected_listings + 1,
          expected_review_rows: readyReport.summary.expected_review_rows + 1,
          missing_review_rows: 1,
        },
      }),
    /cover every review row/,
  );
  assert.throws(
    () =>
      assertListingQualityPreflightReport({
        ...readyReport,
        summary: { ...readyReport.summary, review_rows: "not-a-count" },
      }),
    /non-negative integers/,
  );
  assert.throws(
    () =>
      assertListingQualityPreflightReport({
        ...readyReport,
        review: {
          ...readyReport.review,
          summary: { ...readyReport.review.summary, missing_review_rows: 1 },
        },
        summary: { ...readyReport.summary, missing_review_rows: 1 },
      }),
    /reconcile expected, reviewed, and missing rows/,
  );
  assert.throws(
    () =>
      assertListingQualityPreflightReport({
        ...readyReport,
        review: {
          ...readyReport.review,
          summary: { ...readyReport.review.summary, media_review_rows: readyReport.summary.review_rows + 1 },
        },
        summary: { ...readyReport.summary, media_review_rows: readyReport.summary.review_rows + 1 },
      }),
    /cannot exceed reviewed rows/,
  );
  assert.throws(
    () =>
      assertListingQualityPreflightReport({
        ...readyReport,
        summary: { ...readyReport.summary, issue_counts: null },
      }),
    /issue counts/,
  );
});

test("listing quality build honors mounted ledgers and output paths", () => {
  const sourceReport = buildListingQualityReport({
    seed: applyListingEdits(loadCmsSeed(), readListingEdits()),
    generatedAt: "2026-07-05T00:00:00Z",
  });
  const row = sourceReport.rows.find((candidate) => candidate.review_status.includes("media"));
  assert.ok(row, "expected a listing quality row that still requires media review");
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-quality-build-`);
  const editPath = `${dir}/listing-edits.jsonl`;
  const tourPath = `${dir}/tour-approvals.jsonl`;
  const reportPath = `${dir}/listing-quality-report.json`;
  const workbookPath = `${dir}/listing-quality-workbook.csv`;
  fs.writeFileSync(
    editPath,
    `${JSON.stringify({ listing_id: row.listing_id, patch: { description: "Mounted quality description." } })}\n`,
  );
  fs.writeFileSync(tourPath, "");

  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-listing-quality-report.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_LISTING_EDIT_LEDGER_PATH: editPath,
      MS_REALTY_TOUR_APPROVAL_LEDGER_PATH: tourPath,
      MS_REALTY_LISTING_QUALITY_REPORT_PATH: reportPath,
      MS_REALTY_LISTING_QUALITY_WORKBOOK_PATH: workbookPath,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(reportPath));
  assert.ok(result.stdout.includes(workbookPath));
  const reportRow = JSON.parse(fs.readFileSync(reportPath, "utf8")).rows.find((candidate) => candidate.listing_id === row.listing_id);
  const workbookRow = parseCsv(fs.readFileSync(workbookPath, "utf8")).find((candidate) => candidate.listing_id === row.listing_id);
  assert.equal(reportRow.description, "Mounted quality description.");
  assert.equal(workbookRow.description, "Mounted quality description.");
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
  const report = JSON.parse(fs.readFileSync(fromRoot("production", "data", "listing-quality-report.json"), "utf8"));
  assert.equal(rows.length, report.rows.length);
  assert.ok(rows.every((row) => row.review_status));
  assert.ok(rows.every((row) => row.required_editor_fields));
  assert.ok(rows.every((row) => row.public_gallery_sample.includes("wp-content/uploads")));
  assert.ok(rows.every((row) => row.editor_path.startsWith("/admin/listings/edit?listingId=")));
});

test("listing quality review example names current pending rows without pre-approving them", () => {
  const exampleText = fs.readFileSync(fromRoot("migration", "reviews", "listing-quality.csv.example"), "utf8");
  const exampleRows = parseCsv(exampleText);
  const report = buildListingQualityReport({
    seed: applyListingEdits(loadCmsSeed(), readListingEdits()),
    generatedAt: "2026-07-06T00:00:00Z",
  });
  const pendingIds = new Set(report.rows.map((row) => row.listing_id));

  assert.equal(exampleRows.length, report.rows.length);
  assert.ok(exampleRows.every((row) => pendingIds.has(row.listing_id)));
  assert.ok(exampleRows.every((row) => row.media_reviewer === ""));
  assert.throws(() => validateListingQualityReviewCsv(report, exampleText), /requires media_reviewer/);
});
