import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { ADMIN_APP_JS } from "../lib/ui/client.mjs";
import { renderOperatorConnectPage } from "../lib/operator-connect.mjs";
import { renderAdminTeamPage } from "../lib/admin-team.mjs";
import { ADMIN_CSS_HASH, FONTS_URL } from "../lib/ui/design-assets.mjs";

// Contracts from the admin workbench quality sweep: the mobile navigation
// drawer, required-field markers, empty states for filtered queues, localized
// transaction-case forms with status lines, readable due dates, and the
// standalone connect and team pages on design-system tokens.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const adminAdapterCss = fs.readFileSync(path.join(ROOT, "production/lib/ui/adapter-admin.css"), "utf8");
const adminCrmCss = fs.readFileSync(path.join(ROOT, "production/lib/ui/adapter-admin-crm.css"), "utf8");
const adminSettingsCss = fs.readFileSync(path.join(ROOT, "production/lib/ui/adapter-admin-settings.css"), "utf8");
const generatedDesignCss = fs.readFileSync(path.join(ROOT, "public/vendor/ms-realty-admin.css"), "utf8");
const auth = { authorization: "Bearer local-admin-smoke" };

// The adapter source keeps spaces; the generated bundle is minified.
function touchBlock(css) {
  const start = css.search(/@media \(max-width:\s*1023px\)/);
  assert.ok(start >= 0, "touch layout block present");
  const end = css.slice(start).search(/@media \(max-width:\s*899px\)/);
  return css.slice(start, end > 0 ? start + end : undefined);
}

test("mobile navigation drawer: solid top bar, full-height panel, styled header and close control", () => {
  for (const css of [adminAdapterCss, generatedDesignCss]) {
    const touch = touchBlock(css);
    // The kit's backdrop-filter on .crm-top would make the sticky bar the
    // containing block of the fixed drawer and collapse it to its padding.
    assert.match(touch, /\.crm-top\s*\{[^}]*backdrop-filter:\s*none/);
    assert.match(touch, /\.adm-mobile-nav__panel\s*\{[^}]*position:\s*fixed/);
    assert.match(touch, /\.adm-mobile-nav__panel-head\s*\{[^}]*justify-content:\s*space-between/);
    assert.match(touch, /\.adm-mobile-nav__panel-title\s*\{[^}]*color:\s*#fff/);
    assert.match(touch, /\.adm-mobile-nav__close\s*\{[^}]*width:\s*44px;\s*height:\s*44px/);
    assert.match(touch, /\.adm-mobile-nav__close:focus-visible\s*\{[^}]*box-shadow:\s*var\(--shadow-focus\)/);
  }
});

test("admin skip link targets a programmatically focusable main landmark", async () => {
  const app = createHttpApp({ reviewedAt: "2026-07-19T12:00:00.000Z" });
  const page = await dispatchHttp(app, { url: "/admin/today?locale=en", headers: auth });
  assert.equal(page.status, 200);
  assert.match(page.body, /<a class="skip-link" href="#main">Skip to content<\/a>/);
  assert.match(page.body, /<main id="main" tabindex="-1" class="crm-scroll"/);
});

test("fallback owner profile does not invent a zero-workspace scope", async () => {
  const app = createHttpApp({ reviewedAt: "2026-07-19T12:00:00.000Z" });
  const page = await dispatchHttp(app, { url: "/admin/settings?locale=en", headers: auth });
  assert.equal(page.status, 200);
  assert.match(page.body, /Workspace scope was not provided by this runtime/);
  assert.doesNotMatch(page.body, /Access to 0 workspaces/);
  assert.doesNotMatch(page.body, /All workspaces/);
});

test("required fields carry a decorative accent marker and inline alerts default to the information tone", () => {
  assert.match(adminAdapterCss, /label:has\(> :required[^)]*\)[^{]*::after\s*\{[^}]*content:\s*"\*" \/ ""/);
  assert.match(adminAdapterCss, /:not\(\[readonly\]\)/);
  assert.match(adminAdapterCss, /\.adm-inline-alert\s*\{[^}]*background:\s*var\(--sea-50\)/);
  assert.match(adminAdapterCss, /\.adm-inline-alert\[role="alert"\]\s*\{[^}]*background:\s*var\(--brick-50\)/);
  assert.match(adminAdapterCss, /\.adm-family-checks\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill, minmax\(170px, 1fr\)\)/);
  assert.match(adminAdapterCss, /\.adm-reply > summary::after/);
  assert.match(adminAdapterCss, /\.adm-reply\[open\] > summary::after/);
});

test("critical next actions tint the active surface instead of forcing a light-only palette", () => {
  assert.match(adminSettingsCss, /data-next-action-priority="critical"[^}]*background:\s*color-mix\(in srgb, var\(--brick-600\) 12%, var\(--surface\)\)/);
  assert.match(adminSettingsCss, /data-next-action-priority="critical"[^}]*\.adm-next-actions__meta time\s*\{[^}]*color:\s*color-mix\(in srgb, var\(--brick-600\) 45%, var\(--text-strong\)\)/);
  assert.match(adminSettingsCss, /data-next-action-priority="critical"[^}]*\.adm-task-list__reference\s*\{[^}]*color:\s*color-mix\(in srgb, var\(--text-muted\) 55%, var\(--text-strong\)\)/);
});

test("warning surfaces tint the active theme instead of forcing a light-only palette", () => {
  assert.match(adminAdapterCss, /\.adm-availability-note\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--sun-300\) 12%, var\(--surface\)\)/);
  assert.match(adminAdapterCss, /\.adm-hermes-missing\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--sun-300\) 12%, var\(--surface\)\)/);
  assert.match(adminAdapterCss, /\.adm-hermes-empty--blocked\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--sun-300\) 12%, var\(--surface\)\)/);
  assert.match(adminAdapterCss, /@media \(max-width: 767px\)[\s\S]*?\.adm-hermes-checks ul\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test("Today, Hermes, and Settings use readable clamped rails instead of fractional sidebars", () => {
  assert.match(adminAdapterCss, /\.adm-workbench-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)\s+clamp\(320px, 32vw, 360px\)/);
  assert.match(adminAdapterCss, /\.adm-workbench-rail\s*\{[^}]*inline-size:\s*min\(100%, clamp\(320px, 32vw, 360px\)\)/);
  assert.match(adminAdapterCss, /main\[data-react-admin-ui="settings"\] \.adm-workbench-shell--settings\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)\s+clamp\(320px, 30vw, 352px\)/);
});

test("requests and Hermes use disclosure for secondary detail instead of primary clutter", () => {
  assert.match(adminAdapterCss, /\.adm-public-request__details > summary/);
  assert.match(adminAdapterCss, /\.adm-public-request__details-body\s*\{[^}]*background:\s*var\(--surface-sunken\)/);
  assert.match(adminAdapterCss, /\.adm-hermes-command__readiness\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap/);
  assert.match(adminAdapterCss, /\.adm-hermes-command__readiness > div\s*\{[^}]*border-radius:\s*var\(--radius-full\)/);
  assert.match(adminAdapterCss, /\.adm-hermes-command__starting-point\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto auto/);
  assert.match(adminAdapterCss, /\.adm-hermes-command__starting-kicker\s*\{[^}]*text-transform:\s*uppercase/);
  assert.match(adminAdapterCss, /@media \(max-width: 767px\)[\s\S]*?\.adm-hermes-command__readiness\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(adminCrmCss, /@media \(max-width: 719px\)[\s\S]*?\.adm-toolbar > \.crm-seg\[data-list-filter="requests"\]\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});

test("technical Hermes and assistant setup content is collapsed without JavaScript", () => {
  assert.match(adminAdapterCss, /\.adm-hermes-diagnostics\s*,\s*\.adm-hermes-safeguards\s*\{[^}]*overflow:\s*hidden/);
  assert.match(adminAdapterCss, /\.adm-hermes-diagnostics > summary/);
  assert.match(adminAdapterCss, /\.adm-hermes-safeguards\[open\] > summary::after/);
  assert.match(adminAdapterCss, /\.adm-assistant-connection__config-label::after/);
});

test("390px mobile contracts keep one dominant action per owner screen", () => {
  assert.match(adminSettingsCss, /\.adm-today-briefing__action \.mk-btn\s*\{[^}]*width:\s*100%;[^}]*justify-content:\s*center/);
  assert.match(adminSettingsCss, /@media \(max-width: 390px\)[\s\S]*?\.adm-today-briefing__action \.mk-btn,[\s\S]*?min-height:\s*44px/);
  assert.match(adminSettingsCss, /@media \(max-width: 390px\)[\s\S]*?\.adm-next-actions__action \.mk-btn[\s\S]*?width:\s*100%/);
  assert.match(adminAdapterCss, /@media \(max-width: 767px\)[\s\S]*?\.adm-hermes-command__starting-point \.mk-btn\s*\{[^}]*width:\s*100%;[^}]*justify-content:\s*center/);
});

test("mobile owner pages retain their title and use a dense media review grid", () => {
  assert.match(adminAdapterCss, /\.crm-top > div:first-child\s*\{[^}]*display:\s*grid/);
  assert.match(adminAdapterCss, /data-react-admin-ui="listing-editor"\]\s+\.adm-media-manager\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
});

test("panel header links do not override primary button contrast", () => {
  for (const css of [generatedDesignCss]) {
    assert.match(css, /\.crm-panel__hd a:not\(\.mk-btn\)/);
    assert.doesNotMatch(css, /\.crm-panel__hd a\{/);
  }
});

test("queue filters reveal an empty note when no row matches", () => {
  assert.match(ADMIN_APP_JS, /var empty = document\.querySelector\("\[data-lead-queue-empty\]"\);\s*if \(empty\) empty\.hidden = visible > 0 \|\| rows\.length === 0;/);
  assert.match(ADMIN_APP_JS, /var empty = document\.querySelector\("\[data-pipeline-empty\]"\);/);
  assert.match(ADMIN_APP_JS, /grid\.hidden = visible === 0;\s*if \(empty\) empty\.hidden = visible > 0;/);
});

test("lead inbox and pipeline render hidden empty notes next to their filtered lists", async () => {
  const app = createHttpApp({ reviewedAt: "2026-07-19T12:00:00.000Z" });
  const inbox = await dispatchHttp(app, { url: "/admin/leads?locale=en", headers: auth });
  assert.equal(inbox.status, 200);
  assert.match(inbox.body, /<p class="adm-empty" data-lead-queue-empty="true" role="status" hidden>No enquiries in this queue\.<\/p>/);
  assert.doesNotMatch(inbox.body, /data-empty-leads/);
  const pipeline = await dispatchHttp(app, { url: "/admin/pipeline?locale=bg", headers: auth });
  assert.equal(pipeline.status, 200);
  assert.match(pipeline.body, /<div class="crm-panel" data-pipeline-empty="true" hidden><p class="adm-empty" role="status">Няма възможности в този изглед\.<\/p><\/div>/);
});

test("viewing and seller queues show localized due dates instead of raw ISO timestamps", async () => {
  const app = createHttpApp({ reviewedAt: "2026-07-19T12:00:00.000Z" });
  const page = await dispatchHttp(app, { url: "/admin/viewings?locale=en", headers: auth });
  assert.equal(page.status, 200);
  const cell = page.body.match(/<td class="crm-tbl__muted" data-viewing-column="due_at"[^>]*>([\s\S]*?)<\/td>/);
  assert.ok(cell, "due_at cell present");
  assert.match(cell[1], /<time dateTime="\d{4}-\d{2}-\d{2}T[^"]+" title="[^"]+">\d{1,2} \w{3} \d{4}, \d{2}:\d{2}<\/time>/);
  assert.doesNotMatch(cell[1], />\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z</);
});

test("transaction case forms are localized and report their own status", async () => {
  const app = createHttpApp({ reviewedAt: "2026-07-19T12:00:00.000Z" });
  for (const [locale, caseId, saving] of [
    ["bg", "Идентификатор на сделката", "Записване на сделката…"],
    ["ru", "Идентификатор сделки", "Сохраняем сделку…"],
    ["en", "Case ID", "Saving transaction case…"],
  ]) {
    const page = await dispatchHttp(app, { url: `/admin/cases?locale=${locale}`, headers: auth });
    assert.equal(page.status, 200);
    const form = page.body.slice(page.body.indexOf('data-admin-mutation-form="realty-case-open"'), page.body.indexOf("</form>", page.body.indexOf('data-admin-mutation-form="realty-case-open"')));
    assert.ok(form.includes(`data-admin-mutation-saving="${saving}"`), `${locale} saving copy`);
    assert.ok(form.includes(`<label>${caseId}<input name="id" required`), `${locale} case id label`);
    assert.ok(form.includes('name="mandateSignedAt" type="datetime-local" required'), `${locale} datetime mandate field`);
    assert.ok(form.includes('<div class="adm-form__actions"><p role="status" aria-live="polite" data-admin-mutation-status="true"></p>'), `${locale} status line`);
    assert.doesNotMatch(form, /Refreshing case queue|buyer purchase|>residential</);
  }
});

test("connect page uses the persistent workbench shell and responsive connection rows", () => {
  const html = renderOperatorConnectPage({
    baseUrl: "https://ms-realty.example.workers.dev",
    token: "connect-operator-token-0123456789",
    operatorId: "connect_operator",
    connections: [{ provider: "google", status: "connected", account_label: "office@ms-realty.bg" }],
    locale: "ru",
  });
  assert.ok(html.includes(`<link rel="stylesheet" href="${FONTS_URL}">`));
  assert.ok(html.includes(`<link rel="stylesheet" href="/vendor/ms-realty-admin.css?v=${ADMIN_CSS_HASH}"`));
  assert.match(html, /<title>Подключения · MS Realty<\/title>/);
  assert.match(html, /<body>\s*<a class="skip-link" href="#main">/);
  assert.match(html, /data-react-admin-ui="connections"/);
  assert.match(html, /data-provider="google" data-status="connected"/);
  assert.match(html, /Проверено: дата не указана/);
  assert.match(adminAdapterCss, /\.adm-connection-row,/);
  assert.match(adminAdapterCss, /@media \(max-width: 700px\)/);
  const chrome = html.slice(html.indexOf("<body"), html.indexOf("<script defer"));
  assert.doesNotMatch(chrome, /[—–]/);
  assert.doesNotMatch(html, /#1d4ed8/);
});

test("team page controls outrank the adapter's generic main field rules", () => {
  const html = renderAdminTeamPage({ operators: [] });
  assert.match(html, /\.team-page \.team__form input,\s*\.team-page \.team__form select \{/);
  assert.match(html, /\.team-page \.team__form select \{[^}]*background-image: url/);
  // The page now speaks one workbench language at a time instead of stacking
  // "Bulgarian / English" into every string, so the empty state is Bulgarian
  // by default and Russian and English come from ?locale=.
  assert.match(html, /Още няма оператори\./);
  assert.match(renderAdminTeamPage({ operators: [], locale: "ru" }), /Операторов пока нет\./);
  assert.match(renderAdminTeamPage({ operators: [], locale: "en" }), /No operators yet\./);
});
