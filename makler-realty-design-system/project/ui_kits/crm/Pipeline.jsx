/* Pipeline — kanban board of leads by stage. */
function Pipeline({ onOpenLead }) {
  const D = window.CRM_DATA;
  const { STAGES, LEADS, CRM_AGENTS, eur } = D;
  const { PageHeader, KanbanCard, Segmented } = window;
  const { Button, Icon } = window.MaklerRealtyDesignSystem_9b7f1e;
  const [deal, setDeal] = React.useState('all');

  const leads = deal === 'all' ? LEADS : LEADS.filter(l => l.deal === deal);
  const byStage = (k) => leads.filter(l => l.stage === k);
  const stageValue = (k) => byStage(k).reduce((s, l) => s + (l.deal === 'rent' ? 0 : l.budget), 0);

  return (
    <div className="crm-scroll">
      <div className="crm-wrap" style={{ maxWidth: 1400 }}>
        <PageHeader title="Лийдове" subtitle={leads.length + ' активни лийда · €' + (stageValue('new') + stageValue('viewing') + stageValue('offer')).toLocaleString('en-US') + ' потенциал'}>
          <Segmented value={deal} onChange={setDeal} options={[{ value: 'all', label: 'Всички' }, { value: 'sale', label: 'Продажба' }, { value: 'rent', label: 'Наем' }]} />
          <Button variant="secondary" size="sm" iconStart="sliders-horizontal">Филтри</Button>
          <Button variant="primary" size="sm" iconStart="plus">Нов лийд</Button>
        </PageHeader>

        <div className="crm-kb">
          {STAGES.map(st => {
            const items = byStage(st.key);
            const val = stageValue(st.key);
            return (
              <div className="crm-kb__col" key={st.key}>
                <div className="crm-kb__hd">
                  <b>{st.label}</b>
                  <span className="crm-kb__count">{items.length}</span>
                  {val > 0 && <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 12.5, color: 'var(--text-muted)' }}>€{val.toLocaleString('en-US')}</span>}
                </div>
                <div className="crm-kb__hint">{st.hint}</div>
                <div className="crm-kb__list">
                  {items.map(l => <KanbanCard key={l.id} lead={l} agent={CRM_AGENTS[l.agent]} onOpen={onOpenLead} />)}
                  <button className="crm-nav" style={{ color: 'var(--text-subtle)', justifyContent: 'center', border: '1px dashed var(--border-strong)', background: 'transparent', borderRadius: 11, padding: '9px' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--text-body)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-subtle)'}>
                    <Icon name="plus" size={15} /> Добави
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
window.Pipeline = Pipeline;
