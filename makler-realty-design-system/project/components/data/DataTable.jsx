import React from 'react';
import { Icon } from '../general/Icon';

const CSS = `
.mk-tbl-wrap { overflow-x: auto; }
.mk-tbl {
  width: 100%; border-collapse: separate; border-spacing: 0;
  font-family: var(--font-sans); font-size: var(--text-sm); line-height: var(--lh-snug);
}
.mk-tbl th {
  text-align: left; padding: var(--space-3) var(--space-4);
  font-size: var(--text-2xs); font-weight: var(--fw-semibold);
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted);
  background: var(--stone-50); border-bottom: 1px solid var(--border);
  white-space: nowrap; user-select: none; -webkit-user-select: none;
}
.mk-tbl th[data-sortable] { cursor: pointer; }
.mk-tbl th[data-sortable]:hover { color: var(--text-strong); }
.mk-tbl th .mk-tbl__thin { display: inline-flex; align-items: center; gap: 4px; }
.mk-tbl td { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border); color: var(--text-body); vertical-align: middle; }
.mk-tbl--dense th { padding: var(--space-2) var(--space-3); }
.mk-tbl--dense td { padding: var(--space-2) var(--space-3); }
.mk-tbl tbody tr:last-child td { border-bottom: 0; }
.mk-tbl tbody tr[data-clickable] { cursor: pointer; transition: background-color var(--dur-fast) var(--ease-standard); }
.mk-tbl tbody tr[data-clickable]:hover { background: var(--surface-hover); }

/* cell helpers */
.mk-tbl__primary { font-weight: var(--fw-semibold); color: var(--text-strong); }
.mk-tbl__muted { color: var(--text-muted); }
.mk-tbl__mono { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted); }
.mk-tbl__price { font-family: var(--font-display); font-weight: var(--fw-semibold); font-size: var(--text-base); color: var(--price); }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-tbl-css')) {
  const el = document.createElement('style');
  el.id = 'mk-tbl-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * Sortable data table. columns: [{ key, label, align, width, render(row),
 * sort(row), sortable }]. Promoted from the CRM kit's DataTable.
 */
export function DataTable({
  columns = [],
  rows = [],
  onRowClick,
  dense = false,
  initialSort,
  empty,
  className = '',
  ...rest
}) {
  const [sort, setSort] = React.useState(initialSort || { key: null, dir: 1 });
  const sorted = React.useMemo(() => {
    if (!sort.key) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = col.sort || ((r) => r[sort.key]);
    return [...rows].sort((a, b) => {
      const va = get(a), vb = get(b);
      if (va < vb) return -1 * sort.dir;
      if (va > vb) return 1 * sort.dir;
      return 0;
    });
  }, [rows, sort, columns]);
  const toggle = (c) => {
    if (c.sortable === false) return;
    setSort((s) => (s.key === c.key ? { key: c.key, dir: -s.dir } : { key: c.key, dir: 1 }));
  };
  return (
    <div className={['mk-tbl-wrap', className].filter(Boolean).join(' ')} {...rest}>
      <table className={'mk-tbl' + (dense ? ' mk-tbl--dense' : '')}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ textAlign: c.align, width: c.width }}
                data-sortable={c.sortable === false ? undefined : ''}
                aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                onClick={() => toggle(c)}
              >
                <span className="mk-tbl__thin">
                  {c.label}
                  {sort.key === c.key && <Icon name={sort.dir === 1 ? 'chevron-up' : 'chevron-down'} size={13} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && empty != null ? (
            <tr><td colSpan={columns.length}>{empty}</td></tr>
          ) : sorted.map((r, i) => (
            <tr
              key={r.id ?? i}
              data-clickable={onRowClick ? '' : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align }}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
