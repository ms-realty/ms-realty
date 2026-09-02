import fs from "node:fs";
import { sheet, icon } from "../shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

const C_CSS = `
    .doc-hd { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:22px; }
    .doc-hd h1 { font-family:var(--font-display); font-size:30px; font-weight:600; letter-spacing:-.02em; }
    .doc-hd p { margin-top:5px; font-size:13.5px; color:var(--text-muted); max-width:760px; }
    .grp > h2 { font-size:12px; font-weight:600; color:var(--text-muted); margin:0 0 10px;
      padding-bottom:7px; border-bottom:1px solid var(--border); }
    .grp { margin-bottom:26px; }
    .cov { width:100%; }
    .cov th { font-size:10.5px; }
    .cov td { font-size:12px; vertical-align:top; padding:8px 12px; }
    .cov td.api { font-family:var(--font-mono); font-size:11px; color:var(--text-muted); line-height:1.6; }
    .cov td b { font-size:12.5px; color:var(--text-strong); }
    .gapc { display:grid; grid-template-columns:auto minmax(0,1fr) 190px 108px; gap:14px; align-items:start;
      padding:12px 16px; border-bottom:1px solid var(--border); }
    .gapc:last-child { border-bottom:0; }
    .gapc b { font-size:13px; font-weight:600; color:var(--text-strong); display:block; }
    .gapc em { font-style:normal; font-size:12px; color:var(--text-muted); display:block; margin-top:3px; }
    .cols2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; align-items:start; }
`;

const ROWS = [
  ["Today", "Main", "/api/admin/today · /api/admin/views", "ok", "Backed"],
  ["Lead inbox", "LeadInbox", "/leads · /replies · /replies/draft · /replies/delivery · /leads/assign · /leads/bulk · /leads/snooze", "ok", "Backed"],
  ["Pipeline", "Pipeline", "/pipeline · /lead-pipeline/outcome · /seller-pipeline/outcome · /deals/close", "ok", "Backed"],
  ["Viewings", "Viewings", "/viewings · /viewings/week · /viewings.ics · /viewings/follow-up · /availability", "ok", "Backed"],
  ["Requests", "Requests", "/requests · /public-requests/outcome · /locales", "ok", "Backed"],
  ["Contacts", "Contacts", "/contacts · /accounts · /accounts/link · /broker-contacts", "ok", "Backed"],
  ["Consent", "Consent", "/consents · /consents/withdraw", "ok", "Backed"],
  ["Transaction cases", "Cases, CaseDetail", "/cases · /cases/actions · /cases/conditions · /cases/intents", "ok", "Backed"],
  ["Listings", "Listings, ListingEditor", "/listings · /listings/edit · /listings/status · /listings/slug · /listing-quality · /listings/publication-schedules", "ok", "Backed"],
  ["Media", "Media", "/media/uploads · /media/reviews · /tours/approve", "warn", "No admin route yet"],
  ["Translations", "Translations", "/translations · /translations/draft · /translations/approve · /translations/publish", "ok", "Backed"],
  ["SEO and redirects", "SeoRedirects", "/migration/review · /redirect-approvals · /deployable-redirects/export · /seo-evidence · /seo-preflight", "ok", "Backed"],
  ["Hermes", "Hermes, HermesRun", "/hermes", "warn", "Run history not exposed"],
  ["Integrations", "Integrations", "/connections · /connections/agent-config · /connections/disconnect · /social-marketing/publish", "ok", "Backed"],
  ["Insight", "Reports, Activity", "/reports · /reports/export · /activity", "ok", "Backed"],
  ["Launch readiness", "LaunchReadiness", "/launch-readiness · /launch-input-checklist · /preflight-reports · /live-services · /production-recovery", "ok", "Backed"],
  ["Settings", "Settings", "/settings · /profile · /locales", "ok", "Backed"],
  ["Team and security", "Team", "/team · /security/sessions · /security/two-factor · /security/audit-retention", "ok", "Backed"],
  ["Data and exports", "Team", "/data-exports · /data-exports/download", "ok", "Backed"],
  ["Documents", "Documents, DocumentEditor", "/documents · /documents/outcome", "warn", "Checklist only — no document object"],
  ["Website pages", "SitePages, PageEditor", "— none —", "danger", "No collection exists"],
  ["Tasks", "Tasks", "— none —", "danger", "No task entity"],
  ["Automations", "Automations", "/saved-search-alerts/run-due · /listings/publication-schedules/run-due", "warn", "Runners exist, no rule model"],
  ["Integration catalogue", "IntegrationCatalogue", "— none —", "danger", "10 hardcoded providers only"],
];

const GAPS = [
  ["danger", "Website pages are not in the CMS", "Home, search, seller, contact and location copy is rendered from code, so 7 of the 7 public page types cannot be edited by the owner. The catalogue and the guides already round-trip.", "New collections: pages, blocks, navigation, forms", "Large"],
  ["danger", "There is no document object", "document-checklists.mjs records outcomes against a lead but there is nothing to create, render, version, send or sign. The composer designs what has to exist.", "New: templates, documents, versions, signature", "Large"],
  ["danger", "No integration aggregator", "operator-provider-catalog.mjs hardcodes ten providers. Anything else is a code change and a release.", "Broker layer + a connection record", "Medium"],
  ["danger", "Tasks have no entity", "Work is implied by leads, viewings and cases. A broker cannot see one list of what they owe.", "New: tasks, with a source record", "Medium"],
  ["warn", "No automation rule model", "Two run-due endpoints exist, but the rules themselves are code. The screen shows what a rule record needs.", "New: automations, runs, failures", "Medium"],
  ["warn", "Media has no admin route", "/api/admin/media/uploads exists; there is no page behind it, so 11,859 files have no browser.", "Route + list view", "Small"],
  ["warn", "Hermes run history is not exposed", "Runs are written to hermes-audit.jsonl but no endpoint reads them back.", "GET /api/admin/hermes/runs", "Small"],
  ["warn", "No news or blog", "No route type and no collection. Legacy .ru had a news index that is currently proposed for 410.", "Decide, then a collection or a redirect", "Small"],
];

const BODY = `<div class="doc-hd">
  <div><h1>Design against the backend</h1>
    <p>Every screen in this canvas checked against the 118 admin routes, the 8 CMS collections and the 7 public
      page types that exist in the repository today. Twenty of twenty-four surfaces are already backed. Four
      are designed ahead of the code, and this page says which.</p></div>
  <div style="display:grid; gap:6px; justify-items:end">
    <span class="pill pill--ok"><i></i>20 backed</span>
    <span class="pill pill--warn"><i></i>4 partial</span>
    <span class="pill pill--danger"><i></i>4 need new backend</span>
  </div>
</div>

<div class="grp">
  <h2>Screen to endpoint</h2>
  <div class="panel">
    <table class="cov">
      <thead><tr><th>Surface</th><th>Artboard</th><th>Endpoints behind it</th><th>State</th></tr></thead>
      <tbody>
${ROWS.map(([surface, board, api, tone, state]) => `        <tr>
          <td><b>${surface}</b></td>
          <td class="muted">${board}</td>
          <td class="api">${api}</td>
          <td><span class="pill pill--${tone}"><i></i>${state}</span></td>
        </tr>`).join("\n")}
      </tbody>
    </table>
    <div class="foot"><span>Endpoint paths are relative to <span class="mono">/api/admin</span>.</span>
      <span class="mono">Read from owner-operator-catalog.mjs</span></div>
  </div>
</div>

<div class="grp">
  <h2>What the design needs that the backend does not have</h2>
  <div class="panel">
${GAPS.map(([tone, title, detail, needs, size]) => `    <div class="gapc">
      <span class="av" style="background:var(--${tone === "danger" ? "danger" : "warning"}-50); color:var(--${tone === "danger" ? "danger-600" : "warning-700"})">${icon("alert", 14)}</span>
      <span style="min-width:0"><b>${title}</b><em>${detail}</em></span>
      <span style="font-size:12px" class="muted">${needs}</span>
      <span><span class="pill pill--${tone}"><i></i>${size}</span></span>
    </div>`).join("\n")}
  </div>
</div>

<div class="grp" style="margin-bottom:0">
  <h2>What the backend has that nothing was showing</h2>
  <div class="cols2">
    <div class="panel">
      <div class="panel-hd"><h2>Now given a surface</h2></div>
      <div class="sect" style="display:grid; gap:9px; font-size:12.5px">
        <div style="display:flex; gap:9px">${icon("check", 15)}<span><b>Transaction cases</b> — six case types across eight phases, Bulgarian and Greek step lists, and a manual or autonomous execution mode per case. The richest model in the repository and the least visible.</span></div>
        <div style="display:flex; gap:9px">${icon("check", 15)}<span><b>Case conditions</b> — subject-to clauses with deadlines, met, waived or extended.</span></div>
        <div style="display:flex; gap:9px">${icon("check", 15)}<span><b>Saved views</b> — a real endpoint, previously invisible in the interface.</span></div>
        <div style="display:flex; gap:9px">${icon("check", 15)}<span><b>Two-factor, sessions, audit retention</b> — three security endpoints with no screen.</span></div>
        <div style="display:flex; gap:9px">${icon("check", 15)}<span><b>Launch readiness and live-service provisioning</b> — thirteen gates that decide whether the site may go live.</span></div>
        <div style="display:flex; gap:9px">${icon("check", 15)}<span><b>Listing publication schedules</b> — publish at a date, with the approval taken in advance.</span></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-hd"><h2>Constraints the design had to obey</h2></div>
      <div class="sect" style="display:grid; gap:9px; font-size:12.5px">
        <div style="display:flex; gap:9px">${icon("lock", 15)}<span>Five actions are refused to Hermes in code — publish, send a message, mark indexable, change a price, change a redirect. The interface never offers them to it.</span></div>
        <div style="display:flex; gap:9px">${icon("lock", 15)}<span>Sandanski may never be described as a sea destination. The guardrail is a token list, and the run detail shows it firing.</span></div>
        <div style="display:flex; gap:9px">${icon("lock", 15)}<span>A published listing needs facts, media and freeze-active approval. The publication boundary is why a seeded workspace shows zero public listings.</span></div>
        <div style="display:flex; gap:9px">${icon("lock", 15)}<span>A new audit action has to be registered before it can be written, so every screen's actions map to registered names.</span></div>
        <div style="display:flex; gap:9px">${icon("lock", 15)}<span>Completing a document checklist item requires a note or a reference plus a named human confirmation.</span></div>
        <div style="display:flex; gap:9px">${icon("lock", 15)}<span>Admin locales are BG, RU and EN only; the public site carries seven, and Hebrew is a full right-to-left build.</span></div>
      </div>
    </div>
  </div>
</div>`;

fs.writeFileSync(W("Coverage.dc.html"), sheet({ body: BODY, width: 1560, height: 1720, extraCss: C_CSS }));
console.log("Coverage.dc.html");
