import fs from "node:fs";
import { page, icon } from "../shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

/* ------------------------------------------------------------------- Cases
   One table on grout: a case is a row, 44px, one line of identity. The case
   reference is a caption after the client and the property, never the title.
   Below it, three flat panels side by side; nothing sits inside a panel that
   is itself a panel. */
const CASE_CSS = `
    .cs-id { display:flex; align-items:baseline; gap:8px; min-width:0; }
    .cs-id b { font-size:13px; font-weight:600; color:var(--text-strong); overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; }
    .cs-phases { display:flex; gap:4px; align-items:center; }
    .cs-phase { height:6px; flex:1 1 auto; border-radius:var(--r-pill); background:var(--tile-shadow); }
    .cs-phase[data-done] { background:var(--success-500); }
    .cs-phase[data-on] { background:var(--ink-800); }
    .cs-phase[data-block] { background:var(--danger-500); }
    .cs-now { display:flex; align-items:center; gap:8px; min-width:0; }
    .cs-next { color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .cs-owner { display:flex; justify-content:flex-end; }
    .cs-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px; margin-top:20px; align-items:start; }
    .cs-item { display:grid; gap:4px; min-height:var(--row); padding:12px 20px; border-bottom:1px solid var(--joint); }
    .cs-item:last-child { border-bottom:0; }
    .cs-item-hd { display:flex; align-items:baseline; justify-content:space-between; gap:12px; min-width:0; }
    .cs-tags { display:flex; flex-wrap:wrap; gap:8px; padding:16px 20px; }
    .cs-rule { display:flex; gap:12px; align-items:flex-start; min-height:var(--row); padding:12px 20px;
      border-bottom:1px solid var(--joint); }
    .cs-rule svg { flex:0 0 auto; margin-top:4px; color:var(--text-muted); }
`;

const CASES = [
  ["CASE-0007", "Anna Weber · villa, Katuntsi", "Buyer purchase", "BG", [1, 1, 1, 2, 0, 0, 0, 0], "Agreement", "Preliminary contract signature", "warn", "Manual", "MR"],
  ["CASE-0011", "Elena Dimitrova · house, Sandanski", "Seller sale", "BG", [1, 1, 3, 0, 0, 0, 0, 0], "Evidence", "Cadastral sketch from the registry", "danger", "Manual", "—"],
  ["CASE-0009", "Georgi Nikolov · 1-bed, centre", "Tenant rental", "BG", [1, 1, 1, 1, 1, 2, 0, 0], "Agreement", "Lease review with the landlord", "sea", "Manual", "PD"],
  ["CASE-0013", "Kostas Papadakis · maisonette, Thessaloniki", "Buyer purchase", "GR", [1, 2, 0, 0, 0, 0, 0, 0], "Onboarding", "Greek tax number for the buyer", "sea", "Manual", "MR"],
  ["CASE-0006", "Villa Katuntsi · short-let operation", "Short-term rental", "BG", [1, 1, 1, 1, 1, 1, 2, 0], "Completion", "Tourism register entry", "warn", "Autonomous", "HE"],
];
const phaseAttr = (v) => (v === 1 ? ' data-done="1"' : v === 2 ? ' data-on="1"' : v === 3 ? ' data-block="1"' : "");

const CASES_BODY = `      <div class="ph">
        <div><h1>Transaction cases</h1><p>Every case runs the Bulgarian or Greek step list for its type. A step is closed by a person or by Hermes, and the closer is recorded either way.</p></div>
        <div class="ph-actions">
          <div class="seg"><button type="button" data-on="1">Active <em>5</em></button><button type="button">Blocked <em>1</em></button><button type="button">Closed <em>23</em></button></div>
          <button class="btn btn--accent" type="button">${icon("plus", 16)}<span>Open a case</span></button>
        </div>
      </div>
      <section class="panel">
        <div class="toolbar">
          <span class="find">${icon("search", 14)}Case, client or property</span>
          <button class="btn btn--sm" type="button">Any type ${icon("down", 14)}</button>
          <button class="btn btn--sm" type="button">BG ${icon("down", 14)}</button>
          <button class="btn btn--sm" type="button">Any phase ${icon("down", 14)}</button>
          <span style="margin-left:auto" class="mono">Workflow 2026-07-30.bg-gr-v1</span>
        </div>
        <table>
          <thead><tr>
            <th>Case</th><th style="width:96px">Phases</th><th style="width:96px">Now, and the next step</th>
            <th style="width:96px">Mode</th><th style="width:64px; text-align:right">Owner</th>
          </tr></thead>
          <tbody>
${CASES.map(([id, who, typeLabel, juris, phases, phase, next, tone, mode, owner]) => `            <tr>
              <td><span class="cs-id"><b>${who}</b><span class="mono">${id} · ${typeLabel} · ${juris}</span></span></td>
              <td><span class="cs-phases">${phases.map((v) => `<i class="cs-phase"${phaseAttr(v)}></i>`).join("")}</span></td>
              <td><span class="cs-now"><span class="pill pill--${tone}"><i></i>${phase}</span><span class="cs-next">${next}</span></span></td>
              <td>${mode === "Autonomous"
                ? `<span class="pill pill--ai">${icon("sparkles", 11)}Autonomous</span>`
                : `<span class="pill pill--sand"><i></i>Manual</span>`}</td>
              <td><span class="cs-owner"><span class="av"${owner === "HE" ? ' style="background:var(--brick-50); color:var(--brick-700)"' : ""}>${owner}</span></span></td>
            </tr>`).join("\n")}
          </tbody>
        </table>
      </section>
      <div class="cs-grid">
        <section class="panel">
          <div class="panel-hd"><h2>Blocked on someone else</h2><span class="sub">2</span></div>
          <div class="cs-item">
            <span class="cs-item-hd"><span class="cs-id"><b>Cadastral sketch</b><span class="mono">CASE-0011</span></span>
              <span class="wit wit--none"><b>Property register</b>since 24 Aug</span></span>
            <span class="muted">Waiting on the property register since 24 August. Nine working days.</span>
          </div>
          <div class="cs-item">
            <span class="cs-item-hd"><span class="cs-id"><b>Proof of funds</b><span class="mono">CASE-0007</span></span>
              <span class="wit wit--none"><b>Buyer's bank</b>since 29 Aug</span></span>
            <span class="muted">Requested from the buyer's bank on 29 August.</span>
          </div>
        </section>
        <section class="panel">
          <div class="panel-hd"><h2>Evidence produced by</h2></div>
          <div class="cs-tags">
            ${["Notary 6", "Registry 5", "Lawyer 4", "Bank 3", "Client 8", "Engineer 1", "Insurer 1", "Agency 12", "Hermes 3"].map((t) =>
              `<span class="pill pill--${t.startsWith("Hermes") ? "ai" : "sand"}">${t}</span>`).join("")}
          </div>
        </section>
        <section class="panel">
          <div class="panel-hd"><h2>Jurisdiction rules in force</h2></div>
          <div class="cs-rule">${icon("flag", 16)}<span><b>Bulgaria</b> — cadastre, notarial deed, local acquisition tax, ESTI guest reporting for short lets.</span></div>
          <div class="cs-rule">${icon("flag", 16)}<span><b>Greece</b> — buyer tax number, engineer certificate, electronic property register.</span></div>
          <div class="sect"><div class="note note--info">${icon("alert", 16)}<span>A foreign buyer of land in Bulgaria adds an eligibility step before any deed can be prepared.</span></div></div>
        </section>
      </div>`;
fs.writeFileSync(W("Cases.dc.html"), page({ active: "cases", body: CASES_BODY, extraCss: CASE_CSS, height: 960 }));

/* -------------------------------------------------------------- Case detail
   The step list is the screen. Every step carries its witness: who produced or
   confirmed it and when, or the outlined square of a step nobody has closed.
   The current step shows the form the server asks for: an evidence reference
   and a named person. A condition can be met, waived or blocked, never
   extended; waiving asks for the authority and a reason, in the form. */
const CD_CSS = `
    .cd-facts .kv { border-bottom:0; grid-template-columns:1.3fr 1.5fr 1fr 1.2fr 1fr 1.1fr; }
    .cd-facts .wit { margin-left:8px; }
    .cd-cols { display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:20px; align-items:start; margin-top:20px; }
    .cd-side { display:grid; gap:20px; }
    .cd-phase { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:36px;
      padding:0 20px; background:var(--tile); border-bottom:1px solid var(--joint); font-weight:600; color:var(--text-muted); }
    .cd-step { display:grid; grid-template-columns:22px minmax(0,1fr) 200px 96px; gap:16px; align-items:center;
      min-height:var(--row); padding:8px 20px; border-bottom:1px solid var(--joint); }
    .cd-step:last-child { border-bottom:0; }
    .cd-step:hover { background:var(--tile); }
    .cd-n { display:grid; place-items:center; width:22px; height:22px; border-radius:var(--r-pill);
      background:var(--tile-deep); color:var(--marble-700); font-size:11px; font-weight:600; }
    .cd-n[data-done] { background:var(--success-500); color:#fff; }
    .cd-n[data-on] { background:var(--ink-900); color:#fff; }
    .cd-n[data-block] { background:var(--danger-600); color:#fff; }
    .cd-n[data-na] { background:transparent; border:1px dashed var(--border-control); color:var(--text-muted); }
    .cd-step[data-na] .t2 b { color:var(--text-muted); font-weight:400; }
    .cd-who { display:flex; align-items:center; gap:8px; min-width:0; }
    .cd-act { display:flex; justify-content:flex-end; white-space:nowrap; }
    .cd-form { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px 16px; align-items:end;
      padding:12px 20px 16px 64px; background:var(--tile); border-bottom:1px solid var(--joint); }
    .cd-form .hint { grid-column:1 / -1; }
    .cd-actions { display:flex; gap:8px; margin-top:12px; white-space:nowrap; }
    .cd-waive { display:grid; gap:12px; padding:12px 20px 16px; background:var(--tile); border-bottom:1px solid var(--joint); }
    .cd-waive > b { font-size:13px; color:var(--text-strong); }
    .cd-confirm { display:flex; align-items:center; gap:12px; }
    .cd-formrow { display:flex; align-items:center; gap:12px; }
    .cd-stat { display:grid; gap:8px; }
`;
function step({ n, state, title, sub, wit, action, tag = "" }) {
  const attr = state === "done" ? ' data-done="1"' : state === "on" ? ' data-on="1"' : state === "block" ? ' data-block="1"' : state === "na" ? ' data-na="1"' : "";
  const mark = state === "done" ? icon("check", 12) : state === "block" ? "!" : state === "na" ? "–" : n;
  return `          <div class="cd-step"${state === "na" ? ' data-na="1"' : ""}>
            <span class="cd-n"${attr}>${mark}</span>
            <span class="t2"><b>${title}</b><span>${sub}</span></span>
            <span class="cd-who">${tag}${wit}</span>
            <span class="cd-act">${action}</span>
          </div>`;
}
const ghost = (t) => `<button class="btn btn--sm btn--ghost" type="button">${t}</button>`;
const plain = (t) => `<button class="btn btn--sm" type="button">${t}</button>`;
const CD_BODY = `      <div class="crumbs"><a href="#">Transaction cases</a>${icon("chevron", 13)}<b>CASE-0007</b></div>
      <div class="ph">
        <div><h1>Anna Weber · villa, Katuntsi</h1>
          <p><span class="mono">CASE-0007</span> · Buyer purchase · Bulgaria · opened 11 July · notary booked for 8 September</p></div>
        <div class="ph-actions">
          <span class="pill pill--sand"><i></i>Manual mode</span>
          <button class="btn" type="button">${icon("history", 16)}<span>History</span></button>
          <button class="btn btn--accent" type="button">${icon("filesign", 16)}<span>Prepare documents</span></button>
        </div>
      </div>
      <section class="panel cd-facts">
        <dl class="kv">
          <div><dt>Property</dt><dd>Villa, Katuntsi <span class="mono">MS-00191</span></dd></div>
          <div><dt>Price agreed</dt><dd><span class="price">€185,000</span><span class="wit"><b>Mariya Ruseva</b>4 Aug</span></dd></div>
          <div><dt>Buyer</dt><dd>Anna Weber</dd></div>
          <div><dt>Seller</dt><dd>Katuntsi Estates OOD</dd></div>
          <div><dt>Notary</dt><dd>8 Sep, 11:00</dd></div>
          <div><dt>Responsible</dt><dd>Mariya Ruseva</dd></div>
        </dl>
      </section>
      <div class="cd-cols">
        <section class="panel">
          <div class="panel-hd"><h2>Steps</h2><span class="sub">14 of 22 resolved · 1 blocked</span></div>
          <div class="cd-phase"><span>Intake and onboarding</span><span class="pill pill--ok"><i></i>Complete</span></div>
${step({ state: "done", title: "Client identified and mandate recorded", sub: "Anti-money-laundering screening passed", wit: `<span class="wit"><b>Mariya Ruseva</b>11 Jul</span>`, action: ghost("Evidence") })}
${step({ state: "done", title: "Foreign-buyer land eligibility confirmed", sub: "EU national · apartment and building, no agricultural land", wit: `<span class="wit"><b>Lawyer</b>14 Jul</span>`, action: ghost("Evidence") })}
          <div class="cd-phase"><span>Evidence</span><span class="pill pill--ok"><i></i>Complete</span></div>
${step({ state: "done", title: "Cadastral sketch and scheme", sub: "Agency of Geodesy, Cartography and Cadastre", wit: `<span class="wit"><b>Registry</b>22 Jul</span>`, action: ghost("Evidence") })}
${step({ state: "done", title: "Property register extract", sub: "No encumbrances recorded", wit: `<span class="wit"><b>Registry</b>24 Jul</span>`, action: ghost("Evidence") })}
${step({ state: "done", title: "Energy performance certificate", sub: "Class C, valid to 2033", wit: `<span class="wit"><b>Engineer</b>29 Jul</span>`, action: ghost("Evidence") })}
${step({ state: "done", title: "Draft summary of the evidence pack", sub: "Drafted by Hermes, checked and accepted by Mariya", tag: `<span class="pill pill--ai">${icon("sparkles", 11)}Hermes</span>`, wit: `<span class="wit"><b>Mariya Ruseva</b>29 Jul</span>`, action: ghost("Draft") })}
          <div class="cd-phase"><span>Commercial and agreement</span><span class="pill pill--warn"><i></i>In progress</span></div>
${step({ state: "done", title: "Offer accepted and reservation recorded", sub: "€185,000 · reservation fee received 4 Aug", wit: `<span class="wit"><b>Mariya Ruseva</b>4 Aug</span>`, action: ghost("Evidence") })}
${step({ state: "block", title: "Proof of funds from the buyer's bank", sub: "Requested 29 August · no answer for 3 days", wit: `<span class="wit wit--none"><b>Bank</b>blocked</span>`, action: plain("Chase") })}
${step({ state: "on", title: "Preliminary contract signed by both parties", sub: "Drafted from the agency template, waiting on the seller", wit: `<span class="wit wit--none"><b>Lawyer</b>due 4 Sep</span>`, action: plain("Open") })}
          <div class="cd-form">
            <div class="field"><label>Evidence reference <em>*</em></label><span class="in in--empty">A reference to the signed contract</span></div>
            <button class="btn btn--sm" type="button">Complete step</button>
            <span class="hint">Closed as Mariya Ruseva, with the lawyer recorded as the evidence producer. Hermes cannot close a step on a manual case.</span>
          </div>
${step({ state: "todo", n: 10, title: "Local acquisition tax calculated", sub: "Sandanski municipality rate applied to the deed value", wit: `<span class="wit wit--none"><b>Agency</b>before 8 Sep</span>`, action: plain("Start") })}
          <div class="cd-phase"><span>Completion and aftercare</span><span class="pill pill--sand"><i></i>Not started</span></div>
${step({ state: "todo", n: 11, title: "Notarial deed executed", sub: "Notary Ivanova · 8 September, 11:00", wit: `<span class="wit wit--none"><b>Notary</b>8 Sep</span>`, action: `<span class="muted">Scheduled</span>` })}
${step({ state: "todo", n: 12, title: "Entry in the property register", sub: "Within seven days of the deed", wit: `<span class="wit wit--none"><b>Registry</b>by 15 Sep</span>`, action: `<span class="muted">—</span>` })}
${step({ state: "na", title: "Short-let tourism register entry", sub: "Not applicable — the buyer will occupy the property", wit: `<span class="wit"><b>Marked not applicable</b>11 Jul</span>`, action: ghost("Reopen") })}
        </section>
        <div class="cd-side">
          <section class="panel">
            <div class="panel-hd"><h2>Hermes on this case</h2><span class="pill pill--ai">${icon("sparkles", 11)}Drafts only</span></div>
            <div class="sect cd-stat">
              <div class="note note--ai">${icon("sparkles", 16)}<span>Hermes may draft the evidence summary, the client update and the document checklist. It cannot sign, send, or close a step.</span></div>
              <div class="kvline"><span>Drafts accepted</span><b>3</b></div>
              <div class="kvline"><span>Drafts rejected</span><b>1</b></div>
              <div class="kvline"><span>Steps closed by Hermes</span><b>0</b></div>
              <div><button class="btn btn--sm" type="button">${icon("sparkles", 14)}<span>Draft the client update</span></button></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Conditions</h2><span class="sub">2 open</span></div>
            <div class="sect">
              <h3>Subject to mortgage approval<span class="wit wit--none">deadline 5 Sep</span></h3>
              <p class="muted">Deadline 5 September. If it lapses the reservation fee is returned.</p>
              <div class="cd-actions">
                <button class="btn btn--sm" type="button">Met</button>
                <button class="btn btn--sm" type="button" data-focus="1">Waived…</button>
                <button class="btn btn--sm" type="button">Blocked…</button>
              </div>
            </div>
            <div class="cd-waive">
              <b>Waive the condition</b>
              <div class="field"><label>Authority or instruction reference <em>*</em></label><span class="in in--empty">The mandate or written instruction it rests on</span></div>
              <div class="field"><label>Reason code <em>*</em></label><span class="in"></span><span class="hint">Lower case: letters, digits, underscore, colon or hyphen.</span></div>
              <label class="cd-confirm"><span class="box"></span><span>I confirm this waiver as Mariya Ruseva</span></label>
              <div class="cd-formrow"><button class="btn btn--sm" type="button">Waive the condition</button><span class="hint">Recorded on the case with the authority and the reason.</span></div>
            </div>
            <div class="sect"><span class="hint">There is no extend: a condition's actions are met, blocked, expired, waived or reopened, and reopening applies to a closed one. Waiving asks for the authority it rests on and a reason code.</span></div>
            <div class="sect">
              <h3>Subject to a clean register extract on the deed date<span class="wit wit--none">re-check 8 Sep</span></h3>
              <p class="muted">Re-checked automatically the morning of 8 September.</p>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Recent</h2></div>
            <div class="sect" style="padding-top:4px; padding-bottom:4px">
              <div class="tl-row"><span class="av">MR</span><p>Marked the reservation received<em> · 4 Aug</em></p><span class="mono">14:02</span></div>
              <div class="tl-row"><span class="av" style="background:var(--brick-50); color:var(--brick-700)">HE</span><p>Drafted the evidence summary<em> · 29 Jul · accepted</em></p><span class="mono">09:41</span></div>
              <div class="tl-row"><span class="av">MR</span><p>Opened the case<em> · 11 Jul</em></p><span class="mono">16:20</span></div>
            </div>
          </section>
        </div>
      </div>`;
fs.writeFileSync(W("CaseDetail.dc.html"), page({ active: "cases", body: CD_BODY, extraCss: CD_CSS, height: 1180 }));

console.log("Cases, CaseDetail");
