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
  TWO_FACTOR_SELF_SERVICE_PATHS,
  withAuthenticatedAuditActor,
} from "./admin-auth.mjs";
import {
  OPERATOR_TOKEN_ENV,
  buildOperatorConnectPayload,
  operatorAgentConfigBlock,
  operatorBootstrapPrompt,
  operatorConnectResult,
} from "./operator-connect.mjs";
import { ownerOperatorCatalog } from "./owner-operator-catalog.mjs";
import {
  adminSessionClearCookie,
  adminTokenFromCookie,
} from "./admin-login.mjs";
// B6 workspace security and data: the payload the Settings screen renders its
// Security and Data sections from. The routes themselves are served by
// app-workspace-security.mjs, which delegates to the one implementation —
// and so, now, are /admin/login and /admin/logout.
import { buildWorkspaceSecurityView } from "./workspace-security-view.mjs";
import { renderAppWorkspaceSecurityResponse } from "./app-workspace-security.mjs";
import { CSP_HEADER } from "./security-headers.mjs";
import {
  DEFAULT_ADMIN_SESSION_LEDGER_PATH,
  adminSessionFingerprint,
  adminSessionStates,
  isAdminSessionRevoked,
  readAdminSessionEvents,
  stepUpTokenFromCookie,
} from "./admin-sessions.mjs";
import { DEFAULT_OPERATOR_TWO_FACTOR_PATH, operatorTwoFactorStatus, readOperatorTwoFactorEvents } from "./operator-two-factor.mjs";
import { DEFAULT_WORKSPACE_EXPORT_LEDGER_PATH } from "./workspace-export.mjs";
import { renderAdminTeamPage } from "./admin-team.mjs";
import { buildAdminHermesPayload } from "./admin-hermes.mjs";
import { HermesOwnerCommandError, runHermesOwnerCommand } from "./hermes-owner-command.mjs";
import { renderAdminWorkspaceSettingsPayload } from "./admin-payloads.mjs";
import { approvedContentReviewPayload } from "./approved-content-review.mjs";
import { adminCredentials } from "./admin-auth.mjs";
import { readThroughCached } from "./file-cache.mjs";
import { adminLocales } from "./locales.mjs";
import {
  DEFAULT_WORKSPACE_SETTINGS_PATH,
  applyWorkspaceDefaultBroker,
  buildWorkspaceOnboarding,
  emptyWorkspaceSettingsDocument,
  leadSlaOptions,
  readWorkspaceSettings,
  readWorkspaceSettingsStore,
  updateWorkspaceSettingsStore,
  workspaceSettingsView,
  workspaceSettingsStoreConfigured,
  WorkspaceSettingsStoreUnavailableError,
} from "./workspace-settings.mjs";
import { assignableBrokerProfiles, getPayloadAdminAuthService } from "./payload-admin-auth.mjs";
import {
  ProviderConnectionUnavailableError,
  deleteProviderConnection,
  providerConnectionAvailability,
  providerConnectionConfigFromEnv,
  readProviderConnections,
  readProviderCredentials,
  saveProviderConnection,
  syncViewingToGoogleCalendar,
} from "./provider-connections.mjs";
import { operatorProviderAvailability, operatorProviderConfigFromEnv } from "./operator-provider-catalog.mjs";
import {
  OPERATOR_CONNECTION_AGENT_CONFIG_PATH,
  OPERATOR_CONNECTION_DISCONNECT_PATH,
  isOperatorOAuthProvider,
  operatorConnectionAudit,
  operatorConnectionStart,
  runOperatorConnectionAction,
} from "./operator-connect-routes.mjs";
import { issueOperatorAgentToken } from "./operator-agent-access.mjs";
import { ProviderDeliveryError, deliverApprovedProviderMessage } from "./provider-delivery.mjs";
import { SocialMarketingPublishError, publishApprovedSocialDraft } from "./social-marketing-publishing.mjs";
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
  renderAdminRuntimeUnavailablePayload,
  renderAdminApprovedContentPayload,
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
import { DEFAULT_DEAL_LEDGER_PATH, readDeals } from "./deal-ledger.mjs";
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
import { r2MediaCoverageState } from "./r2-media-coverage.mjs";
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
  leadReadScopeForPrincipal,
  leadDurableStoreConfigFromEnv,
  payloadUserForLeadRead,
  appendConsentEventDurably,
  readConsentEventsDurably,
  readLeadIntakesDurably,
  readSellerPipelineItemsDurably,
} from "./lead-durable-store.mjs";
import {
  LeadOperationStoreUnavailableError,
  isLeadOperationsDurableStoreEnabled,
  leadOperationsDurableStoreConfigFromEnv,
} from "./lead-ops-durable-store.mjs";
import {
  applyLeadBulkOperation,
  consentLedgerFor,
  leadJourneyContextFrom,
  leadOperationLedgers,
  recordDealCloseOperation,
  recordLeadAssignmentOperation,
  recordLeadPipelineOutcomeOperation,
  recordConsentWithdrawalOperation,
  recordLeadSnoozeOperation,
  recordLeadUnsnoozeOperation,
  recordSellerPipelineOutcomeOperation,
} from "./lead-ops-workflows.mjs";
import { normalizeBrokerLeadInput } from "./leads.mjs";
import { projectListingDraftSeed, saveBulkListingStatusDrafts, saveListingDraft } from "./listing-draft-service.mjs";
import {
  DEFAULT_CONSENT_LEDGER_PATH,
  appendConsentRecord,
  createConsentRecord,
  latestConsentStates,
  readConsentLedger,
} from "./consent-ledger.mjs";
import {
  DEFAULT_LEAD_ASSIGNMENT_LEDGER_PATH,
  applyLeadAssignments,
  readLeadAssignments,
} from "./lead-assignments.mjs";
// B1 lead operations: snooze, bulk actions, saved views, Hermes availability.
import { hermesReplyAvailability } from "./hermes-availability.mjs";
import {
  DEFAULT_LEAD_SNOOZE_LEDGER_PATH,
  readLeadSnoozes,
} from "./lead-snoozes.mjs";
import {
  DEFAULT_OPERATOR_VIEW_LEDGER_PATH,
  OPERATOR_VIEW_SURFACES,
  appendOperatorView,
  createOperatorView,
  createOperatorViewDeletion,
  operatorViewsFor,
  readOperatorViews,
} from "./operator-views.mjs";
import { buildLeadMatchingReport } from "./lead-matching.mjs";
import {
  DEFAULT_LEAD_PIPELINE_OUTCOME_LEDGER_PATH,
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
// B4 media upload
import { DEFAULT_MEDIA_UPLOAD_LEDGER_PATH, applyMediaUploads, mediaUploadLimitsFromEnv, readMediaUploads } from "./media-uploads.mjs";
import { createMediaUploadStorage, mediaUploadStorageConfigFromEnv } from "./media-upload-storage.mjs";
import {
  ADMIN_MEDIA_UPLOAD_PATH,
  acceptsHtmlResponse,
  handleAdminMediaUpload,
  listMediaUploads,
  readMediaUploadBytes,
} from "./media-upload-routes.mjs";
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
import { parseCsv } from "./csv.mjs";
import { fromRoot } from "./paths.mjs";
import {
  DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT,
  DEFAULT_REDIRECT_APPROVALS_PATH,
  approvedLaunchFreezeRouteArtifact,
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
import { DEFAULT_LAUNCH_FREEZE_PATH, loadApprovedLaunchFreeze } from "./launch-freeze.mjs";
import { DEFAULT_SAVED_SEARCH_LEDGER_PATH, readSavedSearches } from "./saved-searches.mjs";
import { buildSearchAnalyticsReport } from "./search-analytics.mjs";
import { DEFAULT_SELLER_PIPELINE_PATH, appendSellerPipeline, createSellerPipelineItem, readSellerPipeline } from "./seller-pipeline.mjs";
import {
  DEFAULT_SELLER_PIPELINE_OUTCOME_LEDGER_PATH,
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
import { isFileBackedLeadMutationBlocked } from "./lead-durable-boundary.mjs";
import { productionRuntimeDataUnavailable, runtimeDataUnavailablePayload } from "./runtime-data-boundary.mjs";
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
  deriveViewingFollowUpStates,
  readViewingFollowUps,
} from "./viewing-follow-ups.mjs";
// B5 viewings and availability: broker working hours and the week calendar.
import {
  DEFAULT_BROKER_AVAILABILITY_LEDGER_PATH,
  appendBrokerAvailability,
  brokerAvailabilityDirectory,
  brokerAvailabilityFor,
  canEditBrokerAvailability,
  createBrokerAvailability,
  officeTimeZone,
  readBrokerAvailability,
} from "./broker-availability.mjs";
import { DEFAULT_VIEWING_DURATION_MINUTES } from "./broker-free-slots.mjs";
import { buildViewingWeekView } from "./viewing-week-view.mjs";
import { wholeNumberSlotParam } from "./viewing-slots.mjs";
import {
  readViewingTripContactsDurably,
  readViewingTripRequests,
  readViewingTripRequestsDurably,
  isViewingTripDurableStoreEnabled,
  ViewingTripStoreUnavailableError,
} from "./viewing-trip-requests.mjs";
// B3 saved-search alerts: the broker-facing delivery queue.
import {
  DEFAULT_SAVED_SEARCH_ALERT_DELIVERY_LEDGER_PATH,
  buildSavedSearchAlertDeliveryQueue,
  queueDueSavedSearchAlerts,
  readSavedSearchAlertDeliveries,
} from "./saved-search-alert-deliveries.mjs";
import { buildSavedSearchAlertReport } from "./saved-search-alerts.mjs";
import { publicSeedFor } from "./public-inventory.mjs";
import {
  DEFAULT_SAVED_SEARCH_MANAGE_EVENT_LEDGER_PATH,
  applySavedSearchManageEvents,
  readSavedSearchManageEvents,
} from "./saved-search-manage.mjs";

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "origin-agent-cluster": "?1",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};
// The policy belongs on documents, not on JSON or a CSV download, so it joins
// the HTML headers rather than SECURITY_HEADERS — the same split http.mjs
// makes. The workbench needs nothing this policy forbids: every script and
// stylesheet is same-origin or inline, every fetch is a relative path, and the
// only third-party origins are the two Google Fonts hosts the policy names.
const PRIVATE_HTML_HEADERS = {
  ...SECURITY_HEADERS,
  ...CSP_HEADER,
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};
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
  const durableOnly = env.NODE_ENV === "production" && env.MS_REALTY_RUNTIME_DATA_AUTHORITY === "payload";
  return {
    maxBodyBytes: bytesFrom(env.MS_REALTY_MAX_BODY_BYTES),
    auditLogPath: env.MS_REALTY_AUDIT_LOG_PATH || DEFAULT_AUDIT_LOG_PATH,
    durableListingAuditToFile: env.NODE_ENV !== "production",
    runtimeDataDurableOnly: durableOnly,
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
    launchFreezePath: env.MS_REALTY_LAUNCH_FREEZE_PATH || DEFAULT_LAUNCH_FREEZE_PATH,
    workspaceSettingsPath: env.MS_REALTY_WORKSPACE_SETTINGS_PATH || null,
    workspaceSettingsWorkspaceId: env.MS_REALTY_WORKSPACE_ID || "",
    workspaceSettingsPayloadRuntimeConfigured: Boolean(String(env.PAYLOAD_SECRET || "").trim() && String(env.DATABASE_URL || "").trim()),
    languageRequestPath: env.MS_REALTY_LANGUAGE_REQUEST_LEDGER_PATH || DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH,
    launchReadinessOutputPath: env.MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH,
    leadLedgerPath: env.MS_REALTY_LEAD_LEDGER_PATH || DEFAULT_LEAD_LEDGER_PATH,
    leadAssignmentLedgerPath: env.MS_REALTY_LEAD_ASSIGNMENT_LEDGER_PATH || DEFAULT_LEAD_ASSIGNMENT_LEDGER_PATH,
    leadSnoozeLedgerPath: env.MS_REALTY_LEAD_SNOOZE_LEDGER_PATH || DEFAULT_LEAD_SNOOZE_LEDGER_PATH,
    operatorViewLedgerPath: env.MS_REALTY_OPERATOR_VIEW_LEDGER_PATH || DEFAULT_OPERATOR_VIEW_LEDGER_PATH,
    leadPipelineOutcomeLedgerPath:
      env.MS_REALTY_LEAD_PIPELINE_OUTCOME_LEDGER_PATH || DEFAULT_LEAD_PIPELINE_OUTCOME_LEDGER_PATH,
    leadContactVaultPath:
      env.MS_REALTY_LEAD_CONTACT_VAULT_PATH || (env.NODE_ENV === "production" ? DEFAULT_LEAD_CONTACT_VAULT_PATH : null),
    leadContactKey: env.MS_REALTY_LEAD_CONTACT_KEY,
    leadDurableStore: leadDurableStoreConfigFromEnv(env),
    leadOperationsDurableStore: leadOperationsDurableStoreConfigFromEnv(env),
    publicContactVaultPath:
      env.MS_REALTY_PUBLIC_CONTACT_VAULT_PATH || (env.NODE_ENV === "production" ? DEFAULT_PUBLIC_CONTACT_VAULT_PATH : null),
    publicContactKey: env.MS_REALTY_PUBLIC_CONTACT_KEY || env.MS_REALTY_LEAD_CONTACT_KEY,
    publicRequestOutcomeLedgerPath:
      env.MS_REALTY_PUBLIC_REQUEST_OUTCOME_LEDGER_PATH || DEFAULT_PUBLIC_REQUEST_OUTCOME_LEDGER_PATH,
    listingQualityReviewPath: env.MS_REALTY_LISTING_QUALITY_REVIEW_PATH,
    searchSyncReportPath: env.MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH || env.MS_REALTY_SEARCH_SYNC_REPORT_PATH,
    searchQueryReportPath: env.MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH || env.MS_REALTY_SEARCH_QUERY_REPORT_PATH,
    hermesWorkerReportPath: env.MS_REALTY_HERMES_WORKER_REPORT_PATH,
    liveServiceProvisioningReportPath: env.MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH,
    monitoringRollbackReportPath: env.MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH,
    payloadRuntimeReportPath: env.MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH,
    r2MediaCoverageReportPath: env.MS_REALTY_R2_MEDIA_COVERAGE_REPORT_PATH,
    productionRecoveryReportPath: env.MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH,
    productionRecoverySigningPublicKey: env.MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY,
    localeRegistryPath: env.MS_REALTY_LOCALE_REGISTRY_PATH,
    listingEditLedgerPath: env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || DEFAULT_LISTING_EDIT_LEDGER_PATH,
    mediaReviewLedgerPath: env.MS_REALTY_MEDIA_REVIEW_LEDGER_PATH || DEFAULT_MEDIA_REVIEW_LEDGER_PATH,
    mediaUploadLedgerPath: env.MS_REALTY_MEDIA_UPLOAD_LEDGER_PATH || DEFAULT_MEDIA_UPLOAD_LEDGER_PATH,
    mediaUploadStorageConfig: mediaUploadStorageConfigFromEnv(env),
    mediaUploadLimits: mediaUploadLimitsFromEnv(env, { maxBodyBytes: bytesFrom(env.MS_REALTY_MAX_BODY_BYTES) }),
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
    // B5: the recorded broker week behind the calendar and the public picker.
    brokerAvailabilityLedgerPath: env.MS_REALTY_BROKER_AVAILABILITY_LEDGER_PATH || DEFAULT_BROKER_AVAILABILITY_LEDGER_PATH,
    brokerAvailabilityAt: env.MS_REALTY_BROKER_AVAILABILITY_AT,
    // B6 workspace security and data: the ledgers the Settings screen reads.
    adminSessionLedgerPath: env.MS_REALTY_ADMIN_SESSION_LEDGER_PATH || DEFAULT_ADMIN_SESSION_LEDGER_PATH,
    operatorTwoFactorPath: env.MS_REALTY_OPERATOR_2FA_PATH || DEFAULT_OPERATOR_TWO_FACTOR_PATH,
    workspaceExportLedgerPath: env.MS_REALTY_WORKSPACE_EXPORT_LEDGER_PATH || DEFAULT_WORKSPACE_EXPORT_LEDGER_PATH,
    auditRetentionWindowDays: env.MS_REALTY_AUDIT_RETENTION_DAYS,
    securityAt: env.MS_REALTY_SECURITY_AT,
    // B3: the saved-search alert queue a broker works from.
    savedSearchManageEventLedgerPath:
      env.MS_REALTY_SAVED_SEARCH_MANAGE_EVENT_LEDGER_PATH || DEFAULT_SAVED_SEARCH_MANAGE_EVENT_LEDGER_PATH,
    savedSearchAlertDeliveryLedgerPath:
      env.MS_REALTY_SAVED_SEARCH_ALERT_DELIVERY_LEDGER_PATH || DEFAULT_SAVED_SEARCH_ALERT_DELIVERY_LEDGER_PATH,
    savedSearchAlertQueuedAt: env.MS_REALTY_SAVED_SEARCH_ALERT_QUEUED_AT,
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
  return new Response(JSON.stringify({ kind: error?.code || "bad_request", message: error.message }), {
    status: error?.status || 400,
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

function renderAdminHtmlResponse(payload) {
  return new Response(renderHtmlPage(payload, { bodyHtml: renderReactAdminBody(payload) }), {
    status: payload.status || 200,
    headers: PRIVATE_HTML_HEADERS,
  });
}

// Workspace settings: read through the committed defaults or the configured
// ledger; every admin HTML page carries the privacy-safe view so the renderer
// can apply the default locale, timezone and date format.
function workspaceSettingsFor(config = {}) {
  const filePath = config.workspaceSettingsPath || DEFAULT_WORKSPACE_SETTINGS_PATH;
  return readThroughCached(filePath, () => readWorkspaceSettings(filePath));
}

function withWorkspaceSettings(payload, config) {
  return payload && typeof payload === "object" && !payload.workspace_settings
    ? { ...payload, workspace_settings: workspaceSettingsView(workspaceSettingsFor(config)) }
    : payload;
}

function withOwnerProfile(payload, config) {
  if (!payload || typeof payload !== "object" || payload.owner_profile) return payload;
  const principal = config.adminPrincipal || {};
  const user = config.payloadAdminSession?.user || {};
  const roles = Array.isArray(principal.roles) ? principal.roles.map(String).filter(Boolean) : [];
  const workspaceIds = Array.isArray(principal.workspace_ids)
    ? principal.workspace_ids.map(String).filter(Boolean)
    : [];
  return {
    ...payload,
    owner_profile: {
      id: String(principal.id || ""),
      name: String(user.name || principal.name || "").trim(),
      email: String(user.email || principal.email || "").trim().toLowerCase(),
      roles,
      workspace_ids: workspaceIds,
      full_workspace_access: roles.includes("admin") && workspaceIds.length === 0,
    },
  };
}

function adminLocaleParam(url, config = {}) {
  return url.searchParams.get("locale") || workspaceSettingsFor(config).sections.workspace.default_locale || "en";
}

async function workspaceTeamSize(config) {
  if (config.payloadAdminSession) {
    try {
      const service = await configuredPayloadAdminAuth(config);
      if (service) return { size: (await service.listOperators(config.payloadAdminSession)).length, known: true };
    } catch {
      // Fall through to the credential registry.
    }
  }
  try {
    const operators = new Set(adminCredentials(config.authEnv || process.env).map((credential) => credential.id));
    if (operators.size) return { size: operators.size, known: true };
  } catch {
    // An invalid registry is reported by the auth layer; onboarding stays conservative.
  }
  return { size: 1, known: false };
}

async function workspaceConnectedProviders(config) {
  try {
    const providerConfig = config.providerConnection || providerConnectionConfigFromEnv(config.authEnv || process.env);
    if (!providerConnectionAvailability(providerConfig).store.ready) return [];
    return await (config.readProviderConnections || readProviderConnections)({ payload: config.providerConnectionPayload || null });
  } catch {
    return [];
  }
}

async function workspaceOnboardingFor(page, config) {
  const [team, providerConnections] = await Promise.all([workspaceTeamSize(config), workspaceConnectedProviders(config)]);
  return buildWorkspaceOnboarding({
    settings: workspaceSettingsFor(config),
    teamSize: team.size,
    teamSizeKnown: team.known,
    providerConnections,
    replyDeliveryStates: page.replyDeliveryQueue?.states || [],
  });
}

// B6: the Security and Data sections render only when this payload is present.
// Without it the settings screen looks like a workspace with no second factor,
// no session list, no export and no retention preview — while every one of
// those APIs is live and answering.
function workspaceSecurityFor(url, config) {
  return buildWorkspaceSecurityView(config.adminPrincipal, {
    currentFingerprint: config.adminSessionFingerprint || "",
    notice: url.searchParams.get("security"),
    stepUpActive: config.adminStepUpActive === true,
    now: config.securityAt || config.reviewedAt || config.receivedAt || new Date().toISOString(),
    auditLogPath: config.auditLogPath,
    adminSessionLedgerPath: config.adminSessionLedgerPath,
    operatorTwoFactorPath: config.operatorTwoFactorPath,
    workspaceExportLedgerPath: config.workspaceExportLedgerPath,
    auditRetentionWindowDays: config.auditRetentionWindowDays,
    runtimeDataDurableOnly: config.runtimeDataDurableOnly,
  });
}

function workspaceSettingsPayload(
  registry,
  url,
  config,
  {
    requestedLocale = adminLocaleParam(url, config),
    form = null,
    settings = workspaceSettingsFor(config),
    writable = Boolean(config.workspaceSettingsPath) && !config.runtimeDataDurableOnly,
    onboarding = null,
  } = {},
) {
  return withWorkspaceSettings(
    renderAdminWorkspaceSettingsPayload(registry, requestedLocale, {
      settings,
      operator: config.adminPrincipal,
      brokerProfiles: config.brokerProfiles || [],
      adminLocales: adminLocales(registry),
      saved: url.searchParams.get("saved"),
      form,
      writable,
      onboarding,
      // B6 workspace security and data
      security: workspaceSecurityFor(url, config),
    }),
    config,
  );
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: PRIVATE_JSON_HEADERS });
}

async function configuredPayloadAdminAuth(config) {
  const configured = config.payloadAdminAuth;
  if (!configured) return null;
  return typeof configured === "function" ? configured() : configured;
}

// What /admin/login and /admin/logout need from this adapter's configuration
// when they are answered by the shared runtime. Everything else that runtime
// reads it derives from the environment itself; forwarding only these keeps a
// caller that pins a ledger, a clock or an auth service — a test, or a future
// runtime — pinning it for the sign-in path too.
const ADMIN_AUTH_CONFIG_KEYS = [
  "adminAuthLogger",
  "adminSessionLedgerPath",
  "auditLogPath",
  "nowSeconds",
  "operatorTwoFactorKey",
  "operatorTwoFactorPath",
  "payloadAdminAuth",
  "runtimeDataDurableOnly",
  "securityAt",
  "signInRateLimit",
  "trustProxy",
];

function adminAuthOverrides(config = {}) {
  const overrides = {};
  for (const key of ADMIN_AUTH_CONFIG_KEYS) if (config[key] !== undefined) overrides[key] = config[key];
  return overrides;
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
  if (config.runtimeDataDurableOnly) return loadCmsSeed();
  return applyMediaReviews(
    // B4: uploaded listing assets join the seed before reviews are applied, so
    // an upload enters the existing review queue instead of bypassing it.
    applyMediaUploads(
      applyListingEdits(loadCmsSeed(), readListingEdits(config.listingEditLedgerPath)),
      readMediaUploads(config.mediaUploadLedgerPath),
    ),
    readMediaReviews(config.mediaReviewLedgerPath),
  );
}

// Durable lead operations are active only when the operator asked for them AND
// the runtime is configured. Anything short of that keeps the file ledgers, and
// the boundary keeps refusing the routes rather than writing to a disk that is
// about to be wiped.
function leadOperationsDurable(config) {
  const store = config.leadOperationsDurableStore || {};
  if (!store.leadOperationsDurableStoreEnabled) return false;
  if (!isLeadOperationsDurableStoreEnabled(store)) {
    throw new LeadOperationStoreUnavailableError("Durable lead operation store is enabled but not fully configured");
  }
  return true;
}

function leadOperationLedgersFor(config) {
  const store = config.leadOperationsDurableStore || {};
  return leadOperationLedgers({
    durable: leadOperationsDurable(config),
    payload: config.leadOperationsPayload || config.leadDurablePayload || null,
    workspaceId: store.workspaceId,
    paths: {
      snooze: config.leadSnoozeLedgerPath,
      assignment: config.leadAssignmentLedgerPath,
      leadPipelineOutcome: config.leadPipelineOutcomeLedgerPath,
      sellerPipelineOutcome: config.sellerPipelineOutcomeLedgerPath,
      deal: config.dealLedgerPath,
    },
    ...(config.readLeadOperationsDurably ? { readOperations: config.readLeadOperationsDurably } : {}),
    ...(config.appendLeadOperationDurably ? { appendOperations: config.appendLeadOperationDurably } : {}),
  });
}

// Consent withdrawal has a durable home already: the consent_events collection
// durable intake writes into. It goes durable together with the other lead
// operations, and only while intake owns the consents.
function consentLedgerForConfig(config) {
  const durable = leadOperationsDurable(config) && config.leadDurableStore?.leadDurableStoreEnabled === true;
  return consentLedgerFor({
    durable,
    filePath: config.consentLedgerPath,
    payload: config.leadDurablePayload || null,
    workspaceId: config.leadDurableStore?.workspaceId,
    readConsentEvents: config.readConsentEventsDurably || readConsentEventsDurably,
    appendConsentEvent: config.appendConsentEventDurably || appendConsentEventDurably,
  });
}

// The seller pipeline items themselves are created at intake. Durable intake
// already stores them as seller_pipeline_events, so that is where they are read
// from once the lead store owns the leads.
async function sellerPipelineItems(config, source = null) {
  const durableStore = config.leadDurableStore || {};
  // Only once the durable operations store owns the seller outcomes does the
  // pipeline it acts on come from Postgres; otherwise this stays the file read
  // it has always been.
  if (!leadOperationsDurable(config) || !durableStore.leadDurableStoreEnabled) {
    return readSellerPipeline(config.sellerPipelinePath);
  }
  const items = await (config.readSellerPipelineItemsDurably || readSellerPipelineItemsDurably)({
    payload: config.leadDurablePayload || null,
    workspaceId: durableStore.workspaceId,
  });
  if (!Array.isArray(items)) throw new LeadStoreUnavailableError("Durable seller pipeline readback returned invalid rows");
  if (!source?.leads) return items;
  const leadIds = new Set(source.leads.map((lead) => lead.lead_id));
  return items.filter((item) => leadIds.has(item.lead_id));
}

// The journey's leads: the plain file ledger while intake is file-backed (which
// is what this context has always used), the durable leads once it is not.
async function leadJourneySource(config) {
  if (!config.leadDurableStore?.leadDurableStoreEnabled) {
    return { durable: false, leads: readLeadLedger(config.leadLedgerPath) };
  }
  return adminLeadSource(config);
}

async function leadJourneyContext(config, source = null) {
  const ledgers = leadOperationLedgersFor(config);
  const leadSource = source || (await leadJourneySource(config));
  const filterRows = leadScopedRows(leadSource);
  const viewingSource = await adminViewingSource(config);
  try {
    const assignments = filterRows(await ledgers.assignments.read());
    const context = await leadJourneyContextFrom({
      ledgers,
      leads: applyLeadAssignments(leadSource.leads, assignments),
      viewings: filterRows(viewingSource.viewings),
      viewingFollowUps:
        viewingSource.durable || config.runtimeDataDurableOnly
          ? []
          : filterRows(readViewingFollowUps(config.viewingFollowUpLedgerPath)),
      sellerPipelines: await sellerPipelineItems(config, leadSource),
    });
    return {
      ...context,
      outcomes: filterRows(context.outcomes),
      deals: filterRows(context.deals),
      sellerPipelineOutcomes: filterRows(context.sellerPipelineOutcomes),
    };
  } catch (error) {
    if (
      !ledgers.durable ||
      error instanceof LeadOperationStoreUnavailableError ||
      error instanceof LeadStoreUnavailableError ||
      error instanceof ViewingStoreUnavailableError
    ) {
      throw error;
    }
    throw new LeadOperationStoreUnavailableError("Durable lead operations read failed", error);
  }
}

function currentListingQualityReport(config, options = {}) {
  return buildListingQualityReport({
    seed: currentSeed(config),
    tourApprovals: readTourApprovals(config.tourApprovalLedgerPath),
    ...options,
  });
}

async function authoritativeListingQualityReport(config, options = {}) {
  if (!config.runtimeDataDurableOnly) return currentListingQualityReport(config, options);
  return buildListingQualityReport({
    seed: await projectListingDraftSeed(currentSeed(config), {
      payload: config.payloadListingRuntime || null,
      env: config.payloadListingEnv || config.authEnv || process.env,
      requirePayload: true,
    }),
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

function recordDurableListingAudit(input, config, recordedAt = auditRecordedAt(config)) {
  try {
    const entry = createAuditLogEntry(withAuthenticatedAuditActor(input, config.adminPrincipal), recordedAt);
    if (config.durableListingAuditToFile !== false) {
      appendAuditLog(entry, { filePath: config.auditLogPath });
    } else {
      (config.durableListingAuditLogger || console.info)(
        JSON.stringify({
          kind: "durable_listing_mutation",
          authority: "payload_postgres",
          receipt: "listing.workflow.last_edit_event",
          ...entry,
        }),
      );
    }
    return entry;
  } catch {
    // Payload's listing version is authoritative. A replica/telemetry failure
    // must never turn an already committed durable mutation into an API error.
    return null;
  }
}

function recordAuditReplica(input, config, recordedAt, alreadyRecorded, bestEffort) {
  try {
    if (bestEffort && config.runtimeDataDurableOnly) return true;
    if (!readAuditLog(config.auditLogPath).some(alreadyRecorded)) recordAudit(input, config, recordedAt);
    return false;
  } catch (error) {
    if (bestEffort) return true;
    throw error;
  }
}

async function publicRequestContactData(config) {
  let contactMaps = {};
  let contactVaultStatus = "not_configured";
  if (config.publicContactVaultPath) {
    try {
      contactMaps = {
        saved_search: readPublicContacts(config.publicContactVaultPath, config.publicContactKey, "saved_search"),
        language_request: readPublicContacts(config.publicContactVaultPath, config.publicContactKey, "language_request"),
      };
      const count = [...contactMaps.saved_search.values(), ...contactMaps.language_request.values()].length;
      contactVaultStatus = count ? "available" : "empty";
    } catch {
      contactMaps = {};
      contactVaultStatus = "locked";
    }
  }
  if (!config.viewingDurableStore?.viewingDurableStoreEnabled) {
    if (config.publicContactVaultPath) {
      try {
        contactMaps.viewing_trip = readPublicContacts(config.publicContactVaultPath, config.publicContactKey, "viewing_trip");
        if (contactVaultStatus !== "locked") {
          const count = Object.values(contactMaps).reduce((total, map) => total + [...(map?.values?.() || [])].length, 0);
          contactVaultStatus = count ? "available" : "empty";
        }
      } catch {
        if (contactVaultStatus !== "locked") {
          contactMaps = {};
          contactVaultStatus = "locked";
        }
      }
    }
    return { contactMaps, contactVaultStatus };
  }
  const durableStore = config.viewingDurableStore || {};
  if (!isViewingTripDurableStoreEnabled(durableStore)) {
    throw new ViewingTripStoreUnavailableError("Durable viewing trip store is enabled but not fully configured");
  }
  const scope = leadReadScopeForPrincipal(config.adminPrincipal, durableStore.workspaceId);
  contactMaps.viewing_trip = await (config.readViewingTripContactsDurably || readViewingTripContactsDurably)({
    contactSecret: durableStore.contactSecret,
    payload: config.viewingDurablePayload || null,
    user: payloadUserForLeadRead(config.adminPrincipal, config.payloadAdminSession?.user || null),
    workspaceIds: scope.workspaceIds,
  });
  if (contactVaultStatus !== "locked") {
    const count = Object.values(contactMaps).reduce((total, map) => total + [...(map?.values?.() || [])].length, 0);
    contactVaultStatus = count ? "available" : "empty";
  }
  return { contactMaps, contactVaultStatus };
}

async function publicRequestViewingTrips(config) {
  if (!config.viewingDurableStore?.viewingDurableStoreEnabled) {
    return readViewingTripRequests(config.viewingTripLedgerPath || undefined);
  }
  const durableStore = config.viewingDurableStore || {};
  if (!isViewingTripDurableStoreEnabled(durableStore)) {
    throw new ViewingTripStoreUnavailableError("Durable viewing trip store is enabled but not fully configured");
  }
  const scope = leadReadScopeForPrincipal(config.adminPrincipal, durableStore.workspaceId);
  return (config.readViewingTripRequestsDurably || readViewingTripRequestsDurably)({
    payload: config.viewingDurablePayload || null,
    user: payloadUserForLeadRead(config.adminPrincipal, config.payloadAdminSession?.user || null),
    workspaceIds: scope.workspaceIds,
  });
}

async function currentPublicRequestQueue(config) {
  const viewingTrips = await publicRequestViewingTrips(config);
  return buildPublicRequestQueue({
    savedSearches: readSavedSearches(config.savedSearchLedgerPath),
    languageRequests: readLanguageRequests(config.languageRequestPath),
    viewingTrips,
    outcomes: readPublicRequestOutcomes(config.publicRequestOutcomeLedgerPath),
    ...(await publicRequestContactData(config)),
    now: config.publicRequestOutcomeAt || config.reviewedAt || new Date().toISOString(),
  });
}

async function adminLeadSource(config) {
  const durableStore = config.leadDurableStore || {};
  if (!durableStore.leadDurableStoreEnabled) {
    if (config.runtimeDataDurableOnly) {
      throw new LeadStoreUnavailableError("Production admin leads require the durable store");
    }
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
  const scope = leadReadScopeForPrincipal(config.adminPrincipal, durableStore.workspaceId);
  try {
    const leads = await (config.readLeadIntakesDurably || readLeadIntakesDurably)({
      admin: scope.admin,
      contactSecret: durableStore.contactSecret,
      payload: config.leadDurablePayload || null,
      user: payloadUserForLeadRead(config.adminPrincipal, config.payloadAdminSession?.user || null),
      workspaceIds: scope.workspaceIds,
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
    if (config.runtimeDataDurableOnly) {
      throw new ViewingStoreUnavailableError("Production admin viewings require the durable store");
    }
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

// ---- B5 broker availability and the week calendar ------------------------
function availabilityNow(config) {
  return (
    config.brokerAvailabilityAt ||
    config.viewingFollowUpAt ||
    config.bookedAt ||
    config.reviewedAt ||
    config.receivedAt ||
    new Date().toISOString()
  );
}

function availabilityRows(config) {
  return readBrokerAvailability(config.brokerAvailabilityLedgerPath || undefined);
}

function knownBrokerIds(config) {
  return (config.brokerProfiles || []).map((profile) => profile.id);
}

// Viewings already on a calendar, with their current state: a rescheduled
// viewing must block its new time, not its original one.
async function scheduledViewings(config) {
  const source = await adminViewingSource(config);
  if (source.durable) return source.viewings;
  return deriveViewingFollowUpStates(source.viewings, readViewingFollowUps(config.viewingFollowUpLedgerPath || undefined));
}

function brokerAvailabilityPayload(url, config) {
  const rows = availabilityRows(config);
  const requested = String(url.searchParams.get("broker") || "").trim();
  const brokerIds = requested ? [requested] : knownBrokerIds(config);
  return {
    kind: "admin_broker_availability",
    timezone: officeTimeZone(),
    brokers: brokerAvailabilityDirectory(rows, brokerIds),
    history: requested ? rows.filter((row) => row.broker_id === requested) : rows,
    editable_brokers: brokerIds.filter((brokerId) => canEditBrokerAvailability(config.adminPrincipal, brokerId)),
  };
}

// A broker may set their own hours; a manager may set anyone's.
function recordBrokerAvailability(input, config) {
  const submitted = bindAuthenticatedOperator(input, config.adminPrincipal);
  const brokerId = String(submitted.brokerId ?? submitted.broker_id ?? submitted.broker ?? "").trim();
  if (!canEditBrokerAvailability(config.adminPrincipal, brokerId)) {
    throw Object.assign(new Error("Broker availability requires broker_availability:own"), {
      status: 403,
      capability: "broker_availability:own",
    });
  }
  const recordedAt = availabilityNow(config);
  const record = createBrokerAvailability({ ...submitted, brokerId }, { recordedAt });
  const persisted = appendBrokerAvailability(record, { filePath: config.brokerAvailabilityLedgerPath || undefined });
  if (!persisted.idempotent) {
    recordAudit(
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
          self_service: config.adminPrincipal?.id === record.broker_id,
        },
      },
      config,
      recordedAt,
    );
  }
  return {
    status: persisted.idempotent ? 200 : 201,
    body: {
      kind: "admin_broker_availability_recorded",
      availability: persisted,
      resolved: brokerAvailabilityFor([persisted], record.broker_id),
    },
  };
}

async function viewingWeekPayload(url, config) {
  const now = availabilityNow(config);
  const viewings = await scheduledViewings(config);
  return {
    kind: "admin_viewing_week",
    week: buildViewingWeekView({
      availabilityRows: availabilityRows(config),
      brokers: knownBrokerIds(config),
      viewings,
      viewingFollowUpQueue: buildViewingFollowUpQueue(
        viewings,
        readViewingFollowUps(config.viewingFollowUpLedgerPath || undefined),
        { now },
      ),
      week: url.searchParams.get("week"),
      now,
      durationMinutes: wholeNumberSlotParam(url.searchParams.get("duration"), DEFAULT_VIEWING_DURATION_MINUTES),
    }),
  };
}

// ---- B3 saved-search alert delivery --------------------------------------
// The intake rows with every visitor change folded in. Deleted searches
// disappear here, which is what stops their alerts.
function adminSavedSearches(config) {
  return applySavedSearchManageEvents(
    readSavedSearches(config.savedSearchLedgerPath || undefined),
    readSavedSearchManageEvents(config.savedSearchManageEventLedgerPath || undefined),
  );
}

function adminSavedSearchAlertDeliveries(config) {
  return config.savedSearchAlertDeliveryLedgerPath
    ? readSavedSearchAlertDeliveries(config.savedSearchAlertDeliveryLedgerPath)
    : [];
}

function savedSearchAlertQueue(config, queuedAt) {
  return buildSavedSearchAlertDeliveryQueue({
    savedSearches: adminSavedSearches(config),
    deliveries: adminSavedSearchAlertDeliveries(config),
    now: queuedAt,
  });
}

// Queues the alerts that are due. This route creates broker work; it never
// sends anything, which is why `delivered` is stated as zero rather than
// omitted.
async function runDueSavedSearchAlerts(config) {
  const queuedAt = config.savedSearchAlertQueuedAt || config.reviewedAt || config.receivedAt || new Date().toISOString();
  const savedSearches = adminSavedSearches(config);
  const alertReport = buildSavedSearchAlertReport({
    registry: loadLocaleRegistry(config.localeRegistryPath),
    seed: publicSeedFor(currentSeed(config)),
    savedSearches,
    requestOutcomes: readPublicRequestOutcomes(config.publicRequestOutcomeLedgerPath || undefined),
    translationTasks: config.runtimeDataDurableOnly ? [] : readTranslationLedger(config.translationLedgerPath),
    generatedAt: queuedAt,
  });
  const run = queueDueSavedSearchAlerts({
    savedSearches,
    alertReport,
    filePath: config.savedSearchAlertDeliveryLedgerPath,
    queuedAt,
  });
  for (const delivery of run.queued) {
    recordAudit(
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
      config,
      queuedAt,
    );
  }
  return { kind: "saved_search_alert_run", ...run, delivered: 0, queue: savedSearchAlertQueue(config, queuedAt) };
}

function rowsForLeadIds(rows, leadIds) {
  return rows.filter((row) => leadIds.has(row.lead_id));
}

function leadScopedRows(source) {
  if (!source.durable) return (rows) => rows;
  const leadIds = new Set(source.leads.map((lead) => lead.lead_id));
  return (rows) => rowsForLeadIds(rows, leadIds);
}

// B1: what the lead inbox may actually do here, derived from configuration and
// the authenticated principal. A surface that cannot reach a route keeps the
// control's disabled treatment instead of pretending.
function leadOperationsFor(config) {
  const principal = config.adminPrincipal;
  const writable =
    canAdminAccess(principal, "operations:write") &&
    (!config.runtimeDataDurableOnly || leadOperationsDurable(config));
  return {
    snoozeWritable: writable,
    bulkWritable: writable,
    savedViewsWritable: !config.runtimeDataDurableOnly && writable && Boolean(principal?.id),
  };
}

async function authoritativeListingCount(config) {
  const listingSeed = config.runtimeDataDurableOnly
    ? await projectListingDraftSeed(currentSeed(config), {
        payload: config.payloadListingRuntime || null,
        env: config.payloadListingEnv || config.authEnv || process.env,
        requirePayload: true,
      })
    : currentSeed(config);
  return listingSeed.records.filter((record) => record.collection === "listings").length;
}

async function hermesBusinessContext(config) {
  const env = config.authEnv || process.env;
  const generatedAt = config.reviewedAt || new Date().toISOString();
  const leadSource = await adminLeadSource(config);
  const journey = await leadJourneyContext(config, leadSource);
  const leadPipelineQueue = buildLeadPipelineQueue(journey, {
    now: config.leadPipelineOutcomeAt || config.reviewedAt || config.bookedAt || new Date().toISOString(),
  });
  const sellerPipelineQueue = buildSellerPipelineQueue(journey.sellerPipelines, journey.sellerPipelineOutcomes, {
    now: config.sellerPipelineOutcomeAt || config.reviewedAt || config.bookedAt || new Date().toISOString(),
  });
  const viewingFollowUpQueue = buildViewingFollowUpQueue(journey.viewings, journey.viewingFollowUps, {
    now: config.viewingFollowUpAt || config.bookedAt || config.reviewedAt || new Date().toISOString(),
  });
  const listingTotal = await authoritativeListingCount(config);
  const providerConfig = config.providerConnection || providerConnectionConfigFromEnv(env);
  const providers = new Map();
  if (providerConnectionAvailability(providerConfig).store.ready) {
    try {
      const connections = await (config.readProviderConnections || readProviderConnections)({
        payload: config.providerConnectionPayload || null,
      });
      for (const connection of connections) {
        if (connection?.status !== "connected") continue;
        providers.set(String(connection.provider), {
          id: String(connection.provider),
          status: String(connection.status),
          scopes: Array.isArray(connection.scopes) ? connection.scopes.map(String) : [],
            last_verified_at: connection.last_verified_at || null,
          });
        }
    } catch (error) {
      if (error instanceof ProviderConnectionUnavailableError) throw error;
      throw new ProviderConnectionUnavailableError("Provider connection storage is unavailable", error);
    }
  }
  if (String(env.HERMES_CHAT_COMPLETIONS_URL || "").trim() && String(env.HERMES_API_KEY || "").trim()) {
    const mode = String(env.HERMES_PROVIDER_MODE || "self_hosted").trim() || "self_hosted";
    providers.set(mode === "openrouter" ? "openrouter" : "hermes", {
      id: mode === "openrouter" ? "openrouter" : "hermes",
      status: "configured",
      scopes: ["chat.completions"],
      last_verified_at: null,
    });
  }
  return {
    generated_at: generatedAt,
    authoritative_state: {
      status: "available",
      source: config.runtimeDataDurableOnly ? "payload_postgres" : "workspace_runtime",
      authoritative: true,
    },
    counts: {
      leads: journey.leads.length,
      pipeline: leadPipelineQueue.summary.open + sellerPipelineQueue.summary.open,
      tasks: viewingFollowUpQueue.summary.open,
      listings: listingTotal,
    },
    providers: [...providers.values()],
  };
}

function operatorViewsForConfig(config, surface = null) {
  const operatorId = config.adminPrincipal?.id || null;
  if (!operatorId || config.runtimeDataDurableOnly) return [];
  try {
    return operatorViewsFor(readOperatorViews(config.operatorViewLedgerPath), operatorId, surface);
  } catch {
    return [];
  }
}

async function leadInboxPayload(registry, url, config) {
  const source = await adminLeadSource(config);
  const filterRows = leadScopedRows(source);
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
    } catch (error) {
      if (error instanceof ProviderConnectionUnavailableError) throw error;
      throw new ProviderConnectionUnavailableError("Provider connection storage is unavailable", error);
    }
  }
  if (source.durable && config.runtimeDataDurableOnly) {
    const seed = await projectListingDraftSeed(loadCmsSeed(), {
      env: config.authEnv || process.env,
      payload: config.payloadListingRuntime || null,
      requirePayload: true,
    });
    const journey = await leadJourneyContext(config, source);
    const leadPipelineQueue = buildLeadPipelineQueue(journey, {
      now: config.leadPipelineOutcomeAt || config.reviewedAt || config.bookedAt || new Date().toISOString(),
    });
    const ledgers = leadOperationLedgersFor(config);
    const viewings = journey.viewings;
    const viewingFollowUpQueue = buildViewingFollowUpQueue(viewings, journey.viewingFollowUps, {
      now: config.viewingFollowUpAt || config.bookedAt || config.reviewedAt || new Date().toISOString(),
    });
    return {
      ...renderAdminLeadsPayload(registry, url.searchParams.get("locale") || "en", {
        leads: journey.leads,
        leadPipelineQueue,
        replies: [],
        communicationThreads: [],
        communicationTemplates: Object.fromEntries(
          journey.leads.map((lead) => [lead.lead_id, communicationTemplatesForLead(lead)]),
        ),
        languageRequests: [],
        translationTasks: [],
        listingEdits: [],
        leadMatching: buildLeadMatchingReport({
          registry,
          seed,
          leads: journey.leads,
          leadPipelineStates: leadPipelineQueue.states,
          generatedAt: config.reviewedAt || new Date().toISOString(),
        }),
        operatorId: config.adminPrincipal || null,
        leadSourceDurable: true,
        providerConnections,
        viewings,
        viewingFollowUpWritable: false,
        viewingFollowUpQueue,
        savedSearches: [],
        sellerPipeline: journey.sellerPipelines,
        sellerPipelineQueue: buildSellerPipelineQueue(journey.sellerPipelines, journey.sellerPipelineOutcomes, {
          now: config.sellerPipelineOutcomeAt || config.reviewedAt || config.bookedAt || new Date().toISOString(),
        }),
        deals: journey.deals,
        brokerContacts: [],
        brokerProfiles: config.brokerProfiles || [],
        leadSnoozes: filterRows(await ledgers.snoozes.read()),
        dataAvailability: {
          replies: { status: "unavailable", reason_key: "durable_projection_unavailable" },
          communicationThreads: { status: "unavailable", reason_key: "durable_projection_unavailable" },
          languageRequests: { status: "unavailable", reason_key: "durable_projection_unavailable" },
          translationTasks: { status: "unavailable", reason_key: "durable_projection_unavailable" },
          savedSearches: { status: "unavailable", reason_key: "durable_projection_unavailable" },
          brokerContacts: { status: "unavailable", reason_key: "durable_projection_unavailable" },
        },
        hermes: hermesReplyAvailability({ env: config.authEnv || process.env }),
        leadOperations: leadOperationsFor(config),
        operatorViews: [],
      }),
      runtime_data_mode: "durable_only",
    };
  }
  const leads = applyLeadAssignments(source.leads, filterRows(readLeadAssignments(config.leadAssignmentLedgerPath)));
  const replies = filterRows(readReplyOutbox(config.replyOutboxPath));
  const replyDeliveryOutcomes = filterRows(readReplyDeliveryOutcomes(config.replyDeliveryOutcomeLedgerPath));
  const viewingSource = await adminViewingSource(config);
  const viewings = filterRows(viewingSource.viewings);
  const viewingFollowUps = filterRows(readViewingFollowUps(config.viewingFollowUpLedgerPath));
  const deals = filterRows(readDeals(config.dealLedgerPath));
  const sellerPipeline = filterRows(readSellerPipeline(config.sellerPipelinePath));
  const sellerPipelineOutcomes = filterRows(readSellerPipelineOutcomes(config.sellerPipelineOutcomeLedgerPath));
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
    publicRequestQueue: await currentPublicRequestQueue(config),
    sellerPipeline,
    sellerPipelineQueue: buildSellerPipelineQueue(sellerPipeline, sellerPipelineOutcomes, {
      now: config.sellerPipelineOutcomeAt || config.reviewedAt || config.bookedAt || new Date().toISOString(),
    }),
    deals,
    brokerContacts: readBrokerContacts(config.brokerContactLedgerPath),
    brokerProfiles: config.brokerProfiles || [],
    leadSnoozes: readLeadSnoozes(config.leadSnoozeLedgerPath),
    hermes: hermesReplyAvailability({ env: config.authEnv || process.env }),
    leadOperations: leadOperationsFor(config),
    operatorViews: operatorViewsForConfig(config, "leads"),
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
    ...(config.runtimeDataDurableOnly ? { runtime_data_mode: "durable_only" } : {}),
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
    requirePayload: config.runtimeDataDurableOnly,
  });
  const translationTasks = config.runtimeDataDurableOnly
    ? []
    : latestTranslationTasks(readTranslationLedger(config.translationLedgerPath));
  const payload = renderAdminListingManagerPayload(registry, url.searchParams.get("locale") || "en", {
    seed,
    translationTasks,
    generatedAt: config.reviewedAt || new Date().toISOString(),
    operatorId: config.adminPrincipal || null,
    publicationScheduleQueue: buildListingPublicationScheduleQueue(
      config.runtimeDataDurableOnly ? [] : readListingPublicationSchedules(config.listingPublicationSchedulePath),
      { now: config.listingPublicationAt || config.reviewedAt || new Date().toISOString() },
    ),
    query: url.searchParams.get("q") || "",
    status: url.searchParams.get("status") || "",
    sourceLocale: url.searchParams.get("sourceLocale") || "",
    propertyFamily: url.searchParams.get("propertyFamily") || "",
    factRow: url.searchParams.get("factRow") || "",
    factQuery: url.searchParams.get("factQ") || "",
    page: url.searchParams.get("page") || 1,
  });
  return config.runtimeDataDurableOnly
    ? {
        ...payload,
        runtime_data_mode: "durable_only",
        dataAvailability: {
          publicationSchedules: { status: "unavailable", reason_key: "durable_projection_unavailable" },
          slugHistory: { status: "unavailable", reason_key: "durable_projection_unavailable" },
          translationTasks: { status: "unavailable", reason_key: "durable_projection_unavailable" },
        },
        listings: payload.listings.map((row) => ({ ...row, translation_review_required: null })),
        publicationSchedules: null,
        summary: { ...payload.summary, translationReviewRequired: null },
      }
    : payload;
}

async function listingEditorPayload(registry, url, config) {
  const seed = await projectListingDraftSeed(currentSeed(config), {
    env: config.authEnv || process.env,
    payload: config.payloadListingRuntime || null,
    requirePayload: config.runtimeDataDurableOnly,
  });
  const payload = renderAdminListingEditorPayload(
    registry,
    url.searchParams.get("locale") || "en",
    seed,
    url.searchParams.get("listingId"),
    config.runtimeDataDurableOnly ? [] : readListingEdits(config.listingEditLedgerPath),
    config.runtimeDataDurableOnly ? [] : latestTranslationTasks(readTranslationLedger(config.translationLedgerPath)),
    config.runtimeDataDurableOnly ? [] : readTourApprovals(config.tourApprovalLedgerPath),
    config.adminPrincipal || null,
  );
  return config.runtimeDataDurableOnly
    ? {
        ...payload,
        runtime_data_mode: "durable_only",
        dataAvailability: {
          listingEdits: { status: "unavailable", reason_key: "durable_projection_unavailable" },
          slugHistory: { status: "unavailable", reason_key: "durable_projection_unavailable" },
          tourApprovals: { status: "unavailable", reason_key: "durable_projection_unavailable" },
          translationTasks: { status: "unavailable", reason_key: "durable_projection_unavailable" },
        },
        edits: null,
      }
    : payload;
}

async function translationQueuePayload(registry, url, config) {
  const seed = await projectListingDraftSeed(currentSeed(config), {
    payload: config.payloadListingRuntime || null,
    env: config.authEnv || process.env,
    requirePayload: config.runtimeDataDurableOnly,
  });
  const tasks = config.runtimeDataDurableOnly
    ? []
    : latestTranslationTasks(readTranslationLedger(config.translationLedgerPath));
  const payload = renderAdminTranslationQueuePayload(registry, url.searchParams.get("locale") || "en", {
    seed,
    translationTasks: tasks,
    generatedAt: config.reviewedAt || new Date().toISOString(),
    operatorId: config.adminPrincipal || null,
    query: url.searchParams.get("q") || "",
    targetLocale: url.searchParams.get("targetLocale") || "",
    taskType: url.searchParams.get("taskType") || "",
    page: url.searchParams.get("page") || 1,
  });
  return config.runtimeDataDurableOnly
    ? {
        ...payload,
        runtime_data_mode: "durable_only",
        dataAvailability: {
          translationTasks: { status: "unavailable", reason_key: "durable_projection_unavailable" },
        },
        summary: {
          ...payload.summary,
          approved_waiting_publish: null,
          open_translation_tasks: null,
          stale_translation_tasks: null,
        },
      }
    : payload;
}

async function hermesConsolePayload(registry, url, config, { commandResult = null, commandError = null } = {}) {
  const env = config.authEnv || process.env;
  return buildAdminHermesPayload({
    registry,
    requestedLocale: adminLocaleParam(url, config),
    seed: currentSeed(config),
    operator: config.adminPrincipal,
    hermesEnv: env,
    listingEnv: env,
    payload: config.payloadListingRuntime || null,
    requirePayload: config.runtimeDataDurableOnly,
    provider: config.hermesReplyProvider || null,
    commandProvider: config.hermesOwnerCommandProvider || null,
    fetchImpl: config.hermesAgentFetch || globalThis.fetch,
    generatedAt: config.reviewedAt || new Date().toISOString(),
    probeTimeoutMs: config.hermesAgentProbeTimeoutMs || 5_000,
    receiptPayload: config.hermesReceiptPayload || config.payloadListingRuntime || null,
    receiptSecret: config.hermesReceiptSecret || env.MS_REALTY_PROVIDER_TOKEN_KEY || "",
    commandResult,
    commandError,
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

function approvedRouteArtifact(config) {
  return approvedLaunchFreezeRouteArtifact(loadApprovedLaunchFreeze(config.launchFreezePath));
}

function launchReadiness(config) {
  return buildLaunchReadinessReport({
    generatedAt: config.reviewedAt || new Date().toISOString(),
    routeMap: routeMapSummary(routeMapRows()),
    deployableRedirects: approvedRouteArtifact(config),
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
    r2MediaCoverage: r2MediaCoverageState(config.r2MediaCoverageReportPath || undefined, {
      now: config.reviewedAt || new Date().toISOString(),
    }),
    productionRecovery: productionRecoveryState(config.productionRecoveryReportPath || undefined, {
      publicKey: config.productionRecoverySigningPublicKey,
    }),
    productionRecoveryPublicKey: config.productionRecoverySigningPublicKey,
  });
}

async function authoritativeLaunchReadiness(config) {
  return buildLaunchReadinessReport({
    generatedAt: config.reviewedAt || new Date().toISOString(),
    routeMap: {
      summary: summarizeLegacyRouteMap(routeMapRows()),
      routes: routeMapRows(),
    },
    deployableRedirects: approvedRouteArtifact(config),
    listingQuality: await authoritativeListingQualityReport(config, {
      generatedAt: config.reviewedAt || new Date().toISOString(),
    }),
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
    r2MediaCoverage: r2MediaCoverageState(config.r2MediaCoverageReportPath || undefined),
    productionRecovery: productionRecoveryState(config.productionRecoveryReportPath || undefined, {
      publicKey: config.productionRecoverySigningPublicKey,
    }),
    productionRecoveryPublicKey: config.productionRecoverySigningPublicKey,
  });
}

function launchInputChecklist(config) {
  const routes = routeMapRows();
  const artifact = approvedRouteArtifact(config);
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

async function authoritativeLaunchInputChecklist(config) {
  const routes = routeMapRows();
  const artifact = approvedRouteArtifact(config);
  const generatedAt = config.reviewedAt || new Date().toISOString();
  return renderLaunchInputChecklist({
    generatedAt,
    launchReadiness: await authoritativeLaunchReadiness(config),
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
      r2_media_coverage: r2MediaCoverageState(config.r2MediaCoverageReportPath || undefined),
      production_recovery: productionRecoveryState(config.productionRecoveryReportPath || undefined, {
        publicKey: config.productionRecoverySigningPublicKey,
      }),
    },
  };
}

async function authoritativePreflightReports(config) {
  const generatedAt = config.reviewedAt || new Date().toISOString();
  const listingReport = await authoritativeListingQualityReport(config, { generatedAt });
  return {
    kind: "admin_preflight_reports",
    generated_at: generatedAt,
    checklist: {
      endpoint: "/api/admin/launch-input-checklist",
      path: "production/data/launch-input-checklist.md",
      refresh_command: "npm run launch:inputs",
    },
    launch_readiness: launchBlockerSummary(await authoritativeLaunchReadiness(config)),
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
      r2_media_coverage: r2MediaCoverageState(config.r2MediaCoverageReportPath || undefined),
      production_recovery: productionRecoveryState(config.productionRecoveryReportPath || undefined, {
        publicKey: config.productionRecoverySigningPublicKey,
      }),
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
    brokerProfiles: config.brokerProfiles || [],
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
      brokerProfiles: config.brokerProfiles || [],
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
    recordDurableListingAudit(
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

async function appendSellerPipelineOutcomeEntry(input, config) {
  const recordedAt = config.sellerPipelineOutcomeAt || config.reviewedAt || config.bookedAt || new Date().toISOString();
  const authenticatedInput = bindAuthenticatedOperator(input, config.adminPrincipal);
  if ((authenticatedInput.commissionEur ?? authenticatedInput.commission_eur) !== undefined && !canAdminAccess(config.adminPrincipal, "financials:write")) {
    throw Object.assign(new Error("Commission entry requires financials:write"), {
      status: 403,
      capability: "financials:write",
    });
  }
  return recordSellerPipelineOutcomeOperation({
    ledgers: leadOperationLedgersFor(config),
    sellerPipelines: await sellerPipelineItems(config),
    input: authenticatedInput,
    principal: config.adminPrincipal,
    recordedAt,
    onRecorded: (result) => {
      // ponytail: separate JSONL ledgers are not transactional; an idempotent retry repairs a missing summary audit.
      if (readAuditLog(config.auditLogPath).some((row) => row.action === "seller_pipeline_outcome_recorded" && row.object_id === result.outcome.id)) {
        return;
      }
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
    },
  });
}

async function appendPublicRequestOutcomeEntry(input, config) {
  const recordedAt = config.publicRequestOutcomeAt || config.reviewedAt || new Date().toISOString();
  const result = appendPublicRequestOutcome(
    {
      savedSearches: readSavedSearches(config.savedSearchLedgerPath),
      languageRequests: readLanguageRequests(config.languageRequestPath),
      viewingTrips: await publicRequestViewingTrips(config),
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

async function appendLeadPipelineOutcomeEntry(input, config) {
  const recordedAt = config.leadPipelineOutcomeAt || config.reviewedAt || config.bookedAt || new Date().toISOString();
  return recordLeadPipelineOutcomeOperation({
    ledgers: leadOperationLedgersFor(config),
    journey: await leadJourneyContext(config),
    input: bindAuthenticatedOperator(input, config.adminPrincipal),
    principal: config.adminPrincipal,
    recordedAt,
    onRecorded: (result) => {
      // ponytail: separate JSONL ledgers are not transactional; an idempotent retry repairs a missing summary audit.
      if (
        readAuditLog(config.auditLogPath).some(
          (row) => row.action === "lead_pipeline_outcome_recorded" && row.object_id === result.outcome.id,
        )
      ) {
        return;
      }
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
    },
  });
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
  const workspaceSettings = workspaceSettingsFor(config);
  const lead = applyWorkspaceDefaultBroker(
    createCrmInboxItem(registry, normalized, {
      assignedId: leadId,
      brokerProfiles: config.brokerProfiles || [],
    }),
    workspaceSettings,
    config.brokerProfiles || [],
  );
  const contactVault = appendLeadContact(lead, {
    filePath: config.leadContactVaultPath,
    secret: config.leadContactKey,
    storedAt: recordedAt,
  });
  const ledger = appendLead(lead, {
    filePath: config.leadLedgerPath,
    receivedAt: recordedAt,
    contactSecret: config.leadContactKey,
    ...leadSlaOptions(workspaceSettings),
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

// B1 lead operations. Each helper is the single-item path; the bulk route
// below reuses them verbatim so both share one set of rules and write one
// audit entry per enquiry.
function leadOperationAudit(config) {
  return (entry, recordedAt) => recordAudit(entry, config, recordedAt);
}

async function appendLeadSnoozeEntry(input, config, recordedAt) {
  return recordLeadSnoozeOperation({
    ledgers: leadOperationLedgersFor(config),
    leads: (await leadJourneySource(config)).leads,
    input,
    principal: config.adminPrincipal,
    recordedAt,
    audit: leadOperationAudit(config),
  });
}

async function appendLeadUnsnoozeEntry(input, config, recordedAt) {
  return recordLeadUnsnoozeOperation({
    ledgers: leadOperationLedgersFor(config),
    leads: (await leadJourneySource(config)).leads,
    input,
    principal: config.adminPrincipal,
    recordedAt,
    audit: leadOperationAudit(config),
  });
}

// "Handled", bulk actions and manual assignment all run through the shared
// workflows, so this adapter and the standalone server apply one set of rules
// and write one set of audit entries.
async function appendLeadHandledEntry(input, config, recordedAt) {
  return recordLeadHandledOperation({
    ledgers: leadOperationLedgersFor(config),
    journey: await leadJourneyContext(config),
    input: bindAuthenticatedOperator(input, config.adminPrincipal, ["actor"]),
    principal: config.adminPrincipal,
    recordedAt,
    audit: leadOperationAudit(config),
  });
}

async function applyLeadBulkAction(input, config) {
  return applyLeadBulkOperation({
    ledgers: leadOperationLedgersFor(config),
    journey: await leadJourneyContext(config),
    input,
    principal: config.adminPrincipal,
    recordedAt: config.leadSnoozeAt || config.reviewedAt || new Date().toISOString(),
    brokerProfiles: config.brokerProfiles || [],
    audit: leadOperationAudit(config),
  });
}

async function appendLeadAssignmentEntry(input, config) {
  const ledgers = leadOperationLedgersFor(config);
  const source = await leadJourneySource(config);
  return recordLeadAssignmentOperation({
    ledgers,
    leads: applyLeadAssignments(source.leads, leadScopedRows(source)(await ledgers.assignments.read())),
    input,
    principal: config.adminPrincipal,
    recordedAt: config.reviewedAt || new Date().toISOString(),
    brokerProfiles: config.brokerProfiles || [],
    audit: leadOperationAudit(config),
  });
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

async function appendConsentWithdrawalEntry(input, config) {
  return recordConsentWithdrawalOperation({
    consents: consentLedgerForConfig(config),
    input,
    principal: config.adminPrincipal,
    recordedAt: config.reviewedAt || new Date().toISOString(),
    audit: leadOperationAudit(config),
  });
}

async function appendDealClose(input, config) {
  return recordDealCloseOperation({
    ledgers: leadOperationLedgersFor(config),
    journey: await leadJourneyContext(config),
    input,
    principal: config.adminPrincipal,
    closedAt: config.dealClosedAt,
    audit: (entry, recordedAt) => recordAudit(entry, config, recordedAt),
  });
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

async function appendRedirectApprovalRow(input, config) {
  const principal = { id: config.adminPrincipal?.id || "unassigned" };
  const attributed = bindAuthenticatedOperator(redirectApprovalInput(input), principal, ["reviewer"]);
  const approval = appendRedirectApproval(routeMapRows(), attributed, {
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
    report: await authoritativeLaunchReadiness(config),
  };
}

async function importRedirectApprovalRows(csvText, config) {
  const principal = { id: config.adminPrincipal?.id || "unassigned" };
  for (const row of parseCsv(csvText)) {
    bindAuthenticatedOperator(row, principal, ["reviewer"]);
  }
  const imported = importRedirectApprovalsCsv(routeMapRows(), csvText, {
    filePath: config.redirectApprovalPath,
    approvedAt: config.reviewedAt,
  });
  recordAudit(
    {
      action: "redirect_approvals_imported",
      actor: principal.id,
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
    report: await authoritativeLaunchReadiness(config),
  };
}

async function exportDeployableRedirectRows(config) {
  const rows = currentDeployableRedirects(config);
  const decisions = currentLegacyRouteDecisions(config);
  const exported = { exported: rows.length, ...writeDeployableRedirects(rows, config.deployableRedirectOutputPath, { decisions }) };
  recordAudit(
    {
      action: "deployable_redirects_exported",
      actor: config.adminPrincipal?.id || "unassigned",
      objectType: "redirect_export",
      objectId: "deployable-redirects",
      metadata: { exported: rows.length, terminal_decisions: decisions.length, total: exported.summary?.total },
    },
    config,
  );
  return { ...exported, report: await authoritativeLaunchReadiness(config) };
}

async function exportLaunchReadiness(config) {
  const report = await authoritativeLaunchReadiness(config);
  const outPath = writeLaunchReadinessReport(report, config.launchReadinessOutputPath || undefined, {
    productionRecoveryPublicKey: config.productionRecoverySigningPublicKey,
  });
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

async function importLiveServiceReport(input, config) {
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
  return { imported, liveImport, livePreflight, report: await authoritativeLaunchReadiness(config) };
}

async function importPayloadRuntimeReport(report, config) {
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
  return { imported: { outPath, summary: report.summary }, report: await authoritativeLaunchReadiness(config), runtime };
}

async function importLiveServiceProvisioningReport(report, config) {
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
  return { imported: { outPath, summary: report.summary }, provisioning, report: await authoritativeLaunchReadiness(config) };
}

async function importProductionRecoveryReport(report, config) {
  const outPath = writeProductionRecoveryReport(report, config.productionRecoveryReportPath || undefined, {
    publicKey: config.productionRecoverySigningPublicKey,
  });
  const recovery = productionRecoveryState(config.productionRecoveryReportPath || undefined, {
    publicKey: config.productionRecoverySigningPublicKey,
  });
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
  return { imported: { outPath }, recovery, report: await authoritativeLaunchReadiness(config) };
}

async function importSeoEvidence(input, config) {
  const result = importAppSeoEvidenceRows(input, config);
  recordAudit(
    {
      action: "seo_evidence_imported",
      actor: config.adminPrincipal?.id || "unassigned",
      objectType: "seo_evidence",
      objectId: input.source,
      metadata: {
        row_count: result.imported?.row_count,
        missing_required_sources: result.missingRequiredSources,
      },
    },
    config,
  );
  return { ...result, report: await authoritativeLaunchReadiness(config) };
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

async function listingQualityWorkbook(config) {
  return renderListingQualityWorkbook(await authoritativeListingQualityReport(config));
}

async function listingQualityReviewDraft(config) {
  return renderListingQualityReviewDraft(await authoritativeListingQualityReport(config));
}

async function listingQualityReviewPacket(config) {
  const generatedAt = config.reviewedAt || new Date().toISOString();
  return buildListingQualityReviewPacket({
    generatedAt,
    report: await authoritativeListingQualityReport(config, { generatedAt }),
    reviewPath: config.listingQualityReviewPath || undefined,
  });
}

async function importListingQualityRows(inputCsv, config, source = "listing_quality_csv") {
  const report = await authoritativeListingQualityReport(config);
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
    report: await authoritativeLaunchReadiness(config),
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
  const htmlResponse = (payload) => renderAdminHtmlResponse(withOwnerProfile(withWorkspaceSettings(payload, config), config));
  // The door to the workbench is not reimplemented here. This adapter used to
  // carry its own copy of /admin/login, and that copy had quietly lost the
  // second-factor gate: it read the email and the password out of the form and
  // never looked at the code the operator had typed. Every deployed sign-in
  // therefore needed a password and nothing else, while the form kept asking
  // for an authenticator code and the Settings screen kept reporting the
  // factor as active. Both routes now delegate to the single implementation,
  // which verifies the second factor, throttles repeated failures by address
  // and records every attempt.
  if (requestPath === "/admin/login" || requestPath === "/admin/logout") {
    return renderAppWorkspaceSecurityResponse(request, { env: authEnv, overrides: adminAuthOverrides(config) });
  }
  if (sessionToken) {
    let revoked = true;
    try {
      revoked = isAdminSessionRevoked(
        readAdminSessionEvents(config.adminSessionLedgerPath || undefined),
        adminSessionFingerprint(sessionToken),
      );
    } catch {
      // A ledger that cannot be read is not evidence that the session is safe.
    }
    if (revoked) {
      if ((requestPath === "/admin" || requestPath.startsWith("/admin/")) && request.headers.get("accept")?.includes("text/html")) {
        return new Response(null, {
          status: 303,
          headers: {
            location: "/admin/login",
            "cache-control": "no-store",
            "set-cookie": adminSessionClearCookie(),
          },
        });
      }
      const response = adminUnauthorized();
      const headers = new Headers(response.headers);
      headers.set("set-cookie", adminSessionClearCookie());
      return new Response(response.body, { status: response.status, headers });
    }
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
  if (principal.source === "payload_session" && principal.password_change_required === true) {
    if ((requestPath === "/admin" || requestPath.startsWith("/admin/")) && request.headers.get("accept")?.includes("text/html")) {
      return new Response(null, {
        status: 303,
        headers: { location: "/admin/login?change=1", "cache-control": "no-store" },
      });
    }
    return jsonResponse(403, {
      kind: "password_change_required",
      message: "Change the temporary password before using the admin workspace.",
    });
  }
  if (request.method !== "GET" && !canAdminMutate(principal)) return adminOperatorIdentityRequired();
  // B6: which session is "this" one, so the settings screen can mark it and
  // refuse to present a revoke that would sign the operator out silently. A
  // token that cannot be fingerprinted simply marks nothing.
  const stepUpToken =
    String(request.headers.get("x-ms-admin-2fa") || "").trim() || stepUpTokenFromCookie(request.headers.get("cookie") || "");
  const currentFingerprint = (() => {
    try {
      const token = sessionToken || stepUpToken;
      return token ? adminSessionFingerprint(token) : "";
    } catch {
      return "";
    }
  })();
  const stepUpActive = (() => {
    if (!stepUpToken || principal.source !== "credential_registry") return false;
    try {
      const fingerprint = adminSessionFingerprint(stepUpToken);
      const state = adminSessionStates(readAdminSessionEvents(config.adminSessionLedgerPath || undefined), {
        now: Date.parse(config.securityAt || config.reviewedAt || config.receivedAt || new Date().toISOString()),
      }).get(fingerprint);
      return state?.status === "active" && state.operator_id === principal.id && state.source === "credential_registry";
    } catch {
      return false;
    }
  })();
  config = {
    ...config,
    adminPrincipal: principal,
    payloadAdminSession: payloadSession,
    brokerProfiles: await (async () => {
      const fallback = Array.isArray(config.brokerProfiles) ? config.brokerProfiles : [];
      if (!payloadSession) return fallback;
      try {
        const service = await payloadAdminAuth();
        if (typeof service?.listOperators !== "function") return fallback;
        const profiles = assignableBrokerProfiles(await service.listOperators(payloadSession));
        return profiles.length ? profiles : fallback;
      } catch {
        return fallback;
      }
    })(),
    adminSessionFingerprint: currentFingerprint,
    adminStepUpActive: stepUpActive,
  };
  try {
    const url = new URL(request.url, "http://localhost");
    const requiredCapability = requiredAdminCapability(request.method, url.pathname);
    if (requiredCapability && !canAdminAccess(principal, requiredCapability)) return adminForbidden(requiredCapability);
    // Keep credential-registry step-up parity with the standalone runtime.
    // Settings and the factor's own self-service routes stay reachable so an
    // operator can enrol or verify the factor that gates the rest of the app.
    const b6StepUpExempt =
      TWO_FACTOR_SELF_SERVICE_PATHS.has(url.pathname) ||
      (request.method === "GET" && ["/admin/settings", "/api/admin/settings"].includes(url.pathname));
    const adminRequest = url.pathname === "/admin" || url.pathname.startsWith("/admin/") || url.pathname.startsWith("/api/admin/");
    if (adminRequest && principal?.source === "credential_registry" && !b6StepUpExempt) {
      const b6Status = operatorTwoFactorStatus(
        readOperatorTwoFactorEvents(config.operatorTwoFactorPath || undefined),
        principal.id,
      );
      const b6GateRefusal = (kind, message) =>
        request.headers.get("accept")?.includes("text/html") && !url.pathname.startsWith("/api/")
          ? new Response(null, {
              status: 303,
              headers: {
                location: `/admin/settings?security=${encodeURIComponent(kind)}#settings-security`,
                "cache-control": "no-store",
              },
            })
          : jsonResponse(403, { kind, message });
      if (b6Status.status === "active") {
        if (!stepUpActive) {
          return b6GateRefusal(
            "two_factor_required",
            "Post a current authenticator code to /api/admin/security/two-factor/verify and send the returned token as x-ms-admin-2fa.",
          );
        }
      } else if (principal.require_two_factor === true) {
        return b6GateRefusal(
          "two_factor_enrolment_required",
          "This operator must enrol a second factor at /api/admin/security/two-factor/enrol before using the workspace.",
        );
      }
    }
    const parsedDeliveryBody =
      request.method === "POST" && url.pathname === "/api/admin/replies/delivery"
        ? parseBody(request, await readRequestBody(request, config.maxBodyBytes))
        : null;
    if (
      isFileBackedLeadMutationBlocked({
        durableLeadOperations: config.leadOperationsDurableStore?.leadOperationsDurableStoreEnabled === true,
        durableProviderDelivery: Boolean(parsedDeliveryBody?.provider && !parsedDeliveryBody?.action),
        durableStore: config.leadDurableStore,
        durableViewing: config.viewingDurableStore?.viewingDurableStoreEnabled === true,
        method: request.method,
        pathname: url.pathname,
      })
    ) {
      return leadStoreUnavailable("lead_store_read_only");
    }
    if (productionRuntimeDataUnavailable({
      durableLeadOperations: config.leadOperationsDurableStore?.leadOperationsDurableStoreEnabled === true,
      durableProviderDelivery: Boolean(parsedDeliveryBody?.provider && !parsedDeliveryBody?.action),
      durableOnly: config.runtimeDataDurableOnly,
      durableViewing: config.viewingDurableStore?.viewingDurableStoreEnabled === true,
      method: request.method,
      pathname: url.pathname,
    })) {
      const unavailable = runtimeDataUnavailablePayload(url.pathname);
      if (request.method === "GET" && url.pathname.startsWith("/admin/")) {
        return htmlResponse(
          renderAdminRuntimeUnavailablePayload(
            loadLocaleRegistry(config.localeRegistryPath),
            adminLocaleParam(url, config),
            unavailable,
            principal,
          ),
        );
      }
      return jsonResponse(503, unavailable);
    }
    if (
      config.runtimeDataDurableOnly &&
      ["/admin/cases", "/api/admin/cases", "/api/admin/cases/intents", "/api/admin/cases/conditions"].includes(url.pathname) &&
      !realtyCasePayloadAuthorityActive(config)
    ) {
      return jsonResponse(503, realtyCasePayloadAuthorityFailure());
    }
    if (
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
            locale: url.searchParams.get("locale") || "bg",
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
    if (["/admin/settings", "/api/admin/settings"].includes(url.pathname)) {
      const registry = loadLocaleRegistry(config.localeRegistryPath);
      const settingsStore = {
        filePath: config.workspaceSettingsPath,
        payload: config.workspaceSettingsPayload || config.payloadListingRuntime || null,
        payloadRuntimeConfigured: config.workspaceSettingsPayloadRuntimeConfigured === true,
        workspaceId: config.workspaceSettingsWorkspaceId || "",
      };
      const settingsStoreReady = workspaceSettingsStoreConfigured(settingsStore);
      if (request.method === "GET") {
        if (!settingsStoreReady && config.runtimeDataDurableOnly) {
          if (url.pathname === "/admin/settings") {
            return htmlResponse(renderAdminRuntimeUnavailablePayload(registry, url.searchParams.get("locale") || "en", { path: url.pathname }, principal));
          }
          return jsonResponse(503, {
            kind: "workspace_settings_unavailable",
            message: "Workspace settings storage is not configured on this runtime.",
          });
        }
        try {
          const settings = settingsStoreReady ? await readWorkspaceSettingsStore(settingsStore) : emptyWorkspaceSettingsDocument();
          const requestedLocale = url.searchParams.get("locale") || settings.sections.workspace.default_locale || "en";
          const payload = workspaceSettingsPayload(registry, url, config, {
            requestedLocale,
            settings,
            writable: settingsStoreReady,
            onboarding: await workspaceOnboardingFor({ replyDeliveryQueue: { states: [] } }, config),
          });
          if (url.pathname === "/admin/settings") return htmlResponse(payload);
          return jsonResponse(200, payload);
        } catch (error) {
          if (!(error instanceof WorkspaceSettingsStoreUnavailableError)) throw error;
          if (url.pathname === "/admin/settings") {
            return htmlResponse(renderAdminRuntimeUnavailablePayload(registry, url.searchParams.get("locale") || "en", { path: url.pathname }, principal));
          }
          return jsonResponse(error.status || 503, { kind: error.code, message: error.message });
        }
      }
      if (request.method === "POST" && url.pathname === "/api/admin/settings") {
        const formRequest = (request.headers.get("content-type") || "").includes("application/x-www-form-urlencoded");
        const input = parseBody(request, await readRequestBody(request, config.maxBodyBytes)) || {};
        const section = String(input.section || "").trim();
        const requestedLocale = String(input.locale || "").trim() || adminLocaleParam(url, config);
        if (!settingsStoreReady) {
          return jsonResponse(503, {
            kind: "workspace_settings_unavailable",
            message: "Workspace settings storage is not configured on this runtime.",
          });
        }
        try {
          const result = await updateWorkspaceSettingsStore({
            ...settingsStore,
            section,
            values: input,
            actor: principal?.id || "admin",
            recordedAt: auditRecordedAt(config),
            brokerIds: knownBrokerIds(config),
            adminLocales: adminLocales(registry),
          });
          if (!result.idempotent) {
            recordAudit(
              {
                action: "workspace_settings_updated",
                objectType: "workspace_settings",
                objectId: result.section,
                metadata: { section: result.section, changed_fields: result.changed_fields, revision: result.revision },
              },
              config,
            );
          }
          if (formRequest) {
            const target = new URL("/admin/settings", "http://localhost");
            if (input.locale) target.searchParams.set("locale", requestedLocale);
            target.searchParams.set("saved", result.section);
            return new Response(null, {
              status: 303,
              headers: { location: `${target.pathname}${target.search}#settings-${result.section}`, "cache-control": "no-store" },
            });
          }
          return jsonResponse(200, {
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
            const settings = await readWorkspaceSettingsStore(settingsStore).catch(() => emptyWorkspaceSettingsDocument());
            return htmlResponse(
              workspaceSettingsPayload(registry, url, config, {
                requestedLocale,
                form: { section, error: error.message, field: error.field || null, values: input },
                settings,
                writable: settingsStoreReady,
              }),
            );
          }
          return jsonResponse(status, { kind: error.code || "bad_request", message: error.message, field: error.field || null });
        }
      }
      return jsonResponse(405, { kind: "method_not_allowed" });
    }
    if (request.method === "GET" && url.pathname === "/admin") {
      const locale = url.searchParams.get("locale") || adminLocaleParam(url, config);
      const welcome = principal?.source === "payload_session" ? "&welcome=1" : "";
      return new Response(null, {
        status: 307,
        headers: { ...PRIVATE_HTML_HEADERS, location: `${adminHomePath(principal)}?locale=${encodeURIComponent(locale)}${welcome}` },
      });
    }
    const registry = loadLocaleRegistry(config.localeRegistryPath);
    if (["/admin/hermes", "/api/admin/hermes"].includes(url.pathname)) {
      if (request.method === "GET") {
        const payload = await hermesConsolePayload(registry, url, config);
        return url.pathname === "/admin/hermes" ? htmlResponse(payload) : jsonResponse(200, payload);
      }
      if (request.method === "POST") {
        try {
          const businessContext = await hermesBusinessContext(config);
          const receipt = await runHermesOwnerCommand(
            parseBody(request, await readRequestBody(request, config.maxBodyBytes)),
            {
              operator: principal,
              payload: config.hermesReceiptPayload || config.payloadListingRuntime || null,
              secret: config.hermesReceiptSecret || authEnv.MS_REALTY_PROVIDER_TOKEN_KEY || "",
              env: authEnv,
              fetchImpl: config.hermesCommandFetch || config.hermesAgentFetch || globalThis.fetch,
              provider: config.hermesOwnerCommandProvider || null,
              providerMetadata: { mode: String(authEnv.HERMES_PROVIDER_MODE || "self_hosted").trim() || "self_hosted" },
              businessContext,
              requireBusinessContext: true,
              now: () => config.reviewedAt || new Date().toISOString(),
            },
          );
          if (url.pathname === "/api/admin/hermes") {
            return jsonResponse(201, { kind: "hermes_owner_receipt", receipt });
          }
          return htmlResponse(await hermesConsolePayload(registry, url, config, { commandResult: receipt }));
        } catch (cause) {
          const error =
            cause instanceof ProviderConnectionUnavailableError
              ? cause
              : cause instanceof HermesOwnerCommandError
              ? cause
              : new HermesOwnerCommandError("hermes_unavailable", { status: 503, cause });
          if (url.pathname === "/api/admin/hermes") {
            return jsonResponse(error instanceof ProviderConnectionUnavailableError ? 503 : error.status, {
              kind: error instanceof ProviderConnectionUnavailableError ? "provider_connection_unavailable" : error.code,
              message: error.message,
              ...("receipt" in error && error.receipt ? { receipt: error.receipt } : {}),
            });
          }
          return htmlResponse(
            await hermesConsolePayload(registry, url, config, {
              commandError: {
                kind: error instanceof ProviderConnectionUnavailableError ? "provider_connection_unavailable" : error.code,
                message: error.message,
                receipt: "receipt" in error ? error.receipt || null : null,
              },
            }),
          );
        }
      }
      return jsonResponse(405, { kind: "method_not_allowed" });
    }
    if (request.method === "GET" && url.pathname === "/admin/connect") {
      const providerConfig = config.providerConnection || operatorProviderConfigFromEnv(config.authEnv || process.env);
      let availability = operatorProviderAvailability(providerConfig);
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
      const connectLocale = url.searchParams.get("locale") || "en";
      const resultError = Boolean(url.searchParams.get("error")) || storeError;
      const result = operatorConnectResult({
        locale: connectLocale,
        connected: url.searchParams.get("connected") || "",
        disconnected: url.searchParams.get("disconnected") || "",
        verified: url.searchParams.get("verified") || "",
        error: Boolean(url.searchParams.get("error")),
        storeError,
      });
      const base =
        String((config.authEnv || process.env).MS_REALTY_PUBLIC_ORIGIN || "").trim() || new URL(request.url).origin;
      const agent = issueOperatorAgentToken({ principal, env: config.authEnv || process.env });
      if (agent) {
        recordAudit(
          {
            action: "operator_agent_token_issued",
            actor: principal?.id,
            objectType: "operator_agent_token",
            objectId: agent.operator_id,
            metadata: { expires_at: agent.expires_at, roles: agent.roles },
          },
          config,
        );
      }
      return htmlResponse(
        buildOperatorConnectPayload({
          registry,
          requestedLocale: connectLocale,
          operator: principal,
          connections,
          availability,
          providerConfig,
          baseUrl: base,
          assistantPrompt:
            !agent && principal?.source === "credential_registry"
              ? operatorBootstrapPrompt({ baseUrl: base, operatorId: principal.id })
              : "",
          agentToken: agent?.token || "",
          agentExpiresAt: agent?.expires_at || "",
          codexMarketplacePath: (config.authEnv || process.env).MS_REALTY_CODEX_MARKETPLACE_PATH,
          result,
          resultTone: resultError ? "error" : "success",
          storeError,
          canManageConnections: Boolean(
            payloadSession && principal.source === "payload_session" && principal.roles?.includes("admin"),
          ),
        }),
      );
    }
    if (
      url.pathname === "/api/admin/connections" ||
      url.pathname === OPERATOR_CONNECTION_DISCONNECT_PATH ||
      url.pathname === OPERATOR_CONNECTION_AGENT_CONFIG_PATH
    ) {
      const providerConfig = config.providerConnection || operatorProviderConfigFromEnv(config.authEnv || process.env);
      const availability = operatorProviderAvailability(providerConfig);
      const storeOptions = {
        credentialSecret: providerConfig.credentialSecret,
        payload: config.providerConnectionPayload || null,
      };
      const readConnections = config.readProviderConnections || readProviderConnections;
      const connectionDeps = {
        fetchImpl: config.providerFetch || fetch,
        storeOptions,
        env: config.authEnv || process.env,
        readProviderCredentials: config.readProviderCredentials || readProviderCredentials,
        saveProviderConnection: config.saveProviderConnection || saveProviderConnection,
        deleteProviderConnection: config.deleteProviderConnection || deleteProviderConnection,
        // Seams the adapter has always exposed so a test can stand in for a
        // provider without a network. Undefined means "use the real one".
        completeGoogleOAuth: config.completeGoogleOAuth,
        completeOperatorProviderOAuth: config.completeOperatorProviderOAuth,
        completeOperatorTokenConnection: config.completeOperatorTokenConnection,
        completeWhatsAppEmbeddedSignup: config.completeWhatsAppEmbeddedSignup,
        registerWhatsAppWebhook: config.registerWhatsAppWebhook,
        completeViberConnection: config.completeViberConnection,
        registerViberWebhook: config.registerViberWebhook,
        verifyOperatorAiProvider: config.verifyOperatorAiProvider,
        revokeOperatorProvider: config.revokeOperatorProvider,
      };
      const connectionRedirect = (query) =>
        new Response(null, { status: 303, headers: { location: `/admin/connect?${query}`, "cache-control": "no-store" } });
      const recordConnectionOutcome = (outcome) => {
        const entry = operatorConnectionAudit(outcome, { actor: principal.id });
        if (entry) recordAudit(entry, config);
      };
      if (request.method === "GET" && url.pathname === "/api/admin/connections" && !url.searchParams.get("action")) {
        return jsonResponse(200, {
          kind: "provider_connections",
          availability,
          connections: await readConnections({ payload: storeOptions.payload }),
        });
      }
      if (!payloadSession || principal.source !== "payload_session" || !principal.roles?.includes("admin")) {
        return adminForbidden("payload_admin_session");
      }
      if (url.pathname === OPERATOR_CONNECTION_AGENT_CONFIG_PATH) {
        if (request.method !== "GET") return jsonResponse(405, { kind: "method_not_allowed" });
        if (url.searchParams.get("catalog") === "1") {
          return jsonResponse(200, ownerOperatorCatalog(principal));
        }
        const agent = issueOperatorAgentToken({ principal, env: config.authEnv || process.env });
        if (!agent) {
          return jsonResponse(503, {
            kind: "operator_agent_token_unavailable",
            message: "Operator agent tokens are not configured",
          });
        }
        const origin =
          String((config.authEnv || process.env).MS_REALTY_PUBLIC_ORIGIN || "").trim() || new URL(request.url).origin;
        recordAudit(
          {
            action: "operator_agent_token_issued",
            actor: principal.id,
            objectType: "operator_agent_token",
            objectId: agent.operator_id,
            metadata: { expires_at: agent.expires_at, roles: agent.roles },
          },
          config,
        );
        return jsonResponse(200, {
          kind: "operator_agent_config",
          operator_id: agent.operator_id,
          expires_at: agent.expires_at,
          mcp_url: `${new URL(origin).origin}/mcp`,
          credential_env: OPERATOR_TOKEN_ENV,
          credential: agent.token,
          config: operatorAgentConfigBlock({
            baseUrl: origin,
            token: agent.token,
            operatorId: agent.operator_id,
            expiresAt: agent.expires_at,
            locale: url.searchParams.get("locale") || "en",
          }),
        });
      }
      if (url.pathname === OPERATOR_CONNECTION_DISCONNECT_PATH) {
        if (request.method !== "POST") return jsonResponse(405, { kind: "method_not_allowed" });
        const formEncoded = (request.headers.get("content-type") || "").includes("application/x-www-form-urlencoded");
        const input = parseBody(request, await readRequestBody(request, config.maxBodyBytes));
        const outcome = await runOperatorConnectionAction({
          intent: "disconnect",
          provider: input.provider,
          operatorId: principal.id,
          config: providerConfig,
          deps: connectionDeps,
        });
        if (outcome.outcome === "rejected") {
          recordProviderConnectionFailure(outcome.provider, outcome.phase, outcome.error, config);
          if (formEncoded) return connectionRedirect(`error=${encodeURIComponent(outcome.provider)}`);
          return jsonResponse(400, { kind: "provider_disconnect_rejected", message: "The connection was not removed" });
        }
        recordConnectionOutcome(outcome);
        if (formEncoded) return connectionRedirect(`disconnected=${encodeURIComponent(outcome.provider)}`);
        return jsonResponse(200, {
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
            return new Response(null, {
              status: 303,
              headers: {
                location: operatorConnectionStart({
                  provider: requestedProvider,
                  config: providerConfig,
                  operatorId: principal.id,
                }),
                "cache-control": "no-store",
              },
            });
          } catch (error) {
            recordProviderConnectionFailure(requestedProvider, "oauth_start", error, config);
            return connectionRedirect(`error=${encodeURIComponent(requestedProvider)}`);
          }
        }
        if (action === "callback") {
          if (url.searchParams.get("error")) {
            recordProviderConnectionFailure(requestedProvider, "oauth_callback", new Error("provider_rejected"), config);
            return connectionRedirect(`error=${encodeURIComponent(requestedProvider)}`);
          }
          const outcome = await runOperatorConnectionAction({
            intent: "callback",
            provider: requestedProvider,
            code: url.searchParams.get("code"),
            state: url.searchParams.get("state"),
            operatorId: principal.id,
            config: providerConfig,
            deps: connectionDeps,
          });
          if (outcome.outcome === "rejected") {
            recordProviderConnectionFailure(outcome.provider, outcome.phase, outcome.error, config);
            return connectionRedirect(`error=${encodeURIComponent(outcome.provider)}`);
          }
          recordConnectionOutcome(outcome);
          return connectionRedirect(`connected=${encodeURIComponent(outcome.provider)}`);
        }
      }
      if (request.method === "POST") {
        const formEncoded = (request.headers.get("content-type") || "").includes("application/x-www-form-urlencoded");
        const input = parseBody(request, await readRequestBody(request, config.maxBodyBytes));
        const provider = String(input.provider || "").trim().toLowerCase();
        const outcome = await runOperatorConnectionAction({
          intent: "submit",
          provider,
          input,
          operatorId: principal.id,
          config: providerConfig,
          deps: connectionDeps,
        });
        if (outcome.outcome === "rejected") {
          recordProviderConnectionFailure(outcome.provider, outcome.phase, outcome.error, config);
          if (formEncoded) return connectionRedirect(`error=${encodeURIComponent(outcome.provider || "provider")}`);
          return jsonResponse(400, {
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
        return jsonResponse(201, { kind: "provider_connection", connection: outcome.connection });
      }
      return jsonResponse(405, { kind: "method_not_allowed" });
    }
    if (request.method === "GET" && ["/admin/today", "/api/admin/today"].includes(url.pathname)) {
      const today = await todayPayload(registry, url, config);
      const payload = withWorkspaceSettings(
        { ...today, onboarding: await workspaceOnboardingFor(today, config), welcome: url.searchParams.get("welcome") === "1" },
        config,
      );
      return url.pathname === "/admin/today" ? htmlResponse(payload) : jsonResponse(200, payload);
    }
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
    // Package A2: read-only approved-content review. The review body reads the
    // approved data files directly, so the Payload app and the static server
    // show the same rows.
    if (request.method === "GET" && url.pathname === "/admin/approved-content") {
      return htmlResponse(
        renderAdminApprovedContentPayload(
          registry,
          url.searchParams.get("locale") || "en",
          approvedContentReviewPayload(config.reviewedAt ? { now: config.reviewedAt } : {}),
          config.adminPrincipal || null,
          url.searchParams.get("state") || "",
        ),
      );
    }
    // Package B2: the same review payload the HTML screen above renders.
    if (request.method === "GET" && url.pathname === "/api/admin/approved-content") {
      return jsonResponse(200, approvedContentReviewPayload(config.reviewedAt ? { now: config.reviewedAt } : {}));
    }
    // B5: broker working hours, read by anyone with the queue and written by
    // the broker themselves or a manager.
    if (url.pathname === "/api/admin/availability") {
      if (request.method === "GET") return jsonResponse(200, brokerAvailabilityPayload(url, config));
      if (request.method === "POST") {
        const recorded = recordBrokerAvailability(
          parseBody(request, await readRequestBody(request, config.maxBodyBytes)),
          config,
        );
        return jsonResponse(recorded.status, recorded.body);
      }
      return jsonResponse(405, { kind: "method_not_allowed" });
    }
    // B5: the week calendar, with the follow-ups that are due on it.
    if (url.pathname === "/api/admin/viewings/week") {
      if (request.method !== "GET") return jsonResponse(405, { kind: "method_not_allowed" });
      return jsonResponse(200, await viewingWeekPayload(url, config));
    }
    // B3: without this route saved-search alerts can never be dispatched.
    if (url.pathname === "/api/admin/saved-search-alerts/run-due") {
      if (request.method !== "POST") return jsonResponse(405, { kind: "method_not_allowed" });
      if (!config.savedSearchAlertDeliveryLedgerPath) {
        return jsonResponse(503, {
          kind: "saved_search_alert_storage_unavailable",
          message: "Saved search alert delivery storage is not configured.",
        });
      }
      return jsonResponse(201, await runDueSavedSearchAlerts(config));
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
      return jsonResponse(200, await authoritativeLaunchReadiness(config));
    }
    if (request.method === "GET" && url.pathname === "/api/admin/launch-input-checklist") {
      return markdownResponse(await authoritativeLaunchInputChecklist(config));
    }
    if (request.method === "GET" && url.pathname === "/api/admin/preflight-reports") {
      return jsonResponse(200, await authoritativePreflightReports(config));
    }
    if (request.method === "GET" && url.pathname === "/api/admin/seo-preflight") {
      return jsonResponse(200, { kind: "admin_seo_preflight", seo: seoPreflightReport(config) });
    }
    if (request.method === "GET" && url.pathname === "/api/admin/listing-quality") {
      const generatedAt = config.reviewedAt || new Date().toISOString();
      return jsonResponse(200, {
        kind: "admin_listing_quality",
        listing_quality: buildListingQualityPreflightReport({
          report: await authoritativeListingQualityReport(config, { generatedAt }),
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
      return jsonResponse(report.ready ? 201 : 202, await importLiveServiceProvisioningReport(report, config));
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
        recovery: productionRecoveryState(config.productionRecoveryReportPath || undefined, {
          publicKey: config.productionRecoverySigningPublicKey,
        }),
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
      return csvResponse(await listingQualityWorkbook(config), "listing-quality-workbook.csv");
    }
    if (request.method === "GET" && url.pathname === "/api/admin/listing-quality-review-draft") {
      return csvResponse(await listingQualityReviewDraft(config), "listing-quality-review-draft.csv");
    }
    if (request.method === "GET" && url.pathname === "/api/admin/listing-quality-review-packet") {
      return jsonResponse(200, await listingQualityReviewPacket(config));
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
      return jsonResponse(201, await appendRedirectApprovalRow(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/redirect-approvals/import") {
      return jsonResponse(201, await importRedirectApprovalRows(csvInput(request, await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/deployable-redirects/export") {
      return jsonResponse(201, await exportDeployableRedirectRows(config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/launch-readiness/export") {
      return jsonResponse(201, await exportLaunchReadiness(config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/live-service-reports/import") {
      const result = await importLiveServiceReport(
        liveServiceReportInput(request, url, await readRequestBody(request, config.maxBodyBytes)),
        config,
      );
      return jsonResponse(result.livePreflight.ready ? 201 : 202, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/payload-runtime/import") {
      const report = reportJsonInput(parseJsonBody(await readRequestBody(request, config.maxBodyBytes)));
      return jsonResponse(report.ready ? 201 : 202, await importPayloadRuntimeReport(report, config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/production-recovery/import") {
      return jsonResponse(
        201,
        await importProductionRecoveryReport(
          reportJsonInput(parseJsonBody(await readRequestBody(request, config.maxBodyBytes))),
          config,
        ),
      );
    }
    if (request.method === "POST" && url.pathname === "/api/admin/seo-evidence/import") {
      const result = await importSeoEvidence(seoExportInput(request, url, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.missingRequiredSources.length ? 202 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/listing-quality/import") {
      const input = listingQualityReviewInput(request, await readRequestBody(request, config.maxBodyBytes));
      const result = await importListingQualityRows(input.csv, config, input.source);
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
    if (request.method === "POST" && url.pathname === "/api/admin/social-marketing/publish") {
      if (!principal?.id) throw new Error("Social publishing requires a named authenticated operator");
      const input = bindAuthenticatedOperator(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), principal, [
        "approvedBy",
      ]);
      const workspaceId = String(input.workspaceId || input.workspace_id || "").trim();
      if (!workspaceId) throw new Error("workspaceId is required for social publishing");
      if (!canAdminAccessWorkspace(principal, workspaceId)) return adminForbidden("content:write");
      const approved = String(input.approved || "").trim().toLowerCase() === "true";
      if (!approved) throw new Error("Human approval is required before social publishing");
      const providerConfig = config.providerConnection || providerConnectionConfigFromEnv(config.authEnv || process.env);
      const approvedAt = config.reviewedAt || new Date().toISOString();
      const publication = await (config.publishApprovedSocialDraft || publishApprovedSocialDraft)(
        {
          provider: input.provider,
          workspaceId,
          idempotencyKey: String(input.idempotencyKey || input.idempotency_key || "").trim(),
          message: input.message,
          link: input.link,
          imageUrl: input.imageUrl || input.image_url,
          caption: input.caption,
          approved: true,
          approvedBy: input.approvedBy,
          approvedAt,
        },
        {
          config: providerConfig,
          payload: config.socialMarketingPayload || config.providerConnectionPayload || null,
          fetchImpl: config.providerFetch || fetch,
        },
      );
      const existingAudit = config.auditLogPath
        ? readAuditLog(config.auditLogPath).some(
            (row) => row.action === "social_marketing_published" && row.object_id === publication.idempotency_key,
          )
        : false;
      if (!existingAudit) {
        recordAudit(
          {
            action: "social_marketing_published",
            actor: principal.id,
            objectType: "social_marketing_publication",
            objectId: publication.idempotency_key,
            metadata: {
              workspace_id: publication.workspace_id,
              provider: publication.provider,
              external_post_id: publication.external_post_id,
              external_account_id: publication.external_account_id,
            },
          },
          config,
          publication.completed_at || approvedAt,
        );
      }
      return jsonResponse(publication.idempotent ? 200 : 201, {
        kind: "social_marketing_publication",
        publication,
      });
    }
    if (request.method === "POST" && url.pathname === "/api/admin/lead-pipeline/outcome") {
      const result = await appendLeadPipelineOutcomeEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
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
    // B1 lead operations: snooze, bulk actions, saved views.
    if (request.method === "POST" && url.pathname === "/api/admin/leads/snooze") {
      const recordedAt = config.leadSnoozeAt || config.reviewedAt || new Date().toISOString();
      const result = await appendLeadSnoozeEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config, recordedAt);
      return jsonResponse(result.idempotent ? 200 : 201, { kind: "lead_snooze", ...result });
    }
    if (request.method === "POST" && url.pathname === "/api/admin/leads/unsnooze") {
      const recordedAt = config.leadSnoozeAt || config.reviewedAt || new Date().toISOString();
      const result = await appendLeadUnsnoozeEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config, recordedAt);
      return jsonResponse(result.idempotent ? 200 : 201, { kind: "lead_unsnooze", ...result });
    }
    if (request.method === "POST" && url.pathname === "/api/admin/leads/bulk") {
      const outcome = await applyLeadBulkAction(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(outcome.status, outcome.body);
    }
    // Saved views belong to the authenticated operator and to nobody else.
    if (url.pathname === "/api/admin/views") {
      const operatorId = config.adminPrincipal?.id || null;
      if (!operatorId) return adminOperatorIdentityRequired();
      if (request.method === "GET") {
        return jsonResponse(200, {
          kind: "operator_views",
          operator_id: operatorId,
          surfaces: OPERATOR_VIEW_SURFACES,
          views: operatorViewsFor(readOperatorViews(config.operatorViewLedgerPath), operatorId, url.searchParams.get("surface") || null),
        });
      }
      const recordedAt = config.leadSnoozeAt || config.reviewedAt || new Date().toISOString();
      const input = bindAuthenticatedOperator(
        parseBody(request, await readRequestBody(request, config.maxBodyBytes)),
        config.adminPrincipal,
        ["operatorId"],
      );
      if (request.method === "POST") {
        const view = createOperatorView(readOperatorViews(config.operatorViewLedgerPath), input, { operatorId, savedAt: recordedAt });
        const persisted = appendOperatorView(view, { filePath: config.operatorViewLedgerPath });
        if (!persisted.idempotent) {
          recordAudit(
            {
              action: "operator_view_saved",
              actor: operatorId,
              objectType: "operator_view",
              objectId: persisted.id,
              metadata: { surface: persisted.surface, slug: persisted.slug, filter_keys: Object.keys(persisted.filters) },
            },
            config,
            recordedAt,
          );
        }
        return jsonResponse(persisted.idempotent ? 200 : 201, { kind: "operator_view", ...persisted });
      }
      if (request.method === "DELETE") {
        const tombstone = createOperatorViewDeletion(readOperatorViews(config.operatorViewLedgerPath), input, { operatorId, deletedAt: recordedAt });
        const persisted = appendOperatorView(tombstone, { filePath: config.operatorViewLedgerPath });
        if (!persisted.idempotent) {
          recordAudit(
            {
              action: "operator_view_deleted",
              actor: operatorId,
              objectType: "operator_view",
              objectId: persisted.id,
              metadata: { surface: persisted.surface, slug: persisted.slug },
            },
            config,
            recordedAt,
          );
        }
        return jsonResponse(200, { kind: "operator_view", ...persisted });
      }
      return jsonResponse(405, { kind: "method_not_allowed" });
    }
    if (request.method === "POST" && url.pathname === "/api/admin/leads/assign") {
      const result = await appendLeadAssignmentEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
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
      const result = await appendConsentWithdrawalEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
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
          recordDurableListingAudit(
            {
              action: "listing_edited",
              actor: config.adminPrincipal?.id,
              objectType: "listing",
              objectId: result.listingId,
              metadata: {
                changed_fields: result.changedFields,
                verified_fact_fields: result.verifiedFactFields || [],
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
          verified_fact_fields: result.verifiedFactFields || [],
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
    // B4 media upload
    if (url.pathname === ADMIN_MEDIA_UPLOAD_PATH || url.pathname.startsWith(`${ADMIN_MEDIA_UPLOAD_PATH}/`)) {
      const uploadLimits = config.mediaUploadLimits || mediaUploadLimitsFromEnv();
      const uploadStorage = createMediaUploadStorage(config.mediaUploadStorageConfig || mediaUploadStorageConfigFromEnv());
      if (request.method === "GET" && url.pathname === ADMIN_MEDIA_UPLOAD_PATH) {
        const listed = listMediaUploads({
          ledgerPath: config.mediaUploadLedgerPath,
          listing: url.searchParams.get("listing") || "",
          enquiry: url.searchParams.get("enquiry") || "",
          limits: uploadLimits,
        });
        return jsonResponse(listed.status, listed.body);
      }
      if (request.method === "GET") {
        let assetId = "";
        try {
          assetId = decodeURIComponent(url.pathname.slice(`${ADMIN_MEDIA_UPLOAD_PATH}/`.length));
        } catch {
          return jsonResponse(400, { kind: "bad_request", message: "Malformed upload id" });
        }
        const preview = await readMediaUploadBytes({
          ledgerPath: config.mediaUploadLedgerPath,
          assetId,
          rendition: url.searchParams.get("rendition") || "",
          storage: uploadStorage,
        });
        if (preview.status !== 200) return jsonResponse(preview.status, preview.body);
        return new Response(preview.body, {
          status: 200,
          headers: { ...SECURITY_HEADERS, "cache-control": "no-store", ...preview.headers },
        });
      }
      if (request.method !== "POST") return jsonResponse(405, { kind: "method_not_allowed" });
      const uploaded = await handleAdminMediaUpload({
        bytes: Buffer.from(await request.arrayBuffer()),
        contentType: request.headers.get("content-type") || "",
        acceptsHtml: acceptsHtmlResponse(request.headers.get("accept")),
        seed: currentSeed(config),
        limits: uploadLimits,
        storage: uploadStorage,
        ledgerPath: config.mediaUploadLedgerPath,
        uploadedBy: config.adminPrincipal?.id || "admin",
        uploadedAt: auditRecordedAt(config),
        recordAudit: (entry) => recordAudit(entry, config),
        editorPathFor: listingEditorPath,
      });
      if (uploaded.status === 303) {
        return new Response("", { status: 303, headers: { ...SECURITY_HEADERS, "cache-control": "no-store", ...uploaded.headers } });
      }
      return jsonResponse(uploaded.status, uploaded.body);
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
      // Fail closed. With the durable viewing store on, the viewing this
      // follow-up belongs to lives in Postgres while the follow-up would land
      // in a file ledger, so recording one would split the viewing's state
      // across two stores that never reconcile.
      if (config.viewingDurableStore?.viewingDurableStoreEnabled) {
        return jsonResponse(503, {
          kind: "viewing_follow_up_read_only",
          message: "Durable viewing follow-up storage is not available",
        });
      }
      const result = appendViewingFollowUpEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/seller-pipeline/outcome") {
      const result = await appendSellerPipelineOutcomeEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/public-requests/outcome") {
      const result = await appendPublicRequestOutcomeEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.idempotent ? 200 : 201, result);
    }
    if (request.method === "GET" && url.pathname === "/api/admin/viewings.ics") {
      const source = await adminLeadSource(config);
      const viewings = leadScopedRows(source)((await adminViewingSource(config)).viewings);
      return calendarResponse(renderViewingCalendar(viewings, { now: config.bookedAt }));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/deals/close") {
      const deal = await appendDealClose(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
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
    if (error instanceof LeadOperationStoreUnavailableError || error?.code === "lead_operation_store_unavailable") {
      return leadStoreUnavailable("lead_operation_store_unavailable");
    }
    if (error instanceof EventStoreUnavailableError || error?.code === "event_store_unavailable") {
      return jsonResponse(503, { kind: "event_store_unavailable", message: "Analytics storage is temporarily unavailable" });
    }
    if (error instanceof ViewingStoreUnavailableError || error?.code === "viewing_store_unavailable") {
      return jsonResponse(503, { kind: "viewing_store_unavailable", message: "Viewing storage is temporarily unavailable" });
    }
    if (error instanceof ViewingTripStoreUnavailableError || error?.code === "viewing_trip_store_unavailable") {
      return jsonResponse(503, { kind: "viewing_trip_store_unavailable", message: "Viewing trip requests are temporarily unavailable" });
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
    if (error instanceof SocialMarketingPublishError) {
      const status =
        ["social_marketing_unavailable", "social_marketing_not_connected"].includes(error.code)
          ? 503
          : ["social_marketing_uncertain", "social_marketing_conflict"].includes(error.code)
            ? 409
            : 502;
      return jsonResponse(status, { kind: error.code, message: error.message, receipt: error.receipt || null });
    }
    if (error.status === 413) return jsonResponse(413, { kind: "request_too_large" });
    if (error.status === 403) return adminForbidden(error.capability || "administration:write");
    return adminBadRequest(error);
  }
}
