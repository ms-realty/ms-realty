import React from 'react';

const CSS = `
.mk-skel {
  display: block; position: relative; overflow: hidden;
  background: var(--stone-100); border-radius: var(--radius-sm);
}
.mk-skel::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.65), transparent);
  transform: translateX(-100%);
  animation: mk-skel-sweep 1.6s var(--ease-in-out) infinite;
}
.mk-skel--circle { border-radius: var(--radius-full); }
.mk-skel--photo { border-radius: var(--radius-image); background: var(--stone-200); }
.mk-skel-lines { display: flex; flex-direction: column; gap: var(--space-2); }
@keyframes mk-skel-sweep { to { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce) { .mk-skel::after { animation: none; } }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-skel-css')) {
  const el = document.createElement('style');
  el.id = 'mk-skel-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * Loading placeholder. variant:
 *  - "text"   → one or more text lines (use `lines`; last line is shorter)
 *  - "rect"   → a block (give width/height)
 *  - "circle" → avatar/icon circle (give size via width)
 *  - "photo"  → an image area (image radius, deeper tone)
 */
export function Skeleton({
  variant = 'text',
  width,
  height,
  lines = 1,
  className = '',
  style,
  ...rest
}) {
  if (variant === 'text' && lines > 1) {
    return (
      <span className={['mk-skel-lines', className].filter(Boolean).join(' ')} style={{ width, ...style }} {...rest}>
        {Array.from({ length: lines }).map((_, i) => (
          <span
            key={i}
            className="mk-skel"
            style={{ height: height || '0.75em', width: i === lines - 1 ? '62%' : '100%' }}
          />
        ))}
      </span>
    );
  }
  const cls = ['mk-skel', variant === 'circle' ? 'mk-skel--circle' : '', variant === 'photo' ? 'mk-skel--photo' : '', className]
    .filter(Boolean).join(' ');
  const dims = {
    width: width ?? (variant === 'circle' ? 40 : '100%'),
    height: height ?? (variant === 'circle' ? width || 40 : variant === 'text' ? '0.75em' : 96),
  };
  return <span className={cls} style={{ ...dims, ...style }} {...rest} />;
}
