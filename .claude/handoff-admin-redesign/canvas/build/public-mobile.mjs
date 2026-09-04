import fs from "node:fs";
import { pubPage, icon } from "../public-shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

const CSS = `
    .m { width:390px; min-height:844px; background:var(--surface); display:flex; flex-direction:column; }
    .mtop { display:flex; align-items:center; gap:12px; padding:16px 16px; border-bottom:1px solid var(--border); }
    .mtop img { display:block; height:30px; width:auto; }
    .mic { display:grid; place-items:center; width:44px; height:44px; border-radius:var(--r-panel);
      border:1px solid var(--border); background:var(--surface); color:var(--text-body); flex:0 0 auto; }
    .mcall { display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px;
      border-radius:var(--r-panel); background:var(--brick-600); color:#fff; flex:0 0 auto; }
    .mbody { flex:1 1 auto; display:grid; gap:16px; padding:16px; align-content:start; }
    .msearch { display:grid; gap:8px; padding:16px; border-radius:var(--r-lg); background:var(--tile-deep); }
    .mfield { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:50px;
      padding:0 16px; border-radius:var(--r-md); background:var(--surface); border:1px solid var(--border-control);
      font-size:16px; font-weight:600; color:var(--marble-900); }
    .mbtn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:50px;
      padding:0 20px; border-radius:var(--r-md); background:var(--brick-600); color:#fff; font-size:16px;
      font-weight:600; border:1px solid var(--brick-600); }
    .mbtn--g { background:var(--surface); border-color:var(--border-control); color:var(--marble-900); }
    .mbtn--d { background:var(--ink-800); border-color:var(--ink-800); color:#fff; }
    .mchips { display:flex; gap:8px; overflow:hidden; }
    .mchip { display:inline-flex; align-items:center; gap:8px; height:40px; padding:0 16px; border-radius:var(--r-pill);
      border:1px solid var(--border); background:var(--surface); font-size:13px; font-weight:600;
      color:var(--text-body); white-space:nowrap; }
    .mchip[data-on] { background:var(--ink-800); border-color:var(--ink-800); color:#fff; }
    .mcard { border:1px solid var(--border); border-radius:var(--r-lg); overflow:hidden; background:var(--surface); }
    .mcard .im { height:184px; position:relative;
      background:linear-gradient(155deg,#6f6350 0%,#9b8a6b 44%,#c4b394 74%,#8d7c5e 100%); }
    .mcard .im::after { content:''; position:absolute; inset:0;
      background:radial-gradient(110% 80% at 28% 22%, rgba(255,255,255,.18), transparent 58%),
        repeating-linear-gradient(115deg, rgba(255,255,255,.05) 0 2px, transparent 2px 15px); }
    .mcard .tag { position:absolute; z-index:1; top:12px; left:12px; }
    .mcard .fav { position:absolute; z-index:1; top:10px; right:10px; display:grid; place-items:center;
      width:44px; height:44px; border-radius:var(--r-pill); background:rgba(255,255,255,.94); color:var(--ink-800); }
    .mcard .bd { padding:16px 16px 16px; display:grid; gap:8px; }
    .mcard .p { font-family:var(--font-display); font-size:22px; font-weight:600; color:var(--marble-900); }
    .mcard h3 { font-size:16px; font-weight:600; color:var(--marble-900); line-height:1.35; }
    .mfacts { display:flex; flex-wrap:wrap; gap:12px; font-size:13px; color:var(--text-muted); }
    .mfacts span { display:inline-flex; align-items:center; gap:8px; }
    .mtabs { margin-top:auto; display:grid; grid-template-columns:repeat(4,1fr); gap:4px;
      padding:8px 8px 24px; background:var(--surface); border-top:1px solid var(--border); }
    .mtab { display:grid; justify-items:center; gap:4px; min-height:54px; padding:8px 4px; border-radius:var(--r-panel);
      color:var(--text-muted); font-size:11px; font-weight:600; }
    .mtab[data-on] { color:var(--marble-900); }
    .mtab[data-on] svg { color:var(--brick-600); }
    .mbar { position:sticky; bottom:0; display:flex; gap:12px; padding:12px 16px 20px;
      background:rgba(255,255,255,.96); border-top:1px solid var(--border); }
    .mgal { position:relative; height:262px;
      background:linear-gradient(155deg,#5f5544 0%,#8d7c5e 40%,#c4b394 72%,#7d6f56 100%); }
    .mgal::after { content:''; position:absolute; inset:0;
      background:radial-gradient(110% 80% at 26% 20%, rgba(255,255,255,.2), transparent 56%),
        repeating-linear-gradient(115deg, rgba(255,255,255,.05) 0 2px, transparent 2px 15px); }
    .mgal .cnt { position:absolute; z-index:1; right:12px; bottom:12px; display:inline-flex; align-items:center;
      gap:8px; height:34px; padding:0 12px; border-radius:var(--r-md); background:rgba(255,255,255,.94);
      font-size:13px; font-weight:600; color:var(--marble-900); }
    .mgal .back { position:absolute; z-index:1; left:12px; top:12px; display:grid; place-items:center;
      width:44px; height:44px; border-radius:var(--r-pill); background:rgba(255,255,255,.94); color:var(--marble-900); }
    .mkv { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:4px; background:var(--border);
      border:1px solid var(--border); border-radius:var(--r-md); overflow:hidden; }
    .mkv > div { background:var(--surface); padding:12px 16px; }
    .mkv dt { font-size:13px; color:var(--text-muted); margin-bottom:4px; }
    .mkv dd { margin:0; font-size:16px; font-weight:600; color:var(--marble-900); }
`;

const wrap = (body, dir = "ltr") => pubPage({ body, extraCss: CSS, width: 390, height: 844, dir });

/* ------------------------------------------------------------- Phone: search */
const SEARCH = `<div class="m">
  <div class="mtop">
    <img src="ms-realty-logo.png" alt="MS Realty" width="59" height="30" />
    <span style="flex:1 1 auto"></span>
    <span class="mic">${icon("globe", 19)}</span>
    <a class="mcall" href="#">${icon("phone", 19)}</a>
  </div>
  <div class="mbody">
    <div class="msearch">
      <span class="mfield">Сандански ${icon("down", 17)}</span>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px">
        <span class="mfield">Апартамент ${icon("down", 17)}</span>
        <span class="mfield">До 100 000 € ${icon("down", 17)}</span>
      </div>
      <span class="mbtn">${icon("search", 18)}Търсене</span>
    </div>
    <div class="mchips">
      <span class="mchip" data-on="1">Карта</span>
      <span class="mchip">${icon("filter", 15)}Филтри</span>
      <span class="mchip">Най-нови</span>
    </div>
    <p class="meta" style="font-size:13px">18 обяви в Сандански</p>

    <article class="mcard">
      <div class="im"><span class="tag pill pill--ok"><i></i>Нова</span><span class="fav">${icon("star", 19)}</span></div>
      <div class="bd"><span class="p">68 000 €</span>
        <h3>Двустаен апартамент с южна тераса</h3>
        <div class="mfacts"><span>${icon("map", 15)}Център</span><span>${icon("building", 15)}2 спални</span><span>${icon("crop", 15)}72 м²</span></div>
      </div>
    </article>
    <article class="mcard">
      <div class="im"><span class="fav">${icon("star", 19)}</span></div>
      <div class="bd"><span class="p">72 400 €</span>
        <h3>Апартамент с покрито паркомясто</h3>
        <div class="mfacts"><span>${icon("map", 15)}Сандански</span><span>${icon("building", 15)}2 спални</span><span>${icon("crop", 15)}84 м²</span></div>
      </div>
    </article>
  </div>
  <nav class="mtabs">
    <span class="mtab" data-on="1">${icon("search", 21)}Търсене</span>
    <span class="mtab">${icon("star", 21)}Запазени</span>
    <span class="mtab">${icon("map", 21)}Локации</span>
    <span class="mtab">${icon("list", 21)}Още</span>
  </nav>
</div>`;
fs.writeFileSync(W("PublicMobileSearch.dc.html"), wrap(SEARCH));

/* ------------------------------------------------------------ Phone: listing */
const LISTING = `<div class="m">
  <div class="mgal">
    <span class="back">${icon("left", 20)}</span>
    <span class="cnt">${icon("image", 15)}1 / 14</span>
  </div>
  <div class="mbody">
    <div>
      <span style="font-family:var(--font-display); font-size:27px; font-weight:600; color:var(--marble-900)">185 000 €</span>
      <h1 style="font-size:19px; font-weight:600; color:var(--marble-900); line-height:1.35; margin-top:8px">Вила с басейн и изглед към планината</h1>
      <p style="font-size:16px; color:var(--text-muted); margin-top:4px">Катунци, община Сандански</p>
    </div>
    <div style="display:flex; flex-wrap:wrap; gap:8px">
      <span class="trust">${icon("check", 15)}Проверени факти</span>
      <span class="mono" style="font-size:13px">MS-00191</span>
    </div>
    <dl class="mkv">
      <div><dt>Застроена площ</dt><dd>214 м²</dd></div>
      <div><dt>Двор</dt><dd>1 180 м²</dd></div>
      <div><dt>Спални</dt><dd>4</dd></div>
      <div><dt>Бани</dt><dd>2</dd></div>
    </dl>
    <p style="font-size:16px; line-height:1.65; color:var(--text-body)">Двуетажна вила в края на Катунци,
      на 14 км от Сандански. Собствен двор с басейн, лятна кухня и гараж за две коли.</p>
    <a href="#" style="font-size:16px; font-weight:600">Прочетете още ${icon("down", 15)}</a>
    <span class="mbtn mbtn--g" style="width:100%">${icon("map", 17)}Вижте на картата</span>
  </div>
  <div class="mbar">
    <a class="mbtn" href="#" style="flex:1 1 auto">${icon("calendar", 17)}Оглед</a>
    <a class="mbtn mbtn--g" href="#" style="width:56px; padding:0">${icon("phone", 18)}</a>
    <a class="mbtn mbtn--g" href="#" style="width:56px; padding:0">${icon("mail", 18)}</a>
  </div>
</div>`;
fs.writeFileSync(W("PublicMobileListing.dc.html"), wrap(LISTING));

/* -------------------------------------------------------- Phone: Hebrew, RTL */
const HE = `<div class="m">
  <div class="mgal">
    <span class="back" style="left:auto; right:12px">${icon("chevron", 20)}</span>
    <span class="cnt" style="right:auto; left:12px">${icon("image", 15)}1 / 14</span>
  </div>
  <div class="mbody">
    <div>
      <span style="font-family:var(--font-display); font-size:27px; font-weight:600; color:var(--marble-900)" dir="ltr">€185,000</span>
      <h1 style="font-size:19px; font-weight:600; color:var(--marble-900); line-height:1.45; margin-top:8px">וילה עם בריכה ונוף להרים</h1>
      <p style="font-size:16px; color:var(--text-muted); margin-top:4px">קטונצי, אזור סנדנסקי</p>
    </div>
    <div style="display:flex; flex-wrap:wrap; gap:8px">
      <span class="trust">${icon("check", 15)}נתונים מאומתים</span>
      <span class="mono" style="font-size:13px" dir="ltr">MS-00191</span>
    </div>
    <dl class="mkv">
      <div><dt>שטח בנוי</dt><dd dir="ltr" style="text-align:right">214 m²</dd></div>
      <div><dt>מגרש</dt><dd dir="ltr" style="text-align:right">1,180 m²</dd></div>
      <div><dt>חדרי שינה</dt><dd>4</dd></div>
      <div><dt>חדרי רחצה</dt><dd>2</dd></div>
    </dl>
    <p style="font-size:16px; line-height:1.7; color:var(--text-body)">וילה דו-קומתית בקצה הכפר קטונצי,
      14 ק״מ מסנדנסקי. חצר פרטית עם בריכה, מטבח קיץ וחניה מקורה לשתי מכוניות.</p>
    <a href="#" style="font-size:16px; font-weight:600">קראו עוד ${icon("down", 15)}</a>
    <span class="mbtn mbtn--g" style="width:100%">${icon("map", 17)}הצג במפה</span>
  </div>
  <div class="mbar">
    <a class="mbtn" href="#" style="flex:1 1 auto">${icon("calendar", 17)}לתאם ביקור</a>
    <a class="mbtn mbtn--g" href="#" style="width:56px; padding:0">${icon("phone", 18)}</a>
    <a class="mbtn mbtn--g" href="#" style="width:56px; padding:0">${icon("mail", 18)}</a>
  </div>
</div>`;
fs.writeFileSync(W("PublicMobileHebrew.dc.html"), wrap(HE, "rtl"));

console.log("PublicMobileSearch, PublicMobileListing, PublicMobileHebrew");
