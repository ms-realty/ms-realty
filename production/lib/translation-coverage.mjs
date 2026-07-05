import fs from "node:fs";
import path from "node:path";
import { loadLocaleRegistry, publicIndexableLocales } from "./locales.mjs";
import { loadCmsSeed } from "./runtime.mjs";
import { fromRoot } from "./paths.mjs";
import { latestTranslationTasks, readTranslationLedger } from "./translation-ledger.mjs";

export const DEFAULT_TRANSLATION_COVERAGE_REPORT = fromRoot("production", "data", "translation-coverage-report.json");

function listingRecords(seed) {
  return seed.records.filter((record) => record.collection === "listings");
}

function translationLocale(row) {
  return row.locale || row.target_locale;
}

function translationsByLocale(record, translationTasks) {
  const rows = [...(record.translations || [])];
  rows.push(
    ...translationTasks
      .filter((task) => task.object_type === "listing" && task.object_id === record.id)
      .map((task) => ({ ...task, locale: translationLocale(task) })),
  );
  return new Map(rows.map((row) => [translationLocale(row), row]));
}

function covered(row) {
  return ["approved", "published"].includes(row?.status) && row.human_approved === true && row.public_indexable === true;
}

function taskType(locale, row) {
  if (row?.status === "stale") return "stale_review_required";
  if (row?.status === "hermes_drafted" || row?.status === "human_edited") return "draft_review_required";
  if (locale.translation_provider_mode === "external_import") return "external_import_required";
  if (locale.translation_provider_mode === "human") return "human_translation_required";
  return "hermes_draft_required";
}

export function buildTranslationCoverageReport({
  registry = loadLocaleRegistry(),
  seed = loadCmsSeed(),
  translationTasks = readTranslationLedger(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const locales = publicIndexableLocales(registry);
  const latestTasks = latestTranslationTasks(translationTasks);
  const rows = [];

  for (const record of listingRecords(seed)) {
    const translations = translationsByLocale(record, latestTasks);
    const source = translations.get(record.source_locale);
    for (const locale of locales) {
      if (locale.code === record.source_locale) continue;
      const existing = translations.get(locale.code);
      if (covered(existing)) continue;
      const type = taskType(locale, existing);
      rows.push({
        listing_id: record.id,
        source_locale: record.source_locale,
        target_locale: locale.code,
        target_direction: locale.direction,
        current_status: existing?.status || "missing",
        task_type: type,
        provider_mode: locale.translation_provider_mode,
        reviewer_role: locale.reviewer_role,
        source_hash: existing?.source_hash || source?.source_hash || null,
        public_indexable: false,
        requires_human_approval: true,
        admin_path: `/admin/translations?objectType=listing&objectId=${encodeURIComponent(record.id)}&locale=${encodeURIComponent(locale.code)}`,
        task: {
          id: `translation-${record.id}-${locale.code}`,
          owner: locale.reviewer_role,
          status: "open",
        },
      });
    }
  }

  return {
    generated_at: generatedAt,
    summary: {
      listings: listingRecords(seed).length,
      public_locales: locales.map((locale) => locale.code),
      open_translation_tasks: rows.length,
      missing_translation_tasks: rows.filter((row) => row.current_status === "missing").length,
      stale_translation_tasks: rows.filter((row) => row.current_status === "stale").length,
      by_target_locale: rows.reduce((counts, row) => {
        counts[row.target_locale] = (counts[row.target_locale] || 0) + 1;
        return counts;
      }, {}),
      by_task_type: rows.reduce((counts, row) => {
        counts[row.task_type] = (counts[row.task_type] || 0) + 1;
        return counts;
      }, {}),
    },
    rows,
  };
}

export function assertTranslationCoverageReport(report) {
  if (!report.rows.length) throw new Error("Translation coverage report must contain open translation tasks");
  if (report.summary.open_translation_tasks !== report.rows.length) {
    throw new Error("Translation coverage summary must match rows");
  }
  if (report.rows.some((row) => row.source_locale === row.target_locale)) {
    throw new Error("Translation coverage tasks must not target the source locale");
  }
  for (const row of report.rows) {
    if (!row.listing_id || !row.target_locale || !row.reviewer_role || !row.admin_path.startsWith("/admin/translations?")) {
      throw new Error("Translation coverage rows must preserve review routing");
    }
    if (row.public_indexable !== false || row.requires_human_approval !== true) {
      throw new Error("Translation coverage tasks must not publish or index drafts");
    }
    if (row.task?.status !== "open" || row.task.owner !== row.reviewer_role) {
      throw new Error("Translation coverage rows must create open reviewer tasks");
    }
  }
  return true;
}

export function writeTranslationCoverageReport(report, filePath = DEFAULT_TRANSLATION_COVERAGE_REPORT) {
  assertTranslationCoverageReport(report);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}
