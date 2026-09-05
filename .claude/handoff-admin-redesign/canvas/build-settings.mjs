import fs from "node:fs";
import { page, icon, subnav } from "./shell.mjs";
import { WORKSPACE_SETTINGS_DEFAULTS as defaults, WORKSPACE_ADMIN_LOCALES, WORKSPACE_TIMEZONES, WORKSPACE_DATE_FORMATS } from "../../../production/lib/workspace-settings.mjs";
const CSS=`
  .ws { display:grid; gap:20px; }
  .ws .ph { margin:0; }
  .ws-grid { display:grid; grid-template-columns:minmax(0,2fr) minmax(0,1fr); gap:20px; align-items:start; }
  .ws-form { display:grid; gap:16px; padding:20px; border-top:1px solid var(--joint); min-width:0; }
  .ws-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; align-items:start; }
  .ws :is(input,select,textarea).in { width:100%; font:inherit; color:var(--text-body); background:var(--tile-glaze); }
  .ws textarea.in { min-height:96px; resize:vertical; }
  .ws :is(button,input,select,textarea,a):focus-visible { outline:2px solid var(--spring-700); outline-offset:2px; }
  .ws button:disabled { opacity:.5; cursor:not-allowed; }
  .ws-check { display:flex; align-items:flex-start; gap:12px; }
  .ws-check input { flex:0 0 auto; width:16px; height:16px; accent-color:var(--spring-700); }
  .ws-facts { display:grid; grid-template-columns:132px minmax(0,1fr); gap:12px 16px; margin:0; }
  .ws-facts dt { color:var(--text-muted); }
  .ws-facts dd { margin:0; min-width:0; overflow-wrap:anywhere; }
  .ws-actions { display:flex; gap:12px; align-items:center; }
  .ws-states { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }
  .ws-state { display:grid; align-content:start; gap:12px; padding:20px 0; border-top:1px solid var(--joint); min-width:0; }
  .ws-state h2 { font-size:16px; }
  .ws-state .btn { justify-self:start; }
`;
const body=`<div class="ws">
  <div class="ph"><div><h1>Settings</h1><p>Review and save one section at a time. The saved revision names the person who changed it.</p></div></div>
  ${subnav([["Workspace","gear",true],["Team and roles","team",false],["Security","shield",false],["Data and exports","download",false]])}
  <p class="muted">Design preview · schema defaults and illustrative edit states. No live workspace settings have been loaded.</p>
  <div class="ws-grid">
    <section class="panel"><div class="panel-hd"><h2>Agency profile</h2><span class="wit wit--none">Changes not saved</span></div><form class="ws-form">
      <div class="ws-fields"><div class="field"><label for="agency-name">Agency name</label><input class="in" id="agency-name" value="${defaults.agency.name}" maxlength="120" required></div><div class="field"><label for="agency-phone">Public phone</label><input class="in" id="agency-phone" type="tel" placeholder="Not supplied"></div><div class="field"><label for="agency-email">Agency email</label><input class="in" id="agency-email" type="email" placeholder="Not supplied"></div><div class="field"><label for="agency-whatsapp">WhatsApp number</label><input class="in" id="agency-whatsapp" type="tel" placeholder="Not supplied"></div><div class="field"><label for="agency-viber">Viber number</label><input class="in" id="agency-viber" type="tel" placeholder="Not supplied"></div></div>
      <div class="field"><label for="agency-offices">Offices</label><textarea class="in in--area" id="agency-offices" aria-describedby="offices-help">${defaults.agency.offices.join("\n")}</textarea><p class="hint" id="offices-help">One office per line, up to 10. Use the agency’s approved contact details.</p></div>
      <div class="ws-actions"><button class="btn btn--accent" type="button">Save agency profile</button><button class="btn" type="button">Discard edits</button></div>
    </form></section>
    <section class="panel"><div class="panel-hd"><h2>What saving means</h2></div><div class="ws-form">
      <p>The response must identify the section and its saved revision. Until that response arrives, the edits are unconfirmed.</p><p>Contact fields do not connect a messaging account. Delivery access is reviewed in Connections.</p>
      <dl class="ws-facts"><dt>Example receipt</dt><dd>Agency profile · revision 3</dd><dt>Changed by</dt><dd><span class="wit">Mariya · 1 Sep, 09:10 · example</span></dd><dt>Changed fields</dt><dd>Agency name and offices</dd></dl>
      <p class="hint">This receipt is illustrative. A saved setting is not a verified public deployment.</p>
    </div></section>
  </div>
  <section class="panel"><div class="panel-hd"><h2>Lead reply targets</h2><span class="sub">Defaults from the settings schema</span></div><form class="ws-form">
    <div class="ws-fields"><div class="field"><label for="reply-minutes">First reply target, minutes</label><input class="in" id="reply-minutes" type="number" min="5" max="1440" step="1" value="${defaults.leads.first_reply_target_minutes}"></div><div class="field"><label for="escalation-minutes">Manager escalation, minutes</label><input class="in" id="escalation-minutes" type="number" min="5" max="10080" step="1" value="${defaults.leads.manager_escalation_minutes}" aria-describedby="escalation-help"><p class="hint" id="escalation-help">Escalation must be later than the first reply target.</p></div></div>
    <p>Defaults are 15 minutes for the first reply and 60 minutes for manager escalation. Changing a deadline does not answer the lead.</p>
    <button class="btn" type="button">Save reply targets</button>
  </form></section>
  <div class="ws-grid">
    <section class="panel"><div class="panel-hd"><h2>Workspace defaults</h2></div><form class="ws-form"><div class="ws-fields">
      <div class="field"><label for="workspace-language">Default workspace language</label><select class="in" id="workspace-language">${WORKSPACE_ADMIN_LOCALES.map(code=>`<option value="${code}"${code===defaults.workspace.default_locale?" selected":""}>${{bg:"Български",ru:"Русский",en:"English"}[code]}</option>`).join("")}</select></div>
      <div class="field"><label for="workspace-timezone">Timezone</label><select class="in" id="workspace-timezone">${WORKSPACE_TIMEZONES.map(zone=>`<option${zone===defaults.workspace.timezone?" selected":""}>${zone}</option>`).join("")}</select></div>
      <div class="field"><label for="workspace-dates">Date format</label><select class="in" id="workspace-dates">${WORKSPACE_DATE_FORMATS.map(format=>`<option${format===defaults.workspace.date_format?" selected":""}>${format==="locale"?"Use language format":format}</option>`).join("")}</select></div>
    </div><button class="btn" type="button">Save workspace defaults</button></form></section>
    <section class="panel"><div class="panel-hd"><h2>Approval boundaries</h2></div><div class="ws-form"><p>Hermes prepares drafts. Customer replies require human review.</p><p>Bulgarian remains the public source locale. Each public translation needs human approval before indexing.</p><p>These boundaries cannot be switched off in workspace settings.</p><button class="btn" type="button">Open approval queues</button></div></section>
  </div>
  <div class="ws-grid">
    <section class="panel"><div class="panel-hd"><h2>Notifications</h2></div><form class="ws-form"><label class="ws-check"><input type="checkbox"><span>Enable the daily digest</span></label><div class="field"><label for="digest-recipients">Digest recipients</label><textarea class="in in--area" id="digest-recipients" placeholder="Work email addresses, one per line" aria-describedby="digest-help"></textarea><p class="hint" id="digest-help">Up to 10 recipients. An enabled digest needs at least one valid address.</p></div><label class="ws-check"><input type="checkbox"><span>Enable instant new-lead alerts</span></label><button class="btn" type="button">Save notification preferences</button></form></section>
    <section class="panel"><div class="panel-hd"><h2>Public site defaults</h2></div><form class="ws-form"><div class="field"><label for="featured-count">Featured listing count</label><input class="in" id="featured-count" type="number" min="0" max="24" value="${defaults.public_site.featured_listings_count}"></div><label class="ws-check"><input type="checkbox" checked><span>Show “Price on request” where applicable</span></label><label class="ws-check"><input type="checkbox" checked><span>Enable saved-search alerts</span></label><p class="hint">These settings do not verify prices, approve translations or authorise a delivery.</p><button class="btn" type="button">Save public site defaults</button></form></section>
  </div>
  <div class="ws-states" aria-label="Additional settings states">
    <section class="ws-state"><h2>No saved profile yet</h2><p>${icon("building",28)} Defaults can fill the form, but have no saved witness. Review the agency’s details before saving.</p><button class="btn" type="button">Review agency profile</button></section>
    <section class="ws-state"><h2>Save in progress</h2><p role="status">Waiting for the saved revision. Keep the entered values visible.</p><button class="btn" type="button" disabled>Saving profile…</button></section>
    <section class="ws-state"><h2>Escalation time is invalid</h2><p class="hint--error" role="alert">Manager escalation must come after the first reply target. Other values remain unchanged.</p><button class="btn" type="button">Review reply targets</button></section>
    <section class="ws-state"><h2>One section saved</h2><p>The agency profile has a confirmed receipt. Unsaved notification edits remain separate.</p><span class="wit wit--none">Notification edits not saved</span></section>
    <section class="ws-state"><h2>Too many offices</h2><p>Keep the entered list visible and identify the 10-office limit. Never silently discard extra addresses.</p><button class="btn" type="button">Review office list</button></section>
    <section class="ws-state"><h2>Settings service unavailable</h2><p>The save is not confirmed. Reconnect and reload the saved revision before deciding whether to retry.</p><button class="btn" type="button" disabled>Save changes</button></section>
  </div>
</div>`;
fs.writeFileSync(new URL("./Settings.dc.html",import.meta.url),page({active:"settings",body,extraCss:CSS,height:0,healthText:"Illustrative workspace"}));
console.log("Settings.dc.html");
