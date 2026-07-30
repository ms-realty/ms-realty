import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { assertListingVerificationReport, buildListingVerificationReport } from "../lib/listing-verification.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { fromRoot } from "../lib/paths.mjs";

test("listing verification report creates broker tasks from latest listing edits", () => {
  const report = buildListingVerificationReport({
    seed: loadCmsSeed(),
    edits: [
      {
        id: "old-edit",
        listing_id: "MS-CRAWL-0001",
        edited_at: "2026-07-04T00:00:00Z",
        source_locale: "bg",
        patch: { description: "Old" },
        source_hash_after: "old",
        stale_translation_count: 0,
        stale_locales: [],
      },
      {
        id: "latest-edit",
        listing_id: "MS-CRAWL-0001",
        edited_at: "2026-07-05T00:00:00Z",
        source_locale: "bg",
        patch: { price_eur: 123000 },
        source_hash_after: "new",
        stale_translation_count: 2,
        stale_locales: ["el", "he"],
      },
      {
        id: "ru-edit",
        listing_id: "MS-CRAWL-0116",
        edited_at: "2026-07-05T00:00:00Z",
        source_locale: "ru",
        patch: { location: "Sandanski" },
        source_hash_after: "ru",
        stale_translation_count: 0,
        stale_locales: [],
      },
    ],
    generatedAt: "2026-07-05T00:00:00Z",
  });

  assert.equal(assertListingVerificationReport(report), true);
  assert.equal(report.summary.edited_listings, 2);
  assert.equal(report.summary.high_priority, 1);
  assert.equal(report.summary.stale_translation_tasks, 1);
  assert.equal(report.rows.find((row) => row.listing_id === "MS-CRAWL-0001").latest_edit_id, "latest-edit");
  assert.equal(report.rows.find((row) => row.listing_id === "MS-CRAWL-0001").verification_task.owner, "broker_bg");
  assert.equal(report.rows.find((row) => row.listing_id === "MS-CRAWL-0116").verification_task.owner, "broker_ru");
  assert.equal(report.rows.find((row) => row.listing_id === "MS-CRAWL-0001").publication_readiness.ready, false);
  assert.ok(report.rows.find((row) => row.listing_id === "MS-CRAWL-0001").publication_readiness.blocking_fields.includes("location_id"));
});

test("later legacy description restorations retain the immediately preceding factual verification priority", () => {
  const report = buildListingVerificationReport({
    seed: loadCmsSeed(),
    edits: [
      {
        id: "price-edit",
        listing_id: "MS-CRAWL-0001",
        edited_at: "2026-07-04T00:00:00Z",
        source_locale: "bg",
        patch: { price_eur: 123000 },
        source_hash_after: "price-hash",
        stale_translation_count: 0,
        stale_locales: [],
      },
      {
        id: "description-edit",
        listing_id: "MS-CRAWL-0001",
        edited_at: "2026-07-05T00:00:00Z",
        source_locale: "bg",
        patch: { description: "Reviewed source description." },
        review_source: "legacy_wordpress_content_capture",
        source_hash_after: "description-hash",
        stale_translation_count: 0,
        stale_locales: [],
      },
    ],
    generatedAt: "2026-07-05T00:00:00Z",
  });
  const row = report.rows[0];

  assert.equal(row.latest_edit_id, "description-edit");
  assert.deepEqual(row.changed_fields, ["description"]);
  assert.equal(row.source_hash_after, "description-hash");
  assert.equal(row.priority, "high");
  assert.equal(row.verification_task.due_at, "2026-07-06T00:00:00.000Z");
});

test("listing verification build honors mounted edit ledger and output path", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-verification-`);
  const editPath = `${dir}/listing-edits.jsonl`;
  const reportPath = `${dir}/listing-verification-report.json`;
  fs.writeFileSync(
    editPath,
    `${JSON.stringify({
      id: "mounted-edit",
      listing_id: "MS-CRAWL-0001",
      edited_at: "2026-07-05T00:00:00Z",
      source_locale: "bg",
      patch: { listing_status: "reserved" },
      source_hash_after: "mounted-hash",
      stale_translation_count: 1,
      stale_locales: ["el"],
    })}\n`,
  );

  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-listing-verification-report.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_LISTING_EDIT_LEDGER_PATH: editPath,
      MS_REALTY_LISTING_VERIFICATION_REPORT_PATH: reportPath,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(reportPath));
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(assertListingVerificationReport(report), true);
  assert.equal(report.summary.edited_listings, 1);
  assert.equal(report.rows[0].latest_edit_id, "mounted-edit");
  assert.equal(report.rows[0].priority, "high");
});

test("generated listing verification report is valid when present", () => {
  const file = fromRoot("production", "data", "listing-verification-report.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertListingVerificationReport(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});
