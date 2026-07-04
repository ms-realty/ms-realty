import React from 'react';
import { Icon } from '../general/Icon';

const CSS = `
.mk-crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; font-family: var(--font-sans); font-size: var(--text-sm); color: var(--text-muted); }
.mk-crumbs__item { display: inline-flex; align-items: center; }
.mk-crumbs a { color: var(--text-muted); text-decoration: none; transition: color var(--dur-fast) var(--ease-standard); }
.mk-crumbs a:hover { color: var(--text-strong); text-decoration: underline; text-underline-offset: 2px; }
.mk-crumbs__sep { color: var(--text-subtle); display: inline-flex; margin: 0 2px; }
.mk-crumbs__current { color: var(--text-strong); font-weight: var(--fw-medium); }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-crumbs-css')) {
  const el = document.createElement('style');
  el.id = 'mk-crumbs-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

export function Breadcrumb({ items = [], separator = 'chevron-right', className = '', ...rest }) {
  return (
    <nav className={['mk-crumbs', className].filter(Boolean).join(' ')} aria-label="Breadcrumb" {...rest}>
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <span className="mk-crumbs__item" key={i}>
            {last || !it.href
              ? <span className="mk-crumbs__current" aria-current={last ? 'page' : undefined}>{it.label}</span>
              : <a href={it.href}>{it.label}</a>}
            {!last && <span className="mk-crumbs__sep"><Icon name={separator} size={14} /></span>}
          </span>
        );
      })}
    </nav>
  );
}
