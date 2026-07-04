/* Calendar — week viewings scheduler (09:00–19:00). */
function Calendar() {
  const D = window.CRM_DATA;
  const { WEEK, VIEWINGS, VIEW_STATUS, CRM_AGENTS } = D;
  const { PageHeader, Avatar, Segmented } = window;
  const { Button, IconButton, Icon } = window.MaklerRealtyDesignSystem_9b7f1e;

  const HOURS = []; for (let h = 9; h <= 19; h++) HOURS.push(h);
  const ROW = 62;
  const toneVar = (t) => window.CrmTONE[t]?.solid || 'var(--ink-700)';

  return (
    <div className="crm-scroll">
      <div className="crm-wrap" style={{ maxWidth: 1400 }}>
        <PageHeader title="Огледи" subtitle="Седмица 6–12 юли 2026 · 9 насрочени огледа">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 4 }}>
            <IconButton icon="chevron-left" variant="ghost" aria-label="Предишна" />
            <Button variant="secondary" size="sm">Тази седмица</Button>
            <IconButton icon="chevron-right" variant="ghost" aria-label="Следваща" />
          </div>
          <Button variant="primary" size="sm" iconStart="calendar-plus">Насрочи оглед</Button>
        </PageHeader>

        {/* legend */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
          {Object.values(CRM_AGENTS).map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--text-muted)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: toneVar(a.tone) }} />{a.name}
            </div>
          ))}
        </div>

        <div className="crm-panel" style={{ overflow: 'hidden' }}>
          {/* day header */}
          <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7,1fr)', borderBottom: '1px solid var(--border)' }}>
            <div />
            {WEEK.map((d, i) => {
              const [name, num] = d.split(' ');
              const isToday = i === 0;
              return (
                <div key={d} style={{ padding: '11px 0', textAlign: 'center', borderLeft: '1px solid var(--border)', background: isToday ? 'var(--brick-50)' : 'transparent' }}>
                  <div style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: '.08em', textTransform: 'uppercase', color: isToday ? 'var(--brick-700)' : 'var(--text-muted)' }}>{name}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, color: isToday ? 'var(--brick-700)' : 'var(--text-strong)', marginTop: 3 }}>{num}</div>
                </div>
              );
            })}
          </div>

          {/* body */}
          <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7,1fr)', position: 'relative' }}>
            {/* time gutter */}
            <div>
              {HOURS.map(h => (
                <div key={h} style={{ height: ROW, position: 'relative' }}>
                  <span style={{ position: 'absolute', top: -7, right: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-subtle)' }}>{String(h).padStart(2, '0')}:00</span>
                </div>
              ))}
            </div>
            {/* day columns */}
            {WEEK.map((d, di) => (
              <div key={d} style={{ borderLeft: '1px solid var(--border)', position: 'relative', height: HOURS.length * ROW, background: di === 0 ? 'rgba(206,55,51,.03)' : 'transparent' }}>
                {HOURS.map((h, hi) => hi > 0 && <div key={h} style={{ position: 'absolute', top: hi * ROW, left: 0, right: 0, borderTop: '1px solid var(--border)' }} />)}
                {VIEWINGS.filter(v => v.day === di).map((v, i) => {
                  const ag = CRM_AGENTS[v.agent];
                  const st = VIEW_STATUS[v.status];
                  const cancelled = v.status === 'cancelled';
                  return (
                    <div key={i} style={{
                      position: 'absolute', top: (v.start - 9) * ROW + 3, height: v.dur * ROW - 6, left: 4, right: 4,
                      borderRadius: 8, padding: '7px 8px', overflow: 'hidden', cursor: 'pointer',
                      background: cancelled ? 'var(--stone-100)' : 'color-mix(in srgb,' + toneVar(ag.tone) + ' 13%, #fff)',
                      borderLeft: '3px solid ' + (cancelled ? 'var(--stone-400)' : toneVar(ag.tone)),
                      boxShadow: 'var(--shadow-xs,0 1px 2px rgba(20,19,14,.06))', opacity: cancelled ? .7 : 1,
                    }}>
                      <div style={{ font: '600 11px/1.2 var(--font-sans)', color: 'var(--text-strong)', textDecoration: cancelled ? 'line-through' : 'none' }}>{v.lead}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }} className="crm-mono">{v.listing}</div>
                      <div style={{ fontSize: 10, color: st.tone, marginTop: 3, fontWeight: 600 }}>{String(v.start).padStart(2, '0')}:00 · {st.label}</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
window.Calendar = Calendar;
