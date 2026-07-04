/* Dashboard — KPIs, today's viewings, new leads, tasks, activity. */
const { StatTile, PageHeader, Panel, Timeline, TaskList, Avatar, StatusPill, Temp, Lang, Segmented } = window;

function Dashboard({ onOpenLead, onNavigate }) {
  const D = window.CRM_DATA;
  const { KPIS, VIEWINGS, VIEW_STATUS, LEADS, CRM_AGENTS, ACTIVITY, ACT_ICON, TASKS, STOCK, eur } = D;
  const DSc = window.MaklerRealtyDesignSystem_9b7f1e;
  const { Button, Icon } = DSc;

  const today = VIEWINGS.filter(v => v.day === 0 || v.day === 1);
  const newLeads = LEADS.filter(l => l.stage === 'new');
  const withNames = ACTIVITY.map(a => ({ ...a, agentName: CRM_AGENTS[a.agent]?.name }));

  return (
    <div className="crm-scroll">
      <div className="crm-wrap">
        <PageHeader title="Добро утро, Елена" subtitle="Събота, 4 юли 2026 · офис Сандански">
          <Segmented value="me" onChange={() => {}} options={[{ value: 'me', label: 'Моите' }, { value: 'team', label: 'Екип' }]} />
          <Button variant="primary" size="sm" iconStart="plus">Нов лийд</Button>
        </PageHeader>

        {/* KPIs */}
        <div className="crm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(168px,1fr))', marginBottom: 16 }}>
          <StatTile icon="users" tone="sea" label="Активни лийдове" value="12" delta={3} trend="up" note="тази седмица" />
          <StatTile icon="calendar-check" tone="sun" label="Огледи · седмица" value="9" delta={2} trend="up" note="насрочени" />
          <StatTile icon="file-text" tone="brick" label="Активни оферти" value="4" delta={0} trend="flat" note="€700K в игра" />
          <StatTile icon="handshake" tone="success" label="Сделки · месец" value="2" delta={1} trend="up" note="спечелени" />
          <StatTile icon="trending-up" tone="ink" label="Комисиона · месец" value="€14,900" delta={18} trend="up" note="спрямо май" />
        </div>

        <div className="crm-grid" style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'start' }}>
          {/* left column */}
          <div className="crm-grid">
            <Panel title="Днешни огледи" action="Виж календара →" onAction={() => onNavigate('calendar')}>
              <div>
                {today.map((v, i) => {
                  const ag = CRM_AGENTS[v.agent];
                  const st = VIEW_STATUS[v.status];
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderBottom: i < today.length - 1 ? '1px solid var(--border)' : 0 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500, color: 'var(--text-strong)', width: 92, flex: '0 0 auto' }}>
                        {D.WEEK[v.day].split(' ')[0]} {String(v.start).padStart(2, '0')}:00
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-strong)' }}>{v.lead}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{v.listing} · {v.listing === 'MS-svlas' ? 'Свети Влас' : 'оглед на място'}</div>
                      </div>
                      <span className="crm-pill" style={{ color: st.tone, background: 'color-mix(in srgb,' + st.tone + ' 12%, transparent)' }}>
                        <span className="crm-pill__dot" style={{ background: st.tone }} />{st.label}
                      </span>
                      <Avatar tone={ag.tone} initials={ag.initials} size={28} />
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Нови лийдове" action="Отвори фунията →" onAction={() => onNavigate('pipeline')}>
              <div style={{ padding: '6px 10px 10px' }}>
                {newLeads.map(l => {
                  const ag = CRM_AGENTS[l.agent];
                  return (
                    <div key={l.id} onClick={() => onOpenLead(l)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 8px', borderRadius: 10, cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <Avatar tone={ag.tone} initials={l.name.split(' ').map(w => w[0]).slice(0, 2).join('')} size={34} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-strong)' }}>{l.name}</span>
                          <Lang code={l.lang} />
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{l.interest}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5, color: 'var(--text-strong)' }}>{l.deal === 'rent' ? eur(l.budget) + '/мес' : eur(l.budget)}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>{l.lastAct}</div>
                      </div>
                      <Temp level={l.temp} />
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>

          {/* right column */}
          <div className="crm-grid">
            <Panel title="Задачи за днес" action="Всички">
              <div style={{ padding: '4px 18px 12px' }}><TaskList tasks={TASKS} /></div>
            </Panel>
            <Panel title="Последна активност">
              <div style={{ padding: '6px 18px 14px' }}><Timeline items={withNames} iconMap={ACT_ICON} /></div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
window.Dashboard = Dashboard;
