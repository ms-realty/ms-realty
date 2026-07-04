import React from 'react';
import { Icon } from '../general/Icon';

const CSS = `
.mk-search { font-family: var(--font-sans); display: flex; flex-direction: column; gap: var(--space-3); }
.mk-search__deals { display: inline-flex; gap: 4px; background: var(--surface-sunken); border: 1px solid var(--border); border-radius: var(--radius-full); padding: 4px; align-self: flex-start; }
.mk-search__deal { border: none; background: transparent; font: inherit; font-weight: var(--fw-medium); font-size: var(--text-sm); color: var(--text-muted); padding: 7px 16px; border-radius: var(--radius-full); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard); }
.mk-search__deal:hover { color: var(--text-strong); }
.mk-search__deal[aria-selected="true"] { background: var(--surface); color: var(--brand); box-shadow: var(--shadow-xs); font-weight: var(--fw-semibold); }

.mk-search__bar { display: flex; align-items: center; gap: var(--space-1); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); padding: 8px; }
.mk-search__seg { display: flex; align-items: center; gap: var(--space-3); padding: 6px var(--space-4); min-width: 0; border-radius: var(--radius-lg); position: relative; }
.mk-search__seg:hover { background: var(--surface-hover); }
.mk-search__seg--grow { flex: 1 1 40%; }
.mk-search__seg > .mk-icon { color: var(--text-muted); flex: none; }
.mk-search__field { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.mk-search__field label { font-size: 11px; font-weight: var(--fw-semibold); letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }
.mk-search__field input, .mk-search__field select { border: none; background: transparent; outline: none; font: inherit; font-size: var(--text-md); font-weight: var(--fw-medium); color: var(--text-strong); padding: 0; min-width: 0; width: 100%; -webkit-appearance: none; appearance: none; cursor: pointer; }
.mk-search__field input { cursor: text; }
.mk-search__field input::placeholder { color: var(--text-subtle); font-weight: var(--fw-regular); }
.mk-search__seg select + .mk-icon { position: absolute; right: 10px; bottom: 10px; color: var(--text-muted); pointer-events: none; }
.mk-search__divider { width: 1px; align-self: stretch; margin: 10px 0; background: var(--border); flex: none; }
.mk-search__go { flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: none; cursor: pointer; background: var(--accent); color: #fff; font: inherit; font-weight: var(--fw-semibold); font-size: var(--text-md); height: 58px; padding: 0 24px; border-radius: var(--radius-lg); transition: background-color var(--dur-fast) var(--ease-standard); }
.mk-search__go:hover { background: var(--accent-hover); }
.mk-search__go:active { background: var(--accent-active); }

.mk-search--md .mk-search__bar { border-radius: var(--radius-lg); }
.mk-search--md .mk-search__seg { padding: 4px var(--space-3); }
.mk-search--md .mk-search__go { height: 46px; padding: 0 18px; }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-search-css')) {
  const el = document.createElement('style');
  el.id = 'mk-search-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

const DEFAULT_DEALS = [
  { value: 'buy', label: 'Купува', icon: 'key' },
  { value: 'rent', label: 'Под наем', icon: 'calendar' },
  { value: 'holiday', label: 'Ваканционни', icon: 'sun' },
];

export function SearchBar({
  deals = DEFAULT_DEALS,
  defaultDeal,
  showDeals = true,
  locationPlaceholder = 'Къде? напр. Сандански, Банско, Свети Влас',
  types = ['Всички', 'Апартамент', 'Къща', 'Вила', 'Студио', 'Парцел'],
  prices = ['Без лимит', '€50,000', '€100,000', '€200,000', '€350,000', '€500,000+'],
  size = 'lg',
  onSearch,
  className = '',
  ...rest
}) {
  const [deal, setDeal] = React.useState(defaultDeal || deals[0]?.value);
  const [state, setState] = React.useState({ location: '', type: types[0], price: prices[0] });
  const upd = k => e => setState(s => ({ ...s, [k]: e.target.value }));

  return (
    <div className={['mk-search', `mk-search--${size}`, className].filter(Boolean).join(' ')} {...rest}>
      {showDeals && (
        <div className="mk-search__deals" role="tablist" aria-label="Тип сделка">
          {deals.map(d => (
            <button key={d.value} type="button" role="tab" aria-selected={deal === d.value}
                    className="mk-search__deal" onClick={() => setDeal(d.value)}>
              {d.icon && <Icon name={d.icon} size={15} />}{d.label}
            </button>
          ))}
        </div>
      )}
      <div className="mk-search__bar">
        <div className="mk-search__seg mk-search__seg--grow">
          <Icon name="map-pin" size={20} />
          <div className="mk-search__field">
            <label>Локация</label>
            <input type="text" value={state.location} onChange={upd('location')} placeholder={locationPlaceholder} />
          </div>
        </div>
        <div className="mk-search__divider" />
        <div className="mk-search__seg">
          <div className="mk-search__field">
            <label>Тип</label>
            <select value={state.type} onChange={upd('type')}>
              {types.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <Icon name="chevron-down" size={16} />
        </div>
        <div className="mk-search__divider" />
        <div className="mk-search__seg">
          <div className="mk-search__field">
            <label>Макс. цена</label>
            <select value={state.price} onChange={upd('price')}>
              {prices.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <Icon name="chevron-down" size={16} />
        </div>
        <button type="button" className="mk-search__go" onClick={() => onSearch && onSearch({ deal, ...state })}>
          <Icon name="search" size={20} strokeWidth={2.25} />
          {size === 'lg' && <span>Търси</span>}
        </button>
      </div>
    </div>
  );
}
