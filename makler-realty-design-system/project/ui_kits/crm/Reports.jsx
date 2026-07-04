/* Reports — funnel, lead sources, monthly deals, agent leaderboard. */
function Reports() {
  const D = window.CRM_DATA;
  const { REPORTS, CRM_AGENTS, eur } = D;
  const { PageHeader, Panel, StatTile, Avatar, Segmented } = window;
  const { Button, Icon } = window.MaklerRealtyDesignSystem_9b7f1e;
  const tv = (t) => window.CrmTONE[t]?.solid || 'var(--ink-700)';

  const maxRev = Math.max(...REPORTS.months.map(m => m.revenue));
  const maxFun = REPORTS.funnel[0].value;
  const maxAg = Math.max(...REPORTS.byAgent.map(a => a.volume));

  return (
    <div className="crm-scroll">
      <div className="crm-wrap">
        <PageHeader title="Справки" subtitle="Резултати на екипа · последни 7 месеца">
          <Segmented value="q" onChange={() => {}} options={[{ value: 'm', label: 'Месец' }, { value: 'q', label: 'Тримесечие' }, { value: 'y', label: 'Година' }]} />
          <Button variant="secondary" size="sm" iconStart="download">Експорт</Button>
        </PageHeader>

        <div className="crm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', marginBottom: 16 }}>
          <StatTile icon="handshake" tone="success" label="Сделки · тримесечие" value="13" delta={24} trend="up" note="спрямо предх." />
          <StatTile icon="banknote" tone="ink" label="Оборот" value="€3.26M" delta={12} trend="up" note="обем сделки" />
          <StatTile icon="percent" tone="brick" label="Конверсия" value="12.5%" delta={2} trend="up" note="запитване → сделка" />
          <StatTile icon="clock" tone="sun" label="Ср. време до сделка" value="38 дни" delta={-4} trend="down" note="по-бързо" />
        </div>

        <div className="crm-grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start', marginBottom: 16 }}>
          {/* funnel */}
          <Panel title="Фуния на продажбите" data-om-raster>
            <div style={{ padding: '18px 20px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {REPORTS.funnel.map((f, i) => {
                const pct = Math.round((f.value / maxFun) * 100);
                const conv = i > 0 ? Math.round((f.value / REPORTS.funnel[i - 1].value) * 100) : 100;
                return (
                  <div key={f.stage}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12.5 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{f.stage}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{f.value}{i > 0 && <span style={{ color: 'var(--text-subtle)', marginLeft: 8 }}>{conv}%</span>}</span>
                    </div>
                    <div style={{ height: 30, borderRadius: 7, background: 'var(--stone-100)', overflow: 'hidden' }}>
                      <div style={{ width: pct + '%', height: '100%', borderRadius: 7, background: 'color-mix(in srgb, var(--ink-800) ' + (55 + i * 12) + '%, var(--brick-500))' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* sources */}
          <Panel title="Източници на лийдове" data-om-raster>
            <div style={{ padding: '18px 20px 22px', display: 'flex', flexDirection: 'column', gap: 13 }}>
              {REPORTS.sources.map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 78, fontSize: 12.5, color: 'var(--text-body)', flex: '0 0 auto' }}>{s.label}</span>
                  <div style={{ flex: 1, height: 12, borderRadius: 999, background: 'var(--stone-100)', overflow: 'hidden' }}>
                    <div style={{ width: s.value + '%', height: '100%', borderRadius: 999, background: tv(s.tone) }} />
                  </div>
                  <span style={{ width: 34, textAlign: 'right', fontSize: 12.5, fontWeight: 600, color: 'var(--text-strong)' }}>{s.value}%</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* monthly */}
        <Panel title="Сделки и комисиона по месеци" style={{ marginBottom: 16 }} data-om-raster>
          <div style={{ padding: '22px 22px 18px', display: 'flex', alignItems: 'flex-end', gap: 18, height: 220 }}>
            {REPORTS.months.map((m, i) => {
              const h = Math.round((m.revenue / maxRev) * 150);
              const last = i === REPORTS.months.length - 1;
              return (
                <div key={m.m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 12.5, color: last ? 'var(--brick-700)' : 'var(--text-strong)' }}>{eur(m.revenue).replace(',000', 'K').replace('€', '€')}</div>
                  <div style={{ width: '100%', maxWidth: 46, height: h, borderRadius: '7px 7px 0 0', background: last ? 'var(--brick-500)' : 'var(--ink-700)', position: 'relative' }} title={m.deals + ' сделки'}>
                    <span style={{ position: 'absolute', top: 6, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>{m.deals}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.m}</div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '0 22px 16px', fontSize: 11.5, color: 'var(--text-subtle)', display: 'flex', gap: 16 }}>
            <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: 'var(--ink-700)', marginRight: 5 }} />комисиона (€)</span>
            <span>числото в стълба = брой сделки</span>
          </div>
        </Panel>

        {/* leaderboard */}
        <Panel title="Класация на брокерите">
          <div style={{ padding: '8px 10px 12px' }}>
            {REPORTS.byAgent.map((a, i) => {
              const ag = CRM_AGENTS[a.agent];
              return (
                <div key={a.agent} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 12px', borderRadius: 10 }}>
                  <span style={{ width: 22, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: i === 0 ? 'var(--brick-600)' : 'var(--text-subtle)' }}>{i + 1}</span>
                  <Avatar tone={ag.tone} initials={ag.initials} size={36} />
                  <div style={{ flex: '0 0 150px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-strong)' }}>{ag.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ag.office} · {a.deals} сделки</div>
                  </div>
                  <div style={{ flex: 1, height: 10, borderRadius: 999, background: 'var(--stone-100)', overflow: 'hidden' }}>
                    <div style={{ width: Math.round((a.volume / maxAg) * 100) + '%', height: '100%', borderRadius: 999, background: tv(ag.tone) }} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', width: 96, textAlign: 'right' }}>{eur(a.volume)}</div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}
window.Reports = Reports;
