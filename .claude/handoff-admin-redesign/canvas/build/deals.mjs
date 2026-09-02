import fs from "node:fs";
import { page, icon, subnav } from "../shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

/* ------------------------------------------------------------------- Cases */
const CASE_CSS = `
    .cs { display:grid; grid-template-columns:minmax(0,1fr) 190px 240px 128px 92px; gap:16px; align-items:center;
      padding:12px 16px; border-bottom:1px solid var(--border); }
    .cs:last-child { border-bottom:0; }
    .cs--hd { padding:9px 16px; background:var(--stone-50); font-size:11px; font-weight:600;
      letter-spacing:.02em; color:var(--text-muted); }
    .cs--hd:hover { background:var(--stone-50); }
    .cs:hover { background:var(--stone-50); }
    .cs-main { display:grid; gap:3px; min-width:0; }
    .cs-main b { font-size:13.5px; font-weight:600; color:var(--text-strong); }
    .cs-meta { display:flex; gap:7px; font-size:12px; color:var(--text-muted); }
    .phases { display:flex; gap:3px; align-items:center; }
    .phase { height:6px; flex:1 1 auto; border-radius:var(--r-full); background:var(--stone-200); }
    .phase[data-done] { background:var(--success-500); }
    .phase[data-on] { background:var(--ink-800); }
    .phase[data-block] { background:var(--danger-500); }
`;
const CASES_BODY = `      <div class="ph">
        <div><h1>Transaction cases</h1><p>Every case runs the Bulgarian or Greek step list for its type. A step is closed by a person or by Hermes, and the closer is recorded either way.</p></div>
        <div class="ph-actions">
          <div class="seg"><button type="button" data-on="1">Active <em>5</em></button><button type="button">Blocked <em>1</em></button><button type="button">Closed <em>23</em></button></div>
          <button class="btn btn--primary" type="button">${icon("plus", 15)}<span>Open a case</span></button>
        </div>
      </div>
      <section class="panel">
        <div class="toolbar">
          <span class="find">${icon("search", 14)}Case, client or property</span>
          <button class="btn btn--sm" type="button">Any type ${icon("down", 13)}</button>
          <button class="btn btn--sm" type="button">BG ${icon("down", 13)}</button>
          <button class="btn btn--sm" type="button">Any phase ${icon("down", 13)}</button>
          <span style="margin-left:auto" class="mono">Workflow 2026-07-30.bg-gr-v1</span>
        </div>
        <div class="cs cs--hd"><span>Case</span><span>Phases</span><span>Now, and the next step</span><span>Mode</span><span style="text-align:right">Owner</span></div>
${[
  ["CASE-0007","Anna Weber · villa, Katuntsi","buyer_purchase","Buyer purchase","BG",[1,1,1,2,0,0,0,0],"Agreement","Preliminary contract signature","warn","Manual","MR"],
  ["CASE-0011","Elena Dimitrova · house, Sandanski","seller_sale","Seller sale","BG",[1,1,2,0,0,0,0,0],"Evidence","Cadastral sketch from the registry","danger","Manual","—"],
  ["CASE-0009","Georgi Nikolov · 1-bed, centre","tenant_rental","Tenant rental","BG",[1,1,1,1,1,2,0,0],"Agreement","Lease review with the landlord","sea","Manual","PD"],
  ["CASE-0013","Kostas Papadakis · maisonette, Thessaloniki","buyer_purchase","Buyer purchase","GR",[1,2,0,0,0,0,0,0],"Onboarding","Greek tax number for the buyer","sea","Manual","MR"],
  ["CASE-0006","Villa Katuntsi · short-let operation","short_term_rental","Short-term rental","BG",[1,1,1,1,1,1,2,0],"Completion","Tourism register entry","warn","Autonomous","HE"],
].map(([id, who, type, typeLabel, juris, phases, phase, next, tone, mode, owner]) => `        <div class="cs">
          <span class="cs-main"><b>${who}</b>
            <span class="cs-meta"><span class="mono">${id}</span><span>·</span><span>${typeLabel}</span><span>·</span><span>${juris}</span></span></span>
          <span class="phases">${phases.map((v) => `<i class="phase"${v === 1 ? ' data-done="1"' : v === 2 ? ' data-on="1"' : ""}></i>`).join("")}</span>
          <span style="min-width:0"><span class="pill pill--${tone}"><i></i>${phase}</span>
            <span style="display:block; font-size:12px; color:var(--text-muted); margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${next}</span></span>
          <span>${mode === "Autonomous"
            ? `<span class="pill pill--ai">${icon("sparkles", 11)}Autonomous</span>`
            : `<span class="pill pill--sand"><i></i>Manual</span>`}</span>
          <span style="display:flex; justify-content:flex-end"><span class="av"${owner === "HE" ? ' style="background:var(--brick-50); color:var(--brick-700)"' : ""}>${owner}</span></span>
        </div>`).join("\n")}
      </section>
      <div style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; margin-top:16px">
        <section class="panel">
          <div class="panel-hd"><h2>Blocked on someone else</h2><span class="sub">2</span></div>
          <div class="sect" style="display:grid; gap:10px; font-size:12.5px">
            <div style="display:grid; gap:3px"><b>Cadastral sketch · CASE-0011</b>
              <span class="muted">Waiting on the property register since 24 August. Nine working days.</span></div>
            <div style="display:grid; gap:3px"><b>Proof of funds · CASE-0007</b>
              <span class="muted">Requested from the buyer's bank on 29 August.</span></div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-hd"><h2>Evidence produced by</h2></div>
          <div class="sect" style="display:flex; flex-wrap:wrap; gap:6px">
            ${["Notary 6","Registry 5","Lawyer 4","Bank 3","Client 8","Engineer 1","Insurer 1","Agency 12","Hermes 3"].map((t) =>
              `<span class="pill pill--${t.startsWith("Hermes") ? "ai" : "sand"}">${t}</span>`).join("")}
          </div>
        </section>
        <section class="panel">
          <div class="panel-hd"><h2>Jurisdiction rules in force</h2></div>
          <div class="sect" style="display:grid; gap:7px; font-size:12.5px; color:var(--text-body)">
            <div style="display:flex; gap:8px">${icon("flag", 14)}<span><b>Bulgaria</b> — cadastre, notarial deed, local acquisition tax, ESTI guest reporting for short lets.</span></div>
            <div style="display:flex; gap:8px">${icon("flag", 14)}<span><b>Greece</b> — buyer tax number, engineer certificate, electronic property register.</span></div>
            <div class="note note--info">${icon("alert", 14)}<span>A foreign buyer of land in Bulgaria adds an eligibility step before any deed can be prepared.</span></div>
          </div>
        </section>
      </div>`;
fs.writeFileSync(W("Cases.dc.html"), page({ active: "cases", body: CASES_BODY, extraCss: CASE_CSS, height: 960 }));

/* -------------------------------------------------------------- Case detail */
const CD_CSS = `
    .step { display:grid; grid-template-columns:26px minmax(0,1fr) 168px 132px 104px; gap:13px; align-items:center;
      padding:11px 18px; border-bottom:1px solid var(--border); }
    .step:last-child { border-bottom:0; }
    .step:hover { background:var(--stone-50); }
    .step-n { display:grid; place-items:center; width:22px; height:22px; border-radius:var(--r-full);
      background:var(--stone-200); color:var(--stone-700); font:600 10.5px var(--font-sans); }
    .step-n[data-done] { background:var(--success-500); color:#fff; }
    .step-n[data-on] { background:var(--ink-800); color:#fff; }
    .step-n[data-block] { background:var(--danger-600); color:#fff; }
    .step-n[data-na] { background:transparent; border:1px dashed var(--border-control); color:var(--text-muted); }
    .step b { font-size:13px; font-weight:600; color:var(--text-strong); display:block; }
    .step em { font-style:normal; font-size:11.5px; color:var(--text-muted); }
    .phase-hd { display:flex; align-items:center; justify-content:space-between; padding:9px 18px;
      background:var(--sunken); border-bottom:1px solid var(--border); }
    .phase-hd b { font-size:11.5px; font-weight:600; color:var(--text-muted); }
`;
function step({ n, state, title, sub, who, whoKind = "sand", when, action }) {
  const attr = state === "done" ? ' data-done="1"' : state === "on" ? ' data-on="1"' : state === "block" ? ' data-block="1"' : state === "na" ? ' data-na="1"' : "";
  const mark = state === "done" ? icon("check", 12) : state === "block" ? "!" : state === "na" ? "–" : n;
  return `        <div class="step">
          <span class="step-n"${attr}>${mark}</span>
          <span style="min-width:0"><b style="${state === "na" ? "color:var(--text-muted); font-weight:400" : ""}">${title}</b><em>${sub}</em></span>
          <span><span class="pill pill--${whoKind}">${whoKind === "ai" ? icon("sparkles", 11) : "<i></i>"}${who}</span></span>
          <span style="font-size:12px" class="muted">${when}</span>
          <span style="display:flex; justify-content:flex-end">${action}</span>
        </div>`;
}
const CD_BODY = `      <div class="crumbs" style="display:flex; align-items:center; gap:7px; font-size:12px; color:var(--text-muted); margin-bottom:10px">
        <a href="#">Transaction cases</a> ${icon("chevron", 13)} <b style="color:var(--text-strong)">CASE-0007</b>
      </div>
      <div class="ph">
        <div><h1>Anna Weber · villa, Katuntsi</h1>
          <p><span class="mono">CASE-0007</span> · Buyer purchase · Bulgaria · opened 11 July · notary booked for 8 September</p></div>
        <div class="ph-actions">
          <span class="pill pill--sand"><i></i>Manual mode</span>
          <button class="btn" type="button">${icon("history", 15)}<span>History</span></button>
          <button class="btn btn--primary" type="button">${icon("filesign", 15)}<span>Prepare documents</span></button>
        </div>
      </div>
      <dl class="kv" style="grid-template-columns:repeat(6,minmax(0,1fr)); border:1px solid var(--border); border-radius:var(--r-lg); overflow:hidden; margin-bottom:16px">
        <div><dt>Property</dt><dd><span class="mono" style="font-size:12.5px">MS-CRAWL-0114</span></dd></div>
        <div><dt>Price agreed</dt><dd><span class="price">€185,000</span></dd></div>
        <div><dt>Buyer</dt><dd>Anna Weber</dd></div>
        <div><dt>Seller</dt><dd>Katuntsi Estates OOD</dd></div>
        <div><dt>Notary</dt><dd>8 Sep, 11:00</dd></div>
        <div><dt>Responsible</dt><dd>Mariya Ruseva</dd></div>
      </dl>
      <div style="display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:20px; align-items:start">
        <section class="panel">
          <div class="panel-hd"><h2>Steps</h2><span class="sub">14 of 22 resolved · 1 blocked</span></div>
          <div class="phase-hd"><b>Intake and onboarding</b><span class="pill pill--ok"><i></i>Complete</span></div>
${step({ state: "done", title: "Client identified and mandate recorded", sub: "Anti-money-laundering screening passed", who: "Mariya", when: "11 Jul", action: `<button class="btn btn--sm btn--ghost" type="button">Evidence</button>` })}
${step({ state: "done", title: "Foreign-buyer land eligibility confirmed", sub: "EU national · apartment and building, no agricultural land", who: "Lawyer", when: "14 Jul", action: `<button class="btn btn--sm btn--ghost" type="button">Evidence</button>` })}
          <div class="phase-hd"><b>Evidence</b><span class="pill pill--ok"><i></i>Complete</span></div>
${step({ state: "done", title: "Cadastral sketch and scheme", sub: "Agency of Geodesy, Cartography and Cadastre", who: "Registry", when: "22 Jul", action: `<button class="btn btn--sm btn--ghost" type="button">Evidence</button>` })}
${step({ state: "done", title: "Property register extract", sub: "No encumbrances recorded", who: "Registry", when: "24 Jul", action: `<button class="btn btn--sm btn--ghost" type="button">Evidence</button>` })}
${step({ state: "done", title: "Energy performance certificate", sub: "Class C, valid to 2033", who: "Engineer", when: "29 Jul", action: `<button class="btn btn--sm btn--ghost" type="button">Evidence</button>` })}
${step({ state: "done", title: "Draft summary of the evidence pack", sub: "Drafted by Hermes, checked and accepted by Mariya", who: "Hermes", whoKind: "ai", when: "29 Jul", action: `<button class="btn btn--sm btn--ghost" type="button">Draft</button>` })}
          <div class="phase-hd"><b>Commercial and agreement</b><span class="pill pill--warn"><i></i>In progress</span></div>
${step({ state: "done", title: "Offer accepted and reservation recorded", sub: "€185,000 · reservation fee received 4 Aug", who: "Mariya", when: "4 Aug", action: `<button class="btn btn--sm btn--ghost" type="button">Evidence</button>` })}
${step({ state: "block", title: "Proof of funds from the buyer's bank", sub: "Requested 29 August · no answer for 3 days", who: "Bank", whoKind: "danger", when: "Blocked", action: `<button class="btn btn--sm btn--primary" type="button">Chase</button>` })}
${step({ state: "on", title: "Preliminary contract signed by both parties", sub: "Drafted from the agency template, waiting on the seller", who: "Lawyer", whoKind: "warn", when: "Due 4 Sep", action: `<button class="btn btn--sm btn--primary" type="button">Open</button>` })}
${step({ state: "todo", n: 10, title: "Local acquisition tax calculated", sub: "Sandanski municipality rate applied to the deed value", who: "Agency", when: "Before 8 Sep", action: `<button class="btn btn--sm" type="button">Start</button>` })}
          <div class="phase-hd"><b>Completion and aftercare</b><span class="pill pill--sand"><i></i>Not started</span></div>
${step({ state: "todo", n: 11, title: "Notarial deed executed", sub: "Notary Ivanova · 8 September, 11:00", who: "Notary", when: "8 Sep", action: `<span class="muted" style="font-size:12px">Scheduled</span>` })}
${step({ state: "todo", n: 12, title: "Entry in the property register", sub: "Within seven days of the deed", who: "Registry", when: "By 15 Sep", action: `<span class="muted" style="font-size:12px">—</span>` })}
${step({ state: "na", title: "Short-let tourism register entry", sub: "Not applicable — the buyer will occupy the property", who: "Not applicable", when: "Marked 11 Jul", action: `<button class="btn btn--sm btn--ghost" type="button">Reopen</button>` })}
        </section>
        <div style="display:grid; gap:16px">
          <section class="panel">
            <div class="panel-hd"><h2>Hermes on this case</h2><span class="pill pill--ai">${icon("sparkles", 11)}Drafts only</span></div>
            <div class="sect" style="display:grid; gap:10px">
              <div class="note note--ai">${icon("sparkles", 15)}<span>Hermes may draft the evidence summary, the client update and the document checklist. It cannot sign, send, or close a step.</span></div>
              <div style="display:grid; gap:6px; font-size:12.5px">
                <div style="display:flex; justify-content:space-between"><span>Drafts accepted</span><b>3</b></div>
                <div style="display:flex; justify-content:space-between"><span>Drafts rejected</span><b>1</b></div>
                <div style="display:flex; justify-content:space-between"><span>Steps closed by Hermes</span><b>0</b></div>
              </div>
              <button class="btn btn--sm" type="button">${icon("sparkles", 13)}<span>Draft the client update</span></button>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Conditions</h2><span class="sub">2 open</span></div>
            <div class="sect" style="display:grid; gap:11px; font-size:12.5px">
              <div style="display:grid; gap:3px"><b>Subject to mortgage approval</b>
                <span class="muted">Deadline 5 September. If it lapses the reservation fee is returned.</span>
                <div style="display:flex; gap:7px; margin-top:5px"><button class="btn btn--sm" type="button">Met</button>
                <button class="btn btn--sm" type="button">Waived…</button><button class="btn btn--sm" type="button">Blocked…</button></div>
                <span class="hint">There is no extend: a condition's actions are met, blocked, expired,
                  waived or reopened, and reopening applies to a closed one. Waiving asks for the authority
                  it rests on and a reason code.</span></div>
              <div style="display:grid; gap:3px"><b>Subject to a clean register extract on the deed date</b>
                <span class="muted">Re-checked automatically the morning of 8 September.</span></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Recent</h2></div>
            <div class="sect" style="padding-top:4px; padding-bottom:4px">
              <div class="tl-row"><span class="av">MR</span><p>Marked the reservation received<em>4 Aug</em></p><span class="mono">14:02</span></div>
              <div class="tl-row"><span class="av" style="background:var(--brick-50); color:var(--brick-700)">HE</span><p>Drafted the evidence summary<em>29 Jul · accepted</em></p><span class="mono">09:41</span></div>
              <div class="tl-row"><span class="av">MR</span><p>Opened the case<em>11 Jul</em></p><span class="mono">16:20</span></div>
            </div>
          </section>
        </div>
      </div>`;
fs.writeFileSync(W("CaseDetail.dc.html"), page({ active: "cases", body: CD_BODY, extraCss: CD_CSS, height: 1000 }));

console.log("Cases, CaseDetail");
