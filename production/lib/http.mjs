import fs from "node:fs";
import { isAdminAuthorized } from "./admin-auth.mjs";
import { appendAuditLog, createAuditLogEntry } from "./audit-log.mjs";
import { LISTING_EDIT_FIELDS, renderAdminLeadsPayload, renderAdminListingEditorPayload } from "./admin-payloads.mjs";
import {
  addLocaleToRegistry,
  loadLocaleRegistry,
  requiredAdminLocales,
  requiredPublicLocales,
  websiteLanguageCoverage,
  writeLocaleRegistry,
} from "./locales.mjs";
import { renderHtmlPage } from "./html.mjs";
import { renderReactAdminBody } from "./react-admin-site.mjs";
import { renderReactPublicBody } from "./react-public-site.mjs";
import { appendLead, readLeadLedger } from "./lead-ledger.mjs";
import { appendReviewedReply, readReplyOutbox } from "./lead-replies.mjs";
import { appendBrokerContact, createBrokerContact, readBrokerContacts } from "./broker-contacts.mjs";
import { loadCmsSeed, renderRuntimePath, searchRuntimeListings, submitRuntimeLead } from "./runtime.mjs";
import { buildRuntimeLocalizedSitemap, renderRobotsTxt, renderSitemapXml } from "./seo-files.mjs";
import {
  approveTranslationTask,
  createTranslationReviewTask,
  publishApprovedTranslation,
  renderAdminWorkspace,
} from "./admin-workflows.mjs";
import {
  appendRedirectApproval,
  buildPendingRedirectApprovalWorkbook,
  buildRedirectApprovalWorkbook,
  buildDeployableRedirects,
  importRedirectApprovalsCsv,
  loadDeployableRedirects,
  readRedirectApprovals,
  renderRedirectApprovalWorkbook,
  summarizeDeployableRedirects,
  writeDeployableRedirects,
} from "./redirect-approvals.mjs";
import { appendLanguageRequest, createLanguageRequest, readLanguageRequests } from "./language-requests.mjs";
import { appendTranslationTask, latestTranslationTasks, readTranslationLedger } from "./translation-ledger.mjs";
import { appendListingEdit, applyListingEdits, createListingEdit, readListingEdits } from "./listing-edits.mjs";
import { appendViewing, readViewings, renderViewingCalendar } from "./viewing-ledger.mjs";
import { appendSavedSearch, createSavedSearch, readSavedSearches } from "./saved-searches.mjs";
import { appendSellerPipeline, createSellerPipelineItem, readSellerPipeline } from "./seller-pipeline.mjs";
import { appendClosedDeal, readDeals } from "./deal-ledger.mjs";
import { appendTourApproval, createTourApproval, readTourApprovals } from "./tours.mjs";
import { appendEvent, createEvent, readEventLedger } from "./events.mjs";
import { appendConsentRecord, createConsentRecord } from "./consent-ledger.mjs";
import { appendSlugChange, readSlugHistory, slugRedirectForPath } from "./slug-history.mjs";
import { buildHermesPublicChat } from "./hermes-public-chat.mjs";
import { renderFaviconSvg } from "./favicon.mjs";
import {
  buildSeoEvidence,
  buildSeoEvidencePreflightReport,
  readSeoExportTemplate,
  writeExternalSeoExport,
  writeSeoEvidence,
} from "./seo-evidence.mjs";
import {
  buildLiveServicePreflightReport,
  buildLaunchReadinessReport,
  liveServiceReports,
  payloadRuntimeState,
  publicLaunchReadinessHeaders,
  publicLaunchReadinessPayload,
  readLiveServiceReportTemplate,
  writeLaunchReadinessReport,
  writeLiveServiceReport,
} from "./launch-readiness.mjs";
import { liveServiceProvisioningState } from "./live-service-provisioning.mjs";
import { renderLaunchInputChecklist } from "./launch-inputs.mjs";
import { loadCmsCollections } from "./cms-seed.mjs";
import { loadPayloadCollections } from "./payload-collections.mjs";
import {
  DEFAULT_LISTING_QUALITY_REPORT,
  buildListingQualityPreflightReport,
  buildListingQualityReport,
  renderListingQualityWorkbook,
  validateListingQualityReviewCsv,
  writeCompleteListingQualityReviewCsv,
} from "./listing-quality.mjs";
import { fromRoot } from "./paths.mjs";
import { searchFiltersFromObject, searchFiltersFromParams } from "./search-filters.mjs";

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};
const PRIVATE_HEADERS = { "cache-control": "no-store" };

function response(status, body, contentType, headers = {}) {
  return {
    status,
    headers: { ...SECURITY_HEADERS, "content-type": contentType, ...headers },
    body,
  };
}

function json(status, body) {
  return response(status, body, "application/json; charset=utf-8");
}

function privateResponse(status, body, contentType, headers = {}) {
  return response(status, body, contentType, { ...PRIVATE_HEADERS, ...headers });
}

function privateJson(status, body) {
  return privateResponse(status, body, "application/json; charset=utf-8");
}

function adminResponse(status, body, contentType, headers = {}) {
  return privateResponse(status, body, contentType, headers);
}

function adminJson(status, body) {
  return privateJson(status, body);
}

function wantsHtml(request, url) {
  const accept = request.headers?.accept || request.headers?.Accept || "";
  return url.searchParams.get("format") === "html" || accept.includes("text/html");
}

function wantsPrint(url, rendered) {
  return rendered.kind === "listing" && url.searchParams.get("print") === "1";
}

function publicResponse(request, url, rendered) {
  if (wantsPrint(url, rendered)) {
    return response(rendered.status || 200, renderHtmlPage(rendered, { print: true }), "text/html; charset=utf-8");
  }
  if (wantsHtml(request, url)) {
    return response(rendered.status || 200, renderHtmlPage(rendered, { bodyHtml: renderReactPublicBody(rendered) }), "text/html; charset=utf-8");
  }
  return json(rendered.status || 200, rendered);
}

function adminHtml(page) {
  return renderHtmlPage(page, { bodyHtml: renderReactAdminBody(page) });
}

function adminUnauthorized() {
  return adminResponse(401, { kind: "unauthorized" }, "application/json; charset=utf-8", {
    "www-authenticate": 'Bearer realm="ms-realty-admin"',
  });
}

function parseJsonBody(request) {
  try {
    return JSON.parse(request.body || "{}");
  } catch {
    throw new Error("Invalid JSON request body");
  }
}

function loadLegacyRouteMap(filePath = fromRoot("production", "data", "legacy-route-map.json")) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")).routes || [];
}

function loadMigrationReviewDashboard(filePath = fromRoot("production", "data", "migration-review-dashboard.json")) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseBody(request) {
  const contentType = request.headers?.["content-type"] || request.headers?.["Content-Type"] || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(request.body || ""));
  }
  return parseJsonBody(request);
}

function redirectApprovalInput(request) {
  const input = parseBody(request);
  return {
    ...input,
    equivalentContent:
      input.equivalentContent === true ||
      input.equivalentContent === "true" ||
      input.equivalentContent === "on" ||
      input.equivalentContent === "1",
  };
}

function csvInput(request) {
  const contentType = request.headers?.["content-type"] || request.headers?.["Content-Type"] || "";
  if (contentType.includes("application/x-www-form-urlencoded")) return parseBody(request).csv || "";
  return request.body || "";
}

function seoExportInput(request, url) {
  const contentType = request.headers?.["content-type"] || request.headers?.["Content-Type"] || "";
  if (contentType.includes("text/csv")) {
    return { source: url.searchParams.get("source"), csv: request.body || "" };
  }
  const input = parseBody(request);
  return { source: input.source || url.searchParams.get("source"), csv: input.csv || "" };
}

function liveServiceReportInput(request, url) {
  const input = parseBody(request);
  return {
    source: input.source || url.searchParams.get("source"),
    report: input.report || input,
  };
}

function reviewedReplyInput(request) {
  const input = parseBody(request);
  return {
    ...input,
    approved: input.approved === true || input.approved === "true" || input.approved === "on" || input.approved === "1",
  };
}

function listingEditInput(request) {
  const input = parseBody(request);
  if (input.patch) return input;
  const patch = {};
  for (const field of LISTING_EDIT_FIELDS) {
    if (input[field] !== undefined && input[field] !== "") patch[field] = input[field];
  }
  return { ...input, patch };
}

function seoEvidencePayload(seoEvidence) {
  return {
    missingRequiredSources: seoEvidence.summary.missing_required_sources,
    sources: seoEvidence.summary.sources,
    importEndpoint: "/api/admin/seo-evidence/import",
    templateEndpoint: "/api/admin/seo-evidence/template",
  };
}

function renderMigrationReviewPayload(registry, requestedLocale, dashboard, routes, approvals, seoEvidence, seed, listingQualityGeneratedAt) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
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
    dashboard,
    routeMap: {
      total: routes.length,
      reviewRequired: reviewRequired.length,
      mappedListings: mappedListings.length,
      pendingSample: reviewRequired.slice(0, 20),
      approvableSample: mappedListings.filter((route) => route.review_required && route.planned_status === 301).slice(0, 20),
    },
    redirectApprovals: approvals,
    redirectApprovalImport: {
      method: "POST",
      endpoint: "/api/admin/redirect-approvals/import",
      exportEndpoint: "/api/admin/deployable-redirects/export",
      workbookEndpoint: "/api/admin/redirect-approval-workbook",
      pendingWorkbookEndpoint: "/api/admin/redirect-approval-workbook?pending=1",
      contentType: "text/csv",
      workbookPath: "production/data/redirect-approval-workbook.csv",
    },
    seoEvidence: seoEvidencePayload(seoEvidence),
    listingQuality: buildListingQualityReport({ seed, generatedAt: listingQualityGeneratedAt, limit: 20 }),
    listingQualityWorkbookEndpoint: "/api/admin/listing-quality-workbook",
    listingQualityImportEndpoint: "/api/admin/listing-quality/import",
    launchReadinessEndpoint: "/api/admin/launch-readiness",
    launchReadinessExportEndpoint: "/api/admin/launch-readiness/export",
    launchInputChecklistEndpoint: "/api/admin/launch-input-checklist",
    preflightReportsEndpoint: "/api/admin/preflight-reports",
    cmsCollectionsEndpoint: "/api/admin/cms-collections",
    payloadCollectionsEndpoint: "/api/admin/payload-collections",
    deployablePreview: buildDeployableRedirects(routes, approvals),
  };
}

export function createHttpApp({
  registry,
  seed = loadCmsSeed(),
  redirects,
  routeMap = loadLegacyRouteMap(),
  migrationReviewDashboard = loadMigrationReviewDashboard(),
  leadLedgerPath = null,
  replyOutboxPath = null,
  languageRequestPath = null,
  translationLedgerPath = null,
  listingEditLedgerPath = null,
  viewingLedgerPath = null,
  savedSearchLedgerPath = null,
  sellerPipelinePath = null,
  dealLedgerPath = null,
  brokerContactLedgerPath = null,
  tourApprovalLedgerPath = null,
  eventLedgerPath = null,
  consentLedgerPath = null,
  auditLogPath = null,
  slugHistoryPath = null,
  redirectApprovalPath = null,
  deployableRedirectOutputPath = null,
  launchReadinessOutputPath = null,
  listingQualityReviewPath = null,
  searchSyncReportPath = null,
  searchQueryReportPath = null,
  hermesWorkerReportPath = null,
  liveServiceProvisioningReportPath = null,
  payloadRuntimeReportPath = null,
  seoEvidenceInputDir = null,
  seoEvidenceOutputPath = null,
  localeRegistryPath = null,
  receivedAt,
  requestedAt,
  editedAt,
  reviewedAt,
  bookedAt,
  savedAt,
  sellerPipelineCreatedAt,
  dealClosedAt,
  slugChangedAt,
  listingQualityGeneratedAt,
  leadSlaGeneratedAt,
} = {}) {
  let activeRegistry = registry || loadLocaleRegistry(localeRegistryPath || undefined);
  const activeRedirects = redirects ?? loadDeployableRedirects(deployableRedirectOutputPath || undefined);
  const currentSeoEvidence = () =>
    buildSeoEvidence({
      inputDir: seoEvidenceInputDir || undefined,
      events: readEventLedger(eventLedgerPath || undefined),
      generatedAt: reviewedAt || new Date().toISOString(),
    });
  const currentDeployableRedirects = () =>
    buildDeployableRedirects(routeMap, readRedirectApprovals(redirectApprovalPath || undefined));
  const currentLaunchReadiness = () => {
    const redirectRows = currentDeployableRedirects();
    return buildLaunchReadinessReport({
      generatedAt: reviewedAt || new Date().toISOString(),
      routeMap: {
        summary: {
          mappedListings: routeMap.filter((route) => route.url_type === "listing" && route.target_path).length,
        },
      },
      deployableRedirects: { summary: summarizeDeployableRedirects(redirectRows), redirects: redirectRows },
      listingQualityReviewPath: listingQualityReviewPath || undefined,
      seoEvidence: currentSeoEvidence(),
      liveServices: liveServiceReports({
        syncReportPath: searchSyncReportPath || undefined,
        queryReportPath: searchQueryReportPath || undefined,
        hermesReportPath: hermesWorkerReportPath || undefined,
      }),
      payloadRuntime: payloadRuntimeState(payloadRuntimeReportPath || undefined),
    });
  };
  const currentLaunchInputChecklist = () =>
    renderLaunchInputChecklist({
      generatedAt: reviewedAt || new Date().toISOString(),
      launchReadiness: currentLaunchReadiness(),
      seoEvidence: currentSeoEvidence(),
      redirectWorkbookCsv: renderRedirectApprovalWorkbook(buildRedirectApprovalWorkbook(routeMap)),
      deployableRedirects: { summary: summarizeDeployableRedirects(currentDeployableRedirects()) },
      routeMap: {
        summary: {
          mappedListings: routeMap.filter((route) => route.url_type === "listing" && route.target_path).length,
        },
      },
    });
  const currentPreflightReports = () => {
    const listingReport = buildListingQualityReport({
      seed: currentSeed(),
      generatedAt: listingQualityGeneratedAt || reviewedAt || new Date().toISOString(),
    });
    return {
      kind: "admin_preflight_reports",
      generated_at: reviewedAt || new Date().toISOString(),
      reports: {
        seo: buildSeoEvidencePreflightReport({
          inputDir: seoEvidenceInputDir || undefined,
          events: readEventLedger(eventLedgerPath || undefined),
          generatedAt: reviewedAt || new Date().toISOString(),
        }),
        listing_quality: buildListingQualityPreflightReport({
          report: listingReport,
          reviewPath: listingQualityReviewPath || undefined,
          generatedAt: reviewedAt || new Date().toISOString(),
        }),
        live_services: buildLiveServicePreflightReport({
          generatedAt: reviewedAt || new Date().toISOString(),
          syncReportPath: searchSyncReportPath || undefined,
          queryReportPath: searchQueryReportPath || undefined,
          hermesReportPath: hermesWorkerReportPath || undefined,
        }),
        live_service_provisioning: liveServiceProvisioningState(liveServiceProvisioningReportPath || undefined),
        payload_runtime: payloadRuntimeState(payloadRuntimeReportPath || undefined),
      },
    };
  };
  const currentSeed = () => applyListingEdits(seed, readListingEdits(listingEditLedgerPath || undefined));
  const recordEvent = (input) =>
    eventLedgerPath ? appendEvent(createEvent(input, receivedAt || new Date().toISOString()), { filePath: eventLedgerPath }) : null;
  const recordConsent = (input) =>
    consentLedgerPath
      ? appendConsentRecord(createConsentRecord(input, receivedAt || new Date().toISOString()), { filePath: consentLedgerPath })
      : null;
  const recordAudit = (input) =>
    auditLogPath
      ? appendAuditLog(createAuditLogEntry(input, reviewedAt || editedAt || bookedAt || dealClosedAt || receivedAt || new Date().toISOString()), {
          filePath: auditLogPath,
        })
      : null;
  return async function handle(request) {
    const url = new URL(request.url, "http://localhost");
    const auth = request.headers?.authorization || request.headers?.Authorization || "";
    const host =
      request.headers?.["x-forwarded-host"] ||
      request.headers?.["X-Forwarded-Host"] ||
      request.headers?.host ||
      request.headers?.Host;
    const legacyUrl = request.url.startsWith("http") ? url.href : host ? `https://${host}${url.pathname}${url.search}` : "";
    const legacyRedirect = request.method === "GET" ? activeRedirects.find((row) => row.old_url === legacyUrl) : null;

    if (legacyRedirect) {
      return response(
        301,
        { kind: "legacy_redirect", location: legacyRedirect.target_path },
        "application/json; charset=utf-8",
        { location: legacyRedirect.target_path },
      );
    }

    const slugRedirect =
      request.method === "GET" ? slugRedirectForPath(readSlugHistory(slugHistoryPath || undefined), url.pathname) : null;
    if (slugRedirect) {
      return response(
        301,
        { kind: "slug_redirect", location: slugRedirect.new_path, listing_id: slugRedirect.listing_id, locale: slugRedirect.locale },
        "application/json; charset=utf-8",
        { location: slugRedirect.new_path },
      );
    }

    if (request.method === "GET" && url.pathname === "/sitemap.xml") {
      return response(
        200,
        renderSitemapXml(buildRuntimeLocalizedSitemap(activeRegistry, currentSeed(), readTranslationLedger(translationLedgerPath || undefined))),
        "application/xml; charset=utf-8",
      );
    }

    if (request.method === "GET" && url.pathname === "/robots.txt") {
      return response(200, renderRobotsTxt(), "text/plain; charset=utf-8");
    }

    if (request.method === "GET" && url.pathname === "/favicon.ico") {
      return response(200, renderFaviconSvg(), "image/svg+xml; charset=utf-8", {
        "cache-control": "public, max-age=86400",
      });
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      const readiness = currentLaunchReadiness();
      return json(200, {
        kind: "health",
        service: "ms-realty",
        status: "ok",
        launch_ready: readiness.launch_ready,
        blockers: readiness.blockers,
      });
    }

    if (request.method === "GET" && url.pathname === "/api/ready") {
      const readiness = currentLaunchReadiness();
      return response(
        readiness.launch_ready ? 200 : 503,
        publicLaunchReadinessPayload(readiness),
        "application/json; charset=utf-8",
        publicLaunchReadinessHeaders(readiness),
      );
    }

    if (request.method === "GET" && url.pathname === "/api/search") {
      const localeCode = url.searchParams.get("locale") || "bg";
      const query = url.searchParams.get("q") || "";
      const filters = searchFiltersFromParams(url.searchParams);
      const result = searchRuntimeListings(activeRegistry, currentSeed(), {
        localeCode,
        query,
        filters,
        translationTasks: readTranslationLedger(translationLedgerPath || undefined),
      });
      recordEvent({ type: "search", path: url.pathname, locale: localeCode, query, filters });
      return json(200, result);
    }

    if (request.method === "GET") {
      const normalized = url.pathname.replace(/\/$/, "");
      const searchLocale = activeRegistry.locales.find(
        (locale) => locale.route_segments?.search && `/${locale.code}/${locale.route_segments.search}` === normalized,
      );
      if (searchLocale) {
        const query = url.searchParams.get("q") || "";
        const filters = searchFiltersFromParams(url.searchParams);
        recordEvent({ type: "search", path: url.pathname, locale: searchLocale.code, query, filters });
        return publicResponse(
          request,
          url,
          searchRuntimeListings(activeRegistry, currentSeed(), {
            localeCode: searchLocale.code,
            query,
            filters,
            translationTasks: readTranslationLedger(translationLedgerPath || undefined),
          }),
        );
      }
    }

    if (request.method === "GET" && url.pathname === "/api/admin/leads") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const requestedLocale = url.searchParams.get("locale") || "en";
      const payload = renderAdminLeadsPayload(activeRegistry, requestedLocale, {
        leads: readLeadLedger(leadLedgerPath || undefined),
        replies: readReplyOutbox(replyOutboxPath || undefined),
        languageRequests: readLanguageRequests(languageRequestPath || undefined),
        translationTasks: latestTranslationTasks(readTranslationLedger(translationLedgerPath || undefined)),
        listingEdits: readListingEdits(listingEditLedgerPath || undefined),
        leadSlaGeneratedAt,
        viewings: readViewings(viewingLedgerPath || undefined),
        savedSearches: readSavedSearches(savedSearchLedgerPath || undefined),
        sellerPipeline: readSellerPipeline(sellerPipelinePath || undefined),
        deals: readDeals(dealLedgerPath || undefined),
        brokerContacts: readBrokerContacts(brokerContactLedgerPath || undefined),
      });
      if (wantsHtml(request, url)) return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      return adminJson(200, payload);
    }

    if (request.method === "GET" && url.pathname === "/admin/leads") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminResponse(
        200,
        adminHtml(
          renderAdminLeadsPayload(activeRegistry, url.searchParams.get("locale") || "en", {
            leads: readLeadLedger(leadLedgerPath || undefined),
            replies: readReplyOutbox(replyOutboxPath || undefined),
            languageRequests: readLanguageRequests(languageRequestPath || undefined),
            translationTasks: latestTranslationTasks(readTranslationLedger(translationLedgerPath || undefined)),
            listingEdits: readListingEdits(listingEditLedgerPath || undefined),
            leadSlaGeneratedAt,
            viewings: readViewings(viewingLedgerPath || undefined),
            savedSearches: readSavedSearches(savedSearchLedgerPath || undefined),
            sellerPipeline: readSellerPipeline(sellerPipelinePath || undefined),
            deals: readDeals(dealLedgerPath || undefined),
            brokerContacts: readBrokerContacts(brokerContactLedgerPath || undefined),
          }),
        ),
        "text/html; charset=utf-8",
      );
    }

    if (request.method === "GET" && url.pathname === "/api/admin/viewings.ics") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminResponse(
        200,
        renderViewingCalendar(readViewings(viewingLedgerPath || undefined), { now: bookedAt || receivedAt }),
        "text/calendar; charset=utf-8",
        { "content-disposition": "attachment; filename=\"ms-realty-viewings.ics\"" },
      );
    }

    if (request.method === "GET" && url.pathname === "/api/admin/locales") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const requestedLocale = url.searchParams.get("locale") || "en";
      return adminJson(200, {
        workspace: renderAdminWorkspace({ registry: activeRegistry, requestedLocale }),
        locales: activeRegistry.locales,
      });
    }

    if (request.method === "GET" && url.pathname === "/api/admin/cms-collections") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminJson(200, { kind: "admin_cms_collections", ...loadCmsCollections() });
    }

    if (request.method === "GET" && url.pathname === "/api/admin/payload-collections") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminJson(200, { kind: "admin_payload_collections", ...loadPayloadCollections() });
    }

    if (request.method === "GET" && url.pathname === "/admin/listings/edit") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        return adminResponse(
          200,
          adminHtml(
            renderAdminListingEditorPayload(
              activeRegistry,
              url.searchParams.get("locale") || "en",
              currentSeed(),
              url.searchParams.get("listingId"),
              readListingEdits(listingEditLedgerPath || undefined),
              latestTranslationTasks(readTranslationLedger(translationLedgerPath || undefined)),
            ),
          ),
          "text/html; charset=utf-8",
        );
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "GET" && url.pathname === "/admin/migration/review") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = renderMigrationReviewPayload(
        activeRegistry,
        url.searchParams.get("locale") || "en",
        migrationReviewDashboard,
        routeMap,
        readRedirectApprovals(redirectApprovalPath || undefined),
        currentSeoEvidence(),
        currentSeed(),
        listingQualityGeneratedAt,
      );
      return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
    }

    if (request.method === "GET" && url.pathname === "/api/admin/migration/review") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const requestedLocale = url.searchParams.get("locale") || "en";
      const approvals = readRedirectApprovals(redirectApprovalPath || undefined);
      const payload = renderMigrationReviewPayload(
        activeRegistry,
        requestedLocale,
        migrationReviewDashboard,
        routeMap,
        approvals,
        currentSeoEvidence(),
        currentSeed(),
        listingQualityGeneratedAt,
      );
      if (wantsHtml(request, url)) return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      return adminJson(200, payload);
    }

    if (request.method === "GET" && url.pathname === "/api/admin/seo-evidence") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminJson(200, seoEvidencePayload(currentSeoEvidence()));
    }

    if (request.method === "GET" && url.pathname === "/api/admin/launch-readiness") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminJson(200, currentLaunchReadiness());
    }

    if (request.method === "GET" && url.pathname === "/api/admin/launch-input-checklist") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminResponse(200, currentLaunchInputChecklist(), "text/markdown; charset=utf-8");
    }

    if (request.method === "GET" && url.pathname === "/api/admin/preflight-reports") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminJson(200, currentPreflightReports());
    }

    if (request.method === "GET" && url.pathname === "/api/admin/live-service-report-template") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const template = readLiveServiceReportTemplate(url.searchParams.get("source"));
        return adminResponse(200, template.json, "application/json; charset=utf-8", {
          "content-disposition": `attachment; filename="${template.filename}"`,
        });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/live-service-reports/import") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = liveServiceReportInput(request, url);
        const imported = writeLiveServiceReport(input.source, input.report, {
          syncReportPath: searchSyncReportPath || undefined,
          queryReportPath: searchQueryReportPath || undefined,
          hermesReportPath: hermesWorkerReportPath || undefined,
        });
        const livePreflight = buildLiveServicePreflightReport({
          generatedAt: reviewedAt || new Date().toISOString(),
          syncReportPath: searchSyncReportPath || undefined,
          queryReportPath: searchQueryReportPath || undefined,
          hermesReportPath: hermesWorkerReportPath || undefined,
        });
        recordAudit({
          action: "live_service_report_imported",
          actor: "operations",
          objectType: "live_service_report",
          objectId: input.source,
          metadata: { status: input.report?.status, out_path: imported.outPath },
        });
        return adminJson(201, { imported, livePreflight, report: currentLaunchReadiness() });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/launch-readiness/export") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const report = currentLaunchReadiness();
      const outPath = writeLaunchReadinessReport(report, launchReadinessOutputPath || undefined);
      recordAudit({
        action: "launch_readiness_exported",
        actor: "operations",
        objectType: "launch_readiness",
        objectId: "launch-readiness",
        metadata: { status: report.status, blockers: report.blockers },
      });
      return adminJson(201, { outPath, report });
    }

    if (request.method === "POST" && url.pathname === "/api/admin/seo-evidence/import") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = seoExportInput(request, url);
        const imported = writeExternalSeoExport(input.source, input.csv, { inputDir: seoEvidenceInputDir || undefined });
        const evidence = currentSeoEvidence();
        writeSeoEvidence(evidence, seoEvidenceOutputPath || undefined);
        recordAudit({
          action: "seo_evidence_imported",
          actor: "seo_editor",
          objectType: "seo_evidence",
          objectId: input.source,
          metadata: {
            row_count: imported.row_count,
            missing_required_sources: evidence.summary.missing_required_sources,
          },
        });
        return adminJson(201, {
          imported,
          ...seoEvidencePayload(evidence),
        });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/admin/seo-evidence/template") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const template = readSeoExportTemplate(url.searchParams.get("source"));
        return adminResponse(200, template.csv, "text/csv; charset=utf-8", {
          "content-disposition": `attachment; filename="${template.filename}"`,
        });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/redirect-approvals") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = redirectApprovalInput(request);
        const approval = appendRedirectApproval(routeMap, input, {
          filePath: redirectApprovalPath || undefined,
          approvedAt: reviewedAt,
        });
        const approvals = readRedirectApprovals(redirectApprovalPath || undefined);
        recordAudit({
          action: "redirect_approval_created",
          actor: approval.reviewer,
          objectType: "redirect",
          objectId: approval.old_url,
          locale: approval.target_locale,
          metadata: { target_path: approval.target_path, status: approval.status, deployable: approval.deployable },
        });
        return adminJson(201, {
          approval,
          deployablePreview: buildDeployableRedirects(routeMap, approvals),
        });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/redirect-approvals/import") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const imported = importRedirectApprovalsCsv(routeMap, csvInput(request), {
          filePath: redirectApprovalPath || undefined,
          approvedAt: reviewedAt,
        });
        const approvals = readRedirectApprovals(redirectApprovalPath || undefined);
        recordAudit({
          action: "redirect_approvals_imported",
          actor: "seo_editor",
          objectType: "redirect_import",
          objectId: `redirect-import-${imported.length}`,
          metadata: { imported: imported.length },
        });
        return adminJson(201, {
          imported: imported.length,
          approvals: imported,
          deployablePreview: buildDeployableRedirects(routeMap, approvals),
        });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/deployable-redirects/export") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const rows = buildDeployableRedirects(routeMap, readRedirectApprovals(redirectApprovalPath || undefined));
        const written = writeDeployableRedirects(rows, deployableRedirectOutputPath || undefined);
        recordAudit({
          action: "deployable_redirects_exported",
          actor: "seo_editor",
          objectType: "redirect_export",
          objectId: "deployable-redirects",
          metadata: { exported: rows.length, total: written.summary?.total },
        });
        return adminJson(201, { exported: rows.length, ...written });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/admin/redirect-approval-workbook") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const rows = url.searchParams.get("pending")
        ? buildPendingRedirectApprovalWorkbook(routeMap, readRedirectApprovals(redirectApprovalPath || undefined))
        : buildRedirectApprovalWorkbook(routeMap);
      return adminResponse(
        200,
        renderRedirectApprovalWorkbook(rows),
        "text/csv; charset=utf-8",
        { "content-disposition": 'attachment; filename="redirect-approval-workbook.csv"' },
      );
    }

    if (request.method === "GET" && url.pathname === "/api/admin/listing-quality-workbook") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminResponse(
        200,
        renderListingQualityWorkbook(buildListingQualityReport({ seed: currentSeed() })),
        "text/csv; charset=utf-8",
        { "content-disposition": 'attachment; filename="listing-quality-workbook.csv"' },
      );
    }

    if (request.method === "POST" && url.pathname === "/api/admin/listing-quality/import") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const inputCsv = csvInput(request);
        const review = validateListingQualityReviewCsv(buildListingQualityReport({ seed: currentSeed() }), inputCsv);
        let reviewPath = null;
        let reviewPersistenceError = "";
        if (review.summary.missing_review_rows === 0) {
          try {
            reviewPath = writeCompleteListingQualityReviewCsv(
              JSON.parse(fs.readFileSync(DEFAULT_LISTING_QUALITY_REPORT, "utf8")),
              inputCsv,
              listingQualityReviewPath || undefined,
            );
          } catch (error) {
            reviewPersistenceError = error.message;
          }
        }
        const translationTasks = latestTranslationTasks(readTranslationLedger(translationLedgerPath || undefined));
        const edits = review.reviews
          .filter((row) => Object.keys(row.patch).length || row.media_reviewer)
          .map((row) => {
            const result = createListingEdit(
              currentSeed(),
              {
                id: `listing-quality-${row.listing_id}`,
                listingId: row.listing_id,
                editor: row.editor,
                patch: row.patch,
                mediaReviewer: row.media_reviewer,
              },
              translationTasks,
              editedAt,
            );
            const edit = appendListingEdit(
              {
                ...result.edit,
                review_source: "listing_quality_csv",
                media_reviewer: row.media_reviewer || undefined,
                review_notes: row.review_notes || undefined,
              },
              { filePath: listingEditLedgerPath || undefined },
            );
            const persistedStaleTranslations = result.staleTranslations
              .filter((translation) => translation.id)
              .map((translation) => appendTranslationTask(translation, { filePath: translationLedgerPath || undefined }));
            return { edit, staleTranslations: result.staleTranslations, persistedStaleTranslations };
          });
        recordAudit({
          action: "listing_quality_imported",
          actor: "listing_quality_editor",
          objectType: "listing_quality_review",
          objectId: `listing-quality-${review.summary.review_rows}`,
          metadata: {
            imported: review.summary.review_rows,
            edited: edits.length,
            media_review_rows: review.summary.media_review_rows,
            review_persisted: Boolean(reviewPath),
          },
        });
        return adminJson(201, {
          imported: review.summary.review_rows,
          edited: edits.length,
          mediaReviewRows: review.summary.media_review_rows,
          reviewPersisted: Boolean(reviewPath),
          reviewPath,
          reviewPersistenceError,
          edits,
        });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/locales") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = parseJsonBody(request);
        const result = addLocaleToRegistry(activeRegistry, input);
        activeRegistry = result.registry;
        if (localeRegistryPath) writeLocaleRegistry(activeRegistry, localeRegistryPath);
        recordAudit({
          action: "locale_created",
          actor: input.reviewer || "admin",
          objectType: "locale",
          objectId: result.locale.code,
          locale: result.locale.code,
          metadata: {
            public_enabled: result.locale.public_enabled,
            indexable: result.locale.indexable,
            fallback_locale: result.locale.fallback_locale,
          },
        });
        return adminJson(201, {
          locale: result.locale,
          required_admin_locales: requiredAdminLocales(activeRegistry),
          admin_locales: activeRegistry.admin_locales,
          required_public_locales: requiredPublicLocales(activeRegistry),
          website_language_coverage: websiteLanguageCoverage(activeRegistry),
          public_indexable_locales: activeRegistry.locales
            .filter((locale) => locale.public_enabled && locale.indexable)
            .map((locale) => locale.code),
        });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/translations/draft") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = parseJsonBody(request);
        const task = appendTranslationTask(createTranslationReviewTask(activeRegistry, input), { filePath: translationLedgerPath || undefined });
        recordAudit({
          action: "translation_drafted",
          actor: input.reviewer || "translation_editor",
          objectType: task.object_type,
          objectId: task.id,
          locale: task.target_locale,
          metadata: { object_id: task.object_id, status: task.status, public_indexable: task.public_indexable },
        });
        return adminJson(201, task);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/translations/publish") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = parseJsonBody(request);
        const task = latestTranslationTasks(readTranslationLedger(translationLedgerPath || undefined)).find((row) => row.id === input.taskId);
        if (!task) throw new Error("Known translation task is required");
        const published = publishApprovedTranslation(activeRegistry, approveTranslationTask(activeRegistry, task, input.reviewer, input.approvedAt));
        const persisted = appendTranslationTask(published, { filePath: translationLedgerPath || undefined });
        recordAudit({
          action: "translation_published",
          actor: persisted.reviewer,
          objectType: persisted.object_type,
          objectId: persisted.id,
          locale: persisted.target_locale,
          metadata: { object_id: persisted.object_id, status: persisted.status, public_indexable: persisted.public_indexable },
        });
        return adminJson(201, persisted);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/listings/edit") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = listingEditInput(request);
        const result = createListingEdit(currentSeed(), input, latestTranslationTasks(readTranslationLedger(translationLedgerPath || undefined)), editedAt);
        const edit = appendListingEdit(result.edit, { filePath: listingEditLedgerPath || undefined });
        const persistedStaleTranslations = result.staleTranslations
          .filter((translation) => translation.id)
          .map((translation) => appendTranslationTask(translation, { filePath: translationLedgerPath || undefined }));
        recordAudit({
          action: "listing_edited",
          actor: edit.editor,
          objectType: "listing",
          objectId: edit.listing_id,
          metadata: {
            changed_fields: Object.keys(edit.patch || {}),
            media_reviewer: edit.media_reviewer || null,
            stale_translation_count: result.staleTranslations.length,
          },
        });
        return adminJson(201, { edit, staleTranslations: result.staleTranslations, persistedStaleTranslations });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/listings/slug") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const change = appendSlugChange(activeRegistry, currentSeed(), parseBody(request), {
          filePath: slugHistoryPath || undefined,
          changedAt: slugChangedAt || editedAt,
        });
        recordAudit({
          action: "listing_slug_changed",
          actor: change.changed_by,
          objectType: "listing_slug",
          objectId: change.id,
          locale: change.locale,
          metadata: { listing_id: change.listing_id, old_path: change.old_path, new_path: change.new_path, status: change.status },
        });
        return adminJson(201, change);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/replies") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = reviewedReplyInput(request);
        const reply = appendReviewedReply(readLeadLedger(leadLedgerPath || undefined), input, {
          filePath: replyOutboxPath || undefined,
          reviewedAt,
        });
        recordAudit({
          action: "reply_approved",
          actor: reply.reviewer,
          objectType: "reply",
          objectId: reply.id,
          locale: reply.reply_language,
          metadata: { lead_id: reply.lead_id, hermes_draft_used: reply.hermes_draft_used, status: reply.status },
        });
        return adminJson(201, reply);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/viewings") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = parseJsonBody(request);
        const viewing = appendViewing(readLeadLedger(leadLedgerPath || undefined), input, {
          filePath: viewingLedgerPath || undefined,
          bookedAt,
        });
        recordAudit({
          action: "viewing_booked",
          actor: viewing.broker,
          objectType: "viewing",
          objectId: viewing.id,
          locale: viewing.original_language,
          metadata: { lead_id: viewing.lead_id, listing_reference: viewing.listing_reference, status: viewing.status },
        });
        return adminJson(201, viewing);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/deals/close") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const deal = appendClosedDeal(readLeadLedger(leadLedgerPath || undefined), parseJsonBody(request), {
          filePath: dealLedgerPath || undefined,
          closedAt: dealClosedAt,
        });
        recordAudit({
          action: "deal_closed",
          actor: deal.broker,
          objectType: "deal",
          objectId: deal.id,
          locale: deal.original_language,
          metadata: { lead_id: deal.lead_id, listing_reference: deal.listing_reference, status: deal.status },
        });
        return adminJson(201, deal);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/broker-contacts") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const contact = createBrokerContact(parseJsonBody(request), { reviewedAt });
        const persisted = appendBrokerContact(contact, { filePath: brokerContactLedgerPath || undefined });
        recordAudit({
          action: "broker_contact_approved",
          actor: persisted.reviewer,
          objectType: "broker_contact",
          objectId: persisted.id,
          metadata: { listing_id: persisted.listing_id, broker: persisted.broker, channels: Object.keys(persisted.channels || {}) },
        });
        return adminJson(201, persisted);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/tours/approve") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const tour = appendTourApproval(createTourApproval(seed, parseBody(request), reviewedAt), {
          filePath: tourApprovalLedgerPath || undefined,
        });
        recordAudit({
          action: "tour_approved",
          actor: tour.reviewer,
          objectType: "listing_tour",
          objectId: tour.id,
          metadata: { listing_id: tour.listing_id, provider: tour.provider, is_public: tour.is_public },
        });
        return adminJson(201, tour);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/leads") {
      try {
        const input = parseJsonBody(request);
        const lead = submitRuntimeLead(activeRegistry, currentSeed(), input);
        const ledger = leadLedgerPath ? appendLead(lead, { filePath: leadLedgerPath, receivedAt }) : null;
        const consent = recordConsent({
          consentType: "inquiry_follow_up",
          source: lead.lead?.source,
          subjectId: lead.lead?.id,
          locale: lead.original_language,
          contact: lead.lead?.contact,
          marketingOptIn: input.marketingOptIn === true,
        });
        const sellerPipeline =
          sellerPipelinePath && lead.lead?.leadType === "seller"
            ? appendSellerPipeline(createSellerPipelineItem(lead, { createdAt: sellerPipelineCreatedAt }), {
                filePath: sellerPipelinePath,
              })
            : null;
        recordEvent({
          type: "lead_submitted",
          path: "/api/leads",
          locale: lead.original_language,
          listingReference: lead.lead?.listingReference,
          action: lead.lead?.source,
        });
        return privateJson(201, { ...lead, ledger, consent, sellerPipeline });
      } catch (error) {
        return privateJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/events") {
      try {
        const event = createEvent(parseBody(request), receivedAt || new Date().toISOString());
        const ledger = eventLedgerPath ? appendEvent(event, { filePath: eventLedgerPath }) : null;
        return json(201, { ...event, ledger });
      } catch (error) {
        return json(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/language-requests") {
      try {
        const input = parseJsonBody(request);
        const requestRow = createLanguageRequest(activeRegistry, input, requestedAt);
        const ledger = languageRequestPath ? appendLanguageRequest(requestRow, { filePath: languageRequestPath }) : null;
        const consent = recordConsent({
          consentType: "language_request",
          source: "website_language_request",
          subjectId: requestRow.id,
          locale: requestRow.requested_locale,
          contact: requestRow.contact,
          marketingOptIn: input.marketingOptIn === true,
        });
        return privateJson(201, { ...requestRow, ledger, consent });
      } catch (error) {
        return privateJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/saved-searches") {
      try {
        const input = parseJsonBody(request);
        const filters = searchFiltersFromObject(input.filters);
        const search = searchRuntimeListings(activeRegistry, currentSeed(), {
          localeCode: input.locale || activeRegistry.source_locale,
          query: input.query || "",
          filters,
          translationTasks: readTranslationLedger(translationLedgerPath || undefined),
        });
        const priceSnapshot = Object.fromEntries(
          search.cards.map((card) => [card.id, Number(card.price_eur)]).filter(([, price]) => Number.isFinite(price)),
        );
        const savedSearch = createSavedSearch(activeRegistry, { ...input, filters, priceSnapshot }, { matchCount: search.search.total_matches, savedAt });
        const ledger = savedSearchLedgerPath ? appendSavedSearch(savedSearch, { filePath: savedSearchLedgerPath }) : null;
        const consent = recordConsent({
          consentType: "saved_search_alerts",
          source: "website_saved_search",
          subjectId: savedSearch.id,
          locale: savedSearch.requested_locale,
          contact: savedSearch.contact,
          legalBasis: "consent",
          marketingOptIn: input.marketingOptIn === true,
        });
        return privateJson(201, { ...savedSearch, ledger, consent });
      } catch (error) {
        return privateJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/hermes/chat") {
      try {
        const input = parseJsonBody(request);
        const filters = searchFiltersFromObject(input.filters);
        const chat = buildHermesPublicChat(activeRegistry, currentSeed(), { ...input, filters }, {
          translationTasks: readTranslationLedger(translationLedgerPath || undefined),
        });
        recordEvent({
          type: "hermes_chat",
          path: "/api/hermes/chat",
          locale: chat.requested_locale,
          query: chat.query,
          filters: { result_count: chat.citations.length, fallback_used: chat.fallback_used },
        });
        return privateJson(200, chat);
      } catch (error) {
        return privateJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method !== "GET") return json(405, { kind: "method_not_allowed" });

    const rendered = renderRuntimePath(
      activeRegistry,
      currentSeed(),
      url.pathname,
      readTranslationLedger(translationLedgerPath || undefined),
      readBrokerContacts(brokerContactLedgerPath || undefined),
      readTourApprovals(tourApprovalLedgerPath || undefined),
    );
    if (rendered.status === 200) {
      recordEvent({
        type: "page_view",
        path: rendered.path || url.pathname,
        locale: rendered.locale,
        listingReference: rendered.body?.facts?.id,
      });
    }
    return publicResponse(request, url, rendered);
  };
}

export async function dispatchHttp(app, { method = "GET", url, body, headers } = {}) {
  return app({ method, url, headers, body: typeof body === "string" ? body : body ? JSON.stringify(body) : "" });
}

export function assertHttpSmoke(smoke) {
  const expectedBlockers = ["external_seo_exports", "listing_quality_review", "live_services", "payload_runtime"];
  if (
    smoke.health?.status !== 200 ||
    smoke.health.body.status !== "ok" ||
    JSON.stringify(smoke.health.body.blockers) !== JSON.stringify(expectedBlockers) ||
    smoke.health.headers["x-content-type-options"] !== "nosniff" ||
    smoke.health.headers["x-frame-options"] !== "DENY"
  ) {
    throw new Error("HTTP smoke must expose liveness without hiding launch blockers");
  }
  if (
    smoke.ready?.status !== 503 ||
    smoke.ready.body.status !== "blocked" ||
    JSON.stringify(smoke.ready.body.blockers) !== JSON.stringify(expectedBlockers) ||
    JSON.stringify((smoke.ready.body.blocked_gates || []).map((gate) => gate.id)) !== JSON.stringify(expectedBlockers) ||
    smoke.ready.headers["cache-control"] !== "no-store" ||
    smoke.ready.headers["retry-after"] !== "60"
  ) {
    throw new Error("HTTP smoke must fail readiness with public launch gate details while blockers remain");
  }
  if (smoke.legacyRedirect.status !== 301 || smoke.legacyRedirect.headers.location !== "/bg/imoti/MS-CRAWL-0001") {
    throw new Error("HTTP smoke must serve approved legacy redirect");
  }
  if (
    smoke.slugChange?.status !== 201 ||
    smoke.slugChange.body.status !== 301 ||
    smoke.slugChange.body.old_path !== "/he/properties/old-sandanski-slug" ||
    smoke.slugChange.body.new_path !== "/he/properties/MS-CRAWL-0001" ||
    smoke.slugRedirect?.status !== 301 ||
    smoke.slugRedirect.headers.location !== "/he/properties/MS-CRAWL-0001"
  ) {
    throw new Error("HTTP smoke must create path-only slug-change 301 redirects");
  }
  if (
    smoke.home.status !== 200 ||
    smoke.home.body.kind !== "home" ||
    smoke.home.body.body.search.path !== "/he/search" ||
    smoke.home.body.body.seller.path !== "/he/sell"
  ) {
    throw new Error("HTTP smoke must serve locale homepage with search and seller paths");
  }
  if (smoke.listing.status !== 200 || smoke.listing.body.dir !== "rtl") {
    throw new Error("HTTP smoke must serve Hebrew listing as RTL 200");
  }
  if (
    smoke.listing.body.body.actions?.primary?.find((action) => action.id === "callback")?.payload.source !==
      "website_callback_request" ||
    smoke.listing.body.body.actions?.direct_contact?.review_status !== "needs_broker_contact_review" ||
    smoke.listing.body.body.actions?.secondary?.find((action) => action.id === "print")?.pdf_status !== "browser_print_ready"
  ) {
    throw new Error("HTTP smoke must expose listing conversion actions without inventing broker contact data");
  }
  if (smoke.brokerContact?.status !== 201 || smoke.brokerContact.body.channels?.phone !== "tel:+359880000000") {
    throw new Error("HTTP smoke must approve broker contact data");
  }
  if (
    smoke.listingAfterBrokerContact?.status !== 200 ||
    smoke.listingAfterBrokerContact.body.body.actions.direct_contact.review_status !== "approved_broker_contact" ||
    !smoke.listingAfterBrokerContact.body.body.actions.direct_contact.channels.every((channel) => channel.enabled && channel.href)
  ) {
    throw new Error("HTTP smoke must expose approved direct contact links");
  }
  if (smoke.tourApproval?.status !== 201 || smoke.tourApproval.body.is_public !== true) {
    throw new Error("HTTP smoke must approve reviewed 360 tour media");
  }
  if (
    smoke.listingAfterTourApproval?.status !== 200 ||
    smoke.listingAfterTourApproval.body.body.media.tour.available !== true ||
    smoke.listingAfterTourApproval.body.body.media.tour.mount_target !== "psv-listing-tour"
  ) {
    throw new Error("HTTP smoke must expose approved public 360 tour");
  }
  if (smoke.search.status !== 200 || smoke.search.body.mobile_policy.list_first_mobile !== true) {
    throw new Error("HTTP smoke must serve mobile-first search");
  }
  if (smoke.search.body.search.total_matches <= smoke.search.body.cards.length) {
    throw new Error("HTTP smoke must filter search before paginating cards");
  }
  if (
    smoke.location.status !== 200 ||
    smoke.location.body.kind !== "location" ||
    smoke.location.body.body.location !== "Sandanski" ||
    smoke.location.body.cards.some((card) => card.translation_indexable !== true)
  ) {
    throw new Error("HTTP smoke must serve reviewed location inventory pages");
  }
  if (
    smoke.searchFiltered.status !== 200 ||
    smoke.searchFiltered.body.search.filters.property_type !== "apartment" ||
    !smoke.searchFiltered.body.cards.every((card) => card.property_type === "apartment")
  ) {
    throw new Error("HTTP smoke must apply search query-string filters");
  }
  if (smoke.lead.status !== 201 || smoke.lead.body.admin_locale !== "en") {
    throw new Error("HTTP smoke must accept Hebrew lead into EN admin queue");
  }
  if (smoke.lead.body.contact_preference !== "whatsapp") {
    throw new Error("HTTP smoke must preserve lead contact preference");
  }
  if (
    smoke.lead.body.broker_assignment?.broker_id !== "broker_international" ||
    smoke.lead.body.broker_assignment?.criteria?.location !== "Sandanski"
  ) {
    throw new Error("HTTP smoke must assign listing leads by language and listing facts");
  }
  if (
    smoke.viewingLead.status !== 201 ||
    smoke.viewingLead.body.lead.source !== "website_viewing_request" ||
    smoke.viewingLead.body.contact_preference !== "phone" ||
    smoke.viewingLead.body.broker_assignment?.broker_id !== "broker_international" ||
    smoke.viewingLead.body.hermes_reply_draft.broker_approval_required !== true
  ) {
    throw new Error("HTTP smoke must accept public viewing request leads into the gated CRM flow");
  }
  if (smoke.sellerLead.status !== 201 || smoke.sellerLead.body.lead.leadType !== "seller") {
    throw new Error("HTTP smoke must accept seller valuation lead");
  }
  if (smoke.sellerLead.body.sellerPipeline?.stage !== "valuation_requested") {
    throw new Error("HTTP smoke must create seller valuation pipeline row");
  }
  if (
    smoke.contact?.status !== 200 ||
    smoke.contact.body.kind !== "contact" ||
    smoke.contact.body.body.callback.payload.source !== "website_contact_callback"
  ) {
    throw new Error("HTTP smoke must serve generic contact callback page");
  }
  if (
    smoke.contactLead?.status !== 201 ||
    smoke.contactLead.body.lead.source !== "website_contact_callback" ||
    smoke.contactLead.body.lead.leadType !== "general" ||
    smoke.contactLead.body.contact_preference !== "phone" ||
    smoke.contactLead.body.hermes_reply_draft.broker_approval_required !== true
  ) {
    throw new Error("HTTP smoke must accept contact callback leads into the gated CRM flow");
  }
  if (
    smoke.guidePage?.status !== 200 ||
    smoke.guidePage.body.kind !== "guide" ||
    smoke.guidePage.body.indexable !== true ||
    !smoke.guidePage.body.body.sections?.some((section) =>
      section.facts.join(" ").includes("Non-EU buyers cannot own Bulgarian land directly"),
    ) ||
    !smoke.guideHtml?.body.includes("data-kind=\"guide\"")
  ) {
    throw new Error("HTTP smoke must serve approved CMS guide pages cited by Hermes");
  }
  if (smoke.fallback.status !== 200 || smoke.fallback.body.indexable !== false) {
    throw new Error("HTTP smoke must serve non-indexable fallback");
  }
  if (smoke.languageRequest.status !== 201 || smoke.languageRequest.body.public_indexable !== false) {
    throw new Error("HTTP smoke must store non-indexable language request");
  }
  if (smoke.savedSearch.status !== 201 || smoke.savedSearch.body.alert_task?.status !== "open") {
    throw new Error("HTTP smoke must store saved search alert tasks");
  }
  if (
    smoke.hermesChat?.status !== 200 ||
    smoke.hermesChat.body.kind !== "hermes_public_chat" ||
    smoke.hermesChat.body.mode !== "retrieval_only" ||
    smoke.hermesChat.body.can_publish !== false ||
    !smoke.hermesChat.body.disclosure.includes("approved MS Realty") ||
    !smoke.hermesChat.body.citations?.some((citation) => citation.path?.startsWith("/he/"))
  ) {
    throw new Error("HTTP smoke must answer public Hermes chat from approved listing sources only");
  }
  if (
    smoke.hermesProcessChat?.status !== 200 ||
    smoke.hermesProcessChat.body.citations?.[0]?.type !== "cms_page" ||
    !smoke.hermesProcessChat.body.answer.includes("Non-EU buyers cannot own Bulgarian land directly") ||
    smoke.hermesProcessChat.body.can_publish !== false
  ) {
    throw new Error("HTTP smoke must answer foreign-buyer process chat from approved CMS content only");
  }
  if (smoke.ctaClick && (smoke.ctaClick.status !== 201 || smoke.ctaClick.body.type !== "cta_click")) {
    throw new Error("HTTP smoke must accept privacy-safe CTA click events");
  }
  if (smoke.savedSearch.body.match_count <= 12) {
    throw new Error("HTTP smoke must store full saved-search match count");
  }
  if (smoke.savedSearch.body.filters?.unsupported_filter) {
    throw new Error("HTTP smoke must ignore unsupported saved-search filters");
  }
  if (
    smoke.localeCreate.status !== 201 ||
    smoke.localeCreate.body.locale.code !== "es" ||
    smoke.localeCreate.body.locale.indexable !== false ||
    JSON.stringify(smoke.localeCreate.body.admin_locales) !== JSON.stringify(["bg", "ru", "en"])
  ) {
    throw new Error("HTTP smoke must add non-indexable website locale without changing admin locales");
  }
  if (smoke.localeFallback.status !== 200 || smoke.localeFallback.body.locale !== "en" || smoke.localeFallback.body.indexable !== false) {
    throw new Error("HTTP smoke must keep new locale fallback non-indexable");
  }
  if (smoke.translationDraft.status !== 201 || smoke.translationDraft.body.public_indexable !== false) {
    throw new Error("HTTP smoke must store non-indexable Hermes translation draft");
  }
  if (smoke.translationPublish.status !== 201 || smoke.translationPublish.body.public_indexable !== true) {
    throw new Error("HTTP smoke must publish only human-approved translation");
  }
  if (
    smoke.listingEditorHtml?.status !== 200 ||
    smoke.listingEditorHtml.headers["content-type"] !== "text/html; charset=utf-8" ||
    !smoke.listingEditorHtml.body.includes("data-kind=\"admin-listing-editor\"") ||
    !smoke.listingEditorHtml.body.includes("data-listing-id=\"MS-CRAWL-0001\"") ||
    !smoke.listingEditorHtml.body.includes("data-editor-form=\"listing\"")
  ) {
    throw new Error("HTTP smoke must serve admin listing editor HTML");
  }
  if (smoke.listingEdit.status !== 201 || smoke.listingEdit.body.edit.stale_translation_count < 1) {
    throw new Error("HTTP smoke must stale dependent translations after listing edit");
  }
  if (smoke.staleListing.status !== 200 || smoke.staleListing.body.indexable !== false) {
    throw new Error("HTTP smoke must noindex stale public translation");
  }
  if (
    smoke.adminLocales?.bg?.status !== 200 ||
    smoke.adminLocales?.ru?.status !== 200 ||
    smoke.adminLocales?.en?.status !== 200 ||
    smoke.adminLocales?.heFallback?.status !== 200 ||
    smoke.adminLocales.bg.body.workspace.locale !== "bg" ||
    smoke.adminLocales.ru.body.workspace.locale !== "ru" ||
    smoke.adminLocales.en.body.workspace.locale !== "en" ||
    smoke.adminLocales.heFallback.body.workspace.locale !== "en" ||
    JSON.stringify(smoke.adminLocales.ru.body.workspace.interface_locales) !== JSON.stringify(["bg", "ru", "en"]) ||
    smoke.adminLocales.heFallback.body.locales.find((locale) => locale.code === "he")?.direction !== "rtl" ||
    smoke.adminLocales.heFallback.body.locales.find((locale) => locale.code === "el")?.public_enabled !== true
  ) {
    throw new Error("HTTP smoke must expose BG, RU, EN admin workspaces and Greek/Hebrew website locales");
  }
  const staleSearchCard = smoke.staleSearch.body.cards.find((card) => card.id === "MS-CRAWL-0001");
  if (
    smoke.staleSearch.status !== 200 ||
    staleSearchCard?.translation_display !== "stale_translation_fallback" ||
    staleSearchCard?.translation_indexable !== false
  ) {
    throw new Error("HTTP smoke must mark stale search cards as fallback");
  }
  if (smoke.sitemap.status !== 200 || smoke.sitemap.body.includes("/fr/")) throw new Error("HTTP smoke must serve approved sitemap");
  if (smoke.robots.status !== 200 || !smoke.robots.body.includes("Sitemap:")) throw new Error("HTTP smoke must serve robots");
  if (
    smoke.favicon?.status !== 200 ||
    smoke.favicon.headers["content-type"] !== "image/svg+xml; charset=utf-8" ||
    !smoke.favicon.body.includes("#DB3E3E")
  ) {
    throw new Error("HTTP smoke must serve MS Realty favicon");
  }
  if (
    smoke.homeHtml?.status !== 200 ||
    !smoke.homeHtml.body.includes("data-kind=\"home\"") ||
    !smoke.homeHtml.body.includes("role=\"search\"")
  ) {
    throw new Error("HTTP smoke must serve rendered homepage HTML");
  }
  if (
    smoke.listingHtml?.status !== 200 ||
    smoke.listingHtml.headers["content-type"] !== "text/html; charset=utf-8" ||
    !smoke.listingHtml.body.includes("<html lang=\"he\" dir=\"rtl\">") ||
    !smoke.listingHtml.body.includes("data-kind=\"listing\"") ||
    smoke.listingHtml.body.includes("tel:+359880000000")
  ) {
    throw new Error("HTTP smoke must serve rendered listing HTML without unapproved direct contact");
  }
  if (
    smoke.listingPrint?.status !== 200 ||
    smoke.listingPrint.headers["content-type"] !== "text/html; charset=utf-8" ||
    !smoke.listingPrint.body.includes("data-kind=\"listing-print\"") ||
    !smoke.listingPrint.body.includes("data-print-status=\"browser-pdf-ready\"") ||
    smoke.listingPrint.body.includes("tel:+359880000000")
  ) {
    throw new Error("HTTP smoke must serve browser-print listing HTML without unapproved direct contact");
  }
  if (
    smoke.searchHtml?.status !== 200 ||
    !smoke.searchHtml.body.includes("data-kind=\"search\"") ||
    !smoke.searchHtml.body.includes("data-total-matches=")
  ) {
    throw new Error("HTTP smoke must serve rendered search HTML");
  }
  if (smoke.locationHtml?.status !== 200 || !smoke.locationHtml.body.includes("data-kind=\"location\"")) {
    throw new Error("HTTP smoke must serve rendered location HTML");
  }
  if (
    smoke.sellerPage?.status !== 200 ||
    smoke.sellerPage.body.body.valuation.payload.source !== "website_seller_valuation" ||
    smoke.sellerPage.body.dir !== "rtl"
  ) {
    throw new Error("HTTP smoke must serve seller valuation page");
  }
  if (smoke.sellerHtml?.status !== 200 || !smoke.sellerHtml.body.includes("data-lead-type=\"seller\"")) {
    throw new Error("HTTP smoke must serve rendered seller valuation HTML");
  }
  if (
    smoke.contactHtml?.status !== 200 ||
    !smoke.contactHtml.body.includes("data-kind=\"contact\"") ||
    !smoke.contactHtml.body.includes("data-lead-type=\"general\"")
  ) {
    throw new Error("HTTP smoke must serve rendered contact callback HTML");
  }
  if (smoke.admin.status !== 200 || smoke.admin.body.workspace.locale !== "ru") throw new Error("HTTP smoke must serve RU admin leads");
  if (smoke.admin.body.leads.length < 4) throw new Error("HTTP smoke must show buyer, viewing, contact, and seller leads");
  if (
    smoke.adminHtml?.status !== 200 ||
    smoke.adminHtml.headers["content-type"] !== "text/html; charset=utf-8" ||
    !smoke.adminHtml.body.includes("<html lang=\"ru\" dir=\"ltr\">") ||
    !smoke.adminHtml.body.includes("data-kind=\"admin-lead-inbox\"") ||
    !smoke.adminHtml.body.includes("data-interface-locales=\"bg,ru,en\"") ||
    !smoke.adminHtml.body.includes("data-lead-row=\"true\"")
  ) {
    throw new Error("HTTP smoke must serve RU admin lead inbox HTML");
  }
  if (
    smoke.adminMigrationReview?.status !== 200 ||
    smoke.adminMigrationReview.body.workspace.locale !== "bg" ||
    smoke.adminMigrationReview.body.dashboard.media_reconciliation.media_rows !== 11859 ||
    smoke.adminMigrationReview.body.routeMap.total !== 457 ||
    smoke.adminMigrationReview.body.routeMap.mappedListings !== 165 ||
    smoke.adminMigrationReview.body.listingQuality.summary.affected_listings < 1 ||
    smoke.adminMigrationReview.body.launchInputChecklistEndpoint !== "/api/admin/launch-input-checklist" ||
    smoke.adminMigrationReview.body.cmsCollectionsEndpoint !== "/api/admin/cms-collections" ||
    smoke.adminMigrationReview.body.payloadCollectionsEndpoint !== "/api/admin/payload-collections" ||
    smoke.adminMigrationReview.body.routeMap.approvableSample?.length < 1
  ) {
    throw new Error("HTTP smoke must serve admin migration review workbench contract");
  }
  if (
    smoke.adminMigrationReviewHtml?.status !== 200 ||
    smoke.adminMigrationReviewHtml.headers["content-type"] !== "text/html; charset=utf-8" ||
    !smoke.adminMigrationReviewHtml.body.includes("data-kind=\"admin-migration-review\"") ||
    !smoke.adminMigrationReviewHtml.body.includes("data-approvable-listing=\"true\"") ||
    !smoke.adminMigrationReviewHtml.body.includes("data-redirect-import-endpoint=\"/api/admin/redirect-approvals/import\"") ||
    !smoke.adminMigrationReviewHtml.body.includes("data-redirect-export-endpoint=\"/api/admin/deployable-redirects/export\"") ||
    !smoke.adminMigrationReviewHtml.body.includes("data-redirect-workbook-endpoint=\"/api/admin/redirect-approval-workbook\"") ||
    !smoke.adminMigrationReviewHtml.body.includes("data-pending-redirect-workbook-endpoint=\"/api/admin/redirect-approval-workbook?pending=1\"") ||
    !smoke.adminMigrationReviewHtml.body.includes("data-seo-import-endpoint=\"/api/admin/seo-evidence/import\"") ||
    !smoke.adminMigrationReviewHtml.body.includes("data-seo-template-endpoint=\"/api/admin/seo-evidence/template\"") ||
    !smoke.adminMigrationReviewHtml.body.includes("data-launch-readiness-endpoint=\"/api/admin/launch-readiness\"") ||
    !smoke.adminMigrationReviewHtml.body.includes("data-launch-readiness-export-endpoint=\"/api/admin/launch-readiness/export\"") ||
    !smoke.adminMigrationReviewHtml.body.includes("data-cms-collections-endpoint=\"/api/admin/cms-collections\"") ||
    !smoke.adminMigrationReviewHtml.body.includes("data-payload-collections-endpoint=\"/api/admin/payload-collections\"") ||
    !smoke.adminMigrationReviewHtml.body.includes("data-launch-input-checklist-endpoint=\"/api/admin/launch-input-checklist\"") ||
    !smoke.adminMigrationReviewHtml.body.includes("data-quality-workbook-endpoint=\"/api/admin/listing-quality-workbook\"") ||
    !smoke.adminMigrationReviewHtml.body.includes("data-quality-listing=\"true\"")
  ) {
    throw new Error("HTTP smoke must serve admin migration review HTML");
  }
  if (smoke.adminUnauthorized.status !== 401) throw new Error("HTTP smoke must reject unauthenticated admin leads");
  if (smoke.reply.status !== 201 || smoke.reply.body.status !== "queued_for_manual_send") {
    throw new Error("HTTP smoke must queue broker-approved replies");
  }
  if (smoke.formReply?.status !== 201 || smoke.formReply.body.status !== "queued_for_manual_send") {
    throw new Error("HTTP smoke must queue form-encoded broker-approved replies");
  }
  if (smoke.replyUnauthorized.status !== 401) throw new Error("HTTP smoke must reject unauthenticated replies");
  if (
    smoke.viewing.status !== 201 ||
    smoke.viewing.body.follow_up_task?.status !== "open" ||
    smoke.viewing.body.feedback_request?.status !== "open"
  ) {
    throw new Error("HTTP smoke must book viewing follow-up and feedback tasks");
  }
  if (smoke.viewingUnauthorized.status !== 401) throw new Error("HTTP smoke must reject unauthenticated viewings");
  if (
    smoke.dealClose?.status !== 201 ||
    smoke.dealClose.body.testimonial_request?.status !== "open" ||
    smoke.dealClose.body.referral_request?.status !== "open"
  ) {
    throw new Error("HTTP smoke must close deals with testimonial and referral tasks");
  }
  if (smoke.dealCloseUnauthorized?.status !== 401) throw new Error("HTTP smoke must reject unauthenticated deal closes");
  if (
    smoke.viewingCalendar?.status !== 200 ||
    smoke.viewingCalendar.headers["content-type"] !== "text/calendar; charset=utf-8" ||
    !smoke.viewingCalendar.body.includes("BEGIN:VCALENDAR") ||
    !smoke.viewingCalendar.body.includes("DTSTART:20260706T100000Z")
  ) {
    throw new Error("HTTP smoke must export broker viewings as an admin calendar feed");
  }
  if (smoke.viewingCalendarUnauthorized?.status !== 401) {
    throw new Error("HTTP smoke must reject unauthenticated viewing calendar export");
  }
  return true;
}
