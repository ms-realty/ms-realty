import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertLocaleRolloutReport, buildLocaleRolloutReport } from "../lib/locale-rollout.mjs";
import { addLocaleToRegistry, loadLocaleRegistry } from "../lib/locales.mjs";
import { buildTranslationCoverageReport } from "../lib/translation-coverage.mjs";
import { fromRoot } from "../lib/paths.mjs";

function oneListingSeed() {
  return {
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
        ],
      },
    ],
  };
}

test("locale rollout report opens activation tasks for requested disabled locales", () => {
  const registry = loadLocaleRegistry();
  const report = buildLocaleRolloutReport({
    registry,
    languageRequests: [
      {
        id: "language-request-fr-test",
        requested_locale: "fr",
        fallback_locale: "en",
      },
    ],
    translationCoverage: buildTranslationCoverageReport({ registry, seed: oneListingSeed(), translationTasks: [] }),
    generatedAt: "2026-07-05T00:00:00Z",
  });

  assert.equal(assertLocaleRolloutReport(report), true);
  assert.equal(report.summary.activation_tasks, 1);
  assert.equal(report.activation_tasks[0].locale, "fr");
  assert.equal(report.activation_tasks[0].public_indexable, false);
  assert.equal(report.activation_tasks[0].task.owner, "translator_fr");
});

test("locale rollout report opens activation tasks for requested unregistered locales", () => {
  const registry = loadLocaleRegistry();
  const report = buildLocaleRolloutReport({
    registry,
    languageRequests: [
      {
        id: "language-request-fr-ca-test",
        requested_locale: "fr-CA",
      },
    ],
    translationCoverage: buildTranslationCoverageReport({ registry, seed: oneListingSeed(), translationTasks: [] }),
    generatedAt: "2026-07-05T00:00:00Z",
  });

  assert.equal(assertLocaleRolloutReport(report), true);
  assert.equal(report.summary.activation_tasks, 1);
  assert.equal(report.activation_tasks[0].locale, "fr-CA");
  assert.equal(report.activation_tasks[0].fallback_locale, "bg");
  assert.equal(report.activation_tasks[0].task.owner, "translator_fr_ca");
});

test("admin-added public Hermes locales receive draft queues without publish rights", () => {
  const { registry } = addLocaleToRegistry(loadLocaleRegistry(), {
    code: "es",
    native_name: "Español",
    admin_name: "Spanish",
    public_enabled: true,
    indexable: true,
    fallback_locale: "en",
    route_segments: { listing: "propiedades", search: "buscar" },
  });
  const coverage = buildTranslationCoverageReport({ registry, seed: oneListingSeed(), translationTasks: [] });
  const report = buildLocaleRolloutReport({ registry, languageRequests: [], translationCoverage: coverage });
  const spanish = report.hermes_draft_queues.find((row) => row.locale === "es");

  assert.equal(spanish.open_task_count, 1);
  assert.equal(spanish.public_indexable, false);
  assert.equal(spanish.can_publish, false);
  assert.equal(spanish.requires_human_approval, true);
  assert.equal(spanish.task.owner, "translator_es");
});

test("completed Hermes drafts stay in human review instead of reopening the model queue", () => {
  const registry = loadLocaleRegistry();
  const seed = oneListingSeed();
  seed.records[0].translations.push({
    locale: "he",
    status: "human_edited",
    source_hash: "source-bg",
    human_approved: false,
    public_indexable: false,
  });
  const coverage = buildTranslationCoverageReport({ registry, seed, translationTasks: [] });
  const report = buildLocaleRolloutReport({ registry, languageRequests: [], translationCoverage: coverage });
  const hebrew = report.hermes_draft_queues.find((row) => row.locale === "he");

  assert.equal(hebrew.open_task_count, 0);
  assert.equal(hebrew.status, "clear");
  assert.equal(hebrew.task, null);
});

test("generated locale rollout report is valid when present", () => {
  const file = fromRoot("production", "data", "locale-rollout-report.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertLocaleRolloutReport(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});
