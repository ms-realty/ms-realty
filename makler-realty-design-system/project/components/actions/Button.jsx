import React from 'react';
import { Icon } from '../general/Icon';

const CSS = `
.mk-btn {
  --_ring: var(--shadow-focus);
  display: inline-flex; align-items: center; justify-content: center;
  gap: var(--space-2);
  font-family: var(--font-sans); font-weight: var(--fw-semibold);
  letter-spacing: 0.005em; line-height: 1;
  border-radius: var(--radius-button); border: 1px solid transparent;
  cursor: pointer; text-decoration: none; white-space: nowrap;
  transition: background-color var(--dur-fast) var(--ease-standard),
              border-color var(--dur-fast) var(--ease-standard),
              color var(--dur-fast) var(--ease-standard),
              box-shadow var(--dur-fast) var(--ease-standard),
              transform var(--dur-fast) var(--ease-standard);
  -webkit-user-select: none; user-select: none;
}
.mk-btn:focus-visible { outline: none; box-shadow: var(--_ring); }
.mk-btn:not([data-disabled]):active { transform: translateY(0.5px) scale(0.99); }
.mk-btn[data-disabled] { cursor: not-allowed; opacity: 0.5; box-shadow: none; }
.mk-btn[data-loading] { cursor: progress; }

.mk-btn--sm { height: 34px; padding: 0 var(--space-3); font-size: var(--text-sm); border-radius: var(--radius-sm); }
.mk-btn--md { height: 42px; padding: 0 var(--space-4); font-size: var(--text-base); }
.mk-btn--lg { height: 52px; padding: 0 var(--space-6); font-size: var(--text-lg); border-radius: var(--radius-lg); }
.mk-btn--full { width: 100%; }

.mk-btn--primary { background: var(--brand); color: var(--text-on-brand); }
.mk-btn--primary:not([data-disabled]):hover { background: var(--brand-hover); }
.mk-btn--primary:not([data-disabled]):active { background: var(--brand-active); }

.mk-btn--accent { background: var(--accent); color: var(--text-on-accent); --_ring: var(--shadow-focus-accent); }
.mk-btn--accent:not([data-disabled]):hover { background: var(--accent-hover); }
.mk-btn--accent:not([data-disabled]):active { background: var(--accent-active); }

.mk-btn--secondary { background: var(--surface); color: var(--text-strong); border-color: var(--border-strong); box-shadow: var(--shadow-xs); }
.mk-btn--secondary:not([data-disabled]):hover { background: var(--surface-hover); border-color: var(--stone-400); }

.mk-btn--ghost { background: transparent; color: var(--text-body); }
.mk-btn--ghost:not([data-disabled]):hover { background: var(--surface-hover); }

.mk-btn--subtle { background: var(--brand-subtle); color: var(--brand); }
.mk-btn--subtle:not([data-disabled]):hover { background: var(--ink-100); }

.mk-btn__spin { animation: mk-btn-spin 0.7s linear infinite; }
@keyframes mk-btn-spin { to { transform: rotate(360deg); } }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-btn-css')) {
  const el = document.createElement('style');
  el.id = 'mk-btn-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

const ICON_SIZE = { sm: 16, md: 18, lg: 20 };

function renderIcon(icon, size) {
  if (!icon) return null;
  return typeof icon === 'string' ? <Icon name={icon} size={size} /> : icon;
}

export function Button({
  variant = 'primary',
  size = 'md',
  iconStart,
  iconEnd,
  fullWidth = false,
  loading = false,
  disabled = false,
  as,
  className = '',
  children,
  ...rest
}) {
  const Tag = as || 'button';
  const isDisabled = disabled || loading;
  const cls = [
    'mk-btn',
    `mk-btn--${variant}`,
    `mk-btn--${size}`,
    fullWidth ? 'mk-btn--full' : '',
    className,
  ].filter(Boolean).join(' ');

  const extra = {};
  if (Tag === 'button') extra.disabled = isDisabled;
  else if (isDisabled) extra['aria-disabled'] = true;

  const glyph = ICON_SIZE[size];

  return (
    <Tag
      className={cls}
      data-disabled={isDisabled ? '' : undefined}
      data-loading={loading ? '' : undefined}
      {...extra}
      {...rest}
    >
      {loading && <Icon name="loader-circle" size={glyph} className="mk-btn__spin" />}
      {!loading && renderIcon(iconStart, glyph)}
      {children != null && <span>{children}</span>}
      {!loading && renderIcon(iconEnd, glyph)}
    </Tag>
  );
}
