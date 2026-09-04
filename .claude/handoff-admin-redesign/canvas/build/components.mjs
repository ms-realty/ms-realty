import fs from "node:fs";
import { sheet, icon } from "../shell.mjs";

const CSS = `
  .cp { display:grid; gap:32px; }
  .cp h1 { font-size:22px; font-weight:600; }
  .cp h2,.cp h3 { font-size:16px; font-weight:600; }
  .cp p { max-width:72ch; }
  .cp-header { display:flex; justify-content:space-between; align-items:start; gap:24px; }
  .cp-header p { margin-top:8px; color:var(--text-muted); }
  .cp-section { display:grid; gap:16px; padding-top:20px; border-top:1px solid var(--joint); }
  .cp-pair { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:24px; align-items:start; }
  .cp-stack { display:grid; gap:16px; }
  .cp-sample { display:grid; gap:16px; padding:20px; border:1px solid var(--joint); border-radius:var(--r-panel); background:var(--surface); }
  .cp-line { display:flex; align-items:center; gap:12px; min-height:var(--row); border-bottom:1px solid var(--joint); }
  .cp-line > span:first-child { flex:1; min-width:0; }
  .cp-actions { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }
  .cp-states { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:16px; }
  .cp-state { display:grid; justify-items:start; gap:12px; padding:16px 0; border-top:1px solid var(--joint); }
  .cp-state p { color:var(--text-muted); }
  .cp .field { gap:8px; }
  .cp input,.cp textarea,.cp select { font:inherit; }
  .cp input:not([type=checkbox]),.cp textarea,.cp select { width:100%; }
  .cp textarea { resize:vertical; padding:12px; }
  .cp-check { display:flex; align-items:center; gap:12px; min-height:44px; }
  .cp-check input { width:20px; height:20px; accent-color:var(--ink-900); flex-shrink:0; }
  .cp .btn[disabled] { opacity:.5; cursor:not-allowed; }
  .cp .cp-hover { background:var(--sunken); }
  .cp-empty { display:grid; gap:12px; justify-items:start; padding:20px 0; }
  .cp-empty svg { color:var(--text-muted); }
  .cp-dialog { display:grid; gap:16px; padding:20px; border:1px solid var(--joint); border-radius:var(--r-panel); background:var(--surface); box-shadow:var(--e-float); }
  .cp-note { color:var(--text-muted); }
  .cp .toast span { color:var(--tile-glaze); }
  .cp-long { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cp-count { flex:0 0 auto; font-variant-numeric:tabular-nums; }
  .cp-section,.cp-sample,.cp-line { min-width:0; }
  .cp-sample > .pill { justify-self:start; }
  .cp .assist { border-color:var(--brick-700); }
`;

const BODY = `<main class="cp">
  <header class="cp-header"><div><h1>Components</h1><p>Read the fact, review the source, record the decision. Controls keep those steps visible.</p></div><span class="pill pill--ink">Illustrative states</span></header>
  <section class="cp-section"><h2>A person owns the change</h2><p class="cp-note">Design examples only. The people, values and receipts below do not record live approvals.</p>
    <div class="cp-pair">
      <div class="cp-sample" id="assignment"><h3>Assign Elena’s valuation enquiry</h3><p>Choose a broker and record why the enquiry is moving.</p>
        <div class="field"><label for="cp-assignee">Assign to</label><select class="in" id="cp-assignee" required><option>Petar Dimitrov</option><option>Mariya Ruseva</option></select></div>
        <div class="field"><label for="cp-reason">Reason <em>*</em></label><textarea class="in in--area" id="cp-reason" required>Petar is available for the requested viewing.</textarea></div>
        <label class="cp-check"><input type="checkbox" checked required><span>I, Mariya Ruseva, confirm this assignment and its reason.</span></label>
        <span class="wit wit--none">Waiting for Mariya’s confirmation</span>
        <div class="cp-actions"><button class="btn btn--accent" type="button">Confirm assignment</button><button class="btn btn--ghost" type="button">Cancel</button></div>
      </div>
      <div class="cp-stack"><div class="cp-sample"><h3>The resulting receipt</h3><div class="cp-line"><span>Assigned to Petar Dimitrov</span><span class="pill pill--ok">Recorded</span></div><span class="wit"><b>Mariya Ruseva</b> · 4 Sep 2026, 11:00</span><p>Reason: Petar is available for the requested viewing.</p><a href="#activity">View the activity record</a></div>
        <h3>Use the same boundary</h3><p>Media approval, document completion, consent withdrawal, condition waivers and lead snoozing also need a reason and a named human confirmation.</p>
        <div class="cp-actions"><a class="btn" href="#assignment">Review assignment</a><button class="assist" type="button">${icon("sparkles",16)}Draft a note</button></div>
        <p class="cp-note">Hermes may prepare text. Publishing, sending, indexing, price changes and redirect changes stay with a person.</p>
      </div>
    </div>
  </section>
  <section class="cp-section"><h2>Action states</h2><div class="cp-states">
    <div class="cp-state"><b>Default</b><button class="btn" type="button">Save draft</button><p>One clear verb.</p></div>
    <div class="cp-state"><b>Hover</b><button class="btn cp-hover" type="button">Save draft</button><p>The surface changes.</p></div>
    <div class="cp-state"><b>Focus</b><button class="btn" type="button" data-focus="1">Save draft</button><p>Keyboard position stays visible.</p></div>
    <div class="cp-state"><b>Disabled</b><button class="btn" type="button" disabled>Save draft</button><p>Add a note first.</p></div>
    <div class="cp-state"><b>Loading</b><button class="btn" type="button" disabled aria-busy="true">${icon("clock",16)}Saving…</button><p>Repeat submission is unavailable.</p></div>
  </div><div class="cp-actions"><button class="btn btn--sm" type="button">Compact · 32px</button><button class="btn" type="button">Standard · 36px</button><button class="btn btn--lg" type="button">Touch · 44px</button><button class="btn btn--danger" type="button">Review archive</button></div></section>
  <section class="cp-section"><h2>Fields explain what is missing</h2><div class="cp-pair">
    <div class="cp-sample"><div class="field"><label for="cp-name">Agency name</label><input class="in" id="cp-name" value="MS Realty"></div><div class="field"><label for="cp-email">Reply email</label><input class="in in--error" id="cp-email" type="email" value="office@" aria-invalid="true" aria-describedby="cp-email-error"><span class="hint hint--error" id="cp-email-error">Add the domain after @.</span></div><div class="field"><label for="cp-empty">Source note</label><input class="in" id="cp-empty" placeholder="Not set" aria-describedby="cp-source-hint"><span class="hint" id="cp-source-hint">Required before you can confirm the fact.</span></div></div>
    <div class="cp-sample"><div class="field"><label for="cp-locale">Working language</label><select class="in" id="cp-locale"><option>Bulgarian</option><option>Russian</option><option>English</option></select></div><div class="field"><label for="cp-date">Viewing date</label><input class="in" id="cp-date" type="date" value="2026-09-04"></div><label class="cp-check"><input type="checkbox" checked><span>Show completed tasks</span></label><p>Approval requirements are fixed. They are not preferences that an operator can switch off.</p><span class="pill pill--ink">Human approval required</span></div>
  </div></section>
  <section class="cp-section"><h2>One line per record</h2><div class="cp-sample">
    <div class="cp-actions"><div class="seg"><button type="button" data-on="1">All <em>28</em></button><button type="button">Needs reply <em>4</em></button><button type="button">Overdue <em>3</em></button></div><label for="cp-search">Search</label><input class="in" id="cp-search" type="search" placeholder="Name or reference" style="width:256px"><button class="btn" type="button">Save this view</button></div>
    <div class="cp-line"><span class="cp-long">Maria Petrova · enquiry about MS-00815</span><span class="wit wit--none">MR · review due</span><span class="pill pill--warn">Needs reply</span><button class="btn btn--sm" type="button">Open enquiry</button></div>
    <div class="cp-line"><span class="cp-long" lang="bg">Александрина Константинова Димитрова · Потвърдете информацията за имота</span><span class="cp-count">€1,245,000</span><span class="wit">MR · 4 Sep</span><button class="btn btn--sm" type="button">Open record</button></div>
    <p class="cp-note">The full name stays available in the record. Actions and the witness keep their own columns when a name grows.</p>
    <div class="cp-actions"><span class="pill pill--ok">Published</span><span class="pill pill--warn">Needs review</span><span class="pill pill--danger">Overdue</span><span class="pill pill--ink">Archived</span><span class="pill pill--ai">Hermes draft</span><span class="wit wit--none">Not checked</span><span class="wit">MR · 4 Sep</span></div>
  </div></section>
  <section class="cp-section"><h2>When the list cannot show everything</h2><div class="cp-pair">
    <div class="cp-state"><h3>Empty</h3><div class="cp-empty">${icon("inbox",28)}<b>No enquiries yet</b><p>New enquiries appear here when they arrive.</p><button class="btn" type="button">Log an enquiry</button></div></div>
    <div class="cp-state"><h3>Filtered to nothing</h3><div class="cp-empty">${icon("filter",28)}<b>No enquiries match</b><p>Overdue · unassigned · Greek</p><button class="btn" type="button">Clear filters</button></div></div>
    <div class="cp-state"><h3>Error</h3><div class="note note--warn">${icon("alert",18)}<span>We could not save your note. Keep this form open and try again.</span></div><button class="btn" type="button">Try again</button></div>
    <div class="cp-state"><h3>Partial</h3><div class="note note--info">${icon("alert",18)}<span>Enquiry details loaded. Matching properties are unavailable.</span></div><div class="cp-line"><span>Maria Petrova · enquiry received</span><span class="pill pill--warn">Matches unavailable</span></div><button class="btn" type="button">Retry matching</button></div>
    <div class="cp-state"><h3>Offline</h3><p>No connection. Reconnect before saving or confirming a change.</p><button class="btn" type="button" disabled>Save draft</button></div>
    <div class="cp-state"><h3>Too much data</h3><p>Showing 1–25 of 1,280 enquiries.</p><div class="cp-actions"><button class="btn" type="button" disabled>Previous</button><button class="btn" type="button">Next 25</button><button class="btn" type="button">Filter</button></div></div>
  </div></section>
  <section class="cp-section" id="activity"><h2>Feedback records what happened</h2><div class="cp-pair">
    <div class="cp-stack"><div class="toast">${icon("check",18)}<span><b>Reply sent to Maria Petrova</b><span>Mariya Ruseva · 4 Sep, 11:00</span></span><a href="#activity">View receipt</a></div><p>A delivered message cannot be recalled through an Undo control. A failed send keeps its error and offers a reviewed retry.</p><div class="toast">${icon("alert",18)}<span><b>Reply not sent</b><span>Reconnect the email account, then review the draft.</span></span><a href="#assignment">Review</a></div></div>
    <div class="cp-dialog"><h3>Archive this listing</h3><p>It leaves public search. Review the current URL and any booked viewing before confirming.</p><div class="field"><label for="cp-archive-reason">Reason <em>*</em></label><textarea class="in in--area" id="cp-archive-reason" placeholder="Explain why this listing is being archived" required></textarea></div><label class="cp-check"><input type="checkbox" required><span>I, Mariya Ruseva, confirm the archive decision.</span></label><button class="btn btn--danger" type="button" disabled>Confirm archive</button><p class="cp-note">Awaiting a reason and confirmation.</p></div>
  </div></section>
</main>`;
fs.writeFileSync(new URL("../Components.dc.html", import.meta.url), sheet({ body: BODY, width: 1440, height: 0, pad: 24, extraCss: CSS }));
console.log("Components.dc.html");
