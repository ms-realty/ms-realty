import fs from "node:fs";
import { pubPage, pubHeader, pubFooter, icon } from "../public-shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

const CSS = `
    .fbar { border-bottom:1px solid var(--border); background:var(--surface); position:sticky; top:0; z-index:5; }
    .fbar-in { max-width:1240px; margin:0 auto; padding:14px 32px; display:flex; align-items:center;
      gap:10px; flex-wrap:wrap; }
    .fchip { display:inline-flex; align-items:center; gap:8px; height:46px; padding:0 15px;
      border:1px solid var(--border-control); border-radius:var(--r-md); background:var(--surface);
      font-size:14.5px; font-weight:600; color:var(--text-body); white-space:nowrap; }
    .fchip[data-on] { border-color:var(--ink-800); background:var(--ink-800); color:#fff; }
    .fchip[data-on] svg { color:#fff; }
    .fsearch { display:flex; align-items:center; gap:9px; height:46px; padding:0 14px; min-width:250px;
      border:1px solid var(--border-control); border-radius:var(--r-md); background:var(--surface);
      color:var(--text-muted); font-size:14.5px; flex:1 1 auto; }
    .applied { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:0 32px 14px;
      max-width:1240px; margin:0 auto; }
    .atag { display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 12px;
      border-radius:var(--r-full); background:var(--stone-100); font-size:13.5px; font-weight:600;
      color:var(--stone-700); }
    .split2 { display:grid; grid-template-columns:minmax(0,1fr) 486px; gap:0; align-items:stretch; }
    .results { padding:22px 32px 40px; }
    .rhead { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:18px; }
    .rgrid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }
    /* Sticky in the product; drawn full height here so the artboard shows the pairing. */
    .mapcol { border-left:1px solid var(--border);
      background:linear-gradient(140deg,#e7ecdf 0%,#dbe3d2 42%,#cfd9c5 100%); position:relative; overflow:hidden; }
    .mapcol::after { content:''; position:absolute; inset:0;
      background:repeating-linear-gradient(0deg, rgba(120,130,105,.16) 0 1px, transparent 1px 48px),
        repeating-linear-gradient(90deg, rgba(120,130,105,.16) 0 1px, transparent 1px 48px); }
    .mpin { position:absolute; z-index:2; display:inline-flex; align-items:center; height:32px; padding:0 11px;
      border-radius:var(--r-full); background:var(--surface); border:1px solid var(--border-control);
      font-size:13.5px; font-weight:600; color:var(--stone-900); box-shadow:var(--e-2); white-space:nowrap; }
    .mpin[data-on] { background:var(--ink-800); border-color:var(--ink-800); color:#fff; }
    .mtools { position:absolute; z-index:3; right:16px; top:16px; display:grid; gap:8px; }
    .mtool { display:grid; place-items:center; width:40px; height:40px; border-radius:var(--r-md);
      background:var(--surface); border:1px solid var(--border-control); color:var(--stone-900);
      box-shadow:var(--e-1); }
    .mdraw { position:absolute; z-index:3; left:16px; bottom:16px; display:inline-flex; align-items:center;
      gap:8px; height:42px; padding:0 15px; border-radius:var(--r-md); background:var(--surface);
      border:1px solid var(--border-control); font-size:14px; font-weight:600; box-shadow:var(--e-1); }
    .alertbar { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:14px; align-items:center;
      padding:16px 18px; border:1px solid var(--sea-200); border-radius:var(--r-lg);
      background:var(--sea-50); margin-bottom:20px; }
    .alertbar b { display:block; font-size:15.5px; font-weight:600; color:var(--sea-700); }
    .alertbar span { font-size:14px; color:var(--sea-700); }
`;

const CARD = (price, title, place, ref, beds, area, tag, tone, extra) => `          <article class="lcard">
            <div class="im">${tag ? `<span class="tag pill pill--${tone}"><i></i>${tag}</span>` : ""}
              <span class="fav">${icon("star", 18)}</span></div>
            <div class="bd">
              <span class="lprice">${price}</span>
              <h3>${title}</h3>
              <div class="lfacts"><span>${icon("map", 15)}${place}</span>
                <span>${icon("building", 15)}${beds}</span><span>${icon("crop", 15)}${area}</span></div>
              <div class="lfoot"><span class="mono">${ref}</span><span>${extra}</span></div>
            </div>
          </article>`;

const BODY = `${pubHeader("search")}

  <div class="fbar">
    <div class="fbar-in">
      <span class="fsearch">${icon("search", 17)}Сандански, Мелник или референция</span>
      <span class="fchip" data-on="1">Продажба ${icon("down", 15)}</span>
      <span class="fchip">Вид имот ${icon("down", 15)}</span>
      <span class="fchip">До 100 000 € ${icon("down", 15)}</span>
      <span class="fchip">Стаи ${icon("down", 15)}</span>
      <span class="fchip">Площ ${icon("down", 15)}</span>
      <span class="fchip">${icon("filter", 16)}Още филтри</span>
    </div>
    <div class="applied">
      <span class="atag">Сандански ${icon("x", 13)}</span>
      <span class="atag">Апартамент ${icon("x", 13)}</span>
      <span class="atag">До 100 000 € ${icon("x", 13)}</span>
      <span class="atag">Поне 2 спални ${icon("x", 13)}</span>
      <a href="#" style="font-size:13.5px; font-weight:600">Изчистете всички</a>
    </div>
  </div>

  <div class="split2">
    <div class="results">
      <div class="rhead">
        <div><h1 class="h2">Апартаменти в Сандански</h1>
          <p class="meta" style="margin-top:5px">18 обяви · всичките с проверени факти и одобрени снимки</p></div>
        <span class="fchip">Най-нови ${icon("down", 15)}</span>
      </div>

      <div class="alertbar">
        ${icon("bell", 22)}
        <span><b>Да ви пишем при нов такъв имот?</b>
          <span>Един имейл седмично, само за Сандански до 100 000 €. Спирате го с един клик.</span></span>
        <a class="pbtn" href="#">Запазете търсенето</a>
      </div>

      <div class="rgrid">
${CARD("68 000 €", "Двустаен апартамент с южна тераса", "Сандански, център", "MS-CRAWL-0001", "2 спални", "72 м²", "Нова", "ok", "Обновена днес")}
${CARD("72 400 €", "Апартамент с покрито паркомясто", "Сандански", "MS-CRAWL-0071", "2 спални", "84 м²", "", "", "Обновена преди 6 дни")}
${CARD("31 900 €", "Студио до минералните бани", "Сандански", "MS-CRAWL-0087", "1 спалня", "38 м²", "Намалена", "warn", "Обновена преди 3 дни")}
${CARD("54 500 €", "Тристаен след основен ремонт", "Сандански, Спортна", "MS-CRAWL-0112", "3 спални", "96 м²", "", "", "Обновена вчера")}
${CARD("89 000 €", "Мезонет с две тераси", "Сандански", "MS-CRAWL-0131", "3 спални", "118 м²", "360° тур", "sea", "Обновена преди 2 дни")}
${CARD("44 000 €", "Двустаен до парка", "Сандански", "MS-CRAWL-0147", "2 спални", "64 м²", "", "", "Обновена преди 8 дни")}
      </div>

      <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:26px">
        <p class="meta">Показани 6 от 18</p>
        <a class="pbtn" href="#">Покажете още 12 ${icon("down", 16)}</a>
      </div>

      <div style="margin-top:34px; padding:22px; border:1px solid var(--border); border-radius:var(--r-lg); background:var(--stone-50)">
        <h2 class="h3">Не намирате това, което търсите?</h2>
        <p style="font-size:15px; color:var(--text-body); margin-top:8px; max-width:640px">Част от имотите ни
          не са публикувани, защото собствениците не искат обява. Кажете какво търсите и брокер ще провери
          какво има в момента.</p>
        <div style="display:flex; gap:12px; margin-top:16px">
          <a class="pbtn pbtn--brand" href="#">Опишете какво търсите</a>
          <a class="pbtn" href="#">${icon("phone", 16)}Обадете се</a>
        </div>
      </div>
    </div>

    <div class="mapcol">
      <div class="mtools">
        <span class="mtool">${icon("plus", 18)}</span>
        <span class="mtool">${icon("focus", 18)}</span>
        <span class="mtool">${icon("layers", 18)}</span>
      </div>
      <span class="mpin" data-on="1" style="left:38%; top:32%">68 000 €</span>
      <span class="mpin" style="left:54%; top:26%">72 400 €</span>
      <span class="mpin" style="left:30%; top:47%">31 900 €</span>
      <span class="mpin" style="left:58%; top:52%">54 500 €</span>
      <span class="mpin" style="left:44%; top:64%">89 000 €</span>
      <span class="mpin" style="left:22%; top:60%">44 000 €</span>
      <span class="mpin" style="left:66%; top:71%">63 500 €</span>
      <span class="mdraw">${icon("crop", 16)}Начертайте район</span>
    </div>
  </div>
${pubFooter()}`;

fs.writeFileSync(W("PublicSearch.dc.html"), pubPage({ body: BODY, extraCss: CSS, height: 1720 }));
console.log("PublicSearch.dc.html");
