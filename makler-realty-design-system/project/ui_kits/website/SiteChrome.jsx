/* Site chrome: Wordmark, Header (top nav) and Footer. */
const DS = window.MaklerRealtyDesignSystem_9b7f1e;
const { Button, IconButton, Icon, Logo } = DS;

const chromeCss = `
.mk-wordmark { display:inline-flex; align-items:baseline; gap:8px; font-family:var(--font-display); font-weight:600; letter-spacing:-0.01em; color:var(--brand); text-decoration:none; line-height:1; }
.mk-wordmark small { font-family:var(--font-sans); font-weight:600; letter-spacing:.26em; text-transform:uppercase; color:var(--accent); transform:translateY(-1px); }
.mk-wordmark--dark { color:#fff; } .mk-wordmark--dark small { color:var(--stone-400); }

.site-hd { position:sticky; top:0; z-index:40; background:rgba(255,255,255,.92); -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px); border-bottom:1px solid var(--border); }
.site-hd__in { max-width:var(--container-2xl); margin:0 auto; padding:0 var(--gutter); height:72px; display:flex; align-items:center; gap:28px; }
.site-hd__nav { display:flex; align-items:center; gap:4px; margin-left:8px; }
.site-hd__nav a { font-size:var(--text-base); font-weight:var(--fw-medium); color:var(--text-body); text-decoration:none; padding:9px 12px; border-radius:var(--radius-sm); transition:background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard); cursor:pointer; }
.site-hd__nav a:hover { background:var(--surface-hover); color:var(--text-strong); }
.site-hd__nav a[data-active="true"] { color:var(--brand); }
.site-hd__right { margin-left:auto; display:flex; align-items:center; gap:10px; }
.site-hd__lang { display:inline-flex; align-items:center; gap:4px; background:var(--surface-sunken); border-radius:var(--radius-full); padding:3px; }
.site-hd__lang button { border:none; background:transparent; font:inherit; font-size:var(--text-xs); font-weight:var(--fw-semibold); letter-spacing:.04em; color:var(--text-muted); padding:5px 9px; border-radius:var(--radius-full); cursor:pointer; }
.site-hd__lang button[aria-pressed="true"] { background:var(--surface); color:var(--brand); box-shadow:var(--shadow-xs); }

.site-ft { background:var(--surface-inverse); color:var(--stone-200); }
.site-ft__in { max-width:var(--container-2xl); margin:0 auto; padding:56px var(--gutter) 32px; display:grid; grid-template-columns:1.4fr 1fr 1fr 1fr; gap:40px; }
.site-ft h4 { font-family:var(--font-sans); font-size:var(--text-xs); font-weight:var(--fw-semibold); letter-spacing:.14em; text-transform:uppercase; color:var(--stone-400); margin:0 0 16px; }
.site-ft ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:11px; }
.site-ft a { color:var(--stone-200); text-decoration:none; font-size:var(--text-base); }
.site-ft a:hover { color:#fff; text-decoration:underline; text-underline-offset:2px; }
.site-ft__intro { color:var(--stone-300); font-size:var(--text-base); line-height:1.6; max-width:34ch; margin:16px 0 20px; }
.site-ft__contact { display:flex; flex-direction:column; gap:9px; }
.site-ft__contact span { display:flex; align-items:center; gap:9px; font-size:var(--text-base); }
.site-ft__contact .mk-icon { color:var(--stone-400); flex:none; }
.site-ft__bar { border-top:1px solid var(--border-inverse); }
.site-ft__bar-in { max-width:var(--container-2xl); margin:0 auto; padding:20px var(--gutter); display:flex; align-items:center; justify-content:space-between; gap:16px; font-size:var(--text-sm); color:var(--stone-400); }
.site-ft__bar-in nav { display:flex; gap:20px; }
@media (max-width:900px){ .site-ft__in{ grid-template-columns:1fr 1fr; } }
`;
if (!document.getElementById('mk-chrome-css')) { const s=document.createElement('style'); s.id='mk-chrome-css'; s.textContent=chromeCss; document.head.appendChild(s); }

function Wordmark({ dark = false, size = 22, onClick }) {
  return (
    <a className={'mk-wordmark' + (dark ? ' mk-wordmark--dark' : '')} style={{ fontSize: size }} onClick={onClick} href="#">
      MS<small style={{ fontSize: Math.round(size * 0.5) }}>Realty</small>
    </a>
  );
}

const NAV = [
  { key: 'results', label: 'Купува' },
  { key: 'results', label: 'Под наем' },
  { key: 'resorts', label: 'Курорти' },
  { key: 'results', label: 'Ново строителство' },
  { key: 'contact', label: 'Контакти' },
];

const PUBLIC_LANGS = ['BG', 'EN', 'DE', 'NL', 'RU', 'EL', 'HE'];

function Header({ onNavigate, active }) {
  const [lang, setLang] = React.useState('BG');
  return (
    <header className="site-hd">
      <div className="site-hd__in">
        <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('home'); }} aria-label="MS Realty — начало" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <Logo height={40} />
        </a>
        <nav className="site-hd__nav">
          {NAV.map((n, i) => (
            <a key={i} data-active={active === n.key || undefined}
               onClick={(e) => { e.preventDefault(); onNavigate(n.key); }}>{n.label}</a>
          ))}
        </nav>
        <div className="site-hd__right">
          <div className="site-hd__lang" role="group" aria-label="Език">
            {PUBLIC_LANGS.map(l => (
              <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{l}</button>
            ))}
          </div>
          <Button variant="ghost" size="sm" iconStart="heart">Запазени</Button>
          <Button variant="accent" size="sm" iconStart="phone" as="a" href="tel:+359879696870">Обади се на брокер</Button>
        </div>
      </div>
    </header>
  );
}

function Footer({ onNavigate }) {
  return (
    <footer className="site-ft">
      <div className="site-ft__in">
        <div>
          <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('home'); }} aria-label="MS Realty — начало" style={{ display: 'inline-flex' }}>
            <Logo variant="reversed" height={30} />
          </a>
          <p className="site-ft__intro">Имоти за продажба и под наем в Сандански и Пирин, по Черноморието и в съседна Гърция — с местен офис и брокери, които говорят вашия език.</p>
          <div className="site-ft__contact">
            <span><Icon name="phone" size={16} /> +359 879 69 68 70</span>
            <span><Icon name="mail" size={16} /> ms.realty.bg@gmail.com</span>
            <span><Icon name="map-pin" size={16} /> Сандански</span>
          </div>
        </div>
        <div>
          <h4>Разгледайте</h4>
          <ul>
            <li><a onClick={() => onNavigate('results')}>Имоти за продажба</a></li>
            <li><a onClick={() => onNavigate('results')}>Имоти под наем</a></li>
            <li><a onClick={() => onNavigate('resorts')}>Ново строителство</a></li>
            <li><a onClick={() => onNavigate('resorts')}>Курорти и региони</a></li>
            <li><a onClick={() => onNavigate('home')}>Ръководство за купувача</a></li>
          </ul>
        </div>
        <div>
          <h4>Локации</h4>
          <ul>
            <li><a onClick={() => onNavigate('results')}>Свети Влас</a></li>
            <li><a onClick={() => onNavigate('results')}>Слънчев бряг</a></li>
            <li><a onClick={() => onNavigate('results')}>Банско</a></li>
            <li><a onClick={() => onNavigate('results')}>Сандански</a></li>
            <li><a onClick={() => onNavigate('results')}>Нафплио, Гърция</a></li>
          </ul>
        </div>
        <div>
          <h4>Компания</h4>
          <ul>
            <li><a onClick={() => onNavigate('contact')}>За нас</a></li>
            <li><a onClick={() => onNavigate('contact')}>Нашият офис</a></li>
            <li><a onClick={() => onNavigate('contact')}>Продайте с нас</a></li>
            <li><a onClick={() => onNavigate('contact')}>Кариери</a></li>
            <li><a onClick={() => onNavigate('contact')}>Контакти</a></li>
          </ul>
        </div>
      </div>
      <div className="site-ft__bar">
        <div className="site-ft__bar-in">
          <span>© 2026 MS Realty ЕООД. Всички права запазени.</span>
          <nav>
            <a onClick={() => onNavigate('home')}>Поверителност</a>
            <a onClick={() => onNavigate('home')}>Условия</a>
            <a onClick={() => onNavigate('home')}>Бисквитки</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { Wordmark, Header, Footer });
