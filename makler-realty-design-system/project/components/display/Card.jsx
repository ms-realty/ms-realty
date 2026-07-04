import React from 'react';

const CSS = `
.mk-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  color: var(--text-body);
}
.mk-card--elevated { border-color: transparent; box-shadow: var(--shadow-card); }
.mk-card--sunken { background: var(--surface-sunken); border-color: transparent; }
.mk-card--pad-sm { padding: var(--space-3); }
.mk-card--pad-md { padding: var(--space-5); }
.mk-card--pad-lg { padding: var(--space-8); }
.mk-card--interactive {
  cursor: pointer; text-decoration: none; display: block;
  transition: box-shadow var(--dur-base) var(--ease-standard),
              transform var(--dur-base) var(--ease-out),
              border-color var(--dur-fast) var(--ease-standard);
}
.mk-card--interactive:hover { box-shadow: var(--shadow-card-hover); transform: translateY(-2px); }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-card-css')) {
  const el = document.createElement('style');
  el.id = 'mk-card-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

export function Card({
  as,
  padding = 'md',
  elevated = false,
  sunken = false,
  interactive = false,
  className = '',
  children,
  ...rest
}) {
  const Tag = as || 'div';
  const cls = [
    'mk-card',
    padding !== 'none' ? `mk-card--pad-${padding}` : '',
    elevated ? 'mk-card--elevated' : '',
    sunken ? 'mk-card--sunken' : '',
    interactive ? 'mk-card--interactive' : '',
    className,
  ].filter(Boolean).join(' ');
  return <Tag className={cls} {...rest}>{children}</Tag>;
}
