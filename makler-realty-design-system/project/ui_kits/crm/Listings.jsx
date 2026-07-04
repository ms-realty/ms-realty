/* Listings — the agency's managed stock, with statuses & performance. */
function Listings() {
  const D = window.CRM_DATA;
  const { STOCK, STOCK_STATUS, CRM_AGENTS, eur } = D;
  const { PageHeader, Panel, DataTable, Avatar, Segmented } = window;
  const { Button, Badge, Icon } = window.MaklerRealtyDesignSystem_9b7f1e;
  const [status, setStatus] = React.useState('all');

  const rows = status === 'all' ? STOCK : STOCK.filter(s => s.status === status);
  const counts = Object.keys(STOCK_STATUS).reduce((a, k) => (a[k] = STOCK.filter(s => s.status === k).length, a), {});
  const tone = (loc) => loc.includes('Влас') ? 'sea' : loc.includes('Банско') ? 'pine' : loc.includes('Гърция') ? 'sunset' : 'sand';

  const columns = [
    { key: 'title', label: 'Имот', render: r => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className={'mk-photo mk-photo--' + tone(r.location)} style={{ width: 52, height: 40, borderRadius: 7, flex: '0 0 auto' }} />
        <div style={{ minWidth: 0 }}>
          <div className="crm-tbl__primary">{r.title}</div>
          <div className="crm-tbl__muted"><span className="crm-mono">{r.ref}</span> · {r.type} · {r.area} m²</div>
        </div>
      </div>
    ) },
    { key: 'location', label: 'Локация', render: r => <span className="crm-tbl__muted">{r.location}</span> },
    { key: 'price', label: 'Цена', align: 'right', sort: r => r.price, render: r => <span className="crm-price">{r.deal === 'rent' ? eur(r.price) + '/мес' : eur(r.price)}</span> },
    { key: 'status', label: 'Статус', sort: r => r.status, render: r => <Badge variant={STOCK_STATUS[r.status].badge} size="sm">{STOCK_STATUS[r.status].label}</Badge> },
    { key: 'views', label: 'Показвания', align: 'right', sort: r => r.views, render: r => <span>{r.views.toLocaleString('en-US')}</span> },
    { key: 'enquiries', label: 'Запитвания', align: 'right', sort: r => r.enquiries, render: r => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: r.enquiries > 20 ? 600 : 400, color: r.enquiries > 20 ? 'var(--brick-700)' : 'inherit' }}>
        {r.enquiries > 20 && <Icon name="flame" size={13} />}{r.enquiries}
      </span>
    ) },
    { key: 'agent', label: 'Брокер', sort: r => CRM_AGENTS[r.agent].name, render: r => {
      const a = CRM_AGENTS[r.agent];
      return <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Avatar tone={a.tone} initials={a.initials} size={24} /><span style={{ fontSize: 12.5 }}>{a.name.split(' ')[0]}</span></div>;
    } },
    { key: 'listed', label: 'Публикувана', sort: r => r.listed, render: r => <span className="crm-tbl__muted">{r.listed.slice(5)}</span> },
  ];

  const filters = [{ value: 'all', label: 'Всички · ' + STOCK.length }].concat(
    Object.entries(STOCK_STATUS).map(([k, v]) => ({ value: k, label: v.label + ' · ' + counts[k] }))
  );

  return (
    <div className="crm-scroll">
      <div className="crm-wrap">
        <PageHeader title="Имоти" subtitle={STOCK.length + ' обекта в портфолиото · ' + counts.active + ' активни, ' + counts.reserved + ' резервирани'}>
          <Button variant="secondary" size="sm" iconStart="download">Експорт</Button>
          <Button variant="primary" size="sm" iconStart="plus">Нов имот</Button>
        </PageHeader>
        <div style={{ marginBottom: 16 }}>
          <Segmented value={status} onChange={setStatus} options={filters} />
        </div>
        <Panel><div style={{ overflowX: 'auto' }}><DataTable columns={columns} rows={rows} onRow={() => {}} /></div></Panel>
      </div>
    </div>
  );
}
window.Listings = Listings;
