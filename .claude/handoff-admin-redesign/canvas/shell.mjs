import { TOKENS } from "./tokens.mjs";
import { icon } from "./icons.mjs";
export { icon } from "./icons.mjs";

// Seventeen destinations on the rail. Sections with their own depth (Website,
// Integrations, Settings, Insight) open a sub-nav inside the page instead of
// hiding routes behind a rail accordion.
const NAV = [
  { group: null, items: [["today", "Today", "today"]] },
  { group: "Work", items: [
    ["leads", "Lead inbox", "inbox", "4"],
    ["pipeline", "Pipeline", "board", "9"],
    ["viewings", "Viewings", "calendar"],
    ["tasks", "Tasks", "checkbox", "6"],
    ["requests", "Requests", "bell", "2"],
  ]},
  { group: "People", items: [
    ["contacts", "Contacts", "users"],
    ["companies", "Companies", "company"],
    ["consent", "Consent", "shield"],
  ]},
  { group: "Deals", items: [
    ["cases", "Transaction cases", "case"],
    ["documents", "Documents", "filesign", "3"],
  ]},
  { group: "Content", items: [
    ["listings", "Listings", "building"],
    ["website", "Website", "globe"],
    ["translations", "Translations", "languages", "7"],
  ]},
  { group: "System", items: [
    ["hermes", "Hermes", "sparkles"],
    ["insight", "Insight", "chart"],
    ["integrations", "Integrations", "link", "!"],
    ["settings", "Settings", "gear"],
  ]},
];

export function sidebar(active) {
  const groups = NAV.map((g) => {
    const label = g.group ? `<p class="sb-group">${g.group}</p>` : "";
    const items = g.items.map(([id, text, ic, badge]) => {
      const on = id === active ? " sb-link--on" : "";
      const chip = badge ? `<span class="sb-badge${badge === "!" ? " sb-badge--warn" : ""}">${badge}</span>` : "";
      return `<a class="sb-link${on}" href="#">${icon(ic, 17)}<span>${text}</span>${chip}</a>`;
    }).join("\n        ");
    return `${label}\n        ${items}`;
  }).join("\n        ");
  return `<aside class="sb">
      <div class="sb-brand">
        <img src="ms-realty-logo-reversed.png" alt="MS Realty" width="59" height="30" />
      </div>
      <nav class="sb-nav">
        ${groups}
      </nav>
      <div class="sb-me">
        <span class="sb-av">MR</span>
        <span class="sb-me-text"><b>Mariya Ruseva</b><em>Owner · Sandanski</em></span>
      </div>
    </aside>`;
}

export function topbar({ health = "warn", healthText = "2 connections need attention" } = {}) {
  return `<header class="top">
        <label class="top-search">${icon("search", 16)}
          <input type="search" placeholder="Search leads, listings, pages and documents" value="" />
          <kbd>⌘K</kbd>
        </label>
        <a class="top-health top-health--${health}" href="#">${icon("alert", 15)}<span>${healthText}</span></a>
        <button class="btn btn--primary" type="button">${icon("plus", 16)}<span>New</span></button>
        <button class="top-av" type="button">MR</button>
      </header>`;
}

// A section sub-nav: the second level lives in the page, visible on arrival.
export function subnav(items) {
  return `<nav class="subnav">${items.map(([t, ic, on]) =>
    `<a class="subnav__i${on ? " subnav__i--on" : ""}" href="#">${icon(ic, 16)}<span>${t}</span></a>`).join("")}</nav>`;
}

export const BASE = `${TOKENS}
    * { box-sizing:border-box; }
    body { margin:0; background:var(--canvas); color:var(--text-body);
      font-family:var(--font-sans); font-size:13.5px; line-height:1.45; -webkit-font-smoothing:antialiased; }
    a { color:var(--ink-800); text-decoration:none; }
    a:hover { color:var(--ink-950); }
    h1,h2,h3,h4 { margin:0; font-family:var(--font-sans); color:var(--text-strong); }
    p { margin:0; }
    ::placeholder { color:var(--text-muted); }

    /* ---------- shell ---------- */
    .app { display:grid; grid-template-columns:244px minmax(0,1fr); min-height:100%; }
    .sb { background:var(--sb-bg); border-right:1px solid var(--sb-edge); display:flex; flex-direction:column;
      color:var(--sb-text); }
    .sb-brand { display:flex; align-items:center; padding:18px 20px 12px; }
    .sb-brand img { display:block; height:30px; width:auto; }
    .sb-nav { flex:1 1 auto; display:flex; flex-direction:column; gap:1px; padding:4px 12px; overflow:hidden; }
    .sb-group { margin:11px 8px 3px; font-size:10.5px; font-weight:600; color:var(--sb-label); }
    .sb-link { display:flex; align-items:center; gap:11px; min-height:31px; padding:6px 11px; border-radius:var(--r-md);
      color:var(--sb-text); font-size:13px; font-weight:500; position:relative; }
    .sb-link span { flex:1 1 auto; min-width:0; }
    .sb-link:hover { background:rgba(255,255,255,.07); color:#fff; }
    .sb-link--on { background:rgba(255,255,255,.1); color:#fff; }
    .sb-link--on svg { color:var(--brick-400); }
    .sb-link--on::before { content:''; position:absolute; left:-12px; top:5px; bottom:5px; width:3px;
      border-radius:0 3px 3px 0; background:var(--brick-500); }
    .sb-badge { min-width:19px; height:18px; padding:0 6px; border-radius:var(--r-full); background:var(--brick-600);
      color:#fff; font-size:10.5px; font-weight:600; line-height:18px; text-align:center; flex:0 0 auto; }
    .sb-badge--warn { background:var(--warning-700); }
    .sb-me { display:flex; align-items:center; gap:10px; margin:8px 12px 14px; padding:9px 10px;
      border-radius:var(--r-lg); background:rgba(255,255,255,.06); }
    .sb-av { display:grid; place-items:center; width:31px; height:31px; border-radius:var(--r-full);
      background:var(--brick-600); color:#fff; font-size:11.5px; font-weight:600; flex:0 0 auto; }
    .sb-me-text { display:grid; gap:1px; min-width:0; }
    .sb-me-text b { font-size:12.5px; font-weight:600; color:#fff; }
    .sb-me-text em { font-size:11px; font-style:normal; color:var(--sb-label); }

    .main { display:flex; flex-direction:column; min-width:0; }
    .top { display:flex; align-items:center; gap:12px; height:64px; flex:0 0 64px; padding:0 26px;
      background:rgba(255,255,255,.92); border-bottom:1px solid var(--border); }
    .top-search { display:flex; align-items:center; gap:8px; height:36px; width:430px; padding:0 12px;
      border:1px solid var(--border-control); border-radius:var(--r-md); background:var(--surface); color:var(--text-muted); }
    .top-search input { flex:1 1 auto; min-width:0; border:0; outline:0; background:transparent;
      font:400 13px var(--font-sans); color:var(--text-body); }
    .top-search kbd { font:500 10.5px -apple-system,system-ui,'Segoe UI',sans-serif; color:var(--text-muted);
      border:1px solid var(--border-control); border-radius:var(--r-xs); padding:2px 5px; }
    .top-health { display:flex; align-items:center; gap:7px; margin-left:auto; height:30px; padding:0 11px;
      border-radius:var(--r-full); font-size:12px; font-weight:600; }
    .top-health--warn { background:var(--warning-50); color:var(--warning-700); }
    .top-health--ok { background:var(--success-50); color:var(--success-600); }
    .top-av { display:grid; place-items:center; width:34px; height:34px; border-radius:var(--r-full); border:0;
      background:var(--ink-800); color:#fff; font:600 11.5px var(--font-sans); cursor:pointer; }
    .scroll { flex:1 1 auto; padding:20px 24px 24px; min-width:0; }

    /* ---------- section sub-nav ---------- */
    .subnav { display:flex; gap:2px; padding:3px; margin-bottom:16px; border-radius:var(--r-md);
      background:var(--sunken); overflow:hidden; }
    .subnav__i { display:inline-flex; align-items:center; gap:7px; height:30px; padding:0 12px; border-radius:var(--r-sm);
      font-size:12.5px; font-weight:600; color:var(--text-muted); white-space:nowrap; }
    .subnav__i:hover { color:var(--text-strong); }
    .subnav__i--on { background:var(--surface); color:var(--text-strong); box-shadow:var(--e-1); }

    /* ---------- primitives ---------- */
    .btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 13px; border-radius:var(--r-md);
      border:1px solid var(--border-control); background:var(--surface); color:var(--text-strong);
      font:600 12.5px var(--font-sans); cursor:pointer; white-space:nowrap; }
    .btn:hover { background:var(--sunken); }
    .btn--primary { background:var(--ink-800); border-color:var(--ink-800); color:#fff; }
    .btn--primary:hover { background:var(--ink-900); }
    .btn--accent { background:var(--brick-600); border-color:var(--brick-600); color:#fff; }
    .btn--danger { background:var(--surface); border-color:var(--danger-600); color:var(--danger-600); }
    .btn--ghost { border-color:transparent; background:transparent; color:var(--text-muted); }
    .btn--sm { height:30px; padding:0 11px; font-size:12px; }
    .btn--lg { height:40px; padding:0 18px; font-size:13.5px; }
    .btn[data-disabled] { opacity:.5; cursor:not-allowed; }
    .btn[data-focus] { box-shadow:var(--ring); }

    .ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:16px; }
    .ph h1 { font-family:var(--font-display); font-weight:600; font-size:26px; letter-spacing:-.015em; }
    .ph p { margin-top:3px; font-size:13px; color:var(--text-muted); }
    .ph-actions { display:flex; align-items:center; gap:10px; }

    .seg { display:inline-flex; gap:2px; padding:3px; border-radius:var(--r-md); background:var(--sunken); }
    .seg button { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 12px; border:0;
      border-radius:var(--r-sm); background:transparent; color:var(--text-muted);
      font:600 12.5px var(--font-sans); cursor:pointer; white-space:nowrap; }
    .seg button[data-on] { background:var(--surface); color:var(--text-strong); box-shadow:var(--e-1); }
    .seg em { font-style:normal; color:var(--text-muted); font-weight:600; }

    .panel { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-lg);
      box-shadow:var(--e-2); overflow:hidden; }
    .panel-hd { display:flex; align-items:center; justify-content:space-between; gap:12px;
      padding:12px 16px; border-bottom:1px solid var(--border); }
    .panel-hd h2 { font-size:14.5px; font-weight:600; letter-spacing:-.005em; }
    .panel-hd .sub { font-size:12px; color:var(--text-muted); font-weight:400; }
    .sect { padding:16px 20px; border-bottom:1px solid var(--border); }
    .sect:last-child { border-bottom:0; }
    .sect > h3 { font-size:13px; font-weight:600; margin-bottom:10px; display:flex; align-items:center;
      justify-content:space-between; gap:10px; }

    .pill { display:inline-flex; align-items:center; gap:6px; padding:3px 9px; border-radius:var(--r-full);
      font-size:11.5px; font-weight:600; white-space:nowrap; }
    .pill i { width:6px; height:6px; border-radius:var(--r-full); background:currentColor; flex:0 0 auto; }
    .pill--danger { color:var(--danger-600); background:var(--danger-50); }
    .pill--warn { color:var(--warning-700); background:var(--warning-50); }
    .pill--ok { color:var(--success-600); background:var(--success-50); }
    .pill--sea { color:var(--sea-700); background:var(--sea-50); }
    .pill--ink { color:var(--ink-800); background:var(--ink-50); }
    .pill--sand { color:var(--stone-700); background:var(--stone-100); }
    .pill--ai { color:var(--brick-700); background:var(--brick-50); }

    .mono { font-family:var(--font-mono); font-size:11.5px; color:var(--text-muted); white-space:nowrap; }
    .muted { color:var(--text-muted); }
    .price { font-family:var(--font-display); font-weight:600; color:var(--stone-900); }
    .av { display:grid; place-items:center; width:26px; height:26px; border-radius:var(--r-full);
      background:var(--stone-200); color:var(--stone-700); font-size:10.5px; font-weight:600; flex:0 0 auto; }

    /* ---------- table ---------- */
    .toolbar { display:flex; align-items:center; gap:8px; padding:10px 14px; border-bottom:1px solid var(--border);
      background:var(--sunken); }
    .find { display:flex; align-items:center; gap:7px; width:260px; height:31px; padding:0 10px;
      border:1px solid var(--border-control); border-radius:var(--r-md); background:var(--surface);
      color:var(--text-muted); font-size:12.5px; }
    table { width:100%; border-collapse:separate; border-spacing:0; }
    th { text-align:left; padding:8px 12px; border-bottom:1px solid var(--border); background:var(--stone-50);
      font-size:11px; font-weight:600; letter-spacing:.02em; color:var(--text-muted); white-space:nowrap; }
    td { padding:8px 12px; border-bottom:1px solid var(--border); font-size:12.5px; vertical-align:middle; }
    tbody tr:hover td { background:var(--stone-50); }
    tbody tr:last-child td { border-bottom:0; }
    .t2 { display:grid; gap:1px; min-width:0; }
    .t2 b { font-size:13px; font-weight:600; color:var(--text-strong); overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; }
    .t2 span { font-size:11.5px; color:var(--text-muted); }
    .foot { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:11px 14px;
      font-size:12.5px; color:var(--text-muted); }
    .box { width:15px; height:15px; border-radius:var(--r-xs); border:1.5px solid var(--border-control);
      background:var(--surface); flex:0 0 auto; }
    .box[data-on] { background:var(--ink-800); border-color:var(--ink-800);
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23fff' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12 5 5 9-10'/%3E%3C/svg%3E");
      background-size:11px 11px; background-position:center; background-repeat:no-repeat; }

    /* ---------- forms ---------- */
    .fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px 20px; padding:16px 20px; }
    .field { display:grid; gap:5px; min-width:0; }
    .field label { font-size:12px; font-weight:600; color:var(--text-body); }
    .field label em { font-style:normal; color:var(--brick-600); }
    .in { display:flex; align-items:center; height:38px; padding:0 11px; border:1px solid var(--border-control);
      border-radius:var(--r-md); background:var(--surface); font-size:13px; color:var(--text-strong); }
    .in--empty { color:var(--text-muted); }
    .in--area { height:auto; min-height:76px; align-items:flex-start; padding:10px 11px; line-height:1.5; }
    .in--focus { border-color:var(--ink-800); box-shadow:var(--ring); }
    .in--error { border-color:var(--danger-600); }
    .hint { font-size:11.5px; color:var(--text-muted); }
    .hint--error { color:var(--danger-600); font-weight:500; }
    .full { grid-column:1 / -1; }
    .toggle { width:38px; height:22px; border-radius:var(--r-full); background:var(--border-control);
      position:relative; flex:0 0 auto; }
    .toggle i { position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:var(--r-full);
      background:#fff; box-shadow:var(--e-1); }
    .toggle[data-on] { background:var(--success-500); }
    .toggle[data-on] i { left:19px; }
    .savebar { display:flex; align-items:center; gap:12px; padding:12px 20px; border-top:1px solid var(--border);
      background:var(--sunken); }
    .sw { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px;
      padding:13px 20px; border-top:1px solid var(--border); }
    .sw b { display:block; font-size:13px; font-weight:600; color:var(--text-strong); }
    .sw span { font-size:12px; color:var(--text-muted); }

    /* ---------- misc ---------- */
    .note { display:flex; align-items:flex-start; gap:8px; padding:9px 11px; border-radius:var(--r-md);
      font-size:12px; font-weight:500; }
    .note--warn { background:var(--warning-50); color:var(--warning-700); }
    .note--ai { background:var(--brick-50); color:var(--brick-700); }
    .note--info { background:var(--sea-50); color:var(--sea-700); }
    .kv { display:grid; gap:1px; background:var(--border); border-bottom:1px solid var(--border); }
    .kv > div { background:var(--surface); padding:11px 20px; min-width:0; }
    .kv dt { font-size:11.5px; color:var(--text-muted); margin-bottom:3px; }
    .kv dd { margin:0; font-size:13px; font-weight:600; color:var(--text-strong);
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .empty { display:grid; justify-items:center; gap:8px; padding:34px 20px; text-align:center; }
    .empty svg { color:var(--text-ghost); }
    .empty b { font-size:13.5px; font-weight:600; color:var(--text-strong); }
    .empty p { font-size:12.5px; color:var(--text-muted); max-width:340px; }
    .tl-row { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:10px; align-items:start;
      padding:10px 0; border-bottom:1px solid var(--border); }
    .tl-row:last-child { border-bottom:0; }
    .tl-row p { font-size:12.5px; }
    .tl-row em { font-style:normal; color:var(--text-muted); }

    /* Shared, because more than one screen uses them. */
    .tabs { display:flex; gap:18px; border-bottom:1px solid var(--border); }
    .tabs a { padding:9px 0 10px; font-size:13px; font-weight:600; color:var(--text-muted);
      border-bottom:2px solid transparent; margin-bottom:-1px; white-space:nowrap; }
    .tabs a[data-on] { color:var(--text-strong); border-bottom-color:var(--ink-800); }
    .crumbs { display:flex; align-items:center; gap:7px; font-size:12px; color:var(--text-muted);
      margin-bottom:10px; }
    .crumbs b { color:var(--text-strong); }
    .prog { height:6px; border-radius:var(--r-full); background:var(--stone-200); overflow:hidden; }
    .prog i { display:block; height:100%; border-radius:var(--r-full); background:var(--success-500); }
    .skel { border-radius:var(--r-xs);
      background:linear-gradient(90deg,var(--stone-100),var(--stone-200),var(--stone-100)); }

    /* Inline Hermes assist. Sits in a field's label row so every editable value on
       every screen has the same one-click draft, and the same approval boundary. */
    .lblrow { display:flex; align-items:center; gap:8px; }
    .lblrow > label, .lblrow > b { flex:1 1 auto; min-width:0; }
    .assist { display:inline-flex; align-items:center; gap:5px; height:22px; padding:0 8px;
      border-radius:var(--r-full); border:1px solid var(--brick-300); background:var(--brick-50);
      color:var(--brick-700); font:600 11px var(--font-sans); cursor:pointer; white-space:nowrap; flex:0 0 auto; }
    .assist:hover { background:var(--brick-100, #F9D4D4); }
    .assist--icon { padding:0; width:22px; justify-content:center; }
    .assist[data-busy] { border-color:var(--border-control); background:var(--stone-100);
      color:var(--text-muted); }
    .assist-menu { display:grid; gap:1px; padding:5px; border-radius:var(--r-md); background:var(--surface);
      border:1px solid var(--border); box-shadow:var(--e-3); width:230px; }
    .assist-menu button { display:flex; align-items:center; gap:9px; width:100%; height:31px; padding:0 9px;
      border:0; border-radius:var(--r-sm); background:transparent; color:var(--text-body);
      font:500 12.5px var(--font-sans); cursor:pointer; text-align:left; }
    .assist-menu button:hover { background:var(--stone-100); }
    .assist-menu hr { border:0; border-top:1px solid var(--border); margin:4px 0; }
    .assist-menu small { display:block; padding:5px 9px 3px; font-size:10.5px; color:var(--text-muted); }
    .drafted { border-color:var(--brick-300); background:var(--brick-50); }
    .drafted-bar { display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:var(--r-sm);
      background:var(--brick-50); border:1px solid var(--brick-300); font-size:11.5px; font-weight:600;
      color:var(--brick-700); }

    /* Used on several screens, so they belong here rather than in one screen's block. */
    .kvline { display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12.5px; }
    .toast { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:11px; align-items:center;
      padding:11px 13px; border-radius:var(--r-md); background:var(--ink-900); color:#fff; box-shadow:var(--e-3); }
    .toast b { font-size:12.5px; font-weight:600; display:block; }
    .toast span { font-size:11.5px; color:rgba(255,255,255,.66); }
    .toast a { color:#fff; font-size:12px; font-weight:600; text-decoration:underline; }

    /* Compatibility aliases for artboards authored against the first token pass.
       --text-subtle measured 2.40:1 and is no longer a text colour anywhere. */
    .app { --text-subtle:var(--text-muted); }
    .subtle { color:var(--text-muted); }
`;

export const HELMET_BASE = BASE;

export function page({ title, active, body, health, healthText, width = 1440, height = 980, extraCss = "" }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>${BASE}${extraCss}
  </style>
</helmet>
<div class="app" style="width:${width}px; min-height:${height}px">
  ${sidebar(active)}
  <div class="main">
    ${topbar({ health, healthText })}
    <div class="scroll">
${body}
    </div>
  </div>
</div>
</x-dc>
</body>
</html>
`;
}

// A bare artboard (no app chrome) — foundations, component sheets, flow maps.
export function sheet({ body, width = 1440, height = 1200, extraCss = "", pad = 40 }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>${BASE}${extraCss}
  </style>
</helmet>
<div style="width:${width}px; min-height:${height}px; background:var(--canvas); padding:${pad}px">
${body}
</div>
</x-dc>
</body>
</html>
`;
}
