import fs from "node:fs";
import { page, icon, subnav } from "../shell.mjs";

const W = (n) => new URL(`../${n}`, import.meta.url);

/* ---------------------------------------------------------------- Viewings */
const VIEW_CSS = `
    .wk { display:grid; grid-template-columns:64px repeat(7,minmax(0,1fr)); border-top:1px solid var(--border); }
    .wk-hd { padding:8px 8px; border-bottom:1px solid var(--border); border-right:1px solid var(--border);
      background:var(--tile); font-size:11px; font-weight:600; color:var(--text-muted); text-align:center; }
    .wk-hd b { display:block; font-family:var(--font-display); font-size:16px; color:var(--text-strong); }
    .wk-hd[data-today] { background:var(--spring-50); color:var(--spring-800); }
    .wk-t { border-right:1px solid var(--border); border-bottom:1px solid var(--border); padding:4px 4px;
      font:500 11px var(--font-mono); color:var(--text-muted); text-align:right; }
    .wk-c { border-right:1px solid var(--border); border-bottom:1px solid var(--border); min-height:52px; padding:4px; }
    .ev { display:grid; gap:4px; padding:4px 8px; border-radius:var(--r-sm); font-size:11px; margin-bottom:4px;
      border-left:3px solid; }
    .ev b { font-weight:600; font-size:11px; }
    .ev--ok { background:var(--success-50); border-color:var(--success-500); color:var(--success-600); }
    .ev--warn { background:var(--warning-50); border-color:var(--warning-700); color:var(--warning-700); }
    .ev--sea { background:var(--spring-50); border-color:var(--spring-700); color:var(--spring-800); }
    .ev--busy { background:var(--tile-deep); border-color:var(--marble-400); color:var(--marble-700); }
    .side { display:grid; gap:16px; }
`;

const VIEW_BODY = `      <div class="ph">
        <div><h1>Viewings</h1><p>Week of 31 August · 6 booked, 1 still unconfirmed, 2 awaiting feedback.</p></div>
        <div class="ph-actions">
          <div class="seg"><button type="button" data-on="1">Week</button><button type="button">Day</button><button type="button">List</button></div>
          <button class="btn" type="button">${icon("download", 15)}<span>Subscribe (.ics)</span></button>
          <button class="btn btn--primary" type="button">${icon("plus", 15)}<span>Book a viewing</span></button>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:minmax(0,1fr) 316px; gap:20px; align-items:start">
        <section class="panel">
          <div class="toolbar">
            <button class="btn btn--sm" type="button">${icon("left", 13)}</button>
            <button class="btn btn--sm" type="button">${icon("chevron", 13)}</button>
            <b style="font-size:13px">31 Aug – 6 Sep</b>
            <button class="btn btn--sm" type="button">Today</button>
            <span class="find" style="width:200px; margin-left:auto">${icon("search", 14)}Broker or property</span>
            <button class="btn btn--sm" type="button">All brokers ${icon("down", 13)}</button>
          </div>
          <div class="wk">
            <div class="wk-hd"></div>
            ${["Mon 31","Tue 1","Wed 2","Thu 3","Fri 4","Sat 5","Sun 6"].map((d, i) => {
              const [a, b] = d.split(" ");
              return `<div class="wk-hd"${i === 1 ? ' data-today="1"' : ""}>${a}<b>${b}</b></div>`;
            }).join("")}
            ${["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"].map((t) => {
              const cells = [0,1,2,3,4,5,6].map((d) => {
                if (t === "11:00" && d === 2) return `<div class="wk-c"><div class="ev ev--ok"><b>Petar Kolev</b>Plot · Levunovo · MR</div></div>`;
                if (t === "15:00" && d === 1) return `<div class="wk-c"><div class="ev ev--warn"><b>Anna Weber</b>Villa · Katuntsi · not confirmed</div></div>`;
                if (t === "10:00" && d === 3) return `<div class="wk-c"><div class="ev ev--sea"><b>Sofia Marinova</b>2-bed · Melnik · PD</div></div>`;
                if (t === "16:00" && d === 4) return `<div class="wk-c"><div class="ev ev--sea"><b>Dmitri Volkov</b>Studio · Sandanski · PD</div></div>`;
                if (t === "12:00" && d === 5) return `<div class="wk-c"><div class="ev ev--busy"><b>Not available</b>Mariya · notary appointment</div></div>`;
                if (t === "14:00" && d === 5) return `<div class="wk-c"><div class="ev ev--ok"><b>Georgi Nikolov</b>1-bed · centre · PD</div></div>`;
                return `<div class="wk-c"></div>`;
              }).join("");
              return `<div class="wk-t">${t}</div>${cells}`;
            }).join("")}
          </div>
        </section>
        <div class="side">
          <section class="panel">
            <div class="panel-hd"><h2>Needs a decision</h2></div>
            <div class="sect">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px">
                <b style="font-size:12px">Anna Weber · today 15:00</b><span class="pill pill--warn"><i></i>Unconfirmed</span>
              </div>
              <p style="font-size:12px; color:var(--text-muted)">Villa, Katuntsi · <span class="mono">MS-00191</span> · with Petar</p>
              <div style="display:flex; gap:8px; margin-top:12px">
                <button class="btn btn--sm btn--primary" type="button">Confirm</button>
                <button class="btn btn--sm" type="button">Propose another time</button>
              </div>
            </div>
            <div class="sect">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px">
                <b style="font-size:12px">Georgi Nikolov · viewed 30 Aug</b><span class="pill pill--sea"><i></i>Feedback due</span>
              </div>
              <p style="font-size:12px; color:var(--text-muted)">A follow-up call was promised within three days.</p>
              <div style="display:flex; gap:8px; margin-top:12px">
                <button class="btn btn--sm btn--primary" type="button">Log the outcome</button>
                <button class="btn btn--sm" type="button">${icon("phone", 13)}</button>
              </div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Availability</h2><a href="#" style="font-size:13px; font-weight:600">Edit</a></div>
            <div class="sect" style="display:grid; gap:8px">
              <div style="display:flex; justify-content:space-between; font-size:13px"><span>Mariya Ruseva</span><span class="muted">Mon–Fri 09:00–18:00</span></div>
              <div style="display:flex; justify-content:space-between; font-size:13px"><span>Petar Dimitrov</span><span class="muted">Mon–Sat 10:00–19:00</span></div>
              <div class="note note--info">${icon("calendar", 14)}<span>Free slots are offered to buyers from these hours and from the Google calendar, once it is reauthorised.</span></div>
            </div>
          </section>
        </div>
      </div>`;

fs.writeFileSync(W("Viewings.dc.html"), page({ active: "viewings", body: VIEW_BODY, extraCss: VIEW_CSS, height: 980 }));

/* ------------------------------------------------------------------- Tasks */
const TASK_CSS = `
    .tk { display:grid; grid-template-columns:auto minmax(0,1fr) 168px 120px 96px; align-items:center;
      gap:16px; padding:12px 16px; border-bottom:1px solid var(--border); }
    .tk:last-child { border-bottom:0; }
    .tk:hover { background:var(--tile); }
    .tk-main { display:grid; gap:4px; min-width:0; }
    .tk-main b { font-size:13px; font-weight:600; color:var(--text-strong); }
    .tk-meta { display:flex; gap:8px; font-size:13px; color:var(--text-muted); min-width:0; }
    .tk-meta span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .day { padding:8px 16px; background:var(--sunken); font-size:11px; font-weight:600; color:var(--text-muted);
      border-bottom:1px solid var(--border); display:flex; justify-content:space-between; }
`;
function task({ done, title, meta, ctx, when, tone = "", who, ai }) {
  return `        <div class="tk">
          <span class="box"${done ? ' data-on="1"' : ""}></span>
          <span class="tk-main"><b style="${done ? "text-decoration:line-through; color:var(--text-muted); font-weight:400" : ""}">${title}</b>
            <span class="tk-meta">${meta}</span></span>
          <span style="font-size:13px" class="muted">${ctx}</span>
          <span style="font-size:13px; font-weight:600; ${tone}">${when}</span>
          <span style="display:flex; justify-content:flex-end; gap:8px; align-items:center">${ai ? `<span class="pill pill--ai">${icon("sparkles", 11)}</span>` : ""}<span class="av">${who}</span></span>
        </div>`;
}
const TASK_BODY = `      <div class="ph">
        <div><h1>Tasks</h1><p>Everything a person owes someone else, from any record. Six open, two of them late.</p></div>
        <div class="ph-actions">
          <div class="seg"><button type="button" data-on="1">Mine <em>6</em></button><button type="button">Team <em>19</em></button><button type="button">Done</button></div>
          <button class="btn btn--primary" type="button">${icon("plus", 15)}<span>New task</span></button>
        </div>
      </div>
      <section class="panel">
        <div class="toolbar">
          <span class="find">${icon("search", 14)}Task, person or property</span>
          <button class="btn btn--sm" type="button">Any type ${icon("down", 13)}</button>
          <button class="btn btn--sm" type="button">Any record ${icon("down", 13)}</button>
          <span style="margin-left:auto" class="mono">Grouped by due date</span>
        </div>
        <div class="day"><span>Late</span><span>2</span></div>
${task({ title: "Call Ivan Georgiev back", meta: `<span>Callback requested for weekdays after 14:00</span>`, ctx: "Lead · Ivan Georgiev", when: "2 days late", tone: "color:var(--danger-600)", who: "MR" })}
${task({ title: "Collect the preliminary contract from the seller", meta: `<span>Notary is booked for 8 September</span>`, ctx: "Case CASE-0007", when: "1 day late", tone: "color:var(--danger-600)", who: "MR" })}
        <div class="day"><span>Today, Tuesday 1 September</span><span>3</span></div>
${task({ title: "Confirm the Weber viewing", meta: `<span>15:00 · villa, Katuntsi</span>`, ctx: "Viewing", when: "By 12:00", tone: "color:var(--warning-700)", who: "PD" })}
${task({ title: "Approve 7 listing descriptions", meta: `<span>DE 3 · NL 2 · EL 2 · drafted by Hermes, nothing indexed yet</span>`, ctx: "Translations", when: "Today", who: "MR", ai: true })}
${task({ title: "Decide on the French language request", meta: `<span>3 visitors asked for /fr/ this week</span>`, ctx: "Request", when: "Today", who: "MR" })}
        <div class="day"><span>This week</span><span>1</span></div>
${task({ title: "Ask Nikolay Stoyanov for a review", meta: `<span>Sale completed 22 August</span>`, ctx: "Deal · won", when: "Friday", who: "MR" })}
        <div class="day"><span>Done today</span><span>2</span></div>
${task({ done: true, title: "Approve the German description for MS-00932", meta: `<span>Published to the public site</span>`, ctx: "Translations", when: "18 min ago", who: "MR" })}
${task({ done: true, title: "Reply to Anna Weber", meta: `<span>Sent by Petar, reviewed by Mariya</span>`, ctx: "Lead", when: "1 hour ago", who: "PD" })}
      </section>`;
fs.writeFileSync(W("Tasks.dc.html"), page({ active: "tasks", body: TASK_BODY, extraCss: TASK_CSS, height: 900 }));

/* ---------------------------------------------------------------- Requests */
const REQ_CSS = `
    .rq { display:grid; grid-template-columns:150px minmax(0,1fr) 210px 150px; gap:16px; align-items:start;
      padding:16px 16px; border-bottom:1px solid var(--border); }
    .rq:last-child { border-bottom:0; }
    .rq h3 { font-size:13px; font-weight:600; }
    .rq p { font-size:13px; color:var(--text-muted); margin-top:4px; }
    .rq-act { display:flex; flex-direction:column; gap:8px; align-items:stretch; }
`;
const REQ_BODY = `      <div class="ph">
        <div><h1>Requests from the website</h1><p>Things a visitor asked the agency to decide. Each one closes with a recorded outcome.</p></div>
        <div class="ph-actions">
          <div class="seg"><button type="button" data-on="1">Open <em>2</em></button><button type="button">Answered <em>14</em></button><button type="button">All</button></div>
        </div>
      </div>
      <section class="panel">
        <div class="toolbar"><span class="find">${icon("search", 14)}Request or page</span>
          <button class="btn btn--sm" type="button">Any kind ${icon("down", 13)}</button>
          <span style="margin-left:auto" class="mono">Oldest first</span></div>
        <div class="rq">
          <div><span class="pill pill--warn"><i></i>Language request</span><p class="mono" style="margin-top:8px">/fr/</p></div>
          <div><h3>French was requested three times this week</h3>
            <p>Three visitors from France and Belgium switched the language menu and found no French. The two
              most-viewed pages were the Sandanski search and the villa in Katuntsi.</p>
            <div style="display:flex; gap:8px; margin-top:8px"><span class="pill pill--sand">3 visitors</span>
              <span class="pill pill--sand">2 pages</span><span class="pill pill--sand">First asked 26 Aug</span></div></div>
          <div style="font-size:12px; color:var(--text-muted)">Adding a locale commits the agency to a human
            translation of every published listing before any French page can be indexed.</div>
          <div class="rq-act">
            <button class="btn btn--sm btn--primary" type="button">Plan French</button>
            <button class="btn btn--sm" type="button">Decline and record why</button>
          </div>
        </div>
        <div class="rq">
          <div><span class="pill pill--warn"><i></i>Saved search alert</span><p class="mono" style="margin-top:8px">alert-0042</p></div>
          <div><h3>A saved search has matched nothing for 21 days</h3>
            <p>Two-bedroom apartments in Melnik under €90,000. The subscriber has opened the last four emails,
              so the interest is real and the criteria are probably too narrow.</p>
            <div style="display:flex; gap:8px; margin-top:8px"><span class="pill pill--sand">Sofia Marinova</span>
              <span class="pill pill--sand">Weekly digest</span><span class="pill pill--sand">Consent current</span></div></div>
          <div style="font-size:12px; color:var(--text-muted)">A broker can widen the radius or offer a
            near match by hand. Nothing is sent automatically.</div>
          <div class="rq-act">
            <button class="btn btn--sm btn--primary" type="button">Offer a near match</button>
            <button class="btn btn--sm" type="button">Widen the search</button>
          </div>
        </div>
      </section>
      <section class="panel" style="margin-top:16px">
        <div class="panel-hd"><h2>Answered recently</h2><a href="#" style="font-size:12px; font-weight:600">All 14</a></div>
        <table>
          <thead><tr><th>Kind</th><th>Request</th><th>Outcome</th><th>Decided by</th><th>When</th></tr></thead>
          <tbody>
            <tr><td><span class="pill pill--sand">Language</span></td><td>Greek for the Melnik pages</td>
              <td><span class="pill pill--ok"><i></i>Planned for October</span></td><td>Mariya Ruseva</td><td class="muted">28 Aug</td></tr>
            <tr><td><span class="pill pill--sand">Valuation</span></td><td>House in Hotovo</td>
              <td><span class="pill pill--ok"><i></i>Broker assigned</span></td><td>Petar Dimitrov</td><td class="muted">27 Aug</td></tr>
            <tr><td><span class="pill pill--sand">Listing report</span></td><td>Photo does not match the description on <span class="mono">MS-00499</span></td>
              <td><span class="pill pill--warn"><i></i>Media re-review</span></td><td>Mariya Ruseva</td><td class="muted">26 Aug</td></tr>
          </tbody>
        </table>
      </section>`;
fs.writeFileSync(W("Requests.dc.html"), page({ active: "requests", body: REQ_BODY, extraCss: REQ_CSS, height: 900 }));

/* ---------------------------------------------------------------- Contacts */
const CON_BODY = `      <div class="ph">
        <div><h1>Contacts</h1><p>People and the companies they belong to. Contact details are stored encrypted and open only where a task needs them.</p></div>
        <div class="ph-actions">
          <button class="btn" type="button">${icon("upload", 15)}<span>Import</span></button>
          <button class="btn btn--primary" type="button">${icon("plus", 15)}<span>New contact</span></button>
        </div>
      </div>
      ${subnav([["People", "users", true], ["Companies", "company"], ["Consent", "shield"], ["Saved segments", "eye"]])}
      <section class="panel">
        <div class="toolbar">
          <span class="find">${icon("search", 14)}Name, phone, email or reference</span>
          <button class="btn btn--sm" type="button">Any role ${icon("down", 13)}</button>
          <button class="btn btn--sm" type="button">Any language ${icon("down", 13)}</button>
          <button class="btn btn--sm" type="button">Any broker ${icon("down", 13)}</button>
          <span style="margin-left:auto" class="mono">312 contacts</span>
        </div>
        <table>
          <thead><tr><th style="width:32px"></th><th>Person</th><th>Role</th><th>Company</th><th>Language</th><th>Consent</th><th>Open work</th><th>Broker</th><th>Last contact</th><th></th></tr></thead>
          <tbody>
${[
  ["MP","Maria Petrova","+972 ••• 8841","Buyer","sea","—","HE → EN","current","1 enquiry · overdue","danger","—","2 days ago"],
  ["AW","Anna Weber","anna.w@••••.de","Buyer","sea","Weber Immobilien GmbH","DE","current","Case CASE-0007","warn","MR","today"],
  ["IG","Ivan Georgiev","+359 ••• 412","Buyer","sea","—","BG","current","1 callback · overdue","danger","MR","2 days ago"],
  ["ED","Elena Dimitrova","+359 ••• 907","Seller","ink","—","BG","current","Valuation requested","warn","—","yesterday"],
  ["GN","Georgi Nikolov","g.nikolov@••••.bg","Renter","sand","—","BG","current","Feedback due","warn","PD","30 Aug"],
  ["SM","Sofia Marinova","+30 ••• 553","Buyer","sea","—","EL","current","Saved search","sand","MR","28 Aug"],
  ["NS","Nikolay Stoyanov","+359 ••• 218","Past client","ok","—","BG","expires 14 Sep","Review requested","sand","MR","22 Aug"],
  ["DV","Dmitri Volkov","d.volkov@••••.ru","Buyer","sea","—","RU","withdrawn","1 enquiry","sand","PD","yesterday"],
].map(([ini,name,detail,role,tone,company,lang,consent,work,wtone,broker,last]) => `            <tr>
              <td><span class="box"></span></td>
              <td><span style="display:flex; align-items:center; gap:12px"><span class="av">${ini}</span>
                <span class="t2"><b>${name}</b><span>${detail}</span></span></span></td>
              <td><span class="pill pill--${tone}"><i></i>${role}</span></td>
              <td class="muted">${company}</td>
              <td><span class="pill pill--sand">${lang}</span></td>
              <td>${consent === "current" ? '<span class="pill pill--ok"><i></i>Current</span>' : consent === "withdrawn" ? '<span class="pill pill--sand"><i></i>Withdrawn</span>' : `<span class="pill pill--warn"><i></i>${consent}</span>`}</td>
              <td><span class="pill pill--${wtone}"><i></i>${work}</span></td>
              <td>${broker === "—" ? '<span class="muted">Unassigned</span>' : `<span class="av">${broker}</span>`}</td>
              <td class="muted">${last}</td>
              <td style="text-align:right"><span class="muted">${icon("chevron", 15)}</span></td>
            </tr>`).join("\n")}
          </tbody>
        </table>
        <div class="foot"><span>Showing 1–8 of 312</span>
          <span style="display:flex; gap:8px"><button class="btn btn--sm" type="button">Previous</button><button class="btn btn--sm" type="button">Next</button></span></div>
      </section>`;
fs.writeFileSync(W("Contacts.dc.html"), page({ active: "contacts", body: CON_BODY, height: 900 }));

/* ----------------------------------------------------------------- Consent */
const CONS_BODY = `      <div class="ph">
        <div><h1>Consent</h1><p>What each person agreed to, when, and from which form. A withdrawal takes effect everywhere within the hour.</p></div>
        <div class="ph-actions">
          <button class="btn" type="button">${icon("download", 15)}<span>Export the ledger</span></button>
        </div>
      </div>
      ${subnav([["People", "users"], ["Companies", "company"], ["Consent", "shield", true], ["Saved segments", "eye"]])}
      <div style="display:grid; grid-template-columns:minmax(0,1fr) 316px; gap:20px; align-items:start">
        <section class="panel">
          <div class="toolbar"><span class="find">${icon("search", 14)}Person or email</span>
            <button class="btn btn--sm" type="button">Any purpose ${icon("down", 13)}</button>
            <button class="btn btn--sm" type="button">Any state ${icon("down", 13)}</button></div>
          <table>
            <thead><tr><th>Person</th><th>Purpose</th><th>Given</th><th>Source</th><th>Legal basis</th><th>State</th><th></th></tr></thead>
            <tbody>
              <tr><td><b>Nikolay Stoyanov</b></td><td>Marketing email</td><td class="muted">14 Mar 2026</td>
                <td class="mono">/bg/kontakt</td><td class="muted">consent</td>
                <td><span class="pill pill--ok"><i></i>Current</span></td>
                <td style="text-align:right"><button class="btn btn--sm" type="button">Withdraw…</button></td></tr>
              <tr><td><b>Dmitri Volkov</b></td><td>Marketing email</td><td class="muted">2 Jun 2026</td>
                <td class="mono">/ru/kontakt</td><td class="muted">consent</td>
                <td><span class="pill pill--sand"><i></i>Withdrawn 27 Aug</span></td>
                <td style="text-align:right"><span class="muted" style="font-size:13px">No further contact</span></td></tr>
              <tr><td><b>Anna Weber</b></td><td>Viewing and transaction contact</td><td class="muted">11 Jul 2026</td>
                <td class="mono">/de/imoti/villa-katuntsi</td><td class="muted">legitimate_interest</td>
                <td><span class="pill pill--ok"><i></i>Current</span></td>
                <td style="text-align:right"><button class="btn btn--sm" type="button">Withdraw…</button></td></tr>
              <tr><td><b>Sofia Marinova</b></td><td>Saved-search alerts</td><td class="muted">3 Aug 2026</td>
                <td class="mono">/el/tarsene</td><td class="muted">consent</td>
                <td><span class="pill pill--ok"><i></i>Current</span></td>
                <td style="text-align:right"><button class="btn btn--sm" type="button">Withdraw…</button></td></tr>
              <tr><td><b>Maria Petrova</b></td><td>Enquiry reply</td><td class="muted">4 Jul 2026</td>
                <td class="mono">WhatsApp opt-in</td><td class="muted">consent</td>
                <td><span class="pill pill--ok"><i></i>Current</span></td>
                <td style="text-align:right"><button class="btn btn--sm" type="button">Withdraw…</button></td></tr>
            </tbody>
          </table>
        </section>
        <div style="display:grid; gap:16px">
          <section class="panel">
            <div class="panel-hd"><h2>What a withdrawal does</h2></div>
            <div class="sect" style="display:grid; gap:8px; font-size:13px; color:var(--text-body)">
              <div style="display:flex; gap:8px">${icon("check", 15)}<span>Removes the person from every saved-search alert and campaign audience.</span></div>
              <div style="display:flex; gap:8px">${icon("check", 15)}<span>Keeps the records the agency is legally required to hold for a transaction.</span></div>
              <div style="display:flex; gap:8px">${icon("check", 15)}<span>Writes an entry naming who withdrew it and when, which cannot be edited.</span></div>
              <div class="note note--info" style="margin-top:4px">${icon("alert", 14)}<span>Reply to a direct enquiry is a separate purpose and is not removed by withdrawing marketing consent.</span></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Withdrawing a consent</h2></div>
            <div class="sect" style="display:grid; gap:12px; font-size:13px">
              <div class="field"><label for="wd-reason">Why <em>required</em></label>
                <span class="in" id="wd-reason">The person asked us to ${icon("down", 13)}</span></div>
              <span class="hint">One of three: the person asked us to, a broker recorded their request,
                or a data correction. The server takes no other reason.</span>
              <div style="display:flex; align-items:flex-start; gap:8px">
                <span class="box" data-on="1"></span>
                <span>I am recording this withdrawal and my name goes on it.</span>
              </div>
              <button class="btn btn--sm btn--danger" type="button">Withdraw this consent</button>
              <span class="hint">Withdrawal supersedes rather than edits, and cannot be undone from
                here — a new consent has to come from the person.</span>
            </div>
          </section>
        </div>
      </div>`;
fs.writeFileSync(W("Consent.dc.html"), page({ active: "consent", body: CONS_BODY, height: 900 }));

console.log("Viewings, Tasks, Requests, Contacts, Consent");
