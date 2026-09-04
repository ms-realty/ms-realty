import fs from "node:fs";
import { page, icon } from "./shell.mjs";

const CSS = `
    .inbox { display:grid; grid-template-columns:352px minmax(0,1fr); align-items:stretch; }
    .inbox-list { border-right:1px solid var(--border); display:flex; flex-direction:column; min-width:0; }
    .inbox-tools { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:1px solid var(--border);
      background:var(--sunken); }
    .inbox-find { display:flex; align-items:center; gap:8px; flex:1 1 auto; height:30px; padding:0 12px;
      border:1px solid var(--border-control); border-radius:var(--r-panel); background:var(--surface); color:var(--text-muted);
      font-size:13px; }
    .row { display:grid; grid-template-columns:auto minmax(0,1fr); column-gap:12px; row-gap:4px;
      padding:12px 16px; border-bottom:1px solid var(--border); }
    .row:hover { background:var(--tile); }
    .row--on { background:var(--surface); box-shadow:inset 3px 0 0 var(--brick-500); }
    .row-hd { display:flex; align-items:baseline; gap:8px; min-width:0; }
    .row-hd b { flex:1 1 auto; min-width:0; font-size:13px; font-weight:600; color:var(--text-strong);
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .row-hd time { font-size:11px; color:var(--text-muted); flex:0 0 auto; }
    .row-sub { grid-column:2; font-size:13px; color:var(--text-muted); overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; }
    .row-tags { grid-column:2; display:flex; gap:4px; flex-wrap:wrap; }
    .detail { display:flex; flex-direction:column; min-width:0; }
    .detail-hd { display:flex; align-items:flex-start; justify-content:space-between; gap:16px;
      padding:16px 20px 16px; border-bottom:1px solid var(--border); }
    .detail-hd h2 { font-family:var(--font-display); font-size:19px; font-weight:600; letter-spacing:-.01em; }
    .detail-hd .who { display:flex; align-items:center; gap:8px; margin-top:4px; font-size:13px;
      color:var(--text-muted); flex-wrap:wrap; }
    .facts { display:grid; grid-template-columns:repeat(5, minmax(0,1fr)); gap:4px; background:var(--border);
      border-bottom:1px solid var(--border); }
    .fact { background:var(--surface); padding:12px 20px; min-width:0; }
    .fact dt { font-size:11px; color:var(--text-muted); margin-bottom:4px; }
    .fact dd { margin:0; font-size:13px; font-weight:600; color:var(--text-strong);
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .composer { border:1px solid var(--border-control); border-radius:var(--r-panel); background:var(--surface); overflow:hidden; }
    .composer-bar { display:flex; align-items:center; gap:8px; padding:8px 12px; background:var(--sunken);
      border-bottom:1px solid var(--border); }
    .composer-body { padding:12px 16px; font-size:13px; color:var(--text-body); min-height:88px; line-height:1.55; }
    .composer-foot { display:flex; align-items:center; gap:12px; padding:8px 12px; border-top:1px solid var(--border); }
    .ev { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:start; gap:12px;
      padding:12px 0; border-bottom:1px solid var(--border); }
    .ev:last-child { border-bottom:0; }
    .ev p { font-size:13px; }
    .ev em { font-style:normal; color:var(--text-muted); }
`;

function row({ on, name, time, sub, tags }) {
  return `            <div class="row${on ? " row--on" : ""}">
              <span class="box"></span>
              <span class="row-hd"><b>${name}</b><time>${time}</time></span>
              <span class="row-sub">${sub}</span>
              <span class="row-tags">${tags}</span>
            </div>`;
}

const BODY = `      <div class="ph">
        <div>
          <h1>Lead inbox</h1>
          <p>A reply needs a named human approval before it leaves. Four are waiting.</p>
        </div>
        <div class="ph-actions">
          <div class="seg">
            <button type="button" data-on="1">Needs reply <em>4</em></button>
            <button type="button">Overdue <em>3</em></button>
            <button type="button">Unassigned <em>4</em></button>
            <button type="button">All <em>28</em></button>
          </div>
          <button class="btn btn--primary" type="button">${icon("plus", 15)}<span>Log enquiry</span></button>
        </div>
      </div>

      <section class="panel">
        <div class="inbox">
          <div class="inbox-list">
            <div class="inbox-tools">
              <span class="inbox-find">${icon("search", 14)}Filter these 4</span>
              <button class="btn btn--sm" type="button">Newest${icon("down", 14)}</button>
            </div>
${row({ on: true, name: "Maria Petrova", time: "2 d", sub: "Listing enquiry · MS-00815, Sandanski",
  tags: `<span class="pill pill--danger"><i></i>Escalated</span><span class="pill pill--sand">WhatsApp</span><span class="pill pill--sand">HE → EN</span>` })}
${row({ name: "Anna Weber", time: "2 d", sub: "Viewing request · MS-00191, Katuntsi",
  tags: `<span class="pill pill--warn"><i></i>Reply due today</span><span class="pill pill--sand">Email</span>` })}
${row({ name: "Ivan Georgiev", time: "2 d", sub: "Callback · weekdays after 14:00",
  tags: `<span class="pill pill--danger"><i></i>Escalated</span><span class="pill pill--sand">Phone</span>` })}
${row({ name: "Elena Dimitrova", time: "1 d", sub: "Seller valuation · house, Sandanski",
  tags: `<span class="pill pill--warn"><i></i>Unassigned</span><span class="pill pill--sand">Website form</span>` })}
            <p style="padding:16px; font-size:13px; color:var(--text-subtle)">
              24 answered leads are in <a href="#" style="font-weight:600">All</a>.
            </p>
          </div>

          <div class="detail">
            <div class="detail-hd">
              <div style="min-width:0">
                <h2>Maria Petrova</h2>
                <div class="who">
                  <span class="pill pill--sea"><i></i>Buyer</span>
                  <span>Listing enquiry</span><span>·</span>
                  <span>WhatsApp</span><span>·</span>
                  <span class="mono">+972 ••• 8841</span><span>·</span>
                  <span>Hebrew, replying in English</span>
                </div>
              </div>
              <div class="ph-actions">
                <button class="btn btn--sm" type="button">${icon("clock", 14)}<span>Snooze…</span></button>
                <button class="btn btn--sm" type="button">${icon("users", 14)}<span>Reassign…</span></button>
                <button class="btn btn--sm" type="button">${icon("list", 14)}<span>History</span></button>
              </div>
            </div>

            <dl class="facts">
              <div class="fact"><dt>Reply deadline</dt><dd style="color:var(--danger-600)">Overdue 2 days</dd></div>
              <div class="fact"><dt>Received</dt><dd>4 Jul, 03:00</dd></div>
              <div class="fact"><dt>Property</dt><dd><span class="mono" style="font-size:13px">MS-00815</span></dd></div>
              <div class="fact"><dt>Assigned broker</dt><dd class="subtle">Not set</dd></div>
              <div class="fact"><dt>Matching inventory</dt><dd>5 properties</dd></div>
            </dl>

            <div class="sect">
              <h3>Reassign this enquiry
                <span style="font-weight:500; font-size:13px; color:var(--text-muted)">
                  Both fields are required — the server refuses a reassignment without them.
                </span>
              </h3>
              <div style="display:grid; gap:12px; max-width:520px">
                <div class="field"><label for="ra-broker">To</label>
                  <span class="in" id="ra-broker">Mariya Ruseva ${icon("down", 13)}</span></div>
                <div class="field"><label for="ra-reason">Why <em>required</em></label>
                  <span class="in in--area" id="ra-reason">Hebrew enquiry; Mariya answers in Hebrew and
                    the previous broker is on leave until the 12th.</span></div>
                <div style="display:flex; align-items:flex-start; gap:8px; font-size:13px">
                  <span class="box" data-on="1"></span>
                  <span>I am reassigning this enquiry and my name goes on it.</span>
                </div>
                <div style="display:flex; gap:8px">
                  <button class="btn btn--sm btn--primary" type="button">Reassign</button>
                  <button class="btn btn--sm" type="button">Cancel</button>
                </div>
                <span class="hint">Snoozing asks for the same two things plus the moment it comes back,
                  at most 90 days out. The reply clock defers by that whole window rather than restarting.</span>
              </div>
            </div>

            <div class="sect">
              <h3>Reply
                <span style="font-weight:500; font-size:13px; color:var(--text-muted)">
                  Approved by a named person before sending — Hermes may only draft.
                </span>
              </h3>
              <div class="composer">
                <div class="composer-bar">
                  <span class="pill pill--sand">${icon("sparkles", 13)}Hermes draft</span>
                  <span class="pill pill--sand">Template: viewing offer</span>
                  <span style="margin-left:auto" class="mono">EN · 412 characters</span>
                </div>
                <div class="composer-body">
                  Hello Maria, thank you for your interest in the two-bedroom apartment in Sandanski
                  (reference MS-00815, €68,000). It is still available. I can show it on Thursday
                  at 11:00 or Friday at 15:00 — which suits you better?
                </div>
                <div class="composer-foot">
                  <button class="btn btn--sm btn--primary" type="button">${icon("send", 14)}<span>Approve and send</span></button>
                  <button class="btn btn--sm" type="button">Save as draft</button>
                  <span style="margin-left:auto; font-size:13px" class="muted">Sends over WhatsApp Business</span>
                </div>
              </div>
              <div class="note" style="margin-top:12px">
                ${icon("alert", 15)}
                <span>WhatsApp Business is not connected yet, so this reply will be marked ready for manual sending.
                  <a href="#" style="font-weight:600; text-decoration:underline">Connect it</a>.</span>
              </div>
            </div>

            <div class="sect">
              <h3>Conversation <span style="font-weight:500; font-size:13px" class="muted">2 events</span></h3>
              <div class="ev">
                <span class="av">MP</span>
                <p><em>Maria Petrova asked</em> whether the apartment is still available and if a viewing is possible next week.</p>
                <span class="mono">4 Jul, 03:00</span>
              </div>
              <div class="ev">
                <span class="av" style="background:var(--spring-50); color:var(--spring-800)">SY</span>
                <p><em>Automatic acknowledgement sent</em> in Hebrew. No property facts included.</p>
                <span class="mono">4 Jul, 03:01</span>
              </div>
            </div>

            <div class="sect" style="border-bottom:0">
              <h3>Requirements <a href="#" style="font-weight:600; font-size:13px">Edit</a></h3>
              <div style="display:flex; flex-wrap:wrap; gap:8px">
                <span class="pill pill--ink">Sandanski</span>
                <span class="pill pill--ink">Apartment</span>
                <span class="pill pill--ink">2 bedrooms</span>
                <span class="pill pill--ink">Cash</span>
                <span class="pill pill--warn"><i></i>Budget not captured</span>
                <span class="pill pill--warn"><i></i>Decision timeline not captured</span>
              </div>
            </div>
          </div>
        </div>
      </section>`;

fs.writeFileSync(new URL("./LeadInbox.dc.html", import.meta.url), page({
  active: "leads", body: BODY, extraCss: CSS, height: 980,
}));
console.log("LeadInbox.dc.html");
