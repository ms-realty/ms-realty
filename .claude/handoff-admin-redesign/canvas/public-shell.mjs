import { BASE, FONT_LINKS, icon } from "./shell.mjs";
export { icon } from "./shell.mjs";

// The public site shares the token layer with the workspace and diverges above it:
// larger body type for older readers in bright sun, generous rhythm, images first.
export const PUB_CSS = `
    .pub { width:1440px; background:var(--surface); color:var(--text-body); font-size:16px; }
    .pub a { color:var(--ink-800); }
    .pub-top { border-bottom:1px solid var(--border); background:var(--surface); }
    .pub-bar { display:flex; align-items:center; gap:22px; max-width:1240px; margin:0 auto; padding:0 32px;
      height:76px; }
    .pub-bar img { display:block; height:38px; width:auto; }
    .pub-nav { display:flex; align-items:center; gap:24px; margin-left:14px; }
    .pub-nav a { font-size:15px; font-weight:600; color:var(--text-body); }
    .pub-nav a:hover { color:var(--marble-900); }
    .pub-right { margin-left:auto; display:flex; align-items:center; gap:12px; }
    .lang { display:inline-flex; align-items:center; gap:7px; height:42px; padding:0 13px;
      border:1px solid var(--border-control); border-radius:var(--r-md); background:var(--surface);
      font-size:14px; font-weight:600; color:var(--text-body); }
    .callbtn { display:inline-flex; align-items:center; gap:8px; height:42px; padding:0 17px; border-radius:var(--r-md);
      background:var(--brick-600); color:#fff; font-size:14.5px; font-weight:600; }
    .pub-wrap { max-width:1240px; margin:0 auto; padding:0 32px; }
    .pbtn { display:inline-flex; align-items:center; justify-content:center; gap:9px; min-height:48px;
      padding:0 20px; border-radius:var(--r-md); border:1px solid var(--border-control);
      background:var(--surface); color:var(--marble-900); font-size:15px; font-weight:600; cursor:pointer; }
    .pbtn--brand { background:var(--ink-800); border-color:var(--ink-800); color:#fff; }
    .pbtn--accent { background:var(--brick-600); border-color:var(--brick-600); color:#fff; }
    /* .pub a is (0,1,1) and beat the (0,1,0) button classes, so a brand button
       rendered ink-on-ink. The anchor forms of the buttons carry their own colour. */
    .pub a.pbtn { color:var(--marble-900); }
    .pub a.pbtn--brand, .pub a.pbtn--accent { color:#fff; }
    .pub a.callbtn { color:#fff; }
    .pbtn--lg { min-height:54px; padding:0 26px; font-size:16px; }
    .pin { display:flex; align-items:center; height:52px; padding:0 15px; border:1px solid var(--border-control);
      border-radius:var(--r-md); background:var(--surface); font-size:15px; color:var(--text-body); }
    .h1 { font-family:var(--font-display); font-size:46px; font-weight:600; letter-spacing:-.025em;
      line-height:1.1; color:var(--marble-900); }
    .h2 { font-family:var(--font-display); font-size:30px; font-weight:600; letter-spacing:-.02em;
      line-height:1.2; color:var(--marble-900); }
    .h3 { font-family:var(--font-display); font-size:21px; font-weight:600; letter-spacing:-.01em;
      color:var(--marble-900); }
    .lede { font-size:18px; line-height:1.55; color:var(--text-body); }
    .meta { font-size:14px; color:var(--text-muted); }
    .sec { padding:56px 0; }
    .sec--tight { padding:40px 0; }
    .sec-hd { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:24px; }
    .cards { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:22px; }
    .lcard { border:1px solid var(--border); border-radius:var(--r-lg); overflow:hidden; background:var(--surface);
      box-shadow:var(--e-1); }
    .lcard .im { height:196px; position:relative;
      background:linear-gradient(160deg,#6f6350 0%,#9b8a6b 42%,#c4b394 74%,#8d7c5e 100%); }
    .lcard .im::after { content:''; position:absolute; inset:0;
      background:radial-gradient(110% 80% at 28% 22%, rgba(255,255,255,.2), transparent 58%),
        radial-gradient(90% 70% at 80% 84%, rgba(20,19,14,.3), transparent 60%),
        repeating-linear-gradient(115deg, rgba(255,255,255,.05) 0 2px, transparent 2px 15px); }
    .lcard .tag { position:absolute; top:12px; left:12px; z-index:1; }
    .lcard .fav { position:absolute; top:12px; right:12px; z-index:1; display:grid; place-items:center;
      width:38px; height:38px; border-radius:var(--r-full); background:rgba(255,255,255,.94); color:var(--ink-800); }
    .lcard .bd { padding:16px 18px 18px; display:grid; gap:9px; }
    .lprice { font-family:var(--font-display); font-size:23px; font-weight:600; color:var(--marble-900);
      letter-spacing:-.015em; }
    .lcard h3 { font-size:16px; font-weight:600; color:var(--marble-900); line-height:1.35; }
    .lfacts { display:flex; flex-wrap:wrap; gap:14px; font-size:14px; color:var(--text-muted); }
    .lfacts span { display:inline-flex; align-items:center; gap:6px; }
    .lfoot { display:flex; align-items:center; justify-content:space-between; gap:10px;
      padding-top:11px; border-top:1px solid var(--border); font-size:13px; color:var(--text-muted); }
    .trust { display:inline-flex; align-items:center; gap:7px; padding:4px 11px; border-radius:var(--r-full);
      background:var(--success-50); color:var(--success-600); font-size:13px; font-weight:600; }
    .pub-foot { background:var(--ink-900); color:rgba(255,255,255,.72); padding:48px 0 34px; margin-top:8px; }
    .pub-foot .cols { display:grid; grid-template-columns:1.4fr 1fr 1fr 1fr; gap:32px; }
    .pub-foot h4 { color:#fff; font-family:var(--font-sans); font-size:14px; font-weight:600; margin-bottom:12px; }
    .pub-foot a, .pub-foot p { color:rgba(255,255,255,.72); font-size:14.5px; line-height:1.9; display:block; }
    .pub-foot a:hover { color:#fff; }
    .pub-foot .base { display:flex; align-items:center; gap:18px; margin-top:34px; padding-top:20px;
      border-top:1px solid rgba(255,255,255,.14); font-size:13.5px; color:rgba(255,255,255,.5); flex-wrap:wrap; }
`;

export function pubHeader(active = "") {
  const link = (t, id) => `<a href="#"${id === active ? ' style="color:var(--brick-700)"' : ""}>${t}</a>`;
  return `<header class="pub-top">
    <div class="pub-bar">
      <img src="ms-realty-logo.png" alt="MS Realty" width="74" height="38" />
      <nav class="pub-nav">
        ${link("Имоти", "search")}
        ${link("Локации", "loc")}
        ${link("Продайте имот", "sell")}
        ${link("Ръководства", "guide")}
        ${link("Контакти", "contact")}
      </nav>
      <div class="pub-right">
        <span class="lang">${icon("globe", 16)}БГ ${icon("down", 15)}</span>
        <a class="callbtn" href="#">${icon("phone", 16)}0888 12 34 56</a>
      </div>
    </div>
  </header>`;
}

export function pubFooter() {
  return `<footer class="pub-foot">
    <div class="pub-wrap">
      <div class="cols">
        <div>
          <img src="ms-realty-logo-reversed.png" alt="MS Realty" width="74" height="38" style="display:block; height:38px; width:auto; margin-bottom:14px" />
          <p style="max-width:290px">Семейна агенция за недвижими имоти в Сандански. Работим с имоти в
            Сандански, Мелник, Катунци и региона от 2011 година.</p>
          <p style="margin-top:12px">ул. Македония 22, Сандански<br>0888 12 34 56</p>
        </div>
        <div><h4>Имоти</h4>
          <a href="#">Апартаменти</a><a href="#">Къщи</a><a href="#">Парцели</a>
          <a href="#">Под наем</a><a href="#">Бизнес имоти</a></div>
        <div><h4>Локации</h4>
          <a href="#">Сандански</a><a href="#">Мелник</a><a href="#">Катунци</a>
          <a href="#">Левуново</a><a href="#">Хотово</a></div>
        <div><h4>Агенцията</h4>
          <a href="#">За нас</a><a href="#">Продайте имот</a><a href="#">Ръководства</a>
          <a href="#">Контакти</a><a href="#">Поверителност</a></div>
      </div>
      <div class="base">
        <span>© 2026 MS Realty</span><span>·</span>
        <a href="#">Условия за ползване</a><span>·</span>
        <a href="#">Поверителност</a><span>·</span>
        <a href="#">Бисквитки</a>
        <span style="margin-left:auto; display:flex; gap:12px">
          <a href="#">БГ</a><a href="#">EN</a><a href="#">DE</a><a href="#">NL</a>
          <a href="#">RU</a><a href="#">EL</a><a href="#">עב</a></span>
      </div>
    </div>
  </footer>`;
}

export function pubPage({ body, extraCss = "", width = 1440, height = 1200, dir = "ltr" }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
${FONT_LINKS}
  <style>${BASE}${PUB_CSS}${extraCss}
  </style>
</helmet>
<div class="pub" style="width:${width}px; min-height:${height}px"${dir === "rtl" ? ' dir="rtl"' : ""}>
${body}
</div>
</x-dc>
</body>
</html>
`;
}
