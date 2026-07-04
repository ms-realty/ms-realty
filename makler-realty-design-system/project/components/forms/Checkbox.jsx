import React from 'react';
import { Icon } from '../general/Icon';

const CSS = `
.mk-check { display: inline-flex; align-items: flex-start; gap: var(--space-2); font-family: var(--font-sans); font-size: var(--text-base); color: var(--text-body); cursor: pointer; -webkit-user-select: none; user-select: none; }
.mk-check__native { position: absolute; opacity: 0; width: 0; height: 0; }
.mk-check__box {
  flex: none; width: 20px; height: 20px; margin-top: 1px;
  display: grid; place-items: center;
  background: var(--surface); border: 1.5px solid var(--border-strong);
  border-radius: var(--radius-xs); color: #fff;
  transition: background-color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard);
}
.mk-check__box .mk-icon { opacity: 0; transform: scale(0.6); transition: opacity var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-out); }
.mk-check:hover .mk-check__box { border-color: var(--stone-400); }
.mk-check__native:checked + .mk-check__box { background: var(--brand); border-color: var(--brand); }
.mk-check__native:checked + .mk-check__box .mk-icon { opacity: 1; transform: scale(1); }
.mk-check__native:indeterminate + .mk-check__box { background: var(--brand); border-color: var(--brand); }
.mk-check__native:focus-visible + .mk-check__box { box-shadow: var(--shadow-focus); }
.mk-check__label { line-height: 1.35; padding-top: 1px; }
.mk-check--disabled { opacity: 0.5; cursor: not-allowed; }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-check-css')) {
  const el = document.createElement('style');
  el.id = 'mk-check-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

export function Checkbox({ label, disabled = false, indeterminate = false, className = '', ...rest }) {
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <label className={['mk-check', disabled ? 'mk-check--disabled' : '', className].filter(Boolean).join(' ')}>
      <input ref={ref} type="checkbox" className="mk-check__native" disabled={disabled} {...rest} />
      <span className="mk-check__box"><Icon name="check" size={14} strokeWidth={3} /></span>
      {label && <span className="mk-check__label">{label}</span>}
    </label>
  );
}
