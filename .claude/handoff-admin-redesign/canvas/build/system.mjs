import fs from "node:fs";
import { page, sheet, icon, subnav } from "../shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

const SYS_CSS = `
    .side-sect { padding:14px 16px; border-bottom:1px solid var(--border); }
    .side-sect:last-child { border-bottom:0; }
    .side-sect > b { display:block; font-size:12.5px; margin-bottom:8px; }
    .bars { display:grid; gap:9px; padding:16px 20px; }
    .bar { display:grid; grid-template-columns:150px minmax(0,1fr) 54px; gap:12px; align-items:center; font-size:12.5px; }
    .bar .t { height:9px; border-radius:var(--r-full); background:var(--stone-200); overflow:hidden; }
    .bar .t i { display:block; height:100%; border-radius:var(--r-full); }
    .kpi { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:1px; background:var(--border); }
    .kpi > div { background:var(--surface); padding:14px 18px; }
    .kpi dt { font-size:11.5px; color:var(--text-muted); margin-bottom:5px; }
    .kpi dd { margin:0; font-family:var(--font-display); font-size:26px; font-weight:600; letter-spacing:-.02em;
      color:var(--text-strong); line-height:1; }
    .kpi small { display:block; margin-top:5px; font-size:11.5px; }
    .gate { display:grid; grid-template-columns:auto minmax(0,1fr) 200px 128px; gap:14px; align-items:center;
      padding:11px 16px; border-bottom:1px solid var(--border); }
    .gate:last-child { border-bottom:0; }
    .gate b { font-size:13px; font-weight:600; display:block; color:var(--text-strong); }
    .gate em { font-style:normal; font-size:12px; color:var(--text-muted); }
`;

/* ------------------------------------------------------------------- Insight */
const REP_BODY = `      <div class="ph">
        <div><h1>Insight</h1><p>August, compared with July. Numbers come from the lead, viewing and deal ledgers — nothing is estimated.</p></div>
        <div class="ph-actions">
          <button class="btn btn--sm" type="button">August 2026 ${icon("down", 13)}</button>
          <button class="btn" type="button">${icon("download", 15)}<span>Export</span></button>
        </div>
      </div>
      ${subnav([["Reports", "chart", true], ["Activity log", "list"], ["Launch readiness", "flag"], ["Runtime", "target"]])}
      <section class="panel">
        <dl class="kpi">
          <div><dt>Enquiries received</dt><dd>63</dd><small style="color:var(--success-600)">+11 on July</small></div>
          <div><dt>Answered inside the target</dt><dd>78%</dd><small style="color:var(--danger-600)">−6 points · target is 90</small></div>
          <div><dt>Viewings held</dt><dd>24</dd><small style="color:var(--success-600)">+3</small></div>
          <div><dt>Deals closed</dt><dd>2</dd><small class="muted">€284,000 · one still in notary</small></div>
        </dl>
      </section>
      <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin-top:16px; align-items:start">
        <section class="panel">
          <div class="panel-hd"><h2>Where enquiries came from</h2><span class="sub">63 in August</span></div>
          <div class="bars">
${[["Website enquiry form",26],["WhatsApp",14],["Phone",11],["Legacy .ru pages",7],["Facebook",3],["Walk-in",2]].map(([n, v]) => [n, v, "var(--sea-600)"])
  .map(([n, v, c]) => `            <div class="bar"><span>${n}</span><span class="t"><i style="width:${(v / 26) * 100}%; background:${c}"></i></span><b style="text-align:right">${v}</b></div>`).join("\n")}
          </div>
          <div class="savebar"><span style="font-size:12px" class="muted">Seven enquiries still arrive on legacy
            Russian pages, which is the strongest argument for keeping every one of those URLs alive.</span></div>
        </section>
        <section class="panel">
          <div class="panel-hd"><h2>Reply speed against the target</h2><span class="sub">Target: first reply in 4 hours</span></div>
          <div class="bars">
${[["Under 1 hour",21,"var(--success-500)"],["1 to 4 hours",28,"var(--success-500)"],["4 to 24 hours",9,"var(--warning-600)"],["Over 24 hours",5,"var(--danger-500)"]]
  .map(([n, v, c]) => `            <div class="bar"><span>${n}</span><span class="t"><i style="width:${(v / 28) * 100}%; background:${c}"></i></span><b style="text-align:right">${v}</b></div>`).join("\n")}
          </div>
          <div class="savebar"><span style="font-size:12px" class="muted">The five over 24 hours were all
            Hebrew or Greek and all arrived at the weekend. That is a staffing question, not a tooling one.</span></div>
        </section>
        <section class="panel">
          <div class="panel-hd"><h2>Catalogue health</h2></div>
          <div class="bars">
${[["Published and complete",84,"var(--success-500)"],["Published, facts thin",19,"var(--warning-600)"],["Needs review",43,"var(--warning-600)"],["Archived",38,"var(--stone-600)"]]
  .map(([n, v, c]) => `            <div class="bar"><span>${n}</span><span class="t"><i style="width:${(v / 84) * 100}%; background:${c}"></i></span><b style="text-align:right">${v}</b></div>`).join("\n")}
          </div>
        </section>
        <section class="panel">
          <div class="panel-hd"><h2>Hermes contribution</h2><span class="pill pill--ai">${icon("sparkles", 11)}Drafts only</span></div>
          <div class="bars">
${[["Accepted as written",96,"var(--success-500)"],["Accepted after edits",34,"var(--sea-600)"],["Rejected",18,"var(--stone-600)"],["Refused by a guardrail",7,"var(--danger-500)"]]
  .map(([n, v, c]) => `            <div class="bar"><span>${n}</span><span class="t"><i style="width:${(v / 96) * 100}%; background:${c}"></i></span><b style="text-align:right">${v}</b></div>`).join("\n")}
          </div>
          <div class="savebar"><span style="font-size:12px" class="muted">Roughly nine hours of translation and
            drafting time in August, all of it reviewed by a person before anyone outside saw it.</span></div>
        </section>
      </div>`;
fs.writeFileSync(W("Reports.dc.html"), page({ active: "insight", body: REP_BODY, extraCss: SYS_CSS, height: 1020 }));

/* ------------------------------------------------------------------ Activity */
const ACT_BODY = `      <div class="ph">
        <div><h1>Activity log</h1><p>Append-only. Every mutation names a person or an agent, and an action that is not registered cannot be written at all.</p></div>
        <div class="ph-actions">
          <button class="btn" type="button">${icon("download", 15)}<span>Export</span></button>
        </div>
      </div>
      ${subnav([["Reports", "chart"], ["Activity log", "list", true], ["Launch readiness", "flag"], ["Runtime", "target"]])}
      <section class="panel">
        <div class="toolbar">
          <span class="find">${icon("search", 14)}Action, record or person</span>
          <button class="btn btn--sm" type="button">Anyone ${icon("down", 13)}</button>
          <button class="btn btn--sm" type="button">Any action ${icon("down", 13)}</button>
          <button class="btn btn--sm" type="button">Last 7 days ${icon("down", 13)}</button>
          <span style="margin-left:auto" class="mono">4,182 entries · retained 24 months</span>
        </div>
        <table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>What changed</th><th>Where from</th></tr></thead>
          <tbody>
${[
  ["Today 09:41","Mariya Ruseva","human","translation_approved","MS-CRAWL-0032 · DE","Draft accepted as written, marked indexable","Sandanski office"],
  ["Today 09:12","Mariya Ruseva","human","document_sent","CASE-0007 · preliminary contract","Sent to the seller for signature","Sandanski office"],
  ["Today 08:40","Hermes","agent","hermes_translation_draft","7 listings · DE, NL, EL","21 drafts stored unpublished, 2 lines refused","Agency hardware"],
  ["Today 08:02","Petar Dimitrov","human","reply_sent","Lead · Anna Weber","Reply approved by Mariya and delivered","Mobile"],
  ["Yesterday 17:20","Mariya Ruseva","human","listing_published","MS-CRAWL-0087","Moved from needs review to published","Sandanski office"],
  ["Yesterday 16:55","System","system","consent_withdrawn","Dmitri Volkov","Removed from 2 alert audiences","Website"],
  ["Yesterday 11:04","Mariya Ruseva","human","connection_disconnected","Google Workspace","Token expired, delivery paused","Sandanski office"],
  ["28 Aug 09:00","System","system","automation_failed","Saved-search digest","Google delivery unavailable, nothing sent","Scheduler"],
].map(([when, who, kind, action, record, what, where]) => `            <tr>
              <td class="mono">${when}</td>
              <td><span style="display:flex; align-items:center; gap:8px"><span class="av"${kind === "agent" ? ' style="background:var(--brick-50); color:var(--brick-700)"' : kind === "system" ? ' style="background:var(--sea-50); color:var(--sea-700)"' : ""}>${who.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}</span>${who}</span></td>
              <td><span class="mono">${action}</span></td>
              <td>${record}</td>
              <td class="muted">${what}</td>
              <td class="muted">${where}</td>
            </tr>`).join("\n")}
          </tbody>
        </table>
        <div class="foot"><span>Showing 8 of 4,182</span>
          <span style="display:flex; gap:8px"><button class="btn btn--sm" type="button">Previous</button><button class="btn btn--sm" type="button">Next</button></span></div>
      </section>
      <div class="note note--info" style="margin-top:14px">${icon("lock", 15)}
        <span>An entry cannot be edited or deleted from the workspace, and a new kind of action has to be
          registered in code before it can appear here at all — an unregistered action fails the write.</span></div>`;
fs.writeFileSync(W("Activity.dc.html"), page({ active: "insight", body: ACT_BODY, extraCss: SYS_CSS, height: 900 }));

/* ----------------------------------------------------------------- Readiness */
const LR_BODY = `      <div class="ph">
        <div><h1>Launch readiness</h1><p>Thirteen gates between here and serving both canonical domains. Three are blocked, and none of them can be waved through from this screen.</p></div>
        <div class="ph-actions">
          <span class="pill pill--warn"><i></i>10 of 13 passing</span>
          <button class="btn" type="button">${icon("download", 15)}<span>Evidence pack</span></button>
        </div>
      </div>
      ${subnav([["Reports", "chart"], ["Activity log", "list"], ["Launch readiness", "flag", true], ["Runtime", "target"]])}
      <section class="panel">
        <div class="panel-hd"><h2>Gates</h2><span class="sub">A gate passes on external evidence, never on a local smoke test.</span></div>
${[
  ["ok","Crawl parity against both legacy domains","457 URLs · titles, metadata and content compared","Report 29 Aug"],
  ["ok","Listing facts reviewed by a person","165 of 165 in the review CSV","Signed off 24 Aug"],
  ["ok","Public search serves the approved catalogue","84 published listings indexed in Typesense","Live check"],
  ["ok","Database and CMS runtime","Payload on Postgres, migrations current","Live check"],
  ["ok","Media mirrored and reviewed","11,859 files in R2 · 46 still in the review queue","Live check"],
  ["ok","Deterministic email delivery","Templates render identically across locales","Report 26 Aug"],
  ["ok","Monitoring and alerting","Drill completed, alerts reached the on-call phone","Drill 30 Aug"],
  ["ok","Rollback rehearsal","Restored the previous release inside the window","Drill 30 Aug"],
  ["ok","Backup and recovery","R2 restore verified against a clean environment","Drill 28 Aug"],
  ["ok","Owner handover pack","Credentials, runbooks and contacts transferred","Signed 31 Aug"],
  ["block","Every legacy URL has a terminal outcome","419 of 457 decided · 38 undecided","Blocks launch"],
  ["block","Search Console and Yandex ownership","Neither property is verified for the canonical domains","Blocks launch"],
  ["block","Hermes worker report from a live run","The endpoint is not configured, so no live report exists","Blocks launch"],
].map(([state, title, detail, evidence]) => `        <div class="gate">
          <span class="av" style="background:${state === "ok" ? "var(--success-50); color:var(--success-600)" : "var(--danger-50); color:var(--danger-600)"}">${icon(state === "ok" ? "check" : "alert", 14)}</span>
          <span style="min-width:0"><b>${title}</b><em>${detail}</em></span>
          <span style="font-size:12px" class="muted">${evidence}</span>
          <span style="display:flex; justify-content:flex-end">${state === "ok"
            ? `<span class="pill pill--ok"><i></i>Passing</span>`
            : `<button class="btn btn--sm btn--primary" type="button">Open</button>`}</span>
        </div>`).join("\n")}
        <div class="savebar"><span style="font-size:12px" class="muted">Production-Ready is the whole portfolio
          passing on the temporary host. Production-Live needs the owner's DNS change and post-cutover
          verification. Neither can be asserted from this screen.</span></div>
      </section>`;
fs.writeFileSync(W("LaunchReadiness.dc.html"), page({ active: "insight", body: LR_BODY, extraCss: SYS_CSS, height: 1020 }));

/* ---------------------------------------------------------------- Team + 2FA */
const TEAM_BODY = `      <div class="ph">
        <div><h1>Team</h1><p>Three people and one agent. What each may do is decided here and enforced on every request, not in the interface.</p></div>
        <div class="ph-actions"><button class="btn btn--primary" type="button">${icon("plus", 15)}<span>Invite</span></button></div>
      </div>
      ${subnav([["Workspace", "gear"], ["Team and roles", "team", true], ["Security", "shield"], ["Data and exports", "download"]])}
      <div style="display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:20px; align-items:start">
        <section class="panel">
          <table>
            <thead><tr><th>Person</th><th>Role</th><th>May approve</th><th>Two-factor</th><th>Last active</th><th></th></tr></thead>
            <tbody>
              <tr><td><span style="display:flex; align-items:center; gap:10px"><span class="av" style="background:var(--brick-600); color:#fff">MR</span>
                <span class="t2"><b>Mariya Ruseva</b><span>mariya@ms-realty.bg</span></span></span></td>
                <td><span class="pill pill--ink"><i></i>Owner</span></td>
                <td class="muted">Everything, including publication</td>
                <td><span class="pill pill--ok"><i></i>On</span></td><td class="muted">now</td>
                <td style="text-align:right"><button class="btn btn--sm" type="button">Manage</button></td></tr>
              <tr><td><span style="display:flex; align-items:center; gap:10px"><span class="av">PD</span>
                <span class="t2"><b>Petar Dimitrov</b><span>petar@ms-realty.bg</span></span></span></td>
                <td><span class="pill pill--sea"><i></i>Broker</span></td>
                <td class="muted">Replies and viewings, not publication</td>
                <td><span class="pill pill--ok"><i></i>On</span></td><td class="muted">1 hour ago</td>
                <td style="text-align:right"><button class="btn btn--sm" type="button">Manage</button></td></tr>
              <tr><td><span style="display:flex; align-items:center; gap:10px"><span class="av">DK</span>
                <span class="t2"><b>Desislava Koleva</b><span>desi@ms-realty.bg</span></span></span></td>
                <td><span class="pill pill--sand"><i></i>Translator</span></td>
                <td class="muted">Translations in DE and NL only</td>
                <td><span class="pill pill--warn"><i></i>Not set up</span></td><td class="muted">3 days ago</td>
                <td style="text-align:right"><button class="btn btn--sm" type="button">Manage</button></td></tr>
              <tr><td><span style="display:flex; align-items:center; gap:10px"><span class="av" style="background:var(--brick-50); color:var(--brick-700)">HE</span>
                <span class="t2"><b>Hermes</b><span>Agent · agency hardware</span></span></span></td>
                <td><span class="pill pill--ai">${icon("sparkles", 11)}Agent</span></td>
                <td class="muted">Nothing. It drafts only.</td>
                <td class="muted">—</td><td class="muted">yesterday</td>
                <td style="text-align:right"><button class="btn btn--sm" type="button">Limits</button></td></tr>
            </tbody>
          </table>
          <div class="savebar"><span style="font-size:12px" class="muted">Removing a person revokes their
            sessions immediately and leaves their name on everything they approved.</span></div>
        </section>
        <div style="display:grid; gap:16px">
          <section class="panel">
            <div class="panel-hd"><h2>Needs attention</h2></div>
            <div class="side-sect" style="display:grid; gap:9px; font-size:12.5px">
              <div class="note note--warn">${icon("alert", 14)}<span>Desislava has no second factor. She can approve
                translations that go straight to the public site.</span></div>
              <button class="btn btn--sm btn--primary" type="button">${icon("send", 13)}<span>Send her the setup link</span></button>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Sessions</h2><span class="sub">4 open</span></div>
            <div class="side-sect" style="display:grid; gap:9px; font-size:12.5px">
              ${[["Mariya · Mac · Sandanski","now"],["Mariya · iPhone","2 hours ago"],["Petar · Android","1 hour ago"],["Desislava · Windows · Sofia","3 days ago"]]
                .map(([a, b]) => `<div style="display:flex; justify-content:space-between; align-items:center"><span>${a}</span><span class="muted">${b}</span></div>`).join("")}
              <button class="btn btn--sm" type="button" style="margin-top:4px">Revoke the 3-day-old session</button>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>What a role means</h2></div>
            <div class="side-sect" style="display:grid; gap:8px; font-size:12.5px">
              <div><b>Owner</b><span style="display:block" class="muted">Publication, settings, team, exports.</span></div>
              <div><b>Broker</b><span style="display:block" class="muted">Leads, viewings, cases, documents. Cannot publish.</span></div>
              <div><b>Translator</b><span style="display:block" class="muted">Only the languages named on their account.</span></div>
              <div><b>Agent</b><span style="display:block" class="muted">Read and draft. Every mutation is refused.</span></div>
            </div>
          </section>
        </div>
      </div>`;
fs.writeFileSync(W("Team.dc.html"), page({ active: "settings", body: TEAM_BODY, extraCss: SYS_CSS, height: 900 }));

/* ----------------------------------------------------------------- Sign in */
const SI_BODY = `<div style="display:grid; grid-template-columns:minmax(0,1fr) 520px; min-height:900px">
  <div style="background:var(--ink-900); color:#fff; padding:56px 60px; display:grid; align-content:space-between">
    <img src="ms-realty-logo-reversed.png" alt="MS Realty" width="78" height="40" style="display:block; height:40px; width:auto" />
    <div>
      <p style="font-family:var(--font-display); font-size:30px; font-weight:600; letter-spacing:-.02em; line-height:1.25; max-width:440px">
        The workspace for a family agency in Sandanski.</p>
      <p style="margin-top:16px; font-size:14px; color:rgba(255,255,255,.66); max-width:420px; line-height:1.6">
        Listings, enquiries, viewings, contracts and the website itself — in one place, in Bulgarian,
        Russian or English.</p>
    </div>
    <p style="font-size:12px; color:rgba(255,255,255,.44)">Every sign-in is recorded. Report anything you
      did not do to the owner.</p>
  </div>
  <div style="background:var(--surface); padding:56px 60px; display:grid; align-content:center; gap:18px">
    <div>
      <h1 style="font-family:var(--font-display); font-size:26px; font-weight:600; letter-spacing:-.015em">Sign in</h1>
      <p style="margin-top:5px; font-size:13px; color:var(--text-muted)">Use your MS Realty address.</p>
    </div>
    <div class="field"><label for="s1">Email</label><span class="in" id="s1">mariya@ms-realty.bg</span></div>
    <div class="field"><label for="s2">Password</label><span class="in in--focus" id="s2">••••••••••••</span></div>
    <div style="display:flex; align-items:center; gap:9px">
      <span class="box" data-on="1"></span><span style="font-size:12.5px">Remember this device for 30 days</span>
      <a href="#" style="margin-left:auto; font-size:12.5px; font-weight:600">Forgot your password?</a>
    </div>
    <button class="btn btn--lg btn--primary" type="button" style="justify-content:center">Sign in</button>
    <div class="note note--info">${icon("shield", 15)}<span>A second factor is asked for after the password.
      If you have lost your device, the owner can reset it for you.</span></div>
    <div style="display:flex; align-items:center; gap:10px; margin-top:6px">
      <span style="height:1px; flex:1 1 auto; background:var(--border)"></span>
      <span style="font-size:11.5px" class="muted">or</span>
      <span style="height:1px; flex:1 1 auto; background:var(--border)"></span>
    </div>
    <button class="btn btn--lg" type="button" style="justify-content:center">${icon("mail", 16)}<span>Continue with Google Workspace</span></button>
  </div>
</div>`;
fs.writeFileSync(W("SignIn.dc.html"), sheet({ body: SI_BODY, width: 1440, height: 900, pad: 0, extraCss: SYS_CSS }));

console.log("Reports, Activity, LaunchReadiness, Team, SignIn");
