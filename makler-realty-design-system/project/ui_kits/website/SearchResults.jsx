/* Search results: sticky search bar, filter sidebar, listing rows, pagination. */
const SR_DS = window.MaklerRealtyDesignSystem_9b7f1e;
const { SearchBar: SRSearchBar, PropertyCard: SRCard, Button: SRButton, Select: SRSelect,
        Checkbox: SRCheckbox, Radio: SRRadio, Tag: SRTag, Icon: SRIcon, Pagination: SRPagination,
        IconButton: SRIconButton } = SR_DS;
const { LISTINGS: SR_LISTINGS, money: srMoney } = window.MK_DATA;

const srCss = `
.sr-subbar { position:sticky; top:72px; z-index:30; background:var(--surface); border-bottom:1px solid var(--border); box-shadow:var(--shadow-xs); }
.sr-subbar__in { max-width:var(--container-2xl); margin:0 auto; padding:14px var(--gutter); }
.sr-body { max-width:var(--container-2xl); margin:0 auto; padding:24px var(--gutter) 64px; display:grid; grid-template-columns:300px 1fr; gap:28px; align-items:start; }
.sr-filters { position:sticky; top:158px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-card); padding:20px; box-shadow:var(--shadow-xs); }
.sr-filters h3 { font-family:var(--font-sans); font-size:var(--text-base); font-weight:var(--fw-semibold); color:var(--text-strong); }
.sr-fg { padding:16px 0; border-bottom:1px solid var(--border); }
.sr-fg:last-of-type { border-bottom:none; }
.sr-fg > label.hdr { display:block; font-size:var(--text-xs); font-weight:var(--fw-semibold); letter-spacing:.08em; text-transform:uppercase; color:var(--text-muted); margin-bottom:11px; }
.sr-fg__col { display:flex; flex-direction:column; gap:10px; }
.sr-fg__row { display:flex; gap:10px; }
.sr-beds { display:flex; gap:6px; }
.sr-beds button { flex:1; height:38px; border:1px solid var(--border-strong); background:var(--surface); border-radius:var(--radius-sm); font:inherit; font-size:var(--text-sm); font-weight:var(--fw-medium); color:var(--text-body); cursor:pointer; transition:all var(--dur-fast) var(--ease-standard); }
.sr-beds button[aria-pressed="true"] { background:var(--brand); border-color:var(--brand); color:#fff; }

.sr-results__head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:8px; }
.sr-results__head h1 { font-size:var(--text-2xl); }
.sr-results__head h1 small { display:block; font-family:var(--font-sans); font-size:var(--text-sm); font-weight:var(--fw-regular); color:var(--text-muted); letter-spacing:0; margin-top:3px; }
.sr-results__tools { display:flex; align-items:center; gap:12px; flex:none; }
.sr-active { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 20px; }
.sr-list { display:flex; flex-direction:column; gap:18px; }
.sr-list .mk-pcard { cursor:pointer; }
.sr-pager { display:flex; justify-content:center; margin-top:34px; }
@media (max-width:1080px){ .sr-body{ grid-template-columns:1fr; } .sr-filters{ position:static; } }
`;
if (!document.getElementById('mk-sr-css')) { const s=document.createElement('style'); s.id='mk-sr-css'; s.textContent=srCss; document.head.appendChild(s); }

function SearchResults({ onNavigate, onOpenListing, query }) {
  const [beds, setBeds] = React.useState('Всички');
  const [sort, setSort] = React.useState('Най-подходящи');
  const [page, setPage] = React.useState(1);
  const [chips, setChips] = React.useState(['Изглед море', 'Обзаведен']);
  const loc = (query && query.location) || 'Черноморие';

  return (
    <main>
      <div className="sr-subbar">
        <div className="sr-subbar__in">
          <SRSearchBar size="md" defaultDeal={query && query.deal}
            locationPlaceholder={loc} onSearch={() => setPage(1)} />
        </div>
      </div>

      <div className="sr-body">
        <aside className="sr-filters">
          <h3>Филтри</h3>
          <div className="sr-fg">
            <label className="hdr">Сделка</label>
            <div className="sr-fg__col">
              <SRRadio name="deal" label="Продажба" defaultChecked />
              <SRRadio name="deal" label="Под наем" />
              <SRRadio name="deal" label="Ново строителство" />
            </div>
          </div>
          <div className="sr-fg">
            <label className="hdr">Ценови диапазон (€)</label>
            <div className="sr-fg__row">
              <SRSelect size="sm" defaultValue="Без мин." options={['Без мин.','25,000','50,000','100,000','200,000']} />
              <SRSelect size="sm" defaultValue="Без макс." options={['Без макс.','100,000','250,000','500,000','1,000,000']} />
            </div>
          </div>
          <div className="sr-fg">
            <label className="hdr">Спални</label>
            <div className="sr-beds">
              {['Всички','1','2','3','4+'].map(b => (
                <button key={b} aria-pressed={beds === b} onClick={() => setBeds(b)}>{b}</button>
              ))}
            </div>
          </div>
          <div className="sr-fg">
            <label className="hdr">Тип имот</label>
            <SRSelect size="sm" iconStart="house" defaultValue="Всички"
              options={['Всички','Апартамент','Къща','Вила','Студио','Парцел']} />
          </div>
          <div className="sr-fg">
            <label className="hdr">Задължително</label>
            <div className="sr-fg__col">
              <SRCheckbox label="Изглед море" defaultChecked />
              <SRCheckbox label="Басейн" />
              <SRCheckbox label="Обзаведен" defaultChecked />
              <SRCheckbox label="Паркинг" />
              <SRCheckbox label="Балкон / тераса" />
            </div>
          </div>
          <div className="sr-fg__row" style={{ paddingTop: 16 }}>
            <SRButton variant="primary" fullWidth>Приложи филтрите</SRButton>
          </div>
        </aside>

        <section className="sr-results">
          <div className="sr-results__head">
            <h1>Имоти за продажба<small>{SR_LISTINGS.length * 27} имота близо до {loc}</small></h1>
            <div className="sr-results__tools">
              <SRSelect size="sm" value={sort} onChange={(e) => setSort(e.target.value)}
                options={['Най-подходящи','Най-нови','Цена: ниска към висока','Цена: висока към ниска']} />
              <SRIconButton icon="map" label="Карта" variant="outline" />
            </div>
          </div>
          <div className="sr-active">
            {chips.map(c => (
              <SRTag key={c} variant="outline" onRemove={() => setChips(chips.filter(x => x !== c))}>{c}</SRTag>
            ))}
            {chips.length > 0 && <SRTag onClick={() => setChips([])}>Изчисти</SRTag>}
          </div>
          <div className="sr-list">
            {SR_LISTINGS.map(l => (
              <SRCard key={l.id} orientation="horizontal" tone={l.tone} badges={l.badges}
                price={srMoney(l.price)} per={l.per} title={l.title} location={l.location}
                beds={l.beds} baths={l.baths} area={l.area} photos={l.photos} reference={l.ref}
                onClick={(e) => { e.preventDefault(); onOpenListing(l.id); }} />
            ))}
          </div>
          <div className="sr-pager">
            <SRPagination page={page} totalPages={27} onChange={setPage} />
          </div>
        </section>
      </div>
    </main>
  );
}

Object.assign(window, { SearchResults });
