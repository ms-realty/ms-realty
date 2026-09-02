import fs from "node:fs";
import { pubPage, pubHeader, pubFooter, icon } from "../public-shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

const CSS = `
    .crumb { display:flex; align-items:center; gap:9px; padding:18px 0; font-size:14px; color:var(--text-muted); }
    .gal { display:grid; grid-template-columns:2fr 1fr 1fr; grid-template-rows:186px 186px; gap:10px; }
    .gp { position:relative; border-radius:var(--r-md); overflow:hidden;
      background:linear-gradient(155deg,#5f5544 0%,#8d7c5e 40%,#c4b394 72%,#7d6f56 100%); }
    .gp::after { content:''; position:absolute; inset:0;
      background:radial-gradient(110% 80% at 26% 20%, rgba(255,255,255,.2), transparent 56%),
        radial-gradient(90% 70% at 82% 86%, rgba(20,19,14,.32), transparent 60%),
        repeating-linear-gradient(115deg, rgba(255,255,255,.05) 0 2px, transparent 2px 15px); }
    .gp--main { grid-row:span 2; }
    .gp .btn-ov { position:absolute; z-index:1; right:12px; bottom:12px; display:flex; gap:8px; }
    .ovb { display:inline-flex; align-items:center; gap:7px; height:38px; padding:0 13px; border-radius:var(--r-md);
      background:rgba(255,255,255,.94); color:var(--stone-900); font-size:13.5px; font-weight:600; }
    .lay { display:grid; grid-template-columns:minmax(0,1fr) 372px; gap:38px; align-items:start; padding:30px 0 0; }
    .facts { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:1px; background:var(--border);
      border:1px solid var(--border); border-radius:var(--r-lg); overflow:hidden; }
    .facts > div { background:var(--surface); padding:16px 18px; }
    .facts dt { font-size:13.5px; color:var(--text-muted); margin-bottom:5px; }
    .facts dd { margin:0; font-size:17px; font-weight:600; color:var(--stone-900); }
    .blk { padding:30px 0; border-bottom:1px solid var(--border); }
    .blk h2 { margin-bottom:14px; }
    .blk p { font-size:16px; line-height:1.65; color:var(--text-body); }
    .speclist { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 32px; }
    .specrow { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:11px 0;
      border-bottom:1px solid var(--border); font-size:15px; }
    .specrow b { font-weight:600; color:var(--stone-900); }
    .mapbox { height:290px; border-radius:var(--r-lg); position:relative; overflow:hidden;
      background:linear-gradient(140deg,#e7ecdf 0%,#dbe3d2 40%,#cfd9c5 100%); }
    .mapbox::after { content:''; position:absolute; inset:0;
      background:repeating-linear-gradient(0deg, rgba(120,130,105,.18) 0 1px, transparent 1px 42px),
        repeating-linear-gradient(90deg, rgba(120,130,105,.18) 0 1px, transparent 1px 42px); }
    .pin2 { position:absolute; z-index:1; left:46%; top:44%; display:grid; place-items:center; width:42px;
      height:42px; border-radius:var(--r-full); background:var(--brick-600); color:#fff;
      box-shadow:0 4px 12px rgba(20,19,14,.28); }
    .radius { position:absolute; z-index:1; left:calc(46% - 76px); top:calc(44% - 76px); width:200px; height:200px;
      border-radius:var(--r-full); background:rgba(196,45,45,.1); border:1.5px dashed var(--brick-500); }
    .aside { position:sticky; top:20px; display:grid; gap:16px; }
    .pbox { border:1px solid var(--border); border-radius:var(--r-lg); background:var(--surface);
      box-shadow:var(--e-2); overflow:hidden; }
    .pbox-bd { padding:20px; display:grid; gap:14px; }
    .broker { display:flex; align-items:center; gap:13px; }
    .broker .av2 { width:52px; height:52px; border-radius:var(--r-full); background:var(--stone-200);
      display:grid; place-items:center; color:var(--stone-700); font-size:16px; font-weight:600; flex:0 0 auto; }
    .broker b { display:block; font-size:16px; font-weight:600; color:var(--stone-900); }
    .broker span { font-size:14px; color:var(--text-muted); }
    .intents { display:grid; gap:9px; }
    .prov { display:grid; gap:9px; font-size:14px; }
    .prov div { display:flex; align-items:flex-start; gap:9px; }
    .simil { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:22px; }
`;

const BODY = `${pubHeader("search")}
  <div class="pub-wrap">
    <div class="crumb"><a href="#">Имоти</a> ${icon("chevron", 14)} <a href="#">Сандански</a>
      ${icon("chevron", 14)} <a href="#">Катунци</a> ${icon("chevron", 14)}
      <b style="color:var(--stone-900)">Вила с басейн</b></div>

    <div class="gal">
      <div class="gp gp--main"><div class="btn-ov">
        <span class="ovb">${icon("image", 15)}14 снимки</span>
        <span class="ovb">${icon("play", 15)}360° тур</span></div></div>
      <div class="gp"></div><div class="gp"></div>
      <div class="gp"></div>
      <div class="gp"><div class="btn-ov"><span class="ovb">Всички снимки</span></div></div>
    </div>

    <div class="lay">
      <div>
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:24px">
          <div>
            <h1 class="h2" style="font-size:34px">Вила с басейн и изглед към планината</h1>
            <p class="lede" style="margin-top:8px">Катунци, община Сандански</p>
            <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:14px">
              <span class="trust">${icon("check", 15)}Фактите са сверени с документ</span>
              <span class="pill pill--sand"><i></i>Обновена днес</span>
              <span class="mono" style="font-size:13.5px">MS-CRAWL-0114</span>
            </div>
          </div>
          <div style="text-align:right">
            <div class="lprice" style="font-size:34px">185 000 €</div>
            <p class="meta" style="margin-top:4px">864 €/м² · без такси за купувача</p>
          </div>
        </div>

        <dl class="facts" style="margin-top:22px">
          <div><dt>Тип</dt><dd>Вила</dd></div>
          <div><dt>Застроена площ</dt><dd>214 м²</dd></div>
          <div><dt>Двор</dt><dd>1 180 м²</dd></div>
          <div><dt>Спални</dt><dd>4</dd></div>
        </dl>

        <div class="blk">
          <h2 class="h3">За имота</h2>
          <p>Двуетажна вила в края на Катунци, на 14 км от Сандански. Собствен двор с басейн, лятна кухня
            и гараж за две коли. Първият етаж е с дневна, кухня и баня; на втория има четири спални и две
            бани. Отоплението е на климатици и камина.</p>
          <p style="margin-top:12px">Имотът е с изградена канализация и собствен сондаж. Асфалтов път до
            входа. Училище и магазин в селото, а до най-близката болница в Сандански се стига за 20 минути.</p>
        </div>

        <div class="blk">
          <h2 class="h3">Подробности</h2>
          <div class="speclist">
            <div class="specrow"><span>Година на строеж</span><b>2007</b></div>
            <div class="specrow"><span>Етажи</span><b>2</b></div>
            <div class="specrow"><span>Бани</span><b>2</b></div>
            <div class="specrow"><span>Енергиен клас</span><b>C · валиден до 2033</b></div>
            <div class="specrow"><span>Кадастрален идентификатор</span><b class="mono" style="font-size:13.5px">36693.501.114</b></div>
            <div class="specrow"><span>Отопление</span><b class="muted" style="font-weight:500">Не е потвърдено</b></div>
            <div class="specrow"><span>Паркиране</span><b class="muted" style="font-weight:500">Не е потвърдено</b></div>
            <div class="specrow"><span>Обзавеждане</span><b class="muted" style="font-weight:500">Не е потвърдено</b></div>
          </div>
          <p class="meta" style="margin-top:14px">${icon("alert", 14)} Показваме само това, което е потвърдено.
            Три полета още не са проверени и затова стоят празни, вместо да гадаем.</p>
        </div>

        <div class="blk">
          <h2 class="h3">Къде се намира</h2>
          <div class="mapbox">
            <div class="radius"></div>
            <div class="pin2">${icon("map", 20)}</div>
          </div>
          <p class="meta" style="margin-top:12px">${icon("shield", 14)} Точният адрес се дава при огледа.
            Кръгът показва района с точност до 300 метра.</p>
          <div style="display:flex; flex-wrap:wrap; gap:22px; margin-top:16px; font-size:15px">
            <span>${icon("building", 15)} Магазин — 400 м</span>
            <span>${icon("users", 15)} Училище — 700 м</span>
            <span>${icon("route", 15)} Сандански — 14 км</span>
            <span>${icon("map", 15)} Границата с Гърция — 22 км</span>
          </div>
        </div>

        <div class="blk" style="border-bottom:0">
          <h2 class="h3">Разходи при покупка</h2>
          <div class="speclist" style="grid-template-columns:minmax(0,1fr)">
            <div class="specrow"><span>Местен данък при придобиване (Сандански, 2,6%)</span><b>4 810 €</b></div>
            <div class="specrow"><span>Нотариална такса и вписване</span><b>около 1 300 €</b></div>
            <div class="specrow"><span>Заклет преводач, ако е нужен</span><b>около 250 €</b></div>
            <div class="specrow"><span>Хонорар на агенцията</span><b>3% + ДДС</b></div>
          </div>
          <p class="meta" style="margin-top:12px">Ориентировъчно и за този имот. Точните суми се потвърждават
            от нотариуса. <a href="#" style="font-weight:600">Пълното ръководство за разходите</a>.</p>
        </div>
      </div>

      <aside class="aside">
        <div class="pbox"><div class="pbox-bd">
          <div class="broker">
            <span class="av2">МР</span>
            <span><b>Мария Русева</b><span>Брокер · говори БГ, RU, EN</span></span>
          </div>
          <div class="intents">
            <a class="pbtn pbtn--accent pbtn--lg" href="#">${icon("calendar", 18)}Запишете оглед</a>
            <a class="pbtn" href="#">${icon("phone", 17)}Обадете ми се</a>
            <a class="pbtn" href="#">${icon("mail", 17)}Задайте въпрос за имота</a>
          </div>
          <p class="meta">Отговаряме до 4 часа в работен ден. Огледите се предлагат от реалния календар,
            а не като „ще се свържем с вас“.</p>
        </div></div>

        <div class="pbox"><div class="pbox-bd">
          <b style="font-size:15px; font-weight:600; color:var(--stone-900)">Откъде знаем тези факти</b>
          <div class="prov">
            <div>${icon("check", 16)}<span>Площ и кадастрален номер — от кадастралната скица, 22 юли 2026</span></div>
            <div>${icon("check", 16)}<span>Тежести — от справка в имотния регистър, 24 юли 2026</span></div>
            <div>${icon("check", 16)}<span>Енергиен клас — от сертификата, валиден до 2033</span></div>
            <div>${icon("check", 16)}<span>Цената е потвърдена от собственика на 4 август 2026</span></div>
          </div>
          <p class="meta">Обявата е одобрена от Мария Русева. Снимките са прегледани една по една.</p>
        </div></div>

        <div class="pbox"><div class="pbox-bd">
          <b style="font-size:15px; font-weight:600; color:var(--stone-900)">Запазете търсенето</b>
          <p style="font-size:14.5px; color:var(--text-body)">Ще ви пишем, когато излезе подобен имот в
            Катунци до 200 000 €. Един имейл седмично, спирате го с един клик.</p>
          <span class="pin">вашият@имейл.bg</span>
          <a class="pbtn pbtn--brand" href="#">Запазете търсенето</a>
          <p class="meta">С това се съгласявате да ви пишем само за тези обяви.
            <a href="#" style="font-weight:600">Поверителност</a>.</p>
        </div></div>
      </aside>
    </div>

    <section class="sec">
      <div class="sec-hd"><div><h2 class="h2">Подобни имоти</h2>
        <p class="meta" style="margin-top:6px">В Катунци и околността, до 220 000 €.</p></div>
        <a class="pbtn" href="#">Вижте всички ${icon("arrow", 16)}</a></div>
      <div class="simil">
${[["139 000 €","Къща с двор и лозе","Катунци","MS-CRAWL-0044","3 спални","168 м²"],
   ["96 000 €","Двуетажна къща след ремонт","Хотово","MS-CRAWL-0092","3 спални","142 м²"],
   ["210 000 €","Нова къща с изглед към Пирин","Сандански","MS-CRAWL-0158","4 спални","232 м²"]]
  .map(([p, t, loc, ref, b, a]) => `        <article class="lcard">
          <div class="im"><span class="fav">${icon("star", 18)}</span></div>
          <div class="bd"><span class="lprice">${p}</span><h3>${t}</h3>
            <div class="lfacts"><span>${icon("map", 15)}${loc}</span><span>${icon("building", 15)}${b}</span><span>${icon("crop", 15)}${a}</span></div>
            <div class="lfoot"><span class="mono">${ref}</span><span>Проверена</span></div></div>
        </article>`).join("\n")}
      </div>
    </section>
  </div>
${pubFooter()}`;

fs.writeFileSync(W("PublicListing.dc.html"), pubPage({ body: BODY, extraCss: CSS, height: 2900 }));
console.log("PublicListing.dc.html");
