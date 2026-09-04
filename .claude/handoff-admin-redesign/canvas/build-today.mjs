import fs from "node:fs";
import { page, icon } from "./shell.mjs";

// Today: the title, the single most urgent action, then the ordered queue.
// The queue is read from the task derivation and only decorated here, so
// every row keeps the words the product already uses for its kind.
const CSS = `
    /* The most urgent item sits alone under the title: its heading, its facts,
       its witness and the one brick action on the screen. */
    .now { display:grid; grid-template-columns:96px minmax(0,1fr) auto auto auto; align-items:center;
      column-gap:16px; padding:12px 20px; }
    .now h2 { font-size:16px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .now-meta { display:flex; align-items:center; gap:8px; margin-top:4px; font-size:13px; color:var(--text-muted);
      white-space:nowrap; overflow:hidden; }
    .now-meta span { overflow:hidden; text-overflow:ellipsis; }

    /* The queue: one task per row, one line of identity, 44px on grout. */
    .queue-bar { display:flex; align-items:center; gap:8px; min-height:var(--row); padding:0 20px;
      border-bottom:1px solid var(--joint); }
    .task { display:grid; grid-template-columns:96px minmax(0,1fr) 164px 108px 84px; align-items:center;
      column-gap:16px; min-height:var(--row); padding:0 20px; border-bottom:1px solid var(--joint); }
    .task:last-child { border-bottom:0; }
    .task:hover { background:var(--tile); }
    .kind { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color:var(--text-muted);
      white-space:nowrap; }
    .kind i { width:6px; height:6px; border-radius:var(--r-pill); flex:0 0 auto; }
    .task-main { display:flex; align-items:baseline; gap:8px; min-width:0; overflow:hidden; white-space:nowrap; }
    .task-main b { font-weight:600; color:var(--text-strong); flex:0 0 auto; }
    .task-main em { font-style:normal; color:var(--text-muted); min-width:0; overflow:hidden; text-overflow:ellipsis; }
    .task-wit { font-size:11px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .when { font-size:13px; font-weight:600; color:var(--text-strong); white-space:nowrap; }
    .when--late { color:var(--danger-600); }
    .when--soon { color:var(--warning-700); }
    .task-act { display:flex; justify-content:flex-end; }

    /* What else is open: three flat panels of rows below the queue. */
    .aside { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px; margin-top:20px; align-items:start; }
    .qrow { display:flex; align-items:center; gap:12px; min-height:var(--row); padding:0 20px;
      border-bottom:1px solid var(--joint); font-size:13px; color:var(--text-body); }
    .qrow:last-child { border-bottom:0; }
    .qrow:hover { background:var(--tile); text-decoration:none; }
    .qrow svg { color:var(--text-muted); flex:0 0 auto; }
    .qrow span { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .qrow b { font-weight:600; color:var(--text-strong); }
    .conn { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px;
      min-height:var(--row); padding:8px 20px; border-bottom:1px solid var(--joint); }
    .conn:last-child { border-bottom:0; }
    .act { display:grid; grid-template-columns:auto minmax(0,1fr); gap:12px; align-items:start;
      min-height:var(--row); padding:8px 20px; border-bottom:1px solid var(--joint); }
    .act:last-child { border-bottom:0; }
    .act p { font-size:13px; }
    .act em { display:block; font-style:normal; font-size:11px; color:var(--text-muted); }
`;

const dot = (c) => `<i style="background:${c}"></i>`;
// The witness is what the task is waiting for: an outlined square while a
// named human still has to act, a filled one once it is sealed. A note that
// names no decision stays plain text.
const waits = (t) => `<span class="wit wit--none">${t}</span>`;
const sealed = (t) => `<span class="wit">${t}</span>`;
const plain = (t) => `<span class="task-wit">${t}</span>`;

function task({ tone, kind, title, meta, wit, when, whenTone = "", action }) {
  return `        <div class="task">
          <span class="kind">${dot(tone)}${kind}</span>
          <span class="task-main"><b>${title}</b><em>${meta}</em></span>
          ${wit}
          <span class="when${whenTone ? ` when--${whenTone}` : ""}">${when}</span>
          <span class="task-act"><button class="btn btn--sm" type="button">${action}</button></span>
        </div>`;
}

const LATE = "var(--danger-500)", SOON = "var(--warning-700)", NEXT = "var(--spring-700)", LATER = "var(--ink-500)";

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
          <button class="btn" type="button">${icon("filter", 16)}<span>Filter</span></button>
        </div>
      </div>

      <section class="panel">
        <div class="now">
          <span class="kind">${dot(LATE)}Enquiry</span>
          <span style="min-width:0">
            <h2>Maria Petrova · listing enquiry</h2>
            <span class="now-meta"><span>MS-00815</span><span>·</span><span>2-bed apartment, Sandanski</span><span>·</span><span>WhatsApp</span><span>·</span><span>HE → EN</span></span>
          </span>
          ${waits("Escalated to manager")}
          <span class="when when--late">Overdue 2 d</span>
          <button class="btn btn--accent" type="button">Reply</button>
        </div>
      </section>

      <section class="panel" style="margin-top:20px">
        <div class="panel-hd">
          <h2>Needs you now</h2>
          <span class="sub">Ordered by reply deadline, then by viewing time.</span>
        </div>
        <div class="queue-bar">
          <div class="seg">
            <button type="button" data-on="1">All <em>12</em></button>
            <button type="button">Overdue <em>5</em></button>
            <button type="button">Replies <em>4</em></button>
            <button type="button">Viewings <em>2</em></button>
            <button type="button">Requests <em>1</em></button>
          </div>
          <span style="margin-left:auto" class="mono">4 unassigned</span>
        </div>
${task({ tone: LATE, kind: "Callback", title: "Ivan Georgiev · callback request",
  meta: "Weekdays after 14:00 · Bulgarian · +359 ••• 412",
  wit: waits("Escalated to manager"), when: "Overdue 2 d", whenTone: "late", action: "Call" })}
${task({ tone: LATE, kind: "Valuation", title: "Elena Dimitrova · seller valuation",
  meta: "House, Sandanski · Source: website form",
  wit: waits("Unassigned"), when: "Overdue 1 d", whenTone: "late", action: "Assign…" })}
${task({ tone: SOON, kind: "Viewing", title: "Anna Weber · viewing confirmation",
  meta: "MS-00191 · Villa, Katuntsi · with Petar",
  wit: waits("Not confirmed"), when: "Today 15:00", whenTone: "soon", action: "Confirm" })}
${task({ tone: SOON, kind: "Request", title: "Language request · French",
  meta: "/fr/ · 3 visitors this week · Open",
  wit: waits("Decision due"), when: "Today", whenTone: "soon", action: "Decide" })}
${task({ tone: NEXT, kind: "Follow-up", title: "Georgi Nikolov · post-viewing feedback",
  meta: "MS-00345 · Viewed 30 Aug · Renter",
  wit: plain("Feedback call"), when: "Today 17:00", action: "Log" })}
${task({ tone: NEXT, kind: "Translation", title: "7 listing descriptions await approval",
  meta: "DE 3 · NL 2 · EL 2 · Hermes drafted, human approval required",
  wit: plain("Blocks indexing"), when: "Today", action: "Review" })}
${task({ tone: LATER, kind: "Document", title: "Weber · preliminary contract missing",
  meta: "Transaction case CASE-0007 · 2 of 6 documents complete",
  wit: plain("Notary 8 Sep"), when: "Tomorrow", action: "Open" })}
${task({ tone: LATER, kind: "Enquiry", title: "Dmitri Volkov · price enquiry",
  meta: "MS-00791 · Studio, Sandanski · Russian",
  wit: waits("First reply due"), when: "Tomorrow 10:00", action: "Reply" })}
${task({ tone: LATER, kind: "Viewing", title: "Petar Kolev · second viewing",
  meta: "MS-00872 · Plot, Levunovo · with the owner",
  wit: sealed("Confirmed"), when: "Wed 11:00", action: "Open" })}
${task({ tone: LATER, kind: "Migration", title: "38 legacy URLs still undecided",
  meta: "makler-realty.ru · Each needs 200, 301 or 410",
  wit: plain("Blocks launch gate"), when: "This week", action: "Review" })}
${task({ tone: LATER, kind: "Consent", title: "Volkov · marketing consent expiring",
  meta: "Expires 14 Sep · Renew before the next campaign",
  wit: plain("GDPR"), when: "This week", action: "Open" })}
      </section>

      <div class="aside">
        <section class="panel">
          <div class="panel-hd"><h2>Queues</h2><a href="#" style="font-weight:600">Reports</a></div>
          <a class="qrow" href="#">${icon("inbox", 18)}<span>Lead inbox</span><b>4</b></a>
          <a class="qrow" href="#">${icon("board", 18)}<span>Open opportunities</span><b>2</b></a>
          <a class="qrow" href="#">${icon("calendar", 18)}<span>Viewings this week</span><b>6</b></a>
          <a class="qrow" href="#">${icon("languages", 18)}<span>Translations to approve</span><b>7</b></a>
          <a class="qrow" href="#">${icon("route", 18)}<span>Legacy URLs undecided</span><b>38</b></a>
        </section>

        <section class="panel">
          <div class="panel-hd"><h2>Connections</h2><a href="#" style="font-weight:600">Manage</a></div>
          <div class="conn">
            <span class="av" style="background:var(--success-50); color:var(--success-600)">PG</span>
            <span class="t2"><b>Postgres · Payload CMS</b><span>Listings, leads, sessions</span></span>
            <span class="pill pill--ok"><i></i>Live</span>
          </div>
          <div class="conn">
            <span class="av" style="background:var(--warning-50); color:var(--warning-700)">GW</span>
            <span class="t2"><b>Google Workspace</b><span>Reply delivery, viewing calendar</span></span>
            <span class="pill pill--warn"><i></i>Reauthorise</span>
          </div>
          <div class="conn">
            <span class="av">WA</span>
            <span class="t2"><b>WhatsApp Business</b><span>Buyer replies · not connected</span></span>
            <span class="pill pill--sand"><i></i>Set up</span>
          </div>
          <div class="conn">
            <span class="av">HE</span>
            <span class="t2"><b>Hermes agent</b><span>Drafting off · 2 secrets missing</span></span>
            <span class="pill pill--sand"><i></i>Set up</span>
          </div>
        </section>

        <section class="panel">
          <div class="panel-hd"><h2>Recent activity</h2><a href="#" style="font-weight:600">All</a></div>
          <div class="act"><span class="av">MR</span><p>Approved the German description for MS-00932<em>18 minutes ago</em></p></div>
          <div class="act"><span class="av">PD</span><p>Sent a reply to Anna Weber<em>1 hour ago · reviewed by Mariya</em></p></div>
          <div class="act"><span class="av">MR</span><p>Moved MS-00791 to published<em>3 hours ago</em></p></div>
          <div class="act"><span class="av" style="background:var(--brick-50); color:var(--brick-700)">HE</span><p>Drafted 3 translations for review<em>Yesterday · not published</em></p></div>
        </section>
      </div>`;

fs.writeFileSync(new URL("./Main.dc.html", import.meta.url), page({
  active: "today", body: BODY, extraCss: CSS, height: 980,
}));
console.log("Main.dc.html");
