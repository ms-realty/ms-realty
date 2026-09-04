import fs from "node:fs";
import { FONT_LINKS, HELMET_BASE, icon } from "./shell.mjs";

// Today on a phone. The same world as the desktop Today: tile ground, grout
// rules, 44px rows, one brick action. No status bar, keyboard or bezel is
// drawn; the frame starts at the app's own header. The broker sees the next
// task and the seal it is waiting for, then the queue behind it.
const CSS = `
    .ph-app { width:390px; min-height:844px; background:var(--canvas); display:flex; flex-direction:column; }
    .ph-hd { display:flex; align-items:center; gap:8px; min-height:var(--row); padding:12px 16px 0; }
    .ph-hd h1 { flex:1 1 auto; min-width:0; font-size:22px; font-weight:600; letter-spacing:-.01em;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .ph-sub { padding:4px 16px 12px; font-size:13px; color:var(--text-muted); }
    .ph-ic { display:grid; place-items:center; width:44px; height:44px; border-radius:var(--r-edge);
      border:1px solid var(--border-control); background:var(--surface); color:var(--text-strong); flex:0 0 auto; }
    .ph-ic--ghost { border-color:transparent; background:transparent; color:var(--text-muted); }
    .ph-av { display:grid; place-items:center; width:44px; height:44px; border-radius:var(--r-pill);
      background:var(--ink-900); color:#fff; font-size:13px; font-weight:600; flex:0 0 auto; }
    .ph-body { flex:1 1 auto; display:grid; gap:16px; padding:0 16px 16px; align-content:start; }
    .ph-app .seg { display:flex; }
    .ph-app .seg button { height:44px; flex:1 1 auto; justify-content:center; padding:0 8px; }
    .ph-app .btn--lg { width:100%; justify-content:center; }
    .ph-next { display:grid; gap:8px; }
    .ph-next > b { font-size:16px; font-weight:600; color:var(--text-strong); }
    .ph-next > p { font-size:13px; color:var(--text-muted); }
    /* A queue row: one line of identity, when it is due, and who holds it. */
    .ph-row { display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:12px;
      min-height:var(--row); padding:0 12px; border-bottom:1px solid var(--joint); color:var(--text-body); }
    .ph-row:last-child { border-bottom:0; }
    .ph-row:hover { background:var(--tile); color:var(--text-body); text-decoration:none; }
    .ph-row > b { font-size:13px; font-weight:600; color:var(--text-strong); overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; }
    .ph-row > b em { font-style:normal; font-weight:400; color:var(--text-muted); }
    .ph-row .when { font-size:11px; font-weight:600; color:var(--text-muted); white-space:nowrap; }
    .ph-row .when--late { color:var(--danger-600); }
    .ph-row .when--today { color:var(--warning-700); }
    .ph-note { margin:0; padding:12px 16px; border-top:1px solid var(--joint); font-size:11px; color:var(--text-muted); }
    .ph-tabs { margin-top:auto; display:grid; grid-template-columns:repeat(5,1fr); background:var(--surface);
      border-top:1px solid var(--joint); }
    .ph-tab { position:relative; display:grid; justify-items:center; align-content:center; gap:4px;
      min-height:56px; padding:8px 4px 12px; margin-top:-1px; border-top:2px solid transparent;
      color:var(--text-muted); font-size:11px; font-weight:600; }
    .ph-tab:hover { color:var(--text-strong); text-decoration:none; }
    .ph-tab[data-on] { color:var(--text-strong); border-top-color:var(--ink-900); }
    .ph-tab .sb-badge { position:absolute; top:4px; left:calc(50% + 4px); }
`;

const tabs = (on) => `  <nav class="ph-tabs">
    <a class="ph-tab" href="#"${on === "today" ? ' data-on="1"' : ""}>${icon("today", 20)}Today</a>
    <a class="ph-tab" href="#"${on === "inbox" ? ' data-on="1"' : ""}>${icon("inbox", 20)}<span class="sb-badge">4</span>Inbox</a>
    <a class="ph-tab" href="#"${on === "pipe" ? ' data-on="1"' : ""}>${icon("board", 20)}Pipeline</a>
    <a class="ph-tab" href="#"${on === "listings" ? ' data-on="1"' : ""}>${icon("building", 20)}Listings</a>
    <a class="ph-tab" href="#"${on === "more" ? ' data-on="1"' : ""}>${icon("list", 20)}More</a>
  </nav>`;

// [title, detail, when, tone, holder]. The holder is the collapsed witness:
// initials when a person holds the task, the outlined seal when nobody does.
const QUEUE = [
  ["Ivan Georgiev", "callback", "Overdue 2 d", "late", "MR"],
  ["Elena Dimitrova", "valuation", "Overdue 1 d", "late", ""],
  ["Anna Weber", "viewing", "Today 15:00", "today", "PD"],
  ["French language request", "", "Today", "today", "MR"],
  ["Georgi Nikolov", "follow-up", "Today 17:00", "today", "PD"],
  ["7 translations to approve", "", "Today", "today", "MR"],
  ["Weber", "preliminary contract", "Tomorrow", "", "MR"],
  ["Dmitri Volkov", "price enquiry", "Tomorrow 10:00", "", "PD"],
  ["Petar Kolev", "second viewing", "Wed 11:00", "", "MR"],
  ["38 legacy URLs undecided", "", "This week", "", ""],
  ["Volkov", "consent expiring", "This week", "", ""],
];
const row = ([title, detail, when, tone, holder]) => `      <a class="ph-row" href="#">
        <b>${title}${detail ? ` <em>· ${detail}</em>` : ""}</b>
        <span class="when${tone ? ` when--${tone}` : ""}">${when}</span>
        ${holder ? `<span class="wit"><b>${holder}</b></span>` : `<span class="wit wit--none">Unassigned</span>`}
      </a>`;

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
  <div class="ph-hd">
    <h1>Today</h1>
    <button class="ph-ic ph-ic--ghost" type="button">${icon("search", 20)}</button>
    <button class="ph-av" type="button">MR</button>
  </div>
  <p class="ph-sub">Tuesday, 1 September · 12 open, 5 of them late.</p>

  <div class="ph-body">
    <section class="panel">
      <div class="panel-hd"><h2>Next</h2><span class="pill pill--danger"><i></i>Overdue 2 d</span></div>
      <div class="sect ph-next">
        <b>Maria Petrova · listing enquiry</b>
        <p><span class="mono">MS-00815</span> · 2-bed apartment, Sandanski · WhatsApp · HE → EN</p>
        <span class="wit wit--none">Unassigned · no reply yet · escalated to the manager</span>
      </div>
      <div class="sect">
        <button class="btn btn--accent btn--lg" type="button">${icon("send", 18)}<span>Reply to Maria Petrova</span></button>
      </div>
    </section>

    <div class="seg">
      <button type="button" data-on="1">All <em>12</em></button>
      <button type="button">Overdue <em>5</em></button>
      <button type="button">Replies <em>4</em></button>
      <button type="button">Viewings <em>2</em></button>
    </div>

    <section class="panel">
${QUEUE.map(row).join("\n")}
      <p class="ph-note">Hermes drafted the translations. Nothing is indexed until a person approves.</p>
      <div class="foot"><span>12 open · 4 unassigned</span><a href="#" style="font-weight:600">All tasks</a></div>
    </section>
  </div>
${tabs("today")}
</div>
</x-dc>
</body>
</html>
`;

fs.writeFileSync(new URL("./Mobile.dc.html", import.meta.url), HTML);
console.log("Mobile.dc.html");
