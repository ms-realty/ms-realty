import fs from "node:fs";
import { page, icon, subnav } from "../shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

const AI_CSS = `
    .cap { display:grid; grid-template-columns:auto minmax(0,1fr) 118px 118px; gap:12px; align-items:center;
      padding:12px 16px; border-bottom:1px solid var(--border); font-size:13px; }
    .cap:last-child { border-bottom:0; }
    .cap b { font-size:13px; font-weight:600; color:var(--text-strong); display:block; }
    .cap em { font-style:normal; font-size:11px; color:var(--text-muted); }
    .yes { color:var(--success-600); font-weight:600; display:flex; align-items:center; gap:8px; }
    .no { color:var(--danger-600); font-weight:600; display:flex; align-items:center; gap:8px; }
    .dq { display:grid; grid-template-columns:auto minmax(0,1fr) 148px 128px 156px; gap:16px; align-items:center;
      padding:12px 16px; border-bottom:1px solid var(--border); }
    .dq:last-child { border-bottom:0; }
    .dq:hover { background:var(--tile); }
    .dq b { font-size:13px; font-weight:600; color:var(--text-strong); display:block; }
    .dq em { font-style:normal; font-size:13px; color:var(--text-muted); }
    .runstep { display:grid; grid-template-columns:26px minmax(0,1fr) 132px 104px; gap:12px; align-items:start;
      padding:12px 20px; border-bottom:1px solid var(--border); }
    .runstep:last-child { border-bottom:0; }
    .runstep b { font-size:13px; font-weight:600; display:block; }
    .runstep em { font-style:normal; font-size:11px; color:var(--text-muted); display:block; margin-top:4px; }
    .quote { margin-top:8px; padding:12px 12px; border-left:2px solid var(--border-control);
      background:var(--tile); font-size:13px; color:var(--text-body); border-radius:0 var(--r-sm) var(--r-sm) 0; }
`;

const HERMES_BODY = `      <div class="ph">
        <div><h1>Hermes</h1><p>The agency's own model, running on the agency's own hardware. It drafts and it checks. It never publishes, sends, prices, or redirects.</p></div>
        <div class="ph-actions">
          <span class="pill pill--warn"><i></i>Not configured — 2 secrets missing</span>
          <button class="btn btn--primary" type="button">${icon("gear", 15)}<span>Finish setup</span></button>
        </div>
      </div>
      ${subnav([["Work", "sparkles", true], ["Runs", "history"], ["What it may do", "shield"], ["Sources", "layers"], ["Audit", "list"]])}
      <div style="display:grid; grid-template-columns:minmax(0,1fr) 348px; gap:20px; align-items:start">
        <div style="display:grid; gap:16px">
          <section class="panel">
            <div class="panel-hd"><h2>Ask Hermes</h2><span class="sub">It answers only from approved records.</span></div>
            <div class="sect">
              <span class="in in--area" style="min-height:64px; color:var(--text-body)">Which listings in Sandanski
                under €80,000 have no German description, and what is missing from each before it can be published?</span>
              <div style="display:flex; align-items:center; gap:8px; margin-top:12px">
                <button class="btn btn--sm btn--primary" type="button" data-disabled="1">${icon("sparkles", 13)}<span>Prepare a plan</span></button>
                <span class="pill pill--sand">Read-only</span>
                <span style="margin-left:auto; font-size:11px" class="muted">Every answer names the records it used.</span>
              </div>
              <div class="note note--warn" style="margin-top:12px">${icon("alert", 15)}
                <span>Hermes cannot run until <span class="mono">HERMES_CHAT_COMPLETIONS_URL</span> and
                  <span class="mono">HERMES_API_KEY</span> are set. Everything below is from the last configured run.</span></div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-hd"><h2>Drafts waiting for a person</h2><span class="sub">11 · nothing here is visible to a customer</span></div>
${[
  ["languages","7 listing descriptions","DE 3 · NL 2 · EL 2 · translated from the approved Bulgarian","Translation","Blocks indexing","warn"],
  ["mail","Reply to Maria Petrova","Offers Thursday 11:00 or Friday 15:00 from the real calendar","Reply","Needs approval","warn"],
  ["image","Alt text for 312 photos","Describes what is visible; flags 9 with a face or a document","Media","Batch","sand"],
  ["file","Evidence summary · CASE-0013","Greek buyer tax-number step, from the case record","Case note","Needs approval","sand"],
  ["route","36 redirect proposals","One outcome per legacy URL, each with its crawl evidence","Migration","Needs approval","sand"],
].map(([ic, title, sub, kind, state, tone]) => `            <div class="dq">
              <span class="av" style="background:var(--brick-50); color:var(--brick-700)">${icon(ic, 14)}</span>
              <span style="min-width:0"><b>${title}</b><em>${sub}</em></span>
              <span><span class="pill pill--sand">${kind}</span></span>
              <span><span class="pill pill--${tone}"><i></i>${state}</span></span>
              <span style="display:flex; gap:8px; justify-content:flex-end">
                <button class="btn btn--sm btn--primary" type="button">Review</button>
                <button class="btn btn--sm" type="button">Discard</button></span>
            </div>`).join("\n")}
          </section>

          <section class="panel">
            <div class="panel-hd"><h2>What Hermes may and may not do</h2><span class="sub">Enforced in code, not by prompt</span></div>
${[
  ["Translate an approved description","Source text is fixed; property facts are copied, never restated", true],
  ["Draft a reply to an enquiry","From the lead record and the listing facts", true],
  ["Summarise evidence on a case","From documents already attached", true],
  ["Propose a redirect for a legacy URL","From the crawl and archive record", true],
  ["Describe what is visible in a photo","Flags faces, documents and plates for a person", true],
  ["Publish a page or mark a translation indexable","", false],
  ["Send a message to a customer","", false],
  ["Change a price or a redirect","", false],
  ["Approve a legal, tax or process claim","", false],
  ["Close a step on a transaction case","", false],
].map(([what, why, ok]) => `            <div class="cap">
              <span>${icon(ok ? "check" : "x", 15)}</span>
              <span><b>${what}</b>${why ? `<em>${why}</em>` : ""}</span>
              <span class="${ok ? "yes" : "no"}">${ok ? "May draft" : "Refused"}</span>
              <span class="muted">${ok ? "Human approves" : "Always a person"}</span>
            </div>`).join("\n")}
            <div class="savebar"><span style="font-size:13px" class="muted">The five refusals are a hard list in
              <span class="mono">hermes.mjs</span>. A prompt cannot widen them, and a refused action fails loudly rather than silently.</span></div>
          </section>
        </div>

        <div style="display:grid; gap:16px">
          <section class="panel">
            <div class="panel-hd"><h2>Setup</h2><span class="pill pill--warn"><i></i>2 of 4</span></div>
            <div class="sect" style="display:grid; gap:8px; font-size:13px">
              <div style="display:flex; gap:8px">${icon("check", 15)}<span>Model chosen — Hermes, open weights, self-hosted</span></div>
              <div style="display:flex; gap:8px">${icon("check", 15)}<span>Guardrails and refusals in force</span></div>
              <div style="display:flex; gap:8px; color:var(--warning-700)">${icon("alert", 15)}<span class="mono">HERMES_CHAT_COMPLETIONS_URL</span></div>
              <div style="display:flex; gap:8px; color:var(--warning-700)">${icon("alert", 15)}<span class="mono">HERMES_API_KEY</span></div>
              <button class="btn btn--sm btn--primary" type="button" style="margin-top:4px">Enter these two</button>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>What it reads</h2></div>
            <div class="sect" style="display:grid; gap:8px; font-size:13px">
              ${[["Approved listing facts","165 listings"],["Approved CMS guides","6 documents"],["Approved area guides","31 locations"],["Lead and case records","the ones you open"],["Crawl and archive evidence","457 URLs"]]
                .map(([a,b]) => `<div style="display:flex; justify-content:space-between"><span>${a}</span><span class="muted">${b}</span></div>`).join("")}
              <div class="note note--info" style="margin-top:4px">${icon("lock", 14)}<span>Contact details are decrypted only for the one lead a draft is about, and the value never enters the draft.</span></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Last 30 days</h2></div>
            <div class="sect" style="display:grid; gap:8px; font-size:13px">
              <div style="display:flex; justify-content:space-between"><span>Drafts produced</span><b>148</b></div>
              <div style="display:flex; justify-content:space-between"><span>Accepted as written</span><b>96</b></div>
              <div style="display:flex; justify-content:space-between"><span>Accepted after edits</span><b>34</b></div>
              <div style="display:flex; justify-content:space-between"><span>Rejected</span><b>18</b></div>
              <div style="display:flex; justify-content:space-between"><span>Refused by a guardrail</span><b>7</b></div>
              <div class="note note--info" style="margin-top:4px">${icon("alert", 14)}<span>Five of the seven refusals were a Sandanski sea claim in a translated marketing line.</span></div>
            </div>
          </section>
        </div>
      </div>`;
fs.writeFileSync(W("Hermes.dc.html"), page({ active: "hermes", body: HERMES_BODY, extraCss: AI_CSS, height: 1240 }));

/* --------------------------------------------------------------- Hermes run */
const RUN_BODY = `      <div class="crumbs" style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text-muted); margin-bottom:12px">
        <a href="#">Hermes</a> ${icon("chevron", 13)} <a href="#">Runs</a> ${icon("chevron", 13)}
        <b style="color:var(--text-strong)">run-2026-08-31-0142</b>
      </div>
      <div class="ph">
        <div><h1>Translate 7 descriptions into German, Dutch and Greek</h1>
          <p>Started by Mariya, 31 August 09:04 · finished in 2 min 18 s · <span class="mono">run-2026-08-31-0142</span></p></div>
        <div class="ph-actions">
          <span class="pill pill--warn"><i></i>Waiting for approval</span>
          <button class="btn" type="button">${icon("copy", 15)}<span>Repeat</span></button>
          <button class="btn btn--primary" type="button">Review the 7 drafts</button>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:20px; align-items:start">
        <section class="panel">
          <div class="panel-hd"><h2>What it did, in order</h2><span class="sub">Every step names its source</span></div>
          <div class="runstep">
            <span class="av" style="background:var(--success-50); color:var(--success-600)">${icon("check", 13)}</span>
            <span><b>Read the approved Bulgarian descriptions</b>
              <em>7 listings · source hash recorded for each, so a later edit invalidates the draft</em></span>
            <span class="mono">09:04:11</span><span class="muted" style="font-size:13px">0.4 s</span>
          </div>
          <div class="runstep">
            <span class="av" style="background:var(--success-50); color:var(--success-600)">${icon("check", 13)}</span>
            <span><b>Copied the property facts verbatim</b>
              <em>Price, area, bedrooms, location, reference and source URL are moved, never re-expressed</em>
              <div class="quote">MS-00932 · €54,500 · 96 m² · 3 bedrooms · Katuntsi · makler-realty.com/obj/0032.html</div></span>
            <span class="mono">09:04:19</span><span class="muted" style="font-size:13px">1.1 s</span>
          </div>
          <div class="runstep">
            <span class="av" style="background:var(--success-50); color:var(--success-600)">${icon("check", 13)}</span>
            <span><b>Drafted 21 translations</b>
              <em>7 listings × 3 languages · tone rules applied · no marketing claim added</em>
              <div class="quote">Renoviertes Dorfhaus mit Garten in Katunzi. Das Haus hat 96 m² Wohnfläche,
                drei Schlafzimmer und einen eigenen Garten. Preis: 54.500 EUR.</div></span>
            <span class="mono">09:05:02</span><span class="muted" style="font-size:13px">1 m 43 s</span>
          </div>
          <div class="runstep">
            <span class="av" style="background:var(--warning-50); color:var(--warning-700)">${icon("alert", 13)}</span>
            <span><b>Refused two lines and rewrote them</b>
              <em>A Greek draft called Sandanski a coastal town. The claim is on the forbidden list, so the
                sentence was dropped rather than softened.</em>
              <div class="quote" style="border-left-color:var(--warning-700)">Rejected: «παραθαλάσσια πόλη Σαντάνσκι»
                → replaced with the approved description of the spa town.</div></span>
            <span class="mono">09:06:12</span><span class="muted" style="font-size:13px">0.8 s</span>
          </div>
          <div class="runstep">
            <span class="av" style="background:var(--success-50); color:var(--success-600)">${icon("check", 13)}</span>
            <span><b>Checked every draft against its source</b>
              <em>Facts compared field by field · 21 of 21 match · 3 SEO titles were over 60 characters and were shortened</em></span>
            <span class="mono">09:06:20</span><span class="muted" style="font-size:13px">2.1 s</span>
          </div>
          <div class="runstep">
            <span class="av" style="background:var(--joint); color:var(--marble-700)">${icon("lock", 13)}</span>
            <span><b>Stopped at the approval boundary</b>
              <em>Marking a translation indexable is a refused action. The 21 drafts are stored unpublished and
                appear in the translation queue.</em></span>
            <span class="mono">09:06:22</span><span class="muted" style="font-size:13px">—</span>
          </div>
        </section>
        <div style="display:grid; gap:16px">
          <section class="panel">
            <div class="panel-hd"><h2>Cost and model</h2></div>
            <div class="sect" style="display:grid; gap:8px; font-size:13px">
              <div style="display:flex; justify-content:space-between"><span>Model</span><span class="mono">hermes-3-70b</span></div>
              <div style="display:flex; justify-content:space-between"><span>Where it ran</span><span class="muted">Agency hardware</span></div>
              <div style="display:flex; justify-content:space-between"><span>Tokens in / out</span><span class="mono">41,208 / 9,644</span></div>
              <div style="display:flex; justify-content:space-between"><span>Left the building</span><b style="color:var(--success-600)">Nothing</b></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Audit entry</h2></div>
            <div class="sect" style="font-size:13px; color:var(--text-body)">
              <p class="mono" style="white-space:pre-wrap; font-size:11px; line-height:1.6">{
  "action": "hermes_translation_draft",
  "actor": "hermes",
  "requested_by": "mariya.ruseva",
  "listings": 7,
  "locales": ["de","nl","el"],
  "published": false,
  "refusals": 2
}</p>
              <p class="muted" style="margin-top:8px">Written to the append-only audit log. A registered action
                is the only way a run can record anything at all.</p>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>If you approve</h2></div>
            <div class="sect" style="display:grid; gap:8px; font-size:13px">
              <div style="display:flex; gap:8px">${icon("check", 15)}<span>21 descriptions become indexable in DE, NL and EL.</span></div>
              <div style="display:flex; gap:8px">${icon("check", 15)}<span>The sitemap picks them up on the next build.</span></div>
              <div style="display:flex; gap:8px">${icon("check", 15)}<span>Your name goes on each one.</span></div>
              <button class="btn btn--sm btn--primary" type="button" style="margin-top:4px">Review them one by one</button>
            </div>
          </section>
        </div>
      </div>`;
fs.writeFileSync(W("HermesRun.dc.html"), page({ active: "hermes", body: RUN_BODY, extraCss: AI_CSS, height: 1120 }));

console.log("Hermes, HermesRun");
