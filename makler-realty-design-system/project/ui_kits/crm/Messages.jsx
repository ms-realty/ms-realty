/* Messages — multichannel inbox: conversation list + thread + composer.
   Screen-specific CSS is self-injected here (co-located with the screen). */
(function () {
  if (document.getElementById('crm-msg-css')) return;
  const s = document.createElement('style');
  s.id = 'crm-msg-css';
  s.textContent = `
.crm-msg { flex:1 1 auto; display:grid; grid-template-columns:340px 1fr; min-height:0; border-top:1px solid var(--border); }
.crm-msg__list { display:flex; flex-direction:column; min-height:0; border-right:1px solid var(--border); background:var(--surface); }
.crm-msg__filters { padding:14px 16px; border-bottom:1px solid var(--border); }
.crm-msg__scroll { flex:1 1 auto; overflow-y:auto; }
.crm-conv { display:flex; gap:12px; align-items:flex-start; width:100%; text-align:left; border:0; background:transparent; padding:13px 16px; cursor:pointer; border-bottom:1px solid var(--border); position:relative; transition:background .12s var(--ease-out); }
.crm-conv:hover { background:var(--surface-hover); }
.crm-conv--on { background:var(--brick-50); }
.crm-conv--on::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--brick-500); }
.crm-conv__ch { position:absolute; right:-3px; bottom:-3px; width:18px; height:18px; border-radius:999px; display:grid; place-items:center; color:#fff; border:2px solid var(--surface); }
.crm-conv__on { position:absolute; right:-1px; top:-1px; width:11px; height:11px; border-radius:999px; background:var(--success-500); border:2px solid var(--surface); }
.crm-conv__top { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
.crm-conv__name { font:600 13.5px/1.2 var(--font-sans); color:var(--text-strong); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.crm-conv__time { font:400 11px/1 var(--font-sans); color:var(--text-subtle); flex:0 0 auto; }
.crm-conv__row { display:flex; align-items:center; gap:8px; margin:3px 0 4px; }
.crm-conv__prev { font:400 12.5px/1.35 var(--font-sans); color:var(--text-muted); flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.crm-conv__badge { flex:0 0 auto; min-width:18px; height:18px; padding:0 6px; border-radius:999px; background:var(--brick-600); color:#fff; font:600 10.5px/18px var(--font-sans); text-align:center; }
.crm-conv__meta { display:flex; align-items:center; gap:7px; font-size:11px; color:var(--text-subtle); }
.crm-conv--on .crm-conv__prev { color:var(--text-body); }
.crm-msg__thread { display:flex; flex-direction:column; min-height:0; background:var(--stone-50); }
.crm-thd__hd { display:flex; align-items:center; gap:12px; padding:14px 20px; background:var(--surface); border-bottom:1px solid var(--border); flex:0 0 auto; }
.crm-thd__body { flex:1 1 auto; overflow-y:auto; padding:20px 26px; display:flex; flex-direction:column; gap:3px; }
.crm-thd__day { align-self:center; font:600 11px/1 var(--font-sans); color:var(--text-subtle); background:var(--stone-200); padding:5px 12px; border-radius:999px; margin:2px 0 14px; }
.crm-bub__wrap { display:flex; margin:3px 0; }
.crm-bub__wrap.out { justify-content:flex-end; }
.crm-bub { max-width:62%; padding:10px 13px; border-radius:14px; font:400 13.5px/1.5 var(--font-sans); position:relative; box-shadow:var(--shadow-xs,0 1px 2px rgba(20,19,14,.05)); }
.crm-bub--in { background:var(--surface); color:var(--text-body); border-bottom-left-radius:4px; border:1px solid var(--border); }
.crm-bub--out { background:var(--ink-800); color:var(--stone-50); border-bottom-right-radius:4px; }
.crm-bub__t { display:block; margin-top:5px; font:500 10.5px/1 var(--font-sans); opacity:.6; text-align:right; }
.crm-bub__orig { margin-top:7px; padding-top:7px; border-top:1px solid color-mix(in srgb,currentColor 18%,transparent); }
.crm-bub__orig button { display:inline-flex; align-items:center; gap:5px; border:0; background:transparent; cursor:pointer; font:600 11px/1 var(--font-sans); color:inherit; opacity:.7; padding:0; }
.crm-bub__orig button:hover { opacity:1; }
.crm-bub__origtxt { margin-top:6px; font:400 12.5px/1.45 var(--font-sans); opacity:.72; font-style:italic; }
.crm-thd__composer { flex:0 0 auto; background:var(--surface); border-top:1px solid var(--border); padding:12px 20px 14px; }
.crm-thd__quick { display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
.crm-chip { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border-strong); background:var(--surface); border-radius:999px; padding:6px 12px; font:500 12px/1 var(--font-sans); color:var(--text-body); cursor:pointer; transition:all .12s var(--ease-out); }
.crm-chip:hover { border-color:var(--brick-400); color:var(--brick-700); background:var(--brick-50); }
.crm-thd__input { display:flex; align-items:center; gap:8px; border:1px solid var(--border-strong); border-radius:var(--radius-button); padding:5px 6px 5px 8px; background:var(--surface); }
.crm-thd__input input { flex:1; border:0; outline:0; background:transparent; font:400 13.5px/1 var(--font-sans); color:var(--text-body); padding:8px 4px; }
`;
  document.head.appendChild(s);
})();

function Messages({ onOpenLead }) {
  const D = window.CRM_DATA;
  const { CONVERSATIONS, CHANNELS, CRM_AGENTS, LEADS, LANGS } = D;
  const { PageHeader, Avatar, Lang, Segmented } = window;
  const { Button, IconButton, Icon } = window.MaklerRealtyDesignSystem_9b7f1e;

  const [activeId, setActiveId] = React.useState(CONVERSATIONS[0].id);
  const [filter, setFilter] = React.useState('all');
  const [showOrig, setShowOrig] = React.useState({});

  const totalUnread = CONVERSATIONS.reduce((s, c) => s + c.unread, 0);
  const list = React.useMemo(() => {
    let l = filter === 'unread' ? CONVERSATIONS.filter(c => c.unread > 0)
      : filter === 'mine' ? CONVERSATIONS.filter(c => c.agent === D.ME)
      : CONVERSATIONS;
    return [...l].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }, [filter]);
  const active = CONVERSATIONS.find(c => c.id === activeId);
  const initials = (n) => n.split(' ').map(w => w[0]).slice(0, 2).join('');
  const chTone = (k) => window.CrmTONE[CHANNELS[k].tone];

  return (
    <div className="crm-scroll" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '26px 26px 16px' }}>
        <PageHeader title="Съобщения" subtitle={CONVERSATIONS.length + ' разговора · ' + totalUnread + ' непрочетени'}>
          <Button variant="secondary" size="sm" iconStart="check-check">Маркирай прочетени</Button>
          <Button variant="primary" size="sm" iconStart="pencil">Ново съобщение</Button>
        </PageHeader>
      </div>

      <div className="crm-msg">
        {/* conversation list */}
        <div className="crm-msg__list">
          <div className="crm-msg__filters">
            <Segmented value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'Всички' },
              { value: 'unread', label: 'Непрочетени · ' + totalUnread },
              { value: 'mine', label: 'Моите' },
            ]} />
          </div>
          <div className="crm-msg__scroll">
            {list.map(c => {
              const ag = CRM_AGENTS[c.agent];
              const ch = CHANNELS[c.channel];
              const on = c.id === activeId;
              return (
                <button key={c.id} className={'crm-conv' + (on ? ' crm-conv--on' : '')} onClick={() => setActiveId(c.id)}>
                  <div style={{ position: 'relative', flex: '0 0 auto' }}>
                    <Avatar tone={ag.tone} initials={initials(c.name)} size={42} />
                    <span className="crm-conv__ch" style={{ background: chTone(c.channel).solid }}><Icon name={ch.icon} size={11} /></span>
                    {c.online && <span className="crm-conv__on" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="crm-conv__top">
                      <span className="crm-conv__name">{c.pinned && <Icon name="pin" size={12} style={{ color: 'var(--text-subtle)', marginRight: 4, verticalAlign: '-1px' }} />}{c.name}</span>
                      <span className="crm-conv__time">{c.last}</span>
                    </div>
                    <div className="crm-conv__row">
                      <span className="crm-conv__prev">{c.preview}</span>
                      {c.unread > 0 && <span className="crm-conv__badge">{c.unread}</span>}
                    </div>
                    <div className="crm-conv__meta"><Lang code={c.lang} /> <span className="crm-mono">{c.lead}</span></div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* thread */}
        {active && (() => {
          const ag = CRM_AGENTS[active.agent];
          const ch = CHANNELS[active.channel];
          const lead = LEADS.find(l => l.id === active.lead);
          return (
            <div className="crm-msg__thread">
              <div className="crm-thd__hd">
                <div style={{ position: 'relative' }}>
                  <Avatar tone={ag.tone} initials={initials(active.name)} size={40} />
                  {active.online && <span className="crm-conv__on" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <b style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15.5, color: 'var(--text-strong)' }}>{active.name}</b>
                    <Lang code={active.lang} />
                    <span className="crm-pill" style={{ color: chTone(active.channel).fg, background: chTone(active.channel).bg }}>
                      <Icon name={ch.icon} size={12} />{ch.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {active.online ? 'Онлайн сега' : 'Активен ' + active.last} · {LANGS[active.lang]}
                  </div>
                </div>
                <IconButton icon="phone" variant="ghost" aria-label="Обади се" />
                <IconButton icon="calendar-plus" variant="ghost" aria-label="Насрочи оглед" />
                <Button variant="secondary" size="sm" iconEnd="arrow-right" onClick={() => lead && onOpenLead(lead)}>Отвори лийда</Button>
              </div>

              <div className="crm-thd__body">
                <div className="crm-thd__day">Днес</div>
                {active.messages.map((m, i) => {
                  const isOut = m.dir === 'out';
                  const showO = showOrig[active.id + i];
                  return (
                    <div key={i} className={'crm-bub__wrap ' + (isOut ? 'out' : 'in')}>
                      <div className={'crm-bub ' + (isOut ? 'crm-bub--out' : 'crm-bub--in')}>
                        <div>{m.text}</div>
                        {m.orig && (
                          <div className="crm-bub__orig">
                            <button onClick={() => setShowOrig(s => ({ ...s, [active.id + i]: !s[active.id + i] }))}>
                              <Icon name="languages" size={12} />{showO ? 'Скрий оригинала' : 'Виж оригинала (' + active.lang + ')'}
                            </button>
                            {showO && <div className="crm-bub__origtxt">{m.orig}</div>}
                          </div>
                        )}
                        <span className="crm-bub__t">{m.t}{isOut && <Icon name="check-check" size={13} style={{ marginLeft: 3, verticalAlign: '-2px' }} />}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="crm-thd__composer">
                <div className="crm-thd__quick">
                  <button className="crm-chip">Свободен е ✅</button>
                  <button className="crm-chip">Ще потвърдя оглед</button>
                  <button className="crm-chip">Изпращам детайли</button>
                  <button className="crm-chip" style={{ marginLeft: 'auto' }}><Icon name="sparkles" size={13} /> Преведи отговора</button>
                </div>
                <div className="crm-thd__input">
                  <IconButton icon="paperclip" variant="ghost" aria-label="Прикачи" />
                  <input placeholder={'Отговори на ' + active.name.split(' ')[0] + '…'} />
                  <IconButton icon="smile" variant="ghost" aria-label="Емоджи" />
                  <Button variant="primary" size="sm" iconEnd="send">Изпрати</Button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
window.Messages = Messages;
