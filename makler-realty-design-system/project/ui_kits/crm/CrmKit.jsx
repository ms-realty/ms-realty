/* MS Realty — Agent CRM kit: chrome (Sidebar, Topbar) + shared primitives
   (Avatar, StatTile, DataTable, StatusPill, Timeline, TaskList, KanbanCard,
   Segmented, PageHeader). Composed from the DS bundle; kit-local styles.
   Dark Ink sidebar + light Stone content — the brand charcoal as app chrome. */

const DS = window.MaklerRealtyDesignSystem_9b7f1e;
const { Button, IconButton, Icon, Badge, Card, Tag, Input } = DS;

/* tone → CSS var (surface / text pairs for pills, dots, avatars) */
const TONE = {
  ink:     { fg: 'var(--ink-700)',    bg: 'var(--ink-50)',     solid: 'var(--ink-800)' },
  brick:   { fg: 'var(--brick-700)',  bg: 'var(--brick-50)',   solid: 'var(--brick-600)' },
  sea:     { fg: 'var(--sea-700)',    bg: 'var(--sea-50)',     solid: 'var(--sea-600)' },
  sun:     { fg: 'var(--sun-600)',    bg: 'var(--sun-100)',    solid: 'var(--sun-500)' },
  success: { fg: 'var(--success-600)',bg: 'var(--success-50)', solid: 'var(--success-500)' },
  sand:    { fg: 'var(--stone-700)',  bg: 'var(--stone-100)',  solid: 'var(--stone-500)' },
  pine:    { fg: 'var(--sea-700)',    bg: 'var(--sea-50)',     solid: 'var(--sea-600)' },
  sunset:  { fg: 'var(--sun-600)',    bg: 'var(--sun-100)',    solid: 'var(--sun-500)' },
};

const crmCss = `
.crm-app { display:grid; grid-template-columns:244px 1fr; min-height:100vh; background:var(--canvas); color:var(--text-body); font-family:var(--font-sans); }
.crm-app *,.crm-app *::before,.crm-app *::after { box-sizing:border-box; }

/* ---- Sidebar ---- */
.crm-sb { position:sticky; top:0; align-self:start; height:100vh; background:var(--ink-900); color:var(--stone-50); display:flex; flex-direction:column; border-right:1px solid var(--ink-950); }
.crm-sb__brand { padding:20px 20px 14px; }
.crm-sb__nav { flex:1 1 auto; overflow-y:auto; padding:6px 12px; display:flex; flex-direction:column; gap:2px; }
.crm-sb__group { margin:14px 8px 6px; font:600 10px/1 var(--font-sans); letter-spacing:.14em; text-transform:uppercase; color:rgba(255,255,255,.38); }
.crm-nav { display:flex; align-items:center; gap:11px; padding:9px 12px; border-radius:var(--radius-button); color:rgba(255,255,255,.72); font:500 13.5px/1 var(--font-sans); cursor:pointer; border:0; background:transparent; width:100%; text-align:left; position:relative; transition:background .14s var(--ease-out), color .14s var(--ease-out); }
.crm-nav:hover { background:rgba(255,255,255,.06); color:#fff; }
.crm-nav--on { background:rgba(255,255,255,.09); color:#fff; }
.crm-nav--on::before { content:''; position:absolute; left:-12px; top:8px; bottom:8px; width:3px; border-radius:0 3px 3px 0; background:var(--brick-500); }
.crm-nav--on svg { color:var(--brick-400); }
.crm-nav__badge { margin-left:auto; min-width:20px; height:20px; padding:0 6px; border-radius:999px; background:var(--brick-600); color:#fff; font:600 11px/20px var(--font-sans); text-align:center; }
.crm-sb__me { margin:12px; padding:12px; border-radius:var(--radius-card); background:rgba(255,255,255,.05); display:flex; align-items:center; gap:10px; }
.crm-sb__me b { display:block; font:600 13px/1.3 var(--font-sans); color:#fff; }
.crm-sb__me span { font:400 11.5px/1.3 var(--font-sans); color:rgba(255,255,255,.5); }

/* ---- Main / topbar ---- */
.crm-main { display:flex; flex-direction:column; min-width:0; min-height:100vh; }
.crm-top { position:sticky; top:0; z-index:20; height:64px; flex:0 0 64px; background:rgba(255,255,255,.86); backdrop-filter:saturate(1.4) blur(10px); border-bottom:1px solid var(--border); display:flex; align-items:center; gap:16px; padding:0 26px; }
.crm-top__title { font-family:var(--font-display); font-weight:600; font-size:20px; letter-spacing:-.01em; color:var(--text-strong); }
.crm-top__sub { font:400 12.5px/1 var(--font-sans); color:var(--text-muted); margin-top:3px; }
.crm-top__search { margin-left:auto; display:flex; align-items:center; gap:8px; height:38px; width:260px; padding:0 12px; border:1px solid var(--border-strong); border-radius:var(--radius-button); background:var(--surface); color:var(--text-muted); }
.crm-top__search input { border:0; outline:0; background:transparent; font:400 13.5px/1 var(--font-sans); color:var(--text-body); width:100%; }
.crm-scroll { flex:1 1 auto; overflow-y:auto; padding:26px; }
.crm-wrap { max-width:1240px; margin:0 auto; }

/* ---- Page header ---- */
.crm-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:20px; flex-wrap:wrap; }
.crm-ph h1 { margin:0; font-family:var(--font-display); font-weight:600; font-size:26px; letter-spacing:-.015em; color:var(--text-strong); }
.crm-ph p { margin:5px 0 0; font:400 13.5px/1.4 var(--font-sans); color:var(--text-muted); }
.crm-ph__actions { display:flex; gap:10px; align-items:center; }

/* ---- Avatar ---- */
.crm-av { display:inline-flex; align-items:center; justify-content:center; border-radius:999px; font-family:var(--font-sans); font-weight:600; color:#fff; flex:0 0 auto; letter-spacing:.01em; }

/* ---- Stat tile ---- */
.crm-stat { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-card); padding:16px 18px; display:flex; flex-direction:column; gap:10px; box-shadow:var(--shadow-card); }
.crm-stat__top { display:flex; align-items:center; justify-content:space-between; }
.crm-stat__ic { width:34px; height:34px; border-radius:9px; display:grid; place-items:center; }
.crm-stat__label { font:500 12.5px/1 var(--font-sans); color:var(--text-muted); }
.crm-stat__val { font-family:var(--font-display); font-weight:600; font-size:30px; line-height:1; letter-spacing:-.02em; color:var(--text-strong); }
.crm-stat__foot { display:flex; align-items:center; gap:7px; font:500 12px/1 var(--font-sans); color:var(--text-subtle); }
.crm-delta { display:inline-flex; align-items:center; gap:3px; padding:2px 7px; border-radius:999px; font:600 11.5px/1 var(--font-sans); }
.crm-delta--up { color:var(--success-600); background:var(--success-50); }
.crm-delta--flat { color:var(--text-muted); background:var(--stone-100); }
.crm-delta--down { color:var(--danger-500); background:var(--danger-50); }

/* ---- Panel ---- */
.crm-panel { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-card); box-shadow:var(--shadow-card); }
.crm-panel__hd { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:15px 18px; border-bottom:1px solid var(--border); }
.crm-panel__hd h3 { margin:0; font-family:var(--font-display); font-weight:600; font-size:16px; color:var(--text-strong); letter-spacing:-.01em; }
.crm-panel__hd a { font:600 12.5px/1 var(--font-sans); color:var(--text-link); text-decoration:none; cursor:pointer; }

/* ---- Data table ---- */
.crm-tbl { width:100%; border-collapse:separate; border-spacing:0; font:400 13px/1.4 var(--font-sans); }
.crm-tbl th { text-align:left; font:600 11px/1 var(--font-sans); letter-spacing:.08em; text-transform:uppercase; color:var(--text-muted); padding:12px 14px; border-bottom:1px solid var(--border); background:var(--stone-50); white-space:nowrap; cursor:pointer; user-select:none; }
.crm-tbl th:first-child { border-top-left-radius:var(--radius-card); }
.crm-tbl th .th-in { display:inline-flex; align-items:center; gap:4px; }
.crm-tbl td { padding:11px 14px; border-bottom:1px solid var(--border); color:var(--text-body); vertical-align:middle; }
.crm-tbl tbody tr { cursor:pointer; transition:background .12s var(--ease-out); }
.crm-tbl tbody tr:hover { background:var(--surface-hover); }
.crm-tbl tbody tr:last-child td { border-bottom:0; }
.crm-tbl__primary { font-weight:600; color:var(--text-strong); }
.crm-tbl__muted { color:var(--text-muted); }
.crm-mono { font-family:var(--font-mono); font-size:12px; color:var(--text-muted); }
.crm-price { font-family:var(--font-display); font-weight:600; color:var(--price); font-size:14px; }

/* ---- Status pill ---- */
.crm-pill { display:inline-flex; align-items:center; gap:6px; padding:3px 9px; border-radius:999px; font:600 11.5px/1 var(--font-sans); white-space:nowrap; }
.crm-pill__dot { width:6px; height:6px; border-radius:999px; }

/* ---- Segmented ---- */
.crm-seg { display:inline-flex; padding:3px; gap:2px; background:var(--stone-100); border-radius:var(--radius-button); }
.crm-seg button { border:0; background:transparent; padding:6px 13px; border-radius:6px; font:600 12.5px/1 var(--font-sans); color:var(--text-muted); cursor:pointer; transition:all .14s var(--ease-out); }
.crm-seg button:hover { color:var(--text-strong); }
.crm-seg button[data-on="1"] { background:var(--surface); color:var(--text-strong); box-shadow:var(--shadow-xs, 0 1px 2px rgba(20,19,14,.08)); }

/* ---- Timeline ---- */
.crm-tl { display:flex; flex-direction:column; }
.crm-tl__row { display:flex; gap:12px; padding:11px 0; position:relative; }
.crm-tl__row:not(:last-child)::before { content:''; position:absolute; left:16px; top:34px; bottom:-11px; width:1.5px; background:var(--border); }
.crm-tl__ic { width:33px; height:33px; border-radius:999px; display:grid; place-items:center; flex:0 0 auto; z-index:1; }
.crm-tl__body { padding-top:2px; }
.crm-tl__body p { margin:0; font:400 13px/1.45 var(--font-sans); color:var(--text-body); }
.crm-tl__meta { margin-top:3px; font:500 11.5px/1 var(--font-sans); color:var(--text-subtle); display:flex; align-items:center; gap:6px; }

/* ---- Task list ---- */
.crm-task { display:flex; align-items:flex-start; gap:11px; padding:11px 0; border-bottom:1px solid var(--border); }
.crm-task:last-child { border-bottom:0; }
.crm-task__box { width:19px; height:19px; border-radius:5px; border:1.5px solid var(--border-strong); background:var(--surface); flex:0 0 auto; margin-top:1px; cursor:pointer; display:grid; place-items:center; transition:all .14s var(--ease-out); }
.crm-task__box[data-done="1"] { background:var(--success-500); border-color:var(--success-500); color:#fff; }
.crm-task__txt { font:500 13px/1.4 var(--font-sans); color:var(--text-strong); }
.crm-task__txt[data-done="1"] { text-decoration:line-through; color:var(--text-subtle); font-weight:400; }
.crm-task__meta { margin-top:3px; font:500 11.5px/1 var(--font-sans); color:var(--text-muted); display:flex; gap:8px; align-items:center; }
.crm-prio { width:7px; height:7px; border-radius:999px; flex:0 0 auto; }

/* ---- Kanban ---- */
.crm-kb { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(268px,1fr); gap:16px; align-items:start; overflow-x:auto; padding-bottom:8px; }
.crm-kb__col { background:var(--stone-100); border-radius:var(--radius-card); display:flex; flex-direction:column; min-height:200px; }
.crm-kb__hd { display:flex; align-items:center; gap:8px; padding:13px 14px 10px; }
.crm-kb__hd b { font:600 13px/1 var(--font-sans); color:var(--text-strong); }
.crm-kb__count { min-width:20px; height:20px; padding:0 6px; border-radius:999px; background:var(--stone-300); color:var(--stone-800); font:600 11px/20px var(--font-sans); text-align:center; }
.crm-kb__hint { padding:0 14px 10px; font:400 11.5px/1.3 var(--font-sans); color:var(--text-subtle); }
.crm-kb__list { display:flex; flex-direction:column; gap:9px; padding:0 10px 12px; }
.crm-card { background:var(--surface); border:1px solid var(--border); border-radius:11px; padding:12px; cursor:grab; box-shadow:var(--shadow-xs, 0 1px 2px rgba(20,19,14,.06)); transition:box-shadow .14s var(--ease-out), transform .14s var(--ease-out); }
.crm-card:hover { box-shadow:var(--shadow-card-hover); transform:translateY(-2px); }
.crm-card__top { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
.crm-card__name { font:600 13.5px/1.2 var(--font-sans); color:var(--text-strong); }
.crm-card__interest { font:400 12px/1.4 var(--font-sans); color:var(--text-muted); margin-bottom:10px; }
.crm-card__foot { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.crm-card__budget { font-family:var(--font-display); font-weight:600; font-size:13.5px; color:var(--text-strong); }
.crm-card__chips { display:flex; align-items:center; gap:6px; }

/* temp dot */
.crm-temp { display:inline-flex; align-items:center; gap:5px; font:600 10.5px/1 var(--font-sans); letter-spacing:.06em; text-transform:uppercase; padding:3px 7px; border-radius:999px; }
.crm-temp--hot { color:var(--brick-700); background:var(--brick-50); }
.crm-temp--warm { color:var(--sun-600); background:var(--sun-100); }
.crm-temp--cold { color:var(--sea-700); background:var(--sea-50); }

.crm-lang { display:inline-grid; place-items:center; min-width:22px; height:18px; padding:0 5px; border-radius:4px; background:var(--stone-200); color:var(--stone-700); font:700 9.5px/1 var(--font-sans); letter-spacing:.04em; }

/* utility grid */
.crm-grid { display:grid; gap:16px; }

/* Messages-inbox styles are co-located in Messages.jsx (self-injected). */
@media (max-width:760px){ .crm-app { grid-template-columns:1fr; } .crm-sb { display:none; } }
`;

/* ---------- primitives ---------- */
function Avatar({ tone = 'sand', initials = '', size = 34 }) {
  const bg = (TONE[tone] || TONE.sand).solid;
  return React.createElement('span', {
    className: 'crm-av',
    style: { width: size, height: size, background: bg, fontSize: Math.round(size * 0.38) },
  }, initials);
}

function StatusPill({ tone = 'ink', label, dot = true }) {
  const t = TONE[tone] || TONE.ink;
  return (
    <span className="crm-pill" style={{ color: t.fg, background: t.bg }}>
      {dot && <span className="crm-pill__dot" style={{ background: t.solid }} />}
      {label}
    </span>
  );
}

function Temp({ level }) {
  const map = { hot: 'Горещ', warm: 'Топъл', cold: 'Хладен' };
  return <span className={'crm-temp crm-temp--' + level}>{map[level] || level}</span>;
}

function Lang({ code }) { return <span className="crm-lang">{code}</span>; }

function Segmented({ options, value, onChange }) {
  return (
    <div className="crm-seg">
      {options.map(o => (
        <button key={o.value} data-on={value === o.value ? 1 : 0} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

function StatTile({ icon, label, value, delta, trend, note, tone = 'ink' }) {
  const t = TONE[tone] || TONE.ink;
  const arrow = trend === 'up' ? 'arrow-up-right' : trend === 'down' ? 'arrow-down-right' : 'minus';
  const sign = delta > 0 ? '+' + delta : String(delta);
  return (
    <div className="crm-stat">
      <div className="crm-stat__top">
        <span className="crm-stat__label">{label}</span>
        <span className="crm-stat__ic" style={{ background: t.bg, color: t.solid }}><Icon name={icon} size={19} /></span>
      </div>
      <div className="crm-stat__val">{value}</div>
      <div className="crm-stat__foot">
        {delta !== undefined && (
          <span className={'crm-delta crm-delta--' + trend}><Icon name={arrow} size={12} />{trend === 'up' ? sign + '%' : trend === 'flat' ? '—' : sign}</span>
        )}
        <span>{note}</span>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle, children }) {
  return (
    <div className="crm-ph">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="crm-ph__actions">{children}</div>}
    </div>
  );
}

function Panel({ title, action, onAction, children, style }) {
  return (
    <section className="crm-panel" style={style}>
      {title && (
        <div className="crm-panel__hd">
          <h3>{title}</h3>
          {action && <a onClick={onAction}>{action}</a>}
        </div>
      )}
      {children}
    </section>
  );
}

/* Generic sortable table.
   columns: [{key,label,align,width,render(row),sort(row)}], rows, onRow(row) */
function DataTable({ columns, rows, onRow }) {
  const [sort, setSort] = React.useState({ key: null, dir: 1 });
  const sorted = React.useMemo(() => {
    if (!sort.key) return rows;
    const col = columns.find(c => c.key === sort.key);
    const get = col.sort || (r => r[sort.key]);
    return [...rows].sort((a, b) => {
      const va = get(a), vb = get(b);
      if (va < vb) return -1 * sort.dir;
      if (va > vb) return 1 * sort.dir;
      return 0;
    });
  }, [rows, sort, columns]);
  const toggle = (k) => setSort(s => s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: 1 });
  return (
    <table className="crm-tbl">
      <thead>
        <tr>
          {columns.map(c => (
            <th key={c.key} style={{ textAlign: c.align, width: c.width }} onClick={() => c.sortable !== false && toggle(c.key)}>
              <span className="th-in">{c.label}
                {sort.key === c.key && <Icon name={sort.dir === 1 ? 'chevron-up' : 'chevron-down'} size={13} />}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={r.id || i} onClick={() => onRow && onRow(r)}>
            {columns.map(c => (
              <td key={c.key} style={{ textAlign: c.align }}>{c.render ? c.render(r) : r[c.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Timeline({ items, iconMap }) {
  return (
    <div className="crm-tl">
      {items.map((it, i) => {
        const cfg = iconMap[it.type] || { icon: 'circle', tone: 'ink' };
        const t = TONE[cfg.tone] || TONE.ink;
        return (
          <div className="crm-tl__row" key={i}>
            <span className="crm-tl__ic" style={{ background: t.bg, color: t.solid }}><Icon name={cfg.icon} size={16} /></span>
            <div className="crm-tl__body">
              <p>{it.text}</p>
              <div className="crm-tl__meta">{it.agentName || it.agent}<span>·</span>{it.time}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskList({ tasks }) {
  const [state, setState] = React.useState(() => Object.fromEntries(tasks.map(t => [t.id, t.done])));
  const prio = { high: 'var(--brick-500)', med: 'var(--sun-500)', low: 'var(--stone-400)' };
  return (
    <div>
      {tasks.map(t => {
        const done = state[t.id];
        return (
          <div className="crm-task" key={t.id}>
            <span className="crm-task__box" data-done={done ? 1 : 0} onClick={() => setState(s => ({ ...s, [t.id]: !s[t.id] }))}>
              {done && <Icon name="check" size={13} />}
            </span>
            <div style={{ flex: 1 }}>
              <div className="crm-task__txt" data-done={done ? 1 : 0}>{t.text}</div>
              <div className="crm-task__meta">
                <span className="crm-prio" style={{ background: prio[t.priority] }} />
                {t.due}{t.lead && <><span>·</span>{t.lead}</>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({ lead, agent, onOpen }) {
  return (
    <div className="crm-card" onClick={() => onOpen && onOpen(lead)}>
      <div className="crm-card__top">
        <span className="crm-card__name">{lead.name}</span>
        <Temp level={lead.temp} />
      </div>
      <div className="crm-card__interest">{lead.interest}</div>
      <div className="crm-card__foot">
        <span className="crm-card__budget">{lead.deal === 'rent' ? window.CRM_DATA.eur(lead.budget) + '/мес' : window.CRM_DATA.eur(lead.budget)}</span>
        <div className="crm-card__chips">
          <Lang code={lead.lang} />
          {agent && <Avatar tone={agent.tone} initials={agent.initials} size={24} />}
        </div>
      </div>
    </div>
  );
}

/* ---------- chrome ---------- */
const NAV = [
  { group: 'Работа' },
  { key: 'dashboard', label: 'Табло',      icon: 'layout-dashboard' },
  { key: 'pipeline',  label: 'Лийдове',    icon: 'kanban-square', badge: 12 },
  { key: 'messages',  label: 'Съобщения',  icon: 'messages-square', badge: 7 },
  { key: 'calendar',  label: 'Огледи',     icon: 'calendar-days', badge: 9 },
  { key: 'contacts',  label: 'Контакти',   icon: 'contact' },
  { group: 'Портфолио' },
  { key: 'listings',  label: 'Имоти',      icon: 'building-2' },
  { key: 'reports',   label: 'Справки',    icon: 'bar-chart-3' },
];

function Sidebar({ route, onNavigate }) {
  const { CRM_AGENTS, ME } = window.CRM_DATA;
  const me = CRM_AGENTS[ME];
  return (
    <aside className="crm-sb">
      <div className="crm-sb__brand"><DS.Logo variant="reversed" height={30} /></div>
      <nav className="crm-sb__nav">
        {NAV.map((n, i) => n.group
          ? <div className="crm-sb__group" key={'g' + i}>{n.group}</div>
          : (
            <button key={n.key} className={'crm-nav' + (route === n.key ? ' crm-nav--on' : '')} onClick={() => onNavigate(n.key)}>
              <Icon name={n.icon} size={18} />{n.label}
              {n.badge && <span className="crm-nav__badge">{n.badge}</span>}
            </button>
          ))}
      </nav>
      <div className="crm-sb__me">
        <Avatar tone={me.tone} initials={me.initials} size={38} />
        <div style={{ minWidth: 0 }}>
          <b>{me.name}</b>
          <span>{me.role} · {me.office}</span>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ title, subtitle, actions }) {
  return (
    <header className="crm-top">
      <div>
        <div className="crm-top__title">{title}</div>
        {subtitle && <div className="crm-top__sub">{subtitle}</div>}
      </div>
      <label className="crm-top__search">
        <Icon name="search" size={16} />
        <input placeholder="Търси лийд, имот, контакт…" />
      </label>
      <IconButton icon="bell" variant="ghost" aria-label="Известия" />
      <IconButton icon="plus" variant="solid" aria-label="Добави" />
      {actions}
    </header>
  );
}

/* inject styles once */
(function () {
  if (!document.getElementById('crm-kit-css')) {
    const s = document.createElement('style');
    s.id = 'crm-kit-css';
    s.textContent = crmCss;
    document.head.appendChild(s);
  }
})();

Object.assign(window, {
  CrmTONE: TONE, Avatar, StatusPill, Temp, Lang, Segmented, StatTile,
  PageHeader, Panel, DataTable, Timeline, TaskList, KanbanCard, Sidebar, Topbar,
});
