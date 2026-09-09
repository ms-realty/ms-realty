import test from "node:test";
import assert from "node:assert/strict";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

const auth = { authorization: "Bearer local-admin-smoke" };
const app = () => createHttpApp({ adminToken: "local-admin-smoke", reviewedAt: "2026-07-06T09:00:00.000Z" });

// PRODUCT.md: trust is visible when the label names the person, the property
// or the permission, never the key the ledger minted. These three screens are
// the people surfaces; each heading and strong text must read as words.
const RAW_PREFIX = /^(contact-|viewing-|language-request-|saved-search-|lead-draft-|property-)/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i;

function visibleLabels(html) {
  return [...html.matchAll(/<(strong|h1|h2|h3)(?:\s[^>]*)?>([^<]*)<\/\1>/g)].map((match) => match[2].trim()).filter(Boolean);
}

for (const locale of ["en", "bg", "ru"]) {
  test(`contacts are named as people, with the id only as a History caption (${locale})`, async () => {
    const page = await dispatchHttp(app(), { url: `/admin/contacts?locale=${locale}`, headers: auth });
    assert.equal(page.status, 200);
    const labels = visibleLabels(page.body);
    assert.ok(labels.length > 3, "the local fixtures render contact rows");
    for (const text of labels) {
      assert.doesNotMatch(text, RAW_PREFIX, text);
      assert.doesNotMatch(text, UUID, text);
    }
    // The stat list and the bottom KPI strip are gone; the actions and the
    // caption are there.
    assert.doesNotMatch(page.body, /data-summary-kind="contacts"/);
    assert.doesNotMatch(page.body, /class="adm-summary-strip"/);
    assert.match(page.body, /data-contact-fact="latest_message"/);
    assert.match(page.body, /data-contact-fact="properties"/);
    assert.match(page.body, /data-contact-fact="next_follow_up"/);
    assert.match(page.body, /data-contact-history="true"[\s\S]*?<code class="crm-mono adm-id-caption">contact-/);
    assert.doesNotMatch(page.body, /<h3>contact-/);
  });

  test(`viewings are listed by day as appointments, not as ledger ids (${locale})`, async () => {
    const page = await dispatchHttp(app(), { url: `/admin/viewings?locale=${locale}`, headers: auth });
    assert.equal(page.status, 200);
    const labels = visibleLabels(page.body);
    assert.ok(labels.length > 1, "the local fixtures render a viewing");
    for (const text of labels) {
      assert.doesNotMatch(text, RAW_PREFIX, text);
      assert.doesNotMatch(text, UUID, text);
    }
    assert.doesNotMatch(page.body, /class="adm-summary-strip"/);
    assert.match(page.body, /data-daily-group="\d{4}-\d{2}-\d{2}"/);
    assert.match(page.body, /data-viewing-schedule-row="viewing-/);
    assert.match(page.body, /class="mk-btn mk-btn--primary mk-btn--sm"><svg[^>]*>[\s\S]*?<\/svg><span>[^<]+<\/span><\/summary>/);
    assert.doesNotMatch(page.body, />viewing-http-[^<]*</);
    // The delivery caveat survives only as the calendar button's tooltip.
    assert.match(page.body, /href="\/api\/admin\/viewings\.ics" download title="/);
    assert.doesNotMatch(page.body, /<p class="adm-daily-note">[^<]*calendar/i);
  });

  test(`consent rows name the permission by kind, language and date (${locale})`, async () => {
    const page = await dispatchHttp(app(), { url: `/admin/consents?locale=${locale}`, headers: auth });
    assert.equal(page.status, 200);
    const labels = visibleLabels(page.body);
    assert.ok(labels.length > 3, "the local fixtures render consent rows");
    for (const text of labels) {
      assert.doesNotMatch(text, RAW_PREFIX, text);
      assert.doesNotMatch(text, UUID, text);
    }
    assert.doesNotMatch(page.body, /class="adm-kpis"/);
    assert.match(page.body, /data-consent-subject="language-request-/);
    assert.match(page.body, /data-consent-column="subject"[^>]*><strong>[^<]+ · FR · [^<]+<\/strong>/);
    assert.match(page.body, /data-consent-withdrawal-control="/);
  });
}
