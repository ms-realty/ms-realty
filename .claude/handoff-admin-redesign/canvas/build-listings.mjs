import fs from "node:fs";
import { page, icon } from "./shell.mjs";

const CSS = `
    .bulk { display:flex; align-items:center; gap:10px; padding:9px 14px; background:var(--sea-50);
      border-bottom:1px solid var(--sea-100); font-size:12.5px; color:var(--sea-700); font-weight:600; }
    .t-title { display:grid; gap:1px; min-width:0; }
    .t-title b { font-size:13px; font-weight:600; color:var(--text-strong);
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .t-title span { font-size:11.5px; color:var(--text-muted); }
    .thumb { width:44px; height:34px; border-radius:6px; background:var(--stone-200); flex:0 0 auto;
      display:grid; place-items:center; color:var(--stone-500); }
    .locs { display:flex; gap:3px; }
    .loc { display:grid; place-items:center; min-width:22px; height:17px; padding:0 4px; border-radius:4px;
      background:var(--stone-200); color:var(--stone-700); font-size:9.5px; font-weight:700; letter-spacing:.03em; }
    .loc--off { background:transparent; border:1px dashed var(--border-control); color:var(--text-subtle); font-weight:600; }
    .bar { width:56px; height:5px; border-radius:999px; background:var(--stone-200); overflow:hidden; }
    .bar i { display:block; height:100%; border-radius:999px; }
    .cell-q { display:flex; align-items:center; gap:8px; }
`;

function loc(code, on) {
  return `<span class="loc${on ? "" : " loc--off"}">${code}</span>`;
}
function locs(active) {
  const rest = 7 - active.length;
  const more = rest > 0 ? `<span class="muted" style="font-size:11.5px">+${rest}</span>` : "";
  return `<span class="locs">${active.map((c) => loc(c, true)).join("")}${more}</span>`;
}
function quality(pct, tone) {
  return `<span class="cell-q"><span class="bar"><i style="width:${pct}%; background:${tone}"></i></span><span class="muted">${pct}%</span></span>`;
}

function listingRow({ ref, title, place, type, price, status, statusTone, active, updated, pct, tone }) {
  return `            <tr>
              <td style="width:34px"><span class="box" style="margin:0"></span></td>
              <td style="width:56px"><span class="thumb">${icon("building", 17)}</span></td>
              <td><span class="t-title"><b>${title}</b><span class="mono">${ref}</span></span></td>
              <td class="muted">${place}</td>
              <td class="muted">${type}</td>
              <td style="white-space:nowrap"><span class="price" style="font-size:13px">${price}</span></td>
              <td><span class="pill pill--${statusTone}"><i></i>${status}</span></td>
              <td>${locs(active)}</td>
              <td>${quality(pct, tone)}</td>
              <td class="muted" style="white-space:nowrap">${updated}</td>
              <td style="width:36px; text-align:right"><span class="muted">${icon("chevron", 15)}</span></td>
            </tr>`;
}

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
          <button class="btn btn--primary" type="button">${icon("plus", 15)}<span>New listing</span></button>
        </div>
      </div>

      <section class="panel">
        <div class="toolbar">
          <span class="find">${icon("search", 14)}Reference, title or location</span>
          <button class="btn btn--sm" type="button">Sandanski${icon("down", 14)}</button>
          <button class="btn btn--sm" type="button">Any type${icon("down", 14)}</button>
          <button class="btn btn--sm" type="button">Any price${icon("down", 14)}</button>
          <button class="btn btn--sm btn--ghost" type="button">Clear</button>
          <span style="margin-left:auto" class="mono">Sorted by last updated</span>
        </div>
        <div class="bulk">
          ${icon("check", 15)}
          <span>3 selected</span>
          <button class="btn btn--sm" type="button">Assign broker</button>
          <button class="btn btn--sm" type="button">Request translation</button>
          <button class="btn btn--sm" type="button">Send for approval</button>
          <button class="btn btn--sm" type="button">Archive</button>
          <a href="#" style="margin-left:auto; font-weight:600">Clear selection</a>
        </div>
        <table>
          <thead>
            <tr>
              <th></th><th></th><th>Property</th><th>Location</th><th>Type</th><th>Price</th>
              <th>Status</th><th>Languages</th><th>Completeness</th><th>Updated</th><th></th>
            </tr>
          </thead>
          <tbody>
${listingRow({ ref: "MS-CRAWL-0001", title: "Two-bedroom apartment with a south terrace", place: "Sandanski", type: "Apartment", price: "€68,000", status: "Published", statusTone: "ok", active: ["BG","EN","RU"], updated: "18 min ago", pct: 92, tone: "var(--success-500)" })}
${listingRow({ ref: "MS-CRAWL-0032", title: "Renovated village house with a garden", place: "Katuntsi", type: "House", price: "€54,500", status: "Published", statusTone: "ok", active: ["BG","EN","DE","RU"], updated: "2 hours ago", pct: 88, tone: "var(--success-500)" })}
${listingRow({ ref: "MS-CRAWL-0087", title: "Studio near the mineral baths", place: "Sandanski", type: "Studio", price: "€31,900", status: "Needs review", statusTone: "warn", active: ["BG","RU"], updated: "3 hours ago", pct: 61, tone: "var(--sun-600)" })}
${listingRow({ ref: "MS-CRAWL-0114", title: "Villa with a pool and mountain views", place: "Katuntsi", type: "Villa", price: "€185,000", status: "Published", statusTone: "ok", active: ["BG","EN","DE","NL","RU"], updated: "Yesterday", pct: 95, tone: "var(--success-500)" })}
${listingRow({ ref: "MS-CRAWL-0129", title: "Building plot with road access", place: "Levunovo", type: "Plot", price: "€28,000", status: "Needs review", statusTone: "warn", active: ["BG"], updated: "Yesterday", pct: 44, tone: "var(--sun-600)" })}
${listingRow({ ref: "MS-CRAWL-0044", title: "One-bedroom flat in the town centre", place: "Sandanski", type: "Apartment", price: "€400 / month", status: "Published", statusTone: "ok", active: ["BG","EN","RU"], updated: "2 days ago", pct: 79, tone: "var(--success-500)" })}
${listingRow({ ref: "MS-CRAWL-0158", title: "Commercial unit on the main street", place: "Sandanski", type: "Commercial", price: "€120,000", status: "Draft", statusTone: "sand", active: ["BG"], updated: "3 days ago", pct: 33, tone: "var(--stone-400)" })}
${listingRow({ ref: "MS-CRAWL-0163", title: "Three-bedroom house, source unavailable", place: "Melnik", type: "House", price: "Price withdrawn", status: "Archived", statusTone: "sand", active: ["BG"], updated: "5 days ago", pct: 21, tone: "var(--stone-400)" })}
${listingRow({ ref: "MS-CRAWL-0071", title: "Apartment with a covered parking space", place: "Sandanski", type: "Apartment", price: "€72,400", status: "Needs review", statusTone: "warn", active: ["BG","EN"], updated: "6 days ago", pct: 58, tone: "var(--sun-600)" })}
${listingRow({ ref: "MS-CRAWL-0092", title: "Rural house for restoration", place: "Lehovo", type: "House", price: "€19,500", status: "Draft", statusTone: "sand", active: ["BG"], updated: "1 week ago", pct: 40, tone: "var(--stone-400)" })}
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
