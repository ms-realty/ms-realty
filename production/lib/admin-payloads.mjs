import { renderAdminWorkspace } from "./admin-workflows.mjs";
import { publicAdminPrincipal } from "./admin-auth.mjs";
import { buildLeadSlaReport } from "./lead-sla.mjs";
import { buildTranslationCoverageReport } from "./translation-coverage.mjs";
import { latestTourForListing } from "./tours.mjs";
import { mediaAssetId } from "./media-reviews.mjs";
import { DEFAULT_BROKER_PROFILES } from "./leads.mjs";
import { buildLeadBriefs } from "./lead-briefs.mjs";
import { publicMediaLibrary } from "./media.mjs";
import { buildListingQualityReport } from "./listing-quality.mjs";
import { CANONICAL_PROPERTY_FAMILIES, propertyFamilyFor } from "./listing-facts.mjs";
import {
  buildListingAreaReview,
  buildListingDuplicateReview,
  buildListingFactReviewQueue,
  factReviewCopyFor,
  listingFactReviewFor,
} from "./listing-fact-review.mjs";
import {
  DEFAULT_BROKER_LEAD_GROUPS,
  WORKSPACE_DATE_FORMATS,
  WORKSPACE_SETTINGS_SECTIONS,
  WORKSPACE_TIMEZONES,
  workspaceSettingsView,
} from "./workspace-settings.mjs";
export { DURABLE_LISTING_EDIT_FIELDS as LISTING_EDIT_FIELDS } from "./listing-draft-service.mjs";
import { DURABLE_LISTING_EDIT_FIELDS as LISTING_EDIT_FIELDS } from "./listing-draft-service.mjs";

function listingRecord(seed, listingId) {
  return seed.records.find((record) => record.collection === "listings" && record.id === listingId);
}

function workspaceWithOperator(workspace, operator) {
  if (!operator) return workspace;
  if (typeof operator === "string") return { ...workspace, operator_id: operator };
  const principal = publicAdminPrincipal(operator);
  return principal
    ? {
        ...workspace,
        operator_id: principal.id,
        operator_roles: principal.roles,
        operator_capabilities: principal.capabilities,
      }
    : workspace;
}

export function renderAdminListingEditorPayload(
  registry,
  requestedLocale,
  seed,
  listingId,
  edits,
  translationTasks,
  tourApprovals = [],
  operator = null,
) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  const record = listingRecord(seed, listingId || "MS-CRAWL-0001");
  if (!record) throw new Error("Known listingId is required");
  const property = (seed.properties || []).find((candidate) => candidate.id === record.property) || null;
  const factReview = listingFactReviewFor({ listing: record, property });
  const reviewedTour = latestTourForListing(tourApprovals, record.id);
  const listing = {
    ...record,
    media: (record.media || []).map((item) => ({ ...item, asset_id: mediaAssetId(item) })),
    ...(reviewedTour ? { tour: reviewedTour } : {}),
  };
  const qualityReview = buildListingQualityReport({ seed, tourApprovals }).rows.find(
    (row) => row.listing_id === record.id,
  ) || null;
  return {
    kind: "admin_listing_editor",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/listings/edit",
    canonical: "/admin/listings/edit",
    indexable: false,
    metadata: {
      title: "MS Realty property editor",
      description: "Admin-only listing fact editor with stale translation review state.",
      robots: "noindex,nofollow",
    },
    workspace: workspaceWithOperator(workspace, operator),
    listing,
    factReview: { ...factReview, copy: factReviewCopyFor(requestedLocale) },
    qualityReview,
    edits: edits.filter((edit) => edit.listing_id === record.id),
    translationTasks: translationTasks.filter((task) => task.object_type === "listing" && task.object_id === record.id),
    editableFields: LISTING_EDIT_FIELDS,
  };
}

export function renderAdminOperationsReportPayload(registry, requestedLocale, report, operator = null) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  return {
    kind: "admin_operations_reports",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/reports",
    canonical: "/admin/reports",
    indexable: false,
    metadata: {
      title: `${workspace.copy.operationsReports || "Operations reports"} | MS Realty`,
      description:
        workspace.copy.operationsReportsDescription ||
        "Lead volume, actual customer response time, source quality, pipelines, and stale work from the operating ledgers.",
      robots: "noindex,nofollow",
    },
    workspace: workspaceWithOperator(workspace, operator),
    report,
  };
}

// Approved content review (read-only). The review body itself comes from
// approved-content-review.mjs, which package B2 owns; this only wraps it in the
// workbench envelope so the CMS screen can render inside the shell.
export function renderAdminApprovedContentPayload(registry, requestedLocale, review, operator = null, state = "") {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  // The filter narrows the rows on show, never the counts: an approver has to
  // keep seeing how much of each surface is still withheld while looking at a
  // single state.
  const normalizedState = ["ready", "withheld"].includes(state) ? state : "";
  const filtered = normalizedState
    ? {
        ...review,
        sections: (review.sections || []).map((section) => ({
          ...section,
          rows: (section.rows || []).filter((row) => (normalizedState === "ready" ? row.publishable : !row.publishable)),
        })),
      }
    : review;
  return {
    kind: "admin_approved_content_review",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/approved-content",
    canonical: "/admin/approved-content",
    indexable: false,
    metadata: {
      title: `${workspace.copy.approvedContent || "Approved content"} | MS Realty`,
      description:
        workspace.copy.approvedContentDescription ||
        "Which approved-content records the public site may publish, which are withheld, and why.",
      robots: "noindex,nofollow",
    },
    workspace: workspaceWithOperator(workspace, operator),
    filters: { state: normalizedState },
    approvedContent: filtered,
  };
}

export function renderAdminRealtyCasesPayload(registry, requestedLocale, realtyCaseQueue, operator = null) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  return {
    kind: "admin_realty_cases",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/cases",
    canonical: "/admin/cases",
    indexable: false,
    metadata: {
      title: `${workspace.copy.realtyCasesWorkspace || "Transaction cases"} | MS Realty`,
      description: workspace.copy.realtyCasesDescription ||
        "Manual and autonomous purchase, sale, rental, short-stay, and property-management cases on one evidence-gated workflow.",
      robots: "noindex,nofollow",
    },
    workspace: workspaceWithOperator(workspace, operator),
    realtyCaseQueue,
  };
}

export function renderAdminOperationalQueuePayload(payload, { kind, path, titleKey, descriptionKey }) {
  const copy = payload.workspace.copy;
  return {
    ...payload,
    kind,
    path,
    canonical: path,
    metadata: {
      title: `${copy[titleKey]} | MS Realty`,
      description: copy[descriptionKey],
      robots: "noindex,nofollow",
    },
  };
}

export function renderAdminRuntimeUnavailablePayload(
  registry,
  requestedLocale,
  unavailable,
  operator = null,
) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  const requestedPath = String(unavailable?.path || "/admin");
  return {
    kind: "admin_runtime_unavailable",
    status: 503,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: requestedPath,
    canonical: requestedPath,
    indexable: false,
    metadata: {
      title: "Data connection required | MS Realty",
      description: "Authenticated owner recovery page for an unavailable durable data source.",
      robots: "noindex,nofollow",
    },
    workspace: workspaceWithOperator(workspace, operator),
    unavailable: {
      kind: "runtime_data_unavailable",
      path: requestedPath,
    },
  };
}

export function renderAdminHermesPayload(
  registry,
  requestedLocale,
  {
    availability,
    command_availability = null,
    bridge,
    generatedAt,
    operator = null,
    queue,
    runtime,
    runtimeDataMode = "file_backed",
    tools = [],
    command_form = null,
    command_result = null,
    command_error = null,
    receipt_store = null,
    receipts = [],
  } = {},
) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  return {
    kind: "admin_hermes",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/hermes",
    canonical: "/admin/hermes",
    indexable: false,
    metadata: {
      title: "Hermes | MS Realty",
      description: "Authenticated Hermes runtime, task queue, desktop bridge, and safety controls.",
      robots: "noindex,nofollow",
    },
    workspace: workspaceWithOperator(workspace, operator),
    generated_at: generatedAt,
    runtime_data_mode: runtimeDataMode,
    runtime,
    availability,
    command_availability,
    bridge,
    queue,
    tools,
    command_form,
    command_result,
    command_error,
    receipt_store,
    receipts,
  };
}

const WORKSPACE_SETTINGS_METADATA = {
  bg: { title: "Настройки", description: "Профил на агенцията, срокове за отговор, известия, работно пространство и публичен сайт." },
  ru: { title: "Настройки", description: "Профиль агентства, сроки ответа, уведомления, рабочее пространство и публичный сайт." },
  en: { title: "Settings", description: "Agency profile, lead reply targets, notifications, workspace and public site defaults." },
};

function settingsFormEcho(values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return {};
  const echo = {};
  for (const [key, value] of Object.entries(values)) {
    if (["actor", "locale", "section"].includes(key)) continue;
    if (Array.isArray(value)) echo[key] = value.map((entry) => String(entry).slice(0, 500)).slice(0, 20);
    else if (value && typeof value === "object") echo[key] = settingsFormEcho(value);
    else echo[key] = String(value ?? "").slice(0, 500);
  }
  return echo;
}

function adminBrokerProfile(profile, locale) {
  const language = profile.languages?.includes("bg") ? "bg" : profile.languages?.includes("ru") ? "ru" : "international";
  const deskLabels = {
    bg: { bg: "Екип на български", ru: "Екип на руски", international: "Международен екип" },
    ru: { bg: "Болгароязычная команда", ru: "Русскоязычная команда", international: "Международная команда" },
    en: { bg: "Bulgarian desk", ru: "Russian desk", international: "International desk" },
  };
  return {
    id: profile.id,
    label: profile.labels?.[locale] || profile.display_name || profile.name || deskLabels[locale]?.[language] || profile.id,
    languages: profile.languages || [],
  };
}

export function renderAdminWorkspaceSettingsPayload(
  registry,
  requestedLocale,
  {
    settings,
    operator = null,
    brokerProfiles = DEFAULT_BROKER_PROFILES,
    adminLocales: locales = ["bg", "ru", "en"],
    saved = null,
    form = null,
    writable = true,
    onboarding = null,
    // B6 workspace security and data. Null when the workspace-security ledgers
    // are not configured, which is what keeps the Security and Data sections in
    // their "not connected" treatment instead of pretending to work.
    security = null,
  } = {},
) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  const metadata = WORKSPACE_SETTINGS_METADATA[workspace.locale] || WORKSPACE_SETTINGS_METADATA.en;
  return {
    kind: "admin_workspace_settings",
    status: form?.error ? 400 : 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/settings",
    canonical: "/admin/settings",
    indexable: false,
    metadata: { title: `${metadata.title} | MS Realty`, description: metadata.description, robots: "noindex,nofollow" },
    workspace: workspaceWithOperator(workspace, operator),
    workspace_settings: workspaceSettingsView(settings),
    settings_writable: writable !== false,
    brokerProfiles: brokerProfiles.map((profile) => adminBrokerProfile(profile, workspace.locale)),
    settingsOptions: {
      admin_locales: [...locales],
      timezones: [...WORKSPACE_TIMEZONES],
      date_formats: [...WORKSPACE_DATE_FORMATS],
      broker_groups: Object.keys(DEFAULT_BROKER_LEAD_GROUPS),
    },
    settingsForm: form
      ? {
          section: WORKSPACE_SETTINGS_SECTIONS.includes(form.section) ? form.section : null,
          error: form.error ? String(form.error) : null,
          field: form.field ? String(form.field) : null,
          values: settingsFormEcho(form.values),
        }
      : null,
    savedSection: WORKSPACE_SETTINGS_SECTIONS.includes(saved) ? saved : null,
    onboarding: onboarding || null,
    workspace_security: security || null,
  };
}

function normalizedActivityFilter(value, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function auditEntityValue(row, type) {
  const metadata = row.metadata || {};
  if (type === "lead") {
    return [metadata.lead_id, row.object_type === "lead" ? row.object_id : null].filter(Boolean);
  }
  return [
    metadata.listing_id,
    metadata.listing_reference,
    row.object_type === "listing" ? row.object_id : null,
  ].filter(Boolean);
}

export function renderAdminActivityPayload(registry, requestedLocale, auditLog, operator = null, requestedFilters = {}) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  const filters = {
    leadId: normalizedActivityFilter(requestedFilters.leadId || requestedFilters.lead_id),
    listingId: normalizedActivityFilter(requestedFilters.listingId || requestedFilters.listing_id),
    actor: normalizedActivityFilter(requestedFilters.actor, 80),
    action: normalizedActivityFilter(requestedFilters.action, 80),
  };
  const filteredRows = [...auditLog]
    .toReversed()
    .filter((row) => !filters.leadId || auditEntityValue(row, "lead").includes(filters.leadId))
    .filter((row) => !filters.listingId || auditEntityValue(row, "listing").includes(filters.listingId))
    .filter((row) => !filters.actor || row.actor === filters.actor)
    .filter((row) => !filters.action || row.action === filters.action);
  const paged = pagedRows(filteredRows, requestedFilters.page, 50);
  return {
    kind: "admin_activity",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/activity",
    canonical: "/admin/activity",
    indexable: false,
    metadata: {
      title: `${workspace.copy.activity} | MS Realty`,
      description: workspace.copy.activityDescription,
      robots: "noindex,nofollow",
    },
    workspace: workspaceWithOperator(workspace, operator),
    auditLog: paged.rows,
    filters,
    pagination: paged.pagination,
    summary: {
      totalActions: filteredRows.length,
      totalAvailable: auditLog.length,
      activeOperators: new Set(filteredRows.map((row) => row.actor)).size,
      objectTypes: new Set(filteredRows.map((row) => row.object_type)).size,
    },
  };
}

function positivePage(value) {
  const parsed = Number.parseInt(String(value || "1"), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function pagedRows(rows, requestedPage, pageSize = 12) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(positivePage(requestedPage), totalPages);
  const offset = (page - 1) * pageSize;
  return {
    rows: rows.slice(offset, offset + pageSize),
    pagination: { page, pageSize, totalRows: rows.length, totalPages },
  };
}

export function renderAdminListingManagerPayload(
  registry,
  requestedLocale,
  {
    seed,
    translationTasks = [],
    query = "",
    status = "",
    sourceLocale = "",
    propertyFamily = "",
    page = 1,
    generatedAt = new Date().toISOString(),
    operatorId = null,
    factRow = "",
    factQuery = "",
    publicationScheduleQueue = {
      rows: [],
      open: [],
      summary: { total: 0, scheduled: 0, due: 0, upcoming: 0, executed: 0, cancelled: 0 },
    },
  },
) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  const factReview = buildListingFactReviewQueue(seed, { row: factRow, query: factQuery });
  const duplicateReview = buildListingDuplicateReview(seed);
  const areaReview = buildListingAreaReview(seed);
  const translationCoverage = buildTranslationCoverageReport({ registry, seed, translationTasks, generatedAt });
  const translationReviewByListing = translationCoverage.rows.reduce((counts, row) => {
    counts.set(row.listing_id, (counts.get(row.listing_id) || 0) + 1);
    return counts;
  }, new Map());
  const normalizedQuery = String(query).trim().toLocaleLowerCase();
  const normalizedStatus = String(status).trim();
  const normalizedSourceLocale = String(sourceLocale).trim();
  const normalizedFamily = String(propertyFamily).trim();
  const propertiesById = new Map((seed.properties || []).map((property) => [property.id, property]));
  const allRows = seed.records
    .filter((record) => record.collection === "listings")
    .map((record) => {
      const facts = record.facts || {};
      const property = propertiesById.get(record.property);
      const translations = [
        ...(record.translations || []),
        ...translationTasks.filter((task) => task.object_type === "listing" && task.object_id === record.id),
      ];
      const latestByLocale = new Map(translations.map((row) => [row.locale || row.target_locale, row]));
      const metadataGaps = Object.values(record.migration?.metadata_gaps || {}).filter(Boolean).length;
      return {
        id: record.id,
        title: facts.title || record.seo?.title || record.id,
        location: facts.location || "",
        property_family: propertyFamilyFor({
          ...facts,
          property_family: property?.property_family || facts.property_family,
          property_subtype: property?.property_subtype || facts.property_subtype,
        }) || "",
        source_locale: record.source_locale,
        source_domain: record.source_domain,
        listing_status: facts.listing_status || "unverified",
        cms_status: record.cms_status || "source_imported_review_required",
        price_eur: facts.price_eur ?? null,
        price_on_request: facts.price_on_request === true,
        public_gallery_assets: publicMediaLibrary(record.media || []).gallery_count,
        metadata_gaps: metadataGaps,
        translation_locales: [...latestByLocale.keys()].filter(Boolean).sort(),
        translation_review_required: translationReviewByListing.get(record.id) || 0,
        review_required: record.routing?.review_required === true || metadataGaps > 0,
        editor_path: `/admin/listings/edit?listingId=${encodeURIComponent(record.id)}`,
      };
    });
  const filtered = allRows.filter((row) => {
    if (normalizedStatus && row.listing_status !== normalizedStatus && row.cms_status !== normalizedStatus) return false;
    if (normalizedSourceLocale && row.source_locale !== normalizedSourceLocale) return false;
    if (normalizedFamily && row.property_family !== normalizedFamily) return false;
    if (!normalizedQuery) return true;
    return [row.id, row.title, row.location, row.source_domain].some((value) =>
      String(value || "").toLocaleLowerCase().includes(normalizedQuery),
    );
  });
  const paged = pagedRows(filtered, page);
  const listingTitleById = new Map(allRows.map((row) => [row.id, row.title]));
  const publicationSchedules = {
    ...publicationScheduleQueue,
    rows: publicationScheduleQueue.rows.map((row) => ({ ...row, listing_title: listingTitleById.get(row.listing_id) || row.listing_id })),
    open: publicationScheduleQueue.open.map((row) => ({ ...row, listing_title: listingTitleById.get(row.listing_id) || row.listing_id })),
  };
  return {
    kind: "admin_listing_manager",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/listings",
    canonical: "/admin/listings",
    indexable: false,
    metadata: {
      title: `${workspace.copy.listingManager} | MS Realty`,
      description: workspace.copy.listingManagerDescription || "Search, review, and open every listing in the CMS workspace.",
      robots: "noindex,nofollow",
    },
    workspace: workspaceWithOperator(workspace, operatorId),
    listings: paged.rows,
    filters: { q: normalizedQuery, status: normalizedStatus, sourceLocale: normalizedSourceLocale, propertyFamily: normalizedFamily },
    filterOptions: {
      statuses: [...new Set(allRows.flatMap((row) => [row.listing_status, row.cms_status]))].filter(Boolean).sort(),
      sourceLocales: [...new Set(allRows.map((row) => row.source_locale))].filter(Boolean).sort(),
      propertyFamilies: [...CANONICAL_PROPERTY_FAMILIES],
    },
    pagination: paged.pagination,
    publicationSchedules,
    factReview: { ...factReview, copy: factReviewCopyFor(requestedLocale) },
    duplicateReview: { ...duplicateReview, copy: factReviewCopyFor(requestedLocale) },
    areaReview: { ...areaReview, copy: factReviewCopyFor(requestedLocale) },
    summary: {
      total: allRows.length,
      visible: filtered.length,
      reviewRequired: allRows.filter((row) => row.review_required).length,
      priceOnRequest: allRows.filter((row) => row.price_on_request).length,
      translationReviewRequired: allRows.filter((row) => row.translation_review_required > 0).length,
    },
  };
}

export function renderAdminTranslationQueuePayload(
  registry,
  requestedLocale,
  {
    seed,
    translationTasks = [],
    query = "",
    targetLocale = "",
    taskType = "",
    page = 1,
    generatedAt = new Date().toISOString(),
    operatorId = null,
  },
) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  const coverage = buildTranslationCoverageReport({ registry, seed, translationTasks, generatedAt });
  const listings = new Map(seed.records.filter((record) => record.collection === "listings").map((record) => [record.id, record]));
  const taskByObjectLocale = new Map(
    translationTasks.map((task) => [`${task.object_id}:${task.target_locale || task.locale}`, task]),
  );
  const normalizedQuery = String(query).trim().toLocaleLowerCase();
  const normalizedTargetLocale = String(targetLocale).trim();
  const normalizedTaskType = String(taskType).trim();
  const enrichRow = (row) => {
    const record = listings.get(row.listing_id);
    const task = taskByObjectLocale.get(`${row.listing_id}:${row.target_locale}`);
    return {
      ...row,
      listing_title: record?.facts?.title || record?.seo?.title || row.listing_id,
      listing_location: record?.facts?.location || "",
      source_title: record?.facts?.title || record?.seo?.title || row.listing_id,
      source_description: record?.facts?.description || record?.seo?.description || "",
      property_facts: {
        id: row.listing_id,
        ...(record?.facts?.location ? { location: record.facts.location } : {}),
        ...(record?.facts?.price_eur ? { price: `${record.facts.price_eur} EUR` } : {}),
      },
      existing_task: task
        ? {
            id: task.id,
            status: task.status,
            reviewer_role: task.reviewer_role,
            human_approved: task.human_approved === true,
            public_indexable: task.public_indexable === true,
            validated_output: Boolean(task.hermes?.output || task.human?.output),
          }
        : null,
      editor_path: `/admin/listings/edit?listingId=${encodeURIComponent(row.listing_id)}#listing-translations`,
    };
  };
  const coverageKeys = new Set(coverage.rows.map((row) => `${row.listing_id}:${row.target_locale}`));
  const approvedRows = translationTasks
    .filter(
      (task) =>
        task.object_type === "listing" &&
        task.status === "approved" &&
        task.human_approved === true &&
        !coverageKeys.has(`${task.object_id}:${task.target_locale}`),
    )
    .map((task) => ({
      listing_id: task.object_id,
      source_locale: task.source_locale,
      target_locale: task.target_locale,
      target_direction: task.target_direction,
      current_status: "approved",
      task_type: "publish_required",
      provider_mode: task.provider_mode,
      reviewer_role: task.reviewer_role,
      source_hash: task.source_hash,
      public_indexable: false,
      requires_human_approval: true,
      task: { id: task.id, owner: task.reviewer_role, status: "open" },
    }));
  const allRows = [...coverage.rows, ...approvedRows].map(enrichRow);
  const filtered = allRows.filter((row) => {
    if (normalizedTargetLocale && row.target_locale !== normalizedTargetLocale) return false;
    if (normalizedTaskType && row.task_type !== normalizedTaskType && row.current_status !== normalizedTaskType) return false;
    if (!normalizedQuery) return true;
    return [row.listing_id, row.listing_title, row.listing_location].some((value) =>
      String(value || "").toLocaleLowerCase().includes(normalizedQuery),
    );
  });
  const paged = pagedRows(filtered, page);
  return {
    kind: "admin_translation_queue",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/translations",
    canonical: "/admin/translations",
    indexable: false,
    metadata: {
      title: `${workspace.copy.translationQueue} | MS Realty`,
      description: workspace.copy.translationQueueDescription || "Human review queue for missing, drafted, and stale listing translations.",
      robots: "noindex,nofollow",
    },
    workspace: workspaceWithOperator(workspace, operatorId),
    translationTasks: paged.rows,
    filters: { q: normalizedQuery, targetLocale: normalizedTargetLocale, taskType: normalizedTaskType },
    filterOptions: {
      targetLocales: [...new Set(allRows.map((row) => row.target_locale))].filter(Boolean).sort(),
      taskTypes: [...new Set(allRows.map((row) => row.task_type))].filter(Boolean).sort(),
    },
    pagination: paged.pagination,
    summary: {
      ...coverage.summary,
      open_translation_tasks: allRows.length,
      approved_waiting_publish: approvedRows.length,
    },
  };
}

export function renderAdminLeadsPayload(registry, requestedLocale, data) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  const dataAvailable = (key) => data.dataAvailability?.[key]?.status !== "unavailable";
  const availableCount = (key, value) => (dataAvailable(key) ? value : null);
  const publicRequestsAvailable = dataAvailable("savedSearches") && dataAvailable("languageRequests");
  const {
    leadSla: providedLeadSla,
    leadSlaGeneratedAt,
    leadSnoozes = [],
    operatorId,
    leadPipelineQueue: providedLeadPipelineQueue,
    replyDeliveryQueue: providedReplyDeliveryQueue,
    viewingFollowUpQueue: providedViewingFollowUpQueue,
    sellerPipelineQueue: providedSellerPipelineQueue,
    publicRequestQueue: providedPublicRequestQueue,
    ...payloadData
  } = data;
  const leadSla =
    providedLeadSla ||
    buildLeadSlaReport({
      leads: data.leads,
      replies: data.replies,
      replyDeliveryStates: providedReplyDeliveryQueue?.states || [],
      // A snooze DEFERS both clocks; it never restarts them.
      snoozes: leadSnoozes,
      generatedAt: leadSlaGeneratedAt,
    });
  const replyDeliveryQueue =
    providedReplyDeliveryQueue ||
    {
      rows: [],
      states: [],
      summary: { total: data.replies.length, queued: data.replies.length, failed: 0, sent: 0 },
    };
  const leadPipelineQueue =
    providedLeadPipelineQueue ||
    {
      rows: [],
      states: [],
      summary: { total: 0, open: 0, overdue: 0, buyers_open: 0, renters_open: 0, lost: 0, closed: 0, qualified: 0 },
    };
  const viewingFollowUpQueue =
    providedViewingFollowUpQueue ||
    {
      rows: [],
      summary: { total_viewings: data.viewings.length, open: 0, overdue: 0, booked: 0, completed: 0, rescheduled: 0, no_show: 0 },
    };
  const sellerPipelineQueue =
    providedSellerPipelineQueue ||
    {
      rows: [],
      states: [],
      summary: { total: data.sellerPipeline.length, open: 0, overdue: 0, completed: 0, closed_lost: 0 },
    };
  const publicRequestQueue =
    providedPublicRequestQueue ||
    {
      rows: [],
      states: [],
      contact_vault_status: "not_configured",
      summary: {
        total: (data.savedSearches?.length || 0) + (data.languageRequests?.length || 0),
        open: 0,
        overdue: 0,
        contacted: 0,
        completed: 0,
        closed: 0,
        saved_search_open: 0,
        language_request_open: 0,
        contacts_available: 0,
      },
    };
  const leadBriefs =
    data.leadBriefs ||
    buildLeadBriefs({
      leads: data.leads,
      leadSla,
      leadMatching: data.leadMatching,
      leadPipelineQueue,
      replyDeliveryQueue,
      communicationThreads: data.communicationThreads,
    });
  const secondaryQueuesProvided = Boolean(providedViewingFollowUpQueue || providedSellerPipelineQueue);
  return {
    kind: "admin_lead_inbox",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/leads",
    canonical: "/admin/leads",
    indexable: false,
    metadata: {
      title: `${workspace.copy.leadInbox || "Lead inbox"} | MS Realty`,
      description: workspace.copy.leadInboxDescription || "CRM lead inbox with broker-reviewed replies.",
      robots: "noindex,nofollow",
    },
    workspace: workspaceWithOperator(workspace, operatorId),
    brokerProfiles: (data.brokerProfiles || DEFAULT_BROKER_PROFILES).map((profile) => adminBrokerProfile(profile, workspace.locale)),
    ...payloadData,
    leadSla,
    leadPipelineQueue,
    replyDeliveryQueue,
    viewingFollowUpQueue,
    sellerPipelineQueue,
    secondaryQueuesProvided,
    publicRequestQueue,
    leadBriefs,
    summary: {
      leads: data.leads.length,
      replies: availableCount("replies", data.replies.length),
      repliesQueued: availableCount("replies", replyDeliveryQueue.summary.queued),
      repliesFailed: availableCount("replies", replyDeliveryQueue.summary.failed),
      repliesSent: availableCount("replies", replyDeliveryQueue.summary.sent),
      communicationThreads: availableCount("communicationThreads", data.communicationThreads?.length || 0),
      buyerPipelineOpen: leadPipelineQueue.summary.buyers_open,
      renterPipelineOpen: leadPipelineQueue.summary.renters_open,
      leadPipelineOverdue: leadPipelineQueue.summary.overdue,
      leadPipelineQualified: leadPipelineQueue.summary.qualified,
      leadsWithInventoryMatches: data.leadMatching?.summary?.leads_with_matches || 0,
      inventoryMatchTasks: data.leadMatching?.summary?.open_broker_tasks || 0,
      criticalLeadActions: leadBriefs.summary.critical,
      readyLeadBriefs: leadBriefs.summary.ready,
      leadSlaManagerEscalations: leadSla.summary.manager_escalation_required,
      leadSlaReminders: leadSla.summary.reminder_required,
      leadsSnoozed: leadSla.summary.snoozed || 0,
      languageRequests: availableCount("languageRequests", data.languageRequests.length),
      viewings: data.viewings.length,
      viewingFollowUpsOpen: viewingFollowUpQueue.summary.open,
      viewingFollowUpsOverdue: viewingFollowUpQueue.summary.overdue,
      savedSearches: availableCount("savedSearches", data.savedSearches.length),
      publicRequestsOpen: publicRequestsAvailable ? publicRequestQueue.summary.open : null,
      publicRequestsOverdue: publicRequestsAvailable ? publicRequestQueue.summary.overdue : null,
      sellerPipeline: data.sellerPipeline.length,
      sellerPipelineOpen: sellerPipelineQueue.summary.open,
      sellerPipelineOverdue: sellerPipelineQueue.summary.overdue,
      deals: data.deals.length,
    },
  };
}

export function renderAdminContactsPayload(registry, requestedLocale, data) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  const contacts = data.contacts || [];
  const accounts = data.accounts || [];
  return {
    kind: "admin_contacts",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/contacts",
    canonical: "/admin/contacts",
    indexable: false,
    metadata: {
      title: `${workspace.copy.contactsWorkspace || "Contacts and accounts"} | MS Realty`,
      description: workspace.copy.contactsDescription || "One customer record for related enquiries and accounts.",
      robots: "noindex,nofollow",
    },
    workspace: workspaceWithOperator(workspace, data.operatorId || null),
    contacts,
    accounts,
    summary: {
      contacts: contacts.length,
      accounts: accounts.length,
      duplicate_leads: contacts.reduce((total, contact) => total + (contact.duplicate_leads || 0), 0),
      unassigned_accounts: contacts.filter((contact) => !contact.account_id).length,
      communication_events: contacts.reduce((total, contact) => total + (contact.communication_event_count || 0), 0),
    },
  };
}

export function renderAdminDocumentChecklistPayload(registry, requestedLocale, checklistQueue, operator = null) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  return {
    kind: "admin_document_checklists",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/documents",
    canonical: "/admin/documents",
    indexable: false,
    metadata: {
      title: `${workspace.copy.documentsWorkspace || "Documents and process"} | MS Realty`,
      description: workspace.copy.documentsDescription || "Reviewable process checklists without storing files.",
      robots: "noindex,nofollow",
    },
    workspace: workspaceWithOperator(workspace, operator),
    documentChecklistQueue: checklistQueue,
    summary: checklistQueue.summary,
  };
}

export function renderAdminConsentPayload(registry, requestedLocale, consentStates, operator = null) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  const states = consentStates || [];
  return {
    kind: "admin_consents",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/consents",
    canonical: "/admin/consents",
    indexable: false,
    metadata: {
      title: `${workspace.copy.consentsWorkspace || "Consent records"} | MS Realty`,
      description: workspace.copy.consentsDescription || "Current follow-up and alert consent state without raw contact values.",
      robots: "noindex,nofollow",
    },
    workspace: workspaceWithOperator(workspace, operator),
    consentStates: states,
    summary: {
      records: states.length,
      granted: states.filter((row) => row.granted).length,
      withdrawn: states.filter((row) => !row.granted).length,
      marketing_opt_in: states.filter((row) => row.marketing_opt_in).length,
    },
  };
}
