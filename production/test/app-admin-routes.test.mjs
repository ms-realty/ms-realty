import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { assertAuditLog, readAuditLog } from "../lib/audit-log.mjs";
import { parseCsv } from "../lib/csv.mjs";
import { buildPayloadRuntimeReport } from "../lib/payload-runtime.mjs";

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

function completeListingQualityReviewCsv(workbookCsv) {
  const headers = ["listing_id", "price_eur", "bedrooms", "location", "description", "facts_reviewer", "media_reviewer", "review_notes"];
  const rows = parseCsv(workbookCsv).map((row) => {
    const fields = (row.required_editor_fields || "").split("|").filter(Boolean);
    const needsFacts = fields.some((field) => ["price_eur", "bedrooms", "location", "description"].includes(field));
    const needsMedia = fields.some((field) => ["media_review", "media_alt_text", "public_gallery", "tour_review"].includes(field));
    return [
      row.listing_id,
      fields.includes("price_eur") ? row.price_eur || 123000 : "",
      fields.includes("bedrooms") ? row.bedrooms || 2 : "",
      fields.includes("location") ? row.location || "Sandanski" : "",
      fields.includes("description") ? "Reviewed listing description" : "",
      needsFacts ? "editor_bg" : "",
      needsMedia ? "media_editor" : "",
      "Reviewed source gallery evidence from admin listing-quality workbook",
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
  const listingQualityReviewPath = `${seoEvidenceInputDir}/listing-quality.csv`;
  const listingEditLedgerPath = tempDefaultListingEdits();
  const auditLogPath = tempJsonl("app-admin-audit");
  await withEnv(
    {
      MS_REALTY_ADMIN_TOKEN: "next-admin-test",
      MS_REALTY_AUDIT_LOG_PATH: auditLogPath,
      MS_REALTY_BROKER_CONTACT_LEDGER_PATH: tempJsonl("app-admin-broker-contacts"),
      MS_REALTY_CONSENT_LEDGER_PATH: tempJsonl("app-admin-consents"),
      MS_REALTY_DEAL_LEDGER_PATH: tempJsonl("app-admin-deals"),
      MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH: deployableRedirectOutputPath,
      MS_REALTY_EVENT_LEDGER_PATH: tempJsonl("app-admin-events"),
      MS_REALTY_LANGUAGE_REQUEST_LEDGER_PATH: tempJsonl("app-admin-language-requests"),
      MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH: launchReadinessOutputPath,
      MS_REALTY_LEAD_LEDGER_PATH: tempJsonl("app-admin-leads"),
      MS_REALTY_LISTING_QUALITY_REVIEW_PATH: listingQualityReviewPath,
      MS_REALTY_SEARCH_SYNC_REPORT_PATH: searchSyncReportPath,
      MS_REALTY_SEARCH_QUERY_REPORT_PATH: searchQueryReportPath,
      MS_REALTY_HERMES_WORKER_REPORT_PATH: hermesWorkerReportPath,
      MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH: liveServiceProvisioningReportPath,
      MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH: payloadRuntimeReportPath,
      MS_REALTY_LOCALE_REGISTRY_PATH: tempJson("app-admin-locales", fs.readFileSync("locales/registry.json", "utf8")),
      MS_REALTY_LISTING_EDIT_LEDGER_PATH: listingEditLedgerPath,
      MS_REALTY_REDIRECT_APPROVALS_PATH: tempJsonl("app-admin-redirect-approvals"),
      MS_REALTY_REPLY_OUTBOX_PATH: tempJsonl("app-admin-replies"),
      MS_REALTY_SAVED_SEARCH_LEDGER_PATH: tempJsonl("app-admin-saved-searches"),
      MS_REALTY_SELLER_PIPELINE_PATH: tempJsonl("app-admin-seller-pipeline"),
      MS_REALTY_SEO_EVIDENCE_INPUT_DIR: seoEvidenceInputDir,
      MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH: seoEvidenceOutputPath,
      MS_REALTY_SLUG_HISTORY_PATH: tempJsonl("app-admin-slug-history"),
      MS_REALTY_TOUR_APPROVAL_LEDGER_PATH: tempJsonl("app-admin-tour-approvals"),
      MS_REALTY_TRANSLATION_LEDGER_PATH: tempJsonl("app-admin-translations"),
      MS_REALTY_VIEWING_LEDGER_PATH: tempJsonl("app-admin-viewings"),
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
      const launchReadinessExportRoute = await import("../../app/api/admin/launch-readiness/export/route.js");
      const launchReadinessRoute = await import("../../app/api/admin/launch-readiness/route.js");
      const preflightReportsRoute = await import("../../app/api/admin/preflight-reports/route.js");
      const seoPreflightRoute = await import("../../app/api/admin/seo-preflight/route.js");
      const liveServicesRoute = await import("../../app/api/admin/live-services/route.js");
      const liveServiceProvisioningRoute = await import("../../app/api/admin/live-service-provisioning/route.js");
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
      const seoEvidenceRoute = await import("../../app/api/admin/seo-evidence/route.js");
      const seoEvidenceExportRoute = await import("../../app/api/admin/seo-evidence/export/route.js");
      const seoEvidenceImportRoute = await import("../../app/api/admin/seo-evidence/import/route.js");
      const seoEvidenceTemplateRoute = await import("../../app/api/admin/seo-evidence/template/route.js");
      const listingEditRoute = await import("../../app/api/admin/listings/edit/route.js");
      const listingSlugRoute = await import("../../app/api/admin/listings/slug/route.js");
      const translationDraftRoute = await import("../../app/api/admin/translations/draft/route.js");
      const translationPublishRoute = await import("../../app/api/admin/translations/publish/route.js");
      const tourApprovalRoute = await import("../../app/api/admin/tours/approve/route.js");
      const viewingRoute = await import("../../app/api/admin/viewings/route.js");
      const viewingCalendarRoute = await import("../../app/api/admin/viewings.ics/route.js");
      const leadInboxRoute = await import("../../app/admin/leads/route.js");
      const leadInboxJsonRoute = await import("../../app/api/admin/leads/route.js");
      const listingEditorRoute = await import("../../app/admin/listings/edit/route.js");
      const migrationReviewHtmlRoute = await import("../../app/admin/migration/review/route.js");
      const migrationReviewRoute = await import("../../app/api/admin/migration/review/route.js");

      const lead = await publicLeadRoute.POST(
        new Request("https://example.test/api/leads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: "next-admin-lead-test",
            leadType: "buyer",
            language: "he",
            listingReference: "MS-CRAWL-0001",
            contact: { name: "Noa Levi" },
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

      const inbox = await leadInboxRoute.GET(new Request("https://example.test/admin/leads?locale=ru", { headers: auth }));
      const inboxHtml = await inbox.text();
      assert.equal(inbox.status, 200);
      assert.equal(inbox.headers.get("cache-control"), "no-store");
      assert.match(inboxHtml, /<html lang="ru" dir="ltr">/);
      assert.match(inboxHtml, /data-kind="admin-lead-inbox"/);
      assert.match(inboxHtml, /data-react-admin-ui="lead-inbox"/);
      assert.match(inboxHtml, /data-admin-workbench="crm"/);
      assert.match(inboxHtml, /data-inbox-layout="list-detail-action"/);
      assert.match(inboxHtml, /data-lead-queue-tabs="true"/);
      assert.match(inboxHtml, /data-lead-row="true"/);
      assert.match(inboxHtml, /data-original-language="he"/);
      assert.match(inboxHtml, /data-reply-approval-required="true"/);
      assert.match(inboxHtml, /data-hermes-reply-draft="broker_review_required"/);
      assert.match(inboxHtml, /data-show-original-toggle="true"/);
      assert.match(inboxHtml, /he -&gt; en/);

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
      assert.equal(payloadCollectionsBody.collections.length, 4);
      assert.equal(payloadCollectionsBody.collections.every((collection) => collection.versions.drafts), true);

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
      assert.equal(liveImportValidBody.livePreflight.status, "blocked");
      assert.equal(liveImportValidBody.livePreflight.summary.pass, 1);
      assert.equal(liveImportValidBody.livePreflight.summary.missing_report, 2);
      assert.equal(fs.existsSync(hermesWorkerReportPath), true);

      const payloadRuntimeReport = await buildPayloadRuntimeReport({
        databaseProbe: async ({ database, host, port }) => ({ database, host, port, status: "pass" }),
        env: {
          DATABASE_URL: "postgres://payload:secret@db.internal:5432/ms_realty",
          PAYLOAD_SECRET: "not-written-to-report-32-byte-minimum",
        },
        generatedAt: "2026-07-06T00:00:00Z",
      });
      const blockedPayloadRuntimeReport = await buildPayloadRuntimeReport({
        env: {},
        generatedAt: "2026-07-06T00:00:00Z",
      });
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
      const payloadImportLocalBody = await payloadImportLocal.json();
      assert.equal(payloadImportBlocked.status, 202);
      assert.equal(payloadImportBlockedBody.report.gates.find((gate) => gate.id === "payload_runtime").status, "blocked");
      assert.equal(payloadImportLocal.status, 400);
      assert.match(payloadImportLocalBody.message, /localhost or placeholder/);
      assert.equal(payloadImport.status, 201);
      assert.equal(payloadImportBody.imported.outPath, payloadRuntimeReportPath);
      assert.equal(payloadImportBody.report.gates.find((gate) => gate.id === "payload_runtime").status, "pass");
      assert.equal(fs.existsSync(payloadRuntimeReportPath), true);

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
      assert.equal(migrationReviewBody.routeMap.mappedListings, 165);
      assert.equal(migrationReviewBody.launchInputChecklistEndpoint, "/api/admin/launch-input-checklist");
      assert.equal(migrationReviewBody.preflightReportsEndpoint, "/api/admin/preflight-reports");
      assert.equal(migrationReviewBody.seoPreflightEndpoint, "/api/admin/seo-preflight");
      assert.equal(migrationReviewBody.liveServicesEndpoint, "/api/admin/live-services");
      assert.equal(migrationReviewBody.liveServiceProvisioningEndpoint, "/api/admin/live-service-provisioning");
      assert.equal(migrationReviewBody.payloadRuntimeEndpoint, "/api/admin/payload-runtime");
      assert.equal(migrationReviewBody.payloadRuntimeBootstrapEndpoint, "/api/admin/payload-runtime-bootstrap");
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
      assert.equal(migrationReviewHtmlBody.includes('data-payload-runtime-endpoint="/api/admin/payload-runtime"'), true);
      assert.equal(
        migrationReviewHtmlBody.includes('data-payload-runtime-bootstrap-endpoint="/api/admin/payload-runtime-bootstrap"'),
        true,
      );
      assert.equal(migrationReviewHtmlBody.includes('data-cms-collections-endpoint="/api/admin/cms-collections"'), true);
      assert.equal(migrationReviewHtmlBody.includes('data-payload-collections-endpoint="/api/admin/payload-collections"'), true);
      assert.equal(migrationReviewHtmlBody.includes('data-listing-quality-endpoint="/api/admin/listing-quality"'), true);
      assert.match(migrationReviewHtmlBody, /data-kind="admin-migration-review"/);
      assert.match(migrationReviewHtmlBody, /data-react-admin-ui="migration-review"/);
      assert.match(migrationReviewHtmlBody, /data-approvable-listing="true"/);
      assert.match(migrationReviewHtmlBody, /data-seo-import-endpoint="\/api\/admin\/seo-evidence\/import"/);
      assert.match(migrationReviewHtmlBody, /data-launch-readiness-export-endpoint="\/api\/admin\/launch-readiness\/export"/);

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
      assert.equal(seoImport.status, 201);
      assert.equal(seoImportBody.imported.row_count, 2);
      assert.equal(seoImportBody.crawlCoverage.urls, 457);
      assert.deepEqual(seoImportBody.requiredSourceDomains, ["makler-realty.com", "makler-realty.ru"]);
      assert.equal(seoImportBody.sources.search_console.status, "imported");
      assert.ok(!seoImportBody.missingRequiredSources.includes("search_console"));
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
          body: "listing_id,media_reviewer,review_notes\nMS-CRAWL-0006,media_editor,Gallery reviewed for launch.\n",
        }),
      );
      const listingQualityImportBody = await listingQualityImport.json();
      assert.equal(listingQualityImport.status, 202);
      assert.equal(listingQualityImportBody.imported, 1);
      assert.equal(listingQualityImportBody.edited, 1);
      assert.equal(listingQualityImportBody.mediaReviewRows, 1);
      assert.equal(listingQualityImportBody.reviewPersisted, false);
      assert.equal(listingQualityImportBody.reviewPath, null);
      assert.equal(listingQualityImportBody.edits[0].edit.media_reviewer, "media_editor");

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
          }),
        }),
      );
      const draftBody = await draft.json();
      assert.equal(draft.status, 201);
      assert.equal(draftBody.status, "hermes_drafted");
      assert.equal(draftBody.public_indexable, false);
      assert.equal(draftBody.hermes.can_publish, false);

      const published = await translationPublishRoute.POST(
        new Request("https://example.test/api/admin/translations/publish", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({
            taskId: draftBody.id,
            reviewer: "translation_editor",
            approvedAt: "2026-07-06T00:00:00Z",
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
      const editorHtml = await editor.text();
      assert.equal(editor.status, 200);
      assert.match(editorHtml, /<html lang="bg" dir="ltr">/);
      assert.match(editorHtml, /data-kind="admin-listing-editor"/);
      assert.match(editorHtml, /data-react-admin-ui="listing-editor"/);
      assert.match(editorHtml, /data-admin-workbench="cms"/);
      assert.match(editorHtml, /data-editor-layout="facts-translations-quality"/);
      assert.match(editorHtml, /data-editor-tabs="true"/);
      assert.match(editorHtml, /data-editor-panel="facts"/);
      assert.match(editorHtml, /data-translation-panel="true"/);
      assert.match(editorHtml, /data-media-review-panel="true"/);
      assert.match(editorHtml, /data-tour-review-status=/);
      assert.match(editorHtml, /data-listing-id="MS-CRAWL-0001"/);

      const edit = await listingEditRoute.POST(
        new Request("https://example.test/api/admin/listings/edit", {
          method: "POST",
          headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            listingId: "MS-CRAWL-0001",
            editor: "content_editor",
            title: "Updated title for Next admin",
          }),
        }),
      );
      const editBody = await edit.json();
      assert.equal(edit.status, 201);
      assert.equal(editBody.edit.patch.title, "Updated title for Next admin");

      const updatedEditor = await listingEditorRoute.GET(
        new Request("https://example.test/admin/listings/edit?locale=bg&listingId=MS-CRAWL-0001", { headers: auth }),
      );
      assert.match(await updatedEditor.text(), /value="Updated title for Next admin"/);

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
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({
            listingId: "MS-CRAWL-0001",
            panoramaUrl: "https://cdn.example.test/tours/MS-CRAWL-0001.jpg",
            thumbnailUrl: "https://cdn.example.test/tours/MS-CRAWL-0001-thumb.jpg",
            accessibilityCaption: "Reviewed 360 tour of the property.",
            reviewer: "media_reviewer",
          }),
        }),
      );
      const tourApprovalBody = await tourApproval.json();
      assert.equal(tourApproval.status, 201);
      assert.equal(tourApprovalBody.provider, "photo-sphere-viewer");
      assert.equal(tourApprovalBody.is_public, true);
      assert.ok(tourApprovalBody.fallback_gallery.length > 0);

      const viewing = await viewingRoute.POST(
        new Request("https://example.test/api/admin/viewings", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({
            leadId: "next-admin-lead-test",
            startsAt: "2026-07-06T10:00:00Z",
            broker: "broker_ru",
          }),
        }),
      );
      const viewingBody = await viewing.json();
      assert.equal(viewing.status, 201);
      assert.equal(viewingBody.status, "booked");
      assert.equal(viewingBody.feedback_request.status, "open");

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
          body: JSON.stringify({ leadId: "next-admin-lead-test", broker: "broker_ru" }),
        }),
      );
      const dealBody = await deal.json();
      assert.equal(deal.status, 201);
      assert.equal(dealBody.status, "closed");
      assert.equal(dealBody.testimonial_request.status, "open");

      const auditRows = readAuditLog(auditLogPath);
      assert.equal(assertAuditLog(auditRows), true);
      assert.deepEqual(actionCounts(auditRows), {
        locale_created: 1,
        live_service_report_imported: 1,
        payload_runtime_report_imported: 2,
        seo_evidence_imported: 1,
        launch_readiness_exported: 1,
        redirect_approval_created: 1,
        redirect_approvals_imported: 1,
        deployable_redirects_exported: 1,
        listing_quality_imported: 1,
        translation_drafted: 1,
        translation_published: 1,
        reply_approved: 1,
        broker_contact_approved: 1,
        listing_edited: 1,
        listing_slug_changed: 1,
        tour_approved: 1,
        viewing_booked: 1,
        deal_closed: 1,
      });
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
      assert.equal(importedBody.reviewPath, listingQualityReviewPath);
      assert.equal(importedBody.reviewPersistenceError, "");
      assert.equal(fs.readFileSync(listingQualityReviewPath, "utf8"), reviewCsv);
      assert.equal(readinessBody.gates.find((gate) => gate.id === "listing_quality_review").status, "pass");
      assert.equal(readinessBody.blockers.includes("listing_quality_review"), false);
      const auditRows = readAuditLog(auditLogPath);
      assert.equal(assertAuditLog(auditRows), true);
      assert.deepEqual(actionCounts(auditRows), { listing_quality_imported: 1 });
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
      assert.equal(importedBody.reviewPath, listingQualityReviewPath);
      assert.equal(importedBody.reviewPersistenceError, "");
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
