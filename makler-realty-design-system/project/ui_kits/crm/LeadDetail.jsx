/* Lead detail — facts, stage stepper, matched listings, notes/activity, tasks. */
function LeadDetail({ lead, onBack, onOpenListing }) {
  const D = window.CRM_DATA;
  const { CRM_AGENTS, STAGES, STOCK, STOCK_STATUS, ACT_ICON, LANGS, SOURCES, eur } = D;
  const { Avatar, Temp, Lang, StatusPill, Panel, Timeline, TaskList } = window;
  const { Button, IconButton, Icon, Badge } = window.MaklerRealtyDesignSystem_9b7f1e;

  const ag = CRM_AGENTS[lead.agent];
  const src = SOURCES[lead.source];
  const matched = (lead.matched || []).map(id => STOCK.find(s => s.id === id)).filter(Boolean);
  const stageIdx = STAGES.findIndex(s => s.key === lead.stage);

  const feed = [
    lead.offer && { type: 'offer', agentName: ag.name, text: 'Подадена оферта ' + eur(lead.offer) + (lead.matched ? ' за ' + STOCK.find(s => s.id === lead.matched[0])?.ref : ''), time: lead.lastAct },
    { type: 'viewing', agentName: ag.name, text: 'Оглед на ' + (matched[0]?.ref || 'имот') + ' — клиентът остана впечатлен', time: 'преди 2 дни' },
    { type: 'call', agentName: ag.name, text: 'Изходящо обаждане (8 мин) — уточнени критерии за търсене', time: 'преди 3 дни' },
    { type: 'note', agentName: ag.name, text: 'Бюджет до ' + eur(lead.budget) + '. Интерес: ' + lead.interest.toLowerCase() + '.', time: lead.created },
    { type: 'lead', agentName: ag.name, text: 'Лийд създаден от ' + src.label, time: lead.created },
  ].filter(Boolean);

  const leadTasks = D.TASKS.filter(t => t.lead === lead.name);

  const Fact = ({ icon, label, children }) => (
    <div style={{ display: 'flex', gap: 11, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <Icon name={icon} size={17} style={{ color: 'var(--text-subtle)', flex: '0 0 auto', marginTop: 1 }} />
      <div>
        <div style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-strong)' }}>{children}</div>
      </div>
    </div>
  );

  return (
    <div className="crm-scroll">
      <div className="crm-wrap">
        <button className="crm-nav" style={{ width: 'auto', color: 'var(--text-muted)', padding: '6px 10px 6px 0', marginBottom: 8 }} onClick={onBack}>
          <Icon name="arrow-left" size={16} /> Обратно към лийдовете
        </button>

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
          <Avatar tone={ag.tone} initials={lead.name.split(' ').map(w => w[0]).slice(0, 2).join('')} size={54} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 25, letterSpacing: '-.015em', color: 'var(--text-strong)' }}>{lead.name}</h1>
              <Temp level={lead.temp} />
              <Lang code={lead.lang} />
            </div>
            <div style={{ marginTop: 5, fontSize: 13.5, color: 'var(--text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span className="crm-mono">{lead.id}</span>
              <span><Icon name={src.icon} size={13} style={{ verticalAlign: '-2px' }} /> {src.label}</span>
              <span>{lead.deal === 'rent' ? 'Търси под наем' : 'Купувач'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 9 }}>
            <Button variant="secondary" size="sm" iconStart="phone">Обади се</Button>
            <Button variant="secondary" size="sm" iconStart="mail">Имейл</Button>
            <Button variant="primary" size="sm" iconStart="calendar-plus">Насрочи оглед</Button>
          </div>
        </div>

        {/* stage stepper */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
          {STAGES.map((s, i) => (
            <div key={s.key} style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: i <= stageIdx ? 'var(--ink-800)' : 'var(--stone-100)', color: i <= stageIdx ? '#fff' : 'var(--text-muted)', position: 'relative' }}>
              <div style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: '.06em', textTransform: 'uppercase', opacity: i <= stageIdx ? .7 : 1 }}>Етап {i + 1}</div>
              <div style={{ fontWeight: 600, fontSize: 13.5, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                {i < stageIdx && <Icon name="check" size={14} />}{s.label}
              </div>
            </div>
          ))}
        </div>

        <div className="crm-grid" style={{ gridTemplateColumns: '1fr 340px', alignItems: 'start' }}>
          {/* main */}
          <div className="crm-grid">
            <Panel title={'Свързани имоти · ' + matched.length}>
              <div style={{ padding: 8 }}>
                {matched.map((m, i) => {
                  const ss = STOCK_STATUS[m.status];
                  return (
                    <div key={m.id} onClick={() => onOpenListing && onOpenListing('listings')} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 10px', borderRadius: 10, cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div className={'mk-photo mk-photo--' + (m.location.includes('Влас') ? 'sea' : m.location.includes('Банско') ? 'pine' : 'sand')} style={{ width: 64, height: 48, borderRadius: 8, flex: '0 0 auto' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-strong)' }}>{m.title}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}><span className="crm-mono">{m.ref}</span> · {m.location} · {m.area} m²</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="crm-price">{m.deal === 'rent' ? eur(m.price) + '/мес' : eur(m.price)}</div>
                        <Badge variant={ss.badge} size="sm">{ss.label}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Бележки и активност" action="+ Добави бележка">
              <div style={{ padding: '8px 18px 14px' }}><Timeline items={feed} iconMap={ACT_ICON} /></div>
            </Panel>
          </div>

          {/* sidebar */}
          <div className="crm-grid">
            <Panel title="Данни за контакт">
              <div style={{ padding: '4px 18px 14px' }}>
                <Fact icon="phone" label="Телефон">{lead.phone}</Fact>
                <Fact icon="mail" label="Имейл">{lead.email}</Fact>
                <Fact icon="languages" label="Език">{LANGS[lead.lang]}</Fact>
                <Fact icon="map-pin" label="Локация на интерес">{lead.location}</Fact>
                <Fact icon="wallet" label="Бюджет">{lead.deal === 'rent' ? eur(lead.budget) + '/мес' : eur(lead.budget)}</Fact>
                <div style={{ display: 'flex', gap: 11, padding: '10px 0 2px' }}>
                  <Icon name="user-round" size={17} style={{ color: 'var(--text-subtle)', marginTop: 1 }} />
                  <div>
                    <div style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Отговорен брокер</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar tone={ag.tone} initials={ag.initials} size={26} />
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>{ag.name}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title={'Задачи · ' + leadTasks.length}>
              <div style={{ padding: '4px 18px 12px' }}>
                {leadTasks.length ? <TaskList tasks={leadTasks} /> : <div style={{ padding: '14px 0', fontSize: 13, color: 'var(--text-subtle)' }}>Няма отворени задачи.</div>}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
window.LeadDetail = LeadDetail;
