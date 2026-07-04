import React from 'react';
import { IconButton } from '../actions/IconButton';

const CSS = `
.mk-pager { display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-sans); }
.mk-pager__page {
  min-width: 40px; height: 40px; padding: 0 8px;
  border: 1px solid transparent; background: transparent;
  border-radius: var(--radius-md); color: var(--text-body);
  font: inherit; font-weight: var(--fw-medium); font-size: var(--text-sm);
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  transition: background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard);
}
.mk-pager__page:hover { background: var(--surface-hover); color: var(--text-strong); }
.mk-pager__page[aria-current="page"] { background: var(--brand); color: var(--text-on-brand); }
.mk-pager__ellipsis { min-width: 28px; text-align: center; color: var(--text-subtle); user-select: none; }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-pager-css')) {
  const el = document.createElement('style');
  el.id = 'mk-pager-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }

function pages(page, total, siblings = 1) {
  const total_shown = siblings * 2 + 5;
  if (total <= total_shown) return range(1, total);
  const left = Math.max(page - siblings, 1);
  const right = Math.min(page + siblings, total);
  const showLeftDots = left > 2;
  const showRightDots = right < total - 1;
  if (!showLeftDots && showRightDots) return [...range(1, siblings * 2 + 3), '…', total];
  if (showLeftDots && !showRightDots) return [1, '…', ...range(total - (siblings * 2 + 2), total)];
  return [1, '…', ...range(left, right), '…', total];
}

export function Pagination({ page = 1, totalPages = 1, siblings = 1, onChange, className = '', ...rest }) {
  const go = (p) => { if (p >= 1 && p <= totalPages && p !== page && onChange) onChange(p); };
  const items = pages(page, totalPages, siblings);
  return (
    <nav className={['mk-pager', className].filter(Boolean).join(' ')} aria-label="Pagination" {...rest}>
      <IconButton icon="chevron-left" label="Previous page" variant="ghost"
        disabled={page <= 1} onClick={() => go(page - 1)} />
      {items.map((p, i) =>
        p === '…'
          ? <span key={`e${i}`} className="mk-pager__ellipsis">…</span>
          : <button key={p} type="button" className="mk-pager__page"
              aria-current={p === page ? 'page' : undefined} onClick={() => go(p)}>{p}</button>
      )}
      <IconButton icon="chevron-right" label="Next page" variant="ghost"
        disabled={page >= totalPages} onClick={() => go(page + 1)} />
    </nav>
  );
}
