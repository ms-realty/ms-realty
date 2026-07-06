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
  await withEnv(
    {
      MS_REALTY_ADMIN_TOKEN: "next-admin-test",
      MS_REALTY_BROKER_CONTACT_LEDGER_PATH: tempJsonl("app-admin-broker-contacts"),
      MS_REALTY_DEAL_LEDGER_PATH: tempJsonl("app-admin-deals"),
      MS_REALTY_EVENT_LEDGER_PATH: tempJsonl("app-admin-events"),
      MS_REALTY_LANGUAGE_REQUEST_LEDGER_PATH: tempJsonl("app-admin-language-requests"),
      MS_REALTY_LEAD_LEDGER_PATH: tempJsonl("app-admin-leads"),
      MS_REALTY_LOCALE_REGISTRY_PATH: tempJson("app-admin-locales", fs.readFileSync("locales/registry.json", "utf8")),
      MS_REALTY_LISTING_EDIT_LEDGER_PATH: tempJsonl("app-admin-listing-edits"),
      MS_REALTY_REPLY_OUTBOX_PATH: tempJsonl("app-admin-replies"),
      MS_REALTY_SAVED_SEARCH_LEDGER_PATH: tempJsonl("app-admin-saved-searches"),
      MS_REALTY_SELLER_PIPELINE_PATH: tempJsonl("app-admin-seller-pipeline"),
      MS_REALTY_TOUR_APPROVAL_LEDGER_PATH: tempJsonl("app-admin-tour-approvals"),
      MS_REALTY_TRANSLATION_LEDGER_PATH: tempJsonl("app-admin-translations"),
      MS_REALTY_VIEWING_LEDGER_PATH: tempJsonl("app-admin-viewings"),
    },
    async () => {
      const publicLeadRoute = await import("../../app/api/leads/route.js");
      const brokerContactRoute = await import("../../app/api/admin/broker-contacts/route.js");
      const dealCloseRoute = await import("../../app/api/admin/deals/close/route.js");
      const launchInputChecklistRoute = await import("../../app/api/admin/launch-input-checklist/route.js");
      const launchReadinessRoute = await import("../../app/api/admin/launch-readiness/route.js");
      const localeRoute = await import("../../app/api/admin/locales/route.js");
      const replyRoute = await import("../../app/api/admin/replies/route.js");
      const seoEvidenceRoute = await import("../../app/api/admin/seo-evidence/route.js");
      const listingEditRoute = await import("../../app/api/admin/listings/edit/route.js");
      const translationDraftRoute = await import("../../app/api/admin/translations/draft/route.js");
      const translationPublishRoute = await import("../../app/api/admin/translations/publish/route.js");
      const tourApprovalRoute = await import("../../app/api/admin/tours/approve/route.js");
      const viewingRoute = await import("../../app/api/admin/viewings/route.js");
      const viewingCalendarRoute = await import("../../app/api/admin/viewings.ics/route.js");
      const leadInboxRoute = await import("../../app/admin/leads/route.js");
      const listingEditorRoute = await import("../../app/admin/listings/edit/route.js");

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

      const seoEvidence = await seoEvidenceRoute.GET(new Request("https://example.test/api/admin/seo-evidence", { headers: auth }));
      const seoEvidenceBody = await seoEvidence.json();
      assert.equal(seoEvidence.status, 200);
      assert.ok(seoEvidenceBody.missingRequiredSources.includes("search_console"));
      assert.equal(seoEvidenceBody.sources.privacy_events.status, "imported");

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
