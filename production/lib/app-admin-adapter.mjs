import fs from "node:fs";
import { isAdminAuthorized } from "./admin-auth.mjs";
import { importAppSeoEvidenceRows, readAppSeoEvidence, readAppSeoEvidenceTemplate } from "./app-seo-evidence.mjs";
import {
  approveTranslationTask,
  createTranslationReviewTask,
  publishApprovedTranslation,
  renderAdminWorkspace,
} from "./admin-workflows.mjs";
import { LISTING_EDIT_FIELDS, renderAdminLeadsPayload, renderAdminListingEditorPayload } from "./admin-payloads.mjs";
import { DEFAULT_BROKER_CONTACT_LEDGER_PATH, appendBrokerContact, createBrokerContact, readBrokerContacts } from "./broker-contacts.mjs";
import { DEFAULT_DEAL_LEDGER_PATH, appendClosedDeal, readDeals } from "./deal-ledger.mjs";
import { renderHtmlPage } from "./html.mjs";
import { DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH, readLanguageRequests } from "./language-requests.mjs";
import { renderLaunchInputChecklist } from "./launch-inputs.mjs";
import {
  buildLiveServicePreflightReport,
  buildLaunchReadinessReport,
  liveServiceReports,
  readLiveServiceReportTemplate,
  writeLaunchReadinessReport,
  writeLiveServiceReport,
} from "./launch-readiness.mjs";
import { DEFAULT_LEAD_LEDGER_PATH, readLeadLedger } from "./lead-ledger.mjs";
import { DEFAULT_REPLY_OUTBOX_PATH, appendReviewedReply, readReplyOutbox } from "./lead-replies.mjs";
import { DEFAULT_LISTING_EDIT_LEDGER_PATH, appendListingEdit, applyListingEdits, createListingEdit, readListingEdits } from "./listing-edits.mjs";
import {
  DEFAULT_LISTING_QUALITY_REPORT,
  buildListingQualityPreflightReport,
  buildListingQualityReport,
  renderListingQualityWorkbook,
  validateListingQualityReviewCsv,
  writeCompleteListingQualityReviewCsv,
} from "./listing-quality.mjs";
import { addLocaleToRegistry, loadLocaleRegistry, requiredAdminLocales, requiredPublicLocales, websiteLanguageCoverage, writeLocaleRegistry } from "./locales.mjs";
import { loadCmsSeed } from "./runtime.mjs";
import { fromRoot } from "./paths.mjs";
import {
  DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT,
  DEFAULT_REDIRECT_APPROVALS_PATH,
  appendRedirectApproval,
  buildDeployableRedirects,
  buildPendingRedirectApprovalWorkbook,
  buildRedirectApprovalWorkbook,
  importRedirectApprovalsCsv,
  readRedirectApprovals,
  renderRedirectApprovalWorkbook,
  summarizeDeployableRedirects,
  writeDeployableRedirects,
} from "./redirect-approvals.mjs";
import { DEFAULT_SAVED_SEARCH_LEDGER_PATH, readSavedSearches } from "./saved-searches.mjs";
import { DEFAULT_SELLER_PIPELINE_PATH, readSellerPipeline } from "./seller-pipeline.mjs";
import { DEFAULT_SLUG_HISTORY_PATH, appendSlugChange } from "./slug-history.mjs";
import {
  DEFAULT_TOUR_APPROVAL_LEDGER_PATH,
  appendTourApproval,
  createTourApproval,
} from "./tours.mjs";
import {
  DEFAULT_TRANSLATION_LEDGER_PATH,
  appendTranslationTask,
  latestTranslationTasks,
  readTranslationLedger,
} from "./translation-ledger.mjs";
import { DEFAULT_VIEWING_LEDGER_PATH, appendViewing, readViewings, renderViewingCalendar } from "./viewing-ledger.mjs";

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};
const PRIVATE_HTML_HEADERS = { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8", "cache-control": "no-store" };
const PRIVATE_JSON_HEADERS = {
  ...SECURITY_HEADERS,
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};
const PRIVATE_MARKDOWN_HEADERS = { ...SECURITY_HEADERS, "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" };
const PRIVATE_CSV_HEADERS = { ...SECURITY_HEADERS, "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" };
const PRIVATE_DOWNLOAD_JSON_HEADERS = { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function bytesFrom(value) {
  const raw = value === undefined || value === "" ? String(10 * 1024 * 1024) : String(value);
  if (!/^\d+$/.test(raw)) throw new Error("MS_REALTY_MAX_BODY_BYTES must be a positive integer");
  const bytes = Number(raw);
  if (bytes < 1) throw new Error("MS_REALTY_MAX_BODY_BYTES must be a positive integer");
  return bytes;
}

export function appAdminConfigFromEnv(env = process.env) {
  return {
    maxBodyBytes: bytesFrom(env.MS_REALTY_MAX_BODY_BYTES),
    brokerContactLedgerPath: env.MS_REALTY_BROKER_CONTACT_LEDGER_PATH || DEFAULT_BROKER_CONTACT_LEDGER_PATH,
    dealLedgerPath: env.MS_REALTY_DEAL_LEDGER_PATH || DEFAULT_DEAL_LEDGER_PATH,
    deployableRedirectOutputPath: env.MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH || DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT,
    languageRequestPath: env.MS_REALTY_LANGUAGE_REQUEST_LEDGER_PATH || DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH,
    launchReadinessOutputPath: env.MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH,
    leadLedgerPath: env.MS_REALTY_LEAD_LEDGER_PATH || DEFAULT_LEAD_LEDGER_PATH,
    listingQualityReviewPath: env.MS_REALTY_LISTING_QUALITY_REVIEW_PATH,
    searchSyncReportPath: env.MS_REALTY_SEARCH_SYNC_REPORT_PATH,
    searchQueryReportPath: env.MS_REALTY_SEARCH_QUERY_REPORT_PATH,
    hermesWorkerReportPath: env.MS_REALTY_HERMES_WORKER_REPORT_PATH,
    localeRegistryPath: env.MS_REALTY_LOCALE_REGISTRY_PATH,
    listingEditLedgerPath: env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || DEFAULT_LISTING_EDIT_LEDGER_PATH,
    redirectApprovalPath: env.MS_REALTY_REDIRECT_APPROVALS_PATH || DEFAULT_REDIRECT_APPROVALS_PATH,
    replyOutboxPath: env.MS_REALTY_REPLY_OUTBOX_PATH || DEFAULT_REPLY_OUTBOX_PATH,
    savedSearchLedgerPath: env.MS_REALTY_SAVED_SEARCH_LEDGER_PATH || DEFAULT_SAVED_SEARCH_LEDGER_PATH,
    sellerPipelinePath: env.MS_REALTY_SELLER_PIPELINE_PATH || DEFAULT_SELLER_PIPELINE_PATH,
    seoEvidenceInputDir: env.MS_REALTY_SEO_EVIDENCE_INPUT_DIR,
    seoEvidenceOutputPath: env.MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH,
    slugHistoryPath: env.MS_REALTY_SLUG_HISTORY_PATH || DEFAULT_SLUG_HISTORY_PATH,
    tourApprovalLedgerPath: env.MS_REALTY_TOUR_APPROVAL_LEDGER_PATH || DEFAULT_TOUR_APPROVAL_LEDGER_PATH,
    translationLedgerPath: env.MS_REALTY_TRANSLATION_LEDGER_PATH || DEFAULT_TRANSLATION_LEDGER_PATH,
    viewingLedgerPath: env.MS_REALTY_VIEWING_LEDGER_PATH || DEFAULT_VIEWING_LEDGER_PATH,
    bookedAt: env.MS_REALTY_BOOKED_AT,
    dealClosedAt: env.MS_REALTY_DEAL_CLOSED_AT,
    editedAt: env.MS_REALTY_EDITED_AT,
    reviewedAt: env.MS_REALTY_REVIEWED_AT,
  };
}

function adminUnauthorized() {
  return new Response(JSON.stringify({ kind: "unauthorized" }), {
    status: 401,
    headers: { ...PRIVATE_JSON_HEADERS, "www-authenticate": 'Bearer realm="ms-realty-admin"' },
  });
}

function adminBadRequest(error) {
  return new Response(JSON.stringify({ kind: "bad_request", message: error.message }), {
    status: 400,
    headers: PRIVATE_JSON_HEADERS,
  });
}

function htmlResponse(payload) {
  return new Response(renderHtmlPage(payload), { status: payload.status || 200, headers: PRIVATE_HTML_HEADERS });
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: PRIVATE_JSON_HEADERS });
}

function markdownResponse(body) {
  return new Response(body, { status: 200, headers: PRIVATE_MARKDOWN_HEADERS });
}

function csvResponse(body, filename) {
  return new Response(body, {
    status: 200,
    headers: { ...PRIVATE_CSV_HEADERS, "content-disposition": `attachment; filename="${filename}"` },
  });
}

function downloadJsonResponse(body, filename) {
  return new Response(body, {
    status: 200,
    headers: { ...PRIVATE_DOWNLOAD_JSON_HEADERS, "content-disposition": `attachment; filename="${filename}"` },
  });
}

function calendarResponse(body) {
  return new Response(body, {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": 'attachment; filename="ms-realty-viewings.ics"',
    },
  });
}

async function readRequestBody(request, maxBodyBytes) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBodyBytes) {
      const error = new Error("Request body too large");
      error.status = 413;
      throw error;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function parseJsonBody(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw new Error("Invalid JSON request body");
  }
}

function parseBody(request, body) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(body));
  return parseJsonBody(body);
}

function csvInput(request, body) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) return parseBody(request, body).csv || "";
  return body || "";
}

function redirectApprovalInput(input) {
  return {
    ...input,
    equivalentContent:
      input.equivalentContent === true ||
      input.equivalentContent === "true" ||
      input.equivalentContent === "on" ||
      input.equivalentContent === "1",
  };
}

function seoExportInput(request, url, body) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const input = parseBody(request, body);
    return { source: input.source || url.searchParams.get("source"), csv: input.csv || "" };
  }
  if (contentType.includes("application/json")) {
    const input = parseJsonBody(body);
    return { source: input.source || url.searchParams.get("source"), csv: input.csv || "" };
  }
  return { source: url.searchParams.get("source"), csv: body || "" };
}

function liveServiceReportInput(request, url, body) {
  const input = parseBody(request, body);
  return { source: input.source || url.searchParams.get("source"), report: input.report || input };
}

function reviewedReplyInput(input) {
  return {
    ...input,
    approved: input.approved === true || input.approved === "true" || input.approved === "on" || input.approved === "1",
  };
}

function listingEditInput(input) {
  if (input.patch) return input;
  const patch = {};
  for (const field of LISTING_EDIT_FIELDS) {
    if (input[field] !== undefined && input[field] !== "") patch[field] = input[field];
  }
  return { ...input, patch };
}

function currentSeed(config) {
  return applyListingEdits(loadCmsSeed(), readListingEdits(config.listingEditLedgerPath));
}

function leadInboxPayload(registry, url, config) {
  return renderAdminLeadsPayload(registry, url.searchParams.get("locale") || "en", {
    leads: readLeadLedger(config.leadLedgerPath),
    replies: readReplyOutbox(config.replyOutboxPath),
    languageRequests: readLanguageRequests(config.languageRequestPath),
    translationTasks: latestTranslationTasks(readTranslationLedger(config.translationLedgerPath)),
    listingEdits: readListingEdits(config.listingEditLedgerPath),
    leadSlaGeneratedAt: config.reviewedAt,
    viewings: readViewings(config.viewingLedgerPath),
    savedSearches: readSavedSearches(config.savedSearchLedgerPath),
    sellerPipeline: readSellerPipeline(config.sellerPipelinePath),
    deals: readDeals(config.dealLedgerPath),
    brokerContacts: readBrokerContacts(config.brokerContactLedgerPath),
  });
}

function listingEditorPayload(registry, url, config) {
  const edits = readListingEdits(config.listingEditLedgerPath);
  return renderAdminListingEditorPayload(
    registry,
    url.searchParams.get("locale") || "en",
    currentSeed(config),
    url.searchParams.get("listingId"),
    edits,
    latestTranslationTasks(readTranslationLedger(config.translationLedgerPath)),
  );
}

function readJsonData(filename) {
  return JSON.parse(fs.readFileSync(fromRoot("production", "data", filename), "utf8"));
}

function routeMapRows() {
  return readJsonData("legacy-route-map.json").routes;
}

function deployableRedirects(config = {}) {
  const filePath = config.deployableRedirectOutputPath || DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT;
  const sourcePath = fs.existsSync(/*turbopackIgnore: true*/ filePath) ? filePath : DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT;
  return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ sourcePath, "utf8")).redirects;
}

function routeMapSummary(routes) {
  return {
    summary: {
      mappedListings: routes.filter((route) => route.url_type === "listing" && route.target_path).length,
    },
  };
}

function deployableRedirectsForLaunch(config) {
  const approvals = readRedirectApprovals(config.redirectApprovalPath);
  const customApprovals = config.redirectApprovalPath !== DEFAULT_REDIRECT_APPROVALS_PATH;
  const redirects = approvals.length || customApprovals ? buildDeployableRedirects(routeMapRows(), approvals) : deployableRedirects(config);
  return { summary: summarizeDeployableRedirects(redirects), redirects };
}

function currentDeployableRedirects(config) {
  return buildDeployableRedirects(routeMapRows(), readRedirectApprovals(config.redirectApprovalPath));
}

function currentSeoEvidence(config) {
  return readAppSeoEvidence(config);
}

function seoEvidencePayload(seoEvidence) {
  return {
    missingRequiredSources: seoEvidence.summary.missing_required_sources,
    sources: seoEvidence.summary.sources,
    importEndpoint: "/api/admin/seo-evidence/import",
    templateEndpoint: "/api/admin/seo-evidence/template",
  };
}

function launchReadiness(config) {
  return buildLaunchReadinessReport({
    generatedAt: config.reviewedAt || new Date().toISOString(),
    routeMap: routeMapSummary(routeMapRows()),
    deployableRedirects: deployableRedirectsForLaunch(config),
    listingQualityReviewPath: config.listingQualityReviewPath || undefined,
    seoEvidence: currentSeoEvidence(config),
    liveServices: liveServiceReports({
      syncReportPath: config.searchSyncReportPath || undefined,
      queryReportPath: config.searchQueryReportPath || undefined,
      hermesReportPath: config.hermesWorkerReportPath || undefined,
    }),
  });
}

function launchInputChecklist(config) {
  const routes = routeMapRows();
  const approvals = readRedirectApprovals(config.redirectApprovalPath);
  const redirects =
    approvals.length || config.redirectApprovalPath !== DEFAULT_REDIRECT_APPROVALS_PATH
      ? buildDeployableRedirects(routes, approvals)
      : deployableRedirects(config);
  const generatedAt = config.reviewedAt || new Date().toISOString();
  return renderLaunchInputChecklist({
    generatedAt,
    launchReadiness: launchReadiness(config),
    seoEvidence: currentSeoEvidence(config),
    redirectWorkbookCsv: renderRedirectApprovalWorkbook(buildRedirectApprovalWorkbook(routes)),
    deployableRedirects: { summary: summarizeDeployableRedirects(redirects) },
    routeMap: routeMapSummary(routes),
  });
}

function seoPreflightReport(config) {
  const evidence = currentSeoEvidence(config);
  const missing = evidence.summary.missing_required_sources;
  return {
    generated_at: evidence.generated_at,
    ready: missing.length === 0,
    status: missing.length ? "blocked" : "ready",
    summary: {
      crawl_urls: evidence.summary.crawl_urls,
      urls_with_any_evidence: evidence.summary.urls_with_any_evidence,
      missing_required_sources: missing,
      sources: Object.fromEntries(
        ["search_console", "yandex_webmaster", "backlinks"].map((source) => [source, evidence.summary.sources[source]]),
      ),
    },
    next_actions: missing.length
      ? [
          "Export Search Console, Yandex Webmaster, and backlink CSVs for both legacy domains.",
          "Place them in migration/external/seo or set MS_REALTY_SEO_EVIDENCE_INPUT_DIR.",
          "Run npm run seo:preflight before launch:preflight.",
        ]
      : ["Run npm run launch:preflight with the same SEO evidence input path."],
  };
}

function preflightReports(config) {
  const generatedAt = config.reviewedAt || new Date().toISOString();
  const listingReport = buildListingQualityReport({ seed: currentSeed(config), generatedAt });
  return {
    kind: "admin_preflight_reports",
    generated_at: generatedAt,
    reports: {
      seo: seoPreflightReport(config),
      listing_quality: buildListingQualityPreflightReport({
        report: listingReport,
        reviewPath: config.listingQualityReviewPath || undefined,
        generatedAt,
      }),
      live_services: buildLiveServicePreflightReport({
        generatedAt,
        syncReportPath: config.searchSyncReportPath || undefined,
        queryReportPath: config.searchQueryReportPath || undefined,
        hermesReportPath: config.hermesWorkerReportPath || undefined,
      }),
    },
  };
}

function migrationReviewPayload(registry, url, config) {
  const routes = routeMapRows();
  const workspace = renderAdminWorkspace({ registry, requestedLocale: url.searchParams.get("locale") || "en" });
  const reviewRequired = routes.filter((route) => route.review_required);
  const mappedListings = routes.filter((route) => route.url_type === "listing" && route.target_path);
  return {
    kind: "admin_migration_review",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/migration/review",
    canonical: "/admin/migration/review",
    indexable: false,
    metadata: {
      title: "MS Realty migration review",
      description: "Admin-only crawl metadata, media, and reviewed redirect approval workbench.",
      robots: "noindex,nofollow",
    },
    workspace,
    dashboard: readJsonData("migration-review-dashboard.json"),
    routeMap: {
      total: routes.length,
      reviewRequired: reviewRequired.length,
      mappedListings: mappedListings.length,
      pendingSample: reviewRequired.slice(0, 20),
      approvableSample: mappedListings.filter((route) => route.review_required && route.planned_status === 301).slice(0, 20),
    },
    redirectApprovals: readRedirectApprovals(config.redirectApprovalPath),
    redirectApprovalImport: {
      method: "POST",
      endpoint: "/api/admin/redirect-approvals/import",
      exportEndpoint: "/api/admin/deployable-redirects/export",
      workbookEndpoint: "/api/admin/redirect-approval-workbook",
      pendingWorkbookEndpoint: "/api/admin/redirect-approval-workbook?pending=1",
      contentType: "text/csv",
      workbookPath: "production/data/redirect-approval-workbook.csv",
    },
    seoEvidence: seoEvidencePayload(currentSeoEvidence(config)),
    listingQuality: buildListingQualityReport({ seed: currentSeed(config), generatedAt: config.reviewedAt, limit: 20 }),
    listingQualityWorkbookEndpoint: "/api/admin/listing-quality-workbook",
    listingQualityImportEndpoint: "/api/admin/listing-quality/import",
    launchReadinessEndpoint: "/api/admin/launch-readiness",
    launchReadinessExportEndpoint: "/api/admin/launch-readiness/export",
    launchInputChecklistEndpoint: "/api/admin/launch-input-checklist",
    preflightReportsEndpoint: "/api/admin/preflight-reports",
    deployablePreview: currentDeployableRedirects(config),
  };
}

function localePayload(registry, url) {
  return {
    workspace: renderAdminWorkspace({ registry, requestedLocale: url.searchParams.get("locale") || "en" }),
    locales: registry.locales,
  };
}

function addLocale(registry, input, config) {
  const result = addLocaleToRegistry(registry, input);
  writeLocaleRegistry(result.registry, config.localeRegistryPath);
  return {
    locale: result.locale,
    required_admin_locales: requiredAdminLocales(result.registry),
    admin_locales: result.registry.admin_locales,
    required_public_locales: requiredPublicLocales(result.registry),
    website_language_coverage: websiteLanguageCoverage(result.registry),
    public_indexable_locales: result.registry.locales
      .filter((locale) => locale.public_enabled && locale.indexable)
      .map((locale) => locale.code),
  };
}

function appendReply(input, config) {
  return appendReviewedReply(readLeadLedger(config.leadLedgerPath), reviewedReplyInput(input), {
    filePath: config.replyOutboxPath,
    reviewedAt: config.reviewedAt,
  });
}

function appendEditorChange(input, config) {
  const translationTasks = latestTranslationTasks(readTranslationLedger(config.translationLedgerPath));
  const result = createListingEdit(currentSeed(config), listingEditInput(input), translationTasks, config.editedAt);
  const edit = appendListingEdit(result.edit, { filePath: config.listingEditLedgerPath });
  const persistedStaleTranslations = result.staleTranslations
    .filter((translation) => translation.id)
    .map((translation) => appendTranslationTask(translation, { filePath: config.translationLedgerPath }));
  return { edit, staleTranslations: result.staleTranslations, persistedStaleTranslations };
}

function appendViewingBooking(input, config) {
  return appendViewing(readLeadLedger(config.leadLedgerPath), input, {
    filePath: config.viewingLedgerPath,
    bookedAt: config.bookedAt,
  });
}

function appendDealClose(input, config) {
  return appendClosedDeal(readLeadLedger(config.leadLedgerPath), input, {
    filePath: config.dealLedgerPath,
    closedAt: config.dealClosedAt,
  });
}

function appendBrokerContactApproval(input, config) {
  return appendBrokerContact(createBrokerContact(input, { reviewedAt: config.reviewedAt }), {
    filePath: config.brokerContactLedgerPath,
  });
}

function appendTourApprovalRow(input, config) {
  return appendTourApproval(createTourApproval(currentSeed(config), input, config.reviewedAt), {
    filePath: config.tourApprovalLedgerPath,
  });
}

function appendTranslationDraft(registry, input, config) {
  return appendTranslationTask(createTranslationReviewTask(registry, input), { filePath: config.translationLedgerPath });
}

function appendPublishedTranslation(registry, input, config) {
  const task = latestTranslationTasks(readTranslationLedger(config.translationLedgerPath)).find((row) => row.id === input.taskId);
  if (!task) throw new Error("Known translation task is required");
  const approved = approveTranslationTask(registry, task, input.reviewer, input.approvedAt || config.reviewedAt);
  return appendTranslationTask(publishApprovedTranslation(registry, approved), { filePath: config.translationLedgerPath });
}

function appendListingSlugChange(registry, input, config) {
  return appendSlugChange(registry, currentSeed(config), input, {
    filePath: config.slugHistoryPath,
    changedAt: config.editedAt,
  });
}

function appendRedirectApprovalRow(input, config) {
  const approval = appendRedirectApproval(routeMapRows(), redirectApprovalInput(input), {
    filePath: config.redirectApprovalPath,
    approvedAt: config.reviewedAt,
  });
  return {
    approval,
    deployablePreview: currentDeployableRedirects(config),
  };
}

function importRedirectApprovalRows(csvText, config) {
  const imported = importRedirectApprovalsCsv(routeMapRows(), csvText, {
    filePath: config.redirectApprovalPath,
    approvedAt: config.reviewedAt,
  });
  return {
    imported: imported.length,
    approvals: imported,
    deployablePreview: currentDeployableRedirects(config),
  };
}

function exportDeployableRedirectRows(config) {
  const rows = currentDeployableRedirects(config);
  return { exported: rows.length, ...writeDeployableRedirects(rows, config.deployableRedirectOutputPath) };
}

function exportLaunchReadiness(config) {
  const report = launchReadiness(config);
  const outPath = writeLaunchReadinessReport(report, config.launchReadinessOutputPath || undefined);
  return { outPath, report };
}

function importLiveServiceReport(input, config) {
  const imported = writeLiveServiceReport(input.source, input.report, {
    syncReportPath: config.searchSyncReportPath || undefined,
    queryReportPath: config.searchQueryReportPath || undefined,
    hermesReportPath: config.hermesWorkerReportPath || undefined,
  });
  return { imported, report: launchReadiness(config) };
}

function redirectApprovalWorkbook(url, config) {
  const routes = routeMapRows();
  const approvals = readRedirectApprovals(config.redirectApprovalPath);
  const rows = url.searchParams.get("pending") ? buildPendingRedirectApprovalWorkbook(routes, approvals) : buildRedirectApprovalWorkbook(routes);
  return renderRedirectApprovalWorkbook(rows);
}

function listingQualityWorkbook(config) {
  return renderListingQualityWorkbook(buildListingQualityReport({ seed: currentSeed(config) }));
}

function importListingQualityRows(inputCsv, config) {
  const review = validateListingQualityReviewCsv(buildListingQualityReport({ seed: currentSeed(config) }), inputCsv);
  let reviewPath = null;
  let reviewPersistenceError = "";
  if (review.summary.missing_review_rows === 0) {
    try {
      reviewPath = writeCompleteListingQualityReviewCsv(
        JSON.parse(fs.readFileSync(DEFAULT_LISTING_QUALITY_REPORT, "utf8")),
        inputCsv,
        config.listingQualityReviewPath || undefined,
      );
    } catch (error) {
      reviewPersistenceError = error.message;
    }
  }
  const translationTasks = latestTranslationTasks(readTranslationLedger(config.translationLedgerPath));
  const edits = review.reviews
    .filter((row) => Object.keys(row.patch).length || row.media_reviewer)
    .map((row) => {
      const result = createListingEdit(
        currentSeed(config),
        {
          id: `listing-quality-${row.listing_id}`,
          listingId: row.listing_id,
          editor: row.editor,
          patch: row.patch,
          mediaReviewer: row.media_reviewer,
        },
        translationTasks,
        config.editedAt,
      );
      const edit = appendListingEdit(
        {
          ...result.edit,
          review_source: "listing_quality_csv",
          media_reviewer: row.media_reviewer || undefined,
          review_notes: row.review_notes || undefined,
        },
        { filePath: config.listingEditLedgerPath },
      );
      const persistedStaleTranslations = result.staleTranslations
        .filter((translation) => translation.id)
        .map((translation) => appendTranslationTask(translation, { filePath: config.translationLedgerPath }));
      return { edit, staleTranslations: result.staleTranslations, persistedStaleTranslations };
    });
  return {
    imported: review.summary.review_rows,
    edited: edits.length,
    mediaReviewRows: review.summary.media_review_rows,
    reviewPersisted: Boolean(reviewPath),
    reviewPath,
    reviewPersistenceError,
    edits,
  };
}

export async function renderAppAdminResponse(request, { config = appAdminConfigFromEnv() } = {}) {
  if (!isAdminAuthorized(request.headers.get("authorization") || "")) return adminUnauthorized();
  try {
    const url = new URL(request.url, "http://localhost");
    const registry = loadLocaleRegistry(config.localeRegistryPath);
    if (request.method === "GET" && url.pathname === "/admin/leads") return htmlResponse(leadInboxPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/leads") return jsonResponse(200, leadInboxPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/listings/edit") {
      return htmlResponse(listingEditorPayload(registry, url, config));
    }
    if (request.method === "GET" && url.pathname === "/admin/migration/review") {
      return htmlResponse(migrationReviewPayload(registry, url, config));
    }
    if (request.method === "GET" && url.pathname === "/api/admin/migration/review") {
      return jsonResponse(200, migrationReviewPayload(registry, url, config));
    }
    if (request.method === "GET" && url.pathname === "/api/admin/locales") {
      return jsonResponse(200, localePayload(registry, url));
    }
    if (request.method === "GET" && url.pathname === "/api/admin/launch-readiness") {
      return jsonResponse(200, launchReadiness(config));
    }
    if (request.method === "GET" && url.pathname === "/api/admin/launch-input-checklist") {
      return markdownResponse(launchInputChecklist(config));
    }
    if (request.method === "GET" && url.pathname === "/api/admin/preflight-reports") {
      return jsonResponse(200, preflightReports(config));
    }
    if (request.method === "GET" && url.pathname === "/api/admin/live-service-report-template") {
      const template = readLiveServiceReportTemplate(url.searchParams.get("source"));
      return downloadJsonResponse(template.json, template.filename);
    }
    if (request.method === "GET" && url.pathname === "/api/admin/seo-evidence") {
      return jsonResponse(200, seoEvidencePayload(currentSeoEvidence(config)));
    }
    if (request.method === "GET" && url.pathname === "/api/admin/seo-evidence/template") {
      const template = readAppSeoEvidenceTemplate(url, config);
      return csvResponse(template.csv, template.filename);
    }
    if (request.method === "GET" && url.pathname === "/api/admin/redirect-approval-workbook") {
      return csvResponse(redirectApprovalWorkbook(url, config), "redirect-approval-workbook.csv");
    }
    if (request.method === "GET" && url.pathname === "/api/admin/listing-quality-workbook") {
      return csvResponse(listingQualityWorkbook(config), "listing-quality-workbook.csv");
    }
    if (request.method === "POST" && url.pathname === "/api/admin/locales") {
      return jsonResponse(201, addLocale(registry, parseJsonBody(await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/translations/draft") {
      return jsonResponse(201, appendTranslationDraft(registry, parseJsonBody(await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/translations/publish") {
      return jsonResponse(201, appendPublishedTranslation(registry, parseJsonBody(await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/redirect-approvals") {
      return jsonResponse(201, appendRedirectApprovalRow(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/redirect-approvals/import") {
      return jsonResponse(201, importRedirectApprovalRows(csvInput(request, await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/deployable-redirects/export") {
      return jsonResponse(201, exportDeployableRedirectRows(config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/launch-readiness/export") {
      return jsonResponse(201, exportLaunchReadiness(config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/live-service-reports/import") {
      return jsonResponse(
        201,
        importLiveServiceReport(liveServiceReportInput(request, url, await readRequestBody(request, config.maxBodyBytes)), config),
      );
    }
    if (request.method === "POST" && url.pathname === "/api/admin/seo-evidence/import") {
      return jsonResponse(201, importAppSeoEvidenceRows(seoExportInput(request, url, await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/listing-quality/import") {
      return jsonResponse(201, importListingQualityRows(csvInput(request, await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/replies") {
      return jsonResponse(201, appendReply(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/listings/edit") {
      return jsonResponse(201, appendEditorChange(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/listings/slug") {
      return jsonResponse(201, appendListingSlugChange(registry, parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/viewings") {
      return jsonResponse(201, appendViewingBooking(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "GET" && url.pathname === "/api/admin/viewings.ics") {
      return calendarResponse(renderViewingCalendar(readViewings(config.viewingLedgerPath), { now: config.bookedAt }));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/deals/close") {
      return jsonResponse(201, appendDealClose(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/broker-contacts") {
      return jsonResponse(201, appendBrokerContactApproval(parseJsonBody(await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/tours/approve") {
      return jsonResponse(201, appendTourApprovalRow(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config));
    }
    return jsonResponse(405, { kind: "method_not_allowed" });
  } catch (error) {
    if (error.status === 413) return jsonResponse(413, { kind: "request_too_large" });
    return adminBadRequest(error);
  }
}
