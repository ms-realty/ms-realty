import React from 'react';
import { Icon } from '../general/Icon';

const CSS = `
.mk-alert {
  display: flex; gap: var(--space-3); align-items: flex-start;
  padding: var(--space-3) var(--space-4);
  border: 1px solid; border-radius: var(--radius-md);
  font-family: var(--font-sans); font-size: var(--text-sm); line-height: var(--lh-normal);
}
.mk-alert__icon { flex: none; display: inline-flex; margin-top: 1px; }
.mk-alert__body { flex: 1; min-width: 0; }
.mk-alert__title { font-weight: var(--fw-semibold); color: var(--text-strong); }
.mk-alert__title + .mk-alert__text { margin-top: 2px; }
.mk-alert__text { color: var(--text-body); }
.mk-alert__actions { display: flex; gap: var(--space-3); margin-top: var(--space-2); }
.mk-alert__actions a, .mk-alert__actions button.mk-alert__link {
  font: inherit; font-weight: var(--fw-semibold); color: inherit;
  background: none; border: 0; padding: 0; cursor: pointer;
  text-decoration: underline; text-underline-offset: 2px;
}
.mk-alert__close {
  flex: none; display: grid; place-items: center; width: 26px; height: 26px;
  margin: -3px -6px -3px 0; border: 0; border-radius: var(--radius-sm);
  background: transparent; color: var(--text-muted); cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-standard);
}
.mk-alert__close:hover { background: rgba(22, 19, 14, 0.07); color: var(--text-strong); }
.mk-alert__close:focus-visible { outline: none; box-shadow: var(--shadow-focus); }

.mk-alert--info    { background: var(--ink-50);     border-color: var(--ink-200);     }
.mk-alert--info    .mk-alert__icon { color: var(--ink-600); }
.mk-alert--success { background: var(--success-50); border-color: rgba(47,125,87,.28); }
.mk-alert--success .mk-alert__icon { color: var(--success-600); }
.mk-alert--warning { background: var(--warning-50); border-color: rgba(192,132,34,.32); }
.mk-alert--warning .mk-alert__icon { color: var(--warning-600); }
.mk-alert--danger  { background: var(--danger-50);  border-color: rgba(196,46,68,.28); }
.mk-alert--danger  .mk-alert__icon { color: var(--danger-600); }
.mk-alert--danger  .mk-alert__title { color: var(--danger-600); }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-alert-css')) {
  const el = document.createElement('style');
  el.id = 'mk-alert-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

const DEFAULT_ICON = {
  info: 'info',
  success: 'circle-check',
  warning: 'triangle-alert',
  danger: 'circle-alert',
};

export function Alert({
  variant = 'info',
  title,
  icon,
  onDismiss,
  actions,
  className = '',
  children,
  ...rest
}) {
  const glyph = icon === false ? null : (icon || DEFAULT_ICON[variant] || 'info');
  return (
    <div
      className={['mk-alert', `mk-alert--${variant}`, className].filter(Boolean).join(' ')}
      role={variant === 'danger' || variant === 'warning' ? 'alert' : 'status'}
      {...rest}
    >
      {glyph && (
        <span className="mk-alert__icon">
          {typeof glyph === 'string' ? <Icon name={glyph} size={18} /> : glyph}
        </span>
      )}
      <div className="mk-alert__body">
        {title && <div className="mk-alert__title">{title}</div>}
        {children != null && <div className="mk-alert__text">{children}</div>}
        {actions && <div className="mk-alert__actions">{actions}</div>}
      </div>
      {onDismiss && (
        <button type="button" className="mk-alert__close" aria-label="Dismiss" onClick={onDismiss}>
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  );
}
