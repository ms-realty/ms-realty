import React from 'react';
import { Icon } from '../general/Icon';

const CSS = `
.mk-tabs { display: flex; align-items: center; gap: var(--space-1); font-family: var(--font-sans); }
.mk-tab {
  display: inline-flex; align-items: center; gap: var(--space-2);
  border: 0; background: transparent; cursor: pointer;
  font-family: inherit; font-size: var(--text-sm); font-weight: var(--fw-semibold);
  color: var(--text-muted); white-space: nowrap;
  transition: color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard);
}
.mk-tab:focus-visible { outline: none; box-shadow: var(--shadow-focus); border-radius: var(--radius-sm); }
.mk-tab__count {
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: var(--radius-pill);
  background: var(--stone-100); color: var(--text-muted);
  font-size: var(--text-2xs); font-weight: var(--fw-semibold); line-height: 18px; text-align: center;
}
.mk-tab[aria-selected="true"] .mk-tab__count { background: var(--ink-100); color: var(--ink-800); }

/* underline (default) */
.mk-tabs--underline { gap: var(--space-5); box-shadow: inset 0 -1px 0 var(--border); }
.mk-tabs--underline .mk-tab { padding: var(--space-3) 2px; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.mk-tabs--underline .mk-tab:hover { color: var(--text-strong); }
.mk-tabs--underline .mk-tab[aria-selected="true"] { color: var(--text-strong); border-bottom-color: var(--ink-800); }

/* segmented pills */
.mk-tabs--segmented { display: inline-flex; padding: 3px; gap: 2px; background: var(--stone-100); border-radius: var(--radius-button); box-shadow: none; }
.mk-tabs--segmented .mk-tab { padding: 7px 13px; border-radius: var(--radius-sm); }
.mk-tabs--segmented .mk-tab:hover { color: var(--text-strong); }
.mk-tabs--segmented .mk-tab[aria-selected="true"] { background: var(--surface); color: var(--text-strong); box-shadow: var(--shadow-xs); }

.mk-tabs--sm.mk-tabs--underline .mk-tab { padding: var(--space-2) 2px; font-size: var(--text-xs); }
.mk-tabs--sm.mk-tabs--segmented .mk-tab { padding: 5px 10px; font-size: var(--text-xs); }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-tabs-css')) {
  const el = document.createElement('style');
  el.id = 'mk-tabs-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

export function Tabs({
  items = [],
  value,
  onChange,
  variant = 'underline',
  size = 'md',
  className = '',
  ...rest
}) {
  return (
    <div
      role="tablist"
      className={['mk-tabs', `mk-tabs--${variant}`, size === 'sm' ? 'mk-tabs--sm' : '', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          role="tab"
          className="mk-tab"
          aria-selected={value === it.key}
          onClick={() => onChange && onChange(it.key)}
        >
          {it.icon && (typeof it.icon === 'string' ? <Icon name={it.icon} size={16} /> : it.icon)}
          {it.label}
          {it.count != null && <span className="mk-tab__count">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}
