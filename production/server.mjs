import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_AUDIT_LOG_PATH } from "./lib/audit-log.mjs";
import { DEFAULT_ACCOUNT_LEDGER_PATH } from "./lib/account-ledger.mjs";
import { DEFAULT_BROKER_CONTACT_LEDGER_PATH } from "./lib/broker-contacts.mjs";
import { createHttpApp } from "./lib/http.mjs";
import { DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH } from "./lib/language-requests.mjs";
import { DEFAULT_LEAD_LEDGER_PATH } from "./lib/lead-ledger.mjs";
import { DEFAULT_LEAD_ASSIGNMENT_LEDGER_PATH } from "./lib/lead-assignments.mjs";
import { DEFAULT_LEAD_CONTACT_VAULT_PATH } from "./lib/lead-contact-vault.mjs";
import { DEFAULT_LEAD_PIPELINE_OUTCOME_LEDGER_PATH } from "./lib/lead-pipeline-outcomes.mjs";
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
import { DEFAULT_SAVED_SEARCH_LEDGER_PATH } from "./lib/saved-searches.mjs";
import { DEFAULT_SELLER_PIPELINE_PATH } from "./lib/seller-pipeline.mjs";
import { DEFAULT_SELLER_PIPELINE_OUTCOME_LEDGER_PATH } from "./lib/seller-pipeline-outcomes.mjs";
import { DEFAULT_SLUG_HISTORY_PATH } from "./lib/slug-history.mjs";
import { DEFAULT_TOUR_APPROVAL_LEDGER_PATH } from "./lib/tours.mjs";
import { DEFAULT_TRANSLATION_LEDGER_PATH } from "./lib/translation-ledger.mjs";
import { DEFAULT_VIEWING_LEDGER_PATH } from "./lib/viewing-ledger.mjs";
import { DEFAULT_VIEWING_FOLLOW_UP_LEDGER_PATH } from "./lib/viewing-follow-ups.mjs";

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

function hostFrom(value) {
  const host = value === undefined || value === "" ? "0.0.0.0" : String(value);
  if (host.trim() !== host || host === "") throw new Error("HOST must be a non-empty hostname or IP address");
  return host;
}

export function productionServerConfig(env = process.env) {
  return {
    host: hostFrom(env.MS_REALTY_HOST || env.HOST),
    port: portFrom(env.MS_REALTY_PORT || env.PORT),
    maxBodyBytes: bytesFrom(env.MS_REALTY_MAX_BODY_BYTES),
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
    slugHistoryPath: env.MS_REALTY_SLUG_HISTORY_PATH || DEFAULT_SLUG_HISTORY_PATH,
    brokerContactLedgerPath: env.MS_REALTY_BROKER_CONTACT_LEDGER_PATH || DEFAULT_BROKER_CONTACT_LEDGER_PATH,
    tourApprovalLedgerPath: env.MS_REALTY_TOUR_APPROVAL_LEDGER_PATH || DEFAULT_TOUR_APPROVAL_LEDGER_PATH,
    localeRegistryPath: env.MS_REALTY_LOCALE_REGISTRY_PATH,
    redirectApprovalPath: env.MS_REALTY_REDIRECT_APPROVALS_PATH,
    deployableRedirectOutputPath: env.MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH,
    launchReadinessOutputPath: env.MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH,
    listingQualityReviewPath: env.MS_REALTY_LISTING_QUALITY_REVIEW_PATH,
    seoEvidenceInputDir: env.MS_REALTY_SEO_EVIDENCE_INPUT_DIR,
    seoEvidenceOutputPath: env.MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH,
    searchSyncReportPath: env.MS_REALTY_SEARCH_SYNC_REPORT_PATH,
    searchQueryReportPath: env.MS_REALTY_SEARCH_QUERY_REPORT_PATH,
    hermesWorkerReportPath: env.MS_REALTY_HERMES_WORKER_REPORT_PATH,
    liveServiceProvisioningReportPath: env.MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH,
    payloadRuntimeReportPath: env.MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH,
    productionRecoveryReportPath: env.MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH,
    viewingFollowUpAt: env.MS_REALTY_VIEWING_FOLLOW_UP_AT,
    publicRequestOutcomeAt: env.MS_REALTY_PUBLIC_REQUEST_OUTCOME_AT,
    leadPipelineOutcomeAt: env.MS_REALTY_LEAD_PIPELINE_OUTCOME_AT,
    replyDeliveredAt: env.MS_REALTY_REPLY_DELIVERED_AT,
    sellerPipelineOutcomeAt: env.MS_REALTY_SELLER_PIPELINE_OUTCOME_AT,
    listingPublicationAt: env.MS_REALTY_LISTING_PUBLICATION_AT,
  };
}

export function createProductionHttpApp(config = productionServerConfig()) {
  return createHttpApp({
    eventLedgerPath: config.eventLedgerPath,
    consentLedgerPath: config.consentLedgerPath,
    auditLogPath: config.auditLogPath,
    accountLedgerPath: config.accountLedgerPath,
    leadLedgerPath: config.leadLedgerPath,
    leadAssignmentLedgerPath: config.leadAssignmentLedgerPath,
    leadPipelineOutcomeLedgerPath: config.leadPipelineOutcomeLedgerPath,
    leadContactVaultPath: config.leadContactVaultPath,
    leadContactKey: config.leadContactKey,
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
    viewingFollowUpLedgerPath: config.viewingFollowUpLedgerPath,
    savedSearchLedgerPath: config.savedSearchLedgerPath,
    publicRequestOutcomeLedgerPath: config.publicRequestOutcomeLedgerPath,
    sellerPipelinePath: config.sellerPipelinePath,
    sellerPipelineOutcomeLedgerPath: config.sellerPipelineOutcomeLedgerPath,
    dealLedgerPath: config.dealLedgerPath,
    documentChecklistLedgerPath: config.documentChecklistLedgerPath,
    slugHistoryPath: config.slugHistoryPath,
    brokerContactLedgerPath: config.brokerContactLedgerPath,
    tourApprovalLedgerPath: config.tourApprovalLedgerPath,
    localeRegistryPath: config.localeRegistryPath,
    redirectApprovalPath: config.redirectApprovalPath,
    deployableRedirectOutputPath: config.deployableRedirectOutputPath,
    launchReadinessOutputPath: config.launchReadinessOutputPath,
    listingQualityReviewPath: config.listingQualityReviewPath,
    seoEvidenceInputDir: config.seoEvidenceInputDir,
    seoEvidenceOutputPath: config.seoEvidenceOutputPath,
    searchSyncReportPath: config.searchSyncReportPath,
    searchQueryReportPath: config.searchQueryReportPath,
    hermesWorkerReportPath: config.hermesWorkerReportPath,
    liveServiceProvisioningReportPath: config.liveServiceProvisioningReportPath,
    payloadRuntimeReportPath: config.payloadRuntimeReportPath,
    productionRecoveryReportPath: config.productionRecoveryReportPath,
    viewingFollowUpAt: config.viewingFollowUpAt,
    publicRequestOutcomeAt: config.publicRequestOutcomeAt,
    leadPipelineOutcomeAt: config.leadPipelineOutcomeAt,
    replyDeliveredAt: config.replyDeliveredAt,
    sellerPipelineOutcomeAt: config.sellerPipelineOutcomeAt,
    listingPublicationAt: config.listingPublicationAt,
  });
}

export function createProductionServer(config = productionServerConfig()) {
  return createNodeServer(createProductionHttpApp(config), { maxBodyBytes: config.maxBodyBytes });
}

export async function startProductionServer(config = productionServerConfig()) {
  const server = createProductionServer(config);
  const address = await listen(server, config.port, config.host);
  console.log(JSON.stringify({ kind: "ms_realty_server", status: "listening", address }));

  const shutdown = async () => {
    await close(server);
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return { server, address };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) startProductionServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
