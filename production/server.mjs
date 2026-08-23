import path from "node:path";
import { fileURLToPath } from "node:url";
import { isProductionEnvironment, searchRuntimeEnvironment } from "./lib/launch-service-contract.mjs";
import { DEFAULT_AUDIT_LOG_PATH } from "./lib/audit-log.mjs";
import { DEFAULT_ACCOUNT_LEDGER_PATH } from "./lib/account-ledger.mjs";
import { DEFAULT_BROKER_CONTACT_LEDGER_PATH } from "./lib/broker-contacts.mjs";
import { createHttpApp } from "./lib/http.mjs";
import { adminCredentials } from "./lib/admin-auth.mjs";
import { DEFAULT_CMS_SEED_PATH, loadCmsSeed } from "./lib/runtime.mjs";
import { rateLimitConfigFromEnv } from "./lib/rate-limit.mjs";
import { DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH } from "./lib/language-requests.mjs";
import { DEFAULT_LEAD_LEDGER_PATH } from "./lib/lead-ledger.mjs";
import { DEFAULT_LEAD_ASSIGNMENT_LEDGER_PATH } from "./lib/lead-assignments.mjs";
import { DEFAULT_LEAD_CONTACT_VAULT_PATH } from "./lib/lead-contact-vault.mjs";
import { leadDurableStoreConfigFromEnv } from "./lib/lead-durable-store.mjs";
import { DEFAULT_LEAD_PIPELINE_OUTCOME_LEDGER_PATH } from "./lib/lead-pipeline-outcomes.mjs";
import { providerConnectionConfigFromEnv } from "./lib/provider-connections.mjs";
import { DEFAULT_PUBLIC_CONTACT_VAULT_PATH } from "./lib/public-contact-vault.mjs";
import { DEFAULT_PUBLIC_REQUEST_OUTCOME_LEDGER_PATH } from "./lib/public-request-outcomes.mjs";
import { DEFAULT_REPLY_OUTBOX_PATH } from "./lib/lead-replies.mjs";
import { DEFAULT_REPLY_DELIVERY_OUTCOME_LEDGER_PATH } from "./lib/reply-delivery-outcomes.mjs";
import { DEFAULT_LISTING_EDIT_LEDGER_PATH } from "./lib/listing-edits.mjs";
import { DEFAULT_LISTING_PUBLICATION_SCHEDULE_PATH } from "./lib/listing-publication-schedules.mjs";
import { DEFAULT_MEDIA_REVIEW_LEDGER_PATH } from "./lib/media-reviews.mjs";
import { createNodeServer, listen, close } from "./lib/node-server.mjs";
import { DEFAULT_EVENT_LEDGER_PATH } from "./lib/events.mjs";
import { DEFAULT_CONSENT_LEDGER_PATH } from "./lib/consent-ledger.mjs";
import { DEFAULT_DEAL_LEDGER_PATH } from "./lib/deal-ledger.mjs";
import { DEFAULT_DOCUMENT_CHECKLIST_LEDGER_PATH } from "./lib/document-checklists.mjs";
import { DEFAULT_REALTY_CASE_LEDGER_PATH } from "./lib/realty-cases.mjs";
import { realtyCasePayloadAuthorityConfigFromEnv } from "./lib/realty-case-payload-authority.mjs";
import { realtyCaseRequestProjectionConfigFromEnv } from "./lib/realty-case-request-projection.mjs";
import { DEFAULT_SAVED_SEARCH_LEDGER_PATH } from "./lib/saved-searches.mjs";
import { DEFAULT_SELLER_PIPELINE_PATH } from "./lib/seller-pipeline.mjs";
import { DEFAULT_SELLER_PIPELINE_OUTCOME_LEDGER_PATH } from "./lib/seller-pipeline-outcomes.mjs";
import { DEFAULT_SLUG_HISTORY_PATH } from "./lib/slug-history.mjs";
import { DEFAULT_TOUR_APPROVAL_LEDGER_PATH } from "./lib/tours.mjs";
// Package B2: approved content.
import { DEFAULT_APPROVED_AREA_GUIDES_PATH } from "./lib/area-guides.mjs";
import { DEFAULT_APPROVED_FINANCING_PARTNERS_PATH } from "./lib/financing-partners.mjs";
import { DEFAULT_APPROVED_PURCHASE_FEES_PATH } from "./lib/purchase-fees.mjs";
import { DEFAULT_APPROVED_TEAM_PROFILES_PATH } from "./lib/team-profiles.mjs";
import { DEFAULT_TRANSLATION_LEDGER_PATH } from "./lib/translation-ledger.mjs";
import { DEFAULT_VIEWING_LEDGER_PATH } from "./lib/viewing-ledger.mjs";
import { viewingDurableStoreConfigFromEnv } from "./lib/viewing-durable-store.mjs";
import { DEFAULT_VIEWING_FOLLOW_UP_LEDGER_PATH } from "./lib/viewing-follow-ups.mjs";
import { DEFAULT_LAUNCH_FREEZE_PATH } from "./lib/launch-freeze.mjs";
import { DEFAULT_WORKSPACE_SETTINGS_PATH } from "./lib/workspace-settings.mjs";

function portFrom(value) {
  const raw = value === undefined || value === "" ? "3000" : String(value);
  if (!/^\d+$/.test(raw)) throw new Error("PORT must be an integer from 0 to 65535");
  const port = Number(raw);
  if (port > 65535) throw new Error("PORT must be an integer from 0 to 65535");
  return port;
}

function bytesFrom(value) {
  const raw = value === undefined || value === "" ? String(10 * 1024 * 1024) : String(value);
  if (!/^\d+$/.test(raw)) throw new Error("MS_REALTY_MAX_BODY_BYTES must be a positive integer");
  const bytes = Number(raw);
  if (bytes < 1) throw new Error("MS_REALTY_MAX_BODY_BYTES must be a positive integer");
  return bytes;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost", "loopback"]);

function hostFrom(value) {
  // Default to loopback. A bare `npm start` must not expose a mutation-capable
  // admin on every interface; binding beyond loopback is a deliberate,
  // guarded choice (see assertSafeBind).
  const host = value === undefined || value === "" ? "127.0.0.1" : String(value);
  if (host.trim() !== host || host === "") throw new Error("HOST must be a non-empty hostname or IP address");
  return host;
}

export function isLoopbackHost(host) {
  return LOOPBACK_HOSTS.has(String(host || "").trim().toLowerCase());
}

// A non-loopback bind reaches other machines, so it must not run with the
// development admin fallback. Require production mode and a real operator
// credential registry before listening on a public interface.
export function assertSafeBind(config, env = process.env) {
  if (isLoopbackHost(config.host)) return;
  const problems = [];
  if (env.NODE_ENV !== "production") problems.push("NODE_ENV must be 'production'");
  let hasRegistry = false;
  try {
    hasRegistry = adminCredentials(env).length > 0;
  } catch (error) {
    problems.push(`MS_REALTY_ADMIN_CREDENTIALS_JSON is invalid: ${error.message}`);
  }
  if (!hasRegistry) problems.push("MS_REALTY_ADMIN_CREDENTIALS_JSON must define at least one operator");
  if (problems.length) {
    throw new Error(
      `Refusing to bind ${config.host} without production credentials: ${problems.join("; ")}. ` +
        "Bind 127.0.0.1 for local use, or supply production configuration.",
    );
  }
}

export function productionServerConfig(env = process.env) {
  const production = isProductionEnvironment(env.NODE_ENV);
  return {
    host: hostFrom(env.MS_REALTY_HOST || env.HOST),
    port: portFrom(env.MS_REALTY_PORT || env.PORT),
    runtimeDataDurableOnly: production && env.MS_REALTY_RUNTIME_DATA_AUTHORITY === "payload",
    maxBodyBytes: bytesFrom(env.MS_REALTY_MAX_BODY_BYTES),
    rateLimit: rateLimitConfigFromEnv(env),
    cmsSeedPath: env.MS_REALTY_CMS_SEED_PATH || DEFAULT_CMS_SEED_PATH,
    search: {
      engine: "postgres",
      environment: env.NODE_ENV,
      postgres: {
        env: searchRuntimeEnvironment(env),
      },
      typesense: production ? {} : {
        baseUrl: env.TYPESENSE_URL,
        apiKey: env.TYPESENSE_API_KEY,
        collectionName: env.TYPESENSE_COLLECTION || "ms_realty_listings",
      },
      meilisearch: production ? {} : {
        baseUrl: env.MEILI_URL,
        apiKey: env.MEILI_API_KEY,
        indexName: env.MEILI_INDEX || "ms_realty_listings",
      },
      fetchImpl: globalThis.fetch,
    },
    eventLedgerPath: env.MS_REALTY_EVENT_LEDGER_PATH || DEFAULT_EVENT_LEDGER_PATH,
    consentLedgerPath: env.MS_REALTY_CONSENT_LEDGER_PATH || DEFAULT_CONSENT_LEDGER_PATH,
    auditLogPath: env.MS_REALTY_AUDIT_LOG_PATH || DEFAULT_AUDIT_LOG_PATH,
    accountLedgerPath: env.MS_REALTY_ACCOUNT_LEDGER_PATH || DEFAULT_ACCOUNT_LEDGER_PATH,
    leadLedgerPath: env.MS_REALTY_LEAD_LEDGER_PATH || DEFAULT_LEAD_LEDGER_PATH,
    leadAssignmentLedgerPath: env.MS_REALTY_LEAD_ASSIGNMENT_LEDGER_PATH || DEFAULT_LEAD_ASSIGNMENT_LEDGER_PATH,
    leadPipelineOutcomeLedgerPath:
      env.MS_REALTY_LEAD_PIPELINE_OUTCOME_LEDGER_PATH || DEFAULT_LEAD_PIPELINE_OUTCOME_LEDGER_PATH,
    leadContactVaultPath:
      env.MS_REALTY_LEAD_CONTACT_VAULT_PATH || (env.NODE_ENV === "production" ? DEFAULT_LEAD_CONTACT_VAULT_PATH : null),
    leadContactKey: env.MS_REALTY_LEAD_CONTACT_KEY,
    leadDurableStore: leadDurableStoreConfigFromEnv(env),
    leadDurablePayload: undefined,
    publicContactVaultPath:
      env.MS_REALTY_PUBLIC_CONTACT_VAULT_PATH || (env.NODE_ENV === "production" ? DEFAULT_PUBLIC_CONTACT_VAULT_PATH : null),
    publicContactKey: env.MS_REALTY_PUBLIC_CONTACT_KEY || env.MS_REALTY_LEAD_CONTACT_KEY,
    replyOutboxPath: env.MS_REALTY_REPLY_OUTBOX_PATH || DEFAULT_REPLY_OUTBOX_PATH,
    replyDeliveryOutcomeLedgerPath:
      env.MS_REALTY_REPLY_DELIVERY_OUTCOME_LEDGER_PATH || DEFAULT_REPLY_DELIVERY_OUTCOME_LEDGER_PATH,
    languageRequestPath: env.MS_REALTY_LANGUAGE_REQUEST_LEDGER_PATH || DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH,
    translationLedgerPath: env.MS_REALTY_TRANSLATION_LEDGER_PATH || DEFAULT_TRANSLATION_LEDGER_PATH,
    listingEditLedgerPath: env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || DEFAULT_LISTING_EDIT_LEDGER_PATH,
    mediaReviewLedgerPath: env.MS_REALTY_MEDIA_REVIEW_LEDGER_PATH || DEFAULT_MEDIA_REVIEW_LEDGER_PATH,
    listingPublicationSchedulePath:
      env.MS_REALTY_LISTING_PUBLICATION_SCHEDULE_PATH || DEFAULT_LISTING_PUBLICATION_SCHEDULE_PATH,
    viewingLedgerPath: env.MS_REALTY_VIEWING_LEDGER_PATH || DEFAULT_VIEWING_LEDGER_PATH,
    viewingDurableStore: viewingDurableStoreConfigFromEnv(env),
    viewingDurablePayload: undefined,
    viewingFollowUpLedgerPath: env.MS_REALTY_VIEWING_FOLLOW_UP_LEDGER_PATH || DEFAULT_VIEWING_FOLLOW_UP_LEDGER_PATH,
    savedSearchLedgerPath: env.MS_REALTY_SAVED_SEARCH_LEDGER_PATH || DEFAULT_SAVED_SEARCH_LEDGER_PATH,
    publicRequestOutcomeLedgerPath:
      env.MS_REALTY_PUBLIC_REQUEST_OUTCOME_LEDGER_PATH || DEFAULT_PUBLIC_REQUEST_OUTCOME_LEDGER_PATH,
    sellerPipelinePath: env.MS_REALTY_SELLER_PIPELINE_PATH || DEFAULT_SELLER_PIPELINE_PATH,
    sellerPipelineOutcomeLedgerPath:
      env.MS_REALTY_SELLER_PIPELINE_OUTCOME_PATH ||
      env.MS_REALTY_SELLER_PIPELINE_OUTCOME_LEDGER_PATH ||
      DEFAULT_SELLER_PIPELINE_OUTCOME_LEDGER_PATH,
    dealLedgerPath: env.MS_REALTY_DEAL_LEDGER_PATH || DEFAULT_DEAL_LEDGER_PATH,
    documentChecklistLedgerPath:
      env.MS_REALTY_DOCUMENT_CHECKLIST_LEDGER_PATH || DEFAULT_DOCUMENT_CHECKLIST_LEDGER_PATH,
    realtyCaseLedgerPath: env.MS_REALTY_CASE_LEDGER_PATH || DEFAULT_REALTY_CASE_LEDGER_PATH,
    ...realtyCaseRequestProjectionConfigFromEnv(env),
    ...realtyCasePayloadAuthorityConfigFromEnv(env),
    slugHistoryPath: env.MS_REALTY_SLUG_HISTORY_PATH || DEFAULT_SLUG_HISTORY_PATH,
    brokerContactLedgerPath: env.MS_REALTY_BROKER_CONTACT_LEDGER_PATH || DEFAULT_BROKER_CONTACT_LEDGER_PATH,
    tourApprovalLedgerPath: env.MS_REALTY_TOUR_APPROVAL_LEDGER_PATH || DEFAULT_TOUR_APPROVAL_LEDGER_PATH,
    approvedTeamProfilePath: env.MS_REALTY_APPROVED_TEAM_PROFILES_PATH || DEFAULT_APPROVED_TEAM_PROFILES_PATH,
    approvedAreaGuidePath: env.MS_REALTY_APPROVED_AREA_GUIDES_PATH || DEFAULT_APPROVED_AREA_GUIDES_PATH,
    approvedFinancingPartnerPath:
      env.MS_REALTY_APPROVED_FINANCING_PARTNERS_PATH || DEFAULT_APPROVED_FINANCING_PARTNERS_PATH,
    approvedPurchaseFeePath: env.MS_REALTY_APPROVED_PURCHASE_FEES_PATH || DEFAULT_APPROVED_PURCHASE_FEES_PATH,
    localeRegistryPath: env.MS_REALTY_LOCALE_REGISTRY_PATH,
    redirectApprovalPath: env.MS_REALTY_REDIRECT_APPROVALS_PATH,
    deployableRedirectOutputPath: env.MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH,
    launchFreezePath: env.MS_REALTY_LAUNCH_FREEZE_PATH || DEFAULT_LAUNCH_FREEZE_PATH,
    workspaceSettingsPath: env.MS_REALTY_WORKSPACE_SETTINGS_PATH || DEFAULT_WORKSPACE_SETTINGS_PATH,
    launchReadinessOutputPath: env.MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH,
    listingQualityReviewPath: env.MS_REALTY_LISTING_QUALITY_REVIEW_PATH,
    seoEvidenceInputDir: env.MS_REALTY_SEO_EVIDENCE_INPUT_DIR,
    seoEvidenceOutputPath: env.MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH,
    searchSyncReportPath: env.MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH || env.MS_REALTY_SEARCH_SYNC_REPORT_PATH,
    searchQueryReportPath: env.MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH || env.MS_REALTY_SEARCH_QUERY_REPORT_PATH,
    hermesWorkerReportPath: env.MS_REALTY_HERMES_WORKER_REPORT_PATH,
    liveServiceProvisioningReportPath: env.MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH,
    monitoringRollbackReportPath: env.MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH,
    payloadRuntimeReportPath: env.MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH,
    productionRecoveryReportPath: env.MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH,
    providerConnection: providerConnectionConfigFromEnv(env),
    providerConnectionPayload: undefined,
    providerWebhookPayload: undefined,
    providerWebhookReceivedAt: env.MS_REALTY_PROVIDER_WEBHOOK_RECEIVED_AT,
    providerFetch: globalThis.fetch,
    productionRecoverySigningPublicKey: env.MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY,
    viewingFollowUpAt: env.MS_REALTY_VIEWING_FOLLOW_UP_AT,
    publicRequestOutcomeAt: env.MS_REALTY_PUBLIC_REQUEST_OUTCOME_AT,
    leadPipelineOutcomeAt: env.MS_REALTY_LEAD_PIPELINE_OUTCOME_AT,
    replyDeliveredAt: env.MS_REALTY_REPLY_DELIVERED_AT,
    sellerPipelineOutcomeAt: env.MS_REALTY_SELLER_PIPELINE_OUTCOME_AT,
    receivedAt: env.MS_REALTY_RECEIVED_AT,
    sellerPipelineCreatedAt: env.MS_REALTY_SELLER_PIPELINE_CREATED_AT,
    listingPublicationAt: env.MS_REALTY_LISTING_PUBLICATION_AT,
    realtyCaseRecordedAt: env.MS_REALTY_CASE_RECORDED_AT,
  };
}

export function createProductionHttpApp(config = productionServerConfig()) {
  return createHttpApp({
    seed: loadCmsSeed(config.cmsSeedPath),
    rateLimit: config.rateLimit,
    search: config.search,
    eventLedgerPath: config.eventLedgerPath,
    consentLedgerPath: config.consentLedgerPath,
    auditLogPath: config.auditLogPath,
    accountLedgerPath: config.accountLedgerPath,
    payloadAdminAuth: config.payloadAdminAuth,
    leadLedgerPath: config.leadLedgerPath,
    leadAssignmentLedgerPath: config.leadAssignmentLedgerPath,
    leadPipelineOutcomeLedgerPath: config.leadPipelineOutcomeLedgerPath,
    leadContactVaultPath: config.leadContactVaultPath,
    leadContactKey: config.leadContactKey,
    leadDurableStore: config.leadDurableStore,
    leadDurablePayload: config.leadDurablePayload,
    persistLeadIntake: config.persistLeadIntake,
    readLeadIntakes: config.readLeadIntakes,
    publicContactVaultPath: config.publicContactVaultPath,
    publicContactKey: config.publicContactKey,
    replyOutboxPath: config.replyOutboxPath,
    replyDeliveryOutcomeLedgerPath: config.replyDeliveryOutcomeLedgerPath,
    languageRequestPath: config.languageRequestPath,
    translationLedgerPath: config.translationLedgerPath,
    listingEditLedgerPath: config.listingEditLedgerPath,
    mediaReviewLedgerPath: config.mediaReviewLedgerPath,
    listingPublicationSchedulePath: config.listingPublicationSchedulePath,
    viewingLedgerPath: config.viewingLedgerPath,
    viewingDurableStore: config.viewingDurableStore,
    viewingDurablePayload: config.viewingDurablePayload,
    viewingFollowUpLedgerPath: config.viewingFollowUpLedgerPath,
    savedSearchLedgerPath: config.savedSearchLedgerPath,
    publicRequestOutcomeLedgerPath: config.publicRequestOutcomeLedgerPath,
    sellerPipelinePath: config.sellerPipelinePath,
    sellerPipelineOutcomeLedgerPath: config.sellerPipelineOutcomeLedgerPath,
    dealLedgerPath: config.dealLedgerPath,
    documentChecklistLedgerPath: config.documentChecklistLedgerPath,
    realtyCaseLedgerPath: config.realtyCaseLedgerPath,
    realtyCaseRequestProjectionEnabled: config.realtyCaseRequestProjectionEnabled,
    realtyCaseWorkspaceId: config.realtyCaseWorkspaceId,
    realtyCasePayloadRuntimeConfigured: config.realtyCasePayloadRuntimeConfigured,
    realtyCasePayloadAuthorityEnabled: config.realtyCasePayloadAuthorityEnabled,
    realtyCasePayload: config.realtyCasePayload,
    slugHistoryPath: config.slugHistoryPath,
    brokerContactLedgerPath: config.brokerContactLedgerPath,
    tourApprovalLedgerPath: config.tourApprovalLedgerPath,
    approvedTeamProfilePath: config.approvedTeamProfilePath,
    approvedAreaGuidePath: config.approvedAreaGuidePath,
    approvedFinancingPartnerPath: config.approvedFinancingPartnerPath,
    approvedPurchaseFeePath: config.approvedPurchaseFeePath,
    localeRegistryPath: config.localeRegistryPath,
    redirectApprovalPath: config.redirectApprovalPath,
    deployableRedirectOutputPath: config.deployableRedirectOutputPath,
    launchReadinessOutputPath: config.launchReadinessOutputPath,
    workspaceSettingsPath: config.workspaceSettingsPath,
    listingQualityReviewPath: config.listingQualityReviewPath,
    seoEvidenceInputDir: config.seoEvidenceInputDir,
    seoEvidenceOutputPath: config.seoEvidenceOutputPath,
    searchSyncReportPath: config.searchSyncReportPath,
    searchQueryReportPath: config.searchQueryReportPath,
    hermesWorkerReportPath: config.hermesWorkerReportPath,
    liveServiceProvisioningReportPath: config.liveServiceProvisioningReportPath,
    monitoringRollbackReportPath: config.monitoringRollbackReportPath,
    payloadRuntimeReportPath: config.payloadRuntimeReportPath,
    productionRecoveryReportPath: config.productionRecoveryReportPath,
    providerConnection: config.providerConnection,
    providerConnectionPayload: config.providerConnectionPayload,
    providerWebhookPayload: config.providerWebhookPayload,
    providerWebhookReceivedAt: config.providerWebhookReceivedAt,
    providerFetch: config.providerFetch,
    productionRecoverySigningPublicKey: config.productionRecoverySigningPublicKey,
    viewingFollowUpAt: config.viewingFollowUpAt,
    publicRequestOutcomeAt: config.publicRequestOutcomeAt,
    leadPipelineOutcomeAt: config.leadPipelineOutcomeAt,
    replyDeliveredAt: config.replyDeliveredAt,
    sellerPipelineOutcomeAt: config.sellerPipelineOutcomeAt,
    receivedAt: config.receivedAt,
    sellerPipelineCreatedAt: config.sellerPipelineCreatedAt,
    listingPublicationAt: config.listingPublicationAt,
    realtyCaseRecordedAt: config.realtyCaseRecordedAt,
    runtimeDataDurableOnly: config.runtimeDataDurableOnly,
  });
}

export function createProductionServer(config = productionServerConfig()) {
  return createNodeServer(createProductionHttpApp(config), { maxBodyBytes: config.maxBodyBytes });
}

export async function startProductionServer(config = productionServerConfig()) {
  assertSafeBind(config);
  const server = createProductionServer(config);
  const address = await listen(server, config.port, config.host);
  console.log(JSON.stringify({ kind: "ms_realty_server", status: "listening", address }));

  const shutdown = async () => {
    await close(server);
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  // Payload's Postgres bootstrap leaves a rejected promise unobserved when the
  // database is unreachable (seen on /admin/team without a local database).
  // A long-running origin logs that and keeps serving instead of exiting.
  process.on("unhandledRejection", (reason) => {
    console.error(
      JSON.stringify({
        kind: "unhandled_rejection",
        message: reason?.message || String(reason),
        code: reason?.code,
        stack: typeof reason?.stack === "string" ? reason.stack.split("\n").slice(0, 6).join("\n") : undefined,
      }),
    );
  });
  return { server, address };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) startProductionServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
