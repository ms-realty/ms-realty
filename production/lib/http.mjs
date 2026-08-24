import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { buildAgencyReviewQueue } from "./agency-review-queue.mjs";
import { readBuildMarker } from "./build-marker.mjs";
import { DEFAULT_BROKER_CONTACT_LEDGER_PATH } from "./broker-contacts.mjs";
import { DEFAULT_SLUG_HISTORY_PATH } from "./slug-history.mjs";
import { DEFAULT_TOUR_APPROVAL_LEDGER_PATH } from "./tours.mjs";
import { DEFAULT_TRANSLATION_LEDGER_PATH } from "./translation-ledger.mjs";
import { readThroughCached } from "./file-cache.mjs";
import { renderMcpProtectedResourceMetadata, renderMcpResponse } from "./mcp-server.mjs";
import { clientIdentity, createRateLimiter } from "./rate-limit.mjs";
import {
  crossOriginWriteRejection,
  readHeader,
  requestHost,
  sameOriginWriteRejection,
} from "./request-guard.mjs";
import { CONTENT_SECURITY_POLICY } from "./security-headers.mjs";
import {
  adminHomePath,
  assertAgentRealtyCaseConditionMutation,
  assertAgentRealtyCaseMutation,
  bindAuthenticatedOperator,
  canAdminAccess,
  canAdminAccessWorkspace,
  canAdminMutate,
  isAdminAuthorized,
  resolveAdminPrincipal,
  requiredAdminCapability,
  withAuthenticatedAuditActor,
  adminCredentials,
} from "./admin-auth.mjs";
import { operatorAgentConfigBlock, operatorConnectResult, renderOperatorConnectPage } from "./operator-connect.mjs";
import {
  adminSessionClearCookie,
  adminSessionSetCookie,
  adminTokenFromCookie,
  renderAdminLoginPage,
} from "./admin-login.mjs";
import { renderAdminTeamPage } from "./admin-team.mjs";
import { getPayloadAdminAuthService } from "./payload-admin-auth.mjs";
import {
  ProviderConnectionUnavailableError,
  deleteProviderConnection,
  providerConnectionAvailability,
  providerConnectionConfigFromEnv,
  readProviderConnections,
  readProviderCredentials,
  saveProviderConnection,
  syncViewingToGoogleCalendar as syncViewingToGoogleCalendarProvider,
} from "./provider-connections.mjs";
import {
  operatorProviderAvailability,
  operatorProviderConfigFromEnv,
} from "./operator-provider-catalog.mjs";
import {
  OPERATOR_CONNECTION_AGENT_CONFIG_PATH,
  OPERATOR_CONNECTION_DISCONNECT_PATH,
  isOperatorOAuthProvider,
  operatorConnectionAudit,
  operatorConnectionStart,
  runOperatorConnectionAction,
} from "./operator-connect-routes.mjs";
import { issueOperatorAgentToken } from "./operator-agent-access.mjs";
import {
  ProviderDeliveryError,
  deliverApprovedProviderMessage as deliverProviderMessage,
} from "./provider-delivery.mjs";
import { renderProviderWebhookResponse } from "./provider-webhooks.mjs";
import { appendAuditLog, createAuditLogEntry, readAuditLog } from "./audit-log.mjs";
import {
  LISTING_EDIT_FIELDS,
  renderAdminActivityPayload,
  renderAdminApprovedContentPayload,
  renderAdminContactsPayload,
  renderAdminConsentPayload,
  renderAdminDocumentChecklistPayload,
  renderAdminLeadsPayload,
  renderAdminListingEditorPayload,
  renderAdminListingManagerPayload,
  renderAdminOperationsReportPayload,
  renderAdminOperationalQueuePayload,
  renderAdminWorkspaceSettingsPayload,
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
  siteRootRedirectTarget,
  websiteLanguageCoverage,
  writeLocaleRegistry,
} from "./locales.mjs";
import { renderHtmlPage } from "./html.mjs";
import { renderReactAdminBody } from "./react-admin-site.mjs";
import { renderReactPublicBody } from "./react-public-site.mjs";
import { appendLead, readLeadLedger } from "./lead-ledger.mjs";
import { DEFAULT_BROKER_PROFILES, normalizeBrokerLeadInput } from "./leads.mjs";
import { adminLocales } from "./locales.mjs";
import {
  DEFAULT_WORKSPACE_SETTINGS_PATH,
  applyWorkspaceDefaultBroker,
  buildWorkspaceOnboarding,
  leadSlaOptions,
  readWorkspaceSettings,
  updateWorkspaceSettings,
  workspaceSettingsView,
} from "./workspace-settings.mjs";
import { appendLeadContact, withLeadContacts } from "./lead-contact-vault.mjs";
import { isFileBackedLeadMutationBlocked } from "./lead-durable-boundary.mjs";
import { productionRuntimeDataUnavailable, runtimeDataUnavailablePayload } from "./runtime-data-boundary.mjs";
import {
  LeadStoreUnavailableError,
  isLeadDurableStoreEnabled,
  leadReadScopeForPrincipal,
  leadDurableStoreConfigFromEnv,
  payloadUserForLeadRead,
  persistLeadIntakeDurably,
  readLeadIntakesDurably as readLeadIntakesDurablyStore,
} from "./lead-durable-store.mjs";
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
import { loadCmsSeed, renderRuntimePath, renderSearchUnavailablePage, searchRuntimeListings, submitRuntimeLead } from "./runtime.mjs";
import { publicSeedFor } from "./public-inventory.mjs";
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
  approvedLaunchFreezeRouteArtifact,
  importRedirectApprovalsCsv,
  readRedirectApprovals,
  renderRedirectApprovalWorkbook,
  summarizeDeployableRedirects,
  summarizeLegacyRouteDecisions,
  writeDeployableRedirects,
} from "./redirect-approvals.mjs";
import { DEFAULT_LAUNCH_FREEZE_PATH, loadApprovedLaunchFreeze } from "./launch-freeze.mjs";
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
import { projectListingDraftSeed, saveBulkListingStatusDrafts, saveListingDraft } from "./listing-draft-service.mjs";
import { appendMediaReview, applyMediaReviews, createMediaReview, readMediaReviews } from "./media-reviews.mjs";
import {
  appendListingPublicationSchedule,
  buildListingPublicationScheduleQueue,
  cancelListingPublicationSchedule,
  executeDueListingPublicationSchedules,
  listingPublicationExecutionAuditRecords,
  readListingPublicationSchedules,
} from "./listing-publication-schedules.mjs";
import { appendViewing, createViewing, readViewings, renderViewingCalendar } from "./viewing-ledger.mjs";
import {
  appendViewingFollowUp,
  buildViewingFollowUpQueue,
  deriveViewingFollowUpStates,
  readViewingFollowUps,
} from "./viewing-follow-ups.mjs";
import {
  ViewingConflictError,
  ViewingStoreUnavailableError,
  isViewingDurableStoreEnabled,
  persistViewingDurably as persistViewingDurablyStore,
  readViewingsDurably as readViewingsDurablyStore,
  recordViewingCalendarSync as recordViewingCalendarSyncStore,
  viewingDurableStoreConfigFromEnv,
} from "./viewing-durable-store.mjs";
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
import {
  appendRealtyCaseActionInPayload,
  appendRealtyCaseConditionActionInPayload,
  assertRealtyCasePayloadAuthorityConfig,
  assertRealtyCasePayloadAuthorityInput,
  openRealtyCaseConditionInPayload,
  openRealtyCaseInPayload,
  readRealtyCaseConditionEventsFromPayload,
  readRealtyCaseEventsFromPayload,
  realtyCasePayloadAuthorityFailure,
} from "./realty-case-payload-authority.mjs";
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
import { monitoringRollbackState } from "./monitoring-rollback.mjs";
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
import { buildListingVerificationReport } from "./listing-verification.mjs";
import { buildTranslationCoverageReport } from "./translation-coverage.mjs";
import { fromRoot } from "./paths.mjs";
import { seedForPostgresSearchHits } from "./public-search.mjs";
import { queryPublicSearch } from "./search-engine-sync.mjs";
import { searchIntentToQueryFilters } from "./search-intent.mjs";
import { normalizeSearchRequest } from "./search-request.mjs";
import { buildSearchAnalyticsReport } from "./search-analytics.mjs";
// Package B2: approved content.
import { approvedContentReviewPayload } from "./approved-content-review.mjs";
import { purchaseFeePayload } from "./public-site.mjs";
import { PURCHASE_FEE_BUYER_SCOPES } from "./purchase-fees.mjs";
// B3 saved-search self-service: capability links, visitor changes, alert delivery.
import {
  DEFAULT_SAVED_SEARCH_MANAGE_PATH,
  SAVED_SEARCH_LINK_REFUSAL,
  SavedSearchLinkRefusedError,
  assertSavedSearchAccess,
  mintSavedSearchAccess,
  readSavedSearchAccessToken,
  savedSearchAccessSecret,
  savedSearchManageLink,
  savedSearchManagePathTemplate,
  savedSearchManageTtlDays,
} from "./saved-search-access.mjs";
import {
  appendSavedSearchManageEvent,
  applySavedSearchManageEvents,
  normalizeSavedSearchManageEvent,
  readSavedSearchManageEvents,
  reachableContactChannels,
  savedSearchManagePayload,
} from "./saved-search-manage.mjs";
import {
  buildSavedSearchAlertDeliveryQueue,
  queueDueSavedSearchAlerts,
  readSavedSearchAlertDeliveries,
  withSavedSearchAlertState,
} from "./saved-search-alert-deliveries.mjs";
import { buildSavedSearchAlertReport } from "./saved-search-alerts.mjs";
import { DEFAULT_PUBLIC_ORIGIN } from "./seo-files.mjs";
// B6 workspace security and data
import { randomBytes } from "node:crypto";
import { MAX_ADMIN_SESSION_SECONDS } from "./admin-login.mjs";
import { TWO_FACTOR_SELF_SERVICE_PATHS } from "./admin-auth.mjs";
import {
  DEFAULT_ADMIN_SESSION_SEEN_INTERVAL_SECONDS,
  adminSessionFingerprint,
  adminSessionList,
  adminSessionSeenDue,
  adminSessionStates,
  adminStepUpClearCookie,
  adminStepUpSetCookie,
  appendAdminSessionEvent,
  createAdminSessionOpened,
  createAdminSessionSeen,
  isAdminSessionRevoked,
  readAdminSessionEvents,
  revokeAdminSessions,
  stepUpTokenFromCookie,
} from "./admin-sessions.mjs";
import {
  activateOperatorEnrolment,
  appendOperatorTwoFactorEvent,
  createOperatorEnrolment,
  disableOperatorTwoFactor,
  operatorTwoFactorActive,
  operatorTwoFactorStatus,
  readOperatorTwoFactorEvents,
  verifyOperatorTwoFactor,
} from "./operator-two-factor.mjs";
import {
  WORKSPACE_EXPORT_DATASETS,
  appendWorkspaceExportEvent,
  buildWorkspaceExportDocument,
  claimWorkspaceExportDownload,
  createWorkspaceExportCompleted,
  createWorkspaceExportDownloaded,
  createWorkspaceExportJob,
  readWorkspaceExportEvents,
  workspaceExportList,
  writeWorkspaceExportFile,
} from "./workspace-export.mjs";
import { auditRetentionDays, auditRetentionPlan } from "./audit-retention.mjs";
import { renderTwoFactorEnrolmentPage, renderWorkspaceExportReadyPage } from "./admin-security-handoff.mjs";
// B1 lead operations: snooze, bulk actions, saved views, Hermes availability.
import { hermesReplyAvailability } from "./hermes-availability.mjs";
import {
  appendLeadSnooze,
  createLeadSnooze,
  createLeadUnsnooze,
  readLeadSnoozes,
} from "./lead-snoozes.mjs";
import {
  OPERATOR_VIEW_SURFACES,
  appendOperatorView,
  createOperatorView,
  createOperatorViewDeletion,
  operatorViewsFor,
  readOperatorViews,
} from "./operator-views.mjs";
// B4 media upload
import { createMediaUploadStorage, mediaUploadStorageConfigFromEnv } from "./media-upload-storage.mjs";
import { applyMediaUploads, mediaUploadLimitsFromEnv, mediaUploadRequestBytes, readMediaUploads } from "./media-uploads.mjs";
import {
  ADMIN_MEDIA_UPLOAD_PATH,
  SELLER_PHOTO_UPLOAD_PATH,
  acceptsHtmlResponse,
  handleAdminMediaUpload,
  handleSellerPhotoUpload,
  listMediaUploads,
  readMediaUploadBytes,
} from "./media-upload-routes.mjs";

// B5 Viewings and availability.
import {
  appendBrokerAvailability,
  brokerAvailabilityDirectory,
  brokerAvailabilityFor,
  canEditBrokerAvailability,
  createBrokerAvailability,
  officeTimeZone,
  readBrokerAvailability,
} from "./broker-availability.mjs";
import {
  DEFAULT_SLOT_STEP_MINUTES,
  DEFAULT_VIEWING_DURATION_MINUTES,
  addDays,
  computeFreeSlots,
  zonedParts,
} from "./broker-free-slots.mjs";
import { buildViewingWeekView } from "./viewing-week-view.mjs";
import {
  appendViewingTripRequest,
  createViewingTripRequest,
  privacySafeViewingTripRequest,
  readViewingTripRequests,
} from "./viewing-trip-requests.mjs";
import { assignLeadBroker } from "./leads.mjs";
import { latestApprovedBrokerContact } from "./broker-contacts.mjs";
import { resolvePublicLocale } from "./locales.mjs";

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};
const PRIVATE_HEADERS = { "cache-control": "no-store" };

// Public (unauthenticated) write endpoints protected by the rate limiter.
const PUBLIC_WRITE_PATHS = new Set([
  "/api/leads",
  "/api/events",
  "/api/language-requests",
  "/api/saved-searches",
  "/api/saved-searches/manage",
]);
const LEAD_BACKED_ADMIN_READ_PATHS = new Set([
  "/api/admin/leads",
  "/admin/leads",
  "/api/admin/today",
  "/admin/today",
  "/api/admin/pipeline",
  "/admin/pipeline",
  "/api/admin/requests",
  "/admin/requests",
  "/api/admin/viewings",
  "/admin/viewings",
  "/api/admin/contacts",
  "/admin/contacts",
  "/api/admin/documents",
  "/admin/documents",
  "/api/admin/reports",
  "/admin/reports",
  "/api/admin/reports/export",
  "/api/admin/viewings.ics",
]);

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

function listingEditorPath(listingId) {
  const id = typeof listingId === "string" ? listingId.trim() : "";
  if (!id) throw new Error("Known listingId is required");
  return `/admin/listings/edit?listingId=${encodeURIComponent(id)}`;
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
    mode:
      engineResult.engine === "postgres" || engineResult.engine === "typesense"
        ? "primary"
        : engineResult.engine === "meilisearch"
          ? "fallback"
          : "local_fallback",
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

function searchEngineResultIsComplete(engineResult) {
  return !Number.isFinite(engineResult.total) || engineResult.total <= engineResult.hits.length;
}

function renderAdminHtml(page) {
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

function providerDeliveryChannel(provider) {
  if (provider === "google") return "email";
  if (provider === "whatsapp" || provider === "viber") return provider;
  throw new Error("Provider delivery requires google, whatsapp, or viber");
}

function providerDeliveryRecipient(lead, provider) {
  const contact = lead?.contact || {};
  const recipientValue =
    provider === "google"
      ? contact.email
      : provider === "whatsapp"
        ? contact.whatsapp || contact.phone
        : provider === "viber"
          ? contact.viber_user_id
          : "";
  const recipient = String(recipientValue || "").trim();
  if (recipient) return recipient;
  const label = provider === "google" ? "email" : provider === "whatsapp" ? "WhatsApp" : "Viber";
  throw new Error(`Lead has no ${label} recipient for provider delivery`);
}

function googleReplySubject(lead) {
  const prefix = "MS Realty reply regarding ";
  const reference = String(lead?.listing_reference || lead?.lead_id || "your enquiry")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${prefix}${reference || "your enquiry"}`.slice(0, 200).trim();
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
    source: url.searchParams.get("source") || input.source,
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
    if (input[field] !== undefined) patch[field] = input[field];
  }
  return { ...input, patch };
}

function renderMigrationReviewPayload(
  registry,
  url,
  dashboard,
  routes,
  approvals,
  seoEvidence,
  listingQuality,
  launchReadiness,
  { listingVerification, translationCoverage, brokerContacts } = {},
) {
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
  const seoPayload = seoEvidencePayload(seoEvidence);
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
    seoEvidence: seoPayload,
    listingQuality,
    agencyReviewQueue: buildAgencyReviewQueue({
      pendingRoutes: reviewRequired,
      listingQuality,
      listingVerification,
      translationCoverage,
      brokerContacts,
      seoEvidence: seoPayload,
      launchReadiness,
    }),
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
  leadSnoozeLedgerPath = null,
  operatorViewLedgerPath = null,
  leadPipelineOutcomeLedgerPath = null,
  leadContactVaultPath = null,
  leadContactKey = null,
  leadDurableStore = leadDurableStoreConfigFromEnv(),
  leadDurablePayload = null,
  persistLeadIntake = persistLeadIntakeDurably,
  readLeadIntakes = null,
  readLeadIntakesDurably = readLeadIntakesDurablyStore,
  publicContactVaultPath = null,
  publicContactKey = null,
  replyOutboxPath = null,
  replyDeliveryOutcomeLedgerPath = null,
  languageRequestPath = null,
  translationLedgerPath = null,
  listingEditLedgerPath = null,
  mediaReviewLedgerPath = null,
  // B4 media upload
  mediaUploadLedgerPath = null,
  mediaUploadStorage = null,
  mediaUploadStorageConfig = null,
  mediaUploadLimits = null,
  sellerPhotoUploadEnabled = true,
  listingPublicationSchedulePath = null,
  viewingLedgerPath = null,
  viewingFollowUpLedgerPath = null,
  // B5 Viewings and availability.
  brokerAvailabilityLedgerPath = null,
  viewingTripLedgerPath = null,
  brokerAvailabilityAt = null,
  viewingTripRequestedAt = null,
  savedSearchLedgerPath = null,
  savedSearchManageEventLedgerPath = null,
  savedSearchAlertDeliveryLedgerPath = null,
  savedSearchManageSecret = null,
  savedSearchManageLinkTemplate = null,
  savedSearchManageLinkTtlDays = null,
  savedSearchPublicOrigin = DEFAULT_PUBLIC_ORIGIN,
  savedSearchManagedAt,
  savedSearchAlertQueuedAt,
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
  realtyCasePayloadAuthorityEnabled = false,
  realtyCasePayload = null,
  brokerContactLedgerPath = null,
  tourApprovalLedgerPath = null,
  // Package B2: approved-content files. Null means "the module's own default".
  approvedTeamProfilePath = null,
  approvedAreaGuidePath = null,
  approvedFinancingPartnerPath = null,
  approvedPurchaseFeePath = null,
  eventLedgerPath = null,
  consentLedgerPath = null,
  auditLogPath = null,
  // B6 workspace security and data
  securityAt = null,
  adminSessionLedgerPath = null,
  adminSessionSeenIntervalSeconds = DEFAULT_ADMIN_SESSION_SEEN_INTERVAL_SECONDS,
  operatorTwoFactorPath = null,
  operatorTwoFactorKey = process.env.MS_REALTY_OPERATOR_2FA_KEY,
  operatorTwoFactorStepUpSeconds = null,
  workspaceExportLedgerPath = null,
  workspaceExportDir = null,
  workspaceExportTtlSeconds = null,
  auditRetentionWindowDays = null,
  slugHistoryPath = null,
  redirectApprovalPath = null,
  deployableRedirectOutputPath = null,
  launchFreezePath = DEFAULT_LAUNCH_FREEZE_PATH,
  workspaceSettingsPath = null,
  launchReadinessOutputPath = null,
  listingQualityReviewPath = null,
  searchSyncReportPath = null,
  searchQueryReportPath = null,
  hermesWorkerReportPath = null,
  liveServiceProvisioningReportPath = null,
  monitoringRollbackReportPath = null,
  payloadRuntimeReportPath = null,
  productionRecoveryReportPath = null,
  // Freshness is measured against the wall clock in production; tests pin it.
  productionRecoveryAt = null,
  productionRecoverySigningPublicKey = process.env.MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY,
  seoEvidenceInputDir = null,
  seoEvidenceOutputPath = null,
  localeRegistryPath = null,
  payloadListingRuntime = null,
  payloadListingEnv = process.env,
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
  leadSnoozeAt,
  hermesReplyProvider = null,
  hermesEnv = process.env,
  rateLimit = null,
  trustProxy = process.env.MS_REALTY_TRUST_PROXY === "1",
  naturalLanguageSearchEnabled = process.env.MS_REALTY_SEARCH_NL_INTENT_ENABLED === "true",
  payloadAdminAuth = getPayloadAdminAuthService,
  providerConnection = operatorProviderConfigFromEnv(),
  operatorAgentEnv = process.env,
  providerConnectionPayload = null,
  providerWebhookPayload = providerConnectionPayload,
  providerWebhookReceivedAt,
  providerFetch = fetch,
  deliverApprovedProviderMessage = deliverProviderMessage,
  viewingDurableStore = viewingDurableStoreConfigFromEnv(),
  viewingDurablePayload = null,
  readViewingsDurably = readViewingsDurablyStore,
  persistViewingDurably = persistViewingDurablyStore,
  recordViewingCalendarSync = recordViewingCalendarSyncStore,
  syncViewingToGoogleCalendar = syncViewingToGoogleCalendarProvider,
  nowSeconds = () => Math.floor(Date.now() / 1000),
  search = {},
  runtimeDataDurableOnly =
    process.env.NODE_ENV === "production" && process.env.MS_REALTY_RUNTIME_DATA_AUTHORITY === "payload",
} = {}) {
  let activeRegistry = registry || loadLocaleRegistry(localeRegistryPath || undefined);
  const activeRouteContract = redirects
    ? { decisions: redirects, catalog: [] }
    : approvedLaunchFreezeRouteArtifact(loadApprovedLaunchFreeze(launchFreezePath));
  const activeLegacyDecisions = activeRouteContract.decisions;
  const preservationCatalog = activeRouteContract.catalog;
  const activeLegacyDecisionByUrl = new Map(activeLegacyDecisions.map((row) => [row.old_url, row]));
  const publicWriteLimiter = rateLimit ? createRateLimiter(rateLimit) : null;
  let payloadAdminAuthPromise;
  const configuredPayloadAdminAuth = async () => {
    if (!payloadAdminAuthPromise) {
      payloadAdminAuthPromise = Promise.resolve(typeof payloadAdminAuth === "function" ? payloadAdminAuth() : payloadAdminAuth);
    }
    try {
      return await payloadAdminAuthPromise;
    } catch (error) {
      payloadAdminAuthPromise = undefined;
      throw error;
    }
  };
  const currentSeed = () =>
    runtimeDataDurableOnly
      ? seed
      : applyMediaReviews(
      // B4: uploaded listing assets join the seed before reviews are applied,
      // so an upload enters the existing review queue instead of bypassing it.
      applyMediaUploads(
        applyListingEdits(seed, readListingEdits(listingEditLedgerPath || undefined)),
        readMediaUploads(mediaUploadLedgerPath || undefined),
      ),
      readMediaReviews(mediaReviewLedgerPath || undefined),
    );
  const currentPublicSeed = () => {
    if (runtimeDataDurableOnly) throw Object.assign(new Error("Payload public listing authority is required"), { status: 503 });
    return publicSeedFor(currentSeed());
  };
  const currentPublicContext = async () => {
    if (!runtimeDataDurableOnly) {
      return { registry: activeRegistry, seed: currentPublicSeed(), translationTasks: currentTranslationTasks() };
    }
    const projected = await projectListingDraftSeed(seed, {
      payload: payloadListingRuntime,
      env: payloadListingEnv,
      requirePayload: true,
    });
    return { registry: activeRegistry, seed: publicSeedFor(projected), translationTasks: [] };
  };
  const currentTranslationTasks = () =>
    runtimeDataDurableOnly
      ? []
      : readThroughCached(translationLedgerPath || DEFAULT_TRANSLATION_LEDGER_PATH, () =>
          readTranslationLedger(translationLedgerPath || undefined),
        );
  const currentBrokerContacts = () =>
    runtimeDataDurableOnly
      ? []
      : readThroughCached(brokerContactLedgerPath || DEFAULT_BROKER_CONTACT_LEDGER_PATH, () =>
          readBrokerContacts(brokerContactLedgerPath || DEFAULT_BROKER_CONTACT_LEDGER_PATH),
        );
  const currentTourApprovals = () =>
    runtimeDataDurableOnly
      ? []
      : readThroughCached(tourApprovalLedgerPath || DEFAULT_TOUR_APPROVAL_LEDGER_PATH, () =>
          readTourApprovals(tourApprovalLedgerPath || DEFAULT_TOUR_APPROVAL_LEDGER_PATH),
        );
  const currentSlugHistory = () =>
    runtimeDataDurableOnly
      ? []
      : readThroughCached(slugHistoryPath || DEFAULT_SLUG_HISTORY_PATH, () =>
          readSlugHistory(slugHistoryPath || DEFAULT_SLUG_HISTORY_PATH),
        );
  const currentLeads = () =>
    runtimeDataDurableOnly
      ? []
      : applyLeadAssignments(
      withLeadContacts(readLeadLedger(leadLedgerPath || undefined), {
        filePath: leadContactVaultPath,
        secret: leadContactKey,
      }),
      readLeadAssignments(leadAssignmentLedgerPath || undefined),
    );
  // B1 lead operations: the snooze ledger and the derived Hermes state both
  // feed the admin lead payload so the screen paints correct controls first
  // time, without probing Hermes.
  const currentLeadSnoozes = () => (runtimeDataDurableOnly ? [] : readLeadSnoozes(leadSnoozeLedgerPath || undefined));
  const currentHermesAvailability = () => hermesReplyAvailability({ env: hermesEnv, provider: hermesReplyProvider });
  const currentOperatorViews = (operator, surface = null) => {
    const operatorId = typeof operator === "string" ? operator : operator?.id || null;
    if (!operatorId || runtimeDataDurableOnly) return [];
    try {
      return operatorViewsFor(readOperatorViews(operatorViewLedgerPath || undefined), operatorId, surface);
    } catch {
      return [];
    }
  };
  const currentLeadOperations = (operator) => ({
    // Every control below is backed by a route in this file; a surface that
    // cannot reach them keeps its disabled treatment instead.
    snoozeWritable: !runtimeDataDurableOnly && canAdminAccess(operator, "operations:write"),
    bulkWritable: !runtimeDataDurableOnly && canAdminAccess(operator, "operations:write"),
    savedViewsWritable: !runtimeDataDurableOnly && Boolean(operator?.id) && canAdminAccess(operator, "operations:write"),
  });
  const currentDurableLeads = async (principal, payloadSession = null) => {
    if (!isLeadDurableStoreEnabled(leadDurableStore)) {
      throw new LeadStoreUnavailableError("Durable lead store is enabled but not fully configured");
    }
    const scope = leadReadScopeForPrincipal(principal, leadDurableStore.workspaceId);
    return (readLeadIntakes || readLeadIntakesDurably)({
      admin: scope.admin,
      contactSecret: leadDurableStore.contactSecret,
      payload: leadDurablePayload,
      user: payloadUserForLeadRead(principal, payloadSession?.user || null),
      workspaceIds: scope.workspaceIds,
    });
  };
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
  const currentListingVerification = () =>
    buildListingVerificationReport({
      seed: currentSeed(),
      edits: readListingEdits(listingEditLedgerPath || undefined),
      generatedAt: listingQualityGeneratedAt || new Date().toISOString(),
    });
  const currentTranslationCoverage = () =>
    buildTranslationCoverageReport({
      registry: activeRegistry,
      seed: currentSeed(),
      translationTasks: currentTranslationTasks(),
      generatedAt: listingQualityGeneratedAt || new Date().toISOString(),
    });
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
  // B3: the saved-search intake ledger is append-only, so the current state is
  // the intake rows with every visitor change from the manage link folded in.
  // Deleted searches disappear here, which is what stops their alerts.
  const currentSavedSearches = () =>
    applySavedSearchManageEvents(
      readSavedSearches(savedSearchLedgerPath || undefined),
      readSavedSearchManageEvents(savedSearchManageEventLedgerPath || undefined),
    );
  const currentSavedSearchAlertDeliveries = () =>
    savedSearchAlertDeliveryLedgerPath ? readSavedSearchAlertDeliveries(savedSearchAlertDeliveryLedgerPath) : [];
  const currentSavedSearchAlertQueue = () =>
    buildSavedSearchAlertDeliveryQueue({
      savedSearches: currentSavedSearches(),
      deliveries: currentSavedSearchAlertDeliveries(),
      now: savedSearchAlertQueuedAt || reviewedAt || receivedAt || new Date().toISOString(),
    });
  const currentPublicRequestQueue = () => {
    let contactMaps = {};
    let contactVaultStatus = "not_configured";
    if (publicContactVaultPath) {
      try {
        contactMaps = {
          saved_search: readPublicContacts(publicContactVaultPath, publicContactKey, "saved_search"),
          language_request: readPublicContacts(publicContactVaultPath, publicContactKey, "language_request"),
          viewing_trip: readPublicContacts(publicContactVaultPath, publicContactKey, "viewing_trip"),
        };
        contactVaultStatus = [
          ...contactMaps.saved_search.values(),
          ...contactMaps.language_request.values(),
          ...contactMaps.viewing_trip.values(),
        ].length
          ? "available"
          : "empty";
      } catch {
        contactMaps = {};
        contactVaultStatus = "locked";
      }
    }
    return buildPublicRequestQueue({
      savedSearches: currentSavedSearches(),
      languageRequests: readLanguageRequests(languageRequestPath || undefined),
      viewingTrips: readViewingTripRequests(viewingTripLedgerPath || undefined),
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
  const rowsForLeadIds = (rows, leadIds) => rows.filter((row) => row?.lead_id && leadIds.has(row.lead_id));
  const leadScopedRows = (source) => {
    if (!source?.durable) return (rows) => rows;
    const leadIds = new Set(source.leads.map((lead) => lead.lead_id));
    return (rows) => rowsForLeadIds(rows, leadIds);
  };
  const currentDurableLeadSource = async (principal = null, payloadSession = null, leads = null) => {
    if (!leadDurableStore?.leadDurableStoreEnabled) return { durable: false, leads: leads || currentLeads() };
    try {
      const durableLeads = leads || (await currentDurableLeads(principal, payloadSession));
      if (!Array.isArray(durableLeads) || durableLeads.some((lead) => !lead?.lead_id)) {
        throw new Error("Durable lead readback returned invalid rows");
      }
      return { durable: true, leads: durableLeads };
    } catch (error) {
      if (error instanceof LeadStoreUnavailableError) throw error;
      throw new LeadStoreUnavailableError("Durable lead store read failed", error);
    }
  };
  const currentDurableViewingSource = async () => {
    if (!viewingDurableStore?.viewingDurableStoreEnabled) {
      return { durable: false, viewings: readViewings(viewingLedgerPath || undefined) };
    }
    if (!isViewingDurableStoreEnabled(viewingDurableStore)) {
      throw new ViewingStoreUnavailableError("Durable viewing store is enabled but not fully configured");
    }
    const viewings = await readViewingsDurably({ payload: viewingDurablePayload || null });
    if (!Array.isArray(viewings)) throw new ViewingStoreUnavailableError("Durable viewing readback returned invalid rows");
    return { durable: true, viewings };
  };
  const currentLeadJourneyContext = (leads = currentLeads()) => {
    const filterRows = leadScopedRows({ durable: leadDurableStore?.leadDurableStoreEnabled === true, leads });
    return {
      leads,
      outcomes: filterRows(readLeadPipelineOutcomes(leadPipelineOutcomeLedgerPath || undefined)),
      viewings: filterRows(readViewings(viewingLedgerPath || undefined)),
      viewingFollowUps: filterRows(readViewingFollowUps(viewingFollowUpLedgerPath || undefined)),
      deals: filterRows(readDeals(dealLedgerPath || undefined)),
      sellerPipelines: filterRows(readSellerPipeline(sellerPipelinePath || undefined)),
      sellerPipelineOutcomes: filterRows(readSellerPipelineOutcomes(sellerPipelineOutcomeLedgerPath || undefined)),
    };
  };
  const currentLeadPipelineQueue = (leads = currentLeads()) =>
    buildLeadPipelineQueue(currentLeadJourneyContext(leads), {
      now: leadPipelineOutcomeAt || reviewedAt || bookedAt || receivedAt || new Date().toISOString(),
    });
  const currentAdminLeadPayload = (requestedLocale, operatorId = null, leads = currentLeads()) => {
    if (runtimeDataDurableOnly) {
      const generatedAt = reviewedAt || receivedAt || new Date().toISOString();
      return {
        ...renderAdminLeadsPayload(activeRegistry, requestedLocale, {
          leads,
          replies: [],
          communicationThreads: [],
          communicationTemplates: {},
          languageRequests: [],
          translationTasks: [],
          listingEdits: [],
          leadMatching: {
            generated_at: generatedAt,
            summary: {
              matchable_leads_with_listing_reference: 0,
              active_matchable_leads: 0,
              qualified_leads: 0,
              leads_with_matches: 0,
              open_broker_tasks: 0,
            },
            rows: [],
          },
          operatorId,
          viewings: [],
          savedSearches: [],
          sellerPipeline: [],
          deals: [],
          brokerContacts: [],
          brokerProfiles: [],
          hermes: currentHermesAvailability(),
          leadOperations: currentLeadOperations(operatorId),
          operatorViews: [],
        }),
        runtime_data_mode: "durable_only",
      };
    }
    const leadPipelineQueue = currentLeadPipelineQueue(leads);
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
      viewingFollowUpWritable: !viewingDurableStore?.viewingDurableStoreEnabled,
      savedSearches: currentSavedSearches(),
      publicRequestQueue: currentPublicRequestQueue(),
      savedSearchAlertQueue: currentSavedSearchAlertQueue(),
      ...currentSellerPipelineData(),
      deals: readDeals(dealLedgerPath || undefined),
      brokerContacts: currentBrokerContacts(),
      leadSnoozes: currentLeadSnoozes(),
      hermes: currentHermesAvailability(),
      leadOperations: currentLeadOperations(operatorId),
      operatorViews: currentOperatorViews(operatorId),
    });
  };
  const currentAdminViewingsPayload = async (
    requestedLocale,
    operatorId = null,
    scopedLeads = null,
    payloadSession = null,
    viewingWeekOptions = {},
  ) => {
    const [leadSource, viewingSource] = await Promise.all([
      currentDurableLeadSource(operatorId, payloadSession, scopedLeads),
      currentDurableViewingSource(),
    ]);
    const filterRows = leadScopedRows(leadSource);
    const leads = applyLeadAssignments(leadSource.leads, filterRows(readLeadAssignments(leadAssignmentLedgerPath || undefined)));
    const outcomes = filterRows(readLeadPipelineOutcomes(leadPipelineOutcomeLedgerPath || undefined));
    const viewings = filterRows(viewingSource.viewings);
    const viewingFollowUps = viewingSource.durable
      ? []
      : filterRows(readViewingFollowUps(viewingFollowUpLedgerPath || undefined));
    const deals = filterRows(readDeals(dealLedgerPath || undefined));
    const sellerPipelines = filterRows(readSellerPipeline(sellerPipelinePath || undefined));
    const sellerPipelineOutcomes = filterRows(readSellerPipelineOutcomes(sellerPipelineOutcomeLedgerPath || undefined));
    const leadPipelineQueue = buildLeadPipelineQueue(
      { leads, outcomes, viewings, viewingFollowUps, deals, sellerPipelines, sellerPipelineOutcomes },
      { now: leadPipelineOutcomeAt || reviewedAt || bookedAt || receivedAt || new Date().toISOString() },
    );
    const replyData = currentReplyData();
    const replies = filterRows(replyData.replies);
    const replyOutcomes = filterRows(replyData.outcomes);
    const viewingsNow = viewingFollowUpAt || bookedAt || reviewedAt || receivedAt || new Date().toISOString();
    const viewingsFollowUpQueue = buildViewingFollowUpQueue(viewings, viewingFollowUps, { now: viewingsNow });
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
      replies,
      replyDeliveryQueue: buildReplyDeliveryQueue(replies, replyOutcomes),
      communicationThreads: buildCommunicationThreads({ leads, replies, outcomes: replyOutcomes }),
      communicationTemplates: Object.fromEntries(leads.map((lead) => [lead.lead_id, communicationTemplatesForLead(lead)])),
      languageRequests: readLanguageRequests(languageRequestPath || undefined),
      translationTasks: latestTranslationTasks(currentTranslationTasks()),
      listingEdits: readListingEdits(listingEditLedgerPath || undefined),
      leadSlaGeneratedAt,
      operatorId,
      viewings,
      viewingFollowUpWritable: !viewingSource.durable,
      viewingFollowUpQueue: viewingsFollowUpQueue,
      // "list" stays the default; "week" draws the grid from viewingWeek.
      viewingLayout: viewingWeekOptions.view === "week" ? "week" : "list",
      // B5: the week the viewings screen draws its grid from.
      viewingWeek: buildViewingWeekView({
        availabilityRows: readBrokerAvailability(brokerAvailabilityLedgerPath || undefined),
        brokers: DEFAULT_BROKER_PROFILES.map((profile) => profile.id),
        viewings: viewingSource.durable ? viewings : deriveViewingFollowUpStates(viewings, viewingFollowUps),
        viewingFollowUpQueue: viewingsFollowUpQueue,
        week: viewingWeekOptions.week || null,
        now: viewingsNow,
      }),
      savedSearches: currentSavedSearches(),
      publicRequestQueue: currentPublicRequestQueue(),
      savedSearchAlertQueue: currentSavedSearchAlertQueue(),
      sellerPipeline: sellerPipelines,
      sellerPipelineQueue: buildSellerPipelineQueue(sellerPipelines, sellerPipelineOutcomes, {
        now: sellerPipelineOutcomeAt || reviewedAt || bookedAt || receivedAt || new Date().toISOString(),
      }),
      deals,
      brokerContacts: currentBrokerContacts(),
      leadSnoozes: currentLeadSnoozes(),
      hermes: currentHermesAvailability(),
      leadOperations: currentLeadOperations(operatorId),
      operatorViews: currentOperatorViews(operatorId),
    });
  };
  const currentContactPayload = (requestedLocale, operatorId = null, leads = currentLeads()) => {
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
  const currentDocumentChecklistPayload = (requestedLocale, operatorId = null, leads = currentLeads()) =>
    renderAdminDocumentChecklistPayload(
      activeRegistry,
      requestedLocale,
      buildDocumentChecklistQueue(leads, readDocumentChecklistOutcomes(documentChecklistLedgerPath || undefined), {
        locale: requestedLocale,
      }),
      operatorId,
    );
  const realtyCasePayloadAuthorityActive = () =>
    assertRealtyCasePayloadAuthorityConfig({
      realtyCasePayloadAuthorityEnabled,
      realtyCaseRequestProjectionEnabled,
      realtyCaseWorkspaceId,
      realtyCasePayload,
      realtyCasePayloadRuntimeConfigured,
    });
  const currentRealtyCaseEvents = async () =>
    realtyCasePayloadAuthorityActive()
      ? readRealtyCaseEventsFromPayload({ payload: realtyCasePayload, workspaceId: realtyCaseWorkspaceId })
      : readRealtyCaseEvents(realtyCaseLedgerPath || undefined);
  const currentRealtyCaseConditionEvents = async () =>
    realtyCasePayloadAuthorityActive()
      ? readRealtyCaseConditionEventsFromPayload({ payload: realtyCasePayload, workspaceId: realtyCaseWorkspaceId })
      : readRealtyCaseConditionEvents(realtyCaseConditionLedgerPath || undefined);
  const currentRealtyCasePayload = async (requestedLocale, operatorId = null) => {
    const payload = renderAdminRealtyCasesPayload(
      activeRegistry,
      requestedLocale,
      buildRealtyCaseQueue(await currentRealtyCaseEvents(), {
        now: realtyCaseRecordedAt || reviewedAt || receivedAt || new Date().toISOString(),
      }),
      operatorId,
    );
    return runtimeDataDurableOnly ? { ...payload, runtime_data_mode: "durable_only" } : payload;
  };
  const currentAutonomousRealtyCaseIntents = async () =>
    buildAutonomousRealtyCaseIntents(await currentRealtyCaseEvents(), {
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
  const currentRealtyCaseConditionQueue = async () =>
    buildRealtyCaseConditionQueue(await currentRealtyCaseConditionEvents(), {
      now: realtyCaseRecordedAt || reviewedAt || receivedAt || new Date().toISOString(),
    });
  const currentConsentPayload = (requestedLocale, operatorId = null) =>
    renderAdminConsentPayload(
      activeRegistry,
      requestedLocale,
      latestConsentStates(readConsentLedger(consentLedgerPath || undefined)),
      operatorId,
    );
  const currentOperationsReport = async (leads = null, principal = null, payloadSession = null) => {
    const generatedAt = reviewedAt || editedAt || receivedAt || new Date().toISOString();
    const reportSeed = currentSeed();
    const leadSource = await currentDurableLeadSource(principal, payloadSession, leads);
    const viewingSource = await currentDurableViewingSource();
    const filterRows = leadScopedRows(leadSource);
    return buildOperationsReport({
      leads: leadSource.leads,
      replies: filterRows(readReplyOutbox(replyOutboxPath || undefined)),
      replyDeliveryOutcomes: filterRows(readReplyDeliveryOutcomes(replyDeliveryOutcomeLedgerPath || undefined)),
      leadPipelineOutcomes: filterRows(readLeadPipelineOutcomes(leadPipelineOutcomeLedgerPath || undefined)),
      viewings: filterRows(viewingSource.viewings),
      viewingFollowUps: filterRows(readViewingFollowUps(viewingFollowUpLedgerPath || undefined)),
      deals: filterRows(readDeals(dealLedgerPath || undefined)),
      sellerPipelines: filterRows(readSellerPipeline(sellerPipelinePath || undefined)),
      sellerPipelineOutcomes: filterRows(readSellerPipelineOutcomes(sellerPipelineOutcomeLedgerPath || undefined)),
      savedSearches: currentSavedSearches(),
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
  const currentReportsPayload = async (requestedLocale, operatorId = null, leads = null, payloadSession = null) =>
    renderAdminOperationsReportPayload(
      activeRegistry,
      requestedLocale,
      await currentOperationsReport(leads, operatorId, payloadSession),
      operatorId,
    );
  const currentRequestsPayload = (requestedLocale, operatorId = null, leads) => {
    return renderAdminOperationalQueuePayload(currentAdminLeadPayload(requestedLocale, operatorId, leads), {
      kind: "admin_requests",
      path: "/admin/requests",
      titleKey: "requestsWorkspace",
      descriptionKey: "requestsDescription",
    });
  };
  const currentPipelinePayload = (requestedLocale, operatorId = null, leads) => {
    return renderAdminOperationalQueuePayload(currentAdminLeadPayload(requestedLocale, operatorId, leads), {
      kind: "admin_lead_pipeline",
      path: "/admin/pipeline",
      titleKey: "pipelineWorkspace",
      descriptionKey: "pipelineDescription",
    });
  };
  const currentTodayPayload = (requestedLocale, operatorId = null, leads) =>
    renderAdminOperationalQueuePayload(currentAdminLeadPayload(requestedLocale, operatorId, leads), {
      kind: "admin_today",
      path: "/admin/today",
      titleKey: "today",
      descriptionKey: "todayDescription",
    });
  const currentViewingsPayload = async (
    requestedLocale,
    operatorId = null,
    leads = null,
    payloadSession = null,
    viewingWeekOptions = {},
  ) =>
    renderAdminOperationalQueuePayload(
      await currentAdminViewingsPayload(requestedLocale, operatorId, leads, payloadSession, viewingWeekOptions),
      {
      kind: "admin_viewings",
      path: "/admin/viewings",
      titleKey: "viewingsWorkspace",
      descriptionKey: "viewingsDescription",
      },
    );
  const currentActivityPayload = (url, operatorId = null) =>
    renderAdminActivityPayload(
      activeRegistry,
      adminLocaleParam(url),
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
  const currentListingManagerPayload = async (url, operatorId = null) => {
    const payload = renderAdminListingManagerPayload(activeRegistry, adminLocaleParam(url), {
      seed: await projectListingDraftSeed(currentSeed(), {
        payload: payloadListingRuntime,
        env: payloadListingEnv,
        requirePayload: runtimeDataDurableOnly,
      }),
      translationTasks: latestTranslationTasks(currentTranslationTasks()),
      query: url.searchParams.get("q") || "",
      status: url.searchParams.get("status") || "",
      sourceLocale: url.searchParams.get("sourceLocale") || "",
      propertyFamily: url.searchParams.get("propertyFamily") || "",
      page: url.searchParams.get("page") || 1,
      generatedAt: reviewedAt || new Date().toISOString(),
      operatorId,
      publicationScheduleQueue: buildListingPublicationScheduleQueue(
        runtimeDataDurableOnly ? [] : readListingPublicationSchedules(listingPublicationSchedulePath || undefined),
        { now: listingPublicationAt || reviewedAt || editedAt || new Date().toISOString() },
      ),
    });
    return runtimeDataDurableOnly ? { ...payload, runtime_data_mode: "durable_only" } : payload;
  };
  const currentListingEditorPayload = async (url, operatorId = null) => {
    const payload = renderAdminListingEditorPayload(
      activeRegistry,
      adminLocaleParam(url),
      await projectListingDraftSeed(currentSeed(), {
        payload: payloadListingRuntime,
        env: payloadListingEnv,
        requirePayload: runtimeDataDurableOnly,
      }),
      url.searchParams.get("listingId"),
      runtimeDataDurableOnly ? [] : readListingEdits(listingEditLedgerPath || undefined),
      runtimeDataDurableOnly ? [] : latestTranslationTasks(currentTranslationTasks()),
      runtimeDataDurableOnly ? [] : currentTourApprovals(),
      operatorId,
    );
    return runtimeDataDurableOnly ? { ...payload, runtime_data_mode: "durable_only" } : payload;
  };
  const currentTranslationQueuePayload = async (url, operatorId = null) => {
    const payload = renderAdminTranslationQueuePayload(activeRegistry, adminLocaleParam(url), {
      seed: await projectListingDraftSeed(currentSeed(), {
        payload: payloadListingRuntime,
        env: payloadListingEnv,
        requirePayload: runtimeDataDurableOnly,
      }),
      translationTasks: runtimeDataDurableOnly ? [] : latestTranslationTasks(currentTranslationTasks()),
      query: url.searchParams.get("q") || "",
      targetLocale: url.searchParams.get("targetLocale") || "",
      taskType: url.searchParams.get("taskType") || "",
      page: url.searchParams.get("page") || 1,
      generatedAt: reviewedAt || new Date().toISOString(),
      operatorId,
    });
    return runtimeDataDurableOnly ? { ...payload, runtime_data_mode: "durable_only" } : payload;
  };
  const currentSeoEvidence = () =>
    buildSeoEvidence({
      inputDir: seoEvidenceInputDir || undefined,
      events: readEventLedger(eventLedgerPath || undefined),
      generatedAt: reviewedAt || new Date().toISOString(),
    });
  const currentLegacyRouteDecisions = () =>
    buildLegacyRouteDecisions(routeMap, readRedirectApprovals(redirectApprovalPath || undefined));
  const currentDeployedRedirectArtifact = () => {
    if (activeRouteContract.preservation_contract) return activeRouteContract;
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
      monitoringRollback: monitoringRollbackState(monitoringRollbackReportPath || undefined),
      payloadRuntime: payloadRuntimeState(payloadRuntimeReportPath || undefined),
      productionRecovery: productionRecoveryState(productionRecoveryReportPath || undefined, {
        publicKey: productionRecoverySigningPublicKey,
        ...(productionRecoveryAt ? { now: productionRecoveryAt } : {}),
      }),
      productionRecoveryPublicKey: productionRecoverySigningPublicKey,
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
        production_recovery: productionRecoveryState(productionRecoveryReportPath || undefined, {
          publicKey: productionRecoverySigningPublicKey,
          ...(productionRecoveryAt ? { now: productionRecoveryAt } : {}),
        }),
      },
    };
  };
  const recordEvent = (input) =>
    !runtimeDataDurableOnly && eventLedgerPath
      ? appendEvent(createEvent(input, receivedAt || new Date().toISOString()), { filePath: eventLedgerPath })
      : null;
  const recordConsent = (input) =>
    !runtimeDataDurableOnly && consentLedgerPath
      ? appendConsentRecord(createConsentRecord(input, receivedAt || new Date().toISOString()), { filePath: consentLedgerPath })
      : null;
  // ---- B6 workspace security and data: shared ledger accessors ------------
  // These sit in the app scope (not the route block) because the login route
  // and the request-time revocation check both run before the route block.
  // Deliberately NOT the shared `receivedAt` fixture clock: a frozen clock
  // would freeze the TOTP step and the export link's expiry with it. Tests pass
  // securityAt (a string, or a function so a test can advance it).
  const securityNow = () => (typeof securityAt === "function" ? securityAt() : securityAt || new Date().toISOString());
  const twoFactorRows = () => readOperatorTwoFactorEvents(operatorTwoFactorPath || undefined);
  const recordTwoFactorEvent = (row) => appendOperatorTwoFactorEvent(row, { filePath: operatorTwoFactorPath || undefined });
  const adminSessionRows = () => readAdminSessionEvents(adminSessionLedgerPath || undefined);
  const recordAdminSessionEvent = (row) => appendAdminSessionEvent(row, { filePath: adminSessionLedgerPath || undefined });
  const workspaceExportRows = () => readWorkspaceExportEvents(workspaceExportLedgerPath || undefined);
  const recordWorkspaceExportEvent = (row) => appendWorkspaceExportEvent(row, { filePath: workspaceExportLedgerPath || undefined });
  const adminSessionRevoked = (token) => {
    try {
      return isAdminSessionRevoked(adminSessionRows(), adminSessionFingerprint(token));
    } catch {
      // A session ledger that cannot be read is not evidence that nothing was
      // revoked, so the cookie is refused until an operator repairs it.
      return true;
    }
  };
  const openAdminSession = (token, { operatorId, source, headers, expiresAt }) =>
    recordAdminSessionEvent(
      createAdminSessionOpened(
        { token, operatorId, source, expiresAt, userAgent: readHeader(headers, "user-agent") },
        securityNow(),
      ),
    );
  const touchAdminSession = (token, operatorId) => {
    if (!token || !operatorId || runtimeDataDurableOnly || !adminSessionLedgerPath) return;
    try {
      const rows = adminSessionRows();
      const fingerprint = adminSessionFingerprint(token);
      const now = Date.parse(securityNow());
      if (!adminSessionSeenDue(rows, fingerprint, { now, intervalSeconds: adminSessionSeenIntervalSeconds })) return;
      const state = adminSessionStates(rows, { now }).get(fingerprint);
      recordAdminSessionEvent(createAdminSessionSeen({ fingerprint, operatorId, sessionId: state?.session_id }, securityNow()));
    } catch {
      // Last-seen bookkeeping must never break an authenticated admin request.
    }
  };
  const activeAdminSessionState = (token, operatorId, source) => {
    if (!token) return null;
    let fingerprint;
    try {
      fingerprint = adminSessionFingerprint(token);
    } catch {
      return null;
    }
    const state = adminSessionStates(adminSessionRows(), { now: Date.parse(securityNow()) }).get(fingerprint);
    if (!state || state.status !== "active") return null;
    if (state.operator_id !== operatorId) return null;
    if (source && state.source !== source) return null;
    return state;
  };
  // Second factor at Payload sign-in. Returns false when the operator has an
  // active enrolment and did not supply a code that clears it, and also when
  // the accepted code could not be recorded: without the recorded counter the
  // same code stays replayable, so the sign-in is refused instead.
  const passesLoginSecondFactor = (loginPrincipal, code) => {
    const rows = twoFactorRows();
    if (!operatorTwoFactorActive(rows, loginPrincipal?.id)) return true;
    const verification = verifyOperatorTwoFactor(
      rows,
      { operatorId: loginPrincipal.id, code },
      { secret: operatorTwoFactorKey, recordedAt: securityNow() },
    );
    if (!verification.ok) return false;
    try {
      for (const event of verification.events) recordTwoFactorEvent(event);
    } catch {
      return false;
    }
    return true;
  };
  // What the Settings screen's Security and Data sections render. Returns null
  // when the workspace-security ledgers are not configured, which is what keeps
  // those sections in their honest "not connected" treatment.
  const workspaceSecurityView = (principal, currentFingerprint = "", notice = null, stepUpActive = false) => {
    if (!principal?.id) return null;
    if (!operatorTwoFactorPath && !adminSessionLedgerPath && !workspaceExportLedgerPath) return null;
    const auditable = Boolean(auditLogPath) && !runtimeDataDurableOnly;
    const now = Date.parse(securityNow());
    let twoFactor = null;
    try {
      twoFactor = {
        ...operatorTwoFactorStatus(twoFactorRows(), principal.id),
        required: principal.require_two_factor === true,
        step_up_required: principal.source === "credential_registry",
        step_up_active: stepUpActive === true,
        step_up_header: "x-ms-admin-2fa",
        writable: Boolean(operatorTwoFactorPath) && auditable,
      };
    } catch {
      twoFactor = null;
    }
    let sessions = null;
    try {
      sessions = {
        writable: Boolean(adminSessionLedgerPath) && auditable,
        can_manage_team: canAdminAccess(principal, "team:manage"),
        current_session_id: currentFingerprint
          ? adminSessionStates(adminSessionRows(), { now }).get(currentFingerprint)?.session_id || null
          : null,
        rows: adminSessionList(adminSessionRows(), {
          operatorId: principal.id,
          currentFingerprint,
          now,
        }),
      };
    } catch {
      sessions = null;
    }
    let exports = null;
    if (canAdminAccess(principal, "data:export")) {
      try {
        exports = {
          writable: Boolean(workspaceExportLedgerPath) && auditable,
          datasets: [...WORKSPACE_EXPORT_DATASETS],
          rows: workspaceExportList(workspaceExportRows(), { requestedBy: principal.id, now }).slice(0, 5),
        };
      } catch {
        exports = null;
      }
    }
    let retention = null;
    if (canAdminAccess(principal, "activity:read")) {
      try {
        const plan = auditRetentionPlan(readAuditLog(auditLogPath || undefined), {
          now: securityNow(),
          retentionDays: Number(auditRetentionWindowDays) || auditRetentionDays(),
        });
        retention = {
          retention_days: plan.retention_days,
          cutoff: plan.cutoff,
          total: plan.total,
          retained: plan.retained,
          prunable: plan.prunable,
          protected_beyond_window: plan.protected_beyond_window,
          scanned_artifacts: plan.scanned_artifacts,
          applied_on_read: false,
          apply_command: "npm run audit:retention -- --apply",
          unavailable: null,
        };
      } catch (error) {
        // A retention window we cannot verify is reported as unavailable, never
        // as a number somebody might act on.
        retention = { unavailable: error.message };
      }
    }
    return {
      operator_id: principal.id,
      notice: typeof notice === "string" && /^[a-z_]{1,40}$/.test(notice) ? notice : null,
      two_factor: twoFactor,
      sessions,
      exports,
      audit_retention: retention,
    };
  };
  const writeAudit = (input, recordedAt = reviewedAt || editedAt || bookedAt || dealClosedAt || receivedAt || new Date().toISOString()) =>
    !runtimeDataDurableOnly && auditLogPath
      ? appendAuditLog(createAuditLogEntry(input, recordedAt), {
          filePath: auditLogPath,
        })
      : null;
  // Workspace settings: the committed defaults are the read path; writes need a
  // configured ledger so tests and durable-only runtimes never touch the repo file.
  const workspaceSettingsReadPath = workspaceSettingsPath || DEFAULT_WORKSPACE_SETTINGS_PATH;
  const currentWorkspaceSettings = () =>
    readThroughCached(workspaceSettingsReadPath, () => readWorkspaceSettings(workspaceSettingsReadPath));
  const withWorkspaceSettings = (page) =>
    page && typeof page === "object" && !page.workspace_settings
      ? { ...page, workspace_settings: workspaceSettingsView(currentWorkspaceSettings()) }
      : page;
  const adminHtml = (page) => renderAdminHtml(withWorkspaceSettings(page));
  const adminLocaleParam = (url) =>
    url.searchParams.get("locale") || currentWorkspaceSettings().sections.workspace.default_locale || "en";
  const currentTeamSize = async (payloadSession) => {
    if (payloadSession) {
      try {
        const service = await configuredPayloadAdminAuth();
        if (service) return { size: (await service.listOperators(payloadSession)).length, known: true };
      } catch {
        // Fall through to the credential registry.
      }
    }
    try {
      const operators = new Set(adminCredentials().map((credential) => credential.id));
      if (operators.size) return { size: operators.size, known: true };
    } catch {
      // An invalid registry is reported by the auth layer; onboarding stays conservative.
    }
    return { size: 1, known: false };
  };
  const currentConnectedProviders = async () => {
    try {
      if (!providerConnectionAvailability(providerConnection).store.ready) return [];
      return await readProviderConnections({ payload: providerConnectionPayload });
    } catch {
      return [];
    }
  };
  const currentWorkspaceOnboarding = async (page, payloadSession) => {
    const [team, providerConnections] = await Promise.all([currentTeamSize(payloadSession), currentConnectedProviders()]);
    return buildWorkspaceOnboarding({
      settings: currentWorkspaceSettings(),
      teamSize: team.size,
      teamSizeKnown: team.known,
      providerConnections,
      replyDeliveryStates: page.replyDeliveryQueue?.states || [],
    });
  };
  const productionSearch = String(search.environment ?? process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
  const currentSearchResult = async (searchRequest, options = {}) => {
    const { intent, query, filters, sort, page } = searchRequest;
    const context = await currentPublicContext();
    const seedForRequest = context.seed;
    const translationTasks = context.translationTasks;
    const registryForRequest = context.registry;
    const searchOptions = { localeCode: intent.locale, query, filters, sort, page, pageSize: intent.page_size, translationTasks, ...options };
    const localResult = searchRuntimeListings(registryForRequest, seedForRequest, searchOptions);
    const engineResult = await queryPublicSearch({
      ...search,
      q: query,
      intent,
      localeCodes: engineLocaleCodes(seedForRequest, registryForRequest, localResult),
    });
    const databasePage = engineResult.engine === "postgres";
    const result =
      engineResult.engine === "seed_fallback" || (!databasePage && !searchEngineResultIsComplete(engineResult))
        ? localResult
        : searchRuntimeListings(
            registryForRequest,
            databasePage ? seedForPostgresSearchHits(seedForRequest, engineResult.hits) : seedForSearchHits(seedForRequest, engineResult.hits),
            {
            ...searchOptions,
            query: "",
            ...(databasePage
              ? {
                  databasePage: true,
                  pageSize: engineResult.page_size,
                  totalMatches: engineResult.total,
                }
              : {}),
            },
          );
    return withSearchBackend(result, engineResult);
  };
  const searchResultOrUnavailable = async (searchRequest, options) => {
    try {
      return { result: await currentSearchResult(searchRequest, options) };
    } catch (error) {
      if (error?.status === 503) {
        return { response: json(503, { kind: error.code || "payload_draft_unavailable", message: error.message }) };
      }
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
    const webhookProvider =
      url.pathname === "/api/webhooks/whatsapp"
        ? "whatsapp"
        : url.pathname === "/api/webhooks/viber"
          ? "viber"
          : null;
    if (webhookProvider) {
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers || {})) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
      }
      const method = String(request.method || "GET").toUpperCase();
      const forwardedProtocol = readHeader(request.headers, "x-forwarded-proto").split(",")[0].trim().toLowerCase();
      const protocol = ["http", "https"].includes(forwardedProtocol) ? forwardedProtocol : "http";
      const webhookResponse = await renderProviderWebhookResponse(
        new Request(new URL(request.url, `${protocol}://${requestHost(request.headers) || "localhost"}`), {
          method,
          headers,
          ...(!["GET", "HEAD"].includes(method) ? { body: request.body || "" } : {}),
        }),
        {
          provider: webhookProvider,
          config: providerConnection,
          payload: providerWebhookPayload,
          receivedAt: providerWebhookReceivedAt,
        },
      );
      const responseHeaders = Object.fromEntries(webhookResponse.headers.entries());
      const responseBody = await webhookResponse.text();
      return {
        status: webhookResponse.status,
        headers: { ...SECURITY_HEADERS, ...responseHeaders },
        body: String(responseHeaders["content-type"] || "").includes("application/json") ? JSON.parse(responseBody) : responseBody,
      };
    }
    if (url.pathname === "/api/hermes/chat") return privateJson(404, { kind: "not_found" });
    if (request.method === "POST" && url.pathname === "/api/leads") {
      const forwardedProtocol = readHeader(request.headers, "x-forwarded-proto").split(",")[0].trim().toLowerCase();
      const protocol = ["http", "https"].includes(forwardedProtocol) ? forwardedProtocol : "http";
      const requestUrl = new URL(request.url, `${protocol}://${requestHost(request.headers) || "localhost"}`);
      const sameOrigin = sameOriginWriteRejection(request.method, request.headers, { requestUrl });
      if (sameOrigin) return privateJson(403, { kind: "cross_origin_write_blocked", reason: sameOrigin });
    }
    // Runs after /mcp, which keeps its own MS_REALTY_MCP_ALLOWED_ORIGINS allowlist
    // because connector clients are legitimately cross-origin.
    const crossOrigin = crossOriginWriteRejection(request.method, request.headers);
    if (crossOrigin) return privateJson(403, { kind: "cross_origin_write_blocked", reason: crossOrigin });
    const runtimeDataAdminRequest =
      url.pathname === "/admin" || url.pathname.startsWith("/admin/") || url.pathname.startsWith("/api/admin/");
    if (!runtimeDataAdminRequest && productionRuntimeDataUnavailable({
      durableOnly: runtimeDataDurableOnly,
      method: request.method,
      pathname: url.pathname,
    })) {
      return adminJson(503, runtimeDataUnavailablePayload(url.pathname));
    }
   let auth = request.headers?.authorization || request.headers?.Authorization || "";
    const sessionToken = auth ? "" : adminTokenFromCookie(request.headers?.cookie || request.headers?.Cookie || "");

    // B6 workspace security and data: server-side session revocation. A revoked
    // cookie is refused here, before the token ever reaches Payload, so "sign
    // out everywhere" invalidates the session rather than the browser's copy of
    // it. /admin/logout stays reachable so the cookie is still cleared.
    if (runtimeDataAdminRequest && sessionToken && url.pathname !== "/admin/logout" && adminSessionRevoked(sessionToken)) {
      if (wantsHtml(request, url)) {
        return adminResponse(303, "", "text/plain; charset=utf-8", {
          location: "/admin/login",
          "set-cookie": adminSessionClearCookie(),
        });
      }
      const revoked = adminUnauthorized();
      revoked.headers["set-cookie"] = adminSessionClearCookie();
      return revoked;
    }
    if (url.pathname === "/admin/login") {
      if (request.method === "GET") {
        let session = null;
        if (sessionToken) {
          try {
            session = await (await configuredPayloadAdminAuth())?.resolve(sessionToken);
          } catch {
            session = null;
          }
        }
        if ((auth && resolveAdminPrincipal(auth)) || session?.principal) {
          return response(303, "", "text/plain; charset=utf-8", { location: "/admin" });
        }
        // The raw value matters: "2fa" selects the second-factor refusal.
        return response(200, renderAdminLoginPage({ error: url.searchParams.get("error") || false, locale: url.searchParams.get("locale") || "bg" }), "text/html; charset=utf-8", {
          "cache-control": "no-store",
          "x-robots-tag": "noindex, nofollow",
          ...(sessionToken ? { "set-cookie": adminSessionClearCookie() } : {}),
        });
      }
      if (request.method === "POST") {
        try {
          const service = await configuredPayloadAdminAuth();
          if (!service) throw new Error("Payload admin authentication is unavailable");
          const form = new URLSearchParams(request.body || "");
          const login = await service.login({ email: form.get("email"), password: form.get("password") });
          const maxAgeSeconds = Math.floor(Number(login.exp) - nowSeconds());
          if (!login.token || maxAgeSeconds <= 0) throw new Error("Payload returned an expired session");
          // B6 workspace security and data: the password is only the first
          // factor. A failed second factor also ends the session Payload just
          // issued, so a rejected sign-in leaves no usable token behind.
          if (!passesLoginSecondFactor(login.principal, form.get("code"))) {
            try {
              await service.logout(login.token);
            } catch {
              // The token was never handed to the browser and expires on its own.
            }
            return response(303, "", "text/plain; charset=utf-8", {
              location: "/admin/login?error=2fa",
              "cache-control": "no-store",
            });
          }
          if (adminSessionLedgerPath) {
            try {
              openAdminSession(login.token, {
                operatorId: login.principal.id,
                source: "payload_session",
                headers: request.headers,
                expiresAt: new Date(Number(login.exp) * 1000).toISOString(),
              });
            } catch {
              // A session that cannot be registered is simply not listable; it
              // is not a reason to refuse a correctly authenticated operator.
            }
          }
          return response(303, "", "text/plain; charset=utf-8", {
            location: "/admin",
            "set-cookie": adminSessionSetCookie(login.token, { maxAgeSeconds }),
            "cache-control": "no-store",
          });
        } catch {
          return response(303, "", "text/plain; charset=utf-8", { location: "/admin/login?error=1", "cache-control": "no-store" });
        }
      }
      return response(405, "Method not allowed", "text/plain; charset=utf-8", { allow: "GET, POST" });
    }
    if (url.pathname === "/admin/logout" && request.method === "POST") {
      if (sessionToken) {
        try {
          await (await configuredPayloadAdminAuth())?.logout(sessionToken);
        } catch {
          // The browser credential is still cleared and expires within two hours.
        }
      }
      return response(303, "", "text/plain; charset=utf-8", {
        location: "/admin/login",
        "set-cookie": adminSessionClearCookie(),
        "cache-control": "no-store",
      });
    }

    const adminRequest = url.pathname === "/admin" || url.pathname.startsWith("/admin/") || url.pathname.startsWith("/api/admin/");
    let payloadSession = null;
    let principal = adminRequest && auth ? resolveAdminPrincipal(auth) : null;
    if (adminRequest && !principal && sessionToken) {
      try {
        payloadSession = await (await configuredPayloadAdminAuth())?.resolve(sessionToken);
        principal = payloadSession?.principal || null;
        if (principal) auth = principal;
      } catch {
        principal = null;
      }
    }
    if (adminRequest && !principal) {
      if ((url.pathname === "/admin" || url.pathname.startsWith("/admin/")) && wantsHtml(request, url)) {
        return adminResponse(303, "", "text/plain; charset=utf-8", {
          location: "/admin/login",
          ...(sessionToken ? { "set-cookie": adminSessionClearCookie() } : {}),
        });
      }
      const unauthorized = adminUnauthorized();
      if (sessionToken) unauthorized.headers["set-cookie"] = adminSessionClearCookie();
      return unauthorized;
    }
    if (adminRequest && request.method !== "GET" && !canAdminMutate(principal)) return adminOperatorIdentityRequired();
    const requiredCapability = adminRequest ? requiredAdminCapability(request.method, url.pathname) : null;
    if (requiredCapability && !canAdminAccess(principal, requiredCapability)) return adminForbidden(requiredCapability);
    let durableProviderDelivery = false;
    if (request.method === "POST" && url.pathname === "/api/admin/replies/delivery") {
      try {
        const delivery = parseBody(request);
        durableProviderDelivery = Boolean(delivery?.provider && !delivery?.action);
      } catch {
        // The route handler returns the normal bad-request response.
      }
    }
    if (productionRuntimeDataUnavailable({
      durableProviderDelivery,
      durableOnly: runtimeDataDurableOnly,
      durableViewing: viewingDurableStore?.viewingDurableStoreEnabled === true,
      method: request.method,
      pathname: url.pathname,
    })) {
      return adminJson(503, runtimeDataUnavailablePayload(url.pathname));
    }
    if (
      isFileBackedLeadMutationBlocked({
        durableProviderDelivery,
        durableStore: leadDurableStore,
        durableViewing: viewingDurableStore?.viewingDurableStoreEnabled === true,
        method: request.method,
        pathname: url.pathname,
      })
    ) {
      return adminJson(503, {
        kind: "lead_store_read_only",
        message: "This lead operation is disabled until it has durable persistence.",
      });
    }
    if (
      runtimeDataDurableOnly &&
      ["/admin/cases", "/api/admin/cases", "/api/admin/cases/intents", "/api/admin/cases/conditions"].includes(url.pathname) &&
      !realtyCasePayloadAuthorityActive()
    ) {
      return adminJson(503, realtyCasePayloadAuthorityFailure());
    }
    if (
      principal?.source === "payload_session" &&
      ["cases:read", "cases:write"].includes(requiredCapability) &&
      !canAdminAccessWorkspace(principal, realtyCaseWorkspaceId)
    ) {
      return adminForbidden("workspace:access");
    }
    let requestLeadRows;
    if (request.method === "GET" && LEAD_BACKED_ADMIN_READ_PATHS.has(url.pathname)) {
      if (runtimeDataDurableOnly && !isLeadDurableStoreEnabled(leadDurableStore)) {
        return adminJson(503, { kind: "lead_store_unavailable", message: "Lead storage is temporarily unavailable" });
      }
      if (leadDurableStore.leadDurableStoreEnabled !== true) {
        requestLeadRows = undefined;
      } else {
      try {
        requestLeadRows = await currentDurableLeads(principal, payloadSession);
      } catch (error) {
        if (error?.status === 403) return adminForbidden(error.capability || "workspace:access");
        return adminJson(503, { kind: "lead_store_unavailable", message: "Lead storage is temporarily unavailable" });
      }
      }
    }
    // ==== B6 workspace security and data =====================================
    // Two-factor authentication, the admin session list and revoke, workspace
    // data export, and the read-only audit-retention preview. Pruning the audit
    // log has deliberately no route at all: it is only ever done by the
    // `npm run audit:retention -- --apply` maintenance command, so no request
    // can delete an accountability record.
    //
    // This block sits immediately before the first capability-gated admin route
    // so the second-factor gate below covers every admin route that follows it.
    const b6StepUpToken =
      String(readHeader(request.headers, "x-ms-admin-2fa") || "").trim() ||
      stepUpTokenFromCookie(request.headers?.cookie || request.headers?.Cookie || "");
    const b6CurrentToken = sessionToken || b6StepUpToken;
    const b6CurrentFingerprint = (() => {
      try {
        return b6CurrentToken ? adminSessionFingerprint(b6CurrentToken) : "";
      } catch {
        return "";
      }
    })();
    const b6CurrentSessionId = b6CurrentFingerprint
      ? adminSessionStates(adminSessionRows(), { now: Date.parse(securityNow()) }).get(b6CurrentFingerprint)?.session_id || null
      : null;
    // Every workspace-security state change is accountable. If the audit log is
    // not writable the action is refused rather than performed unrecorded.
    const b6Audit = (input) => {
      const entry = writeAudit(withAuthenticatedAuditActor(input, principal), securityNow());
      if (!entry) {
        const error = new Error("This action requires a writable audit log");
        error.status = 503;
        error.code = "audit_log_unavailable";
        throw error;
      }
      return entry;
    };
    // The Settings screen posts plain forms, so every write below answers a form
    // with a redirect (or a one-time handoff page) and an API client with JSON.
    const b6FormRequest = String(request.headers?.["content-type"] || request.headers?.["Content-Type"] || "").includes(
      "application/x-www-form-urlencoded",
    );
    const b6SettingsRedirect = (notice, anchor) =>
      adminResponse(303, "", "text/plain; charset=utf-8", {
        location: `/admin/settings?security=${encodeURIComponent(notice)}#settings-${anchor}`,
      });
    const b6Failure = (error, anchor = "security") =>
      b6FormRequest
        ? b6SettingsRedirect(String(error?.code || "bad_request").slice(0, 40), anchor)
        : adminJson(error?.status || 400, { kind: error?.code || "bad_request", message: error?.message || "Request refused" });
    const b6Body = () => {
      try {
        return parseBody(request);
      } catch (error) {
        error.status = 400;
        error.code = "bad_request";
        throw error;
      }
    };

    // Second-factor gate for the credential-registry path. The Payload path is
    // gated at /admin/login instead, where the password is checked.
    // Reading the settings screen is exempt because it is where the control
    // that satisfies this gate lives. It carries workspace configuration and
    // the operator's own security state, no lead or contact data, and saving
    // settings (POST) is still gated. Without the exemption an operator who
    // switches their second factor on from that screen would be locked out of
    // the only page that can let them back in.
    const b6StepUpExempt =
      TWO_FACTOR_SELF_SERVICE_PATHS.has(url.pathname) ||
      (request.method === "GET" && ["/admin/settings", "/api/admin/settings"].includes(url.pathname));
    if (adminRequest && principal?.source === "credential_registry" && !b6StepUpExempt) {
      const b6Status = operatorTwoFactorStatus(twoFactorRows(), principal.id);
      // An HTML screen sends the operator to the settings page that can satisfy
      // the gate; an API path always answers with the refusal itself, whatever
      // Accept header a client happens to send.
      const b6GateRefusal = (kind, message) =>
        wantsHtml(request, url) && !url.pathname.startsWith("/api/")
          ? adminResponse(303, "", "text/plain; charset=utf-8", { location: `/admin/settings?security=${kind}#settings-security` })
          : adminJson(403, { kind, message });
      if (b6Status.status === "active") {
        if (!activeAdminSessionState(b6StepUpToken, principal.id, "credential_registry")) {
          return b6GateRefusal(
            "two_factor_required",
            "Post a current authenticator code to /api/admin/security/two-factor/verify and send the returned token as x-ms-admin-2fa.",
          );
        }
      } else if (principal.require_two_factor === true) {
        // Required but not yet active: only the enrolment routes are reachable,
        // so switching the requirement on never locks an operator out.
        return b6GateRefusal(
          "two_factor_enrolment_required",
          "This operator must enrol a second factor at /api/admin/security/two-factor/enrol before using the workspace.",
        );
      }
    }
    if (adminRequest && principal?.id) touchAdminSession(b6CurrentToken, principal.id);

    if (url.pathname === "/api/admin/security/two-factor") {
      if (request.method !== "GET") return adminJson(405, { kind: "method_not_allowed" });
      if (!principal?.id) return adminOperatorIdentityRequired();
      return adminJson(200, {
        kind: "admin_two_factor_status",
        ...operatorTwoFactorStatus(twoFactorRows(), principal.id),
        required: principal.require_two_factor === true,
        step_up_required: principal.source === "credential_registry",
        step_up_header: "x-ms-admin-2fa",
      });
    }

    if (url.pathname === "/api/admin/security/two-factor/enrol") {
      if (request.method !== "POST") return adminJson(405, { kind: "method_not_allowed" });
      if (!principal?.id) return adminOperatorIdentityRequired();
      try {
        const current = operatorTwoFactorStatus(twoFactorRows(), principal.id);
        if (current.status === "active" || current.status === "pending") {
          // Re-enrolling would silently replace a live second factor, which is
          // exactly what a stolen bearer token would try first.
          if (b6FormRequest) return b6SettingsRedirect("two_factor_already_enrolled", "security");
          return adminJson(409, { kind: "two_factor_already_enrolled", status: current.status });
        }
        const enrolment = createOperatorEnrolment(
          { operatorId: principal.id, account: principal.email || principal.id },
          { secret: operatorTwoFactorKey, recordedAt: securityNow() },
        );
        b6Audit({
          action: "two_factor_enrolment_started",
          objectType: "operator_two_factor",
          objectId: enrolment.enrolment_id,
          metadata: { operator_id: principal.id, source: principal.source, recovery_code_count: enrolment.recovery_codes.length },
        });
        recordTwoFactorEvent(enrolment.row);
        // Shown once, here. The secret and the codes are never written to the
        // ledger in the clear, never audited, and never logged. A form gets a
        // dedicated page rather than a redirect, so the secret never has to
        // travel in a URL.
        if (b6FormRequest) {
          return adminResponse(
            201,
            renderTwoFactorEnrolmentPage({
              locale: adminLocaleParam(url),
              secret: enrolment.secret,
              provisioningUri: enrolment.provisioning_uri,
              recoveryCodes: enrolment.recovery_codes,
            }),
            "text/html; charset=utf-8",
            { "referrer-policy": "no-referrer" },
          );
        }
        return adminJson(201, {
          kind: "admin_two_factor_enrolment",
          enrolment_id: enrolment.enrolment_id,
          secret: enrolment.secret,
          provisioning_uri: enrolment.provisioning_uri,
          recovery_codes: enrolment.recovery_codes,
          shown_once: true,
          next: "POST /api/admin/security/two-factor/activate with a current code",
        });
      } catch (error) {
        return b6Failure(error);
      }
    }

    if (url.pathname === "/api/admin/security/two-factor/activate") {
      if (request.method !== "POST") return adminJson(405, { kind: "method_not_allowed" });
      if (!principal?.id) return adminOperatorIdentityRequired();
      try {
        const rows = twoFactorRows();
        const event = activateOperatorEnrolment(
          rows,
          { operatorId: principal.id, code: b6Body().code },
          { secret: operatorTwoFactorKey, recordedAt: securityNow() },
        );
        b6Audit({
          action: "two_factor_activated",
          objectType: "operator_two_factor",
          objectId: event.enrolment_id,
          metadata: { operator_id: principal.id, source: principal.source },
        });
        recordTwoFactorEvent(event);
        if (b6FormRequest) return b6SettingsRedirect("two_factor_active", "security");
        return adminJson(200, { kind: "admin_two_factor_status", ...operatorTwoFactorStatus(twoFactorRows(), principal.id) });
      } catch (error) {
        return b6Failure(error);
      }
    }

    if (url.pathname === "/api/admin/security/two-factor/verify") {
      if (request.method !== "POST") return adminJson(405, { kind: "method_not_allowed" });
      if (!principal?.id) return adminOperatorIdentityRequired();
      if (principal.source !== "credential_registry") {
        return adminJson(409, {
          kind: "two_factor_step_up_not_applicable",
          message: "Browser sessions verify their second factor at sign-in.",
        });
      }
      if (!adminSessionLedgerPath) {
        return adminJson(503, { kind: "admin_session_store_unavailable", message: "Step-up sessions need a configured session ledger" });
      }
      try {
        const rows = twoFactorRows();
        const verification = verifyOperatorTwoFactor(
          rows,
          { operatorId: principal.id, code: b6Body().code },
          { secret: operatorTwoFactorKey, recordedAt: securityNow() },
        );
        // One generic refusal: a caller learns nothing about which half failed.
        if (!verification.ok) {
          if (b6FormRequest) return b6SettingsRedirect("two_factor_rejected", "security");
          return adminJson(403, { kind: "two_factor_rejected", message: "That code was not accepted" });
        }
        for (const event of verification.events) recordTwoFactorEvent(event);
        const ttlSeconds = Math.max(
          60,
          Math.min(Number(operatorTwoFactorStepUpSeconds) || MAX_ADMIN_SESSION_SECONDS, MAX_ADMIN_SESSION_SECONDS),
        );
        const stepUpToken = randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.parse(securityNow()) + ttlSeconds * 1000).toISOString();
        const opened = openAdminSession(stepUpToken, {
          operatorId: principal.id,
          source: "credential_registry",
          headers: request.headers,
          expiresAt,
        });
        b6Audit({
          action: "two_factor_verified",
          objectType: "admin_session",
          objectId: opened.session_id,
          metadata: { operator_id: principal.id, method: verification.method, source: principal.source },
        });
        const stepUpCookie = adminStepUpSetCookie(stepUpToken, { maxAgeSeconds: ttlSeconds });
        if (b6FormRequest) {
          const redirect = b6SettingsRedirect("two_factor_verified", "security");
          redirect.headers["set-cookie"] = stepUpCookie;
          return redirect;
        }
        return adminResponse(
          201,
          {
            kind: "admin_two_factor_step_up",
            session_id: opened.session_id,
            step_up_token: stepUpToken,
            step_up_header: "x-ms-admin-2fa",
            expires_at: expiresAt,
            method: verification.method,
          },
          "application/json; charset=utf-8",
          { "set-cookie": stepUpCookie },
        );
      } catch (error) {
        return b6Failure(error);
      }
    }

    if (url.pathname === "/api/admin/security/two-factor/disable") {
      if (request.method !== "POST") return adminJson(405, { kind: "method_not_allowed" });
      if (!principal?.id) return adminOperatorIdentityRequired();
      try {
        const body = b6Body();
        const target = String(body.operator_id || body.operatorId || "").trim() || principal.id;
        const forced = target !== principal.id;
        if (forced) {
          if (!canAdminAccess(principal, "team:manage")) return adminForbidden("team:manage");
          // Turning off someone else's second factor is itself a privileged act,
          // so a team manager who has their own factor must have stepped up.
          const managerStatus = operatorTwoFactorStatus(twoFactorRows(), principal.id);
          if (
            managerStatus.status === "active" &&
            principal.source === "credential_registry" &&
            !activeAdminSessionState(b6StepUpToken, principal.id, "credential_registry")
          ) {
            return adminJson(403, { kind: "two_factor_required", message: "Step up before disabling another operator's second factor" });
          }
        }
        const events = disableOperatorTwoFactor(
          twoFactorRows(),
          {
            operatorId: target,
            code: body.code,
            actor: principal.id,
            reason: forced ? "team_manage" : "operator_request",
            forced,
          },
          { secret: operatorTwoFactorKey, recordedAt: securityNow() },
        );
        const disabled = events[events.length - 1];
        b6Audit({
          action: "two_factor_disabled",
          objectType: "operator_two_factor",
          objectId: disabled.enrolment_id,
          metadata: { operator_id: target, forced, reason: disabled.reason },
        });
        for (const event of events) recordTwoFactorEvent(event);
        if (b6FormRequest) return b6SettingsRedirect("two_factor_disabled", "security");
        return adminJson(200, { kind: "admin_two_factor_status", ...operatorTwoFactorStatus(twoFactorRows(), target) });
      } catch (error) {
        return b6Failure(error);
      }
    }

    if (url.pathname === "/api/admin/security/sessions") {
      if (request.method !== "GET") return adminJson(405, { kind: "method_not_allowed" });
      if (!principal?.id) return adminOperatorIdentityRequired();
      const scope = url.searchParams.get("scope") === "all" ? "all" : "self";
      if (scope === "all" && !canAdminAccess(principal, "team:manage")) return adminForbidden("team:manage");
      return adminJson(200, {
        kind: "admin_sessions",
        scope,
        current_session_id: b6CurrentSessionId,
        sessions: adminSessionList(adminSessionRows(), {
          operatorId: principal.id,
          currentFingerprint: b6CurrentFingerprint,
          scope,
          now: Date.parse(securityNow()),
          includeRevoked: url.searchParams.get("include_revoked") === "1",
        }),
      });
    }

    if (url.pathname === "/api/admin/security/sessions/revoke") {
      if (request.method !== "POST") return adminJson(405, { kind: "method_not_allowed" });
      if (!principal?.id) return adminOperatorIdentityRequired();
      try {
        const body = b6Body();
        const result = revokeAdminSessions(
          adminSessionRows(),
          {
            operatorId: principal.id,
            sessionId: body.session_id || body.sessionId,
            scope: body.scope === "others" ? "others" : "one",
            revokedBy: principal.id,
            currentFingerprint: b6CurrentFingerprint,
            canManageTeam: canAdminAccess(principal, "team:manage"),
          },
          { recordedAt: securityNow() },
        );
        for (const event of result.events) {
          b6Audit({
            action: "admin_session_revoked",
            objectType: "admin_session",
            objectId: event.session_id,
            metadata: { operator_id: event.operator_id, reason: event.reason, revoked_by: principal.id },
          });
          recordAdminSessionEvent(event);
        }
        if (result.revoked_current && sessionToken) {
          try {
            await (await configuredPayloadAdminAuth())?.logout(sessionToken);
          } catch {
            // The ledger revocation already refuses this cookie on the way in.
          }
        }
        const clearCurrent = result.revoked_current
          ? { "set-cookie": sessionToken ? adminSessionClearCookie() : adminStepUpClearCookie() }
          : {};
        if (b6FormRequest) {
          const redirect = result.revoked_current
            ? adminResponse(303, "", "text/plain; charset=utf-8", { location: sessionToken ? "/admin/login" : "/admin/settings#settings-security" })
            : b6SettingsRedirect("sessions_revoked", "security");
          Object.assign(redirect.headers, clearCurrent);
          return redirect;
        }
        return adminResponse(
          200,
          { kind: "admin_sessions_revoked", revoked_session_ids: result.revoked_session_ids, revoked_current: result.revoked_current },
          "application/json; charset=utf-8",
          clearCurrent,
        );
      } catch (error) {
        return b6Failure(error);
      }
    }

    if (url.pathname === "/api/admin/security/audit-retention") {
      if (request.method !== "GET") return adminJson(405, { kind: "method_not_allowed" });
      try {
        const plan = auditRetentionPlan(readAuditLog(auditLogPath || undefined), {
          now: securityNow(),
          retentionDays: Number(auditRetentionWindowDays) || auditRetentionDays(),
        });
        const { retained_rows: _retained, prunable_rows: _prunable, ...summary } = plan;
        return adminJson(200, {
          ...summary,
          kind: "admin_audit_retention",
          applied_on_read: false,
          apply_command: "npm run audit:retention -- --apply",
        });
      } catch (error) {
        // Refusing to answer beats implying a plan we could not verify.
        return adminJson(503, { kind: "audit_retention_unavailable", message: error.message });
      }
    }

    if (url.pathname === "/api/admin/data-exports" && request.method === "GET") {
      if (!principal?.id) return adminOperatorIdentityRequired();
      const scope = url.searchParams.get("scope") === "all" ? "all" : "self";
      if (scope === "all" && !canAdminAccess(principal, "team:manage")) return adminForbidden("team:manage");
      return adminJson(200, {
        kind: "admin_data_exports",
        scope,
        datasets: WORKSPACE_EXPORT_DATASETS,
        exports: workspaceExportList(workspaceExportRows(), {
          requestedBy: principal.id,
          scope,
          now: Date.parse(securityNow()),
        }),
      });
    }

    if (url.pathname === "/api/admin/data-exports" && request.method === "POST") {
      if (!principal?.id) return adminOperatorIdentityRequired();
      if (!workspaceExportLedgerPath) {
        return adminJson(503, { kind: "workspace_export_unavailable", message: "Workspace export needs a configured export ledger" });
      }
      // The file ledgers are not the authority in durable-only production, so an
      // export built from them would be a partial answer presented as complete.
      if (runtimeDataDurableOnly) return adminJson(503, runtimeDataUnavailablePayload(url.pathname));
      try {
        const created = createWorkspaceExportJob(
          { requestedBy: principal.id, request: b6Body() },
          { requestedAt: securityNow(), ttlSeconds: workspaceExportTtlSeconds ?? undefined },
        );
        // Audited before the file exists: requesting the export is the
        // accountable act, whether or not the run then succeeds.
        b6Audit({
          action: "workspace_export_requested",
          objectType: "workspace_export",
          objectId: created.row.job_id,
          metadata: {
            requested_by: principal.id,
            datasets: created.row.scope.datasets,
            from: created.row.scope.from,
            to: created.row.scope.to,
          },
        });
        recordWorkspaceExportEvent(created.row);
        const exportLeads = readLeadLedger(leadLedgerPath || undefined);
        const document = buildWorkspaceExportDocument(
          { job_id: created.row.job_id, requested_by: created.row.requested_by, scope: created.row.scope },
          {
            // The contact vault is never opened here. Contacts are derived from
            // ledger rows only, so no decrypted contact detail can reach the file.
            leads: exportLeads,
            contacts: buildContactRecords({ leads: exportLeads }),
            listings: currentSeed().records,
            auditRows: readAuditLog(auditLogPath || undefined),
          },
          { generatedAt: securityNow() },
        );
        const exportPath = writeWorkspaceExportFile(document, { directory: workspaceExportDir || undefined });
        const completed = createWorkspaceExportCompleted(
          {
            jobId: created.row.job_id,
            filePath: exportPath,
            byteSize: fs.statSync(exportPath).size,
            counts: Object.fromEntries(Object.entries(document.datasets).map(([dataset, value]) => [dataset, value.count])),
          },
          securityNow(),
        );
        recordWorkspaceExportEvent(completed);
        const downloadUrl = `/api/admin/data-exports/download?job=${encodeURIComponent(created.row.job_id)}&token=${encodeURIComponent(created.download_token)}`;
        if (b6FormRequest) {
          return adminResponse(
            201,
            renderWorkspaceExportReadyPage({
              locale: adminLocaleParam(url),
              downloadUrl,
              expiresAt: created.row.download_expires_at,
              counts: completed.counts,
              redactions: document.redactions,
            }),
            "text/html; charset=utf-8",
            { "referrer-policy": "no-referrer" },
          );
        }
        return adminJson(201, {
          kind: "admin_data_export",
          job_id: created.row.job_id,
          status: "ready",
          scope: created.row.scope,
          counts: completed.counts,
          redactions: document.redactions,
          redaction_policy: document.redaction_policy,
          download_url: downloadUrl,
          download_token: created.download_token,
          download_token_header: "x-ms-export-token",
          download_expires_at: created.row.download_expires_at,
          single_use: true,
        });
      } catch (error) {
        return b6Failure(error, "data");
      }
    }

    if (url.pathname === "/api/admin/data-exports/download") {
      if (request.method !== "GET") return adminJson(405, { kind: "method_not_allowed" });
      if (!principal?.id) return adminOperatorIdentityRequired();
      try {
        const job = claimWorkspaceExportDownload(workspaceExportRows(), {
          jobId: url.searchParams.get("job"),
          // The header keeps the one-time token out of access logs; the query
          // parameter exists because the brief asks for a link.
          token: readHeader(request.headers, "x-ms-export-token") || url.searchParams.get("token") || "",
          operatorId: principal.id,
          now: Date.parse(securityNow()),
        });
        const body = fs.readFileSync(job.file_path, "utf8");
        b6Audit({
          action: "workspace_export_downloaded",
          objectType: "workspace_export",
          objectId: job.job_id,
          metadata: { downloaded_by: principal.id, byte_size: job.byte_size },
        });
        // Recorded after the bytes are in hand; the row is what makes a second
        // fetch of the same link a 410.
        recordWorkspaceExportEvent(createWorkspaceExportDownloaded({ jobId: job.job_id, downloadedBy: principal.id }, securityNow()));
        return adminResponse(200, body, "application/json; charset=utf-8", {
          "content-disposition": `attachment; filename="${job.job_id}.json"`,
        });
      } catch (error) {
        return b6Failure(error);
      }
    }
    // ==== end B6 workspace security and data =================================

    // Package B2: approved content (team profiles, area guides, financing
    // partners, purchase fee table).
    if (request.method === "GET" && url.pathname === "/api/purchase-fees/estimate") {
      const buyerScope = url.searchParams.get("buyer") || url.searchParams.get("buyer_scope") || "eu";
      const rawPrice = url.searchParams.get("price_eur");
      if (!PURCHASE_FEE_BUYER_SCOPES.includes(buyerScope)) {
        return json(400, { kind: "bad_request", message: `buyer must be one of: ${PURCHASE_FEE_BUYER_SCOPES.join(", ")}` });
      }
      if (rawPrice !== null && !/^\d+(\.\d{1,2})?$/.test(rawPrice.trim())) {
        return json(400, { kind: "bad_request", message: "price_eur must be a positive amount in euro" });
      }
      const payload = purchaseFeePayload({
        localeCode: url.searchParams.get("locale") || activeRegistry.source_locale,
        priceEur: rawPrice === null || rawPrice.trim() === "" ? null : Number(rawPrice),
        municipality: url.searchParams.get("municipality") || null,
        buyerScope,
        filePath: approvedPurchaseFeePath || undefined,
      });
      if (payload.reason === "bad_request") return json(400, { kind: "bad_request", message: payload.message });
      // A missing or expired fee line is a refusal, not a zero: 409 carries the
      // exact lines that block the total so the estimator can name them.
      return json(payload.available ? 200 : 409, { kind: "purchase_fee_estimate", ...payload });
    }

    // Package A2: the read-only review screen for the same payload. Approval
    // itself is a data-file edit plus a rebuild, so this screen never writes.
    if (request.method === "GET" && url.pathname === "/admin/approved-content") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const review = approvedContentReviewPayload({
        teamProfilePath: approvedTeamProfilePath || undefined,
        areaGuidePath: approvedAreaGuidePath || undefined,
        financingPartnerPath: approvedFinancingPartnerPath || undefined,
        purchaseFeePath: approvedPurchaseFeePath || undefined,
        ...(reviewedAt ? { now: reviewedAt } : {}),
      });
      return adminResponse(
        200,
        adminHtml(
          renderAdminApprovedContentPayload(
            activeRegistry,
            adminLocaleParam(url),
            review,
            principal,
            url.searchParams.get("state") || "",
          ),
        ),
        "text/html; charset=utf-8",
      );
    }

    if (request.method === "GET" && url.pathname === "/api/admin/approved-content") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminJson(
        200,
        approvedContentReviewPayload({
          teamProfilePath: approvedTeamProfilePath || undefined,
          areaGuidePath: approvedAreaGuidePath || undefined,
          financingPartnerPath: approvedFinancingPartnerPath || undefined,
          purchaseFeePath: approvedPurchaseFeePath || undefined,
          ...(reviewedAt ? { now: reviewedAt } : {}),
        }),
      );
    }

    // B3 saved searches: visitor self-service through a capability link, plus
    // the broker-facing alert delivery queue. No public accounts, ever.
    if (url.pathname === "/api/saved-searches/manage" || url.pathname === "/api/admin/saved-search-alerts/run-due") {
      const savedSearchRefusal = () => privateJson(404, { ...SAVED_SEARCH_LINK_REFUSAL });
      const savedSearchLinkSecret = () => {
        try {
          return savedSearchManageSecret || savedSearchAccessSecret();
        } catch {
          // A deployment without a configured signing secret cannot honour any
          // link. Fail closed with the same generic refusal.
          return null;
        }
      };
      const savedSearchContactMap = () => {
        if (!publicContactVaultPath) return { contacts: null, state: "not_configured" };
        try {
          return {
            contacts: readPublicContacts(publicContactVaultPath, publicContactKey, "saved_search"),
            state: "available",
          };
        } catch {
          return { contacts: null, state: "locked" };
        }
      };
      const savedSearchManageState = (token, now) => {
        const secret = savedSearchLinkSecret();
        if (!secret) throw new SavedSearchLinkRefusedError("secret_unavailable");
        const presented = readSavedSearchAccessToken(token, { secret, now });
        const records = withSavedSearchAlertState(currentSavedSearches(), currentSavedSearchAlertDeliveries());
        const record = records.find((row) => row.id === presented.record_id) || null;
        // A deleted or unknown record is refused exactly like a forged token,
        // so the route cannot confirm that a saved search exists.
        assertSavedSearchAccess(record, presented);
        return { record, presented };
      };
      const savedSearchManageBody = (record, presented, now) => {
        const vault = savedSearchContactMap();
        const contact = vault.contacts?.get(record.id)?.contact || null;
        return savedSearchManagePayload(record, {
          contact,
          contactState: vault.state,
          linkExpiresAt: presented.expires_at,
          now,
        });
      };

      if (request.method === "GET" && url.pathname === "/api/saved-searches/manage") {
        // Read is rate limited on the same budget as the public writes: the
        // shared limiter already covers POST through PUBLIC_WRITE_PATHS.
        if (publicWriteLimiter) {
          const verdict = publicWriteLimiter.allow(`${clientIdentity(request, { trustProxy })}:${url.pathname}`);
          if (!verdict.allowed) {
            return response(429, { kind: "rate_limited", retry_after: verdict.retryAfterSec }, "application/json; charset=utf-8", {
              "retry-after": String(verdict.retryAfterSec),
              "cache-control": "no-store",
            });
          }
        }
        const now = savedSearchManagedAt || receivedAt || new Date().toISOString();
        try {
          const { record, presented } = savedSearchManageState(url.searchParams.get("token"), now);
          return privateJson(200, savedSearchManageBody(record, presented, now));
        } catch (error) {
          if (error instanceof SavedSearchLinkRefusedError) return savedSearchRefusal();
          return privateJson(400, { kind: "bad_request", message: error.message });
        }
      }

      if (request.method === "POST" && url.pathname === "/api/saved-searches/manage") {
        const now = savedSearchManagedAt || receivedAt || new Date().toISOString();
        let input;
        try {
          input = parseBody(request);
        } catch (error) {
          return privateJson(400, { kind: "bad_request", message: error.message });
        }
        let record;
        let presented;
        try {
          ({ record, presented } = savedSearchManageState(input.token, now));
        } catch (error) {
          if (error instanceof SavedSearchLinkRefusedError) return savedSearchRefusal();
          return privateJson(400, { kind: "bad_request", message: error.message });
        }
        if (!savedSearchManageEventLedgerPath) {
          return privateJson(503, {
            kind: "saved_search_manage_unavailable",
            message: "Saved search changes are unavailable because their storage is not configured.",
          });
        }
        try {
          const event = normalizeSavedSearchManageEvent({ ...input, savedSearchId: record.id }, now);
          const vault = savedSearchContactMap();
          const contact = vault.contacts?.get(record.id)?.contact || null;
          if (event.action === "update_channel") {
            // Fail closed: without the vault we cannot prove the requested
            // channel is one the visitor actually gave us.
            if (!contact) {
              return privateJson(409, {
                kind: "saved_search_channel_unverifiable",
                message: "The stored contact channels cannot be read, so the alert channel cannot be changed.",
              });
            }
            if (!reachableContactChannels(contact).includes(event.channel)) {
              return privateJson(400, {
                kind: "bad_request",
                message: "channel must be one of the contact channels supplied with this saved search",
              });
            }
          }
          const currentStatus = record.status || "active";
          const unchanged =
            (event.action === "pause" && currentStatus === "paused") ||
            (event.action === "resume" && currentStatus === "active") ||
            (event.action === "update_frequency" && record.alert_frequency === event.frequency) ||
            (event.action === "update_channel" && record.contact_preference === event.channel);
          if (unchanged) {
            return privateJson(200, {
              ...savedSearchManageBody(record, presented, now),
              action: event.action,
              idempotent: true,
            });
          }
          appendSavedSearchManageEvent(event, { filePath: savedSearchManageEventLedgerPath });
          const auditAction = {
            pause: "saved_search_paused",
            resume: "saved_search_resumed",
            update_frequency: "saved_search_frequency_updated",
            update_channel: "saved_search_channel_updated",
            delete: "saved_search_deleted",
          }[event.action];
          // Every mutation is audited. The actor is the capability link, not an
          // operator, and the metadata carries no contact data.
          writeAudit(
            {
              action: auditAction,
              actor: "saved_search_link",
              objectType: "saved_search",
              objectId: record.id,
              locale: record.locale,
              status: event.action === "delete" ? "deleted" : "recorded",
              metadata: {
                source: "manage_link",
                action: event.action,
                ...(event.frequency ? { alert_frequency: event.frequency } : {}),
                ...(event.channel ? { channel: event.channel } : {}),
              },
            },
            now,
          );
          if (event.action === "delete") {
            return privateJson(200, {
              kind: "saved_search_manage",
              action: "delete",
              deleted: true,
              saved_search: null,
              idempotent: false,
              message: "This saved search is deleted and its alerts have stopped. The manage link no longer works.",
            });
          }
          const updated =
            applySavedSearchManageEvents(
              withSavedSearchAlertState(currentSavedSearches(), currentSavedSearchAlertDeliveries()),
              [],
            ).find((row) => row.id === record.id) || record;
          return privateJson(200, {
            ...savedSearchManageBody(updated, presented, now),
            action: event.action,
            idempotent: false,
          });
        } catch (error) {
          if (error instanceof SavedSearchLinkRefusedError) return savedSearchRefusal();
          return privateJson(400, { kind: "bad_request", message: error.message });
        }
      }

      if (request.method === "POST" && url.pathname === "/api/admin/saved-search-alerts/run-due") {
        if (!isAdminAuthorized(auth)) return adminUnauthorized();
        if (!savedSearchAlertDeliveryLedgerPath) {
          return adminJson(503, {
            kind: "saved_search_alert_storage_unavailable",
            message: "Saved search alert delivery storage is not configured.",
          });
        }
        try {
          const queuedAt = savedSearchAlertQueuedAt || reviewedAt || receivedAt || new Date().toISOString();
          const context = await currentPublicContext();
          const savedSearches = currentSavedSearches();
          const alertReport = buildSavedSearchAlertReport({
            registry: context.registry,
            seed: context.seed,
            savedSearches,
            requestOutcomes: readPublicRequestOutcomes(publicRequestOutcomeLedgerPath || undefined),
            translationTasks: context.translationTasks,
            generatedAt: queuedAt,
          });
          const run = queueDueSavedSearchAlerts({
            savedSearches,
            alertReport,
            filePath: savedSearchAlertDeliveryLedgerPath,
            queuedAt,
          });
          for (const delivery of run.queued) {
            writeAudit(
              {
                action: "saved_search_alerts_queued",
                actor: "system",
                objectType: "saved_search",
                objectId: delivery.saved_search_id,
                locale: delivery.locale,
                status: "queued",
                metadata: {
                  delivery_id: delivery.id,
                  reason: delivery.reason,
                  new_match_count: delivery.new_match_count,
                  price_change_count: delivery.price_change_count,
                  delivery_mode: delivery.delivery_mode,
                },
              },
              queuedAt,
            );
          }
          return adminJson(201, {
            kind: "saved_search_alert_run",
            ...run,
            // Stated explicitly: this route creates broker work, it never sends.
            delivered: 0,
            queue: currentSavedSearchAlertQueue(),
          });
        } catch (error) {
          return adminJson(error.status || 400, { kind: error.code || "bad_request", message: error.message });
        }
      }

      return privateJson(405, { kind: "method_not_allowed" });
    }

    // B1 lead operations: snooze with a deferred SLA, bulk actions with one
    // audit entry per enquiry, and per-operator saved views.
    if (
      ["/api/admin/leads/snooze", "/api/admin/leads/unsnooze", "/api/admin/leads/bulk", "/api/admin/views"].includes(url.pathname)
    ) {
      // recordAudit is declared further down this handler, so this block keeps
      // its own binding over the same writeAudit helper.
      const auditLeadOperation = (input, recordedAt) => writeAudit(withAuthenticatedAuditActor(input, principal), recordedAt);
      const leadOperationAt = () => leadSnoozeAt || reviewedAt || bookedAt || receivedAt || new Date().toISOString();

      // One enquiry deferred to a chosen moment. Reused verbatim by the bulk
      // route, so both paths share one set of rules.
      const snoozeOne = (leads, input, recordedAt) => {
        const bound = bindAuthenticatedOperator(input, principal, ["actor"]);
        const record = createLeadSnooze(leads, readLeadSnoozes(leadSnoozeLedgerPath || undefined), bound, recordedAt);
        const persisted = appendLeadSnooze(record, { filePath: leadSnoozeLedgerPath || undefined });
        if (!persisted.idempotent) {
          auditLeadOperation(
            {
              action: "lead_snoozed",
              actor: persisted.actor,
              objectType: "lead_snooze",
              objectId: persisted.id,
              metadata: { lead_id: persisted.lead_id, until: persisted.until, reason: persisted.reason },
            },
            recordedAt,
          );
        }
        return persisted;
      };
      const unsnoozeOne = (leads, input, recordedAt) => {
        const bound = bindAuthenticatedOperator(input, principal, ["actor"]);
        const record = createLeadUnsnooze(leads, readLeadSnoozes(leadSnoozeLedgerPath || undefined), bound, recordedAt);
        const persisted = appendLeadSnooze(record, { filePath: leadSnoozeLedgerPath || undefined });
        if (!persisted.idempotent) {
          auditLeadOperation(
            {
              action: "lead_unsnoozed",
              actor: persisted.actor,
              objectType: "lead_snooze",
              objectId: persisted.id,
              metadata: { lead_id: persisted.lead_id, snooze_id: persisted.snooze_id, reason: persisted.reason },
            },
            recordedAt,
          );
        }
        return persisted;
      };
      const assignOne = (leads, input, recordedAt) => {
        const bound = bindAuthenticatedOperator(input, principal, ["actor"]);
        const assignment = createLeadAssignment(leads, bound, recordedAt);
        const persisted = appendLeadAssignment(assignment, { filePath: leadAssignmentLedgerPath || undefined });
        if (!persisted.idempotent) {
          auditLeadOperation(
            {
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
            },
            recordedAt,
          );
        }
        return persisted;
      };
      // "Handled" is recorded on the pipeline the enquiry actually belongs to:
      // a seller pipeline note, or a buyer/renter pipeline note. Both are
      // existing single-item paths with their own validation and audit action.
      const handleOne = (leads, input, recordedAt) => {
        const bound = bindAuthenticatedOperator(input, principal, ["actor"]);
        const leadId = String(bound.leadId || bound.lead_id || "").trim();
        const lead = leads.find((row) => row.lead_id === leadId);
        if (!lead) throw new Error("Handled requires a known leadId");
        const sellerPipelines = readSellerPipeline(sellerPipelinePath || undefined);
        const sellerPipeline = sellerPipelines.find((row) => row.lead_id === leadId);
        if (sellerPipeline) {
          const result = appendSellerPipelineOutcome(
            sellerPipelines,
            { ...bound, action: "note", note: bound.note || bound.reason, sellerPipelineId: sellerPipeline.id },
            { filePath: sellerPipelineOutcomeLedgerPath || undefined, recordedAt },
          );
          if (!result.idempotent) {
            auditLeadOperation(
              {
                action: "seller_pipeline_outcome_recorded",
                actor: result.outcome.actor,
                objectType: "seller_pipeline_outcome",
                objectId: result.outcome.id,
                metadata: {
                  lead_id: result.outcome.lead_id,
                  seller_pipeline_id: result.outcome.seller_pipeline_id,
                  outcome_action: result.outcome.action,
                },
              },
              recordedAt,
            );
          }
          return { kind: "seller_pipeline_note", ...result };
        }
        const result = appendLeadPipelineOutcome(
          currentLeadJourneyContext(leads),
          { ...bound, action: "note", note: bound.note || bound.reason },
          { filePath: leadPipelineOutcomeLedgerPath || undefined, recordedAt },
        );
        if (!result.idempotent) {
          auditLeadOperation(
            {
              action: "lead_pipeline_outcome_recorded",
              actor: result.outcome.actor,
              objectType: "lead_pipeline_outcome",
              objectId: result.outcome.id,
              metadata: {
                lead_id: result.outcome.lead_id,
                pipeline: result.outcome.pipeline,
                outcome_action: result.outcome.action,
                from_stage: result.outcome.from_stage,
                to_stage: result.outcome.to_stage,
              },
            },
            recordedAt,
          );
        }
        return { kind: "lead_pipeline_note", ...result };
      };

      if (request.method === "POST" && url.pathname === "/api/admin/leads/snooze") {
        try {
          const recordedAt = leadOperationAt();
          const persisted = snoozeOne(currentLeads(), parseBody(request), recordedAt);
          return adminJson(persisted.idempotent ? 200 : 201, { kind: "lead_snooze", ...persisted });
        } catch (error) {
          return adminJson(400, { kind: "bad_request", message: error.message });
        }
      }

      if (request.method === "POST" && url.pathname === "/api/admin/leads/unsnooze") {
        try {
          const recordedAt = leadOperationAt();
          const persisted = unsnoozeOne(currentLeads(), parseBody(request), recordedAt);
          return adminJson(persisted.idempotent ? 200 : 201, { kind: "lead_unsnooze", ...persisted });
        } catch (error) {
          return adminJson(400, { kind: "bad_request", message: error.message });
        }
      }

      // One approval, one audit entry PER ENQUIRY. A refusal on one enquiry
      // never discards the rest: the body reports every item's own outcome.
      if (request.method === "POST" && url.pathname === "/api/admin/leads/bulk") {
        try {
          const input = parseBody(request);
          const action = String(input.action || "").trim();
          if (!["assign", "snooze", "handle"].includes(action)) {
            throw new Error("Bulk action must be assign, snooze, or handle");
          }
          const submittedIds = input.leadIds ?? input.lead_ids;
          const leadIds = [
            ...new Set(
              (Array.isArray(submittedIds) ? submittedIds : String(submittedIds || "").split(","))
                .map((value) => String(value || "").trim())
                .filter(Boolean),
            ),
          ];
          if (!leadIds.length) throw new Error("Bulk actions require at least one leadId");
          if (leadIds.length > 100) throw new Error("Bulk actions accept 100 enquiries or fewer");
          const confirmed = input.bulkConfirmed ?? input.bulk_confirmed;
          if (confirmed !== true && !["true", "on", "1"].includes(String(confirmed || ""))) {
            throw new Error("Bulk actions require one explicit human confirmation");
          }
          const recordedAt = leadOperationAt();
          const leads = currentLeads();
          const results = [];
          for (const leadId of leadIds) {
            try {
              const itemInput = { ...input, leadId, leadIds: undefined, lead_ids: undefined };
              const outcome =
                action === "assign"
                  ? assignOne(leads, itemInput, recordedAt)
                  : action === "snooze"
                    ? snoozeOne(leads, itemInput, recordedAt)
                    : handleOne(leads, itemInput, recordedAt);
              results.push({
                lead_id: leadId,
                status: outcome.idempotent ? "unchanged" : "applied",
                idempotent: Boolean(outcome.idempotent),
                record_id: outcome.id || outcome.outcome?.id || null,
              });
            } catch (error) {
              results.push({ lead_id: leadId, status: "refused", idempotent: false, record_id: null, message: error.message });
            }
          }
          const applied = results.filter((row) => row.status === "applied").length;
          const refused = results.filter((row) => row.status === "refused").length;
          return adminJson(refused ? 207 : applied ? 201 : 200, {
            kind: "lead_bulk_action",
            action,
            requested: leadIds.length,
            applied,
            unchanged: results.filter((row) => row.status === "unchanged").length,
            refused,
            results,
          });
        } catch (error) {
          return adminJson(400, { kind: "bad_request", message: error.message });
        }
      }

      // Saved views belong to the authenticated operator and to nobody else:
      // the owner is read from the principal, never from the request body.
      if (url.pathname === "/api/admin/views") {
        if (!principal?.id) return adminOperatorIdentityRequired();
        const viewFilePath = operatorViewLedgerPath || undefined;
        try {
          if (request.method === "GET") {
            const surface = url.searchParams.get("surface");
            return adminJson(200, {
              kind: "operator_views",
              operator_id: principal.id,
              surfaces: OPERATOR_VIEW_SURFACES,
              views: operatorViewsFor(readOperatorViews(viewFilePath), principal.id, surface || null),
            });
          }
          const recordedAt = leadOperationAt();
          const input = bindAuthenticatedOperator(parseBody(request), principal, ["operatorId"]);
          if (request.method === "POST") {
            const view = createOperatorView(readOperatorViews(viewFilePath), input, {
              operatorId: principal.id,
              savedAt: recordedAt,
            });
            const persisted = appendOperatorView(view, { filePath: viewFilePath });
            if (!persisted.idempotent) {
              auditLeadOperation(
                {
                  action: "operator_view_saved",
                  actor: principal.id,
                  objectType: "operator_view",
                  objectId: persisted.id,
                  metadata: { surface: persisted.surface, slug: persisted.slug, filter_keys: Object.keys(persisted.filters) },
                },
                recordedAt,
              );
            }
            return adminJson(persisted.idempotent ? 200 : 201, { kind: "operator_view", ...persisted });
          }
          if (request.method === "DELETE") {
            const tombstone = createOperatorViewDeletion(readOperatorViews(viewFilePath), input, {
              operatorId: principal.id,
              deletedAt: recordedAt,
            });
            const persisted = appendOperatorView(tombstone, { filePath: viewFilePath });
            if (!persisted.idempotent) {
              auditLeadOperation(
                {
                  action: "operator_view_deleted",
                  actor: principal.id,
                  objectType: "operator_view",
                  objectId: persisted.id,
                  metadata: { surface: persisted.surface, slug: persisted.slug },
                },
                recordedAt,
              );
            }
            return adminJson(200, { kind: "operator_view", ...persisted });
          }
          return adminJson(405, { kind: "method_not_allowed" });
        } catch (error) {
          return adminJson(400, { kind: "bad_request", message: error.message });
        }
      }

      return adminJson(405, { kind: "method_not_allowed" });
    }

    // B4 media upload — admin listing-editor uploads and public seller-intake
    // photos, both filed as unreviewed assets in the existing media review
    // workflow. Nothing written here is public; publication still requires a
    // human decision and alt text through /api/admin/media/reviews. The rules
    // live in media-upload-routes.mjs so the Next App Router handoff runs the
    // same ones.
    if (url.pathname === ADMIN_MEDIA_UPLOAD_PATH || url.pathname.startsWith(`${ADMIN_MEDIA_UPLOAD_PATH}/`)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const uploadLimits = mediaUploadLimits || mediaUploadLimitsFromEnv();
      const uploadStorage = () =>
        mediaUploadStorage || createMediaUploadStorage(mediaUploadStorageConfig || mediaUploadStorageConfigFromEnv());

      if (request.method === "GET" && url.pathname === ADMIN_MEDIA_UPLOAD_PATH) {
        const listed = listMediaUploads({
          ledgerPath: mediaUploadLedgerPath,
          listing: url.searchParams.get("listing") || "",
          enquiry: url.searchParams.get("enquiry") || "",
          limits: uploadLimits,
        });
        return adminJson(listed.status, listed.body);
      }

      if (request.method === "GET") {
        // Byte preview for the reviewer. Unreviewed media is private, so the
        // response is admin-only and never cached.
        let assetId = "";
        try {
          assetId = decodeURIComponent(url.pathname.slice(`${ADMIN_MEDIA_UPLOAD_PATH}/`.length));
        } catch {
          return adminJson(400, { kind: "bad_request", message: "Malformed upload id" });
        }
        const preview = await readMediaUploadBytes({ ledgerPath: mediaUploadLedgerPath, assetId, storage: uploadStorage() });
        if (preview.status !== 200) return adminJson(preview.status, preview.body);
        return { status: 200, headers: { ...SECURITY_HEADERS, ...PRIVATE_HEADERS, ...preview.headers }, body: preview.body };
      }

      if (request.method !== "POST") return adminJson(405, { kind: "method_not_allowed" });
      const uploaded = await handleAdminMediaUpload({
        bytes: mediaUploadRequestBytes(request),
        contentType: readHeader(request.headers, "content-type"),
        // A browser form post (no JavaScript) asks for HTML and gets a redirect
        // back to the editor; the enhanced fetch asks for JSON and gets JSON.
        acceptsHtml: acceptsHtmlResponse(readHeader(request.headers, "accept")),
        seed: currentSeed(),
        limits: uploadLimits,
        storage: uploadStorage(),
        ledgerPath: mediaUploadLedgerPath,
        uploadedBy: principal?.id || "admin",
        uploadedAt: reviewedAt || editedAt || receivedAt || new Date().toISOString(),
        recordAudit: (entry) => writeAudit(withAuthenticatedAuditActor(entry, principal)),
        editorPathFor: listingEditorPath,
      });
      if (uploaded.status === 303) return adminResponse(303, "", "text/plain; charset=utf-8", uploaded.headers);
      return adminJson(uploaded.status, uploaded.body);
    }

    if (request.method === "POST" && url.pathname === SELLER_PHOTO_UPLOAD_PATH) {
      // Public write: same origin guard, same limiter and the same byte rules
      // as the admin route. The limiter runs here because this block is
      // reached before the shared public-write limiter further down.
      const photoProtocol = readHeader(request.headers, "x-forwarded-proto").split(",")[0].trim().toLowerCase();
      const photoRequestUrl = new URL(
        request.url,
        `${["http", "https"].includes(photoProtocol) ? photoProtocol : "http"}://${requestHost(request.headers) || "localhost"}`,
      );
      const photoCrossOrigin = sameOriginWriteRejection(request.method, request.headers, { requestUrl: photoRequestUrl });
      if (photoCrossOrigin) return privateJson(403, { kind: "cross_origin_write_blocked", reason: photoCrossOrigin });
      if (publicWriteLimiter) {
        const verdict = publicWriteLimiter.allow(`${clientIdentity(request, { trustProxy })}:${url.pathname}`);
        if (!verdict.allowed) {
          return response(429, { kind: "rate_limited", retry_after: verdict.retryAfterSec }, "application/json; charset=utf-8", {
            "retry-after": String(verdict.retryAfterSec),
            "cache-control": "no-store",
          });
        }
      }
      const sellerStoreReady = sellerPhotoUploadEnabled && !runtimeDataDurableOnly && Boolean(sellerPipelinePath);
      const sellerPhotos = await handleSellerPhotoUpload({
        bytes: mediaUploadRequestBytes(request),
        contentType: readHeader(request.headers, "content-type"),
        acceptsHtml: acceptsHtmlResponse(readHeader(request.headers, "accept")),
        returnPath: url.searchParams.get("return") || "",
        enabled: sellerStoreReady,
        sellerEnquiries: sellerStoreReady ? readSellerPipeline(sellerPipelinePath) : null,
        limits: mediaUploadLimits || mediaUploadLimitsFromEnv(),
        storage: mediaUploadStorage || createMediaUploadStorage(mediaUploadStorageConfig || mediaUploadStorageConfigFromEnv()),
        ledgerPath: mediaUploadLedgerPath,
        uploadedAt: receivedAt || new Date().toISOString(),
        recordAudit: (entry) => writeAudit(entry),
      });
      if (sellerPhotos.status === 303) return privateResponse(303, "", "text/plain; charset=utf-8", sellerPhotos.headers);
      return privateJson(sellerPhotos.status, sellerPhotos.body);
    }

    // B5 Viewings and availability: broker working hours, the free-slot
    // calculation behind the admin week view and the public slot picker, and
    // the viewing-trip request. Nothing here books anything: the public routes
    // produce requests that a human confirms.
    if (["/api/admin/availability", "/api/admin/viewings/week", "/api/viewing-slots", "/api/viewing-trips"].includes(url.pathname)) {
      const availabilityRows = () => readBrokerAvailability(brokerAvailabilityLedgerPath || undefined);
      const knownBrokerIds = () => DEFAULT_BROKER_PROFILES.map((profile) => profile.id);
      const availabilityNow = () =>
        brokerAvailabilityAt || viewingFollowUpAt || bookedAt || reviewedAt || receivedAt || new Date().toISOString();
      // Viewings already on a calendar, with their current state: a rescheduled
      // viewing must block its new time, not its original one.
      const scheduledViewings = async () => {
        const source = await currentDurableViewingSource();
        if (source.durable) return source.viewings;
        return deriveViewingFollowUpStates(source.viewings, readViewingFollowUps(viewingFollowUpLedgerPath || undefined));
      };
      const wholeNumberParam = (value, fallback) => {
        const raw = String(value ?? "").trim();
        if (!raw) return fallback;
        if (!/^\d+$/.test(raw)) throw new Error("Slot parameters must be whole numbers");
        return Number(raw);
      };

      if (url.pathname === "/api/admin/availability") {
        if (!isAdminAuthorized(auth)) return adminUnauthorized();
        if (request.method === "GET") {
          try {
            const rows = availabilityRows();
            const requested = String(url.searchParams.get("broker") || "").trim();
            const brokerIds = requested ? [requested] : knownBrokerIds();
            return adminJson(200, {
              kind: "admin_broker_availability",
              timezone: officeTimeZone(),
              brokers: brokerAvailabilityDirectory(rows, brokerIds),
              history: requested ? rows.filter((row) => row.broker_id === requested) : rows,
              editable_brokers: brokerIds.filter((brokerId) => canEditBrokerAvailability(principal, brokerId)),
            });
          } catch (error) {
            return adminJson(400, { kind: "bad_request", message: error.message });
          }
        }
        if (request.method === "POST") {
          try {
            const submitted = bindAuthenticatedOperator(parseBody(request), principal);
            const brokerId = String(submitted.brokerId ?? submitted.broker_id ?? submitted.broker ?? "").trim();
            // A broker may set their own hours; a manager may set anyone's.
            if (!canEditBrokerAvailability(principal, brokerId)) return adminForbidden("broker_availability:own");
            const recordedAt = availabilityNow();
            const record = createBrokerAvailability({ ...submitted, brokerId }, { recordedAt });
            const persisted = appendBrokerAvailability(record, { filePath: brokerAvailabilityLedgerPath || undefined });
            if (!persisted.idempotent) {
              writeAudit(
                withAuthenticatedAuditActor(
                  {
                    action: "broker_availability_updated",
                    actor: record.actor,
                    objectType: "broker_availability",
                    objectId: persisted.id,
                    metadata: {
                      broker_id: record.broker_id,
                      timezone: record.timezone,
                      weekly_windows: record.weekly_hours.length,
                      exceptions: record.exceptions.length,
                      self_service: principal?.id === record.broker_id,
                    },
                  },
                  principal,
                ),
                recordedAt,
              );
            }
            return adminJson(persisted.idempotent ? 200 : 201, {
              kind: "admin_broker_availability_recorded",
              availability: persisted,
              resolved: brokerAvailabilityFor([persisted], record.broker_id),
            });
          } catch (error) {
            return adminJson(400, { kind: "bad_request", message: error.message });
          }
        }
        return adminJson(405, { kind: "method_not_allowed" });
      }

      if (url.pathname === "/api/admin/viewings/week") {
        if (!isAdminAuthorized(auth)) return adminUnauthorized();
        if (request.method !== "GET") return adminJson(405, { kind: "method_not_allowed" });
        try {
          const now = availabilityNow();
          const viewings = await scheduledViewings();
          return adminJson(200, {
            kind: "admin_viewing_week",
            week: buildViewingWeekView({
              availabilityRows: availabilityRows(),
              brokers: knownBrokerIds(),
              viewings,
              viewingFollowUpQueue: buildViewingFollowUpQueue(
                viewings,
                readViewingFollowUps(viewingFollowUpLedgerPath || undefined),
                { now },
              ),
              week: url.searchParams.get("week"),
              now,
              durationMinutes: wholeNumberParam(url.searchParams.get("duration"), DEFAULT_VIEWING_DURATION_MINUTES),
            }),
          });
        } catch (error) {
          if (error instanceof ViewingStoreUnavailableError || error?.code === "viewing_store_unavailable") {
            return adminJson(503, { kind: "viewing_store_unavailable", message: "Viewing storage is temporarily unavailable" });
          }
          return adminJson(400, { kind: "bad_request", message: error.message });
        }
      }

      // Public: the slots a visitor can pick from for one listing's broker.
      if (url.pathname === "/api/viewing-slots") {
        if (request.method !== "GET") return privateJson(405, { kind: "method_not_allowed" });
        if (publicWriteLimiter) {
          const verdict = publicWriteLimiter.allow(`${clientIdentity(request, { trustProxy })}:${url.pathname}`);
          if (!verdict.allowed) {
            return response(429, { kind: "rate_limited", retry_after: verdict.retryAfterSec }, "application/json; charset=utf-8", {
              "retry-after": String(verdict.retryAfterSec),
              "cache-control": "no-store",
            });
          }
        }
        try {
          const listingReference = String(url.searchParams.get("listing") || url.searchParams.get("listingReference") || "").trim();
          if (!listingReference) throw new Error("listing is required");
          const context = await currentPublicContext();
          const listing = context.seed.records.find(
            (record) => record.collection === "listings" && record.id === listingReference,
          );
          // Fail closed: no published listing, no slots. Never guess a broker.
          if (!listing) return privateJson(404, { kind: "listing_not_found", listing_reference: listingReference });
          const requestedLocale = String(url.searchParams.get("locale") || context.registry.source_locale).trim();
          const resolvedLocale = resolvePublicLocale(context.registry, requestedLocale);
          const brokerContact = latestApprovedBrokerContact(currentBrokerContacts(), listingReference);
          const brokerId =
            brokerContact?.broker ||
            assignLeadBroker(
              { language: { language: resolvedLocale.locale.code, adminLocale: "en" }, leadType: "buyer" },
              {
                listingContext: {
                  location: listing.facts?.location || null,
                  property_type: listing.facts?.property_type || null,
                },
              },
            ).broker_id;
          const now = availabilityNow();
          const timeZone = officeTimeZone();
          const firstDay = url.searchParams.get("from") || addDays(zonedParts(Date.parse(now), timeZone).date, 1);
          const lastDay = url.searchParams.get("to") || addDays(firstDay, 13);
          const availability = brokerAvailabilityFor(availabilityRows(), brokerId, { now });
          const slots = computeFreeSlots({
            availability,
            viewings: await scheduledViewings(),
            from: firstDay,
            to: lastDay,
            durationMinutes: wholeNumberParam(url.searchParams.get("duration"), DEFAULT_VIEWING_DURATION_MINUTES),
            stepMinutes: DEFAULT_SLOT_STEP_MINUTES,
            now,
            // A visitor cannot pick a slot a broker has no time to prepare for.
            leadTimeMinutes: wholeNumberParam(url.searchParams.get("leadTime"), 24 * 60),
            limit: wholeNumberParam(url.searchParams.get("limit"), 24),
          });
          return privateJson(200, {
            kind: "viewing_slots",
            listing_reference: listingReference,
            locale: resolvedLocale.locale.code,
            broker_id: brokerId,
            // Office hours are the agency's published week, not a claim about
            // this broker's diary, so the visitor is told a broker confirms.
            availability_source: availability.source,
            confirmation: "human_required",
            timezone: slots.timezone,
            from: slots.from,
            to: slots.to,
            duration_minutes: slots.duration_minutes,
            slots: slots.slots.map((slot) => ({
              starts_at: slot.starts_at,
              ends_at: slot.ends_at,
              local_date: slot.local_date,
              local_start: slot.local_start,
              local_end: slot.local_end,
            })),
            summary: slots.summary,
          });
        } catch (error) {
          return privateJson(error.status || 400, { kind: error.code || "bad_request", message: error.message });
        }
      }

      // Public: a viewing trip is a request for a human to arrange, never a booking.
      if (url.pathname === "/api/viewing-trips") {
        if (request.method !== "POST") return privateJson(405, { kind: "method_not_allowed" });
        if (publicWriteLimiter) {
          const verdict = publicWriteLimiter.allow(`${clientIdentity(request, { trustProxy })}:${url.pathname}`);
          if (!verdict.allowed) {
            return response(429, { kind: "rate_limited", retry_after: verdict.retryAfterSec }, "application/json; charset=utf-8", {
              "retry-after": String(verdict.retryAfterSec),
              "cache-control": "no-store",
            });
          }
        }
        try {
          const requestedAt = viewingTripRequestedAt || savedAt || receivedAt || new Date().toISOString();
          const trip = createViewingTripRequest(activeRegistry, parseBody(request), { requestedAt });
          if (!publicContactVaultPath) throw new Error("Public contact delivery storage is not configured");
          const contactVault = appendPublicContact(
            {
              subjectType: "viewing_trip",
              subjectId: trip.id,
              contact: trip.contact,
              contactPreference: trip.contact_preference,
              message: trip.note,
            },
            { filePath: publicContactVaultPath, secret: publicContactKey, storedAt: requestedAt },
          );
          const safeTrip = privacySafeViewingTripRequest(trip);
          const ledger = viewingTripLedgerPath
            ? appendViewingTripRequest(safeTrip, { filePath: viewingTripLedgerPath })
            : null;
          const consent = recordConsent({
            consentType: "viewing_trip_request",
            source: "website_viewing_trip",
            subjectId: trip.id,
            locale: trip.requested_locale,
            contact: trip.contact,
            granted: true,
            legalBasis: "contract",
            marketingOptIn: parseBody(request).marketingOptIn === true,
          });
          return privateJson(201, { ...safeTrip, ledger, contactVault, consent });
        } catch (error) {
          return privateJson(error.status || 400, { kind: error.code || "bad_request", message: error.message });
        }
      }
    }
    if (["/admin/team", "/api/admin/team"].includes(url.pathname)) {
      // Team management needs the Payload runtime. When it cannot start (no
      // database locally, or an outage), answer like a missing session instead
      // of surfacing a 500 from the runtime bootstrap.
      const service = await configuredPayloadAdminAuth().catch(() => null);
      if (!payloadSession || !service) return adminForbidden("payload_session");
      if (request.method === "GET") {
        const operators = await service.listOperators(payloadSession);
        if (url.pathname === "/api/admin/team") return adminJson(200, { kind: "admin_team", operators });
        return adminResponse(
          200,
          renderAdminTeamPage({
            operators,
            created: url.searchParams.get("created") === "1",
            error: url.searchParams.get("error") === "1",
            locale: url.searchParams.get("locale") || "bg",
          }),
          "text/html; charset=utf-8",
        );
      }
      if (request.method === "POST" && url.pathname === "/api/admin/team") {
        const formRequest = String(request.headers?.["content-type"] || request.headers?.["Content-Type"] || "").includes(
          "application/x-www-form-urlencoded",
        );
        try {
          const operator = await service.createOperator(payloadSession, parseBody(request));
          if (formRequest) {
            return adminResponse(303, "", "text/plain; charset=utf-8", { location: "/admin/team?created=1" });
          }
          return adminJson(201, { kind: "admin_team_operator", operator });
        } catch (error) {
          if (formRequest) {
            return adminResponse(303, "", "text/plain; charset=utf-8", { location: "/admin/team?error=1" });
          }
          return adminJson(400, { kind: "bad_request", message: error.message });
        }
      }
      return adminJson(405, { kind: "method_not_allowed" });
    }
    const recordAudit = (input, recordedAt) => writeAudit(withAuthenticatedAuditActor(input, principal), recordedAt);
    if (["/admin/settings", "/api/admin/settings"].includes(url.pathname)) {
      const settingsPage = (requestedLocale, form = null) =>
        withWorkspaceSettings(
          renderAdminWorkspaceSettingsPayload(activeRegistry, requestedLocale, {
            settings: currentWorkspaceSettings(),
            operator: principal,
            brokerProfiles: DEFAULT_BROKER_PROFILES,
            adminLocales: adminLocales(activeRegistry),
            saved: url.searchParams.get("saved"),
            form,
            writable: Boolean(workspaceSettingsPath) && !runtimeDataDurableOnly,
            // B6 workspace security and data
            security: workspaceSecurityView(
              principal,
              b6CurrentFingerprint,
              url.searchParams.get("security"),
              Boolean(activeAdminSessionState(b6StepUpToken, principal?.id, "credential_registry")),
            ),
          }),
        );
      if (request.method === "GET") {
        const payload = settingsPage(adminLocaleParam(url));
        if (url.pathname === "/admin/settings" || wantsHtml(request, url)) {
          return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
        }
        return adminJson(200, payload);
      }
      if (request.method === "POST" && url.pathname === "/api/admin/settings") {
        const formRequest = String(request.headers?.["content-type"] || request.headers?.["Content-Type"] || "").includes(
          "application/x-www-form-urlencoded",
        );
        let input;
        try {
          input = parseBody(request) || {};
        } catch (error) {
          return adminJson(400, { kind: "bad_request", message: error.message });
        }
        const section = String(input.section || "").trim();
        const requestedLocale = String(input.locale || "").trim() || adminLocaleParam(url);
        if (runtimeDataDurableOnly || !workspaceSettingsPath) {
          return adminJson(503, {
            kind: "workspace_settings_read_only",
            message: "Workspace settings storage is not configured on this runtime.",
          });
        }
        try {
          const result = updateWorkspaceSettings({
            filePath: workspaceSettingsPath,
            section,
            values: input,
            actor: principal?.id || "admin",
            recordedAt: reviewedAt || new Date().toISOString(),
            brokerIds: DEFAULT_BROKER_PROFILES.map((profile) => profile.id),
            adminLocales: adminLocales(activeRegistry),
          });
          if (!result.idempotent) {
            recordAudit({
              action: "workspace_settings_updated",
              objectType: "workspace_settings",
              objectId: result.section,
              metadata: { section: result.section, changed_fields: result.changed_fields, revision: result.revision },
            });
          }
          if (formRequest) {
            const target = new URL("/admin/settings", "http://ms-realty.local");
            if (input.locale) target.searchParams.set("locale", requestedLocale);
            target.searchParams.set("saved", result.section);
            return adminResponse(303, "", "text/plain; charset=utf-8", {
              location: `${target.pathname}${target.search}#settings-${result.section}`,
            });
          }
          return adminJson(200, {
            kind: "workspace_settings",
            section: result.section,
            values: result.values,
            changed_fields: result.changed_fields,
            revision: result.revision,
            idempotent: result.idempotent,
            settings: workspaceSettingsView(result.settings),
          });
        } catch (error) {
          const status = error.status || 400;
          if (formRequest && status === 400) {
            const payload = settingsPage(requestedLocale, { section, error: error.message, field: error.field || null, values: input });
            return adminResponse(400, adminHtml(payload), "text/html; charset=utf-8");
          }
          return adminJson(status, { kind: error.code || "bad_request", message: error.message, field: error.field || null });
        }
      }
      return adminJson(405, { kind: "method_not_allowed" });
    }
    const recordProviderConnectionFailure = (provider, phase, error) =>
      recordAudit({
        action: "provider_connection_failed",
        objectType: "provider_connection",
        objectId: String(provider || "unknown"),
        metadata: {
          phase: String(phase || "unknown"),
          error_code: String(error?.code || error?.name || "provider_rejected").slice(0, 80),
        },
      });
    const viewingStoreErrorResponse = (error) => {
      if (error instanceof LeadStoreUnavailableError || error?.code === "lead_store_unavailable") {
        return adminJson(503, { kind: "lead_store_unavailable", message: "Lead storage is temporarily unavailable" });
      }
      if (error instanceof ViewingStoreUnavailableError || error?.code === "viewing_store_unavailable") {
        return adminJson(503, { kind: "viewing_store_unavailable", message: "Viewing storage is temporarily unavailable" });
      }
      if (error instanceof ViewingConflictError || error?.code === "viewing_conflict") {
        return adminJson(error.status || 409, { kind: "viewing_conflict", message: error.message });
      }
      return null;
    };
    const syncViewingBookingCalendar = async (viewing) => {
      try {
        const result = await syncViewingToGoogleCalendar(viewing, {
          config: providerConnection,
          payload: providerConnectionPayload || null,
          fetchImpl: providerFetch,
        });
        if (result.status === "synced") {
          recordAudit({
            action: "provider_calendar_synced",
            actor: viewing.broker,
            objectType: "provider_connection",
            objectId: "google",
            locale: viewing.original_language,
            metadata: {
              viewing_id: viewing.id,
              lead_id: viewing.lead_id,
              listing_reference: viewing.listing_reference,
              calendar_event_id: result.calendar_event_id,
            },
          });
        }
        return result;
      } catch (error) {
        const message =
          error instanceof ProviderConnectionUnavailableError
            ? "Provider connection store is unavailable"
            : String(error?.message || "Google Calendar sync failed");
        recordAudit({
          action: "provider_calendar_sync_failed",
          actor: viewing.broker,
          objectType: "provider_connection",
          objectId: "google",
          locale: viewing.original_language,
          metadata: {
            viewing_id: viewing.id,
            lead_id: viewing.lead_id,
            listing_reference: viewing.listing_reference,
            reason: message,
          },
        });
        return { status: "failed", provider: "google", message };
      }
    };
    const appendViewingBooking = async (input) => {
      const [leadSource, viewingSource] = await Promise.all([
        currentDurableLeadSource(principal, payloadSession),
        currentDurableViewingSource(),
      ]);
      const filterRows = leadScopedRows(leadSource);
      const context = {
        leads: applyLeadAssignments(leadSource.leads, filterRows(readLeadAssignments(leadAssignmentLedgerPath || undefined))),
        outcomes: filterRows(readLeadPipelineOutcomes(leadPipelineOutcomeLedgerPath || undefined)),
        viewings: filterRows(viewingSource.viewings),
        viewingFollowUps: filterRows(readViewingFollowUps(viewingFollowUpLedgerPath || undefined)),
        deals: filterRows(readDeals(dealLedgerPath || undefined)),
        sellerPipelines: filterRows(readSellerPipeline(sellerPipelinePath || undefined)),
        sellerPipelineOutcomes: filterRows(readSellerPipelineOutcomes(sellerPipelineOutcomeLedgerPath || undefined)),
      };
      const boundInput = bindAuthenticatedOperator(input, principal, ["broker"]);
      let viewing;
      if (viewingSource.durable) {
        const candidate = createViewing(context, boundInput, { rows: context.viewings, bookedAt });
        viewing = candidate.idempotent
          ? { ...candidate, durable: true }
          : await persistViewingDurably(candidate, { payload: viewingDurablePayload || null });
      } else {
        viewing = appendViewing(context, boundInput, { filePath: viewingLedgerPath || undefined, bookedAt });
      }
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
      if (!viewingSource.durable) return viewing;
      let calendarSync = await syncViewingBookingCalendar(viewing);
      calendarSync = await recordViewingCalendarSync(viewing.id, calendarSync, {
        payload: viewingDurablePayload || null,
        recordedAt: bookedAt || new Date().toISOString(),
      });
      if (calendarSync.status === "synced") {
        return { ...viewing, calendar_sync: calendarSync, message: "Viewing booked and added to Google Calendar." };
      }
      if (calendarSync.status === "failed") {
        return { ...viewing, calendar_sync: calendarSync, message: "Viewing booked, but Google Calendar sync failed." };
      }
      if (["not_configured", "not_connected"].includes(calendarSync.status)) {
        return {
          ...viewing,
          calendar_sync: calendarSync,
          message: "Viewing booked. Connect Google Calendar to sync it automatically.",
        };
      }
      return { ...viewing, calendar_sync: calendarSync };
    };
    if (publicWriteLimiter && request.method === "POST" && PUBLIC_WRITE_PATHS.has(url.pathname)) {
      const verdict = publicWriteLimiter.allow(`${clientIdentity(request, { trustProxy })}:${url.pathname}`);
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
      let retained;
      try {
        const context = await currentPublicContext();
        retained = renderRuntimePath(
          context.registry,
          context.seed,
          legacyDecision.target_path,
          context.translationTasks,
          currentBrokerContacts(),
          currentTourApprovals(),
          preservationCatalog,
        );
      } catch (error) {
        return json(error.status || 503, { kind: error.code || "payload_draft_unavailable", message: error.message });
      }
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
      try {
        const context = await currentPublicContext();
        return response(
          200,
          renderSitemapXml(buildRuntimeLocalizedSitemap(context.registry, context.seed, context.translationTasks)),
          "application/xml; charset=utf-8",
        );
      } catch (error) {
        return json(error.status || 503, { kind: error.code || "payload_draft_unavailable", message: error.message });
      }
    }

    if (request.method === "GET" && url.pathname === "/") {
      const location = siteRootRedirectTarget(loadLocaleRegistry());
      return response(308, `Redirecting to ${location}\n`, "text/plain; charset=utf-8", { location });
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
        build_marker: readBuildMarker(),
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
        const outcome = await searchResultOrUnavailable(searchRequest, {
          pageSize: savedView ? null : intent.page_size,
          savedView,
          view,
        });
        if (outcome.response) {
          // The API keeps its JSON contract, but a person on the search PAGE
          // gets a branded page with working contact channels, not raw JSON.
          return publicResponse(request, url, renderSearchUnavailablePage({ registry: activeRegistry, localeCode: searchLocale.code }));
        }
        recordEvent({ type: "search", path: url.pathname, locale: intent.locale, query, filters, sort, page });
        return publicResponse(request, url, outcome.result);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/admin/leads") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const requestedLocale = adminLocaleParam(url);
      const payload = currentAdminLeadPayload(requestedLocale, principal, requestLeadRows);
      if (wantsHtml(request, url)) return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      return adminJson(200, payload);
    }

    if (request.method === "GET" && url.pathname === "/admin/connect") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      let availability = operatorProviderAvailability(providerConnection);
      let connections = [];
      let storeError = !availability.store.ready;
      try {
        if (availability.store.ready) connections = await readProviderConnections({ payload: providerConnectionPayload });
      } catch {
        storeError = true;
      }
      if (storeError) {
        availability = Object.fromEntries(
          Object.entries(availability).map(([key, value]) => [key, { ...value, ready: false }]),
        );
      }
      const token = principal?.source === "payload_session" ? "" : String(auth).replace(/^Bearer\s+/i, "").trim();
      const base =
        String(providerConnection.publicOrigin || "").trim() ||
        new URL(request.url, `http://${requestHost(request.headers) || "localhost"}`).origin;
      const connectLocale = adminLocaleParam(url);
      const result = operatorConnectResult({
        locale: connectLocale,
        connected: url.searchParams.get("connected") || "",
        disconnected: url.searchParams.get("disconnected") || "",
        verified: url.searchParams.get("verified") || "",
        error: Boolean(url.searchParams.get("error")),
        storeError,
      });
      // A delegated, expiring credential for the operator's own assistant. It is
      // minted per page view rather than stored, so nothing here can leak a
      // token the operator never chose to copy.
      const agent = issueOperatorAgentToken({ principal, env: operatorAgentEnv });
      if (agent) {
        recordAudit({
          action: "operator_agent_token_issued",
          actor: principal?.id,
          objectType: "operator_agent_token",
          objectId: agent.operator_id,
          metadata: { expires_at: agent.expires_at, roles: agent.roles },
        });
      }
      return adminResponse(
        200,
        renderOperatorConnectPage({
          baseUrl: base,
          token,
          operatorId: principal?.id || "operator",
          connections,
          availability,
          providerConfig: providerConnection,
          agentToken: agent?.token || "",
          agentExpiresAt: agent?.expires_at || "",
          result,
          locale: connectLocale,
        }),
        "text/html; charset=utf-8",
        { "x-robots-tag": "noindex, nofollow" },
      );
    }

    if (
      url.pathname === "/api/admin/connections" ||
      url.pathname === OPERATOR_CONNECTION_DISCONNECT_PATH ||
      url.pathname === OPERATOR_CONNECTION_AGENT_CONFIG_PATH
    ) {
      const availability = operatorProviderAvailability(providerConnection);
      const storeOptions = {
        credentialSecret: providerConnection.credentialSecret,
        payload: providerConnectionPayload,
      };
      const connectionDeps = {
        fetchImpl: providerFetch,
        storeOptions,
        env: operatorAgentEnv,
        readProviderCredentials,
        saveProviderConnection,
        deleteProviderConnection,
      };
      const connectionRedirect = (query) =>
        adminResponse(303, "", "text/plain; charset=utf-8", { location: `/admin/connect?${query}` });
      const recordConnectionOutcome = (outcome) => {
        const entry = operatorConnectionAudit(outcome, { actor: principal.id });
        if (entry) recordAudit(entry);
      };
      try {
        if (request.method === "GET" && url.pathname === "/api/admin/connections" && !url.searchParams.get("action")) {
          return adminJson(200, {
            kind: "provider_connections",
            availability,
            connections: await readProviderConnections({ payload: providerConnectionPayload }),
          });
        }
        if (!payloadSession || principal?.source !== "payload_session" || !principal.roles?.includes("admin")) {
          return adminForbidden("payload_admin_session");
        }
        // The assistant's configuration, for a caller that wants it as data
        // rather than as the copy block on the page.
        if (url.pathname === OPERATOR_CONNECTION_AGENT_CONFIG_PATH) {
          if (request.method !== "GET") return adminJson(405, { kind: "method_not_allowed" });
          const agent = issueOperatorAgentToken({ principal, env: operatorAgentEnv });
          if (!agent) {
            return adminJson(503, {
              kind: "operator_agent_token_unavailable",
              message: "Operator agent tokens are not configured",
            });
          }
          const origin =
            String(providerConnection.publicOrigin || "").trim() ||
            new URL(request.url, `http://${requestHost(request.headers) || "localhost"}`).origin;
          recordAudit({
            action: "operator_agent_token_issued",
            actor: principal.id,
            objectType: "operator_agent_token",
            objectId: agent.operator_id,
            metadata: { expires_at: agent.expires_at, roles: agent.roles },
          });
          return adminJson(200, {
            kind: "operator_agent_config",
            operator_id: agent.operator_id,
            expires_at: agent.expires_at,
            mcp_url: `${new URL(origin).origin}/mcp`,
            config: operatorAgentConfigBlock({
              baseUrl: origin,
              token: agent.token,
              operatorId: agent.operator_id,
              expiresAt: agent.expires_at,
              locale: adminLocaleParam(url),
            }),
          });
        }
        if (url.pathname === OPERATOR_CONNECTION_DISCONNECT_PATH) {
          if (request.method !== "POST") return adminJson(405, { kind: "method_not_allowed" });
          const input = parseBody(request);
          const formEncoded = String(request.headers?.["content-type"] || request.headers?.["Content-Type"] || "").includes(
            "application/x-www-form-urlencoded",
          );
          const outcome = await runOperatorConnectionAction({
            intent: "disconnect",
            provider: input.provider,
            operatorId: principal.id,
            config: providerConnection,
            deps: connectionDeps,
          });
          if (outcome.outcome === "rejected") {
            recordProviderConnectionFailure(outcome.provider, outcome.phase, outcome.error);
            if (formEncoded) return connectionRedirect(`error=${encodeURIComponent(outcome.provider)}`);
            return adminJson(400, { kind: "provider_disconnect_rejected", message: "The connection was not removed" });
          }
          recordConnectionOutcome(outcome);
          if (formEncoded) return connectionRedirect(`disconnected=${encodeURIComponent(outcome.provider)}`);
          return adminJson(200, {
            kind: "provider_disconnected",
            provider: outcome.provider,
            revoked: outcome.revoked,
            deleted: outcome.deleted,
          });
        }
        const requestedProvider = String(url.searchParams.get("provider") || "").trim().toLowerCase();
        if (request.method === "GET" && isOperatorOAuthProvider(requestedProvider)) {
          const action = url.searchParams.get("action");
          if (action === "start") {
            try {
              return adminResponse(303, "", "text/plain; charset=utf-8", {
                location: operatorConnectionStart({
                  provider: requestedProvider,
                  config: providerConnection,
                  operatorId: principal.id,
                }),
              });
            } catch (error) {
              recordProviderConnectionFailure(requestedProvider, "oauth_start", error);
              return connectionRedirect(`error=${encodeURIComponent(requestedProvider)}`);
            }
          }
          if (action === "callback") {
            if (url.searchParams.get("error")) {
              recordProviderConnectionFailure(requestedProvider, "oauth_callback", new Error("provider_rejected"));
              return connectionRedirect(`error=${encodeURIComponent(requestedProvider)}`);
            }
            const outcome = await runOperatorConnectionAction({
              intent: "callback",
              provider: requestedProvider,
              code: url.searchParams.get("code"),
              state: url.searchParams.get("state"),
              operatorId: principal.id,
              config: providerConnection,
              deps: connectionDeps,
            });
            if (outcome.outcome === "rejected") {
              recordProviderConnectionFailure(outcome.provider, outcome.phase, outcome.error);
              return connectionRedirect(`error=${encodeURIComponent(outcome.provider)}`);
            }
            recordConnectionOutcome(outcome);
            return connectionRedirect(`connected=${encodeURIComponent(outcome.provider)}`);
          }
        }
        if (request.method === "POST") {
          const formEncoded = String(request.headers?.["content-type"] || request.headers?.["Content-Type"] || "").includes(
            "application/x-www-form-urlencoded",
          );
          const input = parseBody(request);
          const provider = String(input.provider || "").trim().toLowerCase();
          const outcome = await runOperatorConnectionAction({
            intent: "submit",
            provider,
            input,
            operatorId: principal.id,
            config: providerConnection,
            deps: connectionDeps,
          });
          if (outcome.outcome === "rejected") {
            recordProviderConnectionFailure(outcome.provider, outcome.phase, outcome.error);
            if (formEncoded) return connectionRedirect(`error=${encodeURIComponent(outcome.provider || "provider")}`);
            return adminJson(400, {
              kind: "provider_connection_rejected",
              message: "The provider did not confirm the connection",
            });
          }
          recordConnectionOutcome(outcome);
          const query =
            outcome.outcome === "verified"
              ? `verified=${encodeURIComponent(outcome.provider)}`
              : `connected=${encodeURIComponent(outcome.provider)}`;
          if (formEncoded) return connectionRedirect(query);
          return adminJson(201, { kind: "provider_connection", connection: outcome.connection });
        }
        return adminJson(405, { kind: "method_not_allowed" });
      } catch (error) {
        if (error instanceof ProviderConnectionUnavailableError || error?.code === "provider_connection_unavailable") {
          return adminJson(503, {
            kind: "provider_connection_unavailable",
            message: "Provider connection storage is unavailable",
          });
        }
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "GET" && url.pathname === "/admin/leads") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      return adminResponse(
        200,
        adminHtml(currentAdminLeadPayload(adminLocaleParam(url), principal, requestLeadRows)),
        "text/html; charset=utf-8",
      );
    }

    if (request.method === "GET" && ["/api/admin/contacts", "/admin/contacts"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = currentContactPayload(adminLocaleParam(url), principal, requestLeadRows);
      if (url.pathname === "/admin/contacts" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && ["/api/admin/documents", "/admin/documents"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = currentDocumentChecklistPayload(adminLocaleParam(url), principal, requestLeadRows);
      if (url.pathname === "/admin/documents" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && ["/api/admin/cases", "/admin/cases"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      let payload;
      try {
        payload = await currentRealtyCasePayload(adminLocaleParam(url), principal);
      } catch (error) {
        if (realtyCasePayloadAuthorityEnabled) return adminJson(503, realtyCasePayloadAuthorityFailure());
        throw error;
      }
      if (url.pathname === "/admin/cases" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && url.pathname === "/api/admin/cases/intents") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        return adminJson(200, await currentAutonomousRealtyCaseIntents());
      } catch (error) {
        if (realtyCasePayloadAuthorityEnabled) return adminJson(503, realtyCasePayloadAuthorityFailure());
        throw error;
      }
    }

    if (request.method === "GET" && url.pathname === "/api/admin/cases/conditions") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        return adminJson(200, await currentRealtyCaseConditionQueue());
      } catch (error) {
        if (realtyCasePayloadAuthorityEnabled) return adminJson(503, realtyCasePayloadAuthorityFailure());
        throw error;
      }
    }

    if (request.method === "GET" && ["/api/admin/consents", "/admin/consents"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = currentConsentPayload(adminLocaleParam(url), principal);
      if (url.pathname === "/admin/consents" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && url.pathname === "/admin") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const locale = adminLocaleParam(url);
      // A Payload login lands here first; the one-time welcome banner rides on
      // this hop so bearer-token API clients never see it.
      const welcome = principal?.source === "payload_session" ? "&welcome=1" : "";
      return adminResponse(302, "", "text/plain; charset=utf-8", {
        location: `${adminHomePath(principal)}?locale=${encodeURIComponent(locale)}${welcome}`,
      });
    }

    if (request.method === "GET" && ["/api/admin/today", "/admin/today"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const todayPayload = currentTodayPayload(adminLocaleParam(url), principal, requestLeadRows);
      const payload = withWorkspaceSettings({
        ...todayPayload,
        onboarding: await currentWorkspaceOnboarding(todayPayload, payloadSession),
        welcome: url.searchParams.get("welcome") === "1",
      });
      if (url.pathname === "/admin/today" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && ["/api/admin/pipeline", "/admin/pipeline"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = currentPipelinePayload(adminLocaleParam(url), principal, requestLeadRows);
      if (url.pathname === "/admin/pipeline" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && ["/api/admin/requests", "/admin/requests"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const payload = currentRequestsPayload(adminLocaleParam(url), principal, requestLeadRows);
      if (url.pathname === "/admin/requests" || wantsHtml(request, url)) {
        return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
      }
      return adminJson(200, payload);
    }

    if (request.method === "GET" && ["/api/admin/viewings", "/admin/viewings"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const payload = await currentViewingsPayload(
          adminLocaleParam(url),
          principal,
          requestLeadRows,
          payloadSession,
          { week: url.searchParams.get("week"), view: url.searchParams.get("view") },
        );
        if (url.pathname === "/admin/viewings" || wantsHtml(request, url)) {
          return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
        }
        return adminJson(200, payload);
      } catch (error) {
        return viewingStoreErrorResponse(error) || adminJson(400, { kind: "bad_request", message: error.message });
      }
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
      try {
        const payload = await currentListingManagerPayload(url, principal);
        if (url.pathname === "/admin/listings" || wantsHtml(request, url)) {
          return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
        }
        return adminJson(200, payload);
      } catch (error) {
        return adminJson(error.status || 400, { kind: error.code || "bad_request", message: error.message });
      }
    }

    if (request.method === "GET" && ["/api/admin/translations", "/admin/translations"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const payload = await currentTranslationQueuePayload(url, principal);
        if (url.pathname === "/admin/translations" || wantsHtml(request, url)) {
          return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
        }
        return adminJson(200, payload);
      } catch (error) {
        return adminJson(error.status || 400, { kind: error.code || "bad_request", message: error.message });
      }
    }

    if (request.method === "GET" && ["/api/admin/reports", "/admin/reports"].includes(url.pathname)) {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const payload = await currentReportsPayload(
          adminLocaleParam(url),
          principal,
          requestLeadRows,
          payloadSession,
        );
        if (url.pathname === "/admin/reports" || wantsHtml(request, url)) {
          return adminResponse(200, adminHtml(payload), "text/html; charset=utf-8");
        }
        return adminJson(200, payload);
      } catch (error) {
        return viewingStoreErrorResponse(error) || adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/admin/reports/export") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        return adminResponse(
          200,
          renderOperationsReportCsv(await currentOperationsReport(requestLeadRows, principal, payloadSession)),
          "text/csv; charset=utf-8",
          {
          "content-disposition": 'attachment; filename="ms-realty-source-quality.csv"',
          },
        );
      } catch (error) {
        return viewingStoreErrorResponse(error) || adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/admin/viewings.ics") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const leadSource = await currentDurableLeadSource(principal, payloadSession, requestLeadRows);
        const source = await currentDurableViewingSource();
        return adminResponse(
          200,
          renderViewingCalendar(leadScopedRows(leadSource)(source.viewings), { now: bookedAt || receivedAt }),
          "text/calendar; charset=utf-8",
          { "content-disposition": "attachment; filename=\"ms-realty-viewings.ics\"" },
        );
      } catch (error) {
        return viewingStoreErrorResponse(error) || adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/admin/locales") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      const requestedLocale = adminLocaleParam(url);
      return adminJson(200, {
        workspace: renderAdminWorkspace({ registry: activeRegistry, requestedLocale }),
        locales: activeRegistry.locales,
        ...(runtimeDataDurableOnly ? { runtime_data_mode: "durable_only" } : {}),
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
        return adminResponse(200, adminHtml(await currentListingEditorPayload(url, principal)), "text/html; charset=utf-8");
      } catch (error) {
        return adminJson(error.status || 400, { kind: error.code || "bad_request", message: error.message });
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
        {
          listingVerification: currentListingVerification(),
          translationCoverage: currentTranslationCoverage(),
          brokerContacts: currentBrokerContacts(),
        },
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
        {
          listingVerification: currentListingVerification(),
          translationCoverage: currentTranslationCoverage(),
          brokerContacts: currentBrokerContacts(),
        },
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
        recovery: productionRecoveryState(productionRecoveryReportPath || undefined, {
          publicKey: productionRecoverySigningPublicKey,
          ...(productionRecoveryAt ? { now: productionRecoveryAt } : {}),
        }),
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
        const outPath = writeProductionRecoveryReport(report, productionRecoveryReportPath || undefined, {
          publicKey: productionRecoverySigningPublicKey,
        });
        const recovery = productionRecoveryState(productionRecoveryReportPath || undefined, {
          publicKey: productionRecoverySigningPublicKey,
          ...(productionRecoveryAt ? { now: productionRecoveryAt } : {}),
        });
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
      const outPath = writeLaunchReadinessReport(report, launchReadinessOutputPath || undefined, {
        productionRecoveryPublicKey: productionRecoverySigningPublicKey,
      });
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
        const result = await saveListingDraft(currentSeed(), {
          env: payloadListingEnv,
          payload: payloadListingRuntime,
          principal,
          input: listingEditInput(request),
          editedAt,
        });
        if (!result.idempotent) {
          recordAudit({
            action: "listing_edited",
            actor: principal?.id,
            objectType: "listing",
            objectId: result.listingId,
            metadata: {
              changed_fields: result.changedFields,
              source: "admin_payload_draft",
            },
          });
        }
        return adminJson(result.idempotent ? 200 : 201, {
          kind: "listing_draft_saved",
          listing_id: result.listingId,
          changed_fields: result.changedFields,
          staleTranslations: result.staleTranslations,
          editor_url: listingEditorPath(result.listingId),
          draft_only: true,
          publication_approval_changed: false,
          idempotent: result.idempotent,
        });
      } catch (error) {
        return adminJson(error.status || 400, { kind: error.code || "bad_request", message: error.message });
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
        return adminJson(error.status || 400, { kind: error.code || "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/listings/status") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = bindAuthenticatedOperator(parseBody(request), principal, ["editor"]);
        const result = await saveBulkListingStatusDrafts(currentSeed(), {
          env: payloadListingEnv,
          payload: payloadListingRuntime,
          principal,
          input,
          editedAt,
        });
        for (const edit of result.edits.filter((row) => !row.idempotent)) {
          recordAudit({
            action: "listing_edited",
            actor: edit.editor,
            objectType: "listing",
            objectId: edit.listing_id,
            metadata: {
              changed_fields: ["listing_status"],
              source: "admin_payload_draft",
            },
          });
        }
        const body = {
          kind: "bulk_listing_status_update",
          targetStatus: result.batch.targetStatus,
          requested: result.batch.requestedListingIds.length,
          updated: result.edits.filter((row) => !row.idempotent).length,
          idempotent: result.edits.filter((row) => row.idempotent).length,
          unchanged: result.batch.unchangedListingIds.length,
          unchangedListingIds: result.batch.unchangedListingIds,
          edits: result.edits,
          staleTranslations: result.staleTranslations,
        };
        return adminJson(body.updated ? 201 : 200, body);
      } catch (error) {
        return adminJson(error.status || 400, { kind: error.code || "bad_request", message: error.message });
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
        const input = bindAuthenticatedOperator(reviewedReplyInput(request), principal, ["reviewer"]);
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
        const input = parseBody(request);
        if (input.provider && !input.action) {
          if (!principal?.id) throw new Error("Provider delivery requires a named authenticated operator");
          const authorizedInput = bindAuthenticatedOperator(input, principal, ["actor", "approvedBy"]);
          const replies = readReplyOutbox(replyOutboxPath || undefined);
          const replyId = String(authorizedInput.replyId || authorizedInput.reply_id || "").trim();
          const reply = replyId ? replies.find((row) => row.id === replyId) : null;
          if (replyId && !reply) throw new Error("Approved reply was not found");
          if (reply && reply.broker_approved !== true) throw new Error("Broker approval is required before provider delivery");
          const leadId = String(reply?.lead_id || authorizedInput.leadId || authorizedInput.lead_id || "").trim();
          if (!leadId) throw new Error("Lead id is required for provider delivery");
          const lead = currentLeads().find((row) => row.lead_id === leadId);
          if (!lead) throw new Error("Lead was not found for provider delivery");
          const provider = String(authorizedInput.provider || "").trim().toLowerCase();
          const channel = providerDeliveryChannel(provider);
          const message = String(reply?.reviewed_reply || authorizedInput.reviewedReply || authorizedInput.message || "").trim();
          if (!message) throw new Error("Provider delivery message is required");
          const idempotencyKey = String(
            authorizedInput.idempotencyKey || authorizedInput.idempotency_key || (reply ? `reply:${reply.id}:${provider}` : ""),
          ).trim();
          if (!idempotencyKey) throw new Error("idempotencyKey is required for direct provider delivery");
          const approvedAt = replyDeliveredAt || new Date().toISOString();
          const providerDelivery = await deliverApprovedProviderMessage(
            {
              provider,
              leadId,
              idempotencyKey,
              recipient: providerDeliveryRecipient(lead, provider),
              message,
              ...(provider === "google" ? { subject: googleReplySubject(lead) } : {}),
              approved: true,
              approvedBy: authorizedInput.approvedBy,
              approvedAt,
            },
            {
              config: providerConnection,
              payload: providerConnectionPayload,
              fetchImpl: providerFetch,
            },
          );
          if (providerDelivery.status !== "sent") throw new Error("Provider did not confirm message delivery");
          const sentAt = providerDelivery.completed_at || approvedAt;
          const result = reply
            ? appendReplyDeliveryOutcome(
                replies,
                {
                  replyId: reply.id,
                  actor: authorizedInput.actor,
                  action: "sent",
                  channel,
                  sentAt,
                },
                { filePath: replyDeliveryOutcomeLedgerPath || undefined, recordedAt: sentAt },
              )
            : {
                idempotent: providerDelivery.idempotent === true,
                delivery: {
                  lead_id: leadId,
                  status: "sent",
                  delivery_channel: channel,
                  sent_at: sentAt,
                },
              };
          const existingDeliveryAudit =
            reply && auditLogPath
              ? readAuditLog(auditLogPath).some(
                  (row) => row.action === "reply_delivery_recorded" && row.object_id === result.outcome.id,
                )
              : false;
          if (reply && !existingDeliveryAudit) {
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
              sentAt,
            );
          }
          const existingProviderAudit = auditLogPath
            ? readAuditLog(auditLogPath).some(
                (row) =>
                  row.action === "provider_reply_sent" &&
                  row.metadata?.receipt_id === providerDelivery.idempotency_key,
              )
            : false;
          if (!existingProviderAudit) {
            recordAudit(
              {
                action: "provider_reply_sent",
                actor: authorizedInput.actor,
                objectType: "provider_connection",
                objectId: provider,
                locale: reply?.reply_language || lead.original_language || lead.admin_locale || "en",
                metadata: {
                  ...(reply ? { reply_id: reply.id } : {}),
                  lead_id: leadId,
                  receipt_id: providerDelivery.idempotency_key,
                  external_message_id: providerDelivery.external_message_id,
                },
              },
              sentAt,
            );
          }
          return adminJson(result.idempotent ? 200 : 201, { ...result, provider_delivery: providerDelivery });
        }
        const recordedAt = replyDeliveredAt || reviewedAt || receivedAt || new Date().toISOString();
        const result = appendReplyDeliveryOutcome(
          readReplyOutbox(replyOutboxPath || undefined),
          bindAuthenticatedOperator(input, principal),
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
        if (error instanceof ProviderDeliveryError) {
          const status =
            error.code === "provider_delivery_unavailable"
              ? 503
              : ["provider_delivery_uncertain", "provider_delivery_conflict"].includes(error.code)
                ? 409
                : 400;
          return adminJson(status, {
            kind: error.code,
            message: error.message,
            ...(error.receipt ? { receipt: error.receipt } : {}),
          });
        }
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
        const workspaceSettings = currentWorkspaceSettings();
        const lead = applyWorkspaceDefaultBroker(
          createCrmInboxItem(activeRegistry, input, { assignedId: leadId }),
          workspaceSettings,
          DEFAULT_BROKER_PROFILES,
        );
        const contactVault = appendLeadContact(lead, {
          filePath: leadContactVaultPath,
          secret: leadContactKey,
          storedAt: receivedAt,
        });
        const ledger = appendLead(lead, {
          filePath: leadLedgerPath || undefined,
          receivedAt,
          contactSecret: leadContactKey,
          ...leadSlaOptions(workspaceSettings),
        });
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
        const payloadAuthority = realtyCasePayloadAuthorityActive();
        if (payloadAuthority) {
          assertRealtyCasePayloadAuthorityInput(input);
        } else if (
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
        const boundInput = bindRealtyCaseExecutor(input, principal);
        const result = payloadAuthority
          ? await openRealtyCaseInPayload(boundInput, {
              payload: realtyCasePayload,
              workspaceId: realtyCaseWorkspaceId,
              recordedAt,
            })
          : openRealtyCase(boundInput, {
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
        if (payloadAuthority) return adminJson(result.idempotent ? 200 : 201, result);
        try {
          const projection = await projectCurrentRealtyCase(result);
          return adminJson(result.idempotent ? 200 : 201, projection ? { ...result, projection } : result);
        } catch {
          return adminJson(503, realtyCaseRequestProjectionFailure(result));
        }
      } catch (error) {
        if (error.status === 403) return adminForbidden(error.capability || "administration:write");
        if (error.status === 503) {
          return adminJson(
            503,
            realtyCasePayloadAuthorityEnabled ? realtyCasePayloadAuthorityFailure() : realtyCaseRequestProjectionFailure(),
          );
        }
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/cases/actions") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      try {
        const input = parseBody(request);
        const payloadAuthority = realtyCasePayloadAuthorityActive();
        if (payloadAuthority) {
          assertRealtyCasePayloadAuthorityInput(input, { action: true });
        } else if (
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
        const boundInput = bindRealtyCaseExecutor(input, principal);
        const result = payloadAuthority
          ? await appendRealtyCaseActionInPayload(boundInput, {
              payload: realtyCasePayload,
              workspaceId: realtyCaseWorkspaceId,
              recordedAt,
            })
          : appendRealtyCaseAction(boundInput, {
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
        if (payloadAuthority) return adminJson(result.idempotent ? 200 : 201, result);
        try {
          const projection = await projectCurrentRealtyCase(result);
          return adminJson(result.idempotent ? 200 : 201, projection ? { ...result, projection } : result);
        } catch {
          return adminJson(503, realtyCaseRequestProjectionFailure(result));
        }
      } catch (error) {
        if (error.status === 403) return adminForbidden(error.capability || "administration:write");
        if (error.status === 503) {
          return adminJson(
            503,
            realtyCasePayloadAuthorityEnabled ? realtyCasePayloadAuthorityFailure() : realtyCaseRequestProjectionFailure(),
          );
        }
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/cases/conditions") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      let result;
      let payloadAuthority = false;
      try {
        const input = parseBody(request);
        payloadAuthority = realtyCasePayloadAuthorityActive();
        if (payloadAuthority) {
          assertRealtyCasePayloadAuthorityInput(input);
        } else if (
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
        const boundInput = bindRealtyCaseConditionExecutor(input, principal, "condition_opened");
        result = payloadAuthority
          ? await openRealtyCaseConditionInPayload(boundInput, {
              payload: realtyCasePayload,
              workspaceId: realtyCaseWorkspaceId,
              recordedAt,
            })
          : openRealtyCaseCondition(boundInput, {
              filePath: realtyCaseConditionLedgerPath || undefined,
              caseLedgerPath: realtyCaseLedgerPath || undefined,
              recordedAt,
            });
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
        if (error.status === 503) {
          return adminJson(
            503,
            realtyCasePayloadAuthorityEnabled ? realtyCasePayloadAuthorityFailure() : realtyCaseRequestProjectionFailure(),
          );
        }
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
      if (payloadAuthority) return adminJson(result.idempotent ? 200 : 201, result);
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
      let payloadAuthority = false;
      try {
        const input = parseBody(request);
        payloadAuthority = realtyCasePayloadAuthorityActive();
        if (payloadAuthority) {
          assertRealtyCasePayloadAuthorityInput(input, { conditionAction: true });
        } else if (
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
        const boundInput = bindRealtyCaseConditionExecutor(input, principal, input?.action);
        result = payloadAuthority
          ? await appendRealtyCaseConditionActionInPayload(boundInput, {
              payload: realtyCasePayload,
              workspaceId: realtyCaseWorkspaceId,
              recordedAt,
            })
          : appendRealtyCaseConditionAction(boundInput, {
              filePath: realtyCaseConditionLedgerPath || undefined,
              caseLedgerPath: realtyCaseLedgerPath || undefined,
              recordedAt,
            });
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
        if (error.status === 503) {
          return adminJson(
            503,
            realtyCasePayloadAuthorityEnabled ? realtyCasePayloadAuthorityFailure() : realtyCaseRequestProjectionFailure(),
          );
        }
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
      if (payloadAuthority) return adminJson(result.idempotent ? 200 : 201, result);
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
        const draft = await createHermesReplyDraft(currentLeads(), parseJsonBody(request), {
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
        const viewing = await appendViewingBooking(parseJsonBody(request));
        return adminJson(viewing.idempotent ? 200 : 201, viewing);
      } catch (error) {
        const failure = viewingStoreErrorResponse(error);
        if (failure) return failure;
        return adminJson(400, { kind: "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/viewings/follow-up") {
      if (!isAdminAuthorized(auth)) return adminUnauthorized();
      if (viewingDurableStore?.viewingDurableStoreEnabled) {
        return adminJson(503, {
          kind: "viewing_follow_up_read_only",
          message: "Durable viewing follow-up storage is not available",
        });
      }
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
            savedSearches: currentSavedSearches(),
            languageRequests: readLanguageRequests(languageRequestPath || undefined),
            viewingTrips: readViewingTripRequests(viewingTripLedgerPath || undefined),
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
        return adminJson(error.status || 400, { kind: error.code || "bad_request", message: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/leads") {
      try {
        const input = parseBody(request);
        const context = await currentPublicContext();
        const workspaceSettings = currentWorkspaceSettings();
        const lead = applyWorkspaceDefaultBroker(
          submitRuntimeLead(context.registry, context.seed, input),
          workspaceSettings,
          DEFAULT_BROKER_PROFILES,
        );
        const durableRequested = leadDurableStore.leadDurableStoreEnabled === true;
        if (runtimeDataDurableOnly && !durableRequested) {
          throw new LeadStoreUnavailableError("Production lead intake requires the durable store");
        }
        if (durableRequested && !isLeadDurableStoreEnabled(leadDurableStore)) {
          throw new LeadStoreUnavailableError("Durable lead store is enabled but not fully configured");
        }
        const durable = durableRequested
          ? await persistLeadIntake({
              lead,
              contactSecret: leadDurableStore.contactSecret,
              marketingOptIn: input.marketingOptIn === true,
              receivedAt,
              sellerPipelineCreatedAt,
              workspaceId: leadDurableStore.workspaceId,
            })
          : null;
        const contactVault = durable
          ? durable.contactVault
          : leadContactVaultPath
            ? appendLeadContact(lead, { filePath: leadContactVaultPath, secret: leadContactKey, storedAt: receivedAt })
            : null;
        const ledger =
          durable?.lead ||
          (leadLedgerPath
            ? appendLead(lead, { filePath: leadLedgerPath, receivedAt, contactSecret: leadContactKey, ...leadSlaOptions(workspaceSettings) })
            : null);
        const consent = durable
          ? durable.consent
          : recordConsent({
              consentType: "inquiry_follow_up",
              source: lead.lead?.source,
              subjectId: lead.lead?.id,
              locale: lead.original_language,
              contact: lead.lead?.contact,
              marketingOptIn: input.marketingOptIn === true,
            });
        const sellerPipeline = durable
          ? durable.sellerPipeline
          : sellerPipelinePath && lead.lead?.leadType === "seller"
            ? appendSellerPipeline(createSellerPipelineItem(lead, { createdAt: sellerPipelineCreatedAt }), {
                filePath: sellerPipelinePath,
              })
            : null;
        if (!durable) {
          recordEvent({
            type: "lead_submitted",
            path: "/api/leads",
            locale: lead.original_language,
            listingReference: lead.lead?.listingReference,
            action: lead.lead?.source,
          });
        }
        return privateJson(durable?.created === false ? 200 : 201, { ...lead, ledger, contactVault, consent, sellerPipeline });
      } catch (error) {
        if (error instanceof LeadStoreUnavailableError) {
          return privateJson(503, { kind: error.code, message: "Lead storage is temporarily unavailable" });
        }
        return privateJson(error.status || 400, { kind: error.code || "bad_request", message: error.message });
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
        const context = await currentPublicContext();
        const search = searchRuntimeListings(context.registry, context.seed, {
          localeCode: intent.locale,
          query: intent.text_query,
          filters,
          sort: intent.sort,
          page: intent.page,
          pageSize: null,
          translationTasks: context.translationTasks,
        });
        const priceSnapshot = Object.fromEntries(
          search.cards.map((card) => [card.id, Number(card.price_eur)]).filter(([, price]) => Number.isFinite(price)),
        );
        // B3: mint the manage-link capability alongside the record. Only the
        // derived verifier is stored; the raw token leaves in this response and
        // is never written to any ledger.
        const savedSearchSavedAt = savedAt || new Date().toISOString();
        let manageSecret = null;
        let manageUnavailableReason = null;
        try {
          manageSecret = savedSearchManageSecret || savedSearchAccessSecret();
        } catch (error) {
          manageUnavailableReason = error.message;
        }
        const manageTtlDays = savedSearchManageLinkTtlDays || savedSearchManageTtlDays();
        const manageTemplate = savedSearchManageLinkTemplate || savedSearchManagePathTemplate();
        let mintedToken = null;
        let mintedId = null;
        const savedSearch = createSavedSearch(
          context.registry,
          { ...input, search_intent: intent, priceSnapshot },
          {
            matchCount: search.search.total_matches,
            savedAt,
            manageAccess: manageSecret
              ? (recordId) => {
                  const minted = mintSavedSearchAccess(recordId, {
                    secret: manageSecret,
                    issuedAt: savedSearchSavedAt,
                    ttlDays: manageTtlDays,
                  });
                  mintedToken = minted.token;
                  mintedId = recordId;
                  return minted.access;
                }
              : null,
          },
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
        // A retried submission returns the original record, so the link has to
        // be re-derived for that record from its own stored issue window.
        // Deterministic minting makes that possible without ever storing a token.
        let manage = null;
        if (!ledger) {
          manageUnavailableReason ||= "Saved search storage is not configured";
        } else if (!ledger.manage_access?.verifier) {
          manageUnavailableReason ||= "This saved search predates manage links";
        } else if (ledger.id === mintedId && mintedToken) {
          manage = savedSearchManageLink(
            { locale: ledger.locale, token: mintedToken, expiresAt: ledger.manage_access.expires_at },
            { origin: savedSearchPublicOrigin, template: manageTemplate },
          );
        } else if (manageSecret) {
          const storedTtlDays = Math.round(
            (Date.parse(ledger.manage_access.expires_at) - Date.parse(ledger.manage_access.issued_at)) / 86_400_000,
          );
          const reminted =
            storedTtlDays >= 1
              ? mintSavedSearchAccess(ledger.id, {
                  secret: manageSecret,
                  issuedAt: ledger.manage_access.issued_at,
                  ttlDays: storedTtlDays,
                })
              : null;
          if (reminted && reminted.access.verifier === ledger.manage_access.verifier) {
            manage = savedSearchManageLink(
              { locale: ledger.locale, token: reminted.token, expiresAt: ledger.manage_access.expires_at },
              { origin: savedSearchPublicOrigin, template: manageTemplate },
            );
          } else {
            manageUnavailableReason ||= "The manage link for this saved search can no longer be derived";
          }
        }
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
        return privateJson(201, {
          ...safeSearch,
          ledger,
          contactVault,
          consent,
          manage,
          manage_unavailable_reason: manage ? null : manageUnavailableReason,
        });
      } catch (error) {
        return privateJson(error.status || 400, { kind: error.code || "bad_request", message: error.message });
      }
    }

    if (request.method !== "GET") return json(405, { kind: "method_not_allowed" });

    let rendered;
    try {
      const context = await currentPublicContext();
      // Public content routes (home, listing, location, seller, the buyer
      // onboarding start page, contact, guides) resolve by path; the query is
      // handed along so the onboarding finish step works without JavaScript.
      rendered = renderRuntimePath(
        context.registry,
        context.seed,
        url.pathname,
        context.translationTasks,
        currentBrokerContacts(),
        currentTourApprovals(),
        preservationCatalog,
        { searchParams: url.searchParams },
      );
    } catch (error) {
      return json(error.status || 503, { kind: error.code || "payload_draft_unavailable", message: error.message });
    }
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

export async function dispatchHttp(app, { method = "GET", url, body, headers, remoteAddress } = {}) {
  // A Buffer body is passed through byte-exact for multipart uploads; the
  // latin1 view keeps the string form lossless for anything that reads it.
  if (Buffer.isBuffer(body)) {
    return app({ method, url, headers, remoteAddress, body: body.toString("latin1"), bodyBytes: body });
  }
  return app({ method, url, headers, remoteAddress, body: typeof body === "string" ? body : body ? JSON.stringify(body) : "" });
}

export function assertHttpSmoke(smoke) {
  const contactLeadUiDisabled = smoke.contact?.body?.chrome?.lead_writes_disabled === true;
  const contactLeadUiValid = contactLeadUiDisabled
    ? smoke.contact?.body?.body?.callback === null && Boolean(smoke.contact?.body?.body?.form_unavailable)
    : smoke.contact?.body?.body?.callback?.payload?.source === "website_contact_callback";
  // Same durable-store readiness rule for the seller valuation intake.
  const sellerLeadUiDisabled = smoke.sellerPage?.body?.chrome?.lead_writes_disabled === true;
  const sellerLeadUiValid = sellerLeadUiDisabled
    ? smoke.sellerPage?.body?.body?.valuation === null &&
      Boolean(smoke.sellerPage?.body?.body?.form_unavailable)
    : smoke.sellerPage?.body?.body?.valuation?.payload?.source === "website_seller_valuation";
  const expectedBlockers = [
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
  if (smoke.brokerContact?.status !== 201 || !smoke.brokerContact.body.channels?.phone?.startsWith("tel:+")) {
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
    !contactLeadUiValid
  ) {
    throw new Error("HTTP smoke contact page must match durable lead-store readiness");
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
  if (
    smoke.hermesChatDisabled?.status !== 404 ||
    smoke.hermesChatDisabled.body.kind !== "not_found" ||
    smoke.hermesChatDisabled.headers?.["cache-control"] !== "no-store"
  ) {
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
    smoke.listingEditorHtml?.status !== 200 ||
    !smoke.listingEditorHtml.body.includes('data-admin-mutation-form="listing"')
  ) {
    throw new Error("HTTP smoke must render the custom listing editor");
  }
  if (
    smoke.listingEdit.status !== 503 ||
    smoke.listingEdit.body.kind !== "payload_draft_unavailable"
  ) {
    throw new Error("HTTP smoke must fail closed when the durable listing draft runtime is unavailable");
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
    /href="tel:(?!\+359879696870")/.test(smoke.listingHtml.body)
  ) {
    throw new Error("HTTP smoke must serve rendered listing HTML without unapproved direct contact");
  }
  if (
    smoke.listingPrint?.status !== 200 ||
    smoke.listingPrint.headers["content-type"] !== "text/html; charset=utf-8" ||
    !smoke.listingPrint.body.includes("data-kind=\"listing-print\"") ||
    !smoke.listingPrint.body.includes("data-print-status=\"browser-pdf-ready\"") ||
    /href="tel:(?!\+359879696870")/.test(smoke.listingPrint.body)
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
  if (smoke.sellerPage?.status !== 200 || !sellerLeadUiValid || smoke.sellerPage.body.dir !== "rtl") {
    throw new Error("HTTP smoke seller valuation page must match durable lead-store readiness");
  }
  if (
    smoke.sellerHtml?.status !== 200 ||
    (sellerLeadUiDisabled
      ? !smoke.sellerHtml.body.includes("data-form-unavailable=\"true\"") ||
        smoke.sellerHtml.body.includes("data-lead-type=\"seller\"")
      : !smoke.sellerHtml.body.includes("data-lead-type=\"seller\""))
  ) {
    throw new Error("HTTP smoke rendered seller page must match durable lead-store readiness");
  }
  if (
    smoke.contactHtml?.status !== 200 ||
    !smoke.contactHtml.body.includes("data-kind=\"contact\"") ||
    (contactLeadUiDisabled
      ? !smoke.contactHtml.body.includes("data-form-unavailable=\"true\"") ||
        smoke.contactHtml.body.includes("data-lead-type=\"general\"")
      : !smoke.contactHtml.body.includes("data-lead-type=\"general\""))
  ) {
    throw new Error("HTTP smoke rendered contact page must match durable lead-store readiness");
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
