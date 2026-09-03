import fs from "node:fs";
import { sheet, icon } from "../shell.mjs";

const CSS = `
    .doc-hd { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:26px; }
    .doc-hd h1 { font-family:var(--font-display); font-size:32px; font-weight:600; letter-spacing:-.02em; }
    .doc-hd p { margin-top:5px; font-size:13.5px; color:var(--text-muted); max-width:660px; }
    .grp { margin-bottom:28px; }
    .grp > h2 { font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:10px;
      padding-bottom:7px; border-bottom:1px solid var(--border); }
    .spec { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-lg); padding:16px 18px;
      box-shadow:var(--e-2); }
    .spec > b { display:block; font-size:12.5px; margin-bottom:3px; }
    .spec > .why { font-size:11.5px; color:var(--text-muted); margin-bottom:12px; }
    .row2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; align-items:start; }
    .row3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; align-items:start; }
    .demo { display:flex; flex-wrap:wrap; align-items:center; gap:10px; }
    .lbl { font:500 10px var(--font-mono); color:var(--text-muted); display:block; margin-bottom:5px; }
    .stack { display:grid; gap:10px; }
    .statecol { display:grid; gap:6px; justify-items:start; }
    .modal { width:100%; border-radius:var(--r-lg); background:var(--surface); box-shadow:var(--e-3);
      border:1px solid var(--border); overflow:hidden; }
    .modal-hd { display:flex; align-items:center; justify-content:space-between; padding:14px 18px;
      border-bottom:1px solid var(--border); }
    .modal-hd b { font-family:var(--font-display); font-size:16px; font-weight:600; }
    .modal-bd { padding:16px 18px; font-size:13px; color:var(--text-body); }
    .modal-ft { display:flex; align-items:center; gap:10px; padding:12px 18px; border-top:1px solid var(--border);
      background:var(--sunken); }
    .drawer { border:1px solid var(--border); border-radius:var(--r-lg) 0 0 var(--r-lg); background:var(--surface);
      box-shadow:var(--e-3); overflow:hidden; }
    .stepper { display:flex; align-items:center; gap:0; }
    .stepper .s { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:600; }
    .stepper .n { display:grid; place-items:center; width:22px; height:22px; border-radius:var(--r-full);
      font-size:11px; background:var(--stone-200); color:var(--stone-700); }
    .stepper .n[data-done] { background:var(--success-500); color:#fff; }
    .stepper .n[data-on] { background:var(--ink-800); color:#fff; }
    .stepper .line { flex:1 1 auto; height:1px; background:var(--border); margin:0 12px; min-width:24px; }
`;

const BODY = `<div class="doc-hd">
  <div>
    <h1>Components</h1>
    <p>Every control this workspace uses, with the states it is required to have. A component with an
      undesigned state is a defect here, not an omission — the empty list, the failed save and the
      half-loaded table are the ones an operator meets on a bad morning.</p>
  </div>
  <span class="pill pill--ink"><i></i>34 components · 9 states each where they apply</span>
</div>

<div class="grp">
  <h2>Actions</h2>
  <div class="row3">
    <div class="spec">
      <b>Button</b><p class="why">One primary per surface. Brick is reserved for a single highest-intent action.</p>
      <span class="lbl">variants</span>
      <div class="demo">
        <button class="btn btn--primary" type="button">Approve and send</button>
        <button class="btn" type="button">Save as draft</button>
        <button class="btn btn--accent" type="button">Call now</button>
        <button class="btn btn--danger" type="button">${icon("trash", 14)}Delete</button>
        <button class="btn btn--ghost" type="button">Discard</button>
      </div>
      <span class="lbl" style="margin-top:12px">states</span>
      <div class="demo">
        <button class="btn btn--sm" type="button">Default</button>
        <button class="btn btn--sm" type="button" style="background:var(--sunken)">Hover</button>
        <button class="btn btn--sm" type="button" data-focus="1">Focus</button>
        <button class="btn btn--sm" type="button" data-disabled="1">Disabled</button>
        <button class="btn btn--sm" type="button"><span class="skel" style="width:12px; height:12px; border-radius:99px"></span>Saving…</button>
      </div>
      <span class="lbl" style="margin-top:12px">sizes — 30 / 34 / 40, and 44 on touch</span>
      <div class="demo">
        <button class="btn btn--sm" type="button">Small</button>
        <button class="btn" type="button">Default</button>
        <button class="btn btn--lg" type="button">Large</button>
      </div>
    </div>
    <div class="spec">
      <b>Segmented control and filter chips</b><p class="why">Counts live in the filter, not in a separate tile row. A number you cannot click is decoration.</p>
      <span class="lbl">segmented</span>
      <div class="seg">
        <button type="button" data-on="1">All <em>28</em></button>
        <button type="button">Needs reply <em>4</em></button>
        <button type="button">Overdue <em>3</em></button>
      </div>
      <span class="lbl" style="margin-top:12px">tabs</span>
      <nav class="tabs"><a href="#" data-on="1">Facts</a><a href="#">Media</a><a href="#">Translations</a><a href="#">Publication</a></nav>
      <span class="lbl" style="margin-top:12px">breadcrumb</span>
      <div class="crumbs">Website ${icon("chevron", 13)} Pages ${icon("chevron", 13)} <b style="color:var(--text-strong)">Sandanski</b></div>
      <span class="lbl" style="margin-top:12px">stepper</span>
      <div class="stepper">
        <span class="s"><span class="n" data-done="1">${icon("check", 13)}</span>Facts</span><span class="line"></span>
        <span class="s"><span class="n" data-on="1">2</span>Translations</span><span class="line"></span>
        <span class="s"><span class="n">3</span>Publish</span>
      </div>
    </div>
    <div class="spec">
      <b>Status pill</b><p class="why">Colour never carries the state alone — each pill has a word, and the dot is a second cue for colour-deficient reading (1.4.1).</p>
      <div class="demo">
        <span class="pill pill--ok"><i></i>Published</span>
        <span class="pill pill--warn"><i></i>Needs review</span>
        <span class="pill pill--danger"><i></i>Overdue 2 d</span>
        <span class="pill pill--sea"><i></i>Scheduled</span>
        <span class="pill pill--sand"><i></i>Draft</span>
        <span class="pill pill--ink"><i></i>Archived</span>
        <span class="pill pill--ai">${icon("sparkles", 12)}Hermes draft</span>
      </div>
      <span class="lbl" style="margin-top:14px">counts and markers</span>
      <div class="demo">
        <span class="sb-badge" style="background:var(--brick-600)">4</span>
        <span class="sb-badge sb-badge--warn">!</span>
        <span class="av">MR</span>
        <span class="av" style="background:var(--brick-50); color:var(--brick-700)">HE</span>
        <span class="mono">MS-CRAWL-0114</span>
      </div>
      <span class="lbl" style="margin-top:14px">progress</span>
      <div class="prog" style="width:180px"><i style="width:64%"></i></div>
      <p style="font-size:11.5px; color:var(--text-muted); margin-top:6px">4 of 7 documents complete</p>
    </div>
  </div>
</div>

<div class="grp">
  <h2>Input</h2>
  <div class="row3">
    <div class="spec">
      <b>Text field</b><p class="why">The border is the only thing identifying a field, so it carries 3:1 (1.4.11) rather than a hairline.</p>
      <div class="stack">
        <div class="field"><label for="c1">Agency name <em>*</em></label><span class="in" id="c1">MS Realty</span></div>
        <div class="field"><label for="c2">Focused</label><span class="in in--focus" id="c2">Sandanski, ul.&nbsp;Makedonia 22</span></div>
        <div class="field"><label for="c3">Empty</label><span class="in in--empty" id="c3">Not set — shown on every listing page</span></div>
        <div class="field"><label for="c4">Error</label><span class="in in--error" id="c4">office@</span>
          <span class="hint hint--error">${icon("alert", 12)} An address needs a domain, for example office@ms-realty.bg</span></div>
      </div>
    </div>
    <div class="spec">
      <b>Choice</b><p class="why">A toggle changes something immediately and says so; a checkbox waits for Save.</p>
      <div class="stack">
        <div style="display:flex; align-items:center; gap:10px"><span class="box" data-on="1"></span><span style="font-size:13px">Selected</span></div>
        <div style="display:flex; align-items:center; gap:10px"><span class="box"></span><span style="font-size:13px">Unselected</span></div>
        <div style="display:flex; align-items:center; gap:10px"><span class="toggle" data-on="1"><i></i></span><span style="font-size:13px">Require approval before sending</span></div>
        <div style="display:flex; align-items:center; gap:10px"><span class="toggle"><i></i></span><span style="font-size:13px">Let brokers reassign leads</span></div>
        <div class="field" style="margin-top:2px"><label for="c5">Select</label>
          <span class="in" id="c5" style="justify-content:space-between">Bulgarian ${icon("down", 15)}</span></div>
        <div class="field"><label for="c6">Date and time</label>
          <span class="in" id="c6" style="justify-content:space-between">4 Sep 2026, 11:00 ${icon("calendar", 15)}</span></div>
      </div>
    </div>
    <div class="spec">
      <b>Search, filter, saved view</b><p class="why">Saved views are a real endpoint, so the toolbar treats them as records, not as a client-side memory.</p>
      <div class="stack">
        <span class="find" style="width:auto">${icon("search", 14)}Reference, title or location</span>
        <div class="demo">
          <button class="btn btn--sm" type="button">Sandanski ${icon("down", 13)}</button>
          <button class="btn btn--sm" type="button">Needs review ${icon("down", 13)}</button>
          <button class="btn btn--sm btn--ghost" type="button">Clear</button>
        </div>
        <div class="demo">
          <span class="pill pill--ink">${icon("eye", 12)}My overdue buyers</span>
          <span class="pill pill--sand">Unassigned this week</span>
          <button class="btn btn--sm" type="button">${icon("plus", 13)}Save this view</button>
        </div>
        <div class="demo" style="padding:9px 11px; background:var(--sea-50); border-radius:var(--r-md)">
          ${icon("check", 15)}<span style="font-size:12.5px; font-weight:600; color:var(--sea-700)">3 selected</span>
          <button class="btn btn--sm" type="button">Assign</button>
          <button class="btn btn--sm" type="button">Request translation</button>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="grp">
  <h2>Every state a surface must have</h2>
  <div class="row3">
    <div class="spec" style="padding:0">
      <div style="padding:16px 18px 0"><b>Empty — nothing yet</b><p class="why">Says what would put something here, and offers it.</p></div>
      <div class="empty">${icon("inbox", 30)}<b>No enquiries waiting</b>
        <p>Everything that came in today has an answer. New enquiries arrive here from the website, WhatsApp and email.</p>
        <button class="btn btn--sm" type="button">Log one by hand</button></div>
    </div>
    <div class="spec" style="padding:0">
      <div style="padding:16px 18px 0"><b>Empty — filtered to nothing</b><p class="why">A different state from the one above: the fix is to widen the filter.</p></div>
      <div class="empty">${icon("filter", 30)}<b>No leads match these filters</b>
        <p>Overdue · unassigned · Greek. Clearing the language filter brings back 11.</p>
        <button class="btn btn--sm" type="button">Clear filters</button></div>
    </div>
    <div class="spec" style="padding:0">
      <div style="padding:16px 18px 0"><b>Loading</b><p class="why">Row-shaped, so the layout does not jump when the data lands.</p></div>
      <div style="padding:12px 18px 20px; display:grid; gap:12px">
        ${[0,1,2,3].map(() => `<div style="display:grid; grid-template-columns:auto minmax(0,1fr) 70px; gap:11px; align-items:center">
          <span class="skel" style="width:26px; height:26px; border-radius:99px"></span>
          <span style="display:grid; gap:5px"><span class="skel" style="height:9px; width:55%"></span><span class="skel" style="height:8px; width:80%"></span></span>
          <span class="skel" style="height:22px"></span></div>`).join("")}
      </div>
    </div>
  </div>
  <div class="row3" style="margin-top:16px">
    <div class="spec" style="padding:0">
      <div style="padding:16px 18px 0"><b>Error — the request failed</b><p class="why">Names the cause and the retry. Never a bare code.</p></div>
      <div class="empty">${icon("alert", 30)}<b>Could not load the lead inbox</b>
        <p>The workspace database did not answer. Nothing was lost — your filters are still set.</p>
        <div class="demo"><button class="btn btn--sm btn--primary" type="button">Try again</button>
        <button class="btn btn--sm" type="button">Workspace status</button></div></div>
    </div>
    <div class="spec" style="padding:0">
      <div style="padding:16px 18px 0"><b>Not permitted</b><p class="why">Says who can, so the operator knows whom to ask.</p></div>
      <div class="empty">${icon("lock", 30)}<b>Only an owner or manager can approve translations</b>
        <p>You can read this queue and leave a note. Mariya Ruseva and Petar Dimitrov can approve.</p>
        <button class="btn btn--sm" type="button">${icon("send", 13)}Ask Mariya to review</button></div>
    </div>
    <div class="spec" style="padding:0">
      <div style="padding:16px 18px 0"><b>Degraded — part of the page works</b><p class="why">Partial data is shown, and the missing half is named rather than blank.</p></div>
      <div style="padding:14px 18px 18px; display:grid; gap:11px">
        <div class="note note--warn">${icon("alert", 15)}<span>Search is not answering, so matching inventory is hidden. Everything else on this lead is current.</span></div>
        <div class="kv" style="border-radius:var(--r-md); overflow:hidden; border-bottom:0">
          <div><dt>Reply deadline</dt><dd style="color:var(--danger-600)">Overdue 2 days</dd></div>
          <div><dt>Matching inventory</dt><dd class="muted">Unavailable</dd></div>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="grp" style="margin-bottom:0">
  <h2>Overlays and feedback</h2>
  <div class="row3">
    <div class="stack">
      <div class="modal">
        <div class="modal-hd"><b>Archive 3 listings?</b><span class="muted">${icon("x", 16)}</span></div>
        <div class="modal-bd">They stop appearing in search and keep a preservation page at their existing URLs,
          so no legacy link breaks. You can restore them from the Archived filter.
          <div class="note note--warn" style="margin-top:11px">${icon("alert", 14)}<span>One of the three, <span class="mono">MS-CRAWL-0114</span>, has a viewing booked for today.</span></div>
        </div>
        <div class="modal-ft"><button class="btn btn--sm btn--danger" type="button">Archive 3</button>
          <button class="btn btn--sm btn--ghost" type="button">Cancel</button>
          <span style="margin-left:auto; font-size:11.5px" class="muted">Recorded in the activity log</span></div>
      </div>
      <p class="why" style="font-size:11.5px; color:var(--text-muted)">A destructive dialog states the
        consequence and the count, and never carries a mascot or an exclamation mark.</p>
    </div>
    <div class="stack">
      <div class="toast">${icon("check", 18)}<span><b>Reply sent to Maria Petrova</b><span>Delivered over WhatsApp · recorded by Mariya</span></span><a href="#">Undo</a></div>
      <div class="toast" style="background:var(--danger-600)">${icon("alert", 18)}<span><b>Reply not sent</b><span>Google Workspace needs reauthorising</span></span><a href="#">Fix</a></div>
      <div class="toast" style="background:var(--surface); color:var(--text-strong); border:1px solid var(--border)">
        ${icon("clock", 18)}<span><b>Publishing 12 listings</b><span class="muted">4 done · you can keep working</span></span><a href="#" style="color:var(--ink-800)">View</a></div>
      <p class="why" style="font-size:11.5px; color:var(--text-muted)">Anything reversible offers Undo for
        as long as the toast is up. Anything not reversible asked first.</p>
    </div>
    <div class="stack">
      <div class="drawer">
        <div class="modal-hd"><b>Quick look — Anna Weber</b><span class="muted">${icon("x", 16)}</span></div>
        <div style="padding:14px 18px; display:grid; gap:10px">
          <div class="demo"><span class="pill pill--sea"><i></i>Buyer</span><span class="pill pill--warn"><i></i>Viewing today 15:00</span></div>
          <p style="font-size:12.5px; color:var(--text-body)">Villa, Katuntsi · <span class="mono">MS-CRAWL-0114</span> · €185,000</p>
          <p style="font-size:12px; color:var(--text-muted)">Case CASE-0007 · preliminary contract · notary 8 Sep</p>
          <div class="demo"><button class="btn btn--sm btn--primary" type="button">Open the record</button>
            <button class="btn btn--sm" type="button">${icon("phone", 13)}</button>
            <button class="btn btn--sm" type="button">${icon("mail", 13)}</button></div>
        </div>
      </div>
      <p class="why" style="font-size:11.5px; color:var(--text-muted)">A drawer previews a record without
        losing the list behind it. It never contains the only way to do something.</p>
    </div>
  </div>
</div>`;

fs.writeFileSync(new URL("../Components.dc.html", import.meta.url), sheet({ body: BODY, width: 1440, height: 2020, extraCss: CSS }));
console.log("Components.dc.html");
