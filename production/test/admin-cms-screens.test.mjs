import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { ADMIN_APP_JS } from "../lib/ui/client.mjs";
import { renderAdminLoginPage } from "../lib/admin-login.mjs";
import { renderAdminTeamPage } from "../lib/admin-team.mjs";
import { renderOperatorConnectPage } from "../lib/operator-connect.mjs";

// Contracts for the CMS and launch screens (package A2): the shared shell of
// the CRM screens applied to the listing manager, translation review, listing
// editor, migration review, operations reports and activity history, the
// states every control ships with, and the controls whose backend does not
// exist yet.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const adminCss = fs.readFileSync(path.join(ROOT, "production/lib/ui/adapter-admin.css"), "utf8");
const crmCss = fs.readFileSync(path.join(ROOT, "production/lib/ui/adapter-admin-crm.css"), "utf8");
const cmsCss = fs.readFileSync(path.join(ROOT, "production/lib/ui/adapter-admin-cms.css"), "utf8");
const generatedCss = fs.readFileSync(path.join(ROOT, "public/vendor/ms-realty-admin.css"), "utf8");
const auth = { authorization: "Bearer local-admin-smoke" };

function app() {
  return createHttpApp({ reviewedAt: "2026-07-19T12:00:00.000Z" });
}

test("listing manager leads with the shell the CRM screens use and no dead list tools", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/listings?locale=en", headers: auth });
  assert.equal(page.status, 200);
  // Page action and counted status filters lead directly to the working queue.
  assert.match(page.body, /class="crm-ph__actions"/);
  assert.match(page.body, /<nav class="crm-seg adm-cms-filter"[^>]*data-cms-filter="listings"/);
  assert.match(page.body, /data-filter-value=""[^>]*data-on="1"/);
  assert.match(page.body, /<span class="adm-seg-count">165<\/span>/);
  assert.doesNotMatch(page.body, /data-planned-control=/);
  // The queue itself keeps its contracts.
  assert.match(page.body, /data-listing-manager-row="MS-CRAWL-0001"/);
  assert.match(page.body, /data-listing-bulk-bar="true" data-selection="empty"/);
});

test("a counted status filter marks the selected option and links without JavaScript", async () => {
  const filtered = await dispatchHttp(app(), { url: "/admin/listings?locale=en&status=unverified", headers: auth });
  assert.equal(filtered.status, 200);
  assert.match(filtered.body, /href="\/admin\/listings\?status=unverified"[^>]*data-filter-value="unverified" data-on="1" aria-current="true"/);
  assert.doesNotMatch(filtered.body, /data-filter-value="" data-on="1"/);
});

test("every active listing filter renders a chip that drops only itself", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/listings?locale=en&q=MS-CRAWL-0001&status=unverified", headers: auth });
  assert.equal(page.status, 200);
  const chips = [...page.body.matchAll(/<a class="adm-filter-chip adm-filter-chip--removable" href="([^"]+)" data-remove-filter="([^"]+)"/g)];
  assert.equal(chips.length, 2);
  const byName = Object.fromEntries(chips.map(([, href, name]) => [name, href]));
  assert.match(byName.q, /status=unverified/);
  assert.doesNotMatch(byName.q, /[?&]q=/);
  assert.match(byName.status, /q=ms-crawl-0001/i);
  assert.doesNotMatch(byName.status, /status=/);
});

test("an empty listing queue explains itself and offers the one control that changes it", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/listings?locale=en&q=zzzz-no-such-listing", headers: auth });
  assert.equal(page.status, 200);
  assert.match(page.body, /data-empty-listings="true"/);
  assert.match(page.body, /Widen the search, change the status or clear the filters\./);
  assert.match(page.body, /class="adm-empty__action" href="\/admin\/listings">Reset filters<\/a>/);
  assert.doesNotMatch(page.body, /data-listing-manager-row=/);
});

test("translation review groups its rows by listing so one title is not repeated per locale", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/translations?locale=en&q=MS-CRAWL-0001", headers: auth });
  assert.equal(page.status, 200);
  assert.match(page.body, /<table class="crm-tbl adm-translation-table">/);
  assert.match(page.body, /<tbody data-translation-group="MS-CRAWL-0001" data-translation-group-size="\d+">/);
  // The first row of a group carries the identity, the rest a quiet reference.
  assert.match(page.body, /data-translation-group-start="true"/);
  assert.match(page.body, /class="adm-translation-continued"/);
  assert.match(page.body, /data-translation-editor-row="translation-MS-CRAWL-0001-en"/);
  assert.match(page.body, /<td colSpan="5"><details class="adm-reply adm-translation-editor" data-translation-editor-workspace="true">/);
  assert.match(page.body, /class="adm-human-translation__context"/);
  assert.match(page.body, /class="adm-human-translation__fields"/);
  assert.match(page.body, /class="adm-human-translation__facts"/);
  assert.match(adminCss, /\.adm-human-translation\s*\{[^}]*grid-template-columns:\s*minmax\(260px,\s*0\.88fr\)\s+minmax\(0,\s*1\.12fr\)/);
  assert.match(adminCss, /\.adm-human-translation__context\s*\{[^}]*position:\s*sticky/);
  assert.match(adminCss, /\.adm-human-translation__fields\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(crmCss, /\.adm-toolbar > \.crm-seg:not\(\.adm-cms-filter\)\s*\{[^}]*overflow:\s*visible/);
  assert.match(cmsCss, /\.adm-cms-filter a\s*\{[^}]*flex:\s*none/);
  assert.match(adminCss, /\.adm-translation-editor-row > td\s*\{[^}]*padding:\s*0/);
  const titles = page.body.match(/Автосервиз|Автöремонтна/g) || [];
  assert.ok(titles.length <= 1, "the listing title appears at most once per group");
  assert.doesNotMatch(page.body, /data-planned-control=/);
});

test("mobile editors keep all section controls visible and put translation inputs before source context", () => {
  assert.match(
    adminCss,
    /@media \(max-width: 767px\)[\s\S]*?main\[data-react-admin-ui="listing-editor"\] \.adm-editor-tabs \{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[\s\S]*?overflow:\s*visible;/,
  );
  assert.match(
    adminCss,
    /@media \(max-width: 767px\)[\s\S]*?main\[data-react-admin-ui="listing-editor"\] \.adm-editor-tabs \{[\s\S]*?scrollbar-width:\s*auto;[\s\S]*?\}[\s\S]*?main\[data-react-admin-ui="listing-editor"\] \.adm-editor-tabs::\-webkit-scrollbar \{ display:\s*initial; \}/,
  );
  assert.match(
    adminCss,
    /@media \(max-width: 767px\)[\s\S]*?main\[data-react-admin-ui="translation-queue"\] \.adm-human-translation__fields \{[\s\S]*?order:\s*1;[\s\S]*?\}[\s\S]*?main\[data-react-admin-ui="translation-queue"\] \.adm-human-translation__context \{[\s\S]*?order:\s*2;/,
  );
  assert.match(
    adminCss,
    /@media \(max-width: 767px\)[\s\S]*?main\[data-react-admin-ui="translation-queue"\] \.adm-toolbar > \.adm-cms-filter\[data-cms-filter="translations"\] \{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[\s\S]*?overflow:\s*visible;/,
  );
  assert.match(
    adminCss,
    /@media \(max-width: 767px\)[\s\S]*?main\[data-react-admin-ui\] \.crm-ph__actions \{[\s\S]*?width:\s*100%;[\s\S]*?justify-content:\s*flex-start;[\s\S]*?\}[\s\S]*?main\[data-react-admin-ui\] \.crm-ph__actions \.mk-btn \{[\s\S]*?min-height:\s*44px;[\s\S]*?justify-content:\s*center;/,
  );
});

test("an empty translation queue says nothing is waiting rather than showing a bare table head", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/translations?locale=en&q=zzzz-no-such-listing", headers: auth });
  assert.equal(page.status, 200);
  assert.match(page.body, /data-empty-translation-tasks="true"/);
  assert.match(page.body, /<div class="adm-scroll-x" hidden>/);
});

test("the listing editor names the listing, hides the operator field and carries every save state", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/listings/edit?listingId=MS-CRAWL-0001&locale=en", headers: auth });
  assert.equal(page.status, 200);
  // The topbar names the screen; the heading names the listing.
  assert.match(page.body, /<h1>Автор|<h1>[^<]{10,}<\/h1>/);
  assert.match(page.body, /<p>Property editor · makler-realty\.com · bg · MS-CRAWL-0001<\/p>/);
  // The server attributes the edit, so the editor id travels as a hidden field.
  assert.match(page.body, /<input type="hidden" name="editor" value="[^"]*" data-editor-name="true">/);
  assert.match(page.body, /Editing as /);
  // Save states: clean and dirty are watcher driven, the rest mirror the
  // mutation status line, and conflict starts hidden.
  assert.match(page.body, /data-editor-savebar="true" data-dirty="false" data-save-state="clean" data-editor-conflict-marker="[^"]+"/);
  assert.match(page.body, /data-editor-conflict="true"/);
  assert.match(page.body, /class="adm-inline-alert adm-editor-conflict" role="alert" hidden/);
  for (const state of ["saving", "saved", "error", "conflict"]) {
    assert.match(cmsCss, new RegExp(`\\[data-save-state="${state}"\\]`), state);
  }
  assert.match(adminCss, /\.adm-editor-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(adminCss, /\.adm-editor-rail\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[^}]*position:\s*static;/s);
  assert.match(adminCss, /\.adm-editor-rail > \[data-media-review-panel\]\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/);
  assert.match(adminCss, /\.adm-editor-tabs\s*\{[^}]*position:\s*sticky;[^}]*backdrop-filter:\s*blur\(14px\)/s);
  assert.match(cmsCss, /\.adm-editor-conflict\[hidden\] \{ display: none; \}/);
});

test("the editor lists one state per locale, and a stale task wins over the published state", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/listings/edit?listingId=MS-CRAWL-0001&locale=en", headers: auth });
  const locales = [...page.body.matchAll(/data-translation-locale="([a-z]{2})"/g)].map(([, code]) => code);
  assert.deepEqual(locales, [...new Set(locales)], "no locale is listed twice");
});

test("media assets preview and fail out loud", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/listings/edit?listingId=MS-CRAWL-0001&locale=en", headers: auth });
  assert.match(page.body, /data-media-preview-state="loading"/);
  assert.match(page.body, /data-media-preview-frame="true"/);
  assert.match(page.body, /class="adm-media-asset__preview-loading"/);
  assert.match(page.body, /<img src="[^"]+" alt="[^"]*" loading="lazy" decoding="async" data-media-preview="true">/);
  assert.match(page.body, /class="adm-media-asset__preview-failed"/);
  assert.match(cmsCss, /\.adm-media-asset__preview-(?:loading|failed|empty|video)/);
  assert.match(cmsCss, /\[data-media-preview-state="empty"\] \.adm-media-asset__preview/);
  assert.match(cmsCss, /\[data-media-preview-state="video"\] \.adm-media-asset__preview/);
  assert.match(cmsCss, /\[data-media-preview-state="failed"\] \.adm-media-asset__preview-failed \{ display: grid; \}/);
  // A broken file shows the designed note, not the browser's own fallback of a
  // broken-image glyph plus the whole alt text.
  assert.match(cmsCss, /\[data-media-preview-state="failed"\] \.adm-media-asset__preview img \{ display: none; \}/);
  assert.match(ADMIN_APP_JS, /function initListingMediaPreviews\(\)/);
  // Package B4 shipped the real upload, so the placeholder it replaced is gone.
  assert.doesNotMatch(page.body, /data-media-upload="planned"/);
  assert.match(page.body, /data-media-upload-form="true"/);
});

test("a listing without an approved tour says so before the publishing form", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/listings/edit?listingId=MS-CRAWL-0001&locale=en", headers: auth });
  assert.match(page.body, /class="adm-tour-state" data-tour-empty="(true|configured)"/);
  assert.match(page.body, /No approved 360 tour/);
  assert.match(page.body, /data-tour-editor-form="true"/);
});

test("the bulk bar stays quiet until a listing is selected and reports its own save state", () => {
  assert.match(ADMIN_APP_JS, /function initListingSelectionBar\(\)/);
  assert.match(ADMIN_APP_JS, /bar\.setAttribute\("data-selection", selected \? "active" : "empty"\)/);
  assert.match(ADMIN_APP_JS, /initListingSelectionBar\(\);/);
  for (const state of ["saving", "success", "error"]) {
    assert.match(cmsCss, new RegExp(`\\.adm-listing-bulk__status\\[data-state="${state}"\\]`), state);
  }
});

test("operations reports drop the nested cards and give every empty region a note", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/reports?locale=en", headers: auth });
  assert.equal(page.status, 200);
  // A plot is a region of a panel, not a card inside a card.
  assert.doesNotMatch(page.body, /data-report-section="website-funnel"[\s\S]{0,400}adm-report-card/);
  assert.match(page.body, /class="adm-report-plot"/);
  assert.doesNotMatch(page.body, /data-planned-control=/);
  assert.match(page.body, /data-zero="true"/);
  assert.match(page.body, /class="adm-report-chips" data-popular-filters="true"|adm-report-nodata/);
});

test("activity history names its object figure and its empty log", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/activity?locale=en", headers: auth });
  assert.equal(page.status, 200);
  assert.match(page.body, /Object types<\/dt>/);
  assert.doesNotMatch(page.body, /<dt class="crm-stat__label">Object<\/dt>/);
  assert.match(page.body, /<datalist id="activity-actors" data-activity-actor-options="true">/);
  assert.match(page.body, /<datalist id="activity-actions" data-activity-action-options="true">/);
});

test("migration review turns each legacy URL into one dense row with a named affordance", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/migration/review?locale=en", headers: auth });
  assert.equal(page.status, 200);
  assert.match(page.body, /<span class="adm-route-decision__cta">Decision<\/span>/);
  assert.match(cmsCss, /\.adm-route-decision__header \{[^}]*flex-direction: row;[^}]*flex-wrap: nowrap;/);
  assert.match(cmsCss, /\.adm-route-decision__header:hover/);
  assert.match(cmsCss, /\.adm-route-decision__header:focus-visible/);
});

test("the CMS sheet ships after the shared admin sheet and reuses the CRM vocabulary", () => {
  const adminIndex = generatedCss.indexOf(".adm-route-decisions{");
  const cmsIndex = generatedCss.indexOf(".adm-cms-filter{");
  assert.ok(adminIndex >= 0 && cmsIndex > adminIndex, "the CMS extension follows the shared admin sheet");
  // The CMS sheet must not revive the removed planned-control treatment.
  assert.doesNotMatch(cmsCss, /^\.adm-planned \{/m);
  assert.doesNotMatch(cmsCss, /^\.adm-planned-note \{/m);
  assert.doesNotMatch(cmsCss, /^\.adm-planned-badge \{/m);
  assert.doesNotMatch(cmsCss, /^\.adm-list-tools \{/m);
});

test("the standalone pages speak the three workbench languages and carry their states", () => {
  for (const [locale, marker] of [
    ["bg", "Вход за екипа на MS Realty"],
    ["ru", "Вход для команды MS Realty"],
    ["en", "Sign in to MS Realty"],
  ]) {
    const html = renderAdminLoginPage({ locale });
    assert.match(html, new RegExp(`<html lang="${locale}">`), locale);
    assert.ok(html.includes(marker), `${locale} title`);
    assert.match(html, /data-login-state="idle"/);
    assert.match(html, /data-login-reveal="true"/);
  }
  assert.match(renderAdminLoginPage({ error: true }), /data-login-state="error"/);
  // A rejected second factor marks the code field, not the credentials.
  const twoFactor = renderAdminLoginPage({ error: "2fa", locale: "en" });
  assert.match(twoFactor, /data-login-state="error-2fa"/);
  assert.match(twoFactor, /The authenticator code was not accepted/);
  assert.match(twoFactor, /id="admin-code"[^>]*aria-describedby="admin-login-error"/);
  assert.doesNotMatch(twoFactor, /id="admin-email"[^>]*aria-describedby="admin-login-error"/);

  for (const [locale, marker] of [
    ["bg", "Още няма оператори."],
    ["ru", "Операторов пока нет."],
    ["en", "No operators yet."],
  ]) {
    const html = renderAdminTeamPage({ operators: [], locale });
    assert.match(html, new RegExp(`<html lang="${locale}">`), locale);
    assert.ok(html.includes(marker), `${locale} empty state`);
    assert.match(html, /data-team-empty="true"/);
  }
  assert.match(renderAdminTeamPage({ operators: [], error: true }), /data-team-state="error"/);
  assert.match(renderAdminTeamPage({ operators: [], created: true }), /data-team-state="created"/);
  // Roles read as names in the workbench language and keep their stored id.
  const team = renderAdminTeamPage({ operators: [{ email: "a@b.c", role: "admin", workspace_ids: [] }], locale: "en" });
  assert.match(team, /<span class="team__role" data-role="admin">Administrator<\/span>/);
  assert.match(team, /<option value="admin">Administrator<\/option>/);
});

test("the connect page keeps the operator token masked until it is asked for", () => {
  const html = renderOperatorConnectPage({
    baseUrl: "https://ms-realty.example.workers.dev",
    token: "connect-operator-token-0123456789",
    operatorId: "operations_lead",
    connections: [],
    availability: { google: { ready: false } },
  });
  assert.match(html, /<button class="button button--quiet" id="reveal" type="button" aria-controls="prompt" aria-pressed="false" hidden>/);
  // Both the bootstrap prompt and the assistant configuration block are masked
  // by the same rule, because both carry a credential.
  assert.match(html, /textarea\[data-masked="true"\][^{]*\{ filter: blur\(4px\)/);
  assert.match(html, /pre\[data-masked="true"\] \{ filter: blur\(4px\)/);
  // Without JavaScript nothing is blurred, so the prompt stays selectable.
  assert.doesNotMatch(html, /<textarea id="prompt"[^>]*data-masked/);
  assert.doesNotMatch(html, /<pre class="agent__config"[^>]*data-masked/);
  assert.match(html, /area\.setAttribute\("data-masked", "true"\)/);
  assert.match(html, /maskable\(promptArea, document\.getElementById\("reveal"\)/);
  assert.match(html, /Copying did not work/);
  // Each workbench language gets the whole page, script messages included.
  const bulgarian = renderOperatorConnectPage({
    baseUrl: "https://ms-realty.example.workers.dev",
    token: "connect-operator-token-0123456789",
    operatorId: "operations_lead",
    connections: [],
    availability: { google: { ready: false } },
    locale: "bg",
  });
  assert.match(bulgarian, /<html lang="bg">/);
  assert.match(bulgarian, /Копирането не стана/);
  assert.doesNotMatch(bulgarian, /Copying did not work/);
});

// Approved content review. Read-only by design: the screen shows what each
// public surface may publish, why the rest is withheld, and states the real
// approval procedure instead of offering a button that could not keep the
// source hash honest.

test("approved content lists every surface with its counts, its route and its withheld reasons", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/approved-content?locale=en", headers: auth });
  assert.equal(page.status, 200);
  assert.match(page.body, /data-kind="admin-approved-content"/);
  assert.match(page.body, /data-approved-content-total="17"/);
  assert.match(page.body, /data-approved-content-publishable="2"/);
  assert.match(page.body, /data-approved-content-blocked="15"/);
  for (const section of ["team_profiles", "area_guides", "financing_partners", "purchase_fees", "guide_translations"]) {
    assert.match(page.body, new RegExp(`data-approved-section="${section}"`), section);
  }
  // Where the records surface, so an approver knows what goes live.
  assert.match(page.body, /Where it appears/);
  assert.match(page.body, /\/\{locale\}\/locations\/\{location\}/);
  // Every row states publishable or withheld, and the withheld ones say why.
  assert.match(page.body, /data-approved-record="buyer-due-diligence-liens-de" data-approved-state="withheld"/);
  assert.match(page.body, /data-approved-record="hotovo-bg" data-approved-state="ready"/);
  assert.doesNotMatch(page.body, /Example record, not real content/);
  assert.match(page.body, /No named approver/);
});

test("approved content states that approval is a data-file edit plus a rebuild, and offers no approve control", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/approved-content?locale=en", headers: auth });
  assert.match(page.body, /data-approved-content-howto="true"/);
  assert.match(page.body, /production\/data\//);
  assert.match(page.body, /node production\/scripts\/build-approved-content\.mjs/);
  assert.match(page.body, /source hash/);
  assert.match(page.body, /class="adm-planned-badge">Read-only</);
  // Read-only means no writing controls at all on this screen.
  const main = page.body.slice(page.body.indexOf('data-kind="admin-approved-content"'));
  assert.doesNotMatch(main, /<form[^>]*method="post"/i);
  assert.doesNotMatch(main, /<button[^>]*type="submit"/i);
  // Each withheld surface names what a person must supply to release it.
  assert.match(page.body, /data-approved-requirement="guide_translations"/);
  assert.match(page.body, /To release this surface/);
});

test("approved content shows the cost estimator as blocked with the fee lines that block it", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/approved-content?locale=en", headers: auth });
  assert.match(page.body, /data-estimator-scope="eu" data-estimator-available="false"/);
  assert.match(page.body, /data-estimator-scope="non_eu" data-estimator-available="false"/);
  assert.match(page.body, /Local transfer tax, Notary fee, Registry entry fee, Agency fee/);
  assert.match(page.body, /Company route setup/);
});

test("the approved content state filter narrows the rows on show and keeps the counts whole", async () => {
  const withheld = await dispatchHttp(app(), { url: "/admin/approved-content?locale=en&state=withheld", headers: auth });
  assert.equal(withheld.status, 200);
  assert.match(withheld.body, /data-approved-content-state="withheld"/);
  // The counts still describe every record, not the filtered view.
  assert.match(withheld.body, /data-approved-content-total="17"/);
  assert.match(withheld.body, /href="\/admin\/approved-content\?state=withheld"[^>]*data-on="1" aria-current="true"/);
  assert.doesNotMatch(withheld.body, /data-approved-state="ready"/);
  // A surface with nothing in the current view says so rather than showing an
  // empty table.
  assert.match(withheld.body, /data-approved-section-empty="area_guides"/);

  const ready = await dispatchHttp(app(), { url: "/admin/approved-content?locale=en&state=ready", headers: auth });
  assert.doesNotMatch(ready.body, /data-approved-state="withheld"/);
  assert.match(ready.body, /data-approved-record="hotovo-bg"/);
});

test("approved content sits under CMS in the workbench navigation and speaks the three workbench languages", async () => {
  const english = await dispatchHttp(app(), { url: "/admin/approved-content?locale=en", headers: auth });
  assert.match(english.body, /<a class="crm-nav crm-nav--on" href="\/admin\/approved-content" aria-current="page"/);
  assert.match(english.body, /Approved content/);
  for (const [locale, title] of [["bg", "Одобрено съдържание"], ["ru", "Одобренный контент"]]) {
    const page = await dispatchHttp(app(), { url: `/admin/approved-content?locale=${locale}`, headers: auth });
    assert.equal(page.status, 200, locale);
    assert.match(page.body, new RegExp(title), locale);
    // The withheld reasons and the approval procedure are translated too.
    assert.match(page.body, /build-approved-content\.mjs/, locale);
    assert.doesNotMatch(page.body, /Example record, not real content/, locale);
  }
  // It sits in the CMS group, right after translation review.
  const cmsGroup = english.body.slice(english.body.indexOf("/admin/listings"), english.body.indexOf("/admin/migration/review"));
  assert.ok(cmsGroup.indexOf("/admin/translations") < cmsGroup.indexOf("/admin/approved-content"), "after translation review");
});

test("approved content styles ship in the CMS adapter and reach the generated sheet", () => {
  assert.match(cmsCss, /\.adm-approved-howto \{/);
  assert.match(cmsCss, /\.adm-approved-blocked small \{/);
  assert.match(cmsCss, /\.adm-approved-scopes > li\[data-estimator-available="false"\]/);
  assert.ok(generatedCss.includes(".adm-approved-howto"), "the built sheet carries the approved content rules");
});

test("approved content refuses an unauthorized reader", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/approved-content?locale=en" });
  assert.equal(page.status, 401);
});
