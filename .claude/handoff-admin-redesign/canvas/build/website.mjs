import fs from "node:fs";
import { page, icon, subnav } from "../shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

const SITE_NAV = (on) => subnav([
  ["Pages", "tree", on === "pages"], ["Area guides", "map", on === "guides"], ["News", "file", on === "news"],
  ["Navigation", "list", on === "nav"], ["Forms", "form", on === "forms"], ["Media", "image", on === "media"],
  ["SEO and redirects", "route", on === "seo"],
]);

const LOC = ["BG","EN","DE","NL","RU","EL","HE"];
function locBar(states) {
  return `<span style="display:flex; gap:3px">${LOC.map((c, i) => {
    const s = states[i];
    const style = s === 2 ? "background:var(--success-50); color:var(--success-600)"
      : s === 1 ? "background:var(--warning-50); color:var(--warning-700)"
      : "background:transparent; border:1px dashed var(--border-control); color:var(--text-muted)";
    return `<span style="display:grid; place-items:center; min-width:23px; height:18px; padding:0 4px; border-radius:var(--r-xs); font:700 9.5px var(--font-sans); ${style}">${c}</span>`;
  }).join("")}</span>`;
}

/* -------------------------------------------------------------- Site pages */
const PG_CSS = `
    .tr { display:grid; grid-template-columns:minmax(0,1fr) 250px 190px 150px 112px; gap:14px; align-items:center;
      padding:10px 16px; border-bottom:1px solid var(--border); }
    .tr:last-child { border-bottom:0; }
    .tr--hd { padding:9px 16px; background:var(--stone-50); font-size:11px; font-weight:600;
      letter-spacing:.02em; color:var(--text-muted); }
    .tr--hd:hover { background:var(--stone-50); }
    .tr:hover { background:var(--stone-50); }
    .tr-name { display:flex; align-items:center; gap:9px; min-width:0; }
    .tr-name b { font-size:13px; font-weight:600; color:var(--text-strong); }
    .tr-name span.p { font-family:var(--font-mono); font-size:11.5px; color:var(--text-muted); }
    .ind { display:inline-block; }
    .newnote { display:grid; grid-template-columns:auto minmax(0,1fr); gap:10px; padding:12px 16px;
      background:var(--sea-50); border-bottom:1px solid var(--sea-100); color:var(--sea-700); font-size:12.5px; }
`;
const PG_BODY = `      <div class="ph">
        <div><h1>Website</h1><p>Every page the public site serves, in all seven languages. Bulgarian is the source; nothing is indexed in another language until a person approves it.</p></div>
        <div class="ph-actions">
          <button class="btn" type="button">${icon("eye", 15)}<span>Preview the site</span></button>
          <button class="btn btn--primary" type="button">${icon("plus", 15)}<span>New page</span></button>
        </div>
      </div>
      ${SITE_NAV("pages")}
      <section class="panel">
        <div class="toolbar">
          <span class="find">${icon("search", 14)}Page title or path</span>
          <button class="btn btn--sm" type="button">Any type ${icon("down", 13)}</button>
          <button class="btn btn--sm" type="button">Any language ${icon("down", 13)}</button>
          <button class="btn btn--sm" type="button">Needs approval ${icon("down", 13)}</button>
          <span style="margin-left:auto" class="mono">39 pages · 204 localised routes</span>
        </div>
        <div class="newnote">${icon("alert", 16)}
          <span><b>Home, search, seller and contact are still template copy.</b> Their text lives in the
            renderer rather than in this CMS, so editing them here is the change this section exists to make.
            The listing catalogue and the guides already round-trip.</span></div>
        <div class="tr tr--hd"><span>Page</span><span>Languages</span><span>Type</span><span>Updated</span><span>State</span></div>
${[
  [0,"Home","/{locale}","home",[2,2,2,2,2,1,1],"Landing","Mariya · 12 Aug","Published","ok"],
  [0,"Property search","/{locale}/tarsene","search",[2,2,2,2,2,1,0],"Search","Mariya · 12 Aug","Published","ok"],
  [0,"Sell with us","/{locale}/prodai","seller",[2,2,2,1,2,0,0],"Landing","Petar · 3 Aug","Published","ok"],
  [0,"Contact","/{locale}/kontakt","contact",[2,2,2,2,2,2,2],"Contact","Mariya · 28 Aug","Published","ok"],
  [0,"Locations","/{locale}/lokacii","location",[2,2,2,1,2,0,0],"Index","Mariya · 19 Aug","Published","ok"],
  [1,"Sandanski","/{locale}/lokacii/sandanski","location",[2,2,2,1,2,0,0],"Location","Mariya · 19 Aug","Published","ok"],
  [1,"Melnik","/{locale}/lokacii/melnik","location",[2,2,1,0,2,0,0],"Location","Hermes draft","2 awaiting approval","warn"],
  [1,"Katuntsi","/{locale}/lokacii/katuntsi","location",[2,1,0,0,1,0,0],"Location","Hermes draft","3 awaiting approval","warn"],
  [0,"Buying in Bulgaria as a foreigner","/{locale}/rakovodstva/chuzhdenci","guide",[2,2,2,2,2,0,0],"Guide","Lawyer-reviewed · 29 Jul","Published","ok"],
  [0,"Purchase fees and taxes","/{locale}/rakovodstva/taksi","guide",[2,2,1,0,2,0,0],"Guide","Needs a legal re-read","Held","warn"],
  [0,"Privacy notice","/{locale}/poveritelnost","legal",[2,2,2,2,2,2,2],"Legal","Lawyer · 14 Jun","Published","ok"],
  [0,"Terms of use","/{locale}/usloviya","legal",[2,2,2,2,2,2,2],"Legal","Lawyer · 14 Jun","Published","ok"],
].map(([depth, name, path, kind, locs, type, updated, state, tone]) => `        <div class="tr">
          <span class="tr-name"><span class="ind" style="width:${depth * 18}px"></span>${icon(depth ? "file" : kind === "guide" ? "map" : kind === "legal" ? "shield" : "globe", 16)}
            <span style="min-width:0"><b>${name}</b> <span class="p">${path}</span></span></span>
          <span>${locBar(locs)}</span>
          <span style="font-size:12px" class="muted">${type}</span>
          <span style="font-size:12px" class="muted">${updated}</span>
          <span><span class="pill pill--${tone}"><i></i>${state}</span></span>
        </div>`).join("\n")}
        <div class="foot"><span>Legend: solid = approved and indexed · amber = drafted, not approved · dashed = not translated</span>
          <button class="btn btn--sm" type="button">Show all 39</button></div>
      </section>`;
fs.writeFileSync(W("SitePages.dc.html"), page({ active: "website", body: PG_BODY, extraCss: PG_CSS, height: 960 }));

/* ------------------------------------------------------------- Page editor */
const PE_CSS = `
    .blocks { display:grid; gap:10px; padding:16px; background:var(--stone-100); }
    .blk { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md); overflow:hidden; }
    .blk-hd { display:flex; align-items:center; gap:9px; padding:8px 12px; border-bottom:1px solid var(--border);
      background:var(--stone-50); }
    .blk-hd b { font-size:11.5px; font-weight:600; color:var(--text-muted); flex:1 1 auto; }
    .blk-bd { padding:14px 16px; }
    .blk-bd h3 { font-family:var(--font-display); font-size:22px; font-weight:600; letter-spacing:-.015em; }
    .blk-bd p { font-size:13px; color:var(--text-body); margin-top:7px; }
    .drag { color:var(--text-muted); cursor:grab; }
    .add { display:flex; align-items:center; justify-content:center; gap:8px; padding:13px;
      border:1px dashed var(--border-control); border-radius:var(--r-md); color:var(--text-muted);
      font-size:12.5px; font-weight:600; background:var(--surface); }
    .cards3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
    .cards3 div { border:1px solid var(--border); border-radius:var(--r-sm); padding:10px; font-size:12px; }
    .side-sect { padding:14px 16px; border-bottom:1px solid var(--border); }
    .side-sect:last-child { border-bottom:0; }
    .side-sect > b { display:block; font-size:12.5px; margin-bottom:9px; }
    .locrow { display:grid; grid-template-columns:34px minmax(0,1fr) auto; gap:10px; align-items:center;
      padding:7px 0; border-bottom:1px solid var(--border); font-size:12.5px; }
    .locrow:last-child { border-bottom:0; }
`;
const PE_BODY = `      <div class="crumbs" style="display:flex; align-items:center; gap:7px; font-size:12px; color:var(--text-muted); margin-bottom:10px">
        <a href="#">Website</a> ${icon("chevron", 13)} <a href="#">Pages</a> ${icon("chevron", 13)}
        <b style="color:var(--text-strong)">Sell with us</b>
      </div>
      <div class="ph">
        <div><h1>Sell with us</h1><p><span class="mono">/bg/prodai</span> · source language Bulgarian · last published 3 August by Petar</p></div>
        <div class="ph-actions">
          <button class="btn btn--sm" type="button">BG ${icon("down", 13)}</button>
          <button class="btn" type="button">${icon("eye", 15)}<span>Preview</span></button>
          <button class="btn" type="button">${icon("history", 15)}<span>Versions</span></button>
          <button class="btn btn--primary" type="button">Publish</button>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:minmax(0,1fr) 348px; gap:20px; align-items:start">
        <section class="panel">
          <nav class="tabs" style="padding:0 16px"><a href="#" data-on="1">Content</a><a href="#">SEO</a><a href="#">Settings</a><a href="#">History</a></nav>
          <div class="blocks">
            <div class="blk">
              <div class="blk-hd">${icon("grid", 14)}<b>Hero</b><span class="pill pill--sand">Required</span><span class="drag">${icon("list", 14)}</span></div>
              <div class="blk-bd">
                <h3>Продайте имота си в Сандански с брокер, който вдига телефона</h3>
                <p>Безплатна оценка на място в рамките на два работни дни. Договор за посредничество без
                  скрити такси и с ясен срок.</p>
                <div style="display:flex; gap:8px; margin-top:11px">
                  <span class="btn btn--sm btn--accent">Заявете оценка</span>
                  <span class="btn btn--sm">Вижте как работим</span>
                </div>
              </div>
            </div>
            <div class="blk">
              <div class="blk-hd">${icon("layers", 14)}<b>Three steps</b><span class="drag">${icon("list", 14)}</span></div>
              <div class="blk-bd"><div class="cards3">
                <div><b>1. Оценка</b><p style="margin-top:4px; font-size:11.5px; color:var(--text-muted)">Идваме на място, снимаме и даваме реалистична цена.</p></div>
                <div><b>2. Подготовка</b><p style="margin-top:4px; font-size:11.5px; color:var(--text-muted)">Проверяваме документите и подготвяме обявата на пет езика.</p></div>
                <div><b>3. Сделка</b><p style="margin-top:4px; font-size:11.5px; color:var(--text-muted)">Организираме огледите и водим сделката до нотариуса.</p></div>
              </div></div>
            </div>
            <div class="blk">
              <div class="blk-hd">${icon("form", 14)}<b>Valuation form</b><span class="pill pill--sea"><i></i>Creates a seller lead</span><span class="drag">${icon("list", 14)}</span></div>
              <div class="blk-bd" style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px">
                <span class="in in--empty">Име</span><span class="in in--empty">Телефон</span>
                <span class="in in--empty" style="grid-column:1/-1">Адрес на имота</span>
                <span style="grid-column:1/-1; font-size:11.5px; color:var(--text-muted)">Consent checkbox and privacy link are added automatically and cannot be removed.</span>
              </div>
            </div>
            <div class="blk">
              <div class="blk-hd">${icon("building", 14)}<b>Recently sold</b><span class="pill pill--sand">Pulls from the catalogue</span><span class="drag">${icon("list", 14)}</span></div>
              <div class="blk-bd"><p style="font-size:12.5px; color:var(--text-muted)">Shows the last four
                completed sales with an approved public record. Nothing to configure — it follows the catalogue.</p></div>
            </div>
            <div class="add">${icon("plus", 15)}Add a block</div>
          </div>
        </section>
        <div style="display:grid; gap:16px">
          <section class="panel">
            <div class="panel-hd"><h2>Languages</h2><span class="sub">5 of 7</span></div>
            <div class="side-sect" style="padding-top:4px; padding-bottom:6px">
              ${[
                ["BG","Source","ok","Published"],
                ["EN","Human, approved","ok","Published"],
                ["DE","Human, approved","ok","Published"],
                ["NL","Hermes draft","ai","Needs approval"],
                ["RU","Human, approved","ok","Published"],
                ["EL","Not translated","sand","—"],
                ["HE","Not translated","sand","—"],
              ].map(([c, s, tone, state]) => `<div class="locrow">
                <span style="display:grid; place-items:center; height:19px; border-radius:var(--r-xs); background:var(--stone-200); color:var(--stone-700); font:700 9.5px var(--font-sans)">${c}</span>
                <span><b style="font-weight:600">${s}</b></span>
                <span class="pill pill--${tone}">${tone === "ai" ? icon("sparkles", 11) : "<i></i>"}${state}</span></div>`).join("")}
            </div>
            <div class="savebar"><button class="btn btn--sm" type="button">${icon("sparkles", 13)}<span>Draft the missing two</span></button></div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Search appearance</h2></div>
            <div class="side-sect">
              <p style="font-size:12px; color:var(--sea-700); font-family:var(--font-mono)">ms-realty.bg › prodai</p>
              <p style="font-size:15px; color:#1a0dab; margin-top:3px">Продажба на имот в Сандански — MS Realty</p>
              <p style="font-size:12px; color:var(--text-muted); margin-top:3px">Безплатна оценка на място за два
                работни дни. Договор без скрити такси. Семейна агенция в Сандански от 2011 г.</p>
              <div style="display:flex; gap:6px; margin-top:9px">
                <span class="pill pill--ok"><i></i>Title 52 of 60</span><span class="pill pill--ok"><i></i>Description 148 of 160</span></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Before publishing</h2></div>
            <div class="side-sect" style="display:grid; gap:8px; font-size:12.5px">
              <div style="display:flex; gap:9px">${icon("check", 15)}<span>The Dutch draft is unapproved and will not be indexed.</span></div>
              <div style="display:flex; gap:9px">${icon("check", 15)}<span>No claim on this page requires a legal review.</span></div>
              <div style="display:flex; gap:9px">${icon("check", 15)}<span>The path has not changed, so no redirect is needed.</span></div>
            </div>
          </section>
        </div>
      </div>`;
fs.writeFileSync(W("PageEditor.dc.html"), page({ active: "website", body: PE_BODY, extraCss: PE_CSS, height: 1140 }));

/* Media now lives in build/media.mjs — it owns the library, the editor and the
   states, and this file must not write Media.dc.html a second time. */

/* -------------------------------------------------------- SEO + redirects */
const SEO_BODY = `      <div class="ph">
        <div><h1>SEO and redirects</h1><p>Thirteen years of indexed URLs are the asset. Every legacy address needs one deliberate outcome before launch — 38 are still undecided.</p></div>
        <div class="ph-actions">
          <button class="btn" type="button">${icon("download", 15)}<span>Export approvals</span></button>
          <button class="btn btn--primary" type="button">${icon("route", 15)}<span>Build redirect file</span></button>
        </div>
      </div>
      ${SITE_NAV("seo")}
      <div style="display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:20px; align-items:start">
        <section class="panel">
          <div class="toolbar">
            <span class="find">${icon("search", 14)}Legacy URL</span>
            <div class="seg" style="background:transparent; padding:0">
              <button type="button" data-on="1">Undecided <em>38</em></button>
              <button type="button">Keep 200 <em>171</em></button>
              <button type="button">Redirect 301 <em>224</em></button>
              <button type="button">Gone 410 <em>24</em></button>
            </div>
            <span style="margin-left:auto" class="mono">457 total</span>
          </div>
          <table>
            <thead><tr><th>Legacy URL</th><th>What it was</th><th>Evidence</th><th>Proposed</th><th>Decision</th></tr></thead>
            <tbody>
${[
  ["makler-realty.ru/obj/4412.html","Listing · sold 2019","Crawl + archive","301 → /ru/imoti/sandanski","Hermes proposal"],
  ["makler-realty.com/obj/2210.html","Listing · source unavailable","Crawl only","410 gone","Hermes proposal"],
  ["makler-realty.ru/news/2014/03/","News index · 11 posts","Crawl + archive","410 gone","Needs a person"],
  ["makler-realty.com/uslugi.html","Services page","Crawl + archive","301 → /bg/prodai","Hermes proposal"],
  ["makler-realty.ru/kontakty.html","Contact","Crawl + archive","301 → /ru/kontakt","Hermes proposal"],
  ["makler-realty.com/obj/0114.html","Listing · still active","Crawl + catalogue","200 keep · preservation page","Needs a person"],
].map(([url, was, ev, prop, who]) => `              <tr>
                <td><span class="mono" style="white-space:normal">${url}</span></td>
                <td class="muted">${was}</td>
                <td class="muted">${ev}</td>
                <td><b style="font-size:12.5px">${prop}</b><span style="display:block; font-size:11.5px" class="muted">${who}</span></td>
                <td style="text-align:right"><span style="display:flex; gap:6px; justify-content:flex-end">
                  <button class="btn btn--sm btn--primary" type="button">Approve</button>
                  <button class="btn btn--sm" type="button">Change</button></span></td>
              </tr>`).join("\n")}
            </tbody>
          </table>
          <div class="savebar"><span style="font-size:12px" class="muted">A redirect file is only built from approved decisions. An unapproved proposal never reaches production.</span></div>
        </section>
        <div style="display:grid; gap:16px">
          <section class="panel">
            <div class="panel-hd"><h2>Launch gate</h2><span class="pill pill--warn"><i></i>Blocked</span></div>
            <div class="sect" style="display:grid; gap:9px; font-size:12.5px">
              <div style="display:flex; justify-content:space-between"><span>URLs with a decision</span><b>419 of 457</b></div>
              <div class="prog" style="height:6px; border-radius:99px; background:var(--stone-200); overflow:hidden"><i style="display:block; height:100%; width:92%; background:var(--success-500)"></i></div>
              <div class="note note--warn" style="margin-top:3px">${icon("alert", 14)}<span>Launch stays blocked until all 457 have a terminal outcome.</span></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Search evidence</h2><a href="#" style="font-size:12.5px; font-weight:600">Import</a></div>
            <div class="sect" style="display:grid; gap:8px; font-size:12.5px">
              <div style="display:flex; justify-content:space-between"><span>Google Search Console</span><span class="pill pill--warn"><i></i>Not verified</span></div>
              <div style="display:flex; justify-content:space-between"><span>Yandex Webmaster</span><span class="pill pill--warn"><i></i>Not verified</span></div>
              <div style="display:flex; justify-content:space-between"><span>Sitemap submitted</span><span class="pill pill--sand"><i></i>After cutover</span></div>
              <div style="display:flex; justify-content:space-between"><span>Crawl parity report</span><span class="pill pill--ok"><i></i>Passing</span></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Structured data</h2></div>
            <div class="sect" style="display:grid; gap:8px; font-size:12.5px">
              <div style="display:flex; justify-content:space-between"><span>RealEstateListing</span><span class="pill pill--ok"><i></i>84 valid</span></div>
              <div style="display:flex; justify-content:space-between"><span>RealEstateAgent</span><span class="pill pill--ok"><i></i>Valid</span></div>
              <div style="display:flex; justify-content:space-between"><span>BreadcrumbList</span><span class="pill pill--ok"><i></i>Valid</span></div>
              <div style="display:flex; justify-content:space-between"><span>FAQPage on guides</span><span class="pill pill--warn"><i></i>2 with unapproved answers</span></div>
            </div>
          </section>
        </div>
      </div>`;
fs.writeFileSync(W("SeoRedirects.dc.html"), page({ active: "website", body: SEO_BODY, height: 960 }));

console.log("SitePages, PageEditor, SeoRedirects");
