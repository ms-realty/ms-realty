import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";

function tempJsonl(prefix) {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-${prefix}-`)}/${prefix}.jsonl`;
  fs.writeFileSync(file, "");
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
      MS_REALTY_LISTING_EDIT_LEDGER_PATH: tempJsonl("app-admin-listing-edits"),
      MS_REALTY_REPLY_OUTBOX_PATH: tempJsonl("app-admin-replies"),
      MS_REALTY_SAVED_SEARCH_LEDGER_PATH: tempJsonl("app-admin-saved-searches"),
      MS_REALTY_SELLER_PIPELINE_PATH: tempJsonl("app-admin-seller-pipeline"),
      MS_REALTY_TRANSLATION_LEDGER_PATH: tempJsonl("app-admin-translations"),
      MS_REALTY_VIEWING_LEDGER_PATH: tempJsonl("app-admin-viewings"),
    },
    async () => {
      const publicLeadRoute = await import("../../app/api/leads/route.js");
      const replyRoute = await import("../../app/api/admin/replies/route.js");
      const listingEditRoute = await import("../../app/api/admin/listings/edit/route.js");
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
    },
  );
});
