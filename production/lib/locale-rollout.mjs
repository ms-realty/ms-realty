import fs from "node:fs";
import path from "node:path";
import { loadLocaleRegistry, localesByCode, publicIndexableLocales } from "./locales.mjs";
import { readLanguageRequests } from "./language-requests.mjs";
import { buildTranslationCoverageReport } from "./translation-coverage.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LOCALE_ROLLOUT_REPORT = fromRoot("production", "data", "locale-rollout-report.json");

function requestsByLocale(requests) {
  const byLocale = new Map();
  for (const request of requests) {
    byLocale.set(request.requested_locale, [...(byLocale.get(request.requested_locale) || []), request]);
  }
  return byLocale;
}

function activationRows(registry, requests) {
  const byCode = localesByCode(registry);
  return [...requestsByLocale(requests).entries()]
    .map(([code, rows]) => {
      const locale = byCode.get(code);
      if (locale?.public_enabled && locale.indexable) return null;
      const fallbackLocale = rows[0]?.fallback_locale || locale?.fallback_locale || registry.source_locale;
      const owner = locale?.reviewer_role || `translator_${code.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`;
      return {
        locale: code,
        requested_count: rows.length,
        request_ids: rows.map((row) => row.id).sort(),
        fallback_locale: fallbackLocale,
        public_indexable: false,
        status: "needs_locale_approval",
        admin_path: `/admin/locales?locale=${encodeURIComponent(code)}`,
        task: {
          id: `activate-locale-${code}`,
          owner,
          status: "open",
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.locale.localeCompare(b.locale));
}

function draftQueueRows(registry, coverage) {
  return publicIndexableLocales(registry)
    .filter((locale) => locale.translation_provider_mode === "hermes_draft")
    .map((locale) => {
      const rows = coverage.rows.filter((row) => row.target_locale === locale.code);
      const openTasks = rows.filter((row) =>
        ["hermes_draft_required", "draft_review_required", "stale_review_required"].includes(row.task_type),
      ).length;
      return {
        locale: locale.code,
        reviewer_role: locale.reviewer_role,
        open_task_count: openTasks,
        status: openTasks ? "open" : "clear",
        public_indexable: false,
        requires_human_approval: true,
        can_publish: false,
        task: openTasks
          ? {
              id: `hermes-draft-queue-${locale.code}`,
              owner: locale.reviewer_role,
              status: "open",
            }
          : null,
      };
    });
}

export function buildLocaleRolloutReport({
  registry = loadLocaleRegistry(),
  languageRequests = readLanguageRequests(),
  translationCoverage = buildTranslationCoverageReport({ registry }),
  generatedAt = new Date().toISOString(),
} = {}) {
  const activations = activationRows(registry, languageRequests);
  const draftQueues = draftQueueRows(registry, translationCoverage);
  return {
    generated_at: generatedAt,
    summary: {
      requested_locales: new Set(languageRequests.map((request) => request.requested_locale)).size,
      activation_tasks: activations.length,
      hermes_queue_locales: draftQueues.length,
      open_hermes_tasks: draftQueues.reduce((sum, row) => sum + row.open_task_count, 0),
    },
    activation_tasks: activations,
    hermes_draft_queues: draftQueues,
  };
}

export function assertLocaleRolloutReport(report) {
  if (report.summary.activation_tasks !== report.activation_tasks.length) {
    throw new Error("Locale rollout activation summary must match rows");
  }
  if (report.summary.hermes_queue_locales !== report.hermes_draft_queues.length) {
    throw new Error("Locale rollout Hermes queue summary must match rows");
  }
  for (const row of report.activation_tasks) {
    if (row.public_indexable !== false || row.task?.status !== "open" || !row.admin_path.startsWith("/admin/locales?")) {
      throw new Error("Locale activation tasks must stay non-indexable and admin-reviewed");
    }
  }
  for (const row of report.hermes_draft_queues) {
    if (row.public_indexable !== false || row.requires_human_approval !== true || row.can_publish !== false) {
      throw new Error("Hermes draft queues must require human approval and stay non-publishing");
    }
    if (row.open_task_count > 0 && row.task?.status !== "open") {
      throw new Error("Open Hermes draft queues must expose an open task");
    }
  }
  return true;
}

export function writeLocaleRolloutReport(report, filePath = DEFAULT_LOCALE_ROLLOUT_REPORT) {
  assertLocaleRolloutReport(report);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}
