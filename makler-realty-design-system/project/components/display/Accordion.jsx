import React from 'react';
import { Icon } from '../general/Icon';

const CSS = `
.mk-acc { display: flex; flex-direction: column; font-family: var(--font-sans); }
.mk-acc--card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-card); box-shadow: var(--shadow-card);
  padding: 0 var(--space-5);
}
.mk-acc__item { border-bottom: 1px solid var(--border); }
.mk-acc__item:last-child { border-bottom: 0; }
.mk-acc__head {
  display: flex; align-items: center; gap: var(--space-3); width: 100%;
  padding: var(--space-4) 0; border: 0; background: transparent; cursor: pointer;
  font-family: inherit; font-size: var(--text-base); font-weight: var(--fw-semibold);
  color: var(--text-strong); text-align: left;
  transition: color var(--dur-fast) var(--ease-standard);
}
.mk-acc__head:hover { color: var(--ink-950); }
.mk-acc__head:focus-visible { outline: none; box-shadow: var(--shadow-focus); border-radius: var(--radius-sm); }
.mk-acc__icon { color: var(--text-muted); display: inline-flex; flex: none; }
.mk-acc__chev { margin-left: auto; color: var(--text-muted); display: inline-flex; flex: none; transition: transform var(--dur-base) var(--ease-out); }
.mk-acc__item[data-open] .mk-acc__chev { transform: rotate(180deg); }
.mk-acc__panel { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--dur-base) var(--ease-out); }
.mk-acc__item[data-open] .mk-acc__panel { grid-template-rows: 1fr; }
.mk-acc__inner { overflow: hidden; }
.mk-acc__content {
  padding: 0 0 var(--space-4); max-width: 68ch;
  font-size: var(--text-sm); line-height: var(--lh-relaxed); color: var(--text-body);
}
.mk-acc__content > :first-child { margin-top: 0; }
.mk-acc__content > :last-child { margin-bottom: 0; }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-acc-css')) {
  const el = document.createElement('style');
  el.id = 'mk-acc-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * Expandable rows — FAQs, buying-process steps, listing feature groups.
 * items: [{ id, title, icon?, content }].
 */
export function Accordion({
  items = [],
  multiple = false,
  defaultOpen = [],
  card = false,
  className = '',
  ...rest
}) {
  const [open, setOpen] = React.useState(() => new Set(defaultOpen));
  const toggle = (id) => {
    setOpen((prev) => {
      const next = new Set(multiple ? prev : []);
      if (prev.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  return (
    <div className={['mk-acc', card ? 'mk-acc--card' : '', className].filter(Boolean).join(' ')} {...rest}>
      {items.map((it, i) => {
        const id = it.id ?? i;
        const isOpen = open.has(id);
        return (
          <div className="mk-acc__item" key={id} data-open={isOpen ? '' : undefined}>
            <button type="button" className="mk-acc__head" aria-expanded={isOpen} onClick={() => toggle(id)}>
              {it.icon && (
                <span className="mk-acc__icon">
                  {typeof it.icon === 'string' ? <Icon name={it.icon} size={18} /> : it.icon}
                </span>
              )}
              {it.title}
              <span className="mk-acc__chev"><Icon name="chevron-down" size={17} /></span>
            </button>
            <div className="mk-acc__panel" aria-hidden={!isOpen}>
              <div className="mk-acc__inner">
                <div className="mk-acc__content">{it.content}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
