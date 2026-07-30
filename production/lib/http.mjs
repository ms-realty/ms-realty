import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { DEFAULT_BROKER_CONTACT_LEDGER_PATH } from "./broker-contacts.mjs";
import { DEFAULT_SLUG_HISTORY_PATH } from "./slug-history.mjs";
import { DEFAULT_TOUR_APPROVAL_LEDGER_PATH } from "./tours.mjs";
import { DEFAULT_TRANSLATION_LEDGER_PATH } from "./translation-ledger.mjs";
import { readThroughCached } from "./file-cache.mjs";
import { renderMcpProtectedResourceMetadata, renderMcpResponse } from "./mcp-server.mjs";
import { clientIpFromHeaders, createRateLimiter } from "./rate-limit.mjs";
import { CONTENT_SECURITY_POLICY } from "./security-headers.mjs";
import {
  adminHomePath,
  assertAgentRealtyCaseConditionMutation,
  assertAgentRealtyCaseMutation,
  bindAuthenticatedOperator,
  canAdminAccess,
  canAdminMutate,
  isAdminAuthorized,
  resolveAdminPrincipal,
  requiredAdminCapability,
  withAuthenticatedAuditActor,
} from "./admin-auth.mjs";
import { appendAuditLog, createAuditLogEntry, readAuditLog } from "./audit-log.mjs";
import {
  LISTING_EDIT_FIELDS,
  renderAdminActivityPayload,
  renderAdminContactsPayload,
  renderAdminConsentPayload,
  renderAdminDocumentChecklistPayload,
  renderAdminLeadsPayload,
  renderAdminListingEditorPayload,
  renderAdminListingManagerPayload,
  renderAdminOperationsReportPayload,
  renderAdminOperationalQueuePayload,
  renderAdminRealtyCasesPayload,
  renderAdminTranslationQueuePayload,
} from "./admin-payloads.mjs";
import { appendDocumentChecklistOutcome, buildDocumentChecklistQueue, readDocumentChecklistOutcomes } from "./document-checklists.mjs";
import { appendAccountContactLink, appendAccountCreation, deriveAccounts, readAccountLedger } from "./account-ledger.mjs";
import { buildContactRecords } from "./contact-records.mjs";
import { loadMigrationRecords } from "./content.mjs";
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
import { normalizeBrokerLeadInput } from "./leads.mjs";
import { appendLeadContact, withLeadContacts } from "./lead-contact-vault.mjs";
import {
  appendLeadAssignment,
  applyLeadAssignments,
  createLeadAssignment,
  readLeadAssignments,
} from "./lead-assignments.mjs";
import { buildLeadMatchingReport } from "./lead-matching.mjs";
import {
  appendLeadPipelineOutcome,
  buildLeadPipelineQueue,
  readLeadPipelineOutcomes,
} from "./lead-pipeline-outcomes.mjs";
import { appendReviewedReply, createHermesReplyDraft, readReplyOutbox } from "./lead-replies.mjs";
import { buildCommunicationThreads, communicationTemplatesForLead } from "./communication-threads.mjs";
import {
  appendReplyDeliveryOutcome,
  buildReplyDeliveryQueue,
  readReplyDeliveryOutcomes,
} from "./reply-delivery-outcomes.mjs";
import { appendBrokerContact, createBrokerContact, readBrokerContacts } from "./broker-contacts.mjs";
import { loadCmsSeed, renderRuntimePath, searchRuntimeListings, submitRuntimeLead } from "./runtime.mjs";
import { summarizeLegacyRouteMap } from "./migration.mjs";
import { attachMigrationReviewEvidence, filterMigrationReviewRoutes, migrationReviewTargetOptions } from "./migration-review.mjs";
import { buildRuntimeLocalizedSitemap, renderRobotsTxt, renderSitemapXml } from "./seo-files.mjs";
import {
  approveTranslationTask,
  createCrmInboxItem,
  createTranslationReviewTask,
  publishApprovedTranslation,
  renderAdminWorkspace,
} from "./admin-workflows.mjs";
import {
  appendRedirectApproval,
  buildPendingRedirectApprovalWorkbook,
  buildRedirectApprovalWorkbook,
  buildDeployableRedirects,
  buildLegacyRouteDecisions,
  importRedirectApprovalsCsv,
  loadLegacyRouteDecisions,
  readRedirectApprovals,
  renderRedirectApprovalWorkbook,
  summarizeDeployableRedirects,
  summarizeLegacyRouteDecisions,
  writeDeployableRedirects,
} from "./redirect-approvals.mjs";
import {
  appendLanguageRequest,
  createLanguageRequest,
  privacySafeLanguageRequest,
  readLanguageRequests,
} from "./language-requests.mjs";
import { appendTranslationTask, latestTranslationTasks, readTranslationLedger } from "./translation-ledger.mjs";
import {
  appendListingEdit,
  applyListingEdits,
  createBulkListingStatusEdits,
  createListingEdit,
  readListingEdits,
} from "./listing-edits.mjs";
import { appendMediaReview, applyMediaReviews, createMediaReview, readMediaReviews } from "./media-reviews.mjs";
import {
  appendListingPublicationSchedule,
  buildListingPublicationScheduleQueue,
  cancelListingPublicationSchedule,
  executeDueListingPublicationSchedules,
  listingPublicationExecutionAuditRecords,
  readListingPublicationSchedules,
} from "./listing-publication-schedules.mjs";
import { appendViewing, readViewings, renderViewingCalendar } from "./viewing-ledger.mjs";
import { appendViewingFollowUp, buildViewingFollowUpQueue, readViewingFollowUps } from "./viewing-follow-ups.mjs";
import {
  appendSavedSearch,
  createSavedSearch,
  normalizeSavedSearchInput,
  privacySafeSavedSearch,
  readSavedSearches,
  savedSearchIntent,
} from "./saved-searches.mjs";
import { appendPublicContact, readPublicContacts } from "./public-contact-vault.mjs";
import {
  appendPublicRequestOutcome,
  buildPublicRequestQueue,
  readPublicRequestOutcomes,
} from "./public-request-outcomes.mjs";
import { appendSellerPipeline, createSellerPipelineItem, readSellerPipeline } from "./seller-pipeline.mjs";
import { appendSellerPipelineOutcome, buildSellerPipelineQueue, readSellerPipelineOutcomes } from "./seller-pipeline-outcomes.mjs";
import { appendClosedDeal, readDeals } from "./deal-ledger.mjs";
import {
  appendRealtyCaseAction,
  buildRealtyCaseQueue,
  openRealtyCase,
  readRealtyCaseEvents,
} from "./realty-cases.mjs";
import {
  appendRealtyCaseConditionAction,
  buildRealtyCaseConditionQueue,
  openRealtyCaseCondition,
  readRealtyCaseConditionEvents,
} from "./realty-case-conditions.mjs";
import { buildAutonomousRealtyCaseIntents } from "./realty-case-executor.mjs";
import {
  assertRealtyCaseRequestProjectionConfig,
  assertRealtyCaseRequestProjectionInput,
  projectRealtyCaseConditionRequest,
  projectRealtyCaseRequest,
  realtyCaseRequestProjectionFailure,
} from "./realty-case-request-projection.mjs";
import { appendTourApproval, createTourApproval, readTourApprovals } from "./tours.mjs";
import { appendEvent, createEvent, readEventLedger } from "./events.mjs";
import {
  appendConsentRecord,
  createConsentRecord,
  createConsentWithdrawal,
  latestConsentStates,
  readConsentLedger,
} from "./consent-ledger.mjs";
import { appendSlugChange, readSlugHistory, slugRedirectForPath } from "./slug-history.mjs";
import { renderFaviconSvg } from "./favicon.mjs";
import { geographySuggestionsPayload, loadGeographyRegistry } from "./geography.mjs";
import {
  buildSeoEvidence,
  buildSeoEvidencePreflightReport,
  readSeoExportTemplate,
} from "./seo-evidence.mjs";
import { importAppSeoEvidenceRows, seoEvidencePayload } from "./app-seo-evidence.mjs";
import {
  buildLiveServicePreflightReport,
  buildLaunchReadinessReport,
  launchBlockerSummary,
  liveServiceImportSummary,
  liveServiceReports,
  payloadRuntimeState,
  publicLaunchReadinessHeaders,
  publicLaunchReadinessPayload,
  readLiveServiceReportTemplate,
  writeLaunchReadinessReport,
  writeLiveServiceReport,
} from "./launch-readiness.mjs";
import { liveServiceProvisioningState, writeLiveServiceProvisioningReport } from "./live-service-provisioning.mjs";
import { payloadRuntimeImportSummary, writePayloadRuntimeReport } from "./payload-runtime.mjs";
import { payloadRuntimeBootstrapPayload } from "./payload-runtime-bootstrap.mjs";
import {
  productionRecoveryState,
  readProductionRecoveryTemplate,
  writeProductionRecoveryReport,
} from "./production-recovery.mjs";
import { buildOperationsReport, renderOperationsReportCsv } from "./operations-report.mjs";
import { renderLaunchInputChecklist } from "./launch-inputs.mjs";
import { loadCmsCollections } from "./cms-seed.mjs";
import { loadPayloadCollections } from "./payload-collections.mjs";
import {
  DEFAULT_LISTING_QUALITY_REVIEW_INPUT,
  buildListingQualityReviewQueue,
  buildListingQualityReviewPacket,
  buildListingQualityPreflightReport,
  buildListingQualityReport,
  listingQualityImportSummary,
  mergeListingQualityReviewCsv,
  renderListingQualityReviewDraft,
  renderListingQualityReviewSubmission,
  renderListingQualityWorkbook,
  validateListingQualityReviewCsv,
  writeListingQualityReviewCsv,
} from "./listing-quality.mjs";
import { fromRoot } from "./paths.mjs";
import { queryPublicSearch } from "./search-engine-sync.mjs";
import { searchIntentToQueryFilters } from "./search-intent.mjs";
import { normalizeSearchRequest } from "./search-request.mjs";
import { buildSearchAnalyticsReport } from "./search-analytics.mjs";

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};
const PRIVATE_HEADERS = { "cache-control": "no-store" };

// Public (unauthenticated) write endpoints protected by the rate limiter.
const PUBLIC_WRITE_PATHS = new Set(["/api/leads", "/api/events", "/api/language-requests", "/api/saved-searches"]);

function response(status, body, contentType, headers = {}) {
  const csp = contentType.startsWith("text/html") ? { "content-security-policy": CONTENT_SECURITY_POLICY } : {};
  return {
    status,
    headers: { ...SECURITY_HEADERS, ...csp, "content-type": contentType, ...headers },
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

function payloadAdminListingPath(listingId) {
  const id = typeof listingId === "string" ? listingId.trim() : "";
  if (!id) throw new Error("listingId is required for the Payload editor handoff");
  return `/payload-admin/collections/listings/${encodeURIComponent(id)}`;
}

function payloadAdminListingHandoff(listingId) {
  return adminResponse(307, "", "text/plain; charset=utf-8", {
    location: payloadAdminListingPath(listingId),
  });
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

function activeListingRecord(record) {
  const status = String(record.facts?.listing_status || "available").trim().toLowerCase();
  return record.collection === "listings" && ["available", "reserved"].includes(status);
}

function engineLocaleCodes(seed, registry, result) {
  if (seed.records.some((record) => activeListingRecord(record) && record.source_locale === result.locale)) {
    return [result.locale];
  }
  return [...new Set([result.search.fallback?.locale || registry.source_locale, registry.source_locale].filter(Boolean))];
}

function seedForSearchHits(seed, hits) {
  const recordsById = new Map(
    seed.records.filter((record) => record.collection === "listings").map((record) => [record.id, record]),
  );
  const seen = new Set();
  const records = [];
  for (const hit of hits) {
    const id = String(hit.source_listing_id || "").trim();
    const record = recordsById.get(id);
    if (!record || seen.has(id)) continue;
    seen.add(id);
    records.push(record);
  }
  return { ...seed, records };
}

function withSearchBackend(result, engineResult) {
  const backend = {
    engine: engineResult.engine,
    mode: engineResult.engine === "typesense" ? "primary" : engineResult.engine === "meilisearch" ? "fallback" : "local_fallback",
    locale_codes: engineResult.locale_codes,
    unavailable_engines: engineResult.unavailable_engines,
  };
  if (Number.isFinite(engineResult.total)) backend.indexed_matches = engineResult.total;
  return {
    ...result,
    search: {
      ...result.search,
      engines: [engineResult.engine],
      backend,
    },
  };
}

function adminHtml(page) {
  return renderHtmlPage(page, { bodyHtml: renderReactAdminBody(page) });
}

function adminUnauthorized() {
  return adminResponse(401, { kind: "unauthorized" }, "application/json; charset=utf-8", {
    "www-authenticate": 'Bearer realm="ms-realty-admin"',
  });
}

function adminOperatorIdentityRequired() {
  return adminJson(403, { kind: "operator_identity_required" });
}

function adminForbidden(capability) {
  return adminJson(403, { kind: "forbidden", required_capability: capability });
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

function loadAppRouteManifest(filePath = fromRoot("production", "data", "app-route-manifest.json")) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseBody(request) {
  const contentType = request.headers?.["content-type"] || request.headers?.["Content-Type"] || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const output = {};
    for (const [key, value] of new URLSearchParams(request.body || "")) {
      output[key] = key in output ? (Array.isArray(output[key]) ? [...output[key], value] : [output[key], value]) : value;
    }
    return output;
  }
  return parseJsonBody(request);
}

function realtyCaseInput(input) {
  const output = { ...(input || {}) };
  if (!output.mandate && (output.mandateRef || output.mandate_ref)) {
    output.mandate = {
      ref: output.mandateRef || output.mandate_ref,
      grantedByRef: output.mandateGrantedByRef || output.mandate_granted_by_ref,
      signedAt: output.mandateSignedAt || output.mandate_signed_at,
      signedEvidenceRef: output.mandateSignedEvidenceRef || output.mandate_signed_evidence_ref,
      expiresAt: output.mandateExpiresAt || output.mandate_expires_at || null,
      capabilities: String(output.mandateCapabilities || output.mandate_capabilities || "case:*")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    };
  }
  if (!output.evidenceRefs && !output.evidence_refs && (output.evidenceRef || output.evidence_ref)) {
    output.evidenceRefs = [{
      ref: output.evidenceRef || output.evidence_ref,
      type: output.evidenceType || output.evidence_type,
      producerKind: output.evidenceProducerKind || output.evidence_producer_kind,
      issuedAt: output.evidenceIssuedAt || output.evidence_issued_at || null,
      digest: output.evidenceDigest || output.evidence_digest || null,
    }];
  }
  return output;
}

function bindRealtyCaseExecutor(input, principal) {
  const expectedKind = principal?.roles?.includes("agent") ? "agent" : "human";
  const submittedKind = String(input?.executorKind || input?.executor_kind || "").trim();
  if (submittedKind && submittedKind !== expectedKind) {
    throw new Error("Case executor kind must match the authenticated principal");
  }
  const prepared = { ...realtyCaseInput(input), executorKind: expectedKind };
  assertAgentRealtyCaseMutation(principal, prepared);
  return bindAuthenticatedOperator(prepared, principal);
}

function bindRealtyCaseConditionExecutor(input, principal, action) {
  const expectedKind = principal?.roles?.includes("agent") ? "agent" : "human";
  const submittedKind = String(input?.executorKind || input?.executor_kind || "").trim();
  if (submittedKind && submittedKind !== expectedKind) {
    throw new Error("Condition executor kind must match the authenticated principal");
  }
  const prepared = { ...(input || {}), executorKind: expectedKind };
  assertAgentRealtyCaseConditionMutation(principal, { ...prepared, action });
  return bindAuthenticatedOperator(prepared, principal);
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

function listingQualityReviewInput(request) {
  if ((request.headers?.["content-type"] || request.headers?.["Content-Type"] || "").includes("application/json")) {
    return { csv: renderListingQualityReviewSubmission(parseJsonBody(request)), source: "listing_quality_workbench" };
  }
  return { csv: csvInput(request), source: "listing_quality_csv" };
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
    report: reportJsonInput(input),
  };
}

function reportJsonInput(input) {
  const report = input && typeof input === "object" && !Array.isArray(input) && Object.hasOwn(input, "report") ? input.report : input;
  if (typeof report !== "string") return report;
  try {
    return JSON.parse(report);
  } catch {
    throw new Error("Report must be valid JSON");
  }
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

function renderMigrationReviewPayload(registry, url, dashboard, routes, approvals, seoEvidence, listingQuality, launchReadiness) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale: url.searchParams.get("locale") || "en" });
  const decisions = buildLegacyRouteDecisions(routes, approvals);
  const decidedOldUrls = new Set(decisions.map((decision) => decision.old_url));
  const sourceReviewRequired = routes.filter((route) => route.review_required);
  const reviewRequired = sourceReviewRequired.filter((route) => !decidedOldUrls.has(route.old_url));
  const reviewSelection = filterMigrationReviewRoutes(
    attachMigrationReviewEvidence(reviewRequired, loadMigrationRecords()),
    {
      q: url.searchParams.get("q"),
      type: url.searchParams.get("routeType"),
      domain: url.searchParams.get("routeDomain"),
    },
  );
  // Keep human review batches deliberately small. Ten decisions are enough for
  // a focused operator session on a phone without turning the launch queue into
  // an endless wall of forms.
  const routePageSize = 10;
  const routePages = Math.max(1, Math.ceil(reviewSelection.rows.length / routePageSize));
  const requestedRoutePage = Number.parseInt(url.searchParams.get("routePage") || "1", 10);
  const routePage = Math.min(Math.max(Number.isFinite(requestedRoutePage) ? requestedRoutePage : 1, 1), routePages);
  const pendingRoutesWithEvidence = reviewSelection.rows.slice((routePage - 1) * routePageSize, routePage * routePageSize);
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
      sourceReviewRequired: sourceReviewRequired.length,
      reviewRequired: reviewRequired.length,
      mappedListings: mappedListings.length,
      terminalDecisionsReviewed: decisions.length,
      pendingSample: pendingRoutesWithEvidence,
      filters: reviewSelection.filters,
      filterOptions: reviewSelection.filterOptions,
      targetOptions: migrationReviewTargetOptions(loadAppRouteManifest()),
      pendingPagination: {
        page: routePage,
        pageSize: routePageSize,
        totalPages: routePages,
        totalRows: reviewSelection.rows.length,
      },
      approvableSample: mappedListings
        .filter((route) => route.review_required && route.planned_status === 301 && !decidedOldUrls.has(route.old_url))
        .slice(0, 20),
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
    listingQuality,
    listingQualityWorkbookEndpoint: "/api/admin/listing-quality-workbook",
    listingQualityReviewDraftEndpoint: "/api/admin/listing-quality-review-draft",
    listingQualityImportEndpoint: "/api/admin/listing-quality/import",
    launchBlockers: launchBlockerSummary(launchReadiness),
    launchReadinessEndpoint: "/api/admin/launch-readiness",
    launchReadinessExportEndpoint: "/api/admin/launch-readiness/export",
    launchInputChecklistEndpoint: "/api/admin/launch-input-checklist",
    preflightReportsEndpoint: "/api/admin/preflight-reports",
    seoPreflightEndpoint: "/api/admin/seo-preflight",
    liveServicesEndpoint: "/api/admin/live-services",
    liveServiceProvisioningEndpoint: "/api/admin/live-service-provisioning",
    liveServiceProvisioningImportEndpoint: "/api/admin/live-service-provisioning/import",
    liveServiceReportTemplateEndpoint: "/api/admin/live-service-report-template",
    liveServiceReportImportEndpoint: "/api/admin/live-service-reports/import",
    payloadRuntimeEndpoint: "/api/admin/payload-runtime",
    payloadRuntimeBootstrapEndpoint: "/api/admin/payload-runtime-bootstrap",
    payloadRuntimeImportEndpoint: "/api/admin/payload-runtime/import",
    productionRecoveryEndpoint: "/api/admin/production-recovery",
    productionRecoveryTemplateEndpoint: "/api/admin/production-recovery-template",
    productionRecoveryImportEndpoint: "/api/admin/production-recovery/import",
    cmsCollectionsEndpoint: "/api/admin/cms-collections",
    payloadCollectionsEndpoint: "/api/admin/payload-collections",
    listingQualityEndpoint: "/api/admin/listing-quality",
    deployablePreview: buildDeployableRedirects(routes, approvals),
    terminalDecisionPreview: decisions,
  };
}

export function createHttpApp({
  registry,
  seed = loadCmsSeed(),
  redirects,
  routeMap = loadLegacyRouteMap(),
  migrationReviewDashboard = loadMigrationReviewDashboard(),
  leadLedgerPath = null,
  accountLedgerPath = null,
  leadAssignmentLedgerPath = null,
  leadPipelineOutcomeLedgerPath = null,
  leadContactVaultPath = null,
  leadContactKey = null,
  publicContactVaultPath = null,
  publicContactKey = null,
  replyOutboxPath = null,
  replyDeliveryOutcomeLedgerPath = null,
  languageRequestPath = null,
  translationLedgerPath = null,
  listingEditLedgerPath = null,
  mediaReviewLedgerPath = null,
  listingPublicationSchedulePath = null,
  viewingLedgerPath = null,
  viewingFollowUpLedgerPath = null,
  savedSearchLedgerPath = null,
  publicRequestOutcomeLedgerPath = null,
  sellerPipelinePath = null,
  sellerPipelineOutcomeLedgerPath = null,
  dealLedgerPath = null,
  documentChecklistLedgerPath = null,
  realtyCaseLedgerPath = null,
  realtyCaseConditionLedgerPath = null,
  realtyCaseRequestProjectionEnabled = false,
  realtyCaseWorkspaceId = "",
  realtyCasePayloadProjector = null,
  realtyCasePayloadRuntimeConfigured = false,
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
  productionRecoveryReportPath = null,
  seoEvidenceInputDir = null,
  seoEvidenceOutputPath = null,
  localeRegistryPath = null,
  receivedAt,
  requestedAt,
  editedAt,
  listingPublicationAt,
  reviewedAt,
  bookedAt,
  viewingFollowUpAt,
  savedAt,
  publicRequestOutcomeAt,
  leadPipelineOutcomeAt,
  replyDeliveredAt,
  sellerPipelineCreatedAt,
  sellerPipelineOutcomeAt,
  dealClosedAt,
  realtyCaseRecordedAt,
  slugChangedAt,
  listingQualityGeneratedAt,
  leadSlaGeneratedAt,
  hermesReplyProvider = null,
  rateLimit = null,
  naturalLanguageSearchEnabled = process.env.MS_REALTY_SEARCH_NL_INTENT_ENABLED === "true",
  search = {},
} = {}) {
  let activeRegistry = registry || loadLocaleRegistry(localeRegistryPath || undefined);
  const activeLegacyDecisions = redirects ?? loadLegacyRouteDecisions(deployableRedirectOutputPath || undefined);
  const activeLegacyDecisionByUrl = new Map(activeLegacyDecisions.map((row) => [row.old_url, row]));
  const publicWriteLimiter = rateLimit ? createRateLimiter(rateLimit) : null;
  const currentSeed = () =>
    applyMediaReviews(
      applyListingEdits(seed, readListingEdits(listingEditLedgerPath || undefined)),
      readMediaReviews(mediaReviewLedgerPath || undefined),
    );
  const currentTranslationTasks = () =>
    readThroughCached(translationLedgerPath || DEFAULT_TRANSLATION_LEDGER_PATH, () =>
      readTranslationLedger(translationLedgerPath || undefined),
    );
  const currentBrokerContacts = () =>
    readThroughCached(brokerContactLedgerPath || DEFAULT_BROKER_CONTACT_LEDGER_PATH, () =>
      readBrokerContacts(brokerContactLedgerPath || DEFAULT_BROKER_CONTACT_LEDGER_PATH),
    );
  const currentTourApprovals = () =>
    readThroughCached(tourApprovalLedgerPath || DEFAULT_TOUR_APPROVAL_LEDGER_PATH, () =>
      readTourApprovals(tourApprovalLedgerPath || DEFAULT_TOUR_APPROVAL_LEDGER_PATH),
    );
  const currentSlugHistory = () =>
    readThroughCached(slugHistoryPath || DEFAULT_SLUG_HISTORY_PATH, () => readSlugHistory(slugHistoryPath || DEFAULT_SLUG_HISTORY_PATH));
  const currentLeads = () =>
    applyLeadAssignments(
      withLeadContacts(readLeadLedger(leadLedgerPath || undefined), {
        filePath: leadContactVaultPath,
        secret: leadContactKey,
      }),
      readLeadAssignments(leadAssignmentLedgerPath || undefined),
    );
  const currentListingQualityReport = (options = {}) =>
    buildListingQualityReport({
      seed: currentSeed(),
      tourApprovals: currentTourApprovals(),
      ...options,
    });
  const currentListingQualityReviewQueue = (options = {}) => {
    const report = currentListingQualityReport(options);
    const reviewPath = listingQualityReviewPath || DEFAULT_LISTING_QUALITY_REVIEW_INPUT;
    const reviewCsv = fs.existsSync(reviewPath) ? fs.readFileSync(reviewPath, "utf8") : "";
    const reviewQueue = buildListingQualityReviewQueue(report, { reviewCsv, limit: 20 });
    return { ...report, rows: reviewQueue.rows, review_queue: reviewQueue };
  };
  const currentViewingData = () => {
    const viewings = readViewings(viewingLedgerPath || undefined);
    return {
      viewings,
      viewingFollowUpQueue: buildViewingFollowUpQueue(viewings, readViewingFollowUps(viewingFollowUpLedgerPath || undefined), {
        now: viewingFollowUpAt || bookedAt || reviewedAt || receivedAt || new Date().toISOString(),
      }),
    };
  };
  const currentSellerPipelineData = () => {
    const sellerPipeline = readSellerPipeline(sellerPipelinePath || undefined);
    return {
      sellerPipeline,
      sellerPipelineQueue: buildSellerPipelineQueue(sellerPipeline, readSellerPipelineOutcomes(sellerPipelineOutcomeLedgerPath || undefined), {
        now: sellerPipelineOutcomeAt || reviewedAt || bookedAt || receivedAt || new Date().toISOString(),
      }),
    };
  };
  const currentPublicRequestQueue = () => {
    let contactMaps = {};
    let contactVaultStatus = "not_configured";
    if (publicContactVaultPath) {
      try {
        contactMaps = {
          saved_search: readPublicContacts(publicContactVaultPath, publicContactKey, "saved_search"),
          language_request: readPublicContacts(publicContactVaultPath, publicContactKey, "language_request"),
        };
        contactVaultStatus = [...contactMaps.saved_search.values(), ...contactMaps.language_request.values()].length
          ? "available"
          : "empty";
      } catch {
        contactMaps = {};
        contactVaultStatus = "locked";
      }
    }
    return buildPublicRequestQueue({
      savedSearches: readSavedSearches(savedSearchLedgerPath || undefined),
      languageRequests: readLanguageRequests(languageRequestPath || undefined),
      outcomes: readPublicRequestOutcomes(publicRequestOutcomeLedgerPath || undefined),
      contactMaps,
      contactVaultStatus,
      now: publicRequestOutcomeAt || reviewedAt || receivedAt || new Date().toISOString(),
    });
  };
  const currentReplyData = () => {
    const replies = readReplyOutbox(replyOutboxPath || undefined);
    const outcomes = readReplyDeliveryOutcomes(replyDeliveryOutcomeLedgerPath || undefined);
    return {
      replies,
      outcomes,
      replyDeliveryQueue: buildReplyDeliveryQueue(replies, outcomes),
    };
  };
  const currentLeadJourneyContext = () => ({
    leads: currentLeads(),
    outcomes: readLeadPipelineOutcomes(leadPipelineOutcomeLedgerPath || undefined),
    viewings: readViewings(viewingLedgerPath || undefined),
    viewingFollowUps: readViewingFollowUps(viewingFollowUpLedgerPath || undefined),
    deals: readDeals(dealLedgerPath || undefined),
    sellerPipelines: readSellerPipeline(sellerPipelinePath || undefined),
    sellerPipelineOutcomes: readSellerPipelineOutcomes(sellerPipelineOutcomeLedgerPath || undefined),
  });
  const currentLeadPipelineQueue = () =>
    buildLeadPipelineQueue(currentLeadJourneyContext(), {
      now: leadPipelineOutcomeAt || reviewedAt || bookedAt || receivedAt || new Date().toISOString(),
    });
  const currentAdminLeadPayload = (requestedLocale, operatorId = null) => {
    const leads = currentLeads();
    const leadPipelineQueue = currentLeadPipelineQueue();
    const replyData = currentReplyData();
    return renderAdminLeadsPayload(activeRegistry, requestedLocale, {
      leads,
      leadPipelineQueue,
      leadMatching: buildLeadMatchingReport({
        registry: activeRegistry,
        seed: currentSeed(),
        leads,
        leadPipelineStates: leadPipelineQueue.states,
        generatedAt: reviewedAt || leadPipelineOutcomeAt || receivedAt || new Date().toISOString(),
      }),
      replies: replyData.replies,
      replyDeliveryQueue: replyData.replyDeliveryQueue,
      communicationThreads: buildCommunicationThreads({ leads, replies: replyData.replies, outcomes: replyData.outcomes }),
      communicationTemplates: Object.fromEntries(
        leads.map((lead) => [lead.lead_id, communicationTemplatesForLead(lead)]),
      ),
      languageRequests: readLanguageRequests(languageRequestPath || undefined),
      translationTasks: latestTranslationTasks(currentTranslationTasks()),
      listingEdits: readListingEdits(listingEditLedgerPath || undefined),
      leadSlaGeneratedAt,
      operatorId,
      ...currentViewingData(),
      savedSearches: readSavedSearches(savedSearchLedgerPath || undefined),
      publicRequestQueue: currentPublicRequestQueue(),
      ...currentSellerPipelineData(),
      deals: readDeals(dealLedgerPath || undefined),
      brokerContacts: currentBrokerContacts(),
    });
  };
  const currentContactPayload = (requestedLocale, operatorId = null) => {
    const leads = currentLeads();
    const replies = readReplyOutbox(replyOutboxPath || undefined);
    const outcomes = readReplyDeliveryOutcomes(replyDeliveryOutcomeLedgerPath || undefined);
    const communicationThreads = buildCommunicationThreads({ leads, replies, outcomes });
    const accounts = deriveAccounts(readAccountLedger(accountLedgerPath || undefined));
    return renderAdminContactsPayload(activeRegistry, requestedLocale, {
      contacts: buildContactRecords({ leads, communicationThreads, accounts }),
      accounts,
      operatorId,
    });
  };
  const currentDocumentChecklistPayload = (requestedLocale, operatorId = null) =>
    renderAdminDocumentChecklistPayload(
      activeRegistry,
      requestedLocale,
      buildDocumentChecklistQueue(currentLeads(), readDocumentChecklistOutcomes(documentChecklistLedgerPath || undefined), {
        locale: requestedLocale,
      }),
      operatorId,
    );
  const currentRealtyCasePayload = (requestedLocale, operatorId = null) =>
    renderAdminRealtyCasesPayload(
      activeRegistry,
      requestedLocale,
      buildRealtyCaseQueue(readRealtyCaseEvents(realtyCaseLedgerPath || undefined), {
        now: realtyCaseRecordedAt || reviewedAt || receivedAt || new Date().toISOString(),
      }),
      operatorId,
    );
  const currentAutonomousRealtyCaseIntents = () =>
    buildAutonomousRealtyCaseIntents(readRealtyCaseEvents(realtyCaseLedgerPath || undefined), {
      now: realtyCaseRecordedAt || reviewedAt || receivedAt || new Date().toISOString(),
    });
  const projectCurrentRealtyCase = async (result) => {
    if (!realtyCaseRequestProjectionEnabled) return null;
    return projectRealtyCaseRequest({
      caseId: result.case.id,
      eventId: result.event.id,
      filePath: realtyCaseLedgerPath || undefined,
      workspaceId: realtyCaseWorkspaceId,
      projector: realtyCasePayloadProjector,
    });
  };
  const projectCurrentRealtyCaseCondition = async (result) => {
    if (!realtyCaseRequestProjectionEnabled) return null;
    return projectRealtyCaseConditionRequest({
      caseId: result.condition.case_id,
      eventId: result.event.id,
      filePath: realtyCaseConditionLedgerPath || undefined,
      workspaceId: realtyCaseWorkspaceId,
      projector: realtyCasePayloadProjector,
    });
  };
  const currentRealtyCaseConditionQueue = () =>
    buildRealtyCaseConditionQueue(readRealtyCaseConditionEvents(realtyCaseConditionLedgerPath || undefined), {
      now: realtyCaseRecordedAt || reviewedAt || receivedAt || new Date().toISOString(),
    });
  const currentConsentPayload = (requestedLocale, operatorId = null) =>
    renderAdminConsentPayload(
      activeRegistry,
      requestedLocale,
      latestConsentStates(readConsentLedger(consentLedgerPath || undefined)),
      operatorId,
    );
  const currentOperationsReport = () => {
    const generatedAt = reviewedAt || editedAt || receivedAt || new Date().toISOString();
    const reportSeed = currentSeed();
    return buildOperationsReport({
      leads: readLeadLedger(leadLedgerPath || undefined),
      replies: readReplyOutbox(replyOutboxPath || undefined),
      replyDeliveryOutcomes: readReplyDeliveryOutcomes(replyDeliveryOutcomeLedgerPath || undefined),
      leadPipelineOutcomes: readLeadPipelineOutcomes(leadPipelineOutcomeLedgerPath || undefined),
      viewings: readViewings(viewingLedgerPath || undefined),
      viewingFollowUps: readViewingFollowUps(viewingFollowUpLedgerPath || undefined),
      deals: readDeals(dealLedgerPath || undefined),
      sellerPipelines: readSellerPipeline(sellerPipelinePath || undefined),
      sellerPipelineOutcomes: readSellerPipelineOutcomes(sellerPipelineOutcomeLedgerPath || undefined),
      savedSearches: readSavedSearches(savedSearchLedgerPath || undefined),
      languageRequests: readLanguageRequests(languageRequestPath || undefined),
      publicRequestOutcomes: readPublicRequestOutcomes(publicRequestOutcomeLedgerPath || undefined),
      translationTasks: currentTranslationTasks(),
      seed: reportSeed,
      searchAnalytics: buildSearchAnalyticsReport({
        registry: activeRegistry,
        seed: reportSeed,
        events: readEventLedger(eventLedgerPath || undefined),
        generatedAt,
      }),
      generatedAt,
    });
  };
  const currentReportsPayload = (requestedLocale, operatorId = null) =>
    renderAdminOperationsReportPayload(activeRegistry, requestedLocale, currentOperationsReport(), operatorId);
  const currentRequestsPayload = (requestedLocale, operatorId = null) => {
    return renderAdminOperationalQueuePayload(currentAdminLeadPayload(requestedLocale, operatorId), {
      kind: "admin_requests",
      path: "/admin/requests",
      titleKey: "requestsWorkspace",
      descriptionKey: "requestsDescription",
    });
  };
  const currentPipelinePayload = (requestedLocale, operatorId = null) => {
    return renderAdminOperationalQueuePayload(currentAdminLeadPayload(requestedLocale, operatorId), {
      kind: "admin_lead_pipeline",
      path: "/admin/pipeline",
      titleKey: "pipelineWorkspace",
      descriptionKey: "pipelineDescription",
    });
  };
  const currentTodayPayload = (requestedLocale, operatorId = null) =>
    renderAdminOperationalQueuePayload(currentAdminLeadPayload(requestedLocale, operatorId), {
      kind: "admin_today",
      path: "/admin/today",
      titleKey: "today",
      descriptionKey: "todayDescription",
    });
  const currentViewingsPayload = (requestedLocale, operatorId = null) =>
    renderAdminOperationalQueuePayload(currentAdminLeadPayload(requestedLocale, operatorId), {
      kind: "admin_viewings",
      path: "/admin/viewings",
      titleKey: "viewingsWorkspace",
      descriptionKey: "viewingsDescription",
    });
  const currentActivityPayload = (url, operatorId = null) =>
    renderAdminActivityPayload(
      activeRegistry,
      url.searchParams.get("locale") || "en",
      readAuditLog(auditLogPath || undefined),
      operatorId,
      {
        leadId: url.searchParams.get("leadId"),
        listingId: url.searchParams.get("listingId"),
        actor: url.searchParams.get("actor"),
        action: url.searchParams.get("action"),
        page: url.searchParams.get("page"),
      },
    );
  const currentListingManagerPayload = (url, operatorId = null) =>
    renderAdminListingManagerPayload(activeRegistry, url.searchParams.get("locale") || "en", {
      seed: currentSeed(),
      translationTasks: latestTranslationTasks(currentTranslationTasks()),
      query: url.searchParams.get("q") || "",
      status: url.searchParams.get("status") || "",
      sourceLocale: url.searchParams.get("sourceLocale") || "",
      page: url.searchParams.get("page") || 1,
      generatedAt: reviewedAt || new Date().toISOString(),
      operatorId,
      publicationScheduleQueue: buildListingPublicationScheduleQueue(
        readListingPublicationSchedules(listingPublicationSchedulePath || undefined),
        { now: listingPublicationAt || reviewedAt || editedAt || new Date().toISOString() },
      ),
    });
  const currentTranslationQueuePayload = (url, operatorId = null) =>
    renderAdminTranslationQueuePayload(activeRegistry, url.searchParams.get("locale") || "en", {
      seed: currentSeed(),
      translationTasks: latestTranslationTasks(currentTranslationTasks()),
      query: url.searchParams.get("q") || "",
      targetLocale: url.searchParams.get("targetLocale") || "",
      taskType: url.searchParams.get("taskType") || "",
      page: url.searchParams.get("page") || 1,
      generatedAt: reviewedAt || new Date().toISOString(),
      operatorId,
    });
  const currentSeoEvidence = () =>
    buildSeoEvidence({
      inputDir: seoEvidenceInputDir || undefined,
      events: readEventLedger(eventLedgerPath || undefined),
      generatedAt: reviewedAt || new Date().toISOString(),
    });
  const currentLegacyRouteDecisions = () =>
    buildLegacyRouteDecisions(routeMap, readRedirectApprovals(redirectApprovalPath || undefined));
  const currentDeployedRedirectArtifact = () => {
    const decisions = activeLegacyDecisions;
    const redirects = decisions.filter((decision) => decision.status === 301).map((decision) => ({
      old_url: decision.old_url,
      target_path: decision.target_path,
      status: 301,
      source_domain: decision.source_domain,
      target_locale: decision.target_locale,
      url_type: decision.url_type,
      reviewer: decision.reviewer,
      approved_at: decision.approved_at,
    }));
    return {
      summary: summarizeDeployableRedirects(redirects),
      decision_summary: summarizeLegacyRouteDecisions(decisions),
      redirects,
      decisions,
    };
  };
  const currentLaunchReadiness = () => {
    const redirectArtifact = currentDeployedRedirectArtifact();
    return buildLaunchReadinessReport({
      generatedAt: reviewedAt || new Date().toISOString(),
      routeMap: {
        summary: summarizeLegacyRouteMap(routeMap),
        routes: routeMap,
      },
      deployableRedirects: redirectArtifact,
      listingQuality: currentListingQualityReport({ generatedAt: reviewedAt || new Date().toISOString() }),
      listingQualityReviewPath: listingQualityReviewPath || undefined,
      seoEvidence: currentSeoEvidence(),
      liveServices: liveServiceReports({
        syncReportPath: searchSyncReportPath || undefined,
        queryReportPath: searchQueryReportPath || undefined,
        hermesReportPath: hermesWorkerReportPath || undefined,
      }),
      liveServiceProvisioning: liveServiceProvisioningState(liveServiceProvisioningReportPath || undefined),
      payloadRuntime: payloadRuntimeState(payloadRuntimeReportPath || undefined),
      productionRecovery: productionRecoveryState(productionRecoveryReportPath || undefined),
    });
  };
  const currentLaunchInputChecklist = () =>
    renderLaunchInputChecklist({
      generatedAt: reviewedAt || new Date().toISOString(),
      launchReadiness: currentLaunchReadiness(),
      seoEvidence: currentSeoEvidence(),
      redirectWorkbookCsv: renderRedirectApprovalWorkbook(
        buildRedirectApprovalWorkbook(attachMigrationReviewEvidence(routeMap, loadMigrationRecords())),
      ),
      deployableRedirects: currentDeployedRedirectArtifact(),
      routeMap: {
        summary: summarizeLegacyRouteMap(routeMap),
        routes: routeMap,
      },
      liveServiceProvisioning: liveServiceProvisioningState(liveServiceProvisioningReportPath || undefined),
    });
  const currentSeoPreflightReport = () =>
    buildSeoEvidencePreflightReport({
      inputDir: seoEvidenceInputDir || undefined,
      events: readEventLedger(eventLedgerPath || undefined),
      generatedAt: reviewedAt || new Date().toISOString(),
    });
  const currentPreflightReports = () => {
    const listingReport = currentListingQualityReport({
      generatedAt: listingQualityGeneratedAt || reviewedAt || new Date().toISOString(),
    });
    return {
      kind: "admin_preflight_reports",
      generated_at: reviewedAt || new Date().toISOString(),
      checklist: {
        endpoint: "/api/admin/launch-input-checklist",
        path: "production/data/launch-input-checklist.md",
        refresh_command: "npm run launch:inputs",
      },
      launch_readiness: launchBlockerSummary(currentLaunchReadiness()),
      reports: {
        seo: currentSeoPreflightReport(),
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
        production_recovery: productionRecoveryState(productionRecoveryReportPath || undefined),
      },
    };
  };
  const recordEvent = (input) =>
    eventLedgerPath ? appendEvent(createEvent(input, receivedAt || new Date().toISOString()), { filePath: eventLedgerPath }) : null;
  const recordConsent = (input) =>
    consentLedgerPath
      ? appendConsentRecord(createConsentRecord(input, receivedAt || new Date().toISOString()), { filePath: consentLedgerPath })
      : null;
  const writeAudit = (input, recordedAt = reviewedAt || editedAt || bookedAt || dealClosedAt || receivedAt || new Date().toISOString()) =>
    auditLogPath
      ? appendAuditLog(createAuditLogEntry(input, recordedAt), {
          filePath: auditLogPath,
        })
      : null;
  const productionSearch = String(search.environment ?? process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
  const currentSearchResult = async (searchRequest, options = {}) => {
    const { intent, query, filters, sort, page } = searchRequest;
    const seedForRequest = currentSeed();
    const translationTasks = currentTranslationTasks();
    const searchOptions = { localeCode: intent.locale, query, filters, sort, page, translationTasks, ...options };
    const localResult = searchRuntimeListings(activeRegistry, seedForRequest, searchOptions);
    const engineResult = await queryPublicSearch({
      ...search,
      q: query,
      intent,
      localeCodes: engineLocaleCodes(seedForRequest, activeRegistry, localResult),
    });
    if (productionSearch && engineResult.engine === "seed_fallback") {
      throw new Error("Production search requires a selected configured engine");
    }
    const result =
      engineResult.engine === "seed_fallback"
        ? localResult
        : searchRuntimeListings(activeRegistry, seedForSearchHits(seedForRequest, engineResult.hits), searchOptions);
    return withSearchBackend(result, engineResult);
  };
  const searchResultOrUnavailable = async (searchRequest, options) => {
    try {
      return { result: await currentSearchResult(searchRequest, options) };
    } catch (error) {
      if (!productionSearch) throw error;
      return { response: json(503, { kind: "search_unavailable", message: "Search is temporarily unavailable" }) };
    }
  };
  return async function handle(request) {
    const url = new URL(request.url, "http://localhost");
    const mcpMetadataRoute =
      url.pathname === "/.well-known/oauth-protected-resource" ||
      url.pathname === "/.well-known/oauth-protected-resource/mcp";
    if (url.pathname === "/mcp" || mcpMetadataRoute) {
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers || {})) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
      }
      const method = String(request.method || "GET").toUpperCase();
      const mcpResponse = await (mcpMetadataRoute ? renderMcpProtectedResourceMetadata : renderMcpResponse)(
        new Request(`http://ms-realty.local${url.pathname}${url.search}`, {
          method,
          headers,
          ...(!["GET", "HEAD"].includes(method) && request.body ? { body: request.body } : {}),
        }),
      );
      return {
        status: mcpResponse.status,
        headers: Object.fromEntries(mcpResponse.headers.entries()),
        body: await mcpResponse.text(),
      };
    }
    const auth = request.headers?.authorization || request.headers?.Authorization || "";
    const adminRequest = url.pathname === "/admin" || url.pathname.startsWith("/admin/") || url.pathname.startsWith("/api/admin/");
    const principal = adminRequest ? resolveAdminPrincipal(auth) : null;
    if (adminRequest && !principal) return adminUnauthorized();
    if (adminRequest && request.method !== "GET" && !canAdminMutate(principal)) return adminOperatorIdentityRequired();
    const requiredCapability = adminRequest ? requiredAdminCapability(request.method, url.pathname) : null;
    if (requiredCapability && !canAdminAccess(principal, requiredCapability)) return adminForbidden(requiredCapability);
    const recordAudit = (input, recordedAt) => writeAudit(withAuthenticatedAuditActor(input, principal), recordedAt);
    if (publicWriteLimiter && request.method === "POST" && PUBLIC_WRITE_PATHS.has(url.pathname)) {
      const verdict = publicWriteLimiter.allow(`${clientIpFromHeaders(request.headers)}:${url.pathname}`);
      if (!verdict.allowed) {
        return response(429, { kind: "rate_limited", retry_after: verdict.retryAfterSec }, "application/json; charset=utf-8", {
          "retry-after": String(verdict.retryAfterSec),
          "cache-control": "no-store",
        });
      }
    }
    const host =
      request.headers?.["x-forwarded-host"] ||
      request.headers?.["X-Forwarded-Host"] ||
      request.headers?.host ||
      request.headers?.Host;
    const legacyUrl = request.url.startsWith("http") ? url.href : host ? `https://${host}${url.pathname}${url.search}` : "";
    const legacyDecision = request.method === "GET" ? activeLegacyDecisionByUrl.get(legacyUrl) || null : null;

    if (legacyDecision?.status === 301) {
      return response(
        301,
        { kind: "legacy_redirect", location: legacyDecision.target_path },
        "application/json; charset=utf-8",
        { location: legacyDecision.target_path },
      );
    }
    if (legacyDecision?.status === 410) {
      return response(410, { kind: "legacy_gone", old_url: legacyDecision.old_url }, "application/json; charset=utf-8");
    }
    if (legacyDecision?.status === 200) {
      const retained = renderRuntimePath(
        activeRegistry,
        currentSeed(),
        legacyDecision.target_path,
        currentTranslationTasks(),
        currentBrokerContacts(),
        currentTourApprovals(),
      );
      if ((retained.status || 200) >= 400) {
        return response(503, { kind: "legacy_retain_unavailable", old_url: legacyDecision.old_url }, "application/json; charset=utf-8", {
          "cache-control": "no-store",
        });
      }
      return publicResponse(request, url, retained);
    }

    const slugRedirect =
      request.method === "GET" ? slugRedirectForPath(currentSlugHistory(), url.pathname) : null;
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
        renderSitemapXml(buildRuntimeLocalizedSitemap(activeRegistry, currentSeed(), currentTranslationTasks())),
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

    if (request.method === "GET" && url.pathname.startsWith("/hero/")) {
      const heroMatch = url.pathname.match(/^\/hero\/([a-z0-9][a-z0-9._-]*\.(avif|webp))$/i);
      if (heroMatch) {
        const heroPath = fromRoot("public", "hero", heroMatch[1]);
        if (fs.existsSync(heroPath)) {
          return response(200, fs.readFileSync(heroPath), `image/${heroMatch[2].toLowerCase()}`, {
            "cache-control": "public, max-age=31536000, immutable",
          });
        }
      }
      return json(404, { kind: "not_found", message: "Unknown hero asset" });
    }

    if (request.method === "GET" && url.pathname.startsWith("/vendor/")) {
      // Versioned browser bundles generated into public/vendor by
      // scripts/build-design-assets.mjs (?v= content hash → immutable cache).
      const vendorMatch = url.pathname.match(/^\/vendor\/([a-z0-9][a-z0-9._-]*\.(js|css|txt|png))$/i);
      if (vendorMatch) {
        const vendorPath = fromRoot("public", "vendor", vendorMatch[1]);
        if (fs.existsSync(vendorPath)) {
          const extension = vendorMatch[2].toLowerCase();
          const vendorTypes = {
            js: "text/javascript; charset=utf-8",
            css: "text/css; charset=utf-8",
            txt: "text/plain; charset=utf-8",
            png: "image/png",
          };
          return response(200, fs.readFileSync(vendorPath, extension === "png" ? undefined : "utf8"), vendorTypes[extension], {
            "cache-control": "public, max-age=31536000, immutable",
          });
        }
      }
      return json(404, { kind: "not_found", message: "Unknown vendor asset" });
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

    if (request.method === "GET" && url.pathname === "/api/geography") {
      return response(
        200,
        geographySuggestionsPayload(loadGeographyRegistry(), {
          query: url.searchParams.get("q") || "",
          countryCode: (url.searchParams.get("country") || "").toUpperCase() || undefined,
          levels: url.searchParams
            .getAll("level")
            .flatMap((value) => value.split(","))
            .filter(Boolean),
          parentId: url.searchParams.get("parent_id") || undefined,
          ancestorId: url.searchParams.get("ancestor_id") || undefined,
          limit: url.searchParams.get("limit") || 20,
        }),
        "application/json; charset=utf-8",
        { "cache-control": "public, max-age=3600, stale-while-revalidate=86400" },
      );
    }

    if (request.method === "GET" && url.pathname === "/api/search") {
      let searchRequest;
      try {
        searchRequest = normalizeSearchRequest(url.searchParams, {
          defaultLocale: url.searchParams.get("locale") || activeRegistry.source_locale,
          naturalLanguageEnabled: naturalLanguageSearchEnabled,
        });
      } catch (error) {
        return json(400, { kind: "bad_request", message: error.message });
      }
      const outcome = await searchResultOrUnavailable(searchRequest);
      if (outcome.response) return outcome.response;
      const { intent, query, filters, sort, page } = searchRequest;
      const result = outcome.result;
      if ((request.headers?.["x-ms-realty-preview"] || request.headers?.["X-MS-REALTY-PREVIEW"]) !== "search-count") {
        recordEvent({ type: "search", path: url.pathname, locale: intent.locale, query, filters, sort, page });
      }
      return json(200, { ...result, search: { ...result.search, intent, natural_language: searchRequest.natural_language } });
    }

    if (request.method === "GET") {
      const normalized = url.pathname.replace(/\/$/, "");
      const searchLocale = activeRegistry.locales.find(
        (locale) => locale.route_segments?.search && `/${locale.code}/${locale.route_segments.search}` === normalized,
      );
      if (searchLocale) {
        let searchRequest;
        try {
          searchRequest = normalizeSearchRequest(url.searchParams, {
            defaultLocale: searchLocale.code,
            naturalLanguageEnabled: naturalLanguageSearchEnabled,
          });
        } catch (error) {
          return json(400, { kind: "bad_request", message: error.message });
        }
        const { intent, query, filters, sort, page } = searchRequest;
        const savedView = url.searchParams.get("saved") === "1";
        const view = url.searchParams.get("view") || "list";
        const outcome = await searchResultOrUnavailable(searchRequest, { pageSize: savedView ? null : 12, savedView, view });
        if (outcome.response) return outcome.response;
        recordEvent({ type: "search", path: url.pathname, locale: intent.locale, query, filters, sort, page });
        return publicResponse(request, url, outcome.result);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/admin/leads") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const requestedLocale = url.searchParams.get("locale") || "en";
      const payload = currentAdminLeadPayload(requestedLocale, principal);
      if (wantsHtml(request, url)) return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      return adminJson(200, payload);
    }

    if (request.method === "GET" && url.pathname === "/admin/leads") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminResponse(
        200,
        adminHtml(currentAdminLeadPayload(url.searchParams.get("locale") || "en", principal)),
        "text/html; charset=utf-8",
      );
    }

    if (request.method === "GET" && ["/api/admin/contacts", "/admin/contacts"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = currentContactPayload(url.searchParams.get("locale") || "en", principal);
      if (url.pathname === "/admin/contacts" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && ["/api/admin/documents", "/admin/documents"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = currentDocumentChecklistPayload(url.searchParams.get("locale") || "en", principal);
      if (url.pathname === "/admin/documents" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && ["/api/admin/cases", "/admin/cases"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = currentRealtyCasePayload(url.searchParams.get("locale") || "en", principal);
      if (url.pathname === "/admin/cases" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && url.pathname === "/api/admin/cases/intents") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminJson(200, currentAutonomousRealtyCaseIntents());
    }

    if (request.method === "GET" && url.pathname === "/api/admin/cases/conditions") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminJson(200, currentRealtyCaseConditionQueue());
    }

    if (request.method === "GET" && ["/api/admin/consents", "/admin/consents"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = currentConsentPayload(url.searchParams.get("locale") || "en", principal);
      if (url.pathname === "/admin/consents" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && url.pathname === "/admin") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const locale = url.searchParams.get("locale") || "en";
      return adminResponse(302, "", "text/plain; charset=utf-8", {
        location: `${adminHomePath(principal)}?locale=${encodeURIComponent(locale)}`,
      });
    }

    if (request.method === "GET" && ["/api/admin/today", "/admin/today"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = currentTodayPayload(url.searchParams.get("locale") || "en", principal);
      if (url.pathname === "/admin/today" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && ["/api/admin/pipeline", "/admin/pipeline"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = currentPipelinePayload(url.searchParams.get("locale") || "en", principal);
      if (url.pathname === "/admin/pipeline" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && ["/api/admin/requests", "/admin/requests"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = currentRequestsPayload(url.searchParams.get("locale") || "en", principal);
      if (url.pathname === "/admin/requests" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && ["/api/admin/viewings", "/admin/viewings"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = currentViewingsPayload(url.searchParams.get("locale") || "en", principal);
      if (url.pathname === "/admin/viewings" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && ["/api/admin/activity", "/admin/activity"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = currentActivityPayload(url, principal);
      if (url.pathname === "/admin/activity" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && ["/api/admin/listings", "/admin/listings"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = currentListingManagerPayload(url, principal);
      if (url.pathname === "/admin/listings" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && ["/api/admin/translations", "/admin/translations"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = currentTranslationQueuePayload(url, principal);
      if (url.pathname === "/admin/translations" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && ["/api/admin/reports", "/admin/reports"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = currentReportsPayload(url.searchParams.get("locale") || "en", principal);
      if (url.pathname === "/admin/reports" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && url.pathname === "/api/admin/reports/export") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminResponse(200, renderOperationsReportCsv(currentOperationsReport()), "text/csv; charset=utf-8", {
        "content-disposition": 'attachment; filename="ms-realty-source-quality.csv"',
      });
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
        return payloadAdminListingHandoff(url.searchParams.get("listingId"));
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "GET" && url.pathname === "/admin/migration/review") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = renderMigrationReviewPayload(
        activeRegistry,
        url,
        migrationReviewDashboard,
        routeMap,
        readRedirectApprovals(redirectApprovalPath || undefined),
        currentSeoEvidence(),
        currentListingQualityReviewQueue({ generatedAt: listingQualityGeneratedAt }),
        currentLaunchReadiness(),
      );
      return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
    }

    if (request.method === "GET" && url.pathname === "/api/admin/migration/review") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const approvals = readRedirectApprovals(redirectApprovalPath || undefined);
      const payload = renderMigrationReviewPayload(
        activeRegistry,
        url,
        migrationReviewDashboard,
        routeMap,
        approvals,
        currentSeoEvidence(),
        currentListingQualityReviewQueue({ generatedAt: listingQualityGeneratedAt }),
        currentLaunchReadiness(),
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

    if (request.method === "GET" && url.pathname === "/api/admin/seo-preflight") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminJson(200, { kind: "admin_seo_preflight", seo: currentSeoPreflightReport() });
    }

    if (request.method === "GET" && url.pathname === "/api/admin/listing-quality") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const generatedAt = listingQualityGeneratedAt || reviewedAt || new Date().toISOString();
      return adminJson(200, {
        kind: "admin_listing_quality",
        listing_quality: buildListingQualityPreflightReport({
          report: currentListingQualityReport({ generatedAt }),
          reviewPath: listingQualityReviewPath || undefined,
          generatedAt,
        }),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/admin/live-services") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminJson(200, {
        kind: "admin_live_services",
        live_services: buildLiveServicePreflightReport({
          generatedAt: reviewedAt || new Date().toISOString(),
          syncReportPath: searchSyncReportPath || undefined,
          queryReportPath: searchQueryReportPath || undefined,
          hermesReportPath: hermesWorkerReportPath || undefined,
        }),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/admin/live-service-provisioning") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminJson(200, {
        kind: "admin_live_service_provisioning",
        provisioning: liveServiceProvisioningState(liveServiceProvisioningReportPath || undefined),
      });
    }

    if (request.method === "POST" && url.pathname === "/api/admin/live-service-provisioning/import") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const report = reportJsonInput(parseJsonBody(request));
        const outPath = writeLiveServiceProvisioningReport(report, liveServiceProvisioningReportPath || undefined);
        const provisioning = liveServiceProvisioningState(liveServiceProvisioningReportPath || undefined);
        recordAudit({
          action: "live_service_provisioning_report_imported",
          actor: "operations",
          objectType: "live_service_provisioning_report",
          objectId: "live-service-provisioning",
          metadata: {
            missing_env: provisioning.summary?.missing_env || [],
            out_path: outPath,
            status: report.status,
          },
        });
        return adminJson(report.ready ? 201 : 202, { imported: { outPath, summary: report.summary }, provisioning, report: currentLaunchReadiness() });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/admin/payload-runtime") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminJson(200, {
        kind: "admin_payload_runtime",
        runtime: payloadRuntimeState(payloadRuntimeReportPath || undefined),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/admin/payload-runtime-bootstrap") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminJson(200, payloadRuntimeBootstrapPayload());
    }

    if (request.method === "GET" && url.pathname === "/api/admin/production-recovery") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminJson(200, {
        kind: "admin_production_recovery",
        recovery: productionRecoveryState(productionRecoveryReportPath || undefined),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/admin/production-recovery-template") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminResponse(200, readProductionRecoveryTemplate(), "application/json; charset=utf-8", {
        "content-disposition": 'attachment; filename="production-recovery-report.json.example"',
      });
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
        const liveImport = liveServiceImportSummary(imported, livePreflight);
        recordAudit({
          action: "live_service_report_imported",
          actor: "operations",
          objectType: "live_service_report",
          objectId: input.source,
          metadata: {
            blocked_reports: liveImport.blockedReports.map((report) => report.source),
            status: input.report?.status,
            out_path: imported.outPath,
          },
        });
        return adminJson(livePreflight.ready ? 201 : 202, { imported, liveImport, livePreflight, report: currentLaunchReadiness() });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/payload-runtime/import") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const report = reportJsonInput(parseJsonBody(request));
        const outPath = writePayloadRuntimeReport(report, payloadRuntimeReportPath || undefined);
        const runtime = payloadRuntimeImportSummary(report);
        recordAudit({
          action: "payload_runtime_report_imported",
          actor: "operations",
          objectType: "payload_runtime_report",
          objectId: "payload-runtime",
          metadata: {
            blocked_checks: runtime.blockedChecks,
            missing_env: runtime.missingEnv,
            out_path: outPath,
            placeholder_env: runtime.placeholderEnv,
            status: report.status,
            weak_env: runtime.weakEnv,
          },
        });
        return adminJson(report.ready ? 201 : 202, { imported: { outPath, summary: report.summary }, report: currentLaunchReadiness(), runtime });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/production-recovery/import") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const report = reportJsonInput(parseJsonBody(request));
        const outPath = writeProductionRecoveryReport(report, productionRecoveryReportPath || undefined);
        const recovery = productionRecoveryState(productionRecoveryReportPath || undefined);
        recordAudit({
          action: "production_recovery_report_imported",
          actor: "operations",
          objectType: "production_recovery_report",
          objectId: report.backup.backup_id,
          metadata: {
            backup_id: report.backup.backup_id,
            drill_id: report.restore_drill.drill_id,
            out_path: outPath,
            provider: report.policy.provider,
            status: recovery.status,
          },
        });
        return adminJson(201, { imported: { outPath }, recovery, report: currentLaunchReadiness() });
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
        const result = importAppSeoEvidenceRows(input, {
          seoEvidenceInputDir: seoEvidenceInputDir || undefined,
          seoEvidenceOutputPath: seoEvidenceOutputPath || undefined,
          reviewedAt: reviewedAt || new Date().toISOString(),
        });
        recordAudit({
          action: "seo_evidence_imported",
          actor: "seo_editor",
          objectType: "seo_evidence",
          objectId: input.source,
          metadata: {
            row_count: result.imported.row_count,
            missing_required_sources: result.missingRequiredSources,
          },
        });
        return adminJson(result.missingRequiredSources.length ? 202 : 201, {
          ...result,
          report: currentLaunchReadiness(),
        });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/admin/seo-evidence/export") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminResponse(200, `${JSON.stringify(currentSeoEvidence(), null, 2)}\n`, "application/json; charset=utf-8", {
        "content-disposition": 'attachment; filename="seo-evidence.json"',
      });
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
          terminalDecisionPreview: buildLegacyRouteDecisions(routeMap, approvals),
          report: currentLaunchReadiness(),
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
          terminalDecisionPreview: buildLegacyRouteDecisions(routeMap, approvals),
          report: currentLaunchReadiness(),
        });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/deployable-redirects/export") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const approvals = readRedirectApprovals(redirectApprovalPath || undefined);
        const rows = buildDeployableRedirects(routeMap, approvals);
        const decisions = buildLegacyRouteDecisions(routeMap, approvals);
        const written = writeDeployableRedirects(rows, deployableRedirectOutputPath || undefined, { decisions });
        recordAudit({
          action: "deployable_redirects_exported",
          actor: "seo_editor",
          objectType: "redirect_export",
          objectId: "deployable-redirects",
          metadata: { exported: rows.length, terminal_decisions: decisions.length, total: written.summary?.total },
        });
        return adminJson(201, { exported: rows.length, ...written, report: currentLaunchReadiness() });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/admin/redirect-approval-workbook") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const reviewRoutes = attachMigrationReviewEvidence(routeMap, loadMigrationRecords());
      const rows = url.searchParams.get("pending")
        ? buildPendingRedirectApprovalWorkbook(reviewRoutes, readRedirectApprovals(redirectApprovalPath || undefined))
        : buildRedirectApprovalWorkbook(reviewRoutes);
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
        renderListingQualityWorkbook(currentListingQualityReport()),
        "text/csv; charset=utf-8",
        { "content-disposition": 'attachment; filename="listing-quality-workbook.csv"' },
      );
    }

    if (request.method === "GET" && url.pathname === "/api/admin/listing-quality-review-draft") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminResponse(
        200,
        renderListingQualityReviewDraft(currentListingQualityReport()),
        "text/csv; charset=utf-8",
        { "content-disposition": 'attachment; filename="listing-quality-review-draft.csv"' },
      );
    }

    if (request.method === "GET" && url.pathname === "/api/admin/listing-quality-review-packet") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const generatedAt = reviewedAt || new Date().toISOString();
      return adminJson(
        200,
        buildListingQualityReviewPacket({
          generatedAt,
          report: currentListingQualityReport({ generatedAt }),
          reviewPath: listingQualityReviewPath || undefined,
        }),
      );
    }

    if (request.method === "POST" && url.pathname === "/api/admin/listing-quality/import") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = listingQualityReviewInput(request);
        const inputCsv = input.csv;
        const report = currentListingQualityReport();
        const review = validateListingQualityReviewCsv(report, inputCsv, { requireSnapshots: true });
        const reviewOutputPath = listingQualityReviewPath || DEFAULT_LISTING_QUALITY_REVIEW_INPUT;
        const existingReviewCsv = fs.existsSync(reviewOutputPath) ? fs.readFileSync(reviewOutputPath, "utf8") : "";
        const mergedReviewCsv = mergeListingQualityReviewCsv(existingReviewCsv, inputCsv);
        const mergedReview = validateListingQualityReviewCsv(report, mergedReviewCsv, {
          allowExtraRows: true,
          allowResolvedSnapshots: true,
          requireSnapshots: true,
        });
        const translationTasks = latestTranslationTasks(currentTranslationTasks());
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
                review_source: input.source,
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
        let reviewPath = null;
        let reviewPersistenceError = "";
        try {
          reviewPath = writeListingQualityReviewCsv(mergedReviewCsv, reviewOutputPath);
        } catch (error) {
          reviewPersistenceError = error.message;
        }
        recordAudit({
          action: "listing_quality_imported",
          actor: "listing_quality_editor",
          objectType: "listing_quality_review",
          objectId: review.reviews.length === 1 ? review.reviews[0].listing_id : `listing-quality-${review.summary.review_rows}`,
          metadata: {
            source: input.source,
            imported: review.summary.review_rows,
            edited: edits.length,
            media_review_rows: review.summary.media_review_rows,
            missing_review_rows: mergedReview.summary.missing_review_rows,
            review_persisted: Boolean(reviewPath),
          },
        });
        const reviewImport = listingQualityImportSummary(report, mergedReview, { reviewPath, reviewPersistenceError });
        return adminJson(reviewImport.ready ? 201 : 202, {
          imported: review.summary.review_rows,
          edited: edits.length,
          factsReviewRows: review.summary.facts_review_rows,
          mediaReviewRows: review.summary.media_review_rows,
          missingReviewRows: mergedReview.summary.missing_review_rows,
          report: currentLaunchReadiness(),
          reviewImport,
          reviewSummary: mergedReview.summary,
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

    if (request.method === "POST" && url.pathname === "/api/admin/translations/approve") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = parseJsonBody(request);
        const task = latestTranslationTasks(currentTranslationTasks()).find((row) => row.id === input.taskId);
        if (!task) throw new Error("Known translation task is required");
        const approved = appendTranslationTask(approveTranslationTask(activeRegistry, task, input.reviewer, input.approvedAt), {
          filePath: translationLedgerPath || undefined,
        });
        recordAudit({
          action: "translation_approved",
          actor: approved.reviewer,
          objectType: approved.object_type,
          objectId: approved.id,
          locale: approved.target_locale,
          metadata: { object_id: approved.object_id, status: approved.status, public_indexable: approved.public_indexable },
        });
        return adminJson(201, approved);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/translations/publish") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = parseJsonBody(request);
        const task = latestTranslationTasks(currentTranslationTasks()).find((row) => row.id === input.taskId);
        if (!task) throw new Error("Known translation task is required");
        const published = publishApprovedTranslation(activeRegistry, task);
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
        return adminJson(409, {
          kind: "payload_canonical",
          message: "Listing edits are managed in Payload.",
          canonical_url: payloadAdminListingPath(input.listingId),
        });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/media/reviews") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = bindAuthenticatedOperator(parseBody(request), principal, ["reviewer"]);
        const review = createMediaReview(currentSeed(), input, reviewedAt);
        const persisted = appendMediaReview(review, { filePath: mediaReviewLedgerPath || undefined });
        if (!persisted.idempotent) {
          recordAudit({
            action: "media_reviewed",
            actor: persisted.reviewer,
            objectType: "media_asset",
            objectId: persisted.asset_id,
            metadata: {
              listing_id: persisted.listing_id,
              decision: persisted.decision,
              kind: persisted.kind,
              is_public: persisted.is_public,
            },
          });
        }
        return adminJson(persisted.idempotent ? 200 : 201, persisted);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/listings/status") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = bindAuthenticatedOperator(parseBody(request), principal, ["editor"]);
        const batch = createBulkListingStatusEdits(
          currentSeed(),
          input,
          latestTranslationTasks(currentTranslationTasks()),
          editedAt,
        );
        const changes = batch.changes.map((result) => {
          const edit = appendListingEdit(result.edit, { filePath: listingEditLedgerPath || undefined });
          const persistedStaleTranslations = edit.idempotent
            ? []
            : result.staleTranslations
                .filter((translation) => translation.id)
                .map((translation) => appendTranslationTask(translation, { filePath: translationLedgerPath || undefined }));
          if (!edit.idempotent) {
            recordAudit({
              action: "listing_edited",
              actor: edit.editor,
              objectType: "listing",
              objectId: edit.listing_id,
              metadata: {
                changed_fields: ["listing_status"],
                bulk_request_id: input.requestId || null,
                stale_translation_count: result.staleTranslations.length,
              },
            });
          }
          return { edit, persistedStaleTranslations };
        });
        const body = {
          kind: "bulk_listing_status_update",
          targetStatus: batch.targetStatus,
          requested: batch.requestedListingIds.length,
          updated: changes.filter((result) => !result.edit.idempotent).length,
          idempotent: changes.filter((result) => result.edit.idempotent).length,
          unchanged: batch.unchangedListingIds.length,
          unchangedListingIds: batch.unchangedListingIds,
          edits: changes.map((result) => result.edit),
          staleTranslations: batch.changes.flatMap((result) => result.staleTranslations),
        };
        return adminJson(body.updated ? 201 : 200, body);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/listings/publication-schedules") {
      try {
        const input = bindAuthenticatedOperator(parseBody(request), principal, ["actor"]);
        const schedule = appendListingPublicationSchedule(currentSeed(), input, {
          filePath: listingPublicationSchedulePath || undefined,
          createdAt: listingPublicationAt || editedAt,
        });
        if (
          !readAuditLog(auditLogPath || undefined).some(
            (row) => row.action === "listing_publication_scheduled" && row.object_id === schedule.schedule_id,
          )
        ) {
          recordAudit(
            {
              action: "listing_publication_scheduled",
              actor: schedule.actor,
              objectType: "listing_publication_schedule",
              objectId: schedule.schedule_id,
              metadata: {
                listing_id: schedule.listing_id,
                publication_action: schedule.action,
                target_status: schedule.target_status,
                scheduled_at: schedule.scheduled_at,
              },
            },
            schedule.created_at,
          );
        }
        return adminJson(schedule.idempotent ? 200 : 201, {
          schedule,
          queue: buildListingPublicationScheduleQueue(
            readListingPublicationSchedules(listingPublicationSchedulePath || undefined),
            { now: listingPublicationAt || reviewedAt || editedAt || new Date().toISOString() },
          ),
        });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/listings/publication-schedules/cancel") {
      try {
        const input = bindAuthenticatedOperator(parseBody(request), principal, ["actor"]);
        const cancellation = cancelListingPublicationSchedule(input, {
          filePath: listingPublicationSchedulePath || undefined,
          cancelledAt: listingPublicationAt || editedAt,
        });
        if (
          !readAuditLog(auditLogPath || undefined).some(
            (row) => row.action === "listing_publication_cancelled" && row.object_id === cancellation.schedule_id,
          )
        ) {
          recordAudit(
            {
              action: "listing_publication_cancelled",
              actor: cancellation.actor,
              objectType: "listing_publication_schedule",
              objectId: cancellation.schedule_id,
              metadata: { reason: cancellation.reason },
            },
            cancellation.cancelled_at,
          );
        }
        return adminJson(cancellation.idempotent ? 200 : 201, { cancellation });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/listings/publication-schedules/run-due") {
      try {
        const result = executeDueListingPublicationSchedules({
          seed: currentSeed(),
          schedules: readListingPublicationSchedules(listingPublicationSchedulePath || undefined),
          translationTasks: latestTranslationTasks(currentTranslationTasks()),
          executor: principal?.id,
          now: listingPublicationAt || editedAt || new Date().toISOString(),
          scheduleFilePath: listingPublicationSchedulePath || undefined,
          listingEditFilePath: listingEditLedgerPath || undefined,
          translationLedgerPath: translationLedgerPath || undefined,
        });
        for (const auditRecord of listingPublicationExecutionAuditRecords(result.queue)) {
          const existing = readAuditLog(auditLogPath || undefined).some(
            (audit) => audit.action === auditRecord.input.action && audit.object_id === auditRecord.input.objectId,
          );
          if (!existing) {
            recordAudit(auditRecord.input, auditRecord.recordedAt);
          }
        }
        return adminJson(200, result);
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
        const existingAudit = auditLogPath
          ? readAuditLog(auditLogPath).some((row) => row.action === "reply_approved" && row.object_id === reply.id)
          : false;
        if (!existingAudit) {
          recordAudit({
            action: "reply_approved",
            actor: reply.reviewer,
            objectType: "reply",
            objectId: reply.id,
            locale: reply.reply_language,
            metadata: { lead_id: reply.lead_id, hermes_draft_used: reply.hermes_draft_used, status: reply.status },
          });
        }
        return adminJson(reply.idempotent ? 200 : 201, reply);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/replies/delivery") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const recordedAt = replyDeliveredAt || reviewedAt || receivedAt || new Date().toISOString();
        const result = appendReplyDeliveryOutcome(
          readReplyOutbox(replyOutboxPath || undefined),
          bindAuthenticatedOperator(parseBody(request), principal),
          { filePath: replyDeliveryOutcomeLedgerPath || undefined, recordedAt },
        );
        const existingAudit = auditLogPath
          ? readAuditLog(auditLogPath).some(
              (row) => row.action === "reply_delivery_recorded" && row.object_id === result.outcome.id,
            )
          : false;
        if (!existingAudit) {
          recordAudit(
            {
              action: "reply_delivery_recorded",
              actor: result.outcome.actor,
              objectType: "reply_delivery_outcome",
              objectId: result.outcome.id,
              locale: result.delivery.reply_language,
              metadata: {
                reply_id: result.delivery.reply_id,
                lead_id: result.delivery.lead_id,
                action: result.outcome.action,
                channel: result.outcome.channel,
                status: result.delivery.status,
                sent_at: result.delivery.sent_at,
              },
            },
            recordedAt,
          );
        }
        return adminJson(result.idempotent ? 200 : 201, result);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/lead-pipeline/outcome") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const recordedAt = leadPipelineOutcomeAt || reviewedAt || bookedAt || receivedAt || new Date().toISOString();
        const result = appendLeadPipelineOutcome(
          currentLeadJourneyContext(),
          bindAuthenticatedOperator(parseBody(request), principal),
          { filePath: leadPipelineOutcomeLedgerPath || undefined, recordedAt },
        );
        const existingAudit = auditLogPath
          ? readAuditLog(auditLogPath).some(
              (row) => row.action === "lead_pipeline_outcome_recorded" && row.object_id === result.outcome.id,
            )
          : false;
        if (!existingAudit) {
          recordAudit(
            {
              action: "lead_pipeline_outcome_recorded",
              actor: result.outcome.actor,
              objectType: "lead_pipeline_outcome",
              objectId: result.outcome.id,
              locale: result.lead_pipeline.original_language,
              metadata: {
                lead_id: result.outcome.lead_id,
                pipeline: result.outcome.pipeline,
                action: result.outcome.action,
                from_stage: result.outcome.from_stage,
                to_stage: result.outcome.to_stage,
                next_follow_up_at: result.outcome.next_follow_up_at,
              },
            },
            recordedAt,
          );
        }
        return adminJson(result.idempotent ? 200 : 201, result);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/leads") {
      try {
        if (!leadContactVaultPath || !leadContactKey) {
          throw new Error("Encrypted lead contact storage is not configured");
        }
        const input = normalizeBrokerLeadInput(parseBody(request));
        const leadId = String(input.id || `broker-lead-${randomUUID()}`).trim();
        const existing = currentLeads().find((row) => row.lead_id === leadId);
        if (existing) return adminJson(200, { lead: existing, idempotent: true });
        const lead = createCrmInboxItem(activeRegistry, { ...input, id: leadId });
        const contactVault = appendLeadContact(lead, {
          filePath: leadContactVaultPath,
          secret: leadContactKey,
          storedAt: receivedAt,
        });
        const ledger = appendLead(lead, { filePath: leadLedgerPath || undefined, receivedAt });
        const consent = recordConsent({
          consentType: "inquiry_follow_up",
          source: lead.lead.source,
          subjectId: lead.lead.id,
          locale: lead.original_language,
          contact: lead.lead.contact,
          marketingOptIn: false,
        });
        const sellerPipeline =
          sellerPipelinePath && lead.lead.leadType === "seller"
            ? appendSellerPipeline(createSellerPipelineItem(lead, { createdAt: sellerPipelineCreatedAt || receivedAt }), {
                filePath: sellerPipelinePath,
              })
            : null;
        recordAudit({
          action: "lead_created",
          objectType: "lead",
          objectId: lead.lead.id,
          locale: lead.original_language,
          metadata: {
            source: lead.lead.source,
            lead_type: lead.lead.leadType,
            assigned_broker: lead.broker_assignment.broker_id,
            intake_complete: lead.lead.intake.complete,
          },
        });
        return adminJson(201, { lead, ledger, contactVault, consent, sellerPipeline, idempotent: false });
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/leads/assign") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = bindAuthenticatedOperator(parseBody(request), principal, ["actor"]);
        const assignment = createLeadAssignment(currentLeads(), input, reviewedAt || receivedAt || new Date().toISOString());
        const persisted = appendLeadAssignment(assignment, { filePath: leadAssignmentLedgerPath || undefined });
        if (!persisted.idempotent) {
          recordAudit({
            action: "lead_assigned",
            actor: persisted.assigned_by,
            objectType: "lead_assignment",
            objectId: persisted.id,
            metadata: {
              lead_id: persisted.lead_id,
              previous_broker_id: persisted.previous_broker_id,
              broker_id: persisted.broker_id,
              assignment_method: persisted.assignment_method,
            },
          });
        }
        return adminJson(persisted.idempotent ? 200 : 201, persisted);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/accounts") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = bindAuthenticatedOperator(parseBody(request), principal, ["actor"]);
        const result = appendAccountCreation(input, {
          filePath: accountLedgerPath || undefined,
          recordedAt: reviewedAt || receivedAt || new Date().toISOString(),
        });
        if (!result.idempotent) {
          recordAudit({
            action: "account_created",
            actor: result.actor,
            objectType: "account",
            objectId: result.account_id,
            metadata: { account_type: result.account_type },
          });
        }
        return adminJson(result.idempotent ? 200 : 201, result);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/accounts/link") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = bindAuthenticatedOperator(parseBody(request), principal, ["actor"]);
        const contacts = currentContactPayload("en", principal).contacts;
        const result = appendAccountContactLink(contacts, input, {
          filePath: accountLedgerPath || undefined,
          recordedAt: reviewedAt || receivedAt || new Date().toISOString(),
        });
        if (!result.idempotent) {
          recordAudit({
            action: "contact_linked",
            actor: result.actor,
            objectType: "account_contact",
            objectId: result.id,
            metadata: { account_id: result.account_id, contact_id: result.contact_id },
          });
        }
        return adminJson(result.idempotent ? 200 : 201, result);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/documents/outcome") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = bindAuthenticatedOperator(parseBody(request), principal, ["actor"]);
        const result = appendDocumentChecklistOutcome(currentLeads(), input, {
          filePath: documentChecklistLedgerPath || undefined,
          recordedAt: reviewedAt || receivedAt || new Date().toISOString(),
        });
        if (!result.idempotent) {
          recordAudit({
            action: "document_checklist_updated",
            actor: result.outcome.actor,
            objectType: "document_checklist_item",
            objectId: result.outcome.id,
            locale: result.checklist.original_language,
            metadata: {
              lead_id: result.outcome.lead_id,
              item_key: result.outcome.item_key,
              status: result.outcome.status,
              has_reference: Boolean(result.outcome.reference),
            },
          });
        }
        return adminJson(result.idempotent ? 200 : 201, result);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/cases") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = parseBody(request);
        if (
          assertRealtyCaseRequestProjectionConfig({
            realtyCaseRequestProjectionEnabled,
            realtyCaseWorkspaceId,
            realtyCasePayloadProjector,
            realtyCasePayloadRuntimeConfigured,
          })
        ) {
          assertRealtyCaseRequestProjectionInput(input);
        }
        const recordedAt = realtyCaseRecordedAt || reviewedAt || receivedAt || new Date().toISOString();
        const result = openRealtyCase(bindRealtyCaseExecutor(input, principal), {
          filePath: realtyCaseLedgerPath || undefined,
          recordedAt,
        });
        const audited = auditLogPath
          ? readAuditLog(auditLogPath).some(
              (row) => row.action === "realty_case_opened" && row.object_id === result.case.id,
            )
          : false;
        if (!audited) {
          recordAudit({
            action: "realty_case_opened",
            actor: result.event.actor,
            objectType: "realty_case",
            objectId: result.case.id,
            metadata: {
              jurisdiction: result.case.jurisdiction,
              case_type: result.case.case_type,
              asset_kind: result.case.asset_kind,
              execution_mode: result.case.execution_mode,
              workflow_version: result.case.workflow_version,
            },
          }, recordedAt);
        }
        try {
          const projection = await projectCurrentRealtyCase(result);
          return adminJson(result.idempotent ? 200 : 201, projection ? { ...result, projection } : result);
        } catch {
          return adminJson(503, realtyCaseRequestProjectionFailure(result));
        }
      } catch (error) {
        if (error.status === 403) return adminForbidden(error.capability || "administration:write");
        if (error.status === 503) return adminJson(503, realtyCaseRequestProjectionFailure());
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/cases/actions") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = parseBody(request);
        if (
          assertRealtyCaseRequestProjectionConfig({
            realtyCaseRequestProjectionEnabled,
            realtyCaseWorkspaceId,
            realtyCasePayloadProjector,
            realtyCasePayloadRuntimeConfigured,
          })
        ) {
          assertRealtyCaseRequestProjectionInput(input, { action: true });
        }
        const recordedAt = realtyCaseRecordedAt || reviewedAt || receivedAt || new Date().toISOString();
        const result = appendRealtyCaseAction(bindRealtyCaseExecutor(input, principal), {
          filePath: realtyCaseLedgerPath || undefined,
          recordedAt,
        });
        const audited = auditLogPath
          ? readAuditLog(auditLogPath).some(
              (row) => row.action === "realty_case_action_recorded" && row.object_id === result.event.id,
            )
          : false;
        if (!audited) {
          recordAudit({
            action: "realty_case_action_recorded",
            actor: result.event.actor,
            objectType: "realty_case_event",
            objectId: result.event.id,
            metadata: {
              case_id: result.case.id,
              case_action: result.event.action,
              step_key: result.event.step_key,
              execution_mode: result.case.execution_mode,
              executor_kind: result.event.executor_kind,
              case_status: result.case.status,
              progress_percent: result.case.progress_percent,
            },
          }, recordedAt);
        }
        try {
          const projection = await projectCurrentRealtyCase(result);
          return adminJson(result.idempotent ? 200 : 201, projection ? { ...result, projection } : result);
        } catch {
          return adminJson(503, realtyCaseRequestProjectionFailure(result));
        }
      } catch (error) {
        if (error.status === 403) return adminForbidden(error.capability || "administration:write");
        if (error.status === 503) return adminJson(503, realtyCaseRequestProjectionFailure());
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/cases/conditions") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      let result;
      try {
        const input = parseBody(request);
        if (
          assertRealtyCaseRequestProjectionConfig({
            realtyCaseRequestProjectionEnabled,
            realtyCaseWorkspaceId,
            realtyCasePayloadProjector,
            realtyCasePayloadRuntimeConfigured,
          })
        ) {
          assertRealtyCaseRequestProjectionInput(input);
        }
        const recordedAt = realtyCaseRecordedAt || reviewedAt || receivedAt || new Date().toISOString();
        result = openRealtyCaseCondition(
          bindRealtyCaseConditionExecutor(input, principal, "condition_opened"),
          {
            filePath: realtyCaseConditionLedgerPath || undefined,
            caseLedgerPath: realtyCaseLedgerPath || undefined,
            recordedAt,
          },
        );
        const audited = auditLogPath
          ? readAuditLog(auditLogPath).some(
              (row) => row.action === "realty_case_condition_opened" && row.object_id === result.event.id,
            )
          : false;
        if (!audited) {
          recordAudit({
            action: "realty_case_condition_opened",
            actor: result.event.actor,
            objectType: "realty_case_condition_event",
            objectId: result.event.id,
            metadata: {
              case_id: result.condition.case_id,
              condition_id: result.condition.id,
              condition_type: result.condition.type,
              executor_kind: result.event.executor_kind,
            },
          }, recordedAt);
        }
      } catch (error) {
        if (error.status === 403) return adminForbidden(error.capability || "administration:write");
        if (error.status === 503) return adminJson(503, realtyCaseRequestProjectionFailure());
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
      try {
        const projection = await projectCurrentRealtyCaseCondition(result);
        return adminJson(result.idempotent ? 200 : 201, projection ? { ...result, projection } : result);
      } catch {
        return adminJson(503, realtyCaseRequestProjectionFailure(result));
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/cases/conditions/actions") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      let result;
      try {
        const input = parseBody(request);
        if (
          assertRealtyCaseRequestProjectionConfig({
            realtyCaseRequestProjectionEnabled,
            realtyCaseWorkspaceId,
            realtyCasePayloadProjector,
            realtyCasePayloadRuntimeConfigured,
          })
        ) {
          assertRealtyCaseRequestProjectionInput(input, { conditionAction: true });
        }
        const recordedAt = realtyCaseRecordedAt || reviewedAt || receivedAt || new Date().toISOString();
        result = appendRealtyCaseConditionAction(
          bindRealtyCaseConditionExecutor(input, principal, input?.action),
          {
            filePath: realtyCaseConditionLedgerPath || undefined,
            caseLedgerPath: realtyCaseLedgerPath || undefined,
            recordedAt,
          },
        );
        const audited = auditLogPath
          ? readAuditLog(auditLogPath).some(
              (row) => row.action === "realty_case_condition_action_recorded" && row.object_id === result.event.id,
            )
          : false;
        if (!audited) {
          recordAudit({
            action: "realty_case_condition_action_recorded",
            actor: result.event.actor,
            objectType: "realty_case_condition_event",
            objectId: result.event.id,
            metadata: {
              case_id: result.condition.case_id,
              condition_id: result.condition.id,
              condition_action: result.event.action,
              condition_status: result.condition.status,
              executor_kind: result.event.executor_kind,
            },
          }, recordedAt);
        }
      } catch (error) {
        if (error.status === 403) return adminForbidden(error.capability || "administration:write");
        if (error.status === 503) return adminJson(503, realtyCaseRequestProjectionFailure());
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
      try {
        const projection = await projectCurrentRealtyCaseCondition(result);
        return adminJson(result.idempotent ? 200 : 201, projection ? { ...result, projection } : result);
      } catch {
        return adminJson(503, realtyCaseRequestProjectionFailure(result));
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/consents/withdraw") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = bindAuthenticatedOperator(parseBody(request), principal, ["actor"]);
        const result = createConsentWithdrawal(
          input,
          readConsentLedger(consentLedgerPath || undefined),
          reviewedAt || receivedAt || new Date().toISOString(),
        );
        if (!result.idempotent) {
          appendConsentRecord(result.record, { filePath: consentLedgerPath || undefined });
          recordAudit({
            action: "consent_withdrawn",
            actor: result.record.actor,
            objectType: "consent",
            objectId: result.record.subject_id,
            locale: result.record.locale,
            metadata: {
              consent_type: result.record.consent_type,
              reason_code: result.record.reason_code,
              granted: false,
            },
          });
        }
        return adminJson(result.idempotent ? 200 : 201, result);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/replies/draft") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const draft = await createHermesReplyDraft(readLeadLedger(leadLedgerPath || undefined), parseJsonBody(request), {
          auditLogPath: auditLogPath || undefined,
          provider: hermesReplyProvider || undefined,
          recordedAt: reviewedAt || editedAt || receivedAt,
        });
        return adminJson(201, draft);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/viewings") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = bindAuthenticatedOperator(parseJsonBody(request), principal, ["broker"]);
        const viewing = appendViewing(currentLeadJourneyContext(), input, {
          filePath: viewingLedgerPath || undefined,
          bookedAt,
        });
        if (!viewing.idempotent) {
          recordAudit({
            action: "viewing_booked",
            actor: viewing.broker,
            objectType: "viewing",
            objectId: viewing.id,
            locale: viewing.original_language,
            metadata: { lead_id: viewing.lead_id, listing_reference: viewing.listing_reference, status: viewing.status },
          });
        }
        return adminJson(viewing.idempotent ? 200 : 201, viewing);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/viewings/follow-up") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const recordedAt = viewingFollowUpAt || reviewedAt || bookedAt || receivedAt || new Date().toISOString();
        const result = appendViewingFollowUp(readViewings(viewingLedgerPath || undefined), bindAuthenticatedOperator(parseBody(request), principal), {
          filePath: viewingFollowUpLedgerPath || undefined,
          recordedAt,
        });
        if (!result.idempotent) {
          recordAudit({
            action: "viewing_follow_up_recorded",
            actor: result.follow_up.actor,
            objectType: "viewing_follow_up",
            objectId: result.follow_up.id,
            locale: result.viewing.original_language,
            metadata: {
              viewing_id: result.viewing.id,
              lead_id: result.viewing.lead_id,
              task: result.follow_up.task,
              action: result.follow_up.action,
              viewing_status: result.viewing.status,
              due_at: result.follow_up.due_at || result.follow_up.starts_at || null,
            },
          }, recordedAt);
        }
        return adminJson(result.idempotent ? 200 : 201, result);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/seller-pipeline/outcome") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const recordedAt = sellerPipelineOutcomeAt || reviewedAt || bookedAt || receivedAt || new Date().toISOString();
        const input = bindAuthenticatedOperator(parseBody(request), principal);
        if ((input.commissionEur ?? input.commission_eur) !== undefined && !canAdminAccess(principal, "financials:write")) {
          return adminForbidden("financials:write");
        }
        const result = appendSellerPipelineOutcome(readSellerPipeline(sellerPipelinePath || undefined), input, {
          filePath: sellerPipelineOutcomeLedgerPath || undefined,
          recordedAt,
        });
        // ponytail: separate JSONL ledgers are not transactional; an idempotent retry repairs a missing summary audit.
        if (
          auditLogPath &&
          !readAuditLog(auditLogPath).some((row) => row.action === "seller_pipeline_outcome_recorded" && row.object_id === result.outcome.id)
        ) {
          recordAudit(
            {
              action: "seller_pipeline_outcome_recorded",
              actor: result.outcome.actor,
              objectType: "seller_pipeline_outcome",
              objectId: result.outcome.id,
              locale: result.seller_pipeline.original_language,
              metadata: {
                seller_pipeline_id: result.seller_pipeline.id,
                lead_id: result.seller_pipeline.lead_id,
                action: result.outcome.action,
                stage: result.seller_pipeline.stage,
                due_at: result.seller_pipeline.next_task?.due_at || null,
              },
            },
            recordedAt,
          );
        }
        return adminJson(result.idempotent ? 200 : 201, result);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/public-requests/outcome") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const recordedAt = publicRequestOutcomeAt || reviewedAt || receivedAt || new Date().toISOString();
        const result = appendPublicRequestOutcome(
          {
            savedSearches: readSavedSearches(savedSearchLedgerPath || undefined),
            languageRequests: readLanguageRequests(languageRequestPath || undefined),
          },
          bindAuthenticatedOperator(parseBody(request), principal),
          { filePath: publicRequestOutcomeLedgerPath || undefined, recordedAt },
        );
        const existingAudit = auditLogPath
          ? readAuditLog(auditLogPath).some(
              (row) => row.action === "public_request_outcome_recorded" && row.object_id === result.outcome.id,
            )
          : false;
        if (!existingAudit) {
          recordAudit(
            {
              action: "public_request_outcome_recorded",
              actor: result.outcome.actor,
              objectType: "public_request_outcome",
              objectId: result.outcome.id,
              locale: result.request.requested_locale,
              metadata: {
                request_type: result.request.request_type,
                request_id: result.request.request_id,
                action: result.outcome.action,
                status: result.request.status,
                next_follow_up_at: result.request.next_follow_up_at,
              },
            },
            recordedAt,
          );
        }
        return adminJson(result.idempotent ? 200 : 201, result);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/deals/close") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = bindAuthenticatedOperator(parseJsonBody(request), principal, ["broker"]);
        const deal = appendClosedDeal(currentLeadJourneyContext(), input, {
          filePath: dealLedgerPath || undefined,
          closedAt: dealClosedAt,
        });
        if (!deal.idempotent) {
          recordAudit({
            action: "deal_closed",
            actor: deal.broker,
            objectType: "deal",
            objectId: deal.id,
            locale: deal.original_language,
            metadata: { lead_id: deal.lead_id, listing_reference: deal.listing_reference, status: deal.status },
          });
        }
        return adminJson(deal.idempotent ? 200 : 201, deal);
      } catch (error) {
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/broker-contacts") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = bindAuthenticatedOperator(parseJsonBody(request), principal, ["reviewer"]);
        const contact = createBrokerContact(input, { reviewedAt });
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
        const input = bindAuthenticatedOperator(parseBody(request), principal, ["reviewer"]);
        const tour = appendTourApproval(createTourApproval(seed, input, reviewedAt), {
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
        const input = parseBody(request);
        const lead = submitRuntimeLead(activeRegistry, currentSeed(), input);
        const contactVault = leadContactVaultPath
          ? appendLeadContact(lead, { filePath: leadContactVaultPath, secret: leadContactKey, storedAt: receivedAt })
          : null;
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
        return privateJson(201, { ...lead, ledger, contactVault, consent, sellerPipeline });
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
        const input = parseBody(request);
        const requestRow = createLanguageRequest(activeRegistry, input, requestedAt);
        if (requestRow.notification_requested && !publicContactVaultPath) {
          throw new Error("Public contact delivery storage is not configured");
        }
        const contactVault =
          requestRow.notification_requested && publicContactVaultPath
            ? appendPublicContact(
                {
                  subjectType: "language_request",
                  subjectId: requestRow.id,
                  contact: requestRow.contact,
                  message: requestRow.message,
                },
                {
                  filePath: publicContactVaultPath,
                  secret: publicContactKey,
                  storedAt: requestedAt,
                  includeMessage: true,
                },
              )
            : null;
        const safeRequest = privacySafeLanguageRequest(requestRow);
        const ledger = languageRequestPath ? appendLanguageRequest(safeRequest, { filePath: languageRequestPath }) : null;
        const consent = requestRow.notification_requested
          ? recordConsent({
              consentType: "language_request",
              source: "website_language_request",
              subjectId: requestRow.id,
              locale: requestRow.requested_locale,
              contact: requestRow.contact,
              granted: true,
              legalBasis: "consent",
              marketingOptIn: input.marketingOptIn === true,
            })
          : null;
        return privateJson(201, { ...safeRequest, ledger, contactVault, consent });
      } catch (error) {
        return privateJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/saved-searches") {
      try {
        const input = normalizeSavedSearchInput(parseBody(request));
        const intent = savedSearchIntent(activeRegistry, input);
        const filters = Object.fromEntries(
          Object.entries(searchIntentToQueryFilters(intent)).filter(([, value]) => value !== "" && value !== null && value !== undefined),
        );
        const search = searchRuntimeListings(activeRegistry, currentSeed(), {
          localeCode: intent.locale,
          query: intent.text_query,
          filters,
          sort: intent.sort,
          page: intent.page,
          pageSize: null,
          translationTasks: currentTranslationTasks(),
        });
        const priceSnapshot = Object.fromEntries(
          search.cards.map((card) => [card.id, Number(card.price_eur)]).filter(([, price]) => Number.isFinite(price)),
        );
        const savedSearch = createSavedSearch(
          activeRegistry,
          { ...input, search_intent: intent, priceSnapshot },
          { matchCount: search.search.total_matches, savedAt },
        );
        if (!publicContactVaultPath) throw new Error("Public contact delivery storage is not configured");
        const contactVault = publicContactVaultPath
          ? appendPublicContact(
              {
                subjectType: "saved_search",
                subjectId: savedSearch.id,
                contact: savedSearch.contact,
                contactPreference: savedSearch.contact_preference,
              },
              { filePath: publicContactVaultPath, secret: publicContactKey, storedAt: savedAt },
            )
          : null;
        const safeSearch = privacySafeSavedSearch(savedSearch);
        const ledger = savedSearchLedgerPath ? appendSavedSearch(safeSearch, { filePath: savedSearchLedgerPath }) : null;
        const consent = recordConsent({
          consentType: "saved_search_alerts",
          source: "website_saved_search",
          subjectId: savedSearch.id,
          locale: savedSearch.requested_locale,
          contact: savedSearch.contact,
          granted: savedSearch.alert_consent === true,
          legalBasis: "consent",
          marketingOptIn: input.marketingOptIn === true,
        });
        return privateJson(201, { ...safeSearch, ledger, contactVault, consent });
      } catch (error) {
        return privateJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method !== "GET") return json(405, { kind: "method_not_allowed" });

    const rendered = renderRuntimePath(
      activeRegistry,
      currentSeed(),
      url.pathname,
      currentTranslationTasks(),
      currentBrokerContacts(),
      currentTourApprovals(),
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
  const expectedBlockers = [
    "redirect_reviews",
    "external_seo_exports",
    "listing_quality_review",
    "live_services",
    "monitoring_rollback",
    "payload_runtime",
    "production_recovery",
  ];
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
    throw new Error("HTTP smoke must serve approved CMS guide pages for buyer guidance");
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
  if (smoke.hermesChatDisabled?.status !== 405 || smoke.hermesChatDisabled.body.kind !== "method_not_allowed") {
    throw new Error("HTTP smoke must not expose public Hermes chat");
  }
  if (smoke.ctaClick && (smoke.ctaClick.status !== 201 || smoke.ctaClick.body.type !== "cta_click")) {
    throw new Error("HTTP smoke must accept privacy-safe CTA click events");
  }
  if (smoke.savedSearch.body.match_count <= 12) {
    throw new Error("HTTP smoke must store full saved-search match count");
  }
  if (smoke.savedSearch.body.search_intent?.schema_version !== 1) {
    throw new Error("HTTP smoke must persist a versioned saved-search intent");
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
  if (smoke.translationApprove.status !== 201 || smoke.translationApprove.body.status !== "approved") {
    throw new Error("HTTP smoke must require human approval before translation publish");
  }
  if (smoke.translationPublish.status !== 201 || smoke.translationPublish.body.public_indexable !== true) {
    throw new Error("HTTP smoke must publish only human-approved translation");
  }
  if (
    smoke.listingEditorHtml?.status !== 307 ||
    smoke.listingEditorHtml.headers.location !== "/payload-admin/collections/listings/MS-CRAWL-0001"
  ) {
    throw new Error("HTTP smoke must hand legacy listing editor links to Payload");
  }
  if (
    smoke.listingEdit.status !== 409 ||
    smoke.listingEdit.body.canonical_url !== "/payload-admin/collections/listings/MS-CRAWL-0001"
  ) {
    throw new Error("HTTP smoke must reject legacy listing mutations with a Payload handoff");
  }
  if (smoke.staleListing.status !== 200 || smoke.staleListing.body.indexable !== true) {
    throw new Error("HTTP smoke must preserve the reviewed public translation after a rejected legacy mutation");
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
    staleSearchCard?.translation_display !== "reviewed_translation" ||
    staleSearchCard?.translation_indexable !== true
  ) {
    throw new Error("HTTP smoke must preserve reviewed search cards after a rejected legacy mutation");
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
    smoke.adminMigrationReview.body.routeMap.pendingSample?.length < 1 ||
    !smoke.adminMigrationReview.body.routeMap.pendingSample[0].source_evidence?.title
  ) {
    throw new Error("HTTP smoke must serve admin migration review workbench contract");
  }
  if (
    smoke.adminMigrationReviewHtml?.status !== 200 ||
    smoke.adminMigrationReviewHtml.headers["content-type"] !== "text/html; charset=utf-8" ||
    !smoke.adminMigrationReviewHtml.body.includes("data-kind=\"admin-migration-review\"") ||
    !smoke.adminMigrationReviewHtml.body.includes("data-pending-route-decision=\"true\"") ||
    !smoke.adminMigrationReviewHtml.body.includes("data-source-evidence=\"true\"") ||
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
    smoke.leadQualification?.status !== 201 ||
    smoke.leadQualification.body.lead_pipeline?.stage !== "qualified" ||
    smoke.leadQualification.body.lead_pipeline?.requirements?.budget_max_eur !== 160000
  ) {
    throw new Error("HTTP smoke must qualify a buyer before booking a viewing");
  }
  if (
    smoke.viewing.status !== 201 ||
    smoke.viewing.body.follow_up_task?.status !== "open" ||
    smoke.viewing.body.feedback_request?.status !== "open"
  ) {
    throw new Error("HTTP smoke must book viewing follow-up and feedback tasks");
  }
  if (smoke.viewingUnauthorized.status !== 401) throw new Error("HTTP smoke must reject unauthenticated viewings");
  if (
    smoke.viewingFollowUp?.status !== 201 ||
    smoke.viewingFollowUp.body.idempotent !== false ||
    smoke.viewingFollowUp.body.viewing?.status !== "completed" ||
    smoke.viewingFollowUp.body.viewing?.follow_up_task?.status !== "completed" ||
    smoke.viewingFollowUp.body.viewing?.feedback_request?.status !== "open" ||
    smoke.viewingFollowUpRetry?.status !== 200 ||
    smoke.viewingFollowUpRetry.body.idempotent !== true ||
    smoke.viewingFollowUpUnauthorized?.status !== 401
  ) {
    throw new Error("HTTP smoke must keep post-viewing outcomes private, idempotent, and actionable");
  }
  if (
    smoke.admin?.body?.summary?.viewingFollowUpsOpen !== 1 ||
    smoke.admin.body.viewingFollowUpQueue?.rows?.[0]?.task !== "feedback"
  ) {
    throw new Error("HTTP smoke must return the remaining private follow-up task in the admin queue");
  }
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
