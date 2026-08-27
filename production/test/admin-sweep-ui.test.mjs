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

test("connect page loads the workbench fonts and design-system bundle without em-dashes in its chrome", () => {
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
  assert.match(html, /<body class="connect-page">/);
  assert.match(html, /\.button \{[^}]*min-height: 44px;[^}]*background: var\(--brand, #222222\)/);
  assert.match(html, /class="status status--ok"/);
  assert.match(html, /Проверено: дата не указана/);
  const chrome = html.slice(html.indexOf("<body"), html.indexOf('<textarea id="prompt"'));
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
