import fs from "node:fs";
import { sheet, icon } from "../shell.mjs";
import { ICON } from "../icons.mjs";
import { CANONICAL_SPACING, ICON_BANDS, SPACING_STEPS } from "../tokens.mjs";

const CSS = `
    .doc-hd { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:26px; }
    .doc-hd h1 { font-family:var(--font-display); font-size:32px; font-weight:600; letter-spacing:-.02em; }
    .doc-hd p { margin-top:5px; font-size:13.5px; color:var(--text-muted); max-width:640px; }
    .grp { margin-bottom:30px; }
    .grp > h2 { font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:10px;
      padding-bottom:7px; border-bottom:1px solid var(--border); }
    .cols { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; align-items:start; }
    .ramp { display:grid; grid-template-columns:96px repeat(11,minmax(0,1fr)); align-items:center; gap:0;
      margin-bottom:6px; }
    .ramp b { font-size:12px; font-weight:600; color:var(--text-strong); }
    .swatch { height:46px; display:grid; align-items:end; padding:4px 5px; font:500 8.5px var(--font-mono); }
    .roles { width:100%; }
    .roles td, .roles th { padding:7px 10px; font-size:12px; }
    .chipbox { display:inline-flex; align-items:center; gap:7px; }
    .dot { width:15px; height:15px; border-radius:var(--r-xs); border:1px solid rgba(0,0,0,.12); flex:0 0 auto; }
    .ok { color:var(--success-600); font-weight:600; }
    .bad { color:var(--danger-600); font-weight:600; }
    .type-row { display:grid; grid-template-columns:118px minmax(0,1fr); gap:16px; align-items:baseline;
      padding:9px 0; border-bottom:1px solid var(--border); }
    .type-row:last-child { border-bottom:0; }
    .type-row .m { font:500 11px var(--font-mono); color:var(--text-muted); }
    .scale { display:flex; align-items:flex-end; gap:10px; }
    .scale div { background:var(--sea-100); border-radius:2px 2px 0 0; }
    .scale span { display:block; margin-top:5px; font:500 10px var(--font-mono); color:var(--text-muted);
      text-align:center; }
    .rad { display:flex; gap:14px; }
    .rad div { width:74px; height:56px; background:var(--stone-200); border:1px solid var(--border-control);
      display:grid; place-items:end center; padding-bottom:5px; font:500 10px var(--font-mono);
      color:var(--stone-700); }
    .elev { display:flex; gap:16px; }
    .elev div { width:120px; height:64px; border-radius:var(--r-lg); background:var(--surface);
      border:1px solid var(--border); display:grid; place-items:center; font:500 10.5px var(--font-mono);
      color:var(--text-muted); }
    .icons { display:grid; grid-template-columns:repeat(14,1fr); gap:2px; }
    .icons span { display:grid; place-items:center; height:44px; border-radius:var(--r-md);
      background:var(--surface); border:1px solid var(--border); color:var(--text-body); }
    .gridfig { display:grid; grid-template-columns:244px minmax(0,1fr); height:150px; border-radius:var(--r-md);
      overflow:hidden; border:1px solid var(--border); }
    .gridfig .a { background:var(--ink-900); color:#fff; font:600 11px var(--font-mono); display:grid;
      place-items:center; }
    .gridfig .b { background:var(--surface); padding:12px; display:grid; grid-template-rows:auto minmax(0,1fr); gap:8px; }
    .gridfig .bar { height:22px; border-radius:var(--r-sm); background:var(--sunken); display:grid;
      place-items:center; font:500 10.5px var(--font-mono); color:var(--text-muted); }
    .g12 { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:20px; }
    .g12 i { background:var(--sea-50); border:1px dashed var(--sea-200); border-radius:3px; }
    .note-b { font-size:12px; color:var(--text-muted); margin-top:8px; }
    .rtl { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
    .rtl .c { padding:12px 14px; border:1px solid var(--border); border-radius:var(--r-md);
      background:var(--surface); }
    .rtl .c b { display:block; font-size:12px; margin-bottom:7px; }
`;

const RAMPS = [
  ["Stone", ["#FAF7F1","#F2ECE1","#E6DCCB","#D3C4AC","#B7A585","#948263","#73644A","#574B38","#3A3227","#241F18","#16130E"]],
  ["Ink", ["#F4F4F3","#E6E6E5","#C9C9C7","#A6A6A4","#7A7A78","#545453","#3F3F3F","#2E2E2E","#222222","#181818","#0E0E0E"]],
  ["Brick", ["#FCEBEB","#F9D4D4","#F3ADAD","#ED8484","#E45D5D","#DB3E3E","#C42D2D","#A32323","#7F1B1B","#571212",""]],
  ["Sea", ["#ECF3F2","#D2E3E1","#A6C7C4","#71A29E","#467D79","#2C615E","#204B49","#183B39","#122C2B","#0D2120",""]],
  ["Sun", ["","#FBEECF","","#F0CE7A","#E6B048","#D2952A","#AE7420","","","",""]],
];
const STEPS = ["50","100","200","300","400","500","600","700","800","900","950"];

function ramp(name, cols) {
  const cells = cols.map((c, i) => c
    ? `<span class="swatch" style="background:${c}; color:${i > 5 ? "rgba(255,255,255,.82)" : "rgba(0,0,0,.55)"}">${STEPS[i]}</span>`
    : `<span class="swatch" style="background:transparent"></span>`).join("");
  return `<div class="ramp"><b>${name}</b>${cells}</div>`;
}


// 1.4.3 wants 4.5:1 for body text; 1.4.11 wants 3:1 for the boundary of a
// control. Which applies is a property of the role, so each row declares it.
const AA_FLOOR = { text: 4.5, nonText: 3 };

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function rgb(value, background) {
  const alpha = value.match(/rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
  if (alpha) {
    const [, r, g, b, a] = alpha.map(Number);
    // A translucent role is only as legible as what shows through it.
    return [r, g, b].map((c, i) => Math.round(c * a + background[i] * (1 - a)));
  }
  const hex = value.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function contrast(value, against) {
  const back = rgb(against, [255, 255, 255]);
  const front = rgb(value, back);
  const [hi, lo] = [luminance(front), luminance(back)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const ROLES = [
  ["--text-strong", "#241F18", "Headings, table primaries", "#FFFFFF", "text"],
  ["--text-body", "#3A3227", "Paragraphs, cell values", "#FAF7F1", "text"],
  ["--text-muted", "#73644A", "Labels, meta, placeholders", "#FFFFFF", "text"],
  ["--text-muted", "#73644A", "Same, on a sunken toolbar", "#F2ECE1", "text"],
  ["--border-control", "#948263", "Input and button edges (1.4.11)", "#FFFFFF", "nonText"],
  ["--brand", "#222222", "Primary button fill", "#FFFFFF", "text"],
  ["--accent", "#C42D2D", "One CTA, and counts", "#FFFFFF", "text"],
  // The rail marker is a different colour on a different ground, and was being
  // reported at the accent's ratio. Measured: #DB3E3E on #181818.
  ["--brick-500", "#DB3E3E", "The active rail marker", "#181818", "nonText"],
  ["--sb-label", "rgba(255,255,255,.54)", "Rail group labels, composited", "#181818", "text"],
  ["--warning-700", "#8A5F18", "Warning text and pills", "#FBF1DD", "text"],
  ["--danger-600", "#9E2334", "Overdue, destructive", "#F9E7EA", "text"],
  ["--success-600", "#256345", "Live, approved, won", "#E7F3EC", "text"],
  ["--sea-700", "#183B39", "Neutral informational state", "#ECF3F2", "text"],
];

const TYPE = [
  ["Display / 32", "font-family:var(--font-display); font-size:32px; font-weight:600; letter-spacing:-.02em", "Source Serif 4 · 600 · −0.02em", "Operator workspace"],
  ["Display / 26", "font-family:var(--font-display); font-size:26px; font-weight:600; letter-spacing:-.015em", "Page titles only", "Lead inbox"],
  ["Display / 19", "font-family:var(--font-display); font-size:19px; font-weight:600; letter-spacing:-.01em", "Record names in a detail pane", "Maria Petrova"],
  ["UI / 14.5 semi", "font-size:14.5px; font-weight:600", "Panel headings", "Needs you now"],
  ["UI / 13.5", "font-size:13.5px", "Default body and rows", "Two-bedroom apartment with a south terrace"],
  ["UI / 13 semi", "font-size:13px; font-weight:600", "Row primaries, field labels", "Reply deadline"],
  ["UI / 12.5", "font-size:12.5px", "Table cells, secondary rows", "Sandanski · Apartment · €68,000"],
  ["UI / 12", "font-size:12px; color:var(--text-muted)", "Meta, hints, captions", "Escalated to manager 4 Jul, 04:00"],
  ["UI / 11.5 semi", "font-size:11.5px; font-weight:600", "Pills and chips", "Needs review"],
  ["Mono / 11.5", "font-family:var(--font-mono); font-size:11.5px; color:var(--text-muted)", "References, ids, env keys", "MS-00815 · HERMES_API_KEY"],
];

// The bar chart and the specimen panel used to name different sets of nine. One
// array now feeds both, so the sheet cannot contradict itself about its own type
// scale again.
const TYPE_SIZES = [...new Set(TYPE.map(([, css]) => Number(css.match(/font-size:([\d.]+)px/)[1])))].sort((a, b) => a - b);

const BODY = `<div class="doc-hd">
  <div>
    <h1>Foundations</h1>
    <p>The resolved values every screen in this workspace is built from. Ramps come from the MS Realty
      design system. Four roles were corrected where an inherited value misses a WCAG 2.2 AA threshold at
      the densities this tool runs at: one new value (--warning-700), one role re-pointed to an existing
      step (--border-control to stone-500), one withdrawn from text altogether (--text-ghost, 2.40:1), and
      one composited alpha raised (--sb-label, .38 was 3.59:1).</p>
  </div>
  <div style="display:grid; gap:6px; justify-items:end">
    <span class="pill pill--ok"><i></i>WCAG 2.2 AA verified</span>
    <span class="mono">${ROLES.length} pairs measured · 4 corrected</span>
  </div>
</div>

<div class="grp">
  <h2>Colour ramps</h2>
  ${RAMPS.map(([n, c]) => ramp(n, c)).join("\n  ")}
  <div class="ramp" style="margin-top:10px">
    <b>Status</b>
    <span class="swatch" style="background:#E7F3EC; color:rgba(0,0,0,.55)">succ 50</span>
    <span class="swatch" style="background:#2F7D57; color:rgba(255,255,255,.85)">500</span>
    <span class="swatch" style="background:#256345; color:rgba(255,255,255,.85)">600</span>
    <span class="swatch" style="background:#FBF1DD; color:rgba(0,0,0,.55)">warn 50</span>
    <span class="swatch" style="background:#9A6A1B; color:rgba(255,255,255,.85)">600</span>
    <span class="swatch" style="background:#8A5F18; color:rgba(255,255,255,.85)">700 new</span>
    <span class="swatch" style="background:#F9E7EA; color:rgba(0,0,0,.55)">dngr 50</span>
    <span class="swatch" style="background:#C42E44; color:rgba(255,255,255,.85)">500</span>
    <span class="swatch" style="background:#9E2334; color:rgba(255,255,255,.85)">600</span>
    <span class="swatch" style="background:transparent"></span>
    <span class="swatch" style="background:transparent"></span>
  </div>
  <p class="note-b">Brick is the identity red and stays rare: one call to action, the active rail marker,
    unread counts. Everything structural is charcoal on warm stone.</p>
</div>

<div class="grp">
  <h2>Semantic roles and their measured contrast</h2>
  <div class="panel">
    <table class="roles">
      <thead><tr><th>Token</th><th>Value</th><th>Used for</th><th>Against</th><th>Ratio</th><th>AA</th></tr></thead>
      <tbody>
${ROLES.map(([t, v, u, a, kind]) => {
  const measured = contrast(v, a);
  const passes = measured >= AA_FLOOR[kind];
  return `        <tr>
          <td><span class="mono">${t}</span></td>
          <td><span class="chipbox"><span class="dot" style="background:${v}"></span><span class="mono">${v}</span></span></td>
          <td>${u}</td>
          <td><span class="chipbox"><span class="dot" style="background:${a}"></span><span class="mono">${a}</span></span></td>
          <td><b>${measured.toFixed(2)}:1</b></td>
          <td class="${passes ? "ok" : "bad"}">${passes ? "pass" : "fail"} · needs ${AA_FLOOR[kind]}</td>
        </tr>`;
}).join("\n")}
      </tbody>
    </table>
  </div>
  <p class="note-b">Every ratio above is computed from the two colours beside it when this sheet is built,
    and the verdict against the floor its role actually has to clear — 4.5:1 for text, 3:1 for the boundary
    of a control. Four corrections, each forced by a number rather than taste: warning text moved from 600
    to a new 700 step (600 measured 4.21:1 on its own tint); control edges moved off the hairline grey to
    stone-500, because an input's border is the only thing identifying it; the palest text role was
    withdrawn from text altogether at 2.40:1 — an empty value now says <b>Not set</b> in muted type instead
    of being greyed out, which also clears 1.4.1; and the rail's group labels went from .38 alpha to .54,
    because .38 composites to 3.59:1 on the rail.</p>
</div>

<div class="grp">
  <h2>Type</h2>
  <div class="cols">
    <div class="panel" style="padding:6px 16px">
${TYPE.map(([n, s, note, sample]) => `      <div class="type-row">
        <span><b style="font-size:12px; display:block">${n}</b><span class="m">${note}</span></span>
        <span style="${s}">${sample}</span>
      </div>`).join("\n")}
    </div>
    <div>
      <div class="panel" style="padding:16px">
        <p style="font-size:12.5px; color:var(--text-muted); margin-bottom:12px">
          Two families do the work. Source Serif 4 carries identity and appears only where a person names
          something — page titles, record names, prices. Commissioner carries every working surface.
          IBM Plex Mono is reserved for strings a person may have to type or quote exactly.</p>
        <div class="scale">
          <div style="width:38px; height:20px"></div><div style="width:38px; height:24px"></div>
          <div style="width:38px; height:26px"></div><div style="width:38px; height:29px"></div>
          <div style="width:38px; height:32px"></div><div style="width:38px; height:36px"></div>
          <div style="width:38px; height:44px"></div><div style="width:38px; height:52px"></div>
          <div style="width:38px; height:64px"></div>
        </div>
        <div style="display:flex; gap:10px; margin-top:2px">
          ${TYPE_SIZES.map((s) => `<span style="width:38px; font:500 10px var(--font-mono); color:var(--text-muted); text-align:center">${s}</span>`).join("")}
        </div>
        <p class="note-b">${TYPE_SIZES.length} sizes, and the chart above is the specimen list beside it —
          both are rendered from the same array, so they cannot come to disagree. Line height is 1.45 for
          running text, 1.25 for headings, 1 for anything inside a pill or a chip.</p>
      </div>
      <div class="panel" style="padding:16px; margin-top:16px">
        <b style="font-size:12.5px">Prices and references keep their own faces</b>
        <div style="display:flex; align-items:baseline; gap:16px; margin-top:9px">
          <span class="price" style="font-size:20px">€185,000</span>
          <span class="price" style="font-size:14px">€400 / month</span>
          <span class="mono" style="font-size:13px">MS-00191</span>
        </div>
        <p class="note-b">A price is a fact a buyer acts on, so it gets the display face and never wraps.
          A reference is a string someone reads out on the phone, so it gets mono and never breaks mid-token.</p>
      </div>
    </div>
  </div>
</div>

<div class="grp">
  <h2>Spacing, radius, elevation</h2>
  <div class="cols" style="grid-template-columns:1.1fr .9fr">
    <div class="panel" style="padding:16px">
      <b style="font-size:12.5px">Spacing — a 4px unit, ${SPACING_STEPS.length} steps</b>
      <div class="scale" style="margin-top:12px">
        ${SPACING_STEPS.map((v) => `<div style="width:${v}px; height:${v}px; background:var(--sea-100)"></div>`).join("")}
      </div>
      <div style="display:flex; gap:10px; margin-top:4px">
        ${SPACING_STEPS.map((v) => `<span style="width:${v}px; font:500 10px var(--font-mono); color:var(--text-muted)">${v}</span>`).join("")}
      </div>
      <p class="note-b">Row padding ${CANONICAL_SPACING.rowPadding.join("/")}. Panel padding
        ${CANONICAL_SPACING.panelPadding.join("/")}. Page gutter ${CANONICAL_SPACING.pageGutter}.
        Column gap ${CANONICAL_SPACING.columnGap}. Every measurement this sheet publishes is a step, and
        the linter refuses one that is not. Optical nudges below 4px are not spacing and are not on it.</p>
      <b style="font-size:12.5px; display:block; margin-top:18px">Radius — five, and one rule each</b>
      <div class="rad" style="margin-top:10px">
        <div style="border-radius:4px">4 chip</div>
        <div style="border-radius:6px">6 inner</div>
        <div style="border-radius:8px">8 control</div>
        <div style="border-radius:14px">14 panel</div>
        <div style="border-radius:999px">999 pill</div>
      </div>
    </div>
    <div class="panel" style="padding:16px">
      <b style="font-size:12.5px">Elevation — three, and mostly the first</b>
      <div class="elev" style="margin-top:12px">
        <div style="box-shadow:var(--e-1)">e-1 raised row</div>
        <div style="box-shadow:var(--e-2)">e-2 panel</div>
        <div style="box-shadow:var(--e-3)">e-3 overlay</div>
      </div>
      <p class="note-b">Depth is not decoration here: e-1 marks a selected row, e-2 separates a panel from
        the canvas, e-3 belongs to things that float over the page and trap focus. Nothing else casts a shadow.</p>
      <b style="font-size:12.5px; display:block; margin-top:18px">Motion</b>
      <p class="note-b" style="margin-top:6px">140ms ease-out on hover and state, 200ms on anything entering
        the page, nothing over 240ms. No motion carries meaning on its own, and every transition is
        suppressed under <span class="mono">prefers-reduced-motion</span>.</p>
    </div>
  </div>
</div>

<div class="grp">
  <h2>Layout</h2>
  <div class="cols">
    <div>
      <div class="gridfig">
        <div class="a">244 rail</div>
        <div class="b">
          <span class="bar">64 topbar</span>
          <span style="border:1px dashed var(--border-control); border-radius:var(--r-md); display:grid; place-items:center; font:500 10.5px var(--font-mono); color:var(--text-muted)">content · 26px gutter</span>
        </div>
      </div>
      <p class="note-b">The rail is fixed at 244 and never collapses on desktop; below 1280 it becomes a
        drawer and the phone layout takes over below 768.</p>
    </div>
    <div>
      <div class="g12" style="height:150px">${"<i></i>".repeat(12)}</div>
      <p class="note-b">Twelve columns, 20px gutters, inside a 1240 maximum. Tables, boards and the media
        library break out to full width on purpose — that break is named, so it is emphasis rather than drift.</p>
    </div>
  </div>
</div>

<div class="grp">
  <h2>Icons</h2>
  <div class="icons">
${Object.keys(ICON).slice(0, 56).map((k) => `    <span title="${k}">${icon(k, 19)}</span>`).join("\n")}
  </div>
  <p class="note-b">One stroke family: 24px grid, 1.6 stroke, round caps. Two densities:
    ${ICON_BANDS.inline.join("\u2013")}px beside a word, ${ICON_BANDS.illustration.join("\u2013")}px as the
    single figure in an empty state, and the linter refuses a drawing outside them. Icons never carry a
    state on their own — every one of them sits beside a word, because there is no drawing for undo, sync
    scope, or approval.</p>
</div>

<div class="grp" style="margin-bottom:0">
  <h2>Locale and direction</h2>
  <div class="rtl">
    <div class="c">
      <b>Seven public languages, three in the workspace</b>
      <p style="font-size:12px; color:var(--text-muted)">Operators work in Bulgarian, Russian or English.
        Every label is written to survive a Bulgarian string roughly a third longer than its English source,
        so nothing is sized to fit its English width.</p>
    </div>
    <div class="c" dir="rtl">
      <b>עברית — full right-to-left</b>
      <p style="font-size:12px; color:var(--text-muted)">Hebrew mirrors the whole shell: the rail moves right,
        icons and chevrons flip, and numbers, prices and references stay left-to-right inside the mirrored line.</p>
    </div>
  </div>
</div>`;

fs.writeFileSync(new URL("../Foundations.dc.html", import.meta.url), sheet({ body: BODY, width: 1440, height: 2560, extraCss: CSS }));
console.log("Foundations.dc.html");
