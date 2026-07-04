import React from 'react';
import { Icon } from '../general/Icon';

const CSS = `
.mk-input { display: flex; flex-direction: column; gap: var(--space-2); font-family: var(--font-sans); }
.mk-input__label { font-size: var(--text-sm); font-weight: var(--fw-medium); color: var(--text-strong); }
.mk-input__label .mk-req { color: var(--accent); margin-left: 2px; }
.mk-input__field {
  display: flex; align-items: center; gap: var(--space-2);
  background: var(--surface); border: 1px solid var(--border-strong);
  border-radius: var(--radius-input); color: var(--text-body);
  transition: border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);
}
.mk-input__field:focus-within { border-color: var(--brand); box-shadow: var(--shadow-focus); }
.mk-input__field > .mk-icon { color: var(--text-muted); flex: none; }
.mk-input__el { flex: 1; min-width: 0; border: none; background: transparent; outline: none; color: var(--text-strong); font: inherit; }
.mk-input__el::placeholder { color: var(--text-subtle); }

.mk-input--sm .mk-input__field { height: 36px; padding: 0 var(--space-3); }
.mk-input--md .mk-input__field { height: 44px; padding: 0 var(--space-3); }
.mk-input--lg .mk-input__field { height: 52px; padding: 0 var(--space-4); font-size: var(--text-md); }

.mk-input--error .mk-input__field { border-color: var(--danger-500); }
.mk-input--error .mk-input__field:focus-within { box-shadow: 0 0 0 3px rgba(178,58,44,0.28); }

.mk-input--disabled { opacity: 0.6; }
.mk-input--disabled .mk-input__field { background: var(--surface-sunken); cursor: not-allowed; }

.mk-input__msg { font-size: var(--text-xs); color: var(--text-muted); }
.mk-input__msg--error { color: var(--danger-600); font-weight: var(--fw-medium); }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-input-css')) {
  const el = document.createElement('style');
  el.id = 'mk-input-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

let _uid = 0;

export function Input({
  label,
  hint,
  error,
  iconStart,
  iconEnd,
  size = 'md',
  required = false,
  disabled = false,
  id,
  className = '',
  ...rest
}) {
  const [autoId] = React.useState(() => id || `mk-input-${++_uid}`);
  const glyph = size === 'lg' ? 20 : 18;
  const cls = [
    'mk-input',
    `mk-input--${size}`,
    error ? 'mk-input--error' : '',
    disabled ? 'mk-input--disabled' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      {label && (
        <label className="mk-input__label" htmlFor={autoId}>
          {label}{required && <span className="mk-req">*</span>}
        </label>
      )}
      <div className="mk-input__field">
        {iconStart && (typeof iconStart === 'string' ? <Icon name={iconStart} size={glyph} /> : iconStart)}
        <input
          id={autoId}
          className="mk-input__el"
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
        {iconEnd && (typeof iconEnd === 'string' ? <Icon name={iconEnd} size={glyph} /> : iconEnd)}
      </div>
      {(error || hint) && (
        <span className={'mk-input__msg' + (error ? ' mk-input__msg--error' : '')}>
          {error || hint}
        </span>
      )}
    </div>
  );
}
