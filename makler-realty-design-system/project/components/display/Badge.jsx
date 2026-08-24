import React from 'react';
import { Icon } from '../general/Icon';

const CSS = `
.mk-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: var(--font-sans); font-weight: var(--fw-semibold);
  font-size: var(--text-2xs); line-height: 1; letter-spacing: var(--tracking-caps);
  text-transform: uppercase; white-space: nowrap;
  padding: 5px 9px; border-radius: var(--radius-full);
  border: 1px solid transparent;
}
.mk-badge--md { font-size: var(--text-xs); padding: 6px 11px; }
.mk-badge .mk-icon { margin-inline-start: -1px; }
.mk-badge__dot { width: 6px; height: 6px; border-radius: var(--radius-full); background: currentColor; }

/* Tonal (default) — soft tint + colored text */
.mk-badge--for-sale { background: var(--for-sale-bg); color: var(--for-sale-fg); }
.mk-badge--for-rent { background: var(--for-rent-bg); color: var(--for-rent-fg); }
.mk-badge--new      { background: var(--new-bg);      color: var(--new-fg); }
.mk-badge--reduced  { background: var(--reduced-bg);  color: var(--reduced-fg); }
.mk-badge--featured { background: var(--ink-100);     color: var(--ink-800); }
.mk-badge--sold     { background: var(--stone-200);   color: var(--stone-700); }
.mk-badge--neutral  { background: var(--surface-sunken); color: var(--text-muted); }

/* Solid — filled, for overlaying photography */
.mk-badge--solid { color: #fff; border-color: transparent; }
.mk-badge--solid.mk-badge--for-sale { background: var(--for-sale-fg); }
.mk-badge--solid.mk-badge--for-rent { background: var(--for-rent-fg); }
.mk-badge--solid.mk-badge--new      { background: var(--new-fg); }
.mk-badge--solid.mk-badge--reduced  { background: var(--reduced-fg); }
.mk-badge--solid.mk-badge--featured { background: var(--ink-800); }
.mk-badge--solid.mk-badge--sold     { background: var(--stone-700); }
.mk-badge--solid.mk-badge--neutral  { background: var(--stone-700); }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-badge-css')) {
  const el = document.createElement('style');
  el.id = 'mk-badge-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

export function Badge({
  variant = 'neutral',
  size = 'sm',
  solid = false,
  dot = false,
  icon,
  className = '',
  children,
  ...rest
}) {
  const cls = [
    'mk-badge',
    `mk-badge--${variant}`,
    `mk-badge--${size}`,
    solid ? 'mk-badge--solid' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <span className={cls} {...rest}>
      {dot && <span className="mk-badge__dot" />}
      {icon && <Icon name={icon} size={size === 'md' ? 13 : 12} strokeWidth={2.25} />}
      {children}
    </span>
  );
}
