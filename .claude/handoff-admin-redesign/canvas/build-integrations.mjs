import fs from "node:fs";
import { page, icon } from "./shell.mjs";

const CSS = `
    .int-grid { display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:20px; align-items:start; }
    .grp-hd { display:flex; align-items:baseline; gap:12px; padding:12px 16px 12px; }
    .grp-hd h2 { font-size:13px; font-weight:600; }
    .grp-hd p { font-size:13px; color:var(--text-muted); }
    .prov { display:grid; grid-template-columns:38px minmax(0,1fr) 214px 124px; align-items:center;
      column-gap:16px; padding:12px 16px; border-top:1px solid var(--border); }
    .prov:hover { background:var(--tile); }
    .prov-logo { width:34px; height:34px; border-radius:var(--r-panel); display:grid; place-items:center;
      font-size:11px; font-weight:700; letter-spacing:.02em; }
    .prov-name { display:grid; gap:4px; min-width:0; }
    .prov-name b { font-size:13px; font-weight:600; color:var(--text-strong); }
    .prov-name span { font-size:13px; color:var(--text-muted); }
    .prov-state { display:grid; gap:4px; }
    .prov-state small { font-size:11px; color:var(--text-muted); }
    .prov-act { display:flex; justify-content:flex-end; }
    .req { display:grid; grid-template-columns:auto minmax(0,1fr); gap:8px; align-items:start;
      padding:12px 16px; border-top:1px solid var(--border); }
    .req code { font-family:var(--font-mono); font-size:11px; color:var(--text-strong);
      background:var(--tile-deep); border-radius:var(--r-edge); padding:4px 4px; }
    .req p { font-size:13px; color:var(--text-muted); margin-top:4px; }
    .banner { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px;
      padding:12px 16px; border-radius:var(--r-panel); background:var(--warning-50); border:1px solid #EFDDB6;
      color:var(--warning-700); margin-bottom:16px; }
    .banner b { display:block; font-size:13px; font-weight:600; }
    .banner span { font-size:13px; }
`;

function prov({ logo, bg, fg, name, powers, state, tone, note, action, primary }) {
  return `          <div class="prov">
            <span class="prov-logo" style="background:${bg}; color:${fg}">${logo}</span>
            <span class="prov-name"><b>${name}</b><span>${powers}</span></span>
            <span class="prov-state"><span class="pill pill--${tone}" style="justify-self:start"><i></i>${state}</span><small>${note}</small></span>
            <span class="prov-act"><button class="btn btn--sm${primary ? " btn--primary" : ""}" type="button">${action}</button></span>
          </div>`;
}

const BODY = `      <div class="ph">
        <div>
          <h1>Connected services</h1>
          <p>What each connection powers, and what it is currently holding up.</p>
        </div>
        <div class="ph-actions">
          <button class="btn" type="button">${icon("list", 15)}<span>Connection log</span></button>
        </div>
      </div>

      <div class="banner">
        ${icon("alert", 18)}
        <span><b>Two connections are holding work back.</b>
          Google Workspace needs reauthorising before replies can be delivered, and Hermes drafting is off until its two secrets are set.</span>
        <button class="btn btn--sm" type="button">Fix both</button>
      </div>

      <div class="int-grid">
        <div style="display:grid; gap:16px">
          <section class="panel">
            <div class="grp-hd"><h2>Talking to customers</h2><p>Channels a reply can leave through.</p></div>
${prov({ logo: "WA", bg: "var(--success-50)", fg: "var(--success-600)", name: "WhatsApp Business",
  powers: "Buyer replies · viewing confirmations · inbound enquiries", state: "Not connected", tone: "sand",
  note: "Replies queue for manual sending", action: "Connect", primary: true })}
${prov({ logo: "GW", bg: "var(--warning-50)", fg: "var(--warning-700)", name: "Google Workspace",
  powers: "Approved email delivery · viewing calendar sync", state: "Reauthorise", tone: "warn",
  note: "Token expired 28 Aug", action: "Reauthorise", primary: true })}
${prov({ logo: "VB", bg: "var(--tile-deep)", fg: "var(--marble-600)", name: "Viber",
  powers: "Bulgarian buyer replies", state: "Unavailable", tone: "sand",
  note: "Token-only API, no owner sign-in yet", action: "Read why" })}
          </section>

          <section class="panel">
            <div class="grp-hd"><h2>Publishing</h2><p>Where an approved listing can be pushed.</p></div>
${prov({ logo: "FB", bg: "var(--spring-50)", fg: "var(--spring-800)", name: "Facebook Page",
  powers: "Publish approved listings to the agency page", state: "Connected", tone: "ok",
  note: "MS Realty Sandanski · renews 2 Dec", action: "Manage" })}
${prov({ logo: "IG", bg: "var(--spring-50)", fg: "var(--spring-800)", name: "Instagram",
  powers: "Publish approved listing photos", state: "Connected", tone: "ok",
  note: "@msrealty.bg · renews 2 Dec", action: "Manage" })}
          </section>

          <section class="panel">
            <div class="grp-hd"><h2>Data and infrastructure</h2><p>Where the workspace keeps its records.</p></div>
${prov({ logo: "PG", bg: "var(--success-50)", fg: "var(--success-600)", name: "PostgreSQL · Payload CMS",
  powers: "Listings, leads, contacts, sessions, audit log", state: "Live", tone: "ok",
  note: "Neon eu-central-1 · 41 ms · migrations current", action: "Open" })}
${prov({ logo: "R2", bg: "var(--success-50)", fg: "var(--success-600)", name: "Cloudflare R2",
  powers: "Listing media · 11,859 files mirrored", state: "Live", tone: "ok",
  note: "Managed by the agency, not owner-connectable", action: "Open" })}
${prov({ logo: "TS", bg: "var(--success-50)", fg: "var(--success-600)", name: "Typesense",
  powers: "Public property search", state: "Live", tone: "ok",
  note: "Last sync 6 minutes ago · 84 documents", action: "Resync" })}
${prov({ logo: "GH", bg: "var(--tile-deep)", fg: "var(--marble-600)", name: "GitHub",
  powers: "Agency repository access for the operator agent", state: "Not connected", tone: "sand",
  note: "Optional", action: "Connect" })}
          </section>

          <section class="panel">
            <div class="grp-hd"><h2>Hermes agent</h2><p>Drafts only. It can never publish or send by itself.</p></div>
${prov({ logo: "HE", bg: "var(--brick-50)", fg: "var(--brick-700)", name: "Hermes model endpoint",
  powers: "Translation, reply and QA drafts for human approval", state: "Not configured", tone: "sand",
  note: "2 secrets missing", action: "Set up", primary: true })}
${prov({ logo: "OR", bg: "var(--tile-deep)", fg: "var(--marble-600)", name: "OpenRouter",
  powers: "Fallback model routing", state: "Not connected", tone: "sand",
  note: "Optional", action: "Connect" })}
          </section>
        </div>

        <div style="display:grid; gap:16px">
          <section class="panel">
            <div class="panel-hd"><h2>Missing configuration</h2><span class="sub">4 values</span></div>
            <div class="req">
              ${icon("alert", 16)}
              <span><code>HERMES_CHAT_COMPLETIONS_URL</code><p>The model endpoint Hermes drafts through.</p></span>
            </div>
            <div class="req">
              ${icon("alert", 16)}
              <span><code>HERMES_API_KEY</code><p>Credential for that endpoint. Stored encrypted, never shown again.</p></span>
            </div>
            <div class="req">
              ${icon("alert", 16)}
              <span><code>MS_REALTY_META_EMBEDDED_SIGNUP_CONFIG_ID</code><p>Required before WhatsApp sign-in can start.</p></span>
            </div>
            <div class="req">
              ${icon("alert", 16)}
              <span><code>MS_REALTY_META_WEBHOOK_VERIFY_TOKEN</code><p>Lets Meta deliver inbound messages back to the workspace.</p></span>
            </div>
            <div style="padding:12px 16px; border-top:1px solid var(--border); display:grid; gap:8px">
              <button class="btn btn--sm" type="button">${icon("copy", 14)}<span>Copy the key names</span></button>
              <span class="hint">This workspace never takes a credential through a form. Every provider row
                declares owner_secret_fields false, and the coverage build refuses a row that does not — these
                four are set in the deployment environment and the workspace only reports whether they arrived.</span>
            </div>
          </section>

          <section class="panel">
            <div class="panel-hd"><h2>What this unblocks</h2></div>
            <div class="req" style="grid-template-columns:auto minmax(0,1fr)">
              ${icon("check", 16)}
              <span><b style="font-size:13px">Send replies from the inbox</b><p>Needs Google Workspace or WhatsApp.</p></span>
            </div>
            <div class="req">
              ${icon("check", 16)}
              <span><b style="font-size:13px">Hermes translation drafts</b><p>7 listings are waiting on this.</p></span>
            </div>
            <div class="req">
              ${icon("check", 16)}
              <span><b style="font-size:13px">Viewing invitations in the calendar</b><p>Needs Google Workspace.</p></span>
            </div>
          </section>

          <section class="panel">
            <div class="panel-hd"><h2>Recent connection events</h2></div>
            <div class="req">${icon("clock", 15)}<span><b style="font-size:13px">Google token expired</b><p>28 Aug, 04:12 · delivery paused</p></span></div>
            <div class="req">${icon("clock", 15)}<span><b style="font-size:13px">Instagram connected by Mariya</b><p>2 Aug, 11:04</p></span></div>
            <div class="req">${icon("clock", 15)}<span><b style="font-size:13px">Typesense schema rebuilt</b><p>29 Jul, 09:30</p></span></div>
          </section>
        </div>
      </div>`;

fs.writeFileSync(new URL("./Integrations.dc.html", import.meta.url), page({
  active: "integrations", body: BODY, extraCss: CSS, height: 1320,
}));
console.log("Integrations.dc.html");
