import fs from "node:fs";
import assert from "node:assert/strict";
import { page, icon, subnav } from "../shell.mjs";
import { OPERATOR_PROVIDER_COVERAGE } from "../../../../production/lib/operator-provider-catalog.mjs";
const labels = {
  google:["Google Workspace","Approved email and viewing-calendar sync"],
  whatsapp:["WhatsApp Business","Approved replies and verified enquiries"],
  facebook:["Facebook Page","Separately approved social posts"],
  instagram:["Instagram","Separately approved photo posts"],
  ai:["OpenRouter","Guarded owner plans with Hermes"],
  google_drive:["Google Drive","No supported workspace workflow yet"],
  github:["GitHub","No supported workspace workflow yet"],
  viber:["Viber","No supported owner sign-in flow"],
  cloudflare:["Cloudflare","Infrastructure managed outside connections"],
  neon:["Neon","Database managed outside connections"],
};
for(const {provider} of OPERATOR_PROVIDER_COVERAGE) assert(labels[provider],`Describe provider ${provider}`);
const enabled=OPERATOR_PROVIDER_COVERAGE.filter(row=>row.enabled);
const unavailable=OPERATOR_PROVIDER_COVERAGE.filter(row=>row.state==="disabled");
const managed=OPERATOR_PROVIDER_COVERAGE.filter(row=>row.state==="managed");
const nav=on=>subnav([["Connections","link",false],["Catalogue","puzzle",on==="catalogue"],["Automations","bolt",on==="automations"]]);
const CSS=`
  .rx { display:grid; gap:20px; }
  .rx .ph { margin:0; }
  .rx-grid { display:grid; grid-template-columns:minmax(0,2fr) minmax(0,1fr); gap:20px; align-items:start; }
  .rx-section { padding:20px; min-width:0; border-top:1px solid var(--joint); }
  .rx-section h2 { font-size:16px; margin-bottom:12px; }
  .rx-section p + p { margin-top:8px; }
  .rx-row { display:grid; grid-template-columns:180px minmax(0,1fr) 160px 108px; gap:16px; align-items:center; height:var(--row); padding:0 20px; border-top:1px solid var(--joint); }
  .rx-row > * { min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .rx-row:hover { background:var(--tile); }
  .rx-row .btn { justify-self:end; }
  .rx-heading { background:var(--tile-deep); font-weight:600; }
  .rx-form { display:grid; gap:16px; }
  .rx .in { width:100%; font:inherit; color:var(--text-body); background:var(--tile-glaze); }
  .rx textarea.in { min-height:96px; resize:vertical; }
  .rx :is(button,input,textarea,select,a):focus-visible { outline:2px solid var(--spring-700); outline-offset:2px; }
  .rx button:disabled { opacity:.5; cursor:not-allowed; }
  .rx-check { display:flex; align-items:flex-start; gap:12px; }
  .rx-check input { width:16px; height:16px; flex:0 0 auto; accent-color:var(--spring-700); }
  .rx-facts { display:grid; grid-template-columns:132px minmax(0,1fr); gap:12px 16px; margin:0; }
  .rx-facts dt { color:var(--text-muted); }
  .rx-facts dd { margin:0; min-width:0; overflow-wrap:anywhere; }
  .rx-states { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }
  .rx-state { display:grid; align-content:start; gap:12px; min-width:0; padding:20px 0; border-top:1px solid var(--joint); }
  .rx-state h2 { font-size:16px; }
  .rx-state .btn { justify-self:start; }
  .rx-toolbar { display:flex; align-items:end; gap:16px; padding:16px 20px; }
  .rx-toolbar .field { flex:1; }
`;
const catalogue=`<div class="rx">
  <div class="ph"><div><h1>Integration catalogue</h1><p>Choose the service for the work you need. Review permissions before connecting an account.</p></div><div class="ph-actions"><button class="btn btn--accent" type="button">Review Google connection</button></div></div>
  ${nav("catalogue")}
  <p class="muted">Availability is generated from the product catalogue. Account states are not loaded in this design preview.</p>
  <section class="panel"><div class="panel-hd"><h2>Supported owner connections</h2><span class="sub">${enabled.length} services</span></div>
    <div class="rx-toolbar"><div class="field"><label for="service-search">Find a service</label><input class="in" id="service-search" type="search" placeholder="Service or workflow"></div><button class="btn" type="button">Search catalogue</button></div>
    <div class="rx-row rx-heading"><span>Service</span><span>What it supports</span><span>Authorisation</span><span>Next step</span></div>
    ${enabled.map(row=>`<div class="rx-row"><b>${labels[row.provider][0]}</b><span title="${labels[row.provider][1]}">${labels[row.provider][1]}</span><span>${row.provider==="whatsapp"?"Provider sign-up":"Provider sign-in"}</span><button class="btn btn--sm" type="button">Review access</button></div>`).join("")}
    <div class="foot"><span>All ${enabled.length} supported services shown</span><button class="btn btn--sm" type="button" disabled>Next page</button></div>
  </section>
  <div class="rx-grid">
    <section class="panel"><div class="panel-hd"><h2>Review access · Google Workspace</h2><span class="wit wit--none">Owner approval needed</span></div><div class="rx-section rx-form">
      <dl class="rx-facts"><dt>Identity</dt><dd>Identify the Google account and its email address.</dd><dt>Email</dt><dd>Send approved email from the connected account.</dd><dt>Calendar</dt><dd>Manage events in owned calendars and read availability.</dd><dt>Approval</dt><dd>The owner authorises account access. Customer-facing actions keep their own review.</dd></dl>
      <p>The account and permissions shown by Google must match the intended agency account before you continue.</p>
    </div></section>
    <section class="panel"><div class="panel-hd"><h2>Before sign-in is available</h2></div><div class="rx-section rx-form"><p>The service must be configured for this workspace. Missing setup has a recovery explanation, not an active sign-in button.</p><p>After sign-in, the connection needs a verified account and time. Until then, it stays pending.</p><p class="hint">This form never asks you to paste a provider password or API key.</p></div></section>
  </div>
  <section class="panel"><div class="panel-hd"><h2>Unavailable owner connections</h2><span class="sub">${unavailable.length} named gaps</span></div>
    ${unavailable.map(row=>`<div class="rx-row"><b>${labels[row.provider][0]}</b><span>${labels[row.provider][1]}</span><span>Unavailable</span><button class="btn btn--sm" type="button" disabled>Connect</button></div>`).join("")}
  </section>
  <section class="panel"><div class="panel-hd"><h2>Managed outside this catalogue</h2><span class="sub">${managed.length} services</span></div>
    ${managed.map(row=>`<div class="rx-row"><b>${labels[row.provider][0]}</b><span>${labels[row.provider][1]}</span><span>Health not loaded</span><button class="btn btn--sm" type="button">View report</button></div>`).join("")}
  </section>
  <div class="rx-states" aria-label="Additional catalogue states">
    <section class="rx-state"><h2>No matching service</h2><p>${icon("search",28)} Clear the search to see supported connections. An absent service is not available through this workspace.</p><button class="btn" type="button">Clear search</button></section>
    <section class="rx-state"><h2>Checking setup</h2><p role="status">Permissions and service availability are loading.</p><button class="btn" type="button" disabled>Checking connection…</button></section>
    <section class="rx-state"><h2>Catalogue could not load</h2><p role="alert">No account change is available until the service and its permissions can be read.</p><button class="btn" type="button">Reload catalogue</button></section>
    <section class="rx-state"><h2>Account status unavailable</h2><p>The list may be readable while the connection store is unavailable. Do not turn that state into “Not connected”.</p><button class="btn" type="button">Refresh account status</button></section>
    <section class="rx-state"><h2>Large result set</h2><p>Keep one service per row. Search and page controls preserve the selected service and permission review.</p><button class="btn" type="button">Return to selected service</button></section>
    <section class="rx-state"><h2>Offline catalogue</h2><p>Read the last loaded permissions. Refresh availability after reconnecting before starting sign-in.</p><button class="btn" type="button" disabled>Start sign-in</button></section>
  </div>
</div>`;

// Draft PR #173 supports two rule types and manual runs. This canvas is its
// review target, not evidence that the backend is integrated or deployed.
const automations=`<div class="rx">
  <div class="ph"><div><h1>Automations</h1><p>Review a rule, then authorise one manual run. Enabling a rule does not schedule it.</p></div></div>
  ${nav("automations")}
  <p class="muted">Illustrative review target · backend integration is pending. Rules, runs and owner confirmations below are sample states.</p>
  <section class="panel"><div class="panel-hd"><h2>Review a saved-search run</h2><span class="wit wit--none">Owner confirmation needed</span></div>
    <div class="rx-grid"><div class="rx-section rx-form"><dl class="rx-facts"><dt>Rule</dt><dd>Saved-search alerts</dd><dt>Trigger</dt><dd>Manual · one run</dd><dt>Effect</dt><dd>Process due alerts through the existing delivery workflow. This can reach customers.</dd><dt>Required review</dt><dd>Check due work, recipients, consent and delivery approval before authorising this run.</dd><dt>Rule status</dt><dd>Enabled · example, not a live setting</dd></dl><button class="btn" type="button">Review due alerts</button></div>
    <form class="rx-section rx-form"><h2>Confirm this run</h2><p>One owner confirmation applies to this rule and this run request. It cannot bypass a record’s approval.</p><label class="rx-check"><input type="checkbox"><span>I, Mariya, have reviewed the due alerts and authorise this manual run.</span></label><button class="btn btn--accent" type="button">Run saved-search alerts</button><p class="hint">Example only. A production run needs a durable receipt before it can be reported as complete.</p></form></div>
  </section>
  <section class="panel"><div class="panel-hd"><h2>Rules</h2><span class="sub">2 rule types in the review target</span></div><div class="rx-row rx-heading"><span>Rule</span><span>Scope</span><span>Sample state</span><span>Action</span></div>
    <div class="rx-row"><b>Saved-search alerts</b><span>Process due customer alerts</span><span>Enabled · manual</span><button class="btn btn--sm" type="button">Review rule</button></div>
    <div class="rx-row"><b>Listing publication</b><span>Process due, approved publication schedules</span><span>Disabled</span><button class="btn btn--sm" type="button">Review rule</button></div>
    <div class="foot"><span>No recurring schedule is configured by these controls.</span><button class="btn btn--sm" type="button">Open run history</button></div>
  </section>
  <div class="rx-grid">
    <section class="panel"><div class="panel-hd"><h2>Rule changes need their own confirmation</h2></div><form class="rx-section rx-form"><div class="field"><label for="rule-name">Rule name</label><input class="in" id="rule-name" value="Saved-search alerts"></div><div class="field"><label for="rule-purpose">Description</label><textarea class="in in--area" id="rule-purpose">Review and run alerts that are due for active saved searches.</textarea></div><dl class="rx-facts"><dt>Execution</dt><dd>Manual only</dd><dt>Change</dt><dd>Disable saved-search alerts</dd></dl><label class="rx-check"><input type="checkbox"><span>I, Mariya, confirm disabling this rule. Future manual runs must be refused.</span></label><button class="btn" type="button">Disable this rule</button></form></section>
    <section class="panel"><div class="panel-hd"><h2>Read the outcome, not just the status</h2></div><div class="rx-section rx-form"><p>A completed run can include record-level failures. Open the result summary and affected records before deciding what is finished.</p><dl class="rx-facts"><dt>Requested by</dt><dd>Mariya · example owner</dd><dt>Run status</dt><dd>Completed · illustrative receipt</dd><dt>Result</dt><dd>One record needs attention</dd><dt>Witness</dt><dd><span class="wit">Mariya · 1 Sep, 09:10 · example</span></dd></dl><button class="btn" type="button">Open affected record</button><p class="hint">The witness records run authorisation. It does not certify delivery or listing correctness.</p></div></section>
  </div>
  <div class="rx-states" aria-label="Additional automation states">
    <section class="rx-state"><h2>No rules saved</h2><p>${icon("bolt",28)} Create a rule from a supported type. It starts disabled until the owner confirms enabling it.</p><button class="btn" type="button">Review a new rule</button></section>
    <section class="rx-state"><h2>Run in progress</h2><p role="status">The request is running or its outcome is uncertain. Check status before starting another run.</p><button class="btn" type="button" disabled>Run in progress…</button></section>
    <section class="rx-state"><h2>Run failed</h2><p role="alert">Open the failure and result summary. Do not assume no external action occurred before failure.</p><button class="btn" type="button">Open failure details</button></section>
    <section class="rx-state"><h2>Rule changed while open</h2><p>The version you reviewed is no longer current. Reload it and confirm the scope before submitting.</p><button class="btn" type="button">Reload rule</button></section>
    <section class="rx-state"><h2>Many past runs</h2><div class="field"><label for="run-filter">Find a run</label><input class="in" id="run-filter" type="search" placeholder="Rule or requesting person"></div><p>Keep the filter and page when returning from a receipt.</p></section>
    <section class="rx-state"><h2>Service unavailable</h2><p>The rule store or connection cannot be read. No change or run is confirmed.</p><button class="btn" type="button" disabled>Run saved-search alerts</button></section>
  </div>
</div>`;
for(const [name,body] of [["IntegrationCatalogue",catalogue],["Automations",automations]]) {
  fs.writeFileSync(new URL(`../${name}.dc.html`,import.meta.url),page({active:"integrations",body,extraCss:CSS,height:0,healthText:"Illustrative workspace"}));
}
console.log("IntegrationCatalogue, Automations");
