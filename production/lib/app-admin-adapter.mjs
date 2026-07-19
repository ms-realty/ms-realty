import fs from "node:fs";
import { bindAuthenticatedOperator, canAdminMutate, resolveAdminPrincipal, withAuthenticatedAuditActor } from "./admin-auth.mjs";
import { DEFAULT_AUDIT_LOG_PATH, appendAuditLog, createAuditLogEntry, readAuditLog } from "./audit-log.mjs";
import { importAppSeoEvidenceRows, readAppSeoEvidence, readAppSeoEvidenceTemplate, seoEvidencePayload } from "./app-seo-evidence.mjs";
import { buildSeoEvidencePreflightReportFromEvidence } from "./seo-evidence-contract.mjs";
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
import { DEFAULT_LEAD_LEDGER_PATH, readLeadLedger } from "./lead-ledger.mjs";
import { DEFAULT_LEAD_CONTACT_VAULT_PATH, withLeadContacts } from "./lead-contact-vault.mjs";
import {
  DEFAULT_LEAD_PIPELINE_OUTCOME_LEDGER_PATH,
  appendLeadPipelineOutcome,
  buildLeadPipelineQueue,
  readLeadPipelineOutcomes,
} from "./lead-pipeline-outcomes.mjs";
import { DEFAULT_REPLY_OUTBOX_PATH, appendReviewedReply, createHermesReplyDraft, readReplyOutbox } from "./lead-replies.mjs";
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
  buildListingQualityReviewPacket,
  buildListingQualityPreflightReport,
  buildListingQualityReport,
  listingQualityImportSummary,
  renderListingQualityReviewDraft,
  renderListingQualityWorkbook,
  validateListingQualityReviewCsv,
  writeCompleteListingQualityReviewCsv,
} from "./listing-quality.mjs";
import { addLocaleToRegistry, loadLocaleRegistry, requiredAdminLocales, requiredPublicLocales, websiteLanguageCoverage, writeLocaleRegistry } from "./locales.mjs";
import { loadCmsCollections } from "./cms-seed.mjs";
import { loadPayloadCollections } from "./payload-collections.mjs";
import { payloadRuntimeImportSummary, writePayloadRuntimeReport } from "./payload-runtime.mjs";
import { payloadRuntimeBootstrapPayload } from "./payload-runtime-bootstrap.mjs";
import { DEFAULT_PUBLIC_CONTACT_VAULT_PATH, readPublicContacts } from "./public-contact-vault.mjs";
import {
  DEFAULT_PUBLIC_REQUEST_OUTCOME_LEDGER_PATH,
  appendPublicRequestOutcome,
  buildPublicRequestQueue,
  readPublicRequestOutcomes,
} from "./public-request-outcomes.mjs";
import { loadCmsSeed } from "./runtime.mjs";
import { summarizeLegacyRouteMap } from "./migration.mjs";
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
import { DEFAULT_SELLER_PIPELINE_PATH, readSellerPipeline } from "./seller-pipeline.mjs";
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
import {
  DEFAULT_TRANSLATION_LEDGER_PATH,
  appendTranslationTask,
  latestTranslationTasks,
  readTranslationLedger,
} from "./translation-ledger.mjs";
import { buildTranslationCoverageReport } from "./translation-coverage.mjs";
import { DEFAULT_VIEWING_LEDGER_PATH, appendViewing, readViewings, renderViewingCalendar } from "./viewing-ledger.mjs";
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
    brokerContactLedgerPath: env.MS_REALTY_BROKER_CONTACT_LEDGER_PATH || DEFAULT_BROKER_CONTACT_LEDGER_PATH,
    dealLedgerPath: env.MS_REALTY_DEAL_LEDGER_PATH || DEFAULT_DEAL_LEDGER_PATH,
    deployableRedirectOutputPath: env.MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH || DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT,
    languageRequestPath: env.MS_REALTY_LANGUAGE_REQUEST_LEDGER_PATH || DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH,
    launchReadinessOutputPath: env.MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH,
    leadLedgerPath: env.MS_REALTY_LEAD_LEDGER_PATH || DEFAULT_LEAD_LEDGER_PATH,
    leadPipelineOutcomeLedgerPath:
      env.MS_REALTY_LEAD_PIPELINE_OUTCOME_LEDGER_PATH || DEFAULT_LEAD_PIPELINE_OUTCOME_LEDGER_PATH,
    leadContactVaultPath:
      env.MS_REALTY_LEAD_CONTACT_VAULT_PATH || (env.NODE_ENV === "production" ? DEFAULT_LEAD_CONTACT_VAULT_PATH : null),
    leadContactKey: env.MS_REALTY_LEAD_CONTACT_KEY,
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
    payloadRuntimeReportPath: env.MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH,
    localeRegistryPath: env.MS_REALTY_LOCALE_REGISTRY_PATH,
    listingEditLedgerPath: env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || DEFAULT_LISTING_EDIT_LEDGER_PATH,
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
    viewingFollowUpLedgerPath: env.MS_REALTY_VIEWING_FOLLOW_UP_LEDGER_PATH || DEFAULT_VIEWING_FOLLOW_UP_LEDGER_PATH,
    bookedAt: env.MS_REALTY_BOOKED_AT,
    viewingFollowUpAt: env.MS_REALTY_VIEWING_FOLLOW_UP_AT,
    sellerPipelineOutcomeAt: env.MS_REALTY_SELLER_PIPELINE_OUTCOME_AT,
    dealClosedAt: env.MS_REALTY_DEAL_CLOSED_AT,
    editedAt: env.MS_REALTY_EDITED_AT,
    reviewedAt: env.MS_REALTY_REVIEWED_AT,
    publicRequestOutcomeAt: env.MS_REALTY_PUBLIC_REQUEST_OUTCOME_AT,
    leadPipelineOutcomeAt: env.MS_REALTY_LEAD_PIPELINE_OUTCOME_AT,
    replyDeliveredAt: env.MS_REALTY_REPLY_DELIVERED_AT,
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

function adminBadRequest(error) {
  return new Response(JSON.stringify({ kind: "bad_request", message: error.message }), {
    status: 400,
    headers: PRIVATE_JSON_HEADERS,
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

function currentListingQualityReport(config, options = {}) {
  return buildListingQualityReport({
    seed: currentSeed(config),
    tourApprovals: readTourApprovals(config.tourApprovalLedgerPath),
    ...options,
  });
}

function auditRecordedAt(config) {
  return config.reviewedAt || config.editedAt || config.bookedAt || config.dealClosedAt || new Date().toISOString();
}

function recordAudit(input, config, recordedAt = auditRecordedAt(config)) {
  return appendAuditLog(createAuditLogEntry(withAuthenticatedAuditActor(input, config.adminPrincipal), recordedAt), {
    filePath: config.auditLogPath,
  });
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

function leadInboxPayload(registry, url, config) {
  const leads = withLeadContacts(readLeadLedger(config.leadLedgerPath), {
    filePath: config.leadContactVaultPath,
    secret: config.leadContactKey,
  });
  const replies = readReplyOutbox(config.replyOutboxPath);
  const viewings = readViewings(config.viewingLedgerPath);
  const viewingFollowUps = readViewingFollowUps(config.viewingFollowUpLedgerPath);
  const deals = readDeals(config.dealLedgerPath);
  const sellerPipeline = readSellerPipeline(config.sellerPipelinePath);
  const sellerPipelineOutcomes = readSellerPipelineOutcomes(config.sellerPipelineOutcomeLedgerPath);
  return renderAdminLeadsPayload(registry, url.searchParams.get("locale") || "en", {
    leads,
    leadPipelineQueue: buildLeadPipelineQueue(
      {
        leads,
        outcomes: readLeadPipelineOutcomes(config.leadPipelineOutcomeLedgerPath),
        viewings,
        viewingFollowUps,
        deals,
      },
      { now: config.leadPipelineOutcomeAt || config.reviewedAt || config.bookedAt || new Date().toISOString() },
    ),
    replies,
    replyDeliveryQueue: buildReplyDeliveryQueue(
      replies,
      readReplyDeliveryOutcomes(config.replyDeliveryOutcomeLedgerPath),
    ),
    languageRequests: readLanguageRequests(config.languageRequestPath),
    translationTasks: latestTranslationTasks(readTranslationLedger(config.translationLedgerPath)),
    listingEdits: readListingEdits(config.listingEditLedgerPath),
    leadSlaGeneratedAt: config.reviewedAt,
    operatorId: config.adminPrincipal?.id || null,
    viewings,
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

function requestsPayload(registry, url, config) {
  return operationalQueuePayload(registry, url, config, {
    kind: "admin_requests",
    path: "/admin/requests",
    titleKey: "requestsWorkspace",
    descriptionKey: "requestsDescription",
  });
}

function pipelinePayload(registry, url, config) {
  return operationalQueuePayload(registry, url, config, {
    kind: "admin_lead_pipeline",
    path: "/admin/pipeline",
    titleKey: "pipelineWorkspace",
    descriptionKey: "pipelineDescription",
  });
}

function operationalQueuePayload(registry, url, config, { kind, path, titleKey, descriptionKey }) {
  const payload = leadInboxPayload(registry, url, config);
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

function todayPayload(registry, url, config) {
  return operationalQueuePayload(registry, url, config, {
    kind: "admin_today",
    path: "/admin/today",
    titleKey: "today",
    descriptionKey: "todayDescription",
  });
}

function viewingsPayload(registry, url, config) {
  return operationalQueuePayload(registry, url, config, {
    kind: "admin_viewings",
    path: "/admin/viewings",
    titleKey: "viewingsWorkspace",
    descriptionKey: "viewingsDescription",
  });
}

function activityPayload(registry, url, config) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale: url.searchParams.get("locale") || "en" });
  const auditLog = readAuditLog(config.auditLogPath).toReversed();
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
    workspace: config.adminPrincipal?.id ? { ...workspace, operator_id: config.adminPrincipal.id } : workspace,
    auditLog,
    summary: {
      totalActions: auditLog.length,
      activeOperators: new Set(auditLog.map((row) => row.actor)).size,
      objectTypes: new Set(auditLog.map((row) => row.object_type)).size,
    },
  };
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
    readTourApprovals(config.tourApprovalLedgerPath),
  );
}

function pageNumber(value) {
  const parsed = Number.parseInt(String(value || "1"), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function pagedRows(rows, page, pageSize = 25) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * pageSize;
  return {
    rows: rows.slice(offset, offset + pageSize),
    pagination: { page: currentPage, pageSize, totalRows: rows.length, totalPages },
  };
}

function listingManagerPayload(registry, url, config) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale: url.searchParams.get("locale") || "en" });
  const seed = currentSeed(config);
  const translationTasks = latestTranslationTasks(readTranslationLedger(config.translationLedgerPath));
  const translationCoverage = buildTranslationCoverageReport({
    registry,
    seed,
    translationTasks,
    generatedAt: config.reviewedAt || new Date().toISOString(),
  });
  const translationReviewByListing = translationCoverage.rows.reduce((counts, row) => {
    counts.set(row.listing_id, (counts.get(row.listing_id) || 0) + 1);
    return counts;
  }, new Map());
  const query = String(url.searchParams.get("q") || "").trim().toLocaleLowerCase();
  const status = String(url.searchParams.get("status") || "").trim();
  const sourceLocale = String(url.searchParams.get("sourceLocale") || "").trim();
  const allRows = seed.records
    .filter((record) => record.collection === "listings")
    .map((record) => {
      const facts = record.facts || {};
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
        source_locale: record.source_locale,
        source_domain: record.source_domain,
        listing_status: facts.listing_status || "available",
        cms_status: record.cms_status || "source_imported_review_required",
        price_eur: facts.price_eur ?? null,
        price_on_request: facts.price_on_request === true,
        public_gallery_assets: record.media_workflow?.public_gallery_assets || 0,
        metadata_gaps: metadataGaps,
        translation_locales: [...latestByLocale.keys()].filter(Boolean).sort(),
        translation_review_required: translationReviewByListing.get(record.id) || 0,
        review_required: record.routing?.review_required === true || metadataGaps > 0,
        editor_path: `/admin/listings/edit?listingId=${encodeURIComponent(record.id)}`,
      };
    });
  const filtered = allRows.filter((row) => {
    if (status && row.listing_status !== status && row.cms_status !== status) return false;
    if (sourceLocale && row.source_locale !== sourceLocale) return false;
    if (!query) return true;
    return [row.id, row.title, row.location, row.source_domain].some((value) => String(value || "").toLocaleLowerCase().includes(query));
  });
  const page = pagedRows(filtered, pageNumber(url.searchParams.get("page")));
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
    workspace: config.adminPrincipal?.id ? { ...workspace, operator_id: config.adminPrincipal.id } : workspace,
    listings: page.rows,
    filters: { q: query, status, sourceLocale },
    filterOptions: {
      statuses: [...new Set(allRows.flatMap((row) => [row.listing_status, row.cms_status]))].filter(Boolean).sort(),
      sourceLocales: [...new Set(allRows.map((row) => row.source_locale))].filter(Boolean).sort(),
    },
    pagination: page.pagination,
    summary: {
      total: allRows.length,
      visible: filtered.length,
      reviewRequired: allRows.filter((row) => row.review_required).length,
      priceOnRequest: allRows.filter((row) => row.price_on_request).length,
      translationReviewRequired: allRows.filter((row) => row.translation_review_required > 0).length,
    },
  };
}

function translationQueuePayload(registry, url, config) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale: url.searchParams.get("locale") || "en" });
  const seed = currentSeed(config);
  const tasks = latestTranslationTasks(readTranslationLedger(config.translationLedgerPath));
  const coverage = buildTranslationCoverageReport({
    registry,
    seed,
    translationTasks: tasks,
    generatedAt: config.reviewedAt || new Date().toISOString(),
  });
  const listings = new Map(
    seed.records
      .filter((record) => record.collection === "listings")
      .map((record) => [record.id, record]),
  );
  const taskByObjectLocale = new Map(tasks.map((task) => [`${task.object_id}:${task.target_locale || task.locale}`, task]));
  const query = String(url.searchParams.get("q") || "").trim().toLocaleLowerCase();
  const targetLocale = String(url.searchParams.get("targetLocale") || "").trim();
  const taskType = String(url.searchParams.get("taskType") || "").trim();
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
  const approvedRows = tasks
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
    if (targetLocale && row.target_locale !== targetLocale) return false;
    if (taskType && row.task_type !== taskType && row.current_status !== taskType) return false;
    if (!query) return true;
    return [row.listing_id, row.listing_title, row.listing_location].some((value) => String(value || "").toLocaleLowerCase().includes(query));
  });
  const page = pagedRows(filtered, pageNumber(url.searchParams.get("page")));
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
    workspace: config.adminPrincipal?.id ? { ...workspace, operator_id: config.adminPrincipal.id } : workspace,
    translationTasks: page.rows,
    filters: { q: query, targetLocale, taskType },
    filterOptions: {
      targetLocales: [...new Set(allRows.map((row) => row.target_locale))].filter(Boolean).sort(),
      taskTypes: [...new Set(allRows.map((row) => row.task_type))].filter(Boolean).sort(),
    },
    pagination: page.pagination,
    summary: {
      ...coverage.summary,
      open_translation_tasks: allRows.length,
      approved_waiting_publish: approvedRows.length,
    },
  };
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
    payloadRuntime: payloadRuntimeState(config.payloadRuntimeReportPath || undefined),
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
    redirectWorkbookCsv: renderRedirectApprovalWorkbook(buildRedirectApprovalWorkbook(routes)),
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
    },
  };
}

function migrationReviewPayload(registry, url, config) {
  const routes = routeMapRows();
  const workspace = renderAdminWorkspace({ registry, requestedLocale: url.searchParams.get("locale") || "en" });
  const reviewRequired = routes.filter((route) => route.review_required);
  const mappedListings = routes.filter((route) => route.url_type === "listing" && route.target_path);
  const readiness = launchReadiness(config);
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
      terminalDecisionsReviewed: currentLegacyRouteDecisions(config).length,
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
    listingQuality: currentListingQualityReport(config, { generatedAt: config.reviewedAt, limit: 20 }),
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
    payloadRuntimeEndpoint: "/api/admin/payload-runtime",
    payloadRuntimeBootstrapEndpoint: "/api/admin/payload-runtime-bootstrap",
    cmsCollectionsEndpoint: "/api/admin/cms-collections",
    payloadCollectionsEndpoint: "/api/admin/payload-collections",
    listingQualityEndpoint: "/api/admin/listing-quality",
    deployablePreview: currentDeployableRedirects(config),
    terminalDecisionPreview: currentLegacyRouteDecisions(config),
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
  return createHermesReplyDraft(readLeadLedger(config.leadLedgerPath), input, {
    auditLogPath: config.auditLogPath,
    provider: config.hermesReplyProvider || undefined,
    recordedAt: config.reviewedAt || config.editedAt,
  });
}

function attributedListingEditInput(input, config) {
  let attributed = bindAuthenticatedOperator(listingEditInput(input), config.adminPrincipal, ["editor"]);
  if (attributed.mediaReviewer) {
    attributed = bindAuthenticatedOperator(attributed, config.adminPrincipal, ["mediaReviewer"]);
  }
  return attributed;
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

function appendEditorChange(input, config) {
  const translationTasks = latestTranslationTasks(readTranslationLedger(config.translationLedgerPath));
  const result = createListingEdit(currentSeed(config), attributedListingEditInput(input, config), translationTasks, config.editedAt);
  return persistEditorChange(result, config);
}

function appendBulkListingStatusChanges(input, config) {
  const attributed = bindAuthenticatedOperator(input, config.adminPrincipal, ["editor"]);
  const translationTasks = latestTranslationTasks(readTranslationLedger(config.translationLedgerPath));
  const batch = createBulkListingStatusEdits(currentSeed(config), attributed, translationTasks, config.editedAt);
  const changes = batch.changes.map((result) => persistEditorChange(result, config));
  return {
    kind: "bulk_listing_status_update",
    targetStatus: batch.targetStatus,
    requested: batch.requestedListingIds.length,
    updated: changes.filter((result) => !result.edit.idempotent).length,
    idempotent: changes.filter((result) => result.edit.idempotent).length,
    unchanged: batch.unchangedListingIds.length,
    unchangedListingIds: batch.unchangedListingIds,
    edits: changes.map((result) => result.edit),
    staleTranslations: changes.flatMap((result) => result.staleTranslations),
  };
}

function appendViewingBooking(input, config) {
  const viewing = appendViewing(readLeadLedger(config.leadLedgerPath), bindAuthenticatedOperator(input, config.adminPrincipal, ["broker"]), {
    filePath: config.viewingLedgerPath,
    bookedAt: config.bookedAt,
  });
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
  return viewing;
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
  const result = appendSellerPipelineOutcome(readSellerPipeline(config.sellerPipelinePath), bindAuthenticatedOperator(input, config.adminPrincipal), {
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

function appendLeadPipelineOutcomeEntry(input, config) {
  const recordedAt = config.leadPipelineOutcomeAt || config.reviewedAt || config.bookedAt || new Date().toISOString();
  const result = appendLeadPipelineOutcome(
    {
      leads: readLeadLedger(config.leadLedgerPath),
      viewings: readViewings(config.viewingLedgerPath),
      viewingFollowUps: readViewingFollowUps(config.viewingFollowUpLedgerPath),
      deals: readDeals(config.dealLedgerPath),
    },
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

function appendDealClose(input, config) {
  const deal = appendClosedDeal(readLeadLedger(config.leadLedgerPath), bindAuthenticatedOperator(input, config.adminPrincipal, ["broker"]), {
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
  const contact = appendBrokerContact(createBrokerContact(input, { reviewedAt: config.reviewedAt }), {
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
  const tour = appendTourApproval(createTourApproval(currentSeed(config), input, config.reviewedAt), {
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
  const approvals = readRedirectApprovals(config.redirectApprovalPath);
  const rows = url.searchParams.get("pending") ? buildPendingRedirectApprovalWorkbook(routes, approvals) : buildRedirectApprovalWorkbook(routes);
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

function importListingQualityRows(inputCsv, config) {
  const report = currentListingQualityReport(config);
  const review = validateListingQualityReviewCsv(report, inputCsv, { requireSnapshots: true });
  let reviewPath = null;
  let reviewPersistenceError = "";
  if (review.summary.missing_review_rows === 0) {
    try {
      reviewPath = writeCompleteListingQualityReviewCsv(
        report,
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
  recordAudit(
    {
      action: "listing_quality_imported",
      actor: "listing_quality_editor",
      objectType: "listing_quality_review",
      objectId: `listing-quality-${review.summary.review_rows}`,
      metadata: {
        imported: review.summary.review_rows,
        edited: edits.length,
        media_review_rows: review.summary.media_review_rows,
        missing_review_rows: review.summary.missing_review_rows,
        review_persisted: Boolean(reviewPath),
      },
    },
    config,
  );
  const reviewImport = listingQualityImportSummary(report, review, { reviewPath, reviewPersistenceError });
  return {
    imported: review.summary.review_rows,
    edited: edits.length,
    factsReviewRows: review.summary.facts_review_rows,
    mediaReviewRows: review.summary.media_review_rows,
    missingReviewRows: review.summary.missing_review_rows,
    report: launchReadiness(config),
    reviewImport,
    reviewSummary: review.summary,
    reviewPersisted: Boolean(reviewPath),
    reviewPath,
    reviewPersistenceError,
    edits,
  };
}

export async function renderAppAdminResponse(request, { config = appAdminConfigFromEnv() } = {}) {
  const principal = resolveAdminPrincipal(request.headers.get("authorization") || "");
  if (!principal) return adminUnauthorized();
  if (request.method !== "GET" && !canAdminMutate(principal)) return adminOperatorIdentityRequired();
  config = { ...config, adminPrincipal: principal };
  try {
    const url = new URL(request.url, "http://localhost");
    const registry = loadLocaleRegistry(config.localeRegistryPath);
    if (request.method === "GET" && url.pathname === "/admin/today") return htmlResponse(todayPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/today") return jsonResponse(200, todayPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/leads") return htmlResponse(leadInboxPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/leads") return jsonResponse(200, leadInboxPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/pipeline") return htmlResponse(pipelinePayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/pipeline") return jsonResponse(200, pipelinePayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/requests") return htmlResponse(requestsPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/requests") return jsonResponse(200, requestsPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/viewings") return htmlResponse(viewingsPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/viewings") return jsonResponse(200, viewingsPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/activity") return htmlResponse(activityPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/activity") return jsonResponse(200, activityPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/listings") return htmlResponse(listingManagerPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/listings") return jsonResponse(200, listingManagerPayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/admin/listings/edit") {
      return htmlResponse(listingEditorPayload(registry, url, config));
    }
    if (request.method === "GET" && url.pathname === "/admin/translations") return htmlResponse(translationQueuePayload(registry, url, config));
    if (request.method === "GET" && url.pathname === "/api/admin/translations") return jsonResponse(200, translationQueuePayload(registry, url, config));
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
      const report = parseJsonBody(await readRequestBody(request, config.maxBodyBytes));
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
      const report = parseJsonBody(await readRequestBody(request, config.maxBodyBytes));
      return jsonResponse(report.ready ? 201 : 202, importPayloadRuntimeReport(report, config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/seo-evidence/import") {
      const result = importSeoEvidence(seoExportInput(request, url, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.missingRequiredSources.length ? 202 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/listing-quality/import") {
      const result = importListingQualityRows(csvInput(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.reviewPersisted ? 201 : 202, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/replies") {
      const reply = appendReply(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(reply.idempotent ? 200 : 201, reply);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/replies/delivery") {
      const result = appendReplyDeliveryOutcomeEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/lead-pipeline/outcome") {
      const result = appendLeadPipelineOutcomeEntry(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/replies/draft") {
      return jsonResponse(201, await draftReply(parseJsonBody(await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/listings/edit") {
      const result = appendEditorChange(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.edit.idempotent ? 200 : 201, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/listings/status") {
      const result = appendBulkListingStatusChanges(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
      return jsonResponse(result.updated ? 201 : 200, result);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/listings/slug") {
      return jsonResponse(201, appendListingSlugChange(registry, parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/viewings") {
      const viewing = appendViewingBooking(parseBody(request, await readRequestBody(request, config.maxBodyBytes)), config);
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
      return calendarResponse(renderViewingCalendar(readViewings(config.viewingLedgerPath), { now: config.bookedAt }));
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
    if (error.status === 413) return jsonResponse(413, { kind: "request_too_large" });
    return adminBadRequest(error);
  }
}
