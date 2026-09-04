import fs from "node:fs";
import { page, icon } from "./shell.mjs";

// Listings: one 22px title, one brick action, then rows on grout at 44px.
// Each row is one line of identity (title, reference) and carries, beside its
// publish state, the collapsed witness: a filled square and the approver's
// initials when someone signed it, an outlined square when nobody has.
const CSS = `
    .bulk { display:flex; align-items:center; gap:8px; min-height:var(--row); padding:0 14px;
      background:var(--tile-deep); border-bottom:1px solid var(--joint); font-size:13px; font-weight:600;
      color:var(--text-strong); }
    .bulk a { margin-left:auto; font-weight:600; }
    .ident { display:flex; align-items:center; gap:8px; min-width:0; }
    .ident b { min-width:0; font-weight:600; color:var(--text-strong); overflow:hidden; text-overflow:ellipsis;
      white-space:nowrap; }
    .state { display:flex; align-items:center; gap:8px; white-space:nowrap; }
    .lcs { display:flex; align-items:center; gap:3px; white-space:nowrap; }
    .lc { display:inline-grid; place-items:center; min-width:24px; height:20px; padding:0 5px;
      border-radius:var(--r-edge); background:var(--tile-deep); color:var(--marble-700); font-size:11px;
      font-weight:600; }
    /* Completeness: the fill has to be read against its own track, so every
       fill clears 3:1 on --tile-shadow (success 3.76, warning 4.23, marble-600 4.32). */
    .bar { display:inline-flex; align-items:center; gap:8px; white-space:nowrap; }
    .bar .t { display:block; width:56px; height:6px; border-radius:var(--r-pill); background:var(--tile-shadow);
      overflow:hidden; }
    .bar .t i { display:block; height:100%; border-radius:var(--r-pill); }
    td .box { display:block; }
    tbody tr[data-selected] td { background:var(--tile); }
    .go { display:inline-flex; color:var(--text-muted); }
`;

function locs(active) {
  const rest = 7 - active.length;
  const more = rest > 0 ? `<span class="muted">+${rest}</span>` : "";
  return `<span class="lcs">${active.map((c) => `<span class="lc">${c}</span>`).join("")}${more}</span>`;
}
function quality(pct, tone) {
  return `<span class="bar"><span class="t"><i style="width:${pct}%; background:var(${tone})"></i></span><span class="muted">${pct}%</span></span>`;
}
function witness(by) {
  return by ? `<span class="wit"><b>${by}</b></span>` : `<span class="wit wit--none"></span>`;
}

function listingRow({ ref, title, place, type, price, status, statusTone, by, active, updated, pct, tone, selected }) {
  const withdrawn = !price.startsWith("€");
  return `            <tr${selected ? ' data-selected="1"' : ""}>
              <td style="width:36px; padding-right:0"><span class="box"${selected ? ' data-on="1"' : ""}></span></td>
              <td><span class="ident"><b>${title}</b><span class="mono">${ref}</span></span></td>
              <td class="muted">${place}</td>
              <td class="muted">${type}</td>
              <td style="white-space:nowrap">${withdrawn ? `<span class="muted">${price}</span>` : `<span class="price">${price}</span>`}</td>
              <td><span class="state"><span class="pill pill--${statusTone}"><i></i>${status}</span>${witness(by)}</span></td>
              <td>${locs(active)}</td>
              <td>${quality(pct, tone)}</td>
              <td class="muted" style="white-space:nowrap">${updated}</td>
              <td style="width:36px; padding-left:0; text-align:right"><span class="go">${icon("chevron", 16)}</span></td>
            </tr>`;
}

const ROWS = [
  { ref: "MS-00815", title: "Two-bedroom apartment with a south terrace", place: "Sandanski", type: "Apartment", price: "€68,000", status: "Published", statusTone: "ok", by: "MR", active: ["BG","EN","RU"], updated: "18 min ago", pct: 92, tone: "--success-500" },
  { ref: "MS-00932", title: "Renovated village house with a garden", place: "Katuntsi", type: "House", price: "€54,500", status: "Published", statusTone: "ok", by: "PD", active: ["BG","EN","DE","RU"], updated: "2 hours ago", pct: 88, tone: "--success-500" },
  { ref: "MS-00791", title: "Studio near the mineral baths", place: "Sandanski", type: "Studio", price: "€31,900", status: "Needs review", statusTone: "warn", active: ["BG","RU"], updated: "3 hours ago", pct: 61, tone: "--warning-700", selected: true },
  { ref: "MS-00191", title: "Villa with a pool and mountain views", place: "Katuntsi", type: "Villa", price: "€185,000", status: "Published", statusTone: "ok", by: "MR", active: ["BG","EN","DE","NL","RU"], updated: "Yesterday", pct: 95, tone: "--success-500" },
  { ref: "MS-00872", title: "Building plot with road access", place: "Levunovo", type: "Plot", price: "€28,000", status: "Needs review", statusTone: "warn", active: ["BG"], updated: "Yesterday", pct: 44, tone: "--warning-700", selected: true },
  { ref: "MS-00345", title: "One-bedroom flat in the town centre", place: "Sandanski", type: "Apartment", price: "€400 / month", status: "Published", statusTone: "ok", by: "PD", active: ["BG","EN","RU"], updated: "2 days ago", pct: 79, tone: "--success-500" },
  { ref: "MS-00046", title: "Commercial unit on the main street", place: "Sandanski", type: "Commercial", price: "€120,000", status: "Draft", statusTone: "sand", active: ["BG"], updated: "3 days ago", pct: 33, tone: "--marble-600" },
  { ref: "MS-00696", title: "Three-bedroom house, source unavailable", place: "Melnik", type: "House", price: "Price withdrawn", status: "Archived", statusTone: "sand", active: ["BG"], updated: "5 days ago", pct: 21, tone: "--marble-600" },
  { ref: "MS-00499", title: "Apartment with a covered parking space", place: "Sandanski", type: "Apartment", price: "€72,400", status: "Needs review", statusTone: "warn", active: ["BG","EN"], updated: "6 days ago", pct: 58, tone: "--warning-700", selected: true },
  { ref: "MS-00671", title: "Rural house for restoration", place: "Lehovo", type: "House", price: "€19,500", status: "Draft", statusTone: "sand", active: ["BG"], updated: "1 week ago", pct: 40, tone: "--marble-600" },
];

const BODY = `      <div class="ph">
        <div>
          <h1>Listings</h1>
          <p>A listing goes public only after its facts, media and translations are approved.</p>
        </div>
        <div class="ph-actions">
          <div class="seg">
            <button type="button" data-on="1">All <em>165</em></button>
            <button type="button">Published <em>84</em></button>
            <button type="button">Needs review <em>43</em></button>
            <button type="button">Archived <em>38</em></button>
          </div>
          <button class="btn btn--accent" type="button">${icon("plus", 16)}<span>New listing</span></button>
        </div>
      </div>

      <section class="panel">
        <div class="toolbar">
          <span class="find">${icon("search", 16)}Reference, title or location</span>
          <button class="btn btn--sm" type="button">Sandanski${icon("down", 16)}</button>
          <button class="btn btn--sm" type="button">Any type${icon("down", 16)}</button>
          <button class="btn btn--sm" type="button">Any price${icon("down", 16)}</button>
          <button class="btn btn--sm btn--ghost" type="button">Clear</button>
          <span style="margin-left:auto" class="mono">Sorted by last updated</span>
        </div>
        <div class="bulk">
          ${icon("check", 16)}
          <span>3 selected</span>
          <button class="btn btn--sm" type="button">Assign broker</button>
          <button class="btn btn--sm" type="button">Request translation</button>
          <button class="btn btn--sm" type="button">Send for approval</button>
          <button class="btn btn--sm" type="button">Archive</button>
          <a href="#">Clear selection</a>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:36px; padding-right:0"></th>
              <th>Property</th>
              <th style="width:104px">Location</th>
              <th style="width:104px">Type</th>
              <th style="width:112px">Price</th>
              <th style="width:176px">Status</th>
              <th style="width:176px">Languages</th>
              <th style="width:124px">Completeness</th>
              <th style="width:104px">Updated</th>
              <th style="width:36px; padding-left:0"></th>
            </tr>
          </thead>
          <tbody>
${ROWS.map(listingRow).join("\n")}
          </tbody>
        </table>
        <div class="foot">
          <span>Showing 1–10 of 165</span>
          <span style="display:flex; align-items:center; gap:8px">
            <button class="btn btn--sm" type="button">Previous</button>
            <button class="btn btn--sm" type="button">Next</button>
          </span>
        </div>
      </section>`;

fs.writeFileSync(new URL("./Listings.dc.html", import.meta.url), page({
  active: "listings", body: BODY, extraCss: CSS, height: 940,
}));
console.log("Listings.dc.html");
