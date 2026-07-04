import React from 'react';
import { Icon } from '../general/Icon';

const CSS = `
.mk-tag {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-sans); font-weight: var(--fw-medium);
  font-size: var(--text-sm); line-height: 1; white-space: nowrap;
  padding: 7px 12px; border-radius: var(--radius-full);
  border: 1px solid transparent; color: var(--text-body);
}
.mk-tag--sm { font-size: var(--text-xs); padding: 5px 10px; gap: 5px; }
.mk-tag .mk-icon { color: var(--text-muted); flex: none; }

.mk-tag--neutral { background: var(--surface-sunken); }
.mk-tag--outline { background: var(--surface); border-color: var(--border); }
.mk-tag--brand   { background: var(--brand-subtle); color: var(--brand); }
.mk-tag--brand .mk-icon { color: var(--brand); }

.mk-tag--interactive { cursor: pointer; transition: background-color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard); }
.mk-tag--interactive:hover { background: var(--surface-hover); border-color: var(--border-strong); }

.mk-tag__x {
  display: inline-flex; margin: -2px -4px -2px 0; padding: 2px; border: none;
  background: transparent; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-full);
}
.mk-tag__x:hover { color: var(--text-strong); background: rgba(0,0,0,0.05); }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-tag-css')) {
  const el = document.createElement('style');
  el.id = 'mk-tag-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

export function Tag({
  variant = 'neutral',
  size = 'md',
  icon,
  onRemove,
  onClick,
  className = '',
  children,
  ...rest
}) {
  const interactive = !!onClick;
  const cls = [
    'mk-tag',
    `mk-tag--${variant}`,
    `mk-tag--${size}`,
    interactive ? 'mk-tag--interactive' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <span className={cls} onClick={onClick} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 13 : 15} />}
      {children}
      {onRemove && (
        <button type="button" className="mk-tag__x" aria-label="Remove"
          onClick={(e) => { e.stopPropagation(); onRemove(e); }}>
          <Icon name="x" size={13} strokeWidth={2.25} />
        </button>
      )}
    </span>
  );
}
