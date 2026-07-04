import React from 'react';
import { Icon } from '../general/Icon';

const TONE = {
  ink:     { fg: 'var(--ink-700)',     bg: 'var(--ink-50)' },
  stone:   { fg: 'var(--stone-700)',   bg: 'var(--stone-100)' },
  brick:   { fg: 'var(--brick-700)',   bg: 'var(--brick-50)' },
  success: { fg: 'var(--success-600)', bg: 'var(--success-50)' },
  sea:     { fg: 'var(--sea-700)',     bg: 'var(--sea-50)' },
  sun:     { fg: 'var(--sun-600)',     bg: 'var(--sun-100)' },
};

const CSS = `
.mk-tl { display: flex; flex-direction: column; font-family: var(--font-sans); }
.mk-tl__row { display: flex; gap: var(--space-3); padding: var(--space-3) 0; position: relative; }
.mk-tl__row:not(:last-child)::before {
  content: ""; position: absolute; left: 16px; top: 36px; bottom: calc(-1 * var(--space-3));
  width: 1.5px; background: var(--border);
}
.mk-tl__ic {
  width: 33px; height: 33px; border-radius: var(--radius-full);
  display: grid; place-items: center; flex: none; z-index: 1;
  background: var(--ink-50); color: var(--ink-700);
}
.mk-tl__body { padding-top: 2px; min-width: 0; }
.mk-tl__text { margin: 0; font-size: var(--text-sm); line-height: var(--lh-normal); color: var(--text-body); }
.mk-tl__text b, .mk-tl__text strong { font-weight: var(--fw-semibold); color: var(--text-strong); }
.mk-tl__meta { margin-top: 3px; font-size: var(--text-2xs); font-weight: var(--fw-medium); color: var(--text-subtle); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-tl-css')) {
  const el = document.createElement('style');
  el.id = 'mk-tl-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * Vertical activity feed. items: [{ icon, tone, text, meta }].
 * Promoted from the CRM kit's Timeline, decoupled from lead types —
 * pass icon/tone per item.
 */
export function Timeline({ items = [], className = '', ...rest }) {
  return (
    <div className={['mk-tl', className].filter(Boolean).join(' ')} {...rest}>
      {items.map((it, i) => {
        const t = TONE[it.tone] || TONE.ink;
        return (
          <div className="mk-tl__row" key={it.id ?? i}>
            <span className="mk-tl__ic" style={{ background: t.bg, color: t.fg }}>
              {typeof it.icon === 'string' ? <Icon name={it.icon || 'circle'} size={16} /> : (it.icon || <Icon name="circle" size={16} />)}
            </span>
            <div className="mk-tl__body">
              <p className="mk-tl__text">{it.text}</p>
              {it.meta && <div className="mk-tl__meta">{it.meta}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
