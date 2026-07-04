import React from 'react';
import { Icon } from '../general/Icon';

const TONE = {
  ink:     { fg: 'var(--ink-700)',     bg: 'var(--ink-50)' },
  stone:   { fg: 'var(--stone-700)',   bg: 'var(--stone-100)' },
  brick:   { fg: 'var(--brick-700)',   bg: 'var(--brick-50)' },
  success: { fg: 'var(--success-600)', bg: 'var(--success-50)' },
  sea:     { fg: 'var(--sea-700)',     bg: 'var(--sea-50)' },
  sun:     { fg: 'var(--sun-600)',     bg: 'var(--sun-100)' },
};

const CSS = `
.mk-stat {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-card); box-shadow: var(--shadow-card);
  padding: var(--space-4) var(--space-5);
  display: flex; flex-direction: column; gap: var(--space-3);
  font-family: var(--font-sans); min-width: 0;
}
.mk-stat__top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.mk-stat__label { font-size: var(--text-sm); font-weight: var(--fw-medium); color: var(--text-muted); }
.mk-stat__ic { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; flex: none; }
.mk-stat__val {
  font-family: var(--font-display); font-weight: var(--fw-semibold);
  font-size: var(--text-2xl); line-height: var(--lh-none);
  letter-spacing: var(--tracking-tight); color: var(--text-strong);
}
.mk-stat__foot { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); font-weight: var(--fw-medium); color: var(--text-subtle); }
.mk-stat__delta { display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; border-radius: var(--radius-pill); font-size: var(--text-2xs); font-weight: var(--fw-semibold); }
.mk-stat__delta--up   { color: var(--success-600); background: var(--success-50); }
.mk-stat__delta--flat { color: var(--text-muted);  background: var(--stone-100); }
.mk-stat__delta--down { color: var(--danger-500);  background: var(--danger-50); }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-stat-css')) {
  const el = document.createElement('style');
  el.id = 'mk-stat-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

export function Stat({
  label,
  value,
  icon,
  tone = 'ink',
  delta,
  trend,
  note,
  className = '',
  ...rest
}) {
  const t = TONE[tone] || TONE.ink;
  const arrow = trend === 'up' ? 'arrow-up-right' : trend === 'down' ? 'arrow-down-right' : 'minus';
  return (
    <div className={['mk-stat', className].filter(Boolean).join(' ')} {...rest}>
      <div className="mk-stat__top">
        <span className="mk-stat__label">{label}</span>
        {icon && (
          <span className="mk-stat__ic" style={{ background: t.bg, color: t.fg }}>
            {typeof icon === 'string' ? <Icon name={icon} size={19} /> : icon}
          </span>
        )}
      </div>
      <div className="mk-stat__val">{value}</div>
      {(delta != null || note) && (
        <div className="mk-stat__foot">
          {delta != null && (
            <span className={'mk-stat__delta mk-stat__delta--' + (trend || 'flat')}>
              <Icon name={arrow} size={12} />{delta}
            </span>
          )}
          {note && <span>{note}</span>}
        </div>
      )}
    </div>
  );
}
