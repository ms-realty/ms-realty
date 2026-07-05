import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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
});

test("generated listing verification report is valid when present", () => {
  const file = fromRoot("production", "data", "listing-verification-report.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertListingVerificationReport(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});
