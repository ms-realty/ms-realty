import { localesByCode } from "./locales.mjs";
import { buildTranslationCoverageReport } from "./translation-coverage.mjs";
import { readApprovedCmsContent } from "./approved-content.mjs";
import { readDraftGuideTranslations } from "./guide-translations.mjs";
import { readLanguageRequests } from "./language-requests.mjs";
import { loadCmsSeed } from "./runtime.mjs";
import { renderAdminWorkspace } from "./admin-workflows.mjs";

// Adding a language is not a switch. It commits the agency to a human
// translation of every published listing and every buyer guide before one page
// in that language may be indexed, and it commits them to keeping those
// translations current. Removing one is heavier still: the URLs are already in
// Google and Yandex, and dropping the locale without a terminal decision for
// each of them breaks the crawl parity the whole migration exists to preserve.
// The screen states both, because the registry endpoint enforces neither.
export const LOCALE_ROLLOUT_STATES = Object.freeze(["source", "live", "enabled_not_indexed", "requested", "off"]);

function rolloutState(locale, registry, requestedCount) {
  if (locale.code === registry.source_locale) return "source";
  if (locale.public_enabled && locale.indexable) return "live";
  if (locale.public_enabled) return "enabled_not_indexed";
  return requestedCount > 0 ? "requested" : "off";
}

function listingCoverageFor(code, coverage, listingTotal, sourceLocale) {
  if (code === sourceLocale) return { total: listingTotal, open: 0, missing: 0, stale: 0, done: listingTotal };
  const rows = coverage.rows.filter((row) => row.target_locale === code);
  const missing = rows.filter((row) => row.current_status === "missing").length;
  const stale = rows.filter((row) => row.current_status === "stale").length;
  // A locale the coverage report never scans (it only walks indexable public
  // locales) has no open work recorded, which is not the same as being done.
  const scanned = coverage.summary.public_locales.includes(code) || code === sourceLocale;
  return {
    total: listingTotal,
    open: rows.length,
    missing,
    stale,
    done: scanned ? Math.max(0, listingTotal - rows.length) : 0,
    scanned,
  };
}

function pageCoverageFor(code, { approvedByLocale, draftedByLocale, guideTotal }) {
  return {
    total: guideTotal,
    done: approvedByLocale.get(code) || 0,
    drafted: draftedByLocale.get(code) || 0,
  };
}

export function renderAdminLocaleRolloutPayload(
  registry,
  requestedLocale,
  {
    seed = loadCmsSeed(),
    translationTasks = [],
    languageRequests = readLanguageRequests(),
    approvedContent = readApprovedCmsContent(),
    draftGuideTranslations = readDraftGuideTranslations(),
    generatedAt = new Date().toISOString(),
    operatorId = null,
    focus = "",
  } = {},
) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  const coverage = buildTranslationCoverageReport({ registry, seed, translationTasks, generatedAt });
  const listingTotal = coverage.summary.listings;

  const approvedGuides = (approvedContent.documents || []).filter((document) => document.type === "guide");
  const guideKeys = new Set(approvedGuides.map((document) => document.guide_key).filter(Boolean));
  const guideTotal = guideKeys.size;
  const approvedByLocale = new Map();
  for (const document of approvedGuides) {
    approvedByLocale.set(document.locale, (approvedByLocale.get(document.locale) || 0) + 1);
  }
  const draftedByLocale = new Map();
  for (const row of draftGuideTranslations.translations || []) {
    if (row.human_approved === true) continue;
    draftedByLocale.set(row.locale, (draftedByLocale.get(row.locale) || 0) + 1);
  }

  const requestCounts = new Map();
  for (const request of languageRequests) {
    requestCounts.set(request.requested_locale, (requestCounts.get(request.requested_locale) || 0) + 1);
  }

  const adminLocales = new Set(registry.admin_locales || []);
  const requiredPublic = new Set(registry.required_public_locales || []);
  const rows = registry.locales.map((locale) => {
    const requestedCount = requestCounts.get(locale.code) || 0;
    const listings = listingCoverageFor(locale.code, coverage, listingTotal, registry.source_locale);
    const pages = pageCoverageFor(locale.code, { approvedByLocale, draftedByLocale, guideTotal });
    return {
      code: locale.code,
      native_name: locale.native_name,
      admin_name: locale.admin_name,
      direction: locale.direction,
      public_enabled: locale.public_enabled === true,
      indexable: locale.indexable === true,
      fallback_locale: locale.fallback_locale,
      translation_provider_mode: locale.translation_provider_mode,
      reviewer_role: locale.reviewer_role,
      is_source: locale.code === registry.source_locale,
      is_admin_locale: adminLocales.has(locale.code),
      is_required_public: requiredPublic.has(locale.code),
      requested_count: requestedCount,
      state: rolloutState(locale, registry, requestedCount),
      listings,
      pages,
      translation_path: `/admin/translations?targetLocale=${encodeURIComponent(locale.code)}`,
    };
  });

  const live = rows.filter((row) => row.state === "live" || row.state === "source");
  return {
    kind: "admin_locale_rollout",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/locales",
    canonical: "/admin/locales",
    indexable: false,
    metadata: {
      title: `${workspace.copy.localeRollout || "Languages"} | MS Realty`,
      description: workspace.copy.localeRolloutDescription || "Every website language, what it covers, and what adding or removing one commits the agency to.",
      robots: "noindex,nofollow",
    },
    workspace: { ...workspace, operator_id: operatorId || workspace.operator_id || null },
    generated_at: generatedAt,
    source_locale: registry.source_locale,
    focus: rows.some((row) => row.code === focus) ? focus : "",
    locales: rows,
    summary: {
      total: rows.length,
      live: live.length,
      requested: rows.filter((row) => row.state === "requested").length,
      off: rows.filter((row) => row.state === "off").length,
      listings: listingTotal,
      pages: guideTotal,
      open_listing_tasks: coverage.summary.open_translation_tasks,
    },
    // Neither of these is a control. The add endpoint refuses to create an
    // indexable locale, and nothing in the codebase removes one, because the
    // removal is a per-URL terminal decision rather than a registry edit.
    commitments: {
      add: {
        listings: listingTotal,
        pages: guideTotal,
        indexable_after: "human_translation_approved",
      },
      remove: {
        indexed_locales: live.filter((row) => !row.is_source).map((row) => row.code),
        requires: "terminal_decision_per_url",
      },
    },
  };
}
