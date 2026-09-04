import fs from "node:fs";
import { pubPage, pubHeader, pubFooter, icon } from "../public-shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

const CSS = `
    .hero { position:relative; padding:0 0 0; background:var(--stone-100); }
    .hero-in { max-width:1240px; margin:0 auto; padding:52px 32px 44px; display:grid;
      grid-template-columns:1.02fr .98fr; gap:44px; align-items:center; }
    .hero-im { height:392px; border-radius:var(--r-lg); position:relative; overflow:hidden;
      background:linear-gradient(150deg,#5f5544 0%,#8d7c5e 38%,#c4b394 70%,#7d6f56 100%); }
    .hero-im::after { content:''; position:absolute; inset:0;
      background:radial-gradient(110% 80% at 26% 20%, rgba(255,255,255,.22), transparent 56%),
        radial-gradient(90% 70% at 82% 86%, rgba(20,19,14,.34), transparent 60%); }
    .hero-badge { position:absolute; left:18px; bottom:18px; z-index:1; display:flex; align-items:center; gap:10px;
      padding:10px 14px; border-radius:var(--r-md); background:rgba(255,255,255,.94); }
    .searchbox { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-lg);
      box-shadow:var(--e-2); padding:8px; display:grid; gap:8px; }
    .searchrow { display:grid; grid-template-columns:1.5fr 1fr 1fr auto; gap:8px; }
    .sfield { display:grid; gap:3px; padding:9px 13px; border-radius:var(--r-md); background:var(--stone-50);
      min-width:0; }
    .sfield label { font-size:12px; font-weight:600; color:var(--text-muted); }
    .sfield span { font-size:15px; font-weight:600; color:var(--stone-900); display:flex;
      align-items:center; justify-content:space-between; gap:8px; }
    .quick { display:flex; flex-wrap:wrap; gap:8px; }
    .quick a { display:inline-flex; align-items:center; gap:7px; height:38px; padding:0 14px;
      border:1px solid var(--border); border-radius:var(--r-full); background:var(--surface);
      font-size:14px; font-weight:600; color:var(--text-body); }
    .strip { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:0; border-top:1px solid var(--border);
      border-bottom:1px solid var(--border); background:var(--surface); }
    .strip > div { padding:22px 26px; border-right:1px solid var(--border); }
    .strip > div:last-child { border-right:0; }
    .strip b { display:block; font-family:var(--font-display); font-size:28px; font-weight:600;
      letter-spacing:-.02em; color:var(--stone-900); }
    .strip span { display:block; margin-top:4px; font-size:14px; color:var(--text-muted); }
    .split { display:grid; grid-template-columns:1fr 1fr; gap:44px; align-items:center; }
    .steps { display:grid; gap:18px; }
    .step { display:grid; grid-template-columns:auto minmax(0,1fr); gap:15px; align-items:start; }
    .step .n { display:grid; place-items:center; width:36px; height:36px; border-radius:var(--r-full);
      background:var(--ink-800); color:#fff; font-family:var(--font-display); font-size:16px; font-weight:600; }
    .step b { display:block; font-size:17px; font-weight:600; color:var(--stone-900); margin-bottom:4px; }
    .step p { font-size:15px; color:var(--text-body); line-height:1.55; }
    .locs { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:18px; }
    .loc { position:relative; height:184px; border-radius:var(--r-lg); overflow:hidden;
      background:linear-gradient(160deg,#6b5f4c 0%,#96866a 46%,#bda98a 100%); display:grid; align-content:end;
      padding:16px; }
    .loc::after { content:''; position:absolute; inset:0; background:linear-gradient(transparent 34%,rgba(20,19,14,.66)); }
    .loc b, .loc span { position:relative; z-index:1; color:#fff; }
    .loc b { font-family:var(--font-display); font-size:19px; font-weight:600; }
    .loc span { font-size:13.5px; color:rgba(255,255,255,.82); }
    .guides { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:22px; }
    .guide { border:1px solid var(--border); border-radius:var(--r-lg); padding:22px; background:var(--surface);
      display:grid; gap:11px; align-content:start; }
    .guide b { font-family:var(--font-display); font-size:19px; font-weight:600; color:var(--stone-900);
      line-height:1.3; }
    .guide p { font-size:14.5px; color:var(--text-body); line-height:1.55; }
    .band { background:var(--ink-900); color:#fff; }
    .band .pub-wrap { padding-top:52px; padding-bottom:52px; }
    .band h2 { color:#fff; }
    .band p { color:rgba(255,255,255,.76); }
`;

const CARD = (price, title, place, ref, beds, area, when, tone, tag) => `        <article class="lcard">
          <div class="im">
            ${tag ? `<span class="tag pill pill--${tone}"><i></i>${tag}</span>` : ""}
            <span class="fav">${icon("star", 18)}</span>
          </div>
          <div class="bd">
            <span class="lprice">${price}</span>
            <h3>${title}</h3>
            <div class="lfacts">
              <span>${icon("map", 15)}${place}</span>
              <span>${icon("building", 15)}${beds}</span>
              <span>${icon("crop", 15)}${area}</span>
            </div>
            <div class="lfoot"><span class="mono">${ref}</span><span>Обновена ${when}</span></div>
          </div>
        </article>`;

const BODY = `${pubHeader("")}

  <section class="hero">
    <div class="hero-in">
      <div>
        <h1 class="h1">Имоти в Сандански и региона,<br>с проверени факти.</h1>
        <p class="lede" style="margin-top:16px; max-width:520px">165 обяви от 2011 година насам. Всяка цена,
          площ и локация е сверена с документ, преди да излезе тук.</p>

        <div class="searchbox" style="margin-top:26px">
          <div class="searchrow">
            <span class="sfield"><label for="h1f">Къде</label><span id="h1f">Сандански ${icon("down", 16)}</span></span>
            <span class="sfield"><label for="h2f">Вид</label><span id="h2f">Апартамент ${icon("down", 16)}</span></span>
            <span class="sfield"><label for="h3f">До цена</label><span id="h3f">100 000 € ${icon("down", 16)}</span></span>
            <button class="pbtn pbtn--accent pbtn--lg" type="button" style="min-width:132px">${icon("search", 18)}Търсене</button>
          </div>
        </div>
        <div class="quick" style="margin-top:14px">
          <a href="#">${icon("building", 15)}Апартаменти до 70 000 €</a>
          <a href="#">${icon("map", 15)}Къщи в Мелник</a>
          <a href="#">${icon("key", 15)}Под наем</a>
          <a href="#">${icon("layers", 15)}Парцели</a>
        </div>
      </div>
      <div class="hero-im">
        <div class="hero-badge">
          <span class="trust">${icon("check", 15)}Проверена обява</span>
          <span style="font-size:14px; color:var(--text-body)">Вила в Катунци · 185 000 €</span>
        </div>
      </div>
    </div>
  </section>

  <div class="strip">
    <div><b>165</b><span>обяви в каталога</span></div>
    <div><b>7</b><span>езика, с човешки превод</span></div>
    <div><b>15 г.</b><span>работа в региона</span></div>
    <div><b>до 4 ч.</b><span>отговор в работен ден</span></div>
  </div>

  <section class="sec"><div class="pub-wrap">
    <div class="sec-hd">
      <div><h2 class="h2">Нови обяви</h2>
        <p class="meta" style="margin-top:6px">Публикувани през последните 14 дни, всичките с одобрени снимки.</p></div>
      <a class="pbtn" href="#">Всички 165 обяви ${icon("arrow", 16)}</a>
    </div>
    <div class="cards">
${CARD("185 000 €", "Вила с басейн и изглед към планината", "Катунци", "MS-00191", "4 спални", "214 м²", "днес", "ok", "Нова")}
${CARD("68 000 €", "Двустаен апартамент с южна тераса", "Сандански", "MS-00815", "2 спални", "72 м²", "преди 2 дни", "sea", "Гледана 34 пъти")}
${CARD("54 500 €", "Реновирана селска къща с двор", "Катунци", "MS-00932", "3 спални", "96 м²", "преди 3 дни", "warn", "Намалена")}
    </div>
  </div></section>

  <section class="sec--tight" style="background:var(--stone-50); border-top:1px solid var(--border); border-bottom:1px solid var(--border)">
    <div class="pub-wrap">
      <div class="split">
        <div>
          <h2 class="h2">Купувате от чужбина?</h2>
          <p class="lede" style="margin-top:14px">Говорим български, руски и английски, а обявите ни излизат
            на седем езика. Обясняваме процеса, документите и разходите преди да платите каквото и да е.</p>
          <div style="display:flex; gap:12px; margin-top:20px">
            <a class="pbtn pbtn--brand" href="#">Как се купува имот в България</a>
            <a class="pbtn" href="#">Такси и данъци</a>
          </div>
          <p class="meta" style="margin-top:14px">${icon("shield", 14)} Правната информация е прегледана от адвокат
            и носи дата на последна проверка.</p>
        </div>
        <div class="steps">
          <div class="step"><span class="n">1</span><span><b>Избирате имот</b>
            <p>Търсите по локация, вид и бюджет. Всяка обява показва референция и кога е обновена последно.</p></span></div>
          <div class="step"><span class="n">2</span><span><b>Организираме оглед</b>
            <p>На място или на видео, ако сте в чужбина. Предлагаме реални часове от календара на брокера.</p></span></div>
          <div class="step"><span class="n">3</span><span><b>Водим сделката до нотариуса</b>
            <p>Скица, данъчна оценка, предварителен договор, нотариален акт и вписване. Знаете къде сме на всяка стъпка.</p></span></div>
        </div>
      </div>
    </div>
  </section>

  <section class="sec"><div class="pub-wrap">
    <div class="sec-hd">
      <div><h2 class="h2">Локации</h2>
        <p class="meta" style="margin-top:6px">Сандански е балнеоложки град в подножието на Пирин, на 20 км от границата с Гърция.</p></div>
      <a class="pbtn" href="#">Всички локации ${icon("arrow", 16)}</a>
    </div>
    <div class="locs">
      <div class="loc"><b>Сандански</b><span>71 обяви · от 19 500 €</span></div>
      <div class="loc"><b>Мелник</b><span>18 обяви · от 24 000 €</span></div>
      <div class="loc"><b>Катунци</b><span>22 обяви · от 31 000 €</span></div>
      <div class="loc"><b>Левуново</b><span>9 обяви · от 12 000 €</span></div>
    </div>
  </div></section>

  <section class="sec--tight"><div class="pub-wrap">
    <div class="sec-hd"><div><h2 class="h2">Ръководства</h2>
      <p class="meta" style="margin-top:6px">Написани за конкретния случай, а не преписани отнякъде.</p></div></div>
    <div class="guides">
      <div class="guide">
        <b>Може ли чужденец да купи земя в България?</b>
        <p>Кратката версия: сграда — да; земя — зависи от гражданството и от вида на имота. Обясняваме кой
          вариант важи за вас и какво се проверява предварително.</p>
        <span class="meta">${icon("shield", 14)} Прегледано от адвокат · 29 юли 2026</span>
      </div>
      <div class="guide">
        <b>Какви са разходите при покупка</b>
        <p>Местен данък, нотариална такса, вписване, преводач и хонорар на агенцията — с реален пример за
          имот от 68 000 €.</p>
        <span class="meta">${icon("shield", 14)} Прегледано от адвокат · 12 юни 2026</span>
      </div>
      <div class="guide">
        <b>Какво е ESTI и кога ви касае</b>
        <p>Ако ще отдавате имота за кратък престой, има регистрация и отчитане на гостите. Кой го прави и
          какво струва.</p>
        <span class="meta">${icon("clock", 14)} Обновено на 3 август 2026</span>
      </div>
    </div>
  </div></section>

  <section class="band"><div class="pub-wrap">
    <div class="split">
      <div>
        <h2 class="h2">Продавате имот в Сандански?</h2>
        <p class="lede" style="margin-top:14px; color:rgba(255,255,255,.78)">Безплатна оценка на място в рамките
          на два работни дни. Договор за посредничество с ясен срок и без скрити такси.</p>
      </div>
      <div style="display:flex; gap:12px; justify-content:flex-end">
        <a class="pbtn pbtn--accent pbtn--lg" href="#">Заявете оценка</a>
        <a class="pbtn pbtn--lg" href="#" style="background:transparent; border-color:rgba(255,255,255,.3); color:#fff">Как работим</a>
      </div>
    </div>
  </div></section>

${pubFooter()}`;

fs.writeFileSync(W("PublicHome.dc.html"), pubPage({ body: BODY, extraCss: CSS, height: 2660 }));
console.log("PublicHome.dc.html");
