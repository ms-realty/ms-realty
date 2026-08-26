import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { ADMIN_APP_JS } from "../lib/ui/client.mjs";
import { renderAdminConsentPayload, renderAdminDocumentChecklistPayload } from "../lib/admin-payloads.mjs";
import { renderReactAdminBody } from "../lib/react-admin-site.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";

// Contracts for the reworked CRM screens: the two-pane lead inbox, the stage
// board, the shared toolbar/filter pattern, every interaction state, and the
// planned controls that carry a disabled affordance instead of a hole.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const crmCss = fs.readFileSync(path.join(ROOT, "production/lib/ui/adapter-admin-crm.css"), "utf8");
const bundleCss = fs.readFileSync(path.join(ROOT, "public/vendor/ms-realty-admin.css"), "utf8");
const auth = { authorization: "Bearer local-admin-smoke" };
const registry = loadLocaleRegistry();

// The suite reads the checked-in demo ledgers through private copies so the
// SQLite mirrors under production/data are never shared with the other test
// processes the runner spawns in parallel.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-admin-crm-"));
function ledgerCopy(name) {
  const target = path.join(dataDir, name);
  fs.copyFileSync(path.join(ROOT, "production/data", name), target);
  return target;
}
const leadLedgerPath = ledgerCopy("lead-ledger.jsonl");
const eventLedgerPath = ledgerCopy("events.jsonl");

function app() {
  return createHttpApp({ reviewedAt: "2026-07-19T12:00:00.000Z", leadLedgerPath, eventLedgerPath });
}

test("lead inbox is a two-pane inbox: a list of rows that select a detail article", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/leads?locale=en", headers: auth });
  assert.equal(page.status, 200);
  assert.match(page.body, /data-inbox-layout="two-pane"/);
  assert.match(page.body, /<section class="adm-inbox" id="lead-inbox" data-inbox-panes="true"/);

  // Every row links to the detail article that carries the same lead id, so
  // selection works through the URL fragment without JavaScript.
  const rowIds = [...page.body.matchAll(/data-lead-link="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(rowIds.length >= 1, "inbox renders lead rows");
  for (const leadId of rowIds) {
    assert.ok(page.body.includes(`href="#lead-${encodeURIComponent(leadId)}"`), `row links to ${leadId}`);
    assert.ok(page.body.includes(`<article id="lead-${leadId}" class="adm-lead-detail"`), `detail pane for ${leadId}`);
  }
  // The reply composer, assignment control and thread stay inside the detail.
  assert.match(page.body, /class="adm-lead-detail__section adm-reply-cell"/);
  assert.match(page.body, /data-hermes-draft-request="true"/);
  assert.match(page.body, /data-reply-approval-required="true"/);
  assert.match(page.body, /data-lead-assignment-control=/);
});

test("the inbox answers its empty states: no leads, no queue matches, and no selection", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/leads?locale=en", headers: auth });
  assert.match(page.body, /<p class="adm-empty" data-lead-queue-empty="true" role="status" hidden>/);
  assert.match(page.body, /<p class="adm-inbox__hint">Select an enquiry to see its details\.<\/p>/);
  // The hint is revealed by CSS when nothing is selected, in both modes.
  assert.match(crmCss, /\.adm-inbox\[data-inbox-js\] \.adm-inbox__detail:not\(:has\(> article\[data-lead-selected="true"\]:not\(\[hidden\]\)\)\) > \.adm-inbox__hint \{ display: block; \}/);
});

test("a lead with no recorded message says so instead of hiding the thread", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/leads?locale=en", headers: auth });
  assert.ok(
    page.body.includes('data-communication-thread=') || page.body.includes('data-communication-thread-empty="true"'),
    "thread renders either its timeline or its empty note",
  );
  // The renderer must never return nothing for a lead without messages.
  const source = fs.readFileSync(path.join(ROOT, "production/lib/react-admin-site.mjs"), "utf8");
  assert.match(source, /if \(!thread \|\| !thread\.events\?\.length\) \{/);
  assert.match(source, /"data-communication-thread-empty": "true"/);
});

test("pipeline renders a stage board whose columns count their own cards", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/pipeline?locale=en", headers: auth });
  assert.equal(page.status, 200);
  assert.match(page.body, /<section class="adm-board" data-pipeline-grid="true"/);
  for (const group of ["inquiry", "qualified", "viewing", "offer", "closed"]) {
    assert.ok(page.body.includes(`data-stage-group="${group}"`), `stage column ${group}`);
  }
  assert.match(page.body, /data-board-count="true"/);
  assert.match(page.body, /class="adm-board__empty">Nothing in this stage\.<\/p>/);
  // The cards keep their filter attributes and their primary action disclosure.
  assert.match(page.body, /data-pipeline-card="true"/);
  assert.match(page.body, /data-admin-mutation-form="lead-pipeline"/);
  assert.match(ADMIN_APP_JS, /function syncPipelineBoardCounts\(\)/);
});

test("every CRM list screen carries the same toolbar filter and empty-note pattern", async () => {
  const server = app();
  for (const [url, scope] of [
    ["/admin/contacts?locale=en", "contacts"],
    ["/admin/consents?locale=en", "consents"],
    ["/admin/documents?locale=en", "documents"],
    ["/admin/requests?locale=en", "requests"],
  ]) {
    const page = await dispatchHttp(server, { url, headers: auth });
    assert.equal(page.status, 200, url);
    assert.ok(page.body.includes(`data-list-filter="${scope}"`), `${scope} filter tabs`);
    assert.ok(page.body.includes(`data-list-empty="${scope}"`), `${scope} empty note`);
    assert.ok(page.body.includes(`data-list-item="${scope}"`), `${scope} filterable items`);
    assert.ok(page.body.includes('class="adm-toolbar"'), `${scope} toolbar row`);
  }
  assert.match(ADMIN_APP_JS, /function initAdminListFilters\(\)/);
});

// B1 made snooze and bulk actions real, so their coming-soon marking is gone
// and the contract now asserts working controls. Saved views stay marked when
// the caller has no operator identity to own them, and the viewings week view
// is still waiting for broker availability.
test("the list tools strip and the snooze control are wired to their routes", async () => {
  const inbox = await dispatchHttp(app(), { url: "/admin/leads?locale=en", headers: auth });
  // The strip is live, so it no longer carries the planned marking or badge.
  assert.match(inbox.body, /data-list-tools="lead_list_tools"/);
  assert.doesNotMatch(inbox.body, /data-planned-control="lead_list_tools"/);
  assert.doesNotMatch(inbox.body, /data-planned-control="lead_bulk_actions"/);
  assert.doesNotMatch(inbox.body, /data-planned-control="lead_snooze"/);
  assert.doesNotMatch(inbox.body, /Bulk assignment and snoozing are waiting for a batch endpoint/);
  assert.doesNotMatch(inbox.body, /Snoozing is waiting for a due-date field/);

  // Bulk actions: selectable rows, one confirmation, one posting form.
  assert.match(inbox.body, /<form[^>]*id="lead-bulk-actions"/);
  assert.match(inbox.body, /action="\/api\/admin\/leads\/bulk"/);
  assert.match(inbox.body, /data-lead-bulk-form="true"/);
  assert.match(inbox.body, /data-lead-select="[^"]+"/);
  assert.match(inbox.body, /name="bulkConfirmed"/);
  assert.match(inbox.body, /data-lead-selection-count="true"/);
  for (const action of ["assign", "snooze", "handle"]) {
    assert.ok(inbox.body.includes(`value="${action}"`), `bulk action ${action}`);
  }
  assert.match(inbox.body, /One confirmation, one audit entry per selected enquiry\./);

  // Snooze: a real form on the lead detail, naming the deferral rule.
  assert.match(inbox.body, /data-lead-snooze-control="[^"]+"/);
  assert.match(inbox.body, /action="\/api\/admin\/leads\/snooze"/);
  assert.match(inbox.body, /data-admin-mutation-form="lead-snooze"/);
  assert.match(inbox.body, /type="datetime-local" name="until"/);
  assert.match(inbox.body, /Snoozing moves the reply and escalation clocks by the same window/);
  assert.match(ADMIN_APP_JS, /function initLeadBulkForm\(\)/);
  assert.match(ADMIN_APP_JS, /function initSavedViews\(\)/);
});

test("what is still planned keeps its disabled, badged treatment", async () => {
  // The shared local token carries no operator identity, and a saved view has
  // to belong to somebody, so this half stays honestly marked.
  const inbox = await dispatchHttp(app(), { url: "/admin/leads?locale=en", headers: auth });
  assert.match(inbox.body, /data-planned-control="saved_views"/);
  assert.match(inbox.body, /<select id="saved-view-leads" name="savedView" disabled/);
  assert.match(inbox.body, /Saved views are waiting for a stored per-operator filter/);
  assert.match(inbox.body, /class="adm-planned-badge">Coming soon<\/span>/);

  // B5 built broker availability and the free-slot calculation, so the week
  // view is no longer planned: the segmented control is two real links and the
  // week renders a grid of days, free slots and booked viewings.
  const viewings = await dispatchHttp(app(), { url: "/admin/viewings?locale=en", headers: auth });
  assert.doesNotMatch(viewings.body, /data-planned-control="viewing_week_view"/);
  assert.doesNotMatch(viewings.body, /The week calendar is waiting for broker availability/);
  assert.match(viewings.body, /<a href="\/admin\/viewings\?view=week"[^>]*>Week<\/a>/);

  const week = await dispatchHttp(app(), { url: "/admin/viewings?locale=en&view=week", headers: auth });
  assert.match(week.body, /data-viewing-week-grid="true"/);
  assert.match(week.body, /data-viewing-week-day="/);
  assert.match(week.body, /data-week-broker="broker_bg"/);
  // A broker with no recorded hours falls back to the office week, and the
  // screen says so rather than passing it off as that broker's own diary.
  assert.match(week.body, /has not recorded working hours yet/);
});

test("a named operator gets working saved views instead of the planned strip", () => {
  const previous = process.env.MS_REALTY_ADMIN_ACTOR;
  process.env.MS_REALTY_ADMIN_ACTOR = "operations_lead";
  try {
    return dispatchHttp(app(), {
      url: "/admin/leads?locale=en",
      headers: auth,
    }).then((inbox) => {
      assert.match(inbox.body, /data-saved-views-control="leads"/);
      assert.match(inbox.body, /data-saved-view-form="leads"/);
      assert.match(inbox.body, /action="\/api\/admin\/views"/);
      assert.match(inbox.body, /data-saved-view-delete="leads"/);
      assert.doesNotMatch(inbox.body, /data-planned-control="saved_views"/);
    });
  } finally {
    if (previous === undefined) delete process.env.MS_REALTY_ADMIN_ACTOR;
    else process.env.MS_REALTY_ADMIN_ACTOR = previous;
  }
});

test("the Hermes draft button knows it is unconfigured on first paint", async () => {
  const inbox = await dispatchHttp(app(), { url: "/admin/leads?locale=en", headers: auth });
  // Derived from configuration on the payload, so the note is revealed by the
  // existing CSS without a failed draft request first.
  assert.match(inbox.body, /data-hermes-state="unavailable"/);
  assert.match(inbox.body, /data-hermes-reason="not_configured"/);
  assert.match(inbox.body, /Hermes is not configured in this environment\. Missing: HERMES_CHAT_COMPLETIONS_URL, HERMES_API_KEY\./);
  assert.match(crmCss, /\[data-hermes-state="unavailable"\] \.adm-hermes-note/);
});

test("a role without operations:write sees why a control is missing, not an empty cell", () => {
  // Role capabilities are derived from the role list, so no stock role holds
  // operations:read without operations:write. A Payload session can, and
  // pageCan() reads the capability list, so the test restricts it directly.
  const readOnly = (payload) => ({
    ...payload,
    workspace: { ...payload.workspace, operator_id: "read_only_operator", operator_roles: ["broker"], operator_capabilities: ["workspace:read", "operations:read"] },
  });

  const consents = renderAdminConsentPayload(registry, "en", [
    {
      id: "consent-1",
      consent_type: "inquiry_follow_up",
      subject_id: "lead-1",
      contact_reference: "fp:test",
      locale: "en",
      source: "website_listing_detail",
      granted: true,
      marketing_opt_in: false,
      legal_basis: "consent",
      recorded_at: "2026-07-04T00:00:00Z",
      withdrawable: true,
    },
  ]);
  const consentHtml = renderReactAdminBody(readOnly(consents));
  assert.match(consentHtml, /data-read-only-role="true"/);
  assert.match(consentHtml, /This role has read-only access\./);
  // With write access the control returns.
  assert.match(renderReactAdminBody(consents), /data-consent-withdrawal-control="consent-1"/);

  const documents = renderAdminDocumentChecklistPayload(registry, "en", {
    rows: [
      {
        id: "checklist-1",
        lead_id: "lead-1",
        title: "Renter process",
        kind: "renter",
        item_count: 1,
        completed_count: 0,
        open_count: 1,
        blocked_count: 0,
        progress_percent: 0,
        next_item: { id: "item-1", key: "identity_review", label: "Identity review" },
        items: [{ id: "item-1", key: "identity_review", label: "Identity review", ordinal: 1, status: "pending", blocked: false, complete: false, outcome: null }],
      },
    ],
    summary: { checklists: 1, open: 1, blocked: 0, complete: 0, items: 1, items_complete: 0 },
  });
  const documentHtml = renderReactAdminBody(readOnly(documents));
  assert.match(documentHtml, /data-read-only-role="true"/);
  assert.match(renderReactAdminBody(documents), /data-document-outcome-control="item-1"/);
});

test("the CRM stylesheet defines every interaction state it promises", () => {
  for (const css of [crmCss, bundleCss]) {
    // Focus, press, hover.
    assert.match(css, /\.adm-action-disclosure__summary:focus-visible/);
    assert.match(css, /box-shadow:\s*var\(--shadow-focus\)/);
    assert.match(css, /\.crm-app main \.mk-btn:not\(:disabled\):not\(\[aria-disabled="true"\]\):active/);
    assert.match(css, /\.adm-board \.adm-pipeline-card:hover/);
    // Disabled and read-only.
    assert.match(css, /\.crm-app main fieldset:disabled/);
    assert.match(css, /\.adm-note\[data-read-only-role\]/);
    // Saving, success, error.
    assert.match(css, /\.crm-app main form\[aria-busy="true"\]/);
    assert.match(css, /\[data-admin-mutation-status\]\[data-state="success"\]/);
    assert.match(css, /\[data-admin-mutation-status\]\[data-state="error"\]/);
    // Hermes reveals its note only once a draft request proves it unavailable.
    assert.match(css, /\[data-hermes-state="unavailable"\] \.adm-hermes-note/);
  }
});

test("a failed Hermes draft turns the composer into its unavailable state", () => {
  assert.match(ADMIN_APP_JS, /var missingHermes = isDraft && \/HERMES_CHAT_COMPLETIONS_URL\|HERMES_API_KEY\//);
  assert.match(ADMIN_APP_JS, /host\.setAttribute\("data-hermes-state", "unavailable"\)/);
  // The draft button must stay disabled once Hermes is known to be missing.
  assert.match(ADMIN_APP_JS, /if \(submit && !\(isDraft && unavailableNow\)\) submit\.disabled = false;/);
});

test("the lead inbox panes stay usable without JavaScript and enhance with it", () => {
  // No-JS: the fragment selects, and the first visible lead opens by default.
  assert.match(crmCss, /\.adm-inbox__detail > article:target:not\(\[hidden\]\) \{ display: grid; \}/);
  assert.match(crmCss, /\.adm-inbox:not\(\[data-inbox-js\]\) \.adm-inbox__detail:not\(:has\(> article:target:not\(\[hidden\]\)\)\) > article:nth-child\(1 of :not\(\[hidden\]\)\) \{ display: grid; \}/);
  // With JS: the attribute drives the pane and the hash follows the selection.
  assert.match(ADMIN_APP_JS, /function initLeadInboxPanes\(\)/);
  assert.match(ADMIN_APP_JS, /inbox\.setAttribute\("data-inbox-js", "true"\)/);
  assert.match(ADMIN_APP_JS, /window\.history\.replaceState\(null, "", "#lead-" \+ encodeURIComponent\(id\)\)/);
});

test("the new CRM copy exists in Bulgarian, Russian and English", async () => {
  const server = app();
  const expected = {
    bg: ["Изберете запитване", "Инструменти за списъка", "Очаква се", "Нови запитвания"],
    ru: ["Выберите заявку", "Инструменты списка", "Скоро", "Новые заявки"],
    en: ["Select an enquiry", "List tools", "Coming soon", "New enquiries"],
  };
  for (const [locale, phrases] of Object.entries(expected)) {
    const inbox = await dispatchHttp(server, { url: `/admin/leads?locale=${locale}`, headers: auth });
    const pipeline = await dispatchHttp(server, { url: `/admin/pipeline?locale=${locale}`, headers: auth });
    const combined = `${inbox.body}${pipeline.body}`;
    for (const phrase of phrases) {
      assert.ok(combined.includes(phrase), `${locale}: ${phrase}`);
    }
    // Sentence case and no dashes in the new admin copy.
    assert.doesNotMatch(inbox.body.replace(/<code[^>]*>[\s\S]*?<\/code>/g, ""), /[—–]/, `${locale} inbox has no dashes`);
  }
});
