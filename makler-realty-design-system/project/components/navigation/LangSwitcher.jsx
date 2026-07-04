import React from 'react';
import { Icon } from '../general/Icon';

const DEFAULT_LANGS = [
  { code: 'BG', label: 'Български' },
  { code: 'EN', label: 'English' },
  { code: 'DE', label: 'Deutsch' },
  { code: 'NL', label: 'Nederlands' },
  { code: 'RU', label: 'Русский' },
];

const CSS = `
.mk-lang { position: relative; display: inline-block; font-family: var(--font-sans); }
.mk-lang__btn {
  display: inline-flex; align-items: center; gap: var(--space-2);
  height: 36px; padding: 0 var(--space-3);
  border: 1px solid transparent; border-radius: var(--radius-button);
  background: transparent; color: var(--text-body); cursor: pointer;
  font-family: inherit; font-size: var(--text-sm); font-weight: var(--fw-semibold);
  transition: background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard);
}
.mk-lang__btn:hover { background: var(--surface-hover); color: var(--text-strong); }
.mk-lang__btn:focus-visible { outline: none; box-shadow: var(--shadow-focus); }
.mk-lang__btn .mk-lang__chev { transition: transform var(--dur-fast) var(--ease-out); color: var(--text-muted); display: inline-flex; }
.mk-lang[data-open] .mk-lang__chev { transform: rotate(180deg); }

.mk-lang--on-dark .mk-lang__btn { color: rgba(255,255,255,0.85); }
.mk-lang--on-dark .mk-lang__btn:hover { background: rgba(255,255,255,0.09); color: #fff; }

.mk-lang__menu {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 60;
  min-width: 176px; padding: var(--space-1);
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); box-shadow: var(--shadow-popover);
  animation: mk-lang-in var(--dur-fast) var(--ease-out) both;
}
.mk-lang__item {
  display: flex; align-items: center; gap: var(--space-3); width: 100%;
  padding: 8px 10px; border: 0; border-radius: var(--radius-sm);
  background: transparent; cursor: pointer; text-align: left;
  font-family: inherit; font-size: var(--text-sm); font-weight: var(--fw-medium); color: var(--text-body);
  transition: background-color var(--dur-fast) var(--ease-standard);
}
.mk-lang__item:hover { background: var(--surface-hover); }
.mk-lang__item[aria-current="true"] { color: var(--text-strong); font-weight: var(--fw-semibold); }
.mk-lang__code {
  display: inline-grid; place-items: center; min-width: 26px; height: 20px; padding: 0 5px;
  border-radius: var(--radius-xs); background: var(--stone-200); color: var(--stone-700);
  font-size: 10px; font-weight: var(--fw-bold); letter-spacing: 0.05em;
}
.mk-lang__item[aria-current="true"] .mk-lang__code { background: var(--ink-800); color: #fff; }
.mk-lang__check { margin-left: auto; color: var(--ink-700); display: inline-flex; }

@keyframes mk-lang-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .mk-lang__menu { animation: none; } }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-lang-css')) {
  const el = document.createElement('style');
  el.id = 'mk-lang-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * Language switcher for the 5 brand languages (BG EN DE NL RU).
 * Globe + current code trigger, popover menu with native-name labels.
 */
export function LangSwitcher({
  value = 'BG',
  onChange,
  languages = DEFAULT_LANGS,
  onDark = false,
  className = '',
  ...rest
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={['mk-lang', onDark ? 'mk-lang--on-dark' : '', className].filter(Boolean).join(' ')}
      data-open={open ? '' : undefined}
      {...rest}
    >
      <button
        type="button"
        className="mk-lang__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="globe" size={16} />
        {value}
        <span className="mk-lang__chev"><Icon name="chevron-down" size={14} /></span>
      </button>
      {open && (
        <div className="mk-lang__menu" role="listbox" aria-label="Language">
          {languages.map((l) => (
            <button
              key={l.code}
              type="button"
              role="option"
              aria-selected={value === l.code}
              aria-current={value === l.code}
              className="mk-lang__item"
              onClick={() => { setOpen(false); if (onChange) onChange(l.code); }}
            >
              <span className="mk-lang__code">{l.code}</span>
              {l.label}
              {value === l.code && <span className="mk-lang__check"><Icon name="check" size={15} /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
