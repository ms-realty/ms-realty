import fs from "node:fs";
import { page, icon, subnav } from "../shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

const INT_NAV = (on) => subnav([
  ["Connected", "link", on === "conn"], ["Catalogue", "puzzle", on === "cat"],
  ["Automations", "bolt", on === "auto"], ["Webhooks", "webhook", on === "hook"], ["API keys", "key", on === "keys"],
]);

const CAT_CSS = `
    .cat { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; padding:16px; }
    .capp { border:1px solid var(--border); border-radius:var(--r-md); padding:13px; background:var(--surface);
      display:grid; gap:8px; }
    .capp .hd { display:flex; align-items:center; gap:9px; }
    .capp .lg { display:grid; place-items:center; width:32px; height:32px; border-radius:var(--r-sm);
      font:700 11px var(--font-sans); flex:0 0 auto; }
    .capp b { font-size:12.5px; font-weight:600; color:var(--text-strong); }
    .capp p { font-size:11.5px; color:var(--text-muted); min-height:30px; }
    .capp .ft { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .side-sect { padding:14px 16px; border-bottom:1px solid var(--border); }
    .side-sect:last-child { border-bottom:0; }
    .side-sect > b { display:block; font-size:12.5px; margin-bottom:8px; }
    .auto { display:grid; grid-template-columns:auto minmax(0,1fr) 220px 128px 100px; gap:14px; align-items:center;
      padding:12px 16px; border-bottom:1px solid var(--border); }
    .auto:last-child { border-bottom:0; }
    .auto b { font-size:13px; font-weight:600; color:var(--text-strong); display:block; }
    .auto em { font-style:normal; font-size:12px; color:var(--text-muted); }
    .rule { display:flex; flex-wrap:wrap; align-items:center; gap:5px; font-size:11.5px; }
    .rule span.k { padding:2px 7px; border-radius:var(--r-xs); background:var(--stone-100); color:var(--stone-700); font-weight:600; }
    .rule span.v { padding:2px 7px; border-radius:var(--r-xs); background:var(--sea-50); color:var(--sea-700); font-weight:600; }
`;

const CAT_APPS = [
  ["Gmail","#C5221F","GM","Send approved replies from the agency address","Connect","Messaging"],
  ["Google Calendar","#1A73E8","GC","Put viewings in the broker's calendar","Connect","Calendar"],
  ["Google Drive","#0F9D58","GD","File signed contracts by case","Connect","Storage"],
  ["Outlook","#0F6CBD","OL","For brokers who live in Outlook","Connect","Messaging"],
  ["Telegram","#229ED9","TG","A channel Russian buyers actually use","Connect","Messaging"],
  ["Viber","#7360F2","VB","Common with Bulgarian sellers","Connect","Messaging"],
  ["DocuSign","#D4AF37","DS","Qualified signature on a preliminary contract","Connect","Signature"],
  ["Dropbox Sign","#0061FF","DB","A cheaper signature route","Connect","Signature"],
  ["Xero","#13B5EA","XR","Commission invoices against a closed deal","Connect","Finance"],
  ["Stripe","#635BFF","ST","Take a reservation fee online","Connect","Finance"],
  ["Mailchimp","#FFE01B","MC","Newsletters to consented contacts only","Connect","Marketing"],
  ["Meta Ads","#0866FF","MA","Boost a listing that is already published","Connect","Marketing"],
  ["Slack","#611F69","SL","Overdue-lead alerts where the team already is","Connect","Notify"],
  ["Notion","#111111","NO","Where the agency keeps its own notes","Connect","Docs"],
  ["Zoom","#2D8CFF","ZM","Remote viewings for buyers abroad","Connect","Calls"],
  ["Twilio","#F22F46","TW","SMS fallback when a message will not deliver","Connect","Messaging"],
];

const CAT_BODY = `      <div class="ph">
        <div><h1>Integrations</h1><p>Ten services are wired directly because a workflow depends on them. Everything else comes through one aggregator, so a new tool is a connection rather than a release.</p></div>
        <div class="ph-actions">
          <button class="btn" type="button">${icon("list", 15)}<span>Connection log</span></button>
          <button class="btn btn--primary" type="button">${icon("plus", 15)}<span>Request a service</span></button>
        </div>
      </div>
      ${INT_NAV("cat")}
      <div style="display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:20px; align-items:start">
        <section class="panel">
          <div class="toolbar">
            <span class="find">${icon("search", 14)}Search 300+ services</span>
            <div class="seg" style="background:transparent; padding:0">
              <button type="button" data-on="1">All</button><button type="button">Messaging</button>
              <button type="button">Signature</button><button type="button">Finance</button><button type="button">Marketing</button>
            </div>
            <span style="margin-left:auto" class="pill pill--sea"><i></i>via Composio</span>
          </div>
          <div class="note note--info" style="border-radius:0; padding:11px 16px">${icon("puzzle", 16)}
            <span>These are brokered by one aggregator that holds the OAuth app registrations. The agency
              consents once per service; MS Realty never stores a third-party password, and a service the
              agency drops takes its tokens with it.</span></div>
          <div class="cat">
${CAT_APPS.map(([name, colour, ini, what, cta, cat]) => `            <div class="capp">
              <div class="hd"><span class="lg" style="background:${colour}; color:#fff">${ini}</span>
                <span style="min-width:0"><b>${name}</b><span style="display:block; font-size:10.5px" class="muted">${cat}</span></span></div>
              <p>${what}</p>
              <div class="ft"><button class="btn btn--sm" type="button">${cta}</button>
                <span class="mono" style="font-size:10.5px">OAuth</span></div>
            </div>`).join("\n")}
          </div>
          <div class="foot"><span>Showing 16 of 312 available services</span>
            <button class="btn btn--sm" type="button">Browse all</button></div>
        </section>
        <div style="display:grid; gap:16px">
          <section class="panel">
            <div class="panel-hd"><h2>Wired directly</h2><span class="sub">10</span></div>
            <div class="side-sect" style="display:grid; gap:7px; font-size:12.5px">
              ${[["WhatsApp Business","Not connected","sand"],["Google Workspace","Reauthorise","warn"],["Facebook Page","Connected","ok"],["Instagram","Connected","ok"],["PostgreSQL · Payload","Live","ok"],["Cloudflare R2","Live","ok"],["Typesense","Live","ok"],["Hermes endpoint","Not configured","sand"],["GitHub","Not connected","sand"],["Viber","Unavailable","sand"]]
                .map(([n, s, t]) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px"><span>${n}</span><span class="pill pill--${t}"><i></i>${s}</span></div>`).join("")}
              <p class="muted" style="font-size:11.5px; margin-top:5px">These ten carry a named workflow, so they
                stay first-party: an aggregator outage must not stop a reply from being delivered.</p>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>What a connection may touch</h2></div>
            <div class="side-sect" style="display:grid; gap:8px; font-size:12.5px">
              <div style="display:flex; gap:9px">${icon("check", 15)}<span>Only the scopes shown before you consent, and each one is named in plain words.</span></div>
              <div style="display:flex; gap:9px">${icon("check", 15)}<span>Only records the connected workflow needs — a calendar link never sees lead contact details.</span></div>
              <div style="display:flex; gap:9px; color:var(--danger-600)">${icon("x", 15)}<span>Nothing may send to a customer without the same approval a broker needs.</span></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Not listed?</h2></div>
            <div class="side-sect" style="font-size:12.5px; color:var(--text-body)">
              Ask for it and the agency's own developer sees the request with the workflow you described.
              <button class="btn btn--sm" type="button" style="margin-top:9px">${icon("send", 13)}<span>Request a service</span></button>
            </div>
          </section>
        </div>
      </div>`;
fs.writeFileSync(W("IntegrationCatalogue.dc.html"), page({ active: "integrations", body: CAT_BODY, extraCss: CAT_CSS, height: 1080 }));

/* ------------------------------------------------------------- Automations */
const AUTO_BODY = `      <div class="ph">
        <div><h1>Automations</h1><p>Rules the workspace runs on a schedule. Anything that would reach a customer stops at a draft and waits for a person.</p></div>
        <div class="ph-actions">
          <button class="btn" type="button">${icon("history", 15)}<span>Run history</span></button>
          <button class="btn btn--primary" type="button">${icon("plus", 15)}<span>New automation</span></button>
        </div>
      </div>
      ${INT_NAV("auto")}
      <section class="panel">
        <div class="toolbar"><span class="find">${icon("search", 14)}Automation name</span>
          <div class="seg" style="background:transparent; padding:0">
            <button type="button" data-on="1">On <em>7</em></button><button type="button">Off <em>3</em></button><button type="button">Failing <em>1</em></button></div>
          <span style="margin-left:auto" class="mono">Next run 09:00</span></div>
${[
  [1,"Escalate a lead with no reply","when lead age > SLA · then notify the manager and mark it escalated","Every 15 min","4 today","ok","Internal only"],
  [1,"Run due saved-search alerts","when a saved search has a new match · then queue a digest for approval","Daily 08:00","2 queued","warn","Needs approval"],
  [1,"Publish listings scheduled for today","when publication date = today and approval is on file · then publish","Daily 06:00","1 today","ok","Approved in advance"],
  [1,"Re-check register extracts before a deed","when a notary date is within 24 h · then request a fresh extract","Daily 07:00","0 today","ok","Internal only"],
  [1,"Warn on consent expiring in 30 days","when consent expiry < 30 days · then create a renewal task","Weekly Mon","3 open","ok","Internal only"],
  [1,"Sync approved listings to search","when a listing is published or edited · then reindex","On change","84 documents","ok","Internal only"],
  [1,"Mirror new media to R2","when a photo is uploaded · then mirror and record the checksum","On change","12 today","ok","Internal only"],
  [0,"Draft translations for new listings","when a listing is approved in Bulgarian · then draft DE, NL, RU","On change","paused","sand","Needs approval"],
  [0,"Post a published listing to Facebook","when a listing is published · then draft a post for approval","On change","paused","sand","Needs approval"],
  [0,"Chase a viewing with no feedback","when a viewing is 3 days old with no outcome · then create a task","Daily 09:00","paused","sand","Internal only"],
].map(([on, name, rule, when, last, tone, boundary]) => {
  const [k, v] = rule.split(" · then ");
  return `        <div class="auto">
          <span class="toggle"${on ? ' data-on="1"' : ""}><i></i></span>
          <span style="min-width:0"><b>${name}</b>
            <span class="rule"><span class="k">${k}</span>${icon("arrow", 12)}<span class="v">then ${v}</span></span></span>
          <span style="font-size:12px" class="muted">${when}</span>
          <span style="font-size:12px" class="muted">${last}</span>
          <span style="display:flex; justify-content:flex-end"><span class="pill pill--${tone}"><i></i>${boundary}</span></span>
        </div>`;
}).join("\n")}
        <div class="savebar"><span style="font-size:12px" class="muted">A failing automation raises a workspace
          alert rather than retrying silently. The last failure was the saved-search digest on 28 August, when
          Google delivery expired.</span></div>
      </section>
      <div style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; margin-top:16px">
        <section class="panel">
          <div class="panel-hd"><h2>Webhooks in</h2></div>
          <div class="sect" style="display:grid; gap:8px; font-size:12.5px">
            <div style="display:flex; justify-content:space-between"><span class="mono">meta/whatsapp</span><span class="pill pill--sand"><i></i>Awaiting token</span></div>
            <div style="display:flex; justify-content:space-between"><span class="mono">meta/leadgen</span><span class="pill pill--ok"><i></i>Verified</span></div>
            <div style="display:flex; justify-content:space-between"><span class="mono">payload/afterChange</span><span class="pill pill--ok"><i></i>Verified</span></div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-hd"><h2>Webhooks out</h2></div>
          <div class="sect" style="display:grid; gap:8px; font-size:12.5px">
            <div style="display:flex; justify-content:space-between"><span>Lead created</span><span class="muted">2 subscribers</span></div>
            <div style="display:flex; justify-content:space-between"><span>Listing published</span><span class="muted">1 subscriber</span></div>
            <div style="display:flex; justify-content:space-between"><span>Case step closed</span><span class="muted">none</span></div>
            <button class="btn btn--sm" type="button" style="margin-top:4px">${icon("plus", 13)}<span>Add a subscriber</span></button>
          </div>
        </section>
        <section class="panel">
          <div class="panel-hd"><h2>Agent access</h2><span class="pill pill--ai">${icon("sparkles", 11)}MCP</span></div>
          <div class="sect" style="display:grid; gap:8px; font-size:12.5px">
            <p class="muted">The owner's own assistant can reach this workspace over four tools, each bound to
              the same permissions the person has.</p>
            <div style="display:grid; gap:5px">
              ${["ms_realty_admin_read","ms_realty_admin_write","ms_realty_hermes","ms_realty_admin_context"].map((t) => `<span class="mono">${t}</span>`).join("")}
            </div>
            <button class="btn btn--sm" type="button" style="margin-top:4px">${icon("key", 13)}<span>Connect an assistant</span></button>
          </div>
        </section>
      </div>`;
fs.writeFileSync(W("Automations.dc.html"), page({ active: "integrations", body: AUTO_BODY, extraCss: CAT_CSS, height: 1080 }));

console.log("IntegrationCatalogue, Automations");
