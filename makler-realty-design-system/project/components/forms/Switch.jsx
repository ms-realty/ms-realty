import React from 'react';

const CSS = `
.mk-switch { display: inline-flex; align-items: center; gap: var(--space-3); font-family: var(--font-sans); font-size: var(--text-base); color: var(--text-body); cursor: pointer; -webkit-user-select: none; user-select: none; }
.mk-switch__native { position: absolute; opacity: 0; width: 0; height: 0; }
.mk-switch__track {
  flex: none; position: relative; width: 42px; height: 24px;
  background: var(--stone-300); border-radius: var(--radius-full);
  transition: background-color var(--dur-base) var(--ease-standard);
}
.mk-switch__thumb {
  position: absolute; top: 2px; left: 2px; width: 20px; height: 20px;
  background: #fff; border-radius: var(--radius-full); box-shadow: var(--shadow-sm);
  transition: transform var(--dur-base) var(--ease-out);
}
.mk-switch__native:checked + .mk-switch__track { background: var(--brand); }
.mk-switch__native:checked + .mk-switch__track .mk-switch__thumb { transform: translateX(18px); }
.mk-switch__native:focus-visible + .mk-switch__track { box-shadow: var(--shadow-focus); }
.mk-switch--sm .mk-switch__track { width: 36px; height: 20px; }
.mk-switch--sm .mk-switch__thumb { width: 16px; height: 16px; }
.mk-switch--sm .mk-switch__native:checked + .mk-switch__track .mk-switch__thumb { transform: translateX(16px); }
.mk-switch--disabled { opacity: 0.5; cursor: not-allowed; }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-switch-css')) {
  const el = document.createElement('style');
  el.id = 'mk-switch-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

export function Switch({ label, size = 'md', disabled = false, className = '', ...rest }) {
  return (
    <label className={['mk-switch', `mk-switch--${size}`, disabled ? 'mk-switch--disabled' : '', className].filter(Boolean).join(' ')}>
      <input type="checkbox" role="switch" className="mk-switch__native" disabled={disabled} {...rest} />
      <span className="mk-switch__track"><span className="mk-switch__thumb"></span></span>
      {label && <span className="mk-switch__label">{label}</span>}
    </label>
  );
}
