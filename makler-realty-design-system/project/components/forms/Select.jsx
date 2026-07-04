import React from 'react';
import { Icon } from '../general/Icon';

const CSS = `
.mk-select { display: flex; flex-direction: column; gap: var(--space-2); font-family: var(--font-sans); }
.mk-select__label { font-size: var(--text-sm); font-weight: var(--fw-medium); color: var(--text-strong); }
.mk-select__field {
  position: relative; display: flex; align-items: center;
  background: var(--surface); border: 1px solid var(--border-strong);
  border-radius: var(--radius-input);
  transition: border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);
}
.mk-select__field:focus-within { border-color: var(--brand); box-shadow: var(--shadow-focus); }
.mk-select__lead { color: var(--text-muted); display: flex; align-items: center; padding-left: var(--space-3); }
.mk-select__el {
  appearance: none; -webkit-appearance: none; -moz-appearance: none;
  flex: 1; min-width: 0; border: none; background: transparent; outline: none;
  color: var(--text-strong); font: inherit; cursor: pointer;
  padding: 0 var(--space-8) 0 var(--space-3);
}
.mk-select__lead + .mk-select__el { padding-left: var(--space-2); }
.mk-select__chev { position: absolute; right: var(--space-3); color: var(--text-muted); pointer-events: none; }

.mk-select--sm .mk-select__el { height: 36px; }
.mk-select--md .mk-select__el { height: 44px; }
.mk-select--lg .mk-select__el { height: 52px; font-size: var(--text-md); }

.mk-select--placeholder .mk-select__el { color: var(--text-subtle); }
.mk-select--disabled { opacity: 0.6; }
.mk-select--disabled .mk-select__field { background: var(--surface-sunken); }
.mk-select--disabled .mk-select__el { cursor: not-allowed; }
.mk-select__msg { font-size: var(--text-xs); color: var(--text-muted); }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-select-css')) {
  const el = document.createElement('style');
  el.id = 'mk-select-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

let _uid = 0;

export function Select({
  label,
  hint,
  placeholder,
  iconStart,
  options,
  size = 'md',
  disabled = false,
  value,
  defaultValue,
  id,
  className = '',
  children,
  ...rest
}) {
  const [autoId] = React.useState(() => id || `mk-select-${++_uid}`);
  const isControlled = value !== undefined;
  const isEmpty = isControlled ? value === '' || value == null
                                : (defaultValue === undefined && placeholder);
  const cls = [
    'mk-select',
    `mk-select--${size}`,
    isEmpty ? 'mk-select--placeholder' : '',
    disabled ? 'mk-select--disabled' : '',
    className,
  ].filter(Boolean).join(' ');
  const glyph = size === 'lg' ? 20 : 18;

  return (
    <div className={cls}>
      {label && <label className="mk-select__label" htmlFor={autoId}>{label}</label>}
      <div className="mk-select__field">
        {iconStart && (
          <span className="mk-select__lead">
            {typeof iconStart === 'string' ? <Icon name={iconStart} size={glyph} /> : iconStart}
          </span>
        )}
        <select
          id={autoId}
          className="mk-select__el"
          disabled={disabled}
          value={value}
          defaultValue={defaultValue ?? (placeholder ? '' : undefined)}
          {...rest}
        >
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {options
            ? options.map(o =>
                typeof o === 'string'
                  ? <option key={o} value={o}>{o}</option>
                  : <option key={o.value} value={o.value}>{o.label}</option>)
            : children}
        </select>
        <Icon name="chevron-down" size={18} className="mk-select__chev" />
      </div>
      {hint && <span className="mk-select__msg">{hint}</span>}
    </div>
  );
}
