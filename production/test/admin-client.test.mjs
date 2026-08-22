import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { ADMIN_APP_JS } from "../lib/ui/client.mjs";

const adminAdapterCss = fs.readFileSync(new URL("../lib/ui/adapter-admin.css", import.meta.url), "utf8");
const generatedDesignCss = fs.readFileSync(new URL("../../public/vendor/ms-realty.css", import.meta.url), "utf8");
const adminReactSource = fs.readFileSync(new URL("../lib/react-admin-site.mjs", import.meta.url), "utf8");

test("admin progressive-enhancement bundle remains valid JavaScript", () => {
  assert.doesNotThrow(() => new vm.Script(ADMIN_APP_JS));
});

test("admin reply client submits broker-only drafts and reviewed replies as JSON", () => {
  assert.match(ADMIN_APP_JS, /function initReplyForms\(\)/);
  assert.match(ADMIN_APP_JS, /data-hermes-draft-request/);
  assert.match(ADMIN_APP_JS, /data-reply-approval-required/);
  assert.match(ADMIN_APP_JS, /function submitReplyJson\(form, payload\)/);
  assert.match(ADMIN_APP_JS, /"content-type": "application\/json"/);
  assert.match(ADMIN_APP_JS, /result\.broker_approval_required !== true/);
  assert.match(ADMIN_APP_JS, /result\.can_send_without_approval === true/);
  assert.match(ADMIN_APP_JS, /data-reply-draft-unavailable/);
  assert.match(ADMIN_APP_JS, /HERMES_CHAT_COMPLETIONS_URL\|HERMES_API_KEY/);
  assert.match(ADMIN_APP_JS, /result\.status !== "queued_for_manual_send"/);
  assert.match(ADMIN_APP_JS, /leadRow\.setAttribute\("data-lead-replied", "false"\)/);
  assert.match(ADMIN_APP_JS, /leadRow\.setAttribute\("data-reply-queue-status", "queued"\)/);
  assert.match(ADMIN_APP_JS, /function initReplyDeliveryForms\(\)/);
  assert.match(ADMIN_APP_JS, /data-reply-delivery-form/);
  assert.match(ADMIN_APP_JS, /result\.delivery\.status/);
  assert.match(ADMIN_APP_JS, /function initCommunicationTemplates\(\)/);
  assert.match(ADMIN_APP_JS, /data-communication-template-select/);
  assert.match(ADMIN_APP_JS, /form\.elements\.reviewedReply\.value = body/);
  assert.match(ADMIN_APP_JS, /function initLeadPipelineFilters\(\)/);
  assert.match(ADMIN_APP_JS, /data-pipeline-card/);
  assert.match(ADMIN_APP_JS, /function initAdminMutationForms\(\)/);
  assert.match(ADMIN_APP_JS, /data-admin-mutation-form/);
  assert.match(ADMIN_APP_JS, /function initRouteDecisionForms\(\)/);
  assert.match(ADMIN_APP_JS, /data-route-decision-select/);
  assert.match(ADMIN_APP_JS, /decision === "redirect_301" \|\| decision === "retain_200"/);
  assert.match(ADMIN_APP_JS, /equivalent\.required = requiresEquivalentTarget/);
  assert.match(ADMIN_APP_JS, /data-route-decision-target-preview/);
  assert.match(ADMIN_APP_JS, /target\.addEventListener\("input"/);
  assert.match(ADMIN_APP_JS, /function completeRouteDecision\(form, payload\)/);
  assert.match(ADMIN_APP_JS, /payload\.terminalDecisionPreview\.length/);
  assert.match(ADMIN_APP_JS, /data-route-decision-state", "saved"/);
  assert.match(ADMIN_APP_JS, /summary\.focus\(\{ preventScroll: true \}\)/);
  assert.match(ADMIN_APP_JS, /prefers-reduced-motion: reduce/);
  assert.match(ADMIN_APP_JS, /function commitEditorFormState\(form\)/);
  assert.match(ADMIN_APP_JS, /form\.hasAttribute\("data-editor-form"\)\) commitEditorFormState\(form\)/);
  assert.match(ADMIN_APP_JS, /form\.hasAttribute\("data-route-decision-form"\)\) completeRouteDecision\(form, payload\)/);
  assert.doesNotMatch(ADMIN_APP_JS, /window\.location\.reload\(/);
  assert.match(ADMIN_APP_JS, /function initListingEditorTabs\(\)/);
  assert.match(ADMIN_APP_JS, /adm-editor-rail/);
  assert.match(ADMIN_APP_JS, /function initEditorForms\(\)/);
  assert.match(ADMIN_APP_JS, /data-editor-dirty-message/);
  assert.match(ADMIN_APP_JS, /setAttribute\("aria-current", "location"\)/);
  assert.match(ADMIN_APP_JS, /window\.addEventListener\("scroll", scheduleSync/);
  assert.match(ADMIN_APP_JS, /data-admin-mobile-nav-close/);
  assert.match(ADMIN_APP_JS, /var target = returnFocusTarget && returnFocusTarget\.isConnected \? returnFocusTarget : summary/);
});

test("admin keeps the compact desktop navigation visible from 1024px upward", () => {
  for (const css of [adminAdapterCss, generatedDesignCss]) {
    const desktopNavigation = css.slice(css.lastIndexOf("@media (min-width"));
    assert.match(desktopNavigation, /min-width:\s*1024px/);
    assert.match(desktopNavigation, /grid-template-columns:\s*88px\s+minmax\(0,\s*1fr\)/);
    assert.match(desktopNavigation, /\.crm-sb__brand/);
    assert.doesNotMatch(desktopNavigation, /max-width:\s*1439px/);
  }
  assert.match(adminAdapterCss, /\[data-listing-filters\]/);
  assert.match(adminAdapterCss, /\.adm-listing-table\.crm-tbl/);
});

test("admin Today workbench contains wide tables inside the primary grid track", () => {
  for (const css of [adminAdapterCss, generatedDesignCss]) {
    assert.match(css, /\.adm-workbench-main,\s*\.adm-workbench-rail\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    assert.match(css, /@media \(max-width:\s*1023px\)\s*\{[\s\S]*?\.adm-workbench-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    assert.match(css, /@media \(max-width:\s*1023px\)\s*\{[\s\S]*?\.adm-workbench-rail\s*\{[^}]*position:\s*static/);
  }
  assert.match(adminReactSource, /sun:\s*\{\s*bg:\s*"var\(--sun-100\)",\s*fg:\s*"var\(--stone-600\)"\s*\}/);
});

test("admin listing table assigns every column a width that fits the 1280 canvas", () => {
  for (const css of [adminAdapterCss, generatedDesignCss]) {
    assert.match(css, /\.adm-listing-table\.crm-tbl\s*\{[^}]*table-layout:\s*fixed/);
    for (const index of [1, 2, 3, 4, 5, 6, 7, 8]) {
      assert.match(
        css,
        new RegExp(`\\.adm-listing-table th:nth-child\\(${index}\\),\\s*\\.adm-listing-table td:nth-child\\(${index}\\)\\s*\\{[^}]*width:`),
      );
    }
    assert.match(css, /\.adm-listing-table th,\s*\.adm-listing-table td\s*\{[^}]*overflow:\s*hidden/);
    assert.match(css, /\.adm-listing-actions,\s*\.adm-listing-table \.adm-task-list__actions\s*\{[^}]*flex-wrap:\s*nowrap/);
    assert.match(css, /\.adm-listing-actions \.mk-btn--ghost\s*\{[^}]*width:\s*38px/);
  }
});

test("admin listing filterbar keeps Filter and Clear visible with an inline results count", () => {
  for (const css of [adminAdapterCss, generatedDesignCss]) {
    assert.match(css, /\.adm-listing-workbench\s+\.adm-filterbar__summary\s*\{[^}]*grid-column:\s*auto/);
    assert.match(css, /\.adm-filterbar\s*>\s*input\[type="hidden"\]\s*\{[^}]*display:\s*none/);
    assert.doesNotMatch(css, /\.adm-filterbar--toolbar\s*\{[^}]*overflow:\s*hidden/);
  }
});

test("admin desktop leftovers keep host-tool density", () => {
  assert.match(adminAdapterCss, /\.adm-listing-bulk__status:empty[\s\S]{0,80}display:\s*none/);
  assert.match(adminAdapterCss, /\.adm-listing-bulk__bar[\s\S]{0,280}min-height:\s*40px/);
  assert.match(adminAdapterCss, /\.adm-listing-bulk__bar[\s\S]{0,280}max-height:\s*48px/);
  assert.match(
    adminAdapterCss,
    /@media \(min-width:\s*1024px\) \{[\s\S]*?\.adm-listing-workbench\s+\.adm-filterbar__label[\s\S]*?clip:\s*rect\(0 0 0 0\)/,
  );
  assert.match(
    adminAdapterCss,
    /@media \(min-width:\s*1024px\) \{[\s\S]*?\.adm-listing-workbench\s+\.adm-filterbar[\s\S]*?align-items:\s*center/,
  );
  assert.match(
    adminAdapterCss,
    /@media \(min-width:\s*1024px\) \{[\s\S]*?\.adm-listing-workbench\s+\.adm-filterbar[\s\S]*?min-height:\s*40px/,
  );
  assert.match(
    adminAdapterCss,
    /@media \(min-width:\s*1024px\) \{[\s\S]*?\.adm-lead-more\s*>\s*summary::after[\s\S]*?content:\s*none/,
  );
  assert.match(
    adminAdapterCss,
    /@media \(min-width:\s*1024px\) \{[\s\S]*?\.adm-lead-more__label[\s\S]*?clip:\s*rect\(0 0 0 0\)/,
  );
  assert.match(adminAdapterCss, /\.adm-editor-rail\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border\)/);
  assert.match(adminAdapterCss, /\.adm-editor-rail\s+\.crm-panel[\s\S]{0,180}border:\s*0/);
  assert.match(adminAdapterCss, /\.adm-editor-rail\s+\.crm-panel[\s\S]{0,180}background:\s*transparent/);
  assert.match(adminAdapterCss, /\.adm-editor-rail\s+\.adm-status-list\s*>\s*div[\s\S]{0,200}min-height:\s*40px/);
  assert.match(adminAdapterCss, /\.adm-lead-inbox\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border\)/);
  assert.match(adminAdapterCss, /\.adm-lead-inbox\s+\.adm-kpis[\s\S]{0,180}border:\s*0/);
});

test("admin pipeline matching titles stack above actions and wrap as words", () => {
  for (const css of [adminAdapterCss, generatedDesignCss]) {
    assert.match(css, /\.adm-pipeline-card \.adm-task-list\s*>\s*li\s*\{[^}]*flex-direction:\s*column/);
    assert.match(css, /\.adm-pipeline-card \[data-inventory-matching\] strong\s*\{[^}]*overflow-wrap:\s*break-word/);
    assert.doesNotMatch(css, /\.adm-pipeline-card \[data-inventory-matching\] strong\s*\{[^}]*overflow-wrap:\s*anywhere/);
  }
});

test("admin lead brief and new-enquiry disclosure stay compact on desktop", () => {
  assert.match(
    adminAdapterCss,
    /@media \(min-width:\s*1024px\) \{[\s\S]*?\.adm-lead-brief__summary[\s\S]*?min-height:\s*0[\s\S]*?\.adm-manual-lead > summary[\s\S]*?min-height:\s*36px/,
  );
});

test("admin desktop chrome meets the Airbnb-level operate contract", () => {
  assert.match(adminAdapterCss, /\.crm-app\s*\{[^}]*--text-muted:\s*var\(--stone-600\)/);
  assert.match(adminAdapterCss, /main\[data-react-admin-ui\] \.crm-tbl\s*,/);
  assert.match(adminAdapterCss, /main\[data-react-admin-ui\] \.mk-btn[\s\S]{0,220}font-family:\s*var\(--font-sans\)/);
  assert.match(adminAdapterCss, /main\[data-react-admin-ui\] \.crm-tbl th[\s\S]{0,180}text-transform:\s*none/);
  assert.match(adminAdapterCss, /\.adm-listing-workbench\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border\)/);
  assert.match(adminAdapterCss, /\.adm-listing-workbench\s+\.adm-kpis[\s\S]{0,220}border:\s*0/);
  assert.match(adminAdapterCss, /\.adm-listing-workbench\s+\.adm-filterbar[\s\S]{0,220}border:\s*0/);
  assert.match(adminAdapterCss, /\.adm-kpis\s+\.crm-stat__ic[\s\S]{0,160}background:\s*transparent/);
  assert.match(adminAdapterCss, /\.adm-editor-rail\s+\.adm-status-list[\s\S]{0,180}grid-template-columns:\s*1fr/);
  assert.match(adminAdapterCss, /\.adm-status-list dt[\s\S]{0,180}text-transform:\s*none/);
  assert.match(adminAdapterCss, /\.adm-pipeline-facts dt[\s\S]{0,180}text-transform:\s*none/);
  assert.match(adminAdapterCss, /\.adm-pipeline-facts\s*\{[^}]*background:\s*transparent/);
  assert.match(adminAdapterCss, /\.adm-pipeline-facts\s*\{[^}]*border:\s*0/);
  assert.match(adminAdapterCss, /\.adm-pipeline-facts dd[\s\S]{0,160}overflow-wrap:\s*break-word/);
  assert.doesNotMatch(adminAdapterCss, /\.adm-pipeline-facts dd[\s\S]{0,80}overflow-wrap:\s*anywhere/);
  assert.match(adminAdapterCss, /\.adm-id-caption[\s\S]{0,220}background:\s*transparent/);
  assert.match(adminAdapterCss, /\.adm-pipeline-card \[data-inventory-matching\][\s\S]{0,240}border:\s*0/);
  assert.match(adminAdapterCss, /\.adm-kpis--inline\s*\{[^}]*gap:\s*0/);
  assert.match(adminAdapterCss, /\.adm-pipeline-card \[data-inventory-matching\] strong\s*\{[^}]*word-break:\s*normal/);
  assert.match(adminAdapterCss, /\.adm-listing-table td\[data-listing-column="select"\]\s*\{[^}]*padding-top:/);
  assert.match(adminAdapterCss, /@media \(min-width:\s*1024px\) \{[\s\S]*?\.adm-reply-cell[\s\S]*?flex-direction:\s*row/);
  assert.match(adminAdapterCss, /@media \(min-width:\s*1024px\) \{[\s\S]*?\.adm-reply-cell[\s\S]*?flex-wrap:\s*nowrap/);
  assert.match(adminAdapterCss, /\.adm-reply-status:empty[\s\S]{0,80}display:\s*none/);
});
