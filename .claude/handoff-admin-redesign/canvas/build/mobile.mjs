import fs from "node:fs";
import { BASE, FONT_LINKS, icon } from "../shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

const M_CSS = `
    .ph-app { width:390px; min-height:844px; background:var(--canvas); display:flex; flex-direction:column; }
    .ph-bar { display:flex; align-items:center; gap:12px; padding:12px 16px 12px; background:var(--surface);
      border-bottom:1px solid var(--border); }
    .ph-bar h1 { font-family:var(--font-display); font-size:19px; font-weight:600; letter-spacing:-.01em;
      flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .ph-ic { display:grid; place-items:center; width:44px; height:44px; border-radius:var(--r-panel);
      border:1px solid var(--border); background:var(--surface); color:var(--text-body); flex:0 0 auto; }
    .ph-ic--plain { border-color:transparent; }
    .ph-body { flex:1 1 auto; display:grid; gap:12px; padding:12px 16px 16px; align-content:start; }
    .ph-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-panel);
      box-shadow:var(--e-1); padding:12px 16px; display:grid; gap:8px; }
    .ph-card h2 { font-size:13px; font-weight:600; }
    .ph-kv { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
    .ph-kv dt { font-size:11px; color:var(--text-muted); margin-bottom:4px; }
    .ph-kv dd { margin:0; font-size:13px; font-weight:600; color:var(--text-strong); }
    .ph-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px;
      padding:0 16px; border-radius:var(--r-panel); border:1px solid var(--ink-800); background:var(--ink-800); color:#fff;
      font-size:13px; font-weight:600; flex:1 1 auto; }
    .ph-btn--g { background:var(--surface); border-color:var(--border-control); color:var(--text-strong);
      flex:0 0 auto; width:44px; padding:0; }
    .ph-row { display:flex; gap:8px; }
    .ph-msg { padding:12px 12px; border-radius:var(--r-panel); font-size:13px; line-height:1.55; }
    .ph-msg--in { background:var(--tile-deep); color:var(--text-body); border-bottom-left-radius:4px; }
    .ph-msg--draft { background:var(--brick-50); color:var(--text-body); border:1px solid var(--brick-300);
      border-bottom-right-radius:4px; }
    .ph-tabs { margin-top:auto; display:grid; grid-template-columns:repeat(5,1fr); gap:4px;
      padding:8px 8px 20px; background:var(--surface); border-top:1px solid var(--border); }
    .ph-tab { display:grid; justify-items:center; gap:4px; min-height:52px; padding:8px 4px; border-radius:var(--r-panel);
      color:var(--text-muted); font-size:11px; font-weight:600; position:relative; }
    .ph-tab[data-on] { color:var(--marble-900); }
    .ph-tab[data-on] svg { color:var(--brick-600); }
    .ph-tab u { position:absolute; top:4px; right:16px; min-width:16px; height:16px; padding:0 4px;
      border-radius:var(--r-pill); background:var(--brick-600); color:#fff; font-size:11px; font-weight:700;
      line-height:16px; text-align:center; text-decoration:none; }
    .ph-step { display:grid; grid-template-columns:auto minmax(0,1fr); gap:12px; align-items:start;
      padding:12px 0; border-bottom:1px solid var(--border); }
    .ph-step:last-child { border-bottom:0; }
    .ph-step b { font-size:13px; font-weight:600; display:block; }
    .ph-step em { font-style:normal; font-size:11px; color:var(--text-muted); }
`;

const tabs = (on) => `  <nav class="ph-tabs">
    <span class="ph-tab"${on === "today" ? ' data-on="1"' : ""}>${icon("today", 21)}Today</span>
    <span class="ph-tab"${on === "inbox" ? ' data-on="1"' : ""}>${icon("inbox", 21)}<u>4</u>Inbox</span>
    <span class="ph-tab"${on === "pipe" ? ' data-on="1"' : ""}>${icon("board", 21)}Pipeline</span>
    <span class="ph-tab"${on === "cases" ? ' data-on="1"' : ""}>${icon("case", 21)}Cases</span>
    <span class="ph-tab"${on === "more" ? ' data-on="1"' : ""}>${icon("list", 21)}More</span>
  </nav>`;

const wrap = (body) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
${FONT_LINKS}
  <style>${BASE}${M_CSS}
  </style>
</helmet>
${body}
</x-dc>
</body>
</html>
`;

/* ---------------------------------------------------------- Lead on a phone */
const LEAD = `<div class="ph-app">
  <div class="ph-bar">
    <span class="ph-ic ph-ic--plain">${icon("left", 20)}</span>
    <h1>Maria Petrova</h1>
    <span class="ph-ic">${icon("phone", 19)}</span>
  </div>
  <div class="ph-body">
    <div style="display:flex; gap:8px; flex-wrap:wrap">
      <span class="pill pill--danger"><i></i>Overdue 2 d</span>
      <span class="pill pill--sea"><i></i>Buyer</span>
      <span class="pill pill--sand">WhatsApp</span>
      <span class="pill pill--sand">HE → EN</span>
    </div>

    <div class="ph-card">
      <dl class="ph-kv">
        <div><dt>Property</dt><dd class="mono" style="font-size:13px">MS-00815</dd></div>
        <div><dt>Price</dt><dd class="price">€68,000</dd></div>
        <div><dt>Received</dt><dd>4 Jul, 03:00</dd></div>
        <div><dt>Broker</dt><dd class="muted" style="font-weight:500">Not set</dd></div>
      </dl>
    </div>

    <div class="ph-card">
      <h2>Conversation</h2>
      <div class="ph-msg ph-msg--in">Is the two-bedroom apartment in Sandanski still available? Could I see it next week?</div>
      <div class="ph-msg ph-msg--draft">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px">
          <span class="pill pill--ai" style="padding:4px 8px">${icon("sparkles", 11)}Hermes draft</span>
        </div>
        Hello Maria, thank you for your interest in the two-bedroom apartment in Sandanski (MS-00815,
        €68,000). It is still available. I can show it on Thursday at 11:00 or Friday at 15:00 — which suits you?
      </div>
      <div class="ph-row">
        <span class="ph-btn">${icon("send", 17)}Approve and send</span>
        <span class="ph-btn ph-btn--g">${icon("edit", 17)}</span>
      </div>
      <p style="font-size:11px; color:var(--warning-700)">${icon("alert", 12)} WhatsApp is not connected — this will be marked ready to send by hand.</p>
    </div>

    <div class="ph-card">
      <h2>Missing before qualification</h2>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <span class="pill pill--warn"><i></i>Budget</span>
        <span class="pill pill--warn"><i></i>Decision timeline</span>
      </div>
      <span class="ph-btn ph-btn--g" style="width:auto; min-height:44px; padding:0 16px">Add what she told you</span>
    </div>
  </div>
${tabs("inbox")}
</div>`;
fs.writeFileSync(W("MobileLead.dc.html"), wrap(LEAD));

/* ---------------------------------------------------------- Case on a phone */
const CASE = `<div class="ph-app">
  <div class="ph-bar">
    <span class="ph-ic ph-ic--plain">${icon("left", 20)}</span>
    <h1>CASE-0007</h1>
    <span class="ph-ic">${icon("list", 19)}</span>
  </div>
  <div class="ph-body">
    <div class="ph-card">
      <h2>Anna Weber · villa, Katuntsi</h2>
      <p style="font-size:13px; color:var(--text-muted)">Buyer purchase · Bulgaria · notary 8 September, 11:00</p>
      <div style="height:6px; border-radius:var(--r-pill); background:var(--joint); overflow:hidden">
        <i style="display:block; height:100%; width:64%; background:var(--success-500)"></i></div>
      <p style="font-size:13px; color:var(--text-muted)">14 of 22 steps resolved · 1 blocked</p>
    </div>

    <div class="ph-card" style="border-color:var(--danger-600)">
      <div style="display:flex; align-items:center; gap:8px">
        <span class="pill pill--danger"><i></i>Blocked</span>
        <span style="font-size:12px" class="muted">3 days</span>
      </div>
      <b style="font-size:12px">Proof of funds from the buyer's bank</b>
      <p style="font-size:12px; color:var(--text-muted)">Requested 29 August. The preliminary contract cannot be signed without it.</p>
      <div class="ph-row">
        <span class="ph-btn">Chase the bank</span>
        <span class="ph-btn ph-btn--g">${icon("mail", 17)}</span>
      </div>
    </div>

    <div class="ph-card">
      <h2>Next up</h2>
      <div class="ph-step">
        <span class="av" style="background:var(--warning-50); color:var(--warning-700)">${icon("clock", 13)}</span>
        <span><b>Preliminary contract signed</b><em>Buyer signed · waiting on the seller</em></span>
      </div>
      <div class="ph-step">
        <span class="av">${icon("file", 13)}</span>
        <span><b>Local acquisition tax calculated</b><em>Sandanski rate · before 8 September</em></span>
      </div>
      <div class="ph-step">
        <span class="av">${icon("sign", 13)}</span>
        <span><b>Notarial deed executed</b><em>Notary Ivanova · 8 September</em></span>
      </div>
    </div>

    <div class="ph-card">
      <h2>Conditions</h2>
      <div class="ph-step">
        <span class="av" style="background:var(--warning-50); color:var(--warning-700)">${icon("alert", 13)}</span>
        <span><b>Subject to mortgage approval</b><em>Deadline 5 September</em></span>
      </div>
      <div class="ph-row"><span class="ph-btn ph-btn--g" style="width:auto; flex:1 1 auto">Met</span>
        <span class="ph-btn ph-btn--g" style="width:auto; flex:1 1 auto">Waived</span>
        <span class="ph-btn ph-btn--g" style="width:auto; flex:1 1 auto">Blocked…</span></div>
    </div>
  </div>
${tabs("cases")}
</div>`;
fs.writeFileSync(W("MobileCase.dc.html"), wrap(CASE));

console.log("MobileLead, MobileCase");
