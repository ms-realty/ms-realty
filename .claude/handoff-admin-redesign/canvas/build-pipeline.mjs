import fs from "node:fs";
import { page, icon } from "./shell.mjs";

const CSS = `
    .board { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(200px,1fr); gap:14px; align-items:start; }
    .col { background:var(--sunken); border-radius:14px; display:flex; flex-direction:column; min-height:420px; }
    .col-hd { display:flex; align-items:center; gap:8px; padding:12px 14px 8px; }
    .col-hd b { font-size:12.5px; font-weight:600; color:var(--text-strong); }
    .col-n { min-width:20px; height:20px; padding:0 6px; border-radius:999px; background:var(--stone-300);
      color:var(--stone-800); font-size:11px; font-weight:600; line-height:20px; text-align:center; }
    .col-sum { padding:0 14px 9px; font-size:11.5px; color:var(--text-muted); }
    .col-list { display:flex; flex-direction:column; gap:8px; padding:0 9px 12px; min-width:0; }
    .kc { background:var(--surface); border:1px solid var(--border); border-radius:11px; padding:11px 12px;
      box-shadow:var(--e-1); display:grid; gap:8px; min-width:0; }
    .kc-top { display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:0; }
    .kc-top .pill { flex:0 0 auto; }
    .kc-top b { flex:1 1 auto; min-width:0; font-size:13px; font-weight:600; color:var(--text-strong);
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .kc-line { font-size:12px; color:var(--text-muted); }
    .kc-line .mono { white-space:nowrap; }
    .kc-line b { display:block; font-weight:400; }
    .kc-next { display:grid; grid-template-columns:auto minmax(0,1fr); gap:8px; align-items:center;
      padding:7px 9px; border-radius:8px; background:var(--stone-50); border:1px solid var(--border); }
    .kc-next b { font-size:12px; font-weight:600; color:var(--text-strong); display:block; }
    .kc-next em { font-style:normal; font-size:11.5px; color:var(--text-muted); }
    .kc-foot { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .col-empty { margin:0 9px 12px; padding:22px 12px; border:1px dashed var(--border-control);
      border-radius:10px; text-align:center; font-size:12px; color:var(--text-subtle); }
`;

function card({ name, line, budget, nextTitle, nextWhen, tone = "ink", tag, broker, overdue }) {
  return `            <article class="kc">
              <div class="kc-top"><b>${name}</b><span class="pill pill--${tone}"><i></i>${tag}</span></div>
              <p class="kc-line">${line}</p>
              <div class="kc-next">
                ${icon("arrow", 15)}
                <span><b>${nextTitle}</b><em style="${overdue ? "color:var(--danger-600); font-weight:600" : ""}">${nextWhen}</em></span>
              </div>
              <div class="kc-foot">
                <span class="price" style="font-size:13.5px">${budget}</span>
                <span class="av">${broker}</span>
              </div>
            </article>`;
}

const BODY = `      <div class="ph">
        <div>
          <h1>Buyers and renters</h1>
          <p>One card per person, carrying the next action and who owns it. Two are overdue.</p>
        </div>
        <div class="ph-actions">
          <div class="seg">
            <button type="button" data-on="1">Open <em>9</em></button>
            <button type="button">Buyers <em>5</em></button>
            <button type="button">Renters <em>4</em></button>
            <button type="button">Closed <em>12</em></button>
          </div>
          <button class="btn" type="button">${icon("users", 15)}<span>All brokers</span>${icon("down", 14)}</button>
          <button class="btn btn--primary" type="button">${icon("plus", 15)}<span>New opportunity</span></button>
        </div>
      </div>

      <div class="board">
        <section class="col">
          <div class="col-hd"><b>New enquiry</b><span class="col-n">3</span></div>
          <p class="col-sum">2 overdue · qualification incomplete</p>
          <div class="col-list">
${card({ name: "Maria Petrova", line: "2-bed apartment · Sandanski", budget: "Budget not set", tag: "Overdue", tone: "danger", nextTitle: "Qualify and reply", nextWhen: "Due 2 days ago", overdue: true, broker: "—" })}
${card({ name: "Dmitri Volkov", line: "Studio · Sandanski · Russian", budget: "€45,000 – €60,000", tag: "New", tone: "sea", nextTitle: "First reply", nextWhen: "Due tomorrow 10:00", broker: "PD" })}
${card({ name: "Elena Dimitrova", line: "Seller · house, Sandanski", budget: "Valuation pending", tag: "Unassigned", tone: "warn", nextTitle: "Assign a broker", nextWhen: "Due today", overdue: true, broker: "—" })}
          </div>
        </section>

        <section class="col">
          <div class="col-hd"><b>Qualified</b><span class="col-n">2</span></div>
          <p class="col-sum">€250,000 combined budget</p>
          <div class="col-list">
${card({ name: "Georgi Nikolov", line: "Renter · 1-bed<br>Sandanski centre", budget: "€400 / month", tag: "Renter", tone: "sea", nextTitle: "Send 3 matches", nextWhen: "Due Wed", broker: "PD" })}
${card({ name: "Sofia Marinova", line: "2-bed apartment · Melnik", budget: "€90,000 – €160,000", tag: "Cash", tone: "ok", nextTitle: "Book a viewing", nextWhen: "Due Thu", broker: "MR" })}
          </div>
        </section>

        <section class="col">
          <div class="col-hd"><b>Viewing</b><span class="col-n">2</span></div>
          <p class="col-sum">1 unconfirmed for today</p>
          <div class="col-list">
${card({ name: "Anna Weber", line: "Villa · Katuntsi<br><span class='mono'>MS-CRAWL-0114</span>", budget: "€185,000", tag: "Today 15:00", tone: "warn", nextTitle: "Confirm the viewing", nextWhen: "Not confirmed", overdue: true, broker: "PD" })}
${card({ name: "Petar Kolev", line: "Plot · Levunovo<br><span class='mono'>MS-CRAWL-0129</span>", budget: "€28,000", tag: "Wed 11:00", tone: "sea", nextTitle: "Second viewing with the owner", nextWhen: "Confirmed", broker: "MR" })}
          </div>
        </section>

        <section class="col">
          <div class="col-hd"><b>Offer and contract</b><span class="col-n">1</span></div>
          <p class="col-sum">Notary date set for 8 September</p>
          <div class="col-list">
${card({ name: "Anna Weber", line: "Preliminary contract<br><span class='mono'>CASE-0007</span>", budget: "€185,000", tag: "Documents", tone: "warn", nextTitle: "Collect 4 missing documents", nextWhen: "Notary 8 Sep", broker: "MR" })}
          </div>
        </section>

        <section class="col">
          <div class="col-hd"><b>Closed</b><span class="col-n">1</span></div>
          <p class="col-sum">This quarter · €96,000</p>
          <div class="col-list">
${card({ name: "Nikolay Stoyanov", line: "House · Sandanski<br>Completed 22 Aug", budget: "€96,000", tag: "Won", tone: "ok", nextTitle: "Ask for a review", nextWhen: "Due Fri", broker: "MR" })}
          </div>
          <div class="col-empty">Lost opportunities move to the Closed filter above.</div>
        </section>
      </div>`;

fs.writeFileSync(new URL("./Pipeline.dc.html", import.meta.url), page({
  active: "pipeline", body: BODY, extraCss: CSS, height: 900,
}));
console.log("Pipeline.dc.html");
