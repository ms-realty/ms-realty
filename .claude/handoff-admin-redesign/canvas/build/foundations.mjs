import fs from "node:fs";
import assert from "node:assert/strict";
import { sheet, icon } from "../shell.mjs";
import { TOKENS, CANONICAL_SPACING, SPACING_STEPS, TYPE_SCALE, RADII, ELEVATIONS, ROW_MODULE } from "../tokens.mjs";

// Colour examples use the declarations the browser receives, including aliases.
const declarations = new Map([...TOKENS.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
function colour(name, seen = new Set()) {
  assert(!seen.has(name), `Circular token: ${name}`);
  seen.add(name);
  const value = declarations.get(name);
  assert(value, `Missing token: ${name}`);
  const alias = value.match(/^var\((--[\w-]+)\)$/);
  if (alias) return colour(alias[1], seen);
  assert.match(value, /^#[\da-f]{6}$/i);
  return value;
}
function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}
assert.equal(contrast("#000000", "#FFFFFF"), 21);
assert.equal(contrast("#73644A", "#73644A"), 1);
assert.equal(colour("--text-strong"), colour("--marble-900"));
const ROLES = [
  ["--text-strong", "--surface", "Headings and identity", 4.5],
  ["--text-body", "--canvas", "Body text on tile", 4.5],
  ["--text-muted", "--surface", "Hints and source notes", 4.5],
  ["--text-muted", "--sunken", "Secondary text on the rail", 4.5],
  ["--border-control", "--surface", "Control boundaries", 3],
  ["--tile-glaze", "--accent", "The primary action", 4.5],
  ["--brick-400", "--sb-on", "Selected navigation icon", 3],
  ["--sb-label", "--sb-bg", "Navigation group labels", 4.5],
  ["--warning-700", "--warning-50", "Waiting for a decision", 4.5],
  ["--danger-600", "--danger-50", "Error and overdue text", 4.5],
  ["--success-600", "--success-50", "Completed work", 4.5],
  ["--field-text", "--field", "Public heading and body", 4.5],
  ["--field-muted", "--field", "Public supporting text", 4.5],
];
for (const [front, back, , floor] of ROLES) assert(contrast(colour(front), colour(back)) >= floor, `${front} on ${back} fails ${floor}:1`);

const CSS = `
  .fd { display:grid; gap:32px; }
  .fd h1 { font-size:22px; font-weight:600; }
  .fd h2 { font-size:16px; font-weight:600; }
  .fd p { max-width:72ch; }
  .fd-header { display:flex; justify-content:space-between; align-items:start; gap:24px; }
  .fd-header p { margin-top:8px; color:var(--text-muted); }
  .fd-section { display:grid; gap:16px; border-top:1px solid var(--joint); padding-top:20px; }
  .fd-pair { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:24px; align-items:start; }
  .fd-example { display:grid; gap:12px; padding:20px; background:var(--surface); border:1px solid var(--joint); border-radius:var(--r-panel); }
  .fd-example h3 { font-size:16px; font-weight:600; }
  .fd-fact { display:flex; justify-content:space-between; align-items:center; gap:16px; min-height:var(--row); border-bottom:1px solid var(--joint); }
  .fd-fact .price { font-size:22px; }
  .fd-ramp { display:grid; grid-template-columns:96px repeat(4,minmax(0,1fr)); gap:16px; align-items:center; }
  .fd-swatch { display:grid; gap:4px; }
  .fd-swatch i { height:32px; border:1px solid var(--joint); border-radius:var(--r-edge); }
  .fd code { font:400 13px var(--font-mono); }
  .fd-roles td { padding:12px; }
  .fd-type { display:grid; grid-template-columns:80px minmax(0,1fr); gap:16px; padding:8px 0; align-items:baseline; border-bottom:1px solid var(--joint); }
  .fd-type span:last-child { overflow-wrap:anywhere; }
  .fd-steps { display:flex; align-items:end; gap:12px; }
  .fd-step { display:grid; gap:8px; text-align:center; }
  .fd-step i { display:block; background:var(--spring-700); }
  .fd-radii { display:flex; gap:16px; }
  .fd-radius { display:grid; place-items:center; width:128px; min-height:64px; background:var(--surface); border:1px solid var(--border-control); }
  .fd-layout { display:grid; grid-template-columns:244px minmax(0,1fr); min-height:176px; border:1px solid var(--joint); }
  .fd-rail { display:grid; align-content:center; gap:8px; background:var(--sb-bg); padding:20px; }
  .fd-room { display:grid; grid-template-rows:56px auto; background:var(--surface); }
  .fd-room > div { display:flex; align-items:center; padding:0 24px; border-bottom:1px solid var(--joint); }
  .fd-icons { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; }
  .fd-icons span { display:flex; align-items:center; gap:8px; min-height:44px; border-bottom:1px solid var(--joint); }
  .fd .note-b { color:var(--text-muted); }
`;
const ramps = [
  ["Tile", ["--tile", "--tile-glaze", "--tile-deep", "--joint"]],
  ["Marble", ["--marble-900", "--marble-800", "--marble-600", "--marble-500"]],
  ["Spring", ["--spring-900", "--spring-800", "--spring-200", "--spring-50"]],
  ["Brick", ["--brick-800", "--brick-700", "--brick-600", "--brick-50"]],
];
const BODY = `<main class="fd">
  <header class="fd-header"><div><h1>Foundations</h1><p>Every fact carries its witness. The number, the source and the person who checked it stay together.</p></div><span class="pill pill--ink">System reference</span></header>
  <section class="fd-section"><h2>The decision and its witness</h2><p class="note-b">Illustrative states below. Names, dates and values demonstrate the design; they are not live confirmations.</p>
    <div class="fd-pair">
      <div class="fd-example"><h3>Source supplied, awaiting review</h3><div class="fd-fact"><span>Asking price</span><span class="price">€185,000</span></div><span class="wit wit--none">Owner supplied · not yet checked</span><p>Keep the amount visible. Say which review is missing beside it.</p></div>
      <div class="fd-example"><h3>Checked against the source</h3><div class="fd-fact"><span>Asking price</span><span class="price">€185,000</span></div><span class="wit"><b>Mariya Ruseva</b> · 4 Sep 2026 · owner instruction</span><p>The filled square records a completed check. The name and date remain readable without colour.</p></div>
    </div>
  </section>
  <section class="fd-section"><h2>The Sandanski palette</h2><p class="note-b">Tile separates working surfaces. Spring fills the public opening. Brick marks one primary action.</p>
    ${ramps.map(([name, tokens]) => `<div class="fd-ramp"><b>${name}</b>${tokens.map((token) => `<span class="fd-swatch"><i style="background:var(${token})"></i><code>${token}</code><span>${colour(token)}</span></span>`).join("")}</div>`).join("")}
  </section>
  <section class="fd-section"><h2>Contrast at the point of use</h2><p class="note-b">${ROLES.length} token pairs measured during this build. Text needs 4.5:1; control boundaries and navigation icons need 3:1. Ratios are tested before rounding for display.</p>
    <table class="fd-roles"><thead><tr><th>Use</th><th>Foreground</th><th>Background</th><th>Ratio</th><th>Required</th></tr></thead><tbody>
      ${ROLES.map(([front, back, use, floor]) => `<tr><td>${use}</td><td><code>${front}</code></td><td><code>${back}</code></td><td>${contrast(colour(front), colour(back)).toFixed(2)}:1</td><td>Pass · ${floor}:1</td></tr>`).join("")}
    </tbody></table>
  </section>
  <section class="fd-section"><h2>Type, figures and direction</h2><div class="fd-pair"><div>
    ${TYPE_SCALE.map((size) => `<div class="fd-type"><span>UI / ${size}</span><span style="font-size:${size}px; font-weight:600; letter-spacing:0">${size >= 39 ? "A place in Sandanski" : "The next task and its witness"}</span></div>`).join("")}
    <p class="note-b">${TYPE_SCALE.length} sizes, rendered from the published type scale.</p>
    </div><div class="fd-example"><h3>One working face</h3><p>Commissioner carries workspace text and tabular figures. Operate screens use 13px body text, 16px headings and one 22px page title. Witnesses use 11px.</p>
      <div class="fd-fact"><b>MS-00191</b><span class="price">€1,245,000</span><span>1,280 m²</span></div>
      <p>Sofia Sans Semi Condensed, weight 800, carries public display text at 39, 47 or 56px.</p><p class="display" style="font-size:39px">A place in Sandanski</p>
      <p>Monospace is for code: <code>{"status":"draft"}</code></p><h3>Allow the words to grow</h3><p lang="bg">Потвърдете информацията за имота</p>
      <div dir="rtl" lang="he"><h3>פרטי הנכס</h3><div class="fd-fact"><span>מחיר</span><bdi dir="ltr">€1,245,000</bdi><bdi dir="ltr">MS-00191</bdi></div></div>
      <p>Public languages: BG, EN, DE, NL, RU, EL and HE. Workspace languages: BG, RU and EN. Hebrew mirrors layout and reading order; isolate figures and references.</p>
    </div></div>
  </section>
  <section class="fd-section"><h2>Space and edges</h2><div class="fd-pair"><div>
    <div class="fd-steps">${SPACING_STEPS.map((size) => `<span class="fd-step"><i style="width:${size}px;height:${size}px"></i><span>${size}</span></span>`).join("")}</div>
    <p class="note-b">Row padding ${CANONICAL_SPACING.rowPadding.join(" / ")}px. Panel padding ${CANONICAL_SPACING.panelPadding.join(" / ")}px. Page gutter ${CANONICAL_SPACING.pageGutter}px. Column gap ${CANONICAL_SPACING.columnGap}px. Section gap ${CANONICAL_SPACING.sectionGap}px; public sections ${CANONICAL_SPACING.publicSection}px.</p>
    </div><div><div class="fd-radii">${Object.entries(RADII).map(([name, size]) => `<span class="fd-radius" style="border-radius:var(--r-${name})">${name} · ${size}px</span>`).join("")}</div><p class="note-b">${Object.keys(RADII).length} radii. Controls use edge, containers use panel, avatars and pills use pill. Square corners may use zero.</p></div></div>
    <p>${ELEVATIONS.join(" and ")}: panels sit on a grout line. Menus, dialogs and toasts may float. Do not put a panel inside another panel.</p>
  </section>
  <section class="fd-section"><h2>The workspace grid</h2><div class="fd-layout"><div class="fd-rail"><b>244px rail</b><span>Tile, with the current destination in ink</span></div><div class="fd-room"><div>56px top bar</div><div>${CANONICAL_SPACING.pageGutter}px side gutters · ${ROW_MODULE}px rows · one action at the decision</div></div></div><p class="note-b">This sheet stays 1440px wide. Phone frames stay 390px wide with touch targets of at least 44px. Their layout is reviewed separately.</p></section>
  <section class="fd-section"><h2>Icons stay beside words</h2><div class="fd-icons">${[["inbox","Lead inbox"],["building","Listings"],["calendar","Viewings"],["filesign","Documents"],["languages","Translations"],["shield","Consent"],["search","Search"],["filter","Filter"],["clock","Waiting"],["alert","Needs attention"],["check","Complete"],["gear","Settings"]].map(([name,label]) => `<span>${icon(name,18)}${label}</span>`).join("")}</div><p class="note-b">Use 16, 18 or 20px inline; 28px in an empty state. Keep labels for approval, sending and other actions whose meaning depends on context.</p></section>
</main>`;
fs.writeFileSync(new URL("../Foundations.dc.html", import.meta.url), sheet({ body: BODY, width: 1440, height: 0, pad: 24, extraCss: CSS }));
console.log(`Foundations.dc.html · ${ROLES.length} contrast pairs passed`);
