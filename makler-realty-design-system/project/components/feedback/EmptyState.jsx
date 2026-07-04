import React from 'react';
import { Icon } from '../general/Icon';

const CSS = `
.mk-empty {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  padding: var(--space-10) var(--space-6);
  font-family: var(--font-sans);
}
.mk-empty--sm { padding: var(--space-6) var(--space-4); }
.mk-empty__icon {
  display: grid; place-items: center;
  width: 56px; height: 56px; border-radius: var(--radius-full);
  background: var(--surface-sunken); color: var(--stone-500);
  margin-bottom: var(--space-4);
}
.mk-empty--sm .mk-empty__icon { width: 44px; height: 44px; margin-bottom: var(--space-3); }
.mk-empty__title {
  margin: 0; font-family: var(--font-display); font-weight: var(--fw-semibold);
  font-size: var(--text-lg); letter-spacing: var(--tracking-tight); color: var(--text-strong);
}
.mk-empty__text {
  margin: var(--space-2) 0 0; max-width: 44ch;
  font-size: var(--text-sm); line-height: var(--lh-normal); color: var(--text-muted);
}
.mk-empty__actions { display: flex; gap: var(--space-3); margin-top: var(--space-5); flex-wrap: wrap; justify-content: center; }
.mk-empty--sm .mk-empty__actions { margin-top: var(--space-4); }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-empty-css')) {
  const el = document.createElement('style');
  el.id = 'mk-empty-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

export function EmptyState({
  icon = 'search-x',
  title,
  size = 'md',
  actions,
  className = '',
  children,
  ...rest
}) {
  return (
    <div className={['mk-empty', size === 'sm' ? 'mk-empty--sm' : '', className].filter(Boolean).join(' ')} {...rest}>
      {icon && (
        <span className="mk-empty__icon">
          {typeof icon === 'string' ? <Icon name={icon} size={size === 'sm' ? 20 : 24} /> : icon}
        </span>
      )}
      {title && <h3 className="mk-empty__title">{title}</h3>}
      {children != null && <p className="mk-empty__text">{children}</p>}
      {actions && <div className="mk-empty__actions">{actions}</div>}
    </div>
  );
}
