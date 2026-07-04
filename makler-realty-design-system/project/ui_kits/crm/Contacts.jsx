/* Contacts — directory table with type filter. */
function Contacts() {
  const D = window.CRM_DATA;
  const { CONTACTS, CONTACT_TYPE, CRM_AGENTS, LANGS } = D;
  const { PageHeader, Panel, DataTable, Avatar, StatusPill, Lang, Segmented } = window;
  const { Button, Icon } = window.MaklerRealtyDesignSystem_9b7f1e;
  const [type, setType] = React.useState('all');

  const rows = type === 'all' ? CONTACTS : CONTACTS.filter(c => c.type === type);
  const counts = Object.keys(CONTACT_TYPE).reduce((a, k) => (a[k] = CONTACTS.filter(c => c.type === k).length, a), {});

  const columns = [
    { key: 'name', label: 'Име', render: r => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <Avatar tone={CONTACT_TYPE[r.type].tone} initials={r.name.split(' ').map(w => w[0]).slice(0, 2).join('')} size={32} />
        <div>
          <div className="crm-tbl__primary">{r.name}</div>
          <div className="crm-tbl__muted crm-mono">{r.id}</div>
        </div>
      </div>
    ) },
    { key: 'type', label: 'Тип', sort: r => r.type, render: r => <StatusPill tone={CONTACT_TYPE[r.type].tone} label={CONTACT_TYPE[r.type].label} /> },
    { key: 'lang', label: 'Език', render: r => <Lang code={r.lang} /> },
    { key: 'location', label: 'Локация', render: r => <span className="crm-tbl__muted">{r.location}</span> },
    { key: 'phone', label: 'Телефон', render: r => <span className="crm-mono">{r.phone}</span> },
    { key: 'props', label: 'Имоти', align: 'center', render: r => r.props ? <span style={{ fontWeight: 600 }}>{r.props}</span> : <span className="crm-tbl__muted">—</span> },
    { key: 'agent', label: 'Брокер', sort: r => CRM_AGENTS[r.agent].name, render: r => {
      const a = CRM_AGENTS[r.agent];
      return <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Avatar tone={a.tone} initials={a.initials} size={24} /><span style={{ fontSize: 12.5 }}>{a.name.split(' ')[0]}</span></div>;
    } },
    { key: 'last', label: 'Контакт', render: r => <span className="crm-tbl__muted">{r.last.slice(5)}</span> },
    { key: 'act', label: '', sortable: false, align: 'right', render: () => <Icon name="chevron-right" size={16} style={{ color: 'var(--text-subtle)' }} /> },
  ];

  const filters = [{ value: 'all', label: 'Всички · ' + CONTACTS.length }].concat(
    Object.entries(CONTACT_TYPE).map(([k, v]) => ({ value: k, label: v.label + ' · ' + counts[k] }))
  );

  return (
    <div className="crm-scroll">
      <div className="crm-wrap">
        <PageHeader title="Контакти" subtitle={CONTACTS.length + ' контакта · купувачи, продавачи, наематели и наемодатели'}>
          <Button variant="secondary" size="sm" iconStart="upload">Импорт</Button>
          <Button variant="primary" size="sm" iconStart="plus">Нов контакт</Button>
        </PageHeader>
        <div style={{ marginBottom: 16 }}>
          <Segmented value={type} onChange={setType} options={filters} />
        </div>
        <Panel><div style={{ overflowX: 'auto' }}><DataTable columns={columns} rows={rows} onRow={() => {}} /></div></Panel>
      </div>
    </div>
  );
}
window.Contacts = Contacts;
