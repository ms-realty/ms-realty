import fs from "node:fs";
import { pubPage, pubHeader, pubFooter, icon } from "../public-shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

const CSS = `
    .crumb { display:flex; align-items:center; gap:9px; padding:18px 0; font-size:14px; color:var(--text-muted); }
    .hero2 { position:relative; height:340px; border-radius:var(--r-lg); overflow:hidden; display:grid;
      align-content:end; padding:30px;
      background:linear-gradient(150deg,#5a5142 0%,#8a7a5e 40%,#bcaa8b 74%,#7a6c54 100%); }
    .hero2::after { content:''; position:absolute; inset:0;
      background:linear-gradient(transparent 30%, rgba(20,19,14,.7)),
        repeating-linear-gradient(115deg, rgba(255,255,255,.05) 0 2px, transparent 2px 15px); }
    .hero2 > * { position:relative; z-index:1; color:#fff; }
    .hero2 h1 { font-family:var(--font-display); font-size:40px; font-weight:600; letter-spacing:-.02em; }
    .hero2 p { font-size:17px; color:rgba(255,255,255,.84); margin-top:8px; max-width:640px; }
    .two { display:grid; grid-template-columns:minmax(0,1fr) 360px; gap:40px; align-items:start; }
    .prose h2 { font-family:var(--font-display); font-size:26px; font-weight:600; letter-spacing:-.018em;
      color:var(--stone-900); margin:32px 0 12px; }
    .prose h2:first-child { margin-top:0; }
    .prose p { font-size:16.5px; line-height:1.7; color:var(--text-body); margin-bottom:14px; }
    .prose ul { margin:0 0 16px; padding-left:22px; }
    .prose li { font-size:16.5px; line-height:1.7; color:var(--text-body); margin-bottom:7px; }
    .callout { padding:18px 20px; border-radius:var(--r-lg); background:var(--sea-50);
      border:1px solid var(--sea-200); margin:20px 0; }
    .callout b { display:block; font-size:16px; font-weight:600; color:var(--sea-700); margin-bottom:6px; }
    .callout p { font-size:15px; color:var(--sea-700); line-height:1.6; margin:0; }
    .toc { border:1px solid var(--border); border-radius:var(--r-lg); padding:18px 20px; background:var(--surface); }
    .toc b { display:block; font-size:14px; font-weight:600; color:var(--stone-900); margin-bottom:11px; }
    .toc a { display:block; padding:6px 0; font-size:14.5px; color:var(--text-body); border-bottom:1px solid var(--border); }
    .toc a:last-child { border-bottom:0; }
    .pbox2 { border:1px solid var(--border); border-radius:var(--r-lg); background:var(--surface);
      box-shadow:var(--e-2); padding:20px; display:grid; gap:13px; }
    .form2 { display:grid; gap:14px; }
    .fld { display:grid; gap:6px; }
    .fld label { font-size:14px; font-weight:600; color:var(--text-body); }
    .fld .pin { min-height:52px; }
    .radio { display:flex; gap:10px; flex-wrap:wrap; }
    .radio span { display:inline-flex; align-items:center; gap:8px; height:46px; padding:0 15px;
      border:1px solid var(--border-control); border-radius:var(--r-md); font-size:14.5px; font-weight:600;
      color:var(--text-body); }
    .radio span[data-on] { border-color:var(--ink-800); background:var(--ink-800); color:#fff; }
    .offices { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:22px; }
    .office { border:1px solid var(--border); border-radius:var(--r-lg); padding:22px; background:var(--surface); }
    .office b { font-family:var(--font-display); font-size:20px; font-weight:600; color:var(--stone-900); }
    .office p { font-size:15px; color:var(--text-body); line-height:1.7; margin-top:8px; }
    .peop { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:22px; }
    .per { display:grid; gap:11px; }
    .per .pic { height:210px; border-radius:var(--r-lg);
      background:linear-gradient(155deg,#6f6350 0%,#9b8a6b 45%,#c4b394 100%); }
    .per b { font-size:17px; font-weight:600; color:var(--stone-900); }
    .per span { font-size:14.5px; color:var(--text-muted); display:block; }
    .stepbig { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:26px; }
    .stepbig > div { display:grid; gap:10px; align-content:start; }
    .stepbig .n { display:grid; place-items:center; width:44px; height:44px; border-radius:var(--r-full);
      background:var(--ink-800); color:#fff; font-family:var(--font-display); font-size:19px; font-weight:600; }
    .stepbig b { font-size:19px; font-weight:600; color:var(--stone-900); font-family:var(--font-display); }
    .stepbig p { font-size:15.5px; color:var(--text-body); line-height:1.6; }
    .mapbox2 { height:320px; border-radius:var(--r-lg); position:relative; overflow:hidden;
      background:linear-gradient(140deg,#e7ecdf 0%,#dbe3d2 42%,#cfd9c5 100%); }
    .mapbox2::after { content:''; position:absolute; inset:0;
      background:repeating-linear-gradient(0deg, rgba(120,130,105,.18) 0 1px, transparent 1px 44px),
        repeating-linear-gradient(90deg, rgba(120,130,105,.18) 0 1px, transparent 1px 44px); }
    .pin3 { position:absolute; z-index:1; left:47%; top:45%; display:grid; place-items:center; width:44px;
      height:44px; border-radius:var(--r-full); background:var(--brick-600); color:#fff;
      box-shadow:0 4px 12px rgba(20,19,14,.28); }
`;

const CARD = (price, title, place, ref, beds, area) => `      <article class="lcard">
        <div class="im"><span class="fav">${icon("star", 18)}</span></div>
        <div class="bd"><span class="lprice">${price}</span><h3>${title}</h3>
          <div class="lfacts"><span>${icon("map", 15)}${place}</span><span>${icon("building", 15)}${beds}</span><span>${icon("crop", 15)}${area}</span></div>
          <div class="lfoot"><span class="mono">${ref}</span><span>Проверена</span></div></div>
      </article>`;

/* ------------------------------------------------------------------ Location */
const LOC_BODY = `${pubHeader("loc")}
  <div class="pub-wrap">
    <div class="crumb"><a href="#">Локации</a> ${icon("chevron", 14)} <b style="color:var(--stone-900)">Сандански</b></div>
    <div class="hero2">
      <h1>Сандански</h1>
      <p>Балнеоложки град в подножието на Пирин, на 20 км от границата с Гърция и на 160 км от София.
        71 обяви в момента, от 19 500 €.</p>
    </div>

    <section class="sec"><div class="two">
      <div class="prose">
        <h2>Какво е Сандански</h2>
        <p>Град с около 25 000 души в Югозападна България, известен с минералните си извори и с най-мекия
          климат в страната. Разположен е в Санданско-Петричката котловина, между Пирин и Малешевска планина.
          Не е морски курорт — най-близкото море е на 130 км, в Гърция.</p>
        <p>Центърът е компактен и се обхожда пеша. Основната пешеходна зона върви покрай градския парк, който
          е един от най-големите в България. Болница, гимназия и седмичен пазар има в самия град.</p>

        <h2>Кой купува тук</h2>
        <p>Три групи, с различни причини. Българи от София и Благоевград купуват втори дом заради климата и
          баните. Гърци от Солун и околността купуват заради цените и близостта — 90 минути с кола.
          Британци и германци, които са били тук на почивка, търсят къща в околните села.</p>
        <ul>
          <li>Апартамент в центъра — между 45 000 и 95 000 €</li>
          <li>Къща в града с двор — от 90 000 €</li>
          <li>Къща в околните села — от 19 500 €</li>
          <li>Парцел за строеж — от 12 000 €</li>
        </ul>

        <div class="callout">
          <b>Ако купувате от чужбина</b>
          <p>Гражданин на ЕС може да купи сграда без ограничение. За земеделска земя има допълнителни
            условия, които проверяваме преди да подготвим какъвто и да е договор.</p>
        </div>

        <h2>Как се стига</h2>
        <p>С кола от София по АМ „Струма“ — около два часа. От летище Солун — 90 минути. Има междуградски
          автобуси от София и Благоевград, а гарата е на линията София–Кулата.</p>
      </div>
      <aside style="display:grid; gap:16px">
        <div class="toc"><b>На тази страница</b>
          <a href="#">Какво е Сандански</a><a href="#">Кой купува тук</a>
          <a href="#">Как се стига</a><a href="#">Имоти в Сандански</a></div>
        <div class="pbox2">
          <b style="font-size:16px; font-weight:600; color:var(--stone-900)">Търсите нещо конкретно?</b>
          <p style="font-size:14.5px; color:var(--text-body)">Кажете бюджет и брой стаи и ще ви пратим
            подходящите, включително непубликуваните.</p>
          <a class="pbtn pbtn--brand" href="#">Опишете какво търсите</a>
        </div>
        <p class="meta">${icon("shield", 14)} Текстът е одобрен от Мария Русева на 19 август 2026.</p>
      </aside>
    </div></section>

    <section class="sec--tight">
      <div class="sec-hd"><div><h2 class="h2">Имоти в Сандански</h2>
        <p class="meta" style="margin-top:6px">71 обяви · от 19 500 € до 340 000 €</p></div>
        <a class="pbtn" href="#">Всички 71 ${icon("arrow", 16)}</a></div>
      <div class="cards">
${CARD("68 000 €", "Двустаен апартамент с южна тераса", "Център", "MS-00815", "2 спални", "72 м²")}
${CARD("31 900 €", "Студио до минералните бани", "Сандански", "MS-00791", "1 спалня", "38 м²")}
${CARD("120 000 €", "Търговски обект на главната", "Център", "MS-00046", "—", "88 м²")}
      </div>
    </section>
  </div>
${pubFooter()}`;
fs.writeFileSync(W("PublicLocation.dc.html"), pubPage({ body: LOC_BODY, extraCss: CSS, height: 2320 }));

/* --------------------------------------------------------------------- Seller */
const SELL_BODY = `${pubHeader("sell")}
  <section style="background:var(--stone-100); border-bottom:1px solid var(--border)">
    <div class="pub-wrap" style="padding-top:56px; padding-bottom:52px">
      <div class="two" style="grid-template-columns:1.05fr .95fr; gap:48px; align-items:center">
        <div>
          <h1 class="h1">Продайте имота си в Сандански с брокер, който вдига телефона.</h1>
          <p class="lede" style="margin-top:16px">Безплатна оценка на място в рамките на два работни дни.
            Договор за посредничество с ясен срок, без скрити такси и без изключителни права, ако не ги искате.</p>
          <div style="display:flex; gap:22px; margin-top:22px; flex-wrap:wrap">
            <span style="display:flex; align-items:center; gap:9px; font-size:15px">${icon("check", 17)}Оценка на място, не по телефона</span>
            <span style="display:flex; align-items:center; gap:9px; font-size:15px">${icon("check", 17)}Обява на 7 езика</span>
            <span style="display:flex; align-items:center; gap:9px; font-size:15px">${icon("check", 17)}Хонорар само при сделка</span>
          </div>
        </div>
        <div class="pbox2" style="padding:24px">
          <b style="font-family:var(--font-display); font-size:22px; font-weight:600; color:var(--stone-900)">Заявете безплатна оценка</b>
          <div class="form2">
            <div class="fld"><label for="s1">Какъв е имотът</label>
              <div class="radio"><span data-on="1">Апартамент</span><span>Къща</span><span>Парцел</span><span>Друго</span></div></div>
            <div class="fld"><label for="s2">Къде се намира</label><span class="pin" id="s2">Град или село</span></div>
            <div class="fld"><label for="s3">Вашето име</label><span class="pin" id="s3">Име и фамилия</span></div>
            <div class="fld"><label for="s4">Телефон</label><span class="pin" id="s4">0888 000 000</span></div>
            <div style="display:flex; align-items:flex-start; gap:11px">
              <span class="box" style="margin-top:2px"></span>
              <span style="font-size:14px; color:var(--text-body); line-height:1.5">Съгласен съм да се свържете
                с мен за тази оценка. <a href="#" style="font-weight:600">Поверителност</a></span>
            </div>
            <a class="pbtn pbtn--accent pbtn--lg" href="#" style="justify-content:center">Заявете оценка</a>
            <p class="meta" style="text-align:center">Отговаряме до 4 часа в работен ден.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <div class="pub-wrap">
    <section class="sec">
      <div class="sec-hd"><div><h2 class="h2">Как работим</h2>
        <p class="meta" style="margin-top:6px">Три стъпки, и знаете какво следва на всяка.</p></div></div>
      <div class="stepbig">
        <div><span class="n">1</span><b>Оценка</b>
          <p>Идваме на място, снимаме и даваме реалистична цена — не най-високата, а тази, на която имотът
            се продава. Показваме с какви сделки я сравняваме.</p></div>
        <div><span class="n">2</span><b>Подготовка</b>
          <p>Проверяваме документите, правим професионални снимки и подготвяме обявата на български,
            английски, немски, руски и гръцки. Всеки факт го сверяваме със скица или акт.</p></div>
        <div><span class="n">3</span><b>Сделка</b>
          <p>Организираме огледите, водим преговорите и стигаме до нотариуса. Хонорарът се плаща само ако
            има сделка.</p></div>
      </div>
    </section>

    <section class="sec--tight" style="border-top:1px solid var(--border)">
      <div class="sec-hd"><div><h2 class="h2">Продадени наскоро</h2>
        <p class="meta" style="margin-top:6px">С разрешение на собствениците.</p></div></div>
      <div class="cards">
${CARD("96 000 €", "Къща с двор, продадена за 6 седмици", "Сандански", "MS-00183", "3 спални", "146 м²")}
${CARD("62 000 €", "Двустаен, продаден на първия оглед", "Сандански", "MS-00182", "2 спални", "68 м²")}
${CARD("188 000 €", "Вила, купувач от Гърция", "Катунци", "MS-00181", "4 спални", "204 м²")}
      </div>
    </section>
  </div>
${pubFooter()}`;
fs.writeFileSync(W("PublicSeller.dc.html"), pubPage({ body: SELL_BODY, extraCss: CSS, height: 2140 }));

/* -------------------------------------------------------------------- Contact */
const CONT_BODY = `${pubHeader("contact")}
  <div class="pub-wrap">
    <section class="sec--tight">
      <h1 class="h1" style="font-size:40px">Контакти</h1>
      <p class="lede" style="margin-top:12px; max-width:640px">Обадете се, пишете или минете през офиса.
        Работим на място в Сандански от 2011 година.</p>
    </section>

    <section class="sec--tight" style="padding-top:0">
      <div class="two" style="grid-template-columns:1fr 1fr; gap:40px; align-items:start">
        <div class="offices" style="grid-template-columns:minmax(0,1fr)">
          <div class="office">
            <b>Офис Сандански</b>
            <p>ул. Македония 22, 2800 Сандански<br>
              Понеделник – петък 09:00 – 18:00<br>
              Събота 10:00 – 14:00</p>
            <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:16px">
              <a class="pbtn" href="#">${icon("phone", 16)}0888 12 34 56</a>
              <a class="pbtn" href="#">${icon("mail", 16)}office@ms-realty.bg</a>
            </div>
          </div>
          <div class="mapbox2"><div class="pin3">${icon("map", 20)}</div></div>
        </div>

        <div class="pbox2" style="padding:24px">
          <b style="font-family:var(--font-display); font-size:22px; font-weight:600; color:var(--stone-900)">Напишете ни</b>
          <div class="form2">
            <div class="fld"><label for="c0">За какво пишете</label>
              <div class="radio"><span data-on="1">Питане за имот</span><span>Продажба</span><span>Друго</span></div></div>
            <div class="fld"><label for="c1">Име</label><span class="pin" id="c1">Име и фамилия</span></div>
            <div class="fld"><label for="c2">Имейл или телефон</label><span class="pin" id="c2">Как да се свържем</span></div>
            <div class="fld"><label for="c3">Съобщение</label>
              <span class="pin" id="c3" style="min-height:120px; align-items:flex-start; padding-top:14px">Кажете какво търсите</span></div>
            <div style="display:flex; align-items:flex-start; gap:11px">
              <span class="box" style="margin-top:2px"></span>
              <span style="font-size:14px; color:var(--text-body); line-height:1.5">Съгласен съм да ми
                отговорите на този въпрос. <a href="#" style="font-weight:600">Поверителност</a></span>
            </div>
            <a class="pbtn pbtn--brand pbtn--lg" href="#" style="justify-content:center">Изпратете</a>
            <p class="meta" style="text-align:center">Отговаряме до 4 часа в работен ден. Говорим БГ, RU и EN.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="sec">
      <div class="sec-hd"><div><h2 class="h2">Екипът</h2>
        <p class="meta" style="margin-top:6px">Семейна агенция — двама брокери и преводач.</p></div></div>
      <div class="peop">
        <div class="per"><span class="pic"></span><b>Мария Русева</b>
          <span>Собственик и брокер</span><span class="meta">Български, руски, английски</span></div>
        <div class="per"><span class="pic"></span><b>Петър Димитров</b>
          <span>Брокер</span><span class="meta">Български, английски</span></div>
        <div class="per"><span class="pic"></span><b>Десислава Колева</b>
          <span>Преводач</span><span class="meta">Немски, нидерландски</span></div>
      </div>
    </section>
  </div>
${pubFooter()}`;
fs.writeFileSync(W("PublicContact.dc.html"), pubPage({ body: CONT_BODY, extraCss: CSS, height: 1980 }));

console.log("PublicLocation, PublicSeller, PublicContact");
