import fs from "node:fs";
import { page, icon, subnav } from "../shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

/* --------------------------------------------------------------- Documents
   One table of documents on grout, full width, 44px a row: the document, the
   case it belongs to (client and property, reference as a caption), its
   status, where it stands, and the witness. Below it the checklist for the
   case that needs a person, with the outcome form the server asks for drawn
   open on the item that is due. */
const DOC_CSS = `
    .dc-doc { display:flex; align-items:center; gap:12px; min-width:0; }
    .dc-doc svg { flex:0 0 auto; color:var(--text-muted); }
    .dc-doc b { font-size:13px; font-weight:600; color:var(--text-strong); overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; }
    .dc-case { display:flex; align-items:baseline; gap:8px; min-width:0; }
    .dc-case span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .dc-act { display:flex; justify-content:flex-end; white-space:nowrap; }
    .dc-cols { display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:20px; align-items:start; margin-top:20px; }
    .dc-side { display:grid; gap:20px; }
    .dc-prog { padding:12px 20px; border-bottom:1px solid var(--joint); }
    .dc-chk { display:grid; grid-template-columns:16px minmax(0,1fr) 200px 88px; gap:16px; align-items:center;
      min-height:var(--row); padding:8px 20px; border-bottom:1px solid var(--joint); }
    .dc-chk:hover { background:var(--tile); }
    .dc-label { font-weight:500; color:var(--text-strong); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .dc-chk[data-done] .dc-label { color:var(--text-muted); text-decoration:line-through; font-weight:400; }
    .dc-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 20px; padding:12px 20px 16px 48px;
      background:var(--tile); border-bottom:1px solid var(--joint); }
    .dc-confirm { display:flex; align-items:center; gap:12px; grid-column:1 / -1; }
    .dc-formrow { display:flex; align-items:center; gap:12px; grid-column:1 / -1; }
    .dc-tp { display:grid; grid-template-columns:18px minmax(0,1fr) auto; gap:12px; align-items:center;
      min-height:var(--row); padding:8px 20px; border-bottom:1px solid var(--joint); }
    .dc-tp:last-child { border-bottom:0; }
    .dc-tp svg { color:var(--text-muted); }
    .dc-may { display:flex; gap:12px; align-items:flex-start; min-height:var(--row); padding:12px 20px;
      border-bottom:1px solid var(--joint); }
    .dc-may:last-child { border-bottom:0; }
    .dc-may svg { flex:0 0 auto; margin-top:4px; color:var(--success-600); }
    .dc-may[data-no] { color:var(--danger-600); }
    .dc-may[data-no] svg { color:var(--danger-600); }
`;

const DOCS = [
  ["filesign", "Preliminary purchase contract", "Anna Weber · villa, Katuntsi", "CASE-0007", "Out for signature", "warn", "1 of 2 signed", `<span class="wit"><b>Mariya Ruseva</b>today 09:12</span>`, true],
  ["file", "Evidence pack summary", "cadastre, register, energy certificate", "CASE-0007", "Draft", "ai", "Hermes draft · needs review", `<span class="wit wit--none"><b>Hermes</b>today 08:40</span>`, true],
  ["filesign", "Agency mandate", "Elena Dimitrova · house, Sandanski", "CASE-0011", "Signed", "ok", "Both parties · 18 Aug", `<span class="wit"><b>Mariya Ruseva</b>18 Aug</span>`, false],
  ["file", "Proof of funds request", "to Raiffeisen Bank", "CASE-0007", "Sent", "sea", "No answer for 3 days", `<span class="wit"><b>Mariya Ruseva</b>29 Aug</span>`, false],
  ["filesign", "Tenancy agreement", "Georgi Nikolov · 1-bed, centre", "CASE-0009", "Draft", "sand", "Waiting on the landlord's terms", `<span class="wit"><b>Petar Dimitrov</b>28 Aug</span>`, false],
  ["file", "Deposit terms note", "two months, held by the agency", "CASE-0009", "Approved", "ok", "Reviewed by the lawyer", `<span class="wit"><b>Petar Dimitrov</b>27 Aug</span>`, false],
  ["file", "Greek buyer tax-number application", "Kostas Papadakis", "CASE-0013", "Draft", "ai", "Hermes draft · needs review", `<span class="wit wit--none"><b>Hermes</b>26 Aug</span>`, true],
];

const CHECKLIST = [
  ["done", "Requirements and timeline confirmed", `<span class="wit"><b>Mariya Ruseva</b>11 Jul</span>`],
  ["done", "Identity details reviewed by the responsible professional", `<span class="wit"><b>Mariya Ruseva</b>14 Jul</span>`],
  ["done", "Independent legal due-diligence step confirmed", `<span class="wit"><b>Lawyer</b>24 Jul</span>`],
  ["done", "Offer or reservation record reviewed", `<span class="wit"><b>Mariya Ruseva</b>4 Aug</span>`],
  ["block", "Funding or proof-of-funds process reviewed", `<span class="wit wit--none"><b>Bank</b>blocked since 29 Aug</span>`],
  ["open", "Contract review responsibility confirmed", `<span class="wit wit--none">Due before 8 Sep</span>`],
  ["open", "Closing and handover evidence recorded", `<span class="wit wit--none">After the deed</span>`],
];
const OUTCOME_FORM = `            <div class="dc-form">
              <div class="field"><label>Outcome <em>*</em></label><span class="in" style="justify-content:space-between">Complete ${icon("down", 14)}</span></div>
              <div class="field"><label>Internal reference (optional)</label><span class="in"></span></div>
              <div class="field full"><label>Review note <em>*</em></label><span class="in in--area"></span></div>
              <label class="dc-confirm"><span class="box"></span><span>I confirm this outcome was reviewed and is not an automatic legal approval.</span></label>
              <div class="dc-formrow"><button class="btn btn--sm" type="button">Save outcome</button><span class="hint">Recorded as Mariya Ruseva, with the time.</span></div>
            </div>`;

const DOC_BODY = `      <div class="ph">
        <div><h1>Documents</h1><p>What each case owes, what has been produced, and what is out for signature. Three items are late.</p></div>
        <div class="ph-actions">
          <button class="btn" type="button">${icon("upload", 16)}<span>Upload</span></button>
          <button class="btn btn--accent" type="button">${icon("plus", 16)}<span>New document</span></button>
        </div>
      </div>
      ${subnav([["All documents", "file", true], ["Awaiting signature", "sign"], ["Case checklists", "checkbox"], ["Templates", "layers"]])}
      <section class="panel">
        <div class="toolbar">
          <span class="find">${icon("search", 14)}Document, case or client</span>
          <button class="btn btn--sm" type="button">Any kind ${icon("down", 14)}</button>
          <button class="btn btn--sm" type="button">Any case ${icon("down", 14)}</button>
          <span style="margin-left:auto" class="mono">Newest first</span>
        </div>
        <table>
          <thead><tr>
            <th>Document</th><th style="width:96px">Case</th><th style="width:96px">Status</th>
            <th style="width:96px">Now</th><th style="width:96px">Confirmed by</th><th style="width:96px"></th>
          </tr></thead>
          <tbody>
${DOCS.map(([ic, title, ctx, ref, state, tone, note, wit, flag]) => `            <tr>
              <td><span class="dc-doc">${icon(ic, 18)}<b>${title}</b></span></td>
              <td><span class="dc-case"><span>${ctx}</span><span class="mono">${ref}</span></span></td>
              <td><span class="pill pill--${tone}">${tone === "ai" ? icon("sparkles", 11) : "<i></i>"}${state}</span></td>
              <td><span class="muted">${note}</span></td>
              <td>${wit}</td>
              <td><span class="dc-act">${flag
                ? `<button class="btn btn--sm" type="button">Review</button>`
                : `<button class="btn btn--sm btn--ghost" type="button">Open</button>`}</span></td>
            </tr>`).join("\n")}
          </tbody>
        </table>
      </section>
      <div class="dc-cols">
        <section class="panel">
          <div class="panel-hd"><h2>Checklist — Anna Weber · villa, Katuntsi</h2><span class="sub">CASE-0007 · buyer purchase · 4 of 7 complete</span></div>
          <div class="dc-prog"><div class="prog"><i style="width:57%"></i></div></div>
${CHECKLIST.map(([st, label, wit], i) => `          <div class="dc-chk"${st === "done" ? ' data-done="1"' : ""}>
            <span class="box"${st === "done" ? ' data-on="1"' : ""}${st === "block" ? ' style="border-color:var(--danger-600)"' : ""}></span>
            <span class="dc-label">${label}</span>
            ${wit}
            <span class="dc-act">${st === "open"
              ? `<button class="btn btn--sm" type="button"${i === 5 ? ' data-focus="1"' : ""}>Record</button>`
              : st === "block" ? `<button class="btn btn--sm" type="button">Chase</button>` : `<span class="muted">Recorded</span>`}</span>
          </div>${i === 5 ? `\n${OUTCOME_FORM}` : ""}`).join("\n")}
          <div class="savebar"><span class="muted">Completing an item needs a note or an internal reference, and a named human confirmation. Hermes cannot tick these.</span></div>
        </section>
        <div class="dc-side">
          <section class="panel">
            <div class="panel-hd"><h2>Templates</h2><a href="#">Manage</a></div>
${[
  ["Preliminary purchase contract", "BG · buyer purchase · lawyer-reviewed"],
  ["Agency mandate", "BG · seller sale · 2 variants"],
  ["Tenancy agreement", "BG · tenant and landlord"],
  ["Short-let management agreement", "BG · includes ESTI reporting duties"],
  ["Greek purchase preliminary", "GR · engineer certificate annex"],
].map(([n, s]) => `            <div class="dc-tp">${icon("layers", 18)}
              <span class="t2"><b>${n}</b><span>${s}</span></span>
              <button class="btn btn--sm btn--ghost" type="button">Use</button></div>`).join("\n")}
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>What Hermes may do here</h2><span class="pill pill--ai">${icon("sparkles", 11)}Drafts only</span></div>
            <div class="dc-may">${icon("check", 16)}<span>Fill a template from the case record and flag every field it could not source.</span></div>
            <div class="dc-may">${icon("check", 16)}<span>Summarise an uploaded document and list what it is missing.</span></div>
            <div class="dc-may">${icon("check", 16)}<span>Draft the covering message that goes with it.</span></div>
            <div class="dc-may" data-no="1">${icon("x", 16)}<span>Send, sign, or countersign anything. A person does that, and is named on it.</span></div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Retention</h2></div>
            <div class="sect">
              Transaction documents are held for the statutory period and survive a consent withdrawal.
              Everything else follows the workspace retention window.
              <p style="margin-top:8px" class="muted">Next scheduled deletion: 14 documents on 1 October.</p>
            </div>
          </section>
        </div>
      </div>`;
fs.writeFileSync(W("Documents.dc.html"), page({ active: "documents", body: DOC_BODY, extraCss: DOC_CSS, height: 1180 }));

/* ------------------------------------------------------- Document composer
   The contract is the panel: one frame, the text flat on the surface, filled
   values marked spring and the two gaps marked warning. The revision carries
   its witness (nobody has reviewed v4), every filled value names the record it
   came from, and the signature request shows its provider and its status. */
const ED_CSS = `
    .ed-cols { display:grid; grid-template-columns:minmax(0,1fr) 348px; gap:20px; align-items:start; }
    .ed-side { display:grid; gap:20px; }
    .ed-state { display:flex; align-items:center; gap:12px; margin-left:auto; }
    .ed-doc { padding:32px 48px; line-height:1.7; color:var(--text-body); }
    .ed-doc h4 { font-size:16px; font-weight:600; margin-bottom:16px; }
    .ed-doc p { margin-bottom:12px; }
    .ed-doc p:last-child { margin-bottom:0; }
    .ed-fill { background:var(--spring-50); border-bottom:1px solid var(--spring-200); padding:0 4px; font-weight:600;
      color:var(--spring-800); }
    .ed-gap { background:var(--warning-50); border-bottom:1px dashed var(--warning-700); padding:0 4px;
      font-weight:600; color:var(--warning-700); }
    .ed-src { display:grid; grid-template-columns:16px minmax(0,1fr) auto; gap:12px; align-items:center;
      min-height:var(--row); padding:0 20px; border-bottom:1px solid var(--joint); }
    .ed-src svg { color:var(--success-600); }
    .ed-req { display:grid; gap:8px; padding:12px 20px; border-bottom:1px solid var(--joint); }
    .ed-signer { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:12px; align-items:center;
      min-height:var(--row); padding:8px 20px; border-bottom:1px solid var(--joint); }
`;
const ED_BODY = `      <div class="crumbs">
        <a href="#">Documents</a>${icon("chevron", 13)}<a href="#">CASE-0007</a>${icon("chevron", 13)}<b>Preliminary purchase contract</b>
      </div>
      <div class="ph">
        <div><h1>Preliminary purchase contract</h1>
          <p>From the lawyer-reviewed Bulgarian template · filled from CASE-0007 · <span class="mono">v4</span>, saved 09:12</p></div>
        <div class="ph-actions">
          <span class="pill pill--warn"><i></i>2 fields need a person</span>
          <button class="btn" type="button">${icon("history", 16)}<span>Versions</span></button>
          <button class="btn" type="button">${icon("download", 16)}<span>PDF</span></button>
          <button class="btn btn--accent" type="button" data-disabled="1">${icon("sign", 16)}<span>Send for signature</span></button>
        </div>
      </div>
      <div class="ed-cols">
        <section class="panel">
          <div class="toolbar">
            <button class="btn btn--sm" type="button">Bulgarian ${icon("down", 14)}</button>
            <button class="btn btn--sm" type="button">${icon("edit", 14)}<span>Edit</span></button>
            <button class="btn btn--sm" type="button">${icon("eye", 14)}<span>Compare with v3</span></button>
            <span class="ed-state"><span class="pill pill--ai">${icon("sparkles", 11)}Filled by Hermes</span><span class="wit wit--none"><b>v4</b>unreviewed · saved 09:12</span></span>
          </div>
          <div class="ed-doc">
            <h4>ПРЕДВАРИТЕЛЕН ДОГОВОР ЗА ПОКУПКО-ПРОДАЖБА НА НЕДВИЖИМ ИМОТ</h4>
            <p>Днес, <span class="ed-fill">4 септември 2026 г.</span>, в гр. <span class="ed-fill">Сандански</span>,
              между <span class="ed-fill">Katuntsi Estates OOD</span>, ЕИК <span class="ed-fill">205118342</span>,
              наричан по-долу ПРОДАВАЧ, и <span class="ed-fill">Anna Weber</span>, гражданин на
              <span class="ed-fill">Германия</span>, наричан по-долу КУПУВАЧ, се сключи настоящият договор.</p>
            <p><b>Чл. 1.</b> ПРОДАВАЧЪТ се задължава да прехвърли на КУПУВАЧА правото на собственост върху
              <span class="ed-fill">вила със застроена площ 214 кв. м</span> в землището на
              <span class="ed-fill">с. Катунци, общ. Сандански</span>, идентификатор
              <span class="ed-fill">36693.501.114</span>, при цена <span class="ed-fill">185 000 EUR</span>.</p>
            <p><b>Чл. 2.</b> КУПУВАЧЪТ е заплатил задатък в размер на <span class="ed-gap">[сума на задатъка]</span>,
              платен на <span class="ed-fill">4 август 2026 г.</span></p>
            <p><b>Чл. 3.</b> Окончателният договор ще бъде сключен пред нотариус
              <span class="ed-fill">Иванова</span> на <span class="ed-fill">8 септември 2026 г.</span></p>
            <p><b>Чл. 4.</b> Настоящият договор се разваля без последици за КУПУВАЧА, ако
              <span class="ed-gap">[условие за одобрение на ипотечен кредит]</span> не бъде изпълнено до
              <span class="ed-fill">5 септември 2026 г.</span></p>
          </div>
        </section>
        <div class="ed-side">
          <section class="panel">
            <div class="panel-hd"><h2>Two fields need a person</h2><span class="pill pill--warn"><i></i>2</span></div>
            <div class="sect">
              <h3>Reservation amount — article 2</h3>
              <p class="muted" style="margin-bottom:12px">The case records that a reservation was received on 4 August but not the amount. Hermes will not guess a figure that goes into a contract.</p>
              <span class="in in--empty">Enter the amount in EUR</span>
            </div>
            <div class="sect">
              <h3>Mortgage condition wording — article 4</h3>
              <p class="muted" style="margin-bottom:12px">The case carries the condition and its deadline, but the wording is a legal choice.</p>
              <button class="btn btn--sm" type="button">Use the lawyer's standard clause</button>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Where each value came from</h2></div>
            ${[
              ["Buyer, nationality", `<span class="wit"><b>Contact record</b></span>`],
              ["Seller, company number", `<span class="wit"><b>Company record</b></span>`],
              ["Property, area, identifier", `<span class="wit"><b>Cadastral sketch</b>22 Jul</span>`],
              ["Price", `<span class="wit"><b>Accepted offer</b>4 Aug</span>`],
              ["Notary and date", `<span class="wit"><b>Case</b><span class="mono">CASE-0007</span></span>`],
            ].map(([a, b]) => `<div class="ed-src">${icon("check", 16)}<span>${a}</span>${b}</div>`).join("\n            ")}
            <div class="sect"><div class="note note--ai">${icon("sparkles", 16)}<span>Every filled value is traceable to a record. Nothing here was written from memory.</span></div></div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Signature</h2><span class="pill pill--warn"><i></i>Pending</span></div>
            <div class="ed-req">
              <div class="kvline"><span class="muted">Provider</span><b>Internal</b></div>
              <div class="kvline"><span class="muted">Request</span><b>1 of 2 signed</b></div>
            </div>
            <div class="ed-signer"><span class="av">AW</span>
              <span class="t2"><b>Anna Weber</b><span>Buyer · signs first</span></span>
              <span class="pill pill--ok"><i></i>Signed</span></div>
            <div class="ed-signer"><span class="av">KE</span>
              <span class="t2"><b>Katuntsi Estates OOD</b><span>Seller · Todor Katsarov</span></span>
              <span class="pill pill--warn"><i></i>Waiting</span></div>
            <div class="ed-signer"><span class="av">MR</span>
              <span class="t2"><b>Mariya Ruseva</b><span>Agency witness</span></span>
              <span class="pill pill--sand"><i></i>After both</span></div>
            <div class="savebar">
              <button class="btn btn--sm" type="button">${icon("send", 14)}<span>Remind the seller</span></button>
              <span class="wit" style="margin-left:auto"><b>Mariya Ruseva</b>sent 09:12 today</span>
            </div>
          </section>
        </div>
      </div>`;
fs.writeFileSync(W("DocumentEditor.dc.html"), page({ active: "documents", body: ED_BODY, extraCss: ED_CSS, height: 1080 }));

console.log("Documents, DocumentEditor");
