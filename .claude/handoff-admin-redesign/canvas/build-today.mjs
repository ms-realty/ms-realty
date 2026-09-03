import fs from "node:fs";
import { page, icon } from "./shell.mjs";

const CSS = `
    .today-grid { display:grid; grid-template-columns:minmax(0,1fr) 336px; gap:20px; align-items:start; }
    .queue-bar { display:flex; align-items:center; gap:8px; padding:10px 16px; border-bottom:1px solid var(--border);
      background:var(--sunken); }
    .task { display:grid; grid-template-columns:82px minmax(0,1fr) 132px 92px; align-items:center;
      column-gap:14px; min-height:56px; padding:9px 16px; border-bottom:1px solid var(--border); }
    .task:last-child { border-bottom:0; }
    .task:hover { background:var(--stone-50); }
    .task-kind { display:flex; align-items:center; gap:6px; font-size:11.5px; font-weight:600; color:var(--text-muted); }
    .task-kind i { width:6px; height:6px; border-radius:999px; flex:0 0 auto; }
    .task-main { display:grid; gap:2px; min-width:0; }
    .task-main b { font-size:13.5px; font-weight:600; color:var(--text-strong); }
    .task-meta { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-muted); min-width:0; }
    .task-meta span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .task-when { display:grid; gap:2px; font-size:12px; }
    .task-when b { font-size:12.5px; font-weight:600; }
    .task-act { display:flex; justify-content:flex-end; }
    .rail { display:grid; gap:16px; }
    .rail-row { display:flex; align-items:center; justify-content:space-between; gap:10px;
      padding:9px 16px; border-bottom:1px solid var(--border); font-size:13px; }
    .rail-row:last-child { border-bottom:0; }
    .rail-row:hover { background:var(--stone-50); }
    .rail-row b { font-weight:500; color:var(--text-body); display:flex; align-items:center; gap:9px; }
    .rail-n { font-family:var(--font-display); font-weight:600; font-size:15px; color:var(--text-strong); }
    .conn { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:10px;
      padding:10px 16px; border-bottom:1px solid var(--border); }
    .conn:last-child { border-bottom:0; }
    .conn-name { display:grid; gap:1px; min-width:0; }
    .conn-name b { font-size:12.5px; font-weight:600; color:var(--text-strong); }
    .conn-name em { font-style:normal; font-size:11.5px; color:var(--text-muted); }
    .tl { display:grid; gap:0; }
    .today-row { display:grid; grid-template-columns:auto minmax(0,1fr); gap:10px; padding:9px 16px;
      border-bottom:1px solid var(--border); }
    .today-row:last-child { border-bottom:0; }
    .today-row p { font-size:12.5px; color:var(--text-body); }
    .today-row em { display:block; margin-top:2px; font-style:normal; font-size:11.5px; color:var(--text-muted); }
`;

const dot = (c) => `<i style="background:${c}"></i>`;

function task({ kindColor, kind, title, meta, when, whenNote, whenTone = "var(--text-muted)", action, accent }) {
  return `        <div class="task">
          <span class="task-kind">${dot(kindColor)}${kind}</span>
          <span class="task-main"><b>${title}</b><span class="task-meta">${meta}</span></span>
          <span class="task-when"><b style="color:${whenTone}">${when}</b><span class="muted">${whenNote}</span></span>
          <span class="task-act"><button class="btn btn--sm${accent ? " btn--primary" : ""}" type="button">${action}</button></span>
        </div>`;
}

const BODY = `      <div class="ph">
        <div>
          <h1>Today</h1>
          <p>Tuesday, 1 September · 12 open, 5 of them late.</p>
        </div>
        <div class="ph-actions">
          <div class="seg">
            <button type="button" data-on="1">Mine <em>12</em></button>
            <button type="button">Team <em>31</em></button>
          </div>
          <button class="btn" type="button">${icon("filter", 15)}<span>Filter</span></button>
        </div>
      </div>

      <div class="today-grid">
        <section class="panel">
          <div class="panel-hd">
            <h2>Needs you now</h2>
            <span class="sub">Ordered by reply deadline, then by viewing time.</span>
          </div>
          <div class="queue-bar">
            <div class="seg" style="background:transparent; padding:0">
              <button type="button" data-on="1">All <em>12</em></button>
              <button type="button">Overdue <em>5</em></button>
              <button type="button">Replies <em>4</em></button>
              <button type="button">Viewings <em>2</em></button>
              <button type="button">Requests <em>1</em></button>
            </div>
            <span style="margin-left:auto" class="mono">4 unassigned</span>
          </div>
${task({ kindColor: "var(--danger-500)", kind: "Enquiry", title: "Maria Petrova · listing enquiry",
  meta: `<span class="mono">MS-CRAWL-0001</span><span>·</span><span>2-bed apartment, Sandanski</span><span>·</span><span>WhatsApp · HE → EN</span>`,
  when: "Overdue 2 d", whenNote: "Escalated to manager", whenTone: "var(--danger-600)", action: "Reply", accent: true })}
${task({ kindColor: "var(--danger-500)", kind: "Callback", title: "Ivan Georgiev · callback request",
  meta: `<span>Weekdays after 14:00</span><span>·</span><span>Bulgarian</span><span>·</span><span>+359 ••• 412</span>`,
  when: "Overdue 2 d", whenNote: "Escalated to manager", whenTone: "var(--danger-600)", action: "Call", accent: true })}
${task({ kindColor: "var(--danger-500)", kind: "Valuation", title: "Elena Dimitrova · seller valuation",
  meta: `<span>House, Sandanski</span><span>·</span><span>Source: website form</span>`,
  when: "Overdue 1 d", whenNote: "Unassigned", whenTone: "var(--danger-600)", action: "Assign" })}
${task({ kindColor: "var(--sun-600)", kind: "Viewing", title: "Anna Weber · viewing confirmation",
  meta: `<span class="mono">MS-CRAWL-0114</span><span>·</span><span>Villa, Katuntsi</span><span>·</span><span>with Petar</span>`,
  when: "Today 15:00", whenNote: "Not confirmed", whenTone: "var(--warning-600)", action: "Confirm" })}
${task({ kindColor: "var(--sun-600)", kind: "Request", title: "Language request · French",
  meta: `<span class="mono">/fr/</span><span>·</span><span>3 visitors this week</span><span>·</span><span>Open</span>`,
  when: "Today", whenNote: "Decision due", whenTone: "var(--warning-600)", action: "Decide" })}
${task({ kindColor: "var(--sea-600)", kind: "Follow-up", title: "Georgi Nikolov · post-viewing feedback",
  meta: `<span class="mono">MS-CRAWL-0044</span><span>·</span><span>Viewed 30 Aug</span><span>·</span><span>Renter</span>`,
  when: "Today 17:00", whenNote: "Feedback call", action: "Log" })}
${task({ kindColor: "var(--sea-600)", kind: "Translation", title: "7 listing descriptions await approval",
  meta: `<span>DE 3 · NL 2 · EL 2</span><span>·</span><span>Hermes drafted, human approval required</span>`,
  when: "Today", whenNote: "Blocks indexing", action: "Review" })}
${task({ kindColor: "var(--ink-500)", kind: "Document", title: "Weber · preliminary contract missing",
  meta: `<span>Transaction case CASE-0007</span><span>·</span><span>2 of 6 documents complete</span>`,
  when: "Tomorrow", whenNote: "Notary 8 Sep", action: "Open" })}
${task({ kindColor: "var(--ink-500)", kind: "Enquiry", title: "Dmitri Volkov · price enquiry",
  meta: `<span class="mono">MS-CRAWL-0087</span><span>·</span><span>Studio, Sandanski</span><span>·</span><span>Russian</span>`,
  when: "Tomorrow 10:00", whenNote: "First reply due", action: "Reply" })}
${task({ kindColor: "var(--ink-500)", kind: "Viewing", title: "Petar Kolev · second viewing",
  meta: `<span class="mono">MS-CRAWL-0129</span><span>·</span><span>Plot, Levunovo</span><span>·</span><span>with the owner</span>`,
  when: "Wed 11:00", whenNote: "Confirmed", action: "Open" })}
${task({ kindColor: "var(--ink-500)", kind: "Migration", title: "38 legacy URLs still undecided",
  meta: `<span>makler-realty.ru</span><span>·</span><span>Each needs 200, 301 or 410</span>`,
  when: "This week", whenNote: "Blocks launch gate", action: "Review" })}
${task({ kindColor: "var(--ink-500)", kind: "Consent", title: "Volkov · marketing consent expiring",
  meta: `<span>Expires 14 Sep</span><span>·</span><span>Renew before the next campaign</span>`,
  when: "This week", whenNote: "GDPR", action: "Open" })}
        </section>

        <div class="rail">
          <section class="panel">
            <div class="panel-hd"><h2>Queues</h2><a href="#" style="font-size:12.5px; font-weight:600">Reports</a></div>
            <a class="rail-row" href="#"><b>${icon("inbox", 16)}Lead inbox</b><span class="rail-n">4</span></a>
            <a class="rail-row" href="#"><b>${icon("board", 16)}Open opportunities</b><span class="rail-n">2</span></a>
            <a class="rail-row" href="#"><b>${icon("calendar", 16)}Viewings this week</b><span class="rail-n">6</span></a>
            <a class="rail-row" href="#"><b>${icon("languages", 16)}Translations to approve</b><span class="rail-n">7</span></a>
            <a class="rail-row" href="#"><b>${icon("route", 16)}Legacy URLs undecided</b><span class="rail-n">38</span></a>
          </section>

          <section class="panel">
            <div class="panel-hd">
              <h2>Connections</h2>
              <a href="#" style="font-size:12.5px; font-weight:600">Manage</a>
            </div>
            <div class="conn">
              <span class="av" style="background:var(--success-50); color:var(--success-600)">PG</span>
              <span class="conn-name"><b>Postgres · Payload CMS</b><em>Listings, leads, sessions</em></span>
              <span class="pill pill--ok"><i></i>Live</span>
            </div>
            <div class="conn">
              <span class="av" style="background:var(--warning-50); color:var(--warning-600)">GW</span>
              <span class="conn-name"><b>Google Workspace</b><em>Reply delivery, viewing calendar</em></span>
              <span class="pill pill--warn"><i></i>Reauthorise</span>
            </div>
            <div class="conn">
              <span class="av" style="background:var(--stone-100); color:var(--stone-600)">WA</span>
              <span class="conn-name"><b>WhatsApp Business</b><em>Buyer replies · not connected</em></span>
              <span class="pill pill--sand"><i></i>Set up</span>
            </div>
            <div class="conn">
              <span class="av" style="background:var(--stone-100); color:var(--stone-600)">HE</span>
              <span class="conn-name"><b>Hermes agent</b><em>Drafting off · 2 secrets missing</em></span>
              <span class="pill pill--sand"><i></i>Set up</span>
            </div>
          </section>

          <section class="panel">
            <div class="panel-hd"><h2>Recent activity</h2><a href="#" style="font-size:12.5px; font-weight:600">All</a></div>
            <div class="tl">
              <div class="today-row"><span class="av">MR</span><p>Approved the German description for <span class="mono">MS-CRAWL-0032</span><em>18 minutes ago</em></p></div>
              <div class="today-row"><span class="av">PD</span><p>Sent a reply to Anna Weber<em>1 hour ago · reviewed by Mariya</em></p></div>
              <div class="today-row"><span class="av">MR</span><p>Moved <span class="mono">MS-CRAWL-0087</span> to published<em>3 hours ago</em></p></div>
              <div class="today-row"><span class="av" style="background:var(--brick-50); color:var(--brick-700)">HE</span><p>Drafted 3 translations for review<em>Yesterday · not published</em></p></div>
            </div>
          </section>
        </div>
      </div>`;

fs.writeFileSync(new URL("./Main.dc.html", import.meta.url), page({
  active: "today", body: BODY, extraCss: CSS, height: 980,
}));
console.log("Main.dc.html");
