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
      font-family:var(--font-sans); font-size:13px; line-height:1.45; -webkit-font-smoothing:antialiased;
      font-variant-numeric:tabular-nums; }
    a { color:var(--ink-800); text-decoration:none; text-underline-offset:.18em; }
    a:hover { color:var(--ink-950); text-decoration:underline; }
    h1,h2,h3,h4 { margin:0; font-family:var(--font-sans); color:var(--text-strong); text-wrap:balance; }
    p { margin:0; }
    ::placeholder { color:var(--text-muted); }
    :focus-visible { outline:0; box-shadow:var(--ring); }
    @media (prefers-reduced-motion:reduce) { *, *::before, *::after { animation:none !important; transition:none !important; } }

    /* ---------- shell: a pale tiled rail, the current room marked in ink ---------- */
    .app { display:grid; grid-template-columns:244px minmax(0,1fr); min-height:100%; }
    .sb { background:var(--sb-bg); border-right:1px solid var(--sb-edge); display:flex; flex-direction:column;
      color:var(--sb-text); }
    .sb-brand { display:flex; align-items:center; padding:18px 20px 12px; }
    .sb-brand img { display:block; height:30px; width:auto; }
    .sb-nav { flex:1 1 auto; display:flex; flex-direction:column; gap:1px; padding:4px 12px; overflow:hidden; }
    .sb-group { margin:12px 8px 4px; font-size:11px; font-weight:600; color:var(--sb-label); }
    .sb-link { display:flex; align-items:center; gap:11px; min-height:32px; padding:6px 10px; border-radius:var(--r-edge);
      color:var(--sb-text); font-size:13px; font-weight:500; position:relative; }
    .sb-link span { flex:1 1 auto; min-width:0; }
    .sb-link:hover { background:var(--tile-shadow); color:var(--text-strong); text-decoration:none; }
    .sb-link--on { background:var(--sb-on); color:var(--tile-glaze); }
    .sb-link--on svg { color:var(--brick-400); }
    .sb-badge { min-width:19px; height:18px; padding:0 6px; border-radius:var(--r-pill); background:var(--ink-800);
      color:#fff; font-size:11px; font-weight:600; line-height:18px; text-align:center; flex:0 0 auto; }
    .sb-link--on .sb-badge { background:var(--tile-glaze); color:var(--ink-900); }
    .sb-badge--warn { background:var(--warning-700); }
    .sb-me { display:flex; align-items:center; gap:10px; margin:8px 12px 14px; padding:9px 10px;
      border-radius:var(--r-panel); border:1px solid var(--joint); background:var(--tile-glaze); }
    .sb-av { display:grid; place-items:center; width:31px; height:31px; border-radius:var(--r-pill);
      background:var(--ink-900); color:#fff; font-size:11px; font-weight:600; flex:0 0 auto; }
    .sb-me-text { display:grid; gap:1px; min-width:0; }
    .sb-me-text b { font-size:13px; font-weight:600; color:var(--text-strong); }
    .sb-me-text em { font-size:11px; font-style:normal; color:var(--text-muted); }

    .main { display:flex; flex-direction:column; min-width:0; }
    .top { display:flex; align-items:center; gap:12px; height:56px; flex:0 0 56px; padding:0 24px;
      background:var(--tile-glaze); border-bottom:1px solid var(--joint); }
    .top-search { display:flex; align-items:center; gap:8px; height:36px; width:430px; padding:0 12px;
      border:1px solid var(--border-control); border-radius:var(--r-edge); background:var(--surface); color:var(--text-muted); }
    .top-search input { flex:1 1 auto; min-width:0; border:0; outline:0; background:transparent;
      font:400 13px var(--font-sans); color:var(--text-body); }
    .top-search kbd { font:500 11px var(--font-sans); color:var(--text-muted);
      border:1px solid var(--joint); border-radius:var(--r-edge); padding:2px 5px; }
    .top-health { display:flex; align-items:center; gap:7px; margin-left:auto; height:30px; padding:0 11px;
      border-radius:var(--r-pill); font-size:13px; font-weight:600; }
    .top-health--warn { background:var(--warning-50); color:var(--warning-700); }
    .top-health--ok { background:var(--success-50); color:var(--success-600); }
    .top-av { display:grid; place-items:center; width:34px; height:34px; border-radius:var(--r-pill); border:0;
      background:var(--ink-900); color:#fff; font:600 11px var(--font-sans); cursor:pointer; }
    .scroll { flex:1 1 auto; padding:20px 24px 24px; min-width:0; }

    /* ---------- section sub-nav: a row of tabs on a grout line ---------- */
    .subnav { display:flex; gap:20px; margin-bottom:16px; border-bottom:1px solid var(--joint); }
    .subnav__i { display:inline-flex; align-items:center; gap:7px; height:36px; padding:0 2px; margin-bottom:-1px;
      border-bottom:2px solid transparent; font-size:13px; font-weight:600; color:var(--text-muted); white-space:nowrap; }
    .subnav__i:hover { color:var(--text-strong); text-decoration:none; }
    .subnav__i--on { color:var(--text-strong); border-bottom-color:var(--ink-900); }

    /* ---------- primitives ---------- */
    .btn { display:inline-flex; align-items:center; gap:7px; height:36px; padding:0 14px; border-radius:var(--r-edge);
      border:1px solid var(--border-control); background:var(--surface); color:var(--text-strong);
      font:600 13px var(--font-sans); cursor:pointer; white-space:nowrap; }
    .btn:hover { background:var(--sunken); text-decoration:none; }
    .btn--primary { background:var(--ink-900); border-color:var(--ink-900); color:#fff; }
    .btn--primary:hover { background:var(--ink-950); }
    .btn--accent { background:var(--brick-600); border-color:var(--brick-600); color:#fff; }
    .btn--accent:hover { background:var(--brick-700); }
    .btn--danger { background:var(--surface); border-color:var(--danger-600); color:var(--danger-600); }
    .btn--ghost { border-color:transparent; background:transparent; color:var(--text-muted); }
    .btn--sm { height:32px; padding:0 11px; font-size:13px; }
    .btn--lg { height:44px; padding:0 18px; font-size:16px; }
    .btn[data-disabled] { opacity:.5; cursor:not-allowed; }
    .btn[data-focus] { box-shadow:var(--ring); }

    .ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:20px; }
    .ph h1 { font-size:22px; font-weight:600; letter-spacing:-.01em; }
    .ph p { margin-top:4px; font-size:13px; color:var(--text-muted); max-width:64ch; }
    .ph-actions { display:flex; align-items:center; gap:10px; }

    .seg { display:inline-flex; gap:0; border:1px solid var(--border-control); border-radius:var(--r-edge);
      background:var(--surface); overflow:hidden; }
    .seg button { display:inline-flex; align-items:center; gap:6px; height:32px; padding:0 12px; border:0;
      border-right:1px solid var(--joint); background:transparent; color:var(--text-muted);
      font:600 13px var(--font-sans); cursor:pointer; white-space:nowrap; }
    .seg button:last-child { border-right:0; }
    .seg button[data-on] { background:var(--ink-900); color:#fff; }
    .seg em { font-style:normal; font-weight:600; opacity:.7; }

    /* A panel is a room, not a card: it sits flat on the tile, separated by
       grout, with no shadow. Nothing sits inside a panel that is itself a panel. */
    .panel { background:var(--surface); border:1px solid var(--joint); border-radius:var(--r-panel); overflow:hidden; }
    .panel .panel { border:0; border-radius:0; }
    .panel-hd { display:flex; align-items:center; justify-content:space-between; gap:12px;
      min-height:var(--row); padding:0 20px; border-bottom:1px solid var(--joint); }
    .panel-hd h2 { font-size:16px; font-weight:600; }
    .panel-hd .sub { font-size:13px; color:var(--text-muted); font-weight:400; }
    .sect { padding:16px 20px; border-bottom:1px solid var(--joint); }
    .sect:last-child { border-bottom:0; }
    .sect > h3 { font-size:13px; font-weight:600; margin-bottom:10px; display:flex; align-items:center;
      justify-content:space-between; gap:10px; }

    .pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 9px; border-radius:var(--r-pill);
      font-size:11px; font-weight:600; white-space:nowrap; }
    .pill i { width:6px; height:6px; border-radius:var(--r-pill); background:currentColor; flex:0 0 auto; }
    .pill--danger { color:var(--danger-600); background:var(--danger-50); }
    .pill--warn { color:var(--warning-700); background:var(--warning-50); }
    .pill--ok { color:var(--success-600); background:var(--success-50); }
    .pill--sea { color:var(--spring-800); background:var(--spring-50); }
    .pill--ink { color:var(--ink-800); background:var(--ink-50); }
    .pill--sand { color:var(--marble-700); background:var(--tile-deep); }
    .pill--ai { color:var(--brick-700); background:var(--brick-50); }

    .mono { font-family:var(--font-sans); font-variant-numeric:tabular-nums; font-size:11px; color:var(--text-muted);
      white-space:nowrap; letter-spacing:.01em; }
    .muted { color:var(--text-muted); }
    .price { font-weight:600; color:var(--text-strong); font-variant-numeric:tabular-nums; }
    .av { display:grid; place-items:center; width:26px; height:26px; border-radius:var(--r-pill);
      background:var(--tile-deep); color:var(--marble-700); font-size:11px; font-weight:600; flex:0 0 auto; }

    /* The witness. Every fact carries who verified it and when. A filled square
       is a signed seal; an outlined one is a fact nobody has confirmed. The two
       differ in silhouette, so they still read at 11px. */
    .wit { display:inline-flex; align-items:center; gap:6px; font-size:11px; color:var(--marble-700);
      font-variant-numeric:tabular-nums; white-space:nowrap; }
    .wit::before { content:''; width:9px; height:9px; background:var(--ink-900); flex:0 0 auto;
      animation:wit-seal .24s cubic-bezier(.2,.8,.2,1) both; }
    .wit b { font-weight:600; color:var(--text-strong); }
    .wit--none { color:var(--warning-700); }
    .wit--none::before { background:transparent; border:1.5px solid currentColor; animation:none; }
    @keyframes wit-seal { from { transform:scale(.4); opacity:0; } to { transform:scale(1); opacity:1; } }

    /* ---------- table: rows on grout, 44px tall ---------- */
    .toolbar { display:flex; align-items:center; gap:8px; min-height:var(--row); padding:0 14px;
      border-bottom:1px solid var(--joint); background:var(--surface); }
    .find { display:flex; align-items:center; gap:7px; width:260px; height:32px; padding:0 10px;
      border:1px solid var(--border-control); border-radius:var(--r-edge); background:var(--surface);
      color:var(--text-muted); font-size:13px; }
    table { width:100%; border-collapse:separate; border-spacing:0; }
    th { text-align:left; height:36px; padding:0 12px; border-bottom:1px solid var(--joint); background:var(--tile);
      font-size:11px; font-weight:600; color:var(--text-muted); white-space:nowrap; }
    td { height:var(--row); padding:12px 12px; border-bottom:1px solid var(--joint); font-size:13px; vertical-align:middle; }
    tbody tr:hover td { background:var(--tile); }
    tbody tr:last-child td { border-bottom:0; }
    .t2 { display:grid; gap:1px; min-width:0; }
    .t2 b { font-size:13px; font-weight:600; color:var(--text-strong); overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; }
    .t2 span { font-size:11px; color:var(--text-muted); }
    .foot { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:var(--row);
      padding:0 14px; font-size:13px; color:var(--text-muted); border-top:1px solid var(--joint); }
    .box { width:16px; height:16px; border-radius:var(--r-edge); border:1.5px solid var(--border-control);
      background:var(--surface); flex:0 0 auto; }
    .box[data-on] { background:var(--ink-900); border-color:var(--ink-900);
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23fff' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12 5 5 9-10'/%3E%3C/svg%3E");
      background-size:11px 11px; background-position:center; background-repeat:no-repeat; }

    /* ---------- forms ---------- */
    .fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px 20px; padding:16px 20px; }
    .field { display:grid; gap:6px; min-width:0; }
    .field label { font-size:13px; font-weight:600; color:var(--text-body); }
    .field label em { font-style:normal; color:var(--brick-600); }
    .in { display:flex; align-items:center; height:40px; padding:0 11px; border:1px solid var(--border-control);
      border-radius:var(--r-edge); background:var(--surface); font-size:13px; color:var(--text-strong); }
    .in--empty { color:var(--text-muted); }
    .in--area { height:auto; min-height:80px; align-items:flex-start; padding:10px 11px; line-height:1.5; }
    .in--focus { border-color:var(--spring-700); box-shadow:var(--ring); }
    .in--error { border-color:var(--danger-600); }
    .hint { font-size:11px; color:var(--text-muted); }
    .hint--error { color:var(--danger-600); font-weight:500; }
    .full { grid-column:1 / -1; }
    .toggle { width:40px; height:22px; border-radius:var(--r-pill); background:var(--border-control);
      position:relative; flex:0 0 auto; }
    .toggle i { position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:var(--r-pill);
      background:#fff; }
    .toggle[data-on] { background:var(--ink-900); }
    .toggle[data-on] i { left:21px; }
    .savebar { display:flex; align-items:center; gap:12px; min-height:var(--row); padding:8px 20px;
      border-top:1px solid var(--joint); background:var(--tile); }
    .sw { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px;
      min-height:var(--row); padding:8px 20px; border-top:1px solid var(--joint); }
    .sw b { display:block; font-size:13px; font-weight:600; color:var(--text-strong); }
    .sw span { font-size:11px; color:var(--text-muted); }

    /* ---------- misc ---------- */
    .note { display:flex; align-items:flex-start; gap:8px; padding:10px 12px; border-radius:var(--r-edge);
      font-size:13px; font-weight:500; }
    .note--warn { background:var(--warning-50); color:var(--warning-700); }
    .note--ai { background:var(--brick-50); color:var(--brick-700); }
    .note--info { background:var(--spring-50); color:var(--spring-800); }
    .kv { display:grid; gap:1px; background:var(--joint); border-bottom:1px solid var(--joint); }
    .kv > div { background:var(--surface); padding:12px 20px; min-width:0; }
    .kv dt { font-size:11px; color:var(--text-muted); margin-bottom:3px; }
    .kv dd { margin:0; font-size:13px; font-weight:600; color:var(--text-strong);
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .empty { display:grid; justify-items:center; gap:8px; padding:40px 20px; text-align:center; }
    .empty svg { color:var(--text-ghost); }
    .empty b { font-size:13px; font-weight:600; color:var(--text-strong); }
    .empty p { font-size:13px; color:var(--text-muted); max-width:38ch; }
    .tl-row { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:10px; align-items:start;
      padding:12px 0; border-bottom:1px solid var(--joint); }
    .tl-row:last-child { border-bottom:0; }
    .tl-row p { font-size:13px; }
    .tl-row em { font-style:normal; color:var(--text-muted); }

    .tabs { display:flex; gap:20px; border-bottom:1px solid var(--joint); }
    .tabs a { padding:10px 0 11px; font-size:13px; font-weight:600; color:var(--text-muted);
      border-bottom:2px solid transparent; margin-bottom:-1px; white-space:nowrap; }
    .tabs a:hover { text-decoration:none; color:var(--text-strong); }
    .tabs a[data-on] { color:var(--text-strong); border-bottom-color:var(--ink-900); }
    .crumbs { display:flex; align-items:center; gap:7px; font-size:13px; color:var(--text-muted); margin-bottom:12px; }
    .crumbs b { color:var(--text-strong); }
    .prog { height:6px; border-radius:var(--r-pill); background:var(--tile-shadow); overflow:hidden; }
    .prog i { display:block; height:100%; border-radius:var(--r-pill); background:var(--spring-700); }
    .skel { border-radius:var(--r-edge);
      background:linear-gradient(90deg,var(--tile-deep),var(--tile-shadow),var(--tile-deep)); }

    /* Inline Hermes assist: the same one-click draft on every editable value,
       and the same approval boundary. Brick, because it is the one thing on a
       field that can act. */
    .lblrow { display:flex; align-items:center; gap:8px; }
    .lblrow > label, .lblrow > b { flex:1 1 auto; min-width:0; }
    .assist { display:inline-flex; align-items:center; gap:5px; height:24px; padding:0 8px;
      border-radius:var(--r-pill); border:1px solid var(--brick-300); background:var(--brick-50);
      color:var(--brick-700); font:600 11px var(--font-sans); cursor:pointer; white-space:nowrap; flex:0 0 auto; }
    .assist:hover { background:var(--brick-100); }
    .assist--icon { padding:0; width:24px; justify-content:center; }
    .assist[data-busy] { border-color:var(--border-control); background:var(--tile-deep); color:var(--text-muted); }
    .assist-menu { display:grid; gap:1px; padding:5px; border-radius:var(--r-panel); background:var(--surface);
      border:1px solid var(--joint); box-shadow:var(--e-float); width:230px; }
    .assist-menu button { display:flex; align-items:center; gap:9px; width:100%; height:32px; padding:0 9px;
      border:0; border-radius:var(--r-edge); background:transparent; color:var(--text-body);
      font:500 13px var(--font-sans); cursor:pointer; text-align:left; }
    .assist-menu button:hover { background:var(--tile-deep); }
    .assist-menu hr { border:0; border-top:1px solid var(--joint); margin:4px 0; }
    .assist-menu small { display:block; padding:5px 9px 3px; font-size:11px; color:var(--text-muted); }
    .drafted { border-color:var(--brick-300); background:var(--brick-50); }
    .drafted-bar { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:var(--r-edge);
      background:var(--brick-50); border:1px solid var(--brick-300); font-size:11px; font-weight:600;
      color:var(--brick-700); }

    .kvline { display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:13px; }
    .toast { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:11px; align-items:center;
      padding:12px 14px; border-radius:var(--r-panel); background:var(--ink-900); color:#fff; box-shadow:var(--e-float); }
    .toast b { font-size:13px; font-weight:600; display:block; }
    .toast span { font-size:11px; color:rgba(255,255,255,.7); }
    .toast a { color:#fff; font-size:13px; font-weight:600; text-decoration:underline; }

    /* Public field: deep spring water. One band owns a page's first viewport. */
    .band { background:var(--field); color:var(--field-text); }
    .band a { color:var(--field-text); }
    .band .muted { color:var(--field-muted); }
    .band .btn { background:var(--tile); border-color:var(--tile); color:var(--ink-900); }
    .band .btn--ghost { background:transparent; border-color:var(--field-muted); color:var(--field-text); }
    .display { font-family:var(--font-display); font-weight:800; letter-spacing:-.02em; line-height:1.02; }

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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Commissioner:wght@400;500;600;700&amp;family=Sofia+Sans+Semi+Condensed:wght@600;800&amp;family=Noto+Sans+Hebrew:wght@400;600&amp;display=swap">
  <style>${BASE}${extraCss}
  </style>
</helmet>
<!--
THESIS: Every fact carries its witness. A property portal shows facts; this one shows who verified each fact and when, and refuses the card-and-sidebar dashboard the category ships.
OWN-WORLD: Sandanski's thermal bath house. Glazed tile ground (#F6F5F1), grout-line rules instead of card chrome, three radii (2 / 6 / pill), two elevations (rest on tile, float), one action colour (the logo's brick), deep spring water (#163E3B) as the public field. Commissioner for every word; Sofia Sans Semi Condensed only where the public site speaks up. Figures are tabular, never monospaced.
STORY: A buyer sees the number and the name beside it and trusts it; a broker sees the next task and the seal it is waiting for.
FIRST VIEWPORT: Workspace: pale rail left, one 22px title, one primary action top right, then rows on grout at 44px. Public: a full-width spring band with one sentence, one search, one photograph of the actual place.
FORM: the register of witnessed facts.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Commissioner:wght@400;500;600;700&amp;family=Sofia+Sans+Semi+Condensed:wght@600;800&amp;family=Noto+Sans+Hebrew:wght@400;600&amp;display=swap">
  <style>${BASE}${extraCss}
  </style>
</helmet>
<!--
THESIS: Every fact carries its witness. A property portal shows facts; this one shows who verified each fact and when, and refuses the card-and-sidebar dashboard the category ships.
OWN-WORLD: Sandanski's thermal bath house. Glazed tile ground (#F6F5F1), grout-line rules instead of card chrome, three radii (2 / 6 / pill), two elevations (rest on tile, float), one action colour (the logo's brick), deep spring water (#163E3B) as the public field. Commissioner for every word; Sofia Sans Semi Condensed only where the public site speaks up. Figures are tabular, never monospaced.
STORY: A buyer sees the number and the name beside it and trusts it; a broker sees the next task and the seal it is waiting for.
FIRST VIEWPORT: Workspace: pale rail left, one 22px title, one primary action top right, then rows on grout at 44px. Public: a full-width spring band with one sentence, one search, one photograph of the actual place.
FORM: the register of witnessed facts.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->
<div style="width:${width}px; min-height:${height}px; background:var(--canvas); padding:${pad}px">
${body}
</div>
</x-dc>
</body>
</html>
`;
}
