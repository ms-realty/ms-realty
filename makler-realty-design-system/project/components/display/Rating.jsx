import React from 'react';
import { Icon } from '../general/Icon';

const CSS = `
.mk-rating { display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-sans); }
.mk-rating__stars { display: inline-flex; gap: 2px; color: var(--rating); }
.mk-rating__star { position: relative; display: inline-flex; color: var(--stone-300); }
.mk-rating__star .mk-rating__fill { position: absolute; inset: 0; overflow: hidden; color: var(--rating); }
.mk-rating__val { font-weight: var(--fw-semibold); font-size: var(--text-sm); color: var(--text-strong); }
.mk-rating__count { font-size: var(--text-sm); color: var(--text-muted); }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-rating-css')) {
  const el = document.createElement('style');
  el.id = 'mk-rating-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

function Star({ fill, size }) {
  return (
    <span className="mk-rating__star">
      <Icon name="star" size={size} fill="currentColor" stroke="none" />
      <span className="mk-rating__fill" style={{ width: `${Math.round(fill * 100)}%` }}>
        <Icon name="star" size={size} fill="currentColor" stroke="none" />
      </span>
    </span>
  );
}

export function Rating({
  value = 0,
  max = 5,
  size = 16,
  showValue = false,
  count,
  className = '',
  ...rest
}) {
  const stars = [];
  for (let i = 0; i < max; i++) {
    stars.push(<Star key={i} size={size} fill={Math.max(0, Math.min(1, value - i))} />);
  }
  return (
    <span className={['mk-rating', className].filter(Boolean).join(' ')} {...rest}>
      <span className="mk-rating__stars" aria-label={`${value} out of ${max}`}>{stars}</span>
      {showValue && <span className="mk-rating__val">{value.toFixed(1)}</span>}
      {count != null && <span className="mk-rating__count">({count})</span>}
    </span>
  );
}
