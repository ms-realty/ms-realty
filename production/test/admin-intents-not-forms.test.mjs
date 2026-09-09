import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { renderAdminTeamForbiddenPayload, renderAdminTeamPayload } from "../lib/admin-team.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { renderReactAdminBody } from "../lib/react-admin-site.mjs";

// Six screens start from an intent rather than a form: Deals, Documents,
// Team, Website languages, Approved content, Requests. Each test here is a
// markup contract for that screen, plus one rule they all share: no heading
// or emphasised text is a storage key.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUTH = { authorization: "Bearer local-admin-smoke" };
const RAW_KEY = /^(lead-draft-|contact-|payload-|editor_|translator_)/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-admin-intents-"));
const copy = (name) => {
  const target = path.join(dataDir, name);
  fs.copyFileSync(path.join(ROOT, "production/data", name), target);
  return target;
};
const emptyLedger = (name) => {
  const target = path.join(dataDir, `${name}.jsonl`);
  fs.writeFileSync(target, "");
  return target;
};

// The committed ledgers, read only: four enquiries, no deals, all languages.
const seededApp = () =>
  createHttpApp({
    reviewedAt: "2026-07-19T12:00:00.000Z",
    leadLedgerPath: copy("lead-ledger.jsonl"),
    eventLedgerPath: copy("events.jsonl"),
    auditLogPath: emptyLedger("audit-seeded"),
    leadContactVaultPath: path.join(dataDir, "lead-contacts.jsonl"),
    leadContactKey: "test-only-admin-intents-key-32-chars",
  });

let seeded = null;
const seededOnce = () => (seeded ||= seededApp());
const get = (app, url, headers = AUTH) => dispatchHttp(app, { url, headers });

// Visible headings and emphasised text, tags stripped, one entry per element.
function headingsAndStrong(html) {
  const main = html.slice(html.indexOf("<main"));
  return [...main.matchAll(/<(h[1-4]|strong)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(([, , inner]) => inner.replace(/<[^>]+>/g, "").trim());
}

function assertNoRawKeys(html, screen) {
  for (const text of headingsAndStrong(html)) {
    assert.doesNotMatch(text, RAW_KEY, `${screen}: "${text}" is a storage key shown as a title`);
    assert.doesNotMatch(text, UUID, `${screen}: "${text}" is an id shown as a title`);
  }
}

test("Deals: with nothing open there is one empty state and one primary action, and the form is staged", async () => {
  const res = await get(seededOnce(), "/admin/cases?locale=en");
  assert.equal(res.status, 200);
  assert.match(res.body, /data-realty-case-empty="true"/);
  assert.equal((res.body.match(/data-realty-case-create="true"/g) || []).length, 1, "one Start a deal action");
  assert.match(res.body, /adm-action-disclosure__summary"[^>]*>[\s\S]*?<span>Start a deal<\/span>/);
  // The stat strip and the conditions workbench describe work that does not exist yet.
  assert.doesNotMatch(res.body, /class="adm-kpis"/);
  assert.doesNotMatch(res.body, /data-realty-case-condition-workbench/);
  // Step one is what the deal is; the mandate waits behind a closed disclosure.
  assert.match(res.body, /<fieldset class="adm-form__stage" data-case-stage="start">/);
  assert.match(res.body, /<details class="adm-form__stage adm-form__stage--collapsed" data-case-stage="mandate" open(?:="")?>/);
  assert.match(res.body, /Mandate and assurance/);
  // Every field the API requires is still posted.
  for (const name of ["id", "clientRef", "jurisdiction", "caseType", "assetKind", "executionMode", "mandateRef", "mandateGrantedByRef", "mandateSignedAt", "mandateSignedEvidenceRef", "mandateCapabilities", "actor"]) {
    assert.match(res.body, new RegExp(`name="${name}"`), `${name} is posted`);
  }
  assert.doesNotMatch(res.body, /Case ID|Client reference|Mandate grantor reference/);
  assertNoRawKeys(res.body, "deals");
});

test("Documents: cards are titled by client and property, grouped by next step, with the caveat as a footnote", async () => {
  const res = await get(seededOnce(), "/admin/documents?locale=en");
  assert.equal(res.status, 200);
  assert.ok((res.body.match(/data-document-checklist="/g) || []).length >= 2, "the seeded enquiries have checklists");
  assert.match(res.body, /data-checklist-group="step:/);
  assert.match(res.body, /class="adm-checklist-group__title"><span>Next step: /);
  // The key of the enquiry is not a title and not a visible caption.
  assert.doesNotMatch(res.body, /<h3>Renter process<\/h3>/);
  assert.doesNotMatch(res.body, /class="crm-mono">lead-draft-/);
  assert.match(res.body, /<h3>(Renter|Buyer|Seller|General inquiry) · Client without a name · /);
  // The legal caveat closes the page rather than opening it.
  const guardrail = res.body.indexOf('data-process-guardrail="true"');
  const lastCard = res.body.lastIndexOf('data-document-checklist="');
  assert.ok(guardrail > lastCard, "the footnote follows the last checklist");
  assert.match(res.body, /<p class="adm-footnote" data-process-guardrail="true">/);
  assertNoRawKeys(res.body, "documents");
});

test("Team: a people list with one Edit per person, workspaces as checkboxes, and the first-sign-in credential labelled", () => {
  const registry = loadLocaleRegistry();
  const html = renderReactAdminBody(
    renderAdminTeamPayload({
      registry,
      requestedLocale: "en",
      currentOperatorId: "1",
      operators: [
        { id: "1", name: "Ivan Peychev", email: "ivan@example.test", role: "admin", workspace_ids: [] },
        { id: "2", name: "Anna Broker", email: "anna@example.test", role: "broker", workspace_ids: ["sandanski"], password_change_required: true },
      ],
    }),
  );
  assert.match(html, /<ul class="adm-team-people">/);
  assert.equal((html.match(/<li class="adm-team-person"/g) || []).length, 2);
  assert.equal((html.match(/data-team-editor="/g) || []).length, 2, "one editor per person");
  assert.match(html, /data-team-operator="2" data-team-role="broker">[\s\S]*?<strong>Anna Broker<\/strong><span class="adm-team-person__email">anna@example\.test<\/span>/);
  assert.match(html, /<details class="adm-team-person__edit" data-team-editor="2"><summary class="mk-btn mk-btn--secondary mk-btn--sm">/);
  // Known workspaces come from the payload, so the field is a checkbox list.
  assert.match(html, /data-team-workspaces="checkboxes"/);
  assert.match(html, /<input type="checkbox" name="workspace_ids" value="sandanski" id="op-2-ws-sandanski" checked/);
  assert.doesNotMatch(html, /<input name="workspace_ids"/);
  // One create form, opened from one button, with the credential named as what it is.
  assert.equal((html.match(/data-team-create="true"/g) || []).length, 1);
  assert.match(html, /First sign-in password/);
  assert.match(html, /name="password" type="password"[^>]*data-team-first-sign-in="true"/);
  assertNoRawKeys(html, "team");

  // Without any workspace on record the field stays free text.
  const noWorkspaces = renderReactAdminBody(
    renderAdminTeamPayload({ registry, requestedLocale: "en", operators: [{ id: "1", email: "a@b.c", role: "admin", workspace_ids: [] }] }),
  );
  assert.match(noWorkspaces, /<input name="workspace_ids"/);
  assert.doesNotMatch(noWorkspaces, /data-team-workspaces="checkboxes"/);
});

test("Team: without a payload session the HTML route answers with a page, not JSON", async () => {
  const res = await get(seededOnce(), "/admin/team?locale=en");
  assert.equal(res.status, 403);
  assert.match(String(res.headers["content-type"]), /text\/html/);
  assert.match(res.body, /class="crm-app"/);
  assert.match(res.body, /data-react-admin-ui="team-forbidden"/);
  assert.match(res.body, /data-team-forbidden="true"/);
  assert.match(res.body, /You need owner access/);
  assert.doesNotMatch(res.body, /"kind":"forbidden"|payload_session/);
  // The API route keeps its machine-readable refusal.
  const api = await get(seededOnce(), "/api/admin/team?locale=en");
  assert.equal(api.status, 403);
  assert.equal(api.body.kind, "forbidden");
  for (const locale of ["bg", "ru"]) {
    const page = renderReactAdminBody(renderAdminTeamForbiddenPayload({ registry: loadLocaleRegistry(), requestedLocale: locale }));
    assert.match(page, /data-team-forbidden="true"/, locale);
    assert.doesNotMatch(page, /You need owner access/, `${locale} is translated`);
  }
});

test("Website languages: reviewers read as people or roles, the language is picked from a list, removal waits behind a disclosure", async () => {
  const res = await get(seededOnce(), "/admin/locales?locale=en&focus=fr");
  assert.equal(res.status, 200);
  const reviewers = [...res.body.matchAll(/data-locale-reviewer="[a-z-]+">([^<]*)</g)].map(([, text]) => text);
  assert.ok(reviewers.length >= 7);
  for (const text of reviewers) assert.doesNotMatch(text, /^(editor|translator)_/, `${text} is an account key`);
  assert.ok(reviewers.includes("Editor · BG"), reviewers.join(", "));
  assert.ok(reviewers.includes("Translator · DE"), reviewers.join(", "));
  // The language to add is picked, not typed: no code, name or direction inputs.
  assert.match(res.body, /<select name="code" required(?:="")? data-locale-picker="true">/);
  const select = res.body.match(/<select name="code"[\s\S]*?<\/select>/)[0];
  assert.match(select, /<option value="es"/);
  assert.doesNotMatch(select, /<option value="fr"/);
  assert.doesNotMatch(res.body, /<input name="code"|name="native_name"|name="direction"/);
  assert.match(res.body, /<details class="crm-panel adm-workbench-disclosure" data-locale-remove="true"><summary>[\s\S]*?Remove a language…/);
  assertNoRawKeys(res.body, "locales");
});

test("Approved content: one sentence says the records are owner-managed and read-only; no paths or commands", async () => {
  for (const locale of ["en", "bg", "ru"]) {
    const res = await get(seededOnce(), `/admin/approved-content?locale=${locale}`);
    assert.equal(res.status, 200, locale);
    assert.match(res.body, /<p class="adm-approved-howto" data-approved-content-howto="true">/, locale);
    const note = res.body.match(/<p class="adm-approved-howto"[\s\S]*?<\/p>/)[0];
    assert.doesNotMatch(note, /production\/data\/|node production\/scripts|build-approved-content|source hash/, locale);
    assertNoRawKeys(res.body, `approved content ${locale}`);
  }
  const english = await get(seededOnce(), "/admin/approved-content?locale=en");
  assert.match(english.body, /These records are managed by the owner and are read-only here\./);
});

test("Requests: each row says who asked what, contact inline, and no stat strip repeats the pills", async () => {
  const paths = Object.fromEntries(
    [
      "leadLedgerPath",
      "leadContactVaultPath",
      "publicContactVaultPath",
      "replyOutboxPath",
      "languageRequestPath",
      "translationLedgerPath",
      "listingEditLedgerPath",
      "viewingLedgerPath",
      "viewingFollowUpLedgerPath",
      "savedSearchLedgerPath",
      "publicRequestOutcomeLedgerPath",
      "sellerPipelinePath",
      "sellerPipelineOutcomeLedgerPath",
      "dealLedgerPath",
      "brokerContactLedgerPath",
      "tourApprovalLedgerPath",
      "eventLedgerPath",
      "consentLedgerPath",
      "auditLogPath",
    ].map((name) => [name, emptyLedger(`requests-${name}`)]),
  );
  const secret = "admin-intents-contact-secret-000001";
  const app = createHttpApp({
    ...paths,
    leadContactKey: secret,
    publicContactKey: secret,
    savedAt: "2026-07-18T10:00:00.000Z",
    requestedAt: "2026-07-18T11:00:00.000Z",
    receivedAt: "2026-07-19T09:00:00.000Z",
    reviewedAt: "2026-07-19T09:00:00.000Z",
  });
  const saved = await dispatchHttp(app, {
    method: "POST",
    url: "/api/saved-searches",
    body: {
      id: "saved-search-intents",
      locale: "en",
      query: "Sandanski",
      filters: { property_type: "apartment" },
      contact: { name: "Elena Petrova", email: "elena-intents@example.test" },
      contactPreference: "email",
      alertConsent: true,
      alertFrequency: "weekly",
    },
  });
  assert.equal(saved.status, 201);
  const language = await dispatchHttp(app, {
    method: "POST",
    url: "/api/language-requests",
    body: {
      id: "language-request-intents",
      requestedLocale: "fr",
      requestedPath: "/fr/properties/MS-CRAWL-0114",
      contact: { name: "Noa Levi", phone: "+359 888 333 222" },
      message: "Please tell me when this page is in French.",
    },
  });
  assert.equal(language.status, 201);

  const res = await get(app, "/admin/requests?locale=en");
  assert.equal(res.status, 200);
  assert.doesNotMatch(res.body, /class="adm-kpis"/);
  assert.match(res.body, /<h3 data-public-request-subject="true">Page in French requested · 1 visitor · reply (planned|not planned)<\/h3>/);
  assert.match(res.body, /<h3 data-public-request-subject="true">Saved search: [^<]*Sandanski[^<]*· Weekly<\/h3>/);
  // The contact sits in the row, not behind a disclosure; the private message keeps its drawer.
  assert.match(res.body, /<div class="adm-public-request__contact" data-private-request-contact="true"><div class="adm-lead-contact" data-private-contact="true"><strong>Noa Levi<\/strong>/);
  assert.match(res.body, /mailto:elena-intents@example\.test/);
  assert.match(res.body, /data-public-request-details="collapsed"/);
  assert.match(res.body, /data-private-request-message="true"/);
  assert.doesNotMatch(res.body, /<h3[^>]*>(Saved search|Language request)<\/h3>/);
  assertNoRawKeys(res.body, "requests");
});
