import fs from "node:fs";
import assert from "node:assert/strict";
import { page, icon, subnav } from "./shell.mjs";
import { OPERATOR_PROVIDER_COVERAGE } from "../../../production/lib/operator-provider-catalog.mjs";

const providers = OPERATOR_PROVIDER_COVERAGE.filter(row => row.enabled);
const sample = {
  google: ["Google Workspace", "Email and viewing calendar", "Needs reauthorisation", "Review"],
  whatsapp: ["WhatsApp Business", "Approved replies and enquiries", "Not connected", "Review"],
  facebook: ["Facebook Page", "Approved social posts", "Connected", "Manage"],
  instagram: ["Instagram", "Approved photo posts", "Needs setup", "Details"],
  ai: ["OpenRouter", "Guarded owner plans", "Not connected", "Review"],
};
for (const provider of providers) assert(sample[provider.provider], `Add a design state for ${provider.provider}`);
const CSS = `
  .cx { display:grid; gap:20px; }
  .cx .ph { margin:0; }
  .cx-grid { display:grid; grid-template-columns:minmax(0,2fr) minmax(0,1fr); gap:20px; align-items:start; }
  .cx-section { min-width:0; padding:20px; border-top:1px solid var(--joint); }
  .cx-section h2 { font-size:16px; margin-bottom:12px; }
  .cx-section p + p { margin-top:8px; }
  .cx-row { display:grid; grid-template-columns:180px minmax(0,1fr) 200px 100px; gap:16px; align-items:center; height:var(--row); padding:0 20px; border-top:1px solid var(--joint); }
  .cx-row > * { min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cx-row:hover { background:var(--tile); }
  .cx-row .btn { justify-self:end; }
  .cx-heading { background:var(--tile-deep); font-weight:600; }
  .cx-facts { display:grid; grid-template-columns:132px minmax(0,1fr); gap:12px 16px; margin:0; }
  .cx-facts dt { color:var(--text-muted); }
  .cx-facts dd { margin:0; min-width:0; overflow-wrap:anywhere; }
  .cx-form { display:grid; gap:16px; }
  .cx .in { width:100%; font:inherit; background:var(--tile-glaze); color:var(--text-body); }
  .cx input[type=checkbox] { accent-color:var(--spring-700); width:16px; height:16px; }
  .cx :is(button,input,textarea,select,a):focus-visible { outline:2px solid var(--spring-700); outline-offset:2px; }
  .cx button:disabled { opacity:.5; cursor:not-allowed; }
  .cx-states { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }
  .cx-state { display:grid; align-content:start; gap:12px; min-width:0; padding:20px 0; border-top:1px solid var(--joint); }
  .cx-state h2 { font-size:16px; }
  .cx-state .btn { justify-self:start; }
  .cx-check { display:flex; align-items:flex-start; gap:12px; }
  .cx-check input { flex:0 0 auto; }
`;
const body = `<div class="cx">
  <div class="ph"><div><h1>Connections</h1><p>See the account, its permissions and the work that depends on it before you authorise a service.</p></div></div>
  ${subnav([["Connections","link",true],["Catalogue","puzzle",false],["Automations","bolt",false]])}
  <p class="muted">Illustrative workspace · connection states and receipts below are examples. Service availability comes from the product catalogue.</p>
  <section class="panel"><div class="panel-hd"><h2>Google Workspace needs attention</h2><span class="wit wit--none">Account check required</span></div>
    <div class="cx-grid"><div class="cx-section cx-form">
      <p>Example: email delivery and viewing-calendar sync are paused until the owner completes Google authorisation.</p>
      <dl class="cx-facts"><dt>Account</dt><dd>Agency account · verify during sign-in</dd><dt>Permissions</dt><dd>Identify the account; send email; manage events in owned calendars; read calendar availability.</dd><dt>After reconnecting</dt><dd>Check the account and a fresh verification result. Review each pending delivery in its own record.</dd></dl>
      <button class="btn btn--accent" type="button">Continue to Google</button>
    </div><div class="cx-section"><h2>Owner authorisation</h2><p>Google shows the account and requested permissions. Return here to confirm the result.</p><p>A connection supplies access. It does not approve a customer message, a social post or a listing.</p><p class="hint">Only the unrestricted workspace owner can manage these connections.</p></div></div>
  </section>
  <section class="panel"><div class="panel-hd"><h2>Owner connections</h2><span class="sub">${providers.length} supported services</span></div>
    <div class="cx-row cx-heading"><span>Service</span><span>Work it supports</span><span>Sample state</span><span>Action</span></div>
    ${providers.map(({provider})=>{const [name, work, state, action]=sample[provider];return `<div class="cx-row"><b>${name}</b><span>${work}</span><span>${state}</span><button class="btn btn--sm" type="button">${action}</button></div>`;}).join("")}
    <div class="foot"><span>Account permissions are reviewed per connection.</span><button class="btn btn--sm" type="button">Refresh status</button></div>
  </section>
  <div class="cx-grid">
    <section class="panel"><div class="panel-hd"><h2>A verified connection names its witness</h2></div><div class="cx-section cx-form">
      <dl class="cx-facts"><dt>Service</dt><dd>Facebook Page</dd><dt>Account</dt><dd>Example agency page</dd><dt>Access granted</dt><dd>List pages and manage page posts</dd><dt>Authorised by</dt><dd><span class="wit">Mariya · 1 Sep, 09:10 · example</span></dd><dt>Last verified</dt><dd>1 Sep, 09:11 · illustrative receipt</dd></dl>
      <p>The filled witness belongs to this permission grant. A post still needs its own approval.</p>
    </div></section>
    <section class="panel"><div class="panel-hd"><h2>Managed services</h2></div><div class="cx-section cx-form">
      <div><b>Cloudflare</b><p>Infrastructure is managed outside owner connections.</p></div><div><b>Neon</b><p>Database access is managed outside owner connections.</p></div><div><span class="wit wit--none">Live checks not loaded</span><p>Open the service report for runtime evidence. This screen cannot infer health from a provider name.</p></div>
      <button class="btn" type="button">Open service reports</button>
    </div></section>
  </div>
  <section class="panel"><div class="panel-hd"><h2>Review before disconnecting</h2><span class="sub">Confirmation example</span></div><div class="cx-section cx-grid">
    <div><h2>Facebook Page</h2><p>Future posts cannot use this connection. Previously published posts remain with the provider.</p><p>The result must say whether provider access was revoked. If it was not, remove the grant in the provider account as well.</p></div>
    <form class="cx-form"><div class="field"><label for="disconnect-reason">Reason</label><input class="in" id="disconnect-reason" value="The agency is changing its publishing account."></div><label class="cx-check"><input type="checkbox"><span>I, Mariya, confirm removal of this workspace connection.</span></label><button class="btn btn--danger" type="button">Disconnect Facebook Page</button></form>
  </div></section>
  <div class="cx-states" aria-label="Additional connection states">
    <section class="cx-state"><h2>No connected accounts</h2><p>${icon("link",28)} Select a supported service and review what it can access.</p><button class="btn" type="button">Browse catalogue</button></section>
    <section class="cx-state"><h2>Authorisation in progress</h2><p role="status">Waiting for the provider. The connection is not ready until the account check returns.</p><button class="btn" type="button" disabled>Waiting for authorisation…</button></section>
    <section class="cx-state"><h2>The provider refused access</h2><p role="alert">No new account was connected. Review the selected account and permissions before trying again.</p><button class="btn" type="button">Review permissions</button></section>
    <section class="cx-state"><h2>Some statuses are unavailable</h2><p>Keep confirmed results visible with their verification times. Show unavailable services separately.</p><button class="btn" type="button">Refresh unavailable services</button></section>
    <section class="cx-state"><h2>Many connection events</h2><div class="field"><label for="connection-filter">Find an event</label><input class="in" type="search" id="connection-filter" placeholder="Service, account or person"></div><p>Filter the event history and page through results. The authorisation witness stays with its event.</p></section>
    <section class="cx-state"><h2>Connection lost</h2><p>Account changes are unavailable offline. Reconnect and refresh the current state before authorising or removing access.</p><button class="btn" type="button" disabled>Change connection</button></section>
  </div>
</div>`;
fs.writeFileSync(new URL("./Integrations.dc.html", import.meta.url),page({active:"integrations",body,extraCss:CSS,height:0,healthText:"Illustrative workspace"}));
console.log("Integrations.dc.html");
