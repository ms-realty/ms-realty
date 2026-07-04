/* Home page: hero search, resort browse, featured listings, value props, sell CTA. */
const HP_DS = window.MaklerRealtyDesignSystem_9b7f1e;
const { SearchBar: HPSearchBar, PropertyCard: HPCard, Button: HPButton, Icon: HPIcon, Badge: HPBadge } = HP_DS;
const { LISTINGS: HP_LISTINGS, RESORTS: HP_RESORTS, money: hpMoney } = window.MK_DATA;

const homeCss = `
.hp-hero { position:relative; min-height:600px; display:flex; align-items:center; }
.hp-hero__bg { position:absolute; inset:0; }
.hp-hero__bg::before { content:""; position:absolute; inset:0; background:linear-gradient(90deg, rgba(7,20,19,.62) 0%, rgba(7,20,19,.30) 46%, rgba(7,20,19,0) 74%); z-index:1; }
.hp-hero__in { position:relative; z-index:2; max-width:var(--container-2xl); margin:0 auto; padding:0 var(--gutter); width:100%; }
.hp-hero__copy { max-width:640px; color:#fff; margin-bottom:26px; }
.hp-hero__eyebrow { display:inline-flex; align-items:center; gap:7px; font-size:var(--text-sm); font-weight:var(--fw-semibold); letter-spacing:.1em; text-transform:uppercase; color:var(--stone-200); margin-bottom:16px; }
.hp-hero h1 { font-size:var(--display-lg); color:#fff; line-height:1.04; margin-bottom:16px; }
.hp-hero p { font-size:var(--text-xl); color:rgba(255,255,255,.9); line-height:1.5; font-weight:var(--fw-regular); }
.hp-hero__search { max-width:940px; }

.hp-sec { max-width:var(--container-2xl); margin:0 auto; padding:var(--section-y) var(--gutter); }
.hp-sec__head { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:28px; }
.hp-sec__head h2 { font-size:var(--text-3xl); }
.hp-sec__head p { color:var(--text-muted); margin-top:6px; font-size:var(--text-md); }

.hp-resorts { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
.hp-resort { position:relative; height:200px; border-radius:var(--radius-lg); overflow:hidden; text-decoration:none; box-shadow:var(--shadow-sm); transition:transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-standard); }
.hp-resort:hover { transform:translateY(-3px); box-shadow:var(--shadow-lg); }
.hp-resort__t { position:absolute; inset:auto 0 0 0; padding:18px 18px 16px; z-index:2; color:#fff; }
.hp-resort__t h3 { color:#fff; font-size:var(--text-xl); }
.hp-resort__t span { font-size:var(--text-sm); color:rgba(255,255,255,.85); }
.hp-resort__c { position:absolute; top:12px; right:12px; z-index:2; background:rgba(255,255,255,.9); color:var(--brand); font-size:var(--text-xs); font-weight:var(--fw-semibold); padding:5px 10px; border-radius:var(--radius-full); -webkit-backdrop-filter:blur(4px); backdrop-filter:blur(4px); }

.hp-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:20px; }
.hp-grid .mk-pcard { cursor:pointer; }

.hp-values { background:var(--surface-sunken); }
.hp-values__in { max-width:var(--container-2xl); margin:0 auto; padding:var(--section-y-sm) var(--gutter); display:grid; grid-template-columns:repeat(3,1fr); gap:36px; }
.hp-value { display:flex; flex-direction:column; gap:10px; }
.hp-value__ic { width:48px; height:48px; border-radius:var(--radius-md); background:var(--brand-subtle); color:var(--brand); display:grid; place-items:center; }
.hp-value h3 { font-size:var(--text-xl); }
.hp-value p { color:var(--text-body); line-height:1.6; }

.hp-sell { position:relative; overflow:hidden; background:var(--surface-inverse); }
.hp-sell__in { max-width:var(--container-2xl); margin:0 auto; padding:var(--section-y-sm) var(--gutter); display:flex; align-items:center; justify-content:space-between; gap:30px; position:relative; z-index:2; }
.hp-sell__glow { position:absolute; inset:0; background:radial-gradient(60% 120% at 88% 30%, rgba(206,55,51,.4), transparent 60%); z-index:1; }
.hp-sell h2 { color:#fff; font-size:var(--text-3xl); max-width:20ch; }
.hp-sell p { color:var(--stone-300); margin-top:8px; font-size:var(--text-lg); max-width:46ch; }
@media (max-width:1080px){ .hp-resorts{ grid-template-columns:repeat(2,1fr);} .hp-grid{ grid-template-columns:repeat(2,1fr);} .hp-values__in{ grid-template-columns:1fr;} }
`;
if (!document.getElementById('mk-home-css')) { const s=document.createElement('style'); s.id='mk-home-css'; s.textContent=homeCss; document.head.appendChild(s); }

function ResortCard({ r, onNavigate }) {
  return (
    <a className={`hp-resort mk-photo mk-photo--${r.tone}`} onClick={(e) => { e.preventDefault(); onNavigate('results'); }} href="#">
      <span className="hp-resort__c">{r.count} имота</span>
      <div className="hp-resort__t">
        <h3>{r.name}</h3>
        <span>{r.region}</span>
      </div>
    </a>
  );
}

function HomePage({ onNavigate, onOpenListing, onSearch }) {
  const featured = HP_LISTINGS.slice(0, 4);
  return (
    <main>
      <section className="hp-hero">
        <div className="hp-hero__bg mk-photo mk-photo--pine"></div>
        <div className="hp-hero__in">
          <div className="hp-hero__copy">
            <span className="hp-hero__eyebrow"><HPIcon name="compass" size={15} /> Сандански · Пирин · Черноморие</span>
            <h1>Намерете своя дом в Пирин и по морето.</h1>
            <p>Имоти за продажба и наем в спа курорта Сандански, ски курорта Банско, Благоевградско и по Черноморието.</p>
          </div>
          <div className="hp-hero__search">
            <HPSearchBar size="lg" onSearch={(q) => onSearch(q)} />
          </div>
        </div>
      </section>

      <section className="hp-sec">
        <div className="hp-sec__head">
          <div>
            <h2>Разгледайте по курорт</h2>
            <p>Шест региона, които местните ни офиси познават до всяка улица.</p>
          </div>
          <HPButton variant="secondary" iconEnd="arrow-right" onClick={() => onNavigate('resorts')}>Всички локации</HPButton>
        </div>
        <div className="hp-resorts">
          {HP_RESORTS.map(r => <ResortCard key={r.slug} r={r} onNavigate={onNavigate} />)}
        </div>
      </section>

      <section className="hp-sec" style={{ paddingTop: 0 }}>
        <div className="hp-sec__head">
          <div>
            <h2>Избрани имоти</h2>
            <p>Подбрани имоти, нови на пазара тази седмица.</p>
          </div>
          <HPButton variant="secondary" iconEnd="arrow-right" onClick={() => onNavigate('results')}>Виж всички обяви</HPButton>
        </div>
        <div className="hp-grid">
          {featured.map(l => (
            <HPCard key={l.id} tone={l.tone} badges={l.badges}
              price={l.per ? hpMoney(l.price) : hpMoney(l.price)} per={l.per}
              title={l.title} location={l.location}
              beds={l.beds} baths={l.baths} area={l.area} photos={l.photos} reference={l.ref}
              onClick={(e) => { e.preventDefault(); onOpenListing(l.id); }} />
          ))}
        </div>
      </section>

      <section className="hp-values">
        <div className="hp-values__in">
          <div className="hp-value">
            <div className="hp-value__ic"><HPIcon name="languages" size={24} /></div>
            <h3>Говорим вашия език</h3>
            <p>Всяка обява и всеки наш брокер говорят на български, английски, немски, нидерландски и руски — нищо не се губи между огледа и ключовете.</p>
          </div>
          <div className="hp-value">
            <div className="hp-value__ic"><HPIcon name="map-pin" size={24} /></div>
            <h3>Местни офиси, истински ключове</h3>
            <p>Екипи на място в Сандански, Свети Влас и Банско, които могат да отворят вратата още днес следобед.</p>
          </div>
          <div className="hp-value">
            <div className="hp-value__ic"><HPIcon name="file-check" size={24} /></div>
            <h3>Грижим се за сделката</h3>
            <p>Адвокати, нотариус, превод и управление след покупката — организирани от край до край за купувачи от чужбина.</p>
          </div>
        </div>
      </section>

      <section className="hp-sell">
        <div className="hp-sell__glow"></div>
        <div className="hp-sell__in">
          <div>
            <h2>Мислите да продадете имот в Сандански или Пирин?</h2>
            <p>Безплатна оценка и професионални снимки от екип, който предлага на купувачи в няколко държави.</p>
          </div>
          <HPButton variant="accent" size="lg" iconStart="phone" onClick={() => onNavigate('contact')}>Заявете оценка</HPButton>
        </div>
      </section>
    </main>
  );
}

Object.assign(window, { HomePage });
