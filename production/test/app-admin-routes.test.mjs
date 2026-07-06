import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";

function tempJsonl(prefix) {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-${prefix}-`)}/${prefix}.jsonl`;
  fs.writeFileSync(file, "");
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
  await withEnv(
    {
      MS_REALTY_ADMIN_TOKEN: "next-admin-test",
      MS_REALTY_BROKER_CONTACT_LEDGER_PATH: tempJsonl("app-admin-broker-contacts"),
      MS_REALTY_DEAL_LEDGER_PATH: tempJsonl("app-admin-deals"),
      MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH: deployableRedirectOutputPath,
      MS_REALTY_EVENT_LEDGER_PATH: tempJsonl("app-admin-events"),
      MS_REALTY_LANGUAGE_REQUEST_LEDGER_PATH: tempJsonl("app-admin-language-requests"),
      MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH: launchReadinessOutputPath,
      MS_REALTY_LEAD_LEDGER_PATH: tempJsonl("app-admin-leads"),
      MS_REALTY_LOCALE_REGISTRY_PATH: tempJson("app-admin-locales", fs.readFileSync("locales/registry.json", "utf8")),
      MS_REALTY_LISTING_EDIT_LEDGER_PATH: tempJsonl("app-admin-listing-edits"),
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
      const launchInputChecklistRoute = await import("../../app/api/admin/launch-input-checklist/route.js");
      const launchReadinessExportRoute = await import("../../app/api/admin/launch-readiness/export/route.js");
      const launchReadinessRoute = await import("../../app/api/admin/launch-readiness/route.js");
      const listingQualityImportRoute = await import("../../app/api/admin/listing-quality/import/route.js");
      const listingQualityWorkbookRoute = await import("../../app/api/admin/listing-quality-workbook/route.js");
      const localeRoute = await import("../../app/api/admin/locales/route.js");
      const redirectApprovalWorkbookRoute = await import("../../app/api/admin/redirect-approval-workbook/route.js");
      const redirectApprovalsRoute = await import("../../app/api/admin/redirect-approvals/route.js");
      const redirectApprovalsImportRoute = await import("../../app/api/admin/redirect-approvals/import/route.js");
      const replyRoute = await import("../../app/api/admin/replies/route.js");
      const seoEvidenceRoute = await import("../../app/api/admin/seo-evidence/route.js");
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
      const inbox = await leadInboxRoute.GET(new Request("https://example.test/admin/leads?locale=ru", { headers: auth }));
      const inboxHtml = await inbox.text();
      assert.equal(inbox.status, 200);
      assert.equal(inbox.headers.get("cache-control"), "no-store");
      assert.match(inboxHtml, /<html lang="ru" dir="ltr">/);
      assert.match(inboxHtml, /data-kind="admin-lead-inbox"/);
      assert.match(inboxHtml, /data-lead-row="true"/);
      assert.match(inboxHtml, /he -> en/);

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

      const launchChecklist = await launchInputChecklistRoute.GET(
        new Request("https://example.test/api/admin/launch-input-checklist", { headers: auth }),
      );
      const launchChecklistBody = await launchChecklist.text();
      assert.equal(launchChecklist.status, 200);
      assert.equal(launchChecklist.headers.get("content-type"), "text/markdown; charset=utf-8");
      assert.match(launchChecklistBody, /# Launch Input Checklist/);
      assert.match(launchChecklistBody, /External SEO Exports/);

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
      assert.equal(migrationReviewBody.routeMap.approvableSample.length > 0, true);

      const migrationReviewHtml = await migrationReviewHtmlRoute.GET(
        new Request("https://example.test/admin/migration/review?locale=bg", { headers: auth }),
      );
      const migrationReviewHtmlBody = await migrationReviewHtml.text();
      assert.equal(migrationReviewHtml.status, 200);
      assert.equal(migrationReviewHtml.headers.get("content-type"), "text/html; charset=utf-8");
      assert.match(migrationReviewHtmlBody, /data-kind="admin-migration-review"/);
      assert.match(migrationReviewHtmlBody, /data-approvable-listing="true"/);
      assert.match(migrationReviewHtmlBody, /data-seo-import-endpoint="\/api\/admin\/seo-evidence\/import"/);
      assert.match(migrationReviewHtmlBody, /data-launch-readiness-export-endpoint="\/api\/admin\/launch-readiness\/export"/);

      const seoEvidence = await seoEvidenceRoute.GET(new Request("https://example.test/api/admin/seo-evidence", { headers: auth }));
      const seoEvidenceBody = await seoEvidence.json();
      assert.equal(seoEvidence.status, 200);
      assert.ok(seoEvidenceBody.missingRequiredSources.includes("search_console"));
      assert.equal(seoEvidenceBody.sources.privacy_events.status, "imported");

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
      assert.equal(seoImportBody.sources.search_console.status, "imported");
      assert.ok(!seoImportBody.missingRequiredSources.includes("search_console"));
      assert.equal(fs.existsSync(seoEvidenceOutputPath), true);

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

      const listingQualityImport = await listingQualityImportRoute.POST(
        new Request("https://example.test/api/admin/listing-quality/import", {
          method: "POST",
          headers: { ...auth, "content-type": "text/csv" },
          body: "listing_id,media_reviewer,review_notes\nMS-CRAWL-0006,media_editor,Gallery reviewed for launch.\n",
        }),
      );
      const listingQualityImportBody = await listingQualityImport.json();
      assert.equal(listingQualityImport.status, 201);
      assert.equal(listingQualityImportBody.imported, 1);
      assert.equal(listingQualityImportBody.edited, 1);
      assert.equal(listingQualityImportBody.mediaReviewRows, 1);
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
    },
  );
});
