import fs from "node:fs";
import { FONT_LINKS, HELMET_BASE, icon } from "./shell.mjs";

const CSS = `
    .ph-app { width:390px; min-height:844px; background:var(--canvas); display:flex; flex-direction:column; }
    .ph-top { display:flex; align-items:center; gap:10px; padding:14px 16px 10px; }
    .ph-top h1 { font-family:var(--font-display); font-size:22px; font-weight:600; letter-spacing:-.015em; }
    .ph-top p { font-size:12.5px; color:var(--text-muted); margin-top:2px; }
    .ph-icon { display:grid; place-items:center; width:44px; height:44px; border-radius:12px;
      border:1px solid var(--border); background:var(--surface); color:var(--text-body); flex:0 0 auto; }
    .ph-av { display:grid; place-items:center; width:44px; height:44px; border-radius:999px;
      background:var(--ink-800); color:#fff; font-size:13px; font-weight:600; flex:0 0 auto; }
    .ph-chips { display:flex; gap:7px; padding:6px 16px 12px; overflow:hidden; }
    .ph-chip { display:inline-flex; align-items:center; gap:6px; height:36px; padding:0 13px; border-radius:999px;
      border:1px solid var(--border); background:var(--surface); font-size:12.5px; font-weight:600;
      color:var(--text-muted); white-space:nowrap; }
    .ph-chip[data-on] { background:var(--ink-800); border-color:var(--ink-800); color:#fff; }
    .ph-chip em { font-style:normal; opacity:.7; }
    .ph-list { display:grid; gap:9px; padding:0 16px 16px; }
    .ph-card { background:var(--surface); border:1px solid var(--border); border-radius:14px;
      box-shadow:var(--e-1); padding:12px 14px; display:grid; gap:9px; }
    .ph-card-top { display:flex; align-items:center; gap:8px; }
    .ph-card-top b { flex:1 1 auto; min-width:0; font-size:14px; font-weight:600; color:var(--text-strong);
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .ph-card p { font-size:12.5px; color:var(--text-muted); }
    .ph-card-foot { display:flex; align-items:center; gap:8px; }
    .ph-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:44px;
      padding:0 16px; border-radius:10px; border:1px solid var(--ink-800); background:var(--ink-800); color:#fff;
      font-size:13px; font-weight:600; flex:1 1 auto; }
    .ph-btn--ghost { background:var(--surface); border-color:var(--border-control); color:var(--text-strong); flex:0 0 auto; width:44px; padding:0; }
    .ph-tabs { margin-top:auto; display:grid; grid-template-columns:repeat(5, 1fr); gap:2px;
      padding:8px 8px 20px; background:var(--surface); border-top:1px solid var(--border); }
    .ph-tab { display:grid; justify-items:center; gap:4px; min-height:52px; padding:7px 2px; border-radius:12px;
      color:var(--text-muted); font-size:10.5px; font-weight:600; position:relative; }
    .ph-tab[data-on] { color:var(--ink-900); }
    .ph-tab[data-on] svg { color:var(--brick-600); }
    .ph-tab u { position:absolute; top:4px; right:16px; min-width:16px; height:16px; padding:0 4px; border-radius:999px;
      background:var(--brick-600); color:#fff; font-size:9.5px; font-weight:700; line-height:16px; text-align:center;
      text-decoration:none; }
`;

const HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
${FONT_LINKS}
  <style>${HELMET_BASE}${CSS}
  </style>
</helmet>
<div class="ph-app">
  <div class="ph-top">
    <div style="flex:1 1 auto; min-width:0">
      <h1>Today</h1>
      <p>5 overdue · 2 viewings</p>
    </div>
    <span class="ph-icon">${icon("search", 20)}</span>
    <span class="ph-av">MR</span>
  </div>

  <div class="ph-chips">
    <span class="ph-chip" data-on="1">All <em>12</em></span>
    <span class="ph-chip">Overdue <em>5</em></span>
    <span class="ph-chip">Replies <em>4</em></span>
    <span class="ph-chip">Viewings <em>2</em></span>
  </div>

  <div class="ph-list">
    <article class="ph-card">
      <div class="ph-card-top">
        <b>Maria Petrova</b>
        <span class="pill pill--danger"><i></i>Overdue 2 d</span>
      </div>
      <p>Listing enquiry · <span class="mono">MS-CRAWL-0001</span><br>2-bed apartment, Sandanski · WhatsApp · HE → EN</p>
      <div class="ph-card-foot">
        <span class="ph-btn">${icon("send", 17)}Reply</span>
        <span class="ph-btn ph-btn--ghost">${icon("phone", 17)}</span>
        <span class="ph-btn ph-btn--ghost">${icon("clock", 17)}</span>
      </div>
    </article>

    <article class="ph-card">
      <div class="ph-card-top">
        <b>Ivan Georgiev</b>
        <span class="pill pill--danger"><i></i>Overdue 2 d</span>
      </div>
      <p>Callback · weekdays after 14:00 · Bulgarian</p>
      <div class="ph-card-foot">
        <span class="ph-btn">${icon("phone", 17)}Call</span>
        <span class="ph-btn ph-btn--ghost">${icon("clock", 17)}</span>
      </div>
    </article>

    <article class="ph-card">
      <div class="ph-card-top">
        <b>Anna Weber</b>
        <span class="pill pill--warn"><i></i>Today 15:00</span>
      </div>
      <p>Viewing · <span class="mono">MS-CRAWL-0114</span> · Villa, Katuntsi<br>Not confirmed yet</p>
      <div class="ph-card-foot">
        <span class="ph-btn">${icon("check", 17)}Confirm</span>
        <span class="ph-btn ph-btn--ghost">${icon("calendar", 17)}</span>
      </div>
    </article>

    <article class="ph-card">
      <div class="ph-card-top">
        <b>7 translations to approve</b>
        <span class="pill pill--sand">DE 3 · NL 2 · EL 2</span>
      </div>
      <p>Hermes drafted them. Nothing is indexed until a person approves.</p>
      <div class="ph-card-foot">
        <span class="ph-btn">Review</span>
      </div>
    </article>
  </div>

  <nav class="ph-tabs">
    <span class="ph-tab" data-on="1">${icon("today", 21)}Today</span>
    <span class="ph-tab">${icon("inbox", 21)}<u>4</u>Inbox</span>
    <span class="ph-tab">${icon("board", 21)}Pipeline</span>
    <span class="ph-tab">${icon("building", 21)}Listings</span>
    <span class="ph-tab">${icon("list", 21)}More</span>
  </nav>
</div>
</x-dc>
</body>
</html>
`;

fs.writeFileSync(new URL("./Mobile.dc.html", import.meta.url), HTML);
console.log("Mobile.dc.html");
