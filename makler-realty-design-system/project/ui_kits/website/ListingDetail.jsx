/* Listing detail: breadcrumb, gallery, specs, description, features, agent aside, similar. */
const LD_DS = window.MaklerRealtyDesignSystem_9b7f1e;
const { Breadcrumb: LDCrumb, Badge: LDBadge, Tag: LDTag, Button: LDButton, IconButton: LDIconButton,
        PropertyCard: LDCard, Icon: LDIcon, Rating: LDRating, Card: LDPanel } = LD_DS;
const { LISTINGS: LD_LISTINGS, AGENTS: LD_AGENTS, money: ldMoney } = window.MK_DATA;

const ldCss = `
.ld { max-width:var(--container-2xl); margin:0 auto; padding:20px var(--gutter) 64px; }
.ld-top { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin:14px 0 18px; }
.ld-top h1 { font-size:var(--text-3xl); line-height:1.1; }
.ld-top__loc { display:flex; align-items:center; gap:6px; color:var(--text-muted); margin-top:8px; font-size:var(--text-md); }
.ld-top__loc .mk-icon { color:var(--text-muted); }
.ld-top__acts { display:flex; gap:8px; flex:none; }

.ld-gallery { display:grid; grid-template-columns:1.9fr 1fr; grid-template-rows:1fr 1fr; gap:12px; height:470px; margin-bottom:12px; }
.ld-g { position:relative; border-radius:var(--radius-lg); overflow:hidden; }
.ld-g--main { grid-row:1 / span 2; }
.ld-g__badges { position:absolute; top:14px; left:14px; z-index:2; display:flex; gap:6px; }
.ld-g__save { position:absolute; top:12px; right:12px; z-index:2; display:flex; gap:8px; }
.ld-g__more { position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center; gap:8px; background:rgba(7,20,19,.5); color:#fff; font-weight:var(--fw-semibold); border:none; cursor:pointer; font-size:var(--text-md); -webkit-backdrop-filter:blur(2px); backdrop-filter:blur(2px); }

.ld-cols { display:grid; grid-template-columns:1fr 372px; gap:40px; align-items:start; margin-top:22px; }
.ld-specs { display:flex; gap:8px; background:var(--surface-sunken); border-radius:var(--radius-lg); padding:6px; margin-bottom:28px; }
.ld-spec { flex:1; display:flex; flex-direction:column; align-items:center; gap:5px; padding:16px 8px; }
.ld-spec .mk-icon { color:var(--brand); }
.ld-spec b { font-size:var(--text-lg); color:var(--text-strong); font-weight:var(--fw-semibold); }
.ld-spec span { font-size:var(--text-xs); color:var(--text-muted); letter-spacing:.04em; text-transform:uppercase; }
.ld-sec { margin-bottom:32px; }
.ld-sec h2 { font-size:var(--text-xl); margin-bottom:14px; }
.ld-sec p { font-size:var(--text-md); line-height:1.7; color:var(--text-body); max-width:64ch; }
.ld-feats { display:flex; flex-wrap:wrap; gap:9px; }
.ld-nearby { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:12px 28px; max-width:640px; }
.ld-nearby li { display:flex; align-items:center; gap:10px; font-size:var(--text-md); color:var(--text-body); padding:10px 0; border-bottom:1px solid var(--border); }
.ld-nearby .mk-icon { color:var(--text-muted); flex:none; }

.ld-aside { position:sticky; top:92px; }
.ld-price { font-family:var(--font-display); font-weight:var(--fw-semibold); font-size:var(--text-4xl); color:var(--price); letter-spacing:var(--tracking-tight); line-height:1; }
.ld-price span { font-family:var(--font-sans); font-size:var(--text-md); color:var(--text-muted); font-weight:var(--fw-medium); }
.ld-agent { display:flex; align-items:center; gap:12px; margin:20px 0; padding-top:18px; border-top:1px solid var(--border); }
.ld-agent__av { width:52px; height:52px; border-radius:var(--radius-full); flex:none; }
.ld-agent b { display:block; font-size:var(--text-md); color:var(--text-strong); font-weight:var(--fw-semibold); }
.ld-agent span { font-size:var(--text-sm); color:var(--text-muted); }
.ld-aside__btns { display:flex; flex-direction:column; gap:10px; }
.ld-aside__ref { display:flex; align-items:center; justify-content:space-between; margin-top:16px; font-family:var(--font-mono); font-size:var(--text-xs); color:var(--text-subtle); }
.ld-trust { display:flex; align-items:center; gap:8px; margin-top:14px; font-size:var(--text-sm); color:var(--text-muted); }
.ld-trust .mk-icon { color:var(--success-500); }

.ld-similar { max-width:var(--container-2xl); margin:0 auto; padding:0 var(--gutter) 64px; }
.ld-similar h2 { font-size:var(--text-2xl); margin-bottom:22px; }
.ld-similar__grid { display:grid; grid-template-columns:repeat(4,1fr); gap:20px; }
.ld-similar__grid .mk-pcard { cursor:pointer; }
@media (max-width:1080px){ .ld-cols{ grid-template-columns:1fr; } .ld-aside{ position:static; } .ld-similar__grid{ grid-template-columns:repeat(2,1fr);} }
`;
if (!document.getElementById('mk-ld-css')) { const s=document.createElement('style'); s.id='mk-ld-css'; s.textContent=ldCss; document.head.appendChild(s); }

const THUMB_TONES = ['sand', 'sky', 'pine', 'sunset'];

function ListingDetail({ listing, onNavigate, onOpenListing, onBook }) {
  const [saved, setSaved] = React.useState(false);
  const agent = LD_AGENTS[listing.agent];
  const similar = LD_LISTINGS.filter(l => l.id !== listing.id).slice(0, 4);
  const thumbTone = (i) => THUMB_TONES[i % THUMB_TONES.length];

  return (
    <main>
      <div className="ld">
        <LDCrumb items={[
          { label: 'Начало', href: '#' },
          { label: listing.deal === 'rent' ? 'Под наем' : 'Продажба', href: '#' },
          { label: listing.region, href: '#' },
          { label: listing.location },
        ]} />

        <div className="ld-top">
          <div>
            <h1>{listing.title}</h1>
            <div className="ld-top__loc"><LDIcon name="map-pin" size={17} /> {listing.location} · {listing.region}</div>
          </div>
          <div className="ld-top__acts">
            <LDButton variant="secondary" iconStart="share-2">Сподели</LDButton>
            <LDButton variant={saved ? 'subtle' : 'secondary'} iconStart="heart" onClick={() => setSaved(s => !s)}>
              {saved ? 'Запазено' : 'Запази'}
            </LDButton>
          </div>
        </div>

        <div className="ld-gallery">
          <div className={`ld-g ld-g--main mk-photo mk-photo--${listing.tone}`}>
            <div className="ld-g__badges">{listing.badges.map((b, i) => <LDBadge key={i} variant={b.variant} solid>{b.label}</LDBadge>)}</div>
            <div className="ld-g__save">
              <LDIconButton icon="share-2" label="Share" variant="glass" round />
              <LDIconButton icon="heart" label="Save" variant="glass" round active={saved} onClick={() => setSaved(s => !s)} />
            </div>
          </div>
          <div className={`ld-g mk-photo mk-photo--${thumbTone(0)}`}></div>
          <div className={`ld-g mk-photo mk-photo--${thumbTone(1)}`}>
            <button className="ld-g__more" onClick={() => {}}><LDIcon name="camera" size={18} /> Виж всички {listing.photos} снимки</button>
          </div>
        </div>

        <div className="ld-cols">
          <div>
            <div className="ld-specs">
              <div className="ld-spec"><LDIcon name="bed" size={22} /><b>{listing.beds}</b><span>Спални</span></div>
              <div className="ld-spec"><LDIcon name="bath" size={22} /><b>{listing.baths}</b><span>Бани</span></div>
              <div className="ld-spec"><LDIcon name="ruler" size={22} /><b>{listing.area}</b><span>кв.м</span></div>
              <div className="ld-spec"><LDIcon name="building-2" size={22} /><b>{listing.floor}</b><span>Етаж</span></div>
              <div className="ld-spec"><LDIcon name="calendar" size={22} /><b>{listing.year}</b><span>Строеж</span></div>
            </div>

            <div className="ld-sec">
              <h2>За имота</h2>
              <p>{listing.desc}</p>
            </div>
            <div className="ld-sec">
              <h2>Характеристики</h2>
              <div className="ld-feats">
                {listing.features.map(f => <LDTag key={f} variant="neutral" icon="check">{f}</LDTag>)}
              </div>
            </div>
            <div className="ld-sec">
              <h2>В района</h2>
              <ul className="ld-nearby">
                {listing.nearby.map(n => <li key={n}><LDIcon name="map-pin" size={16} /> {n}</li>)}
              </ul>
            </div>
          </div>

          <aside className="ld-aside">
            <LDPanel elevated padding="lg">
              <div className="ld-price">{ldMoney(listing.price)}{listing.per && <span>{listing.per}</span>}</div>
              {!listing.per && <LDRating value={listing.rating} showValue count={listing.reviews} />}
              <div className="ld-agent">
                <div className={`ld-agent__av mk-photo mk-photo--${agent.tone}`}></div>
                <div>
                  <b>{agent.name}</b>
                  <span>{agent.office}</span>
                </div>
              </div>
              <div className="ld-aside__btns">
                <LDButton variant="accent" size="lg" iconStart="calendar" fullWidth onClick={onBook}>Запази оглед</LDButton>
                <LDButton variant="secondary" size="lg" iconStart="phone" fullWidth onClick={onBook}>Заяви обаждане</LDButton>
              </div>
              <div className="ld-trust"><LDIcon name="shield-check" size={16} /> Проверена обява · брокерът отговаря до ~1 час</div>
              <div className="ld-aside__ref"><span>Реф. {listing.ref}</span><span>{agent.phone}</span></div>
            </LDPanel>
          </aside>
        </div>
      </div>

      <div className="ld-similar">
        <h2>Подобни имоти наблизо</h2>
        <div className="ld-similar__grid">
          {similar.map(l => (
            <LDCard key={l.id} tone={l.tone} badges={l.badges} price={ldMoney(l.price)} per={l.per}
              title={l.title} location={l.location} beds={l.beds} baths={l.baths} area={l.area}
              photos={l.photos} reference={l.ref}
              onClick={(e) => { e.preventDefault(); onOpenListing(l.id); }} />
          ))}
        </div>
      </div>
    </main>
  );
}

Object.assign(window, { ListingDetail });
