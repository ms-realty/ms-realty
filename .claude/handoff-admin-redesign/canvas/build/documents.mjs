import fs from "node:fs";
import { page, icon, subnav } from "../shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

const DOC_CSS = `
    .dr { display:grid; grid-template-columns:34px minmax(0,1fr) 136px 112px; gap:13px;
      align-items:center; padding:11px 16px; border-bottom:1px solid var(--border); }
    .dr:last-child { border-bottom:0; }
    .dr:hover { background:var(--stone-50); }
    .dr-ic { display:grid; place-items:center; width:34px; height:34px; border-radius:var(--r-md);
      background:var(--stone-100); color:var(--stone-700); }
    .dr-main { display:grid; gap:2px; min-width:0; }
    .dr-main b { font-size:13.5px; font-weight:600; color:var(--text-strong); overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; }
    .dr-main span { font-size:12px; color:var(--text-muted); }
    .tmpl { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:12px; align-items:center;
      padding:12px 16px; border-bottom:1px solid var(--border); }
    .tmpl:last-child { border-bottom:0; }
    .tmpl b { font-size:13px; font-weight:600; display:block; }
    .tmpl span { font-size:12px; color:var(--text-muted); }
    .chk { display:grid; grid-template-columns:auto minmax(0,1fr) 118px 96px; gap:12px; align-items:center;
      padding:10px 16px; border-bottom:1px solid var(--border); }
    .chk:last-child { border-bottom:0; }
`;

const DOC_BODY = `      <div class="ph">
        <div><h1>Documents</h1><p>What each case owes, what has been produced, and what is out for signature. Three items are late.</p></div>
        <div class="ph-actions">
          <button class="btn" type="button">${icon("upload", 15)}<span>Upload</span></button>
          <button class="btn btn--primary" type="button">${icon("plus", 15)}<span>New document</span></button>
        </div>
      </div>
      ${subnav([["All documents", "file", true], ["Awaiting signature", "sign"], ["Case checklists", "checkbox"], ["Templates", "layers"]])}
      <div style="display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:20px; align-items:start">
        <div style="display:grid; gap:16px">
          <section class="panel">
            <div class="toolbar">
              <span class="find">${icon("search", 14)}Document, case or client</span>
              <button class="btn btn--sm" type="button">Any kind ${icon("down", 13)}</button>
              <button class="btn btn--sm" type="button">Any case ${icon("down", 13)}</button>
              <span style="margin-left:auto" class="mono">Newest first</span>
            </div>
${[
  ["filesign","Preliminary purchase contract","CASE-0007 · Anna Weber · villa, Katuntsi","Out for signature","warn","1 of 2 signed","Mariya Ruseva","today 09:12", true],
  ["file","Evidence pack summary","CASE-0007 · cadastre, register, energy certificate","Draft","ai","Hermes draft · needs review","Hermes","today 08:40", true],
  ["filesign","Agency mandate","CASE-0011 · Elena Dimitrova · house, Sandanski","Signed","ok","Both parties · 18 Aug","Mariya Ruseva","18 Aug", false],
  ["file","Proof of funds request","CASE-0007 · to Raiffeisen Bank","Sent","sea","No answer for 3 days","Mariya Ruseva","29 Aug", false],
  ["filesign","Tenancy agreement","CASE-0009 · Georgi Nikolov · 1-bed, centre","Draft","sand","Waiting on the landlord's terms","Petar Dimitrov","28 Aug", false],
  ["file","Deposit terms note","CASE-0009 · two months, held by the agency","Approved","ok","Reviewed by the lawyer","Petar Dimitrov","27 Aug", false],
  ["file","Greek buyer tax-number application","CASE-0013 · Kostas Papadakis","Draft","ai","Hermes draft · needs review","Hermes","26 Aug", true],
].map(([ic, title, ctx, state, tone, note, who, when, flag]) => `            <div class="dr">
              <span class="dr-ic">${icon(ic, 17)}</span>
              <span class="dr-main"><b>${title}</b><span>${ctx}</span>
                <span style="font-size:11.5px" class="muted">${note} · ${who} · ${when}</span></span>
              <span><span class="pill pill--${tone}">${tone === "ai" ? icon("sparkles", 11) : "<i></i>"}${state}</span></span>
              <span style="display:flex; justify-content:flex-end">
                ${flag ? `<button class="btn btn--sm btn--primary" type="button">Review</button>` : `<button class="btn btn--sm" type="button">Open</button>`}</span>
            </div>`).join("\n")}
          </section>

          <section class="panel">
            <div class="panel-hd"><h2>Case checklist — CASE-0007, buyer purchase</h2><span class="sub">4 of 7 complete</span></div>
            <div style="padding:12px 16px 0"><div class="prog" style="height:6px; border-radius:99px; background:var(--stone-200); overflow:hidden"><i style="display:block; height:100%; width:57%; background:var(--success-500)"></i></div></div>
${[
  ["done","Requirements and timeline confirmed","Mariya · 11 Jul"],
  ["done","Identity details reviewed by the responsible professional","Mariya · 14 Jul"],
  ["done","Independent legal due-diligence step confirmed","Lawyer · 24 Jul"],
  ["done","Offer or reservation record reviewed","Mariya · 4 Aug"],
  ["block","Funding or proof-of-funds process reviewed","Blocked on the bank since 29 Aug"],
  ["open","Contract review responsibility confirmed","Due before 8 Sep"],
  ["open","Closing and handover evidence recorded","After the deed"],
].map(([st, label, note]) => `            <div class="chk">
              <span class="box"${st === "done" ? ' data-on="1"' : ""}${st === "block" ? ' style="border-color:var(--danger-600)"' : ""}></span>
              <span style="font-size:13px; ${st === "done" ? "color:var(--text-muted); text-decoration:line-through" : "font-weight:500; color:var(--text-strong)"}">${label}</span>
              <span style="font-size:12px" class="muted">${note}</span>
              <span style="display:flex; justify-content:flex-end">${st === "open"
                ? `<button class="btn btn--sm" type="button">Record</button>`
                : st === "block" ? `<button class="btn btn--sm btn--primary" type="button">Chase</button>` : `<span class="muted" style="font-size:12px">Recorded</span>`}</span>
            </div>`).join("\n")}
            <div class="savebar"><span style="font-size:12px" class="muted">Completing an item needs a note or an internal reference, and a named human confirmation. Hermes cannot tick these.</span></div>
          </section>
        </div>

        <div style="display:grid; gap:16px">
          <section class="panel">
            <div class="panel-hd"><h2>Templates</h2><a href="#" style="font-size:12.5px; font-weight:600">Manage</a></div>
${[
  ["Preliminary purchase contract","BG · buyer purchase · lawyer-reviewed"],
  ["Agency mandate","BG · seller sale · 2 variants"],
  ["Tenancy agreement","BG · tenant and landlord"],
  ["Short-let management agreement","BG · includes ESTI reporting duties"],
  ["Greek purchase preliminary","GR · engineer certificate annex"],
].map(([n, s]) => `            <div class="tmpl">${icon("layers", 17)}
              <span><b>${n}</b><span>${s}</span></span>
              <button class="btn btn--sm" type="button">Use</button></div>`).join("\n")}
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>What Hermes may do here</h2><span class="pill pill--ai">${icon("sparkles", 11)}Drafts only</span></div>
            <div class="sect" style="display:grid; gap:8px; font-size:12.5px">
              <div style="display:flex; gap:9px">${icon("check", 15)}<span>Fill a template from the case record and flag every field it could not source.</span></div>
              <div style="display:flex; gap:9px">${icon("check", 15)}<span>Summarise an uploaded document and list what it is missing.</span></div>
              <div style="display:flex; gap:9px">${icon("check", 15)}<span>Draft the covering message that goes with it.</span></div>
              <div style="display:flex; gap:9px; color:var(--danger-600)">${icon("x", 15)}<span>Send, sign, or countersign anything. A person does that, and is named on it.</span></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Retention</h2></div>
            <div class="sect" style="font-size:12.5px; color:var(--text-body)">
              Transaction documents are held for the statutory period and survive a consent withdrawal.
              Everything else follows the workspace retention window.
              <p style="margin-top:8px" class="muted">Next scheduled deletion: 14 documents on 1 October.</p>
            </div>
          </section>
        </div>
      </div>`;
fs.writeFileSync(W("Documents.dc.html"), page({ active: "documents", body: DOC_BODY, extraCss: DOC_CSS, height: 1180 }));

/* ------------------------------------------------------- Document composer */
const ED_CSS = `
    .paper { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-sm);
      padding:36px 44px; font-size:13px; line-height:1.7; color:var(--text-body); box-shadow:var(--e-1); }
    .paper h4 { font-family:var(--font-display); font-size:17px; font-weight:600; margin-bottom:14px; }
    .paper p { margin-bottom:11px; }
    .fill { background:var(--sea-50); border-bottom:1px solid var(--sea-200); padding:0 3px; font-weight:600;
      color:var(--sea-700); }
    .gap { background:var(--warning-50); border-bottom:1px dashed var(--warning-700); padding:0 3px;
      font-weight:600; color:var(--warning-700); }
    .side-sect { padding:14px 16px; border-bottom:1px solid var(--border); }
    .side-sect:last-child { border-bottom:0; }
    .side-sect > b { display:block; font-size:12.5px; margin-bottom:9px; }
    .src { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:9px; align-items:center;
      padding:7px 0; font-size:12.5px; }
    .signer { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:10px; align-items:center;
      padding:9px 0; border-bottom:1px solid var(--border); }
    .signer:last-child { border-bottom:0; }
    .signer b { font-size:12.5px; font-weight:600; display:block; }
    .signer span { font-size:11.5px; color:var(--text-muted); }
`;
const ED_BODY = `      <div class="crumbs" style="display:flex; align-items:center; gap:7px; font-size:12px; color:var(--text-muted); margin-bottom:10px">
        <a href="#">Documents</a> ${icon("chevron", 13)} <a href="#">CASE-0007</a> ${icon("chevron", 13)}
        <b style="color:var(--text-strong)">Preliminary purchase contract</b>
      </div>
      <div class="ph">
        <div><h1>Preliminary purchase contract</h1>
          <p>From the lawyer-reviewed Bulgarian template · filled from CASE-0007 · <span class="mono">v4</span>, saved 09:12</p></div>
        <div class="ph-actions">
          <span class="pill pill--warn"><i></i>2 fields need a person</span>
          <button class="btn" type="button">${icon("history", 15)}<span>Versions</span></button>
          <button class="btn" type="button">${icon("download", 15)}<span>PDF</span></button>
          <button class="btn btn--primary" type="button">${icon("sign", 15)}<span>Send for signature</span></button>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:minmax(0,1fr) 348px; gap:20px; align-items:start">
        <section class="panel">
          <div class="toolbar">
            <button class="btn btn--sm" type="button">Bulgarian ${icon("down", 13)}</button>
            <button class="btn btn--sm" type="button">${icon("edit", 13)}<span>Edit</span></button>
            <button class="btn btn--sm" type="button">${icon("eye", 13)}<span>Compare with v3</span></button>
            <span class="pill pill--ai" style="margin-left:auto">${icon("sparkles", 11)}Filled by Hermes · unreviewed</span>
          </div>
          <div style="padding:20px; background:var(--stone-100)">
            <div class="paper">
              <h4>ПРЕДВАРИТЕЛЕН ДОГОВОР ЗА ПОКУПКО-ПРОДАЖБА НА НЕДВИЖИМ ИМОТ</h4>
              <p>Днес, <span class="fill">4 септември 2026 г.</span>, в гр. <span class="fill">Сандански</span>,
                между <span class="fill">Katuntsi Estates OOD</span>, ЕИК <span class="fill">205118342</span>,
                наричан по-долу ПРОДАВАЧ, и <span class="fill">Anna Weber</span>, гражданин на
                <span class="fill">Германия</span>, наричан по-долу КУПУВАЧ, се сключи настоящият договор.</p>
              <p><b>Чл. 1.</b> ПРОДАВАЧЪТ се задължава да прехвърли на КУПУВАЧА правото на собственост върху
                <span class="fill">вила със застроена площ 214 кв. м</span> в землището на
                <span class="fill">с. Катунци, общ. Сандански</span>, идентификатор
                <span class="fill">36693.501.114</span>, при цена <span class="fill">185 000 EUR</span>.</p>
              <p><b>Чл. 2.</b> КУПУВАЧЪТ е заплатил задатък в размер на <span class="gap">[сума на задатъка]</span>,
                платен на <span class="fill">4 август 2026 г.</span></p>
              <p><b>Чл. 3.</b> Окончателният договор ще бъде сключен пред нотариус
                <span class="fill">Иванова</span> на <span class="fill">8 септември 2026 г.</span></p>
              <p><b>Чл. 4.</b> Настоящият договор се разваля без последици за КУПУВАЧА, ако
                <span class="gap">[условие за одобрение на ипотечен кредит]</span> не бъде изпълнено до
                <span class="fill">5 септември 2026 г.</span></p>
            </div>
          </div>
        </section>
        <div style="display:grid; gap:16px">
          <section class="panel">
            <div class="panel-hd"><h2>Two fields need a person</h2><span class="pill pill--warn"><i></i>2</span></div>
            <div class="side-sect">
              <b>Reservation amount — article 2</b>
              <p style="font-size:12px; color:var(--text-muted); margin-bottom:9px">The case records that a
                reservation was received on 4 August but not the amount. Hermes will not guess a figure that
                goes into a contract.</p>
              <span class="in in--empty">Enter the amount in EUR</span>
            </div>
            <div class="side-sect">
              <b>Mortgage condition wording — article 4</b>
              <p style="font-size:12px; color:var(--text-muted); margin-bottom:9px">The case carries the
                condition and its deadline, but the wording is a legal choice.</p>
              <button class="btn btn--sm" type="button">Use the lawyer's standard clause</button>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Where each value came from</h2></div>
            <div class="side-sect" style="padding-top:6px; padding-bottom:8px">
              ${[
                ["Buyer, nationality", "Contact record"],
                ["Seller, company number", "Company record"],
                ["Property, area, identifier", "Cadastral sketch, 22 Jul"],
                ["Price", "Accepted offer, 4 Aug"],
                ["Notary and date", "Case CASE-0007"],
              ].map(([a, b]) => `<div class="src">${icon("check", 14)}<span>${a}</span><span class="muted" style="font-size:11.5px">${b}</span></div>`).join("")}
              <div class="note note--ai" style="margin-top:8px">${icon("sparkles", 14)}<span>Every filled value is traceable to a record. Nothing here was written from memory.</span></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Signature</h2></div>
            <div class="side-sect">
              <div class="signer"><span class="av">AW</span>
                <span><b>Anna Weber</b><span>Buyer · signs first</span></span>
                <span class="pill pill--ok"><i></i>Signed</span></div>
              <div class="signer"><span class="av">KE</span>
                <span><b>Katuntsi Estates OOD</b><span>Seller · Todor Katsarov</span></span>
                <span class="pill pill--warn"><i></i>Waiting</span></div>
              <div class="signer"><span class="av">MR</span>
                <span><b>Mariya Ruseva</b><span>Agency witness</span></span>
                <span class="pill pill--sand"><i></i>After both</span></div>
            </div>
            <div class="savebar">
              <button class="btn btn--sm btn--primary" type="button">${icon("send", 13)}<span>Remind the seller</span></button>
              <span style="margin-left:auto; font-size:11.5px" class="muted">Sent 09:12 today</span>
            </div>
          </section>
        </div>
      </div>`;
fs.writeFileSync(W("DocumentEditor.dc.html"), page({ active: "documents", body: ED_BODY, extraCss: ED_CSS, height: 1080 }));

console.log("Documents, DocumentEditor");
