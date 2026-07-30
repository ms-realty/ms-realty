import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { assertAuditLog, readAuditLog } from "../lib/audit-log.mjs";
import { parseCsv } from "../lib/csv.mjs";
import { buildLiveServiceProvisioningReport } from "../lib/live-service-provisioning.mjs";
import { buildPayloadRuntimeReport } from "../lib/payload-runtime.mjs";
import { readReplyDeliveryOutcomes } from "../lib/reply-delivery-outcomes.mjs";
import { mediaAssetId } from "../lib/media-reviews.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

function tempJsonl(prefix) {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-${prefix}-`)}/${prefix}.jsonl`;
  fs.writeFileSync(file, "");
  return file;
}

function tempDefaultListingEdits() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-app-admin-listing-edits-`)}/edits.jsonl`;
  fs.copyFileSync("production/data/listing-edits.jsonl", file);
  return file;
}

function tempJson(prefix, contents) {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-${prefix}-`)}/${prefix}.json`;
  fs.writeFileSync(file, contents);
  return file;
}

function tempDir(prefix) {
  return fs.mkdtempSync(`${os.tmpdir()}/ms-realty-${prefix}-`);
}

function healthyHermesAgentFetch(url) {
  if (String(url).endsWith("/v1/capabilities")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        platform: "hermes-agent",
        model: "hermes-agent",
        auth: { type: "bearer", required: true },
        features: { chat_completions: true, responses_api: true, run_submission: true },
      }),
    };
  }
  return { ok: true, status: 200 };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function actionCounts(rows) {
  return rows.reduce((counts, row) => {
    counts[row.action] = (counts[row.action] || 0) + 1;
    return counts;
  }, {});
}

function validProductionRecoveryReport() {
  return {
    schema_version: 1,
    generated_at: "2026-07-22T23:40:00.000Z",
    environment: "production",
    ready: true,
    policy: {
      provider: "eu-backup-provider",
      offsite: true,
      encrypted_at_rest: true,
      encrypted_in_transit: true,
      retention_days: 30,
      rpo_hours: 24,
      rto_hours: 8,
    },
    backup: {
      backup_id: "backup-20260722-001",
      completed_at: "2026-07-22T23:00:00.000Z",
      checksum_verified: true,
      components: ["payload_postgres", "runtime_data", "runtime_evidence"],
    },
    restore_drill: {
      drill_id: "restore-20260722-001",
      source_backup_id: "backup-20260722-001",
      completed_at: "2026-07-22T23:15:00.000Z",
      target: "isolated",
      status: "pass",
      checksum_verified: true,
      rollback_procedure_verified: true,
      components_verified: ["payload_postgres", "runtime_data", "runtime_evidence"],
      operator: "operations_manager",
    },
    approval: {
      status: "approved",
      reviewer: "agency_owner",
      approved_at: "2026-07-22T23:30:00.000Z",
    },
  };
}

function completeListingQualityReviewCsv(workbookCsv, limit = null) {
  const headers = [
    "listing_id",
    "price_eur",
    "area_sqm",
    "bedrooms",
    "location",
    "description",
    "facts_reviewer",
    "media_reviewer",
    "review_notes",
    "editor_path",
    "review_status",
    "issues",
    "required_editor_fields",
    "public_gallery_assets",
    "public_gallery_sample",
    "missing_alt_text_assets",
  ];
  const workbookRows = parseCsv(workbookCsv);
  const reviewRows = limit === null ? workbookRows : workbookRows.slice(0, limit);
  const rows = reviewRows.map((row) => {
    const fields = (row.required_editor_fields || "").split("|").filter(Boolean);
    const needsFacts = fields.some((field) => ["price_eur", "area_sqm", "bedrooms", "location", "description"].includes(field));
    const needsMedia = fields.some((field) => ["media_review", "media_alt_text", "public_gallery", "tour_review"].includes(field));
    return [
      row.listing_id,
      fields.includes("price_eur") ? row.price_eur || 123000 : "",
      fields.includes("area_sqm") ? row.area_sqm || 85 : "",
      fields.includes("bedrooms") ? row.bedrooms || 2 : "",
      fields.includes("location") ? row.location || "Sandanski" : "",
      fields.includes("description") ? "Reviewed listing description" : "",
      needsFacts ? "editor_bg" : "",
      needsMedia ? "media_editor" : "",
      "Reviewed source gallery evidence from admin listing-quality workbook",
      row.editor_path,
      row.review_status,
      row.issues,
      row.required_editor_fields,
      row.public_gallery_assets,
      row.public_gallery_sample,
      row.missing_alt_text_assets,
    ]
      .map(csvCell)
      .join(",");
  });
  return `${[headers.join(","), ...rows].join("\n")}\n`;
}

async function withEnv(env, fn) {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    process.env[key] = env[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("Next admin pages expose CRM lead inbox and CMS listing editor behind admin auth", async () => {
  const deployableRedirectOutputPath = tempJson(
    "app-admin-deployable-redirects",
    `${JSON.stringify({ summary: {}, redirects: [] })}\n`,
  );
  const seoEvidenceInputDir = tempDir("app-admin-seo-evidence");
  for (const filename of ["search-console.csv.example", "yandex-webmaster.csv.example", "backlinks.csv.example"]) {
    fs.copyFileSync(`migration/external/seo/${filename}`, `${seoEvidenceInputDir}/${filename}`);
  }
  const seoEvidenceOutputPath = `${seoEvidenceInputDir}/seo-evidence.json`;
  const launchReadinessOutputPath = tempJson("app-admin-launch-readiness", "{}\n");
  const searchSyncReportPath = `${seoEvidenceInputDir}/search-engine-sync-report.json`;
  const searchQueryReportPath = `${seoEvidenceInputDir}/search-engine-query-report.json`;
  const hermesWorkerReportPath = `${seoEvidenceInputDir}/hermes-draft-worker-report.json`;
  const liveServiceProvisioningReportPath = tempJson(
    "app-admin-live-service-provisioning",
    fs.readFileSync("production/data/live-service-provisioning-report.json", "utf8"),
  );
  const payloadRuntimeReportPath = `${seoEvidenceInputDir}/payload-runtime-report.json`;
  const productionRecoveryReportPath = `${seoEvidenceInputDir}/production-recovery-report.json`;
  const listingQualityReviewPath = `${seoEvidenceInputDir}/listing-quality.csv`;
  const listingEditLedgerPath = tempDefaultListingEdits();
  const auditLogPath = tempJsonl("app-admin-audit");
  const leadContactVaultPath = tempJsonl("app-admin-lead-contacts");
  await withEnv(
    {
      MS_REALTY_ADMIN_TOKEN: "next-admin-test",
      MS_REALTY_AUDIT_LOG_PATH: auditLogPath,
      MS_REALTY_ACCOUNT_LEDGER_PATH: tempJsonl("app-admin-accounts"),
      MS_REALTY_BROKER_CONTACT_LEDGER_PATH: tempJsonl("app-admin-broker-contacts"),
      MS_REALTY_CONSENT_LEDGER_PATH: tempJsonl("app-admin-consents"),
      MS_REALTY_DEAL_LEDGER_PATH: tempJsonl("app-admin-deals"),
      MS_REALTY_DOCUMENT_CHECKLIST_LEDGER_PATH: tempJsonl("app-admin-document-checklists"),
      MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH: deployableRedirectOutputPath,
      MS_REALTY_EVENT_LEDGER_PATH: tempJsonl("app-admin-events"),
      MS_REALTY_LANGUAGE_REQUEST_LEDGER_PATH: tempJsonl("app-admin-language-requests"),
      MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH: launchReadinessOutputPath,
      MS_REALTY_LEAD_LEDGER_PATH: tempJsonl("app-admin-leads"),
      MS_REALTY_LEAD_ASSIGNMENT_LEDGER_PATH: tempJsonl("app-admin-lead-assignments"),
      MS_REALTY_LEAD_CONTACT_VAULT_PATH: leadContactVaultPath,
      MS_REALTY_LEAD_CONTACT_KEY: "test-only-next-contact-key-32-characters-minimum",
      MS_REALTY_LEAD_PIPELINE_OUTCOME_LEDGER_PATH: tempJsonl("app-admin-lead-pipeline-outcomes"),
      MS_REALTY_LEAD_PIPELINE_OUTCOME_AT: "2026-07-18T10:05:00.000Z",
      MS_REALTY_LISTING_QUALITY_REVIEW_PATH: listingQualityReviewPath,
      MS_REALTY_SEARCH_SYNC_REPORT_PATH: searchSyncReportPath,
      MS_REALTY_SEARCH_QUERY_REPORT_PATH: searchQueryReportPath,
      MS_REALTY_HERMES_WORKER_REPORT_PATH: hermesWorkerReportPath,
      MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH: liveServiceProvisioningReportPath,
      MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH: payloadRuntimeReportPath,
      MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH: productionRecoveryReportPath,
      MS_REALTY_RECEIVED_AT: "2026-07-04T00:00:00Z",
      MS_REALTY_LOCALE_REGISTRY_PATH: tempJson("app-admin-locales", fs.readFileSync("locales/registry.json", "utf8")),
      MS_REALTY_LISTING_EDIT_LEDGER_PATH: listingEditLedgerPath,
      MS_REALTY_MEDIA_REVIEW_LEDGER_PATH: tempJsonl("app-admin-media-reviews"),
      MS_REALTY_REDIRECT_APPROVALS_PATH: tempJsonl("app-admin-redirect-approvals"),
      MS_REALTY_REPLY_OUTBOX_PATH: tempJsonl("app-admin-replies"),
      MS_REALTY_SAVED_SEARCH_LEDGER_PATH: tempJsonl("app-admin-saved-searches"),
      MS_REALTY_SELLER_PIPELINE_PATH: tempJsonl("app-admin-seller-pipeline"),
      MS_REALTY_SELLER_PIPELINE_OUTCOME_PATH: tempJsonl("app-admin-seller-pipeline-outcomes"),
      MS_REALTY_SELLER_PIPELINE_CREATED_AT: "2026-07-04T00:08:00Z",
      MS_REALTY_SELLER_PIPELINE_OUTCOME_AT: "2026-07-06T12:00:00Z",
      MS_REALTY_SEO_EVIDENCE_INPUT_DIR: seoEvidenceInputDir,
      MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH: seoEvidenceOutputPath,
      MS_REALTY_SLUG_HISTORY_PATH: tempJsonl("app-admin-slug-history"),
      MS_REALTY_TOUR_APPROVAL_LEDGER_PATH: tempJsonl("app-admin-tour-approvals"),
      MS_REALTY_TRANSLATION_LEDGER_PATH: tempJsonl("app-admin-translations"),
      MS_REALTY_VIEWING_LEDGER_PATH: tempJsonl("app-admin-viewings"),
      MS_REALTY_VIEWING_FOLLOW_UP_LEDGER_PATH: tempJsonl("app-admin-viewing-follow-ups"),
      MS_REALTY_BOOKED_AT: "2026-07-04T00:06:00Z",
      MS_REALTY_DEAL_CLOSED_AT: "2026-07-10T10:00:00Z",
      MS_REALTY_VIEWING_FOLLOW_UP_AT: "2026-07-06T12:00:00Z",
    },
    async () => {
      const publicLeadRoute = await import("../../app/api/leads/route.js");
      const brokerContactRoute = await import("../../app/api/admin/broker-contacts/route.js");
      const dealCloseRoute = await import("../../app/api/admin/deals/close/route.js");
      const deployableRedirectExportRoute = await import("../../app/api/admin/deployable-redirects/export/route.js");
      const cmsCollectionsRoute = await import("../../app/api/admin/cms-collections/route.js");
      const payloadCollectionsRoute = await import("../../app/api/admin/payload-collections/route.js");
      const launchInputChecklistRoute = await import("../../app/api/admin/launch-input-checklist/route.js");
      const liveServiceReportTemplateRoute = await import("../../app/api/admin/live-service-report-template/route.js");
      const liveServiceReportImportRoute = await import("../../app/api/admin/live-service-reports/import/route.js");
      const payloadRuntimeImportRoute = await import("../../app/api/admin/payload-runtime/import/route.js");
      const productionRecoveryRoute = await import("../../app/api/admin/production-recovery/route.js");
      const productionRecoveryTemplateRoute = await import("../../app/api/admin/production-recovery-template/route.js");
      const productionRecoveryImportRoute = await import("../../app/api/admin/production-recovery/import/route.js");
      const launchReadinessExportRoute = await import("../../app/api/admin/launch-readiness/export/route.js");
      const launchReadinessRoute = await import("../../app/api/admin/launch-readiness/route.js");
      const preflightReportsRoute = await import("../../app/api/admin/preflight-reports/route.js");
      const seoPreflightRoute = await import("../../app/api/admin/seo-preflight/route.js");
      const liveServicesRoute = await import("../../app/api/admin/live-services/route.js");
      const liveServiceProvisioningRoute = await import("../../app/api/admin/live-service-provisioning/route.js");
      const liveServiceProvisioningImportRoute = await import("../../app/api/admin/live-service-provisioning/import/route.js");
      const payloadRuntimeRoute = await import("../../app/api/admin/payload-runtime/route.js");
      const payloadRuntimeBootstrapRoute = await import("../../app/api/admin/payload-runtime-bootstrap/route.js");
      const listingQualityRoute = await import("../../app/api/admin/listing-quality/route.js");
      const listingQualityImportRoute = await import("../../app/api/admin/listing-quality/import/route.js");
      const listingQualityReviewDraftRoute = await import("../../app/api/admin/listing-quality-review-draft/route.js");
      const listingQualityReviewPacketRoute = await import("../../app/api/admin/listing-quality-review-packet/route.js");
      const listingQualityWorkbookRoute = await import("../../app/api/admin/listing-quality-workbook/route.js");
      const localeRoute = await import("../../app/api/admin/locales/route.js");
      const redirectApprovalWorkbookRoute = await import("../../app/api/admin/redirect-approval-workbook/route.js");
      const redirectApprovalsRoute = await import("../../app/api/admin/redirect-approvals/route.js");
      const redirectApprovalsImportRoute = await import("../../app/api/admin/redirect-approvals/import/route.js");
      const replyRoute = await import("../../app/api/admin/replies/route.js");
      const replyDeliveryRoute = await import("../../app/api/admin/replies/delivery/route.js");
      const seoEvidenceRoute = await import("../../app/api/admin/seo-evidence/route.js");
      const seoEvidenceExportRoute = await import("../../app/api/admin/seo-evidence/export/route.js");
      const seoEvidenceImportRoute = await import("../../app/api/admin/seo-evidence/import/route.js");
      const seoEvidenceTemplateRoute = await import("../../app/api/admin/seo-evidence/template/route.js");
      const listingEditRoute = await import("../../app/api/admin/listings/edit/route.js");
      const mediaReviewRoute = await import("../../app/api/admin/media/reviews/route.js");
      const listingSlugRoute = await import("../../app/api/admin/listings/slug/route.js");
      const translationDraftRoute = await import("../../app/api/admin/translations/draft/route.js");
      const translationApproveRoute = await import("../../app/api/admin/translations/approve/route.js");
      const translationPublishRoute = await import("../../app/api/admin/translations/publish/route.js");
      const tourApprovalRoute = await import("../../app/api/admin/tours/approve/route.js");
      const viewingRoute = await import("../../app/api/admin/viewings/route.js");
      const viewingFollowUpRoute = await import("../../app/api/admin/viewings/follow-up/route.js");
      const sellerPipelineOutcomeRoute = await import("../../app/api/admin/seller-pipeline/outcome/route.js");
      const viewingCalendarRoute = await import("../../app/api/admin/viewings.ics/route.js");
      const adminRootRoute = await import("../../app/admin/route.js");
      const todayRoute = await import("../../app/admin/today/route.js");
      const todayJsonRoute = await import("../../app/api/admin/today/route.js");
      const leadInboxRoute = await import("../../app/admin/leads/route.js");
      const leadInboxJsonRoute = await import("../../app/api/admin/leads/route.js");
      const leadPipelineRoute = await import("../../app/admin/pipeline/route.js");
      const leadPipelineJsonRoute = await import("../../app/api/admin/pipeline/route.js");
      const leadPipelineOutcomeRoute = await import("../../app/api/admin/lead-pipeline/outcome/route.js");
      const leadAssignmentRoute = await import("../../app/api/admin/leads/assign/route.js");
      const contactsRoute = await import("../../app/admin/contacts/route.js");
      const contactsJsonRoute = await import("../../app/api/admin/contacts/route.js");
      const accountRoute = await import("../../app/api/admin/accounts/route.js");
      const accountLinkRoute = await import("../../app/api/admin/accounts/link/route.js");
      const documentsRoute = await import("../../app/admin/documents/route.js");
      const documentsJsonRoute = await import("../../app/api/admin/documents/route.js");
      const documentOutcomeRoute = await import("../../app/api/admin/documents/outcome/route.js");
      const viewingsPageRoute = await import("../../app/admin/viewings/route.js");
      const viewingsJsonRoute = await import("../../app/api/admin/viewings/route.js");
      const activityRoute = await import("../../app/admin/activity/route.js");
      const activityJsonRoute = await import("../../app/api/admin/activity/route.js");
      const listingManagerRoute = await import("../../app/admin/listings/route.js");
      const listingManagerJsonRoute = await import("../../app/api/admin/listings/route.js");
      const translationQueueRoute = await import("../../app/admin/translations/route.js");
      const translationQueueJsonRoute = await import("../../app/api/admin/translations/route.js");
      const listingEditorRoute = await import("../../app/admin/listings/edit/route.js");
      const migrationReviewHtmlRoute = await import("../../app/admin/migration/review/route.js");
      const migrationReviewRoute = await import("../../app/api/admin/migration/review/route.js");

      assert.equal(typeof replyDeliveryRoute.POST, "function");

      const lead = await publicLeadRoute.POST(
        new Request("https://example.test/api/leads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: "next-admin-lead-test",
            leadType: "buyer",
            language: "he",
            listingReference: "MS-CRAWL-0001",
            contact: { name: "Noa Levi", whatsapp: "+359880000001" },
            contact_preference: "whatsapp",
            message: "Interested in this property.",
          }),
        }),
      );
      assert.equal(lead.status, 201);

      const unauthorized = await leadInboxRoute.GET(new Request("https://example.test/admin/leads?locale=ru"));
      assert.equal(unauthorized.status, 401);
      assert.equal(unauthorized.headers.get("www-authenticate"), 'Bearer realm="ms-realty-admin"');

      const auth = { authorization: "Bearer next-admin-test" };
      const adminRoot = await adminRootRoute.GET(new Request("https://example.test/admin?locale=ru"));
      assert.equal(adminRoot.status, 307);
      assert.equal(adminRoot.headers.get("location"), "/admin/today?locale=ru");

      const todayUnauthorized = await todayRoute.GET(new Request("https://example.test/admin/today?locale=ru"));
      assert.equal(todayUnauthorized.status, 401);
      const today = await todayRoute.GET(new Request("https://example.test/admin/today?locale=ru", { headers: auth }));
      const todayHtml = await today.text();
      assert.equal(today.status, 200);
      assert.equal(today.headers.get("cache-control"), "no-store");
      assert.match(todayHtml, /data-kind="admin-today"/);
      assert.match(todayHtml, /data-react-admin-ui="today"/);
      assert.match(todayHtml, /data-priority-leads="true"/);
      assert.match(todayHtml, /data-priority-lead="next-admin-lead-test"/);
      assert.match(todayHtml, /adm-task-list__reference/);
      assert.match(todayHtml, /Открыть и ответить/);
      assert.match(todayHtml, /href="\/admin\/leads\?locale=ru#lead-next-admin-lead-test"/);
      assert.match(todayHtml, /href="\/admin\/viewings\?locale=ru"/);
      assert.match(todayHtml, /href="\/admin\/activity\?locale=ru"/);
      const todayJson = await todayJsonRoute.GET(new Request("https://example.test/api/admin/today?locale=ru", { headers: auth }));
      const todayJsonBody = await todayJson.json();
      assert.equal(todayJsonBody.kind, "admin_today");
      assert.equal(todayJsonBody.summary.leads, 1);

      const viewingsPage = await viewingsPageRoute.GET(new Request("https://example.test/admin/viewings?locale=ru", { headers: auth }));
      const viewingsHtml = await viewingsPage.text();
      assert.equal(viewingsPage.status, 200);
      assert.match(viewingsHtml, /data-kind="admin-viewings"/);
      assert.match(viewingsHtml, /href="\/api\/admin\/viewings\.ics" download/);
      assert.match(viewingsHtml, /Нет предстоящих просмотров/);
      const viewingsJson = await viewingsJsonRoute.GET(new Request("https://example.test/api/admin/viewings?locale=ru", { headers: auth }));
      assert.equal((await viewingsJson.json()).kind, "admin_viewings");

      const inboxJsonUnauthorized = await leadInboxJsonRoute.GET(new Request("https://example.test/api/admin/leads?locale=ru"));
      assert.equal(inboxJsonUnauthorized.status, 401);
      assert.equal(inboxJsonUnauthorized.headers.get("cache-control"), "no-store");

      const inboxJson = await leadInboxJsonRoute.GET(new Request("https://example.test/api/admin/leads?locale=ru", { headers: auth }));
      const inboxJsonBody = await inboxJson.json();
      assert.equal(inboxJson.status, 200);
      assert.equal(inboxJson.headers.get("cache-control"), "no-store");
      assert.equal(inboxJsonBody.workspace.locale, "ru");
      assert.equal(inboxJsonBody.leads.length, 1);
      assert.equal(inboxJsonBody.leads[0].original_language, "he");
      assert.equal(inboxJsonBody.leads[0].contact.whatsapp, "+359880000001");
      assert.equal(inboxJsonBody.communicationThreads[0].events[0].type, "inbound_request");
      assert.equal(inboxJsonBody.communicationTemplates["next-admin-lead-test"][0].locale, "he");
      assert.equal(inboxJsonBody.communicationTemplates["next-admin-lead-test"][0].human_review_required, true);

      const inbox = await leadInboxRoute.GET(new Request("https://example.test/admin/leads?locale=ru", { headers: auth }));
      const inboxHtml = await inbox.text();
      assert.equal(inbox.status, 200);
      assert.equal(inbox.headers.get("cache-control"), "no-store");
      assert.match(inboxHtml, /<html lang="ru" dir="ltr">/);
      assert.match(inboxHtml, /data-kind="admin-lead-inbox"/);
      assert.match(inboxHtml, /data-react-admin-ui="lead-inbox"/);
      assert.match(inboxHtml, /data-admin-workbench="crm"/);
      assert.match(inboxHtml, /data-inbox-layout="action-queue"/);
      assert.match(inboxHtml, /data-task-led="true"/);
      assert.match(inboxHtml, /data-admin-mobile-nav="true"/);
      assert.match(inboxHtml, /aria-controls="admin-mobile-navigation-ru" aria-expanded="false"/);
      assert.match(inboxHtml, /role="dialog" aria-modal="true" aria-label="Навигация по рабочему пространству"/);
      assert.match(inboxHtml, /aria-label="Навигация по рабочему пространству"/);
      assert.match(inboxHtml, /class="adm-mobile-nav__link adm-mobile-nav__link--on" href="\/admin\/leads\?locale=ru" aria-current="page"/);
      assert.match(inboxHtml, /class="adm-mobile-nav__link" href="\/admin\/viewings\?locale=ru"/);
      assert.match(inboxHtml, /class="adm-mobile-nav__link" href="\/admin\/listings\?locale=ru"/);
      assert.match(inboxHtml, /class="adm-mobile-nav__link" href="\/admin\/migration\/review\?locale=ru"/);
      assert.match(inboxHtml, /data-lead-queue-tabs="true"/);
      assert.match(inboxHtml, /data-lead-row="true"/);
      assert.match(inboxHtml, /data-original-language="he"/);
      assert.match(inboxHtml, /data-private-contact="true"/);
      assert.match(inboxHtml, /https:\/\/wa\.me\/359880000001/);
      assert.match(inboxHtml, /action="\/api\/admin\/replies\/draft"/);
      assert.match(inboxHtml, /data-hermes-draft-request="true"/);
      assert.match(inboxHtml, /data-reply-draft-unavailable="Hermes не настроен в этой среде\./);
      assert.match(inboxHtml, /data-reply-approval-required="true"/);
      assert.match(inboxHtml, /data-hermes-reply-draft="broker_review_required"/);
      assert.match(inboxHtml, /name="hermesDraftText"/);
      assert.match(inboxHtml, /data-reply-status="true"/);
      assert.equal(inboxHtml.includes('name="hermesDraft" value="true"'), false);
      assert.match(inboxHtml, /data-show-original-toggle="true"/);
      assert.match(inboxHtml, /data-lead-assignment-control="next-admin-lead-test"/);
      assert.match(inboxHtml, /data-communication-thread="next-admin-lead-test"/);
      assert.match(inboxHtml, /data-communication-event="inbound_request"/);
      assert.match(inboxHtml, /data-communication-template-select="true"/);
      assert.match(inboxHtml, /data-template-locale="he"/);
      assert.match(inboxHtml, /<details class="adm-lead-brief"/);
      assert.match(inboxHtml, /<details class="adm-lead-more">/);
      assert.match(inboxHtml, /Максимальный бюджет \(€\), Срок решения/);
      assert.match(inboxHtml, /История коммуникации/);
      assert.match(inboxHtml, /Внутренний номер заявки/);
      assert.match(inboxHtml, /Подтверждение · HE · WhatsApp/);
      assert.match(inboxHtml, /action="\/api\/admin\/leads\/assign"/);
      assert.match(inboxHtml, /name="assignmentConfirmed"/);
      assert.match(inboxHtml, /he -&gt; en/);
      assert.match(inboxHtml, /Входящие заявки/);
      assert.match(inboxHtml, /Входящие заявки CRM с ответами, проверенными брокером\./);
      assert.match(inboxHtml, /Арендатор/);
      assert.match(inboxHtml, /scope="col"/);
      assert.match(inboxHtml, /data-lead-column="reply"/);
      assert.match(inboxHtml, /data-label="Ответ"/);
      assert.match(inboxHtml, /data-lead-column="escalation_due"[^>]*><time dateTime="[^"]+" title="[^"]+">/);

      const contactsBefore = await contactsJsonRoute.GET(new Request("https://example.test/api/admin/contacts?locale=ru", { headers: auth }));
      const contactsBeforeBody = await contactsBefore.json();
      assert.equal(contactsBefore.status, 200);
      assert.equal(contactsBeforeBody.kind, "admin_contacts");
      assert.equal(contactsBeforeBody.contacts.length, 1);
      assert.equal(contactsBeforeBody.contacts[0].contact.whatsapp, "+359880000001");
      assert.equal(contactsBeforeBody.contacts[0].account_id, null);
      const contactsPage = await contactsRoute.GET(new Request("https://example.test/admin/contacts?locale=ru", { headers: auth }));
      const contactsHtml = await contactsPage.text();
      assert.match(contactsHtml, /data-kind="admin-contacts"/);
      assert.match(contactsHtml, /data-react-admin-ui="contacts"/);
      assert.match(contactsHtml, /data-account-create-form="true"/);
      assert.match(contactsHtml, /data-contact-record="contact-/);

      const accountCreated = await accountRoute.POST(
        new Request("https://example.test/api/admin/accounts", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({ accountType: "family", label: "Test household", actor: "account_manager", humanConfirmed: true }),
        }),
      );
      const accountCreatedBody = await accountCreated.json();
      assert.equal(accountCreated.status, 201);
      assert.match(accountCreatedBody.account_id, /^account-family-/);
      const accountLinked = await accountLinkRoute.POST(
        new Request("https://example.test/api/admin/accounts/link", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({
            accountId: accountCreatedBody.account_id,
            contactId: contactsBeforeBody.contacts[0].id,
            actor: "account_manager",
            reason: "Broker confirmed the same household.",
            linkConfirmed: true,
          }),
        }),
      );
      assert.equal(accountLinked.status, 201);
      const contactsAfter = await contactsJsonRoute.GET(new Request("https://example.test/api/admin/contacts?locale=ru", { headers: auth }));
      const contactsAfterBody = await contactsAfter.json();
      assert.equal(contactsAfterBody.contacts[0].account_id, accountCreatedBody.account_id);
      assert.equal(contactsAfterBody.accounts[0].contact_count, 1);

      const documentsBefore = await documentsJsonRoute.GET(new Request("https://example.test/api/admin/documents?locale=ru", { headers: auth }));
      const documentsBeforeBody = await documentsBefore.json();
      assert.equal(documentsBefore.status, 200);
      assert.equal(documentsBeforeBody.kind, "admin_document_checklists");
      assert.equal(documentsBeforeBody.documentChecklistQueue.rows[0].items[0].key, "foreign_process_scope");
      const documentsPage = await documentsRoute.GET(new Request("https://example.test/admin/documents?locale=ru", { headers: auth }));
      const documentsHtml = await documentsPage.text();
      assert.match(documentsHtml, /data-kind="admin-document-checklists"/);
      assert.match(documentsHtml, /data-process-guardrail="true"/);
      assert.match(documentsHtml, /action="\/api\/admin\/documents\/outcome"/);
      assert.match(documentsHtml, /Открыто/);
      assert.doesNotMatch(documentsHtml, />Open</);
      const documentOutcome = await documentOutcomeRoute.POST(
        new Request("https://example.test/api/admin/documents/outcome", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({
            leadId: "next-admin-lead-test",
            itemKey: "foreign_process_scope",
            status: "complete",
            actor: "account_manager",
            note: "Broker confirmed that foreign-buyer guidance applies.",
            humanConfirmed: true,
          }),
        }),
      );
      assert.equal(documentOutcome.status, 201);
      const documentsAfter = await documentsJsonRoute.GET(new Request("https://example.test/api/admin/documents?locale=ru", { headers: auth }));
      assert.equal((await documentsAfter.json()).documentChecklistQueue.rows[0].completed_count, 1);

      const leadAssignment = await leadAssignmentRoute.POST(
        new Request("https://example.test/api/admin/leads/assign", {
          method: "POST",
          headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            leadId: "next-admin-lead-test",
            brokerId: "broker_ru",
            actor: "sales_manager",
            reason: "Owner approved Russian broker follow-up.",
            assignmentConfirmed: "on",
          }),
        }),
      );
      const leadAssignmentBody = await leadAssignment.json();
      assert.equal(leadAssignment.status, 201);
      assert.equal(leadAssignmentBody.previous_broker_id, "broker_international");
      assert.equal(leadAssignmentBody.broker_id, "broker_ru");

      const inboxAfterAssignment = await leadInboxJsonRoute.GET(
        new Request("https://example.test/api/admin/leads?locale=ru", { headers: auth }),
      );
      const inboxAfterAssignmentBody = await inboxAfterAssignment.json();
      assert.equal(inboxAfterAssignmentBody.leads[0].assigned_broker, "broker_ru");
      assert.equal(inboxAfterAssignmentBody.leads[0].broker_assignment.method, "manual_override");

      const pipeline = await leadPipelineRoute.GET(new Request("https://example.test/admin/pipeline?locale=ru", { headers: auth }));
      const pipelineHtml = await pipeline.text();
      assert.equal(pipeline.status, 200);
      assert.match(pipelineHtml, /data-kind="admin-lead-pipeline"/);
      assert.match(pipelineHtml, /data-react-admin-ui="lead-pipeline"/);
      assert.match(pipelineHtml, /data-pipeline-kind="renter"/);
      assert.match(pipelineHtml, /data-admin-mutation-form="lead-pipeline"/);
      const pipelineJson = await leadPipelineJsonRoute.GET(new Request("https://example.test/api/admin/pipeline?locale=ru", { headers: auth }));
      const pipelineJsonBody = await pipelineJson.json();
      assert.equal(pipelineJsonBody.kind, "admin_lead_pipeline");
      assert.equal(pipelineJsonBody.leadPipelineQueue.summary.renters_open, 1);
      assert.equal(typeof leadPipelineOutcomeRoute.POST, "function");

      const listingManager = await listingManagerRoute.GET(
        new Request("https://example.test/admin/listings?locale=ru&q=MS-CRAWL-0001", { headers: auth }),
      );
      const listingManagerHtml = await listingManager.text();
      assert.equal(listingManager.status, 200);
      assert.equal(listingManager.headers.get("cache-control"), "no-store");
      assert.match(listingManagerHtml, /data-kind="admin-listing-manager"/);
      assert.match(listingManagerHtml, /data-listing-manager-row="MS-CRAWL-0001"/);
      assert.match(listingManagerHtml, /Поиск по номеру/);
      assert.match(listingManagerHtml, /href="\/payload-admin\/collections\/listings\/MS-CRAWL-0001"/);
      assert.match(listingManagerHtml, /href="\/admin\/translations\?locale=ru"/);
      const listingManagerJson = await listingManagerJsonRoute.GET(
        new Request("https://example.test/api/admin/listings?locale=ru&q=MS-CRAWL-0001", { headers: auth }),
      );
      const listingManagerJsonBody = await listingManagerJson.json();
      assert.equal(listingManagerJson.status, 200);
      assert.equal(listingManagerJsonBody.kind, "admin_listing_manager");
      assert.ok(listingManagerJsonBody.summary.total > 100);
      assert.equal(listingManagerJsonBody.summary.visible, 1);
      assert.ok(listingManagerJsonBody.summary.translationReviewRequired > 0);
      assert.equal(listingManagerJsonBody.listings[0].id, "MS-CRAWL-0001");
      assert.ok(listingManagerJsonBody.listings[0].translation_review_required > 0);

      const singularListingManager = await listingManagerRoute.GET(
        new Request("https://example.test/admin/listings?q=MS-CRAWL-0006", { headers: auth }),
      );
      const singularListingManagerHtml = await singularListingManager.text();
      assert.match(singularListingManagerHtml, />1 issue<\/span>/);
      assert.match(singularListingManagerHtml, />1 public photo<\/small>/);
      assert.doesNotMatch(singularListingManagerHtml, />1 issues<\/span>|>1 public photos<\/small>/);

      const translationQueue = await translationQueueRoute.GET(
        new Request("https://example.test/admin/translations?locale=ru&targetLocale=en&q=MS-CRAWL-0001", { headers: auth }),
      );
      const translationQueueHtml = await translationQueue.text();
      assert.equal(translationQueue.status, 200);
      assert.equal(translationQueue.headers.get("cache-control"), "no-store");
      assert.match(translationQueueHtml, /data-kind="admin-translation-queue"/);
      assert.match(translationQueueHtml, /data-human-approval-required="true"/);
      assert.match(translationQueueHtml, /data-translation-task-row="translation-MS-CRAWL-0001-en"/);
      assert.match(translationQueueHtml, /data-translation-workflow-form="human"/);
      assert.match(translationQueueHtml, /data-label="Проверить перевод"/);
      assert.doesNotMatch(translationQueueHtml, /REVIEW TRANSLATION/);
      assert.match(translationQueueHtml, /name="propertyFactsJson"/);
      const translationQueueJson = await translationQueueJsonRoute.GET(
        new Request("https://example.test/api/admin/translations?locale=ru&targetLocale=en&q=MS-CRAWL-0001", { headers: auth }),
      );
      const translationQueueJsonBody = await translationQueueJson.json();
      assert.equal(translationQueueJson.status, 200);
      assert.equal(translationQueueJsonBody.kind, "admin_translation_queue");
      assert.equal(translationQueueJsonBody.translationTasks.length, 1);
      assert.equal(translationQueueJsonBody.translationTasks[0].target_locale, "en");
      assert.equal(translationQueueJsonBody.translationTasks[0].provider_mode, "human");

      const russianEditor = await listingEditorRoute.GET(
        new Request("https://example.test/admin/listings/edit?listingId=MS-CRAWL-0001&locale=ru", { headers: auth }),
      );
      assert.equal(russianEditor.status, 307);
      assert.equal(russianEditor.headers.get("location"), "/payload-admin/collections/listings/MS-CRAWL-0001");

      const locales = await localeRoute.GET(new Request("https://example.test/api/admin/locales?locale=bg", { headers: auth }));
      const localesBody = await locales.json();
      assert.equal(locales.status, 200);
      assert.equal(localesBody.workspace.locale, "bg");
      assert.ok(localesBody.locales.some((locale) => locale.code === "he" && locale.direction === "rtl"));

      const addedLocale = await localeRoute.POST(
        new Request("https://example.test/api/admin/locales", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({
            code: "es",
            native_name: "Espanol",
            admin_name: "Spanish",
            public_enabled: true,
            indexable: true,
            fallback_locale: "en",
          }),
        }),
      );
      const addedLocaleBody = await addedLocale.json();
      assert.equal(addedLocale.status, 201);
      assert.equal(addedLocaleBody.locale.code, "es");
      assert.ok(addedLocaleBody.public_indexable_locales.includes("es"));

      const activity = await activityRoute.GET(new Request("https://example.test/admin/activity?locale=ru", { headers: auth }));
      const activityHtml = await activity.text();
      assert.equal(activity.status, 200);
      assert.equal(activity.headers.get("cache-control"), "no-store");
      assert.match(activityHtml, /data-kind="admin-activity"/);
      assert.match(activityHtml, /data-privacy-safe="true"/);
      assert.match(activityHtml, /data-audit-action="locale_created"/);
      assert.match(activityHtml, /Язык добавлен/);
      assert.equal(activityHtml.includes("Noa Levi"), false);
      assert.equal(activityHtml.includes("+359880000001"), false);
      const activityJson = await activityJsonRoute.GET(new Request("https://example.test/api/admin/activity?locale=ru&action=locale_created", { headers: auth }));
      const activityJsonBody = await activityJson.json();
      assert.equal(activityJsonBody.kind, "admin_activity");
      assert.ok(activityJsonBody.auditLog.some((row) => row.action === "locale_created"));
      assert.equal(activityJsonBody.filters.action, "locale_created");
      assert.equal(activityJsonBody.auditLog.every((row) => row.action === "locale_created"), true);
      assert.equal("leads" in activityJsonBody, false);

      const launchReadiness = await launchReadinessRoute.GET(
        new Request("https://example.test/api/admin/launch-readiness", { headers: auth }),
      );
      const launchReadinessBody = await launchReadiness.json();
      assert.equal(launchReadiness.status, 200);
      assert.equal(launchReadinessBody.status, "blocked");
      assert.ok(launchReadinessBody.blockers.includes("external_seo_exports"));
      assert.ok(launchReadinessBody.blockers.includes("listing_quality_review"));
      assert.equal(
        launchReadinessBody.gates.find((gate) => gate.id === "live_services").evidence.provisioning.path,
        liveServiceProvisioningReportPath,
      );

      const launchChecklist = await launchInputChecklistRoute.GET(
        new Request("https://example.test/api/admin/launch-input-checklist", { headers: auth }),
      );
      const launchChecklistBody = await launchChecklist.text();
      assert.equal(launchChecklist.status, 200);
      assert.equal(launchChecklist.headers.get("content-type"), "text/markdown; charset=utf-8");
      assert.match(launchChecklistBody, /# Launch Input Checklist/);
      assert.match(launchChecklistBody, /External SEO Exports/);
      assert.match(launchChecklistBody, /MS_REALTY_LISTING_QUALITY_REVIEW_PATH/);
      assert.match(launchChecklistBody, /live-service-report-template/);
      assert.equal(launchChecklistBody.includes(liveServiceProvisioningReportPath), true);

      const preflightReports = await preflightReportsRoute.GET(
        new Request("https://example.test/api/admin/preflight-reports", { headers: auth }),
      );
      const preflightReportsBody = await preflightReports.json();
      assert.equal(preflightReports.status, 200);
      assert.equal(preflightReportsBody.kind, "admin_preflight_reports");
      assert.deepEqual(preflightReportsBody.checklist, {
        endpoint: "/api/admin/launch-input-checklist",
        path: "production/data/launch-input-checklist.md",
        refresh_command: "npm run launch:inputs",
      });
      assert.deepEqual(preflightReportsBody.launch_readiness.blockers, launchReadinessBody.blockers);
      assert.ok(preflightReportsBody.launch_readiness.blocked_gates.every((gate) => gate.next_actions.length > 0));
      assert.equal(preflightReportsBody.reports.seo.status, "blocked");
      assert.equal(preflightReportsBody.reports.listing_quality.status, "blocked");
      assert.equal(preflightReportsBody.reports.live_services.status, "blocked");
      assert.equal(preflightReportsBody.reports.live_service_provisioning.status, "blocked_report");
      assert.ok(preflightReportsBody.reports.live_service_provisioning.summary.missing_env.includes("TYPESENSE_URL"));
      assert.ok(preflightReportsBody.reports.live_service_provisioning.next_actions.some((action) => action.includes("live:provisioning")));
      assert.equal(preflightReportsBody.reports.payload_runtime.status, "missing_report");
      assert.ok(preflightReportsBody.reports.payload_runtime.next_actions.some((action) => action.includes("payload:bootstrap")));

      const seoPreflight = await seoPreflightRoute.GET(new Request("https://example.test/api/admin/seo-preflight", { headers: auth }));
      const seoPreflightBody = await seoPreflight.json();
      assert.equal(seoPreflight.status, 200);
      assert.equal(seoPreflightBody.kind, "admin_seo_preflight");
      assert.equal(seoPreflightBody.seo.status, "blocked");
      assert.ok(seoPreflightBody.seo.summary.missing_required_sources.includes("search_console"));
      assert.equal(seoPreflightBody.seo.summary.sources.privacy_events.status, "imported");

      const liveServices = await liveServicesRoute.GET(new Request("https://example.test/api/admin/live-services", { headers: auth }));
      const liveServicesBody = await liveServices.json();
      assert.equal(liveServices.status, 200);
      assert.equal(liveServicesBody.kind, "admin_live_services");
      assert.equal(liveServicesBody.live_services.status, "blocked");
      assert.ok(liveServicesBody.live_services.summary.missing_report > 0);

      const liveServiceProvisioning = await liveServiceProvisioningRoute.GET(
        new Request("https://example.test/api/admin/live-service-provisioning", { headers: auth }),
      );
      const liveServiceProvisioningBody = await liveServiceProvisioning.json();
      assert.equal(liveServiceProvisioning.status, 200);
      assert.equal(liveServiceProvisioningBody.kind, "admin_live_service_provisioning");
      assert.equal(liveServiceProvisioningBody.provisioning.status, "blocked_report");
      assert.ok(liveServiceProvisioningBody.provisioning.summary.missing_env.includes("TYPESENSE_URL"));
      assert.ok(liveServiceProvisioningBody.provisioning.next_actions.some((action) => action.includes("live:provisioning")));

      const readyProvisioningReport = await buildLiveServiceProvisioningReport({
        env: {
          TYPESENSE_URL: "https://typesense.ms-realty.bg",
          TYPESENSE_API_KEY: "typesense-key",
          MEILI_URL: "https://meili.ms-realty.bg",
          MEILI_API_KEY: "meili-key",
          HERMES_CHAT_COMPLETIONS_URL: "https://hermes.ms-realty.bg/v1/chat/completions",
          HERMES_API_KEY: "hermes-key",
        },
        fetchImpl: healthyHermesAgentFetch,
        generatedAt: "2026-07-06T00:00:00Z",
      });
      const liveServiceProvisioningImport = await liveServiceProvisioningImportRoute.POST(
        new Request("https://example.test/api/admin/live-service-provisioning/import", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify(readyProvisioningReport),
        }),
      );
      const liveServiceProvisioningImportBody = await liveServiceProvisioningImport.json();
      assert.equal(liveServiceProvisioningImport.status, 201);
      assert.equal(liveServiceProvisioningImportBody.imported.outPath, liveServiceProvisioningReportPath);
      assert.equal(liveServiceProvisioningImportBody.provisioning.status, "pass");
      assert.deepEqual(liveServiceProvisioningImportBody.provisioning.summary.missing_env, []);

      const payloadRuntime = await payloadRuntimeRoute.GET(new Request("https://example.test/api/admin/payload-runtime", { headers: auth }));
      const payloadRuntimeBody = await payloadRuntime.json();
      assert.equal(payloadRuntime.status, 200);
      assert.equal(payloadRuntimeBody.kind, "admin_payload_runtime");
      assert.equal(payloadRuntimeBody.runtime.status, "missing_report");
      assert.ok(payloadRuntimeBody.runtime.next_actions.some((action) => action.includes("payload:bootstrap")));

      const payloadRuntimeBootstrap = await payloadRuntimeBootstrapRoute.GET(
        new Request("https://example.test/api/admin/payload-runtime-bootstrap", { headers: auth }),
      );
      const payloadRuntimeBootstrapBody = await payloadRuntimeBootstrap.json();
      assert.equal(payloadRuntimeBootstrap.status, 200);
      assert.equal(payloadRuntimeBootstrapBody.kind, "admin_payload_runtime_bootstrap");
      assert.match(payloadRuntimeBootstrapBody.env_example, /PAYLOAD_SECRET=replace-with-output-of-openssl-rand-base64-32/);
      assert.match(payloadRuntimeBootstrapBody.compose_file, /payload-postgres/);
      assert.ok(payloadRuntimeBootstrapBody.checklist.some((item) => item.includes("npm run payload:runtime")));

      const listingQuality = await listingQualityRoute.GET(new Request("https://example.test/api/admin/listing-quality", { headers: auth }));
      const listingQualityBody = await listingQuality.json();
      assert.equal(listingQuality.status, 200);
      assert.equal(listingQualityBody.kind, "admin_listing_quality");
      assert.equal(listingQualityBody.listing_quality.status, "blocked");
      assert.ok(listingQualityBody.listing_quality.summary.affected_listings > 0);

      const listingQualityReviewPacket = await listingQualityReviewPacketRoute.GET(
        new Request("https://example.test/api/admin/listing-quality-review-packet", { headers: auth }),
      );
      const listingQualityReviewPacketBody = await listingQualityReviewPacket.json();
      assert.equal(listingQualityReviewPacket.status, 200);
      assert.equal(listingQualityReviewPacketBody.kind, "listing_quality_review_packet");
      assert.equal(listingQualityReviewPacketBody.status, "draft_not_launch_evidence");
      assert.equal(listingQualityReviewPacketBody.admin.review_packet_endpoint, "GET /api/admin/listing-quality-review-packet");
      assert.ok(listingQualityReviewPacketBody.summary.expected_review_rows > 0);

      const cmsCollectionsUnauthorized = await cmsCollectionsRoute.GET(new Request("https://example.test/api/admin/cms-collections"));
      const cmsCollections = await cmsCollectionsRoute.GET(new Request("https://example.test/api/admin/cms-collections", { headers: auth }));
      const cmsCollectionsBody = await cmsCollections.json();
      assert.equal(cmsCollectionsUnauthorized.status, 401);
      assert.equal(cmsCollections.status, 200);
      assert.equal(cmsCollections.headers.get("cache-control"), "no-store");
      assert.equal(cmsCollectionsBody.kind, "admin_cms_collections");
      assert.equal(cmsCollectionsBody.summary.records.listings, 165);
      assert.equal(cmsCollectionsBody.summary.records.listing_tours, 165);
      assert.equal(cmsCollectionsBody.collections.every((collection) => collection.publish_requires_human_review), true);

      const payloadCollectionsUnauthorized = await payloadCollectionsRoute.GET(
        new Request("https://example.test/api/admin/payload-collections"),
      );
      const payloadCollections = await payloadCollectionsRoute.GET(
        new Request("https://example.test/api/admin/payload-collections", { headers: auth }),
      );
      const payloadCollectionsBody = await payloadCollections.json();
      assert.equal(payloadCollectionsUnauthorized.status, 401);
      assert.equal(payloadCollections.status, 200);
      assert.equal(payloadCollections.headers.get("cache-control"), "no-store");
      assert.equal(payloadCollectionsBody.kind, "admin_payload_collections");
      assert.equal(payloadCollectionsBody.collections.length, 8);
      assert.ok(payloadCollectionsBody.collections.some((collection) => collection.slug === "listings"));
      assert.equal(
        payloadCollectionsBody.collections.every((collection) => collection.versions === false || collection.versions.drafts),
        true,
      );

      const liveTemplate = await liveServiceReportTemplateRoute.GET(
        new Request("https://example.test/api/admin/live-service-report-template?source=hermes_draft_worker", { headers: auth }),
      );
      const liveTemplateBody = await liveTemplate.json();
      assert.equal(liveTemplate.status, 200);
      assert.equal(liveTemplate.headers.get("content-type"), "application/json; charset=utf-8");
      assert.equal(liveTemplate.headers.get("content-disposition"), 'attachment; filename="hermes-draft-worker-report.json.example"');
      assert.equal(liveTemplateBody.example, true);
      assert.equal(liveTemplateBody.summary.attempted, 1);

      const liveImport = await liveServiceReportImportRoute.POST(
        new Request("https://example.test/api/admin/live-service-reports/import?source=hermes_draft_worker", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: fs.readFileSync("production/data/hermes-draft-worker-report.json.example", "utf8"),
        }),
      );
      const liveImportBody = await liveImport.json();
      assert.equal(liveImport.status, 400);
      assert.match(liveImportBody.message, /Example live service reports cannot be imported/);
      assert.equal(fs.existsSync(hermesWorkerReportPath), false);

      const liveReport = { ...liveTemplateBody };
      delete liveReport.example;
      liveReport.provider = {
        ...liveReport.provider,
        endpoint: "https://hermes.ms-realty.bg/v1/chat/completions",
      };
      const liveImportValid = await liveServiceReportImportRoute.POST(
        new Request("https://example.test/api/admin/live-service-reports/import?source=hermes_draft_worker", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify(liveReport),
        }),
      );
      const liveImportValidBody = await liveImportValid.json();
      assert.equal(liveImportValid.status, 202);
      assert.equal(liveImportValidBody.imported.outPath, hermesWorkerReportPath);
      assert.equal(liveImportValidBody.liveImport.ready, false);
      assert.equal(liveImportValidBody.liveImport.status, "blocked");
      assert.equal(liveImportValidBody.liveImport.importedSource, "hermes_draft_worker");
      assert.deepEqual(
        liveImportValidBody.liveImport.blockedReports.map((report) => report.source),
        ["typesense_meilisearch_sync", "typesense_meilisearch_query"],
      );
      assert.equal(liveImportValidBody.livePreflight.status, "blocked");
      assert.equal(liveImportValidBody.livePreflight.summary.pass, 1);
      assert.equal(liveImportValidBody.livePreflight.summary.missing_report, 2);
      assert.equal(fs.existsSync(hermesWorkerReportPath), true);

      const payloadRuntimeReport = await buildPayloadRuntimeReport({
        databaseProbe: async ({ database, host, port }) => ({ database, host, port, status: "pass" }),
        env: {
          DATABASE_URL: "postgres://payload:secret@db.ms-realty.bg:5432/ms_realty",
          PAYLOAD_SECRET: "not-written-to-report-32-byte-minimum",
        },
        generatedAt: "2026-07-06T00:00:00Z",
      });
      const blockedPayloadRuntimeReport = await buildPayloadRuntimeReport({
        env: {},
        generatedAt: "2026-07-06T00:00:00Z",
      });
      const examplePayloadRuntimeReport = JSON.parse(fs.readFileSync("production/data/payload-runtime-report.json.example", "utf8"));
      const localPayloadRuntimeReport = {
        ...payloadRuntimeReport,
        summary: { ...payloadRuntimeReport.summary, database: { ...payloadRuntimeReport.summary.database, host: "127.0.0.1" } },
        checks: payloadRuntimeReport.checks.map((check) =>
          check.id === "database_tcp" ? { ...check, host: "127.0.0.1" } : check,
        ),
      };
      const payloadImportBlocked = await payloadRuntimeImportRoute.POST(
        new Request("https://example.test/api/admin/payload-runtime/import", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify(blockedPayloadRuntimeReport),
        }),
      );
      const payloadImportExample = await payloadRuntimeImportRoute.POST(
        new Request("https://example.test/api/admin/payload-runtime/import", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify(examplePayloadRuntimeReport),
        }),
      );
      const payloadImportLocal = await payloadRuntimeImportRoute.POST(
        new Request("https://example.test/api/admin/payload-runtime/import", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify(localPayloadRuntimeReport),
        }),
      );
      const payloadImport = await payloadRuntimeImportRoute.POST(
        new Request("https://example.test/api/admin/payload-runtime/import", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify(payloadRuntimeReport),
        }),
      );
      const payloadImportBody = await payloadImport.json();
      const payloadImportBlockedBody = await payloadImportBlocked.json();
      const payloadImportExampleBody = await payloadImportExample.json();
      const payloadImportLocalBody = await payloadImportLocal.json();
      assert.equal(payloadImportBlocked.status, 202);
      assert.equal(payloadImportBlockedBody.runtime.ready, false);
      assert.equal(payloadImportBlockedBody.runtime.status, "blocked");
      assert.deepEqual(payloadImportBlockedBody.runtime.missingEnv, ["PAYLOAD_SECRET", "DATABASE_URL"]);
      assert.deepEqual(payloadImportBlockedBody.runtime.placeholderEnv, []);
      assert.deepEqual(payloadImportBlockedBody.runtime.weakEnv, []);
      assert.ok(payloadImportBlockedBody.runtime.blockedChecks.includes("payload_secret"));
      assert.ok(payloadImportBlockedBody.runtime.blockedChecks.includes("database_url"));
      assert.ok(payloadImportBlockedBody.runtime.blockedChecks.includes("database_tcp"));
      assert.equal(payloadImportBlockedBody.report.gates.find((gate) => gate.id === "payload_runtime").status, "blocked");
      assert.equal(payloadImportExample.status, 400);
      assert.match(payloadImportExampleBody.message, /example reports cannot/);
      assert.equal(payloadImportLocal.status, 400);
      assert.match(payloadImportLocalBody.message, /database network scope evidence/);
      assert.equal(payloadImport.status, 201);
      assert.equal(payloadImportBody.imported.outPath, payloadRuntimeReportPath);
      assert.equal(payloadImportBody.runtime.ready, true);
      assert.deepEqual(payloadImportBody.runtime.blockedChecks, []);
      assert.equal(payloadImportBody.report.gates.find((gate) => gate.id === "payload_runtime").status, "pass");
      assert.equal(fs.existsSync(payloadRuntimeReportPath), true);

      const productionRecoveryUnauthorized = await productionRecoveryRoute.GET(
        new Request("https://example.test/api/admin/production-recovery"),
      );
      const productionRecovery = await productionRecoveryRoute.GET(
        new Request("https://example.test/api/admin/production-recovery", { headers: auth }),
      );
      const productionRecoveryBody = await productionRecovery.json();
      assert.equal(productionRecoveryUnauthorized.status, 401);
      assert.equal(productionRecovery.status, 200);
      assert.equal(productionRecoveryBody.kind, "admin_production_recovery");
      assert.equal(productionRecoveryBody.recovery.status, "missing_report");

      const productionRecoveryTemplate = await productionRecoveryTemplateRoute.GET(
        new Request("https://example.test/api/admin/production-recovery-template", { headers: auth }),
      );
      const productionRecoveryTemplateBody = await productionRecoveryTemplate.json();
      assert.equal(productionRecoveryTemplate.status, 200);
      assert.equal(
        productionRecoveryTemplate.headers.get("content-disposition"),
        'attachment; filename="production-recovery-report.json.example"',
      );
      assert.equal(productionRecoveryTemplateBody.example, true);

      const invalidProductionRecoveryImport = await productionRecoveryImportRoute.POST(
        new Request("https://example.test/api/admin/production-recovery/import", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({ report: "not-json" }),
        }),
      );
      const invalidProductionRecoveryImportBody = await invalidProductionRecoveryImport.json();
      assert.equal(invalidProductionRecoveryImport.status, 400);
      assert.match(invalidProductionRecoveryImportBody.message, /valid JSON/);
      assert.equal(fs.existsSync(productionRecoveryReportPath), false);

      const productionRecoveryImport = await productionRecoveryImportRoute.POST(
        new Request("https://example.test/api/admin/production-recovery/import", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({ report: JSON.stringify(validProductionRecoveryReport()) }),
        }),
      );
      const productionRecoveryImportBody = await productionRecoveryImport.json();
      assert.equal(productionRecoveryImport.status, 201, JSON.stringify(productionRecoveryImportBody));
      assert.equal(productionRecoveryImportBody.imported.outPath, productionRecoveryReportPath);
      assert.equal(productionRecoveryImportBody.recovery.status, "pass");
      assert.equal(
        productionRecoveryImportBody.report.gates.find((gate) => gate.id === "production_recovery").status,
        "pass",
      );
      assert.equal(fs.existsSync(productionRecoveryReportPath), true);

      const migrationReviewUnauthorized = await migrationReviewRoute.GET(
        new Request("https://example.test/api/admin/migration/review?locale=bg"),
      );
      assert.equal(migrationReviewUnauthorized.status, 401);
      assert.equal(migrationReviewUnauthorized.headers.get("cache-control"), "no-store");

      const migrationReview = await migrationReviewRoute.GET(
        new Request("https://example.test/api/admin/migration/review?locale=bg", { headers: auth }),
      );
      const migrationReviewBody = await migrationReview.json();
      assert.equal(migrationReview.status, 200);
      assert.equal(migrationReview.headers.get("cache-control"), "no-store");
      assert.equal(migrationReviewBody.workspace.locale, "bg");
      assert.equal(migrationReviewBody.dashboard.media_reconciliation.media_rows, 11859);
      assert.equal(migrationReviewBody.routeMap.total, 457);
      assert.equal(migrationReviewBody.routeMap.sourceReviewRequired, 457);
      assert.equal(migrationReviewBody.routeMap.reviewRequired, 457);
      assert.equal(migrationReviewBody.routeMap.mappedListings, 165);
      assert.equal(migrationReviewBody.routeMap.terminalDecisionsReviewed, 0);
      assert.deepEqual(migrationReviewBody.routeMap.pendingPagination, {
        page: 1,
        pageSize: 10,
        totalPages: 46,
        totalRows: 457,
      });
      assert.equal(migrationReviewBody.routeMap.pendingSample.length, 10);
      assert.ok(migrationReviewBody.routeMap.targetOptions.some((option) => option.path === "/bg/kontakt"));
      assert.ok(migrationReviewBody.routeMap.targetOptions.every((option) => !["home", "search", "listing"].includes(option.type)));
      assert.equal(migrationReviewBody.launchInputChecklistEndpoint, "/api/admin/launch-input-checklist");
      assert.equal(migrationReviewBody.preflightReportsEndpoint, "/api/admin/preflight-reports");
      assert.equal(migrationReviewBody.seoPreflightEndpoint, "/api/admin/seo-preflight");
      assert.equal(migrationReviewBody.liveServicesEndpoint, "/api/admin/live-services");
      assert.equal(migrationReviewBody.liveServiceProvisioningEndpoint, "/api/admin/live-service-provisioning");
      assert.equal(migrationReviewBody.liveServiceProvisioningImportEndpoint, "/api/admin/live-service-provisioning/import");
      assert.equal(migrationReviewBody.liveServiceReportTemplateEndpoint, "/api/admin/live-service-report-template");
      assert.equal(migrationReviewBody.liveServiceReportImportEndpoint, "/api/admin/live-service-reports/import");
      assert.equal(migrationReviewBody.payloadRuntimeEndpoint, "/api/admin/payload-runtime");
      assert.equal(migrationReviewBody.payloadRuntimeBootstrapEndpoint, "/api/admin/payload-runtime-bootstrap");
      assert.equal(migrationReviewBody.payloadRuntimeImportEndpoint, "/api/admin/payload-runtime/import");
      assert.equal(migrationReviewBody.productionRecoveryEndpoint, "/api/admin/production-recovery");
      assert.equal(migrationReviewBody.productionRecoveryTemplateEndpoint, "/api/admin/production-recovery-template");
      assert.equal(migrationReviewBody.productionRecoveryImportEndpoint, "/api/admin/production-recovery/import");
      assert.equal(migrationReviewBody.cmsCollectionsEndpoint, "/api/admin/cms-collections");
      assert.equal(migrationReviewBody.payloadCollectionsEndpoint, "/api/admin/payload-collections");
      assert.equal(migrationReviewBody.listingQualityEndpoint, "/api/admin/listing-quality");
      assert.ok(migrationReviewBody.launchBlockers.blockers.includes("redirect_reviews"));
      assert.ok(migrationReviewBody.launchBlockers.blockers.includes("external_seo_exports"));
      assert.ok(migrationReviewBody.launchBlockers.blockers.includes("listing_quality_review"));
      assert.ok(migrationReviewBody.launchBlockers.blockers.includes("live_services"));
      assert.ok(migrationReviewBody.launchBlockers.blocked_gates.every((gate) => gate.next_actions.length > 0));
      const migrationReviewBlockers = migrationReviewBody.launchBlockers.blockers.join(",");
      const migrationReviewActionCount = migrationReviewBody.launchBlockers.blocked_gates.reduce(
        (count, gate) => count + gate.next_actions.length,
        0,
      );
      assert.equal(migrationReviewBody.routeMap.approvableSample.length > 0, true);

      const migrationReviewHtml = await migrationReviewHtmlRoute.GET(
        new Request("https://example.test/admin/migration/review?locale=bg", { headers: auth }),
      );
      const migrationReviewHtmlBody = await migrationReviewHtml.text();
      assert.equal(migrationReviewHtml.status, 200);
      assert.equal(migrationReviewHtml.headers.get("content-type"), "text/html; charset=utf-8");
      assert.equal(migrationReviewHtmlBody.includes('data-preflight-reports-endpoint="/api/admin/preflight-reports"'), true);
      assert.equal(migrationReviewHtmlBody.includes('data-launch-status="blocked"'), true);
      assert.equal(
        migrationReviewHtmlBody.includes(`data-launch-blockers="${migrationReviewBlockers}"`),
        true,
      );
      assert.equal(migrationReviewHtmlBody.includes(`data-launch-action-count="${migrationReviewActionCount}"`), true);
      assert.equal(migrationReviewHtmlBody.includes('data-seo-preflight-endpoint="/api/admin/seo-preflight"'), true);
      assert.equal(migrationReviewHtmlBody.includes('data-live-services-endpoint="/api/admin/live-services"'), true);
      assert.equal(
        migrationReviewHtmlBody.includes('data-live-service-provisioning-endpoint="/api/admin/live-service-provisioning"'),
        true,
      );
      assert.equal(
        migrationReviewHtmlBody.includes(
          'data-live-service-provisioning-import-endpoint="/api/admin/live-service-provisioning/import"',
        ),
        true,
      );
      assert.equal(
        migrationReviewHtmlBody.includes('data-live-service-report-import-endpoint="/api/admin/live-service-reports/import"'),
        true,
      );
      assert.equal(migrationReviewHtmlBody.includes('data-payload-runtime-endpoint="/api/admin/payload-runtime"'), true);
      assert.equal(
        migrationReviewHtmlBody.includes('data-payload-runtime-bootstrap-endpoint="/api/admin/payload-runtime-bootstrap"'),
        true,
      );
      assert.equal(migrationReviewHtmlBody.includes('data-payload-runtime-import-endpoint="/api/admin/payload-runtime/import"'), true);
      assert.equal(migrationReviewHtmlBody.includes('data-production-recovery-endpoint="/api/admin/production-recovery"'), true);
      assert.equal(
        migrationReviewHtmlBody.includes('data-production-recovery-template-endpoint="/api/admin/production-recovery-template"'),
        true,
      );
      assert.equal(
        migrationReviewHtmlBody.includes('data-production-recovery-import-endpoint="/api/admin/production-recovery/import"'),
        true,
      );
      assert.equal(migrationReviewHtmlBody.includes('data-cms-collections-endpoint="/api/admin/cms-collections"'), true);
      assert.equal(migrationReviewHtmlBody.includes('data-payload-collections-endpoint="/api/admin/payload-collections"'), true);
      assert.equal(migrationReviewHtmlBody.includes('data-listing-quality-endpoint="/api/admin/listing-quality"'), true);
      assert.match(migrationReviewHtmlBody, /data-kind="admin-migration-review"/);
      assert.match(migrationReviewHtmlBody, /data-react-admin-ui="migration-review"/);
      assert.match(migrationReviewHtmlBody, /Работно място за преглед на старите URL адреси/);
      assert.match(migrationReviewHtmlBody, />Търсене<input type="search"/);
      assert.match(migrationReviewHtmlBody, /преглед на старите URL адреси, външни SEO данни/);
      assert.match(migrationReviewHtmlBody, /data-pending-route-count="457"/);
      assert.match(migrationReviewHtmlBody, /data-reviewed-route-count="0"/);
      assert.match(migrationReviewHtmlBody, /data-pending-route-decision="true"/);
      assert.match(migrationReviewHtmlBody, /data-source-evidence="true"/);
      assert.match(migrationReviewHtmlBody, /data-source-title="Недвижими имоти в Сандански \| MS Realty"/);
      assert.match(migrationReviewHtmlBody, /href="https:\/\/makler-realty\.com" target="_blank" rel="noreferrer"/);
      assert.match(migrationReviewHtmlBody, /map_or_rebuild_content_page/);
      assert.match(migrationReviewHtmlBody, /data-route-decision-form="true"/);
      assert.match(migrationReviewHtmlBody, /name="decision" required data-route-decision-select="true"/);
      assert.match(migrationReviewHtmlBody, /list="legacy-route-targets" data-route-decision-target="true"/);
      assert.match(migrationReviewHtmlBody, /data-route-decision-target-preview="true"/);
      assert.match(migrationReviewHtmlBody, /data-route-target-options="true"/);
      assert.match(migrationReviewHtmlBody, /data-launch-evidence-disclosure="true"/);
      assert.match(migrationReviewHtmlBody, /data-admin-runtime-evidence-form="live-service-provisioning"/);
      assert.match(migrationReviewHtmlBody, /data-admin-runtime-evidence-form="live-service-reports"/);
      assert.match(migrationReviewHtmlBody, /data-admin-runtime-evidence-form="payload-runtime"/);
      assert.match(migrationReviewHtmlBody, /data-admin-runtime-evidence-form="production-recovery"/);
      assert.match(migrationReviewHtmlBody, /data-redirect-tools-disclosure="true"/);
      assert.match(migrationReviewHtmlBody, /Данните за старите страници са само за справка/);
      assert.match(migrationReviewHtmlBody, /data-seo-tools-disclosure="true"/);
      assert.match(migrationReviewHtmlBody, /data-quality-tools-disclosure="true"/);
      assert.equal(migrationReviewHtmlBody.includes('<details class="adm-route-decision__disclosure" open>'), false);
      assert.match(migrationReviewHtmlBody, /value="\/bg\/kontakt" label="BG · contact"/);
      assert.match(migrationReviewHtmlBody, /value="redirect_301"/);
      assert.match(migrationReviewHtmlBody, /value="retain_200"/);
      assert.match(migrationReviewHtmlBody, /value="approved_410"/);
      assert.match(migrationReviewHtmlBody, /routePage=2/);
      assert.match(migrationReviewHtmlBody, /data-approvable-listing="true"/);
      assert.match(migrationReviewHtmlBody, /data-seo-import-endpoint="\/api\/admin\/seo-evidence\/import"/);
      assert.match(migrationReviewHtmlBody, /data-launch-readiness-export-endpoint="\/api\/admin\/launch-readiness\/export"/);

      const filteredMigrationReview = await migrationReviewRoute.GET(
        new Request(
          "https://example.test/api/admin/migration/review?routeType=taxonomy&routeDomain=makler-realty.ru",
          { headers: auth },
        ),
      );
      const filteredMigrationReviewBody = await filteredMigrationReview.json();
      assert.equal(filteredMigrationReview.status, 200);
      assert.deepEqual(filteredMigrationReviewBody.routeMap.filters, {
        q: "",
        type: "taxonomy",
        domain: "makler-realty.ru",
      });
      assert.ok(filteredMigrationReviewBody.routeMap.pendingPagination.totalRows > 0);
      assert.ok(filteredMigrationReviewBody.routeMap.pendingPagination.totalRows < migrationReviewBody.routeMap.reviewRequired);
      assert.ok(filteredMigrationReviewBody.routeMap.pendingSample.every((row) => row.url_type === "taxonomy"));
      assert.ok(filteredMigrationReviewBody.routeMap.pendingSample.every((row) => row.source_domain === "makler-realty.ru"));

      const filteredMigrationReviewHtml = await migrationReviewHtmlRoute.GET(
        new Request(
          "https://example.test/admin/migration/review?routeType=taxonomy&routeDomain=makler-realty.ru",
          { headers: auth },
        ),
      );
      const filteredMigrationReviewHtmlBody = await filteredMigrationReviewHtml.text();
      assert.match(filteredMigrationReviewHtmlBody, /data-route-filters="true"/);
      assert.match(filteredMigrationReviewHtmlBody, /data-filtered-route-count="[1-9][0-9]*"/);
      assert.match(filteredMigrationReviewHtmlBody, /routeType=taxonomy/);
      assert.match(filteredMigrationReviewHtmlBody, /routeDomain=makler-realty.ru/);

      const seoEvidence = await seoEvidenceRoute.GET(new Request("https://example.test/api/admin/seo-evidence", { headers: auth }));
      const seoEvidenceBody = await seoEvidence.json();
      assert.equal(seoEvidence.status, 200);
      assert.ok(seoEvidenceBody.missingRequiredSources.includes("search_console"));
      assert.equal(seoEvidenceBody.crawlCoverage.urls, 457);
      assert.deepEqual(seoEvidenceBody.crawlCoverage.urlTypes, { page: 104, post: 42, taxonomy: 146, listing: 165 });
      assert.deepEqual(seoEvidenceBody.requiredSourceDomains, ["makler-realty.com", "makler-realty.ru"]);
      assert.equal(seoEvidenceBody.sources.privacy_events.status, "imported");
      assert.equal(seoEvidenceBody.exportEndpoint, "/api/admin/seo-evidence/export");

      const seoEvidenceExport = await seoEvidenceExportRoute.GET(
        new Request("https://example.test/api/admin/seo-evidence/export", { headers: auth }),
      );
      const seoEvidenceExportBody = await seoEvidenceExport.json();
      assert.equal(seoEvidenceExport.status, 200);
      assert.equal(seoEvidenceExport.headers.get("content-disposition"), 'attachment; filename="seo-evidence.json"');
      assert.ok(seoEvidenceExportBody.summary.missing_required_sources.includes("search_console"));
      assert.ok(seoEvidenceExportBody.url_evidence.length > 0);

      const seoTemplate = await seoEvidenceTemplateRoute.GET(
        new Request("https://example.test/api/admin/seo-evidence/template?source=search_console", { headers: auth }),
      );
      const seoTemplateBody = await seoTemplate.text();
      assert.equal(seoTemplate.status, 200);
      assert.equal(seoTemplate.headers.get("content-type"), "text/csv; charset=utf-8");
      assert.match(seoTemplateBody, /url,clicks,impressions,position/);

      const seoImport = await seoEvidenceImportRoute.POST(
        new Request("https://example.test/api/admin/seo-evidence/import?source=search_console", {
          method: "POST",
          headers: { ...auth, "content-type": "text/csv" },
          body: [
            "url,clicks,impressions,position",
            "https://makler-realty.com/listing/%d0%b0%d0%b2%d1%82%d0%be%d1%80%d0%b5%d0%bc%d0%be%d0%bd%d1%82%d0%bd%d0%b0-%d1%80%d0%b0%d0%b1%d0%be%d1%82%d0%b8%d0%bb%d0%bd%d0%b8%d1%86%d0%b0-%d0%bc%d0%be%d1%82%d0%b5%d0%bb-%d0%b8-%d0%b2%d0%b5%d0%b4/,10,100,3",
            "https://makler-realty.ru/listing/%d0%b0%d0%bf%d0%b0%d1%80%d1%82%d0%b0%d0%bc%d0%b5%d0%bd%d1%82%d1%8b-%d0%b2-%d0%bf%d0%b0%d1%80%d0%ba-%d0%be%d1%82%d0%b5%d0%bb%d0%b5-%d0%bf%d0%b8%d1%80%d0%b8%d0%bd-%d1%81%d0%b0%d0%bd%d0%b4%d0%b0%d0%bd/,4,40,6",
          ].join("\n"),
        }),
      );
      const seoImportBody = await seoImport.json();
      assert.equal(seoImport.status, 202);
      assert.equal(seoImportBody.imported.row_count, 2);
      assert.equal(seoImportBody.crawlCoverage.urls, 457);
      assert.deepEqual(seoImportBody.requiredSourceDomains, ["makler-realty.com", "makler-realty.ru"]);
      assert.equal(seoImportBody.sources.search_console.status, "imported");
      assert.ok(!seoImportBody.missingRequiredSources.includes("search_console"));
      assert.equal(seoImportBody.seoImport.ready, false);
      assert.equal(seoImportBody.seoImport.status, "blocked");
      assert.equal(seoImportBody.seoImport.importedSource, "search_console");
      assert.deepEqual(seoImportBody.seoImport.missingRequiredSources, ["yandex_webmaster", "backlinks"]);
      assert.equal(seoImportBody.report.gates.find((gate) => gate.id === "external_seo_exports").status, "blocked");
      assert.equal(seoImportBody.report.blockers.includes("external_seo_exports"), true);
      assert.equal(fs.existsSync(seoEvidenceOutputPath), true);

      const postSeoReadiness = await launchReadinessRoute.GET(
        new Request("https://example.test/api/admin/launch-readiness", { headers: auth }),
      );
      const postSeoReadinessBody = await postSeoReadiness.json();
      assert.equal(postSeoReadiness.status, 200);
      assert.ok(!postSeoReadinessBody.gates.find((gate) => gate.id === "external_seo_exports").evidence.missing_required_sources.includes("search_console"));

      const postSeoChecklist = await launchInputChecklistRoute.GET(
        new Request("https://example.test/api/admin/launch-input-checklist", { headers: auth }),
      );
      const postSeoChecklistBody = await postSeoChecklist.text();
      assert.equal(postSeoChecklist.status, 200);
      assert.match(postSeoChecklistBody, /migration\/external\/seo\/search-console\.csv`: imported/);

      const readinessExport = await launchReadinessExportRoute.POST(
        new Request("https://example.test/api/admin/launch-readiness/export", { method: "POST", headers: auth }),
      );
      const readinessExportBody = await readinessExport.json();
      assert.equal(readinessExport.status, 201);
      assert.equal(readinessExportBody.outPath, launchReadinessOutputPath);
      assert.equal(JSON.parse(fs.readFileSync(launchReadinessOutputPath, "utf8")).status, "blocked");

      const redirectRoutes = JSON.parse(fs.readFileSync("production/data/legacy-route-map.json", "utf8")).routes.filter(
        (route) => route.url_type === "listing" && route.target_path,
      );
      const [firstRedirect, secondRedirect] = redirectRoutes;
      const redirectWorkbook = await redirectApprovalWorkbookRoute.GET(
        new Request("https://example.test/api/admin/redirect-approval-workbook?pending=1", { headers: auth }),
      );
      const redirectWorkbookCsv = await redirectWorkbook.text();
      assert.equal(redirectWorkbook.status, 200);
      assert.equal(redirectWorkbook.headers.get("content-type"), "text/csv; charset=utf-8");
      assert.ok(redirectWorkbookCsv.includes(firstRedirect.old_url));
      assert.ok(redirectWorkbookCsv.includes(firstRedirect.target_path));
      const redirectWorkbookRows = parseCsv(redirectWorkbookCsv);
      assert.equal(redirectWorkbookRows[0].source_status, "200");
      assert.ok(redirectWorkbookRows[0].source_title);
      assert.ok(redirectWorkbookRows[0].review_owner);

      const redirectApproval = await redirectApprovalsRoute.POST(
        new Request("https://example.test/api/admin/redirect-approvals", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({
            oldUrl: firstRedirect.old_url,
            equivalentContent: true,
            reviewer: "seo_editor",
          }),
        }),
      );
      const redirectApprovalBody = await redirectApproval.json();
      assert.equal(redirectApproval.status, 201);
      assert.equal(redirectApprovalBody.approval.target_path, firstRedirect.target_path);
      assert.equal(redirectApprovalBody.deployablePreview.length, 1);
      assert.equal(redirectApprovalBody.report.gates.find((gate) => gate.id === "redirect_reviews").status, "blocked");

      const migrationReviewAfterDecision = await migrationReviewRoute.GET(
        new Request("https://example.test/api/admin/migration/review?locale=bg", { headers: auth }),
      );
      const migrationReviewAfterDecisionBody = await migrationReviewAfterDecision.json();
      assert.equal(migrationReviewAfterDecisionBody.routeMap.sourceReviewRequired, 457);
      assert.equal(migrationReviewAfterDecisionBody.routeMap.reviewRequired, 456);
      assert.equal(migrationReviewAfterDecisionBody.routeMap.terminalDecisionsReviewed, 1);
      assert.equal(migrationReviewAfterDecisionBody.routeMap.pendingPagination.totalRows, 456);

      const redirectImport = await redirectApprovalsImportRoute.POST(
        new Request("https://example.test/api/admin/redirect-approvals/import", {
          method: "POST",
          headers: { ...auth, "content-type": "text/csv" },
          body: `old_url,equivalent_content,reviewer\n${secondRedirect.old_url},true,seo_editor\n`,
        }),
      );
      const redirectImportBody = await redirectImport.json();
      assert.equal(redirectImport.status, 201);
      assert.equal(redirectImportBody.imported, 1);
      assert.equal(redirectImportBody.deployablePreview.length, 2);
      assert.equal(redirectImportBody.report.gates.find((gate) => gate.id === "redirect_reviews").status, "blocked");

      const pendingRedirectWorkbook = await redirectApprovalWorkbookRoute.GET(
        new Request("https://example.test/api/admin/redirect-approval-workbook?pending=1", { headers: auth }),
      );
      const pendingRedirectWorkbookCsv = await pendingRedirectWorkbook.text();
      assert.equal(pendingRedirectWorkbook.status, 200);
      assert.ok(!pendingRedirectWorkbookCsv.includes(firstRedirect.old_url));
      assert.ok(!pendingRedirectWorkbookCsv.includes(secondRedirect.old_url));

      const redirectExport = await deployableRedirectExportRoute.POST(
        new Request("https://example.test/api/admin/deployable-redirects/export", { method: "POST", headers: auth }),
      );
      const redirectExportBody = await redirectExport.json();
      assert.equal(redirectExport.status, 201);
      assert.equal(redirectExportBody.exported, 2);
      assert.equal(redirectExportBody.summary.total, 2);
      assert.equal(redirectExportBody.report.gates.find((gate) => gate.id === "redirect_reviews").status, "blocked");
      assert.equal(JSON.parse(fs.readFileSync(deployableRedirectOutputPath, "utf8")).redirects.length, 2);

      const listingQualityWorkbook = await listingQualityWorkbookRoute.GET(
        new Request("https://example.test/api/admin/listing-quality-workbook", { headers: auth }),
      );
      const listingQualityCsv = await listingQualityWorkbook.text();
      assert.equal(listingQualityWorkbook.status, 200);
      assert.equal(listingQualityWorkbook.headers.get("content-type"), "text/csv; charset=utf-8");
      assert.match(listingQualityCsv, /MS-CRAWL-0006/);
      assert.match(listingQualityCsv, /thin_public_gallery/);

      const listingQualityReviewDraft = await listingQualityReviewDraftRoute.GET(
        new Request("https://example.test/api/admin/listing-quality-review-draft", { headers: auth }),
      );
      const listingQualityReviewDraftCsv = await listingQualityReviewDraft.text();
      assert.equal(listingQualityReviewDraft.status, 200);
      assert.equal(listingQualityReviewDraft.headers.get("content-type"), "text/csv; charset=utf-8");
      assert.match(listingQualityReviewDraftCsv, /review_notes/);
      assert.match(listingQualityReviewDraftCsv, /Review public gallery/);

      const listingQualityImport = await listingQualityImportRoute.POST(
        new Request("https://example.test/api/admin/listing-quality/import", {
          method: "POST",
          headers: { ...auth, "content-type": "text/csv" },
          body: completeListingQualityReviewCsv(listingQualityReviewDraftCsv, 1),
        }),
      );
      const listingQualityImportBody = await listingQualityImport.json();
      assert.equal(listingQualityImport.status, 202);
      assert.equal(listingQualityImportBody.imported, 1);
      assert.equal(listingQualityImportBody.edited, 1);
      assert.equal(listingQualityImportBody.factsReviewRows, 1);
      assert.equal(listingQualityImportBody.reviewSummary.review_rows, listingQualityImportBody.imported);
      assert.equal(listingQualityImportBody.reviewSummary.missing_review_rows, listingQualityImportBody.missingReviewRows);
      assert.equal(
        listingQualityImportBody.reviewSummary.expected_review_rows,
        listingQualityImportBody.imported + listingQualityImportBody.missingReviewRows,
      );
      assert.equal(listingQualityImportBody.reviewImport.ready, false);
      assert.equal(listingQualityImportBody.reviewImport.status, "blocked");
      assert.equal(listingQualityImportBody.reviewImport.reviewRows, listingQualityImportBody.imported);
      assert.equal(listingQualityImportBody.reviewImport.missingReviewRows, listingQualityImportBody.missingReviewRows);
      assert.ok(listingQualityImportBody.reviewImport.pendingReviewSample.length > 0);
      assert.equal(listingQualityImportBody.report.gates.find((gate) => gate.id === "listing_quality_review").status, "blocked");
      assert.equal(listingQualityImportBody.report.blockers.includes("listing_quality_review"), true);
      assert.equal(listingQualityImportBody.reviewPersisted, true);
      assert.equal(listingQualityImportBody.reviewPath, listingQualityReviewPath);
      assert.equal(parseCsv(fs.readFileSync(listingQualityReviewPath, "utf8")).length, 1);
      assert.deepEqual(listingQualityImportBody.edits[0].edit.patch, { area_sqm: 85 });
      assert.equal(listingQualityImportBody.edits[0].edit.editor, "editor_bg");

      const humanDraft = await translationDraftRoute.POST(
        new Request("https://example.test/api/admin/translations/draft", {
          method: "POST",
          headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            draftSource: "human",
            targetLocale: "en",
            sourceLocale: "bg",
            objectType: "listing",
            objectId: "MS-CRAWL-0001",
            sourceTitle: "Reviewed source listing",
            sourceDescription: "Reviewed source description",
            propertyFactsJson: JSON.stringify({ id: "MS-CRAWL-0001", location: "Sandanski" }),
            reviewer: "editor_en",
            translatedTitle: "MS-CRAWL-0001 Sandanski reviewed English listing",
            translatedBody: "MS-CRAWL-0001 Sandanski reviewed English description",
            translatedSeoTitle: "MS-CRAWL-0001 Sandanski",
            translatedMetaDescription: "MS-CRAWL-0001 Sandanski reviewed English listing content.",
          }),
        }),
      );
      const humanDraftBody = await humanDraft.json();
      assert.equal(humanDraft.status, 201);
      assert.equal(humanDraftBody.status, "human_edited");
      assert.equal(humanDraftBody.human.editor, "editor_en");
      assert.equal("hermes" in humanDraftBody, false);

      const humanApproved = await translationApproveRoute.POST(
        new Request("https://example.test/api/admin/translations/approve", {
          method: "POST",
          headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ taskId: humanDraftBody.id, reviewer: "editor_en" }),
        }),
      );
      const humanApprovedBody = await humanApproved.json();
      assert.equal(humanApproved.status, 201);
      assert.equal(humanApprovedBody.status, "approved");
      assert.equal(humanApprovedBody.human_approved, true);

      const publishQueue = await translationQueueRoute.GET(
        new Request("https://example.test/admin/translations?locale=en&targetLocale=en&q=MS-CRAWL-0001", { headers: auth }),
      );
      const publishQueueHtml = await publishQueue.text();
      assert.match(publishQueueHtml, /data-translation-status="approved"/);
      assert.match(publishQueueHtml, /data-translation-workflow-form="publish"/);
      assert.match(publishQueueHtml, /Approved translation to publish/);

      const humanPublished = await translationPublishRoute.POST(
        new Request("https://example.test/api/admin/translations/publish", {
          method: "POST",
          headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ taskId: humanApprovedBody.id }),
        }),
      );
      const humanPublishedBody = await humanPublished.json();
      assert.equal(humanPublished.status, 201);
      assert.equal(humanPublishedBody.status, "published");
      assert.equal(humanPublishedBody.public_indexable, true);

      const draft = await translationDraftRoute.POST(
        new Request("https://example.test/api/admin/translations/draft", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({
            targetLocale: "es",
            objectType: "listing",
            objectId: "MS-CRAWL-0001",
            sourceContent: {
              title: "Reviewed Sandanski apartment",
              description: "Reviewed source text for a Sandanski property.",
            },
            propertyFacts: { id: "MS-CRAWL-0001", location: "Sandanski", price: "100000 EUR" },
            draftOutput: {
              title: "MS-CRAWL-0001 Sandanski 100000 EUR",
              body: "MS-CRAWL-0001 Sandanski 100000 EUR reviewed Spanish translation draft",
              seo_title: "MS-CRAWL-0001 Sandanski",
              meta_description: "MS-CRAWL-0001 Sandanski 100000 EUR reviewed Spanish translation draft for approved content.",
              citations: [{ source: "cms", field: "title" }],
            },
          }),
        }),
      );
      const draftBody = await draft.json();
      assert.equal(draft.status, 201);
      assert.equal(draftBody.status, "hermes_drafted");
      assert.equal(draftBody.public_indexable, false);
      assert.equal(draftBody.hermes.can_publish, false);

      const directPublished = await translationPublishRoute.POST(
        new Request("https://example.test/api/admin/translations/publish", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({ taskId: draftBody.id }),
        }),
      );
      const directPublishedBody = await directPublished.json();
      assert.equal(directPublished.status, 400);
      assert.match(directPublishedBody.message, /Only human-approved translations/);

      const approved = await translationApproveRoute.POST(
        new Request("https://example.test/api/admin/translations/approve", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({
            taskId: draftBody.id,
            reviewer: "translation_editor",
            approvedAt: "2026-07-06T00:00:00Z",
          }),
        }),
      );
      const approvedBody = await approved.json();
      assert.equal(approved.status, 201);
      assert.equal(approvedBody.status, "approved");
      assert.equal(approvedBody.human_approved, true);

      const published = await translationPublishRoute.POST(
        new Request("https://example.test/api/admin/translations/publish", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({
            taskId: approvedBody.id,
          }),
        }),
      );
      const publishedBody = await published.json();
      assert.equal(published.status, 201);
      assert.equal(publishedBody.status, "published");
      assert.equal(publishedBody.human_approved, true);
      assert.equal(publishedBody.public_indexable, true);

      const reply = await replyRoute.POST(
        new Request("https://example.test/api/admin/replies", {
          method: "POST",
          headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            leadId: "next-admin-lead-test",
            language: "he",
            approved: "true",
            reviewer: "broker_ru",
            reviewedReply: "Reviewed reply for the buyer.",
          }),
        }),
      );
      const replyBody = await reply.json();
      assert.equal(reply.status, 201);
      assert.equal(replyBody.status, "queued_for_manual_send");
      assert.equal(replyBody.broker_approved, true);

      const brokerContact = await brokerContactRoute.POST(
        new Request("https://example.test/api/admin/broker-contacts", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({
            listingId: "MS-CRAWL-0001",
            broker: "broker_ru",
            phone: "+359880000000",
            reviewer: "owner",
            approved: true,
          }),
        }),
      );
      const brokerContactBody = await brokerContact.json();
      assert.equal(brokerContact.status, 201);
      assert.equal(brokerContactBody.status, "approved");
      assert.equal(brokerContactBody.channels.phone, "tel:+359880000000");

      const editor = await listingEditorRoute.GET(
        new Request("https://example.test/admin/listings/edit?locale=bg&listingId=MS-CRAWL-0001", { headers: auth }),
      );
      assert.equal(editor.status, 307);
      assert.equal(editor.headers.get("location"), "/payload-admin/collections/listings/MS-CRAWL-0001");
      const reviewableAsset = loadCmsSeed().records
        .find((record) => record.collection === "listings" && record.id === "MS-CRAWL-0001")
        .media.find((asset) => asset.kind === "photo");
      assert.ok(reviewableAsset, "listing must retain a reviewable source asset");

      const mediaReview = await mediaReviewRoute.POST(
        new Request("https://example.test/api/admin/media/reviews", {
          method: "POST",
          headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            listingId: "MS-CRAWL-0001",
            assetId: mediaAssetId(reviewableAsset),
            decision: "publish",
            kind: "floor_plan",
            alt: "Human-reviewed floor plan for MS-CRAWL-0001.",
            replacementUrl: "https://cdn.example.test/listings/MS-CRAWL-0001-floor-plan.webp",
            reviewer: "media_editor",
            reviewConfirmed: "on",
          }),
        }),
      );
      const mediaReviewBody = await mediaReview.json();
      assert.equal(mediaReview.status, 201);
      assert.equal(mediaReviewBody.review_status, "approved_by_human");
      assert.equal(mediaReviewBody.kind, "floor_plan");

      const edit = await listingEditRoute.POST(
        new Request("https://example.test/api/admin/listings/edit", {
          method: "POST",
          headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            listingId: "MS-CRAWL-0001",
            editor: "content_editor",
            title: "Updated title for Next admin",
            floor: "2",
            total_floors: "5",
            land_area_sqm: "640",
            condition: "Renovated",
            location_precision: "approximate",
            availability_verified_at: "2026-07-19T11:30",
            publish_approved: "true",
            seo_title: "Reviewed SEO title",
            seo_description: "Reviewed SEO description for the source-language listing.",
            seo_canonical: "/bg/imoti/MS-CRAWL-0001",
            seo_og_title: "Reviewed Open Graph title",
            seo_og_description: "Reviewed Open Graph description.",
            seo_robots: "index,follow",
            seo_review_confirmed: "true",
          }),
        }),
      );
      const editBody = await edit.json();
      assert.equal(edit.status, 409);
      assert.equal(editBody.kind, "payload_canonical");
      assert.equal(editBody.canonical_url, "/payload-admin/collections/listings/MS-CRAWL-0001");

      const slugChange = await listingSlugRoute.POST(
        new Request("https://example.test/api/admin/listings/slug", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({
            listingId: "MS-CRAWL-0001",
            locale: "he",
            oldPath: "/he/properties/old-sandanski-slug",
            editor: "seo_editor",
          }),
        }),
      );
      const slugChangeBody = await slugChange.json();
      assert.equal(slugChange.status, 201);
      assert.equal(slugChangeBody.status, 301);
      assert.equal(slugChangeBody.old_path, "/he/properties/old-sandanski-slug");
      assert.equal(slugChangeBody.new_path, "/he/properties/MS-CRAWL-0001");

      const tourApproval = await tourApprovalRoute.POST(
        new Request("https://example.test/api/admin/tours/approve", {
          method: "POST",
          headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            listingId: "MS-CRAWL-0001",
            panoramaUrl: "https://cdn.example.test/tours/MS-CRAWL-0001.jpg",
            thumbnailUrl: "https://cdn.example.test/tours/MS-CRAWL-0001-thumb.jpg",
            accessibilityCaption: "Reviewed 360 tour of the property.",
            reviewer: "media_reviewer",
            reviewConfirmed: "on",
          }),
        }),
      );
      const tourApprovalBody = await tourApproval.json();
      assert.equal(tourApproval.status, 201);
      assert.equal(tourApprovalBody.provider, "photo-sphere-viewer");
      assert.equal(tourApprovalBody.is_public, true);
      assert.ok(tourApprovalBody.fallback_gallery.length > 0);

      const operationsLead = await publicLeadRoute.POST(
        new Request("https://example.test/api/leads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: "next-admin-operations-lead-test",
            source: "website_contact_callback",
            leadType: "general",
            language: "he",
            contact: { name: "Noa Levi", phone: "+359880000001" },
            contact_preference: "phone",
            message: "Please arrange an appointment for this property.",
          }),
        }),
      );
      assert.equal(operationsLead.status, 201);

      const viewing = await viewingRoute.POST(
        new Request("https://example.test/api/admin/viewings", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({
            leadId: "next-admin-operations-lead-test",
            listingReference: "MS-CRAWL-0001",
            startsAt: "2026-07-06T10:00:00Z",
            broker: "broker_ru",
          }),
        }),
      );
      const viewingBody = await viewing.json();
      assert.equal(viewing.status, 201);
      assert.equal(viewingBody.status, "booked");
      assert.equal(viewingBody.feedback_request.status, "open");

      const viewingFollowUpUnauthorized = await viewingFollowUpRoute.POST(
        new Request("https://example.test/api/admin/viewings/follow-up", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ viewingId: viewingBody.id, actor: "broker_ru", action: "complete" }),
        }),
      );
      assert.equal(viewingFollowUpUnauthorized.status, 401);

      const viewingFollowUp = await viewingFollowUpRoute.POST(
        new Request("https://example.test/api/admin/viewings/follow-up", {
          method: "POST",
          headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            viewingId: viewingBody.id,
            actor: "broker_ru",
            action: "complete",
            note: "Viewing completed; follow-up feedback remains internal.",
          }),
        }),
      );
      const viewingFollowUpBody = await viewingFollowUp.json();
      assert.equal(viewingFollowUp.status, 201);
      assert.equal(viewingFollowUpBody.idempotent, false);
      assert.equal(viewingFollowUpBody.viewing.status, "completed");
      assert.equal(viewingFollowUpBody.viewing.feedback_request.status, "open");

      const viewingFollowUpRetry = await viewingFollowUpRoute.POST(
        new Request("https://example.test/api/admin/viewings/follow-up", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({
            viewingId: viewingBody.id,
            actor: "broker_ru",
            action: "complete",
            note: "Viewing completed; follow-up feedback remains internal.",
          }),
        }),
      );
      assert.equal(viewingFollowUpRetry.status, 200);
      assert.equal((await viewingFollowUpRetry.json()).idempotent, true);

      const sellerLead = await publicLeadRoute.POST(
        new Request("https://example.test/api/leads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: "next-admin-seller-pipeline-test",
            source: "website_seller_valuation",
            leadType: "seller",
            language: "bg",
            contact: { name: "Mira Petkova", phone: "+359880000001" },
            property: { location: "Sandanski", type: "apartment" },
            message: "Please arrange a broker valuation.",
          }),
        }),
      );
      const sellerLeadBody = await sellerLead.json();
      assert.equal(sellerLead.status, 201);

      const sellerPipelineOutcomeUnauthorized = await sellerPipelineOutcomeRoute.POST(
        new Request("https://example.test/api/admin/seller-pipeline/outcome", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: "next-admin-seller-callback",
            sellerPipelineId: sellerLeadBody.sellerPipeline.id,
            actor: "broker_bg",
            action: "callback_completed",
          }),
        }),
      );
      assert.equal(sellerPipelineOutcomeUnauthorized.status, 401);

      const sellerPipelineOutcome = await sellerPipelineOutcomeRoute.POST(
        new Request("https://example.test/api/admin/seller-pipeline/outcome", {
          method: "POST",
          headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            id: "next-admin-seller-callback",
            sellerPipelineId: sellerLeadBody.sellerPipeline.id,
            actor: "broker_bg",
            action: "callback_completed",
            note: "Seller requested a valuation callback; internal broker note.",
          }),
        }),
      );
      const sellerPipelineOutcomeBody = await sellerPipelineOutcome.json();
      assert.equal(sellerPipelineOutcome.status, 201);
      assert.equal(sellerPipelineOutcomeBody.idempotent, false);
      assert.equal(sellerPipelineOutcomeBody.seller_pipeline.stage, "callback_completed");

      const sellerPipelineOutcomeRetry = await sellerPipelineOutcomeRoute.POST(
        new Request("https://example.test/api/admin/seller-pipeline/outcome", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({
            id: "next-admin-seller-callback",
            sellerPipelineId: sellerLeadBody.sellerPipeline.id,
            actor: "broker_bg",
            action: "callback_completed",
            note: "Seller requested a valuation callback; internal broker note.",
          }),
        }),
      );
      assert.equal(sellerPipelineOutcomeRetry.status, 200);
      assert.equal((await sellerPipelineOutcomeRetry.json()).idempotent, true);

      const leadInboxAfterViewing = await leadInboxJsonRoute.GET(new Request("https://example.test/api/admin/leads?locale=en", { headers: auth }));
      const leadInboxAfterViewingBody = await leadInboxAfterViewing.json();
      assert.equal(leadInboxAfterViewingBody.summary.viewingFollowUpsOpen, 1);
      assert.equal(leadInboxAfterViewingBody.viewingFollowUpQueue.rows[0].task, "feedback");
      const sellerPipelineQueueRow = leadInboxAfterViewingBody.sellerPipelineQueue.rows.find(
        (row) => row.seller_pipeline_id === sellerLeadBody.sellerPipeline.id,
      );
      assert.equal(leadInboxAfterViewingBody.sellerPipelineQueue.summary.open, 1);
      assert.equal(sellerPipelineQueueRow.stage, "callback_completed");
      assert.equal(sellerPipelineQueueRow.task, "appraisal");

      const viewingsAfterBooking = await viewingsPageRoute.GET(
        new Request("https://example.test/admin/viewings?locale=en", { headers: auth }),
      );
      const viewingsAfterBookingHtml = await viewingsAfterBooking.text();
      assert.match(viewingsAfterBookingHtml, new RegExp(`data-viewing-schedule-row="${viewingBody.id}"`));
      assert.match(viewingsAfterBookingHtml, /data-viewing-follow-up-row="true"/);
      assert.match(viewingsAfterBookingHtml, /data-viewing-task="feedback"/);

      const calendar = await viewingCalendarRoute.GET(new Request("https://example.test/api/admin/viewings.ics", { headers: auth }));
      const calendarBody = await calendar.text();
      assert.equal(calendar.status, 200);
      assert.equal(calendar.headers.get("content-type"), "text/calendar; charset=utf-8");
      assert.match(calendarBody, /BEGIN:VCALENDAR/);
      assert.match(calendarBody, /MS Realty viewing MS-CRAWL-0001/);

      const deal = await dealCloseRoute.POST(
        new Request("https://example.test/api/admin/deals/close", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({
            leadId: "next-admin-operations-lead-test",
            listingReference: "MS-CRAWL-0001",
            broker: "broker_ru",
          }),
        }),
      );
      const dealBody = await deal.json();
      assert.equal(deal.status, 201);
      assert.equal(dealBody.status, "closed");
      assert.equal(dealBody.testimonial_request.status, "open");

      const auditRows = readAuditLog(auditLogPath);
      assert.equal(assertAuditLog(auditRows), true);
      assert.deepEqual(actionCounts(auditRows), {
        account_created: 1,
        locale_created: 1,
        live_service_provisioning_report_imported: 1,
        live_service_report_imported: 1,
        payload_runtime_report_imported: 2,
        production_recovery_report_imported: 1,
        seo_evidence_imported: 1,
        launch_readiness_exported: 1,
        redirect_approval_created: 1,
        redirect_approvals_imported: 1,
        deployable_redirects_exported: 1,
        document_checklist_updated: 1,
        listing_quality_imported: 1,
        translation_drafted: 2,
        translation_approved: 2,
        translation_published: 2,
        reply_approved: 1,
        broker_contact_approved: 1,
        contact_linked: 1,
        listing_slug_changed: 1,
        tour_approved: 1,
        media_reviewed: 1,
        lead_assigned: 1,
        viewing_booked: 1,
        viewing_follow_up_recorded: 1,
        seller_pipeline_outcome_recorded: 1,
        deal_closed: 1,
      });
      const viewingFollowUpAudit = readAuditLog(auditLogPath).find((row) => row.action === "viewing_follow_up_recorded");
      assert.equal(viewingFollowUpAudit.metadata.note, undefined);
      const sellerPipelineAudits = auditRows.filter((row) => row.action === "seller_pipeline_outcome_recorded");
      assert.equal(sellerPipelineAudits.length, 1);
      assert.equal(sellerPipelineAudits[0].metadata.note, undefined);
      assert.equal(sellerPipelineAudits[0].metadata.property, undefined);
    },
  );
});

test("Next admin listing-quality import persists complete launch review CSV", async () => {
  const listingQualityReviewPath = `${tempDir("app-admin-complete-listing-quality")}/listing-quality.csv`;
  const listingEditLedgerPath = tempDefaultListingEdits();
  const auditLogPath = tempJsonl("app-admin-complete-audit");
  const auth = { authorization: "Bearer next-admin-test" };
  await withEnv(
    {
      MS_REALTY_ADMIN_TOKEN: "next-admin-test",
      MS_REALTY_AUDIT_LOG_PATH: auditLogPath,
      MS_REALTY_LISTING_EDIT_LEDGER_PATH: listingEditLedgerPath,
      MS_REALTY_LISTING_QUALITY_REVIEW_PATH: listingQualityReviewPath,
      MS_REALTY_TRANSLATION_LEDGER_PATH: tempJsonl("app-admin-complete-translations"),
    },
    async () => {
      const listingQualityImportRoute = await import("../../app/api/admin/listing-quality/import/route.js");
      const launchReadinessRoute = await import("../../app/api/admin/launch-readiness/route.js");
      const workbookCsv = fs.readFileSync("production/data/listing-quality-workbook.csv", "utf8");
      const reviewCsv = completeListingQualityReviewCsv(workbookCsv);

      const imported = await listingQualityImportRoute.POST(
        new Request("https://example.test/api/admin/listing-quality/import", {
          method: "POST",
          headers: { ...auth, "content-type": "text/csv" },
          body: reviewCsv,
        }),
      );
      const importedBody = await imported.json();
      const readiness = await launchReadinessRoute.GET(
        new Request("https://example.test/api/admin/launch-readiness", { headers: auth }),
      );
      const readinessBody = await readiness.json();

      assert.equal(imported.status, 201);
      assert.equal(importedBody.imported, parseCsv(workbookCsv).length);
      assert.equal(importedBody.reviewPersisted, true);
      assert.equal(importedBody.reviewImport.ready, true);
      assert.equal(importedBody.reviewImport.status, "ready");
      assert.deepEqual(importedBody.reviewImport.pendingReviewSample, []);
      assert.equal(importedBody.reviewPath, listingQualityReviewPath);
      assert.equal(importedBody.reviewPersistenceError, "");
      assert.equal(importedBody.report.gates.find((gate) => gate.id === "listing_quality_review").status, "pass");
      assert.equal(importedBody.report.blockers.includes("listing_quality_review"), false);
      assert.equal(fs.readFileSync(listingQualityReviewPath, "utf8"), reviewCsv);
      assert.equal(readinessBody.gates.find((gate) => gate.id === "listing_quality_review").status, "pass");
      assert.equal(readinessBody.blockers.includes("listing_quality_review"), false);
      const auditRows = readAuditLog(auditLogPath);
      assert.equal(assertAuditLog(auditRows), true);
      assert.deepEqual(actionCounts(auditRows), { listing_quality_imported: 1 });
    },
  );
});

test("Next admin listing-quality workbench saves one audited review and advances the queue", async () => {
  const listingQualityReviewPath = `${tempDir("app-admin-inline-listing-quality")}/listing-quality.csv`;
  const listingEditLedgerPath = tempDefaultListingEdits();
  const auditLogPath = tempJsonl("app-admin-inline-listing-quality-audit");
  const auth = { authorization: "Bearer next-admin-test" };
  await withEnv(
    {
      MS_REALTY_ADMIN_TOKEN: "next-admin-test",
      MS_REALTY_AUDIT_LOG_PATH: auditLogPath,
      MS_REALTY_LISTING_EDIT_LEDGER_PATH: listingEditLedgerPath,
      MS_REALTY_LISTING_QUALITY_REVIEW_PATH: listingQualityReviewPath,
      MS_REALTY_TRANSLATION_LEDGER_PATH: tempJsonl("app-admin-inline-listing-quality-translations"),
    },
    async () => {
      const listingQualityImportRoute = await import("../../app/api/admin/listing-quality/import/route.js");
      const listingQualityReviewDraftRoute = await import("../../app/api/admin/listing-quality-review-draft/route.js");
      const migrationReviewHtmlRoute = await import("../../app/admin/migration/review/route.js");
      const draft = await listingQualityReviewDraftRoute.GET(
        new Request("https://example.test/api/admin/listing-quality-review-draft", { headers: auth }),
      );
      const review = parseCsv(completeListingQualityReviewCsv(await draft.text(), 1))[0];

      const imported = await listingQualityImportRoute.POST(
        new Request("https://example.test/api/admin/listing-quality/import", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify(review),
        }),
      );
      const importedBody = await imported.json();
      const page = await migrationReviewHtmlRoute.GET(
        new Request("https://example.test/admin/migration/review?locale=en", { headers: auth }),
      );
      const html = await page.text();
      const audit = readAuditLog(auditLogPath).find((row) => row.action === "listing_quality_imported");

      assert.equal(imported.status, 202);
      assert.equal(importedBody.imported, 1);
      assert.equal(importedBody.reviewPersisted, true);
      assert.equal(importedBody.edits[0].edit.review_source, "listing_quality_workbench");
      assert.equal(audit.object_id, review.listing_id);
      assert.equal(audit.metadata.source, "listing_quality_workbench");
      assert.match(html, /data-listing-quality-review-form="true"/);
      assert.match(html, /data-quality-pending-listings="164"/);
      assert.equal(html.includes(`data-quality-listing-id="${review.listing_id}"`), false);
    },
  );
});

test("Next admin listing-quality import persists complete review for mounted listing edits", async () => {
  const listingQualityReviewPath = `${tempDir("app-admin-mounted-listing-quality")}/listing-quality.csv`;
  const listingEditLedgerPath = tempDefaultListingEdits();
  fs.appendFileSync(
    listingEditLedgerPath,
    `${JSON.stringify({
      edited_at: "2026-07-07T08:30:00Z",
      id: "listing-edit-mounted-missing-description",
      listing_id: "MS-CRAWL-0003",
      editor: "editor_bg",
      source_locale: "bg",
      patch: { description: "" },
      source_hash_before: "mounted-source-before",
      source_hash_after: "mounted-source-after",
      stale_translation_count: 1,
      stale_locales: ["en"],
    })}\n`,
  );
  const auditLogPath = tempJsonl("app-admin-mounted-complete-audit");
  const auth = { authorization: "Bearer next-admin-test" };
  await withEnv(
    {
      MS_REALTY_ADMIN_TOKEN: "next-admin-test",
      MS_REALTY_AUDIT_LOG_PATH: auditLogPath,
      MS_REALTY_LISTING_EDIT_LEDGER_PATH: listingEditLedgerPath,
      MS_REALTY_LISTING_QUALITY_REVIEW_PATH: listingQualityReviewPath,
      MS_REALTY_TRANSLATION_LEDGER_PATH: tempJsonl("app-admin-mounted-complete-translations"),
    },
    async () => {
      const listingQualityImportRoute = await import("../../app/api/admin/listing-quality/import/route.js");
      const listingQualityWorkbookRoute = await import("../../app/api/admin/listing-quality-workbook/route.js");
      const launchReadinessRoute = await import("../../app/api/admin/launch-readiness/route.js");

      const workbook = await listingQualityWorkbookRoute.GET(
        new Request("https://example.test/api/admin/listing-quality-workbook", { headers: auth }),
      );
      const workbookCsv = await workbook.text();
      const reviewCsv = completeListingQualityReviewCsv(workbookCsv);

      assert.equal(workbook.status, 200);
      assert.match(workbookCsv, /^MS-CRAWL-0003,/m);
      assert.match(workbookCsv, /missing_description/);

      const imported = await listingQualityImportRoute.POST(
        new Request("https://example.test/api/admin/listing-quality/import", {
          method: "POST",
          headers: { ...auth, "content-type": "text/csv" },
          body: reviewCsv,
        }),
      );
      const importedBody = await imported.json();
      const readiness = await launchReadinessRoute.GET(
        new Request("https://example.test/api/admin/launch-readiness", { headers: auth }),
      );
      const readinessBody = await readiness.json();

      assert.equal(imported.status, 201);
      assert.equal(importedBody.imported, parseCsv(workbookCsv).length);
      assert.equal(importedBody.reviewPersisted, true);
      assert.equal(importedBody.reviewImport.ready, true);
      assert.equal(importedBody.reviewImport.status, "ready");
      assert.deepEqual(importedBody.reviewImport.pendingReviewSample, []);
      assert.equal(importedBody.reviewPath, listingQualityReviewPath);
      assert.equal(importedBody.reviewPersistenceError, "");
      assert.equal(importedBody.report.gates.find((gate) => gate.id === "listing_quality_review").status, "pass");
      assert.equal(importedBody.report.blockers.includes("listing_quality_review"), false);
      assert.equal(fs.readFileSync(listingQualityReviewPath, "utf8"), reviewCsv);
      assert.equal(importedBody.edits.some((row) => row.edit.listing_id === "MS-CRAWL-0003"), true);
      assert.equal(readiness.status, 200);
      assert.equal(readinessBody.gates.find((gate) => gate.id === "listing_quality_review").status, "pass");
      assert.equal(readinessBody.blockers.includes("listing_quality_review"), false);
      const auditRows = readAuditLog(auditLogPath);
      assert.equal(assertAuditLog(auditRows), true);
      assert.deepEqual(actionCounts(auditRows), { listing_quality_imported: 1 });
    },
  );
});

test("Next admin adapter drafts Hermes replies without queueing broker send", async () => {
  const leadLedgerPath = tempJsonl("app-admin-reply-draft-leads");
  const auditLogPath = tempJsonl("app-admin-reply-draft-audit");
  fs.appendFileSync(
    leadLedgerPath,
    `${JSON.stringify({
      lead_id: "next-reply-draft-lead",
      listing_reference: "MS-CRAWL-0001",
      original_language: "el",
      message_original: "Interested in this property.",
      contact_preference: "email",
    })}\n`,
  );
  const prompts = [];

  await withEnv({ MS_REALTY_ADMIN_TOKEN: "next-admin-test" }, async () => {
    const config = {
      ...appAdminConfigFromEnv({
        MS_REALTY_AUDIT_LOG_PATH: auditLogPath,
        MS_REALTY_LEAD_LEDGER_PATH: leadLedgerPath,
      }),
      reviewedAt: "2026-07-08T12:30:00Z",
      hermesReplyProvider: async (prompt) => {
        prompts.push(prompt);
        return {
          text: "MS-CRAWL-0001 Sandanski reply draft for broker review.",
          language: prompt.language,
          citations: [{ source: "listing", field: "id" }],
        };
      },
    };

    const unauthorized = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/replies/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId: "next-reply-draft-lead", language: "el" }),
      }),
      { config },
    );
    assert.equal(unauthorized.status, 401);

    const response = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/replies/draft", {
        method: "POST",
        headers: { authorization: "Bearer next-admin-test", "content-type": "application/json" },
        body: JSON.stringify({ leadId: "next-reply-draft-lead", language: "el", listingFacts: { location: "Sandanski" } }),
      }),
      { config },
    );
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.status, "hermes_reply_draft");
    assert.equal(body.can_send_without_approval, false);
    assert.equal(body.broker_approval_required, true);
    assert.equal(prompts[0].capabilities.can_send_customer_messages, false);

    const auditRows = readAuditLog(auditLogPath);
    assert.equal(assertAuditLog(auditRows), true);
    assert.deepEqual(actionCounts(auditRows), { hermes_model_call: 1 });
    assert.equal(auditRows[0].metadata.prompt_version, "reply_draft");
    assert.equal(JSON.stringify(auditRows).includes("Interested in this property"), false);
  });
});

test("Next admin mutations require an attributable production operator", async () => {
  const auditLogPath = tempJsonl("app-admin-operator-audit");
  const launchReadinessOutputPath = tempJson("app-admin-operator-launch", "{}\n");
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_ACTOR: process.env.MS_REALTY_ADMIN_ACTOR,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.MS_REALTY_ADMIN_TOKEN = "next-shared-admin-token";
    delete process.env.MS_REALTY_ADMIN_ACTOR;
    delete process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
    const config = appAdminConfigFromEnv({
      MS_REALTY_AUDIT_LOG_PATH: auditLogPath,
      MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH: launchReadinessOutputPath,
    });

    const sharedWrite = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/launch-readiness/export", {
        method: "POST",
        headers: { authorization: "Bearer next-shared-admin-token" },
      }),
      { config },
    );
    assert.equal(sharedWrite.status, 403);
    assert.equal((await sharedWrite.json()).kind, "operator_identity_required");

    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: "operations_lead", token: "next-operations-token-0123456789", roles: ["admin"] },
    ]);
    const credentialWrite = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/launch-readiness/export", {
        method: "POST",
        headers: { authorization: "Bearer next-operations-token-0123456789" },
      }),
      { config },
    );
    assert.equal(credentialWrite.status, 201);
    assert.equal(readAuditLog(auditLogPath).at(-1).actor, "operations_lead");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("Next admin replies bind the named production operator before queueing", async () => {
  const leadLedgerPath = tempJsonl("app-admin-operator-reply-leads");
  const replyOutboxPath = tempJsonl("app-admin-operator-reply-outbox");
  const auditLogPath = tempJsonl("app-admin-operator-reply-audit");
  const replyDeliveryOutcomeLedgerPath = tempJsonl("app-admin-operator-reply-delivery");
  fs.appendFileSync(
    leadLedgerPath,
    `${JSON.stringify({
      lead_id: "next-operator-reply-lead",
      listing_reference: "MS-CRAWL-0001",
      original_language: "ru",
      message_original: "Please contact me about this listing.",
    })}\n`,
  );
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_ACTOR: process.env.MS_REALTY_ADMIN_ACTOR,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.MS_REALTY_ADMIN_TOKEN = "next-shared-admin-token";
    delete process.env.MS_REALTY_ADMIN_ACTOR;
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: "operations_lead", token: "next-operations-token-0123456789", roles: ["admin"] },
    ]);
    const config = appAdminConfigFromEnv({
      MS_REALTY_AUDIT_LOG_PATH: auditLogPath,
      MS_REALTY_LEAD_LEDGER_PATH: leadLedgerPath,
      MS_REALTY_REPLY_OUTBOX_PATH: replyOutboxPath,
      MS_REALTY_REPLY_DELIVERY_OUTCOME_LEDGER_PATH: replyDeliveryOutcomeLedgerPath,
      MS_REALTY_REVIEWED_AT: "2026-07-18T18:00:00Z",
      MS_REALTY_REPLY_DELIVERED_AT: "2026-07-18T18:05:00Z",
    });
    const headers = {
      authorization: "Bearer next-operations-token-0123456789",
      "content-type": "application/json",
    };

    const mismatched = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/replies", {
        method: "POST",
        headers,
        body: JSON.stringify({
          leadId: "next-operator-reply-lead",
          language: "ru",
          approved: true,
          reviewer: "someone_else",
          reviewedReply: "Broker-reviewed reply.",
        }),
      }),
      { config },
    );
    assert.equal(mismatched.status, 400);
    assert.match((await mismatched.json()).message, /Submitted reviewer must match the authenticated operator/);

    const queued = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/replies", {
        method: "POST",
        headers,
        body: JSON.stringify({
          leadId: "next-operator-reply-lead",
          language: "ru",
          approved: true,
          reviewedReply: "Broker-reviewed reply.",
        }),
      }),
      { config },
    );
    const queuedBody = await queued.json();
    assert.equal(queued.status, 201);
    assert.equal(queuedBody.status, "queued_for_manual_send");
    assert.equal(queuedBody.broker_approved, true);
    assert.equal(queuedBody.reviewer, "operations_lead");
    assert.equal(readAuditLog(auditLogPath).at(-1).actor, "operations_lead");

    const queuedHtmlResponse = await renderAppAdminResponse(
      new Request("https://example.test/admin/leads", { headers }),
      { config },
    );
    const queuedHtml = await queuedHtmlResponse.text();
    assert.match(queuedHtml, /data-reply-delivery-form="true"/);
    assert.match(queuedHtml, /data-lead-replied="false"/);
    assert.match(queuedHtml, /Broker-reviewed reply\./);

    const spoofedDelivery = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/replies/delivery", {
        method: "POST",
        headers,
        body: JSON.stringify({ replyId: queuedBody.id, actor: "someone_else", action: "sent", channel: "email" }),
      }),
      { config },
    );
    assert.equal(spoofedDelivery.status, 400);

    const delivered = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/replies/delivery", {
        method: "POST",
        headers,
        body: JSON.stringify({ replyId: queuedBody.id, action: "sent", channel: "email" }),
      }),
      { config },
    );
    const deliveredBody = await delivered.json();
    assert.equal(delivered.status, 201);
    assert.equal(deliveredBody.delivery.status, "sent");
    assert.equal(deliveredBody.outcome.actor, "operations_lead");
    assert.equal(readReplyDeliveryOutcomes(replyDeliveryOutcomeLedgerPath).length, 1);

    const inboxResponse = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/leads", { headers }),
      { config },
    );
    const inbox = await inboxResponse.json();
    assert.equal(inbox.summary.repliesQueued, 0);
    assert.equal(inbox.summary.repliesSent, 1);
    assert.equal(inbox.leadSla.rows[0].status, "customer_reply_sent");
    assert.equal(readAuditLog(auditLogPath).filter((row) => row.action === "reply_delivery_recorded").length, 1);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
