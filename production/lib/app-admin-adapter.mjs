import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { buildAgencyReviewQueue } from "./agency-review-queue.mjs";
import {
  assertAgentRealtyCaseConditionMutation,
  assertAgentRealtyCaseMutation,
  adminHomePath,
  bindAuthenticatedOperator,
  canAdminAccess,
  canAdminAccessWorkspace,
  canAdminMutate,
  requiredAdminCapability,
  resolveAdminPrincipal,
  withAuthenticatedAuditActor,
} from "./admin-auth.mjs";
import { renderOperatorConnectPage } from "./operator-connect.mjs";
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
  completeGoogleOAuth,
  completeViberConnection,
  completeWhatsAppEmbeddedSignup,
  googleAuthorizationUrl,
  providerConnectionAvailability,
  providerConnectionConfigFromEnv,
  readProviderConnections,
  readProviderCredentials,
  registerWhatsAppWebhook,
  registerViberWebhook,
  saveProviderConnection,
  syncViewingToGoogleCalendar,
} from "./provider-connections.mjs";
import { ProviderDeliveryError, deliverApprovedProviderMessage } from "./provider-delivery.mjs";
import { DEFAULT_AUDIT_LOG_PATH, appendAuditLog, createAuditLogEntry, readAuditLog } from "./audit-log.mjs";
import { importAppSeoEvidenceRows, readAppSeoEvidence, readAppSeoEvidenceTemplate, seoEvidencePayload } from "./app-seo-evidence.mjs";
import { buildSeoEvidencePreflightReportFromEvidence } from "./seo-evidence-contract.mjs";
import {
  approveTranslationTask,
  createCrmInboxItem,
  createTranslationReviewTask,
  publishApprovedTranslation,
  renderAdminWorkspace,
} from "./admin-workflows.mjs";
import {
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
import {
  DEFAULT_DOCUMENT_CHECKLIST_LEDGER_PATH,
  appendDocumentChecklistOutcome,
  buildDocumentChecklistQueue,
  readDocumentChecklistOutcomes,
} from "./document-checklists.mjs";
import {
  DEFAULT_ACCOUNT_LEDGER_PATH,
  appendAccountContactLink,
  appendAccountCreation,
  deriveAccounts,
  readAccountLedger,
} from "./account-ledger.mjs";
import { buildContactRecords } from "./contact-records.mjs";
import { loadMigrationRecords } from "./content.mjs";
import { DEFAULT_BROKER_CONTACT_LEDGER_PATH, appendBrokerContact, createBrokerContact, readBrokerContacts } from "./broker-contacts.mjs";
import { DEFAULT_DEAL_LEDGER_PATH, appendClosedDeal, readDeals } from "./deal-ledger.mjs";
import { DEFAULT_EVENT_LEDGER_PATH, readEventLedger } from "./events.mjs";
import {
  EventStoreUnavailableError,
  eventDurableStoreConfigFromEnv,
  isEventDurableStoreEnabled,
  readEventsDurably,
} from "./event-durable-store.mjs";
import { renderHtmlPage } from "./html.mjs";
import { renderReactAdminBody } from "./react-admin-site.mjs";
import { DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH, readLanguageRequests } from "./language-requests.mjs";
import { renderLaunchInputChecklist } from "./launch-inputs.mjs";
import {
  buildLiveServicePreflightReport,
  buildLaunchReadinessReport,
  launchBlockerSummary,
  liveServiceImportSummary,
  liveServiceReports,
  payloadRuntimeState,
  readLiveServiceReportTemplate,
  writeLaunchReadinessReport,
  writeLiveServiceReport,
} from "./launch-readiness.mjs";
import { liveServiceProvisioningState, writeLiveServiceProvisioningReport } from "./live-service-provisioning.mjs";
import { monitoringRollbackState } from "./monitoring-rollback.mjs";
import {
  productionRecoveryState,
  readProductionRecoveryTemplate,
  writeProductionRecoveryReport,
} from "./production-recovery.mjs";
import { DEFAULT_LEAD_LEDGER_PATH, appendLead, readLeadLedger } from "./lead-ledger.mjs";
import { DEFAULT_LEAD_CONTACT_VAULT_PATH, appendLeadContact, withLeadContacts } from "./lead-contact-vault.mjs";
import {
  LeadStoreUnavailableError,
  isLeadDurableStoreEnabled,
  leadDurableStoreConfigFromEnv,
  readLeadIntakesDurably,
} from "./lead-durable-store.mjs";
import { normalizeBrokerLeadInput } from "./leads.mjs";
import {
  projectListingDraftSeed,
  saveBulkListingStatusDrafts,
  saveListingDraft,
} from "./listing-draft-service.mjs";
import {
  DEFAULT_CONSENT_LEDGER_PATH,
  appendConsentRecord,
  createConsentRecord,
  createConsentWithdrawal,
  latestConsentStates,
  readConsentLedger,
} from "./consent-ledger.mjs";
import {
  DEFAULT_LEAD_ASSIGNMENT_LEDGER_PATH,
  appendLeadAssignment,
  applyLeadAssignments,
  createLeadAssignment,
  readLeadAssignments,
} from "./lead-assignments.mjs";
import { buildLeadMatchingReport } from "./lead-matching.mjs";
import {
  DEFAULT_LEAD_PIPELINE_OUTCOME_LEDGER_PATH,
  appendLeadPipelineOutcome,
  buildLeadPipelineQueue,
  readLeadPipelineOutcomes,
} from "./lead-pipeline-outcomes.mjs";
import { DEFAULT_REPLY_OUTBOX_PATH, appendReviewedReply, createHermesReplyDraft, readReplyOutbox } from "./lead-replies.mjs";
import { buildCommunicationThreads, communicationTemplatesForLead } from "./communication-threads.mjs";
import {
  DEFAULT_REPLY_DELIVERY_OUTCOME_LEDGER_PATH,
  appendReplyDeliveryOutcome,
  buildReplyDeliveryQueue,
  readReplyDeliveryOutcomes,
} from "./reply-delivery-outcomes.mjs";
import {
  DEFAULT_LISTING_EDIT_LEDGER_PATH,
  appendListingEdit,
  applyListingEdits,
  createBulkListingStatusEdits,
  createListingEdit,
  readListingEdits,
} from "./listing-edits.mjs";
import {
  DEFAULT_MEDIA_REVIEW_LEDGER_PATH,
  appendMediaReview,
  applyMediaReviews,
  createMediaReview,
  readMediaReviews,
} from "./media-reviews.mjs";
import {
  DEFAULT_LISTING_PUBLICATION_SCHEDULE_PATH,
  appendListingPublicationSchedule,
  buildListingPublicationScheduleQueue,
  cancelListingPublicationSchedule,
  executeDueListingPublicationSchedules,
  listingPublicationExecutionAuditRecords,
  readListingPublicationSchedules,
} from "./listing-publication-schedules.mjs";
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
import { addLocaleToRegistry, loadLocaleRegistry, requiredAdminLocales, requiredPublicLocales, websiteLanguageCoverage, writeLocaleRegistry } from "./locales.mjs";
import { loadCmsCollections } from "./cms-seed.mjs";
import { loadPayloadCollections } from "./payload-collections.mjs";
import { payloadRuntimeImportSummary, writePayloadRuntimeReport } from "./payload-runtime.mjs";
import { payloadRuntimeBootstrapPayload } from "./payload-runtime-bootstrap.mjs";
import { buildOperationsReport, renderOperationsReportCsv } from "./operations-report.mjs";
import {
  DEFAULT_REALTY_CASE_LEDGER_PATH,
  appendRealtyCaseAction,
  buildRealtyCaseQueue,
  openRealtyCase,
  readRealtyCaseEvents,
} from "./realty-cases.mjs";
import {
  DEFAULT_REALTY_CASE_CONDITION_LEDGER_PATH,
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
  realtyCaseRequestProjectionConfigFromEnv,
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
  realtyCasePayloadAuthorityConfigFromEnv,
  realtyCasePayloadAuthorityFailure,
} from "./realty-case-payload-authority.mjs";
import { DEFAULT_PUBLIC_CONTACT_VAULT_PATH, readPublicContacts } from "./public-contact-vault.mjs";
import {
  DEFAULT_PUBLIC_REQUEST_OUTCOME_LEDGER_PATH,
  appendPublicRequestOutcome,
  buildPublicRequestQueue,
  readPublicRequestOutcomes,
} from "./public-request-outcomes.mjs";
import { loadCmsSeed } from "./runtime.mjs";
import { summarizeLegacyRouteMap } from "./migration.mjs";
import { attachMigrationReviewEvidence, filterMigrationReviewRoutes, migrationReviewTargetOptions } from "./migration-review.mjs";
import { fromRoot } from "./paths.mjs";
import {
  DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT,
  DEFAULT_REDIRECT_APPROVALS_PATH,
  appendRedirectApproval,
  buildDeployableRedirects,
  buildLegacyRouteDecisions,
  buildPendingRedirectApprovalWorkbook,
  buildRedirectApprovalWorkbook,
  importRedirectApprovalsCsv,
  readRedirectApprovals,
  renderRedirectApprovalWorkbook,
  summarizeDeployableRedirects,
  summarizeLegacyRouteDecisions,
  writeDeployableRedirects,
} from "./redirect-approvals.mjs";
import { DEFAULT_SAVED_SEARCH_LEDGER_PATH, readSavedSearches } from "./saved-searches.mjs";
import { buildSearchAnalyticsReport } from "./search-analytics.mjs";
import { DEFAULT_SELLER_PIPELINE_PATH, appendSellerPipeline, createSellerPipelineItem, readSellerPipeline } from "./seller-pipeline.mjs";
import {
  DEFAULT_SELLER_PIPELINE_OUTCOME_LEDGER_PATH,
  appendSellerPipelineOutcome,
  buildSellerPipelineQueue,
  readSellerPipelineOutcomes,
} from "./seller-pipeline-outcomes.mjs";
import { DEFAULT_SLUG_HISTORY_PATH, appendSlugChange } from "./slug-history.mjs";
import {
  DEFAULT_TOUR_APPROVAL_LEDGER_PATH,
  appendTourApproval,
  createTourApproval,
  readTourApprovals,
} from "./tours.mjs";
import { crossOriginWriteRejection } from "./request-guard.mjs";
import { buildTranslationCoverageReport } from "./translation-coverage.mjs";
import {
  DEFAULT_TRANSLATION_LEDGER_PATH,
  appendTranslationTask,
  latestTranslationTasks,
  readTranslationLedger,
} from "./translation-ledger.mjs";
import { DEFAULT_VIEWING_LEDGER_PATH, appendViewing, createViewing, readViewings, renderViewingCalendar } from "./viewing-ledger.mjs";
import {
  ViewingConflictError,
  ViewingStoreUnavailableError,
  isViewingDurableStoreEnabled,
  persistViewingDurably,
  readViewingsDurably,
  recordViewingCalendarSync,
  viewingDurableStoreConfigFromEnv,
} from "./viewing-durable-store.mjs";
import {
  DEFAULT_VIEWING_FOLLOW_UP_LEDGER_PATH,
  appendViewingFollowUp,
  buildViewingFollowUpQueue,
  readViewingFollowUps,
} from "./viewing-follow-ups.mjs";

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
const FILE_BACKED_LEAD_MUTATION_PATHS = new Set([
  "/api/admin/replies",
  "/api/admin/replies/delivery",
  "/api/admin/lead-pipeline/outcome",
  "/api/admin/leads",
  "/api/admin/leads/assign",
  "/api/admin/accounts",
  "/api/admin/accounts/link",
  "/api/admin/documents/outcome",
  "/api/admin/consents/withdraw",
  "/api/admin/replies/draft",
  "/api/admin/viewings",
  "/api/admin/viewings/follow-up",
  "/api/admin/seller-pipeline/outcome",
  "/api/admin/deals/close",
]);

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
    auditLogPath: env.MS_REALTY_AUDIT_LOG_PATH || DEFAULT_AUDIT_LOG_PATH,
    accountLedgerPath: env.MS_REALTY_ACCOUNT_LEDGER_PATH || DEFAULT_ACCOUNT_LEDGER_PATH,
    brokerContactLedgerPath: env.MS_REALTY_BROKER_CONTACT_LEDGER_PATH || DEFAULT_BROKER_CONTACT_LEDGER_PATH,
    consentLedgerPath: env.MS_REALTY_CONSENT_LEDGER_PATH || DEFAULT_CONSENT_LEDGER_PATH,
    dealLedgerPath: env.MS_REALTY_DEAL_LEDGER_PATH || DEFAULT_DEAL_LEDGER_PATH,
    realtyCaseLedgerPath: env.MS_REALTY_CASE_LEDGER_PATH || DEFAULT_REALTY_CASE_LEDGER_PATH,
    realtyCaseConditionLedgerPath:
      env.MS_REALTY_CASE_CONDITION_LEDGER_PATH || DEFAULT_REALTY_CASE_CONDITION_LEDGER_PATH,
    ...realtyCaseRequestProjectionConfigFromEnv(env),
    ...realtyCasePayloadAuthorityConfigFromEnv(env),
    documentChecklistLedgerPath:
      env.MS_REALTY_DOCUMENT_CHECKLIST_LEDGER_PATH || DEFAULT_DOCUMENT_CHECKLIST_LEDGER_PATH,
    eventLedgerPath: env.MS_REALTY_EVENT_LEDGER_PATH || DEFAULT_EVENT_LEDGER_PATH,
    eventDurableStore: eventDurableStoreConfigFromEnv(env),
    deployableRedirectOutputPath: env.MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH || DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT,
    languageRequestPath: env.MS_REALTY_LANGUAGE_REQUEST_LEDGER_PATH || DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH,
    launchReadinessOutputPath: env.MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH,
    leadLedgerPath: env.MS_REALTY_LEAD_LEDGER_PATH || DEFAULT_LEAD_LEDGER_PATH,
    leadAssignmentLedgerPath: env.MS_REALTY_LEAD_ASSIGNMENT_LEDGER_PATH || DEFAULT_LEAD_ASSIGNMENT_LEDGER_PATH,
    leadPipelineOutcomeLedgerPath:
      env.MS_REALTY_LEAD_PIPELINE_OUTCOME_LEDGER_PATH || DEFAULT_LEAD_PIPELINE_OUTCOME_LEDGER_PATH,
    leadContactVaultPath:
      env.MS_REALTY_LEAD_CONTACT_VAULT_PATH || (env.NODE_ENV === "production" ? DEFAULT_LEAD_CONTACT_VAULT_PATH : null),
    leadContactKey: env.MS_REALTY_LEAD_CONTACT_KEY,
    leadDurableStore: leadDurableStoreConfigFromEnv(env),
    publicContactVaultPath:
      env.MS_REALTY_PUBLIC_CONTACT_VAULT_PATH || (env.NODE_ENV === "production" ? DEFAULT_PUBLIC_CONTACT_VAULT_PATH : null),
    publicContactKey: env.MS_REALTY_PUBLIC_CONTACT_KEY || env.MS_REALTY_LEAD_CONTACT_KEY,
    publicRequestOutcomeLedgerPath:
      env.MS_REALTY_PUBLIC_REQUEST_OUTCOME_LEDGER_PATH || DEFAULT_PUBLIC_REQUEST_OUTCOME_LEDGER_PATH,
    listingQualityReviewPath: env.MS_REALTY_LISTING_QUALITY_REVIEW_PATH,
    searchSyncReportPath: env.MS_REALTY_SEARCH_SYNC_REPORT_PATH,
    searchQueryReportPath: env.MS_REALTY_SEARCH_QUERY_REPORT_PATH,
    hermesWorkerReportPath: env.MS_REALTY_HERMES_WORKER_REPORT_PATH,
    liveServiceProvisioningReportPath: env.MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH,
    monitoringRollbackReportPath: env.MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH,
    payloadRuntimeReportPath: env.MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH,
    productionRecoveryReportPath: env.MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH,
    localeRegistryPath: env.MS_REALTY_LOCALE_REGISTRY_PATH,
    listingEditLedgerPath: env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || DEFAULT_LISTING_EDIT_LEDGER_PATH,
    mediaReviewLedgerPath: env.MS_REALTY_MEDIA_REVIEW_LEDGER_PATH || DEFAULT_MEDIA_REVIEW_LEDGER_PATH,
    listingPublicationSchedulePath:
      env.MS_REALTY_LISTING_PUBLICATION_SCHEDULE_PATH || DEFAULT_LISTING_PUBLICATION_SCHEDULE_PATH,
    redirectApprovalPath: env.MS_REALTY_REDIRECT_APPROVALS_PATH || DEFAULT_REDIRECT_APPROVALS_PATH,
    replyOutboxPath: env.MS_REALTY_REPLY_OUTBOX_PATH || DEFAULT_REPLY_OUTBOX_PATH,
    replyDeliveryOutcomeLedgerPath:
      env.MS_REALTY_REPLY_DELIVERY_OUTCOME_LEDGER_PATH || DEFAULT_REPLY_DELIVERY_OUTCOME_LEDGER_PATH,
    savedSearchLedgerPath: env.MS_REALTY_SAVED_SEARCH_LEDGER_PATH || DEFAULT_SAVED_SEARCH_LEDGER_PATH,
    sellerPipelinePath: env.MS_REALTY_SELLER_PIPELINE_PATH || DEFAULT_SELLER_PIPELINE_PATH,
    sellerPipelineOutcomeLedgerPath:
      env.MS_REALTY_SELLER_PIPELINE_OUTCOME_PATH ||
      env.MS_REALTY_SELLER_PIPELINE_OUTCOME_LEDGER_PATH ||
      DEFAULT_SELLER_PIPELINE_OUTCOME_LEDGER_PATH,
    seoEvidenceInputDir: env.MS_REALTY_SEO_EVIDENCE_INPUT_DIR,
    seoEvidenceOutputPath: env.MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH,
    slugHistoryPath: env.MS_REALTY_SLUG_HISTORY_PATH || DEFAULT_SLUG_HISTORY_PATH,
    tourApprovalLedgerPath: env.MS_REALTY_TOUR_APPROVAL_LEDGER_PATH || DEFAULT_TOUR_APPROVAL_LEDGER_PATH,
    translationLedgerPath: env.MS_REALTY_TRANSLATION_LEDGER_PATH || DEFAULT_TRANSLATION_LEDGER_PATH,
    viewingLedgerPath: env.MS_REALTY_VIEWING_LEDGER_PATH || DEFAULT_VIEWING_LEDGER_PATH,
    viewingDurableStore: viewingDurableStoreConfigFromEnv(env),
    viewingFollowUpLedgerPath: env.MS_REALTY_VIEWING_FOLLOW_UP_LEDGER_PATH || DEFAULT_VIEWING_FOLLOW_UP_LEDGER_PATH,
    bookedAt: env.MS_REALTY_BOOKED_AT,
    viewingFollowUpAt: env.MS_REALTY_VIEWING_FOLLOW_UP_AT,
    sellerPipelineOutcomeAt: env.MS_REALTY_SELLER_PIPELINE_OUTCOME_AT,
    dealClosedAt: env.MS_REALTY_DEAL_CLOSED_AT,
    realtyCaseRecordedAt: env.MS_REALTY_CASE_RECORDED_AT,
    editedAt: env.MS_REALTY_EDITED_AT,
    reviewedAt: env.MS_REALTY_REVIEWED_AT,
    publicRequestOutcomeAt: env.MS_REALTY_PUBLIC_REQUEST_OUTCOME_AT,
    leadPipelineOutcomeAt: env.MS_REALTY_LEAD_PIPELINE_OUTCOME_AT,
    replyDeliveredAt: env.MS_REALTY_REPLY_DELIVERED_AT,
    listingPublicationAt: env.MS_REALTY_LISTING_PUBLICATION_AT,
    payloadAdminAuth: getPayloadAdminAuthService,
    providerConnection: providerConnectionConfigFromEnv(env),
  };
}

function adminUnauthorized() {
  return new Response(JSON.stringify({ kind: "unauthorized" }), {
    status: 401,
    headers: { ...PRIVATE_JSON_HEADERS, "www-authenticate": 'Bearer realm="ms-realty-admin"' },
  });
}

function adminOperatorIdentityRequired() {
  return new Response(JSON.stringify({ kind: "operator_identity_required" }), {
    status: 403,
    headers: PRIVATE_JSON_HEADERS,
  });
}

function adminForbidden(capability) {
  return new Response(JSON.stringify({ kind: "forbidden", required_capability: capability }), {
    status: 403,
    headers: PRIVATE_JSON_HEADERS,
  });
}

function adminBadRequest(error) {
  return new Response(JSON.stringify({ kind: "bad_request", message: error.message }), {
    status: 400,
    headers: PRIVATE_JSON_HEADERS,
  });
}

function leadStoreUnavailable(kind = "lead_store_unavailable") {
  return jsonResponse(503, {
    kind,
    message:
      kind === "lead_store_read_only"
        ? "This lead operation is disabled until it has durable persistence."
        : "The durable lead store is unavailable.",
  });
}

function htmlResponse(payload) {
  return new Response(renderHtmlPage(payload, { bodyHtml: renderReactAdminBody(payload) }), {
    status: payload.status || 200,
    headers: PRIVATE_HTML_HEADERS,
  });
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: PRIVATE_JSON_HEADERS });
}

async function configuredPayloadAdminAuth(config) {
  const configured = config.payloadAdminAuth;
  if (!configured) return null;
  return typeof configured === "function" ? configured() : configured;
}

function listingEditorPath(listingId) {
  const id = typeof listingId === "string" ? listingId.trim() : "";
  if (!id) throw new Error("Known listingId is required");
  return `/admin/listings/edit?listingId=${encodeURIComponent(id)}`;
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
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const output = {};
    for (const [key, value] of new URLSearchParams(body)) {
      output[key] = key in output ? (Array.isArray(output[key]) ? [...output[key], value] : [output[key], value]) : value;
    }
    return output;
  }
  return parseJsonBody(body);
}

function csvInput(request, body) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) return parseBody(request, body).csv || "";
  return body || "";
}

function listingQualityReviewInput(request, body) {
  if ((request.headers.get("content-type") || "").includes("application/json")) {
    return { csv: renderListingQualityReviewSubmission(parseJsonBody(body)), source: "listing_quality_workbench" };
  }
  return { csv: csvInput(request, body), source: "listing_quality_csv" };
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
  return { source: url.searchParams.get("source") || input.source, report: reportJsonInput(input) };
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

function reviewedReplyInput(input) {
  return {
    ...input,
    approved: input.approved === true || input.approved === "true" || input.approved === "on" || input.approved === "1",
  };
}

function translationDraftInput(input) {
  if (input.sourceContent || input.draftOutput) return input;
  const propertyFacts = input.propertyFactsJson ? JSON.parse(input.propertyFactsJson) : {};
  return {
    ...input,
    sourceContent: {
      title: input.sourceTitle,
      description: input.sourceDescription,
    },
    propertyFacts,
    draftOutput: {
      title: input.translatedTitle,
      body: input.translatedBody,
      seo_title: input.translatedSeoTitle || input.translatedTitle,
      meta_description: input.translatedMetaDescription,
      citations: [{ source: "cms", field: "source_snapshot" }],
    },
  };
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
    output.evidenceRefs = [
      {
        ref: output.evidenceRef || output.evidence_ref,
        type: output.evidenceType || output.evidence_type,
        producerKind: output.evidenceProducerKind || output.evidence_producer_kind,
        issuedAt: output.evidenceIssuedAt || output.evidence_issued_at || null,
        digest: output.evidenceDigest || output.evidence_digest || null,
      },
    ];
  }
  return output;
}

function jsonArrayInput(value, label) {
  if (typeof value !== "string") throw new Error(`${label} must be a JSON array`);
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array`);
  return parsed;
}

function realtyCaseConditionInput(input) {
  const output = { ...(input || {}) };
  const jsonFields = [
    {
      camel: "requiredEvidenceProducerRefsJson",
      snake: "required_evidence_producer_refs_json",
      target: "requiredEvidenceProducerRefs",
      alternate: "required_evidence_producer_refs",
      label: "Condition required evidence producer refs",
    },
    {
      camel: "evidenceRefsJson",
      snake: "evidence_refs_json",
      target: "evidenceRefs",
      alternate: "evidence_refs",
      label: "Condition evidence refs",
    },
  ];
  for (const field of jsonFields) {
    const value = output[field.camel] ?? output[field.snake];
    delete output[field.camel];
    delete output[field.snake];
    if (output[field.target] === undefined && output[field.alternate] === undefined && value !== undefined) {
      output[field.target] = jsonArrayInput(value, field.label);
    }
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
  const prepared = { ...realtyCaseConditionInput(input), executorKind: expectedKind };
  assertAgentRealtyCaseConditionMutation(principal, { ...prepared, action });
  return bindAuthenticatedOperator(prepared, principal);
}

function currentSeed(config) {
  return applyMediaReviews(
    applyListingEdits(loadCmsSeed(), readListingEdits(config.listingEditLedgerPath)),
    readMediaReviews(config.mediaReviewLedgerPath),
  );
}

function leadJourneyContext(config) {
  return {
    leads: applyLeadAssignments(readLeadLedger(config.leadLedgerPath), readLeadAssignments(config.leadAssignmentLedgerPath)),
    outcomes: readLeadPipelineOutcomes(config.leadPipelineOutcomeLedgerPath),
    viewings: readViewings(config.viewingLedgerPath),
    viewingFollowUps: readViewingFollowUps(config.viewingFollowUpLedgerPath),
    deals: readDeals(config.dealLedgerPath),
    sellerPipelines: readSellerPipeline(config.sellerPipelinePath),
    sellerPipelineOutcomes: readSellerPipelineOutcomes(config.sellerPipelineOutcomeLedgerPath),
  };
}

function currentListingQualityReport(config, options = {}) {
  return buildListingQualityReport({
    seed: currentSeed(config),
    tourApprovals: readTourApprovals(config.tourApprovalLedgerPath),
    ...options,
  });
}

function currentListingQualityReviewQueue(config, options = {}) {
  const report = currentListingQualityReport(config, options);
  const reviewPath = config.listingQualityReviewPath || DEFAULT_LISTING_QUALITY_REVIEW_INPUT;
  const reviewCsv = fs.existsSync(reviewPath) ? fs.readFileSync(reviewPath, "utf8") : "";
  const reviewQueue = buildListingQualityReviewQueue(report, { reviewCsv, limit: 20 });
  return { ...report, rows: reviewQueue.rows, review_queue: reviewQueue };
}

function auditRecordedAt(config) {
  return config.reviewedAt || config.editedAt || config.bookedAt || config.dealClosedAt || new Date().toISOString();
}

function recordAudit(input, config, recordedAt = auditRecordedAt(config)) {
  return appendAuditLog(createAuditLogEntry(withAuthenticatedAuditActor(input, config.adminPrincipal), recordedAt), {
    filePath: config.auditLogPath,
  });
}

function recordProviderConnectionFailure(provider, phase, error, config) {
  recordAudit(
    {
      action: "provider_connection_failed",
      actor: config.adminPrincipal?.id,
      objectType: "provider_connection",
      objectId: String(provider || "unknown"),
      metadata: {
        phase: String(phase || "unknown"),
        error_code: String(error?.code || error?.name || "provider_rejected").slice(0, 80),
      },
    },
    config,
  );
}

function recordAuditReplica(input, config, recordedAt, alreadyRecorded, bestEffort) {
  try {
    if (!readAuditLog(config.auditLogPath).some(alreadyRecorded)) recordAudit(input, config, recordedAt);
    return false;
  } catch (error) {
    if (bestEffort) return true;
    throw error;
  }
}

function publicRequestContactData(config) {
  if (!config.publicContactVaultPath) {
    return { contactMaps: {}, contactVaultStatus: "not_configured" };
  }
  try {
    const contactMaps = {
      saved_search: readPublicContacts(config.publicContactVaultPath, config.publicContactKey, "saved_search"),
      language_request: readPublicContacts(config.publicContactVaultPath, config.publicContactKey, "language_request"),
    };
    const count = [...contactMaps.saved_search.values(), ...contactMaps.language_request.values()].length;
    return { contactMaps, contactVaultStatus: count ? "available" : "empty" };
  } catch {
    return { contactMaps: {}, contactVaultStatus: "locked" };
  }
}

function currentPublicRequestQueue(config) {
  return buildPublicRequestQueue({
    savedSearches: readSavedSearches(config.savedSearchLedgerPath),
    languageRequests: readLanguageRequests(config.languageRequestPath),
    outcomes: readPublicRequestOutcomes(config.publicRequestOutcomeLedgerPath),
    ...publicRequestContactData(config),
    now: config.publicRequestOutcomeAt || config.reviewedAt || new Date().toISOString(),
  });
}

async function adminLeadSource(config) {
  const durableStore = config.leadDurableStore || {};
  if (!durableStore.leadDurableStoreEnabled) {
    return {
      durable: false,
      leads: withLeadContacts(readLeadLedger(config.leadLedgerPath), {
        filePath: config.leadContactVaultPath,
        secret: config.leadContactKey,
      }),
    };
  }
  if (!isLeadDurableStoreEnabled(durableStore)) {
    throw new LeadStoreUnavailableError("Durable lead store is enabled but not fully configured");
  }
  try {
    const leads = await (config.readLeadIntakesDurably || readLeadIntakesDurably)({
      contactSecret: durableStore.contactSecret,
      payload: config.leadDurablePayload || null,
    });
    if (!Array.isArray(leads) || leads.some((lead) => !lead?.lead_id)) {
      throw new Error("Durable lead readback returned invalid rows");
    }
    return { durable: true, leads };
  } catch (error) {
    if (error instanceof LeadStoreUnavailableError) throw error;
    throw new LeadStoreUnavailableError("Durable lead store read failed", error);
  }
}

async function adminEventSource(config) {
  const durableStore = config.eventDurableStore || {};
  if (!durableStore.eventDurableStoreEnabled) return readEventLedger(config.eventLedgerPath);
  if (!isEventDurableStoreEnabled(durableStore)) {
    throw new EventStoreUnavailableError("Durable funnel event store is enabled but not fully configured");
  }
  try {
    const events = await (config.readEventsDurably || readEventsDurably)({ payload: config.eventDurablePayload || null });
    if (!Array.isArray(events)) throw new Error("Durable funnel event readback returned invalid rows");
    return events;
  } catch (error) {
    if (error instanceof EventStoreUnavailableError) throw error;
    throw new EventStoreUnavailableError("Durable funnel event read failed", error);
  }
}

async function adminViewingSource(config) {
  const durableStore = config.viewingDurableStore || {};
  if (!durableStore.viewingDurableStoreEnabled) {
    return { durable: false, viewings: readViewings(config.viewingLedgerPath) };
  }
  if (!isViewingDurableStoreEnabled(durableStore)) {
    throw new ViewingStoreUnavailableError("Durable viewing store is enabled but not fully configured");
  }
  const viewings = await (config.readViewingsDurably || readViewingsDurably)({
    payload: config.viewingDurablePayload || null,
  });
  if (!Array.isArray(viewings)) throw new ViewingStoreUnavailableError("Durable viewing readback returned invalid rows");
  return { durable: true, viewings };
}

function rowsForLeadIds(rows, leadIds) {
  return rows.filter((row) => leadIds.has(row.lead_id));
}

function leadScopedRows(source) {
  if (!source.durable) return (rows) => rows;
  const leadIds = new Set(source.leads.map((lead) => lead.lead_id));
  return (rows) => rowsForLeadIds(rows, leadIds);
}

async function leadInboxPayload(registry, url, config) {
  const source = await adminLeadSource(config);
  const filterRows = leadScopedRows(source);
  const leads = applyLeadAssignments(source.leads, filterRows(readLeadAssignments(config.leadAssignmentLedgerPath)));
  const replies = filterRows(readReplyOutbox(config.replyOutboxPath));
  const replyDeliveryOutcomes = filterRows(readReplyDeliveryOutcomes(config.replyDeliveryOutcomeLedgerPath));
  const viewingSource = await adminViewingSource(config);
  const viewings = filterRows(viewingSource.viewings);
  const viewingFollowUps = filterRows(readViewingFollowUps(config.viewingFollowUpLedgerPath));
  const deals = filterRows(readDeals(config.dealLedgerPath));
  const sellerPipeline = filterRows(readSellerPipeline(config.sellerPipelinePath));
  const sellerPipelineOutcomes = filterRows(readSellerPipelineOutcomes(config.sellerPipelineOutcomeLedgerPath));
  let providerConnections = {};
  const providerConfig = config.providerConnection || providerConnectionConfigFromEnv(config.authEnv || process.env);
  const providerAvailability = providerConnectionAvailability(providerConfig);
  if (providerAvailability.store.ready) {
    try {
      const connections = await (config.readProviderConnections || readProviderConnections)({
        payload: config.providerConnectionPayload || null,
      });
      providerConnections = Object.fromEntries(
        connections.map((connection) => [
          connection.provider,
          {
            connected: connection.status === "connected",
            status: connection.status,
            account_label: connection.account_label || "",
          },
        ]),
      );
    } catch {
      providerConnections = {};
    }
  }
  const leadPipelineQueue = buildLeadPipelineQueue(
    {
      leads,
      outcomes: filterRows(readLeadPipelineOutcomes(config.leadPipelineOutcomeLedgerPath)),
      viewings,
      viewingFollowUps,
      deals,
    },
    { now: config.leadPipelineOutcomeAt || config.reviewedAt || config.bookedAt || new Date().toISOString() },
  );
  return renderAdminLeadsPayload(registry, url.searchParams.get("locale") || "en", {
    leads,
    leadPipelineQueue,
    leadMatching: buildLeadMatchingReport({
      registry,
      seed: currentSeed(config),
      leads,
      leadPipelineStates: leadPipelineQueue.states,
      generatedAt: config.reviewedAt || config.leadPipelineOutcomeAt || new Date().toISOString(),
    }),
    replies,
    replyDeliveryQueue: buildReplyDeliveryQueue(replies, replyDeliveryOutcomes),
    communicationThreads: buildCommunicationThreads({ leads, replies, outcomes: replyDeliveryOutcomes }),
    communicationTemplates: Object.fromEntries(
      leads.map((lead) => [lead.lead_id, communicationTemplatesForLead(lead)]),
    ),
    languageRequests: readLanguageRequests(config.languageRequestPath),
    translationTasks: latestTranslationTasks(readTranslationLedger(config.translationLedgerPath)),
    listingEdits: readListingEdits(config.listingEditLedgerPath),
    leadSlaGeneratedAt: config.reviewedAt,
    operatorId: config.adminPrincipal || null,
    leadSourceDurable: source.durable,
    providerConnections,
    viewings,
    viewingFollowUpWritable: !viewingSource.durable,
    viewingFollowUpQueue: buildViewingFollowUpQueue(viewings, viewingFollowUps, {
      now: config.viewingFollowUpAt || config.bookedAt || config.reviewedAt || new Date().toISOString(),
    }),
    savedSearches: readSavedSearches(config.savedSearchLedgerPath),
    publicRequestQueue: currentPublicRequestQueue(config),
    sellerPipeline,
    sellerPipelineQueue: buildSellerPipelineQueue(sellerPipeline, sellerPipelineOutcomes, {
      now: config.sellerPipelineOutcomeAt || config.reviewedAt || config.bookedAt || new Date().toISOString(),
    }),
    deals,
    brokerContacts: readBrokerContacts(config.brokerContactLedgerPath),
  });
}

async function contactWorkspaceData(config) {
  const source = await adminLeadSource(config);
  const filterRows = leadScopedRows(source);
  const leads = applyLeadAssignments(
    source.leads,
    filterRows(readLeadAssignments(config.leadAssignmentLedgerPath)),
  );
  const replies = filterRows(readReplyOutbox(config.replyOutboxPath));
  const outcomes = filterRows(readReplyDeliveryOutcomes(config.replyDeliveryOutcomeLedgerPath));
  const communicationThreads = buildCommunicationThreads({ leads, replies, outcomes });
  const allAccounts = deriveAccounts(readAccountLedger(config.accountLedgerPath));
  const contactIds = new Set(buildContactRecords({ leads, communicationThreads }).map((contact) => contact.id));
  const accounts = source.durable
    ? allAccounts.flatMap((account) => {
        const contactIdsForAccount = account.contact_ids.filter((contactId) => contactIds.has(contactId));
        if (!contactIdsForAccount.length) return [];
        return [
          {
            ...account,
            contact_ids: contactIdsForAccount,
            contact_count: contactIdsForAccount.length,
            events: account.events.filter(
              (event) => event.action === "account_created" || contactIdsForAccount.includes(event.contact_id),
            ),
          },
        ];
      })
    : allAccounts;
  return {
    leads,
    communicationThreads,
    accounts,
    contacts: buildContactRecords({ leads, communicationThreads, accounts }),
  };
}

async function contactsPayload(registry, url, config) {
  const data = await contactWorkspaceData(config);
  return renderAdminContactsPayload(registry, url.searchParams.get("locale") || "en", {
    contacts: data.contacts,
    accounts: data.accounts,
    operatorId: config.adminPrincipal || null,
  });
}

async function documentChecklistPayload(registry, url, config) {
  const locale = url.searchParams.get("locale") || "en";
  const source = await adminLeadSource(config);
  const filterRows = leadScopedRows(source);
  const leads = applyLeadAssignments(source.leads, filterRows(readLeadAssignments(config.leadAssignmentLedgerPath)));
  return renderAdminDocumentChecklistPayload(
    registry,
    locale,
    buildDocumentChecklistQueue(leads, filterRows(readDocumentChecklistOutcomes(config.documentChecklistLedgerPath)), { locale }),
    config.adminPrincipal || null,
  );
}

function consentPayload(registry, url, config) {
  return renderAdminConsentPayload(
    registry,
    url.searchParams.get("locale") || "en",
    latestConsentStates(readConsentLedger(config.consentLedgerPath)),
    config.adminPrincipal || null,
  );
}

async function requestsPayload(registry, url, config) {
  return operationalQueuePayload(registry, url, config, {
    kind: "admin_requests",
    path: "/admin/requests",
    titleKey: "requestsWorkspace",
    descriptionKey: "requestsDescription",
  });
}

async function pipelinePayload(registry, url, config) {
  return operationalQueuePayload(registry, url, config, {
    kind: "admin_lead_pipeline",
    path: "/admin/pipeline",
    titleKey: "pipelineWorkspace",
    descriptionKey: "pipelineDescription",
  });
}

function realtyCasePayloadAuthorityActive(config) {
  return assertRealtyCasePayloadAuthorityConfig({
    realtyCasePayloadAuthorityEnabled: config.realtyCasePayloadAuthorityEnabled,
    realtyCaseRequestProjectionEnabled: config.realtyCaseRequestProjectionEnabled,
    realtyCaseWorkspaceId: config.realtyCaseWorkspaceId,
    realtyCasePayload: config.realtyCasePayload,
    realtyCasePayloadRuntimeConfigured: config.realtyCasePayloadRuntimeConfigured,
  });
}

async function currentRealtyCaseEvents(config) {
  return realtyCasePayloadAuthorityActive(config)
    ? readRealtyCaseEventsFromPayload({ payload: config.realtyCasePayload, workspaceId: config.realtyCaseWorkspaceId })
    : readRealtyCaseEvents(config.realtyCaseLedgerPath);
}

async function currentRealtyCaseConditionEvents(config) {
  return realtyCasePayloadAuthorityActive(config)
    ? readRealtyCaseConditionEventsFromPayload({ payload: config.realtyCasePayload, workspaceId: config.realtyCaseWorkspaceId })
    : readRealtyCaseConditionEvents(config.realtyCaseConditionLedgerPath);
}

async function realtyCasesPayload(registry, url, config) {
  const now = config.realtyCaseRecordedAt || config.reviewedAt || new Date().toISOString();
  const [caseEvents, conditionEvents] = await Promise.all([
    currentRealtyCaseEvents(config),
    currentRealtyCaseConditionEvents(config),
  ]);
  return {
    ...renderAdminRealtyCasesPayload(
      registry,
      url.searchParams.get("locale") || "en",
      buildRealtyCaseQueue(caseEvents, {
        now,
      }),
      config.adminPrincipal || null,
    ),
    realtyCaseConditionQueue: buildRealtyCaseConditionQueue(conditionEvents, {
      now,
    }),
  };
}

async function realtyCaseIntentsPayload(config) {
  return buildAutonomousRealtyCaseIntents(await currentRealtyCaseEvents(config), {
    now: config.realtyCaseRecordedAt || config.reviewedAt || new Date().toISOString(),
  });
}

async function realtyCaseConditionQueue(config) {
  return buildRealtyCaseConditionQueue(await currentRealtyCaseConditionEvents(config), {
    now: config.realtyCaseRecordedAt || config.reviewedAt || new Date().toISOString(),
  });
}

async function operationalQueuePayload(registry, url, config, { kind, path, titleKey, descriptionKey }) {
  return renderAdminOperationalQueuePayload(await leadInboxPayload(registry, url, config), {
    kind,
    path,
    titleKey,
    descriptionKey,
  });
}

async function todayPayload(registry, url, config) {
  return operationalQueuePayload(registry, url, config, {
    kind: "admin_today",
    path: "/admin/today",
    titleKey: "today",
    descriptionKey: "todayDescription",
  });
}

async function viewingsPayload(registry, url, config) {
  return operationalQueuePayload(registry, url, config, {
    kind: "admin_viewings",
    path: "/admin/viewings",
    titleKey: "viewingsWorkspace",
    descriptionKey: "viewingsDescription",
  });
}

function activityPayload(registry, url, config) {
  return renderAdminActivityPayload(
    registry,
    url.searchParams.get("locale") || "en",
    readAuditLog(config.auditLogPath),
    config.adminPrincipal || null,
    {
      leadId: url.searchParams.get("leadId"),
      listingId: url.searchParams.get("listingId"),
      actor: url.searchParams.get("actor"),
      action: url.searchParams.get("action"),
      page: url.searchParams.get("page"),
    },
  );
}

async function operationsReport(registry, config) {
  const generatedAt = config.reviewedAt || config.editedAt || new Date().toISOString();
  const seed = currentSeed(config);
  const source = await adminLeadSource(config);
  const filterRows = leadScopedRows(source);
  const leads = source.leads;
  const replies = filterRows(readReplyOutbox(config.replyOutboxPath));
  const viewings = filterRows((await adminViewingSource(config)).viewings);
  const viewingFollowUps = filterRows(readViewingFollowUps(config.viewingFollowUpLedgerPath));
  const deals = filterRows(readDeals(config.dealLedgerPath));
  const translationTasks = readTranslationLedger(config.translationLedgerPath);
  const funnelEvents = await adminEventSource(config);
  return buildOperationsReport({
    leads,
    replies,
    replyDeliveryOutcomes: filterRows(readReplyDeliveryOutcomes(config.replyDeliveryOutcomeLedgerPath)),
    leadPipelineOutcomes: filterRows(readLeadPipelineOutcomes(config.leadPipelineOutcomeLedgerPath)),
    viewings,
    viewingFollowUps,
    deals,
    sellerPipelines: filterRows(readSellerPipeline(config.sellerPipelinePath)),
    sellerPipelineOutcomes: filterRows(readSellerPipelineOutcomes(config.sellerPipelineOutcomeLedgerPath)),
    savedSearches: readSavedSearches(config.savedSearchLedgerPath),
    languageRequests: readLanguageRequests(config.languageRequestPath),
    publicRequestOutcomes: readPublicRequestOutcomes(config.publicRequestOutcomeLedgerPath),
    translationTasks,
    seed,
    searchAnalytics: buildSearchAnalyticsReport({
      registry,
      seed,
      events: funnelEvents,
      generatedAt,
    }),
    funnelEvents,
    generatedAt,
  });
}

async function reportsPayload(registry, url, config) {
  return renderAdminOperationsReportPayload(
    registry,
    url.searchParams.get("locale") || "en",
    await operationsReport(registry, config),
    config.adminPrincipal || null,
  );
}

async function listingManagerPayload(registry, url, config) {
  const seed = await projectListingDraftSeed(currentSeed(config), {
    env: config.authEnv || process.env,
    payload: config.payloadListingRuntime || null,
  });
  const translationTasks = latestTranslationTasks(readTranslationLedger(config.translationLedgerPath));
  return renderAdminListingManagerPayload(registry, url.searchParams.get("locale") || "en", {
    seed,
    translationTasks,
    generatedAt: config.reviewedAt || new Date().toISOString(),
    operatorId: config.adminPrincipal || null,
    publicationScheduleQueue: buildListingPublicationScheduleQueue(
      readListingPublicationSchedules(config.listingPublicationSchedulePath),
      { now: config.listingPublicationAt || config.reviewedAt || new Date().toISOString() },
    ),
    query: url.searchParams.get("q") || "",
    status: url.searchParams.get("status") || "",
    sourceLocale: url.searchParams.get("sourceLocale") || "",
    page: url.searchParams.get("page") || 1,
  });
}

async function listingEditorPayload(registry, url, config) {
  const seed = await projectListingDraftSeed(currentSeed(config), {
    env: config.authEnv || process.env,
    payload: config.payloadListingRuntime || null,
  });
  return renderAdminListingEditorPayload(
    registry,
    url.searchParams.get("locale") || "en",
    seed,
    url.searchParams.get("listingId"),
    readListingEdits(config.listingEditLedgerPath),
    latestTranslationTasks(readTranslationLedger(config.translationLedgerPath)),
    readTourApprovals(config.tourApprovalLedgerPath),
    config.adminPrincipal || null,
  );
}

async function translationQueuePayload(registry, url, config) {
  const seed = await projectListingDraftSeed(currentSeed(config), {
    payload: config.payloadListingRuntime,
    env: process.env,
  });
  const tasks = latestTranslationTasks(readTranslationLedger(config.translationLedgerPath));
  return renderAdminTranslationQueuePayload(registry, url.searchParams.get("locale") || "en", {
    seed,
    translationTasks: tasks,
    generatedAt: config.reviewedAt || new Date().toISOString(),
    operatorId: config.adminPrincipal || null,
    query: url.searchParams.get("q") || "",
    targetLocale: url.searchParams.get("targetLocale") || "",
    taskType: url.searchParams.get("taskType") || "",
    page: url.searchParams.get("page") || 1,
  });
}

function readJsonData(filename) {
  return JSON.parse(fs.readFileSync(fromRoot("production", "data", filename), "utf8"));
}

function routeMapRows() {
  return readJsonData("legacy-route-map.json").routes;
}

function deployableRedirectArtifact(config = {}) {
  const filePath = config.deployableRedirectOutputPath || DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT;
  const sourcePath = fs.existsSync(/*turbopackIgnore: true*/ filePath) ? filePath : DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT;
  return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ sourcePath, "utf8"));
}

function deployableRedirects(config = {}) {
  return deployableRedirectArtifact(config).redirects || [];
}

function routeMapSummary(routes) {
  return { summary: summarizeLegacyRouteMap(routes), routes };
}

function currentLegacyRouteDecisions(config) {
  return buildLegacyRouteDecisions(routeMapRows(), readRedirectApprovals(config.redirectApprovalPath));
}

function currentDeployableArtifact(config) {
  const decisions = currentLegacyRouteDecisions(config);
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
}

function deployableRedirectsForLaunch(config) {
  const artifact = deployableRedirectArtifact(config);
  const redirects = artifact.redirects || [];
  const decisions = artifact.decisions || [];
  return {
    summary: artifact.summary || summarizeDeployableRedirects(redirects),
    decision_summary: artifact.decision_summary || summarizeLegacyRouteDecisions(decisions),
    redirects,
    decisions,
  };
}

function currentDeployableRedirects(config) {
  return buildDeployableRedirects(routeMapRows(), readRedirectApprovals(config.redirectApprovalPath));
}

function currentSeoEvidence(config) {
  return readAppSeoEvidence(config);
}

function launchReadiness(config) {
  return buildLaunchReadinessReport({
    generatedAt: config.reviewedAt || new Date().toISOString(),
    routeMap: routeMapSummary(routeMapRows()),
    deployableRedirects: deployableRedirectsForLaunch(config),
    listingQuality: currentListingQualityReport(config, { generatedAt: config.reviewedAt || new Date().toISOString() }),
    listingQualityReviewPath: config.listingQualityReviewPath || undefined,
    seoEvidence: currentSeoEvidence(config),
    liveServices: liveServiceReports({
      syncReportPath: config.searchSyncReportPath || undefined,
      queryReportPath: config.searchQueryReportPath || undefined,
      hermesReportPath: config.hermesWorkerReportPath || undefined,
    }),
    liveServiceProvisioning: liveServiceProvisioningState(config.liveServiceProvisioningReportPath || undefined),
    monitoringRollback: monitoringRollbackState(config.monitoringRollbackReportPath || undefined),
    payloadRuntime: payloadRuntimeState(config.payloadRuntimeReportPath || undefined),
    productionRecovery: productionRecoveryState(config.productionRecoveryReportPath || undefined),
  });
}

function launchInputChecklist(config) {
  const routes = routeMapRows();
  const artifact = deployableRedirectsForLaunch(config);
  const generatedAt = config.reviewedAt || new Date().toISOString();
  return renderLaunchInputChecklist({
    generatedAt,
    launchReadiness: launchReadiness(config),
    seoEvidence: currentSeoEvidence(config),
    redirectWorkbookCsv: renderRedirectApprovalWorkbook(
      buildRedirectApprovalWorkbook(attachMigrationReviewEvidence(routes, loadMigrationRecords())),
    ),
    deployableRedirects: artifact,
    routeMap: routeMapSummary(routes),
    liveServiceProvisioning: liveServiceProvisioningState(config.liveServiceProvisioningReportPath || undefined),
  });
}

function seoPreflightReport(config) {
  const evidence = currentSeoEvidence(config);
  return buildSeoEvidencePreflightReportFromEvidence(evidence);
}

function preflightReports(config) {
  const generatedAt = config.reviewedAt || new Date().toISOString();
  const listingReport = currentListingQualityReport(config, { generatedAt });
  return {
    kind: "admin_preflight_reports",
    generated_at: generatedAt,
    checklist: {
      endpoint: "/api/admin/launch-input-checklist",
      path: "production/data/launch-input-checklist.md",
      refresh_command: "npm run launch:inputs",
    },
    launch_readiness: launchBlockerSummary(launchReadiness(config)),
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
      live_service_provisioning: liveServiceProvisioningState(config.liveServiceProvisioningReportPath || undefined),
      payload_runtime: payloadRuntimeState(config.payloadRuntimeReportPath || undefined),
      production_recovery: productionRecoveryState(config.productionRecoveryReportPath || undefined),
    },
  };
}

function migrationReviewPayload(registry, url, config) {
  const routes = routeMapRows();
  const workspace = renderAdminWorkspace({ registry, requestedLocale: url.searchParams.get("locale") || "en" });
  const decisions = currentLegacyRouteDecisions(config);
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
  // Match the HTTP workbench's short, phone-friendly human review batches.
  const routePageSize = 10;
  const routePages = Math.max(1, Math.ceil(reviewSelection.rows.length / routePageSize));
  const requestedRoutePage = Number.parseInt(url.searchParams.get("routePage") || "1", 10);
  const routePage = Math.min(Math.max(Number.isFinite(requestedRoutePage) ? requestedRoutePage : 1, 1), routePages);
  const pendingRoutesWithEvidence = reviewSelection.rows.slice((routePage - 1) * routePageSize, routePage * routePageSize);
  const mappedListings = routes.filter((route) => route.url_type === "listing" && route.target_path);
  const readiness = launchReadiness(config);
  const seoEvidence = seoEvidencePayload(currentSeoEvidence(config));
  const listingQuality = currentListingQualityReviewQueue(config, { generatedAt: config.reviewedAt });
  const listingVerification = buildListingVerificationReport({
    seed: currentSeed(config),
    edits: readListingEdits(config.listingEditLedgerPath),
    generatedAt: config.reviewedAt || new Date().toISOString(),
  });
  const translationCoverage = buildTranslationCoverageReport({
    registry,
    seed: currentSeed(config),
    translationTasks: readTranslationLedger(config.translationLedgerPath),
    generatedAt: config.reviewedAt || new Date().toISOString(),
  });
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
      title: `${workspace.copy.migrationReview || "Migration review"} | MS Realty`,
      description: "Admin-only crawl metadata, media, and reviewed redirect approval workbench.",
      robots: "noindex,nofollow",
    },
    workspace,
    dashboard: readJsonData("migration-review-dashboard.json"),
    routeMap: {
      total: routes.length,
      sourceReviewRequired: sourceReviewRequired.length,
      reviewRequired: reviewRequired.length,
      mappedListings: mappedListings.length,
      terminalDecisionsReviewed: decisions.length,
      pendingSample: pendingRoutesWithEvidence,
      filters: reviewSelection.filters,
      filterOptions: reviewSelection.filterOptions,
      targetOptions: migrationReviewTargetOptions(readJsonData("app-route-manifest.json")),
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
    seoEvidence,
    listingQuality,
    agencyReviewQueue: buildAgencyReviewQueue({
      pendingRoutes: reviewRequired,
      listingQuality,
      listingVerification,
      translationCoverage,
      brokerContacts: readBrokerContacts(config.brokerContactLedgerPath),
      seoEvidence,
      launchReadiness: readiness,
    }),
    listingQualityWorkbookEndpoint: "/api/admin/listing-quality-workbook",
    listingQualityReviewDraftEndpoint: "/api/admin/listing-quality-review-draft",
    listingQualityImportEndpoint: "/api/admin/listing-quality/import",
    launchBlockers: launchBlockerSummary(readiness),
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
    deployablePreview: currentDeployableRedirects(config),
    terminalDecisionPreview: decisions,
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
  recordAudit(
    {
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
    },
    config,
  );
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
  const reply = appendReviewedReply(
    readLeadLedger(config.leadLedgerPath),
    bindAuthenticatedOperator(reviewedReplyInput(input), config.adminPrincipal, ["reviewer"]),
    {
      filePath: config.replyOutboxPath,
      reviewedAt: config.reviewedAt,
    },
  );
  if (!readAuditLog(config.auditLogPath).some((row) => row.action === "reply_approved" && row.object_id === reply.id)) {
    recordAudit(
      {
        action: "reply_approved",
        actor: reply.reviewer,
        objectType: "reply",
        objectId: reply.id,
        locale: reply.reply_language,
        metadata: { lead_id: reply.lead_id, hermes_draft_used: reply.hermes_draft_used, status: reply.status },
      },
      config,
    );
  }
  return reply;
}

async function draftReply(input, config) {
  return createHermesReplyDraft(
    withLeadContacts(readLeadLedger(config.leadLedgerPath), {
      filePath: config.leadContactVaultPath,
      secret: config.leadContactKey,
    }),
    input,
    {
      auditLogPath: config.auditLogPath,
      provider: config.hermesReplyProvider || undefined,
      recordedAt: config.reviewedAt || config.editedAt,
    },
  );
}

function persistEditorChange(result, config) {
  const edit = appendListingEdit(result.edit, { filePath: config.listingEditLedgerPath });
  const persistedStaleTranslations = edit.idempotent
    ? []
    : result.staleTranslations
        .filter((translation) => translation.id)
        .map((translation) => appendTranslationTask(translation, { filePath: config.translationLedgerPath }));
  if (!edit.idempotent) {
    recordAudit(
      {
        action: "listing_edited",
        actor: edit.editor,
        objectType: "listing",
        objectId: edit.listing_id,
        metadata: {
          changed_fields: Object.keys(edit.patch || {}),
          media_reviewer: edit.media_reviewer || null,
          stale_translation_count: result.staleTranslations.length,
        },
      },
      config,
    );
  }
  return { edit, staleTranslations: result.staleTranslations, persistedStaleTranslations };
}

function appendMediaReviewEntry(input, config) {
  const attributed = bindAuthenticatedOperator(input, config.adminPrincipal, ["reviewer"]);
  const review = createMediaReview(currentSeed(config), attributed, config.reviewedAt);
  const persisted = appendMediaReview(review, { filePath: config.mediaReviewLedgerPath });
  if (!persisted.idempotent) {
    recordAudit(
      {
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
      },
      config,
    );
  }
  return persisted;
}

async function appendBulkListingStatusChanges(input, config) {
  const attributed = bindAuthenticatedOperator(input, config.adminPrincipal, ["editor"]);
  const result = await saveBulkListingStatusDrafts(currentSeed(config), {
    env: config.authEnv || process.env,
    payload: config.payloadListingRuntime || null,
    principal: config.adminPrincipal,
    input: attributed,
    editedAt: config.editedAt,
    requestChannel: config.requestChannel || "admin",
  });
  const changes = result.edits.filter((edit) => !edit.idempotent);
  for (const edit of changes) {
    recordAudit(
      {
        action: "listing_edited",
        actor: edit.editor,
        objectType: "listing",
        objectId: edit.listing_id,
        metadata: {
          changed_fields: ["listing_status"],
          source: config.requestChannel === "mcp" ? "mcp_payload_draft" : "admin_payload_draft",
        },
      },
      config,
    );
  }
  return {
    kind: "bulk_listing_status_update",
    targetStatus: result.batch.targetStatus,
    requested: result.batch.requestedListingIds.length,
    updated: changes.length,
    idempotent: result.edits.filter((edit) => edit.idempotent).length,
    unchanged: result.batch.unchangedListingIds.length,
    unchangedListingIds: result.batch.unchangedListingIds,
    edits: result.edits,
    staleTranslations: result.staleTranslations,
    projectedSeed: result.projectedSeed,
  };
}

function scheduleListingPublication(input, config) {
  const attributed = bindAuthenticatedOperator(input, config.adminPrincipal, ["actor"]);
  const schedule = appendListingPublicationSchedule(currentSeed(config), attributed, {
    filePath: config.listingPublicationSchedulePath,
    createdAt: config.listingPublicationAt || config.editedAt,
  });
  const scheduleAuditExists = readAuditLog(config.auditLogPath).some(
    (audit) => audit.action === "listing_publication_scheduled" && audit.object_id === schedule.schedule_id,
  );
  if (!scheduleAuditExists) {
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
      config,
      schedule.created_at,
    );
  }
  return {
    schedule,
    queue: buildListingPublicationScheduleQueue(readListingPublicationSchedules(config.listingPublicationSchedulePath), {
      now: config.listingPublicationAt || config.reviewedAt || new Date().toISOString(),
    }),
  };
}

function cancelScheduledListingPublication(input, config) {
  const attributed = bindAuthenticatedOperator(input, config.adminPrincipal, ["actor"]);
  const cancellation = cancelListingPublicationSchedule(attributed, {
    filePath: config.listingPublicationSchedulePath,
    cancelledAt: config.listingPublicationAt || config.editedAt,
  });
  const cancellationAuditExists = readAuditLog(config.auditLogPath).some(
    (audit) => audit.action === "listing_publication_cancelled" && audit.object_id === cancellation.schedule_id,
  );
  if (!cancellationAuditExists) {
    recordAudit(
      {
        action: "listing_publication_cancelled",
        actor: cancellation.actor,
        objectType: "listing_publication_schedule",
        objectId: cancellation.schedule_id,
        metadata: { reason: cancellation.reason },
      },
      config,
      cancellation.cancelled_at,
    );
  }
  return { cancellation };
}

function runDueListingPublications(config) {
  const result = executeDueListingPublicationSchedules({
    seed: currentSeed(config),
    schedules: readListingPublicationSchedules(config.listingPublicationSchedulePath),
    translationTasks: latestTranslationTasks(readTranslationLedger(config.translationLedgerPath)),
    executor: config.adminPrincipal?.id,
    now: config.listingPublicationAt || config.editedAt || new Date().toISOString(),
    scheduleFilePath: config.listingPublicationSchedulePath,
    listingEditFilePath: config.listingEditLedgerPath,
    translationLedgerPath: config.translationLedgerPath,
  });
  for (const auditRecord of listingPublicationExecutionAuditRecords(result.queue)) {
    const existing = readAuditLog(config.auditLogPath).some(
      (audit) => audit.action === auditRecord.input.action && audit.object_id === auditRecord.input.objectId,
    );
    if (!existing) {
      recordAudit(auditRecord.input, config, auditRecord.recordedAt);
    }
  }
  return result;
}

async function syncViewingBookingCalendar(viewing, config) {
  const providerConfig = config.providerConnection || providerConnectionConfigFromEnv(config.authEnv || process.env);
  try {
    const result = await (config.syncViewingToGoogleCalendar || syncViewingToGoogleCalendar)(viewing, {
      config: providerConfig,
      payload: config.providerConnectionPayload || null,
      fetchImpl: config.providerFetch || fetch,
    });
    if (result.status === "synced") {
      recordAudit(
        {
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
        },
        config,
      );
    }
    return result;
  } catch (error) {
    const message =
      error instanceof ProviderConnectionUnavailableError
        ? "Provider connection store is unavailable"
        : String(error?.message || "Google Calendar sync failed");
    recordAudit(
      {
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
      },
      config,
    );
    return { status: "failed", provider: "google", message };
  }
}

async function appendViewingBooking(input, config) {
  const [leadSource, viewingSource] = await Promise.all([adminLeadSource(config), adminViewingSource(config)]);
  const filterRows = leadScopedRows(leadSource);
  const rows = filterRows(viewingSource.viewings);
  const context = {
    leads: applyLeadAssignments(leadSource.leads, filterRows(readLeadAssignments(config.leadAssignmentLedgerPath))),
    outcomes: filterRows(readLeadPipelineOutcomes(config.leadPipelineOutcomeLedgerPath)),
    viewings: rows,
    viewingFollowUps: filterRows(readViewingFollowUps(config.viewingFollowUpLedgerPath)),
    deals: filterRows(readDeals(config.dealLedgerPath)),
    sellerPipelines: filterRows(readSellerPipeline(config.sellerPipelinePath)),
    sellerPipelineOutcomes: filterRows(readSellerPipelineOutcomes(config.sellerPipelineOutcomeLedgerPath)),
  };
  const boundInput = bindAuthenticatedOperator(input, config.adminPrincipal, ["broker"]);
  let viewing;
  if (viewingSource.durable) {
    const candidate = createViewing(context, boundInput, { rows, bookedAt: config.bookedAt });
    viewing = candidate.idempotent
      ? { ...candidate, durable: true }
      : await (config.persistViewingDurably || persistViewingDurably)(candidate, {
          payload: config.viewingDurablePayload || null,
        });
  } else {
    viewing = appendViewing(context, boundInput, { filePath: config.viewingLedgerPath, bookedAt: config.bookedAt });
  }
  if (!viewing.idempotent) {
    recordAudit(
      {
        action: "viewing_booked",
        actor: viewing.broker,
        objectType: "viewing",
        objectId: viewing.id,
        locale: viewing.original_language,
        metadata: { lead_id: viewing.lead_id, listing_reference: viewing.listing_reference, status: viewing.status },
      },
      config,
    );
  }
  let calendarSync = await syncViewingBookingCalendar(viewing, config);
  if (viewingSource.durable) {
    calendarSync = await (config.recordViewingCalendarSync || recordViewingCalendarSync)(viewing.id, calendarSync, {
      payload: config.viewingDurablePayload || null,
      recordedAt: config.bookedAt || new Date().toISOString(),
    });
  }
  if (calendarSync.status === "synced") {
    return {
      ...viewing,
      calendar_sync: calendarSync,
      message: "Viewing booked and added to Google Calendar.",
    };
  }
  if (calendarSync.status === "failed") {
    return {
      ...viewing,
      calendar_sync: calendarSync,
      message: "Viewing booked, but Google Calendar sync failed.",
    };
  }
  if (["not_configured", "not_connected"].includes(calendarSync.status)) {
    return {
      ...viewing,
      calendar_sync: calendarSync,
      message: "Viewing booked. Connect Google Calendar to sync it automatically.",
    };
  }
  return {
    ...viewing,
    calendar_sync: calendarSync,
  };
}

function appendViewingFollowUpEntry(input, config) {
  const recordedAt = config.viewingFollowUpAt || config.reviewedAt || config.bookedAt || new Date().toISOString();
  const result = appendViewingFollowUp(readViewings(config.viewingLedgerPath), bindAuthenticatedOperator(input, config.adminPrincipal), {
    filePath: config.viewingFollowUpLedgerPath,
    recordedAt,
  });
  if (!result.idempotent) {
    recordAudit(
      {
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
      },
      config,
      recordedAt,
    );
  }
  return result;
}

function appendSellerPipelineOutcomeEntry(input, config) {
  const recordedAt = config.sellerPipelineOutcomeAt || config.reviewedAt || config.bookedAt || new Date().toISOString();
  const authenticatedInput = bindAuthenticatedOperator(input, config.adminPrincipal);
  if ((authenticatedInput.commissionEur ?? authenticatedInput.commission_eur) !== undefined && !canAdminAccess(config.adminPrincipal, "financials:write")) {
    throw Object.assign(new Error("Commission entry requires financials:write"), {
      status: 403,
      capability: "financials:write",
    });
  }
  const result = appendSellerPipelineOutcome(readSellerPipeline(config.sellerPipelinePath), authenticatedInput, {
    filePath: config.sellerPipelineOutcomeLedgerPath,
    recordedAt,
  });
  // ponytail: separate JSONL ledgers are not transactional; an idempotent retry repairs a missing summary audit.
  if (!readAuditLog(config.auditLogPath).some((row) => row.action === "seller_pipeline_outcome_recorded" && row.object_id === result.outcome.id)) {
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
      config,
      recordedAt,
    );
  }
  return result;
}

function appendPublicRequestOutcomeEntry(input, config) {
  const recordedAt = config.publicRequestOutcomeAt || config.reviewedAt || new Date().toISOString();
  const result = appendPublicRequestOutcome(
    {
      savedSearches: readSavedSearches(config.savedSearchLedgerPath),
      languageRequests: readLanguageRequests(config.languageRequestPath),
    },
    bindAuthenticatedOperator(input, config.adminPrincipal),
    { filePath: config.publicRequestOutcomeLedgerPath, recordedAt },
  );
  if (
    !readAuditLog(config.auditLogPath).some(
      (row) => row.action === "public_request_outcome_recorded" && row.object_id === result.outcome.id,
    )
  ) {
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
      config,
      recordedAt,
    );
  }
  return result;
}

function appendReplyDeliveryOutcomeEntry(input, config) {
  const recordedAt = config.replyDeliveredAt || config.reviewedAt || new Date().toISOString();
  const result = appendReplyDeliveryOutcome(
    readReplyOutbox(config.replyOutboxPath),
    bindAuthenticatedOperator(input, config.adminPrincipal),
    { filePath: config.replyDeliveryOutcomeLedgerPath, recordedAt },
  );
  if (
    !readAuditLog(config.auditLogPath).some(
      (row) => row.action === "reply_delivery_recorded" && row.object_id === result.outcome.id,
    )
  ) {
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
      config,
      recordedAt,
    );
  }
  return result;
}

async function sendQueuedReplyViaProvider(input, config) {
  const replyId = String(input?.replyId || "").trim();
  const reply = replyId ? readReplyOutbox(config.replyOutboxPath).find((row) => row.id === replyId) : null;
  if (replyId && !reply) throw new Error("Approved reply was not found");
  const source = await adminLeadSource(config);
  const leadId = String(reply?.lead_id || input?.leadId || "").trim();
  if (!leadId) throw new Error("Lead id is required");
  const lead = source.leads.find((row) => row.lead_id === leadId);
  if (!lead) throw new Error("Lead was not found for the approved reply");
  const provider = String(input.provider || input.channel || "google").trim().toLowerCase();
  const channel = provider === "google" ? "email" : provider;
  const recipient = String(
    provider === "google"
      ? lead.contact?.email
      : provider === "whatsapp"
        ? lead.contact?.whatsapp || lead.contact?.phone
        : lead.contact?.viber_user_id,
  ).trim();
  if (!recipient) throw new Error(`Lead has no ${channel} recipient for provider delivery`);
  const directApproval = !reply;
  if (directApproval && String(input.approved || "").trim().toLowerCase() !== "true") {
    throw new Error("Human approval is required before provider delivery");
  }
  const approvedAt = directApproval
    ? config.replyDeliveredAt || config.reviewedAt || new Date().toISOString()
    : reply.reviewed_at;
  const approvedBy = directApproval ? config.adminPrincipal?.id : reply.reviewer;
  const message = directApproval ? String(input.message || input.reviewedReply || "") : reply.reviewed_reply;
  const providerConfig = config.providerConnection || providerConnectionConfigFromEnv(config.authEnv || process.env);
  const providerDelivery = await (config.deliverApprovedProviderMessage || deliverApprovedProviderMessage)(
    {
      provider,
      leadId,
      idempotencyKey: String(input.idempotencyKey || (reply ? `reply:${reply.id}:${provider}` : "")),
      recipient,
      message,
      ...(provider === "google"
        ? { subject: `MS Realty reply regarding ${String(lead.listing_reference || lead.lead_id || "your enquiry").trim()}` }
        : {}),
      approved: directApproval ? true : reply.broker_approved === true,
      approvedBy,
      approvedAt,
    },
    {
      config: providerConfig,
      payload: config.providerDeliveryPayload || config.providerConnectionPayload || null,
      fetchImpl: config.providerFetch || fetch,
    },
  );
  if (providerDelivery.status !== "sent") throw new Error("Provider did not confirm message delivery");
  const result =
    reply && !source.durable
      ? appendReplyDeliveryOutcomeEntry({ ...input, action: "sent", channel }, config)
      : {
          idempotent: providerDelivery.idempotent,
          delivery: {
            lead_id: leadId,
            status: "sent",
            delivery_channel: channel,
            sent_at: providerDelivery.completed_at,
          },
        };
  recordAudit(
    {
      action: "provider_reply_sent",
      actor: config.adminPrincipal?.id || approvedBy,
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
    config,
    result.delivery.sent_at || approvedAt,
  );
  return { ...result, provider_delivery: providerDelivery };
}

function appendLeadPipelineOutcomeEntry(input, config) {
  const recordedAt = config.leadPipelineOutcomeAt || config.reviewedAt || config.bookedAt || new Date().toISOString();
  const result = appendLeadPipelineOutcome(
    leadJourneyContext(config),
    bindAuthenticatedOperator(input, config.adminPrincipal),
    { filePath: config.leadPipelineOutcomeLedgerPath, recordedAt },
  );
  if (
    !readAuditLog(config.auditLogPath).some(
      (row) => row.action === "lead_pipeline_outcome_recorded" && row.object_id === result.outcome.id,
    )
  ) {
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
      config,
      recordedAt,
    );
  }
  return result;
}

async function openRealtyCaseEntry(input, config) {
  const recordedAt = config.realtyCaseRecordedAt || config.reviewedAt || new Date().toISOString();
  const boundInput = bindRealtyCaseExecutor(input, config.adminPrincipal);
  const payloadAuthority = realtyCasePayloadAuthorityActive(config);
  const result = payloadAuthority
    ? await openRealtyCaseInPayload(boundInput, {
        payload: config.realtyCasePayload,
        workspaceId: config.realtyCaseWorkspaceId,
        recordedAt,
      })
    : openRealtyCase(boundInput, {
        filePath: config.realtyCaseLedgerPath,
        recordedAt,
      });
  const auditReplicaPending = recordAuditReplica(
    {
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
    },
    config,
    recordedAt,
    (row) => row.action === "realty_case_opened" && row.object_id === result.case.id,
    payloadAuthority,
  );
  return auditReplicaPending ? { ...result, audit_replica_pending: true } : result;
}

async function appendRealtyCaseActionEntry(input, config) {
  const recordedAt = config.realtyCaseRecordedAt || config.reviewedAt || new Date().toISOString();
  const boundInput = bindRealtyCaseExecutor(input, config.adminPrincipal);
  const payloadAuthority = realtyCasePayloadAuthorityActive(config);
  const result = payloadAuthority
    ? await appendRealtyCaseActionInPayload(boundInput, {
        payload: config.realtyCasePayload,
        workspaceId: config.realtyCaseWorkspaceId,
        recordedAt,
      })
    : appendRealtyCaseAction(boundInput, {
        filePath: config.realtyCaseLedgerPath,
        recordedAt,
      });
  const auditReplicaPending = recordAuditReplica(
    {
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
    },
    config,
    recordedAt,
    (row) => row.action === "realty_case_action_recorded" && row.object_id === result.event.id,
    payloadAuthority,
  );
  return auditReplicaPending ? { ...result, audit_replica_pending: true } : result;
}

async function projectRealtyCaseEntry(result, config) {
  if (!config.realtyCaseRequestProjectionEnabled) return null;
  return projectRealtyCaseRequest({
    caseId: result.case.id,
    eventId: result.event.id,
    filePath: config.realtyCaseLedgerPath,
    workspaceId: config.realtyCaseWorkspaceId,
    projector: config.realtyCasePayloadProjector,
  });
}

async function projectRealtyCaseConditionEntry(result, config) {
  if (!config.realtyCaseRequestProjectionEnabled) return null;
  return projectRealtyCaseConditionRequest({
    caseId: result.condition.case_id,
    eventId: result.event.id,
    filePath: config.realtyCaseConditionLedgerPath,
    workspaceId: config.realtyCaseWorkspaceId,
    projector: config.realtyCasePayloadProjector,
  });
}

async function openRealtyCaseConditionEntry(input, config) {
  const recordedAt = config.realtyCaseRecordedAt || config.reviewedAt || new Date().toISOString();
  const boundInput = bindRealtyCaseConditionExecutor(input, config.adminPrincipal, "condition_opened");
  const payloadAuthority = realtyCasePayloadAuthorityActive(config);
  const result = payloadAuthority
    ? await openRealtyCaseConditionInPayload(boundInput, {
        payload: config.realtyCasePayload,
        workspaceId: config.realtyCaseWorkspaceId,
        recordedAt,
      })
    : openRealtyCaseCondition(boundInput, {
      filePath: config.realtyCaseConditionLedgerPath,
      caseLedgerPath: config.realtyCaseLedgerPath,
      recordedAt,
    });
  const auditReplicaPending = recordAuditReplica(
    {
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
    },
    config,
    recordedAt,
    (row) => row.action === "realty_case_condition_opened" && row.object_id === result.event.id,
    payloadAuthority,
  );
  return auditReplicaPending ? { ...result, audit_replica_pending: true } : result;
}

async function appendRealtyCaseConditionActionEntry(input, config) {
  const recordedAt = config.realtyCaseRecordedAt || config.reviewedAt || new Date().toISOString();
  const boundInput = bindRealtyCaseConditionExecutor(input, config.adminPrincipal, input?.action);
  const payloadAuthority = realtyCasePayloadAuthorityActive(config);
  const result = payloadAuthority
    ? await appendRealtyCaseConditionActionInPayload(boundInput, {
        payload: config.realtyCasePayload,
        workspaceId: config.realtyCaseWorkspaceId,
        recordedAt,
      })
    : appendRealtyCaseConditionAction(boundInput, {
      filePath: config.realtyCaseConditionLedgerPath,
      caseLedgerPath: config.realtyCaseLedgerPath,
      recordedAt,
    });
  const auditReplicaPending = recordAuditReplica(
    {
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
    },
    config,
    recordedAt,
    (row) => row.action === "realty_case_condition_action_recorded" && row.object_id === result.event.id,
    payloadAuthority,
  );
  return auditReplicaPending ? { ...result, audit_replica_pending: true } : result;
}

function appendBrokerLeadEntry(input, registry, config) {
  if (!config.leadContactVaultPath || !config.leadContactKey) {
    throw new Error("Encrypted lead contact storage is not configured");
  }
  const normalized = normalizeBrokerLeadInput(input);
  const leadId = String(normalized.id || `broker-lead-${randomUUID()}`).trim();
  const existing = readLeadLedger(config.leadLedgerPath).find((row) => row.lead_id === leadId);
  if (existing) return { lead: existing, idempotent: true };
  const recordedAt = config.reviewedAt || new Date().toISOString();
  const lead = createCrmInboxItem(registry, normalized, { assignedId: leadId });
  const contactVault = appendLeadContact(lead, {
    filePath: config.leadContactVaultPath,
    secret: config.leadContactKey,
    storedAt: recordedAt,
  });
  const ledger = appendLead(lead, {
    filePath: config.leadLedgerPath,
    receivedAt: recordedAt,
    contactSecret: config.leadContactKey,
  });
  const consent = appendConsentRecord(
    createConsentRecord(
      {
        consentType: "inquiry_follow_up",
        source: lead.lead.source,
        subjectId: lead.lead.id,
        locale: lead.original_language,
        contact: lead.lead.contact,
        marketingOptIn: false,
      },
      recordedAt,
    ),
    { filePath: config.consentLedgerPath },
  );
  const sellerPipeline =
    lead.lead.leadType === "seller"
      ? appendSellerPipeline(createSellerPipelineItem(lead, { createdAt: recordedAt }), {
          filePath: config.sellerPipelinePath,
        })
      : null;
  recordAudit(
    {
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
    },
    config,
    recordedAt,
  );
  return { lead, ledger, contactVault, consent, sellerPipeline, idempotent: false };
}

function appendLeadAssignmentEntry(input, config) {
  const attributed = bindAuthenticatedOperator(input, config.adminPrincipal, ["actor"]);
  const leads = applyLeadAssignments(readLeadLedger(config.leadLedgerPath), readLeadAssignments(config.leadAssignmentLedgerPath));
  const assignment = createLeadAssignment(leads, attributed, config.reviewedAt || new Date().toISOString());
  const persisted = appendLeadAssignment(assignment, { filePath: config.leadAssignmentLedgerPath });
  if (!persisted.idempotent) {
    recordAudit(
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
      config,
      persisted.assigned_at,
    );
  }
  return persisted;
}

function appendAccountCreationEntry(input, config) {
  const attributed = bindAuthenticatedOperator(input, config.adminPrincipal, ["actor"]);
  const result = appendAccountCreation(attributed, {
    filePath: config.accountLedgerPath,
    recordedAt: config.reviewedAt || new Date().toISOString(),
  });
  if (!result.idempotent) {
    recordAudit(
      {
        action: "account_created",
        actor: result.actor,
        objectType: "account",
        objectId: result.account_id,
        metadata: { account_type: result.account_type },
      },
      config,
      result.recorded_at,
    );
  }
  return result;
}

async function appendAccountContactLinkEntry(input, config) {
  const attributed = bindAuthenticatedOperator(input, config.adminPrincipal, ["actor"]);
  const contacts = (await contactWorkspaceData(config)).contacts;
  const result = appendAccountContactLink(contacts, attributed, {
    filePath: config.accountLedgerPath,
    recordedAt: config.reviewedAt || new Date().toISOString(),
  });
  if (!result.idempotent) {
    recordAudit(
      {
        action: "contact_linked",
        actor: result.actor,
        objectType: "account_contact",
        objectId: result.id,
        metadata: { account_id: result.account_id, contact_id: result.contact_id },
      },
      config,
      result.recorded_at,
    );
  }
  return result;
}

function appendDocumentChecklistOutcomeEntry(input, config) {
  const attributed = bindAuthenticatedOperator(input, config.adminPrincipal, ["actor"]);
  const leads = applyLeadAssignments(readLeadLedger(config.leadLedgerPath), readLeadAssignments(config.leadAssignmentLedgerPath));
  const result = appendDocumentChecklistOutcome(leads, attributed, {
    filePath: config.documentChecklistLedgerPath,
    recordedAt: config.reviewedAt || new Date().toISOString(),
  });
  if (!result.idempotent) {
    recordAudit(
      {
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
      },
      config,
      result.outcome.recorded_at,
    );
  }
  return result;
}

function appendConsentWithdrawalEntry(input, config) {
  const attributed = bindAuthenticatedOperator(input, config.adminPrincipal, ["actor"]);
  const result = createConsentWithdrawal(
    attributed,
    readConsentLedger(config.consentLedgerPath),
    config.reviewedAt || new Date().toISOString(),
  );
  if (!result.idempotent) {
    appendConsentRecord(result.record, { filePath: config.consentLedgerPath });
    recordAudit(
      {
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
      },
      config,
      result.record.recorded_at,
    );
  }
  return result;
}

function appendDealClose(input, config) {
  const deal = appendClosedDeal(leadJourneyContext(config), bindAuthenticatedOperator(input, config.adminPrincipal, ["broker"]), {
    filePath: config.dealLedgerPath,
    closedAt: config.dealClosedAt,
  });
  if (!deal.idempotent) {
    recordAudit(
      {
        action: "deal_closed",
        actor: deal.broker,
        objectType: "deal",
        objectId: deal.id,
        locale: deal.original_language,
        metadata: { lead_id: deal.lead_id, listing_reference: deal.listing_reference, status: deal.status },
      },
      config,
    );
  }
  return deal;
}

function appendBrokerContactApproval(input, config) {
  const attributed = bindAuthenticatedOperator(input, config.adminPrincipal, ["reviewer"]);
  const contact = appendBrokerContact(createBrokerContact(attributed, { reviewedAt: config.reviewedAt }), {
    filePath: config.brokerContactLedgerPath,
  });
  recordAudit(
    {
      action: "broker_contact_approved",
      actor: contact.reviewer,
      objectType: "broker_contact",
      objectId: contact.id,
      metadata: { listing_id: contact.listing_id, broker: contact.broker, channels: Object.keys(contact.channels || {}) },
    },
    config,
  );
  return contact;
}

function appendTourApprovalRow(input, config) {
  const attributed = bindAuthenticatedOperator(input, config.adminPrincipal, ["reviewer"]);
  const tour = appendTourApproval(createTourApproval(currentSeed(config), attributed, config.reviewedAt), {
    filePath: config.tourApprovalLedgerPath,
  });
  recordAudit(
    {
      action: "tour_approved",
      actor: tour.reviewer,
      objectType: "listing_tour",
      objectId: tour.id,
      metadata: { listing_id: tour.listing_id, provider: tour.provider, is_public: tour.is_public },
    },
    config,
  );
  return tour;
}

function appendTranslationDraft(registry, input, config) {
  const attributedInput = bindAuthenticatedOperator(translationDraftInput(input), config.adminPrincipal, ["reviewer"]);
  const task = appendTranslationTask(createTranslationReviewTask(registry, attributedInput), { filePath: config.translationLedgerPath });
  recordAudit(
    {
      action: "translation_drafted",
      actor: attributedInput.reviewer || "translation_editor",
      objectType: task.object_type,
      objectId: task.id,
      locale: task.target_locale,
      metadata: { object_id: task.object_id, status: task.status, public_indexable: task.public_indexable },
    },
    config,
  );
  return task;
}

function appendApprovedTranslation(registry, input, config) {
  input = bindAuthenticatedOperator(input, config.adminPrincipal, ["reviewer"]);
  const task = latestTranslationTasks(readTranslationLedger(config.translationLedgerPath)).find((row) => row.id === input.taskId);
  if (!task) throw new Error("Known translation task is required");
  const approved = appendTranslationTask(approveTranslationTask(registry, task, input.reviewer, input.approvedAt || config.reviewedAt), {
    filePath: config.translationLedgerPath,
  });
  recordAudit(
    {
      action: "translation_approved",
      actor: approved.reviewer,
      objectType: approved.object_type,
      objectId: approved.id,
      locale: approved.target_locale,
      metadata: { object_id: approved.object_id, status: approved.status, public_indexable: approved.public_indexable },
    },
    config,
  );
  return approved;
}

function appendPublishedTranslation(registry, input, config) {
  const task = latestTranslationTasks(readTranslationLedger(config.translationLedgerPath)).find((row) => row.id === input.taskId);
  if (!task) throw new Error("Known translation task is required");
  const published = appendTranslationTask(publishApprovedTranslation(registry, task), { filePath: config.translationLedgerPath });
  recordAudit(
    {
      action: "translation_published",
      actor: published.reviewer,
      objectType: published.object_type,
      objectId: published.id,
      locale: published.target_locale,
      metadata: { object_id: published.object_id, status: published.status, public_indexable: published.public_indexable },
    },
    config,
  );
  return published;
}

function appendListingSlugChange(registry, input, config) {
  const change = appendSlugChange(registry, currentSeed(config), input, {
    filePath: config.slugHistoryPath,
    changedAt: config.editedAt,
  });
  recordAudit(
    {
      action: "listing_slug_changed",
      actor: change.changed_by,
      objectType: "listing_slug",
      objectId: change.id,
      locale: change.locale,
      metadata: { listing_id: change.listing_id, old_path: change.old_path, new_path: change.new_path, status: change.status },
    },
    config,
  );
  return change;
}

function appendRedirectApprovalRow(input, config) {
  const approval = appendRedirectApproval(routeMapRows(), redirectApprovalInput(input), {
    filePath: config.redirectApprovalPath,
    approvedAt: config.reviewedAt,
  });
  recordAudit(
    {
      action: "redirect_approval_created",
      actor: approval.reviewer,
      objectType: "redirect",
      objectId: approval.old_url,
      locale: approval.target_locale,
      metadata: { target_path: approval.target_path, status: approval.status, deployable: approval.deployable },
    },
    config,
  );
  return {
    approval,
    deployablePreview: currentDeployableRedirects(config),
    terminalDecisionPreview: currentLegacyRouteDecisions(config),
    report: launchReadiness(config),
  };
}

function importRedirectApprovalRows(csvText, config) {
  const imported = importRedirectApprovalsCsv(routeMapRows(), csvText, {
    filePath: config.redirectApprovalPath,
    approvedAt: config.reviewedAt,
  });
  recordAudit(
    {
      action: "redirect_approvals_imported",
      actor: "seo_editor",
      objectType: "redirect_import",
      objectId: `redirect-import-${imported.length}`,
      metadata: { imported: imported.length },
    },
    config,
  );
  return {
    imported: imported.length,
    approvals: imported,
    deployablePreview: currentDeployableRedirects(config),
    terminalDecisionPreview: currentLegacyRouteDecisions(config),
    report: launchReadiness(config),
  };
}

function exportDeployableRedirectRows(config) {
  const rows = currentDeployableRedirects(config);
  const decisions = currentLegacyRouteDecisions(config);
  const exported = { exported: rows.length, ...writeDeployableRedirects(rows, config.deployableRedirectOutputPath, { decisions }) };
  recordAudit(
    {
      action: "deployable_redirects_exported",
      actor: "seo_editor",
      objectType: "redirect_export",
      objectId: "deployable-redirects",
      metadata: { exported: rows.length, terminal_decisions: decisions.length, total: exported.summary?.total },
    },
    config,
  );
  return { ...exported, report: launchReadiness(config) };
}

function exportLaunchReadiness(config) {
  const report = launchReadiness(config);
  const outPath = writeLaunchReadinessReport(report, config.launchReadinessOutputPath || undefined);
  recordAudit(
    {
      action: "launch_readiness_exported",
      actor: "operations",
      objectType: "launch_readiness",
      objectId: "launch-readiness",
      metadata: { status: report.status, blockers: report.blockers },
    },
    config,
  );
  return { outPath, report };
}

function importLiveServiceReport(input, config) {
  const imported = writeLiveServiceReport(input.source, input.report, {
    syncReportPath: config.searchSyncReportPath || undefined,
    queryReportPath: config.searchQueryReportPath || undefined,
    hermesReportPath: config.hermesWorkerReportPath || undefined,
  });
  const livePreflight = buildLiveServicePreflightReport({
    generatedAt: config.reviewedAt || new Date().toISOString(),
    syncReportPath: config.searchSyncReportPath || undefined,
    queryReportPath: config.searchQueryReportPath || undefined,
    hermesReportPath: config.hermesWorkerReportPath || undefined,
  });
  const liveImport = liveServiceImportSummary(imported, livePreflight);
  recordAudit(
    {
      action: "live_service_report_imported",
      actor: "operations",
      objectType: "live_service_report",
      objectId: input.source,
      metadata: {
        blocked_reports: liveImport.blockedReports.map((report) => report.source),
        status: imported.report?.status || input.report?.status,
        out_path: imported.outPath,
      },
    },
    config,
  );
  return { imported, liveImport, livePreflight, report: launchReadiness(config) };
}

function importPayloadRuntimeReport(report, config) {
  const outPath = writePayloadRuntimeReport(report, config.payloadRuntimeReportPath || undefined);
  const runtime = payloadRuntimeImportSummary(report);
  recordAudit(
    {
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
    },
    config,
  );
  return { imported: { outPath, summary: report.summary }, report: launchReadiness(config), runtime };
}

function importLiveServiceProvisioningReport(report, config) {
  const outPath = writeLiveServiceProvisioningReport(report, config.liveServiceProvisioningReportPath || undefined);
  const provisioning = liveServiceProvisioningState(config.liveServiceProvisioningReportPath || undefined);
  recordAudit(
    {
      action: "live_service_provisioning_report_imported",
      actor: "operations",
      objectType: "live_service_provisioning_report",
      objectId: "live-service-provisioning",
      metadata: {
        missing_env: provisioning.summary?.missing_env || [],
        out_path: outPath,
        status: report.status,
      },
    },
    config,
  );
  return { imported: { outPath, summary: report.summary }, provisioning, report: launchReadiness(config) };
}

function importProductionRecoveryReport(report, config) {
  const outPath = writeProductionRecoveryReport(report, config.productionRecoveryReportPath || undefined);
  const recovery = productionRecoveryState(config.productionRecoveryReportPath || undefined);
  recordAudit(
    {
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
    },
    config,
  );
  return { imported: { outPath }, recovery, report: launchReadiness(config) };
}

function importSeoEvidence(input, config) {
  const result = importAppSeoEvidenceRows(input, config);
  recordAudit(
    {
      action: "seo_evidence_imported",
      actor: "seo_editor",
      objectType: "seo_evidence",
      objectId: input.source,
      metadata: {
        row_count: result.imported?.row_count,
        missing_required_sources: result.missingRequiredSources,
      },
    },
    config,
  );
  return { ...result, report: launchReadiness(config) };
}

function redirectApprovalWorkbook(url, config) {
  const routes = routeMapRows();
  const reviewRoutes = attachMigrationReviewEvidence(routes, loadMigrationRecords());
  const approvals = readRedirectApprovals(config.redirectApprovalPath);
  const rows = url.searchParams.get("pending")
    ? buildPendingRedirectApprovalWorkbook(reviewRoutes, approvals)
    : buildRedirectApprovalWorkbook(reviewRoutes);
  return renderRedirectApprovalWorkbook(rows);
}

function listingQualityWorkbook(config) {
  return renderListingQualityWorkbook(currentListingQualityReport(config));
}

function listingQualityReviewDraft(config) {
  return renderListingQualityReviewDraft(currentListingQualityReport(config));
}

function listingQualityReviewPacket(config) {
  const generatedAt = config.reviewedAt || new Date().toISOString();
  return buildListingQualityReviewPacket({
    generatedAt,
    report: currentListingQualityReport(config, { generatedAt }),
    reviewPath: config.listingQualityReviewPath || undefined,
  });
}

function importListingQualityRows(inputCsv, config, source = "listing_quality_csv") {
  const report = currentListingQualityReport(config);
  const review = validateListingQualityReviewCsv(report, inputCsv, { requireSnapshots: true });
  const reviewOutputPath = config.listingQualityReviewPath || DEFAULT_LISTING_QUALITY_REVIEW_INPUT;
  const existingReviewCsv = fs.existsSync(reviewOutputPath) ? fs.readFileSync(reviewOutputPath, "utf8") : "";
  const mergedReviewCsv = mergeListingQualityReviewCsv(existingReviewCsv, inputCsv);
  const mergedReview = validateListingQualityReviewCsv(report, mergedReviewCsv, {
    allowExtraRows: true,
    allowResolvedSnapshots: true,
    requireSnapshots: true,
  });
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
          review_source: source,
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
  let reviewPath = null;
  let reviewPersistenceError = "";
  try {
    reviewPath = writeListingQualityReviewCsv(mergedReviewCsv, reviewOutputPath);
  } catch (error) {
    reviewPersistenceError = error.message;
  }
  recordAudit(
    {
      action: "listing_quality_imported",
      actor: "listing_quality_editor",
      objectType: "listing_quality_review",
      objectId: review.reviews.length === 1 ? review.reviews[0].listing_id : `listing-quality-${review.summary.review_rows}`,
      metadata: {
        source,
        imported: review.summary.review_rows,
        edited: edits.length,
        media_review_rows: review.summary.media_review_rows,
        missing_review_rows: mergedReview.summary.missing_review_rows,
        review_persisted: Boolean(reviewPath),
      },
    },
    config,
  );
  const reviewImport = listingQualityImportSummary(report, mergedReview, { reviewPath, reviewPersistenceError });
  return {
    imported: review.summary.review_rows,
    edited: edits.length,
    factsReviewRows: review.summary.facts_review_rows,
    mediaReviewRows: review.summary.media_review_rows,
    missingReviewRows: mergedReview.summary.missing_review_rows,
    report: launchReadiness(config),
    reviewImport,
    reviewSummary: mergedReview.summary,
    reviewPersisted: Boolean(reviewPath),
    reviewPath,
    reviewPersistenceError,
    edits,
  };
}

export async function renderAppAdminResponse(request, { config = appAdminConfigFromEnv() } = {}) {
  const crossOrigin = crossOriginWriteRejection(request.method, request.headers);
  if (crossOrigin) return jsonResponse(403, { kind: "cross_origin_write_blocked", reason: crossOrigin });
  const authEnv = config.authEnv || process.env;
  const authHeader = request.headers.get("authorization") || "";
  const sessionToken = authHeader ? "" : adminTokenFromCookie(request.headers.get("cookie") || "");
  let payloadAdminAuthPromise;
  const payloadAdminAuth = () => {
    payloadAdminAuthPromise ||= configuredPayloadAdminAuth(config);
    return payloadAdminAuthPromise;
  };
  const requestPath = new URL(request.url, "http://localhost").pathname;
  if (requestPath === "/admin/login") {
    if (request.method === "GET") {
      let session = null;
      if (sessionToken) {
        try {
          session = await (await payloadAdminAuth())?.resolve(sessionToken);
        } catch {
          session = null;
        }
      }
      if ((authHeader && resolveAdminPrincipal(authHeader, authEnv)) || session?.principal) {
        return new Response(null, { status: 303, headers: { location: "/admin", "cache-control": "no-store" } });
      }
      const error = new URL(request.url, "http://localhost").searchParams.get("error") === "1";
      return new Response(renderAdminLoginPage({ error }), {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-robots-tag": "noindex, nofollow",
          ...(sessionToken ? { "set-cookie": adminSessionClearCookie() } : {}),
        },
      });
    }
    if (request.method === "POST") {
      try {
        const service = await payloadAdminAuth();
        if (!service) throw new Error("Payload admin authentication is unavailable");
        const form = new URLSearchParams(await readRequestBody(request, config.maxBodyBytes));
        const login = await service.login({ email: form.get("email"), password: form.get("password") });
        const nowSeconds = typeof config.nowSeconds === "function" ? config.nowSeconds() : Math.floor(Date.now() / 1000);
        const maxAgeSeconds = Math.floor(Number(login.exp) - nowSeconds);
        if (!login.token || maxAgeSeconds <= 0) throw new Error("Payload returned an expired session");
        return new Response(null, {
          status: 303,
          headers: {
            location: "/admin",
            "set-cookie": adminSessionSetCookie(login.token, { maxAgeSeconds }),
            "cache-control": "no-store",
          },
        });
      } catch {
        return new Response(null, { status: 303, headers: { location: "/admin/login?error=1", "cache-control": "no-store" } });
      }
    }
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, POST" } });
  }
  if (requestPath === "/admin/logout" && request.method === "POST") {
    if (sessionToken) {
      try {
        await (await payloadAdminAuth())?.logout(sessionToken);
      } catch {
        // Clearing the browser cookie still terminates this browser session;
        // the short-lived Payload token expires even if Postgres is unavailable.
      }
    }
    return new Response(null, {
      status: 303,
      headers: { location: "/admin/login", "set-cookie": adminSessionClearCookie(), "cache-control": "no-store" },
    });
  }
  let payloadSession = null;
  let principal = config.adminPrincipal || (authHeader ? resolveAdminPrincipal(authHeader, authEnv) : null);
  if (!principal && sessionToken) {
    try {
      payloadSession = await (await payloadAdminAuth())?.resolve(sessionToken);
      principal = payloadSession?.principal || null;
    } catch {
      principal = null;
    }
  }
  if (!principal) {
    if ((requestPath === "/admin" || requestPath.startsWith("/admin/")) && request.headers.get("accept")?.includes("text/html")) {
      return new Response(null, {
        status: 303,
        headers: {
          location: "/admin/login",
          "cache-control": "no-store",
          ...(sessionToken ? { "set-cookie": adminSessionClearCookie() } : {}),
        },
      });
    }
    const response = adminUnauthorized();
    if (!sessionToken) return response;
    const headers = new Headers(response.headers);
    headers.set("set-cookie", adminSessionClearCookie());
    return new Response(response.body, { status: response.status, headers });
  }
  if (request.method !== "GET" && !canAdminMutate(principal)) return adminOperatorIdentityRequired();
  config = { ...config, adminPrincipal: principal, payloadAdminSession: payloadSession };
  try {
    const url = new URL(request.url, "http://localhost");
    const requiredCapability = requiredAdminCapability(request.method, url.pathname);
    if (requiredCapability && !canAdminAccess(principal, requiredCapability)) return adminForbidden(requiredCapability);
    const parsedDeliveryBody =
      request.method === "POST" && url.pathname === "/api/admin/replies/delivery"
        ? parseBody(request, await readRequestBody(request, config.maxBodyBytes))
        : null;
    if (
      request.method !== "GET" &&
      config.leadDurableStore?.leadDurableStoreEnabled === true &&
      FILE_BACKED_LEAD_MUTATION_PATHS.has(url.pathname) &&
      !(url.pathname === "/api/admin/replies/delivery" && parsedDeliveryBody?.provider && !parsedDeliveryBody?.action) &&
      !(url.pathname === "/api/admin/viewings" && config.viewingDurableStore?.viewingDurableStoreEnabled === true)
    ) {
      return leadStoreUnavailable("lead_store_read_only");
    }
    if (
      principal.source === "payload_session" &&
      ["cases:read", "cases:write"].includes(requiredCapability) &&
      !canAdminAccessWorkspace(principal, config.realtyCaseWorkspaceId)
    ) {
      return adminForbidden("workspace:access");
    }
    if (["/admin/team", "/api/admin/team"].includes(url.pathname)) {
      const service = await payloadAdminAuth();
      if (!payloadSession || !service) return adminForbidden("payload_session");
      if (request.method === "GET") {
        const operators = await service.listOperators(payloadSession);
        if (url.pathname === "/api/admin/team") return jsonResponse(200, { kind: "admin_team", operators });
        return new Response(
          renderAdminTeamPage({
            operators,
            created: url.searchParams.get("created") === "1",
            error: url.searchParams.get("error") === "1",
          }),
          { status: 200, headers: PRIVATE_HTML_HEADERS },
        );
      }
      if (request.method === "POST" && url.pathname === "/api/admin/team") {
        const formRequest = (request.headers.get("content-type") || "").includes("application/x-www-form-urlencoded");
        try {
          const operator = await service.createOperator(
            payloadSession,
            parseBody(request, await readRequestBody(request, config.maxBodyBytes)),
          );
          if (formRequest) {
            return new Response(null, {
              status: 303,
              headers: { location: "/admin/team?created=1", "cache-control": "no-store" },
            });
          }
          return jsonResponse(201, { kind: "admin_team_operator", operator });
        } catch (error) {
          if (formRequest) {
            return new Response(null, {
              status: 303,
              headers: { location: "/admin/team?error=1", "cache-control": "no-store" },
            });
          }
          throw error;
        }
      }
      return jsonResponse(405, { kind: "method_not_allowed" });
    }
    if (request.method === "GET" && url.pathname === "/admin") {
      const locale = url.searchParams.get("locale");
      const query = locale ? `?locale=${encodeURIComponent(locale)}` : "";
      return new Response(null, {
        status: 307,
        headers: { ...PRIVATE_HTML_HEADERS, location: `${adminHomePath(principal)}${query}` },
      });
    }
    const registry = loadLocaleRegistry(config.localeRegistryPath);
    if (request.method === "GET" && url.pathname === "/admin/connect") {
      const providerConfig = config.providerConnection || providerConnectionConfigFromEnv(config.authEnv || process.env);
      let availability = providerConnectionAvailability(providerConfig);
      let connections = [];
      let storeError = !availability.store.ready;
      try {
        if (availability.store.ready) {
          connections = await (config.readProviderConnections || readProviderConnections)({
            payload: config.providerConnectionPayload || null,
          });
        }
      } catch {
        storeError = true;
      }
      if (storeError) {
        availability = Object.fromEntries(
          Object.entries(availability).map(([key, value]) => [key, { ...value, ready: false }]),
        );
      }
      const token = principal.source === "payload_session" ? "" : String(authHeader).replace(/^Bearer\s+/i, "").trim();
      const base =
        String((config.authEnv || process.env).MS_REALTY_PUBLIC_ORIGIN || "").trim() || new URL(request.url).origin;
      const connected = url.searchParams.get("connected");
      const result = connected
        ? `${connected === "google" ? "Google" : connected === "whatsapp" ? "WhatsApp" : "Viber"} подтверждён и подключён.`
        : url.searchParams.get("error")
          ? "Провайдер не подтвердил подключение. Проверь настройки и повтори."
          : storeError
            ? "Хранилище подключений сейчас недоступно; новые credentials не будут приняты."
            : "";
      return new Response(
        renderOperatorConnectPage({
          baseUrl: base,
          token,
          operatorId: principal?.id || "operator",
          connections,
          availability,
          result,
        }),
        {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "x-robots-tag": "noindex, nofollow",
          },
        },
      );
    }
    if (url.pathname === "/api/admin/connections") {
      const providerConfig = config.providerConnection || providerConnectionConfigFromEnv(config.authEnv || process.env);
      const availability = providerConnectionAvailability(providerConfig);
      const storeOptions = {
        credentialSecret: providerConfig.credentialSecret,
        payload: config.providerConnectionPayload || null,
      };
      const readConnections = config.readProviderConnections || readProviderConnections;
      const readCredentials = config.readProviderCredentials || readProviderCredentials;
      const saveConnection = config.saveProviderConnection || saveProviderConnection;
      if (request.method === "GET" && !url.searchParams.get("action")) {
        return jsonResponse(200, {
          kind: "provider_connections",
          availability,
          connections: await readConnections({ payload: storeOptions.payload }),
        });
      }
      if (!payloadSession || principal.source !== "payload_session" || !principal.roles?.includes("admin")) {
        return adminForbidden("payload_admin_session");
      }
      if (request.method === "GET" && url.searchParams.get("provider") === "google") {
        const action = url.searchParams.get("action");
        if (action === "start") {
          return new Response(null, {
            status: 303,
            headers: { location: googleAuthorizationUrl({ config: providerConfig, operatorId: principal.id }), "cache-control": "no-store" },
          });
        }
        if (action === "callback") {
          if (url.searchParams.get("error")) {
            recordProviderConnectionFailure("google", "oauth_callback", new Error("provider_rejected"), config);
            return new Response(null, { status: 303, headers: { location: "/admin/connect?error=google", "cache-control": "no-store" } });
          }
          try {
            const prior = await readCredentials("google", storeOptions);
            const connection = await (config.completeGoogleOAuth || completeGoogleOAuth)(
              {
                code: url.searchParams.get("code"),
                state: url.searchParams.get("state"),
                operatorId: principal.id,
                existingRefreshToken: prior?.refresh_token || "",
              },
              { config: providerConfig, fetchImpl: config.providerFetch || fetch },
            );
            const saved = await saveConnection(connection, { ...storeOptions, connectedBy: principal.id });
            recordAudit(
              {
                action: "provider_connected",
                actor: principal.id,
                objectType: "provider_connection",
                objectId: saved.provider,
                metadata: { external_account_id: saved.external_account_id, scopes: saved.scopes },
              },
              config,
            );
            return new Response(null, { status: 303, headers: { location: "/admin/connect?connected=google", "cache-control": "no-store" } });
          } catch (error) {
            recordProviderConnectionFailure("google", "oauth_callback", error, config);
            return new Response(null, { status: 303, headers: { location: "/admin/connect?error=google", "cache-control": "no-store" } });
          }
        }
      }
      if (request.method === "POST") {
        const formEncoded = (request.headers.get("content-type") || "").includes("application/x-www-form-urlencoded");
        const input = parseBody(request, await readRequestBody(request, config.maxBodyBytes));
        const provider = String(input.provider || "").trim().toLowerCase();
        try {
          let connection;
          if (provider === "whatsapp") {
            const verified = await (config.completeWhatsAppEmbeddedSignup || completeWhatsAppEmbeddedSignup)(
              { code: input.code, wabaId: input.waba_id, phoneNumberId: input.phone_number_id },
              { config: providerConfig, fetchImpl: config.providerFetch || fetch },
            );
            await saveConnection(verified, { ...storeOptions, connectedBy: principal.id });
            connection = await (config.registerWhatsAppWebhook || registerWhatsAppWebhook)(verified, {
              config: providerConfig,
              fetchImpl: config.providerFetch || fetch,
            });
          } else if (provider === "viber") {
            const verified = await (config.completeViberConnection || completeViberConnection)(
              { token: input.token },
              { config: providerConfig, fetchImpl: config.providerFetch || fetch },
            );
            await saveConnection(verified, { ...storeOptions, connectedBy: principal.id });
            connection = await (config.registerViberWebhook || registerViberWebhook)(verified, {
              config: providerConfig,
              fetchImpl: config.providerFetch || fetch,
            });
          } else {
            throw new Error("Unsupported provider connection");
          }
          const saved = await saveConnection(connection, { ...storeOptions, connectedBy: principal.id });
          recordAudit(
            {
              action: "provider_connected",
              actor: principal.id,
              objectType: "provider_connection",
              objectId: saved.provider,
              metadata: { external_account_id: saved.external_account_id, scopes: saved.scopes },
            },
            config,
          );
          if (formEncoded) {
            return new Response(null, {
              status: 303,
              headers: { location: `/admin/connect?connected=${encodeURIComponent(provider)}`, "cache-control": "no-store" },
            });
          }
          return jsonResponse(201, { kind: "provider_connection", connection: saved });
        } catch (error) {
          recordProviderConnectionFailure(provider, provider === "viber" ? "account_or_webhook" : "embedded_signup", error, config);
          if (formEncoded) {
            return new Response(null, {
              status: 303,
              headers: { location: `/admin/connect?error=${encodeURIComponent(provider || "provider")}`, "cache-control": "no-store" },
            });
          }
          return jsonResponse(400, { kind: "provider_connection_rejected", message: "The provider did not confirm the connection" });
        }
      }
      return jsonResponse(405, { kind: "method_not_allowed" });
    }
    if (request.method === "GET" && url.pathname === "/admin/today") return htmlResponse(await todayPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/today") return jsonResponse(200, await todayPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/leads") return htmlResponse(await leadInboxPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/leads") return jsonResponse(200, await leadInboxPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/contacts") return htmlResponse(await contactsPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/contacts") return jsonResponse(200, await contactsPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/documents") return htmlResponse(await documentChecklistPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/documents") return jsonResponse(200, await documentChecklistPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/consents") return htmlResponse(consentPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/consents") return jsonResponse(200, consentPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/pipeline") return htmlResponse(await pipelinePayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/pipeline") return jsonResponse(200, await pipelinePayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/cases") {
      try {
        return htmlResponse(await realtyCasesPayload(registry, url, config));
      } catch (error) {
        if (config.realtyCasePayloadAuthorityEnabled) return jsonResponse(503, realtyCasePayloadAuthorityFailure());
        throw error;
      }
    }
    if (request.method === "GET" && url.pathname === "/api/admin/cases") {
      try {
        return jsonResponse(200, await realtyCasesPayload(registry, url, config));
      } catch (error) {
        if (config.realtyCasePayloadAuthorityEnabled) return jsonResponse(503, realtyCasePayloadAuthorityFailure());
        throw error;
      }
    }
    if (request.method === "GET" && url.pathname === "/api/admin/cases/intents") {
      try {
        return jsonResponse(200, await realtyCaseIntentsPayload(config));
      } catch (error) {
        if (config.realtyCasePayloadAuthorityEnabled) return jsonResponse(503, realtyCasePayloadAuthorityFailure());
        throw error;
      }
    }
    if (request.method === "GET" && url.pathname === "/api/admin/cases/conditions") {
      try {
        return jsonResponse(200, await realtyCaseConditionQueue(config));
      } catch (error) {
        if (config.realtyCasePayloadAuthorityEnabled) return jsonResponse(503, realtyCasePayloadAuthorityFailure());
        throw error;
      }
    }
    if (request.method === "GET" && url.pathname === "/admin/requests") return htmlResponse(await requestsPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/requests") return jsonResponse(200, await requestsPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/viewings") return htmlResponse(await viewingsPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/viewings") return jsonResponse(200, await viewingsPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/reports") return htmlResponse(await reportsPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/reports") return jsonResponse(200, await reportsPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/reports/export") {
      return csvResponse(renderOperationsReportCsv(await operationsReport(registry, config)), "ms-realty-source-quality.csv");
    }
    if (request.method === "GET" && url.pathname === "/admin/activity") return htmlResponse(activityPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/activity") return jsonResponse(200, activityPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/listings") return htmlResponse(await listingManagerPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/listings") return jsonResponse(200, await listingManagerPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/listings/edit") {
      try {
        return htmlResponse(await listingEditorPayload(registry, url, config));
      } catch (error) {
        return jsonResponse(error.status || 400, { kind: error.code || "bad_request", message: error.message });
      }
    }
    if (request.method === "GET" && url.pathname === "/admin/translations") return htmlResponse(await translationQueuePayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/translations") return jsonResponse(200, await translationQueuePayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/migration/review") {
      return htmlResponse(migrationReviewPayload(registry, url, config));
    }
    if (request.method === "GET" && url.pathname === "/api/admin/migration/review") {
      return jsonResponse(200, migrationReviewPayload(registry, url, config));
    }
    if (request.method === "GET" && url.pathname === "/api/admin/locales") {
      return jsonResponse(200, localePayload(registry, url));
    }
    if (request.method === "GET" && url.pathname === "/api/admin/cms-collections") {
      return jsonResponse(200, { kind: "admin_cms_collections", ...loadCmsCollections() });
    }
    if (request.method === "GET" && url.pathname === "/api/admin/payload-collections") {
      return jsonResponse(200, { kind: "admin_payload_collections", ...loadPayloadCollections() });
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
    if (request.method === "GET" && url.pathname === "/api/admin/seo-preflight") {
      return jsonResponse(200, { kind: "admin_seo_preflight", seo: seoPreflightReport(config) });
    }
    if (request.method === "GET" && url.pathname === "/api/admin/listing-quality") {
      const generatedAt = config.reviewedAt || new Date().toISOString();
      return jsonResponse(200, {
        kind: "admin_listing_quality",
        listing_quality: buildListingQualityPreflightReport({
          report: currentListingQualityReport(config, { generatedAt }),
          reviewPath: config.listingQualityReviewPath || undefined,
          generatedAt,
        }),
      });
    }
    if (request.method === "GET" && url.pathname === "/api/admin/live-services") {
      const generatedAt = config.reviewedAt || new Date().toISOString();
      return jsonResponse(200, {
        kind: "admin_live_services",
        live_services: buildLiveServicePreflightReport({
          generatedAt,
          syncReportPath: config.searchSyncReportPath || undefined,
          queryReportPath: config.searchQueryReportPath || undefined,
          hermesReportPath: config.hermesWorkerReportPath || undefined,
        }),
      });
    }
    if (request.method === "GET" && url.pathname === "/api/admin/live-service-provisioning") {
      return jsonResponse(200, {
        kind: "admin_live_service_provisioning",
        provisioning: liveServiceProvisioningState(config.liveServiceProvisioningReportPath || undefined),
      });
    }
    if (request.method === "POST" && url.pathname === "/api/admin/live-service-provisioning/import") {
      const report = reportJsonInput(parseJsonBody(await readRequestBody(request, config.maxBodyBytes)));
      return jsonResponse(report.ready ? 201 : 202, importLiveServiceProvisioningReport(report, config));
    }
    if (request.method === "GET" && url.pathname === "/api/admin/payload-runtime") {
      return jsonResponse(200, {
        kind: "admin_payload_runtime",
        runtime: payloadRuntimeState(config.payloadRuntimeReportPath || undefined),
      });
    }
    if (request.method === "GET" && url.pathname === "/api/admin/payload-runtime-bootstrap") {
      return jsonResponse(200, payloadRuntimeBootstrapPayload());
    }
    if (request.method === "GET" && url.pathname === "/api/admin/production-recovery") {
      return jsonResponse(200, {
        kind: "admin_production_recovery",
        recovery: productionRecoveryState(config.productionRecoveryReportPath || undefined),
      });
    }
    if (request.method === "GET" && url.pathname === "/api/admin/production-recovery-template") {
      return downloadJsonResponse(readProductionRecoveryTemplate(), "production-recovery-report.json.example");
    }
    if (request.method === "GET" && url.pathname === "/api/admin/live-service-report-template") {
      const template = readLiveServiceReportTemplate(url.searchParams.get("source"));
      return downloadJsonResponse(template.json, template.filename);
    }
    if (request.method === "GET" && url.pathname === "/api/admin/seo-evidence") {
      return jsonResponse(200, seoEvidencePayload(currentSeoEvidence(config)));
    }
    if (request.method === "GET" && url.pathname === "/api/admin/seo-evidence/export") {
      return downloadJsonResponse(`${JSON.stringify(currentSeoEvidence(config), null, 2)}\n`, "seo-evidence.json");
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
    if (request.method === "GET" && url.pathname === "/api/admin/listing-quality-review-draft") {
      return csvResponse(listingQualityReviewDraft(config), "listing-quality-review-draft.csv");
    }
    if (request.method === "GET" && url.pathname === "/api/admin/listing-quality-review-packet") {
      return jsonResponse(200, listingQualityReviewPacket(config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/locales") {
      return jsonResponse(201, addLocale(registry, parseJsonBody(await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/translations/draft") {
      return jsonResponse(201, appendTranslationDraft(registry, parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/translations/approve") {
      return jsonResponse(201, appendApprovedTranslation(registry, parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/translations/publish") {
      return jsonResponse(201, appendPublishedTranslation(registry, parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config));
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
      const result = importLiveServiceReport(liveServiceReportInput(request, url, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.livePreflight.ready ? 201 : 202, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/payload-runtime/import") {
      const report = reportJsonInput(parseJsonBody(await readRequestBody(request, config.maxBodyBytes)));
      return jsonResponse(report.ready ? 201 : 202, importPayloadRuntimeReport(report, config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/production-recovery/import") {
      return jsonResponse(
        201,
        importProductionRecoveryReport(
          reportJsonInput(parseJsonBody(await readRequestBody(request, config.maxBodyBytes))),
          config,
        ),
      );
    }
    if (request.method === "POST" && url.pathname === "/api/admin/seo-evidence/import") {
      const result = importSeoEvidence(seoExportInput(request, url, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.missingRequiredSources.length ? 202 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/listing-quality/import") {
      const input = listingQualityReviewInput(request, await readRequestBody(request, config.maxBodyBytes));
      const result = importListingQualityRows(input.csv, config, input.source);
      return jsonResponse(result.reviewImport.ready ? 201 : 202, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/replies") {
      const reply = appendReply(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(reply.idempotent ? 200 : 201, reply);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/replies/delivery") {
      const input = parsedDeliveryBody;
      const result =
        String(input.deliveryMode || "").trim() === "provider_send" || (input.provider && !input.action)
          ? await sendQueuedReplyViaProvider(input, config)
          : appendReplyDeliveryOutcomeEntry(input, config);
      return jsonResponse(result.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/lead-pipeline/outcome") {
      const result = appendLeadPipelineOutcomeEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/cases") {
      let result;
      try {
        const input = parseBody(request, await readRequestBody(request, config.maxBodyBytes));
        const payloadAuthority = realtyCasePayloadAuthorityActive(config);
        if (payloadAuthority) assertRealtyCasePayloadAuthorityInput(input);
        else if (assertRealtyCaseRequestProjectionConfig(config)) assertRealtyCaseRequestProjectionInput(input);
        result = await openRealtyCaseEntry(input, config);
        if (payloadAuthority) return jsonResponse(result.idempotent ? 200 : 201, result);
      } catch (error) {
        if (error.status === 403) return adminForbidden(error.capability || "administration:write");
        if (error.status === 503) {
          return jsonResponse(
            503,
            config.realtyCasePayloadAuthorityEnabled ? realtyCasePayloadAuthorityFailure() : realtyCaseRequestProjectionFailure(),
          );
        }
        return jsonResponse(400, { kind: "bad_request", message: error.message });
      }
      try {
        const projection = await projectRealtyCaseEntry(result, config);
        return jsonResponse(result.idempotent ? 200 : 201, projection ? { ...result, projection } : result);
      } catch {
        return jsonResponse(503, realtyCaseRequestProjectionFailure(result));
      }
    }
    if (request.method === "POST" && url.pathname === "/api/admin/cases/actions") {
      let result;
      try {
        const input = parseBody(request, await readRequestBody(request, config.maxBodyBytes));
        const payloadAuthority = realtyCasePayloadAuthorityActive(config);
        if (payloadAuthority) assertRealtyCasePayloadAuthorityInput(input, { action: true });
        else if (assertRealtyCaseRequestProjectionConfig(config)) assertRealtyCaseRequestProjectionInput(input, { action: true });
        result = await appendRealtyCaseActionEntry(input, config);
        if (payloadAuthority) return jsonResponse(result.idempotent ? 200 : 201, result);
      } catch (error) {
        if (error.status === 403) return adminForbidden(error.capability || "administration:write");
        if (error.status === 503) {
          return jsonResponse(
            503,
            config.realtyCasePayloadAuthorityEnabled ? realtyCasePayloadAuthorityFailure() : realtyCaseRequestProjectionFailure(),
          );
        }
        return jsonResponse(400, { kind: "bad_request", message: error.message });
      }
      try {
        const projection = await projectRealtyCaseEntry(result, config);
        return jsonResponse(result.idempotent ? 200 : 201, projection ? { ...result, projection } : result);
      } catch {
        return jsonResponse(503, realtyCaseRequestProjectionFailure(result));
      }
    }
    if (request.method === "POST" && url.pathname === "/api/admin/cases/conditions") {
      let result;
      try {
        const input = parseBody(request, await readRequestBody(request, config.maxBodyBytes));
        const payloadAuthority = realtyCasePayloadAuthorityActive(config);
        if (payloadAuthority) assertRealtyCasePayloadAuthorityInput(input);
        else if (assertRealtyCaseRequestProjectionConfig(config)) assertRealtyCaseRequestProjectionInput(input);
        result = await openRealtyCaseConditionEntry(input, config);
        if (payloadAuthority) return jsonResponse(result.idempotent ? 200 : 201, result);
      } catch (error) {
        if (error.status === 403) return adminForbidden(error.capability || "administration:write");
        if (error.status === 503) {
          return jsonResponse(
            503,
            config.realtyCasePayloadAuthorityEnabled ? realtyCasePayloadAuthorityFailure() : realtyCaseRequestProjectionFailure(),
          );
        }
        return jsonResponse(400, { kind: "bad_request", message: error.message });
      }
      try {
        const projection = await projectRealtyCaseConditionEntry(result, config);
        return jsonResponse(result.idempotent ? 200 : 201, projection ? { ...result, projection } : result);
      } catch {
        return jsonResponse(503, realtyCaseRequestProjectionFailure(result));
      }
    }
    if (request.method === "POST" && url.pathname === "/api/admin/cases/conditions/actions") {
      let result;
      try {
        const input = parseBody(request, await readRequestBody(request, config.maxBodyBytes));
        const payloadAuthority = realtyCasePayloadAuthorityActive(config);
        if (payloadAuthority) assertRealtyCasePayloadAuthorityInput(input, { conditionAction: true });
        else if (assertRealtyCaseRequestProjectionConfig(config)) {
          assertRealtyCaseRequestProjectionInput(input, { conditionAction: true });
        }
        result = await appendRealtyCaseConditionActionEntry(input, config);
        if (payloadAuthority) return jsonResponse(result.idempotent ? 200 : 201, result);
      } catch (error) {
        if (error.status === 403) return adminForbidden(error.capability || "administration:write");
        if (error.status === 503) {
          return jsonResponse(
            503,
            config.realtyCasePayloadAuthorityEnabled ? realtyCasePayloadAuthorityFailure() : realtyCaseRequestProjectionFailure(),
          );
        }
        return jsonResponse(400, { kind: "bad_request", message: error.message });
      }
      try {
        const projection = await projectRealtyCaseConditionEntry(result, config);
        return jsonResponse(result.idempotent ? 200 : 201, projection ? { ...result, projection } : result);
      } catch {
        return jsonResponse(503, realtyCaseRequestProjectionFailure(result));
      }
    }
    if (request.method === "POST" && url.pathname === "/api/admin/leads") {
      const result = appendBrokerLeadEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), registry, config);
      return jsonResponse(result.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/leads/assign") {
      const result = appendLeadAssignmentEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/accounts") {
      const result = appendAccountCreationEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/accounts/link") {
      const result = await appendAccountContactLinkEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/documents/outcome") {
      const result = appendDocumentChecklistOutcomeEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/consents/withdraw") {
      const result = appendConsentWithdrawalEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/replies/draft") {
      return jsonResponse(201, await draftReply(parseJsonBody(await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/listings/edit") {
      try {
        const input = parseBody(request, await readRequestBody(request, config.maxBodyBytes));
        const result = await saveListingDraft(currentSeed(config), {
          env: config.authEnv || process.env,
          payload: config.payloadListingRuntime || null,
          principal: config.adminPrincipal,
          input,
          editedAt: config.editedAt,
          requestChannel: config.requestChannel || "admin",
        });
        if (!result.idempotent) {
          recordAudit(
            {
              action: "listing_edited",
              actor: config.adminPrincipal?.id,
              objectType: "listing",
              objectId: result.listingId,
              metadata: {
                changed_fields: result.changedFields,
                source: config.requestChannel === "mcp" ? "mcp_payload_draft" : "admin_payload_draft",
              },
            },
            config,
          );
        }
        return jsonResponse(result.idempotent ? 200 : 201, {
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
        return jsonResponse(error.status || 400, { kind: error.code || "bad_request", message: error.message });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/admin/media/reviews") {
      const result = appendMediaReviewEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/listings/status") {
      try {
        const result = await appendBulkListingStatusChanges(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
        return jsonResponse(result.updated ? 201 : 200, result);
      } catch (error) {
        return jsonResponse(error.status || 400, { kind: error.code || "bad_request", message: error.message });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/admin/listings/publication-schedules") {
      const result = scheduleListingPublication(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.schedule.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/listings/publication-schedules/cancel") {
      const result = cancelScheduledListingPublication(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.cancellation.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/listings/publication-schedules/run-due") {
      const result = runDueListingPublications(config);
      return jsonResponse(200, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/listings/slug") {
      return jsonResponse(201, appendListingSlugChange(registry, parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/viewings") {
      const viewing = await appendViewingBooking(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(viewing.idempotent ? 200 : 201, viewing);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/viewings/follow-up") {
      const result = appendViewingFollowUpEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/seller-pipeline/outcome") {
      const result = appendSellerPipelineOutcomeEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/public-requests/outcome") {
      const result = appendPublicRequestOutcomeEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.idempotent ? 200 : 201, result);
    }
    if (request.method === "GET" && url.pathname === "/api/admin/viewings.ics") {
      const source = await adminLeadSource(config);
      const viewings = leadScopedRows(source)((await adminViewingSource(config)).viewings);
      return calendarResponse(renderViewingCalendar(viewings, { now: config.bookedAt }));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/deals/close") {
      const deal = appendDealClose(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(deal.idempotent ? 200 : 201, deal);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/broker-contacts") {
      return jsonResponse(201, appendBrokerContactApproval(parseJsonBody(await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/tours/approve") {
      return jsonResponse(201, appendTourApprovalRow(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config));
    }
    return jsonResponse(405, { kind: "method_not_allowed" });
  } catch (error) {
    if (error instanceof LeadStoreUnavailableError || error?.code === "lead_store_unavailable") {
      return leadStoreUnavailable();
    }
    if (error instanceof EventStoreUnavailableError || error?.code === "event_store_unavailable") {
      return jsonResponse(503, { kind: "event_store_unavailable", message: "Analytics storage is temporarily unavailable" });
    }
    if (error instanceof ViewingStoreUnavailableError || error?.code === "viewing_store_unavailable") {
      return jsonResponse(503, { kind: "viewing_store_unavailable", message: "Viewing storage is temporarily unavailable" });
    }
    if (error instanceof ViewingConflictError || error?.code === "viewing_conflict") {
      return jsonResponse(409, { kind: "viewing_conflict", message: error.message });
    }
    if (error instanceof ProviderConnectionUnavailableError || error?.code === "provider_connection_unavailable") {
      return jsonResponse(503, { kind: "provider_connection_unavailable", message: "Provider connection storage is unavailable" });
    }
    if (error instanceof ProviderDeliveryError) {
      const status =
        error.code === "provider_delivery_unavailable" || error.code === "provider_delivery_not_connected"
          ? 503
          : ["provider_delivery_uncertain", "provider_delivery_conflict"].includes(error.code)
            ? 409
            : 502;
      return jsonResponse(status, { kind: error.code, message: error.message, receipt: error.receipt || null });
    }
    if (error.status === 413) return jsonResponse(413, { kind: "request_too_large" });
    if (error.status === 403) return adminForbidden(error.capability || "administration:write");
    return adminBadRequest(error);
  }
}
