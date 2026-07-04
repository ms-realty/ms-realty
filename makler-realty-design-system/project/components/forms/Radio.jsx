import React from 'react';

const CSS = `
.mk-radio { display: inline-flex; align-items: flex-start; gap: var(--space-2); font-family: var(--font-sans); font-size: var(--text-base); color: var(--text-body); cursor: pointer; -webkit-user-select: none; user-select: none; }
.mk-radio__native { position: absolute; opacity: 0; width: 0; height: 0; }
.mk-radio__dot {
  flex: none; width: 20px; height: 20px; margin-top: 1px;
  display: grid; place-items: center;
  background: var(--surface); border: 1.5px solid var(--border-strong);
  border-radius: var(--radius-full);
  transition: border-color var(--dur-fast) var(--ease-standard);
}
.mk-radio__dot::after {
  content: ""; width: 10px; height: 10px; border-radius: var(--radius-full);
  background: var(--brand); transform: scale(0);
  transition: transform var(--dur-fast) var(--ease-out);
}
.mk-radio:hover .mk-radio__dot { border-color: var(--stone-400); }
.mk-radio__native:checked + .mk-radio__dot { border-color: var(--brand); }
.mk-radio__native:checked + .mk-radio__dot::after { transform: scale(1); }
.mk-radio__native:focus-visible + .mk-radio__dot { box-shadow: var(--shadow-focus); }
.mk-radio__label { line-height: 1.35; padding-top: 1px; }
.mk-radio--disabled { opacity: 0.5; cursor: not-allowed; }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-radio-css')) {
  const el = document.createElement('style');
  el.id = 'mk-radio-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

export function Radio({ label, disabled = false, className = '', ...rest }) {
  return (
    <label className={['mk-radio', disabled ? 'mk-radio--disabled' : '', className].filter(Boolean).join(' ')}>
      <input type="radio" className="mk-radio__native" disabled={disabled} {...rest} />
      <span className="mk-radio__dot"></span>
      {label && <span className="mk-radio__label">{label}</span>}
    </label>
  );
}
