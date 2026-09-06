import fs from "node:fs";
import { sheet, icon } from "../shell.mjs";
import { ALLOWED_IMAGE_FORMATS } from "../../../../production/lib/image-sanitizer.mjs";
import { DEFAULT_IMAGE_MAX_EDGE, DEFAULT_IMAGE_MAX_PIXELS } from "../../../../production/lib/image-optimizer.mjs";

const CSS = `
  .st { display:grid; gap:32px; }
  .st h1 { font-size:22px; font-weight:600; }
  .st h2,.st h3 { font-size:16px; font-weight:600; }
  .st-header { display:flex; justify-content:space-between; gap:24px; }
  .st-header p { margin-top:8px; max-width:72ch; color:var(--text-muted); }
  .st-section { display:grid; gap:16px; min-width:0; border-top:1px solid var(--joint); padding-top:20px; }
  .st-pair { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:24px; align-items:start; }
  .st-form { display:grid; gap:16px; min-width:0; padding:20px; background:var(--surface); border:1px solid var(--joint); border-radius:var(--r-panel); }
  .st-form input,.st-form textarea,.st-form select { font:inherit; }
  .st-form textarea,.st-form select { width:100%; }
  .st-form textarea { padding:12px; resize:vertical; }
  .st-check { display:flex; align-items:center; gap:12px; min-height:44px; }
  .st-check input { width:20px; height:20px; accent-color:var(--ink-900); }
  .st-actions { display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
  .st .btn[disabled] { opacity:.5; cursor:not-allowed; }
  .st-drop { display:grid; gap:12px; justify-items:start; padding:24px; border:1px dashed var(--border-control); border-radius:var(--r-panel); }
  .st-drop input { font:inherit; max-width:100%; }
  .st-queue { background:var(--surface); border:1px solid var(--joint); border-radius:var(--r-panel); padding:0 20px; min-width:0; }
  .st-row { display:grid; grid-template-columns:minmax(0,1fr) 176px minmax(0,1fr) 128px; gap:20px; align-items:center; min-height:44px; border-bottom:1px solid var(--joint); }
  .st-row:last-child { border:0; }
  .st-row > :first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .st-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:24px; }
  .st-state { display:grid; gap:12px; align-content:start; padding:16px 0; border-top:1px solid var(--joint); min-width:0; }
  .st-state p { max-width:56ch; }
  .st-state svg { color:var(--text-muted); }
  .st .st-note { color:var(--text-muted); }
  .st-field { display:grid; gap:8px; }
  .st-rule { display:grid; grid-template-columns:176px minmax(0,1fr) minmax(0,1fr); gap:24px; padding:12px 0; border-bottom:1px solid var(--joint); }
  .st kbd { font:600 13px var(--font-sans); border:1px solid var(--border-control); border-radius:var(--r-edge); padding:4px 8px; }
  .st .st-focus { box-shadow:var(--ring); }
  .st-rtl { display:grid; gap:12px; padding:20px; background:var(--surface); border:1px solid var(--joint); border-radius:var(--r-panel); }
  .st-rtl-row { display:flex; justify-content:space-between; align-items:center; gap:16px; min-height:44px; border-bottom:1px solid var(--joint); }
  .st-long { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
  .st-state > .pill { justify-self:start; }
`;

const uploadStates = [
  ["Unsupported file", "This file is not an accepted photo format. Export an image in one of the formats shown above.", "Choose another file"],
  ["Too many pixels", `This JPEG is 12000 × 9000, or 108 megapixels. The configured default is ${DEFAULT_IMAGE_MAX_PIXELS / 1e6} megapixels. Export it at a smaller size.`, "Choose a smaller image"],
  ["Cannot decode", "The file claims to be a JPEG but cannot be read. Export it again from the original.", "Choose another file"],
  ["AVIF metadata", "This AVIF contains Exif or XMP. Re-export without metadata, or use JPEG, PNG or WebP.", "Choose another file"],
  ["Connection lost", "We could not confirm the last upload. Keep this page open and check the library before retrying.", "Check uploaded files"],
  ["Possible duplicate", "Check the existing image before adding another copy. A repeated filename alone does not prove the bytes match.", "Open existing image"],
  ["Unsaved edit", "Your crop and description have not been saved. Stay here to save or discard the changes.", "Stay on this page"],
  ["Newer revision", "Another person changed this image. Review the current revision before submitting your edit again.", "Review revisions"],
  ["Permission required", "You can draft alt text. An authorised human must review the image before publication.", "Open review details"],
  ["Small crop", "This crop may be too small for the intended gallery. Review it at the size visitors will see.", "Review crop"],
  ["Removal needs review", "Check the listing’s remaining media and public state before removing this image.", "Review removal"],
  ["Removed from selection", "The image is no longer selected for this draft. Confirm the saved gallery before leaving.", "Open gallery"],
];
const MEDIA_BODY = `<main class="st">
  <header class="st-header"><div><h1>Upload and media review</h1><p>An uploaded image still needs a human decision before it can appear on the public site.</p></div><span class="pill pill--ink">Illustrative states</span></header>
  <section class="st-section"><h2>Upload first, approve separately</h2><div class="st-pair">
    <div class="st-drop">${icon("upload",28)}<h3>Choose photos for this listing</h3><label for="st-files">Photo files</label><input id="st-files" type="file" multiple accept="${ALLOWED_IMAGE_FORMATS.map(f=>`image/${f}`).join(",")}"><p>${ALLOWED_IMAGE_FORMATS.map(f=>f.toUpperCase()).join(", ")}</p><p class="st-note">JPEG, PNG and WebP use a ${DEFAULT_IMAGE_MAX_PIXELS / 1e6}-megapixel default limit and a ${DEFAULT_IMAGE_MAX_EDGE}px maximum edge. Metadata-bearing AVIF files are refused; accepted AVIF is passed through.</p><p>After upload, review the image, its rights and its public description.</p></div>
    <div class="st-form"><h3>Approve the reviewed image</h3><span class="wit wit--none">Human review pending</span><div class="st-field"><label for="st-media-reason">Review note <span aria-label="required">*</span></label><textarea class="in in--area" id="st-media-reason" required placeholder="Record the source, permission and privacy checks"></textarea></div><label class="st-check"><input type="checkbox" required><span>I, Mariya Ruseva, confirm these checks and this approval.</span></label><div class="st-actions"><button class="btn btn--accent" type="button" disabled>Confirm media approval</button><button class="btn btn--ghost" type="button">Keep pending</button></div><p class="st-note">The example remains pending until the note and confirmation are supplied.</p></div>
  </div></section>
  <section class="st-section"><h2>Show each file’s result</h2><div class="st-queue">
    ${[["villa-katuntsi-05.jpg","Uploading","72% transferred","Cancel upload"],["villa-katuntsi-06.jpg","Processing","Checking stored image","View progress"],["villa-katuntsi-07.jpg","Pending review","Uploaded; not public","Open review"],["drone-pano.jpg","Refused","Image dimensions exceed the limit","Review error"]].map(([file,state,note,action])=>`<div class="st-row"><b>${file}</b><span>${state}</span><span class="st-note">${note}</span><button class="btn btn--sm" type="button">${action}</button></div>`).join("")}
  </div><p class="st-note">A partial result names the successful and failed files. Do not turn a mixed result into a success toast.</p></section>
  <section class="st-section"><h2>Refusals and recovery</h2><div class="st-grid">${uploadStates.map(([title,text,action])=>`<div class="st-state"><h3>${title}</h3><p>${text}</p><div><button class="btn" type="button">${action}</button></div></div>`).join("")}</div></section>
  <section class="st-section"><h2>Empty, loading and long lists</h2><div class="st-grid">
    <div class="st-state">${icon("image",28)}<h3>No photos yet</h3><p>Choose files above, or check for images already attached to the listing.</p><a href="#st-files">Choose files</a></div>
    <div class="st-state">${icon("filter",28)}<h3>No matching images</h3><p>Review pending · missing description</p><div><button class="btn" type="button">Clear filters</button></div></div>
    <div class="st-state"><h3>Loading more images</h3><p role="status">Loading the next page…</p><button class="btn" disabled aria-busy="true" type="button">Loading…</button><p>For a long list, keep search and pagination available.</p></div>
  </div></section>
  <section class="st-section"><h2>A long library</h2><div class="st-actions"><label for="st-library-search">Find an image</label><input class="in" id="st-library-search" type="search" placeholder="Filename or listing reference"><span>1–60 of 11,859 files</span><button class="btn" type="button" disabled>Previous</button><button class="btn" type="button">Next 60</button></div><p class="st-note">Illustrative pagination. Counts describe this example, not the live library.</p><div class="st-queue"><div class="st-row"><b>villa-katuntsi-04.jpg</b><span>Approved</span><span class="wit">Mariya Ruseva · 4 Sep 2026</span><button class="btn btn--sm" type="button">Open review</button></div></div></section>
  <section class="st-section"><h2>Control states</h2><div class="st-actions"><button class="btn" type="button">Open image</button><button class="btn" style="background:var(--sunken)" type="button">Hover</button><button class="btn st-focus" type="button">Focus</button><button class="btn" type="button" disabled>Approval unavailable</button><span class="wit wit--none">Awaiting human review</span></div><p class="st-note">Approval, deletion and public state are never inferred from an upload completing.</p></section>
</main>`;

const errors = [
  ["Invalid input", "Name the field and the correction.", "Move focus to the field; keep the other entries."],
  ["Approval missing", "Name the required human decision.", "Open its reason and confirmation form."],
  ["Not permitted", "State which role can perform the action.", "Show the review owner; do not offer an override."],
  ["Service unavailable", "Say what could not be loaded or saved.", "Keep the form open and offer a retry."],
  ["Conflicting change", "Show the current revision and its witness.", "Review both versions before another submission."],
  ["Still processing", "Show the last confirmed state.", "Prevent duplicate submission; offer status inspection."],
  ["Unknown failure", "Say that the outcome is unconfirmed.", "Show the request reference and a way to inspect the record."],
];
const INT_BODY = `<main class="st">
  <header class="st-header"><div><h1>Interaction rules</h1><p>Keep the draft, the decision and the confirmed result distinct. These are design requirements; each production route needs its own runtime check.</p></div><span class="pill pill--ink">All workspace surfaces</span></header>
  <section class="st-section"><h2>Before a consequential change</h2><div class="st-pair">
    <div class="st-form"><h3>Snooze Maria’s enquiry</h3><div class="st-field"><label for="st-until">Return to the queue</label><input class="in" type="date" id="st-until" value="2026-09-05" required></div><div class="st-field"><label for="st-snooze-reason">Reason *</label><textarea class="in in--area" id="st-snooze-reason" required>The buyer asked us to call tomorrow.</textarea></div><label class="st-check"><input type="checkbox" checked required><span>I, Mariya Ruseva, confirm this date and reason.</span></label><span class="wit wit--none">Awaiting confirmation</span><div class="st-actions"><button class="btn btn--accent" type="button">Confirm snooze</button><button class="btn btn--ghost" type="button">Cancel</button></div></div>
    <div class="st-state"><h3>Change the record after acceptance</h3><p>While the request is pending, keep the enquiry’s confirmed state visible. Show a waiting state on the submitting control.</p><button class="btn" type="button" disabled aria-busy="true">Recording snooze…</button><p>If it fails, say the snooze was not confirmed. Keep the reason available for review and retry.</p><div class="note note--warn">${icon("alert",18)}<span>Snooze not confirmed. Check the enquiry before retrying.</span></div><p>The same sequence governs assignment, media approval, document completion, consent withdrawal and condition waivers.</p></div>
  </div></section>
  <section class="st-section"><h2>Drafting does not grant authority</h2><div class="st-pair"><div class="st-state"><h3>Hermes prepares text</h3><p>Label drafts and keep their sources beside the editable text. A person reviews the actual content before accepting it.</p><span class="pill pill--ai">Hermes draft · not approved</span><span class="wit wit--none">Human review required</span></div><div class="st-state"><h3>Save and publish are separate</h3><p>Saving a draft cannot publish a page, send a reply or make a translation indexable. Price and redirect changes require their own human decision.</p><div class="st-actions"><button class="btn" type="button">Save draft</button><button class="btn" type="button">Open publication review</button></div></div></div></section>
  <section class="st-section"><h2>Every failure has a next step</h2><div class="st-rule"><b>Situation</b><b>What the person sees</b><b>What happens next</b></div>${errors.map(([a,b,c])=>`<div class="st-rule"><b>${a}</b><span>${b}</span><span class="st-note">${c}</span></div>`).join("")}</section>
  <section class="st-section"><h2>Keyboard and focus</h2><div class="st-pair"><div class="st-state"><h3>Use native control behaviour</h3><p><kbd>Tab</kbd> and <kbd>Shift + Tab</kbd> follow the reading order. <kbd>Enter</kbd> or <kbd>Space</kbd> activates the focused control.</p><div class="st-actions"><button class="btn st-focus" type="button">Focused button</button><label for="st-focus">Source note</label><input class="in" id="st-focus" placeholder="Not set" style="width:256px"></div><p>A shortcut must open the same confirmation form as its labelled action. It cannot bypass the human review.</p></div><div class="st-state"><h3>Dialogs own focus while open</h3><p>Move focus into the dialog, keep it there, and return it to the opener when the dialog closes. Warn before discarding unsaved input.</p><p>Use the spring focus ring. Respect reduced motion; the witness keeps its text and shape when its animation is removed.</p><p class="st-note">Only advertise shortcuts that the runtime implements.</p></div></div></section>
  <section class="st-section"><h2>Reading order and long content</h2><div class="st-pair"><div class="st-state"><h3>Keep the decision reachable</h3><p>Desktop rows remain 44px. Phone controls have at least 44px targets. Longer labels may wrap; record names may truncate when the full name is available in the record.</p><p>Prices and references use tabular figures. Keep them intact and isolate their direction.</p><span class="st-long" lang="bg">Александрина Константинова Димитрова · Потвърдете информацията за имота</span><p class="st-note">Test the layout at 200% text size and 320px reflow. A fixed canvas frame is not proof of production responsiveness.</p></div><div class="st-rtl" dir="rtl" lang="he"><h3>פרטי הנכס</h3><div class="st-rtl-row"><span>מחיר</span><bdi dir="ltr">€1,245,000</bdi></div><div class="st-rtl-row"><span>מספר נכס</span><bdi dir="ltr">MS-00191</bdi></div><div class="st-rtl-row"><span>סנדנסקי</span><button class="btn" type="button">פרטים</button></div><p lang="en" dir="ltr">The public Hebrew layout mirrors navigation, icon placement and reading order. Figures retain their own direction.</p></div></div></section>
  <section class="st-section"><h2>State coverage</h2><div class="st-actions"><span class="pill pill--ink">Default</span><button class="btn" style="background:var(--sunken)" type="button">Hover</button><button class="btn st-focus" type="button">Focus</button><button class="btn" type="button" disabled>Disabled</button><button class="btn" type="button" disabled aria-busy="true">Loading…</button></div><div class="st-grid"><div class="st-state"><h3>Empty</h3><p>No records yet. Explain how one arrives.</p></div><div class="st-state"><h3>Error</h3><p>Name the failed action and retain the editable input.</p></div><div class="st-state"><h3>Partial</h3><p>Show confirmed data and name the missing portion.</p></div><div class="st-state"><h3>Offline</h3><p>Stop changes that require a confirmed server response.</p></div><div class="st-state"><h3>Too much data</h3><p>Keep filtering and pagination in reach.</p></div><div class="st-state"><h3>Announced result</h3><p role="status">Draft saved. Publication review is still pending.</p><p>Announce changes when they occur, not on every refresh.</p></div></div></section>
</main>`;
for (const [name, body] of [["MediaStates", MEDIA_BODY], ["Interaction", INT_BODY]]) {
  fs.writeFileSync(new URL(`../${name}.dc.html`, import.meta.url), sheet({ body, width:1560, height:0, pad:24, extraCss:CSS }));
}
console.log("MediaStates, Interaction");
