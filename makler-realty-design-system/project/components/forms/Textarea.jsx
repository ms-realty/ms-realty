import React from 'react';

const CSS = `
.mk-textarea { display: flex; flex-direction: column; gap: var(--space-2); font-family: var(--font-sans); }
.mk-textarea__label { font-size: var(--text-sm); font-weight: var(--fw-medium); color: var(--text-strong); }
.mk-textarea__label .mk-req { color: var(--accent); margin-left: 2px; }
.mk-textarea__el {
  width: 100%; box-sizing: border-box;
  background: var(--surface); border: 1px solid var(--border-strong);
  border-radius: var(--radius-input); color: var(--text-strong);
  font: inherit; font-size: var(--text-base); line-height: var(--lh-normal);
  padding: var(--space-3); resize: vertical; min-height: 96px; outline: none;
  transition: border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);
}
.mk-textarea__el::placeholder { color: var(--text-subtle); }
.mk-textarea__el:focus { border-color: var(--brand); box-shadow: var(--shadow-focus); }
.mk-textarea--error .mk-textarea__el { border-color: var(--danger-500); }
.mk-textarea--error .mk-textarea__el:focus { box-shadow: 0 0 0 3px rgba(178,58,44,0.28); }
.mk-textarea--disabled { opacity: 0.6; }
.mk-textarea--disabled .mk-textarea__el { background: var(--surface-sunken); cursor: not-allowed; resize: none; }
.mk-textarea__msg { font-size: var(--text-xs); color: var(--text-muted); display: flex; justify-content: space-between; gap: var(--space-3); }
.mk-textarea__msg--error { color: var(--danger-600); font-weight: var(--fw-medium); }
.mk-textarea__count { font-family: var(--font-mono); font-size: var(--text-2xs); color: var(--text-subtle); flex: none; }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-textarea-css')) {
  const el = document.createElement('style');
  el.id = 'mk-textarea-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

let _uid = 0;

export function Textarea({
  label,
  hint,
  error,
  rows = 4,
  maxLength,
  showCount = false,
  required = false,
  disabled = false,
  id,
  className = '',
  onChange,
  ...rest
}) {
  const [autoId] = React.useState(() => id || `mk-textarea-${++_uid}`);
  const [count, setCount] = React.useState(
    () => String(rest.value ?? rest.defaultValue ?? '').length
  );
  const cls = [
    'mk-textarea',
    error ? 'mk-textarea--error' : '',
    disabled ? 'mk-textarea--disabled' : '',
    className,
  ].filter(Boolean).join(' ');

  const handleChange = (e) => {
    if (showCount) setCount(e.target.value.length);
    if (onChange) onChange(e);
  };

  return (
    <div className={cls}>
      {label && (
        <label className="mk-textarea__label" htmlFor={autoId}>
          {label}{required && <span className="mk-req">*</span>}
        </label>
      )}
      <textarea
        id={autoId}
        className="mk-textarea__el"
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        required={required}
        aria-invalid={error ? true : undefined}
        onChange={handleChange}
        {...rest}
      />
      {(error || hint || (showCount && maxLength)) && (
        <span className={'mk-textarea__msg' + (error ? ' mk-textarea__msg--error' : '')}>
          <span>{error || hint}</span>
          {showCount && maxLength && <span className="mk-textarea__count">{count}/{maxLength}</span>}
        </span>
      )}
    </div>
  );
}
