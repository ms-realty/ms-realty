import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertTranslationCoverageReport, buildTranslationCoverageReport } from "../lib/translation-coverage.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { fromRoot } from "../lib/paths.mjs";

const registry = loadLocaleRegistry();

test("translation coverage report opens missing and stale review tasks without indexing drafts", () => {
  const seed = {
    records: [
      {
        id: "MS-TEST-1",
        collection: "listings",
        source_locale: "bg",
        translations: [
          {
            locale: "bg",
            status: "published",
            source_hash: "source-bg",
            human_approved: true,
            public_indexable: true,
          },
          {
            locale: "he",
            status: "approved",
            source_hash: "source-bg",
            human_approved: true,
            public_indexable: true,
          },
        ],
      },
    ],
  };
  const report = buildTranslationCoverageReport({
    registry,
    seed,
    translationTasks: [
      {
        id: "translation-listing-MS-TEST-1-he",
        object_type: "listing",
        object_id: "MS-TEST-1",
        target_locale: "he",
        status: "stale",
        source_hash: "source-bg",
        public_indexable: false,
      },
    ],
    generatedAt: "2026-07-05T00:00:00Z",
  });

  assert.equal(assertTranslationCoverageReport(report), true);
  assert.equal(report.summary.open_translation_tasks, 6);
  assert.equal(report.rows.find((row) => row.target_locale === "he").task_type, "stale_review_required");
  assert.equal(report.rows.find((row) => row.target_locale === "en").task_type, "human_translation_required");
  assert.equal(report.rows.find((row) => row.target_locale === "el").task_type, "hermes_draft_required");
  assert.equal(report.rows.every((row) => row.public_indexable === false), true);
});

test("generated translation coverage report is valid when present", () => {
  const file = fromRoot("production", "data", "translation-coverage-report.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertTranslationCoverageReport(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});
