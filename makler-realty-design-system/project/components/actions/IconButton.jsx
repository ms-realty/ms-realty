import React from 'react';
import { Icon } from '../general/Icon';

const CSS = `
.mk-iconbtn {
  --_ring: var(--shadow-focus);
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--radius-md); border: 1px solid transparent;
  cursor: pointer; padding: 0; color: var(--text-body); background: transparent;
  transition: background-color var(--dur-fast) var(--ease-standard),
              border-color var(--dur-fast) var(--ease-standard),
              color var(--dur-fast) var(--ease-standard),
              box-shadow var(--dur-fast) var(--ease-standard),
              transform var(--dur-fast) var(--ease-standard);
}
.mk-iconbtn:focus-visible { outline: none; box-shadow: var(--_ring); }
.mk-iconbtn:not([data-disabled]):active { transform: scale(0.94); }
.mk-iconbtn[data-disabled] { cursor: not-allowed; opacity: 0.45; }
.mk-iconbtn--round { border-radius: var(--radius-full); }

.mk-iconbtn--sm { width: 34px; height: 34px; }
.mk-iconbtn--md { width: 42px; height: 42px; }
.mk-iconbtn--lg { width: 50px; height: 50px; }

.mk-iconbtn--ghost:not([data-disabled]):hover { background: var(--surface-hover); color: var(--text-strong); }

.mk-iconbtn--solid { background: var(--brand); color: var(--text-on-brand); }
.mk-iconbtn--solid:not([data-disabled]):hover { background: var(--brand-hover); }

.mk-iconbtn--outline { border-color: var(--border-strong); background: var(--surface); box-shadow: var(--shadow-xs); }
.mk-iconbtn--outline:not([data-disabled]):hover { background: var(--surface-hover); border-color: var(--stone-400); color: var(--text-strong); }

/* Glassy overlay button — for use over photography (e.g. save/share on a listing image) */
.mk-iconbtn--glass { background: rgba(255,255,255,0.82); color: var(--stone-800); backdrop-filter: blur(6px); box-shadow: var(--shadow-sm); }
.mk-iconbtn--glass:not([data-disabled]):hover { background: #fff; color: var(--text-strong); }
.mk-iconbtn[data-active="true"].mk-iconbtn--glass { color: var(--accent); }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-iconbtn-css')) {
  const el = document.createElement('style');
  el.id = 'mk-iconbtn-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

const ICON_SIZE = { sm: 18, md: 20, lg: 22 };

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  round = false,
  active = false,
  disabled = false,
  className = '',
  ...rest
}) {
  const cls = [
    'mk-iconbtn',
    `mk-iconbtn--${variant}`,
    `mk-iconbtn--${size}`,
    round ? 'mk-iconbtn--round' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={cls}
      aria-label={label}
      aria-pressed={active || undefined}
      data-active={active ? 'true' : undefined}
      data-disabled={disabled ? '' : undefined}
      disabled={disabled}
      {...rest}
    >
      {typeof icon === 'string' ? <Icon name={icon} size={ICON_SIZE[size]} /> : icon}
    </button>
  );
}
