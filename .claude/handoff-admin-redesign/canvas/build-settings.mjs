import fs from "node:fs";
import { page, icon } from "./shell.mjs";

const CSS = `
    .set-grid { display:grid; grid-template-columns:212px minmax(0,1fr); gap:22px; align-items:start; }
    .set-nav { display:grid; gap:1px; position:sticky; top:0; }
    .set-nav a { display:flex; align-items:center; gap:9px; min-height:34px; padding:7px 11px;
      border-radius:8px; font-size:13px; font-weight:500; color:var(--text-body); }
    .set-nav a:hover { background:var(--stone-100); }
    .set-nav a[data-on] { background:var(--ink-800); color:#fff; }
    .set-nav a[data-on] svg { color:#fff; }
    .set-nav p { margin:12px 11px 4px; font-size:10.5px; font-weight:600; color:var(--text-subtle); }
    .fields { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:16px 20px; padding:16px 20px; }
    .field { display:grid; gap:5px; min-width:0; }
    .field label { font-size:12px; font-weight:600; color:var(--text-body); }
    .field label em { font-style:normal; color:var(--brick-600); }
    .field .in { display:flex; align-items:center; height:38px; padding:0 11px; border:1px solid var(--border-strong);
      border-radius:8px; background:var(--surface); font-size:13px; color:var(--text-strong); }
    .field .in--empty { color:var(--text-subtle); }
    .field .in--area { height:auto; min-height:76px; align-items:flex-start; padding:10px 11px; line-height:1.5; }
    .field .hint { font-size:11.5px; color:var(--text-muted); }
    .full { grid-column:1 / -1; }
    .sw { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px;
      padding:13px 20px; border-top:1px solid var(--border); }
    .sw b { display:block; font-size:13px; font-weight:600; color:var(--text-strong); }
    .sw span { font-size:12px; color:var(--text-muted); }
    .toggle { width:38px; height:22px; border-radius:999px; background:var(--stone-300); position:relative; flex:0 0 auto; }
    .toggle i { position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:999px; background:#fff;
      box-shadow:var(--shadow-xs); }
    .toggle[data-on] { background:var(--success-500); }
    .toggle[data-on] i { left:19px; }
    .savebar { display:flex; align-items:center; gap:12px; padding:12px 20px; border-top:1px solid var(--border);
      background:var(--sunken); }
`;

const BODY = `      <div class="ph">
        <div>
          <h1>Settings</h1>
          <p>Every change here is recorded in the activity log with your name on it.</p>
        </div>
        <div class="ph-actions">
          <span class="pill pill--sand">${icon("clock", 13)}Last changed 3 days ago by Mariya</span>
        </div>
      </div>

      <div class="set-grid">
        <nav class="set-nav">
          <a href="#" data-on="1">${icon("building", 16)}<span>Agency profile</span></a>
          <a href="#">${icon("inbox", 16)}<span>Leads and reply targets</span></a>
          <a href="#">${icon("bell", 16)}<span>Notifications</span></a>
          <a href="#">${icon("board", 16)}<span>Workspace defaults</span></a>
          <a href="#">${icon("languages", 16)}<span>Public site and locales</span></a>
          <p>Account</p>
          <a href="#">${icon("team", 16)}<span>Team and roles</span></a>
          <a href="#">${icon("shield", 16)}<span>Security</span></a>
          <a href="#">${icon("file", 16)}<span>Data and exports</span></a>
        </nav>

        <div style="display:grid; gap:16px">
          <section class="panel">
            <div class="panel-hd">
              <div><h2>Agency profile</h2><p class="sub">How the agency introduces itself and which channels replies come from.</p></div>
              <span class="pill pill--warn"><i></i>2 required fields empty</span>
            </div>
            <div class="fields">
              <div class="field">
                <label for="f1">Agency name <em>*</em></label>
                <span class="in" id="f1">MS Realty</span>
              </div>
              <div class="field">
                <label for="f2">Phone customers see <em>*</em></label>
                <span class="in in--empty" id="f2">Not set — shown on every listing page</span>
              </div>
              <div class="field">
                <label for="f3">Reply-from email <em>*</em></label>
                <span class="in in--empty" id="f3">Not set — replies cannot be delivered</span>
              </div>
              <div class="field">
                <label for="f4">WhatsApp number</label>
                <span class="in in--empty" id="f4">Connect WhatsApp Business first</span>
                <span class="hint">Filled automatically once the channel is connected.</span>
              </div>
              <div class="field full">
                <label for="f5">Offices</label>
                <span class="in in--area" id="f5">Sandanski, ul. Makedonia 22</span>
                <span class="hint">One office per line. Each becomes a contact card on the public site.</span>
              </div>
            </div>
            <div class="savebar">
              <button class="btn btn--sm btn--primary" type="button">${icon("check", 14)}<span>Save changes</span></button>
              <button class="btn btn--sm btn--ghost" type="button">Discard</button>
              <span style="margin-left:auto; font-size:12px" class="muted">Saved changes are visible on the public site within a minute.</span>
            </div>
          </section>

          <section class="panel">
            <div class="panel-hd">
              <div><h2>Reply targets</h2><p class="sub">When a lead becomes overdue and who is told.</p></div>
            </div>
            <div class="fields">
              <div class="field">
                <label for="f6">First reply due within</label>
                <span class="in" id="f6">4 hours</span>
              </div>
              <div class="field">
                <label for="f7">Escalate to the manager after</label>
                <span class="in" id="f7">24 hours</span>
              </div>
            </div>
            <div class="sw">
              <span class="toggle" data-on="1"><i></i></span>
              <span><b>Require a named approval before any reply is sent</b>
                <span>Hermes drafts stay internal until a person approves them. Turning this off is recorded.</span></span>
              <span class="pill pill--ok"><i></i>Recommended</span>
            </div>
            <div class="sw">
              <span class="toggle" data-on="1"><i></i></span>
              <span><b>Warn before a listing is published without approved translations</b>
                <span>Applies to DE, NL, RU, EL and HE.</span></span>
              <span class="pill pill--ok"><i></i>Recommended</span>
            </div>
            <div class="sw">
              <span class="toggle"><i></i></span>
              <span><b>Let brokers reassign their own leads</b>
                <span>Off means only the owner and managers can reassign.</span></span>
              <span></span>
            </div>
            <div class="savebar">
              <button class="btn btn--sm btn--primary" type="button">${icon("check", 14)}<span>Save changes</span></button>
              <button class="btn btn--sm btn--ghost" type="button">Discard</button>
            </div>
          </section>
        </div>
      </div>`;

fs.writeFileSync(new URL("./Settings.dc.html", import.meta.url), page({
  active: "settings", body: BODY, extraCss: CSS, height: 1080,
}));
console.log("Settings.dc.html");
