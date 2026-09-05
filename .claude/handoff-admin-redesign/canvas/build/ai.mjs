import fs from "node:fs";
import { page, icon, subnav } from "../shell.mjs";

const CSS = `
  .ai { display:grid; gap:20px; }
  .ai .ph { margin:0; }
  .ai-grid { display:grid; grid-template-columns:minmax(0,2fr) minmax(0,1fr); gap:20px; align-items:start; }
  .ai-section { min-width:0; padding:20px; border-top:1px solid var(--joint); }
  .ai-section h2 { font-size:16px; margin-bottom:12px; }
  .ai-section p + p { margin-top:8px; }
  .ai-form { display:grid; gap:16px; }
  .ai .in { width:100%; font:inherit; background:var(--tile-glaze); color:var(--text-body); }
  .ai textarea.in { min-height:96px; resize:vertical; }
  .ai :is(button,input,textarea,select,a):focus-visible { outline:2px solid var(--spring-700); outline-offset:2px; }
  .ai button:disabled { opacity:.5; cursor:not-allowed; }
  .ai .assist { border-color:var(--brick-700); }
  .ai-actions { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }
  .ai-row { display:grid; grid-template-columns:minmax(0,1fr) 108px 180px 100px; gap:16px; align-items:center; height:var(--row); padding:0 20px; border-top:1px solid var(--joint); }
  .ai-row > * { min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ai-row:hover { background:var(--tile); }
  .ai-row .btn { justify-self:end; }
  .ai-heading { background:var(--tile-deep); font-weight:600; }
  .ai-facts { display:grid; grid-template-columns:160px minmax(0,1fr); gap:12px 16px; }
  .ai-facts dt { color:var(--text-muted); }
  .ai-facts dd { margin:0; min-width:0; overflow-wrap:anywhere; }
  .ai-states { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }
  .ai-state { display:grid; align-content:start; gap:12px; min-width:0; padding:20px 0; border-top:1px solid var(--joint); }
  .ai-state h2 { font-size:16px; }
  .ai-state .btn { justify-self:start; }
  .ai-steps { list-style:none; padding:0; margin:0; }
  .ai-steps li { display:grid; grid-template-columns:32px minmax(0,1fr) 180px; gap:16px; padding:16px 20px; border-top:1px solid var(--joint); }
  .ai-steps p { margin-top:4px; color:var(--text-muted); }
  .ai-source { border-inline-start:2px solid var(--spring-700); padding:12px 16px; background:var(--tile); }
  .ai-meta { color:var(--text-muted); font-size:11px; }
`;
const pending = (label) => `<span class="wit wit--none">${label}</span>`;
const nav = (on) => subnav([["Draft requests", "sparkles", on === "requests"], ["Run review", "history", on === "run"]]);

const hermes = `<div class="ai">
  <div class="ph"><div><h1>Hermes</h1><p>Prepare work for a person to review. Customer replies, publication and listing facts keep their approval boundaries.</p></div></div>
  ${nav("requests")}
  <p class="muted">Illustrative workspace · sample requests and states, not a live service report.</p>
  <div class="ai-grid">
    <section class="panel"><div class="panel-hd"><h2>What needs a draft?</h2>${pending("Your review follows")}</div>
      <div class="ai-section"><form class="ai-form">
        <div class="field"><label for="draft-kind">Work to prepare</label><select class="in" id="draft-kind"><option>Translation review plan</option><option>Listing copy draft</option><option>Broker task summary</option></select></div>
        <div class="field"><label for="draft-request">Request</label><textarea class="in in--area" id="draft-request" aria-describedby="draft-help">Prepare a review plan for the German, Dutch and Greek listing descriptions. Identify missing approvals and link each task to its source.</textarea><p class="hint" id="draft-help">Name the records and the intended output. A request cannot grant publishing or sending permission.</p></div>
        <div class="ai-source"><b>Source selection</b><p>Approved Bulgarian listing content and the current translation queue. Open each source before reviewing a draft.</p></div>
        <div class="ai-actions"><button class="btn btn--accent" type="button">${icon("sparkles",16)}Prepare draft plan</button><span class="ai-meta">Example: owner planning is available</span></div>
      </form></div>
    </section>
    <section class="panel"><div class="panel-hd"><h2>Availability is per task</h2></div><div class="ai-section ai-form">
      <div><b>Owner planning</b><p>Can use the configured provider or a connected OpenRouter account.</p></div>
      <div><b>Customer reply drafts</b><p>Require the configured self-hosted reply service. An owner-planning connection does not enable them.</p></div>
      <div>${pending("Reply service unavailable")}<p>Example state: connect the reply service, then return to the lead.</p></div>
      <button class="btn" type="button">Review connections</button>
      <p class="hint">Model, hosting and verification time appear only when the service returns them.</p>
    </div></section>
  </div>
  <section class="panel"><div class="panel-hd"><h2>Waiting for a person</h2><span class="sub">3 sample requests</span></div>
    <div class="ai-row ai-heading"><span>Request</span><span>Output</span><span>Witness</span><span>Action</span></div>
    ${[
      ["Екатерина Константинова-Александрова · listing translation", "German", "Reviewer needed", "Open draft"],
      ["Seven listing descriptions · three target languages", "21 drafts", "Not approved", "Open run"],
      ["Case summary · missing document evidence", "Summary", "Source check due", "Open draft"],
    ].map(([name, output, witness, action]) => `<div class="ai-row"><b title="${name}">${name}</b><span>${output}</span>${pending(witness)}<button class="btn btn--sm" type="button">${action}</button></div>`).join("")}
    <div class="foot"><span>Showing 3 of 3 sample requests</span><button class="btn btn--sm" type="button" disabled>Next page</button></div>
  </section>
  <section class="panel"><div class="panel-hd"><h2>What the review protects</h2></div><dl class="ai-section ai-facts">
    <dt>Property facts</dt><dd>Price, area, bedrooms, location, reference and source URL stay as supplied by the approved source.</dd>
    <dt>Public language</dt><dd>BG is the source. EN, DE, NL, RU, EL and HE each require human approval before indexing.</dd>
    <dt>Decisions</dt><dd>Hermes does not send customer messages, publish pages, approve legal claims, change prices or change redirects.</dd>
    <dt>Private records</dt><dd>Show the records and data scope used for this request. Do not infer privacy guarantees from the model name.</dd>
  </dl></section>
  <div class="ai-states" aria-label="Additional request states">
    <section class="ai-state"><h2>No drafts waiting</h2><p>${icon("check",28)} All reviewed work is in its record. Start a request when another draft is needed.</p><button class="btn" type="button">View reviewed requests</button></section>
    <section class="ai-state"><h2>Request in progress</h2><p role="status">Preparing the plan. Keep this request open until its outcome is known.</p><button class="btn" type="button" disabled>Preparing draft…</button></section>
    <section class="ai-state"><h2>Service did not answer</h2><p role="alert">No result is confirmed. Your request stays visible; check its status before submitting again.</p><button class="btn" type="button">Check request status</button></section>
    <section class="ai-state"><h2>Only part of the queue loaded</h2><p>Loaded requests can be opened. Missing rows are unavailable, not complete.</p><button class="btn" type="button">Reload queue</button></section>
    <section class="ai-state"><h2>More requests than fit here</h2><div class="field"><label for="request-filter">Find a request</label><input class="in" id="request-filter" type="search" placeholder="Name, reference or language"></div><p>Keep the filter and page position when returning from a review.</p></section>
    <section class="ai-state"><h2>Connection lost</h2><p>Previously loaded drafts remain readable. Submission waits for a connection and a status check.</p><button class="btn" type="button" disabled>Prepare draft plan</button></section>
  </div>
</div>`;

const run = `<div class="ai">
  <div class="ph"><div><h1>Review a translation run</h1><p>Seven descriptions × three languages · 21 draft outputs · human review still required.</p></div><div class="ph-actions"><button class="btn btn--accent" type="button">Open first draft</button></div></div>
  ${nav("run")}
  <p class="muted">Illustrative run · counts, people and decisions below demonstrate the review, not a production execution.</p>
  <section class="panel"><div class="panel-hd"><h2>The result is a draft</h2>${pending("0 of 21 approved")}</div><div class="ai-section">
    <p>Review one language and source version at a time. Opening this run does not approve a translation or make it indexable.</p>
  </div></section>
  <div class="ai-grid">
    <section class="panel"><div class="panel-hd"><h2>Source and result</h2></div><ol class="ai-steps">
      <li>${icon("file",20)}<div><b>Approved Bulgarian sources selected</b><p>Each output links to the exact description version used. Missing approval stops that record.</p></div><span>7 sample records</span></li>
      <li>${icon("languages",20)}<div><b>German, Dutch and Greek drafts prepared</b><p>One draft per listing and target language. A changed source requires a fresh comparison.</p></div><span>21 sample drafts</span></li>
      <li>${icon("alert",20)}<div><b>Geography needs a human check</b><p>Sandanski is an inland spa town. A conflicting claim must be corrected from the approved source.</p></div>${pending("Reviewer needed")}</li>
      <li>${icon("lock",20)}<div><b>Publication is still closed</b><p>Draft generation supplies no approval witness. The translation review records the responsible person and decision.</p></div>${pending("Not indexable")}</li>
    </ol></section>
    <section class="panel"><div class="panel-hd"><h2>Run evidence</h2></div><div class="ai-section"><dl class="ai-facts">
      <dt>Requested by</dt><dd>Mariya · example operator</dd><dt>Source locale</dt><dd>Bulgarian</dd><dt>Output locales</dt><dd>DE, NL, EL</dd><dt>Run identifier</dt><dd>Example run</dd><dt>Model and host</dt><dd>No runtime evidence in this preview</dd><dt>Usage and cost</dt><dd>Not reported</dd><dt>Customer delivery</dt><dd>No send action in this review</dd>
    </dl></div></section>
  </div>
  <section class="panel"><div class="panel-hd"><h2>Check the fact before the phrasing</h2><span class="sub">Illustrative data</span></div><div class="ai-section ai-grid">
    <div><h2>Bulgarian source</h2><p class="ai-source" lang="bg">Къща с двор в Катунци · €1,245,000 · 196 m² · 3 спални</p><p class="hint">Example source text. The real review must open the approved record and its source URL.</p></div>
    <div><h2>German draft</h2><p class="ai-source" lang="de">Haus mit Garten in Katunzi · €1,245,000 · 196 m² · 3 Schlafzimmer</p>${pending("Language approval missing")}<p class="hint">Preserve the source figures. Language review is a separate human decision.</p></div>
  </div></section>
  <section class="panel"><div class="panel-hd"><h2>Drafts to review</h2></div><div class="ai-row ai-heading"><span>Description</span><span>Language</span><span>Witness</span><span>Action</span></div>
    ${["German", "Dutch", "Greek"].map(language => `<div class="ai-row"><b>Екатерина Константинова-Александрова · house description</b><span>${language}</span>${pending("Not approved")}<button class="btn btn--sm" type="button">Review draft</button></div>`).join("")}
    <div class="foot"><span>Showing 3 of 21 sample drafts</span><button class="btn btn--sm" type="button">Next 3 drafts</button></div>
  </section>
  <div class="ai-states" aria-label="Additional run states">
    <section class="ai-state"><h2>No drafts produced</h2><p>${icon("file",28)} The run has no reviewable output. Open its request and source selection.</p><button class="btn" type="button">Open request</button></section>
    <section class="ai-state"><h2>Run still processing</h2><p role="status">Outputs are not final. Approval controls stay unavailable.</p><button class="btn" type="button" disabled>Open next draft</button></section>
    <section class="ai-state"><h2>Some outputs failed</h2><p>Review completed drafts individually. Failed language rows retain their error and source; the run cannot be marked wholly approved.</p><button class="btn" type="button">Show failed outputs</button></section>
    <section class="ai-state"><h2>Source changed during review</h2><p role="alert">The old draft cannot be approved against the new facts. Reopen the source before requesting a replacement.</p><button class="btn" type="button">Compare source versions</button></section>
    <section class="ai-state"><h2>No drafts match this filter</h2><p>The run still contains outputs in other languages. Clear the filter to see them.</p><button class="btn" type="button">Clear language filter</button></section>
    <section class="ai-state"><h2>Run evidence is unavailable</h2><p>Do not display a successful check without its evidence. Reconnect and reload before continuing review.</p><button class="btn" type="button">Reload evidence</button></section>
  </div>
</div>`;
for (const [name, body] of [["Hermes", hermes], ["HermesRun", run]]) {
  fs.writeFileSync(new URL(`../${name}.dc.html`, import.meta.url), page({ active:"hermes", body, extraCss:CSS, height:0, healthText:"Illustrative workspace" }));
}
console.log("Hermes, HermesRun");
