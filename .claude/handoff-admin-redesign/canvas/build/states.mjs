import fs from "node:fs";
import { sheet, icon } from "../shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

const CSS = `
    .doc-hd { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:24px; }
    .doc-hd h1 { font-family:var(--font-display); font-size:30px; font-weight:600; letter-spacing:-.02em; }
    .doc-hd p { margin-top:5px; font-size:13.5px; color:var(--text-muted); max-width:720px; }
    .grp > h2 { font-size:12px; font-weight:600; color:var(--text-muted); margin:0 0 12px;
      padding-bottom:7px; border-bottom:1px solid var(--border); }
    .grp { margin-bottom:28px; }
    .g3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; align-items:start; }
    .g2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; align-items:start; }
    .card { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-lg);
      box-shadow:var(--e-2); overflow:hidden; }
    .card-hd { padding:12px 16px 0; }
    .card-hd b { display:block; font-size:12.5px; font-weight:600; }
    .card-hd span { display:block; font-size:11.5px; color:var(--text-muted); margin-top:2px; }
    .card-bd { padding:12px 16px 16px; }
    .drop { display:grid; place-items:center; gap:6px; padding:20px 14px; border-radius:var(--r-md);
      border:1.5px dashed var(--border-control); background:var(--stone-50); text-align:center; }
    .drop b { font-size:12.5px; font-weight:600; color:var(--text-strong); }
    .drop span { font-size:11.5px; color:var(--text-muted); }
    .drop--over { border-color:var(--ink-800); border-style:solid; background:var(--sea-50); }
    .drop--err { border-color:var(--danger-600); background:var(--danger-50); }
    .up { display:grid; grid-template-columns:32px minmax(0,1fr) auto; gap:10px; align-items:center;
      padding:8px 0; border-bottom:1px solid var(--border); }
    .up:last-child { border-bottom:0; }
    .up .th { width:32px; height:26px; border-radius:var(--r-xs); background:var(--stone-200); display:grid;
      place-items:center; color:var(--stone-500); }
    .up b { font-size:12px; font-weight:600; display:block; overflow:hidden; text-overflow:ellipsis;
      white-space:nowrap; }
    .up em { font-style:normal; font-size:11px; color:var(--text-muted); }
    .kbd { display:inline-grid; place-items:center; min-width:22px; height:21px; padding:0 6px;
      border:1px solid var(--border-control); border-radius:var(--r-xs); background:var(--surface);
      font:600 11px -apple-system,system-ui,sans-serif; color:var(--text-body); }
    .krow { display:grid; grid-template-columns:132px minmax(0,1fr); gap:12px; align-items:center;
      padding:6px 0; border-bottom:1px solid var(--border); font-size:12.5px; }
    .krow:last-child { border-bottom:0; }
    .krow span.k { display:flex; gap:4px; }
    .bp { display:grid; grid-template-columns:96px minmax(0,1fr); gap:12px; align-items:start;
      padding:9px 0; border-bottom:1px solid var(--border); font-size:12.5px; }
    .bp:last-child { border-bottom:0; }
    .bp b { font-family:var(--font-mono); font-size:11.5px; color:var(--text-strong); }
    .tax { display:grid; grid-template-columns:150px minmax(0,1fr) minmax(0,1fr); gap:14px;
      padding:9px 0; border-bottom:1px solid var(--border); font-size:12.5px; }
    .tax:last-child { border-bottom:0; }
    .rtl-demo { border:1px solid var(--border); border-radius:var(--r-md); overflow:hidden; }
    .rtl-row { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:10px; align-items:center;
      padding:10px 12px; border-bottom:1px solid var(--border); font-size:12.5px; }
    .rtl-row:last-child { border-bottom:0; }
    .focusring { box-shadow:var(--ring); }
`;

/* ------------------------------------------------------- Media, every state */
const MEDIA_BODY = `<div class="doc-hd">
  <div><h1>Upload and edit — every state</h1>
    <p>What a photo can do to you on a bad morning. Each refusal below is one the running code actually
      raises, quoted from <span class="mono">image-sanitizer.mjs</span> and
      <span class="mono">image-optimizer.mjs</span>, so the wording a broker reads matches the wording the
      server produced.</p></div>
  <span class="pill pill--ink"><i></i>18 states</span>
</div>

<div class="grp">
  <h2>Getting a file in</h2>
  <div class="g3">
    <div class="card">
      <div class="card-hd"><b>Idle</b><span>Says the limits before anyone hits one.</span></div>
      <div class="card-bd"><div class="drop">${icon("upload", 20)}<b>Drop photos here, or choose files</b>
        <span>JPEG, PNG, WebP or AVIF · up to 50 megapixels · location data removed on upload</span></div></div>
    </div>
    <div class="card">
      <div class="card-hd"><b>Dragging over</b><span>The whole panel is the target, not a 40px strip.</span></div>
      <div class="card-bd"><div class="drop drop--over">${icon("upload", 20)}
        <b style="color:var(--sea-700)">Release to add 7 photos</b>
        <span style="color:var(--sea-700)">They will be attached to MS-00191</span></div></div>
    </div>
    <div class="card">
      <div class="card-hd"><b>Dragging the wrong thing</b><span>Refuses before the drop, not after.</span></div>
      <div class="card-bd"><div class="drop drop--err">${icon("x", 20)}
        <b style="color:var(--danger-600)">A PDF cannot go in the photo library</b>
        <span style="color:var(--danger-600)">Attach it to the case instead</span></div></div>
    </div>
  </div>
  <div class="g2" style="margin-top:16px">
    <div class="card">
      <div class="card-hd"><b>Uploading</b><span>Per file, cancellable, and the page stays usable.</span></div>
      <div class="card-bd">
        <div class="up"><span class="th">${icon("image", 14)}</span>
          <span><b>villa-katuntsi-05.jpg</b><em>3.1 MB · resizing to 2560px</em>
            <span class="prog" style="margin-top:5px"><i style="width:72%"></i></span></span>
          <button class="btn btn--sm btn--ghost" type="button">${icon("x", 13)}</button></div>
        <div class="up"><span class="th">${icon("image", 14)}</span>
          <span><b>villa-katuntsi-06.jpg</b><em>2.4 MB · stripping metadata</em>
            <span class="prog" style="margin-top:5px"><i style="width:38%"></i></span></span>
          <button class="btn btn--sm btn--ghost" type="button">${icon("x", 13)}</button></div>
        <div class="up"><span class="th">${icon("image", 14)}</span>
          <span><b>villa-katuntsi-07.jpg</b><em>Waiting</em></span>
          <button class="btn btn--sm btn--ghost" type="button">${icon("x", 13)}</button></div>
        <div style="display:flex; align-items:center; gap:9px; margin-top:11px">
          <button class="btn btn--sm" type="button">Cancel all</button>
          <span style="margin-left:auto; font-size:11.5px" class="muted">2 of 7 done · about 40 seconds left</span></div>
      </div>
    </div>
    <div class="card">
      <div class="card-hd"><b>Finished, partly</b><span>Never a single number hiding a failure.</span></div>
      <div class="card-bd">
        <div class="note note--warn" style="margin-bottom:11px">${icon("alert", 15)}
          <span><b>5 of 7 added.</b> Two were refused, for different reasons, and both files are still on your computer.</span></div>
        <div class="up"><span class="th" style="background:var(--danger-50); color:var(--danger-600)">${icon("x", 14)}</span>
          <span><b>drone-pano.jpg</b><em>12000 × 9000 is 108 megapixels; the limit is 50</em></span>
          <button class="btn btn--sm" type="button">Resize and retry</button></div>
        <div class="up"><span class="th" style="background:var(--danger-50); color:var(--danger-600)">${icon("x", 14)}</span>
          <span><b>terrace.avif</b><em>Carries Exif or XMP that cannot be stripped in process</em></span>
          <button class="btn btn--sm" type="button">How to fix</button></div>
      </div>
    </div>
  </div>
</div>

<div class="grp">
  <h2>Refusals the server actually raises</h2>
  <div class="g3">
    <div class="card"><div class="card-hd"><b>Too many pixels</b><span>ImageTooLargeError</span></div>
      <div class="card-bd"><div class="note note--warn">${icon("alert", 15)}
        <span>This photo is 12000 × 9000, which is 108 megapixels. The limit is 50. Export it at half size and
          it will be well above what any screen needs.</span></div></div></div>
    <div class="card"><div class="card-hd"><b>Not an image we can serve</b><span>UnsupportedImageError</span></div>
      <div class="card-bd"><div class="note note--warn">${icon("alert", 15)}
        <span>HEIC is what an iPhone saves by default and browsers will not show it. Set the camera to
          "Most Compatible", or export the photo as JPEG.</span></div></div></div>
    <div class="card"><div class="card-hd"><b>Claims one thing, is another</b><span>Decode failure</span></div>
      <div class="card-bd"><div class="note note--warn">${icon("alert", 15)}
        <span>This file is named .jpg but could not be decoded as one. It may have been renamed, or truncated
          part-way through a download.</span></div></div></div>
  </div>
  <div class="g3" style="margin-top:16px">
    <div class="card"><div class="card-hd"><b>AVIF with metadata</b><span>Cannot be stripped in process</span></div>
      <div class="card-bd"><div class="note note--warn">${icon("alert", 15)}
        <span>This AVIF carries Exif or XMP, which may include where the photo was taken, and it cannot be
          removed here. Re-export it without metadata, or upload it as JPEG.</span></div></div></div>
    <div class="card"><div class="card-hd"><b>Already here</b><span>Same checksum</span></div>
      <div class="card-bd"><div class="note note--info">${icon("copy", 15)}
        <span>This is byte-for-byte the photo already in position 3 of this listing. Add it anyway, or open the
          one that is already there.</span></div>
        <div style="display:flex; gap:7px; margin-top:9px"><button class="btn btn--sm" type="button">Open the existing one</button>
          <button class="btn btn--sm btn--ghost" type="button">Add anyway</button></div></div></div>
    <div class="card"><div class="card-hd"><b>The connection went</b><span>Resumable</span></div>
      <div class="card-bd"><div class="note note--warn">${icon("alert", 15)}
        <span>4 of 7 uploaded before the connection dropped. The rest are held and will resume on their own —
          you can leave this page.</span></div>
        <button class="btn btn--sm" type="button" style="margin-top:9px">Retry now</button></div></div>
  </div>
</div>

<div class="grp">
  <h2>While editing</h2>
  <div class="g3">
    <div class="card"><div class="card-hd"><b>Unsaved changes</b><span>The only thing that blocks navigation.</span></div>
      <div class="card-bd">
        <div style="border:1px solid var(--border); border-radius:var(--r-md); overflow:hidden; box-shadow:var(--e-3)">
          <div style="padding:13px 15px"><b style="font-family:var(--font-display); font-size:15px">Leave without saving?</b>
            <p style="font-size:12.5px; color:var(--text-muted); margin-top:6px">A crop, a focal point and one
              redaction are not saved. The original is untouched either way.</p></div>
          <div style="display:flex; gap:9px; padding:11px 15px; border-top:1px solid var(--border); background:var(--sunken)">
            <button class="btn btn--sm btn--primary" type="button">Save and leave</button>
            <button class="btn btn--sm" type="button">Discard</button>
            <button class="btn btn--sm btn--ghost" type="button">Stay</button></div>
        </div></div></div>
    <div class="card"><div class="card-hd"><b>Someone else got there first</b><span>Whole-record conflict.</span></div>
      <div class="card-bd"><div class="note note--warn">${icon("alert", 15)}
        <span>Petar approved this photo two minutes ago, so your copy is out of date. Your crop is kept — you
          can apply it on top of his version.</span></div>
        <div style="display:flex; gap:7px; margin-top:9px"><button class="btn btn--sm btn--primary" type="button">See both</button>
          <button class="btn btn--sm" type="button">Take his version</button></div></div></div>
    <div class="card"><div class="card-hd"><b>Not your call</b><span>Names who can, not just that you cannot.</span></div>
      <div class="card-bd"><div class="note note--info">${icon("lock", 15)}
        <span>A translator can write alt text but not approve a photo for the public site. Mariya Ruseva and
          Petar Dimitrov can.</span></div>
        <button class="btn btn--sm" type="button" style="margin-top:9px">${icon("send", 12)}<span>Ask Mariya to approve</span></button></div></div>
  </div>
  <div class="g3" style="margin-top:16px">
    <div class="card"><div class="card-hd"><b>Crop too small</b><span>Checked against what the page needs.</span></div>
      <div class="card-bd"><div class="note note--warn">${icon("alert", 15)}
        <span>This crop is 780 × 520. A listing gallery serves 1200 wide, so it would be upscaled and look
          soft. Crop wider, or accept it for the thumbnail only.</span></div></div></div>
    <div class="card"><div class="card-hd"><b>Removal blocked</b><span>The rule that would break.</span></div>
      <div class="card-bd"><div class="note note--warn">${icon("alert", 15)}
        <span>MS-00191 would drop to five photos, and a published listing needs six. Remove it and the
          listing comes off the public site until another is added.</span></div>
        <div style="display:flex; gap:7px; margin-top:9px"><button class="btn btn--sm btn--danger" type="button">Remove and unpublish</button>
          <button class="btn btn--sm btn--ghost" type="button">Cancel</button></div></div></div>
    <div class="card"><div class="card-hd"><b>Removed</b><span>Reversible for as long as the toast is up.</span></div>
      <div class="card-bd"><div class="toast" style="display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:11px; align-items:center; padding:11px 13px; border-radius:var(--r-md); background:var(--ink-900); color:#fff">
        ${icon("trash", 17)}<span><b style="font-size:12.5px; display:block">villa-katuntsi-pool.jpg removed</b>
        <span style="font-size:11.5px; color:rgba(255,255,255,.66)">Kept for 30 days before deletion</span></span>
        <a href="#" style="color:#fff; font-size:12px; font-weight:600; text-decoration:underline">Undo</a></div></div></div>
  </div>
</div>

<div class="grp" style="margin-bottom:0">
  <h2>Nothing there, and too much there</h2>
  <div class="g3">
    <div class="card"><div class="card-bd"><div class="empty">${icon("image", 28)}<b>No photos on this listing yet</b>
      <p>A listing needs six before it can be published. The legacy site had eleven for this address — they may
        be in the unmatched pile.</p>
      <div style="display:flex; gap:7px"><button class="btn btn--sm btn--primary" type="button">Upload</button>
        <button class="btn btn--sm" type="button">Search unmatched</button></div></div></div></div>
    <div class="card"><div class="card-bd"><div class="empty">${icon("filter", 28)}<b>No photo matches these filters</b>
      <p>Held · missing alt text · attached to a Melnik listing. Dropping the location filter brings back 34.</p>
      <button class="btn btn--sm" type="button">Clear the location filter</button></div></div></div>
    <div class="card"><div class="card-bd">
      <div class="note note--info" style="margin-bottom:11px">${icon("alert", 15)}
        <span><b>11,859 files.</b> The grid loads 60 at a time as you scroll. Searching or filtering is faster
          than scrolling to the bottom.</span></div>
      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:7px">
        ${[0,1,2,3,4,5,6,7].map(() => `<span class="skel" style="height:44px; border-radius:var(--r-sm)"></span>`).join("")}
      </div></div></div>
  </div>
</div>`;
fs.writeFileSync(W("MediaStates.dc.html"), sheet({ body: MEDIA_BODY, width: 1560, height: 1900, extraCss: CSS }));

/* ---------------------------------------------------- Interaction system */
const INT_BODY = `<div class="doc-hd">
  <div><h1>Interaction rules</h1>
    <p>The decisions that apply to every screen, written down once so they are not re-argued per feature:
      when work saves, what a failure says, how the keyboard reaches everything, and what changes when the
      language runs right to left.</p></div>
  <span class="pill pill--ink"><i></i>Applies to all 30 screens</span>
</div>

<div class="grp">
  <h2>Saving</h2>
  <div class="g3">
    <div class="card"><div class="card-hd"><b>Explicit save</b><span>Anything a customer or the public site will see.</span></div>
      <div class="card-bd" style="font-size:12.5px; color:var(--text-body); display:grid; gap:8px">
        <span>A reply, a translation, a listing fact, a page block, a contract. The button says what will
          happen — <b>Approve and send</b>, not <b>OK</b> — and the screen keeps the draft if you leave.</span>
        <div style="display:flex; gap:7px"><button class="btn btn--sm btn--primary" type="button">Approve and send</button>
          <button class="btn btn--sm btn--ghost" type="button">Discard</button></div></div></div>
    <div class="card"><div class="card-hd"><b>Autosave</b><span>Only where nobody outside can see it.</span></div>
      <div class="card-bd" style="font-size:12.5px; color:var(--text-body); display:grid; gap:8px">
        <span>Filters, saved views, column widths, a note to yourself, a draft in progress. Saved on a pause,
          with a quiet marker — never a toast.</span>
        <span class="muted" style="font-size:11.5px">${icon("check", 12)} Saved 09:41</span></div></div>
    <div class="card"><div class="card-hd"><b>Optimistic, then honest</b><span>Applies to one-click state changes.</span></div>
      <div class="card-bd" style="font-size:12.5px; color:var(--text-body); display:grid; gap:8px">
        <span>Ticking a checklist item, snoozing a lead, assigning a broker: the row changes immediately. If
          the write fails the row goes back and says so — it never silently stays changed.</span>
        <div class="note note--warn">${icon("alert", 13)}<span>Could not snooze — the row is back as it was.</span></div></div></div>
  </div>
</div>

<div class="grp">
  <h2>When something fails</h2>
  <div class="card"><div class="card-bd">
    <div class="tax" style="font-weight:600; color:var(--text-muted); font-size:11px; border-bottom:1px solid var(--border)">
      <span>Kind</span><span>What the person is told</span><span>What they are offered</span></div>
    ${[
      ["Their input is wrong", "Which field, and what would be right — under the field, not in a banner", "Focus moves to that field; nothing else is lost"],
      ["A rule stops it", "The rule, in the agency's own words, and what it protects", "The action that satisfies the rule, or a way to override with a reason"],
      ["Not permitted", "That it needs a different role, and who has it", "Ask that person, in one click"],
      ["The service is down", "Which service, and what still works without it", "Retry, and a link to the workspace status"],
      ["Someone else changed it", "What they changed and when", "See both, take theirs, or apply yours on top"],
      ["Too slow", "That it is still running and can be left alone", "Carry on elsewhere; a notification when it lands"],
      ["We do not know", "The request id, plainly, and that it was recorded", "Retry, and report it to the agency's developer"],
    ].map(([a, b, c]) => `<div class="tax"><b style="font-size:12.5px">${a}</b><span>${b}</span><span class="muted">${c}</span></div>`).join("")}
    <p style="font-size:12px; color:var(--text-muted); margin-top:11px">No screen shows a bare status code, and
      nothing says "something went wrong". A message that cannot name the cause names the request id instead.</p>
  </div></div>
</div>

<div class="grp">
  <h2>Keyboard</h2>
  <div class="g3">
    <div class="card"><div class="card-hd"><b>Anywhere</b></div><div class="card-bd">
      ${[[["⌘","K"],"Search everything"],[["G","T"],"Go to Today"],[["G","I"],"Go to the lead inbox"],[["N"],"New — the thing this screen makes"],[["?"],"This list"]]
        .map(([k, d]) => `<div class="krow"><span class="k">${k.map((x) => `<span class="kbd">${x}</span>`).join("")}</span><span>${d}</span></div>`).join("")}
    </div></div>
    <div class="card"><div class="card-hd"><b>In a list</b></div><div class="card-bd">
      ${[[["J","K"],"Next and previous row"],[["Enter"],"Open the row"],[["X"],"Select the row"],[["E"],"Archive"],[["S"],"Snooze"],[["⌘","Enter"],"The row's primary action"]]
        .map(([k, d]) => `<div class="krow"><span class="k">${k.map((x) => `<span class="kbd">${x}</span>`).join("")}</span><span>${d}</span></div>`).join("")}
    </div></div>
    <div class="card"><div class="card-hd"><b>In the photo editor</b></div><div class="card-bd">
      ${[[["C"],"Crop"],[["R"],"Rotate 90°"],[["F"],"Focal point"],[["⌘","Z"],"Undo"],[["Esc"],"Cancel the tool"],[["⌘","S"],"Save"]]
        .map(([k, d]) => `<div class="krow"><span class="k">${k.map((x) => `<span class="kbd">${x}</span>`).join("")}</span><span>${d}</span></div>`).join("")}
    </div></div>
  </div>
  <div class="g2" style="margin-top:16px">
    <div class="card"><div class="card-hd"><b>Focus</b><span>Visible, and never trapped by accident.</span></div>
      <div class="card-bd" style="display:grid; gap:11px">
        <div style="display:flex; gap:10px; align-items:center">
          <button class="btn btn--sm focusring" type="button">Focused</button>
          <span class="in focusring" style="width:180px; height:32px">Focused field</span>
          <span class="box focusring" data-on="1"></span>
        </div>
        <p style="font-size:12.5px; color:var(--text-body)">A 3px ring in the brand red on every focusable
          thing, on top of whatever the element already shows. Tab order follows the reading order; a dialog
          traps focus and returns it to the control that opened it; the skip link is the first stop on
          every page.</p></div></div>
    <div class="card"><div class="card-hd"><b>Motion</b><span>Fast, and optional.</span></div>
      <div class="card-bd" style="display:grid; gap:9px; font-size:12.5px; color:var(--text-body)">
        <div class="kvline" style="display:flex; justify-content:space-between"><span>Hover and state</span><b>140 ms ease-out</b></div>
        <div class="kvline" style="display:flex; justify-content:space-between"><span>Entering the page</span><b>200 ms</b></div>
        <div class="kvline" style="display:flex; justify-content:space-between"><span>Anything longer</span><b>Not used</b></div>
        <p>No animation carries meaning on its own. Under
          <span class="mono">prefers-reduced-motion</span> every transition is removed, not merely shortened,
          and nothing cross-fades.</p></div></div>
  </div>
</div>

<div class="grp">
  <h2>Reach and language</h2>
  <div class="g2">
    <div class="card"><div class="card-hd"><b>Widths</b><span>One product, not a cut-down phone version.</span></div>
      <div class="card-bd">
        <div class="bp"><b>≥ 1440</b><span>Rail, content and a right column. Tables show every column.</span></div>
        <div class="bp"><b>1280–1439</b><span>The right column drops under the content. Rail unchanged.</span></div>
        <div class="bp"><b>768–1279</b><span>Rail collapses to a drawer. Tables drop the columns marked optional and keep an inline summary.</span></div>
        <div class="bp"><b>&lt; 768</b><span>Phone layout: a tab bar, cards instead of rows, 44px targets, the same actions.</span></div>
        <div class="bp"><b>320 × 256</b><span>Still usable, per WCAG reflow — no two-directional scrolling anywhere.</span></div>
        <div class="bp"><b>200% zoom</b><span>Nothing lost and nothing clipped; the grid reflows rather than scaling.</span></div>
      </div></div>
    <div class="card"><div class="card-hd"><b>Right to left</b><span>Hebrew is a full build, not a stylesheet flip.</span></div>
      <div class="card-bd">
        <div class="rtl-demo" dir="rtl">
          <div class="rtl-row" style="background:var(--sunken)"><span class="pill pill--danger"><i></i>באיחור יומיים</span>
            <b style="font-weight:600">מריה פטרובה</b><span class="av">MP</span></div>
          <div class="rtl-row"><span class="mono" dir="ltr">MS-00815</span>
            <span>דירת שני חדרים · סנדנסקי</span><span class="price" dir="ltr">€68,000</span></div>
          <div class="rtl-row"><button class="btn btn--sm btn--primary" type="button">${icon("send", 13)}השב</button>
            <span class="muted">התקבל 4 ביולי</span><span></span></div>
        </div>
        <p style="font-size:12.5px; color:var(--text-body); margin-top:11px">The rail moves right, chevrons and
          the back arrow mirror, and progress runs right to left. References, prices and dates stay left to
          right inside the mirrored line, because a reference read aloud on the phone must not reverse.</p>
      </div></div>
  </div>
</div>

<div class="grp" style="margin-bottom:0">
  <h2>Density and long content</h2>
  <div class="g3">
    <div class="card"><div class="card-hd"><b>Two densities</b><span>Set per person, not per screen.</span></div>
      <div class="card-bd" style="display:grid; gap:9px">
        <div class="seg"><button type="button" data-on="1">Comfortable</button><button type="button">Compact</button></div>
        <p style="font-size:12.5px; color:var(--text-body)">Compact takes 8px off every row and drops the
          secondary line, showing about sixteen rows where comfortable shows twelve. Type size does not change,
          so the accessibility floor holds in both.</p></div></div>
    <div class="card"><div class="card-hd"><b>Long strings</b><span>The rule that stops mid-word breaks.</span></div>
      <div class="card-bd" style="display:grid; gap:8px; font-size:12.5px">
        <div style="display:flex; justify-content:space-between; gap:10px"><span class="muted">Person or place</span><span>Truncates with an ellipsis, full text on hover</span></div>
        <div style="display:flex; justify-content:space-between; gap:10px"><span class="muted">Reference or id</span><span class="mono" style="text-align:right">Never breaks</span></div>
        <div style="display:flex; justify-content:space-between; gap:10px"><span class="muted">Price or date</span><span>Never wraps</span></div>
        <div style="display:flex; justify-content:space-between; gap:10px"><span class="muted">A sentence</span><span>Wraps, balanced</span></div>
        <p class="muted" style="margin-top:3px">Bulgarian runs about a third longer than English, so no label is
          sized to fit its English width.</p></div></div>
    <div class="card"><div class="card-hd"><b>Screen readers</b><span>What is announced, and when.</span></div>
      <div class="card-bd" style="display:grid; gap:8px; font-size:12.5px; color:var(--text-body)">
        <div style="display:flex; gap:9px">${icon("check", 14)}<span>A saved change, a failed save and a finished upload are announced politely.</span></div>
        <div style="display:flex; gap:9px">${icon("check", 14)}<span>A count that changes under you — "4 leads waiting" — is announced when it changes, not on every poll.</span></div>
        <div style="display:flex; gap:9px">${icon("check", 14)}<span>Every status pill reads its word; the colour and the dot are extra, never the message.</span></div>
        <div style="display:flex; gap:9px">${icon("check", 14)}<span>A photo without alt text says so, rather than reading its file name.</span></div>
      </div></div>
  </div>
</div>`;
fs.writeFileSync(W("Interaction.dc.html"), sheet({ body: INT_BODY, width: 1560, height: 1980, extraCss: CSS }));

console.log("MediaStates, Interaction");
