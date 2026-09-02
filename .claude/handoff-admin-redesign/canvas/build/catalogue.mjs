import fs from "node:fs";
import { page, icon, subnav } from "../shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

const LE_CSS = `
    .fbox { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px 20px; padding:16px 20px; }
    .fact { display:grid; gap:5px; min-width:0; }
    .fact label { font-size:12px; font-weight:600; color:var(--text-body); display:flex; align-items:center; gap:6px; }
    .src { font-size:10.5px; font-weight:600; padding:1px 6px; border-radius:var(--r-xs); }
    .src--v { background:var(--success-50); color:var(--success-600); }
    .src--c { background:var(--sea-50); color:var(--sea-700); }
    .src--m { background:var(--warning-50); color:var(--warning-700); }
    .gal2 { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:9px; padding:16px 20px; }
    .ph2 { height:74px; border-radius:var(--r-sm); background:var(--stone-200); display:grid; place-items:center;
      color:var(--stone-500); position:relative; }
    .ph2 span { position:absolute; top:5px; left:5px; }
    .side-sect { padding:14px 16px; border-bottom:1px solid var(--border); }
    .side-sect:last-child { border-bottom:0; }
    .side-sect > b { display:block; font-size:12.5px; margin-bottom:8px; }
    .trow { display:grid; grid-template-columns:34px minmax(0,1fr) auto; gap:10px; align-items:center;
      padding:8px 0; border-bottom:1px solid var(--border); font-size:12.5px; }
    .trow:last-child { border-bottom:0; }
`;
const LE_BODY = `      <div class="crumbs" style="display:flex; align-items:center; gap:7px; font-size:12px; color:var(--text-muted); margin-bottom:10px">
        <a href="#">Listings</a> ${icon("chevron", 13)} <b style="color:var(--text-strong)">MS-CRAWL-0114</b>
      </div>
      <div class="ph">
        <div><h1>Villa with a pool and mountain views</h1>
          <p><span class="mono">MS-CRAWL-0114</span> · Katuntsi · €185,000 · imported from makler-realty.com, last edited today by Mariya</p></div>
        <div class="ph-actions">
          <span class="pill pill--ok"><i></i>Published</span>
          <button class="btn" type="button">${icon("eye", 15)}<span>View public page</span></button>
          <button class="btn" type="button">${icon("history", 15)}<span>History</span></button>
          <button class="btn btn--primary" type="button">Save</button>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:minmax(0,1fr) 348px; gap:20px; align-items:start">
        <section class="panel">
          <nav class="tabs" style="padding:0 20px"><a href="#" data-on="1">Facts</a><a href="#">Description</a>
            <a href="#">Media <span class="muted">14</span></a><a href="#">Tour</a><a href="#">Translations <span class="muted">5</span></a><a href="#">Publication</a></nav>
          <div class="fbox">
${[
  ["Reference","MS-CRAWL-0114","v","From the source listing"],
  ["Property type","Villa","c","Mapped from the legacy taxonomy"],
  ["Deal","For sale","v",""],
  ["Price","€185,000","v","Matches the source page"],
  ["Built area","214 m²","v","Cadastral sketch"],
  ["Plot area","1,180 m²","v","Cadastral sketch"],
  ["Bedrooms","4","v",""],
  ["Bathrooms","2","c","Read from the description, unconfirmed"],
  ["Year built","2007","c","Read from the description, unconfirmed"],
  ["Location","Katuntsi, Sandanski","v",""],
  ["Cadastral identifier","36693.501.114","v","Registry"],
  ["Energy class","C","v","Certificate, valid to 2033"],
  ["Heating","Not recorded","m","Nobody has confirmed this"],
  ["Parking","Not recorded","m","Nobody has confirmed this"],
  ["Furnishing","Not recorded","m","Nobody has confirmed this"],
].map(([label, value, kind, note]) => `            <div class="fact">
              <label>${label}<span class="src src--${kind}">${kind === "v" ? "verified" : kind === "c" ? "unconfirmed" : "missing"}</span></label>
              <span class="in${value.startsWith("Not") ? " in--empty" : ""}">${value}</span>
              ${note ? `<span class="hint">${note}</span>` : ""}
            </div>`).join("\n")}
          </div>
          <div class="savebar">
            <span style="font-size:12px" class="muted">A fact marked verified came from the registry, the
              certificate or the source page. Three fields have never been confirmed by anyone, and the public
              page omits them rather than guessing.</span>
          </div>
          <div class="panel-hd" style="border-top:1px solid var(--border)"><h2>Photos</h2><span class="sub">14 · 1 held</span></div>
          <div class="gal2">
            ${[1,2,3,4,5,6].map((i) => `<div class="ph2">${icon("image", 22)}${i === 3 ? '<span class="pill pill--warn" style="padding:1px 6px; font-size:9.5px">Held</span>' : i === 1 ? '<span class="pill pill--ink" style="padding:1px 6px; font-size:9.5px">Cover</span>' : ""}</div>`).join("")}
          </div>
        </section>
        <div style="display:grid; gap:16px">
          <section class="panel">
            <div class="panel-hd"><h2>Before it can be published</h2><span class="pill pill--ok"><i></i>Passed</span></div>
            <div class="side-sect" style="display:grid; gap:8px; font-size:12.5px">
              <div style="display:flex; gap:9px">${icon("check", 15)}<span>Price, area and location match the source page.</span></div>
              <div style="display:flex; gap:9px">${icon("check", 15)}<span>At least six photos, all reviewed.</span></div>
              <div style="display:flex; gap:9px">${icon("check", 15)}<span>Bulgarian description approved by a person.</span></div>
              <div style="display:flex; gap:9px; color:var(--warning-700)">${icon("alert", 15)}<span>Three facts unconfirmed — allowed, they stay off the page.</span></div>
              <div style="display:flex; gap:9px; color:var(--warning-700)">${icon("alert", 15)}<span>Publishing
                this listing also publishes its four photos that are still waiting for a review. They go out
                as approved_imported_photo without anyone opening them.</span></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Languages</h2><span class="sub">5 of 7</span></div>
            <div class="side-sect" style="padding-top:4px; padding-bottom:6px">
              ${[["BG","Source · approved","ok","Indexed"],["EN","Human · approved","ok","Indexed"],["DE","Human · approved","ok","Indexed"],["NL","Human · approved","ok","Indexed"],["RU","Human · approved","ok","Indexed"],["EL","Hermes draft","ai","Not indexed"],["HE","Not translated","sand","—"]]
                .map(([c, s, tone, state]) => `<div class="trow">
                  <span style="display:grid; place-items:center; height:19px; border-radius:var(--r-xs); background:var(--stone-200); color:var(--stone-700); font:700 9.5px var(--font-sans)">${c}</span>
                  <span>${s}</span><span class="pill pill--${tone}">${tone === "ai" ? icon("sparkles", 11) : "<i></i>"}${state}</span></div>`).join("")}
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Publication</h2></div>
            <div class="side-sect" style="display:grid; gap:8px; font-size:12.5px">
              <div style="display:flex; justify-content:space-between"><span>Public since</span><span class="muted">2 Aug 2026</span></div>
              <div style="display:flex; justify-content:space-between"><span>Approved by</span><span class="muted">Mariya Ruseva</span></div>
              <div style="display:flex; justify-content:space-between"><span>Legacy URL</span><span class="pill pill--ok"><i></i>200 kept</span></div>
              <div style="display:flex; justify-content:space-between"><span>In search index</span><span class="pill pill--ok"><i></i>Yes</span></div>
              <button class="btn btn--sm" type="button" style="margin-top:4px">Schedule a change</button>
            </div>
          </section>
        </div>
      </div>`;
fs.writeFileSync(W("ListingEditor.dc.html"), page({ active: "listings", body: LE_BODY, extraCss: LE_CSS, height: 990 }));

/* ------------------------------------------------------------ Translations */
const TR_CSS = `
    .diff { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0; border-top:1px solid var(--border); }
    .diff > div { padding:16px 20px; }
    .diff > div:first-child { border-right:1px solid var(--border); background:var(--stone-50); }
    .diff h4 { font-size:11.5px; font-weight:600; color:var(--text-muted); margin-bottom:9px;
      display:flex; align-items:center; justify-content:space-between; }
    .diff p { font-size:13px; line-height:1.6; color:var(--text-body); }
    .fact-lock { display:inline; background:var(--sea-50); border-bottom:1px solid var(--sea-200);
      padding:0 3px; font-weight:600; color:var(--sea-700); }
    .qrow { display:grid; grid-template-columns:auto minmax(0,1fr); gap:11px; align-items:center;
      padding:10px 16px; border-bottom:1px solid var(--border); }
    .qrow:last-child { border-bottom:0; }
    .qrow:hover { background:var(--stone-50); }
`;
const TR_BODY = `      <div class="ph">
        <div><h1>Translations</h1><p>Bulgarian is the source. A translation is indexed only when a person who reads that language has approved it.</p></div>
        <div class="ph-actions">
          <div class="seg"><button type="button" data-on="1">Needs approval <em>7</em></button><button type="button">Approved <em>1,148</em></button><button type="button">Stale <em>4</em></button></div>
          <button class="btn btn--primary" type="button">${icon("sparkles", 15)}<span>Draft the missing 96</span></button>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:340px minmax(0,1fr); gap:20px; align-items:start">
        <section class="panel">
          <div class="toolbar"><span class="find" style="width:auto; flex:1 1 auto">${icon("search", 14)}Listing or page</span>
            <button class="btn btn--sm" type="button">DE ${icon("down", 13)}</button></div>
${[
  ["Renovated village house","MS-CRAWL-0032 · DE", true],
  ["Studio near the mineral baths","MS-CRAWL-0087 · DE", false],
  ["Apartment with parking","MS-CRAWL-0071 · DE", false],
  ["Melnik location page","/lokacii/melnik · NL", false],
  ["Katuntsi location page","/lokacii/katuntsi · NL", false],
  ["Villa with a pool","MS-CRAWL-0114 · EL", false],
  ["Purchase fees guide","/rakovodstva/taksi · EL", false],
].map(([t, m, on]) => `          <div class="qrow"${on ? ' style="background:var(--surface); box-shadow:inset 3px 0 0 var(--brick-500)"' : ""}>
            <span class="av" style="background:var(--brick-50); color:var(--brick-700)">${icon("sparkles", 13)}</span>
            <span style="min-width:0"><b style="font-size:13px; font-weight:600; display:block; color:var(--text-strong)">${t}</b>
              <span style="font-size:11.5px" class="muted">${m}</span></span>
            </div>`).join("\n")}
          <div class="foot"><span>7 waiting</span><span class="mono">Oldest 3 days</span></div>
        </section>
        <section class="panel">
          <div class="panel-hd">
            <div><h2>Renovated village house with a garden</h2>
              <p class="sub"><span class="mono">MS-CRAWL-0032</span> · Bulgarian → German · drafted by Hermes 31 Aug 09:05</p></div>
            <div style="display:flex; gap:8px">
              <button class="btn btn--sm" type="button">Edit the German</button>
              <button class="btn btn--sm" type="button">Reject</button>
              <button class="btn btn--sm btn--primary" type="button">Approve and index</button>
            </div>
          </div>
          <div class="diff">
            <div>
              <h4>Bulgarian — approved source<span class="pill pill--ok"><i></i>Locked</span></h4>
              <p>Реновирана селска къща с двор в Катунци. Къщата е с
                <span class="fact-lock">96 кв. м</span> жилищна площ,
                <span class="fact-lock">три спални</span> и собствен двор.
                Цена: <span class="fact-lock">54 500 EUR</span>. Референция:
                <span class="fact-lock">MS-CRAWL-0032</span>.</p>
              <p style="margin-top:11px; font-size:11.5px" class="muted">Editing the source invalidates every
                translation drawn from it. The source hash is stored with each draft.</p>
            </div>
            <div>
              <h4>German — draft<span class="pill pill--ai">${icon("sparkles", 11)}Unpublished</span></h4>
              <p>Renoviertes Dorfhaus mit Garten in Katunzi. Das Haus hat
                <span class="fact-lock">96 m²</span> Wohnfläche,
                <span class="fact-lock">drei Schlafzimmer</span> und einen eigenen Garten.
                Preis: <span class="fact-lock">54.500 EUR</span>. Referenz:
                <span class="fact-lock">MS-CRAWL-0032</span>.</p>
              <div style="margin-top:12px; display:grid; gap:7px; font-size:12px">
                <div style="display:flex; gap:9px; color:var(--success-600)">${icon("check", 14)}<span>Every fact matches the source, field by field.</span></div>
                <div style="display:flex; gap:9px; color:var(--success-600)">${icon("check", 14)}<span>No claim was added that the Bulgarian does not make.</span></div>
                <div style="display:flex; gap:9px; color:var(--success-600)">${icon("check", 14)}<span>SEO title 54 characters, description 141.</span></div>
              </div>
            </div>
          </div>
          <div class="savebar"><span style="font-size:12px" class="muted">Approving puts your name on this text,
            makes it indexable in German, and adds it to the next sitemap build.</span></div>
        </section>
      </div>`;
fs.writeFileSync(W("Translations.dc.html"), page({ active: "translations", body: TR_BODY, extraCss: TR_CSS, height: 900 }));

console.log("ListingEditor, Translations");
